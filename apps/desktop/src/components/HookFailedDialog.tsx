import { useMemo } from 'react';
import { toast } from 'sonner';
import { Copy, ShieldOff } from 'lucide-react';
import { cleanCliOutput } from '@angkorgit/core';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@angkorgit/design-system';

export type HookOperation = 'commit' | 'amend';

export interface HookFailureView {
  operation: HookOperation;
  message: string;
  output: string;
}

const COPY: Record<HookOperation, { outcome: string; retry: string }> = {
  commit: {
    outcome: '未创建任何提交。提交消息仍保留在提交框中。',
    retry: '跳过钩子提交',
  },
  amend: {
    outcome: '上一次提交未被修改。提交消息仍保留在提交框中。',
    retry: '跳过钩子修订',
  },
};

export function HookFailedDialog({
  failure,
  onRetry,
  onClose,
}: {
  failure: HookFailureView | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const output = useMemo(() => cleanCliOutput(failure?.output ?? ''), [failure?.output]);
  const copy = () => {
    void navigator.clipboard.writeText(output).then(
      () => toast.success('钩子输出已复制'),
      () => toast.error('无法复制钩子输出'),
    );
  };
  const text = COPY[failure?.operation ?? 'commit'];
  return (
    <Dialog open={failure !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl" data-hook-failed={failure?.operation}>
        <DialogHeader>
          <DialogTitle>钩子阻止了{failure?.operation === 'amend' ? '修订' : '提交'}</DialogTitle>
          <DialogDescription>
            {failure?.message} {text.outcome}
          </DialogDescription>
        </DialogHeader>
        {output ? (
          <pre
            data-hook-output
            className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground [overflow-wrap:anywhere]"
          >
            {output}
          </pre>
        ) : (
          <p className="text-xs text-muted">钩子没有输出内容。</p>
        )}
        <DialogFooter className="flex-wrap justify-between" data-hook-actions>
          <Button variant="ghost" onClick={copy} disabled={!output}>
            <Copy /> 复制输出
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onRetry}>
              <ShieldOff /> {text.retry}
            </Button>
            <Button onClick={onClose} autoFocus>
              关闭
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
