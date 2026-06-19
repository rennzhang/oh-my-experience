---
title: Retrieval Engine
status: active
---

# Retrieval Engine

## Product Importance

Retrieval quality is the core product asset. A good reflect workflow creates
cards, but a good retrieval engine makes those cards matter during real work.

The product optimizes for precise prompt-time candidates, not maximum recall.
A matched card is not a command; it is a compact candidate that the agent must
apply only when the workflow meaning fits the current task.

## Pipeline

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

Implementation:

- `packages/core/src/matcher.ts`: prompt decomposition, language detection,
  command/path extraction, CJK bigram tokenization, code-token splitting, query
  variants, and query plan construction.
- `packages/core/src/retrieval.ts`: active-card filtering, project
  applicability filtering, near-duplicate collapse, diversification, reason
  output, timeout fail-open support, and budgeted context rendering.
- `packages/core/src/retrieval-scoring.ts`: field-aware scoring, intent gates,
  criteria penalties, engine-hint boosts and penalties, and
  policy/risk/confidence weighting.
- `packages/core/src/library-stack.ts`: global/project library discovery and
  active-card loading.
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

Card language affects retrieval quality because `summary`, criteria, triggers,
and topics are part of the lexical recall surface. When a user naturally works
in Chinese, Chinese cards often recall better than translated English cards: the
future prompt is more likely to reuse the same wording, and the card keeps the
same boundaries the user originally corrected.

## Scoring Strategy

The current scoring model is local and deterministic:

- normalize case and punctuation;
- split long prompts into goal, constraints, explicit commands, mentioned files,
  provider surfaces, risk signals, and free keywords;
- keep command/path/code tokens intact;
- use CJK bigrams and phrase matching;
- match ASCII terms with token boundaries, so `github` does not count as
  `git`;
- only treat text as a command when it has command-shaped syntax, for example
  ``git status`` or ``ome match``;
- apply field weights over title, triggers, aliases, topics, category, summary,
  intent modes, and declared engine hints;
- filter cards by scope before scoring;
- let positive `engine_hints` provide strong boosts without becoming the human
  usage standard;
- treat declared routing hints as gates: a card that requires `ui_surface`,
  `goal_execute`, or another known routing signal is not recalled unless that
  signal is present in the prompt;
- let negative `engine_hints` and `criteria.ignore_when` suppress known
  near-miss situations before keyword overlap can win; negative signal
  penalties only apply to cards that declare the related positive signal, so a
  Git-source near miss does not suppress an unrelated browser-validation card;
- load global and project cards into one candidate set when a project library
  exists;
- add BM25/IDF-like weighting from the card index;
- boost cards whose `recall.policy` is `must`;
- dampen stale or low-confidence cards;
- collapse near-duplicate cards within the same scope so the hook
  context does not repeat the same lesson;
- also collapse a starter card into an approved card when they share the same
  explicit rule signal; two approved cards are not collapsed merely because
  they share a broad signal;
- prefer a project card when a near-duplicate exists in both global and project
  layers;
- diversify results so one topic does not crowd out all context.

No external search service is required.

## Current Limits

The current engine is deliberately sparse, local, and deterministic. It does
not claim full semantic understanding. Its largest failure mode is broad
keyword overlap: a card can look relevant because the prompt mentions the same
surface words while the actual workflow is different.

Mitigations are layered:

- keep the default hot-path limit small;
- gate cards with stable routing signals when a trigger word is ambiguous;
- write `use_when` and `ignore_when` as natural language so the agent can make
  the final judgment;
- collapse near-duplicates before rendering context;
- treat documentation/example prompts as near misses for workflow cards such as
  UI validation and `/goal` execution;
- require evals to track precision and over-recall, not only recall.

Recall engine changes are not considered safe unless both the core fixture and
the noisy-library path pass. The noisy-library test keeps one real card among
many broad decoys and verifies that the final context stays precise.

## Engine Hints

OME runs on the agent hot path, so the production retrieval path stays local,
deterministic, and explainable. It uses a two-stage model:

1. Build lexical candidates from card fields and query variants.
2. Apply natural-language criteria, negative criteria, and engine hints before
   final ranking.

Engine hints use prompt-derived signals as heuristics. Positive hints can boost
a card when the prompt strongly resembles the intended workflow. Negative hints
can suppress common false positives. They do not replace the card's natural
language `criteria.use_when` and `criteria.ignore_when`.

Examples:

- A Git safety card uses a worktree/diff operation hint. Mentioning GitHub as a
  research source is not enough.
- A goal execution card uses a goal-execution hint. Documentation text such as
  "show what happens when the user says /goal" is blocked by
  `goal_example_discussion`.
- A Spool handoff card uses `historical_session_lookup` as a strong positive
  hint. Saying that Spool is an optional scan source is not enough.
- A browser validation card uses `ui_surface` as a strong positive hint and is
  suppressed when UI words are explicitly described as noise, documentation,
  examples, or explanation-only content.
- An architecture-quality card uses `architecture_quality` when the user asks
  for cohesive modules, clean logic, low coupling, or root-cause fixes. A
  provider-boundary card should not win merely because the prompt contains the
  words "retrieval scoring".

The design follows the same direction used by modern retrieval systems:
candidate generation should be broad enough, but final context should pass
field-aware filtering, routing, and reranking. OME keeps the current production
path sparse and deterministic; vector or semantic reranking should be added only
after recall evals show a real gap.

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
- `intentModes`: coarse interaction modes such as execute, discuss, or explain;
- `ruleSignals`: prompt-derived signals used by declared engine hints;
- `keywords`: compact multilingual lexical terms;
- `segments`: short prompt slices used for query variants.

Card `rule` and Markdown body content are intentionally not part of the hot
retrieval index. The hook injects a compact card index. If the agent decides a
candidate fits the task, it must fetch the rule with `ome experience show
CARD_ID --section rule`.

The envelope is allowed to contain raw prompt fragments in memory during the
hook run, but persistent logs must store hashes or derived non-sensitive labels
unless raw-prompt debug storage is explicitly enabled.

## Explainability

Every match should be explainable:

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

`ome match --explain --json` exposes the reason model, task envelope, project
context, query variants, ranked cards, and rendered additional context.

The explain output also includes the library stack. A project match shows
`libraryScope: project`, and the rendered full-card command includes
`--scope project`.

## Context Budget

The retrieval engine returns both matches and a budgeted context plan. It
prefers concise, high-impact lessons over long card bodies.

The rendered hook context stays neutral:

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

Budgeting considers:

- max cards;
- max characters or token estimate;
- must cards;
- duplicate lessons and collapsed similar-card hints;
- language preference;
- provider context format.
