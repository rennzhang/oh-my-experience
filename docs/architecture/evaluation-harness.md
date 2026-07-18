---
title: Evaluation Harness
status: active
---

# Evaluation Harness

## Goal

OME has a local evaluation harness for recall quality and hook runtime behavior.
Both implemented eval paths run without calling an AI model.

## Recall Eval

Inputs:

- card fixture set;
- prompt fixture set;
- expected relevant cards;
- explicitly forbidden cards and optional allowed extras.

Isolation rule:

- recall eval defaults to fixture cards in a temporary dataDir;
- fixture cards must never be written into the user's real experience library;
- evaluating the active local library requires explicit `--use-current-library`.

Metrics:

- recall@k;
- precision@k;
- MRR;
- nDCG;
- false-positive rate;
- no-hit rate;
- over-recall rate;
- latency;
- rendered context size.

Metric rules are strict:

- no-hit cases are useful for precision and abstention, but have no relevant
  item to rank and are excluded from the MRR and nDCG denominators;
- a returned card that is not listed in `expectedCards` fails the case by
  default;
- `allowedExtraCards` is the only opt-in for an additional acceptable result;
  `unexpectedCards` remains an explicit forbidden set;
- report comparison fails closed when a quality metric regresses or a
  previously passing case becomes failing.

Commands:

```bash
ome eval recall --suite <suite.json>
ome eval recall --suite <suite.json> --limit 4 --threshold 40 --min-pass-rate 1 --min-recall 1 --min-precision 1 --max-over-recall 0
ome eval recall --compare before.json after.json
```

`ome eval recall` reads the suite shape in
[Evaluation Fixtures](../reference/eval-fixtures.md), seeds an isolated fixture
dataDir, and reports quality metrics without mutating the user's runtime hook
configuration.

Recall changes must pass more than the co-designed core suite:

- a held-out suite whose wording and cards are not coupled to private or
  product-specific routing signals;
- noisy-library cases that put a relevant card among broad decoys;
- scale/invariance tests that add irrelevant cards and verify that the bounded
  evidence score and threshold decision do not drift with corpus size;
- boundary cases for exact negative criteria, abstention, dynamic result count,
  mixed explain-and-execute prompts, long prompts, and project/global duplicate
  preference.

## Hook Eval

Inputs:

- Codex hook stdin fixture;
- Claude hook stdin fixture;
- dataDir fixture.

Checks:

- normalized event is correct;
- output schema is provider-correct;
- raw prompt is not stored by default;
- additional context is present when a fixture card matches;
- candidate-card links are present and the final usage-disclosure instruction is clear;
- hook logs include recall evidence and selection-stage diagnostics.

Runtime validation path:

```bash
printf '{"prompt":"fix UI and validate in browser"}' | ome hook run --json
npm test
```

Hook runtime coverage should use isolated fixture data, real `ome hook run`,
and provider adapter tests. It must check output schema, matched-card evidence,
candidate-card links, final usage-disclosure guidance, prompt hashing, and raw-prompt privacy without
installing hooks or touching the user's configured dataDir.

Telemetry schema v2 records engine/scorer versions, card-set and configuration
fingerprints, matched and rendered card ids, context truncation, and the
selection stage. It never persists the raw prompt. `deliveryStatus` is
`unknown` because OME can prove that it rendered context, but cannot prove that
the host or model consumed it. The deprecated `injected` compatibility field
therefore means rendered context only, not delivery.
