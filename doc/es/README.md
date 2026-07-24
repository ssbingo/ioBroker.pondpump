# ioBroker.pondpump

> [English README](../../README.md)

---

<p align="center">
  <a href="https://www.buymeacoffee.com/ssbingo"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=ssbingo&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>
</p>

---

Controla y supervisa las bombas de estanque **OASE AquaMax Eco Titanium** a través del **OASE Garden Controller Cloud (EGC)**, tanto localmente como mediante la nube.

## Aviso legal

Este es un **proyecto comunitario no oficial**. **No está afiliado, respaldado ni apoyado por OASE GmbH** de ninguna manera. «OASE», «AquaMax» y los nombres de productos relacionados son marcas comerciales de OASE GmbH y se utilizan aquí únicamente para describir la compatibilidad con los dispositivos. El protocolo de comunicación se analizó de forma independiente; usa este adaptador bajo tu propia responsabilidad.

## Hardware compatible

| Dispositivo | N.º de artículo | Función |
| --- | --- | --- |
| OASE Garden Controller Cloud (EGC) | 55317 | Pasarela (`GatewayCloud`) |
| OASE AquaMax Eco Titanium | 73656 | Bomba de estanque (`GardenPump`) |

## Funciones

- Encender y apagar cada bomba
- Ajustar la velocidad de la bomba de 0 a 100 %
- Leer la telemetría en vivo: potencia (W), velocidad del motor (rpm), temperatura (°C) y tensión de red (V)
- Ver el estado de la conexión y del dispositivo
- Las bombas conservan los nombres que les asignaste en la aplicación de OASE

## Autenticación en la nube

La nube de OASE utiliza **Azure AD B2C** (`account.oase.com`). El adaptador se autentica mediante el flujo de refresh-token: captura un refresh token una vez desde un inicio de sesión en la aplicación de OASE y pégalo en la configuración del adaptador (se almacena cifrado). **La contraseña de tu cuenta nunca se introduce en el adaptador ni se almacena en él.**

## Configuración

| Ajuste | Descripción |
| --- | --- |
| Modo de conexión | `cloud` / `local` |
| Intervalo de sondeo | Intervalo de sondeo en segundos (predeterminado 30) |
| Refresh token de la nube | Capturado desde un inicio de sesión en la aplicación de OASE (se almacena cifrado) |
| IP del controlador | Dirección IP de la pasarela EGC (modo local) |
| Contraseña del dispositivo | Contraseña del dispositivo para la autenticación local (se almacena cifrada) |
| Dirección de enlace / puerto | Servidor TLS local al que el controlador se vuelve a conectar |

## Documentación

Manual para principiantes: [English](../handbook/en/manual.md) · [Deutsch](../handbook/de/manual.md).

La documentación completa y el registro de cambios se encuentran en el [English README](../../README.md).
