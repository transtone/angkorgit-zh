<#
  classify-pending.ps1 — pending.tsv 可译/不可译甄别器（t1 契约的机器实现）
  输出：pending-classified.tsv（line/scope/file/source/verdict/reason/hint）+ 控制台统计。
  规则顺序即契约 §2 甄别规则表；行号区间即契约 §5 批次切分。
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent                       # E:\angkorgit_zh
$dictDir = $PSScriptRoot
$up = Join-Path $root '.tmp-analysis\upstream'                 # 上游浅克隆 HEAD 5e71a4e（源码上下文）
$pendingPath = Join-Path $dictDir 'pending.tsv'
$dictPath = Join-Path $dictDir 'zh-CN.json'
$protectPath = Join-Path $dictDir 'protect.txt'

# ---------- 加载 zh-CN.json 与 protect.txt ----------
$catalog = [System.IO.File]::ReadAllText($dictPath) | ConvertFrom-Json
if ($catalog -isnot [pscustomobject]) { throw 'zh-CN.json 必须是 id → 词条对象' }
$dictRows = @(
  foreach ($property in $catalog.PSObject.Properties) {
    $entry = $property.Value
    [pscustomobject]@{
      Id = $property.Name
      Scopes = (@($entry.scopes) -join ',')
      Src = $entry.source
      Tgt = $entry.target
    }
  }
)
$protectRegexes = @()
foreach ($pl in [System.IO.File]::ReadAllLines($protectPath)) {
  if ($pl -match '^\s*#') { continue }
  if ($pl.Trim() -eq '') { continue }
  $protectRegexes += [regex]::new($pl)
}

# ---------- 有序规则表（先命中先赢）----------
# 每条：Name, Reason, Pattern（正则 or $null）
$skipRules = [ordered]@{}

# S1 过期文件行（文件在 upstream HEAD 不存在）
$skipRules['S1'] = [pscustomobject]@{ Reason = '文件不存在于上游 HEAD（过期待译行）'; Re = $null; Match = { param($r) return -not (Test-Path -LiteralPath (Join-Path $up $r.File)) } }

# S2 protect 命中（入词库会被引擎保护旁路误替换，契约禁止）
$skipRules['S2'] = [pscustomobject]@{ Reason = 'source 命中 protect.txt 保护正则'; Re = $null; Match = { param($r) foreach ($p in $script:protectRegexes) { if ($p.IsMatch($r.Source)) { return $true } } return $false } }

# S3 代码片段 / 模板字面量残留
$skipRules['S3'] = [pscustomobject]@{ Reason = '代码片段/模板残留'; Re = '^( : \x27\x27\}|\)\.join\(.\\n.\)\}|a>\(\) -> RemoteCallbacks<|Command::new\(|a>\(repo: &|\{file_header\}@@|\{header\}\{hunk\}|%\{http_code\}\\n|status: "conflicts"|3 2\.5|\x27JetBrains Mono\x27, monospace|\\b \\b|\\r\\n\$ )$' ; Match = $null }

# S4 路径/标识符/键名/CSS 类（无空格含 / 或显式名单）
$s4List = @('workspace:*','process:default','updater:default','SITE_BASE=/','auto_updates true','class=Http','bundle.createUpdaterArtifacts: true','TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)','tauri.conf.json → plugins.updater.pubkey','!Launch-Checklist.md','read:repository:bitbucket','write:repository:bitbucket','index, follow','og:description','og:image:height','og:image:width','og:site_name','twitter:card','twitter:description','twitter:image','twitter:title','nav a','h2, p','hidden lg:block','block truncate','__TAURI_INTERNALS__','zustand/middleware','astro:content','astro/loaders','WorkingCopyFileListItemContaine…','refs/','origin/','upstream/','feature/* → [{suffix}]','staging → [support]')
$skipRules['S4'] = [pscustomobject]@{ Reason = '路径/标识符/键名/CSS 类'; Re = $null; Match = { param($r) $s = $r.Source; if ($s4List -contains $s) { return $true }; if ($s -notmatch '\s' -and $s -match '/') { return $true }; if ($s -match '^\.[A-Za-z0-9_./-]+$') { return $true }; return $false } }

