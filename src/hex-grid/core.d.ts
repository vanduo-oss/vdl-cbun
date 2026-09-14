// Hand-written declarations for the hex-grid canvas core (src/hex-grid/core.js),
// authored from the source JSDoc (the old repo shipped no core .d.ts files).

import type { AxialCoord, TerrainYield } from './hex-math.js';

/** Hex-grid component version (mirrors component-versions.json). */
export declare const VD_HEX_VERSION: string;

/** Constructor options for {@link VdHexGrid}. */
export interface VdHexGridOptions {
  /** Container element; a <canvas> child is found or created inside it. */
  element: HTMLElement;
  /** Explicit canvas to render into (otherwise resolved from `element`). */
  canvas?: HTMLCanvasElement;
  /** Hex radius in px. Default 30. */
  size?: number;
  /** Grid columns (number of hexes). Default 10. */
  width?: number;
  /** Grid rows (number of hexes). Default 10. */
  height?: number;
  /** Grid rotation in radians. Default 0. */
  rotation?: number;
  /**
   * Canvas backing-store multiplier. `'auto'` (default) resolves to
   * `min(devicePixelRatio || 1, 2)`. Pass `1` for a 1:1 CSS-pixel buffer.
   */
  pixelRatio?: number | 'auto';
  /** Viewport culling. Default true. */
  cull?: boolean;
}

/** A single hex cell stored in the grid. */
export interface HexCell extends AxialCoord {
  /** Hex center X in world (pre-transform) pixel coordinates. */
  x: number;
  /** Hex center Y in world (pre-transform) pixel coordinates. */
  y: number;
  /** Fill color (defaults to the theme's secondary background). */
  fill: string;
  /** Stroke color (defaults to the theme's border color). */
  stroke: string;
  /** The 6 adjacent hex coordinates. */
  adjacent: AxialCoord[];
  /** Terrain type, or null when unset. */
  terrain: string | null;
  /** Custom data attached via setHexData(). */
  data: Record<string, unknown>;
}

/** Pan/zoom transform state. */
export interface HexGridTransform {
  x: number;
  y: number;
  scale: number;
}

/** Last-frame render metrics from {@link VdHexGrid.getRenderStats}. */
export interface HexRenderStats {
  /** Total hexes in the grid. */
  total: number;
  /** Hexes intersecting the current viewport. */
  visible: number;
  /** Hexes actually drawn in the last frame. */
  drawn: number;
  /** Whether the last frame was a sharp culled render or a fast blit. */
  mode: 'sharp' | 'fast';
  /** Duration of the last sharp render in milliseconds. */
  lastRenderMs: number;
  /** Effective device-pixel-ratio multiplier. */
  pixelRatio: number;
  /** Current zoom scale. */
  scale: number;
}

/** Event payloads for {@link VdHexGrid.on}. */
export interface VdHexGridEventMap {
  /** A hex was selected by click/tap. */
  select: HexCell;
  /** Zoom level changed (wheel, pinch, zoomIn/zoomOut, resetView). */
  zoom: { scale: number };
  /** Pan position changed (emitted by resetView). */
  pan: { x: number; y: number };
}

/** Per-hex custom render hook, called after each base hex is drawn. */
export type HexRenderCallback = (ctx: CanvasRenderingContext2D, hex: HexCell, size: number) => void;

/**
 * A dynamic controllable hex grid rendered on a canvas, with pan/zoom,
 * selection, terrain, per-hex data, pathfinding, rotation, and custom
 * rendering. Theme colors are read from `--vd-*` CSS custom properties with
 * legacy-token and hardcoded fallbacks.
 */
export declare class VdHexGrid {
  /** Mirrors VD_HEX_VERSION. */
  static VERSION: string;

  constructor(options: VdHexGridOptions);

  element: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Hex radius in px. */
  size: number;
  /** Grid columns. */
  width: number;
  /** Grid rows. */
  height: number;
  /** Grid rotation in radians. */
  rotation: number;
  /** Canvas backing-store multiplier (`'auto'` or a number). */
  pixelRatio: number | 'auto';
  /** Viewport culling flag. */
  cull: boolean;
  /** All hexes, keyed by `"q,r"`. */
  hexes: Map<string, HexCell>;
  /** Currently selected hex, or null. */
  selectedHex: HexCell | null;
  /** Current pan/zoom transform. */
  transform: HexGridTransform;
  /** Custom render callback set via setCustomRender(), or null. */
  customRenderCallback: HexRenderCallback | null;

