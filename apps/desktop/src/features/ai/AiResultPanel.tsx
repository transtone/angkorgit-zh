import { useEffect, useState, type ReactNode } from 'react';
import { Maximize2, X } from 'lucide-react';
import { Button, Hint, Logo, cn } from '@angkorgit/design-system';
import { AiReport } from './AiReport';
import { AiResultDialog } from './AiResultDialog';
import { useWaitMessage } from './waitMessages';

export function AiResultPanel({
  title,
  icon,
  busy,
  waitMessages,
  text,
  onStop,
  onDismiss,
  className,
  bodyClassName,
}: {
  title: string;
  icon: ReactNode;
  busy: boolean;
  waitMessages: readonly string[];
  text: string | null;
  onStop: () => void;
  onDismiss?: () => void;
  className?: string;
  bodyClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const wait = useWaitMessage(busy, waitMessages);

  useEffect(() => {
    if (!text) setExpanded(false);
  }, [text]);

  if (!busy && !text) return null;

  return (
    <div
      data-ai-result-panel={busy ? 'busy' : 'done'}
      className={cn('rounded-md border border-primary/30 bg-primary/5 text-xs leading-relaxed', className)}
    >
      <div className="flex items-center justify-between pl-3 pr-1.5 pt-1.5">
        <span className="flex items-center gap-1.5 font-medium text-primary">
          {icon} {title}
        </span>
        {busy ? (
          <Hint label={`Stop the ${title}`}>
            <Button variant="ghost" size="icon-sm" aria-label={`Stop the ${title}`} onClick={onStop}>
              <X className="size-3" />
            </Button>
          </Hint>
        ) : (
          <span className="flex items-center">
            <Hint label={`Open ${title} in full view`}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Open ${title} in full view`}
                onClick={() => setExpanded(true)}
              >
                <Maximize2 className="size-3" />
              </Button>
            </Hint>
            {onDismiss && (
              <Hint label={`Dismiss ${title}`}>
                <Button variant="ghost" size="icon-sm" aria-label={`Dismiss ${title}`} onClick={onDismiss}>
                  <X className="size-3" />
                </Button>
              </Hint>
            )}
          </span>
        )}
      </div>
      {busy ? (
        <div className="flex items-center gap-2.5 px-3 pb-2.5 pt-1.5 text-muted">
          <Logo size={18} animated="loop" className="logo-draw-loop shrink-0" />
          <span key={wait.key} className="animate-fade-in">
            {wait.text}
          </span>
        </div>
      ) : (
        <div className={cn('overflow-y-auto px-3 pb-2.5 pt-1', bodyClassName)}>
          <AiReport text={text ?? ''} />
        </div>
      )}
      <AiResultDialog
        open={expanded && !!text}
        onOpenChange={(open) => !open && setExpanded(false)}
        title={title}
        icon={icon}
        text={text ?? ''}
      />
    </div>
  );
}
