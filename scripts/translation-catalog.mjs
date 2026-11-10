import fs from 'node:fs';
import ts from 'typescript';

export const scopes = {
  ui: ['apps/desktop/src/**/*.ts', 'apps/desktop/src/**/*.tsx'],
  rust: ['apps/desktop/src-tauri/src/**/*.rs', 'apps/desktop/src-tauri/tests/**/*.rs'],
  core: ['packages/core/src/**/*.ts'],
  website: ['apps/website/src/**/*.ts', 'apps/website/src/**/*.tsx', 'apps/website/src/**/*.astro'],
  meta: ['apps/desktop/src-tauri/tauri.conf.json', 'package.json', 'apps/desktop/package.json', 'apps/desktop/src-tauri/Cargo.toml', 'apps/desktop/index.html'],
  docs: ['README.md', 'docs/**/*.md', 'CHANGELOG.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md'],
  e2e: ['tests/e2e/**/*.ts'],
  test: ['tests/unit/**/*.ts'],
};

const fields = new Set(['source', 'target', 'scopes', 'anchor', 'mode', 'locations', 'previousTargets']);
const locationFields = new Set(['file', 'component', 'attribute']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;

export function readCatalog(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const catalog = JSON.parse(raw);
  if (!object(catalog)) throw new Error('zh-CN.json 必须是以文案 key 为键的对象');
  // JSON.parse accepts duplicate keys, which would silently discard an earlier translation.
  const parsed = ts.parseJsonText(file, raw);
  const keys = new Set();
  for (const property of parsed.statements[0]?.expression?.properties ?? []) {
    const key = property.name?.text;
    if (keys.has(key)) throw new Error(`zh-CN.json 重复 key：${key}`);
    keys.add(key);
  }
  return Object.entries(catalog).map(([key, entry]) => {
    const fail = (message) => { throw new Error(`zh-CN.json ${key}：${message}`); };
    if (!text(key) || !object(entry)) fail('词条必须是对象且 key 不能为空');
    for (const field of Object.keys(entry)) if (!fields.has(field)) fail(`未知字段 ${field}`);
    if (!text(entry.source) || !text(entry.target)) fail('source/target 必须是非空字符串');
    if (entry.scopes !== undefined && (!Array.isArray(entry.scopes) || !entry.scopes.length
      || entry.scopes.some((scope) => !Object.hasOwn(scopes, scope)))) fail('scopes 非法');
    if (entry.mode !== undefined && entry.mode !== 'whole') fail('mode 仅支持 whole');
    if (entry.anchor !== undefined) {
      if (!text(entry.anchor)) fail('anchor 必须是非空正则字符串');
      try { new RegExp(entry.anchor, 'i'); } catch { fail('anchor 不是合法正则'); }
    }
    if (entry.locations !== undefined) {
      if (!Array.isArray(entry.locations) || !entry.locations.length) fail('locations 必须是非空数组');
      const seen = new Set();
      for (const location of entry.locations) {
        if (!object(location)) fail('location 必须是对象');
        for (const field of Object.keys(location)) if (!locationFields.has(field)) fail(`未知定位字段 ${field}`);
        if (!text(location.file) || /[\\:*?\x00-\x1f]/.test(location.file) || location.file.startsWith('/')
          || location.file.split('/').some((part) => !part || part === '.' || part === '..')) fail('file 必须是仓库内的相对路径');
        for (const field of ['component', 'attribute']) {
          if (location[field] !== undefined && !text(location[field])) fail(`${field} 必须是非空字符串`);
        }
        const identity = JSON.stringify([location.file, location.component, location.attribute]);
        if (seen.has(identity)) fail('重复 location');
        seen.add(identity);
      }
    }
    if (!entry.scopes && !entry.locations) fail('必须提供 scopes 或 locations');
    if (!/\s/.test(entry.source) && !entry.anchor && entry.mode !== 'whole' && !entry.locations) fail('单词规则需要 anchor 或 whole');
    if (entry.previousTargets !== undefined && (!entry.locations || !Array.isArray(entry.previousTargets)
      || entry.previousTargets.some((value) => !text(value)))) fail('previousTargets 仅用于定位词条且必须是字符串数组');
    return { key, ...entry };
  });
}
