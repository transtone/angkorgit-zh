import { toast } from 'sonner';
import type { RepoGroup } from '@angkorgit/core';
import { ipc } from '@/core/ipc';
import { confirmDialog } from '@/components/confirm';
import { useRepo } from './store';
import { closeRepoTabs } from './tabs';
import { useSettings } from '@/features/settings/store';
import { useUi } from '@/features/ui/store';

export function repoGroupColor(color: number): string {
  return `hsl(var(--graph-${color % 10}))`;
}

export function repoGroupTint(color: number): string {
  return `hsl(var(--graph-${color % 10}) / 0.15)`;
}


export function plural(count: number, noun: string): string {
  if (count === 1) return `1 ${noun}`;
  return `${count} ${noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`}`;
}

export async function openRepoGroup(group: RepoGroup, paths: readonly string[], ensureRepoRoute?: () => void): Promise<void> {
  if (useRepo.getState().opening !== null) return;
  const exists = await ipc.pathsExist([...paths]);
  const present = paths.filter((_, index) => exists[index]);
  const missing = paths.length - present.length;
  if (present.length === 0) {
    toast.error(
      paths.length === 0
        ? `${group.name} 暂无仓库`
        : `${group.name} 中的文件夹均已不存在`,
    );
    return;
  }
  const ui = useUi.getState();
  for (const path of present) ui.addRepoTab(path);
  const current = useRepo.getState().repo?.path;
  if (!current || !present.includes(current)) {
    try {
      await useRepo.getState().open(present[0]);
    } catch (error) {
      ui.closeRepoTab(present[0]);
      toast.error(`无法打开 ${present[0].split('/').pop()}：${(error as { message?: string }).message ?? error}`);
      return;
    }
  }
  ensureRepoRoute?.();
  toast.success(`${group.name}：已在标签页中打开 ${present.length} 个仓库`, {
    description: missing > 0 ? `${missing} 个文件夹已不存在，未予打开。` : undefined,
  });
}

export function closeRepoGroup(group: RepoGroup, paths: readonly string[]): void {
  const open = useUi.getState().repoTabs.filter((tab) => paths.includes(tab));
  if (open.length === 0) return;
  closeRepoTabs(open);
  toast.success(`已关闭来自 ${group.name} 的 ${open.length} 个标签页`);
}

export async function deleteRepoGroup(group: RepoGroup, repoCount: number): Promise<boolean> {
  if (repoCount > 0) {
    const ok = await confirmDialog({
      title: `解散分组“${group.name}”？`,
      description: `该分组将被移除。其中的 ${repoCount} 个仓库仍会保留在最近列表中，已打开的标签页也将保持打开。`,
      confirmLabel: '解散分组',
      destructive: true,
    });
    if (!ok) return false;
  }
  useSettings.getState().removeRepoGroup(group.id);
  toast.success(`已解散分组 ${group.name}`);
  return true;
}
