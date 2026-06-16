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
  -> matcher query variants
  -> library stack: global dataDir + optional project library
  -> retrieval field-aware lexical index
  -> retrieval criteria and engine-hint filtering
  -> retrieval BM25-like sparse scoring
  -> retrieval rule boosts and penalties
  -> retrieval collapse near-duplicates
  -> retrieval diversify
  -> retrieval context budget
  -> retrieval explain
```

当前实现：

- `packages/core/src/matcher.ts`：prompt decomposition、language detection、
  command/path extraction、CJK bigram tokenization、code-token splitting、query
  variants 和 query plan construction。
- `packages/core/src/retrieval.ts`：active-card filtering、project
  applicability filtering、near-duplicate collapse、diversification、reason
  output、timeout fail-open support 和 budgeted context rendering。
- `packages/core/src/retrieval-scoring.ts`：field-aware scoring、intent gates、
  criteria penalties、engine-hint boosts and penalties，以及
  policy/risk/confidence weighting。
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

## 评分策略

当前评分模型保持本地和确定性：

- normalize case 和 punctuation；
- 把长提示词拆成 goal、constraints、explicit commands、mentioned files、
  provider surfaces、risk signals 和 free keywords；
- 保留 command/path/code tokens；
- 使用 CJK bigrams 和 phrase matching；
- ASCII 词按 token 边界匹配，因此 `github` 不会算作 `git`；
- 只有形态像命令的文本才进入 `commands`，例如 `git status` 或 `ome match`；
- 对 title、triggers、aliases、topics、category、summary、intent modes 和
  显式声明的 engine hints 做 field weights；
- scoring 前按 scope 过滤 cards；
- 正向 `engine_hints` 提供强加权，但不替代给人看的使用标准；
- 声明了 routing hint 的卡必须先命中对应任务形态：例如需要 `ui_surface`、
  `goal_execute` 或其它已知 routing signal 的卡，prompt 没有这个信号就不召回；
- 负向 `engine_hints` 和 `criteria.ignore_when` 会压住常见误触发，避免
  关键词重合赢过真实意图；负向 signal 只惩罚声明了相关正向 signal 的卡，例如
  Git 资料源误触发不会压住无关的浏览器验收卡；
- 存在项目库时，把全局卡和项目卡放进同一候选集合；
- 从 card index 加入 BM25/IDF-like weighting；
- boost `recall.policy` 为 `must` 的 cards；
- 降低 stale 或 low-confidence cards 权重；
- 在同一 scope 内折叠近似重复卡片，避免 hook context 重复同一经验；
- 当 starter 卡和 reviewed 卡共享同一个显式 rule signal 时，可以把 starter 折叠进
  reviewed 卡；两张 reviewed 卡不会只因为共享一个宽泛 signal 就被折叠；
- 同一条经验同时存在于全局层和项目层时，优先展示项目卡；
- diversify results，避免一个 topic 挤占所有上下文。

当前不需要外部搜索服务。

## 当前限制

当前引擎刻意保持 sparse、本地和确定性。它不声称自己能完整理解语义。最大的失败
模式是宽泛关键词重合：prompt 提到同样的表层词，但真实工作流并不相同，卡片仍然
看起来相关。

缓解方式分层处理：

- hot path 默认只给少量卡片；
- 触发词有歧义时，用稳定 routing signal 做 gate；
- `use_when` 和 `ignore_when` 用自然语言写，交给 Agent 做最后判断；
- 渲染上下文前折叠近似重复卡；
- 把文档/示例 prompt 视为 workflow 卡的 near miss，例如 UI 验证和 `/goal` 执行；
- eval 同时检查 precision 和 over-recall，而不是只看 recall。

召回引擎改动必须同时通过 core fixture 和 noisy-library 路径。noisy-library 测试会
把一张真实卡放在大量泛词干扰卡里，验证最终上下文仍然精确。

## Engine Hints

OME 运行在 Agent 热路径上，所以生产召回路径保持本地、确定性和可解释。它分成两
层：

1. 先用卡片字段和 query variants 生成候选。
2. 再用自然语言标准、负向标准和 engine hints 过滤并排序。

Engine hints 使用从 prompt 派生出的信号作为启发式。正向 hint 可以在 prompt 强烈像目标工作流时加权；负向 hint 可以压住常见误召回。它们不替代卡片里的自然语言 `criteria.use_when` 和 `criteria.ignore_when`。

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

这个方向和现代检索系统一致：候选可以稍宽，但进入上下文前必须经过字段过滤、意图路由和重排。OME 当前生产路径仍保持 sparse 和确定性；只有当 recall eval 证明存在真实缺口时，才引入 vector 或 semantic reranking。

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

Hook run 过程中，envelope 可以在内存里包含 raw prompt fragments；但持久日志必须
保存 hash 或派生的非敏感 labels，除非用户明确开启 raw-prompt debug storage。

## 可解释性

每次 match 都应该可解释：

```json
{
  "id": "browser-validation",
  "title": "Browser Validation",
  "score": 12.4,
  "recallPolicy": "must",
  "reasons": [
    { "field": "triggers", "term": "browser validation", "weight": 5 },
    { "field": "topics", "term": "frontend", "weight": 2 }
  ]
}
```

`ome match --explain --json` 暴露 reason model、task envelope、project context、
query variants、ranked cards 和 rendered additional context。

Explain 输出也包含 library stack。项目卡命中时会显示 `libraryScope: project`，
渲染出来的完整卡片命令会带 `--scope project`。

## Context Budget

召回引擎会同时返回 matches 和 budgeted context plan。它优先选择简洁、高影响的
lessons，而不是长 card bodies。

渲染后的 hook context 保持中立：

```text
OME matched experience cards. Matched does not mean used: apply a card only when its workflow meaning fits the current task; ignore unrelated or conflicting cards.
Before acting, if any matched card is applicable, state in one short sentence what OME reminded you to consider, then proceed normally. For OME retrospective or source-scan tasks, matched subject-area cards are not source evidence; record them only as active-card overlap unless you applied a process/governance card. Final report: if you actually used any card, add one final line `**本次使用 N条 OME 经验卡：** ...` using only the `Final link if used` values for cards you applied; omit the line if none applied.
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
- must cards；
- duplicate lessons 和 collapsed similar-card hints；
- language preference；
- provider context format。
