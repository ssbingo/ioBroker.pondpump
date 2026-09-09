# Teichpumpen-Durchfluss nach Wassertemperatur und Wetter

**Grundlagen, Belege und Referenzkurve – mit Bezug auf die OASE Seasonal Flow Control (SFC)**

> Stand: 9. September 2026 (**ergänzt um Kapitel 7, Tag/Nacht**) · Recherche-Basis: rund 160 Suchanfragen
> und etwa 290 ausgewertete Seiten (Herstellerhandbücher, Fachhändler-Ratgeber, Koi-/Teichforen, Aquakultur-
> und Abwasser-Fachliteratur, Extension-Fact-Sheets). Zahlen aus Formeln der Quellen sind als
> **[eigene Berechnung]** markiert; Forenaussagen als solche gekennzeichnet; englische Zitate übersetzt.
>
> Diese Ausarbeitung ist die Design-Grundlage für die temperatur-/wetterabhängigen Scheduler-Parameter
> des `iobroker.pondpump`-Adapters (Phase 11/12/13). **Original-PDF:** [`../Teichpumpe_Durchfluss_Temperatur_Wetter.pdf`](../Teichpumpe_Durchfluss_Temperatur_Wetter.pdf)
> (die um Kapitel 7 erweiterte Fassung ist als PDF vom Anwender bereitzustellen). Diese Markdown-Fassung ist
> die durchsuchbare/greppbare Referenz im Repo und enthält Kapitel 7 als Volltext.

## 0. Kurzfassung

Die **Wassertemperatur** ist die mit Abstand wichtigste Steuergröße für den Durchfluss einer Teichpumpe.
Alle drei Bedarfsgrößen eines Filterkreislaufs – Sauerstoffbedarf der Fische, ihre Ammonium-Ausscheidung
und die Umsatzleistung des Biofilters – folgen näherungsweise demselben Gesetz: **Verdopplung je 10 K**
(Q10 ≈ 2 bei Karpfenfischen, Temperaturkoeffizient θ ≈ 1,07 bei der Nitrifikation). Gegenläufig läuft die
Sauerstofflöslichkeit: 4 °C → 13,1 mg/l, 30 °C → 7,6 mg/l. Kaltes Wasser = großer Vorrat, kleiner Bedarf;
warmes Wasser = kleiner Vorrat, großer Bedarf. Daraus folgt eine Bedarfskurve, die bei **17–20 °C ihr
Plateau (100 %)** erreicht, bei **8–10 °C auf rund die Hälfte** fällt und bei **4 °C auf ein Drittel bis 40 %** –
aber nie auf null (Biofilm muss durchströmt bleiben, Ammonium fällt auch ungefüttert an, Leitungen frieren).

OASE bildet diese Kurve mit **SFC** als Dreistufenschema ab: Winterbetrieb < 10 °C, Übergang 10–17 °C,
Sommer > 17 °C, Reduktion von Fördermenge und Förderhöhe **bis zu 50 %**. Die einzige dokumentierte
Stufentabelle (AquaMax Eco Premium 16000, Händlerangabe): 100 % / 73 % / 54 % Fördermenge bei
145 W / 100 W / 50 W – fast exakt eine auf 17 °C normierte Q10-2-Kurve **[eigene Berechnung]**.

Das **Wetter** wirkt (a) indirekt über die Wassertemperatur und (b) direkt über Sauerstoff-/Wärmehaushalt.
Die direkten Wettereffekte begründen in **keiner** Quelle eine **Reduktion** des Filterdurchflusses. Sie
begründen ausschließlich **Erhöhungen** (Volllast + Zusatzbelüftung nachts, bei warmer Bewölkung, Gewitter,
Hitze) und das **Abschalten exponierter Kreisläufe** (Bachlauf/Wasserfall/Fontäne) bei Frost oder Hitze. Der
Luftdruckeffekt des Gewitters ist real, aber klein (2–4 % weniger O₂-Sättigung bei 980–990 hPa).

Nach unten begrenzt nicht die Biologie, sondern die **Hydraulik**: Skimmer-Mindestdurchfluss (AquaSkim 40
≈ 70 l/min), Transportgeschwindigkeit in Bodenablaufleitungen, Frostschutz, Pumpenminimum (typisch 30 %)
und Verweilzeit im UVC.

## 1. Was die OASE Seasonal Flow Control belegt tut

### 1.1 Herstellerangaben
- SFC „reguliert intelligent die Wassermenge bzw. Förderhöhe anhand der Wassertemperatur." Bereiche:
  Winter < +10 °C, Übergang +10…+17 °C, Sommer > +17 °C. Nur bei getauchter Aufstellung. Bei Skimmer/
  Satellitenfilter ggf. SFC ausschalten. Auslieferung: SFC deaktiviert. [Q1]
- „Wassermenge und Förderhöhe bis zu 50 % reduziert." „Ohne SFC läuft die Pumpe permanent mit maximaler
  Drehzahl." [Q2]
