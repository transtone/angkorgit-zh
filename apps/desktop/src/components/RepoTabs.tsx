import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, FolderTree, Keyboard, Plus, X } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Hint,
  cn,
} from '@angkorgit/design-system';
import { chordText, parseChordId } from '@angkorgit/core';
import { pickDirectory } from '@/core/ipc';
import { useRepo } from '@/features/repository/store';
import { killTerminalSession } from '@/features/terminal/sessions';
import { useSettings } from '@/features/settings/store';
import { useUi } from '@/features/ui/store';
import { isMac } from '@/shared/utils';

export function RepoTabs() {
  const repo = useRepo((s) => s.repo);
  const tabs = useUi((s) => s.repoTabs);
  const worktreeTabs = useUi((s) => s.worktreeTabs);
  const shortcuts = useSettings((s) => s.repoShortcuts);
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [draggingTab, setDraggingTab] = useState<string | null>(null);
  const [dropTab, setDropTab] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const activePath = repo?.path ?? null;
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !activePath) return;
    strip
      .querySelector(`[data-tab-path="${CSS.escape(activePath)}"]`)
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activePath, tabs]);

  const activate = (path: string) => {
    if (path === repo?.path) return;
    void useRepo
      .getState()
      .open(path)
      .catch((error) => {
        toast.error(
          `无法打开：${(error as { message?: string }).message ?? error}`,
        );
        useUi.getState().closeRepoTab(path);
        killTerminalSession(path);
      });
  };

  const close = (path: string) => {
    const remaining = tabs.filter((t) => t !== path);
    useUi.getState().closeRepoTab(path);
    killTerminalSession(path);
    if (repo?.path !== path) return;
    if (remaining.length > 0) activate(remaining[remaining.length - 1]);
    else useRepo.getState().close();
  };

  const addNew = () => {
    void (async () => {
      const dir = await pickDirectory('打开仓库');
      if (!dir) return;
      try {
        await useRepo.getState().open(dir);
      } catch (error) {
        toast.error(
          `无法打开仓库：${(error as { message?: string }).message ?? error}`,
        );
      }
    })();
  };

  const label = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  const shortcutFor = (path: string) => {
    const chord = shortcuts[path] ? parseChordId(shortcuts[path]) : null;
    return chord ? chordText(chord, isMac) : null;
  };
  const closeOthers = (path: string) => {
    for (const other of tabs) if (other !== path) close(other);
    if (repo?.path !== path) activate(path);
  };

  return (
    <div className="flex h-9 shrink-0 items-end gap-0.5 border-b border-border-subtle bg-surface px-2">
      <div
        ref={stripRef}
        className="scrollbar-none flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto"
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
      >
        {tabs.map((path) => {
          const active = path === repo?.path;
          return (
            <div
              key={path}
              role="tab"
              aria-selected={active}
              data-tab-path={path}
              title={worktreeTabs.includes(path) ? `${path}（工作树）` : path}
              draggable
              onDragStart={(e) => {
                setDraggingTab(path);
                e.dataTransfer.setData('text/angkorgit-repo-tab', path);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDraggingTab(null);
                setDropTab(null);
              }}
              onDragOver={(e) => {
                if (draggingTab && draggingTab !== path) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDropTab(path);
                }
              }}
              onDragLeave={() => setDropTab((t) => (t === path ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                const source = e.dataTransfer.getData('text/angkorgit-repo-tab');
                setDraggingTab(null);
                setDropTab(null);
                if (source && source !== path) useUi.getState().moveRepoTab(source, path);
              }}
              onClick={() => activate(path)}
              onContextMenu={(e) => {
                e.preventDefault();
                setTabMenu({ x: e.clientX, y: e.clientY, path });
              }}
              onAuxClick={(e) => {
                if (e.button === 1) close(path); // middle-click closes
              }}
              className={cn(
                'group flex h-8 min-w-0 max-w-44 shrink-0 cursor-default items-center gap-1.5 rounded-t-md border border-b-0 px-3 text-xs',
                active
                  ? 'border-border-subtle bg-background text-foreground'
                  : 'border-transparent text-muted hover:bg-surface-raised hover:text-foreground',
                draggingTab === path && 'opacity-40',
                dropTab === path && 'ring-1 ring-inset ring-primary/60',
              )}
            >
              {worktreeTabs.includes(path) && (
                <FolderTree
                  className={cn('size-3 shrink-0', active ? 'text-primary' : 'text-faint')}
                  aria-label="工作树"
                />
              )}
              <span className="min-w-0 truncate">{label(path)}</span>
              {shortcutFor(path) && (
                <span
                  className={cn(
                    'inline-flex h-4 shrink-0 items-center rounded px-1 font-mono text-[9px] font-medium tracking-wide text-primary',
                    active ? 'bg-primary/20' : 'bg-primary/15',
                  )}
                  data-tab-shortcut
                >
                  {shortcutFor(path)}
                </span>
              )}
              <button
                type="button"
                aria-label={`关闭 ${label(path)}`}
                className={cn(
                  'shrink-0 rounded-sm p-0.5 hover:bg-surface-overlay hover:text-foreground',
                  active ? 'text-muted' : 'text-transparent group-hover:text-muted',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  close(path);
                }}
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
      {tabMenu && (
        <DropdownMenu open onOpenChange={(o) => !o && setTabMenu(null)}>
          <DropdownMenuTrigger asChild>
            <span style={{ position: 'fixed', left: tabMenu.x, top: tabMenu.y }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom">
            <DropdownMenuLabel className="max-w-72 truncate font-mono">{tabMenu.path}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => useUi.getState().openDialog('repoShortcut', { repoPath: tabMenu.path })}>
              <Keyboard /> {shortcuts[tabMenu.path] ? '更改键盘快捷键…' : '键盘快捷键…'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard.writeText(tabMenu.path);
                toast.success('路径已复制');
              }}
            >
              <Copy /> 复制路径
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => close(tabMenu.path)}>
              <X /> 关闭标签页
            </DropdownMenuItem>
            <DropdownMenuItem disabled={tabs.length < 2} onClick={() => closeOthers(tabMenu.path)}>
              <X /> 关闭其他标签页
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Hint label="打开另一个仓库">
        <Button
          variant="ghost"
          size="icon-sm"
          className="mb-0.5 shrink-0"
          aria-label="打开另一个仓库"
          onClick={addNew}
        >
          <Plus className="size-4" />
        </Button>
      </Hint>
    </div>
  );
}
