<#
.SYNOPSIS
  AngKorGit fork 一键脚本：同步上游 cheat2001/angkorgit → 全面中文化（zh-CN）→ 提交 → 推送 fork（默认 dry-run）。

.DESCRIPTION
  流水线（固定顺序）：
    ① 校验工作区干净、分支就绪
    ② 自动添加 upstream remote（缺失时）→ fetch upstream main → merge（冲突按策略处理）
    ③ 版本号 4 处一致性校验（可选 -BumpVersion 统一升级）
    ④ fork URL 替换（tauri.conf.json updater 端点 / check.ts 发布页 / site.ts 仓库地址 → -ForkRepo）
    ⑤ 字典式中文化（zh-dict/dict.tsv + protect.txt + skip-files.txt）
    ⑥ 未翻译英文串 → zh-dict/pending.tsv 待译清单
    ⑦ git add -A + 提交（无改动则跳过，幂等）
    ⑧ 推送：默认 dry-run（仅打印推送计划，绝不 push）；显式 -Push 才推送。无任何 force push 路径。

  安全约定：
    - 凭据一律走 git 凭据助手 / 环境，脚本不读取、不存储、不硬编码任何凭据。
    - 冲突默认中止（exit 2），不自动解决；-MergeStrategy ours 可选（本地中文化文件优先）。
    - 幂等：重复运行对已中文化仓库零改动；无上游更新且无待译变化时 no-op，退出码 0。

.PARAMETER Repo
  目标 fork 克隆路径（默认当前目录）。

.PARAMETER DryRun
  显式声明 dry-run（默认行为即是 dry-run；此开关仅用于文档化与脚本可读性）。

.PARAMETER NoDryRun
  显式关闭 dry-run（与 -Push 等价；推送到 fork 属于真实写操作，请确认）。

.PARAMETER Push
  推送到 origin（等价于 -NoDryRun）。默认不推送。

.PARAMETER SkipSync
  跳过同步阶段（fetch/merge），仅做本地化与提交。

.PARAMETER SkipLocalize
  跳过中文化阶段，仅做同步与提交。

.PARAMETER IncludeClaudeMd
  额外对 CLAUDE.md 做词库替换（默认排除：内容大、翻译价值低）。

.PARAMETER ForkRepo
  fork 仓库 "owner/repo"，用于替换上游 URL（默认 transtone/angkorgit-zh）。

.PARAMETER UpstreamUrl
  上游仓库地址（默认 https://github.com/cheat2001/angkorgit.git）。

.PARAMETER UpstreamRemote
  上游 remote 名（默认 upstream）。

.PARAMETER UpstreamBranch
  上游分支（默认 main）。

.PARAMETER Branch
  本地目标分支（默认 main；当前不在该分支且工作区干净时自动检出）。

.PARAMETER Remote
  推送目标 remote（默认 origin）。

.PARAMETER MergeStrategy
  merge（默认，分叉时生成合并提交）/ ff-only / rebase / ours（-X ours，冲突时本地中文化优先）。

.PARAMETER BumpVersion
  可选：统一升级版本号 x.y.z（package.json×2 / Cargo.toml / tauri.conf.json 共 4 处）。

.PARAMETER DictDir
  词库目录（默认脚本同级 ../zh-dict）。

.PARAMETER Help
  显示本帮助。

.EXAMPLE
  pwsh -NoProfile -File scripts/sync-localize.ps1 -Repo D:\src\angkorgit-fork
  # 完整流程，dry-run：同步 + 中文化 + 提交，但不推送

.EXAMPLE
  pwsh -NoProfile -File scripts/sync-localize.ps1 -Repo D:\src\angkorgit-fork -Push
  # 完整流程并推送到 fork origin

.EXAMPLE
  pwsh -NoProfile -File scripts/sync-localize.ps1 -Repo D:\src\angkorgit-fork -SkipSync -BumpVersion 0.10.1
  # 仅对现有克隆做中文化 + 版本升级（不推送）

.NOTES
  退出码：0 成功/无操作；1 一般错误；2 合并冲突（已列出冲突文件）；3 工作区不干净；
           4 非 git 仓库或缺少 git；5 配置/词库/版本一致性校验失败；6 推送失败；7 分支检出失败。
