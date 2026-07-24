import React from "react";

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps } from "@iobroker/types-vis-2";

import PumpWidgetBase, { type PumpBaseRxData, type PumpBaseState } from "./PumpWidgetBase";
import { pondpumpCommonGroup, pumpChannelOf } from "./common";

// Sub-states (relative to the pump device channel) this widget reads/commands.
const REL_IDS = ["control.on", "control.speed", "status.fcMode", "status.fcStatus"];

// SFC (seasonal frost-control) activation is not yet available: the device command has not been
// reverse-engineered. Flip to true once the adapter handles `control.sfc` so the button enables.
const SFC_ACTIVATION_SUPPORTED = false;

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
}

/**
 * Widget 2 — pump control.
 *
 * On/off (`control.on`) and speed "Power" %  (`control.speed`) are fully functional; the speed
 * command is only sent when the slider is released, so dragging never floods the device with
 * commands. The frost-protection (SFC) section shows the current state; its activate button is
 * disabled until the SFC device command is reverse-engineered (see {@link SFC_ACTIVATION_SUPPORTED}).
 */
export default class PumpControl extends PumpWidgetBase<PumpControlRxData, PumpControlState> {
    static adapter: string;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, drag: 0, dragging: false };
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

    /** True when frost-control (SFC) mode is currently active. */
    private isSfc(): boolean {
        const mode = this.num("status.fcMode");
        if (mode !== null && mode > 0) {
            return true;
        }
        const s = this.str("status.fcStatus").trim().toLowerCase();
        return s !== "" && !["0", "off", "inactive", "none", "aus"].includes(s);
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

    private onToggleSfc = (active: boolean): void => {
        if (!SFC_ACTIVATION_SUPPORTED) {
            return;
        }
        // control.sfc is the (write) command state the adapter will map to the OASE SFC command
        // once it is reverse-engineered. Until then this button is disabled and never reached.
        this.write("control.sfc", !active);
    };

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
        const sfc = this.isSfc();

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
                    <span className="v">{Math.round(speed)} %</span>
                </div>
                <input
                    className="pp-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={speed}
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
                                className={sfc ? "pp-active-sfc" : ""}
                                disabled={!SFC_ACTIVATION_SUPPORTED}
                                title={SFC_ACTIVATION_SUPPORTED ? "" : t("sfc_pending")}
                                onClick={() => this.onToggleSfc(sfc)}
                            >
                                {sfc ? t("sfc_deactivate") : t("sfc_activate")}
                            </button>
                        </div>
                    </>
                ) : null}
            </div>
        );
    }
}
