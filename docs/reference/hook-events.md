---
title: Hook Events
status: active
---

# Hook Events

This page documents the hook event currently wired into the installed OME hook
runtime.

## Normalized Event Names

```text
prompt.submit
```

## Prompt Submit

Used for prompt-time recall when a user submits a prompt.

Provider mappings:

| Provider | Native event | Normalized event |
| --- | --- | --- |
| Codex | Codex hook input | `prompt.submit` |
| Claude | `UserPromptSubmit` | `prompt.submit` |

Hook log event:

```json
{
  "id": "uuid",
  "kind": "hook",
  "schemaVersion": 2,
  "engineVersion": "sparse-v2",
  "scorerVersion": "bm25f-evidence-v2",
  "libraryFingerprint": "sha256",
  "cardSetFingerprint": "sha256",
  "globalCardSetFingerprint": "sha256",
  "configFingerprint": "sha256",
  "event": "prompt.submit",
  "provider": "codex",
  "sessionId": "optional-session-id",
  "turnId": "optional-turn-id",
  "promptHash": "sha256",
  "rawPrompt": "present only when privacy.saveRawPrompt is true",
  "taskEnvelope": {
    "summaryHash": "sha256",
    "taskTypes": ["ui"],
    "files": ["hashed-file-token"],
    "commands": ["hashed-command-token"],
    "risks": ["hashed-risk-token"],
    "surfaces": ["hashed-surface-token"],
    "keywords": ["hashed-keyword-token"],
    "length": 30
  },
  "projectContext": {
    "hasProject": true,
    "projectKeyHash": "sha256",
    "modulePathHash": "sha256",
    "source": "git"
  },
  "libraries": [
    { "scope": "global", "exists": true, "readable": true, "warningCount": 0 },
    { "scope": "project", "exists": true, "readable": true, "warningCount": 0 }
  ],
  "queryVariants": ["hashed-query-variant"],
  "candidateStage": {
    "available": true,
    "complete": true,
    "count": 1,
    "truncated": false,
    "unavailableReason": null,
    "cards": [
      {
        "id": "browser-validation",
        "libraryScope": "project",
        "score": 80,
        "rawScore": 12.7,
        "rankScore": 32.1,
        "postSelectionScore": 80,
        "priorityScore": 7,
        "evidenceFamilies": ["triggers", "signals"],
        "strongAnchor": true,
        "eligible": true,
        "selected": true,
        "rejectionReason": null,
        "reasons": []
      }
    ]
  },
  "selectionStage": {
    "selectedCardIds": ["browser-validation"],
    "cards": [
      {
        "id": "browser-validation",
        "libraryScope": "project",
        "score": 80,
        "rawScore": 12.7,
        "rankScore": 32.1,
        "postSelectionScore": 80,
        "priorityScore": 7,
        "evidenceFamilies": ["triggers", "signals"],
        "strongAnchor": true,
        "eligible": true,
        "selected": true,
        "rejectionReason": null,
        "reasons": [
          { "field": "ruleSignals", "term": "ui_surface", "weight": 48, "kind": "UI, frontend, or browser surface wording" }
        ]
      }
    ]
  },
  "matchedCards": [{ "id": "browser-validation", "libraryScope": "project", "score": 80 }],
  "matched": true,
  "renderedCardIds": ["browser-validation"],
  "rendered": true,
  "contextTruncated": false,
  "deliveryStatus": "unknown",
  "injected": true,
  "durationMs": 42,
  "budgetUsedChars": 860,
  "error": null,
  "createdAt": "2026-05-28T00:00:00.000Z"
}
```

Required fields after normalization:

- `event`
- `provider`
- `schemaVersion`
- `engineVersion`
- `scorerVersion`
- `promptHash`
- `taskEnvelope`
- `candidateStage`
- `selectionStage`
- `renderedCardIds`
- `deliveryStatus`
- `createdAt`

Hook logs always store a prompt hash, sanitized task envelope, hashed query
variants, and matched-card evidence. When `privacy.saveRawPrompt` is explicitly
enabled, the same event also stores the submitted prompt as plaintext in
`rawPrompt`. The field is absent by default.

Schema v2 separates stages and avoids claiming more than the runtime can know:

- `matched` and `selectionStage` mean that retrieval selected cards;
- `rendered` and `renderedCardIds` mean those cards were included in the
  generated additional context;
- `contextTruncated` means selected cards were omitted by the context budget;
- `candidateStage.count` is the evaluated total, while `truncated` says whether the bounded `cards` list omitted rows;
- `deliveryStatus` is `unknown`, because OME cannot observe whether the host or
  model consumed the generated context;
- `injected` is a deprecated compatibility alias for `rendered`; it does not
  prove delivery;
- candidate diagnostics may be marked unavailable or incomplete when the
  runtime cannot collect the full candidate stage within the hook budget.

Engine/scorer versions and card-set/configuration fingerprints allow stats to
separate the current comparable snapshot from cumulative historical events.
The comparable `current` view is intentionally global-library only: it filters
on the current global card-set and retrieval configuration and excludes project
cards from its match/render counts. `cumulative` retains every schema generation
and project-card event for historical analysis. Compatibility fields such as
`coverageRate` and `renderRate` mirror the global `current` view.

Hook logs are written to the global `dataDir`. Project libraries are read for
recall, but prompt-time match and hook paths do not write project events.
