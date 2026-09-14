# draw Specification

## Purpose
SVG infinite-canvas draw editor: brush engine, shape tools, Catmull-Rom
smooth lines, and the thin `VdDraw` Vue wrapper on `./draw`.

## Requirements

### Requirement: draw subpath exports the Vue wrapper and framework-agnostic core

The `./draw` subpath entry SHALL export `VdDraw` (the Vue 3 wrapper) as its primary surface, alongside the framework-agnostic core (aliased `VdDrawCore`), the `VD_DRAW_VERSION` constant, and the read-only enumerations `DRAW_TOOLS`, `DRAW_SHAPE_TYPES`, and `BRUSH_PRESETS`. The entry MUST use named exports only (no `export default`), and the core MUST NOT import `vue`.

#### Scenario: consumer imports wrapper and core from the subpath

- **GIVEN** a Vue 3 project with `@vanduo-oss/vdl-cbun` installed
- **WHEN** it executes `import { VdDraw, VdDrawCore, VD_DRAW_VERSION, DRAW_TOOLS, DRAW_SHAPE_TYPES, BRUSH_PRESETS } from '@vanduo-oss/vdl-cbun/draw'`
- **THEN** `VdDraw` is a mountable Vue component, `new VdDrawCore({ element })` constructs a working editor, `VD_DRAW_VERSION` is the string `'1.1.0'`, and `DRAW_TOOLS` / `DRAW_SHAPE_TYPES` / `BRUSH_PRESETS` are frozen enumerations — all named exports with no default

### Requirement: SVG infinite canvas with pan and zoom

The core SHALL render into a single `<svg>` whose world `<g>` carries a `matrix(scale 0 0 scale x y)` transform driven by a `viewport` of `{ x, y, scale }`. Panning (dragging empty canvas, or the hand tool) MUST translate the world in screen space without changing `scale`. Wheel / pinch zoom MUST anchor the world point under the pointer or touch midpoint (zoom-to-cursor) and MUST clamp `scale` to a fixed `[MIN_SCALE, MAX_SCALE]` range. Multi-touch gestures with two active pointers MUST perform simultaneous pinch-to-zoom and two-finger panning. SVG element rendering MUST be incremental using an internal element cache (`_shapeElements` Map) and batched via `requestAnimationFrame` (`_scheduleRender`) so unchanged shape DOM nodes are preserved across frames. A grid MUST be rendered as an SVG `<pattern>` inside the world group so it pans and zooms with the content.

#### Scenario: panning translates the world without changing scale

- **GIVEN** a mounted editor with the hand tool active (or an empty-canvas pointer drag)
- **WHEN** the user drags from one point to another
- **THEN** `viewport.x` / `viewport.y` change by the screen-space delta, `viewport.scale` is unchanged, and the world `<g>` transform reflects the new translation

#### Scenario: wheel zoom anchors the world point under the cursor and clamps scale

- **GIVEN** a mounted editor
- **WHEN** the user wheels to zoom in over a point, then wheels past the maximum
- **THEN** the world coordinate under the cursor stays under the cursor after zooming, and `viewport.scale` never exceeds `MAX_SCALE` (nor drops below `MIN_SCALE`)

#### Scenario: incremental rendering preserves unchanged shape DOM nodes

- **GIVEN** a document containing multiple shapes rendered in the canvas
- **WHEN** a single shape is updated or a new stroke is drawn
- **THEN** existing unmodified shape `<path>`, `<rect>`, and `<g>` elements are retained in the DOM without being recreated, and only modified elements are updated

#### Scenario: multi-touch pinch-to-zoom and pan adjust viewport

- **GIVEN** a touch device with two active pointer contacts on the canvas
- **WHEN** the two fingers move apart or together and translate across the screen
- **THEN** `viewport.scale` scales proportional to the pinch distance clamped between `MIN_SCALE` and `MAX_SCALE` anchored at the touch midpoint, and `viewport.x` / `viewport.y` translate by the midpoint displacement

### Requirement: second-pointer gesture cancellation

