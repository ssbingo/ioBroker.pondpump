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
  MINUTES_PER_DAY: () => MINUTES_PER_DAY,
  activeWindow: () => activeWindow,
  clampPercent: () => clampPercent,
  minutesUntilNextChange: () => minutesUntilNextChange,
  parseHhmm: () => parseHhmm,
  targetForConfig: () => targetForConfig,
  validatePlans: () => validatePlans
});
module.exports = __toCommonJS(schedule_exports);
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
function targetForConfig(config, nowMin) {
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
  MINUTES_PER_DAY,
  activeWindow,
  clampPercent,
  minutesUntilNextChange,
  parseHhmm,
  targetForConfig,
  validatePlans
});
//# sourceMappingURL=schedule.js.map
