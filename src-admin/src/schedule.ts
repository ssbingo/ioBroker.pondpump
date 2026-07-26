/*
 * Per-pump scheduling core (Phase 9) — FRONTEND COPY of src/lib/schedule.ts (keep in sync).
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

/** Scheduling configuration for a single pump. */
export interface PumpScheduleConfig {
    /** Whether scheduling is active for this pump. */
    enabled: boolean;
    /** Power % applied whenever no window is active (the base / default). */
    basePower: number;
    /** The (non-overlapping) time windows, in any order. */
    plans: PumpSchedule[];
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
 * The control target the scheduler wants at `nowMin`: the active window's value, or the base power
 * (with SFC off) when no window is active. A "power" window forces SFC off; an "sfc" window keeps the
 * base power (which only matters while SFC is off).
 *
 * @param config - the pump's scheduling configuration
 * @param nowMin - current minute-of-day (0..1439)
 */
export function targetForConfig(config: PumpScheduleConfig, nowMin: number): ScheduleTarget {
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
