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
var inventory_exports = {};
__export(inventory_exports, {
  fetchLocalInventory: () => fetchLocalInventory,
  toDomainInventory: () => toDomainInventory
});
module.exports = __toCommonJS(inventory_exports);
var import_onet = require("../cloud/onet");
var import_protocol = require("./protocol");
async function requestPayload(transport, frame) {
  const replyB64 = await transport.sendOnet(frame.toString("base64"));
  if (!replyB64) {
    return void 0;
  }
  const raw = Buffer.from(replyB64, "base64");
  const header = (0, import_onet.parseFrameHeader)(raw);
  if (!header) {
    return void 0;
  }
  return raw.subarray(16);
}
async function fetchLocalInventory(transport, nextTxn, maxDevices = 16) {
  let gateway;
  const discovery = await requestPayload(transport, (0, import_protocol.buildDiscovery)(nextTxn()));
  if (discovery) {
    gateway = (0, import_protocol.parseGatewayDiscovery)(discovery);
  }
  const devices = [];
  for (let index = 0; index < maxDevices; index++) {
    const payload = await requestPayload(transport, (0, import_protocol.buildDeviceTableRequest)(index, nextTxn()));
    const entry = payload ? (0, import_protocol.parseDeviceTableEntry)(payload) : void 0;
    if (!entry) {
      break;
    }
    devices.push(entry);
  }
  return { gateway, devices };
}
function toDomainInventory(local) {
  var _a, _b, _c, _d, _e;
  const gateway = {
    serialNumber: (_b = (_a = local.gateway) == null ? void 0 : _a.serialNumber) != null ? _b : "",
    name: ((_c = local.gateway) == null ? void 0 : _c.lname) || "OASE Controller",
    pondName: (_e = (_d = local.gateway) == null ? void 0 : _d.name) != null ? _e : "",
    gatewayType: "GatewayCloud",
    isOnline: true
  };
  const pumps = local.devices.map((d) => ({
    deviceNumber: d.deviceNumber,
    index: d.index,
    name: d.name,
    articleNumber: d.articleNumber,
    deviceType: "GardenPump",
    isConnected: true,
    controlAddress: d.controlAddress,
    dmx: { fcStatus: "", fcMode: 0, dimmerValue: 0, deviceOn: false },
    sensors: {},
    rdm: []
  }));
  return { gateway, pumps };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  fetchLocalInventory,
  toDomainInventory
});
//# sourceMappingURL=inventory.js.map
