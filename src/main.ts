/*
 * Created with @iobroker/create-adapter v3.1.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";

import {
    CloudAuthError,
    CloudClient,
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
        await this.setState("info.connection", false, true);

        const mode = this.config.connectionMode;
        if (mode !== "cloud" && mode !== "local" && mode !== "both") {
            this.log.error(`Invalid connection mode: ${JSON.stringify(mode)} — please check the adapter configuration`);
            return;
        }

        this.pollIntervalMs = Math.max(MIN_POLL_INTERVAL_S, this.config.pollInterval || 30) * 1000;

        // Phase 3 delivers the local transport; for now only the cloud path is active.
        if (mode === "local") {
            this.log.warn("Connection mode 'local' is not implemented yet (planned for phase 3) — nothing to do");
            return;
        }

        // Prefer a rotated refresh token persisted from a previous run over the configured one.
        await this.ensureRefreshTokenState();
        const persisted = await this.getStateAsync(REFRESH_TOKEN_STATE);
        const refreshToken =
            (typeof persisted?.val === "string" && persisted.val) || this.config.cloudRefreshToken || "";
        if (!refreshToken) {
            this.log.warn(
                "No cloud refresh token configured. Capture a refresh token from an OASE app login and enter it " +
                    "in the adapter settings before the cloud connection can be established.",
            );
            return;
        }

        this.cloud = new CloudClient({
            baseUrl: this.config.cloudBaseUrl || DEFAULT_BASE_URL,
            tokenUrl: this.config.cloudTokenUrl || DEFAULT_TOKEN_URL,
            clientId: this.config.cloudClientId || DEFAULT_CLIENT_ID,
            scope: this.config.cloudScope || DEFAULT_SCOPE,
            refreshToken,
            log: {
                debug: m => this.log.debug(m),
                info: m => this.log.info(m),
                warn: m => this.log.warn(m),
                error: m => this.log.error(m),
            },
            onRefreshToken: token => {
                // Persist the rotated token so restarts keep working (states DB, local).
                void this.setState(REFRESH_TOKEN_STATE, token, true);
            },
        });

        this.log.info(`Adapter started in "${mode}" mode, polling the OASE cloud every ${this.pollIntervalMs / 1000}s`);

        // Start the chained-setTimeout poll loop (never setInterval with external requests).
        void this.poll();
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
        try {
            const raw = await this.cloud.fetchInventory();
            const inventory = parseInventory(raw);

            await applyGateway(this, inventory.gateway, inventory.gateway.isOnline ?? true);
            for (const pump of inventory.pumps) {
                await applyPump(this, pump);
            }

            await this.setState("info.connection", true, true);
            this.log.debug(`Poll ok: gateway ${inventory.gateway.serialNumber}, ${inventory.pumps.length} pump(s)`);
        } catch (error) {
            await this.setState("info.connection", false, true);
            const message = error instanceof Error ? error.message : String(error);
            if (error instanceof CloudAuthError) {
                // Configuration/credential problem — will not fix itself by retrying quickly, but keep polling.
                this.log.warn(`Cloud authentication problem: ${message}`);
            } else {
                this.log.warn(`Poll failed: ${message}`);
            }
        } finally {
            this.scheduleNextPoll();
        }
    }

    private scheduleNextPoll(): void {
        if (this.stopping) {
            return;
        }
        // adapter.setTimeout is auto-cancelled on unload; the chain guarantees no overlapping requests.
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
            this.stopping = true;
            if (this.pollTimer) {
                this.clearTimeout(this.pollTimer);
                this.pollTimer = undefined;
            }
            this.cloud?.reset();
            this.cloud = undefined;
            callback();
        } catch (error) {
            this.log.error(`Error during unloading: ${(error as Error).message}`);
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
        this.log.debug(`Command received for ${id}: ${JSON.stringify(state.val)}`);
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Pondpump(options);
} else {
    // otherwise start the instance directly
    (() => new Pondpump())();
}
