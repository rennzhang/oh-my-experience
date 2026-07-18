---
title: 召回引擎
status: active
---

# 召回引擎


## 产品重要性

召回质量是 Oh My Experience 的核心产品资产。好的 reflect 流程能创建卡片，但好
的召回引擎才能让这些卡片在真实工作中产生作用。

产品默认优化的是 prompt 阶段的精确候选，不是最大化召回。命中的卡片不是命令，
而是一条精简候选；Agent 必须在工作流含义真正匹配时才使用它。

## 管线

```text
matcher.normalize
  -> matcher de-noise and segment
  -> matcher task envelope
  -> signal registry detection
  -> matcher query variants
  -> library stack: global dataDir + optional project library
  -> status, scope, and routing gates
  -> field-aware BM25F candidate ranking
  -> bounded lexical evidence scoring
  -> exact negative hard rejects
  -> near-duplicate collapse and project preference
  -> confidence cutoff, abstention, and dynamic top-k
  -> retrieval context budget
  -> retrieval explain and telemetry
```

当前实现：

- `packages/core/src/matcher.ts`：prompt decomposition、language detection、
  command/path extraction、CJK bigram tokenization、code-token splitting、query
  variants 和 query plan construction。
- `packages/core/src/signal-registry.ts`：统一的 compile-time signal contract，包括
  generic signals 和 bundled 产品专用 packs。
- `packages/core/src/retrieval.ts`：active-card filtering、project
  applicability filtering、dynamic result selection、near-duplicate collapse、
  reason output、timeout fail-open support 和 budgeted context rendering。
- `packages/core/src/retrieval-scoring.ts`：BM25F ranking、bounded evidence
  scoring、intent/signal gates，以及正负向证据。
- `packages/core/src/retrieval-contract.ts`：召回版本标识，以及共享的默认
  limit、threshold、budget 和 score bounds。
- `packages/core/src/library-stack.ts`：全局/项目经验库发现和 active-card loading。
- `packages/core/src/similarity.ts`：轻量 card/candidate similarity，用于 merge
  suggestions 和 duplicate suppression，不依赖外部 embeddings。

## 要求

召回引擎必须处理：

- 英文 prompts；
- 中文 prompts；
- 中英混合；
- command names、file paths、package names 和 code symbols；
- 含有多个任务的长 prompts；
- front-end、back-end、deployment、Git、docs、test 和 security surfaces；
- 需要压过弱 lexical similarity 的 must-level cards；
- 很长的用户提示词，且需要在不把 raw prompt text 写入日志的情况下提炼核心
  intent。

卡片语言会影响召回质量，因为 `summary`、criteria、triggers 和 topics 都是 lexical recall
表面的一部分。用户自然用中文工作时，中文卡通常比翻译成英文的卡更容易召回：未来 prompt
更可能复用同一套中文说法，卡片也能保留用户当初纠正出的边界。

## Retrieval v2 策略

Retrieval v2（`sparse-v2`）保持本地、确定性，不要求 embedding model、vector
database 或外部搜索服务。它把旧式 sparse scorer 容易混在一起的两个问题拆开：

1. **哪张候选卡应该排在前面？** field-aware BM25F 提供一个 sparse ranking channel。
2. **证据是否足以返回这张卡？** 用 `0-100` 的 bounded evidence score 回答。

BM25F 保留重复 term frequency，按字段使用整个 corpus 的平均长度，并使用标准
inverse document frequency。它的 raw value 适合做相对排序，但经验库变化时数值也会
变化，所以 OME 不用 raw BM25F 与召回 threshold 比较。Threshold 只作用于 bounded
evidence score；添加或移除无关卡片时，这个分数尺度保持稳定。

Evidence score 组合多个独立、可解释的通道，例如 exact trigger phrase、field
coverage、technical tokens、CJK lexical evidence 和 registered task signals。
Recall policy、risk 和 confidence 仍是卡片 metadata，不能把弱关键词重合变成相关性。

完整策略如下：

- normalize case 和 punctuation；
- 把长提示词拆成 goal、constraints、explicit commands、mentioned files、
  provider surfaces、risk signals 和 free keywords；
- 保留重复 term 和 command/path/code tokens；
- 使用 CJK bigrams 和 phrase matching；
- ASCII 词按 token 边界匹配，因此 `github` 不会算作 `git`；
- 只有形态像命令的文本才进入 `commands`，例如 `git status` 或 `ome match`；
- 对 title、triggers、aliases、topics、category、summary、intent modes 和
  显式声明的 engine hints 做 field weights；
