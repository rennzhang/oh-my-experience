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
- **memory 和 summary 只做线索**：rollout summary、对话记忆只能辅助定位，不能作为写入候选卡的证据。
- **无来源审计不得写候选**：`sourceCoverage` 为 `unknown` 时禁止生成候选卡。
- **证据不足标不完整**：剩余证据缺口存在时如实标注。
- **OME CLI 是 OME 数据写入入口**：写入复盘候选、draft 或 active 卡时，不得绕过 CLI 直接改库文件。
- **生命周期单向**：`candidate -> draft -> active -> archived`。

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

### focusLens（主题镜头）

复盘关注点，用户指定。无则空字符串。

- 正确：`focusLens: "浏览器验证"`
- 正确：`focusLens: ""`
- 错误：因为 `focusLens` 不空就只扫几个相关会话

### 默认来源清单

1. Codex 会话（`.jsonl`）
2. 执行日志
3. 任务轨迹
4. 已导入的 session record
5. 用户指定的其他来源

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

### 步骤 3：导入来源

按 `references/cli.md` 导入 Codex、Spool 或用户提供的来源。

### 步骤 4：枚举实际搜索的来源

列出真正读取过的每个文件 / 导入的每条记录 → 写入 `searchedSources`。

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

- 搜索匹配 `focusLens` 的用户消息
- 同时搜索反例：用户对类似场景给出不同处理方式的情况

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

- 语气强度、重复次数、适用边界写入 `risk`、`recallPolicy`、`evidence`、`negativeTriggers`、`conflicts` 字段，不写为单独章节。
- 候选卡只能从**可复用规则**派生，不得从最新提示词、单条记忆或零星命中直接生成。
- `rule` 必须写成未来 Agent 可直接执行的 Markdown。单步规则可以是一句话；多步骤、执行协议、验收清单或 MUST/MUST NOT 约束必须用有序列表或分段列表，不得写成一整段长文。
- 执行协议类 `rule` 优先用 Markdown 有序列表：每一项只表达一个动作、判断或验收点，能被 Agent 逐项执行和检查。
- `rule` 字段本体只保存未来要压入 Agent 上下文的纯规则正文，不要包含外层代码块 fence。Review/worksheet 展示层应把 `rule` 包在 `agent-rule` fenced code block 里，让用户一眼看出这段会被复用；draft、active card、`ome experience show --section rule` 和 hook 注入仍使用去 fence 的纯规则正文。
- 复盘结论先产出，候选卡后生成。

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
| `summary` | 来源覆盖 + 主题镜头 + 核心结论 |
| `evidence` | 来源审计 + 证据聚类 + 用户纠正 + active 卡检查 + 限制 |
| `negativeTriggers` | 不触发边界 |
| `applicability.rationale` | 适用范围理由 |
| `conflicts` | 近似卡、被否定解释、取舍 |

---

## 审批表

`retrospective.md` 是审批表。每条经验只保留四段：经验总结、触发时机、可复用规则、审批区。

「可复用规则」段落是展示层，必须先写一句提示语，然后用 `agent-rule` fenced code block 展示 `rule` 正文。不要把 fence 写回候选卡字段；审批、草稿、active 卡和 prompt-time recall 使用的仍是纯规则正文。

来源审计、语气强度、适用性分析和证据细节写入候选卡字段，不新增可见章节。

---

## CLI 参考

所有命令、flags、JSON 输出、候选写入、审批生命周期、doctor、hook、skill、eval 和卸载行为都见 `references/cli.md`。
