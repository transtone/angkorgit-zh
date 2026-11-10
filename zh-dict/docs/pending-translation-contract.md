# pending.tsv 翻译契约（t3/t4/t5 翻译批次 + t6 合并回归 的输入契约）

> 历史批次记录，非当前操作规范。文中旧 PS1、SkipSync 和 dry-run 命令已失效；当前翻译入口为 `bun run localize --repo <源码目录>`，回归测试为 `bun run test:localize`。

- 制定者：researcher（t1 · requirements r1）
- 输入：`zh-dict/pending.tsv`（813 条，`scope<TAB>文件<TAB>英文串`，行 2–814）、`zh-dict/dict.tsv`（578 条，`scope/source/target/anchor`）、`zh-dict/protect.txt`、`zh-dict/skip-files.txt`、`docs/i18n-scope-report.md`、`scripts/sync-localize.ps1`
- 源码上下文（查 anchor/语境）：`E:\angkorgit_zh\.tmp-analysis\upstream`（上游 HEAD `5e71a4e` 浅克隆，只读）
- 机器甄别结果：`zh-dict/pending-classified.tsv`（由 `zh-dict/classify-pending.ps1` 生成；列 = line/scope/file/source/verdict/reason/hint）

---

## 1. 总原则

1. **先甄别后翻译**：每条先判 可译/不可译；不可译一律**不产出词条**（留在 pending.tsv 是符合设计的）。
2. **跳过类永不进 dict.tsv**。凡 source 命中 `protect.txt` 任一正则，**禁止**入词库——引擎对命中保护正则的 source 有旁路逻辑，会把代码里的路径/哈希也替换掉。
3. **先查 dict.tsv 再动笔**：source 与 dict.tsv 已有条目相同（忽略首尾空格；大小写不同 = 变体）→ 不重译，只产出 **scope 扩展** 条目（复用原 target/anchor）。
4. 产出为**每批次一个独立 TSV**（`zh-dict/batch-N.tsv`），**不直接改 dict.tsv/pending.tsv**——合并归 t6。

---

## 2. 可译/不可译甄别规则

`pending-classified.tsv` 已按下列规则给出每行 verdict；译者以其为准，存疑行可查源码后修正并在报告注明。

### 2.1 不可译（skip）类别

| 码 | 类别 | 判定 | 示例 |
| --- | --- | --- | --- |
| S1 | 过期行 | 文件在上游 HEAD 不存在 | `Some brand new untranslated phrase from upstream`（hello/HelloPanel.ts 已不存在） |
| S2 | 保护命中 | source 命中 protect.txt | 路径/哈希/URL/邮箱/版本号形态串 |
| S3 | 代码片段 | 模板残留/表达式碎片 | ` : ''}`、`).join('\n')}`、`3 2.5`、`'JetBrains Mono', monospace`、`\b \b`、`\r\n$ ` |
| S4 | 路径/标识符 | 无空格含 `/` 的路径、CSS 类、键名、scope 标识 | `src/core/ipc.ts`、`zustand/middleware`、`astro:content`、`read:repository:bitbucket`、`og:description`、`feature/* → [{suffix}]` |
| S5 | CLI/脚本 | 命令、脚本名、配置项 | `pnpm install`、`cargo build`、`git credential fill`、`xattr -cr`、`install:mac`、`gpg.format=ssh`、`--background` |
| S6 | 日期 | `YYYY-MM-DD` | `2023-06-01` |
| S7 | 哈希/base64 | 长十六进制/base64/公钥 | `000096aaaaaa`、`iVBORw0KGgo…`、minisign 公钥串 |
| S8 | 品牌/主题名 | 产品名、CLI 名、主题名**单独成串**时保留英文 | `Claude Code`、`LM Studio`、`Angkor Git`、`Angkor Dawn`、`macOS, Windows, Linux`、`AI CLI` |
| S9 | git 原始输出 | git 输出、自动提交消息模板、trailer | `Already up to date`、`(cherry picked from commit …)`、`Merge branch 'x' into y`、`\ No newline at end of file`、`Revert "{summary}"…` |
| S10 | 演示/示例数据 | demo/测试/示例内容 | `Demo User`、`--- demo staged patch ---`、`feat(graph): virtualize commit rows`、`Dara Kim`、` main`、`feature/parallel agents`、`Monika/Main/…` |
| S11 | 快捷键键名 | 纯键名序列 | `mod+shift+=`、`ControlOrMeta+k`、`[ / ]`、`Home / End`、`[{suffix}]` |
| S12 | 选择器/SVG | CSS 选择器、SVG path/viewBox、mock 代码行 | `M4 6h16…`、`0 0 24 24`、`<circle …/>`、`aside button[title="feature"]`、`const palette = …` |
| S13 | 纯占位符 | 只有 `{}`/`${}`/协议骨架 | `{OUTPUT_FILE}`、`{} {}`、`HEAD:{}:{}`、`acct:{host}:{username}`、`{scheme}://{host}/api/v4/user` |
| S14 | 协议常量 | MIME、host 样板、HTTP 头值 | `application/json`、`application/vnd.github+json`、`Basic {basic}`、`Bearer {token}`、`gitlab.example.com:8443` |
| S15 | 元标记 | changelog/文档标记 | `[Unreleased]`、`(section deleted)`、`<repo>-<branch>` |
| S16 | AI 提示词 | 发给 AI 的指令/探针文本 | `Treat the conventions above only as guidance…`、`Reply with exactly one word: pong` |

