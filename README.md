![Logo](admin/pondpump.png)
# ioBroker.pondpump

[![NPM version](https://img.shields.io/npm/v/iobroker.pondpump.svg)](https://www.npmjs.com/package/iobroker.pondpump)
[![Downloads](https://img.shields.io/npm/dm/iobroker.pondpump.svg)](https://www.npmjs.com/package/iobroker.pondpump)
![Number of Installations](https://iobroker.live/badges/pondpump-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/pondpump-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.pondpump.png?downloads=true)](https://nodei.co/npm/iobroker.pondpump/)

**Tests:** ![Test and Release](https://github.com/ssbingo/ioBroker.pondpump/workflows/Test%20and%20Release/badge.svg)

## pondpump adapter for ioBroker

Control and monitor **OASE AquaMax Eco Titanium** pond pumps via the **OASE Garden Controller Cloud (EGC)** — locally and via cloud.

Manufacturer product pages:

- [OASE AquaMax Eco Titanium](https://www.oase.com/) (pond pump, item 73656)
- [OASE Garden Controller Cloud](https://www.oase.com/) (EGC gateway, item 55317)

### Disclaimer

This is an **unofficial community project**. It is **not affiliated with, endorsed by, or supported by OASE GmbH** in any way.
"OASE", "AquaMax" and related product names are trademarks of OASE GmbH and are used here solely to describe device compatibility.
The communication protocol was analyzed independently — use this adapter at your own risk.

Credits: [mr-suw/ioBroker.oasecontrol](https://github.com/mr-suw/ioBroker.oasecontrol) (adapter for the EGC socket
controllers, FM-Master EGC) served as a valuable protocol reference. No code was copied; this adapter targets the
smart pond pumps and was written from scratch.

### Supported hardware

| Device | Item no. | Role |
| --- | --- | --- |
| OASE Garden Controller Cloud (EGC) | 55317 | Gateway (`GatewayCloud`) |
| OASE AquaMax Eco Titanium | 73656 | Pond pump (`GardenPump`) |

### Project status

**Phase 0 — compliant TypeScript skeleton.** The adapter starts and stops cleanly (incl. compact mode) but does not
talk to any device yet. Next: **Phase 1 — cloud read-only** (pump status/speed visible in ioBroker).

### Configuration

All settings are available in the Admin UI (JSON config):

| Setting | Description |
| --- | --- |
| Connection mode | `cloud`, `local` or `both` (local preferred) |
| Poll interval | Polling interval in seconds (default 30) |
| Cloud user / password | OASE cloud account credentials (password stored encrypted) |
| Controller IP | IP address of the EGC gateway (local mode) |
| Device password | Device password for local authentication (stored encrypted) |
| Bind address / port | Local TLS server the controller connects back to |

### Development

```bash
npm install        # install dependencies
npm run build      # compile TypeScript (esbuild + type check)
npm run lint       # ESLint 9 (@iobroker/eslint-config)
npm test           # unit + package tests
npm run test:integration  # adapter start/stop in a real js-controller sandbox
```

Releases are created with `npm run release` (release-script) and published automatically by GitHub Actions on `v*` tags.

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**

- (ssbingo) initial release

## License
MIT License

Copyright (c) 2026 ssbingo <silvio.sternitzke@googlemail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.