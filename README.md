<p align="center">
  <img src="apps/desktop/src-tauri/icons/icon.png" width="96" alt="AngKorGit" />
</p>

<h1 align="center">AngKorGit (中文版 / angkorgit-zh)</h1>

<p align="center">
  一款为日常工作打造的原生 Git 客户端。支持 macOS、Windows 和 Linux。
</p>

<p align="center">
  <a href="https://github.com/wuwuzhazha/angkorgit-zh/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/wuwuzhazha/angkorgit-zh/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="许可证：MIT" src="https://img.shields.io/badge/license-MIT-D97706.svg" /></a>
  <img alt="平台支持" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-374151.svg" />
  <img alt="构建框架" src="https://img.shields.io/badge/built%20with-Tauri%20v2%20%2B%20Rust-D97706.svg" />
  <a href="https://github.com/wuwuzhazha/angkorgit-zh"><img alt="Fork 仓库" src="https://img.shields.io/badge/fork-angkorgit--zh-8B5CF6.svg" /></a>
</p>

---

## 📖 关于本项目与中文化说明

本仓库是开源桌面 Git 客户端 [cheat2001/angkorgit](https://github.com/cheat2001/angkorgit) 的**全面中文化持续同步分支（angkorgit-zh）**。

### 中文化的设计逻辑与方法

上游 AngKorGit 项目追求极致的极简与性能（Rust + libgit2 + Tauri v2 + React 18），**源码架构中完全没有引入任何 i18n 国际化运行时框架**（无 `react-i18next` / `lingui` 等，所有文案硬编码于 TSX 与 Rust 源码中）。

若直接在源码中强行植入国际化框架，不仅会破坏原项目的极简运行时，而且在后续与上游主分支进行持续代码同步时，必定产生海量、不可调和的代码合并冲突。

因此，本项目构建了一套**“基于严格语法保护的确定性字典式就地替换”**流水线（`scripts/sync-localize.ps1`）：

1. **多维度精细化分词库（`zh-dict/dict.tsv`）**
   - 维护 1,000+ 条覆盖全生命周期的高质量中英对照条目，划分为 UI 界面、Rust 引擎错误、Core 领域层、Docs 文档与 Meta 元数据 5 大维度。
   - 所有单单词或易混淆短词均严格绑定**行级上下文正则锚点（Anchor）**，并按长串优先倒序执行，杜绝误伤。
2. **代码标识符与 AST 安全防护（`zh-dict/protect.txt`）**
   - 严格拦截技术标识符、驼峰命名、组件名（如保护 `<FolderOpen />`、`isLocked` 不被单词规则拆解）。
   - 每次本地化执行后，自动通过 TypeScript 严格编译器校验（`tsc --noEmit` 0 错误）与 Rust 编译拦截。
3. **自动化同步与一键构建流水线（`scripts/sync-localize.ps1`）**
   - **自动合流**：自动 fetch 上游并执行智能合并（提供 merge、ours 等分支策略）。
   - **端点与仓库重定向**：自动将 Tauri Updater 升级检查端点与仓库地址重定向到 `wuwuzhazha/angkorgit-zh`。
   - **增量翻译回扫**：同步后自动扫描上游最新引入的新英文文案，提取生成待译清单 `pending.tsv`，支撑敏捷增量更新。
   - **安全发版**：默认安全 dry-run，凭据零泄露，杜绝任何 `--force` 危险操作。

---

<p align="center">
  <img src="docs/assets/demo.gif" alt="打开仓库、浏览提交图、跳转至 diff 并解决合并冲突" width="920" />
</p>

我整天都在使用 Git，而我尝试过的每一个客户端都像是一个套着外套的网页：打开缓慢、占用大量磁盘空间、首次提交前还要强制登录。所以我决定自己写一个。它的引擎是通过 Rust 调用的 libgit2，窗口是操作系统自带的原生 WebView，纳入功能的原则非常纯粹：**把你每天都在做的事情做好做透，其余一概不留。**

本项目完全免费，采用 MIT 协议开源，没有账户系统、没有遥测收集、没有云端上传。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/graph.png" />
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/graph-light.png" />
    <img src="docs/assets/graph.png" alt="Angkor Dusk 主题下的提交图，含分支、工作副本与已暂存更改" width="920" />
  </picture>
</p>

## ✨ 核心特性

- **流畅丝滑的提交图（Commit Graph）**：虚拟化长列表渲染，十万条提交记录滚动如同五十条般流畅。拖动分支即可完成合并（Merge）或变基（Rebase），在软件内发起的合并永远是规范的真实合并提交。分支与标签药丸标签完整展示，搜索框粘贴哈希直达对应提交。拖错分支按 `⌘Z` / `Ctrl+Z` 即可一键撤销。
- **直观易读的冲突解决器（Conflict Resolver）**：左右双栏对比，每一侧均清晰标注行号。勾选框一键选取整侧变更，悬停加号逐行精细采纳，底部结果面板本身就是一个可以直接打字编辑的无缝编辑器。只有点击“标记已解决”后才会真正落盘。
- **多工作树并行（Worktrees）**：为紧急热修复或 AI Agent 在同级目录下独立检出同一个仓库的分支，而无需触碰手头未完成的工作。侧边栏清晰罗列工作树，点击在独立标签页中切换，检出已在其他文件夹打开的分支时会自动直接跳转。
- **日常所需一应俱全**：支持整文件、代码块（Hunk）乃至单行暂存；提交自带摘要与说明分割框，支持追加修改（Amend）、还原（Revert）与重置（Reset）；支持交互式变基、单条或批量拣选（Cherry-pick）、暂存（Stash）、标签管理、子模块；提供内联与并排词级高亮差异对比、缩略小地图、图片对比与文件历史；每个仓库内置原生 PTY 终端；执行任何破坏性操作前均有明确的确认对话框，并提供完善的操作撤销功能。
- **远端协同与多账户**：复用 Git 原生的凭据链；支持 SSH 密钥与 Personal Access Token，单个主机支持挂载多个账户，身份配置按仓库绑定，不污染全局 gitconfig；直连 GitHub、GitLab 与 Bitbucket 拉取请求（PR/MR）：浏览列表、检出分支、创建请求、挑选审查人；无缝对接已有 Git 提交签名机制（GPG / SSH）。
- **AI 助手（可选）**：从暂存区代码 diff 自动生成提交信息、通俗解释某次提交或合并冲突、审查即将提交的内容、自动编写拉取请求说明。支持本地已登录的 AI CLI 工具（Claude Code、Codex、Gemini CLI、OpenCode），或通过 API 密钥 / 本机 Ollama 驱动。所有请求从本机直达大模型，每一个生成过程均配备显式中断（Stop）按钮。
- **键盘优先**：`⌘K` / `Ctrl+K` 调出命令面板直达所有功能，菜单项旁清晰标注快捷键，`Esc` 键每次精准关闭最上层浮层。

<table>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/conflict.png" />
        <source media="(prefers-color-scheme: light)" srcset="docs/assets/conflict-light.png" />
        <img src="docs/assets/conflict.png" alt="冲突解决器，含两侧内容、行号与结果面板" />
      </picture>
      <p align="center"><em>冲突解决：双侧对比、行号显示、可直接编辑的结果面板</em></p>
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/worktree.png" />
        <source media="(prefers-color-scheme: light)" srcset="docs/assets/worktree-light.png" />
        <img src="docs/assets/worktree.png" alt="叠加在提交图上的新建工作树对话框" />
      </picture>
      <p align="center"><em>工作树：在同级文件夹进行独立检出，标签页快速切换</em></p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/diff.png" />
        <source media="(prefers-color-scheme: light)" srcset="docs/assets/diff-light.png" />
        <img src="docs/assets/diff.png" alt="代码差异对比，含词级高亮、代码块暂存与缩略图" />
      </picture>
      <p align="center"><em>代码差异：词级高亮对比、单块暂存与缩略地图</em></p>
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/command-palette.png" />
        <source media="(prefers-color-scheme: light)" srcset="docs/assets/command-palette-light.png" />
        <img src="docs/assets/command-palette.png" alt="命令面板" />
      </picture>
      <p align="center"><em>⌘K 快捷唤起命令面板，键盘操作直达</em></p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/theme-setting.png" />
        <source media="(prefers-color-scheme: light)" srcset="docs/assets/theme-setting-light.png" />
        <img src="docs/assets/theme-setting.png" alt="外观设置" />
      </picture>
      <p align="center"><em>内置 16 款深浅主题、5 款强调配色与缩放调节</em></p>
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/ai-config-setting.png" />
        <source media="(prefers-color-scheme: light)" srcset="docs/assets/ai-config-setting-light.png" />
        <img src="docs/assets/ai-config-setting.png" alt="AI 设置" />
      </picture>
      <p align="center"><em>AI 设置：支持自定义 API 提供方或本机已有的 CLI</em></p>
    </td>
  </tr>
</table>

## 🔄 上游同步与中文化

本仓库不再无人值守地自动发布，汉化采用「自动检测 → 自动准备 PR → 人工校对合并 → 手动发布」：

1. **上游更新检测**（`upstream-watch.yml`，每天）：发现上游 `cheat2001/angkorgit` 新提交时创建 Issue，GitHub 邮件通知。
2. **同步并汉化（PR）**（`localize.yml`，手动触发）：合并上游 → 应用 `zh-dict/dict.tsv` → 跑 `pnpm check:copy` → 开出 PR。
3. 在 PR 里补齐新增英文串，CI（typecheck / 单元测试 / Playwright / Rust）全绿后合并。
4. **发布中文版**（`release-zh.yml`，手动触发）：先跑完整测试，再构建并发布 Windows 安装包（NSIS + MSI，含 updater 签名与 `latest.json`）。

上游新引入的英文串会进入 `zh-dict/pending.tsv`（构建产物，不入库），翻译后补进 `dict.tsv` 即可。
详见 [docs/Localization.md](docs/Localization.md)。

## 🚫 故意不做的事情

- **应用内代码评审（PR Review）**：代码托管平台（GitHub/GitLab）配合 CI 日志与行内评论体验更佳，软件内提供一键“在浏览器中打开”按钮。
- **遥测数据、强制账号、云服务**：不会向外部发送任何追踪数据，无需注册任何平台。
- **插件市场**：暂不支持扩展插件。

## 📦 安装与下载

本仓库的 [Releases 发行页面](https://github.com/wuwuzhazha/angkorgit-zh/releases) 提供 **Windows x64 中文版**：

- **Windows**：下载 `AngKorGit_0.15.1_x64-setup.exe`（NSIS 安装程序）或对应的 `.msi` 安装包。应用内自动更新指向本仓库，更新包带有校验签名。
- **macOS / Linux**：本次未发布这两个平台的中文安装包。可自行编译中文源码，或到[上游发行页面](https://github.com/cheat2001/angkorgit/releases)下载未汉化的原版。不要使用不存在的本仓库 DMG/AppImage 下载地址。

> **提示**：由于未购买商业代码签名证书，Windows SmartScreen 或 macOS Gatekeeper 首次启动时可能会弹出未知开发者提示，在 Windows 下点击“更多信息 → 仍要运行”，在 macOS 下于“系统设置 → 隐私与安全性”中点击“仍然打开”即可。

## 🛠️ 从源码编译构建

构建前请准备开发环境：[Node 20+](https://nodejs.org)、[pnpm 10+](https://pnpm.io)、[Rust 稳定版](https://rustup.rs) 以及 [Tauri v2 系统依赖](https://v2.tauri.app/start/prerequisites/)。Windows 还需要 Visual Studio C++ 生成工具和加入 `PATH` 的原生 Windows Perl（例如 Strawberry Perl），用于构建 OpenSSL。安装已构建的应用不需要 Perl。

```bash
# 1. 安装项目依赖
pnpm install

# 2. 生成应用占位图标
pnpm icons

# 3. 运行桌面应用（开发模式）
pnpm tauri:dev
```

纯前端演示模式（直接在普通浏览器中调试 UI，无需 Rust 工具链）：

```bash
pnpm dev            # 访问 http://localhost:1420
```

编译正式安装包：

```bash
pnpm tauri:build    # 产物输出至 apps/desktop/src-tauri/target/release/bundle/
```

运行自动化测试：

```bash
pnpm test                                  # vitest 单元测试
pnpm test:e2e                              # Playwright 端到端测试
cd apps/desktop/src-tauri && cargo test   # Rust Git 引擎集成测试
```

## 📂 仓库结构

| 目录 | 说明 |
| --- | --- |
| `apps/desktop` | Tauri v2 桌面客户端，包含 React 18 前端与 Rust + libgit2 后端引擎 |
| `apps/website` | 官方展示网站（基于 Astro 5 构建） |
| `packages/core` | 纯 TypeScript 领域模型：提交图布局算法、代码词级 diff、冲突解析器、Git 平台与 AI 适配器 |
| `packages/design-system` | 基础设计系统：颜色变量、Tailwind Preset、UI 原语组件与图标 |
| `scripts` | 中文化同步流水线（`sync-localize.ps1`）与构建图标脚本 |
| `zh-dict` | 结构化中文化词库（`dict.tsv`）、保护规则（`protect.txt`）与待译清单 |
| `docs` | 架构设计、UI 指南、开发贡献规范与分发指南 |

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
