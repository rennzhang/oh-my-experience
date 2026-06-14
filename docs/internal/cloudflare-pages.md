# Cloudflare Pages deployment

This is an internal maintainer note. It is committed under `docs/internal/` so
the deployment path stays close to the documentation source, but VitePress
excludes this folder from the public documentation site.

## Public site

- Cloudflare Pages project: Git integration project for `rennzhang/oh-my-experience`
- Production branch: `main`
- Build command: `npm run docs:build`
- Build output directory: `docs/.vitepress/dist`
- Node.js: `20` or newer

## Standard deployment flow

Use the normal Cloudflare Pages Git integration flow. Do not use a local deploy
script as the primary release path.

1. In Cloudflare Pages, create a Git-connected project.
2. Connect the existing GitHub repository: `rennzhang/oh-my-experience`.
3. Set the production branch to `main`.
4. Set the build command to `npm run docs:build`.
5. Set the output directory to `docs/.vitepress/dist`.
6. Keep the root directory as the repository root.
7. Push to `main`; Cloudflare builds and deploys the docs automatically.

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
the release validation and `npm pack --dry-run`. It does not commit, tag,
publish to npm, push, or deploy docs. Deployment is handled by Cloudflare after
the release commit is pushed.

## Manual deploys

Avoid manual Direct Upload deploys for normal releases. Use them only for
emergency recovery or Cloudflare incident work, and record the reason in the
release notes or incident notes.
