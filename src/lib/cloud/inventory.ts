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
    /** OASE article number, e.g. 73656. */
    articleNumber?: number;
    /** Device type string, e.g. "GardenPump". */
    deviceType: string;
    /** Whether the controller currently sees the pump. */
    isConnected: boolean;
    /** Current speed/on-off state. */
    dmx: DmxPumpState;
    /** Raw RDM telemetry, kept for later decoding. */
    rdm: RawRdmEntry[];
}

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
    /** Human-readable long name (lname), e.g. "EGC Controller Cloud". */
    name: string;
    /** Firmware version (attribute id 102). */
    firmware?: string;
    /** User-assigned pond name (attribute id 103). */
    pondName?: string;
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
 * Look up a value in an OASE attributes array `[{ Id, Value }, ...]` by its numeric id.
 *
 * @param attributes - the attributes array (or anything else, which yields undefined)
 * @param id - numeric attribute id to look up
 */
function readAttribute(attributes: unknown, id: number): string | undefined {
    if (!Array.isArray(attributes)) {
        return undefined;
    }
    for (const entry of attributes) {
        if (isRecord(entry) && toNumber(pick(entry, "Id", "id"), NaN) === id) {
            return toStringOrUndefined(pick(entry, "Value", "value"));
        }
    }
    return undefined;
}

function parseGateway(raw: unknown): GatewayInfo {
    if (!isRecord(raw)) {
        throw new Error("inventory gateway is missing or not an object");
    }
    const serialNumber = toStringOrUndefined(pick(raw, "serialNumber", "SerialNumber", "sn"));
    if (!serialNumber) {
        throw new Error("inventory gateway has no serial number");
    }
    const attributes = pick(raw, "attributes", "Attributes");
    const name = toStringOrUndefined(pick(raw, "lname", "lName", "LName", "name", "Name")) ?? "EGC Controller Cloud";
    return {
        id: toStringOrUndefined(pick(raw, "id", "Id")),
        serialNumber,
        articleNumber:
            pick(raw, "articleNumber", "ArticleNumber") !== undefined
                ? toNumber(pick(raw, "articleNumber", "ArticleNumber"))
                : undefined,
        gatewayType: toStringOrUndefined(pick(raw, "gatewayType", "GatewayType")),
        name,
        firmware:
            toStringOrUndefined(pick(raw, "firmware", "Firmware", "firmwareAttr_Id102")) ??
            readAttribute(attributes, ATTR_FIRMWARE),
        pondName:
            toStringOrUndefined(pick(raw, "pondName", "PondName", "pondName_Id103")) ??
            readAttribute(attributes, ATTR_POND_NAME),
    };
}

function parseDmxPumpState(raw: unknown): DmxPumpState {
    const obj = isRecord(raw) ? raw : {};
    return {
        fcStatus: toStringOrUndefined(pick(obj, "fcStatus", "FcStatus")) ?? "",
        fcMode: toNumber(pick(obj, "fcMode", "FcMode")),
        dimmerValue: toNumber(pick(obj, "dimmerValue", "DimmerValue")),
        deviceOn: toBoolean(pick(obj, "deviceOn", "DeviceOn")),
        timestamp: toStringOrUndefined(pick(obj, "timestamp", "Timestamp")),
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
        const parameterId = pick(entry, "parameterId", "ParameterId");
        if (parameterId === undefined) {
            continue;
        }
        const sensorIdRaw = pick(entry, "sensorId", "SensorId");
        result.push({
            parameterId: toNumber(parameterId),
            sensorId: sensorIdRaw !== undefined ? toNumber(sensorIdRaw) : undefined,
            valueB64: toStringOrUndefined(pick(entry, "valueB64", "ValueB64", "value", "Value")) ?? "",
        });
    }
    return result;
}

function parsePump(raw: Record<string, unknown>): PumpInfo {
    const deviceNumber = toNumber(pick(raw, "deviceNumber", "DeviceNumber"), NaN);
    if (!Number.isFinite(deviceNumber)) {
        throw new Error("pump entry has no device number");
    }
    return {
        deviceNumber,
        articleNumber:
            pick(raw, "articleNumber", "ArticleNumber") !== undefined
                ? toNumber(pick(raw, "articleNumber", "ArticleNumber"))
                : undefined,
        deviceType: toStringOrUndefined(pick(raw, "deviceType", "DeviceType")) ?? PUMP_DEVICE_TYPE,
        isConnected: toBoolean(pick(raw, "isConnected", "IsConnected")),
        dmx: parseDmxPumpState(pick(raw, "dmxPumpState", "DmxPumpState")),
        rdm: parseRdm(pick(raw, "rdmData", "RdmData")),
    };
}

/**
 * Parse the raw inventory JSON into the domain model.
 *
 * @param raw - parsed JSON body of `GET /User/Inventory`
 * @returns gateway metadata and the list of pumps
 * @throws {Error} if the gateway is missing or the structure is unusable
 */
export function parseInventory(raw: unknown): Inventory {
    if (!isRecord(raw)) {
        throw new Error("inventory response is not an object");
    }
    const gateway = parseGateway(pick(raw, "gateway", "Gateway"));

    const devicesRaw = pick(raw, "devices", "Devices");
    const pumps: PumpInfo[] = [];
    if (Array.isArray(devicesRaw)) {
        for (const device of devicesRaw) {
            if (!isRecord(device)) {
                continue;
            }
            const deviceType = toStringOrUndefined(pick(device, "deviceType", "DeviceType"));
            if (deviceType !== undefined && deviceType !== PUMP_DEVICE_TYPE) {
                continue; // only pumps are handled in this adapter
            }
            pumps.push(parsePump(device));
        }
    }

    return { gateway, pumps };
}
