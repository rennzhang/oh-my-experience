# OME 经验库复盘治理指南

## 何时使用

Agent 收到以下指令时执行本指南：

- 复盘现有 OME 经验库
- 全面评估 / 系统评估 / 治理 / 清理 / 精修经验卡
- 单条复盘某张经验卡
- 合并、删除、归档、重写、收窄或加强已有经验卡
- 检查召回污染、重复卡、冲突卡、过窄卡、过泛卡或经验腐烂
- 让经验库持续进化、提高质量、保持独立场景和低上下文噪音

**不要**把本指南用于从历史会话中提炼新经验。会话扫描和新候选生成走
`references/reflect-retrospective.md`。

两份指南共享同一套卡片质量标准：`summary`、使用标准、排除边界、召回锚点、engine hints 和 rule 都必须服务“准确召回、低噪音、可执行”。区别是：

- `reflect-retrospective.md` 负责从历史会话深扫出新候选。
- 本指南负责净化、合并、归档和修复现有经验卡。

需要执行 `ome` 命令时，先读 `references/cli.md`。本指南只规定经验库治理流程，
不替代 CLI 手册。

## Agent 核心职责

1. 以当前 OME dataDir 和 CLI 输出为 source of truth。
2. 评估现有经验卡是否仍然独立、准确、可召回、低噪音。
3. 识别重复、冲突、过宽、过窄、过时、证据不足和召回污染。
4. 先给治理建议和证据，再按用户授权逐条改库。
5. 改库时保持生命周期干净：能归档就归档；需要重写就先建替代，再归档旧卡。

**非职责**：直接手改 active 卡文件；把全面复盘一次性变成大批量无审查改动；
为了瘦身删除仍有清晰场景的经验卡；把旧会话总结当成当前 active 库事实。

## 总原则

- **当前 active 库优先**：判断污染和冲突看 `ome experience list --status active --json`
  与 `ome match`，不要只看历史统计或 archived 文件。
- **全面复盘先总览**：用户要求全面复盘时，先产出总览和优先级队列，引导单条复盘；
  除非用户明确要求执行，否则不要直接批量修改。
- **单条复盘要闭环**：用户点名某张卡时，必须读取完整卡片、模拟正反召回、检查相邻卡，
  再给 keep / rewrite / merge / archive 建议。
- **少召回比多召回重要**：经验卡应有清晰场景。触发词、负触发词、分类、适用性和规则正文
  必须共同减少脏上下文。
- **先建替代，再下线旧卡**：重写或合并 active 卡时，不直接编辑 active 文件。新卡走
  `candidate -> draft -> active`，验证命中后再归档旧卡。
- **保留历史，不保留噪音**：archived 卡和 retrospective 可以保留审计历史；active 库只保留
  当前可用、边界清楚、不会互相污染的经验。
- **净化不是兼容旧字段**：当前 schema 才是事实来源。字段变更后，应迁移或归档旧内容，不保留两套逻辑。
- **archived 也要能被系统读懂**：归档卡不参与召回，但不应持续制造 doctor 噪音。旧格式归档卡可以迁成当前格式的归档卡，并在备份目录保留原文。

## 工作模式

### 模式 A：全面复盘

触发：用户说“系统评估经验库”“全面复盘”“看看哪些要优化或删除”“防止腐烂”等。

执行步骤：

1. 读取当前配置和健康状态：
   - `ome config get --json`
   - `ome doctor --json`
   - `ome experience list --status active --json`
   - 必要时读取 `ome stats --json`
2. 建立 active 库地图：
   - 按 category / topics / recallPolicy / risk 分组。
   - 标记每张卡的主场景、触发词、负触发词、适用范围和相邻卡。
3. 检查库级问题：
   - 同义重复：两张卡覆盖同一决策或同一执行门槛。
   - 轻微重叠：多张卡应串联，但触发词可能一起命中。
   - 过宽：触发词太泛，容易污染普通任务。
   - 过窄：只适合一次历史事故，不再值得 prompt-time recall。
   - 过时：规则指向旧命令、旧 dataDir、旧命名或旧流程。
   - 缺负触发：overloaded words 如 goal/review/release/source/truth/Spool 没有排除边界。
   - 缺证据：summary 或 rule 像主观口号，没有来源或验收依据。
   - 类别错误：分类导致用户或 Agent 误解适用层级。
4. 产出总览，不直接动库：
   - Active 库规模和分类分布。
   - P0：明显污染、错误、冲突或应归档。
   - P1：需要重写、合并、收窄或补负触发。
   - P2：可读性、标题、分类、证据字段和 archived schema 噪音优化。
   - 建议的单条复盘顺序。
