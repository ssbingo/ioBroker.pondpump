# ioBroker-Forum: Tester-Thread (Kategorie „Test Adapter")

> Vorbereiteter Text für Issue #19 („Adapter published at ioBroker latest repository – please create a tester topic at the forum"). Vor dem Posten Screenshots/aktuelle Versionsnummer prüfen.

---

**Titel:** `[Test] pondpump – OASE AquaMax Eco Titanium Teichpumpen (Garden Controller Cloud / EGC)`

---

Hallo zusammen,

ich möchte euch meinen neuen Adapter **pondpump** zum Testen vorstellen. Er steuert und überwacht **OASE AquaMax Eco Titanium** Teichpumpen (Artikel 73656) über den **OASE Garden Controller Cloud (EGC)** (Artikel 55317) – **lokal im LAN und/oder über die OASE-Cloud**.

Der Adapter ist bewusst getrennt vom bestehenden `oasecontrol`-Adapter (der die Steckdosen-Controller abdeckt) und komplett neu geschrieben. Das Protokoll wurde eigenständig analysiert.

### Was der Adapter kann
- **Cloud- oder lokaler Betrieb** (sich gegenseitig ausschließend, umschaltbar)
- **Live-Telemetrie** je Pumpe: Leistung (W), Drehzahl (U/min), Temperatur (°C), Netzspannung (V)
- **Steuerung:** Ein/Aus, Drehzahl/Leistung in % (Slider + 5-%-Schnellwahl)
- **SFC (Seasonal Flow Control)** – OASEs saisonale Durchflussregelung – schaltbar
- **Zwei vis-2-Widgets:** Pumpen-Visualisierung (Flügelrad/Eiskristall) + Steuerung
- **Zeitpläne pro Pumpe:** je Pumpe ein eigener Admin-Tab mit nicht-überlappenden Zeitfenstern (Power % oder SFC an/aus) + Grund-Power

### Voraussetzungen
- **js-controller** ≥ 6.0.11
- **admin** ≥ 8.0.11 (die Zeitplan-Oberfläche nutzt die neue React-19/MUI-9-Admin-Technik)
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
- Zeitpläne: Anlegen, Speichern, Überschneidungsprüfung, Ausführung an den Fenstergrenzen
- vis-2-Widgets

### Links
- GitHub: https://github.com/ssbingo/ioBroker.pondpump
- npm: https://www.npmjs.com/package/iobroker.pondpump
- Changelog: siehe README

Über Rückmeldungen (gern mit Debug-Log bei Problemen: Instanz-Loglevel auf `debug`, Secrets werden nie geloggt) freue ich mich sehr. Danke fürs Testen! 🐟

*Hinweis: inoffizielles Community-Projekt, nicht mit der OASE GmbH verbunden. Nutzung auf eigenes Risiko.*
