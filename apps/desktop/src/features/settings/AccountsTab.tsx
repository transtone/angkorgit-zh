import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Github,
  Gitlab,
  Globe,
  KeyRound,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  cn,
} from '@angkorgit/design-system';
import { ipc, openExternal, type AccountCheckStatus, type HostingAccount } from '@/core/ipc';
import { timeAgo } from '@/shared/utils';
import { confirmDialog } from '@/components/confirm';
import { Field, SettingCard } from './SettingCard';

type ProviderKind = 'github' | 'gitlab' | 'gitlab-self' | 'bitbucket' | 'other';

interface ProviderPreset {
  label: string;
  defaultHost: string;
  hostEditable: boolean;
  tokenPage: (host: string) => string | null;
  tokenHint: React.ReactNode;
  usernameHint: string;
}

const FINE_GRAINED_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

const PROVIDERS: Record<ProviderKind, ProviderPreset> = {
  github: {
    label: 'GitHub',
    defaultHost: 'github.com',
    hostEditable: false,
    tokenPage: () => 'https://github.com/settings/tokens/new?scopes=repo&description=AngKorGit',
    tokenHint: (
      <>
        具有 repo 权限的 Classic token，或{' '}
        <a
          href={FINE_GRAINED_TOKEN_URL}
          className="text-primary hover:underline"
          onClick={(e) => {
            e.preventDefault();
            void openExternal(FINE_GRAINED_TOKEN_URL);
          }}
        >
          fine-grained token
        </a>{' '}
        具备 Contents 与拉取请求读写权限。
      </>
    ),
    usernameHint: '用户名（从令牌中检测到）',
  },
  gitlab: {
    label: 'GitLab.com',
    defaultHost: 'gitlab.com',
    hostEditable: false,
    tokenPage: () => 'https://gitlab.com/-/user_settings/personal_access_tokens',
    tokenHint: '具有“read_repository” + “write_repository”权限范围的个人访问令牌',
    usernameHint: '用户名（从令牌中检测到）',
  },
  'gitlab-self': {
    label: 'GitLab（自托管）',
    defaultHost: '',
    hostEditable: true,
    tokenPage: (host) => (host ? `http://${host}/-/user_settings/personal_access_tokens` : null),
    tokenHint: '具有“read_repository” + “write_repository”权限范围的个人访问令牌',
    usernameHint: '用户名（从令牌中检测到）',
  },
  bitbucket: {
    label: 'Bitbucket',
    defaultHost: 'bitbucket.org',
    hostEditable: false,
    tokenPage: () => 'https://id.atlassian.com/manage-profile/security/api-tokens',
    tokenHint: '具有 read:repository:bitbucket + write:repository:bitbucket 权限范围的 API 令牌',
    usernameHint: 'Atlassian 账户邮箱（已检测到你的 Bitbucket 用户名）',
  },
  other: {
    label: '其他主机',
    defaultHost: '',
    hostEditable: true,
    tokenPage: () => null,
    tokenHint: '用于 HTTPS git 访问的令牌或密码',
    usernameHint: 'username',
  },
};

export function providerIcon(provider: string) {
  if (provider === 'github') return <Github className="size-4" />;
  if (provider.startsWith('gitlab')) return <Gitlab className="size-4" />;
  return <Globe className="size-4" />;
}

function accountKey(account: Pick<HostingAccount, 'host' | 'username'>): string {
  return `${account.host}:${account.username}`;
}