5. 引导用户进入单条复盘：
   - 优先建议一次处理 1 张或 1 个紧密簇。
   - 如果用户明确说“全部执行”，仍按簇分批执行，每批完成后验证召回再继续。

全面复盘的输出重点是“治理路线图”，不是一次性把所有卡改完。

### 模式 B：单条复盘

触发：用户点名某张卡、某个 ID、某个标题、或说“这条重写/删除/合并/看看”。

执行步骤：

1. 定位卡片：
   - 用 `ome experience show <id> --json` 读取完整卡。
   - 如果只给标题片段，先用 `ome experience list --status active --json` 定位唯一 ID。
2. 检查相邻卡：
   - 用该卡 title、triggers、topics 构造 2-4 个 `ome match ... --json` 查询。
   - 检查是否经常与其他卡一起命中。
   - 读取可能重叠的 active 卡，不要只看标题。
3. 检查正反召回：
   - 正例：这张卡应该命中的真实用户表达。
   - 反例：相近但不该命中的普通任务、纯概念问题、其他卡主场景。
   - 如果有 Spool 或历史证据需求，用 Spool 回到用户原话；没有必要时不做全库会话扫描。
4. 判断动作：
   - `keep`：规则清晰，召回准确，只需保留。
   - `rewrite`：场景有价值，但标题、触发词、负触发词、分类或 rule 不够好。
   - `merge`：两张或多张卡表达同一场景，应建一张替代卡并归档旧卡。
   - `archive`：场景太窄、已被其他卡覆盖、过时、证据不足或持续污染召回。
5. 执行动作前先给建议：
   - 说明用户影响。
   - 给出证据入口。
   - 说明会保留、重写、合并还是归档。
   - 未获用户授权时停在建议。

## 改库规则

### 只归档

当卡片不再应该 active，但不需要替代卡时：

```bash
ome experience archive <card-id> --reason "<reason>" --json
```

归档后必须验证：

- `ome experience show <card-id> --json` 显示 `status: archived`
- 原触发场景不再命中旧卡
- 如果该场景仍有价值，应命中替代卡或明确无须召回

### 重写或合并

当需要保留场景但改写 active 规则时：

1. 用 `ome reflect start --focus "<library review focus>" --json` 创建治理 run。
2. 写入替代候选，audit 必须说明：
   - 被复盘的旧卡 ID
   - 相邻卡和冲突检查
   - 正反召回测试
   - 用户纠正或 Spool 证据
   - 为什么是 rewrite / merge / archive
3. 用 `ome reflect candidates <run-id> --from-file <file> --json` 写候选。
4. 用户已明确授权时，走：
   - `ome reflect decide <run-id> <candidate-id> --action approve --json`
   - `ome reflect apply <run-id> --json`
   - `ome experience promote <draft-id> --json`
5. 验证新卡命中正例、避开反例。
6. 归档被替代旧卡。
7. 更新人工索引或 Obsidian 索引入口，但不手改 active 卡正文。

### 禁止动作

- 禁止直接编辑 `experiences/active/*.md` 来改 active 卡。
- 禁止只改标题不改触发边界。
- 禁止为“看起来整齐”删除有明确独立场景的 active 卡。
- 禁止把多个不同场景合成一张大而全的背景噪音卡。
- 禁止只看 `ome stats` 就判断卡片价值；stats 是线索，不是治理结论。

## 质量判断标准

每张 active 卡都应满足：

- **独立场景**：一句话能说清它何时比其他卡更该出现。
- **summary 可判断**：`summary` 是一整句判断依据，包含触发场景、常见误判或失败、正确动作，以及必要的不适用边界；不是标题复述、口号或来源审计摘要。
- **使用标准自然**：`criteria.use_when` 写真实执行入口，模型读完能理解“什么时候用”，不是关键词堆叠。
- **排除边界明确**：`criteria.ignore_when` 写相近但不该用的场景，尤其是文档案例、只解释、不实际执行、工具名只是资料来源、业务概念和用户明确降噪的场景。
- **触发准确**：`recall.triggers` 是从使用标准中抽出的短锚点，不是长句、抽象形容词或 rule 摘抄。
- **规则可执行**：rule 是未来 Agent 能直接执行的步骤、判断或禁令，不是口号。
- **分类正确**：category 表示这张卡的工作层级，不只是关键词所属领域。
- **证据可追溯**：retrospective、operation log 或 review 证据能解释它为什么存在；active 卡本身不承载长 provenance。
- **召回不污染**：常见正例能命中；常见反例不应命中；相邻卡共同命中时有清晰分工。
- **生命周期干净**：旧同义卡已 archived；active 库里没有并行旧版本。

## 净化优先级

### P0：必须先处理

