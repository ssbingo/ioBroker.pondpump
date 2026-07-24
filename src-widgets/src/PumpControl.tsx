import React from "react";

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps } from "@iobroker/types-vis-2";

import PumpWidgetBase, { type PumpBaseRxData, type PumpBaseState } from "./PumpWidgetBase";
import { pondpumpCommonGroup, pumpChannelOf } from "./common";

// Sub-states (relative to the pump device channel) this widget reads/commands.
const REL_IDS = ["control.on", "control.speed", "control.sfc", "telemetry.speed", "status.fcMode", "status.fcStatus"];

// SFC (Seasonal Flow Control) activation. The 0x5000 device command was reverse-engineered and the
// adapter now handles the writable `control.sfc` state, so the activate/deactivate button is live.
const SFC_ACTIVATION_SUPPORTED = true;

const QUICK_STEPS = [0, 25, 50, 75, 100];

interface PumpControlRxData extends PumpBaseRxData {
    accent: string;
    showOnoff: boolean;
    quickButtons: boolean;
    showSfc: boolean;
    noCard: boolean;
}

interface PumpControlState extends PumpBaseState {
    /** The value currently being dragged on the slider (only meaningful while `dragging`). */
    drag: number;
    /** True while the user drags the slider — display the local value, commit on release. */
    dragging: boolean;
    /** Optimistic SFC target while a toggle is awaiting confirmation, or null when idle. */
    sfcPending: boolean | null;
}

/**
 * Widget 2 — pump control.
 *
 * On/off (`control.on`), speed "Power" % (`control.speed`) and Seasonal Flow Control (`control.sfc`)
 * are all functional. The speed command is only sent when the slider is released, so dragging never
 * floods the device. The SFC button uses optimistic UI: it flips to the target state immediately and
 * shows a busy spinner (blocking further clicks) until the adapter confirms via `control.sfc` — which
 * the adapter reflects with `ack:true` right after sending the command, much faster than waiting for
 * the next `status.fcStatus` poll.
 */
export default class PumpControl extends PumpWidgetBase<PumpControlRxData, PumpControlState> {
    static adapter: string;

