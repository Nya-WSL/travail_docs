---
title: 程序设置
sidebar:
  order: 9
---

> 本文档由脚本自动生成，数据来源于 [bili_travail/main.py](https://github.com/Nya-WSL/bili_travail/blob/open_live/main.py)。
> 若与上游不一致，请以上游源码为准。

### 概述

账号鉴权、更新检查、API 服务器等程序相关设置。

## 配置项

| 配置项 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `server` | `"http://api.travail.nya-wsl.cn"` | API 服务器地址 |
| `ACCESS_KEY_ID` | `""` | 哔哩哔哩直播开放平台 access_key_id（开发者申请） |
| `ACCESS_KEY_SECRET` | `""` | 哔哩哔哩直播开放平台 access_key_secret（开发者申请） |
| `APP_ID` | `0` | 哔哩哔哩直播开放平台项目 ID |
| `remote_text` | `True` | about页面对话框内容是否从服务器获取 |
| `check_update` | `True` | 是否启用更新检查 |
| `check_sha256` | `True` | 是否启用更新包SHA256校验 |

## 开关

- **自动检查更新**：程序启动时自动检查更新，关闭后可在「检查更新」按钮中手动检查

## 按钮

- **登录账号**：跳转至幻星互动玩法页面获取身份码，需要手动输入身份码
- **检查更新**：手动检查更新，程序会在启动时自动检查一次更新
- **更新日志**：查看更新日志
- **上传日志**：上传日志到服务器，用于调试和反馈问题，只会上传本次运行产生的日志，不会上传历史日志；上传前请确保日志中没有包含敏感数据
