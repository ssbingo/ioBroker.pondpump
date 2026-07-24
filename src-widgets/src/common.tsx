import React, { useEffect, useState } from "react";
import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";

import type {
    RxWidgetInfoAttributesField,
    RxWidgetInfoCustomComponentProperties,
    WidgetData,
} from "@iobroker/types-vis-2";

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
