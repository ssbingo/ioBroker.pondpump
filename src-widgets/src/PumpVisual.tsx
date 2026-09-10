import React from "react";

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps } from "@iobroker/types-vis-2";

import PumpWidgetBase, { type PumpBaseRxData, type PumpBaseState } from "./PumpWidgetBase";
import { pondpumpCommonGroup, pumpChannelOf } from "./common";
import { renderImpeller, renderThermometer } from "./graphics";

// Sub-states (relative to the pump device channel) this widget needs.
const REL_IDS = [
    "control.on",
    "control.speed",
    "control.sfc",
    "telemetry.power",
    "telemetry.speed",
    "telemetry.waterTemperature",
    "status.fcStatus",
    "status.fcMode",
];

interface PumpVisualRxData extends PumpBaseRxData {
    accent: string;
    animate: boolean;
    showValues: boolean;
    noCard: boolean;
}

interface PumpVisualState extends PumpBaseState {
    /** Friendly pump name (from the device object), shown as the card title. */
    name: string;
}

/**
 * Widget 1 — graphical pump visualisation.
 *
 * The impeller rotates depending on the pump speed, quantised to 10 % steps (faster pump →
 * faster spin). In frost-protection (SFC) mode an ice crystal rotates instead of the impeller.
 * When the pump is off the impeller stands still and a red cross is drawn over it. Power (W),
 * motor speed (rpm) and the "Power" setpoint (%) are shown below the graphic.
 */
