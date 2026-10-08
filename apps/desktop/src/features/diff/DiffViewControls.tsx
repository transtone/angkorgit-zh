import { Columns2, FileText, Files, Info, Rows3, SlidersHorizontal, Space, WholeWord, WrapText } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Hint,
  cn,
} from '@angkorgit/design-system';
import { useUi } from '@/features/ui/store';

function MenuNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-1 mb-0.5 mt-1 flex items-start gap-2 rounded-md bg-surface-raised px-2 py-1.5 text-[11px] leading-snug text-muted">
      <Info className="mt-px size-3.5 shrink-0 text-faint" />
      <span>{children}</span>
    </div>
  );
}

export function DiffLayoutToggle() {
  const diffLayout = useUi((s) => s.diffLayout);
  const setDiffLayout = useUi((s) => s.setDiffLayout);
  return (
    <div className="flex shrink-0 items-center rounded-md bg-surface-raised/60 p-0.5" role="group" aria-label="Diff layout">
      <Hint label="One file at a time">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Show one file"
          aria-pressed={diffLayout === 'file'}
          className={cn('h-6 w-7', diffLayout === 'file' && 'bg-background text-foreground shadow-soft')}
          onClick={() => setDiffLayout('file')}
        >
          <FileText className="size-3.5" />
        </Button>
      </Hint>
      <Hint label="Every changed file on one page">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Show all files"
          aria-pressed={diffLayout === 'all'}
          className={cn('h-6 w-7', diffLayout === 'all' && 'bg-background text-foreground shadow-soft')}
          onClick={() => setDiffLayout('all')}
        >
          <Files className="size-3.5" />
        </Button>
      </Hint>
    </div>
  );
}

export function DiffViewControls({
  wrapDisabled = false,
  notes,
}: {
  wrapDisabled?: boolean;
  notes?: React.ReactNode;
}) {
  const diffView = useUi((s) => s.diffView);
  const setDiffView = useUi((s) => s.setDiffView);
  const wordDiff = useUi((s) => s.wordDiff);
  const setWordDiff = useUi((s) => s.setWordDiff);
  const ignoreWhitespace = useUi((s) => s.ignoreWhitespace);
  const setIgnoreWhitespace = useUi((s) => s.setIgnoreWhitespace);
  const fullFileDiff = useUi((s) => s.fullFileDiff);
  const setFullFileDiff = useUi((s) => s.setFullFileDiff);
  const wrapLines = useUi((s) => s.wrapLines);
  const setWrapLines = useUi((s) => s.setWrapLines);
  return (
    <>
      <Hint label="内联 diff">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="内联 diff"
          className={cn(diffView === 'inline' && 'bg-surface-raised text-foreground')}
          onClick={() => setDiffView('inline')}
        >
          <Rows3 className="size-3.5" />
        </Button>
      </Hint>
      <Hint label="并排 diff">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="并排 diff"
          className={cn(diffView === 'split' && 'bg-surface-raised text-foreground')}
          onClick={() => setDiffView('split')}
        >
          <Columns2 className="size-3.5" />
        </Button>
      </Hint>
      <DropdownMenu>
        <Hint
          label={
            ignoreWhitespace
              ? '视图选项。已忽略空白字符，代码块与单行暂存已停用：当前显示的块不是 Git 会实际应用的补丁。'
              : '视图选项'
          }
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="视图选项"
              className={cn((wordDiff || wrapLines || fullFileDiff || ignoreWhitespace) && 'text-primary')}
            >
              <SlidersHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>视图选项</DropdownMenuLabel>
          <DropdownMenuCheckboxItem icon={<WholeWord />} checked={wordDiff} onCheckedChange={(v) => setWordDiff(v === true)}>
            词级 diff
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem icon={<Space />} checked={ignoreWhitespace} onCheckedChange={(v) => setIgnoreWhitespace(v === true)}>
            忽略空白字符
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            icon={<WrapText />}
            checked={wrapLines}
            disabled={wrapDisabled}
            onCheckedChange={(v) => setWrapLines(v === true)}
          >
            自动换行
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem icon={<FileText />} checked={fullFileDiff} onCheckedChange={(v) => setFullFileDiff(v === true)}>
            显示整个文件
          </DropdownMenuCheckboxItem>
          {notes}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export { MenuNote };
