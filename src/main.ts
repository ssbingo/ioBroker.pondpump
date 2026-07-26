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
import {
    type GatewayInfo,
    type PumpInfo,
    parseInventory,
    SENSOR_POWER_W,
    SENSOR_SPEED_RPM,
} from "./lib/cloud/inventory";
import {
    ensureGatewayObjects,
    ensurePumpObjects,
    GATEWAY_ID,
    PUMPS_ROOT_ID,
    writeGatewayStates,
    writePumpStates,
} from "./lib/objects";
import {
    buildSensorRead,
    buildSetDimmer,
    buildSetOn,
    buildSetSfc,
    DIMMER_MAX,
    parseSensorReadReply,
} from "./lib/cloud/onet";
import { generateSelfSignedCert } from "./lib/local/cert";
import { LocalClient } from "./lib/local/client";
import { fetchLocalInventory, toDomainInventory } from "./lib/local/inventory";
import { DEFAULT_TLS_PORT } from "./lib/local/protocol";
import {
    minutesUntilNextChange,
    type ScheduleTarget,
    type SchedulesConfig,
    targetForConfig,
    validatePlans,
} from "./lib/schedule";

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

/** Power (W) below which a pump is considered off/standby (an off pump still draws a few watts). */
const STANDBY_POWER_W = 15;

/** Control data needed to address a pump for commands. */
interface PumpControl {
    deviceNumber: number;
    index: number;
    controlAddress?: number;
}

/** One inventory snapshot to apply in a poll, from either transport. */
interface PollInventory {
    gateway: GatewayInfo;
    pumps: PumpInfo[];
    /** Whether the gateway is reachable. */
    online: boolean;
    /** Whether the dmx-derived control readback (on/speed) is known and should be written. */
    includeControl: boolean;
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
    private local?: LocalClient;
    /** Active connection mode (cloud or local — mutually exclusive). */
    private mode: "cloud" | "local" = "cloud";
    /** Local inventory (gateway + pumps), read once over the channel and cached. */
    private localInventory?: { gateway: GatewayInfo; pumps: PumpInfo[] };
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
    /** Per-pump time schedules (Phase 9), loaded from the config on start. */
    private schedules: SchedulesConfig = {};
    /** The scheduler tick timer (chained; re-evaluated at each window boundary). */
    private scheduleTimer?: ioBroker.Timeout;
    /** Whether the scheduler has been started (after the first successful poll). */
    private scheduleStarted = false;
    /** Last target the scheduler applied per pump device number, to only send commands on change. */
    private readonly lastScheduleTarget = new Map<number, string>();

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

        // Cloud and local are mutually exclusive; the legacy "both" value is migrated to cloud.
        const configured = String(this.config.connectionMode);
        let mode: "cloud" | "local";
        if (configured === "local") {
            mode = "local";
        } else if (configured === "cloud") {
            mode = "cloud";
        } else if (configured === "both") {
            this.log.warn(
                "[config] connection mode 'both' is no longer supported — falling back to 'cloud'. " +
                    "Please set the connection mode to 'cloud' or 'local' in the adapter settings.",
            );
            mode = "cloud";
        } else {
            this.log.error(
                `[config] invalid connection mode ${JSON.stringify(configured)} — expected "cloud" or "local". ` +
                    "Check the adapter configuration; the adapter will not do anything.",
            );
            return;
        }
        this.mode = mode;

        // Expose the active data source and rebuild the objects cleanly if the mode changed.
        await this.applyConnectionType(mode);

        this.pollIntervalMs = Math.max(MIN_POLL_INTERVAL_S, this.config.pollInterval || 30) * 1000;
        this.loadSchedules();
        const baseUrl = this.config.cloudBaseUrl || DEFAULT_BASE_URL;
        const tokenUrl = this.config.cloudTokenUrl || DEFAULT_TOKEN_URL;
        const clientId = this.config.cloudClientId || DEFAULT_CLIENT_ID;
        const scope = this.config.cloudScope || DEFAULT_SCOPE;
        this.log.debug(
            `[config] mode=${mode} pollInterval=${this.pollIntervalMs / 1000}s baseUrl=${baseUrl} ` +
                `tokenUrl=${tokenUrl.split("?")[0]} clientId=${clientId} ` +
                `refreshTokenConfigured=${this.config.cloudRefreshToken ? "yes" : "no"}`,
        );

