---
title: Retrieval API
status: active
---

# Retrieval API


## Input

```json
{
  "prompt": "Fix UI and validate in browser",
  "provider": "codex",
  "cwd": "/path/to/project",
  "limit": 8,
  "budget": {
    "maxChars": 6000
  }
}
```

## Task Envelope

```json
{
  "surfaces": ["frontend", "test"],
  "risks": ["validation"],
  "operations": ["review"],
  "constraints": ["必须", "真实"],
  "files": ["packages/cli/src/main.ts"],
  "commands": ["npm test"],
  "keywords": ["UI", "browser", "validate"],
  "language": "mixed",
  "segments": ["Fix UI and validate in browser"]
}
```

## Match Output

```json
{
  "cardId": "browser-validation",
  "score": 12.4,
  "recall_policy": "must",
  "reasons": [
    { "field": "triggers", "term": "browser validation", "weight": 5 },
    { "field": "topics", "term": "frontend", "weight": 2 }
  ]
}
```

Cards whose `applicability` does not match the detected `projectContext` are
filtered out before scoring.

The CLI explain surface wraps the same data with envelope and query diagnostics:

```bash
ome match "Fix UI and validate in browser" --explain --json
```

```json
{
  "ok": true,
  "queryVariants": ["Fix UI and validate in browser", "ui test browser validate"],
  "projectContext": {
    "projectKey": "github.com/example/app",
    "modulePath": "apps/web",
    "source": "git"
  },
  "matches": [
    {
      "rank": 1,
      "id": "browser-validation",
      "score": 12.4,
      "reasons": [],
      "similarCards": [
        {
          "id": "browser-validation-overlap",
          "title": "Browser smoke checklist",
          "score": 82,
          "reason": "标题、触发词或主题高度接近"
        }
      ]
    }
  ],
  "additionalContext": "Potentially relevant OME lessons. Use only when directly applicable; ignore if unrelated or conflicting.\\nKeyword matches can be ambiguous; compare each lesson's workflow meaning, use cases, and ignore cases against the current request before applying it.\\n..."
}
```

`similarCards` lists near-duplicates that were omitted from the ranked output.
The renderer can mention them as omitted related cards, but it should not inject
duplicate full lessons.

`additionalContext` uses a fixed English frame. Card body content stays in the
language stored on the card.

## Budgeted Context

```json
{
  "cards": ["browser-validation"],
  "additionalContext": "...",
  "truncated": false,
  "budgetUsedChars": 1200
}
```
