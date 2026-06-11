# Troubleshoot And Eval

Use this reference when OME behavior fails or when validating changes.

## First Checks

```bash
ome doctor --json
ome hook status --json
ome stats --json
```

Provider-specific hook checks:

```bash
ome hook status --provider codex --json
ome hook status --provider claude --json
ome init --provider codex --dry-run --json
ome init --provider claude --dry-run --json
```

## Common Failure Areas

- Config points at the wrong data directory.
- Index is stale after card changes.
- Hook is installed but not trusted by the host app.
- Hook command points at an old binary.
- Spool is missing or returns unsupported output.
- Eval fixtures accidentally target the real user library.

Prefer repair commands over manual file edits when the CLI provides them:

```bash
ome doctor --repair-index
```

## Local Validation

For normal source changes:

```bash
npm run check
npm test
```

For recall and hook behavior:

```bash
ome eval recall --suite tests/fixtures/eval/core.json --limit 8 --threshold 40
ome hook run --json
```

For release or dogfood validation:

```bash
npm run validate:dogfood
```

Dogfood validation must use isolated temp data unless the user explicitly asks for a real self-use path.

## Packaged Path Smoke

Use this when checking the published-user path without publishing:

```bash
npm pack
npm install -g ./oh-my-experience-*.tgz
ome version
ome init
ome doctor
```

Do not publish, push, or modify real hooks without explicit user confirmation.
