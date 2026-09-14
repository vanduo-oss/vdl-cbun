# repo-scaffold Specification

## Purpose
Package metadata, multi-entry build, CI gates, version manifest, and
publish surface for `@vanduo-oss/vdl-cbun`.

## Requirements

### Requirement: package identity and exports contract

The package MUST be `@vanduo-oss/vdl-cbun`, version `1.0.0`, MIT-licensed, ESM
(`type: "module"`), with `vue >=3.3.0` declared as a REQUIRED peer dependency
(no `peerDependenciesMeta` optionality). It MUST set
`publishConfig: { "access": "public" }`. The `exports` map SHALL declare the
subpath contract: `.` (types + import only — version map), `./code-editor`,
`./code-editor/highlight`, `./draw`, `./hex-grid`, `./hex-grid/hex-math`, and
`./music-player` (each with `types`/`import`/`require` under
`dist/<component>/`), `./code-editor/css`, `./draw/css`, and
`./music-player/css` (CSS files named `vd3-<component>.css`), plus
`./package.json`. `sideEffects` MUST be `["**/*.css"]`. Charts and flowchart
MUST NOT be exported from this package.

#### Scenario: exports map declares the four-widget subpath contract

- **GIVEN** the `package.json`
- **WHEN** a consumer resolves `@vanduo-oss/vdl-cbun/draw`
- **THEN** the exports map routes `types` to `./dist/draw/index.d.ts`,
  `import` to `./dist/draw/index.js`, and `require` to
  `./dist/draw/index.cjs`, and the same shape holds for `./code-editor`,
  `./hex-grid`, `./hex-grid/hex-math`, and `./music-player`

#### Scenario: code-editor subpaths resolve to built targets

- **GIVEN** the `package.json` exports map
- **WHEN** a consumer resolves `@vanduo-oss/vdl-cbun/code-editor` and
  `@vanduo-oss/vdl-cbun/code-editor/css`
- **THEN** the first routes `types`/`import`/`require` to
  `./dist/code-editor/index.d.ts|index.js|index.cjs` and the second resolves to
  `./dist/code-editor/vd3-code-editor.css`

#### Scenario: vue is a required peer

- **GIVEN** a consumer project without `vue` installed
- **WHEN** the consumer installs `@vanduo-oss/vdl-cbun` with strict peer
  enforcement
- **THEN** the package manager reports the missing `vue >=3.3.0` peer instead
  of silently proceeding

#### Scenario: manifest is publishable

- **GIVEN** the release-ready `package.json`
- **WHEN** its publish-relevant fields are inspected
- **THEN** `version` is `1.0.0` and `publishConfig.access` is `"public"`

### Requirement: toolchain baseline

The repo MUST pin `packageManager: "pnpm@10.28.2"` and engines
`pnpm >=10` and a consumer-friendly node floor (`node >=20.19.0`). Dev/CI
Node 24 is pinned by `packageManager` and `.github/workflows/ci.yml`. It MUST
define scripts `build`, `clean`, `lint`, `format`, `format:check`,
`stylelint`, `test`, `test:types`
(`tsc --noEmit -p tests/types/tsconfig.json`), `test:e2e`, `prepack`, and
`release` (`pnpm run build && pnpm publish`).

#### Scenario: every defined script is green

- **GIVEN** a fresh clone with dependencies installed via `pnpm install`
- **WHEN** `pnpm lint`, `pnpm format:check`, `pnpm stylelint`, `pnpm test`,
  `pnpm build`, `pnpm run test:types`, and `pnpm run test:e2e` run
- **THEN** each exits with status 0

### Requirement: hardened install policy

The `.npmrc` MUST set `ignore-scripts=true`, `minimum-release-age=1440`,
`trust-policy=no-downgrade`, `block-exotic-subdeps=true`, `save-exact=true`,
`strict-peer-dependencies=true`, `registry=https://registry.npmjs.org/`, and
`minimum-release-age-exclude[]=@vanduo-oss/*`. Build-script execution SHALL
be limited to `esbuild` and `@playwright/test` via `onlyBuiltDependencies`
in `pnpm-workspace.yaml`.

#### Scenario: hardened install succeeds

- **GIVEN** the committed `.npmrc` and `pnpm-workspace.yaml`
- **WHEN** a contributor runs `pnpm install`
- **THEN** the install succeeds, third-party lifecycle scripts do not run
  except for the allow-listed build dependencies, and packages younger than
  24 hours are rejected unless scoped `@vanduo-oss/*`

### Requirement: per-component version manifest

