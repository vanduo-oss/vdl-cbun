// Entry for @vanduo-oss/vdl-cbun/hex-grid.
//
// The Vue wrapper VdHexGrid is the primary surface; the framework-agnostic
// canvas core class (same name upstream) is re-exported as VdHexGridCore.
// Named exports only. Canvas-rendered — this component ships no stylesheet;
// the pure hex-math module has its own subpath (./hex-grid/hex-math).

export { VdHexGrid } from './vue.js';
export { VdHexGrid as VdHexGridCore, VD_HEX_VERSION } from './core.js';
