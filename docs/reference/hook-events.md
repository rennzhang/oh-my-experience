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
  "event": "prompt.submit",
  "provider": "codex",
  "sessionId": "optional-session-id",
  "turnId": "optional-turn-id",
  "promptHash": "sha256",
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
    "projectKey": "github.com/example/app",
    "modulePath": "apps/web",
    "source": "git"
  },
  "libraries": [
    { "scope": "global", "exists": true, "readable": true, "warningCount": 0 },
    { "scope": "project", "exists": true, "readable": true, "warningCount": 0 }
  ],
  "queryVariants": ["hashed-query-variant"],
  "matchedCards": [
    {
      "id": "browser-validation",
      "score": 80,
      "reasons": [
        { "field": "ruleSignals", "term": "ui_surface", "weight": 14, "kind": "UI, browser, or frontend validation wording" }
      ]
    }
  ],
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
- `promptHash`
- `taskEnvelope`
- `matchedCards`
- `createdAt`

The raw prompt is available only inside the runtime pipeline. Hook logs store a
hash, sanitized task envelope, hashed query variants, and matched-card evidence.
They must not write raw prompt text unless raw prompt storage is explicitly
enabled for debugging.

Hook logs are written to the global `dataDir`. Project libraries are read for
recall, but prompt-time match and hook paths do not write project events.
