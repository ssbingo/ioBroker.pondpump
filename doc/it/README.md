# ioBroker.pondpump

> [English README](../../README.md)

---

<p align="center">
  <a href="https://www.buymeacoffee.com/ssbingo"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=ssbingo&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>
</p>

---

Controlla e monitora le pompe da laghetto **OASE AquaMax Eco Titanium** tramite l'**OASE Garden Controller Cloud (EGC)** — in locale e tramite cloud.

## Avvertenza

Questo è un **progetto non ufficiale della community**. **Non è affiliato, approvato o supportato da OASE GmbH** in alcun modo. "OASE", "AquaMax" e i relativi nomi di prodotto sono marchi di OASE GmbH e vengono utilizzati qui unicamente per descrivere la compatibilità dei dispositivi. Il protocollo di comunicazione è stato analizzato in modo indipendente — usa questo adapter a tuo rischio.

## Hardware supportato

| Dispositivo | N. articolo | Ruolo |
| --- | --- | --- |
| OASE Garden Controller Cloud (EGC) | 55317 | Gateway (`GatewayCloud`) |
| OASE AquaMax Eco Titanium | 73656 | Pompa da laghetto (`GardenPump`) |

## Funzionalità

- Accendere e spegnere ciascuna pompa
- Impostare la velocità della pompa da 0 a 100 %
- Leggere la telemetria in tempo reale: potenza (W), velocità del motore (rpm), temperatura (°C) e tensione di rete (V)
- Visualizzare lo stato della connessione e del dispositivo
- Le pompe mantengono i nomi che hai assegnato loro nell'app OASE

## Autenticazione cloud

Il cloud OASE utilizza **Azure AD B2C** (`account.oase.com`). L'adapter si autentica con il grant refresh-token: cattura una volta un refresh token da un accesso all'app OASE e incollalo nelle impostazioni dell'adapter (memorizzato in forma cifrata). **La password del tuo account non viene mai inserita né memorizzata dall'adapter.**

## Configurazione

| Impostazione | Descrizione |
| --- | --- |
| Modalità di connessione | `cloud`, `local` o `both` |
| Intervallo di polling | Intervallo di polling in secondi (predefinito 30) |
| Refresh token cloud | Catturato da un accesso all'app OASE (memorizzato in forma cifrata) |
| IP del controller | Indirizzo IP del gateway EGC (modalità locale) |
| Password del dispositivo | Password del dispositivo per l'autenticazione locale (memorizzata in forma cifrata) |
| Indirizzo/porta di bind | Server TLS locale a cui il controller si riconnette |

## Documentazione

Manuale per principianti: [English](../handbook/en/manual.md) · [Deutsch](../handbook/de/manual.md).

La documentazione completa e il changelog si trovano nel [English README](../../README.md).
