# 分发指南

AngKorGit 如何交付给用户：签名、公证、自动更新与包管理
管理器。标记为 **[owner]** 的步骤需要项目所有者的账户/密钥，
无法由贡献者自动完成。

## 1. 版本号与发布（当前可用）

1. 更新 `apps/desktop/src-tauri/tauri.conf.json` 中的版本，
   `apps/desktop/src-tauri/Cargo.toml`，以及根/应用 `package.json`。
2. 把 `CHANGELOG.md` 中 `[Unreleased]` 的条目移到新版本标题下。
3. 提交、打标签 `vX.Y.Z`、推送标签 → `.github/workflows/release.yml` 构建
   macOS（universal）、Windows 与 Linux 安装包（经 `tauri-action`），并附加
   到**草稿** GitHub release。审查后粘贴更新日志段落并发布。

## 2. 无付费签名的分发（当前选定的方案）

AngKorGit 以**未签名**形式发布——免费且独立。用户首次启动多一步
操作；请醒目地说明这一点（README 已覆盖）：

- **macOS**：应用未公证，Gatekeeper 会阻止首次打开。
  右键点击应用 → **打开** → 打开，或在较新的 macOS 上：
  **System Settings → Privacy & Security → "AngKorGit 已被阻止" → 仍然打开**.
  终端替代方案：`xattr -cr /Applications/AngKorGit.app`（移除
  隔离标记）。Tauri 会自动对二进制做 ad-hoc 签名，因此它能在
  通过 Gatekeeper 后在 Apple Silicon 上正常运行。
- **Windows**: SmartScreen shows "Windows 已保护你的电脑" →
  **更多信息 → 仍要运行**。
- **Linux**：AppImage：`chmod +x AngKorGit_*.AppImage` 后运行；`.deb` 可正常安装
  normally.

**macOS 钥匙串提示**：账户令牌存放在钥匙串中，而 macOS
cannot durably trust an unsigned binary — "始终允许" does not stick, so
需要令牌的第一次 git 操作会请求授权——**每个应用会话一次**
会话**（钥匙串读取在进程内缓存；`accounts.rs` 的 `TOKEN_CACHE`）。
Click **Allow** (not "始终允许" — it has no effect). One prompt per launch
是未签名构建的预期行为；付费的 Developer ID 签名是
让授权永久有效的唯一途径。

**macOS 文件夹访问提示（桌面/文稿/下载）**：授权与
应用的代码签名绑定。一个已安装构建 → 每个文件夹一次提示，
之后便记住。每次 UPDATE（新的 ad-hoc 签名）可能再问一次。
无休止的提示循环意味着被替换二进制留下了过期/冲突的记录
（常见于安装了多个构建的开发机）：用以下命令修复
`tccutil reset All dev.angkorgit.app`，然后重新启动并点一次“允许”。用户
必须把应用从 dmg 拖到 /Applications——在 dmg 内部运行时
会触发应用位移，授权将永远无法持久。

安全上的诚实：未签名 ≠ 不安全。发布版由公开的 GitHub
Actions 从公开源码构建，更新经 minisign 校验（§3），用户可以
随时从源码自行构建。如果项目日后获得赞助，Apple
公证（约 99 美元/年）可以补上——工作流片段保存在 git
历史中——纯粹为省去首次启动那一步。

## 3. 自动更新——已启用 ✅（免费，不依赖 Apple）

更新从 GitHub releases 拉取，并用项目的
**自有 minisign 密钥**校验后才安装——被篡改的下载永远不会运行。

代码库中已接通：
- 密钥对已生成；**私钥：`~/.tauri/angkorgit.key`（所有者的
  机器上——请务必备份。一旦丢失，现有安装将永远无法再更新。**
  公钥：内嵌于 `tauri.conf.json → plugins.updater.pubkey`。
- 已注册 `tauri-plugin-updater` + `tauri-plugin-process`；能力
  `updater:default`, `process:default`; `bundle.createUpdaterArtifacts: true`.
- 前端：启动 5s 后静默检查（`features/updater/check.ts`）→
  "有可用更新" toast with **Update now** (download, verify, relaunch);
  manual **检查更新** in the Settings rail footer.
- `release.yml` 把 `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` 传给 tauri-action，
  后者随后生成并上传 `latest.json`。

**[owner] 一次性——已完成**：两个 GitHub secrets 均已配置（自
0.2.0 起发布附带 `.sig` 文件与 `latest.json`）：
- `TAURI_SIGNING_PRIVATE_KEY` ——`~/.tauri/angkorgit.key` 的内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ——设为**空值**（必需：
  不设该环境变量时 Tauri 会尝试交互式提示，无头构建将失败）。

## 4. Homebrew cask **[上线——自有 tap]**

发布在 `cheat2001/homebrew-tap`（`Casks/angkorgit.rb`）。安装：

```sh
brew install --cask cheat2001/tap/angkorgit
```

只有一条命令：cask 会在安装的应用上运行 `xattr -cr`，放在
`postflight` 块中，自动清除 Gatekeeper 隔离标记（之所以需要，
是因为应用未签名；新版 Homebrew 已移除 `--no-quarantine`）。
自有 tap 的 cask 可以这样做——homebrew/cask 官方库会拒绝，所以当
cask 最终迁入官方库时，签名/公证必须取代 postflight。

**每次发布**都必须更新 cask：更新 `version` 与 `sha256`
（新 universal dmg 的 `shasum -a 256`）于
`cheat2001/homebrew-tap/Casks/angkorgit.rb`。cask 设置 `auto_updates true`
（应用自行更新），因此通过 tap 安装一次的用户仍能获得新版本
（应用内更新）；版本号对全新安装很重要。请把它加入发布检查清单。

当项目有了一定热度（75+ stars、30+ forks）且应用
已签名/公证后，再提交到 homebrew-cask 官方库，以
`brew install --cask angkorgit`.

## 5. 网站（线上）

- 线上地址 `https://angkorgit.app/`（Astro、静态站点，经 GitHub Pages 部署，通过
  `.github/workflows/website.yml`；自定义域名 + HTTPS 强制启用）。
- 区块：带提交图截图的 hero、功能、画廊、性能、AI、
  安装（各系统的下载卡片 + 带复制按钮的终端一行命令）、
  开源、最终行动号召。
- 文档直接在站内 `/docs/` 渲染，来源是 `docs/*.md`（见
  `apps/website/src/content.config.ts`）——改一篇文档，站点在
  下次部署时更新；无需重复维护。
- SEO：meta/OG/JSON-LD、站点地图、Google Search Console 已验证
  （URL 前缀属性）、`robots.txt` → `sitemap-index.xml`。
- 发布/验证手册：`docs/Launch-Checklist.md`。
