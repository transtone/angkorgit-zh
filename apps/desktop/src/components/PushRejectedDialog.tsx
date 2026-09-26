import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@angkorgit/design-system';

export function PushRejectedDialog({
  open,
  remote,
  branch,
  onPullRebase,
  onForcePush,
  onClose,
}: {
  open: boolean;
  remote: string;
  branch: string | null;
  onPullRebase: () => void;
  onForcePush: () => void;
  onClose: () => void;
}) {
  const target = branch ? `${remote}/${branch}` : remote;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md" data-push-rejected>
        <DialogHeader>
          <DialogTitle>远端已超前</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{target}</span> 包含你的分支中没有的提交，因此
            推送被拒绝，请选择一种合流方式。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="flex items-start gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary/60 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            onClick={onPullRebase}
            autoFocus
          >
            <ArrowDownToLine className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">拉取（变基）</span>
              <span className="block text-xs text-muted">
                取回远端提交并将你的提交重放其上。适用于他人已推送到
                同一分支的情形，不会丢失任何内容。
              </span>
            </span>
          </button>
          <button
            type="button"
            className="flex items-start gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-danger/60 hover:bg-danger/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/60"
            onClick={onForcePush}
          >
            <ArrowUpFromLine className="mt-0.5 size-4 shrink-0 text-danger" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">强制推送</span>
              <span className="block text-xs text-muted">
                用你的分支替换远端分支。适用于你已修订或变基已推送提交的情形
                。仅存在于远端的提交将会丢失。
              </span>
            </span>
          </button>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
