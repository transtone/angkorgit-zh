import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readCatalog, scopes } from './translation-catalog.mjs';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const globRegex = (glob) => new RegExp('^' + glob.split('**/').map((part) =>
  part.split('**').map((segment) => segment.split('*').map(escapeRegex).join('[^/]*')).join('.*'),
).join('(?:.*/)?') + '$', 'i');

function configLines(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
    .filter((line) => line.trim() && !line.trimStart().startsWith('#'));
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

export function locationCandidates(raw, file, location, entry) {
  const accepted = new Set([entry.source, entry.target, ...(entry.previousTargets ?? [])]);
  if (!location.component && !location.attribute) {
    const pattern = new RegExp([...accepted].sort((a, b) => b.length - a.length).map(escapeRegex).join('|'), 'g');
    return [...raw.matchAll(pattern)].map((match) => ({ start: match.index, end: match.index + match[0].length, value: match[0] }));
  }
  const source = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const candidates = [];
  function visit(node, component) {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) component = node.name.text;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)
        || (ts.isCallExpression(node.initializer) && node.initializer.arguments.some((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))))) {
      component = node.name.text;
    }
    if ((!location.component || component === location.component) && ts.isJsxAttribute(node)
      && (!location.attribute || node.name.getText(source) === location.attribute)) {
      let literal = node.initializer;
      if (literal && ts.isJsxExpression(literal)) literal = literal.expression;
      if (literal && ts.isStringLiteral(literal)) {
        candidates.push({ start: literal.getStart(source) + 1, end: literal.end - 1, value: literal.text });
      }
    }
    ts.forEachChild(node, (child) => visit(child, component));
  }
  visit(source, null);
  return candidates;
}

