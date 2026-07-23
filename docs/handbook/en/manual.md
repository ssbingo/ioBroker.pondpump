---
title: "ioBroker.pondpump — User Manual"
---

# ioBroker.pondpump — User Manual

*A step-by-step guide for controlling and monitoring **OASE AquaMax Eco Titanium** pond pumps in
ioBroker — written so that newcomers can get it running too.*

---

## 1. What this adapter does

The **pondpump** adapter connects ioBroker to your **OASE AquaMax Eco Titanium** pond pump(s)
through the **OASE Garden Controller Cloud (EGC)** gateway. Once it is running you can, from
ioBroker (and therefore from VIS, scripts, scenes, Alexa, etc.):

- **switch each pump on and off**,
- **set the pump speed** from 0 – 100 %,
- **read live telemetry**: power (W), motor speed (rpm), water/electronics temperature (°C) and
  mains voltage (V),
- **see the connection and device status**.

Each pump keeps the name you gave it in the OASE app (e.g. *Main flow*, *UVC bypass*), so you can
recognise it in the object tree.

> **Good to know:** the adapter talks to the **controller** (item 55317), which in turn talks to
> the pumps (item 73656). It is a separate project from the community adapter for the OASE socket
> controllers — it targets the smart pond pumps.

---

## 2. Before you start — what you need

| You need | Why |
| --- | --- |
| A running **ioBroker** installation (js-controller, Node.js ≥ 22) | The platform this adapter runs on |
| An **OASE Garden Controller Cloud** (EGC, item 55317), set up in the OASE app | The gateway the adapter connects to |
| One or two **OASE AquaMax Eco Titanium** pumps (item 73656), paired in the app | The devices being controlled |
| Your pumps **already working in the OASE app** | The adapter uses the same cloud account |
| A **cloud refresh token** (see chapter 4) | How the adapter logs in without your password |

> **Tip:** get everything working in the **OASE app first**. If the app can switch the pumps, the
> adapter can too.

---

## 3. Installing the adapter

The adapter is published on npm as **`iobroker.pondpump`**. Until it is part of the official
ioBroker repository, install it from its source:

1. Open the ioBroker **Admin** UI.
2. Go to **Adapters** and switch on **Expert mode** (the wizard-hat icon, top right).
3. Click the **cat/octocat "Install from own URL"** icon.
4. Enter one of:
   - the npm package name **`iobroker.pondpump`**, or
   - the GitHub URL of a release tarball if you were given one.
5. Confirm and wait until the adapter appears in the list.
6. Click the **+** on the pondpump tile to create an **instance** (`pondpump.0`).

The instance configuration opens automatically. Leave it for a moment — first we need a refresh
token (next chapter).

---

## 4. Getting a cloud refresh token (the one tricky step)

The OASE cloud uses **Microsoft Azure AD B2C** for login. For security the adapter does **not**
store your account password. Instead it uses a **refresh token** — a long, one-time credential that
your OASE app receives when it logs in. You capture that token **once** and paste it into the
adapter; from then on the adapter refreshes it automatically.

**How to capture it (one-time):**

1. Install a TLS-inspecting proxy on your computer, e.g. **mitmproxy** (free), and trust its
   certificate on the phone that runs the OASE app.
2. Route the phone's traffic through the proxy.
3. **Log out and log back in** in the OASE app.
4. In the proxy, look for a request to **`account.oase.com`** ending in **`/oauth2/v2.0/token`**.
5. In that request's form body, copy the value of **`refresh_token`** (a long string).

Paste this value into the adapter setting **"Cloud refresh token"** (chapter 5).

> **Your account password is never entered into the adapter.** The refresh token can be revoked at
> any time by logging out everywhere in the OASE app.
>
> **If you get stuck here:** this is the only advanced step. Once the token is in, everything else is
> point-and-click.

---

## 5. Configuring the instance

Open **Instances → pondpump.0 → settings** (the wrench icon). The settings are grouped:

### Connection

| Setting | What to enter |
| --- | --- |
| **Connection mode** | `cloud` for the normal (internet) path. `local` / `both` are for the in-house LAN path (chapter 8, experimental). |
| **Poll interval** | How often (seconds) the adapter reads status. Default **30**. Minimum 5. |

### Cloud

