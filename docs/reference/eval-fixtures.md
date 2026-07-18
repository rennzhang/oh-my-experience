---
title: Evaluation Fixtures
status: active
---

# Evaluation Fixtures

This page documents the fixture shape used by the implemented recall
evaluation command.

## Recall Suite

```json
{
  "name": "core",
  "experiencesFile": "./core.cards.json",
  "cases": [
    {
      "id": "frontend-browser-validation",
      "difficulty": "easy",
      "prompt": "After fixing the UI, validate it in the browser",
      "expectedCards": ["browser-validation"],
      "allowedExtraCards": [],
      "unexpectedCards": ["git-commit-safety"],
      "tags": ["frontend", "en"]
    },
    {
      "id": "docs-only-no-hit",
      "difficulty": "hard",
      "prompt": "Explain this documentation example; do not execute it",
      "expectedCards": [],
      "expectNoMatches": true,
      "tags": ["negative", "held-out"]
    }
  ]
}
```

Experience fixture file:

```json
{
  "experiences": [
    {
      "id": "browser-validation",
      "status": "active",
      "title": "Browser Validation",
      "category": "Testing",
      "summary": "UI changes need real browser validation, while backend-only or documentation-only work should not recall this card.",
      "criteria": {
        "use_when": ["frontend visible change", "real browser validation"],
        "ignore_when": ["backend-only migration", "documentation-only example"]
      },
      "engine_hints": {
        "positive": ["UI browser validation"],
        "negative": ["backend-only migration"]
      },
      "recall": {
        "policy": "must",
        "risk": "high",
        "confidence": "high",
        "triggers": ["browser validation", "browser check"],
        "topics": ["frontend", "test"]
      },
      "scope": { "level": "global" },
      "rule": "Open the real browser after UI changes."
    }
  ]
}
```

Run:

```bash
ome eval recall --suite <suite.json>
```

The recall suite is deterministic and does not call an AI model.

Default behavior is isolated. Fixture experiences are written to a temporary dataDir.
They do not enter the user's real experience library and cannot affect real
hook behavior.

## Public Fixture Privacy

Fixtures committed to the public repository must be synthetic, minimal
reproductions. Preserve the retrieval boundary being tested, but replace real
prompt wording, user or organization names, local paths, project identifiers,
session IDs, and other traceable values. Raw prompts and full production log
replays belong in a private evaluation suite outside the repository.

## Case Contract

- `expectedCards`: every listed card must be returned.
- `unexpectedCards`: explicitly forbidden results.
- `allowedExtraCards`: the only unlisted results that may be returned without
  failing the case. Omit it or use an empty array for strict precision.
- `expectNoMatches`: requires abstention. Any returned card fails the case.
- `difficulty` and `tags`: reporting metadata; they do not alter retrieval.
- `threshold`: optional per-case threshold override.
- `cwd`: optional project context used to exercise scoped cards.

Unjudged extras fail by default. This prevents a suite from reporting success
merely because it found the expected card while also injecting unrelated
context.

No-hit cases contribute to precision, no-hit, and over-recall behavior. They
are excluded from MRR and nDCG because there is no relevant item to rank.

## Suite Design

The core suite is a regression gate, not sufficient evidence by itself. New
retrieval behavior should also be covered by:

- held-out prompts and cards that do not depend on private or
  product-specific hard signals;
- noisy decoys with believable lexical overlap;
- scale/invariance tests that add irrelevant cards and preserve the bounded
  evidence score and threshold decision;
- boundary cases for exact `ignore_when` rejection, long prompts, mixed intent,
  dynamic top-k, abstention, and global/project duplicate preference.

Compare saved reports with:

```bash
ome eval recall --compare before.json after.json
```

Comparison fails closed on quality-metric regressions and on a case changing
from pass to fail.
