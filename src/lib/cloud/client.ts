/*
 * CloudClient — talks to the OASE Garden Controller Cloud REST API.
 *
 * Known facts (from live probing + capture):
 *   - Base URL:  https://app-oasecloud-prod.azurewebsites.net
 *   - Auth:      Bearer JWT (WWW-Authenticate: Bearer), ASP.NET Core backend
 *   - Inventory: GET /User/Inventory  (401 without a valid token)
 *
 * The exact login endpoint is not part of the available capture. It is therefore
 * configurable (baseUrl + loginPath) so it can be pointed at the correct route once a
 * real login request has been captured, without rebuilding the adapter. The login
 * request/response handling below implements the most likely shape (JSON email/password
 * -> JSON body containing a bearer token) and is deliberately tolerant about the token
 * field name.
 */

/** Minimal logging interface (satisfied by adapter.log). */
export interface CloudLogger {
    /** Log a debug message. */
    debug(message: string): void;
    /** Log an info message. */
    info(message: string): void;
    /** Log a warning. */
    warn(message: string): void;
    /** Log an error. */
    error(message: string): void;
}

/** Construction options for {@link CloudClient}. */
export interface CloudClientOptions {
    /** API base URL, e.g. https://app-oasecloud-prod.azurewebsites.net */
    baseUrl: string;
    /** Login route relative to baseUrl, e.g. "/User/Login". Empty => login not configured. */
    loginPath: string;
    /** OASE account e-mail. */
    user: string;
    /** OASE account password. */
    password: string;
    /** Per-request timeout in milliseconds. */
    timeoutMs?: number;
    /** Injectable fetch implementation (defaults to global fetch). */
    fetchImpl?: typeof fetch;
    /** Logger (usually adapter.log). */
    log: CloudLogger;
}

export const DEFAULT_BASE_URL = "https://app-oasecloud-prod.azurewebsites.net";
export const INVENTORY_PATH = "/User/Inventory";
export const DEFAULT_TIMEOUT_MS = 15000;

/** Thrown when authentication is not possible (bad/missing credentials or endpoint). */
export class CloudAuthError extends Error {
    /**
     * @param message - human-readable error description
     */
    public constructor(message: string) {
        super(message);
        this.name = "CloudAuthError";
    }
}

/** Thrown for non-auth HTTP/transport failures. */
export class CloudRequestError extends Error {
    /**
     * @param message - human-readable error description
     * @param status - HTTP status code, if the server responded
     */
    public constructor(
        message: string,
        public readonly status?: number,
    ) {
        super(message);
        this.name = "CloudRequestError";
    }
}

/** Candidate keys that may hold the bearer token in a login response. */
const TOKEN_KEYS = ["token", "accessToken", "access_token", "jwt", "bearerToken", "id_token"];

/**
 * Try to extract a bearer token from a parsed login response body.
 *
 * @param body - parsed JSON (or raw string) body of the login response
 */
export function extractToken(body: unknown): string | undefined {
    if (typeof body === "string" && body.length > 0) {
        return body;
    }
    if (typeof body !== "object" || body === null) {
        return undefined;
    }
    const record = body as Record<string, unknown>;
    for (const key of TOKEN_KEYS) {
        const value = record[key];
        if (typeof value === "string" && value.length > 0) {
            return value;
        }
    }
    // Some APIs nest the token, e.g. { data: { token } } or { result: { accessToken } }.
    for (const nestKey of ["data", "result", "payload"]) {
        const nested = record[nestKey];
        if (typeof nested === "object" && nested !== null) {
            const found = extractToken(nested);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}

/** Session-holding client for the OASE cloud API (login + inventory polling). */
export class CloudClient {
    private readonly baseUrl: string;
    private readonly loginPath: string;
    private readonly user: string;
    private readonly password: string;
    private readonly timeoutMs: number;
    private readonly fetchImpl: typeof fetch;
    private readonly log: CloudLogger;

    private token: string | undefined;

    /**
     * @param options - connection parameters, credentials and logger
     */
    public constructor(options: CloudClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.loginPath = options.loginPath.trim();
        this.user = options.user;
        this.password = options.password;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
        this.log = options.log;
    }

    /** Whether a session token is currently held. */
    public isConnected(): boolean {
        return this.token !== undefined;
    }

    /** Drop the current session token (e.g. on shutdown or after a 401). */
    public reset(): void {
        this.token = undefined;
    }

    /** Authenticate and store the bearer token. */
    public async connect(): Promise<void> {
        await this.login();
    }

    /**
     * Fetch and return the raw inventory JSON. Re-authenticates once on a 401.
     *
     * @returns the parsed JSON body of `GET /User/Inventory`
     */
    public async fetchInventory(): Promise<unknown> {
        if (!this.token) {
            await this.login();
        }
        try {
            return await this.getJson(INVENTORY_PATH);
        } catch (error) {
            if (error instanceof CloudAuthError) {
                // Token likely expired — re-login once and retry.
                this.log.debug("Inventory request unauthorized, re-authenticating once");
                this.token = undefined;
                await this.login();
                return await this.getJson(INVENTORY_PATH);
            }
            throw error;
        }
    }

    private async login(): Promise<void> {
        if (!this.loginPath) {
            throw new CloudAuthError(
                "Cloud login endpoint is not configured. Capture a login request from the OASE app " +
                    "and set the login path in the adapter configuration.",
            );
        }
        if (!this.user || !this.password) {
            throw new CloudAuthError("Cloud credentials are not configured");
        }

        const response = await this.request(this.loginPath, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ email: this.user, password: this.password }),
        });

        if (response.status === 401 || response.status === 403) {
            throw new CloudAuthError(`Cloud login rejected (HTTP ${response.status}) — check credentials`);
        }
        if (!response.ok) {
            throw new CloudRequestError(`Cloud login failed (HTTP ${response.status})`, response.status);
        }

        const body = await this.readBody(response);
        const token = extractToken(body);
        if (!token) {
            throw new CloudAuthError("Cloud login succeeded but no token was found in the response");
        }
        this.token = token;
        this.log.debug("Cloud login successful");
    }

    private async getJson(path: string): Promise<unknown> {
        const response = await this.request(path, {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${this.token}`,
            },
        });
        if (response.status === 401 || response.status === 403) {
            throw new CloudAuthError(`Unauthorized for ${path} (HTTP ${response.status})`);
        }
        if (!response.ok) {
            throw new CloudRequestError(`Request to ${path} failed (HTTP ${response.status})`, response.status);
        }
        return this.readBody(response);
    }

    /**
     * Perform an HTTP request with a hard timeout via AbortController.
     *
     * @param path - route relative to the base URL
     * @param init - fetch request options
     */
    private async request(path: string, init: RequestInit): Promise<Response> {
        const url = `${this.baseUrl}${path}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            return await this.fetchImpl(url, { ...init, signal: controller.signal });
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new CloudRequestError(`Request to ${path} timed out after ${this.timeoutMs} ms`);
            }
            throw new CloudRequestError(
                `Request to ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        } finally {
            clearTimeout(timer);
        }
    }

    private async readBody(response: Response): Promise<unknown> {
        const text = await response.text();
        if (!text) {
            return undefined;
        }
        try {
            return JSON.parse(text);
        } catch {
            // Not JSON — return the raw text (e.g. a bare token string).
            return text;
        }
    }
}
