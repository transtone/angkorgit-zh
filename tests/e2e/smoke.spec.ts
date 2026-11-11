import { expect, test } from '@playwright/test';
import { filterFiles } from '../../packages/core/src/git/fileFilter';
import { demoStatus } from '../../apps/desktop/src/core/demo';

test('启动画面淡入欢迎屏幕', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('力量。简洁。匠心。')).toBeVisible();
  await expect(page.getByText('最近仓库')).toBeVisible({ timeout: 10_000 });
});

test('打开演示仓库并显示提交图', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('main', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('工作副本')).toBeVisible();
});

test('选择提交会打开检查器', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('row').first().click();
  await expect(page.getByRole('complementary', { name: '检查器' }).getByRole('button', { name: '4 已修改' })).toBeVisible();
});

test('命令面板可通过键盘快捷键打开', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByPlaceholder('输入命令或分支名…')).toBeVisible();
});

test('commit search finds matches in the full graph and steps through them', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  const search = page.getByPlaceholder('搜索提交…');
  await expect(search).toBeVisible({ timeout: 10_000 });
  await search.fill('virtualize');
  await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/200\+ 个提交/)).toBeVisible();
  await expect(page.locator('[data-search-match="active"]')).toHaveText(/virtualize commit rows/);
  await expect(page.locator('[data-search-match]').first()).toBeVisible();
  await search.press('Enter');
  await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
  await page.getByLabel('上一个匹配').click();
  await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();
  await page.getByText('fix(diff): handle renamed files in word diff').first().click();
  await expect(search).toHaveValue('virtualize');
  await expect(page.locator('[data-search-match="active"]')).toHaveCount(0);
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(page.getByText(/^1 \/ \d+$/)).toBeHidden();
});

test('a search result that lands after a click keeps the clicked commit selected', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('angkorgit-demo-search-delay', '1500'));
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  const search = page.getByPlaceholder('搜索提交…');
  await expect(search).toBeVisible({ timeout: 10_000 });
  await search.fill('virtualiz');
  const pill = page.getByText(/^1 \/ \d+$/);
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-search-match="active"]')).toHaveText(/virtualize commit rows/);
  await search.pressSequentially('e');
  const clicked = page.locator('[role="row"]', { hasText: 'perf(history): lazy-load decorations' }).first();
  await clicked.click();
  await expect(clicked).toHaveAttribute('aria-selected', 'true');
  await expect(pill).toBeHidden();
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await expect(clicked).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-search-match="active"]')).toHaveCount(0);
  await expect(page.locator('[data-search-match]').first()).toBeVisible();
  await page.locator('[data-search-match]').nth(1).click();
  await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
  await search.press('Enter');
  await expect(page.getByText(/^3 \/ \d+$/)).toBeVisible();
  await expect(page.locator('[data-search-match="active"]')).toHaveText(/virtualize commit rows/);
});

test('side-by-side rows pair edited lines by similarity and leave insertions alone', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await page.getByText('CommitGraph.tsx').first().click();
  await page.getByRole('button', { name: '并排 diff' }).click();
  const rowOf = (pane: 'old' | 'new', text: string) =>
    page.locator(`[data-diff-pane="${pane}"] [data-diff-row]`, { hasText: text }).first().getAttribute('data-diff-row');
  await expect(page.locator('[data-diff-pane="old"]')).toBeVisible();
  expect(await rowOf('new', 'import { ROW_HEIGHT, OVERSCAN }')).toBe(await rowOf('old', "import { ROW_HEIGHT } from './constants';"));
  const rewritten = await rowOf('old', 'const renderRow = (row: Row)');
  expect(await rowOf('new', 'const renderRow = (item: VirtualItem')).toBe(rewritten);
  const comment = await rowOf('new', '/**');
  expect(comment).not.toBe(rewritten);
  await expect(page.locator(`[data-diff-pane="old"] [data-diff-row="${comment}"]`)).toHaveAttribute('data-diff-blank', 'true');
  await page.locator('[data-diff-pane="new"]').getByText('logger.info(userId)').scrollIntoViewIfNeeded();
  expect(await rowOf('new', 'return db.get(userId);')).toBe(await rowOf('old', 'return db.get(id);'));
  const inserted = await rowOf('new', 'logger.info(userId)');
  await expect(page.locator(`[data-diff-pane="old"] [data-diff-row="${inserted}"]`)).toHaveAttribute('data-diff-blank', 'true');
});

test('pull and push offer every remote and follow the branch upstream by default', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByRole('button', { name: '拉取选项' })).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    const [{ ipc }, { useRepo }] = await Promise.all([
      import('/src/core/ipc.ts'),
      import('/src/features/repository/store.ts'),
    ]);
    const tracker = window as unknown as { __remoteCalls: string[] };
    tracker.__remoteCalls = [];
    const remotes = [
      { name: 'gitlab', url: 'git@gitlab.com:demo/angkorgit.git' },
      { name: 'origin', url: 'git@github.com:demo/angkorgit.git' },
    ];
    ipc.remotes = async () => remotes;
    ipc.pull = async (_path, name) => {
      tracker.__remoteCalls.push(`pull:${name}`);
      return { status: 'ok', message: `Pulled ${name}` };
    };
    ipc.push = async (_path, name, _force, _tags, setUpstream) => {
      tracker.__remoteCalls.push(`push:${name}:${setUpstream}`);
      return { status: 'ok', message: `Pushed ${name}` };
    };
    useRepo.setState({ remotes });
  });
  const calls = () => page.evaluate(() => (window as unknown as { __remoteCalls: string[] }).__remoteCalls);
  await page.getByRole('button', { name: /^拉取( \d+)?$/ }).click();
  await expect.poll(calls).toEqual(['pull:origin']);
  await page.getByRole('button', { name: '拉取选项' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'origin' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('menuitemcheckbox', { name: 'gitlab' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('menuitemcheckbox', { name: 'gitlab' }).click();
  await expect.poll(calls).toEqual(['pull:origin', 'pull:gitlab']);
  await page.getByRole('button', { name: '推送选项' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'gitlab' }).click();
  await expect.poll(calls).toEqual(['pull:origin', 'pull:gitlab', 'push:gitlab:false']);
  await page.getByRole('button', { name: '推送选项' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'origin' }).click();
  await expect.poll(calls).toEqual(['pull:origin', 'pull:gitlab', 'push:gitlab:false', 'push:origin:true']);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  const remoteName = 'gitlab';
  await page.getByPlaceholder(/输入命令/).fill(`从 ${remoteName} 拉取`);
  await expect(page.getByRole('option', { name: `从 ${remoteName} 拉取` })).toBeVisible();
});

test('the author box finds commits without flattening the graph', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  const author = page.getByPlaceholder('查找作者…');
  await expect(author).toBeVisible({ timeout: 10_000 });
  await author.fill('Dara');
  await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-search-match="active"]')).toContainText('Dara Kim');
  await expect(page.getByText(/200\+ 个提交/)).toBeVisible();
  await expect(page.locator('[data-graph-tail]').first()).toBeVisible();
  await page.getByPlaceholder('搜索提交…').fill('renamed');
  await expect(page.locator('[data-search-match="active"]')).toContainText('fix(diff): handle renamed files');
  await author.press('Enter');
  await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
});

test('reconnecting an account opens the token form with the account prefilled', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '身份验证', exact: true }).click();
  await expect(dialog.getByText('demo-user', { exact: true })).toBeVisible();
  await expect(dialog.getByPlaceholder('粘贴令牌')).toBeHidden();
  await dialog.getByRole('button', { name: 'demo-user 在 github.com 上的操作' }).click();
  await page.getByRole('menuitem', { name: /使用新令牌重新连接/ }).click();
  await expect(page.getByRole('menu')).toBeHidden();
  const token = dialog.getByPlaceholder('粘贴令牌');
  await expect(token).toBeVisible();
  await expect(token).toBeFocused();
  await expect(dialog.getByText('重新连接 demo-user @ github.com')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '重新连接', exact: true })).toBeVisible();
  await expect(dialog.getByText('从令牌中检测到')).toBeHidden();
  await expect
    .poll(() =>
      dialog.locator('input').evaluateAll((els) =>
        els
          .filter((el) => ['demo-user', 'github.com'].includes((el as HTMLInputElement).value))
          .map((el) => (el as HTMLInputElement).disabled),
      ),
    )
    .toEqual([true, true]);
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(token).toBeHidden();
  await dialog.getByRole('button', { name: '添加账户' }).click();
  await expect(dialog.getByText('添加账户', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '连接', exact: true })).toBeVisible();
  await expect(dialog.getByPlaceholder('可选')).toBeEnabled();
  await expect(dialog.getByText('从令牌中检测到')).toBeVisible();
});

test('a file history row can open the full commit in the graph', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByText('CommitGraph.tsx').first().click();
  await page.locator('section[aria-label^="文件差异："]').getByRole('button', { name: '文件历史' }).click();
  const history = page.locator('section[aria-label$="的历史"]');
  await expect(history).toBeVisible();
  const firstRow = history.getByRole('button', { name: /^打开提交 [0-9a-f]+$/ }).first();
  await firstRow.focus();
  const label = await firstRow.getAttribute('aria-label');
  const short = label?.replace('打开提交 ', '') ?? '';
  await firstRow.click();
  await expect(history).toBeHidden();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible();
  const inspector = page.getByLabel('检查器');
  await expect(inspector.getByText('提交', { exact: true })).toBeVisible();
  await expect(inspector.getByText(new RegExp(`^${short}`)).first()).toBeVisible();
  await expect(page.locator('[role="row"][aria-selected="true"]')).toContainText(short.slice(0, 7));
});

test('工作副本冲突提示使用中文并区分变基与提交', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const resolve = page.getByRole('button', { name: '解决冲突', exact: true });
  await expect(resolve).toBeVisible();
  for (const [state, hint] of [
    ['merge', '逐个解决文件冲突，然后提交以完成合并。'],
    ['rebase', '逐个解决文件冲突，然后在工具栏中继续变基。'],
    ['clean', '逐个解决文件冲突，然后提交以完成当前操作。'],
  ] as const) {
    await page.evaluate(async (state) => {
      const { useRepo } = await import('/src/features/repository/store.ts');
      const repo = useRepo.getState().repo;
      if (!repo) throw new Error('Repository not loaded');
      useRepo.setState({ repo: { ...repo, state } });
    }, state);
    await expect(page.getByText(hint, { exact: true })).toBeVisible();
  }
  await resolve.click();
  await expect(page.getByRole('dialog', { name: /解决冲突：src\/features\/graph\/drawGraph\.ts/ })).toBeVisible();
});

test('冲突解决器将所选行合并为干净的结果', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /drawGraph\.ts/ }).first().click();
  await expect(page.getByText('0 / 1 已解决')).toBeVisible();
  await expect(page.getByTitle(/未解决的冲突/).first()).toBeVisible();
  await expect(page.getByText('<<<<<<<')).toHaveCount(0);
  await page.getByLabel('取 A 侧全部行', { exact: true }).click();
  await expect(page.getByText('1 / 1 已解决')).toBeVisible();
  await expect(page.getByText('const palette = useThemePalette();')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '标记已解决' })).toBeEnabled();
});

test('single conflict shows jump nav and per-conflict take-all', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /drawGraph\.ts/ }).first().click();
  await expect(page.getByText('0 / 1 已解决')).toBeVisible();
  await expect(page.getByLabel('下一个冲突')).toBeVisible();
  await expect(page.getByText('冲突 1 / 1')).toBeVisible();
  await page.getByLabel('取 B 侧全部行解决此冲突').click();
  await expect(page.getByText('1 / 1 已解决')).toBeVisible();
  await page.getByLabel('取 B 侧全部行解决此冲突').click();
  await expect(page.getByText('0 / 1 已解决')).toBeVisible();
  await page.getByTitle(/未解决的冲突/).first().click();
  const editor = page.getByLabel('此冲突的手工编辑结果');
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  await expect(page.getByText('0 / 1 已解决')).toBeVisible();
  await expect(page.getByRole('button', { name: '标记已解决' })).toBeDisabled();
});

test('conflict result can be hand-edited per block', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /drawGraph\.ts/ }).first().click();
  await expect(page.getByText('0 / 1 已解决')).toBeVisible();
  await page.getByTitle(/未解决的冲突/).first().click();
  const editor = page.getByLabel('此冲突的手工编辑结果');
  await expect(editor).toBeVisible();
  await editor.fill('const palette = mergedThemePalette();');
  await expect(page.getByText('1 / 1 已解决')).toBeVisible();
  await page.getByText('结果', { exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByText('const palette = mergedThemePalette();')).toBeVisible();
  await expect(page.getByText('1 处手工编辑')).toBeVisible();
  await expect(page.getByRole('button', { name: '标记已解决' })).toBeEnabled();
  await page.getByText('const palette = mergedThemePalette();').click();
  await expect(editor).toBeVisible();
  await editor.fill('scrapped');
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  await expect(page.getByText('const palette = mergedThemePalette();')).toBeVisible();
  await expect(page.getByText('scrapped')).toBeHidden();
  await expect(page.getByText('1 / 1 已解决')).toBeVisible();
});

test('conflict picks land in file order and a half-picked side shows as mixed', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /drawGraph\.ts/ }).first().click();
  await expect(page.getByText('0 / 1 已解决')).toBeVisible();
  await page.getByText('return render(rows, { colors });').first().click();
  await page.getByText('const palette = useThemePalette();').first().click();
  await expect(page.getByText('1 / 1 已解决')).toBeVisible();
  await expect(page.getByText('resolved', { exact: true })).toBeVisible();
  const resultLines = page.locator('[data-line] pre');
  await expect(resultLines).toHaveCount(2);
  await expect(resultLines.nth(0)).toHaveText(/const palette = useThemePalette\(\);/);
  await expect(resultLines.nth(1)).toHaveText(/return render\(rows, \{ colors \}\);/);
  await expect(page.getByLabel('取 A 侧全部行解决此冲突')).toHaveAttribute('aria-checked', 'mixed');
  await expect(page.getByLabel('取 B 侧全部行解决此冲突')).toHaveAttribute('aria-checked', 'mixed');
  await page.getByLabel('取 A 侧全部行解决此冲突').click();
  await expect(page.getByLabel('取 A 侧全部行解决此冲突')).toHaveAttribute('aria-checked', 'true');
  await expect(resultLines).toHaveCount(3);
});

test('the resolver picks with the keyboard and opens the next conflicted file after saving', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /laneColors\.ts/ }).first().click();
  await expect(page.getByText('0 / 3 已解决')).toBeVisible();
  await expect(page.getByText('File 2 of 2')).toBeVisible();
  await page.keyboard.press('a');
  await expect(page.getByText('1 / 3 已解决')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByText('冲突 2 / 3')).toBeVisible();
  await page.keyboard.press('b');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('b');
  await expect(page.getByText('3 / 3 已解决')).toBeVisible();
  await expect(page.getByText('(section deleted)')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByText('laneColors.ts resolved')).toBeVisible();
  await expect(page.getByText('1 more file to resolve')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /解决冲突：src\/features\/graph\/drawGraph\.ts/ })).toBeVisible();
  await expect(page.getByText('File 1 of 2')).toBeHidden();
});

test('leaving a conflict with picks asks first while a clean resolver closes on Escape', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const open = () => page.getByRole('button', { name: /drawGraph\.ts/ }).first().click();
  const resolver = page.getByRole('dialog', { name: /解决冲突/ });
  await open();
  await expect(resolver).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(resolver).toBeHidden();
  await open();
  await page.getByLabel('取 A 侧全部行解决此冲突').click();
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('dialog').filter({ hasText: '不解决此文件的冲突就离开？' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '取消' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText('1 / 1 已解决')).toBeVisible();
  await resolver.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '离开' }).click();
  await expect(resolver).toBeHidden();
});

test('right-clicking a branch tip offers to push that branch', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('row').nth(0).click({ button: 'right' });
  const pushItem = page.getByRole('menuitem', { name: /^推送 main/ });
  await expect(pushItem).toBeVisible();
  await expect(pushItem).toContainText('↑2');
  await page.keyboard.press('Escape');
  await page.getByRole('row').nth(3).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /摘取到当前分支/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^推送/ })).toHaveCount(0);
});

test('local branch menus push the selected branch without checking it out', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  for (const entry of ['sidebar', 'ref', 'commit'] as const) {
    const selectedBranch = entry === 'sidebar' ? 'develop' : 'feature/diff-viewer';
    await page.evaluate(async (selectedBranch) => {
      const [{ ipc }, { useRepo }] = await Promise.all([
        import('/src/core/ipc.ts'),
        import('/src/features/repository/store.ts'),
      ]);
      const tracker = window as unknown as { __branchPush: string[] | null };
      tracker.__branchPush = null;
      useRepo.setState({
        remotes: [
          { name: 'origin', url: 'git@github.com:demo/angkorgit.git' },
          { name: 'gitlab', url: 'git@gitlab.com:demo/angkorgit.git' },
        ],
        branches: useRepo.getState().branches.map((branch) =>
          branch.name === selectedBranch ? { ...branch, upstream: `gitlab/${selectedBranch}`, ahead: 1 } : branch),
      });
      ipc.push = async (_path, remote, force, _tags, _upstream, branch) => {
        if (force) throw new Error('Unexpected force push');
        tracker.__branchPush = [remote, branch ?? ''];
        return { status: 'ok', message: '推送完成' };
      };
      ipc.checkout = async () => { throw new Error('Push must not check out a branch'); };
    }, selectedBranch);
    if (entry === 'sidebar') {
      await page.getByRole('complementary', { name: '分支与引用' })
        .getByText(selectedBranch, { exact: true }).first().click({ button: 'right' });
    } else if (entry === 'ref') {
      await page.getByTitle(/^feature\/diff-viewer · 本地/).first().click({ button: 'right' });
    } else {
      await page.getByRole('row').filter({ has: page.getByTitle(/^feature\/diff-viewer · 本地/) }).click({ button: 'right' });
    }
    await page.getByRole('menuitem', { name: entry === 'commit' ? `推送 ${selectedBranch}` : /^推送/ }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __branchPush: string[] | null }).__branchPush))
      .toEqual(['gitlab', selectedBranch]);
    await expect.poll(() => page.evaluate(async () => {
      const { useRepo } = await import('/src/features/repository/store.ts');
      return useRepo.getState().repo?.headBranch;
    })).toBe('main');
  }
});

test('synchronized local branches hide push and pull in every context menu', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    const { useRepo } = await import('/src/features/repository/store.ts');
    useRepo.setState({ branches: useRepo.getState().branches.map((branch) =>
      branch.isRemote ? branch : { ...branch, upstream: `origin/${branch.name}`, ahead: 0, behind: 0 }) });
  });
  for (const entry of ['sidebar', 'ref', 'commit'] as const) {
    if (entry === 'sidebar') {
      await page.getByRole('complementary', { name: '分支与引用' }).getByText('main', { exact: true }).first().click({ button: 'right' });
    } else if (entry === 'ref') {
      await page.getByTitle(/^main · 本地/).first().click({ button: 'right' });
    } else {
      await page.getByRole('row').first().click({ button: 'right' });
    }
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^(推送|拉取)/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  }
  await page.evaluate(async () => {
    const { useRepo } = await import('/src/features/repository/store.ts');
    useRepo.setState({ branches: useRepo.getState().branches.map((branch) =>
      branch.name === 'develop' ? { ...branch, upstream: null } : branch) });
  });
  await page.getByRole('complementary', { name: '分支与引用' }).getByText('develop', { exact: true }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '推送', exact: true })).toBeEnabled();
});

test('交互式变基对话框可从提交右键菜单打开', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('row').nth(3).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /交互式变基到此处/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('交互式变基')).toBeVisible();
  await expect(dialog.getByRole('listitem').first()).toBeVisible();
  await expect(dialog.getByRole('combobox').first()).toBeVisible();
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('cherry-pick opens a dialog with the source reference option', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('row').nth(3).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /摘取到当前分支/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('摘取提交')).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toBeChecked();
  await expect(dialog.getByText(/cherry picked from commit/)).toBeVisible();
  await dialog.getByRole('button', { name: '摘取', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Cherry-picked (demo)')).toBeVisible();
});

test('multi-select cherry-pick lists every commit in the dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('row').nth(1).click();
  await page.getByRole('row').nth(2).click({ modifiers: ['ControlOrMeta'] });
  await page.getByRole('row').nth(2).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: /在当前分支上摘取 2 个提交…/ })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '摘取 2 个提交' })).toBeVisible();
  await expect(dialog.getByText(/从旧到新/)).toBeVisible();
  await expect(dialog.locator('.font-mono')).toHaveCount(2);
  await dialog.getByRole('button', { name: '摘取 2 个提交' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Cherry-picked 2 commits (demo)')).toBeVisible();
});

