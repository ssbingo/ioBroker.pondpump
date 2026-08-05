import React from "react";

import {
    Alert,
    Box,
    Button,
    FormControlLabel,
    IconButton,
    MenuItem,
    Paper,
    Select,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import { Add as IconAdd, Delete as IconDelete } from "@mui/icons-material";
import { I18n } from "@iobroker/gui-components";
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from "@iobroker/json-config";

import {
    clampPercent,
    type PumpSchedule,
    type PumpScheduleConfig,
    type SchedulesConfig,
    validatePlans,
} from "./schedule";

/** A pump detected in the object tree. */
interface PumpEntry {
    /** The object id segment below `pumps.` (the device number, as a string). */
    id: string;
    /** Friendly name (device object common.name), falling back to the id. */
    name: string;
}

interface PondpumpSchedulerState extends ConfigGenericState {
    pumps: PumpEntry[];
    loaded: boolean;
}

const DEFAULT_CFG: PumpScheduleConfig = { enabled: false, basePower: 50, plans: [] };
const NEW_PLAN: PumpSchedule = { start: "08:00", end: "20:00", mode: "power", power: 60 };

/**
 * Admin custom component (Phase 9): per-pump time schedules.
 *
 * The same component serves two roles, selected by `schema.custom.pumpSlot`:
 *  - **List mode** (no `pumpSlot`): shown on the "Schedules" tab. Lists the detected pumps with an
 *    enable switch. Enabling a pump reveals its own admin tab (a `hidden`-gated panel in jsonConfig
 *    whose visibility is derived live from `native.schedules`).
 *  - **Tab mode** (`pumpSlot` = 0..N): shown on a per-pump tab. Renders that pump's base power plus a
 *    sorted, live-validated (non-overlapping) list of time windows that each set a power % or switch
 *    SFC. `pumpSlot` indexes the sorted list of enabled pumps, so tab N always maps to the same pump
 *    as its `hidden`/`label` expressions in jsonConfig.
 *
 * Everything is stored in the adapter's `native.schedules`, keyed by pump device number.
 */
class PondpumpScheduler extends ConfigGeneric<ConfigGenericProps, PondpumpSchedulerState> {
    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = { ...this.state, pumps: [], loaded: false };
    }

    async componentDidMount(): Promise<void> {
        await super.componentDidMount();
        if (this.pumpSlot === undefined) {
            // List mode needs the full set of detected pumps (with names) for the enable switches.
            await this.loadPumps();
        } else {
            // Tab mode renders straight from the config data — nothing to load.
            this.setState({ loaded: true });
        }
    }

    /** The pump slot this instance edits (tab mode), or undefined for the pump list. */
    private get pumpSlot(): number | undefined {
        const raw = (this.props.schema as { custom?: { pumpSlot?: number } }).custom?.pumpSlot;
        return typeof raw === "number" ? raw : undefined;
    }

    /** Read the detected pumps (device objects below `<instance>.pumps.`). */
    async loadPumps(): Promise<void> {
        const instance = this.props.oContext.instance;
        const root = `pondpump.${instance}.pumps.`;
        const pumps: PumpEntry[] = [];
        try {
            const objects = (await this.props.oContext.socket.getObjectViewSystem("device", root, `${root}￿`)) || {};
            for (const [id, obj] of Object.entries(objects)) {
                if (!id.startsWith(root)) {
                    continue;
                }
                const rest = id.substring(root.length);
                if (!rest || rest.includes(".")) {
                    continue; // only direct children of pumps.
                }
                const common = (obj?.common || {}) as { name?: ioBroker.StringOrTranslated };
                let name = "";
                if (typeof common.name === "string") {
                    name = common.name;
                } else if (common.name && typeof common.name === "object") {
                    const rec = common.name as Record<string, string>;
                    name = rec[I18n.getLanguage()] || rec.en || Object.values(rec)[0] || "";
                }
                pumps.push({ id: rest, name: name.trim() || rest });
            }
        } catch {
            /* ignore — the pump list stays empty until the adapter has run once */
        }
        pumps.sort((a, b) => Number(a.id) - Number(b.id));
        this.setState({ pumps, loaded: true });
    }

    /** The current schedules map from the config data. */
    get schedules(): SchedulesConfig {
        const value = (this.props.data as { schedules?: SchedulesConfig }).schedules;
        return value && typeof value === "object" ? value : {};
    }

    /** The enabled pump ids, sorted by device number — this is the slot order used by the tabs. */
    private enabledIds(): string[] {
        const s = this.schedules;
        return Object.keys(s)
            .filter(id => s[id]?.enabled)
            .sort((a, b) => Number(a) - Number(b));
    }

    /** The config for one pump, with defaults filled in. */
    private cfgOf(id: string): PumpScheduleConfig {
        return { ...DEFAULT_CFG, ...this.schedules[id] };
    }

    /** Write a pump's config back into `native.schedules`. */
    private setCfg(id: string, cfg: PumpScheduleConfig): void {
        const next: SchedulesConfig = { ...this.schedules, [id]: cfg };
        void this.onChange("schedules", next);
    }

    private toggleEnabled(pump: PumpEntry, enabled: boolean): void {
        // Cache the display name so the pump's tab can be labelled without re-reading objects.
        this.setCfg(pump.id, { ...this.cfgOf(pump.id), enabled, name: pump.name });
    }

    private updatePlan(id: string, index: number, patch: Partial<PumpSchedule>): void {
        const cfg = this.cfgOf(id);
        const plans = cfg.plans.map((p, i) => (i === index ? { ...p, ...patch } : p));
        this.setCfg(id, { ...cfg, plans });
    }

    private addPlan(id: string): void {
        const cfg = this.cfgOf(id);
        this.setCfg(id, { ...cfg, plans: [...cfg.plans, { ...NEW_PLAN }] });
    }

    private removePlan(id: string, index: number): void {
        const cfg = this.cfgOf(id);
        this.setCfg(id, { ...cfg, plans: cfg.plans.filter((_, i) => i !== index) });
    }

    private renderPlanRow(id: string, plan: PumpSchedule, index: number): React.JSX.Element {
        return (
            <TableRow key={index}>
                <TableCell>
                    <TextField
                        type="time"
                        size="small"
                        variant="standard"
                        value={plan.start}
                        onChange={e => this.updatePlan(id, index, { start: e.target.value })}
                    />
                </TableCell>
                <TableCell>
                    <TextField
                        type="time"
                        size="small"
                        variant="standard"
                        value={plan.end}
                        onChange={e => this.updatePlan(id, index, { end: e.target.value })}
                    />
                </TableCell>
                <TableCell>
                    <Select
                        size="small"
                        variant="standard"
                        value={plan.mode}
                        onChange={e => this.updatePlan(id, index, { mode: e.target.value })}
                    >
                        <MenuItem value="power">{I18n.t("Power %")}</MenuItem>
                        <MenuItem value="sfc">{I18n.t("SFC")}</MenuItem>
                    </Select>
                </TableCell>
                <TableCell>
                    {plan.mode === "power" ? (
                        <TextField
                            type="number"
                            size="small"
                            variant="standard"
                            slotProps={{ htmlInput: { min: 0, max: 100, step: 5 } }}
                            value={plan.power ?? 0}
                            onChange={e => this.updatePlan(id, index, { power: clampPercent(Number(e.target.value)) })}
                            sx={{ width: 80 }}
                        />
                    ) : (
                        <Select
                            size="small"
                            variant="standard"
                            value={plan.sfc ? "on" : "off"}
                            onChange={e => this.updatePlan(id, index, { sfc: e.target.value === "on" })}
                        >
                            <MenuItem value="on">{I18n.t("on")}</MenuItem>
                            <MenuItem value="off">{I18n.t("off")}</MenuItem>
                        </Select>
                    )}
                </TableCell>
                <TableCell padding="none">
                    <IconButton
                        size="small"
                        onClick={() => this.removePlan(id, index)}
                    >
                        <IconDelete fontSize="small" />
                    </IconButton>
                </TableCell>
            </TableRow>
        );
    }

    /** Tab mode: the editor for one pump (base power + schedule table + live validation). */
    private renderPumpEditor(id: string): React.JSX.Element {
        const cfg = this.cfgOf(id);
        // Present the windows sorted by start time so the list reads chronologically.
        const rows = cfg.plans
            .map((plan, index) => ({ plan, index }))
            .sort((a, b) => (a.plan.start || "").localeCompare(b.plan.start || ""));
        const validation = validatePlans(cfg.plans);
        return (
            <Box sx={{ mt: 1 }}>
                <Typography
                    variant="h6"
                    sx={{ mb: 1 }}
                >
                    {I18n.t("Schedules for %s", cfg.name || id)}
                </Typography>
                <TextField
                    type="number"
                    size="small"
                    label={I18n.t("Base power % (outside all windows)")}
                    slotProps={{ htmlInput: { min: 0, max: 100, step: 5 } }}
                    value={cfg.basePower}
                    onChange={e => this.setCfg(id, { ...cfg, basePower: clampPercent(Number(e.target.value)) })}
                    sx={{ width: 320, mb: 2 }}
                />
                <Paper variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{I18n.t("Start")}</TableCell>
                                <TableCell>{I18n.t("End")}</TableCell>
                                <TableCell>{I18n.t("Mode")}</TableCell>
                                <TableCell>{I18n.t("Value")}</TableCell>
                                <TableCell padding="none" />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.length ? (
                                rows.map(r => this.renderPlanRow(id, r.plan, r.index))
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={5}
                                        sx={{ color: "text.secondary" }}
                                    >
                                        {I18n.t("No schedules yet — outside all windows the base power applies.")}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Paper>
                <Button
                    startIcon={<IconAdd />}
                    onClick={() => this.addPlan(id)}
                    sx={{ mt: 1 }}
                >
                    {I18n.t("Add schedule")}
                </Button>
                {!validation.valid ? (
                    <Alert
                        severity="error"
                        sx={{ mt: 2 }}
                    >
                        {I18n.t("Schedules must not overlap")}: {validation.error}
                    </Alert>
                ) : null}
            </Box>
        );
    }

    /** List mode: the pump enable list shown on the "Schedules" tab. */
    private renderPumpList(): React.JSX.Element {
        if (!this.state.pumps.length) {
            return (
                <Alert
                    severity="info"
                    sx={{ mt: 1 }}
                >
                    {I18n.t("No pumps detected yet. Start the adapter once so it discovers the pumps, then reload.")}
                </Alert>
            );
        }
        return (
            <Box sx={{ mt: 1 }}>
                <Typography sx={{ mb: 1, color: "text.secondary" }}>
                    {I18n.t(
                        "Enable scheduling for the pumps you want to run on a timetable. Each enabled pump gets its own tab above where you configure its schedules.",
                    )}
                </Typography>
                <Paper
                    variant="outlined"
                    sx={{ p: 1.5, display: "flex", flexWrap: "wrap", gap: 2 }}
                >
                    {this.state.pumps.map(p => (
                        <FormControlLabel
                            key={p.id}
                            control={
                                <Switch
                                    checked={this.cfgOf(p.id).enabled}
                                    onChange={e => this.toggleEnabled(p, e.target.checked)}
                                />
                            }
                            label={p.name}
                        />
                    ))}
                </Paper>
            </Box>
        );
    }

    renderItem(): React.JSX.Element | null {
        if (!this.state.loaded) {
            return <Typography sx={{ p: 2 }}>{I18n.t("Loading pumps…")}</Typography>;
        }
        const slot = this.pumpSlot;
        if (slot === undefined) {
            return this.renderPumpList();
        }
        // Tab mode: resolve the slot to a pump id via the same sorted-enabled order the tab's
        // hidden/label expressions use. The tab is hidden when the slot is empty, so this is defensive.
        const id = this.enabledIds()[slot];
        if (!id) {
            return null;
        }
        return this.renderPumpEditor(id);
    }
}

export default PondpumpScheduler;