  /**
   * Disconnect theme listeners. Call before discarding the instance (for
   * example on SPA navigation) to avoid leaking observers and media-query
   * listeners.
   */
  destroy(): void;

  /** Set hex size (regenerates the grid). */
  setSize(size: number): void;

  /** Set grid dimensions (regenerates the grid). */
  setDimensions(width: number, height: number): void;

  /** Reset grid to defaults (size 30, 15x10, no rotation, identity view). */
  reset(): void;

  /** Fill hexes with random colors. */
  fillRandom(): void;

  /** Get hex by coordinates. */
  getHex(q: number, r: number): HexCell | undefined;

  /** Get all hexes. */
  getAllHexes(): HexCell[];

  /** Get the hexes intersecting the current viewport, sorted by row then column. */
  getVisibleHexes(): HexCell[];

  /** Get last-frame render metrics. */
  getRenderStats(): HexRenderStats;

  /** Set the device-pixel-ratio multiplier and re-render (no grid regeneration). */
  setPixelRatio(ratio: number | 'auto'): void;

  /** Toggle viewport culling and re-render (no grid regeneration). */
  setCull(cull: boolean): void;

  /** Set hex fill color. */
  setHexFill(q: number, r: number, color: string): void;

  /** Reset view to the default position (emits 'pan' and 'zoom'). */
  resetView(): void;

  /** Zoom in one step (emits 'zoom'). */
  zoomIn(): void;

  /** Zoom out one step (emits 'zoom'). */
  zoomOut(): void;

  /** Get a copy of the current transform state. */
  getTransform(): HexGridTransform;

  /** Subscribe to events ('select', 'zoom', 'pan'). */
  on<K extends keyof VdHexGridEventMap>(
    event: K,
    callback: (data: VdHexGridEventMap[K]) => void,
  ): void;

  /** Set terrain type for a hex (e.g. a TerrainType value). */
  setHexTerrain(q: number, r: number, terrainType: string): void;

  /** Get terrain type for a hex, or null. */
  getHexTerrain(q: number, r: number): string | null;

  /** Generate random terrain for all hexes. */
  generateRandomTerrain(): void;

  /** Get terrain yields for a hex (zero yields when no terrain). */
  getHexYields(q: number, r: number): TerrainYield;

  /** Get movement cost for a hex (999 when no terrain). */
  getHexMovementCost(q: number, r: number): number;

  /** Check if a hex is passable (false when no terrain). */
  isHexPassable(q: number, r: number): boolean;

  /** Merge custom data into a hex. */
  setHexData(q: number, r: number, data: Record<string, unknown>): void;

  /** Get custom data for a hex (empty object when the hex is missing). */
  getHexData(q: number, r: number): Record<string, unknown>;

  /** Clear custom data for a hex. */
  clearHexData(q: number, r: number): void;

  /** Calculate distance between two hexes, in hex steps. */
  hexDistance(q1: number, r1: number, q2: number, r2: number): number;

  /** Get valid adjacent moves from a hex within the given movement points. */
  getValidMoves(q: number, r: number, movementPoints: number): AxialCoord[];

  /** Get a path between two hexes (simple BFS); empty array when unreachable. */
  getPath(startQ: number, startR: number, endQ: number, endR: number): AxialCoord[];

  /** Set grid rotation in radians (regenerates the grid). */
  setRotation(rotation: number): void;

  /** Get current grid rotation in radians. */
  getRotation(): number;

  /** Set a custom render callback invoked with (ctx, hex, size) per hex. */
  setCustomRender(callback: HexRenderCallback): void;

  /** Clear the custom render callback. */
  clearCustomRender(): void;

  /** Check if a hex exists at coordinates. */
  hasHex(q: number, r: number): boolean;

  /** Get the number of hexes in the grid. */
  getHexCount(): number;

  /** Export terrain data as a plain object keyed by `"q,r"`. */
  exportTerrainData(): Record<string, string>;

  /** Import terrain data previously produced by exportTerrainData(). */
  importTerrainData(data: Record<string, string>): void;
}
