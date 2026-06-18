# Cloudflare Pages deployment

This is an internal maintainer note. It is committed under `docs/internal/` so
the deployment path stays close to the documentation source, but VitePress
excludes this folder from the public documentation site.

For the end-to-end release sequence, start from
`docs/internal/release-runbook.md`.

## Public site

- Cloudflare Pages project: `oh-my-experience`
- Public domain: `https://oh-my-experience.pages.dev`
- Production branch: `main`
- Build command: `npm run docs:build`
- Build output directory: `docs/.vitepress/dist`
- Node.js: `20` or newer
- Current Cloudflare project mode: Direct Upload. `wrangler pages project list
  --json` reports `Git Provider: No`.
- Automatic docs deployment is handled by GitHub Actions in
  `.github/workflows/pages-deploy.yml`, which builds docs and runs
  `wrangler pages deploy` against the existing Pages project.

## Standard deployment flow

Normal docs deploys use GitHub Actions:

1. Push to `main`.
2. GitHub Actions runs `.github/workflows/pages-deploy.yml`.
3. The workflow builds docs with `npm run docs:build`.
4. The workflow deploys `docs/.vitepress/dist` to the Cloudflare Pages project
   `oh-my-experience`.

Required GitHub configuration:

```bash
gh variable set CLOUDFLARE_ACCOUNT_ID --body 0cdb074276292e0c5f2ba37b142d615c
gh secret set CLOUDFLARE_API_TOKEN
```

The token should be a scoped Cloudflare API token with Account -> Cloudflare
Pages -> Edit permission for the account. Do not use a broad personal OAuth
token as the CI secret.

## Manual fallback

Use this only when GitHub Actions is unavailable or the Cloudflare secret is not
configured:

```bash
npm run docs:build
wrangler pages deploy docs/.vitepress/dist \
  --project-name oh-my-experience \
  --branch main \
  --commit-hash "$(git rev-parse HEAD)" \
  --commit-message "$(git log -1 --pretty=%s)"
wrangler pages deployment list --project-name oh-my-experience --json
```

The deployment is complete only when the latest Production deployment reports
the current commit hash as `Source`.

## Native Cloudflare Git integration

Cloudflare's native Pages Git integration cannot be enabled on the current
project because it was created as a Direct Upload project. Cloudflare documents
that Direct Upload projects cannot switch to Git integration later. To use
native Cloudflare Git integration, create a new Pages project connected to
`rennzhang/oh-my-experience`, migrate domains, and then retire the old project.
Do not delete the current project during a normal release.

## Future release preparation

```bash
npm run release:prepare -- patch
npm run release:prepare -- minor
npm run release:prepare -- 0.2.0
```

`release:prepare` only updates `package.json` and `package-lock.json`, then runs
the release validation and `npm pack --dry-run`. It does not commit, tag, push,
publish to npm, or deploy docs. npm publishing is handled by the GitHub Actions
Trusted Publishing workflow after a release tag is pushed. Documentation
deployment is handled by `.github/workflows/pages-deploy.yml` after the release
commit is pushed to `main`.

## Manual deploys

Avoid ad hoc Direct Upload deploys. Use the manual fallback only when the
GitHub Actions deployment is unavailable, then record the reason in the release
notes or handoff.
