/*
 * ioBroker object model + state mapping for the OASE pond setup.
 *
 * The object builders are pure functions returning `{ id, obj }` definitions so the state
 * roles and read/write flags can be unit-tested without a running adapter. `ensure*Objects`
 * creates/updates the objects via `extendObjectAsync` (merges `common` across versions while
 * preserving user custom settings; never plain `setObject`) and should be called once per
 * session; `write*States` writes confirmed values with `ack: true` on every poll.
 *
 * Control states (on/speed/speedRaw) are writable (Phase 2); commands are handled in main.ts.
 */

import { dimmerToPercent, type GatewayInfo, type PumpInfo } from "./cloud/inventory";

/** Subset of the adapter API needed to create objects and write states. */
export interface ObjectWriter {
    /**
     * Create/update an object, merging `common` (roles, write flag) across adapter versions
     * while preserving user custom settings (history etc.). Called once per object per session.
     */
    extendObjectAsync(id: string, obj: ioBroker.SettableObject): Promise<unknown>;
    /** Write a state value. */
    setStateAsync(id: string, val: ioBroker.StateValue, ack: boolean): Promise<unknown>;
}

/** An ioBroker object definition ready to be created. */
export interface ObjectDef {
    /** Object id relative to the adapter namespace. */
    id: string;
    /** The object (device/channel/folder/state) to create. */
    obj: ioBroker.SettableObject;
}

/** A state value ready to be written. */
export interface StateValueDef {
    /** State id relative to the adapter namespace. */
    id: string;
    /** The value to write (with ack:true). */
    val: ioBroker.StateValue;
}

export const GATEWAY_ID = "gateway";
export const PUMPS_ROOT_ID = "pumps";

function device(name: string): ioBroker.SettableObject {
    return { type: "device", common: { name }, native: {} };
}

function folder(name: string): ioBroker.SettableObject {
    return { type: "folder", common: { name }, native: {} };
}

function channel(name: string): ioBroker.SettableObject {
    return { type: "channel", common: { name }, native: {} };
}

function stateObj(common: ioBroker.StateCommon): ioBroker.SettableObject {
    return { type: "state", common, native: {} };
}

/**
 * Build the gateway device and its read-only info states.
 *
 * @param gw - gateway metadata from the inventory
 */
export function gatewayObjectDefs(gw: GatewayInfo): ObjectDef[] {
    return [
        { id: GATEWAY_ID, obj: device(gw.name || "Gateway") },
        {
            id: `${GATEWAY_ID}.serialNumber`,
            obj: stateObj({ name: "Serial number", type: "string", role: "text", read: true, write: false }),
        },
        {
            id: `${GATEWAY_ID}.name`,
            obj: stateObj({ name: "Name", type: "string", role: "info.name", read: true, write: false }),
        },
        {
            id: `${GATEWAY_ID}.firmware`,
            obj: stateObj({ name: "Firmware", type: "string", role: "text", read: true, write: false }),
        },
        {
            id: `${GATEWAY_ID}.pondName`,
            obj: stateObj({ name: "Pond name", type: "string", role: "text", read: true, write: false }),
        },
        {
            id: `${GATEWAY_ID}.online`,
            obj: stateObj({
                name: "Gateway reachable",
                type: "boolean",
                role: "indicator.reachable",
                read: true,
                write: false,
                def: false,
            }),
        },
    ];
}

function pumpId(deviceNumber: number): string {
    return `${PUMPS_ROOT_ID}.${deviceNumber}`;
}

/**
 * Build a pump device with its control and status channels/states.
 *
 * @param pump - pump info from the inventory
 */
