// Hand-written entry declarations for @vanduo-oss/vdl-cbun/hex-grid.
// Keep in sync with src/hex-grid/index.js. The pure hex-math module is a
// separate subpath: @vanduo-oss/vdl-cbun/hex-grid/hex-math.

export { VdHexGrid } from './vue.js';
export type { VdHexGridProps, VdHexGridEmits } from './vue.js';

export { VdHexGrid as VdHexGridCore, VD_HEX_VERSION } from './core.js';
export type {
  VdHexGridOptions,
  HexZoomLimits,
  HexCell,
  HexGridTransform,
  HexRenderStats,
  VdHexGridEventMap,
  HexRenderCallback,
} from './core.js';
