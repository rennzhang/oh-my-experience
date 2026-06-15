---
title: Architecture Overview
status: active
---

# Architecture Overview


## Module Boundaries

```text
packages/core            data model, cards, retrospectives, matcher, retrieval, stats, doctor
packages/cli             command parsing and user-facing command flow
packages/adapters/agents/codex
                         Codex hook setup/status adapter
packages/adapters/agents/claude
                         Claude hook setup/status adapter
packages/adapters/sources/codex-sessions
                         Codex local session scan
packages/adapters/sources/spool
                         optional official Spool discovery and source scanning
packages/hook-runtime    hot-path recall runtime for agent hooks
skills/oh-my-experience  agent workflow instructions
templates/               card template
examples/                sample cards and workflows
docs/                    current guides, architecture, and reference
```

## Dependency Rule

Core owns business truth. Other modules may call core, but core must not depend
on CLI, provider adapters, or hook runtime.

```text
CLI -> core/adapters/hook-runtime
hook-runtime -> core
provider adapters -> core schemas
skill -> CLI
```

`packages/core/src/matcher.ts` owns prompt decomposition, tokenization, query
variants, and query plans. `packages/core/src/retrieval.ts` owns active-card
index reads, scoring, diversification, and context rendering. This split keeps
the user-prompt understanding layer independently testable and tunable.

The package is authored in TypeScript and published as built ESM under `dist/`.
The npm package does not include the Bun standalone binary by default; Bun
binary output is generated separately under `build/ome` for release-asset
validation.

## Runtime Rule

Hook runtime must be fast and fail-open:

- no LLM call;
- no network call;
- no session scan;
- no active card writes;
- strict timeout;
- bounded additional context.

Slow work belongs in reflect, curation, eval, or maintenance commands.

## Storage Rule

All persistent writes must go through core storage helpers. Provider adapters
and hooks must not directly modify card files.

## Provider Rule

Provider differences belong at the edge:

- hook input parsing;
- hook output shape;
- hook setup/status paths;
- session scan formats.

Retrieval, scoring, context budgeting, stats, and card lifecycle must remain
provider-neutral.
