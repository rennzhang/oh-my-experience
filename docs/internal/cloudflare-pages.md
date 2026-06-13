# Cloudflare Pages deployment

This is an internal maintainer note. It is committed under `docs/internal/` so
the deployment path stays close to the documentation source, but VitePress
excludes this folder from the public documentation site.

## Public site

- Cloudflare Pages project: `oh-my-experience`
- Production branch: `main`
- Build command: `npm run docs:build`
- Build output directory: `docs/.vitepress/dist`
- Node.js: `20` or newer

## One-command docs deploy

Create the Pages project once if it does not exist:

```bash
npx wrangler pages project create oh-my-experience --production-branch main
```

Then deploy:

```bash
npm run docs:deploy
```

The script always rebuilds the VitePress site before uploading
`docs/.vitepress/dist` with Wrangler Direct Upload.

Optional overrides:

```bash
CF_PAGES_PROJECT_NAME=oh-my-experience CF_PAGES_BRANCH=main npm run docs:deploy
```

## Future release preparation

```bash
npm run release:prepare -- patch
npm run release:prepare -- minor
npm run release:prepare -- 0.2.0
```

`release:prepare` only updates `package.json` and `package-lock.json`, then runs
the release validation and `npm pack --dry-run`. It does not commit, tag,
publish to npm, push, or deploy docs. Those steps remain explicit maintainer
actions.

## Preferred long-term setup

For public docs, prefer Cloudflare Pages Git integration:

1. Connect the GitHub repository.
2. Use `main` as the production branch.
3. Set the build command to `npm run docs:build`.
4. Set the output directory to `docs/.vitepress/dist`.
5. Keep `npm run docs:deploy` as the manual fallback path.
