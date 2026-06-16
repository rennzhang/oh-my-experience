# Release runbook

This is the single maintainer entry for OME releases. It exists to prevent
mixing the local npm publish path with the GitHub Trusted Publishing path.

## Standard flow

Use this flow for normal releases:

1. Start from a clean worktree on `main`.
2. Prepare the release locally:

```bash
npm run release:prepare -- patch
```

3. Review `package.json`, `package-lock.json`, and `CHANGELOG.md`.
4. Commit the release.
5. Create and push the release tag:

```bash
git tag v$(node -p "require('./package.json').version")
git push origin main
git push origin v$(node -p "require('./package.json').version")
```

6. GitHub Actions publishes npm through Trusted Publishing.
7. Cloudflare Pages deploys docs from the pushed `main` branch.

## Never do this in the normal path

Do not run local `npm publish` for a normal release.

Local npm publish still requires npm account OTP/browser verification. That is
expected npm behavior, not a broken OME setup. The normal release path is the
tag-triggered GitHub Actions workflow:

```text
tag push -> .github/workflows/npm-publish.yml -> npm Trusted Publishing
```

Use local `npm publish` only for an emergency recovery after explicitly deciding
to bypass the standard workflow.

## Verification

After the GitHub Actions run completes:

```bash
npm view oh-my-experience version --registry=https://registry.npmjs.org/
npx oh-my-experience@latest --version
npx oh-my-experience@latest init --help
```

After Cloudflare Pages finishes:

- Open the public homepage.
- Open Quickstart.
- Open Examples.
- Open the Chinese homepage.
- Confirm search works.

## Supporting docs

- npm setup: `docs/internal/npm-trusted-publishing.md`
- docs deployment setup: `docs/internal/cloudflare-pages.md`
- launch checklist: `docs/internal/launch-checklist.md`
