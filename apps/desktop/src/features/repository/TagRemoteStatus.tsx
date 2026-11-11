import { Cloud } from 'lucide-react';
import { pickRemote } from '@angkorgit/core';
import type { RemoteInfo, TagRemoteState } from '@angkorgit/core';
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
  { tagRemoteStatus, remotes, remoteName }: {
    tagRemoteStatus: RemoteStatuses;
    remotes: RemoteInfo[];
    remoteName?: string | null;
  },
): { status: TagRemoteState | 'unknown'; title: string; remote: string | null } {
  const remote = remoteName ?? remotes[0]?.name ?? null;
  const statusFor = (remoteName: string) => {
    const entry = tagRemoteStatus[remoteName];
    return entry?.checkedAt != null && !entry.error ? entry.tags[name] ?? 'unknown' : 'unknown';
  };
  const orderedRemotes = [...remotes].sort((a, b) => Number(b.name === remote) - Number(a.name === remote));
  const title = !remote ? `${name} · 未配置远端` : `${name} · ` + orderedRemotes.map(({ name: remoteName }) =>
    `${remoteName}：${labels[statusFor(remoteName)]}`,
  ).join('；');
  return { status: remote ? statusFor(remote) : 'unknown', title, remote };
}

export function useTagRemoteStatus(name: string, remoteName?: string) {
  const tagRemoteStatus = useRepo((state) => state.tagRemoteStatus);
  const remotes = useRepo((state) => state.remotes);
  const upstream = useRepo((state) => state.branches.find((branch) => branch.isHead && !branch.isRemote)?.upstream);
  const remote = remoteName ?? pickRemote(remotes, upstream)?.name;
  return tagRemoteSummary(name, { tagRemoteStatus, remotes, remoteName: remote });
}

export function TagRemoteStatus({ name, className, showTitle = true, remoteName }: { name: string; className?: string; showTitle?: boolean; remoteName?: string }) {
  const { status, title } = useTagRemoteStatus(name, remoteName);
  if (status !== 'synced') return null;
  return (
    <span
      data-tag-remote-status={status}
      data-tag-remote={name}
      role="img"
      aria-label={title}
      title={showTitle ? title : undefined}
      className={cn('inline-flex shrink-0 items-center text-muted-foreground', className)}
    >
      <Cloud className="size-3.5" aria-hidden="true" />
    </span>
  );
}
