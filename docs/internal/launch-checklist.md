# Launch checklist

This is an internal maintainer checklist. It is intentionally kept under
`docs/internal/` and is not shown in the public documentation site.

## Pre-launch gate

- `npm run check`
- `npm test`
- `npm run docs:build`
- `npm run validate:dogfood`
- `npm pack --dry-run --json`
- Confirm `git status --short` only contains intended release files.
- Confirm English README and English docs contain no CJK characters.

## npm release

Use npm Trusted Publishing through GitHub Actions. Do not switch public docs to
npx-first until npm shows the intended version.

1. Confirm `package.json` version and `CHANGELOG.md`.
2. Run the full pre-launch gate.
3. Commit the release.
4. Tag and push:

```bash
git tag v$(node -p "require('./package.json').version")
git push origin main
git push origin v$(node -p "require('./package.json').version")
```

5. Confirm `.github/workflows/npm-publish.yml` publishes the package.
6. Verify:

```bash
npm view oh-my-experience version --json
npx oh-my-experience@latest --version
npx oh-my-experience@latest init --help
```

7. After npm shows the intended version, update README and Quickstart so the
   primary path is:

```bash
npx oh-my-experience@latest init
npx oh-my-experience@latest match "fix UI and validate in browser" --explain
```

Keep source checkout instructions as the contributor fallback.

One-time setup is documented in `docs/internal/npm-trusted-publishing.md`.

## GitHub repository settings

Repository description:

```text
Local-first prompt-time experience recall for AI coding agents.
```

Topics:

```text
ai-agents
codex
claude
developer-tools
prompt-engineering
local-first
memory
rules
typescript
```

Before public launch:

- Set the repository social preview to the OME logo lockup.
- Confirm the README badges render correctly.
- Confirm issue templates include recall quality feedback.
- Confirm the docs URL is visible from the repository About panel after the
  Cloudflare Pages URL is final.

## Docs deployment

Use Cloudflare Pages Git integration as described in
`docs/internal/cloudflare-pages.md`.

After pushing the release commit:

- Confirm the production deployment is green.
- Open the public homepage.
- Open Quickstart.
- Open Examples.
- Open the Chinese homepage.
- Confirm search works.

## Announcement assets

Prepare one short terminal demo:

```text
$ ome match "create a goal and finish this feature end to end" --explain

Matched:
- Enter full-closure delivery mode when a goal starts
  Why: task looks like real goal execution
  Rule: ome experience show agent-goal-execution --section rule
```

Prepare one sentence:

```text
Oh My Experience is a local prompt-time recall layer for reviewed coding-agent lessons.
```