When a second pointer contacts the canvas during an active single-pointer gesture, the gesture MUST be cancelled and the document left coherent before simultaneous pinch-to-zoom + two-finger panning begins. A cancelled `freehand`, `create-line`, or `create-box` gesture MUST delete its temporary shape. A cancelled `move` or `resize` gesture MUST restore the original geometry in the model AND re-render it to the DOM. A cancelled `erase` gesture MUST leave the model untouched and restore any shapes hidden during the drag. A cancelled `pan` gesture MUST clear the panning state, including the `.vd-draw-panning` class. The panning class MUST also be cleared when a pinch gesture ends.

#### Scenario: cancelling erase restores hidden shapes

- **GIVEN** the `eraser` tool and a shape already marked for erasure during a drag
- **WHEN** a second pointer contacts the canvas
- **THEN** the shape is still present in `toJSON().shapes` and its element is restored inside the shapes layer

#### Scenario: cancelling move restores geometry in the model and DOM

- **GIVEN** a shape being dragged to a new position
- **WHEN** a second pointer contacts the canvas
- **THEN** the shape's `x`/`y` return to their pre-drag values and the rendered element's geometry matches the model after the next render

#### Scenario: cancelling pan clears the panning state

- **GIVEN** an active `pan` gesture with the canvas carrying `.vd-draw-panning`
- **WHEN** a second pointer contacts the canvas
- **THEN** the panning class is removed and the interaction becomes a pinch

### Requirement: shape and tool set

The active tool SHALL be one of `select`, `hand`, `draw` (the brush), `eraser`, `rectangle`, `ellipse`, `line` (line-arrow), `text`, or `sticky`. With a shape tool active, a pointer drag on the canvas MUST create a shape of that type in world coordinates; the `draw` tool MUST paint a `freehand` stroke using the **active brush preset** and the **current style**; the `eraser` tool MUST remove strokes / shapes dragged across; `text` and `sticky` MUST create an editable text-bearing shape. Text shapes MUST support multi-line text wrapped into `<tspan>` elements via `wrapText(text, maxWidth, charWidth)` respecting shape width bounds. Double-clicking an existing text shape in `select` mode MUST open an inline editor pre-populated with its text. Arrow shapes (`line` with `arrow: true`) MUST render arrowhead markers dynamically matched to the shape's stroke `color` using sanitized marker definitions in `<defs>`. Shape lookup by id MUST be indexed for `O(1)` access. Every created shape MUST be appended to the document and MUST be assigned a unique id.

#### Scenario: dragging with the rectangle tool creates a rectangle

- **GIVEN** a mounted editor with the `rectangle` tool active
- **WHEN** the user presses at one world point and drags to another and releases
- **THEN** a new `rectangle` shape spanning those points exists in `toJSON().shapes` with a unique id, and a `change` event with a create reason is emitted

#### Scenario: freehand pen records the pointer path

- **GIVEN** the `draw` tool active with a brush preset and a chosen color
- **WHEN** the user drags a stroke across the canvas
- **THEN** a `freehand` shape is created carrying the active `brush`, the current `color`, and the sampled `points`, and it renders as a **filled outline** `<path>` (not a constant-width stroked line)

#### Scenario: text and sticky shapes are editable

- **GIVEN** the `text` or `sticky` tool is active
- **WHEN** the user clicks the canvas and types
- **THEN** a text-bearing shape is created and its string content is captured in the document (plain text, single run)

#### Scenario: multi-line text wraps into tspans bounded by shape width

- **GIVEN** a text shape with content longer than its allocated `width`
- **WHEN** the shape is rendered into SVG
- **THEN** `wrapText` breaks the text into lines and renders each line as a `<tspan>` with consistent line height and coordinates

#### Scenario: double-clicking existing text shape opens inline editor

- **GIVEN** a mounted editor with a text shape in `select` mode
- **WHEN** the user double-clicks on the text shape
- **THEN** the inline textarea editor opens positioned over the shape with matching text content and font size

#### Scenario: arrow markers match shape stroke color

