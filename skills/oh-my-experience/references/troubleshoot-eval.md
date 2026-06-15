# Troubleshoot And Eval

Use this reference when OME behavior fails or when validating changes.

## First Checks

```bash
ome doctor --json
ome hook status --json
ome stats --json
```

Read `doctor` by severity: `errors` are runtime blockers; invalid active or
draft cards are errors; invalid archived cards are governance warnings because
archived cards do not enter runtime recall.

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
ome eval recall --suite tests/fixtures/eval/core.json --limit 4 --threshold 40
ome hook run --json
```

For recall engine changes, also prove the noisy-library path. The core test
suite includes a scale/noise fixture with one real card and many broad decoys;
it must keep precision and over-recall at the strict gate.

```bash
npm test
node bin/ome.js eval recall --suite tests/fixtures/eval/core.json --limit 4 --threshold 40 --min-pass-rate 1 --min-recall 1 --min-precision 1 --max-over-recall 0 --json
```

For release or dogfood validation:

```bash
npm run validate:dogfood
```

Dogfood validation must use isolated temp data unless the user explicitly asks for a real self-use path.

## Packaged Path Validation

Use this when checking the published-user path without publishing:

```bash
npm pack
npm install -g ./oh-my-experience-*.tgz
ome version
ome init
ome doctor
```

Do not publish, push, or modify real hooks without explicit user confirmation.
