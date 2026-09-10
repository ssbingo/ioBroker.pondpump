# ioBroker-Forum: Tester-Thread (Kategorie „Test Adapter")

> Vorbereiteter Text für den Tester-Thread. Vor dem Posten die aktuelle Versionsnummer prüfen und ggf. Screenshots ergänzen.
>
> **Wichtig (laut Bot):** Der Thread-Titel MUSS exakt dem Schema `Test Adapter <Adaptername> Vx.x.x` folgen, damit die Forum-Suche greift. Nach dem Posten den **Forum-Link** an das ursprüngliche Tester-Issue hängen.
>
> Es existiert bereits ein Thread zu **V0.5.0**. Dieser Text ist die **Aktualisierung** und fasst alle seither erschienenen Funktionen (bis **v0.10.0**) zusammen – entweder als neuer Beitrag im bestehenden Thread **oder** als neuer Thread mit aktualisiertem Titel.

---

**Titel:** `Test Adapter pondpump V0.10.0`

---

Hallo zusammen,

kurzes **Update** zu meinem Adapter **pondpump** – inzwischen bei **v0.10.0**. Er steuert und überwacht **OASE AquaMax Eco Titanium** Teichpumpen (Artikel 73656) über den **OASE Garden Controller Cloud (EGC)** (Artikel 55317) – **lokal im LAN und/oder über die OASE-Cloud**.

Der Adapter ist bewusst getrennt vom bestehenden `oasecontrol`-Adapter (der die Steckdosen-Controller abdeckt) und komplett neu geschrieben. Das Protokoll wurde eigenständig analysiert.

