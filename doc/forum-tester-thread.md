# ioBroker-Forum: Tester-Thread (Kategorie „Test Adapter")

> Vorbereiteter Text für Issue #19 („Adapter published at ioBroker latest repository – please create a tester topic at the forum"). Vor dem Posten die aktuelle Versionsnummer prüfen und ggf. Screenshots ergänzen.
>
> **Wichtig (laut Bot):** Der Thread-Titel MUSS exakt dem Schema `Test Adapter <Adaptername> Vx.x.x` folgen, damit die Forum-Suche greift. Nach dem Posten den **Forum-Link als Kommentar an Issue #19** hängen und das Issue schließen.

---

**Titel:** `Test Adapter pondpump V0.5.0`

---

Hallo zusammen,

ich möchte euch meinen Adapter **pondpump** (aktuell **v0.5.0**) zum Testen vorstellen. Er steuert und überwacht **OASE AquaMax Eco Titanium** Teichpumpen (Artikel 73656) über den **OASE Garden Controller Cloud (EGC)** (Artikel 55317) – **lokal im LAN und/oder über die OASE-Cloud**.

Der Adapter ist bewusst getrennt vom bestehenden `oasecontrol`-Adapter (der die Steckdosen-Controller abdeckt) und komplett neu geschrieben. Das Protokoll wurde eigenständig analysiert.

### Was der Adapter kann
- **Cloud- oder lokaler Betrieb** (sich gegenseitig ausschließend, umschaltbar)
- **Live-Telemetrie** je Pumpe: Leistung (W), Drehzahl (U/min), Temperatur (°C), Netzspannung (V)
- **Steuerung:** Ein/Aus, Drehzahl/Leistung in % (Slider + 5-%-Schnellwahl)
- **SFC (Seasonal Flow Control)** – OASEs saisonale Durchflussregelung – schaltbar
- **Zwei vis-2-Widgets:** Pumpen-Visualisierung (Flügelrad/Eiskristall) + Steuerung
- **Zeitpläne pro Pumpe:** je Pumpe ein eigener Admin-Tab mit nicht-überlappenden Zeitfenstern (Power % oder SFC an/aus) + Grund-Power
- **Temperatur-/wetterabhängige Regelung (neu):** eine **Wassertemperatur-Kurve** legt den Grunddurchfluss fest (Standardkurve als Preset); **Wetterregeln** können den Durchfluss nur **anheben** oder Aktoren schalten (Belüfter, Bachlauf …); dazu Mindestleistung (Q_min), Temperatur-Glättung, Hysterese und Rampenbegrenzung, plus Notlauf auf 100 % bei Sensorausfall
- **Wassertemperatur-Sensor-Auswahl (neu):** je Pumpe wählbar, welcher Geräte-Sensor die Wassertemperatur liefert (im Admin mit Live-Wert angezeigt); der Wert landet in einem eigenen State `telemetry.waterTemperature` und belegt die Kurvenquelle vor

> Hinweis: Die Pumpen-Telemetrie `telemetry.temperature` ist die **Geräte-**, nicht zwingend die Wassertemperatur – daher die Sensor-Auswahl bzw. die Option, einen externen Wasserfühler als Quelle zu wählen.

### Voraussetzungen
- **js-controller** ≥ 6.0.11
- **admin** ≥ 8.0.11 (die Scheduler-Oberfläche nutzt die neue React-19/MUI-9-Admin-Technik)
- **Node.js** ≥ 22

### Installation
Über den **latest-Repo** installierbar (Adapter „pondpump"), alternativ direkt aus npm/GitHub.

### Einrichtung (kurz)
- **Cloud-Modus:** einmalig einen **Refresh-Token** aus einem OASE-App-Login abgreifen und in den Instanz-Einstellungen hinterlegen (das Kontopasswort wird nie gespeichert). Eine Schritt-für-Schritt-Anleitung mit mitmproxy liegt dem Handbuch bei.
- **Lokaler Modus:** Controller-IP + Gerätepasswort eintragen.

### Worauf ich besonders Feedback brauche
- Erkennung der Pumpen (Cloud- und lokaler Modus)
- Zuverlässigkeit der Steuerung (Ein/Aus, Leistung, SFC)
- Plausibilität der Telemetriewerte bei euren Modellen
- **Wassertemperatur-Sensor:** Welcher Geräte-Sensor zeigt bei euren Pumpen die Wassertemperatur? (Live-Werte im Auswahlfeld mit einem Thermometer vergleichen)
- **Temperatur-/Wettersteuerung:** Kurve, Wetterregeln (Anheben/Halten/SFC/Aktor setzen), Glättung/Hysterese/Rampe – verständlich und sinnvoll eingestellt?
- Zeitpläne: Anlegen, Speichern, Überschneidungsprüfung, Ausführung an den Fenstergrenzen
- vis-2-Widgets

### Links
- GitHub: https://github.com/ssbingo/ioBroker.pondpump
- npm: https://www.npmjs.com/package/iobroker.pondpump
- Changelog: siehe README

Über Rückmeldungen (gern mit Debug-Log bei Problemen: Instanz-Loglevel auf `debug`, Secrets werden nie geloggt) freue ich mich sehr. Danke fürs Testen! 🐟

*Hinweis: inoffizielles Community-Projekt, nicht mit der OASE GmbH verbunden. Nutzung auf eigenes Risiko.*
