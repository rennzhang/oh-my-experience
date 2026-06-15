---
title: Quickstart
status: active
---

# Quickstart

This guide gets you to the first useful OME moment: initialize the library,
then send a real task to your agent and see whether OME recall appears
automatically.

## 1. Initialize

```bash
npx oh-my-experience@latest init
```

This runs the latest published OME CLI through npm, creates your local
experience library, and lets you choose which supported agents to connect. For
each selected agent, OME installs the prompt-time hook and bundled skill. Codex
is the best-tested path today; Claude uses the same hook runtime. It is safe to
rerun.

To install the command globally instead:

```bash
npm install -g oh-my-experience
ome init
```

## 2. Send a real task to your agent

Copy this to your agent:

```text
Based on this checkout redesign plan: create a single-file checkout page prototype.
Create a goal and start now. Finish the whole change end to end and verify it yourself.

Before changing files, mention whether OME recalled any relevant experience.
If it did, explain the card in one short sentence and then continue normally.
```

The installed hook handles recall at prompt time. You should not need to run a
manual search command just to prove setup works. The built-in starter cards make
the first automatic recall possible before you have written your own cards.

## 3. Check health when needed

Use health checks when setup looks wrong or before a release:

```bash
npx oh-my-experience@latest doctor
npx oh-my-experience@latest hook status --provider codex
npx oh-my-experience@latest hook status --provider claude
```

`doctor` checks the library, config, package identity, hooks, skills, and card schema.
It is useful for troubleshooting, but the first product proof should be recall,
not a green status screen.

## 4. Next steps

- Create your first approved card: [First Experience Card](first-card.md)
- See the end-to-end `/goal` example: [Examples](examples.md)
- Use a repository-local library: [Global And Project Libraries](project-libraries.md)
- Configure Codex or Claude directly: [Codex](codex.md), [Claude](claude.md)

## Quick reference

| I want to... | Command |
|-------------|---------|
| Initialize OME | `npx oh-my-experience@latest init` |
| Check health | `npx oh-my-experience@latest doctor` |
| Inspect hooks | `npx oh-my-experience@latest hook status --provider codex` |
| Create a project library | `npx oh-my-experience@latest project init` |
| Start a retrospective | `npx oh-my-experience@latest reflect start --focus "focus area"` |

For local development from source, use `node bin/ome.js` after
`npm install && npm run build`.
