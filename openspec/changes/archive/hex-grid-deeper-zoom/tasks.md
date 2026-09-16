# Tasks

- [ ] `src/hex-grid/core.js`: replace the module zoom constants with
      `DEFAULT_MIN_SCALE` / `DEFAULT_MAX_SCALE` / `DEFAULT_ZOOM_FACTOR` /
      `DEFAULT_ZOOM_STEP`; add the four constructor options and instance fields.
- [ ] `src/hex-grid/core.js`: add `_clampScale`, `_applyZoom`, public
      `scaleAround`, `setZoomLimits`, and `_zoomAtCentre`; make `zoomIn`/
      `zoomOut` centre-anchored; reclamp `resetView`.
- [ ] `src/hex-grid/core.js`: wheel and pinch use `zoomFactor` and the instance
      limits with rAF-coalesced gesture rendering.
- [ ] `src/hex-grid/core.d.ts` + `src/hex-grid/index.d.ts`: declare the new
      options, `HexZoomLimits`, fields, and methods.
- [ ] Bump `VD_HEX_VERSION` to `1.2.0` and sync `src/index.js`,
      `component-versions.json`, `README.md`, `SKILL.md`, `CHANGELOG.md`.
- [ ] Add `tests/hex-grid/zoom.spec.ts`; update version assertions in
      `tests/hex-grid/theme.spec.ts`, `tests/smoke.spec.ts`,
      `tests/e2e/hex-grid.spec.ts`.
- [ ] Run `pnpm lint`, `pnpm format:check`, `pnpm stylelint`, `pnpm test`.
- [ ] Run `pnpm build` and confirm the esbuild metafile tree-shake/isolation
      checks pass and `dist/hex-grid/index.js` contains `scaleAround` /
      `setZoomLimits`.
- [ ] Run `pnpm test:types` and `pnpm test:e2e`.
- [ ] Archive this change with `openspec archive hex-grid-deeper-zoom --yes`.
