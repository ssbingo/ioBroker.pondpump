/*
 * Per-pump scheduling core (Phase 9).
 *
 * Pure, side-effect-free logic shared by the backend scheduler (main.ts) and the admin scheduler
 * component. A pump has an ordered set of non-overlapping daily time windows; each window sets either
 * a power % or switches SFC. Outside every window the pump falls back to a configurable base power.
 *
 * Times are daily "HH:MM" (no date, no midnight crossing — split into two windows for that). All
 * internal maths use minutes-of-day (0..1439).
 */

/** Whether a schedule window sets a power % or switches Seasonal Flow Control. */
export type ScheduleMode = "power" | "sfc";

/** One daily time window for a pump. */
export interface PumpSchedule {
    /** Window start, "HH:MM" (00:00..23:59). */
    start: string;
    /** Window end, "HH:MM"; must be strictly after `start` (no midnight crossing). */
    end: string;
    /** Whether the window sets a power % ("power") or switches SFC ("sfc"). */
    mode: ScheduleMode;
    /** Target power in % (0..100) when `mode` is "power". */
    power?: number;
    /** Target SFC state when `mode` is "sfc". */
    sfc?: boolean;
}

/** Comparison operator for a condition rule (source value vs. threshold). */
export type Comparison = "lt" | "lte" | "gt" | "gte" | "eq" | "ne";

/** What a triggered condition applies to the pump. */
export type ConditionEffectType = "power" | "sfc" | "off";

/**
 * A single threshold rule (Phase 11). When the value read from `source` satisfies `cmp threshold`,
 * the rule's effect is applied. Booleans are read as 1/0. Rules are evaluated top-down; the first
 * matching rule wins and overrides the temperature curve.
 */
export interface ConditionRule {
    /** ioBroker state id to read (pump's own `telemetry.temperature`, or an external weather OID). */
    source: string;
    /** Comparison operator. */
    cmp: Comparison;
    /** Threshold the source value is compared against. */
    threshold: number;
    /** What to do while the rule holds. */
    effect: ConditionEffectType;
    /** Target power % (0..100) when `effect` is "power". */
    power?: number;
    /** Target SFC state when `effect` is "sfc". */
    sfc?: boolean;
}

/** One point of the temperature→power curve. */
export interface CurvePoint {
    /** Temperature in °C. */
    temp: number;
    /** Power % (0..100) at that temperature. */
    power: number;
}

/** Temperature-driven power curve (Phase 11). Power is linearly interpolated between points. */
export interface TempCurve {
    /** Whether the curve is active. */
    enabled: boolean;
    /** State id providing the temperature (default: the pump's own `telemetry.temperature`). */
    source: string;
    /** Interpolation points; any order (sorted internally by temperature). */
    points: CurvePoint[];
}

/**
 * How the temperature/weather conditions relate to the time windows:
 * - "override": a matching condition (rule or active curve) overrides the current time window.
 * - "outsideOnly": conditions apply only when no time window is active (they replace the base power).
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
    /** Phase 11 — temperature→power curve. */
    curve?: TempCurve;
    /** Phase 11 — threshold rules (temperature/weather), evaluated before the curve. */
    rules?: ConditionRule[];
    /** Phase 11 — how conditions relate to the time windows. Default "override". */
    conditionPriority?: ConditionPriority;
}

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
                error: `Schedules ${windows[k - 1].index + 1} and ${windows[k].index + 1} overlap`,
            };
        }
    }
    return { valid: true };
}

/**
 * The window active at `nowMin`, or undefined if none. Malformed windows are ignored.
 *
 * @param plans - the pump's schedule windows
 * @param nowMin - current minute-of-day (0..1439)
 */
export function activeWindow(plans: PumpSchedule[], nowMin: number): PumpSchedule | undefined {
    for (const plan of plans) {
        const start = parseHhmm(plan.start);
        const end = parseHhmm(plan.end);
        if (start !== null && end !== null && end > start && nowMin >= start && nowMin < end) {
            return plan;
        }
    }
    return undefined;
}

