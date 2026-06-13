---
title: Quickstart
status: active
---

# Quickstart

This guide gets you from installation to your first verified recall. You only
need to install the CLI yourself; the remaining steps can be copied to Codex or
Claude and run by your agent.

## 1. Install the CLI

```bash
npm install -g oh-my-experience
```

This installs the `ome` command globally so terminals and agents can run
`ome init`, `ome doctor`, and `ome match` directly. If you prefer not to install
globally, use the `npx` path in the [Setup Guide](setup.md).

## 2. Initialize the library

Copy this to your agent (Codex or Claude):

```text
Help me set up Oh My Experience:

1. Run `ome init` and accept the default library path.
2. Run `ome doctor` to verify the library, config, and hook state.
3. Run `ome hook status --provider codex` to confirm the Codex hook is installed.

Report each result and call out anything that needs my confirmation.
```

After initialization, your library has a few built-in starter cards so you can
experience recall immediately. If you no longer want one, archive it through the
normal library flow with `ome experience archive <starter-card-id> --reason
"no longer needed"`.

## 3. Verify recall

Copy this to your agent:

```text
Test recall with `ome match`:

ome match "fix login page UI and validate in browser" --explain

Tell me which cards matched, why they scored, and what additional context would be injected.
```

`--explain` shows detected task signals, per-card scoring reasons, similar
cards, and the final rendered context block. If the matches don't feel right,
that tells you which cards need tighter trigger conditions.

## 4. Optional: add a project library

Use this only when a repository should carry its own reviewed lessons:

```bash
cd /path/to/your/project
ome project init
ome project status
```

`dataDir` remains your global library. The project library lives at
`<project-root>/.oh-my-experience/`. When a task runs inside that project, OME
reads both layers and prefers the project card when the same lesson exists in
both places. See [Global And Project Libraries](project-libraries.md) for the
full model.

## 5. Run your first reflect scan

Now have the agent scan your recent coding sessions for lessons. Copy this:

```text
Run an OME reflect scan over my recent coding sessions:

1. Run `ome reflect start --focus "recent error patterns I corrected"`.
2. Check recent sessions for places where I corrected you.
3. Generate `candidates.json` using the current candidate shape:
   - `audit`: source coverage, searched sources, rejected interpretations, and evidence gaps
   - `candidates[].summary`: one clear sentence covering failure mode, use case, ignore case, and expected action
   - `candidates[].criteria.use_when` / `ignore_when`: natural-language usage standards
   - `candidates[].recall.policy/risk/confidence/triggers/topics`
   - `candidates[].engine_hints`: only internal signal ids when they are truly needed
   - `candidates[].scope`
   - `candidates[].rule`: the complete executable rule
4. Run `ome reflect candidates RUN_ID --from-file candidates.json`.
5. Run `ome reflect show RUN_ID` to display all candidates.

No more than 5 candidates. Only extract reusable execution judgment; don't turn one-off context into rules.
```

The agent shows the candidates. You review them.

## 6. Review candidates

For each candidate, ask: will this situation happen again? If the agent sees
this card next time, will it avoid the same mistake?

If a candidate is useful:

```text
Help me apply these candidates:

1. Run `ome reflect apply RUN_ID --dry-run` to preview the drafts that would be written.
2. If the preview is correct, run `ome reflect apply RUN_ID`.
3. For each draft that should become active, run `ome experience promote DRAFT_ID`.
```

If a candidate is too vague, not general enough, or already covered, reject it:

```bash
ome reflect decide RUN_ID CANDIDATE_ID --action reject
```

If two candidates are similar, merge them:

```bash
ome reflect decide RUN_ID CANDIDATE_ID --action merge --target OTHER_ID
```

Only active cards are recalled by hooks. Unapproved candidates never appear
in your agent's prompts.

## 7. Verify the new card works

After approval, verify with a realistic task:

```text
Use `ome match` to verify the newly promoted cards.
Simulate a task similar to the scenario where the mistake happened, and check whether the new card matches.
```

```bash
ome match "a task description" --explain
```

## 8. Iterate

From now on, relevant cards are injected at prompt time automatically. Check
the health of your library:

```text
Run `ome stats`.
Show me the recall coverage rate, which cards have not matched recently, and whether any cards are stale.
```

If recall is noisy, improve cards instead of disabling the system:

- Tighten `criteria.use_when` and `recall.triggers` with workflow-specific terms
- Add `criteria.ignore_when` for ambiguous keywords
- Narrow project scope
- Merge near-duplicate cards
- Archive cards that haven't matched in a long time

---

## Quick reference

Common commands when asking your agent for help:

| I want to... | Tell your agent |
|-------------|-----------------|
| Test recall | `ome match "task description" --explain` |
| Check health | `ome doctor` |
| View stats | `ome stats` |
| Start a scan | `ome reflect start --focus "focus area"` |
| Initialize project library | `ome project init` |
| Show candidates | `ome reflect show RUN_ID` |
| Preview apply | `ome reflect apply RUN_ID --dry-run` |
| Apply | `ome reflect apply RUN_ID` |
| Promote card | `ome experience promote DRAFT_ID` |
| Archive card | `ome experience archive CARD_ID` |
