# OME CLI Reference

This reference is for agents. The `ome` CLI is the source of truth for OME
data writes. Keep the public command surface focused on initialization, recall,
source scanning, retrospectives, experience governance, evaluation, diagnostics,
and uninstall.

## Usage Principles

- Do not bypass the CLI to write cards, reflect runs, indexes, hooks, or skill ownership files.
- Use `--json` when another script, hook, or agent will consume the output.
- Use default human output for user-facing explanations; do not hand internal JSON to users by default.
- Isolate `dataDir` when running tests, evals, or validation commands.
- Ask for explicit confirmation before deleting a library, overwriting hooks, overwriting skills, or deleting data.
- In package-local development, use `node bin/ome.js` instead of the global `ome` binary.
- The default first-success path is `ome init -> user sends a real task to the agent -> the agent receives automatic recall and can explain whether OME matched`. Do not require the user to run `ome match` manually as first-install validation; `match` is a debugging entrypoint for hooks, agents, eval, and troubleshooting.

## Init And Config

```bash
ome init
ome init --interactive
ome init --yes
ome init --provider claude
ome init --provider all
ome init --no-hook
ome init --reset-config
```

Rules:

- `ome init` can be rerun.
- A real interactive terminal opens the setup flow.
- CI, pipes, and agent runners skip interaction and use flags/defaults.
- `--no-hook` initializes or updates the library only; it does not install an agent hook or OME skill.
- `--reset-config` restores runtime config without deleting experiences, source indexes, or reflect runs.
- Claude hook setup uses `ome init --provider claude` or `ome init --provider all`; do not ask users to remember a separate hook install command.

Inspect or change `dataDir`:

```bash
ome config get
ome config preview dataDir ~/Documents/Oh-My-Experience
ome config set dataDir ~/Documents/Oh-My-Experience
```

Rules:

- `dataDir` controls the global experience library and runtime state.
- Project libraries always live at `<project-root>/.oh-my-experience/`; they are not configured through `ome config`.

Project libraries:

```bash
ome project status
ome project init
```

Rules:

- `ome project init` creates `.oh-my-experience/` only at the current project root.
- Project libraries are for cards that should travel with a repository; personal or private experiences stay in the global library.
- `ome project status --json` returns project context, project library path, existence, readability, warnings, experience counts, and `invalidCards`. Invalid project active/draft cards make `ok: false`.

## Source Scanning

```bash
ome source status
ome source user-index build --provider all --codex-sessions ~/.codex/sessions --claude-sessions ~/.claude/projects
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
spool status
spool sync
spool search "browser validation" --source codex --limit 10 --json
spool show <uuid> --json
```

Rules:

- Spool is optional. If it is unavailable, continue with Codex, Claude, or local sources.
- `source user-index` is the default evidence workbench for deep retrospectives. It builds a temporary user-only index from raw Codex and Claude JSONL sources, does not write the long-term source index, and does not make experience judgments for the agent.
- `source user-index build` writes to the system temp directory by default. Pass the returned `indexPath` to `search` and `show`. It writes to a chosen path only when `--out` / `--output` is explicit.
- `source user-index search` only locates lexical hits; the agent still owns query-family expansion.
- `source user-index show` replays raw context around a hit. Candidate-card evidence should anchor on user wording first, with surrounding context used only for causality and counterexamples.
- Spool mode is only `off`, `ask`, or `enabled`. Use `enabled` when the user asks to turn it on; use `ask` for per-run confirmation.
- Deep scans build the Codex/Claude `user-index` first. The agent then expands meaning and runs multiple `source user-index search` / `show` queries. Spool is only a secondary supplemental source.
- When current history matters, record `spool status`, run `spool sync`, and write the before/after state into `searchedSources`.
- Spool search is lexical. The agent must split synonyms, near-synonyms, opposite phrasing, and boundary queries, then record query families in `searchedSources`.
- Sparse hits for one broad concept or one query do not prove absence. Try more semantic entries, local Codex full-text search, or an existing source index.
- If a broad query hits oversized sessions, produces too much output, or partially fails, use narrower queries, `spool show --json <uuid>`, or representative scans, and write the degradation into the audit.
- Raise `--max-session-bytes` only after confirming a specific large session is worth indexing. Do not make it the default broad-scan switch.
- When the user gives a session id, do not pass it to `ome reflect start`; read the source record during source audit.
- `source scan` writes a pointer source index only. It does not save raw summaries by default. After scanning, record actual searched sources in `searchedSources`.
- `ome source clean` is dry-run by default. Use `ome source clean --yes` only after confirmation to remove historical summaries and materialized residue.

## Reflect Runs

Create a reflect container:

```bash
ome reflect start
ome reflect start --scope project
ome reflect start --focus "<focus>"
```

Rules:

- `--focus` is an analysis lens, not a source bound.
- Unless the user explicitly limits the source set, `sourceCoverage` remains `all-accessible`.
- Do not treat a focused scan as permission to read only a few related sessions.

Inspect reflect runs:

```bash
ome reflect list
ome reflect show <run-id>
```

Quick manual lesson entry:

```bash
ome reflect add <run-id> --title "Browser validation" --summary "..." --rule "..."
ome reflect add <run-id> --title "Browser validation" --category "Testing" --summary "..." --rule "..."
```

## Candidate Writes And Audit

Write candidates:

