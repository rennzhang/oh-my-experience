---
name: oh-my-experience
description: >-
  Use this skill when Codex needs to work with Oh My Experience for AI coding-agent execution lessons: set up a local OME library, install or inspect Codex hooks, recall active experience cards before medium or complex work, import and scan coding sessions for retrospective candidates, create or inspect retrospective candidates, review and govern an existing experience library, run recall evaluation, or troubleshoot OME data directories, hooks, stats, Spool imports, and doctor failures.
---

# Oh My Experience

Oh My Experience (OME) turns real AI coding sessions into reviewed, prompt-time experience recall.

Use the `ome` / `oh-my-experience` CLI as the source of truth. Do not reimplement storage, matching, hook writes, retrospective lifecycle, or card mutation in the skill.

## Pick The Workflow

Read only the reference needed for the user request:

| User intent | Reference |
| --- | --- |
| Need exact CLI commands, flags, JSON behavior, lifecycle commands, or safe command routing | [cli.md](references/cli.md) |
| Install, initialize, configure, hook setup | [setup.md](references/setup.md) |
| Recall prior lessons for the current task, inspect match quality | [recall.md](references/recall.md) |
| Import sessions, run retrospective, inspect candidates, approve cards | [reflect-retrospective.md](references/reflect-retrospective.md) |
| Review, refine, merge, archive, or de-conflict existing experience cards | [experience-library-review.md](references/experience-library-review.md) |
| Doctor failures, hook status, stats, eval, dogfood validation | [troubleshoot-eval.md](references/troubleshoot-eval.md) |

When the user asks to scan, summarize, extract, or preserve
experience from sessions, sources, or prior work, read `references/reflect-retrospective.md`
completely and follow it strictly. Do not rely on remembered snippets, command
examples, or a partial checklist for retrospective work.

When the user asks to review the existing experience library, improve active
cards, audit recall quality, merge/delete/rewrite cards, reduce recall
pollution, prevent card rot, or review one specific card, read
`references/experience-library-review.md` completely and follow it strictly.

When the task requires running `ome` commands, read `references/cli.md` for
the current AI-facing command contract instead of copying command snippets from
other references.

If the task spans multiple lifecycle stages, read the references in lifecycle order:

```text
setup -> recall -> retrospective -> draft -> active -> eval -> maintenance
```

## Non-Negotiable Rules

- Keep the lifecycle explicit: `candidate -> draft -> active -> archived`.
- Never create or edit active cards directly; create retrospective runs with `ome reflect start`, manage existing runs with `ome reflect ...`, then use `ome experience promote`.
- Never install or overwrite real Codex hooks unless the user explicitly confirms.
- Never store raw prompt text in events unless the user explicitly opts into that behavior.
- Keep Spool optional. If Spool is unavailable, Codex session import and local recall still need to work.
- Keep scheduling outside the built-in skill workflow. Periodic retrospectives are an advanced docs pattern and require explicit user approval for the chosen host.
- Use JSON output for scripts or agent-to-agent consumption; use human output for user-facing terminal guidance.
- Prefer isolated temp data dirs for tests and eval. Do not pollute the user's real OME library with fixtures.
- UI, skill, and docs must go through CLI/core write paths; they must not create a second truth.

## Minimal Commands

```bash
ome init
ome doctor
ome match "<task>" --json
```

For package-local development, replace `ome` with `node bin/ome.js` after `npm install && npm run build`.