# S5 CLI 命令/脚本片段
$skipRules['S5'] = [pscustomobject]@{ Reason = 'CLI 命令/脚本片段/配置项'; Re = '^(pnpm|cargo|brew|chmod|xattr|shasum|tccutil|tauri|corepack|clippy|printf|cat|sleep|playwright|vitest|tsc|vite)\b|^command -v|^git credential fill$|^git remote -v$|^(install:mac|release:mac|tauri:build|test:watch|website:build|website:images|website:preview|pnpm -r|blocking\(\)|gpg\.format=ssh|--foreground|--background)$' ; Match = $null }

# S6 日期
$skipRules['S6'] = [pscustomobject]@{ Reason = '日期常量'; Re = '^\d{4}-\d{2}-\d{2}$' ; Match = $null }

# S7 哈希/base64/公钥串
$skipRules['S7'] = [pscustomobject]@{ Reason = '哈希/base64/公钥串'; Re = '^[0-9a-f]{8,}$|^[A-Za-z0-9+/=]{60,}$' ; Match = $null }

# S8 品牌名/产品名/主题名（保留英文）
$s8List = @('Claude Code','Codex CLI','Gemini CLI','Antigravity CLI','Ollama','LM Studio','AI CLI','Google Gemini','Angkor Git','Git Angkor','AngKorGit Contributors','macOS, Windows, Linux','temple gold','Angkor Dawn','Angkor Dusk','AngKor Dark','AngKor Light','Ayu Dark','Ayu Light','Catppuccin Latte','Catppuccin Mocha','GitHub Dark','GitHub Light','One Dark Pro','Temple Gold','Tokyo Night','VS Code Dark+','VS Code Light+')
$skipRules['S8'] = [pscustomobject]@{ Reason = '品牌/产品/主题名（保留英文）'; Re = $null; Match = { param($r) return ($s8List -contains $r.Source) } }

# S9 git 原始输出/自动提交消息模板/trailer
$skipRules['S9'] = [pscustomobject]@{ Reason = 'git 原始输出/自动提交消息/trailer'; Re = '^\(cherry picked from commit|^\\{1,2} No newline at end of file|^Already up to date$|^Merge branch .x. into y$|^Merge branch .\{branch\}. into \{into\}$|^Revert ' ; Match = $null }

# S10 演示数据/示例数据/测试数据
$s10List = @('--- demo staged patch ---','Demo User','Already up to date (demo)','Rebase complete (demo)','Reverted (demo)',' main','Explains the why.','feature/parallel agents','feat/worktrees','init: why I made this','Dara Kim','Maly Sok','Sokha Chan','nonsense,=user,host=, GitHub.com=Dara ','Test User','Monika/Main/dbo/Stored Procedures/Colo…','Monika/Main/dbo/Stored…/Coloris_RiskControl_ApplyPlayerStatus.sql','docs: …','feat(graph): …','fix(engine): …')
$skipRules['S10'] = [pscustomobject]@{ Reason = '演示/示例/测试数据'; Re = '^(feat|fix|docs|style|test|refactor|chore|init)(\([^)]*\))?: ' ; Match = { param($r) return ($s10List -contains $r.Source) } }

# S11 快捷键键名序列
$skipRules['S11'] = [pscustomobject]@{ Reason = '快捷键键名序列'; Re = '^(mod\+shift[\+=z=]+|ControlOrMeta\+[fkn]|\[ / \]|↑ / ↓|\+ / − / 0|[A-Z] / [A-Z⇧]+|Home / End|\[\{suffix\}\])$' ; Match = $null }

# S12 选择器/SVG path/标记代码
$skipRules['S12'] = [pscustomobject]@{ Reason = '选择器/SVG/标记代码'; Re = '^(aside button\[|aside div\[|button span|img\[src|\*\*://|<circle|<path|<rect|\s*const |\s*return |\s*import |\s*export function|^M\d|^m\d|^0 0 \d+ \d+$|^\d+ \d+ \d+ \d+$|^\s*\d+(\.\d+)?%$)' ; Match = $null }

