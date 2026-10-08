import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { toastOutcome } from '@/shared/toastOutcome';
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Check,
  ChevronRight,
  ChevronsDownUp,
  Cloud,
  Copy,
  Eraser,
  Folder,
  FolderGit2,
  FolderOpen,
  FolderTree,
  GitBranch,
  FastForward,
  GitMerge,
  Globe,
  GitPullRequest,
  Home,
  MoveRight,
  ListRestart,
  Lock,
  MoreHorizontal,
  GitBranchPlus,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Tag as TagIcon,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Hint,
  Input,
  Logo,
  cn,
} from '@angkorgit/design-system';
import { ipc, openExternal } from '@/core/ipc';
import { confirmDialog } from '@/components/confirm';
import { EmptyCard } from '@/components/EmptyCard';
import { useRepo } from '@/features/repository/store';
import { useGraph } from '@/features/graph/store';
import { useUi } from '@/features/ui/store';
import { useUndo, type UndoKind } from '@/features/history/undoStore';
import { useForge } from '@/features/forge/store';
import { useSettings } from '@/features/settings/store';
import { forgeNoun, pullRequestCheckoutSpec, remoteWebUrl } from '@angkorgit/core';
import type { BranchInfo, PullRequestInfo, RemoteInfo, StashInfo, SubmoduleInfo, TagInfo, WorktreeInfo } from '@angkorgit/core';
import { capCount, isMac } from '@/shared/utils';
import { killTerminalSession } from '@/features/terminal/sessions';

interface BranchTreeNode {
  key: string;
  path: string;
  branch?: BranchInfo;
  children: BranchTreeNode[];
}

function buildBranchTree(branches: BranchInfo[]): BranchTreeNode[] {
  const root: BranchTreeNode = { key: '', path: '', children: [] };
  const folders = new Map<string, BranchTreeNode>([['', root]]);
  for (const branch of branches) {
    const segments = branch.name.split('/');
    let parentPath = '';
    for (let i = 0; i < segments.length - 1; i++) {
      const folderPath = parentPath ? `${parentPath}/${segments[i]}` : segments[i];
      if (!folders.has(folderPath)) {
        const node: BranchTreeNode = { key: segments[i], path: folderPath, children: [] };
        folders.get(parentPath)?.children.push(node);
        folders.set(folderPath, node);
      }
      parentPath = folderPath;
    }
    folders.get(parentPath)?.children.push({
      key: segments[segments.length - 1],
      path: branch.name,
      branch,
      children: [],
    });
  }
  const sortNodes = (nodes: BranchTreeNode[]) => {
    nodes.sort((a, b) => (a.branch ? 1 : 0) - (b.branch ? 1 : 0) || a.key.localeCompare(b.key));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root.children);
  return root.children;
}

function leafCount(node: BranchTreeNode): number {
  return node.branch ? 1 : node.children.reduce((sum, child) => sum + leafCount(child), 0);
}

function ancestorFolders(branchName: string): string[] {
  const segments = branchName.split('/');
  segments.pop();
  const paths: string[] = [];
  let acc = '';
  for (const segment of segments) {
    acc = acc ? `${acc}/${segment}` : segment;
    paths.push(acc);
  }
  return paths;
}

function HeadMark({ active }: { active: boolean }) {
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center">
      {active && <Check className="size-3.5" />}
    </span>
  );
}

const outcomeOk = (result: unknown) => {
  const status = (result as { status?: string } | undefined)?.status;
  return status === undefined || status === 'ok' || status === 'fast_forward';
};

const FLAT_FILTER_CAP = 300;


export const SIDEBAR_SECTIONS = [
  'branches',
  'worktrees',
  'pullRequests',
  'remotes',
  'tags',
  'stashes',
  'submodules',
] as const;

