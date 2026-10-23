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
ome init --provider cursor            # Add Cursor hook and skill
ome init --provider omp               # Add OMP extension and skill
ome init --provider all               # Install Codex, Claude, Cursor, and OMP
```

Interactive `ome init` lets you choose `codex`, `claude`, `cursor`, `omp`, `all`, or `none`.
Codex is the best-tested path today, but OME is a hook-based recall layer, not
a Codex-only tool. For each selected agent, OME installs the prompt-time hook
and bundled skill. The wizard shows paths before writing.

## OMP (OhMyPi)

```bash
ome init --provider omp --dry-run
ome init --provider omp
ome hook status --provider omp
ome doctor
```

OMP loads `extensions/ome-recall.ts` and `skills/oh-my-experience` from its
agent directory, normally `~/.omp/agent`. The extension listens to
`before_agent_start`, calls the existing `ome hook run` runtime, and delivers
its `additionalContext` as an OMP context message (`display: false`) for that
turn. It does not rewrite the user prompt or
system prompt, and it does not implement a separate matcher.

Use `--omp-home <agent-directory>` to select an explicit installation target.
Otherwise, OME follows OMP's environment-based directory selection. The config
root is the directory under your home named by `PI_CONFIG_DIR` (default `.omp`,
so normally `~/.omp`). Named `OMP_PROFILE` profiles use
`<config-root>/profiles/<profile>/agent` and ignore `PI_CODING_AGENT_DIR`.
An empty or `default` profile uses `PI_CODING_AGENT_DIR` when set, otherwise
`<config-root>/agent`. If `OMP_PROFILE` is unset, the legacy `PI_PROFILE` alias
is used. For an arbitrary absolute directory, use `--omp-home`.

OMP's own `--profile` flag is not passed to OME. If you launch OMP with that
flag, pass the matching agent directory explicitly when installing or inspecting:

```bash
ome init --provider omp --omp-home ~/.omp/profiles/work/agent --dry-run
ome init --provider omp --omp-home ~/.omp/profiles/work/agent
ome hook status --provider omp --omp-home ~/.omp/profiles/work/agent
ome doctor --omp-home ~/.omp/profiles/work/agent
ome uninstall --provider omp --omp-home ~/.omp/profiles/work/agent
```

Restart OMP or reload its extensions after installation. `hook status` and
`doctor` inspect installation health; use a real task in OMP to verify recall.
`--provider all` includes OMP for init and uninstall. Check each host separately
with `hook status --provider omp` (or its corresponding provider). Uninstall
removes OME's extension and skill from the selected agent directory and keeps
the experience library by default.

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
