// Run with: node --test tests/localize.test.mjs (or bun run test:localize).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { localize } from '../scripts/localize.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(project, 'scripts/localize.mjs');
const uiFile = 'apps/desktop/src/Fixture.tsx';
const dictionary = [
  '# scope\tsource\ttarget\tanchor\tmode',
  'ui\tOpen\t打开\t\twhole',
  'ui\tOpen repository\t打开仓库',
  'ui\tOpen repository settings\t打开仓库设置',
  'ui\tCancel\t取消\t\twhole',
  'ui\tBranch\t分支\t^const anchored =',
  'ui\tprotected-token\t受保护词\t\twhole',
].join('\n');
const source = [
  'const open = "Open";',
  "const cancel = 'Cancel';",
  'const template = `Cancel`;',
  'const longer = "Cancel operation";',
  'const longest = "Open repository settings";',
  'const phrase = "Open repository";',
  'const anchored = "Branch";',
  'const untouched = "Branch";',
  'const protectedUrl = "https://example.invalid/Open repository";',
  'const shifted = "Open repository settings"; const url = "https://example.invalid/Open repository settings"; const tail = "Open repository";',
  'const bypass = "protected-token";',
  'const pending = "Untranslated dialog title";',
  'const duplicate = "Untranslated dialog title";',
  'const internal = "internal_identifier";',
  'const short = "tiny";',
  'const dynamic = `Hello ${name}`;',
  '',
].join('\n');
const expected = [
  'const open = "打开";',
  "const cancel = '取消';",
  'const template = `取消`;',
  'const longer = "Cancel operation";',
  'const longest = "打开仓库设置";',
  'const phrase = "打开仓库";',
  'const anchored = "分支";',
  'const untouched = "Branch";',
  'const protectedUrl = "https://example.invalid/Open repository";',
  'const shifted = "打开仓库设置"; const url = "https://example.invalid/Open repository settings"; const tail = "打开仓库";',
  'const bypass = "受保护词";',
  'const pending = "Untranslated dialog title";',
  'const duplicate = "Untranslated dialog title";',
  'const internal = "internal_identifier";',
  'const short = "tiny";',
  'const dynamic = `Hello ${name}`;',
  '',
].join('\n');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localize-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 }));
  const repo = path.join(root, 'repo with spaces');
  const dictDir = path.join(root, 'custom dictionary');
  fs.mkdirSync(repo);
  write(root, 'empty-gitconfig', '');
  write(dictDir, 'dict.tsv', dictionary);
  write(dictDir, 'protect.txt', '(?:https?://[^\\s"\\x27`]+|protected-token)\n');
  write(dictDir, 'skip-files.txt', 'apps/desktop/src/skipped/**\n');
  return { root, repo, dictDir };
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60_000, ...options });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function git(repo, ...args) {
  return run('git', ['-C', repo, ...args], {
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: path.join(path.dirname(repo), 'empty-gitconfig'),
      GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  });
}

// Include hidden files and all Git metadata; never follow symlinks.
function snapshot(root) {
  const files = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (entry.isSymbolicLink()) files[relative] = `symlink:${fs.readlinkSync(full)}`;
      else if (entry.isDirectory()) visit(full);
      else files[relative] = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  }
  visit(root);
  return files;
}

function pending(dictDir) {
  return read(dictDir, 'pending.tsv').split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
}

function assertOnlyChanged(before, after, allowed) {
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'file list changed');
  for (const file of Object.keys(before)) {
    if (!allowed.includes(file)) assert.equal(after[file], before[file], `unexpected change: ${file}`);
  }
}