### 2.2 可译（translate）类别

| 码 | 类别 | 说明 |
| --- | --- | --- |
| T | 新译 | 无 dict 复用，按 §3 风格产出 |
| TR | dict 复用 | `pending-classified.tsv` hint 列 `dict:scope:target` → 只产出 scope 扩展条目（scope = dict scope ∪ 本行 scope，target/anchor 照抄） |
| TE | e2e 选择器整串改写 | 选择器内嵌 UI 文案时，整条选择器作为 source，只翻其中 UI 片段、选择器语法不变 |

### 2.3 特例（必须执行）

1. **e2e 191** `aside div[title*="drag onto another branch"]`（B1）→ TE 产出：
   - `e2e	aside div[title*="drag onto another branch"]	aside div[title*="拖到另一个分支上"]	`（无 anchor）
   - 同时产出**配套补充词条**（B1 独占，标注注释）：`ui	drag onto another branch to merge or rebase	拖到另一个分支上以合并或变基	`（对应 Sidebar.tsx:641 title 模板片段；该片段因含 `${branch.name}` 未进 pending，但 e2e 依赖它同步改写）
2. **大小写变体**（hint 列 `dict变体:…`）：复用译文、产出与 pending 完全一致的小写 source 词条，如 `folder missing`→`文件夹缺失`、`replace hand edits?`→`替换手工编辑？`、`clear state, keep everything as is`→`清除状态，保持一切原样`。
3. **前导空格行**（website mock）：` Discard all`/` Stage all`/` Unstage all`/` Mark resolved` → **不新建前导空格词条**，改为扩展 dict 已有无空格词条的 scope 至 website（source 行内命中即可）；` Amend`/` Review` 无 dict 裸词 → 新建去空格裸词条 **必须带 anchor**：`Amend` anchor `\+ ' Amend'`、`Review` anchor `\+ ' Review'`（目标 `修订`/`审查`），防止与 `Amend, revert, reset (soft, mixed, hard)`（行 742，新译长串）子串冲突。
4. **行 496**（HelloPanel）为 S1 过期行：不产出；重新生成 pending.tsv 时自动消失。
5. **跳过行留在 pending.tsv** 属预期：回归后 pending ≈ 439 条（跳过基线），验收看"translate 行全部消失 + 总数显著下降"，不看归零。

---

## 3. 译文风格

- **UI（scope=ui/e2e/website 界面文案）**：命令式简洁动词短语，与 dict.tsv 现有风格一致；保留省略号 `…`、快捷键符号（⌘ ⇧ ↩ ⏎ ↑ ↓）、`<em>` 等内联标记与占位符。
- **Rust 错误消息（scope=rust）**：书面语完整句；`{e}`、`{branch}` 等占位符与 `'{}'` 引号**原样保留**，占位符顺序不变；内嵌代码标记保持英文（`class=Http (34)`、`proc::hidden`、`gpg.format=ssh`）。
- **docs（scope=docs）**：书面语；代码块、命令、路径、徽章保持原文；引号内的 UI 措辞沿用 UI 译文。
- **e2e 断言/测试标题**：自然中文即可（安全，不影响选择器）。
- **标点**：中文全角标点；原文 `…` 保留；` — ` → `——`（连接语意时）；嵌套引号用“”。
- **数字/单位/格式名**：`5 MB`、`UTF-8`、`.msi`、`AppImage`、`HTTP 402` 保持。

