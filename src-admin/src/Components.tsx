import PondpumpScheduler from "./PondpumpScheduler";

// Exposed via module federation as "ConfigCustomPondpumpSet/Components/<name>" and referenced from
// admin/jsonConfig.json ("type": "custom", "name": ".../Components/PondpumpScheduler").
export default { PondpumpScheduler };
