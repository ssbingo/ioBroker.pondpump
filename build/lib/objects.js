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
var objects_exports = {};
__export(objects_exports, {
  GATEWAY_ID: () => GATEWAY_ID,
  PUMPS_ROOT_ID: () => PUMPS_ROOT_ID,
  ensureGatewayObjects: () => ensureGatewayObjects,
  ensurePumpObjects: () => ensurePumpObjects,
  gatewayObjectDefs: () => gatewayObjectDefs,
  gatewayStateValues: () => gatewayStateValues,
  isSfcActive: () => isSfcActive,
  pumpObjectDefs: () => pumpObjectDefs,
  pumpStateValues: () => pumpStateValues,
  writeGatewayStates: () => writeGatewayStates,
  writePumpStates: () => writePumpStates
});
module.exports = __toCommonJS(objects_exports);
var import_inventory = require("./cloud/inventory");
const GATEWAY_ID = "gateway";
const PUMPS_ROOT_ID = "pumps";
function device(name) {
  return { type: "device", common: { name }, native: {} };
}
function folder(name) {
  return { type: "folder", common: { name }, native: {} };
}
function channel(name) {
  return { type: "channel", common: { name }, native: {} };
}
function stateObj(common) {
  return { type: "state", common, native: {} };
}
function gatewayObjectDefs(gw) {
  return [
    { id: GATEWAY_ID, obj: device(gw.name || "Gateway") },
    {
      id: `${GATEWAY_ID}.serialNumber`,
      obj: stateObj({ name: "Serial number", type: "string", role: "text", read: true, write: false })
    },
    {
      id: `${GATEWAY_ID}.name`,
      obj: stateObj({ name: "Name", type: "string", role: "info.name", read: true, write: false })
    },
    {
      id: `${GATEWAY_ID}.firmware`,
      obj: stateObj({ name: "Firmware", type: "string", role: "text", read: true, write: false })
    },
    {
      id: `${GATEWAY_ID}.pondName`,
      obj: stateObj({ name: "Pond name", type: "string", role: "text", read: true, write: false })
    },
    {
      id: `${GATEWAY_ID}.online`,
      obj: stateObj({
        name: "Gateway reachable",
        type: "boolean",
        role: "indicator.reachable",
        read: true,
        write: false,
        def: false
      })
    }
  ];
}
function pumpId(deviceNumber) {
  return `${PUMPS_ROOT_ID}.${deviceNumber}`;
}
function pumpObjectDefs(pump) {
  const base = pumpId(pump.deviceNumber);
  const defs = [
    { id: PUMPS_ROOT_ID, obj: folder("Pumps") },
    { id: base, obj: device(pump.name ? `${pump.name} (${pump.deviceNumber})` : `Pump ${pump.deviceNumber}`) },
    { id: `${base}.control`, obj: channel("Control") },
    {
      id: `${base}.control.on`,
      obj: stateObj({
        name: "Pump on",
        type: "boolean",
        role: "switch.power",
        read: true,
        write: true,
        def: false
      })
    },
    {
      id: `${base}.control.speed`,
      obj: stateObj({
        name: "Speed",
        type: "number",
        role: "level.dimmer",
        unit: "%",
        min: 0,
        max: 100,
        read: true,
        write: true
      })
    },
    {
      id: `${base}.control.speedRaw`,
      obj: stateObj({
        name: "Speed (raw 0-255)",
        type: "number",
        role: "level",
        min: 0,
        max: 255,
        read: true,
        write: true
      })
    },
    {
      id: `${base}.control.sfc`,
      obj: stateObj({
        name: "Seasonal Flow Control (SFC)",
        type: "boolean",
        role: "switch",
        read: true,
        write: true,
        def: false
      })
    },
    { id: `${base}.status`, obj: channel("Status") },
    {
      id: `${base}.status.fcStatus`,
      obj: stateObj({ name: "FC status", type: "string", role: "text", read: true, write: false })
    },
    {
      id: `${base}.status.fcMode`,
      obj: stateObj({ name: "FC mode", type: "number", role: "value", read: true, write: false })
    },
    {
      id: `${base}.status.connected`,
      obj: stateObj({
        name: "Pump connected",
        type: "boolean",
        role: "indicator.connected",
        read: true,
        write: false,
        def: false
      })
    },
    { id: `${base}.telemetry`, obj: channel("Telemetry") },
    {
      id: `${base}.telemetry.power`,
      obj: stateObj({
        name: "Power consumption",
        type: "number",
        role: "value.power",
        unit: "W",
        read: true,
        write: false
      })
    },
    {
      id: `${base}.telemetry.speed`,
      obj: stateObj({
        name: "Motor speed",
        type: "number",
        role: "value.speed",
        unit: "rpm",
        read: true,
        write: false
      })
    },
    {
      id: `${base}.telemetry.temperature`,
      obj: stateObj({
        name: "Temperature",
        type: "number",
        role: "value.temperature",
        unit: "\xB0C",
        read: true,
        write: false
      })
    },
    {
      id: `${base}.telemetry.temperature2`,
      obj: stateObj({
        name: "Temperature 2",
        type: "number",
        role: "value.temperature",
        unit: "\xB0C",
        read: true,
        write: false
      })
    },
    {
      id: `${base}.telemetry.voltage`,
      obj: stateObj({
        name: "Mains voltage",
        type: "number",
        role: "value.voltage",
        unit: "V",
        read: true,
        write: false
      })
    }
  ];
  const rawSensorIds = unmappedSensorIds(pump);
  if (rawSensorIds.length > 0) {
    defs.push({ id: `${base}.telemetry.raw`, obj: channel("Raw RDM sensors (unmapped)") });
    for (const sensorId of rawSensorIds) {
      defs.push({
        id: `${base}.telemetry.raw.sensor${sensorId}`,
        obj: stateObj({
          name: `RDM sensor ${sensorId} (raw, meaning TBD)`,
          type: "number",
          role: "value",
          read: true,
          write: false
        })
      });
    }
  }
  return defs;
}
function unmappedSensorIds(pump) {
  const mapped = /* @__PURE__ */ new Set([
    import_inventory.SENSOR_SPEED_RPM,
    import_inventory.SENSOR_POWER_W,
    import_inventory.SENSOR_TEMPERATURE_C,
    import_inventory.SENSOR_TEMPERATURE2_C,
    import_inventory.SENSOR_VOLTAGE_V
  ]);
  return Object.keys(pump.sensors).map(Number).filter((id) => !mapped.has(id)).sort((a, b) => a - b);
}
function isSfcActive(fcStatus) {
  const s = (fcStatus != null ? fcStatus : "").trim().toLowerCase();
  if (s === "" || s.includes("off") || ["0", "inactive", "none", "aus", "false"].includes(s)) {
    return false;
  }
  return true;
}
function gatewayStateValues(gw, online) {
  var _a, _b;
  return [
    { id: `${GATEWAY_ID}.serialNumber`, val: gw.serialNumber },
    { id: `${GATEWAY_ID}.name`, val: gw.name },
    { id: `${GATEWAY_ID}.firmware`, val: (_a = gw.firmware) != null ? _a : "" },
    { id: `${GATEWAY_ID}.pondName`, val: (_b = gw.pondName) != null ? _b : "" },
    { id: `${GATEWAY_ID}.online`, val: online }
  ];
}
function pumpStateValues(pump, options = {}) {
  var _a;
  const includeControl = (_a = options.includeControl) != null ? _a : true;
  const base = pumpId(pump.deviceNumber);
  const values = [];
  if (includeControl) {
    values.push(
      { id: `${base}.control.on`, val: pump.dmx.deviceOn },
      { id: `${base}.control.speed`, val: (0, import_inventory.dimmerToPercent)(pump.dmx.dimmerValue) },
      { id: `${base}.control.speedRaw`, val: pump.dmx.dimmerValue },
      { id: `${base}.control.sfc`, val: isSfcActive(pump.dmx.fcStatus) },
      { id: `${base}.status.fcStatus`, val: pump.dmx.fcStatus },
      { id: `${base}.status.fcMode`, val: pump.dmx.fcMode }
    );
  }
  values.push({ id: `${base}.status.connected`, val: pump.isConnected });
  if (pump.sensors[import_inventory.SENSOR_POWER_W] !== void 0) {
    values.push({ id: `${base}.telemetry.power`, val: pump.sensors[import_inventory.SENSOR_POWER_W] });
  }
  if (pump.sensors[import_inventory.SENSOR_SPEED_RPM] !== void 0) {
    values.push({ id: `${base}.telemetry.speed`, val: pump.sensors[import_inventory.SENSOR_SPEED_RPM] });
  }
  if (pump.sensors[import_inventory.SENSOR_TEMPERATURE_C] !== void 0) {
    values.push({ id: `${base}.telemetry.temperature`, val: pump.sensors[import_inventory.SENSOR_TEMPERATURE_C] });
  }
  if (pump.sensors[import_inventory.SENSOR_TEMPERATURE2_C] !== void 0) {
    values.push({ id: `${base}.telemetry.temperature2`, val: pump.sensors[import_inventory.SENSOR_TEMPERATURE2_C] });
  }
  if (pump.sensors[import_inventory.SENSOR_VOLTAGE_V] !== void 0) {
    values.push({ id: `${base}.telemetry.voltage`, val: pump.sensors[import_inventory.SENSOR_VOLTAGE_V] });
  }
  for (const sensorId of unmappedSensorIds(pump)) {
    values.push({ id: `${base}.telemetry.raw.sensor${sensorId}`, val: pump.sensors[sensorId] });
  }
  return values;
}
async function ensureObjects(writer, defs) {
  for (const def of defs) {
    await writer.extendObjectAsync(def.id, def.obj);
  }
}
async function writeValues(writer, values) {
  for (const value of values) {
    await writer.setStateAsync(value.id, value.val, true);
  }
}
async function ensureGatewayObjects(writer, gw) {
  await ensureObjects(writer, gatewayObjectDefs(gw));
}
async function writeGatewayStates(writer, gw, online) {
  await writeValues(writer, gatewayStateValues(gw, online));
}
async function ensurePumpObjects(writer, pump) {
  await ensureObjects(writer, pumpObjectDefs(pump));
}
async function writePumpStates(writer, pump, options) {
  await writeValues(writer, pumpStateValues(pump, options));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GATEWAY_ID,
  PUMPS_ROOT_ID,
  ensureGatewayObjects,
  ensurePumpObjects,
  gatewayObjectDefs,
  gatewayStateValues,
  isSfcActive,
  pumpObjectDefs,
  pumpStateValues,
  writeGatewayStates,
  writePumpStates
});
//# sourceMappingURL=objects.js.map