### 3.1 术语表（与 dict.tsv 一致，新增沿用）

| EN | ZH | EN | ZH |
| --- | --- | --- | --- |
| commit | 提交 | branch | 分支 |
| tag | 标签 | stash | 暂存 |
| worktree | 工作树 | working copy | 工作副本 |
| pull request | 拉取请求 | merge request | 合并请求 |
| rebase | 变基 | revert | 还原 |
| discard | 丢弃 | push / pull | 推送 / 拉取 |
| fetch | 拉取（与 pull 并列时译“抓取”） | checkout | 检出 |
| hash | 哈希 | token | 令牌 |
| keychain | 钥匙串 | credentials | 凭据 |
| remote / upstream | 远端 / 上游 | repository | 仓库 |
| profile / identity | 配置 / 身份 | provider | 提供方 |
| account | 账户 | host | 主机（托管平台） |
| staged / untracked | 已暂存 / 未跟踪 | hunk | 代码块 |
| cherry-pick / squash | 拣选 / 压缩 | amend | 修订 |
| detached HEAD | 游离的 HEAD | submodule | 子模块 |
| commit graph | 提交图 | palette | 命令面板 |
| blame | blame（保留） | WIP | WIP（保留） |
| AI / CLI / diff / git / PR / MR | 保留原文 | scope（令牌权限） | 权限范围 |

### 3.2 品牌/专名保留（译文内部出现时照抄）

`AngKorGit`、`Angkor Git`、`Git Angkor`、`angkorgit.app`、`cheat2001/angkorgit`、`Claude Code`、`Codex CLI`、`Gemini CLI`、`Antigravity CLI`、`Ollama`、`LM Studio`、`OpenCode`、`GitHub/GitLab/Bitbucket/Atlassian/GitKraken/Fork`、`Tauri`、`WebKitGTK`、`libssl`、`SmartScreen`、`Homebrew`、`PowerShell`、`macOS/Windows/Linux`、主题名（Angkor Dawn/Dusk、Ayu Dark/Light、Catppuccin Latte/Mocha、GitHub Dark/Light、One Dark Pro、Temple Gold、Tokyo Night、VS Code Dark+/Light+）。

---

## 4. anchor 规则

1. **无空格单单词 source 必须带 anchor**（dict.tsv 加载器强制：缺 anchor 直接 exit 5）。本批 pending 中新译行均为多词，唯一裸词风险在 §2.3-3（`Amend`/`Review`）。
2. anchor 是**行级 .NET 正则**，须匹配"包含该 source 的源文件行"；至少命中对应 scope 一个文件的一行（校验命令见 §6）。
3. anchor 用于消歧：前缀包含（`In use here` ⊃ `In use`）或词条 source 是别的长串子串时必须用它把替换限制到目标行。
4. 前导/尾随空格 source 一律规避（§2.3-3）；不得产出裸 `URL`、`Commit`、`Branch` 之类高危短词。

---

## 5. 批次切分（pending.tsv 行号区间）

| 批次 | 译者 | pending.tsv 行 | 行数 | 构成 | 可译 / 跳过（已甄别） |
| --- | --- | --- | --- | --- | --- |
| B1 | translator-a | 第 2–272 行 | 271 | core(24) + docs(160) + e2e(55) + meta(24) + rust 前 8 行 | 110 / 161 |
| B2 | translator-b | 第 273–500 行 | 228 | rust 余 167 行 + ui 前 61 行（440–500） | 129 / 99 |
| B3 | translator-c | 第 501–814 行 | 314 | ui 余 99 行（501–599）+ website(215) | 135 / 179 |

- 切点：272/273 落在 `ai_cli.rs` 路径行之间；500/501 落在 `Inspector.tsx`/`CloneDialog.tsx` 文件边界。切分处无同 source 跨批冲突（已核）。
- 工作量以"可译数"均衡：110 / 129 / 135；跳过行只需照 `pending-classified.tsv` 抄 verdict，不产出。
- 每个译者只处理自己区间；跨批同 source 冲突由 t6 合并规则解决（§7）。

