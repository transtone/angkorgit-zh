import { Fragment, useMemo } from 'react';
import { parseAiReport, parseAiTextSegments, type AiReportBlock, type AiSeverity, type AiVerdictTone } from '@angkorgit/core';
import { Badge, cn } from '@angkorgit/design-system';
import { AiText } from './AiText';

export interface AiReportLocate {
  canLocate: (snippet: string) => boolean;
  onLocate: (snippet: string) => void;
}

const SEVERITY_TONE: Record<AiSeverity, 'danger' | 'primary' | 'neutral'> = {
  bug: 'danger',
  risk: 'primary',
  nit: 'neutral',
};

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

function Inline({ text, locate }: { text: string; locate?: AiReportLocate }) {
  return (
    <>
      {parseAiTextSegments(text).map((segment, index) => {
        if (segment.kind === 'bold') {
          return (
            <strong key={index} className="font-semibold text-foreground">
              {segment.text}
            </strong>
          );
        }
        if (segment.kind === 'code') {
          if (locate?.canLocate(segment.text)) {
            return (
              <button
                key={index}
                type="button"
                title="Show this line in the diff"
                onClick={() => locate.onLocate(segment.text)}
                className={cn(
                  'rounded bg-surface-raised px-1 py-px text-left font-mono text-[0.9em] text-foreground',
                  'underline decoration-primary/50 decoration-dotted underline-offset-2 transition-colors',
                  'hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                )}
              >
                {segment.text}
              </button>
            );
          }
          return (
            <code key={index} className="rounded bg-surface-raised px-1 py-px font-mono text-[0.9em]">
              {segment.text}
            </code>
          );
        }
        return <Fragment key={index}>{segment.text}</Fragment>;
      })}
    </>
  );
}

function Block({ block, locate }: { block: AiReportBlock; locate?: AiReportLocate }) {
  if (block.kind === 'paragraph') {
    return (
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground/90">
        <Inline text={block.text} locate={locate} />
      </p>
    );
  }
  return (
    <li className="flex items-start gap-2">
      {block.severity ? (
        <Badge tone={SEVERITY_TONE[block.severity]} className="mt-px h-4 shrink-0 px-1.5 text-[10px] uppercase tracking-wide">
          {block.severity}
        </Badge>
      ) : (
        <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-foreground/35" />
      )}
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere] text-foreground/90">
        <Inline text={block.text} locate={locate} />
      </span>
    </li>
  );
}

export function AiReport({ text, className, locate }: { text: string; className?: string; locate?: AiReportLocate }) {
  const report = useMemo(() => parseAiReport(text), [text]);
  if (!report.structured) return <AiText text={text} className={className} />;

  return (
    <div className={cn('min-w-0 space-y-4 font-sans', className)}>
      {report.sections.map((section, index) => {
        const isVerdict = section.label !== null && /^verdict$/i.test(section.label) && report.verdict;
        return (
          <section key={index} data-ai-section={section.label ?? undefined}>
            {section.label && (
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint">{section.label}</h4>
            )}
            {isVerdict && report.verdict ? (
              <p className={cn('flex items-start gap-2 font-medium [overflow-wrap:anywhere]', VERDICT_TEXT[report.verdict.tone])}>
                <span aria-hidden className={cn('mt-[0.45em] size-2 shrink-0 rounded-full', VERDICT_DOT[report.verdict.tone])} />
                <span className="min-w-0 flex-1">
                  <Inline text={report.verdict.text} locate={locate} />
                </span>
              </p>
            ) : (
              <div className="space-y-2">
                {groupBlocks(section.blocks).map((group, groupIndex) =>
                  group.kind === 'list' ? (
                    <ul key={groupIndex} className="space-y-1.5">
                      {group.blocks.map((block, blockIndex) => (
                        <Block key={blockIndex} block={block} locate={locate} />
                      ))}
                    </ul>
                  ) : (
                    <Block key={groupIndex} block={group.block} locate={locate} />
                  ),
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

type BlockGroup = { kind: 'list'; blocks: AiReportBlock[] } | { kind: 'single'; block: AiReportBlock };

function groupBlocks(blocks: AiReportBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  for (const block of blocks) {
    const last = groups[groups.length - 1];
    if (block.kind === 'bullet') {
      if (last?.kind === 'list') last.blocks.push(block);
      else groups.push({ kind: 'list', blocks: [block] });
    } else {
      groups.push({ kind: 'single', block });
    }
  }
  return groups;
}
