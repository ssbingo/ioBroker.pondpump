![Logo](admin/pondpump.png)
# ioBroker.pondpump

[![NPM version](https://img.shields.io/npm/v/iobroker.pondpump.svg)](https://www.npmjs.com/package/iobroker.pondpump)
[![Downloads](https://img.shields.io/npm/dm/iobroker.pondpump.svg)](https://www.npmjs.com/package/iobroker.pondpump)
![Number of Installations](https://iobroker.live/badges/pondpump-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/pondpump-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.pondpump.png?downloads=true)](https://nodei.co/npm/iobroker.pondpump/)

**Tests:** ![Test and Release](https://github.com/ssbingo/ioBroker.pondpump/workflows/Test%20and%20Release/badge.svg)

---

<p align="center">
  <a href="https://www.buymeacoffee.com/ssbingo"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=ssbingo&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>
</p>

---

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

- **Phase 1 — cloud read-only** ✓ polls the OASE cloud inventory; gateway plus both pumps with live status
- **Phase 2 — cloud control** ✓ pump on/off and speed are writable via the cloud tunnel
- **Phase 4 — live telemetry** ✓ power, motor speed, temperature and mains voltage read live each poll
- **Phase 3 — local (LAN) transport** ✓ connection mode `local` runs the whole adapter over the local network
  without the cloud: inventory, live telemetry and on/off + speed control, all over the LAN

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

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**

- (ssbingo) Phase 3 — local (LAN) transport is complete: connection mode `local` runs the whole adapter over the local network without the cloud. The adapter wakes the controller over UDP, the controller connects back over TLS (legacy cipher, self-signed certificate), authenticates with the device password, then reads the gateway and pumps, polls live telemetry (power, speed, temperature, voltage) and controls on/off and speed — all over the LAN. The poll and command path is transport-agnostic (local preferred, cloud fallback), and on/off is derived from live telemetry. Note: the speed setpoint value is not read back over the local channel yet
- (ssbingo) Documentation: multilingual README docs in 11 languages (under `doc/<lang>/`), beginner handbooks in English and German with a step-by-step mitmproxy guide (available as PDF), a Documentation section and CHANGELOG_OLD.md

### 0.0.2 (2026-07-23)

- (ssbingo) Phase 1 – cloud read-only: connects to the OASE Garden Controller Cloud (Azure AD B2C refresh-token auth), discovers the gateway and pumps, and polls live speed and status
- (ssbingo) Phase 2 – cloud control: pump on/off and speed (0–100 %) are writable and sent through the cloud SendONetPacket tunnel, verified byte-for-byte against the app
- (ssbingo) Phase 4 – live telemetry: power (W), motor speed (rpm), temperature (°C) and mains voltage (V) are read live each poll; still-unmapped sensors are exposed as raw values for classification
- (ssbingo) Pumps are named after their controller name; new stylized adapter icon (own illustration, not the product photo)
- (ssbingo) Extensive, component-tagged logging so any failure can be pinpointed from the logs, with secrets never logged

## Documentation

📖 **Beginner's handbook:** [English](doc/handbook/en/manual.md) ([PDF](doc/handbook/en/manual.pdf)) ·
[Deutsch](doc/handbook/de/manual.md) ([PDF](doc/handbook/de/manual.pdf))

Translated documentation:

- 🇩🇪 [Deutsche Dokumentation](doc/de/README.md)
- 🇷🇺 [Документация на русском](doc/ru/README.md)
- 🇳🇱 [Nederlandse documentatie](doc/nl/README.md)
- 🇫🇷 [Documentation française](doc/fr/README.md)
- 🇮🇹 [Documentazione italiana](doc/it/README.md)
- 🇪🇸 [Documentación en español](doc/es/README.md)
- 🇵🇱 [Dokumentacja polska](doc/pl/README.md)
- 🇵🇹 [Documentação portuguesa](doc/pt/README.md)
- 🇺🇦 [Документація українською](doc/uk/README.md)
- 🇨🇳 [简体中文文档](doc/zh-cn/README.md)

Older changelogs can be found in [CHANGELOG_OLD.md](CHANGELOG_OLD.md).

## License
MIT License

Copyright (c) 2026 ssbingo <s.sternitzke@online.de>

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