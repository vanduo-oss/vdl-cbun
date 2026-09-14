// Pure geometry + document-model tests for src/draw/shapes.js. Runs in the
// default `node` environment (no jsdom) to prove this module stays DOM-free.

import { describe, expect, it } from 'vitest';

import {
  VD_DRAW_VERSION,
  DRAW_TOOLS,
  DRAW_SHAPE_TYPES,
  shapeBounds,
  boundsOfShapes,
  boundsIntersect,
  distanceToShape,
  translateShape,
  scaleShape,
  pointsToPath,
  simplifyPoints,
  wrapText,
  normalizeShape,
  normalizeDocument,
} from '../../src/draw/shapes.js';

describe('draw shapes — constants', () => {
  it('exposes the version and frozen enumerations', () => {
    expect(VD_DRAW_VERSION).toBe('1.1.0');
    expect(DRAW_TOOLS).toContain('draw');
    expect(DRAW_TOOLS).toContain('eraser');
    expect(DRAW_SHAPE_TYPES).toEqual([
      'rectangle',
      'ellipse',
      'line',
      'freehand',
      'text',
      'sticky',
    ]);
    expect(Object.isFrozen(DRAW_TOOLS)).toBe(true);
  });
});

describe('draw shapes — bounds + hit-testing', () => {
  it('computes box bounds from x/y/w/h', () => {
    expect(shapeBounds({ type: 'rectangle', x: 10, y: 20, w: 100, h: 40 })).toEqual({
      x: 10,
      y: 20,
      w: 100,
      h: 40,
    });
  });

  it('computes point-shape bounds from the min/max of points', () => {
    const b = shapeBounds({
      type: 'freehand',
      points: [
        [10, 10],
        [30, 50],
        [20, 5],
      ],
    });
    expect(b).toEqual({ x: 10, y: 5, w: 20, h: 45 });
  });

  it('unions bounds across shapes', () => {
    const b = boundsOfShapes([
      { type: 'rectangle', x: 0, y: 0, w: 20, h: 20 },
      { type: 'rectangle', x: 40, y: 30, w: 10, h: 10 },
    ]);
    expect(b).toEqual({ x: 0, y: 0, w: 50, h: 40 });
    expect(boundsOfShapes([])).toBeNull();
  });

  it('detects box overlap for marquee selection', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(boundsIntersect(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(boundsIntersect(a, { x: 40, y: 40, w: 5, h: 5 })).toBe(false);
  });

  it('measures distance from a point to a shape (for the eraser)', () => {
    expect(distanceToShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 }, 5, 5)).toBe(0);
    expect(
      distanceToShape(
        {
          type: 'freehand',
          points: [
            [0, 0],
            [10, 0],
          ],
        },
        5,
        3,
      ),
    ).toBeCloseTo(3, 5);
  });
});

describe('draw shapes — pure transforms', () => {
  it('translateShape returns a new shape and never mutates the input', () => {
    const rect = { id: 'r', type: 'rectangle', x: 10, y: 10, w: 20, h: 20 };
    const moved = translateShape(rect, 5, -3);
    expect(moved).not.toBe(rect);
    expect(moved).toMatchObject({ x: 15, y: 7 });
    expect(rect.x).toBe(10);
  });

  it('translateShape preserves per-point pressure', () => {
    const stroke = {
      id: 's',
      type: 'freehand',
      points: [
        [0, 0, 0.4],
        [10, 10, 0.9],
      ],
    };
    expect(translateShape(stroke, 2, 2).points).toEqual([
      [2, 2, 0.4],
      [12, 12, 0.9],
    ]);
  });

  it('scaleShape rescales box geometry and freehand size', () => {
    expect(
      scaleShape({ id: 'r', type: 'rectangle', x: 10, y: 10, w: 20, h: 20 }, 10, 10, 2, 2),
    ).toMatchObject({ w: 40, h: 40 });
    expect(
      scaleShape(
        {
          id: 's',
          type: 'freehand',
          size: 6,
          points: [
            [0, 0],
            [10, 0],
          ],
        },
        0,
        0,
        2,
        2,
      ).size,
    ).toBe(12);
  });

  it('builds and simplifies point paths', () => {
    expect(
      pointsToPath([
        [0, 0],
        [10, 0],
      ]),
    ).toBe('M 0 0 L 10 0');
    expect(
      pointsToPath(
        [
          [0, 0],
          [10, 0],
        ],
        { smooth: true },
      ),
    ).toBe('M 0 0 L 10 0');
    expect(
      pointsToPath(
        [
          [0, 0],
          [10, 10],
          [20, 0],
        ],
        { smooth: false },
      ),
    ).toBe('M 0 0 L 10 10 L 20 0');
    expect(
      pointsToPath(
        [
          [0, 0],
          [10, 10],
          [20, 0],
        ],
        { smooth: true },
      ),
    ).toBe('M 0 0 C 1.67 1.67 6.67 10 10 10 C 13.33 10 18.33 1.67 20 0');
    expect(
      simplifyPoints([
        [0, 0],
        [0.2, 0.1],
        [50, 50],
      ]),
    ).toEqual([
      [0, 0],
      [50, 50],
    ]);
  });
});

