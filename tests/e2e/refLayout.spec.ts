import { expect, test } from '@playwright/test';

test('long remote refs overlay the original chip without moving the overflow count or showing underlying labels', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(async () => {
    const { useGraph } = await import('/src/features/graph/store.ts');
    return useGraph.getState().commits.length > 0 && !useGraph.getState().loading;
  })).toBe(true);
  await page.evaluate(async () => {
    const { useGraph } = await import('/src/features/graph/store.ts');
    useGraph.setState({ commits: useGraph.getState().commits.map((commit, i) => i === 0 ? {
      ...commit, refs: ['HEAD', 'main'].map((name) => ({ kind: 'remoteBranch', name: `refs/remotes/upstream/${name}`, shorthand: `upstream/${name}` })),
    } : commit) });
  });
  const row = page.getByRole('row').first();
  const chip = row.locator('[data-ref-name="refs/remotes/upstream/HEAD"]');
  const count = row.getByRole('button', { name: '还有 1 个引用' });
  const before = { chip: await chip.boundingBox(), count: await count.boundingBox() };
  await chip.hover();
  expect(await count.boundingBox()).toEqual(before.count);
  const panel = page.locator('[data-more-refs]');
  await expect(panel).toBeVisible();
  expect(await chip.boundingBox()).toEqual(before.chip);
  expect(await count.boundingBox()).toEqual(before.count);
  const cell = await chip.locator('..').boundingBox();
  const panelBox = await panel.boundingBox();
  const first = await panel.locator('[data-ref-name="refs/remotes/upstream/HEAD"]').boundingBox();
  if (!before.chip || !first || !panelBox) throw new Error('Missing reference geometry');
  expect(Math.abs(first.x - before.chip.x)).toBeLessThan(0.5);
  expect(Math.abs(first.y - before.chip.y)).toBeLessThan(0.5);
  expect(await panel.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^rgb\(/);
  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  await expect(chip).not.toHaveAttribute('title');
  await expect(panel.locator('[title]')).toHaveCount(0);
  expect(await panel.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await panel.locator('[data-ref-name="refs/remotes/upstream/main"]').hover();
  await expect(panel).toBeVisible();
  expect(await count.boundingBox()).toEqual(before.count);
});
