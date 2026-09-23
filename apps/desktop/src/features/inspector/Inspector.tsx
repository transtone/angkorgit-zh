import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CommitFileInfo, CommitInfo } from '@angkorgit/core';
import { FolderOpen, FolderTree, List, Search, X } from 'lucide-react';
import { Hint, Button, cn } from '@angkorgit/design-system';
import { useGraph } from '@/features/graph/store';
import { useRepo } from '@/features/repository/store';
import { useUi } from '@/features/ui/store';
import { ipc } from '@/core/ipc';
import { WorkingCopyPanel } from '@/features/commit/WorkingCopyPanel';
import { CommitDetails } from './CommitDetails';

export function Inspector() {
  const selectedOid = useGraph((s) => s.selectedOid);
  const repoPath = useRepo((s) => s.repo?.path);
  const fileView = useUi((s) => s.fileView);
  const setFileView = useUi((s) => s.setFileView);

  const [commit, setCommit] = useState<CommitInfo | null>(null);
  const [diffs, setDiffs] = useState<CommitFileInfo[]>([]);
  const [loadingDiffs, setLoadingDiffs] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [diffsError, setDiffsError] = useState<string | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);

  useEffect(() => {
    const { centerDiff, closeCenterDiff } = useUi.getState();
    if (centerDiff?.oid && centerDiff.oid !== selectedOid) closeCenterDiff();

    if (!selectedOid || !repoPath) {
      setCommit(null);
      setDiffs([]);
      setCommitError(null);
      setDiffsError(null);
      return;
    }
    const local = useGraph.getState().commits.find((c) => c.oid === selectedOid) ?? null;
    setCommit(local);
    setDiffs([]);
    setCommitError(null);
    setDiffsError(null);
    setLoadingDiffs(true);
    let cancelled = false;
    if (!local) {
      void ipc
        .commitInfo(repoPath, selectedOid)
        .then((info) => {
          if (!cancelled) setCommit(info);
        })
        .catch((error) => {
          if (cancelled) return;
          const message = String((error as { message?: string }).message ?? error);
          toast.error(`无法加载提交：${message}`);
          setCommitError(message);
        });
    }
    const stash = useRepo.getState().stashes.find((s) => s.oid === selectedOid);
    void (stash ? ipc.stashFiles(repoPath, stash.index) : ipc.commitFiles(repoPath, selectedOid))
      .then((result) => {
        if (!cancelled) setDiffs(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setDiffsError(String((error as { message?: string }).message ?? error));
      })
      .finally(() => {
        if (!cancelled) setLoadingDiffs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOid, repoPath, retrySeq]);

  const retry = () => setRetrySeq((n) => n + 1);
  const fileFilterOpen = useUi((s) => s.fileFilterOpen);
  const setFileFilterOpen = useUi((s) => s.setFileFilterOpen);
  const isStash = useRepo((s) => !!selectedOid && s.stashes.some((entry) => entry.oid === selectedOid));

  return (
    <aside className="flex h-full flex-col bg-surface" aria-label="检查器">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
        <span className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {commit || commitError ? (isStash ? '暂存' : '提交') : '工作副本'}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Hint label={fileFilterOpen ? '隐藏文件过滤' : '过滤文件'}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={fileFilterOpen ? '隐藏文件过滤' : '过滤文件'}
              aria-pressed={fileFilterOpen}
              className={cn(fileFilterOpen && 'bg-surface-raised text-foreground')}
              onClick={() => setFileFilterOpen(!fileFilterOpen)}
            >
              <Search className="size-3.5" />
            </Button>
          </Hint>
          <span className="mx-1 h-4 w-px bg-border-subtle" />
          <Hint label="扁平列表">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Flat file list"
              aria-pressed={fileView === 'list'}
              className={cn(fileView === 'list' && 'bg-surface-raised text-foreground')}
              onClick={() => setFileView('list')}
            >
              <List className="size-3.5" />
            </Button>
          </Hint>
          <Hint label="文件夹树">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Folder tree"
              aria-pressed={fileView === 'tree'}
              className={cn(fileView === 'tree' && 'bg-surface-raised text-foreground')}
              onClick={() => setFileView('tree')}
            >
              <FolderTree className="size-3.5" />
            </Button>
          </Hint>
          <Hint label={commit || commitError ? 'All files at this commit' : 'All files in the working copy'}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="All files"
              aria-pressed={fileView === 'all'}
              className={cn(fileView === 'all' && 'bg-surface-raised text-foreground')}
              onClick={() => setFileView('all')}
            >
              <FolderOpen className="size-3.5" />
            </Button>
          </Hint>
          {(commit || commitError) && (
            <>
              <span className="mx-1 h-4 w-px bg-border-subtle" />
              <Hint label="返回工作副本">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="返回工作副本"
                  onClick={() => {
                    useUi.getState().closeCenterDiff();
                    useGraph.getState().select(null);
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              </Hint>
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {commit ? (
          <CommitDetails
            key={commit.oid}
            commit={commit}
            diffs={diffs}
            loading={loadingDiffs}
            error={diffsError}
            onRetry={retry}
          />
        ) : commitError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-xs text-danger [overflow-wrap:anywhere]">
              无法加载提交：{commitError}
            </p>
            <Button variant="ghost" size="sm" onClick={retry}>
              重试
            </Button>
          </div>
        ) : (
          <WorkingCopyPanel />
        )}
      </div>
    </aside>
  );
}
