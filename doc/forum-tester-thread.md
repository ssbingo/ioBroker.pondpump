# ioBroker-Forum: Tester-Thread (Kategorie „Test Adapter")

> Vorbereiteter Text für den Tester-Thread. Vor dem Posten die aktuelle Versionsnummer prüfen und ggf. Screenshots ergänzen.
>
> **Wichtig (laut Bot):** Der Thread-Titel MUSS exakt dem Schema `Test Adapter <Adaptername> Vx.x.x` folgen, damit die Forum-Suche greift. Nach dem Posten den **Forum-Link** an das ursprüngliche Tester-Issue hängen.
>
> Der bestehende Thread verweist noch auf **V0.5.0**. Dieser Text ist die **Aktualisierung** und fasst alle seither erschienenen Funktionen (bis **v0.12.1**) zusammen – entweder als neuer Beitrag im bestehenden Thread **oder** als neuer Thread mit aktualisiertem Titel.

---

**Titel:** `Test Adapter pondpump V0.12.1`

---

Hallo zusammen,

großes **Update** zu meinem Adapter **pondpump** – inzwischen bei **v0.12.1**. Er steuert und überwacht **OASE AquaMax Eco Titanium** Teichpumpen (Artikel 73656) über den **OASE Garden Controller Cloud (EGC)** (Artikel 55317) – **lokal im LAN und/oder über die OASE-Cloud**.

Der Adapter ist bewusst getrennt vom bestehenden `oasecontrol`-Adapter (der die Steckdosen-Controller abdeckt) und komplett neu geschrieben. Das Protokoll wurde eigenständig analysiert.

### Neu in der Visualisierung (vis-2)
- **Neues Widget „Scheduler-Status" (PumpScheduler):** zeigt auf einen Blick, **was der eingebaute Scheduler** gerade mit einer Pumpe macht – und **warum**: aktuelle Ausgabe + **Zielleistung**, Status-Abzeichen (aktiv / manuell / Notlauf), **Begründungs-Chips** (Temperaturkurve, Zeitfenster, Grundlast, Nachtschutz, Wetter-Boost, Frost-Halt), das **aktive Fenster**, die **nächste Änderung**, **Sonnenauf-/-untergang** und die **Wassertemperatur** – dazu Live-Werte und eine **Steuerleiste** (An/Aus, Leistungs-Schnellwahl, SFC).
- **Benannte Aktoren mit Icon:** Ein **Aktor-Zeitfenster** (Wasserfall, Bachlauf, Sauerstoffpumpe …) bekommt jetzt einen **Namen** und ein **wählbares Icon**. Im Scheduler-Widget erscheint jeder Aktor über der Telemetrie als **Icon – Name – kleines hellgrünes Flügelrad**, das sich dreht, solange der Aktor **an** ist. Jeder Aktor lässt sich im Widget **einzeln ein-/ausblenden**.
- **Wassertemperatur im Visualisierungs-Widget:** Liegt ein Wassertemperatur-Wert vor, zeigt das PumpVisual-Widget neben dem Flügelrad ein **farbcodiertes Thermometer** mit dem Wert.
- **Status-Objekte je Pumpe:** neue read-only States `pumps.<n>.schedule.*` (Zielleistung, Grund, aktives Fenster, nächste Änderung, Aktoren …) – auch in Skripten/History nutzbar.

### Steuerung & Regelung (seit V0.5.0)
- **Maximalleistung je Pumpe:** je Pumpe ein **Max-Wert** (z. B. 90 %) – eine harte Obergrenze, die die Kurve, jede Wetter-Anhebung **und** den Notlauf deckelt.
- **Astronomische Zeitfenster:** Fenster können an **Sonnenauf-/-untergang** ausgerichtet werden (mit optionalem Offset in Minuten), nicht nur an fester Uhrzeit.
- **Standortauswahl mit interaktiver Karte:** wahlweise **pro Instanz** oder **pro Pumpe**. Der Standort bestimmt die Sonnenzeiten – Eingabe über eine **OpenStreetMap-Karte**, per **Adresssuche** oder Koordinaten; ein Klick übernimmt den **ioBroker-Systemstandort**.
- **Nachtschutz (statt Nachtabsenkung):** wissenschaftlich begründet – eine sommerliche **Nacht**absenkung ist **kontraproduktiv** (O₂-Minimum nachts). Der Adapter senkt nachts **nicht** ab, sondern hält bei ausreichend warmem Wasser optional einen **Mindestdurchfluss**.
- **Verständlichere Scheduler-Einstellungen:** alle Felder mit **Erklärtexten und Wertvorschlägen**.
- **Ausführlichstes Debugging:** die komplette **Regelentscheidung** je Pumpe ist im Log nachvollziehbar (siehe unten).

