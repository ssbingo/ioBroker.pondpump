/*
 * Local transport for the OASE controller.
 *
 * Connection dance (controller = TLS client, we = TLS server):
 *   1. We start a TLS server on `bindAddress:port`.
 *   2. We send a UDP unicast wake packet (TCP_REQ) to `ip:udpPort`.
 *   3. The controller connects back to our TLS server.
 *   4. We send PASSWORD_CHECK; on the 0x01 reply the channel is authenticated.
 *   5. From then on we exchange the same ONet packets as the cloud path (via `sendOnet`).
 *
 * Everything is released in `reset()` so the adapter unloads cleanly (compact mode).
 */

import * as dgram from "node:dgram";
import * as tls from "node:tls";

import { parseFrameHeader } from "../cloud/onet";
import type { OnetTransport, TransportLogger } from "../transport";
import type { TlsCredentials } from "./cert";
import {
    buildAlive,
    buildPasswordCheck,
    buildTcpReq,
    DEFAULT_UDP_PORT,
    FrameReader,
    type OnetFrame,
    PACKET_ALIVE,
} from "./protocol";

/** TLS settings tuned for the controller's legacy stack (old ciphers, no TLSv1.3). */
const DEFAULT_CIPHERS =
    "ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:AES128-SHA:AES256-SHA:DES-CBC3-SHA:AES128-GCM-SHA256:DEFAULT:@SECLEVEL=0";

/** Construction options for {@link LocalClient}. */
export interface LocalClientOptions {
    /** Controller IP address (target of the UDP wake packet). */
    ip: string;
    /** Address our TLS server binds to (the controller connects back here). */
    bindAddress: string;
    /** TCP port our TLS server listens on (the controller connects back here). */
    port: number;
    /** Device password (the 64-character value from the cloud inventory). */
    password: string;
    /** TLS server certificate/key. */
    credentials: TlsCredentials;
    /** Logger (usually adapter.log). */
    log: TransportLogger;
    /** Controller UDP port for the wake packet (default 5959). */
    udpPort?: number;
    /** Per-request timeout in milliseconds (default 8000). */
    requestTimeoutMs?: number;
    /** How long to wait for the controller to connect + authenticate (default 15000). */
    connectTimeoutMs?: number;
    /** Keep-alive interval in milliseconds (default 20000). */
    aliveIntervalMs?: number;
    /** OpenSSL cipher string (default tuned for the legacy device). */
    ciphers?: string;
    /** Called on authenticated-connection transitions (true = up, false = down). */
    onConnectionChange?: (up: boolean) => void;
}

/** A request awaiting its reply frame. */
interface Pending {
    txn: number;
    packetType: number;
    resolve: (reply: OnetFrame) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
}

/** {@link LocalClientOptions} with all optional tuning fields resolved to concrete values. */
interface ResolvedOptions extends LocalClientOptions {
    udpPort: number;
    requestTimeoutMs: number;
    connectTimeoutMs: number;
    aliveIntervalMs: number;
    ciphers: string;
}

/**
 * Local LAN transport: runs the TLS server the controller connects back to, performs the password
 * handshake, and exchanges ONet packets over the resulting stream. Implements {@link OnetTransport}.
 */
export class LocalClient implements OnetTransport {
    private readonly opts: ResolvedOptions;
    private readonly log: TransportLogger;
    private server?: tls.Server;
    private socket?: tls.TLSSocket;
    private readonly reader = new FrameReader();
    private readonly pending = new Map<number, Pending>();
    private aliveTimer?: NodeJS.Timeout;
    private reconnectTimer?: NodeJS.Timeout;
    private authed = false;
    private stopping = false;
    private txn = 0;
    /** IP advertised to the controller in the wake packet (auto-detected when bind is 0.0.0.0). */
    private advertiseIp?: string;
    /** Persistent UDP socket for the wake handshake — kept open to receive the controller's reply. */
    private udp?: dgram.Socket;

