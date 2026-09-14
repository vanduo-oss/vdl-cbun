// Type definitions for the framework-agnostic draw tool core (src/draw/core.js).
// core.js exports only `class VdDraw`; the shared draw types are hand-authored
// here for the whole component to consume. The four public constants
// (VD_DRAW_VERSION, DRAW_TOOLS, DRAW_SHAPE_TYPES, BRUSH_PRESETS) live in
// shapes.js and are declared in the sibling ./shapes.d.ts, matching the runtime
// module boundary (index.js re-exports them from './shapes.js').

export type DrawTool =
  'select' | 'hand' | 'draw' | 'eraser' | 'rectangle' | 'ellipse' | 'line' | 'text' | 'sticky';

export type DrawShapeType = 'rectangle' | 'ellipse' | 'line' | 'freehand' | 'text' | 'sticky';

export type BrushName = 'pen' | 'pencil' | 'marker' | 'highlighter' | 'calligraphy';

export interface BrushPreset {
  size: number;
  thinning: number;
  smoothing: number;
  streamline: number;
  taperStart: number;
  taperEnd: number;
  opacity: number;
  blend: string;
  nibAngle?: number;
}

export interface DrawViewport {
  x: number;
  y: number;
  scale: number;
}

/** A world-space point `[x, y]` with an optional third `pressure` (0–1) slot. */
export type DrawPoint = [number, number] | [number, number, number];

/**
 * A shape in the document. Box shapes (rectangle/ellipse/text/sticky) use
 * x/y/w/h; line/freehand use `points`. `color` is the stroke color for shapes /
 * lines and the fill color for freehand brush strokes.
 */
export interface DrawShape {
  id: string;
  type: DrawShapeType;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rotation?: number;
  points?: DrawPoint[];
  /** freehand: the brush preset. */
  brush?: BrushName;
  /** stroke color (shapes/line) or fill color (freehand). */
  color?: string;
  fill?: string;
  /** freehand brush size. */
  size?: number;
  /** shapes/line stroke width. */
  strokeWidth?: number;
  opacity?: number;
  text?: string;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  /** When true, line.points render as a Catmull-Rom cubic path instead of a polyline. */
  smooth?: boolean;
  groupId?: string;
}

export interface DrawDocument {
  version: string;
  viewport: DrawViewport;
  shapes: DrawShape[];
}

export interface DrawBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawChangeEvent {
  reason: string;
  document: DrawDocument;
  shape?: DrawShape;
  shapeId?: string;
  shapeIds?: string[];
  groupId?: string;
}

export interface DrawSelectEvent {
  ids: string[];
  shapes: DrawShape[];
}

export interface DrawViewportEvent {
  reason: string;
  viewport: DrawViewport;
  document: DrawDocument;
}

export interface DrawHistoryEvent {
  reason: string;
  canUndo: boolean;
  canRedo: boolean;
}

export interface DrawEventMap {
  change: DrawChangeEvent;
  select: DrawSelectEvent;
  viewport: DrawViewportEvent;
  history: DrawHistoryEvent;
  ready: VdDraw;
}

export interface VdDrawOptions {
  element?: Element | string;
  /** Alias for `element`. */
  target?: Element | string;
  data?: Partial<DrawDocument> | string;
  readonly?: boolean;
  tool?: DrawTool;
  gridSize?: number;
  /** Show the background grid (default true). */
  showGrid?: boolean;
  /** Snap to nearby edges/centres while moving/resizing (default true). */
  snap?: boolean;
  /** Fit to content once the canvas reports a measurable size. */
  autoFit?: boolean;
  /** Enable built-in undo/redo (default true). */
  history?: boolean;
  /** Maximum retained history entries (default 100). */
  historyLimit?: number;
  /** Initial current-style color / opacity / brush size / brush preset. */
  color?: string;
  opacity?: number;
  brushSize?: number;
  brush?: BrushName;
}

export interface StylePatch {
  color?: string;
  fill?: string;
  strokeWidth?: number;
  opacity?: number;
  size?: number;
  brush?: BrushName;
}

export class VdDraw {
  constructor(options?: VdDrawOptions);

  readonly element: Element;
  readonly readonly: boolean;
  gridSize: number;
  tool: DrawTool;
  snap: boolean;
  showGrid: boolean;
  destroyed: boolean;
  /** The current drawing style new marks adopt. */
  style: { color: string; opacity: number; size: number; brush: BrushName };

  // Events
  on<K extends keyof DrawEventMap>(event: K, callback: (payload: DrawEventMap[K]) => void): this;
  off<K extends keyof DrawEventMap>(event: K, callback: (payload: DrawEventMap[K]) => void): this;

  // Tool + current style
  setTool(tool: DrawTool): this;
  setColor(color: string): this;
  setOpacity(opacity: number): this;
  setBrushSize(size: number): this;
  setBrush(brush: BrushName): this;

  // Grid
  setGridSize(size: number): this;
  setGridVisible(visible: boolean): this;
  toggleGrid(): this;

  // Runtime options
  setReadonly(readonly: boolean): this;
  setSnap(snap: boolean): this;
  setHistoryEnabled(enabled: boolean): this;
  setHistoryLimit(limit: number): this;

  // Shapes
  getShape(id: string): DrawShape | null;
  getShapes(): DrawShape[];
  addShape(partial?: Partial<DrawShape>): DrawShape;
  updateShape(
    id: string,
    patch?: Partial<DrawShape>,
    options?: { reason?: string },
  ): DrawShape | null;
  removeShape(id: string): boolean;

  // Selection
  getSelectedShapes(): DrawShape[];
  select(ids: string | string[] | null, options?: { additive?: boolean }): this;
  selectAll(): this;
  deselect(): this;
  selectInBounds(box: DrawBounds, options?: { additive?: boolean }): this;

  // Manipulation
  nudge(dx: number, dy: number): this;
  setSelectionBounds(target: DrawBounds): this;
  deleteSelection(): boolean;
  setStyle(patch: StylePatch): this;

  // Z-order
  bringForward(): this;
  sendBackward(): this;
  bringToFront(): this;
  sendToBack(): this;

  // Grouping
  group(): this;
  ungroup(): this;

  // Clipboard
  copy(): this;
  cut(): this;
  paste(options?: { offset?: number }): this;
  duplicate(): this;

  // Export
  toSVG(): string;
  toPNG(options?: { scale?: number }): Promise<string>;

  // Viewport
  setViewport(patch: Partial<DrawViewport>): this;
  scaleAround(factor: number, localX: number, localY: number): this;
  zoomIn(): this;
  zoomOut(): this;
  resetView(): this;
  fitView(padding?: number): this;

  // History
  undo(): this;
  redo(): this;
  canUndo(): boolean;
  canRedo(): boolean;
  clearHistory(): this;

  // Document
  clear(): this;
  load(data: Partial<DrawDocument> | string): this;
  toJSON(): DrawDocument;

  // Text editing
  startTextEdit(id: string): boolean;
  stopTextEdit(options?: { commit?: boolean }): void;

  // Rendering + lifecycle
  render(flags?: { scene?: boolean; overlay?: boolean }): void;
  destroy(): void;
}
