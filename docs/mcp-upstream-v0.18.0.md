# 上游更新分析与 v0.18.0 同步方案

日期：2026-09-26。

## 范围与来源

- 上游：[cheat2001/angkorgit](https://github.com/cheat2001/angkorgit)，目标 `a43f632`（含 v0.18.0 上游发布）。
- 中文版发布仓库：[wuwuzhazha/angkorgit-zh](https://github.com/wuwuzhazha/angkorgit-zh)。
- 同步前主分支：`b9069f9`；已发布中文版为 v0.17.0。
- 共同祖先：`f9f8f30`（上次同步点）。本次上游新增 9 个提交，57 个文件。
- 固定目标：`a43f632`，不是执行时任意漂移的上游 main。
- 中文版 v0.18.0（与上游同号）。

## 上游差异

| 类别 | 内容 | 主要路径 |
| --- | --- | --- |
| 单文件 AI | diff 头 AI 菜单：解释/审查单个文件，折叠条带、引用行跳转 | `DiffAiStrip.tsx`、`AiReport.tsx`、`AiResultPanel.tsx`、`waitMessages.ts`、`capabilities.ts`、`report.ts`、`locateLine.ts`、`patchText.ts` |
| 整提交 AI | 检查器 Review with AI（与 Explain 并列），铅笔移标题旁 | `CommitDetails.tsx`、`workStore.ts` |
| 推送 | 服务端拒收具名 ref、non-fast-forward 指引与二选一对话框 | `core/remote.rs`、`error.rs`、`PushRejectedDialog.tsx`、`Toolbar.tsx` |
| forge | 按已连接账户识别自建 forge、未知 host 状态栏 Connect 提示 | `forge/hosts.ts`、`remote.ts`、`StatusBar.tsx` |
| 文件列表 | 方形 ChangeMark、统一样式、空状态卡、Amend 入卡 | `ChangeMark.tsx`、`DirName.tsx`、`EmptyCard.tsx`、`WorkingCopyPanel.tsx`、`FileHistoryPanel.tsx` |
| UX 打磨 | View options 菜单、窄屏去标签、侧栏 hover 操作、WIP 芯片 | `DiffPanel.tsx`、`Sidebar.tsx`、`WipRow.tsx`、`WelcomePage.tsx`、`CreatePrDialog.tsx` |
| 终端 | 登录 shell 环境探测仅 unix、UTF-8 locale | `terminal.rs`（构建修复另见 9170d2c） |
| 测试 | 2 个新 e2e（单文件 AI、整提交 AI）+ prompt/解析单测 | `smoke.spec.ts`（+85 行）、`aiCapabilities/aiReport/patchText` |

## 风险与处理

1. **合并策略。** `git merge upstream/main -X theirs`，随后恢复自维护文件（`README.md`、`docs`、`apps/website` 取合并前版本；`package.json` 包名改回 `angkorgit-zh`）。本次 CHANGELOG 自动合并成功（0.18.0 英文节落定、0.15.1 中文节保留、中文头保留），无需手工。
2. **fork 定制被冲掉一处，已恢复。** `Toolbar.tsx` 上游新增 `if (label === 'Push')` 路由推送拒绝对话框，而中文推送标签是“推送”，改回 `'推送'`；`CommandPalette.tsx` 同类 `startsWith('Pull')` 顺带兼容“拉取”。
3. **Rust 错误串手工汉化（多行字面量，词典按行匹配够不着）。** `error.rs` non-fast-forward 指引、`remote.rs` `rejection_message`（含 tag/branch/ref 种类的中文化），配套单测断言同步更新。服务端原因原文（如 already exists）保留英文。
4. **AI prompt 不入词典。** `capabilities.ts` 的 EXPLAIN/REVIEW_SHAPE 是发给模型的英文指令，渲染的章节头来自 AI 回答原文；只汉化面板/条带的 chrome（按钮、Hint、toast），`${title}` 保持与既有 `AI 审查`/`AI 解释` 组合一致。
5. **中文子串歧义一处。** 英文 `getByText('Pull requests')` 靠大小写/单复数避开 tooltip `Create pull request`，中文“拉取请求”则是“创建拉取请求”的子串，e2e 改用 `exact: true`。
6. **上游新增英文 aria 直接对齐。** `aria-label="Commit files"` 在 fork 中是“提交文件”，新测试照此改；`Worktrees` hover 行同理改“工作树”。
7. **计数片段保持英文。** 沿用 fork 既有惯例。
8. **文档人工搬运。** `docs/Roadmap.md`（版本头与 AI 条目）、README/官网版本号（`FALLBACK_VERSION`、AppFrame）。`CLAUDE.md` 为纯上游文件，直接胜出。
9. **隔离。** 全程在 `sync/upstream-a43f632-zh` 分支操作。

## 验证与发布闸门

- `pnpm check:copy`、`pnpm check:dict` 通过。
- `pnpm typecheck`、`pnpm test`（218 通过，含新增 3 组本地化断言）通过。
- Playwright 全量 90 通过（含 2 个新功能测试与若干更新后的旧测试）。
- Rust 引擎测试与 clippy 由 CI 三平台执行（本地 `cargo fmt --check` 通过；Windows OpenSSL 构建依赖原生 Perl，本地不跑引擎测试）。
- PR 全绿后合并，按 `.github/workflows/release-zh.yml` 发布 v0.18.0（Windows NSIS/MSI + latest.json）。

分析与发布文案保存在 `docs`；机器日志、待译扫描和测试产物不放入文档目录。
