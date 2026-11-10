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
2. 运行下述翻译命令，审阅修改和生成的待译清单，把需要翻译的新词条补进 `zh-dict/dict.tsv` 后重跑。
3. 人工适配词典无法表达的文案、测试选择器，以及 README、文档和网站中的有效上游变化。
4. 运行 `bun run check:dict`、`bun run check:copy` 和相关测试，完成审阅并检查 CI 后合并。
5. 需要发版时，先统一源码中的应用版本，再手动运行**发布中文版**工作流。

## 人工维护的中文内容

`README.md`、`docs/`、`apps/website/` 中的手写中文无法由词典完整复现。翻译范围由 `zh-dict/skip-files.txt` 等规则控制；合并时逐项保留中文内容，并迁入上游新增的有效事实，不用整目录恢复代替审阅。
代码中的词典替换仍需结合 diff、`check:copy` 和测试验证。

## 独立翻译脚本

```bash
bun run scripts/localize.mjs --repo <源码目录> [--dict-dir <词典目录>] [--include-claude-md] [--help]
```

脚本仅应用词典并生成待译清单，允许已有未提交修改。它不执行 Git 操作，不调整版本号或 fork 发布地址；合并、渠道适配和交付由人工处理。

- `--repo <目录>`：指定要翻译的源码目录。
- `--dict-dir <目录>`：指定词典目录。
- `--include-claude-md`：将 `CLAUDE.md` 纳入翻译。
- `--help`：显示命令帮助。

旧 PowerShell 翻译脚本及其测试已移除，不再使用旧参数。

## 词典 `zh-dict/dict.tsv`

> `pending.tsv` 是脚本生成的英文候选清单，写入词典目录（默认 `zh-dict/`），已加入 `.gitignore`，不提交。人工审阅候选，不能把清单为空视为翻译完整。

每行 `TAB` 分隔，字段依次为：

```
作用域<TAB>源文<TAB>译文<TAB>锚点(可选)<TAB>匹配模式(可选)
```

- **作用域**：`ui` `rust` `core` `website` `meta` `docs` `e2e` `test`，逗号分隔可多选。
- **锚点**：正则，只有当该行匹配锚点时才替换；**单单词词条必须给锚点或使用 `whole`**。
- **匹配模式**：留空 = 子串替换；`whole` = 只匹配完整的字符串字面量
  （`'…'` / `"…"` / `` `…` ``）。

### 两条硬规则

1. **最长源优先**：加载后按源文长度从长到短排序，保证完整短语先于它的前缀被替换
   （例如 `Open repository in browser` 会先于 `Open repository` 命中）。
2. **单单词必须锚定**：要么给 `锚点`，要么标 `whole`，否则脚本直接报错退出。

### 迁移到 `whole`

`whole` 用于彻底消除"短词命中更长句子前缀"的问题，例如：

```
ui	Open repository	打开仓库		whole
```

它只会替换 `'Open repository'`，不会碰 `'Open repository in browser'`。
注意 `whole` 只适用于**带引号的字面量**；JSX 文本节点（如 `>Cancel<`）仍需用子串 + 锚点。
迁移应逐条进行，并本地跑一次 `bun run check:copy` 与 `bun run test:e2e` 验证。

## 混排文案检查 `scripts/check-copy.mjs`

`bun run check:copy` 扫描 `apps/desktop/src`、`packages/core/src`、`tests/e2e`、`apps/website/src`，
只要**中文与未列入允许表的英文单词出现在同一片段**就失败（如 `打开 in browser`、`复制 public key`）。
路径、标识符、版本号（含 `. / _ - :` 的 token）自动忽略。

允许表在 `scripts/copy-allowlist.json`：`phrases` 放多词专有名词，`words` 放单词技术术语/品牌。
**只允许真正的专有名词或技术术语**，不要用它掩盖半翻译。

## 词典检查 `scripts/check-dict.mjs`

`bun run check:dict` 静态校验 `dict.tsv`：

- 字段数、作用域、匹配模式是否合法；
- 锚点是否为合法正则；
- **单单词是否缺少锚点或 `whole` 模式**（翻译脚本也会校验）；
- 重复词条、译文与源文相同、以及**前缀重叠**提示（不阻塞，已按最长源优先处理）。

本地维护时运行该检查，CI 也会执行。

## 历史背景：为什么不自动发布

历史上的旧流水线“合并上游 → 自动汉化 → 推 main → 直接发布”有三个结构性问题：

- 子串词典会切坏文案（`Open repository in browser` → `打开仓库 in browser`）；
- 发布前不跑任何测试，坏文案随安装包发出去；
- 自动推 main 会触发 CI 变红，发布却已完成。

当前由人工合并、适配和审阅，Bun 脚本负责词典替换与待译扫描，CI 和发布工作流负责各自检查；发布单独手动触发。