test('multi-select offers squash and pre-fills the rebase plan', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('row').nth(1).click();
  await page.getByRole('row').nth(2).click({ modifiers: ['ControlOrMeta'] });
  await page.getByRole('row').nth(2).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '丢弃 2 个提交' })).toBeVisible();
  await page.getByRole('menuitem', { name: '压缩 2 个提交' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('listitem').first()).toBeVisible();
  await expect(dialog.getByRole('combobox').filter({ hasText: 'squash' })).toHaveCount(1);
  await expect(dialog.getByPlaceholder('合并消息（可选）')).toBeVisible();
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('点击文件打开的 diff 直接定位到第一处更改，无滚动动画', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const trace = page.evaluate(async () => {
    const samples: number[] = [];
    const started = performance.now();
    while (performance.now() - started < 1_000) {
      const el = document.querySelector('section[aria-label^="文件差异："] div.overflow-y-auto');
      if (el) samples.push(el.scrollTop);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return samples;
  });
  await page.getByText('palette-seed.sql').first().click();
  await expect(page.getByText('temple gold').first()).toBeVisible();
  const samples = await trace;
  const settled = samples[samples.length - 1];
  expect(settled).toBeGreaterThan(1_000);
  const climbing = samples.filter((top) => top > 0 && top < settled * 0.9);
  expect(climbing).toHaveLength(0);
});

test('长路径保持在确认对话框内', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  const longPath =
    'src/features/repository/components/working-copy/deeply/nested/WorkingCopyFileListItemContainerFactory.tsx';

  const measure = () =>
    page.getByRole('dialog').evaluate((box) => {
      const outer = box.getBoundingClientRect();
      return [...box.querySelectorAll('h2, p')].map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: (el.textContent ?? '').slice(0, 40),
          clipped: el.scrollWidth - el.clientWidth,
          spillsRight: Math.round(rect.right - outer.right),
        };
      });
    });

  const expectContained = async () => {
    const parts = await measure();
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(part.clipped, `clipped: ${part.text}`).toBeLessThanOrEqual(1);
      expect(part.spillsRight, `spills: ${part.text}`).toBeLessThanOrEqual(0);
    }
  };

  const discard = page.getByRole('button', { name: `丢弃 ${longPath}` });
  await discard.scrollIntoViewIfNeeded();
  await discard.click({ force: true });
  await expect(page.getByRole('dialog').getByText('丢弃更改？')).toBeVisible();
  await expect(page.getByRole('dialog').getByText(longPath)).toBeVisible();
  await expectContained();
  await page.getByRole('button', { name: '取消' }).click();

  await page
    .getByText('WorkingCopyFileListItemContainerFactory.tsx')
    .first()
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: /删除文件/ }).click();
  await expect(page.getByRole('dialog').getByText('删除文件？')).toBeVisible();
  await expect(page.getByRole('dialog').getByText(longPath)).toBeVisible();
  await expectContained();
});

test('无论分支是否检出，分支名都对齐', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.locator('aside button[title="feature"]').click();

  const layout = await page.evaluate(() => {
    const leftOf = (el: Element | null) =>
      el ? Math.round((el as HTMLElement).getBoundingClientRect().left) : -1;
    const branch = (name: string) => {
      const row = [...document.querySelectorAll('aside div[title*="拖到另一个分支上"]')].find(
        (el) => (el.getAttribute('title') ?? '').startsWith(`${name} —`),
      );
      return {
        left: leftOf(row?.querySelector('button span.truncate') ?? null),
        tick: !!row?.querySelector('svg.lucide-check'),
      };
    };
    return {
      head: branch('main'),
      plain: branch('develop'),
      nested: branch('feature/diff-viewer'),
      folder: leftOf(document.querySelector('aside button[title="feature"] span.truncate')),
    };
  });

  expect(layout.head.tick).toBe(true);
  expect(layout.plain.tick).toBe(false);
  expect(layout.head.left).toBe(layout.plain.left);
  expect(layout.folder).toBe(layout.plain.left);
  expect(layout.nested.left).toBe(layout.plain.left + 14);
});

test('悬停工作副本文件会显示其完整路径', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  const longPath =
    'src/features/repository/components/working-copy/deeply/nested/WorkingCopyFileListItemContainerFactory.tsx';
  await page.getByText('WorkingCopyFileListItemContainerFactory.tsx').first().hover();
  await expect(page.getByRole('tooltip').filter({ hasText: longPath })).toBeVisible();
});

test('打开并关闭 diff 后头像保持可见', async ({ page }) => {
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.route('**://www.cravatar.cn/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: pixel }),
  );

  const visibleAvatars = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('img[src*="cravatar.cn/avatar/"]')].filter(
          (img) => getComputedStyle(img).opacity === '1',
        ).length,
    );

  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect.poll(visibleAvatars, { timeout: 10_000 }).toBeGreaterThan(0);

  await page.getByText('palette-seed.sql').first().click();
  await expect(page.getByRole('button', { name: '关闭 diff' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible();
  await expect.poll(visibleAvatars, { timeout: 10_000 }).toBeGreaterThan(0);
});

test('text selection in a diff survives the right-click copy menu', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await page.getByText('palette-seed.sql').first().click();
  await page.waitForSelector('[data-diff-layer]', { timeout: 10_000 });
  await expect(page.locator('[data-diff-layer] > div').nth(5)).toBeVisible();

  const selectRows = () =>
    page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-diff-layer] > div')];
      const range = document.createRange();
      range.setStartBefore(rows[2]);
      range.setEndAfter(rows[5]);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  const selectionLength = () =>
    page.evaluate(() => window.getSelection()?.toString().trim().length ?? 0);
  const row = page.locator('[data-diff-layer] > div').nth(3);

  await selectRows();
  await expect.poll(selectionLength).toBeGreaterThan(0);
  await row.click({ button: 'right', position: { x: 60, y: 8 } });
  const copyLine = page.getByRole('menuitem', { name: '复制行' });
  await expect(copyLine).toBeVisible();
  await expect.poll(selectionLength).toBeGreaterThan(0);
  await copyLine.click();
  await expect(copyLine).not.toBeVisible();
  await expect.poll(selectionLength).toBeGreaterThan(0);

  await row.click({ button: 'right', position: { x: 60, y: 8 } });
  await expect(copyLine).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(copyLine).not.toBeVisible();
  await expect(page.getByRole('button', { name: '关闭 diff' })).toBeVisible();
  await expect.poll(selectionLength).toBeGreaterThan(0);
});

test('提交操作按钮保持在较窄的工作副本面板内', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 800 });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  const inspector = page.locator('aside[aria-label="检查器"]');
  const panel = await inspector.boundingBox();
  expect(panel).not.toBeNull();

  for (const name of ['审查', /提交 ?\d+ 个文件/] as const) {
    const button = inspector.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width, `${String(name)} spills right`).toBeLessThanOrEqual(
      panel!.x + panel!.width + 1,
    );
    expect(box!.x, `${String(name)} spills left`).toBeGreaterThanOrEqual(panel!.x - 1);
  }
});

test('打开 diff 会隐藏侧边栏，切回后返回提交图', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  const sidebar = page.getByRole('complementary', { name: '分支与引用' });
  const diff = page.locator('section[aria-label^="文件差异："]');
  const toggle = page.getByRole('button', { name: /侧边栏$/ });

  await expect(sidebar).toBeVisible();
  await page.getByText('palette-seed.sql').first().click();
  await expect(diff).toBeVisible();
  await expect(sidebar).toBeHidden();

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('angkorgit-ui');
    return raw ? JSON.parse(raw).state.sidebarOpen : null;
  });
  expect(stored).toBe(true);

  await toggle.click();
  await expect(sidebar).toBeVisible();
  await expect(diff).toBeHidden();

  await toggle.click();
  await expect(sidebar).toBeHidden();
  await page.getByText('palette-seed.sql').first().click();
  await expect(diff).toBeVisible();
  await toggle.click();
  await expect(sidebar).toBeVisible();
  await expect(diff).toBeHidden();
});

test('侧边栏列出演示拉取请求并打开创建对话框', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('拉取请求')).toBeVisible();
  await expect(page.getByText(/side-by-side word diff polish/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('草稿', { exact: true })).toBeVisible();

  await page.getByText('拉取请求', { exact: true }).hover();
  await page.getByRole('button', { name: '创建拉取请求', exact: true }).click();
  await expect(page.getByRole('heading', { name: '创建拉取请求' })).toBeVisible();
  await expect(page.getByPlaceholder('标题')).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('heading', { name: '创建拉取请求' })).toBeHidden();

  await page.getByText('拉取请求', { exact: true }).hover();
  await page.getByRole('button', { name: '创建拉取请求', exact: true }).click();
  await page.getByRole('button', { name: '添加审查人' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: /Dara Kim/ })).toBeVisible();
});

test('搜索提交哈希会在完整提交图中跳转到它', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  const search = page.getByPlaceholder('搜索提交…');
  await expect(search).toBeVisible({ timeout: 10_000 });
  await search.fill('000096aaaaaa');
  await expect(page.getByText('400 个提交')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('000096aa').first()).toBeVisible();
  await expect(page.getByText('1 / 1')).toBeVisible();

  await page.getByText('fix(diff): handle renamed files in word diff').first().click();
  await expect(page.getByText('400 个提交')).toBeVisible();
});

test('a short hash prefix jumps like a full hash and an unknown hex word reports no matches', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  const search = page.getByPlaceholder('搜索提交…');
  await expect(search).toBeVisible({ timeout: 10_000 });

  await search.fill('000096');
  await expect(page.getByText('400 个提交')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('000096aa').first()).toBeVisible();

  await search.fill('dedede');
  await expect(page.getByText('没有匹配项')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('400 个提交')).toBeVisible();
});

test('搜索不存在的哈希会保留提交图并提示', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  const search = page.getByPlaceholder('搜索提交…');
  await expect(search).toBeVisible({ timeout: 10_000 });
  await search.fill('deadbeef123');
  await expect(page.getByText('没有匹配项')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/200\+ 个提交/)).toBeVisible();
});

test('mod+f 聚焦提交搜索框', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  const search = page.getByPlaceholder('搜索提交…');
  await expect(search).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('ControlOrMeta+f');
  await expect(search).toBeFocused();
});

test('侧边栏列出演示工作树并打开新建工作树对话框', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('工作树', { exact: true })).toBeVisible();
  await expect(page.getByText('angkorgit-feature-diff-viewer')).toBeVisible();
  await expect(page.getByText('文件夹缺失')).toBeVisible();
  await page.getByText('工作树', { exact: true }).hover();
  await page.getByRole('button', { name: '新建工作树' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('新建工作树')).toBeVisible();
  await expect(dialog.getByPlaceholder('/path/to/new-folder')).toHaveValue(
    '/Users/demo/projects/angkorgit-new',
  );
  await dialog.getByPlaceholder('feature/parallel-task').fill('feature/parallel agents');
  await expect(dialog.getByPlaceholder('/path/to/new-folder')).toHaveValue(
    '/Users/demo/projects/angkorgit-feature-parallel-agents',
  );
});

test('multi-line comments in a diff stay highlighted as comments', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByText('CommitGraph.tsx').first().click();
  const inner = page
    .locator('section[aria-label^="文件差异："] span.font-mono')
    .filter({ hasText: 'Virtualized rows keep large graphs smooth for every export and import.' })
    .first();
  await expect(inner).toBeVisible();
  const html = await inner.evaluate((el) => el.innerHTML);
  expect(html.startsWith('<span class="hljs-comment">')).toBe(true);
  expect(html).not.toContain('hljs-keyword');
  expect(html).not.toContain('hljs-title');
});

test('折叠全部侧边栏分区与分支文件夹', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /^feature 1$/ }).click();
  await expect(page.getByText('diff-viewer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '远端', exact: true }).click();
  await expect(page.getByRole('button', { name: '远端', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: '折叠全部分区' }).click();
  for (const name of ['分支', '工作树', '远端', '标签', '暂存列表']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-expanded', 'false');
  }
  await expect(page.getByText('develop', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: '分支', exact: true }).click();
  await expect(page.getByText('develop', { exact: true })).toBeVisible();
  await expect(page.getByText('diff-viewer', { exact: true })).toBeHidden();
});

test('打开 diff 时检查器保持相同宽度', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const inspector = page.locator('[data-panel-id="inspector"]');
  const sidebar = page.locator('[data-panel-id="sidebar"]');
  const handle = page.locator('[data-panel-resize-handle-id]').first();
  const grip = await handle.boundingBox();
  if (!grip) throw new Error('侧边栏无调整大小手柄');
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 300);
  await page.mouse.down();
  await page.mouse.move(grip.x + 80, grip.y + 300, { steps: 8 });
  await page.mouse.up();
  const sidebarBefore = (await sidebar.boundingBox())?.width ?? 0;
  const inspectorBefore = (await inspector.boundingBox())?.width ?? 0;
  expect(sidebarBefore).toBeGreaterThan(200);

  const widthOf = async (locator: typeof sidebar) => (await locator.boundingBox())?.width ?? 0;
  await page.getByText('CommitGraph.tsx').first().click();
  await expect(page.locator('section[aria-label^="文件差异："]')).toBeVisible();
  await expect.poll(() => widthOf(sidebar)).toBeLessThan(2);
  await expect.poll(async () => Math.abs((await widthOf(inspector)) - inspectorBefore)).toBeLessThan(2);

  await page.keyboard.press('Escape');
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible();
  await expect.poll(async () => Math.abs((await widthOf(sidebar)) - sidebarBefore)).toBeLessThan(2);
  await expect.poll(async () => Math.abs((await widthOf(inspector)) - inspectorBefore)).toBeLessThan(2);
});

test('the inspector stops at its minimum width when dragged and comes back after file history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const inspector = page.locator('[data-panel-id="inspector"]');
  const widthOf = async () => (await inspector.boundingBox())?.width ?? 0;
  const handle = page.locator('[data-panel-resize-handle-id]').nth(1);
  const grip = await handle.boundingBox();
  if (!grip) throw new Error('no inspector resize handle');
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 300);
  await page.mouse.down();
  await page.mouse.move(1430, grip.y + 300, { steps: 12 });
  await page.mouse.up();
  const minimum = await widthOf();
  expect(minimum).toBeGreaterThan(200);
  await expect(page.getByLabel('检查器')).toBeVisible();
  await expect(page.getByText('ipc.ts', { exact: true }).first()).toBeVisible();

  await page.getByText('CommitGraph.tsx').first().click();
  await page.locator('section[aria-label^="文件差异："]').getByRole('button', { name: '文件历史' }).click();
  await expect(page.locator('section[aria-label$="的历史"]')).toBeVisible();
  await expect.poll(widthOf).toBeLessThan(2);
  await page.getByRole('button', { name: '关闭文件历史' }).click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible();
  await expect.poll(async () => Math.abs((await widthOf()) - minimum)).toBeLessThan(2);
});

test('dragging the sidebar shut and back open shows its content again', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const sidebar = page.locator('[data-panel-id="sidebar"]');
  const filter = page.getByPlaceholder('过滤引用…');
  await expect(filter).toBeVisible();
  const handle = page.locator('[data-panel-resize-handle-id]').first();
  const grip = await handle.boundingBox();
  if (!grip) throw new Error('侧边栏无调整大小手柄');
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 300);
  await page.mouse.down();
  await page.mouse.move(4, grip.y + 300, { steps: 12 });
  await expect(filter).toBeHidden();
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeLessThan(2);
  await page.mouse.move(grip.x + 40, grip.y + 300, { steps: 12 });
  await page.mouse.up();
  await expect(filter).toBeVisible();
  expect((await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(200);
  await expect(page.getByRole('button', { name: '分支', exact: true })).toBeVisible();
});

test('提交框将摘要行与较小的描述分隔开', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const summary = page.getByLabel('提交摘要');
  const description = page.getByLabel('提交说明');
  await summary.click();
  await summary.fill('feat(worktrees): list, create and remove linked worktrees');
  await expect(page.getByTitle('摘要长度（建议 50，最多 72）')).toHaveText('57/72');
  await summary.press('Enter');
  await expect(description).toBeFocused();
  await page.keyboard.type('Explains the why.');
  const [summarySize, descriptionSize] = await Promise.all([
    summary.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    description.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ]);
  expect(summarySize).toBeGreaterThan(descriptionSize);
  await expect(summary).toHaveCSS('font-weight', '500');
  await expect(page.getByRole('button', { name: /^提交 \d+ 个文件$/ })).toBeEnabled();

  await summary.fill('');
  await expect(page.getByRole('button', { name: /^提交 \d+ 个文件$/ })).toBeDisabled();
  await description.click();
  await description.fill('');
  await description.press('Backspace');
  await expect(summary).toBeFocused();
});

test('mod+enter with nothing staged asks to stage instead of committing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('angkorgit-demo-nothing-staged', '1'));
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const summary = page.getByLabel('提交摘要');
  await summary.fill('fix: nothing staged');
  await expect(page.getByRole('button', { name: '提交', exact: true })).toBeDisabled();

  await summary.press('ControlOrMeta+Enter');
  await expect(page.getByText('请先暂存一些更改')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByText('已提交', { exact: true })).toHaveCount(0);
  await expect(summary).toHaveValue('fix: nothing staged');
});

test('a failing pre-commit hook shows its output and the commit can skip the hooks', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('angkorgit-demo-hooks', 'fail'));
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  const skip = page.getByRole('checkbox', { name: '跳过钩子' });
  await expect(skip).not.toBeChecked();
  const summary = page.getByLabel('提交摘要');
  const commitButton = page.getByRole('button', { name: /^提交 \d+ 个文件$/ });
  await summary.fill('fix: lint me');
  await commitButton.click();

  const dialog = page.locator('[data-hook-failed]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('The pre-commit hook failed (exit code 1).');
  await expect(dialog).toContainText('未创建任何提交。');
  const output = dialog.locator('[data-hook-output]');
  await expect(output).toContainText("'unusedLane' is assigned a value but never used");
  expect(await output.textContent()).not.toContain('\u001b');
  await dialog.locator('[data-hook-actions]').getByRole('button', { name: '关闭' }).click();
  await expect(dialog).toBeHidden();
  await expect(summary).toHaveValue('fix: lint me');
  await expect(page.getByText('已提交', { exact: true })).toHaveCount(0);

  await commitButton.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '跳过钩子提交' }).click();
  await expect(page.getByText('已提交', { exact: true })).toBeVisible();
  await expect(summary).toHaveValue('');

  await summary.fill('fix: skip on purpose');
  await skip.check();
  await commitButton.click();
  await expect(summary).toHaveValue('');
  await expect(skip).not.toBeChecked();
  await expect(dialog).toBeHidden();
});

test('a hook that fails after a tab switch stays with its repository and offers no retry in the other tab', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('angkorgit-demo-hooks', 'fail');
    localStorage.setItem('angkorgit-demo-hooks-delay', '2500');
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('option', { name: 'temple-ui' }).click();
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+1');
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');

  const summary = page.getByLabel('提交摘要');
  await summary.fill('fix: started in angkorgit');
  await page.getByRole('button', { name: /^提交 \d+ 个文件$/ }).click();
  await expect(page.getByRole('button', { name: '正在运行钩子…' })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+2');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '正在运行钩子…' })).toHaveCount(0);
  await summary.fill('feat: temple draft');

  await expect(page.getByText('angkorgit 中未创建任何提交。', { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-hook-failed]')).toHaveCount(0);
  await expect(page.getByText('已提交', { exact: true })).toHaveCount(0);
  await expect(summary).toHaveValue('feat: temple draft');

  await page.keyboard.press('ControlOrMeta+1');
  const dialog = page.locator('[data-hook-failed]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('The pre-commit hook failed (exit code 1).');
  await dialog.locator('[data-hook-actions]').getByRole('button', { name: '关闭' }).click();
  await expect(dialog).toBeHidden();
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(summary).toHaveValue('fix: started in angkorgit');
});

test('a commit hook keeps the commit busy and reports its failure while a graph commit is selected', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('angkorgit-demo-hooks', 'fail');
    localStorage.setItem('angkorgit-demo-hooks-delay', '3000');
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  const summary = page.getByLabel('提交摘要');
  await summary.fill('fix: lint me');
  await page.getByRole('button', { name: /^提交 \d+ 个文件$/ }).click();
  const running = page.getByRole('button', { name: '正在运行钩子…' });
  await expect(running).toBeVisible();

  await page.getByText('feat(graph): virtualize commit rows').first().click();
  await expect(summary).toHaveCount(0);
  await page.getByRole('button', { name: '返回工作副本' }).click();
  await expect(running).toBeVisible();
  await expect(running).toBeDisabled();

  await page.getByText('feat(graph): virtualize commit rows').first().click();
  await expect(summary).toHaveCount(0);
  const dialog = page.locator('[data-hook-failed]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toContainText('The pre-commit hook failed (exit code 1).');
  await expect(dialog.locator('[data-hook-output]')).toContainText("'unusedLane' is assigned a value but never used");
  await dialog.locator('[data-hook-actions]').getByRole('button', { name: '关闭' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: '返回工作副本' }).click();
  await expect(summary).toHaveValue('fix: lint me');
  await expect(page.getByRole('button', { name: /^提交 \d+ 个文件$/ })).toBeEnabled();
  await expect(running).toHaveCount(0);
});

test('Commit without hooks never claims to run hooks and keeps text typed while it runs', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('angkorgit-demo-hooks', 'fail');
    localStorage.setItem('angkorgit-demo-hooks-delay', '1500');
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  const summary = page.getByLabel('提交摘要');
  const description = page.getByLabel('提交说明');
  const commitButton = page.getByRole('button', { name: /^提交 \d+ 个文件$/ });
  await summary.fill('fix: lint me');
  await commitButton.click();
  const dialog = page.locator('[data-hook-failed]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.locator('[data-hook-actions]').getByRole('button', { name: '跳过钩子提交' }).click();

  await expect(commitButton).toBeDisabled();
  await expect(page.getByRole('button', { name: '正在运行钩子…' })).toHaveCount(0);
  await description.fill('typed while the commit ran');
  await expect(page.getByText('已提交', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(summary).toHaveValue('fix: lint me');
  await expect(description).toHaveValue('typed while the commit ran');
});

test('a failing pre-push hook shows its output and the push can skip the hooks', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('angkorgit-demo-hooks', 'fail'));
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: '推送选项' }).click();
  await expect(page.getByRole('menuitem', { name: '跳过钩子推送' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('header').getByRole('button', { name: /^推送\s*\d*$/ }).click();
  const dialog = page.locator('[data-hook-failed="push"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('钩子阻止了推送');
  await expect(dialog).toContainText('pre-push 钩子执行失败（退出码 1）。');
  await expect(dialog).toContainText('未推送任何内容。');
  const output = dialog.locator('[data-hook-output]');
  await expect(output).toContainText('keeps lanes stable across pages');
  expect(await output.textContent()).not.toContain('\u001b');
  await expect(page.getByText('已将 main 推送到 origin（演示）')).toHaveCount(0);

  await dialog.locator('[data-hook-actions]').getByRole('button', { name: '跳过钩子推送' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('已将 main 推送到 origin（演示）')).toBeVisible();
});

test('Force push after a rejected Push without hooks keeps skipping the hook and pushes the same branch', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('angkorgit-demo-hooks', 'fail');
    localStorage.setItem('angkorgit-demo-push-rejected', '1');
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  await page.locator('header').getByRole('button', { name: /^推送\s*\d*$/ }).click();
  const hookDialog = page.locator('[data-hook-failed="push"]');
  await expect(hookDialog).toBeVisible();
  await hookDialog.locator('[data-hook-actions]').getByRole('button', { name: '跳过钩子推送' }).click();

  const rejected = page.locator('[data-push-rejected]');
  await expect(rejected).toBeVisible();
  await expect(rejected).toContainText('origin/main');
  await rejected.getByRole('button', { name: /^强制推送/ }).click();
  await expect(page.getByText('已将 main 推送到 origin（强制）（演示）')).toBeVisible();
  await expect(hookDialog).toHaveCount(0);
});

test('Pull with rebase after a rejected Push without hooks waits until the pushed branch is checked out again', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('angkorgit-demo-hooks', 'fail');
    localStorage.setItem('angkorgit-demo-hooks-delay', '1500');
    localStorage.setItem('angkorgit-demo-push-rejected', '1');
    localStorage.setItem('angkorgit-demo-checkout', '1');
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  await page.locator('header').getByRole('button', { name: /^推送\s*\d*$/ }).click();
  await page.getByTitle('develop — 点击筛选提交图，双击检出').dblclick();
  const checkoutBranch = 'develop';
  await expect(page.getByText(`检出 ${checkoutBranch} 已完成`)).toBeVisible();
  const hookDialog = page.locator('[data-hook-failed="push"]');
  await expect(hookDialog).toBeVisible({ timeout: 10_000 });
  await hookDialog.locator('[data-hook-actions]').getByRole('button', { name: '跳过钩子推送' }).click();

  const rejected = page.locator('[data-push-rejected]');
  await expect(rejected).toBeVisible();
  await expect(rejected).toContainText('origin/main');
  const pullRebase = rejected.getByRole('button', { name: /^拉取（变基）/ });
  await expect(pullRebase).toBeDisabled();
  await expect(rejected.locator('[data-pull-blocked]')).toHaveText(
    '请先检出 main：拉取操作会对当前检出的分支执行变基。',
  );
  await expect(rejected.getByRole('button', { name: '取消' })).toBeFocused();
  await rejected.getByRole('button', { name: '取消' }).click();
  await expect(rejected).toBeHidden();
  await expect(page.getByText('拉取（变基） 完成')).toHaveCount(0);
  await expect(page.getByText('已是最新（演示）')).toHaveCount(0);

  await page.getByTitle('main — 点击筛选提交图，双击检出').dblclick();
  await expect(page.getByText('检出 main 已完成')).toBeVisible();
  await page.getByRole('button', { name: '推送选项' }).click();
  await page.getByRole('menuitem', { name: '跳过钩子推送' }).click();
  await expect(rejected).toBeVisible();
  await expect(rejected.locator('[data-pull-blocked]')).toHaveCount(0);
  await expect(pullRebase).toBeEnabled();
  await expect(pullRebase).toBeFocused();
  await pullRebase.click();
  await expect(page.getByText('已是最新（演示）')).toBeVisible();
});

test('the commit box has no Skip hooks box when the repository has no hooks', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel('提交摘要')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '跳过钩子' })).toHaveCount(0);
  await page.getByRole('button', { name: '推送选项' }).click();
  await expect(page.getByRole('menuitem', { name: '强制推送' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '跳过钩子推送' })).toHaveCount(0);
});

