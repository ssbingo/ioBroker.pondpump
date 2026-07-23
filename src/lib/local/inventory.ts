/*
 * Build the device inventory over the local transport. Where the cloud path reads a JSON inventory
 * from `/User/Inventory`, the local path derives the same information from ONet packets:
 *   - a discovery request (0x1000) → the gateway/controller identity, and
 *   - DeviceTable requests (0x4000), one per slot → the pump entries (name, control address, …).
 */

import { parseFrameHeader } from "../cloud/onet";
import type { OnetTransport } from "../transport";
import {
    buildDeviceTableRequest,
    buildDiscovery,
    type DeviceTableEntry,
    type GatewayDiscovery,
    parseDeviceTableEntry,
    parseGatewayDiscovery,
} from "./protocol";

/** The inventory as read over the local channel. */
export interface LocalInventory {
    /** The controller/gateway identity (undefined if discovery failed). */
    gateway?: GatewayDiscovery;
    /** The device (pump) entries from the DeviceTable. */
    devices: DeviceTableEntry[];
}

/** Send a framed ONet request and return the reply payload (bytes after the 16-byte header). */
async function requestPayload(transport: OnetTransport, frame: Buffer): Promise<Buffer | undefined> {
    const replyB64 = await transport.sendOnet(frame.toString("base64"));
    if (!replyB64) {
        return undefined;
    }
    const raw = Buffer.from(replyB64, "base64");
    const header = parseFrameHeader(raw);
    if (!header) {
        return undefined;
    }
    return raw.subarray(16);
}

/**
 * Read the gateway identity and all device entries over the local transport.
 *
 * @param transport - the authenticated local transport
 * @param nextTxn - supplies the next ONet transaction number
 * @param maxDevices - safety cap on the number of DeviceTable slots to probe (default 16)
 */
export async function fetchLocalInventory(
    transport: OnetTransport,
    nextTxn: () => number,
    maxDevices = 16,
): Promise<LocalInventory> {
    let gateway: GatewayDiscovery | undefined;
    const discovery = await requestPayload(transport, buildDiscovery(nextTxn()));
    if (discovery) {
        gateway = parseGatewayDiscovery(discovery);
    }

    const devices: DeviceTableEntry[] = [];
    for (let index = 0; index < maxDevices; index++) {
        const payload = await requestPayload(transport, buildDeviceTableRequest(index, nextTxn()));
        const entry = payload ? parseDeviceTableEntry(payload) : undefined;
        if (!entry) {
            break; // empty slot — no more devices
        }
        devices.push(entry);
    }

    return { gateway, devices };
}
