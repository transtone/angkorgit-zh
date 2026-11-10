# merge-batches.ps1 — 历史固定批次合并器已停用。
# 批次 TSV 仅供人工参考；zh-dict/zh-CN.json 是唯一词库。
# 保留旧入口与 -Repo 参数，让历史调用明确失败，避免误改词库。
param([string]$Repo = '')
$ErrorActionPreference = 'Stop'
throw @'
merge-batches.ps1 已停用：拒绝执行旧 dict.tsv 合并或修改。
请人工维护 zh-dict/zh-CN.json（唯一词库），历史 batches/**/batch.tsv 仅供参考。
保留现有词条 ID、scopes、locations、anchor、mode 和 previousTargets；
同一英文在不同上下文可有不同译文，请勿按 source 去重、覆盖译文或自动扩展上下文。
新增词条请使用独立 ID，并明确适用上下文，再运行 bun run check:dict 和 bun run test:localize。
'@