test('a submodule left at an older commit offers Update submodule instead of Discard', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('angkorgit-demo-submodule-drift', '1'));
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  const row = page.locator('[data-submodule-drift]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('libfoo');
  await expect(row.getByRole('button', { name: '丢弃 vendor/libfoo' })).toHaveCount(0);

  await row.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '更新子模块至 efec64c' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '丢弃更改…' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await row.hover();
  await row.getByRole('button', { name: '更新子模块 vendor/libfoo' }).click();
  await expect(page.getByText('已在 vendor/libfoo 中检出 efec64c')).toBeVisible();
  await expect(page.locator('[data-submodule-drift]')).toHaveCount(0);
});

test('a file filter that hides the staged files leaves Commit enabled with the full count', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const staged = demoStatus.files.filter((file) => file.staged);
  expect(filterFiles(staged, (file) => file.path, 'ipc.ts')).toHaveLength(0);

  await page.getByLabel('提交摘要').fill('fix: filtered');
  await page.getByRole('button', { name: '过滤文件' }).click();
  await page.getByPlaceholder('过滤更改的文件…').fill('ipc.ts');
  await expect(page.getByText(/^已暂存/).locator('..')).toContainText(`0 of ${staged.length}`);
  await expect(page.getByRole('button', { name: `提交 ${staged.length} 个文件` })).toBeEnabled();
});

test('the commit box grows when its top edge is dragged and resets on double-click', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const description = page.getByLabel('提交说明');
  const before = (await description.boundingBox())?.height ?? 0;
  const handle = page.getByRole('separator', { name: '调整提交框大小' });
  const grip = await handle.boundingBox();
  if (!grip) throw new Error('无调整大小手柄');
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y - 120, { steps: 6 });
  await page.mouse.up();
  const after = (await description.boundingBox())?.height ?? 0;
  expect(after - before).toBeGreaterThan(100);
  await handle.dblclick();
  const reset = (await description.boundingBox())?.height ?? 0;
  expect(Math.abs(reset - before)).toBeLessThan(2);
});

test('文件夹树视图可一次性折叠和展开所有文件夹', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '文件夹树' }).click();
  await expect(page.getByText('ipc.ts', { exact: true }).first()).toBeVisible();
  const changesHeader = page.locator('div', { has: page.getByText(/^更改/) }).filter({ has: page.getByRole('button', { name: '全部暂存' }) }).last();
  await changesHeader.getByRole('button', { name: '折叠全部文件夹' }).click();
  await expect(page.getByText('ipc.ts', { exact: true })).toBeHidden();
  await changesHeader.getByRole('button', { name: '展开全部文件夹' }).click();
  await expect(page.getByText('ipc.ts', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '扁平文件列表' }).click();
  await expect(page.getByRole('button', { name: /all folders$/ })).toHaveCount(0);
});

test('提交图引用标签显示完整名称，其余折叠为计数', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const firstRow = page.getByRole('row').filter({ hasText: 'feat(graph): virtualize commit rows' }).first();
  await expect(firstRow.getByText('main', { exact: true })).toBeVisible();
  const chips = firstRow.locator('span.inline-flex');
  const labels = await chips.allInnerTexts();
  expect(labels.some((t) => t.trim() === 'main')).toBe(true);
  expect(labels.some((t) => t.trim() === 'HEAD')).toBe(false);
  for (const chip of await chips.all()) {
    const clipped = await chip.evaluate((el) => {
      const text = el.querySelector('span.truncate') ?? el;
      return text.scrollWidth > text.clientWidth + 1;
    });
    expect(clipped).toBe(false);
  }
  const hash = firstRow.getByTitle('复制完整哈希');
  await expect(hash).toHaveText(/^[0-9a-f]{7}$/);
});

test('graph display menu can switch the lane color band off and on', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.locator('[data-graph-tail]').count()).toBeGreaterThan(5);
  await page.getByRole('button', { name: '提交图显示选项' }).click();
  await page.getByRole('menuitemcheckbox', { name: '泳道色带' }).click();
  await expect(page.locator('[data-graph-tail]')).toHaveCount(0);
  await page.getByRole('menuitemcheckbox', { name: '泳道色带' }).click();
  await expect.poll(() => page.locator('[data-graph-tail]').count()).toBeGreaterThan(5);
});

test('提交图显示菜单隐藏并恢复哈希列', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTitle('复制完整哈希').first()).toBeVisible();
  await page.getByRole('button', { name: '提交图显示选项' }).click();
  await page.getByRole('menuitemcheckbox', { name: '哈希' }).click();
  await expect(page.getByTitle('复制完整哈希')).toHaveCount(0);
  await expect(page.getByRole('menuitemcheckbox', { name: '哈希' })).toBeVisible();
  await page.getByRole('menuitemcheckbox', { name: '哈希' }).click();
  await expect(page.getByTitle('复制完整哈希').first()).toBeVisible();
});

test('侧边栏分区呈手风琴行为，折叠的标题保持固定', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '折叠全部分区' }).click();
  await page.getByRole('button', { name: '分支', exact: true }).click();
  const aside = page.getByRole('complementary', { name: '分支与引用' });
  const asideBox = await aside.boundingBox();
  const tagsBox = await page.getByRole('button', { name: '标签', exact: true }).boundingBox();
  const stashesBox = await page.getByRole('button', { name: '暂存列表', exact: true }).boundingBox();
  if (!asideBox || !tagsBox || !stashesBox) throw new Error('缺少侧边栏几何信息');
  expect(stashesBox.y + stashesBox.height).toBeGreaterThan(asideBox.y + asideBox.height - 90);
  expect(tagsBox.y).toBeLessThan(stashesBox.y);
  const developBox = await page.getByText('develop', { exact: true }).boundingBox();
  if (!developBox) throw new Error('缺少分支行');
  expect(developBox.y).toBeLessThan(tagsBox.y);
  await page.getByRole('button', { name: '标签', exact: true }).click();
  await expect(aside.getByText('v0.4.0', { exact: true })).toBeVisible();
  const tagsAfter = await page.getByRole('button', { name: '标签', exact: true }).boundingBox();
  if (!tagsAfter) throw new Error('缺少标签标题');
  expect(tagsAfter.y).toBeLessThan(tagsBox.y);
});

test('欢迎页标记缺失的文件夹并可用键盘打开仓库', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('最近仓库')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('文件夹缺失')).toBeVisible();
  await expect(page.getByText('~/work/api-gateway')).toBeVisible();
  const search = page.getByLabel('搜索最近仓库');
  await expect(search).toBeFocused();
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
});

test('扫描文件夹列出其中的仓库，并把勾选的加入最近列表', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('最近仓库')).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    window.prompt = () => '/Users/demo/projects';
  });
  await page.getByRole('button', { name: '扫描文件夹查找仓库' }).click();
  const dialog = page.getByRole('dialog', { name: '从文件夹添加仓库' });
  await expect(dialog.locator('[data-scan-summary]')).toHaveText('找到 4 · 2 个已在最近列表');
  await expect(dialog.getByText('最近列表中', { exact: true })).toHaveCount(2);
  await expect(dialog.getByLabel('添加 angkorgit')).toBeDisabled();
  const add = dialog.getByRole('button', { name: '添加 2 个仓库' });
  await expect(add).toBeEnabled();
  await dialog.getByLabel('添加 lane-colors').click();
  await dialog.getByRole('button', { name: '添加 1 个仓库' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('已添加 1 个仓库')).toBeVisible();
  await expect(page.getByText('~/projects/tools/release-kit')).toBeVisible();
  await expect(page.getByText('lane-colors', { exact: true })).toHaveCount(0);
});

test('文件夹消失时关闭对应标签页，同名仓库标签显示上级目录', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'angkorgit-ui',
      JSON.stringify({
        state: {
          repoTabs: ['/Users/demo/work/api-gateway', '/Users/demo/forks/angkorgit', '/Users/demo/projects/temple-ui'],
          worktreeTabs: [],
        },
        version: 0,
      }),
    );
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('已关闭 api-gateway 标签页：其文件夹已不存在')).toBeVisible();
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  await expect(page.locator('[data-tab-path="/Users/demo/work/api-gateway"]')).toHaveCount(0);
  await expect(page.locator('[data-tab-path="/Users/demo/forks/angkorgit"] [data-tab-hint]')).toHaveText('forks');
  await expect(page.locator('[data-tab-path="/Users/demo/projects/angkorgit"] [data-tab-hint]')).toHaveText('projects');
  await expect(page.locator('[data-tab-path="/Users/demo/projects/temple-ui"] [data-tab-hint]')).toHaveCount(0);
});

test('mod+p 搜索最近仓库并打开或切换其标签页，mod+t 打开新标签页', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('最近仓库')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('ControlOrMeta+p');
  const switcher = page.locator('[data-repo-switcher]');
  const input = page.getByPlaceholder('按名称或路径搜索最近仓库…');
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await expect(switcher.locator('[data-repo-path]')).toHaveCount(4);
  await input.fill('temple');
  await expect(switcher.locator('[data-repo-path]')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(input).toBeHidden();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(1);
  await expect(page.getByRole('tab', { selected: true })).toContainText('temple-ui');

  await page.keyboard.press('ControlOrMeta+p');
  await expect(switcher.locator('[data-repo-path="/Users/demo/projects/temple-ui"] [data-repo-tab-state]')).toHaveText('当前仓库');
  await input.fill('angkor');
  await page.keyboard.press('Enter');
  await expect(tabs).toHaveCount(2);
  await expect(page.getByRole('tab', { selected: true })).toContainText('angkorgit');

  await page.keyboard.press('ControlOrMeta+p');
  await expect(switcher.locator('[data-repo-path="/Users/demo/projects/temple-ui"] [data-repo-tab-state]')).toHaveText('已打开标签页');
  await input.fill('temple');
  await page.keyboard.press('Enter');
  await expect(tabs).toHaveCount(2);
  await expect(page.getByRole('tab', { selected: true })).toContainText('temple-ui');

  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByPlaceholder('输入命令或分支名…')).toBeVisible();
  await expect(input).toBeHidden();
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    window.prompt = () => '/Users/demo/forks/sandbox';
  });
  await page.keyboard.press('ControlOrMeta+t');
  await expect(tabs).toHaveCount(3);
  await expect(page.getByRole('tab', { selected: true })).toContainText('sandbox');
});

test('“全部文件”布局堆叠显示提交的每个文件并跟随文件列表', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('row').nth(2).click();
  await page.getByLabel('提交文件').getByRole('button', { name: /GraphRow\.tsx/ }).click();
  await page.getByRole('button', { name: '显示全部文件' }).click();
  const view = page.locator('[data-all-changes]');
  await expect(view).toBeVisible();
  const sections = view.locator('[data-file-path]');
  await expect(sections).toHaveCount(5);
  await expect(view.locator('[data-file-diff]').first()).toBeVisible();
  const scroller = view.locator('[data-all-changes-scroller]');
  const topOf = async (path: string) => {
    const box = await view.locator(`[data-file-path="${path}"]`).boundingBox();
    const root = await scroller.boundingBox();
    if (!box || !root) throw new Error('geometry missing');
    return box.y - root.y;
  };
  await expect.poll(() => topOf('src/features/graph/GraphRow.tsx')).toBeLessThan(16);
  await expect(view.getByText('2 of 5')).toBeVisible();

  await page.getByLabel('提交文件').getByRole('button', { name: /Architecture\.md/ }).click();
  await expect.poll(() => topOf('docs/Architecture.md')).toBeLessThan(16);
  await expect(view.getByText('4 of 5')).toBeVisible();

  await page.getByRole('button', { name: '并排 diff' }).click();
  await expect(view.locator('[data-file-diff] div.w-1\\/2').first()).toBeVisible();
  await page.getByRole('button', { name: '内联 diff' }).click();

  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await scroller.hover();
  await page.mouse.wheel(0, 1);
  await expect(page.locator('[data-active-file]')).toContainText('CommitGraph.tsx');

  await view.getByRole('button', { name: '折叠 src/features/graph/store.ts' }).click();
  await expect(view.locator('[data-file-path="src/features/graph/store.ts"]')).toHaveAttribute('data-file-section', 'collapsed');
  await expect(view.locator('[data-file-path="src/features/graph/store.ts"] [data-file-diff]')).toHaveCount(0);
  await view.getByRole('button', { name: '折叠全部文件' }).click();
  await expect(view.locator('[data-file-section="open"]')).toHaveCount(0);
  await view.getByRole('button', { name: '展开全部文件' }).click();
  await expect(view.locator('[data-file-section="collapsed"]')).toHaveCount(0);

  await page.getByRole('button', { name: '显示单文件' }).click();
  await expect(view).toBeHidden();
  await expect(page.locator('section[aria-label^="文件差异："]')).toBeVisible();
  await page.reload();
  await page.getByText('angkorgit', { exact: true }).first().click();
  await page.getByRole('row').nth(2).click();
  await page.getByRole('button', { name: /GraphRow\.tsx/ }).first().click();
  await expect(page.locator('section[aria-label^="文件差异："]')).toBeVisible();
  await expect(view).toBeHidden();
});

test('滚动到某文件后，点击检查器中的文件仍会跳转到它', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('row').nth(2).click();
  await page.getByLabel('提交文件').getByRole('button', { name: /CommitGraph\.tsx/ }).click();
  await page.getByRole('button', { name: '显示全部文件' }).click();
  const view = page.locator('[data-all-changes]');
  const scroller = view.locator('[data-all-changes-scroller]');
  await expect(view.locator('[data-file-diff]').first()).toBeVisible();
  const topOf = async (path: string) => {
    const box = await view.locator(`[data-file-path="${path}"]`).boundingBox();
    const root = await scroller.boundingBox();
    if (!box || !root) throw new Error('geometry missing');
    return box.y - root.y;
  };
  await scroller.hover();
  await page.mouse.wheel(0, 1);
  await scroller.evaluate((el) => {
    const target = el.querySelector('[data-file-path="docs/Architecture.md"]') as HTMLElement;
    el.scrollTop = target.offsetTop;
  });
  await expect(view.getByText('4 of 5')).toBeVisible();
  await page.getByLabel('提交文件').getByRole('button', { name: /GraphRow\.tsx/ }).click();
  await expect.poll(() => topOf('src/features/graph/GraphRow.tsx')).toBeLessThan(16);
  await page.getByLabel('提交文件').getByRole('button', { name: /Architecture\.md/ }).click();
  await expect.poll(() => topOf('docs/Architecture.md')).toBeLessThan(16);
  await expect(view.getByText('4 of 5')).toBeVisible();

  await scroller.click({ position: { x: 20, y: 200 } });
  await page.keyboard.press('ArrowLeft');
  await expect(view).toBeHidden();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible();
});

test('点击文件 diff 后按 ← 关闭并返回提交图', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('row').nth(2).click();
  await page.getByLabel('提交文件').getByRole('button', { name: /CommitGraph\.tsx/ }).click();
  const diff = page.locator('section[aria-label^="文件差异："]');
  await expect(diff).toBeVisible();
  const scroller = diff.locator('div.overflow-y-auto').first();
  await expect(scroller.locator('[data-diff-row]').first()).toBeVisible();
  await scroller.locator('[data-diff-row]').first().click();
  await expect(page.locator('body')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(diff).toBeHidden();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible();
});

test('暂存文件不提供“全部文件”布局，即使记住的是该布局', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('angkorgit-ui', JSON.stringify({ state: { diffLayout: 'all' }, version: 0 }));
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('feat(graph): virtualize commit rows').first()).toBeVisible();
  await page.getByText('WIP on main: experiment with lane colors').first().click();
  const inspector = page.getByRole('complementary', { name: '检查器' });
  await expect(inspector.getByText('这是一个暂存。', { exact: false })).toBeVisible();
  await inspector.getByText('GraphRow.tsx', { exact: true }).click();
  await expect(page.locator('section[aria-label^="文件差异："]')).toBeVisible();
  await expect(page.locator('[data-all-changes]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '显示全部文件' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('row').nth(2).click();
  // 等暂存专用的“应用”按钮消失，避免它和文件行都命中 GraphRow.tsx。
  await expect(page.getByLabel(/^从暂存中应用/)).toHaveCount(0);
  await expect(inspector.getByText('这是一个暂存。', { exact: false })).toHaveCount(0);
  await page.getByLabel('提交文件').getByRole('button', { name: /GraphRow\.tsx/ }).click();
  await expect(page.locator('[data-all-changes]')).toBeVisible();
});

test('冲突解决器在两侧和结果中都显示行号', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /drawGraph\.ts/ }).first().click();
  const dialog = page.getByRole('dialog', { name: /解决冲突/ });
  await expect(dialog).toBeVisible();
  const gutters = dialog.locator('span[data-line-no]');
  const values = (await gutters.allInnerTexts()).map((t) => t.trim()).filter(Boolean).map(Number);
  expect(values.length).toBeGreaterThan(6);
  expect(values.filter((n) => n === 1).length).toBeGreaterThanOrEqual(3);
  expect(values.every((n) => Number.isInteger(n) && n > 0)).toBe(true);
});

