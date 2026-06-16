<p align="center">
  <img src="docs/public/brand/ome-logo-lockup.png" alt="Oh My Experience (OME)" width="560">
</p>

<h1 align="center">Oh My Experience</h1>

<p align="center"><strong>Stop teaching your agent the same lesson twice.</strong></p>
<p align="center">A local prompt-time recall layer for reviewed coding-agent lessons.</p>

<p align="center">
  <a href="https://github.com/rennzhang/oh-my-experience/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/rennzhang/oh-my-experience/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/oh-my-experience"><img alt="npm version" src="https://img.shields.io/npm/v/oh-my-experience.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Node.js 20 plus" src="https://img.shields.io/badge/node-20%2B-339933.svg">
  <img alt="Local-first" src="https://img.shields.io/badge/local--first-yes-111827.svg">
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">Chinese</a> ·
  <a href="docs/index.md">Documentation</a>
</p>

Oh My Experience is a local-first experience layer for AI coding agents. It
turns real Codex and Claude corrections into reviewed experience cards, then
recalls the right lesson at prompt time before the agent repeats the same
mistake.

## Quick Try

```bash
npx oh-my-experience@latest init
```

Then send a real task to your agent:

```text
Create a goal and start now: in /tmp/ome-todo-demo, build a small single-page Todo app with plain HTML, CSS, and JavaScript.
It should let me add tasks, mark tasks complete, delete tasks, clear completed tasks, show the remaining count, persist tasks in localStorage, and look usable on a narrow mobile viewport.
Verify it through the real browser entry before reporting completion.
After finishing, guide me through the OME lifecycle: scan this full run, summarize reusable lessons, review the generated drafts with me, and only add approved drafts to the experience library.
```

The installed hook handles recall automatically. For troubleshooting, ask your
agent to inspect recall; users should not need a separate search command for
the first successful run.

## Why OME

`AGENTS.md` and `CLAUDE.md` are good for stable project maps and always-on
rules. Skills package repeatable workflows. Memory stores facts and long-term
context.

OME stores a different thing: execution judgment from real work.

Rules are always-on. OME is conditional memory for execution judgment.

OME is not a replacement for memory, `AGENTS.md`, `CLAUDE.md`, or skills. It
recalls reviewed execution lessons only when the current task needs them.

Most hard-won lessons are conditional: they matter for UI validation, release
work, Git safety, review, or one specific project. OME keeps those lessons out
of always-on context and recalls them only when the current task is likely to
need them.

## What You Get

- Local-first recall: no network calls on the prompt-time path.
- Draft approval before recall: `candidate -> draft -> active -> archived`.
- Codex and Claude hooks using the same local runtime.
- Global libraries plus optional project libraries at `.oh-my-experience/`.
- Explainable matching with scores, reasons, and compact injected context.
- Evaluation fixtures for checking missed or noisy recall before release.

## Local By Default

- No cloud service or account.
- No embedding API.
- No LLM call on the hook path.
- Raw prompt logging is opt-in.
- Hook failures fail open so your agent is not blocked.

## Example

When you use Codex with a `/goal`-style request:

```text
Create a goal and start now: in /tmp/ome-todo-demo, build a small single-page
Todo app. It should support add, complete, delete, clear completed, remaining
count, localStorage persistence, and browser verification.
```

OME can recall the approved card `Enter full-closure delivery mode when a goal
starts` before Codex starts. The useful part is not the underlying command; it
is that the agent sees the right execution judgment before acting.

The recalled card tells the agent:

```text
When the user says `/goal`, `create a goal`, `use goal`, `start now`,
`start executing the goal`, `run a long task`, or asks to move a set of
requirements into goal execution, treat it as an execution startup protocol,
not as ordinary goal copy. Default execution rules:

1. Before starting, clarify the goal, scope, non-scope, real completion
   criteria, and itemized acceptance checklist. If the goal is cut too small,
   call out the scope risk and include the user-confirmed requirements in the
   same goal.
2. Execute systematically from the full plan, anchored to the source of truth,
   story, roadmap, design plan, or user wording. Do not drift in direction or
   stop after the first visible slice.
3. Close every planned feature end to end. Do not ship half-finished work, happy
   paths only, UI shells, partial APIs, placeholders, fake routes, hidden test
   entries, in-memory substitutes, fake external actions, or fallbacks that
   create two versions of the truth.
4. Keep implementation maintainable, extensible, robust, and resilient. Split
   modules on real boundaries, keep responsibilities clear, and clean directly
   related dead or dirty logic when needed. Do not add abstract layers for an
   imagined future.
5. Validate through real entries and real user paths. Commands, features,
   states, docs, and evidence must cover the checklist. A successful command,
   local smoke test, or finished code change is not completion by itself.
6. For complex or high-risk goals, run a self-review after implementation. When
   needed, dispatch an external model or review flow to check direction drift,
   feature completeness, real usability, architecture quality, and
   maintainability.
7. Completion must fail closed. If any planned feature is unfinished,
   acceptance evidence is missing, validation failed, environment blockers are
   unexplained, or risks are not stated, do not mark the goal complete. Continue
   fixing it or clearly mark it blocked.
8. Final delivery should explain the user-facing change, verified evidence,
   risks or limits, and open confirmations.
```

The key point is timing: this rule is not always loaded. It appears when the
task actually looks like goal execution, and stays out of the prompt when the
user is only discussing docs, OKRs, or what `/goal` means. See the walkthrough in
[Examples](docs/guides/examples.md).

## How It Works

```text
real session -> reflect scan -> draft approval -> confirmed active card -> prompt-time recall -> stats -> refinement
```

1. Import or inspect real coding-agent sessions.
2. Turn repeated corrections into experience drafts.
3. Approve, merge, rewrite, or reject drafts before activation.
4. Confirm what becomes active, then let hooks recall active cards when a matching task appears.

Only `active` cards are recalled. OME does not silently turn AI-generated notes
into permanent rules.

## Documentation

For local development from source:

```bash
git clone https://github.com/rennzhang/oh-my-experience.git
cd oh-my-experience
npm install
npm run build
node bin/ome.js init
```

- [Quickstart](docs/guides/quickstart.md)
- [First Experience Card](docs/guides/first-card.md)
- [Examples](docs/guides/examples.md)
- [Setup](docs/guides/setup.md)
- [Global and project libraries](docs/guides/project-libraries.md)
- [CLI Reference](docs/reference/cli.md)
- [Retrieval Engine](docs/architecture/retrieval-engine.md)
- [Chinese documentation](docs/zh/index.md)

## Contributing And Security

- [Contributing](.github/CONTRIBUTING.md)
- [Security policy](.github/SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

MIT
