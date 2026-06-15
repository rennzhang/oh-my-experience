# OME 会话扫描复盘操作指南

## 何时使用

Agent 收到以下指令时执行本指南：

- 执行 OME retrospective / 复盘
- 从历史会话中提取可复用规则
- 创建或推进 OME retrospective run

## Agent 核心职责

1. 扫描所有可访问来源中的用户会话记录
2. 复盘可复用的执行经验和用户偏好
3. 将复盘结论整理为待审候选卡，停于 `review`

**非职责**：安装、hook、故障排查（走其他 OME reference）；直接创建 active 卡（必须走 OME CLI）；替代用户审批。

需要执行 `ome` 命令时，先读 `references/cli.md`。本指南只规定扫描与复盘，不承担 CLI 手册职责。

## 合格完成标准

复盘提交前逐项自查：

- [ ] 已声明 `sourceCoverage` 和 `focusLens`
- [ ] 已搜索所有可访问来源（除非用户明确限制来源集合）
- [ ] 已过滤 system / developer / AGENTS / assistant / 子代理 / prompt 模板噪声
- [ ] 已回到原始用户消息验证用户原话、纠正、验收和拒收
- [ ] 已聚类重复模式、失败原因、最终有效路径和用户标准
- [ ] 已检查 active 卡是否已有相近经验
- [ ] 已列出剩余证据缺口
- [ ] 先产出复盘判断，再生成候选卡

未满足全部条件 = 复盘不合格，不得提交候选。

---

## 核心原则

以下原则对所有主题通用，不可降级：

- **主题聚焦不改扫描范围**：`focusLens` 只改变分析镜头，不缩小 `sourceCoverage`。关注"浏览器验证"也必须扫描全部可访问会话。
- **先全盘扫描，再按主题提炼**：关键词搜索只是索引入口，不是复盘本身。不得只扫几条命中的 session 就产出候选；必须覆盖所有可访问来源，或明确写出不可访问来源和剩余风险。
- **Base 规则不可被用户倾向覆盖**：用户提示词里的偏好、主题或怀疑点只能作为附加 lens，用来提高审计敏感度；不能绕过来源覆盖、噪声过滤、原话验证、active 重叠检查和正反例验证。
- **memory 和 summary 只做线索**：rollout summary、对话记忆只能辅助定位，不能作为写入候选卡的证据。
- **无来源审计不得写候选**：`sourceCoverage` 为 `unknown` 时禁止生成候选卡。
- **证据不足标不完整**：剩余证据缺口存在时如实标注。
- **OME CLI 是 OME 数据写入入口**：写入复盘候选、draft 或 active 卡时，不得绕过 CLI 直接改库文件。
- **生命周期单向**：`candidate -> draft -> active -> archived`。
- **补充材料默认修订当前 run**：候选生成后、用户审批前，如果用户继续提供链接、粘贴内容、口头纠正、反例或"可以参考吸收"之类反馈，默认是在优化当前扫描结果。不要新建独立 run 或新卡；应读取当前 run 的候选和用户补充，重写同一 run 的候选输入，再用 `ome reflect candidates <run-id> --from-file <file>` 覆盖候选，保持 review 入口不变。只有用户明确要求另开主题或另做一张卡时才创建新 run。

---

## 扫描——扫什么

### sourceCoverage（来源覆盖）

决定搜索范围。默认 `all-accessible`。

| 值 | 含义 | 触发条件 |
|---|---|---|
| `all-accessible` | 全部可访问的用户来源 | 默认行为 |
| `bounded` | 用户明确限制的来源集合 | 用户说"只看最近 N 个 session"等 |
| `user-provided` | 仅用户提供的来源 | 用户直接给文件或粘贴内容 |
| `manual` | 人工审计或迁移 | 从旧系统迁移经验 |
| `unknown` | 不完整审计 | **禁止**生成候选卡 |

**关键规则**：只有用户**明确**限制来源范围时才用 `bounded` 或 `user-provided`。说"关注 X 主题"是设 `focusLens`，不是缩小 `sourceCoverage`。

**字段约束**：`sourceCoverage` 只能使用上表枚举值。不要写 `spool-backed`、`spool-backed-representative` 之类自造值；Spool 的实际使用方式写进 `searchedSources`、`unavailableSources`、`remainingEvidenceGaps`。

### focusLens（主题镜头）

复盘关注点，用户指定。无则空字符串。

- 正确：`focusLens: "浏览器验证"`
- 正确：`focusLens: ""`
- 错误：因为 `focusLens` 不空就只扫几个相关会话

