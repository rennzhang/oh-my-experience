# Contributing

Thanks for improving Oh My Experience. This project is a local-first TypeScript
CLI for AI coding-agent experience recall.

## Development Setup

```bash
npm ci
npm run build
npm run check
npm test
```

Use Node.js 20 or newer.

## Project Shape

- `packages/core/` owns cards, storage, matching, retrieval, stats, and doctor logic.
- `packages/cli/` owns command parsing and user-facing command flow.
- `packages/hook-runtime/` owns the fast prompt-time recall path.
- `packages/adapters/` owns provider and source integration edges.
- `skills/oh-my-experience/` contains bundled agent-facing workflow instructions.
- `templates/` and `examples/` contain public card authoring material.
- `docs/` contains public guides, reference, architecture notes, and docs assets.

Keep changes inside the narrowest layer that owns the behavior. Do not create a
second write path for cards, reflect runs, indexes, hooks, or config; use the CLI
and core helpers as the source of truth.

## Pull Request Checklist

- Run `npm run check`.
- Run `npm test` for behavior changes.
- Run `npm run docs:build` for docs navigation or VitePress changes.
- Run `npm pack --dry-run` for package layout, README, docs asset, or release changes.
- Add or update tests when changing matching, retrieval, lifecycle, config, hook, or CLI behavior.
- Keep hook runtime fast and fail-open: no LLM calls, no network calls, no session imports, and no active-card writes.

## Docs And Language

User-facing docs are maintained in English and Simplified Chinese where the topic
is part of the main user path. If you update `README.md`, check whether
`README.zh-CN.md` also needs the same operational detail.

## Release Notes

Update `CHANGELOG.md` for user-visible changes. Use short entries that describe
the user impact rather than the internal diff.
