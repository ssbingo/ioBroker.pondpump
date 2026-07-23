# ioBroker.pondpump

> [English README](../../README.md)

---

<p align="center">
  <a href="https://www.buymeacoffee.com/ssbingo"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=ssbingo&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>
</p>

---

通过 **OASE Garden Controller Cloud (EGC)** 控制和监测 **OASE AquaMax Eco Titanium** 池塘泵 —— 支持本地和云端两种方式。

## 免责声明

这是一个**非官方的社区项目**。它与 **OASE GmbH 没有任何形式的关联、认可或支持**。“OASE”、“AquaMax”及相关产品名称均为 OASE GmbH 的商标，此处使用仅为说明设备兼容性。通信协议是独立分析得出的 —— 使用本适配器的风险由您自行承担。

## 支持的硬件

| 设备 | 物料编号 | 角色 |
| --- | --- | --- |
| OASE Garden Controller Cloud (EGC) | 55317 | 网关 (`GatewayCloud`) |
| OASE AquaMax Eco Titanium | 73656 | 池塘泵 (`GardenPump`) |

## 功能特性

- 分别开启和关闭每台泵
- 设置泵的转速为 0–100 %
- 读取实时遥测数据：功率 (W)、电机转速 (rpm)、温度 (°C) 和市电电压 (V)
- 查看连接状态和设备状态
- 泵会保留您在 OASE 应用中为其设置的名称

## 云端身份验证

OASE 云使用 **Azure AD B2C** (`account.oase.com`)。适配器通过 refresh-token 授权方式进行身份验证：从一次 OASE 应用登录中捕获一个 refresh token，并将其粘贴到适配器设置中（以加密方式存储）。**您的账户密码绝不会被输入到适配器中，也不会被适配器存储。**

## 配置

| 设置 | 说明 |
| --- | --- |
| 连接模式 | `cloud`、`local` 或 `both` |
| 轮询间隔 | 轮询间隔（秒，默认 30） |
| 云端 refresh token | 从一次 OASE 应用登录中捕获（以加密方式存储） |
| 控制器 IP | EGC 网关的 IP 地址（本地模式） |
| 设备密码 | 用于本地身份验证的设备密码（以加密方式存储） |
| 绑定地址 / 端口 | 控制器回连的本地 TLS 服务器 |

## 文档

新手手册：[English](../handbook/en/manual.md) · [Deutsch](../handbook/de/manual.md)。

完整文档和更新日志请参见 [English README](../../README.md)。
