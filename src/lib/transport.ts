/*
 * Transport abstraction shared by the cloud and local connection paths.
 *
 * The OASE ONet application protocol (packet framing, command/telemetry packet types) is identical
 * whether the packets travel through the cloud `SendONetPacket` tunnel or directly over the local
 * TLS stream. Only the transport differs, so both paths expose the same `sendOnet` primitive: send a
 * framed ONet packet (base64) and get the reply packet (base64) back.
 */

/** Minimal logger shape (compatible with `adapter.log`). */
export interface TransportLogger {
    /** Log a debug message. */
    debug(message: string): void;
    /** Log an info message. */
    info(message: string): void;
    /** Log a warning. */
    warn(message: string): void;
    /** Log an error. */
    error(message: string): void;
}

/** A channel that can exchange raw ONet packets with the controller. */
export interface OnetTransport {
    /**
     * Send a framed ONet packet and return the reply packet, both base64-encoded.
     *
     * @param dataB64 - the request packet (base64), as built by the `onet` builders
     * @returns the reply packet (base64), or undefined if no reply was received
     */
    sendOnet(dataB64: string): Promise<string | undefined>;
}
