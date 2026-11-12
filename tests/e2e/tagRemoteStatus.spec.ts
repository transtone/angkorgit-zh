import { expect, test } from '@playwright/test';

test('tag status shows sync state and keeps the local tag visible when remote check fails', async ({ page }) => {
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
      ...commit, refs: [
        { kind: 'tag', name: 'refs/tags/v-test', shorthand: 'v-test' },
        { kind: 'remoteTag', name: 'refs/angkorgit/remote-tags/origin/tags/v-test', shorthand: 'v-test', remote: 'origin' },
      ],
    } : commit) });
  });
  const marker = page.locator('[data-tag-sources]').filter({ hasText: 'v-test' }).first();
  await expect(marker).toHaveAttribute('data-tag-sources', '本地、origin');
  await expect(marker).toHaveAttribute('title', 'v-test · 本地、origin');
  await expect(marker.locator('.lucide-monitor')).toHaveCount(0);
  await expect(marker.locator('.lucide-cloud')).toHaveCount(1);
  const bounds = await marker.evaluate((element) => {
    const parent = element.getBoundingClientRect();
    const icons = [...element.querySelectorAll('svg')].map((icon) => icon.getBoundingClientRect());
    return { parentRight: parent.right, firstRight: icons[0].right, secondLeft: icons[1].left, secondRight: icons[1].right };
  });
  expect(bounds.secondLeft - bounds.firstRight).toBeGreaterThanOrEqual(4);
  expect(bounds.secondRight).toBeLessThanOrEqual(bounds.parentRight);
  await marker.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '检查远端状态', exact: true })).toHaveCount(0);
  const push = page.getByRole('menuitem', { name: '推送到远端', exact: true });
  await expect(page.getByRole('menuitem', { name: '复制标签名', exact: true })).toBeVisible();
  await expect(push).toHaveCount(1);
  await expect(push).toBeDisabled();
  await expect(push).not.toHaveAttribute('aria-haspopup');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const { ipc } = await import('/src/core/ipc.ts');
    ipc.remoteRefStatus = async () => { throw new Error('offline'); };
  });
  await page.evaluate(async () => {
    const { useRepo } = await import('/src/features/repository/store.ts');
    await useRepo.getState().checkStaleRemoteRefs();
    return true;
  });
  await expect(marker).toHaveAttribute('data-tag-sources', '本地、origin');
  await expect(marker).toHaveAttribute('title', 'v-test · 本地、origin');
  await expect(marker.locator('.lucide-monitor')).toHaveCount(0);
  await expect(marker.locator('.lucide-cloud')).toHaveCount(1);
});
