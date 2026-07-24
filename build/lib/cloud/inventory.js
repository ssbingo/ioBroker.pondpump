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
  DIMMER_MAX: () => DIMMER_MAX,
  PUMP_DEVICE_TYPE: () => PUMP_DEVICE_TYPE,
  SENSOR_POWER_W: () => SENSOR_POWER_W,
  SENSOR_SPEED_RPM: () => SENSOR_SPEED_RPM,
  SENSOR_TEMPERATURE2_C: () => SENSOR_TEMPERATURE2_C,
  SENSOR_TEMPERATURE_C: () => SENSOR_TEMPERATURE_C,
  SENSOR_VOLTAGE_V: () => SENSOR_VOLTAGE_V,
  dimmerToPercent: () => dimmerToPercent,
  parseInventory: () => parseInventory
});
module.exports = __toCommonJS(inventory_exports);
const RDM_SENSOR_VALUE_PARAM = 513;
const SENSOR_SPEED_RPM = 1;
const SENSOR_TEMPERATURE_C = 3;
const SENSOR_TEMPERATURE2_C = 5;
const SENSOR_VOLTAGE_V = 6;
const SENSOR_POWER_W = 10;
const ATTR_FIRMWARE = 102;
const ATTR_POND_NAME = 103;
const CONTROL_ADDRESS_PARAM = 96;
const CONTROL_ADDRESS_OFFSET = 15;
function extractDeviceName(replyB64) {
  try {
    const bytes = Buffer.from(replyB64, "base64");
    let best = "";
    let current = "";
    for (let i = 8; i < bytes.length; i++) {
      const c = bytes[i];
      if (c >= 32 && c <= 126) {
        current += String.fromCharCode(c);
      } else {
        if (current.length > best.length) {
          best = current;
        }
        current = "";
      }
    }
    if (current.length > best.length) {
      best = current;
    }
    best = best.trim();
    return best.length >= 2 ? best : void 0;
  } catch {
    return void 0;
  }
}
function parseDeviceNames(incrementStates) {
  const map = /* @__PURE__ */ new Map();
  if (!Array.isArray(incrementStates)) {
    return map;
  }
  const deviceTable = incrementStates.find(
    (e) => isRecord(e) && toStringOrUndefined(pick(e, "key", "Key")) === "DeviceTable"
  );
  if (!isRecord(deviceTable)) {
    return map;
  }
  const value = pick(deviceTable, "value", "Value");
  const data = isRecord(value) ? pick(value, "data", "Data") : void 0;
  if (!Array.isArray(data)) {
    return map;
  }
  for (const entry of data) {
    if (!isRecord(entry)) {
      continue;
    }
    const replyB64 = toStringOrUndefined(pick(entry, "reply", "Reply"));
    if (!replyB64) {
      continue;
    }
    let index = 0;
    const requestB64 = toStringOrUndefined(pick(entry, "request", "Request"));
    if (requestB64) {
      try {
        const req = Buffer.from(requestB64, "base64");
        if (req.length > 0) {
          index = req[0];
        }
      } catch {
      }
    }
    const name = extractDeviceName(replyB64);
    if (name) {
      map.set(index, name);
    }
  }
  return map;
}
function parseSensorValues(rdm) {
  const sensors = {};
  for (const entry of rdm) {
    if (entry.parameterId !== RDM_SENSOR_VALUE_PARAM || entry.sensorId === void 0 || !entry.valueB64) {
      continue;
    }
    try {
      const bytes = Buffer.from(entry.valueB64, "base64");
      if (bytes.length >= 3) {
        sensors[entry.sensorId] = bytes.readInt16BE(1);
      }
    } catch {
    }
  }
  return sensors;
}
function extractControlAddress(rdm) {
  const entry = rdm.find((e) => e.parameterId === CONTROL_ADDRESS_PARAM);
  if (!(entry == null ? void 0 : entry.valueB64)) {
    return void 0;
  }
  try {
    const bytes = Buffer.from(entry.valueB64, "base64");
    return bytes.length > CONTROL_ADDRESS_OFFSET ? bytes[CONTROL_ADDRESS_OFFSET] : void 0;
  } catch {
    return void 0;
  }
}
const PUMP_DEVICE_TYPE = "GardenPump";
const DIMMER_MAX = 255;
function dimmerToPercent(raw) {
  const clamped = Math.max(0, Math.min(DIMMER_MAX, raw));
  return Math.round(clamped / DIMMER_MAX * 100);
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj[key] !== void 0 && obj[key] !== null) {
      return obj[key];
    }
  }
  return void 0;
}
function toStringOrUndefined(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return void 0;
}
function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}
function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  return false;
}
function unwrapValue(value) {
  if (isRecord(value) && ("Value" in value || "value" in value) && ("Timestamp" in value || "timestamp" in value)) {
    return pick(value, "Value", "value");
  }
  return value;
}
function parseCustomAttributes(raw) {
  const map = /* @__PURE__ */ new Map();
  let list = raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      list = JSON.parse(raw);
    } catch {
      return map;
    }
  }
  if (!Array.isArray(list)) {
    return map;
  }
  for (const entry of list) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = toNumber(pick(entry, "Id", "id"), NaN);
    if (Number.isFinite(id)) {
      map.set(id, unwrapValue(pick(entry, "Value", "value")));
    }
  }
  return map;
}
function parseGateway(raw) {
  var _a, _b, _c, _d, _e;
  if (!isRecord(raw)) {
    throw new Error("inventory gateway is missing or not an object");
  }
  const serialNumber = toStringOrUndefined(pick(raw, "serialNumber", "SerialNumber", "sn"));
  if (!serialNumber) {
    throw new Error("inventory gateway has no serial number");
  }
  const attributes = parseCustomAttributes(pick(raw, "customAttributesJson", "attributes", "Attributes"));
  const firmware = (_a = toStringOrUndefined(pick(raw, "firmware", "Firmware", "firmwareAttr_Id102"))) != null ? _a : toStringOrUndefined(attributes.get(ATTR_FIRMWARE));
  const pondName = (_b = toStringOrUndefined(pick(raw, "pondName", "PondName", "pondName_Id103"))) != null ? _b : toStringOrUndefined(attributes.get(ATTR_POND_NAME));
  const onlineState = pick(raw, "onlineState", "OnlineState");
  const isOnline = toBoolean(
    (_c = pick(raw, "isOnline", "IsOnline")) != null ? _c : isRecord(onlineState) ? pick(onlineState, "isOnline", "IsOnline") : void 0
  );
  const name = (_e = (_d = toStringOrUndefined(pick(raw, "lname", "lName", "LName", "name", "Name"))) != null ? _d : pondName) != null ? _e : "EGC Controller Cloud";
  return {
    id: toStringOrUndefined(pick(raw, "id", "Id")),
    serialNumber,
    articleNumber: pick(raw, "articleNumber", "ArticleNumber") !== void 0 ? toNumber(pick(raw, "articleNumber", "ArticleNumber")) : void 0,
    gatewayType: toStringOrUndefined(pick(raw, "gatewayType", "GatewayType")),
    name,
    firmware,
    pondName,
    isOnline
  };
}
function parseDmxPumpState(raw) {
  var _a, _b;
  const wrapper = isRecord(raw) ? raw : {};
  const valueField = pick(wrapper, "value", "Value");
  const inner = isRecord(valueField) ? valueField : wrapper;
  return {
    fcStatus: (_a = toStringOrUndefined(pick(inner, "fcStatus", "FcStatus"))) != null ? _a : "",
    fcMode: toNumber(pick(inner, "fcMode", "FcMode")),
    dimmerValue: toNumber(pick(inner, "dimmerValue", "DimmerValue")),
    deviceOn: toBoolean(pick(inner, "deviceOn", "DeviceOn")),
    timestamp: toStringOrUndefined(
      (_b = pick(wrapper, "timestamp", "Timestamp")) != null ? _b : pick(inner, "timestamp", "Timestamp")
    )
  };
}
function parseRdm(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      continue;
    }
    const keyField = pick(entry, "key", "Key");
    const key = isRecord(keyField) ? keyField : entry;
    const parameterId = pick(key, "parameterId", "ParameterId");
    if (parameterId === void 0) {
      continue;
    }
    const sensorIdRaw = pick(key, "sensorId", "SensorId");
    const valueWrapper = pick(entry, "value", "Value");
    const valueB64 = isRecord(valueWrapper) ? toStringOrUndefined(pick(valueWrapper, "value", "Value")) : toStringOrUndefined(pick(entry, "valueB64", "ValueB64"));
    result.push({
      parameterId: toNumber(parameterId),
      sensorId: sensorIdRaw !== void 0 ? toNumber(sensorIdRaw) : void 0,
      valueB64: valueB64 != null ? valueB64 : ""
    });
  }
  return result;
}
function parsePump(raw, index) {
  var _a, _b;
  const deviceNumber = toNumber(pick(raw, "deviceNumber", "DeviceNumber"), NaN);
  if (!Number.isFinite(deviceNumber)) {
    throw new Error("pump entry has no device number");
  }
  const connectionState = pick(raw, "connectionState", "ConnectionState");
  const isConnected = toBoolean(
    (_a = isRecord(connectionState) ? pick(connectionState, "isConnected", "IsConnected") : void 0) != null ? _a : pick(raw, "isConnected", "IsConnected")
  );
  const rdm = parseRdm(pick(raw, "rdmData", "RdmData"));
  return {
    deviceNumber,
    index,
    articleNumber: pick(raw, "articleNumber", "ArticleNumber") !== void 0 ? toNumber(pick(raw, "articleNumber", "ArticleNumber")) : void 0,
    deviceType: (_b = toStringOrUndefined(pick(raw, "deviceType", "DeviceType"))) != null ? _b : PUMP_DEVICE_TYPE,
    isConnected,
    controlAddress: extractControlAddress(rdm),
    dmx: parseDmxPumpState(pick(raw, "dmxPumpState", "DmxPumpState")),
    sensors: parseSensorValues(rdm),
    rdm
  };
}
function parseInventory(raw) {
  var _a;
  if (!isRecord(raw)) {
    throw new Error("inventory response is not an object");
  }
  const gateways = pick(raw, "gateways", "Gateways");
  const gatewayRaw = Array.isArray(gateways) && gateways.length > 0 ? gateways[0] : pick(raw, "gateway", "Gateway");
  const gateway = parseGateway(gatewayRaw);
  const deviceNames = parseDeviceNames(
    isRecord(gatewayRaw) ? pick(gatewayRaw, "incrementStates", "IncrementStates") : void 0
  );
  const devicesRaw = (_a = isRecord(gatewayRaw) ? pick(gatewayRaw, "devices", "Devices") : void 0) != null ? _a : pick(raw, "devices", "Devices");
  const pumps = [];
  if (Array.isArray(devicesRaw)) {
    for (let i = 0; i < devicesRaw.length; i++) {
      const device = devicesRaw[i];
      if (!isRecord(device)) {
        continue;
      }
      const deviceType = toStringOrUndefined(pick(device, "deviceType", "DeviceType"));
      if (deviceType !== void 0 && deviceType !== PUMP_DEVICE_TYPE) {
        continue;
      }
      const pump = parsePump(device, i);
      pump.name = deviceNames.get(i);
      pumps.push(pump);
    }
  }
  return { gateway, pumps };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DIMMER_MAX,
  PUMP_DEVICE_TYPE,
  SENSOR_POWER_W,
  SENSOR_SPEED_RPM,
  SENSOR_TEMPERATURE2_C,
  SENSOR_TEMPERATURE_C,
  SENSOR_VOLTAGE_V,
  dimmerToPercent,
  parseInventory
});
//# sourceMappingURL=inventory.js.map
