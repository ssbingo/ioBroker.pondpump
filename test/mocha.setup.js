"use strict";

// Makes ts-node ignore warnings, so mocha --watch does work
process.env.TS_NODE_IGNORE_WARNINGS = "TRUE";
// Sets the correct tsconfig for testing
process.env.TS_NODE_PROJECT = "tsconfig.json";
// Make ts-node respect the "include" key in tsconfig.json
process.env.TS_NODE_FILES = "TRUE";
// Run tests via ts-node as CommonJS: the node22 base sets module "nodenext" +
// moduleResolution "node16", which forces file extensions on relative ESM imports.
// Compiling tests as CommonJS lets extensionless relative imports resolve as before.
// (Type-checking is still done separately by `npm run check`; the build uses esbuild.)
process.env.TS_NODE_TRANSPILE_ONLY = "TRUE";
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "commonjs", moduleResolution: "node" });

// Don't silently swallow unhandled rejections
process.on("unhandledRejection", (e) => {
    throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
const sinonChai = require("sinon-chai");
const chaiAsPromised = require("chai-as-promised");
const { should, use } = require("chai");

should();
use(sinonChai);
use(chaiAsPromised);