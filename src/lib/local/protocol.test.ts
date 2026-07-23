import { expect } from "chai";
import { buildFrame, DELIMITER, HEADER_SIZE, parseFrameHeader } from "../cloud/onet";
import {
    buildAlive,
    buildDeviceTableRequest,
    buildDiscovery,
    buildPasswordCheck,
    buildTcpReq,
    decodeUnicodeEscapes,
    encodePassword,
    FrameReader,
    PACKET_ALIVE,
    PACKET_DEVICE_TABLE,
    PACKET_DISCOVERY,
    PACKET_PASSWORD_CHECK,
    PACKET_TCP_REQ,
    parseDeviceTableEntry,
    parseGatewayDiscovery,
    PASSWORD_BYTES,
} from "./protocol";

/**
 * Build a synthetic 76-byte DeviceTable entry in the confirmed wire layout.
 *
 * @param index - device slot index
 * @param article - article number
 * @param deviceNumber - device number
 * @param controlAddress - control address
 * @param name - device name
 */
function makeEntry(index: number, article: number, deviceNumber: number, controlAddress: number, name: string): Buffer {
    const b = Buffer.alloc(76);
    b.writeUInt32LE(index, 0);
    b.writeUInt32LE(0xc320, 4); // internal dmx id
    b.writeUInt32LE(article, 8);
    b.writeUInt32LE(deviceNumber, 12);
    b.write("AO", 16, "latin1");
    b.writeUInt16LE(controlAddress, 20);
    b.writeUInt16LE(1, 22);
    b.write(name, 24, "latin1");
    return b;
}

describe("encodePassword / get64Bytes", () => {
    it("produces exactly 64 bytes", () => {
        expect(encodePassword("secret").length).to.equal(PASSWORD_BYTES);
        expect(encodePassword("").length).to.equal(PASSWORD_BYTES);
    });

    it("zero-pads a short password", () => {
        const block = encodePassword("abc");
        expect([...block.subarray(0, 3)]).to.deep.equal([0x61, 0x62, 0x63]);
        expect([...block.subarray(3)].every(b => b === 0)).to.equal(true);
    });

    it("truncates a password longer than 64 bytes", () => {
        const long = "x".repeat(70);
        const block = encodePassword(long);
        expect(block.length).to.equal(PASSWORD_BYTES);
        expect([...block].every(b => b === 0x78)).to.equal(true); // all 'x', none dropped to 0
    });

    it("decodes \\uXXXX escape sequences before encoding", () => {
        expect(decodeUnicodeEscapes("\\u0041\\u0042C")).to.equal("ABC");
        const block = encodePassword("\\u0041");
        expect(block[0]).to.equal(0x41); // 'A'
        expect(block[1]).to.equal(0);
    });
});

describe("buildTcpReq (UDP wake)", () => {
    it("frames prefix + TLS port (UInt16 LE at offset 1) + IPv4 as the payload", () => {
        const frame = buildTcpReq("192.168.1.50", 5999, 7);
        const header = parseFrameHeader(frame);
        expect(header?.packetType).to.equal(PACKET_TCP_REQ);
        expect(header?.txn).to.equal(7);
        expect(header?.payloadLength).to.equal(7);
        const payload = frame.subarray(HEADER_SIZE);
        // [0x01 prefix][5999 = 0x176F -> LE 6f 17][IP octets]
        expect([...payload]).to.deep.equal([0x01, 0x6f, 0x17, 192, 168, 1, 50]);
        // the controller reads the port at payload offset 1, little-endian
        expect(payload.readUInt16LE(1)).to.equal(5999);
    });

    it("falls back to 0.0.0.0 for a non-dotted bind address", () => {
        const payload = buildTcpReq("not-an-ip", 5999, 1).subarray(HEADER_SIZE);
        // the IP sits at offset 3..7 (after the prefix byte and the 2-byte port)
        expect([...payload.subarray(3, 7)]).to.deep.equal([0, 0, 0, 0]);
    });
});

describe("buildPasswordCheck / buildAlive / buildDiscovery", () => {
    it("password check carries the 64-byte block under type 0x9F00", () => {
        const frame = buildPasswordCheck("secret", 3);
        const header = parseFrameHeader(frame);
        expect(header?.packetType).to.equal(PACKET_PASSWORD_CHECK);
        expect(header?.payloadLength).to.equal(PASSWORD_BYTES);
        expect(frame.length).to.equal(HEADER_SIZE + PASSWORD_BYTES);
    });

    it("alive/discovery are empty-payload frames with the right types", () => {
        expect(parseFrameHeader(buildAlive(1))?.packetType).to.equal(PACKET_ALIVE);
        expect(parseFrameHeader(buildAlive(1))?.payloadLength).to.equal(0);
        expect(parseFrameHeader(buildDiscovery(1))?.packetType).to.equal(PACKET_DISCOVERY);
    });
});

