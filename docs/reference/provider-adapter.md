---
title: Provider Adapter
status: active
---

# Provider Adapter

## Purpose

Provider adapters isolate Codex and Claude hook differences from the core
retrieval engine.

## Target Interface

```ts
interface ProviderAdapter {
  provider: string;
  normalizeHookInput(input: unknown): NormalizedHookEvent;
  renderHookOutput(result: RetrievalResult): unknown;
  installHook?(options: HookInstallOptions): HookInstallResult;
  hookStatus?(options: HookStatusOptions): HookStatusResult;
}
```

## Adapter Responsibilities

- install and inspect hook config when supported;
- expose provider-specific hook config paths and trust/status notes;
- map provider-specific install options into the shared hook runtime command;
- never implement retrieval scoring.

## Core Responsibilities

- normalize hook payloads that reach `ome hook run`;
- match cards;
- explain scores;
- budget context;
- write logs;
- compute stats.

## Current Shape

Codex and Claude both use the shared hook runtime and inject additional context
through provider-specific hook output. Adapter code lives under
`packages/adapters/agents/<provider>/` and owns install/status/uninstall.
