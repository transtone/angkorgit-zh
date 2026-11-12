import { expect, test } from '@playwright/test';

test('remote tags remain distinct across commits and merge sources only on the same commit', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(async () => {
    const [{ useRepo }, { useGraph }] = await Promise.all([
      import('/src/features/repository/store.ts'), import('/src/features/graph/store.ts'),
    ]);
    return !useRepo.getState().refreshing && !useGraph.getState().loading && useGraph.getState().commits.length > 2;
  })).toBe(true);
  const oids = await page.evaluate(async () => {
    const [{ useGraph }, { ipc }] = await Promise.all([
      import('/src/features/graph/store.ts'), import('/src/core/ipc.ts'),
    ]);
    const commits = useGraph.getState().commits;
    const [first, second, merged, crowded] = commits;
    const remote = (source: string) => ({
      kind: 'remoteTag' as const,
      name: `refs/angkorgit/remote-tags/${source}/tags/v0.27.0`,
      shorthand: 'v0.27.0',
      remote: source,
    });
    const tracker = window as unknown as { __remoteTagCheckouts: string[]; __tagDeletions: unknown[][] };
    tracker.__remoteTagCheckouts = [];
    tracker.__tagDeletions = [];
    ipc.tagDeleteSources = async (_path, _name, oid) => {
      tracker.__tagDeletions.push([_path, _name, oid]);
      useGraph.setState({ commits: useGraph.getState().commits.map((commit) => commit.oid === oid
        ? { ...commit, refs: commit.refs.filter((ref) => !(ref.shorthand === _name && (ref.kind === 'tag' || ref.kind === 'remoteTag'))) }
        : commit) });
      return { status: 'ok' };
    };
    ipc.checkoutDetached = async (_path, target) => {
      tracker.__remoteTagCheckouts.push(target);
      return { status: 'ok' };
    };
    useGraph.setState({ commits: [
      { ...first, refs: [remote('origin')] },
      { ...second, refs: [remote('upstream')] },
      { ...merged, refs: [
        { kind: 'tag', name: 'refs/tags/v0.27.0', shorthand: 'v0.27.0' },
        remote('origin'), remote('upstream'),
      ] },
      { ...crowded, refs: [
        { kind: 'localBranch', name: 'refs/heads/feature/long-tag-overflow', shorthand: 'feature/long-tag-overflow' },
        remote('upstream'),
      ] },
      ...commits.slice(4),
    ] });
    ipc.history = async () => ({ commits: useGraph.getState().commits, hasMore: false, total: null });
    return [first.oid, second.oid, merged.oid];
  });

  const chips = page.locator('[data-tag-sources]');
  await expect(chips).toHaveCount(3);
  const crowded = page.getByRole('row').nth(3);
  await crowded.getByRole('note', { name: '还有 1 个引用' }).hover();
  const panel = page.locator('[data-more-refs]');
  await expect(panel).toBeVisible();
  const overflowTag = panel.locator('[data-tag-sources="upstream"]');
  await overflowTag.hover();
  await expect(overflowTag).toHaveAttribute('title', 'v0.27.0 · upstream');
  await page.mouse.move(0, 0);
  await expect(panel).toBeHidden();
  const mergedChip = chips.filter({ hasText: 'v0.27.0' }).last();
  await expect(mergedChip).toHaveAttribute('data-tag-sources', '本地、origin、upstream');
  await expect(mergedChip.locator('.lucide-monitor')).toHaveCount(0);
  await expect(mergedChip.locator('.lucide-cloud')).toHaveCount(1);
  const originOnly = chips.filter({ hasText: 'v0.27.0' }).first();

  await originOnly.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /删除标签/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /删除标签/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Notifications alt+T' }).getByText(/删除标签 .*已完成/)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __tagDeletions: unknown[][] }).__tagDeletions))
    .toEqual([[expect.any(String), 'v0.27.0', oids[0]]]);
  await expect(chips.filter({ hasText: 'v0.27.0' })).toHaveCount(2);
  await expect(chips.filter({ hasText: 'v0.27.0' }).first()).toHaveAttribute('data-tag-sources', 'upstream');
  await expect(chips.filter({ hasText: 'v0.27.0' }).last()).toHaveAttribute('data-tag-sources', '本地、origin、upstream');
  await originOnly.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '检出提交（游离状态）' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '复制标签名' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /合并|变基|新建分支|删除分支|重命名|推送|拉取/ })).toHaveCount(0);
  await page.getByRole('menuitem', { name: '检出提交（游离状态）' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __remoteTagCheckouts: string[] }).__remoteTagCheckouts))
    .toEqual([oids[1]]);
  expect(oids[1]).not.toBe(oids[0]);
});