describe("buildFrame / parseFrameHeader", () => {
    it("round-trips header fields", () => {
        const frame = buildFrame(0x5100, [1, 2, 3], 42);
        const header = parseFrameHeader(frame);
        expect(header).to.deep.equal({ version: 2, txn: 42, packetType: 0x5100, payloadLength: 3 });
        expect([...frame.subarray(0, 4)]).to.deep.equal([...DELIMITER]);
    });

    it("rejects a buffer that is too short or lacks the delimiter", () => {
        expect(parseFrameHeader(Buffer.alloc(8))).to.equal(undefined);
        const bad = buildFrame(0x1000, [], 0);
        bad[0] = 0x00;
        expect(parseFrameHeader(bad)).to.equal(undefined);
    });
});

describe("FrameReader (TCP stream reassembly)", () => {
    const a = buildFrame(0x1000, [0xaa], 1);
    const b = buildFrame(0x5100, [0xbb, 0xcc], 2);

    it("returns a complete frame from a single chunk", () => {
        const frames = new FrameReader().push(a);
        expect(frames.length).to.equal(1);
        expect(frames[0].header.packetType).to.equal(0x1000);
        expect([...frames[0].payload]).to.deep.equal([0xaa]);
    });

    it("splits two back-to-back frames in one chunk", () => {
        const frames = new FrameReader().push(Buffer.concat([a, b]));
        expect(frames.map(f => f.header.packetType)).to.deep.equal([0x1000, 0x5100]);
    });

    it("reassembles a frame split across two chunks", () => {
        const reader = new FrameReader();
        const whole = Buffer.concat([a, b]);
        const first = reader.push(whole.subarray(0, a.length + 5)); // a + part of b's header
        expect(first.map(f => f.header.packetType)).to.deep.equal([0x1000]);
        const second = reader.push(whole.subarray(a.length + 5));
        expect(second.map(f => f.header.packetType)).to.deep.equal([0x5100]);
    });

    it("resyncs past leading garbage to the delimiter", () => {
        const reader = new FrameReader();
        const frames = reader.push(Buffer.concat([Buffer.from([0x00, 0xff, 0x13]), a]));
        expect(frames.length).to.equal(1);
        expect(frames[0].header.packetType).to.equal(0x1000);
    });

    it("waits for the full declared payload before emitting", () => {
        const reader = new FrameReader();
        const truncated = b.subarray(0, HEADER_SIZE + 1); // declares 2 payload bytes, only 1 present
        expect(reader.push(truncated).length).to.equal(0);
        expect(reader.push(b.subarray(HEADER_SIZE + 1)).length).to.equal(1);
    });
});

describe("DeviceTable (0x4000)", () => {
    it("builds a device-table request (index UInt32 LE + 0x0000)", () => {
        const frame = buildDeviceTableRequest(1, 7);
        const header = parseFrameHeader(frame);
        expect(header?.packetType).to.equal(PACKET_DEVICE_TABLE);
        expect(header?.txn).to.equal(7);
        expect([...frame.subarray(HEADER_SIZE)]).to.deep.equal([1, 0, 0, 0, 0, 0]);
    });

    it("parses a device entry (index, article, deviceNumber, control address, name)", () => {
        const entry = parseDeviceTableEntry(makeEntry(1, 73656, 1000002, 0x23, "Test Pump"));
        expect(entry).to.deep.equal({
            index: 1,
            articleNumber: 73656,
            deviceNumber: 1000002,
            controlAddress: 0x23,
            name: "Test Pump",
        });
    });

    it("treats a zero device number as an empty slot", () => {
        expect(parseDeviceTableEntry(makeEntry(2, 0, 0, 0, ""))).to.equal(undefined);
        expect(parseDeviceTableEntry(Buffer.alloc(10))).to.equal(undefined);
    });
});

describe("gateway discovery (0x10FF)", () => {
    function makeDisco(name: string, serial: string, lname: string): Buffer {
        const b = Buffer.alloc(324);
        b[0] = 0x04;
        b.write(name, 2, "latin1");
        b.write(serial, 34, "latin1");
        b.write(lname, 66, "latin1");
        return b;
    }

    it("decodes hwType, name, serial and lname at the documented offsets", () => {
        const gw = parseGatewayDiscovery(makeDisco("Test Pond", "000000000000", "EGC Controller Cloud"));
        expect(gw).to.deep.equal({
            hwType: 4,
            name: "Test Pond",
            serialNumber: "000000000000",
            lname: "EGC Controller Cloud",
        });
    });

    it("returns undefined for a too-short payload", () => {
        expect(parseGatewayDiscovery(Buffer.alloc(50))).to.equal(undefined);
    });
});
