---
title: CLI Reference
status: active
---

# CLI Reference

This page lists the public `ome` command surface. The CLI is intentionally
small: setup, recall, retrospective review, library governance, source import,
diagnostics, and uninstall.

## Output Contract

Default output is for humans. It should summarize what changed, what is
healthy, and the next useful command without dumping internal JSON.

Use `--json` when a command is consumed by scripts, hooks, tests, or another
agent. JSON failures still exit non-zero and print a parseable
`{ ok: false, error: { message } }` object.

`ome init` opens the setup flow in an interactive terminal. In CI, shell pipes,
or agent runners, it skips prompts and uses flags/defaults. Use
`ome init --interactive` when you want to force the guided setup flow.

## Common Path

```bash
ome init
ome doctor
ome match "fix UI and validate in browser" --explain
ome uninstall
```

## Setup

```bash
ome init
ome init --interactive
ome init --yes
ome init --provider claude
ome init --provider all
ome init --no-hook
ome init --reset-config
```

`ome init` is safe to run more than once. It installs the OME library, Codex
skill, and selected prompt-time hooks. `--reset-config` restores runtime config
without deleting experiences, source indexes, or retrospective runs.

## Recall

```bash
ome match "<task>"
ome match "<task>" --json
ome match "<task>" --explain
```

Only active cards are recalled. Drafts created by a retrospective do not affect
prompt-time recall until they are promoted.

## Sources

```bash
ome import codex --sessions <dir>
ome source status
ome source connect spool --mode ask
ome source import spool --limit 20
ome import spool --query "browser validation" --source codex
```

Spool is optional. If it is unavailable, Codex session import and local recall
still work.

## Retrospectives

```bash
ome reflect start
ome reflect start --focus "browser validation and delivery gates"
ome reflect list
ome reflect show <run-id>
ome reflect add <run-id> --title "Browser validation" --summary "..." --rule "..."
ome reflect candidates <run-id> --from-file <file>
ome reflect candidates <run-id> --from-file <file> --audit-file <audit.json>
ome reflect decide <run-id> <candidate-id> --action approve --category "Product UI"
ome reflect apply <run-id> --dry-run
ome reflect apply <run-id>
```

`ome reflect start --focus <text>` sets the analysis lens for the run. It does
not narrow source coverage, skip source audit, or lower the evidence bar unless
the user explicitly constrained the source set.

`ome reflect candidates` requires a source audit before it writes candidates.
Use `--allow-incomplete-audit` only for an explicit incomplete review; the
generated worksheet will show the incomplete audit status.

## Experience Library

```bash
ome experience list
ome experience list --status draft
ome experience list --compact --json
ome experience show <card-id>
ome experience show <card-id> --section rule
ome experience promote <card-id>
ome experience archive <card-id> --reason "superseded"
```

The lifecycle stays explicit: `candidate -> draft -> active -> archived`.
`list --json` returns full cards by default for compatibility. Add `--compact`
or `--index` when a script only needs the title index (`id`, `title`,
`status`, `category`, `updatedAt`).

## Evaluation

```bash
ome eval recall --suite <file>
ome eval recall --suite tests/fixtures/eval/core.json --limit 8
ome eval recall --suite my-suite.json --use-current-library
ome eval recall --compare before.json after.json
```

`ome eval recall` is deterministic and does not call an AI model. By default,
it uses fixture cards in a temporary dataDir and never writes evaluation cards
into the user's real library.

## Diagnostics

```bash
ome doctor
ome doctor --repair-index
ome hook status
ome hook run
ome stats
ome version
ome -v
which -a ome
```

`ome doctor` checks dataDir writability, config schema, card lifecycle
integrity, active index consistency, reflect state, hook status, event JSONL
validity, package runtime requirements, and conflicting `ome` binaries on
PATH.

`ome hook run` is the runtime entrypoint used by installed Codex and Claude
hooks. It is kept public so installed hooks can execute it, but normal setup
should happen through `ome init`.

## Config

```bash
ome config get
ome config preview dataDir ~/Obsidian/Oh-My-Experience
ome config set dataDir ~/Obsidian/Oh-My-Experience
```

## Uninstall

```bash
ome uninstall
ome uninstall --provider all
ome uninstall --keep-hooks
ome uninstall --keep-skill
ome uninstall --delete-library --yes
```

`ome uninstall` removes selected prompt-time hooks and the Codex OME skill, but
keeps the experience library by default. Deleting the library is irreversible
and requires `--delete-library --yes` or `--delete-library --force`.

## Language Behavior

Human CLI output is English by default, including on non-English systems. Set
`OME_LANGUAGE=zh-CN` only when you explicitly want Chinese CLI text.

JSON output field names stay stable English.
