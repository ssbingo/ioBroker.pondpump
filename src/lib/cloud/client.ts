/*
 * CloudClient — talks to the OASE Garden Controller Cloud REST API.
 *
 * Auth (confirmed from captures): Azure AD B2C on the custom domain account.oase.com,
 * tenant oasecustomersprod.onmicrosoft.com, policy B2C_1A_SignUp_SignIn. The mobile app
 * signs in interactively once (authorization code + PKCE) and afterwards uses the
 * `refresh_token` grant to obtain short-lived (1 h) bearer access tokens.
 *
 * This client only implements the headless-friendly refresh_token grant: the user supplies
 * a refresh token (captured once from an app login) and the client exchanges it for access
 * tokens. Azure AD B2C rotates the refresh token on each use (scope `offline_access`), so a
 * new refresh token in the response is surfaced via `onRefreshToken` for persistence.
 *
 * The account password is never used or stored by this adapter.
 *
 * API: GET https://app-oasecloud-prod.azurewebsites.net/User/Inventory (Bearer).
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
    /** Azure AD B2C token endpoint (oauth2/v2.0/token). */
    tokenUrl: string;
    /** OAuth client id (the OASE mobile app's public client id). */
    clientId: string;
    /** OAuth scope string requested for the access token. */
    scope: string;
    /** Refresh token captured from an app login (rotated on use). */
    refreshToken: string;
    /** Per-request timeout in milliseconds. */
    timeoutMs?: number;
    /** Injectable fetch implementation (defaults to global fetch). */
    fetchImpl?: typeof fetch;
    /** Logger (usually adapter.log). */
    log: CloudLogger;
    /** Called with a rotated refresh token so the caller can persist it. */
    onRefreshToken?: (refreshToken: string) => void;
}

export const DEFAULT_BASE_URL = "https://app-oasecloud-prod.azurewebsites.net";
export const INVENTORY_PATH = "/User/Inventory";
export const DEFAULT_TOKEN_URL =
    "https://account.oase.com/tfp/oasecustomersprod.onmicrosoft.com/B2C_1A_SignUp_SignIn/oauth2/v2.0/token";
export const DEFAULT_CLIENT_ID = "8dfe4495-b83f-4e4f-861c-83b6b3cbaa3b";
export const DEFAULT_SCOPE =
    "https://oasecustomersprod.onmicrosoft.com/api/oase.read " +
    "https://oasecustomersprod.onmicrosoft.com/api/oase.readwrite offline_access openid profile";
export const DEFAULT_TIMEOUT_MS = 15000;
/** Refresh the access token this many ms before it actually expires. */
const TOKEN_EXPIRY_SKEW_MS = 60_000;

/** Thrown when authentication is not possible (missing/expired refresh token or bad config). */
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

/** Candidate keys that may hold the bearer token in a token response. */
const TOKEN_KEYS = ["access_token", "token", "accessToken", "id_token"];

/**
 * Try to extract a bearer access token from a parsed token response body.
 *
 * @param body - parsed JSON (or raw string) body of the token response
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
    return undefined;
}

/** Session-holding client for the OASE cloud API (B2C refresh-token auth + inventory polling). */
export class CloudClient {
    private readonly baseUrl: string;
    private readonly tokenUrl: string;
    private readonly clientId: string;
    private readonly scope: string;
    private readonly timeoutMs: number;
    private readonly fetchImpl: typeof fetch;
    private readonly log: CloudLogger;
    private readonly onRefreshToken?: (refreshToken: string) => void;

    private refreshToken: string;
    private accessToken: string | undefined;
    private accessTokenExpiry = 0;

    /**
     * @param options - endpoints, credentials (refresh token) and logger
     */
    public constructor(options: CloudClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.tokenUrl = options.tokenUrl;
        this.clientId = options.clientId;
        this.scope = options.scope;
        this.refreshToken = options.refreshToken.trim();
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
        this.log = options.log;
        this.onRefreshToken = options.onRefreshToken;
    }

    /** Whether a currently-valid access token is held. */
    public isConnected(): boolean {
        return this.accessToken !== undefined && Date.now() < this.accessTokenExpiry;
    }

    /** Drop the current access token (keeps the refresh token). */
    public reset(): void {
        this.accessToken = undefined;
        this.accessTokenExpiry = 0;
    }

    /** Acquire an access token up front (validates the refresh token). */
    public async connect(): Promise<void> {
        await this.ensureAccessToken(true);
    }

    /**
     * Fetch and return the raw inventory JSON. Refreshes the access token as needed and
     * re-authenticates once on a 401.
     *
     * @returns the parsed JSON body of `GET /User/Inventory`
     */
    public async fetchInventory(): Promise<unknown> {
        await this.ensureAccessToken();
        try {
            return await this.getJson(INVENTORY_PATH);
        } catch (error) {
            if (error instanceof CloudAuthError) {
                this.log.debug("[cloud/auth] inventory request unauthorized, refreshing the access token once");
                await this.ensureAccessToken(true);
                return await this.getJson(INVENTORY_PATH);
            }
            throw error;
        }
    }

    /**
     * Ensure a valid access token is available, refreshing it if missing/expired or forced.
     *
     * @param force - refresh even if the current token still looks valid
     */
    private async ensureAccessToken(force = false): Promise<void> {
        if (!force && this.accessToken && Date.now() < this.accessTokenExpiry - TOKEN_EXPIRY_SKEW_MS) {
            return;
        }
        await this.refreshAccessToken();
    }

