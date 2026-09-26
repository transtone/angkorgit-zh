import type { ReactNode } from 'react';
import { cn } from '@angkorgit/design-system';

export function EmptyCard({
  icon,
  title,
  description,
  action,
  className,
  tone = 'primary',
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  tone?: 'primary' | 'success';
}) {
  return (
    <div
      data-empty-card
      className={cn(
        'mx-1 mb-1 mt-0.5 flex flex-col gap-2 rounded-lg border border-dashed border-border-subtle bg-surface-raised/40 p-3',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5',
            tone === 'success' ? 'bg-success/15 text-success' : 'bg-primary/15 text-primary',
          )}
        >
          {icon}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium text-foreground">{title}</span>
          <span className="text-[11px] leading-relaxed text-muted">{description}</span>
        </span>
      </div>
      {action}
    </div>
  );
}
