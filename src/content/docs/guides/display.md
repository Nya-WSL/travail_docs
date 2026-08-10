---
title: 显示设置
sidebar:
  order: 6
---

> 本文档由脚本自动生成，数据来源于 [bili_travail/main.py](https://github.com/Nya-WSL/bili_travail/blob/open_live/main.py)。
> 若与上游不一致，请以上游源码为准。

### 概述

OBS 浏览器源中倒计时与礼物列表的显示相关设置。

## 配置项

| 配置项 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `show_capture_gift_list` | `False` | 是否在 OBS 浏览器源显示收到礼物列表 |
| `show_capture_rank_list` | `False` | 是否在 OBS 浏览器源显示排行榜 |
| `borderless_cd` | `False` | 倒计时是否无边框 |
| `capture_gift_list_number` | `3` | 收到礼物列表显示数量 |

## 开关

- **无边框倒计时**：切换倒计时的显示模式，无边框倒计时使用 label 实现，边框使用 badge 实现；启用时 OBS 页面倒计时不显示边框，仅显示数字
- **OBS显示排行榜**：是否在 OBS 浏览器源中显示礼物排行榜
- **OBS显示投喂记录**：是否在 OBS 浏览器源中显示礼物投喂记录
