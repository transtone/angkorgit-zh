import { expect, test, type Locator, type Page } from '@playwright/test';

async function openGraph(page: Page, kind: 'branch' | 'tag', crowded = false) {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(async () => {
    const [{ useRepo }, { useGraph }] = await Promise.all([
      import('/src/features/repository/store.ts'), import('/src/features/graph/store.ts'),
    ]);
    return !useRepo.getState().refreshing && !useGraph.getState().loading && useGraph.getState().commits.length > 4;
  })).toBe(true);
  await page.evaluate(async ({ kind, crowded }) => {
    const [{ useGraph }, { ipc }] = await Promise.all([
      import('/src/features/graph/store.ts'), import('/src/core/ipc.ts'),
    ]);
    const refs = ['first-long-reference', 'later-long-reference'].map((name) => ({
      kind: kind === 'branch' ? 'localBranch' as const : 'tag' as const,
      name: `refs/${kind === 'branch' ? 'heads' : 'tags'}/${name}`,
      shorthand: name,
    }));
    useGraph.setState({ commits: useGraph.getState().commits.map((commit, i) => i === 1
      ? { ...commit, isHead: false, refs: crowded ? refs : refs.slice(0, 1) } : commit) });
    const tracker = window as unknown as { __overflowCheckouts: number };
    tracker.__overflowCheckouts = 0;
    ipc.checkout = async () => { tracker.__overflowCheckouts++; return { status: 'ok' }; };
    ipc.checkoutDetached = async () => { tracker.__overflowCheckouts++; return { status: 'ok' }; };
  }, { kind, crowded });
  return page.locator('[role="row"]').nth(1);
}

const background = (row: Locator) => row.evaluate((el) => getComputedStyle(el).backgroundColor);
const selectRow = (row: Locator) => row.click({ position: { x: 350, y: 16 } });
const selection = (page: Page) => page.evaluate(async () => {
  const { useGraph } = await import('/src/features/graph/store.ts');
  const { selectedOid, selectedOids } = useGraph.getState();
  return { selectedOid, selectedOids };
});

for (const entry of ['commit', 'branch', 'tag'] as const) {
  test(`${entry} context menu preserves selection and applies only the intended row background`, async ({ page }) => {
    const row = await openGraph(page, entry === 'tag' ? 'tag' : 'branch');
    const other = page.locator('[role="row"]').nth(3);
    const openMenu = async () => {
      if (entry === 'commit') await row.click({ button: 'right', position: { x: 350, y: 16 } });
      else await row.locator('[data-ref-name]').click({ button: 'right' });
      await expect(page.getByRole('menu')).toBeVisible();
      await page.getByRole('menuitem').first().hover();
    };
    await row.hover({ position: { x: 350, y: 16 } });
    const hoverColor = await row.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'hsl(var(--surface-raised))';
      el.appendChild(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    await selectRow(other);
    const original = await selection(page);
    await openMenu();
    await expect(row).toHaveAttribute('aria-selected', 'false');
    await expect(other).toHaveAttribute('aria-selected', 'true');
    expect(await selection(page)).toEqual(original);
    await expect.poll(() => background(row)).toBe(entry === 'commit' ? hoverColor : 'rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');
    await page.mouse.move(0, 0);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect.poll(() => background(row)).toBe('rgba(0, 0, 0, 0)');
    expect(await selection(page)).toEqual(original);

    await row.click({ modifiers: ['ControlOrMeta'], position: { x: 350, y: 16 } });
    await page.mouse.move(0, 0);
    await expect(row).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => background(row)).not.toBe('rgba(0, 0, 0, 0)');
    const multi = await selection(page);
    await openMenu();
    expect(await selection(page)).toEqual(multi);
    await expect(page.locator('[role="row"][aria-selected="true"]')).toHaveCount(2);
    if (entry === 'commit') await expect.poll(() => background(row)).toBe(hoverColor);
    else await expect(row).toHaveClass(/bg-primary\/10/);
    await page.keyboard.press('Escape');
    await page.mouse.move(0, 0);
    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(await selection(page)).toEqual(multi);
    await expect(row).toHaveClass(/bg-primary\/10/);
  });
}

