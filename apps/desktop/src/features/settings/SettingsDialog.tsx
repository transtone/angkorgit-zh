import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Check,
  ChevronDown,
  Code,
  Copy,
  FolderOpen,
  Github,
  Keyboard,
  KeyRound,
  Minus,
  Moon,
  MoreHorizontal,
  Palette,
  Plus,
  RefreshCw,
  Sparkles,
  SquareTerminal,
  Sun,
  Trash2,
  User,
  UserRound,
  UsersRound,
  Wifi,
  X,
} from 'lucide-react';
import {
  AI_PROVIDER_PRESETS,
  COMMIT_STYLE_PRESETS,
  PROJECT_REVIEW_FILE,
  listAiModels,
  resolveCommitPrefix,
  type AiProviderKind,
  type CliAgentInfo,
  type CommitStylePreset,
  chordLabels,
  parseChordId,
} from '@angkorgit/core';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Hint,
  Input,
  Kbd,
  Logo,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Spinner,
  Switch,
  Textarea,
  cn,
} from '@angkorgit/design-system';
import { ipc, pickDirectory, pickFile, type CliToolStatus, type HostingAccount } from '@/core/ipc';
import { Avatar } from '@/components/Avatar';
import { confirmDialog } from '@/components/confirm';
import { useRepo } from '@/features/repository/store';
import { useUi } from '@/features/ui/store';
import { ACCENTS, THEMES, useSettings, ZOOM_MAX, ZOOM_MIN, type IdentityProfile } from './store';
import { applyProfileToRepo } from './profiles';
import { installCliTool } from './cliTool';
import { useEditors } from './editors';
import { AccountsTab, providerIcon } from './AccountsTab';
import { Field, SettingCard, SettingEmpty, SettingRow } from './SettingCard';
import { FontsCard } from './FontsCard';
import { getAiProvider } from '@/features/ai/client';
import { basename, isMac, modKey, shortenHome } from '@/shared/utils';

type SectionId = 'appearance' | 'git' | 'accounts' | 'ai' | 'shortcuts';

const SECTIONS: Array<{
  id: SectionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'appearance', label: '外观', description: '主题、强调色、缩放与动效', icon: Palette },
  { id: 'git', label: 'Git', description: '自动拉取、拉取请求、命令行、身份与配置', icon: User },
  { id: 'accounts', label: 'Authentication', description: 'https:// 远端使用账户 · git@ 远端使用 SSH 密钥', icon: Github },
  { id: 'ai', label: 'AI 助手', description: '提供方、连接与消息风格', icon: Sparkles },
  { id: 'shortcuts', label: '快捷键', description: '键盘参考', icon: Keyboard },
];

