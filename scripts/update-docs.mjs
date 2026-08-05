#!/usr/bin/env node
/**
 * 从上游仓库 bili_travail（open_live 分支）拉取源码，根据修改内容自动生成本站文档。
 *
 * 生成内容：
 *   1. changelog.md   — 更新日志（changelog.json）
 *   2. version.md     — 版本信息（version.json）
 *   3. config.md      — 配置文件说明（libs/config.py）
 *   4. button.md      — 控制面板按钮说明（main.py 中 ui.button）
 *   5. switch.md      — 控制面板开关说明（main.py 中 ui.switch）
 *   6. play.md        — 礼物玩法说明（main.py 中礼物设置玩法）
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
  PLAY_ORDER,
  PLAY_NOTES,
  CONFIG_EXTRA_DESCRIPTIONS,
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
  config: join(DOCS_DIR, 'config.md'),
  button: join(DOCS_DIR, 'usage/button.md'),
  switch: join(DOCS_DIR, 'usage/switch.md'),
  play: join(DOCS_DIR, 'usage/play.md'),
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
      // 查找紧随其后的 .comment("...")
      const rest = configSrc.slice(m.index, m.index + 600);
      const cmt = rest.match(/\.comment\(\s*["']([^"']*)["']\s*\)/);
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
      items.push({
        table: tableName,
        key,
        comment: cmt ? cmt[1] : '',
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
      4,
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
      5,
      `https://github.com/Nya-WSL/bili_travail/blob/${UPSTREAM_BRANCH}/version.json`,
      `bili_travail/version.json`
    ),
    `当前版本：\`${version}\``,
    '',
  ].join('\n');
}

/** 配置文件说明（由 libs/config.py 自动生成） */
function renderConfig(items) {
  const lines = [
    frontmatter(
      '配置文件',
      6,
      `https://github.com/Nya-WSL/bili_travail/blob/${UPSTREAM_BRANCH}/libs/config.py`,
      `bili_travail/libs/config.py`
    ),
    '配置文件 `config.toml` 位于程序目录下，首次运行自动生成，缺省项会在启动时自动补齐。',
    '',
  ];

  // 按表分组，保留源码顺序
  const tableOrder = [];
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.table)) {
      groups.set(item.table, []);
      tableOrder.push(item.table);
    }
    groups.get(item.table).push(item);
  }

  for (const table of tableOrder) {
    lines.push(`## ${table}`);
    lines.push('');
    lines.push('| 配置项 | 默认值 | 说明 |');
    lines.push('| ------ | ------ | ---- |');
    for (const item of groups.get(table)) {
      const extra = CONFIG_EXTRA_DESCRIPTIONS[item.key] || '';
      // 源码注释与补充说明可能重复，去重拼接
      const descParts = [item.comment, extra].filter(Boolean);
      const desc = [...new Set(descParts)].join('；') || '—';
      lines.push(`| \`${item.key}\` | \`${item.defaultRaw}\` | ${desc} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** 通用控件列表渲染 */
function renderControls(labels, descriptions, order, sectionTitle) {
  const lines = [`## ${sectionTitle}`, ''];

  const ordered = [];
  for (const name of order) {
    if (labels.includes(name)) ordered.push(name);
  }
  for (const name of labels) {
    if (!ordered.includes(name)) ordered.push(name);
  }

  for (const name of ordered) {
    const desc = descriptions[name];
    if (desc) {
      lines.push(`- **${name}**：${desc}`);
    } else {
      lines.push(`- **${name}**：*（自动识别的新控件，待补充说明）*`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** 按钮页 */
function renderButton(buttonLabels, colorLabels) {
  const lines = [
    frontmatter(
      '按钮',
      2,
      `https://github.com/Nya-WSL/bili_travail/blob/${UPSTREAM_BRANCH}/main.py`,
      `bili_travail/main.py`
    ),
  ];
  lines.push(renderControls(buttonLabels, BUTTON_DESCRIPTIONS, BUTTON_ORDER, '按钮'));

  // 颜色设置
  const colorNames = colorLabels.length ? colorLabels : ['计时颜色', '按钮颜色', '文字颜色', '背景颜色'];
  lines.push('### 颜色设置');
  lines.push('');
  const colorTargets = {
    '计时颜色': '倒计时数字的颜色',
    '按钮颜色': '界面按钮的颜色',
    '文字颜色': '界面文字的颜色',
    '背景颜色': '界面背景的颜色',
  };
  for (const c of colorNames) {
    lines.push(`- **${c}**：自定义${colorTargets[c] || `${c}颜色`}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** 开关页 */
function renderSwitch(switchLabels) {
  const lines = [
    frontmatter(
      '开关',
      3,
      `https://github.com/Nya-WSL/bili_travail/blob/${UPSTREAM_BRANCH}/main.py`,
      `bili_travail/main.py`
    ),
  ];
  lines.push(renderControls(switchLabels, SWITCH_DESCRIPTIONS, SWITCH_ORDER, '开关'));
  return lines.join('\n');
}

/** 玩法页 */
function renderPlay(playLabels) {
  const lines = [
    frontmatter(
      '玩法',
      4,
      `https://github.com/Nya-WSL/bili_travail/blob/${UPSTREAM_BRANCH}/main.py`,
      `bili_travail/main.py`
    ),
    '### 倒计时（倒计时所有单位都是秒）',
    '',
  ];
  for (const name of PLAY_ORDER) {
    if (playLabels.includes(name)) {
      lines.push(`- **${name}**：${PLAY_DESCRIPTIONS[name]}`);
    }
  }
  // 未在描述库中但有定义的新玩法
  for (const name of playLabels) {
    if (!PLAY_ORDER.includes(name)) {
      lines.push(`- **${name}**：*（自动识别的新玩法，待补充说明）*`);
    }
  }
  lines.push('');

  // 附加玩法说明（随机权重 / 盲盒等）
  lines.push(PLAY_NOTES);
  lines.push('');
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

  // 2. config
  const configItems = extractConfigItems(configSrc);
  writeFileSync(DOC_TARGETS.config, renderConfig(configItems), 'utf8');
  log(`配置文件说明已写入（${configItems.length} 个配置项）`);

  // 3. button / switch / play
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

  writeFileSync(DOC_TARGETS.button, renderButton(buttonLabels, colorLabels), 'utf8');
  writeFileSync(DOC_TARGETS.switch, renderSwitch(switchLabels), 'utf8');
  writeFileSync(DOC_TARGETS.play, renderPlay(playLabels), 'utf8');
  log(
    `控件说明已写入（按钮 ${buttonLabels.length}，开关 ${switchLabels.length}，玩法 ${playLabels.length}，颜色 ${colorLabels.length}）`
  );

  rmSync(TEMP_DIR, { recursive: true, force: true });

  commitAndPush();
}

main();
