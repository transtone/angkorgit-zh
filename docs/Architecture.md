# 架构

AngKorGit 遵循 Clean Architecture，按功能划分文件夹。依赖方向朝内：UI → 应用状态 → 领域；Rust 引擎位于单一类型化 IPC 边界之后。

```
┌─────────────────────────────────────────────────────────────┐
│  React UI (apps/desktop/src)                                │
│  features/* — repository, graph, commit, diff, conflicts,   │
│               sidebar, history, inspector, editor, terminal,│
│               settings, ai, updater, ui                     │
│  components/* — Toolbar, CommandPalette (app-level shell)   │
├─────────────────────────────────────────────────────────────┤
│  State: Zustand stores per feature (repository, graph, ui,  │
│  settings) — no cross-feature imports of internals          │
├─────────────────────────────────────────────────────────────┤
│  Domain: @angkorgit/core (pure TypeScript, no React)        │
│  git types · graph lane layout · word diff · conflict       │
│  parser · AI provider registry + capabilities               │
├─────────────────────────────────────────────────────────────┤
│  IPC boundary: src/core/ipc.ts (typed commands)             │
│  Tauri invoke ⇄ Rust — or demo backend in a plain browser   │
├─────────────────────────────────────────────────────────────┤
│  Rust engine (apps/desktop/src-tauri)                       │
│  commands.rs (thin) → core/* (repo, history, stage, commit, │
│  branch, remote, accounts, misc, diff, conflict) over       │
│  git2/libgit2 · terminal.rs (portable-pty) · watcher.rs     │
│  (filesystem events) · http.rs (AI proxy) · ai_cli.rs       │
│  (installed AI-CLI runner) · cli.rs (angkorgit . opener) ·  │
│  state.rs (recents) · error.rs                              │
└─────────────────────────────────────────────────────────────┘
```

## 关键决策

**Tauri v2 + libgit2（git2-rs）。** 原生 Rust 引擎让 status/diff 操作达到亚毫秒级，热路径不外调 `git`。`vendored-libgit2` 让构建在 macOS/Windows/Linux 上保持可复现。每个命令都在阻塞线程（`spawn_blocking`）上运行，UI 线程从不等待 I/O。

**单一类型化 IPC 界面。** `src/core/ipc.ts` 是唯一调用 `invoke` 的地方。它还内置一个确定性 demo 后端，在纯浏览器中运行时使用——这正是无需原生构建即可进行 UI 开发与 Playwright e2e 的原因。

**领域层的提交图布局。** 泳道分配（`GraphLayout`）是纯 TypeScript、增量式且经过单元测试。喂入第 N+1 页不会改变第 N 页的行，因此历史流式加载时虚拟化列表保持稳定。渲染是逐行 SVG 切片——O(可见行数)，与仓库大小无关。

**10 万次提交的性能策略。**
- 历史通过 libgit2 revwalk 分页（每请求 200 次提交）；过滤在引擎侧运行。
- `@tanstack/react-virtual` 只渲染可见行；行已 `memo` 化。
- 引用装饰在 Rust 中每页计算一次，而不是在 JS 中逐行计算。
- diff 按所选文件/提交懒加载；只有打开图片 diff 时才以 base64 流式传输图片。

**冲突解决即数据。** 冲突文件被解析为文本/冲突块（`parseConflicts`），解决器修改块的解决方案，`serializeResolution` 写出结果。未解决的块会重新输出其标记，因此半途而废的会话绝不会破坏数据。

**AI 是一个适配器注册表。** 功能通过 `AiProvider` 接口调用能力（`generateCommitMessage`、`explainConflict`、…）。API 提供方（OpenAI、Anthropic、Gemini、Ollama、LM Studio）由配置创建；HTTP 经注入的传输层实现，该传输层由 Rust 代理实现（无 CORS，密钥不进入 webview fetch）。`cli` 提供方不同：它运行机器上已安装的 AI CLI（Claude Code、Codex、Gemini CLI、OpenCode），作为白名单本地子进程经 `ai_cli.rs` 运行——用用户自己的登录与配额，无需 API 密钥。新增 API 提供方只需动一个文件；新增 CLI 代理需要动 `cliAgents.ts` 和 `ai_cli.rs` 白名单。

**Credentials are layered, host-scoped, and never global.** App-managed accounts (tokens in the OS keyring under AngKorGit's own service, matched to remotes by host) come first, then SSH agent/keys, then the system `git 凭据` stack — so a GitLab token is never offered to GitHub. The same philosophy applies to committer identity: profiles apply to a repository's local config only, never the shared global gitconfig other tools fight over.

**撤销/重做即记录状态变迁。** 每个变更操作都经 `tracked()` 包装，记录 HEAD 前后快照。撤销应用逆操作（提交用软重置、分支删除用引用恢复、…），并校验仓库在此期间没有变动——破坏仓库在结构上被阻止，硬重置式撤销拒绝在未提交的工作之上运行。

**防抖监视器的实时更新。** 基于 `notify` 的文件系统监视器（400 ms 防抖，`.git` 噪音过滤到仅 HEAD/refs/index 变动）发出单个 `repo-changed` 事件；前端刷新状态——若 HEAD 在外部移动则刷新一切。在 IDE 中编辑或从终端提交，半秒内即反映到 UI。

**可核验的破坏性操作。** 丢弃（文件或全部）之后会重新检查状态，并报告无法丢弃的内容，因此 libgit2 静默跳过的情形（子模块指针变化）会以可操作的提示呈现，而不是静默无操作。

## 扩展点（未来功能）

- **插件** ——命令面板、侧边栏分区与检查器标签页都是列表驱动；插件宿主可以贡献条目而无需触碰功能内部。IPC 层是单个对象，可被包装/插桩。
- **Forge 集成（GitHub/GitLab/Azure/Bitbucket）** ——计划为 `packages/forge`，每个提供方一个适配器，镜像 AI 注册表模式；PR/issue 查看器成为新的 `features/*` 文件夹。
- **工作树** ——引擎已经按路径打开仓库；只需新增工作树列表命令和仓库切换器入口。

## 错误处理

Rust 错误序列化为 `{ code, message }`（`AppError`）。错误码（`conflict`、`auth`、`non_fast_forward`、…）让 UI 提供恢复操作而不是原始库消息。toast 呈现每个失败操作；冲突结果是警告，不是错误。
