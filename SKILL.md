---
name: vanduo-vdl-cbun
description: Use when adding Vanduo Labs widgets with @vanduo-oss/vdl-cbun — Vue 3 miscellaneous bundle (code-editor, draw, hex-grid, music-player) with tree-shakeable subpath exports. Covers install, per-subpath imports, CSS, theming, and per-component versioning.
---

# @vanduo-oss/vdl-cbun

One bundle, four Vue 3 widgets, each on its own tree-shakeable subpath
(`./code-editor`, `./draw`, `./hex-grid`, `./music-player`).
`vue >=3.3.0` is a required peer. The root import exposes only
`VDL_CBUN_VERSIONS` — the per-component VERSION map. Every subpath re-exports
the Vue wrapper AND the framework-agnostic core alongside it (the core
aliased with a `Core` suffix where the names collide). Charts and flowchart
are **not** in this package — use `@vanduo-oss/vd3-charts` /
`@vanduo-oss/vd3-flowchart`.

## Install (sibling link)

Not on npm. Clone beside Labs (or any host), build, then depend with `link:`:

```json
"@vanduo-oss/vdl-cbun": "link:../vdl-cbun"
```

Import each component from its own subpath; nothing registers globally. For
correct theming, provide the Vanduo `--vd-*` design tokens.

## Code editor

```js
import { VdCodeEditor, VdCodeEditorCore } from '@vanduo-oss/vdl-cbun/code-editor';
import { highlight, tokenize, LANGUAGES } from '@vanduo-oss/vdl-cbun/code-editor/highlight';
import '@vanduo-oss/vdl-cbun/code-editor/css';
```

`./code-editor/highlight` is tokenizer-only (no editor / Vue). CSS at
`@vanduo-oss/vdl-cbun/code-editor/css`. `VD_CODE_EDITOR_VERSION` is `1.1.0`.

## Draw

```js
import { VdDraw, VdDrawCore } from '@vanduo-oss/vdl-cbun/draw';
import '@vanduo-oss/vdl-cbun/draw/css';
```

`VD_DRAW_VERSION` is `1.1.0`.

## Hex grid

```js
import { VdHexGrid, VdHexGridCore } from '@vanduo-oss/vdl-cbun/hex-grid';
import { hexToPixel, TerrainType } from '@vanduo-oss/vdl-cbun/hex-grid/hex-math';
```

No CSS subpath — canvas themed via `--vd-*` tokens. `VD_HEX_VERSION` is `1.2.0`.
Zoom limits are configurable per instance (`minScale`, `maxScale`, `zoomFactor`,
`zoomStep`) and via `setZoomLimits()`; `scaleAround(factor, localX, localY)`
zooms about an anchor and `zoomIn()`/`zoomOut()` are centre-anchored.

## Music player

```js
import { VdMusicPlayer, MusicPlayer } from '@vanduo-oss/vdl-cbun/music-player';
import '@vanduo-oss/vdl-cbun/music-player/css';
```

`VD_MUSIC_PLAYER_VERSION` is `1.0.1`.

## Version map

```js
import { VDL_CBUN_VERSIONS } from '@vanduo-oss/vdl-cbun';
```

## Theming

Provide `--vd-*` tokens (e.g. `@vanduo-oss/vd3/css` or `/css/core`). CSS class
names and `vd3-*.css` filenames are preserved from the vd3-cbun extract.
