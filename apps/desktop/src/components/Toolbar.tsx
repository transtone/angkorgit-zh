import { useEffect, useMemo, useState } from 'react';
import { chordLabels, groupRepos, parseChordId, type RecentRepository } from '@angkorgit/core';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { toastOutcome } from '@/shared/toastOutcome';
import { PushRejectedDialog } from './PushRejectedDialog';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Code,
  Command,
  FolderGit2,
  FolderOpen,
  GitBranchPlus,
  Home,
  PanelLeft,
  Redo2,
  RefreshCw,
  Undo2,
  Settings,
  SquareTerminal,
  Tag,
  Archive,
  ArchiveRestore,
  UserRound,
} from 'lucide-react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Hint,
  Kbd,
  Logo,
  Separator,
  Spinner,
  cn,
} from '@angkorgit/design-system';
import { ipc, pickDirectory } from '@/core/ipc';
import { confirmDialog } from '@/components/confirm';
import { useRepo } from '@/features/repository/store';
import { GroupDot } from '@/features/repository/RepoGroupMenu';
import { fetchRemotes, fetchResultMessage } from '@/features/repository/fetchRemotes';
import { abortMergeFlow } from '@/features/repository/merge';
import { sidebarVisible, useUi } from '@/features/ui/store';
import { useUndo } from '@/features/history/undoStore';
import { useSettings, type IdentityProfile } from '@/features/settings/store';
import { applyProfileToRepo, ensureRepoProfile } from '@/features/settings/profiles';
import { openInEditor, preferredEditor, useEditors } from '@/features/settings/editors';
import { capCount, isMac, modKey } from '@/shared/utils';

