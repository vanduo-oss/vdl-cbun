// Pure hex-math functions — runs in the DEFAULT node environment (no jsdom).
// This doubles as a proof that hex-math.js touches no DOM/window: if it did,
// this file would throw here. Cases translated from the old repo's Playwright
// `tests/unit/hex-math.spec.ts` `page.evaluate` bodies, expanded table-driven.

import { describe, expect, it } from 'vitest';

import {
  rotatePoint,
  unrotatePoint,
  hexToPixel,
  pixelToHex,
  axialRound,
  getHexCorners,
  getAdjacentHexes,
  hexDistance,
  TerrainType,
  TERRAIN_COLORS,
  TERRAIN_YIELDS,
  TERRAIN_MOVEMENT_COSTS,
  DEFAULT_TERRAIN_COLOR,
  isPassable,
  getMovementCost,
  getTerrainYields,
  getTerrainColor,
} from '../../src/hex-grid/hex-math.js';

const SQRT3 = Math.sqrt(3);

describe('rotatePoint / unrotatePoint', () => {
  it('returns the point unchanged for zero rotation (identity fast path)', () => {
    expect(rotatePoint(30, 40, 0)).toEqual({ x: 30, y: 40 });
    expect(rotatePoint(30, 40)).toEqual({ x: 30, y: 40 });
  });

  it('rotates a unit x-vector by +90deg onto the y-axis', () => {
    const p = rotatePoint(1, 0, Math.PI / 2);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(1, 10);
  });

  it.each([
    [30, 40, -Math.PI / 6],
    [12, -7, Math.PI / 3],
    [-100, 55, (2 * Math.PI) / 5],
    [0, 0, 1.234],
  ])('unrotate is the inverse of rotate for (%d, %d) @ %f rad', (x, y, rotation) => {
    const rotated = rotatePoint(x, y, rotation);
    const back = unrotatePoint(rotated.x, rotated.y, rotation);
    expect(back.x).toBeCloseTo(x, 9);
    expect(back.y).toBeCloseTo(y, 9);
  });
});

describe('hexToPixel', () => {
  it('places the origin hex at the pixel origin', () => {
    expect(hexToPixel(0, 0, 30)).toEqual({ x: 0, y: 0 });
  });

  it('applies the flat-top axial->pixel formula exactly', () => {
    // x = size * 1.5 * q ; y = size * sqrt(3) * (r + q/2)
    const p = hexToPixel(2, 3, 30);
    expect(p.x).toBe(90);
    expect(p.y).toBeCloseTo(30 * SQRT3 * 4, 9);
  });
});

describe('hexToPixel <-> pixelToHex round trips', () => {
  const coords: Array<[number, number]> = [
    [0, 0],
    [2, 3],
    [2, 1], // the spec's normative round-trip scenario coordinate
    [-1, 4],
    [5, -2],
    [-3, -3],
  ];

  it.each(coords)('recovers axial (%d, %d) with no rotation', (q, r) => {
    const px = hexToPixel(q, r, 30);
    expect(pixelToHex(px.x, px.y, 30)).toEqual({ q, r });
  });

  it.each(coords)('recovers axial (%d, %d) under a -30deg grid rotation', (q, r) => {
    const rotation = -Math.PI / 6;
    const px = hexToPixel(q, r, 30, rotation);
    expect(pixelToHex(px.x, px.y, 30, rotation)).toEqual({ q, r });
  });
});

describe('axialRound', () => {
  it.each<[number, number, number, number]>([
    [0.6, 0.7, 0, 1],
    [0.2, 0.2, 0, 0],
    [1.4, -0.4, 1, 0],
    [2.9, 0.1, 3, 0],
    [-2.1, 1.9, -2, 2],
  ])('rounds (%f, %f) to the nearest hex (%d, %d)', (q, r, eq, er) => {
    const rounded = axialRound(q, r);
    expect(rounded.q).toBe(eq);
    // normalize -0 to 0 for a stable comparison
    expect(rounded.r === 0 ? 0 : rounded.r).toBe(er);
  });

  it('reassigns the coordinate with the largest rounding delta (negative case)', () => {
    const rounded = axialRound(-0.4, -0.3);
    expect(rounded.q).toBe(-1);
    expect(rounded.r === 0 ? 0 : rounded.r).toBe(0);
  });
});

