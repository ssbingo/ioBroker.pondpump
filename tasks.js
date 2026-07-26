/*
 * Frontend builds for the pondpump adapter.
 *
 * Two independent React + Vite + Module-Federation bundles live in this repo and are built into the
 * shipped adapter, both committed to git so the adapter/CI build (`build-adapter ts`) never needs the
 * Vite toolchain. Run these only when the respective sources change:
 *
 *   npm run build:widgets   -> src-widgets/ -> widgets/pondpump/   (vis-2 widgets, Phase 6)
 *   npm run build:admin     -> src-admin/   -> admin/custom/       (jsonConfig scheduler, Phase 9)
 */
const { existsSync } = require('node:fs');
const adapterName = require('./package.json').name.replace('iobroker.', '');
const { deleteFoldersRecursive, copyFiles, npmInstall, buildReact } = require('@iobroker/build-tools');

function buildWidgets() {
    const SRC = 'src-widgets/';
    const src = `${__dirname}/${SRC}`;
    deleteFoldersRecursive(`${src}build`);
    deleteFoldersRecursive(`${__dirname}/widgets`);
    const npmPromise = existsSync(`${src}/node_modules`) ? Promise.resolve() : npmInstall(src);
    return npmPromise
        .then(() => buildReact(src, { rootDir: __dirname, vite: true }))
        .then(() => {
            copyFiles([`${SRC}build/customWidgets.js`], `widgets/${adapterName}`);
            copyFiles([`${SRC}build/icon-set.json`], `widgets/${adapterName}`);
            copyFiles([`${SRC}build/assets/*.*`], `widgets/${adapterName}/assets`);
            copyFiles([`${SRC}build/img/*`], `widgets/${adapterName}/img`);
        });
}

function buildAdmin() {
    const SRC = 'src-admin/';
    const src = `${__dirname}/${SRC}`;
    deleteFoldersRecursive(`${src}build`);
    deleteFoldersRecursive(`${__dirname}/admin/custom`);
    const npmPromise = existsSync(`${src}/node_modules`) ? Promise.resolve() : npmInstall(src);
    return npmPromise
        .then(() => buildReact(src, { rootDir: __dirname, vite: true }))
        .then(() => {
            copyFiles([`${SRC}build/customComponents.js`], 'admin/custom');
            copyFiles([`${SRC}build/assets/*.*`], 'admin/custom/assets');
        });
}

if (process.argv.includes('--admin')) {
    buildAdmin().catch(e => {
        console.error(`Cannot build admin: ${e}`);
        process.exit(1);
    });
} else if (process.argv.includes('--typescript') || process.argv.length === 2) {
    buildWidgets().catch(e => {
        console.error(`Cannot build widgets: ${e}`);
        process.exit(1);
    });
}
