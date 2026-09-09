import { expect } from "chai";
import {
    activeWindow,
    collectSourceOids,
    compareValue,
    evaluateConditions,
    interpolateCurve,
    minutesUntilNextChange,
    parseHhmm,
    type PumpSchedule,
    type PumpScheduleConfig,
    targetForConfig,
    validatePlans,
} from "./schedule";

const at = (hh: number, mm = 0): number => hh * 60 + mm;

describe("schedule core", () => {
    describe("parseHhmm", () => {
        it("parses valid times to minutes-of-day", () => {
            expect(parseHhmm("00:00")).to.equal(0);
            expect(parseHhmm("06:30")).to.equal(390);
            expect(parseHhmm("23:59")).to.equal(1439);
        });
        it("rejects malformed or out-of-range times", () => {
            expect(parseHhmm("24:00")).to.equal(null);
            expect(parseHhmm("6:60")).to.equal(null);
            expect(parseHhmm("noon")).to.equal(null);
            expect(parseHhmm("")).to.equal(null);
            expect(parseHhmm(undefined)).to.equal(null);
        });
    });

    describe("validatePlans", () => {
        it("accepts well-formed, non-overlapping (unsorted) windows", () => {
            const plans: PumpSchedule[] = [
                { start: "18:00", end: "22:00", mode: "power", power: 40 },
                { start: "06:00", end: "10:00", mode: "power", power: 80 },
                { start: "10:00", end: "18:00", mode: "sfc", sfc: true },
            ];
            expect(validatePlans(plans).valid).to.equal(true);
        });
        it("allows a window to end exactly when the next starts (touching, not overlapping)", () => {
            expect(
                validatePlans([
                    { start: "06:00", end: "10:00", mode: "power", power: 50 },
                    { start: "10:00", end: "12:00", mode: "power", power: 60 },
                ]).valid,
            ).to.equal(true);
        });
        it("rejects overlapping windows", () => {
            const res = validatePlans([
                { start: "06:00", end: "10:00", mode: "power", power: 50 },
                { start: "09:00", end: "12:00", mode: "power", power: 60 },
            ]);
            expect(res.valid).to.equal(false);
            expect(res.error).to.match(/overlap/i);
        });
        it("rejects end <= start", () => {
            expect(validatePlans([{ start: "10:00", end: "10:00", mode: "power", power: 50 }]).valid).to.equal(false);
            expect(validatePlans([{ start: "10:00", end: "09:00", mode: "power", power: 50 }]).valid).to.equal(false);
        });
        it("rejects an invalid time and an out-of-range power", () => {
            expect(validatePlans([{ start: "6:70", end: "10:00", mode: "power", power: 50 }]).valid).to.equal(false);
            expect(validatePlans([{ start: "06:00", end: "10:00", mode: "power", power: 150 }]).valid).to.equal(false);
        });
    });

    describe("activeWindow", () => {
        const plans: PumpSchedule[] = [
            { start: "06:00", end: "10:00", mode: "power", power: 80 },
            { start: "10:00", end: "18:00", mode: "sfc", sfc: true },
        ];
        it("is inclusive of the start and exclusive of the end", () => {
            expect(activeWindow(plans, at(6))?.start).to.equal("06:00");
            expect(activeWindow(plans, at(9, 59))?.start).to.equal("06:00");
            expect(activeWindow(plans, at(10))?.start).to.equal("10:00"); // 10:00 belongs to the next window
            expect(activeWindow(plans, at(18))).to.equal(undefined); // end is exclusive
            expect(activeWindow(plans, at(5, 59))).to.equal(undefined);
        });
    });

    describe("targetForConfig", () => {
        const config: PumpScheduleConfig = {
            enabled: true,
            basePower: 25,
            plans: [
                { start: "06:00", end: "10:00", mode: "power", power: 80 },
                { start: "10:00", end: "18:00", mode: "sfc", sfc: true },
                { start: "20:00", end: "22:00", mode: "sfc", sfc: false },
            ],
        };
        it("returns the base power (SFC off) outside every window", () => {
            expect(targetForConfig(config, at(3))).to.deep.equal({ sfc: false, power: 25 });
            expect(targetForConfig(config, at(19))).to.deep.equal({ sfc: false, power: 25 });
        });
        it("applies a power window (forcing SFC off)", () => {
            expect(targetForConfig(config, at(7))).to.deep.equal({ sfc: false, power: 80 });
        });
        it("applies an SFC-on window (power stays at base)", () => {
            expect(targetForConfig(config, at(12))).to.deep.equal({ sfc: true, power: 25 });
        });
        it("applies an SFC-off window (SFC off, base power)", () => {
            expect(targetForConfig(config, at(21))).to.deep.equal({ sfc: false, power: 25 });
        });
    });

    describe("minutesUntilNextChange", () => {
        const plans: PumpSchedule[] = [
            { start: "06:00", end: "10:00", mode: "power", power: 80 },
            { start: "10:00", end: "18:00", mode: "sfc", sfc: true },
        ];
        it("returns minutes to the next boundary", () => {
            expect(minutesUntilNextChange(plans, at(5, 30))).to.equal(30); // -> 06:00
            expect(minutesUntilNextChange(plans, at(6))).to.equal(240); // -> 10:00 (the 06:00 boundary is now)
            expect(minutesUntilNextChange(plans, at(10))).to.equal(480); // -> 18:00
        });
        it("wraps to the next day past the last boundary", () => {
            // last boundary is 18:00 (1080); from 20:00 (1200) -> 06:00 tomorrow = 600 min
            expect(minutesUntilNextChange(plans, at(20))).to.equal(600);
        });
        it("returns a full day when there are no windows", () => {
            expect(minutesUntilNextChange([], at(12))).to.equal(1440);
        });
    });
});

