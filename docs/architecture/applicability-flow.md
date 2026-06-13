---
title: Scope Flow
status: active
---

# Scope Flow


`scope` controls where a card is allowed to appear. It lets global lessons stay
broad while project-specific lessons stay scoped.

## End-To-End Path

```text
session/import/retrospective
  -> candidate.scope
  -> reflect decision can override scope
  -> draft preserves scope
  -> active index stores scope
  -> hook runtime detects projectContext
  -> retrieval filters by scope
  -> scoring and context rendering
```

## Project Context

The runtime derives project context from the current working directory:

- repository root and Git remote when available;
- package metadata when no Git remote is available;
- module path relative to the project root;
- sanitized hashes in hook logs, not raw local paths.

## Levels

- `global`: usable everywhere.
- `project`: usable only when `projectKey` matches the current project.
- `project-family`: usable when the project family matches, such as the same
  GitHub owner or organization.

## Product Rule

Do not ask users to classify every lesson by hand during setup. `init` handles
setup; reflect candidates carry inferred scope, and `ome reflect decide` can
correct it before draft creation.

Manual card editing stays secondary. The reflect guide should infer scope from
source context first; users only correct it when the inferred scope is wrong.
