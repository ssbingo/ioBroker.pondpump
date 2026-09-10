import React, { useEffect, useState } from "react";
import {
    Checkbox,
    FormControl,
    FormControlLabel,
    FormGroup,
    InputLabel,
    MenuItem,
    Select,
    Typography,
} from "@mui/material";

import type {
    RxWidgetInfoAttributesField,
    RxWidgetInfoCustomComponentProperties,
    WidgetData,
} from "@iobroker/types-vis-2";

import translations from "./translations";

/**
 * Translate a widget i18n key in the vis editor's custom settings components (where the widget's own
 * `t()` is not available). Uses the shared i18n JSONs and the ioBroker UI language, falling back to en.
 *
 * @param key - the i18n key
 */
function tr(key: string): string {
    const lang = (typeof window !== "undefined" && (window as { systemLang?: string }).systemLang) || "en";
    const dict = (translations as Record<string, Record<string, string>>)[lang];
    const en = (translations as Record<string, Record<string, string>>).en;
    return dict?.[key] || en?.[key] || key;
}

export const ADAPTER = "pondpump";

// Minimal structural socket type. The attribute editor and the widgets only need a couple of
// read methods, and typing them narrowly avoids the duplicate @iobroker/adapter-react-v5 copies
// clashing on the full Connection type (private members).
type SocketLike = {
    getObject: (id: string) => Promise<ioBroker.Object | null | undefined>;
    getObjectViewSystem?: (
        type: string,
        start: string,
        end: string,
    ) => Promise<Record<string, ioBroker.Object> | undefined>;
    getObjectView?: (
        design: string,
        type: string,
        params: { startkey: string; endkey: string },
    ) => Promise<{ rows?: Array<{ id: string; value: ioBroker.Object }> } | undefined>;
};

interface PumpDef {
    /** The pump object id segment below `pumps.` (the device number). */
    id: string;
    /** Friendly name (from the pump device object's common.name), falling back to the id. */
    name: string;
}

/** Extracts the plain instance number from either "0" or "pondpump.0". */
export function instanceNumber(rx: { instance?: string }): string {
    const raw = rx?.instance !== undefined && rx.instance !== "" ? String(rx.instance) : "0";
    return raw.split(".").pop() || "0";
}

/**
 * Builds the pump device channel id from the widget data, or '' if no pump is chosen yet.
 * Every widget derives its concrete OIDs by appending the sub-state below this channel
 * (e.g. `${channel}.telemetry.power`), so the widget "knows the OIDs itself".
 */
export function pumpChannelOf(rx: { instance?: string; pumpId?: string }): string {
    const pid = rx?.pumpId;
    return pid ? `${ADAPTER}.${instanceNumber(rx)}.pumps.${pid}` : "";
}

/** Extracts a friendly name from a (possibly multilingual) common.name value, or "". */
function nameOf(common: { name?: ioBroker.StringOrTranslated } | undefined): string {
    const name = common?.name;
    if (typeof name === "string") {
        return name;
    }
    if (name && typeof name === "object") {
        const rec = name as Record<string, string>;
        return rec.en || Object.values(rec)[0] || "";
    }
    return "";
}

/** Reads the friendly name of a pump device channel (for a widget card title), or "" on any error. */
export async function pumpDeviceName(socket: { getObject: SocketLike["getObject"] }, channel: string): Promise<string> {
    try {
        const obj = await socket.getObject(channel);
        return nameOf((obj?.common || {}) as { name?: ioBroker.StringOrTranslated });
    } catch {
        return "";
    }
}

/** Reads the detected pumps (device objects below `<instance>.pumps.`) with their friendly names. */
async function readPumps(socket: SocketLike, instance: string): Promise<PumpDef[]> {
    const root = `${ADAPTER}.${instance}.pumps.`;
    const end = `${root}香`;
    let objects: Record<string, ioBroker.Object> = {};
    try {
        if (typeof socket.getObjectViewSystem === "function") {
            objects = (await socket.getObjectViewSystem("device", root, end)) || {};
        } else if (typeof socket.getObjectView === "function") {
            const res = await socket.getObjectView("system", "device", { startkey: root, endkey: end });
            for (const row of res?.rows || []) {
                objects[row.id] = row.value;
            }
        }
    } catch {
        return [];
    }
    const pumps: PumpDef[] = [];
    for (const [id, obj] of Object.entries(objects)) {
        if (!id.startsWith(root)) {
            continue;
        }
        // Only direct children of `pumps.` (the pump devices), not nested channels/states.
        const rest = id.substring(root.length);
        if (!rest || rest.includes(".")) {
            continue;
        }
        const common = (obj?.common || {}) as { name?: ioBroker.StringOrTranslated };
        let name = "";
        if (typeof common.name === "string") {
            name = common.name;
        } else if (common.name && typeof common.name === "object") {
            name = (common.name as Record<string, string>).en || Object.values(common.name)[0] || "";
        }
        pumps.push({ id: rest, name: name.trim() || rest });
    }
    pumps.sort((a, b) => a.name.localeCompare(b.name));
    return pumps;
}