`focusLens` 的作用是增加问题意识：优先看哪些失败模式、正反例、用户纠正和相邻卡冲突。它不改变 Base 规则，也不替代全盘扫描。

### 默认来源清单

1. Codex 会话（`.jsonl`）
2. 执行日志
3. 任务轨迹
4. 已扫描的 session record
5. 用户指定的其他来源

### Agent 语义展开

语义展开是 Agent 的职责，不是 Spool 或 OME CLI 的职责。无论使用 Spool、本地 `.jsonl`、source index，还是用户提供文件，Agent 都必须把 `focusLens` 拆成多组自然语言入口后分别搜索、合并、去重和验证。

执行要求：

- 先把主题拆成 3-8 组搜索入口：用户可能说过的原话、同义表达、反向表达、验收标准、拒收理由、相关路径/模块名。
- 每组搜索入口尽量短；不要把多个语义强行塞进一个 query 里。`"最小化侵入 不要历史包袱"` 只能作为其中一个窄入口，不能代表整个主题。
- 对每个来源后端使用同一套语义展开：有 Spool 时跑多条 `spool search`；无 Spool 时用多条本地全文搜索；用户给文件时也要多关键词、多表达检索。
- 合并结果后按 session/message 去重，再按 `messageRole=user`、时间、cwd、上下文类型过滤。
- 搜索反例和边界：用户是否在相近场景要求保留兼容、接受临时方案、只讨论概念而非执行。
- 在 `searchedSources` 里记录实际搜索过的 query 族、来源后端和过滤口径；不要只写一个代表性 query。

### Spool 分支策略

先运行 `ome source status --json`，只按真实状态选路线。Spool 是来源加速器，不改变候选生命周期，也不替代原话验证。

#### 无 Spool / Spool off

适用：Spool 不可用、未安装、配置为 `off`，或用户不允许启用。

- 继续走 Codex 本地会话、已扫描 source index 和用户提供来源；不要因为没有 Spool 就停止复盘。
- `searchedSources` 里写明实际枚举的 sessions 目录、source index 和代表性原始记录。
- 建立清洗后的用户消息索引：只保留可识别的用户输入，过滤 system / developer / AGENTS / assistant summary / worker prompt / IDE 注入上下文。
- 按 Agent 语义展开跑多组本地搜索；不要用单个关键词或单条 `rg` 命中代表主题覆盖。
- 对关键词计数保持克制：计数只说明索引信号，不能直接当候选证据。
- 高价值证据必须回到原始 `.jsonl` 行或 session record，确认角色、上下文和用户是否在纠正、验收或拒收。
- `unavailableSources` 写清 Spool 不可用或关闭；如果本地来源已完整枚举，`sourceCoverage` 仍可为 `all-accessible`。

#### 有 Spool / Spool enabled

适用：`ome source status` 显示 Spool 可用，且配置为 `ask` 或 `enabled`；如果用户要求"打开 Spool 配置"，优先使用 `ome source connect spool --mode enabled`。

- 深扫前先记录 `spool status`；需要最新历史时运行 `spool sync`，并记录同步前后 session 数、来源分布和时间。
- 默认 **search-first，不要 scan-first**。先按 Agent 语义展开运行多条 `spool search "<短 query>" --json --limit <n>` 定位候选会话，再合并去重并决定是否扫描索引。
- 查询要拆成两类：
  - 精确用户原话：短语、纠正、验收标准、拒收理由。Spool 通常更快、更干净。
  - 宽泛工程概念：fallback、source of truth、职责边界、两套真相等。Spool 可能漏召回，需要本地全文扫或 OME source index 补覆盖。
- Spool 的单 query 命中少只说明这一条词面检索窄，不代表主题覆盖完成；必须跑同义、近义、反向和边界 query。
- 扫描只索引少量高价值命中：优先用窄 query + limit，或先 `spool show --json <uuid>` 验证后再 `ome source scan spool`。不要用宽泛主题直接扫入大量 Spool 历史。
- 如果宽 query 命中超大会话、部分失败或输出过大，不把它当复盘失败；改用更窄 query、`spool search` 结果和代表性 source scan，并把失败写进 `unavailableSources` 或 `remainingEvidenceGaps`。
- Spool 命中的 current-run assistant 文本、OME 开发会话总结、assistant 转述都按噪声处理，除非能回到独立用户原话。
- 有 Spool 时，最佳证据形态是：Spool session UUID / source / startedAt / cwd / role / snippet + 选中记录扫描结果 + 必要的本地全文补扫。
- 如果只用了代表性 Spool query 而没有覆盖所有可访问来源，`sourceCoverage` 用 `bounded`，并写清边界；如果 Spool index、本地来源和用户指定来源都按计划覆盖，才用 `all-accessible`。

