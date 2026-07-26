import { expect } from "chai";
import {
    activeWindow,
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
