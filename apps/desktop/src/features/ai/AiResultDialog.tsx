import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@angkorgit/design-system';
import { AiReport, type AiReportLocate } from './AiReport';

export function AiResultDialog({
  open,
  onOpenChange,
  title,
  icon,
  text,
  locate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  icon?: ReactNode;
  text: string;
  locate?: AiReportLocate;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[85vh] w-[min(56rem,90vw)] max-w-none flex-col"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon} {title}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AiReport text={text} className="text-sm leading-relaxed text-foreground/90" locate={locate} />
        </div>
        <div className="mt-4 flex shrink-0 items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard
                .writeText(text)
                .then(() => toast.success('已复制'))
                .catch(() => toast.error('无法复制'));
            }}
          >
            <Copy className="size-3" /> 复制
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
