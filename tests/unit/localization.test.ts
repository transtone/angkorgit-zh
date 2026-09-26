import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gitlabForgeProvider, parseForgeRemote, type HttpRequest } from '@angkorgit/core';

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('Chinese localization of the upstream collaboration update', () => {
  it('keeps smoke navigation selectors aligned with the Chinese interface', () => {
    const smoke = source('tests/e2e/smoke.spec.ts');
    for (const selector of ["name: 'Toggle terminal'", "name: 'Settings'", "getByText('Clone repository'", "getByPlaceholder('Destination folder'", "name: 'Inspector'", "name: 'Appearance'", "name: 'Add account'", "name: 'Fetch', exact", "name: 'Pull', exact", "name: 'Edit commit message'", "name: 'Save message'", "name: 'Resize description'", "name: 'All files'", "getByText('Token', { exact: true })"]) {
      expect(smoke).not.toContain(selector);
    }
    for (const selector of ["name: '切换终端'", "name: '设置'", "getByText('克隆仓库'", "getByPlaceholder('目标文件夹'", "name: '检查器'", "name: '外观'", "name: '添加账户'", "name: '获取', exact", "name: '拉取', exact", "name: '编辑提交消息'", "name: '保存消息'", "name: '调整描述高度'", "name: '全部文件'", "getByText('令牌', { exact: true })"]) {
      expect(smoke).toContain(selector);
    }
  });

  it('localizes remote controls without changing remote identifiers', () => {
    const sidebar = source('apps/desktop/src/features/sidebar/Sidebar.tsx');
    expect(sidebar).toContain('aria-label="添加远端"');
    expect(sidebar).toContain("'编辑远端'");
    expect(sidebar).toContain("'保存更改'");
    expect(sidebar).toContain('`添加远端 ${name}`');
    expect(sidebar).toContain("remotes.length === 0 ? 'origin' : 'upstream'");
    expect(sidebar).not.toContain('Add remote');
  });

  it('localizes fork targets and preserves source and target interpolation', () => {
    const dialog = source('apps/desktop/src/features/forge/CreatePrDialog.tsx');
    expect(dialog).toContain('aria-label="目标仓库"');
    expect(dialog).toContain('${remote.owner}/${remote.repo}');
    expect(dialog).toContain('${targetRemote.owner}/${targetRemote.repo}');
    expect(dialog).toContain('{activeTargetName} 上没有找到分支');
    expect(dialog).not.toMatch(/Opens a |Into repository|No branches found on|Loading members|Writing…/);
  });

  it('localizes the clone folder card and its empty state', () => {
    const settings = source('apps/desktop/src/features/settings/SettingsDialog.tsx');
    expect(settings).toContain('title="克隆目录"');
    expect(settings).toContain("pickDirectory('选择默认克隆目录')");
    expect(settings).toContain('未设置——每次克隆时选择文件夹');
    expect(settings).toContain('<FolderOpen className="size-3.5" /> 选择文件夹');
    expect(settings).not.toMatch(/Choose the default clone folder|Clone destination|Choose folder/);
  });

  it('localizes all terminal context menu actions', () => {
    const terminal = source('apps/desktop/src/features/terminal/TerminalPanel.tsx');
    for (const label of ['<Copy /> 复制', '<ClipboardPaste /> 粘贴', '<TextSelect /> 全选', '<Eraser /> 清空终端']) {
      expect(terminal).toContain(label);
    }
    expect(terminal).not.toMatch(/> Copy\s|> Paste\s|> Select all|> Clear terminal/);
  });

  it('localizes long-line hints without changing their numeric expressions', () => {
    const diff = source('apps/desktop/src/features/diff/diffShared.tsx');
    expect(diff).toContain('此行仅显示前 ${MAX_RENDERED_LINE.toLocaleString()} 个字符');
    expect(diff).toContain('… 另有 ${clipped.hidden.toLocaleString()} 个字符');
    expect(diff).not.toMatch(/Only the first|more characters/);
  });

  it('keeps versions and the fork update identity aligned', () => {
    const root = JSON.parse(source('package.json'));
    const app = JSON.parse(source('apps/desktop/package.json'));
    const config = JSON.parse(source('apps/desktop/src-tauri/tauri.conf.json'));
    const cargo = source('apps/desktop/src-tauri/Cargo.toml');
    const lock = source('apps/desktop/src-tauri/Cargo.lock');
    expect(root.name).toBe('angkorgit-zh');
    expect(app.version).toBe(root.version);
    expect(config.version).toBe(root.version);
    expect(cargo.match(/^version = "([^"]+)"/m)?.[1]).toBe(root.version);
    expect(lock.match(/name = "angkorgit"\r?\nversion = "([^"]+)"/)?.[1]).toBe(root.version);
    expect(config.plugins.updater.pubkey).toBe(source('zh-dict/updater-pubkey.txt').trim());
    expect(config.plugins.updater.endpoints).toEqual([
      'https://github.com/wuwuzhazha/angkorgit-zh/releases/latest/download/latest.json',
    ]);
  });

  it('localizes the whole-tree fetch results and keeps remote names intact', () => {
    const fetch = source('apps/desktop/src/features/repository/fetchRemotes.ts');
    expect(fetch).toContain("return '未配置远端';");
    expect(fetch).toContain("已获取 1 个远端");
    expect(fetch).toContain('已获取全部 ${total} 个远端');
    expect(fetch).toContain('已获取 ${result.succeeded.length}/${total} 个远端，失败：${failures}');
    expect(fetch).not.toMatch(/No remotes configured|Fetched 1 remote|Fetched all/);
    const status = source('apps/desktop/src/components/StatusBar.tsx');
    expect(status).toContain('获取失败：${fetchFailures.join');
    expect(status).toContain('获取未完成');
    expect(status).not.toMatch(/Failed to fetch|Fetch incomplete/);
  });

  it('localizes the inspector all-files view without touching file paths', () => {
    const inspector = source('apps/desktop/src/features/inspector/Inspector.tsx');
    expect(inspector).toContain('aria-label="全部文件"');
    expect(inspector).toContain('所选提交的全部文件');
    expect(inspector).toContain('工作副本的全部文件');
    expect(inspector).not.toMatch(/All files/);
    const details = source('apps/desktop/src/features/inspector/CommitDetails.tsx');
    expect(details).toContain('编辑提交消息');
    expect(details).toContain('保存消息');
    expect(details).toContain('调整描述高度');
    expect(details).toContain('提交消息已更新');
    expect(details).toContain('按变更类型筛选文件');
    expect(details).not.toMatch(/Edit commit message|Save message|Resize description|Commit message updated|Filter files by kind/);
    const diff = source('apps/desktop/src/features/diff/DiffPanel.tsx');
    expect(diff).toContain('>未更改<');
    expect(diff).not.toContain('>unchanged<');
  });

  it('localizes the fonts card while keeping brand and family names intact', () => {
    const card = source('apps/desktop/src/features/settings/FontsCard.tsx');
    for (const label of ['ariaLabel="界面字体"', 'ariaLabel="代码字体"', 'ariaLabel="终端字体"', 'aria-label="终端字号"', '重置字体', '菜单、列表与对话框']) {
      expect(card).toContain(label);
    }
    expect(card).toContain('Nerd Fonts');
    expect(card).toContain('等宽字体');
    expect(card).not.toMatch(/Reset fonts|Interface font|Code font|Terminal font|Other fonts|Reading installed fonts/);
    const settings = source('apps/desktop/src/features/settings/SettingsDialog.tsx');
    expect(settings).toContain('使用本机已安装的 AI CLI');
    expect(settings).not.toMatch(/already installed on this machine/);
    const accounts = source('apps/desktop/src/features/settings/AccountsTab.tsx');
    expect(accounts).toContain('具备 Contents 与拉取请求读写权限');
    expect(accounts).not.toMatch(/set to read and write/);
  });

  it('keeps the inspector focus race fix while adopting the upstream ui store', () => {
    const store = source('apps/desktop/src/features/ui/store.ts');
    expect(store).toContain('focusInspector: (target: string | null) => void;');
    expect(store).toContain('inspectorTarget: null as string | null');
    expect(store).toContain('editMessageRequest: { seq: number; oid: string } | null;');
    const commit = source('apps/desktop/src-tauri/src/core/commit.rs');
    expect(commit).toContain('提交消息不能为空');
    expect(commit).toContain('只能改写当前分支上的提交');
    expect(commit).not.toMatch(/cannot be empty|can be reworded/);
  });

  it('localizes the push-rejected flow without breaking the dialog routing', () => {
    const dialog = source('apps/desktop/src/components/PushRejectedDialog.tsx');
    expect(dialog).toContain('远端已超前');
    expect(dialog).toContain('推送被拒绝，请选择一种合流方式。');
    expect(dialog).toContain('拉取（变基）');
    expect(dialog).toContain('强制推送');
    expect(dialog).not.toMatch(/The remote has moved on|Force push|Pull with rebase/);
    const toolbar = source('apps/desktop/src/components/Toolbar.tsx');
    expect(toolbar).toContain("label === '推送'");
    expect(toolbar).not.toContain("label === 'Push'");
    const error = source('apps/desktop/src-tauri/src/error.rs');
    expect(error).toContain('请先用变基拉取将其取回');
    expect(error).not.toContain('Pull with rebase to');
    const remote = source('apps/desktop/src-tauri/src/core/remote.rs');
    expect(remote).toContain('请修复被拒的引用后重新推送');
    expect(remote).not.toContain('Nothing else from this push was rolled back');
  });

  it('localizes single-file and commit AI reviews while keeping provider brands', () => {
    const strip = source('apps/desktop/src/features/diff/DiffAiStrip.tsx');
    expect(strip).toContain('复制 ${title}');
    expect(strip).toContain('点击引用的行可跳转');
    expect(strip).not.toMatch(/Copy as text|Click a quoted line/);
    const report = source('apps/desktop/src/features/ai/AiReport.tsx');
    expect(report).toContain('在差异中显示此行');
    const panel = source('apps/desktop/src/features/ai/AiResultPanel.tsx');
    expect(panel).toContain('停止 ${title}');
    expect(panel).toContain('关闭 ${title}');
    const details = source('apps/desktop/src/features/inspector/CommitDetails.tsx');
    expect(details).toContain('用 AI 审查');
    expect(details).toContain('停止审查');
    const diff = source('apps/desktop/src/features/diff/DiffPanel.tsx');
    expect(diff).toContain('审查更改');
    expect(diff).toContain('解释更改');
    expect(diff).toContain('视图选项');
    expect(diff).not.toMatch(/Review changes|Explain changes|View options/);
  });

  it('localizes the tidied file lists and their empty states', () => {
    const panel = source('apps/desktop/src/features/commit/WorkingCopyPanel.tsx');
    expect(panel).toContain('title="新增"');
    expect(panel).toContain('工作区干净');
    expect(panel).toContain('尚未暂存内容');
    expect(panel).not.toMatch(/title="Added"|Nothing staged/);
    const history = source('apps/desktop/src/features/history/FileHistoryPanel.tsx');
    expect(history).toContain('无未提交更改');
    expect(history).toContain('选择一个提交');
    expect(history).not.toMatch(/No uncommitted changes|Pick a commit/);
    const status = source('apps/desktop/src/components/StatusBar.tsx');
    expect(status).toContain('请在设置中为其连接账户');
    expect(status).not.toContain('pull requests light up here');
  });

  it('reports a Chinese GitLab error before posting with an invalid target project', async () => {
    const remote = parseForgeRemote('https://gitlab.example.com/team/project.git');
    if (!remote) throw new Error('expected a parsed remote');
    const calls: HttpRequest[] = [];
    const provider = gitlabForgeProvider(remote, async (request) => {
      calls.push(request);
      return { status: 200, body: '{}' };
    });
    await expect(provider.createPullRequest({
      title: 'feature',
      body: '',
      sourceBranch: 'feature',
      targetBranch: 'main',
      draft: false,
      sourceRepo: { owner: 'fork', repo: 'project' },
    })).rejects.toThrow('GitLab 未返回目标项目 ID');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
  });
});
