# 上游合并与本地 patch 执行流程

范围：同步上游到 fork、恢复定制、验证、交付。唯一清单：[FEATURES](FEATURES.md)；判断原则：[GUIDANCE](GUIDANCE.md)；风控政策：[05-risk-control](05-risk-control.md)。

本文件是现阶段可执行流程，不表示已提供统一自动 patch 脚本。命令在仓库根目录执行；`rtk` 为本机包装器，其他环境可去掉。

## 阶段 1：建立同步基线

1. 检查 `git status` 和当前分支，确认没有另一个未完成的 merge/rebase。已有合并进行中则接着阶段 2，不能重新 merge 或覆盖工作区。
2. 工作区干净后记录 fork 基线 SHA、上次已审查上游 SHA 和本次目标 SHA。用户自己的未提交修改先由用户提交或暂存，不用重置/清理命令处理。
3. 在同步分支 fetch 上游，先阅读上游提交和文件差异。已存在 `upstream` 时沿用；不存在时按仓库约定添加原始上游地址，不修改 `origin`。

```bash
rtk git status --short
rtk git rev-parse HEAD
rtk git remote -v
rtk git fetch upstream main
rtk git rev-parse upstream/main
# <同步分支名> 由本轮确定，不能覆盖现有分支。
rtk git switch -c <同步分支名>
rtk git merge --no-ff --no-commit upstream/main
```

`--no-ff --no-commit` 保证有更新时停在提交前。合并产生冲突是待处理状态；先读 `git status`，不自动选一边，不重跑同步。若已包含目标提交，仍可检查定制是否完整，但不要制造空同步提交。

## 阶段 2：解决冲突并应用本地 patch

按下面顺序处理，完成状态不是“文件里没有冲突标记”，而是“最终行为符合清单”。

| 顺序 | 工作 | 输入 | 产出 |
| --- | --- | --- | --- |
| 1 | 版本/包结构/工具链 | 上游 manifest 及 TL-*、RL-* | 一致的应用版本、Bun/workspace/锁文件、fork 发布身份；保留双方真实依赖 |
| 2 | 功能适配 | FN-*、上游新调用链 | 严格快进、缓存、请求隔离与新增上游功能共存；相应回归测试 |
| 3 | UI 适配 | UI-*、02 | 紧凑布局、国内头像、表格透明加载与上游样式改进共存 |
| 4 | 翻译 | ZH-*、01、词典 | 完整中文、新词条、错误及测试可访问名一致；保留路径/ref/技术标识符 |
| 5 | 风控分类处理 | 05 中所有 RC ID、上游变更 | A 禁用证明；B 保留证明；C 未新增或命中处理记录 |
| 6 | 发布配置和文档 | RL-*、上游功能说明 | 更新渠道/公钥保留，README 与路线图准确，清单和合并记录同步 |

翻译使用 `bun run scripts/localize.mjs --repo <源码目录>`。可选 `--dict-dir <词典目录>`、`--include-claude-md`、`--help`。脚本仅应用词典、生成待译清单，允许工作区已有修改；不执行 Git 操作，不调整版本和发布地址。脚本会修改命中的本地文件，执行后审阅相关 diff。

逐文件 `git add <已核对文件>` 标记冲突解决。对没有冲突但命中定制入口的自动合并文件也做核对。风控 C 类出现待决定项时可继续其他独立工作，但不能将整轮同步记为完成。

## 阶段 3：检查与验证

先确认所有冲突已解决，再检查已暂存与未暂存 diff，避免修复只留工作区未进入最终结果。

```bash
rtk git diff --name-only --diff-filter=U
rtk git diff --check
rtk git diff --cached --check
rtk bun install --frozen-lockfile
rtk bun run check:dict
rtk bun run check:copy
rtk bun run typecheck
rtk bun run test
rtk bun run build
rtk bun run test:e2e
```

若 manifest 或应用版本使锁文件需要更新，先执行 `bun install --lockfile-only`、检查依赖差异，再重跑冻结安装；不能在发布阶段临时生成锁文件来掩盖不一致。

涉及 Rust 时，在 `apps/desktop/src-tauri` 运行：

```bash
rtk cargo fmt --check
rtk cargo clippy --locked --all-targets -- -D warnings
rtk cargo test --locked
```

Windows 需可用的原生 Perl；不要依赖历史记录中的临时路径，也不要使用 Git Bash 的 Cygwin Perl。真实桌面验收关注仓库切换、操作安全和主题观感；浏览器 demo 无法替代真实 Git 引擎验证。

第一次失败：保留日志，定位并修复原因，先重跑相关用例。最终记录必须区分完整套件与定向用例、首次通过与重试通过、未执行与失败。不能跳过测试、增大超时或放宽断言只为过发布。启动的测试服务结束后清理，保持用户已有服务不受影响。

## 阶段 4：输出同步记录并完成合并

每轮在 [README 的记录区](README.md#合并与验证记录) 增加一条摘要，并附以下明细（短小同步可直接写入该记录；复杂同步可引用专项文档）：

```text
fork 基线：
上游审查范围：旧 SHA → 新 SHA
目标应用版本：
TL / ZH / UI / FN / RL：逐项 ID + 保留 / 已适配 / 上游等价接管 / 失败
RC-A：逐项 ID + 禁用入口与证据
RC-B：逐项 ID + 保留配置与证据
RC-C：逐项 ID + 未发现 / 新增及处理 / 待决定
检查：命令、退出码、测试范围与数量、重试/跳过/未执行说明
剩余问题：
最终同步提交：提交后补充
远程 CI / 发布：单独登记，不把本地通过写成已发布
```

审阅完成后按本轮授权执行合并提交，或将已暂存结果交给用户。保留 merge 祖先关系，不 squash/rebase 掉上游历史。推送、PR 合入、打标签和发布按用户授权执行，不因“恢复 patch”自动触发发布。

## 阶段 5：发布独立验证

从包含最终修复的代码运行中文版发布工作流，版本一致，按需先 `dry_run`。发布只验证、测试、构建和生成产物，不再改源码。已有标签指向别的提交时升级版本，不移动既有标签。检查签名、安装包和自动更新清单后，登记远程结果。

## 失败与退出

- 未知冲突或行为：保留现场与证据，定位到清单 ID；不统一取 ours/theirs。
- A 类未禁用、C 类待决定、必要检查失败/缺环境：标记未完成，说明剩余项。
- 用户决定放弃当前合并时才运行 `git merge --abort`；不能因单项测试失败自动取消用户合并。
- 同步分支或手动准备的 PR 都须完成阶段 2–4，翻译成功不能替代本地 patch 验证。
