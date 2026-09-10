/*
 * Per-pump scheduling core (Phase 9).
 *
 * Pure, side-effect-free logic shared by the backend scheduler (main.ts) and the admin scheduler
 * component. A pump has a set of daily time windows; each window sets either a power % or switches
 * SFC. Outside every window the pump falls back to a configurable base power.
 *
 * Window bounds are either a fixed "HH:MM" clock time or an astronomical event (sunrise/sunset ±
 * offset, Phase 13); astro windows are resolved daily and may wrap past midnight. All internal maths
 * use minutes-of-day (0..1439).
 */

/**
 * What a schedule window does: set a power %, switch Seasonal Flow Control, or drive an external
 * actuator state (Phase 13 — e.g. a waterfall/UVC on during the window, off outside it).
 */
export type ScheduleMode = "power" | "sfc" | "actuator";

/**
 * How a window boundary is defined (Phase 13):
 * - "clock": a fixed time of day ("HH:MM").
 * - "sunrise" / "sunset": that day's astronomical event plus an offset in minutes (may be negative).
 */
export type WindowBoundMode = "clock" | "sunrise" | "sunset";

/** Resolved astronomical times for a day, as minutes-of-day (0..1439), or null when unavailable. */
export interface AstroTimes {
    /** Sunrise as minutes-of-day, or null (no location / polar day-night). */
    sunriseMin: number | null;
    /** Sunset as minutes-of-day, or null. */
    sunsetMin: number | null;
}

/** One daily time window for a pump. */
export interface PumpSchedule {
    /** Window start, "HH:MM" (00:00..23:59) — used when `startMode` is "clock" (the default). */
    start: string;
    /** Window end, "HH:MM" — used when `endMode` is "clock". */
    end: string;
    /** Phase 13 — how the start is defined; defaults to "clock". */
    startMode?: WindowBoundMode;
    /** Phase 13 — offset in minutes (may be negative) applied when `startMode` is sunrise/sunset. */
    startOffset?: number;
    /** Phase 13 — how the end is defined; defaults to "clock". */
    endMode?: WindowBoundMode;
    /** Phase 13 — offset in minutes (may be negative) applied when `endMode` is sunrise/sunset. */
    endOffset?: number;
    /** What the window does: set a power %, switch SFC, or drive an actuator. */
    mode: ScheduleMode;
    /** Target power in % (0..100) when `mode` is "power". */
    power?: number;
    /** Target SFC state when `mode` is "sfc". */
    sfc?: boolean;
    /** Foreign state id to drive when `mode` is "actuator". */
    target?: string;
    /** Value written to `target` while the window is active (default true). */
    onValue?: number | boolean;
    /** Value written to `target` while the window is inactive (omit to leave it untouched outside). */
    offValue?: number | boolean;
    /** Phase 15 — display name for an "actuator" window (e.g. "Wasserfall"); blank → "Aktor N". */
    actuatorName?: string;
    /** Phase 15 — display icon (emoji) for an "actuator" window, shown in the scheduler widget. */
    actuatorIcon?: string;
}

/** Comparison operator for a condition rule (source value vs. threshold). */
export type Comparison = "lt" | "lte" | "gt" | "gte" | "eq" | "ne";

/**
 * What a matching weather rule does (Phase 12). Rules never lower the flow — the reduction is the
 * temperature curve's job — they only **raise** it, freeze it (frost), toggle SFC, or write an
 * external actuator (aeration, waterfall, …).
 */
export type RuleEffectType =
    | "raisePower" // raise pump power to at least `power` %
    | "boostMax" // raise pump power to 100 %
    | "hold" // freeze the pump power at its last applied value (frost)
    | "sfc" // set the pump's SFC on/off (advanced; hands temperature control back to the pump)
    | "setState"; // generic actuator: set the foreign `target` state to `value` (aeration, waterfall, …)

/**
 * A single threshold rule. When the value read from `source` satisfies `cmp threshold`, the effect
 * is applied. Booleans are read as 1/0. All matching rules combine (raises take the maximum, a
 * matching hold freezes unless a raise won, actuator writes accumulate).
 */
