---
title: Evaluation Guide
status: active
---

# Evaluation Guide

## Recall Eval

```bash
ome eval recall --suite tests/fixtures/eval/core.json --limit 4 --threshold 40
```

Use this before changing scoring logic. Recall eval is isolated by default:
fixture cards are loaded into a temporary dataDir, not into your real
experience library.

To intentionally evaluate your current active library:

```bash
ome eval recall --suite my-suite.json --use-current-library
```

The first quality gate is not just "did the expected card appear". Track
`precisionAtK`, `overRecallRate`, `noHitRate`, and context size because
over-recall is the easiest way to pollute the hook context. Recall engine
changes should also pass the scale/noise tests in `npm test`, where broad
decoy cards must not crowd into the final context.

## Hook Runtime Validation

```bash
printf '{"prompt":"fix UI and validate in browser"}' | ome hook run --json
npm test
```

Use this before changing provider adapters or hook runtime behavior. Prefer an
isolated dataDir for fixture checks, and use the project test suite for
provider-specific adapter coverage. A valid hook result must include
`hookSpecificOutput.additionalContext`, candidate card links, and the final
usage-disclosure instruction that tells the agent to mention only cards it
actually used.