export function parseExpiry(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const iso = raw.includes(' UTC') ? `${raw.replace(' ', 'T').replace(' UTC', '')}Z` : raw;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

async function validateToken(
  provider: ProviderKind,
  host: string,
  identity: string,
  token: string,
): Promise<{ login: string } | null | 'unreachable'> {
  try {
    if (provider === 'bitbucket') {
      if (!identity) {
        throw new Error('输入你的 Atlassian 账户邮箱以验证令牌');
      }
      const res = await ipc.httpRequest({
        url: 'https://api.bitbucket.org/2.0/user',
        method: 'GET',
        headers: {
          authorization: `Basic ${btoa(`${identity}:${token}`)}`,
          'user-agent': 'AngKorGit',
        },
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Bitbucket 拒绝了这些凭据（${res.status}）——请确认这是你的 Atlassian 账户邮箱，且 API 令牌带有 read:repository:bitbucket 权限范围`,
        );
      }
      if (res.status !== 200) throw new Error(`Bitbucket 拒绝了该令牌（${res.status}）`);
      return { login: (JSON.parse(res.body) as { username: string }).username };
    }
    if (provider === 'github') {
      const res = await ipc.httpRequest({
        url: 'https://api.github.com/user',
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'user-agent': 'AngKorGit',
        },
      });
      if (res.status !== 200) throw new Error(`GitHub 拒绝了该令牌（${res.status}）`);
      return { login: (JSON.parse(res.body) as { login: string }).login };
    }
    if (provider === 'gitlab' || provider === 'gitlab-self') {
      for (const scheme of ['https', 'http']) {
        try {
          const res = await ipc.httpRequest({
            url: `${scheme}://${host}/api/v4/user`,
            method: 'GET',
            headers: { 'private-token': token, 'user-agent': 'AngKorGit' },
          });
          if (res.status === 200) {
            return { login: (JSON.parse(res.body) as { username: string }).username };
          }
          if (res.status === 401 || res.status === 403) {
            throw new Error(`GitLab 拒绝了该令牌（${res.status}）`);
          }
        } catch (error) {
          if ((error as Error).message?.includes('rejected')) throw error;
        }
      }
      return 'unreachable';
    }
    return null;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

function AccountStatus({
  account,
  check,
}: {
  account: HostingAccount;
  check: AccountCheckStatus | 'checking' | undefined;
}) {
  if (check === 'checking') return <Spinner className="size-3.5" />;
  if (check === 'unreachable') {
    return <span className="text-xs text-muted">无法检查（离线？）</span>;
  }
  if (check === 'no_token') {
    return (
      <span className="flex items-center gap-1 text-xs text-danger">
        <AlertTriangle className="size-3.5" /> Token missing from the keychain
      </span>
    );
  }
  if (!account.verified || check === 'unauthorized') {
    if (!account.verifiedAt) {
      return <span className="text-xs text-faint">未验证</span>;
    }
    return (
      <span className="flex items-center gap-1 text-xs text-danger">
        <AlertTriangle className="size-3.5" /> 令牌已过期或被吊销
      </span>
    );
  }
  const expiry = parseExpiry(account.expiresAt);
  if (expiry) {
    const days = daysUntil(expiry);
    if (days <= 0) {
      return (
        <span className="flex items-center gap-1 text-xs text-danger">
          <AlertTriangle className="size-3.5" /> 令牌已过期
        </span>
      );
    }
    return (
      <span
        className={cn(
          'flex items-center gap-1 text-xs',
          days <= 14 ? 'text-primary' : 'text-success',
        )}
      >
        <CheckCircle2 className="size-3.5" /> {days} 天后过期
      </span>
    );
  }
  return <CheckCircle2 className="size-3.5 text-success" />;
}

export function AccountsTab() {
  const [accounts, setAccounts] = useState<HostingAccount[]>([]);
  const [checks, setChecks] = useState<Record<string, AccountCheckStatus | 'checking'>>({});
  const [provider, setProvider] = useState<ProviderKind>('github');
  const [host, setHost] = useState(PROVIDERS.github.defaultHost);
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [reconnecting, setReconnecting] = useState<HostingAccount | null>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const focusTokenRef = useRef(false);
  const skipMenuRefocusRef = useRef(false);
  useEffect(() => {
    if (!adding || !focusTokenRef.current) return;
    focusTokenRef.current = false;
    tokenInputRef.current?.focus();
  }, [adding]);

  const runChecks = async (list: HostingAccount[]) => {
    const eligible = list.filter(
      (account) =>
        account.provider !== 'other' && !(account.provider === 'bitbucket' && !account.email),
    );
    setChecks((c) => ({
      ...c,
      ...Object.fromEntries(eligible.map((account) => [accountKey(account), 'checking' as const])),
    }));
    await Promise.all(
      eligible.map(async (account) => {
        const key = accountKey(account);
        try {
          const result = await ipc.accountCheck(account.host, account.username);
          setChecks((c) => ({ ...c, [key]: result.status }));
          setAccounts(result.accounts);
        } catch {
          setChecks((c) => ({ ...c, [key]: 'unreachable' }));
        }
      }),
    );
  };

  useEffect(() => {
    let cancelled = false;
    void ipc
      .accountList()
      .then((list) => {
        if (cancelled) return;
        setAccounts(list);
        setLoading(false);
        void runChecks(list);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const preset = PROVIDERS[provider];

  const changeProvider = (kind: ProviderKind) => {
    setProvider(kind);
    setHost(PROVIDERS[kind].defaultHost);
  };

  const reconnect = (account: HostingAccount) => {
    const kind = (
      Object.keys(PROVIDERS) as ProviderKind[]
    ).find((k) => k === account.provider) ?? 'other';
    setProvider(kind);
    setHost(account.host);
    setUsername(kind === 'bitbucket' ? (account.email ?? '') : account.username);
    setToken('');
    setReconnecting(account);
    if (adding) {
      requestAnimationFrame(() => tokenInputRef.current?.focus());
      return;
    }
    focusTokenRef.current = true;
    setAdding(true);
  };

  const closeForm = () => {
    setAdding(false);
    setReconnecting(null);
  };

  const startAdd = () => {
    setReconnecting(null);
    setToken('');
    setUsername('');
    setAdding(true);
  };

  const connect = async () => {
    const cleanHost = host.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!cleanHost || !token.trim()) return;
    setBusy(true);
    const wasReconnect = reconnecting !== null;
    try {
      let finalUsername = username.trim();
      let isVerified = false;
      const verified = await validateToken(provider, cleanHost, finalUsername, token.trim());
      if (verified === 'unreachable') {
        toast.warning(`${cleanHost} 当前不可达——将不经验证保存`);
        if (!finalUsername) throw new Error('输入用户名即可不经验证保存');
      } else if (verified) {
        finalUsername = verified.login;
        isVerified = true;
      } else if (!finalUsername) {
        throw new Error('此提供方需要用户名');
      }

      const email = provider === 'bitbucket' ? username.trim() : null;
      const updated = await ipc.accountAdd(
        cleanHost,
        finalUsername,
        provider,
        token.trim(),
        isVerified,
        email,
      );
      setAccounts(updated);
      setToken('');
      setUsername('');
      closeForm();
      if (isVerified) toast.success(`${wasReconnect ? '已重新连接' : 'Connected'} ${cleanHost} as ${finalUsername}`);
      else toast.warning(`Saved ${cleanHost} as ${finalUsername} — token not verified`);
      const added = updated.find((a) => a.host === cleanHost && a.username === finalUsername);
      if (added) void runChecks([added]);
    } catch (error) {
      toast.error(`连接失败：${(error as { message?: string }).message ?? error}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (account: HostingAccount) => {
    try {
      setAccounts(await ipc.accountRemove(account.host, account.username));
      toast.success(`已移除 ${account.host} 上的 ${account.username}`);
    } catch (error) {
      toast.error(`移除失败：${(error as { message?: string }).message ?? error}`);
    }
  };

  const makeDefault = async (account: HostingAccount) => {
    try {
      setAccounts(await ipc.accountSetDefault(account.host, account.username));
      toast.success(`${account.username} 现在是 ${account.host} 的默认账户`);
    } catch (error) {
      toast.error(`无法设置默认：${(error as { message?: string }).message ?? error}`);
    }
  };

  const hostCounts = accounts.reduce<Record<string, number>>((acc, a) => {
    acc[a.host] = (acc[a.host] ?? 0) + 1;
    return acc;
  }, {});

  const tokenPage = preset.tokenPage(host.trim());
  const showForm = adding || (!loading && accounts.length === 0);

  const confirmRemove = async (account: HostingAccount) => {
    const ok = await confirmDialog({
      title: `移除 ${account.host} 上的 ${account.username}？`,
      description:
        '令牌将从系统钥匙串中删除。推送到该主机时将回退到你的其他账户或凭据助手。',
      confirmLabel: '移除账户',
      destructive: true,
    });
    if (ok) await remove(account);
  };

  return (
    <SettingCard
      title="账户"
      description="当远端的主机匹配时自动使用——无需 SSH 配置即可通过 HTTPS 推送和拉取。每个主机可以有多个账户；其中一个是默认账户，各配置可选用其他账户。"
      action={
        !showForm ? (
          <Button variant="secondary" size="sm" onClick={startAdd}>
            <Plus className="size-3.5" /> 添加账户
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2">
        {loading && (
          <div className="flex flex-col gap-2">
            {[0, 1].map((row) => (
              <div key={row} className="flex items-center gap-3 rounded-lg border border-border-subtle p-3">
                <div className="size-8 animate-pulse rounded-md bg-surface-raised" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-3.5 w-36 animate-pulse rounded bg-surface-raised" />
                  <div className="h-3 w-52 animate-pulse rounded bg-surface-raised" />
                </div>
              </div>
            ))}
          </div>
        )}
        {loadFailed && <p className="text-xs text-danger">无法加载账户。</p>}

        {!loading &&
          accounts.map((account) => {
            const key = accountKey(account);
            const multi = (hostCounts[account.host] ?? 0) > 1;
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised/40 p-3"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface text-muted">
                  {providerIcon(account.provider)}
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{account.username}</span>
                    <span className="truncate font-normal text-muted">@ {account.host}</span>
                    {multi && account.isDefault && <Badge tone="neutral">默认</Badge>}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-faint">
                    <AccountStatus account={account} check={checks[key]} />
                    <span>· 令牌保存在系统钥匙串中</span>
                    {account.verified && account.verifiedAt && <span>· 已验证 {timeAgo(account.verifiedAt)}</span>}
                  </p>
                </div>
                {(!account.verified || checks[key] === 'no_token' || checks[key] === 'unauthorized') && (
                  <Button variant="secondary" size="sm" onClick={() => reconnect(account)}>
                    <RefreshCw className="size-3.5" /> Reconnect
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`${account.username} 在 ${account.host} 上的操作`}>
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onCloseAutoFocus={(e) => {
                      if (!skipMenuRefocusRef.current) return;
                      skipMenuRefocusRef.current = false;
                      e.preventDefault();
                      tokenInputRef.current?.focus();
                    }}
                  >
                    {multi && !account.isDefault && (
                      <DropdownMenuItem onClick={() => void makeDefault(account)}>
                        <Star /> Make default for {account.host}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        skipMenuRefocusRef.current = true;
                        reconnect(account);
                      }}
                    >
                      <RefreshCw /> Reconnect with a new token…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onClick={() => void confirmRemove(account)}>
                      <Trash2 /> 移除账户…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}

        {showForm && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="mb-3 flex items-center gap-2 text-xs font-medium text-foreground">
              <KeyRound className="size-3.5 text-primary" />
              {reconnecting
                ? `重新连接 ${reconnecting.username} @ ${reconnecting.host}`
                : accounts.length === 0
                  ? '连接你的第一个账户'
                  : '添加账户'}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Provider">
                <Select value={provider} onValueChange={(v) => changeProvider(v as ProviderKind)} disabled={reconnecting !== null}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PROVIDERS) as ProviderKind[]).map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {PROVIDERS[kind].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Host">
                <Input
                  placeholder="gitlab.example.com"
                  value={host}
                  disabled={!preset.hostEditable || reconnecting !== null}
                  onChange={(e) => setHost(e.target.value)}
                  className="font-mono"
                />
              </Field>
              <Field
                label={provider === 'bitbucket' ? 'Atlassian 账户邮箱' : 'Username'}
                hint={
                  reconnecting
                    ? undefined
                    : provider === 'bitbucket'
                      ? '已检测到 Bitbucket 用户名'
                      : provider === 'other'
                        ? undefined
                        : '从令牌中检测到'
                }
              >
                <Input
                  placeholder={provider === 'bitbucket' ? 'you@company.com' : 'optional'}
                  value={username}
                  disabled={reconnecting !== null && username.trim() !== ''}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field
                label="令牌"
                hint={
                  tokenPage ? (
                    <a
                      href={tokenPage}
                      className="flex items-center gap-1 whitespace-nowrap text-primary hover:underline"
                      onClick={(e) => {
                        e.preventDefault();
                        void openExternal(tokenPage);
                      }}
                    >
                      前往创建 <ExternalLink className="size-3" />
                    </a>
                  ) : undefined
                }
              >
                <Input
                  ref={tokenInputRef}
                  type="password"
                  placeholder="粘贴令牌"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void connect();
                    if (e.key === 'Escape' && accounts.length > 0) closeForm();
                  }}
                />
              </Field>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="min-w-0 text-[11px] leading-relaxed text-faint">{preset.tokenHint}</span>
              <span className="flex shrink-0 gap-2">
                {accounts.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={closeForm}>
                    取消
                  </Button>
                )}
                <Button size="sm" onClick={() => void connect()} disabled={busy || !token.trim() || !host.trim()}>
                  {busy ? <Spinner className="text-primary-foreground" /> : null}
                  {reconnecting ? '重新连接' : 'Connect'}
                </Button>
              </span>
            </div>
          </div>
        )}
      </div>
    </SettingCard>
  );
}