- scoring 前按 status 和 scope 过滤 cards；
- 正负向 task signals 统一从 registry 解析，不在 matcher 和 scorer 里维护重复
  routing lists；
- 声明的 routing hints 作为 gate，同时保留自然语言 `criteria.use_when` 作为给人看的
  applicability contract；
- normalized prompt 包含某条完整 `criteria.ignore_when` phrase 时 hard reject；模糊负向
  evidence 可以降低置信度，但不能覆盖明确排除；
- 存在项目库时，把全局卡和项目卡放进同一候选集合；
- 用 deterministic reciprocal rank fusion 融合 BM25F order 与 evidence order，再只
  用 bounded evidence score 做 threshold 和 abstention 判断；
- 折叠近似重复卡片，避免 hook context 重复同一经验；
- 当 starter 卡和 reviewed 卡共享同一个显式 rule signal 时，可以把 starter 折叠进
  reviewed 卡；两张 reviewed 卡不会只因为共享一个宽泛 signal 就被折叠；
- 全局库和项目库有等价卡时，优先选择项目库版本；
- 动态决定返回数量：每张结果都必须独立越过置信边界，不用弱尾部结果填满配置上限；
- 证据不足时返回空结果。

当前不需要外部搜索服务。

## 当前限制

当前引擎刻意保持 sparse、本地和确定性。它不声称自己能完整理解语义。最大的失败
模式是宽泛关键词重合：prompt 提到同样的表层词，但真实工作流并不相同，卡片仍然
看起来相关。

缓解方式分层处理：

- hot path 默认只给少量卡片，但不会为了填满 limit 强行返回弱结果；
- 触发词有歧义时，用稳定 routing signal 做 gate；
- `use_when` 和 `ignore_when` 用自然语言写，交给 Agent 做最后判断；
- exact `ignore_when` 命中时 hard reject；
- threshold 只作用于不随 corpus 大小漂移的 evidence score；
- 渲染上下文前折叠近似重复卡；
- 把文档/示例 prompt 视为 workflow 卡的 near miss，例如 UI 验证和 `/goal` 执行；
- eval 同时检查 precision 和 over-recall，而不是只看 recall。

召回引擎改动必须同时通过 core fixture 和 noisy-library 路径。noisy-library 测试会
把一张真实卡放在大量泛词干扰卡里，验证最终上下文仍然精确。

## Signal Registry 与 Engine Hints

OME 运行在 Agent 热路径上，所以生产召回路径保持本地、确定性和可解释。它分成两
层：

1. 先用卡片字段和 query variants 生成候选。
2. 再用自然语言标准、负向标准和 engine hints 过滤并排序。

Engine hints 使用从 prompt 派生出的信号作为启发式。所有 signal definition 统一放在
registry 中，每条 definition 都声明 id、polarity、routing behavior、patterns、negative
targets 和 ownership metadata：

- `source: generic` 表示可复用于开源 core 的通用任务形态；
- `source: pack` 加 `pack` 名称，表示属于某个 bundled 产品或工作流包，例如 OME 或
  agent-goal 专用话术。

当前 registry 编译进 package。`pack` 只是 ownership 和组织 metadata，不是 runtime
第三方注册 API。

卡片的 `engine_hints` 只引用已注册 id。正向 hint 可以提供强 evidence 或 routing
gate；负向 hint 只压制它明确声明的 targets，避免一个领域的 near miss 误伤无关卡片。
未知 signal id 属于配置问题，应由 validation 显式报告，不能静默形成第二套路由系统。

Signals 不替代卡片里的自然语言 `criteria.use_when` 和 `criteria.ignore_when`；后两者
仍是公开、给人判断的适用性契约。

例子：

- Git 安全卡使用 worktree/diff 操作 hint。把 GitHub 当资料来源提到，不应该召回 Git 卡。
- 目标执行卡使用 goal-execution hint。文档里写“展示用户说 /goal 时会发生什么”，会被
  `goal_example_discussion` 拦住。
- Spool 会话交接卡把 `historical_session_lookup` 作为强正向 hint。只说 Spool
  是可选扫描来源，不应该召回。
- 浏览器验证卡把 `ui_surface` 作为强正向 hint；当提示词把 UI/browser 放在
  噪声、文档、示例或只解释语境里时会被压住。
