# ioBroker.pondpump

> [English README](../../README.md)

---

<p align="center">
  <a href="https://www.buymeacoffee.com/ssbingo"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=ssbingo&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>
</p>

---

Bedien en bewaak **OASE AquaMax Eco Titanium** vijverpompen via de **OASE Garden Controller Cloud (EGC)** — lokaal en via de cloud.

## Disclaimer

Dit is een **niet-officieel communityproject**. Het is op geen enkele manier **verbonden met, goedgekeurd door of ondersteund door OASE GmbH**. "OASE", "AquaMax" en verwante productnamen zijn handelsmerken van OASE GmbH en worden hier uitsluitend gebruikt om de compatibiliteit met apparaten te beschrijven. Het communicatieprotocol is onafhankelijk geanalyseerd — gebruik deze adapter op eigen risico.

## Ondersteunde hardware

| Apparaat | Artikelnr. | Rol |
| --- | --- | --- |
| OASE Garden Controller Cloud (EGC) | 55317 | Gateway (`GatewayCloud`) |
| OASE AquaMax Eco Titanium | 73656 | Vijverpomp (`GardenPump`) |

## Functies

- Elke pomp in- en uitschakelen
- De pompsnelheid instellen van 0–100 %
- Live-telemetrie uitlezen: vermogen (W), motortoerental (rpm), temperatuur (°C) en netspanning (V)
- De verbindings- en apparaatstatus zien
- Pompen behouden de namen die u ze in de OASE-app hebt gegeven

## Cloud-authenticatie

De OASE-cloud gebruikt **Azure AD B2C** (`account.oase.com`). De adapter authenticeert met de refresh-token-grant: leg eenmalig een refresh-token vast vanuit een OASE-app-login en plak dit in de adapterinstellingen (versleuteld opgeslagen). **Uw accountwachtwoord wordt nooit ingevoerd in of opgeslagen door de adapter.**

## Configuratie

| Instelling | Beschrijving |
| --- | --- |
| Verbindingsmodus | `cloud`, `local` of `both` |
| Poll-interval | Polling-interval in seconden (standaard 30) |
| Cloud-refresh-token | Vastgelegd vanuit een OASE-app-login (versleuteld opgeslagen) |
| Controller-IP | IP-adres van de EGC-gateway (lokale modus) |
| Apparaatwachtwoord | Apparaatwachtwoord voor lokale authenticatie (versleuteld opgeslagen) |
| Bind-adres / poort | Lokale TLS-server waarmee de controller terugverbindt |

## Documentatie

Handboek voor beginners: [English](../handbook/en/manual.md) · [Deutsch](../handbook/de/manual.md).

De volledige documentatie en het changelog staan in de [English README](../../README.md).
