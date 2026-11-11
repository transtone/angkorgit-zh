import { expect, test } from '@playwright/test';

test('tag pushes retain upstream destination rules with custom remote names', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  for (const entry of ['graph', 'sidebar'] as const) {
    await expect.poll(() => page.evaluate(async () => {
      const [{ useRepo }, { useGraph }] = await Promise.all([
        import('/src/features/repository/store.ts'), import('/src/features/graph/store.ts'),
      ]);
      return !useRepo.getState().refreshing && !useGraph.getState().loading && useGraph.getState().commits.length > 0;
    })).toBe(true);
    await page.evaluate(async () => {
      const [{ useRepo }, { useGraph }, { ipc }, { useUi }] = await Promise.all([
        import('/src/features/repository/store.ts'), import('/src/features/graph/store.ts'),
        import('/src/core/ipc.ts'), import('/src/features/ui/store.ts'),
      ]);
      const remotes = [{ name: 'project', url: '/project' }, { name: 'source', url: '/source' }];
      ipc.remotes = async () => remotes;
      ipc.remoteRefStatus = async () => ({ staleRefs: [], tags: [{ name: 'v0.4.0', status: 'localOnly' }] });
      const tracker = window as unknown as { __tagDestinations: string[] };
      tracker.__tagDestinations = [];
      ipc.pushTag = async (_path, remote) => {
        tracker.__tagDestinations.push(remote);
        return { status: 'ok', message: '推送完成' };
      };
      useRepo.setState({ remotes, branches: useRepo.getState().branches.map(b => b.isHead ? { ...b, upstream: 'source/main' } : b) });
      await useRepo.getState().checkStaleRemoteRefs();
      useGraph.setState({ commits: useGraph.getState().commits.map((c, i) => i === 0 ? { ...c, refs: [{ kind: 'tag', name: 'refs/tags/v0.4.0', shorthand: 'v0.4.0' }] } : c) });
      useUi.getState().setSidebarSection('tags', true);
    });
    if (entry === 'graph') {
      await page.getByRole('row').first().locator('[data-ref-name="refs/tags/v0.4.0"]').click({ button: 'right' });
    } else {
      await page.getByRole('complementary', { name: '分支与引用' }).getByText('v0.4.0', { exact: true }).click({ button: 'right' });
    }
    const push = page.getByRole('menuitem', { name: '推送到远端', exact: true });
    await expect(push).toHaveCount(1);
    await expect(push).not.toHaveAttribute('aria-haspopup');
    await expect(page.getByRole('menuitem', { name: '检查远端状态', exact: true })).toHaveCount(0);
    await push.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __tagDestinations: string[] }).__tagDestinations))
      .toEqual(['source']);
    await expect(page.getByRole('menu')).toHaveCount(0);
  }
});