- **GIVEN** two arrow shapes with different stroke colors (e.g. `#e11d48` and `#2563eb`)
- **WHEN** both shapes are rendered
- **THEN** dynamic `<marker>` definitions exist in `<defs>` for each color and each arrow references its color-matched marker id

### Requirement: selection, move, resize, and delete

With the `select` tool, a click MUST select the topmost shape under the point; a drag on empty canvas MUST draw a marquee that selects all intersecting shapes; holding Shift MUST extend the selection. Dragging a selected shape MUST move the whole selection in world coordinates, keeping the grab point under the cursor. Resize handles on the selection bounding box MUST display directional compass cursors (`ns-resize`, `ew-resize`, `nesw-resize`, `nwse-resize`) corresponding to handle compass points (`n`, `s`, `e`, `w`, `nw`, `ne`, `se`, `sw`) and scale the selected shape(s). Pressing Delete or Backspace MUST remove the selection. Selection state MUST be reported via a `select` event.

#### Scenario: marquee selects intersecting shapes

- **GIVEN** several shapes and the `select` tool
- **WHEN** the user drags a marquee across two of them
- **THEN** exactly those two shapes become selected and a `select` event carries their ids

#### Scenario: dragging moves the selection keeping the grab point

- **GIVEN** a selected shape
- **WHEN** the user drags it by an interior point
- **THEN** the shape follows the cursor so the grabbed world point stays under the pointer, and one `change` with a move reason is emitted on release

#### Scenario: resize handle scales the shape

- **GIVEN** a selected shape showing resize handles
- **WHEN** the user drags a corner handle
- **THEN** the shape's bounds scale accordingly and the change is committed once on release

#### Scenario: delete removes the current selection

- **GIVEN** one or more selected shapes
- **WHEN** the user presses Delete or Backspace
- **THEN** the selected shapes are removed from the document and a `change` with a delete reason is emitted

#### Scenario: compass cursors indicate resize directions

- **GIVEN** a selected shape with visible bounding box resize handles
- **WHEN** the user hovers over a north/south handle or an east/west handle
- **THEN** the cursor displays `ns-resize` and `ew-resize` respectively

### Requirement: shapes are styled from design tokens

New marks (strokes and shapes) SHALL adopt the editor's **current style** — `color`, `opacity`, and size — whose defaults derive from the design system's `--vd-*` palette (the initial `color` resolves from a `--vd-draw-*` ink token). A styling API MUST update the `color` / `opacity` / stroke width of the current selection, and those values MUST be persisted per shape in the document.

#### Scenario: default style follows the active palette

- **GIVEN** a mounted editor under a given `data-palette` / `data-theme` with no color yet picked
- **WHEN** a new mark is created with the default style
- **THEN** its `color` is the default ink resolved from the `--vd-draw-*` → `--vd-*` token layer for the active palette (captured as an explicit color on the shape)

#### Scenario: a new mark adopts the current style

- **GIVEN** a mounted editor whose current style is a specific `color` and size
- **WHEN** a new shape or stroke is created
- **THEN** it carries that `color` and size in `toJSON()` (an explicit color, not a themed placeholder)

#### Scenario: restyling the selection persists on the shapes

- **GIVEN** a selected shape
- **WHEN** the host sets a new color and width through the styling API
- **THEN** the selected shape's `color` / stroke width update in `toJSON()` and a `change` is emitted

### Requirement: z-order control

The core SHALL provide `bringForward`, `sendBackward`, `bringToFront`, and `sendToBack` operations that reorder the selected shapes within the document, where paint order equals document order. The rendered DOM order of shape elements inside the shapes layer MUST match document order, including after reordering, undo/redo (`_applySnapshot`), and `load()`, and MUST be re-established whenever the two diverge. Reordering MUST commit a change and MUST round-trip through serialization.

#### Scenario: bring to front repaints last

- **GIVEN** a shape overlapped by another
- **WHEN** the user brings it to front
- **THEN** it becomes the last shape in `toJSON().shapes` (painted on top) and a `change` is emitted

#### Scenario: reorder keeps the DOM paint order in sync

