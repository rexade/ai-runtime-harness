# Milestone 4: Packaging

## What now works

- The CLI package is publishable as `ai-runtime-harness`.
- The package exposes both `ai-runtime-harness` and `ai-harness` bins.
- The packaged CLI no longer depends on repo source paths or `tsx` at runtime.
- The packaged CLI runs from a fresh external install and can:
  - attach to a harness runtime
  - list and select surfaces
  - print affordances
  - fall back to degraded browser-only mode

## Package shape

- `packages/cli` now builds two runtime files:
  - `dist/index.js`
  - `dist/mcp-server.js`
- Node-side internal harness code is bundled into those files.
- `playwright-core` and `ws` stay as bundled package dependencies instead of being inlined.
- The staged package copies:
  - built `dist`
  - `node_modules/playwright-core`
  - `node_modules/ws`

## Local pack flow

Build and test first:

```bash
corepack pnpm build
corepack pnpm test
```

Stage a clean package directory:

```bash
node scripts/stage-cli-package.mjs
```

Pack it locally with `pnpm pack`:

```bash
corepack pnpm pack --dir .package/ai-runtime-harness --pack-destination .package/tarballs
```

Install it in a fresh repo:

```bash
npm install /absolute/path/to/ai-runtime-harness-0.1.0.tgz
```

Run attach from outside `ai-runtime-harness`:

```bash
npx --no-install ai-runtime-harness attach http://localhost:5173
npx --no-install ai-runtime-harness attach http://localhost:5173 --surface game
```

Published target shape:

```bash
npx ai-runtime-harness attach http://localhost:5173
```

## Validation

- `node scripts/package-cli-smoke.mjs` proves the package path end to end.
- It stages the package, runs `pnpm pack`, installs the tarball into a fresh temp repo, and verifies:
  - attach against `ai-harness-playground`
  - surface discovery: `dashboard`, `form`, `game`, `network`
  - surface selection: `game`
  - game affordances are printed
  - degraded browser-only mode still works against a plain page

## Current limitation

- Local `pnpm pack` is run against the staged package directory, not directly against the raw workspace package.
- That is intentional for now: the workspace is still source-first and `bundledDependencies` plus pnpm’s isolated linker is awkward in-place on this Windows setup.
- The installed package itself is clean; the staging step is only for local packaging.
