import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, GitBranch, GitPullRequest, Pencil, RefreshCw, Sparkles, ZoomIn } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Hint,
  cn,
} from '@angkorgit/design-system';
import { appVersion, openExternal } from '@/core/ipc';
import { useForge } from '@/features/forge/store';
import { useRepo } from '@/features/repository/store';
import { useSettings } from '@/features/settings/store';
import { useUi } from '@/features/ui/store';
import { capCount, currentPullRequestUrl, timeAgo } from '@/shared/utils';
import { AI_PROVIDER_PRESETS, CLI_AGENTS, forgeNoun, parseForgeRemote, parseRemote, pickForgeRemote } from '@angkorgit/core';

const ZOOM_LEVELS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];

export function StatusBar() {
  const repo = useRepo((s) => s.repo);
  const status = useRepo((s) => s.status);
  const remotes = useRepo((s) => s.remotes);
  const lastFetchAt = useRepo((s) => s.lastFetchAt);
  const fetchFailures = useRepo((s) => s.fetchFailures);
  const autoFetchMinutes = useSettings((s) => s.autoFetchMinutes);
  const [, tickClock] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tickClock((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const zoom = useSettings((s) => s.zoom);
  const setZoom = useSettings((s) => s.setZoom);
  const ai = useSettings((s) => s.ai);
  const aiStatus = useSettings((s) => s.aiStatus);
  const aiConfigured =
    ai.provider === 'cli'
      ? !!ai.cliAgent
      : ai.provider === 'ollama' || ai.provider === 'lmstudio'
        ? !!ai.model
        : !!ai.apiKey && !!ai.model;
  const aiName =
    ai.provider === 'cli'
      ? ai.cliAgent
        ? CLI_AGENTS[ai.cliAgent].label
        : ''
      : AI_PROVIDER_PRESETS[ai.provider].label;
  const aiLabel = aiConfigured ? aiName : 'Set up AI';
  const aiHint = !aiConfigured
    ? '尚未设置 AI 提供商。点击在设置中选择一个。'
    : aiStatus === 'ok'
      ? `${aiName} 已响应上次连接测试。点击打开 AI 设置。`
      : aiStatus === 'fail'
        ? `${aiName} 未响应上次连接测试。点击打开 AI 设置。`
        : aiStatus === 'stale'
          ? `自 ${aiName} 上次测试后 AI 设置已更改。点击打开并重新运行测试连接。`
          : `${aiName} 已设置，但连接尚未测试——点击打开 AI 设置并运行测试连接。`;
  const [version, setVersion] = useState('');

  useEffect(() => {
    void appVersion().then(setVersion);
  }, []);

  const branches = useRepo((s) => s.branches);
  const changes = status?.files.length ?? 0;
  const branch = repo?.isDetached ? `游离于 ${repo.headOid?.slice(0, 8) ?? '?'}` : repo?.headBranch;
  const headUpstream = branches.find((b) => !b.isRemote && b.isHead)?.upstream ?? null;
  const pickedRemoteUrl = pickForgeRemote(remotes, headUpstream)?.url ?? null;
  const prUrl = currentPullRequestUrl(repo, pickedRemoteUrl ?? undefined);
  const unknownForgeHost =
    pickedRemoteUrl && !parseForgeRemote(pickedRemoteUrl) ? parseRemote(pickedRemoteUrl)?.host ?? null : null;
  const forgeRepoPath = useForge((s) => s.repoPath);
  const forgeRemote = useForge((s) => s.remote);
  const forgeAccount = useForge((s) => s.hasAccount);
  const openDialog = useUi((s) => s.openDialog);
  const forgeCurrent = forgeRepoPath !== null && forgeRepoPath === repo?.path;
  const createInApp = forgeCurrent && !!forgeRemote && forgeAccount;
  const prNoun = forgeNoun(forgeCurrent ? forgeRemote?.kind : null);

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-border-subtle bg-surface px-3 text-[11px] text-muted">
      <span className="flex min-w-0 items-center gap-1.5">
        <GitBranch className="size-3 shrink-0" />
        <span className="max-w-56 truncate font-mono">{branch ?? '—'}</span>
      </span>
      {status && (status.ahead > 0 || status.behind > 0) && (
        <span className="flex items-center gap-1.5">
          {status.ahead > 0 && (
            <Hint label={`${status.ahead} 个提交待推送`}>
              <span className="flex items-center gap-0.5 text-success">
                <ArrowUp className="size-3" />
                {capCount(status.ahead)}
              </span>
            </Hint>
          )}
          {status.behind > 0 && (
            <Hint label={`${status.behind} 个提交待拉取`}>
              <span className="flex items-center gap-0.5 text-info">
                <ArrowDown className="size-3" />
                {capCount(status.behind)}
              </span>
            </Hint>
          )}
        </span>
      )}
      {lastFetchAt !== null && (
        <Hint
          label={`上次获取于 ${new Date(lastFetchAt).toLocaleTimeString()}。${
            autoFetchMinutes
              ? `切换到本标签页、窗口获得焦点时以及每 ${autoFetchMinutes} 分钟会自动获取。`
              : '自动拉取已在设置 → Git 中关闭。'
          }`}
        >
          <span className="flex items-center gap-1 text-faint" data-last-fetch>
            <RefreshCw className="size-3" />
            已获取 · {timeAgo(lastFetchAt / 1000)}
          </span>
        </Hint>
      )}
      {fetchFailures.length > 0 && (
        <Hint label={`获取失败：${fetchFailures.join(', ')}`}>
          <span className="flex items-center gap-1 text-faint" data-fetch-status>
            <RefreshCw className="size-3" />
            获取未完成
          </span>
        </Hint>
      )}
      <span className={cn('flex items-center gap-1.5', changes > 0 && 'text-primary')}>
        {changes > 0 ? <Pencil className="size-3" /> : <Check className="size-3 text-success" />}
        {changes > 0 ? `${changes} 个更改` : '干净'}
      </span>
      {!prUrl && unknownForgeHost && (
        <Hint
          label={`AngKorGit 无法识别 ${unknownForgeHost}。请在设置中为其连接账户，拉取请求便会显示在这里。`}
        >
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1 text-faint hover:bg-surface-raised hover:text-foreground"
            data-unknown-forge-host
            onClick={() => openDialog('settings', { section: 'accounts' })}
          >
            <GitPullRequest className="size-3" />
            连接 {unknownForgeHost}
          </button>
        </Hint>
      )}
      {prUrl && (
        <Hint
          label={
            createInApp
              ? `为 ${repo?.headBranch} 创建 ${prNoun}，无需离开 AngKorGit`
              : `为 ${repo?.headBranch} 打开预填的拉取请求页面`
          }
        >
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1 hover:bg-surface-raised hover:text-foreground"
            onClick={() =>
              createInApp ? openDialog('createPullRequest') : void openExternal(prUrl)
            }
          >
            <GitPullRequest className="size-3" />
            Create {prNoun}
          </button>
        </Hint>
      )}

      <span className="flex-1" />

      <Hint label={aiHint}>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1 hover:bg-surface-raised hover:text-foreground"
          aria-label={aiLabel}
          data-ai-status={aiConfigured ? aiStatus : 'unconfigured'}
          onClick={() => openDialog('settings', { section: 'ai' })}
        >
          <Sparkles
            className={cn(
              'size-3',
              aiConfigured && aiStatus === 'ok'
                ? 'text-success'
                : aiConfigured && aiStatus === 'fail'
                  ? 'text-danger'
                  : 'text-faint',
            )}
          />
          {aiLabel}
        </button>
      </Hint>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1 hover:bg-surface-raised hover:text-foreground"
            aria-label="界面缩放"
          >
            <ZoomIn className="size-3" />
            {Math.round(zoom * 100)}%
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          {ZOOM_LEVELS.map((level) => (
            <DropdownMenuItem key={level} onClick={() => setZoom(level / 100)}>
              <Check className={cn('size-3.5', Math.round(zoom * 100) !== level && 'invisible')} />
              {level}%
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Hint label="检查更新">
        <button
          type="button"
          className="rounded px-1 hover:bg-surface-raised hover:text-foreground"
          onClick={() => {
            toast.loading('正在检查更新…', { id: 'updater' });
            void import('@/features/updater/check')
              .then(({ checkForUpdates }) => checkForUpdates({ silent: false }))
              .finally(() => toast.dismiss('updater'));
          }}
        >
          {version ? `v${version}` : 'AngKorGit'}
        </button>
      </Hint>
    </footer>
  );
}
