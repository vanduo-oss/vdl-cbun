# hex-grid — spec delta (hex-grid-deeper-zoom)

## MODIFIED Requirements

### Requirement: hex-grid version is pinned to 1.2.0

`VD_HEX_VERSION` SHALL be `'1.2.0'` (the old line's `'0.0.1'` drift was fixed to
`'1.0.0'` at launch, patch-bumped to `'1.0.1'` for the listener-cleanup fix,
minor-bumped to `'1.1.0'` for the adaptive render/DPR/culling release, and
minor-bumped to `'1.2.0'` for configurable zoom) and MUST equal the `hex-grid`
entry in `component-versions.json`; the class's `static VERSION` mirror follows
the constant.

#### Scenario: version constant matches the manifest

- **GIVEN** the hex-grid core and `component-versions.json`
- **WHEN** `VD_HEX_VERSION` and `VdHexGridCore.VERSION` are compared against the
  manifest's `hex-grid` value
- **THEN** all three are exactly `'1.2.0'`

## ADDED Requirements

### Requirement: configurable zoom limits and anchored zoom

The core SHALL accept optional `minScale` (default `0.3`), `maxScale` (default
`3.0`), `zoomFactor` (default `0.1`), and `zoomStep` (default `1.2`) constructor
options and expose them as instance fields. Every zoom path — wheel and pinch
gestures, `zoomIn()`, `zoomOut()`, `scaleAround()`, and `resetView()` — MUST
clamp `transform.scale` into `[minScale, maxScale]`. The core SHALL provide
`scaleAround(factor, localX, localY)`, which multiplies the current scale by
`factor`, preserves the canvas-local anchor's screen position, emits `zoom`,
re-renders synchronously when the scale changed, and returns the instance.
`zoomIn()` and `zoomOut()` SHALL zoom by `zoomStep` (and `1 / zoomStep`) anchored
at the viewport centre, matching the `draw` component. A runtime
`setZoomLimits({ minScale, maxScale, zoomFactor, zoomStep })` setter SHALL apply
only finite positive values, keep `minScale <= maxScale`, reject `zoomStep <= 1`,
reclamp the current scale into the new range, and return the instance. Wheel and
pinch gestures MUST keep using rAF-coalesced gesture rendering rather than the
synchronous `scaleAround` render path.

#### Scenario: custom limits allow deeper zoom than the default

- **GIVEN** a grid constructed with `maxScale: 20` and `minScale: 0.05`
- **WHEN** `zoomIn()` is called repeatedly until the scale stops changing
- **THEN** `transform.scale` equals `20` and never exceeds `maxScale`

#### Scenario: scaleAround preserves the anchored point

- **GIVEN** a grid with a non-identity transform and a stub canvas rect
- **WHEN** `scaleAround(2, localX, localY)` is called
- **THEN** the world coordinate under `(localX, localY)` is unchanged, the scale
  doubles (clamped to the limits), and a `zoom` event is emitted

#### Scenario: zoom buttons anchor at the viewport centre

- **GIVEN** a grid whose canvas rect is `{ width: 400, height: 300 }` and a
  transform that is not centred on the world origin
- **WHEN** `zoomIn()` is called
- **THEN** the world point at the canvas centre stays fixed while the scale is
  multiplied by `zoomStep`

#### Scenario: setZoomLimits reclamps the current scale

- **GIVEN** a grid at `transform.scale = 3` with default limits
- **WHEN** `setZoomLimits({ maxScale: 1 })` is called
- **THEN** `transform.scale` becomes `1`, a `zoom` event is emitted, and
  subsequent `zoomIn()` calls cannot exceed `1`

#### Scenario: invalid limits are ignored

- **GIVEN** a grid with default limits
- **WHEN** `setZoomLimits({ maxScale: -1, zoomStep: 0.5 })` is called
- **THEN** `maxScale` is still `3` and `zoomStep` is still `1.2`