- Produktseite bestätigt „bis zu 50 %", Frostsicherheit bis −20 °C, Schnittstelle zu OASE Control
  (Garden Controller Cloud/EGC, InScenio FM-Master Cloud, Eco Control). [Q4]
- **Der Temperaturfühler sitzt in der Pumpe selbst; deshalb funktioniert SFC nur getaucht.** Hysterese,
  Zeitkonstanten und Regelverhalten im Übergangsbereich sind in keinem OASE-Dokument beschrieben.

### 1.2 Die einzige dokumentierte Stufentabelle (Händler, AquaMax Eco Premium 16000) [Q6]

| SFC-Stufe | Wassertemperatur | Leistung | Fördermenge | Anteil |
| --- | --- | --- | --- | --- |
| 1 (Sommer) | ab ca. 17 °C | ca. 145 W | ca. 15 600 l/h (260 l/min) | 100 % |
| 2 (Übergang) | ca. 11–16 °C | ca. 100 W | ca. 11 400 l/h (190 l/min) | 73 % |
| 3 (Winter) | bis ca. 10 °C | ca. 50 W | ca. 8 400 l/h (140 l/min) | 54 % |

Nutzerbeobachtung [Forum]: schaltet „auf halbe Kraft, sobald die Wassertemperatur unter 12 Grad sinkt" [Q7].
Die Koi-Szene schaltet SFC oft **ab** („Flow ist das A und O") und fürchtet ungewolltes Herunterregeln im
Sommer sowie Skimmer-Probleme [Q8].

### 1.3 Wann SFC abgeschaltet wird
Skimmerbetrieb (AquaSkim 40 Mindestbedarf ≈ 70 l/min = 4 200 l/h [Q11]), Satellitenfilter, Bachläufe/
Wasserfälle (reduzierte Förderhöhe lässt sie trockenfallen), hohe Förderhöhen, Trockenaufstellung,
InScenio-Steuergerät. [Q1][Q2][Q6][Q9][Q10]

### 1.4 Warum die Stufen stimmig sind
Q10-2-Bedarfskurve, auf 100 % bei 17 °C normiert **[eigene Berechnung]**: 13,5 °C → 78 %, 10 °C → 62 %,
8 °C → 54 %, 4 °C → 41 %. Die Händlerstufen 73 %/54 % sind eine grobe Diskretisierung dieser Kurve. Dass
die Leistung überproportional sinkt (54 % Fördermenge bei 34 % Leistung), folgt aus den Affinitätsgesetzen:
Fördermenge ∝ Drehzahl, Förderhöhe ∝ Drehzahl², hydraulische Leistung ∝ Drehzahl³.

## 2. Wie die Wassertemperatur wirkt

### 2.1 Sauerstofflöslichkeit (Süßwasser, 1013 hPa) [Q12][Q13]

| °C | 0 | 4 | 5 | 10 | 15 | 20 | 25 | 30 | 35 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mg/l | 14,62 | 13,11 | 12,77 | 11,29 | 10,08 | 9,09 | 8,26 | 7,56 | 6,95 |

Wasser von 4 °C nimmt 1,44× so viel O₂ auf wie 20 °C. Luftdruck: −2,4 % bei 990 hPa, −3,4 % bei 980 hPa
(25 °C) – Größe zweiter Ordnung.

### 2.2 Sauerstoffbedarf der Fische
Karpfen: „+10 °C verdoppelt den Sauerstoffverbrauch." Q10 = 1,7–2,6. Kalte Fische überleben O₂-Mangel viel
länger (24 h bei 6 °C, 6 h bei 10 °C, 2,5 h bei 15 °C bei schwerer Hypoxie). [Q18][Q19][Q21]

**Relativer Bedarf bei Q10 = 2, bezogen auf 20 °C [eigene Berechnung]:**

| °C | 2 | 4 | 6 | 8 | 10 | 12 | 15 | 17 | 20 | 25 | 28 | 30 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bedarf | 0,29 | 0,33 | 0,38 | 0,44 | 0,50 | 0,57 | 0,71 | 0,81 | 1,00 | 1,41 | 1,74 | 2,00 |

Temperaturfenster Koi: Optimum 15–25 °C; Immunsystem inaktiv < ~12,8 °C; Aeromonas-Fenster 10–16 °C;
kein Füttern < 8–10 °C; Winterruhe < 5 °C; max. 2 °C Änderung je 24 h. Unter 8–10 °C fällt die Futter-
und Schmutzfracht weg, Ammonium wird aber weiter über die Kiemen ausgeschieden.

### 2.3 Ammonium/Ammoniak
Ammoniumfracht ∝ Stoffwechsel (Q10). Der giftige NH₃-Anteil steigt mit Temperatur und pH (Emerson):
z. B. pH 8,0 → 1,82 % bei 10 °C, 5,37 % bei 25 °C. Schadschwelle 0,05 mg/l NH₃. pH-Maximum am späten
Nachmittag → **Sommer-Filterdurchfluss nachmittags nicht reduzieren.**

### 2.4 Nitrifikation im Biofilter
θ ≈ 1,072 (Ammoniumoxidierer) = exakt Q10 = 2. Relative Leistung bez. 20 °C: 4 °C → 33 %, 10 °C → 50 %,
15 °C → 71 %, 25 °C → 142 %, 30 °C → 200 %. Nitrifikation stoppt bei 4–6 °C nicht, wird nur langsam; der
Filter darf im Winter nicht stillstehen (Nitrobacter „verhungert langsam"). Plötzlicher Temperatursturz −10 K
kostet 20 % Extra-Leistung; Wiederaufbau 38 Tage bei 26 °C, 67 Tage bei 14 °C („Frühjahrs-Syndrom").
Zu viel Durchfluss schadet der Nitrifikation nicht; die Obergrenze setzen Absetzleistung und Energie.

### 2.5 Dichteanomalie / Schichtung
Größte Dichte bei 4 °C → inverse Winterschichtung (4 °C am Grund). Bei **laufendem Filter existiert keine
Schichtung** (jeder Flossenschlag/Wind zerstört sie); abgedeckt nur 0,2–0,3 K Differenz. Sommer: tiefe,
unbewegte Teiche schichten; kalter Starkregen/Kaltfront/Sturm kann umkippen → Fischsterben. Ständig
umgewälzte Koiteiche schichten praktisch nicht.

### 2.6 Viskosität
Winter einige Prozent weniger Durchfluss bei gleicher Einstellung – messbar, ohne Steuerungsrelevanz.

### 2.7 Zusammenführung: die Bedarfskurve

| Wassertemp. | O₂-Sätt. | Fischbedarf/NH₄ (rel. 20 °C) | Nitrifik. (rel. 20 °C) | NH₃ (pH 8) | Folgerung Filterdurchfluss |
| --- | --- | --- | --- | --- | --- |
| ≤ 4 °C | 13,1–14,6 | ≤ 0,33 | ≤ 0,33, sehr langsam | 1,0–1,2 % | Minimum, aber kontinuierlich; 4-°C-Zone nicht absaugen; Bachlauf aus |
| 4–8 °C | 11,8–13,1 | 0,33–0,44 | 0,33–0,43 | 1,2–1,6 % | 40–55 %; Winterruhe, kein Füttern; Temperaturstabilität |
| 8–12 °C | 10,8–11,8 | 0,44–0,57 | 0,43–0,57 | 1,6–2,1 % | 50–65 %; Aeromonas-Fenster; Filter noch nicht eingefahren |
| 12–17 °C | 9,7–10,8 | 0,57–0,81 | 0,57–0,81 | 2,1–3,1 % | 65–85 %, mit der Temperatur hochfahren; kritischstes Frühjahrsfenster |
| 17–24 °C | 8,4–9,7 | 0,81–1,32 | 0,81–1,32 | 3,1–5,0 % | 100 %, Umwälzung ≥ 1×/h; Belüftung nachts ab ~20 °C |
| ≥ 25 °C | ≤ 8,3 | ≥ 1,41 | ≥ 1,42 | ≥ 5,4 % | 100 % plus maximale Belüftung, keine Nachtabsenkung; Beschattung, weniger Futter |

Die Kurve ist bewusst asymmetrisch: nach oben ist die Pumpe bei 100 % am Anschlag (Mehrbedarf über
20–25 °C deckt Belüftung), nach unten begrenzt die Hydraulik.

## 3. Wie das Wetter wirkt – und wie stark

Drei Wege: Wassertemperatur (träge, Tage) · Sauerstoffhaushalt (schnell, Stunden) · Wärmehaushalt
exponierter Flächen (Bachlauf/Wasserfall/Fontäne – sofort).

- **3.1 Sonne/Bewölkung/Nacht:** O₂-Minimum kurz vor Sonnenaufgang; nachts −5 bis −10 mg/l möglich. Warme
  Bewölkung ≥ 2 Tage → Dauerbelüftung. Nachtabsenkung des Durchflusses **widerspricht** der Literatur
  (nachts ist der Bedarf am höchsten, die Photosynthese fehlt) – nur im kalten Halbjahr vertretbar.
- **3.2 Lufttemperatur/Verdunstung:** Bachlauf/Wasserfall = Wärmetauscher. Winter größte Kältequelle
  (Frostnacht: 6 500 l von 10 → 4 °C ≈ 3,8 kW). Regel: Bachlauf im Winter nur an, wenn **Feuchtkugel-
  (ersatzweise Luft-)temperatur > Wassertemperatur**; im Sommer nur, wenn darunter (nachts/trocken). Der
  Filterkreislauf (Rücklauf unter Wasser) wird von der Lufttemperatur **nicht** gesteuert.
- **3.3 Wind:** kein eigener Steuerimpuls; Maßnahme = Abdeckung.
- **3.4 Regen/Starkregen:** pH/KH-Sturz, Eintrag, Abkühlung. **Keine Durchflussreduktion**; volle Umwälzung
  halten, Skimmer/mechanisch verstärken, 1–2 Tage nicht füttern, Regen nicht direkt einleiten.
- **3.5 Gewitter/Luftdruck:** Luftdruckeffekt real, aber klein. Gefahr = Kombination Hitze/Schwüle/Bewölkung/
  Kaltregen/Wind. Maßnahme: Belüftung + Umwälzung **max**, Durchfluss 100 %. Fallender Druck/Unwetter-
  warnung = Vorlaufsignal für Belüftung-Max, **nicht** für Durchflussreduktion.
- **3.6 Hitzewellen (≥ 24–25 °C):** Belüftung max Tag+Nacht, Beschattung, Frischwasser, Futter reduzieren,
  Bachlauf tags aus/nachts an, Filter 100 %.
- **3.7 Frost/Eis:** **nie takten** (Ein/Aus lässt einfrieren). Bachlauf/Wasserfall aus. Pumpe/Ansaugung
  30–60 cm unter Oberfläche; Belüfter 30–40 cm, Eisloch; kontinuierlich laufen.

### 3.8 Wetterereignis → Maßnahme (Auszug)

| Wetterlage | Filterdurchfluss | Belüftung | Bachlauf/Wasserfall |
| --- | --- | --- | --- |
| Warme Nacht (Wasser ≥ 20 °C) | 100 %, keine Absenkung | an (22–8 h, besser durchgehend) | darf laufen (kühlt nachts) |
| Warme Bewölkung ≥ 2 Tage | 100 % | Dauerbetrieb | frei |
| Hitzewelle ≥ 25–28 °C | 100 % | Maximum, Tag+Nacht | tags aus, nachts an |
| Gewitter/Schwüle, fallender Druck | 100 % | vorsorglich Maximum | tags aus |
| Starkregen | 100 %, Skimmer/mechanisch verstärken | an | frei |
| Kaltfront im Herbst | Kurve folgen, langsam absenken | nach Bedarf | aus, sobald Luft < Wasser |
| Frost, Eis | Minimum, kontinuierlich, nie takten | leicht, 30–40 cm, Eisloch | aus |

## 4. Was den Durchfluss nach unten begrenzt (Hydraulik)

- **Skimmer:** AquaSkim 40 ≈ 70 l/min Minimum; bei Skimmerbetrieb SFC/Drosselung meiden oder Skimmer im
  Winter abnehmen.
- **Bodenablauf/Rohrleitungen:** unter einer Mindestgeschwindigkeit sedimentiert Schmutz und fault → bei
  Drosselung Leitungen ganz zu (und entleeren), nicht reduzieren; DN110 bei 5 m³/h nur 0,18 m/s.
- **Absetzkammer/Vorfilter:** weniger Durchfluss verbessert die Vorabscheidung (Verweilzeit).
- **UVC:** UV-Dosis ∝ 1/Durchfluss; bis 6–8 °C laufen, im Frühjahr früh ein, im Winter (keine Algen) aus.
- **Biofilm/Pumpenminimum/Frost:** Stillstand tötet den Biofilm (2–6 h); Drehzahlpumpen-Minimum typ. 30 %;
  im Frost ist „Aus" verboten. Phasenanschnitt an Asynchronpumpen nur ~25 % Drosselung.
- **Förderhöhe** fällt quadratisch mit der Drehzahl – Bachlauf/hohe Filter fallen zuerst trocken.

## 5. Konsens und Dissens (Praxis/Fachliteratur)

- **Umwälzrate:** Koiteich ~1× Volumen/h (Spanne 45 min bis 2,5 h). Keine starre Saisonformel; genannte
  Winterwerte 50–60 %.
- **Winter aus oder gedrosselt weiter?** Koi-Händler/Filterhersteller: **gedrosselt weiterlaufen** (Ammonium
  fällt an, O₂ verteilen, Biofilm/UVC frostfrei). Garten-/Schwimmteich-Szene: **abschalten** unter ~10 °C.
  Für besetzten Koiteich ist Weiterlaufen besser begründet.
- **Ansaug-/Rücklauftiefe Winter:** nicht am tiefsten Punkt absaugen; 30–60 cm; Bodenablauf zu (ab ~8 °C)
  oder mit ausreichender Geschwindigkeit.
- **Abgedeckter Teich:** alles wie im Sommer laufen lassen (keine Oberflächen-Auskühlung).
- **Bachlauf/Wasserfall:** Winter aus (Kriterium Luft > Wasser); ruhender Bachlauf entleeren.
- **Fütterung als Lastgeber:** > 18 °C normal, 15–18 reduziert, 10–15 Herbstfutter, 8–10 minimal, < 8 kein
  Futter. Diese Schwellen sind die natürlichen Stützpunkte einer Durchflusskurve.
- **Sommer:** kein Dissens – Durchfluss/Belüftung nicht reduzieren.

## 6. Referenzkurve für eine eigene Steuerung

Synthese für einen besetzten, unabgedeckten Koiteich mit Filterkreislauf (Rücklauf unter Wasser). Keine
Herstellervorgabe; jede Anlage braucht eigene Minima (Kap. 4).

### 6.1 Kern: eine Temperaturfunktion statt Stufen

> **Q_rel(T) = clamp( 2^((T − T_ref)/10), Q_min, 1,0 )  mit T_ref = 17 °C**

wobei **T** das gleitende **24-h-Mittel der Wassertemperatur** (Teich, mittlere Tiefe, nicht im Filter, nicht an
der Oberfläche) und **Q_min** das hydraulische Minimum der Anlage ist (typisch 30–40 %).

| Wassertemp. (24-h-Mittel) | Q_rel nach Formel | Empfohlener Sollwert | Begleitmaßnahmen |
| --- | --- | --- | --- |
| ≥ 17 °C | 100 % | 100 % | ab 20 °C Belüftung nachts, ab 25 °C max, keine Nachtabsenkung |
| 15 °C | 87 % | 85–90 % | Fütterung reduziert; Frühjahr NH₄/NO₂ messen, UVC ein |
| 12 °C | 71 % | 70–75 % | ≈ SFC-Übergangsstufe; Aeromonas-Fenster, Temperatur stabil halten |
| 10 °C | 62 % | 60–65 % | Futterstopp vorbereiten; Bachlauf nur bei Luft > Wasser |
| 8 °C | 54 % | 50–55 % | ≈ SFC-Winterstufe; Futterstopp; UVC aus; Skimmer ab |
| 6 °C | 47 % | 45–50 % | Bodenablauf schließen oder mit Geschwindigkeit weiter; Rücklauf mittlere Tiefe |
| 4 °C | 41 % | 40 % oder Q_min | Ansaugung 30–60 cm; Belüfter 30–40 cm; kontinuierlich, nie takten |
| ≤ 2 °C | 35 % | Q_min | Eisloch; Abdeckung; nichts mehr verändern |

**Hysterese und Trägheit:** Sollwertänderungen erst bei **±1 K** Abweichung vom letzten Schaltpunkt und
höchstens **5–10 Prozentpunkte je Stunde** (abrupte Änderungen schaden dem Filter überproportional);
**Tagesmittel** statt Momentanwert.

### 6.2 Wetter-Modifikatoren (überlagern die Temperaturfunktion, NIE darunter)

- **Warme Nacht** (Wasser ≥ 20 °C, Sonnenuntergang bis 2 h nach Sonnenaufgang): Sollwert 100 %, Belüftung an.
- **Warme Bewölkung** (Wasser ≥ 20 °C, Globalstrahlung deutlich unter Saisonmittel, 2 Tage): Belüftung Dauer.
- **Hitze** (Wasser ≥ 25 °C): Belüftung max, Fütterungshinweis, Bachlauf nur nachts; ab 28 °C Alarm + Beschattung.
- **Gewitter** (Unwetterwarnung / Druckabfall > ~3 hPa/3 h / Schwüle hoch, Wasser ≥ 20 °C): Belüftung max,
  Durchfluss 100 %, danach pH/KH-Kontrolle.
- **Starkregen** (> 10–20 mm kurzfristig): Durchfluss 100 %, Skimmer/mechanisch verstärken, Fütterungspause.
- **Frost** (Luft < 0 °C): Bachlauf aus, Takten sperren, **Sollwert eingefroren auf den letzten Wert ≥ Q_min**.
- **Bachlauf/Wasserfall (eigener Aktor):** Winterhalbjahr nur wenn Feuchtkugel-/Lufttemperatur > Wasser;
  Sommerhalbjahr nur wenn darunter; bei Frost gesperrt.

### 6.3 Harte Regeln (gelten vor allem anderen)

- Die Pumpe wird **nie auf 0** geregelt, solange Fische im Teich sind; Stillstand nur für Wartung mit
  Zeitbegrenzung (Warnung nach 2 h).
- **Q_min** aus der Anlage bestimmen (Skimmer, Rohrgeschwindigkeit, Filter, Pumpenminimum – der größte
  Wert gewinnt).
- Bachlauf/Wasserfall ist **kein Filterdurchfluss** und wird getrennt geschaltet.
- Alle Sollwertänderungen **rampenförmig**.
- **Bei Sensorausfall → 100 %** („zu viel Durchfluss kostet Strom, zu wenig kostet Fische").

### 6.4 Was die Kurve nicht leistet

Ersetzt keine Sauerstoffmessung (Sommer: gelöster O₂ ist die eigentliche Regelgröße der Belüftung); kennt
die Filterbiologie nicht (Frühjahr: NH₄/NO₂-Anstieg soll den Durchfluss übersteuern); gilt für den
unabgedeckten Teich (unter Abdeckung Q_min = 100 %).

## 7. Tag und Nacht – gibt es sinnvolle Abhängigkeiten?

**Kurz: Ja – aber fast alle laufen der intuitiven „Nachtabsenkung" ENTGEGEN.** Die Nacht ist im Sommer die
**kritische** Phase des Teichs, nicht die ruhige. Eine Tageszeit-Eingangsgröße ist als **Schutzfenster**
(Sperrfenster, in dem der Durchfluss nicht reduziert wird) und für **Nebenaktoren** (Bachlauf, UVC, Fütterung,
Energie/PV) sinnvoll – **nicht** als Treiber des Filterdurchflusses. Im Winter verschwindet der Tagesgang
praktisch vollständig.

### 7.1 Sauerstoff: Minimum vor Sonnenaufgang – oder 2 h nach der letzten Fütterung
Tagsüber übersteigt die Photosynthese die Atmung, nachts stoppt sie → O₂ „am niedrigsten kurz vor
Tagesanbruch" [Q43], nachts −5 bis −10 mg/l möglich [Q20]. In stark besetzten, viel gefütterten Koiteichen
liegt das Tief dagegen **kurz vor Sonnenuntergang, ~2 h nach der letzten Fütterung** [Q101]. Aquakultur-
Regel: Belüfter „22–24 h ein, 7–8 h aus" bzw. sensorgesteuert ab 3–4 mg/l bis nach der Dämmerung; die
Tiefphase dauert im Hochsommer 3–6 h. Koi-Szene: „nachts mehr, tagsüber nicht weniger", Belüfter idealer-
weise 24 h. [Q43][Q124][Q47][Q134]

### 7.2 pH/NH₃/CO₂/Temperatur im Tagesgang
pH steigt tagsüber (Photosynthese entzieht CO₂), fällt nachts; da der NH₃-Anteil mit pH steigt, ist die
giftige Form **am späten Nachmittag/frühen Abend** am höchsten → **Nachmittag ist die zweite Zeit, in der
der Filter nicht gedrosselt werden darf**. Wassertemperatur schwankt 1–3 K/24 h (Min. vor Sonnenaufgang);
in Koiteichen mit laufendem Filter klein. Verdunstungskühlung eines Bachlaufs trägt nur Zehntelgrade/Nacht
(Kodama: Wasserfälle „keine Kühlmechanismen"). [Q27][Q102][Q105][Q106][Q66]

### 7.3 Fische: nacht-/dämmerungsaktiv, Verdauung ist der Tageszeit-Faktor
Karpfen fressen überwiegend nachts, sind nacht-/dämmerungsaktiv; „stilles Wasser zum Ruhen" ist **nicht
belegt** (die Nachtabsenkung stammt aus der Riffaquaristik). Der Tag-Nacht-Grundumsatz-Unterschied
beträgt nur **10–20 %** – klein gegen Q10 (2–3) und klein gegen die **Verdauung**: nach der Fütterung
verdoppelt sich der O₂-Bedarf binnen 30 min und bleibt **14–18 h** erhöht; die Ammoniumspitze folgt ~8 h
später (Faktor 4–5). Eine **abendliche Fütterung legt Verdauungs-O₂-Bedarf, Ammoniumspitze und Filterlast
genau in die Nacht**. [Q114][Q115][Q109][Q120][Q121]

### 7.4 Filter, UVC, Bachlauf, Lärm, Energie
- **Nitrifikation hat keinen Tagesgang** (hängt von NH₄/Temp/O₂ ab, nicht vom Licht); Last folgt der
  Fütterung mit Stunden Verzögerung. Nächtliches Drosseln der Filterpumpe wird bei Fischbesatz **von allen
  Koi-Quellen abgelehnt**; die Ersparnis ist gering (~60 €/Jahr bei 100 W). [Q27][Q125]
- **UVC** ist tageszeitunabhängig → in ein **Laufzeitbudget** (8–12 h/Tag) in einem Block legen, wenige
  Schaltzyklen; welcher Block, entscheidet der Strompreis/PV. [Q123]
- **Bachlauf/Wasserfall** sind echte Tageszeit-Aktoren: **Nachtruhe/Lärm** (22–6 h, je Kommune 20/22–6/7 h),
  Wärmehaushalt, O₂. Koi-Lösung: Bypass, Wasserfall ~9–20/22 h, im Winter aus; bei Hitze umgekehrt
  (nachts an, tags aus). [Q129][Q51][Q126][Q66]

### 7.5 Fütterungszeit als Steuergröße (Astro-Anker)
Sommer: morgens bis später Nachmittag füttern, **letzte Gabe ≥ 6–8 h vor Sonnenaufgang** (≈ Sonnenuntergang
− 2–3 h). Winter (5–10 °C): **10–14 Uhr** am Tagesmaximum, 2–3×/Woche, < 5–8 °C keine. Ein Futterautomat
gehört an die Astro-Uhr; **jede Fütterung startet ein Sperrfenster**, in dem Durchfluss und Belüftung nicht
reduziert werden. [Q113][Q109][Q127][Q66]

### 7.6 Tag-Nacht-Regeln für die Steuerung (Zusammenfassung)

| Aktor / Größe | Sommer (Wasser ≥ 15–20 °C) | Winter (Wasser < 8–10 °C) | Beleglage |
| --- | --- | --- | --- |
| **Filterpumpe** | Rund um die Uhr auf Kurven-Sollwert; **Sperrfenster ohne Reduktion** von „letzte Fütterung + 2 h" bis „Sonnenaufgang + 2 h" und nachmittags; falls Absenkung unvermeidbar: später Vormittag–Mittag, nur im klaren Teich | **Kein Tagesgang**; Q_min nachts, tagsüber bei PV-Überschuss etwas höher (**Q_min … Q_min + 15 %**) – biologisch neutral | stark (O₂/SDA/NH₄); Koi-Logger-Daten fehlen |
| **Belüftung** | 24 h, nachts Boost (22–8 h), Sensor-Trigger 4–5 mg/l; nach später Fütterung/Hitze Pflicht | leicht, flach, Eisloch; keine Tageszeitlogik | stark |
| **Bachlauf/Wasserfall** | Bypass, Lärmfenster 9–20/22 h; bei Hitze umgekehrt (nachts an); täglich ≥ 30 min Spülung | aus; höchstens bei Luft(Feuchtkugel) > Wasser tagsüber | mittel |
| **UVC** | Laufzeitbudget in einem Block, Tageszeit egal → PV-Fenster | aus < 6–10 °C | stark |
| **Fütterung** | morgens–später Nachmittag; letzte Gabe ≥ 6–8 h vor Sonnenaufgang; > 26–28 °C reduziert, Hitze/Gewitter keine | 10–14 Uhr, 2–3×/Woche, < 5–8 °C keine | stark |
| **Energie/PV** | nur variable Verbraucher verschieben (Hysterese > Verbraucherleistung, Mindestlaufzeit, SoC-Stopp) | Filterpumpe darf PV-folgend modulieren (Q_min … Q_min + 15 %) | Foren-Praxis |

**Fazit für pondpump:** Kein Sommer-„Nachtabsenkungs"-Feature für den Filterdurchfluss. Astro liefert
stattdessen: (1) ein **Sperrfenster** (Sonnenuntergang bzw. letzte Fütterung + 2 h → Sonnenaufgang + 2 h),
in dem keine Reduktion erfolgt; (2) **Nebenaktor-Zeitfenster** (Bachlauf/Wasserfall, UVC-Budget) als
`setState`-Aktoren; (3) im **Winter** eine optionale PV-folgende Modulation der Pumpe zwischen Q_min und
Q_min + 15 %. Alles überlagert die Temperaturkurve **nie nach unten** außer der bewusst gewählten
Winter-PV-Modulation oberhalb von Q_min.

## 8. Grenzen der Recherche

Es gibt keine peer-reviewte Studie zum optimalen Filterdurchfluss für Koiteiche nach Temperatur; die
Koi-Szene-Zahlen sind Erfahrungswerte, mittelbar durch Aquakultur-/Abwasserliteratur gestützt. Gut belegt
sind die Mechanismen und Größenordnungen. Die OASE-Kennlinien selbst waren nicht abrufbar; die einzige
Stufentabelle stammt von einem Händler (ältere Generation). Hysterese/Regelverhalten im Übergangsbereich
sind nicht dokumentiert. Für die konkrete Anlage fehlen: Pumpentyp/Regelbarkeit, Schwerkraft/gepumpt,
Skimmer/Bodenablauf, Filtertyp mit Mindestdurchfluss, Teichtiefe, Abdeckung.

## Quellen

[Q1] OASE, GA AquaMax Eco Premium 5000–21000 (DOK_PRD_GA_87320, 2022) ·
[Q2] OASE, GA AquaMax Eco Premium 4000–20000 · [Q3] OASE, GA AquaMax Eco Expert 21000–44000 ·
[Q4] OASE, Produktfamilie AquaMax Eco Premium · [Q5] Absolute Koi, OASE Eco Control ·
[Q6] Teichservice Bodensee, „Seasonal Flow Control (SFC)" · [Q7] pondlibrary.com (NL) ·
[Q8] Koi-Live-Forum, „Season Flow Control" · [Q9] Water Garden UK · [Q10] Absolute Koi ·
[Q11] Hobby-Gartenteich-Forum (OASE-Auskunft AquaSkim 40) · [Q12] YSI DO Solubility Table ·
[Q13] USGS OWQ TM 2011.03 (DOTABLES) · [Q14] Koi-Consult · [Q15] Koi Köstorf ·
[Q16] Koigarten Müller · [Q17] USGS TM 81.11 (Luftdruck) · [Q18] FAO Carp seed production ·
[Q19] FAO Fish diseases manual · [Q20] Boyd 1998, Pond aeration; Global Seafood Alliance ·
[Q21] Stecyk & Farrell 2002, J. Exp. Biol. 205:759 · [Q22] Koi Organisation International (Cold Water) ·
[Q23] Hanako-Koi (Winterruhe/Frühjahr/Filterbakterien) · [Q24] Koi-Consult (Regelwerk Koi-Teiche) ·
[Q25] Koi-Company (Filter im Winter) · [Q26] UF/IFAS FA031; Florida DEP (Emerson) ·
[Q27] SRAC 4603 (Ammonia in Fish Ponds) · [Q28] Kinyage & Pedersen 2016 (RAS MBBR) ·
[Q29] ESE Magazine (Metcalf & Eddy) · [Q30] Aquatic Solutions (kommerziell) ·
[Q31] Review Nitrification in RAS (Zhu & Chen 2002; Timmons & Ebeling) · [Q32] Hwang & Oleszkiewicz 2007 ·
[Q33] Aquacultural Engineering 2019 (trickling filters) · [Q34] NY DEC Wastewater Operator Module 4 ·
[Q35] FAO Training Manual (Water properties) · [Q36] Univ. of Maryland Extension (Pond Aeration) ·
[Q37] Play It Koi (Winter Aeration / Bottom Drain) · [Q38] Koigarten Müller (Winterbelüftung/Filterlaufzeit) ·
[Q39] Hobby-Gartenteich-Forum (Temperaturschichtung) · [Q40] Koi-Live-Forum (Bodenablauf/Schichtung) ·
[Q41] SRAC 4602 (Pond Mixing) · [Q42] Texas A&M AgriLife WKY-211; Mississippi State (Fish kills) ·
[Q43] UF/IFAS FA002 (Dissolved oxygen) · [Q44] J. Ecological Engineering (flache Karpfenteiche) ·
[Q45] Anton Paar Wiki (Viscosity of water) · [Q46] FluidFlow (ANSI/HI 9.6.7) · [Q47] Koitec24 ·
[Q48] SRAC 3700 (Pond Aeration) · [Q49] FAO x5744e · [Q50] Koi Life Expert (Pump sizing) ·
[Q51] Koi-Live-Forum (Pumpe nachts) · [Q52] Koitec24 (winterfest) · [Q53] Genesis (Pumpe im Winter drosseln) ·
[Q54] Hobby-Gartenteich-Forum (Teichfilter Minusgrade) · [Q55] Gartenteich-Ratgeber (Wasserumwälzung) ·
[Q56] NaturaGart-Forum (Laufzeit) · [Q57] Koi-Live-Forum (Bachlauf Winter) · [Q58] Teichservice Bodensee ·
[Q59] Koi-Live-Forum (nach starkem Regen) · [Q60] Teichzeit (Starkregen/Hochwasser) ·
[Q61] Velda (Sauerstoffmangel) · [Q62] Unique Koi · [Q63] Koifarm.shop · [Q64] Koi-Live-Forum (nach Unwetter) ·
[Q65] Simple Koi Excellence · [Q66] Kodama Koi Farm (Heat wave / Winter) · [Q67] Teich-Filter.eu (Temperatur) ·
[Q68] Pond Informer (Pumps in winter) · [Q69] Aquascape (Winter pond keeping) · [Q70] Genesis (Filter im Winter) ·
[Q71] Global Seafood Alliance (Settling basin) · [Q72] Water Garden Ltd (FAQ Pumpe Winter) ·
[Q73] koi-bito-Forum (UV) · [Q74] Pond Informer (Autumn/UVC) · [Q75] Koi-Live-Forum (Pumpe in Betrieb) ·
[Q76] Top-Schwimmteich-Forum · [Q77] Koi Company (AquaForte Vario) · [Q78] Blue Eco (Manual) ·
[Q79] Koi-Live-Forum (Pumpe drosseln) · [Q80] ioBroker-Forum (Phasenanschnitt) ·
[Q81] ioBroker AdapterRequests #464 (Oase EGC) · [Q82] Niederrhein-Koi · [Q83] Koi Organisation Intl (Turnover) ·
[Q84] Koi-Live-Forum/koiforum.uk (Umwälzrate) · [Q85] Koi-Live-Forum (Winter laufen lassen) ·
[Q86] Bachflohkrebse.de; Complete Koi; Vijvercentrum NL · [Q87] Teichzeit (Filter Winter aus) ·
[Q88] Gartenteich-Ratgeber (Koiteich Winter) · [Q89] Gartenjournal; Teich-Filter.de · [Q90] NaturaGart-Forum ·
[Q91] The Pond Guy; Midwest Ponds · [Q92] NaturaGart (Teichpumpen) · [Q93] Bachflohkrebse/Koitec24 (Fütterung) ·
[Q94] Kyodai Koi; Pond Trade Magazine; Hydrosphere (Frühjahrstemperaturen)

*Vollständige URL-Liste im Original-PDF. Inoffizielles Community-Projekt, nicht mit OASE GmbH verbunden.*
