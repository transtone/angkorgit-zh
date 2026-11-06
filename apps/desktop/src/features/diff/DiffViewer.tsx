import { useMemo } from 'react';
import { FileText, ImageOff } from 'lucide-react';
import { imageMimeFor, type DiffHunk, type DiffLine, type FileDiff } from '@angkorgit/core';
import { cn, PaneEmpty } from '@angkorgit/design-system';
import { useUi } from '@/features/ui/store';
import { languageOf, diffFirstLine } from '@/shared/highlight';
import { CodeLine, gutter, lineBg, pairHunkLines, prepareLineStates, wrapUnavailable, type SearchRanges } from './diffShared';
import { ACTIVE_CHANGE_CLASS, flattenDiff, VirtualInlineDiff, VirtualSplitDiff, type LineMenuInfo } from './VirtualDiff';
import { rowInRange, type RowRange } from './DiffMinimap';

interface HunkProps {
  hunk: DiffHunk;
  language: string | null;
  useWordDiff: boolean;
  actions?: React.ReactNode;
  search?: SearchRanges;
  wrap?: boolean;
  rowOffset?: number;
  activeRows?: RowRange;
}

function activeRow(rowOffset: number | undefined, i: number, activeRows: RowRange | undefined): boolean {
  return rowOffset !== undefined && rowInRange(rowOffset + i, activeRows);
}

function searchTint(line: DiffLine | null, search?: SearchRanges): React.CSSProperties | undefined {
  const ranges = line ? search?.get(line) : undefined;
  if (!ranges) return undefined;
  const current = ranges.some((r) => r.current);
  return { backgroundColor: `hsl(var(--primary) / ${current ? 0.28 : 0.14})` };
}

function isCurrent(line: DiffLine | null, search?: SearchRanges): true | undefined {
  return line && search?.get(line)?.some((r) => r.current) ? true : undefined;
}

function HunkHeader({ hunk, actions }: { hunk: DiffHunk; actions?: React.ReactNode }) {
  if (!hunk.header) return null;
  return (
    <div className="sticky left-0 flex items-center gap-2 border-y border-border-subtle bg-surface-raised/60 px-3 py-1">
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-info">{hunk.header}</span>
      {actions}
    </div>
  );
}

