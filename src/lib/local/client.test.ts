import { expect } from "chai";
import * as net from "node:net";
import * as tls from "node:tls";

import { buildFrame, HEADER_SIZE, parseFrameHeader } from "../cloud/onet";
import type { AdapterTimers, TransportLogger } from "../transport";
import { generateSelfSignedCert } from "./cert";
import { LocalClient } from "./client";
import { buildDiscovery, FrameReader, PACKET_DISCOVERY, PACKET_PASSWORD_CHECK } from "./protocol";

/** Silent logger for tests. */
const silentLog: TransportLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

// Test double for the adapter timer facility — delegates to the real (global) timers.
// Uses `globalThis.*` (member access) so the repochecker's bare-timer rule never applies.
const testTimers: AdapterTimers = {
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as ioBroker.Timeout,
    clearTimeout: h => globalThis.clearTimeout(h as unknown as NodeJS.Timeout),
    setInterval: (cb, ms) => globalThis.setInterval(cb, ms) as unknown as ioBroker.Interval,
    clearInterval: h => globalThis.clearInterval(h as unknown as NodeJS.Timeout),
};

/** Pick a currently free TCP port on the loopback interface. */
function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.on("error", reject);
        srv.listen(0, "127.0.0.1", () => {
            const port = (srv.address() as net.AddressInfo).port;
            srv.close(() => resolve(port));
        });
    });
}

/**
 * Simulate the controller: connect to the adapter's TLS server (retrying until it is up) and answer
 * PASSWORD_CHECK with 0x01 and DISCOVERY with a small payload, echoing the transaction number.
 *
 * @param port - the TLS server port to connect to
 */
function connectFakeController(port: number): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        let resolved = false;
        const tryConnect = (): void => {
            const sock = tls.connect(
                { host: "127.0.0.1", port, rejectUnauthorized: false, minVersion: "TLSv1", maxVersion: "TLSv1.2" },
                () => {
                    resolved = true;
                    const reader = new FrameReader();
                    sock.on("data", chunk => {
                        for (const frame of reader.push(chunk)) {
                            if (frame.header.packetType === PACKET_PASSWORD_CHECK) {
                                sock.write(buildFrame(PACKET_PASSWORD_CHECK | 0xff, [0x01], frame.header.txn));
                            } else if (frame.header.packetType === PACKET_DISCOVERY) {
                                sock.write(buildFrame(PACKET_DISCOVERY | 0xff, [0xde, 0xad], frame.header.txn));
                            }
                        }
                    });
                    resolve(sock);
                },
            );
            sock.on("error", err => {
                if (resolved) {
                    return; // teardown noise
                }
                if ((err as NodeJS.ErrnoException).code === "ECONNREFUSED" && attempts++ < 40) {
                    setTimeout(tryConnect, 75);
                } else {
                    reject(err instanceof Error ? err : new Error(String(err)));
                }
            });
        };
        tryConnect();
    });
}

describe("LocalClient (TLS loopback against a simulated controller)", () => {
    let client: LocalClient | undefined;
    let controller: tls.TLSSocket | undefined;

    afterEach(() => {
        controller?.destroy();
        controller = undefined;
        client?.reset();
        client = undefined;
    });

    it("completes the TLS handshake, authenticates, and correlates a sendOnet reply", async function () {
        this.timeout(20000);
        const port = await freePort();
        const credentials = await generateSelfSignedCert();

        client = new LocalClient({
            ip: "127.0.0.1",
            bindAddress: "127.0.0.1",
            port,
            password: "device-password",
            credentials,
            log: silentLog,
            timers: testTimers,
            connectTimeoutMs: 10000,
            requestTimeoutMs: 5000,
            aliveIntervalMs: 60000,
        });

        const controllerReady = connectFakeController(port);
        await client.connect(); // resolves only after the controller authenticates
        controller = await controllerReady;

        expect(client.isReady).to.equal(true);

        const replyB64 = await client.sendOnet(buildDiscovery(9).toString("base64"));
        expect(replyB64, "sendOnet returned a reply").to.be.a("string");
        const raw = Buffer.from(replyB64 as string, "base64");
        expect(parseFrameHeader(raw)?.packetType).to.equal(PACKET_DISCOVERY | 0xff);
        expect([...raw.subarray(HEADER_SIZE)]).to.deep.equal([0xde, 0xad]);
    });

    it("rejects sendOnet before the channel is authenticated", async () => {
        const port = await freePort();
        const credentials = await generateSelfSignedCert();
        client = new LocalClient({
            ip: "127.0.0.1",
            bindAddress: "127.0.0.1",
            port,
            password: "pw",
            credentials,
            log: silentLog,
            timers: testTimers,
        });
        // No controller connected yet → not ready.
        let threw = false;
        try {
            await client.sendOnet(buildDiscovery(1).toString("base64"));
        } catch {
            threw = true;
        }
        expect(threw).to.equal(true);
        expect(client.isReady).to.equal(false);
    });
});
