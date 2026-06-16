---
title: Introduction
status: active
---

# Introduction

<div class="ome-intro-brand">
  <img src="/ome-logo.png" alt="Oh My Experience logo">
  <p>Stop teaching your agent the same lesson twice.</p>
</div>

Oh My Experience (OME) helps your agent understand your way of working over
time. It is a local-first experience recall layer for AI coding agents. It
turns real Codex and Claude corrections, rework, and delivery lessons into
approved experience cards, then recalls the most relevant reminder when a
similar task appears again.

OME is not about writing more rules. It is about timing: showing the right
lesson while the agent can still change its next action.

## Why Developers Use It

AI coding agents are getting better at writing code, but they still lack
durable judgment for your way of working.

OME helps you:

- Keep `AGENTS.md` and `CLAUDE.md` small.
- Stop losing hard-won execution lessons in chat history.
- Help agents remember the skill, guide, check, or release gate that mattered last time.
- Approve and confirm every lesson before it can be recalled later.
- Stay local by default.

## Each Layer Has A Job

AI agents already have many ways to keep context, but each layer solves a
different problem.

- `AGENTS.md` and `CLAUDE.md` are best as always-on entries: norms, maps, capability indexes, and collaboration boundaries.
- Skills are best for repeatable workflows such as validation, release checks, or external-system operations.
- Memory is best for facts, preferences, and long-term background that help the agent understand you and the project.
- Rules are best for stable, pre-declared behavior constraints that apply by scope.

OME adds a different layer: execution experience.

Execution experience usually comes from a judgment formed during real work:
why a step mattered last time, when it should matter again, which similar cases
should not trigger it, and what reminder the agent should see before acting.

Sometimes that reminder is a direct rule. Sometimes it is a note to look at a
specific skill, guide, checklist, or project convention. In both cases, OME keeps
the reviewed experience as a card and recalls the card only when the task looks
relevant.

It is not always-on project guidance, and it is not a tool manual. It is
recalled lightly when the current task matches, so rule files stay small and
lessons do not get lost.

OME is not a memory store for facts, not a replacement for `AGENTS.md` or
`CLAUDE.md`, and not a skill runner. It recalls approved execution lessons only
when the task needs them.

See [Examples](examples.md) for a concrete `/goal` case that shows the matched
experience card and the exact context mounted into the agent prompt.

## How It Works

```text
real work -> reflect scan -> draft approval -> refine -> confirm library add
-> prompt-time recall -> match stats -> ongoing maintenance
```

1. **Scan sources** from native Codex/Claude history, with optional Spool supplements.
2. **Run a reflect scan** so the agent finds places where you corrected it.
3. **Approve and refine** the extracted experience drafts in the draft approval page.
4. **Confirm library add** before anything can be recalled later.
5. **Recall at prompt time** when the hook matches active cards to the current task.
6. **Maintain the library** with stats and evals for coverage, stale cards, and noisy matches.

## What You Get

- A local Markdown library of approved experience cards.
- Optional project libraries at `<project-root>/.oh-my-experience/`.
- Codex and Claude hooks for prompt-time recall.
- Project-aware matching from one local hook.
- Explicit ignore criteria for noisy words such as "goal", "review", and "release".
- Explainable recall: matched cards, scores, reasons, and rendered context.
- A Markdown-first draft approval loop before extracted experiences can be recalled.
- Isolated evaluation so retrieval changes do not pollute your real library.

## Local And Confirmed By Default

The hook path does not call an LLM, use the network, or require an API key. If
recall fails, it fails open and returns empty context so your agent still runs.

By default, hook events store prompt hashes and task summaries, not raw prompts.
Experiences created by reflect scans never become recallable automatically.
Nothing bypasses human confirmation to enter prompt-time recall.

## Next

Start with the [Quickstart](/guides/quickstart) to install OME and verify your
first recall. Use [Global And Project Libraries](/guides/project-libraries) if
you want repository-level cards. Then read [Reflect and Draft Approval](/guides/reflect-review)
to turn real corrections into reusable experience.
