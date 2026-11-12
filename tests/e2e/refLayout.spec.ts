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
  const count = row.getByRole('note', { name: '还有 1 个引用' });
  await page.getByRole('row').nth(1).click();
  const selected = page.locator('[role="row"][aria-selected="true"]');
  const selectedText = await selected.textContent();
  const panel = page.locator('[data-more-refs]');
  await count.hover();
  await expect(panel).toBeVisible();
  await expect(row).toHaveAttribute('aria-selected', 'false');
  await expect(count).toHaveCSS('cursor', 'default');
  await expect(count).not.toHaveAttribute('tabindex');
  await expect(count).not.toHaveAttribute('aria-expanded');
  await count.click();
  await expect(selected).toHaveText(selectedText!);
  await count.dblclick();
  await expect(selected).toHaveText(selectedText!);
  await count.click({ button: 'right' });
  await expect(selected).toHaveText(selectedText!);
  await expect(row).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expect(panel).toBeHidden();
  await count.hover();
  await expect(panel).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(panel).toBeHidden();
  const before = { chip: await chip.boundingBox(), count: await count.boundingBox() };
  await chip.hover();
  expect(await count.boundingBox()).toEqual(before.count);
  await expect(panel).toBeVisible();
  expect(await chip.boundingBox()).toEqual(before.chip);
  expect(await count.boundingBox()).toEqual(before.count);
  const cell = await chip.locator('..').boundingBox();
  const panelBox = await panel.boundingBox();
  const first = await panel.locator('[data-ref-name="refs/remotes/upstream/HEAD"]').boundingBox();
  if (!before.chip || !first || !panelBox) throw new Error('Missing reference geometry');
  expect(Math.abs(first.x - before.chip.x)).toBeLessThan(0.5);
  expect(Math.abs(first.y - before.chip.y)).toBeLessThan(0.5);
  expect(await panel.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await panel.locator('[data-ref-name="refs/remotes/upstream/main"]').evaluate((el) => {
    const color = getComputedStyle(el).backgroundColor;
    return color.includes(' / ') ? Number(color.split(' / ')[1].replace(')', '')) : color.startsWith('rgba(') ? Number(color.split(',')[3].replace(')', '')) : 1;
  })).toBe(1);
  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  await expect(chip).not.toHaveAttribute('title');
  await expect(panel.locator('[title]')).toHaveCount(0);
  expect(await panel.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await panel.locator('[data-ref-name="refs/remotes/upstream/main"]').hover();
  await expect(panel).toBeVisible();
  expect(await count.boundingBox()).toEqual(before.count);
});
