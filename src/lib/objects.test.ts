import { expect } from "chai";
import type { GatewayInfo, PumpInfo } from "./cloud/inventory";
import {
    GATEWAY_ID,
    gatewayObjectDefs,
    gatewayStateValues,
    type ObjectDef,
    pumpObjectDefs,
    pumpStateValues,
} from "./objects";

const GW: GatewayInfo = {
    serialNumber: "000000000000",
    name: "EGC Controller Cloud",
    firmware: "51.5",
    pondName: "Test Pond",
    gatewayType: "GatewayCloud",
};

const PUMP: PumpInfo = {
    deviceNumber: 1000001,
    index: 0,
    name: "Main Pump",
    articleNumber: 73656,
    deviceType: "GardenPump",
    isConnected: true,
    controlAddress: 0x21,
    dmx: { fcStatus: "SfcOff", fcMode: 0, dimmerValue: 178, deviceOn: true },
    sensors: { 1: 2523, 10: 110, 2: 845, 3: 30, 5: 29, 6: 223 },
    rdm: [],
};

function byId(defs: ObjectDef[]): Map<string, ObjectDef["obj"]> {
    return new Map(defs.map(d => [d.id, d.obj]));
}

/** Roles used by this adapter — all must exist in the official ioBroker role list. */
const ALLOWED_ROLES = new Set([
    "text",
    "info.name",
    "indicator.reachable",
    "indicator.connected",
    "switch.power",
    "level.dimmer",
    "level",
    "value",
    "value.power",
    "value.speed",
    "value.temperature",
    "value.voltage",
]);

describe("gatewayObjectDefs", () => {
    const defs = gatewayObjectDefs(GW);
    const map = byId(defs);

    it("creates the gateway as a device", () => {
        expect(map.get(GATEWAY_ID)?.type).to.equal("device");
    });

    it("assigns valid, specific roles (never the generic 'state')", () => {
        for (const def of defs) {
            if (def.obj.type === "state") {
                const role = def.obj.common.role;
                expect(role, `role of ${def.id}`).to.not.equal("state");
                expect(ALLOWED_ROLES.has(role), `role '${role}' of ${def.id}`).to.equal(true);
            }
        }
    });

    it("makes the online indicator a read-only boolean with role indicator.reachable", () => {
        const online = map.get(`${GATEWAY_ID}.online`)?.common as ioBroker.StateCommon;
        expect(online.role).to.equal("indicator.reachable");
        expect(online.type).to.equal("boolean");
        expect(online.write).to.equal(false);
    });
});

describe("pumpObjectDefs", () => {
    const defs = pumpObjectDefs(PUMP);
    const map = byId(defs);
    const base = "pumps.1000001";

    it("nests channels under a pump device", () => {
        expect(map.get(base)?.type).to.equal("device");
        expect(map.get(`${base}.control`)?.type).to.equal("channel");
        expect(map.get(`${base}.status`)?.type).to.equal("channel");
    });

    it("names the pump device after its controller name", () => {
        const common = map.get(base)?.common as ioBroker.DeviceCommon;
        expect(common.name).to.equal("Main Pump (1000001)");
    });

    it("uses switch.power / level.dimmer / indicator.connected roles", () => {
        expect((map.get(`${base}.control.on`)?.common as ioBroker.StateCommon).role).to.equal("switch.power");
        const speed = map.get(`${base}.control.speed`)?.common as ioBroker.StateCommon;
        expect(speed.role).to.equal("level.dimmer");
        expect(speed.unit).to.equal("%");
        expect(speed.min).to.equal(0);
        expect(speed.max).to.equal(100);
        expect((map.get(`${base}.status.connected`)?.common as ioBroker.StateCommon).role).to.equal(
            "indicator.connected",
        );
    });

    it("exposes telemetry power (W) and speed (rpm) with correct roles/units", () => {
        const power = map.get(`${base}.telemetry.power`)?.common as ioBroker.StateCommon;
        expect(power.role).to.equal("value.power");
        expect(power.unit).to.equal("W");
        const speed = map.get(`${base}.telemetry.speed`)?.common as ioBroker.StateCommon;
        expect(speed.role).to.equal("value.speed");
        expect(speed.unit).to.equal("rpm");
    });

    it("maps sensors to named telemetry (power, speed, temperature, voltage)", () => {
        const power = map.get(`${base}.telemetry.temperature`)?.common as ioBroker.StateCommon;
        expect(power.role).to.equal("value.temperature");
        expect(power.unit).to.equal("°C");
        const voltage = map.get(`${base}.telemetry.voltage`)?.common as ioBroker.StateCommon;
        expect(voltage.role).to.equal("value.voltage");
        expect(voltage.unit).to.equal("V");

        const values = new Map(pumpStateValues(PUMP).map(v => [v.id, v.val]));
        expect(values.get(`${base}.telemetry.power`)).to.equal(110); // sensor 10
        expect(values.get(`${base}.telemetry.speed`)).to.equal(2523); // sensor 1
        expect(values.get(`${base}.telemetry.temperature`)).to.equal(30); // sensor 3
        expect(values.get(`${base}.telemetry.temperature2`)).to.equal(29); // sensor 5
        expect(values.get(`${base}.telemetry.voltage`)).to.equal(223); // sensor 6
    });

    it("exposes only unmapped sensors as raw (not the mapped 1/10/3/5/6)", () => {
        expect(map.get(`${base}.telemetry.raw.sensor2`)?.type).to.equal("state");
        for (const mapped of [1, 3, 5, 6, 10]) {
            expect(map.has(`${base}.telemetry.raw.sensor${mapped}`), `sensor${mapped}`).to.equal(false);
        }
        const values = new Map(pumpStateValues(PUMP).map(v => [v.id, v.val]));
        expect(values.get(`${base}.telemetry.raw.sensor2`)).to.equal(845);
    });

    it("makes control states writable (phase 2 command path)", () => {
        for (const id of [`${base}.control.on`, `${base}.control.speed`, `${base}.control.speedRaw`]) {
            expect((map.get(id)?.common as ioBroker.StateCommon).write, id).to.equal(true);
        }
    });

    it("never uses the generic 'state' role and only allowed roles", () => {
        for (const def of defs) {
            if (def.obj.type === "state") {
                const role = def.obj.common.role;
                expect(role, def.id).to.not.equal("state");
                expect(ALLOWED_ROLES.has(role), `role '${role}' of ${def.id}`).to.equal(true);
            }
        }
    });
});

describe("state value mapping", () => {
    it("maps gateway values incl. reachability", () => {
        const values = new Map(gatewayStateValues(GW, true).map(v => [v.id, v.val]));
        expect(values.get(`${GATEWAY_ID}.serialNumber`)).to.equal("000000000000");
        expect(values.get(`${GATEWAY_ID}.firmware`)).to.equal("51.5");
        expect(values.get(`${GATEWAY_ID}.online`)).to.equal(true);
    });

    it("maps pump speed to both percent and raw", () => {
        const values = new Map(pumpStateValues(PUMP).map(v => [v.id, v.val]));
        expect(values.get("pumps.1000001.control.on")).to.equal(true);
        expect(values.get("pumps.1000001.control.speed")).to.equal(70); // 178/255
        expect(values.get("pumps.1000001.control.speedRaw")).to.equal(178);
        expect(values.get("pumps.1000001.status.fcStatus")).to.equal("SfcOff");
        expect(values.get("pumps.1000001.status.connected")).to.equal(true);
    });
});