- **GIVEN** a document with three shapes rendered in the canvas
- **WHEN** a shape is brought to front, sent to back, brought forward, or sent backward (or the change is undone / redone)
- **THEN** the order of `data-shape-id` elements inside the shapes layer equals the order of `toJSON().shapes`, so the visually topmost shape is the last model shape

### Requirement: grouping

The core SHALL support grouping the current selection into a single unit (`group`) and dissolving it (`ungroup`). Grouped shapes MUST move, resize, and select as one unit, MUST carry a stable group association, and MUST round-trip through serialization.

#### Scenario: grouped shapes transform as a unit

- **GIVEN** two selected shapes
- **WHEN** the user groups them and then drags the group
- **THEN** both shapes move together by the same delta and are re-selected as the group

#### Scenario: ungroup restores independent shapes

- **GIVEN** a group
- **WHEN** the user ungroups it
- **THEN** the member shapes lose the group association while remaining individually present in `toJSON()`

### Requirement: clipboard copy, paste, and duplicate

The core SHALL provide `copy`, `cut`, `paste`, and `duplicate` over the current selection using an internal clipboard (no dependency on the async system clipboard). Pasted / duplicated shapes MUST receive fresh unique ids, MUST be offset from the source, and MUST become the new selection.

#### Scenario: duplicate offsets and reselects the copies

- **GIVEN** a selected shape
- **WHEN** the user duplicates it
- **THEN** a new shape with a fresh id appears offset from the original, the new shape is selected, and a `change` is emitted

### Requirement: snapping and alignment guides

While moving or resizing, shape edges and centers SHALL snap to nearby shape edges / centers (and optionally the grid) within a pixel threshold, and visual alignment guides MUST be shown during the drag. Snapping MUST be toggleable via a `snap` option and MUST default to enabled.

#### Scenario: moving near an aligned edge snaps and shows a guide

- **GIVEN** two shapes with `snap` enabled
- **WHEN** the user drags one so an edge comes within the snap threshold of the other's edge
- **THEN** the dragged shape's edge aligns exactly and an alignment guide is rendered for the duration of the drag

#### Scenario: snapping can be disabled

- **GIVEN** the editor constructed with `snap: false`
- **WHEN** the user drags a shape near another's edge
- **THEN** no snapping occurs and no guide is shown

### Requirement: export to SVG and PNG

The core SHALL provide `toSVG()` returning a standalone, self-contained SVG string of the current document, and `toPNG()` returning a PNG (Blob or data URL) produced by rasterizing that SVG through an offscreen canvas. Export MUST NOT embed external network assets, MUST reflect the current shapes (not the transient selection UI), and MUST embed a `<defs>` block containing all required per-color arrow `<marker>` definitions.

#### Scenario: toSVG embeds required color-matched marker defs

- **GIVEN** a document containing arrows with custom stroke colors
- **WHEN** `toSVG()` is called
- **THEN** the exported SVG string contains `<defs>` with `<marker>` elements for each stroke color, rendering arrowheads accurately in standalone viewers

#### Scenario: SVG export is self-contained

- **GIVEN** a document with several shapes
- **WHEN** `toSVG()` is called
- **THEN** it returns a valid `<svg>` string containing those shapes and no selection handles / marquee, resolvable without external requests

#### Scenario: PNG export rasterizes the document

- **GIVEN** a document with several shapes in a browser environment
- **WHEN** `toPNG()` is called
- **THEN** it resolves to PNG image data whose pixels correspond to the rendered shapes

### Requirement: undo/redo through a single change choke point

Every committed mutation MUST funnel through a single `emitChange → recordHistory` path that snapshots the whole document. History MUST support `undo` / `redo` / `canUndo` / `canRedo` / `clearHistory`, MUST coalesce consecutive same-target edits into one entry **only while the coalesce target is the top of the history stack**, MUST honor a `historyLimit`, and MUST be disable-able with `{ history: false }`. Live drag / resize MUST only re-render during the gesture and record exactly one history entry on release. Viewport pan / zoom MUST NOT be recorded in history. This fix does not change `toJSON()` output, so `VD_DRAW_VERSION` MUST stay `'1.1.0'`.