        // Local transport: bring up the LAN channel and poll over it. Otherwise use the cloud path.
        if (mode === "local") {
            await this.runLocal();
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
            timers: {
                setTimeout: (cb, ms) => this.setTimeout(cb, ms),
                clearTimeout: handle => this.clearTimeout(handle),
                setInterval: (cb, ms) => this.setInterval(cb, ms),
                clearInterval: handle => this.clearInterval(handle),
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
     * @param connected - whether the connection (cloud or local) is currently up
     */
    private async setConnected(connected: boolean): Promise<void> {
        await this.setState("info.connection", connected, true);
        if (this.lastConnected !== connected) {
            if (connected) {
                this.log.info("[conn] connection established (info.connection = true)");
            } else if (this.lastConnected !== undefined) {
                this.log.warn("[conn] connection lost (info.connection = false)");
            }
            this.lastConnected = connected;
        }
    }

    /**
     * Record the active data source in `info.connectionType`, and — when the mode changed since the
     * previous run — remove the old gateway/pump object tree so cloud and local objects never mix.
     *
     * @param mode - the connection mode this session runs in
     */
    private async applyConnectionType(mode: "cloud" | "local"): Promise<void> {
        await this.setObjectNotExistsAsync("info.connectionType", {
            type: "state",
            common: {
                name: "Active data source (cloud or local)",
                type: "string",
                role: "text",
                read: true,
                write: false,
                def: "",
            },
            native: {},
        });
        const previous = await this.getStateAsync("info.connectionType");
        const previousMode = typeof previous?.val === "string" && previous.val ? previous.val : undefined;
        if (previousMode && previousMode !== mode) {
            this.log.info(
                `[config] connection mode changed from '${previousMode}' to '${mode}' — ` +
                    "rebuilding the device objects cleanly",
            );
            for (const id of [GATEWAY_ID, PUMPS_ROOT_ID]) {
                try {
                    await this.delObjectAsync(id, { recursive: true });
                    this.log.debug(`[config] removed old object tree '${id}'`);
                } catch (error) {
                    this.log.debug(
                        `[config] could not remove '${id}': ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }
            // The in-memory "already ensured" flags are fresh per process start, so the next poll
            // re-creates the objects; clear any cached local inventory just in case.
            this.gatewayEnsured = false;
            this.ensuredPumps.clear();
            this.liveSensorIds.clear();
            this.localInventory = undefined;
        }
        await this.setState("info.connectionType", { val: mode, ack: true });
        this.log.debug(`[config] active data source: ${mode}`);
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

    /**
     * Phase 3 local transport bring-up: start the TLS server, wake the controller, authenticate,
     * then probe the channel with a discovery request. This establishes the local channel; the
     * unified local poll/telemetry builds on top of it next.
     */
    private async runLocal(): Promise<void> {
        const ip = (this.config.ip || "").trim();
        const bind = (this.config.bind || "0.0.0.0").trim();
        const port = this.config.port || DEFAULT_TLS_PORT;
        const password = this.config.devicePassword || "";

        if (!ip) {
            this.log.error(
                "[config] local mode needs the controller IP ('ip') — enter the OASE controller's address " +
                    "in the adapter settings",
            );
            return;
        }
        if (!password) {
            this.log.error(
                "[config] local mode needs the device password ('devicePassword') — enter the 64-character " +
                    "device password in the adapter settings",
            );
            return;
        }
        if (bind === "0.0.0.0") {
            this.log.warn(
                "[config] TLS bind is 0.0.0.0 — if the controller does not connect back, set 'bind' to this " +
                    "host's concrete LAN IP so the wake packet can advertise a reachable address",
            );
        }

        this.log.info(
            `[local] starting local transport — controller ${ip}, TLS server ${bind}:${port} ` +
                `(device password len=${password.length})`,
        );

        let credentials;
        try {
            credentials = await generateSelfSignedCert();
            this.log.debug("[local/tls] generated self-signed server certificate (CN com.oase.easycontrol)");
        } catch (error) {
            this.log.error(
                `[local/tls] certificate generation failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return;
        }

        this.local = new LocalClient({
            ip,
            bindAddress: bind,
            port,
            password,
            credentials,
            log: {
                debug: m => this.log.debug(m),
                info: m => this.log.info(m),
                warn: m => this.log.warn(m),
                error: m => this.log.error(m),
            },
            timers: {
                setTimeout: (cb, ms) => this.setTimeout(cb, ms),
                clearTimeout: handle => this.clearTimeout(handle),
                setInterval: (cb, ms) => this.setInterval(cb, ms),
                clearInterval: handle => this.clearInterval(handle),
            },
            onConnectionChange: up => {
                void this.setConnected(up);
            },
        });

        try {
            await this.local.connect();
        } catch (error) {
            await this.setConnected(false);
            this.log.error(
                `[local] could not establish the local connection: ${error instanceof Error ? error.message : String(error)}`,
            );
            return;
        }

        // Listen for control commands and start the poll loop over the local channel.
        this.subscribeStates("pumps.*.control.*");
        this.log.info("[local] local channel established — starting poll loop over the LAN");
        void this.poll();
    }

    /** One poll cycle: fetch inventory (cloud or local), update objects/states, reschedule. */
    private async poll(): Promise<void> {
        if (this.stopping) {
            return;
        }
        const id = ++this.pollCount;
        const startedAt = Date.now();
        this.log.debug(`[poll] #${id} start`);

        const inv =
            this.mode === "local"
                ? await this.fetchLocalInventoryForPoll(id)
                : await this.fetchCloudInventoryForPoll(id);
        if (!inv) {
            this.scheduleNextPoll();
            return;
        }

        try {
            await this.applyInventory(id, inv, startedAt);
        } catch (error) {
            await this.setConnected(false);
            const message = error instanceof Error ? error.message : String(error);
            this.log.error(`[poll] #${id} failed while writing objects/states: ${message}`);
        } finally {
            this.scheduleNextPoll();
        }
    }

    /**
     * Fetch + parse the cloud inventory for one poll; logs and returns undefined on error.
     *
     * @param id - poll cycle number (for log correlation)
     */
    private async fetchCloudInventoryForPoll(id: number): Promise<PollInventory | undefined> {
        if (!this.cloud) {
            return undefined;
        }
        let raw: unknown;
        try {
            raw = await this.cloud.fetchInventory();
        } catch (error) {
            await this.setConnected(false);
            const message = error instanceof Error ? error.message : String(error);
            if (error instanceof CloudAuthError) {
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
            return undefined;
        }

        try {
            const inventory = parseInventory(raw);
            this.gatewayId = inventory.gateway.id;
            return {
                gateway: inventory.gateway,
                pumps: inventory.pumps,
                online: inventory.gateway.isOnline ?? true,
                includeControl: true,
            };
        } catch (error) {
            await this.setConnected(false);
            const message = error instanceof Error ? error.message : String(error);
            const shape =
                raw && typeof raw === "object" ? `keys=[${Object.keys(raw).join(",")}]` : `type=${typeof raw}`;
            this.log.error(
                `[poll] #${id} inventory parse failed: ${message}. Raw response ${shape}. ` +
                    "The OASE cloud format may have changed — please report this with debug logs.",
            );
            return undefined;
        }
    }

    /**
     * Provide the (cached) local inventory for one poll; reads it once over the channel.
     *
     * @param id - poll cycle number (for log correlation)
     */
    private async fetchLocalInventoryForPoll(id: number): Promise<PollInventory | undefined> {
        if (!this.local?.isReady) {
            this.log.debug(`[poll] #${id} local channel not ready`);
            await this.setConnected(false);
            return undefined;
        }
        if (!this.localInventory) {
            try {
                this.localInventory = toDomainInventory(await fetchLocalInventory(this.local, () => this.nextTxn()));
                const gw = this.localInventory.gateway;
                this.log.info(
                    `[poll] #${id} local inventory: gateway "${gw.name}" (${gw.serialNumber}), ` +
                        `${this.localInventory.pumps.length} pump(s)`,
                );
            } catch (error) {
                await this.setConnected(false);
                this.log.warn(
                    `[poll] #${id} local inventory read failed: ${error instanceof Error ? error.message : String(error)}`,
                );
                return undefined;
            }
        }
        return {
            gateway: this.localInventory.gateway,
            pumps: this.localInventory.pumps,
            online: true,
            includeControl: false,
        };
    }

    /**
     * Shared poll body: ensure objects, read live sensors and write states for one inventory snapshot.
     *
     * @param id - poll cycle number
     * @param inv - the inventory snapshot to apply
     * @param startedAt - poll start time (ms) for the timing summary
     */
    private async applyInventory(id: number, inv: PollInventory, startedAt: number): Promise<void> {
        const { gateway, pumps, online, includeControl } = inv;
        if (!this.gatewayEnsured) {
            await ensureGatewayObjects(this, gateway);
            this.gatewayEnsured = true;
            this.log.debug(`[poll] #${id} gateway objects ensured`);
        }
        await writeGatewayStates(this, gateway, online);

        for (const pump of pumps) {
            this.cachePumpControl(pump);

            // Discover the pump's live sensor set once (scan 0..10 via 0x5500), then re-read the
            // present ones; fast sensors (rpm/power) every poll, slow ones only every Nth poll.
            let sensorIds = this.liveSensorIds.get(pump.deviceNumber);
            let liveSensors: Record<number, number>;
            if (sensorIds === undefined) {
                const discovery = await this.discoverLiveSensors(pump.index);
                sensorIds = discovery.ids;
                liveSensors = discovery.values;
                this.liveSensorIds.set(pump.deviceNumber, sensorIds);
            } else {
                const readSlow = id % SLOW_SENSOR_EVERY === 0;
                const idsToRead = readSlow ? sensorIds : sensorIds.filter(s => FAST_SENSOR_IDS.includes(s));
                liveSensors = await this.readLiveSensors(pump.index, idsToRead);
            }

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

            await writePumpStates(this, livePump, { includeControl });

            // The dmx speed setpoint is not readable locally, but on/off is unambiguous from live
            // telemetry: an off pump stands still (rpm 0) and only draws a small standby power
            // (~5 W), while a running one turns and draws much more. Derive control.on from rpm (or
            // a clearly-above-standby power) when the dmx state is unknown (local mode), so the
            // on/off readback is correct and reflects changes made in the OASE app too.
            const rpm = livePump.sensors[SENSOR_SPEED_RPM] ?? 0;
            const power = livePump.sensors[SENSOR_POWER_W] ?? 0;
            const derivedOn = rpm > 0 || power > STANDBY_POWER_W;
            if (!includeControl) {
                await this.setState(`pumps.${pump.deviceNumber}.control.on`, { val: derivedOn, ack: true });
            }

            const control = includeControl
                ? `on=${livePump.dmx.deviceOn} speed=${livePump.dmx.dimmerValue} (raw) `
                : `on=${derivedOn} (from telemetry) `;
            this.log.debug(
                `[poll] #${id} pump ${pump.deviceNumber}: ${control}connected=${livePump.isConnected} ` +
                    `power=${power}W rpm=${rpm} (live)`,
            );
        }

        await this.setConnected(true);
        this.maybeStartScheduler();
        const took = Date.now() - startedAt;
        const summary = `gateway ${gateway.serialNumber} "${gateway.name}" online=${online}, ${pumps.length} pump(s), ${took} ms`;
        if (id === 1) {
            this.log.info(`[poll] #${id} ok — ${summary}`);
        } else {
            this.log.debug(`[poll] #${id} ok — ${summary}`);
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
            `[live] device index ${deviceIndex} sensor scan (0..${SENSOR_SCAN_COUNT - 1}): ${scan.join(" ")}`,
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
            this.log.debug(`[live] device index ${deviceIndex}: ${read.join(" ")}`);
        }
        return result;
    }

    /**
     * Send a raw ONet packet (base64) over the active transport and return the reply (base64).
     * The local channel is preferred when ready; otherwise the cloud SendONetPacket tunnel is used.
     *
     * @param dataB64 - the request packet, base64-encoded
     */
    private async sendOnet(dataB64: string): Promise<string | undefined> {
        if (this.local?.isReady) {
            return this.local.sendOnet(dataB64);
        }
        if (this.cloud && this.gatewayId) {
            return extractResponseData(await this.cloud.sendPacket(this.gatewayId, dataB64));
        }
        return undefined;
    }

    /**
     * Read a single live RDM sensor value for a device (0x5500), over cloud or local transport.
     *
     * @param deviceIndex - the pump's device index
     * @param sensorNumber - the RDM sensor number
     * @returns the live value, or undefined on failure
     */
    private async readLiveSensor(deviceIndex: number, sensorNumber: number): Promise<number | undefined> {
        try {
            const dataB64 = await this.sendOnet(buildSensorRead(deviceIndex, sensorNumber, this.nextTxn()));
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
                `[live] read device ${deviceIndex} sensor ${sensorNumber} failed: ` +
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
        this.log.debug(`[cmd] scheduling confirmation poll in ${COMMAND_CONFIRM_DELAY_MS} ms`);
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
        const match = /\.pumps\.(\d+)\.control\.(on|sfc|speed|speedRaw)$/.exec(id);
        if (!match) {
            return; // not a control command
        }
        const deviceNumber = Number(match[1]);
        const field = match[2];
        const ctrl = this.pumpControl.get(deviceNumber);
        const transportReady = this.local?.isReady || (this.cloud && this.gatewayId);
        if (!transportReady || !ctrl) {
            this.log.warn(
                `[cmd] cannot handle ${id}=${JSON.stringify(state.val)} yet — ` +
                    "pump/transport not ready (waiting for the first successful poll)",
            );
            return;
        }

        try {
            if (field === "on") {
                const on = state.val === true || state.val === "true" || state.val === 1;
                this.log.info(`[cmd] pump ${deviceNumber}: set on=${on} (device index ${ctrl.index})`);
                await this.sendOnet(buildSetOn(ctrl.index, on, this.nextTxn()));
                await this.setState(`pumps.${deviceNumber}.control.on`, { val: on, ack: true });
            } else if (field === "sfc") {
                const on = state.val === true || state.val === "true" || state.val === 1;
                this.log.info(`[cmd] pump ${deviceNumber}: set SFC ${on ? "on" : "off"} (device index ${ctrl.index})`);
                await this.sendOnet(buildSetSfc(ctrl.index, on, this.nextTxn()));
                await this.setState(`pumps.${deviceNumber}.control.sfc`, { val: on, ack: true });
            } else {
                if (ctrl.controlAddress === undefined) {
                    this.log.error(
                        `[cmd] pump ${deviceNumber}: no control address known (RDM param 96 missing) — ` +
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
                    `[cmd] pump ${deviceNumber}: set speed raw=${raw} (${percent}%, ` +
                        `control address 0x${ctrl.controlAddress.toString(16)})`,
                );
                await this.sendOnet(buildSetDimmer(ctrl.controlAddress, raw, this.nextTxn()));
                // Reflect both representations immediately; the confirmation poll reconciles with the device.
                await this.setState(`pumps.${deviceNumber}.control.speed`, { val: percent, ack: true });
                await this.setState(`pumps.${deviceNumber}.control.speedRaw`, { val: raw, ack: true });
            }
            this.scheduleConfirmPoll();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log.error(`[cmd] failed to send command for ${id}=${JSON.stringify(state.val)}: ${message}`);
        }
    }

    /** Load the per-pump schedules from the config and log any invalid (which are then skipped). */
    private loadSchedules(): void {
        const raw = this.config.schedules;
        this.schedules = raw && typeof raw === "object" ? raw : {};
        let enabled = 0;
        for (const [dn, cfg] of Object.entries(this.schedules)) {
            if (!cfg?.enabled) {
                continue;
            }
            const result = validatePlans(cfg.plans || []);
            if (result.valid) {
                enabled++;
            } else {
                this.log.error(`[schedule] pump ${dn}: schedule ignored — ${result.error}`);
            }
        }
        this.log.info(enabled > 0 ? `[schedule] active for ${enabled} pump(s)` : "[schedule] no pump schedules");
    }

    /** Start the scheduler once (after the first successful poll) if any pump has a valid schedule. */
    private maybeStartScheduler(): void {
        if (this.scheduleStarted || this.stopping) {
            return;
        }
        const anyValid = Object.values(this.schedules).some(
            cfg => cfg?.enabled && validatePlans(cfg.plans || []).valid,
        );
        if (!anyValid) {
            return;
        }
        this.scheduleStarted = true;
        this.log.info("[schedule] starting the pump scheduler");
        void this.runScheduler();
    }

    /**
     * Evaluate every scheduled pump for the current wall-clock time, apply any changed target via the
     * command path, then re-arm the tick for the next window boundary (capped at 60 min so the loop
     * self-corrects against clock drift / DST; a re-evaluation without a target change sends nothing).
     */
    private async runScheduler(): Promise<void> {
        if (this.stopping) {
            return;
        }
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        let nextChange = 60;

        for (const [dnStr, cfg] of Object.entries(this.schedules)) {
            if (!cfg?.enabled || !validatePlans(cfg.plans || []).valid) {
                continue;
            }
            const deviceNumber = Number(dnStr);
            if (!this.pumpControl.has(deviceNumber)) {
                continue; // pump not discovered yet — will be picked up on a later tick
            }
            await this.applyScheduleTarget(deviceNumber, targetForConfig(cfg, nowMin));
            nextChange = Math.min(nextChange, minutesUntilNextChange(cfg.plans || [], nowMin));
        }

        // +2 s so the tick lands just inside the new window, never a hair before the boundary.
        const delayMs = Math.max(1, nextChange) * 60_000 + 2_000;
        this.scheduleTimer = this.setTimeout(() => {
            this.scheduleTimer = undefined;
            void this.runScheduler();
        }, delayMs);
    }

    /**
     * Apply a scheduled target to a pump, but only when it differs from the last applied target, by
     * writing the control states as commands (ack:false) so the normal command path sends them.
     *
     * @param deviceNumber - the pump device number
     * @param target - the desired SFC/power state for now
     */
    private async applyScheduleTarget(deviceNumber: number, target: ScheduleTarget): Promise<void> {
        const key = `sfc=${target.sfc};power=${target.power}`;
        if (this.lastScheduleTarget.get(deviceNumber) === key) {
            return;
        }
        this.lastScheduleTarget.set(deviceNumber, key);
        this.log.info(`[schedule] pump ${deviceNumber}: applying ${key}`);
        if (target.sfc) {
            // SFC on overrides the flow; leave the power setpoint untouched.
            await this.setState(`pumps.${deviceNumber}.control.sfc`, { val: true, ack: false });
        } else {
            await this.setState(`pumps.${deviceNumber}.control.sfc`, { val: false, ack: false });
            await this.setState(`pumps.${deviceNumber}.control.speed`, { val: target.power, ack: false });
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - Callback function
     */
    private onUnload(callback: () => void): void {
        try {
            this.log.debug("[shutdown] onUnload: stopping poll loop and releasing transports");
            this.stopping = true;
            if (this.pollTimer) {
                this.clearTimeout(this.pollTimer);
                this.pollTimer = undefined;
            }
            if (this.scheduleTimer) {
                this.clearTimeout(this.scheduleTimer);
                this.scheduleTimer = undefined;
            }
            this.cloud?.reset();
            this.cloud = undefined;
            this.local?.reset();
            this.local = undefined;
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
        this.log.debug(`[cmd] command received: ${id} = ${JSON.stringify(state.val)} (ack=false)`);
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