export default class PumpVisual extends PumpWidgetBase<PumpVisualRxData, PumpVisualState> {
    static adapter: string;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, name: "" };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: "tplPondpumpVisual",
            visSet: "pondpump",
            visName: "PumpVisual",
            visAttrs: [
                pondpumpCommonGroup(),
                {
                    name: "style",
                    label: "group_style",
                    fields: [
                        { name: "accent", type: "color", label: "accent", default: "#38aaff" },
                        { name: "animate", type: "checkbox", label: "animate", default: true },
                        { name: "showValues", type: "checkbox", label: "show_values", default: true },
                        { name: "noCard", type: "checkbox", label: "no_card", default: false },
                    ],
                },
            ],
            visDefaultStyle: { width: 260, height: 300 },
            visPrev: "widgets/pondpump/img/PumpVisual.svg",
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return PumpVisual.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return `${PumpVisual.adapter}_`;
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

    /** Reads the pump device's friendly name for the card title. */
    private async readName(): Promise<void> {
        const ch = pumpChannelOf(this.state.rxData);
        if (!ch) {
            if (this.ppMounted) {
                this.setState({ name: "" });
            }
            return;
        }
        try {
            const obj = await this.props.context.socket.getObject(ch);
            const common = (obj?.common || {}) as { name?: ioBroker.StringOrTranslated };
            let name = "";
            if (typeof common.name === "string") {
                name = common.name;
            } else if (common.name && typeof common.name === "object") {
                const rec = common.name as Record<string, string>;
                name = rec.en || Object.values(rec)[0] || "";
            }
            if (this.ppMounted) {
                this.setState({ name });
            }
        } catch {
            /* ignore */
        }
    }

    /** True when the pump is considered running (adapter-reported on, or a non-zero motor speed). */
    private isRunning(): boolean {
        return this.bool("control.on") || (this.num("telemetry.speed") ?? 0) > 0;
    }

    // eslint-disable-next-line class-methods-use-this
    private renderIce(spin: boolean, dur: number): React.JSX.Element {
        // Speed-based like the impeller, so the crystal reflects the (SFC-driven) real pump speed.
        const d = dur > 0 ? dur : 3.2;
        const style = spin ? ({ ["--pp-dur"]: `${d}s` } as React.CSSProperties) : undefined;
        return (
            <svg
                viewBox="0 0 120 120"
                role="img"
            >
                <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="rgba(56,170,255,.06)"
                    stroke="rgba(89,182,255,.18)"
                    strokeWidth="2"
                />
                <g
                    className={spin ? "pp-spin pp-glow" : "pp-glow"}
                    style={style}
                    stroke="#bfe4ff"
                    strokeWidth="4"
                    strokeLinecap="round"
                    fill="none"
                >
                    {[0, 60, 120, 180, 240, 300].map(a => (
                        <g
                            key={a}
                            transform={`rotate(${a} 60 60)`}
                        >
                            <line
                                x1="60"
                                y1="60"
                                x2="60"
                                y2="14"
                            />
                            <line
                                x1="60"
                                y1="26"
                                x2="50"
                                y2="17"
                            />
                            <line
                                x1="60"
                                y1="26"
                                x2="70"
                                y2="17"
                            />
                            <line
                                x1="60"
                                y1="40"
                                x2="52"
                                y2="33"
                            />
                            <line
                                x1="60"
                                y1="40"
                                x2="68"
                                y2="33"
                            />
                        </g>
                    ))}
                    <circle
                        cx="60"
                        cy="60"
                        r="5"
                        fill="#bfe4ff"
                        stroke="none"
                    />
                </g>
            </svg>
        );
    }

    // eslint-disable-next-line class-methods-use-this
    private fmt(v: number | null, digits = 0): string {
        return v === null ? "–" : v.toFixed(digits);
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);

        const t = (k: string): string => PumpVisual.t(k);
        const accent = this.state.rxData.accent || "#38aaff";
        const noCard = this.state.rxData.noCard === true;
        const animate = this.state.rxData.animate !== false;
        const showValues = this.state.rxData.showValues !== false;
        const styleVars = { ["--pp-accent"]: accent } as React.CSSProperties;

        if (!pumpChannelOf(this.state.rxData)) {
            return (
                <div
                    className={`pp-card${noCard ? "" : " pp-bg"}`}
                    style={styleVars}
                >
                    <div className="pp-head">
                        <div className="pp-title">{t("PumpVisual")}</div>
                    </div>
                    <div className="pp-hint">{t("select_pump_hint")}</div>
                </div>
            );
        }

        const running = this.isRunning();
        const sfc = this.sfcActive();
        const dur = this.spinDuration();
        // Show the real output as "Power": during SFC it reflects the overridden flow, not the setpoint.
        const powerPct = sfc ? this.actualSpeedPct() : (this.num("control.speed") ?? this.actualSpeedPct());

        let graphic: React.JSX.Element;
        if (!running) {
            graphic = renderImpeller(false, 0, accent, true);
        } else if (sfc) {
            graphic = this.renderIce(animate, dur);
        } else {
            graphic = renderImpeller(animate, dur, accent, false);
        }

        const badgeClass = !running ? "pp-badge--off" : sfc ? "pp-badge--sfc" : "pp-badge--on";
        const badgeText = !running ? t("state_off") : sfc ? t("state_sfc") : t("state_running");

        const waterTemp = this.num("telemetry.waterTemperature");
        const hasTemp = waterTemp !== null && Number.isFinite(waterTemp);

        return (
            <div
                className={`pp-card${noCard ? "" : " pp-bg"}`}
                style={styleVars}
            >
                <div className="pp-head">
                    <div className="pp-title">{this.state.name || t("PumpVisual")}</div>
                    <div className={`pp-badge ${badgeClass}`}>{badgeText}</div>
                </div>

                <div className={`pp-stage${hasTemp ? " pp-stage--temp" : ""}`}>
                    <div className="pp-graphic">{graphic}</div>
                    {hasTemp ? (
                        <div className="pp-thermo">
                            {renderThermometer(waterTemp)}
                            <div className="pp-thermo-val">
                                <span className="n">{waterTemp.toFixed(1)}</span>
                                <span className="u">°C</span>
                            </div>
                            <div className="pp-thermo-k">{t("lbl_water_temp")}</div>
                        </div>
                    ) : null}
                </div>

                {showValues ? (
                    <div className="pp-values">
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
                        <div className="pp-val">
                            <div className="n">
                                {this.fmt(powerPct)}
                                <span className="u">%</span>
                            </div>
                            <div className="k">{t("lbl_power")}</div>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }
}
