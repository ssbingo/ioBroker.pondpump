"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var protocol_exports = {};
__export(protocol_exports, {
  DEFAULT_TLS_PORT: () => DEFAULT_TLS_PORT,
  DEFAULT_UDP_PORT: () => DEFAULT_UDP_PORT,
  FrameReader: () => FrameReader,
  PACKET_ALIVE: () => PACKET_ALIVE,
  PACKET_DEVICE_TABLE: () => PACKET_DEVICE_TABLE,
  PACKET_DISCOVERY: () => PACKET_DISCOVERY,
  PACKET_PASSWORD_CHECK: () => PACKET_PASSWORD_CHECK,
  PACKET_TCP_REQ: () => PACKET_TCP_REQ,
  PASSWORD_BYTES: () => PASSWORD_BYTES,
  TCP_REQ_PREFIX: () => TCP_REQ_PREFIX,
  buildAlive: () => buildAlive,
  buildDeviceTableRequest: () => buildDeviceTableRequest,
  buildDiscovery: () => buildDiscovery,
  buildPasswordCheck: () => buildPasswordCheck,
  buildTcpReq: () => buildTcpReq,
  decodeUnicodeEscapes: () => decodeUnicodeEscapes,
  encodePassword: () => encodePassword,
  parseDeviceTableEntry: () => parseDeviceTableEntry,
  parseGatewayDiscovery: () => parseGatewayDiscovery
});
module.exports = __toCommonJS(protocol_exports);
var import_onet = require("../cloud/onet");
const PACKET_TCP_REQ = 5120;
const PACKET_ALIVE = 4352;
const PACKET_DISCOVERY = 4096;
const PACKET_PASSWORD_CHECK = 40704;
const PACKET_DEVICE_TABLE = 16384;
const DEFAULT_UDP_PORT = 5959;
const DEFAULT_TLS_PORT = 5999;
const PASSWORD_BYTES = 64;
function decodeUnicodeEscapes(input) {
  return input.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}
function encodePassword(password) {
  const utf8 = Buffer.from(decodeUnicodeEscapes(password), "utf8");
  const block = Buffer.alloc(PASSWORD_BYTES);
  utf8.copy(block, 0, 0, Math.min(utf8.length, PASSWORD_BYTES));
  return block;
}
function buildPasswordCheck(password, txn) {
  return (0, import_onet.buildFrame)(PACKET_PASSWORD_CHECK, [...encodePassword(password)], txn);
}
const TCP_REQ_PREFIX = 1;
function buildTcpReq(bindIp, tlsPort, txn) {
  const octets = bindIp.split(".").map((n) => parseInt(n, 10));
  const ipBytes = octets.length === 4 && octets.every((o) => o >= 0 && o <= 255) ? octets : [0, 0, 0, 0];
  const payload = [TCP_REQ_PREFIX, tlsPort & 255, tlsPort >>> 8 & 255, ...ipBytes];
  return (0, import_onet.buildFrame)(PACKET_TCP_REQ, payload, txn);
}
function buildAlive(txn) {
  return (0, import_onet.buildFrame)(PACKET_ALIVE, [], txn);
}
function buildDiscovery(txn) {
  return (0, import_onet.buildFrame)(PACKET_DISCOVERY, [], txn);
}
function buildDeviceTableRequest(index, txn) {
  const i = index >>> 0;
  return (0, import_onet.buildFrame)(
    PACKET_DEVICE_TABLE,
    [i & 255, i >>> 8 & 255, i >>> 16 & 255, i >>> 24 & 255, 0, 0],
    txn
  );
}
function parseDeviceTableEntry(payload) {
  if (payload.length < 24) {
    return void 0;
  }
  const articleNumber = payload.readUInt32LE(8);
  const deviceNumber = payload.readUInt32LE(12);
  if (articleNumber === 0 || deviceNumber === 0 || deviceNumber === 4294967295) {
    return void 0;
  }
  const nameEnd = payload.indexOf(0, 24);
  const name = payload.toString("latin1", 24, nameEnd < 0 ? payload.length : nameEnd).trim();
  return {
    index: payload.readUInt32LE(0),
    articleNumber,
    deviceNumber,
    controlAddress: payload.readUInt16LE(20),
    name
  };
}
function parseGatewayDiscovery(payload) {
  if (payload.length < 130) {
    return void 0;
  }
  const readString = (start, end) => {
    const stop = payload.indexOf(0, start);
    return payload.toString("latin1", start, stop >= 0 && stop < end ? stop : end).trim();
  };
  return {
    hwType: payload[0],
    name: readString(2, 34),
    serialNumber: readString(34, 46),
    lname: readString(66, 130)
  };
}
class FrameReader {
  buffer = Buffer.alloc(0);
  /**
   * Append a chunk and return all complete frames now available (possibly none).
   *
   * @param chunk - freshly received bytes
   */
  push(chunk) {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    const frames = [];
    for (; ; ) {
      if (this.buffer.length > 0 && !this.startsWithDelimiter()) {
        const idx = this.indexOfDelimiter();
        if (idx < 0) {
          if (this.buffer.length > import_onet.DELIMITER.length - 1) {
            this.buffer = this.buffer.subarray(this.buffer.length - (import_onet.DELIMITER.length - 1));
          }
          break;
        }
        this.buffer = this.buffer.subarray(idx);
      }
      const header = (0, import_onet.parseFrameHeader)(this.buffer);
      if (!header) {
        break;
      }
      const total = import_onet.HEADER_SIZE + header.payloadLength;
      if (this.buffer.length < total) {
        break;
      }
      const raw = this.buffer.subarray(0, total);
      frames.push({ header, payload: raw.subarray(import_onet.HEADER_SIZE), raw });
      this.buffer = this.buffer.subarray(total);
    }
    return frames;
  }
  /** Discard any buffered partial data (e.g. on reconnect). */
  reset() {
    this.buffer = Buffer.alloc(0);
  }
  startsWithDelimiter() {
    return this.buffer.length >= import_onet.DELIMITER.length && this.buffer[0] === import_onet.DELIMITER[0] && this.buffer[1] === import_onet.DELIMITER[1] && this.buffer[2] === import_onet.DELIMITER[2] && this.buffer[3] === import_onet.DELIMITER[3];
  }
  indexOfDelimiter() {
    return this.buffer.indexOf(Buffer.from(import_onet.DELIMITER));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_TLS_PORT,
  DEFAULT_UDP_PORT,
  FrameReader,
  PACKET_ALIVE,
  PACKET_DEVICE_TABLE,
  PACKET_DISCOVERY,
  PACKET_PASSWORD_CHECK,
  PACKET_TCP_REQ,
  PASSWORD_BYTES,
  TCP_REQ_PREFIX,
  buildAlive,
  buildDeviceTableRequest,
  buildDiscovery,
  buildPasswordCheck,
  buildTcpReq,
  decodeUnicodeEscapes,
  encodePassword,
  parseDeviceTableEntry,
  parseGatewayDiscovery
});
//# sourceMappingURL=protocol.js.map