---

## 扫描——怎么扫

### 步骤 1：确认双轴

```
sourceCoverage: <从枚举中选取>
focusLens: <用户指定，无则 "">
```

用户给 session id 时**不要**传给 `ome reflect start`，在步骤 3 读取该记录并纳入证据。

### 步骤 2：创建复盘容器

按 `references/cli.md` 用 `ome reflect start` 创建 reflect run。Spool 不可用时，继续走 Codex 或本地来源路径。

### 步骤 3：扫描来源

按 `references/cli.md` 扫描 Codex、Spool 或用户提供的来源。启用 Spool 时先 search 后窄 scan；不要把宽泛主题的 Spool scan 当作第一步。

### 步骤 4：枚举实际搜索的来源

列出真正读取过的每个文件 / 扫描的每条记录 → 写入 `searchedSources`。

### 步骤 5：过滤噪声

以下内容**不得**作为直接用户证据：

| 噪声 | 示例 |
|---|---|
| system / developer 指令 | 系统注入的配置 |
| AGENTS.md / 仓库规则 | 整段注入的项目规范 |
| assistant 总结 | Agent 的总结性文字 |
| 子代理回传 | 子 agent 返回内容 |
| prompt 模板 | 固定格式提示词模板 |
| 转述中的非用户原话 | 第三人称推理部分 |

使用转述材料时，只提取可识别的原始用户输入，标注为"提取证据"。

### 步骤 6：搜索证据和反例

- 先用关键词、session id、路径、标题和用户原话片段建立索引
- 先由 Agent 对 `focusLens` 做语义展开，形成多组短 query；每组 query 分别搜索并记录
- 再扩展到所有可访问来源，避免只看最先命中的几条记录
- 搜索匹配 `focusLens` 的用户消息
- 同时搜索反例：用户对类似场景给出不同处理方式的情况
- 专门搜索近似噪声：文档案例、解释讨论、工具名只是资料来源、业务概念和非执行场景
- 有 Spool 时，先用精确短语拿 session 锚点，再用本地全文或 source index 补宽泛概念覆盖
- 无 Spool 时，先构建清洗后的本地用户消息索引，再回读原始会话验证代表性证据

### 步骤 7：原始记录验证

对每条证据：
- 回到原始会话文件，确认是用户原话还是转述
- 确认上下文：纠正 / 验收 / 拒收 / 随口提及
- 转述材料只提取可识别原始输入，标注类型

### 步骤 8：聚类证据

相似模式归组，每组回答：重复了几次？最终有效路径？用户是否验收？

### 步骤 9：检查 active 卡重叠

按 `references/cli.md` 查询相近 active 卡，并把结果写入 `activeCardOverlapQa`。

### 步骤 10：写清证据缺口

列出因证据不足无法确定的结论。

---

## 候选后的继续迭代

用户经常不会一次性给完反馈。候选已经生成但还没审批时，后续输入的默认含义是"把这条经验改得更准"，而不是"再创建一条经验"。

处理规则：

1. 先定位最近或用户点名的 `runId`，读取 `ome reflect show <run-id> --json` 和现有候选。
2. 判断用户补充影响哪张候选：改 summary、触发条件、ignore 边界、rule、证据、冲突说明，还是应拒绝/合并。
3. 用同一个 run 的 `candidates-input.json` 或新临时输入文件重写完整候选集合；保留未受影响的候选，修改受影响的候选。
4. 在 audit 里追加这次补充来源和 `userCorrections`，说明没有重新全盘扫描的原因；`sourceCoverage` 可以是原覆盖范围，若只处理用户补充则写清它是 refinement，不要伪装成新全盘扫描。
5. 运行 `ome reflect candidates <run-id> --from-file <file>` 更新当前 review 文件。
6. 明确告诉用户 review 的仍是同一个 run；没有 approve、apply 或 enable。

禁止动作：

- 不因为用户给了一个新链接或一句新纠正就创建另一个 sibling run。
- 不把用户补充原文整段长期保存为 rule；只吸收可执行判断。
- 不把"参考吸收"理解成直接 enable active。

---

## 复盘——怎么复盘

### 复盘三问

每类证据聚类依次回答：

1. **执行经验**：哪里失败？怎么解决？未来该复用什么？
2. **用户偏好**：用户反复强调哪些设计、产品、交互、沟通或工作方式标准？
3. **可复用规则**：未来 Agent 可直接执行的规则？

