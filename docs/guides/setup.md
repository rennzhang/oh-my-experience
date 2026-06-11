---
title: Setup Guide
status: active
---

# Setup Guide

For a first run, start with [Quickstart](quickstart.md). This guide covers
install and configuration details.

## Install

```bash
npm install -g oh-my-experience
ome init
```

Or with npx (no global install):

```bash
npx oh-my-experience init
```

`ome init` walks you through setting the library path (default
`~/.oh-my-experience`), installing the Codex hook, and writing built-in starter
cards.

**Have your agent do it:**

> Help me set up Oh My Experience. Run ome init, accept the default path. Then
> run ome doctor to verify, and ome hook status --provider codex to confirm
> the hook is active.

After initialization, copy the printed first task to your agent to experience
starter card recall.

You can re-run `ome init` later. If a library already exists, the wizard
shows the current config as defaults.

## Scripted initialization

For non-interactive environments:

```bash
ome init -y --data-dir ~/.oh-my-experience
```

## Configure data directory

You can point it anywhere, including an Obsidian vault:

```bash
ome config preview dataDir ~/Obsidian/Oh-My-Experience   # Preview changes
ome config set dataDir ~/Obsidian/Oh-My-Experience       # Execute migration
ome doctor                                                # Confirm success
```

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