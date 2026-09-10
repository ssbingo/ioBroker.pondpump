import React from "react";

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps } from "@iobroker/types-vis-2";

import PumpWidgetBase, { type PumpBaseRxData, type PumpBaseState } from "./PumpWidgetBase";
import { pondpumpCommonGroup, pumpChannelOf, pumpDeviceName } from "./common";

// Sub-states (relative to the pump device channel) this widget reads/commands.
const REL_IDS = [
    "schedule.controlled",
    "schedule.targetPower",
    "schedule.sfc",
    "schedule.source",
    "schedule.raised",
    "schedule.nightProtection",
    "schedule.hold",
    "schedule.failSafe",
    "schedule.window",
    "schedule.nextChangeTs",
    "control.on",
    "control.speed",
    "control.sfc",
    "telemetry.power",
    "telemetry.speed",
    "telemetry.voltage",
    "telemetry.waterTemperature",
    "status.fcStatus",
    "astro.isDay",
    "astro.sunrise",
    "astro.sunset",
];

const QUICK_STEPS = [0, 25, 50, 75, 100];

interface PumpSchedulerRxData extends PumpBaseRxData {
    accent: string;
    showControls: boolean;
    showTelemetry: boolean;
    noCard: boolean;
}

interface PumpSchedulerState extends PumpBaseState {
    /** Friendly pump name (from the device object), shown as the card title. */
    name: string;
    /** Optimistic SFC target while a toggle is awaiting confirmation, or null when idle. */
    sfcPending: boolean | null;
}

/**
 * Widget 3 — scheduler status.
 *
 * Shows what the adapter's built-in scheduler is currently doing with the selected pump and why
 * (target power, base source, night protection, weather raise, frost hold, fail-safe, active window
 * and the next change), together with live telemetry and the water temperature. A compact control bar
 * exposes the basic functions (on/off, quick power, SFC); a hint notes the scheduler may re-apply its
 * own target on the next run. All status values come from the read-only `schedule.*` states the
 * scheduler publishes — the widget itself stays thin.
 */
export default class PumpScheduler extends PumpWidgetBase<PumpSchedulerRxData, PumpSchedulerState> {
    static adapter: string;