test('hovering a crowded ref cell opens a separate panel without moving its chips', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const row = page.getByRole('row').filter({ has: page.locator('[data-ref-name="refs/heads/feature/diff-viewer"]') }).first();
  const rowChip = row.locator('[data-ref-name="refs/heads/feature/diff-viewer"]');
  await expect(row.getByText('release/0.4', { exact: true })).toHaveCount(0);
  await expect(row.getByRole('button', { name: '还有 1 个引用' })).toHaveText('+1');
  const overflow = row.getByRole('button', { name: '还有 1 个引用' });
  const before = { chip: await rowChip.boundingBox(), overflow: await overflow.boundingBox() };
  await rowChip.hover();
  const panel = page.locator('[data-more-refs]');
  const first = panel.locator('[data-ref-name="refs/heads/feature/diff-viewer"]');
  const second = panel.locator('[data-ref-name="refs/heads/release/0.4"]');
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  const rowBox = await rowChip.boundingBox();
  const overflowBox = await overflow.boundingBox();
  const panelBox = await panel.boundingBox();
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  if (!before.chip || !before.overflow || !rowBox || !overflowBox || !panelBox || !firstBox || !secondBox) throw new Error('chip geometry missing');
  expect(rowBox).toEqual(before.chip);
  expect(overflowBox).toEqual(before.overflow);
  expect(Math.abs(firstBox.x - rowBox.x)).toBeLessThan(0.5);
  expect(Math.abs(firstBox.y - rowBox.y)).toBeLessThan(0.5);
  expect(await panel.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^rgb\(/);
  await expect.poll(() => panel.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await expect(first).not.toHaveAttribute('title');
  expect(secondBox.x).toBeCloseTo(firstBox.x, 0);
  expect(secondBox.y).toBeGreaterThan(firstBox.y + firstBox.height);
  const sourceColor = await second.evaluate((el) => getComputedStyle(el).color);
  await second.click({ button: 'right' });
  const menuTitle = page.locator('[data-ref-menu-title]');
  await expect(menuTitle).toHaveText('release/0.4');
  expect(await menuTitle.evaluate((el) => getComputedStyle(el).color)).toBe(sourceColor);
  await expect(menuTitle.locator('xpath=following-sibling::*[1]')).toHaveAttribute('role', 'separator');
  await expect(page.getByRole('menuitem', { name: '检出 release/0.4' })).toBeVisible();
  await page.getByRole('menuitem', { name: '检出 release/0.4' }).hover();
  await page.waitForTimeout(250);
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-ref-name="refs/heads/release/0.4"]')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /将 .* 重置为此提交/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem')).toHaveCount(0);
  await expect(panel).toBeHidden();
});

test('the checked-out branch is the visible chip and the only one with the tick', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const rows = page.getByRole('row');
  const top = rows.first();
  await expect(top.getByTitle(/^main · 本地/)).toBeVisible();
  await expect(top.getByText('hotfix/lane-colors', { exact: true })).toHaveCount(0);
  await expect(top.getByRole('button', { name: '还有 1 个引用' })).toHaveText('+1');
  await top.getByTitle(/^main · 本地/).hover();
  const panel = page.locator('[data-more-refs]');
  const main = panel.locator('[data-ref-name="refs/heads/main"]');
  const hotfix = panel.locator('[data-ref-name="refs/heads/hotfix/lane-colors"]');
  await expect(main).toBeVisible();
  await expect(hotfix).toBeVisible();
  const mainBox = await main.boundingBox();
  const hotfixBox = await hotfix.boundingBox();
  if (!mainBox || !hotfixBox) throw new Error('chip geometry missing');
  expect(hotfixBox.y).toBeGreaterThan(mainBox.y);
  const opacity = (color: string) => Number(color.split(',')[3]?.replace(')', '') ?? '1');
  expect(opacity(await main.evaluate((el) => getComputedStyle(el).backgroundColor))).toBe(1);
  expect(opacity(await hotfix.evaluate((el) => getComputedStyle(el).backgroundColor))).toBeLessThan(1);
  await expect(main.locator('svg.lucide-check')).toHaveCount(1);
  await expect(hotfix.locator('svg.lucide-check')).toHaveCount(0);
});

test('a separated origin chip offers the reset from its right-click menu too', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByTitle(/origin\/main——双击将 main 重置到此处/).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: '将 main 重置为此提交…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('将分支重置到其远端？')).toBeVisible();
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toBeHidden();
});

test('arrow keys move the working copy diff from file to file', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByText('ipc.ts', { exact: true }).first().click();
  await expect(page.locator('section[aria-label="文件差异：src/core/ipc.ts"]')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('section[aria-label="文件差异：src/data/palette-seed.sql"]')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('section[aria-label="文件差异：docs/Architecture.md"]')).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('section[aria-label="文件差异：src/data/palette-seed.sql"]')).toBeVisible();
});

test('branch menus hide unavailable fast-forwards and advance the selected branch to main', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(async () => {
    const { ipc } = await import('/src/core/ipc.ts');
    return [
      await ipc.mergeCanFastForward('', 'develop', 'refs/remotes/origin/main'),
      await ipc.mergeCanFastForward('', 'main', 'refs/heads/main'),
    ];
  })).toEqual([true, false]);
  await page.evaluate(async () => {
    const [{ ipc }, { useRepo }] = await Promise.all([
      import('/src/core/ipc.ts'),
      import('/src/features/repository/store.ts'),
    ]);
    useRepo.setState({ worktrees: [] });
    const tracker = window as unknown as { __fastForwardCalls: string[][] };
    tracker.__fastForwardCalls = [];
    ipc.fastForward = async (_path, target, source) => {
      tracker.__fastForwardCalls.push([target, source]);
      return { status: 'fast_forward', message: '快进完成' };
    };
    ipc.merge = async () => { throw new Error('Fast-forward must not use merge'); };
  });
  const sidebar = page.getByRole('complementary', { name: '分支与引用' });
  const branch = 'develop';
  await sidebar.getByText(branch, { exact: true }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: `将 ${branch} 快进到 main`, exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: `将 main 快进到 ${branch}`, exact: true })).toHaveCount(0);
  await page.getByRole('menuitem', { name: `将 ${branch} 快进到 main`, exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fastForwardCalls: string[][] }).__fastForwardCalls))
    .toEqual([['develop', 'main']]);
  // Refresh restores demo worktrees; release the branch for the graph action too.
  await page.evaluate(async () => {
    const { useRepo } = await import('/src/features/repository/store.ts');
    useRepo.setState({ worktrees: [] });
  });
  await page.getByTitle(/^feature\/diff-viewer · 本地/).first().click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '将 feature/diff-viewer 快进到 main', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '将 main 快进到 feature/diff-viewer', exact: true })).toHaveCount(0);
  await page.getByRole('menuitem', { name: '将 feature/diff-viewer 快进到 main', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fastForwardCalls: string[][] }).__fastForwardCalls))
    .toEqual([['develop', 'main'], ['feature/diff-viewer', 'main']]);
});

test('fast-forward menus hide self, diverged and occupied branches', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const sidebar = page.getByRole('complementary', { name: '分支与引用' });
  const fastForward = page.getByRole('menuitem', { name: /快进/ });
  for (const branch of ['main', 'feature/diff-viewer']) {
    await sidebar.getByText(branch, { exact: true }).first().click({ button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(fastForward).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  }
  await page.evaluate(async () => {
    const { ipc } = await import('/src/core/ipc.ts');
    ipc.mergeCanFastForward = async () => false;
  });
  await sidebar.getByText('develop', { exact: true }).click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(fastForward).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByTitle(/^feature\/diff-viewer · 本地/).first().click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(fastForward).toHaveCount(0);
});

test('both branch menus use strict fast-forward when the current branch is behind', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    const { ipc } = await import('/src/core/ipc.ts');
    const tracker = window as unknown as { __fastForwardCalls: string[][] };
    tracker.__fastForwardCalls = [];
    ipc.mergeCanFastForward = async (_path, target, source) => target === 'main' && source !== 'main';
    ipc.fastForward = async (_path, target, source) => {
      tracker.__fastForwardCalls.push([target, source]);
      return { status: 'fast_forward', message: '快进完成' };
    };
    ipc.merge = async () => { throw new Error('Fast-forward must not use merge'); };
  });
  const branch = 'develop';
  await page.getByRole('complementary', { name: '分支与引用' }).getByText(branch, { exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: `将 main 快进到 ${branch}`, exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fastForwardCalls: string[][] }).__fastForwardCalls))
    .toEqual([['main', branch]]);
  await page.getByTitle(/^feature\/diff-viewer · 本地/).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: '将 main 快进到 feature/diff-viewer', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fastForwardCalls: string[][] }).__fastForwardCalls))
    .toEqual([['main', branch], ['main', 'feature/diff-viewer']]);
});

test('graph branch and tag chips offer the sidebar actions, with the checked-out branch protected', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByTitle(/^feature\/diff-viewer · 本地/).first().click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: '在新工作树中打开…' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: '在此处新建分支…' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: '重命名 feature/diff-viewer…' })).toBeEnabled();
  await menu.getByRole('menuitem', { name: '删除 feature/diff-viewer', exact: true }).click();
  await expect(page.getByText('删除分支 feature/diff-viewer 已完成')).toBeVisible();
  await page.getByTitle(/^main · 本地/).first().click({ button: 'right' });
  await expect(menu.getByRole('menuitem', { name: '删除 main', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await expect(menu.getByRole('menuitem', { name: '将 main 合并到 main' })).toHaveAttribute('aria-disabled', 'true');
  await expect(menu.getByRole('menuitem', { name: '检出 main' })).toHaveAttribute('aria-disabled', 'true');
  await expect(menu.getByRole('menuitem', { name: '重命名 main…' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  // The remote prefix can fold the tag behind the row's overflow badge.
  await page.getByTitle(/origin\/main——双击将 main 重置到此处/).first().hover();
  await page.locator('[data-more-refs] [data-ref-name="refs/tags/v0.4.0"]').click({ button: 'right' });
  await expect(menu.getByRole('menuitem', { name: '检出提交（游离状态）' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: '推送到远端' })).toBeDisabled();
  await menu.getByRole('menuitem', { name: '删除标签 v0.4.0', exact: true }).click();
  await expect(page.getByText('删除标签 v0.4.0 已完成')).toBeVisible();
});

test('graph chips wear their lane colour, lines run as rails and the WIP banner hides the rows under it', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const top = page.getByRole('row').first();
  const head = top.getByTitle(/^main · 本地/);
  await expect(head).toBeVisible();
  const colours = await top.evaluate((row) => {
    const chip = row.querySelector('[data-lane-chip]') as HTMLElement;
    const connector = row.querySelector('svg line[data-graph-connector]') as SVGLineElement;
    return { chip: getComputedStyle(chip).backgroundColor, lane: getComputedStyle(connector).stroke };
  });
  expect(colours.chip).toBe(colours.lane);
  const curves = await page.locator('[role=row] svg path').evaluateAll((paths) =>
    paths.map((p) => p.getAttribute('d') ?? '').filter((d) => d.includes(' C ')),
  );
  expect(curves).toEqual([]);
  const banner = page.getByRole('button', { name: /未提交的文件更改/ });
  const background = await banner.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).not.toMatch(/rgba|\/ 0\./);
});

test('a graph with more lanes than its column scrolls sideways under its own scrollbar', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-graph-scrollbar]')).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('angkorgit-demo-busy-graph', '1'));
  await page.reload();
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const bar = page.locator('[data-graph-scrollbar]');
  await expect(bar).toBeVisible();
  const list = page.getByRole('table', { name: '提交' });
  const offset = () => list.evaluate((el) => parseFloat(el.getAttribute('data-graph-scroll-x') ?? '0'));
  const node = page.getByRole('row').nth(4).locator('span.rounded-full').first();
  const start = (await node.boundingBox())!.x;
  const listBox = (await list.boundingBox())!;
  await page.mouse.move(listBox.x + 300, listBox.y + 200);
  let previous = 0;
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(10, 0);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
    const now = await offset();
    expect(now).toBeGreaterThan(previous);
    previous = now;
  }
  expect(Math.abs(start - (await node.boundingBox())!.x - previous)).toBeLessThan(1);
  const thumb = page.locator('[data-graph-scrollbar-thumb]');
  const t = (await thumb.boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width / 2 + 30, t.y + t.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(await offset()).toBeGreaterThan(previous);
  const b = (await bar.boundingBox())!;
  await page.mouse.click(b.x + 2, b.y + b.height / 2);
  expect(await offset()).toBe(0);
  await page.mouse.move(listBox.x + 500, listBox.y + 300);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await offset()).toBe(0);
});

test('dragging the graph header edge resizes the column, keeps it after a reload and scrolls only what it hides', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('angkorgit-demo-busy-graph', '1'));
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const edge = async () => (await page.locator('[data-graph-resize]').boundingBox())!.x;
  const drag = async (dx: number) => {
    const h = (await page.locator('[data-graph-resize]').boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + dx, h.y + h.height / 2, { steps: 6 });
    await page.mouse.up();
  };
  const bar = page.locator('[data-graph-scrollbar]');
  await expect(bar).toBeVisible();
  const start = await edge();
  const startBar = (await bar.boundingBox())!.width;
  await drag(-80);
  expect(Math.abs((await edge()) - (start - 80))).toBeLessThan(2);
  expect((await bar.boundingBox())!.width).toBeLessThan(startBar - 70);
  await page.reload();
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(bar).toBeVisible();
  await expect.poll(async () => Math.abs((await edge()) - (start - 80))).toBeLessThan(2);
  await drag(400);
  await expect(bar).toHaveCount(0);
  await page.locator('[data-graph-resize]').dblclick();
  await expect.poll(async () => Math.abs((await edge()) - start)).toBeLessThan(2);
  await expect(bar).toBeVisible();
});

test('Only matches narrows the graph to the matching commits and brings the full graph back on the same commit', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const toggle = page.getByRole('button', { name: '仅显示匹配的提交' });
  await expect(toggle).toHaveCount(0);
  const search = page.getByPlaceholder('搜索提交…');
  await search.fill('merge');
  await expect(page.getByLabel(/^第 1 个匹配，共 \d+/)).toBeVisible();
  const total = Number((await page.getByLabel(/^第 1 个匹配，共 \d+/).getAttribute('aria-label'))!.match(/共 (\d+)/)![1]);
  const rows = page.locator('[role=table] [role=row]');
  const summaries = () => rows.evaluateAll((all) => all.map((row) => row.textContent ?? ''));
  expect((await summaries()).some((text) => !/merge/i.test(text))).toBe(true);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-matching-count]')).toHaveText(`${total} 个匹配提交`);
  await expect.poll(async () => (await summaries()).every((text) => /merge/i.test(text))).toBe(true);
  await search.press('Enter');
  await search.press('Enter');
  await expect(page.getByLabel(`第 3 个匹配，共 ${total}`)).toBeVisible();
  const selectedHash = async () => ((await page.locator('[role=row][aria-selected=true]').textContent()) ?? '').match(/[0-9a-f]{7}/)?.[0];
  const picked = (await page.locator('[role=row][aria-selected=true]').textContent())!;
  expect(picked).toMatch(/merge/i);
  const pickedHash = await selectedHash();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-matching-count]')).toHaveCount(0);
  await expect.poll(async () => (await summaries()).some((text) => !/merge/i.test(text))).toBe(true);
  await expect.poll(selectedHash).toBe(pickedHash);
  await expect(page.locator('[role=row][aria-selected=true]')).toHaveText(picked);
  await toggle.click();
  await expect.poll(async () => (await summaries()).every((text) => /merge/i.test(text))).toBe(true);
  await search.press('Escape');
  await expect.poll(async () => (await summaries()).some((text) => !/merge/i.test(text))).toBe(true);
});

test('the remote menu and the palette open the repository page in the browser', async ({ page }) => {
  // Popup navigation belongs to the browser context; its first request bypasses page.route.
  await page.context().route('https://github.com/demo/angkorgit', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<title>Repository preview</title>',
  }));
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const sidebar = page.getByRole('complementary', { name: '分支与引用' });
  const remotesHeader = sidebar.getByRole('button', { name: /^远端/ });
  if ((await remotesHeader.getAttribute('aria-expanded')) !== 'true') await remotesHeader.click();
  await sidebar.getByText('origin', { exact: true }).click({ button: 'right' });
  const item = page.getByRole('menuitem', { name: '在浏览器中打开' });
  await expect(item).toBeVisible();
  await expect(item).not.toHaveAttribute('aria-disabled', 'true');
  const [popup] = await Promise.all([page.context().waitForEvent('page'), item.click()]);
  await expect(popup).toHaveURL('https://github.com/demo/angkorgit');
  await expect(popup).toHaveTitle('Repository preview');
  await popup.close();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByPlaceholder('输入命令或分支名…')).toBeVisible();
  await expect(page.getByText('在浏览器中打开仓库', { exact: true })).toBeVisible();
});

test('blame is disabled for a file no commit has seen yet', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const row = page.getByText('Architecture.md', { exact: true }).first();
  await row.click({ button: 'right' });
  const item = page.getByRole('menuitem', { name: /^溯源/ });
  await expect(item).toHaveText(/尚无提交/);
  await expect(item).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await row.click();
  const diff = page.locator('section[aria-label="文件差异：docs/Architecture.md"]');
  await expect(diff).toBeVisible();
  await expect(diff.getByRole('button', { name: '溯源' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByText('ipc.ts', { exact: true }).first().click();
  await expect(page.locator('section[aria-label="文件差异：src/core/ipc.ts"]').getByRole('button', { name: '溯源' })).toBeEnabled();
});

test('the status bar shows the AI connection state once AI is configured and tested', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const chip = page.locator('[data-ai-status]');
  await expect(chip).toHaveAttribute('data-ai-status', 'untested');
  await expect(chip).toHaveText('Ollama');
  await chip.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '测试连接' })).toBeVisible();
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /已安装 AI CLI/ }).click();
  await expect(chip).toHaveAttribute('data-ai-status', 'unconfigured');
  await expect(chip).toHaveText(/设置 AI/);
  await dialog.getByRole('button', { name: /Claude Code/ }).click();
  await expect(chip).toHaveAttribute('data-ai-status', 'untested');
  await expect(chip).toHaveText('Claude Code');
  await dialog.getByRole('button', { name: '测试连接' }).click();
  await expect(dialog.getByText('可访问', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(chip).toHaveAttribute('data-ai-status', 'ok');
  await expect(chip).toHaveText('Claude Code');
  await chip.click();
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Ollama', exact: true }).click();
  await expect(dialog.getByText('自上次测试后设置已更改')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(chip).toHaveAttribute('data-ai-status', 'stale');
  await expect(chip).toHaveText('Ollama');
  await page.reload();
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.locator('[data-ai-status]')).toHaveAttribute('data-ai-status', 'stale', { timeout: 10_000 });
});

test('the checked-out branch chip is filled while other local chips stay tinted', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const headChip = page.getByTitle(/^main · 本地/).first();
  const otherChip = page.getByTitle(/^feature\/diff-viewer · 本地/).first();
  const opacity = (color: string) => Number(color.split(',')[3]?.replace(')', '') ?? '1');
  const headBg = await headChip.evaluate((el) => getComputedStyle(el).backgroundColor);
  const otherBg = await otherChip.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(headBg).not.toBe(otherBg);
  expect(opacity(headBg)).toBe(1);
  expect(opacity(otherBg)).toBeLessThan(1);
});

test('double-clicking a separated origin chip offers to reset the local branch', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByTitle(/origin\/main——双击将 main 重置到此处/).first().dblclick();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('将分支重置到其远端？')).toBeVisible();
  await expect(dialog.getByText(/2 个提交仅存在于本地分支，将被丢弃/)).toBeVisible();
  await expect(dialog.getByText(/硬重置到 origin\/main/)).toBeVisible();
  const box = await dialog.boundingBox();
  const button = await dialog.getByRole('button', { name: '重置分支' }).boundingBox();
  if (!box || !button) throw new Error('dialog geometry missing');
  expect(button.x + button.width).toBeLessThanOrEqual(box.x + box.width + 1);
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toBeHidden();
});

test('the diff header opens the history of the file being viewed', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByText('CommitGraph.tsx').first().click();
  const diff = page.locator('section[aria-label^="文件差异："]');
  await expect(diff).toBeVisible();
  await diff.getByRole('button', { name: '文件历史' }).click();
  await expect(page.locator('section[aria-label*=" 的历史"]')).toBeVisible();
  await expect(page.getByLabel('src/features/graph/CommitGraph.tsx 的历史')).toBeVisible();
  await expect(diff).toBeHidden();
});

test('a single file can be stashed from its row menu and the toolbar pops the latest stash', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  await page.getByText('ipc.ts', { exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: /暂存此文件/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('暂存选中的更改')).toBeVisible();
  await expect(dialog.getByText('ipc.ts', { exact: true })).toBeVisible();
  await expect(dialog.getByText('src/core', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const pop = page.getByRole('button', { name: '弹出最新暂存' });
  await expect(pop).toBeEnabled();
  await pop.hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'WIP on main: experiment with lane colors' })).toBeVisible();
  await pop.click();
  await expect(page.getByText('弹出暂存 完成')).toBeVisible();
});

