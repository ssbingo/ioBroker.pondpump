# CLAUDE.md — Projektkontext für den ioBroker-Adapter (Arbeitstitel `pondpump`)

> Diese Datei wird von Claude Code in VS Code automatisch als Projektkontext geladen.
> Sie fasst Ziel, Entscheidungen und die **zwingend einzuhaltenden** ioBroker-Regeln zusammen
> und verweist auf die Detaildokumente unter `docs/context/`.

## Was wir bauen
Ein **eigener ioBroker-Adapter** zur lokalen und/oder cloud-basierten Steuerung + Auswertung von
**OASE AquaMax Eco Titanium** Teichpumpen (Artikel 73656, `deviceType: GardenPump`) über den
**OASE Garden Controller Cloud** (Artikel 55317, intern „EGC Controller Cloud", `GatewayCloud`).
Bewusst getrennt vom vorhandenen Community-Adapter `mr-suw/ioBroker.oasecontrol`, der nur die
**Steckdosen-Controller (FM-Master EGC)** abdeckt.

## Grundsatzentscheidungen (verbindlich)
- **Verbindung:** `connectionType: both` — Cloud zuerst (schneller Erfolg), **lokal als Endziel** („hausintern").
- **Sprache:** **TypeScript**.
- **Veröffentlichung:** vorerst **privates GitHub-Repo**, später ggf. **offizielles ioBroker-Repo**.
- **Code-Basis:** **komplett neu geschrieben** — mr-suws Projekt nur als Erkenntnis-Referenz, kein Code-Copy.
- **Name:** Arbeitstitel `pondpump` (Platzhalter, **ohne „oase"**). Final vor Release wählen + Eindeutigkeit im ioBroker-Repo prüfen. Anzeigename separat via `titleLang`.

## Aktueller Stand & nächster Schritt
Planung abgeschlossen. **Nächster Schritt: Phase 0** — TypeScript-Gerüst via `@iobroker/create-adapter`,
regelkonforme `io-package.json` (11 Sprachen), `admin/jsonConfig.json`, GitHub-Actions-CI, ESLint 9;
leerer Adapter muss sauber starten/stoppen (Compact-Mode-Test). Danach **Phase 1: Cloud read-only**.
Phasenplan im Detail: `docs/context/04-project-plan.md`.

## ioBroker-Compliance-Skill (mitgeliefert)
Der vollständige, aufrufbare Compliance-Skill liegt unter **`.claude/skills/iobroker-adapter-dev/`**
(SKILL.md + references/). Claude Code erkennt ihn automatisch — bei jeder Arbeit an `io-package.json`,
Release, Changelog, States/Rollen, CI, ESLint oder README **anwenden**.

## HARTE ioBroker-Regeln — beim Coden IMMER einhalten
(Vollständig im Skill `.claude/skills/iobroker-adapter-dev/`; Kurzverweis `docs/context/03-iobroker-compliance.md`.)

- **States brauchen eine gültige Rolle** aus der offiziellen Liste — **nie** die generische Rolle `state`.
- **Objekthierarchie** `device → channel → folder → state`; ein `state` hat **nie** Kind-Objekte.
- Objekte mit **`setObjectNotExistsAsync` / `extendObjectAsync`** anlegen — **nie** plain `setObject` (überschreibt History-/Custom-Settings).
- **`ack`-Logik:** Adapter setzt bestätigte/gelesene Werte mit `ack:true`; in `onStateChange` nur `ack:false` (echte Kommandos) verarbeiten, `ack:true` ignorieren.
- **`onUnload`:** ALLE Ressourcen freigeben (TLS-Server, UDP-Sockets, Timer/Intervalle). Sonst bricht Compact-Mode.
- **`adapter.setTimeout` / `adapter.setInterval`** verwenden (auto-cancel bei Unload); **kein `process.exit()`** → `adapter.terminate()`.
- **Polling:** kein `setInterval` mit externen Requests → **verkettetes `setTimeout`** am Ende jedes Polls, mit Timeout + Fehlerbehandlung.
- **`info.connection`** als `instanceObjects` deklarieren und bei TLS/Cloud-Status pflegen (true/false).
- **Passwörter** in `io-package.json` via `encryptedNative` + `protectedNative` (dep `js-controller >=3.0.0`, globalDep `admin >=4.0.9`).
- **Config-Feldnamen:** Ziel-IP = `ip`, Bind = `bind`, Port = `port` (Pflichtnamen).
- **io-package.json:** `titleLang` statt `title` (deprecated); `desc` + `titleLang` in **11 Sprachen**; `common.news` = **genau ein** Eintrag, 11 Sprachen; `type: garden`, `connectionType: both`, `dataSource: poll`, `mode: daemon`.
- **Tooling:** ESLint **9** + `@iobroker/eslint-config` (`eslint.config.mjs`); Tests via `@iobroker/testing` (**kein mocha**); CI mit 3 Jobs, `deploy` abhängig von `check-and-lint` **und** `adapter-tests` (sonst E3011).
- **Vor jedem Release:** https://adapter-check.iobroker.in/ grün.
- Handler nur implementieren, wenn gebraucht (`onStateChange` ja; `onObjectChange` vermutlich nein; `onMessage` für Cloud-Login/Discovery).

## Sensible Daten
Gerätepasswort und Cloud-Capture liegen in **`secrets/`** (per `.gitignore` ausgeschlossen — **niemals committen**).

## Dokumenten-Index
- `docs/context/01-conversation-and-decisions.md` — kompletter Gesprächsverlauf & Begründungen
- `docs/context/02-technical-findings.md` — Protokoll, Gerätemodell, Ports, Netz, RDM, Passwort-Herleitung
- `docs/context/03-iobroker-compliance.md` — Verweis + Kurzüberblick zum Compliance-Skill
- `.claude/skills/iobroker-adapter-dev/` — **vollständiger, aufrufbarer Compliance-Skill** (SKILL.md + references/)
- `docs/context/04-project-plan.md` — detaillierter Projekt-/Phasenplan
- `secrets/DEVICE_SECRETS.md` — dekodiertes Passwort + Geräte-Identität (git-ignoriert)
- `secrets/cloud-capture-inventory.json` — Roh-/Parsed-Capture (git-ignoriert)
