import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const upstreamUrl = 'https://github.com/cheat2001/angkorgit.git';

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(' ')} 失败`);
  return result.stdout.trim();
}

try {
  process.chdir(git('rev-parse', '--show-toplevel'));
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer']) {
    if (existsSync(resolve(git('rev-parse', '--git-path', marker)))) {
      throw new Error('存在未完成的 Git 操作，请先完成或中止，再重新同步。');
    }
  }
  if (git('status', '--porcelain', '--untracked-files=all')) {
    throw new Error('工作区不干净，请先提交或暂存修改（包括未跟踪文件），再重新同步。');
  }
  const current = git('branch', '--show-current');
  if (current !== 'main') throw new Error(`请先切换到 main 再同步，当前为 ${current || '分离 HEAD'}。`);

  if (!git('remote').split(/\r?\n/).includes('upstream')) {
    git('remote', 'add', 'upstream', upstreamUrl);
  }
  const url = git('config', '--get', 'remote.upstream.url');
  if (!['https://github.com/cheat2001/angkorgit', 'git@github.com:cheat2001/angkorgit', 'ssh://git@github.com/cheat2001/angkorgit'].includes(url.replace(/\/$/, '').replace(/\.git$/, ''))) {
    throw new Error(`upstream 指向其他仓库：${url}；请人工核对，脚本不会覆盖。`);
  }

  console.log('正在获取 cheat2001/angkorgit 的 main 分支…');
  git('fetch', '--no-tags', 'upstream', 'refs/heads/main:refs/remotes/upstream/main');
  const count = Number(git('rev-list', '--count', 'main..refs/remotes/upstream/main'));
  if (count === 0) {
    console.log('main 已包含全部上游提交，无需合并。');
  } else {
    git('merge-base', 'main', 'refs/remotes/upstream/main');
    console.log(`上游有 ${count} 个待合并提交：\n${git('log', '--oneline', '-20', 'main..refs/remotes/upstream/main')}`);
    const branch = `sync/upstream-${new Date().toISOString().replace(/[-:.]/g, '')}`;
    git('switch', '-c', branch);
    console.log(`已创建同步分支：${branch}`);
    const merge = spawnSync('git', ['merge', '--no-commit', '--no-ff', 'refs/remotes/upstream/main'], {
      stdio: 'inherit', windowsHide: true,
    });
    if (merge.error) throw merge.error;
    if (merge.status !== 0) {
      const conflicts = git('diff', '--name-only', '--diff-filter=U');
      if (!conflicts) throw new Error('合并失败，请运行 git status 检查原因。');
      console.error(`合并遇到冲突，已保留现场：\n${conflicts}\n解决后 git add 对应文件；放弃本次合并：git merge --abort`);
      process.exitCode = 2;
    } else {
      console.log('合并已准备好，尚未提交。请检查差异并测试，再执行 git commit。');
    }
    console.log('未推送远程仓库；同步完成后请将此分支合入 main，再开始下一次同步。');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
