# Oh My Experience

[English](README.md) | [简体中文](README.zh-CN.md)

Stop teaching your agent the same lesson twice.

Oh My Experience is a local-first experience layer for AI coding agents. It
turns real Codex and Claude sessions into reviewed experience cards, then
recalls the right lessons at prompt time before the next skipped browser check,
bad fallback, mixed Git diff, forgotten release gate, or repeated correction.

Start with built-in starter lessons today.

```bash
# From this checkout
npm install
npm run build
node bin/ome.js init
```

## Why Developers Use It

AI agents are getting better at writing code, but they still lack durable
execution judgment for your way of working.

- Keep `AGENTS.md` and `CLAUDE.md` small.
- Stop losing hard-won execution lessons in chat history.
- Help agents remember the right skill, check, or release gate.
- Review every lesson before it becomes active.
- Stay local by default.

The result is not more instructions stuffed into every prompt. It is better
timing: the right lesson, shown to the agent when it can still change the next
action.

## The Missing Layer Between Memory And Skills

Memory remembers facts. Skills package repeatable workflows. Oh My Experience
remembers execution judgment.

For example:

- Memory may know that you care about UI quality.
- A skill may know how to run Playwright.
- An experience card reminds the agent not to call a UI task done until the
  real browser, responsive states, interactions, loading states, errors, and
  console have been checked.

That is the layer most coding agents still miss: not facts, not tools, but
judgment from the last time the work went wrong.

## Keep Rule Files Small

`AGENTS.md` and `CLAUDE.md` should contain only the rules that must always be
loaded. Most lessons are conditional: they matter for UI work, release work,
Git work, review work, or one specific project.

Oh My Experience keeps those conditional lessons out of always-on context and
recalls them only when they are likely to matter.

## Make Skills Appear At The Right Moment

If your workspace has many small skills, agents may forget which one matters
for the current task. Experience cards can carry related skill hints, so recall
can say:

> This task looks like a browser validation case. Consider using the browser
> validation skill before closing it.

Oh My Experience does not replace skills or orchestrate a skill marketplace. It
helps the agent notice the relevant operational lesson before the moment passes.

## A Self-Evolving Experience Loop

Every serious coding-agent workflow produces corrections: "do not hide that
error", "run the browser", "dry-run before writing", "this project has a special
release gate".

Oh My Experience gives those corrections a lifecycle:

```text
real work -> retrospective -> review -> active card -> prompt-time recall -> stats -> refinement
```

Your agent gets better because your workflow keeps producing better experience
cards, not because you keep making one giant rule file.

## What You Get

- A local Markdown library of reviewed experience cards.
- Codex and Claude hooks that recall relevant lessons at prompt time.
- Project-aware matching from one local hook.
- Negative triggers for overloaded words like "goal", "review", or "release".
- Explainable recall: matched cards, scores, reasons, and rendered context.
- A Markdown-first review loop for candidate lessons before they become active.
- Isolated evaluation so retrieval changes can be tested without polluting your real library.

## How It Works

### 1. Capture real sessions

Import local coding-agent sessions from Codex, or optionally from the official
Spool CLI. Spool is a local AI session index for turning Claude, Codex, Gemini,
and other agent histories into one searchable pool. Without it, OME uses the
current conversation and explicitly imported Codex sessions; with it, OME can
look up evidence first instead of dumping raw sessions into context, saving
tokens and keeping retrospectives cleaner. Interactive `ome init` can offer to
install only the Spool CLI package (`npm install -g @spool-lab/cli`) after core
setup; it does not install the Spool desktop client.

```bash
ome import codex --sessions <codex-session-dir>
```

### 2. Turn mistakes into candidates

Ask your agent to run an OME reflect scan over the relevant available sources
and prior work. The output is a reflect run, not an active rule.
Nothing is recalled until you approve it.

### 3. Review before activation

Apply candidates in two steps, then approve the experiences that should become
recallable.

Review the generated Markdown worksheet or ask your agent to apply approved
candidates. Draft experiences still need explicit approval before they become
recallable.

### 4. Recall at prompt time

When a prompt enters Codex or Claude, the hook builds a small task envelope,
matches active experiences, filters by project applicability, and injects a compact
additional context block.

```bash
ome match "fix UI and validate in browser" --explain
```

The hook path is local, fast, and fail-open. It does not call an LLM or write
new active cards.

## Install

After npm publication:

```bash
npx oh-my-experience init
npx oh-my-experience doctor
```

Or install globally:

```bash
npm install -g oh-my-experience
ome init
ome doctor
```

From this checkout:

```bash
npm install
npm run build
node bin/ome.js init
node bin/ome.js doctor
```

`ome init` opens a short setup flow for the library path, installs Codex recall
by default, and writes built-in starter lessons. The first copied prompt is a
normal coding/product task so you can feel prompt-time recall before asking an
agent to scan your real sessions. After that, ask the agent to start a reflect
scan and create your own candidates. Remove the starter lessons later with
normal `ome experience archive` governance if they are no longer useful.
Interactive init may offer the optional Spool CLI stage; scripted init never installs it. For optional Spool imports, see
[Import Sources](docs/guides/import-sources.md).

## Manage Agent Hooks

Agent recall is configured during `ome init`. Use these commands when you want
to set up Codex, Claude, or both:

```bash
ome init --provider codex
ome init --provider claude
ome init --provider all
```

Use `ome hook status` and `ome doctor` when you need to inspect the installed
state. Claude uses the same recall runtime:

```bash
ome hook status --provider claude
```

Codex App may still ask you to trust the hook in its UI.

## What An Experience Card Looks Like

An experience card is a behavioral correction, not a note dump.

It records:

- the human-readable experience summary;
- the executable reusable rule;
- when to recall it;
- when not to recall it;
- which projects it applies to;
- the evidence behind it.

Only active experiences are recalled by hooks.

## Local By Default

Experiences, reflect runs, indexes, and the event stream live on your machine.
Hook events store prompt hashes and task envelopes by default, not raw prompts. Raw
prompt logging is opt-in.

## Documentation

- [Quickstart](docs/guides/quickstart.md)
- [Setup](docs/guides/setup.md)
- [CLI Reference](docs/reference/cli.md)
- [Retrieval Engine](docs/architecture/retrieval-engine.md)
- [Documentation](docs/index.md)
- [中文文档](docs/zh/index.md)

## License

MIT
