import react from "@vitejs/plugin-react";
import commonjs from "vite-plugin-commonjs";
import vitetsConfigPaths from "vite-tsconfig-paths";
import { federation } from "@module-federation/vite";
import { moduleFederationShared } from "@iobroker/gui-components/modulefederation.admin.config";
import { readFileSync } from "node:fs";
const pack = JSON.parse(readFileSync("./package.json").toString());

const config = {
    plugins: [
        federation({
            manifest: true,
            name: "ConfigCustomPondpumpSet",
            filename: "customComponents.js",
            exposes: {
                "./Components": "./src/Components",
            },
            remotes: {},
            shared: moduleFederationShared(pack),
        }),
        react(),
        vitetsConfigPaths(),
        commonjs(),
    ],
    server: {
        port: 3000,
        proxy: {
            "/files": "http://localhost:8081",
            "/adapter": "http://localhost:8081",
            "/session": "http://localhost:8081",
            "/lib": "http://localhost:8081",
        },
    },
    base: "./",
    build: {
        target: "chrome89",
        outDir: "./build",
        rollupOptions: {
            onwarn(warning: { code: string }, warn: (warning: { code: string }) => void): void {
                if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
                    return;
                }
                warn(warning);
            },
        },
    },
};

export default config;
