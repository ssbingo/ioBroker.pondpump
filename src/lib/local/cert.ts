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
    // The controller rejects certificates whose validity window does not contain its own clock
    // (TLS alert 45, certificate_expired — also raised for "not yet valid" by many embedded stacks).
    // A very wide, fixed window makes the certificate valid whatever the controller's clock says.
    const notBeforeDate = new Date("2000-01-01T00:00:00Z");
    const notAfterDate = new Date("2099-12-31T23:59:59Z");
    const pems = await generate([{ name: "commonName", value: commonName }], {
        keySize: 2048,
        algorithm: "sha256",
        notBeforeDate,
        notAfterDate,
    });
    return { cert: pems.cert, key: pems.private };
}