function SshCard() {
  const settings = useSettings();
  const [publicKey, setPublicKey] = useState('');
  const [busy, setBusy] = useState(false);

  const keyPath = settings.sshKeyPath.trim() || '~/.ssh/id_ed25519';

  const showPublicKey = async () => {
    setBusy(true);
    try {
      setPublicKey(await ipc.sshPublicKey(keyPath));
    } catch (error) {
      setPublicKey('');
      toast.error(`${(error as { message?: string }).message ?? error}`);
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const created = await ipc.sshKeyGenerate('~/.ssh/angkorgit_ed25519', 'AngKorGit');
      settings.setSshKeyPath(created.path);
      setPublicKey(created.publicKey);
      toast.success(`已创建 ${created.path}——请将公钥添加到托管平台`, {
        description:
          '除非将此路径添加到 ~/.ssh/config，否则其他工具仍会使用 ~/.ssh/id_*。',
      });
    } catch (error) {
      toast.error(`${(error as { message?: string }).message ?? error}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingCard
      title="SSH"
      description="用于 git@… 远端；https:// 远端改用上面的账户。"
    >
      <div className="flex flex-col gap-3">
        <SettingRow
          title="使用 SSH 代理"
          description="在任何密钥文件之前尝试，也是带口令密钥唯一可用的方式。"
          control={<Switch checked={settings.sshUseAgent} onCheckedChange={settings.setSshUseAgent} />}
        />

        <Field label="私钥">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <Input
                className="pl-8"
                value={settings.sshKeyPath}
                onChange={(e) => settings.setSshKeyPath(e.target.value)}
                placeholder="~/.ssh/id_ed25519"
              />
            </div>
            <Hint label="浏览密钥">
              <Button
                variant="secondary"
                size="icon"
                aria-label="浏览私钥"
                onClick={async () => {
                  const picked = await pickFile('选择 SSH 私钥');
                  if (picked) settings.setSshKeyPath(picked);
                }}
              >
                <FolderOpen />
              </Button>
            </Hint>
          </div>
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void showPublicKey()}>
            Show public key
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void generate()}>
            {busy ? <Spinner /> : null}
            Generate a key
          </Button>
        </div>

        {publicKey && (
          <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-raised p-2.5">
            <p className="break-all font-mono text-xs text-muted">{publicKey}</p>
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => {
                void navigator.clipboard.writeText(publicKey);
                toast.success('公钥已复制——请粘贴到你的托管平台');
              }}
            >
              <Copy /> 复制公钥
            </Button>
          </div>
        )}
      </div>
    </SettingCard>
  );
}

function CredentialHelperCard() {
  const useCredentialHelper = useSettings((s) => s.useCredentialHelper);
  const setUseCredentialHelper = useSettings((s) => s.setUseCredentialHelper);
  return (
    <SettingCard
      title="系统凭据助手"
      description="在账户之后，回退到 git 或其他客户端保存的凭据；关闭可单独测试账户。"
      action={<Switch checked={useCredentialHelper} onCheckedChange={setUseCredentialHelper} />}
    />
  );
}

function ModelField() {
  const ai = useSettings((s) => s.ai);
  const setAi = useSettings((s) => s.setAi);
  const [models, setModels] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const preset = AI_PROVIDER_PRESETS[ai.provider];

  useEffect(() => {
    setModels([]);
    setOpen(false);
  }, [ai.provider]);

  const load = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (models.length > 0) {
      setOpen(true);
      return;
    }
    const { ai: current } = useSettings.getState();
    if (preset.needsApiKey && !current.apiKey) {
      toast.info('请先输入 API 密钥——模型列表与你的账户相关');
      return;
    }
    setLoading(true);
    try {
      const found = await listAiModels({ ...current, baseUrl: current.baseUrl || undefined }, (request) =>
        ipc.httpRequest(request),
      );
      setModels(found);
      setOpen(found.length > 0);
      if (found.length === 0) toast.info('提供方未返回模型');
    } catch (error) {
      toast.error(`无法加载模型：${(error as { message?: string }).message ?? error}`);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setModels([]);
    setOpen(false);
    await load();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">
          Model <span className="font-normal text-faint">· 输入任意名称，或加载你的密钥可访问的列表</span>
        </span>
        <div className="flex items-center gap-1">
          {models.length > 0 && !open && (
            <Hint label="重新获取列表">
              <Button variant="ghost" size="icon-sm" aria-label="刷新模型列表" onClick={() => void refresh()} disabled={loading}>
                <RefreshCw className="size-3.5" />
              </Button>
            </Hint>
          )}
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Spinner /> : <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />}
            {open ? '隐藏模型' : models.length > 0 ? '显示模型' : '加载模型'}
          </Button>
        </div>
      </div>
      <Input
        value={ai.model}
        onChange={(e) => setAi({ model: e.target.value })}
        placeholder={preset.defaultModel}
      />
      {open && (
        <div className="max-h-44 overflow-y-auto rounded-md border border-border-subtle">
          {models.map((model) => {
            const isActive = ai.model === model;
            return (
              <button
                key={model}
                onClick={() => {
                  setAi({ model });
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors',
                  isActive ? 'bg-primary/10 text-foreground' : 'hover:bg-surface-raised',
                )}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{model}</span>
                {isActive && <Check className="size-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CliAgentPicker() {
  const ai = useSettings((s) => s.ai);
  const [agents, setAgents] = useState<CliAgentInfo[]>([]);
  const [scanning, setScanning] = useState(true);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const found = await ipc.aiCliDetect();
      setAgents(found);
      const { ai: current, setAi } = useSettings.getState();
      if (found.length > 0 && !found.some((a) => a.id === current.cliAgent)) {
        setAi({ cliAgent: found[0].id, cliPath: found[0].path });
      } else {
        const selected = found.find((a) => a.id === current.cliAgent);
        if (selected && selected.path !== current.cliPath) setAi({ cliPath: selected.path });
      }
    } catch {
      setAgents([]);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">已检测到本机安装</span>
        <Button variant="ghost" size="sm" onClick={() => void scan()} disabled={scanning}>
          {scanning ? <Spinner /> : <RefreshCw className="size-3.5" />}
          重新扫描
        </Button>
      </div>
      {agents.map((agent) => {
        const isActive = ai.cliAgent === agent.id;
        return (
          <button
            key={agent.id}
            onClick={() => useSettings.getState().setAi({ cliAgent: agent.id, cliPath: agent.path })}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
              isActive ? 'border-primary/40 bg-primary/5' : 'border-border-subtle bg-surface-raised/40 hover:border-border',
            )}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-md',
                isActive ? 'bg-primary/15 text-primary' : 'bg-surface text-muted',
              )}
            >
              <SquareTerminal className="size-4" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="truncate">{agent.label}</span>
                {isActive && (
                  <Badge tone="primary">
                    <Check className="size-3" /> 使用中
                  </Badge>
                )}
                {agent.version && <span className="font-mono text-[11px] font-normal text-faint">{agent.version}</span>}
              </p>
              <p className="truncate font-mono text-[11px] text-faint">{agent.path}</p>
            </div>
          </button>
        );
      })}
      {scanning && agents.length === 0 && (
        <div className="flex items-center gap-2.5 rounded-md border border-border-subtle p-2.5">
          <div className="size-8 animate-pulse rounded-md bg-surface-raised" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-32 animate-pulse rounded bg-surface-raised" />
            <div className="h-3 w-56 animate-pulse rounded bg-surface-raised" />
          </div>
        </div>
      )}
      {!scanning && agents.length === 0 && (
        <SettingEmpty
          icon={<SquareTerminal className="size-4" />}
          title="未找到 AI CLI"
          description="安装 Claude Code、GitHub Copilot CLI、Codex CLI、Gemini CLI、OpenCode、Antigravity CLI 或 Cursor CLI，然后重新扫描。"
          action={
            <Button variant="secondary" size="sm" onClick={() => void scan()}>
              <RefreshCw className="size-3.5" /> 重新扫描
            </Button>
          }
        />
      )}
      <p className="mt-1 text-[11px] leading-relaxed text-faint">
        请求通过本机的 CLI 运行，使用其自身的登录与配额。AngKorGit 不存储任何密钥，
        也不会自行向任何地方发送数据。
      </p>
    </div>
  );
}

function CommitStyleCard() {
  const commit = useSettings((s) => s.aiStyle.commit);
  const setCommitStyle = useSettings((s) => s.setCommitStyle);
  const branch = useRepo((s) => s.status?.branch ?? null);

  const updateRule = (index: number, patch: Partial<{ pattern: string; prefix: string }>) => {
    setCommitStyle({
      prefixRules: commit.prefixRules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    });
  };
  const removeRule = (index: number) => {
    setCommitStyle({ prefixRules: commit.prefixRules.filter((_, i) => i !== index) });
  };

  const preview = branch ? resolveCommitPrefix(commit.prefixRules, branch) : null;

  return (
    <SettingCard
      title="提交消息风格"
      description={COMMIT_STYLE_PRESETS[commit.preset].description}
      action={
        <Select
          value={commit.preset}
          onValueChange={(value) => setCommitStyle({ preset: value as CommitStylePreset })}
        >
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(COMMIT_STYLE_PRESETS) as CommitStylePreset[]).map((preset) => (
              <SelectItem key={preset} value={preset}>
                {COMMIT_STYLE_PRESETS[preset].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="flex flex-col gap-3">
        {commit.preset === 'custom' && (
          <Field label="用自然语言描述你的约定">
            <Textarea
              value={commit.instructions}
              onChange={(e) => setCommitStyle({ instructions: e.target.value })}
              placeholder={
                '例如：以方括号中的受影响模块开头，用过去时书写，绝不使用 conventional-commit 类型。'
              }
              rows={3}
            />
          </Field>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">
              分支前缀规则 <span className="font-normal text-faint">· 首个匹配生效，由 AngKorGit 自身应用</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCommitStyle({ prefixRules: [...commit.prefixRules, { pattern: '', prefix: '' }] })
              }
            >
              <Plus className="size-3.5" />
              添加规则
            </Button>
          </div>
          {commit.prefixRules.length > 0 ? (
            <div className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-raised/40">
              <div className="grid grid-cols-[1fr_auto_1fr_28px] items-center gap-2 px-2.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-faint">
                <span>分支匹配</span>
                <span />
                <span>消息以…开头</span>
                <span />
              </div>
              {commit.prefixRules.map((rule, index) => (
                <div key={index} className="grid grid-cols-[1fr_auto_1fr_28px] items-center gap-2 px-2.5 py-2">
                  <Input
                    value={rule.pattern}
                    onChange={(e) => updateRule(index, { pattern: e.target.value })}
                    placeholder="feature/*"
                    className="h-8 font-mono text-xs"
                  />
                  <span className="text-xs text-faint">→</span>
                  <Input
                    value={rule.prefix}
                    onChange={(e) => updateRule(index, { prefix: e.target.value })}
                    placeholder="[{suffix}]"
                    className="h-8 font-mono text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="移除规则"
                    onClick={() => removeRule(index)}
                  >
                    <Trash2 className="size-3.5 text-danger" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border-subtle px-3 py-2.5 text-xs text-faint">
              暂无规则。可按分支为消息添加前缀，例如{' '}
              <span className="font-mono">feature/*</span> → <span className="font-mono">[{'{suffix}'}]</span>.
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-faint">
            <span className="font-mono">*</span> matches any part of the branch name. Prefix tokens:{' '}
            <span className="font-mono">{'{branch}'}</span>, <span className="font-mono">{'{suffix}'}</span>,{' '}
            <span className="font-mono">{'{ticket}'}</span>.
          </p>
          {branch && commit.prefixRules.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs text-muted">
              On <span className="font-mono text-foreground">{branch}</span>
              {preview ? (
                <>
                  消息以…开头 <span className="font-mono text-foreground">{preview}</span>
                </>
              ) : (
                <>无规则匹配时消息无前缀</>
              )}
            </p>
          )}
        </div>
      </div>
    </SettingCard>
  );
}

function CloneFolderCard() {
  const cloneRoot = useSettings((s) => s.cloneRoot);
  const setCloneRoot = useSettings((s) => s.setCloneRoot);
  const browse = async () => {
    const dir = await pickDirectory('选择默认克隆目录');
    if (dir) setCloneRoot(dir);
  };
  return (
    <SettingCard
      title="克隆目录"
      description="克隆对话框默认使用的目录。最近一次克隆使用的目录会自动保存到这里。"
      action={
        <span className="flex items-center gap-1.5">
          {cloneRoot && (
            <Button variant="ghost" size="sm" onClick={() => setCloneRoot(null)}>
              清除
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => void browse()}>
            <FolderOpen className="size-3.5" /> 选择文件夹
          </Button>
        </span>
      }
    >
      <p className={cn('truncate font-mono text-[11px]', cloneRoot ? 'text-muted' : 'text-faint')} title={cloneRoot ?? undefined}>
        {cloneRoot ? shortenHome(cloneRoot) : '未设置——每次克隆时选择文件夹'}
      </p>
    </SettingCard>
  );
}

function CliToolCard() {
  const [status, setStatus] = useState<CliToolStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void ipc.cliStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const install = async () => {
    setBusy(true);
    try {
      setStatus(await installCliTool());
    } catch (error) {
      toast.error(`Could not install: ${(error as { message?: string }).message ?? error}`);
    } finally {
      setBusy(false);
    }
  };

  const uninstall = async () => {
    setBusy(true);
    try {
      await ipc.cliUninstall();
      setStatus(null);
      toast.success('Command line tool removed');
    } catch (error) {
      toast.error(`Could not uninstall: ${(error as { message?: string }).message ?? error}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingCard
      title="Command line tool"
      description="Open or clone a repository from the terminal as angkorgit or the short akg. Run akg --help for the full usage."
      action={
        status ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void uninstall()}>
            Uninstall
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => void install()}>
            Install
          </Button>
        )
      }
    >
      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">
        {`angkorgit
angkorgit open [path]
angkorgit clone [-b branch] <url>`}
      </pre>
      {status && (
        <p className="mt-1 text-[11px] leading-relaxed text-faint">
          {status.path}
          {status.aliasPath && ' · also akg'}
        </p>
      )}
      {status && status.path.includes('/.local/bin/') && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          ~/.local/bin is not on PATH in every shell. If akg is not found, add this line to your shell profile:{' '}
          <code className="rounded bg-surface-raised px-1 font-mono">export PATH="$HOME/.local/bin:$PATH"</code>
        </p>
      )}
    </SettingCard>
  );
}