### 证据优先级

1. 用户原话和纠正
2. 用户验收或拒收
3. 最终跑通路径
4. 多次重复出现的模式
5. assistant 总结 — 只能辅助定位，不能单独证明

### 输出约束

- 语气强度、重复次数、适用边界写入 `recall.risk`、`recall.policy`、`evidence`、`criteria.ignore_when`、`conflicts` 字段，不写为单独章节。
- 候选卡只能从**可复用规则**派生，不得从最新提示词、单条记忆或零星命中直接生成。
- `rule` 必须写成未来 Agent 可直接执行的 Markdown。单步规则可以是一句话；多步骤、执行协议、验收清单或 MUST/MUST NOT 约束必须用有序列表或分段列表，不得写成一整段长文。
- 执行协议类 `rule` 优先用 Markdown 有序列表：每一项只表达一个动作、判断或验收点，能被 Agent 逐项执行和检查。
- `rule` 字段本体只保存未来要压入 Agent 上下文的纯规则正文，不要包含外层代码块 fence。Review/worksheet 展示层应把 `rule` 包在 `agent-rule` fenced code block 里，让用户一眼看出这段会被复用；draft、active card、`ome experience show --section rule` 和 hook 注入仍使用去 fence 的纯规则正文。
- 复盘结论先产出，候选卡后生成。

---

## 召回字段写法

候选卡的召回字段要帮助模型判断“该不该用”，不能只堆关键词。

### 字段原则

| 字段 | 写法 |
|---|---|
| `summary` | 写成一整句判断依据：触发场景 + 常见误判或失败 + 正确动作 + 必要的不适用边界。它不是标题复述，也不是来源审计摘要。 |
| `criteria.use_when` | 写用户真正需要这条经验时会说的自然工作流入口，例如 `commit 前检查 git status`、`浏览器验证 UI`。不要只写 `git`、`goal`、`Spool` 这类泛词。 |
| `criteria.ignore_when` | 写近似但不该触发的场景，例如文档案例、只解释、不实际执行、业务目标、工具只是资料来源。优先用自然语言，让模型能理解意图差异。 |
| `recall.triggers` | matcher 使用的紧凑触发锚点，通常从 `criteria.use_when` 中选最短、最自然的 3-5 条；高风险卡可以略多，但必须仍然是任务入口。 |
| `recall.topics` | 写宽分类，例如 `git`、`frontend`、`runtime`。它只辅助召回，不替代 trigger。 |
| `engine_hints.positive` | 内部召回启发式。只有当这类 hint 能明显减少误召回时才写，例如 `goal_execute`、`worktree_diff_operation`、`historical_session_lookup`、`architecture_quality`。路由型 positive hint 是严格门槛，不命中就不召回。 |
| `engine_hints.negative` | 内部负向启发式，例如 `goal_example_discussion`、`business_goal_discussion`、`explain_only`、`ui_surface_noise`。 |
| `rule` | 写未来 Agent 能直接执行的规则正文。不要写历史来源、为什么产生、候选说明或外层代码块 fence。 |

### summary 写法

合格的 `summary` 应该让模型在只看到索引时就能初步判断是否相关：

- 包含触发场景：用户在什么执行工作流里会需要这张卡。
- 包含失败模式：不使用这张卡会犯什么错。
- 包含正确动作：Agent 应该怎么处理。
- 必要时包含边界：哪些相近场景不要用。

示例：

```text
当用户要求启动 /goal、创建目标或明确说开干时，Agent 应进入完整闭环交付模式，先明确目标和真实完成标准，再实现、验证和汇报；如果只是解释 goal 功能、写文档案例或讨论业务目标，则不要使用。
```

### 常见边界

- `/goal`、`创建目标`：只有用户真的要启动 Agent 目标执行时才是 `goal_execute`；文档、README、案例、解释里的 `/goal` 是 `goal_example_discussion`。
- `高内聚/低耦合/根因修复`：只有用户要求整理核心逻辑、重构召回引擎、清理 fallback 或提升实现质量时才是 `architecture_quality`；普通文案润色或只讨论概念不触发。
- `git`：只有 commit、push、diff、stage、worktree 等真实操作才是 `git_operation`；GitHub 作为资料来源不是 Git 操作。
- `Spool`：只有查历史会话、session UUID、turn/message 证据时才是 `historical_session_lookup`；说明 Spool 是可选扫描来源不触发。
- `UI/browser`：真实页面、浏览器、视口、前端验收才是 `ui_surface`；用户明确说 UI 只是噪声时用 `ui_surface_noise`。

