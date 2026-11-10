import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const globRegex = (glob) => new RegExp('^' + glob.split('**/').map((part) =>
  part.split('**').map((segment) => segment.split('*').map(escapeRegex).join('[^/]*')).join('.*'),
).join('(?:.*/)?') + '$', 'i');
const scopes = {
  ui: ['apps/desktop/src/**/*.ts', 'apps/desktop/src/**/*.tsx'],
  rust: ['apps/desktop/src-tauri/src/**/*.rs', 'apps/desktop/src-tauri/tests/**/*.rs'],
  core: ['packages/core/src/**/*.ts'],
  website: ['apps/website/src/**/*.ts', 'apps/website/src/**/*.tsx', 'apps/website/src/**/*.astro'],
  meta: ['apps/desktop/src-tauri/tauri.conf.json', 'package.json', 'apps/desktop/package.json', 'apps/desktop/src-tauri/Cargo.toml', 'apps/desktop/index.html'],
  docs: ['README.md', 'docs/**/*.md', 'CHANGELOG.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md'],
  e2e: ['tests/e2e/**/*.ts'],
  test: ['tests/unit/**/*.ts'],
};

function lines(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
}

function configLines(file) {
  return lines(file).filter((line) => line.trim() && !line.trimStart().startsWith('#'));
}

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!['.git', 'node_modules', 'target', 'dist'].includes(entry.name)) files.push(...sourceFiles(full));
    } else if (entry.isFile()) files.push(full);
  }
  return files;
}

export function localize({ repo = process.cwd(), dictDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../zh-dict'), includeClaudeMd = false } = {}) {
  repo = fs.realpathSync(repo);
  if (!fs.statSync(repo).isDirectory()) throw new Error(`源码目录不存在：${repo}`);
  dictDir = fs.realpathSync(dictDir);
  const protect = configLines(path.join(dictDir, 'protect.txt')).map((rule) => new RegExp(rule, 'g'));
  const skip = configLines(path.join(dictDir, 'skip-files.txt')).map(globRegex);
  // Validate every rule before writing any source file.
  const entries = lines(path.join(dictDir, 'dict.tsv')).flatMap((line, index) => {
    if (!line.trim() || line.trimStart().startsWith('#')) return [];
    const [scope, source, target, anchor = '', mode = ''] = line.split('\t');
    if (!source || !target) return [];
    if (mode && mode !== 'whole') throw new Error(`dict.tsv 第 ${index + 1} 行 mode 非法：${mode}`);
    const names = scope.split(',').map((name) => name.trim()).filter(Boolean);
    if (!names.length || names.some((name) => !(name in scopes))) throw new Error(`dict.tsv 第 ${index + 1} 行 scope 非法`);
    if (!/\s/.test(source) && !anchor && mode !== 'whole') throw new Error(`词条缺少 anchor 或 whole：${source}`);
    const pattern = escapeRegex(source);
    return [{ names, source, target, anchor: anchor ? new RegExp(anchor, 'i') : null,
      pattern: new RegExp(mode === 'whole' ? `(['"\x60])${pattern}\\1` : pattern, 'g'),
      bypass: protect.some((rule) => [...source.matchAll(rule)].length > 0) }];
  }).sort((a, b) => b.source.length - a.source.length);
  const definitions = Object.entries(scopes).map(([name, patterns]) => [name,
    [...patterns, ...(name === 'docs' && includeClaudeMd ? ['CLAUDE.md'] : [])].map(globRegex)]);
  const files = sourceFiles(repo).flatMap((file) => {
    const relative = path.relative(repo, file).split(path.sep).join('/');
    if (skip.some((rule) => rule.test(relative))) return [];
    const names = definitions.filter(([, patterns]) => patterns.some((pattern) => pattern.test(relative))).map(([name]) => name);
    return names.length ? [{ file, relative, names }] : [];
  });
  const pending = new Set();
  let replacements = 0;
  let changedFiles = 0;
  for (const { file, relative, names } of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const newline = raw.includes('\r\n') ? '\r\n' : '\n';
    const rules = entries.filter((entry) => entry.names.some((name) => names.includes(name)));
    const translated = raw.split(/\r\n|\n|\r/).map((original) => {
      let current = original;
      for (const entry of rules) {
        if (entry.anchor && !entry.anchor.test(original)) continue;
        if (!current.includes(entry.source)) continue;
        const spans = entry.bypass ? [] : protect.flatMap((rule) => [...current.matchAll(rule)].map((match) => [match.index, match.index + match[0].length]));
        const matches = [...current.matchAll(entry.pattern)];
        for (const match of matches.reverse()) {
          if (spans.some(([start, end]) => match.index < end && match.index + match[0].length > start)) continue;
          const quote = match[1] ?? '';
          current = current.slice(0, match.index) + quote + entry.target + quote + current.slice(match.index + match[0].length);
          replacements++;
        }
      }
      return current;
    }).join(newline);
    if (translated !== raw) {
      fs.writeFileSync(file, translated);
      changedFiles++;
    }
    for (const name of names) {
      for (const line of translated.split(/\r\n|\n|\r/)) {
        for (const match of line.matchAll(/(?<![\w])(?<q>["'`])(?<s>(?:\\.|(?!\k<q>).)*)\k<q>/g)) {
          const text = match.groups.s;
          if (text.length < 5 || /[\u4e00-\u9fff]|\$\{/.test(text)) continue;
          if (protect.some((rule) => [...text.matchAll(rule)].length > 0)) continue;
          if (/^(https?:\/\/|refs\/|origin\/|upstream\/|@|\.{1,2}\/|\/|[a-z0-9_.+-]+@[a-z0-9_.-]+)/i.test(text)) continue;
          if (/^[a-z][a-z0-9]*$/i.test(text) || /^[a-z][a-z0-9]*[_\-.][a-z0-9_.-]+$/i.test(text) || /^[A-Z0-9]{2,8}$/i.test(text)) continue;
          if (!/\s/.test(text) && text.length < 10) continue;
          pending.add(`${name}\t${relative}\t${text}`);
        }
      }
    }
  }
  const report = '# 待译清单（由 localize.mjs 自动生成；scope<TAB>文件<TAB>英文串）\n' + [...pending].sort().join('\n') + '\n';
  const reportPath = path.join(dictDir, 'pending.tsv');
  if (!fs.existsSync(reportPath) || fs.readFileSync(reportPath, 'utf8') !== report) fs.writeFileSync(reportPath, report);
  return { replacements, changedFiles, pending: pending.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      repo: { type: 'string' }, 'dict-dir': { type: 'string' },
      'include-claude-md': { type: 'boolean' }, help: { type: 'boolean' },
    } });
    if (values.help) {
      console.log('bun run scripts/localize.mjs [--repo <目录>] [--dict-dir <词典目录>] [--include-claude-md]');
    } else {
      const stats = localize({ repo: values.repo, dictDir: values['dict-dir'], includeClaudeMd: values['include-claude-md'] });
      const log = path.join(os.tmpdir(), `angkorgit-localize-${Date.now()}.log`);
      fs.writeFileSync(log, JSON.stringify(stats) + '\n');
      console.log(`替换=${stats.replacements} 处  变更文件=${stats.changedFiles}  待译=${stats.pending} 条\n日志：${log}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