describe('draw shapes — normalizeShape', () => {
  it('defaults an unknown type to rectangle and fills a missing id', () => {
    const s = normalizeShape({ type: 'zigzag', x: 1, y: 2 });
    expect(s?.type).toBe('rectangle');
    expect(typeof s?.id).toBe('string');
    expect(s?.strokeWidth).toBe(2);
  });

  it('migrates a v1 freehand (stroke/strokeWidth) to the brush model', () => {
    const s = normalizeShape({
      type: 'freehand',
      points: [
        [0, 0],
        [5, 5],
      ],
      stroke: '#e03131',
      strokeWidth: 3,
    });
    expect(s?.brush).toBe('pen');
    expect(s?.color).toBe('#e03131');
    expect(s?.size).toBe(6);
    expect('stroke' in (s || {})).toBe(false);
  });

  it('accepts a single-point (dot) freehand but rejects a 1-point line', () => {
    expect(normalizeShape({ type: 'freehand', points: [[3, 3]] })).not.toBeNull();
    expect(normalizeShape({ type: 'line', points: [[0, 0]] })).toBeNull();
    expect(normalizeShape(null)).toBeNull();
  });

  it('de-duplicates ids against a used-id set', () => {
    const used = new Set(['dup']);
    expect(normalizeShape({ id: 'dup', type: 'rectangle' }, used)?.id).not.toBe('dup');
  });
});

describe('draw shapes — normalizeDocument (migration gateway)', () => {
  it('parses a JSON string and stamps the current version', () => {
    const doc = normalizeDocument('{"version":"0.9.0","shapes":[]}');
    expect(doc.version).toBe(VD_DRAW_VERSION);
    expect(doc.shapes).toEqual([]);
  });

  it('coerces junk to an empty document without throwing', () => {
    expect(normalizeDocument(undefined)).toEqual({
      version: VD_DRAW_VERSION,
      viewport: { x: 0, y: 0, scale: 1 },
      shapes: [],
    });
    expect(normalizeDocument(42).shapes).toEqual([]);
  });

  it('drops malformed shapes, defaults unknown types, and de-dupes ids', () => {
    const doc = normalizeDocument({
      shapes: [
        { id: 'a', type: 'rectangle', x: 0, y: 0 },
        { id: 'a', type: 'ellipse', x: 5, y: 5 },
        { type: 'mystery', x: 1, y: 1 },
        null,
        { type: 'line', points: [[0, 0]] },
      ],
    });
    expect(doc.shapes).toHaveLength(3);
    expect(new Set(doc.shapes.map((s) => s.id)).size).toBe(3);
    expect(doc.shapes[2].type).toBe('rectangle');
  });

  it('prunes a dangling groupId (a group needs ≥ 2 members)', () => {
    const doc = normalizeDocument({
      shapes: [
        { id: 'a', type: 'rectangle', x: 0, y: 0, groupId: 'g1' },
        { id: 'b', type: 'rectangle', x: 5, y: 5, groupId: 'g2' },
      ],
    });
    expect(doc.shapes[0].groupId).toBeUndefined();
    expect(doc.shapes[1].groupId).toBeUndefined();
  });

  it('clamps the viewport scale into range', () => {
    expect(normalizeDocument({ viewport: { scale: 99 } }).viewport.scale).toBeLessThanOrEqual(4);
    expect(normalizeDocument({ viewport: { scale: 0 } }).viewport.scale).toBeGreaterThanOrEqual(
      0.2,
    );
  });
});

describe('draw shapes — text wrapping', () => {
  it('returns empty array for empty or non-string input', () => {
    expect(wrapText('')).toEqual([]);
    expect(wrapText(null as unknown as string)).toEqual([]);
    expect(wrapText(undefined as unknown as string)).toEqual([]);
  });

  it('preserves text without wrapping when width is unconstrained', () => {
    expect(wrapText('Hello world', 0)).toEqual(['Hello world']);
    expect(wrapText('Line 1\nLine 2', 0)).toEqual(['Line 1', 'Line 2']);
  });

  it('preserves text within max width limits', () => {
    // 100px width with 10px char width gives 10 max chars
    expect(wrapText('Short text', 100, 10)).toEqual(['Short text']);
  });

  it('wraps text on word boundaries when exceeding width', () => {
    // 100px width with 10px char width gives 10 max chars
    const wrapped = wrapText('Quick brown fox jumps', 100, 10);
    expect(wrapped).toEqual(['Quick', 'brown fox', 'jumps']);
  });

  it('handles explicit newlines combined with auto-wrapping', () => {
    const wrapped = wrapText('Title\nFirst line is long and wraps\nDone', 100, 10);
    expect(wrapped[0]).toBe('Title');
    expect(wrapped).toContain('Done');
    expect(wrapped.length).toBeGreaterThanOrEqual(4);
  });

  it('splits long unbreakable words into segments', () => {
    // 60px / 10px = 6 chars max
    const wrapped = wrapText('abcdefghijklm', 60, 10);
    expect(wrapped).toEqual(['abcdef', 'ghijkl', 'm']);
  });
});