    /** Exchange the refresh token for a new access token (B2C refresh_token grant). */
    private async refreshAccessToken(): Promise<void> {
        if (!this.refreshToken) {
            throw new CloudAuthError(
                "No cloud refresh token configured. Capture a refresh token from an OASE app login and enter it " +
                    "in the adapter settings.",
            );
        }

        this.log.debug(
            `[cloud/auth] refreshing access token (grant=refresh_token, client_id=${this.clientId}, ` +
                `refresh_token len=${this.refreshToken.length})`,
        );

        const body = new URLSearchParams({
            grant_type: "refresh_token",
            client_id: this.clientId,
            scope: this.scope,
            refresh_token: this.refreshToken,
            client_info: "1",
        });

        const response = await this.request(this.tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: body.toString(),
        });

        const parsed = await this.readBody(response);
        if (!response.ok) {
            const errorCode = isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : "";
            const description =
                isRecord(parsed) && typeof parsed.error_description === "string" ? parsed.error_description : "";
            this.log.debug(
                `[cloud/auth] token endpoint rejected the request: HTTP ${response.status}` +
                    `${errorCode ? ` error=${errorCode}` : ""}${description ? ` desc=${description}` : ""}`,
            );
            if (response.status === 400 || response.status === 401 || errorCode === "invalid_grant") {
                const suffix = errorCode ? `, ${errorCode}` : "";
                const details = description ? ` Details: ${description}` : "";
                throw new CloudAuthError(
                    `Cloud token refresh rejected (HTTP ${response.status}${suffix}). The refresh token is likely expired — capture a new one from an app login.${details}`,
                );
            }
            throw new CloudRequestError(`Cloud token refresh failed (HTTP ${response.status})`, response.status);
        }

        const accessToken = extractToken(parsed);
        if (!accessToken) {
            this.log.debug(
                `[cloud/auth] token response had no access_token; keys=${isRecord(parsed) ? Object.keys(parsed).join(",") : typeof parsed}`,
            );
            throw new CloudAuthError("Token refresh succeeded but no access token was found in the response");
        }
        this.accessToken = accessToken;

        const expiresInS = isRecord(parsed) ? Number(parsed.expires_in) : NaN;
        this.accessTokenExpiry = Date.now() + (Number.isFinite(expiresInS) ? expiresInS : 3600) * 1000;

        // Persist the rotated refresh token (B2C issues a new one on each use).
        const newRefreshToken =
            isRecord(parsed) && typeof parsed.refresh_token === "string" ? parsed.refresh_token : "";
        if (newRefreshToken && newRefreshToken !== this.refreshToken) {
            this.refreshToken = newRefreshToken;
            this.log.debug(`[cloud/auth] refresh token rotated (new len=${newRefreshToken.length})`);
            this.onRefreshToken?.(newRefreshToken);
        }

        this.log.debug(
            `[cloud/auth] access token acquired, valid ${Math.round((this.accessTokenExpiry - Date.now()) / 1000)}s`,
        );
    }

    /**
     * Send a local ONet packet to the gateway via the cloud tunnel
     * (`POST /Gateway/{gatewayId}/SendONetPacket`). Re-authenticates once on a 401.
     *
     * @param gatewayId - the gateway's cloud UUID
     * @param dataB64 - the base64-encoded ONet packet
     */
    public async sendPacket(gatewayId: string, dataB64: string): Promise<void> {
        await this.ensureAccessToken();
        try {
            await this.postSendPacket(gatewayId, dataB64);
        } catch (error) {
            if (error instanceof CloudAuthError) {
                this.log.debug("[cloud/auth] SendONetPacket unauthorized, refreshing the access token once");
                await this.ensureAccessToken(true);
                await this.postSendPacket(gatewayId, dataB64);
                return;
            }
            throw error;
        }
    }

    private async postSendPacket(gatewayId: string, dataB64: string): Promise<void> {
        const path = `/Gateway/${gatewayId}/SendONetPacket`;
        const response = await this.request(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "*/*",
                "api-version": "4.2",
                Authorization: `Bearer ${this.accessToken}`,
            },
            body: JSON.stringify({ Data: dataB64 }),
        });
        if (response.status === 401 || response.status === 403) {
            throw new CloudAuthError(`Unauthorized for ${path} (HTTP ${response.status})`);
        }
        if (!response.ok) {
            throw new CloudRequestError(`SendONetPacket failed (HTTP ${response.status})`, response.status);
        }
    }

    private async getJson(path: string): Promise<unknown> {
        const response = await this.request(`${this.baseUrl}${path}`, {
            method: "GET",
            headers: { Accept: "application/json", Authorization: `Bearer ${this.accessToken}` },
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
     * Logs method, URL (without query string) status and timing; never the body/headers.
     *
     * @param url - absolute request URL
     * @param init - fetch request options
     */
    private async request(url: string, init: RequestInit): Promise<Response> {
        const method = init.method ?? "GET";
        const logUrl = url.split("?")[0];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const startedAt = Date.now();
        try {
            const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
            this.log.debug(
                `[cloud/http] ${method} ${logUrl} -> HTTP ${response.status} (${Date.now() - startedAt} ms)`,
            );
            return response;
        } catch (error) {
            const elapsed = Date.now() - startedAt;
            if (error instanceof Error && error.name === "AbortError") {
                this.log.warn(`[cloud/http] ${method} ${logUrl} timed out after ${this.timeoutMs} ms`);
                throw new CloudRequestError(`Request to ${logUrl} timed out after ${this.timeoutMs} ms`);
            }
            this.log.warn(
                `[cloud/http] ${method} ${logUrl} failed after ${elapsed} ms: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw new CloudRequestError(
                `Request to ${logUrl} failed: ${error instanceof Error ? error.message : String(error)}`,
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
            return text;
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
