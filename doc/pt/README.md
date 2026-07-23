# ioBroker.pondpump

> [English README](../../README.md)

---

<p align="center">
  <a href="https://www.buymeacoffee.com/ssbingo"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=ssbingo&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>
</p>

---

Controle e monitore bombas de lago **OASE AquaMax Eco Titanium** através do **OASE Garden Controller Cloud (EGC)** — localmente e via nuvem.

## Aviso legal

Este é um **projeto comunitário não oficial**. Ele **não é afiliado, endossado ou suportado pela OASE GmbH** de forma alguma. "OASE", "AquaMax" e os nomes de produtos relacionados são marcas registradas da OASE GmbH e são usados aqui apenas para descrever a compatibilidade de dispositivos. O protocolo de comunicação foi analisado de forma independente — use este adaptador por sua conta e risco.

## Hardware suportado

| Dispositivo | N.º do item | Função |
| --- | --- | --- |
| OASE Garden Controller Cloud (EGC) | 55317 | Gateway (`GatewayCloud`) |
| OASE AquaMax Eco Titanium | 73656 | Bomba de lago (`GardenPump`) |

## Recursos

- Ligar e desligar cada bomba
- Definir a velocidade da bomba de 0–100 %
- Ler telemetria ao vivo: potência (W), velocidade do motor (rpm), temperatura (°C) e tensão de rede (V)
- Ver o status da conexão e do dispositivo
- As bombas mantêm os nomes que você atribuiu a elas no aplicativo OASE

## Autenticação na nuvem

A nuvem OASE usa **Azure AD B2C** (`account.oase.com`). O adaptador autentica-se com a concessão de refresh-token: capture um refresh token uma vez a partir de um login no aplicativo OASE e cole-o nas configurações do adaptador (armazenado de forma criptografada). **A senha da sua conta nunca é inserida ou armazenada pelo adaptador.**

## Configuração

| Configuração | Descrição |
| --- | --- |
| Modo de conexão | `cloud`, `local` ou `both` |
| Intervalo de polling | Intervalo de polling em segundos (padrão 30) |
| Refresh token da nuvem | Capturado a partir de um login no aplicativo OASE (armazenado de forma criptografada) |
| IP do controlador | Endereço IP do gateway EGC (modo local) |
| Senha do dispositivo | Senha do dispositivo para autenticação local (armazenada de forma criptografada) |
| Endereço de bind / porta | Servidor TLS local ao qual o controlador se reconecta |

## Documentação

Manual para iniciantes: [English](../handbook/en/manual.md) · [Deutsch](../handbook/de/manual.md).

A documentação completa e o changelog estão no [English README](../../README.md).