    /** Fallback timer that clears an unconfirmed optimistic SFC toggle. */
    private sfcTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, name: "", sfcPending: null };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: "tplPondpumpScheduler",
            visSet: "pondpump",
            visName: "PumpScheduler",
            visAttrs: [
                pondpumpCommonGroup(),
                {
                    name: "style",
                    label: "group_style",
                    fields: [
                        { name: "accent", type: "color", label: "accent", default: "#38aaff" },
                        { name: "showControls", type: "checkbox", label: "show_controls", default: true },
                        { name: "showTelemetry", type: "checkbox", label: "show_telemetry", default: true },
                        { name: "noCard", type: "checkbox", label: "no_card", default: false },
                    ],
                },
            ],
            visDefaultStyle: { width: 320, height: 380 },
            visPrev: "widgets/pondpump/img/PumpScheduler.svg",
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return PumpScheduler.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return `${PumpScheduler.adapter}_`;
    }

    // eslint-disable-next-line class-methods-use-this
    protected relIds(): string[] {
        return REL_IDS;
    }

    componentDidMount(): void {
        super.componentDidMount();
        void this.readName();
    }

    onRxDataChanged(): void {
        super.onRxDataChanged();
        void this.readName();
    }

    componentDidUpdate(): void {
        if (this.state.sfcPending !== null && this.sfcActive() === this.state.sfcPending) {
            this.clearSfcPending();
        }
    }

    componentWillUnmount(): void {
        if (this.sfcTimer) {
            clearTimeout(this.sfcTimer);
            this.sfcTimer = null;
        }
        super.componentWillUnmount();
    }

    /** Reads the pump device's friendly name for the card title. */
    private async readName(): Promise<void> {
        const ch = pumpChannelOf(this.state.rxData);
        if (!ch) {
            if (this.ppMounted) {
                this.setState({ name: "" });
            }
            return;
        }
        const name = await pumpDeviceName(this.props.context.socket, ch);
        if (this.ppMounted) {
            this.setState({ name });
        }
    }

    private clearSfcPending(): void {
        if (this.sfcTimer) {
            clearTimeout(this.sfcTimer);
            this.sfcTimer = null;
        }
        if (this.state.sfcPending !== null) {
            this.setState({ sfcPending: null });
        }
    }

    private displayedSfc(): boolean {
        return this.state.sfcPending ?? this.sfcActive();
    }

    private onToggleSfc = (): void => {
        if (this.state.sfcPending !== null) {
            return;
        }
        const target = !this.displayedSfc();
        this.write("control.sfc", target);
        this.setState({ sfcPending: target });
        if (this.sfcTimer) {
            clearTimeout(this.sfcTimer);
        }
        this.sfcTimer = setTimeout(() => {
            this.sfcTimer = null;
            if (this.ppMounted) {
                this.setState({ sfcPending: null });
            }
        }, 15000);
    };

    // eslint-disable-next-line class-methods-use-this
    private fmt(v: number | null, digits = 0): string {
        return v === null ? "–" : v.toFixed(digits);
    }

    /** Water-temperature colour on a pond-relevant 0–30 °C scale (cold blue → warm amber). */
    // eslint-disable-next-line class-methods-use-this
    private tempColor(t: number): string {
        if (t < 8) {
            return "#4aa8ff";
        }
        if (t < 14) {
            return "#35c4c4";
        }
        if (t < 20) {
            return "#63c76a";
        }
        if (t < 26) {
            return "#ffca3a";
        }
        return "#ff8c42";
    }

    /** Format a Unix-ms timestamp as local "HH:MM", or "–" when unset/invalid. */
    // eslint-disable-next-line class-methods-use-this
    private fmtTime(ts: number | null): string {
        if (ts === null || !Number.isFinite(ts) || ts <= 0) {
            return "–";
        }
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    /** The reason chips (base source + active modifiers) explaining the current target. */
    private reasonChips(t: (k: string) => string): React.JSX.Element[] {
        if (this.bool("schedule.failSafe")) {
            return [
                <span
                    key="fs"
                    className="pp-chip pp-chip--warn"
                >
                    {t("reason_failsafe")}
                </span>,
            ];
        }
        const chips: React.JSX.Element[] = [];
        const source = this.str("schedule.source");
        const srcKey = source === "curve" ? "reason_curve" : source === "window" ? "reason_window" : "reason_base";
        chips.push(
            <span
                key="src"
                className="pp-chip pp-chip--base"
            >
                {t(srcKey)}
            </span>,
        );
        if (this.bool("schedule.nightProtection")) {
            chips.push(
                <span
                    key="np"
                    className="pp-chip pp-chip--night"
                >
                    {t("reason_night")}
                </span>,
            );
        }
        if (this.bool("schedule.raised")) {
            chips.push(
                <span
                    key="raise"
                    className="pp-chip pp-chip--raise"
                >
                    {t("reason_raised")}
                </span>,
            );
        }
        if (this.bool("schedule.hold")) {
            chips.push(
                <span
                    key="hold"
                    className="pp-chip pp-chip--hold"
                >
                    {t("reason_hold")}
                </span>,
            );
        }
        return chips;
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);

        const t = (k: string): string => PumpScheduler.t(k);
        const accent = this.state.rxData.accent || "#38aaff";
        const noCard = this.state.rxData.noCard === true;
        const showControls = this.state.rxData.showControls !== false;
        const showTelemetry = this.state.rxData.showTelemetry !== false;
        const styleVars = { ["--pp-accent"]: accent } as React.CSSProperties;

        if (!pumpChannelOf(this.state.rxData)) {
            return (
                <div
                    className={`pp-card${noCard ? "" : " pp-bg"}`}
                    style={styleVars}
                >
                    <div className="pp-head">
                        <div className="pp-title">{t("PumpScheduler")}</div>
                    </div>
                    <div className="pp-hint">{t("select_pump_hint")}</div>
                </div>
            );
        }

        const controlled = this.bool("schedule.controlled");
        const failSafe = this.bool("schedule.failSafe");
        const on = this.bool("control.on") || (this.num("telemetry.speed") ?? 0) > 0;
        const sfcShown = this.displayedSfc();
        const sfcBusy = this.state.sfcPending !== null;
        // Prefer the live actual output; fall back to the scheduler's target.
        const actual = Math.round(on ? this.actualSpeedPct() : 0);
        const target = this.num("schedule.targetPower");

        const badgeClass = failSafe ? "pp-badge--off" : controlled ? "pp-badge--on" : "pp-badge--idle";
        const badgeText = failSafe ? t("sched_failsafe") : controlled ? t("sched_active") : t("sched_manual");

        const waterTemp = this.num("telemetry.waterTemperature");
        const hasTemp = waterTemp !== null && Number.isFinite(waterTemp);
        const isDay = this.bool("astro.isDay");

        return (
            <div
                className={`pp-card${noCard ? "" : " pp-bg"}`}
                style={styleVars}
            >
                <div className="pp-head">
                    <div className="pp-title">{this.state.name || t("PumpScheduler")}</div>
                    <div className={`pp-badge ${badgeClass}`}>{badgeText}</div>
                </div>

                {/* hero: current output + scheduler target + on/off & day-night */}
                <div className="pp-hero">
                    <div className="pp-hero-main">
                        <div className="pp-hero-pct">
                            {actual}
                            <span className="u">%</span>
                        </div>
                        <div className="pp-hero-k">{t("lbl_output")}</div>
                    </div>
                    <div className="pp-hero-side">
                        <div className={`pp-pill ${on ? (sfcShown ? "pp-pill--sfc" : "pp-pill--on") : "pp-pill--off"}`}>
                            {on ? (sfcShown ? t("state_sfc") : t("state_running")) : t("state_off")}
                        </div>
                        <div className="pp-pill pp-pill--muted">
                            {isDay ? "☀" : "☾"} {isDay ? t("day") : t("night")}
                        </div>
                        {target !== null ? (
                            <div className="pp-target">
                                {t("lbl_target")}: <b>{Math.round(target)} %</b>
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* reason chips */}
                <div className="pp-chips">{this.reasonChips(t)}</div>

                {/* info grid: window, next change, sunrise, sunset */}
                <div className="pp-info">
                    <div className="pp-info-i">
                        <span className="k">{t("lbl_window")}</span>
                        <span className="v">{this.str("schedule.window") || "–"}</span>
                    </div>
                    <div className="pp-info-i">
                        <span className="k">{t("lbl_next")}</span>
                        <span className="v">{this.fmtTime(this.num("schedule.nextChangeTs"))}</span>
                    </div>
                    <div className="pp-info-i">
                        <span className="k">☀ {t("lbl_sunrise")}</span>
                        <span className="v">{this.str("astro.sunrise") || "–"}</span>
                    </div>
                    <div className="pp-info-i">
                        <span className="k">☾ {t("lbl_sunset")}</span>
                        <span className="v">{this.str("astro.sunset") || "–"}</span>
                    </div>
                </div>

                {showTelemetry ? (
                    <div className="pp-values">
                        {hasTemp ? (
                            <div className="pp-val">
                                <div
                                    className="n"
                                    style={{ color: this.tempColor(waterTemp) }}
                                >
                                    {this.fmt(waterTemp, 1)}
                                    <span className="u">°C</span>
                                </div>
                                <div className="k">{t("lbl_water_temp")}</div>
                            </div>
                        ) : null}
                        <div className="pp-val">
                            <div className="n">
                                {this.fmt(this.num("telemetry.power"))}
                                <span className="u">W</span>
                            </div>
                            <div className="k">{t("lbl_consumption")}</div>
                        </div>
                        <div className="pp-val">
                            <div className="n">
                                {this.fmt(this.num("telemetry.speed"))}
                                <span className="u">rpm</span>
                            </div>
                            <div className="k">{t("lbl_speed")}</div>
                        </div>
                    </div>
                ) : null}

                {showControls ? (
                    <>
                        <div className="pp-div" />
                        <div className="pp-onoff">
                            <button
                                type="button"
                                className={on ? "pp-active-on" : ""}
                                onClick={() => this.write("control.on", true)}
                            >
                                {t("turn_on")}
                            </button>
                            <button
                                type="button"
                                className={!on ? "pp-active-off" : ""}
                                onClick={() => this.write("control.on", false)}
                            >
                                {t("turn_off")}
                            </button>
                            <button
                                type="button"
                                className={`pp-sfc-btn${sfcShown ? " pp-active-sfc" : ""}${sfcBusy ? " pp-busy" : ""}`}
                                disabled={sfcBusy}
                                onClick={this.onToggleSfc}
                            >
                                {t("sfc_short")}
                            </button>
                        </div>
                        <div className="pp-quick">
                            {QUICK_STEPS.map(v => (
                                <button
                                    key={v}
                                    type="button"
                                    disabled={sfcShown}
                                    onClick={() => this.write("control.speed", v)}
                                >
                                    {v} %
                                </button>
                            ))}
                        </div>
                        {controlled ? <div className="pp-note">ⓘ {t("sched_override_hint")}</div> : null}
                    </>
                ) : null}
            </div>
        );
    }
}
