# 路线图

Updated for v0.17.0 (September 2026). [CHANGELOG.md](../CHANGELOG.md) is the
authoritative record of what shipped in each release; this file tracks
direction.

## Shipped (0.1.0 → 0.17.0)

- [x] Repository: open, clone (with progress), recents, search, repository tabs (drag to reorder)
- [x] Commit: stage files, hunks, and individual lines; unstage, commit, amend; per-repo commit drafts; multi-select in the working copy with bulk stage/unstage/stash/discard; discard for staged files; path filter over changed files and commit files
- [x] History: virtualized animated graph, find in graph by message, hash or author with an n of m stepper (the lanes never collapse), branch filter, refs/tags/HEAD/merges, file history with a one-click jump to the whole commit
- [x] Branch: create, delete, rename, checkout (incl. remote), merge, rebase (+continue/abort), interactive rebase (reorder/reword/squash/fixup/drop), cherry-pick (single or multi-commit, optional "(cherry picked from commit …)" reference), reset (soft/mixed/hard) — explicit merges always record a merge commit; abort merge from the commit box
- [x] Remote: fetch, pull, push, force push, push a branch straight from its tip commit's menu, push/fetch tags, background auto fetch
- [x] Conflicts: visual resolver — aligned A/B panes with line numbers, one take-all checkbox per side (mixed while partly picked) plus hover-to-pick lines that land in file order, a Result pane with in-place editing and its own line numbers behind a draggable split, keyboard control (↑/↓, A/B, ⌘⏎), conflict and file navigation that opens the next conflicted file after each save, guards against losing picks and hand edits, AI explanations
- [x] Worktrees: sidebar section with branch/dirty/missing state, open any worktree as its own tab, create from a branch or commit into a sibling folder, safe remove and prune, branches held elsewhere marked in the sidebar and graph
- [x] Stash: create (whole tree or chosen files), apply, pop (one click from the toolbar), drop; stashes as rows in the graph with their own node and menu; apply single files from a stash · Tags: create (annotated/lightweight), delete, checkout · Submodules: list & update
- [x] Built-in PTY terminal at repo root; built-in file editor
- [x] Diff: inline & side-by-side, syntax highlight, word diff, image diff, find in diff (⌘F), minimap, previous/next change and file navigation (N/P, [/]), opens directly at the first change (no scroll animation), reloads live as the file changes on disk, file history one click from the header; → / ↑ ↓ / ← walk from the graph into a commit's files and back
- [x] Settings: sixteen themes (Angkor Dusk default) with accents & zoom, identity profiles (repo-local) with linked accounts, SSH key management & generation, hosting accounts with verified tokens (Secret Service on Linux, missing tokens flagged), AI providers & commit style, keyboard reference
- [x] Sidebar: accordion sections with pinned headers and collapse-all, row menus on hover and right-click everywhere, empty-state cards; graph display options and column headers; welcome page with keyboard navigation and missing-folder detection
- [x] AI: provider-agnostic (OpenAI, Anthropic, Gemini, Ollama, LM Studio) plus installed AI CLIs (Claude Code, GitHub Copilot CLI, Codex, Gemini CLI, OpenCode, Antigravity) — commit messages, diff/conflict explanations, PR descriptions, staged-change review with team conventions (global + per-repo `.angkorgit/review.md`), background execution with stop, full-size reading views
- [x] Undo/redo for recent operations; drag-and-drop merge/rebase
- [x] Auto-update: pull-based from GitHub releases, signature-verified
- [x] Commit signing: SSH and GPG, driven by existing git config (commit.gpgSign, gpg.format, user.signingKey) — covers commit, amend, merge
- [x] Pull requests: sidebar list, checkout and in-app create with reviewer selection for GitHub, GitLab (incl. self-hosted) and Bitbucket Cloud, through the connected account; browser fallback without one
- [x] Graph search: message text, a hash or prefix, and author all find matches in the full graph, centered and highlighted, with an n of m control; ⌘F focuses the search
- [x] Command line: `angkorgit` / `akg` installed from Settings — open the current folder, a path, or clone by URL or owner/repo into the app
- [x] Blame: a pane of file history with a Working copy row, per-hunk authors, jump to the commit, blame at or before any commit
- [x] External editor: detected editors (VS Code, Cursor, Zed, Sublime, JetBrains, Xcode, GNOME Builder…) from the toolbar, palette and file menus
- [x] Pull with rebase following `pull.rebase`, a merge/rebase choice per pull, and a status bar note of the last fetch
- [x] Fork workflow: "Fast-forward current to this" in the branch menus (enabled only when the branch is strictly behind), every remote fetched on each tab switch, "Open in browser" on a remote and from the palette
- [x] Provider avatars from the connected account when Gravatar has none; the AI provider and its last connection test in the status bar
- [x] Upstream workflow: add a remote from the sidebar, pull requests from a fork into its upstream (GitHub, GitLab, Bitbucket Cloud), a remembered clone folder, a right-click menu in the terminal
- [x] Windows: SSH remotes with ed25519 and ECDSA host keys (libssh2 built on OpenSSL)
- [x] Fonts: interface, code and terminal fonts picked from what is installed, each shown in its own face, terminal size, one-click reset
- [x] Edit an unpushed commit message in place from the inspector or the graph menu (HEAD amended message-only, older commits rewritten in memory), undoable
- [x] macOS: the app bundle is signed as a whole so Desktop, Documents and Downloads permissions are remembered; GitHub account form points at fine-grained tokens too
- [x] Performance: fast startup (splash waits for the app, not a timer; heavy views load on first use), a quiet file watcher, on-demand commit diffs, loading overlay on slow repository switches
- [x] Inspector: an All files view of the whole tree at a commit or in the working copy with the changed files marked, a change-kind filter on a commit's files; sidebar section headers with icon tiles and count badges; Push with tags names every tag; auto fetch tries every remote and names the ones that failed

## 下一步

- [ ] 工作树：从工作树条目启动本机 AI CLI、按仓库配置创建后命令、已合并标记与一键清理。

## 后续：平台互联

- [ ] Azure DevOps 与 Bitbucket Server 适配器。
- [ ] 只读拉取请求详情，包含提交、CI 与审查状态。
- [ ] Issue 查看器。

## 后续：进阶功能

- [ ] 插件宿主：命令面板命令、侧边栏分区与检查器标签页。
- [ ] 多仓库工作区。
- [ ] 提交图文件支持与更快的冷启动。

不计划实现企业级管理工具、内置 CI 仪表盘或应用内完整代码评审。评论、批准与合并继续交给托管平台网页，通过应用中的入口访问。
