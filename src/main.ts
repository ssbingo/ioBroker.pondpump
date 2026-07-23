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
import { type PumpInfo, parseInventory, SENSOR_POWER_W, SENSOR_SPEED_RPM } from "./lib/cloud/inventory";
import { ensureGatewayObjects, ensurePumpObjects, writeGatewayStates, writePumpStates } from "./lib/objects";
import { buildSensorRead, buildSetDimmer, buildSetOn, DIMMER_MAX, parseSensorReadReply } from "./lib/cloud/onet";

/** Minimum poll interval enforced regardless of configuration (seconds). */
const MIN_POLL_INTERVAL_S = 5;

/** State that persists the rotating cloud refresh token across restarts. */
const REFRESH_TOKEN_STATE = "cloud.refreshToken";

/** Delay before the confirmation poll that reconciles a sent command (ms). */
const COMMAND_CONFIRM_DELAY_MS = 2000;

/** Number of RDM sensors (0..N-1) to scan once per pump (RDM DEVICE_INFO reports 11). */
const SENSOR_SCAN_COUNT = 11;

/** Sensors read on every poll (fast-changing, worth tracking live). */
const FAST_SENSOR_IDS = [SENSOR_SPEED_RPM, SENSOR_POWER_W];

/** Read the slow sensors (temperature, voltage, …) only every Nth poll to spare the gateway. */
const SLOW_SENSOR_EVERY = 6;

/** Control data needed to address a pump for commands. */
interface PumpControl {
    deviceNumber: number;
    index: number;
    controlAddress?: number;
}

/**
 * Extract the base64 `data`/`Data` field from a SendONetPacket response body.
 *
 * @param response - the parsed SendONetPacket JSON response
 */
