/*
 * Inventory domain types + defensive parser.
 *
 * The OASE Garden Controller Cloud returns an "inventory" describing the gateway
 * (EGC Controller Cloud) and the attached devices (pumps). This module converts the
 * raw JSON of `GET /User/Inventory` into a small, strongly typed domain model that the
 * rest of the adapter works with.
 *
 * The exact raw wire format is only partially known (reconstructed from a cloud capture),
 * so the parser is intentionally tolerant: it accepts both camelCase and PascalCase keys
 * and reads gateway metadata either from flattened fields or from an `attributes` array
 * of `{ Id, Value }` entries (Id 102 = firmware, Id 103 = pond name).
 */

/** Raw RDM/DMX telemetry entry — semantics decoded later (project work package RE-2). */
export interface RawRdmEntry {
    /** RDM parameter id, e.g. 513, 32824. */
    parameterId: number;
    /** Sensor index for multi-sensor parameters (parameterId 513). */
    sensorId?: number;
    /** base64-encoded raw value */
    valueB64: string;
}

/** Pump speed/status as reported by the controller. */
export interface DmxPumpState {
    /** Frequency-converter status, e.g. "SfcOff". */
    fcStatus: string;
    /** Frequency-converter mode. */
    fcMode: number;
    /** Speed setpoint, raw scale 0..255. */
    dimmerValue: number;
    /** Whether the pump is switched on. */
    deviceOn: boolean;
    /** ISO timestamp of the reading, if provided. */
    timestamp?: string;
}

/** A pump device (deviceType "GardenPump") from the inventory. */
export interface PumpInfo {
    /** Unique device number, used as the ioBroker object id. */
    deviceNumber: number;
    /** Zero-based position in the inventory device list (used for on/off commands). */
    index: number;
    /** User-assigned pump name from the controller (from the DeviceTable telemetry), if known. */
    name?: string;
    /** OASE article number, e.g. 73656. */
    articleNumber?: number;
    /** Device type string, e.g. "GardenPump". */
    deviceType: string;
    /** Whether the controller currently sees the pump. */
    isConnected: boolean;
    /** Control address (RDM address) used for set-dimmer commands, e.g. 0x21. */
    controlAddress?: number;
    /** Current speed/on-off state. */
    dmx: DmxPumpState;
    /** Decoded RDM sensor present values by sensorId (parameter 513). */
    sensors: Record<number, number>;
    /** Raw RDM telemetry, kept for later decoding. */
    rdm: RawRdmEntry[];
}

/** RDM parameter id carrying sensor values (RDM SENSOR_VALUE). */
const RDM_SENSOR_VALUE_PARAM = 513;
/**
 * RDM sensor ids mapped to physical quantities. Sensors 1 (rpm) and 10 (power) were calibrated
 * against the OASE app; 3/5 (temperature) and 6 (voltage) were identified from a speed sweep
 * (they stay constant while rpm/power scale) and their physical magnitude (~29 °C, ~220 V).
 */
export const SENSOR_SPEED_RPM = 1;
export const SENSOR_TEMPERATURE_C = 3;
export const SENSOR_TEMPERATURE2_C = 5;
export const SENSOR_VOLTAGE_V = 6;
export const SENSOR_POWER_W = 10;

/** The EGC gateway (controller) from the inventory. */
export interface GatewayInfo {
    /** Cloud UUID of the gateway. */
    id?: string;
    /** Gateway serial number. */
    serialNumber: string;
    /** OASE article number, e.g. 55317. */
    articleNumber?: number;
    /** Gateway type string, e.g. "GatewayCloud". */
    gatewayType?: string;
    /** Human-readable name (pond name, else a sensible default). */
    name: string;
    /** Firmware version (attribute id 102). */
    firmware?: string;
    /** User-assigned pond name (attribute id 103). */
    pondName?: string;
    /** Whether the gateway is reported online in the cloud. */
    isOnline?: boolean;
}

/** Parsed result of `GET /User/Inventory`. */
export interface Inventory {
    /** The EGC gateway. */
    gateway: GatewayInfo;
    /** All GardenPump devices attached to the gateway. */
    pumps: PumpInfo[];
}

/** OASE attribute ids seen in the cloud capture. */
const ATTR_FIRMWARE = 102;
const ATTR_POND_NAME = 103;

/** RDM parameter id whose payload carries the pump's control address, and the byte offset of it. */
const CONTROL_ADDRESS_PARAM = 96;
const CONTROL_ADDRESS_OFFSET = 15;

