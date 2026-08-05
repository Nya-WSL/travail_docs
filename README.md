# travail_docs

B站加班姬（[bili_travail](https://github.com/Nya-WSL/bili_travail)）使用文档站，基于 [Astro Starlight](https://starlight.astro.build) 构建。

## 文档自动同步

本仓库的更新日志 / 版本信息由脚本自动从上游仓库生成，无需手工维护：

| 内容 | 上游来源 | 生成目标 |
|------|---------|---------|
| 更新日志 | [bili_travail/changelog.json](https://github.com/Nya-WSL/bili_travail/blob/open_live/changelog.json) | `src/content/docs/guides/changelog.md` |
| 版本信息 | [bili_travail/version.json](https://github.com/Nya-WSL/bili_travail/blob/open_live/version.json) | `src/content/docs/guides/version.md` |

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
│   └── update-docs.mjs           # 文档生成脚本
├── docs/templates/
│   └── github-sync-docs.yml      # GitHub Actions 实时触发模板
└── src/content/docs/
    ├── guides/                   # 指南（概述 / 初次运行 / 玩法 / FAQ / 更新日志...）
    ├── contact.md
    ├── index.mdx
    └── thanks.mdx
```

## 其他

- 站点：<https://play-live.bilibili.com/details/1765765916387>
- 上游项目：<https://github.com/Nya-WSL/bili_travail>