test('shift-click selects a range of working copy files and the menu acts on all of them', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  await page.getByText('ipc.ts', { exact: true }).first().click();
  await page.getByText('Architecture.md', { exact: true }).first().click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-selected-file-row]')).toHaveCount(3);

  await page.getByText('palette-seed.sql', { exact: true }).first().click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '暂存 3 个文件…' })).toBeVisible();
  await page.getByRole('menuitem', { name: '暂存 3 个文件…', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('暂存选中的更改')).toBeVisible();
  await expect(dialog.getByText('ipc.ts', { exact: true })).toBeVisible();
  await expect(dialog.getByText('palette-seed.sql', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Architecture.md', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('[data-selected-file-row]').getByText('ipc.ts', { exact: true }).click();
  await expect(page.locator('[data-selected-file-row]')).toHaveCount(1);
});

test('the working copy filter narrows both lists and shows counts', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  await expect(page.getByPlaceholder('过滤更改的文件…')).toHaveCount(0);
  await page.getByRole('button', { name: '过滤文件' }).click();
  const filter = page.getByPlaceholder('过滤更改的文件…');
  await expect(filter).toBeFocused();
  await filter.fill('graph');
  await expect(page.getByText('CommitGraph.tsx', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('ipc.ts', { exact: true })).toHaveCount(0);
  const staged = demoStatus.files.filter((file) => file.staged);
  const stagedShown = filterFiles(staged, (file) => file.path, 'graph');
  await expect(page.getByText(/^已暂存/).locator('..')).toContainText(
    `${stagedShown.length} of ${staged.length}`,
  );

  await page.getByRole('button', { name: '清除过滤条件' }).click();
  await expect(filter).toHaveValue('');
  await expect(page.getByText('ipc.ts', { exact: true }).first()).toBeVisible();
  await page.getByRole('row').first().click();
  await expect(filter).toHaveCount(0);
  await page.getByRole('button', { name: '返回工作副本' }).click();
  await expect(page.getByPlaceholder('过滤更改的文件…')).toBeVisible();
  await expect(page.getByPlaceholder('过滤更改的文件…')).not.toBeFocused();
  await page.getByPlaceholder('过滤更改的文件…').press('Escape');
  await expect(page.getByPlaceholder('过滤更改的文件…')).toHaveCount(0);
});

test('the commit file list can be filtered by path', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByText('feat(graph): virtualize commit rows').first().click();

  const inspector = page.getByRole('complementary', { name: '检查器' });
  await expect(inspector.getByText('GraphRow.tsx', { exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: '过滤文件' }).click();
  const filter = inspector.getByPlaceholder('过滤文件…');
  await filter.fill('docs');
  await expect(inspector.getByText('Architecture.md', { exact: true })).toBeVisible();
  await expect(inspector.getByText('GraphRow.tsx', { exact: true })).toHaveCount(0);
  await expect(inspector.getByText('1 of 5')).toBeVisible();

  await filter.press('Escape');
  await expect(filter).toHaveValue('');
  await expect(inspector.getByText('GraphRow.tsx', { exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: '隐藏文件过滤' }).click();
  await expect(inspector.getByPlaceholder('过滤文件…')).toHaveCount(0);
});

test('right-clicking a commit file offers the working copy file actions', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByText('feat(graph): virtualize commit rows').first().click();

  const inspector = page.getByRole('complementary', { name: '检查器' });
  await inspector.getByText('GraphRow.tsx', { exact: true }).click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: '文件历史' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Show in Finder|在文件管理器中显示/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: '复制路径' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: '复制绝对路径' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /将此文件应用到工作副本/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('a stash lists its files and one file can be restored on its own', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText('feat(graph): virtualize commit rows').first()).toBeVisible();
  await page.getByText('WIP on main: experiment with lane colors').first().click();
  const inspector = page.getByRole('complementary', { name: '检查器' });
  await expect(inspector.getByText('这是一个暂存。', { exact: false })).toBeVisible();
  const restore = inspector.getByRole('button', { name: '从暂存中应用 src/features/graph/GraphRow.tsx' });
  await inspector.getByText('GraphRow.tsx', { exact: true }).hover();
  await restore.click();
  await expect(page.getByText('已从暂存中应用 GraphRow.tsx')).toBeVisible();

  await inspector.getByRole('checkbox', { name: '选择 src/features/graph/CommitGraph.tsx 以应用' }).click();
  await inspector.getByText('Architecture.md', { exact: true }).click({ modifiers: ['Shift'] });
  await expect(inspector.getByText('4 of 5 selected')).toBeVisible();
  await inspector.getByRole('button', { name: '应用 4 个文件' }).click();
  await expect(page.getByText('已从暂存中应用 4 个文件')).toBeVisible();
  await expect(inspector.getByText('这是一个暂存。', { exact: false })).toBeVisible();
});

test('staged files can be discarded from the row, the menu and the header', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  const stagedDiscard = page.getByRole('button', { name: '丢弃 src/features/graph/CommitGraph.tsx' });
  await page.getByText('CommitGraph.tsx', { exact: true }).first().hover();
  await stagedDiscard.click({ force: true });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('丢弃更改？')).toBeVisible();
  await expect(dialog.getByText(/将回到最后一次提交/)).toBeVisible();
  await dialog.getByRole('button', { name: '取消' }).click();

  await page.getByText('CommitGraph.tsx', { exact: true }).first().click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /丢弃更改/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '全部丢弃已暂存的更改' }).click();
  const stagedCount = demoStatus.files.filter((file) => file.staged).length;
  await expect(dialog.getByText(`全部丢弃 ${stagedCount} 个已暂存更改？`)).toBeVisible();
  await dialog.getByRole('button', { name: '取消' }).click();
});

test('the sidebar comes back after a relaunch that happened with a diff open', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('complementary', { name: '分支与引用' })).toBeVisible();
  await page.getByText('ipc.ts', { exact: true }).first().click();
  await expect(page.locator('section[aria-label^="文件差异："]')).toBeVisible();
  await expect(page.getByRole('complementary', { name: '分支与引用' })).toBeHidden();
  await page.waitForTimeout(300);

  await page.reload();
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('complementary', { name: '分支与引用' })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('angkorgit-ui') ?? '{}'));
  expect(stored.state?.sidebarOpen).toBe(true);
});

test('a stash shows up in the graph with its own node and a menu to pop it', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const chip = page.getByRole('table', { name: '提交' }).getByTitle(/^WIP on main: experiment with lane colors/);
  await expect(chip).toBeVisible();
  const row = chip.locator('xpath=ancestor::*[@role="row"]');
  await expect(row.getByRole('img', { name: '暂存' })).toBeVisible();
  await row.click({ button: 'right', position: { x: 400, y: 10 } });
  await expect(page.getByRole('menuitem', { name: '应用暂存（保留）' })).toBeVisible();
  await page.keyboard.press('Escape');
  await chip.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '应用暂存（保留）' })).toBeVisible();
  await page.getByRole('menuitem', { name: '弹出暂存' }).click();
  await expect(page.getByText('弹出暂存 已完成')).toBeVisible();
});

test('arrow keys walk from the graph into a commit\u2019s files and back', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const rows = page.getByRole('row');
  await rows.first().click();
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  const secondHash = (await rows.nth(1).locator('button.font-mono').innerText()).trim();
  await expect(page.getByRole('complementary', { name: '检查器' }).getByText(secondHash.slice(0, 7))).toBeVisible();

  await page.keyboard.press('ArrowRight');
  const files = page.getByLabel('提交文件');
  await expect(files).toBeFocused();
  const firstDiff = page.locator('section[aria-label="文件差异：src/features/graph/CommitGraph.tsx"]');
  const secondDiff = page.locator('section[aria-label="文件差异：src/features/graph/GraphRow.tsx"]');
  await expect(firstDiff).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await expect(secondDiff).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(firstDiff).toBeVisible();

  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowRight');
  }
  await expect(firstDiff).toBeVisible();
  await expect(secondDiff).toHaveCount(0);
  await expect(files).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('section[aria-label^="文件差异："]')).toHaveCount(0);
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(rows.nth(1).locator('button.font-mono')).toHaveText(secondHash);
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(2)).toHaveAttribute('aria-selected', 'true');
});

test('settings can install the command line tool', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('最近仓库')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Git', exact: true }).click();
  await expect(dialog.getByText('命令行工具')).toBeVisible();
  await expect(dialog.getByText('angkorgit open [path]')).toBeVisible();
  await expect(dialog.getByText(/angkorgit clone \[-b branch\]/)).toBeVisible();
  await dialog.getByRole('button', { name: '安装', exact: true }).click();
  await expect(dialog.getByText('/usr/local/bin/angkorgit')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '卸载', exact: true })).toBeVisible();
});

test('settings lists detected editors and the toolbar opens in the chosen one', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: '在 Visual Studio Code 中打开' })).toBeVisible();

  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Git', exact: true }).click();
  await expect(dialog.getByText('外部编辑器')).toBeVisible();
  const zed = dialog.getByRole('button', { name: /^Zed/ });
  await expect(zed).toBeVisible();
  await zed.click();
  await expect(zed).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');

  await expect(page.getByRole('button', { name: '在 Zed 中打开' })).toBeVisible();
  await page.getByRole('button', { name: '编辑器选项' }).click();
  await expect(page.getByRole('menuitem', { name: '在 Visual Studio Code 中打开' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '在 Zed 中打开' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('the pull button offers merge and rebase', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '拉取选项' }).click();
  await expect(page.getByRole('menuitem', { name: '拉取（合并）' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '拉取（变基）' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('the status bar says when the repository was last fetched', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-last-fetch]')).toHaveText(/已获取 · 刚刚/);
});

test('auto fetch tries all remotes again after a partial failure', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.locator('[data-last-fetch]')).toHaveText(/已获取 · 刚刚/);
  await page.clock.install();

  await page.evaluate(async () => {
    const [{ ipc }, { useRepo }] = await Promise.all([
      import('/src/core/ipc.ts'),
      import('/src/features/repository/store.ts'),
    ]);
    const tracker = window as unknown as { __autoFetchCalls: string[] };
    tracker.__autoFetchCalls = [];
    ipc.fetch = async (_path, name) => {
      tracker.__autoFetchCalls.push(name);
      if (name === 'upstream') throw new Error('unavailable');
      return { status: 'ok', message: 'Fetched origin' };
    };
    useRepo.setState({
      lastFetchAt: null,
      remotes: [
        { name: 'origin', url: 'git@github.com:demo/angkorgit.git' },
        { name: 'upstream', url: 'git@github.com:demo/upstream.git' },
      ],
    });
  });

  const calls = () => page.evaluate(() => (window as unknown as { __autoFetchCalls: string[] }).__autoFetchCalls);
  await expect.poll(calls).toEqual(['origin', 'upstream']);
  await expect(page.locator('[data-last-fetch]')).toHaveText(/已获取 · 刚刚/);
  await expect(page.locator('[data-fetch-status]')).toHaveText(/获取未完成/);

  await page.clock.runFor(61_000);
  await expect.poll(calls).toEqual(['origin', 'upstream', 'origin', 'upstream']);
});

test('partial fetches keep the timestamp and name failed remotes without raw errors', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.locator('[data-last-fetch]')).toHaveText(/已获取 · 刚刚/);

  await page.evaluate(async () => {
    const [{ ipc }, { useRepo }, { useSettings }] = await Promise.all([
      import('/src/core/ipc.ts'),
      import('/src/features/repository/store.ts'),
      import('/src/features/settings/store.ts'),
    ]);
    useSettings.getState().setAutoFetchMinutes(0);
    ipc.remotes = async () => [
      { name: 'origin', url: 'git@github.com:demo/angkorgit.git' },
      { name: 'upstream', url: 'git@github.com:demo/upstream.git' },
    ];
    ipc.fetch = async (_path, name) => {
      if (name === 'upstream') throw new Error('private token expired');
      return { status: 'ok', message: 'Fetched origin' };
    };
    useRepo.setState({ remotes: await ipc.remotes('') });
  });

  const fetchButton = page.getByRole('button', { name: '获取', exact: true });
  await fetchButton.click();
  await expect(page.locator('[data-last-fetch]')).toHaveText(/已获取 · 刚刚/);
  const incomplete = page.locator('[data-fetch-status]');
  await expect(incomplete).toHaveText(/获取未完成/);
  await expect(incomplete).toHaveClass(/text-faint/);
  await incomplete.hover();
  await expect(page.getByRole('tooltip')).toHaveText('获取失败：upstream');

  await page.evaluate(async () => {
    const { ipc } = await import('/src/core/ipc.ts');
    ipc.fetch = async () => { throw new Error('offline libgit2 detail'); };
  });
  await fetchButton.click();
  await expect(page.locator('[data-last-fetch]')).toBeVisible();
  await incomplete.hover();
  await expect(page.getByRole('tooltip')).toHaveText('获取失败：origin, upstream');

  await page.evaluate(async () => {
    const { useRepo } = await import('/src/features/repository/store.ts');
    useRepo.setState({ lastFetchAt: Date.now() - 2 * 60 * 60_000 });
  });
  await expect(page.locator('[data-last-fetch]')).not.toHaveText(/已获取 · 刚刚/);
  await page.getByRole('button', { name: '拉取', exact: true }).click();
  await expect(page.locator('[data-last-fetch]')).toHaveText(/已获取 · 刚刚/);
  await expect(incomplete).toHaveText(/获取未完成/);

  await page.evaluate(async () => {
    const { ipc } = await import('/src/core/ipc.ts');
    ipc.fetch = async () => ({ status: 'ok', message: 'Fetched' });
  });
  await fetchButton.click();
  await expect(incomplete).toHaveCount(0);

  await page.evaluate(async () => {
    const [{ ipc }, { useRepo }] = await Promise.all([
      import('/src/core/ipc.ts'),
      import('/src/features/repository/store.ts'),
    ]);
    ipc.remotes = async () => [];
    await useRepo.getState().refresh();
  });
  await expect(fetchButton).toBeDisabled();
  await page.mouse.move(0, 0);
  await fetchButton.locator('..').hover();
  await expect(page.getByRole('tooltip')).toHaveText('未配置远端');
});

test('the diff header opens blame inside file history with authors per hunk', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByText('CommitGraph.tsx').first().click();
  await page.locator('section[aria-label^="文件差异："]').getByRole('button', { name: '溯源' }).click();
  const history = page.locator('section[aria-label$="的历史"]');
  await expect(history).toBeVisible();
  await expect(history.getByRole('button', { name: '溯源视图' })).toHaveAttribute('aria-pressed', 'true');
  await expect(history.locator('[data-working-copy-row]')).toHaveClass(/border-l-primary/);
  const pane = history.locator('[data-blame-pane]');
  await expect(pane.locator('[data-blame-line="1"]')).toBeVisible();
  const authors = pane.getByRole('button', { name: /^打开提交 [0-9a-f]+$/ });
  await expect(authors.first()).toBeVisible();
  expect(await authors.count()).toBeGreaterThan(1);
  await expect(pane.getByText('Not committed yet')).toBeVisible();

  await history.locator('li[data-index="0"] [role="button"]').first().click();
  await expect(pane.getByText('Not committed yet')).toHaveCount(0);
  await expect(history.locator('[data-working-copy-row]')).not.toHaveClass(/border-l-primary/);

  await pane.locator('[data-blame-line="1"]').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '在此提交上溯源' })).toBeVisible();
  await page.keyboard.press('Escape');

  await history.getByRole('button', { name: '差异视图' }).click();
  await expect(history.locator('[data-blame-pane]')).toHaveCount(0);
  await expect(history.getByRole('button', { name: '内联 diff' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible();
});

test('the palette offers Blame… and picks a file', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '命令面板' }).click();
  await page.getByPlaceholder('输入命令或分支名…').fill('溯源');
  await page.getByText('溯源…', { exact: true }).click();
  const picker = page.getByPlaceholder('选择要溯源的文件…');
  await expect(picker).toBeVisible();
  await picker.fill('App.tsx');
  await page.getByText('src/app/App.tsx', { exact: true }).click();
  const history = page.locator('section[aria-label="src/app/App.tsx 的历史"]');
  await expect(history).toBeVisible();
  await expect(history.locator('[data-blame-pane] [data-blame-line="1"]')).toBeVisible();
});

test('the remotes section offers Add remote and opens the add dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const remotesSection = page.locator('[data-sidebar-section-header]').filter({
    has: page.getByRole('button', { name: /^远端/ }),
  });
  const addRemote = remotesSection.getByRole('button', { name: '添加远端', exact: true });
  await addRemote.focus();
  await addRemote.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '添加远端' })).toBeVisible();
  await expect(dialog.getByPlaceholder('upstream')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '添加远端', exact: true })).toBeDisabled();
  await dialog.getByPlaceholder('upstream').fill('upstream');
  await dialog.getByPlaceholder('https://github.com/user/repo.git').fill('https://github.com/demo/upstream.git');
  await expect(dialog.getByRole('button', { name: '添加远端', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the terminal focuses on open and reopen and offers its right-click actions', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '切换终端' }).click();
  const host = page.locator('.terminal-host');
  await expect(host).toBeVisible();
  await expect(host.locator('.xterm-helper-textarea')).toBeFocused();
  await page.keyboard.type('first-open');
  await expect(host.locator('.xterm-rows')).toContainText('first-open');
  await page.getByRole('button', { name: '关闭终端' }).click();
  await expect(host).toBeHidden();
  await page.getByRole('button', { name: '切换终端' }).click();
  await expect(host.locator('.xterm-helper-textarea')).toBeFocused();
  await page.keyboard.type('-reopened');
  await expect(host.locator('.xterm-rows')).toContainText('first-open-reopened');
  await host.click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: '复制' })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: '粘贴' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: '全选' })).toBeVisible();
  await menu.getByRole('menuitem', { name: '清空终端' }).click();
  await expect(menu).toBeHidden();
});

test('settings remembers a clone destination and the clone dialog starts there', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('最近仓库')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Git', exact: true }).click();
  await expect(dialog.getByText('克隆目录')).toBeVisible();
  await expect(dialog.getByText(/未设置/)).toBeVisible();
  await page.evaluate(() => {
    window.prompt = () => '/tmp/repos';
  });
  await dialog.getByRole('button', { name: '选择文件夹' }).click();
  await expect(dialog.getByText('/tmp/repos')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByText('克隆仓库', { exact: true }).first().click();
  await expect(page.getByPlaceholder('目标文件夹')).toHaveValue('/tmp/repos');
});

test('a diff selection keeps its lines after scrolling away and back', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await page.getByText('palette-seed.sql').first().click();
  await expect(page.getByText('temple gold').first()).toBeVisible();

  const scroller = page.locator('section[aria-label^="文件差异："] div.overflow-y-auto');
  await scroller.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollTop - 1500);
  });
  const visibleRowIndex = () =>
    scroller.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const rows = [...el.querySelectorAll<HTMLElement>('[data-diff-row]')];
      const visible = rows.find((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top > box.top + 60 && rect.bottom < box.bottom - 120;
      });
      return visible ? Number(visible.dataset.diffRow) : null;
    });
  await expect.poll(visibleRowIndex).not.toBeNull();
  const firstIndex = (await visibleRowIndex()) as number;
  const rowAt = (index: number) => page.locator(`[data-diff-row="${index}"]`);
  const first = await rowAt(firstIndex).boundingBox();
  const last = await rowAt(firstIndex + 3).boundingBox();
  if (!first || !last) throw new Error('diff rows not laid out');
  await page.mouse.move(first.x + 30, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + 220, last.y + last.height / 2, { steps: 6 });
  await page.mouse.up();

  const selectionText = () => page.evaluate(() => window.getSelection()?.toString() ?? '');
  const isRange = () => page.evaluate(() => window.getSelection()?.type === 'Range');
  const before = await selectionText();
  expect(before.split('\n')).toHaveLength(4);
  expect(before).toContain('INSERT INTO palette');

  await page.evaluate(() => {
    (window as unknown as { __copied: string | null }).__copied = null;
    document.addEventListener('copy', (e) => {
      (window as unknown as { __copied: string | null }).__copied =
        e.clipboardData?.getData('text/plain') ?? '';
    });
  });
  const copied = () => page.evaluate(() => (window as unknown as { __copied: string | null }).__copied);
  const resetCopied = () =>
    page.evaluate(() => {
      (window as unknown as { __copied: string | null }).__copied = null;
    });

  const top = await scroller.evaluate((el) => el.scrollTop);
  for (const delta of [-4000, 4000]) {
    await scroller.evaluate((el, value) => {
      el.scrollTop = Math.max(0, el.scrollTop + value);
    }, delta);
    await expect(rowAt(firstIndex)).toHaveCount(0);
    await expect.poll(isRange).toBe(true);
    await resetCopied();
    await page.keyboard.press('ControlOrMeta+c');
    await expect.poll(copied).toBe(before);

    await scroller.evaluate((el, value) => {
      el.scrollTop = value;
    }, top);
    await expect(rowAt(firstIndex)).toHaveCount(1);
    await expect.poll(selectionText).toBe(before);
  }
});

test('the AI button writes a new summary and description while editing an earlier commit message', async ({ page }) => {
  let prompt = '';
  let holdAnswer = true;
  let releaseAnswer: (() => void) | null = null;
  await page.route('**/api/chat', async (route) => {
    prompt = route.request().postData() ?? '';
    if (holdAnswer) await new Promise<void>((resolve) => { releaseAnswer = resolve; });
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ message: { content: 'perf(graph): mount only visible rows\n\nRows outside the viewport stay unmounted.' } }),
    });
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const inspector = page.getByRole('complementary', { name: '检查器' });
  const summary = inspector.getByLabel('提交摘要');

  await page.getByText('feat(graph): virtualize commit rows').first().click();
  await expect(inspector.getByRole('heading', { name: 'feat(graph): virtualize commit rows' })).toBeVisible();
  await inspector.getByRole('button', { name: '编辑提交消息' }).click();
  await inspector.getByRole('button', { name: '用 AI 生成提交消息' }).click();
  await expect(summary).toBeFocused();
  await summary.press('Escape');
  await expect(inspector.getByRole('heading', { name: 'feat(graph): virtualize commit rows' })).toBeVisible();
  releaseAnswer?.();

  holdAnswer = false;
  await inspector.getByRole('button', { name: '编辑提交消息' }).click();
  await inspector.getByRole('button', { name: '用 AI 生成提交消息' }).click();
  await expect(summary).toHaveValue('perf(graph): mount only visible rows');
  await expect(inspector.getByLabel('提交说明')).toHaveValue('Rows outside the viewport stay unmounted.');
  expect(prompt).toContain('+++ ');
  await inspector.getByRole('button', { name: '保存消息' }).click();
  await expect(inspector.getByRole('heading', { name: 'perf(graph): mount only visible rows' })).toBeVisible();
});

