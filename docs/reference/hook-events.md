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

Payload:

```json
{
  "event": "prompt.submit",
  "provider": "codex",
  "sessionId": "optional-session-id",
  "turnId": "optional-turn-id",
  "cwd": "/path/to/project",
  "prompt": "raw prompt if provided by hook input",
  "promptHash": "sha256",
  "timestamp": "2026-05-28T00:00:00.000Z"
}
```

Required fields after normalization:

- `event`
- `provider`
- `promptHash`
- `timestamp`

`prompt` is available only inside the runtime pipeline. It must not be written
to the hook log unless raw prompt storage is explicitly enabled.
