import { expect, test } from '@playwright/test';

test('ref and commit menu titles share compact height, color and spacing and wrap long names', async ({ page }) => {
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
      ...commit, refs: [{ kind: 'localBranch', name: 'refs/heads/main', shorthand: 'main' }],
    } : commit) });
  });
  const row = page.getByRole('row').first();
  await row.locator('[data-ref-name="refs/heads/main"]').click({ button: 'right' });
  const refTitle = page.locator('[data-ref-menu-title]');
  await expect(refTitle).toBeVisible();
  const refStyle = await refTitle.evaluate((el) => {
    const style = getComputedStyle(el);
    return { height: el.getBoundingClientRect().height, color: style.color,
      font: style.fontFamily, weight: style.fontWeight, padding: style.padding };
  });
  const itemHeight = await page.getByRole('menuitem', { name: '将分支名称复制到剪贴板', exact: true })
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(refStyle.height).toBeCloseTo(itemHeight - 4, 1);
  await expect(refTitle.locator('+ [role="separator"]')).toHaveCount(1);
  await page.keyboard.press('Escape');

  await row.click({ button: 'right', position: { x: 350, y: 16 } });
  const commitTitle = page.locator('[data-commit-menu-title]');
  await expect(commitTitle).toBeVisible();
  const commitStyle = await commitTitle.evaluate((el) => {
    const style = getComputedStyle(el);
    return { height: el.getBoundingClientRect().height, color: style.color,
      font: style.fontFamily, weight: style.fontWeight, padding: style.padding };
  });
  expect(commitStyle.height).toBeCloseTo(refStyle.height, 1);
  expect({ ...commitStyle, height: 0 }).toEqual({ ...refStyle, height: 0 });
  await expect(commitTitle.locator('+ [role="separator"]')).toHaveCount(1);
  await page.keyboard.press('Escape');

  await page.evaluate(async () => {
    const { useGraph } = await import('/src/features/graph/store.ts');
    useGraph.setState({ commits: useGraph.getState().commits.map((commit, i) => i === 0 ? {
      ...commit, refs: [{ kind: 'localBranch', name: 'refs/heads/main', shorthand: 'feature/' + 'long-name-'.repeat(12) }],
    } : commit) });
  });
  await row.locator('[data-ref-name="refs/heads/main"]').click({ button: 'right' });
  await expect(refTitle).toBeVisible();
  const longBox = await refTitle.boundingBox();
  expect(longBox!.height).toBeGreaterThan(refStyle.height);
  expect(longBox!.width).toBeLessThanOrEqual(256);
  expect(await refTitle.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
