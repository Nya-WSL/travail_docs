# travail_docs

B站加班姬（[bili_travail](https://github.com/Nya-WSL/bili_travail)）使用文档站，基于 [Astro Starlight](https://starlight.astro.build) 构建。

## 文档自动同步

本仓库的文档由脚本自动从上游仓库 [bili_travail](https://github.com/Nya-WSL/bili_travail)（`open_live` 分支）生成，无需手工维护：

| 文档 | 上游来源 | 生成说明 |
|------|---------|---------|
| 更新日志 | `changelog.json` | 按版本列出更新内容 |
| 版本信息 | `version.json` | 当前版本号 |
| 主界面 | `main.py`（`ui.button`） | 倒计时控制按钮、悬浮按钮 |
| 控制面板各标签页 | `main.py` + `libs/config.py` | 按标签页（账号/礼物/显示/外观/统计/程序/模拟）集中展示配置项、开关、按钮、颜色、玩法 |

> 生成规则：解析上游源码中的 `ui.button` / `ui.switch` / `ui.color_input` / `ui.toggle` 与
> `libs/config.py` 配置定义，结合 `scripts/doc-definitions.mjs` 中的 `CONTROL_TABS` 标签页映射与功能描述映射，
> 按控制面板标签页生成对应 Markdown 文档；上游新增控件时脚本会自动识别并追加，
> 若缺少描述会标注「待补充说明」，提示维护者更新描述库。

### 触发方式

1. **定时轮询（默认，开箱即用）**
   流水线 `master` 分支下配置了 crontab，每 30 分钟检查一次上游
   `open_live` 分支，有新内容时自动生成文档并推送回本仓库 master；
   master 变更又会触发 git-sync 流水线把文档同步到
   [GitHub travail_docs](https://github.com/Nya-WSL/travail_docs)。

2. **实时触发（可选，秒级）**
   如需在 `bili_travail@open_live` 收到 push 时立即同步，可在该仓库配置
   [GitHub Actions 模板](docs/templates/github-sync-docs.yml)，
   通过 CNB OpenAPI 触发本仓库 `api_trigger_sync_docs` 流水线。

### 本地手动生成

```bash
node scripts/update-docs.mjs
```

脚本支持以下环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `UPSTREAM_REPO` | `https://github.com/Nya-WSL/bili_travail.git` | 上游仓库地址 |
| `UPSTREAM_BRANCH` | `open_live` | 上游分支 |
| `GITHUB_TOKEN` | - | 上游为私有仓库时的访问令牌 |
| `ALLOW_PUSH` | - | 设为 `1` 时提交并推送（CNB 流水线中开启） |

## 本地开发

```bash
npm install
npm run dev        # 启动本地开发服务器 http://localhost:4321
npm run build      # 构建生产站点到 ./dist/
```

## 项目结构

```
.
├── .cnb.yml                      # CNB 流水线（git-sync + 文档自动同步）
├── scripts/
│   ├── update-docs.mjs           # 文档生成脚本（拉取上游源码并生成文档）
│   └── doc-definitions.mjs       # 控件功能描述库（标签页映射/按钮/开关/玩法/配置说明）
├── docs/templates/
│   └── github-sync-docs.yml      # GitHub Actions 实时触发模板
└── src/content/docs/
    ├── guides/                   # 指南（概述 / 主界面 / 各标签页 / FAQ / 更新日志...）
    ├── contact.md
    ├── index.mdx
    └── thanks.mdx
```

## 其他

- 站点：<https://play-live.bilibili.com/details/1765765916387>
- 上游项目：<https://github.com/Nya-WSL/bili_travail>