for (const kind of ['branch', 'tag'] as const) {
  for (const index of [-1, 0, 1]) {
    test(`${kind} ${index === -1 ? 'shown' : `overflow reference ${index + 1}`} keeps its panel below the menu without selecting its row`, async ({ page }) => {
      const row = await openGraph(page, kind, true);
      const underlying = row.locator('[data-ref-name]');
      const originalBox = await underlying.boundingBox();
      const panel = page.locator('[data-more-refs]');
      const refs = panel.locator('[data-ref-name]');
      const originalSelection = await selection(page);
      let targetName: string | null;
      if (index === -1) {
        targetName = await underlying.getAttribute('data-ref-name');
        const box = await underlying.boundingBox();
        if (!box) throw new Error('Missing shown reference geometry');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
      } else {
        await row.getByRole('note', { name: '还有 1 个引用' }).hover();
        await expect(panel).toBeVisible();
        targetName = await refs.nth(index).getAttribute('data-ref-name');
        await refs.nth(index).click({ button: 'right' });
      }
      await expect(refs).toHaveCount(2);
      await expect(page.locator('[data-ref-menu-title]')).toHaveText(index <= 0 ? 'first-long-reference' : 'later-long-reference');
      const menuItem = page.getByRole('menuitem').first();
      await menuItem.hover();
      await page.waitForTimeout(250); // Exceed the hover-card close delay while the pointer is in the menu.
      await expect(panel).toBeVisible();
      await expect(panel.locator(`[data-ref-name="${targetName}"]`)).toBeVisible();
      await expect(refs.first()).toBeVisible();
      await expect(underlying).toHaveCSS('visibility', 'hidden');
      expect(await underlying.boundingBox()).toEqual(originalBox);
      await expect(row).toHaveAttribute('aria-selected', 'false');
      await expect.poll(() => background(row)).toBe('rgba(0, 0, 0, 0)');
      expect(await selection(page)).toEqual(originalSelection);
      expect(await menuItem.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      })).toBe(true);
      await page.keyboard.press('Escape');
      await page.mouse.move(0, 0);
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(panel).toBeHidden();
      await expect(underlying).toBeVisible();
      expect(await underlying.boundingBox()).toEqual(originalBox);
      expect(await selection(page)).toEqual(originalSelection);
    });
  }

  test(`${kind} chips emphasize only the hovered or menu source without changing size`, async ({ page }) => {
    const row = await openGraph(page, kind, true);
    await row.getByRole('note', { name: '还有 1 个引用' }).hover();
    const panel = page.locator('[data-more-refs]');
    const chips = panel.locator('[data-ref-name]');
    await expect(chips).toHaveCount(2);
    const first = chips.nth(0);
    const second = chips.nth(1);
    const style = (chip: Locator) => chip.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, border: s.borderColor, color: s.color, weight: s.fontWeight };
    });
    const normal = await style(second);
    const box = await second.boundingBox();
    await second.hover();
    await expect.poll(async () => (await style(second)).background).not.toBe(normal.background);
    await second.evaluate(async (el) => {
      await new Promise(requestAnimationFrame);
      await Promise.all(el.getAnimations().map((animation) => animation.finished));
    });
    const emphasized = await style(second);
    expect(emphasized.border).not.toBe(normal.border);
    expect(emphasized.color).not.toBe(normal.color);
    expect(emphasized.weight).toBe(normal.weight);
    expect(await second.boundingBox()).toEqual(box);
    await expect.poll(() => style(first)).toEqual(normal);
    await second.click({ button: 'right' });
    await page.getByRole('menuitem').first().hover();
    await expect.poll(() => style(second)).toEqual(emphasized);
    await expect.poll(() => style(first)).toEqual(normal);
    await page.keyboard.press('Escape');
    await page.mouse.move(0, 0);
    await expect(panel).toBeHidden();
    await expect(row.locator('[data-ref-name]')).toBeVisible();
  });
}

test('a lone reference stays visible and emphasized while its menu is open', async ({ page }) => {
  const row = await openGraph(page, 'branch');
  const chip = row.locator('[data-ref-name]');
  await chip.click({ button: 'right' });
  await page.getByRole('menuitem').first().hover();
  await expect(chip).toBeVisible();
  await expect(page.locator('[data-more-refs]')).toHaveCount(0);
  await expect(row).toHaveAttribute('aria-selected', 'false');
  expect(await chip.evaluate((el) => el.getAttribute('style'))).toContain('0.24');
});

test('overflow count is a static note and its gestures never select, open menus or check out', async ({ page }) => {
  const row = await openGraph(page, 'branch', true);
  const other = page.locator('[role="row"]').nth(3);
  await selectRow(other);
  const note = row.getByRole('note', { name: '还有 1 个引用' });
  await expect(note).toHaveText('+1');
  await expect(note).toHaveAttribute('data-ref-overflow');
  await expect(note).toHaveCSS('cursor', 'default');
  await expect(row.getByRole('button', { name: '还有 1 个引用' })).toHaveCount(0);
  expect(await note.evaluate((el) => el.tagName)).toBe('SPAN');
  for (const type of ['click', 'dblclick', 'contextmenu']) {
    await note.evaluate((el, type) => el.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0,
      detail: type === 'dblclick' ? 2 : 1,
    })), type);
    await expect(row).toHaveAttribute('aria-selected', 'false');
    await expect(other).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator('[data-more-refs]')).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { __overflowCheckouts: number }).__overflowCheckouts)).toBe(0);
  }
  await note.hover();
  await expect(page.locator('[data-more-refs]')).toBeVisible();
  await expect(row).toHaveAttribute('aria-selected', 'false');
});
