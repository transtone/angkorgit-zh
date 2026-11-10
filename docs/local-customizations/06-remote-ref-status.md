# 06 远端引用状态维护清单

过期远程跟踪分支、标签远端状态以及刷新和引用悬停稳定性修复已实现。功能登记见 [FEATURES](FEATURES.md)，项目切换保护见 [04](04-project-switch-loading.md)，文案维护见 [01](01-localization.md)。

## 过期远程跟踪分支

- 使用仓库现有认证链读取远端 advertised refs，只读查询，不 Fetch、不更新本地引用。按各远端 Fetch refspec（包括排除映射）判断本地跟踪引用的源是否已不存在；跳过符号引用和远端 HEAD。
- 只有成功查询并确认缺失才新增过期标记。图与侧栏使用中性灰、CloudOff（图中虚线边框），提示包含“过期的远程跟踪分支”和完整远端前缀，如 `origin/feature/x`。本轮修复要求：开始重查不清空已有标记；超时、认证或网络失败不构成新的删除证据，也不抹掉该远端上次确认的过期分支标记。成功重查后按新证据更新。
- 图与侧栏仅对确认过期的引用提供“删除远程跟踪引用”。执行时重新查询远端；分支已恢复则跳过。随后锁定所选本地引用，再核对调用方提供的 OID；变化则拒绝。只删除这一条 `refs/remotes/...`，不删除本地分支或远端分支，不做批量 prune。

## 标签远端状态

| 状态 | 图与侧栏图标 | 含义 |
| --- | --- | --- |
| 已同步 | Cloud | 指定远端同名标签的直接 OID 一致 |
| 仅本地 | Monitor | 成功查询后，该远端无同名标签 |
| 状态未知 | 灰色 CircleHelp | 未检查、无远端或查询失败；重查期间保留上次已知状态，无历史结果才显示未知 |
| 与远端不一致 | 琥珀色 TriangleAlert | 该远端同名标签的直接 OID 不同 |

- 比较 `refs/tags/<name>` 的直接对象 OID，不比较 peeled commit/target，不用 `^{}` 广告条目替代；附注内容、tagger、时间、签名任一变化都可能改变标签对象，即使指向同一提交也应提示不一致。保留 `TagInfo.refOid`，不能只靠 `targetOid` 或消息判断标签变化。
- 每个远端独立保存结果、错误及检查时间。主图标和默认推送目的地统一调用 `pickRemote`：当前 HEAD 上游远端 → `origin` → 首个远端；不能改成无条件取第一个或把多个远端合并成一个布尔值。提示采用“标签名 · 远端：状态”的简短摘要，当前推送远端排在首位；不显示图标实现说明或检查时间。查询失败与未检查均显示“状态未知”。
- 打开仓库、相关 refs/标签/远端地址变化、Fetch 和推送后的刷新触发后台检查。与过期分支共用一次认证连接、同一份远端引用查询。本轮修复要求：开始检查只更新检查进度，不清空上次结果，刷新期间保留已有视觉状态。每个远端完成后独立应用结果，不等待其他远端；失败仅将该远端标签置为未知，不影响其他远端，也不清除该远端已有的过期分支标记。
- 保持仓库路径、请求代次及查询签名保护；每个远端独立提交结果，仅接受当前检查的结果。切换、关闭项目或启动更新请求后，旧响应不得覆盖当前状态。标签查询失败后不能继续显示已确认同步或仅本地；这与刷新进行中保留旧状态不同。
- 图与侧栏标签菜单提供“检查远端状态”和推送远端选择。对已同步的目标禁用推送；多远端逐项判断。不一致仍走普通推送，由 Git 拒绝覆盖，不默认强推。
- 所有新增状态、提示、菜单和自有错误文案必须同步登记唯一词典 `zh-dict/zh-CN.json`；上下文专用文案按文件/组件/属性定位，同时维护中文可访问名与测试选择器。

## 引用单元格与更多引用面板

- 移除引用芯片的 `hover:shrink-0`，悬停不得撑宽单元格；原芯片和 `+N` 的位置保持稳定。
- 更多引用通过独立 Portal 展示在单元格下方，间隔 4px；限制宽度和高度，超出可滚动，不使用向上滑入动画。废弃覆盖原行的负偏移堆叠，不再复制首个芯片覆盖原芯片；旧的首芯片重合、误差不超过 2px 的断言应替换为间隔和位置稳定性验证。
- 面板打开期间禁用触发区域与面板内容的原生 `title`，避免浏览器提示遮住内容；保留既有简短标签状态摘要，以及双击检出/重置、右键菜单和 Portal 事件阻止冒泡的行为。产品提示只表达引用、远端与状态，不加入 Portal、图标名称、请求序号等实现说明。