/** Attribute dropdown that lets the user pick a detected pump by its friendly name. */
function PumpSelect(props: {
    socket: SocketLike;
    data: WidgetData;
    onDataChange: (newData: WidgetData) => void;
    label: string;
}): React.JSX.Element {
    const { socket, data, onDataChange, label } = props;
    const [pumps, setPumps] = useState<PumpDef[]>([]);
    const instance = instanceNumber(data as { instance?: string });

    useEffect(() => {
        let active = true;
        void readPumps(socket, instance).then(list => active && setPumps(list));
        return () => {
            active = false;
        };
    }, [socket, instance]);

    const value = (data.pumpId as string) || "";

    return (
        <FormControl
            fullWidth
            variant="standard"
            size="small"
        >
            <InputLabel>{label}</InputLabel>
            <Select
                value={pumps.some(p => p.id === value) ? value : ""}
                onChange={e => onDataChange({ ...data, pumpId: e.target.value })}
            >
                {pumps.length ? (
                    pumps.map(p => (
                        <MenuItem
                            key={p.id}
                            value={p.id}
                        >
                            {p.name}
                        </MenuItem>
                    ))
                ) : (
                    <MenuItem
                        value=""
                        disabled
                    >
                        —
                    </MenuItem>
                )}
            </Select>
        </FormControl>
    );
}

/** The shared "common" attribute group (instance + pump-by-name) used by every pondpump widget. */
export function pondpumpCommonGroup(): { name: string; fields: RxWidgetInfoAttributesField[] } {
    return {
        name: "common",
        fields: [
            {
                name: "instance",
                type: "instance",
                label: "pondpump_instance",
                adapter: ADAPTER,
                isShort: true,
                default: "0",
            },
            {
                name: "pumpId",
                type: "custom",
                label: "pump",
                component: (
                    field: RxWidgetInfoAttributesField,
                    data: WidgetData,
                    onDataChange: (newData: WidgetData) => void,
                    compProps: RxWidgetInfoCustomComponentProperties,
                ): React.JSX.Element => (
                    <PumpSelect
                        socket={compProps.context.socket as unknown as SocketLike}
                        data={data}
                        onDataChange={onDataChange}
                        label={(field as { label?: string }).label || "pump"}
                    />
                ),
            },
        ] as RxWidgetInfoAttributesField[],
    };
}

/** Stable per-actuator key for the widget's per-actuator visibility toggles (target OID, else "#N"). */
export function actuatorKey(target: string | undefined, ordinal: number): string {
    return (target && target.trim()) || `#${ordinal}`;
}

/** Parse the widget's `hiddenActuators` data (a JSON array of keys) into a Set; tolerant of junk. */
export function hiddenActuatorSet(value: unknown): Set<string> {
    if (typeof value !== "string" || !value.trim()) {
        return new Set();
    }
    try {
        const arr = JSON.parse(value) as unknown;
        return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
    } catch {
        return new Set();
    }
}

interface ActuatorDef {
    key: string;
    name: string;
    icon: string;
}

/** Read the configured actuator windows of one pump from the instance config (name/icon/key). */
async function readPumpActuators(socket: SocketLike, instance: string, pumpId: string): Promise<ActuatorDef[]> {
    if (!pumpId) {
        return [];
    }
    try {
        const obj = await socket.getObject(`system.adapter.${ADAPTER}.${instance}`);
        const native = (obj?.native ?? {}) as {
            schedules?: Record<string, { plans?: Array<Record<string, unknown>> }>;
        };
        const plans = native.schedules?.[pumpId]?.plans ?? [];
        const out: ActuatorDef[] = [];
        let n = 0;
        for (const p of plans) {
            if (p?.mode !== "actuator") {
                continue;
            }
            n += 1;
            const target = typeof p.target === "string" ? p.target : "";
            const name = (typeof p.actuatorName === "string" ? p.actuatorName : "").trim() || `Aktor ${n}`;
            const icon = typeof p.actuatorIcon === "string" && p.actuatorIcon ? p.actuatorIcon : "⚙️";
            out.push({ key: actuatorKey(target, n), name, icon });
        }
        return out;
    } catch {
        return [];
    }
}

/** Per-actuator show/hide switches for the widget settings (data.hiddenActuators = JSON array of keys). */
function ActuatorVisibility(props: {
    socket: SocketLike;
    data: WidgetData;
    onDataChange: (newData: WidgetData) => void;
}): React.JSX.Element {
    const { socket, data, onDataChange } = props;
    const [acts, setActs] = useState<ActuatorDef[]>([]);
    const instance = instanceNumber(data as { instance?: string });
    const pumpId = (data.pumpId as string) || "";

    useEffect(() => {
        let active = true;
        void readPumpActuators(socket, instance, pumpId).then(a => active && setActs(a));
        return () => {
            active = false;
        };
    }, [socket, instance, pumpId]);

    const hidden = hiddenActuatorSet(data.hiddenActuators);
    const toggle = (key: string, show: boolean): void => {
        const next = new Set(hidden);
        if (show) {
            next.delete(key);
        } else {
            next.add(key);
        }
        onDataChange({ ...data, hiddenActuators: JSON.stringify([...next]) });
    };

    if (!acts.length) {
        return (
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{tr("no_actuators")}</Typography>
        );
    }
    return (
        <FormGroup>
            {acts.map(a => (
                <FormControlLabel
                    key={a.key}
                    control={
                        <Checkbox
                            size="small"
                            checked={!hidden.has(a.key)}
                            onChange={e => toggle(a.key, e.target.checked)}
                        />
                    }
                    label={`${a.icon} ${a.name}`}
                />
            ))}
        </FormGroup>
    );
}

/** A widget visAttrs field (type custom) rendering the per-actuator visibility switches. */
export function actuatorVisibilityField(): RxWidgetInfoAttributesField {
    return {
        name: "hiddenActuators",
        type: "custom",
        label: "actuators_visibility",
        component: (
            _field: RxWidgetInfoAttributesField,
            data: WidgetData,
            onDataChange: (newData: WidgetData) => void,
            compProps: RxWidgetInfoCustomComponentProperties,
        ): React.JSX.Element => (
            <ActuatorVisibility
                socket={compProps.context.socket as unknown as SocketLike}
                data={data}
                onDataChange={onDataChange}
            />
        ),
    } as RxWidgetInfoAttributesField;
}