/**
 * Compare a numeric value against a threshold with the given operator.
 *
 * @param value
 * @param cmp
 * @param threshold
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
 * Turn a rule's effect into a control target, given the pump's base power.
 *
 * @param rule
 * @param basePower
 */
function effectTarget(rule: ConditionRule, basePower: number): ScheduleTarget {
    if (rule.effect === "sfc") {
        return { sfc: rule.sfc === true, power: basePower };
    }
    if (rule.effect === "off") {
        return { sfc: false, power: 0 };
    }
    return { sfc: false, power: clampPercent(rule.power ?? basePower) };
}

/**
 * Evaluate the temperature/weather conditions (Phase 11): the first matching threshold rule wins;
 * otherwise, if the curve is enabled and its source value is present, the interpolated curve power.
 * Returns undefined when nothing applies. Booleans in `sources` are read as 1/0.
 *
 * @param config - the pump's scheduling configuration
 * @param sources - current numeric values keyed by state id (booleans as 1/0)
 */
export function evaluateConditions(
    config: PumpScheduleConfig,
    sources: Record<string, number>,
): ScheduleTarget | undefined {
    const basePower = clampPercent(config.basePower);
    for (const rule of config.rules ?? []) {
        const value = sources[rule.source];
        if (value !== undefined && Number.isFinite(value) && compareValue(value, rule.cmp, rule.threshold)) {
            return effectTarget(rule, basePower);
        }
    }
    if (config.curve?.enabled) {
        const temp = sources[config.curve.source];
        if (temp !== undefined && Number.isFinite(temp)) {
            const power = interpolateCurve(config.curve.points ?? [], temp);
            if (power !== null) {
                return { sfc: false, power };
            }
        }
    }
    return undefined;
}

/**
 * All distinct state ids the config reads for its conditions (for the backend to subscribe/read).
 *
 * @param config
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
 * The control target from the time windows alone (the pre-Phase-11 behaviour).
 *
 * @param config
 * @param nowMin
 */
function windowTarget(config: PumpScheduleConfig, nowMin: number): ScheduleTarget {
    const basePower = clampPercent(config.basePower);
    const window = activeWindow(config.plans, nowMin);
    if (!window) {
        return { sfc: false, power: basePower };
    }
    if (window.mode === "sfc") {
        return { sfc: window.sfc === true, power: basePower };
    }
    return { sfc: false, power: clampPercent(window.power ?? basePower) };
}

/**
 * The control target the scheduler wants at `nowMin`, combining the time windows with the Phase-11
 * temperature/weather conditions:
 * - "override" (default): a matching condition (rule or active curve) overrides the time window.
 * - "outsideOnly": the time window wins while active; conditions apply only when no window is active.
 *
 * With an empty `sources` map no condition applies, so the result equals the pre-Phase-11 behaviour.
 *
 * @param config - the pump's scheduling configuration
 * @param nowMin - current minute-of-day (0..1439)
 * @param sources - current numeric values of the referenced state ids (booleans as 1/0)
 */
export function targetForConfig(
    config: PumpScheduleConfig,
    nowMin: number,
    sources: Record<string, number> = {},
): ScheduleTarget {
    const window = activeWindow(config.plans, nowMin);
    const conditionTarget = evaluateConditions(config, sources);
    const priority = config.conditionPriority ?? "override";

    if (priority === "outsideOnly") {
        if (window) {
            return windowTarget(config, nowMin);
        }
        return conditionTarget ?? { sfc: false, power: clampPercent(config.basePower) };
    }
    // "override": conditions beat the window when they apply
    return conditionTarget ?? windowTarget(config, nowMin);
}

/**
 * Minutes until the pump's target next changes (i.e. until the next window boundary), 1..1440.
 * When there are no windows the target never changes within a day, so this returns a full day.
 *
 * @param plans - the pump's schedule windows
 * @param nowMin - current minute-of-day (0..1439)
 */
export function minutesUntilNextChange(plans: PumpSchedule[], nowMin: number): number {
    const boundaries = new Set<number>();
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
        const delta = (((boundary - nowMin) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
        const untilNext = delta === 0 ? MINUTES_PER_DAY : delta;
        if (untilNext < best) {
            best = untilNext;
        }
    }
    return best;
}
