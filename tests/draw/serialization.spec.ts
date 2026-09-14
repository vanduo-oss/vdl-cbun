// @vitest-environment jsdom

// Serialization contract for the draw core. VD_DRAW_VERSION (1.1.0) is stamped
// into every document via toJSON().version, so the pins are LOAD-BEARING. The
// 0.9 fixture is a synthetic pre-1.0 doc; the 1.0 fixture proves the
// constant-width freehand → brush migration.

import { afterEach, describe, expect, it } from 'vitest';

import componentVersions from '../../component-versions.json';
import fixture09 from '../fixtures/draw-doc-0.9.json';
import fixture10 from '../fixtures/draw-doc-1.0.json';
import { VdDraw as VdDrawCore } from '../../src/draw/core.js';
import { MAX_POINTS_PER_SHAPE, MAX_SHAPES, VD_DRAW_VERSION } from '../../src/draw/shapes.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCore = VdDrawCore & Record<string, any>;

const cores: AnyCore[] = [];

function makeCore(options: Record<string, unknown> = {}): AnyCore {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const core = new VdDrawCore({ element, ...options }) as AnyCore;
  cores.push(core);
  return core;
}

afterEach(() => {
  while (cores.length) cores.pop()!.destroy();
  document.body.replaceChildren();
});

describe('draw serialization — VERSION manifest sync', () => {
  it('exposes VD_DRAW_VERSION === "1.1.0" mirroring component-versions.json', () => {
    expect(VD_DRAW_VERSION).toBe('1.1.0');
    expect(VD_DRAW_VERSION).toBe(componentVersions.draw);
  });
});

describe('draw serialization — toJSON()', () => {
  it('returns exactly { version, viewport, shapes } stamped with the current version', () => {
    const core = makeCore();
    core.load({ version: '0.9.0', shapes: [] });
    const doc = core.toJSON();
    expect(Object.keys(doc).sort()).toEqual(['shapes', 'version', 'viewport']);
    expect(doc.version).toBe('1.1.0');
  });

  it('returns a deep clone — mutating the result never touches editor state', () => {
    const core = makeCore();
    const rect = core.addShape({ type: 'rectangle', x: 10, y: 20, w: 30, h: 40 });
    const doc = core.toJSON();
    doc.version = 'HACKED';
    doc.shapes[0].x = 9999;
    doc.viewport.scale = 42;
    const fresh = core.toJSON();
    expect(fresh.version).toBe('1.1.0');
    expect(fresh.shapes[0].id).toBe(rect.id);
    expect(fresh.shapes[0].x).toBe(10);
    expect(fresh.viewport.scale).toBe(1);
  });
});

describe('draw serialization — backward compatibility', () => {
  it('the 0.9 fixture loads losslessly and re-serializes forward to 1.1.0', () => {
    expect(fixture09.version).toBe('0.9.0');
    const before = JSON.stringify(fixture09);
    const core = makeCore();
    core.load(fixture09);
    const doc = core.toJSON();
    expect(doc.shapes.map((s: { id: string }) => s.id)).toEqual([
      'rect-1',
      'ell-1',
      'line-1',
      'ink-1',
      'note-1',
      'label-1',
    ]);
    expect(doc.shapes.find((s: { id: string }) => s.id === 'note-1').text).toBe('Ship it');
    expect(doc.version).toBe('1.1.0');
    expect(JSON.stringify(fixture09)).toBe(before);
  });

  it('migrates a 1.0 constant-width freehand to the default pen brush', () => {
    expect(fixture10.version).toBe('1.0.0');
    const before = JSON.stringify(fixture10);
    const core = makeCore();
    core.load(fixture10);
    const doc = core.toJSON();

    expect(doc.version).toBe('1.1.0');
    const ink = doc.shapes.find((s: { id: string }) => s.id === 'ink-a');
    expect(ink).toBeDefined();
    expect(ink.brush).toBe('pen');
    expect(ink.color).toBe('#e03131'); // stroke → color
    expect(ink.size).toBe(6); // strokeWidth 3 → brush size 6
    expect(ink.points).toHaveLength(3);
    expect('stroke' in ink).toBe(false);

    const rect = doc.shapes.find((s: { id: string }) => s.id === 'rect-a');
    expect(rect).toBeDefined();
    expect(rect.color).toBe('#1971c2');
    expect(JSON.stringify(fixture10)).toBe(before);
  });
});

describe('draw serialization — bounded deserialization (untrusted document caps)', () => {
  it('truncates a document with more than MAX_SHAPES shapes without throwing', () => {
    const shapes = Array.from({ length: MAX_SHAPES + 250 }, (_, i) => ({
      type: 'rectangle',
      x: i,
      y: 0,
      w: 10,
      h: 10,
    }));
    const core = makeCore();
    expect(() => core.load({ version: '1.1.0', shapes })).not.toThrow();

    const doc = core.toJSON();
    expect(doc.shapes).toHaveLength(MAX_SHAPES);
    expect(doc.version).toBe('1.1.0');
  }, 30000);

  it('truncates a freehand stroke with more than MAX_POINTS_PER_SHAPE points', () => {
    const points = Array.from({ length: MAX_POINTS_PER_SHAPE + 500 }, (_, i) => [i, i]);
    const core = makeCore();
    expect(() =>
      core.load({ version: '1.1.0', shapes: [{ id: 'ink', type: 'freehand', points }] }),
    ).not.toThrow();

    const doc = core.toJSON();
    expect(doc.shapes).toHaveLength(1);
    expect(doc.shapes[0].points).toHaveLength(MAX_POINTS_PER_SHAPE);
  }, 30000);

  it('leaves an in-range document unchanged (round-trips within the caps)', () => {
    const core = makeCore();
    core.load({
      version: '1.1.0',
      shapes: [
        { id: 'r1', type: 'rectangle', x: 0, y: 0, w: 20, h: 20 },
        {
          id: 'f1',
          type: 'freehand',
          brush: 'pen',
          points: [
            [0, 0],
            [1, 1],
            [2, 2],
          ],
        },
      ],
    });

    const doc = core.toJSON();
    expect(doc.shapes).toHaveLength(2);
    expect(doc.shapes.map((s: { id: string }) => s.id)).toEqual(['r1', 'f1']);
    expect(doc.shapes[1].points).toHaveLength(3);
    expect(doc.version).toBe('1.1.0');
  });
});
