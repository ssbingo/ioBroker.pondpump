/*
 * Created with @iobroker/create-adapter v3.1.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";

import {
    CloudAuthError,
    CloudClient,
    CloudRequestError,
    DEFAULT_BASE_URL,
    DEFAULT_CLIENT_ID,
    DEFAULT_SCOPE,
    DEFAULT_TOKEN_URL,
} from "./lib/cloud/client";
import { parseInventory } from "./lib/cloud/inventory";
import { applyGateway, applyPump } from "./lib/objects";

/** Minimum poll interval enforced regardless of configuration (seconds). */
const MIN_POLL_INTERVAL_S = 5;

/** State that persists the rotating cloud refresh token across restarts. */
const REFRESH_TOKEN_STATE = "cloud.refreshToken";

class Pondpump extends utils.Adapter {
    private cloud?: CloudClient;
    private pollTimer?: ioBroker.Timeout;
    private pollIntervalMs = 30_000;
    /** Set true in onUnload so a poll in flight does not reschedule. */
    private stopping = false;
    /** Incrementing poll counter used to correlate log lines of one cycle. */
    private pollCount = 0;
    /** Last known info.connection value, to log only on transitions. */
    private lastConnected: boolean | undefined;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: "pondpump",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        // Reset the connection indicator during startup
        await this.setConnected(false);

        const mode = this.config.connectionMode;
        if (mode !== "cloud" && mode !== "local" && mode !== "both") {
            this.log.error(
                `[config] invalid connection mode ${JSON.stringify(mode)} — expected "cloud", "local" or "both". ` +
                    "Check the adapter configuration; the adapter will not do anything.",
            );
            return;
        }

        this.pollIntervalMs = Math.max(MIN_POLL_INTERVAL_S, this.config.pollInterval || 30) * 1000;
        const baseUrl = this.config.cloudBaseUrl || DEFAULT_BASE_URL;
        const tokenUrl = this.config.cloudTokenUrl || DEFAULT_TOKEN_URL;
        const clientId = this.config.cloudClientId || DEFAULT_CLIENT_ID;
        const scope = this.config.cloudScope || DEFAULT_SCOPE;
        this.log.debug(
            `[config] mode=${mode} pollInterval=${this.pollIntervalMs / 1000}s baseUrl=${baseUrl} ` +
                `tokenUrl=${tokenUrl.split("?")[0]} clientId=${clientId} ` +
                `refreshTokenConfigured=${this.config.cloudRefreshToken ? "yes" : "no"}`,
        );

        // Phase 3 delivers the local transport; for now only the cloud path is active.
        if (mode === "local") {
            this.log.warn(
                "[config] connection mode 'local' is not implemented yet (planned for phase 3) — nothing to do",
            );
            return;
        }

        // Prefer a rotated refresh token persisted from a previous run over the configured one.
        await this.ensureRefreshTokenState();
        const persisted = await this.getStateAsync(REFRESH_TOKEN_STATE);
        const persistedToken = typeof persisted?.val === "string" ? persisted.val : "";
        const refreshToken = persistedToken || this.config.cloudRefreshToken || "";
        if (!refreshToken) {
            this.log.warn(
                "[config] no cloud refresh token available. Capture a refresh token from an OASE app login and enter " +
                    "it in the adapter settings ('Cloud refresh token') before the cloud connection can be established.",
            );
            return;
        }
        this.log.info(
            `[startup] using refresh token from ${persistedToken ? "persisted state (rotated)" : "adapter config"} ` +
                `(len=${refreshToken.length})`,
        );

        this.cloud = new CloudClient({
            baseUrl,
            tokenUrl,
            clientId,
            scope,
            refreshToken,
            log: {
                debug: m => this.log.debug(m),
                info: m => this.log.info(m),
                warn: m => this.log.warn(m),
                error: m => this.log.error(m),
            },
            onRefreshToken: token => {
                // Persist the rotated token so restarts keep working (states DB, local).
                this.log.debug(`[cloud/auth] persisting rotated refresh token to ${REFRESH_TOKEN_STATE}`);
                void this.setState(REFRESH_TOKEN_STATE, token, true);
            },
        });

        this.log.info(
            `[startup] adapter ready in "${mode}" mode — polling ${baseUrl} every ${this.pollIntervalMs / 1000}s`,
        );