#>
[CmdletBinding()]
param(
  [string]$Repo = (Get-Location).Path,
  [switch]$DryRun,
  [switch]$NoDryRun,
  [switch]$Push,
  [switch]$SkipSync,
  [switch]$SkipLocalize,
  [switch]$IncludeClaudeMd,
  [string]$ForkRepo = 'transtone/angkorgit-zh',
  [string]$UpstreamUrl = 'https://github.com/cheat2001/angkorgit.git',
  [string]$UpstreamRemote = 'upstream',
  [string]$UpstreamBranch = 'main',
  [string]$Branch = 'main',
  [string]$Remote = 'origin',
  [ValidateSet('merge', 'ff-only', 'rebase', 'ours')][string]$MergeStrategy = 'merge',
  [string]$BumpVersion = '',
  [string]$DictDir = '',
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'

$script:LogFile = ''
$script:UsedFallbackIdentity = $false
$script:StatsReplacements = 0
$script:StatsFilesChanged = 0

function Write-Log {
  param([string]$Msg, [string]$Level = 'INFO')
  $stamp = Get-Date -Format 'HH:mm:ss'
  $line = "[$stamp][$Level] $Msg"
  Write-Host $line
  if ($script:LogFile) { Add-Content -LiteralPath $script:LogFile -Value $line -Encoding utf8 }
}

function Write-Step {
  param([string]$Title)
  Write-Log ('=' * 72)
  Write-Log $Title
  Write-Log ('=' * 72)
}

function Show-Usage {
  Get-Help -Name $PSCommandPath -Full | Out-String | Write-Host
}

function Invoke-Git {
  param([string[]]$ArgsList)
  # pwsh 7 与 Windows PowerShell 5.1 双兼容：
  # 5.1 在 $ErrorActionPreference='Stop' 下会把原生命令 stderr 抛为 NativeCommandError（2>&1 与 2> 均如此），
  # 故调用期间临时切到 Continue，并把 ErrorRecord 归一化为文本。
  $oldEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = $null
  try {
    $out = & git -C $Repo @ArgsList 2>&1
    $code = $LASTEXITCODE
  } catch {
    $code = $LASTEXITCODE
    if ($null -eq $code -or $code -eq 0) { $code = 1 }
    $er = $_.Exception.ErrorRecord
    if ($er) { $out = $er.ToString() } else { $out = $_.Exception.Message }
  } finally {
    $ErrorActionPreference = $oldEap
  }
  if ($null -eq $out) { $out = @() }
  if ($out -isnot [string]) { $out = $out | ForEach-Object { $_.ToString() } }
  return [pscustomobject]@{ Code = $code; Output = ($out -join "`n") }
}

function ConvertTo-GlobRegex {
  param([string]$Glob)
  $esc = [regex]::Escape($Glob)
  $esc = $esc -replace '\\\*\\\*/', '(?:.*/)?' -replace '\\\*\\\*', '.*' -replace '\\\*', '[^/]*'
  return '^' + $esc + '$'
}

function Get-Relative {
  param([string]$Path)
  return $Path.Substring($Repo.Length + 1).Replace('\', '/')
}

function Test-SkipFile {
  param([string]$Rel)
  foreach ($g in $script:SkipRegexes) { if ($g.IsMatch($Rel)) { return $true } }
  return $false
}

# ---------- 词库引擎 ----------
function Update-DictFile {
  param([string]$Path, [object[]]$Entries, [string]$Rel)
  $raw = [System.IO.File]::ReadAllText($Path)
  # 整文件预筛：文件不含任何词条原文则直接跳过
  $any = $false
  foreach ($e in $Entries) { if ($raw.Contains($e.Source)) { $any = $true; break } }
  if (-not $any) { return }
  $nl = if ($raw.Contains("`r`n")) { "`r`n" } else { "`n" }
  $lines = [regex]::Split($raw, "\r\n|\n|\r")
  $changed = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $newLine = $line
    foreach ($e in $Entries) {
      if ($e.Anchor -and $line -notmatch $e.Anchor) { continue }
      if (-not $newLine.Contains($e.Source)) { continue }
      # 词条 source 本身含保护模式（如 ~/.ssh 路径）时，该词条不受保护拦截
      $bypass = $false
      foreach ($pr in $script:Protect) { if ($pr.IsMatch($e.Source)) { $bypass = $true; break } }
      # 保护区间基于当前 $newLine 坐标（与匹配坐标一致，避免替换漂移误拦）
      $spans = @()
      if (-not $bypass) {
        foreach ($pr in $script:Protect) {
          foreach ($pm in $pr.Matches($newLine)) { $spans += , @($pm.Index, $pm.Length) }
        }
      }
      $esc = [regex]::Escape($e.Source)
      if ($e.Mode -eq 'whole') {
        $qclass = '[' + [char]39 + [char]96 + [char]34 + ']'
        $ms = [regex]::Matches($newLine, ('(?<q>' + $qclass + ')' + $esc + '\k<q>'))
      } else {
        $ms = [regex]::Matches($newLine, $esc)
      }
      if ($ms.Count -eq 0) { continue }
      for ($j = $ms.Count - 1; $j -ge 0; $j--) {
        $m = $ms[$j]
        $overlap = $false
        foreach ($sp in $spans) {
          if ($m.Index -lt ($sp[0] + $sp[1]) -and ($m.Index + $m.Length) -gt $sp[0]) { $overlap = $true; break }
        }
        if ($overlap) { continue }
        if ($e.Mode -eq 'whole') {
          $quote = $m.Groups['q'].Value
          $newLine = $newLine.Substring(0, $m.Index) + $quote + $e.Target + $quote + $newLine.Substring($m.Index + $m.Length)
        } else {
          $newLine = $newLine.Substring(0, $m.Index) + $e.Target + $newLine.Substring($m.Index + $m.Length)
        }
        $script:StatsReplacements++
      }
    }
    if ($newLine -ne $line) { $lines[$i] = $newLine; $changed = $true }
  }
  if ($changed) {
    $out = [string]::Join($nl, $lines)
    [System.IO.File]::WriteAllText($Path, $out, $script:Utf8NoBom)
    $script:StatsFilesChanged++
    Write-Log "  已替换：$Rel"
  }
}

function Invoke-LocalizeScopes {
  param([object[]]$Entries)
  $byScope = @{}
  foreach ($e in $Entries) {
    foreach ($s in $e.Scopes) {
      if (-not $byScope.ContainsKey($s)) { $byScope[$s] = New-Object System.Collections.ArrayList }
      [void]$byScope[$s].Add($e)
    }
  }
  foreach ($scopeName in $script:ScopeFiles.Keys) {
    $files = $script:ScopeFiles[$scopeName]
    if ($files.Count -eq 0) { continue }
    $scopeEntries = @()
    if ($byScope.ContainsKey($scopeName)) { $scopeEntries = @($byScope[$scopeName]) }
    if ($scopeEntries.Count -eq 0) { continue }
    Write-Log ("  scope[{0}] 文件 {1} 个" -f $scopeName, $files.Count)
    foreach ($rel in $files) {
      $abs = Join-Path $Repo ($rel.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
      if (-not (Test-Path -LiteralPath $abs)) { continue }
      if (Test-SkipFile $rel) { continue }
      Update-DictFile -Path $abs -Entries $scopeEntries -Rel $rel
    }
  }
}

# ---------- 待译清单 ----------
function Scan-Pending {
  $quoteRe = '(?<![\w])(?<q>["' + "'" + '`])(?<s>(?:\\.|(?!\k<q>).)*)\k<q>'
  $rows = New-Object System.Collections.Generic.List[string]
  foreach ($scopeName in $script:ScopeFiles.Keys) {
    foreach ($rel in $script:ScopeFiles[$scopeName]) {
      $abs = Join-Path $Repo ($rel.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
      if (-not (Test-Path -LiteralPath $abs)) { continue }
      if (Test-SkipFile $rel) { continue }
      $i = 0
      foreach ($line in [System.IO.File]::ReadAllLines($abs)) {
        $i++
        foreach ($m in [regex]::Matches($line, $quoteRe)) {
          $s = $m.Groups['s'].Value
          if ($s.Length -lt 5) { continue }
          if ($s -match '[\p{IsCJKUnifiedIdeographs}]') { continue }
          if ($s -match '\$\{') { continue }
          $skip = $false
          foreach ($pr in $script:Protect) { if ($pr.IsMatch($s)) { $skip = $true; break } }
          if ($skip) { continue }
          if ($s -match '^(https?://|refs/|origin/|upstream/|@|\.{1,2}/|/|[a-z0-9_.+-]+@[a-z0-9_.-]+)') { continue }
          if ($s -match '^[a-z][a-z0-9]*$') { continue }
          if ($s -match '^[a-z][a-z0-9]*(_|-|\.)[a-z0-9_.-]+$') { continue }
          if ($s -match '^[A-Z0-9]{2,8}$') { continue }
          if ($s -notmatch '\s' -and $s.Length -lt 10) { continue }
          $rows.Add(($scopeName + "`t" + $rel + "`t" + $s))
        }
      }
    }
  }
  $unique = $rows | Sort-Object -Unique
  $header = '# 待译清单（由 sync-localize.ps1 自动生成；scope<TAB>文件<TAB>英文串）'
  $content = ($header + "`n" + ($unique -join "`n"))
  $pendingPath = Join-Path $DictDir 'pending.tsv'
  $writeIt = $true
  if (Test-Path -LiteralPath $pendingPath) {
    $old = [System.IO.File]::ReadAllText($pendingPath).TrimEnd("`r", "`n")
    if ($old -eq $content) { $writeIt = $false }
  }
  if ($writeIt) {
    [System.IO.File]::WriteAllText($pendingPath, $content + "`n", $script:Utf8NoBom)
    Write-Log ("待译清单已更新：{0}（{1} 条唯一串）" -f $pendingPath, $unique.Count)
  } else {
    Write-Log ("待译清单无变化：{0}（{1} 条唯一串）" -f $pendingPath, $unique.Count)
  }
  return $unique.Count
}

# ---------- 版本号 ----------
function Get-VersionValue {
  param([string]$Rel, [string]$Pattern)
  $abs = Join-Path $Repo ($Rel.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
  if (-not (Test-Path -LiteralPath $abs)) { return '' }
  $raw = [System.IO.File]::ReadAllText($abs)
  $m = [regex]::Match($raw, $Pattern)
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

function Test-VersionConsistency {
  $vRoot = Get-VersionValue 'package.json' '"version"\s*:\s*"([^"]+)"'
  $vApp = Get-VersionValue 'apps/desktop/package.json' '"version"\s*:\s*"([^"]+)"'
  $vCargo = Get-VersionValue 'apps/desktop/src-tauri/Cargo.toml' '(?m)^version\s*=\s*"([^"]+)"'
  $vTauri = Get-VersionValue 'apps/desktop/src-tauri/tauri.conf.json' '"version"\s*:\s*"([^"]+)"'
  $all = @($vRoot, $vApp, $vCargo, $vTauri)
  Write-Log ("版本号：package.json={0} apps/desktop={1} Cargo.toml={2} tauri.conf={3}" -f $vRoot, $vApp, $vCargo, $vTauri)
  $bad = @($all | Where-Object { $_ -ne $vRoot })
  if ($bad.Count -gt 0) {
    Write-Log '版本号 4 处不一致！请先统一版本（可配合 -BumpVersion），脚本中止。' 'ERROR'
    return $false
  }
  return $true
}

function Set-VersionBump {
  param([string]$NewVersion)
  if ($NewVersion -notmatch '^\d+\.\d+\.\d+$') {
    Write-Log "版本号格式非法：$NewVersion（应为 x.y.z）" 'ERROR'
    exit 5
  }
  $old = Get-VersionValue 'package.json' '"version"\s*:\s*"([^"]+)"'
  if ($old -eq $NewVersion) {
    Write-Log "版本已是 $NewVersion，无需升级"
    return
  }
  $targets = @(
    @{ Rel = 'package.json'; Pat = '("version"\s*:\s*")' + [regex]::Escape($old) + '(")' },
    @{ Rel = 'apps/desktop/package.json'; Pat = '("version"\s*:\s*")' + [regex]::Escape($old) + '(")' },
    @{ Rel = 'apps/desktop/src-tauri/Cargo.toml'; Pat = '(?m)(^version\s*=\s*")' + [regex]::Escape($old) + '(")' },
    @{ Rel = 'apps/desktop/src-tauri/tauri.conf.json'; Pat = '("version"\s*:\s*")' + [regex]::Escape($old) + '(")' }
  )
  foreach ($t in $targets) {
    $abs = Join-Path $Repo ($t.Rel.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
    $raw = [System.IO.File]::ReadAllText($abs)
    $new = [regex]::Replace($raw, $t.Pat, ('${1}' + $NewVersion + '${2}'))
    if ($new -ne $raw) {
      [System.IO.File]::WriteAllText($abs, $new, $script:Utf8NoBom)
      Write-Log ("版本升级 {0} → {1}：{2}" -f $old, $NewVersion, $t.Rel)
    }
  }
  $ok = Test-VersionConsistency
  if (-not $ok) { exit 5 }
}

# ---------- fork URL 替换 ----------
function Update-ForkUrls {
  param([string]$ForkRepo)
  $files = @(
    'apps/desktop/src-tauri/tauri.conf.json',
    'apps/desktop/src/features/updater/check.ts',
    'apps/website/src/lib/site.ts'
  )
  foreach ($rel in $files) {
    $abs = Join-Path $Repo ($rel.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $abs)) { continue }
    $raw = [System.IO.File]::ReadAllText($abs)
    $new = [regex]::Replace($raw, 'cheat2001/angkorgit|wuwuzhazha/angkorgit(?:-zh)?', $ForkRepo)
    if ($new -ne $raw) {
      [System.IO.File]::WriteAllText($abs, $new, $script:Utf8NoBom)
      Write-Log "fork URL 已替换：$rel（指向 $ForkRepo）"
    }
  }
}

# ================= 启动 =================
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if ($Help) {
  Show-Usage
  exit 0
}

$script:effectiveDryRun = -not $Push -and -not $NoDryRun

$logDir = Join-Path ([System.IO.Path]::GetTempPath()) 'angkorgit-zh-sync'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$script:LogFile = Join-Path $logDir ('sync-localize-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')

$Repo = [System.IO.Path]::GetFullPath($Repo).TrimEnd('\', '/')
if ($Repo -match '^[A-Za-z]:$') { $Repo += '\' }   # 盘符根（如 E:\）TrimEnd 后补回尾斜杠，保证 Get-Relative 偏移正确
if ($Repo -eq '') { $Repo = [System.IO.Path]::GetFullPath('.') }
if (-not $DictDir) { $DictDir = Join-Path $PSScriptRoot '..\zh-dict' }
$DictDir = [System.IO.Path]::GetFullPath($DictDir)

Write-Step ('AngKorGit 一键同步+中文化  repo={0}' -f $Repo)
Write-Log ("dry-run（不推送）= {0}   SkipSync={1}   SkipLocalize={2}   ForkRepo={3}   MergeStrategy={4}" -f $script:effectiveDryRun, $SkipSync, $SkipLocalize, $ForkRepo, $MergeStrategy)
Write-Log ("日志文件：{0}" -f $script:LogFile)

# 前置校验
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Log '未找到 git 命令，请先安装 Git 并加入 PATH。' 'ERROR'
  exit 4
}
$chk = Invoke-Git @('rev-parse', '--is-inside-work-tree')
if ($chk.Code -ne 0) {
  Write-Log "不是 git 仓库：$Repo" 'ERROR'
  exit 4
}
if ($ForkRepo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
  Write-Log "ForkRepo 格式非法：$ForkRepo（应为 owner/repo）" 'ERROR'
  exit 5
}

# 加载词库配置
if (-not (Test-Path -LiteralPath (Join-Path $DictDir 'dict.tsv'))) {
  Write-Log "词库不存在：$(Join-Path $DictDir 'dict.tsv')（可用 -DictDir 指定）" 'ERROR'
  exit 5
}
$script:Protect = @()
foreach ($pl in [System.IO.File]::ReadAllLines((Join-Path $DictDir 'protect.txt'))) {
  if ($pl -match '^\s*#') { continue }
  if ($pl.Trim() -eq '') { continue }
  try { $script:Protect += , [regex]::new($pl) } catch { Write-Log "protect.txt 正则非法：$pl" 'ERROR'; exit 5 }
}
$script:SkipRegexes = @()
foreach ($sl in [System.IO.File]::ReadAllLines((Join-Path $DictDir 'skip-files.txt'))) {
  if ($sl -match '^\s*#') { continue }
  if ($sl.Trim() -eq '') { continue }
  $script:SkipRegexes += , [regex]::new((ConvertTo-GlobRegex $sl))
}
$dictEntries = @()
$dictLineNo = 0
foreach ($dl in [System.IO.File]::ReadAllLines((Join-Path $DictDir 'dict.tsv'))) {
  $dictLineNo++
  if ($dl -match '^\s*#') { continue }
  $f = $dl -split "`t"
  if ($f.Count -lt 3) { continue }
  $scopes = @($f[0] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
  $src = $f[1]
  $tgt = $f[2]
  $anchor = if ($f.Count -gt 3) { $f[3] } else { '' }
  $mode = if ($f.Count -gt 4) { $f[4] } else { '' }
  if ($mode -ne '' -and $mode -ne 'whole') {
    Write-Log "dict.tsv 第 $dictLineNo 行 mode 非法（仅支持 whole）：$mode" 'ERROR'
    exit 5
  }
  if ($anchor -ne '') {
    try { $null = [regex]::new($anchor) } catch {
      Write-Log "dict.tsv 第 $dictLineNo 行 anchor 正则非法：$anchor" 'ERROR'
      exit 5
    }
  }
  if ($src -eq '' -or $tgt -eq '') { continue }
  if ($src -notmatch '\s' -and $anchor -eq '' -and $mode -ne 'whole') {
    Write-Log "词条缺少 anchor（单单词必须带上下文锚或 whole 模式）：$src" 'ERROR'
    exit 5
  }
  $dictEntries += [pscustomobject]@{ Scopes = $scopes; Source = $src; Target = $tgt; Anchor = $anchor; Mode = $mode }
}
$dictEntries = @($dictEntries | Sort-Object { $_.Source.Length } -Descending)
Write-Log ("词库已加载：{0} 条 / 保护 {1} 条 / 跳过 {2} 条" -f $dictEntries.Count, $script:Protect.Count, $script:SkipRegexes.Count)

# ============ 阶段 ① 同步 ============
if (-not $SkipSync) {
  Write-Step '阶段 ① 同步上游'
  $st = Invoke-Git @('status', '--porcelain')
  if ($st.Code -ne 0) { Write-Log 'git status 失败' 'ERROR'; exit 1 }
  if ($st.Output.Trim() -ne '') {
    Write-Log '工作区不干净（有未提交/未跟踪改动）。请先提交或清理；脚本中止。' 'ERROR'
    Write-Log ($st.Output -split "`n" | Select-Object -First 20 | ForEach-Object { "  $_" })
    exit 3
  }
  $cur = (Invoke-Git @('branch', '--show-current')).Output.Trim()
  if ($cur -ne $Branch) {
    Write-Log "当前分支 $cur ≠ $Branch，尝试检出 $Branch …"
    $co = Invoke-Git @('checkout', $Branch)
    if ($co.Code -ne 0) {
      Write-Log "检出分支 $Branch 失败：$($co.Output)" 'ERROR'
      exit 7
    }
  }
  $remotes = (Invoke-Git @('remote')).Output
  if ($remotes -notmatch '(?m)^' + [regex]::Escape($UpstreamRemote) + '$') {
    Write-Log "添加 upstream remote → $UpstreamUrl"
    $ra = Invoke-Git @('remote', 'add', $UpstreamRemote, $UpstreamUrl)
    if ($ra.Code -ne 0) { Write-Log "添加 upstream 失败：$($ra.Output)" 'ERROR'; exit 1 }
  } else {
    $url = (Invoke-Git @('remote', 'get-url', $UpstreamRemote)).Output.Trim()
    if ($url -ne $UpstreamUrl) { Write-Log "注意：upstream URL 为 $url（参数为 $UpstreamUrl），保留现有配置。" 'WARN' }
  }
  Write-Log "git fetch $UpstreamRemote $UpstreamBranch …"
  $ft = Invoke-Git @('fetch', $UpstreamRemote, $UpstreamBranch)
  if ($ft.Code -ne 0) { Write-Log "fetch 失败：$($ft.Output)" 'ERROR'; exit 1 }
  $mergeRef = "$UpstreamRemote/$UpstreamBranch"
  $mergeArgs = @()
  switch ($MergeStrategy) {
    'ff-only' { $mergeArgs = @('merge', '--ff-only', $mergeRef) }
    'rebase'  { $mergeArgs = @('rebase', $mergeRef) }
    'ours'    { $mergeArgs = @('merge', '-X', 'ours', '--no-edit', $mergeRef) }
    default   { $mergeArgs = @('merge', '--no-edit', $mergeRef) }
  }
  Write-Log "git $($mergeArgs -join ' ')"
  $mt = Invoke-Git $mergeArgs
  $unmerged = (Invoke-Git @('ls-files', '-u')).Output.Trim()
  if ($unmerged -ne '') {
    Write-Log '合并产生冲突，脚本按契约中止（不自动解决）。冲突文件：' 'ERROR'
    $confFiles = @(Invoke-Git @('diff', '--name-only', '--diff-filter=U')).Output -split "`n" | Where-Object { $_ -ne '' }
    foreach ($c in $confFiles) { Write-Log "  冲突: $c" 'ERROR' }
    if ($MergeStrategy -eq 'rebase') {
      Write-Log 'rebase 冲突：已自动回滚（git rebase --abort）。请手工解决后重试，或改用 -MergeStrategy merge/ours。' 'ERROR'
      Invoke-Git @('rebase', '--abort') | Out-Null
    } else {
      Write-Log '修复方式：手工解决后 git add + git commit；或放弃合并：git merge --abort。' 'ERROR'
    }
    exit 2
  }
  if ($mt.Code -ne 0 -and $mt.Output -notmatch 'Already up to date') {
    Write-Log "merge 失败：$($mt.Output)" 'ERROR'
    exit 1
  }
  Write-Log "merge 结果：$($mt.Output -split "`n" | Select-Object -First 5)"
} else {
  Write-Step '阶段 ① 同步（已跳过 -SkipSync）'
  # -SkipSync 路径同样校验工作区干净：阶段③会全量 git add，防止卷走用户未提交的杂散改动
  $st = Invoke-Git @('status', '--porcelain')
  if ($st.Code -ne 0) { Write-Log 'git status 失败' 'ERROR'; exit 1 }
  if ($st.Output.Trim() -ne '') {
    Write-Log '工作区不干净（有未提交/未跟踪改动）。-SkipSync 模式下脚本会全量 git add，请先提交或清理；脚本中止。' 'ERROR'
    Write-Log ($st.Output -split "`n" | Select-Object -First 20 | ForEach-Object { "  $_" })
    exit 3
  }
}

# ============ 阶段 ② 中文化 ============
if (-not $SkipLocalize) {
  Write-Step '阶段 ② 中文化'
# scope → 文件清单
$allFiles = @(Get-ChildItem -LiteralPath $Repo -Recurse -Force -File | Where-Object { $_.FullName -notmatch '\\\.git\\' })
$globDefs = @{
  ui      = @('apps/desktop/src/**/*.ts', 'apps/desktop/src/**/*.tsx')
  rust    = @('apps/desktop/src-tauri/src/**/*.rs', 'apps/desktop/src-tauri/tests/**/*.rs')
  core    = @('packages/core/src/**/*.ts')
  website = @('apps/website/src/**/*.ts', 'apps/website/src/**/*.tsx', 'apps/website/src/**/*.astro')
  meta    = @('apps/desktop/src-tauri/tauri.conf.json', 'package.json', 'apps/desktop/package.json', 'apps/desktop/src-tauri/Cargo.toml', 'apps/desktop/index.html')
  docs    = @('README.md', 'docs/**/*.md', 'CHANGELOG.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md')
  e2e     = @('tests/e2e/**/*.ts')
  test    = @('tests/unit/**/*.ts')
}
if ($IncludeClaudeMd) { $globDefs.docs += @('CLAUDE.md') }
$script:ScopeFiles = @{}
foreach ($k in $globDefs.Keys) {
  $list = New-Object System.Collections.ArrayList
  $regexes = @($globDefs[$k] | ForEach-Object { [regex]::new((ConvertTo-GlobRegex $_)) })
  foreach ($f in $allFiles) {
    $rel = Get-Relative $f.FullName
    foreach ($rx in $regexes) { if ($rx.IsMatch($rel)) { [void]$list.Add($rel); break } }
  }
  $script:ScopeFiles[$k] = @($list)
}


  if (-not (Test-VersionConsistency)) { exit 5 }
  if ($BumpVersion -ne '') { Set-VersionBump $BumpVersion }
  Update-ForkUrls $ForkRepo
  Write-Log '应用词库（字典式替换，标识符/URL/哈希/键名/锁文件由 protect+skip 保护）…'
  Invoke-LocalizeScopes -Entries $dictEntries
  Write-Log ("词库替换统计：替换 {0} 处 / 变更文件 {1} 个" -f $script:StatsReplacements, $script:StatsFilesChanged)
  $pendingCount = Scan-Pending
  Write-Log ("待译清单：{0} 条待译英文串（详见 zh-dict/pending.tsv）" -f $pendingCount)
  $ds = Invoke-Git @('diff', '--stat')
  Write-Log '中文化后 diff --stat：'
  foreach ($dl in ($ds.Output -split "`n" | Select-Object -First 60)) { Write-Log "  $dl" }
} else {
  Write-Step '阶段 ② 中文化（已跳过 -SkipLocalize）'
}

# ============ 阶段 ③ 提交 ============
Write-Step '阶段 ③ 提交'
$null = Invoke-Git @('add', '-A')
$ps = Invoke-Git @('status', '--porcelain')
if ($ps.Output.Trim() -eq '') {
  Write-Log '无任何改动，跳过提交（幂等 no-op）。'
} else {
  $commitMsg = 'chore(i18n): 同步上游并中文化（sync upstream + zh-CN localization）'
  $name = (Invoke-Git @('config', 'user.name')).Output.Trim()
  $email = (Invoke-Git @('config', 'user.email')).Output.Trim()
  $commitArgs = @()
  if (-not $name -or -not $email) {
    if (-not $name) { $name = if ($env:SYNC_GIT_NAME) { $env:SYNC_GIT_NAME } else { 'angkorgit-zh-sync' } }
    if (-not $email) { $email = if ($env:SYNC_GIT_EMAIL) { $env:SYNC_GIT_EMAIL } else { 'sync@angkorgit-zh.local' } }
    $script:UsedFallbackIdentity = $true
    $commitArgs = @('-c', "user.name=$name", '-c', "user.email=$email")
    Write-Log "git 身份缺失，使用回退身份 $name <$email>（可用环境变量 SYNC_GIT_NAME/SYNC_GIT_EMAIL 覆盖）" 'WARN'
  }
  $ct = Invoke-Git @($commitArgs + @('commit', '-m', $commitMsg))
  if ($ct.Code -ne 0) {
    Write-Log "提交失败：$($ct.Output)" 'ERROR'
    exit 1
  }
  $sha = (Invoke-Git @('rev-parse', '--short', 'HEAD')).Output.Trim()
  Write-Log "已提交：$sha  $commitMsg"
  foreach ($pl in ($ps.Output -split "`n" | Select-Object -First 40)) { Write-Log "  变更: $pl" }
}

# ============ 阶段 ④ 推送 ============
function Show-PushPlan {
  param([string]$OriginUrl)
  Write-Log "  分支：$Branch  →  $Remote ($OriginUrl)"
  $tracked = (Invoke-Git @('rev-parse', '--verify', "$Remote/$Branch")).Code -eq 0
  if ($tracked) {
    $ahead = (Invoke-Git @('rev-list', '--count', "$Remote/$Branch..HEAD")).Output.Trim()
    Write-Log "  领先远端提交数：$ahead"
    $log = Invoke-Git @('log', '--oneline', "$Remote/$Branch..HEAD")
    foreach ($ll in ($log.Output -split "`n" | Select-Object -First 20)) { Write-Log "    $ll" }
  } else {
    Write-Log "  远端分支 $Remote/$Branch 尚不存在——首次推送将上传全部提交。"
  }
}

Write-Step '阶段 ④ 推送'
$originUrl = (Invoke-Git @('remote', 'get-url', $Remote)).Output.Trim()
# 脱敏：URL 若含 ://user:pass@ 凭据段，日志只记录掩码
$originUrl = [regex]::Replace($originUrl, '://[^/@]+@', '://***@')
if ($script:effectiveDryRun) {
  Write-Log 'dry-run：不执行任何 push（无网络写操作）。推送计划：'
  Show-PushPlan -OriginUrl $originUrl
  Write-Log '  确认无误后执行：'
  Write-Log "    pwsh -NoProfile -File $PSCommandPath -Repo `"$Repo`" -Push"
} else {
  Write-Log '推送计划：'
  Show-PushPlan -OriginUrl $originUrl
  Write-Log "git push $Remote $Branch（凭据走 git 凭据助手，脚本不接触凭据）…"
  $pt = Invoke-Git @('push', $Remote, $Branch)
  if ($pt.Code -ne 0) {
    Write-Log "推送失败：$($pt.Output)" 'ERROR'
    exit 6
  }
  Write-Log "推送成功：$($pt.Output -split "`n" | Select-Object -First 10)"
}

# ============ 汇总 ============
Write-Step '完成'
Write-Log ("dry-run={0}  替换={1} 处  变更文件={2}  回退身份={3}" -f $script:effectiveDryRun, $script:StatsReplacements, $script:StatsFilesChanged, $script:UsedFallbackIdentity)
Write-Log ("日志：{0}" -f $script:LogFile)
exit 0
