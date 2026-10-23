# Setup And Hooks

Use this reference for install, init, config, and hook setup.

## Default Flow

```bash
npx oh-my-experience@latest init
```

After setup, send a real task to the agent. The installed hook should recall
active experiences automatically; the user should not need to run `ome match`
as the first success path.

For a global install:

```bash
npm install -g oh-my-experience
ome init
```

For this checkout:

```bash
npm install
npm run build
node bin/ome.js init
```

Run `ome doctor` when setup looks wrong, before release validation, or when the
user explicitly asks for a health check. Do not make `doctor` or manual
`ome match` the first success moment; the user should see the agent use recall
on a real task.

## Init Behavior

- `ome init` is interactive by default in a real terminal.
- `ome init -y` is the non-interactive scripted setup path.
- `ome init` can be rerun. Existing config becomes defaults; confirmed settings are updated.
- `ome init --reset-config` restores runtime config defaults without deleting cards, sessions, retrospective runs, or other experience assets.
- `ome init --no-hook` initializes or updates the library only. It does not install agent hooks or bundled skills.
- Keep setup simple: data directory, supported agent choice, confirmation, then one completion view with the first task and optional suggestions.
- Interactive `ome init` asks users which supported agents to connect (`codex`, `claude`, `cursor`, `omp`, `all`, or `none`). Codex can remain the default because it is the best-tested path, but the product must not describe OME as Codex-only.
- For each selected agent, install both the prompt-time hook and the bundled OME skill. `codex` writes `~/.codex/hooks.json` plus `~/.codex/skills/oh-my-experience`; `claude` writes `~/.claude/settings.json` plus `~/.claude/skills/oh-my-experience`; `cursor` writes `~/.cursor/hooks.json` plus `~/.cursor/skills/oh-my-experience`. `omp` writes `extensions/ome-recall.ts` and `skills/oh-my-experience` under the resolved OMP agent directory; see OMP below.
- Spool belongs in the same setup flow, not as a post-completion step. If Spool CLI is detected, ask whether to enable it as a source before confirmation. If Spool CLI is not detected, show a short install-later note in the completion view and do not prompt to install it.
- Never install Spool during first setup. `ome init -y`, JSON, dry-run, and other non-interactive setup paths must not prompt for or install Spool.
- Do not expose removed language or project-level install options.

## Config

Inspect before changing:

```bash
ome config get
ome config preview dataDir ~/Documents/Oh-My-Experience
```

Apply only after the user confirms the path:

```bash
ome config set dataDir ~/Documents/Oh-My-Experience
```

## Hook Policy

OME uses global hooks with project-aware card applicability. Do not ask the user to choose project-level hook installation.

Inspect before writing:

```bash
ome init --provider codex --dry-run
ome hook status --provider codex
ome init --provider claude --dry-run
ome hook status --provider claude
ome init --provider cursor --dry-run
ome hook status --provider cursor
```

Only after explicit user confirmation:

```bash
ome init --provider codex
ome init --provider claude
ome init --provider cursor
```

Use dry-run when exploring:

```bash
ome init --provider codex --dry-run
ome init --provider claude --dry-run
ome init --provider cursor --dry-run
```

Codex App may still require the user to trust the hook after installation.

Uninstall only when explicitly requested:

```bash
ome uninstall --provider codex
ome uninstall --provider claude
ome uninstall --provider cursor
```

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

## Advanced Scheduling

Periodic retrospectives are not part of the built-in setup workflow. OME does
not install schedulers, write OS scheduler config, or run a daemon. Treat
scheduling as an advanced docs pattern, and only help configure a host after the
user explicitly asks and confirms the target.