- 架构质量卡把 `architecture_quality` 作为正向 hint。用户要求高内聚、低耦合、
  逻辑干净或根因修复时应命中这类卡；provider 边界卡不能只因为 prompt 里出现
  “retrieval scoring” 这类词就胜出。

这个方向和现代检索系统一致：候选可以稍宽，但进入上下文前必须经过字段过滤、意图
路由和置信度选择。OME 当前生产路径仍保持 sparse 和确定性。Vector 或 semantic
reranking 只是 held-out eval 证明存在真实缺口后的可选扩展，不是 runtime dependency，
也不是弱 sparse evidence 的 fallback。

## Prompt Decomposition

用户提示词经常很长，并包含多个逻辑层。召回引擎不会把整段 prompt 当成一个 bag
of text。

Envelope fields：

- `summary`：去噪后的短任务摘要；
- `language`：`zh`、`en` 或 `mixed`；
- `taskTypes`：UI、hook、git、review、runtime、test、storage、security、docs、
  package、import、config、server；
- `surfaces`：provider 和 product surfaces，例如 Codex、Claude、Spool、CLI、
  hook、dataDir、Obsidian；
- `operations`：动作词，例如 implement、review、validate、install、migrate、
  package、dispatch；
- `files`：用户提到的文件路径或扩展名；
- `commands`：命令片段，例如 `git push`、`npm test`、`ome match`；
- `constraints`：must/should/not、safety、privacy、validation、no-goal；
- `intentModes`：粗粒度交互模式，例如 execute、discuss、explain；
- `ruleSignals`：从 prompt 派生、供显式 engine hints 使用的信号；
- `keywords`：紧凑的多语言 lexical terms；
- `segments`：用于 query variants 的短 prompt slices。

卡片的 `rule` 和 Markdown body 不进入热路径召回索引。Hook 只注入紧凑的卡片索引；如果 Agent 判断某张候选卡适合当前任务，必须再用
`ome experience show CARD_ID --section rule` 读取规则正文。

Hook run 过程中，envelope 可以在内存里包含 raw prompt fragments；但 telemetry
schema v2 只持久化 hash 或派生的非敏感 labels，绝不保存 raw prompt。

## 可解释性

每次 match 都应该可解释：

```json
{
  "id": "browser-validation",
  "title": "Browser Validation",
  "score": 82,
  "rawScore": 12.4,
  "rankScore": 32.1,
  "postSelectionScore": 82,
  "evidenceFamilies": ["triggers", "signals"],
  "strongAnchor": true,
  "recallPolicy": "must",
  "reasons": [
    { "field": "triggers", "term": "browser validation", "weight": 5 },
    { "field": "topics", "term": "frontend", "weight": 2 }
  ]
}
```

`ome match --explain --json` 暴露 reason model、task envelope、project context、
query variants、ranked cards 和 rendered additional context。`diagnostics` 会记录
engine/scorer versions、threshold/limit、input/applicable/evaluated counts、
timeout/completeness、candidate-list truncation、abstain reason、selected ids，以及有上限的 candidate diagnostics。
Candidate rows 区分 `score`、`rawScore`、`rankScore`、`postSelectionScore` 与
`priorityScore`，并包含 evidence families、strong-anchor status、eligibility、selection
和 rejection reason。

Explain 输出也包含 library stack。项目卡命中时会显示 `libraryScope: project`，
渲染出来的完整卡片命令会带 `--scope project`。

## Context Budget

召回引擎会同时返回 matches 和 budgeted context plan。它优先选择简洁、高影响的
lessons，而不是长 card bodies。

渲染后的 hook context 保持中立：

```text
# OME Matched Experience Cards

Matched cards are optional reminders, not required reuse.
- Choice: You may apply a whole card, use only the useful parts, or ignore any match that does not fit the task.
- Before acting: If a card helps, say one short sentence about what OME reminded you to consider, then proceed.
- Final: If any card was used, state how many cards were used and include only the applied `Final link if used` values; omit this line if none.
1. [high risk][must] Browser validation (browser-validation)
   Summary: ...
   Use if: ...
   Ignore if: ...
   Matched by: ...
   Rule: ome experience show browser-validation --section rule
   Final link if used: [Browser validation](<experiences/active/browser-validation.md>)
```

预算会考虑：

- max cards；
- max characters 或 token estimate；
- ranked selected cards；
- duplicate lessons 和 collapsed similar-card hints；
- language preference；
- provider context format。