export interface ConditionRule {
    /** ioBroker state id to read (an external weather/water OID, or a pump telemetry state). */
    source: string;
    /** Comparison operator. */
    cmp: Comparison;
    /** Threshold the source value is compared against. */
    threshold: number;
    /** What to do while the rule holds. */
    effect: RuleEffectType;
    /** Target power % (0..100) when `effect` is "raisePower". */
    power?: number;
    /** Target SFC state when `effect` is "sfc". */
    sfc?: boolean;
    /** Foreign state id to write when `effect` is "setState". */
    target?: string;
    /** Value to write when `effect` is "setState". */
    value?: number | boolean;
}

/** One point of the temperature→power curve. */
export interface CurvePoint {
    /** Temperature in °C. */
    temp: number;
    /** Power % (0..100) at that temperature. */
    power: number;
}

/** Temperature-driven power curve. Power is linearly interpolated between points (clamped at the ends). */
export interface TempCurve {
    /** Whether the curve is active. */
    enabled: boolean;
    /** State id providing the water temperature (recommend a pond mid-depth sensor, not the pump). */
    source: string;
    /** Interpolation points; any order (sorted internally by temperature). */
    points: CurvePoint[];
}

/**
 * How the temperature/weather conditions relate to the time windows:
 * - "override": the temperature curve (when enabled) overrides the current time window.
 * - "outsideOnly": the curve applies only when no time window is active (it replaces the base power).
 */
export type ConditionPriority = "override" | "outsideOnly";

/** Scheduling configuration for a single pump. */
export interface PumpScheduleConfig {
    /** Whether scheduling is active for this pump. */
    enabled: boolean;
    /** Power % applied whenever no window is active (the base / default). */
    basePower: number;
    /** The (non-overlapping) time windows, in any order. */
    plans: PumpSchedule[];
    /**
     * Display name of the pump, cached from the object tree so the admin can label the pump's tab
     * without re-reading objects. Pure UI metadata — the backend scheduler ignores it.
     */
    name?: string;
    /**
     * Which device temperature sensor the user picked as the water temperature (Phase 12). The
     * backend mirrors that sensor's value into `telemetry.waterTemperature`, and the admin pre-fills
     * the curve source with it. The pump's raw sensors are the *device* temperature, so the user must
     * choose which one actually reads the water. `decideTarget` itself ignores this (UI/backend only).
     */
    waterTempSensor?: "temperature" | "temperature2";
    /** Phase 11 — temperature→power curve. */
    curve?: TempCurve;
    /** Phase 11/12 — threshold rules (temperature/weather), all matching rules combine. */
    rules?: ConditionRule[];
    /** Phase 11 — how the curve relates to the time windows. Default "override". */
    conditionPriority?: ConditionPriority;
    /** Phase 12 — hydraulic minimum power % the flow never drops below (0..100). */
    minPower?: number;
    /**
     * Phase 13 — hard maximum power % the flow never exceeds (0..100, default 100). Applied last, so it
     * caps everything: the curve, weather rules (incl. `boostMax`) and the missing-source fail-safe.
     * For pumps that only run up to e.g. 90 %.
     */
    maxPower?: number;
    /** Phase 12 — smoothing time constant for the curve's temperature source, in hours (0 = off). */
    smoothingHours?: number;
    /** Phase 12 — temperature hysteresis: re-map the curve only after ±this many K (0 = off). */
    hysteresisK?: number;
    /** Phase 12 — max change of applied power per hour, in percentage points (0 = instant). */
    rampPercentPerHour?: number;
    /**
     * Phase 13 — per-pump location, only consulted when the instance location mode is "individual".
     * `coordinateSource` "specific" uses this pump's own latitude/longitude; "system" (the default)
     * falls back to the ioBroker system location.
     */
    location?: { coordinateSource?: "system" | "specific"; latitude?: string; longitude?: string };
    /**
     * Phase 13 — night protection (research-recommended). During the astronomical night, if the curve's
     * water temperature is at/above `minWaterTemp`, the flow is not reduced below `floorPower` (default
     * 100 %) — because the oxygen minimum is at night and a warm-night reduction is counter-productive.
     * Needs a location (for sunrise/sunset); with no curve source configured it protects unconditionally.
     */
    nightProtection?: { enabled: boolean; minWaterTemp?: number; floorPower?: number };
}

/** A write the scheduler wants to make to an external actuator state (aeration, waterfall, …). */
export interface ActuatorWrite {
    /** Foreign state id to write. */
    target: string;
    /** Value to write. */
    value: number | boolean;
}

/** Where the base target came from — for status display (Phase 14). */
export type ScheduleSource = "curve" | "window" | "base" | "failSafe";

