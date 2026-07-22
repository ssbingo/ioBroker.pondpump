/*
 * Created with @iobroker/create-adapter v3.1.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";

class Pondpump extends utils.Adapter {
    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: "pondpump",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("message", this.onMessage.bind(this)); // Phase 1+: cloud login / discovery assist
        this.on("unload", this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        // Reset the connection indicator during startup
        await this.setState("info.connection", false, true);

        // Validate configuration (values come from admin/jsonConfig.json, mirrored in io-package.json -> native)
        const mode = this.config.connectionMode;
        if (mode !== "cloud" && mode !== "local" && mode !== "both") {
            this.log.error(`Invalid connection mode: ${JSON.stringify(mode)} — please check the adapter configuration`);
            return;
        }
        if ((mode === "cloud" || mode === "both") && (!this.config.cloudUser || !this.config.cloudPassword)) {
            this.log.warn("Cloud mode selected, but the cloud credentials are not configured yet");
        }
        if ((mode === "local" || mode === "both") && (!this.config.ip || !this.config.devicePassword)) {
            this.log.warn("Local mode selected, but controller IP / device password are not configured yet");
        }

        this.log.info(
            `Adapter started in "${mode}" mode (poll interval: ${this.config.pollInterval}s) — ` +
                "transports are implemented in the next project phases",
        );

        // Phase 1+: create CloudClient / LocalClient here, connect, create device objects
        // and start the chained-setTimeout poll loop.
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - Callback function
     */
    private onUnload(callback: () => void): void {
        try {
            // Phase 1+: close cloud session, TLS server and UDP sockets here.
            // Timers created via this.setTimeout / this.setInterval are cancelled automatically on unload.
            callback();
        } catch (error) {
            this.log.error(`Error during unloading: ${(error as Error).message}`);
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes.
     *
     * @param id - State ID
     * @param state - State object
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (!state || state.ack) {
            // ack=true values are confirmations from the device (or deletions) — not commands, ignore them
            return;
        }
        // Phase 2+: forward commands (speed, on/off) to the active client and confirm with ack=true
        this.log.debug(`Command received for ${id}: ${JSON.stringify(state.val)}`);
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Pondpump(options);
} else {
    // otherwise start the instance directly
    (() => new Pondpump())();
}
