import { expect, test } from '@playwright/test';

test('expired remote tracking refs are distinct and can be deleted from the graph', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(async () => {
    const [{ useRepo }, { useGraph }] = await Promise.all([
      import('/src/features/repository/store.ts'), import('/src/features/graph/store.ts'),
    ]);
    return !useRepo.getState().refreshing && !useGraph.getState().loading && useGraph.getState().commits.length > 0;
  })).toBe(true);
  await page.evaluate(async () => {
    const [{ useRepo }, { useGraph }, { ipc }] = await Promise.all([
      import('/src/features/repository/store.ts'),
      import('/src/features/graph/store.ts'),
      import('/src/core/ipc.ts'),
    ]);
    const ref = { kind: 'remoteBranch' as const, name: 'refs/remotes/upstream/topic', shorthand: 'upstream/topic' };
    const commits = useGraph.getState().commits;
    useRepo.setState({ branches: [...useRepo.getState().branches, {
      ...useRepo.getState().branches[0], name: 'upstream/topic', isRemote: true, isHead: false, targetOid: commits[0].oid,
    }] });
    ipc.remoteStaleRefs = async () => [ref.name];
    await useRepo.getState().checkStaleRemoteRefs();
    useGraph.setState({ commits: commits.map((commit, i) => i === 0 ? { ...commit, refs: [ref] } : commit) });
    useRepo.setState({ staleRemoteRefs: new Set([ref.name]) });
    const tracker = window as unknown as { __deletedRef?: { path: string; refName: string; oid: string } };
    ipc.deleteStaleRemoteRef = async (path, refName, oid) => {
      tracker.__deletedRef = { path, refName, oid };
      return { status: 'ok', message: `已删除 ${ref.shorthand} 的远程跟踪引用` };
    };
  });
  const chip = page.locator('[data-stale-remote-ref="refs/remotes/upstream/topic"]').first();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('title', /过期的远程跟踪分支/);
  await expect(chip.locator('.lucide-cloud-off')).toBeVisible();
  await expect(chip).not.toHaveAttribute('data-lane-chip');
  await chip.click({ button: 'right' });
  const remove = page.getByRole('menuitem', { name: '删除远程跟踪引用', exact: true });
  await expect(remove).toBeVisible();
  await expect(remove).toHaveAttribute('title', /不影响本地分支或远端仓库/);
  await remove.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __deletedRef?: { refName: string } }).__deletedRef?.refName))
    .toBe('refs/remotes/upstream/topic');
  await expect(chip).toHaveCount(0);
});

test('an up-to-date push still checks remote tracking refs', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    const [{ useRepo }, { ipc }] = await Promise.all([
      import('/src/features/repository/store.ts'), import('/src/core/ipc.ts'),
    ]);
    const tracker = window as unknown as { __pushChecked: boolean; __pushed: boolean };
    tracker.__pushChecked = false;
    tracker.__pushed = false;
    ipc.push = async () => {
      tracker.__pushed = true;
      return { status: 'up_to_date', message: '已是最新' };
    };
    useRepo.setState({ checkStaleRemoteRefs: async () => {
      if (tracker.__pushed) tracker.__pushChecked = true;
    } });
  });
  await page.getByRole('banner').getByRole('button', { name: /^推送 \d/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pushChecked: boolean }).__pushChecked)).toBe(true);
});
