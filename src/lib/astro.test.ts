import { expect } from "chai";
import { astroForDate, dateToLocalMinutes, parseCoord, resolvePumpCoordinates, toCoordinates } from "./astro";

describe("astro helpers", () => {
    describe("parseCoord", () => {
        it("parses numbers and dot/comma strings within range", () => {
            expect(parseCoord(51.5, 90)).to.equal(51.5);
            expect(parseCoord("10,45", 180)).to.equal(10.45);
            expect(parseCoord(" -0.13 ", 180)).to.equal(-0.13);
        });
        it("rejects empty, non-numeric and out-of-range values", () => {
            expect(parseCoord("", 90)).to.equal(null);
            expect(parseCoord(undefined, 90)).to.equal(null);
            expect(parseCoord("abc", 90)).to.equal(null);
            expect(parseCoord(91, 90)).to.equal(null); // latitude bound
            expect(parseCoord(200, 180)).to.equal(null); // longitude bound
        });
    });

    describe("toCoordinates", () => {
        it("builds a coordinate only when both values are valid", () => {
            expect(toCoordinates("51.5", "10")).to.deep.equal({ lat: 51.5, lon: 10 });
            expect(toCoordinates("51.5", "")).to.equal(null);
            expect(toCoordinates("", "10")).to.equal(null);
        });
    });

    describe("resolvePumpCoordinates", () => {
        const sys = { lat: 51, lon: 10 };
        const shared = { lat: 48, lon: 9 };
        it("shared → instance coords (system fallback)", () => {
            expect(resolvePumpCoordinates("shared", sys, shared)).to.deep.equal(shared);
            expect(resolvePumpCoordinates("shared", sys, null)).to.deep.equal(sys);
        });
        it("system → always system coords", () => {
            expect(
                resolvePumpCoordinates("system", sys, shared, {
                    coordinateSource: "specific",
                    latitude: 40,
                    longitude: 5,
                }),
            ).to.deep.equal(sys);
        });
        it("individual → pump coords when 'specific', else system", () => {
            expect(
                resolvePumpCoordinates("individual", sys, shared, {
                    coordinateSource: "specific",
                    latitude: "40",
                    longitude: "5",
                }),
            ).to.deep.equal({ lat: 40, lon: 5 });
            expect(resolvePumpCoordinates("individual", sys, shared, { coordinateSource: "system" })).to.deep.equal(
                sys,
            );
            // 'specific' but invalid coords → system fallback
            expect(
                resolvePumpCoordinates("individual", sys, shared, {
                    coordinateSource: "specific",
                    latitude: "",
                    longitude: "",
                }),
            ).to.deep.equal(sys);
        });
        it("returns null when nothing usable is configured", () => {
            expect(resolvePumpCoordinates("system", null, null)).to.equal(null);
        });
    });

    describe("dateToLocalMinutes", () => {
        it("returns local minutes-of-day, null for invalid", () => {
            const d = new Date(2026, 5, 21, 6, 30, 0);
            expect(dateToLocalMinutes(d)).to.equal(6 * 60 + 30);
            expect(dateToLocalMinutes(new Date(NaN))).to.equal(null);
            expect(dateToLocalMinutes(undefined)).to.equal(null);
        });
    });

    describe("astroForDate", () => {
        it("computes a plausible sunrise before sunset at a mid-latitude summer day", () => {
            const a = astroForDate(new Date(2026, 5, 21, 12, 0, 0), { lat: 51.16, lon: 10.45 });
            expect(a.sunriseMin).to.be.a("number");
            expect(a.sunsetMin).to.be.a("number");
            expect(a.sunriseMin).to.be.lessThan(a.sunsetMin as number);
        });
    });
});
