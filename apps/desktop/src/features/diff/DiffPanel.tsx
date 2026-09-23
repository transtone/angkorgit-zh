import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns2, Copy, FileText, History, Minus, Plus, Rows3, TextSelect, Trash2, UserRoundSearch, WholeWord, WrapText, X } from 'lucide-react';
import type { CommitFileInfo, FileDiff } from '@angkorgit/core';
import { hasCommittedHistory } from '@angkorgit/core';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Hint,
  Kbd,
  Separator,
  Spinner,
  cn,
} from '@angkorgit/design-system';
import { confirmDialog } from '@/components/confirm';
import type { LineMenuInfo } from './VirtualDiff';
import { ipc } from '@/core/ipc';
import { useRepo } from '@/features/repository/store';
import { useShortcuts } from '@/shared/useShortcuts';
import { captureSelectionRanges, useKeepSelection } from '@/shared/useKeepSelection';
import { useUi, type CenterDiffTarget } from '@/features/ui/store';
import { DiffViewer } from './DiffViewer';
import { wrapUnavailable } from './diffShared';
import { useDiffFind } from './diffSearch';
import { useDiffSelectAll } from './diffCopy';
import { diffSelectionText } from './diffSelection';
import { changeBlocks, DiffMinimap, scrollToFraction } from './DiffMinimap';

