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
    Tab,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tabs,
    TextField,
    Typography,
} from "@mui/material";
import { Add as IconAdd, Delete as IconDelete } from "@mui/icons-material";
import { I18n } from "@iobroker/adapter-react-v5";
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from "@iobroker/json-config";

import {
    clampPercent,
    type PumpSchedule,
    type PumpScheduleConfig,
    type ScheduleMode,
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
    /** Currently selected pump id (tab). */
    tab: string;
}

const DEFAULT_CFG: PumpScheduleConfig = { enabled: false, basePower: 50, plans: [] };
const NEW_PLAN: PumpSchedule = { start: "08:00", end: "20:00", mode: "power", power: 60 };

/**
 * Admin custom component (Phase 9): per-pump time schedules. Shows the detected pumps with an
 * enable switch, a tab per enabled pump, and — per pump — a base power plus a sorted, live-validated
 * (non-overlapping) list of time windows that each set a power % or switch SFC. The whole structure
 * is stored in the adapter's `native.schedules`, keyed by pump device number.
 */
class PondpumpScheduler extends ConfigGeneric<ConfigGenericProps, PondpumpSchedulerState> {
    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = { ...this.state, pumps: [], loaded: false, tab: "" };
    }

    async componentDidMount(): Promise<void> {
        await super.componentDidMount();
        await this.loadPumps();
    }

    /** Read the detected pumps (device objects below `<instance>.pumps.`). */
    async loadPumps(): Promise<void> {
        const instance = this.props.oContext.instance;
        const root = `pondpump.${instance}.pumps.`;
        const pumps: PumpEntry[] = [];
        try {
            const objects = (await this.props.oContext.socket.getObjectViewSystem("device", root, `${root}香`)) || {};
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
        pumps.sort((a, b) => a.name.localeCompare(b.name));
        const firstEnabled = pumps.find(p => this.schedules[p.id]?.enabled)?.id;
        this.setState({ pumps, loaded: true, tab: firstEnabled || pumps[0]?.id || "" });
    }

    /** The current schedules map from the config data. */
    get schedules(): SchedulesConfig {
        const value = (this.props.data as { schedules?: SchedulesConfig }).schedules;
        return value && typeof value === "object" ? value : {};
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

    private toggleEnabled(id: string, enabled: boolean): void {
        this.setCfg(id, { ...this.cfgOf(id), enabled });
        if (enabled) {
            this.setState({ tab: id });
        }
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
                        onChange={e => this.updatePlan(id, index, { mode: e.target.value as ScheduleMode })}
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

    private renderPumpEditor(id: string): React.JSX.Element {
        const cfg = this.cfgOf(id);
        // Present the windows sorted by start time so the list reads chronologically.
        const rows = cfg.plans
            .map((plan, index) => ({ plan, index }))
            .sort((a, b) => (a.plan.start || "").localeCompare(b.plan.start || ""));
        const validation = validatePlans(cfg.plans);
        return (
            <Box sx={{ mt: 2 }}>
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

    renderItem(): React.JSX.Element {
        if (!this.state.loaded) {
            return <Typography sx={{ p: 2 }}>{I18n.t("Loading pumps…")}</Typography>;
        }
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
        const enabled = this.state.pumps.filter(p => this.cfgOf(p.id).enabled);
        const tab = enabled.some(p => p.id === this.state.tab) ? this.state.tab : enabled[0]?.id || "";
        return (
            <Box sx={{ mt: 1 }}>
                <Typography
                    variant="h6"
                    sx={{ mb: 1 }}
                >
                    {I18n.t("Pump schedules")}
                </Typography>
                <Paper
                    variant="outlined"
                    sx={{ p: 1.5, mb: 2, display: "flex", flexWrap: "wrap", gap: 2 }}
                >
                    {this.state.pumps.map(p => (
                        <FormControlLabel
                            key={p.id}
                            control={
                                <Switch
                                    checked={this.cfgOf(p.id).enabled}
                                    onChange={e => this.toggleEnabled(p.id, e.target.checked)}
                                />
                            }
                            label={p.name}
                        />
                    ))}
                </Paper>
                {enabled.length ? (
                    <>
                        <Tabs
                            value={tab}
                            onChange={(_e, v) => this.setState({ tab: v as string })}
                            variant="scrollable"
                            scrollButtons="auto"
                        >
                            {enabled.map(p => (
                                <Tab
                                    key={p.id}
                                    value={p.id}
                                    label={p.name}
                                />
                            ))}
                        </Tabs>
                        {tab ? this.renderPumpEditor(tab) : null}
                    </>
                ) : (
                    <Typography sx={{ color: "text.secondary" }}>
                        {I18n.t("Enable a pump above to define its schedules.")}
                    </Typography>
                )}
            </Box>
        );
    }
}

export default PondpumpScheduler;
