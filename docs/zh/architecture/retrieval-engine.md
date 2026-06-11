---
title: 召回引擎
status: active
---

# 召回引擎


## 产品重要性

召回质量是 Oh My Experience 的核心产品资产。好的 reflect 流程能创建卡片，但好
的召回引擎才能让这些卡片在真实工作中产生作用。

## 管线

```text
matcher.normalize
  -> matcher de-noise and segment
  -> matcher task envelope
  -> matcher query variants
  -> retrieval field-aware lexical index
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
- `packages/core/src/retrieval.ts`：active-card filtering、field-aware scoring、
  policy/risk/confidence/staleness weighting、near-duplicate collapse、
  diversification、reason output、timeout fail-open support 和 budgeted context
  rendering。
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
- 对 title、triggers、topics、category、summary 和 body 做 field weights；
- scoring 前按 applicability 过滤 cards；
- 从 card index 加入 BM25/IDF-like weighting；
- boost `recall_policy: must`；
- 降低 stale 或 low-confidence cards 权重；
- 在同一 applicability scope 内折叠近似重复卡片，避免 hook context 重复同一经验；
- diversify results，避免一个 topic 挤占所有上下文。

当前不需要外部搜索服务。

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
- `keywords`：紧凑的多语言 lexical terms；
- `segments`：用于 query variants 的短 prompt slices。

Hook run 过程中，envelope 可以在内存里包含 raw prompt fragments；但持久日志必须
保存 hash 或派生的非敏感 labels，除非用户明确开启 raw-prompt debug storage。

## 可解释性

每次 match 都应该可解释：

```json
{
  "cardId": "browser-validation",
  "score": 12.4,
  "reasons": [
    { "field": "triggers", "term": "browser validation", "weight": 5 },
    { "field": "topics", "term": "frontend", "weight": 2 }
  ]
}
```

`ome match --explain --json` 暴露 reason model、task envelope、project context、
query variants、ranked cards 和 rendered additional context。

## Context Budget

召回引擎会同时返回 matches 和 budgeted context plan。它优先选择简洁、高影响的
lessons，而不是长 card bodies。

渲染后的 hook context 保持中立：

```text
Potentially relevant OME lessons. Use only when directly applicable; ignore if unrelated or conflicting.
Keyword matches can be ambiguous; compare each lesson's workflow meaning, use cases, and ignore cases against the current request before applying it.
1. [high risk][must] Browser validation (browser-validation)
   Summary: ...
   Use when: ...
   Ignore when: ...
   Why recalled: ...
   Full experience: ome experience show browser-validation --section rule
   If this lesson applies, fetch the full card before acting.
```

预算会考虑：

- max cards；
- max characters 或 token estimate；
- must cards；
- duplicate lessons 和 collapsed similar-card hints；
- language preference；
- provider context format。
