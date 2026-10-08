import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FolderOpen, FolderTree } from 'lucide-react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from '@angkorgit/design-system';
import { parentDirectory, suggestWorktreePath } from '@angkorgit/core';
import { ipc, pickDirectory } from '@/core/ipc';
import { useRepo } from '@/features/repository/store';
import { useGraph } from '@/features/graph/store';
import { useSettings } from '@/features/settings/store';
import { useUi, type CreateWorktreePreset } from '@/features/ui/store';
import { basename } from '@/shared/utils';

type Mode = 'existing' | 'new';

export function CreateWorktreeDialog() {
  const repo = useRepo((s) => s.repo);
  const branches = useRepo((s) => s.branches);
  const worktrees = useRepo((s) => s.worktrees);
  const refresh = useRepo((s) => s.refresh);
  const graphCommits = useGraph((s) => s.commits);
  const dialog = useUi((s) => s.dialog);
  const rawContext = useUi((s) => s.dialogContext);
  const closeDialog = useUi((s) => s.closeDialog);
  const worktreeRoot = useSettings((s) => s.worktreeRoot);
  const setWorktreeRoot = useSettings((s) => s.setWorktreeRoot);
  const open = dialog === 'createWorktree';
  const preset: CreateWorktreePreset | null =
    open &&
    rawContext &&
    typeof rawContext === 'object' &&
    !('oids' in rawContext) &&
    !('baseOid' in rawContext) &&
    !('repoPath' in rawContext) &&
    !('paths' in rawContext) &&
    !('section' in rawContext) &&
    !('url' in rawContext) &&
    !('scanRoot' in rawContext)
      ? rawContext
      : null;

  const path = repo?.path ?? '';
  const mainPath = repo?.mainPath ?? repo?.path ?? '';
  const repoName = basename(mainPath) || 'worktree';
  const defaultParent = worktreeRoot ?? parentDirectory(mainPath);

  const [mode, setMode] = useState<Mode>('new');
  const [existingBranch, setExistingBranch] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [directory, setDirectory] = useState('');
  const [openAfter, setOpenAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  const directoryTouched = useRef(false);

  const heldBranches = useMemo(() => {
    const held = new Map<string, string>();
    for (const wt of worktrees) if (wt.branch) held.set(wt.branch, wt.name);
    return held;
  }, [worktrees]);

  const availableBranches = useMemo(() => {
    const locals = branches.filter((b) => !b.isRemote && !heldBranches.has(b.name) && !b.isHead);
    const localNames = new Set(branches.filter((b) => !b.isRemote).map((b) => b.name));
    const remotes = branches.filter((b) => {
      if (!b.isRemote) return false;
      const local = b.name.split('/').slice(1).join('/');
      return !localNames.has(local) && !heldBranches.has(local);
    });
    return [...locals, ...remotes];
  }, [branches, heldBranches]);

  const baseOid = preset?.oid ?? null;
  const baseSummary = useMemo(
    () => (baseOid ? graphCommits.find((c) => c.oid === baseOid)?.summary ?? null : null),
    [baseOid, graphCommits],
  );

  useEffect(() => {
    if (!open) return;
    directoryTouched.current = false;
    setBusy(false);
    setOpenAfter(true);
    setNewBranch('');
    if (preset?.branch) {
      setMode('existing');
      setExistingBranch(preset.branch);
    } else {
      setMode('new');
      setExistingBranch('');
    }
  }, [open, preset?.branch, preset?.oid]);

  const branch = mode === 'existing' ? existingBranch : newBranch.trim();
  const effectiveBranch =
    mode === 'existing' ? existingBranch.split('/').slice(existingBranch.includes('/') && branches.find((b) => b.name === existingBranch)?.isRemote ? 1 : 0).join('/') : branch;

  useEffect(() => {
    if (!open || directoryTouched.current) return;
    setDirectory(suggestWorktreePath(defaultParent, repoName, effectiveBranch || 'new'));
  }, [open, defaultParent, repoName, effectiveBranch]);

  const canSubmit = !busy && branch.length > 0 && directory.trim().length > 0;

  const submit = async () => {
    if (!canSubmit || !repo) return;
    setBusy(true);
    try {
      const created = await ipc.worktreeAdd(path, {
        directory: directory.trim(),
        branch,
        createBranch: mode === 'new',
        base: mode === 'new' ? baseOid : null,
      });
      setWorktreeRoot(parentDirectory(created));
      toast.success(`工作树已就绪 · ${basename(created)}`, {
        description:
          'node_modules 等被忽略的文件不会被复制。需要时请在其终端中运行安装步骤。',
      });
      closeDialog();
      if (openAfter) {
        await useRepo.getState().open(created);
      } else {
        await refresh();
      }
    } catch (error) {
      toast.error(`无法创建工作树：${(error as { message?: string }).message ?? error}`);
    } finally {
      setBusy(false);
    }
  };

  const browse = async () => {
    const dir = await pickDirectory('选择工作树的创建位置');
    if (!dir) return;
    directoryTouched.current = true;
    setDirectory(suggestWorktreePath(dir, repoName, effectiveBranch || 'new'));
  };

  const baseLabel = baseOid
    ? `${baseOid.slice(0, 8)}${baseSummary ? ` · ${baseSummary}` : ''}`
    : repo?.headBranch ?? '当前 HEAD';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeDialog()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="size-4 text-primary" />
            新建工作树
          </DialogTitle>
          <DialogDescription>
            该仓库的第二个文件夹，检出独立的分支，无需暂存即可同时处理
            多件事，所有提交保留在同一历史中。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="new">新建分支</TabsTrigger>
              <TabsTrigger value="existing">已有分支</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === 'new' ? (
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              分支名
              <Input
                autoFocus
                placeholder="feature/parallel-task"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
                className="font-mono"
              />
              <span className="text-[11px] text-faint [overflow-wrap:anywhere]">
                起始于 {baseLabel}。
              </span>
            </label>
          ) : (
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              分支
              <Select value={existingBranch} onValueChange={setExistingBranch}>
                <SelectTrigger className="h-9 font-mono">
                  <SelectValue placeholder="选择分支" />
                </SelectTrigger>
                <SelectContent>
                  {availableBranches.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-faint">
                      每个分支都已在某处检出。
                    </div>
                  )}
                  {availableBranches.map((b) => (
                    <SelectItem key={b.name} value={b.name}>
                      <span className="font-mono">{b.name}</span>
                      {b.isRemote && <span className="ml-2 text-[10px] text-faint">remote</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-faint">
                已在工作树中打开的分支不会列出；git 每个分支只允许一个文件夹。
              </span>
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Folder
            <div className="flex gap-2">
              <Input
                value={directory}
                onChange={(e) => {
                  directoryTouched.current = true;
                  setDirectory(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
                placeholder="/path/to/new-folder"
                className="font-mono"
              />
              <Button variant="secondary" size="icon" aria-label="浏览父文件夹" onClick={() => void browse()}>
                <FolderOpen />
              </Button>
            </div>
            <span className="text-[11px] text-faint">
              默认创建在仓库旁边；该文件夹必须尚不存在。
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <Checkbox checked={openAfter} onCheckedChange={(v) => setOpenAfter(v === true)} />
            Open it in a new tab
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={closeDialog}>
            取消
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()} className={cn(busy && 'gap-2')}>
            {busy ? <Spinner className="text-primary-foreground" /> : null}
            Create worktree
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
