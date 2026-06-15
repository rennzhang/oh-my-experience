---
title: Codex Guide
status: active
---

# Codex Guide

Codex is the first supported provider.

## Hook installation

`ome init` configures the Codex hook by default. To configure separately:

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

## Running a reflect scan with Codex

Codex agents can run the full reflect flow. Copy and paste this prompt:

```text
Run an OME reflect scan over my recent coding sessions.

1. Run ome reflect start --focus "recent execution mistakes I corrected"
2. Check sessions under ~/.codex/sessions and the current conversation
3. Find places where I corrected you (skipped validation, swallowed errors, mixed in unrelated changes, etc.)
4. Generate ≤5 candidates in the current OME candidate JSON shape: audit plus candidates with summary, criteria.use_when, criteria.ignore_when, recall, optional engine_hints, scope, and rule.
5. Write candidates to candidates.json, then run ome reflect candidates RUN_ID --from-file candidates.json
6. ome reflect show RUN_ID to display candidates. Wait for my approval on each one.

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

`ome init` automatically installs the OME skill into the Codex skills directory.
Once installed, the agent gains recall, reflect, curate, and troubleshoot
capabilities through the skill system.
