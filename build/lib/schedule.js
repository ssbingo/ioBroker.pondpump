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
var schedule_exports = {};
__export(schedule_exports, {
  DEFAULT_CURVE_POINTS: () => DEFAULT_CURVE_POINTS,
  MINUTES_PER_DAY: () => MINUTES_PER_DAY,
  activeWindow: () => activeWindow,
  clampPercent: () => clampPercent,
  collectSourceOids: () => collectSourceOids,
  compareValue: () => compareValue,
  decideTarget: () => decideTarget,
  interpolateCurve: () => interpolateCurve,
  minutesUntilNextChange: () => minutesUntilNextChange,
  parseHhmm: () => parseHhmm,
  rampTowards: () => rampTowards,
  updateEma: () => updateEma,
  validatePlans: () => validatePlans
});
module.exports = __toCommonJS(schedule_exports);
const DEFAULT_CURVE_POINTS = [
  { temp: 2, power: 35 },
  { temp: 4, power: 41 },
  { temp: 8, power: 54 },
  { temp: 10, power: 62 },
  { temp: 12, power: 71 },
  { temp: 15, power: 87 },
  { temp: 17, power: 100 }
];
const MINUTES_PER_DAY = 24 * 60;
function parseHhmm(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value != null ? value : "").trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}
function clampPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}
function validatePlans(plans) {
  const windows = [];
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const start = parseHhmm(plan.start);
    const end = parseHhmm(plan.end);
    if (start === null || end === null) {
      return { valid: false, error: `Schedule ${i + 1}: invalid time` };
    }
    if (end <= start) {
      return { valid: false, error: `Schedule ${i + 1}: end must be after start` };
    }
    if (plan.mode === "power") {
      const v = Number(plan.power);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        return { valid: false, error: `Schedule ${i + 1}: power must be between 0 and 100` };
      }
    }
    windows.push({ start, end, index: i });
  }
  windows.sort((a, b) => a.start - b.start);
  for (let k = 1; k < windows.length; k++) {
    if (windows[k].start < windows[k - 1].end) {
      return {
        valid: false,
        error: `Schedules ${windows[k - 1].index + 1} and ${windows[k].index + 1} overlap`
      };
    }
  }
  return { valid: true };
}
function activeWindow(plans, nowMin) {
  for (const plan of plans) {
    const start = parseHhmm(plan.start);
    const end = parseHhmm(plan.end);
    if (start !== null && end !== null && end > start && nowMin >= start && nowMin < end) {
      return plan;
    }
  }
  return void 0;
}
function compareValue(value, cmp, threshold) {
  switch (cmp) {
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "eq":
      return value === threshold;
    case "ne":
      return value !== threshold;
    default:
      return false;
  }
}
function interpolateCurve(points, temp) {
  const pts = points.filter((p) => Number.isFinite(p.temp) && Number.isFinite(p.power)).slice().sort((a, b) => a.temp - b.temp);
  if (!pts.length) {
    return null;
  }
  if (temp <= pts[0].temp) {
    return clampPercent(pts[0].power);
  }
  if (temp >= pts[pts.length - 1].temp) {
    return clampPercent(pts[pts.length - 1].power);
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (temp <= b.temp) {
      const span = b.temp - a.temp;
      const frac = span === 0 ? 0 : (temp - a.temp) / span;
      return clampPercent(a.power + frac * (b.power - a.power));
    }
  }
  return clampPercent(pts[pts.length - 1].power);
}
function windowTarget(config, nowMin) {
  var _a;
  const basePower = clampPercent(config.basePower);
  const window = activeWindow(config.plans, nowMin);
  if (!window) {
    return { sfc: false, power: basePower };
  }
  if (window.mode === "sfc") {
    return { sfc: window.sfc === true, power: basePower };
  }
  return { sfc: false, power: clampPercent((_a = window.power) != null ? _a : basePower) };
}
function curveTarget(config, sources) {
  var _a;
  const curve = config.curve;
  if (!(curve == null ? void 0 : curve.enabled)) {
    return void 0;
  }
  const temp = sources[curve.source];
  if (temp === void 0 || !Number.isFinite(temp)) {
    return { target: { sfc: false, power: 100 }, failSafe: true };
  }
  const power = interpolateCurve((_a = curve.points) != null ? _a : [], temp);
  if (power === null) {
    return void 0;
  }
  return { target: { sfc: false, power }, failSafe: false };
}
function collectSourceOids(config) {
  var _a, _b;
  const ids = /* @__PURE__ */ new Set();
  if (((_a = config.curve) == null ? void 0 : _a.enabled) && config.curve.source) {
    ids.add(config.curve.source);
  }
  for (const rule of (_b = config.rules) != null ? _b : []) {
    if (rule.source) {
      ids.add(rule.source);
    }
  }
  return [...ids];
}
function decideTarget(config, nowMin, sources = {}) {
  var _a, _b, _c, _d, _e, _f;
  const window = activeWindow(config.plans, nowMin);
  const priority = (_a = config.conditionPriority) != null ? _a : "override";
  const curve = curveTarget(config, sources);
  let base;
  let failSafe = false;
  if (priority === "outsideOnly") {
    base = window ? windowTarget(config, nowMin) : (_b = curve == null ? void 0 : curve.target) != null ? _b : windowTarget(config, nowMin);
    failSafe = !window && !!(curve == null ? void 0 : curve.failSafe);
  } else {
    base = (_c = curve == null ? void 0 : curve.target) != null ? _c : windowTarget(config, nowMin);
    failSafe = !!(curve == null ? void 0 : curve.failSafe);
  }
  let sfc = base.sfc;
  let power = Math.max(base.power, clampPercent(config.minPower));
  let hold = false;
  let raised = false;
  const actuators = [];
  for (const rule of (_d = config.rules) != null ? _d : []) {
    const value = sources[rule.source];
    if (value === void 0 || !Number.isFinite(value) || !compareValue(value, rule.cmp, rule.threshold)) {
      continue;
    }
    switch (rule.effect) {
      case "raisePower": {
        const raisedTo = clampPercent((_e = rule.power) != null ? _e : 100);
        if (raisedTo > power) {
          power = raisedTo;
          raised = true;
        }
        break;
      }
      case "boostMax":
        power = 100;
        raised = true;
        break;
      case "hold":
        hold = true;
        break;
      case "sfc":
        sfc = rule.sfc === true;
        break;
      case "setState":
        if (rule.target) {
          actuators.push({ target: rule.target, value: (_f = rule.value) != null ? _f : true });
        }
        break;
    }
  }
  return { sfc, power: hold && !raised ? "hold" : power, actuators, failSafe };
}
function rampTowards(current, target, maxStep) {
  if (!(maxStep > 0)) {
    return target;
  }
  const delta = target - current;
  if (Math.abs(delta) <= maxStep) {
    return target;
  }
  return current + Math.sign(delta) * maxStep;
}
function updateEma(prev, raw, dtMs, tauMs) {
  if (!(tauMs > 0) || !(dtMs > 0)) {
    return raw;
  }
  const alpha = 1 - Math.exp(-dtMs / tauMs);
  return prev + alpha * (raw - prev);
}
function minutesUntilNextChange(plans, nowMin) {
  const boundaries = /* @__PURE__ */ new Set();
  for (const plan of plans) {
    const start = parseHhmm(plan.start);
    const end = parseHhmm(plan.end);
    if (start !== null) {
      boundaries.add(start);
    }
    if (end !== null) {
      boundaries.add(end);
    }
  }
  let best = MINUTES_PER_DAY;
  for (const boundary of boundaries) {
    const delta = ((boundary - nowMin) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const untilNext = delta === 0 ? MINUTES_PER_DAY : delta;
    if (untilNext < best) {
      best = untilNext;
    }
  }
  return best;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_CURVE_POINTS,
  MINUTES_PER_DAY,
  activeWindow,
  clampPercent,
  collectSourceOids,
  compareValue,
  decideTarget,
  interpolateCurve,
  minutesUntilNextChange,
  parseHhmm,
  rampTowards,
  updateEma,
  validatePlans
});
//# sourceMappingURL=schedule.js.map
