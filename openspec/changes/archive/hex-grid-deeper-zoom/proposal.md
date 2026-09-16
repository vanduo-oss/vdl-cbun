# hex-grid deeper zoom

## Why

The hex-grid zoom range is hardcoded (`ZOOM_MIN = 0.3`, `ZOOM_MAX = 3.0`,
`ZOOM_FACTOR = 0.1`) in `src/hex-grid/core.js`. The bounds are absolute on
`transform.scale`, so a host that fits a large grid into its viewport (fitted
scale `< 0.3`) cannot zoom out below the fit without the `−` path clamping
*upward*, and cannot zoom in far enough for close inspection. Hex Earth needs
roughly 20× its fitted scale to inspect a local situation.

## What changes

- `VdHexGrid` accepts optional `minScale` (0.3), `maxScale` (3.0),
  `zoomFactor` (0.1), and `zoomStep` (1.2) constructor options.
- New `scaleAround(factor, localX, localY)` zooms about a canvas-local anchor,
  mirroring `VdDraw.scaleAround`.
- New `setZoomLimits({ minScale, maxScale, zoomFactor, zoomStep })` runtime
  setter.
- `zoomIn()`/`zoomOut()` anchor at the viewport centre and step by `zoomStep`.
- `resetView()` reclamps its scale into the instance range.
- Wheel and pinch keep rAF-coalesced gesture rendering but clamp against the
  instance limits and use `zoomFactor`.

## Components touched

`hex-grid` only. `code-editor`, `draw`, and `music-player` are untouched
(`draw` has the same hardcoded-limits pattern; a follow-up may mirror the
options there).

## Semver impact

- Per-component: `hex-grid` `1.1.0` → `1.2.0` (new optional API, backward
  compatible).
- Bundle: unchanged at `1.0.0` (this repo is not npm-published; consumers pin
  git commits).

## Non-goals

- Changing the `draw`, `code-editor`, or `music-player` components.
- New interaction modes (keyboard zoom, double-click zoom, zoom sliders).
- Changing the `zoom` event payload shape or the default zoom behaviour of
  existing consumers.
- Exposing the new options as `VdHexGrid` Vue-wrapper props.

## Verification

`pnpm lint`, `pnpm format:check`, `pnpm stylelint`, `pnpm test`, `pnpm build`,
`pnpm test:types`, `pnpm test:e2e`. The build's esbuild metafile isolation
check must still pass (no new inputs, no new externals).