export function localize({ repo = process.cwd(), dictDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../zh-dict'), includeClaudeMd = false } = {}) {
  repo = fs.realpathSync(repo);
  if (!fs.statSync(repo).isDirectory()) throw new Error(`源码目录不存在：${repo}`);
  dictDir = fs.realpathSync(dictDir);
  // Validate the entire catalog and configuration before writing any source or report.
  const catalog = readCatalog(path.join(dictDir, 'zh-CN.json'));
  const protect = configLines(path.join(dictDir, 'protect.txt')).map((rule) => new RegExp(rule, 'g'));
  const skip = configLines(path.join(dictDir, 'skip-files.txt')).map(globRegex);
  const entries = catalog.filter((entry) => !entry.locations).map((entry) => ({
    ...entry,
    anchor: entry.anchor ? new RegExp(entry.anchor, 'i') : null,
    pattern: new RegExp(entry.mode === 'whole' ? `(['"\x60])${escapeRegex(entry.source)}\\1` : escapeRegex(entry.source), 'g'),
    bypass: protect.some((rule) => [...entry.source.matchAll(rule)].length > 0),
  })).sort((a, b) => b.source.length - a.source.length);
  const definitions = Object.entries(scopes).map(([name, patterns]) => [name,
    [...patterns, ...(name === 'docs' && includeClaudeMd ? ['CLAUDE.md'] : [])].map(globRegex)]);
  const locations = catalog.flatMap((entry) => (entry.locations ?? []).map((location) => ({ entry, location })));
  const pending = new Set();
  const review = new Set();
  const visited = new Set();
  let replacements = 0;
  let changedFiles = 0;
  const plans = [];
  for (const file of sourceFiles(repo)) {
    const relative = path.relative(repo, file).split(path.sep).join('/');
    if (skip.some((rule) => rule.test(relative))) continue;
    const names = definitions.filter(([, patterns]) => patterns.some((pattern) => pattern.test(relative))).map(([name]) => name);
    const located = locations.filter(({ location }) => location.file === relative);
    if (!names.length && !located.length) continue;
    if (relative === 'CLAUDE.md' && !includeClaudeMd) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const newline = raw.includes('\r\n') ? '\r\n' : '\n';
    const guards = [];
    for (const item of located) {
      visited.add(item);
      const { entry, location } = item;
      const candidates = locationCandidates(raw, relative, location, entry);
      const accepted = new Set([entry.source, entry.target, ...(entry.previousTargets ?? [])]);
      const resolved = candidates.length === 1 && accepted.has(candidates[0].value);
      const reason = candidates.length === 0 ? '未找到位置' : candidates.length > 1 ? '位置不唯一' : '文案已变化';
      if (!resolved) review.add(`review\t${relative}\t${entry.key}\t${reason}`);
      for (const candidate of candidates) {
        guards.push({ ...candidate, replacement: resolved ? entry.target : raw.slice(candidate.start, candidate.end), key: entry.key });
      }
      // If the structural context disappeared, do not let a generic rule consume its source.
      if (!candidates.length) {
        for (const value of accepted) {
          for (const match of raw.matchAll(new RegExp(escapeRegex(value), 'g'))) {
            guards.push({ start: match.index, end: match.index + match[0].length, replacement: match[0], key: entry.key });
          }
        }
      }
    }
    guards.sort((a, b) => a.start - b.start);
    for (let i = 1; i < guards.length; i++) {
      if (guards[i].start < guards[i - 1].end) throw new Error(`定位规则重叠：${relative} ${guards[i - 1].key} / ${guards[i].key}`);
    }
    const tokens = guards.map((guard, index) => {
      const token = `\uE000${index}\uE001`;
      if (raw.includes(token)) throw new Error(`源码包含保留占位符：${relative}`);
      if (raw.slice(guard.start, guard.end) !== guard.replacement) replacements++;
      return { ...guard, token };
    });
    let masked = raw;
    for (const guard of [...tokens].reverse()) masked = masked.slice(0, guard.start) + guard.token + masked.slice(guard.end);
    const rules = entries.filter((entry) => entry.scopes.some((name) => names.includes(name)));
    let translated = masked.split(/\r\n|\n|\r/).map((original) => {
      let current = original;
      for (const entry of rules) {
        if (entry.anchor && !entry.anchor.test(original)) continue;
        if (!current.includes(entry.source)) continue;
        const spans = entry.bypass ? [] : protect.flatMap((rule) => [...current.matchAll(rule)].map((match) => [match.index, match.index + match[0].length]));
        for (const match of [...current.matchAll(entry.pattern)].reverse()) {
          if (spans.some(([start, end]) => match.index < end && match.index + match[0].length > start)) continue;
          const quote = match[1] ?? '';
          current = current.slice(0, match.index) + quote + entry.target + quote + current.slice(match.index + match[0].length);
          replacements++;
        }
      }
      return current;
    }).join(newline);
    for (const guard of tokens) translated = translated.replace(guard.token, guard.replacement);
    if (translated !== raw) plans.push({ file, translated });
    for (const name of names) {
      for (const line of translated.split(/\r\n|\n|\r/)) {
        for (const match of line.matchAll(/(?<![\w])(?<q>["'`])(?<s>(?:\\.|(?!\k<q>).)*)\k<q>/g)) {
          const text = match.groups.s;
          if (text.length < 5 || /[\u4e00-\u9fff]|\$\{/.test(text)) continue;
          if (protect.some((rule) => [...text.matchAll(rule)].length > 0)) continue;
          if (/^(https?:\/\/|refs\/|origin\/|upstream\/|@|\.{1,2}\/|\/|[a-z0-9_.+-]+@[a-z0-9_.-]+)/i.test(text)) continue;
          if (/^[a-z][a-z0-9]*$/i.test(text) || /^[a-z][a-z0-9]*[_\-.][a-z0-9_.-]+$/i.test(text) || /^[A-Z0-9]{2,8}$/.test(text)) continue;
          if (!/\s/.test(text) && text.length < 10) continue;
          pending.add(`${name}\t${relative}\t${text}`);
        }
      }
    }
  }
  for (const item of locations) {
    if (!visited.has(item)) review.add(`review\t${item.location.file}\t${item.entry.key}\t文件缺失、已排除或未启用`);
  }
  for (const { file, translated } of plans) {
    fs.writeFileSync(file, translated);
    changedFiles++;
  }
  const report = '# 待译与待审清单（自动生成，不是翻译依据）\n' + [...pending, ...review].sort().join('\n') + '\n';
  const reportPath = path.join(dictDir, 'pending.tsv');
  if (!fs.existsSync(reportPath) || fs.readFileSync(reportPath, 'utf8') !== report) fs.writeFileSync(reportPath, report);
  return { replacements, changedFiles, pending: pending.size, review: review.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      repo: { type: 'string' }, 'dict-dir': { type: 'string' },
      'include-claude-md': { type: 'boolean' }, help: { type: 'boolean' },
    } });
    if (values.help) {
      console.log('bun run scripts/localize.mjs [--repo <目录>] [--dict-dir <目录>] [--include-claude-md]');
    } else {
      const stats = localize({ repo: values.repo, dictDir: values['dict-dir'], includeClaudeMd: values['include-claude-md'] });
      const log = path.join(os.tmpdir(), `angkorgit-localize-${Date.now()}.log`);
      fs.writeFileSync(log, JSON.stringify(stats) + '\n');
      console.log(`替换=${stats.replacements} 处  变更文件=${stats.changedFiles}  待译=${stats.pending} 条  待审=${stats.review} 条\n日志：${log}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