#### Scenario: undo restores the previous document

- **GIVEN** a shape was added
- **WHEN** the user invokes `undo`
- **THEN** `toJSON()` matches the pre-add document and `redo` re-adds it

#### Scenario: consecutive same-target edits coalesce

- **GIVEN** history enabled
- **WHEN** the same shape's style is updated several times in a row
- **THEN** a single `undo` reverts the whole burst (one coalesced entry)

#### Scenario: panning and zooming are not undoable

- **GIVEN** a committed content change followed by several pan / zoom operations
- **WHEN** the user invokes `undo` once
- **THEN** the content change is reverted (the camera moves are not on the history stack)

#### Scenario: history can be disabled

- **GIVEN** the editor constructed with `{ history: false }`
- **WHEN** shapes are added and `canUndo()` is queried
- **THEN** `canUndo()` is `false` and no snapshots are retained

#### Scenario: a coalescing edit after an undo does not corrupt earlier snapshots

- **GIVEN** a shape nudged (a coalesce-reason edit), then a single `undo` back to the pre-nudge snapshot (now below the top of the stack)
- **WHEN** the same shape is nudged again
- **THEN** the edit pushes a fresh snapshot (pruning the stale redo branch) instead of overwriting the restored non-top snapshot — `canRedo()` is `false`, and undoing again restores the pre-nudge state and then the empty base document

### Requirement: document serialization with version stamping and backward compatibility