describe('getHexCorners', () => {
  it('returns six corners; the first sits on the +x axis with no rotation', () => {
    const corners = getHexCorners(0, 0, 30, 0);
    expect(corners).toHaveLength(6);
    expect(corners[0].x).toBeCloseTo(30, 9);
    expect(corners[0].y).toBeCloseTo(0, 9);
    // corner 1 at 60deg
    expect(corners[1].x).toBeCloseTo(15, 6);
    expect(corners[1].y).toBeCloseTo(30 * (SQRT3 / 2), 6);
  });

  it('applies the rotation offset to every corner', () => {
    const corners = getHexCorners(0, 0, 30, Math.PI / 6);
    expect(corners).toHaveLength(6);
    // first corner now at 30deg: (size*cos30, size*sin30)
    expect(corners[0].x).toBeCloseTo(25.980762, 5);
    expect(corners[0].y).toBeCloseTo(15, 5);
  });

  it('translates corners by the given center', () => {
    const corners = getHexCorners(100, 50, 10, 0);
    expect(corners[0].x).toBeCloseTo(110, 9);
    expect(corners[0].y).toBeCloseTo(50, 9);
  });
});

describe('getAdjacentHexes / hexDistance', () => {
  it('returns the six axial neighbours in canonical order', () => {
    expect(getAdjacentHexes(0, 0)).toEqual([
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ]);
  });

  it('every neighbour is exactly distance 1 from its center (any center)', () => {
    for (const [cq, cr] of [
      [0, 0],
      [2, -1],
      [-3, 4],
    ]) {
      for (const n of getAdjacentHexes(cq, cr)) {
        expect(hexDistance(cq, cr, n.q, n.r)).toBe(1);
      }
    }
  });

  it.each<[number, number, number, number, number]>([
    [0, 0, 0, 0, 0],
    [0, 0, 3, 0, 3],
    [0, 0, 0, 3, 3],
    [0, 0, 3, -3, 3],
    [0, 0, 2, -1, 2],
    [1, 1, -2, 3, 3],
  ])('hexDistance((%d,%d),(%d,%d)) === %d', (q1, r1, q2, r2, expected) => {
    expect(hexDistance(q1, r1, q2, r2)).toBe(expected);
    // distance is symmetric
    expect(hexDistance(q2, r2, q1, r1)).toBe(expected);
  });
});

describe('terrain tables', () => {
  it('exposes eight frozen terrain types', () => {
    const values = Object.values(TerrainType);
    expect(values).toHaveLength(8);
    expect(Object.isFrozen(TerrainType)).toBe(true);
  });

  it('every terrain type has a color, yields, and movement cost', () => {
    for (const type of Object.values(TerrainType)) {
      expect(TERRAIN_COLORS[type]).toBeDefined();
      expect(TERRAIN_YIELDS[type]).toBeDefined();
      expect(TERRAIN_MOVEMENT_COSTS[type]).toBeDefined();
    }
  });

  it.each<[string, boolean]>([
    [TerrainType.GRASSLAND, true],
    [TerrainType.PLAINS, true],
    [TerrainType.SNOW, true],
    [TerrainType.OCEAN, false],
    [TerrainType.MOUNTAIN, false],
    ['UNKNOWN', false],
  ])('isPassable(%s) === %s', (terrain, expected) => {
    expect(isPassable(terrain)).toBe(expected);
  });

  it.each<[string, number]>([
    [TerrainType.GRASSLAND, 1],
    [TerrainType.SNOW, 2],
    [TerrainType.OCEAN, 999],
    [TerrainType.MOUNTAIN, 999],
    ['UNKNOWN', 999],
  ])('getMovementCost(%s) === %d', (terrain, expected) => {
    expect(getMovementCost(terrain)).toBe(expected);
  });

  it('getTerrainColor returns the table color and the default for unknowns', () => {
    expect(getTerrainColor(TerrainType.OCEAN)).toBe('#1d354c');
    expect(getTerrainColor(TerrainType.GRASSLAND)).toBe('#47602f');
    expect(getTerrainColor('UNKNOWN')).toBe(DEFAULT_TERRAIN_COLOR);
    expect(DEFAULT_TERRAIN_COLOR).toBe('#FF00FF');
  });

  it('getTerrainYields returns table yields and zero-yields for unknowns', () => {
    expect(getTerrainYields(TerrainType.GRASSLAND)).toEqual({ food: 2, production: 0, gold: 0 });
    expect(getTerrainYields(TerrainType.PLAINS)).toEqual({ food: 1, production: 1, gold: 0 });
    expect(getTerrainYields('UNKNOWN')).toEqual({ food: 0, production: 0, gold: 0 });
  });
});
