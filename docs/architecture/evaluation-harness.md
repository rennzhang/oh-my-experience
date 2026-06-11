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
- expected non-relevant cards.

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
- injected context size.

Commands:

```bash
ome eval recall --suite <suite.json>
ome eval recall --suite <suite.json> --limit 8 --threshold 40 --min-pass-rate 1 --min-recall 1 --min-precision 1 --max-over-recall 0
ome eval recall --compare before.json after.json
```

`ome eval recall` reads the suite shape in
[Evaluation Fixtures](../reference/eval-fixtures.md), seeds an isolated fixture
dataDir, and reports quality metrics without mutating the user's runtime hook
configuration.

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
- hook logs include recall evidence.

Smoke path:

```bash
printf '{"prompt":"fix UI and validate in browser"}' | ome hook run --json
npm test
```

Hook runtime coverage should use isolated fixture data, real `ome hook run`,
and provider adapter tests. It must check output schema, matched-card evidence,
prompt hashing, and raw-prompt privacy without installing hooks or touching the
user's configured dataDir.
