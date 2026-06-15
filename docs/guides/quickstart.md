---
title: Quickstart
status: active
---

# Quickstart

This guide gets you to the first useful OME moment: install the CLI, initialize
the library, and see which experience card would be recalled for a real coding
task.

## 1. Install

```bash
git clone https://github.com/rennzhang/oh-my-experience.git
cd oh-my-experience
npm install
npm run build
```

This uses the current checkout before the `0.1.0` package is published to npm.
After that release is available, the shorter path will be:

```bash
npx oh-my-experience@latest init
```

## 2. Initialize

Copy this to your agent:

```text
Help me set up Oh My Experience:

1. Run `node bin/ome.js init` and keep the default library path unless there is a clear reason to change it.
2. Report whether Codex or Claude hook installation needs my confirmation.
3. Do not start a retrospective scan yet.
```

`init` creates your local experience library, installs the OME Codex skill, and
can install the prompt-time hook for supported agents. It is safe to rerun.

## 3. See a recall explanation

Copy this to your agent:

```text
Show me one OME recall example:

node bin/ome.js match "fix login page UI and validate in browser" --explain

Explain which card matched, why it matched, and what compact context would be injected.
```

The built-in starter cards make this work before you have written your own
cards. The match output is intentionally a candidate list: the agent must still
judge whether the card fits the current task before using the full rule.

## 4. Check health when needed

Use health checks when setup looks wrong or before a release:

```bash
node bin/ome.js doctor
node bin/ome.js hook status --provider codex
node bin/ome.js hook status --provider claude
```

`doctor` checks the library, config, package identity, hooks, and card schema.
It is useful for troubleshooting, but the first product proof should be recall,
not a green status screen.

## 5. Next steps

- Create your first reviewed card: [First Experience Card](first-card.md)
- See the end-to-end `/goal` example: [Examples](examples.md)
- Use a repository-local library: [Global And Project Libraries](project-libraries.md)
- Configure Codex or Claude hooks directly: [Codex](codex.md), [Claude](claude.md)

## Quick reference

| I want to... | Command |
|-------------|---------|
| Initialize OME | `node bin/ome.js init` |
| Test recall | `node bin/ome.js match "task description" --explain` |
| Check health | `node bin/ome.js doctor` |
| Inspect hooks | `node bin/ome.js hook status --provider codex` |
| Create a project library | `node bin/ome.js project init` |
| Start a retrospective | `node bin/ome.js reflect start --focus "focus area"` |
