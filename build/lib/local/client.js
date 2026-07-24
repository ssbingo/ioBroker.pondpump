"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var client_exports = {};
__export(client_exports, {
  LocalClient: () => LocalClient
});
module.exports = __toCommonJS(client_exports);
var dgram = __toESM(require("node:dgram"));
var tls = __toESM(require("node:tls"));
var import_onet = require("../cloud/onet");
var import_protocol = require("./protocol");
const DEFAULT_CIPHERS = "AES128-SHA:AES256-SHA:DES-CBC3-SHA:AES128-SHA256:AES256-SHA256:AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:DEFAULT:@SECLEVEL=0";
class LocalClient {
  opts;
  log;
  timers;
  server;
  socket;
  reader = new import_protocol.FrameReader();
  pending = /* @__PURE__ */ new Map();
  aliveTimer;
  reconnectTimer;
  authed = false;
  stopping = false;
  txn = 0;
  /** IP advertised to the controller in the wake packet (auto-detected when bind is 0.0.0.0). */
  advertiseIp;
  /** Persistent UDP socket for the wake handshake — kept open to receive the controller's reply. */
  udp;
  /**
   * @param options - connection parameters (controller IP, TLS bind/port, password, credentials, logger)
   */
  constructor(options) {
    var _a, _b, _c, _d, _e;
    this.log = options.log;
    this.timers = options.timers;
    this.opts = {
      ...options,
      udpPort: (_a = options.udpPort) != null ? _a : import_protocol.DEFAULT_UDP_PORT,
      requestTimeoutMs: (_b = options.requestTimeoutMs) != null ? _b : 8e3,
      connectTimeoutMs: (_c = options.connectTimeoutMs) != null ? _c : 15e3,
      aliveIntervalMs: (_d = options.aliveIntervalMs) != null ? _d : 2e4,
      ciphers: (_e = options.ciphers) != null ? _e : DEFAULT_CIPHERS
    };
  }
  /** Whether the channel is currently authenticated and ready for `sendOnet`. */
  get isReady() {
    return this.authed && !!this.socket && !this.socket.destroyed;
  }
  /** Next rolling transaction number (0..255). */
  nextTxn() {
    this.txn = this.txn + 1 & 255;
    return this.txn;
  }
  /**
   * Start the TLS server, then wake the controller and wait until it has connected and
   * authenticated. Resolves once the channel is ready; rejects on timeout.
   */
  async connect() {
    this.stopping = false;
    await this.startServer();
    this.advertiseIp = await this.resolveAdvertiseIp();
    await this.waitForAuthenticatedConnection();
  }
  /**
   * Determine the IPv4 address the controller should connect back to and that is advertised in the
   * wake packet. Uses the configured bind address when it is a concrete IP; otherwise (0.0.0.0)
   * asks the OS which local address would be used to reach the controller.
   */
  resolveAdvertiseIp() {
    const bind = this.opts.bindAddress;
    if (bind && bind !== "0.0.0.0" && bind !== "::" && /^\d+\.\d+\.\d+\.\d+$/.test(bind)) {
      return Promise.resolve(bind);
    }
    return new Promise((resolve) => {
      const probe = dgram.createSocket("udp4");
      const done = (ip) => {
        try {
          probe.close();
        } catch {
        }
        this.log.info(
          `[local/udp] advertising local address ${ip} to the controller (bind is ${bind}; auto-detected the route to ${this.opts.ip})`
        );
        resolve(ip);
      };
      probe.on("error", () => done("0.0.0.0"));
      try {
        probe.connect(this.opts.udpPort, this.opts.ip, () => {
          try {
            done(probe.address().address);
          } catch {
            done("0.0.0.0");
          }
        });
      } catch {
        done("0.0.0.0");
      }
    });
  }
  /** Start (or reuse) the TLS server and begin listening. */
  startServer() {
    if (this.server) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const server = tls.createServer(
        {
          cert: this.opts.credentials.cert,
          key: this.opts.credentials.key,
          ciphers: this.opts.ciphers,
          minVersion: "TLSv1",
          maxVersion: "TLSv1.2",
          honorCipherOrder: true,
          // let our legacy-first order win, so old RSA suites are chosen
          requestCert: false,
          rejectUnauthorized: false
        },
        (socket) => this.onControllerSocket(socket)
      );
      server.on("connection", (socket) => {
        var _a, _b;
        this.log.info(
          `[local/tls] inbound TCP connection from ${(_a = socket.remoteAddress) != null ? _a : "?"}:${(_b = socket.remotePort) != null ? _b : "?"} (TLS handshake starting)`
        );
      });
      server.on("tlsClientError", (err, socket) => {
        var _a;
        this.log.warn(`[local/tls] TLS handshake failed with ${(_a = socket.remoteAddress) != null ? _a : "?"}: ${err.message}`);
      });
      server.on("error", (err) => {
        this.log.error(`[local/tls] server error: ${err.message}`);
        if (!this.server) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
      server.listen(this.opts.port, this.opts.bindAddress, () => {
        this.server = server;
        this.log.info(`[local/tls] TLS server listening on ${this.opts.bindAddress}:${this.opts.port}`);
        resolve();
      });
    });
  }
  /** Send the UDP wake packet and resolve once the controller has connected + authenticated. */
  waitForAuthenticatedConnection() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const handleAuth = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };
      this.timers.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        this.offAuth(handleAuth);
        reject(
          new Error(
            `controller did not connect/authenticate within ${this.opts.connectTimeoutMs} ms (check: controller IP ${this.opts.ip}, UDP ${this.opts.udpPort} reachable, TCP ${this.opts.port} reachable back to ${this.opts.bindAddress}, device password)`
          )
        );
      }, this.opts.connectTimeoutMs);
      this.onAuth(handleAuth);
      this.sendWake();
    });
  }
  // Minimal one-shot auth event plumbing (avoids pulling in EventEmitter for a single event).
  authListeners = [];
  onAuth(cb) {
    this.authListeners.push(cb);
  }
  offAuth(cb) {
    this.authListeners = this.authListeners.filter((l) => l !== cb);
  }
  emitAuth() {
    const listeners = this.authListeners;
    this.authListeners = [];
    for (const l of listeners) {
      l();
    }
  }
  /** Lazily create the persistent UDP socket used for the wake handshake. */
  ensureUdp() {
    if (this.udp) {
      return this.udp;
    }
    const udp = dgram.createSocket("udp4");
    udp.on("message", (msg, rinfo) => this.onUdpMessage(msg, rinfo));
    udp.on("error", (err) => this.log.warn(`[local/udp] socket error: ${err.message}`));
    udp.unref();
    this.udp = udp;
    return udp;
  }
  /** Send the UDP TCP_REQ wake packet to the controller (socket stays open for the reply). */
  sendWake() {
    var _a;
    const udp = this.ensureUdp();
    const advertiseIp = (_a = this.advertiseIp) != null ? _a : this.opts.bindAddress;
    const frame = (0, import_protocol.buildTcpReq)(advertiseIp, this.opts.port, this.nextTxn());
    this.log.info(
      `[local/udp] sending wake (TCP_REQ) to ${this.opts.ip}:${this.opts.udpPort} \u2014 tells controller to connect back to ${advertiseIp}:${this.opts.port}`
    );
    this.log.debug(`[local/udp] wake packet (${frame.length} bytes): ${frame.toString("hex")}`);
    udp.send(frame, this.opts.udpPort, this.opts.ip, (err) => {
      if (err) {
        this.log.error(`[local/udp] wake send failed: ${err.message}`);
      }
    });
  }
  /**
   * Handle a UDP datagram from the controller (the reply to our wake). For now this is diagnostic:
   * the raw bytes and any decoded ONet header are logged so the local handshake can be finalised.
   *
   * @param msg - the received datagram
   * @param rinfo - remote address info
   */
  onUdpMessage(msg, rinfo) {
    this.log.info(
      `[local/udp] reply from ${rinfo.address}:${rinfo.port} (${msg.length} bytes): ${msg.toString("hex")}`
    );
    const header = (0, import_onet.parseFrameHeader)(msg);
    if (header) {
      this.log.info(
        `[local/udp] reply decoded: ONet type 0x${header.packetType.toString(16)} txn=${header.txn} version=${header.version} payloadLen=${header.payloadLength} payload=${msg.subarray(16).toString("hex") || "(none)"}`
      );
    } else {
      this.log.info("[local/udp] reply is not a recognised ONet frame (no 5c234f41 delimiter)");
    }
  }
  /**
   * Handle the controller's inbound TLS connection.
   *
   * @param socket - the controller's inbound TLS socket
   */
  onControllerSocket(socket) {
    var _a, _b, _c, _d, _e;
    if (this.socket && !this.socket.destroyed) {
      this.log.warn("[local/tls] a controller connection already exists \u2014 replacing it");
      this.socket.destroy();
    }
    this.socket = socket;
    socket.setNoDelay(true);
    this.reader.reset();
    const peer = `${(_a = socket.remoteAddress) != null ? _a : "?"}:${(_b = socket.remotePort) != null ? _b : "?"}`;
    this.log.info(
      `[local/tls] controller connected from ${peer} (protocol=${(_c = socket.getProtocol()) != null ? _c : "?"}, cipher=${(_e = (_d = socket.getCipher()) == null ? void 0 : _d.name) != null ? _e : "?"})`
    );
    socket.on("data", (chunk) => this.onData(chunk));
    socket.on("error", (err) => this.log.warn(`[local/tls] socket error: ${err.message}`));
    socket.on("close", () => this.onSocketClosed(peer));
    void this.authenticate();
  }
  /**
   * Send PASSWORD_CHECK and mark the channel authenticated on the 0x01 reply. The GatewayCloud
   * controller only flushes the (small) reply once it receives another frame, so we nudge it with
   * periodic ALIVE frames until the reply arrives.
   */
  async authenticate() {
    var _a, _b, _c, _d;
    const txn = this.nextTxn();
    this.log.debug("[local/auth] sending PASSWORD_CHECK (64-byte password block)");
    const nudge = this.timers.setInterval(() => {
      if (this.authed || !this.socket || this.socket.destroyed) {
        return;
      }
      this.log.debug("[local/auth] nudging controller with ALIVE to flush the password reply");
      this.socket.write((0, import_protocol.buildAlive)(this.nextTxn()));
    }, 600);
    try {
      const reply = await this.sendFrameAwait((0, import_protocol.buildPasswordCheck)(this.opts.password, txn), txn, 40704);
      const ok = reply.payload.length >= 1 && reply.payload[0] === 1;
      if (!ok) {
        this.log.error(
          `[local/auth] password rejected by controller (reply payload ${reply.payload.toString("hex")}) \u2014 check the device password in the adapter settings`
        );
        (_a = this.socket) == null ? void 0 : _a.destroy();
        return;
      }
      this.authed = true;
      this.log.info("[local/auth] authenticated \u2014 local channel is ready");
      this.startAlive();
      (_c = (_b = this.opts).onConnectionChange) == null ? void 0 : _c.call(_b, true);
      this.emitAuth();
    } catch (err) {
      this.log.error(`[local/auth] password check failed: ${err instanceof Error ? err.message : String(err)}`);
      (_d = this.socket) == null ? void 0 : _d.destroy();
    } finally {
      this.timers.clearInterval(nudge);
    }
  }
  /**
   * Feed inbound bytes to the frame reader and dispatch complete frames.
   *
   * @param chunk - freshly received TLS bytes
   */
  onData(chunk) {
    this.log.debug(`[local/rx] ${chunk.length} bytes over TLS: ${chunk.toString("hex")}`);
    for (const frame of this.reader.push(chunk)) {
      this.dispatch(frame);
    }
  }
  /**
   * Route a complete inbound frame to its pending request, or handle it as unsolicited.
   *
   * @param frame - a fully reassembled inbound frame
   */
  dispatch(frame) {
    const { txn, packetType } = frame.header;
    let pending = this.pending.get(txn);
    if (!pending && this.pending.size === 1) {
      const only = [...this.pending.values()][0];
      if (packetType === (only.packetType | 255)) {
        pending = only;
      }
    }
    if (pending) {
      this.timers.clearTimeout(pending.timer);
      this.pending.delete(pending.txn);
      pending.resolve(frame);
      return;
    }
    if (packetType === (import_protocol.PACKET_ALIVE | 255) || packetType === import_protocol.PACKET_ALIVE) {
      return;
    }
    this.log.debug(
      `[local/rx] unsolicited frame type=0x${packetType.toString(16)} txn=${txn} payload=${frame.payload.length}B`
    );
  }
  /**
   * Send a framed ONet packet and await the reply frame (matched by txn / type).
   *
   * @param frame - the raw frame bytes to write
   * @param txn - the transaction number embedded in the frame
   * @param packetType - the request packet type (used for the txn-less fallback match)
   */
  sendFrameAwait(frame, txn, packetType) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new Error("no controller connection"));
        return;
      }
      const stale = this.pending.get(txn);
      if (stale) {
        this.timers.clearTimeout(stale.timer);
        this.pending.delete(txn);
        stale.reject(new Error("superseded by a new request with the same transaction number"));
      }
      const timer = this.timers.setTimeout(() => {
        this.pending.delete(txn);
        reject(
          new Error(`no reply within ${this.opts.requestTimeoutMs} ms (type 0x${packetType.toString(16)})`)
        );
      }, this.opts.requestTimeoutMs);
      this.pending.set(txn, { txn, packetType, resolve, reject, timer });
      this.socket.write(frame, (err) => {
        if (err) {
          const p = this.pending.get(txn);
          if (p) {
            this.timers.clearTimeout(p.timer);
            this.pending.delete(txn);
          }
          reject(err);
        }
      });
    });
  }
  /**
   * Send a raw ONet packet (base64) and return the reply packet (base64).
   * Implements {@link OnetTransport} so the poll/command logic is transport-agnostic.
   *
   * @param dataB64 - the request packet, base64-encoded
   */
  async sendOnet(dataB64) {
    if (!this.isReady) {
      throw new Error("local channel is not ready (controller not connected/authenticated)");
    }
    const frame = Buffer.from(dataB64, "base64");
    const header = (0, import_onet.parseFrameHeader)(frame);
    if (!header) {
      throw new Error("sendOnet called with a non-ONet packet");
    }
    const reply = await this.sendFrameAwait(frame, header.txn, header.packetType);
    return reply.raw.toString("base64");
  }
  /** Start the periodic ALIVE keep-alive. */
  startAlive() {
    this.stopAlive();
    this.aliveTimer = this.timers.setInterval(() => {
      if (!this.isReady) {
        return;
      }
      const txn = this.nextTxn();
      this.sendFrameAwait((0, import_protocol.buildAlive)(txn), txn, import_protocol.PACKET_ALIVE).catch((err) => {
        this.log.warn(`[local/alive] keep-alive failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, this.opts.aliveIntervalMs);
  }
  stopAlive() {
    if (this.aliveTimer) {
      this.timers.clearInterval(this.aliveTimer);
      this.aliveTimer = void 0;
    }
  }
  /**
   * Handle loss of the controller connection: fail pending requests and schedule a re-wake.
   *
   * @param peer - the controller's address (for logging)
   */
  onSocketClosed(peer) {
    var _a, _b;
    const wasReady = this.isReady;
    this.socket = void 0;
    this.authed = false;
    this.stopAlive();
    this.failAllPending("controller connection closed");
    if (wasReady) {
      (_b = (_a = this.opts).onConnectionChange) == null ? void 0 : _b.call(_a, false);
    }
    if (this.stopping) {
      return;
    }
    this.log.warn(`[local/tls] controller ${peer} disconnected \u2014 re-waking in 5 s`);
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = void 0;
      if (!this.stopping) {
        this.sendWake();
      }
    }, 5e3);
  }
  failAllPending(reason) {
    for (const p of this.pending.values()) {
      this.timers.clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }
  /** Release all resources (sockets, server, timers). Safe to call multiple times. */
  reset() {
    this.stopping = true;
    this.stopAlive();
    if (this.reconnectTimer) {
      this.timers.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = void 0;
    }
    this.failAllPending("adapter shutting down");
    this.authListeners = [];
    if (this.udp) {
      try {
        this.udp.close();
      } catch {
      }
      this.udp = void 0;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = void 0;
    }
    if (this.server) {
      this.server.close();
      this.server = void 0;
    }
    this.authed = false;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LocalClient
});
//# sourceMappingURL=client.js.map
