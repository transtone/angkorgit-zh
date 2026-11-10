# 中文化与上游同步

本仓库是 [cheat2001/angkorgit](https://github.com/cheat2001/angkorgit) 的简体中文分支。
本地化与上游同步分开执行：人工合并上游并恢复本地 patch → 运行翻译脚本 → 审阅并验证 → 按需手动发布。

## 当前入口

- [FEATURES.md](local-customizations/FEATURES.md)：已确认的指导方针、功能清单及合并增强流程。
- `scripts/localize.mjs`：由 Bun 执行，仅应用词典并扫描待译候选。
- `ci.yml`：保留文案、词典、类型、单元测试、Playwright 和 Rust 检查。
- 网站与发布工作流继续保留；`release-zh.yml` 由人工触发，测试后构建 Windows 安装包、签名、生成 `latest.json` 并发布 Release。版本须已在源码中，`dry_run` 用于发布前检查。

原有 `upstream-watch.yml` 和 `localize.yml` 已移除。自动检测上游、创建通知 Issue、邮件通知和自动准备 PR 的流程不再存在；无需为此配置 SMTP secrets，也没有自动上传的 pending-strings 产物。

## 人工流程

1. 手动查看上游提交和差异，按 [FEATURES.md 的合并流程](local-customizations/FEATURES.md#三合并与增强流程) 合并并恢复本地定制。
2. 运行下述翻译命令，审阅修改和生成的待译清单，把需要翻译的新词条补进唯一权威词典 `zh-dict/zh-CN.json` 后重跑。文案调整须同时修改 JSON 与对应源码。
3. 人工适配词典无法表达的文案、测试选择器，以及 README、文档和网站中的有效上游变化。
4. 运行 `bun run check:dict`、`bun run check:copy` 和相关测试，完成审阅并检查 CI 后合并。
5. 需要发版时，先统一源码中的应用版本，再手动运行**发布中文版**工作流。

## 人工维护的中文内容

`README.md`、`docs/`、`apps/website/` 中的手写中文无法由词典完整复现。翻译范围由 `zh-dict/skip-files.txt` 等规则控制；合并时逐项保留中文内容，并迁入上游新增的有效事实，不用整目录恢复代替审阅。
代码中的词典替换仍需结合 diff、`check:copy` 和测试验证。

## 独立翻译脚本

```bash
bun run localize --repo <源码目录> [--dict-dir <词典目录>] [--include-claude-md] [--help]
```

脚本仅应用词典并生成待译清单，允许已有未提交修改。它不执行 Git 操作，不调整版本号或 fork 发布地址；合并、渠道适配和交付由人工处理。

- `--repo <目录>`：指定要翻译的源码目录。
- `--dict-dir <目录>`：指定词典目录。
- `--include-claude-md`：将 `CLAUDE.md` 纳入翻译。
- `--help`：显示命令帮助。

旧 PowerShell 翻译脚本及其测试已移除，不再使用旧参数。

## 唯一权威词典 `zh-dict/zh-CN.json`

翻译在维护时直接应用到源码，不引入运行时 i18n。`zh-CN.json` 是以稳定语义 ID 为键的 JSON 对象；英文 `source`、中文 `target` 与可选 `locations` 放在同一条目、同一个文件中，不另设英文词典或位置清单。

```json
{
  "repository.open": {
    "source": "Open repository",
    "target": "打开仓库",
    "scopes": ["ui"],
    "mode": "whole"
  },
  "commitDetails.changeFilter.all.tooltip": {
    "source": "Show all files",
    "target": "显示全部变更",
    "locations": [
      {
        "file": "apps/desktop/src/features/inspector/CommitDetails.tsx",
        "component": "ChangeFilter",
        "attribute": "title"
      }
    ],
    "previousTargets": ["显示全部文件"]
  }
}
```

每个条目的字段约定：

| 字段 | 类型与含义 |
| --- | --- |
| `source` | 必填字符串，原始英文文案 |
| `target` | 必填字符串，当前中文文案 |
| `scopes` | 可选字符串数组：`ui`、`rust`、`core`、`website`、`meta`、`docs`、`e2e`、`test` |
| `anchor` | 可选正则表达式字符串，限制传统文本替换的上下文；JSON 中的反斜杠须转义 |
| `mode` | 可选，仅允许 `"whole"`；省略时保留传统子串匹配 |
| `locations` | 可选位置对象数组；每项必填 `file`，可选 `component`、`attribute`，均为字符串 |
| `previousTargets` | 可选字符串数组，仅列出已确认需要纠正的旧译文 |

每条规则必须提供 `scopes` 或 `locations`。带 `locations` 的规则仅按指定位置应用，位置外的同文内容仍由通用规则处理。

### 传统规则与稳定 ID

原 TSV 条目迁入 JSON 时，使用稳定生成的键，保留原有作用域、锚点与匹配模式，分别对应 `scopes`、`anchor`、`mode`；不再并行维护 TSV 词典。新增条目使用描述用途的稳定语义 ID，调整文案时保留 ID。

传统规则继续最长源优先，避免 `Open repository` 抢先切坏 `Open repository in browser`。不带位置的单单词规则须有 `anchor` 或 `mode: "whole"`。`whole` 只匹配完整的带引号字符串字面量（单引号、双引号或反引号），不匹配更长短语；JSX 文本节点需合适的上下文规则或明确位置。

### 上下文文案与漂移处理

同一句英文在不同界面有不同含义时，使用 `locations` 精确限定文件、组件和 JSX 属性，不按行号定位。每个位置必须唯一匹配；找不到或匹配多处时交由人工审阅，不能猜测替换。位置限定的条目仅在该上下文生效，不能扩散成全局替换。

例如，`ChangeFilter` 的 `title` 中 `Show all files` 应为“显示全部变更”；其他全局 `Show all files` 仍为“显示全部文件”。上例的 `previousTargets` 允许在这个已定位上下文纠正已知旧译“显示全部文件”。未知的新英文或中文说明发生漂移，须人工核对，不能因为位置相同就盲目覆盖。

修改文案时，同时更新 `zh-CN.json` 的 `source` / `target` 和对应源码；需要纠正已部署旧译时，仅将确认过的旧译加入 `previousTargets`。调整位置时核对当前组件与属性，并通过重新应用翻译及相关测试确认匹配唯一、重复运行稳定。

### 生成的待译报告

`pending.tsv` 是写入词典目录（默认 `zh-dict/`）的生成报告，已被 Git 忽略，不提交，也不是翻译来源。除英文候选外，还记录文案漂移、位置未解析和位置歧义等待审阅项。人工核对后修改 JSON 与源码，不直接维护报告；清单为空或条目数量下降都不能证明翻译完整。

## 混排文案检查 `scripts/check-copy.mjs`

`bun run check:copy` 扫描 `apps/desktop/src`、`packages/core/src`、`tests/e2e`、`apps/website/src`，
只要**中文与未列入允许表的英文单词出现在同一片段**就失败（如 `打开 in browser`、`复制 public key`）。
路径、标识符、版本号（含 `. / _ - :` 的 token）自动忽略。

允许表在 `scripts/copy-allowlist.json`：`phrases` 放多词专有名词，`words` 放单词技术术语/品牌。
**只允许真正的专有名词或技术术语**，不要用它掩盖半翻译。

## 词典检查 `scripts/check-dict.mjs`

`bun run check:dict` 静态校验唯一权威词典 `zh-CN.json`：

- 顶层对象、稳定 ID 和条目字段的 schema，包括必填 `source` / `target`、作用域及 `mode`；
- `anchor` 是否为合法正则；传统单单词规则是否有锚点或 `whole`；
- `locations` 的文件、组件、属性结构是否合法；
- 重复键、重复规则或位置，以及作用范围或位置重叠；
- 译文与源文相同及传统前缀重叠等问题。

检查器也会验证当前源码位置是否唯一、文案是否仍为原文、确认译文或已知旧译；应用翻译后仍须审阅 `pending.tsv` 中的漂移、未解析及歧义项。

本地维护时运行该检查，CI 也会执行。

## 历史背景：为什么不自动发布

历史上的旧流水线“合并上游 → 自动汉化 → 推 main → 直接发布”有三个结构性问题：

- 子串词典会切坏文案（`Open repository in browser` → `打开仓库 in browser`）；
- 发布前不跑任何测试，坏文案随安装包发出去；
- 自动推 main 会触发 CI 变红，发布却已完成。

当前由人工合并、适配和审阅，Bun 脚本负责词典替换与待译扫描，CI 和发布工作流负责各自检查；发布单独手动触发。
