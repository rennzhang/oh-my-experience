---
title: Setup Guide
status: active
---

# Setup Guide

For a first run, start with [Quickstart](quickstart.md). This guide covers
install and configuration details.

## Install the CLI

Run the latest published CLI directly with `npx`:

```bash
npx oh-my-experience@latest init
```

Or install the command globally:

```bash
npm install -g oh-my-experience
ome init
```

Global installation adds the `ome` command to your shell. `ome init` starts the
setup wizard, chooses a library path, installs the default provider hook and
skill, and writes starter cards so you can verify recall immediately.

For local development from source:

```bash
git clone https://github.com/rennzhang/oh-my-experience.git
cd oh-my-experience
npm install
npm run build
node bin/ome.js init
```

**Have your agent do it:**

```text
Help me set up Oh My Experience.

1. Run `npx oh-my-experience@latest init` and accept the default library path.
2. Run `npx oh-my-experience@latest doctor` to verify the library, config, and hook state.
3. Run `npx oh-my-experience@latest hook status --provider codex` to check the Codex hook state.

Report each result. If anything writes hooks, changes config, or needs my confirmation, call it out first.
```

After initialization, copy the printed first task to your agent to experience
starter card recall.

You can re-run `ome init` later. If a library already exists, the wizard
shows the current config as defaults.

## Scripted initialization

For non-interactive environments:

```bash
npx oh-my-experience@latest init -y --data-dir ~/.oh-my-experience
```

`-y` skips interactive prompts for scripts, CI, or agent runners. Passing
`--data-dir` explicitly prevents setup from targeting the wrong library.

## Configure data directory

You can move it later to any dedicated local directory:

```bash
ome config preview dataDir ~/Documents/Oh-My-Experience  # Preview changes
ome config set dataDir ~/Documents/Oh-My-Experience      # Execute migration
ome doctor                                                # Confirm success
```

`dataDir` controls the global library and runtime state. It does not move
project libraries. Project libraries are always discovered at
`<project-root>/.oh-my-experience/`; initialize one with `ome project init` when
the repository should carry its own cards.

## Install Agent Entry Points

```bash
ome hook status --provider codex     # Check current hook state
ome init --provider claude            # Add Claude hook and skill
ome init --provider all               # Install both agents
```

Interactive `ome init` lets you choose `codex`, `claude`, `all`, or `none`.
Codex is the best-tested path today, but OME is a hook-based recall layer, not
a Codex-only tool. For each selected agent, OME installs the prompt-time hook
and bundled skill. The wizard shows paths before writing.

## Uninstall

```bash
ome uninstall                         # Remove hooks and skills, keep library
ome uninstall --provider all          # Remove all provider hooks and skills
ome uninstall --delete-library --yes  # Delete all local data
```

Default uninstall removes prompt-time recall entry points and keeps the
library. Use `--delete-library` only when you intentionally want to remove
all local cards, reflect runs, and logs.

## Spool (optional)

OME can optionally integrate with the Spool CLI, a local AI session index
that unifies Claude, Codex, Gemini, and other agent histories. Core
functionality works without it. Interactive `ome init` asks whether to enable
Spool only when the CLI is already detected; otherwise it shows this install
command for later:

```bash
npm install -g @spool-lab/cli
```

OME does not install Spool during first setup. Scripted init (`-y`, dry-run)
never prompts for Spool. See [Source Scan](source-scan.md).
