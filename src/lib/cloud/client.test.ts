import { expect } from "chai";
import { CloudAuthError, CloudClient, extractToken } from "./client";

const silentLog = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
};

/**
 * Build a fake fetch that routes by URL suffix and records calls.
 *
 * @param routes - map of URL suffix to response factory
 */
function fakeFetch(routes: Record<string, () => Response>): { fetch: typeof fetch; calls: string[] } {
    const calls: string[] = [];
    const fetchImpl = ((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        calls.push(url);
        for (const [suffix, handler] of Object.entries(routes)) {
            if (url.includes(suffix)) {
                return Promise.resolve(handler());
            }
        }
        return Promise.resolve(new Response("not found", { status: 404 }));
    }) as typeof fetch;
    return { fetch: fetchImpl, calls };
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const TOKEN = "/oauth2/v2.0/token";
const INVENTORY = "/User/Inventory";

const baseOpts = {
    baseUrl: "https://api.test",
    tokenUrl: "https://account.test/tenant/policy/oauth2/v2.0/token",
    clientId: "client-123",
    scope: "oase.read offline_access",
    refreshToken: "RT-initial",
    log: silentLog,
};

describe("extractToken", () => {
    it("finds the access token under common keys", () => {
        expect(extractToken({ access_token: "abc" })).to.equal("abc");
        expect(extractToken({ token: "def" })).to.equal("def");
    });

    it("accepts a bare string token", () => {
        expect(extractToken("rawtoken")).to.equal("rawtoken");
    });

    it("returns undefined when no token is present", () => {
        expect(extractToken({ foo: "bar" })).to.equal(undefined);
        expect(extractToken(null)).to.equal(undefined);
    });
});

describe("CloudClient (B2C refresh_token grant)", () => {
    it("refreshes an access token and fetches the inventory", async () => {
        const { fetch, calls } = fakeFetch({
            [TOKEN]: () => json({ access_token: "AT1", token_type: "Bearer", expires_in: 3600 }),
            [INVENTORY]: () => json({ gateways: [{ serialNumber: "1", devices: [] }] }),
        });
        const client = new CloudClient({ ...baseOpts, fetchImpl: fetch });
        const inv = (await client.fetchInventory()) as { gateways: { serialNumber: string }[] };
        expect(inv.gateways[0].serialNumber).to.equal("1");
        expect(client.isConnected()).to.equal(true);
        expect(calls.some(u => u.includes(TOKEN))).to.equal(true);
    });

    it("sends a form-encoded refresh_token grant with the configured client id and scope", async () => {
        let capturedBody = "";
        const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            if (url.includes(TOKEN)) {
                capturedBody = typeof init?.body === "string" ? init.body : "";
                return Promise.resolve(json({ access_token: "AT", expires_in: 3600 }));
            }
            return Promise.resolve(json({ gateways: [] }));
        }) as typeof fetch;
        const client = new CloudClient({ ...baseOpts, fetchImpl });
        await client.connect();
        const params = new URLSearchParams(capturedBody);
        expect(params.get("grant_type")).to.equal("refresh_token");
        expect(params.get("client_id")).to.equal("client-123");
        expect(params.get("scope")).to.equal("oase.read offline_access");
        expect(params.get("refresh_token")).to.equal("RT-initial");
    });

    it("persists a rotated refresh token via onRefreshToken", async () => {
        const rotated: string[] = [];
        const { fetch } = fakeFetch({
            [TOKEN]: () => json({ access_token: "AT", expires_in: 3600, refresh_token: "RT-rotated" }),
            [INVENTORY]: () => json({ gateways: [] }),
        });
        const client = new CloudClient({ ...baseOpts, fetchImpl: fetch, onRefreshToken: t => rotated.push(t) });
        await client.connect();
        expect(rotated).to.deep.equal(["RT-rotated"]);
    });

    it("re-authenticates once on a 401 and retries the inventory", async () => {
        let inventoryCalls = 0;
        let tokenCalls = 0;
        const { fetch } = fakeFetch({
            [TOKEN]: () => {
                tokenCalls++;
                return json({ access_token: `AT${tokenCalls}`, expires_in: 3600 });
            },
            [INVENTORY]: () => {
                inventoryCalls++;
                return inventoryCalls === 1
                    ? new Response("", { status: 401 })
                    : json({ gateways: [{ serialNumber: "9", devices: [] }] });
            },
        });
        const client = new CloudClient({ ...baseOpts, fetchImpl: fetch });
        const inv = (await client.fetchInventory()) as { gateways: { serialNumber: string }[] };
        expect(inv.gateways[0].serialNumber).to.equal("9");
        expect(tokenCalls).to.equal(2);
        expect(inventoryCalls).to.equal(2);
    });

    it("throws CloudAuthError when no refresh token is configured", async () => {
        const { fetch } = fakeFetch({});
        const client = new CloudClient({ ...baseOpts, refreshToken: "", fetchImpl: fetch });
        let thrown: unknown;
        try {
            await client.fetchInventory();
        } catch (error) {
            thrown = error;
        }
        expect(thrown).to.be.instanceOf(CloudAuthError);
    });

    it("throws CloudAuthError on invalid_grant (expired refresh token)", async () => {
        const { fetch } = fakeFetch({
            [TOKEN]: () => json({ error: "invalid_grant", error_description: "AADB2C90080" }, 400),
        });
        const client = new CloudClient({ ...baseOpts, fetchImpl: fetch });
        let thrown: unknown;
        try {
            await client.connect();
        } catch (error) {
            thrown = error;
        }
        expect(thrown).to.be.instanceOf(CloudAuthError);
    });
});