| Setting | What to enter |
| --- | --- |
| **Cloud refresh token** | The token from chapter 4 (stored encrypted). |
| *Advanced (base URL, token URL, client id, scope)* | Leave at their defaults unless OASE changes their cloud. |

### Local (only for `local` / `both`)

| Setting | What to enter |
| --- | --- |
| **Controller IP** | The EGC controller's address in your network. |
| **Device password** | The 64-character device password (advanced; see chapter 8). |
| **Bind address / Port** | The ioBroker host address and TCP port the controller connects back to (default 5999). |

Click **Save**. The instance starts and, after a few seconds, **`info.connection`** should turn
**true**.

---

## 6. The objects the adapter creates

After the first successful poll you will find these under **`pondpump.0`**:

```
pondpump.0
├── info.connection            (true when connected)
├── <gateway>                  the EGC controller (device)
│   ├── serialNumber, firmware
│   └── online                 (controller reachable)
└── pumps.<deviceNumber>       one device per pump, named after the app
    ├── control.on             ← switch on/off        (writable)
    ├── control.speed          ← speed 0–100 %        (writable)
    ├── control.speedRaw       ← speed 0–255 (raw)    (writable)
    ├── status.connected       pump reachable
    ├── status.fcStatus        controller status text
    └── telemetry
        ├── power              live power in W
        ├── speed              live motor speed in rpm
        ├── temperature        °C
        ├── temperature2       °C (second sensor)
        ├── voltage            mains voltage in V
        └── raw.sensorN        still-unclassified sensor values
```

---

## 7. Controlling and reading the pumps

**Switch a pump on/off** — set `pumps.<deviceNumber>.control.on` to `true` / `false`.

**Set the speed** — write a percentage (0–100) to `pumps.<deviceNumber>.control.speed`. The adapter
sends the command, confirms it, and re-reads the pump shortly after so the states reflect reality.

**Read telemetry** — the values under `telemetry` update live on every poll (fast values like power
and rpm each cycle, slower ones like temperature every few cycles to keep the cloud happy). Use them
in VIS, charts, or scripts.

Example (JavaScript adapter):

```javascript
// Run the main flow pump at 70 %
setState('pondpump.0.pumps.1234567.control.speed', 70);

// Log its live power
on('pondpump.0.pumps.1234567.telemetry.power', (obj) => {
    log('Pump power: ' + obj.state.val + ' W');
});
```

---

## 8. Local mode (in-house LAN) — experimental

The long-term goal is to control the pumps **without the internet**, directly over your LAN. The
foundation is in place (connection mode `local`):

- ioBroker runs a small **TLS server**; the adapter sends a **UDP wake** packet to the controller,
  which then **connects back** and authenticates with the **device password**.

To try it you need the **controller's IP**, the **64-character device password**, and an open
network path (UDP 5959 out to the controller, TCP 5999 back to ioBroker). Live pump data over the
local channel is still being finished — for everyday use, stay on **`cloud`** mode for now.

---

## 9. Troubleshooting

| Symptom | What to check |
| --- | --- |
| `info.connection` stays **false** | Is a **refresh token** entered? Capture a fresh one (chapter 4) — tokens can expire if you log in elsewhere. |
| Log says **AUTH FAILED** | The refresh token is invalid/expired → capture a new one. |
| No pumps appear | Are the pumps online in the **OASE app**? The adapter mirrors the cloud inventory. |
| Commands do nothing | Wait for the **first successful poll** (the adapter learns the pump addressing then). Check the log. |
| Want more detail | Set the instance **log level to `debug`** — every step is logged with a tag like `[poll]`, `[cloud/auth]`, `[cloud/cmd]`. Secrets are never logged. |

The log lines are tagged by component so any problem can be pinpointed. When reporting an issue,
include the debug log around the failure.

---

## 10. Privacy & safety

- Your **OASE account password** is never entered into or stored by the adapter.
- The **refresh token** and **device password** are stored **encrypted** in ioBroker.
- The adapter only talks to the OASE cloud (or, in local mode, directly to your controller).
- Use at your own risk — this is an unofficial community project, not affiliated with OASE GmbH.

---

*Questions or problems? Open an issue at the project's GitHub repository. Happy pond-keeping!* 🐟
