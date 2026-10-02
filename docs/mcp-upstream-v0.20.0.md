# 上游更新分析与 v0.20.0 同步方案

日期：2026-10-02。

## 范围与来源

- 上游：[cheat2001/angkorgit](https://github.com/cheat2001/angkorgit)，目标 `b4f0d1f`（含 v0.19.0 与 v0.20.0 上游发布及构建修复）。
- 中文版发布仓库：[wuwuzhazha/angkorgit-zh](https://github.com/wuwuzhazha/angkorgit-zh)。
- 同步前主分支：`748489c`；已发布中文版为 v0.18.0。
- 共同祖先：`a43f632`（上次同步点）。本次上游新增 28 个提交，77 个文件。
- 固定目标：`b4f0d1f`。
- 中文版 v0.20.0（与上游同号）。

## 上游差异

| 类别 | 内容 | 主要路径 |
| --- | --- | --- |
| 键盘导航与改动步进 | `→` / `N` / `P` 键在差异与文件历史中循环步进改动，`↑` / `↓` 切换文件，`←` 返回提交图 | `diff/changeNav.tsx`、`DiffPanel.tsx`、`FileHistoryPanel.tsx` |
| 忽略空白字符 | 视图选项新增“忽略空白字符”（`git diff -w`），自动隐藏纯空白改动并停用暂存 | `core/diff.rs`、`commands.rs`、`DiffPanel.tsx`、`diffShared.tsx` |
| 仓库级快捷键 | `⌘1` 至 `⌘9` 快速切换标签页，`⌘⇧[` / `⌘⇧]` 循环步进标签页；支持分配自定义按键组合（Chord）从全局直达仓库 | `core/shortcuts/chord.ts`、`RepoTabs.tsx`、`RepoShortcutDialog.tsx`、`useRepoShortcuts.ts`、`SettingsDialog.tsx` |
| 标签页右键菜单 | 标签页支持右键菜单：键盘快捷键…、复制路径、关闭标签页、关闭其他标签页 | `RepoTabs.tsx` |
| 已推送提交原地重写 | 已推送提交支持在检查器中原地修改提交信息，带有清晰的二次确认警告 | `CommitDetails.tsx` |
| 强制推送二次确认 | 工具栏推送下拉菜单中“强制推送”增加前置确认弹窗，说明将被覆盖的远端分支 | `Toolbar.tsx` |
| 语法高亮扩展 | 扩充 Less、SCSS、Dockerfile、Makefile、CMake、ini 家族，以及 Astro、Svelte、Vue、HTML 的 frontmatter 与 `<script>`/`<style>` 块高亮 | `shared/highlight.ts`、`diffShared.tsx` |
| 终端交互增强 | Linux / Windows 嵌入式终端发送原生 Alt+Up / Alt+Down 支持交互式 Agent | `terminal/keys.ts`、`TerminalPanel.tsx` |
| AI Agent (Cursor CLI) | 设置中检测并支持 Cursor CLI 作为本机 AI CLI（Windows 通过 node.exe index.js 避免批处理参数限制） | `core/ai/cliAgents.ts`、`ai_cli.rs` |
| 账户重连表单状态 | 重新连接令牌表单锁定主机与用户名，防止误建账户 | `AccountsTab.tsx` |

## 风险与处理

1. **合并策略。** `git merge upstream/main -X theirs`，随后恢复自维护文件（`README.md`、`docs`、`apps/website` 取合并前版本并更新；`package.json` 包名改回 `angkorgit-zh`）。
2. **fork 定制项对齐。** `Toolbar.tsx` 保持推送标签匹配逻辑，强制推送对话框使用符合中文语境的文案与操作；`AccountsTab.tsx` 重新连接模式文案与状态完整汉化。
3. **测试断言对齐。** 对齐 Playwright e2e 测试中的中文断言（快捷键、忽略空白字符、历史改动步进、重新连接账户、强制推送确认等）。
4. **文档与官网同步。** 官网 `Install.astro` 保持 Windows 中文版下载与 macOS/Linux 上游原版指引；`docs/Roadmap.md` 更新至 v0.20.0。
5. **隔离。** 全程在 `sync/upstream-b4f0d1f-zh` 分支操作。

## 验证与发布闸门

- `pnpm check:copy`、`pnpm check:dict` 全量通过。
- `pnpm typecheck` 全部 4 个 workspace 项目无报错。
- `pnpm test`（242 项单元测试全量通过）。
- `pnpm test:e2e`（Playwright 94 项全量通过）。
- `cargo fmt --check` 格式检查通过。
- 合并至 `main` 分支并推送到远端，触发 `.github/workflows/release-zh.yml` 发布 v0.20.0。
