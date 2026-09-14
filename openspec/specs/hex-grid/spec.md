# hex-grid Specification

## Purpose
Hex-grid canvas component, hex-math helpers, and Vue wrapper on
`./hex-grid` and `./hex-grid/hex-math`.

## Requirements

### Requirement: hex-grid subpath exports the wrapper primary and the canvas core

The `./hex-grid` subpath entry SHALL export the Vue wrapper `VdHexGrid` as
the primary surface and SHALL re-export the framework-agnostic canvas core
class aliased as `VdHexGridCore`, plus `VD_HEX_VERSION`. The core and
`hex-math.js` are already vanilla-free in the old repo and MUST be copied
as-is (no excision); the class-internal `window.matchMedia`
prefers-color-scheme listener is runtime theme detection and SHALL stay. The
entry MUST use named exports only. The component ships NO stylesheet — it is
canvas-rendered and SHALL read its colors from `--vd-*` design tokens via
`getComputedStyle`, falling back to legacy token names and then to built-in
defaults.

#### Scenario: wrapper and core are importable from one subpath

- **GIVEN** a Vue 3 project with `@vanduo-oss/vdl-cbun` installed
- **WHEN** it executes
  `import { VdHexGrid, VdHexGridCore } from '@vanduo-oss/vdl-cbun/hex-grid'`
- **THEN** `VdHexGrid` is a mountable Vue component and `VdHexGridCore` is
  the canvas grid class constructible against a DOM element

#### Scenario: theme colors come from --vd-* tokens

- **GIVEN** a host document whose root defines `--vd-color-primary` and
  `--vd-bg-primary`
- **WHEN** a grid instance resolves its theme colors
- **THEN** the `--vd-*` values are used, and in a document without them the
  legacy token names and then the built-in defaults apply

### Requirement: hex-math ships as a pure standalone subpath

The `./hex-grid/hex-math` subpath SHALL expose the pure hex-math module
copied verbatim: `rotatePoint`, `unrotatePoint`, `hexToPixel`, `pixelToHex`,
`axialRound`, `getHexCorners`, `getAdjacentHexes`, `hexDistance`,
`isPassable`, `getMovementCost`, `getTerrainYields`, `getTerrainColor`, and
the frozen tables `TerrainType`, `TERRAIN_COLORS`, `DEFAULT_TERRAIN_COLOR`,
`TERRAIN_YIELDS`, `TERRAIN_MOVEMENT_COSTS`. The module MUST stay free of DOM
and `window` access so it is importable in any JavaScript runtime.

#### Scenario: hex-math works without a DOM

- **GIVEN** a plain Node process
- **WHEN** `hexToPixel(2, 3, 30)` and
  `pixelToHex(result.x, result.y, 30)` are called from
  `@vanduo-oss/vdl-cbun/hex-grid/hex-math`
- **THEN** the round trip returns `{ q: 2, r: 3 }` with no DOM or window
  access

### Requirement: hex-grid core type declarations are authored

The old repo ships no core `.d.ts` (only `vue.d.ts`). This change SHALL
author `core.d.ts` (grid class options, methods, events) and `hex-math.d.ts`
(all functions and frozen tables) strictly from the source JSDoc, plus the
`index.d.ts` entry surface re-exporting wrapper and core types. The
declarations MUST compile under `tsc --strict` and match the runtime exports.

#### Scenario: typed consumer compiles

- **GIVEN** a TypeScript consumer with strict mode enabled
- **WHEN** it imports `VdHexGrid`, `VdHexGridCore`, and hex-math functions
  from the subpath entries and type-checks constructor options and method
  signatures
- **THEN** `tsc --noEmit` passes with the authored declarations

### Requirement: hex-grid version is pinned to 1.1.0