    /** Fallback timer that clears an unconfirmed optimistic SFC toggle. */
    private sfcTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, drag: 0, dragging: false, sfcPending: null };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: "tplPondpumpControl",
            visSet: "pondpump",
            visName: "PumpControl",
            visAttrs: [
                pondpumpCommonGroup(),
                {
                    name: "style",
                    label: "group_style",
                    fields: [
                        { name: "accent", type: "color", label: "accent", default: "#38aaff" },
                        { name: "showOnoff", type: "checkbox", label: "show_onoff", default: true },
                        { name: "quickButtons", type: "checkbox", label: "quick_buttons", default: true },
                        { name: "showSfc", type: "checkbox", label: "show_sfc", default: true },
                        { name: "noCard", type: "checkbox", label: "no_card", default: false },
                    ],
                },
            ],
            visDefaultStyle: { width: 300, height: 300 },
            visPrev: "widgets/pondpump/img/PumpControl.svg",
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return PumpControl.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return `${PumpControl.adapter}_`;
    }

    // eslint-disable-next-line class-methods-use-this
    protected relIds(): string[] {
        return REL_IDS;
    }

    private displaySpeed(): number {
        if (this.state.dragging) {
            return this.state.drag;
        }
        return this.num("control.speed") ?? 0;
    }

    private onSliderInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.setState({ drag: Number(e.target.value), dragging: true });
    };

    private commitSlider = (): void => {
        if (this.state.dragging) {
            this.write("control.speed", this.state.drag);
            this.setState({ dragging: false });
        }
    };

    private onQuick = (v: number): void => {
        this.write("control.speed", v);
    };

    private onOn = (): void => {
        this.write("control.on", true);
    };

    private onOff = (): void => {
        this.write("control.on", false);
    };

    /** The SFC state to display: the optimistic target while pending, otherwise the confirmed state. */
    private displayedSfc(): boolean {
        return this.state.sfcPending ?? this.sfcActive();
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

    private onToggleSfc = (): void => {
        if (!SFC_ACTIVATION_SUPPORTED || this.state.sfcPending !== null) {
            return; // already awaiting confirmation — ignore extra clicks
        }
        const target = !this.displayedSfc();
        this.write("control.sfc", target); // ack:false command; adapter confirms via control.sfc
        this.setState({ sfcPending: target });
        if (this.sfcTimer) {
            clearTimeout(this.sfcTimer);
        }
        // Fallback: stop showing "busy" even if no confirmation ever arrives (transport hiccup).
        this.sfcTimer = setTimeout(() => {
            this.sfcTimer = null;
            if (this.ppMounted) {
                this.setState({ sfcPending: null });
            }
        }, 15000);
    };

    componentDidUpdate(): void {
        // Clear the optimistic state once the confirmed state has caught up to the target.
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

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);

        const t = (k: string): string => PumpControl.t(k);
        const accent = this.state.rxData.accent || "#38aaff";
        const noCard = this.state.rxData.noCard === true;
        const showOnoff = this.state.rxData.showOnoff !== false;
        const quickButtons = this.state.rxData.quickButtons !== false;
        const showSfc = this.state.rxData.showSfc !== false;
        const styleVars = { ["--pp-accent"]: accent } as React.CSSProperties;

        if (!pumpChannelOf(this.state.rxData)) {
            return (
                <div
                    className={`pp-card${noCard ? "" : " pp-bg"}`}
                    style={styleVars}
                >
                    <div className="pp-head">
                        <div className="pp-title">{t("PumpControl")}</div>
                    </div>
                    <div className="pp-hint">{t("select_pump_hint")}</div>
                </div>
            );
        }

        const on = this.bool("control.on");
        const speed = this.displaySpeed();
        const sfcBusy = this.state.sfcPending !== null;
        const sfcShown = this.displayedSfc();
        // While SFC is active the device overrides manual power, so show the real output on a
        // disabled slider instead of the (now-inactive) setpoint.
        const sliderVal = sfcShown ? Math.round(this.actualSpeedPct()) : speed;

        return (
            <div
                className={`pp-card${noCard ? "" : " pp-bg"}`}
                style={styleVars}
            >
                <div className="pp-head">
                    <div className="pp-title">{t("control")}</div>
                    <div className={`pp-badge ${on ? "pp-badge--on" : "pp-badge--off"}`}>
                        {on ? t("state_running") : t("state_off")}
                    </div>
                </div>

                {showOnoff ? (
                    <div className="pp-onoff">
                        <button
                            type="button"
                            className={on ? "pp-active-on" : ""}
                            onClick={this.onOn}
                        >
                            {t("turn_on")}
                        </button>
                        <button
                            type="button"
                            className={!on ? "pp-active-off" : ""}
                            onClick={this.onOff}
                        >
                            {t("turn_off")}
                        </button>
                    </div>
                ) : null}

                <div className="pp-row">
                    <span className="k">{t("lbl_power")}</span>
                    <span className="v">
                        {Math.round(sliderVal)} %{sfcShown ? ` · ${t("state_sfc")}` : ""}
                    </span>
                </div>
                <input
                    className="pp-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={sliderVal}
                    disabled={sfcShown}
                    onChange={this.onSliderInput}
                    onMouseUp={this.commitSlider}
                    onTouchEnd={this.commitSlider}
                    onKeyUp={this.commitSlider}
                    onBlur={this.commitSlider}
                />

                {quickButtons ? (
                    <div className="pp-quick">
                        {QUICK_STEPS.map(v => (
                            <button
                                key={v}
                                type="button"
                                disabled={sfcShown}
                                onClick={() => this.onQuick(v)}
                            >
                                {v} %
                            </button>
                        ))}
                    </div>
                ) : null}

                {showSfc ? (
                    <>
                        <div className="pp-div" />
                        <div className="pp-sfc">
                            <div>
                                <div className="pp-sfc-t">{t("sfc_title")}</div>
                                <div className="pp-sfc-s">
                                    {SFC_ACTIVATION_SUPPORTED ? t("sfc_sub") : t("sfc_pending")}
                                </div>
                            </div>
                            <button
                                type="button"
                                className={`${sfcShown ? "pp-active-sfc" : ""}${sfcBusy ? " pp-busy" : ""}`}
                                disabled={sfcBusy}
                                onClick={this.onToggleSfc}
                            >
                                {sfcShown ? t("sfc_deactivate") : t("sfc_activate")}
                            </button>
                        </div>
                    </>
                ) : null}
            </div>
        );
    }
}