### Was der Adapter insgesamt kann
- **Cloud- oder lokaler Betrieb** (sich gegenseitig ausschließend, umschaltbar)
- **Live-Telemetrie** je Pumpe: Leistung (W), Drehzahl (U/min), Temperatur (°C), Netzspannung (V)
- **Steuerung:** Ein/Aus, Drehzahl/Leistung in % (Slider + 5-%-Schnellwahl)
- **SFC (Seasonal Flow Control)** – OASEs saisonale Durchflussregelung – schaltbar
- **Drei vis-2-Widgets:** Pumpen-Visualisierung (Flügelrad/Eiskristall + Wassertemperatur-Thermometer), Steuerung und **Scheduler-Status**
- **Zeitpläne pro Pumpe:** je Pumpe ein eigener Admin-Tab mit nicht-überlappenden Zeitfenstern – nach **Uhrzeit oder Sonnenstand** – für Power %, SFC an/aus **oder** Aktorschaltung (mit Name + Icon)
- **Temperatur-/wetterabhängige Regelung:** eine **Wassertemperatur-Kurve** legt den Grunddurchfluss fest; **Wetterregeln** können den Durchfluss nur **anheben**, halten, SFC schalten oder Aktoren setzen; dazu Mindest-/Maximalleistung (Q_min/Q_max), Temperatur-Glättung, Hysterese und Rampenbegrenzung, plus **Notlauf auf 100 %** bei Sensorausfall
- **Wassertemperatur-Sensor-Auswahl:** je Pumpe wählbar (Geräte-Sensor **oder** externer Fühler als Kurvenquelle); der effektiv genutzte Wert landet in `telemetry.waterTemperature`
- **Astro-States je Pumpe:** `astro.sunrise`, `astro.sunset` (+ Zeitstempel) und `astro.isDay`

> Hinweis: Die Pumpen-Telemetrie `telemetry.temperature` ist die **Geräte-**, nicht zwingend die Wassertemperatur – daher die Sensor-Auswahl bzw. die Option, einen externen Wasserfühler als Quelle zu wählen.

### Voraussetzungen
- **js-controller** ≥ 6.0.11
- **admin** ≥ 8.0.11 (Scheduler-Oberfläche + Standortkarte nutzen die neue React-19/MUI-9-Admin-Technik)
- **Node.js** ≥ 22

### Installation
Über den **latest-Repo** installierbar (Adapter „pondpump"), alternativ direkt aus npm/GitHub.

### Einrichtung (kurz)
- **Cloud-Modus:** einmalig einen **Refresh-Token** aus einem OASE-App-Login abgreifen und in den Instanz-Einstellungen hinterlegen (das Kontopasswort wird nie gespeichert). Anleitung mit mitmproxy liegt dem Handbuch bei.
- **Lokaler Modus:** Controller-IP + Gerätepasswort eintragen.
- **Standort:** unter „Standort" pro Instanz oder pro Pumpe setzen – nötig für die Sonnen-Zeitfenster und den Nachtschutz.
- **Widgets:** in vis-2 aus der Gruppe „Pond Pump" ziehen und nur die **Pumpe** wählen. Das **Scheduler-Status-Widget** zeigt Ziel/Fenster/Aktoren, sobald für die Pumpe ein **Zeitplan/Kurve aktiviert** ist – sonst korrekt „Manuell / aus".

### Debugging – bitte bei Problemen mitliefern
Instanz-Loglevel auf **`debug`** stellen: Der Adapter protokolliert dann bei **jeder** Scheduler-Auswertung die **komplette Entscheidungskette** je Pumpe – Eingangswerte (roh/geglättet/gemappte Wassertemperatur, alle Quell-States, Sonnenauf-/-untergang, Tag/Nacht), die einzelnen Schritte (Basis aus Kurve/Fenster, Q_min, Nachtschutz, jede greifende Wetterregel, Aktor-Fenster, Q_max) bis zur finalen Leistung/SFC, sowie Rampen-/Halte-Status und der nächste Auswertungszeitpunkt. Ebenso werden Standort-Auflösung und Adress-Geocoding geloggt. **Secrets (Passwörter/Token) werden nie geloggt.**

### Worauf ich besonders Feedback brauche
- Erkennung der Pumpen (Cloud- und lokaler Modus)
- Zuverlässigkeit der Steuerung (Ein/Aus, Leistung, SFC)
- Plausibilität der Telemetriewerte bei euren Modellen
- **Scheduler-Status-Widget:** verständlich? Stimmen Zielleistung, Grund-Chips, Fenster, nächste Änderung und die Aktor-Zeilen?
- **Aktoren:** Name/Icon setzen, Anzeige (Icon – Name – Flügelrad), Ein-/Ausblenden je Aktor
- **Wassertemperatur-Sensor:** Welcher Geräte-Sensor zeigt bei euren Pumpen die Wassertemperatur? Externer Fühler als Quelle?
- **Temperatur-/Wettersteuerung:** Kurve, Wetterregeln, Q_min/Q_max, Glättung/Hysterese/Rampe – sinnvoll einstellbar?
- **Standort/Karte:** Lädt die Karte im Admin? Marker, Adresssuche, „Systemstandort übernehmen"? (Bei geblockten Kacheln bitte melden.)
- **Sonnen-Zeitfenster & Nachtschutz:** stimmen die Sonnenzeiten? Verhält sich der Nachtschutz wie erwartet?
- Zeitpläne: Anlegen, Speichern, Überschneidungsprüfung, Ausführung an den Fenstergrenzen

### Links
- GitHub: https://github.com/ssbingo/ioBroker.pondpump
- npm: https://www.npmjs.com/package/iobroker.pondpump
- Changelog: siehe README

Über Rückmeldungen (gern mit **Debug-Log**, siehe oben) freue ich mich sehr. Danke fürs Testen! 🐟

*Hinweis: inoffizielles Community-Projekt, nicht mit der OASE GmbH verbunden. Nutzung auf eigenes Risiko.*
