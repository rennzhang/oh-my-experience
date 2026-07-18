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

Implementation:

- `packages/core/src/matcher.ts`: prompt decomposition, language detection,
  command/path extraction, CJK bigram tokenization, code-token splitting, query
  variants, and query plan construction.
- `packages/core/src/signal-registry.ts`: the shared compile-time signal
  contract, including generic signals and bundled product-specific packs.
- `packages/core/src/retrieval.ts`: active-card filtering, project
  applicability filtering, dynamic result selection, near-duplicate collapse,
  reason output, timeout fail-open support, and budgeted context rendering.
- `packages/core/src/retrieval-scoring.ts`: BM25F ranking, bounded evidence
  scoring, intent and signal gates, and positive/negative evidence.
- `packages/core/src/retrieval-contract.ts`: retrieval version identifiers and
  shared default limits, thresholds, budgets, and score bounds.
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

## Retrieval v2 Strategy

Retrieval v2 (`sparse-v2`) is local, deterministic, and does not require an
embedding model, vector database, or external search service. It separates two
questions that older sparse scorers often mix together:

1. **Which candidate should rank first?** Field-aware BM25F supplies a sparse
   ranking channel.
2. **Is there enough task evidence to return the card at all?** A bounded
   `0-100` evidence score answers this.

BM25F uses repeated term frequency, a corpus-wide average length for each
field, and standard inverse document frequency. Its raw value is useful for
relative ordering, but it changes when the card library changes. OME therefore
does not compare the raw BM25F value with the configured recall threshold. The
threshold applies to the bounded evidence score, whose scale remains stable
when irrelevant cards are added or removed.

The evidence score combines independent, explainable channels such as exact
trigger phrases, field coverage, technical tokens, CJK lexical evidence, and
registered task signals. Recall policy, risk, and confidence remain card
metadata; they must not turn weak lexical overlap into relevance.

The full strategy is:

- normalize case and punctuation;
- split long prompts into goal, constraints, explicit commands, mentioned
  files, provider surfaces, risk signals, and free keywords;
- retain repeated terms and command/path/code tokens;
- use CJK bigrams and phrase matching;
- match ASCII terms with token boundaries, so `github` does not count as
  `git`;
- only treat text as a command when it has command-shaped syntax, for example
  ``git status`` or ``ome match``;
- apply field weights over title, triggers, aliases, topics, category, summary,
  intent modes, and declared engine hints;
- filter cards by status and scope before scoring;
- resolve positive and negative task signals through one registry rather than
  duplicating routing lists inside the matcher and scorer;
- treat declared routing hints as gates while keeping natural-language
  `criteria.use_when` as the human-readable applicability contract;
- hard-reject a card when the normalized prompt contains an exact
  `criteria.ignore_when` phrase; fuzzy negative evidence may lower confidence,
  but cannot override an exact exclusion;
- load global and project cards into one candidate set when a project library
  exists;
- fuse the BM25F order and evidence order with deterministic reciprocal rank
  fusion, then use only the bounded evidence score for the configured threshold
  and abstention decision;
- collapse near-duplicate cards so the hook context does not repeat the same
  lesson;
- also collapse a starter card into an approved card when they share the same
  explicit rule signal; two approved cards are not collapsed merely because
  they share a broad signal;
- prefer the project-library representative when an equivalent global card is
  present;
- return a dynamic number of cards: every result must independently clear the
  confidence boundary, and a weak tail is not used to fill the configured
  maximum;
- return no cards when evidence is insufficient.

No external search service is required.

## Current Limits

The current engine is deliberately sparse, local, and deterministic. It does
not claim full semantic understanding. Its largest failure mode is broad
keyword overlap: a card can look relevant because the prompt mentions the same
surface words while the actual workflow is different.

Mitigations are layered:

- keep the default hot-path limit small, without forcing the result list to
  reach that limit;
- gate cards with stable routing signals when a trigger word is ambiguous;
- write `use_when` and `ignore_when` as natural language so the agent can make
  the final judgment;
- hard-reject exact `ignore_when` matches;
- apply the threshold to the corpus-size-stable evidence score;
- collapse near-duplicates before rendering context;
- treat documentation/example prompts as near misses for workflow cards such as
  UI validation and `/goal` execution;
- require evals to track precision and over-recall, not only recall.

Recall engine changes are not considered safe unless both the core fixture and
the noisy-library path pass. The noisy-library test keeps one real card among
many broad decoys and verifies that the final context stays precise.

## Signal Registry And Engine Hints

OME runs on the agent hot path, so the production retrieval path stays local,
deterministic, and explainable. It uses a two-stage model:

1. Build lexical candidates from card fields and query variants.
2. Apply natural-language criteria, negative criteria, and engine hints before
   final ranking.

Engine hints use prompt-derived signals as heuristics. Signal definitions live
in one registry. Each definition declares its id, polarity, routing behavior,
patterns, negative targets, and ownership metadata:

- `source: generic` means the signal describes a reusable task shape suitable
  for the open-source core;
- `source: pack` plus a `pack` name means the signal belongs to an optional
  bundled product or workflow pack, such as OME- or agent-goal-specific
  wording.

The current registry is built into the package at compile time. `pack` is
ownership and organization metadata, not a runtime third-party registration
API.

Card `engine_hints` refer to registered ids. Positive hints can provide strong
evidence or a routing gate. Negative hints can suppress only their declared
targets, so one domain's near miss does not penalize unrelated cards. Unknown
signal ids are invalid configuration evidence and should be surfaced by
validation rather than silently becoming a second routing system.

Signals do not replace the card's natural-language `criteria.use_when` and
`criteria.ignore_when`. The latter remain the public applicability contract.

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
field-aware filtering, routing, and confidence selection. OME keeps the current
production path sparse and deterministic. Vector or semantic reranking is an
optional future extension only if held-out evals demonstrate a real gap; it is
not a runtime dependency or a fallback for weak sparse evidence.

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

The envelope may contain raw prompt fragments in memory during the hook run,
but telemetry schema v2 persists only hashes or derived non-sensitive labels.
It never stores the raw prompt.

## Explainability

Every match should be explainable:

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

`ome match --explain --json` exposes the reason model, task envelope, project
context, query variants, ranked cards, and rendered additional context. Its
`diagnostics` object records engine/scorer versions, threshold and limit, input,
applicable, and evaluated counts, timeout/completeness, candidate-list truncation, abstention reason,
selected ids, and bounded candidate diagnostics. Candidate rows distinguish
`score`, `rawScore`, `rankScore`, `postSelectionScore`, and `priorityScore`, and
include evidence families, strong-anchor status, eligibility, selection, and a
rejection reason.

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
- ranked selected cards;
- duplicate lessons and collapsed similar-card hints;
- language preference;
- provider context format.
