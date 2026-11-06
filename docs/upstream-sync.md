# 同步原始上游

在仓库根目录执行：

```bash
bun run upstream:sync
```

脚本从 `cheat2001/angkorgit` 的 `main` 获取更新，无需经过中间的汉化 fork。首次自动配置本地 `upstream`，以后复用；不修改 `origin`。使用 Git 凭据配置，不要求安装 rtk。

执行前须位于 `main`，工作区干净（包括未跟踪文件），且没有未完成的合并、变基等 Git 操作。先提交自己的修改，或用 `git stash push -u` 暂存，并在本次合并完成后恢复。

有更新时，脚本创建 `sync/upstream-<时间>` 分支，合并并停在提交前；无更新则直接结束。最多显示最近 20 条待合并提交。不会自动翻译、选择冲突一方、提交或推送。存在冲突时退出码为 2，其他失败为 1，成功或无更新为 0。

检查合并结果：

```bash
git status
git diff --cached
git diff --check
```

若有冲突，逐个解决，保留需要的汉化并适配上游逻辑，然后 `git add <已解决文件>`。不要直接重跑同步脚本。

运行适用的测试。前端单元测试可使用 `bun run test`（调用项目已有的 Vitest）；若修改 Rust，在 `apps/desktop/src-tauri` 运行 `cargo test`。核对上游新增文案及翻译键。

确认后执行 `git commit`，按正常流程将同步分支合入自己的 `main`（可推送同步分支并创建指向自己仓库 main 的 PR）。**保留合并提交，不要 squash/rebase 同步分支**，否则上游提交的祖先关系丢失，下次同步会重复处理历史。下一次同步从已整合的 `main` 开始。

合并提交之前可以放弃：

```bash
git merge --abort
```

这会保留同步分支，随后可切回 `main`。脚本本身无需提交权限，也不会推送到原始上游。