### Was seit V0.5.0 dazugekommen ist
- **Maximalleistung je Pumpe:** je Pumpe ein **Max-Wert** (z. B. 90 %) einstellbar – eine harte Obergrenze, die die Kurve, jede Wetter-Anhebung **und** den Notlauf deckelt. Ideal, wenn eine Pumpe konstruktiv nie auf 100 % laufen soll.
- **Astronomische Zeitfenster:** Zeitfenster können jetzt an **Sonnenauf-/-untergang** ausgerichtet werden (mit optionalem Offset in Minuten, z. B. „30 min nach Sonnenaufgang"), nicht nur an fester Uhrzeit.
- **Standortauswahl mit interaktiver Karte:** wahlweise **pro Instanz** (alle Pumpen) oder **pro Pumpe**. Der Standort bestimmt die Sonnenzeiten. Eingabe über eine **OpenStreetMap-Karte** (Marker ziehen/klicken), per **Adresssuche** oder direkt über Koordinaten; ein Klick übernimmt den **ioBroker-Systemstandort**.
- **Nachtschutz (statt Nachtabsenkung):** wissenschaftlich begründet – eine sommerliche **Nacht**absenkung ist **kontraproduktiv** (das Sauerstoffminimum liegt nachts). Der Adapter senkt daher nachts **nicht** ab, sondern hält bei ausreichend warmem Wasser optional einen **Mindestdurchfluss** (Floor).
- **Aktor-Zeitfenster:** Zeitfenster können zusätzlich **externe Aktoren** schalten (z. B. Belüfter, Bachlaufpumpe, UVC) – unabhängig von der Pumpenleistung.
- **Verständlichere Scheduler-Einstellungen:** alle Felder mit **Erklärtexten und Wertvorschlägen** (Platzhalter/Helper-Text), damit auch ohne Handbuch nachvollziehbar ist, was ein Wert bewirkt.
- **Ausführlichstes Debugging:** die komplette **Regelentscheidung** je Pumpe ist jetzt im Log nachvollziehbar (siehe unten).

### Was der Adapter insgesamt kann
- **Cloud- oder lokaler Betrieb** (sich gegenseitig ausschließend, umschaltbar)
- **Live-Telemetrie** je Pumpe: Leistung (W), Drehzahl (U/min), Temperatur (°C), Netzspannung (V)
- **Steuerung:** Ein/Aus, Drehzahl/Leistung in % (Slider + 5-%-Schnellwahl)
- **SFC (Seasonal Flow Control)** – OASEs saisonale Durchflussregelung – schaltbar
- **Zwei vis-2-Widgets:** Pumpen-Visualisierung (Flügelrad/Eiskristall) + Steuerung
- **Zeitpläne pro Pumpe:** je Pumpe ein eigener Admin-Tab mit nicht-überlappenden Zeitfenstern – nach **Uhrzeit oder Sonnenstand** – für Power %, SFC an/aus **oder** Aktorschaltung
- **Temperatur-/wetterabhängige Regelung:** eine **Wassertemperatur-Kurve** legt den Grunddurchfluss fest (Standardkurve als Preset); **Wetterregeln** können den Durchfluss nur **anheben**, halten, SFC schalten oder Aktoren setzen; dazu Mindest-/Maximalleistung (Q_min/Q_max), Temperatur-Glättung, Hysterese und Rampenbegrenzung, plus **Notlauf auf 100 %** bei Sensorausfall
- **Wassertemperatur-Sensor-Auswahl:** je Pumpe wählbar, welcher Geräte-Sensor die Wassertemperatur liefert (im Admin mit Live-Wert angezeigt); der Wert landet in `telemetry.waterTemperature` und belegt die Kurvenquelle vor
- **Astro-States je Pumpe:** `astro.sunrise`, `astro.sunset` (+ Zeitstempel) und `astro.isDay`

> Hinweis: Die Pumpen-Telemetrie `telemetry.temperature` ist die **Geräte-**, nicht zwingend die Wassertemperatur – daher die Sensor-Auswahl bzw. die Option, einen externen Wasserfühler als Quelle zu wählen.

### Voraussetzungen
- **js-controller** ≥ 6.0.11
- **admin** ≥ 8.0.11 (die Scheduler-Oberfläche + Standortkarte nutzen die neue React-19/MUI-9-Admin-Technik)
- **Node.js** ≥ 22

### Installation
Über den **latest-Repo** installierbar (Adapter „pondpump"), alternativ direkt aus npm/GitHub.

### Einrichtung (kurz)
- **Cloud-Modus:** einmalig einen **Refresh-Token** aus einem OASE-App-Login abgreifen und in den Instanz-Einstellungen hinterlegen (das Kontopasswort wird nie gespeichert). Eine Schritt-für-Schritt-Anleitung mit mitmproxy liegt dem Handbuch bei.
- **Lokaler Modus:** Controller-IP + Gerätepasswort eintragen.
- **Standort:** unter „Standort" pro Instanz oder pro Pumpe setzen (Karte, Adresssuche oder Systemstandort) – nötig für die Sonnen-Zeitfenster und den Nachtschutz.

### Debugging – bitte bei Problemen mitliefern
Instanz-Loglevel auf **`debug`** stellen: Der Adapter protokolliert dann bei **jeder** Scheduler-Auswertung die **komplette Entscheidungskette** je Pumpe – die Eingangswerte (roh/geglättet/gemappte Wassertemperatur, alle Quell-States, Sonnenauf-/-untergang, Tag/Nacht), die einzelnen Entscheidungsschritte (Basis aus Kurve/Fenster, Q_min-Untergrenze, Nachtschutz, jede greifende Wetterregel, Aktor-Fenster, Q_max-Deckel) bis zur finalen Leistung/SFC, sowie Rampen-/Halte-Status und der nächste Auswertungszeitpunkt. Ebenso werden Standort-Auflösung und Adress-Geocoding geloggt. **Secrets (Passwörter/Token) werden nie geloggt.**

### Worauf ich besonders Feedback brauche
- Erkennung der Pumpen (Cloud- und lokaler Modus)
- Zuverlässigkeit der Steuerung (Ein/Aus, Leistung, SFC)
- Plausibilität der Telemetriewerte bei euren Modellen
- **Wassertemperatur-Sensor:** Welcher Geräte-Sensor zeigt bei euren Pumpen die Wassertemperatur? (Live-Werte im Auswahlfeld mit einem Thermometer vergleichen)
- **Temperatur-/Wettersteuerung:** Kurve, Wetterregeln, Q_min/Q_max, Glättung/Hysterese/Rampe – verständlich und sinnvoll eingestellt?
- **Standort/Karte:** Lädt die Karte im Admin? Funktionieren Marker, Adresssuche und „Systemstandort übernehmen"? (Bei geblockten Kacheln bitte melden – dann greift die CSP des Admin.)
- **Sonnen-Zeitfenster & Nachtschutz:** stimmen Sonnenauf-/-untergang für euren Standort? Verhält sich der Nachtschutz wie erwartet?
- **Aktor-Fenster:** schalten externe Aktoren wie geplant?
- Zeitpläne: Anlegen, Speichern, Überschneidungsprüfung, Ausführung an den Fenstergrenzen
- vis-2-Widgets

### Links
- GitHub: https://github.com/ssbingo/ioBroker.pondpump
- npm: https://www.npmjs.com/package/iobroker.pondpump
- Changelog: siehe README

Über Rückmeldungen (gern mit **Debug-Log**, siehe oben) freue ich mich sehr. Danke fürs Testen! 🐟

*Hinweis: inoffizielles Community-Projekt, nicht mit der OASE GmbH verbunden. Nutzung auf eigenes Risiko.*
