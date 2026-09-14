// Pure brush-engine tests for src/draw/shapes.js. Runs in the default `node`
// environment — the engine is DOM-free.

import { describe, expect, it } from 'vitest';

import {
  strokeOutline,
  pointsToBrushPath,
  brushStrokePath,
  BRUSH_PRESETS,
  DEFAULT_BRUSH,
  smoothPoint,
  appendAndSimplify,
} from '../../src/draw/shapes.js';

describe('draw brush engine — presets', () => {
  it('exposes the frozen brush presets', () => {
    expect(Object.keys(BRUSH_PRESETS)).toEqual(
      expect.arrayContaining(['pen', 'pencil', 'marker', 'highlighter', 'calligraphy']),
    );
    expect(Object.isFrozen(BRUSH_PRESETS)).toBe(true);
    expect(BRUSH_PRESETS.highlighter.blend).toBe('multiply');
    expect(DEFAULT_BRUSH).toBe('pen');
  });
});

describe('draw brush engine — stroke outline', () => {
  it('builds a closed outline whose width tracks pressure', () => {
    const light = strokeOutline(
      [
        [0, 0, 0.1],
        [60, 0, 0.1],
      ],
      { size: 20, thinning: 0.8, streamline: 0 },
    );
    const heavy = strokeOutline(
      [
        [0, 0, 1],
        [60, 0, 1],
      ],
      { size: 20, thinning: 0.8, streamline: 0 },
    );
    expect(light.length).toBeGreaterThan(2);
    const span = (o: number[][]) =>
      Math.max(...o.map((p) => p[1])) - Math.min(...o.map((p) => p[1]));
    expect(span(heavy)).toBeGreaterThan(span(light));
  });

  it('returns a circle polygon for a single-point (dot) stroke', () => {
    const dot = strokeOutline([[10, 10]], { size: 8 });
    expect(dot.length).toBeGreaterThanOrEqual(8);
  });

  it('handles empty input safely', () => {
    expect(strokeOutline([], {})).toEqual([]);
    expect(pointsToBrushPath([])).toBe('');
  });
});

describe('draw brush engine — path building', () => {
  it('produces a fillable closed path string', () => {
    const d = pointsToBrushPath(
      strokeOutline(
        [
          [0, 0, 0.5],
          [10, 10, 0.5],
          [20, 0, 0.5],
        ],
        { size: 10 },
      ),
    );
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('brushStrokePath honours the shape brush + size', () => {
    const d = brushStrokePath({
      type: 'freehand',
      brush: 'marker',
      size: 14,
      points: [
        [0, 0],
        [30, 0],
        [60, 10],
      ],
    });
    expect(typeof d).toBe('string');
    expect(d.length).toBeGreaterThan(0);
  });
});

describe('draw brush engine — smoothPoint', () => {
  it('blends coordinates proportionally to the factor', () => {
    // factor = 1 → full pull toward next (no smoothing)
    const noSmooth = smoothPoint([0, 0], [10, 20], 1);
    expect(noSmooth[0]).toBe(10);
    expect(noSmooth[1]).toBe(20);

    // factor = 0.5 → halfway
    const half = smoothPoint([0, 0], [10, 20], 0.5);
    expect(half[0]).toBe(5);
    expect(half[1]).toBe(10);

    // factor ≈ 0.1 (clamped minimum) → heavy smoothing
    const heavy = smoothPoint([0, 0], [10, 20], 0.1);
    expect(heavy[0]).toBe(1);
    expect(heavy[1]).toBe(2);
  });

  it('preserves the pressure channel and blends it linearly', () => {
    const pt = smoothPoint([0, 0, 0.2], [10, 10, 0.8], 0.5);
    expect(pt).toHaveLength(3);
    expect(pt[2]).toBeCloseTo(0.5, 2);
  });

  it('omits pressure when neither point has it', () => {
    const pt = smoothPoint([0, 0], [10, 10], 0.5);
    expect(pt).toHaveLength(2);
  });

  it('defaults missing pressure to 0.5 when one point has it', () => {
    // Missing pressure on the previous point blends 0.5 with 0.9 → 0.7.
    const prevMissing = smoothPoint([0, 0], [10, 10, 0.9], 0.5);
    expect(prevMissing).toHaveLength(3);
    expect(prevMissing[2]).toBeCloseTo(0.7, 2);

    // Missing pressure on the next point blends 0.9 with 0.5 → 0.7.
    const nextMissing = smoothPoint([0, 0, 0.9], [10, 10], 0.5);
    expect(nextMissing).toHaveLength(3);
    expect(nextMissing[2]).toBeCloseTo(0.7, 2);
  });
});

describe('draw brush engine — appendAndSimplify', () => {
  it('appends a point when distance exceeds minDist', () => {
    const pts: number[][] = [[0, 0]];
    appendAndSimplify(pts, [5, 0], 2);
    expect(pts).toHaveLength(2);
    expect(pts[1][0]).toBe(5);
  });

  it('skips a point when distance is below minDist', () => {
    const pts: number[][] = [[0, 0]];
    appendAndSimplify(pts, [0.5, 0], 2);
    expect(pts).toHaveLength(1);
  });

  it('halves the array when exceeding maxLen', () => {
    const pts: number[][] = [];
    // Fill with well-spaced points to satisfy minDist
    for (let i = 0; i < 10; i += 1) pts.push([i * 5, 0]);
    const before = pts.length;
    // Add one more to push past maxLen=10
    appendAndSimplify(pts, [100, 0], 1, 10);
    expect(pts.length).toBeLessThan(before + 1);
    // First and last are preserved
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1][0]).toBe(100);
  });

  it('handles empty input', () => {
    const pts: number[][] = [];
    appendAndSimplify(pts, [5, 10]);
    expect(pts).toHaveLength(1);
    expect(pts[0][0]).toBe(5);
  });
});
