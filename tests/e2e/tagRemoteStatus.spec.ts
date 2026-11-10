import { expect, test } from '@playwright/test';

test('tag states distinguish all remotes and refresh through the graph menu', async ({ page }) => {
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
      import('/src/features/repository/store.ts'), import('/src/features/graph/store.ts'), import('/src/core/ipc.ts'),
    ]);
    const remotes = [{ name: 'origin', url: 'https://example.invalid/origin' }, { name: 'upstream', url: 'https://example.invalid/upstream' }];
    ipc.remotes = async () => remotes;
    ipc.remoteRefStatus = async (_path, remote) => ({ staleRefs: [], tags: [{ name: 'v-test', status: remote === 'origin' ? 'synced' : 'different' }] });
    useRepo.setState({ remotes });
    await useRepo.getState().checkStaleRemoteRefs();
    useGraph.setState({ commits: useGraph.getState().commits.map((commit, i) => i === 0 ? {
      ...commit, refs: [{ kind: 'tag', name: 'refs/tags/v-test', shorthand: 'v-test' }],
    } : commit) });
  });
  const marker = page.locator('[data-tag-remote="v-test"]').first();
  await expect(marker).toHaveAttribute('data-tag-remote-status', 'synced');
  await expect(marker).toHaveAttribute('title', /origin.*已同步/);
  await expect(marker).toHaveAttribute('title', /upstream.*与远端不一致/);
  await marker.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '检查远端状态', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: '推送到远端', exact: true }).hover();
  await expect(page.getByRole('menuitem', { name: 'origin · 已同步', exact: true })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: 'upstream · 与远端不一致', exact: true })).toHaveAttribute('title', /不会强制覆盖/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const { ipc } = await import('/src/core/ipc.ts');
    ipc.remoteRefStatus = async () => { throw new Error('offline'); };
  });
  await marker.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '检查远端状态', exact: true }).click();
  await expect(marker).toHaveAttribute('data-tag-remote-status', 'unknown');
  await expect(marker).toHaveAttribute('title', /状态未知/);
});
