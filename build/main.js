"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_client = require("./lib/cloud/client");
var import_inventory = require("./lib/cloud/inventory");
var import_objects = require("./lib/objects");
var import_onet = require("./lib/cloud/onet");
var import_cert = require("./lib/local/cert");
var import_client2 = require("./lib/local/client");
var import_inventory2 = require("./lib/local/inventory");
var import_protocol = require("./lib/local/protocol");
var import_schedule = require("./lib/schedule");
var import_astro = require("./lib/astro");
const MIN_POLL_INTERVAL_S = 5;
const GEOCODE_TIMEOUT_MS = 1e4;
const REFRESH_TOKEN_STATE = "cloud.refreshToken";
const COMMAND_CONFIRM_DELAY_MS = 2e3;
const SENSOR_SCAN_COUNT = 11;
const FAST_SENSOR_IDS = [import_inventory.SENSOR_SPEED_RPM, import_inventory.SENSOR_POWER_W];
const SLOW_SENSOR_EVERY = 6;
const STANDBY_POWER_W = 15;
function minuteToHhmm(minute) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function fmtNum(v) {
  return v === void 0 || !Number.isFinite(v) ? "n/a" : String(Math.round(v * 100) / 100);
}
function fmtSources(sources) {
  const entries = Object.entries(sources);
  if (!entries.length) {
    return "(none)";
  }
  return entries.map(([id, v]) => `${id}=${fmtNum(v)}`).join(", ");
}
function fmtAstro(astro, nowMin) {
  const sr = astro.sunriseMin === null ? "n/a" : minuteToHhmm(astro.sunriseMin);
  const ss = astro.sunsetMin === null ? "n/a" : minuteToHhmm(astro.sunsetMin);
  return `sunrise=${sr} sunset=${ss} isDay=${activeWindowIsDay(astro, nowMin)}`;
}
function minuteToTodayTs(minute) {
  if (minute === null) {
    return 0;
  }
  const d = /* @__PURE__ */ new Date();
  d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return d.getTime();
}
function windowLabelOf(win, astro) {
  if (!win) {
    return "";
  }
  const s = (0, import_schedule.resolveBound)(win.startMode, win.start, win.startOffset, astro);
  const e = (0, import_schedule.resolveBound)(win.endMode, win.end, win.endOffset, astro);
  return `${s === null ? "?" : minuteToHhmm(s)}\u2013${e === null ? "?" : minuteToHhmm(e)}`;
}
function activeWindowIsDay(astro, nowMin) {
  const { sunriseMin: sr, sunsetMin: ss } = astro;
  if (sr === null || ss === null) {
    return false;
  }
  return sr < ss ? nowMin >= sr && nowMin < ss : nowMin >= sr || nowMin < ss;
}
function extractResponseData(response) {
  if (response && typeof response === "object") {
    const record = response;
    if (typeof record.data === "string") {
      return record.data;
    }
    if (typeof record.Data === "string") {
      return record.Data;
    }
  }
  return void 0;
}
class Pondpump extends utils.Adapter {
  cloud;
  local;
  /** Active connection mode (cloud or local — mutually exclusive). */
  mode = "cloud";
  /** Local inventory (gateway + pumps), read once over the channel and cached. */
  localInventory;
  pollTimer;
  pollIntervalMs = 3e4;
  /** Set true in onUnload so a poll in flight does not reschedule. */
  stopping = false;
  /** Incrementing poll counter used to correlate log lines of one cycle. */
  pollCount = 0;
  /** Last known info.connection value, to log only on transitions. */
  lastConnected;
  /** Gateway cloud UUID (target of SendONetPacket), learned from the inventory. */
  gatewayId;
  /** Whether gateway objects were already created/updated this session. */
  gatewayEnsured = false;
  /** Pumps whose objects were already created/updated this session. */
  ensuredPumps = /* @__PURE__ */ new Set();
  /** Control addressing per pump device number, learned from the inventory. */
  pumpControl = /* @__PURE__ */ new Map();
  /** Rolling transaction number for ONet packets (0..255). */
  txn = 0;
  /** Live sensor ids discovered per pump device number (RDM sensors that answer a 0x5500 read). */
  liveSensorIds = /* @__PURE__ */ new Map();
  /** Per-pump time schedules (Phase 9), loaded from the config on start. */
  schedules = {};
  /** The scheduler tick timer (chained; re-evaluated at each window boundary). */
  scheduleTimer;
  /** Whether the scheduler has been started (after the first successful poll). */
  scheduleStarted = false;
  /** Last target the scheduler applied per pump device number, to only send commands on change. */
  lastScheduleTarget = /* @__PURE__ */ new Map();
  /** State ids the schedules read for their temperature/weather conditions (Phase 11); subscribed. */
  scheduleSourceOids = /* @__PURE__ */ new Set();
  /** Debounce timer coalescing bursts of source-state changes before re-evaluating. */
  scheduleReevalTimer;
  /** Per-pump smoothing/hysteresis/ramp runtime state (Phase 12), keyed by device number. */
  scheduleRuntime = /* @__PURE__ */ new Map();
  /** Last value written to each actuator target (Phase 12), so writes only fire on change. */
  lastActuatorValue = /* @__PURE__ */ new Map();
  /** ioBroker system coordinates (Phase 13), cached from system.config; null when unset. */
  systemCoords = null;
  /** Today's resolved sunrise/sunset per pump device number (Phase 13). */
  pumpAstro = /* @__PURE__ */ new Map();
  /** Timer that recomputes the astro times just after midnight (Phase 13). */
  midnightTimer;
  constructor(options = {}) {
    super({
      ...options,
      name: "pondpump"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    await this.setConnected(false);
    const configured = String(this.config.connectionMode);
    let mode;
    if (configured === "local") {
      mode = "local";
    } else if (configured === "cloud") {
      mode = "cloud";
    } else if (configured === "both") {
      this.log.warn(
        "[config] connection mode 'both' is no longer supported \u2014 falling back to 'cloud'. Please set the connection mode to 'cloud' or 'local' in the adapter settings."
      );
      mode = "cloud";
    } else {
      this.log.error(
        `[config] invalid connection mode ${JSON.stringify(configured)} \u2014 expected "cloud" or "local". Check the adapter configuration; the adapter will not do anything.`
      );
      return;
    }
    this.mode = mode;
    await this.applyConnectionType(mode);
    this.pollIntervalMs = Math.max(MIN_POLL_INTERVAL_S, this.config.pollInterval || 30) * 1e3;
    this.loadSchedules();
    await this.setupAstro();
    const baseUrl = this.config.cloudBaseUrl || import_client.DEFAULT_BASE_URL;
    const tokenUrl = this.config.cloudTokenUrl || import_client.DEFAULT_TOKEN_URL;
    const clientId = this.config.cloudClientId || import_client.DEFAULT_CLIENT_ID;
    const scope = this.config.cloudScope || import_client.DEFAULT_SCOPE;
    this.log.debug(
      `[config] mode=${mode} pollInterval=${this.pollIntervalMs / 1e3}s baseUrl=${baseUrl} tokenUrl=${tokenUrl.split("?")[0]} clientId=${clientId} refreshTokenConfigured=${this.config.cloudRefreshToken ? "yes" : "no"}`
    );
    if (mode === "local") {
      await this.runLocal();
      return;
    }
    await this.ensureRefreshTokenState();
    const persisted = await this.getStateAsync(REFRESH_TOKEN_STATE);
    const persistedToken = typeof (persisted == null ? void 0 : persisted.val) === "string" ? persisted.val : "";
    const refreshToken = persistedToken || this.config.cloudRefreshToken || "";
    if (!refreshToken) {
      this.log.warn(
        "[config] no cloud refresh token available. Capture a refresh token from an OASE app login and enter it in the adapter settings ('Cloud refresh token') before the cloud connection can be established."
      );
      return;
    }
    this.log.info(
      `[startup] using refresh token from ${persistedToken ? "persisted state (rotated)" : "adapter config"} (len=${refreshToken.length})`
    );
    this.cloud = new import_client.CloudClient({
      baseUrl,
      tokenUrl,
      clientId,
      scope,
      refreshToken,
      log: {
        debug: (m) => this.log.debug(m),
        info: (m) => this.log.info(m),
        warn: (m) => this.log.warn(m),
        error: (m) => this.log.error(m)
      },
      timers: {
        setTimeout: (cb, ms) => this.setTimeout(cb, ms),
        clearTimeout: (handle) => this.clearTimeout(handle),
        setInterval: (cb, ms) => this.setInterval(cb, ms),
        clearInterval: (handle) => this.clearInterval(handle)
      },
      onRefreshToken: (token) => {
        this.log.debug(`[cloud/auth] persisting rotated refresh token to ${REFRESH_TOKEN_STATE}`);
        void this.setState(REFRESH_TOKEN_STATE, token, true);
      }
    });
    this.subscribeStates("pumps.*.control.*");
    this.log.info(
      `[startup] adapter ready in "${mode}" mode \u2014 polling ${baseUrl} every ${this.pollIntervalMs / 1e3}s`
    );
    void this.poll();
  }
  /**
   * Cache the addressing needed to send commands to a pump.
   *
   * @param pump - pump info from the latest inventory
   */
  cachePumpControl(pump) {
    this.pumpControl.set(pump.deviceNumber, {
      deviceNumber: pump.deviceNumber,
      index: pump.index,
      controlAddress: pump.controlAddress
    });
  }
  /** Next rolling transaction number (0..255) for an ONet packet. */
  nextTxn() {
    this.txn = this.txn + 1 & 255;
    return this.txn;
  }
  /**
   * Update info.connection and log only on state transitions.
   *
   * @param connected - whether the connection (cloud or local) is currently up
   */
  async setConnected(connected) {
    await this.setState("info.connection", connected, true);
    if (this.lastConnected !== connected) {
      if (connected) {
        this.log.info("[conn] connection established (info.connection = true)");
      } else if (this.lastConnected !== void 0) {
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
  async applyConnectionType(mode) {
    await this.setObjectNotExistsAsync("info.connectionType", {
      type: "state",
      common: {
        name: "Active data source (cloud or local)",
        type: "string",
        role: "text",
        read: true,
        write: false,
        def: ""
      },
      native: {}
    });
    const previous = await this.getStateAsync("info.connectionType");
    const previousMode = typeof (previous == null ? void 0 : previous.val) === "string" && previous.val ? previous.val : void 0;
    if (previousMode && previousMode !== mode) {
      this.log.info(
        `[config] connection mode changed from '${previousMode}' to '${mode}' \u2014 rebuilding the device objects cleanly`
      );
      for (const id of [import_objects.GATEWAY_ID, import_objects.PUMPS_ROOT_ID]) {
        try {
          await this.delObjectAsync(id, { recursive: true });
          this.log.debug(`[config] removed old object tree '${id}'`);
        } catch (error) {
          this.log.debug(
            `[config] could not remove '${id}': ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      this.gatewayEnsured = false;
      this.ensuredPumps.clear();
      this.liveSensorIds.clear();
      this.localInventory = void 0;
    }
    await this.setState("info.connectionType", { val: mode, ack: true });
    this.log.debug(`[config] active data source: ${mode}`);
  }
  /** Create the (non-writable) state that persists the rotating cloud refresh token. */
  async ensureRefreshTokenState() {
    await this.setObjectNotExistsAsync("cloud", {
      type: "channel",
      common: { name: "Cloud" },
      native: {}
    });
    await this.setObjectNotExistsAsync(REFRESH_TOKEN_STATE, {
      type: "state",
      common: {
        name: "Cloud refresh token (rotating, secret)",
        type: "string",
        role: "text",
        read: true,
        write: false,
        def: ""
      },
      native: {}
    });
  }
  /**
   * Phase 3 local transport bring-up: start the TLS server, wake the controller, authenticate,
   * then probe the channel with a discovery request. This establishes the local channel; the
   * unified local poll/telemetry builds on top of it next.
   */
  async runLocal() {
    const ip = (this.config.ip || "").trim();
    const bind = (this.config.bind || "0.0.0.0").trim();
    const port = this.config.port || import_protocol.DEFAULT_TLS_PORT;
    const password = this.config.devicePassword || "";
    if (!ip) {
      this.log.error(
        "[config] local mode needs the controller IP ('ip') \u2014 enter the OASE controller's address in the adapter settings"
      );
      return;
    }
    if (!password) {
      this.log.error(
        "[config] local mode needs the device password ('devicePassword') \u2014 enter the 64-character device password in the adapter settings"
      );
      return;
    }
    if (bind === "0.0.0.0") {
      this.log.warn(
        "[config] TLS bind is 0.0.0.0 \u2014 if the controller does not connect back, set 'bind' to this host's concrete LAN IP so the wake packet can advertise a reachable address"
      );
    }
    this.log.info(
      `[local] starting local transport \u2014 controller ${ip}, TLS server ${bind}:${port} (device password len=${password.length})`
    );
    let credentials;
    try {
      credentials = await (0, import_cert.generateSelfSignedCert)();
      this.log.debug("[local/tls] generated self-signed server certificate (CN com.oase.easycontrol)");
    } catch (error) {
      this.log.error(
        `[local/tls] certificate generation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }
    this.local = new import_client2.LocalClient({
      ip,
      bindAddress: bind,
      port,
      password,
      credentials,
      log: {
        debug: (m) => this.log.debug(m),
        info: (m) => this.log.info(m),
        warn: (m) => this.log.warn(m),
        error: (m) => this.log.error(m)
      },
      timers: {
        setTimeout: (cb, ms) => this.setTimeout(cb, ms),
        clearTimeout: (handle) => this.clearTimeout(handle),
        setInterval: (cb, ms) => this.setInterval(cb, ms),
        clearInterval: (handle) => this.clearInterval(handle)
      },
      onConnectionChange: (up) => {
        void this.setConnected(up);
      }
    });
    try {
      await this.local.connect();
    } catch (error) {
      await this.setConnected(false);
      this.log.error(
        `[local] could not establish the local connection: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }
    this.subscribeStates("pumps.*.control.*");
    this.log.info("[local] local channel established \u2014 starting poll loop over the LAN");
    void this.poll();
  }
  /** One poll cycle: fetch inventory (cloud or local), update objects/states, reschedule. */
  async poll() {
    if (this.stopping) {
      return;
    }
    const id = ++this.pollCount;
    const startedAt = Date.now();
    this.log.debug(`[poll] #${id} start`);
    const inv = this.mode === "local" ? await this.fetchLocalInventoryForPoll(id) : await this.fetchCloudInventoryForPoll(id);
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
  async fetchCloudInventoryForPoll(id) {
    var _a;
    if (!this.cloud) {
      return void 0;
    }
    let raw;
    try {
      raw = await this.cloud.fetchInventory();
    } catch (error) {
      await this.setConnected(false);
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof import_client.CloudAuthError) {
        this.log.error(
          `[poll] #${id} AUTH FAILED \u2014 ${message} (fix: enter a fresh 'Cloud refresh token' captured from an OASE app login)`
        );
      } else if (error instanceof import_client.CloudRequestError) {
        this.log.warn(
          `[poll] #${id} cloud request error${error.status ? ` (HTTP ${error.status})` : ""}: ${message}`
        );
      } else {
        this.log.error(`[poll] #${id} unexpected fetch error: ${message}`);
      }
      return void 0;
    }
    try {
      const inventory = (0, import_inventory.parseInventory)(raw);
      this.gatewayId = inventory.gateway.id;
      return {
        gateway: inventory.gateway,
        pumps: inventory.pumps,
        online: (_a = inventory.gateway.isOnline) != null ? _a : true,
        includeControl: true
      };
    } catch (error) {
      await this.setConnected(false);
      const message = error instanceof Error ? error.message : String(error);
      const shape = raw && typeof raw === "object" ? `keys=[${Object.keys(raw).join(",")}]` : `type=${typeof raw}`;
      this.log.error(
        `[poll] #${id} inventory parse failed: ${message}. Raw response ${shape}. The OASE cloud format may have changed \u2014 please report this with debug logs.`
      );
      return void 0;
    }
  }
  /**
   * Provide the (cached) local inventory for one poll; reads it once over the channel.
   *
   * @param id - poll cycle number (for log correlation)
   */
  async fetchLocalInventoryForPoll(id) {
    var _a;
    if (!((_a = this.local) == null ? void 0 : _a.isReady)) {
      this.log.debug(`[poll] #${id} local channel not ready`);
      await this.setConnected(false);
      return void 0;
    }
    if (!this.localInventory) {
      try {
        this.localInventory = (0, import_inventory2.toDomainInventory)(await (0, import_inventory2.fetchLocalInventory)(this.local, () => this.nextTxn()));
        const gw = this.localInventory.gateway;
        this.log.info(
          `[poll] #${id} local inventory: gateway "${gw.name}" (${gw.serialNumber}), ${this.localInventory.pumps.length} pump(s)`
        );
      } catch (error) {
        await this.setConnected(false);
        this.log.warn(
          `[poll] #${id} local inventory read failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return void 0;
      }
    }
    return {
      gateway: this.localInventory.gateway,
      pumps: this.localInventory.pumps,
      online: true,
      includeControl: false
    };
  }
  /**
   * Shared poll body: ensure objects, read live sensors and write states for one inventory snapshot.
   *
   * @param id - poll cycle number
   * @param inv - the inventory snapshot to apply
   * @param startedAt - poll start time (ms) for the timing summary
   */
  async applyInventory(id, inv, startedAt) {
    var _a, _b, _c, _d;
    const { gateway, pumps, online, includeControl } = inv;
    if (!this.gatewayEnsured) {
      await (0, import_objects.ensureGatewayObjects)(this, gateway);
      this.gatewayEnsured = true;
      this.log.debug(`[poll] #${id} gateway objects ensured`);
    }
    await (0, import_objects.writeGatewayStates)(this, gateway, online);
    for (const pump of pumps) {
      this.cachePumpControl(pump);
      let sensorIds = this.liveSensorIds.get(pump.deviceNumber);
      let liveSensors;
      if (sensorIds === void 0) {
        const discovery = await this.discoverLiveSensors(pump.index);
        sensorIds = discovery.ids;
        liveSensors = discovery.values;
        this.liveSensorIds.set(pump.deviceNumber, sensorIds);
      } else {
        const readSlow = id % SLOW_SENSOR_EVERY === 0;
        const idsToRead = readSlow ? sensorIds : sensorIds.filter((s) => FAST_SENSOR_IDS.includes(s));
        liveSensors = await this.readLiveSensors(pump.index, idsToRead);
      }
      const livePump = {
        ...pump,
        sensors: Object.keys(liveSensors).length > 0 ? liveSensors : pump.sensors
      };
      if (!this.ensuredPumps.has(pump.deviceNumber)) {
        await (0, import_objects.ensurePumpObjects)(this, livePump);
        this.ensuredPumps.add(pump.deviceNumber);
        this.log.info(
          `[poll] #${id} discovered pump ${pump.deviceNumber} "${(_a = pump.name) != null ? _a : "?"}" (index ${pump.index}, control address ${pump.controlAddress !== void 0 ? `0x${pump.controlAddress.toString(16)}` : "unknown"}, live sensors [${sensorIds.join(", ")}])`
        );
      }
      await (0, import_objects.writePumpStates)(this, livePump, { includeControl });
      const sched = this.schedules[String(pump.deviceNumber)];
      const hasCurveSource = !!(((_b = sched == null ? void 0 : sched.curve) == null ? void 0 : _b.enabled) && sched.curve.source);
      const waterSensor = sched == null ? void 0 : sched.waterTempSensor;
      if (!hasCurveSource && waterSensor) {
        const rawWater = waterSensor === "temperature2" ? livePump.sensors[import_inventory.SENSOR_TEMPERATURE2_C] : livePump.sensors[import_inventory.SENSOR_TEMPERATURE_C];
        if (typeof rawWater === "number" && Number.isFinite(rawWater)) {
          await this.setState(`pumps.${pump.deviceNumber}.telemetry.waterTemperature`, {
            val: rawWater,
            ack: true
          });
        }
      }
      const rpm = (_c = livePump.sensors[import_inventory.SENSOR_SPEED_RPM]) != null ? _c : 0;
      const power = (_d = livePump.sensors[import_inventory.SENSOR_POWER_W]) != null ? _d : 0;
      const derivedOn = rpm > 0 || power > STANDBY_POWER_W;
      if (!includeControl) {
        await this.setState(`pumps.${pump.deviceNumber}.control.on`, { val: derivedOn, ack: true });
      }
      const control = includeControl ? `on=${livePump.dmx.deviceOn} speed=${livePump.dmx.dimmerValue} (raw) ` : `on=${derivedOn} (from telemetry) `;
      this.log.debug(
        `[poll] #${id} pump ${pump.deviceNumber}: ${control}connected=${livePump.isConnected} power=${power}W rpm=${rpm} (live)`
      );
    }
    await this.setConnected(true);
    this.maybeStartScheduler();
    const took = Date.now() - startedAt;
    const summary = `gateway ${gateway.serialNumber} "${gateway.name}" online=${online}, ${pumps.length} pump(s), ${took} ms`;
    if (id === 1) {
      this.log.info(`[poll] #${id} ok \u2014 ${summary}`);
    } else {
      this.log.debug(`[poll] #${id} ok \u2014 ${summary}`);
    }
  }
  scheduleNextPoll() {
    if (this.stopping) {
      return;
    }
    this.log.debug(`[poll] next cycle in ${this.pollIntervalMs / 1e3}s`);
    this.pollTimer = this.setTimeout(() => {
      this.pollTimer = void 0;
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
  async discoverLiveSensors(deviceIndex) {
    const values = {};
    const scan = [];
    for (let sensorId = 0; sensorId < SENSOR_SCAN_COUNT; sensorId++) {
      const value = await this.readLiveSensor(deviceIndex, sensorId);
      scan.push(`s${sensorId}=${value != null ? value : "-"}`);
      if (value !== void 0 && value !== 0) {
        values[sensorId] = value;
      }
    }
    this.log.info(
      `[live] device index ${deviceIndex} sensor scan (0..${SENSOR_SCAN_COUNT - 1}): ${scan.join(" ")}`
    );
    return {
      ids: Object.keys(values).map(Number).sort((a, b) => a - b),
      values
    };
  }
  /**
   * Read the given live sensor values for a device via 0x5500.
   *
   * @param deviceIndex - the pump's device index
   * @param sensorIds - the sensor numbers to read
   * @returns a map of sensor number to live value (only successful reads)
   */
  async readLiveSensors(deviceIndex, sensorIds) {
    const result = {};
    const read = [];
    for (const sensorId of sensorIds) {
      const value = await this.readLiveSensor(deviceIndex, sensorId);
      if (value !== void 0) {
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
  async sendOnet(dataB64) {
    var _a;
    if ((_a = this.local) == null ? void 0 : _a.isReady) {
      return this.local.sendOnet(dataB64);
    }
    if (this.cloud && this.gatewayId) {
      return extractResponseData(await this.cloud.sendPacket(this.gatewayId, dataB64));
    }
    return void 0;
  }
  /**
   * Read a single live RDM sensor value for a device (0x5500), over cloud or local transport.
   *
   * @param deviceIndex - the pump's device index
   * @param sensorNumber - the RDM sensor number
   * @returns the live value, or undefined on failure
   */
  async readLiveSensor(deviceIndex, sensorNumber) {
    try {
      const dataB64 = await this.sendOnet((0, import_onet.buildSensorRead)(deviceIndex, sensorNumber, this.nextTxn()));
      if (!dataB64) {
        return void 0;
      }
      const parsed = (0, import_onet.parseSensorReadReply)(dataB64);
      if (!parsed || parsed.deviceIndex !== deviceIndex || parsed.sensorNumber !== sensorNumber) {
        return void 0;
      }
      return parsed.value;
    } catch (error) {
      this.log.debug(
        `[live] read device ${deviceIndex} sensor ${sensorNumber} failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return void 0;
    }
  }
  /** Replace the pending poll with an earlier one, to reconcile after a command. */
  scheduleConfirmPoll() {
    if (this.stopping) {
      return;
    }
    if (this.pollTimer) {
      this.clearTimeout(this.pollTimer);
      this.pollTimer = void 0;
    }
    this.log.debug(`[cmd] scheduling confirmation poll in ${COMMAND_CONFIRM_DELAY_MS} ms`);
    this.pollTimer = this.setTimeout(() => {
      this.pollTimer = void 0;
      void this.poll();
    }, COMMAND_CONFIRM_DELAY_MS);
  }
  /**
   * Translate a write on a control state into an ONet command and send it via the cloud.
   *
   * @param id - the full state id that changed
   * @param state - the new (ack:false) state
   */
  async handleCommand(id, state) {
    var _a;
    const match = /\.pumps\.(\d+)\.control\.(on|sfc|speed|speedRaw)$/.exec(id);
    if (!match) {
      return;
    }
    const deviceNumber = Number(match[1]);
    const field = match[2];
    const ctrl = this.pumpControl.get(deviceNumber);
    const transportReady = ((_a = this.local) == null ? void 0 : _a.isReady) || this.cloud && this.gatewayId;
    if (!transportReady || !ctrl) {
      this.log.warn(
        `[cmd] cannot handle ${id}=${JSON.stringify(state.val)} yet \u2014 pump/transport not ready (waiting for the first successful poll)`
      );
      return;
    }
    try {
      if (field === "on") {
        const on = state.val === true || state.val === "true" || state.val === 1;
        this.log.info(`[cmd] pump ${deviceNumber}: set on=${on} (device index ${ctrl.index})`);
        await this.sendOnet((0, import_onet.buildSetOn)(ctrl.index, on, this.nextTxn()));
        await this.setState(`pumps.${deviceNumber}.control.on`, { val: on, ack: true });
      } else if (field === "sfc") {
        const on = state.val === true || state.val === "true" || state.val === 1;
        this.log.info(`[cmd] pump ${deviceNumber}: set SFC ${on ? "on" : "off"} (device index ${ctrl.index})`);
        await this.sendOnet((0, import_onet.buildSetSfc)(ctrl.index, on, this.nextTxn()));
        await this.setState(`pumps.${deviceNumber}.control.sfc`, { val: on, ack: true });
      } else {
        if (ctrl.controlAddress === void 0) {
          this.log.error(
            `[cmd] pump ${deviceNumber}: no control address known (RDM param 96 missing) \u2014 cannot set the speed`
          );
          return;
        }
        const raw = field === "speed" ? Math.round(Math.max(0, Math.min(100, Number(state.val))) / 100 * import_onet.DIMMER_MAX) : Math.max(0, Math.min(import_onet.DIMMER_MAX, Math.round(Number(state.val))));
        const percent = Math.round(raw / import_onet.DIMMER_MAX * 100);
        this.log.info(
          `[cmd] pump ${deviceNumber}: set speed raw=${raw} (${percent}%, control address 0x${ctrl.controlAddress.toString(16)})`
        );
        await this.sendOnet((0, import_onet.buildSetDimmer)(ctrl.controlAddress, raw, this.nextTxn()));
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
  loadSchedules() {
    const raw = this.config.schedules;
    this.schedules = raw && typeof raw === "object" ? raw : {};
    let enabled = 0;
    for (const [dn, cfg] of Object.entries(this.schedules)) {
      if (!(cfg == null ? void 0 : cfg.enabled)) {
        continue;
      }
      const result = (0, import_schedule.validatePlans)(cfg.plans || []);
      if (result.valid) {
        enabled++;
      } else {
        this.log.error(`[schedule] pump ${dn}: schedule ignored \u2014 ${result.error}`);
      }
    }
    this.log.info(enabled > 0 ? `[schedule] active for ${enabled} pump(s)` : "[schedule] no pump schedules");
  }
  /** The instance location mode from the config (Phase 13). */
  get locationMode() {
    const m = String(this.config.locationMode || "system");
    return m === "shared" || m === "individual" ? m : "system";
  }
  /**
   * Phase 13: read the ioBroker system coordinates once, compute today's sunrise/sunset for every
   * pump's location and arm the after-midnight recomputation. Safe to call again on a config change.
   */
  async setupAstro() {
    var _a;
    try {
      const sys = await this.getForeignObjectAsync("system.config");
      const common = (_a = sys == null ? void 0 : sys.common) != null ? _a : {};
      this.systemCoords = (0, import_astro.toCoordinates)(common.latitude, common.longitude);
    } catch (e) {
      this.systemCoords = null;
      this.log.debug(
        `[astro] could not read system.config coordinates: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    const sysStr = this.systemCoords ? `${this.systemCoords.lat.toFixed(5)}, ${this.systemCoords.lon.toFixed(5)}` : "(not set)";
    this.log.debug(`[astro] location mode = ${this.locationMode}; system coords = ${sysStr}`);
    await this.recomputeAstro();
    this.scheduleMidnightRecalc();
  }
  /**
   * Resolve one pump's coordinates from the instance mode, system and per-pump config (Phase 13).
   *
   * @param deviceNumber - the pump device number
   */
  coordsForPump(deviceNumber) {
    var _a, _b;
    const shared = (0, import_astro.toCoordinates)(
      this.config.latitude,
      this.config.longitude
    );
    return (0, import_astro.resolvePumpCoordinates)(
      this.locationMode,
      this.systemCoords,
      shared,
      (_b = (_a = this.schedules[String(deviceNumber)]) == null ? void 0 : _a.location) != null ? _b : {}
    );
  }
  /**
   * Compute today's sunrise/sunset for every discovered pump, cache it and write the astro states.
   * Pumps without a resolvable location get empty astro (their astro windows stay inactive).
   */
  async recomputeAstro() {
    const now = /* @__PURE__ */ new Date();
    for (const deviceNumber of this.pumpControl.keys()) {
      const coords = this.coordsForPump(deviceNumber);
      const astro = coords ? (0, import_astro.astroForDate)(now, coords) : import_schedule.NO_ASTRO;
      this.pumpAstro.set(deviceNumber, astro);
      const base = `pumps.${deviceNumber}.astro`;
      const sunrise = astro.sunriseMin === null ? "" : minuteToHhmm(astro.sunriseMin);
      const sunset = astro.sunsetMin === null ? "" : minuteToHhmm(astro.sunsetMin);
      await this.setState(`${base}.sunrise`, { val: sunrise, ack: true });
      await this.setState(`${base}.sunset`, { val: sunset, ack: true });
      await this.setState(`${base}.sunriseTs`, { val: minuteToTodayTs(astro.sunriseMin), ack: true });
      await this.setState(`${base}.sunsetTs`, { val: minuteToTodayTs(astro.sunsetMin), ack: true });
      const locStr = coords ? `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}` : "(unresolved \u2192 astro windows inactive)";
      this.log.debug(
        `[astro] pump ${deviceNumber}: location = ${locStr}; sunrise=${sunrise || "n/a"} sunset=${sunset || "n/a"}`
      );
    }
    if (this.pumpControl.size) {
      this.log.debug(`[astro] recomputed sunrise/sunset for ${this.pumpControl.size} pump(s)`);
    }
  }
  /** Arm a one-shot timer that recomputes the astro times shortly after the next midnight. */
  scheduleMidnightRecalc() {
    if (this.midnightTimer) {
      this.clearTimeout(this.midnightTimer);
    }
    const now = /* @__PURE__ */ new Date();
    const next = new Date(now);
    next.setHours(24, 0, 30, 0);
    const delay = Math.max(1e3, next.getTime() - now.getTime());
    this.midnightTimer = this.setTimeout(() => {
      this.midnightTimer = void 0;
      void this.recomputeAstro();
      this.scheduleMidnightRecalc();
    }, delay);
  }
  /**
   * Handle admin messages (Phase 13). "geocode" resolves a free-text address to coordinates via
   * OpenStreetMap Nominatim from the BACKEND (so the admin's map picker avoids browser CORS/CSP).
   * Replies with `{ lat, lon, displayName }` or `{ error }`.
   *
   * @param obj - the incoming message
   */
  async onMessage(obj) {
    var _a;
    if (!obj || typeof obj !== "object" || obj.command !== "geocode" || !obj.callback) {
      return;
    }
    const rawQuery = (_a = obj.message) == null ? void 0 : _a.query;
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
    if (!query) {
      this.log.debug("[geocode] rejected an empty query");
      this.sendTo(obj.from, obj.command, { error: "empty query" }, obj.callback);
      return;
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
      this.log.debug(`[geocode] resolving "${query}" via Nominatim (timeout ${GEOCODE_TIMEOUT_MS} ms)`);
      const res = await fetch(url, {
        headers: { "User-Agent": `ioBroker.pondpump/${this.version || "0"}` },
        signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS)
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        this.log.debug(`[geocode] "${query}" \u2192 ${data[0].lat}, ${data[0].lon} (${data[0].display_name})`);
        this.sendTo(
          obj.from,
          obj.command,
          { lat: Number(data[0].lat), lon: Number(data[0].lon), displayName: data[0].display_name },
          obj.callback
        );
      } else {
        this.log.debug(`[geocode] "${query}" \u2192 no result from Nominatim`);
        this.sendTo(obj.from, obj.command, { error: "no location found" }, obj.callback);
      }
    } catch (e) {
      this.log.warn(`[geocode] lookup for "${query}" failed: ${e instanceof Error ? e.message : String(e)}`);
      this.sendTo(obj.from, obj.command, { error: e instanceof Error ? e.message : String(e) }, obj.callback);
    }
  }
  /** Start the scheduler once (after the first successful poll) if any pump has a valid schedule. */
  maybeStartScheduler() {
    if (this.scheduleStarted || this.stopping) {
      return;
    }
    const anyValid = Object.values(this.schedules).some(
      (cfg) => (cfg == null ? void 0 : cfg.enabled) && (0, import_schedule.validatePlans)(cfg.plans || []).valid
    );
    if (!anyValid) {
      return;
    }
    this.scheduleStarted = true;
    this.log.info("[schedule] starting the pump scheduler");
    void (async () => {
      try {
        await this.subscribeScheduleSources();
        await this.recomputeAstro();
        await this.runScheduler();
      } catch (e) {
        this.log.error(`[schedule] failed to start: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
  }
  /**
   * Subscribe to every state id the schedules read for their temperature/weather conditions
   * (Phase 11), so a source change re-evaluates the scheduler — not just window boundaries. Works
   * for the pumps' own `telemetry.temperature` and for external OIDs (e.g. a weather adapter).
   */
  async subscribeScheduleSources() {
    const wanted = /* @__PURE__ */ new Set();
    for (const cfg of Object.values(this.schedules)) {
      if (cfg == null ? void 0 : cfg.enabled) {
        for (const id of (0, import_schedule.collectSourceOids)(cfg)) {
          wanted.add(id);
        }
      }
    }
    for (const id of this.scheduleSourceOids) {
      if (!wanted.has(id)) {
        await this.unsubscribeForeignStatesAsync(id);
        this.scheduleSourceOids.delete(id);
      }
    }
    for (const id of wanted) {
      if (!this.scheduleSourceOids.has(id)) {
        await this.subscribeForeignStatesAsync(id);
        this.scheduleSourceOids.add(id);
      }
    }
    if (this.scheduleSourceOids.size) {
      this.log.info(
        `[schedule] watching ${this.scheduleSourceOids.size} condition source(s): ${[...this.scheduleSourceOids].join(", ")}`
      );
    }
  }
  /** Read the current numeric value of every subscribed condition source (booleans as 1/0). */
  async readScheduleSources() {
    const sources = {};
    for (const id of this.scheduleSourceOids) {
      try {
        const state = await this.getForeignStateAsync(id);
        const val = state == null ? void 0 : state.val;
        if (typeof val === "number" && Number.isFinite(val)) {
          sources[id] = val;
        } else if (typeof val === "boolean") {
          sources[id] = val ? 1 : 0;
        } else if (typeof val === "string" && val.trim() !== "" && Number.isFinite(Number(val))) {
          sources[id] = Number(val);
        }
      } catch (e) {
        this.log.debug(
          `[schedule] cannot read condition source ${id}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
    return sources;
  }
  /** A watched condition source changed → re-evaluate soon (debounced to coalesce bursts). */
  onScheduleSourceChange() {
    if (this.stopping || !this.scheduleStarted || this.scheduleReevalTimer) {
      return;
    }
    this.scheduleReevalTimer = this.setTimeout(() => {
      this.scheduleReevalTimer = void 0;
      if (this.scheduleTimer) {
        this.clearTimeout(this.scheduleTimer);
        this.scheduleTimer = void 0;
      }
      void this.runScheduler();
    }, 2e3);
  }
  /**
   * Get (creating if needed) the Phase-12 runtime state for a pump.
   *
   * @param deviceNumber - the pump device number
   */
  getScheduleRuntime(deviceNumber) {
    let rt = this.scheduleRuntime.get(deviceNumber);
    if (!rt) {
      rt = {};
      this.scheduleRuntime.set(deviceNumber, rt);
    }
    return rt;
  }
  /**
   * Return the source map fed to `decideTarget`, with the curve's temperature source replaced by its
   * EMA-smoothed (Phase 12: `smoothingHours`) and hysteresis-anchored (`hysteresisK`) value. The raw
   * map is returned unchanged when there is no enabled curve or its source is currently unavailable
   * (so the pure core fails safe on a missing sensor). Mutates the pump's runtime state.
   *
   * @param cfg - the pump's scheduling configuration
   * @param rawSources - the freshly read raw source values
   * @param rt - the pump's runtime state
   * @param nowMs - current wall-clock time (ms)
   */
  smoothedSources(cfg, rawSources, rt, nowMs) {
    var _a, _b;
    const curve = cfg.curve;
    if (!(curve == null ? void 0 : curve.enabled) || !curve.source) {
      return rawSources;
    }
    const raw = rawSources[curve.source];
    if (raw === void 0 || !Number.isFinite(raw)) {
      return rawSources;
    }
    const tauMs = Math.max(0, (_a = cfg.smoothingHours) != null ? _a : 0) * 36e5;
    const dtMs = rt.smoothedAt ? nowMs - rt.smoothedAt : 0;
    const smoothed = rt.smoothedTemp === void 0 ? raw : (0, import_schedule.updateEma)(rt.smoothedTemp, raw, dtMs, tauMs);
    rt.smoothedTemp = smoothed;
    rt.smoothedAt = nowMs;
    const hystK = Math.max(0, (_b = cfg.hysteresisK) != null ? _b : 0);
    if (rt.mappedTemp === void 0 || hystK <= 0 || Math.abs(smoothed - rt.mappedTemp) >= hystK) {
      rt.mappedTemp = smoothed;
    }
    return { ...rawSources, [curve.source]: rt.mappedTemp };
  }
  /**
   * Evaluate every scheduled pump for the current wall-clock time, apply any changed target via the
   * command path, then re-arm the tick for the next window boundary (capped at 60 min so the loop
   * self-corrects against clock drift / DST; a re-evaluation without a target change sends nothing).
   * When a pump is still ramping (Phase 12) the tick is shortened so the ramp continues promptly.
   */
  async runScheduler() {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (this.stopping) {
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const nowMs = now.getTime();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let nextChange = 60;
    const rawSources = await this.readScheduleSources();
    this.log.debug(
      `[schedule] tick @ ${minuteToHhmm(nowMin)} (nowMin=${nowMin}) \u2014 raw sources: ${fmtSources(rawSources)}`
    );
    for (const [dnStr, cfg] of Object.entries(this.schedules)) {
      if (!(cfg == null ? void 0 : cfg.enabled) || !(0, import_schedule.validatePlans)(cfg.plans || []).valid) {
        const dn0 = Number(dnStr);
        if (this.pumpControl.has(dn0)) {
          await this.setState(`pumps.${dn0}.schedule.controlled`, { val: false, ack: true });
        }
        continue;
      }
      const deviceNumber = Number(dnStr);
      if (!this.pumpControl.has(deviceNumber)) {
        this.log.debug(`[schedule] pump ${deviceNumber}: not discovered yet \u2014 skipping this tick`);
        continue;
      }
      const rt = this.getScheduleRuntime(deviceNumber);
      const sources = this.smoothedSources(cfg, rawSources, rt, nowMs);
      const astro = (_a = this.pumpAstro.get(deviceNumber)) != null ? _a : import_schedule.NO_ASTRO;
      const curveSrc = ((_b = cfg.curve) == null ? void 0 : _b.enabled) ? cfg.curve.source : void 0;
      const tempInfo = curveSrc ? `temp[${curveSrc}] raw=${fmtNum(rawSources[curveSrc])} smoothed=${fmtNum(rt.smoothedTemp)} mapped=${fmtNum(rt.mappedTemp)} (\u03C4=${(_c = cfg.smoothingHours) != null ? _c : 0}h, hystK=${(_d = cfg.hysteresisK) != null ? _d : 0})` : "no temperature curve";
      this.log.debug(
        `[schedule] pump ${deviceNumber} inputs: ${tempInfo}; astro ${fmtAstro(astro, nowMin)}; priority=${(_e = cfg.conditionPriority) != null ? _e : "override"} minPower=${(_f = cfg.minPower) != null ? _f : 0} maxPower=${(_g = cfg.maxPower) != null ? _g : 100}`
      );
      if (curveSrc) {
        const rawWater = rawSources[curveSrc];
        if (typeof rawWater === "number" && Number.isFinite(rawWater)) {
          await this.setState(`pumps.${deviceNumber}.telemetry.waterTemperature`, {
            val: rawWater,
            ack: true
          });
        } else {
          this.log.debug(
            `[schedule] pump ${deviceNumber}: water temperature source "${curveSrc}" has no finite value \u2014 waterTemperature not updated`
          );
        }
      }
      const trace = [];
      const decision = (0, import_schedule.decideTarget)(cfg, nowMin, sources, astro, trace);
      this.log.debug(`[schedule] pump ${deviceNumber} decision: ${trace.join(" | ")}`);
      await this.setState(`pumps.${deviceNumber}.astro.isDay`, {
        val: !!activeWindowIsDay(astro, nowMin),
        ack: true
      });
      this.warnFailSafe(deviceNumber, cfg, decision, rt);
      await this.warnSfcConflict(deviceNumber, cfg, decision, rt);
      let resolvedPower;
      const rampPph = (_h = cfg.rampPercentPerHour) != null ? _h : 0;
      if (decision.power === "hold") {
        resolvedPower = rt.appliedPower;
        this.log.debug(
          `[schedule] pump ${deviceNumber}: hold \u2014 freezing at ${fmtNum(rt.appliedPower)}% (a frost rule matched)`
        );
      } else if (rt.appliedPower === void 0 || !(rampPph > 0)) {
        resolvedPower = decision.power;
      } else {
        const rampMinutes = Math.max(1, Math.round(60 / Math.max(rampPph, 1)));
        const cadenceMs = rampMinutes * 6e4;
        const dtMs = rt.appliedAt ? Math.min(nowMs - rt.appliedAt, cadenceMs) : cadenceMs;
        const maxStep = rampPph * dtMs / 36e5;
        resolvedPower = Math.round((0, import_schedule.rampTowards)(rt.appliedPower, decision.power, maxStep));
        if (resolvedPower !== decision.power) {
          nextChange = Math.min(nextChange, rampMinutes);
          this.log.debug(
            `[schedule] pump ${deviceNumber}: ramping ${rt.appliedPower}% \u2192 ${decision.power}% (${rampPph}%/h, max step ${Math.round(maxStep)}%): applying ${resolvedPower}% this step`
          );
        }
      }
      await this.applyScheduleTarget(deviceNumber, decision.sfc, resolvedPower, rt, nowMs);
      await this.writeActuators(decision.actuators);
      const pumpNext = (0, import_schedule.minutesUntilNextChange)(cfg.plans || [], nowMin, astro);
      this.log.debug(
        `[schedule] pump ${deviceNumber}: next window boundary in ${pumpNext} min (\u2248 ${minuteToHhmm((nowMin + pumpNext) % 1440)})`
      );
      await this.writeScheduleStatus(deviceNumber, cfg, decision, astro, nowMin, nowMs, pumpNext, rt);
      nextChange = Math.min(nextChange, pumpNext);
    }
    this.log.debug(`[schedule] tick done \u2014 next re-evaluation in ${Math.max(1, nextChange)} min`);
    const delayMs = Math.max(1, nextChange) * 6e4 + 2e3;
    this.scheduleTimer = this.setTimeout(() => {
      this.scheduleTimer = void 0;
      void this.runScheduler();
    }, delayMs);
  }
  /**
   * Publish the scheduler's decision into the per-pump `schedule.*` status states (Phase 14) so the
   * PumpScheduler vis widget (and scripts/history) can show what the built-in scheduler is doing and
   * why. All states are read-only (ack:true).
   *
   * @param deviceNumber - the pump device number
   * @param cfg - the pump's scheduling configuration
   * @param decision - the decision just computed for this pump
   * @param astro - resolved astro times for this pump
   * @param nowMin - current minute-of-day
   * @param nowMs - current wall-clock time (ms)
   * @param nextChangeMin - minutes until the next window boundary
   * @param rt - the pump's runtime state (for the held power when "hold")
   */
  async writeScheduleStatus(deviceNumber, cfg, decision, astro, nowMin, nowMs, nextChangeMin, rt) {
    const base = `pumps.${deviceNumber}.schedule`;
    const targetPower = typeof decision.power === "number" ? decision.power : rt.appliedPower;
    const win = (0, import_schedule.activeWindow)(
      (cfg.plans || []).filter((p) => p.mode !== "actuator"),
      nowMin,
      astro
    );
    await this.setState(`${base}.controlled`, { val: true, ack: true });
    if (targetPower !== void 0 && Number.isFinite(targetPower)) {
      await this.setState(`${base}.targetPower`, { val: Math.round(targetPower), ack: true });
    }
    await this.setState(`${base}.sfc`, { val: decision.sfc, ack: true });
    await this.setState(`${base}.source`, { val: decision.source, ack: true });
    await this.setState(`${base}.raised`, { val: decision.raised, ack: true });
    await this.setState(`${base}.nightProtection`, { val: decision.nightProtected, ack: true });
    await this.setState(`${base}.hold`, { val: decision.hold, ack: true });
    await this.setState(`${base}.failSafe`, { val: decision.failSafe, ack: true });
    await this.setState(`${base}.window`, { val: windowLabelOf(win, astro), ack: true });
    await this.setState(`${base}.nextChangeTs`, { val: nowMs + nextChangeMin * 6e4, ack: true });
  }
  /**
   * Warn (once per episode) when the temperature curve is regulating but its source is missing.
   *
   * @param deviceNumber - the pump device number
   * @param cfg - the pump's scheduling configuration
   * @param decision - the decision just computed for this pump
   * @param rt - the pump's runtime state
   */
  warnFailSafe(deviceNumber, cfg, decision, rt) {
    var _a, _b;
    if (decision.failSafe && !rt.failSafeWarned) {
      this.log.warn(
        `[schedule] pump ${deviceNumber}: temperature source "${(_b = (_a = cfg.curve) == null ? void 0 : _a.source) != null ? _b : ""}" unavailable \u2014 running at 100 % (fail-safe)`
      );
      rt.failSafeWarned = true;
    } else if (!decision.failSafe) {
      rt.failSafeWarned = false;
    }
  }
  /**
   * Warn (once per episode) when the curve is set to regulate the pump's power while the pump's own
   * native Seasonal Flow Control is on — the pump then overrides our setpoint (Phase 12, decision F).
   *
   * @param deviceNumber - the pump device number
   * @param cfg - the pump's scheduling configuration
   * @param decision - the decision just computed for this pump
   * @param rt - the pump's runtime state
   */
  async warnSfcConflict(deviceNumber, cfg, decision, rt) {
    var _a;
    if (!((_a = cfg.curve) == null ? void 0 : _a.enabled) || decision.sfc) {
      rt.sfcConflictWarned = false;
      return;
    }
    const st = await this.getStateAsync(`pumps.${deviceNumber}.status.fcStatus`);
    const active = (0, import_objects.isSfcActive)(typeof (st == null ? void 0 : st.val) === "string" ? st.val : void 0);
    if (active && !rt.sfcConflictWarned) {
      this.log.warn(
        `[schedule] pump ${deviceNumber}: the temperature curve is regulating power, but the pump's native Seasonal Flow Control is ON \u2014 the pump overrides the setpoint. Turn SFC off, or drive it via an "sfc" rule.`
      );
      rt.sfcConflictWarned = true;
    } else if (!active) {
      rt.sfcConflictWarned = false;
    }
  }
  /**
   * Write each generic actuator target (Phase 12 setState effect), only when its value changed.
   *
   * @param actuators - the actuator writes decided for this tick
   */
  async writeActuators(actuators) {
    for (const a of actuators) {
      if (this.lastActuatorValue.get(a.target) === a.value) {
        this.log.debug(`[schedule] actuator ${a.target} unchanged (${a.value}) \u2014 nothing sent`);
        continue;
      }
      try {
        await this.setForeignStateAsync(a.target, { val: a.value, ack: false });
        this.lastActuatorValue.set(a.target, a.value);
        this.log.info(`[schedule] actuator ${a.target} = ${a.value}`);
      } catch (e) {
        this.log.warn(
          `[schedule] cannot write actuator ${a.target}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }
  /**
   * Apply a scheduled decision to a pump, but only when it differs from the last applied target, by
   * writing the control states as commands (ack:false) so the normal command path sends them. When
   * the pump's power is written, the applied value/time are recorded for "hold" and ramping.
   *
   * @param deviceNumber - the pump device number
   * @param sfc - the desired SFC state
   * @param power - the resolved power % to apply, or undefined to leave the setpoint untouched (hold)
   * @param rt - the pump's runtime state
   * @param nowMs - current wall-clock time (ms)
   */
  async applyScheduleTarget(deviceNumber, sfc, power, rt, nowMs) {
    const key = sfc ? "sfc=true" : `sfc=false;power=${power != null ? power : "hold"}`;
    if (this.lastScheduleTarget.get(deviceNumber) === key) {
      this.log.debug(`[schedule] pump ${deviceNumber}: target unchanged (${key}) \u2014 nothing sent`);
      return;
    }
    this.lastScheduleTarget.set(deviceNumber, key);
    this.log.info(`[schedule] pump ${deviceNumber}: applying ${key}`);
    if (sfc) {
      await this.setState(`pumps.${deviceNumber}.control.sfc`, { val: true, ack: false });
    } else {
      await this.setState(`pumps.${deviceNumber}.control.sfc`, { val: false, ack: false });
      if (power !== void 0) {
        await this.setState(`pumps.${deviceNumber}.control.speed`, { val: power, ack: false });
        rt.appliedPower = power;
        rt.appliedAt = nowMs;
      }
    }
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   *
   * @param callback - Callback function
   */
  onUnload(callback) {
    var _a, _b;
    try {
      this.log.debug("[shutdown] onUnload: stopping poll loop and releasing transports");
      this.stopping = true;
      if (this.pollTimer) {
        this.clearTimeout(this.pollTimer);
        this.pollTimer = void 0;
      }
      if (this.scheduleTimer) {
        this.clearTimeout(this.scheduleTimer);
        this.scheduleTimer = void 0;
      }
      if (this.scheduleReevalTimer) {
        this.clearTimeout(this.scheduleReevalTimer);
        this.scheduleReevalTimer = void 0;
      }
      if (this.midnightTimer) {
        this.clearTimeout(this.midnightTimer);
        this.midnightTimer = void 0;
      }
      (_a = this.cloud) == null ? void 0 : _a.reset();
      this.cloud = void 0;
      (_b = this.local) == null ? void 0 : _b.reset();
      this.local = void 0;
      this.log.debug("[shutdown] cleanup complete");
      callback();
    } catch (error) {
      this.log.error(`[shutdown] error during unloading: ${error.message}`);
      callback();
    }
  }
  /**
   * Is called if a subscribed state changes.
   *
   * @param id - State ID
   * @param state - State object
   */
  onStateChange(id, state) {
    if (state && this.scheduleSourceOids.has(id)) {
      this.onScheduleSourceChange();
    }
    if (!state || state.ack) {
      return;
    }
    this.log.debug(`[cmd] command received: ${id} = ${JSON.stringify(state.val)} (ack=false)`);
    void this.handleCommand(id, state);
  }
}
if (require.main !== module) {
  module.exports = (options) => new Pondpump(options);
} else {
  (() => new Pondpump())();
}
//# sourceMappingURL=main.js.map
