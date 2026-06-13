---
title: Global And Project Libraries
status: active
---

# Global And Project Libraries

OME supports two library layers:

- the global library configured by `dataDir`;
- an optional project library at `<project-root>/.oh-my-experience/`.

The global library is your personal memory. It should hold lessons that are
useful across projects, or lessons scoped by project metadata without adding
files to a repository.

The project library is part of a repository. It should hold lessons that only
make sense inside that project: local release rules, test gates, review
standards, migration traps, or team conventions that should move with the
codebase.

## Initialize A Project Library

Run this from inside the project:

```bash
ome project init
```

OME creates:

```text
<project-root>/.oh-my-experience/
  README.md
  .gitignore
  experiences/
    draft/
    active/
    archived/
```

The default `.gitignore` excludes runtime files such as `events.jsonl`,
`retrospectives/`, and `indexes/`. Commit active project cards when you want
the project to carry its own reviewed working rules.

Check the detected project and library state:

```bash
ome project status
```

## Write Project Cards

Use the same review lifecycle, with `--scope project`:

```bash
ome reflect start --scope project --focus "release validation"
ome reflect candidates RUN_ID --scope project --from-file candidates.json
ome reflect decide RUN_ID CANDIDATE_ID --scope project --action approve
ome reflect apply RUN_ID --scope project
ome experience promote DRAFT_ID --scope project
```

Do not hand-write files into `experiences/active/` unless you are doing a
manual migration and have already reviewed the card. The CLI keeps the
candidate, draft, active, and archive lifecycle visible.

## How Recall Works

At prompt time OME uses the current working directory:

1. Detect the project root from markers such as `.git`, package files,
   `AGENTS.md`, `CLAUDE.md`, or `.oh-my-experience`.
2. Load active cards from the global `dataDir`.
3. If `<project-root>/.oh-my-experience/` exists, load its active project cards.
4. Filter cards whose `scope` does not fit the detected project.
5. Score all remaining cards together.
6. Collapse near-duplicates; when the same lesson appears in both layers, the
   project card is preferred.
7. Render the context block. Project cards use:

```bash
ome experience show CARD_ID --scope project --section rule
```

This is similar to how agent rule files usually work: there can be a global
layer and a project layer, and the project layer is the closer context. OME is
still not a rules file. `AGENTS.md`, `CLAUDE.md`, and other rules files are
good for stable instructions the agent should always read. OME cards are
conditional reminders: they should appear only when the current task matches.

## Non-Intrusive Project Recall

You do not have to add `.oh-my-experience/` to every repository. A global card
can still be scoped to a project with `scope.level: project` or
`project-family`. That keeps all storage in your global `dataDir`, while recall
still uses the current project context before scoring.

To find the project key OME will use:

```bash
ome project status --cwd /path/to/project --json
```

For a manual global card, keep the normal global lifecycle and set project
scope on the candidate:

```bash
ome reflect add RUN_ID \
  --title "Release checklist for this repo" \
  --summary "Use this repository's release gate before publishing." \
  --rule "Run the project release validation before claiming readiness." \
  --triggers "release validation" \
  --scope-level project \
  --project-key "github.com/example/repo" \
  --module-path "."
```

Retrospective candidate files can set the same `scope` object directly.
These cards stay in the global `dataDir`, but OME filters them by the detected
project before scoring.

Use the physical project library when the lesson should travel with the
repository. Use global project-scoped cards when the lesson is personal, private,
or not ready to become part of the repo.
