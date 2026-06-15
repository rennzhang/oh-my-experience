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
    "hookTimeoutMs": 4000
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

`sessions.store` controls the retention posture for imported source sessions:

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

Language is intentionally not stored in config. Human CLI output is English by
default, and `OME_LANGUAGE=zh-CN` is an explicit override.

## Global Versus Project Storage

`dataDir` is the global OME library and runtime state location. It controls
global active cards, retrospectives, source indexes, config, and hook events.

Project libraries are not configured here. They are discovered from the current
working directory at `<project-root>/.oh-my-experience/`. This keeps global
storage portable while still letting a repository carry its own active cards
when that is intentional.
