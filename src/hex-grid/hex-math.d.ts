// Hand-written declarations for src/hex-grid/hex-math.js, authored from the
// source JSDoc (the old repo shipped no core .d.ts files). The module is pure:
// no DOM or window access, importable in any JavaScript runtime.

/** A 2D point in pixel space. */
export interface Point {
  x: number;
  y: number;
}

/** Axial hex coordinates. */
export interface AxialCoord {
  q: number;
  r: number;
}

/** Resources generated per turn from a terrain type. */
export interface TerrainYield {
  food: number;
  production: number;
  gold: number;
}

/**
 * Rotate a point around the origin.
 * @param rotation Rotation in radians (default 0).
 */
export declare function rotatePoint(x: number, y: number, rotation?: number): Point;

/**
 * Apply the inverse of a rotation to a point.
 * @param rotation Rotation in radians (default 0).
 */
export declare function unrotatePoint(x: number, y: number, rotation?: number): Point;

/**
 * Convert hex axial coordinates to pixel coordinates (flat-top orientation).
 * @param size Hex radius.
 * @param rotation Optional grid rotation in radians (default 0).
 */
export declare function hexToPixel(q: number, r: number, size: number, rotation?: number): Point;

/**
 * Convert pixel coordinates to hex axial coordinates (flat-top orientation),
 * rounded to the nearest hex.
 * @param size Hex radius.
 * @param rotation Optional grid rotation in radians (default 0).
 */
export declare function pixelToHex(
  px: number,
  py: number,
  size: number,
  rotation?: number,
): AxialCoord;

/** Round fractional axial coordinates to the nearest hex. */
export declare function axialRound(q: number, r: number): AxialCoord;

/**
 * Get the 6 corner points of a flat-top hexagon.
 * @param x Center X coordinate.
 * @param y Center Y coordinate.
 * @param size Hex radius.
 * @param rotation Optional hex rotation in radians (default 0).
 */
export declare function getHexCorners(
  x: number,
  y: number,
  size: number,
  rotation?: number,
): Point[];

/** Get the 6 adjacent hex coordinates from a given hex. */
export declare function getAdjacentHexes(q: number, r: number): AxialCoord[];

/** Calculate distance between two hexes (axial coordinates), in hex steps. */
export declare function hexDistance(q1: number, r1: number, q2: number, r2: number): number;

/** Terrain types available in the system (frozen). */
export declare const TerrainType: Readonly<{
  GRASSLAND: 'Grassland';
  PLAINS: 'Plains';
  DESERT: 'Desert';
  TUNDRA: 'Tundra';
  SNOW: 'Snow';
  MOUNTAIN: 'Mountain';
  OCEAN: 'Ocean';
  COAST: 'Coast';
}>;

/** Union of the terrain type values (e.g. 'Grassland'). */
export type TerrainTypeValue = (typeof TerrainType)[keyof typeof TerrainType];

/** Terrain colors for rendering, keyed by terrain type value (frozen). */
export declare const TERRAIN_COLORS: Readonly<Record<TerrainTypeValue, string>>;

/** Default terrain color for unknown types. */
export declare const DEFAULT_TERRAIN_COLOR: string;

/** Terrain yields per terrain type value (frozen). */
export declare const TERRAIN_YIELDS: Readonly<Record<TerrainTypeValue, TerrainYield>>;

/**
 * Movement costs for units based on terrain, keyed by terrain type value
 * (frozen). Higher cost = harder to move through; 999 = impassable.
 */
export declare const TERRAIN_MOVEMENT_COSTS: Readonly<Record<TerrainTypeValue, number>>;

/** Check if terrain is passable for land units (cost defined and < 999). */
export declare function isPassable(terrainType: string): boolean;

/** Get movement cost for terrain (999 for unknown types). */
export declare function getMovementCost(terrainType: string): number;

/** Get terrain yields ({ food: 0, production: 0, gold: 0 } for unknown types). */
export declare function getTerrainYields(terrainType: string): TerrainYield;

/** Get terrain color (DEFAULT_TERRAIN_COLOR for unknown types). */
export declare function getTerrainColor(terrainType: string): string;
