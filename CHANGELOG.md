# Changelog

All notable changes to `@vanduo-oss/vdl-cbun` are documented here.

## Unreleased

- `./hex-grid` — `1.2.0`: configurable zoom limits. New `minScale`, `maxScale`,
  `zoomFactor`, and `zoomStep` constructor options, a `setZoomLimits()` runtime
  setter, and `scaleAround(factor, localX, localY)` to zoom about an anchor.
  `zoomIn()`/`zoomOut()` now anchor at the viewport centre and use `zoomStep`
  (default `1.2`); `resetView()` reclamps into the instance range. Defaults
  (`0.3` / `3` / `0.1`) preserve the previous behaviour for existing consumers.

## 1.0.0 — 2026-09-14

First public release of `@vanduo-oss/vdl-cbun` — Vanduo Labs miscellaneous
Vue 3 component bundle extracted 1-to-1 from `@vanduo-oss/vd3-cbun@1.4.2`:

- `./code-editor` (+ `./code-editor/highlight`, `./code-editor/css`) — `1.1.0`
- `./draw` (+ `./draw/css`) — `1.1.0`
- `./hex-grid` (+ `./hex-grid/hex-math`) — `1.1.0`
- `./music-player` (+ `./music-player/css`) — `1.0.1`

Root `.` exports frozen `VDL_CBUN_VERSIONS` only. APIs stay `Vd*` with `--vd-*`
tokens and `vd3-*.css` filenames. Charts and flowchart are not included
(see `@vanduo-oss/vd3-charts` / `@vanduo-oss/vd3-flowchart`).
