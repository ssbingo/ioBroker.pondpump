"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var astro_exports = {};
__export(astro_exports, {
  astroForDate: () => astroForDate,
  dateToLocalMinutes: () => dateToLocalMinutes,
  parseCoord: () => parseCoord,
  resolvePumpCoordinates: () => resolvePumpCoordinates,
  toCoordinates: () => toCoordinates
});
module.exports = __toCommonJS(astro_exports);
var import_suncalc = __toESM(require("suncalc"));
function dateToLocalMinutes(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    return null;
  }
  return d.getHours() * 60 + d.getMinutes();
}
function parseCoord(value, max) {
  if (typeof value === "number") {
    return Number.isFinite(value) && Math.abs(value) <= max ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const n = parseFloat(value.replace(",", ".").trim());
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}
function toCoordinates(lat, lon) {
  const la = parseCoord(lat, 90);
  const lo = parseCoord(lon, 180);
  return la === null || lo === null ? null : { lat: la, lon: lo };
}
function resolvePumpCoordinates(mode, systemCoords, sharedCoords, pump = {}) {
  var _a;
  if (mode === "shared") {
    return sharedCoords != null ? sharedCoords : systemCoords;
  }
  if (mode === "individual" && pump.coordinateSource === "specific") {
    return (_a = toCoordinates(pump.latitude, pump.longitude)) != null ? _a : systemCoords;
  }
  return systemCoords;
}
function astroForDate(date, coords) {
  const t = import_suncalc.default.getTimes(date, coords.lat, coords.lon);
  return { sunriseMin: dateToLocalMinutes(t.sunrise), sunsetMin: dateToLocalMinutes(t.sunset) };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  astroForDate,
  dateToLocalMinutes,
  parseCoord,
  resolvePumpCoordinates,
  toCoordinates
});
//# sourceMappingURL=astro.js.map
