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
          <DialogTitle>The remote has moved on</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{target}</span> has commits that are not in your branch, so
            the push was refused. Pick how to bring the two together.
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
              <span className="block text-sm font-medium text-foreground">Pull with rebase</span>
              <span className="block text-xs text-muted">
                Bring the remote commits in and replay yours on top. Right when someone else pushed to
                this branch. Nothing is lost.
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
              <span className="block text-sm font-medium text-foreground">Force push</span>
              <span className="block text-xs text-muted">
                Replace the remote branch with yours. Right when you amended or rebased commits you had
                already pushed. Commits that exist only on the remote are lost.
              </span>
            </span>
          </button>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
