# @vanduo-oss/vdl-cbun

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Vanduo Labs **miscellaneous component bundle** for Vue 3: code-editor, draw,
hex-grid, and music-player — Vue wrappers plus framework-agnostic cores, each
on a tree-shakeable subpath. Extracted 1-to-1 from `@vanduo-oss/vd3-cbun`
(widget versions preserved). Charts and flowchart live in
`@vanduo-oss/vd3-charts` / `@vanduo-oss/vd3-flowchart`.

This is a **Labs sibling repo**, not a public npm package. Consume it via
`link:` / workspace next to [Vanduo Labs](https://github.com/vanduo-oss/labs).

**Status: 1.0.0** (bundle). Widget constants: code-editor / draw / hex-grid
`1.1.0`, music-player `1.0.1`. APIs stay `Vd*` with `--vd-*` tokens and
`vd3-*.css` filenames from the extract.

## Install (sibling link)

Clone beside Labs (or any host app), build, then depend with `link:`:

```sh
git clone https://github.com/vanduo-oss/vdl-cbun.git
cd vdl-cbun && pnpm install && pnpm run build
```

In the host `package.json`:

```json
{
  "dependencies": {
    "@vanduo-oss/vdl-cbun": "link:../vdl-cbun"
  }
}
```

`vue >=3.3.0` is a **required** peer dependency. For correct theming, also
provide the Vanduo `--vd-*` design tokens (see [Theming](#theming)).

## Subpath-import model

```js
import { VdCodeEditor } from '@vanduo-oss/vdl-cbun/code-editor';
import { highlight, tokenize, LANGUAGES } from '@vanduo-oss/vdl-cbun/code-editor/highlight';
import '@vanduo-oss/vdl-cbun/code-editor/css';

import { VdDraw } from '@vanduo-oss/vdl-cbun/draw';
import '@vanduo-oss/vdl-cbun/draw/css';

import { VdHexGrid } from '@vanduo-oss/vdl-cbun/hex-grid';
import { hexToPixel } from '@vanduo-oss/vdl-cbun/hex-grid/hex-math';

import { VdMusicPlayer } from '@vanduo-oss/vdl-cbun/music-player';
import '@vanduo-oss/vdl-cbun/music-player/css';
```

Named exports only — no default export. Importing one subpath never pulls
another (esbuild metafile isolation). `vue` stays external. CSS filenames
and class names are preserved from cbun (`vd3-draw.css`, `.vd-draw-*`).

## Version map

```js
import { VDL_CBUN_VERSIONS } from '@vanduo-oss/vdl-cbun';
// { 'code-editor': '1.1.0', draw: '1.1.0', 'hex-grid': '1.1.0', 'music-player': '1.0.1' }
```

The root `.` export is the frozen version map only. Per-widget `VD_*_VERSION`
constants on each subpath remain load-bearing and must stay in sync with
`component-versions.json`.

## Theming

Widgets render against Vanduo `--vd-*` design tokens — the same tokens
`@vanduo-oss/vd3` defines — with built-in fallbacks. vd3 is not a package
dependency; any provider of the tokens works.

```js
import '@vanduo-oss/vd3/css';
// …or the tokens-only layer:
import '@vanduo-oss/vd3/css/core';
```

## Security

- **No bundled dependencies** — beyond the `vue` peer, nothing is bundled.
- **No `eval` / remote code execution** — the code-editor highlights and edits
  text only; draw never evaluates content.
- **Hardened install** — `.npmrc` sets `ignore-scripts=true` and related
  policies; rebuild `dist/` with `pnpm run build` before linking.

## Docs

Interactive demos live on [Vanduo Labs](https://labs.vanduo.dev/#widgets).

## License

MIT © vanduo-oss
