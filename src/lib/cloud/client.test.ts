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
            if (url.endsWith(suffix)) {
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

describe("extractToken", () => {
    it("finds the token under common keys", () => {
        expect(extractToken({ token: "abc" })).to.equal("abc");
        expect(extractToken({ accessToken: "def" })).to.equal("def");
        expect(extractToken({ access_token: "ghi" })).to.equal("ghi");
    });

    it("finds a nested token", () => {
        expect(extractToken({ data: { token: "nested" } })).to.equal("nested");
        expect(extractToken({ result: { accessToken: "n2" } })).to.equal("n2");
    });

    it("accepts a bare string token", () => {
        expect(extractToken("rawtoken")).to.equal("rawtoken");
    });

    it("returns undefined when no token is present", () => {
        expect(extractToken({ foo: "bar" })).to.equal(undefined);
        expect(extractToken(null)).to.equal(undefined);
    });
});

describe("CloudClient", () => {
    const baseOpts = {
        baseUrl: "https://example.test",
        loginPath: "/User/Login",
        user: "user@example.test",
        password: "secret",
        log: silentLog,
    };

    it("logs in and fetches the inventory", async () => {
        const { fetch } = fakeFetch({
            "/User/Login": () => json({ token: "T1" }),
            "/User/Inventory": () => json({ gateway: { serialNumber: "1" }, devices: [] }),
        });
        const client = new CloudClient({ ...baseOpts, fetchImpl: fetch });
        const inv = (await client.fetchInventory()) as { gateway: { serialNumber: string } };
        expect(inv.gateway.serialNumber).to.equal("1");
        expect(client.isConnected()).to.equal(true);
    });

    it("re-authenticates once on a 401 and retries", async () => {
        let inventoryCalls = 0;
        let loginCalls = 0;
        const { fetch } = fakeFetch({
            "/User/Login": () => {
                loginCalls++;
                return json({ token: `T${loginCalls}` });
            },
            "/User/Inventory": () => {
                inventoryCalls++;
                // First inventory call is unauthorized, second succeeds.
                return inventoryCalls === 1
                    ? new Response("", { status: 401 })
                    : json({ gateway: { serialNumber: "9" }, devices: [] });
            },
        });
        const client = new CloudClient({ ...baseOpts, fetchImpl: fetch });
        const inv = (await client.fetchInventory()) as { gateway: { serialNumber: string } };
        expect(inv.gateway.serialNumber).to.equal("9");
        expect(loginCalls).to.equal(2);
        expect(inventoryCalls).to.equal(2);
    });

    it("throws CloudAuthError when the login path is not configured", async () => {
        const { fetch } = fakeFetch({});
        const client = new CloudClient({ ...baseOpts, loginPath: "", fetchImpl: fetch });
        let thrown: unknown;
        try {
            await client.fetchInventory();
        } catch (error) {
            thrown = error;
        }
        expect(thrown).to.be.instanceOf(CloudAuthError);
    });

    it("throws CloudAuthError when the login is rejected", async () => {
        const { fetch } = fakeFetch({ "/User/Login": () => new Response("", { status: 401 }) });
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