        // Start the chained-setTimeout poll loop (never setInterval with external requests).
        void this.poll();
    }

    /**
     * Update info.connection and log only on state transitions.
     *
     * @param connected - whether the cloud connection is currently up
     */
    private async setConnected(connected: boolean): Promise<void> {
        await this.setState("info.connection", connected, true);
        if (this.lastConnected !== connected) {
            if (connected) {
                this.log.info("[conn] cloud connection established (info.connection = true)");
            } else if (this.lastConnected !== undefined) {
                this.log.warn("[conn] cloud connection lost (info.connection = false)");
            }
            this.lastConnected = connected;
        }
    }

    /** Create the (non-writable) state that persists the rotating cloud refresh token. */
    private async ensureRefreshTokenState(): Promise<void> {
        await this.setObjectNotExistsAsync("cloud", {
            type: "channel",
            common: { name: "Cloud" },
            native: {},
        });
        await this.setObjectNotExistsAsync(REFRESH_TOKEN_STATE, {
            type: "state",
            common: {
                name: "Cloud refresh token (rotating, secret)",
                type: "string",
                role: "text",
                read: true,
                write: false,
                def: "",
            },
            native: {},
        });
    }

    /** One poll cycle: fetch inventory, update objects/states, reschedule. */
    private async poll(): Promise<void> {
        if (this.stopping || !this.cloud) {
            return;
        }
        const id = ++this.pollCount;
        const startedAt = Date.now();
        this.log.debug(`[poll] #${id} start`);

        // Phase 1 — fetch the raw inventory from the cloud.
        let raw: unknown;
        try {
            raw = await this.cloud.fetchInventory();
        } catch (error) {
            await this.setConnected(false);
            const message = error instanceof Error ? error.message : String(error);
            if (error instanceof CloudAuthError) {
                // Credential/config problem — quick retries will not fix it, but keep polling.
                this.log.error(
                    `[poll] #${id} AUTH FAILED — ${message} ` +
                        "(fix: enter a fresh 'Cloud refresh token' captured from an OASE app login)",
                );
            } else if (error instanceof CloudRequestError) {
                this.log.warn(
                    `[poll] #${id} cloud request error${error.status ? ` (HTTP ${error.status})` : ""}: ${message}`,
                );
            } else {
                this.log.error(`[poll] #${id} unexpected fetch error: ${message}`);
            }
            this.scheduleNextPoll();
            return;
        }

        // Phase 2 — parse the raw inventory into the domain model.
        let inventory;
        try {
            inventory = parseInventory(raw);
        } catch (error) {
            await this.setConnected(false);
            const message = error instanceof Error ? error.message : String(error);
            const shape =
                raw && typeof raw === "object" ? `keys=[${Object.keys(raw).join(",")}]` : `type=${typeof raw}`;
            this.log.error(
                `[poll] #${id} inventory parse failed: ${message}. Raw response ${shape}. ` +
                    "The OASE cloud format may have changed — please report this with debug logs.",
            );
            this.scheduleNextPoll();
            return;
        }

        // Phase 3 — create/update objects and write states.
        try {
            const online = inventory.gateway.isOnline ?? true;
            await applyGateway(this, inventory.gateway, online);
            for (const pump of inventory.pumps) {
                await applyPump(this, pump);
                this.log.debug(
                    `[poll] #${id} pump ${pump.deviceNumber}: on=${pump.dmx.deviceOn} ` +
                        `speed=${pump.dmx.dimmerValue} (raw) fc=${pump.dmx.fcStatus}/${pump.dmx.fcMode} ` +
                        `connected=${pump.isConnected}`,
                );
            }

            await this.setConnected(true);
            const took = Date.now() - startedAt;
            const summary =
                `gateway ${inventory.gateway.serialNumber} "${inventory.gateway.name}" online=${online}, ` +
                `${inventory.pumps.length} pump(s), ${took} ms`;
            // First successful cycle is worth an info line; subsequent ones stay at debug to avoid spam.
            if (id === 1) {
                this.log.info(`[poll] #${id} ok — ${summary}`);
            } else {
                this.log.debug(`[poll] #${id} ok — ${summary}`);
            }
        } catch (error) {
            await this.setConnected(false);
            const message = error instanceof Error ? error.message : String(error);
            this.log.error(`[poll] #${id} failed while writing objects/states: ${message}`);
        } finally {
            this.scheduleNextPoll();
        }
    }

    private scheduleNextPoll(): void {
        if (this.stopping) {
            return;
        }
        // adapter.setTimeout is auto-cancelled on unload; the chain guarantees no overlapping requests.
        this.log.debug(`[poll] next cycle in ${this.pollIntervalMs / 1000}s`);
        this.pollTimer = this.setTimeout(() => {
            this.pollTimer = undefined;
            void this.poll();
        }, this.pollIntervalMs);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - Callback function
     */
    private onUnload(callback: () => void): void {
        try {
            this.log.debug("[shutdown] onUnload: stopping poll loop and releasing the cloud client");
            this.stopping = true;
            if (this.pollTimer) {
                this.clearTimeout(this.pollTimer);
                this.pollTimer = undefined;
            }
            this.cloud?.reset();
            this.cloud = undefined;
            this.log.debug("[shutdown] cleanup complete");
            callback();
        } catch (error) {
            this.log.error(`[shutdown] error during unloading: ${(error as Error).message}`);
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes.
     *
     * @param id - State ID
     * @param state - State object
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (!state || state.ack) {
            // ack=true values are confirmations from the device (or deletions) — not commands, ignore them
            return;
        }
        // Phase 2+: forward commands (speed, on/off) to the active client and confirm with ack=true
        this.log.debug(`[command] ${id} = ${JSON.stringify(state.val)} (ack=false) — not handled yet (phase 2)`);
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Pondpump(options);
} else {
    // otherwise start the instance directly
    (() => new Pondpump())();
}
