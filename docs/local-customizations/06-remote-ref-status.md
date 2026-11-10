# 06 远端引用状态维护清单

过期远程跟踪分支与标签远端状态已实现。功能登记见 [FEATURES](FEATURES.md)，项目切换保护见 [04](04-project-switch-loading.md)，文案维护见 [01](01-localization.md)。

## 过期远程跟踪分支

- 使用仓库现有认证链读取远端 advertised refs，只读查询，不 Fetch、不更新本地引用。按各远端 Fetch refspec（包括排除映射）判断本地跟踪引用的源是否已不存在；跳过符号引用和远端 HEAD。
- 只有成功查询并确认缺失才标记过期。图与侧栏使用中性灰、CloudOff（图中虚线边框），提示包含“过期的远程跟踪分支”和完整远端前缀，如 `origin/feature/x`。超时、认证或网络失败均为未知，不据此判断删除。
- 图与侧栏仅对确认过期的引用提供“删除远程跟踪引用”。执行时重新查询远端；分支已恢复则跳过。随后锁定所选本地引用，再核对调用方提供的 OID；变化则拒绝。只删除这一条 `refs/remotes/...`，不删除本地分支或远端分支，不做批量 prune。

## 标签远端状态

| 状态 | 图与侧栏图标 | 含义 |
| --- | --- | --- |
| 已同步 | Cloud | 指定远端同名标签的直接 OID 一致 |
| 仅本地 | Monitor | 成功查询后，该远端无同名标签 |
| 状态未知 | 灰色 CircleHelp | 未检查、正在重查、无远端或查询失败 |
| 与远端不一致 | 琥珀色 TriangleAlert | 该远端同名标签的直接 OID 不同 |

- 比较 `refs/tags/<name>` 的直接对象 OID，不比较 peeled commit/target，不用 `^{}` 广告条目替代；附注内容、tagger、时间、签名任一变化都可能改变标签对象，即使指向同一提交也应提示不一致。保留 `TagInfo.refOid`，不能只靠 `targetOid` 或消息判断标签变化。
- 每个远端独立保存结果、错误及检查时间。主图标和默认推送目的地统一调用 `pickRemote`：当前 HEAD 上游远端 → `origin` → 首个远端；不能改成无条件取第一个或把多个远端合并成一个布尔值。提示列出所有远端的状态与检查时间，失败或未检查要明确显示。
- 打开仓库、相关 refs/标签/远端地址变化、Fetch 和推送后的刷新触发后台检查。与过期分支共用一次认证连接、同一份远端引用查询；保持仓库路径及请求代次保护，切换、关闭项目或新请求后丢弃旧结果。失败不能继续显示已确认同步或仅本地。
- 图与侧栏标签菜单提供“检查远端状态”和推送远端选择。对已同步的目标禁用推送；多远端逐项判断。不一致仍走普通推送，由 Git 拒绝覆盖，不默认强推。
- 所有新增状态、提示、菜单和自有错误文案必须同步登记唯一词典 `zh-dict/zh-CN.json`；上下文专用文案按文件/组件/属性定位，同时维护中文可访问名与测试选择器。

## 源码与测试锚点

按符号定位，不依赖行号；上游移动入口后更新本表。

| 路径 | 锚点与职责 |
| --- | --- |
| `apps/desktop/src-tauri/src/core/remote.rs` | `ref_status`、`advertised_refs`、`fetch_sources`、`delete_stale_ref`：一次只读查询、refspec 映射、直接 OID 比较与锁定删除 |
| `apps/desktop/src-tauri/src/core/misc.rs`、`core/types.rs`（同级） | 标签列表、`TagInfo.refOid`：保留直接标签对象与 peeled 目标的区别 |
| `apps/desktop/src-tauri/src/commands.rs`、`lib.rs` | `remote_ref_status` 及跟踪引用删除命令、注册与测试导出 |
| `apps/desktop/src/core/ipc.ts`、`packages/core/src/git/types.ts` | `remoteRefStatus`、`deleteStaleRemoteRef`、IPC/serde 类型对应 |
| `apps/desktop/src/features/repository/store.ts` | `checkStaleRemoteRefs`、`remoteSignature`、`scheduleStaleCheck`、`tagRemoteStatus`、`staleRemoteRefs`：失效、检查时间、缓存与竞态保护 |
| `apps/desktop/src/features/repository/TagRemoteStatus.tsx` | `tagRemoteSummary`、`TagRemoteStatus`：默认远端、所有远端提示、图标与可访问名 |
| `apps/desktop/src/features/graph/GraphRow.tsx`、`CommitGraph.tsx`（同级） | 引用装饰、完整名称提示、删除/检查/推送菜单 |
| `apps/desktop/src/features/sidebar/Sidebar.tsx` | 与提交图一致的分支与标签状态、删除及远端选择 |
| `apps/desktop/src-tauri/tests/stale_remote_refs.rs` | 只读性、refspec、远端恢复、OID 变化、直接标签对象比较 |
| `tests/unit/staleRemoteRefs.test.ts` | 多远端结果、失败未知、项目切换、标签对象变化与旧响应保护 |
| `tests/e2e/staleRemoteRefs.spec.ts`、`tagRemoteStatus.spec.ts`（同级） | 图/侧栏图标、完整提示、菜单、推送禁用及远端选择 |

## 恢复与验证

合并后先恢复 Rust 只读查询、锁定删除与直接标签 OID，再对齐命令/IPC/类型，最后接回状态生命周期、两处 UI 和词典。验证未知与不同状态时，要分别模拟网络失败和同名对象变化，不能用缺少本地跟踪引用代替远端缺失。

以下是验证命令，不代表本轮测试已通过：

```bash
rtk bun run check:dict
rtk bun run check:copy
rtk bun run typecheck
rtk bun run test -- tests/unit/staleRemoteRefs.test.ts
rtk bun run test:e2e -- tests/e2e/staleRemoteRefs.spec.ts tests/e2e/tagRemoteStatus.spec.ts
rtk cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --test stale_remote_refs
rtk cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
rtk cargo clippy --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
```

人工核对：两个远端同名标签分别同步/缺失/不同、附注或签名变化而目标不变、无远端、认证失败、删除前远端分支恢复、锁定前本地 OID 变化、快速切换项目。查询前后本地 refs、工作区及配置应保持不变；删除后仅所选跟踪引用消失。
