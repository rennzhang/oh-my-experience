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
setup wizard, chooses a library path, installs the default provider hook, and
writes starter cards so you can verify recall immediately.

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

You can point it anywhere, including an Obsidian vault:

```bash
ome config preview dataDir ~/Obsidian/Oh-My-Experience   # Preview changes
ome config set dataDir ~/Obsidian/Oh-My-Experience       # Execute migration
ome doctor                                                # Confirm success
```

`dataDir` controls the global library and runtime state. It does not move
project libraries. Project libraries are always discovered at
`<project-root>/.oh-my-experience/`; initialize one with `ome project init` when
the repository should carry its own cards.

## Install hooks

```bash
ome hook status --provider codex     # Check current state
ome init --provider claude            # Add Claude hook
ome init --provider all               # Install both
```

`ome init` configures the Codex hook and installs the bundled OME skill by
default. The wizard shows hook file paths before writing.

## Uninstall

```bash
ome uninstall                         # Remove hooks, keep library
ome uninstall --provider all          # Remove all provider hooks
ome uninstall --delete-library --yes  # Delete all local data
```

Default uninstall removes prompt-time recall entry points and keeps the
library. Use `--delete-library` only when you intentionally want to remove
all local cards, reflect runs, and logs.

## Spool (optional)

OME can optionally integrate with the Spool CLI, a local AI session index
that unifies Claude, Codex, Gemini, and other agent histories. Core
functionality works without it. Interactive `ome init` asks whether to install
the Spool CLI after core setup:

```bash
npm install -g @spool-lab/cli
```

OME does not install the Spool desktop client. Scripted init (`-y`, dry-run)
never prompts for Spool. See [Import Sources](import-sources.md).
