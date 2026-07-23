import { expect } from "chai";
import {
    buildPacket,
    buildPoll,
    buildSensorRead,
    buildSetDimmer,
    buildSetOn,
    PACKET_SET_DIMMER,
    PACKET_SET_ON,
} from "./onet";

/**
 * These assert byte-for-byte reproduction of real commands captured from the OASE app
 * (SendONetPacket "Data" field). If the framing ever regresses, these fail immediately.
 */
describe("ONet packet builder (verified against captured app commands)", () => {
    it("reproduces set-dimmer commands (0x6400)", () => {
        // #1: pump control address 0x21, value 178 (70 %), txn 44
        expect(buildSetDimmer(0x21, 178, 44)).to.equal("XCNPQQIAAAACLABkAAAAACGy");
        // #2: pump control address 0x21, value 191 (75 %), txn 65
        expect(buildSetDimmer(0x21, 191, 65)).to.equal("XCNPQQIAAAACQQBkAAAAACG/");
    });

    it("reproduces on/off commands (0x5200)", () => {
        // #3: device index 0, off, txn 70
        expect(buildSetOn(0, false, 70)).to.equal("XCNPQQUAAAACRgBSAAAAAAAAAAAA");
        // #4: device index 0, on, txn 74
        expect(buildSetOn(0, true, 74)).to.equal("XCNPQQUAAAACSgBSAAAAAAAAAAAB");
    });

    it("reproduces the status poll (0x5100)", () => {
        // captured app poll: payload 00 00 00 00, txn 93
        expect(buildPoll(93)).to.equal("XCNPQQQAAAACXQBRAAAAAAAAAAA=");
    });

    it("reproduces the captured 0x5500 sensor read (device 0, sensor 1)", () => {
        // captured app request: payload 00 00 00 00 01 02 02 01 01, txn 99
        expect(buildSensorRead(0, 1, 99)).to.equal("XCNPQQkAAAACYwBVAAAAAAAAAAABAgIBAQ==");
    });

    it("clamps dimmer values to 0..255", () => {
        expect(buildSetDimmer(0x21, 999, 1)).to.equal(buildSetDimmer(0x21, 255, 1));
        expect(buildSetDimmer(0x21, -5, 1)).to.equal(buildSetDimmer(0x21, 0, 1));
    });

    it("uses the given packet types", () => {
        // header byte 10..11 is the packet type (LE); decode it back to be sure
        const dimmer = Buffer.from(buildPacket(PACKET_SET_DIMMER, [0, 0], 0), "base64");
        expect(dimmer.readUInt16LE(10)).to.equal(0x6400);
        const onoff = Buffer.from(buildPacket(PACKET_SET_ON, [0, 0, 0, 0, 0], 0), "base64");
        expect(onoff.readUInt16LE(10)).to.equal(0x5200);
    });
});