The repo MUST ship `component-versions.json` with keys `code-editor`, `draw`,
`hex-grid`, and `music-player` only. Values MUST be `1.1.0`, `1.1.0`,
`1.1.0`, and `1.0.1` respectively. The root entry `src/index.js` SHALL export
a frozen `VDL_CBUN_VERSIONS` map whose values mirror that manifest exactly.
An automated test MUST assert the sync.

#### Scenario: version map matches the manifest

- **GIVEN** `component-versions.json` and the exported `VDL_CBUN_VERSIONS`
- **WHEN** the smoke test runs
- **THEN** the maps are deep-equal and `Object.isFrozen(VDL_CBUN_VERSIONS)` is
  true

### Requirement: CI pipeline

The repo MUST provide `.github/workflows/ci.yml` with SHA-pinned actions,
least-privilege `permissions: contents: read`, pnpm 10.28.2, Node 24.
Gates run: frozen install, audit, lint, format:check, stylelint, test,
**build**, `test:types`, then Playwright Chromium. A `dependabot.yml` MUST
keep the pinned actions current (weekly, grouped, 2-day cooldown).

#### Scenario: CI runs the full gate sequence

- **GIVEN** a push or pull request to `main`
- **WHEN** the `ci` workflow runs
- **THEN** it executes install, audit, lint, format:check, stylelint, test,
  build, test:types, and the Playwright smoke, all with a read-only token

### Requirement: multi-entry isolation build

`scripts/build.js` MUST reset `dist/` and emit the root version map plus
isolated esm+cjs entries for code-editor (index + highlight), draw, hex-grid
(index + hex-math), and music-player. Builds SHALL be es2020, sourcemapped,
unminified, `vue` external, no IIFE. CSS copies MUST keep `vd3-<name>.css`
filenames. The metafile guard MUST fail if any input leaves `src/` or if
anything but `vue` is externalized. Importing one subpath MUST NOT pull
another.

#### Scenario: vue is never bundled

- **GIVEN** the build output
- **WHEN** any `dist/<component>/index.js` is inspected
- **THEN** `vue` appears only as an import/require specifier

#### Scenario: highlight stays editor-free

- **GIVEN** the built `dist/code-editor/highlight.js`
- **WHEN** its module graph is inspected
- **THEN** it does not pull `core.js` or `vue.js`

### Requirement: type-test harness

The repo MUST provide `tests/types/` with a strict `tsconfig.json` and a
`tests/types/api.test-d.ts` that imports the four widgets (+ highlight,
hex-math) via package self-reference so the built declarations compile.

#### Scenario: declaration drift fails the type gate

- **GIVEN** a runtime export whose hand-written declaration is missing or wrong
- **WHEN** `pnpm run test:types` runs
- **THEN** `tsc` exits non-zero pointing at the drift

### Requirement: Playwright smoke harness

The repo MUST provide a Playwright harness (`playwright.config.ts`, Chromium
only, free port **8797**) whose `webServer` runs Python `http.server` rooted
at the repo. The suite SHALL load built dist entries for draw, hex-grid,
code-editor, and music-player.

#### Scenario: harness serves the shipped artifacts

- **GIVEN** `pnpm build` output in `dist/` and `pnpm run test:e2e`
- **WHEN** a harness page loads
- **THEN** the import map resolves `vue`, the module scripts import
  `/dist/**` successfully, and the specs run against the same files
  consumers install

### Requirement: release-ready package documentation

The repo MUST ship `README.md`, `SKILL.md`, `CHANGELOG.md`, `CONTRIBUTING.md`,
and the MIT `LICENSE`. Published files MUST stay limited to `dist`,
`README.md`, `SKILL.md`, `CHANGELOG.md`, and `LICENSE`. `CHANGELOG.md` MUST
carry a dated `## 1.0.0` entry. `SKILL.md` MUST carry Agent Skills frontmatter
(`name: vanduo-vdl-cbun`).

#### Scenario: npm pack ships the docs and excludes internals

- **GIVEN** the `files` allow-list in `package.json`
- **WHEN** `pnpm pack` assembles the tarball
- **THEN** it contains `README.md`, `SKILL.md`, `CHANGELOG.md`, `LICENSE`,
  `dist/`, and `package.json` — and never `openspec/`, `tests/`, or `scripts/`

### Requirement: release-publish-configuration

`publishConfig.access` MUST be `"public"`. A `release` script MUST explicitly
run `build` before `pnpm publish` because `.npmrc` `ignore-scripts=true`
skips `prepack`.

#### Scenario: release always ships a built dist

- **GIVEN** `.npmrc` sets `ignore-scripts=true` and `dist/` is gitignored
- **WHEN** the maintainer runs `pnpm run release`
- **THEN** the full `build` runs before `pnpm publish`