test('dirty repository and linked worktree preserve Git state, manifests and unrelated files', (t) => {
  const { root, repo, dictDir } = fixture(t);
  write(repo, uiFile, source);
  write(repo, 'apps/desktop/src/skipped/Nested.tsx', 'const title = "Open repository settings";');
  const unchanged = {
    'package.json': '{"name":"fixture","version":"1.2.3","repository":"https://github.com/example/angkorgit"}',
    'apps/desktop/package.json': '{"name":"desktop","version":"4.5.6"}',
    'apps/desktop/src-tauri/Cargo.toml': '[package]\nname = "fixture"\nversion = "7.8.9"\n',
    'apps/desktop/src-tauri/Cargo.lock': 'version = 4\n[[package]]\nname = "fixture"\nversion = "7.8.9"\n',
    'apps/desktop/src-tauri/tauri.conf.json': '{"version":"10.11.12","plugins":{"updater":{"endpoints":["https://github.com/example/angkorgit/releases/latest/download/latest.json"]}}}',
    '.github/workflows/release.yml': 'env:\n  UPSTREAM: https://github.com/example/angkorgit\n',
    'README.md': 'Open repository settings: https://github.com/example/angkorgit/releases',
    'CLAUDE.md': 'Open repository settings',
    'unrelated.txt': 'initial unrelated content',
    'staged.txt': 'initial staged content',
  };
  for (const [file, content] of Object.entries(unchanged)) write(repo, file, content);
  git(repo, 'init', '--initial-branch=fixture');
  git(repo, 'config', 'core.autocrlf', 'false');
  git(repo, 'config', 'core.hooksPath', path.join(root, 'no-hooks'));
  git(repo, 'config', 'remote.origin.url', 'https://example.invalid/fork.git');
  git(repo, 'config', 'remote.upstream.url', 'https://example.invalid/upstream.git');
  git(repo, 'add', '--all');
  git(repo, '-c', 'user.name=Localization Test', '-c', 'user.email=localize@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-m', 'Temporary localization fixture');
  const worktree = path.join(root, 'linked worktree');
  git(repo, 'worktree', 'add', '-b', 'linked-fixture', worktree, 'HEAD');
  assert.ok(fs.statSync(path.join(worktree, '.git')).isFile());
  for (const directory of [repo, worktree]) {
    write(directory, 'unrelated.txt', 'preexisting dirty content');
    write(directory, 'staged.txt', 'preexisting staged content');
    git(directory, 'add', 'staged.txt');
    write(directory, 'staged.txt', 'preexisting staged plus unstaged content');
    write(directory, 'untracked.txt', 'preexisting untracked content');
    assert.equal(git(directory, 'diff', '--cached', '--name-only'), 'staged.txt');
    const head = git(directory, 'rev-parse', 'HEAD');
    const mergeHead = git(directory, 'rev-parse', '--path-format=absolute', '--git-path', 'MERGE_HEAD');
    fs.writeFileSync(mergeHead, `${head}\n`);
    const before = snapshot(directory);
    const gitBefore = snapshot(path.join(repo, '.git'));
    localize({ repo: directory, dictDir });
    assert.equal(read(directory, uiFile), expected);
    const after = snapshot(directory);
    assertOnlyChanged(before, after, [uiFile]);
    assert.deepEqual(snapshot(path.join(repo, '.git')), gitBefore, 'HEAD/index/config/MERGE_HEAD/refs changed');
    assert.deepEqual(pending(dictDir), [
      `ui\t${uiFile}\tCancel operation`,
      `ui\t${uiFile}\tUntranslated dialog title`,
    ]);
    const dictBefore = snapshot(dictDir);
    const pendingFile = path.join(dictDir, 'pending.tsv');
    // An old timestamp detects rewrites even on filesystems with coarse timestamps.
    fs.utimesSync(pendingFile, new Date('2001-01-01'), new Date('2001-01-01'));
    const pendingTime = fs.statSync(pendingFile).mtimeMs;
    localize({ repo: directory, dictDir });
    assert.deepEqual(snapshot(directory), after, 'second run changed source bytes');
    assert.deepEqual(snapshot(dictDir), dictBefore, 'second run changed dictionary bytes');
    assert.equal(fs.statSync(pendingFile).mtimeMs, pendingTime, 'unchanged pending report was rewritten');
    assert.deepEqual(snapshot(path.join(repo, '.git')), gitBefore);
  }
});

