// Hand-written declarations for the ./draw subpath entry.
// The Vue wrapper VdDraw is the primary export; the framework-agnostic editor
// core is re-exported as VdDrawCore. Named exports only.

export {
  VdDraw,
  type VdDrawDocument,
  type VdDrawProps,
  type VdDrawEmits,
  type VdDrawExposed,
} from './vue';

export { VdDraw as VdDrawCore } from './core';

export { VD_DRAW_VERSION, DRAW_TOOLS, DRAW_SHAPE_TYPES, BRUSH_PRESETS } from './shapes';

export type {
  DrawTool,
  DrawShapeType,
  BrushName,
  BrushPreset,
  DrawViewport,
  DrawPoint,
  DrawShape,
  DrawDocument,
  DrawBounds,
  DrawChangeEvent,
  DrawSelectEvent,
  DrawViewportEvent,
  DrawHistoryEvent,
  DrawEventMap,
  VdDrawOptions,
  StylePatch,
} from './core';