/**
 * Extract the printable device name from a DeviceTable reply (null-padded ASCII after a header).
 *
 * @param replyB64 - base64 of the DeviceTable reply packet
 */
function extractDeviceName(replyB64: string): string | undefined {
    try {
        const bytes = Buffer.from(replyB64, "base64");
        // The name is the longest run of printable ASCII after the packet header.
        let best = "";
        let current = "";
        for (let i = 8; i < bytes.length; i++) {
            const c = bytes[i];
            if (c >= 0x20 && c <= 0x7e) {
                current += String.fromCharCode(c);
            } else {
                if (current.length > best.length) {
                    best = current;
                }
                current = "";
            }
        }
        if (current.length > best.length) {
            best = current;
        }
        best = best.trim();
        return best.length >= 2 ? best : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Map each device slot index to its name from the gateway's DeviceTable telemetry.
 *
 * @param incrementStates - the gateway's `incrementStates` array
 */
function parseDeviceNames(incrementStates: unknown): Map<number, string> {
    const map = new Map<number, string>();
    if (!Array.isArray(incrementStates)) {
        return map;
    }
    const deviceTable = incrementStates.find(
        e => isRecord(e) && toStringOrUndefined(pick(e, "key", "Key")) === "DeviceTable",
    );
    if (!isRecord(deviceTable)) {
        return map;
    }
    const value = pick(deviceTable, "value", "Value");
    const data = isRecord(value) ? pick(value, "data", "Data") : undefined;
    if (!Array.isArray(data)) {
        return map;
    }
    for (const entry of data) {
        if (!isRecord(entry)) {
            continue;
        }
        const replyB64 = toStringOrUndefined(pick(entry, "reply", "Reply"));
        if (!replyB64) {
            continue;
        }
        // Slot index = first byte of the request (an empty request means slot 0).
        let index = 0;
        const requestB64 = toStringOrUndefined(pick(entry, "request", "Request"));
        if (requestB64) {
            try {
                const req = Buffer.from(requestB64, "base64");
                if (req.length > 0) {
                    index = req[0];
                }
            } catch {
                // keep default index 0
            }
        }
        const name = extractDeviceName(replyB64);
        if (name) {
            map.set(index, name);
        }
    }
    return map;
}

/**
 * Decode RDM SENSOR_VALUE entries (parameter 513) into present values keyed by sensorId.
 * Each value is `[sensorNumber(1), presentValue(int16 BE), lowest, highest, recorded]`.
 *
 * @param rdm - the pump's RDM telemetry entries
 */
function parseSensorValues(rdm: RawRdmEntry[]): Record<number, number> {
    const sensors: Record<number, number> = {};
    for (const entry of rdm) {
        if (entry.parameterId !== RDM_SENSOR_VALUE_PARAM || entry.sensorId === undefined || !entry.valueB64) {
            continue;
        }
        try {
            const bytes = Buffer.from(entry.valueB64, "base64");
            if (bytes.length >= 3) {
                sensors[entry.sensorId] = bytes.readInt16BE(1);
            }
        } catch {
            // ignore malformed entries
        }
    }
    return sensors;
}

/**
 * Extract a pump's control address (RDM address) from its RDM parameter 96, if present.
 *
 * @param rdm - the pump's RDM telemetry entries
 */
function extractControlAddress(rdm: RawRdmEntry[]): number | undefined {
    const entry = rdm.find(e => e.parameterId === CONTROL_ADDRESS_PARAM);
    if (!entry?.valueB64) {
        return undefined;
    }
    try {
        const bytes = Buffer.from(entry.valueB64, "base64");
        return bytes.length > CONTROL_ADDRESS_OFFSET ? bytes[CONTROL_ADDRESS_OFFSET] : undefined;
    } catch {
        return undefined;
    }
}

/** Device type string identifying a pump in the inventory. */
export const PUMP_DEVICE_TYPE = "GardenPump";

/** Raw dimmer scale maximum (0..255). */
export const DIMMER_MAX = 255;

/**
 * Convert a raw dimmer value (0..255) into a percentage (0..100).
 *
 * @param raw - raw dimmer value on the 0..255 scale
 */
export function dimmerToPercent(raw: number): number {
    const clamped = Math.max(0, Math.min(DIMMER_MAX, raw));
    return Math.round((clamped / DIMMER_MAX) * 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Read a property by trying several candidate keys (case variants).
 *
 * @param obj - object to read from
 * @param keys - candidate property names, first defined one wins
 */
function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null) {
            return obj[key];
        }
    }
    return undefined;
}

function toStringOrUndefined(value: unknown): string | undefined {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return undefined;
}

function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return fallback;
}

