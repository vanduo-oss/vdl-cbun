# Contributing to vdl-cbun

## Setup

Requires **Node 24** (CI) and **pnpm 10**. Consumers of the compiled package
only need **Node >= 20.19**.

```sh
pnpm install
```

## Gates

```sh
pnpm lint
pnpm format:check
pnpm stylelint
pnpm test
pnpm build
pnpm test:types
pnpm test:e2e
```

`test:types` and `test:e2e` consume `dist/` — run `pnpm build` first.
Install Chromium once: `pnpm exec playwright install chromium`.

## OpenSpec

Active changes live in `openspec/changes/`. Archive with
`openspec archive <id> --yes` so deltas merge into `openspec/specs/`.
`openspec/` is not published.

## Release

Bump `package.json` and the relevant widget VERSION constants /
`component-versions.json` / `VDL_CBUN_VERSIONS` together. `pnpm release`
builds then publishes; do not publish from a docs-only or incomplete
branch. The hardened `.npmrc` `ignore-scripts=true` skips `prepack`, so
the explicit `release` script is required.