function extractResponseData(response: unknown): string | undefined {
    if (response && typeof response === "object") {
        const record = response as Record<string, unknown>;
        if (typeof record.data === "string") {
            return record.data;
        }
        if (typeof record.Data === "string") {
            return record.Data;
        }
    }
    return undefined;
}

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
    /** Gateway cloud UUID (target of SendONetPacket), learned from the inventory. */
    private gatewayId: string | undefined;
    /** Whether gateway objects were already created/updated this session. */
    private gatewayEnsured = false;
    /** Pumps whose objects were already created/updated this session. */
    private readonly ensuredPumps = new Set<number>();
    /** Control addressing per pump device number, learned from the inventory. */
    private readonly pumpControl = new Map<number, PumpControl>();
    /** Rolling transaction number for ONet packets (0..255). */
    private txn = 0;
    /** Live sensor ids discovered per pump device number (RDM sensors that answer a 0x5500 read). */
    private readonly liveSensorIds = new Map<number, number[]>();

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

        // Listen for user/automation commands on the writable control states.
        this.subscribeStates("pumps.*.control.*");

        this.log.info(
            `[startup] adapter ready in "${mode}" mode — polling ${baseUrl} every ${this.pollIntervalMs / 1000}s`,
        );

        // Start the chained-setTimeout poll loop (never setInterval with external requests).
        void this.poll();
    }

    /**
     * Cache the addressing needed to send commands to a pump.
     *
     * @param pump - pump info from the latest inventory
     */
    private cachePumpControl(pump: PumpInfo): void {
        this.pumpControl.set(pump.deviceNumber, {
            deviceNumber: pump.deviceNumber,
            index: pump.index,
            controlAddress: pump.controlAddress,
        });
    }

    /** Next rolling transaction number (0..255) for an ONet packet. */
    private nextTxn(): number {
        this.txn = (this.txn + 1) & 0xff;
        return this.txn;
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
            this.gatewayId = inventory.gateway.id;
            if (!this.gatewayEnsured) {
                await ensureGatewayObjects(this, inventory.gateway);
                this.gatewayEnsured = true;
                this.log.debug(`[poll] #${id} gateway objects ensured`);
            }
            await writeGatewayStates(this, inventory.gateway, online);
            for (const pump of inventory.pumps) {
                this.cachePumpControl(pump);

                // Discover the pump's live sensor set once (RDM DEVICE_INFO reports 11 sensors, but
                // the cloud inventory only exposes a few). Scan 0..10 via 0x5500 on first contact,
                // then only re-read the present ones; the discovery scan doubles as the first read.
                let sensorIds = this.liveSensorIds.get(pump.deviceNumber);
                let liveSensors: Record<number, number>;
                if (sensorIds === undefined) {
                    const discovery = await this.discoverLiveSensors(pump.index);
                    sensorIds = discovery.ids;
                    liveSensors = discovery.values;
                    this.liveSensorIds.set(pump.deviceNumber, sensorIds);
                } else {
                    // Read fast sensors (rpm/power) every poll; slow ones (temperature, voltage, …)
                    // only every SLOW_SENSOR_EVERY-th poll to keep the request load off the gateway.
                    const readSlow = id % SLOW_SENSOR_EVERY === 0;
                    const idsToRead = readSlow ? sensorIds : sensorIds.filter(s => FAST_SENSOR_IDS.includes(s));
                    liveSensors = await this.readLiveSensors(pump.index, idsToRead);
                }

                // The inventory's rdmData is minutes-stale; use fresh live values for telemetry.
                const livePump: PumpInfo = {
                    ...pump,
                    sensors: Object.keys(liveSensors).length > 0 ? liveSensors : pump.sensors,
                };

                if (!this.ensuredPumps.has(pump.deviceNumber)) {
                    await ensurePumpObjects(this, livePump);
                    this.ensuredPumps.add(pump.deviceNumber);
                    this.log.info(
                        `[poll] #${id} discovered pump ${pump.deviceNumber} "${pump.name ?? "?"}" ` +
                            `(index ${pump.index}, control address ${pump.controlAddress !== undefined ? `0x${pump.controlAddress.toString(16)}` : "unknown"}, ` +
                            `live sensors [${sensorIds.join(", ")}])`,
                    );
                }

                await writePumpStates(this, livePump);
                this.log.debug(
                    `[poll] #${id} pump ${pump.deviceNumber}: on=${livePump.dmx.deviceOn} ` +
                        `speed=${livePump.dmx.dimmerValue} (raw) fc=${livePump.dmx.fcStatus}/${livePump.dmx.fcMode} ` +
                        `connected=${livePump.isConnected} ` +
                        `power=${livePump.sensors[10] ?? "?"}W rpm=${livePump.sensors[1] ?? "?"} (live)`,
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
     * Discover which RDM sensors a device actually uses. Scans 0..10 via a live 0x5500 read and
     * keeps the ones that return a non-zero value (the 0-valued ones are unused on this device).
     *
     * @param deviceIndex - the pump's device index
     * @returns the present sensor ids (sorted) and their scan values
     */
    private async discoverLiveSensors(deviceIndex: number): Promise<{ ids: number[]; values: Record<number, number> }> {
        const values: Record<number, number> = {};
        const scan: string[] = [];
        for (let sensorId = 0; sensorId < SENSOR_SCAN_COUNT; sensorId++) {
            const value = await this.readLiveSensor(deviceIndex, sensorId);
            scan.push(`s${sensorId}=${value ?? "-"}`);
            if (value !== undefined && value !== 0) {
                values[sensorId] = value;
            }
        }
        this.log.info(
            `[cloud/live] device index ${deviceIndex} sensor scan (0..${SENSOR_SCAN_COUNT - 1}): ${scan.join(" ")}`,
        );
        return {
            ids: Object.keys(values)
                .map(Number)
                .sort((a, b) => a - b),
            values,
        };
    }

    /**
     * Read the given live sensor values for a device via 0x5500.
     *
     * @param deviceIndex - the pump's device index
     * @param sensorIds - the sensor numbers to read
     * @returns a map of sensor number to live value (only successful reads)
     */
    private async readLiveSensors(deviceIndex: number, sensorIds: number[]): Promise<Record<number, number>> {
        const result: Record<number, number> = {};
        const read: string[] = [];
        for (const sensorId of sensorIds) {
            const value = await this.readLiveSensor(deviceIndex, sensorId);
            if (value !== undefined) {
                result[sensorId] = value;
                read.push(`s${sensorId}=${value}`);
            }
        }
        if (read.length > 0) {
            this.log.debug(`[cloud/live] device index ${deviceIndex}: ${read.join(" ")}`);
        }
        return result;
    }

    /**
     * Read a single live RDM sensor value for a device via the SendONetPacket tunnel (0x5500).
     *
     * @param deviceIndex - the pump's device index
     * @param sensorNumber - the RDM sensor number
     * @returns the live value, or undefined on failure
     */
    private async readLiveSensor(deviceIndex: number, sensorNumber: number): Promise<number | undefined> {
        if (!this.cloud || !this.gatewayId) {
            return undefined;
        }
        try {
            const response = await this.cloud.sendPacket(
                this.gatewayId,
                buildSensorRead(deviceIndex, sensorNumber, this.nextTxn()),
            );
            const dataB64 = extractResponseData(response);
            if (!dataB64) {
                return undefined;
            }
            const parsed = parseSensorReadReply(dataB64);
            if (!parsed || parsed.deviceIndex !== deviceIndex || parsed.sensorNumber !== sensorNumber) {
                return undefined;
            }
            return parsed.value;
        } catch (error) {
            this.log.debug(
                `[cloud/live] read device ${deviceIndex} sensor ${sensorNumber} failed: ` +
                    `${error instanceof Error ? error.message : String(error)}`,
            );
            return undefined;
        }
    }

    /** Replace the pending poll with an earlier one, to reconcile after a command. */
    private scheduleConfirmPoll(): void {
        if (this.stopping) {
            return;
        }
        if (this.pollTimer) {
            this.clearTimeout(this.pollTimer);
            this.pollTimer = undefined;
        }
        this.log.debug(`[cloud/cmd] scheduling confirmation poll in ${COMMAND_CONFIRM_DELAY_MS} ms`);
        this.pollTimer = this.setTimeout(() => {
            this.pollTimer = undefined;
            void this.poll();
        }, COMMAND_CONFIRM_DELAY_MS);
    }

    /**
     * Translate a write on a control state into an ONet command and send it via the cloud.
     *
     * @param id - the full state id that changed
     * @param state - the new (ack:false) state
     */
    private async handleCommand(id: string, state: ioBroker.State): Promise<void> {
        const match = /\.pumps\.(\d+)\.control\.(on|speed|speedRaw)$/.exec(id);
        if (!match) {
            return; // not a control command
        }
        const deviceNumber = Number(match[1]);
        const field = match[2];
        const ctrl = this.pumpControl.get(deviceNumber);
        if (!this.cloud || !this.gatewayId || !ctrl) {
            this.log.warn(
                `[cloud/cmd] cannot handle ${id}=${JSON.stringify(state.val)} yet — ` +
                    "pump/gateway not known (waiting for the first successful poll)",
            );
            return;
        }

        try {
            if (field === "on") {
                const on = state.val === true || state.val === "true" || state.val === 1;
                this.log.info(`[cloud/cmd] pump ${deviceNumber}: set on=${on} (device index ${ctrl.index})`);
                await this.cloud.sendPacket(this.gatewayId, buildSetOn(ctrl.index, on, this.nextTxn()));
                await this.setState(`pumps.${deviceNumber}.control.on`, { val: on, ack: true });
            } else {
                if (ctrl.controlAddress === undefined) {
                    this.log.error(
                        `[cloud/cmd] pump ${deviceNumber}: no control address known (RDM param 96 missing) — ` +
                            "cannot set the speed",
                    );
                    return;
                }
                const raw =
                    field === "speed"
                        ? Math.round((Math.max(0, Math.min(100, Number(state.val))) / 100) * DIMMER_MAX)
                        : Math.max(0, Math.min(DIMMER_MAX, Math.round(Number(state.val))));
                const percent = Math.round((raw / DIMMER_MAX) * 100);
                this.log.info(
                    `[cloud/cmd] pump ${deviceNumber}: set speed raw=${raw} (${percent}%, ` +
                        `control address 0x${ctrl.controlAddress.toString(16)})`,
                );
                await this.cloud.sendPacket(this.gatewayId, buildSetDimmer(ctrl.controlAddress, raw, this.nextTxn()));
                // Reflect both representations immediately; the confirmation poll reconciles with the device.
                await this.setState(`pumps.${deviceNumber}.control.speed`, { val: percent, ack: true });
                await this.setState(`pumps.${deviceNumber}.control.speedRaw`, { val: raw, ack: true });
            }
            this.scheduleConfirmPoll();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log.error(`[cloud/cmd] failed to send command for ${id}=${JSON.stringify(state.val)}: ${message}`);
        }
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
        this.log.debug(`[cloud/cmd] command received: ${id} = ${JSON.stringify(state.val)} (ack=false)`);
        void this.handleCommand(id, state);
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Pondpump(options);
} else {
    // otherwise start the instance directly
    (() => new Pondpump())();
}
