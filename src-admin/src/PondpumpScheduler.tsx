import React from "react";

import {
    Alert,
    Box,
    Button,
    FormControl,
    FormControlLabel,
    FormHelperText,
    IconButton,
    InputLabel,
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
import { Add as IconAdd, Delete as IconDelete, Search as IconSearch } from "@mui/icons-material";
import { I18n, SelectID } from "@iobroker/gui-components";
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from "@iobroker/json-config";

import {
    clampPercent,
    type Comparison,
    type ConditionPriority,
    type ConditionRule,
    type CurvePoint,
    DEFAULT_CURVE_POINTS,
    type PumpSchedule,
    type PumpScheduleConfig,
    type RuleEffectType,
    type SchedulesConfig,
    type TempCurve,
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
    /** The open object-picker dialog, or null. `onPick` receives the selected state id. */
    picker: null | { selected: string; onPick: (id: string) => void };
    /** Live values of the pump's device temperature sensors (tab mode), for the sensor picker. */
    sensorValues: Record<string, number | null>;
}

const DEFAULT_CFG: PumpScheduleConfig = { enabled: false, basePower: 50, plans: [] };
const NEW_PLAN: PumpSchedule = { start: "08:00", end: "20:00", mode: "power", power: 60 };
const NEW_POINT: CurvePoint = { temp: 15, power: 50 };
// A new weather rule defaults to a warm-weather boost (rules only ever raise the flow, never lower it).
const NEW_RULE: ConditionRule = { source: "", cmp: "gte", threshold: 22, effect: "raisePower", power: 85 };
const CMP_LABELS: Record<Comparison, string> = { lt: "<", lte: "≤", gt: ">", gte: "≥", eq: "=", ne: "≠" };
const EFFECTS: RuleEffectType[] = ["raisePower", "boostMax", "hold", "sfc", "setState"];

/**
 * Localised label for a rule effect.
 *
 * @param effect - the rule effect
 */
function effectLabel(effect: RuleEffectType): string {
    switch (effect) {
        case "raisePower":
            return I18n.t("Raise to power %");
        case "boostMax":
            return I18n.t("Boost to 100 %");
        case "hold":
            return I18n.t("Hold (frost)");
        case "sfc":
            return I18n.t("SFC on/off");
        case "setState":
            return I18n.t("Set actuator");
    }
}

/**
 * Parse a free-text actuator value into a boolean (true/false/on/off) or a number.
 *
 * @param raw - the raw text entered by the user
 */
function parseActuatorValue(raw: string): number | boolean {
    const t = raw.trim().toLowerCase();
    if (t === "true" || t === "on") {
        return true;
    }
    if (t === "false" || t === "off") {
        return false;
    }
    const n = Number(raw);
    return raw.trim() !== "" && Number.isFinite(n) ? n : true;
}

/**
 * Display string for a stored actuator value.
 *
 * @param value - the stored actuator value
 */
function actuatorValueText(value: number | boolean | undefined): string {
    return value === undefined ? "true" : String(value);
}

/**
 * Admin custom component (Phase 9 + 11/12): per-pump time schedules and temperature/weather control.
 *
 * The same component serves two roles, selected by `schema.custom.pumpSlot`:
 *  - **List mode** (no `pumpSlot`): shown on the "Schedules" tab. Lists the detected pumps with an
 *    enable switch. Enabling a pump reveals its own admin tab (a `hidden`-gated panel in jsonConfig
 *    whose visibility is derived live from `native.schedules`).
 *  - **Tab mode** (`pumpSlot` = 0..N): shown on a per-pump tab. Renders that pump's base power, its
 *    sorted, live-validated time windows, and the Phase-12 temperature curve + weather rules.
 *    `pumpSlot` indexes the sorted list of enabled pumps, so tab N always maps to the same pump as
 *    its `hidden`/`label` expressions in jsonConfig.
 *
 * Everything is stored in the adapter's `native.schedules`, keyed by pump device number.
 */
class PondpumpScheduler extends ConfigGeneric<ConfigGenericProps, PondpumpSchedulerState> {
    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = { ...this.state, pumps: [], loaded: false, picker: null, sensorValues: {} };
    }

    async componentDidMount(): Promise<void> {
        await super.componentDidMount();
        if (this.pumpSlot === undefined) {
            // List mode needs the full set of detected pumps (with names) for the enable switches.
            await this.loadPumps();
        } else {
            // Tab mode: read the pump's live sensor values so the water-temperature picker can show them.
            const slot = this.pumpSlot;
            const id = slot !== undefined ? this.enabledIds()[slot] : undefined;
            if (id) {
                await this.loadSensorValues(id);
            }
            this.setState({ loaded: true });
        }
    }

    /** Read the current values of the pump's device temperature sensors (for the sensor picker). */
    private async loadSensorValues(id: string): Promise<void> {
        const base = `pondpump.${this.props.oContext.instance}.pumps.${id}.telemetry`;
        const out: Record<string, number | null> = {};
        for (const key of ["temperature", "temperature2"]) {
            try {
                const st = await this.props.oContext.socket.getState(`${base}.${key}`);
                out[key] = typeof st?.val === "number" ? st.val : null;
            } catch {
                out[key] = null;
            }
        }
        this.setState({ sensorValues: out });
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

    /** Open the object-selection dialog; the picked state id is handed to `onPick`. */
    private openPicker(selected: string, onPick: (id: string) => void): void {
        this.setState({ picker: { selected: selected || "", onPick } });
    }

    /** A state-id text field with an object-picker button beside it. */
    private renderOidField(
        value: string,
        onChange: (v: string) => void,
        opts: { label?: string; width?: number | string; variant?: "standard" | "outlined" } = {},
    ): React.JSX.Element {
        return (
            <Box
                sx={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 0.5,
                    width: opts.width ?? "100%",
                    maxWidth: "100%",
                }}
            >
                <TextField
                    size="small"
                    variant={opts.variant ?? "standard"}
                    label={opts.label}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    sx={{ flex: 1 }}
                />
                <IconButton
                    size="small"
                    title={I18n.t("Select state")}
                    onClick={() => this.openPicker(value, onChange)}
                >
                    <IconSearch fontSize="small" />
                </IconButton>
            </Box>
        );
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

    /** Tab mode: the editor for one pump (base power + schedule table + live validation + conditions). */
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
                {this.renderConditions(id)}
            </Box>
        );
    }

    private setPriority(id: string, priority: ConditionPriority): void {
        this.setCfg(id, { ...this.cfgOf(id), conditionPriority: priority });
    }

    /** The derived water-temperature state id for a pump (fed by the picked device sensor). */
    private waterTempOid(id: string): string {
        return `pondpump.${this.props.oContext.instance}.pumps.${id}.telemetry.waterTemperature`;
    }

    /** Label for a device-sensor option in the water-temperature picker, with its live value. */
    private sensorOptionLabel(key: string, n: number): string {
        const v = this.state.sensorValues[key];
        const val =
            typeof v === "number"
                ? `${v.toLocaleString(I18n.getLanguage(), { maximumFractionDigits: 1 })} °C`
                : I18n.t("no value yet");
        return `${I18n.t("Sensor %s", String(n))} · ${val} · telemetry.${key}`;
    }

    /**
     * Assign which device sensor is the water temperature. This also pre-fills the curve source with
     * the derived `telemetry.waterTemperature` state so the curve reads a clearly named value.
     *
     * @param id - the pump id
     * @param sensor - the device sensor key, or "" to clear the assignment
     */
    private setWaterSensor(id: string, sensor: "" | "temperature" | "temperature2"): void {
        const cfg = this.cfgOf(id);
        const next: PumpScheduleConfig = { ...cfg };
        if (sensor === "") {
            delete next.waterTempSensor;
        } else {
            next.waterTempSensor = sensor;
            next.curve = { enabled: false, points: [], ...next.curve, source: this.waterTempOid(id) };
        }
        this.setCfg(id, next);
    }

    /** Write one of the Phase-12 numeric limits (undefined clears it back to the default). */
    private setLimit(id: string, key: keyof PumpScheduleConfig, value: number | undefined): void {
        this.setCfg(id, { ...this.cfgOf(id), [key]: value });
    }

    private setCurve(id: string, patch: Partial<TempCurve>): void {
        const cfg = this.cfgOf(id);
        // No pump-telemetry default: the pump reports its *device* temperature, not the water — the
        // user must point the curve at a real water-temperature sensor (Phase 12, decision A).
        const curve: TempCurve = { enabled: false, source: "", points: [], ...cfg.curve, ...patch };
        this.setCfg(id, { ...cfg, curve });
    }

    private loadDefaultCurve(id: string): void {
        this.setCurve(id, { points: DEFAULT_CURVE_POINTS.map(p => ({ ...p })) });
    }

    private updateCurvePoint(id: string, index: number, patch: Partial<CurvePoint>): void {
        const points = (this.cfgOf(id).curve?.points ?? []).map((p, i) => (i === index ? { ...p, ...patch } : p));
        this.setCurve(id, { points });
    }

    private addCurvePoint(id: string): void {
        this.setCurve(id, { points: [...(this.cfgOf(id).curve?.points ?? []), { ...NEW_POINT }] });
    }

    private removeCurvePoint(id: string, index: number): void {
        this.setCurve(id, { points: (this.cfgOf(id).curve?.points ?? []).filter((_, i) => i !== index) });
    }

    private updateRule(id: string, index: number, patch: Partial<ConditionRule>): void {
        const cfg = this.cfgOf(id);
        const rules = (cfg.rules ?? []).map((r, i) => (i === index ? { ...r, ...patch } : r));
        this.setCfg(id, { ...cfg, rules });
    }

    private addRule(id: string): void {
        const cfg = this.cfgOf(id);
        this.setCfg(id, { ...cfg, rules: [...(cfg.rules ?? []), { ...NEW_RULE }] });
    }

    private removeRule(id: string, index: number): void {
        const cfg = this.cfgOf(id);
        this.setCfg(id, { ...cfg, rules: (cfg.rules ?? []).filter((_, i) => i !== index) });
    }

    /** Sensible defaults when the user switches a rule to a new effect. */
    private changeRuleEffect(id: string, index: number, effect: RuleEffectType): void {
        const patch: Partial<ConditionRule> = { effect };
        if (effect === "raisePower") {
            patch.power = this.cfgOf(id).rules?.[index]?.power ?? 85;
        } else if (effect === "sfc") {
            patch.sfc = true;
        } else if (effect === "setState") {
            patch.target = this.cfgOf(id).rules?.[index]?.target ?? "";
            patch.value = true;
        }
        this.updateRule(id, index, patch);
    }

    /** Value cell for one rule: depends on the effect (raise → %, sfc → on/off, setState → target+value). */
    private renderRuleValue(id: string, rule: ConditionRule, index: number): React.JSX.Element | null {
        if (rule.effect === "raisePower") {
            return (
                <TextField
                    type="number"
                    size="small"
                    variant="standard"
                    slotProps={{ htmlInput: { min: 0, max: 100, step: 5 } }}
                    value={rule.power ?? 0}
                    onChange={e => this.updateRule(id, index, { power: clampPercent(Number(e.target.value)) })}
                    sx={{ width: 70 }}
                />
            );
        }
        if (rule.effect === "sfc") {
            return (
                <Select
                    size="small"
                    variant="standard"
                    value={rule.sfc ? "on" : "off"}
                    onChange={e => this.updateRule(id, index, { sfc: e.target.value === "on" })}
                >
                    <MenuItem value="on">{I18n.t("on")}</MenuItem>
                    <MenuItem value="off">{I18n.t("off")}</MenuItem>
                </Select>
            );
        }
        if (rule.effect === "setState") {
            return (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 240 }}>
                    {this.renderOidField(rule.target ?? "", v => this.updateRule(id, index, { target: v }), {
                        label: I18n.t("Target state id"),
                    })}
                    <TextField
                        size="small"
                        variant="standard"
                        label={I18n.t("Value (true/false or number)")}
                        value={actuatorValueText(rule.value)}
                        onChange={e => this.updateRule(id, index, { value: parseActuatorValue(e.target.value) })}
                    />
                </Box>
            );
        }
        // boostMax / hold have no extra parameter.
        return <Typography sx={{ color: "text.secondary" }}>—</Typography>;
    }

    /** Phase 12: the temperature curve + smoothing/limits + weather rules editor for one pump. */
    private renderConditions(id: string): React.JSX.Element {
        const cfg = this.cfgOf(id);
        const curve = cfg.curve;
        const rules = cfg.rules ?? [];
        const priority = cfg.conditionPriority ?? "override";
        const curvePoints = (curve?.points ?? [])
            .map((point, index) => ({ point, index }))
            .sort((a, b) => a.point.temp - b.point.temp);
        return (
            <Box sx={{ mt: 3 }}>
                <Typography
                    variant="h6"
                    sx={{ mb: 1 }}
                >
                    {I18n.t("Temperature / weather control")}
                </Typography>
                <Alert
                    severity="info"
                    sx={{ mb: 2 }}
                >
                    {I18n.t(
                        "The water-temperature curve sets the base flow; weather rules can only raise it (or hold / drive an actuator). Point the curve at a real water sensor — the pump's own telemetry.temperature is the device temperature, not the water.",
                    )}
                </Alert>
                <FormControl
                    size="small"
                    sx={{ width: 560, maxWidth: "100%", mb: 2, display: "block" }}
                >
                    <InputLabel
                        id={`wts-${id}`}
                        shrink
                    >
                        {I18n.t("Water temperature sensor")}
                    </InputLabel>
                    <Select
                        labelId={`wts-${id}`}
                        label={I18n.t("Water temperature sensor")}
                        notched
                        displayEmpty
                        value={cfg.waterTempSensor ?? ""}
                        onChange={e => this.setWaterSensor(id, e.target.value)}
                        sx={{ width: "100%" }}
                    >
                        <MenuItem value="">
                            {I18n.t("— none / external sensor (choose in the curve source) —")}
                        </MenuItem>
                        <MenuItem value="temperature">{this.sensorOptionLabel("temperature", 1)}</MenuItem>
                        <MenuItem value="temperature2">{this.sensorOptionLabel("temperature2", 2)}</MenuItem>
                    </Select>
                    <FormHelperText>
                        {I18n.t(
                            "Pick the device sensor that reads the water — compare the live values below with a thermometer you trust. It feeds telemetry.waterTemperature and pre-fills the curve source. For an external sensor, leave this on “none” and choose the object in the curve source.",
                        )}
                    </FormHelperText>
                </FormControl>

                <FormControl
                    size="small"
                    sx={{ mb: 2, minWidth: 360, maxWidth: "100%", display: "block" }}
                >
                    <InputLabel id={`prio-${id}`}>{I18n.t("Curve vs. time windows")}</InputLabel>
                    <Select
                        labelId={`prio-${id}`}
                        label={I18n.t("Curve vs. time windows")}
                        value={priority}
                        onChange={e => this.setPriority(id, e.target.value)}
                        sx={{ minWidth: 360, maxWidth: "100%" }}
                    >
                        <MenuItem value="override">{I18n.t("Curve overrides the active time window")}</MenuItem>
                        <MenuItem value="outsideOnly">{I18n.t("Curve applies only outside the time windows")}</MenuItem>
                    </Select>
                    <FormHelperText>
                        {I18n.t(
                            "Whether the temperature curve replaces the active time window, or only applies outside the windows.",
                        )}
                    </FormHelperText>
                </FormControl>

                <FormControlLabel
                    control={
                        <Switch
                            checked={!!curve?.enabled}
                            onChange={e => this.setCurve(id, { enabled: e.target.checked })}
                        />
                    }
                    label={I18n.t("Water temperature → power curve")}
                />
                {curve?.enabled ? (
                    <Box sx={{ mb: 2 }}>
                        {this.renderOidField(curve.source || "", v => this.setCurve(id, { source: v }), {
                            label: I18n.t("Water temperature source (state id)"),
                            width: 560,
                        })}
                        <FormHelperText sx={{ mb: 1 }}>
                            {I18n.t(
                                "Pre-filled from the sensor above. For an external water sensor, pick its object with the magnifier.",
                            )}
                        </FormHelperText>
                        <Paper
                            variant="outlined"
                            sx={{ mt: 1 }}
                        >
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{I18n.t("Temperature °C")}</TableCell>
                                        <TableCell>{I18n.t("Power %")}</TableCell>
                                        <TableCell padding="none" />
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {curvePoints.length ? (
                                        curvePoints.map(({ point, index }) => (
                                            <TableRow key={index}>
                                                <TableCell>
                                                    <TextField
                                                        type="number"
                                                        size="small"
                                                        variant="standard"
                                                        value={point.temp}
                                                        onChange={e =>
                                                            this.updateCurvePoint(id, index, {
                                                                temp: Number(e.target.value),
                                                            })
                                                        }
                                                        sx={{ width: 80 }}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        type="number"
                                                        size="small"
                                                        variant="standard"
                                                        slotProps={{ htmlInput: { min: 0, max: 100, step: 5 } }}
                                                        value={point.power}
                                                        onChange={e =>
                                                            this.updateCurvePoint(id, index, {
                                                                power: clampPercent(Number(e.target.value)),
                                                            })
                                                        }
                                                        sx={{ width: 80 }}
                                                    />
                                                </TableCell>
                                                <TableCell padding="none">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => this.removeCurvePoint(id, index)}
                                                    >
                                                        <IconDelete fontSize="small" />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell
                                                colSpan={3}
                                                sx={{ color: "text.secondary" }}
                                            >
                                                {I18n.t("No points yet — load the default curve or add your own.")}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </Paper>
                        <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                            <Button
                                startIcon={<IconAdd />}
                                onClick={() => this.addCurvePoint(id)}
                            >
                                {I18n.t("Add point")}
                            </Button>
                            <Button onClick={() => this.loadDefaultCurve(id)}>{I18n.t("Load default curve")}</Button>
                        </Box>
                        {this.renderLimits(id)}
                    </Box>
                ) : null}

                <Typography sx={{ mt: 2, mb: 1, fontWeight: 500 }}>
                    {I18n.t("Weather rules (they can only raise the flow, hold it, or drive an actuator)")}
                </Typography>
                <Paper variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{I18n.t("Source (state id)")}</TableCell>
                                <TableCell>{I18n.t("Compare")}</TableCell>
                                <TableCell>{I18n.t("Threshold")}</TableCell>
                                <TableCell>{I18n.t("Effect")}</TableCell>
                                <TableCell>{I18n.t("Value")}</TableCell>
                                <TableCell padding="none" />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rules.length ? (
                                rules.map((rule, index) => (
                                    <TableRow key={index}>
                                        <TableCell sx={{ minWidth: 240 }}>
                                            {this.renderOidField(rule.source, v =>
                                                this.updateRule(id, index, { source: v }),
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Select
                                                size="small"
                                                variant="standard"
                                                value={rule.cmp}
                                                onChange={e => this.updateRule(id, index, { cmp: e.target.value })}
                                            >
                                                {(Object.keys(CMP_LABELS) as Comparison[]).map(c => (
                                                    <MenuItem
                                                        key={c}
                                                        value={c}
                                                    >
                                                        {CMP_LABELS[c]}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                type="number"
                                                size="small"
                                                variant="standard"
                                                value={rule.threshold}
                                                onChange={e =>
                                                    this.updateRule(id, index, { threshold: Number(e.target.value) })
                                                }
                                                sx={{ width: 80 }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Select
                                                size="small"
                                                variant="standard"
                                                value={rule.effect}
                                                onChange={e => this.changeRuleEffect(id, index, e.target.value)}
                                            >
                                                {EFFECTS.map(eff => (
                                                    <MenuItem
                                                        key={eff}
                                                        value={eff}
                                                    >
                                                        {effectLabel(eff)}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </TableCell>
                                        <TableCell>{this.renderRuleValue(id, rule, index)}</TableCell>
                                        <TableCell padding="none">
                                            <IconButton
                                                size="small"
                                                onClick={() => this.removeRule(id, index)}
                                            >
                                                <IconDelete fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={6}
                                        sx={{ color: "text.secondary" }}
                                    >
                                        {I18n.t(
                                            "No rules — e.g. air temperature ≥ 28 °C → boost to 100 %, or a rain OID = 1 → set an aerator on.",
                                        )}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Paper>
                <Button
                    startIcon={<IconAdd />}
                    onClick={() => this.addRule(id)}
                    sx={{ mt: 1 }}
                >
                    {I18n.t("Add rule")}
                </Button>
            </Box>
        );
    }

    /** The Phase-12 numeric limits (Q_min floor, smoothing, hysteresis, ramp) with help + suggestions. */
    private renderLimits(id: string): React.JSX.Element {
        const cfg = this.cfgOf(id);
        const numField = (opts: {
            label: string;
            key: keyof PumpScheduleConfig;
            value: number | undefined;
            step: number;
            clampPct: boolean;
            placeholder: string;
            helper: string;
        }): React.JSX.Element => (
            <TextField
                type="number"
                size="small"
                label={opts.label}
                placeholder={opts.placeholder}
                helperText={opts.helper}
                slotProps={{
                    htmlInput: { min: 0, max: opts.clampPct ? 100 : undefined, step: opts.step },
                    inputLabel: { shrink: true },
                }}
                value={opts.value ?? ""}
                onChange={e => {
                    const raw = e.target.value;
                    if (raw === "") {
                        this.setLimit(id, opts.key, undefined);
                    } else {
                        const n = Number(raw);
                        this.setLimit(id, opts.key, opts.clampPct ? clampPercent(n) : Math.max(0, n));
                    }
                }}
                sx={{ width: 270, maxWidth: "100%" }}
            />
        );
        return (
            <Box sx={{ mt: 2 }}>
                <Typography sx={{ mb: 1, fontWeight: 500 }}>{I18n.t("Fine-tuning (optional)")}</Typography>
                <Box sx={{ display: "flex", gap: 3, rowGap: 2, flexWrap: "wrap" }}>
                    {numField({
                        label: I18n.t("Minimum power %"),
                        key: "minPower",
                        value: cfg.minPower,
                        step: 5,
                        clampPct: true,
                        placeholder: "40",
                        helper: I18n.t("Lower limit — the flow never drops below this. Suggested 35–40 %."),
                    })}
                    {numField({
                        label: I18n.t("Maximum power %"),
                        key: "maxPower",
                        value: cfg.maxPower,
                        step: 5,
                        clampPct: true,
                        placeholder: "100",
                        helper: I18n.t(
                            "Upper limit — the flow never exceeds this, even on boost or fail-safe. E.g. 90 % for a pump that only runs that high.",
                        ),
                    })}
                    {numField({
                        label: I18n.t("Temperature smoothing (hours)"),
                        key: "smoothingHours",
                        value: cfg.smoothingHours,
                        step: 1,
                        clampPct: false,
                        placeholder: "12",
                        helper: I18n.t(
                            "Averages the temperature so short spikes don't re-adjust the pump. Suggested 12–24 · 0 = off.",
                        ),
                    })}
                    {numField({
                        label: I18n.t("Hysteresis (°C)"),
                        key: "hysteresisK",
                        value: cfg.hysteresisK,
                        step: 0.5,
                        clampPct: false,
                        placeholder: "1",
                        helper: I18n.t(
                            "Re-maps the curve only after the temperature moved by this much. Suggested 0.5–1 · 0 = off.",
                        ),
                    })}
                    {numField({
                        label: I18n.t("Max. change (% per hour)"),
                        key: "rampPercentPerHour",
                        value: cfg.rampPercentPerHour,
                        step: 5,
                        clampPct: false,
                        placeholder: "15",
                        helper: I18n.t(
                            "Limits how fast the power may change (gentle ramp). Suggested 10–20 · 0 = instant.",
                        ),
                    })}
                </Box>
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

    /** The object-picker dialog, rendered on top of the editor when open. */
    private renderPicker(): React.JSX.Element | null {
        const picker = this.state.picker;
        if (!picker) {
            return null;
        }
        return (
            <SelectID
                imagePrefix="../.."
                socket={this.props.oContext.socket}
                theme={this.props.oContext.theme}
                themeType={this.props.oContext.themeType}
                themeName={this.props.oContext._themeName}
                lang={I18n.getLanguage()}
                types={["state"]}
                selected={picker.selected}
                onClose={() => this.setState({ picker: null })}
                onOk={selected => {
                    const chosen = Array.isArray(selected) ? selected[0] : selected;
                    if (chosen) {
                        picker.onPick(chosen);
                    }
                    this.setState({ picker: null });
                }}
            />
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
        return (
            <>
                {this.renderPumpEditor(id)}
                {this.renderPicker()}
            </>
        );
    }
}

export default PondpumpScheduler;
