---
title: Quickstart
status: active
---

# Quickstart

This guide gets you to the first useful OME moment: initialize the library and
see which experience card would be recalled for a real coding task.

## 1. Initialize

```bash
npx oh-my-experience@latest init
```

This runs the latest published OME CLI through npm, creates your local
experience library, installs the OME Codex skill, and can install prompt-time
hooks for supported agents. It is safe to rerun.

To install the command globally instead:

```bash
npm install -g oh-my-experience
ome init
```

## 2. See a recall explanation

Copy this to your agent:

```text
Show me one OME recall example:

npx oh-my-experience@latest match "fix login page UI and validate in browser" --explain

Explain which card matched, why it matched, and what compact context would be injected.
```

The built-in starter cards make this work before you have written your own
cards. The match output is intentionally a candidate list: the agent must still
judge whether the card fits the current task before using the full rule.

## 3. Check health when needed

Use health checks when setup looks wrong or before a release:

```bash
npx oh-my-experience@latest doctor
npx oh-my-experience@latest hook status --provider codex
npx oh-my-experience@latest hook status --provider claude
```

`doctor` checks the library, config, package identity, hooks, and card schema.
It is useful for troubleshooting, but the first product proof should be recall,
not a green status screen.

## 4. Next steps

- Create your first approved card: [First Experience Card](first-card.md)
- See the end-to-end `/goal` example: [Examples](examples.md)
- Use a repository-local library: [Global And Project Libraries](project-libraries.md)
- Configure Codex or Claude hooks directly: [Codex](codex.md), [Claude](claude.md)

## Quick reference

| I want to... | Command |
|-------------|---------|
| Initialize OME | `npx oh-my-experience@latest init` |
| Test recall | `npx oh-my-experience@latest match "task description" --explain` |
| Check health | `npx oh-my-experience@latest doctor` |
| Inspect hooks | `npx oh-my-experience@latest hook status --provider codex` |
| Create a project library | `npx oh-my-experience@latest project init` |
| Start a retrospective | `npx oh-my-experience@latest reflect start --focus "focus area"` |

For local development from source, use `node bin/ome.js` after
`npm install && npm run build`.