test('an unpushed commit message can be edited in place and a pushed one asks before rewriting', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const inspector = page.getByRole('complementary', { name: '检查器' });

  await page.getByText('refactor(core): extract lane allocator').first().click();
  const pushedHeading = inspector.getByRole('heading', { name: 'refactor(core): extract lane allocator' });
  await expect(pushedHeading).toBeVisible();
  await inspector.getByRole('button', { name: '编辑提交消息' }).click();
  await inspector.getByLabel('提交摘要').fill('refactor(core): extract lane allocator, reworded');
  await inspector.getByRole('button', { name: '保存消息' }).click();
  const rewrite = page.getByRole('dialog').filter({ hasText: '重写已推送的提交？' });
  await expect(rewrite).toBeVisible();
  await expect(rewrite.getByText('强制推送')).toBeVisible();
  await rewrite.getByRole('button', { name: '取消' }).click();
  await expect(rewrite).toHaveCount(0);
  await expect(inspector.getByLabel('提交摘要')).toHaveValue('refactor(core): extract lane allocator, reworded');
  await inspector.getByLabel('提交摘要').press('Escape');
  await expect(pushedHeading).toBeVisible();

  await page.getByText('feat(graph): virtualize commit rows').first().click();
  const heading = inspector.getByRole('heading', { name: 'feat(graph): virtualize commit rows' });
  await expect(heading).toBeVisible();
  await expect(inspector.getByRole('button', { name: '编辑提交消息' })).toBeEnabled();

  await heading.dblclick();
  const summary = inspector.getByLabel('提交摘要');
  await expect(summary).toBeFocused();
  await expect(summary).toHaveValue('feat(graph): virtualize commit rows');
  await expect(inspector.getByRole('button', { name: '保存消息' })).toBeDisabled();
  await summary.press('Escape');
  await expect(inspector.getByLabel('提交摘要')).toHaveCount(0);
  await expect(heading).toBeVisible();

  await inspector.getByRole('button', { name: '编辑提交消息' }).click();
  await inspector.getByLabel('提交摘要').fill('feat(graph): virtualize commit rows, faster');
  const description = inspector.getByLabel('提交说明');
  const before = (await description.boundingBox())!.height;
  const handle = inspector.getByRole('separator', { name: '调整描述高度' });
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 90, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await description.boundingBox())!.height).toBeGreaterThan(before + 60);
  await handle.dblclick();
  await expect.poll(async () => (await description.boundingBox())!.height).toBe(before);
  await description.fill('Rows outside the viewport are never mounted.');
  await inspector.getByRole('button', { name: '保存消息' }).click();

  await expect(inspector.getByRole('heading', { name: 'feat(graph): virtualize commit rows, faster' })).toBeVisible();
  await expect(inspector.getByText('Rows outside the viewport are never mounted.')).toBeVisible();
  await expect(page.getByText('feat(graph): virtualize commit rows, faster')).toHaveCount(2);
});

test('the GitHub account form offers fine-grained and classic token pages', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '身份验证', exact: true }).click();
  await dialog.getByRole('button', { name: '添加账户' }).click();
  await expect(dialog.getByPlaceholder('粘贴令牌')).toBeVisible();
  await expect(dialog.getByRole('link', { name: '前往创建' })).toHaveAttribute('href', /settings\/tokens\/new/);
  await expect(dialog.getByRole('link', { name: 'fine-grained token' })).toHaveAttribute(
    'href',
    'https://github.com/settings/personal-access-tokens/new',
  );
  await expect(dialog.getByText(/Contents 与拉取请求读写权限/)).toBeVisible();
  await dialog.getByText('令牌', { exact: true }).click();
  await expect(dialog.getByPlaceholder('粘贴令牌')).toBeFocused();
});

test('the fonts card changes the interface, code and terminal fonts and remembers them', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '切换终端' }).click();
  const rows = page.locator('.terminal-host .xterm-rows');
  await expect(rows).toBeVisible();
  await expect.poll(() => rows.evaluate((el) => getComputedStyle(el).fontSize)).toBe('12px');
  const rootVar = (name: string) =>
    page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v), name);

  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '外观', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '重置字体' })).toHaveCount(0);

  await dialog.getByRole('combobox', { name: '界面字体' }).click();
  await expect(page.getByText('字体', { exact: true }).last()).toBeVisible();
  await page.getByRole('option', { name: 'Helvetica Neue' }).click();
  await expect.poll(() => rootVar('--font-sans')).toContain('Helvetica Neue');

  await dialog.getByRole('combobox', { name: '代码字体' }).click();
  await expect(page.getByText('其他字体', { exact: true })).toBeVisible();
  await page.getByRole('option', { name: 'Fira Code' }).click();
  await expect.poll(() => rootVar('--font-mono')).toContain('Fira Code');
  await expect.poll(() => rows.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Fira Code');
  await expect(dialog.getByRole('combobox', { name: '终端字体', exact: true })).toContainText('Fira Code');

  await dialog.getByRole('combobox', { name: '终端字体', exact: true }).click();
  await page.getByRole('option', { name: 'Menlo' }).click();
  const preview = dialog.locator('[data-terminal-font-preview]');
  await expect.poll(() => preview.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Menlo');
  await dialog.getByRole('combobox', { name: '终端字号' }).click();
  await page.getByRole('option', { name: '16 px' }).click();
  await expect.poll(() => rows.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Menlo');
  await expect.poll(() => rows.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.reload();
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => rootVar('--font-sans')).toContain('Helvetica Neue');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const reopened = page.getByRole('dialog');
  await reopened.getByRole('button', { name: '外观', exact: true }).click();
  await expect(reopened.getByRole('combobox', { name: '终端字体', exact: true })).toContainText('Menlo');
  await reopened.getByRole('button', { name: '重置字体' }).click();
  await expect.poll(() => rootVar('--font-sans')).not.toContain('Helvetica Neue');
  await expect(reopened.getByRole('combobox', { name: '界面字体' })).toContainText('Inter');
  await expect(reopened.getByRole('button', { name: '重置字体' })).toHaveCount(0);
});

test('sidebar section headers carry a gold icon tile and a count badge, with no dividers or fills', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const sections = page.locator('[data-sidebar-section]');
  await expect(sections).toHaveCount(7);
  const borders = await sections.evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopWidth));
  expect(borders).toEqual(borders.map(() => '0px'));
  const transparent = (fill: string) => fill === 'rgba(0, 0, 0, 0)' || fill === 'transparent';
  const fills = await page
    .locator('[data-sidebar-section-header], [data-sidebar-section-body]')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(fills.length).toBeGreaterThan(7);
  expect(fills.every(transparent)).toBe(true);
  const tiles = page.locator('[data-sidebar-section-icon]');
  await expect(tiles).toHaveCount(7);
  const tileFills = await tiles.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(tileFills.some(transparent)).toBe(false);
  const branches = page.locator('[data-sidebar-section-header]').first();
  await expect(branches.getByText('6', { exact: true })).toBeVisible();
  const badgeFill = await branches.getByText('6', { exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(transparent(badgeFill)).toBe(false);
});

test('the commit file list filters by kind of change from the summary tokens', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByText('feat(graph): virtualize commit rows').first().click();
  const inspector = page.getByRole('complementary', { name: '检查器' });
  await expect(inspector.getByText('graphLayout.test.ts')).toBeVisible();
  const all = inspector.getByRole('button', { name: '全部', exact: true });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await inspector.getByRole('button', { name: '1 新增' }).click();
  await expect(inspector.getByText('graphLayout.test.ts')).toBeVisible();
  await expect(inspector.getByText('Architecture.md')).toBeHidden();
  await expect(inspector.getByText('1 of 5')).toBeVisible();
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await all.click();
  await expect(inspector.getByText('Architecture.md')).toBeVisible();
  await expect(inspector.getByText('1 of 5')).toBeHidden();
});

test('the All files view lists every file at a commit and opens an unchanged one read-only', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByText('feat(graph): virtualize commit rows').first().click();
  const inspector = page.getByRole('complementary', { name: '检查器' });
  await expect(inspector.getByText('graphLayout.test.ts')).toBeVisible();
  await expect(inspector.getByText('Roadmap.md')).toHaveCount(0);

  await page.getByRole('button', { name: '全部文件', exact: true }).click();
  await expect(inspector.getByText('5 changed')).toBeVisible();
  await expect(inspector.getByText('Roadmap.md')).toBeVisible();
  await expect(inspector.getByText('Architecture.md')).toBeVisible();
  await expect(inspector.getByText('DiffPanel.tsx')).toBeHidden();
  await inspector.getByRole('button', { name: /^diff/ }).click();
  await expect(inspector.getByText('DiffPanel.tsx')).toBeVisible();

  await inspector.getByText('Roadmap.md').click();
  const diff = page.locator('section[aria-label="文件差异：docs/Roadmap.md"]');
  await expect(diff).toBeVisible();
  await expect(diff.getByText('未更改', { exact: true })).toBeVisible();
  await expect(diff.getByText('import { render }')).toBeVisible();
  await expect(diff.getByText(/^@@/)).toHaveCount(0);

  await page.getByRole('button', { name: '文件夹树' }).click();
  await expect(inspector.getByText('Roadmap.md')).toHaveCount(0);
  await expect(inspector.getByText('Architecture.md')).toBeVisible();
});

test('the All files view shows the whole working tree with changed files still actionable', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const inspector = page.getByRole('complementary', { name: '检查器' });
  await expect(inspector.getByText('README.md')).toHaveCount(0);

  await page.getByRole('button', { name: '全部文件', exact: true }).click();
  await expect(inspector.getByText('12 changed')).toBeVisible();
  await expect(inspector.getByText('README.md')).toBeVisible();
  await expect(inspector.getByLabel('暂存 src/core/ipc.ts')).toBeVisible();
  await expect(inspector.getByLabel('取消暂存 src/features/graph/CommitGraph.tsx')).toBeVisible();
  await expect(inspector.getByText('DiffPanel.tsx')).toBeHidden();

  await inspector.getByText('README.md').click();
  const diff = page.locator('section[aria-label="文件差异：README.md"]');
  await expect(diff.getByText('未更改', { exact: true })).toBeVisible();
  await expect(diff.getByRole('button', { name: 'Stage file' })).toHaveCount(0);

  await page.getByRole('button', { name: '扁平文件列表' }).click();
  await expect(inspector.getByText('README.md')).toHaveCount(0);
  await expect(inspector.getByText(/^更改/)).toBeVisible();
});

test('dragging a diff selection past the bottom edge keeps growing it and copies every line', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await page.getByText('palette-seed.sql').first().click();
  await expect(page.getByText('temple gold').first()).toBeVisible();

  const scroller = page.locator('section[aria-label^="文件差异："] div.overflow-y-auto');
  await scroller.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollTop - 1500);
  });
  const box = await scroller.boundingBox();
  if (!box) throw new Error('diff scroller not laid out');
  const findStart = () =>
    scroller.evaluate((el) => {
      const bounds = el.getBoundingClientRect();
      const rows = [...el.querySelectorAll<HTMLElement>('[data-diff-row]')];
      const row = rows.find((r) => {
        const rect = r.getBoundingClientRect();
        return rect.top > bounds.top + 40 && rect.bottom < bounds.bottom - 140;
      });
      if (!row) return null;
      const rect = row.getBoundingClientRect();
      return { text: row.textContent ?? '', x: rect.left + 30, y: rect.top + rect.height / 2 };
    });
  await expect.poll(findStart).not.toBeNull();
  const start = await findStart();
  if (!start) throw new Error('no diff row to start from');

  const below = { x: start.x + 200, y: box.y + box.height + 30 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(below.x, below.y, { steps: 8 });
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(100);
    await page.mouse.move(below.x + (i % 2), below.y + (i % 2));
  }
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => window.getSelection()?.type)).toBe('Range');
  await page.evaluate(() => {
    (window as unknown as { __copied: string | null }).__copied = null;
    document.addEventListener('copy', (e) => {
      (window as unknown as { __copied: string | null }).__copied = e.clipboardData?.getData('text/plain') ?? '';
    });
  });
  const copied = () => page.evaluate(() => (window as unknown as { __copied: string | null }).__copied);
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(copied).not.toBeNull();
  const selected = (await copied()) as string;
  const lines = selected.split('\n');
  expect(lines.length).toBeGreaterThanOrEqual(6);
  expect(start.text.endsWith(lines[0])).toBe(true);

  await scroller.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollTop - 4000);
  });
  await expect.poll(() => page.evaluate(() => window.getSelection()?.type)).toBe('Range');
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(copied).toBe(selected);
});

test('the diff header reviews and explains a single file with AI', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const chip = page.locator('[data-ai-status]');
  await chip.click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /已安装 AI CLI/ }).click();
  await settings.getByRole('button', { name: /Claude Code/ }).click();
  await expect(chip).toHaveText('Claude Code');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  await page.getByText('ipc.ts', { exact: true }).first().click();
  const diff = page.locator('section[aria-label="文件差异：src/core/ipc.ts"]');
  await expect(diff).toBeVisible();
  const aiButton = diff.getByRole('button', { name: 'AI 操作' });
  await expect(aiButton).toBeEnabled();
  await aiButton.click();
  await page.getByRole('menuitem', { name: '审查更改' }).click();
  const panel = diff.locator('[data-ai-result-panel]');
  await expect(panel).toHaveAttribute('data-ai-result-panel', 'busy');
  await expect(panel).toContainText('AI 审查');
  await expect(aiButton).toBeDisabled();
  await expect(panel).toHaveAttribute('data-ai-result-panel', 'done', { timeout: 10_000 });
  await expect(panel).toContainText('demo response');
  await expect(aiButton).toBeEnabled();

  await expect(diff.getByRole('button', { name: '复制 AI 审查' })).toBeVisible();
  await diff.getByRole('button', { name: '折叠 AI 审查' }).click();
  await expect(panel).toHaveAttribute('data-ai-folded', 'true');
  await expect(panel.locator('[data-ai-body]')).toHaveCount(0);
  await diff.getByRole('button', { name: '显示 AI 审查' }).click();
  await expect(panel.locator('[data-ai-body]')).toContainText('demo response');
  await diff.getByRole('button', { name: '在完整视图中打开 AI 审查' }).click();
  const fullView = page.getByRole('dialog');
  await expect(fullView).toContainText('demo response');
  await fullView.getByRole('button', { name: '完成' }).click();
  await expect(fullView).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(diff).toBeHidden();
  await page.getByText('ipc.ts', { exact: true }).first().click();
  await expect(diff).toBeVisible();
  await expect(diff.locator('[data-ai-result-panel]')).toHaveCount(0);

  await aiButton.click();
  await page.getByRole('menuitem', { name: '解释更改' }).click();
  await expect(diff.locator('[data-ai-result-panel]')).toContainText('AI 解释');
  await expect(diff.locator('[data-ai-result-panel]')).toHaveAttribute('data-ai-result-panel', 'done', { timeout: 10_000 });
  await diff.getByRole('button', { name: '关闭 AI 解释' }).click();
  await expect(diff.locator('[data-ai-result-panel]')).toHaveCount(0);
});

test('a commit can be reviewed with AI from the inspector', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const chip = page.locator('[data-ai-status]');
  await chip.click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /已安装 AI CLI/ }).click();
  await settings.getByRole('button', { name: /Claude Code/ }).click();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  await page.getByText('feat(graph): virtualize commit rows').first().click();
  const inspector = page.locator('[aria-label="提交文件"]').locator('..');
  await expect(page.getByRole('button', { name: '用 AI 审查' })).toBeVisible();
  await page.getByRole('button', { name: '用 AI 审查' }).click();
  await expect(page.getByRole('button', { name: '停止审查' })).toBeVisible();
  const panel = inspector.locator('[data-ai-result-panel]');
  await expect(panel).toContainText('AI 审查');
  await expect(panel).toHaveAttribute('data-ai-result-panel', 'done', { timeout: 10_000 });
  await expect(panel).toContainText('demo response');
  await expect(page.getByRole('button', { name: '用 AI 审查' })).toBeVisible();
  await page.getByRole('button', { name: '关闭 AI 审查' }).click();
  await expect(panel).toHaveCount(0);
});

test('file history jumps between changes with N and P like the diff view', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('angkorgit-settings', JSON.stringify({ state: { reduceMotion: true }, version: 0 }));
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByText('palette-seed.sql').first().click();
  await page.locator('section[aria-label^="文件差异："]').getByRole('button', { name: '文件历史' }).click();
  const history = page.locator('section[aria-label="src/data/palette-seed.sql 的历史"]');
  await expect(history).toBeVisible();
  await expect(history.getByRole('button', { name: '下一个更改' })).toHaveCount(0);

  await history.locator('[data-working-copy-row]').click();
  await expect(history.getByRole('button', { name: '下一个更改' })).toBeVisible();
  await expect(history.getByText('1 处改动', { exact: true })).toBeVisible();
  const scroller = history.locator('[data-history-diff-scroller]');
  const scrollTop = () => scroller.evaluate((el) => el.scrollTop);
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight * 3)).toBe(true);
  expect(await scrollTop()).toBe(0);

  await page.keyboard.press('n');
  await expect.poll(scrollTop).toBeGreaterThan(1000);
  const atChange = await scrollTop();

  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect.poll(scrollTop).toBe(0);
  await page.keyboard.press('p');
  await expect.poll(scrollTop).toBe(atChange);

  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect.poll(scrollTop).toBe(0);
  await history.getByRole('button', { name: '下一个更改' }).click();
  await expect.poll(scrollTop).toBe(atChange);
});

test('ignore whitespace hides an indent-only change and turns staging off', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByText('indent.txt', { exact: true }).first().click();
  const diff = page.locator('section[aria-label="文件差异：src/indent.txt"]');
  await expect(diff).toBeVisible();
  await expect(diff.getByText('+1', { exact: true })).toBeVisible();
  await expect(diff.getByRole('button', { name: '暂存代码块' })).toBeVisible();

  await diff.getByRole('button', { name: '视图选项' }).click();
  await page.getByRole('menuitemcheckbox', { name: '忽略空白字符' }).click();
  await expect(diff.getByText('+0', { exact: true })).toBeVisible();
  await expect(diff.getByText('仅发现空白字符更改')).toBeVisible();
  await expect(diff.getByRole('button', { name: '暂存代码块' })).toHaveCount(0);
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menu').getByText('不是 Git 会实际应用的补丁')).toBeVisible();
  await expect(page.getByRole('menuitemcheckbox', { name: '词级 diff' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemcheckbox', { name: '词级 diff' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: '词级 diff' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menuitemcheckbox', { name: '词级 diff' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: '词级 diff' })).toHaveAttribute('aria-checked', 'true');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByText('ipc.ts', { exact: true }).first().click();
  const token = page.locator('section[aria-label="文件差异：src/core/ipc.ts"]');
  await expect(token.getByText('+22', { exact: true })).toBeVisible();
  await expect(token.getByRole('button', { name: '暂存代码块' })).toHaveCount(0);
});

test('tabs switch with mod+digit and a custom chord assigned from the tab menu', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('option', { name: 'temple-ui' }).click();
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('ControlOrMeta+1');
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ControlOrMeta+Shift+BracketRight');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ControlOrMeta+Shift+BracketRight');
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');

  await tabs.nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '键盘快捷键…' }).click();
  const capture = page.getByRole('textbox', { name: '快捷键' });
  await expect(capture).toBeFocused();
  const save = page.getByRole('button', { name: '保存' });
  await page.keyboard.press('t');
  await expect(capture).toHaveAttribute('data-shortcut-problem', 'no_modifier');
  await expect(save).toBeDisabled();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(capture).toHaveAttribute('data-shortcut-problem', 'reserved');
  await expect(page.locator('[cmdk-input]')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+t');
  await expect(capture).not.toHaveAttribute('data-shortcut-problem');
  await save.click();
  await expect(tabs.nth(1).locator('[data-tab-shortcut]')).toHaveText(/^(⌃⇧T|Ctrl\+Shift\+T)$/);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Control+Shift+t');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ControlOrMeta+w');
  await expect(tabs).toHaveCount(1);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('option', { name: 'temple-ui' }).click();
  await expect(tabs).toHaveCount(2);

  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '快捷键', exact: true }).click();
  await expect(dialog.locator('[data-repo-shortcuts]')).toContainText('temple-ui');
  await dialog.getByRole('button', { name: '移除 temple-ui 的快捷键' }).click();
  await expect(dialog.getByText('暂无仓库快捷键')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tabs.nth(1).locator('[data-tab-shortcut]')).toHaveCount(0);
});

test('force push from the push menu asks first', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '推送选项' }).click();
  await page.getByRole('menuitem', { name: '强制推送' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: '强制推送？' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/origin\/main 将被本地的/)).toBeVisible();
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Push (force) done')).toHaveCount(0);
});

test('dragging a diff selection past the right edge pans the long lines and extends the selection', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await page.getByText('palette-seed.sql').first().click();
  await expect(page.getByText('temple gold').first()).toBeVisible();
  const diff = page.locator('section[aria-label^="文件差异："]');
  await diff.getByRole('button', { name: '内联 diff', exact: true }).click();
  const pane = diff.locator('[data-diff-pane]').first();
  const layer = pane.locator('[data-diff-layer]');
  await expect(layer).toHaveAttribute('style', /translateX\(0px\)|translateX\(-0px\)/);
  const paneBox = (await pane.boundingBox())!;
  const scroller = diff.locator('div.overflow-y-auto');
  const start = await scroller.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-diff-row]')).filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.top > box.top + 40 && rect.bottom < box.bottom - 40 && (row.textContent ?? '').length > 60;
    });
    const row = rows[0];
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    return { x: rect.left + 20, y: rect.top + rect.height / 2 };
  });
  if (!start) throw new Error('no diff row to start from');

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y, { steps: 4 });
  await page.mouse.move(paneBox.x + paneBox.width + 60, start.y, { steps: 4 });
  await expect
    .poll(() => layer.evaluate((el) => Math.abs(parseFloat(/translateX\((-?[\d.]+)px\)/.exec((el as HTMLElement).style.transform)?.[1] ?? '0'))))
    .toBeGreaterThan(60);
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(selected.length).toBeGreaterThan(40);
  await page.mouse.move(start.x + 100, start.y, { steps: 2 });
  const panned = await layer.evaluate((el) => Math.abs(parseFloat(/translateX\((-?[\d.]+)px\)/.exec((el as HTMLElement).style.transform)?.[1] ?? '0')));
  await page.waitForTimeout(120);
  expect(await layer.evaluate((el) => Math.abs(parseFloat(/translateX\((-?[\d.]+)px\)/.exec((el as HTMLElement).style.transform)?.[1] ?? '0')))).toBe(panned);
  await page.mouse.up();
  expect(await diff.getByLabel('水平滚动差异').evaluate((el) => el.scrollLeft)).toBeGreaterThan(50);
});

