import { expect, test } from '@playwright/test';

test('project switching restores cached rows and reading position while refresh is pending', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  const table = page.getByRole('table', { name: '提交', exact: true });
  await expect(table.getByRole('row').first()).toBeVisible();
  const original = await page.evaluate(async () => {
    const { useRepo } = await import('/src/features/repository/store.ts');
    return useRepo.getState().repo.path;
  });
  await table.evaluate((el) => { el.scrollTop = 600; });
  await expect.poll(() => table.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
  await page.evaluate(async () => {
    const { useRepo } = await import('/src/features/repository/store.ts');
    await useRepo.getState().open('/Users/demo/projects/temple-ui');
  });
  await expect(table.getByRole('row').first()).toBeVisible();
  await page.evaluate(async (path) => {
    const [{ ipc }, { useRepo }] = await Promise.all([
      import('/src/core/ipc.ts'), import('/src/features/repository/store.ts'),
    ]);
    ipc.history = () => new Promise(() => {});
    ipc.status = () => new Promise(() => {});
    await useRepo.getState().open(path);
  }, original);
  await expect.poll(() => table.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
  await expect(table.getByRole('row').first()).toBeVisible();
  await expect(page.locator('[data-table-loading]')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: '分支与引用' })).toBeVisible();
  await expect(page.getByRole('status', { name: '正在刷新' })).toBeVisible();
});

test('commit search shortcut remains available while the first history query is pending', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('最近仓库')).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    const { ipc } = await import('/src/core/ipc.ts');
    ipc.history = () => new Promise(() => {});
  });
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.locator('[data-table-loading]')).toBeVisible();
  const search = page.getByPlaceholder('搜索提交…');
  await page.keyboard.press('ControlOrMeta+f');
  await expect(search).toBeFocused();
  await expect(page.locator('[data-table-loading]')).toBeVisible();
});

test('manual refresh uses a transparent overlay confined to the table', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  const table = page.getByRole('table', { name: '提交', exact: true });
  const firstRow = table.getByRole('row').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();
  const selected = await page.evaluate(async () => {
    const { useGraph } = await import('/src/features/graph/store.ts');
    return useGraph.getState().selectedOid;
  });
  await page.evaluate(async () => {
    const { ipc } = await import('/src/core/ipc.ts');
    ipc.history = () => new Promise(() => {});
    ipc.status = () => new Promise(() => {});
  });
  await page.keyboard.press('ControlOrMeta+r');
  const overlay = page.locator('[data-table-loading]');
  await expect(overlay).toBeVisible();
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(async () => {
    const { useGraph } = await import('/src/features/graph/store.ts');
    return useGraph.getState().selectedOid;
  })).toBe(selected);
  const overlayBox = await overlay.boundingBox();
  const tableBox = await table.boundingBox();
  expect(overlayBox).toEqual(tableBox);
  const visual = await overlay.evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    blur: getComputedStyle(el).backdropFilter,
  }));
  expect(visual.background).toMatch(/0\.1\)/);
  expect(visual.blur).toBe('none');
  await expect(table.getByRole('row').first()).toBeVisible();
  await expect(page.getByRole('complementary', { name: '分支与引用' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.getByPlaceholder('搜索提交…')).toBeFocused();
  await expect(overlay).toBeVisible();
});
