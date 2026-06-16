---
title: CLI Reference
status: active
---

# CLI Reference

This page lists the public `ome` command surface. The CLI is intentionally
small: setup, recall, retrospective review, library governance, source scan,
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

`ome init` is safe to run more than once. It installs the OME library and, for
each selected agent, the prompt-time hook plus bundled OME skill. `--no-hook`
initializes or updates the library only; it does not install hooks or skills.
`--reset-config` restores runtime config without deleting experiences, source
indexes, or retrospective runs.

## Recall

```bash
ome match "<task>"
ome match "<task>" --json
ome match "<task>" --explain
ome match "<task>" --cwd /path/to/project --explain
```

`ome match` is for hooks, agents, evaluation, and troubleshooting. Normal
first-run proof should be a real agent task where the installed hook recalls
cards automatically; users should not need to run `match` by hand.

Only active cards are recalled. Drafts created by a retrospective do not affect
prompt-time recall until they are promoted.

When the current working directory is inside a project, recall reads the global
`dataDir` and the optional project library at
`<project-root>/.oh-my-experience/`. Use `--cwd` when a script needs to test a
specific project context.

## Sources

```bash
ome source status
ome source user-index build --provider all
ome source user-index search "browser validation" --index <file>
ome source user-index show <hit-id> --index <file> --context 4
ome source scan codex --sessions <dir>
ome source scan spool --limit 20
ome source scan spool --query "browser validation" --source codex
ome source scan spool --query "browser validation" --max-session-bytes 4194304
ome source clean
ome source clean --yes
ome source connect spool --mode ask
ome source connect spool --mode enabled
```

`ome source user-index` is the native evidence workbench for retrospectives. It
builds a temporary user-only index from Codex and Claude session files, supports
repeated lexical searches, and replays source context for agent judgment. It does
not update the long-term source index or generate experience cards.

Spool is optional. If it is unavailable, native Codex/Claude user indexing and
local recall still work. Source scans write pointer indexes; they do not copy
full original transcripts. `ome source clean` is a dry run by default and `--yes`
applies the cleanup of legacy summaries and materialized markers.

Spool scans skip sessions whose `spool show --json` output is too large for the
current safety limit. Use a narrower query first; if the session is expected to
be large and still worth indexing, raise `--max-session-bytes` explicitly.

## Retrospectives

```bash
ome reflect start
ome reflect start --scope project
ome reflect start --focus "browser validation and delivery gates"
ome reflect list
ome reflect show <run-id>
ome reflect add <run-id> --title "Browser validation" --summary "..." --rule "..."
ome reflect add <run-id> --title "Repo release gate" --summary "..." --rule "..." --triggers "release validation" --scope-level project --project-key github.com/example/repo
ome reflect candidates <run-id> --from-file <file>
ome reflect candidates <run-id> --scope project --from-file <file>
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
generated draft approval page will show the incomplete audit status.

Add `--scope project` when the retrospective should write candidates, drafts,
and draft approval pages into the current project's `.oh-my-experience/` library.

## Project Libraries

```bash
ome project status
ome project init
```

`ome project init` creates `<project-root>/.oh-my-experience/` with the standard
experience lifecycle folders. It does not change `dataDir`.

`ome project status --json` reports the detected `projectContext`, project
library path, whether the project library exists, whether it is readable, and
any warnings. When the library exists, it also reports `experiences` and
`invalidCards`; invalid active or draft project cards make `ok: false` because
project libraries participate in prompt-time recall.

## Experience Library

```bash
ome experience list
ome experience list --scope project
ome experience list --status draft
ome experience list --compact --json
ome experience show <card-id>
ome experience show <card-id> --scope project --section rule
ome experience show <card-id> --section rule
ome experience enable <card-id>
ome experience enable <card-id> --scope project
ome experience archive <card-id> --reason "superseded"
ome experience migrate-legacy --scope project --dry-run
ome experience migrate-legacy --scope project --backup
```

The lifecycle stays explicit: `candidate -> draft -> active -> archived`.
`list --json` returns full cards by default. Add `--compact` or `--index` when
a script only needs the title index (`id`, `title`, `status`, `category`).

After enabling a draft, agents and maintainers should run a recall smoke with
realistic future task wording:

```bash
ome match "<real task wording>" --json
```

This confirms the new active card can actually be recalled. It is a debugging
and validation path for agents and maintainers, not the normal first-run
instruction for end users.

`experience list --json` is a governance command, so it reports invalid card
files instead of stopping at the first parse error. The response includes
`invalidCards` with `status`, `path`, and `message`. Runtime recall remains
strict for active cards; invalid active cards must still be fixed before they
can be recalled.

Use `ome experience migrate-legacy --dry-run` to preview migration of old
pre-`schema: ome-card` cards into the current schema. Add `--scope project`
for project libraries. Run without `--dry-run` only after reviewing the
migration list. Migration rewrites cards in place by default and does not
create backups; add `--backup` only when you explicitly want a temporary copy.

## Evaluation

```bash
ome eval recall --suite <file>
ome eval recall --suite tests/fixtures/eval/core.json --limit 4
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
PATH. Invalid active or draft cards are errors. Invalid archived cards are
reported as governance warnings because archived cards are history and never
enter runtime recall.

`ome hook run` is the runtime entrypoint used by installed Codex and Claude
hooks. It is kept public so installed hooks can execute it, but normal setup
should happen through `ome init`.

## Config

```bash
ome config get
ome config preview dataDir ~/Documents/Oh-My-Experience
ome config set dataDir ~/Documents/Oh-My-Experience
```

## Uninstall

```bash
ome uninstall
ome uninstall --provider all
ome uninstall --keep-hooks
ome uninstall --keep-skill
ome uninstall --delete-library --yes
```

`ome uninstall` removes selected prompt-time hooks and matching OME skills, but
keeps the experience library by default. Deleting the library is irreversible
and requires `--delete-library --yes` or `--delete-library --force`.

## Language Behavior

Human CLI output is English only, including on non-English systems. Localized
documentation can still live under locale paths such as `/zh/`.

JSON output field names stay stable English.