test('long diff lines have a sticky horizontal scrollbar and support Shift+wheel', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await page.getByText('palette-seed.sql').first().click();
  await expect(page.getByText('temple gold').first()).toBeVisible();
  const diff = page.locator('section[aria-label^="文件差异："]');
  const scrollbar = diff.getByLabel('水平滚动差异');
  const scroller = diff.locator('div.overflow-y-auto');

  for (const view of ['内联 diff', '并排 diff']) {
    await diff.getByRole('button', { name: view, exact: true }).click();
    await expect(scrollbar).toBeVisible();
    expect(await scrollbar.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(100);
    const viewport = await scroller.boundingBox();
    const bar = await scrollbar.boundingBox();
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1);
    expect(bar!.y).toBeGreaterThan(viewport!.y + viewport!.height - 20);

    await scrollbar.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => scrollbar.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    const offset = await scrollbar.evaluate((el) => el.scrollLeft);
    const vertical = await scroller.evaluate((el) => el.scrollTop);
    await diff.locator('[data-diff-pane]').first().evaluate((el) => {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: 160, shiftKey: true, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => scrollbar.evaluate((el) => el.scrollLeft)).toBeGreaterThan(offset);
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(vertical);
    const transforms = await diff.locator('[data-diff-layer]').evaluateAll((els) => els.map((el) => (el as HTMLElement).style.transform));
    expect(new Set(transforms).size).toBe(1);
    expect(transforms[0]).toMatch(/translateX\(-/);

    await scroller.evaluate((el) => { el.scrollTop = 0; });
    await expect(scrollbar).toBeVisible();
    const topBar = await scrollbar.boundingBox();
    expect(topBar!.y).toBeGreaterThan(viewport!.y + viewport!.height - 20);
  }

  await diff.getByRole('button', { name: '视图选项', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: '自动换行' }).click();
  await expect(scrollbar).toHaveCount(0);
});

test('a trackpad pan moves the long-line diff by the whole gesture without stepping back', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await page.getByText('palette-seed.sql').first().click();
  await expect(page.getByText('temple gold').first()).toBeVisible();
  const diff = page.locator('section[aria-label^="文件差异："]');
  await diff.getByRole('button', { name: '内联 diff', exact: true }).click();
  await expect(diff.getByLabel('水平滚动差异')).toBeVisible();

  const steps = await diff.locator('[data-diff-pane]').first().evaluate(async (pane) => {
    const layer = pane.querySelector('[data-diff-layer]') as HTMLElement;
    const read = () => Math.abs(parseFloat(/translateX\((-?[\d.]+)px\)/.exec(layer.style.transform)?.[1] ?? '0'));
    const positions: number[] = [];
    for (let i = 0; i < 30; i++) {
      pane.dispatchEvent(new WheelEvent('wheel', { deltaX: 2.4, deltaY: 0.3, bubbles: true, cancelable: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      positions.push(read());
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    positions.push(read());
    return positions.map((value, index) => value - (positions[index - 1] ?? 0));
  });
  expect(steps.filter((step) => step < 0)).toEqual([]);
  expect(steps.reduce((sum, step) => sum + step, 0)).toBeCloseTo(72, 0);
  const engine = diff.getByLabel('水平滚动差异');
  await expect.poll(() => engine.evaluate((el) => el.scrollLeft)).toBeGreaterThan(70);

  const bar = diff.locator('[data-diff-scrollbar]');
  const thumb = diff.locator('[data-diff-scrollbar-thumb]');
  await expect(thumb).toBeVisible();
  const before = await thumb.boundingBox();
  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
  await page.mouse.down();
  await page.mouse.move(before!.x + before!.width / 2 + 60, before!.y + before!.height / 2, { steps: 6 });
  await page.mouse.up();
  const dragged = await engine.evaluate((el) => el.scrollLeft);
  expect(dragged).toBeGreaterThan(80);
  expect((await thumb.boundingBox())!.x).toBeGreaterThan(before!.x + 20);
  await expect.poll(() => diff.locator('[data-diff-layer]').first().evaluate((el) => (el as HTMLElement).style.transform)).toBe(`translateX(-${dragged}px)`);

  await expect(bar).toBeVisible();
  const moved = await thumb.boundingBox();
  await page.mouse.click(moved!.x - 8, moved!.y + moved!.height / 2);
  await expect.poll(() => engine.evaluate((el) => el.scrollLeft)).toBe(0);
  await expect.poll(() => diff.locator('[data-diff-layer]').first().evaluate((el) => (el as HTMLElement).style.transform)).toBe('translateX(0px)');
});

test('the code diff opened from a selected commit scrolls horizontally in both views', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await page.getByText('feat(graph): virtualize commit rows').first().click();
  const inspector = page.getByRole('complementary', { name: '检查器' });
  await inspector.getByText('CommitGraph.tsx', { exact: true }).click();
  const diff = page.locator('section[aria-label="文件差异：src/features/graph/CommitGraph.tsx"]');
  await expect(inspector.getByRole('heading', { name: 'feat(graph): virtualize commit rows', exact: true })).toBeVisible();
  await expect(diff.getByRole('button', { name: '暂存文件', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 800, height: 900 });
  const scrollbar = diff.getByLabel('水平滚动差异');

  for (const view of ['内联 diff', '并排 diff']) {
    await diff.getByRole('button', { name: view, exact: true }).click();
    await expect(scrollbar).toBeVisible();
    expect(await scrollbar.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(100);
    await scrollbar.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => scrollbar.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    const offset = await scrollbar.evaluate((el) => el.scrollLeft);
    await diff.locator('[data-diff-pane]').first().evaluate((el) => {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: 160, shiftKey: true, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => scrollbar.evaluate((el) => el.scrollLeft)).toBeGreaterThan(offset);
    const transforms = await diff.locator('[data-diff-layer]').evaluateAll((els) => els.map((el) => (el as HTMLElement).style.transform));
    expect(new Set(transforms).size).toBe(1);
    expect(transforms[0]).toMatch(/translateX\(-/);
  }
});

test('repositories can be grouped on the welcome page and a group opens as tabs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('最近仓库')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-group-header]')).toHaveCount(0);

  const temple = page.locator('[data-recent-row="/Users/demo/projects/temple-ui"]');
  await temple.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '添加到分组' }).hover();
  await page.getByRole('menuitem', { name: '新建分组…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '新建分组' })).toBeVisible();
  const name = dialog.getByLabel('名称');
  await expect(name).toBeFocused();
  const create = dialog.getByRole('button', { name: '创建分组' });
  await expect(create).toBeDisabled();
  await name.fill('前端');
  await dialog.getByRole('radio', { name: '蓝绿' }).click();
  await create.click();
  await expect(dialog).toBeHidden();

  const frontend = page.locator('[data-group-header]', { hasText: '前端' });
  await expect(frontend).toBeVisible();
  await expect(frontend.getByText('1', { exact: true })).toBeVisible();
  await frontend.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '全部获取', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '全部获取 — 前端' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '完成', exact: true })).toBeEnabled();
  await expect(dialog.locator('[data-group-update-results]')).toContainText('temple-ui');
  await expect(dialog).toContainText('0 个已跳过 · 0 个失败');
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  await frontend.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '全部拉取（仅限快进）', exact: true }).locator('svg')).toHaveClass(/lucide-arrow-down-to-line/);
  await page.getByRole('menuitem', { name: '全部拉取（仅限快进）', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '全部拉取（仅限快进） — 前端' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '完成', exact: true })).toBeEnabled();
  await expect(dialog).toContainText('已是最新');
  await dialog.getByRole('button', { name: '完成', exact: true }).click();

  const other = page.locator('[data-group-header]', { hasText: '其他' });
  await expect(other.getByText('3', { exact: true })).toBeVisible();

  const angkor = page.locator('[data-recent-row="/Users/demo/projects/angkorgit"]');
  await angkor.dragTo(frontend);
  await expect(frontend.getByText('2', { exact: true })).toBeVisible();
  await expect(other.getByText('2', { exact: true })).toBeVisible();

  const billing = page.locator('[data-recent-row="/Users/demo/work/billing-service"]');
  await billing.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '添加到分组' }).hover();
  await page.getByRole('menuitem', { name: '新建分组…' }).click();
  await dialog.getByLabel('名称').fill('前端');
  await expect(dialog.getByText('已存在同名分组')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '创建分组' })).toBeDisabled();
  await dialog.getByLabel('名称').fill('后端');
  await dialog.getByLabel('名称').press('Enter');
  await expect(dialog).toBeHidden();
  const backend = page.locator('[data-group-header]', { hasText: '后端' });
  await expect(backend.getByText('1', { exact: true })).toBeVisible();
  const headers = page.locator('[data-group-header]');
  await expect(headers.nth(0)).toContainText('前端');
  await backend.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '下移' })).toBeDisabled();
  await page.getByRole('menuitem', { name: '上移' }).click();
  await expect(headers.nth(0)).toContainText('后端');
  await backend.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '上移' })).toBeDisabled();
  await page.getByRole('menuitem', { name: '下移' }).click();
  await expect(headers.nth(0)).toContainText('前端');
  await backend.dragTo(frontend, { targetPosition: { x: 200, y: 3 } });
  await expect(headers.nth(0)).toContainText('后端');
  await frontend.dragTo(backend, { targetPosition: { x: 200, y: 3 } });
  await expect(headers.nth(0)).toContainText('前端');

  await backend.getByRole('button', { name: '后端', exact: true }).click();
  await expect(billing).toBeHidden();
  await backend.getByRole('button', { name: '后端', exact: true }).click();
  await expect(billing).toBeVisible();

  await page.getByLabel('搜索最近仓库').fill('前');
  await expect(page.locator('[data-group-header]')).toHaveCount(0);
  await expect(page.locator('[data-recent-row]')).toHaveCount(2);
  await page.getByLabel('搜索最近仓库').fill('');
  await expect(page.locator('[data-group-header]')).toHaveCount(3);

  await frontend.hover();
  await frontend.getByRole('button', { name: '前端 分组操作' }).click();
  await page.getByRole('menuitem', { name: '在标签页中全部打开' }).click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(0)).toHaveAttribute('title', /· 前端/);

  await tabs.nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '移动到分组' }).hover();
  await page.getByRole('menuitem', { name: '后端' }).click();
  await expect(tabs.nth(1)).toHaveAttribute('title', /· 后端/);
  const clusters = page.locator('[data-tab-cluster]');
  await expect(clusters).toHaveCount(2);
  await expect(clusters.nth(0)).toContainText('angkorgit');
  await expect(clusters.nth(1)).toContainText('temple-ui');
  const frontendChip = clusters.nth(0).locator('[data-tab-group]');
  const backendChip = clusters.nth(1).locator('[data-tab-group]');
  await expect(frontendChip).toHaveText('前端');
  await backendChip.click();
  await expect(tabs).toHaveCount(1);
  await expect(backendChip).toHaveText('后端1');
  await frontendChip.click();
  await expect(tabs).toHaveCount(1);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ControlOrMeta+2');
  await expect(page.locator('[data-tab-path="/Users/demo/projects/temple-ui"]')).toHaveAttribute('aria-selected', 'true');
  await expect(tabs).toHaveCount(1);
  await frontendChip.click();
  await backendChip.click();
  await expect(tabs).toHaveCount(2);
  await expect(page.locator('[data-tab-separator]')).toHaveCount(0);
  await expect(page.locator('[data-tab-overflow]')).toHaveCount(0);
  await backendChip.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '关闭其标签页' })).toContainText('1');
  await page.getByRole('menuitem', { name: '折叠其他分组' }).click();
  await expect(frontendChip).toHaveText('前端1');
  await expect(tabs).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+1');
  await expect(page.locator('[data-tab-path="/Users/demo/projects/angkorgit"]')).toHaveAttribute('aria-selected', 'true');
  // The active tab in the collapsed group and the expanded backend tab both remain visible.
  await expect(tabs).toHaveCount(2);
  await expect(page.locator('[data-tab-path="/Users/demo/projects/temple-ui"]')).toBeVisible();
  await frontendChip.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '展开所有分组' }).click();
  await expect(tabs).toHaveCount(2);
  await backendChip.dragTo(clusters.nth(0), { targetPosition: { x: 4, y: 20 } });
  await expect(clusters.nth(0)).toContainText('后端');
  await expect(clusters.nth(1)).toContainText('前端');
  await expect(tabs.nth(0)).toHaveAttribute('title', /temple-ui/);
  await page.keyboard.press('ControlOrMeta+1');
  await expect(page.locator('[data-tab-path="/Users/demo/projects/temple-ui"]')).toHaveAttribute('aria-selected', 'true');
  await page.locator('[data-tab-cluster]').nth(1).locator('[data-tab-group]').dragTo(clusters.nth(0), { targetPosition: { x: 4, y: 20 } });
  await expect(clusters.nth(0)).toContainText('前端');
  await page.keyboard.press('ControlOrMeta+1');
  await expect(page.locator('[data-tab-path="/Users/demo/projects/angkorgit"]')).toHaveAttribute('aria-selected', 'true');
  await page.setViewportSize({ width: 300, height: 900 });
  const overflow = page.locator('[data-tab-overflow]');
  await expect(overflow).toBeVisible();
  await overflow.click();
  const overflowMenu = page.getByRole('menu');
  await expect(overflowMenu.getByText('前端', { exact: true })).toBeVisible();
  await overflowMenu.getByRole('menuitem', { name: 'temple-ui' }).click();
  await expect(page.locator('[data-tab-path="/Users/demo/projects/temple-ui"]')).toHaveAttribute('aria-selected', 'true');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(overflow).toHaveCount(0);

  await page.getByRole('button', { name: '切换仓库' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.locator('[data-switcher-group="前端"]')).toContainText('angkorgit');
  await expect(menu.locator('[data-switcher-group="后端"]')).toContainText('temple-ui');
  await expect(menu.locator('[data-switcher-group="其他"]')).toContainText('api-gateway');
  await page.keyboard.press('Escape');

  await page.keyboard.press('ControlOrMeta+k');
  await page.locator('[cmdk-input]').fill('后端');
  await expect(page.getByRole('option', { name: /打开 后端 中的全部仓库/ })).toContainText('2 个仓库');
  await page.getByRole('option', { name: /关闭 后端 中的全部仓库/ }).click();
  await expect(tabs).toHaveCount(1);
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible();

  await page.getByRole('button', { name: '首页', exact: true }).click();
  await expect(page.getByText('最近仓库')).toBeVisible();
  await frontend.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '解散分组…' }).click();
  await expect(page.getByRole('heading', { name: '解散分组“前端”？' })).toBeVisible();
  await page.getByRole('button', { name: '解散分组', exact: true }).click();
  await expect(frontend).toBeHidden();
  await expect(page.locator('[data-recent-row="/Users/demo/projects/angkorgit"]')).toBeVisible();
  await expect(backend.getByText('2', { exact: true })).toBeVisible();
});

test('settings filters cards, lands on the first hit and clears before closing', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('ControlOrMeta+,');
  const dialog = page.getByRole('dialog');
  const filter = dialog.getByRole('textbox', { name: '过滤设置', exact: true });
  await expect(filter).toBeFocused();
  await expect(filter).toHaveAttribute('spellcheck', 'false');
  await filter.fill('ssh agent');
  await expect(dialog.locator('[data-settings-card]')).toHaveCount(1);
  await expect(dialog.getByRole('heading', { name: 'SSH', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '外观', exact: true })).toBeHidden();
  await filter.press('Enter');
  await expect(dialog.locator('[data-settings-card="ssh"]')).toHaveClass(/animate-locate/);
  await expect(dialog.locator('[data-settings-card="ssh"]')).not.toHaveClass(/animate-locate/);
  await filter.press('Enter');
  await expect(dialog.locator('[data-settings-card="ssh"]')).toHaveClass(/animate-locate/);
  await filter.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(filter).toHaveValue('');
  await filter.fill('cli');
  await dialog.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '提供方', exact: true })).toBeVisible();
  await filter.press('Enter');
  await expect(dialog.locator('[data-settings-card="cli"]')).toHaveClass(/animate-locate/);
  await filter.fill('profiles');
  await dialog.getByRole('button', { name: '新建配置', exact: true }).click();
  const profileLabel = dialog.getByPlaceholder('工作', { exact: true });
  await profileLabel.fill('Draft profile');
  await profileLabel.press('Escape');
  await expect(filter).toHaveValue('');
  await expect(profileLabel).toBeFocused();
  await expect(profileLabel).toHaveValue('Draft profile');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await filter.fill('authentication');
  await expect(dialog.locator('[data-settings-card]')).toHaveCount(3);
  await dialog.getByRole('button', { name: '身份验证', exact: true }).click();
  await dialog.getByRole('button', { name: '添加账户', exact: true }).click();
  const token = dialog.getByPlaceholder('粘贴令牌');
  await token.fill('draft-token');
  await token.press('Escape');
  await expect(filter).toHaveValue('');
  await expect(token).toBeFocused();
  await expect(token).toHaveValue('draft-token');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await filter.fill('no-such-setting');
  await expect(dialog.getByText('没有匹配的设置', { exact: true })).toBeVisible();
  await expect(dialog.locator('[data-settings-card]')).toHaveCount(0);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+,');
  await expect(filter).toBeFocused();
  await expect(filter).toHaveValue('');
  await filter.press('Escape');
  await expect(dialog).toBeHidden();
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByPlaceholder('输入命令或分支名…').fill('设置');
  await page.getByRole('option', { name: /^设置/ }).click();
  await expect(filter).toBeFocused();
  await filter.press('Escape');
  await page.locator('[data-ai-status]').click();
  await expect(dialog.getByRole('heading', { name: 'AI 助手', exact: true })).toBeVisible();
  await expect(filter).toBeFocused();
});

test('folder rows in the working copy tree stage and unstage everything inside them', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    const { ipc } = await import('/src/core/ipc.ts');
    const calls = ((window as unknown as { __stageCalls: unknown[] }).__stageCalls = [] as unknown[]);
    ipc.stageFiles = async (_path, files) => void calls.push(['stage', files]);
    ipc.unstageFiles = async (_path, files) => void calls.push(['unstage', files]);
  });
  await page.getByRole('button', { name: '文件夹树' }).click();
  const srcFolder = page.locator('[data-tree-folder="src"]').first();
  await expect(srcFolder).toBeVisible();
  const folderCheckbox = (label: string, path: string) =>
    page.getByRole('checkbox', { name: `${label} ${path}`, exact: true });
  const stageSrc = folderCheckbox('暂存以下路径中的所有更改', 'src');
  await expect(stageSrc).toHaveAttribute('data-state', 'unchecked');
  await stageSrc.click();
  await expect(srcFolder).toBeVisible();
  const unstageSrc = folderCheckbox('取消暂存以下路径中的所有更改', 'src/features/graph');
  await expect(unstageSrc).toHaveAttribute('data-state', 'checked');
  await unstageSrc.click();
  const calls = await page.evaluate(() => (window as unknown as { __stageCalls: unknown[] }).__stageCalls);
  expect(calls).toEqual([
    ['stage', ['src/indent.txt', 'src/core/ipc.ts', 'src/data/palette-seed.sql', 'src/features/repository/components/working-copy/deeply/nested/WorkingCopyFileListItemContainerFactory.tsx']],
    ['unstage', ['src/features/graph/CommitGraph.tsx']],
  ]);
  await srcFolder.getByRole('button', { name: /^折叠 / }).click();
  await expect(page.getByText('ipc.ts', { exact: true })).toHaveCount(0);
  await srcFolder.getByRole('button', { name: /^展开 / }).click();
  await expect(page.getByText('ipc.ts', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '全部文件', exact: true }).click();
  await expect(
    folderCheckbox('暂存以下路径中的所有更改', 'src'),
  ).toHaveAttribute('data-state', 'indeterminate');
});