## 源码与测试锚点

按符号定位，不依赖行号；上游移动入口后更新本表。

| 路径 | 锚点与职责 |
| --- | --- |
| `apps/desktop/src-tauri/src/core/remote.rs` | `ref_status`、`advertised_refs`、`fetch_sources`、`delete_stale_ref`：一次只读查询、refspec 映射、直接 OID 比较与锁定删除 |
| `apps/desktop/src-tauri/src/core/misc.rs`、`core/types.rs`（同级） | 标签列表、`TagInfo.refOid`：保留直接标签对象与 peeled 目标的区别 |
| `apps/desktop/src-tauri/src/commands.rs`、`lib.rs` | `remote_ref_status` 及跟踪引用删除命令、注册与测试导出 |
| `apps/desktop/src/core/ipc.ts`、`packages/core/src/git/types.ts` | `remoteRefStatus`、`deleteStaleRemoteRef`、IPC/serde 类型对应 |
| `apps/desktop/src/features/repository/store.ts` | `checkStaleRemoteRefs`、`remoteSignature`、`scheduleStaleCheck`、`tagRemoteStatus`、`staleRemoteRefs`：刷新保留、各远端独立应用结果、失败处理、请求序号与项目代次保护 |
| `apps/desktop/src/features/repository/TagRemoteStatus.tsx` | `tagRemoteSummary`、`TagRemoteStatus`：默认远端、所有远端提示、图标与可访问名 |
| `apps/desktop/src/features/graph/GraphRow.tsx`、`CommitGraph.tsx`（同级） | 引用装饰、固定悬停布局、更多引用 Portal、原生提示抑制、删除/检查/推送菜单 |
| `tests/e2e/smoke.spec.ts` | 更多引用交互验证：4px 间隔、原芯片与 `+N` 位置稳定、无位移动画及原生提示遮挡；`tests/e2e/refLayout.spec.ts` 覆盖截图中的长远端引用 |
| `apps/desktop/src/features/sidebar/Sidebar.tsx` | 与提交图一致的分支与标签状态、删除及远端选择 |
| `apps/desktop/src-tauri/tests/stale_remote_refs.rs` | 只读性、refspec、远端恢复、OID 变化、直接标签对象比较 |
| `tests/unit/staleRemoteRefs.test.ts` | 多远端结果、失败未知、项目切换、标签对象变化与旧响应保护 |
| `tests/e2e/staleRemoteRefs.spec.ts`、`tagRemoteStatus.spec.ts`（同级） | 图/侧栏图标、完整提示、菜单、推送禁用及远端选择 |

## 恢复与验证

合并后先恢复 Rust 只读查询、锁定删除与直接标签 OID，再对齐命令/IPC/类型，最后接回状态生命周期、两处 UI 和词典。验证未知与不同状态时，要分别模拟网络失败和同名对象变化，不能用缺少本地跟踪引用代替远端缺失。

维护时运行以下验证命令：

```bash
rtk bun run check:dict
rtk bun run check:copy
rtk bun run typecheck
rtk bun run test -- tests/unit/staleRemoteRefs.test.ts
rtk bun run test:e2e -- tests/e2e/staleRemoteRefs.spec.ts tests/e2e/tagRemoteStatus.spec.ts tests/e2e/smoke.spec.ts
rtk cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --test stale_remote_refs
rtk cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
rtk cargo clippy --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
```

计划补充核对：已有标签状态和过期标记在重查开始时不闪回未知；一个远端缓慢或失败不阻塞另一个远端的结果；失败远端标签变为未知但保留上次确认的过期分支标记；同一远端旧响应晚到不覆盖新结果。悬停长引用与 `+N` 时检查单元格、原芯片和计数位置不变，面板下方 4px 间隔、尺寸限制与滚动可用，无向上滑入动画、重叠首芯片或原生提示遮挡，双击和右键操作仍可用。

计划人工核对：两个远端同名标签分别同步/缺失/不同、附注或签名变化而目标不变、无远端、认证失败、删除前远端分支恢复、锁定前本地 OID 变化、快速切换项目。查询前后本地 refs、工作区及配置应保持不变；删除后仅所选跟踪引用消失。