function EditorCard() {
  const editorId = useSettings((s) => s.editorId);
  const setEditorId = useSettings((s) => s.setEditorId);
  const { editors, loading, rescan } = useEditors();
  const activeId = editors.some((e) => e.id === editorId) ? editorId : (editors[0]?.id ?? null);

  return (
    <SettingCard
      title="External editor"
      description="Open the repository or a file in an editor installed on this machine, from the toolbar, the palette and the file menus."
      action={
        <Button variant="ghost" size="sm" onClick={() => void rescan()} disabled={loading}>
          {loading ? <Spinner /> : <RefreshCw className="size-3.5" />}
          Scan again
        </Button>
      }
    >
      {editors.length === 0 && !loading ? (
        <SettingEmpty
          icon={<Code className="size-4" />}
          title="No editor found"
          description="Install your editor's command line launcher (VS Code calls it the shell command) and scan again."
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {editors.map((editor) => {
            const isActive = editor.id === activeId;
            return (
              <button
                key={editor.id}
                onClick={() => setEditorId(editor.id)}
                aria-pressed={isActive}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                  isActive ? 'border-primary/40 bg-primary/5' : 'border-border-subtle bg-surface-raised/40 hover:border-border',
                )}
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-md',
                    isActive ? 'bg-primary/15 text-primary' : 'bg-surface text-muted',
                  )}
                >
                  <Code className="size-4" />
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{editor.label}</span>
                    {isActive && (
                      <Badge tone="primary">
                        <Check className="size-3" /> 使用中
                      </Badge>
                    )}
                  </p>
                  <p className="truncate font-mono text-[11px] text-faint">{editor.path}</p>
                </div>
              </button>
            );
          })}
          {loading && editors.length === 0 && (
            <div className="flex items-center gap-2.5 rounded-md border border-border-subtle p-2.5">
              <div className="size-8 animate-pulse rounded-md bg-surface-raised" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-3.5 w-32 animate-pulse rounded bg-surface-raised" />
                <div className="h-3 w-56 animate-pulse rounded bg-surface-raised" />
              </div>
            </div>
          )}
        </div>
      )}
    </SettingCard>
  );
}

