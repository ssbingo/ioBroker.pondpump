# ioBroker.pondpump

> [English README](../../README.md)

Sterowanie i monitorowanie pomp stawowych **OASE AquaMax Eco Titanium** za pośrednictwem **OASE Garden Controller Cloud (EGC)** — lokalnie oraz przez chmurę.

## Zastrzeżenie prawne

To jest **nieoficjalny projekt społecznościowy**. **Nie jest w żaden sposób powiązany, wspierany ani autoryzowany przez OASE GmbH**. „OASE", „AquaMax" oraz powiązane nazwy produktów są znakami towarowymi OASE GmbH i są tutaj używane wyłącznie w celu opisania zgodności z urządzeniami. Protokół komunikacyjny został przeanalizowany niezależnie — korzystasz z tego adaptera na własne ryzyko.

## Obsługiwany sprzęt

| Urządzenie | Nr artykułu | Rola |
| --- | --- | --- |
| OASE Garden Controller Cloud (EGC) | 55317 | Brama (`GatewayCloud`) |
| OASE AquaMax Eco Titanium | 73656 | Pompa stawowa (`GardenPump`) |

## Funkcje

- Włączanie i wyłączanie każdej pompy
- Ustawianie prędkości pompy w zakresie 0–100 %
- Odczyt telemetrii na żywo: moc (W), prędkość obrotowa silnika (obr./min), temperatura (°C) oraz napięcie sieciowe (V)
- Podgląd stanu połączenia i urządzenia
- Pompy zachowują nazwy nadane im w aplikacji OASE

## Uwierzytelnianie w chmurze

Chmura OASE korzysta z **Azure AD B2C** (`account.oase.com`). Adapter uwierzytelnia się za pomocą przyznania typu refresh-token: jednorazowo przechwyć token odświeżający z logowania w aplikacji OASE i wklej go do ustawień adaptera (przechowywany w postaci zaszyfrowanej). **Hasło do Twojego konta nigdy nie jest wprowadzane do adaptera ani przez niego przechowywane.**

## Konfiguracja

| Ustawienie | Opis |
| --- | --- |
| Tryb połączenia | `cloud`, `local` lub `both` |
| Interwał odpytywania | Interwał odpytywania w sekundach (domyślnie 30) |
| Token odświeżający chmury | Przechwycony z logowania w aplikacji OASE (przechowywany w postaci zaszyfrowanej) |
| Adres IP kontrolera | Adres IP bramy EGC (tryb lokalny) |
| Hasło urządzenia | Hasło urządzenia do uwierzytelniania lokalnego (przechowywane w postaci zaszyfrowanej) |
| Adres bind / port | Lokalny serwer TLS, do którego kontroler nawiązuje połączenie zwrotne |

## Dokumentacja

Podręcznik dla początkujących: [English](../handbook/en/manual.md) · [Deutsch](../handbook/de/manual.md).

Pełna dokumentacja oraz lista zmian znajdują się w [English README](../../README.md).
