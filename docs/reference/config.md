---
title: Config Reference
status: active
---

# Config Reference


## Format

Writable config is JSON.

Default path:

```text
<dataDir>/config.json
```

## Suggested Shape

```json
{
  "dataDir": "/Users/example/.oh-my-experience",
  "privacy": {
    "saveRawPrompt": false
  },
  "retrieval": {
    "maxCards": 4,
    "minScore": 40,
    "additionalContextMaxChars": 6000,
    "hookTimeoutMs": 4000,
    "baseline": {
      "enabled": true,
      "maxChars": 800,
      "setMaxChars": 500,
      "refreshEveryTurns": 5
    }
  },
  "hooks": {
    "providers": {
      "codex": {
        "enabled": false
      },
      "claude": {
        "enabled": false
      }
    }
  },
  "sessions": {
    "store": "pointer",
    "retainDays": 30,
    "keepAppliedEvidence": true
  }
}
```

`privacy.saveRawPrompt` controls whether hook events include the submitted
prompt as a plaintext `rawPrompt` field. It is disabled by default. When it is
enabled, the raw prompt is written to the same global `events.jsonl` record as
the retrieval telemetry.

`retrieval.baseline` controls the always-on delivery channel (cards with
`baseline: true`):

- `enabled`: turn the channel off without editing cards.
- `maxChars`: total character budget for the rendered baseline cards. The
  framing paragraph is not counted.
- `setMaxChars`: per-library budget, so a long project set cannot evict the
  global set (or the other way around).
- `refreshEveryTurns`: deliver on turn 1, then every N turns per session. The
  counter resets when the delivered set changes, and a host without a session id
  receives the baseline every turn. Counter state lives in
  `state/baseline.json` under the global data directory; a missing or broken
  state file fails open by delivering.

Cards that do not fit the budget are omitted whole. `ome experience baseline`
lists membership and current budget usage.

`sessions.store` controls the retention posture for scanned source sessions:

- `pointer`: prefer source references and lightweight indexes.
- `recent`: reserved retention posture for source-aware workflows.
- `full`: reserved retention posture for explicit offline migration workflows.

Changing the store mode does not create transcript caches. Normal users do not
need a separate storage-maintenance command; use `ome doctor` when diagnosing
library health.

## Editing Rule

Users should prefer:

```bash
ome config preview <key> <value>
ome config set <key> <value>
```

Changing `dataDir` should go through `ome config preview` before applying the
new value. This prevents an accidental command from moving the writable library
location without a visible diff.

Language is intentionally not stored in config. Human CLI output is English
only; documentation localization lives in docs routes such as `/zh/`.

## Global Versus Project Storage

`dataDir` is the global OME library and runtime state location. It controls
global active cards, retrospectives, source indexes, config, and hook events.

Project libraries are not configured here. They are discovered from the current
working directory at `<project-root>/.oh-my-experience/`. This keeps global
storage portable while still letting a repository carry its own active cards
when that is intentional.
