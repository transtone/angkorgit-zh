#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCatalog } from './translation-catalog.mjs';
import { locationCandidates } from './localize.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const warnings = [];
const errors = [];
let entries = [];
try {
  entries = readCatalog(path.join(root, 'zh-dict/zh-CN.json'));
} catch (error) {
  errors.push(error.message);
}
const seen = new Map();
const locations = new Map();
const byScope = new Map();
for (const entry of entries) {
  if (entry.source === entry.target) warnings.push(`${entry.key}：译文与源文相同`);
  const identity = JSON.stringify([entry.scopes?.slice().sort(), entry.source, entry.anchor, entry.mode, entry.locations]);
  if (seen.has(identity)) warnings.push(`${entry.key} 与 ${seen.get(identity)} 重复`);
  else seen.set(identity, entry.key);
  if (!entry.locations) {
    for (const scope of entry.scopes) {
      if (!byScope.has(scope)) byScope.set(scope, []);
      byScope.get(scope).push(entry);
    }
  }
  for (const location of entry.locations ?? []) {
    const identity = JSON.stringify([location.file, location.component, location.attribute, entry.source]);
    if (locations.has(identity)) errors.push(`${entry.key} 与 ${locations.get(identity)} 重复定位同一文案`);
    else locations.set(identity, entry.key);
    const file = path.join(root, location.file);
    if (!existsSync(file)) {
      errors.push(`${entry.key}：定位文件不存在 ${location.file}`);
      continue;
    }
    const raw = readFileSync(file, 'utf8');
    const candidates = locationCandidates(raw, location.file, location, entry);
    if (candidates.length !== 1) errors.push(`${entry.key}：定位需唯一，实际匹配 ${candidates.length} 处`);
    else if (![entry.source, entry.target, ...(entry.previousTargets ?? [])].includes(candidates[0].value)) {
      errors.push(`${entry.key}：定位文案已变化，需人工审阅`);
    } else if (candidates[0].value !== entry.target) warnings.push(`${entry.key}：源码文案尚未同步为确认译文`);
  }
}
for (const list of byScope.values()) {
  const sorted = [...list].sort((a, b) => a.source.length - b.source.length);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].mode === 'whole' || sorted[i].mode === 'whole') continue;
      if (sorted[j].source.startsWith(sorted[i].source) && sorted[j].source !== sorted[i].source) {
        warnings.push(`前缀重叠：${sorted[i].key} / ${sorted[j].key}（按最长源优先处理）`);
      }
    }
  }
}
if (warnings.length) {
  console.warn(`词典提示（${warnings.length} 条，不阻塞）：`);
  for (const warning of warnings.slice(0, 15)) console.warn(`  - ${warning}`);
  if (warnings.length > 15) console.warn(`  … 还有 ${warnings.length - 15} 条提示`);
}
if (errors.length) {
  console.error(`词典错误（${errors.length} 条）：\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`词典检查通过：${entries.length} 条词条，${warnings.length} 条提示。`);
}
