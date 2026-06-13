---
title: Hook Runtime
status: active
---

# Hook Runtime

## Goal

Support Codex and Claude prompt-time recall through one provider-neutral runtime.

The shared flow:

```text
provider hook input
  -> provider adapter
  -> normalized prompt.submit event
  -> retrieval engine
  -> context budget
  -> provider output adapter
  -> hook log
```

## Normalized Event

The installed hook path currently uses `prompt.submit`. The canonical payload
schema lives in [Hook Events](../reference/hook-events.md).

## Codex Adapter

Codex hook input maps to `prompt.submit`.

The output adapter returns the Codex-specific additional context structure.

## Claude Adapter

Claude `UserPromptSubmit` maps to `prompt.submit` and returns Claude hook JSON
with `additionalContext`.

Install path:

```bash
ome init --provider claude
```

At prompt time, the shared runtime detects the current working directory,
derives a project context, and applies each card's `scope` before scoring.

If a project library exists at `<project-root>/.oh-my-experience/`, the runtime
loads it together with the global `dataDir` library. The read path is fail-open:
if the project library is missing or unreadable, global recall still works.

## Hot-Path Constraints

Hook runtime must:

- fail open on internal errors;
- avoid LLM, network, and long-running import work;
- avoid writing active cards;
- avoid storing raw prompt by default;
- record structured events for stats and debugging;
- record sanitized project context for stats and debugging;
- write hook events to the global `dataDir`, not to the project library;
- finish under `retrieval.hookTimeoutMs` so large libraries fail open instead
  of blocking the agent prompt path.

## Logging

Hook events should store:

- event type;
- provider;
- prompt hash;
- task envelope;
- matched card ids;
- injected or not;
- latency;
- warning or timeout class.

Raw prompt storage is opt-in only.
