import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { toast } from 'sonner';
import { toastOutcome } from '@/shared/toastOutcome';
import { fetchRemotes, fetchResultMessage } from '@/features/repository/fetchRemotes';
import {
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronsDownUp,
  Code,
  Download,
  FileClock,
  FolderGit2,
  FolderOpen,
  FolderTree,
  GitBranchPlus,
  GitPullRequest,
  Globe,
  History,
  Home,
  Moon,
  PanelLeft,
  Redo2,
  RefreshCw,
  Settings,
  SquareTerminal,
  Sun,
  Tag as TagIcon,
  Undo2,
  UserRoundSearch,
  ZoomIn,
  ZoomOut,
  Keyboard,
} from 'lucide-react';
import { Kbd, Spinner } from '@angkorgit/design-system';
import { ipc, openExternal, pickDirectory } from '@/core/ipc';
import { confirmDialog } from '@/components/confirm';
import { useRepo } from '@/features/repository/store';
import { abortMergeFlow } from '@/features/repository/merge';
import { sidebarVisible, useUi } from '@/features/ui/store';
import { SIDEBAR_SECTIONS } from '@/features/sidebar/Sidebar';
import { themeBase, useSettings } from '@/features/settings/store';
import { installCliTool } from '@/features/settings/cliTool';
import { openInEditor, preferredEditor, useEditors } from '@/features/settings/editors';
import { useUndo } from '@/features/history/undoStore';
import { useForge } from '@/features/forge/store';
import { chordLabels, forgeNoun, parseChordId, pickForgeRemote, remoteWebUrl } from '@angkorgit/core';
import { currentPullRequestUrl, isMac, modKey } from '@/shared/utils';

