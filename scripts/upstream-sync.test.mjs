import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./upstream-sync.mjs', import.meta.url));
const url = 'https://github.com/cheat2001/angkorgit.git';

test('upstream 同步：工作区保护、配置核对、无更新、正常合并、冲突与重复运行', { timeout: 30000 }, () => {
  const temp = mkdtempSync(join(tmpdir(), 'upstream-sync-'));
  const upstream = join(temp, 'upstream');
  const repo = join(temp, 'fork');
  const git = (cwd, ...args) => {
    const result = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const run = () => {
    const result = spawnSync(process.execPath, [script], { cwd: repo, encoding: 'utf8' });
    return { ...result, text: `${result.stdout}\n${result.stderr}` };
  };
  const commit = (cwd, message) => {
    git(cwd, 'add', '.');
    git(cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-m', message);
  };
  try {
    git(temp, 'init', '-b', 'main', upstream);
    writeFileSync(join(upstream, 'shared.txt'), 'base\n');
    commit(upstream, 'base');
    git(temp, 'clone', upstream, repo);
    git(repo, 'config', 'core.autocrlf', 'false');
    git(repo, 'config', 'user.name', 'Test');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'commit.gpgsign', 'false');
    git(repo, 'config', `url.${upstream.replace(/\\/g, '/')}.insteadOf`, url);

    writeFileSync(join(repo, 'dirty.txt'), 'keep me');
    assert.match(run().text, /工作区不干净/);
    assert.equal(git(repo, 'remote'), 'origin');
    rmSync(join(repo, 'dirty.txt'));
    git(repo, 'remote', 'add', 'upstream', 'https://example.com/other.git');
    assert.match(run().text, /指向其他仓库/);
    git(repo, 'remote', 'remove', 'upstream');
    assert.match(run().text, /无需合并/);
    assert.equal(git(repo, 'config', '--get', 'remote.upstream.url'), url);

    writeFileSync(join(upstream, 'new.txt'), 'upstream change\n');
    commit(upstream, 'new file');
    const before = git(repo, 'rev-parse', 'main');
    const merged = run();
    assert.equal(merged.status, 0, merged.text);
    assert.match(git(repo, 'branch', '--show-current'), /^sync\/upstream-/);
    assert.equal(git(repo, 'rev-parse', 'HEAD'), before);
    assert.equal(git(repo, 'rev-parse', 'MERGE_HEAD'), git(upstream, 'rev-parse', 'HEAD'));
    assert.match(git(repo, 'diff', '--cached', '--name-only'), /new.txt/);
    assert.match(run().text, /未完成的 Git 操作/);
    git(repo, 'merge', '--abort');
    git(repo, 'switch', 'main');

    writeFileSync(join(repo, 'shared.txt'), 'local\n');
    commit(repo, 'local edit');
    writeFileSync(join(upstream, 'shared.txt'), 'remote\n');
    commit(upstream, 'remote edit');
    const conflict = run();
    assert.equal(conflict.status, 2, conflict.text);
    assert.match(conflict.text, /shared.txt/);
    assert.equal(git(repo, 'diff', '--name-only', '--diff-filter=U'), 'shared.txt');
    assert.match(run().text, /未完成的 Git 操作/);
    git(repo, 'merge', '--abort');
    git(repo, 'switch', 'main');
    git(repo, 'switch', '-c', 'feature');
    assert.match(run().text, /请先切换到 main/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
