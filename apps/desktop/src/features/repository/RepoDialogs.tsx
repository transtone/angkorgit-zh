import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
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
  Textarea,
} from '@angkorgit/design-system';
import { ipc, type OpOutcome } from '@/core/ipc';
import { toastOutcome } from '@/shared/toastOutcome';
import { useRepo } from './store';
import { useUi } from '@/features/ui/store';
import { useUndo } from '@/features/history/undoStore';
import { useGraph } from '@/features/graph/store';
import { useSettings } from '@/features/settings/store';
import { basename, dirname } from '@/shared/utils';

export function RepoDialogs({ onDone }: { onDone: () => Promise<void> }) {
  const repo = useRepo((s) => s.repo);
  const { dialog, dialogContext: rawContext, closeDialog } = useUi();
  const dialogContext = typeof rawContext === 'string' ? rawContext : null;
  const path = repo?.path ?? '';
  const cherryPickRecordOrigin = useSettings((s) => s.cherryPickRecordOrigin);
  const setCherryPickRecordOrigin = useSettings((s) => s.setCherryPickRecordOrigin);
  const graphCommits = useGraph((s) => s.commits);
  const pickOids = useMemo(() => {
    if (dialog !== 'cherryPick' || !rawContext) return [];
    if (typeof rawContext === 'string') return [rawContext];
    return 'oids' in rawContext ? rawContext.oids : [];
  }, [dialog, rawContext]);
  const pickCommits = useMemo(
    () =>
      pickOids.map((oid) => ({
        oid,
        summary: graphCommits.find((c) => c.oid === oid)?.summary,
      })),
    [pickOids, graphCommits],
  );
  const cherryPickRef = useRef<HTMLButtonElement>(null);
  const stashPaths = useMemo(
    () =>
      dialog === 'createStash' && rawContext && typeof rawContext !== 'string' && 'paths' in rawContext
        ? rawContext.paths
        : [],
    [dialog, rawContext],
  );

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [checkout, setCheckout] = useState(true);
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(dialog === 'rename' ? (dialogContext ?? '') : '');
    setMessage('');
    setCheckout(true);
    setIncludeUntracked(true);
    setBusy(false);
  }, [dialog, dialogContext]);

  const submit = async (label: string, op: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await op();
      toast.success(`${label} 已完成`);
      closeDialog();
      await onDone();
    } catch (error) {
      toast.error(`${label} 失败：${(error as { message?: string }).message ?? error}`);
    } finally {
      setBusy(false);
    }
  };

  const submitCreateBranch = () => {
    if (!name.trim()) return;
    void submit('新建分支', () =>
      useUndo.getState().tracked({
        path,
        kind: 'branchCreate',
        label: `创建分支 ${name.trim()}`,
        extra: { branch: name.trim(), oid: dialogContext ?? (repo?.headOid ?? '') },
        action: () => ipc.createBranch(path, name.trim(), dialogContext, checkout),
      }),
    );
  };

  const submitCreateTag = () => {
    if (!name.trim()) return;
    void submit('新建标签', () =>
      ipc.tagCreate(path, name.trim(), dialogContext, message.trim() || null),
    );
  };

  const submitStash = () => {
    void submit('暂存', () =>
      ipc.stashCreate(path, message.trim() || null, stashPaths.length > 0 || includeUntracked, stashPaths),
    );
  };

  const submitCherryPick = () => {
    if (busy || pickOids.length === 0) return;
    const oids = pickOids;
    setBusy(true);
    void (async () => {
      try {
        const outcome = (await useUndo.getState().tracked({
          path,
          kind: 'cherryPick',
          label:
            oids.length === 1
              ? `摘取 ${oids[0].slice(0, 8)}`
              : `摘取 ${oids.length} 个提交`,
          action: () =>
            oids.length === 1
              ? ipc.cherryPick(path, oids[0], cherryPickRecordOrigin)
              : ipc.cherryPickMany(path, oids, cherryPickRecordOrigin),
          shouldRecord: (r) => (r as OpOutcome | undefined)?.status === 'ok',
        })) as OpOutcome | undefined;
        toastOutcome(outcome, '摘取完成');
        closeDialog();
        await onDone();
      } catch (error) {
        toast.error(`摘取失败：${(error as { message?: string }).message ?? error}`);
      } finally {
        setBusy(false);
      }
    })();
  };

  const submitRename = () => {
    if (!name.trim() || name.trim() === dialogContext) return;
    void submit('重命名分支', () =>
      useUndo.getState().tracked({
        path,
        kind: 'branchRename',
        label: `将 ${dialogContext} 重命名为 ${name.trim()}`,
        extra: { from: dialogContext ?? '', to: name.trim() },
        action: () => ipc.renameBranch(path, dialogContext ?? '', name.trim()),
      }),
    );
  };

  return (
    <>
      <Dialog open={dialog === 'createBranch'} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建分支</DialogTitle>
            <DialogDescription>
              {dialogContext ? `来自提交 ${dialogContext.slice(0, 8)}` : '从当前 HEAD 起'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              autoFocus
              placeholder="feature/my-branch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreateBranch();
              }}
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <Checkbox checked={checkout} onCheckedChange={(v) => setCheckout(v === true)} />
              创建后检出
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              取消
            </Button>
            <Button disabled={busy || !name.trim()} onClick={submitCreateBranch}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'createTag'} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建标签</DialogTitle>
            <DialogDescription>
              {dialogContext ? `在提交 ${dialogContext.slice(0, 8)}` : '在当前 HEAD 处'} — 为附注标签添加一条消息。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              autoFocus
              placeholder="v1.0.0"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreateTag();
              }}
            />
            <Textarea
              placeholder="标签消息（可选）"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              取消
            </Button>
            <Button disabled={busy || !name.trim()} onClick={submitCreateTag}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'createStash'} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{stashPaths.length > 0 ? '暂存选中的更改' : '暂存更改'}</DialogTitle>
            <DialogDescription>
              {stashPaths.length === 1
                ? '仅此文件被暂存，其余内容保留在工作副本中。'
                : stashPaths.length > 1
                  ? `仅这 ${stashPaths.length} 个文件被暂存，其余内容保留在工作副本中。`
                  : '保存你的工作更改并恢复干净的工作区。'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {stashPaths.length > 0 && (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border-subtle bg-surface-raised/50 p-2 font-mono text-xs">
                {stashPaths.map((file) => (
                  <li key={file} className="flex min-w-0 items-baseline gap-1.5">
                    <span className="max-w-full shrink-0 truncate text-foreground">{basename(file)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{dirname(file)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Input
              autoFocus
              placeholder="暂存消息（可选）"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitStash();
              }}
            />
            {stashPaths.length === 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                <Checkbox checked={includeUntracked} onCheckedChange={(v) => setIncludeUntracked(v === true)} />
                包含未跟踪文件
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              取消
            </Button>
            <Button disabled={busy} onClick={submitStash}>
              暂存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'rename'} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名分支</DialogTitle>
            <DialogDescription>重命名“{dialogContext}”。</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              取消
            </Button>
            <Button
              disabled={busy || !name.trim() || name.trim() === dialogContext}
              onClick={submitRename}
            >
              重命名
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'cherryPick'} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cherryPickRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {pickOids.length > 1 ? `摘取 ${pickOids.length} 个提交` : '摘取提交'}
            </DialogTitle>
            <DialogDescription>
              {pickOids.length > 1
                ? `按从旧到新的顺序将这些提交作为新提交应用到 ${repo?.headBranch ?? '当前分支'} 上。`
                : `将此提交作为新提交应用到 ${repo?.headBranch ?? '当前分支'} 上。`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border-subtle bg-surface-raised px-2.5 py-2 text-xs">
              {pickCommits.map((commit) => (
                <div key={commit.oid} className="flex items-baseline gap-2">
                  <span className="shrink-0 font-mono text-muted">{commit.oid.slice(0, 8)}</span>
                  <span className="truncate text-foreground">{commit.summary}</span>
                </div>
              ))}
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-muted">
              <Checkbox
                checked={cherryPickRecordOrigin}
                onCheckedChange={(v) => setCherryPickRecordOrigin(v === true)}
              />
              <span className="flex flex-col gap-0.5">
                <span>{pickOids.length > 1 ? '引用源提交' : '引用源提交'}</span>
                <span className="opacity-70">
                  为{' '}
                  {pickOids.length > 1 ? '每条新消息' : '这条新消息'} 追加“(cherry picked from commit …)” 引用，与 git
                  cherry-pick -x 一致。在共享分支间移植提交时很有用。
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              取消
            </Button>
            <Button ref={cherryPickRef} disabled={busy} onClick={submitCherryPick}>
              {pickOids.length > 1 ? `摘取 ${pickOids.length} 个提交` : '摘取'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
