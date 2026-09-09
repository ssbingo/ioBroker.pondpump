/*
 * Astro helpers (Phase 13): sunrise/sunset computation and location resolution for the scheduler.
 *
 * The suncalc call itself is a thin wrapper; the resolution/parsing helpers are pure and unit-tested.
 * Sunrise/sunset are returned as minutes-of-day in the host's LOCAL timezone, to match the scheduler's
 * `nowMin` (which is also local). A polar day/night (suncalc returns an invalid Date) yields null, so
 * astro windows are simply skipped there.
 */

import SunCalc from "suncalc";

import { type AstroTimes } from "./schedule";

/** A geographic coordinate. */
export interface Coordinates {
    /** Latitude in degrees. */
    lat: number;
    /** Longitude in degrees. */
    lon: number;
}

/**
 * How the pond's location is chosen:
 * - "system": use the ioBroker system coordinates (`system.config` common.latitude/longitude).
 * - "shared": one location for the whole instance (the adapter's own latitude/longitude).
 * - "individual": each pump decides (its own coordinates, else the system location).
 */
export type LocationMode = "system" | "shared" | "individual";

/**
 * Convert a Date to minutes-of-day in the host's local timezone, or null for an invalid/absent date.
 *
 * @param d - the date (suncalc returns an Invalid Date for polar day/night)
 */
export function dateToLocalMinutes(d: Date | undefined | null): number | null {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
        return null;
    }
    return d.getHours() * 60 + d.getMinutes();
}

/**
 * Parse a latitude/longitude value (string or number, comma or dot decimal) to a finite number in
 * range, or null when absent/invalid.
 *
 * @param value - the raw coordinate value
 * @param max - the absolute bound (90 for latitude, 180 for longitude)
 */
export function parseCoord(value: unknown, max: 90 | 180): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) && Math.abs(value) <= max ? value : null;
    }
    if (typeof value !== "string" || value.trim() === "") {
        return null;
    }
    const n = parseFloat(value.replace(",", ".").trim());
    return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

/**
 * Build a valid {@link Coordinates} from raw lat/lon inputs, or null when either is missing/invalid.
 *
 * @param lat - raw latitude
 * @param lon - raw longitude
 */
export function toCoordinates(lat: unknown, lon: unknown): Coordinates | null {
    const la = parseCoord(lat, 90);
    const lo = parseCoord(lon, 180);
    return la === null || lo === null ? null : { lat: la, lon: lo };
}

/** Per-pump location inputs used to resolve coordinates in "individual" mode. */
export interface PumpLocation {
    /** "system" (use the system/instance location) or "specific" (this pump's own coordinates). */
    coordinateSource?: "system" | "specific";
    /** This pump's latitude when `coordinateSource` is "specific". */
    latitude?: string | number;
    /** This pump's longitude when `coordinateSource` is "specific". */
    longitude?: string | number;
}

/**
 * Resolve the coordinates for one pump given the instance location mode and the available sources.
 * Returns null when nothing usable is configured (astro windows then stay inactive for that pump).
 *
 * @param mode - the instance location mode
 * @param systemCoords - coordinates from `system.config`, or null
 * @param sharedCoords - the adapter's own instance coordinates, or null
 * @param pump - the pump's per-pump location inputs (only used in "individual" mode)
 */
export function resolvePumpCoordinates(
    mode: LocationMode,
    systemCoords: Coordinates | null,
    sharedCoords: Coordinates | null,
    pump: PumpLocation = {},
): Coordinates | null {
    if (mode === "shared") {
        return sharedCoords ?? systemCoords;
    }
    if (mode === "individual" && pump.coordinateSource === "specific") {
        return toCoordinates(pump.latitude, pump.longitude) ?? systemCoords;
    }
    return systemCoords;
}

/**
 * Sunrise/sunset for a date+location, as minutes-of-day (local). Both are null in polar day/night.
 *
 * @param date - the day to compute for
 * @param coords - the location
 */
export function astroForDate(date: Date, coords: Coordinates): AstroTimes {
    const t = SunCalc.getTimes(date, coords.lat, coords.lon);
    return { sunriseMin: dateToLocalMinutes(t.sunrise), sunsetMin: dateToLocalMinutes(t.sunset) };
}