export function pumpObjectDefs(pump: PumpInfo): ObjectDef[] {
    const base = pumpId(pump.deviceNumber);
    return [
        { id: PUMPS_ROOT_ID, obj: folder("Pumps") },
        { id: base, obj: device(pump.name ? `${pump.name} (${pump.deviceNumber})` : `Pump ${pump.deviceNumber}`) },

        { id: `${base}.control`, obj: channel("Control") },
        {
            id: `${base}.control.on`,
            obj: stateObj({
                name: "Pump on",
                type: "boolean",
                role: "switch.power",
                read: true,
                write: true,
                def: false,
            }),
        },
        {
            id: `${base}.control.speed`,
            obj: stateObj({
                name: "Speed",
                type: "number",
                role: "level.dimmer",
                unit: "%",
                min: 0,
                max: 100,
                read: true,
                write: true,
            }),
        },
        {
            id: `${base}.control.speedRaw`,
            obj: stateObj({
                name: "Speed (raw 0-255)",
                type: "number",
                role: "level",
                min: 0,
                max: 255,
                read: true,
                write: true,
            }),
        },

        { id: `${base}.status`, obj: channel("Status") },
        {
            id: `${base}.status.fcStatus`,
            obj: stateObj({ name: "FC status", type: "string", role: "text", read: true, write: false }),
        },
        {
            id: `${base}.status.fcMode`,
            obj: stateObj({ name: "FC mode", type: "number", role: "value", read: true, write: false }),
        },
        {
            id: `${base}.status.connected`,
            obj: stateObj({
                name: "Pump connected",
                type: "boolean",
                role: "indicator.connected",
                read: true,
                write: false,
                def: false,
            }),
        },
    ];
}

/**
 * Map gateway metadata + reachability to concrete state values.
 *
 * @param gw - gateway metadata from the inventory
 * @param online - whether the gateway is currently reachable
 */
export function gatewayStateValues(gw: GatewayInfo, online: boolean): StateValueDef[] {
    return [
        { id: `${GATEWAY_ID}.serialNumber`, val: gw.serialNumber },
        { id: `${GATEWAY_ID}.name`, val: gw.name },
        { id: `${GATEWAY_ID}.firmware`, val: gw.firmware ?? "" },
        { id: `${GATEWAY_ID}.pondName`, val: gw.pondName ?? "" },
        { id: `${GATEWAY_ID}.online`, val: online },
    ];
}

/**
 * Map a pump's reported state to concrete state values.
 *
 * @param pump - pump info from the inventory
 */
export function pumpStateValues(pump: PumpInfo): StateValueDef[] {
    const base = pumpId(pump.deviceNumber);
    return [
        { id: `${base}.control.on`, val: pump.dmx.deviceOn },
        { id: `${base}.control.speed`, val: dimmerToPercent(pump.dmx.dimmerValue) },
        { id: `${base}.control.speedRaw`, val: pump.dmx.dimmerValue },
        { id: `${base}.status.fcStatus`, val: pump.dmx.fcStatus },
        { id: `${base}.status.fcMode`, val: pump.dmx.fcMode },
        { id: `${base}.status.connected`, val: pump.isConnected },
    ];
}

async function ensureObjects(writer: ObjectWriter, defs: ObjectDef[]): Promise<void> {
    for (const def of defs) {
        await writer.extendObjectAsync(def.id, def.obj);
    }
}

async function writeValues(writer: ObjectWriter, values: StateValueDef[]): Promise<void> {
    for (const value of values) {
        await writer.setStateAsync(value.id, value.val, true);
    }
}

/**
 * Create/update the gateway objects. Call once per session (not every poll).
 *
 * @param writer - adapter (or mock) used to create objects
 * @param gw - gateway metadata from the inventory
 */
export async function ensureGatewayObjects(writer: ObjectWriter, gw: GatewayInfo): Promise<void> {
    await ensureObjects(writer, gatewayObjectDefs(gw));
}

/**
 * Write the current gateway state values with ack:true.
 *
 * @param writer - adapter (or mock) used to write states
 * @param gw - gateway metadata from the inventory
 * @param online - whether the gateway is currently reachable
 */
export async function writeGatewayStates(writer: ObjectWriter, gw: GatewayInfo, online: boolean): Promise<void> {
    await writeValues(writer, gatewayStateValues(gw, online));
}

/**
 * Create/update a pump's objects. Call once per pump per session (not every poll).
 *
 * @param writer - adapter (or mock) used to create objects
 * @param pump - pump info from the inventory
 */
export async function ensurePumpObjects(writer: ObjectWriter, pump: PumpInfo): Promise<void> {
    await ensureObjects(writer, pumpObjectDefs(pump));
}

/**
 * Write a pump's current state values with ack:true.
 *
 * @param writer - adapter (or mock) used to write states
 * @param pump - pump info from the inventory
 */
export async function writePumpStates(writer: ObjectWriter, pump: PumpInfo): Promise<void> {
    await writeValues(writer, pumpStateValues(pump));
}
