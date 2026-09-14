// Entry for @vanduo-oss/vdl-cbun/draw.
//
// The Vue 3 wrapper is the primary export; the framework-agnostic editor core
// is re-exported alongside as VdDrawCore. Named exports only — no default.

export { VdDraw } from './vue.js';
export { VdDraw as VdDrawCore } from './core.js';
export { VD_DRAW_VERSION, DRAW_TOOLS, DRAW_SHAPE_TYPES, BRUSH_PRESETS } from './shapes.js';
