---
title: CLI 参考
status: active
---

# CLI 参考

本页记录 `ome` 的公开命令表面。CLI 刻意保持克制：设置、召回、复盘与草稿审批、经验库治理、来源扫描、诊断和卸载。

## 输出契约

默认输出面向人类，说明发生了什么、是否健康、下一步该运行什么，而不是直接 dump 内部 JSON。

当命令被脚本、hook、测试或另一个 Agent 消费时，使用 `--json`。JSON 模式下失败仍然用非零退出码结束，并输出可解析的 `{ ok: false, error: { message } }`。

`ome init` 会在交互式终端中打开设置流程。在 CI、管道或 Agent runner 中，它会跳过提示，使用 flags/defaults。想强制走向导时，使用 `ome init --interactive`。

## 常用路径

```bash
ome init
ome doctor
ome uninstall
```

## 设置

```bash
ome init
ome init --interactive
ome init --yes
ome init --provider claude
ome init --provider all
ome init --no-hook
ome init --reset-config
```

`ome init` 可以重复运行。它会安装 OME 经验库，并给每个选中的 Agent 安装提示词阶段
hook 和对应 skill。`--no-hook` 只初始化或更新经验库，不安装 hook 或 skill。
`--reset-config` 只恢复运行配置，不删除经验、来源索引或复盘 run。

## 召回

```bash
ome match "<task>"
ome match "<task>" --json
ome match "<task>" --explain
ome match "<task>" --cwd /path/to/project --explain
```

`ome match` 面向 hook、Agent、评估和排障。普通首装验收应该是一条真实 Agent 任务，
由已安装 hook 自动召回经验；用户不需要手动运行 `match`。

只有 active 卡会被召回。复盘生成的 draft 在 `ome experience enable` 之前不会影响提示词阶段召回。

当当前工作目录位于某个项目内时，召回会同时读取全局 `dataDir` 和项目根目录下可选的
`<project-root>/.oh-my-experience/`。脚本需要测试特定项目上下文时，可以传 `--cwd`。

## 来源

```bash
ome source status
ome source user-index build --provider all
ome source user-index search "browser validation" --index <file>
ome source user-index show <hit-id> --index <file> --context 4
ome source scan codex --sessions <dir>
ome source scan spool --limit 20
ome source scan spool --query "browser validation" --source codex
ome source scan spool --query "browser validation" --max-session-bytes 4194304
ome source clean
ome source clean --yes
ome source connect spool --mode ask
ome source connect spool --mode enabled
```

`ome source user-index` 是复盘用的原生证据工作台。它从 Codex 和 Claude 会话文件构建临时 user-only 索引，支持多次词面搜索，并围绕命中回放原始上下文供 Agent 判断。它不会更新长期 source index，也不会生成经验卡。

Spool 是可选能力。Spool 不可用时，Codex/Claude 原生 user-index 和本地召回仍然可用。来源扫描只写 pointer index，不复制原始完整会话。`ome source clean` 默认 dry-run，`--yes` 才真正清掉历史 summary 和 materialized 标记。

Spool 扫描遇到 `spool show --json` 输出过大的会话会跳过。优先缩小 query；如果确认这个大会话值得索引，再显式提高 `--max-session-bytes`。

## 复盘

```bash
ome reflect start
ome reflect start --scope project
ome reflect start --focus "browser validation and delivery gates"
ome reflect list
ome reflect show <run-id>
ome reflect add <run-id> --title "Browser validation" --summary "..." --rule "..."
ome reflect add <run-id> --title "仓库发版 gate" --summary "..." --rule "..." --triggers "发版验证" --scope-level project --project-key github.com/example/repo
ome reflect candidates <run-id> --from-file <file>
ome reflect candidates <run-id> --scope project --from-file <file>
ome reflect candidates <run-id> --from-file <file> --audit-file <audit.json>
ome reflect decide <run-id> <candidate-id> --action approve --category "Product UI"
ome reflect apply <run-id> --dry-run
ome reflect apply <run-id>
```

`ome reflect start --focus <text>` 只是本次分析镜头。除非用户明确限制来源集合，否则它不能缩小来源覆盖、跳过 source audit 或降低证据标准。

