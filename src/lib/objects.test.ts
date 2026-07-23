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
    articleNumber: 73656,
    deviceType: "GardenPump",
    isConnected: true,
    controlAddress: 0x21,
    dmx: { fcStatus: "SfcOff", fcMode: 0, dimmerValue: 178, deviceOn: true },
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
