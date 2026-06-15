# npm Trusted Publishing

This is an internal maintainer note. It keeps npm publishing aligned with the
community-standard OIDC flow and avoids local OTP prompts.

## npm package setting

Configure this once on npmjs.com:

- Package: `oh-my-experience`
- Settings: Trusted Publisher
- Provider: GitHub Actions
- Organization or user: `rennzhang`
- Repository: `oh-my-experience`
- Workflow filename: `npm-publish.yml`
- Environment name: leave empty unless a GitHub deployment environment is added
- Allowed action: `npm publish`

Trusted publishing uses GitHub Actions OIDC. Do not add `NPM_TOKEN` for the
normal release path.

## Standard release flow

1. Prepare the release locally:

```bash
npm run release:prepare -- patch
```

2. Review `package.json`, `package-lock.json`, and `CHANGELOG.md`.
3. Commit the release.
4. Tag and push:

```bash
git tag v$(node -p "require('./package.json').version")
git push origin main
git push origin v$(node -p "require('./package.json').version")
```

5. GitHub Actions runs `.github/workflows/npm-publish.yml`.
6. Verify:

```bash
npm view oh-my-experience version --registry=https://registry.npmjs.org/
npx oh-my-experience@latest --version
```

## Manual recovery

If a tag already exists before this workflow is available, run the
`Publish npm package` workflow manually from GitHub Actions after npm Trusted
Publisher is configured. The manual run publishes the current `main` package
version through the same OIDC path.

Use local `npm publish` only as emergency fallback. It will require npm 2FA/OTP
and should not be the normal path.
