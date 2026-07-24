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
var onet_exports = {};
__export(onet_exports, {
  DELIMITER: () => DELIMITER,
  DIMMER_MAX: () => DIMMER_MAX,
  HEADER_SIZE: () => HEADER_SIZE,
  PACKET_POLL: () => PACKET_POLL,
  PACKET_SET_DIMMER: () => PACKET_SET_DIMMER,
  PACKET_SET_ON: () => PACKET_SET_ON,
  PACKET_SET_SFC: () => PACKET_SET_SFC,
  PACKET_STATUS: () => PACKET_STATUS,
  PROTOCOL_VERSION: () => PROTOCOL_VERSION,
  buildFrame: () => buildFrame,
  buildPacket: () => buildPacket,
  buildPoll: () => buildPoll,
  buildSensorRead: () => buildSensorRead,
  buildSetDimmer: () => buildSetDimmer,
  buildSetOn: () => buildSetOn,
  buildSetSfc: () => buildSetSfc,
  parseFrameHeader: () => parseFrameHeader,
  parseSensorReadReply: () => parseSensorReadReply
});
module.exports = __toCommonJS(onet_exports);
const DELIMITER = [92, 35, 79, 65];
const PROTOCOL_VERSION = 2;
const PACKET_SET_DIMMER = 25600;
const PACKET_SET_ON = 20992;
const PACKET_SET_SFC = 20480;
const PACKET_POLL = 20736;
const PACKET_STATUS = 21760;
const DIMMER_MAX = 255;
const HEADER_SIZE = 16;
function buildFrame(packetType, payload, txn) {
  const buf = Buffer.alloc(HEADER_SIZE + payload.length);
  buf[0] = DELIMITER[0];
  buf[1] = DELIMITER[1];
  buf[2] = DELIMITER[2];
  buf[3] = DELIMITER[3];
  buf.writeUInt32LE(payload.length, 4);
  buf[8] = PROTOCOL_VERSION;
  buf[9] = txn & 255;
  buf.writeUInt16LE(packetType & 65535, 10);
  for (let i = 0; i < payload.length; i++) {
    buf[HEADER_SIZE + i] = payload[i] & 255;
  }
  return buf;
}
function buildPacket(packetType, payload, txn) {
  return buildFrame(packetType, payload, txn).toString("base64");
}
function parseFrameHeader(buf) {
  if (buf.length < HEADER_SIZE) {
    return void 0;
  }
  if (buf[0] !== DELIMITER[0] || buf[1] !== DELIMITER[1] || buf[2] !== DELIMITER[2] || buf[3] !== DELIMITER[3]) {
    return void 0;
  }
  return {
    payloadLength: buf.readUInt32LE(4),
    version: buf[8],
    txn: buf[9],
    packetType: buf.readUInt16LE(10)
  };
}
function buildSetDimmer(controlAddress, value, txn) {
  const clamped = Math.max(0, Math.min(DIMMER_MAX, Math.round(value)));
  return buildPacket(PACKET_SET_DIMMER, [controlAddress & 255, clamped], txn);
}
function buildSetOn(deviceIndex, on, txn) {
  const idx = deviceIndex >>> 0;
  const payload = [idx & 255, idx >>> 8 & 255, idx >>> 16 & 255, idx >>> 24 & 255, on ? 1 : 0];
  return buildPacket(PACKET_SET_ON, payload, txn);
}
function buildSetSfc(deviceIndex, on, txn) {
  const idx = deviceIndex >>> 0;
  const payload = [idx & 255, idx >>> 8 & 255, idx >>> 16 & 255, idx >>> 24 & 255, on ? 1 : 0, 0];
  return buildPacket(PACKET_SET_SFC, payload, txn);
}
function buildPoll(txn) {
  return buildPacket(PACKET_POLL, [0, 0, 0, 0], txn);
}
function buildSensorRead(deviceIndex, sensorNumber, txn) {
  const idx = deviceIndex >>> 0;
  const payload = [
    idx & 255,
    idx >>> 8 & 255,
    idx >>> 16 & 255,
    idx >>> 24 & 255,
    1,
    2,
    2,
    1,
    sensorNumber & 255
  ];
  return buildPacket(PACKET_STATUS, payload, txn);
}
function parseSensorReadReply(dataB64) {
  try {
    const payload = Buffer.from(dataB64, "base64").subarray(16);
    if (payload.length < 12) {
      return void 0;
    }
    return {
      deviceIndex: payload.readUInt32LE(0),
      sensorNumber: payload[9],
      value: payload.readInt16BE(10)
    };
  } catch {
    return void 0;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DELIMITER,
  DIMMER_MAX,
  HEADER_SIZE,
  PACKET_POLL,
  PACKET_SET_DIMMER,
  PACKET_SET_ON,
  PACKET_SET_SFC,
  PACKET_STATUS,
  PROTOCOL_VERSION,
  buildFrame,
  buildPacket,
  buildPoll,
  buildSensorRead,
  buildSetDimmer,
  buildSetOn,
  buildSetSfc,
  parseFrameHeader,
  parseSensorReadReply
});
//# sourceMappingURL=onet.js.map
