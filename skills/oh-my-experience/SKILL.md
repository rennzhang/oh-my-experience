---
name: oh-my-experience
description: Use this skill to turn AI coding sessions into reusable experience cards, review lessons before activation, and recall the right lessons at prompt time through Oh My Experience.
---

# Oh My Experience

Oh My Experience helps agents turn real AI coding sessions into reusable experience cards.

Use this skill when the user asks to:

- import or review Codex sessions
- generate retrospective drafts from AI execution logs
- curate lessons into an experience library
- install or configure prompt-time recall hooks
- inspect recall metrics and improve experience cards

## Workflow

1. Run `ome init` to create or inspect the local experience library.
2. Run `ome import codex` to inventory Codex sessions.
3. Run `ome reflect` to generate reviewable retrospective drafts.
4. Ask the user to approve, reject, merge, or rewrite candidate lessons.
5. Run `ome approve` to promote approved cards into the active library.
6. Run `ome hook install codex` only after the user confirms prompt-time recall.
7. Run `ome stats` to inspect recall coverage and stale cards.

## Rules

- Never promote a lesson directly from a session into active cards without user review.
- Keep the hook path deterministic and fast; do not call an LLM from the real-time hook.
- Do not store raw sensitive prompts in hook logs; store hashes, task envelopes, matched card ids, and scores.
- Load only relevant cards for the task. Do not inject the whole experience library into context.
- If the CLI is not installed, direct the user to install from npm or PyPI.

