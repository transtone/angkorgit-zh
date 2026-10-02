import { useEffect, useMemo, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button, Hint, Kbd, Separator } from '@angkorgit/design-system';
import { useShortcuts } from '@/shared/useShortcuts';
import { scrollToFraction, type ChangeBlock } from './DiffMinimap';

export type JumpDirection = 1 | -1;
export type ChangeStepResult = 'stepped' | 'edge' | 'none';

const POSITION_EPSILON = 0.002;
const CURSOR_TOLERANCE_PX = 2;
const SMOOTH_SCROLL_SETTLE_MS = 600;

function viewedFraction(el: HTMLElement): number {
  return (el.scrollTop + el.clientHeight * 0.35) / el.scrollHeight;
}

function targetTop(el: HTMLElement, fraction: number): number {
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  return Math.min(max, Math.max(0, fraction * el.scrollHeight - el.clientHeight * 0.35));
}

export function jumpToChange(el: HTMLElement, blocks: ChangeBlock[], direction: JumpDirection): void {
  if (blocks.length === 0 || el.scrollHeight === 0) return;
  const current = viewedFraction(el);
  const next =
    direction === 1
      ? (blocks.find((b) => b.fraction > current + POSITION_EPSILON) ?? blocks[0])
      : ([...blocks].reverse().find((b) => b.fraction < current - POSITION_EPSILON) ?? blocks[blocks.length - 1]);
  scrollToFraction(el, next.fraction);
}

export interface ChangeCursor {
  blocks: ChangeBlock[];
  index: number;
  top: number;
  at: number;
}

export function nextChangeIndex(
  blocks: ChangeBlock[],
  position: number,
  cursor: number | null,
  direction: JumpDirection,
): number | null {
  if (blocks.length === 0) return null;
  const wrap = (index: number) => (index + blocks.length) % blocks.length;
  if (cursor !== null) return wrap(cursor + direction);
  const atIndex = blocks.findIndex((b) => Math.abs(b.fraction - position) <= POSITION_EPSILON);
  if (atIndex >= 0) return wrap(atIndex + direction);
  let before = -1;
  blocks.forEach((b, i) => {
    if (b.fraction < position) before = i;
  });
  return wrap(direction === 1 ? before + 1 : before);
}

export interface ChangeJump {
  jump: (direction: JumpDirection) => void;
  step: (direction: JumpDirection) => boolean;
  anchor: (index: number | null) => void;
}

let openDiffStepper: ((direction: JumpDirection) => boolean) | null = null;

export function stepOpenDiffChange(direction: JumpDirection): ChangeStepResult {
  if (!openDiffStepper) return 'none';
  return openDiffStepper(direction) ? 'stepped' : 'edge';
}

export function useChangeJump(
  blocks: ChangeBlock[],
  scrollRef: React.RefObject<HTMLElement>,
  options: { arrowKeys?: boolean; ready?: boolean } = {},
): ChangeJump {
  const cursorRef = useRef<ChangeCursor | null>(null);

  const jump = (direction: JumpDirection) => {
    const el = scrollRef.current;
    if (!el) return;
    cursorRef.current = null;
    jumpToChange(el, blocks, direction);
  };

  const anchor = (index: number | null) => {
    const el = scrollRef.current;
    if (!el || index === null) {
      cursorRef.current = null;
      return;
    }
    cursorRef.current = { blocks, index, top: el.scrollTop, at: 0 };
  };

  const step = (direction: JumpDirection): boolean => {
    if (options.ready === false) return true;
    const el = scrollRef.current;
    if (!el || blocks.length === 0) return false;
    const cursor = cursorRef.current;
    const settled =
      cursor !== null &&
      cursor.blocks === blocks &&
      (Math.abs(el.scrollTop - cursor.top) <= CURSOR_TOLERANCE_PX || Date.now() - cursor.at < SMOOTH_SCROLL_SETTLE_MS);
    const next = nextChangeIndex(blocks, viewedFraction(el), settled ? cursor.index : null, direction);
    if (next === null) return false;
    const fraction = blocks[next].fraction;
    cursorRef.current = { blocks, index: next, top: targetTop(el, fraction), at: Date.now() };
    scrollToFraction(el, fraction);
    return true;
  };

  const api = useRef<ChangeJump>({ jump, step, anchor });
  api.current = { jump, step, anchor };

  useShortcuts(
    useMemo(
      () => [
        { combo: 'p', handler: () => api.current.jump(-1), skipInInput: true },
        { combo: 'n', handler: () => api.current.jump(1), skipInInput: true },
      ],
      [],
    ),
  );

  const arrowKeys = options.arrowKeys ?? false;
  useEffect(() => {
    if (!arrowKeys) return;
    const stepper = (direction: JumpDirection) => api.current.step(direction);
    openDiffStepper = stepper;
    return () => {
      if (openDiffStepper === stepper) openDiffStepper = null;
    };
  }, [arrowKeys]);

  return { jump: (d) => api.current.jump(d), step: (d) => api.current.step(d), anchor: (i) => api.current.anchor(i) };
}

export function ChangeNavButtons({
  blocks,
  onJump,
  showCount = true,
}: {
  blocks: ChangeBlock[];
  onJump: (direction: JumpDirection) => void;
  showCount?: boolean;
}) {
  if (blocks.length === 0) return null;
  return (
    <>
      <Separator orientation="vertical" className="mx-1 h-4" />
      <Hint
        label={
          <span className="flex items-center gap-1">
            Previous change <Kbd>P</Kbd>
          </span>
        }
      >
        <Button variant="ghost" size="icon-sm" aria-label="Previous change" onClick={() => onJump(-1)}>
          <ChevronUp className="size-4" />
        </Button>
      </Hint>
      <Hint
        label={
          <span className="flex items-center gap-1">
            Next change <Kbd>N</Kbd>
          </span>
        }
      >
        <Button variant="ghost" size="icon-sm" aria-label="Next change" onClick={() => onJump(1)}>
          <ChevronDown className="size-4" />
        </Button>
      </Hint>
      {showCount && (
        <span className="text-[10px] text-faint">
          {blocks.length} change{blocks.length === 1 ? '' : 's'}
        </span>
      )}
    </>
  );
}
