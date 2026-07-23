// This file extends the AdapterConfig type from "@iobroker/types"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            /** Which transport to use: cloud, local or both (local preferred) */
            connectionMode: "cloud" | "local" | "both";
            /** IP address of the OASE Garden Controller Cloud gateway (local mode) */
            ip: string;
            /** Bind address of the local TLS server (ioBroker host) */
            bind: string;
            /** Port of the local TLS server the controller connects back to */
            port: number;
            /** 64-byte device password for local authentication (encrypted) */
            devicePassword: string;
            /** OASE cloud refresh token, captured once from an app login (encrypted) */
            cloudRefreshToken: string;
            /** Cloud API base URL (advanced; default is the known OASE endpoint) */
            cloudBaseUrl: string;
            /** Azure AD B2C token endpoint (advanced; default is the known OASE endpoint) */
            cloudTokenUrl: string;
            /** OAuth client id of the OASE app (advanced; public value) */
            cloudClientId: string;
            /** OAuth scope requested for the access token (advanced) */
            cloudScope: string;
            /** Poll interval in seconds */
            pollInterval: number;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
