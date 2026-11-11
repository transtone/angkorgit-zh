# 03 快进功能调整维护清单

状态：已有实现。历史定位提交 `1244779`；当前源码已包含后续合并结果，恢复时以行为为准。整体入口见 [README](README.md)。

整体交互与回归范围统一见 [07 分支与标签交互优化](07-branch-tag-interactions.md)，本文件维护严格快进的引擎与菜单约束。

## 必须保留的语义

“将目标分支快进到来源分支”始终调用独立的严格快进命令，不以普通 merge、reset、强制移动或 checkout 来源分支替代。

1. 目标只能是本地分支；来源只能是本地分支或远端跟踪分支。不能把同名标签误认为分支。
2. 目标严格落后来源时才显示可执行入口；同一分支、同一 tip、目标领先、双方分叉均不显示可用快进入口。
3. 后端独立验证祖先关系，不能信任菜单打开时的判断。相同 tip 返回 `up_to_date`，不产生写入。
4. 目标为当前分支时安全更新工作树，保留不受影响的本地修改；会覆盖本地更改时拒绝。
5. 目标不是当前分支时只更新目标 ref，HEAD 和当前工作树不切换、不改写。
6. 拒绝修改其他工作树正在检出的目标分支。
7. ref 更新保留旧目标 OID 比较，拒绝覆盖检查后由其他进程移动的目标。
8. 成功后刷新分支、提交图、文件状态；失败不能提示成功或留下虚假的图状态。
9. 保留命令层现有子模块同步包装，避免只恢复底层分支移动而漏掉外围行为。

## 前端入口

侧栏分支右键与提交图 ref 右键行为一致：

- “将当前分支快进到所选分支”：本地和远端来源均使用明确 ref，避免同名歧义。
- “将所选本地分支快进到当前分支”：允许更新非当前本地分支，不能将远端 ref 作为目标。
- 打开菜单后异步检查两个方向，只展示可执行的方向；旧菜单的异步结果不得落到新菜单上。
- 拖拽操作弹窗中已有的快进入口也要保留同样语义。

## 文件与调用链

| 文件 | 关键入口 / 职责 |
| --- | --- |
| `apps/desktop/src/features/sidebar/Sidebar.tsx` | 双向可行性检查、菜单可见性、拖拽入口、成功刷新 |
| `apps/desktop/src/features/graph/CommitGraph.tsx` | ref 菜单双向检查及调用 |
| `apps/desktop/src/features/repository/RepoDialogs.tsx` | 拖拽/分支操作的快进处理 |
| `apps/desktop/src/core/ipc.ts` | `fastForward(path, target, source)` → `branch_fast_forward`；`mergeCanFastForward` 预检查 |
| `apps/desktop/src/core/demo.ts` | 演示模式的分支关系及可行性数据 |
| `apps/desktop/src-tauri/src/commands.rs` | `branch_fast_forward`，阻塞调度及 `submodule::synced` 包装 |
| `apps/desktop/src-tauri/src/lib.rs` | Tauri 命令注册、测试 API 导出 |
| `apps/desktop/src-tauri/src/core/branch.rs` | `can_fast_forward`、`fast_forward`、ref 解析和安全写入 |
| `apps/desktop/src-tauri/tests/git_engine.rs` | `strict_fast_forward_*` 与祖先关系测试 |
| `tests/e2e/smoke.spec.ts` | 两类菜单、两个方向、不可用入口隐藏、IPC 参数 |

## 合并后的恢复顺序

1. 检查上游是否已有等价严格命令。保留单一实现；不可因为同名“快进”存在就认为语义等价。
2. 核对 Rust 的目标/来源类型、祖先关系、工作树占用、安全 checkout 和旧 OID 匹配。
3. 核对命令注册、测试导出、IPC 参数和子模块包装。
4. 核对侧栏、提交图、操作弹窗所有调用，不让某处仍走普通 merge。
5. 同步演示数据、中文文案、端到端断言；前端隐藏不可用入口，后端仍拒绝非法请求。
6. 实施项目缓存后，成功写入必须刷新/失效对应仓库快照。跨标签请求应绑定发起时的仓库、目标和来源，不能在完成时读取新标签替代。

## 上游 0.27.0 适配记录

- `lib.rs` 同时保留本地 `branch_fast_forward` 测试导出/命令注册，与上游新增 `compare_files`、`compare_file_diff_with` 共存。
- `commands.rs` 中严格快进仍通过 `submodule::synced` 执行，侧栏及提交图仍走独立 `ipc.fastForward`；未退回普通 merge。
- 上游 `rebase_continue` 的暂停步骤重新应用修复保留；新增错误文案及测试断言同步汉化，未改变提交重放算法。
- 原有七项 `strict_fast_forward_*` 测试及双向菜单用例继续作为验收依据，实际结果见总入口。

## 验证

在 `apps/desktop/src-tauri` 目录执行：

```bash
rtk cargo test --test git_engine strict_fast_forward
rtk cargo test --test git_engine can_fast_forward_only_when_target_is_strictly_behind
```

涉及 Rust 实现变化时，交付前增加：

```bash
rtk cargo fmt --check
rtk cargo clippy --all-targets -- -D warnings
rtk cargo test
```

前端从根目录执行：

```bash
rtk bun run test:e2e -- --grep 'fast-forward'
```

现有关键测试覆盖：严格当前分支快进、非当前分支只移动 ref、领先/分叉拒绝、相同 tip 无操作、工作树占用、安全 checkout、非法来源/目标。e2e 覆盖两个方向与不可用菜单隐藏。合并后如果测试改名，按行为找到新用例，不以“过滤后 0 个测试”作为通过。

真实桌面使用临时仓库检查：本地和远端来源、同名分支/标签、非当前分支、无关脏文件、会覆盖的脏文件、占用工作树。切换标签后的快进还需与 04 专项一起验证。所有验证都应使用临时仓库，不能在用户业务仓库里试写操作。
