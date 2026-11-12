import { expect, test } from '@playwright/test';

test('graph and sidebar delete only the selected tag sources without confirmation or success toast', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const { useGraph } = await import('/src/features/graph/store.ts');
    const { useRepo } = await import('/src/features/repository/store.ts');
    return useGraph.getState().commits.length > 1 && !useGraph.getState().loading && !useRepo.getState().refreshing;
  })).toBe(true);
  const expected = await page.evaluate(async () => {
    const [{ useRepo }, { useGraph }, { useUi }, { ipc }] = await Promise.all([
      import('/src/features/repository/store.ts'), import('/src/features/graph/store.ts'),
      import('/src/features/ui/store.ts'), import('/src/core/ipc.ts'),
    ]);
    const commits = useGraph.getState().commits;
    const name = 'v-selected';
    const tag = { name, targetOid: commits[0].oid, refOid: commits[0].oid, message: null, isAnnotated: false };
    const remote = { kind: 'remoteTag' as const, shorthand: name, name: 'refs/angkorgit/remote-tags/upstream/tags/v-selected', remote: 'upstream' };
    const tracker = window as unknown as { __sourceDeletes: unknown[][] };
    tracker.__sourceDeletes = [];
    ipc.tagDeleteSources = async (path, tagName, oid) => {
      tracker.__sourceDeletes.push([path, tagName, oid]);
      return { status: 'ok', message: '删除完成' };
    };
    ipc.tags = async () => [tag];
    useRepo.setState({ tags: [tag] });
    useGraph.setState({ commits: commits.map((commit, i) => i === 0 ? {
      ...commit, refs: [{ kind: 'tag' as const, shorthand: name, name: `refs/tags/${name}` }],
    } : i === 1 ? { ...commit, refs: [remote] } : commit) });
    ipc.history = async () => ({ commits: useGraph.getState().commits, hasMore: false, total: null });
    useUi.getState().setSidebarSection('tags', true);
    return [useRepo.getState().repo!.path, name, tag.targetOid];
  });

  const sidebar = page.getByRole('complementary', { name: '分支与引用' });
  await sidebar.getByText('v-selected', { exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除标签 v-selected', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sourceDeletes: unknown[][] }).__sourceDeletes))
    .toEqual([expected]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('删除完成', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-tag-sources="upstream"]').filter({ hasText: 'v-selected' })).toHaveCount(1);
  await expect.poll(() => page.evaluate(async () => {
    const { useRepo } = await import('/src/features/repository/store.ts');
    return !useRepo.getState().refreshing;
  })).toBe(true);
  await page.getByRole('row').first().locator('[data-ref-name="refs/tags/v-selected"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除标签 v-selected', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sourceDeletes: unknown[][] }).__sourceDeletes))
    .toEqual([expected, expected]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('删除完成', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-tag-sources="upstream"]').filter({ hasText: 'v-selected' })).toHaveCount(1);
});
