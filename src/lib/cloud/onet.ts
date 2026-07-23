/*
 * ONet packet builder — the OASE local binary protocol, tunnelled through the cloud
 * via `POST /Gateway/{id}/SendONetPacket` with a base64 `Data` field.
 *
 * Frame layout (verified byte-for-byte against captured app commands):
 *   [0..3]   delimiter 5C 23 4F 41 ("\#OA")
 *   [4..7]   payload length (UInt32 LE)
 *   [8]      protocol version (= 2)
 *   [9]      transaction number (0..255, rolling)
 *   [10..11] packet type (UInt16 LE)
 *   [12..15] reserved (0)
 *   [16..]   payload
 *
 * GardenPump commands (packet type / payload):
 *   - set dimmer/speed: 0x6400, payload = [controlAddress, value 0..255]
 *   - set on/off:       0x5200, payload = [deviceIndex UInt32 LE, flag(0=off,1=on)]
 */

export const DELIMITER = [0x5c, 0x23, 0x4f, 0x41] as const;
export const PROTOCOL_VERSION = 2;

/** Packet type for setting a pump's dimmer value (speed). */
export const PACKET_SET_DIMMER = 0x6400;
/** Packet type for switching a pump on/off. */
export const PACKET_SET_ON = 0x5200;
/** Packet type the app sends as a status poll (its reply likely carries fresh live data). */
export const PACKET_POLL = 0x5100;
/** Packet type the app sends as a richer status/telemetry request. */
export const PACKET_STATUS = 0x5500;

/** Maximum raw dimmer value. */
export const DIMMER_MAX = 255;

/** Fixed ONet header size in bytes. */
export const HEADER_SIZE = 16;

/**
 * Build a framed ONet packet as a raw buffer (delimiter + 16-byte header + payload).
 * This is the wire form used directly on the local TLS stream; the cloud path base64-encodes it.
 *
 * @param packetType - 16-bit packet type
 * @param payload - packet payload bytes
 * @param txn - transaction number (0..255, rolling)
 */
export function buildFrame(packetType: number, payload: readonly number[], txn: number): Buffer {
    const buf = Buffer.alloc(HEADER_SIZE + payload.length);
    buf[0] = DELIMITER[0];
    buf[1] = DELIMITER[1];
    buf[2] = DELIMITER[2];
    buf[3] = DELIMITER[3];
    buf.writeUInt32LE(payload.length, 4);
    buf[8] = PROTOCOL_VERSION;
    buf[9] = txn & 0xff;
    buf.writeUInt16LE(packetType & 0xffff, 10);
    // bytes 12..15 stay 0 (reserved)
    for (let i = 0; i < payload.length; i++) {
        buf[HEADER_SIZE + i] = payload[i] & 0xff;
    }
    return buf;
}

/**
 * Build a framed ONet packet and return it base64-encoded (ready for the `Data` field).
 *
 * @param packetType - 16-bit packet type
 * @param payload - packet payload bytes
 * @param txn - transaction number (0..255, rolling)
 */
export function buildPacket(packetType: number, payload: readonly number[], txn: number): string {
    return buildFrame(packetType, payload, txn).toString("base64");
}

/** A parsed ONet frame header. */
export interface OnetHeader {
    /** Protocol version (byte 8, normally 2). */
    version: number;
    /** Transaction number (byte 9), echoed by the device in replies. */
    txn: number;
    /** Packet type (bytes 10..11, UInt16 LE). Replies are the request type | 0xFF. */
    packetType: number;
    /** Declared payload length (bytes 4..7, UInt32 LE). */
    payloadLength: number;
}

/**
 * Parse the 16-byte ONet header from the start of a buffer. Returns undefined if the buffer is
 * too short or does not begin with the delimiter.
 *
 * @param buf - a buffer whose first bytes are an ONet frame
 */
export function parseFrameHeader(buf: Buffer): OnetHeader | undefined {
    if (buf.length < HEADER_SIZE) {
        return undefined;
    }
    if (buf[0] !== DELIMITER[0] || buf[1] !== DELIMITER[1] || buf[2] !== DELIMITER[2] || buf[3] !== DELIMITER[3]) {
        return undefined;
    }
    return {
        payloadLength: buf.readUInt32LE(4),
        version: buf[8],
        txn: buf[9],
        packetType: buf.readUInt16LE(10),
    };
}

/**
 * Build a "set dimmer/speed" command for a pump.
 *
 * @param controlAddress - the pump's control address (RDM address, e.g. 0x21)
 * @param value - raw dimmer value 0..255 (clamped)
 * @param txn - transaction number
 */
export function buildSetDimmer(controlAddress: number, value: number, txn: number): string {
    const clamped = Math.max(0, Math.min(DIMMER_MAX, Math.round(value)));
    return buildPacket(PACKET_SET_DIMMER, [controlAddress & 0xff, clamped], txn);
}

/**
 * Build a "switch on/off" command for a pump.
 *
 * @param deviceIndex - the pump's device index (0-based, order of the inventory device list)
 * @param on - true to switch on, false to switch off
 * @param txn - transaction number
 */
export function buildSetOn(deviceIndex: number, on: boolean, txn: number): string {
    const idx = deviceIndex >>> 0;
    const payload = [idx & 0xff, (idx >>> 8) & 0xff, (idx >>> 16) & 0xff, (idx >>> 24) & 0xff, on ? 1 : 0];
    return buildPacket(PACKET_SET_ON, payload, txn);
}

/**
 * Build a status poll packet (as the app sends it); its reply likely carries fresh live data.
 *
 * @param txn - transaction number
 */
export function buildPoll(txn: number): string {
    return buildPacket(PACKET_POLL, [0, 0, 0, 0], txn);
}

/**
 * Build a live sensor read request (0x5500). The captured app request has the form
 * `[deviceIndex u32 LE] 01 02 02 01 [sensorNumber]`; the reply carries the live sensor value
 * as a 16-bit big-endian integer at payload offset 10..11.
 *
 * @param deviceIndex - the pump's device index (0-based)
 * @param sensorNumber - the RDM sensor number to read (e.g. 1 = rpm, 10 = power)
 * @param txn - transaction number
 */
export function buildSensorRead(deviceIndex: number, sensorNumber: number, txn: number): string {
    const idx = deviceIndex >>> 0;
    const payload = [
        idx & 0xff,
        (idx >>> 8) & 0xff,
        (idx >>> 16) & 0xff,
        (idx >>> 24) & 0xff,
        1,
        2,
        2,
        1,
        sensorNumber & 0xff,
    ];
    return buildPacket(PACKET_STATUS, payload, txn);
}

/** A decoded live sensor read reply (0x55FF). */
export interface SensorReadReply {
    /** The device index the value belongs to. */
    deviceIndex: number;
    /** The RDM sensor number. */
    sensorNumber: number;
    /** The live sensor value (16-bit signed). */
    value: number;
}

/**
 * Decode a live sensor read reply (0x55FF). The reply payload is
 * `[deviceIndex u32 LE] 01 02 02 01 09 [sensorNumber] [value int16 BE] …`.
 *
 * @param dataB64 - base64 of the reply ONet packet (the `data` field of the SendONetPacket response)
 */
export function parseSensorReadReply(dataB64: string): SensorReadReply | undefined {
    try {
        const payload = Buffer.from(dataB64, "base64").subarray(16);
        if (payload.length < 12) {
            return undefined;
        }
        return {
            deviceIndex: payload.readUInt32LE(0),
            sensorNumber: payload[9],
            value: payload.readInt16BE(10),
        };
    } catch {
        return undefined;
    }
}