function RepoSwitcher() {
  const repo = useRepo((s) => s.repo);
  const recents = useRepo((s) => s.recents);
  const open = useRepo((s) => s.open);
  const busy = useRepo((s) => s.busy);
  const openDialog = useUi((s) => s.openDialog);
  const profiles = useSettings((s) => s.profiles);
  const shortcuts = useSettings((s) => s.repoShortcuts);
  const groups = useSettings((s) => s.repoGroups);
  const groupOf = useSettings((s) => s.repoGroupOf);
  const worktreeMains = useUi((s) => s.worktreeMains);
  const profileId = useRepo((s) => s.profileId);
  const [activeEmail, setActiveEmail] = useState('');
  const grouped = useMemo(() => groupRepos(recents, groups, groupOf, worktreeMains), [recents, groups, groupOf, worktreeMains]);

  useEffect(() => {
    if (!repo?.path) return;
    void ipc.configGet(repo.path, 'user.email').then((email) => setActiveEmail(email ?? ''));
  }, [repo?.path]);

  const assignProfile = async (profile: IdentityProfile) => {
    if (!repo) return;
    try {
      await applyProfileToRepo(repo.path, profile);
      setActiveEmail(profile.email);
      toast.success(`仓库 ${repo.name} 现在使用配置“${profile.label}”`);
    } catch (error) {
      toast.error(`无法切换配置：${(error as { message?: string }).message ?? error}`);
    }
  };

  if (!repo) return null;

  const assignedProfile =
    profiles.find((p) => p.id === profileId) ??
    (profileId ? undefined : profiles.find((p) => p.email === activeEmail));

  const switchTo = async (path: string) => {
    if (path === repo.path) return;
    try {
      await open(path);
      toast.success(`已切换到 ${path.split('/').pop()}`);
    } catch (error) {
      toast.error(`无法打开仓库：${(error as { message?: string }).message ?? error}`);
    }
  };

  const renderRecent = (recent: RecentRepository) => {
    const isCurrent = recent.path === repo.path;
    const chord = shortcuts[recent.path] ? parseChordId(shortcuts[recent.path]) : null;
    return (
      <DropdownMenuItem key={recent.path} onClick={() => void switchTo(recent.path)}>
        {isCurrent ? <Check className="text-primary" /> : <FolderGit2 />}
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate', isCurrent && 'text-primary')}>{recent.name}</span>
          <span className="block truncate font-mono text-[10px] text-faint">{recent.path}</span>
        </span>
        {chord && (
          <span className="flex shrink-0 items-center gap-0.5">
            {chordLabels(chord, isMac).map((label, index) => (
              <Kbd key={index}>{label}</Kbd>
            ))}
          </span>
        )}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'mx-1 flex items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-raised',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
          )}
          disabled={!!busy}
          aria-label="切换仓库"
        >
          <Logo size={22} className="text-foreground" />
          <span className="leading-tight">
            <span className="flex items-center gap-1 text-sm font-semibold">
              {repo.name}
              <ChevronDown className="size-3 text-faint" />
            </span>
            <span className="block font-mono text-[10px] text-faint">
              {repo.isDetached ? '游离的 HEAD' : repo.headBranch ?? '无分支'}
              {repo.isWorktree ? ' · 工作树' : ''}
              {assignedProfile ? ` · ${assignedProfile.label}` : ''}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="flex max-h-[min(70vh,var(--radix-dropdown-menu-content-available-height))] min-w-72 flex-col"
      >
        {groups.length === 0 && <DropdownMenuLabel>仓库列表</DropdownMenuLabel>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.length === 0
            ? recents.map(renderRecent)
            : [
                ...grouped.sections
                  .filter((section) => section.repos.length > 0)
                  .map((section) => (
                    <div key={section.group.id} data-switcher-group={section.group.name}>
                      <DropdownMenuLabel className="flex items-center gap-1.5">
                        <GroupDot color={section.group.color} className="-ml-1" />
                        <span className="truncate">{section.group.name}</span>
                      </DropdownMenuLabel>
                      {section.repos.map(renderRecent)}
                    </div>
                  )),
                grouped.ungrouped.length > 0 && (
                  <div key="ungrouped" data-switcher-group="其他">
                    <DropdownMenuLabel>其他</DropdownMenuLabel>
                    {grouped.ungrouped.map(renderRecent)}
                  </div>
                ),
              ]}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            void (async () => {
              const dir = await pickDirectory('打开 Git 仓库');
              if (dir) await switchTo(dir);
            })()
          }
        >
          <FolderOpen /> 打开仓库…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openDialog('clone')}>
          <GitBranchPlus /> 克隆仓库…
        </DropdownMenuItem>
        {profiles.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <UserRound /> 身份配置
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {profiles.map((profile) => {
                  const active = assignedProfile?.id === profile.id;
                  return (
                    <DropdownMenuItem key={profile.id} onClick={() => void assignProfile(profile)}>
                      {active ? <Check className="text-primary" /> : <UserRound />}
                      <span className="min-w-0 flex-1">
                        <span className="block">{profile.label}</span>
                        <span className="block truncate text-[10px] text-faint">{profile.email}</span>
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const STATE_LABELS: Record<string, string> = {
  rebase: '变基进行中',
  merge: '合并进行中',
  cherrypick: '拣选进行中',
  revert: '还原进行中',
  bisect: '二分查找进行中',
};

function StateActions({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const repo = useRepo((s) => s.repo);
  if (!repo || repo.state === 'clean') return null;
  const path = repo.path;
  const state = repo.state;

  const finish = () => void onRefresh();

  const continueRebase = () =>
    void (async () => {
      try {
        const outcome = await ipc.rebaseContinue(path);
        toastOutcome(outcome, '变基已继续');
      } catch (error) {
        toast.error(`继续失败：${(error as { message?: string }).message ?? error}`);
      }
      finish();
    })();

  const abortRebase = () =>
    void (async () => {
      const ok = await confirmDialog({
        title: '中止变基？',
        description:
          '这会回退分支到变基开始之前的状态，变基期间产生的提交将被丢弃。',
        confirmLabel: '中止变基',
        destructive: true,
      });
      if (!ok) return;
      try {
        await ipc.rebaseAbort(path);
        toast.success('变基已中止');
      } catch (error) {
        toast.error(`中止失败：${(error as { message?: string }).message ?? error}`);
      }
      finish();
    })();

  const abortMerge = () => void abortMergeFlow(path);

  const clearState = () =>
    void (async () => {
      const ok = await confirmDialog({
        title: `清除 ${state} 状态？`,
        description:
          `Git 仍会将此仓库标记为进行中的 ${state}。清除将移除该标记，并保持所有文件和提交原样不变。当 ${state} 已经完成时使用。`,
        confirmLabel: '清除状态',
      });
      if (!ok) return;
      try {
        await ipc.stateCleanup(path);
        toast.success('已清除状态');
      } catch (error) {
        toast.error(`清除失败：${(error as { message?: string }).message ?? error}`);
      }
      finish();
    })();

  return (
    <DropdownMenu>
      <Hint label={STATE_LABELS[state] ?? state}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1 rounded-md border border-danger/40 bg-danger/10 px-2 py-1',
              'font-mono text-[11px] text-danger hover:bg-danger/20',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/60',
            )}
            aria-label={`${state} 进行中——操作`}
          >
            {state}
            <ChevronDown className="size-3" />
          </button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>{STATE_LABELS[state] ?? state}</DropdownMenuLabel>
        {state === 'rebase' && (
          <>
            <DropdownMenuItem onClick={continueRebase}>
              <Redo2 /> 继续变基
            </DropdownMenuItem>
            <DropdownMenuItem destructive onClick={abortRebase}>
              <Undo2 /> 中止变基
            </DropdownMenuItem>
          </>
        )}
        {state === 'merge' && (
          <DropdownMenuItem destructive onClick={abortMerge}>
            <Undo2 /> 中止合并
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={clearState}>
          <Check /> 清除状态，保持一切原样
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UndoRedoButtons({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const repo = useRepo((s) => s.repo);
  const undoStack = useUndo((s) => s.undoStack);
  const redoStack = useUndo((s) => s.redoStack);
  const path = repo?.path ?? '';

  const nextUndo = [...undoStack].reverse().find((e) => e.repoPath === path);
  const nextRedo = [...redoStack].reverse().find((e) => e.repoPath === path);

  const run = (direction: 'undo' | 'redo') => {
    const fn = direction === 'undo' ? useUndo.getState().undo : useUndo.getState().redo;
    void fn(path).then((ok) => {
      if (ok) void onRefresh();
    });
  };

  return (
    <>
      <Hint
        label={
          nextUndo ? (
            <span className="flex items-center gap-1">
              撤销：{nextUndo.label} <Kbd>{modKey()}</Kbd>
              <Kbd>Z</Kbd>
            </span>
          ) : (
            '无可撤销'
          )
        }
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="撤销"
          disabled={!nextUndo}
          onClick={() => run('undo')}
        >
          <Undo2 />
        </Button>
      </Hint>
      <Hint
        label={
          nextRedo ? (
            <span className="flex items-center gap-1">
              重做：{nextRedo.label} <Kbd>{modKey()}</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>Z</Kbd>
            </span>
          ) : (
            '无可重做'
          )
        }
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="重做"
          disabled={!nextRedo}
          onClick={() => run('redo')}
        >
          <Redo2 />
        </Button>
      </Hint>
    </>
  );
}

function isNonFastForward(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === 'non_fast_forward' || /non-fast-?forward/i.test(e?.message ?? '');
}

export function Toolbar({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const repo = useRepo((s) => s.repo);
  const status = useRepo((s) => s.status);
  const remotes = useRepo((s) => s.remotes);
  const stashes = useRepo((s) => s.stashes);
  const busy = useRepo((s) => s.busy);
  const setBusy = useRepo((s) => s.setBusy);
  const toggleTerminal = useUi((s) => s.toggleTerminal);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const sidebarOpen = useUi(sidebarVisible);
  const openDialog = useUi((s) => s.openDialog);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const navigate = useNavigate();
  const [spinning, setSpinning] = useState(false);

  if (!repo) return null;
  const remote = remotes[0]?.name ?? 'origin';
  const latestStash = stashes[0];

  const editorId = useSettings((s) => s.editorId);
  const { editors } = useEditors();
  const editor = preferredEditor(editors, editorId);

  const [pushRejected, setPushRejected] = useState(false);

  const run = async (label: string, op: () => Promise<{ status: string; message: string } | void>) => {
    if (busy) return;
    setBusy(label);
    try {
      const outcome = await op();
      if ((label.startsWith('Pull') || label.startsWith('拉取')) && useRepo.getState().repo?.path === repo.path) useRepo.getState().markFetched();
      if (outcome && 'message' in outcome) {
        toastOutcome(outcome, `${label} 完成`);
      } else {
        toast.success(`${label} 完成`);
      }
      await onRefresh();
    } catch (error) {
      if (label === '推送' && isNonFastForward(error)) {
        setPushRejected(true);
        return;
      }
      toast.error(`${label} 失败：${(error as { message?: string }).message ?? error}`);
    } finally {
      setBusy(null);
    }
  };

  const runPush = (label: string, op: () => Promise<{ status: string; message: string } | void>) =>
    void (async () => {
      if (busy) return;
      await ensureRepoProfile(repo.path);
      await run(label, op);
      void import('@/features/forge/store').then(({ useForge }) => useForge.getState().load(true));
    })();
  const confirmForcePush = async () => {
    const branch = repo.headBranch ?? 'the current branch';
    const ok = await confirmDialog({
      title: '强制推送？',
      description: `${remote}/${branch} 将被本地的 ${branch}覆盖。仅存在于远端的提交将会丢失，任何已拉取该分支的人都需要重置到新历史。`,
      confirmLabel: '强制推送',
      destructive: true,
    });
    if (ok) runPush('推送（强制）', () => ipc.push(repo.path, remote, true, false, true));
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border-subtle bg-surface px-2">
      <Hint label="返回仓库列表">
        <Button variant="ghost" size="icon" aria-label="首页" onClick={() => navigate('/welcome')}>
          <Home />
        </Button>
      </Hint>
      <Hint
        label={
          <span className="flex items-center gap-1">
            {sidebarOpen ? '隐藏侧边栏' : '显示侧边栏'} <Kbd>{modKey()}</Kbd>
            <Kbd>B</Kbd>
          </span>
        }
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={sidebarOpen ? '隐藏侧边栏' : '显示侧边栏'}
          className={!sidebarOpen ? 'text-primary' : undefined}
          onClick={toggleSidebar}
        >
          <PanelLeft />
        </Button>
      </Hint>
      <RepoSwitcher />
      <StateActions onRefresh={onRefresh} />

      <UndoRedoButtons onRefresh={onRefresh} />

      <PushRejectedDialog
        open={pushRejected}
        remote={remote}
        branch={repo.headBranch ?? null}
        onClose={() => setPushRejected(false)}
        onPullRebase={() => {
          setPushRejected(false);
          void run('拉取（变基）', () => ipc.pull(repo.path, remote, 'rebase'));
        }}
        onForcePush={() => {
          setPushRejected(false);
          runPush('推送（强制）', () => ipc.push(repo.path, remote, true, false, true));
        }}
      />

      <Separator orientation="vertical" className="mx-2 h-6" />

      <Hint label={remotes.length === 0 ? '未配置远端' : remotes.length > 1 ? `获取全部远端（${remotes.map((r) => r.name).join('、')}）` : `获取 ${remote}`}>
        <span className="inline-flex">
          <Button
            variant="ghost"
            size="sm"
            disabled={!!busy || remotes.length === 0}
            onClick={() =>
              void run('获取', async () => {
                const result = await fetchRemotes(remotes.map((r) => r.name), (name) => ipc.fetch(repo.path, name, true, true));
                const message = fetchResultMessage(result);
                if (useRepo.getState().repo?.path === repo.path) {
                  if (result.succeeded.length > 0) useRepo.getState().markFetched();
                  useRepo.getState().setFetchFailures(result.failed.map(({ name }) => name));
                }
                return { status: result.succeeded.length === 0 ? 'failed' : result.failed.length > 0 ? 'partial' : 'ok', message };
              })
            }
          >
            <RefreshCw className={busy === '获取' ? 'animate-spin' : ''} />
            获取
          </Button>
        </span>
      </Hint>
      <div className="flex items-center">
        <Hint label={`从 ${remote} 拉取${status?.behind ? ` (${status.behind} behind)` : ''} · merge or rebase per pull.rebase`}>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-r-none"
            disabled={!!busy}
            onClick={() => void run('拉取', () => ipc.pull(repo.path, remote))}
          >
            <ArrowDownToLine />
            拉取
            {status && status.behind > 0 && <Badge tone="info">{capCount(status.behind)}</Badge>}
          </Button>
        </Hint>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="rounded-l-none" aria-label="拉取选项" disabled={!!busy}>
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => void run('拉取（合并）', () => ipc.pull(repo.path, remote, 'merge'))}>
              拉取（合并）
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void run('拉取（变基）', () => ipc.pull(repo.path, remote, 'rebase'))}>
              拉取（变基）
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center">
        <Hint label={`推送到 ${remote}${status?.ahead ? ` (${status.ahead} ahead)` : ''}`}>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-r-none"
            disabled={!!busy}
            onClick={() => runPush('推送', () => ipc.push(repo.path, remote, false, false, true))}
          >
            <ArrowUpFromLine />
            推送
            {status && status.ahead > 0 && <Badge tone="primary">{capCount(status.ahead)}</Badge>}
          </Button>
        </Hint>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="rounded-l-none" aria-label="推送选项" disabled={!!busy}>
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => void confirmForcePush()} destructive>
              强制推送
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => runPush('推送（含标签）', () => ipc.push(repo.path, remote, false, true, true))}>
              推送（含标签）
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void run('拉取标签', () => ipc.fetch(repo.path, remote, true, false))}>
              拉取标签
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator orientation="vertical" className="mx-2 h-6" />

      <Hint label="新建分支">
        <Button variant="ghost" size="icon" aria-label="新建分支" onClick={() => openDialog('createBranch')}>
          <GitBranchPlus />
        </Button>
      </Hint>
      <Hint label="新建标签">
        <Button variant="ghost" size="icon" aria-label="新建标签" onClick={() => openDialog('createTag')}>
          <Tag />
        </Button>
      </Hint>
      <Hint label="暂存更改">
        <Button variant="ghost" size="icon" aria-label="暂存更改" onClick={() => openDialog('createStash')}>
          <Archive />
        </Button>
      </Hint>
      <Hint label={latestStash ? `弹出最新暂存：${latestStash.message}` : '弹出最新暂存（当前没有暂存）'}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="弹出最新暂存"
          disabled={!latestStash || !!busy}
          onClick={() => void run('弹出暂存', () => ipc.stashPop(repo.path, 0))}
        >
          <ArchiveRestore />
        </Button>
      </Hint>

      <Separator orientation="vertical" className="mx-2 h-6" />

      <div className="flex items-center">
        <Hint label={editor ? `在 ${editor.label} 中打开` : '在编辑器中打开（未检测到，见 设置 → Git）'}>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-r-none"
            aria-label={editor ? `在 ${editor.label} 中打开` : '在编辑器中打开'}
            disabled={!editor}
            onClick={() => editor && void openInEditor(editor.id, repo.path)}
          >
            <Code />
          </Button>
        </Hint>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-l-none"
              aria-label="编辑器选项"
              disabled={editors.length === 0}
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {editors.map((candidate) => (
              <DropdownMenuItem key={candidate.id} onClick={() => void openInEditor(candidate.id, repo.path)}>
                {candidate.id === editor?.id ? <Check /> : <Code />} 在 {candidate.label} 中打开
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {busy && (
          <span className="mr-1 flex items-center gap-2 text-xs text-muted">
            <Spinner /> {busy}…
          </span>
        )}
        <Hint
          label={
            <span className="flex items-center gap-1">
              命令面板 <Kbd>{modKey()}</Kbd>
              <Kbd>K</Kbd>
            </span>
          }
        >
          <Button variant="ghost" size="icon" aria-label="命令面板" onClick={() => setPaletteOpen(true)}>
            <Command />
          </Button>
        </Hint>
        <Hint
          label={
            <span className="flex items-center gap-1">
              终端 <Kbd>{modKey()}</Kbd>
              <Kbd>`</Kbd>
            </span>
          }
        >
          <Button variant="ghost" size="icon" aria-label="切换终端" onClick={toggleTerminal}>
            <SquareTerminal />
          </Button>
        </Hint>
        <Hint label="刷新">
          <Button
            variant="ghost"
            size="icon"
            aria-label="刷新"
            onClick={() => {
              setSpinning(true);
              void onRefresh().finally(() => setSpinning(false));
            }}
          >
            <RefreshCw className={spinning ? 'animate-spin' : ''} />
          </Button>
        </Hint>
        <Hint label="设置">
          <Button variant="ghost" size="icon" aria-label="设置" onClick={() => openDialog('settings')}>
            <Settings />
          </Button>
        </Hint>
      </div>
    </header>
  );
}
