import type { VisRxWidgetProps, VisRxWidgetState } from "@iobroker/types-vis-2";
import type VisRxWidget from "@iobroker/types-vis-2/visRxWidget";

import { injectStyles } from "./styles";
import { pumpChannelOf } from "./common";

export interface PumpBaseRxData {
    instance?: string;
    pumpId?: string;
}

export interface PumpBaseState extends VisRxWidgetState {
    /** Live values of the subscribed sub-states, keyed by their id relative to the pump channel. */
    fv: Record<string, ioBroker.StateValue | null>;
    /** Monotonic tick that lets the widget schedule periodic re-renders (animations). */
    tick: number;
}

/**
 * Common base for all pondpump widgets. Resolves the pump device channel from the
 * instance/pumpId attributes, subscribes to the relative sub-states it needs (`relIds()`),
 * keeps their live values in `this.state.fv`, and offers small typed read/write helpers.
 * `write()` always writes with `ack:false` — i.e. as a real command — which the adapter's
 * `onStateChange` turns into an OASE command; confirmed values come back with `ack:true`.
 */
export default abstract class PumpWidgetBase<
    TRxData extends PumpBaseRxData,
    TState extends PumpBaseState,
> extends (window.visRxWidget as typeof VisRxWidget)<TRxData, TState> {
    static adapter: string;

    protected subscribedIds: string[] = [];
    protected ppMounted = false;
    protected tickTimer: ReturnType<typeof setInterval> | null = null;
    /** Set > 0 in a subclass constructor to receive a periodic re-render (for animations). */
    protected tickMs = 0;

    /** Sub-state ids (relative to the pump channel) this widget subscribes to. */
    protected abstract relIds(): string[];

    /**
     * Applies a partial state update. setState's key inference does not work through the
     * abstract TState generic, so the updater type is relaxed in exactly this one place.
     */
    private applyPartial(updater: (s: PumpBaseState) => Partial<PumpBaseState>): void {
        (this.setState as unknown as (u: (s: PumpBaseState) => Partial<PumpBaseState>) => void)(updater);
    }

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, fv: {}, tick: 0 };
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.ppMounted = true;
        injectStyles();
        void this.subscribePump();
        if (this.tickMs > 0) {
            this.tickTimer = setInterval(
                () => this.ppMounted && this.applyPartial(s => ({ tick: s.tick + 1 })),
                this.tickMs,
            );
        }
    }

    componentWillUnmount(): void {
        this.ppMounted = false;
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }
        this.unsubscribePump();
        super.componentWillUnmount();
    }

    onRxDataChanged(): void {
        void this.subscribePump();
    }

    protected channel(): string {
        return pumpChannelOf(this.state.rxData);
    }

    private pumpIds(): string[] {
        const ch = this.channel();
        return ch ? this.relIds().map(s => `${ch}.${s}`) : [];
    }

    protected async subscribePump(): Promise<void> {
        this.unsubscribePump();
        const ids = this.pumpIds();
        if (!ids.length) {
            this.applyPartial(() => ({ fv: {} }));
            return;
        }
        this.subscribedIds = ids;
        try {
            await this.props.context.socket.subscribeState(ids, this.onPumpState);
        } catch {
            /* ignore */
        }
        for (const id of ids) {
            try {
                const st = await this.props.context.socket.getState(id);
                this.applyState(id, st);
            } catch {
                /* ignore */
            }
        }
    }

    protected unsubscribePump(): void {
        if (this.subscribedIds.length) {
            try {
                this.props.context.socket.unsubscribeState(this.subscribedIds, this.onPumpState);
            } catch {
                /* ignore */
            }
            this.subscribedIds = [];
        }
    }

    protected onPumpState = (id: string, state: ioBroker.State | null | undefined): void => {
        this.applyState(id, state);
    };

    protected applyState(id: string, state: ioBroker.State | null | undefined): void {
        if (!this.ppMounted) {
            return;
        }
        const ch = this.channel();
        const key = ch && id.startsWith(`${ch}.`) ? id.substring(ch.length + 1) : id;
        this.applyPartial(s => ({ fv: { ...s.fv, [key]: state ? state.val : null } }));
    }

    /** Sends a command (ack:false) to a sub-state of the selected pump. */
    protected write(sub: string, val: ioBroker.StateValue): void {
        const ch = this.channel();
        if (ch) {
            void this.props.context.socket.setState(`${ch}.${sub}`, val, false);
        }
    }

    protected num(key: string): number | null {
        const v = this.state.fv[key];
        return v === null || v === undefined || v === "" ? null : Number(v);
    }

    protected str(key: string): string {
        const v = this.state.fv[key];
        return typeof v === "string" ? v : "";
    }

    protected bool(key: string): boolean {
        return this.state.fv[key] === true;
    }
}
