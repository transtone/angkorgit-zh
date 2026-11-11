# 06 远端引用状态维护清单

过期远程跟踪分支、标签远端状态以及刷新和引用悬停稳定性修复已实现。功能登记见 [FEATURES](FEATURES.md)，项目切换保护见 [04](04-project-switch-loading.md)，文案维护见 [01](01-localization.md)。

整体交互与回归范围统一见 [07 分支与标签交互优化](07-branch-tag-interactions.md)，本文件维护远端状态、刷新生命周期与引用浮层的实现约束。

## 过期远程跟踪分支

- 使用仓库现有认证链读取远端 advertised refs，只读查询，不 Fetch、不更新本地引用。按各远端 Fetch refspec（包括排除映射）判断本地跟踪引用的源是否已不存在；跳过符号引用和远端 HEAD。
- 只有成功查询并确认缺失才新增过期标记。图与侧栏使用中性灰、CloudOff（图中虚线边框），提示包含“过期的远程跟踪分支”和完整远端前缀，如 `origin/feature/x`。本轮修复要求：开始重查不清空已有标记；超时、认证或网络失败不构成新的删除证据，也不抹掉该远端上次确认的过期分支标记。成功重查后按新证据更新。
- 图与侧栏仅对确认过期的引用提供“删除远程跟踪引用”。执行时重新查询远端；分支已恢复则跳过。随后锁定所选本地引用，再核对调用方提供的 OID；变化则拒绝。只删除这一条 `refs/remotes/...`，不删除本地分支或远端分支，不做批量 prune。

## 标签远端状态

| 状态 | 图与侧栏图标 | 含义 |
| --- | --- | --- |
| 已同步 | Cloud | 指定远端同名标签的直接 OID 一致 |
| 仅本地 | 不显示 | 成功查询后，该远端无同名标签 |
| 状态未知 | 不显示 | 未检查、无远端或查询失败；重查期间保留上次已知状态，无历史结果才显示未知 |
| 与远端不一致 | 不显示 | 该远端同名标签的直接 OID 不同 |

- 比较 `refs/tags/<name>` 的直接对象 OID，不比较 peeled commit/target，不用 `^{}` 广告条目替代；附注内容、tagger、时间、签名任一变化都可能改变标签对象，即使指向同一提交也应提示不一致。保留 `TagInfo.refOid`，不能只靠 `targetOid` 或消息判断标签变化。
- 每个远端独立保存结果、错误及检查时间。tag 仅在确认与所在入口实际推送目标同步时显示云图标，其他状态不附加图标。侧栏目标为 `remotes[0]?.name ?? 'origin'`，图表目标为 `pickRemote(remotes, HEAD 跟踪分支) ?? 'origin'`，分别沿用上游规则。提示采用“标签名 · 远端：状态”的简短摘要，保留所有远端的只读状态，并将该入口选中的远端排在首位；不显示图标实现说明或检查时间。查询失败与未检查均显示“状态未知”。
- 打开仓库、相关 refs/标签/远端地址变化、Fetch 和推送后的刷新触发后台检查。与过期分支共用一次认证连接、同一份远端引用查询。本轮修复要求：开始检查只更新检查进度，不清空上次结果，刷新期间保留已有视觉状态。每个远端完成后独立应用结果，不等待其他远端；失败仅将该远端标签置为未知，不影响其他远端，也不清除该远端已有的过期分支标记。
- 保持仓库路径、请求代次及查询签名保护；每个远端独立提交结果，仅接受当前检查的结果。切换、关闭项目或启动更新请求后，旧响应不得覆盖当前状态。标签查询失败后不能继续显示已确认同步或仅本地；这与刷新进行中保留旧状态不同。
- 恢复上游 `7afb6b6` 的标签处理与菜单，图与侧栏均保留单个直接操作“推送到远端”；该基线已包含图表标签推送入口。远端状态增强仅叠加显示，不增加手动“检查远端状态”菜单项，不按同步状态禁用推送，也不增加同名对象不一致警告菜单。
- 工具栏“推送（含标签）”沿用上游选中的默认远端及处理逻辑，不覆盖远端选择。
- 所有新增状态、提示、菜单和自有错误文案必须同步登记唯一词典 `zh-dict/zh-CN.json`；上下文专用文案按文件/组件/属性定位，同时维护中文可访问名与测试选择器。

## 引用单元格与更多引用面板