function toBoolean(value: unknown): boolean {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return value !== 0;
    }
    if (typeof value === "string") {
        return value.toLowerCase() === "true" || value === "1";
    }
    return false;
}

/**
 * Unwrap an OASE `{ Value, Timestamp }` wrapper to its inner value.
 * Attribute and state values in the real payload are wrapped this way.
 *
 * @param value - a possibly-wrapped value
 */
function unwrapValue(value: unknown): unknown {
    if (isRecord(value) && ("Value" in value || "value" in value) && ("Timestamp" in value || "timestamp" in value)) {
        return pick(value, "Value", "value");
    }
    return value;
}

/**
 * Build a map of OASE custom attributes (id -> value).
 *
 * Accepts either the real `customAttributesJson` string (a JSON array of
 * `{ Id, Value: { Value, Timestamp } }`) or an already-parsed attributes array.
 *
 * @param raw - the `customAttributesJson` string or an attributes array
 */
function parseCustomAttributes(raw: unknown): Map<number, unknown> {
    const map = new Map<number, unknown>();
    let list: unknown = raw;
    if (typeof raw === "string" && raw.trim() !== "") {
        try {
            list = JSON.parse(raw);
        } catch {
            return map;
        }
    }
    if (!Array.isArray(list)) {
        return map;
    }
    for (const entry of list) {
        if (!isRecord(entry)) {
            continue;
        }
        const id = toNumber(pick(entry, "Id", "id"), NaN);
        if (Number.isFinite(id)) {
            map.set(id, unwrapValue(pick(entry, "Value", "value")));
        }
    }
    return map;
}

function parseGateway(raw: unknown): GatewayInfo {
    if (!isRecord(raw)) {
        throw new Error("inventory gateway is missing or not an object");
    }
    const serialNumber = toStringOrUndefined(pick(raw, "serialNumber", "SerialNumber", "sn"));
    if (!serialNumber) {
        throw new Error("inventory gateway has no serial number");
    }
    // Real payload: metadata lives in customAttributesJson; older/curated shapes used
    // an `attributes` array or flattened fields — support all of them.
    const attributes = parseCustomAttributes(pick(raw, "customAttributesJson", "attributes", "Attributes"));
    const firmware =
        toStringOrUndefined(pick(raw, "firmware", "Firmware", "firmwareAttr_Id102")) ??
        toStringOrUndefined(attributes.get(ATTR_FIRMWARE));
    const pondName =
        toStringOrUndefined(pick(raw, "pondName", "PondName", "pondName_Id103")) ??
        toStringOrUndefined(attributes.get(ATTR_POND_NAME));

    const onlineState = pick(raw, "onlineState", "OnlineState");
    const isOnline = toBoolean(
        pick(raw, "isOnline", "IsOnline") ??
            (isRecord(onlineState) ? pick(onlineState, "isOnline", "IsOnline") : undefined),
    );

    const name =
        toStringOrUndefined(pick(raw, "lname", "lName", "LName", "name", "Name")) ?? pondName ?? "EGC Controller Cloud";

    return {
        id: toStringOrUndefined(pick(raw, "id", "Id")),
        serialNumber,
        articleNumber:
            pick(raw, "articleNumber", "ArticleNumber") !== undefined
                ? toNumber(pick(raw, "articleNumber", "ArticleNumber"))
                : undefined,
        gatewayType: toStringOrUndefined(pick(raw, "gatewayType", "GatewayType")),
        name,
        firmware,
        pondName,
        isOnline,
    };
}

function parseDmxPumpState(raw: unknown): DmxPumpState {
    // Real payload wraps the state in `{ value: { ... }, timestamp }`.
    const wrapper = isRecord(raw) ? raw : {};
    const valueField = pick(wrapper, "value", "Value");
    const inner = isRecord(valueField) ? valueField : wrapper;
    return {
        fcStatus: toStringOrUndefined(pick(inner, "fcStatus", "FcStatus")) ?? "",
        fcMode: toNumber(pick(inner, "fcMode", "FcMode")),
        dimmerValue: toNumber(pick(inner, "dimmerValue", "DimmerValue")),
        deviceOn: toBoolean(pick(inner, "deviceOn", "DeviceOn")),
        timestamp: toStringOrUndefined(
            pick(wrapper, "timestamp", "Timestamp") ?? pick(inner, "timestamp", "Timestamp"),
        ),
    };
}

