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

`dataDir` is global storage. Project-level storage, when used, lives beside the
project at `<project-root>/.oh-my-experience/` and is discovered from the
current working directory.

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
is missing. Users can override a candidate category before applying a reflect
run. There is no separate category registry command; new category names travel
on candidates and cards. `sources` remains evidence and provenance only; it
must not be used as a category transport.

## Provenance

Active cards stay focused on recall and usage. They do not carry raw source
metadata, dates, `origin`, or `sourceRefs` as core card fields. Provenance lives
in retrospective runs, operation logs, backups, and source indexes. The matcher
uses active-card criteria, recall metadata, scope, and status.

## Source Index

Source scans do not copy full session transcripts into OME. They write compact
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

## Project Library Layout

A project library uses the same reviewed-card lifecycle folders:

```text
<project-root>/.oh-my-experience/
  README.md
  .gitignore
  experiences/
    draft/
    active/
    archived/
```

Project prompt-time recall reads `experiences/active/` directly and annotates
cards as `libraryScope: project`. It does not require a project config file.
Project `events.jsonl`, `retrospectives/`, and `indexes/` are ignored by the
default `.gitignore`; match and hook recall do not write them. Lifecycle
commands with `--scope project` may write project retrospectives and events
because the user explicitly chose to create or manage project cards.

## Topics And Scope

Experiences separate subject matching from project fit:

- `topics`: the technical or workflow surfaces a card belongs to, such as
  `frontend`, `git`, `runtime`, `review`, or `deployment`.
- `scope`: where the card can be recalled, with `global`, `project`, and
  `project-family` levels.

At prompt time the runtime detects the current project context from the working
directory, package metadata, and Git remote, then filters scoped cards before
scoring.
