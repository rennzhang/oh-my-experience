# Setup And Hooks

Use this reference for install, init, config, and hook setup.

## Default Flow

```bash
npx oh-my-experience init
npx oh-my-experience doctor
```

For a global install:

```bash
npm install -g oh-my-experience
ome init
ome doctor
```

For this checkout:

```bash
npm install
npm run build
node bin/ome.js init
node bin/ome.js doctor
```

## Init Behavior

- `ome init` is interactive by default in a real terminal.
- `ome init -y` is the non-interactive scripted setup path.
- `ome init` can be rerun. Existing config becomes defaults; confirmed settings are updated.
- `ome init --reset-config` restores runtime config defaults without deleting cards, sessions, retrospective runs, or other experience assets.
- Keep setup simple: data directory, default Codex recall, confirmation.
- Interactive `ome init` may add one optional Spool CLI stage after core setup succeeds. Introduce Spool as a local AI session index, compare the paths clearly (without Spool: current conversation plus explicit Codex local imports; with Spool: index-first lookup across cross-agent local history, on-demand evidence, lower token use, and cleaner context than dumping raw sessions with think traces and tool logs), recommend the CLI for multi-agent users, show `https://github.com/spool-lab/spool`, and make clear OME installs only the CLI package (`npm install -g @spool-lab/cli`), not the Spool desktop client.
- Never install Spool silently. `ome init -y`, JSON, dry-run, and other non-interactive setup paths must not prompt for or install Spool.
- Do not expose removed language or project-level install options.

## Config

Inspect before changing:

```bash
ome config get
ome config preview dataDir ~/Obsidian/Oh-My-Experience
```

Apply only after the user confirms the path:

```bash
ome config set dataDir ~/Obsidian/Oh-My-Experience
```

## Hook Policy

OME uses global hooks with project-aware card applicability. Do not ask the user to choose project-level hook installation.

Inspect before writing:

```bash
ome init --provider codex --dry-run
ome hook status --provider codex
ome init --provider claude --dry-run
ome hook status --provider claude
```

Only after explicit user confirmation:

```bash
ome init --provider codex
ome init --provider claude
```

Use dry-run when exploring:

```bash
ome init --provider codex --dry-run
ome init --provider claude --dry-run
```

Codex App may still require the user to trust the hook after installation.

Uninstall only when explicitly requested:

```bash
ome uninstall --provider codex
ome uninstall --provider claude
```

## Advanced Scheduling

Periodic retrospectives are not part of the built-in setup workflow. OME does
not install schedulers, write OS scheduler config, or run a daemon. Treat
scheduling as an advanced docs pattern, and only help configure a host after the
user explicitly asks and confirms the target.
