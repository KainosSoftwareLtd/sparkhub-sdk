# sparkhub-sdk

Monorepo for the SparkHub partner-app client SDKs.

| Package | Purpose | Source |
|---|---|---|
| [`@sparkhub/sdk`](./packages/sdk) | Framework-agnostic OAuth client + authenticated `fetch` for partner apps | [packages/sdk](./packages/sdk) |
| [`@sparkhub/react`](./packages/react) | React Provider + hooks + components built on top of `@sparkhub/sdk` | [packages/react](./packages/react) |

## Why two packages

Industry-standard split — `@sparkhub/sdk` is framework-agnostic (vanilla JS, Vue, Svelte, server-side, etc.); `@sparkhub/react` adds React-specific bindings. Same pattern as `@clerk/clerk-js` + `@clerk/clerk-react`, `@stripe/stripe-js` + `@stripe/react-stripe-js`. Tree-shaking stays clean for vanilla-JS consumers.

## Install

Both packages are distributed as GitHub Release tarballs (npm publish deferred). Install the latest from the [Releases page](https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases):

```bash
npm i \
  https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases/download/v0.2.0/sparkhub-sdk-0.2.0.tgz \
  https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases/download/v0.2.0/sparkhub-react-0.2.0.tgz
```

Versions are locked in step — `v0.X.Y` tags produce matching `sparkhub-sdk-X.Y.Z.tgz` and `sparkhub-react-X.Y.Z.tgz` from the same source.

For usage docs, see each package's own README ([`@sparkhub/sdk`](./packages/sdk/README.md), [`@sparkhub/react`](./packages/react/README.md)).

## Developing locally

This is an npm workspaces monorepo. From the repo root:

```bash
npm install           # installs all workspaces
npm run build         # builds every package
npm test              # runs Vitest across all packages
npm run type-check    # tsc --noEmit across all packages
```

To work on a single package:

```bash
npm -w @sparkhub/sdk run build
npm -w @sparkhub/react run type-check
```

## Releasing

Tag a version (lockstep across both packages):

```bash
# Update version in BOTH packages/sdk/package.json AND packages/react/package.json
# Commit, then:
git tag v0.3.0
git push origin v0.3.0
```

The release workflow (`.github/workflows/release.yml`) verifies version consistency, builds both packages, packs both tarballs, and creates a single GitHub Release with both attached.

## Examples

- [`examples/vanilla-html`](./examples/vanilla-html) — minimal HTML + `@sparkhub/sdk`, no framework
- [`examples/minimal-react`](./examples/minimal-react) — Vite + React + both packages

Plus the deployable demo at [`KainosSoftwareLtd/sparkhub-partner-app-demo`](https://github.com/KainosSoftwareLtd/sparkhub-partner-app-demo) — Vercel-deployed reference partner app.

## License

MIT