`VD_HEX_VERSION` SHALL be `'1.1.0'` (the old line's `'0.0.1'` drift was fixed to `'1.0.0'` at launch, patch-bumped to `'1.0.1'` for the listener-cleanup fix, and minor-bumped to `'1.1.0'` for the adaptive render/DPR/culling release) and MUST equal the `hex-grid` entry in `component-versions.json`; the class's `static VERSION` mirror follows the constant.

#### Scenario: version constant matches the manifest

- **GIVEN** the hex-grid core and `component-versions.json`
- **WHEN** `VD_HEX_VERSION` and `VdHexGridCore.VERSION` are compared against the manifest's `hex-grid` value
- **THEN** all three are exactly `'1.1.0'`

### Requirement: hex-math purity test coverage

The repo SHALL provide vitest coverage running in a plain Node environment
(no DOM, proving purity) for the hex-math module: `rotatePoint`/
`unrotatePoint` inverse round trips, `hexToPixel`/`pixelToHex` round trips
with and without rotation, `axialRound` for positive and negative fractional
coordinates, `getHexCorners` count/geometry, `getAdjacentHexes` and
`hexDistance`, and the terrain tables (`isPassable`, `getMovementCost`,
`getTerrainYields`, `getTerrainColor` including the
`DEFAULT_TERRAIN_COLOR` fallback for unknown terrain).

#### Scenario: coordinate round trips hold in node

- **GIVEN** the hex-math spec running under vitest's node environment
- **WHEN** `hexToPixel(2, 1, 30, -Math.PI / 6)` is fed back through
  `pixelToHex` with the same size and rotation
- **THEN** the result is `{ q: 2, r: 1 }` and no `window`/`document` access
  occurs

### Requirement: hex-grid theme-reading and wrapper test coverage

The repo SHALL provide vitest coverage (jsdom, with the shared 2d-context stub) for hex-grid theme-color resolution — `--vd-*` tokens win, legacy token names are the first fallback, built-in defaults the last — and a `VdHexGrid` mount spec (mount constructs the core against a stubbed canvas context, `select` events forward as Vue events, unmount destroys the instance). The suite MUST assert `VD_HEX_VERSION === '1.1.0'` and that it equals the `hex-grid` entry of `component-versions.json`.

#### Scenario: token fallback chain resolves in order

- **GIVEN** a probe root whose style defines `--vd-color-primary` but not `--color-primary`, and another defining only the legacy name, and a third defining neither
- **WHEN** the grid resolves its theme colors against each root
- **THEN** it uses the `--vd-*` value, then the legacy value, then the built-in default, respectively

#### Scenario: version constant is pinned

- **GIVEN** the hex-grid unit suite
- **WHEN** it compares `VD_HEX_VERSION` and `VdHexGridCore.VERSION` with `component-versions.json`
- **THEN** the test fails unless all are exactly `'1.1.0'`

### Requirement: hex-grid real-canvas smoke coverage

The Playwright smoke suite SHALL include a hex-grid spec against a harness
page importing the BUILT `dist/hex-grid/index.js` (import map for `vue`),
adapted from the old repo's `hex-harness.html` with `--vd-*` tokens on the
page. It MUST assert real canvas painting — `getImageData` sampling shows
non-background pixels influenced by the page's `--vd-*` tokens — plus at
least one interaction (click selects a hex and emits `select`).

#### Scenario: built hex-grid entry paints a real canvas

- **GIVEN** `pnpm build` has produced `dist/hex-grid/index.js` and the
  harness page defines `--vd-*` tokens
- **WHEN** the Playwright spec creates a grid and samples the canvas pixels
- **THEN** sampled pixels differ from the blank background (the grid really
  painted) consistent with the token-derived colors, and clicking a hex
  updates the selection and fires `select`

### Requirement: destroy() removes every canvas listener

`_setupEvents` attaches its canvas listeners (pointerdown / pointermove / pointerup / pointerleave / click / wheel / touchstart / touchmove / touchend / mouseenter / mouseleave) via stored, named handler references, and `destroy()` SHALL remove every one of them (in addition to disconnecting the theme observer and the `prefers-color-scheme` media handler). Because the canvas can be caller-supplied and reused across grid instances, no canvas listener may outlive the grid.

#### Scenario: destroy() detaches all canvas listeners

- **GIVEN** a `VdHexGrid` constructed over a caller-supplied `<canvas>` whose `addEventListener` / `removeEventListener` are observed
- **WHEN** `destroy()` is called
- **THEN** every `(type, handler)` pair the grid attached to the canvas is removed with the same handler reference — no listener is left attached

### Requirement: device-pixel-ratio-aware canvas sizing

The core SHALL accept a `pixelRatio` option of `number | 'auto'`, defaulting to `'auto'`, where `'auto'` resolves to `min(devicePixelRatio || 1, 2)`. The canvas backing store MUST be sized to `CSS width × ratio` and `CSS height × ratio`, and all drawing MUST be performed under `ctx.setTransform(ratio, 0, 0, ratio, 0, 0)` so world and CSS coordinates are unchanged and `getBoundingClientRect`-based hit-testing needs no adjustment. `pixelRatio: 1` MUST reproduce the pre-change backing store size exactly. A runtime `setPixelRatio(ratio)` setter SHALL re-apply the ratio and re-render without regenerating the grid.

#### Scenario: auto ratio scales the backing store on HiDPI

- **GIVEN** a host page whose `devicePixelRatio` is 2 and a grid constructed with default options
- **WHEN** the grid renders
- **THEN** `canvas.width === Math.round(cssWidth * 2)`, `canvas.height === Math.round(cssHeight * 2)`, and a `setTransform` call with `2, 0, 0, 2, 0, 0` was issued

#### Scenario: explicit pixelRatio 1 keeps a 1:1 buffer

- **GIVEN** a grid constructed with `pixelRatio: 1`
- **WHEN** the grid renders
- **THEN** `canvas.width` equals the canvas CSS width and `canvas.height` equals its CSS height

### Requirement: viewport culling with a spatial bucket index

The core SHALL accept a `cull` option, defaulting to `true`. When culling is enabled, a render MUST draw only the hexes whose center lies within the visible world rect (derived by inverting the current pan/zoom transform against the canvas rect and expanding by the hex radius), and MUST NOT issue a `beginPath` for off-screen cells. The core MUST maintain a spatial bucket index (`Map<"bx,by", HexCell[]>`, bucket size `max(size * 2, 64)`) that is rebuilt whenever the grid is regenerated (`setSize`, `setDimensions`, `setRotation`, `reset`, and construction). The selected hex MUST always be drawn even when outside the viewport. `cull: false` MUST restore whole-grid iteration and identical pre-change `customRenderCallback` fan-out.

#### Scenario: zoomed-in render draws fewer cells than the grid total

- **GIVEN** a grid large enough that the viewport shows only a subset, with a non-identity zoom transform
- **WHEN** the grid renders
- **THEN** the number of `beginPath` draws is strictly less than the total hex count and equals the culled visible count

#### Scenario: culling suppresses off-screen custom render callbacks

- **GIVEN** a grid with `cull: true` and a `customRenderCallback` installed
- **WHEN** the viewport shows only part of the grid
- **THEN** the callback fires only for the visible cells

#### Scenario: disabling culling restores full iteration

- **GIVEN** the same zoomed-in grid constructed with `cull: false`
- **WHEN** the grid renders
- **THEN** every hex is drawn, matching the pre-change behavior

#### Scenario: selected hex is drawn outside the culled loop

- **GIVEN** a grid with a selected hex scrolled off screen
- **WHEN** the grid renders
- **THEN** the selected hex is still drawn

### Requirement: adaptive rAF-coalesced gesture rendering

Pan (`pointermove`) and zoom (`wheel`, touch pinch) interactions MUST NOT redraw synchronously per event. Transform updates from gestures MUST be coalesced through `requestAnimationFrame` so at most one render occurs per animation frame. When the visible cell count exceeds `FAST_RENDER_LIMIT` (8000), the gesture frame MAY blit the last sharp frame snapshot (`_frameCanvas`, captured with the transform it was rendered at) offset and scaled for the current transform, and a sharp culled re-render MUST be scheduled after `SHARP_IDLE_MS` (120 ms) of transform inactivity and on pointer up / touch end. When the visible count is at or below the limit the gesture frame MUST be a sharp culled render. All data and explicit APIs (`setHexFill`, `setHexTerrain`, `setHexData`, `setDimensions`, `resetView`, `setCustomRender`, `fillRandom`, the theme observer, and click selection) MUST remain synchronous sharp renders.

#### Scenario: a large-grid gesture blits instead of flooding sharp renders

- **GIVEN** a grid whose visible cell count exceeds `FAST_RENDER_LIMIT`
- **WHEN** a sequence of pointermove events is dispatched within one animation frame
- **THEN** the transform updates coalesce to a single `drawImage` blit (no per-event sharp path rebuild), and after the idle timeout a sharp culled render occurs

#### Scenario: a small-grid gesture renders sharply per frame

- **GIVEN** a grid whose visible cell count is at or below `FAST_RENDER_LIMIT`
- **WHEN** a pointermove gesture occurs
- **THEN** the frame is a sharp culled render and no blit is used

#### Scenario: explicit data APIs stay synchronous

- **GIVEN** a grid with a large visible cell count
- **WHEN** `setHexFill` (or any other data API) is called
- **THEN** a sharp culled render is performed synchronously in the same call, independent of the gesture scheduler

### Requirement: render observability

The core SHALL provide `getVisibleHexes(): HexCell[]` returning the cells intersecting the current viewport, and `getRenderStats(): { total, visible, drawn, mode, lastRenderMs, pixelRatio, scale }` describing the last frame, where `mode` is `'sharp'` or `'fast'`, `drawn` is the number of hexes actually drawn, and `lastRenderMs` is a finite number. Fast blit frames MUST also report `total` (the full hex count), `visible` (the current culled visible count when culling is enabled, otherwise the full hex count), and `drawn: 0` (no vector hexes were drawn that frame), so stats stay consistent with the transform in effect. The Vue wrapper SHALL expose `pixelRatio` and `cull` props that are applied through dedicated setters without regenerating the grid.

#### Scenario: stats reflect the last frame

- **GIVEN** a grid rendered with culling
- **WHEN** `getRenderStats()` is called
- **THEN** it returns the total and visible counts, a `drawn` count no greater than `visible`, a `mode` of `'sharp'` or `'fast'`, a finite `lastRenderMs`, the effective `pixelRatio`, and the current `scale`

#### Scenario: fast frames report visible cells with no vector draws

- **GIVEN** a grid with culling enabled above `FAST_RENDER_LIMIT` during a pan/zoom gesture
- **WHEN** a fast blit frame completes
- **THEN** `mode` is `'fast'`, `total` equals the grid size, `visible` equals `getVisibleHexes().length`, and `drawn` is `0`

#### Scenario: visible hexes match the culled set

- **GIVEN** a grid with a non-identity transform
- **WHEN** `getVisibleHexes()` is called
- **THEN** every returned hex intersects the visible rect and the count equals `getRenderStats().visible`

#### Scenario: wrapper props apply without grid regeneration

- **GIVEN** a mounted `<VdHexGrid :cull="false" :pixel-ratio="1" />`
- **WHEN** the `cull` or `pixelRatio` prop changes
- **THEN** the core instance is preserved, its option is updated via the corresponding setter, and the hex count is unchanged

### Requirement: destroy() cancels scheduled work and releases the frame canvas

`destroy()` MUST cancel any pending `requestAnimationFrame`, clear any pending sharp-render timeout, and release the offscreen frame canvas (`_frameCanvas` / `_frameCtx`) in addition to removing every canvas listener and disconnecting the theme observer and `prefers-color-scheme` media handler.

#### Scenario: destroy() cancels a pending gesture render

- **GIVEN** a grid with a scheduled (pending) gesture render frame or sharp-render timeout
- **WHEN** `destroy()` is called
- **THEN** the pending animation frame is cancelled, the timeout is cleared, and `_frameCanvas` is released
