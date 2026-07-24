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
const MIN_POLL_INTERVAL_S = 5;
const REFRESH_TOKEN_STATE = "cloud.refreshToken";
const COMMAND_CONFIRM_DELAY_MS = 2e3;
const SENSOR_SCAN_COUNT = 11;
const FAST_SENSOR_IDS = [import_inventory.SENSOR_SPEED_RPM, import_inventory.SENSOR_POWER_W];
const SLOW_SENSOR_EVERY = 6;
const STANDBY_POWER_W = 15;
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
  constructor(options = {}) {
    super({
      ...options,
      name: "pondpump"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
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
    var _a, _b, _c;
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
      const rpm = (_b = livePump.sensors[import_inventory.SENSOR_SPEED_RPM]) != null ? _b : 0;
      const power = (_c = livePump.sensors[import_inventory.SENSOR_POWER_W]) != null ? _c : 0;
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
