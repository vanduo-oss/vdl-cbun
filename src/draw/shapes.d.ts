// Type declarations for the draw geometry/preset module (src/draw/shapes.js).
// The four public constants below live in shapes.js at runtime; core.js and
// index.js import them from here. Only the constants re-exported by the ./draw
// subpath are declared — the module's internal helper functions are not part of
// the public type surface.

import type { DrawTool, DrawShapeType, BrushName, BrushPreset } from './core';

export const VD_DRAW_VERSION: string;
export const DRAW_TOOLS: readonly DrawTool[];
export const DRAW_SHAPE_TYPES: readonly DrawShapeType[];
export const BRUSH_PRESETS: Readonly<Record<BrushName, BrushPreset>>;
