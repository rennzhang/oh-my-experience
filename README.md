<p align="center">
  <img src="docs/public/brand/ome-logo-lockup.png" alt="Oh My Experience (OME)" width="560">
</p>

<h1 align="center">Oh My Experience</h1>

<p align="center"><strong>Stop teaching your agent the same lesson twice.</strong></p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="docs/index.md">Documentation</a>
</p>

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
- Optional project libraries at `<project-root>/.oh-my-experience/`.
- Codex and Claude hooks that recall relevant lessons at prompt time.
- Project-aware matching from one local hook.
- Explicit ignore criteria for overloaded words like "goal", "review", or "release".
- Explainable recall: matched cards, scores, reasons, and rendered context.
- A Markdown-first review loop for candidate lessons before they become active.
- Isolated evaluation so retrieval changes can be tested without polluting your real library.

## Repository Layout

The repository root keeps the public project surface visible:

```text
bin/        CLI entry point
packages/   TypeScript source packages
docs/       guides, reference, architecture, and docs assets
skills/     bundled agent-facing OME skill
templates/  reusable card template
examples/   sample experience cards
tests/      unit, integration, and CLI tests
scripts/    release and validation helpers
.github/    CI, contribution, and security policy
```

OME is a Node.js CLI package. Python package metadata is intentionally absent.

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
matches active experiences, filters by project scope, and injects a compact
additional context block.

```bash
ome match "fix UI and validate in browser" --explain
```

The hook path is local, fast, and fail-open. It does not call an LLM or write
new active cards.

## Example: `/goal` Recall In Practice

When you tell an agent:

```text
创建目标，开干，把这个功能完整做完并自己验证
```

OME can match a reviewed goal-execution card and mount this compact context
before the agent starts work:

```text
OME candidate experience cards. Matched does not mean used: apply a card only when its workflow meaning fits the current task; ignore unrelated or conflicting cards.
Final report: if you actually used any card, add one final line `**本次使用 N条 OME 经验卡：** ...` using only the `Final link if used` values for cards you applied; omit the line if none applied.
1. [high risk][must] 创建目标时进入完整闭环交付模式 (创建目标时进入完整闭环交付模式-40383753)
   Summary: 当用户用 /goal、创建目标或开干启动真实长任务时，常见误判是只建目标或做局部切片；应进入完整闭环交付，并排除文档示例、概念解释和业务目标讨论。
   Scope: global
   Use if: /goal 开始执行; 创建目标开干; 使用 goal 跑长任务
   Ignore if: 文档或案例里展示 /goal; 解释 goal 功能但不执行
   Matched by: task looks like a real goal-execution start
   Rule: ome experience show 创建目标时进入完整闭环交付模式-40383753 --section rule
   Final link if used: [创建目标时进入完整闭环交付模式](<~/.oh-my-experience/experiences/active/创建目标时进入完整闭环交付模式-40383753.md>)
```

The agent then reads the full card rule and treats `/goal` as an execution
startup protocol: define scope, complete the planned work, validate through real
paths, and fail closed until evidence is clear. See
[Examples](docs/guides/examples.md) for the full walkthrough.

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

## Global And Project Libraries

`dataDir` is your global library. It can stay in the default location or move to
a dedicated local folder such as an Obsidian subfolder.

When a repository should carry its own reviewed cards, initialize a project
library:

```bash
ome project init
ome project status
```

OME reads both layers at prompt time. Global project-scoped cards still work
without adding repository files; use `.oh-my-experience/` only when the lesson
should travel with the project.

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
- [Examples](docs/guides/examples.md)
- [Setup](docs/guides/setup.md)
- [Global and project libraries](docs/guides/project-libraries.md)
- [CLI Reference](docs/reference/cli.md)
- [Retrieval Engine](docs/architecture/retrieval-engine.md)
- [Documentation](docs/index.md)
- [中文文档](docs/zh/index.md)

## Contributing And Security

- [Contributing](.github/CONTRIBUTING.md)
- [Security policy](.github/SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

MIT