function WrappedInlineHunk({ hunk, language, useWordDiff, actions, search, wrap = true, rowOffset, activeRows }: HunkProps) {
  const pairs = useMemo(() => pairHunkLines(hunk), [hunk]);
  const counterpart = useMemo(() => {
    const map = new Map();
    for (const p of pairs) {
      if (p.left && p.right && p.left !== p.right) {
        map.set(p.left, p.right);
        map.set(p.right, p.left);
      }
    }
    return map;
  }, [pairs]);

  return (
    <div>
      <HunkHeader hunk={hunk} actions={actions} />
      {hunk.lines.map((line, i) => (
        <div
          key={i}
          className={cn('flex', lineBg(line.kind), activeRow(rowOffset, i, activeRows) && ACTIVE_CHANGE_CLASS)}
          style={searchTint(line, search)}
          data-search-current={isCurrent(line, search)}
          data-change-active={activeRow(rowOffset, i, activeRows) || undefined}
        >
          <span className="w-10 shrink-0 select-none border-r border-border-subtle pr-1.5 text-right font-mono text-[10px] leading-5 text-faint">
            {gutter(line.oldLineNo)}
          </span>
          <span className="w-10 shrink-0 select-none border-r border-border-subtle pr-1.5 text-right font-mono text-[10px] leading-5 text-faint">
            {gutter(line.newLineNo)}
          </span>
          <span
            className={cn(
              'w-5 shrink-0 select-none text-center font-mono text-xs leading-5',
              line.kind === 'addition' && 'text-success',
              line.kind === 'deletion' && 'text-danger',
            )}
          >
            {line.kind === 'addition' ? '+' : line.kind === 'deletion' ? '−' : ''}
          </span>
          <div className="min-w-0 flex-1 px-1">
            <CodeLine
              line={line}
              pair={counterpart.get(line)}
              language={language}
              useWordDiff={useWordDiff}
              side={line.kind === 'deletion' ? 'old' : 'new'}
              wrap={wrap}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function WrappedSplitHunk({ hunk, language, useWordDiff, actions, search, rowOffset, activeRows }: HunkProps) {
  const pairs = useMemo(() => pairHunkLines(hunk), [hunk]);
  return (
    <div>
      <HunkHeader hunk={hunk} actions={actions} />
      {pairs.map((pair, i) => (
        <div key={i} className="flex" data-change-active={activeRow(rowOffset, i, activeRows) || undefined}>
          <div
            className={cn(
              'flex w-1/2 border-r border-border-subtle',
              pair.left ? lineBg(pair.left.kind === 'context' ? 'context' : 'deletion') : 'bg-surface-raised/40',
              activeRow(rowOffset, i, activeRows) && ACTIVE_CHANGE_CLASS,
            )}
            style={searchTint(pair.left, search)}
            data-search-current={isCurrent(pair.left, search)}
          >
            <span className="w-10 shrink-0 select-none border-r border-border-subtle pr-1.5 text-right font-mono text-[10px] leading-5 text-faint">
              {pair.left ? gutter(pair.left.oldLineNo) : ''}
            </span>
            <div className="min-w-0 flex-1 px-1.5">
              {pair.left ? (
                <CodeLine
                  line={pair.left}
                  pair={pair.left.kind !== 'context' ? pair.right : null}
                  language={language}
                  useWordDiff={useWordDiff}
                  side="old"
                  wrap
                />
              ) : (
                <span data-diff-blank aria-hidden className="text-transparent">
                  {'\u200b'}
                </span>
              )}
            </div>
          </div>
          <div
            className={cn(
              'flex w-1/2',
              pair.right ? lineBg(pair.right.kind === 'context' ? 'context' : 'addition') : 'bg-surface-raised/40',
            )}
            style={searchTint(pair.right, search)}
            data-search-current={isCurrent(pair.right, search)}
          >
            <span className="w-10 shrink-0 select-none border-r border-border-subtle pr-1.5 text-right font-mono text-[10px] leading-5 text-faint">
              {pair.right ? gutter(pair.right.newLineNo) : ''}
            </span>
            <div className="min-w-0 flex-1 px-1.5">
              {pair.right ? (
                <CodeLine
                  line={pair.right}
                  pair={pair.right.kind !== 'context' ? pair.left : null}
                  language={language}
                  useWordDiff={useWordDiff}
                  side="new"
                  wrap
                />
              ) : (
                <span data-diff-blank aria-hidden className="text-transparent">
                  {'\u200b'}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ImageDiff({ diff }: { diff: FileDiff }) {
  if (!diff.oldImage && !diff.newImage) {
    return (
      <PaneEmpty
        icon={<ImageOff />}
        title="图片不可用"
        description="无法加载内容。"
      />
    );
  }
  const mime = imageMimeFor(diff.path) ?? 'application/octet-stream';
  return (
    <div className="flex gap-4 p-4">
      {diff.oldImage && (
        <figure className="flex-1 rounded-lg border border-danger/40 bg-surface p-3 text-center">
          <img src={`data:${mime};base64,${diff.oldImage}`} alt="上一个版本" className="mx-auto max-h-72 max-w-full" />
          <figcaption className="mt-2 text-xs text-danger">变更前</figcaption>
        </figure>
      )}
      {diff.newImage && (
        <figure className="flex-1 rounded-lg border border-success/40 bg-surface p-3 text-center">
          <img src={`data:${mime};base64,${diff.newImage}`} alt="新版本" className="mx-auto max-h-72 max-w-full" />
          <figcaption className="mt-2 text-xs text-success">变更后</figcaption>
        </figure>
      )}
    </div>
  );
}

export function DiffViewer({
  diff,
  scrollRef,
  hunkActions,
  onLineContextMenu,
  search,
  activeRows,
  stacked = false,
}: {
  diff: FileDiff;
  scrollRef?: React.RefObject<HTMLDivElement>;
  hunkActions?: (hunkIndex: number) => React.ReactNode;
  onLineContextMenu?: (event: React.MouseEvent, info: LineMenuInfo) => void;
  search?: SearchRanges;
  activeRows?: RowRange;
  stacked?: boolean;
}) {
  const diffView = useUi((s) => s.diffView);
  const useWord = useUi((s) => s.wordDiff);
  const wrapLines = useUi((s) => s.wrapLines);
  const language = useMemo(() => languageOf(diff.path, diffFirstLine(diff)), [diff]);
  prepareLineStates(diff, language);
  const split = diffView === 'split';
  const wrap = stacked ? wrapLines || split : wrapLines && !wrapUnavailable(diff);

  const flatRows = useMemo(
    () => (!wrap && scrollRef && !stacked ? flattenDiff(diff, split) : []),
    [diff, split, wrap, scrollRef, stacked],
  );

  if (diff.isImage) return <ImageDiff diff={diff} />;
  if (diff.isBinary) {
    return (
      <PaneEmpty
        icon={<FileText />}
        title="二进制文件"
        description="此文件没有文本 diff。"
      />
    );
  }
  if (diff.hunks.length === 0) {
    return (
      <PaneEmpty
        icon={<FileText />}
        title="无更改"
        description="此版本与上一个相同。"
      />
    );
  }

  if (!wrap && scrollRef && !stacked) {
    const props = {
      rows: flatRows,
      language,
      useWordDiff: useWord,
      scrollRef,
      hunkActions,
      onLineContextMenu,
      search,
      activeRows,
    };
    return split ? <VirtualSplitDiff {...props} /> : <VirtualInlineDiff {...props} />;
  }

  let rowOffset = 0;
  return (
    <div className={cn(!wrap && 'min-w-max')}>
      {diff.hunks.map((hunk, i) => {
        const firstRow = rowOffset + (hunk.header ? 1 : 0);
        rowOffset = firstRow + (split ? pairHunkLines(hunk).length : hunk.lines.length);
        const props: HunkProps = {
          hunk,
          language,
          useWordDiff: useWord,
          actions: hunkActions?.(i),
          search,
          wrap,
          rowOffset: activeRows ? firstRow : undefined,
          activeRows,
        };
        return split ? <WrappedSplitHunk key={i} {...props} /> : <WrappedInlineHunk key={i} {...props} />;
      })}
    </div>
  );
}
