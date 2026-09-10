import React from "react";

/**
 * Shared SVG graphics for the pondpump widgets: the animated impeller and a compact, colour-coded
 * water-temperature thermometer. Kept in one place so PumpVisual and PumpScheduler stay in sync.
 */

/** Darken a "#rrggbb" colour by factor `f` (0..1) — used to derive an impeller's outer gradient stop. */
export function darken(hex: string, f = 0.55): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) {
        return hex;
    }
    const n = parseInt(m[1], 16);
    const r = Math.round(((n >> 16) & 255) * f);
    const g = Math.round(((n >> 8) & 255) * f);
    const b = Math.round((n & 255) * f);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Water-temperature colour keyed to the **koi biology bands** from the research
 * (doc/research/wassertemperaturen-im-koiteich.md), not a neutral cold→warm gradient. The growth
 * optimum (23–26 °C) is the strongest green; the cold **8–13 °C "Aeromonas window"** — where
 * pathogens are active but the koi immune system is not — is deliberately flagged amber (caution),
 * even though it is cold. Both temperature extremes go red.
 *
 * Bands: <2 life-threatening · 2–4 borderline · 4–8 winter rest · 8–13 Aeromonas window (caution) ·
 * 13–17 transition · 17–23 normal · 23–26 growth optimum · 26–28 upper normal · 28–30 heat stress ·
 * ≥30 danger.
 *
 * @param t - water temperature in °C
 */
export function tempColor(t: number): string {
    if (t < 2) {
        return "#f0645a"; // life-threatening cold
    }
    if (t < 4) {
        return "#ff8c42"; // borderline (cold safety margin)
    }
    if (t < 8) {
        return "#4aa8ff"; // winter rest (the wintering target band)
    }
    if (t < 13) {
        return "#ffca3a"; // Aeromonas window — pathogens active, immune system not → caution
    }
    if (t < 17) {
        return "#35c4c4"; // transition
    }
    if (t < 23) {
        return "#8ed081"; // normal range
    }
    if (t < 26) {
        return "#3fbf5a"; // growth optimum (ideal, 23–26 °C)
    }
    if (t < 28) {
        return "#8ed081"; // upper normal range
    }
    if (t < 30) {
        return "#ff8c42"; // heat stress (oxygen limiting)
    }
    return "#f0645a"; // danger — dangerously warm, low oxygen
}

/**
 * The pump impeller. Rotates when `spin` is true (CSS animation, duration `dur` seconds); an off pump
 * can draw a red cross via `crossed`.
 *
 * @param spin - whether the impeller should rotate
 * @param dur - rotation duration in seconds (0 = standstill)
 * @param accent - blade accent colour (gradient centre)
 * @param crossed - draw a red "off" cross over the impeller
 * @param endColor - blade gradient outer colour (default a deep blue)
 */
export function renderImpeller(
    spin: boolean,
    dur: number,
    accent: string,
    crossed = false,
    endColor = "#1b6fb0",
): React.JSX.Element {
    const blade = "M60 47 C 50 43 48 29 54 15 C 57 11 63 11 66 15 C 72 29 70 43 60 47 Z";
    const spinning = spin && dur > 0;
    const style = spinning ? ({ ["--pp-dur"]: `${dur}s` } as React.CSSProperties) : undefined;
    // Unique gradient id per colour pair — otherwise several impellers on one card (hero + actuators)
    // would all reuse the first "ppBlade" definition in the DOM and share its colour.
    const gradId = `ppBlade_${accent.replace(/[^a-z0-9]/gi, "")}_${endColor.replace(/[^a-z0-9]/gi, "")}`;
    return (
        <svg
            viewBox="0 0 120 120"
            role="img"
        >
            <defs>
                <radialGradient
                    id={gradId}
                    cx="0.5"
                    cy="0.35"
                    r="0.75"
                >
                    <stop
                        offset="0"
                        stopColor={accent}
                    />
                    <stop
                        offset="1"
                        stopColor={endColor}
                    />
                </radialGradient>
            </defs>
            <circle
                cx="60"
                cy="60"
                r="52"
                fill="rgba(255,255,255,.04)"
                stroke="rgba(255,255,255,.08)"
                strokeWidth="2"
            />
            <g
                className={spinning ? "pp-spin" : undefined}
                style={style}
            >
                {[0, 60, 120, 180, 240, 300].map(a => (
                    <path
                        key={a}
                        d={blade}
                        transform={`rotate(${a} 60 60)`}
                        fill={`url(#${gradId})`}
                        stroke="rgba(0,0,0,.25)"
                        strokeWidth="1"
                    />
                ))}
                <circle
                    cx="60"
                    cy="60"
                    r="13"
                    fill="#cfe8ff"
                />
                <circle
                    cx="60"
                    cy="60"
                    r="6"
                    fill="#7fb4e0"
                />
            </g>
            {crossed ? (
                <g className="pp-crossmark">
                    <line
                        x1="28"
                        y1="28"
                        x2="92"
                        y2="92"
                    />
                    <line
                        x1="92"
                        y1="28"
                        x2="28"
                        y2="92"
                    />
                </g>
            ) : null}
        </svg>
    );
}

/**
 * A compact, sleek water-temperature thermometer: a slim rounded tube on a subtle track with a bulb,
 * the mercury level and colour reflecting the temperature on a 0–30 °C scale.
 *
 * @param tempC - the water temperature in °C
 */
export function renderThermometer(tempC: number): React.JSX.Element {
    const frac = Math.max(0, Math.min(1, tempC / 30));
    const color = tempColor(tempC);
    const top = 8;
    const bottom = 58;
    const fillTop = bottom - frac * (bottom - top);
    return (
        <svg
            className="pp-thermo-svg"
            viewBox="0 0 24 84"
            role="img"
            aria-label="water temperature"
        >
            {/* subtle track + bulb ring */}
            <rect
                x="8"
                y="4"
                width="8"
                height="60"
                rx="4"
                fill="rgba(255,255,255,.12)"
            />
            <circle
                cx="12"
                cy="72"
                r="9"
                fill="rgba(255,255,255,.12)"
            />
            {/* mercury: bulb + stem up to the level */}
            <circle
                cx="12"
                cy="72"
                r="6.5"
                fill={color}
            />
            <rect
                x="9.5"
                y={fillTop}
                width="5"
                height={72 - fillTop}
                rx="2.5"
                fill={color}
            />
        </svg>
    );
}
