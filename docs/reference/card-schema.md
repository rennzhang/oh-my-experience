---
title: Experience Card Schema
status: active
---

# Experience Card Schema


## Required Fields

```yaml
id: browser-validation
status: active
title: Browser Validation
category: 测试验收
triggers:
  - browser validation
  - UI verification
aliases:
  zh-CN:
    - 浏览器验证
  en:
    - browser smoke
negative_triggers:
  - pure backend migration
topics:
  - frontend
  - test
applicability:
  level: project
  projectKey: github.com/example/app
  modulePath: apps/web
  confidence: high
  rationale: "Only applies to this front-end module."
language: en
recall_policy: must
risk: high
confidence: medium
stale_after: null
sources:
  - retrospective:2026-05-28-example
origin:
  adapter: codex-sessions
  agent: codex
  model: null
  sessionId: 2026-05-28-example
  projectKey: github.com/example/app
  createdBy: retrospective
source_refs:
  - type: retrospective
    ref: 2026-05-28-example
created: 2026-05-28T00:00:00.000Z
updated: 2026-05-28T00:00:00.000Z
```

## Body Sections

Recommended sections:

- Problem
- Anti-pattern
- Correct approach
- Recall conditions
- Negative recall conditions
- Evidence
- Revision Notes

## Language

Cards may be written in English or Chinese. Cross-language recall should be
handled through triggers and aliases, not hot-path translation.

## Lifecycle

Reflect candidates are not cards yet. Only `active` cards are recallable.

```text
candidate -> draft -> active -> archived
```

Field naming in Markdown frontmatter should use snake_case. Runtime APIs may
use camelCase internally, but reference docs should present the persisted
frontmatter form.

## Categories

`category` is first-class metadata, not a `sources` convention. Reflect
candidates should include a category when generated; if omitted, the CLI infers
one from title, topics, triggers, and lesson text. Users may create categories
with the CLI and override the candidate category before applying a reflect run.

## Provenance

`origin` records where the lesson came from: the source adapter, agent family,
optional model, session id, project key, and whether the card was created by a
retrospective, starter lesson, import, or manual entry. `source_refs` stores
structured references to sessions, turns, files, retrospectives, starter
lessons, or manual sources. `sources` remains a short human-readable evidence
list for display.

## Topics And Applicability

`topics` describe what the card is about, such as `frontend`, `git`, `runtime`,
or `review`. They are used for matching and filtering.

`applicability` describes where the card may be recalled:

- `global`: usable in any project.
- `project`: recall only when the current project key matches.
- `project-family`: recall when the project family matches, such as the same
  GitHub owner.

The hook uses this metadata at prompt time to keep broad cards broad and scoped
cards scoped.