export function CommandPalette({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const repo = useRepo((s) => s.repo);
  const editorId = useSettings((s) => s.editorId);
  const repoShortcuts = useSettings((s) => s.repoShortcuts);
  const { editors } = useEditors();
  const editor = preferredEditor(editors, editorId);
  const branches = useRepo((s) => s.branches);
  const remotes = useRepo((s) => s.remotes);
  const recents = useRepo((s) => s.recents);
  const worktrees = useRepo((s) => s.worktrees);
  const stashes = useRepo((s) => s.stashes);
  const open = useRepo((s) => s.open);
  const paletteOpen = useUi((s) => s.paletteOpen);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const toggleTerminal = useUi((s) => s.toggleTerminal);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const sidebarOpen = useUi(sidebarVisible);
  const openDialog = useUi((s) => s.openDialog);
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const zoomIn = useSettings((s) => s.zoomIn);
  const zoomOut = useSettings((s) => s.zoomOut);
  const forgeRepoPath = useForge((s) => s.repoPath);
  const forgeKind = useForge((s) => s.remote?.kind ?? null);
  const forgeAccount = useForge((s) => s.hasAccount);
  const undoStack = useUndo((s) => s.undoStack);
  const redoStack = useUndo((s) => s.redoStack);
  const navigate = useNavigate();

  const path = repo?.path ?? '';
  const repoState = repo?.state ?? 'clean';
  const remote = remotes[0]?.name ?? 'origin';
  const locals = useMemo(() => branches.filter((b) => !b.isRemote && !b.isHead), [branches]);
  const otherRepos = useMemo(() => recents.filter((r) => r.path !== path).slice(0, 8), [recents, path]);
  const nextUndo = useMemo(() => [...undoStack].reverse().find((e) => e.repoPath === path), [undoStack, path]);
  const nextRedo = useMemo(() => [...redoStack].reverse().find((e) => e.repoPath === path), [redoStack, path]);

  const [mode, setMode] = useState<'commands' | 'fileHistory' | 'blame'>('commands');
  const [search, setSearch] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState(false);
  const filesRequest = useRef(0);

  useEffect(() => {
    if (!paletteOpen) return;
    setMode('commands');
    setSearch('');
  }, [paletteOpen]);

  const enterFilePicker = (picker: 'fileHistory' | 'blame') => {
    setMode(picker);
    setSearch('');
    setFiles([]);
    setFilesError(false);
    setFilesLoading(true);
    const token = ++filesRequest.current;
    void ipc
      .repoFiles(path)
      .then((list) => {
        if (filesRequest.current !== token) return;
        setFiles(list);
        setFilesLoading(false);
      })
      .catch((error) => {
        if (filesRequest.current !== token) return;
        setFiles([]);
        setFilesError(true);
        setFilesLoading(false);
        toast.error(`Listing files failed: ${(error as { message?: string }).message ?? error}`);
      });
  };

  const visibleFiles = useMemo(() => {
    if (mode === 'commands') return [];
    const q = search.trim().toLowerCase();
    const matches = q ? files.filter((f) => f.toLowerCase().includes(q)) : files;
    return matches.slice(0, 50);
  }, [mode, files, search]);

  const visibleBranches = useMemo(() => {
    if (mode !== 'commands') return [];
    const q = search.trim().toLowerCase();
    const matches = q ? locals.filter((b) => b.name.toLowerCase().includes(q)) : locals;
    return matches.slice(0, 100);
  }, [mode, locals, search]);

  const close = () => setPaletteOpen(false);

  const run = (label: string, op: () => Promise<unknown>) => {
    close();
    void (async () => {
      try {
        const result = (await op()) as { status?: string; message?: string } | undefined;
        if ((label.startsWith('Pull') || label.startsWith('拉取')) && useRepo.getState().repo?.path === path) useRepo.getState().markFetched();
        toastOutcome(result, `${label} 已完成`);
        await onRefresh();
      } catch (error) {
        toast.error(`${label} 失败：${(error as { message?: string }).message ?? error}`);
      }
    })();
  };

  const runHistory = (direction: 'undo' | 'redo') => {
    close();
    const fn = direction === 'undo' ? useUndo.getState().undo : useUndo.getState().redo;
    void fn(path).then((ok) => {
      if (ok) void onRefresh();
    });
  };

  const openRepository = () => {
    close();
    void (async () => {
      const dir = await pickDirectory('打开 Git 仓库');
      if (!dir || dir === path) return;
      await open(dir);
    })().catch((error) =>
      toast.error(`无法打开：${(error as { message?: string }).message ?? error}`),
    );
  };

  const continueRebase = () => {
    close();
    void (async () => {
      try {
        const outcome = await ipc.rebaseContinue(path);
        toastOutcome(outcome, '变基已继续');
      } catch (error) {
        toast.error(`继续失败：${(error as { message?: string }).message ?? error}`);
      }
      await onRefresh();
    })();
  };

  const abortRebase = () => {
    close();
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
      await onRefresh();
    })();
  };

  const abortMerge = () => {
    close();
    void abortMergeFlow(path);
  };

  const clearState = () => {
    close();
    void (async () => {
      const ok = await confirmDialog({
        title: `清除 ${repoState} 状态？`,
        description:
          `Git 仍会将此仓库标记为进行中的 ${repoState}。清除将移除该标记，并保持所有文件和提交原样不变。当 ${repoState} 已经完成时使用。`,
        confirmLabel: '清除状态',
      });
      if (!ok) return;
      try {
        await ipc.stateCleanup(path);
        toast.success('已清除状态');
      } catch (error) {
        toast.error(`清除失败：${(error as { message?: string }).message ?? error}`);
      }
      await onRefresh();
    })();
  };

  return (
    <Command.Dialog
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      label="命令面板"
      shouldFilter={mode === 'commands'}
      className="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface-overlay shadow-soft"
    >
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder={
          mode === 'fileHistory'
            ? '搜索文件查看修改人…'
            : mode === 'blame'
              ? 'Search a file to blame…'
              : '输入命令或分支名…'
        }
        onKeyDown={(e) => {
          if (mode !== 'commands' && e.key === 'Backspace' && search === '') {
            e.preventDefault();
            setMode('commands');
          }
        }}
        className="h-11 w-full border-b border-border-subtle bg-transparent px-4 text-sm text-foreground outline-none placeholder:text-faint"
      />
      <Command.List className="max-h-80 overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-faint">
        {!(mode !== 'commands' && (filesLoading || filesError)) && (
          <Command.Empty className="py-8 text-center text-sm text-faint">无结果。</Command.Empty>
        )}

        {mode !== 'commands' && filesLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-faint">
            <Spinner /> Loading files…
          </div>
        )}
        {mode !== 'commands' && !filesLoading && filesError && (
          <div className="py-8 text-center text-sm text-faint">无法列出文件。</div>
        )}
        {mode !== 'commands' && !filesLoading && !filesError && (
          <Command.Group heading={mode === 'blame' ? 'Blame' : '文件历史'}>
            {visibleFiles.map((file) => (
              <PaletteItem
                key={file}
                icon={mode === 'blame' ? <UserRoundSearch /> : <FileClock />}
                label={file}
                onSelect={() => {
                  close();
                  if (mode === 'blame') useUi.getState().openBlame(file);
                  else useUi.getState().openFileHistory(file);
                }}
              />
            ))}
          </Command.Group>
        )}

        {mode === 'commands' && (
        <>
        <Command.Group heading="操作">
          <PaletteItem icon={<History />} label="文件历史…" onSelect={() => enterFilePicker('fileHistory')} />
          <PaletteItem icon={<UserRoundSearch />} label="Blame…" onSelect={() => enterFilePicker('blame')} />
          <PaletteItem icon={<ArrowDownToLine />} label="拉取" onSelect={() => run('拉取', () => ipc.pull(path, remote))} />
          <PaletteItem
            icon={<ArrowDownToLine />}
            label="拉取（变基）"
            onSelect={() => run('拉取（变基）', () => ipc.pull(path, remote, 'rebase'))}
          />
          <PaletteItem icon={<ArrowUpFromLine />} label="推送" onSelect={() => run('推送', () => ipc.push(path, remote, false, false, true))} />
          {(() => {
            const headUpstream = branches.find((b) => !b.isRemote && b.isHead)?.upstream ?? null;
            const pickedRemote = pickForgeRemote(remotes, headUpstream);
            const prUrl = currentPullRequestUrl(repo, pickedRemote?.url);
            const webUrl = pickedRemote ? remoteWebUrl(pickedRemote.url) : null;
            const forgeCurrent = forgeRepoPath !== null && forgeRepoPath === repo?.path;
            const inApp = forgeCurrent && forgeKind !== null && forgeAccount;
            return (
              <>
                {webUrl && (
                  <PaletteItem
                    icon={<Globe />}
                    label={remotes.length > 1 ? `在浏览器中打开 ${pickedRemote?.name}` : '在浏览器中打开仓库'}
                    onSelect={() => {
                      close();
                      void openExternal(webUrl);
                    }}
                  />
                )}
                {prUrl && (
                  <PaletteItem
                    icon={<GitPullRequest />}
                    label={`Create ${forgeNoun(forgeCurrent ? forgeKind : null)}`}
                    onSelect={() => {
                      close();
                      if (inApp) openDialog('createPullRequest');
                      else void openExternal(prUrl);
                    }}
                  />
                )}
              </>
            );
          })()}
          <PaletteItem
            icon={<RefreshCw />}
            label={remotes.length > 1 ? '获取全部远端（含标签）' : '拉取（含标签）'}
            onSelect={() =>
              run('获取', async () => {
                const result = await fetchRemotes(remotes.map((r) => r.name), (name) => ipc.fetch(path, name, true, true));
                const message = fetchResultMessage(result);
                if (useRepo.getState().repo?.path === path) {
                  if (result.succeeded.length > 0) useRepo.getState().markFetched();
                  useRepo.getState().setFetchFailures(result.failed.map(({ name }) => name));
                }
                return { status: result.succeeded.length === 0 ? 'failed' : result.failed.length > 0 ? 'partial' : 'ok', message };
              })
            }
          />
          <PaletteItem
            icon={<GitBranchPlus />}
            label="新建分支…"
            onSelect={() => {
              close();
              openDialog('createBranch');
            }}
          />
          <PaletteItem
            icon={<FolderTree />}
            label="新建工作树…"
            onSelect={() => {
              close();
              openDialog('createWorktree');
            }}
          />
          <PaletteItem
            icon={<TagIcon />}
            label="新建标签…"
            onSelect={() => {
              close();
              openDialog('createTag');
            }}
          />
          <PaletteItem
            icon={<Archive />}
            label="暂存更改…"
            onSelect={() => {
              close();
              openDialog('createStash');
            }}
          />
          {stashes.length > 0 && (
            <PaletteItem
              icon={<ArchiveRestore />}
              label={`弹出最新暂存：${stashes[0].message}`}
              onSelect={() => run('弹出暂存', () => ipc.stashPop(path, 0))}
            />
          )}
          {nextUndo && (
            <PaletteItem icon={<Undo2 />} label={`撤销：${nextUndo.label}`} shortcut="Z" onSelect={() => runHistory('undo')} />
          )}
          {nextRedo && (
            <PaletteItem icon={<Redo2 />} label={`重做：${nextRedo.label}`} onSelect={() => runHistory('redo')} />
          )}
          <PaletteItem
            icon={<RefreshCw />}
            label="刷新"
            shortcut="R"
            onSelect={() => {
              close();
              void onRefresh();
            }}
          />
        </Command.Group>

        {repoState !== 'clean' && (
          <Command.Group heading="仓库状态">
            {repoState === 'rebase' && (
              <>
                <PaletteItem icon={<Redo2 />} label="继续变基" onSelect={continueRebase} />
                <PaletteItem icon={<Undo2 />} label="中止变基" onSelect={abortRebase} />
              </>
            )}
            {repoState === 'merge' && (
              <PaletteItem icon={<Undo2 />} label="中止合并" onSelect={abortMerge} />
            )}
            <PaletteItem icon={<Check />} label="清除仓库状态" onSelect={clearState} />
          </Command.Group>
        )}

        <Command.Group heading="仓库">
          <PaletteItem icon={<FolderOpen />} label="打开仓库…" onSelect={openRepository} />
          <PaletteItem
            icon={<GitBranchPlus />}
            label="克隆仓库…"
            onSelect={() => {
              close();
              openDialog('clone');
            }}
          />
          <PaletteItem
            icon={<Home />}
            label="返回仓库列表"
            onSelect={() => {
              close();
              navigate('/welcome');
            }}
          />
        </Command.Group>

        {worktrees.some((w) => !w.isCurrent && !w.isMissing) && (
          <Command.Group heading="切换工作树">
            {worktrees
              .filter((w) => !w.isCurrent && !w.isMissing)
              .map((w) => (
                <PaletteItem
                  key={w.path}
                  icon={<FolderTree />}
                  label={`${w.name}${w.branch ? ` · ${w.branch}` : ''}`}
                  onSelect={() => {
                    close();
                    void open(w.path).catch((error) =>
                      toast.error(`无法打开工作树：${(error as { message?: string }).message ?? error}`),
                    );
                  }}
                />
              ))}
          </Command.Group>
        )}

        {otherRepos.length > 0 && (
          <Command.Group heading="切换仓库">
            {otherRepos.map((recent) => (
              <PaletteItem
                key={recent.path}
                icon={<FolderGit2 />}
                label={recent.name}
                keys={repoShortcuts[recent.path] ? chordLabels(parseChordId(repoShortcuts[recent.path])!, isMac) : undefined}
                onSelect={() => {
                  close();
                  void open(recent.path).catch((error) =>
                    toast.error(`无法打开：${(error as { message?: string }).message ?? error}`),
                  );
                }}
              />
            ))}
          </Command.Group>
        )}

        <Command.Group heading="检出分支">
          {visibleBranches.map((branch) => (
            <PaletteItem
              key={branch.name}
              icon={<Check />}
              label={branch.name}
              onSelect={() =>
                run(`检出 ${branch.name}`, () =>
                  useUndo.getState().tracked({
                    path,
                    kind: 'checkout',
                    label: `检出 ${branch.name}`,
                    action: () => ipc.checkout(path, branch.name),
                  }),
                )
              }
            />
          ))}
        </Command.Group>

        <Command.Group heading="视图">
          <PaletteItem
            icon={<SquareTerminal />}
            label="切换终端"
            shortcut="`"
            onSelect={() => {
              close();
              toggleTerminal();
            }}
          />
          <PaletteItem
            icon={<PanelLeft />}
            label={sidebarOpen ? '隐藏侧边栏' : '显示侧边栏'}
            shortcut="B"
            onSelect={() => {
              close();
              toggleSidebar();
            }}
          />
          <PaletteItem
            icon={<ChevronsDownUp />}
            label="折叠侧边栏分区"
            onSelect={() => {
              close();
              useUi.getState().collapseSidebarSections(SIDEBAR_SECTIONS);
            }}
          />
          <PaletteItem
            icon={<ZoomIn />}
            label="放大"
            shortcut="+"
            onSelect={() => {
              close();
              zoomIn();
            }}
          />
          <PaletteItem
            icon={<ZoomOut />}
            label="缩小"
            shortcut="-"
            onSelect={() => {
              close();
              zoomOut();
            }}
          />
          <PaletteItem
            icon={themeBase(theme) === 'dark' ? <Sun /> : <Moon />}
            label={themeBase(theme) === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            onSelect={() => {
              close();
              setTheme(themeBase(theme) === 'dark' ? 'light' : 'dark');
            }}
          />
          <PaletteItem
            icon={<Settings />}
            label="设置"
            shortcut=","
            onSelect={() => {
              close();
              openDialog('settings');
            }}
          />
          <PaletteItem
            icon={<Keyboard />}
            label="Keyboard shortcut for this repository…"
            keys={repoShortcuts[path] ? chordLabels(parseChordId(repoShortcuts[path])!, isMac) : undefined}
            onSelect={() => {
              close();
              openDialog('repoShortcut', { repoPath: path });
            }}
          />
          <PaletteItem
            icon={<SquareTerminal />}
            label="Install command line tool"
            onSelect={() => {
              close();
              void installCliTool().catch((error) =>
                toast.error(
                  `Could not install: ${(error as { message?: string }).message ?? error}`,
                ),
              );
            }}
          />
          {repo && editor && (
            <PaletteItem
              icon={<Code />}
              label={`在 ${editor.label} 中打开仓库`}
              onSelect={() => {
                close();
                void openInEditor(editor.id, repo.path);
              }}
            />
          )}
          <PaletteItem
            icon={<Download />}
            label="检查更新"
            onSelect={() => {
              close();
              void import('@/features/updater/check').then(({ checkForUpdates }) =>
                checkForUpdates({ silent: false }),
              );
            }}
          />
        </Command.Group>
        </>
        )}
      </Command.List>
      <div className="flex items-center gap-4 border-t border-border-subtle px-3 py-1.5 text-[10px] text-faint">
        <span className="flex items-center gap-1">
          <Kbd>↑↓</Kbd> 移动
        </span>
        <span className="flex items-center gap-1">
          <Kbd>⏎</Kbd> 运行
        </span>
        <span className="flex items-center gap-1">
          <Kbd>esc</Kbd> {mode === 'commands' ? '关闭' : '返回'}
        </span>
      </div>
    </Command.Dialog>
  );
}

function PaletteItem({
  icon,
  label,
  shortcut,
  keys,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  keys?: string[];
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-default select-none items-center gap-2.5 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-surface-raised [&_svg]:size-4 [&_svg]:text-muted"
    >
      {icon}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="flex items-center gap-0.5">
          <Kbd>{modKey()}</Kbd>
          <Kbd>{shortcut}</Kbd>
        </span>
      )}
      {keys && (
        <span className="flex items-center gap-0.5">
          {keys.map((key, index) => (
            <Kbd key={index}>{key}</Kbd>
          ))}
        </span>
      )}
    </Command.Item>
  );
}
