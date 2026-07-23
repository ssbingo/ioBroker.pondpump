/*
 * Local (LAN) OASE protocol specifics on top of the shared ONet framing (`../cloud/onet`).
 *
 * The application-layer packets (set dimmer, on/off, sensor read) are identical to the cloud path.
 * What is local-only is the *transport handshake*:
 *   - a UDP unicast wake packet (TCP_REQ) that asks the controller to connect back, and
 *   - a TLS password check once the controller has connected to our TLS server.
 *
 * References for the wire format come from mr-suw's open-source analysis (knowledge only, no code);
 * the two values still to be confirmed against the real device are marked PROVISIONAL below.
 */

import { buildFrame, DELIMITER, HEADER_SIZE, type OnetHeader, parseFrameHeader } from "../cloud/onet";

/** UDP request asking the controller to open a TCP/TLS connection back to us. */
export const PACKET_TCP_REQ = 0x1400;
/** Keep-alive ping exchanged over the established connection. */
export const PACKET_ALIVE = 0x1100;
/** Device discovery / device-info request (reply carries the `lname` device type). */
export const PACKET_DISCOVERY = 0x1000;
/** Password check sent right after the controller connects; reply is a single 0x01 byte on success. */
export const PACKET_PASSWORD_CHECK = 0x9f00;

/** Default UDP port the controller listens on for the wake packet. */
export const DEFAULT_UDP_PORT = 5959;
/** Default TCP port our TLS server listens on (the controller connects back here). */
export const DEFAULT_TLS_PORT = 5999;

/** Length of the fixed password block sent in a PASSWORD_CHECK packet. */
export const PASSWORD_BYTES = 64;

/**
 * Decode `\uXXXX` escape sequences that may still be present in a raw password string.
 * The device password is stored decoded already, but decoding again is a harmless safety net.
 *
 * @param input - the (possibly escaped) password string
 */
export function decodeUnicodeEscapes(input: string): string {
    return input.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Encode a device password into the fixed 64-byte block the controller expects (`get64Bytes`):
 * decode any `\uXXXX` escapes, UTF-8 encode, then zero-pad (or truncate) to exactly 64 bytes.
 *
 * @param password - the device password (the 64-character value from the cloud inventory attribute)
 */
export function encodePassword(password: string): Buffer {
    const utf8 = Buffer.from(decodeUnicodeEscapes(password), "utf8");
    const block = Buffer.alloc(PASSWORD_BYTES); // zero-filled
    utf8.copy(block, 0, 0, Math.min(utf8.length, PASSWORD_BYTES));
    return block;
}

/**
 * Build the PASSWORD_CHECK frame (0x9F00) carrying the 64-byte password block.
 *
 * @param password - the device password
 * @param txn - transaction number
 */
export function buildPasswordCheck(password: string, txn: number): Buffer {
    return buildFrame(PACKET_PASSWORD_CHECK, [...encodePassword(password)], txn);
}

/** Leading count/flag byte of the TCP_REQ payload (one connect-back target). */
export const TCP_REQ_PREFIX = 0x01;

/**
 * Build the UDP wake packet (TCP_REQ, 0x1400) that asks the controller to connect back to our
 * TLS server. Payload layout, confirmed byte-for-byte against a real GatewayCloud controller:
 *
 *   [0]     count/flag byte (0x01)
 *   [1..2]  TLS port, UInt16 **little-endian** ← the controller reads the connect-back port here
 *   [3..6]  our IPv4 (informational; the controller uses the UDP source address to dial back)
 *
 * The controller then opens a TCP connection to the UDP source IP on that port.
 *
 * @param bindIp - the IPv4 the controller should connect back to (advertised for completeness)
 * @param tlsPort - the TCP port our TLS server listens on (what the controller connects back to)
 * @param txn - transaction number
 */
export function buildTcpReq(bindIp: string, tlsPort: number, txn: number): Buffer {
    const octets = bindIp.split(".").map(n => parseInt(n, 10));
    const ipBytes = octets.length === 4 && octets.every(o => o >= 0 && o <= 255) ? octets : [0, 0, 0, 0];
    const payload = [TCP_REQ_PREFIX, tlsPort & 0xff, (tlsPort >>> 8) & 0xff, ...ipBytes];
    return buildFrame(PACKET_TCP_REQ, payload, txn);
}

/**
 * Build an ALIVE keep-alive frame (0x1100).
 *
 * @param txn - transaction number
 */
export function buildAlive(txn: number): Buffer {
    return buildFrame(PACKET_ALIVE, [], txn);
}

/**
 * Build a discovery / device-info request (0x1000).
 *
 * @param txn - transaction number
 */
export function buildDiscovery(txn: number): Buffer {
    return buildFrame(PACKET_DISCOVERY, [], txn);
}

/** A complete ONet frame parsed off the TLS stream. */
export interface OnetFrame {
    /** The parsed header. */
    header: OnetHeader;
    /** The payload bytes (length === header.payloadLength). */
    payload: Buffer;
    /** The full raw frame (header + payload), useful for base64 hand-off to the shared parsers. */
    raw: Buffer;
}

/**
 * Reassembles ONet frames from a TLS byte stream. TCP delivers bytes, not messages, so a single
 * `read` may contain a partial frame, exactly one frame, or several frames back-to-back. Feed every
 * chunk in and take whatever complete frames are available.
 */
export class FrameReader {
    private buffer: Buffer = Buffer.alloc(0);

    /**
     * Append a chunk and return all complete frames now available (possibly none).
     *
     * @param chunk - freshly received bytes
     */
    public push(chunk: Buffer): OnetFrame[] {
        this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
        const frames: OnetFrame[] = [];

        for (;;) {
            // Resync to the delimiter if the buffer does not start on a frame boundary.
            if (this.buffer.length > 0 && !this.startsWithDelimiter()) {
                const idx = this.indexOfDelimiter();
                if (idx < 0) {
                    // No delimiter in view; keep only the last 3 bytes (a delimiter may straddle chunks).
                    if (this.buffer.length > DELIMITER.length - 1) {
                        this.buffer = this.buffer.subarray(this.buffer.length - (DELIMITER.length - 1));
                    }
                    break;
                }
                this.buffer = this.buffer.subarray(idx);
            }

            const header = parseFrameHeader(this.buffer);
            if (!header) {
                break; // not enough bytes for a header yet
            }
            const total = HEADER_SIZE + header.payloadLength;
            if (this.buffer.length < total) {
                break; // full payload not arrived yet
            }
            const raw = this.buffer.subarray(0, total);
            frames.push({ header, payload: raw.subarray(HEADER_SIZE), raw });
            this.buffer = this.buffer.subarray(total);
        }

        return frames;
    }

    /** Discard any buffered partial data (e.g. on reconnect). */
    public reset(): void {
        this.buffer = Buffer.alloc(0);
    }

    private startsWithDelimiter(): boolean {
        return (
            this.buffer.length >= DELIMITER.length &&
            this.buffer[0] === DELIMITER[0] &&
            this.buffer[1] === DELIMITER[1] &&
            this.buffer[2] === DELIMITER[2] &&
            this.buffer[3] === DELIMITER[3]
        );
    }

    private indexOfDelimiter(): number {
        return this.buffer.indexOf(Buffer.from(DELIMITER));
    }
}
