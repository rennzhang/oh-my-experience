---
title: Retrieval Engine
status: active
---

# Retrieval Engine

## Product Importance

Retrieval quality is the core product asset. A good reflect workflow creates
cards, but a good retrieval engine makes those cards matter during real work.

## Pipeline

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

Implementation:

- `packages/core/src/matcher.ts`: prompt decomposition, language detection,
  command/path extraction, CJK bigram tokenization, code-token splitting, query
  variants, and query plan construction.
- `packages/core/src/retrieval.ts`: active-card filtering, field-aware scoring,
  policy/risk/confidence/staleness weighting, near-duplicate collapse,
  diversification, reason output, timeout fail-open support, and budgeted
  context rendering.
- `packages/core/src/similarity.ts`: lightweight card/candidate similarity used
  for merge suggestions and duplicate suppression without external embeddings.

## Requirements

The retrieval engine must handle:

- English prompts;
- Chinese prompts;
- mixed Chinese and English;
- command names, file paths, package names, and code symbols;
- long prompts with multiple tasks;
- front-end, back-end, deployment, Git, docs, test, and security surfaces;
- must-level cards that should win over weak lexical similarity;
- very long user prompts where the core intent must be distilled without
  storing raw prompt text in logs.

## Scoring Strategy

The current scoring model is local and deterministic:

- normalize case and punctuation;
- split long prompts into goal, constraints, explicit commands, mentioned files,
  provider surfaces, risk signals, and free keywords;
- keep command/path/code tokens intact;
- use CJK bigrams and phrase matching;
- apply field weights over title, triggers, topics, category, summary, and body;
- filter cards by applicability before scoring;
- add BM25/IDF-like weighting from the card index;
- boost `recall_policy: must`;
- dampen stale or low-confidence cards;
- collapse near-duplicate cards within the same applicability scope so the hook
  context does not repeat the same lesson;
- diversify results so one topic does not crowd out all context.

No external search service is required.

## Prompt Decomposition

User prompts are often long and contain several logical layers. The retrieval
engine does not treat the whole prompt as one bag of text.

Envelope fields:

- `summary`: de-noised short task summary;
- `language`: `zh`, `en`, or `mixed`;
- `taskTypes`: UI, hook, git, review, runtime, test, storage, security, docs,
  package, import, config, server;
- `surfaces`: provider and product surfaces such as Codex, Claude, Spool, CLI,
  hook, dataDir, Obsidian;
- `operations`: action words such as implement, review, validate, install,
  migrate, package, dispatch;
- `files`: file paths or extensions mentioned by the user;
- `commands`: command snippets such as `git push`, `npm test`, `ome match`;
- `constraints`: must/should/not, safety, privacy, validation, no-goal;
- `keywords`: compact multilingual lexical terms;
- `segments`: short prompt slices used for query variants.

The envelope is allowed to contain raw prompt fragments in memory during the
hook run, but persistent logs must store hashes or derived non-sensitive labels
unless raw-prompt debug storage is explicitly enabled.

## Explainability

Every match should be explainable:

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

`ome match --explain --json` exposes the reason model, task envelope, project
context, query variants, ranked cards, and rendered additional context.

## Context Budget

The retrieval engine returns both matches and a budgeted context plan. It
prefers concise, high-impact lessons over long card bodies.

The rendered hook context stays neutral:

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

Budgeting considers:

- max cards;
- max characters or token estimate;
- must cards;
- duplicate lessons and collapsed similar-card hints;
- language preference;
- provider context format.
