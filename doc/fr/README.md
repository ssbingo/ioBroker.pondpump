# ioBroker.pondpump

> [English README](../../README.md)

---

<p align="center">
  <a href="https://www.buymeacoffee.com/ssbingo"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=ssbingo&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>
</p>

---

Contrôlez et surveillez les pompes de bassin **OASE AquaMax Eco Titanium** via le **OASE Garden Controller Cloud (EGC)** — localement et via le cloud.

## Avertissement

Il s'agit d'un **projet communautaire non officiel**. Il n'est **ni affilié à, ni approuvé par, ni pris en charge par OASE GmbH** de quelque manière que ce soit. « OASE », « AquaMax » et les noms de produits associés sont des marques déposées d'OASE GmbH et sont utilisés ici uniquement pour décrire la compatibilité des appareils. Le protocole de communication a été analysé de manière indépendante — utilisez cet adaptateur à vos propres risques.

## Matériel pris en charge

| Appareil | N° d'article | Rôle |
| --- | --- | --- |
| OASE Garden Controller Cloud (EGC) | 55317 | Passerelle (`GatewayCloud`) |
| OASE AquaMax Eco Titanium | 73656 | Pompe de bassin (`GardenPump`) |

## Fonctionnalités

- Allumer et éteindre chaque pompe
- Régler la vitesse de la pompe de 0 à 100 %
- Lire la télémétrie en direct : puissance (W), vitesse du moteur (tr/min), température (°C) et tension secteur (V)
- Voir l'état de la connexion et de l'appareil
- Les pompes conservent les noms que vous leur avez attribués dans l'application OASE

## Authentification cloud

Le cloud OASE utilise **Azure AD B2C** (`account.oase.com`). L'adaptateur s'authentifie avec l'octroi par jeton de rafraîchissement (refresh-token grant) : capturez une fois un jeton de rafraîchissement à partir d'une connexion via l'application OASE et collez-le dans les paramètres de l'adaptateur (stocké de manière chiffrée). **Le mot de passe de votre compte n'est jamais saisi dans l'adaptateur ni stocké par celui-ci.**

## Configuration

| Paramètre | Description |
| --- | --- |
| Mode de connexion | `cloud`, `local` ou `both` |
| Intervalle d'interrogation | Intervalle d'interrogation en secondes (30 par défaut) |
| Jeton de rafraîchissement cloud | Capturé à partir d'une connexion via l'application OASE (stocké de manière chiffrée) |
| Adresse IP du contrôleur | Adresse IP de la passerelle EGC (mode local) |
| Mot de passe de l'appareil | Mot de passe de l'appareil pour l'authentification locale (stocké de manière chiffrée) |
| Adresse / port de liaison | Serveur TLS local auquel le contrôleur se reconnecte |

## Documentation

Manuel pour débutants : [English](../handbook/en/manual.md) · [Deutsch](../handbook/de/manual.md).

La documentation complète et le journal des modifications se trouvent dans le [English README](../../README.md).