test('stepping through changes marks the active one and counts it in the header', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await page.getByText('CommitGraph.tsx', { exact: true }).first().click();
  const diff = page.locator('section[aria-label="文件差异：src/features/graph/CommitGraph.tsx"]');
  await expect(diff).toBeVisible();
  const count = diff.locator('[data-change-count]');
  await expect(count).toHaveText(/^1 \/ \d+ 处改动$/);
  const total = Number((await count.textContent())!.match(/\/ (\d+)/)![1]);
  expect(total).toBeGreaterThan(2);
  const activeRows = () => diff.locator('[data-change-active]');
  await expect(activeRows().first()).toBeVisible();
  const firstTop = await activeRows().first().boundingBox();
  await page.keyboard.press('n');
  await expect(count).toHaveText(`2 / ${total} 处改动`);
  await expect(activeRows().first()).toBeVisible();
  const secondTop = await activeRows().first().boundingBox();
  expect(secondTop!.y).not.toBe(firstTop!.y);
  await diff.getByRole('button', { name: '下一个更改' }).click();
  await expect(count).toHaveText(`3 / ${total} 处改动`);
  await page.keyboard.press('p');
  await expect(count).toHaveText(`2 / ${total} 处改动`);
  await diff.getByRole('button', { name: '并排 diff' }).click();
  await expect(count).toHaveText(/^\d+ 处改动$/);
  await expect(activeRows()).toHaveCount(0);
  await page.keyboard.press('n');
  await expect(count).toHaveText(/^\d+ \/ \d+ 处改动$/);
  await expect(activeRows().first()).toBeVisible();
  await diff.getByRole('button', { name: '视图选项' }).click();
  await page.getByRole('menuitemcheckbox', { name: '自动换行' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('n');
  await expect(count).toHaveText(/^\d+ \/ \d+ 处改动$/);
  await expect(activeRows().first()).toBeVisible();
});


test('group pull summary shows moved refs, skips, failures and unchanged repositories', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('最近仓库')).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    const [{ ipc }, { useSettings }, { useRepo }] = await Promise.all([
      import('/src/core/ipc.ts'), import('/src/features/settings/store.ts'), import('/src/features/repository/store.ts'),
    ]);
    const repos = ['updated', 'skipped', 'failed', 'current'].map((name) => ({ path: `/projects/${name}`, name, lastOpenedAt: 0 }));
    useRepo.setState({ recents: repos });
    useSettings.getState().addRepoGroup('Projects', 0, repos.map((r) => r.path));
    ipc.groupUpdate = async (path, pull) => {
      if (!pull) throw new Error('Expected fast-forward pull');
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (path.endsWith('/failed')) throw { message: 'Authentication failed' };
      if (path.endsWith('/skipped')) return { status: 'skipped', message: 'main has diverged; fast-forward unavailable', changes: [] };
      if (path.endsWith('/current')) return { status: 'up_to_date', message: 'main is already up to date', changes: [] };
      return { status: 'ok', message: 'Fast-forwarded main by 2 commits', changes: [{ name: 'main', oldOid: '1234567890', newOid: 'abcdef0123', commits: 2 }] };
    };
  });
  await page.locator('[data-group-header]', { hasText: 'Projects' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '全部拉取（仅限快进）', exact: true }).locator('svg')).toHaveClass(/lucide-arrow-down-to-line/);
  await page.getByRole('menuitem', { name: '全部拉取（仅限快进）', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '完成', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '完成', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('status')).toContainText('1 个已更新 · 1 已是最新 · 1 个已跳过 · 1 个失败');
  await expect(dialog).toContainText('main: 1234567 → abcdef0（2 个提交）');
  await expect(dialog).toContainText('main has diverged');
  await expect(dialog).toContainText('Authentication failed');
  await expect(dialog).toContainText('main is already up to date');
  await expect(dialog.getByText('已更新', { exact: true })).toHaveClass(/text-success/);
  await expect(dialog.getByText('失败', { exact: true })).toHaveClass(/text-danger/);
  await expect(dialog).toContainText('保留无关的本地更改');
  expect(await dialog.locator('[data-group-update-row]').first().evaluate((row) => getComputedStyle(row).borderTopWidth)).toBe('0px');
  expect(await dialog.getByRole('status').evaluate((status) => getComputedStyle(status).whiteSpace)).toBe('nowrap');
  await page.screenshot({ path: '/tmp/angkorgit-group-summary.png' });
  await page.evaluate(async () => {
    const { useSettings } = await import('/src/features/settings/store.ts');
    useSettings.getState().setTheme('light');
  });
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.screenshot({ path: '/tmp/angkorgit-group-summary-light.png' });
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  await expect(dialog).toBeHidden();
});


test('group fetch classifies partial failures once and cancellation releases a hanging run', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('最近仓库')).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    const [{ ipc }, { useSettings }, { useRepo }] = await Promise.all([
      import('/src/core/ipc.ts'), import('/src/features/settings/store.ts'), import('/src/features/repository/store.ts'),
    ]);
    const repos = ['plain', 'partial', 'slow', 'remaining'].map((name) => ({ path: `/projects/${name}`, name, lastOpenedAt: 0 }));
    useRepo.setState({ recents: repos });
    useSettings.getState().addRepoGroup('Projects', 0, repos.map((r) => r.path));
    const tracker = window as unknown as { __groupCalls: string[]; __finishGroup: () => void };
    tracker.__groupCalls = [];
    ipc.groupUpdate = async (path) => {
      tracker.__groupCalls.push(path);
      if (path.endsWith('/plain')) return { status: 'ok', message: 'Fetched origin without ref changes', changes: [] };
      if (path.endsWith('/partial')) return {
        status: 'partial', message: 'origin fetched; backup authentication failed',
        changes: [{ name: 'origin/main', oldOid: '1234567890', newOid: 'abcdef0123', commits: 2 }],
      };
      return new Promise((resolve) => { tracker.__finishGroup = () => resolve({ status: 'cancelled', message: 'Cancelled', changes: [] }); });
    };
  });
  await page.locator('[data-group-header]', { hasText: 'Projects' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '全部获取', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('部分成功');
  await expect(dialog.getByText('无更改', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('0 个已更新 · 1 无更改 · 0 个已跳过 · 0 个失败 · 1 个部分成功');
  await dialog.getByRole('button', { name: '取消本次运行', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '完成', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('status')).toContainText('1 个部分成功 · 2 个已取消');
  await page.screenshot({ path: '/tmp/angkorgit-group-cancel-summary.png' });
  await page.evaluate(async () => {
    const { useRepo } = await import('/src/features/repository/store.ts');
    if (useRepo.getState().busy !== null) throw new Error('Cancellation kept the app busy');
    const tracker = window as unknown as { __groupCalls: string[] };
    if (tracker.__groupCalls.join(',') !== '/projects/plain,/projects/partial,/projects/slow') throw new Error('Started a repository after cancellation');
  });
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.evaluate(() => (window as unknown as { __finishGroup: () => void }).__finishGroup());
  await expect(dialog).toBeHidden();
  await page.locator('[data-group-header]', { hasText: 'Projects' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '全部获取', exact: true })).toBeEnabled();
});


test('cancel counts a completed checkout and ignores a delayed inactive-run error', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('最近仓库')).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    const [{ ipc }, { useSettings }, { useRepo }] = await Promise.all([
      import('/src/core/ipc.ts'), import('/src/features/settings/store.ts'), import('/src/features/repository/store.ts'),
    ]);
    const repos = ['updated', 'queued'].map((name) => ({ name, path: `/projects/${name}`, lastOpenedAt: 0 }));
    useRepo.setState({ recents: repos });
    useSettings.getState().addRepoGroup('Projects', 0, repos.map((r) => r.path));
    const tracker = window as unknown as { __rejectLateGroup: () => void; __groupCalls: number };
    tracker.__groupCalls = 0;
    ipc.groupUpdate = async () => {
      tracker.__groupCalls++;
      return new Promise((_, reject) => { tracker.__rejectLateGroup = () => reject({ message: '分组更新已不再活动' }); });
    };
    ipc.groupCancel = async () => [{ path: repos[0].path, result: {
      status: 'ok', message: 'Fast-forwarded main', changes: [{ name: 'main', oldOid: '1234567', newOid: 'abcdef0', commits: 1 }],
    } }];
  });
  await page.locator('[data-group-header]', { hasText: 'Projects' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '全部拉取（仅限快进）', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '取消本次运行', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '完成', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('status')).toContainText('1 个已更新 · 0 已是最新 · 0 个已跳过 · 0 个失败 · 1 个已取消');
  await expect(dialog.getByText('已更新', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const tracker = window as unknown as { __rejectLateGroup: () => void; __groupCalls: number };
    if (tracker.__groupCalls !== 1) throw new Error('Queued repository started');
    tracker.__rejectLateGroup();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  await expect(dialog.getByText('已更新', { exact: true })).toBeVisible();
  await expect(dialog.getByText('分组更新已不再活动', { exact: true })).toBeHidden();
  await expect(dialog.getByRole('status')).toContainText('1 个已更新 · 0 已是最新 · 0 个已跳过 · 0 个失败 · 1 个已取消');
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
});

test('tabs shrink to share a narrow window like browser tabs and scroll only past their minimum', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const names = ['tycho', 'kirby', 'picasso', 'core.api', 'coloris', 'monika', 'crosspromotionmodule', 'promodia', 'schedudia', 'eyebreak', 'angkorgit'];
    localStorage.setItem(
      'angkorgit-ui',
      JSON.stringify({ state: { repoTabs: names.map((name) => `/Users/demo/projects/${name}`), worktreeTabs: [] }, version: 0 }),
    );
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const strip = page.locator('[data-tab-strip]');
  const tabs = page.getByRole('tab');
  const longTab = page.locator('[data-tab-path="/Users/demo/projects/crosspromotionmodule"]');
  await expect(tabs).toHaveCount(11);
  await expect(strip).toHaveAttribute('data-tab-strip', 'full');
  await expect(page.getByRole('button', { name: '关闭 tycho' })).toBeVisible();
  const wide = (await longTab.boundingBox())!;
  await page.setViewportSize({ width: 820, height: 900 });
  await expect(strip).toHaveAttribute('data-tab-strip', 'compact');
  await expect(page.locator('[data-tab-overflow]')).toHaveCount(0);
  const narrow = (await longTab.boundingBox())!;
  expect(narrow.width).toBeLessThan(wide.width - 40);
  const bar = (await strip.boundingBox())!;
  for (let i = 0; i < 11; i++) {
    const box = (await tabs.nth(i).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(bar.x + bar.width + 1);
  }
  await expect(page.getByRole('button', { name: '关闭 tycho' })).toBeHidden();
  await expect(page.getByRole('button', { name: '关闭 angkorgit' })).toBeVisible();
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.locator('[data-tab-overflow]')).toBeVisible();
  expect((await longTab.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(strip).toHaveAttribute('data-tab-strip', 'full');
  await expect(page.getByRole('button', { name: '关闭 tycho' })).toBeVisible();
  expect(Math.abs((await longTab.boundingBox())!.width - wide.width)).toBeLessThan(2);
});

test('a short tab name keeps its letters next to a shortcut pill while the strip squeezes', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const names = ['campaignrouting', 'gatewayservice', 'ledgerreports', 'notificationhub', 'pricingengine', 'zed', 'schedulerworker', 'inventorysync', 'auditlogviewer', 'checkoutflow', 'angkorgit'];
    const paths = names.map((name) => `/Users/demo/projects/${name}`);
    localStorage.setItem('angkorgit-ui', JSON.stringify({ state: { repoTabs: paths, worktreeTabs: [] }, version: 0 }));
    localStorage.setItem(
      'angkorgit-settings',
      JSON.stringify({ state: { repoShortcuts: { '/Users/demo/projects/zed': 'shift+meta+y', '/Users/demo/projects/inventorysync': 'shift+meta+i' } }, version: 0 }),
    );
  });
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-tab-strip]')).toHaveAttribute('data-tab-strip', 'full');
  const zed = page.locator('[data-tab-path="/Users/demo/projects/zed"]');
  await expect(zed.locator('[data-tab-shortcut]')).toBeVisible();
  const name = zed.locator('span').first();
  const fits = await name.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.getBoundingClientRect().width >= 18);
  expect(fits).toBe(true);
  for (const path of ['campaignrouting', 'inventorysync']) {
    const label = page.locator(`[data-tab-path="/Users/demo/projects/${path}"] span`).first();
    expect((await label.boundingBox())!.width).toBeGreaterThanOrEqual(24);
  }
});

test("what's new opens from the welcome footer and the status bar and its unread dot clears once seen", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('最近仓库')).toBeVisible({ timeout: 10_000 });
  const footerLink = page.getByRole('button', { name: '更新内容' });
  await expect(footerLink).toHaveAttribute('data-whats-new-unseen', 'true');
  await footerLink.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '更新内容' })).toBeVisible();
  await expect(dialog.locator('[data-whats-new-release]').first()).toHaveAttribute('data-whats-new-release', /^\d+\.\d+\.\d+$/);
  await expect(dialog.locator('[data-whats-new-release="0.24.0"]')).toContainText('分组的一键全部获取与全部拉取');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(footerLink).toHaveAttribute('data-whats-new-unseen', 'false');
  await page.reload();
  await expect(page.getByRole('button', { name: '更新内容' })).toHaveAttribute('data-whats-new-unseen', 'false');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const bell = page.locator('[data-whats-new]');
  await expect(bell).toHaveAttribute('data-whats-new-unseen', 'false');
  await bell.click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: '更新内容' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('pull warns before a conflicting pull and before one that would stop at local edits', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('angkorgit-demo-pull-preview') === null) localStorage.setItem('angkorgit-demo-pull-preview', 'conflicts');
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });

  const pull = page.getByRole('button', { name: /^拉取/ }).first();
  await expect(page.locator('[data-pull-warning="conflicts"]')).toBeVisible();
  await pull.hover();
  await expect(page.getByText('拉取将在 2 个文件中产生冲突：GraphRow.tsx、layout.ts')).toBeVisible();

  await pull.click();
  const check = page.locator('[data-pull-check="conflicts"]');
  await expect(check.getByText('此次拉取将产生冲突')).toBeVisible();
  await expect(check.locator('[data-pull-check-file]')).toHaveCount(2);
  await check.getByRole('button', { name: '取消' }).click();
  await expect(check).toBeHidden();

  await pull.click();
  await page.locator('[data-pull-check="conflicts"]').getByRole('button', { name: '拉取并解决冲突' }).click();
  await expect(page.getByText('已是最新（演示）')).toBeVisible();

  await page.evaluate(() => localStorage.setItem('angkorgit-demo-pull-preview', 'local'));
  await page.reload();
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.locator('[data-pull-warning="local"]')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /^拉取/ }).first().click();
  const local = page.locator('[data-pull-check="local"]');
  await expect(local.getByText('本地更改会阻碍拉取')).toBeVisible();
  await local.getByRole('button', { name: '暂存 2 个文件…' }).click();
  await expect(page.getByText('仅这 2 个文件被暂存', { exact: false })).toBeVisible();

  await page.evaluate(() => localStorage.setItem('angkorgit-demo-pull-preview', 'off'));
  await page.reload();
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-pull-warning]')).toHaveCount(0);
});

test('graph nodes whose lanes leave the column pin to its edges while the lanes scroll under them', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('angkorgit-demo-busy-graph', '1'));
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-graph-scrollbar]')).toBeVisible();
  const placement = () =>
    page.evaluate(() => {
      const nodes = [...document.querySelectorAll<HTMLElement>('[role=table] [role=row] [data-graph-node]')];
      let outside = 0;
      let pinned = 0;
      for (const node of nodes) {
        const box = node.getBoundingClientRect();
        const gutter = node.parentElement!.getBoundingClientRect();
        if (box.left < gutter.left - 1 || box.right > gutter.right + 1) outside++;
        if (node.style.transform) pinned++;
      }
      return { nodes: nodes.length, outside, pinned };
    });
  const rest = await placement();
  expect(rest.nodes).toBeGreaterThan(10);
  expect(rest.outside).toBe(0);
  expect(rest.pinned).toBeGreaterThan(0);
  const list = page.getByRole('table', { name: '提交' });
  const box = (await list.boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 200);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(20, 0);
  await expect.poll(() => list.evaluate((el) => Number(el.getAttribute('data-graph-scroll-x')))).toBeGreaterThan(100);
  const scrolled = await placement();
  expect(scrolled.outside).toBe(0);
  expect(scrolled.pinned).toBeGreaterThan(0);
});

test('a squeezed same-name tab hint keeps a few letters instead of one', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const names = ['tycho', 'kirby', 'picasso', 'core.api', 'coloris', 'monika', 'crosspromotionmodule', 'promodia', 'schedudia', 'eyebreak', 'angkorgit'];
    const paths = [...names.map((name) => `/Users/demo/projects/${name}`), '/Users/demo/forks/angkorgit'];
    localStorage.setItem('angkorgit-ui', JSON.stringify({ state: { repoTabs: paths, worktreeTabs: [] }, version: 0 }));
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const hint = page.locator('[data-tab-path="/Users/demo/forks/angkorgit"] [data-tab-hint]');
  await expect(hint).toHaveText('forks');
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.locator('[data-tab-overflow]')).toBeVisible();
  expect((await hint.boundingBox())!.width).toBeGreaterThanOrEqual(18);
});

test('switching between dark and light recolours every control in the same frame', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  for (const theme of ['light', 'angkor-dusk']) {
    const lagging = await page.evaluate(async (theme) => {
      const { useSettings } = await import('/src/features/settings/store.ts');
      const elements = [...document.querySelectorAll<HTMLElement | SVGElement>('body *')];
      const snap = () =>
        elements.map((el) => {
          const style = getComputedStyle(el);
          return `${style.backgroundColor}|${style.borderTopColor}|${style.color}|${style.fill}`;
        });
      useSettings.getState().setTheme(theme as 'light');
      const frames: string[][] = [];
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          frames.push(snap());
          if (performance.now() - start < 300) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      const final = frames[frames.length - 1];
      return elements
        .filter((el, i) => el.isConnected && frames.some((frame) => frame[i] !== final[i]))
        .map((el) => `${el.tagName.toLowerCase()} ${el.getAttribute('class')?.slice(0, 60) ?? ''}`);
    }, theme);
    expect(lagging).toEqual([]);
  }
  await expect(page.locator('html')).not.toHaveClass(/no-transitions/);
  expect(await page.getByPlaceholder('搜索提交…').evaluate((el) => getComputedStyle(el).transitionDuration)).not.toBe('0s');
});

test('a diff line menu copies the file location with the clicked column', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void ((window as unknown as { __copied: string }).__copied = text) },
    });
  });
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await page.getByText('palette-seed.sql').first().click();
  await page.waitForSelector('[data-diff-layer] [data-diff-row]', { timeout: 10_000 });
  await page.waitForTimeout(500);

  const target = await page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-diff-pane="new"] [data-diff-layer] > [data-diff-row]')];
    const row = rows.find((r) => {
      const box = r.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + 30, box.top + box.height / 2);
      const end = document.elementFromPoint(box.left + 600, box.top + box.height / 2);
      return (r.textContent ?? '').length > 12 && (r.textContent ?? '').length < 60 && !!hit && r.contains(hit) && !!end && r.contains(end) && box.top > 120;
    })!;
    const gutter = [...document.querySelectorAll<HTMLElement>('div.absolute.left-0.flex.w-full')].find(
      (g) => g.style.transform === row.style.transform && g.children.length >= 3,
    )!;
    const lineNo = gutter.children[1].textContent || gutter.children[0].textContent;
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let remaining = 6;
    let rect: DOMRect | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent?.length ?? 0;
      if (remaining < length) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.setEnd(node, remaining + 1);
        rect = range.getBoundingClientRect();
        break;
      }
      remaining -= length;
    }
    const box = row.getBoundingClientRect();
    return {
      lineNo,
      charX: rect!.left + rect!.width * 0.75,
      y: box.top + box.height / 2,
      endX: box.left + 600,
    };
  });

  await page.mouse.click(target.charX, target.y, { button: 'right' });
  const item = page.getByRole('menuitem', { name: /复制路径和行号/ });
  await expect(item).toHaveAttribute('data-copy-location', `src/data/palette-seed.sql:${target.lineNo}:7`);
  await expect(item).toContainText(`palette-seed.sql:${target.lineNo}:7`);
  await item.click();
  await expect(page.getByText('路径和行号已复制')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __copied: string }).__copied)).toBe(
    `src/data/palette-seed.sql:${target.lineNo}:7`,
  );

  await page.mouse.click(target.endX, target.y, { button: 'right' });
  await expect(item).toHaveAttribute('data-copy-location', `src/data/palette-seed.sql:${target.lineNo}`);
  await page.keyboard.press('Escape');
});

test('two selected commits can be compared with the same file list and diff panel', async ({ page }) => {
  await page.goto('/');
  await page.getByText('angkorgit', { exact: true }).first().click();
  await expect(page.getByPlaceholder('搜索提交…')).toBeVisible({ timeout: 10_000 });
  const rows = page.getByRole('row');
  const hashOf = async (n: number) => (await rows.nth(n).getByTitle('复制完整哈希').textContent())!.trim();
  const newer = await hashOf(1);
  const older = await hashOf(3);

  await rows.nth(1).click();
  await rows.nth(3).click({ modifiers: ['ControlOrMeta'] });
  await rows.nth(3).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '比较这些提交' }).click();

  const inspector = page.locator('aside[aria-label="检查器"]');
  const header = inspector.locator('[data-compare-header]');
  await expect(inspector.getByText('比较', { exact: true })).toBeVisible();
  await expect(header.locator('[data-compare-row="from"]')).toContainText(older);
  await expect(header.locator('[data-compare-row="to"]')).toContainText(newer);
  await expect(inspector.getByRole('button', { name: '编辑提交消息' })).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: /用 AI 解释/ })).toHaveCount(0);

  await inspector.getByText('GraphRow.tsx').first().click();
  await expect(page.locator('[data-diff-range]')).toHaveText(`${older}..${newer}`);
  await page.getByRole('button', { name: '显示全部文件' }).click();
  await expect(page.locator('[data-all-changes]')).toContainText(`${older}..${newer}`);
  await page.getByRole('button', { name: '显示单文件' }).click();
  await expect(page.locator('[data-diff-range]')).toHaveText(`${older}..${newer}`);

  await header.getByRole('button', { name: '交换比较的提交' }).click();
  await expect(header.locator('[data-compare-row="from"]')).toContainText(newer);
  await expect(header.locator('[data-compare-row="to"]')).toContainText(older);
  await expect(page.locator('[data-diff-range]')).toHaveCount(0);

  await rows.nth(2).click();
  await expect(inspector.locator('[data-compare-header]')).toHaveCount(0);
  await expect(inspector.getByText('提交', { exact: true })).toBeVisible();

  await rows.nth(1).click();
  await rows.nth(2).click({ modifiers: ['ControlOrMeta'] });
  await rows.nth(3).click({ modifiers: ['ControlOrMeta'] });
  await rows.nth(3).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /摘取 3 个提交/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '比较这些提交' })).toHaveCount(0);
  await page.keyboard.press('Escape');
});
