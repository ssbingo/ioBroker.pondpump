/*
 * Self-signed TLS certificate for the local server.
 *
 * The controller connects back to us as a TLS *client*; we are the TLS *server* and must present a
 * certificate. The OASE ecosystem uses a self-signed certificate with CN `com.oase.easycontrol`.
 * The controller is not expected to validate it, but we match the common name to stay faithful to
 * the original protocol. A fresh certificate is generated in memory on each start.
 */

import { generate } from "selfsigned";

/** Common name used by the OASE TLS certificates. */
export const OASE_CERT_CN = "com.oase.easycontrol";

/** A PEM certificate/key pair for a TLS server. */
export interface TlsCredentials {
    /** Certificate in PEM format. */
    cert: string;
    /** Private key in PEM format. */
    key: string;
}

/**
 * Generate a self-signed certificate/key pair for the local TLS server.
 *
 * @param commonName - certificate common name (defaults to the OASE CN)
 */
export async function generateSelfSignedCert(commonName: string = OASE_CERT_CN): Promise<TlsCredentials> {
    const notBeforeDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday, to avoid clock skew
    const notAfterDate = new Date(notBeforeDate.getTime() + 10 * 365 * 24 * 60 * 60 * 1000); // ~10 years
    const pems = await generate([{ name: "commonName", value: commonName }], {
        keySize: 2048,
        algorithm: "sha256",
        notBeforeDate,
        notAfterDate,
    });
    return { cert: pems.cert, key: pems.private };
}