    /**
     * @param options - connection parameters (controller IP, TLS bind/port, password, credentials, logger)
     */
    public constructor(options: LocalClientOptions) {
        this.log = options.log;
        this.opts = {
            ...options,
            udpPort: options.udpPort ?? DEFAULT_UDP_PORT,
            requestTimeoutMs: options.requestTimeoutMs ?? 8000,
            connectTimeoutMs: options.connectTimeoutMs ?? 15000,
            aliveIntervalMs: options.aliveIntervalMs ?? 20000,
            ciphers: options.ciphers ?? DEFAULT_CIPHERS,
        };
    }

    /** Whether the channel is currently authenticated and ready for `sendOnet`. */
    public get isReady(): boolean {
        return this.authed && !!this.socket && !this.socket.destroyed;
    }

    /** Next rolling transaction number (0..255). */
    private nextTxn(): number {
        this.txn = (this.txn + 1) & 0xff;
        return this.txn;
    }

    /**
     * Start the TLS server, then wake the controller and wait until it has connected and
     * authenticated. Resolves once the channel is ready; rejects on timeout.
     */
    public async connect(): Promise<void> {
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
    private resolveAdvertiseIp(): Promise<string> {
        const bind = this.opts.bindAddress;
        if (bind && bind !== "0.0.0.0" && bind !== "::" && /^\d+\.\d+\.\d+\.\d+$/.test(bind)) {
            return Promise.resolve(bind);
        }
        return new Promise(resolve => {
            const probe = dgram.createSocket("udp4");
            const done = (ip: string): void => {
                try {
                    probe.close();
                } catch {
                    /* already closed */
                }
                this.log.info(
                    `[local/udp] advertising local address ${ip} to the controller ` +
                        `(bind is ${bind}; auto-detected the route to ${this.opts.ip})`,
                );
                resolve(ip);
            };
            probe.on("error", () => done("0.0.0.0"));
            try {
                // "Connecting" a UDP socket does not send anything; it just fixes the local address
                // the OS would use to reach the controller, which we then read back.
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
    private startServer(): Promise<void> {
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
                    honorCipherOrder: false,
                    requestCert: false,
                    rejectUnauthorized: false,
                },
                socket => this.onControllerSocket(socket),
            );
            server.on("error", err => {
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
    private waitForAuthenticatedConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            let settled = false;
            // The auth handler does not touch the timer (the guarded, unref'd timer simply no-ops
            // after success), which keeps the two callbacks free of a circular reference.
            const handleAuth = (): void => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve();
            };
            const timer = setTimeout(() => {
                if (settled) {
                    return;
                }
                settled = true;
                this.offAuth(handleAuth);
                reject(
                    new Error(
                        `controller did not connect/authenticate within ${this.opts.connectTimeoutMs} ms ` +
                            `(check: controller IP ${this.opts.ip}, UDP ${this.opts.udpPort} reachable, ` +
                            `TCP ${this.opts.port} reachable back to ${this.opts.bindAddress}, device password)`,
                    ),
                );
            }, this.opts.connectTimeoutMs);
            if (typeof timer.unref === "function") {
                timer.unref();
            }
            this.onAuth(handleAuth);
            this.sendWake();
        });
    }

    // Minimal one-shot auth event plumbing (avoids pulling in EventEmitter for a single event).
    private authListeners: Array<() => void> = [];
    private onAuth(cb: () => void): void {
        this.authListeners.push(cb);
    }
    private offAuth(cb: () => void): void {
        this.authListeners = this.authListeners.filter(l => l !== cb);
    }
    private emitAuth(): void {
        const listeners = this.authListeners;
        this.authListeners = [];
        for (const l of listeners) {
            l();
        }
    }

    /** Lazily create the persistent UDP socket used for the wake handshake. */
    private ensureUdp(): dgram.Socket {
        if (this.udp) {
            return this.udp;
        }
        const udp = dgram.createSocket("udp4");
        udp.on("message", (msg, rinfo) => this.onUdpMessage(msg, rinfo));
        udp.on("error", err => this.log.warn(`[local/udp] socket error: ${err.message}`));
        udp.unref(); // never keep the process alive just for this socket
        this.udp = udp;
        return udp;
    }

    /** Send the UDP TCP_REQ wake packet to the controller (socket stays open for the reply). */
    private sendWake(): void {
        const udp = this.ensureUdp();
        const advertiseIp = this.advertiseIp ?? this.opts.bindAddress;
        const frame = buildTcpReq(advertiseIp, this.opts.port, this.nextTxn());
        this.log.info(
            `[local/udp] sending wake (TCP_REQ) to ${this.opts.ip}:${this.opts.udpPort} — ` +
                `tells controller to connect back to ${advertiseIp}:${this.opts.port}`,
        );
        this.log.debug(`[local/udp] wake packet (${frame.length} bytes): ${frame.toString("hex")}`);
        udp.send(frame, this.opts.udpPort, this.opts.ip, err => {
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
    private onUdpMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
        this.log.info(
            `[local/udp] reply from ${rinfo.address}:${rinfo.port} (${msg.length} bytes): ${msg.toString("hex")}`,
        );
        const header = parseFrameHeader(msg);
        if (header) {
            this.log.info(
                `[local/udp] reply decoded: ONet type 0x${header.packetType.toString(16)} ` +
                    `txn=${header.txn} version=${header.version} payloadLen=${header.payloadLength} ` +
                    `payload=${msg.subarray(16).toString("hex") || "(none)"}`,
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
    private onControllerSocket(socket: tls.TLSSocket): void {
        if (this.socket && !this.socket.destroyed) {
            this.log.warn("[local/tls] a controller connection already exists — replacing it");
            this.socket.destroy();
        }
        this.socket = socket;
        this.reader.reset();
        const peer = `${socket.remoteAddress ?? "?"}:${socket.remotePort ?? "?"}`;
        this.log.info(
            `[local/tls] controller connected from ${peer} ` +
                `(protocol=${socket.getProtocol() ?? "?"}, cipher=${socket.getCipher()?.name ?? "?"})`,
        );

        socket.on("data", chunk => this.onData(chunk));
        socket.on("error", err => this.log.warn(`[local/tls] socket error: ${err.message}`));
        socket.on("close", () => this.onSocketClosed(peer));

        void this.authenticate();
    }

    /** Send PASSWORD_CHECK and mark the channel authenticated on the 0x01 reply. */
    private async authenticate(): Promise<void> {
        const txn = this.nextTxn();
        this.log.debug("[local/auth] sending PASSWORD_CHECK (64-byte password block)");
        try {
            const reply = await this.sendFrameAwait(buildPasswordCheck(this.opts.password, txn), txn, 0x9f00);
            const ok = reply.payload.length >= 1 && reply.payload[0] === 0x01;
            if (!ok) {
                this.log.error(
                    `[local/auth] password rejected by controller (reply payload ${reply.payload.toString("hex")}) — ` +
                        "check the device password in the adapter settings",
                );
                this.socket?.destroy();
                return;
            }
            this.authed = true;
            this.log.info("[local/auth] authenticated — local channel is ready");
            this.startAlive();
            this.opts.onConnectionChange?.(true);
            this.emitAuth();
        } catch (err) {
            this.log.error(`[local/auth] password check failed: ${err instanceof Error ? err.message : String(err)}`);
            this.socket?.destroy();
        }
    }

    /**
     * Feed inbound bytes to the frame reader and dispatch complete frames.
     *
     * @param chunk - freshly received TLS bytes
     */
    private onData(chunk: Buffer): void {
        for (const frame of this.reader.push(chunk)) {
            this.dispatch(frame);
        }
    }

    /**
     * Route a complete inbound frame to its pending request, or handle it as unsolicited.
     *
     * @param frame - a fully reassembled inbound frame
     */
    private dispatch(frame: OnetFrame): void {
        const { txn, packetType } = frame.header;

        // Primary: match by echoed transaction number.
        let pending = this.pending.get(txn);
        // Fallback for firmware that does not echo txn: if exactly one request is in flight and the
        // reply type matches request|0xFF, accept it. Sends are serialized, so this is unambiguous.
        if (!pending && this.pending.size === 1) {
            const only = [...this.pending.values()][0];
            if (packetType === (only.packetType | 0xff)) {
                pending = only;
            }
        }

        if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(pending.txn);
            pending.resolve(frame);
            return;
        }

        if (packetType === (PACKET_ALIVE | 0xff) || packetType === PACKET_ALIVE) {
            // Routine keep-alive echo — not worth a log line.
            return;
        }
        this.log.debug(
            `[local/rx] unsolicited frame type=0x${packetType.toString(16)} txn=${txn} ` +
                `payload=${frame.payload.length}B`,
        );
    }

    /**
     * Send a framed ONet packet and await the reply frame (matched by txn / type).
     *
     * @param frame - the raw frame bytes to write
     * @param txn - the transaction number embedded in the frame
     * @param packetType - the request packet type (used for the txn-less fallback match)
     */
    private sendFrameAwait(frame: Buffer, txn: number, packetType: number): Promise<OnetFrame> {
        return new Promise<OnetFrame>((resolve, reject) => {
            if (!this.socket || this.socket.destroyed) {
                reject(new Error("no controller connection"));
                return;
            }
            // A reused in-flight txn: fail the older one first.
            const stale = this.pending.get(txn);
            if (stale) {
                clearTimeout(stale.timer);
                this.pending.delete(txn);
                stale.reject(new Error("superseded by a new request with the same transaction number"));
            }
            const timer = setTimeout(() => {
                this.pending.delete(txn);
                reject(
                    new Error(`no reply within ${this.opts.requestTimeoutMs} ms (type 0x${packetType.toString(16)})`),
                );
            }, this.opts.requestTimeoutMs);
            this.pending.set(txn, { txn, packetType, resolve, reject, timer });
            this.socket.write(frame, err => {
                if (err) {
                    const p = this.pending.get(txn);
                    if (p) {
                        clearTimeout(p.timer);
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
    public async sendOnet(dataB64: string): Promise<string | undefined> {
        if (!this.isReady) {
            throw new Error("local channel is not ready (controller not connected/authenticated)");
        }
        const frame = Buffer.from(dataB64, "base64");
        const header = parseFrameHeader(frame);
        if (!header) {
            throw new Error("sendOnet called with a non-ONet packet");
        }
        const reply = await this.sendFrameAwait(frame, header.txn, header.packetType);
        return reply.raw.toString("base64");
    }

    /** Start the periodic ALIVE keep-alive. */
    private startAlive(): void {
        this.stopAlive();
        this.aliveTimer = setInterval(() => {
            if (!this.isReady) {
                return;
            }
            const txn = this.nextTxn();
            this.sendFrameAwait(buildAlive(txn), txn, PACKET_ALIVE).catch(err => {
                this.log.warn(`[local/alive] keep-alive failed: ${err instanceof Error ? err.message : String(err)}`);
            });
        }, this.opts.aliveIntervalMs);
        if (typeof this.aliveTimer.unref === "function") {
            this.aliveTimer.unref();
        }
    }

    private stopAlive(): void {
        if (this.aliveTimer) {
            clearInterval(this.aliveTimer);
            this.aliveTimer = undefined;
        }
    }

    /**
     * Handle loss of the controller connection: fail pending requests and schedule a re-wake.
     *
     * @param peer - the controller's address (for logging)
     */
    private onSocketClosed(peer: string): void {
        const wasReady = this.isReady;
        this.socket = undefined;
        this.authed = false;
        this.stopAlive();
        this.failAllPending("controller connection closed");
        if (wasReady) {
            this.opts.onConnectionChange?.(false);
        }
        if (this.stopping) {
            return;
        }
        this.log.warn(`[local/tls] controller ${peer} disconnected — re-waking in 5 s`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            if (!this.stopping) {
                this.sendWake();
            }
        }, 5000);
        if (typeof this.reconnectTimer.unref === "function") {
            this.reconnectTimer.unref();
        }
    }

    private failAllPending(reason: string): void {
        for (const p of this.pending.values()) {
            clearTimeout(p.timer);
            p.reject(new Error(reason));
        }
        this.pending.clear();
    }

    /** Release all resources (sockets, server, timers). Safe to call multiple times. */
    public reset(): void {
        this.stopping = true;
        this.stopAlive();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        this.failAllPending("adapter shutting down");
        this.authListeners = [];
        if (this.udp) {
            try {
                this.udp.close();
            } catch {
                /* already closed */
            }
            this.udp = undefined;
        }
        if (this.socket) {
            this.socket.destroy();
            this.socket = undefined;
        }
        if (this.server) {
            this.server.close();
            this.server = undefined;
        }
        this.authed = false;
    }
}
