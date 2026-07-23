# ioBroker.pondpump

> [English README](../../README.md)

Steuere und überwache **OASE AquaMax Eco Titanium** Teichpumpen über die **OASE Garden Controller Cloud (EGC)** — lokal und über die Cloud.

## Haftungsausschluss

Dies ist ein **inoffizielles Community-Projekt**. Es steht in **keinerlei Verbindung zur OASE GmbH und wird von dieser weder unterstützt noch befürwortet**. „OASE", „AquaMax" und verwandte Produktnamen sind Marken der OASE GmbH und werden hier ausschließlich zur Beschreibung der Gerätekompatibilität verwendet. Das Kommunikationsprotokoll wurde unabhängig analysiert — die Nutzung dieses Adapters erfolgt auf eigene Gefahr.

## Unterstützte Hardware

| Gerät | Artikelnr. | Rolle |
| --- | --- | --- |
| OASE Garden Controller Cloud (EGC) | 55317 | Gateway (`GatewayCloud`) |
| OASE AquaMax Eco Titanium | 73656 | Teichpumpe (`GardenPump`) |

## Funktionen

- Jede Pumpe ein- und ausschalten
- Die Pumpendrehzahl von 0–100 % einstellen
- Live-Telemetrie auslesen: Leistung (W), Motordrehzahl (U/min), Temperatur (°C) und Netzspannung (V)
- Den Verbindungs- und Gerätestatus einsehen
- Pumpen behalten die Namen, die du ihnen in der OASE-App gegeben hast

## Cloud-Authentifizierung

Die OASE-Cloud verwendet **Azure AD B2C** (`account.oase.com`). Der Adapter authentifiziert sich per Refresh-Token-Grant: Erfasse einmalig ein Refresh-Token aus einem OASE-App-Login und füge es in die Adaptereinstellungen ein (verschlüsselt gespeichert). **Dein Konto-Passwort wird niemals in den Adapter eingegeben oder von ihm gespeichert.**

## Konfiguration

| Einstellung | Beschreibung |
| --- | --- |
| Verbindungsmodus | `cloud`, `local` oder `both` |
| Abfrageintervall | Abfrageintervall in Sekunden (Standard 30) |
| Cloud-Refresh-Token | Aus einem OASE-App-Login erfasst (verschlüsselt gespeichert) |
| Controller-IP | IP-Adresse des EGC-Gateways (lokaler Modus) |
| Gerätepasswort | Gerätepasswort für die lokale Authentifizierung (verschlüsselt gespeichert) |
| Bind-Adresse / Port | Lokaler TLS-Server, zu dem sich der Controller zurückverbindet |

## Dokumentation

Einsteigerhandbuch: [English](../handbook/en/manual.md) · [Deutsch](../handbook/de/manual.md).

Die vollständige Dokumentation und das Changelog befinden sich im [English README](../../README.md).