function parseRdm(raw: unknown): RawRdmEntry[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const result: RawRdmEntry[] = [];
    for (const entry of raw) {
        if (!isRecord(entry)) {
            continue;
        }
        // Real payload: { key: { parameterId, sensorId }, value: { value, timestamp } }.
        // Curated shape: { parameterId, sensorId, valueB64 }.
        const keyField = pick(entry, "key", "Key");
        const key = isRecord(keyField) ? keyField : entry;
        const parameterId = pick(key, "parameterId", "ParameterId");
        if (parameterId === undefined) {
            continue;
        }
        const sensorIdRaw = pick(key, "sensorId", "SensorId");
        const valueWrapper = pick(entry, "value", "Value");
        const valueB64 = isRecord(valueWrapper)
            ? toStringOrUndefined(pick(valueWrapper, "value", "Value"))
            : toStringOrUndefined(pick(entry, "valueB64", "ValueB64"));
        result.push({
            parameterId: toNumber(parameterId),
            sensorId: sensorIdRaw !== undefined ? toNumber(sensorIdRaw) : undefined,
            valueB64: valueB64 ?? "",
        });
    }
    return result;
}

function parsePump(raw: Record<string, unknown>, index: number): PumpInfo {
    const deviceNumber = toNumber(pick(raw, "deviceNumber", "DeviceNumber"), NaN);
    if (!Number.isFinite(deviceNumber)) {
        throw new Error("pump entry has no device number");
    }
    const connectionState = pick(raw, "connectionState", "ConnectionState");
    const isConnected = toBoolean(
        (isRecord(connectionState) ? pick(connectionState, "isConnected", "IsConnected") : undefined) ??
            pick(raw, "isConnected", "IsConnected"),
    );
    const rdm = parseRdm(pick(raw, "rdmData", "RdmData"));
    return {
        deviceNumber,
        index,
        articleNumber:
            pick(raw, "articleNumber", "ArticleNumber") !== undefined
                ? toNumber(pick(raw, "articleNumber", "ArticleNumber"))
                : undefined,
        deviceType: toStringOrUndefined(pick(raw, "deviceType", "DeviceType")) ?? PUMP_DEVICE_TYPE,
        isConnected,
        controlAddress: extractControlAddress(rdm),
        dmx: parseDmxPumpState(pick(raw, "dmxPumpState", "DmxPumpState")),
        sensors: parseSensorValues(rdm),
        rdm,
    };
}

/**
 * Parse the raw inventory JSON into the domain model.
 *
 * Handles the real cloud shape `{ gateways: [ { devices: [...] } ] }` (the first gateway
 * is used) as well as a flat `{ gateway, devices }` shape.
 *
 * @param raw - parsed JSON body of `GET /User/Inventory`
 * @returns gateway metadata and the list of pumps
 * @throws {Error} if the gateway is missing or the structure is unusable
 */
export function parseInventory(raw: unknown): Inventory {
    if (!isRecord(raw)) {
        throw new Error("inventory response is not an object");
    }

    // Real payload nests everything under gateways[]; take the first gateway.
    const gateways = pick(raw, "gateways", "Gateways");
    const gatewayRaw = Array.isArray(gateways) && gateways.length > 0 ? gateways[0] : pick(raw, "gateway", "Gateway");
    const gateway = parseGateway(gatewayRaw);

    // Names come from the gateway's DeviceTable telemetry, keyed by device slot index.
    const deviceNames = parseDeviceNames(
        isRecord(gatewayRaw) ? pick(gatewayRaw, "incrementStates", "IncrementStates") : undefined,
    );

    // Devices live under the gateway in the real payload, or at top level in the flat shape.
    const devicesRaw =
        (isRecord(gatewayRaw) ? pick(gatewayRaw, "devices", "Devices") : undefined) ?? pick(raw, "devices", "Devices");
    const pumps: PumpInfo[] = [];
    if (Array.isArray(devicesRaw)) {
        // The device's position in this list is its device index (used for on/off commands).
        for (let i = 0; i < devicesRaw.length; i++) {
            const device = devicesRaw[i];
            if (!isRecord(device)) {
                continue;
            }
            const deviceType = toStringOrUndefined(pick(device, "deviceType", "DeviceType"));
            if (deviceType !== undefined && deviceType !== PUMP_DEVICE_TYPE) {
                continue; // only pumps are handled in this adapter
            }
            const pump = parsePump(device, i);
            pump.name = deviceNames.get(i);
            pumps.push(pump);
        }
    }

    return { gateway, pumps };
}