- active 卡会在明显无关任务中召回。
- active 卡漏掉高风险或高频正例。
- 同一场景存在多张 active 旧版本。
- 卡片 schema 无法被 CLI 读取，导致 doctor 或 list 失败。
- rule 缺失、被截断，或不再包含复盘出的核心规则。

### P1：需要本轮处理

- `summary` 不能帮助模型判断使用边界。
- `criteria.use_when` / `criteria.ignore_when` 仍是关键词式、过宽或人读不懂。
- `recall.triggers` 泛化到会污染普通任务。
- `engine_hints` 缺少已知误召回的负向信号，或把纯自然语言能表达的边界硬塞成程序字段。
- 项目级卡缺少 `scope.level`、`project_key` 或 `module_path`，导致全局误召回。

### P2：可排期清理

- 标题、分类、topics 不够清楚，但召回行为正确。
- archived 旧格式卡不影响 active 召回，但持续制造治理噪音。
- provenance 字段可读性不足，但核心规则和召回边界正确。

## 字段净化规则

### summary

重写为一整句，不超过必要长度，包含：

- 触发场景：用户在什么工作流里需要它。
- 失败模式：不使用时容易犯什么错。
- 正确动作：Agent 应该怎么做。
- 边界：相近但不该用的场景。

不合格示例：

```text
创建目标时完整交付。
```

合格示例：

```text
当用户要求启动 /goal、创建目标或明确说开干时，Agent 应进入完整闭环交付模式，先明确目标和真实完成标准，再实现、验证和汇报；如果只是解释 goal 功能、写文档案例或讨论业务目标，则不要使用。
```

### use_when / ignore_when

- 用自然语言短句写给模型判断，不用分号拼接，不写只有系统才懂的缩写。
- `use_when` 描述真正执行入口。
- `ignore_when` 描述近似噪声和误召回边界。
- 被用户纠正过的误解必须进入 `ignore_when`；如果召回引擎也能稳定识别，再补 `engine_hints.negative`。

### recall.triggers

- 从 `use_when` 抽出最短、最自然的锚点。
- 优先 3-5 条；高风险卡可以略多，但必须仍然具体。
- 不把宽词当主触发，例如单独的 `goal`、`git`、`review`、`source`、`Spool`。

### engine_hints

- 只用于程序能稳定识别的正负信号。
- positive 用来确认任务意图，例如 `goal_execute`、`worktree_diff_operation`、`historical_session_lookup`、`architecture_quality`；路由型 positive hint 是严格门槛，不命中就不召回。
- negative 用来压住已知近似噪声，例如 `goal_example_discussion`、`business_goal_discussion`、`git_source_noise`、`ui_surface_noise`。
- 不要把自然语言判断完全转成 hints；模型仍需要读 `summary` 和 `criteria` 自主判断。

### rule

- 只保存未来 Agent 要执行的完整规则。
- 保留复盘总结出的核心内容，不要在净化时丢掉。
- 不写来源审计、历史说明、候选审批备注或外层代码块 fence。

## 总览输出模板

全面复盘先输出：

```text
结论：
当前 active 库总体健康度如何；最大风险是什么。

用户影响：
哪些卡会造成脏上下文、漏召回、过度召回或维护成本。

总览：
- Active 数量、分类分布、明显簇
- P0 / P1 / P2 治理队列
- 建议先处理的单卡或卡簇

证据入口：
- 用过的 OME 命令
- 用过的 Spool 搜索或会话 UUID
- 关键 match 正反例

建议下一步：
先复盘哪一张或哪一簇；是否需要用户授权执行。
```

## 单条复盘输出模板

```text
结论：
keep / rewrite / merge / archive。

用户影响：
保留或修改后会改善什么；不改会造成什么污染或漏召回。

证据：
- 当前卡 ID 和核心规则
- 相邻卡
- 正例 match
- 反例 match
- Spool / 用户原话证据（如使用）

建议改法：
标题、summary、criteria、recall、engine_hints、scope、category、rule 或归档理由。

是否执行：
未获明确授权时，只给建议；获授权后按生命周期执行并验证。
```

## 完成标准

经验库复盘任务完成前逐项自查：

- [ ] 已确认当前 `dataDir`
- [ ] 已区分全面复盘还是单条复盘
- [ ] 全面复盘已先给总览和治理队列
- [ ] 单条复盘已读取完整卡和相邻卡
- [ ] 已做正反召回验证或说明不能验证的原因
- [ ] 已明确 keep / rewrite / merge / archive
- [ ] 改库时没有直接编辑 active 卡
- [ ] 已验证 `ome doctor --json`
- [ ] 已验证新旧召回行为
- [ ] 已说明剩余风险和待确认项
