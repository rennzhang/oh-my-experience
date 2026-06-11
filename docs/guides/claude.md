---
title: Claude Guide
status: active
---

# Claude Guide

Claude uses the same provider-neutral hook runtime as Codex. Same cards, same
retrieval engine.

## Supported mapping

| Claude event | Normalized event |
| --- | --- |
| `UserPromptSubmit` | `prompt.submit` |

## Hook installation

```bash
ome init --provider claude --dry-run   # Preview
ome init --provider claude             # Install
```

The installer writes to `~/.claude/settings.json`.

**Have your agent do it:**

> Help me install the Oh My Experience Claude hook. Run ome init --provider claude --dry-run
> first to preview, then ome init --provider claude.

## Using both Codex and Claude

If you use both:

```bash
ome init --provider all
```

One library, one retrieval engine, shared automatically. No duplicate rules.

## Running a reflect scan with Claude

Copy and paste this prompt:

```
Run an OME reflect scan over my recent coding sessions.

1. Run ome reflect start --focus "recent execution mistakes I corrected"
2. Check recent conversations for places where I corrected you
3. Generate ≤5 candidates. Each must include: problem, anti-pattern, correct approach, triggers, negative triggers
4. Write candidates to file, then ome reflect candidates RUN_ID --from-file FILE
5. ome reflect show RUN_ID to display candidates. Wait for my approval on each one.

Only extract reusable execution judgment. Don't turn one-off context into experience cards.
```

## Rule

Do not fork retrieval logic for Claude. The Claude adapter only handles hook
input, install/status paths, and output formatting.