function ReviewStyleCard() {
  const review = useSettings((s) => s.aiStyle.review);
  const setReviewStyle = useSettings((s) => s.setReviewStyle);

  return (
    <SettingCard
      title="AI 审查约定"
      description="AI 审查者在审查暂存更改时关注的内容，适用于所有仓库。"
    >
      <div className="flex flex-col gap-2">
        <Textarea
          value={review.instructions}
          onChange={(e) => setReviewStyle({ instructions: e.target.value })}
          placeholder={
            '例如：标记仓库层之外的裸 SQL。我们只使用 React hooks，不用类组件；对缺失的错误处理和缺失的测试要严格。'
          }
          rows={4}
        />
        <p className="text-[11px] leading-relaxed text-faint">
          项目级规则：提交 <span className="rounded bg-surface-raised px-1 py-0.5 font-mono">{PROJECT_REVIEW_FILE}</span>{' '}
          到仓库后，其内容会加入该仓库的这些约定，让整个团队
          按同一套规则审查。项目规则在冲突时优先。
        </p>
      </div>
    </SettingCard>
  );
}

function RepoShortcutsCard() {
  const shortcuts = useSettings((s) => s.repoShortcuts);
  const setRepoShortcut = useSettings((s) => s.setRepoShortcut);
  const recents = useRepo((s) => s.recents);
  const entries = Object.entries(shortcuts)
    .map(([path, id]) => ({ path, chord: parseChordId(id), name: recents.find((r) => r.path === path)?.name ?? basename(path) }))
    .filter((e) => e.chord !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <SettingCard
      title="仓库快捷键"
      description="可在应用任意位置切换至指定仓库的按键组合；若该仓库尚未打开则会自动打开。在标签页或最近仓库上右键并选择“键盘快捷键…”即可添加。"
    >
      {entries.length === 0 ? (
        <SettingEmpty
          icon={<Keyboard className="size-4" />}
          title="暂无仓库快捷键"
          description="右键点击仓库标签页或欢迎页中的仓库即可设置快捷键。"
        />
      ) : (
        <div className="flex flex-col" data-repo-shortcuts>
          {entries.map((entry, index) => (
            <div key={entry.path}>
              {index > 0 && <Separator />}
              <div className="flex items-center gap-3 py-2">
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-sm">{entry.name}</span>
                  <span className="truncate font-mono text-[11px] text-faint">{shortenHome(entry.path)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {chordLabels(entry.chord!, isMac).map((label, i) => (
                    <Kbd key={i}>{label}</Kbd>
                  ))}
                </span>
                <Hint label="移除快捷键">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`移除 ${entry.name} 的快捷键`}
                    onClick={() => setRepoShortcut(entry.path, null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </Hint>
              </div>
            </div>
          ))}
        </div>
      )}
    </SettingCard>
  );
}

const SHORTCUTS: Array<[string, string[]]> = [
  ['命令面板', ['mod', 'K']],
  ['Switch to a recent repository', ['mod', 'P']],
  ['打开仓库 in a new tab', ['mod', 'T']],
  ['切换终端', ['mod', '`']],
  ['切换侧边栏', ['mod', 'B']],
  ['撤销/重做操作', ['mod', 'Z / ⇧Z']],
  ['刷新仓库', ['mod', 'R']],
  ['Settings', ['mod', ',']],
  ['切换到第 1 至 9 个标签页', ['mod', '1 … 9']],
  ['上一个 / 下一个标签页', ['mod', '⇧', '[ / ]']],
  ['关闭标签页', ['mod', 'W']],
  ['提交暂存的更改', ['mod', '⏎']],
  ['上一个/下一个提交', ['↑ / ↓']],
  ['第一个/最后一个提交', ['Home / End']],
  ['Open the commit\u2019s files / back to the graph', ['→ / ←']],
  ['下一个改动（循环，打开差异时）', ['→']],
  ['Previous / next file (file list)', ['↑ / ↓']],
  ['搜索提交 / diff 内查找', ['mod', 'F']],
  ['上一个匹配（diff 内查找）', ['⇧', '⏎']],
  ['选择/复制 diff 一侧', ['mod', 'A / C']],
  ['保存（文件编辑器）', ['mod', 'S']],
  ['放大/缩小/重置', ['mod', '+ / − / 0']],
  ['上一个 / 下一个改动（差异、文件历史）', ['P / N']],
  ['上一个/下一个文件（diff）', ['[ / ]']],
  ['关闭 diff 视图', ['Esc']],
];

export function SettingsDialog() {
  const repo = useRepo((s) => s.repo);
  const { dialog, dialogContext, closeDialog } = useUi();
  const open = dialog === 'settings';
  const settings = useSettings();
  const aiStatus = settings.aiStatus;

  const [section, setSection] = useState<SectionId>('appearance');
  const [gitName, setGitName] = useState('');
  const [gitEmail, setGitEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [profileLabel, setProfileLabel] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [hostAccounts, setHostAccounts] = useState<HostingAccount[]>([]);
  const [addingProfile, setAddingProfile] = useState(false);

  useEffect(() => {
    if (!open) return;
    void ipc
      .configGet(repo?.path ?? null, 'user.name')
      .then((v) => setGitName(v ?? ''))
      .catch(() => undefined);
    void ipc
      .configGet(repo?.path ?? null, 'user.email')
      .then((v) => setGitEmail(v ?? ''))
      .catch(() => undefined);
  }, [open, repo]);

  useEffect(() => {
    if (!open) return;
    void ipc
      .accountList()
      .then(setHostAccounts)
      .catch(() => undefined);
  }, [open, section]);

  const saveIdentity = async () => {
    try {
      await ipc.configSet(repo?.path ?? null, 'user.name', gitName, !repo);
      await ipc.configSet(repo?.path ?? null, 'user.email', gitEmail, !repo);
      toast.success('已保存 Git 身份');
    } catch (error) {
      toast.error(`保存失败：${(error as { message?: string }).message ?? error}`);
    }
  };

  const applyProfile = async (profile: IdentityProfile) => {
    try {
      if (repo) {
        await applyProfileToRepo(repo.path, profile);
      } else {
        await ipc.configSet(null, 'user.name', profile.name, true);
        await ipc.configSet(null, 'user.email', profile.email, true);
      }
      setGitName(profile.name);
      setGitEmail(profile.email);
      toast.success(
        repo
          ? `仓库 ${repo.name} 现在使用配置“${profile.label}”`
          : `全局身份已设为“${profile.label}”`,
      );
    } catch (error) {
      toast.error(`应用失败：${(error as { message?: string }).message ?? error}`);
    }
  };

  const setAccountLinked = (profile: IdentityProfile, account: HostingAccount, linked: boolean) => {
    const accounts = { ...(profile.accounts ?? {}) };
    if (linked) accounts[account.host] = account.username;
    else if (accounts[account.host] === account.username) delete accounts[account.host];
    settings.updateProfile(profile.id, { accounts });
  };
  const sortedAccounts = [...hostAccounts].sort(
    (a, b) => a.host.localeCompare(b.host) || a.username.localeCompare(b.username),
  );

  const addProfile = () => {
    if (!profileLabel.trim() || !profileName.trim() || !profileEmail.trim()) return;
    settings.addProfile({
      label: profileLabel.trim(),
      name: profileName.trim(),
      email: profileEmail.trim(),
    });
    setProfileLabel('');
    setProfileName('');
    setProfileEmail('');
    setAddingProfile(false);
  };
  const removeProfile = async (profile: IdentityProfile) => {
    const ok = await confirmDialog({
      title: `移除配置“${profile.label}”？`,
      description:
        '已分配该配置的仓库会保留写入其配置的身份，只是失去配置关联。',
      confirmLabel: '移除配置',
      destructive: true,
    });
    if (ok) settings.removeProfile(profile.id);
  };

  const testAi = async () => {
    setTesting(true);
    try {
      const ok = await getAiProvider().ping();
      settings.setAiStatus(ok ? 'ok' : 'fail');
    } catch {
      settings.setAiStatus('fail');
    } finally {
      setTesting(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    if (dialogContext && typeof dialogContext === 'object' && 'section' in dialogContext) {
      setSection(dialogContext.section);
    }
  }, [open, dialogContext]);

  const preset = AI_PROVIDER_PRESETS[settings.ai.provider];
  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const activeProfile =
    settings.profiles.find((p) => p.email === gitEmail && p.name === gitName) ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeDialog()}>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <DialogTitle className="sr-only">设置</DialogTitle>
        <div className="flex h-[560px] max-h-[80vh]">
          <nav className="flex w-52 shrink-0 flex-col border-r border-border-subtle bg-surface">
            <p className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-faint">
              设置
            </p>
            <div className="flex-1 px-2">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={cn(
                    'mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                    section === id
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted hover:bg-surface-raised hover:text-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
            <div className="border-t border-border-subtle px-4 py-3">
              <div className="flex items-center gap-2">
                <Logo size={18} className="text-foreground" />
                <span className="text-xs text-faint">AngKorGit</span>
              </div>
            </div>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col bg-background">
            <header className="shrink-0 border-b border-border-subtle px-6 pb-4 pt-5">
              <h2 className="text-base font-semibold">{active.label}</h2>
              <p className="mt-0.5 text-xs text-muted">{active.description}</p>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {section === 'appearance' && (
                <div className="flex flex-col gap-4">
                  <SettingCard
                    title="主题"
                    description="常用编辑器配色——界面与语法颜色跟随主题。"
                  >
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {THEMES.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => settings.setTheme(t.id)}
                          aria-label={`主题：${t.label}`}
                          className={cn(
                            'group flex flex-col overflow-hidden rounded-lg border text-left transition-colors',
                            settings.theme === t.id
                              ? 'border-primary ring-1 ring-primary'
                              : 'border-border hover:border-muted',
                          )}
                        >
                          <span
                            className="flex h-14 flex-col justify-center gap-1.5 px-3"
                            style={{ backgroundColor: t.swatch.bg }}
                          >
                            <span className="flex items-center gap-1">
                              {t.swatch.dots.map((dot) => (
                                <span
                                  key={dot}
                                  className="size-2 rounded-full"
                                  style={{ backgroundColor: dot }}
                                />
                              ))}
                            </span>
                            <span
                              className="h-1.5 w-3/4 rounded-full opacity-60"
                              style={{ backgroundColor: t.swatch.fg }}
                            />
                            <span
                              className="h-1.5 w-1/2 rounded-full opacity-30"
                              style={{ backgroundColor: t.swatch.fg }}
                            />
                          </span>
                          <span
                            className={cn(
                              'flex items-center justify-between px-3 py-1.5 text-xs',
                              settings.theme === t.id ? 'text-primary' : 'text-muted group-hover:text-foreground',
                            )}
                          >
                            {t.label}
                            {t.base === 'dark' ? <Moon className="size-3" /> : <Sun className="size-3" />}
                          </span>
                        </button>
                      ))}
                    </div>
                  </SettingCard>

                  <SettingCard
                    title="强调色"
                    description="按钮、高亮与焦点跟随强调色，提交图与 diff 颜色保持其含义。"
                  >
                    <div className="flex items-center gap-3">
                      {ACCENTS.map((accent) => (
                        <Hint key={accent.id} label={accent.label}>
                          <button
                            aria-label={`强调色：${accent.label}`}
                            onClick={() => settings.setAccent(accent.id)}
                            className={cn(
                              'flex size-8 items-center justify-center rounded-full transition-transform hover:scale-110',
                              settings.accent === accent.id &&
                                'ring-2 ring-foreground/70 ring-offset-2 ring-offset-background',
                            )}
                            style={{ background: accent.color }}
                          >
                            {settings.accent === accent.id && <Check className="size-4 text-white drop-shadow" />}
                          </button>
                        </Hint>
                      ))}
                    </div>
                  </SettingCard>

                  <SettingCard
                    title="缩放"
                    description={
                      <>
                        Also <Kbd>{modKey()}</Kbd> <Kbd>+</Kbd> / <Kbd>{modKey()}</Kbd> <Kbd>−</Kbd> anywhere
                      </>
                    }
                    action={
                      <div className="flex items-center gap-1">
                        <Button
                          variant="secondary"
                          size="icon-sm"
                          aria-label="缩小"
                          disabled={settings.zoom <= ZOOM_MIN}
                          onClick={settings.zoomOut}
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        <button
                          className="w-14 text-center font-mono text-xs text-muted hover:text-foreground"
                          title="重置缩放"
                          onClick={settings.zoomReset}
                        >
                          {Math.round(settings.zoom * 100)}%
                        </button>
                        <Button
                          variant="secondary"
                          size="icon-sm"
                          aria-label="放大"
                          disabled={settings.zoom >= ZOOM_MAX}
                          onClick={settings.zoomIn}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                    }
                  />

                  <SettingCard
                    title="减少动效"
                    description="减少整个应用中的动画"
                    action={<Switch checked={settings.reduceMotion} onCheckedChange={settings.setReduceMotion} />}
                  />

                  <FontsCard />
                </div>
              )}

              {section === 'git' && (
                <div className="flex flex-col gap-4">
                  <SettingCard
                    title="自动拉取"
                    description="在后台从第一个远端拉取，让队友的提交自动出现；失败保持静默。"
                    action={
                      <Select
                        value={String(settings.autoFetchMinutes)}
                        onValueChange={(v) => settings.setAutoFetchMinutes(Number(v))}
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">关闭</SelectItem>
                          <SelectItem value="1">每分钟</SelectItem>
                          <SelectItem value="5">每 5 分钟</SelectItem>
                          <SelectItem value="15">每 15 分钟</SelectItem>
                        </SelectContent>
                      </Select>
                    }
                  />

                  <SettingCard
                    title="拉取请求"
                    description="在侧边栏显示拉取请求区块，通过已关联账户加载。"
                    action={
                      <Switch
                        checked={settings.showPullRequests}
                        onCheckedChange={settings.setShowPullRequests}
                      />
                    }
                  />

                  <CloneFolderCard />

                  <CliToolCard />

                  <EditorCard />

                  <SettingCard
                    title={repo ? '此仓库的身份' : '全局身份'}
                    description={
                      repo
                        ? '在此处提交时写入的姓名和邮箱，保存到本仓库，优先于全局 git 配置。'
                        : '仓库没有自己的身份时，提交时写入的姓名和邮箱。'
                    }
                    action={
                      activeProfile ? (
                        <Badge tone="primary" className="mt-0.5">
                          <UserRound className="size-3" /> {activeProfile.label}
                        </Badge>
                      ) : undefined
                    }
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Name">
                        <Input value={gitName} onChange={(e) => setGitName(e.target.value)} placeholder="你的姓名" />
                      </Field>
                      <Field label="Email">
                        <Input
                          value={gitEmail}
                          onChange={(e) => setGitEmail(e.target.value)}
                          placeholder="you@example.com"
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-faint">
                        {repo ? `将 user.name 和 user.email 写入 ${repo.name}/.git/config` : '将 user.name 和 user.email 写入 ~/.gitconfig'}
                      </span>
                      <Button size="sm" onClick={() => void saveIdentity()}>
                        保存身份
                      </Button>
                    </div>
                  </SettingCard>

                  <SettingCard
                    title="配置文件"
                    description="工作与个人身份，各自关联托管平台账户。仓库在首次提交或推送时被分配到某个配置，该选择随仓库保留。"
                    action={
                      !addingProfile && settings.profiles.length > 0 ? (
                        <Button variant="secondary" size="sm" onClick={() => setAddingProfile(true)}>
                          <Plus className="size-3.5" /> 新建配置
                        </Button>
                      ) : undefined
                    }
                  >
                    <div className="flex flex-col gap-2">
                      {settings.profiles.map((profile) => {
                        const isActive = activeProfile?.id === profile.id;
                        return (
                          <div
                            key={profile.id}
                            className={cn(
                              'rounded-lg border p-3 transition-colors',
                              isActive ? 'border-primary/40 bg-primary/5' : 'border-border-subtle bg-surface-raised/40',
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar name={profile.name} email={profile.email} size={32} />
                              <div className="min-w-0 flex-1 leading-tight">
                                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                                  <span className="truncate">{profile.label}</span>
                                  {isActive && (
                                    <Badge tone="primary">
                                      <Check className="size-3" /> {repo ? '此处使用中' : '使用中'}
                                    </Badge>
                                  )}
                                </p>
                                <p className="truncate text-xs text-faint">
                                  {profile.name} · {profile.email}
                                </p>
                              </div>
                              {!isActive && (
                                <Button variant="secondary" size="sm" onClick={() => void applyProfile(profile)}>
                                  {repo ? '用于此仓库' : 'Use'}
                                </Button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" aria-label={`${profile.label} 配置操作`}>
                                    <MoreHorizontal className="size-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem disabled={isActive} onClick={() => void applyProfile(profile)}>
                                    <Check /> {repo ? '用于此仓库' : '用作全局身份'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem destructive onClick={() => void removeProfile(profile)}>
                                    <Trash2 /> 移除配置…
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            {sortedAccounts.length > 0 && (
                              <div className="mt-3 flex flex-col gap-1.5 border-t border-border-subtle pt-2.5">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-[11px] font-medium text-faint">
                                    已关联账户
                                    <span className="font-normal">
                                      {' '}· {sortedAccounts.filter((a) => profile.accounts?.[a.host] === a.username).length} of{' '}
                                      {sortedAccounts.length}
                                    </span>
                                  </span>
                                  <span className="text-[11px] text-faint">优先用于其主机</span>
                                </div>
                                <div className="flex flex-col divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface">
                                  {sortedAccounts.map((account) => {
                                    const linked = profile.accounts?.[account.host] === account.username;
                                    return (
                                      <label
                                        key={`${account.host}:${account.username}`}
                                        className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5"
                                      >
                                        <span
                                          className={cn(
                                            'flex size-6 shrink-0 items-center justify-center rounded [&_svg]:size-3.5',
                                            linked ? 'bg-primary/15 text-primary' : 'bg-surface-raised text-muted',
                                          )}
                                        >
                                          {providerIcon(account.provider)}
                                        </span>
                                        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-xs">
                                          <span className={cn('truncate font-medium', linked ? 'text-foreground' : 'text-muted')}>
                                            {account.username}
                                          </span>
                                          <span className="min-w-0 truncate text-faint">@ {account.host}</span>
                                        </span>
                                        <Switch
                                          checked={linked}
                                          aria-label={`将 ${account.host} 上的 ${account.username} 关联到 ${profile.label}`}
                                          onCheckedChange={(on) => setAccountLinked(profile, account, on === true)}
                                        />
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {settings.profiles.length === 0 && !addingProfile && (
                        <SettingEmpty
                          icon={<UsersRound className="size-4" />}
                          title="还没有配置"
                          description="一次性添加“工作”和“个人”，之后每个仓库都会自动选用正确的姓名、邮箱和账户。"
                          action={
                            <Button variant="secondary" size="sm" onClick={() => setAddingProfile(true)}>
                              <Plus className="size-3.5" /> 新建配置
                            </Button>
                          }
                        />
                      )}

                      {addingProfile && (
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                          <p className="mb-3 text-xs font-medium text-foreground">新建配置</p>
                          <div className="grid grid-cols-3 gap-3">
                            <Field label="Label">
                              <Input
                                autoFocus
                                placeholder="工作"
                                value={profileLabel}
                                onChange={(e) => setProfileLabel(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') addProfile();
                                  if (e.key === 'Escape') setAddingProfile(false);
                                }}
                              />
                            </Field>
                            <Field label="Name">
                              <Input
                                placeholder="你的姓名"
                                value={profileName}
                                onChange={(e) => setProfileName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') addProfile();
                                  if (e.key === 'Escape') setAddingProfile(false);
                                }}
                              />
                            </Field>
                            <Field label="Email">
                              <Input
                                placeholder="you@company.com"
                                value={profileEmail}
                                onChange={(e) => setProfileEmail(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') addProfile();
                                  if (e.key === 'Escape') setAddingProfile(false);
                                }}
                              />
                            </Field>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-[11px] text-faint">
                              添加后可将托管账户关联到该配置。
                            </span>
                            <span className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setAddingProfile(false)}>
                                取消
                              </Button>
                              <Button
                                size="sm"
                                disabled={!profileLabel.trim() || !profileName.trim() || !profileEmail.trim()}
                                onClick={addProfile}
                              >
                                添加配置
                              </Button>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </SettingCard>
                </div>
              )}

              {section === 'accounts' && (
                <div className="flex flex-col gap-4">
                  <AccountsTab />
                  <CredentialHelperCard />
                  <SshCard />
                </div>
              )}

              {section === 'ai' && (
                <div className="flex flex-col gap-4">
                  <SettingCard
                    title="提供方"
                    description={
                      settings.ai.provider === 'cli'
                        ? '使用本机已安装的 AI CLI 工具——Claude Code、GitHub Copilot CLI、Codex、Gemini CLI、OpenCode、Antigravity 或 Cursor CLI——享有其自身登录态与配额，无需 API 密钥。'
                        : '用于提交消息、diff 解释、冲突帮助与审查。通过 Ollama 或 LM Studio 的本地模型无需 API 密钥。'
                    }
                    action={
                      <Select
                        value={settings.ai.provider}
                        onValueChange={(value) => settings.setAiProvider(value as AiProviderKind)}
                      >
                        <SelectTrigger className="h-8 w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(AI_PROVIDER_PRESETS) as AiProviderKind[]).map((kind) => (
                            <SelectItem key={kind} value={kind}>
                              {AI_PROVIDER_PRESETS[kind].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  >
                    <div className="flex flex-col gap-3">
                      {settings.ai.provider === 'cli' ? (
                        <>
                          <CliAgentPicker />
                          <Field label="模型覆盖" hint="可选，留空使用 CLI 默认值">
                            <Input
                              value={settings.ai.model}
                              onChange={(e) => settings.setAi({ model: e.target.value })}
                              placeholder="CLI 默认"
                            />
                          </Field>
                        </>
                      ) : (
                        <>
                          {preset.needsApiKey && (
                            <Field label="API 密钥">
                              <Input
                                type="password"
                                value={settings.ai.apiKey}
                                onChange={(e) => settings.setAi({ apiKey: e.target.value })}
                                placeholder="sk-…"
                              />
                            </Field>
                          )}
                          <Field label="基础 URL" hint={`可选，默认为 ${preset.defaultBaseUrl}`}>
                            <Input
                              value={settings.ai.baseUrl ?? ''}
                              onChange={(e) => settings.setAi({ baseUrl: e.target.value })}
                              placeholder={preset.defaultBaseUrl}
                            />
                          </Field>
                          <ModelField />
                        </>
                      )}
                      <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
                        <span className="flex items-center gap-1.5 text-xs">
                          {aiStatus === 'ok' && (
                            <>
                              <span className="size-1.5 rounded-full bg-success" />
                              <span className="text-success">可访问</span>
                            </>
                          )}
                          {aiStatus === 'fail' && (
                            <>
                              <span className="size-1.5 rounded-full bg-danger" />
                              <span className="text-danger">无法访问。请检查密钥、URL 或本地服务是否运行。</span>
                            </>
                          )}
                          {aiStatus === 'untested' && <span className="text-faint">连接尚未测试</span>}
                          {aiStatus === 'stale' && <span className="text-faint">自上次测试后设置已更改</span>}
                        </span>
                        <Button variant="secondary" size="sm" onClick={() => void testAi()} disabled={testing}>
                          {testing ? <Spinner /> : <Wifi className="size-3.5" />}
                          测试连接
                        </Button>
                      </div>
                    </div>
                  </SettingCard>
                  <CommitStyleCard />
                  <ReviewStyleCard />
                </div>
              )}

              {section === 'shortcuts' && (
                <div className="flex flex-col gap-4">
                  <SettingCard title="键盘快捷键">
                    <div className="flex flex-col">
                      {SHORTCUTS.map(([label, keys], index) => (
                        <div key={label}>
                          {index > 0 && <Separator />}
                          <div className="flex items-center justify-between py-2.5">
                            <span className="text-sm">{label}</span>
                            <span className="flex items-center gap-1">
                              {keys.map((key) => (
                                <Kbd key={key}>{key === 'mod' ? modKey() : key}</Kbd>
                              ))}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </SettingCard>
                  <RepoShortcutsCard />
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
