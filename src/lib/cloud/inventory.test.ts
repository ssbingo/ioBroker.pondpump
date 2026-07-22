import { expect } from "chai";
import { dimmerToPercent, parseInventory } from "./inventory";

/**
 * Sanitized inventory fixture mirroring the structure of `GET /User/Inventory`
 * (identifiers are fake, the dmxPumpState numbers are from the real capture:
 * 178 -> 70 %, 140 -> 55 %). A non-pump device is included to verify filtering.
 */
const SAMPLE = {
    gateway: {
        id: "00000000-0000-0000-0000-000000000000",
        serialNumber: "000000000000",
        articleNumber: 55317,
        gatewayType: "GatewayCloud",
        lname: "EGC Controller Cloud",
        firmwareAttr_Id102: "51.5",
        pondName_Id103: "Test Pond",
    },
    devices: [
        {
            deviceNumber: 1000001,
            articleNumber: 73656,
            deviceType: "GardenPump",
            isConnected: true,
            dmxPumpState: { fcStatus: "SfcOff", fcMode: 0, dimmerValue: 178, deviceOn: true, timestamp: "t" },
            rdmData: [{ parameterId: 513, sensorId: 1, valueB64: "AQnOAAAAAAAA" }],
        },
        {
            deviceNumber: 1000002,
            articleNumber: 73656,
            deviceType: "GardenPump",
            isConnected: true,
            dmxPumpState: { fcStatus: "SfcOff", fcMode: 0, dimmerValue: 140, deviceOn: false },
            rdmData: [],
        },
        {
            deviceNumber: 2000001,
            deviceType: "GardenSocket",
            isConnected: true,
        },
    ],
};

describe("parseInventory", () => {
    it("parses the gateway metadata from flattened fields", () => {
        const inv = parseInventory(SAMPLE);
        expect(inv.gateway.serialNumber).to.equal("000000000000");
        expect(inv.gateway.name).to.equal("EGC Controller Cloud");
        expect(inv.gateway.firmware).to.equal("51.5");
        expect(inv.gateway.pondName).to.equal("Test Pond");
        expect(inv.gateway.gatewayType).to.equal("GatewayCloud");
    });

    it("only returns GardenPump devices", () => {
        const inv = parseInventory(SAMPLE);
        expect(inv.pumps).to.have.length(2);
        expect(inv.pumps.map(p => p.deviceNumber)).to.deep.equal([1000001, 1000002]);
    });

    it("parses dmxPumpState correctly", () => {
        const inv = parseInventory(SAMPLE);
        const first = inv.pumps[0];
        expect(first.dmx.dimmerValue).to.equal(178);
        expect(first.dmx.deviceOn).to.equal(true);
        expect(first.dmx.fcStatus).to.equal("SfcOff");
        expect(first.rdm).to.have.length(1);
        expect(inv.pumps[1].dmx.deviceOn).to.equal(false);
    });

    it("reads gateway firmware/pond from an attributes array", () => {
        const withAttrs = {
            gateway: {
                serialNumber: "111111111111",
                lname: "EGC Controller Cloud",
                attributes: [
                    { Id: 102, Value: "51.25" },
                    { Id: 103, Value: "Koi" },
                ],
            },
            devices: [],
        };
        const inv = parseInventory(withAttrs);
        expect(inv.gateway.firmware).to.equal("51.25");
        expect(inv.gateway.pondName).to.equal("Koi");
    });

    it("tolerates PascalCase keys", () => {
        const pascal = {
            Gateway: { SerialNumber: "222222222222", Name: "GW" },
            Devices: [
                {
                    DeviceNumber: 3000001,
                    DeviceType: "GardenPump",
                    IsConnected: true,
                    DmxPumpState: { FcStatus: "SfcOff", FcMode: 1, DimmerValue: 255, DeviceOn: true },
                },
            ],
        };
        const inv = parseInventory(pascal);
        expect(inv.gateway.serialNumber).to.equal("222222222222");
        expect(inv.pumps[0].dmx.dimmerValue).to.equal(255);
        expect(inv.pumps[0].dmx.fcMode).to.equal(1);
    });

    it("throws when the gateway has no serial number", () => {
        expect(() => parseInventory({ gateway: { lname: "x" }, devices: [] })).to.throw(/serial/i);
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
