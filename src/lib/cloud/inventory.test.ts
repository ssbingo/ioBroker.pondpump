import { expect } from "chai";
import { dimmerToPercent, parseInventory } from "./inventory";

/**
 * Sanitized fixture in the REAL cloud wire shape (`{ user, gateways: [ { devices } ] }`).
 * Identifiers are fake and no password attribute (id 101) is included; the dmxPumpState
 * numbers are from the real capture (178 -> 70 %, 140 -> 55 %). A non-pump device is
 * included to verify filtering.
 */
const REAL_SAMPLE = {
    user: { givenName: "Test", surname: "User" },
    gateways: [
        {
            serialNumber: "000000000000",
            articleNumber: 55317,
            gatewayType: "GatewayCloud",
            id: "00000000-0000-0000-0000-000000000000",
            isOnline: true,
            onlineState: { isOnline: true },
            customAttributesJson:
                '[{"Id":102,"Value":{"Value":"51.5","Timestamp":"2025-02-23T13:21:13+00:00"}},' +
                '{"Id":103,"Value":{"Value":"Koi Teich","Timestamp":"2025-11-26T09:26:47+00:00"}}]',
            devices: [
                {
                    id: "00000000-0000-0000-0000-000000000000|1000001",
                    deviceNumber: 1000001,
                    articleNumber: 73656,
                    deviceType: "GardenPump",
                    connectionState: { isConnected: true, timestamp: "t" },
                    rdmData: [
                        { key: { parameterId: 513, sensorId: 1 }, value: { value: "AQnOAAAAAAAA", timestamp: "t" } },
                        { key: { parameterId: 32824 }, value: { value: "GQ==", timestamp: "t" } },
                    ],
                    dmxPumpState: {
                        value: { fcStatus: "SfcOff", fcMode: 0, dimmerValue: 178, deviceOn: true },
                        timestamp: "2026-07-15T14:32:02+00:00",
                    },
                    isActive: true,
                },
                {
                    id: "00000000-0000-0000-0000-000000000000|1000002",
                    deviceNumber: 1000002,
                    articleNumber: 73656,
                    deviceType: "GardenPump",
                    connectionState: { isConnected: false, timestamp: "t" },
                    rdmData: [],
                    dmxPumpState: {
                        value: { fcStatus: "SfcOff", fcMode: 0, dimmerValue: 140, deviceOn: false },
                        timestamp: "t",
                    },
                    isActive: true,
                },
                {
                    deviceNumber: 2000001,
                    deviceType: "GardenSocket",
                    connectionState: { isConnected: true },
                },
            ],
        },
    ],
};

describe("parseInventory (real cloud shape)", () => {
    it("reads the gateway from gateways[0] with metadata from customAttributesJson", () => {
        const inv = parseInventory(REAL_SAMPLE);
        expect(inv.gateway.serialNumber).to.equal("000000000000");
        expect(inv.gateway.gatewayType).to.equal("GatewayCloud");
        expect(inv.gateway.firmware).to.equal("51.5"); // attribute id 102
        expect(inv.gateway.pondName).to.equal("Koi Teich"); // attribute id 103
        expect(inv.gateway.name).to.equal("Koi Teich"); // falls back to pond name
        expect(inv.gateway.isOnline).to.equal(true);
    });

    it("collects GardenPump devices nested under the gateway", () => {
        const inv = parseInventory(REAL_SAMPLE);
        expect(inv.pumps.map(p => p.deviceNumber)).to.deep.equal([1000001, 1000002]);
    });

    it("unwraps dmxPumpState.value and connectionState.isConnected", () => {
        const inv = parseInventory(REAL_SAMPLE);
        const first = inv.pumps[0];
        expect(first.dmx.dimmerValue).to.equal(178);
        expect(first.dmx.deviceOn).to.equal(true);
        expect(first.dmx.fcStatus).to.equal("SfcOff");
        expect(first.isConnected).to.equal(true);
        expect(inv.pumps[1].isConnected).to.equal(false);
        expect(inv.pumps[1].dmx.deviceOn).to.equal(false);
    });

    it("parses rdmData with the key/value nesting", () => {
        const inv = parseInventory(REAL_SAMPLE);
        const rdm = inv.pumps[0].rdm;
        expect(rdm).to.have.length(2);
        expect(rdm[0]).to.deep.include({ parameterId: 513, sensorId: 1, valueB64: "AQnOAAAAAAAA" });
        expect(rdm[1]).to.deep.include({ parameterId: 32824, valueB64: "GQ==" });
        expect(rdm[1].sensorId).to.equal(undefined);
    });

    it("does not expose the password attribute (id 101) anywhere", () => {
        const withPassword = structuredClone(REAL_SAMPLE);
        withPassword.gateways[0].customAttributesJson =
            '[{"Id":101,"Value":{"Value":"SECRET-PW","Timestamp":"t"}},' +
            '{"Id":102,"Value":{"Value":"51.5","Timestamp":"t"}}]';
        const inv = parseInventory(withPassword);
        expect(JSON.stringify(inv)).to.not.contain("SECRET-PW");
        expect(inv.gateway.firmware).to.equal("51.5");
    });
});

describe("parseInventory (tolerance)", () => {
    it("still accepts a flat { gateway, devices } shape with an attributes array", () => {
        const flat = {
            gateway: {
                serialNumber: "111111111111",
                lname: "EGC Controller Cloud",
                attributes: [
                    { Id: 102, Value: "51.25" },
                    { Id: 103, Value: "Koi" },
                ],
            },
            devices: [
                {
                    deviceNumber: 3000001,
                    deviceType: "GardenPump",
                    isConnected: true,
                    dmxPumpState: { fcStatus: "SfcOff", fcMode: 1, dimmerValue: 255, deviceOn: true },
                    rdmData: [{ parameterId: 96, valueB64: "AQ==" }],
                },
            ],
        };
        const inv = parseInventory(flat);
        expect(inv.gateway.serialNumber).to.equal("111111111111");
        expect(inv.gateway.name).to.equal("EGC Controller Cloud");
        expect(inv.gateway.firmware).to.equal("51.25");
        expect(inv.pumps[0].dmx.dimmerValue).to.equal(255);
        expect(inv.pumps[0].isConnected).to.equal(true);
        expect(inv.pumps[0].rdm[0]).to.deep.include({ parameterId: 96, valueB64: "AQ==" });
    });

    it("throws when the gateway has no serial number", () => {
        expect(() => parseInventory({ gateways: [{ isOnline: true }] })).to.throw(/serial/i);
    });

    it("throws when the response is not an object", () => {
        expect(() => parseInventory(null)).to.throw();
        expect(() => parseInventory("nope")).to.throw();
    });
});

describe("dimmerToPercent", () => {
    it("maps the raw 0..255 scale to 0..100 %", () => {
        expect(dimmerToPercent(0)).to.equal(0);
        expect(dimmerToPercent(255)).to.equal(100);
        expect(dimmerToPercent(178)).to.equal(70);
        expect(dimmerToPercent(140)).to.equal(55);
    });

    it("clamps out-of-range values", () => {
        expect(dimmerToPercent(-10)).to.equal(0);
        expect(dimmerToPercent(999)).to.equal(100);
    });
});
