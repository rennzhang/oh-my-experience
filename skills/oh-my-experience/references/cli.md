# OME CLI 操作参考

本参考给 Agent 读取。`ome` CLI 仍然是 OME 数据写入的 source of truth，但公开命令面保持克制：初始化、召回、来源导入、复盘、经验治理、评估、诊断和卸载。

## 使用原则

- 不要绕过 CLI 直接写 cards、reflect runs、indexes、hooks 或 skill ownership 文件。
- 需要给脚本、hook 或另一个 Agent 消费时使用 `--json`。
- 面向用户展示时使用默认人类输出，不要把内部 JSON 直接甩给用户。
- 运行测试、eval 或验证命令时优先隔离 dataDir，不污染真实经验库。
- 涉及删除经验库、覆盖 hooks、覆盖 skill、卸载数据时必须先得到用户确认。
- 包内开发时可用 `node bin/ome.js` 替代全局 `ome`。

## 初始化与配置

```bash
ome init
ome init --interactive
ome init --yes
ome init --provider claude
ome init --provider all
ome init --no-hook
ome init --reset-config
```

规则：

- `ome init` 可重复运行。
- 交互式终端中会打开设置流程。
- CI、管道、Agent runner 中会跳过交互，使用 flags/defaults。
- `--reset-config` 只恢复运行配置，不删除 experiences、source indexes、reflect runs。
- Claude hook 生效走 `ome init --provider claude` 或 `ome init --provider all`，不要要求用户记忆单独的 hook install 命令。

查看或修改 dataDir：

```bash
ome config get
ome config preview dataDir ~/Obsidian/Oh-My-Experience
ome config set dataDir ~/Obsidian/Oh-My-Experience
```

规则：

- `dataDir` 只控制全局经验库和运行状态。
- 项目级经验库固定在 `<project-root>/.oh-my-experience/`，不通过 config 配置。

项目经验库：

```bash
ome project status
ome project init
```

规则：

- `ome project init` 只在当前项目根目录创建 `.oh-my-experience/`。
- 项目库适合保存随仓库同行的经验卡；个人或隐私经验仍放全局库。
- `ome project status --json` 会返回项目上下文、项目库路径、存在性、可读性和 warnings。

## 来源导入

```bash
ome import codex --sessions <dir>
ome source status
ome source connect spool --mode ask
ome source import spool --limit 20
ome import spool --query "browser validation" --source codex
```

规则：

- Spool 是可选依赖；不可用时继续使用 Codex 或本地来源。
- 用户给 session id 时，不要传给 `ome reflect start`；在来源审计阶段读取原记录。
- 导入后必须记录实际搜索过的来源，写入 `searchedSources`。

## 复盘 Run

创建复盘容器：

```bash
ome reflect start
ome reflect start --scope project
ome reflect start --focus "<关注点>"
```

兼容说明：

- `ome create-reflect` 仍可用于旧脚本，但新流程优先使用 `ome reflect start`。

规则：

- `--focus` 是主题镜头，不是来源范围。
- 没有用户明确限制来源集合时，`sourceCoverage` 默认仍是 `all-accessible`。
- 不要把 focused scan 理解成只扫少量相关会话。

查看复盘 run：

```bash
ome reflect list
ome reflect show <run-id>
```

快速手动加一条经验：

```bash
ome reflect add <run-id> --title "Browser validation" --summary "..." --rule "..."
ome reflect add <run-id> --title "Browser validation" --category "测试验收" --summary "..." --rule "..."
```

## 候选写入与审计

写入候选：

```bash
ome reflect candidates <run-id> --from-file <file>
ome reflect candidates <run-id> --scope project --from-file <file>
ome reflect candidates <run-id> --from-file <file> --audit-file <audit.json>
```

不完整审计只在明确接受时使用：

```bash
ome reflect candidates <run-id> --from-file <file> --allow-incomplete-audit --incomplete-audit-reason "source access limited"
```

写入前必须有 source audit。audit 至少覆盖：

- `focusLens`
- `sourceCoverage`
- `searchedSources`
- `unavailableSources`
- `noiseFilters`
- `evidenceClusters`
- `userCorrections`
- `rejectedInterpretations`
- `activeCardOverlapQa`
- `remainingEvidenceGaps`

`sourceCoverage: unknown` 默认不得写候选。

