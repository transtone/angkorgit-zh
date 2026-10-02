import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Kbd,
  cn,
} from '@angkorgit/design-system';
import {
  chordFromEvent,
  chordId,
  chordLabels,
  chordProblem,
  chordText,
  parseChordId,
  type KeyChord,
} from '@angkorgit/core';
import { useRepo } from './store';
import { useSettings } from '@/features/settings/store';
import { useUi, type RepoShortcutPreset } from '@/features/ui/store';
import { basename, isMac } from '@/shared/utils';

const MODIFIER_WORDS = isMac ? '⌃, ⌥ or ⌘' : 'Ctrl or Alt';

export function repoDisplayName(path: string, recents: Array<{ path: string; name: string }>): string {
  return recents.find((r) => r.path === path)?.name ?? basename(path);
}

export function RepoShortcutDialog() {
  const dialog = useUi((s) => s.dialog);
  const dialogContext = useUi((s) => s.dialogContext);
  const closeDialog = useUi((s) => s.closeDialog);
  const shortcuts = useSettings((s) => s.repoShortcuts);
  const setRepoShortcut = useSettings((s) => s.setRepoShortcut);
  const recents = useRepo((s) => s.recents);

  const open =
    dialog === 'repoShortcut' && !!dialogContext && typeof dialogContext === 'object' && 'repoPath' in dialogContext;
  const repoPath = open ? (dialogContext as RepoShortcutPreset).repoPath : '';
  const name = repoDisplayName(repoPath, recents);
  const current = shortcuts[repoPath] ?? null;
  const [draft, setDraft] = useState<KeyChord | null>(null);

  useEffect(() => {
    if (open) setDraft(current ? parseChordId(current) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, repoPath]);

  const draftId = draft ? chordId(draft) : null;
  const problem = draft ? chordProblem(draft, isMac) : null;
  const takenBy = draftId
    ? Object.entries(shortcuts).find(([path, id]) => path !== repoPath && id === draftId)?.[0]
    : undefined;
  const canSave = !!draftId && !problem && draftId !== current;

  const save = () => {
    if (!draft || !draftId || !canSave) return;
    setRepoShortcut(repoPath, draftId);
    toast.success(`${chordText(draft, isMac)} 现在可用于切换到 ${name}`);
    closeDialog();
  };
  const remove = () => {
    setRepoShortcut(repoPath, null);
    toast.success(`已移除快捷键： ${name}`);
    closeDialog();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' || e.key === 'Tab') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Backspace' || e.key === 'Delete') {
      setDraft(null);
      return;
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      save();
      return;
    }
    const chord = chordFromEvent(e.nativeEvent);
    if (chord) setDraft(chord);
  };

  const hint = !draft
    ? current
      ? '按下新按键以更改，或按退格键清除。'
      : `字母、数字或 F 键，搭配 ${MODIFIER_WORDS}。`
    : problem === 'no_modifier'
      ? `请添加 ${MODIFIER_WORDS}，避免打字时误触发。`
      : problem === 'reserved'
        ? 'AngKorGit 已占用此快捷键。'
        : takenBy
          ? `当前用于切换到 ${repoDisplayName(takenBy, recents)}。保存将改绑至此处。`
          : draftId === current
            ? '这是当前设置的快捷键。'
            : `Press ${chordText(draft, isMac)} 在任意位置按下 ${name}.`;
  const tone = problem ? 'text-danger' : takenBy ? 'text-primary' : 'text-muted';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeDialog()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>键盘快捷键</DialogTitle>
          <DialogDescription>
            按下用于在 AngKorGit 任意位置直接切换到 <span className="font-medium text-foreground">{name}</span> from anywhere
            in AngKorGit, even when it is not open.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <div
            role="textbox"
            aria-label="快捷键"
            aria-readonly
            tabIndex={0}
            autoFocus
            data-shortcut-capture
            data-shortcut-problem={problem ?? undefined}
            onKeyDown={onKeyDown}
            className={cn(
              'flex h-16 items-center justify-center gap-1.5 rounded-md border border-dashed bg-surface-raised/50 outline-none transition-colors',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30',
              problem ? 'border-danger/60' : 'border-border',
            )}
          >
            {draft ? (
              chordLabels(draft, isMac).map((label, index) => (
                <Kbd key={index} className="h-8 min-w-8 px-2.5 text-sm text-foreground">
                  {label}
                </Kbd>
              ))
            ) : (
              <span className="text-sm text-faint">按下按键组合</span>
            )}
          </div>
          <p className={cn('text-xs', tone)} data-shortcut-hint>
            {hint}
          </p>
        </div>
        <DialogFooter>
          {current && (
            <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={remove}>
              移除快捷键
            </Button>
          )}
          <Button variant="ghost" onClick={closeDialog}>
            取消
          </Button>
          <Button disabled={!canSave} onClick={save}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
