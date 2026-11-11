import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Folder } from 'lucide-react';
import { Button, Hint, cn } from '@angkorgit/design-system';

export interface TreeFolder<T> {
  name: string;
  path: string;
  folders: TreeFolder<T>[];
  files: T[];
  count: number;
}

export function folderFiles<T>(folder: TreeFolder<T>, into: T[] = []): T[] {
  into.push(...folder.files);
  for (const child of folder.folders) folderFiles(child, into);
  return into;
}

function buildFileTree<T>(items: T[], pathOf: (item: T) => string): TreeFolder<T> {
  interface Node {
    name: string;
    path: string;
    folders: Map<string, Node>;
    files: T[];
  }
  const root: Node = { name: '', path: '', folders: new Map(), files: [] };
  for (const item of items) {
    const parts = pathOf(item).split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const name = parts[i];
      let child = node.folders.get(name);
      if (!child) {
        child = {
          name,
          path: node.path ? `${node.path}/${name}` : name,
          folders: new Map(),
          files: [],
        };
        node.folders.set(name, child);
      }
      node = child;
    }
    node.files.push(item);
  }
  const finalize = (node: Node): TreeFolder<T> => {
    let current = node;
    let name = node.name;
    while (name !== '' && current.folders.size === 1 && current.files.length === 0) {
      const only = [...current.folders.values()][0];
      name = `${name}/${only.name}`;
      current = only;
    }
    const folders = [...current.folders.values()]
      .map(finalize)
      .sort((a, b) => a.name.localeCompare(b.name));
    const files = [...current.files].sort((a, b) => pathOf(a).localeCompare(pathOf(b)));
    return {
      name,
      path: current.path,
      folders,
      files,
      count: files.length + folders.reduce((sum, f) => sum + f.count, 0),
    };
  };
  return finalize(root);
}

function FolderRow<T>({
  folder,
  depth,
  open,
  onToggle,
  control,
}: {
  folder: TreeFolder<T>;
  depth: number;
  open: boolean;
  onToggle: () => void;
  control: React.ReactNode;
}) {
  const chevron = <ChevronRight className={cn('size-[15px] shrink-0 transition-transform', open && 'rotate-90')} />;
  const label = (
    <>
      <Folder className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left font-medium">{folder.name}</span>
      <span className="text-[10px] text-faint">{folder.count}</span>
    </>
  );
  if (!control) {
    return (
      <button
        type="button"
        className="flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-xs text-muted hover:bg-surface-raised"
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={onToggle}
      >
        {chevron}
        {label}
      </button>
    );
  }
  return (
    <div
      data-tree-folder={folder.path}
      className="group/folder flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-xs text-muted hover:bg-surface-raised"
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      <button
        type="button"
        aria-label={`${open ? '折叠' : '展开'} ${folder.name}`}
        className="-mr-1 flex shrink-0 items-center"
        onClick={onToggle}
      >
        {chevron}
      </button>
      {control}
      <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5" onClick={onToggle}>
        {label}
      </button>
    </div>
  );
}

function TreeLevel<T>({
  folder,
  depth,
  collapsed,
  onToggle,
  renderFile,
  folderControl,
}: {
  folder: TreeFolder<T>;
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  renderFile: (item: T, depth: number) => React.ReactNode;
  folderControl?: (folder: TreeFolder<T>) => React.ReactNode;
}) {
  return (
    <>
      {folder.folders.map((child) => (
        <div key={child.path}>
          <FolderRow
            folder={child}
            depth={depth}
            open={!collapsed.has(child.path)}
            onToggle={() => onToggle(child.path)}
            control={folderControl?.(child) ?? null}
          />
          {!collapsed.has(child.path) && (
            <TreeLevel
              folder={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              renderFile={renderFile}
              folderControl={folderControl}
            />
          )}
        </div>
      ))}
      {folder.files.map((item) => renderFile(item, depth))}
    </>
  );
}

function folderPaths<T>(folder: TreeFolder<T>, into: string[] = []): string[] {
  for (const child of folder.folders) {
    into.push(child.path);
    folderPaths(child, into);
  }
  return into;
}

export interface FileTreeFold {
  epoch: number;
  mode: 'collapse' | 'expand';
}

export interface FileTreeFoldState {
  hasFolders: boolean;
  allCollapsed: boolean;
}

export const INITIAL_FOLD: FileTreeFold = { epoch: 0, mode: 'expand' };

export function nextFold(fold: FileTreeFold, mode: FileTreeFold['mode']): FileTreeFold {
  return { epoch: fold.epoch + 1, mode };
}

export function FileTreeFoldButton({
  state,
  onFold,
}: {
  state: FileTreeFoldState | null;
  onFold: (mode: FileTreeFold['mode']) => void;
}) {
  if (!state?.hasFolders) return null;
  const label = state.allCollapsed ? '展开全部文件夹' : '折叠全部文件夹';
  return (
    <Hint label={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        onClick={() => onFold(state.allCollapsed ? 'expand' : 'collapse')}
      >
        {state.allCollapsed ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />}
      </Button>
    </Hint>
  );
}

export function treeIndent(depth: number): number {
  return 8 + depth * 14 + 14;
}

export function FileTree<T>({
  items,
  pathOf,
  renderFile,
  fold,
  onFoldState,
  defaultCollapsed,
  folderControl,
}: {
  items: T[];
  pathOf: (item: T) => string;
  renderFile: (item: T, depth: number) => React.ReactNode;
  fold?: FileTreeFold;
  onFoldState?: (state: FileTreeFoldState) => void;
  defaultCollapsed?: (folderPath: string) => boolean;
  folderControl?: (folder: TreeFolder<T>) => React.ReactNode;
}) {
  const root = useMemo(() => buildFileTree(items, pathOf), [items, pathOf]);
  const paths = useMemo(() => folderPaths(root), [root]);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(defaultCollapsed ? paths.filter((p) => defaultCollapsed(p)) : []),
  );
  useEffect(() => {
    if (!fold || fold.epoch === 0) return;
    setCollapsed(fold.mode === 'collapse' ? new Set(paths) : new Set());
  }, [fold, paths]);
  const report = useRef(onFoldState);
  report.current = onFoldState;
  useEffect(() => {
    report.current?.({
      hasFolders: paths.length > 0,
      allCollapsed: paths.length > 0 && paths.every((p) => collapsed.has(p)),
    });
  }, [paths, collapsed]);
  useEffect(() => () => report.current?.({ hasFolders: false, allCollapsed: false }), []);
  const onToggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  return (
    <TreeLevel
      folder={root}
      depth={0}
      collapsed={collapsed}
      onToggle={onToggle}
      renderFile={renderFile}
      folderControl={folderControl}
    />
  );
}
