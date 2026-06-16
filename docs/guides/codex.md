---
title: Codex Guide
status: active
---

# Codex Guide

Codex is the first supported provider and currently the best-tested path.

## Hook installation

Choose `codex` in the interactive setup, or configure it explicitly:

```bash
ome init --provider codex --dry-run   # Preview what will be written
ome init --provider codex             # Install
ome hook status --provider codex      # Verify
```

Codex App may still ask you to trust the hook in its UI.

**Have your agent do it:**

```text
Help me install the Oh My Experience Codex hook.

1. Run `ome init --provider codex --dry-run` first to preview what will be written.
2. If the preview is safe, run `ome init --provider codex`.
3. Run `ome hook status --provider codex` to confirm the hook is enabled.

If Codex App asks me to trust the hook in the UI, stop and tell me what to confirm.
```

## Scan Codex sessions

```bash
ome source scan codex --sessions ~/.codex/sessions
```

**Have your agent do it:**

```text
Scan my Codex sessions into the OME source index.

Run `ome source scan codex --sessions ~/.codex/sessions`, then tell me how many
sessions were indexed, how many were skipped, and whether any failed to parse.
```

For retrospective deep scans, use the temporary user-only evidence index instead
of relying on pointer scans alone:

```bash
ome source user-index build --provider codex --sessions ~/.codex/sessions --json
```

## Running a reflect scan with Codex

Codex agents can run the full reflect flow. Copy and paste this prompt:

```text
Run an OME reflect scan over my recent coding sessions.

1. Use the OME reflect flow to inspect recent sessions under ~/.codex/sessions and the current conversation.
2. Find places where I corrected you (skipped validation, swallowed errors, mixed in unrelated changes, etc.).
3. Extract ≤5 experience drafts, only keeping reusable execution judgment.
4. Give me only the draft approval page link and a short summary. Do not ask me to read JSON, internal files, or candidate schemas.
5. If I add thoughts, counterexamples, or edits, refine the same reflect instead of starting a new one.
6. Wait until I explicitly say to add the approved experiences to the library.

Only extract reusable execution judgment. Don't turn one-off context into experience cards.
```

## Verifying recall

After installing the hook, simulate a prompt:

```bash
echo '{"prompt": "fix login page UI and validate in browser"}' | ome hook run
```

Or send a real task in Codex and check whether experience reminders appear at
the top of the agent's prompt.

## Skill

`ome init --provider codex` installs the OME skill into the Codex skills
directory. When multiple agents are selected, OME installs the matching skill
for each selected agent. Once installed, the agent gains recall, reflect,
curate, and troubleshoot capabilities through the skill system.
