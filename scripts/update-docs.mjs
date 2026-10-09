#!/usr/bin/env node
/**
 * 从上游仓库 bili_travail（open_live 分支）拉取源码，根据修改内容自动生成本站文档。
 *
 * 文档按控制面板的「标签页」组织：每个标签页生成一个独立页面，
 * 将配置项、开关、按钮、颜色、玩法集中在该标签页下展示，与程序界面保持一致。
 *
 * 生成内容：
 *   1. changelog.md   — 更新日志（changelog.json）
 *   2. version.md     — 版本信息（version.json）
 *   3. main.md        — 主界面（倒计时控制 + 悬浮按钮）
 *   4. {tab}.md       — 控制面板各标签页（账号/礼物/显示/外观/统计/程序/模拟）
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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUTTON_DESCRIPTIONS,
  BUTTON_ORDER,
  SWITCH_DESCRIPTIONS,
  SWITCH_ORDER,
  PLAY_DESCRIPTIONS,
  CONFIG_EXTRA_DESCRIPTIONS,
  MAIN_PAGE,
  CONTROL_TABS,
  frontmatter,
} from './doc-definitions.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// 上游仓库信息
const UPSTREAM_REPO = process.env.UPSTREAM_REPO || 'https://github.com/Nya-WSL/bili_travail.git';
const UPSTREAM_BRANCH = process.env.UPSTREAM_BRANCH || 'open_live';

// 目标文档文件
const DOCS_DIR = join(REPO_ROOT, 'src/content/docs/guides');
const DOC_TARGETS = {
  changelog: join(DOCS_DIR, 'changelog.md'),
  version: join(DOCS_DIR, 'version.md'),
  main: join(DOCS_DIR, 'main.md'),
  otherConfig: join(DOCS_DIR, 'other-config.md'),
  ...Object.fromEntries(CONTROL_TABS.map((t) => [t.filename.replace('.md', ''), join(DOCS_DIR, t.filename)])),
};

const TEMP_DIR = join(REPO_ROOT, '.tmp-upstream');

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function log(msg) {
  console.log(`[update-docs] ${msg}`);
}

/** 拉取上游仓库指定分支到临时目录（浅克隆） */
function fetchUpstream() {
  rmSync(TEMP_DIR, { recursive: true, force: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  let repoUrl = UPSTREAM_REPO;
  if (process.env.GITHUB_TOKEN) {
    const user = process.env.GITHUB_USERNAME || 'x-access-token';
    repoUrl = UPSTREAM_REPO.replace(/^https:\/\//, `https://${user}:${process.env.GITHUB_TOKEN}@`);
  }

  log(`克隆上游 ${UPSTREAM_BRANCH} 分支...`);
  sh(`git clone --depth 1 --branch "${UPSTREAM_BRANCH}" "${repoUrl}" "${TEMP_DIR}"`);
  log('上游源码拉取完成');
}

/** 从源码中提取某个 ui 控件及其字符串标签（去重、保留顺序） */
function extractUiLabels(src, component) {
  const labels = [];
  const seen = new Set();
  const re = new RegExp(`ui\\.${component}\\(\\s*["']([^"']+)["']`, 'g');
  let m;
  while ((m = re.exec(src)) !== null) {
    const label = m[1].trim();
    if (label && !seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

/** 提取 color_input 的 label */
function extractColorInputs(src) {
  const labels = [];
  const seen = new Set();
  const re = /ui\.color_input\([^)]*?label\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const label = m[1].trim();
    if (label && !seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

/** 提取配置项（libs/config.py）：table + key + comment + defaultRaw */
function extractConfigItems(configSrc) {
  const items = []; // { table, key, comment, defaultRaw }

  // doc.add("table", var)
  const docAdds = [...configSrc.matchAll(/doc\.add\(\s*["'](\w+)["']\s*,\s*(\w+)\s*\)/g)];
  for (const [, tableName, varName] of docAdds) {
    const addRe = new RegExp(
      `${varName}\\.(?:add|raw_append)\\(\\s*["']([^"']+)["']\\s*,\\s*((?:item\\([^)]*\\)|"[^"]*"|'[^']*'|\\[[^\\]]*\\]|[^,\\n)]+))`,
      'g'
    );
    let m;
    while ((m = addRe.exec(configSrc)) !== null) {
      const key = m[1];
      // 默认值：去掉 item() 包装，保留字面量；若是变量引用则解析其值
      let defaultRaw = m[2].trim();
      const itemWrap = defaultRaw.match(/^item\((.+)\)$/);
      if (itemWrap) defaultRaw = itemWrap[1];
      if (/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(defaultRaw)) {
        // 形如 bool_tbl.raw_append("x", _var)，查找 _var = item(值)
        const varRe = new RegExp(`^\\s*${defaultRaw}\\s*=\\s*(.+)$`, 'm');
        const vmatch = configSrc.match(varRe);
        if (vmatch) {
          let val = vmatch[1].trim();
          const vw = val.match(/^item\((.+)\)$/);
          if (vw) val = vw[1];
          defaultRaw = val;
        }
      }
      // 查找注释（按匹配度从精确到回退）：
      // 1) raw_append 变量形式：_var.comment("...")，避免把下一个配置项的注释误配给当前项
      // 2) add 表键形式：table["key"].comment("...")
      // 3) 回退：紧随其后的 .comment("...")
      let comment = '';
      const valueExpr = m[2].trim();
      if (/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(valueExpr)) {
        const varCommentRe = new RegExp(
          `\\b${valueExpr}\\s*\\.comment\\(\\s*["']([^"']*)["']\\s*\\)`
        );
        const cm = configSrc.match(varCommentRe);
        if (cm) comment = cm[1];
      }
      if (!comment) {
        const tblCommentRe = new RegExp(
          `${tableName}\\s*\\[\\s*["']${key}["']\\s*\\]\\s*\\.comment\\(\\s*["']([^"']*)["']\\s*\\)`
        );
        const cm = configSrc.match(tblCommentRe);
        if (cm) comment = cm[1];
      }
      if (!comment) {
        const rest = configSrc.slice(m.index, m.index + 600);
        const cmt = rest.match(/\.comment\(\s*["']([^"']*)["']\s*\)/);
        if (cmt) comment = cmt[1];
      }
      items.push({
        table: tableName,
        key,
        comment,
        defaultRaw,
      });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// 渲染函数
// ---------------------------------------------------------------------------

/** 更新日志（最新在前） */
function renderChangelog(data) {
  const lines = [
    frontmatter(
      '更新日志',
      12,
      `https://github.com/Nya-WSL/bili_travail/blob/${UPSTREAM_BRANCH}/changelog.json`,
      `bili_travail/changelog.json`
    ),
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

/** 版本信息 */
function renderVersion(version) {
  return [
    frontmatter(
      '版本信息',
      13,
      `https://github.com/Nya-WSL/bili_travail/blob/${UPSTREAM_BRANCH}/version.json`,
      `bili_travail/version.json`
    ),
    `当前版本：\`${version}\``,
    '',
  ].join('\n');
}

/** 渲染单个配置项表格行 */
function renderConfigRow(item) {
  const extra = CONFIG_EXTRA_DESCRIPTIONS[item.key];
  const desc = extra || item.comment || '—';
  return `| \`${item.key}\` | \`${item.defaultRaw}\` | ${desc} |`;
}

/** 按给定 key 列表取配置项子集（保持标签页声明顺序），返回渲染行数组 */
function renderConfigRows(items, keys) {
  const rows = [];
  for (const key of keys) {
    const item = items.find((it) => it.key === key);
    if (item) rows.push(renderConfigRow(item));
  }
  return rows;
}

/** 全部已映射到标签页的配置项 key（用于检测是否有多余项） */
const MAPPED_CONFIG_KEYS = CONTROL_TABS.flatMap((t) => t.config);

/** 渲染控件列表（按 order 排序，未收录的追加到末尾并标注自动识别） */
function renderControlList(labels, descriptions, order) {
  const ordered = [];
  for (const name of order) {
    if (labels.includes(name) && !ordered.includes(name)) ordered.push(name);
  }
  for (const name of labels) {
    if (!ordered.includes(name)) ordered.push(name);
  }
  return ordered.map((name) => {
    const desc = descriptions[name];
    return desc
      ? `- **${name}**：${desc}`
      : `- **${name}**：*（自动识别的新控件，待补充说明）*`;
  });
}

/** 渲染颜色设置列表 */
function renderColorList(colorLabels, order) {
  const colorTargets = {
    '计时颜色': '倒计时数字的颜色',
    '按钮颜色': '界面按钮的颜色',
    '背景颜色': '界面背景的颜色',
    '主界面字体颜色': '主界面字体颜色',
    '子页面字体颜色': '子页面字体颜色',
  };
  const ordered = [];
  for (const c of order) {
    if (colorLabels.includes(c) && !ordered.includes(c)) ordered.push(c);
  }
  for (const c of colorLabels) {
    if (!ordered.includes(c)) ordered.push(c);
  }
  return ordered.map((c) => `- **${c}**：自定义${colorTargets[c] || `${c}颜色`}`);
}

/**
 * 渲染单个标签页文档。
 * 将配置项 / 开关 / 按钮 / 颜色 / 玩法集中到同一页面，与程序界面标签页一致。
 */
function renderTab(tab, configItems, switchLabels, buttonLabels, colorLabels, playLabels) {
  const lines = [
    frontmatter(
      tab.label,
      tab.order,
      `https://github.com/Nya-WSL/bili_travail/blob/${UPSTREAM_BRANCH}/main.py`,
      `bili_travail/main.py`
    ),
    `### 概述`,
    '',
    tab.intro,
    '',
  ];

  // 配置项
  const configRows = renderConfigRows(configItems, tab.config);
  if (configRows.length) {
    lines.push('## 配置项');
    lines.push('');
    lines.push('| 配置项 | 默认值 | 说明 |');
    lines.push('| ------ | ------ | ---- |');
    lines.push(...configRows);
    lines.push('');
  }

  // 开关
  if (tab.switches.length) {
    lines.push('## 开关');
    lines.push('');
    lines.push(...renderControlList(tab.switches, SWITCH_DESCRIPTIONS, SWITCH_ORDER));
    lines.push('');
  }

  // 按钮
  if (tab.buttons.length) {
    lines.push('## 按钮');
    lines.push('');
    lines.push(...renderControlList(tab.buttons, BUTTON_DESCRIPTIONS, BUTTON_ORDER));
    lines.push('');
  }

  // 颜色
  if (tab.colors.length) {
    lines.push('## 颜色设置');
    lines.push('');
    lines.push(...renderColorList(tab.colors, tab.colors));
    lines.push('');
  }

  // 玩法
  if (tab.plays.length) {
    lines.push('## 玩法');
    lines.push('');
    lines.push(...renderControlList(tab.plays, PLAY_DESCRIPTIONS, tab.plays));
    lines.push('');
  }

  // 附加说明
  if (tab.notes) {
    lines.push(tab.notes);
    lines.push('');
  }

  return lines.join('\n');
}

/** 兜底：未映射到任何标签页的配置项（防遗漏） */
function renderConfigLeftovers(items) {
  const leftover = items.filter((it) => !MAPPED_CONFIG_KEYS.includes(it.key));
  if (!leftover.length) return '';
  const lines = [
    frontmatter(
      '其他配置',
      14,
      `https://github.com/Nya-WSL/bili_travail/blob/${UPSTREAM_BRANCH}/libs/config.py`,
      `bili_travail/libs/config.py`
    ),
    '以下配置项尚未映射到任何控制面板标签页，属自动识别的新增项，待维护者补充。',
    '',
    '| 配置项 | 默认值 | 说明 |',
    '| ------ | ------ | ---- |',
  ];
  for (const item of leftover) lines.push(renderConfigRow(item));
  lines.push('');
  return lines.join('\n');
}

/** 主界面页：倒计时控制按钮 + 悬浮按钮 */
function renderMain(configItems, buttonLabels, playLabels) {
  const lines = [
    frontmatter(
      MAIN_PAGE.label,
      MAIN_PAGE.order,
      `https://github.com/Nya-WSL/bili_travail/blob/${UPSTREAM_BRANCH}/main.py`,
      `bili_travail/main.py`
    ),
    `### 概述`,
    '',
    MAIN_PAGE.intro,
    '',
  ];

  lines.push('## 按钮');
  lines.push('');
  lines.push(...renderControlList(MAIN_PAGE.buttons, BUTTON_DESCRIPTIONS, BUTTON_ORDER));
  lines.push('');

  if (MAIN_PAGE.fab.length) {
    lines.push('### 悬浮按钮');
    lines.push('');
    lines.push(...renderControlList(MAIN_PAGE.fab, BUTTON_DESCRIPTIONS, MAIN_PAGE.fab));
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 提交推送
// ---------------------------------------------------------------------------

function commitAndPush() {
  const targetFiles = Object.values(DOC_TARGETS);
  const status = sh(`git -C "${REPO_ROOT}" status --porcelain -- ${targetFiles.join(' ')}`);
  if (!status.trim()) {
    log('目标文档无变更，跳过提交');
    return false;
  }

  const name = process.env.CNB_COMMITTER || 'CodeBuddy';
  const email = process.env.CNB_COMMITTER_EMAIL || 'codebuddy@cnb.cool';

  sh(`git -C "${REPO_ROOT}" add ${targetFiles.map((f) => `"${f}"`).join(' ')}`);
  sh(`git -C "${REPO_ROOT}" -c user.name="${name}" -c user.email="${email}" commit -m "docs: 自动同步 bili_travail ${UPSTREAM_BRANCH} 文档"`);

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

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  fetchUpstream();

  const mainSrc = readFileSync(join(TEMP_DIR, 'main.py'), 'utf8');
  const configSrc = readFileSync(join(TEMP_DIR, 'libs/config.py'), 'utf8');

  // 1. changelog / version
  const changelogRaw = readFileSync(join(TEMP_DIR, 'changelog.json'), 'utf8');
  const changelog = JSON.parse(changelogRaw);
  writeFileSync(DOC_TARGETS.changelog, renderChangelog(changelog), 'utf8');
  log(`更新日志已写入（共 ${Object.keys(changelog).length} 个版本）`);

  const versionRaw = readFileSync(join(TEMP_DIR, 'version.json'), 'utf8');
  const version = JSON.parse(versionRaw).version || versionRaw.trim();
  writeFileSync(DOC_TARGETS.version, renderVersion(version), 'utf8');
  log(`版本信息已写入（${version}）`);

  // 2. 提取控件
  const configItems = extractConfigItems(configSrc);
  const buttonLabels = extractUiLabels(mainSrc, 'button');
  const switchLabels = extractUiLabels(mainSrc, 'switch');
  const colorLabels = extractColorInputs(mainSrc);
  const toggleRe = /ui\.toggle\([^)]*?options\s*=\s*\{([^}]*)\}/g;
  const playLabels = [];
  {
    const seen = new Set();
    let m;
    while ((m = toggleRe.exec(mainSrc)) !== null) {
      for (const [, , label] of m[1].matchAll(/["'](\w+)["']\s*:\s*["']([^"']+)["']/g)) {
        if (!seen.has(label)) {
          seen.add(label);
          playLabels.push(label);
        }
      }
    }
  }

  // 3. 主界面
  writeFileSync(DOC_TARGETS.main, renderMain(configItems, buttonLabels, playLabels), 'utf8');
  log(`主界面已写入`);

  // 4. 各标签页
  for (const tab of CONTROL_TABS) {
    const key = tab.filename.replace('.md', '');
    writeFileSync(DOC_TARGETS[key], renderTab(tab, configItems, switchLabels, buttonLabels, colorLabels, playLabels), 'utf8');
    log(`标签页「${tab.label}」已写入（${tab.filename}）`);
  }

  // 5. 兜底配置项
  const leftoverMd = renderConfigLeftovers(configItems);
  if (leftoverMd) {
    writeFileSync(DOC_TARGETS.otherConfig, leftoverMd, 'utf8');
    log('存在未映射配置项，已生成「其他配置」页面');
  }

  log(
    `控件提取：按钮 ${buttonLabels.length}，开关 ${switchLabels.length}，玩法 ${playLabels.length}，颜色 ${colorLabels.length}，配置项 ${configItems.length}`
  );

  // 输出本次生成的变更摘要（对比已提交版本），便于 CI 日志观察
  const changedDocs = [];
  for (const [name, file] of Object.entries(DOC_TARGETS)) {
    let changed = false;
    try {
      changed = sh(`git -C "${REPO_ROOT}" diff --quiet HEAD -- "${file}"`).trim() !== '';
    } catch {
      changed = true; // 文件不存在于 HEAD（新增）
    }
    if (changed) changedDocs.push(name);
  }
  log(
    changedDocs.length
      ? `本次生成变更文档：${changedDocs.join(', ')}`
      : '本次生成无变更（与已提交版本一致）'
  );

  rmSync(TEMP_DIR, { recursive: true, force: true });

  commitAndPush();
}

main();