---

## 6. 产出文件与校验

### 6.1 格式（`zh-dict/batch-N.tsv`，N=1/2/3）

- UTF-8 无 BOM，LF；`#` 开头为注释行；数据列 TAB 分隔：`scope<TAB>source<TAB>target<TAB>anchor(可选)`。
- scope：`ui/rust/core/website/docs/meta/e2e` 逗号组合（无空格），**必须包含该行所属 scope**；TR 扩展条目 = dict scope + 本行 scope 并集。
- source：pending 原文（不含引号）；占位符/`<em>`/`…` 原样。
- target：中文；不得为空、不得与 source 相同、不得含 TAB/换行。
- anchor：无空格 source 必填；多词 source 可选（歧义时填）。
- 只输出 translate 行（T/TR/TE）；跳过行不出现。文件头注释注明批次区间与条数。
- 产出后**删除**该批在 `pending-classified.tsv` 之外自行新增的中间文件（不要求）。

### 6.2 校验命令（每批产出后必跑，0 错误才交付）

```powershell
$bad = 0
foreach ($f in Get-ChildItem E:\angkorgit_zh\zh-dict\batch-*.tsv) {
  $i = 0
  foreach ($l in [IO.File]::ReadAllLines($f)) {
    $i++
    if ($l -match '^\s*#' -or $l.Trim() -eq '') { continue }
    $c = $l -split "`t"
    if ($c.Count -lt 3 -or $c.Count -gt 4) { "列数错误 $($f.Name):$i"; $bad++ }
    elseif ($c[0] -notmatch '^(ui|rust|core|website|docs|meta|e2e)(,(ui|rust|core|website|docs|meta|e2e))*$') { "scope 非法 $($f.Name):$i"; $bad++ }
    elseif ([string]::IsNullOrWhiteSpace($c[2]) -or $c[1] -eq $c[2]) { "译文缺失/未变 $($f.Name):$i"; $bad++ }
    elseif ($c[1] -notmatch '\s' -and $c.Count -lt 4) { "单单词缺 anchor $($f.Name):$i"; $bad++ }
    if ($c.Count -gt 3) { try { $null = [regex]::new($c[3]) } catch { "anchor 非法 $($f.Name):$i"; $bad++ } }
    if ($c.Count -ge 2) {
      foreach ($p in (Get-Content E:\angkorgit_zh\zh-dict\protect.txt | Where-Object { $_ -notmatch '^\s*#' -and $_.Trim() })) {
        if ([regex]::new($p).IsMatch($c[1])) { "source 命中 protect（禁止入词库）$($f.Name):$i"; $bad++ }
      }
    }
  }
}
"batch 校验错误数: $bad"
```

anchor 命中校验（带 anchor 的词条）：

```powershell
$u = 'E:\angkorgit_zh\.tmp-analysis\upstream'
$scopeFiles = @{
  ui      = @('apps/desktop/src/**/*.ts','apps/desktop/src/**/*.tsx')
  rust    = @('apps/desktop/src-tauri/src/**/*.rs')
  core    = @('packages/core/src/**/*.ts')
  website = @('apps/website/src/**/*.ts','apps/website/src/**/*.tsx','apps/website/src/**/*.astro')
  meta    = @('apps/desktop/src-tauri/tauri.conf.json','package.json','apps/desktop/package.json','apps/desktop/src-tauri/Cargo.toml','apps/desktop/index.html')
  docs    = @('README.md','docs/**/*.md','CHANGELOG.md','SECURITY.md','CODE_OF_CONDUCT.md')
  e2e     = @('tests/e2e/**/*.ts')
}
foreach ($f in Get-ChildItem E:\angkorgit_zh\zh-dict\batch-*.tsv) {
  foreach ($l in [IO.File]::ReadAllLines($f)) {
    if ($l -match '^\s*#' -or $l.Trim() -eq '') { continue }
    $c = $l -split "`t"
    if ($c.Count -lt 4) { continue }
    $hit = $false
    foreach ($s in ($c[0] -split ',')) {
      foreach ($g in $scopeFiles[$s]) {
        $dir = Split-Path (Join-Path $u $g) -Parent
        if (-not (Test-Path $dir)) { continue }
        if (Select-String -Path (Join-Path $u $g) -Pattern $c[3] -Quiet) { $hit = $true; break }
      }
      if ($hit) { break }
    }
    if (-not $hit) { "anchor 未命中任何源文件: $($c[1]) [$($c[3])]" }
  }
}
```

---

## 7. 合并去重规则（t6 · engineer 输入）

1. **与 dict.tsv 合并**：同 source（Trim 后精确相等）→ scope 并集，复用现有 target/anchor；target 不一致 → 批次条目作废并报 reviewer。
2. **批次间同 source** → scope 并集 + target 必须一致；不一致取批次号小者并报 reviewer。经机器核对的全部跨批同 source（translate 行）：
   - `Show older changes`（B1 docs 行81 / B2 ui 行497）→ `显示更早的更改`
   - `In use`（B1 docs 行60 / B3 ui 行541）→ 复用 dict website `使用中`
   - `folder missing`（B1 docs 行56 + e2e 行213 / B3 ui 行562）→ `文件夹缺失`
   - `Add account`（B1 docs 行32 / B3 ui 行515）→ `添加账户`
   - TR 复用类（target 天然一致）：`New worktree…`、`Pull requests`、`File history…`、`Mark resolved`、`Create branch`（B1 行166 扩展 dict ui）
3. **大小写变体**：同 target、source 各留一份（`folder missing`/`Folder missing` 并存）。
4. **子串/前缀规则**：新增 source 是已有 source 的严格子串时，长串必须在前（合并后对每个 scope 内新增条目按 source 长度**降序**插入）。已知必须排序的组合：`In use here` → `In use`（同 B3）；`At the current HEAD`/`From the current HEAD`（B2）→ `the current HEAD`（B3）；`Installed AI CLI (Claude Code, Codex…)` → `Installed AI CLI`（同 B1）；`Choose destination folder` → `Destination folder`（同 B3）；`Next match (↩)` → `Next match`、`Previous match (⇧↩)` → `Previous match`（同 B2）；`Amend, revert, reset (soft, mixed, hard)` → 带 anchor 的 `Amend`（同 B3）。
5. **保护校验**：source 命中 protect.txt → 拒绝（应已被 §6.2 拦截）。
6. **加载校验**：合并后跑一次 `sync-localize.ps1 -SkipSync`（dry-run），dict 加载失败（exit 5：非法 anchor/缺 anchor）即修复。
7. 合并完成删除/归档 `batch-*.tsv`（移到 `zh-dict/archive/`）。

---

## 8. 回归验收（t6 · engineer 执行，本契约给出的判定标准）

在**临时克隆**运行 `pwsh -NoProfile -File scripts/sync-localize.ps1 -Repo <临时克隆> -SkipSync`（默认 dry-run，零推送真实 fork）：

1. 词库加载 0 错误；日志「词库替换统计」**替换数 > 合并前基线**（记录前后两个数）。
2. 日志「待译清单」：813 → **≤ 450**，且 `pending-classified.tsv` 全部 translate 行对应的英文串不再出现（抽查 10 行 + 全量比对）。跳过类（≈439）留在清单属预期。
3. e2e 同步：`tests/e2e/smoke.spec.ts` 中出现 `aside div[title*="拖到另一个分支上"]`，`Sidebar.tsx` 出现 `拖到另一个分支上以合并或变基`。
4. 无破坏：`git diff --stat` 无跳过文件（icons/锁文件/截图）被改动；环境可用时跑 `pnpm typecheck`（不可用则记录警告）。
5. `pending.tsv` 由脚本自动重新生成（不手工编辑）。
6. 全程 `$LASTEXITCODE` 无 2/5 类错误；无任何 push。

---

## 9. 交付与报告

- 每批交付：`zh-dict/batch-N.tsv` + 校验输出 0 错误 + 报告（产出条数 / 复用条数 / 跳过条数 / 特例执行情况）。
- 译者存疑（verdict 或译文风格）→ 直接 `agent_teams_send_message` 给 researcher 或 captain，不要擅自扩大跳过范围。
- 本契约附件：`zh-dict/pending-classified.tsv`（逐行 verdict）、`zh-dict/classify-pending.ps1`（可复跑）。
