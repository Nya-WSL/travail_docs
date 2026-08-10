---
title: 配置文件
sidebar:
  order: 6
---

> 本文档由脚本自动生成，数据来源于 [bili_travail/libs/config.py](https://github.com/Nya-WSL/bili_travail/blob/open_live/libs/config.py)。
> 若与上游不一致，请以上游源码为准。

配置文件 `config.toml` 位于程序目录下，首次运行自动生成，缺省项会在启动时自动补齐。

以下配置项按控制面板的标签页分组展示。

## 账号设置

| 配置项 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `room_id` | `""` | 房间号，程序会据此获取礼物数据 |
| `host` | `"127.0.0.1"` | 监听地址，默认本机 |
| `port` | `65000` | 监听端口，控制面板与 OBS 浏览器源的访问端口 |
| `auth_code` | `""` | 主播身份码，从幻星互动玩法页面获取 |
| `exit_timer` | `True` | 是否启用倒计时结束后退出程序 |
| `exit_time` | `1800` | 倒计时结束后退出程序的等待时间（秒） |

## 礼物设置

| 配置项 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `short_list` | `False` | 礼物列表简洁模式（存在 bug，当前版本禁用） |
| `short_time` | `5` | 简洁模式滚动间隔（秒） |

## 显示设置

| 配置项 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `show_capture_gift_list` | `False` | 是否在 OBS 浏览器源显示收到礼物列表 |
| `show_capture_rank_list` | `False` | 是否在 OBS 浏览器源显示排行榜 |
| `borderless_cd` | `False` | 倒计时是否无边框 |
| `capture_gift_list_number` | `3` | 收到礼物列表显示数量 |

## 外观设置

| 配置项 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `background_image` | `array()` | 背景图片路径，支持相对路径 |
| `time_color` | `"#9BA89A"` | 倒计时颜色 |
| `btn_color` | `"#7A8FA0"` | 按钮颜色 |
| `main_text_color` | `"#000000"` | 主界面字体颜色 |
| `text_color` | `"#4A4A4A"` | 子页面字体颜色 |
| `bg_color` | `"#FCFCFA"` | 背景颜色 |

## 程序设置

| 配置项 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `server` | `"http://api.travail.nya-wsl.cn"` | API 服务器地址 |
| `ACCESS_KEY_ID` | `""` | 哔哩哔哩直播开放平台 access_key_id（开发者申请） |
| `ACCESS_KEY_SECRET` | `""` | 哔哩哔哩直播开放平台 access_key_secret（开发者申请） |
| `APP_ID` | `0` | 哔哩哔哩直播开放平台项目 ID |
| `remote_text` | `True` | about页面对话框内容是否从服务器获取 |
| `check_update` | `True` | 是否启用更新检查 |
| `check_sha256` | `True` | 是否启用更新包SHA256校验 |
