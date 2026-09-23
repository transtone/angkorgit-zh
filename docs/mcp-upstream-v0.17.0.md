# 上游更新分析与 v0.17.0 同步方案

日期：2026-09-23。

## 范围与来源

- 上游：[cheat2001/angkorgit](https://github.com/cheat2001/angkorgit)，目标 `f9f8f30`（含 v0.16.0、v0.17.0 两个上游发布）。
- 中文版发布仓库：[wuwuzhazha/angkorgit-zh](https://github.com/wuwuzhazha/angkorgit-zh)。
- 同步前主分支：`5a526e7`；已发布中文版为 v0.15.1。
- 共同祖先：`b3faaf1`（上次同步点）。本次上游新增 18 个提交，68 个文件，约 2,900 行新增。
- 固定目标：`f9f8f30`，不是执行时任意漂移的上游 main。
- 中文版 v0.17.0（与上游同号，上游 0.15.1 不存在故上次用 fork-only 号，本次直接对齐）。

## 上游差异

| 类别 | 内容 | 主要路径 |
| --- | --- | --- |
| 字体 | 外观/代码/终端三组字体选择器、终端字号、重置 | `features/settings/FontsCard.tsx`、`fonts.ts`、`terminal/font.ts`、`src-tauri/src/fonts.rs` |
| 提交改写 | 未推送提交原地改消息（HEAD 直接改、更早提交重写其上） | `core/commit.rs`、`CommitDetails.tsx`、`undoStore.ts`、`history.rs`（unpushed） |
| AI CLI | GitHub Copilot CLI 成为已安装提供方 | `ai_cli.rs`、`cliAgents.ts`、`providers.ts`、`SettingsDialog.tsx` |
| 检查器 | 全部文件视图、按变更类型过滤、文件计数 | `Inspector.tsx`、`CommitDetails.tsx`、`core/git/allFiles.ts`、`core/files.rs` |
| 侧边栏 | 分区标题金色图标 + 计数徽章（可访问名与计数分离） | `Sidebar.tsx` |
| 远端 | 遍历全部远端并报告部分失败、推送逐个具名标签 | `core/remote.rs`、`fetchRemotes.ts`、`Toolbar.tsx`、`StatusBar.tsx`、`store.ts` |
| 差异 | 拖出底部继续扩展选区 | `diffSelection.ts` |
| macOS/Windows | 应用包整体签名、细粒度令牌说明 | `tauri.conf.json`、`AccountsTab.tsx` |
| 测试 | 远端/全部文件/字体/改写/过滤 e2e 与单测 | `tests/e2e/smoke.spec.ts`（+378 行）、`tests/unit`、`git_engine.rs`（+221 行） |

## 风险与处理

1. **合并策略。** `git merge upstream/main -X theirs`，随后恢复自维护文件（`README.md`、`docs`、`apps/website` 取合并前版本；`package.json` 包名改回 `angkorgit-zh`；`CHANGELOG.md` 补回 fork 的 0.15.1 中文节；更新公钥经校验未被覆盖）。
2. **fork 定制被冲掉两处，已恢复。** `packages/core/src/ai/providers.ts` 的中文 CLI 标签（上游加了 Copilot，合并时整行被上游覆盖，已按新名单重译）；`features/ui/store.ts` 的检查器聚焦竞态修复（`inspectorTarget`，与上游新增的 `editMessageRequest` 共存）。
3. **真 bug 一处，已修复。** 上游把拉取后刷新时间戳的条件收敛为 `label.startsWith('Pull')`，而中文按钮标签是“拉取”，导致拉取不再更新上次获取时间。改为同时识别 `拉取` 前缀（`Toolbar.tsx`）。
4. **半翻译六处。** 旧短词条先命中导致“无远端 configured”等混排：`No remotes configured`、`Commit message updated`、细粒度令牌句、AI CLI 描述句，手工收尾并补整句词条；`check:copy` 已干净。
5. **e2e 对齐。** 新测试用英文可访问名（Inspector/Appearance/All files 等），按 fork 惯例译 UI 并同步断言；上游结构变化（侧边栏计数徽章分离、摘要标记 `4 已修改`）同步更新 4 个旧测试。`localization.test.ts` 新增 4 组回归断言并扩展选择器门禁。
6. **Rust 错误串。** `files.rs`/`commit.rs` 新增 8 条用户可见错误已汉化；引擎测试 1 处断言同步更新（其余新增断言均为协议/数据字面量，不译）。
7. **计数片段保持英文。** `1 of 5`、`File 2 of 2`、`· N changed` 等数字主导片段沿用 fork 既有惯例（旧测试依赖），不译。
8. **文档人工搬运。** 上游 `docs/Distribution.md`（macOS 签名）、`docs/Roadmap.md`（版本与 4 条新特性）、CLI 名单（Architecture/Development/README/官网 AiSection）、官网版本号（`FALLBACK_VERSION`、AppFrame）已搬运。`SECURITY.md` 为根文件，上游版本直接胜出（含 Copilot 名单），与 fork 现状一致。
9. **隔离。** 全程在 `sync/upstream-f9f8f30-zh` 分支操作；`.shuncode/` 本地工具目录曾被误提交，已撤出（含历史清理）。

## 验证与发布闸门

- `pnpm check:copy`、`pnpm check:dict` 通过。
- `pnpm typecheck`、`pnpm test`（194 通过，含新增 4 组本地化断言）通过。
- Playwright 全量 88 通过（含 6 个新功能测试与 4 个更新后的旧测试）。
- Rust 引擎测试与 clippy 由 CI 三平台执行（本地仅同步断言文本）。
- 待译清单 `zh-dict/pending.tsv` 871 条（多为技术标识与 fixture，主流程串已覆盖）。
- PR 全绿后合并，按 `.github/workflows/release-zh.yml` 发布 v0.17.0（Windows NSIS/MSI + latest.json）。

分析与发布文案保存在 `docs`；机器日志、待译扫描和测试产物不放入文档目录。