function Section({
  icon,
  title,
  count,
  children,
  open,
  onToggle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div
      data-sidebar-section
      className={cn('flex flex-col', open ? 'min-h-[5.5rem] shrink' : 'shrink-0')}
    >
      <div
        data-sidebar-section-header
        className="group flex w-full shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide text-foreground/80 hover:bg-surface-raised"
      >
        <button
          className="flex min-w-0 flex-1 items-center gap-2"
          aria-expanded={open}
          onClick={onToggle}
        >
          <ChevronRight className={cn('size-3.5 shrink-0 transition-transform duration-150', open && 'rotate-90')} />
          <span
            data-sidebar-section-icon
            className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/15 text-primary"
          >
            {icon}
          </span>
          <span className="min-w-0 flex-1 truncate text-left">{title}</span>
        </button>
        {action && (
          <span className="flex w-0 min-w-0 items-center overflow-hidden group-hover:w-auto group-focus-within:w-auto">
            {action}
          </span>
        )}
        <Badge
          tone="neutral"
          className="h-4 min-w-4 shrink-0 cursor-pointer justify-center border-transparent bg-foreground/[0.08] px-1.5 text-[10px] leading-none tabular-nums"
          onClick={onToggle}
        >
          {count}
        </Badge>
      </div>
      {open && (
        <div data-sidebar-section-body className="mt-0.5 min-h-0 flex-1 overflow-y-auto pb-1">
          {children}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const repo = useRepo((s) => s.repo);
  const branches = useRepo((s) => s.branches);
  const tags = useRepo((s) => s.tags);
  const stashes = useRepo((s) => s.stashes);
  const remotes = useRepo((s) => s.remotes);
  const submodules = useRepo((s) => s.submodules);
  const worktrees = useRepo((s) => s.worktrees);
  const status = useRepo((s) => s.status);
  const refresh = useRepo((s) => s.refresh);
  const repoRefreshing = useRepo((s) => s.refreshing);
  const graphReload = useGraph((s) => s.reload);
  const setFilters = useGraph((s) => s.setFilters);
  const filters = useGraph((s) => s.filters);
  const openDialog = useUi((s) => s.openDialog);
  const sidebarSections = useUi((s) => s.sidebarSections);
  const setSidebarSection = useUi((s) => s.setSidebarSection);
  const collapseEpoch = useUi((s) => s.sidebarCollapseEpoch);
  const sectionDefaults: Record<(typeof SIDEBAR_SECTIONS)[number], boolean> = {
    branches: true,
    worktrees: true,
    pullRequests: true,
    remotes: false,
    tags: false,
    stashes: stashes.length > 0,
    submodules: false,
  };
  const sectionOpen = (id: (typeof SIDEBAR_SECTIONS)[number]) => sidebarSections[id] ?? sectionDefaults[id];
  const section = (id: (typeof SIDEBAR_SECTIONS)[number]) => ({
    open: sectionOpen(id),
    onToggle: () => setSidebarSection(id, !sectionOpen(id)),
  });
  const [query, setQuery] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  useEffect(() => {
    const handle = window.setTimeout(() => setFilterQuery(query), 150);
    return () => window.clearTimeout(handle);
  }, [query]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropAction, setDropAction] = useState<{ source: string; target: string; canFf?: boolean } | null>(null);
  const [branchMenu, setBranchMenu] = useState<{ x: number; y: number; branch: BranchInfo } | null>(null);
  const [branchMenuFf, setBranchMenuFf] = useState<boolean | null>(null);
  const [subMenu, setSubMenu] = useState<{ x: number; y: number; sub: SubmoduleInfo } | null>(null);
  const [remoteMenu, setRemoteMenu] = useState<{ x: number; y: number; remote: RemoteInfo } | null>(null);
  const [worktreeMenu, setWorktreeMenu] = useState<{ x: number; y: number; worktree: WorktreeInfo } | null>(null);
  const [stashMenu, setStashMenu] = useState<{ x: number; y: number; stash: StashInfo } | null>(null);
  const [tagMenu, setTagMenu] = useState<{ x: number; y: number; tag: TagInfo } | null>(null);
  const [prMenu, setPrMenu] = useState<{ x: number; y: number; pr: PullRequestInfo } | null>(null);
  const [editRemote, setEditRemote] = useState<{ original: string | null; name: string; url: string } | null>(null);
  const [savingRemote, setSavingRemote] = useState(false);

  const openSubmodule = (sub: SubmoduleInfo) => {
    void useRepo
      .getState()
      .open(`${path}/${sub.path}`)
      .catch(() =>
        toast.error(
          `无法打开 ${sub.path}——子模块可能尚未初始化，请先对其执行“更新”。`,
        ),
      );
  };

  const path = repo?.path ?? '';

  const heldBy = useMemo(() => {
    const map = new Map<string, WorktreeInfo>();
    for (const wt of worktrees) if (wt.branch && !wt.isCurrent) map.set(wt.branch, wt);
    return map;
  }, [worktrees]);
  const worktreeDirty = (wt: WorktreeInfo) =>
    wt.isCurrent ? (status?.files.length ?? 0) > 0 : wt.isDirty === true;
  const openWorktree = (wt: WorktreeInfo) => {
    if (wt.isCurrent || wt.isMissing) return;
    void useRepo
      .getState()
      .open(wt.path)
      .catch((error) =>
        toast.error(`无法打开 ${wt.name}：${(error as { message?: string }).message ?? error}`),
      );
  };

  const refreshAll = async () => {
    await refresh();
    await graphReload(path);
  };

  const act = async (
    label: string,
    op: () => Promise<unknown>,
    undoable?: { kind: UndoKind; extra?: Record<string, string> },
  ) => {
    try {
      const result = undoable
        ? await useUndo.getState().tracked({
            path,
            kind: undoable.kind,
            label,
            extra: undoable.extra,
            action: op,
            shouldRecord: outcomeOk,
          })
        : await op();
      toastOutcome(result as { status?: string; message?: string } | undefined, `${label} 已完成`);
      await refreshAll();
    } catch (error) {
      toast.error(`${label} 失败：${(error as { message?: string }).message ?? error}`);
    }
  };

  const removeWorktree = async (wt: WorktreeInfo) => {
    if (wt.isMain) return;
    if (wt.isMissing) {
      await act(`忘记 ${wt.name}`, () => ipc.worktreeRemove(path, wt.name, false));
      return;
    }
    const dirty = worktreeDirty(wt);
    const branchNote = wt.branch ? ` 分支 ${wt.branch} 及其提交保留在仓库中。` : ' 提交保留在仓库中。';
    const ok = await confirmDialog({
      title: `移除工作树 "${wt.name}"?`,
      description: dirty
        ? `此文件夹有未提交的更改。移除它将删除该文件夹及其中的所有内容。${branchNote}`
        : `此文件夹已删除。${branchNote}`,
      path: wt.path,
      confirmLabel: dirty ? '删除更改并移除' : '移除工作树',
      destructive: true,
    });
    if (!ok) return;
    if (!wt.isCurrent) {
      await act(`移除工作树 ${wt.name}`, () => ipc.worktreeRemove(path, wt.name, dirty));
      return;
    }
    const main = worktrees.find((w) => w.isMain);
    if (!main) return;
    try {
      await useRepo.getState().open(main.path);
    } catch (error) {
      toast.error(`无法切换到 ${main.name}：${(error as { message?: string }).message ?? error}`);
      return;
    }
    useUi.getState().closeRepoTab(wt.path);
    killTerminalSession(wt.path);
    try {
      await ipc.worktreeRemove(main.path, wt.name, dirty);
      toast.success(`已移除工作树 ${wt.name}`);
      await useRepo.getState().refresh();
      await graphReload(main.path);
    } catch (error) {
      toast.error(`移除工作树失败：${(error as { message?: string }).message ?? error}`);
    }
  };

  const dropMerge = async (source: string, target: string, noFf: boolean) => {
    setDropAction(null);
    try {
      const info = await ipc.repoInfo(path);
      if (info.headBranch !== target) {
        await useUndo.getState().tracked({
          path,
          kind: 'checkout',
          label: `检出 ${target}`,
          action: () => ipc.checkout(path, target),
        });
      }
      await act(`将 ${source} 合并到 ${target}`, () => ipc.merge(path, source, noFf), { kind: 'merge' });
    } catch (error) {
      toast.error(`合并失败：${(error as { message?: string }).message ?? error}`);
    }
  };

  const dropRebase = async (source: string, target: string) => {
    setDropAction(null);
    try {
      const info = await ipc.repoInfo(path);
      if (info.headBranch !== source) {
        await useUndo.getState().tracked({
          path,
          kind: 'checkout',
          label: `检出 ${source}`,
          action: () => ipc.checkout(path, source),
        });
      }
      await act(`将 ${source} 变基到 ${target}`, () => ipc.rebase(path, target), { kind: 'rebase' });
    } catch (error) {
      toast.error(`变基失败：${(error as { message?: string }).message ?? error}`);
    }
  };

  const forgeRepoPath = useForge((s) => s.repoPath);
  const forgeRemote = useForge((s) => s.remote);
  const forgeRemoteName = useForge((s) => s.remoteName);
  const forgeAccount = useForge((s) => s.hasAccount);
  const forgePrs = useForge((s) => s.prs);
  const forgeLoading = useForge((s) => s.loading);
  const forgeError = useForge((s) => s.error);
  const forgeErrorDetail = useForge((s) => s.errorDetail);
  const forgeLoadedAt = useForge((s) => s.loadedAt);
  const showPullRequests = useSettings((s) => s.showPullRequests);

  const checkoutPullRequest = (pr: PullRequestInfo) => {
    const spec = forgeRemote ? pullRequestCheckoutSpec(forgeRemote.kind, pr) : null;
    if (!spec) {
      toast.error(
        `无法从 AngKorGit 检出此${forgeNoun(forgeRemote?.kind)}——请改在浏览器中打开。`,
      );
      return;
    }
    void act(
      `检出 #${pr.number}`,
      () =>
        ipc.prCheckout(path, forgeRemoteName ?? 'origin', spec.sourceRef, spec.localBranch, spec.track),
      { kind: 'checkout' },
    );
  };

  const q = filterQuery.trim().toLowerCase();
  const locals = useMemo(
    () => branches.filter((b) => !b.isRemote && (!q || b.name.toLowerCase().includes(q))),
    [branches, q],
  );
  const remoteBranches = useMemo(
    () => branches.filter((b) => b.isRemote && (!q || b.name.toLowerCase().includes(q))),
    [branches, q],
  );
  const filteredTags = useMemo(() => tags.filter((t) => !q || t.name.toLowerCase().includes(q)), [tags, q]);
  const filteredWorktrees = useMemo(
    () =>
      worktrees.filter(
        (w) => !q || w.name.toLowerCase().includes(q) || (w.branch ?? '').toLowerCase().includes(q),
      ),
    [worktrees, q],
  );
  const filteredPrs = useMemo(
    () =>
      forgePrs.filter(
        (pr) =>
          !q ||
          pr.title.toLowerCase().includes(q) ||
          pr.sourceBranch.toLowerCase().includes(q) ||
          `#${pr.number}`.includes(q),
      ),
    [forgePrs, q],
  );

  const localTree = useMemo(() => buildBranchTree(locals), [locals]);
  const remoteTree = useMemo(() => buildBranchTree(remoteBranches), [remoteBranches]);

  const noFilterMatches =
    q !== '' &&
    locals.length === 0 &&
    remoteBranches.length === 0 &&
    filteredTags.length === 0 &&
    stashes.length === 0;
  const hasRemoteBranches = branches.some((b) => b.isRemote);

  const submitEditRemote = async () => {
    const edit = editRemote;
    if (!edit || !edit.name.trim() || !edit.url.trim() || savingRemote) return;
    setSavingRemote(true);
    const original = edit.original;
    if (original === null) {
      const name = edit.name.trim();
      await act(`添加远端 ${name}`, async () => {
        await ipc.remoteAdd(path, name, edit.url);
        return ipc.fetch(path, name, true, false);
      });
    } else {
      await act(`更新远端 ${original}`, () => ipc.remoteEdit(path, original, edit.name, edit.url));
    }
    setSavingRemote(false);
    setEditRemote(null);
  };
  const openAddRemote = () => setEditRemote({ original: null, name: remotes.length === 0 ? 'origin' : '', url: '' });

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  useEffect(() => {
    const head = branches.find((b) => b.isHead);
    if (!head) return;
    const paths = ancestorFolders(head.name);
    if (paths.length > 0) {
      setExpandedFolders((prev) =>
        paths.every((p) => prev.has(p)) ? prev : new Set([...prev, ...paths]),
      );
    }
  }, [branches]);
  useEffect(() => {
    if (collapseEpoch > 0) setExpandedFolders(new Set());
  }, [collapseEpoch]);
  const anySectionOpen = SIDEBAR_SECTIONS.some(sectionOpen);
  const showPullRequestSection = Boolean(forgeRemote && showPullRequests && forgeRepoPath === repo?.path);
  const visibleSections: (typeof SIDEBAR_SECTIONS)[number][] = [
    'branches',
    'worktrees',
    ...(showPullRequestSection ? (['pullRequests'] as const) : []),
    'remotes',
    'tags',
    'stashes',
    ...(submodules.length > 0 ? (['submodules'] as const) : []),
  ];
  const lastOpenSection = [...visibleSections].reverse().find(sectionOpen) ?? null;
  const spacerAfter = (id: (typeof SIDEBAR_SECTIONS)[number]) =>
    lastOpenSection === id ? <div key={`spacer:${id}`} className="min-h-0 flex-1" /> : null;
  const collapseAll = () => {
    useUi.getState().collapseSidebarSections(SIDEBAR_SECTIONS);
    setExpandedFolders(new Set());
  };
  const toggleFolder = (folderPath: string) =>
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });

  const branchMenuSource = branchMenu?.branch.isHead ? null : (branchMenu?.branch.name ?? null);
  useEffect(() => {
    setBranchMenuFf(null);
    if (!branchMenuSource) return;
    const head = useRepo.getState().repo?.headBranch;
    if (!head) {
      setBranchMenuFf(false);
      return;
    }
    let cancelled = false;
    void ipc
      .mergeCanFastForward(path, head, branchMenuSource)
      .then((ok) => !cancelled && setBranchMenuFf(ok))
      .catch(() => !cancelled && setBranchMenuFf(false));
    return () => {
      cancelled = true;
    };
  }, [path, branchMenuSource]);

  if (!repo) return null;

  const branchMenuLocalName = branchMenu
    ? branchMenu.branch.isRemote
      ? branchMenu.branch.name.split('/').slice(1).join('/')
      : branchMenu.branch.name
    : '';
  const branchMenuHeld = branchMenu ? heldBy.get(branchMenuLocalName) : undefined;

  const renderWorktree = (wt: WorktreeInfo) => {
    const dirty = worktreeDirty(wt);
    const subtitle = wt.isMissing
      ? '文件夹缺失'
      : wt.isDetached
        ? `游离于 ${wt.headOid?.slice(0, 8) ?? '?'}`
        : wt.branch ?? '无分支';
    return (
      <div
        key={wt.path}
        role="button"
        tabIndex={0}
        onClick={() => openWorktree(wt)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') openWorktree(wt);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setWorktreeMenu({ x: e.clientX, y: e.clientY, worktree: wt });
        }}
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 py-1 pl-7 text-sm hover:bg-surface-raised',
          wt.isCurrent ? 'cursor-default text-primary' : wt.isMissing ? 'cursor-default text-muted' : 'cursor-pointer',
        )}
        title={
          wt.isMissing
            ? `${wt.path} — 此文件夹已不存在`
            : wt.isCurrent
              ? `${wt.path} — 在此标签页中打开`
              : `${wt.path} — 点击切换到该工作树`
        }
      >
        <HeadMark active={wt.isCurrent} />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate">{wt.name}</span>
            {wt.isMain && <Home className="size-3 shrink-0 text-faint" aria-label="主工作树" />}
            {wt.isLocked && <Lock className="size-3 shrink-0 text-faint" aria-label="已锁定" />}
            {wt.isMissing ? (
              <AlertTriangle className="size-3 shrink-0 text-danger" aria-label="文件夹缺失" />
            ) : dirty ? (
              <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="未提交的更改" />
            ) : null}
          </span>
          <span className="truncate font-mono text-[10px] text-faint">{subtitle}</span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`工作树 ${wt.name} 的操作`}
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setWorktreeMenu({ x: rect.left, y: rect.bottom + 4, worktree: wt });
          }}
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </div>
    );
  };

  const renderLocalBranch = (branch: BranchInfo, label: string, depth: number) => (
    <div
      key={branch.name}
      draggable
      onDragStart={(e) => {
        setDragging(branch.name);
        e.dataTransfer.setData('text/angkorgit-branch', branch.name);
        e.dataTransfer.effectAllowed = 'link';
      }}
      onDragEnd={() => {
        setDragging(null);
        setDropTarget(null);
      }}
      onDragOver={(e) => {
        const source = dragging;
        if (source && source !== branch.name) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'link';
          setDropTarget((t) => (t === branch.name ? t : branch.name));
        }
      }}
      onDragLeave={() => setDropTarget((t) => (t === branch.name ? null : t))}
      onDrop={(e) => {
        e.preventDefault();
        const source = e.dataTransfer.getData('text/angkorgit-branch');
        setDropTarget(null);
        setDragging(null);
        if (source && source !== branch.name) {
          const target = branch.name;
          setDropAction({ source, target });
          void ipc
            .mergeCanFastForward(path, target, source)
            .then((canFf) => {
              setDropAction((cur) =>
                cur && cur.source === source && cur.target === target ? { ...cur, canFf } : cur,
              );
            })
            .catch(() => undefined);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setBranchMenu({ x: e.clientX, y: e.clientY, branch });
      }}
      style={{ paddingLeft: 28 + depth * 14 }}
      className={cn(
        'group relative flex cursor-grab items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-raised active:cursor-grabbing',
        filters.branch === branch.name && 'bg-surface-raised',
        branch.isHead &&
          'font-medium text-primary before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-primary',
        branch.isHead &&
          (filters.branch === branch.name
            ? 'bg-primary/20 hover:bg-primary/25'
            : 'bg-primary/10 hover:bg-primary/15'),
        dragging === branch.name && 'opacity-40',
        dropTarget === branch.name && 'bg-primary/10 ring-1 ring-inset ring-primary/60',
      )}
      title={`${branch.name} — 拖到另一个分支上以合并或变基`}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onDoubleClick={() => {
          const held = heldBy.get(branch.name);
          if (held) openWorktree(held);
          else void act(`检出 ${branch.name}`, () => ipc.checkout(path, branch.name), { kind: 'checkout' });
        }}
        onClick={() => setFilters(path, { branch: filters.branch === branch.name ? '' : branch.name })}
        title={
          heldBy.has(branch.name)
            ? `${branch.name} — 已在工作树 ${heldBy.get(branch.name)?.name} 中检出；双击切换到那里`
            : `${branch.name} — 点击筛选提交图，双击检出`
        }
      >
        <HeadMark active={branch.isHead} />
        <span className="min-w-0 truncate">{label}</span>
        {heldBy.has(branch.name) && (
          <FolderTree
            className="size-3 shrink-0 text-faint"
            aria-label={`已在工作树 ${heldBy.get(branch.name)?.name} 中检出`}
          />
        )}
        {branch.ahead > 0 && <Badge tone="primary">↑{capCount(branch.ahead)}</Badge>}
        {branch.behind > 0 && <Badge tone="info">↓{capCount(branch.behind)}</Badge>}
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={`分支 ${branch.name} 的操作`}
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setBranchMenu({ x: rect.left, y: rect.bottom + 4, branch });
        }}
      >
        <MoreHorizontal className="size-3.5" />
      </Button>
    </div>
  );

  const renderRemoteBranch = (branch: BranchInfo, label: string, depth: number) => (
    <div
      key={branch.name}
      draggable
      onDragStart={(e) => {
        setDragging(branch.name);
        e.dataTransfer.setData('text/angkorgit-branch', branch.name);
        e.dataTransfer.effectAllowed = 'link';
      }}
      onDragEnd={() => {
        setDragging(null);
        setDropTarget(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setBranchMenu({ x: e.clientX, y: e.clientY, branch });
      }}
      style={{ paddingLeft: 28 + depth * 14 }}
      className={cn(
        'group flex cursor-grab items-center gap-2 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-raised active:cursor-grabbing',
        dragging === branch.name && 'opacity-40',
      )}
      title={`${branch.name} — 拖到本地分支上进行合并或变基`}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onDoubleClick={() => void act(`Checkout ${branch.name}`, () => ipc.checkout(path, branch.name), { kind: 'checkout' })}
        title={`${branch.name} — double-click to check out ${branch.name.split('/').slice(1).join('/')} from it (fast-forwards the local branch when it is behind)`}
      >
        <HeadMark active={false} />
        <span className="min-w-0 truncate">{label}</span>
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={`分支 ${branch.name} 的操作`}
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setBranchMenu({ x: rect.left, y: rect.bottom + 4, branch });
        }}
      >
        <MoreHorizontal className="size-3.5" />
      </Button>
    </div>
  );

  const renderTree = (nodes: BranchTreeNode[], depth: number, kind: 'local' | 'remote'): React.ReactNode =>
    nodes.map((node) => {
      if (node.branch) {
        return kind === 'local'
          ? renderLocalBranch(node.branch, node.key, depth)
          : renderRemoteBranch(node.branch, node.key, depth);
      }
      const expanded = expandedFolders.has(node.path);
      const remote = kind === 'remote' && depth === 0 ? remotes.find((r) => r.name === node.key) : undefined;
      return (
        <div key={`folder:${node.path}`}>
          <div
            className="group flex items-center rounded-md hover:bg-surface-raised"
            onContextMenu={
              remote
                ? (e) => {
                    e.preventDefault();
                    setRemoteMenu({ x: e.clientX, y: e.clientY, remote });
                  }
                : undefined
            }
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted"
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={() => toggleFolder(node.path)}
              title={remote ? `${remote.name} — ${remote.url}` : node.path}
            >
              <ChevronRight
                className={cn('size-3.5 shrink-0 text-faint transition-transform duration-150', expanded && 'rotate-90')}
              />
              {remote ? (
                <Cloud className={cn('size-3.5 shrink-0', expanded ? 'text-primary/70' : 'text-faint')} />
              ) : expanded ? (
                <FolderOpen className="size-3.5 shrink-0 text-primary/70" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-faint" />
              )}
              <span className="min-w-0 truncate">{node.key}</span>
              <span className="text-[10px] text-faint">{leafCount(node)}</span>
            </button>
            {remote && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="mr-0.5 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={`远端 ${remote.name} 的操作`}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setRemoteMenu({ x: rect.left, y: rect.bottom + 4, remote });
                }}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            )}
          </div>
          {expanded && renderTree(node.children, depth + 1, kind)}
        </div>
      );
    });

  const renderBranchlessRemote = (remote: RemoteInfo) => (
    <div
      key={`remote:${remote.name}`}
      className="group flex items-center rounded-md hover:bg-surface-raised"
      onContextMenu={(e) => {
        e.preventDefault();
        setRemoteMenu({ x: e.clientX, y: e.clientY, remote });
      }}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-sm text-muted"
        style={{ paddingLeft: 10 }}
        title={`${remote.name} — ${remote.url} （尚未拉取任何分支）`}
      >
        <span className="size-3.5 shrink-0" />
        <Cloud className="size-3.5 shrink-0 text-faint" />
        <span className="min-w-0 truncate">{remote.name}</span>
        <span className="text-[10px] text-faint">0</span>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="mr-0.5 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={`远端 ${remote.name} 的操作`}
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setRemoteMenu({ x: rect.left, y: rect.bottom + 4, remote });
        }}
      >
        <MoreHorizontal className="size-3.5" />
      </Button>
    </div>
  );

  return (
    <aside className="flex h-full flex-col bg-surface" aria-label="分支与引用">
      <div className="flex items-center gap-1 p-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="过滤引用…"
            className="h-7 border-transparent bg-surface-raised pl-8 text-xs"
          />
        </div>
        <Hint label="折叠全部分区">
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-faint hover:text-foreground"
            aria-label="折叠全部分区"
            disabled={!anySectionOpen && expandedFolders.size === 0}
            onClick={collapseAll}
          >
            <ChevronsDownUp className="size-3.5" />
          </Button>
        </Hint>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        <Section
          {...section('branches')}
          icon={<GitBranch className="size-3.5" />}
          title="分支"
          count={locals.length}
          action={
            <Hint label="新建分支">
              <Button variant="ghost" size="icon-sm" aria-label="新建分支" onClick={() => openDialog('createBranch')}>
                <Plus className="size-3.5" />
              </Button>
            </Hint>
          }
        >
          {repoRefreshing && locals.length === 0 && (
            <div className="flex flex-col gap-1.5 py-1 pl-7 pr-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-surface-raised" />
              ))}
            </div>
          )}
          {q
            ? locals.slice(0, FLAT_FILTER_CAP).map((branch) => renderLocalBranch(branch, branch.name, 0))
            : renderTree(localTree, 0, 'local')}
          {q && locals.length > FLAT_FILTER_CAP && (
            <div className="px-2 py-1 pl-7 text-xs text-faint">+{locals.length - FLAT_FILTER_CAP} more…</div>
          )}
          {noFilterMatches && <div className="px-2 py-1 pl-7 text-xs text-faint">没有匹配过滤条件的引用。</div>}
        </Section>
        {spacerAfter('branches')}

        <Section
          {...section('worktrees')}
          icon={<FolderTree className="size-3.5" />}
          title="工作树"
          count={worktrees.length}
          action={
            <span className="flex items-center">
              {worktrees.some((w) => w.isMissing) && (
                <Hint label="遗忘文件夹已消失的工作树">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="清理缺失的工作树"
                    onClick={() => void act('清理工作树', () => ipc.worktreePrune(path))}
                  >
                    <Eraser className="size-3.5" />
                  </Button>
                </Hint>
              )}
              <Hint label="新建工作树">
                <Button variant="ghost" size="icon-sm" aria-label="新建工作树" onClick={() => openDialog('createWorktree')}>
                  <Plus className="size-3.5" />
                </Button>
              </Hint>
            </span>
          }
        >
          {repoRefreshing && worktrees.length === 0 && (
            <div className="flex flex-col gap-1.5 py-1 pl-7 pr-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-surface-raised" />
              ))}
            </div>
          )}
          {!repoRefreshing && worktrees.length <= 1 && (
            <EmptyCard
              icon={<FolderTree />}
              title="两个分支，两个文件夹"
              description="在现有工作之外修缺陷或运行代理，无需暂存。"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center"
                  onClick={() => openDialog('createWorktree')}
                >
                  <Plus className="size-3.5" /> 新建工作树
                </Button>
              }
            />
          )}
          {worktrees.length > 1 && filteredWorktrees.map(renderWorktree)}
          {worktrees.length > 1 && q && filteredWorktrees.length === 0 && (
            <div className="px-2 py-1 pl-7 text-xs text-faint">没有匹配过滤条件的工作树。</div>
          )}
        </Section>
        {spacerAfter('worktrees')}

        {showPullRequestSection && forgeRemote && (
          <>
          <Section
            {...section('pullRequests')}
            icon={<GitPullRequest className="size-3.5" />}
            title={forgeNoun(forgeRemote.kind, { plural: true, capitalize: true })}
            count={filteredPrs.length}
            action={
              <span className="flex items-center">
                <Hint label="刷新拉取请求">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="刷新拉取请求"
                    onClick={() => void useForge.getState().load(true)}
                  >
                    <RefreshCw className={cn('size-3.5', forgeLoading && 'animate-spin')} />
                  </Button>
                </Hint>
                <Hint label="创建拉取请求">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="创建拉取请求"
                    onClick={() => openDialog('createPullRequest')}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </Hint>
              </span>
            }
          >
            {!forgeAccount && forgeLoadedAt !== null && (
              <button
                className="w-full rounded-md px-2 py-1 pl-7 text-left text-xs text-muted [overflow-wrap:anywhere] hover:bg-surface-raised"
                onClick={() => openDialog('settings')}
              >
                Connect a {forgeRemote.host} account in Settings → Authentication to see{' '}
                {forgeNoun(forgeRemote.kind, { plural: true })}.
              </button>
            )}
            {forgeAccount && forgeError && (
              <button
                className="w-full rounded-md px-2 py-1 pl-7 text-left text-xs text-muted [overflow-wrap:anywhere] hover:bg-surface-raised"
                title={forgeErrorDetail ?? forgeError}
                onClick={() => void useForge.getState().load(true)}
              >
                {forgeError}
                <span className="mt-0.5 block text-primary">点击重试</span>
              </button>
            )}
            {forgeAccount && !forgeError && filteredPrs.length === 0 && !forgeLoading && (
              <div className="px-2 py-1 pl-7 text-xs text-faint">
                No open {forgeNoun(forgeRemote.kind, { plural: true })}
              </div>
            )}
            {forgeLoading && filteredPrs.length === 0 && (
              <div className="flex items-center gap-2 px-2 py-1 pl-7 text-xs text-faint">
                <Logo size={14} animated="loop" className="logo-draw-loop shrink-0" />
                Loading…
              </div>
            )}
            {filteredPrs.map((pr) => (
              <div
                key={pr.number}
                className="group flex items-center gap-2 rounded-md px-2 py-1 pl-7 text-sm hover:bg-surface-raised"
                title={`#${pr.number} ${pr.title} — ${pr.author} 想要将 ${pr.sourceBranch} 合并到 ${pr.targetBranch}。双击检出，右键查看更多操作。`}
                onDoubleClick={() => checkoutPullRequest(pr)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setPrMenu({ x: e.clientX, y: e.clientY, pr });
                }}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-faint">#{pr.number}</span> {pr.title}
                </span>
                {pr.isDraft && <Badge>草稿</Badge>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={`拉取请求 #${pr.number} 的操作`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setPrMenu({ x: rect.left, y: rect.bottom + 4, pr });
                  }}
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </div>
            ))}
          </Section>
          {spacerAfter('pullRequests')}
          </>
        )}

        <Section
          {...section('remotes')}
          icon={<Cloud className="size-3.5" />}
          title="远端"
          count={remoteBranches.length}
          action={
            <Hint label="添加远端">
              <Button variant="ghost" size="icon-sm" aria-label="添加远端" onClick={openAddRemote}>
                <Plus className="size-3.5" />
              </Button>
            </Hint>
          }
        >
          {remotes.length === 0 && !hasRemoteBranches && !repoRefreshing && (
            <EmptyCard
              icon={<Cloud />}
              title="无远端"
              description="此仓库只存在于本机。添加远端即可推送、拉取并打开拉取请求。"
              action={
                <Button variant="secondary" size="sm" className="w-full justify-center" onClick={openAddRemote}>
                  <Plus className="size-3.5" /> 添加远端
                </Button>
              }
            />
          )}
          {q
            ? remoteBranches.slice(0, FLAT_FILTER_CAP).map((branch) => renderRemoteBranch(branch, branch.name, 0))
            : renderTree(remoteTree, 0, 'remote')}
          {q && remoteBranches.length > FLAT_FILTER_CAP && (
            <div className="px-2 py-1 pl-7 text-xs text-faint">+{remoteBranches.length - FLAT_FILTER_CAP} more…</div>
          )}
          {!q &&
            remotes
              .filter((r) => !remoteTree.some((node) => !node.branch && node.key === r.name))
              .map(renderBranchlessRemote)}
        </Section>
        {spacerAfter('remotes')}

        <Section
          icon={<TagIcon className="size-3.5" />}
          title="标签"
          count={filteredTags.length}
          {...section('tags')}
          action={
            <Hint label="新建标签">
              <Button variant="ghost" size="icon-sm" aria-label="新建标签" onClick={() => openDialog('createTag')}>
                <Plus className="size-3.5" />
              </Button>
            </Hint>
          }
        >
          {tags.length === 0 && !repoRefreshing && (
            <EmptyCard
              icon={<TagIcon />}
              title="还没有标签"
              description="标记发布与里程碑，让它们在提交图中脱颖而出。"
              action={
                <Button variant="secondary" size="sm" className="w-full justify-center" onClick={() => openDialog('createTag')}>
                  <Plus className="size-3.5" /> 新建标签
                </Button>
              }
            />
          )}
          {filteredTags.map((tag) => (
            <div
              key={tag.name}
              className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 pl-7 text-sm hover:bg-surface-raised"
              onClick={() => useGraph.getState().select(tag.targetOid)}
              onContextMenu={(e) => {
                e.preventDefault();
                setTagMenu({ x: e.clientX, y: e.clientY, tag });
              }}
            >
              <span
                className="min-w-0 flex-1 truncate"
                title={`${tag.message ?? tag.name} — 点击显示该提交，右键查看更多操作`}
              >
                {tag.name}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={`标签 ${tag.name} 的操作`}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTagMenu({ x: rect.left, y: rect.bottom + 4, tag });
                }}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </div>
          ))}
        </Section>
        {spacerAfter('tags')}

        <Section
          icon={<Archive className="size-3.5" />}
          title="暂存列表"
          count={stashes.length}
          {...section('stashes')}
          action={
            <Hint label="新建暂存">
              <Button variant="ghost" size="icon-sm" aria-label="新建暂存" onClick={() => openDialog('createStash')}>
                <Plus className="size-3.5" />
              </Button>
            </Hint>
          }
        >
          {stashes.length === 0 && !repoRefreshing && (
            <EmptyCard
              icon={<Archive />}
              title="没有暂存内容"
              description="将更改暂放一边而不提交，稍后再取回。"
              action={
                <Button variant="secondary" size="sm" className="w-full justify-center" onClick={() => openDialog('createStash')}>
                  <Plus className="size-3.5" /> 暂存更改
                </Button>
              }
            />
          )}
          {stashes.map((stash) => (
            <div
              key={stash.oid}
              className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 pl-7 text-sm hover:bg-surface-raised"
              onClick={() => useGraph.getState().select(stash.oid)}
              onContextMenu={(e) => {
                e.preventDefault();
                setStashMenu({ x: e.clientX, y: e.clientY, stash });
              }}
            >
              <span className="min-w-0 flex-1 truncate" title={`${stash.message} — 点击预览，右键查看更多操作`}>
                {stash.message}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="暂存操作"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setStashMenu({ x: rect.left, y: rect.bottom + 4, stash });
                }}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </div>
          ))}
        </Section>
        {spacerAfter('stashes')}

        {submodules.length > 0 && (
          <>
          <Section {...section('submodules')} icon={<Boxes className="size-3.5" />} title="子模块" count={submodules.length}>
            {submodules.map((sub) => (
              <div
                key={sub.name}
                className="group flex cursor-default items-center gap-2 rounded-md px-2 py-1 pl-7 text-sm text-muted hover:bg-surface-raised"
                title={sub.url ?? sub.path}
                onDoubleClick={() => openSubmodule(sub)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSubMenu({ x: e.clientX, y: e.clientY, sub });
                }}
              >
                <span className="min-w-0 flex-1 truncate">{sub.path}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={`子模块 ${sub.name} 的操作`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setSubMenu({ x: rect.left, y: rect.bottom + 4, sub });
                  }}
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </div>
            ))}
          </Section>
          {spacerAfter('submodules')}
          </>
        )}
      </div>

      {subMenu && (
        <DropdownMenu open onOpenChange={(o) => !o && setSubMenu(null)}>
          <DropdownMenuTrigger asChild>
            <span style={{ position: 'fixed', left: subMenu.x, top: subMenu.y }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom">
            <DropdownMenuLabel className="max-w-64 truncate font-mono">{subMenu.sub.path}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => openSubmodule(subMenu.sub)}>
              <FolderGit2 /> 作为仓库打开
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const sub = subMenu.sub;
                void act(`更新 ${sub.name}`, () => ipc.submoduleUpdate(path, sub.name));
              }}
            >
              <ListRestart /> Update (checkout recorded commit)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard.writeText(`${path}/${subMenu.sub.path}`);
                toast.success('路径已复制');
              }}
            >
              <Copy /> 复制路径
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {prMenu && (
        <DropdownMenu open onOpenChange={(o) => !o && setPrMenu(null)}>
          <DropdownMenuTrigger asChild>
            <span style={{ position: 'fixed', left: prMenu.x, top: prMenu.y }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom">
            <DropdownMenuLabel className="max-w-64 truncate">
              #{prMenu.pr.number} {prMenu.pr.title}
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => checkoutPullRequest(prMenu.pr)}>
              <Check /> Checkout
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void openExternal(prMenu.pr.url)}>
              <Cloud /> 在浏览器中打开
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard.writeText(prMenu.pr.url);
                toast.success('URL 已复制');
              }}
            >
              <Copy /> 复制 URL
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {tagMenu && (
        <DropdownMenu open onOpenChange={(o) => !o && setTagMenu(null)}>
          <DropdownMenuTrigger asChild>
            <span style={{ position: 'fixed', left: tagMenu.x, top: tagMenu.y }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom">
            <DropdownMenuLabel className="max-w-64 truncate font-mono">{tagMenu.tag.name}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                const tag = tagMenu.tag;
                void act(`检出 ${tag.name}`, () => ipc.checkoutDetached(path, tag.name), { kind: 'checkout' });
              }}
            >
              <Check /> Checkout (detached)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const tag = tagMenu.tag;
                void act(`推送标签 ${tag.name}`, () => ipc.pushTag(path, remotes[0]?.name ?? 'origin', tag.name));
              }}
            >
              <Cloud /> Push to remote
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onClick={() => {
                const tag = tagMenu.tag;
                void act(`删除标签 ${tag.name}`, () => ipc.tagDelete(path, tag.name));
              }}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {stashMenu && (
        <DropdownMenu open onOpenChange={(o) => !o && setStashMenu(null)}>
          <DropdownMenuTrigger asChild>
            <span style={{ position: 'fixed', left: stashMenu.x, top: stashMenu.y }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom">
            <DropdownMenuLabel className="max-w-72 truncate">{stashMenu.stash.message}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                const stash = stashMenu.stash;
                void act('应用暂存', () => ipc.stashApply(path, stash.index));
              }}
            >
              <Play /> Apply
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const stash = stashMenu.stash;
                void act('弹出暂存', () => ipc.stashPop(path, stash.index));
              }}
            >
              <Undo2 /> Pop
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onClick={() => {
                const stash = stashMenu.stash;
                void act('丢弃暂存', () => ipc.stashDrop(path, stash.index));
              }}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {worktreeMenu && (
        <DropdownMenu open onOpenChange={(o) => !o && setWorktreeMenu(null)}>
          <DropdownMenuTrigger asChild>
            <span style={{ position: 'fixed', left: worktreeMenu.x, top: worktreeMenu.y }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom">
            <DropdownMenuLabel className="max-w-72 truncate font-mono">{worktreeMenu.worktree.path}</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={worktreeMenu.worktree.isCurrent || worktreeMenu.worktree.isMissing}
              onClick={() => openWorktree(worktreeMenu.worktree)}
            >
              <FolderTree /> {worktreeMenu.worktree.isCurrent ? '在此标签页中打开' : '切换到该工作树'}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={worktreeMenu.worktree.isMissing}
              onClick={() => void ipc.revealPath(worktreeMenu.worktree.path)}
            >
              <FolderOpen /> {isMac ? '在 Finder 中显示' : '在文件管理器中显示'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard.writeText(worktreeMenu.worktree.path);
                toast.success('路径已复制');
              }}
            >
              <Copy /> 复制路径
            </DropdownMenuItem>
            {!worktreeMenu.worktree.isMain && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onClick={() => void removeWorktree(worktreeMenu.worktree)}>
                  {worktreeMenu.worktree.isMissing ? (
                    <>
                      <Eraser /> Forget missing worktree
                    </>
                  ) : (
                    <>
                      <Trash2 /> 移除工作树…
                    </>
                  )}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {remoteMenu && (
        <DropdownMenu open onOpenChange={(o) => !o && setRemoteMenu(null)}>
          <DropdownMenuTrigger asChild>
            <span style={{ position: 'fixed', left: remoteMenu.x, top: remoteMenu.y }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom">
            <DropdownMenuLabel className="max-w-64 truncate font-mono">{remoteMenu.remote.name}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                const r = remoteMenu.remote;
                void act(`获取 ${r.name}`, () => ipc.fetch(path, r.name, true, true));
              }}
            >
              <ArrowDownToLine /> Fetch {remoteMenu.remote.name}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={remoteWebUrl(remoteMenu.remote.url) === null}
              onClick={() => {
                const url = remoteWebUrl(remoteMenu.remote.url);
                if (url) void openExternal(url);
              }}
            >
              <Globe /> 在浏览器中打开
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const r = remoteMenu.remote;
                setEditRemote({ original: r.name, name: r.name, url: r.url });
              }}
            >
              <Pencil /> 编辑远端…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onClick={() => {
                const r = remoteMenu.remote;
                void confirmDialog({
                  title: `移除远端 "${r.name}"?`,
                  description:
                    '该远端及其远端跟踪分支将从本仓库移除，服务器上的内容不会被删除。',
                  confirmLabel: '移除远端',
                  destructive: true,
                }).then((ok) => {
                  if (ok) void act(`移除 ${r.name}`, () => ipc.remoteRemove(path, r.name));
                });
              }}
            >
              <Trash2 /> 移除远端…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={editRemote !== null} onOpenChange={(o) => !o && setEditRemote(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editRemote?.original === null ? '添加远端' : '编辑远端'}</DialogTitle>
            <DialogDescription>
              {editRemote?.original === null
                ? '输入远端名称与 URL。添加后会立即获取远端信息，并在此显示其分支。'
                : '重命名远端或修改其 URL。'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              名称
              <Input
                value={editRemote?.name ?? ''}
                onChange={(e) => setEditRemote((s) => (s ? { ...s, name: e.target.value } : s))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitEditRemote();
                }}
                placeholder={remotes.length === 0 ? 'origin' : 'upstream'}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              URL
              <Input
                value={editRemote?.url ?? ''}
                onChange={(e) => setEditRemote((s) => (s ? { ...s, url: e.target.value } : s))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitEditRemote();
                }}
                placeholder="https://github.com/user/repo.git"
                className="font-mono"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditRemote(null)}>
              取消
            </Button>
            <Button
              disabled={savingRemote || !editRemote?.name.trim() || !editRemote?.url.trim()}
              onClick={() => void submitEditRemote()}
            >
              {editRemote?.original === null ? '添加远端' : '保存更改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {branchMenu && (
        <DropdownMenu open onOpenChange={(o) => !o && setBranchMenu(null)}>
          <DropdownMenuTrigger asChild>
            <span style={{ position: 'fixed', left: branchMenu.x, top: branchMenu.y }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom">
            <DropdownMenuLabel className="max-w-64 truncate font-mono">{branchMenu.branch.name}</DropdownMenuLabel>
            {branchMenuHeld ? (
              <DropdownMenuItem onClick={() => openWorktree(branchMenuHeld)}>
                <FolderTree /> Switch to worktree {branchMenuHeld.name}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={branchMenu.branch.isHead}
                onClick={() =>
                  void act(`检出 ${branchMenu.branch.name}`, () => ipc.checkout(path, branchMenu.branch.name), {
                    kind: 'checkout',
                  })
                }
              >
                <Check /> Checkout
              </DropdownMenuItem>
            )}
            {!branchMenu.branch.isHead && !branchMenuHeld && (
              <DropdownMenuItem onClick={() => openDialog('createWorktree', { branch: branchMenu.branch.name })}>
                <FolderTree /> 在新工作树中打开…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={branchMenu.branch.isHead}
              onClick={() =>
                void act(`合并 ${branchMenu.branch.name}`, () => ipc.merge(path, branchMenu.branch.name, true), {
                  kind: 'merge',
                })
              }
            >
              <GitMerge /> 合并到当前分支
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={branchMenu.branch.isHead || branchMenuFf !== true}
              onClick={() =>
                void act(`Fast-forward to ${branchMenu.branch.name}`, () => ipc.merge(path, branchMenu.branch.name, false), {
                  kind: 'merge',
                })
              }
            >
              <FastForward /> 将当前分支快进到此处
            </DropdownMenuItem>
            {!branchMenu.branch.isRemote && (
              <DropdownMenuItem
                disabled={branchMenu.branch.isHead}
                onClick={() =>
                  void act(`变基到 ${branchMenu.branch.name}`, () => ipc.rebase(path, branchMenu.branch.name), {
                    kind: 'rebase',
                  })
                }
              >
                <ListRestart /> Rebase current onto this
              </DropdownMenuItem>
            )}
            {!branchMenu.branch.isRemote && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!branchMenu.branch.upstream}
                  onClick={() =>
                    void act(`拉取 ${branchMenu.branch.name}`, () => ipc.pullBranch(path, branchMenu.branch.name))
                  }
                >
                  <ArrowDownToLine /> Pull
                  {branchMenu.branch.behind > 0 && <Badge tone="info">↓{capCount(branchMenu.branch.behind)}</Badge>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void act(`推送 ${branchMenu.branch.name}`, () =>
                      ipc.push(path, remotes[0]?.name ?? 'origin', false, false, true, branchMenu.branch.name),
                    )
                  }
                >
                  <ArrowUpFromLine /> Push
                  {branchMenu.branch.ahead > 0 && <Badge tone="primary">↑{capCount(branchMenu.branch.ahead)}</Badge>}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openDialog('createBranch', branchMenu.branch.targetOid)}>
              <GitBranchPlus /> 在此处新建分支…
            </DropdownMenuItem>
            {!branchMenu.branch.isRemote && (
              <>
                <DropdownMenuItem onClick={() => openDialog('rename', branchMenu.branch.name)}>
                  <Pencil /> Rename…
                </DropdownMenuItem>
                <DropdownMenuItem
                  destructive
                  disabled={branchMenu.branch.isHead}
                  onClick={() =>
                    void act(
                      `删除分支 ${branchMenu.branch.name}`,
                      () => ipc.deleteBranch(path, branchMenu.branch.name, false),
                      { kind: 'branchDelete', extra: { branch: branchMenu.branch.name, oid: branchMenu.branch.targetOid } },
                    )
                  }
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={dropAction !== null} onOpenChange={(o) => !o && setDropAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge tone="info" className="min-w-0 max-w-44">
                <span className="truncate">{dropAction?.source}</span>
              </Badge>
              <MoveRight className="size-3.5 shrink-0 text-faint" />
              <Badge tone="success" className="min-w-0 max-w-44">
                <span className="truncate">{dropAction?.target}</span>
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {dropAction && useRepo.getState().repo?.headBranch !== dropAction.target
                ? `合并时将先检出 ${dropAction.target}。`
                : '选择要对这些分支执行的操作。'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              className="h-auto justify-start whitespace-normal py-2"
              onClick={() => dropAction && void dropMerge(dropAction.source, dropAction.target, true)}
            >
              <GitMerge className="shrink-0" />
              <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                <span className="max-w-full truncate">
                  Merge {dropAction?.source} into {dropAction?.target}
                </span>
                <span className="text-[11px] font-normal opacity-75">
                  Records a merge commit on {dropAction?.target}
                </span>
              </span>
            </Button>
            {dropAction?.canFf && (
              <Button
                variant="secondary"
                className="h-auto justify-start whitespace-normal py-2"
                onClick={() => void dropMerge(dropAction.source, dropAction.target, false)}
              >
                <FastForward className="shrink-0" />
                <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                  <span className="max-w-full truncate">
                    将 {dropAction.target} 快进到 {dropAction.source}
                  </span>
                  <span className="text-[11px] font-normal text-muted">
                    移动分支指针，不创建合并提交
                  </span>
                </span>
              </Button>
            )}
            {dropAction && !branches.find((b) => b.name === dropAction.source)?.isRemote && (
              <Button
                variant="secondary"
                className="h-auto justify-start whitespace-normal py-2"
                onClick={() => void dropRebase(dropAction.source, dropAction.target)}
              >
                <ListRestart className="shrink-0" />
                <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                  <span className="max-w-full truncate">
                    Rebase {dropAction.source} onto {dropAction.target}
                  </span>
                  <span className="text-[11px] font-normal text-muted">
                    重放 {dropAction.source} 在 {dropAction.target} 之上的提交——这会重写历史
                  </span>
                </span>
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDropAction(null)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