# S13 纯占位符/模板变量（无英文文案）
$skipRules['S13'] = [pscustomobject]@{ Reason = '纯占位符/模板变量'; Re = '^(\{[^}]*\}|[{}] |\{)$|^\{|^\{[A-Z_]+:\{|^HEAD:|^worktree:\{|^ref: $|^url=\{|^username=\{|^protocol=https|^\+?\{|^%\{|^acct:|^ai:\{|^commit: \{\}|^\{literal\}|^\[GNUPG:\]|^\{scheme\}://|^api\.\{host\}$|^Basic \{basic\}$|^Bearer \{token\}$|^Bearer tok$|^\{email\}:\{token\}$|^\{name\} \{\}$|^\{\} \{\}$|^\{\} \{\} \{\}$|^\{\} <\{\}>$|^\{_\}\{suffix\}$|^\{name\}:\{target\}$|^\{base\}-\{i\}$|^\{remote_name\}/\{|^\{username\}$|^\{remote_name\}/\{local_branch\}$' ; Match = $null }

# S14 协议常量/MIME/host
$skipRules['S14'] = [pscustomobject]@{ Reason = '协议常量/MIME/host'; Re = '^application/|^image/svg\+xml$|^#!/bin/sh|^[a-z0-9.-]+\.[a-z]{2,6}(:\d+)?$' ; Match = $null }

# S15 changelog 元标记
$skipRules['S15'] = [pscustomobject]@{ Reason = 'changelog 元标记'; Re = '^\[Unreleased\]$|^\(section deleted\)$|^<repo>-<branch>$' ; Match = $null }

# S16 AI 提示词/探针
$skipRules['S16'] = [pscustomobject]@{ Reason = 'AI 提示词/探针'; Re = '^Treat the conventions above|^Reply with exactly one word: pong$|^diff mentioning \{OUTPUT_FILE_PLACEHOLDER\}' ; Match = $null }

function Test-Skip([pscustomobject]$row) {
  # e2e 选择器内嵌 UI 文案 → 特殊处理（整串改写，不走 S12 跳过）
  if ($row.Source -eq 'aside div[title*="drag onto another branch"]') { return $null }
  foreach ($k in $skipRules.Keys) {
    $r = $skipRules[$k]
    if ($r.Re -and ($row.Source -match $r.Re)) { return $k }
    if ($r.Match) { if (& $r.Match $row) { return $k } }
  }
  return $null
}

# ---------- JSON 词条复用提示（保留所有上下文候选，由人工确认适用性） ----------
function Get-DictHint([string]$src) {
  $t = $src.Trim()
  $matches = @($dictRows | Where-Object { $_.Src.Trim() -ceq $t })
  $prefix = 'dict'
  if ($matches.Count -eq 0) {
    $matches = @($dictRows | Where-Object { $_.Src.Trim().ToLowerInvariant() -ceq $t.ToLowerInvariant() })
    $prefix = 'dict变体'
  }
  if ($matches.Count -eq 0) { return '' }
  return ($matches | ForEach-Object { "{0}:{1}:{2}:{3}" -f $prefix, $_.Id, $_.Scopes, $_.Tgt }) -join ' | '
}

# ---------- 主流程 ----------
$rows = @()
$reviews = @()
$lineNo = 0
foreach ($pl in [System.IO.File]::ReadAllLines($pendingPath)) {
  $lineNo++
  if ($lineNo -eq 1) { continue }
  $f = $pl -split "`t"
  if ($f.Count -lt 3) { continue }
  if ($f[0] -eq 'review') {
    $reviews += [pscustomobject]@{ Line = $lineNo; File = $f[1]; Id = $f[2]; Reason = $f[3] }
    continue
  }
  $rows += [pscustomobject]@{ Line = $lineNo; Scope = $f[0]; File = $f[1]; Source = $f[2] }
}