`toJSON()` MUST return a deep clone of exactly `{ version, viewport, shapes }`, always stamping `version` with the current `VD_DRAW_VERSION` (never the loaded document's version). A `freehand` shape MUST serialize its `brush` (a `BRUSH_PRESETS` key), `color`, `opacity`, and `points` (each point MAY carry a third `pressure` component). `load(data)` MUST accept either an object or a JSON string and route it through `normalizeDocument()`, which MUST validate and de-duplicate shape ids, drop malformed shapes, default unknown shape types safely, and **forward-migrate** documents written by an older `VD_DRAW_VERSION` without data loss. **Deserialization MUST be bounded: `normalizeDocument()` SHALL truncate an untrusted document to at most `MAX_SHAPES` (10000) shapes and at most `MAX_POINTS_PER_SHAPE` (100000) points per shape, dropping the excess silently (never throwing), so a hostile document cannot be coerced `O(n)` and rendered into a client-side denial of service.** This truncation MUST NOT alter the serialized format of an in-range document. `VD_DRAW_VERSION` MUST be `1.1.0`.

#### Scenario: toJSON stamps the current version and key set

- **GIVEN** an editor whose loaded document declared some other version
- **WHEN** `toJSON()` is called
- **THEN** the returned object's keys are exactly `version`, `viewport`, `shapes`; `version` equals `VD_DRAW_VERSION` (`'1.1.0'`); and the result is a deep clone (mutating it does not affect the editor)

#### Scenario: a 1.0 constant-width freehand migrates to the default brush

- **GIVEN** a frozen fixture document at `VD_DRAW_VERSION` `1.0.0` whose `freehand` shapes use the old `{ points: [[x,y]], stroke, strokeWidth }` form (no `brush`)
- **WHEN** it is loaded and then `toJSON()` is called
- **THEN** each such stroke gains `brush: 'pen'`, its `stroke` becomes `color` (and `strokeWidth` informs the brush size), every point round-trips, the output `version` is `1.1.0`, and the original fixture object is not mutated

#### Scenario: an older document loads and re-serializes forward without loss

- **GIVEN** a frozen fixture document written at an earlier `VD_DRAW_VERSION`
- **WHEN** it is loaded and then `toJSON()` is called
- **THEN** every shape round-trips losslessly, the output `version` is the current `VD_DRAW_VERSION`, and the original fixture object is not mutated

#### Scenario: malformed input is normalized safely

- **GIVEN** a document containing a duplicate id, a shape of unknown type, and a non-object entry
- **WHEN** it is loaded
- **THEN** ids are made unique, the unknown type is defaulted or dropped, the non-object is discarded, and the editor does not throw

#### Scenario: an oversized untrusted document is truncated, not thrown

- **GIVEN** a document with more than `MAX_SHAPES` shapes (and a `freehand` shape with more than `MAX_POINTS_PER_SHAPE` points)
- **WHEN** it is passed to `load()`
- **THEN** `load()` does not throw or hang; `toJSON().shapes` contains at most `MAX_SHAPES` shapes and each shape's `points` contains at most `MAX_POINTS_PER_SHAPE` points, and the output `version` is `'1.1.0'`

#### Scenario: an in-range document round-trips unchanged under the caps (backward compatibility)

- **GIVEN** a document whose shape count and per-shape point counts are within the caps
- **WHEN** it is loaded and then `toJSON()` is called
- **THEN** every shape and every point round-trips losslessly, identical to the pre-caps behavior — the caps never touch a normal document

### Requirement: SSR-safe lifecycle

The core MUST NOT touch `window` / `document` at module scope and MUST be constructed only in a browser context. All `window`-level listeners (e.g. `pointerup`, `resize`) MUST be added on construction and removed on `destroy()`. `destroy()` MUST empty the host element, MUST remove every listener, and MUST be idempotent (a second call is a no-op).

#### Scenario: destroy removes listeners and is idempotent

- **GIVEN** a constructed editor
- **WHEN** `destroy()` is called twice
- **THEN** the host is emptied, all previously added `window` listeners are removed, and the second call neither throws nor double-removes

### Requirement: CSS-only theming via a --vd-draw-* token layer

The component's `styles.css` MUST define a `:root` layer of `--vd-draw-*` custom properties that read the global `--vd-*` tokens with hard-coded fallbacks, and all component **chrome** (canvas surface, grid, toolbar, panels, selection UI) MUST consume only those locals, so dark / light and palette changes flow through the CSS cascade with no JS. Canvas interactive cursors MUST reflect the active tool via `[data-tool="..."]` attributes (e.g. `grab` for hand, `text` for text, reticle for eraser) and active hand drag MUST toggle a `.vd-draw-panning` class with `cursor: grabbing`. **Marks carry an explicit `color`** the user picked and are rendered inline (they do not re-theme — a red stroke stays red in dark mode); only the initial default ink is token-derived. The `highlighter` brush MUST render with `mix-blend-mode: multiply`. SVG `<text>` MUST set `font-family` explicitly, and the locals MUST be overridable without `!important`.

#### Scenario: active tool and panning state determine canvas cursor

- **GIVEN** a mounted editor
- **WHEN** the tool changes to `hand` and an active drag begins
- **THEN** `canvasEl` has `data-tool="hand"` with `cursor: grab`, and active drag adds `.vd-draw-panning` with `cursor: grabbing`

#### Scenario: theme flip recolors through the cascade with no JS

- **GIVEN** a mounted editor with strokes drawn in an explicit color
- **WHEN** the host toggles `data-theme` from light to dark on `<html>`
- **THEN** the canvas surface / grid / chrome recompute from the changed `--vd-*` values with no JavaScript, while each mark keeps its explicit `color`

#### Scenario: consumer can retheme via the locals

- **GIVEN** the shipped stylesheet
- **WHEN** a consumer sets a `--vd-draw-surface` override on an ancestor
- **THEN** the surface color changes without needing `!important`

### Requirement: Vue wrapper maps props to the core and stays thin

`VdDraw` MUST be a thin `defineComponent` wrapper that constructs the core in `onMounted` (guarded by `typeof window !== 'undefined'`) and destroys it on unmount. Its props (`data`, `readonly`, `tool`, `gridSize`, `snap`, `history`, `historyLimit`, `autoFit`) MUST map to core options. A change to `data` MUST flow through `load()` in place without recreating the core. Changes to dynamic option props (`readonly`, `snap`, `history`, `historyLimit`) MUST invoke dedicated runtime setters on the core (`setReadonly`, `setSnap`, `setHistoryEnabled`, `setHistoryLimit`) in place without destroying or recreating the core instance, preserving active selection and document state. Structural option changes (`gridSize`) MAY recreate the core. It MUST forward `change`, `select`, `viewport`, and `ready` events, and MUST expose via the template ref: `getInstance`, `setTool`, `undo`, `redo`, `canUndo`, `canRedo`, `toSVG`, `toPNG`, `addShape`, `updateShape`, `removeShape`, `getShape`, `getShapes`, `clear`, `load`, and `toJSON`.

#### Scenario: data change loads in place without rebuild

- **GIVEN** a mounted `<VdDraw :data="doc" />`
- **WHEN** the `data` prop is replaced with a new document
- **THEN** the same core instance is reused and updated via `load()` (no destroy / recreate)

#### Scenario: option prop update applies surgically without editor rebuild

- **GIVEN** a mounted `<VdDraw :readonly="isReadonly" :snap="snapEnabled" />` with an active shape selection
- **WHEN** `readonly` or `snap` is updated
- **THEN** the core instance is preserved, its internal option is updated via the respective setter, and active selection state is retained

#### Scenario: option prop change recreates the core

- **GIVEN** a mounted `<VdDraw :grid-size="16" />`
- **WHEN** `gridSize` (or another structural option prop) changes
- **THEN** the core is destroyed and a fresh one is constructed with the new option

#### Scenario: unmount destroys the core and removes listeners

- **GIVEN** a mounted `<VdDraw />`
- **WHEN** the component is unmounted
- **THEN** the core's `destroy()` runs, the host is emptied, and all `window` listeners are removed

#### Scenario: template ref exposes shape CRUD

- **GIVEN** a mounted `<VdDraw ref="draw" />`
- **WHEN** the template ref is inspected
- **THEN** it exposes `addShape`, `updateShape`, `removeShape`, `getShape`, `getShapes`, `clear`, `load`, and `toJSON` alongside the existing undo / export helpers

### Requirement: vector brush engine

`freehand` strokes MUST be rendered by a **pure, DOM-free brush engine** (no dependency): given the sampled input `points` (each `[x, y, pressure?]`) and a brush config, it MUST produce a smoothed, variable-width **outline polygon** that renders as a filled SVG `<path>` with round caps and tapered ends. Stroke width at each point MUST be driven by pen `pressure` when present, else by **velocity** (faster = thinner), scaled by the current brush `size` and the brush's `thinning`. The engine MUST apply input smoothing / streamlining via an Exponential Moving Average (EMA) filter during capture (`smoothPoint`), MUST support progressive point simplification (`appendAndSimplify`) to prune redundant collinear points without distorting the curve, MUST be deterministic for a given input, and MUST live in `src/draw/shapes.js` so it is unit-testable in plain Node.

#### Scenario: EMA filter smooths raw pointer jitter

- **GIVEN** a noisy raw pointer coordinate sequence
- **WHEN** points are processed through `smoothPoint(prev, curr, alpha)`
- **THEN** each coordinate lerps toward the target by the smoothing coefficient, dampening sudden mechanical jitter while preserving path trajectory

#### Scenario: progressive simplification prunes redundant collinear points

- **GIVEN** an existing stroke point array and a new incoming point
- **WHEN** `appendAndSimplify(points, newPoint, minDist, tolerance)` is called
- **THEN** points closer than `minDist` are ignored, collinear runs within `tolerance` are simplified, and the resulting point count is strictly bounded

#### Scenario: a stroke becomes a filled variable-width outline

- **GIVEN** a set of input points with varying pressure and a brush config
- **WHEN** the engine computes the stroke outline
- **THEN** it returns a non-empty closed outline whose local width tracks pressure / velocity, and `pointsToBrushPath()` yields a fillable SVG path `d` string

#### Scenario: brush presets shape the stroke

- **GIVEN** the frozen `BRUSH_PRESETS` map
- **WHEN** it is read
- **THEN** it contains at least `pen`, `pencil`, `marker`, `highlighter`, and `calligraphy`, each a config (size, thinning, smoothing, taper, opacity, and — for `highlighter` — a multiply blend) that the engine consumes

### Requirement: current-style state and color palette

The editor MUST maintain a **current style** — `color`, `opacity`, brush `size`, and active `brush` — that new marks adopt, with setters (`setColor` / `setOpacity` / `setBrushSize` / `setBrush`) that emit no history entry on their own (they configure the *next* mark). It MUST render a palette UI with **swatches** (a standard spread plus colors derived from the active `--vd-*` palette), a **custom color** input, an **opacity** slider, a **size** slider, and a short **recent-colors** list that updates as colors are used.

#### Scenario: picking a color then drawing produces a stroke of that color

- **GIVEN** a mounted editor
- **WHEN** the user picks a swatch (or sets a custom color) and then draws a stroke
- **THEN** the new `freehand` shape's `color` equals the picked color, and that color is added to the recent-colors list

#### Scenario: brush size and opacity apply to new marks

- **GIVEN** the current style set to a specific size and opacity
- **WHEN** a new stroke is drawn
- **THEN** the stroke serializes that `opacity` and renders at that width

### Requirement: stroke eraser

The `eraser` tool MUST remove whole strokes / shapes whose geometry the eraser pointer path crosses (a vector stroke-eraser, not a pixel eraser). Erasing MUST commit exactly one history entry per gesture (so a single `undo` restores everything erased in that drag) and MUST emit a `change` with a delete reason.

#### Scenario: dragging the eraser removes crossed shapes

- **GIVEN** several shapes and the `eraser` tool
- **WHEN** the user drags across two of them
- **THEN** exactly those two shapes are removed from `toJSON().shapes`, one `change` with a delete reason is emitted, and a single `undo` restores both

#### Scenario: erasing hides shapes until the gesture commits

- **GIVEN** several shapes and the `eraser` tool
- **WHEN** the drag crosses a shape but the pointer has not yet been released
- **THEN** the shape is hidden from the rendered shapes layer while remaining present in `toJSON().shapes` until pointer up, and cancelling the gesture restores it

### Requirement: line-smooth-catmull-rom

`line` shapes MAY carry an optional boolean `smooth`. When `smooth` is true
and the shape has three or more points, `pointsToPath` MUST emit a Catmull-Rom
cubic SVG path so dense polylines read as curves. When `smooth` is false or
omitted, or when fewer than three points are present, the path MUST remain a
sharp polyline. Interactive two-point line creation MUST default `smooth` to
false. Loading a document that omits `smooth` MUST treat it as false.
`VD_DRAW_VERSION` MUST stay `'1.1.0'` (serialization is additive and
backward-compatible).

#### Scenario: three-plus points with smooth emit Catmull-Rom

- **GIVEN** a `line` shape with `smooth: true` and at least three points
- **WHEN** it is rendered via `pointsToPath`
- **THEN** the `d` attribute uses cubic segments (not only `L` polyline
  segments)

#### Scenario: two-point interactive lines stay sharp

- **GIVEN** a newly created interactive two-point `line`
- **WHEN** its serialized shape is inspected
- **THEN** `smooth` is false (or absent) and the path is a polyline

### Requirement: draw real-browser smoke coverage

The Playwright smoke suite SHALL include a draw spec running against a harness
page that imports the BUILT `dist/draw/index.js` (ESM, with an import map
resolving the external `vue` specifier) and mounts `VdDrawCore` with a seeded
document. It MUST assert: host/SVG mount, `VD_DRAW_VERSION === '1.1.0'`, seeded
rectangle and freehand marks present in the live SVG, a deterministic brush
stroke (via `setTool('draw')` + pointer gesture) that creates an additional
freehand, `toSVG()` returning a non-empty standalone SVG string, undo reverting
a committed shape add, and zero console errors. Multi-touch / pinch gestures
MUST NOT be required in this smoke.

#### Scenario: built draw entry mounts and exports in a real browser

- **GIVEN** `pnpm build` has produced `dist/draw/index.js` and the static test
  server is running
- **WHEN** the Playwright draw spec loads the harness
- **THEN** seeded SVG marks render, a brush stroke adds a freehand, `toSVG()`
  is non-empty, undo works, and the page logs zero console errors
