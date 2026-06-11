---
title: Data Model
status: active
---

# Data Model

## Data Directory

Default data directory:

```text
~/.oh-my-experience
```

Users can point the data directory to another local path, including an Obsidian
subfolder. OME should use a dedicated subfolder instead of writing into an
entire vault root.

## Directory Layout

```text
config.json
experiences/
  draft/
  active/
  archived/
retrospectives/
indexes/
  experiences.json
  categories.json
  sources.json
events.jsonl
```

The data directory intentionally has one visible storage model. `experiences/`
contains reviewed lesson files, `retrospectives/` contains review workspaces,
`indexes/` contains rebuildable lookup files, and `events.jsonl` is the optional
append-only event stream for hook, operation, stats, and eval events.

Runtime locks and safety backups are intentionally outside the data directory
under the operating-system temp directory. They are implementation mechanics,
not library assets.

## Experience Lifecycle

```text
candidate -> draft -> active -> archived
```

- `candidate`: generated lesson proposed by a reflect run.
- `draft`: user accepted the candidate into the library but it is not yet
  recalled.
- `active`: recallable experience.
- `archived`: retained for history but excluded from recall.

Only active experiences are returned by prompt-time recall.

## Categories

Categories are first-class metadata on both candidates and experiences:

```text
retrospective extraction -> candidate.category -> draft.category -> active.category
```

The CLI accepts `category` on reflect candidates and infers one when the field
is missing. Users can create categories and override a candidate category before
applying a reflect run. `sources` remains evidence and provenance only; it must
not be used as a category transport.

## Provenance

Experiences and candidates carry both human-readable and structured provenance:

- `sources`: compact display/evidence strings.
- `origin`: source adapter, agent family, optional model/session/project, and
  whether the item came from a reflect run, starter lesson, import, or manual
  entry.
- `sourceRefs`: structured references to sessions, turns, files,
  retrospectives, starter lessons, or manual sources.

The matcher currently treats provenance as evidence and diagnostics. Recall
eligibility is controlled by card status and applicability.

## Source Index

Source imports do not copy full session transcripts into OME. They write compact
source pointers to `indexes/sources.json`:

- `id`
- `provider`
- `sourcePath`
- `startedAt`
- `cwd`
- `summary`
- `metadataHash`
- `messageCount`

The source index must not embed full message bodies. Core maintenance rebuilds
it and strips any accidental `messages` payloads.

The runtime config includes a session retention mode:

```json
{
  "sessions": {
    "store": "pointer",
    "retainDays": 30,
    "keepAppliedEvidence": true
  }
}
```

- `pointer`: default posture. Keep source pointers and compact metadata.
- `recent`: reserved retention posture for source-aware workflows.
- `full`: reserved retention posture for explicit offline migration workflows.

Source index rewrite is an internal maintenance operation. There is no
materialized session directory in the canonical layout.

Prompt-time recall must not depend on session bodies. It depends on active
experiences and `indexes/experiences.json`.

## Topics And Applicability

Experiences separate subject matching from project fit:

- `topics`: the technical or workflow surfaces a card belongs to, such as
  `frontend`, `git`, `runtime`, `review`, or `deployment`.
- `applicability`: where the card can be recalled, with `global`, `project`,
  and `project-family` levels.

At prompt time the runtime detects the current project context from the working
directory, package metadata, and Git remote, then filters scoped cards before
scoring.
