import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Copy, Maximize2, X } from 'lucide-react';
import type { FileDiff } from '@angkorgit/core';
import { locateDiffLine, parseAiReport, type AiVerdictTone } from '@angkorgit/core';
import { Button, Hint, Logo, cn } from '@angkorgit/design-system';
import { AiReport, type AiReportLocate } from '@/features/ai/AiReport';
import { AiResultDialog } from '@/features/ai/AiResultDialog';
import { useWaitMessage } from '@/features/ai/waitMessages';

const VERDICT_TEXT: Record<AiVerdictTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  attention: 'text-primary',
};

const VERDICT_DOT: Record<AiVerdictTone, string> = {
  success: 'bg-success',
  danger: 'bg-danger',
  attention: 'bg-primary',
};

export function DiffAiStrip({
  title,
  icon,
  busy,
  waitMessages,
  text,
  diff,
  onStop,
  onDismiss,
  onLocate,
}: {
  title: string;
  icon: ReactNode;
  busy: boolean;
  waitMessages: readonly string[];
  text: string | null;
  diff: FileDiff | null;
  onStop: () => void;
  onDismiss: () => void;
  onLocate: (snippet: string) => void;
}) {
  const wait = useWaitMessage(busy, waitMessages);
  const [folded, setFolded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const report = useMemo(() => (text ? parseAiReport(text) : null), [text]);
  const verdict = report?.verdict ?? null;
  const preview = report?.sections[0]?.blocks[0]?.text.replace(/\s+/g, ' ') ?? '';

  useEffect(() => {
    setFolded(false);
    setExpanded(false);
  }, [text, busy]);

  const locate: AiReportLocate | undefined = diff
    ? { canLocate: (snippet) => !!locateDiffLine(diff, snippet), onLocate }
    : undefined;
  const locatable = !!locate && !!text && text.includes('`');

  return (
    <div
      data-ai-result-panel={busy ? 'busy' : 'done'}
      data-ai-folded={folded ? 'true' : undefined}
      className="shrink-0 border-b border-border-subtle bg-surface"
    >
      <div className="flex h-8 items-center gap-2 pl-3 pr-1.5">
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary">
          {icon} {title}
        </span>
        {busy ? (
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
            <Logo size={14} animated="loop" className="logo-draw-loop shrink-0" />
            <span key={wait.key} className="animate-fade-in truncate">
              {wait.text}
            </span>
          </span>
        ) : (
          <>
            {folded && verdict && (
              <span className={cn('flex min-w-0 items-center gap-1.5 text-xs font-medium', VERDICT_TEXT[verdict.tone])}>
                <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', VERDICT_DOT[verdict.tone])} />
                <span className="truncate">{verdict.text}</span>
              </span>
            )}
            {folded && !verdict && preview && (
              <span className="min-w-0 truncate text-xs text-muted">{preview}</span>
            )}
          </>
        )}
        <span className="flex-1" />
        {busy ? (
          <Hint label={`Stop the ${title}`}>
            <Button variant="ghost" size="icon-sm" aria-label={`Stop the ${title}`} onClick={onStop}>
              <X className="size-3.5" />
            </Button>
          </Hint>
        ) : (
          <>
            <Hint label="Copy as text">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Copy ${title}`}
                onClick={() => {
                  navigator.clipboard
                    .writeText(text ?? '')
                    .then(() => toast.success('Copied'))
                    .catch(() => toast.error('Could not copy'));
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </Hint>
            <Hint label={`Open ${title} in full view`}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Open ${title} in full view`}
                onClick={() => setExpanded(true)}
              >
                <Maximize2 className="size-3.5" />
              </Button>
            </Hint>
            <Hint label={folded ? `Show the ${title}` : `Fold the ${title}`}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={folded ? `Show the ${title}` : `Fold the ${title}`}
                aria-expanded={!folded}
                onClick={() => setFolded((f) => !f)}
              >
                {folded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
              </Button>
            </Hint>
            <Hint label={`Dismiss ${title}`}>
              <Button variant="ghost" size="icon-sm" aria-label={`Dismiss ${title}`} onClick={onDismiss}>
                <X className="size-3.5" />
              </Button>
            </Hint>
          </>
        )}
      </div>
      {!busy && !folded && (
        <div data-ai-body className="max-h-[min(40vh,22rem)] overflow-y-auto px-4 pb-3 pt-1">
          <AiReport text={text ?? ''} className="text-xs leading-relaxed" locate={locate} />
          {locatable && (
            <p className="mt-3 text-[10px] text-faint">Click a quoted line to show it in the diff.</p>
          )}
        </div>
      )}
      <AiResultDialog
        open={expanded && !!text}
        onOpenChange={(open) => !open && setExpanded(false)}
        title={title}
        icon={icon}
        text={text ?? ''}
        locate={
          locate
            ? {
                canLocate: locate.canLocate,
                onLocate: (snippet) => {
                  setExpanded(false);
                  onLocate(snippet);
                },
              }
            : undefined
        }
      />
    </div>
  );
}
