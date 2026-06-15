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

```text
Help me install the Oh My Experience Claude hook.

1. Run `ome init --provider claude --dry-run` first to preview what will be written.
2. If the preview is safe, run `ome init --provider claude`.
3. Run `ome hook status --provider claude` to confirm the hook is enabled.
```

## Using both Codex and Claude

If you use both:

```bash
ome init --provider all
```

One library, one retrieval engine, shared automatically. No duplicate rules.

## Running a reflect scan with Claude

Copy and paste this prompt:

```text
Run an OME reflect scan over my recent coding sessions.

1. Use the OME reflect flow to check recent conversations for places where I corrected you.
2. Extract ≤5 experience drafts, only keeping reusable execution judgment.
3. Give me only the draft approval page link and a short summary. Do not ask me to read JSON, internal files, or candidate schemas.
4. If I add thoughts, counterexamples, or edits, refine the same reflect instead of starting a new one.
5. Wait until I explicitly say to add the approved experiences to the library.

Only extract reusable execution judgment. Don't turn one-off context into experience cards.
```

## Rule

Do not fork retrieval logic for Claude. The Claude adapter only handles hook
input, install/status paths, and output formatting.