$out = New-Object System.Collections.Generic.List[string]
[void]$out.Add("# pending.tsv 甄别结果（由 classify-pending.ps1 生成）")
[void]$out.Add("# 列：line<TAB>scope<TAB>file<TAB>source<TAB>verdict<TAB>reason<TAB>hint")
$stats = @{ B1_t = 0; B1_s = 0; B2_t = 0; B2_s = 0; B3_t = 0; B3_s = 0 }
$scopeStats = @{}

foreach ($r in $rows) {
  $k = Test-Skip $r
  if ($k) {
    $verdict = 'skip'; $reason = $skipRules[$k].Reason; $hint = ''
  } else {
    $hint = Get-DictHint $r.Source
    if ($r.Source -eq 'aside div[title*="drag onto another branch"]') { $verdict = 'translate'; $reason = 'e2e 选择器整串改写（需配套 ui 片段词条 drag onto another branch to merge or rebase）' }
    elseif ($hint -like 'dict:*') { $verdict = 'translate'; $reason = 'zh-CN.json 已有候选译文（按 ID 核对 scopes/locations/anchor/mode，勿自动扩展上下文）' }
    elseif ($hint -like 'dict变体:*') { $verdict = 'translate'; $reason = 'zh-CN.json 大小写变体候选（核对上下文后复用译文）' }
    else { $verdict = 'translate'; $reason = '新译' }
  }
  $b = if ($r.Line -le 272) { 'B1' } elseif ($r.Line -le 500) { 'B2' } else { 'B3' }
  if ($verdict -eq 'translate') { $stats["${b}_t"]++ } else { $stats["${b}_s"]++ }
  if (-not $scopeStats.ContainsKey($r.Scope)) { $scopeStats[$r.Scope] = @{ t = 0; s = 0 } }
  if ($verdict -eq 'translate') { $scopeStats[$r.Scope].t++ } else { $scopeStats[$r.Scope].s++ }
  [void]$out.Add(($r.Line, $r.Scope, $r.File, $r.Source, $verdict, $reason, $hint) -join "`t")
}

foreach ($r in $reviews) {
  [void]$out.Add(($r.Line, 'review', $r.File, $r.Id, 'review', $r.Reason, '核对 zh-CN.json 中的文案与定位，不作为新英文词条处理') -join "`t")
}
$enc = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines((Join-Path $dictDir 'pending-classified.tsv'), $out, $enc)

Write-Host "需人工审阅的定位或文案变化: $($reviews.Count)"
Write-Host "总行数: $($rows.Count)  →  可译: $(($stats.B1_t + $stats.B2_t + $stats.B3_t))  跳过: $(($stats.B1_s + $stats.B2_s + $stats.B3_s))"
Write-Host ("B1(行2-272): 可译 {0} / 跳过 {1}" -f $stats.B1_t, $stats.B1_s)
Write-Host ("B2(行273-500): 可译 {0} / 跳过 {1}" -f $stats.B2_t, $stats.B2_s)
Write-Host ("B3(行501-814): 可译 {0} / 跳过 {1}" -f $stats.B3_t, $stats.B3_s)
Write-Host '--- 按 scope ---'
foreach ($k in ($scopeStats.Keys | Sort-Object)) { Write-Host ("{0}: 可译 {1} / 跳过 {2}" -f $k, $scopeStats[$k].t, $scopeStats[$k].s) }
Write-Host '--- skip 原因分布 ---'
$reasonCount = @{}
foreach ($r in $rows) { $k = Test-Skip $r; if ($k) { $n = $skipRules[$k].Reason; if (-not $reasonCount.ContainsKey($n)) { $reasonCount[$n] = 0 }; $reasonCount[$n]++ } }
foreach ($k in ($reasonCount.Keys | Sort-Object { -$reasonCount[$_] })) { Write-Host ("{0}: {1}" -f $reasonCount[$k], $k) }
Write-Host "输出: $($dictDir)\pending-classified.tsv"
