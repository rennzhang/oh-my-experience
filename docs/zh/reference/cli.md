---
title: CLI 参考
status: active
---

# CLI 参考

本页记录 `ome` 的公开命令表面。CLI 刻意保持克制：设置、召回、复盘审阅、经验库治理、来源导入、诊断和卸载。

## 输出契约

默认输出面向人类，说明发生了什么、是否健康、下一步该运行什么，而不是直接 dump 内部 JSON。

当命令被脚本、hook、测试或另一个 Agent 消费时，使用 `--json`。JSON 模式下失败仍然用非零退出码结束，并输出可解析的 `{ ok: false, error: { message } }`。

`ome init` 会在交互式终端中打开设置流程。在 CI、管道或 Agent runner 中，它会跳过提示，使用 flags/defaults。想强制走向导时，使用 `ome init --interactive`。

## 常用路径

```bash
ome init
ome doctor
ome match "fix UI and validate in browser" --explain
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

`ome init` 可以重复运行。它会安装 OME 经验库、Codex skill 和选定的提示词阶段 hook。`--reset-config` 只恢复运行配置，不删除经验、来源索引或复盘 run。

## 召回

```bash
ome match "<task>"
ome match "<task>" --json
ome match "<task>" --explain
```

只有 active 卡会被召回。复盘生成的 draft 在 promote 之前不会影响提示词阶段召回。

## 来源

```bash
ome import codex --sessions <dir>
ome source status
ome source connect spool --mode ask
ome source import spool --limit 20
ome import spool --query "browser validation" --source codex
```

Spool 是可选能力。Spool 不可用时，Codex session 导入和本地召回仍然可用。

## 复盘

```bash
ome reflect start
ome reflect start --focus "browser validation and delivery gates"
ome reflect list
ome reflect show <run-id>
ome reflect add <run-id> --title "Browser validation" --summary "..." --rule "..."
ome reflect candidates <run-id> --from-file <file>
ome reflect candidates <run-id> --from-file <file> --audit-file <audit.json>
ome reflect decide <run-id> <candidate-id> --action approve --category "Product UI"
ome reflect apply <run-id> --dry-run
ome reflect apply <run-id>
```

`ome reflect start --focus <text>` 只是本次分析镜头。除非用户明确限制来源集合，否则它不能缩小来源覆盖、跳过 source audit 或降低证据标准。

`ome reflect candidates` 写入候选前必须带 source audit。只有明确接受不完整审计时才使用 `--allow-incomplete-audit`；生成的 worksheet 会显示审计不完整。

## 经验库

```bash
ome experience list
ome experience list --status draft
ome experience list --compact --json
ome experience show <card-id>
ome experience show <card-id> --section rule
ome experience promote <card-id>
ome experience archive <card-id> --reason "superseded"
```

生命周期保持显式：`candidate -> draft -> active -> archived`。
`list --json` 默认返回完整卡片，保持兼容；脚本只需要标题索引时用
`--compact` 或 `--index`，只返回 `id`、`title`、`status`、`category`、
`updatedAt`。

## 评估

```bash
ome eval recall --suite <file>
ome eval recall --suite tests/fixtures/eval/core.json --limit 8
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

`ome doctor` 检查 dataDir 可写性、配置 schema、卡片生命周期完整性、active 索引一致性、reflect 状态、hook 状态、事件 JSONL、包运行时要求，以及 PATH 中冲突的 `ome` 二进制。

`ome hook run` 是已安装 Codex 和 Claude hook 使用的 runtime 入口。它保留为公开命令是为了让 hook 能执行；普通设置应通过 `ome init` 完成。

## 配置

```bash
ome config get
ome config preview dataDir ~/Obsidian/Oh-My-Experience
ome config set dataDir ~/Obsidian/Oh-My-Experience
```

## 卸载

```bash
ome uninstall
ome uninstall --provider all
ome uninstall --keep-hooks
ome uninstall --keep-skill
ome uninstall --delete-library --yes
```

`ome uninstall` 会移除选中的提示词阶段 hook 和 Codex OME skill，但默认保留经验库。删除经验库是不可逆操作，必须显式使用 `--delete-library --yes` 或 `--delete-library --force`。

## 语言行为

CLI 人类输出默认英文，即使系统语言不是英文也一样。只有明确需要中文 CLI 文案时，才设置 `OME_LANGUAGE=zh-CN`。

JSON 输出字段名保持稳定英文。