## 审批生命周期

候选审批：

```bash
ome reflect decide <run-id> <candidate-id> --action approve
ome reflect decide <run-id> <candidate-id> --action approve --category "产品与 UI"
```

应用到 draft：

```bash
ome reflect apply <run-id> --dry-run
ome reflect apply <run-id> --scope project --dry-run
ome reflect apply <run-id>
ome reflect apply <run-id> --scope project
```

晋升 active：

```bash
ome experience promote <card-id>
ome experience promote <card-id> --scope project
```

兼容说明：

- `ome experience approve <card-id>` 仍可用，但新流程优先说 `promote`。

规则：

- 生命周期必须显式：`candidate -> draft -> active -> archived`。
- 复盘流程只能先生成 review/candidate；不要直接创建 active 卡。
- 用户审批前不要替用户完成晋升。

## 卡片查看与治理

```bash
ome experience list
ome experience list --scope project
ome experience list --status draft
ome experience list --compact --json
ome experience show <card-id>
ome experience show <card-id> --section rule
ome experience show <card-id> --scope project --section rule
ome experience archive <card-id> --reason "superseded"
```

分类由候选、审批和卡片内容自然产生；不要要求用户维护单独的 category 命令。Starter lessons 由 `init` 安装，后续治理走正常经验库 review 和 archive，不再暴露单独 starter 命令。
`list --json` 默认返回完整卡片。只需要索引时使用 `--compact` 或
`--index`，避免把完整规则正文拉进上下文。

## 匹配与召回

```bash
ome match "<task>"
ome match "<task>" --json
ome match "<task>" --explain
ome match "<task>" --cwd <project-root> --explain
```

复盘前后都可使用：

- 复盘前：确认已有 active 卡是否覆盖当前场景。
- 复盘后：验证新候选的未来触发场景是否能被表达清楚。
- 在项目目录里运行时，召回会读取全局 `dataDir` 和可选项目库。
- 项目卡命中时，additional context 的完整卡片命令会带 `--scope project`。

## 评估

```bash
ome eval recall --suite <file>
ome eval recall --suite tests/fixtures/eval/core.json --limit 8
ome eval recall --suite tests/fixtures/eval/core.json --experiences tests/fixtures/eval/core.cards.json
ome eval recall --suite my-suite.json --use-current-library
ome eval recall --compare before.json after.json
```

规则：

- `ome eval recall` 是确定性的，不调用 AI 模型。
- 默认使用临时 fixture 库，不写入真实经验库。
- 只有明确要评估当前 active 库时才使用 `--use-current-library`。
- Hook runtime validation 应走真实 `ome hook run` 或项目测试，不再暴露独立 `eval hook` 命令。

## Hook

```bash
ome hook status
ome hook run
```

规则：

- 安装和卸载 hook 走 `ome init` / `ome uninstall`。
- `ome hook run` 是 Codex/Claude 已安装 hook 的 runtime 入口，不能删除。
- Hook 运行时会从 prompt payload 推导项目上下文，并应用卡片 `scope`。
- 如果项目库存在，Hook 会读取项目 active 卡；hook events 仍写入全局 `dataDir`。
- 不要在复盘任务里顺手改 hook；复盘和 setup 是不同生命周期。

## Doctor 与状态

```bash
ome stats
ome doctor
ome doctor --repair-index
ome version
ome -v
which -a ome
```

`ome doctor` 应检查：

- dataDir 可写性
- 配置 schema
- 卡片生命周期完整性
- active index 一致性
- reflect 状态
- hook 状态
- event JSONL
- 包运行时要求
- PATH 中冲突的 `ome` 二进制

判定边界：

- 无效 active / draft 卡是错误，会阻塞 `doctor.ok`。
- 无效 archived 卡是治理 warning；archived 不参与运行时召回，但要在 `checked.invalidCards` 和 warnings 中可见。

`--repair-index` 会重建 `indexes/experiences.json` 后再检查。只有在索引不一致或手动改过经验文件后使用。

## 卸载

```bash
ome uninstall
ome uninstall --provider claude
ome uninstall --provider all
ome uninstall --keep-hooks
ome uninstall --keep-skill
ome uninstall --delete-library --yes
```

`ome uninstall` 默认保留经验库。删除经验库是不可逆操作，必须由用户明确确认。