### 自检

- [ ] 触发词读起来像真实任务入口，而不是卡片关键词列表。
- [ ] `summary` 是一整句判断依据，包含场景、失败模式、动作和必要边界。
- [ ] 至少写了一个“不该触发”的近似场景，且模型读得懂为什么不触发。
- [ ] 泛词卡、must 卡和高风险卡写清自然语言 `criteria`；必要时才补 `engine_hints`。
- [ ] 被用户纠正过的误解写入了 `criteria.ignore_when`，必要时补 `engine_hints.negative`。
- [ ] `summary` 和 `rule` 用人话说明适用和不适用边界。

---

## 来源审计字段

写候选卡前必须填充：

| 字段 | 含义 |
|---|---|
| `focusLens` | 主题镜头，无则 `""` |
| `sourceCoverage` | 来源覆盖，取值见上方枚举 |
| `searchedSources` | 实际搜索过的来源列表 |
| `unavailableSources` | 不可用来源列表 |
| `noiseFilters` | 过滤的噪声类型 |
| `evidenceClusters` | 证据聚类摘要 |
| `userCorrections` | 用户纠正记录 |
| `rejectedInterpretations` | 被否定的解释 |
| `activeCardOverlapQa` | active 卡重叠检查结果 |
| `remainingEvidenceGaps` | 剩余证据缺口 |

旧字段 `scope` 仅做兼容，不承担主题或范围判断。

---

## 语言规则

- 候选卡和审批表使用一种主语言。
- 用户工作语言是中文 → 中文。英文 → 英文。
- 命令、标识符、API 名、产品名、直接引语保留原文。

---

## 候选卡

复盘结论的轻量输出格式。

### 写入前自检

- [ ] 来源审计字段已填满
- [ ] `sourceCoverage` 不是 `unknown`
- [ ] 每条候选从可复用规则派生
- [ ] 多步骤或执行协议类 `rule` 已使用 Markdown 有序列表或清晰分段，不能是一整段长文
- [ ] 已检查 active 卡重叠
- [ ] 候选状态为 `review`，非 `active`

### 字段映射

| 字段 | 内容 |
|---|---|
| `summary` | 一整句判断依据：触发场景 + 失败模式 + 正确动作 + 必要边界 |
| `evidence` | 来源审计 + 证据聚类 + 用户纠正 + active 卡检查 + 限制 |
| `criteria.use_when` | 自然语言使用标准，描述真实执行入口 |
| `criteria.ignore_when` | 不触发边界 |
| `recall.triggers` | 从使用标准中抽出的短锚点 |
| `engine_hints` | 只有确实能减少误召回或漏召回时填写 |
| `scope` | 适用范围；项目限定写 `level`、`project_key`、`module_path` |
| `conflicts` | 近似卡、被否定解释、取舍 |

---

## 审批表

`retrospective.md` 是审批表。每条经验只保留四段：经验总结、触发时机、可复用规则、审批区。

「可复用规则」段落是展示层，必须先写一句提示语，然后用 `agent-rule` fenced code block 展示 `rule` 正文。不要把 fence 写回候选卡字段；审批、草稿、active 卡和 prompt-time recall 使用的仍是纯规则正文。

来源审计、语气强度、适用性分析和证据细节写入候选卡字段，不新增可见章节。

## 交付输出

复盘完成后，面向用户的结果必须给出可点击的 Markdown 链接，方便直接打开审批表 Review。

- CLI 人类输出的链接目标应相对当前命令工作目录；不要用相对 OME `dataDir` 的路径冒充可点击链接。
- 至少包含审批表：`[retrospective.md](<relative-path-from-current-cwd>)`。
- 如有候选 JSON、审计 JSON 或补充材料，也给同一基准的 Markdown 链接。
- 链接文本保持短，例如 `retrospective.md`、`candidates.json`。
- 对话回复里如无法保证相对路径点击解析，补充真实文件链接；不能只给会跳错的相对路径。

示例：

```markdown
Review 文件：[retrospective.md](../../../../ren-vault/数字资产/AI系统/OME/retrospectives/2026-06-13T04-39-32-344Z-manual/retrospective.md)
候选数据：[candidates.json](../../../../ren-vault/数字资产/AI系统/OME/retrospectives/2026-06-13T04-39-32-344Z-manual/candidates.json)
```

---

## CLI 参考

所有命令、flags、JSON 输出、候选写入、审批生命周期、doctor、hook、skill、eval 和卸载行为都见 `references/cli.md`。