```bash
ome reflect candidates <run-id> --from-file <file>
ome reflect candidates <run-id> --scope project --from-file <file>
ome reflect candidates <run-id> --from-file <file> --audit-file <audit.json>
```

Use incomplete audit only when explicitly accepted:

```bash
ome reflect candidates <run-id> --from-file <file> --allow-incomplete-audit --incomplete-audit-reason "source access limited"
```

Candidate writes require source audit. The audit must cover at least:

- `focusLens`
- `sourceCoverage`
- `searchedSources`
- `unavailableSources`
- `noiseFilters`
- `evidenceClusters`
- `userCorrections`
- `rejectedInterpretations`
- `activeCardOverlapQa`
- `remainingEvidenceGaps`

`sourceCoverage: unknown` must not write candidates by default.

## Draft Approval Lifecycle

Candidate decisions:

```bash
ome reflect decide <run-id> <candidate-id> --action approve
ome reflect decide <run-id> <candidate-id> --action approve --category "Product UI"
```

Apply to draft:

```bash
ome reflect apply <run-id> --dry-run
ome reflect apply <run-id> --scope project --dry-run
ome reflect apply <run-id>
ome reflect apply <run-id> --scope project
```

Enable active:

```bash
ome experience enable <card-id>
ome experience enable <card-id> --scope project
```

Rules:

- Keep the lifecycle explicit: `candidate -> draft -> active -> archived`.
- Retrospectives only create review/candidate material first. Do not directly create active cards.
- Do not enable a draft before user approval.

## Card Inspection And Governance

```bash
ome experience list
ome experience list --scope project
ome experience list --status draft
ome experience list --compact --json
ome experience show <card-id>
ome experience show <card-id> --section rule
ome experience show <card-id> --scope project --section rule
ome experience archive <card-id> --reason "superseded"
ome experience migrate-legacy --scope project --dry-run
ome experience migrate-legacy --scope project --backup
```

Categories come from candidates, approval comments, and card content. Do not ask
users to maintain a separate category command. Starter lessons are installed by
`init`; later governance uses normal library review and archive commands.

`list --json` returns full cards by default. Use `--compact` or `--index` when
you only need an index and want to avoid loading full rule text.

When old cards are missing `schema: ome-card`, do not edit active cards by hand.
Run `ome experience migrate-legacy --scope project --dry-run` first, then execute
only after user confirmation. Migration rewrites in place by default; add
`--backup` only when the user explicitly wants a temporary backup.

## Match And Recall Debugging

```bash
ome match "<task>"
ome match "<task>" --json
ome match "<task>" --explain
ome match "<task>" --cwd <project-root> --explain
```

`ome match` is for agents, hooks, eval, and troubleshooting. It is not the next
step for ordinary users after setup. For users, prefer sending a real task and
letting the installed hook recall automatically. Show `match` only for
explanation, validation, or debugging.

Use `match` before and after retrospectives:

- Before: check whether an active card already covers the scenario.
- After: verify that the future trigger scenario can be phrased clearly. After the user approves, applies, and enables the active card, run a recall smoke with real task wording and confirm `matches` contains the target card.
- In a project directory, recall reads the global `dataDir` and optional project library.
- When a project card matches, the rendered full-card command in additional context includes `--scope project`.

## Evaluation

```bash
ome eval recall --suite <file>
ome eval recall --suite tests/fixtures/eval/core.json --limit 4
ome eval recall --suite tests/fixtures/eval/core.json --experiences tests/fixtures/eval/core.cards.json
ome eval recall --suite my-suite.json --use-current-library
ome eval recall --compare before.json after.json
```

Rules:

- `ome eval recall` is deterministic and does not call an AI model.
- It uses a temporary fixture library by default and does not write the real library.
- Use `--use-current-library` only when the user explicitly wants to evaluate the current active library.
- Hook runtime validation should use real `ome hook run` or project tests; do not expose a separate `eval hook` command.

## Hook

```bash
ome hook status
ome hook run
```

Rules:

- Install and uninstall hooks/skills through `ome init` / `ome uninstall`.
- `ome hook run` is the runtime entrypoint for installed Codex/Claude hooks and must remain available.
- Hook runtime derives project context from the prompt payload and applies card `scope`.
- If a project library exists, the hook reads project active cards; hook events still write to global `dataDir`.
- Do not change hooks as a side effect of retrospective work. Retrospectives and setup are separate lifecycle stages.

## Doctor And Status

```bash
ome stats
ome doctor
ome doctor --repair-index
ome version
ome -v
which -a ome
```

`ome doctor` should check:

- `dataDir` writability
- config schema
- card lifecycle integrity
- active index consistency
- reflect state
- hook status
- event JSONL
- package runtime requirements
- conflicting `ome` binaries on `PATH`

Decision boundaries:

- Invalid active/draft cards are errors and block `doctor.ok`.
- Invalid archived cards are governance warnings. Archived cards do not enter runtime recall, but they should still appear in `checked.invalidCards` and warnings.

`--repair-index` rebuilds `indexes/experiences.json` and then checks again. Use
it only after index inconsistency or manual experience-file edits.

## Uninstall

```bash
ome uninstall
ome uninstall --provider claude
ome uninstall --provider all
ome uninstall --keep-hooks
ome uninstall --keep-skill
ome uninstall --delete-library --yes
```

`ome uninstall` keeps the experience library by default. Library deletion is irreversible and requires explicit user confirmation.