test('UTF-8 without BOM and CRLF are preserved while translating all quote styles', (t) => {
  const { repo, dictDir } = fixture(t);
  write(repo, uiFile, source.replaceAll('\n', '\r\n'));
  localize({ repo, dictDir });
  const bytes = fs.readFileSync(path.join(repo, uiFile));
  assert.deepEqual(bytes, Buffer.from(expected.replaceAll('\n', '\r\n'), 'utf8'));
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('scope paths include direct and nested files; CLAUDE.md requires opt-in', (t) => {
  const { repo, dictDir } = fixture(t);
  write(dictDir, 'dict.tsv', 'ui,rust,core,website,meta,docs,e2e,test\tFixture title\t测试标题\n');
  const files = [uiFile, 'apps/desktop/src/nested/Child.ts',
    'apps/desktop/src-tauri/src/lib.rs', 'apps/desktop/src-tauri/tests/nested/check.rs',
    'packages/core/src/example.ts', 'apps/website/src/page.astro',
    'apps/desktop/index.html', 'README.md', 'docs/nested/example.md',
    'tests/e2e/example.ts', 'tests/unit/example.ts'];
  for (const file of [...files, 'CLAUDE.md', 'outside.ts']) write(repo, file, '"Fixture title"\n');
  localize({ repo, dictDir });
  for (const file of files) assert.equal(read(repo, file), '"测试标题"\n', file);
  assert.equal(read(repo, 'CLAUDE.md'), '"Fixture title"\n');
  localize({ repo, dictDir, includeClaudeMd: true });
  assert.equal(read(repo, 'CLAUDE.md'), '"测试标题"\n');
  assert.equal(read(repo, 'outside.ts'), '"Fixture title"\n');
});

test('dependency/build directories and skipped globs are excluded from translation and pending', (t) => {
  const { repo, dictDir } = fixture(t);
  const files = ['node_modules', 'target', 'dist', '.git', 'skipped'].map((dir) =>
    `apps/desktop/src/${dir}/nested/Excluded.tsx`);
  for (const file of files) write(repo, file, source);
  const before = snapshot(repo);
  localize({ repo, dictDir });
  assert.deepEqual(snapshot(repo), before);
  assert.deepEqual(pending(dictDir), []);
});

test('symlinked directories and files never translate external sources or collect pending', (t) => {
  const { root, repo, dictDir } = fixture(t);
  const outside = path.join(root, 'external sources');
  const externalFile = write(outside, 'External.tsx', source);
  fs.mkdirSync(path.join(repo, 'apps/desktop/src'), { recursive: true });
  try {
    fs.symlinkSync(outside, path.join(repo, 'apps/desktop/src/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
    t.skip(`directory symlink unavailable (${error.code})`);
    return;
  }
  try {
    fs.symlinkSync(externalFile, path.join(repo, 'apps/desktop/src/linked.tsx'), 'file');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
    t.diagnostic(`file symlink unavailable (${error.code}); directory link is checked`);
  }
  const before = snapshot(repo);
  const outsideBefore = snapshot(outside);
  localize({ repo, dictDir });
  assert.deepEqual(snapshot(repo), before);
  assert.deepEqual(snapshot(outside), outsideBefore);
  assert.deepEqual(pending(dictDir), []);
});

test('invalid rules fail before any source or pending writes', async (t) => {
  const cases = [
    ['protect regex', 'protect.txt', '['],
    ['anchor regex', 'dict.tsv', `${dictionary}\nui\tAnother phrase\t其他短语\t[`],
    ['mode', 'dict.tsv', `${dictionary}\nui\tAnother phrase\t其他短语\t\tinvalid`],
    ['unscoped single word', 'dict.tsv', `${dictionary}\nui\tUnsafe\t不安全`],
    ['unknown scope', 'dict.tsv', `${dictionary}\nunknown\tAnother phrase\t其他短语`],
  ];
  for (const [name, file, content] of cases) {
    await t.test(name, (subtest) => {
      const { repo, dictDir } = fixture(subtest);
      write(repo, uiFile, source);
      write(dictDir, 'pending.tsv', '# Existing report must survive\n');
      write(dictDir, file, content);
      const before = snapshot(repo);
      const dictBefore = snapshot(dictDir);
      assert.throws(() => localize({ repo, dictDir }));
      assert.deepEqual(snapshot(repo), before);
      assert.deepEqual(snapshot(dictDir), dictBefore);
    });
  }
});

test('Bun CLI rejects unknown parameters and extra positional arguments before writes', (t) => {
  const { root, repo, dictDir } = fixture(t);
  write(repo, uiFile, source);
  const before = snapshot(root);
  const bun = process.env.BUN_BIN || (process.versions.bun ? process.execPath : 'bun');
  for (const extra of [['--unknown-option'], ['unexpected-positional']]) {
    const result = spawnSync(bun, [cli, '--repo', repo, '--dict-dir', dictDir, ...extra],
      { encoding: 'utf8', timeout: 30_000 });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, `${extra}: ${result.stdout}`);
    assert.match(result.stderr, /unknown|unexpected|positional/i);
    assert.deepEqual(snapshot(root), before);
  }
});

test('real repository dictionary regexes compile and translate temporary sources', (t) => {
  const { repo, dictDir } = fixture(t);
  for (const file of ['dict.tsv', 'protect.txt', 'skip-files.txt']) {
    fs.copyFileSync(path.join(project, 'zh-dict', file), path.join(dictDir, file));
  }
  write(repo, uiFile, 'const title = "Create pull request";\nconst version = "v1.2.3";\nconst url = "https://example.invalid/Create pull request";\n');
  const configBefore = snapshot(dictDir);
  localize({ repo, dictDir });
  assert.equal(read(repo, uiFile), 'const title = "创建拉取请求";\nconst version = "v1.2.3";\nconst url = "https://example.invalid/Create pull request";\n');
  for (const file of Object.keys(configBefore)) assert.equal(snapshot(dictDir)[file], configBefore[file]);
});