/** The scheduler's full decision for a pump at a moment in time. */
export interface ScheduleDecision {
    /** Desired SFC state. */
    sfc: boolean;
    /** Desired pump power % (0..100), or "hold" to keep the last applied value (frost). */
    power: number | "hold";
    /** External actuator writes triggered by matching rules. */
    actuators: ActuatorWrite[];
    /** True when the curve was enabled but its temperature source was missing → fail-safe 100 %. */
    failSafe: boolean;
    /** Where the base target came from (curve / active window / base power / fail-safe). */
    source: ScheduleSource;
    /** A weather rule raised the power (raisePower/boostMax) above the base this tick. */
    raised: boolean;
    /** Night protection floored the flow this tick (warm astronomical night). */
    nightProtected: boolean;
    /** A frost "hold" rule froze the pump this tick. */
    hold: boolean;
}

/**
 * Default temperature→power curve (research reference, Q10-2 normalised to 17 °C, clamped to Q_min).
 * The "Load default curve" preset in the admin uses these points.
 */
export const DEFAULT_CURVE_POINTS: CurvePoint[] = [
    { temp: 2, power: 35 },
    { temp: 4, power: 41 },
    { temp: 8, power: 54 },
    { temp: 10, power: 62 },
    { temp: 12, power: 71 },
    { temp: 15, power: 87 },
    { temp: 17, power: 100 },
];

/** Per-pump scheduling config, keyed by the pump's device number (as a string). */
export type SchedulesConfig = Record<string, PumpScheduleConfig>;

/** The concrete control values the scheduler wants applied at a given moment. */
export interface ScheduleTarget {
    /** Desired SFC state. */
    sfc: boolean;
    /** Desired power % (0..100). */
    power: number;
}

/** Result of validating a pump's plans. */
export interface ValidationResult {
    /** True when all windows are well-formed and none overlap. */
    valid: boolean;
    /** Human-readable reason when `valid` is false. */
    error?: string;
}

/** Minutes in a full day. */
export const MINUTES_PER_DAY = 24 * 60;

/**
 * Parse an "HH:MM" string to minutes-of-day (0..1439), or null when malformed / out of range.
 *
 * @param value - a time string like "06:30"
 */
export function parseHhmm(value: string | undefined): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
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

/**
 * Clamp a value to an integer power percentage (0..100).
 *
 * @param value - the raw power value to clamp
 */
export function clampPercent(value: number | undefined): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

/**
 * Validate a pump's plans: each window must have a valid start before its end, valid values, and no
 * two windows may overlap. Returns the first problem found (1-based index for user messages).
 *
 * @param plans - the pump's schedule windows
 */
export function validatePlans(plans: PumpSchedule[]): ValidationResult {
    const windows: Array<{ start: number; end: number; index: number }> = [];
    for (let i = 0; i < plans.length; i++) {
        const plan = plans[i];
        if (plan.mode === "actuator") {
            // Actuator windows drive an external state and are independent — they need a target, but
            // are not power-checked and may overlap (with each other and with power/sfc windows).
            if (!plan.target) {
                return { valid: false, error: `Schedule ${i + 1}: actuator target missing` };
            }
            continue;
        }
        if (plan.mode === "power") {
            const v = Number(plan.power);
            if (!Number.isFinite(v) || v < 0 || v > 100) {
                return { valid: false, error: `Schedule ${i + 1}: power must be between 0 and 100` };
            }
        }
        // Astro (sunrise/sunset) bounds are resolved daily and may wrap past midnight — they can't be
        // statically ordered or overlap-checked, so only fixed-clock windows enter those checks.
        if ((plan.startMode ?? "clock") !== "clock" || (plan.endMode ?? "clock") !== "clock") {
            continue;
        }
        const start = parseHhmm(plan.start);
        const end = parseHhmm(plan.end);
        if (start === null || end === null) {
            return { valid: false, error: `Schedule ${i + 1}: invalid time` };
        }
        if (end <= start) {
            return { valid: false, error: `Schedule ${i + 1}: end must be after start` };
        }
        windows.push({ start, end, index: i });
    }
    windows.sort((a, b) => a.start - b.start);
    for (let k = 1; k < windows.length; k++) {
        if (windows[k].start < windows[k - 1].end) {
            return {
                valid: false,
                error: `Schedules ${windows[k - 1].index + 1} and ${windows[k].index + 1} overlap`,
            };
        }
    }
    return { valid: true };
}

