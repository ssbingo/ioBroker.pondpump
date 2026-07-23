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

**Phase 1 — cloud read-only.** The adapter polls the OASE cloud inventory and shows the gateway plus both pumps
with live speed/on-off/status as read-only states. Writing (pump control) follows in phase 2, the local transport
in phase 3.

**Cloud authentication:** the OASE cloud uses **Azure AD B2C** (`account.oase.com`). The adapter authenticates with the
headless-friendly **refresh-token grant**: capture a refresh token once from an OASE app login and paste it into the
adapter settings (encrypted). The adapter exchanges it for short-lived access tokens and transparently rotates the
refresh token. **Your account password is never entered into or stored by the adapter.** Without a refresh token the
adapter starts but reports `info.connection = false` with a clear warning.

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

- (ssbingo) Live telemetry: pump power/speed (and the raw sensors) are now read live through the SendONetPacket tunnel (0x5500 sensor read) instead of the minutes-stale cloud inventory, so they track speed changes within one poll
- (ssbingo) Diagnostics: still-unmapped RDM sensors are exposed as raw read-only states under `telemetry.raw.sensorN` so their meaning can be classified (RDM DEVICE_INFO reports 11 sensors; the cloud only pushes a few values)
- (ssbingo) Phase 4 (telemetry): pump power (W) and motor speed (rpm) are decoded from the RDM sensor values (calibrated against the OASE app) and exposed as `telemetry.power` / `telemetry.speed`
- (ssbingo) Pump objects are now named after the pump's controller name (read from the DeviceTable telemetry, e.g. "Main flow" plus the device number) instead of a bare device number
- (ssbingo) New stylized adapter icon (own vector illustration, not the product photo)
- (ssbingo) Phase 2 (cloud control): pump speed and on/off are now writable and sent to the controller via the cloud `SendONetPacket` tunnel. The ONet packet builder is verified byte-for-byte against real app commands (set-dimmer 0x6400 = [control address, 0–255]; on/off 0x5200); writes are scaled (0–100 % ↔ 0–255), confirmed with ack:true and reconciled by a follow-up poll
- (ssbingo) Extensive, component-tagged logging (`[config]`, `[startup]`, `[conn]`, `[poll]`, `[cloud/auth]`, `[cloud/http]`, `[shutdown]`) so any failure can be pinpointed from the logs; poll cycles are numbered with timing, connection changes and per-pump values are logged, and secrets are never logged (only presence/length)
- (ssbingo) Cloud auth: real Azure AD B2C refresh-token grant (account.oase.com); refresh token entered once (encrypted), access tokens refreshed and rotated automatically; account password never used
- (ssbingo) Phase 1 (cloud read-only): CloudClient with bearer session handling, defensive inventory parser matched to the real wire format, gateway/pump objects with live speed and status states, chained poll loop
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