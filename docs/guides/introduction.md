---
title: Introduction
status: active
---

# Introduction

Oh My Experience is a local tool that remembers execution lessons from your AI
coding sessions and recalls them at the right moment.

You correct your agent during real work. Those corrections become **experience
cards** — a behavioral fix with trigger conditions. The next time a similar task
comes up, the hook auto-injects the relevant card into the prompt.

Not stuffing every rule into every prompt. **Surfacing the right rule at the
right moment.**

## Why not just AGENTS.md?

AGENTS.md and CLAUDE.md have two problems.

### Always-on context bloat

Every prompt carries every rule. But most rules are conditional — they only
matter for specific tasks.

A rule like "validate UI in a real browser before closing" doesn't belong in a
backend refactoring session. Yet if it's in AGENTS.md, it's there every turn,
burning tokens and diluting attention. The more rules you add, the weaker each
one becomes.

OME keeps conditional rules out of always-on context. A card is only injected
when the task envelope matches its triggers.

### Context compression eats your rules

AGENTS.md injects once at the very start of a conversation. Long sessions
trigger context compression, and the initial rules can disappear — your agent
forgets your conventions mid-task.

OME's hook runs on every `UserPromptSubmit`. Lessons are re-injected fresh each
turn. They can't be compressed away.

### How they work together

You don't throw away AGENTS.md. It keeps the truly universal rules — the ones
that apply to every task, every time. OME handles the conditional ones that
only matter for certain work.

## The missing layer

Memory remembers facts. Skills package workflows. **OME remembers execution
judgment.**

- **Memory** knows you care about UI quality.
- **A skill** knows how to run Playwright.
- **An experience card** reminds the agent: don't call a UI task done without
  checking the real browser, responsive states, interactions, loading states,
  errors, and console.

That's the layer most coding agents miss — not facts, not tools, but judgment
from the last time the work went wrong.

## How it works

```
real work → reflect scan → candidates → your review → active card
→ prompt-time recall → stats → refinement
```

1. **Import sessions** from Codex (or optionally Spool for multi-agent)
2. **Run a reflect scan** — your agent inspects sessions, finds where you
   corrected it, and generates candidate cards
3. **You review** — approve, reject, merge, or rewrite each candidate
4. **Cards go active** — only after your explicit approval
5. **Auto-recall** — the hook matches active cards to each new prompt

Nothing enters the library without your review. AI-generated noise never
becomes a permanent rule.

## Before and after

**Before OME:** Your AGENTS.md has 200 lines of rules. The agent still skips
browser validation on UI work — the rule is buried between a Git convention
and a release checklist. You correct it again.

**After OME:** AGENTS.md has 30 lines of always-relevant rules. You say "fix
the login page UI". The hook detects a UI task and recalls one card: "Don't
call UI work done without real browser validation." That's the only extra
context. The agent checks the browser before reporting done.

## Safety by design

- **No LLM on the hot path.** Retrieval is deterministic BM25-like matching.
  No API keys, no network, no latency.
- **Fail-open.** If the hook errors, it returns empty context — your prompt
  still works.
- **No raw prompt storage.** Hook events store prompt hashes and task
  envelopes by default. Raw logging is opt-in with TTL.
- **No auto-approval.** Nothing bypasses human review to become active.
- **Local only.** No cloud, no accounts, no remote sync.

## Next

Start with the [Quickstart](/guides/quickstart) to see recall in 3 minutes.
Read [Reflect and Review](/guides/reflect-review) to learn how to turn real
corrections into experience cards.