`ome reflect candidates` 写入候选前必须带 source audit。只有明确接受不完整审计时才使用 `--allow-incomplete-audit`；生成的经验草稿审批会显示审计不完整。

需要把复盘候选、draft 和经验草稿审批文件写入当前项目的 `.oh-my-experience/` 时，加
`--scope project`。

## 项目经验库

```bash
ome project status
ome project init
```

`ome project init` 会创建 `<project-root>/.oh-my-experience/` 和标准经验生命周期目录。
它不会修改 `dataDir`。

`ome project status --json` 会返回识别到的 `projectContext`、项目经验库路径、目录是否
存在、是否可读，以及警告信息。项目库存在时还会返回 `experiences` 和
`invalidCards`；无效 active 或 draft 项目卡会让 `ok: false`，因为项目库会参与
提示词阶段召回。

## 经验库

```bash
ome experience list
ome experience list --scope project
ome experience list --status draft
ome experience list --compact --json
ome experience show <card-id>
ome experience show <card-id> --scope project --section rule
ome experience show <card-id> --section rule
ome experience enable <card-id>
ome experience enable <card-id> --scope project
ome experience archive <card-id> --reason "superseded"
ome experience migrate-legacy --scope project --dry-run
ome experience migrate-legacy --scope project --backup
```

生命周期保持显式：`candidate -> draft -> active -> archived`。
`list --json` 默认返回完整卡片；脚本只需要标题索引时用
`--compact` 或 `--index`，只返回 `id`、`title`、`status`、`category`。

启用 draft 后，Agent 和维护者应使用真实未来任务话术做一次召回冒烟：

```bash
ome match "<真实任务话术>" --json
```

这用于确认新的 active 卡确实能被召回。它是 Agent 和维护者的调试、验收路径，
不是普通用户首装后的默认下一步。

`experience list --json` 是治理命令，所以遇到无效卡片文件时不会停在第一处解析
错误，而是返回 `invalidCards`，其中包含 `status`、`path` 和 `message`。运行时召回
仍然对 active 卡保持严格；无效 active 卡必须修复后才能参与召回。

用 `ome experience migrate-legacy --dry-run` 预览旧版、缺少
`schema: ome-card` 的卡片迁移结果。项目库加 `--scope project`。确认迁移列表无误后，
再去掉 `--dry-run` 执行。迁移默认原地改写，不自动创建备份；只有你明确需要临时副本时
才加 `--backup`。

## 评估

```bash
ome eval recall --suite <file>
ome eval recall --suite tests/fixtures/eval/core.json --limit 4
ome eval recall --suite my-suite.json --use-current-library
ome eval recall --compare before.json after.json
```

`ome eval recall` 是确定性的，不调用 AI 模型。默认使用临时 dataDir 中的 fixture 卡片，不会把评估卡写入用户真实经验库。

## 诊断

```bash
ome doctor
ome doctor --repair-index
ome hook status
ome hook run
ome stats
ome version
ome -v
which -a ome
```

`ome doctor` 检查 dataDir 可写性、配置 schema、卡片生命周期完整性、active 索引一致性、reflect 状态、hook 状态、事件 JSONL、包运行时要求，以及 PATH 中冲突的 `ome` 二进制。无效 active 或 draft 卡是错误；无效 archived 卡只作为治理 warning 暴露，因为 archived 只是历史，不会进入运行时召回。

`ome hook run` 是已安装 Codex 和 Claude hook 使用的 runtime 入口。它保留为公开命令是为了让 hook 能执行；普通设置应通过 `ome init` 完成。

## 配置

```bash
ome config get
ome config preview dataDir ~/Documents/Oh-My-Experience
ome config set dataDir ~/Documents/Oh-My-Experience
```

## 卸载

```bash
ome uninstall
ome uninstall --provider all
ome uninstall --keep-hooks
ome uninstall --keep-skill
ome uninstall --delete-library --yes
```

`ome uninstall` 会移除选中的提示词阶段 hook 和对应 OME skill，但默认保留经验库。删除经验库是不可逆操作，必须显式使用 `--delete-library --yes` 或 `--delete-library --force`。

## 语言行为

CLI 人类输出固定英文，即使系统语言不是英文也一样。中文公开文档继续通过 `/zh/`
这类路径提供。

JSON 输出字段名保持稳定英文。