export function DiffPanel({ target }: { target: CenterDiffTarget }) {
  const repo = useRepo((s) => s.repo);
  const status = useRepo((s) => s.status);
  const statusVersion = useRepo((s) => s.statusVersion);
  const refreshStatus = useRepo((s) => s.refreshStatus);
  const closeCenterDiff = useUi((s) => s.closeCenterDiff);
  const openCenterDiff = useUi((s) => s.openCenterDiff);
  const openFileHistory = useUi((s) => s.openFileHistory);
  const openBlame = useUi((s) => s.openBlame);
  const diffView = useUi((s) => s.diffView);
  const setDiffView = useUi((s) => s.setDiffView);
  const wordDiff = useUi((s) => s.wordDiff);
  const setWordDiff = useUi((s) => s.setWordDiff);
  const fullFileDiff = useUi((s) => s.fullFileDiff);
  const setFullFileDiff = useUi((s) => s.setFullFileDiff);
  const wrapLines = useUi((s) => s.wrapLines);
  const setWrapLines = useUi((s) => s.setWrapLines);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const loadedKey = useRef<string | null>(null);
  const requestSeq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [lineMenu, setLineMenu] = useState<{
    x: number;
    y: number;
    info: LineMenuInfo;
    selection: string;
    ranges: Range[];
  } | null>(null);
  useKeepSelection(lineMenu?.ranges ?? null);
  const textDiff = diff && !diff.isBinary && !diff.isImage ? diff : null;
  const { findBar, search } = useDiffFind(textDiff, scrollRef);
  const { selectAllOverlay, selectSide } = useDiffSelectAll(textDiff, scrollRef);

  const path = repo?.path ?? '';
  const isWorkingCopy = target.oid === undefined;
  const [commitFileList, setCommitFileList] = useState<CommitFileInfo[]>([]);
  const commitFiles = useMemo(() => commitFileList.map((f) => f.path), [commitFileList]);

  useEffect(() => {
    if (!path || !target.oid) {
      setCommitFileList([]);
      return;
    }
    let cancelled = false;
    void ipc
      .commitFiles(path, target.oid)
      .then((files) => {
        if (!cancelled) setCommitFileList(files);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [path, target.oid]);

  const workingSiblings = useMemo(
    () =>
      isWorkingCopy && status
        ? status.files
            .filter((f) => (target.staged ? f.staged : f.unstaged))
            .map((f) => f.path)
        : [],
    [isWorkingCopy, status, target.staged],
  );
  const siblings = isWorkingCopy ? workingSiblings : commitFiles;
  const fileIndex = siblings.indexOf(target.path);

  const goFile = (direction: 1 | -1) => {
    if (fileIndex < 0) return;
    const next = siblings[fileIndex + direction];
    if (!next) return;
    if (target.oid) {
      openCenterDiff({
        path: next,
        oid: target.oid,
        oldPath: commitFileList.find((f) => f.path === next)?.oldPath ?? null,
      });
    } else {
      const staged = target.staged ?? false;
      useUi.getState().selectFile({ path: next, staged });
      openCenterDiff({ path: next, staged });
    }
  };

  const goFileRef = useRef(goFile);
  goFileRef.current = goFile;
  const jumpChangeRef = useRef<(direction: 1 | -1) => void>(() => {});

  useShortcuts(
    useMemo(
      () => [
        { combo: '[', handler: () => goFileRef.current(-1), skipInInput: true },
        { combo: ']', handler: () => goFileRef.current(1), skipInInput: true },
        { combo: 'p', handler: () => jumpChangeRef.current(-1), skipInInput: true },
        { combo: 'n', handler: () => jumpChangeRef.current(1), skipInInput: true },
      ],
      [],
    ),
  );

  useEffect(() => {
    if (!isWorkingCopy || !status) return;
    const entry = status.files.find((f) => f.path === target.path);
    if (target.unchanged) {
      if (entry && (entry.unstaged || entry.staged)) openCenterDiff({ path: target.path, staged: !entry.unstaged });
      return;
    }
    const stillHasThisSide = target.staged ? !!entry?.staged : !!entry?.unstaged;
    if (stillHasThisSide) return;
    const hasOtherSide = target.staged ? !!entry?.unstaged : !!entry?.staged;
    if (hasOtherSide) openCenterDiff({ path: target.path, staged: !target.staged });
    else closeCenterDiff();
  }, [status, isWorkingCopy, target.path, target.staged, target.unchanged, openCenterDiff, closeCenterDiff]);

  const blocks = useMemo(
    () => (diff && !diff.isBinary && !diff.isImage ? changeBlocks(diff, diffView) : []),
    [diff, diffView],
  );

  const autoJumpKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!diff || loading) return;
    const key = `${path}|${target.path}|${target.oid ?? ''}|${target.staged ?? false}`;
    if (autoJumpKey.current === key) return;
    const el = scrollRef.current;
    if (!el) return;
    autoJumpKey.current = key;
    const apply = () => {
      if (blocks.length > 0) scrollToFraction(el, blocks[0].fraction, 'auto');
      else el.scrollTo({ top: 0 });
    };
    apply();
    const applied = el.scrollTop;
    requestAnimationFrame(() => {
      if (autoJumpKey.current === key && applied > 0 && el.scrollTop === 0) apply();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff, loading, blocks]);

  const jumpChange = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el || blocks.length === 0 || el.scrollHeight === 0) return;
    const current = (el.scrollTop + el.clientHeight * 0.35) / el.scrollHeight;
    const epsilon = 0.002;
    const next =
      direction === 1
        ? (blocks.find((b) => b.fraction > current + epsilon) ?? blocks[0])
        : ([...blocks].reverse().find((b) => b.fraction < current - epsilon) ??
          blocks[blocks.length - 1]);
    scrollToFraction(el, next.fraction);
  };
  jumpChangeRef.current = jumpChange;

  const statusEntry = isWorkingCopy
    ? status?.files.find((f) => f.path === target.path)
    : undefined;
  const statusSignature = isWorkingCopy
    ? `${statusEntry?.staged ?? ''}|${statusEntry?.unstaged ?? ''}|${statusVersion}`
    : '';
  const blameable = !isWorkingCopy || !statusEntry || hasCommittedHistory(statusEntry);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    const seq = ++requestSeq.current;
    const key = `${path}|${target.path}|${target.oid ?? ''}|${target.staged ?? false}|${target.unchanged ?? false}|${fullFileDiff}|${reloadToken}`;
    if (loadedKey.current !== key) setLoading(true);
    const context = fullFileDiff ? 10_000_000 : undefined;
    const load = async (): Promise<FileDiff | null> => {
      if (target.unchanged) return ipc.fileContents(path, target.path, target.oid ?? null);
      if (target.oid) {
        const result = await ipc.commitFileDiff(
          path,
          target.oid,
          target.path,
          target.oldPath ?? null,
          context,
        );
        const untouched =
          result.hunks.length === 0 &&
          result.additions === 0 &&
          result.deletions === 0 &&
          !result.isBinary &&
          !result.isImage;
        return untouched ? null : result;
      }
      return ipc.diffFile(path, target.path, target.staged ?? false, context);
    };
    void load()
      .then((result) => {
        if (!cancelled && seq === requestSeq.current) {
          setDiff(result);
          setLoadError(null);
          loadedKey.current = key;
        }
      })
      .catch((error) => {
        if (!cancelled && seq === requestSeq.current) {
          setLoadError(String((error as { message?: string }).message ?? error));
          setDiff(null);
          loadedKey.current = key;
        }
      })
      .finally(() => {
        if (!cancelled && seq === requestSeq.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, target.path, target.oid, target.staged, target.unchanged, fullFileDiff, reloadToken, statusSignature]);

  const runStage = async (op: () => Promise<unknown>, label: string) => {
    try {
      await op();
      await refreshStatus();
    } catch (error) {
      toast.error(`${label} 失败：${(error as { message?: string }).message ?? error}`);
    }
  };

  return (
    <motion.section
      className="flex h-full flex-col bg-background"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      aria-label={`文件差异：${target.path}`}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface px-3">
        <Hint
          label={
            <span className="flex items-center gap-1">
              返回提交图 <Kbd>Esc</Kbd>
            </span>
          }
        >
          <Button variant="ghost" size="icon-sm" aria-label="关闭 diff" onClick={closeCenterDiff}>
            <X className="size-4" />
          </Button>
        </Hint>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{target.path}</span>
        {target.oid && (
          <Badge tone="neutral" className="font-mono">
            {target.oid.slice(0, 8)}
          </Badge>
        )}
        {target.unchanged ? (
          <Badge tone="neutral">未更改</Badge>
        ) : (
          !target.oid && (
            <Badge tone={target.staged ? 'success' : 'info'}>{target.staged ? 'staged' : 'unstaged'}</Badge>
          )
        )}
        {diff && !diff.isBinary && !diff.isImage && !target.unchanged && (
          <span className="shrink-0 text-xs">
            <span className="text-success">+{diff.additions}</span>{' '}
            <span className="text-danger">−{diff.deletions}</span>
          </span>
        )}
        <Separator orientation="vertical" className="mx-1 h-4" />
        <Hint label="内联 diff">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="内联 diff"
            className={cn(diffView === 'inline' && 'bg-surface-raised text-foreground')}
            onClick={() => setDiffView('inline')}
          >
            <Rows3 className="size-3.5" />
          </Button>
        </Hint>
        <Hint label="并排 diff">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="并排 diff"
            className={cn(diffView === 'split' && 'bg-surface-raised text-foreground')}
            onClick={() => setDiffView('split')}
          >
            <Columns2 className="size-3.5" />
          </Button>
        </Hint>
        <Hint label={wordDiff ? '词级 diff 开' : '词级 diff 关'}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="切换词级 diff"
            className={cn(wordDiff && 'bg-surface-raised text-primary')}
            onClick={() => setWordDiff(!wordDiff)}
          >
            <WholeWord className="size-3.5" />
          </Button>
        </Hint>
        <Hint
          label={
            textDiff && wrapUnavailable(textDiff)
              ? '大文件已关闭自动换行，以保持滚动流畅'
              : wrapLines
                ? '已自动换行——点击横向滚动'
                : '自动换行'
          }
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="切换自动换行"
            disabled={!!textDiff && wrapUnavailable(textDiff)}
            className={cn(wrapLines && 'bg-surface-raised text-primary')}
            onClick={() => setWrapLines(!wrapLines)}
          >
            <WrapText className="size-3.5" />
          </Button>
        </Hint>
        <Hint label={fullFileDiff ? '已显示整个文件——点击仅显示更改' : '显示整个文件'}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="切换整文件视图"
            className={cn(fullFileDiff && 'bg-surface-raised text-primary')}
            onClick={() => setFullFileDiff(!fullFileDiff)}
          >
            <FileText className="size-3.5" />
          </Button>
        </Hint>
        <Hint label="文件历史">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="文件历史"
            onClick={() => openFileHistory(target.path)}
          >
            <History className="size-3.5" />
          </Button>
        </Hint>
        <Hint
          label={
            !blameable
              ? 'Nothing to blame yet — this file has no commits'
              : target.oid
                ? 'Blame at this commit'
                : 'Blame'
          }
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Blame"
            disabled={!blameable}
            onClick={() => openBlame(target.path, target.oid ?? null)}
          >
            <UserRoundSearch className="size-3.5" />
          </Button>
        </Hint>
        {blocks.length > 0 && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <Hint
              label={
                <span className="flex items-center gap-1">
                  上一个更改 <Kbd>P</Kbd>
                </span>
              }
            >
              <Button variant="ghost" size="icon-sm" aria-label="上一个更改" onClick={() => jumpChange(-1)}>
                <ChevronUp className="size-4" />
              </Button>
            </Hint>
            <Hint
              label={
                <span className="flex items-center gap-1">
                  下一个更改 <Kbd>N</Kbd>
                </span>
              }
            >
              <Button variant="ghost" size="icon-sm" aria-label="下一个更改" onClick={() => jumpChange(1)}>
                <ChevronDown className="size-4" />
              </Button>
            </Hint>
            <span className="text-[10px] text-faint">
              {blocks.length} 处更改
            </span>
          </>
        )}
        {siblings.length > 1 && fileIndex >= 0 && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <Hint
              label={
                <span className="flex items-center gap-1">
                  上一个文件 <Kbd>[</Kbd>
                </span>
              }
            >
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="上一个文件"
                disabled={fileIndex <= 0}
                onClick={() => goFile(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
            </Hint>
            <span className="text-[10px] tabular-nums text-faint">
              {fileIndex + 1} of {siblings.length}
            </span>
            <Hint
              label={
                <span className="flex items-center gap-1">
                  下一个文件 <Kbd>]</Kbd>
                </span>
              }
            >
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="下一个文件"
                disabled={fileIndex >= siblings.length - 1}
                onClick={() => goFile(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </Hint>
          </>
        )}
        {isWorkingCopy && !target.unchanged && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            {target.staged ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void runStage(() => ipc.unstageFile(path, target.path), 'Unstage')}
              >
                <Minus className="size-3" /> 取消暂存文件
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void runStage(() => ipc.stageFile(path, target.path), 'Stage')}
              >
                <Plus className="size-3" /> 暂存文件
              </Button>
            )}
          </>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1">
        {findBar}
        {selectAllOverlay}
        <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="size-5" />
            </div>
          ) : loadError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
              <p className="max-w-md text-center text-sm text-danger [overflow-wrap:anywhere]">
                无法加载 diff：{loadError}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setReloadToken((t) => t + 1)}>
                重试
              </Button>
            </div>
          ) : diff &&
            target.unchanged &&
            !diff.isBinary &&
            !diff.isImage &&
            diff.hunks.every((h) => h.lines.length === 0) ? (
            <p className="py-16 text-center text-sm text-faint">This file is empty.</p>
          ) : diff ? (
            <DiffViewer
            diff={diff}
            scrollRef={scrollRef}
            search={search}
            onLineContextMenu={(e, info) => {
              e.preventDefault();
              setLineMenu({
                x: e.clientX,
                y: e.clientY,
                info,
                selection: diffSelectionText(scrollRef.current) ?? window.getSelection()?.toString() ?? '',
                ranges: captureSelectionRanges(),
              });
            }}
            hunkActions={
              isWorkingCopy && !fullFileDiff && !target.unchanged
                ? (hunkIndex) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={() =>
                        void runStage(
                          () =>
                            target.staged
                              ? ipc.unstageHunk(path, target.path, hunkIndex)
                              : ipc.stageHunk(path, target.path, hunkIndex),
                          '代码块操作',
                        )
                      }
                    >
                      {target.staged ? (
                        <>
                          <Minus className="size-3" /> 取消暂存代码块
                        </>
                      ) : (
                        <>
                          <Plus className="size-3" /> 暂存代码块
                        </>
                      )}
                    </Button>
                  )
                : undefined
            }
            />
          ) : (
            <p className="py-16 text-center text-sm text-faint">
              没有可显示的 diff——更改可能已被暂存或已解决。
            </p>
          )}
        </div>
        {diff && !loading && <DiffMinimap diff={diff} view={diffView} scrollRef={scrollRef} />}
      </div>

      {lineMenu && (
        <DropdownMenu open onOpenChange={(o) => !o && setLineMenu(null)}>
          <DropdownMenuTrigger asChild>
            <span style={{ position: 'fixed', left: lineMenu.x, top: lineMenu.y }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom" onCloseAutoFocus={(e) => e.preventDefault()}>
            {isWorkingCopy && lineMenu.info.line.kind !== 'context' && (
              <>
                {target.staged ? (
                  <DropdownMenuItem
                    onClick={() =>
                      void runStage(
                        () =>
                          ipc.unstageLine(
                            path,
                            target.path,
                            lineMenu.info.line.kind,
                            (lineMenu.info.line.kind === 'addition'
                              ? lineMenu.info.line.newLineNo
                              : lineMenu.info.line.oldLineNo) ?? 0,
                          ),
                        '取消暂存行',
                      )
                    }
                  >
                    <Minus /> 取消暂存此行
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem
                      onClick={() =>
                        void runStage(
                          () =>
                            ipc.stageLine(
                              path,
                              target.path,
                              lineMenu.info.line.kind,
                              (lineMenu.info.line.kind === 'addition'
                                ? lineMenu.info.line.newLineNo
                                : lineMenu.info.line.oldLineNo) ?? 0,
                            ),
                          '暂存行',
                        )
                      }
                    >
                      <Plus /> 暂存此行
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      destructive
                      onClick={() => {
                        const info = lineMenu.info;
                        void confirmDialog({
                          title: '丢弃此行？',
                          description:
                            '此行的更改将在工作区中被还原（修改过的行将恢复到原始文本），此操作无法撤销。',
                          confirmLabel: '丢弃行',
                          destructive: true,
                        }).then((ok) => {
                          if (ok)
                            void runStage(
                              () =>
                                ipc.discardLine(
                                  path,
                                  target.path,
                                  info.line.kind,
                                  (info.line.kind === 'addition' ? info.line.newLineNo : info.line.oldLineNo) ?? 0,
                                ),
                              '丢弃行',
                            );
                        });
                      }}
                    >
                      <Trash2 /> 丢弃此行…
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            {lineMenu.selection && (
              <DropdownMenuItem
                onClick={() => {
                  void navigator.clipboard.writeText(lineMenu.selection);
                  toast.success('Copied');
                }}
              >
                <Copy /> 复制
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard.writeText(lineMenu.info.line.content);
                toast.success('行已复制');
              }}
            >
              <Copy /> 复制行
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => selectSide(lineMenu.info.side ?? 'new')}
            >
              <TextSelect /> 全选
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </motion.section>
  );
}
