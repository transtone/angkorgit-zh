import { CircleHelp, Cloud, Monitor, TriangleAlert } from 'lucide-react';
import { pickRemote } from '@angkorgit/core';
import type { BranchInfo, RemoteInfo, TagRemoteState } from '@angkorgit/core';
import { cn } from '@angkorgit/design-system';
import { useRepo } from './store';

type RemoteStatuses = Record<string, {
  checkedAt: number | null;
  error: string | null;
  tags: Record<string, TagRemoteState>;
}>;

const labels = {
  synced: '已同步',
  localOnly: '仅本地',
  different: '与远端不一致',
  unknown: '状态未知',
};

export function tagRemoteSummary(
  name: string,
  { tagRemoteStatus, remotes, branches }: {
    tagRemoteStatus: RemoteStatuses;
    remotes: RemoteInfo[];
    branches: BranchInfo[];
  },
): { status: TagRemoteState | 'unknown'; title: string; remote: string | null } {
  const remote = pickRemote(remotes, branches.find((branch) => !branch.isRemote && branch.isHead)?.upstream)?.name ?? null;
  const statusFor = (remoteName: string) => {
    const entry = tagRemoteStatus[remoteName];
    return entry?.checkedAt != null && !entry.error ? entry.tags[name] ?? 'unknown' : 'unknown';
  };
  const title = remotes.length === 0 ? `${name} · 未配置远端` : `${name} · 状态图标对应远端：${remote}\n` + remotes.map(({ name: remoteName }) => {
    const entry = tagRemoteStatus[remoteName];
    const checked = entry?.checkedAt != null
      ? `上次检查：${new Date(entry.checkedAt).toLocaleString()}`
      : entry?.error ? '查询失败' : '未检查';
    return `${name} · ${remoteName}: ${labels[statusFor(remoteName)]}（${checked}）`;
  }).join('\n');
  return { status: remote ? statusFor(remote) : 'unknown', title, remote };
}

export function useTagRemoteStatus(name: string) {
  const tagRemoteStatus = useRepo((state) => state.tagRemoteStatus);
  const remotes = useRepo((state) => state.remotes);
  const branches = useRepo((state) => state.branches);
  return tagRemoteSummary(name, { tagRemoteStatus, remotes, branches });
}

export function TagRemoteStatus({ name, className }: { name: string; className?: string }) {
  const { status, title } = useTagRemoteStatus(name);
  const Icon = { synced: Cloud, localOnly: Monitor, different: TriangleAlert, unknown: CircleHelp }[status];
  return (
    <span
      data-tag-remote-status={status}
      data-tag-remote={name}
      role="img"
      aria-label={title}
      title={title}
      className={cn('inline-flex shrink-0 items-center', status === 'different' ? 'text-amber-500' : 'text-muted-foreground', className)}
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </span>
  );
}