- 移除引用芯片的 `hover:shrink-0`，悬停不得撑宽单元格；原芯片和 `+N` 的位置保持稳定。
- 更多引用通过独立 Portal 覆盖原标签；测量原首个标签相对单元格的实际位置，保证首项左上角对齐，不使用固定偏移猜测。浮层使用不透明的主题底色，遮住下方标签和图线；无边框、阴影、内边距及位移动画；显示时隐藏底层标签但保留布局，避免重叠加深颜色或挤动 `+N`。限制宽度和高度，超出可滚动。
- 从面板中的引用打开右键菜单时，将面板保持打开；鼠标移入右键菜单不得触发面板延迟关闭。右键菜单关闭或完成操作后释放面板，不影响普通悬停离开时关闭。
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
| `apps/desktop/src/features/repository/TagRemoteStatus.tsx` | `tagRemoteSummary`、`TagRemoteStatus`：按入口实际推送目标显示同步云图标，所有远端只读提示（选中远端优先）与可访问名 |
| `apps/desktop/src/features/graph/GraphRow.tsx`、`CommitGraph.tsx`（同级） | 引用装饰、固定悬停布局、更多引用 Portal、原生提示抑制、删除菜单及上游标签推送入口 |
| `tests/e2e/smoke.spec.ts` | 更多引用交互验证：首项左上对齐、原布局与 `+N` 位置稳定、不透明背景、无位移动画及原生提示遮挡；`tests/e2e/refLayout.spec.ts` 覆盖截图中的长远端引用 |
| `apps/desktop/src/features/sidebar/Sidebar.tsx` | 分支与标签状态、删除及上游标签直推首个远端（无远端时回退名称 `origin`） |
| `apps/desktop/src/components/Toolbar.tsx` | “推送（含标签）”沿用上游选中的默认远端与处理逻辑 |
| `apps/desktop/src-tauri/tests/stale_remote_refs.rs` | 只读性、refspec、远端恢复、OID 变化、直接标签对象比较 |
| `tests/unit/staleRemoteRefs.test.ts` | 多远端结果、失败未知、项目切换、标签对象变化与旧响应保护 |
| `tests/e2e/staleRemoteRefs.spec.ts`、`tagRemoteStatus.spec.ts`（同级） | 图/侧栏状态图标、完整提示与过期引用删除 |
| `tests/e2e/tagPushUpstream.spec.ts` | 本轮回归入口：核对上游图/侧栏直接推送、各入口远端选择、工具栏默认远端及无额外检查菜单；结果由实际验证记录 |

## 恢复与验证

合并后先恢复 Rust 只读查询、锁定删除与直接标签 OID，再对齐命令/IPC/类型，最后接回状态生命周期、两处 UI 和词典。验证未知与不同状态时，要分别模拟网络失败和同名对象变化，不能用缺少本地跟踪引用代替远端缺失。

维护时运行以下验证命令：

```bash
rtk bun run check:dict
rtk bun run check:copy
rtk bun run typecheck
rtk bun run test -- tests/unit/staleRemoteRefs.test.ts
rtk bun run test:e2e -- tests/e2e/staleRemoteRefs.spec.ts tests/e2e/tagRemoteStatus.spec.ts tests/e2e/tagPushUpstream.spec.ts tests/e2e/smoke.spec.ts
rtk cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --test stale_remote_refs
rtk cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
rtk cargo clippy --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
```

计划补充核对：已有标签状态和过期标记在重查开始时不闪回未知；一个远端缓慢或失败不阻塞另一个远端的结果；失败远端标签变为未知但保留上次确认的过期分支标记；同一远端旧响应晚到不覆盖新结果。悬停长引用与 `+N` 时检查单元格、原芯片和计数位置不变，首项左上对齐、不透明背景、尺寸限制与滚动可用，无位移动画或原生提示遮挡，双击和右键操作仍可用。

计划人工核对：两个远端同名标签分别同步/缺失/不同、HEAD 上游与首个远端不同时图表和侧栏分别沿用各自上游推送目标、仅有非 `origin` 远端时仍沿用上游选择、工具栏含标签推送使用原有默认远端、云图标与各入口实际目标同步状态一致、提示列出所有远端且选中远端优先、标签菜单仅有单个直接推送入口且不附加手动检查/同步禁用/不一致警告、附注或签名变化而目标不变、无远端时上游回退行为、认证失败、删除前远端分支恢复、锁定前本地 OID 变化、快速切换项目。查询前后本地 refs、工作区及配置应保持不变；删除后仅所选跟踪引用消失。本清单列出待验证要求，不代表本轮测试已通过。
