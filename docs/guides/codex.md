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

> Help me install the Oh My Experience Codex hook. Run ome init --provider codex --dry-run
> first to preview, then ome init --provider codex, and finally ome hook status to confirm.

## Import Codex sessions

```bash
ome import codex --sessions ~/.codex/sessions
```

**Have your agent do it:**

> Import my Codex sessions into OME. Run ome import codex --sessions ~/.codex/sessions.
> Tell me how many sessions were imported and how many were skipped.

## Running a reflect scan with Codex

Codex agents can run the full reflect flow. Copy and paste this prompt:

```
Run an OME reflect scan over my recent coding sessions.

1. Run ome reflect start --focus "recent execution mistakes I corrected"
2. Check sessions under ~/.codex/sessions and the current conversation
3. Find places where I corrected you (skipped validation, swallowed errors, mixed in unrelated changes, etc.)
4. Generate ≤5 candidates. Each must include: problem, anti-pattern, correct approach, triggers, negative triggers
5. Write candidates to file, then ome reflect candidates RUN_ID --from-file FILE
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