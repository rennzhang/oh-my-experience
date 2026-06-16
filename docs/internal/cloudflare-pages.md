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
- Current deploy mode: Direct Upload. `wrangler pages project list --json`
  reports `Git Provider: No`, so pushes to `main` do not currently trigger a
  Pages deployment.

## Standard deployment flow

The preferred long-term flow is a Cloudflare Pages Git integration:

1. In Cloudflare Pages, create a Git-connected project.
2. Connect the existing GitHub repository: `rennzhang/oh-my-experience`.
3. Set the production branch to `main`.
4. Set the build command to `npm run docs:build`.
5. Set the output directory to `docs/.vitepress/dist`.
6. Keep the root directory as the repository root.
7. Push to `main`; Cloudflare builds and deploys the docs automatically.

Until the project is restored to Git integration, use the Direct Upload release
path after pushing `main`:

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

Pull requests and non-production branches should use Cloudflare preview
deployments from the same Git integration. Keep docs and product code in the
same repository so examples, CLI behavior, and release notes move together.

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
deployment is handled by Cloudflare after the release commit is pushed to
`main` when Git integration is active. While the project remains in Direct
Upload mode, run the Direct Upload release path above.

## Manual deploys

Avoid ad hoc Direct Upload deploys. The command above is the current documented
release path only because the existing Pages project is not Git-connected. Once
Git integration is restored, return to push-triggered deployments for normal
releases.
