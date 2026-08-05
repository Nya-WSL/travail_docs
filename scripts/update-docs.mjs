#!/usr/bin/env node
/**
 * 从上游仓库 bili_travail（open_live 分支）拉取最新数据并更新本站文档。
 *
 * 主要工作：
 *   1. 拉取上游 changelog.json，重写 src/content/docs/guides/changelog.md（最新在前）
 *   2. 拉取上游 version.json，更新 src/content/docs/guides/version.md
 *
 * 用法：
 *   node scripts/update-docs.mjs [--repo <url>] [--branch <name>]
 *
 * 环境变量：
 *   UPSTREAM_REPO   上游仓库地址（默认 https://github.com/Nya-WSL/bili_travail.git）
 *   UPSTREAM_BRANCH 上游分支（默认 open_live）
 *   GITHUB_TOKEN    （可选）上游为私有仓库时用于认证
 *   ALLOW_PUSH      设为 1 时才执行 git 提交并推送（CNB 流水线中开启，本地默认只生成不推送）
 *
 * 推送时使用 CNB 流水线内置凭据：
 *   CNB_TOKEN / CNB_TOKEN_USER_NAME / CNB_WEB_HOST / CNB_REPO_SLUG / CNB_BRANCH
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// 上游仓库信息
const UPSTREAM_REPO = process.env.UPSTREAM_REPO || 'https://github.com/Nya-WSL/bili_travail.git';
const UPSTREAM_BRANCH = process.env.UPSTREAM_BRANCH || 'open_live';

// 目标文档文件
const CHANGELOG_DOC = join(REPO_ROOT, 'src/content/docs/guides/changelog.md');
const VERSION_DOC = join(REPO_ROOT, 'src/content/docs/guides/version.md');

const TEMP_DIR = join(REPO_ROOT, '.tmp-upstream');

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function log(msg) {
  console.log(`[update-docs] ${msg}`);
}

/** 拉取上游仓库指定分支到临时目录（浅克隆 + 稀疏检出，仅需要的数据文件） */
function fetchUpstream() {
  rmSync(TEMP_DIR, { recursive: true, force: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  // 组装认证 URL：提供 GITHUB_TOKEN 时用于私有仓库，公开仓库可留空
  let repoUrl = UPSTREAM_REPO;
  if (process.env.GITHUB_TOKEN) {
    const user = process.env.GITHUB_USERNAME || 'x-access-token';
    repoUrl = UPSTREAM_REPO.replace(/^https:\/\//, `https://${user}:${process.env.GITHUB_TOKEN}@`);
  }

  log(`克隆上游 ${UPSTREAM_BRANCH} 分支...`);
  sh(`git clone --depth 1 --branch "${UPSTREAM_BRANCH}" "${repoUrl}" "${TEMP_DIR}"`);
  log('上游数据拉取完成');
}

/** 生成更新日志 Markdown（最新在前） */
function renderChangelog(data) {
  const lines = [
    '---',
    'title: 更新日志',
    'sidebar:',
    '  order: 4',
    '---',
    '',
    '> 本文档由脚本自动生成，数据来源于 [bili_travail/changelog.json](https://github.com/Nya-WSL/bili_travail/blob/open_live/changelog.json)。',
    '> 若与上游不一致，请以 [上游更新日志](https://github.com/Nya-WSL/bili_travail/blob/open_live/changelog.json) 为准。',
    '',
  ];

  for (const [version, entry] of Object.entries(data)) {
    const date = entry.date || entry.data || '未知日期';
    lines.push(`## ${version}`);
    lines.push('');
    lines.push(`> 更新日期：${date}`);
    lines.push('');
    for (const item of entry.content || []) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** 生成版本信息 Markdown */
function renderVersion(version) {
  return [
    '---',
    'title: 版本信息',
    'sidebar:',
    '  order: 5',
    '---',
    '',
    '> 本文档由脚本自动生成，数据来源于 [bili_travail/version.json](https://github.com/Nya-WSL/bili_travail/blob/open_live/version.json)。',
    '',
    `当前版本：\`${version}\``,
    '',
  ].join('\n');
}

/** 提交并推送文档变更（仅当 ALLOW_PUSH=1 且存在 CNB_TOKEN 时推送） */
function commitAndPush() {
  // 仅检查目标文档是否发生变化（其他文件的改动不影响是否提交）
  const targetFiles = [CHANGELOG_DOC, VERSION_DOC];
  const status = sh(`git -C "${REPO_ROOT}" status --porcelain -- ${targetFiles.join(' ')}`);
  if (!status.trim()) {
    log('目标文档无变更，跳过提交');
    return false;
  }

  // 配置 git 身份（用 -c 临时参数，避免改动仓库配置）
  const name = process.env.CNB_COMMITTER || 'CodeBuddy';
  const email = process.env.CNB_COMMITTER_EMAIL || 'codebuddy@cnb.cool';

  sh(`git -C "${REPO_ROOT}" add "${CHANGELOG_DOC}" "${VERSION_DOC}"`);
  sh(`git -C "${REPO_ROOT}" -c user.name="${name}" -c user.email="${email}" commit -m "docs: 自动同步 bili_travail ${UPSTREAM_BRANCH} 更新日志"`);

  if (process.env.ALLOW_PUSH !== '1' || !process.env.CNB_TOKEN) {
    log('未开启推送（ALLOW_PUSH != 1 或缺少 CNB_TOKEN），仅本地提交');
    return true;
  }

  const host = process.env.CNB_WEB_HOST || 'cnb.cool';
  const slug = process.env.CNB_REPO_SLUG;
  const branch = process.env.CNB_BRANCH || 'master';
  const user = process.env.CNB_TOKEN_USER_NAME || 'cnb';
  const pushUrl = `https://${user}:${process.env.CNB_TOKEN}@${host}/${slug}.git`;

  log(`推送至 CNB 仓库 ${slug} 的 ${branch} 分支...`);
  sh(`git -C "${REPO_ROOT}" push "${pushUrl}" HEAD:${branch}`);
  log('推送成功');
  return true;
}

function main() {
  fetchUpstream();

  const changelogRaw = readFileSync(join(TEMP_DIR, 'changelog.json'), 'utf8');
  const changelog = JSON.parse(changelogRaw);
  writeFileSync(CHANGELOG_DOC, renderChangelog(changelog), 'utf8');
  log(`更新日志已写入 ${CHANGELOG_DOC}（共 ${Object.keys(changelog).length} 个版本）`);

  const versionRaw = readFileSync(join(TEMP_DIR, 'version.json'), 'utf8');
  const version = JSON.parse(versionRaw).version || versionRaw.trim();
  writeFileSync(VERSION_DOC, renderVersion(version), 'utf8');
  log(`版本信息已写入 ${VERSION_DOC}（${version}）`);

  rmSync(TEMP_DIR, { recursive: true, force: true });

  commitAndPush();
}

main();
