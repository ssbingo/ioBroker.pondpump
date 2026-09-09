import { expect } from "chai";
import {
    activeWindow,
    collectSourceOids,
    compareValue,
    decideTarget,
    DEFAULT_CURVE_POINTS,
    interpolateCurve,
    minutesUntilNextChange,
    parseHhmm,
    type PumpSchedule,
    type PumpScheduleConfig,
    rampTowards,
    updateEma,
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

    describe("decideTarget (time windows only)", () => {
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
            expect(decideTarget(config, at(3))).to.deep.equal({
                sfc: false,
                power: 25,
                actuators: [],
                failSafe: false,
            });
            expect(decideTarget(config, at(19))).to.include({ sfc: false, power: 25 });
        });
        it("applies a power window (forcing SFC off)", () => {
            expect(decideTarget(config, at(7))).to.include({ sfc: false, power: 80 });
        });
        it("applies an SFC-on window (power stays at base)", () => {
            expect(decideTarget(config, at(12))).to.include({ sfc: true, power: 25 });
        });
        it("applies an SFC-off window (SFC off, base power)", () => {
            expect(decideTarget(config, at(21))).to.include({ sfc: false, power: 25 });
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
 * A minimal enabled config with the given Phase-11/12 extras.
 *
 * @param extra - the curve/rules/priority/… fields to merge in
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

    describe("decideTarget — curve, priority, Q_min, fail-safe", () => {
        it("uses the curve as the base and clamps up to minPower", () => {
            const c = cfg({
                minPower: 40,
                curve: {
                    enabled: true,
                    source: TEMP,
                    points: [
                        { temp: 4, power: 20 },
                        { temp: 20, power: 100 },
                    ],
                },
            });
            expect(decideTarget(c, at(12), { [TEMP]: 4 }).power).to.equal(40); // curve 20 → Q_min 40
            expect(decideTarget(c, at(12), { [TEMP]: 20 }).power).to.equal(100);
        });
        it("override: the curve beats the active window; outsideOnly: the window wins while active", () => {
            const plan: PumpSchedule = { start: "08:00", end: "20:00", mode: "power", power: 70 };
            const curve = {
                enabled: true,
                source: TEMP,
                points: [
                    { temp: 0, power: 30 },
                    { temp: 30, power: 90 },
                ],
            }; // slope 2 → 15 °C = 60 %
            const ov = cfg({ plans: [plan], conditionPriority: "override", curve });
            expect(decideTarget(ov, at(12), { [TEMP]: 15 }).power).to.equal(60); // curve overrides window
            const oo = cfg({ plans: [plan], conditionPriority: "outsideOnly", curve });
            expect(decideTarget(oo, at(12), { [TEMP]: 15 }).power).to.equal(70); // window wins inside
            expect(decideTarget(oo, at(6), { [TEMP]: 15 }).power).to.equal(60); // curve applies outside
        });
        it("fails safe to 100 % when the curve source is missing", () => {
            const c = cfg({
                curve: {
                    enabled: true,
                    source: TEMP,
                    points: [
                        { temp: 0, power: 20 },
                        { temp: 30, power: 100 },
                    ],
                },
            });
            const d = decideTarget(c, at(12), {});
            expect(d.power).to.equal(100);
            expect(d.failSafe).to.equal(true);
        });
    });

    describe("decideTarget — weather rules only raise / hold / act", () => {
        const curve = {
            enabled: true,
            source: TEMP,
            points: [
                { temp: 0, power: 30 },
                { temp: 30, power: 90 },
            ],
        }; // slope 2 → 10 °C = 50 %
        it("raisePower/boostMax only raise, never lower", () => {
            const c = cfg({
                curve,
                rules: [
                    { source: RAIN, cmp: "eq", threshold: 1, effect: "raisePower", power: 70 },
                    { source: TEMP, cmp: "gte", threshold: 25, effect: "boostMax" },
                ],
            });
            expect(decideTarget(c, at(12), { [TEMP]: 10, [RAIN]: 1 }).power).to.equal(70); // 50 → raised to 70
            expect(decideTarget(c, at(12), { [TEMP]: 10, [RAIN]: 0 }).power).to.equal(50); // rule inactive
            expect(decideTarget(c, at(12), { [TEMP]: 26 }).power).to.equal(100); // boostMax
        });
        it("hold freezes the pump, but an explicit raise wins over hold", () => {
            const c = cfg({ curve, rules: [{ source: TEMP, cmp: "lt", threshold: 2, effect: "hold" }] });
            expect(decideTarget(c, at(12), { [TEMP]: 1 }).power).to.equal("hold");
            const c2 = cfg({
                curve,
                rules: [
                    { source: TEMP, cmp: "lt", threshold: 2, effect: "hold" },
                    { source: RAIN, cmp: "eq", threshold: 1, effect: "boostMax" },
                ],
            });
            expect(decideTarget(c2, at(12), { [TEMP]: 1, [RAIN]: 1 }).power).to.equal(100);
        });
        it("setState emits actuator writes; sfc toggles SFC", () => {
            const AER = "sonoff.0.aerator";
            const c = cfg({
                rules: [
                    { source: TEMP, cmp: "gte", threshold: 25, effect: "setState", target: AER, value: true },
                    { source: TEMP, cmp: "lt", threshold: 10, effect: "sfc", sfc: true },
                ],
            });
            expect(decideTarget(c, at(12), { [TEMP]: 26 }).actuators).to.deep.equal([{ target: AER, value: true }]);
            expect(decideTarget(c, at(12), { [TEMP]: 20 }).actuators).to.deep.equal([]);
            expect(decideTarget(c, at(12), { [TEMP]: 5 }).sfc).to.equal(true);
        });
    });

    describe("rampTowards", () => {
        it("limits the step, passes through within range, disables at 0", () => {
            expect(rampTowards(50, 80, 10)).to.equal(60);
            expect(rampTowards(50, 20, 10)).to.equal(40);
            expect(rampTowards(50, 55, 10)).to.equal(55);
            expect(rampTowards(50, 80, 0)).to.equal(80);
        });
    });

    describe("updateEma", () => {
        it("returns raw when tau or dt is 0, and smooths in between otherwise", () => {
            expect(updateEma(10, 20, 1000, 0)).to.equal(20);
            expect(updateEma(10, 20, 0, 1000)).to.equal(20);
            const s = updateEma(10, 20, 1000, 1000);
            expect(s).to.be.greaterThan(10);
            expect(s).to.be.lessThan(20);
        });
    });

    describe("DEFAULT_CURVE_POINTS", () => {
        it("is the research Q10 curve (clamped at 17 °C → 100 %, 8 °C → 54 %)", () => {
            expect(interpolateCurve(DEFAULT_CURVE_POINTS, 17)).to.equal(100);
            expect(interpolateCurve(DEFAULT_CURVE_POINTS, 25)).to.equal(100);
            expect(interpolateCurve(DEFAULT_CURVE_POINTS, 8)).to.equal(54);
        });
    });

    describe("collectSourceOids", () => {
        it("collects distinct INPUT ids from the curve and rules, not setState targets", () => {
            const AER = "sonoff.0.aerator";
            const c = cfg({
                curve: { enabled: true, source: TEMP, points: [] },
                rules: [
                    { source: RAIN, cmp: "eq", threshold: 1, effect: "raisePower", power: 40 },
                    { source: TEMP, cmp: "gt", threshold: 26, effect: "setState", target: AER, value: true },
                ],
            });
            expect(collectSourceOids(c).sort()).to.deep.equal([RAIN, TEMP].sort()); // AER is an output
        });
        it("skips a disabled curve", () => {
            const c = cfg({ curve: { enabled: false, source: TEMP, points: [] } });
            expect(collectSourceOids(c)).to.deep.equal([]);
        });
    });
});
