# 开发指南

## 环境要求

- Node 20+ 与 pnpm 10+；仓库通过 `packageManager` 固定 pnpm 的精确版本。
- 通过 [rustup](https://rustup.rs) 安装 Rust stable。
- Tauri v2 系统依赖，详见[官方清单](https://v2.tauri.app/start/prerequisites/)：
  - **macOS**：Xcode 命令行工具。
  - **Linux**：`libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libdbus-1-dev`。
  - **Windows**：WebView2（Win 11 已预装）、MSVC 构建工具，以及加入 `PATH` 的原生 Windows Perl（例如 [Strawberry Perl](https://strawberryperl.com/)）。

从上游 0.15.0 起，Windows 的 libssh2 改用随源码构建的 OpenSSL，以支持 ed25519 和 ECDSA 主机密钥。构建 OpenSSL 需要 Perl；安装已构建的应用不需要额外安装 Perl。不要把 Git Bash 内的 Cygwin Perl 当作原生 Windows Perl。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 按锁文件安装工作区依赖 |
| `pnpm icons` | 生成占位图标；已有正式图标时不必执行 |
| `pnpm tauri:dev` | 启动完整桌面应用，前端与 Rust 均支持热重载 |
| `pnpm dev` | 在浏览器中运行前端，使用内置演示数据 |
| `pnpm check:copy` / `pnpm check:dict` | 检查中英文混排与词典格式 |
| `pnpm typecheck` | 检查各包的 TypeScript 类型 |
| `pnpm test` / `pnpm test:watch` | 运行单元测试或持续测试 |
| `pnpm test:e2e` | 使用 Playwright 验证演示模式 |
| `cd apps/desktop/src-tauri && cargo test` | 在临时仓库中运行 Rust 引擎测试 |
| `pnpm tauri:build` | 构建当前系统的正式安装包 |
| `pnpm release:mac` | 在 macOS 上构建并打开 DMG 目录 |
| `pnpm install:mac` | 在 macOS 上替换 `/Applications/AngKorGit.app` 并启动；会覆盖已有应用 |
| `pnpm website` | 启动网站开发服务器，默认地址为 `http://localhost:4321/` |
| `pnpm website:build` / `pnpm website:preview` | 构建或预览静态网站 |
| `pnpm website:images` | 从 `docs/assets` 重新生成 WebP 截图与 `og.png` |

## 演示模式

`apps/desktop/src/core/ipc.ts` 检测是否运行在 Tauri 内。纯浏览器模式下，命令由 `apps/desktop/src/core/demo.ts` 应答，使用包含 400 次提交、分支、合并、工作副本改动与冲突的固定演示数据。CI 中的 Playwright 也验证这一模式；它不替代真实 Rust 引擎测试。

## Rust 引擎开发

引擎位于 `apps/desktop/src-tauri/src/core/`，每个领域一个模块。

- 命令层 `apps/desktop/src-tauri/src/commands.rs` 保持轻薄：解析参数、调用领域函数、返回可序列化类型。
- 阻塞操作经过 `blocking()` 辅助函数和 `spawn_blocking`。
- 合并、变基、拣选等操作遇到冲突时，返回带 `status: "conflicts"` 的 `OpOutcome`。
- 新增引擎函数应在 `apps/desktop/src-tauri/tests/git_engine.rs` 中补充使用真实临时仓库的测试。
- 中文错误消息与测试断言必须同步维护，避免仍按英文片段断言。

## 新增 AI 提供方

1. 在 `packages/core/src/ai/providers.ts` 中实现适配器。
2. 在 `createAiProvider` 与 `AI_PROVIDER_PRESETS` 中注册。
3. 验证设置界面、能力声明与传输层。

本机 AI CLI（Claude Code、Codex、Gemini CLI、OpenCode）使用另一条路径：在 `packages/core/src/ai/cliAgents.ts` 中定义参数与标准输入形式，并将可执行文件加入 `apps/desktop/src-tauri/src/ai_cli.rs` 的白名单。

## 中文版发布

本仓库不采用上游“推送标签即发布”的流程。先通过 PR 完成同步、汉化与 CI，再手动运行 `.github/workflows/release-zh.yml`。版本号必须已更新，验证通过后才构建 Windows NSIS/MSI 安装包、生成自动更新签名及 `latest.json`。

具体步骤与人工维护范围见 [docs/Localization.md](Localization.md)。发布 PR 应保留合并提交，使上游提交仍为主分支祖先；不要用压缩合并丢失同步关系。
