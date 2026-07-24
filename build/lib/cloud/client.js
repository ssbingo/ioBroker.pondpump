"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var client_exports = {};
__export(client_exports, {
  CloudAuthError: () => CloudAuthError,
  CloudClient: () => CloudClient,
  CloudRequestError: () => CloudRequestError,
  DEFAULT_BASE_URL: () => DEFAULT_BASE_URL,
  DEFAULT_CLIENT_ID: () => DEFAULT_CLIENT_ID,
  DEFAULT_SCOPE: () => DEFAULT_SCOPE,
  DEFAULT_TIMEOUT_MS: () => DEFAULT_TIMEOUT_MS,
  DEFAULT_TOKEN_URL: () => DEFAULT_TOKEN_URL,
  INVENTORY_PATH: () => INVENTORY_PATH,
  extractToken: () => extractToken
});
module.exports = __toCommonJS(client_exports);
const DEFAULT_BASE_URL = "https://app-oasecloud-prod.azurewebsites.net";
const INVENTORY_PATH = "/User/Inventory";
const DEFAULT_TOKEN_URL = "https://account.oase.com/tfp/oasecustomersprod.onmicrosoft.com/B2C_1A_SignUp_SignIn/oauth2/v2.0/token";
const DEFAULT_CLIENT_ID = "8dfe4495-b83f-4e4f-861c-83b6b3cbaa3b";
const DEFAULT_SCOPE = "https://oasecustomersprod.onmicrosoft.com/api/oase.read https://oasecustomersprod.onmicrosoft.com/api/oase.readwrite offline_access openid profile";
const DEFAULT_TIMEOUT_MS = 15e3;
const TOKEN_EXPIRY_SKEW_MS = 6e4;
class CloudAuthError extends Error {
  /**
   * @param message - human-readable error description
   */
  constructor(message) {
    super(message);
    this.name = "CloudAuthError";
  }
}
class CloudRequestError extends Error {
  /**
   * @param message - human-readable error description
   * @param status - HTTP status code, if the server responded
   */
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "CloudRequestError";
  }
}
const TOKEN_KEYS = ["access_token", "token", "accessToken", "id_token"];
function extractToken(body) {
  if (typeof body === "string" && body.length > 0) {
    return body;
  }
  if (typeof body !== "object" || body === null) {
    return void 0;
  }
  const record = body;
  for (const key of TOKEN_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return void 0;
}
class CloudClient {
  baseUrl;
  tokenUrl;
  clientId;
  scope;
  timeoutMs;
  fetchImpl;
  log;
  timers;
  onRefreshToken;
  refreshToken;
  accessToken;
  accessTokenExpiry = 0;
  /**
   * @param options - endpoints, credentials (refresh token) and logger
   */
  constructor(options) {
    var _a, _b;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.tokenUrl = options.tokenUrl;
    this.clientId = options.clientId;
    this.scope = options.scope;
    this.refreshToken = options.refreshToken.trim();
    this.timeoutMs = (_a = options.timeoutMs) != null ? _a : DEFAULT_TIMEOUT_MS;
    this.fetchImpl = (_b = options.fetchImpl) != null ? _b : globalThis.fetch;
    this.log = options.log;
    this.timers = options.timers;
    this.onRefreshToken = options.onRefreshToken;
  }
  /** Whether a currently-valid access token is held. */
  isConnected() {
    return this.accessToken !== void 0 && Date.now() < this.accessTokenExpiry;
  }
  /** Drop the current access token (keeps the refresh token). */
  reset() {
    this.accessToken = void 0;
    this.accessTokenExpiry = 0;
  }
  /** Acquire an access token up front (validates the refresh token). */
  async connect() {
    await this.ensureAccessToken(true);
  }
  /**
   * Fetch and return the raw inventory JSON. Refreshes the access token as needed and
   * re-authenticates once on a 401.
   *
   * @returns the parsed JSON body of `GET /User/Inventory`
   */
  async fetchInventory() {
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
  async ensureAccessToken(force = false) {
    if (!force && this.accessToken && Date.now() < this.accessTokenExpiry - TOKEN_EXPIRY_SKEW_MS) {
      return;
    }
    await this.refreshAccessToken();
  }
  /** Exchange the refresh token for a new access token (B2C refresh_token grant). */
  async refreshAccessToken() {
    var _a;
    if (!this.refreshToken) {
      throw new CloudAuthError(
        "No cloud refresh token configured. Capture a refresh token from an OASE app login and enter it in the adapter settings."
      );
    }
    this.log.debug(
      `[cloud/auth] refreshing access token (grant=refresh_token, client_id=${this.clientId}, refresh_token len=${this.refreshToken.length})`
    );
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.clientId,
      scope: this.scope,
      refresh_token: this.refreshToken,
      client_info: "1"
    });
    const response = await this.request(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString()
    });
    const parsed = await this.readBody(response);
    if (!response.ok) {
      const errorCode = isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : "";
      const description = isRecord(parsed) && typeof parsed.error_description === "string" ? parsed.error_description : "";
      this.log.debug(
        `[cloud/auth] token endpoint rejected the request: HTTP ${response.status}${errorCode ? ` error=${errorCode}` : ""}${description ? ` desc=${description}` : ""}`
      );
      if (response.status === 400 || response.status === 401 || errorCode === "invalid_grant") {
        const suffix = errorCode ? `, ${errorCode}` : "";
        const details = description ? ` Details: ${description}` : "";
        throw new CloudAuthError(
          `Cloud token refresh rejected (HTTP ${response.status}${suffix}). The refresh token is likely expired \u2014 capture a new one from an app login.${details}`
        );
      }
      throw new CloudRequestError(`Cloud token refresh failed (HTTP ${response.status})`, response.status);
    }
    const accessToken = extractToken(parsed);
    if (!accessToken) {
      this.log.debug(
        `[cloud/auth] token response had no access_token; keys=${isRecord(parsed) ? Object.keys(parsed).join(",") : typeof parsed}`
      );
      throw new CloudAuthError("Token refresh succeeded but no access token was found in the response");
    }
    this.accessToken = accessToken;
    const expiresInS = isRecord(parsed) ? Number(parsed.expires_in) : NaN;
    this.accessTokenExpiry = Date.now() + (Number.isFinite(expiresInS) ? expiresInS : 3600) * 1e3;
    const newRefreshToken = isRecord(parsed) && typeof parsed.refresh_token === "string" ? parsed.refresh_token : "";
    if (newRefreshToken && newRefreshToken !== this.refreshToken) {
      this.refreshToken = newRefreshToken;
      this.log.debug(`[cloud/auth] refresh token rotated (new len=${newRefreshToken.length})`);
      (_a = this.onRefreshToken) == null ? void 0 : _a.call(this, newRefreshToken);
    }
    this.log.debug(
      `[cloud/auth] access token acquired, valid ${Math.round((this.accessTokenExpiry - Date.now()) / 1e3)}s`
    );
  }
  /**
   * Send a local ONet packet to the gateway via the cloud tunnel
   * (`POST /Gateway/{gatewayId}/SendONetPacket`). Re-authenticates once on a 401.
   *
   * @param gatewayId - the gateway's cloud UUID
   * @param dataB64 - the base64-encoded ONet packet
   */
  async sendPacket(gatewayId, dataB64) {
    await this.ensureAccessToken();
    try {
      return await this.postSendPacket(gatewayId, dataB64);
    } catch (error) {
      if (error instanceof CloudAuthError) {
        this.log.debug("[cloud/auth] SendONetPacket unauthorized, refreshing the access token once");
        await this.ensureAccessToken(true);
        return await this.postSendPacket(gatewayId, dataB64);
      }
      throw error;
    }
  }
  async postSendPacket(gatewayId, dataB64) {
    const path = `/Gateway/${gatewayId}/SendONetPacket`;
    const response = await this.request(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        "api-version": "4.2",
        Authorization: `Bearer ${this.accessToken}`
      },
      body: JSON.stringify({ Data: dataB64 })
    });
    if (response.status === 401 || response.status === 403) {
      throw new CloudAuthError(`Unauthorized for ${path} (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new CloudRequestError(`SendONetPacket failed (HTTP ${response.status})`, response.status);
    }
    return this.readBody(response);
  }
  async getJson(path) {
    const response = await this.request(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${this.accessToken}` }
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
  async request(url, init) {
    var _a;
    const method = (_a = init.method) != null ? _a : "GET";
    const logUrl = url.split("?")[0];
    const controller = new AbortController();
    const timer = this.timers.setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
      this.log.debug(
        `[cloud/http] ${method} ${logUrl} -> HTTP ${response.status} (${Date.now() - startedAt} ms)`
      );
      return response;
    } catch (error) {
      const elapsed = Date.now() - startedAt;
      if (error instanceof Error && error.name === "AbortError") {
        this.log.warn(`[cloud/http] ${method} ${logUrl} timed out after ${this.timeoutMs} ms`);
        throw new CloudRequestError(`Request to ${logUrl} timed out after ${this.timeoutMs} ms`);
      }
      this.log.warn(
        `[cloud/http] ${method} ${logUrl} failed after ${elapsed} ms: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new CloudRequestError(
        `Request to ${logUrl} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.timers.clearTimeout(timer);
    }
  }
  async readBody(response) {
    const text = await response.text();
    if (!text) {
      return void 0;
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CloudAuthError,
  CloudClient,
  CloudRequestError,
  DEFAULT_BASE_URL,
  DEFAULT_CLIENT_ID,
  DEFAULT_SCOPE,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TOKEN_URL,
  INVENTORY_PATH,
  extractToken
});
//# sourceMappingURL=client.js.map
