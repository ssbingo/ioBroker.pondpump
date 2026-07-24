/*
 * Widget build for the bundled vis-2 widgets (Phase 6).
 *
 * The pondpump adapter ships its own vis-2 widget set. The widget sources live in `src-widgets/`
 * (React + Vite + Module Federation) and are built into `widgets/pondpump/` — the folder that is
 * declared via `common.visWidgets` in io-package.json and shipped in the npm package. The built
 * output is committed to git, so the adapter/CI build (`build-adapter ts`) never needs the Vite
 * toolchain; run this task only when the widget sources change:
 *
 *   npm run build:widgets
 */
const { existsSync } = require('node:fs');
const adapterName = require('./package.json').name.replace('iobroker.', '');
const { deleteFoldersRecursive, copyFiles, npmInstall, buildReact } = require('@iobroker/build-tools');

const SRC = 'src-widgets/';
const src = `${__dirname}/${SRC}`;

function widgetsClean() {
    deleteFoldersRecursive(`${src}build`);
    deleteFoldersRecursive(`${__dirname}/widgets`);
}

function widgetsCopyAllFiles() {
    copyFiles([`${SRC}build/customWidgets.js`], `widgets/${adapterName}`);
    copyFiles([`${SRC}build/icon-set.json`], `widgets/${adapterName}`);
    copyFiles([`${SRC}build/assets/*.*`], `widgets/${adapterName}/assets`);
    copyFiles([`${SRC}build/img/*`], `widgets/${adapterName}/img`);
}

if (process.argv.includes('--typescript') || process.argv.length === 2) {
    widgetsClean();
    let npmPromise;
    if (existsSync(`${src}/node_modules`)) {
        npmPromise = Promise.resolve();
    } else {
        npmPromise = npmInstall(src);
    }
    npmPromise
        .then(() => buildReact(src, { rootDir: __dirname, vite: true }))
        .then(() => widgetsCopyAllFiles())
        .catch(e => {
            console.error(`Cannot build widgets: ${e}`);
            process.exit(1);
        });
}