const TEMP = "pondpump.0.pumps.1.telemetry.temperature";
const RAIN = "weather.0.rain";

/**
 * A minimal enabled config with the given Phase-11 extras.
 *
 * @param extra
 */
const cfg = (extra: Partial<PumpScheduleConfig>): PumpScheduleConfig => ({
    enabled: true,
    basePower: 50,
    plans: [],
    ...extra,
});

describe("schedule conditions (Phase 11)", () => {
    describe("compareValue", () => {
        it("evaluates every operator", () => {
            expect(compareValue(5, "lt", 8)).to.equal(true);
            expect(compareValue(8, "lt", 8)).to.equal(false);
            expect(compareValue(8, "lte", 8)).to.equal(true);
            expect(compareValue(9, "gt", 8)).to.equal(true);
            expect(compareValue(8, "gte", 8)).to.equal(true);
            expect(compareValue(1, "eq", 1)).to.equal(true);
            expect(compareValue(1, "ne", 0)).to.equal(true);
        });
    });

    describe("interpolateCurve", () => {
        const pts = [
            { temp: 5, power: 15 },
            { temp: 20, power: 80 },
            { temp: 26, power: 100 },
        ];
        it("clamps below first and above last point", () => {
            expect(interpolateCurve(pts, 0)).to.equal(15);
            expect(interpolateCurve(pts, 30)).to.equal(100);
        });
        it("interpolates linearly between points", () => {
            // midpoint between 5°C/15% and 20°C/80% is 12.5°C → 47.5% → rounded 48
            expect(interpolateCurve(pts, 12.5)).to.equal(48);
        });
        it("returns null for an empty curve and sorts unordered points", () => {
            expect(interpolateCurve([], 10)).to.equal(null);
            expect(
                interpolateCurve(
                    [
                        { temp: 20, power: 80 },
                        { temp: 5, power: 15 },
                    ],
                    5,
                ),
            ).to.equal(15);
        });
    });

    describe("evaluateConditions", () => {
        it("returns undefined when nothing applies", () => {
            expect(evaluateConditions(cfg({}), {})).to.equal(undefined);
        });
        it("applies the first matching rule (rules override the curve)", () => {
            const c = cfg({
                curve: {
                    enabled: true,
                    source: TEMP,
                    points: [
                        { temp: 0, power: 30 },
                        { temp: 30, power: 100 },
                    ],
                },
                rules: [{ source: TEMP, cmp: "lt", threshold: 4, effect: "off" }],
            });
            // 2°C matches the frost rule → off, even though the curve is enabled
            expect(evaluateConditions(c, { [TEMP]: 2 })).to.deep.equal({ sfc: false, power: 0 });
        });
        it("falls back to the curve when no rule matches", () => {
            const c = cfg({
                curve: {
                    enabled: true,
                    source: TEMP,
                    points: [
                        { temp: 10, power: 40 },
                        { temp: 20, power: 80 },
                    ],
                },
                rules: [{ source: TEMP, cmp: "lt", threshold: 4, effect: "off" }],
            });
            expect(evaluateConditions(c, { [TEMP]: 15 })).to.deep.equal({ sfc: false, power: 60 });
        });
        it("supports boolean weather sources (1/0) and sfc/power effects", () => {
            const c = cfg({ rules: [{ source: RAIN, cmp: "eq", threshold: 1, effect: "power", power: 40 }] });
            expect(evaluateConditions(c, { [RAIN]: 1 })).to.deep.equal({ sfc: false, power: 40 });
            expect(evaluateConditions(c, { [RAIN]: 0 })).to.equal(undefined);
        });
        it("ignores rules whose source value is missing", () => {
            const c = cfg({ rules: [{ source: TEMP, cmp: "lt", threshold: 4, effect: "off" }] });
            expect(evaluateConditions(c, {})).to.equal(undefined);
        });
    });

    describe("targetForConfig with conditions", () => {
        const windowPlan: PumpSchedule = { start: "08:00", end: "20:00", mode: "power", power: 70 };
        it("with empty sources equals the pre-Phase-11 window behaviour", () => {
            const c = cfg({ plans: [windowPlan] });
            expect(targetForConfig(c, 12 * 60)).to.deep.equal({ sfc: false, power: 70 });
            expect(targetForConfig(c, 6 * 60)).to.deep.equal({ sfc: false, power: 50 });
        });
        it("override: a matching rule beats the active window", () => {
            const c = cfg({
                plans: [windowPlan],
                conditionPriority: "override",
                rules: [{ source: TEMP, cmp: "lt", threshold: 4, effect: "off" }],
            });
            expect(targetForConfig(c, 12 * 60, { [TEMP]: 2 })).to.deep.equal({ sfc: false, power: 0 });
            expect(targetForConfig(c, 12 * 60, { [TEMP]: 10 })).to.deep.equal({ sfc: false, power: 70 });
        });
        it("outsideOnly: the window wins while active, conditions apply only outside", () => {
            const c = cfg({
                plans: [windowPlan],
                conditionPriority: "outsideOnly",
                rules: [{ source: TEMP, cmp: "lt", threshold: 4, effect: "off" }],
            });
            // inside the window (12:00): window wins despite the frost rule
            expect(targetForConfig(c, 12 * 60, { [TEMP]: 2 })).to.deep.equal({ sfc: false, power: 70 });
            // outside the window (06:00): the frost rule applies
            expect(targetForConfig(c, 6 * 60, { [TEMP]: 2 })).to.deep.equal({ sfc: false, power: 0 });
        });
    });

    describe("collectSourceOids", () => {
        it("collects distinct source ids from the curve and rules", () => {
            const c = cfg({
                curve: { enabled: true, source: TEMP, points: [] },
                rules: [
                    { source: RAIN, cmp: "eq", threshold: 1, effect: "power", power: 40 },
                    { source: TEMP, cmp: "gt", threshold: 26, effect: "sfc", sfc: true },
                ],
            });
            expect(collectSourceOids(c).sort()).to.deep.equal([RAIN, TEMP].sort());
        });
        it("skips a disabled curve", () => {
            const c = cfg({ curve: { enabled: false, source: TEMP, points: [] } });
            expect(collectSourceOids(c)).to.deep.equal([]);
        });
    });
});