/** Astro times meaning "no location known" — every astro bound resolves to null (clock bounds work). */
export const NO_ASTRO: AstroTimes = { sunriseMin: null, sunsetMin: null };

/**
 * Wrap a minute value into [0, 1440).
 *
 * @param minute - a possibly out-of-range minute-of-day
 */
function normMinute(minute: number): number {
    return ((Math.round(minute) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * Resolve one window boundary to minutes-of-day (0..1439). Returns null when a "clock" time is
 * malformed or an astro event is unavailable (no location, or polar day/night).
 *
 * @param mode - how the boundary is defined (default "clock")
 * @param clock - the "HH:MM" time for clock mode
 * @param offset - minutes offset (may be negative) for sunrise/sunset mode
 * @param astro - the resolved astro times for the day
 */
export function resolveBound(
    mode: WindowBoundMode | undefined,
    clock: string,
    offset: number | undefined,
    astro: AstroTimes,
): number | null {
    const off = Number.isFinite(offset) ? Number(offset) : 0;
    if (mode === "sunrise") {
        return astro.sunriseMin === null ? null : normMinute(astro.sunriseMin + off);
    }
    if (mode === "sunset") {
        return astro.sunsetMin === null ? null : normMinute(astro.sunsetMin + off);
    }
    return parseHhmm(clock);
}

/**
 * Whether `nowMin` falls in [start, end), allowing a window to wrap past midnight (start > end, e.g.
 * an astro "sunset → sunrise" night window). start == end is never active.
 *
 * @param start - resolved start minute
 * @param end - resolved end minute
 * @param nowMin - current minute-of-day
 */
function windowActive(start: number, end: number, nowMin: number): boolean {
    if (start === end) {
        return false;
    }
    return start < end ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end;
}

/**
 * Whether `nowMin` is daytime (between sunrise and sunset). Returns null when astro is unavailable
 * (no location / polar day-night), so callers can tell "night" from "unknown".
 *
 * @param astro - resolved astro times for the day
 * @param nowMin - current minute-of-day
 */
export function isAstroDay(astro: AstroTimes, nowMin: number): boolean | null {
    if (astro.sunriseMin === null || astro.sunsetMin === null) {
        return null;
    }
    return windowActive(astro.sunriseMin, astro.sunsetMin, nowMin);
}

/**
 * Whether a single plan's resolved window contains `nowMin` (astro bounds resolved, midnight wrap OK).
 *
 * @param plan - the schedule window
 * @param nowMin - current minute-of-day
 * @param astro - resolved astro times for the day
 */
function planActive(plan: PumpSchedule, nowMin: number, astro: AstroTimes): boolean {
    const start = resolveBound(plan.startMode, plan.start, plan.startOffset, astro);
    const end = resolveBound(plan.endMode, plan.end, plan.endOffset, astro);
    return start !== null && end !== null && windowActive(start, end, nowMin);
}

/**
 * External actuator writes from "actuator" windows (Phase 13): for each distinct target, write its
 * on-value while any of its windows is active, else its off-value (omit off-value → leave untouched).
 *
 * @param plans - the pump's schedule windows
 * @param nowMin - current minute-of-day
 * @param astro - resolved astro times for the day
 */
function actuatorWrites(plans: PumpSchedule[], nowMin: number, astro: AstroTimes): ActuatorWrite[] {
    const byTarget = new Map<string, { active: boolean; on: number | boolean; off?: number | boolean }>();
    for (const plan of plans) {
        if (plan.mode !== "actuator" || !plan.target) {
            continue;
        }
        const e = byTarget.get(plan.target) ?? { active: false, on: true };
        e.on = plan.onValue ?? true;
        e.off = plan.offValue;
        if (planActive(plan, nowMin, astro)) {
            e.active = true;
        }
        byTarget.set(plan.target, e);
    }
    const writes: ActuatorWrite[] = [];
    for (const [target, e] of byTarget) {
        const value = e.active ? e.on : e.off;
        if (value !== undefined) {
            writes.push({ target, value });
        }
    }
    return writes;
}

/** Display descriptor for one "actuator" window (Phase 15), for the scheduler widget. */
export interface ActuatorStatus {
    /** Display name; falls back to "Aktor N" when the plan has none. */
    name: string;
    /** Display icon (emoji), or "" when unset. */
    icon: string;
    /** The driven foreign state id. */
    target: string;
    /** Whether the actuator's window is currently active (on). */
    on: boolean;
}

/**
 * Describe every "actuator" window (Phase 15): its name, icon, target and current on/off state, in
 * config order. Used by the backend to publish `schedule.actuators` for the scheduler widget.
 *
 * @param plans - the pump's schedule windows
 * @param nowMin - current minute-of-day
 * @param astro - resolved astro times for the day
 */
export function describeActuators(
    plans: PumpSchedule[],
    nowMin: number,
    astro: AstroTimes = NO_ASTRO,
): ActuatorStatus[] {
    const out: ActuatorStatus[] = [];
    let n = 0;
    for (const plan of plans) {
        if (plan.mode !== "actuator") {
            continue;
        }
        n += 1;
        out.push({
            name: (plan.actuatorName ?? "").trim() || `Aktor ${n}`,
            icon: plan.actuatorIcon ?? "",
            target: plan.target ?? "",
            on: planActive(plan, nowMin, astro),
        });
    }
    return out;
}

/**
 * The window active at `nowMin`, or undefined if none. Boundaries are resolved against `astro` (so
 * sunrise/sunset windows work and may wrap past midnight); malformed/unavailable windows are ignored.
 *
 * @param plans - the pump's schedule windows
 * @param nowMin - current minute-of-day (0..1439)
 * @param astro - resolved astro times for the day (default: none → astro bounds are skipped)
 */
export function activeWindow(
    plans: PumpSchedule[],
    nowMin: number,
    astro: AstroTimes = NO_ASTRO,
): PumpSchedule | undefined {
    for (const plan of plans) {
        const start = resolveBound(plan.startMode, plan.start, plan.startOffset, astro);
        const end = resolveBound(plan.endMode, plan.end, plan.endOffset, astro);
        if (start !== null && end !== null && windowActive(start, end, nowMin)) {
            return plan;
        }
    }
    return undefined;
}

/**
 * Compare a numeric value against a threshold with the given operator.
 *
 * @param value - the source value to test
 * @param cmp - the comparison operator
 * @param threshold - the threshold to compare against
 */
export function compareValue(value: number, cmp: Comparison, threshold: number): boolean {
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

/**
 * Interpolate the curve's power for a given temperature. Below the first / above the last point the
 * value is clamped to that point (no extrapolation). Returns null when the curve has no valid points.
 *
 * @param points - the curve points (any order)
 * @param temp - the temperature to look up
 */
export function interpolateCurve(points: CurvePoint[], temp: number): number | null {
    const pts = points
        .filter(p => Number.isFinite(p.temp) && Number.isFinite(p.power))
        .slice()
        .sort((a, b) => a.temp - b.temp);
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

/**
 * The control target from the time windows alone (no curve, no rules).
 *
 * @param config - the pump's scheduling configuration
 * @param nowMin - current minute-of-day (0..1439)
 * @param astro - resolved astro times for the day
 */
function windowTarget(config: PumpScheduleConfig, nowMin: number, astro: AstroTimes): ScheduleTarget {
    const basePower = clampPercent(config.basePower);
    // Only power/sfc windows drive the pump; "actuator" windows drive external states (see decideTarget).
    const window = activeWindow(
        config.plans.filter(p => p.mode !== "actuator"),
        nowMin,
        astro,
    );
    if (!window) {
        return { sfc: false, power: basePower };
    }
    if (window.mode === "sfc") {
        return { sfc: window.sfc === true, power: basePower };
    }
    return { sfc: false, power: clampPercent(window.power ?? basePower) };
}

/**
 * The base target from the temperature curve, or the fail-safe (100 %) when the curve is enabled but
 * its temperature source is missing. Returns undefined when the curve is off or has no usable points.
 *
 * @param config - the pump's scheduling configuration
 * @param sources - current numeric values of the referenced state ids
 */
function curveTarget(
    config: PumpScheduleConfig,
    sources: Record<string, number>,
): { target: ScheduleTarget; failSafe: boolean } | undefined {
    const curve = config.curve;
    if (!curve?.enabled) {
        return undefined;
    }
    const temp = sources[curve.source];
    if (temp === undefined || !Number.isFinite(temp)) {
        // Sensor failure: never under-flow — too much flow costs electricity, too little costs fish.
        return { target: { sfc: false, power: 100 }, failSafe: true };
    }
    const power = interpolateCurve(curve.points ?? [], temp);
    if (power === null) {
        return undefined;
    }
    return { target: { sfc: false, power }, failSafe: false };
}

/**
 * All distinct state ids the config READS for its conditions (curve + rule sources) — the backend
 * subscribes to these. Rule `setState` targets are outputs, not inputs, and are not included.
 *
 * @param config - the pump's scheduling configuration
 */
export function collectSourceOids(config: PumpScheduleConfig): string[] {
    const ids = new Set<string>();
    if (config.curve?.enabled && config.curve.source) {
        ids.add(config.curve.source);
    }
    for (const rule of config.rules ?? []) {
        if (rule.source) {
            ids.add(rule.source);
        }
    }
    return [...ids];
}

/**
 * Decide the full control target at `nowMin` (Phase 12): the base power comes from the time windows
 * and the temperature curve (per `conditionPriority`), is clamped up to `minPower`, and is then only
 * ever **raised** (or frozen / SFC-toggled / accompanied by actuator writes) by the matching weather
 * rules. With an empty `sources` map and no curve/rules the result equals the plain time-window
 * behaviour. Smoothing, hysteresis and ramping of the applied value are the backend's job.
 *
 * When a `trace` array is passed, a human-readable step is appended at each decision point (for the
 * backend's debug log); it does not affect the result.
 *
 * @param config - the pump's scheduling configuration
 * @param nowMin - current minute-of-day (0..1439)
 * @param sources - current numeric values of the referenced state ids (booleans as 1/0)
 * @param astro - resolved astro times for the day (for sunrise/sunset window bounds)
 * @param trace - optional array that collects a human-readable breakdown of the decision
 */
export function decideTarget(
    config: PumpScheduleConfig,
    nowMin: number,
    sources: Record<string, number> = {},
    astro: AstroTimes = NO_ASTRO,
    trace?: string[],
): ScheduleDecision {
    const window = activeWindow(
        config.plans.filter(p => p.mode !== "actuator"),
        nowMin,
        astro,
    );
    const priority = config.conditionPriority ?? "override";
    const curve = curveTarget(config, sources);

    // Base: the curve overrides the window ("override"), or the window wins while active ("outsideOnly").
    let base: ScheduleTarget;
    let failSafe = false;
    if (priority === "outsideOnly") {
        base = window ? windowTarget(config, nowMin, astro) : (curve?.target ?? windowTarget(config, nowMin, astro));
        failSafe = !window && !!curve?.failSafe;
    } else {
        base = curve?.target ?? windowTarget(config, nowMin, astro);
        failSafe = !!curve?.failSafe;
    }
    if (trace) {
        const from = window ? `window ${window.start}-${window.end}` : "no window";
        const curveStr = curve
            ? curve.failSafe
                ? "curve FAIL-SAFE 100% (source missing)"
                : `curve ${curve.target.power}%`
            : "no curve";
        trace.push(`base=${base.power}% sfc=${base.sfc} (priority=${priority}, ${from}, ${curveStr})`);
    }

    // Where the base came from — mirrors the base-selection logic above (for status display).
    let source: ScheduleSource;
    if (failSafe) {
        source = "failSafe";
    } else if (priority === "outsideOnly") {
        source = window ? "window" : curve ? "curve" : "base";
    } else {
        source = curve ? "curve" : window ? "window" : "base";
    }

    let sfc = base.sfc;
    let power = Math.max(base.power, clampPercent(config.minPower));
    if (trace && config.minPower !== undefined && power !== base.power) {
        trace.push(`minPower floor → ${power}%`);
    }

    // Night protection (research): during the astronomical night, if the water is warm enough, do not
    // let the flow drop below the floor — the oxygen minimum is at night.
    let nightProtected = false;
    const np = config.nightProtection;
    if (np?.enabled && isAstroDay(astro, nowMin) === false) {
        const temp = config.curve?.source ? sources[config.curve.source] : undefined;
        const warmEnough = temp === undefined || !Number.isFinite(temp) || temp >= (np.minWaterTemp ?? 18);
        if (warmEnough) {
            const before = power;
            power = Math.max(power, np.floorPower === undefined ? 100 : clampPercent(np.floorPower));
            nightProtected = true; // protection is in effect (holding the floor), whether or not it raised
            if (trace) {
                trace.push(
                    `night protection active (temp=${temp ?? "n/a"} ≥ ${np.minWaterTemp ?? 18}): ${before}% → ${power}%`,
                );
            }
        } else if (trace) {
            trace.push(`night protection skipped (temp=${temp} < ${np.minWaterTemp ?? 18})`);
        }
    }

    // Weather rules: only raise / hold / toggle SFC / write actuators. All matching rules combine.
    let hold = false;
    let raised = false;
    const actuators: ActuatorWrite[] = [];
    for (const rule of config.rules ?? []) {
        const value = sources[rule.source];
        if (value === undefined || !Number.isFinite(value) || !compareValue(value, rule.cmp, rule.threshold)) {
            continue;
        }
        if (trace) {
            trace.push(`rule ${rule.source} ${rule.cmp} ${rule.threshold} (=${value}) → ${rule.effect}`);
        }
        switch (rule.effect) {
            case "raisePower": {
                const raisedTo = clampPercent(rule.power ?? 100);
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
                    actuators.push({ target: rule.target, value: rule.value ?? true });
                }
                break;
        }
    }

    // "actuator" windows drive external states independently of the pump power/SFC decision.
    const windowActuators = actuatorWrites(config.plans, nowMin, astro);
    actuators.push(...windowActuators);
    if (trace && windowActuators.length) {
        trace.push(`actuator windows: ${windowActuators.map(a => `${a.target}=${a.value}`).join(", ")}`);
    }

    // maxPower is a hard ceiling applied last — it caps the curve, every raise/boost and the fail-safe.
    const maxPower = config.maxPower === undefined ? 100 : clampPercent(config.maxPower);
    if (trace && power > maxPower) {
        trace.push(`maxPower cap ${maxPower}% (was ${power}%)`);
    }
    power = Math.min(power, maxPower);

    // A frost "hold" freezes the pump — but an explicit raise/boost still wins (raising is the safe error).
    const frozen = hold && !raised;
    const finalPower = frozen ? "hold" : power;
    if (trace) {
        trace.push(`→ power=${finalPower} sfc=${sfc}${failSafe ? " FAIL-SAFE" : ""}`);
    }
    return { sfc, power: finalPower, actuators, failSafe, source, raised, nightProtected, hold: frozen };
}

/**
 * Move `current` towards `target` by at most `maxStep` (rate limiting / ramping). A maxStep of 0 (or
 * negative) disables ramping and returns the target directly.
 *
 * @param current - the current value
 * @param target - the desired value
 * @param maxStep - the maximum absolute change allowed this step
 */
export function rampTowards(current: number, target: number, maxStep: number): number {
    if (!(maxStep > 0)) {
        return target;
    }
    const delta = target - current;
    if (Math.abs(delta) <= maxStep) {
        return target;
    }
    return current + Math.sign(delta) * maxStep;
}

/**
 * One step of an exponential moving average approximating a rolling mean with time constant `tauMs`.
 * A tau of 0 (or negative) disables smoothing and returns the raw value.
 *
 * @param prev - the previous smoothed value
 * @param raw - the new raw sample
 * @param dtMs - milliseconds since the previous sample
 * @param tauMs - the smoothing time constant in milliseconds
 */
export function updateEma(prev: number, raw: number, dtMs: number, tauMs: number): number {
    if (!(tauMs > 0) || !(dtMs > 0)) {
        return raw;
    }
    const alpha = 1 - Math.exp(-dtMs / tauMs);
    return prev + alpha * (raw - prev);
}

/**
 * Minutes until the pump's target next changes (i.e. until the next window boundary), 1..1440.
 * When there are no windows the target never changes within a day, so this returns a full day.
 *
 * @param plans - the pump's schedule windows
 * @param nowMin - current minute-of-day (0..1439)
 * @param astro - resolved astro times for the day (for sunrise/sunset window bounds)
 */
export function minutesUntilNextChange(plans: PumpSchedule[], nowMin: number, astro: AstroTimes = NO_ASTRO): number {
    const boundaries = new Set<number>();
    for (const plan of plans) {
        const start = resolveBound(plan.startMode, plan.start, plan.startOffset, astro);
        const end = resolveBound(plan.endMode, plan.end, plan.endOffset, astro);
        if (start !== null) {
            boundaries.add(start);
        }
        if (end !== null) {
            boundaries.add(end);
        }
    }
    let best = MINUTES_PER_DAY;
    for (const boundary of boundaries) {
        const delta = (((boundary - nowMin) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
        const untilNext = delta === 0 ? MINUTES_PER_DAY : delta;
        if (untilNext < best) {
            best = untilNext;
        }
    }
    return best;
}
