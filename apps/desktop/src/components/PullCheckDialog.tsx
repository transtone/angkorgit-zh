import { AlertTriangle, Pencil } from 'lucide-react';
import type { PullPreview } from '@angkorgit/core';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@angkorgit/design-system';
import { DirName } from './DirName';
import { basename } from '@/shared/utils';

export type PullWarning = 'local' | 'conflicts';

export function pullWarningOf(preview: PullPreview | null): PullWarning | null {
  if (!preview || preview.behind === 0) return null;
  if (preview.localChanges.length > 0) return 'local';
  if (preview.conflicts.length > 0) return 'conflicts';
  return null;
}

export function pullWarningText(preview: PullPreview): string | null {
  const warning = pullWarningOf(preview);
  if (warning === 'local') {
    return `您在 ${preview.localChanges.length} 个文件中的未提交更改会阻碍拉取：${preview.localChanges.map(basename).join('、')}`;
  }
  if (warning === 'conflicts') {
    return `拉取将在 ${preview.conflicts.length} 个文件中产生冲突：${preview.conflicts.map(basename).join('、')}`;
  }
  return null;
}

export function PullCheckDialog({
  preview,
  open,
  onClose,
  onPull,
  onStash,
}: {
  preview: PullPreview | null;
  open: boolean;
  onClose: () => void;
  onPull: () => void;
  onStash: (paths: string[]) => void;
}) {
  const warning = pullWarningOf(preview);
  if (!preview || !warning) return null;
  const local = warning === 'local';
  const files = local ? preview.localChanges : preview.conflicts;
  const Icon = local ? Pencil : AlertTriangle;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md" data-pull-check={warning}>
        <DialogHeader>
          <DialogTitle>{local ? '本地更改会阻碍拉取' : '此次拉取将产生冲突'}</DialogTitle>
          <DialogDescription>
            {local ? (
              <>
                您编辑的 {files.length} 个文件在 <span className="font-mono">{preview.source}</span> 上也发生了更改。
                Git 不会覆盖您的更改，因此拉取无法开始。请先暂存这些更改，拉取后再应用暂存以恢复它们。
              </>
            ) : preview.rebase ? (
              <>
                将您的 {preview.ahead} 个提交重放到 <span className="font-mono">{preview.source}</span> 上时，
                会在以下文件中遇到冲突。请在冲突编辑器中解决冲突，然后继续变基。
              </>
            ) : (
              <>
                您的 {preview.ahead} 个提交和 <span className="font-mono">{preview.source}</span> 上的 {preview.behind} 个新提交
                修改了以下文件中的相同行。拉取后会标记这些冲突，您可以在冲突编辑器中解决。
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-48 divide-y divide-border-subtle overflow-y-auto rounded-md border border-border bg-surface">
          {files.map((path) => (
            <li key={path} className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-sm" data-pull-check-file={path} title={path}>
              <Icon className={local ? 'size-3.5 shrink-0 text-primary' : 'size-3.5 shrink-0 text-danger'} aria-hidden />
              <span className="max-w-full shrink-0 truncate font-medium text-foreground">{basename(path)}</span>
              <DirName path={path} />
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          {local ? (
            <Button autoFocus onClick={() => onStash(files)}>
              {files.length === 1 ? '暂存此文件…' : `暂存 ${files.length} 个文件…`}
            </Button>
          ) : (
            <Button autoFocus onClick={onPull}>
              拉取并解决冲突
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
