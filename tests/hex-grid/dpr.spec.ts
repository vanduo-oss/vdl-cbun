// @vitest-environment jsdom

// Device-pixel-ratio aware backing store: canvas.width/height become
// CSS size x ratio and drawing is seeded with setTransform(ratio, ...). The
// recording 2d context logs setTransform so the ratio can be asserted directly.
// pixelRatio:1 must reproduce a 1:1 buffer; 'auto' clamps devicePixelRatio at 2.

import { afterEach, describe, expect, it } from 'vitest';

import { VdHexGrid as VdHexGridCore } from '../../src/hex-grid/core.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGrid = VdHexGridCore & Record<string, any>;

const grids: AnyGrid[] = [];

function setDevicePixelRatio(value: number): void {
  Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true });
}

function makeGrid(pixelRatio: number | 'auto'): AnyGrid {
  const element = document.createElement('div');
  const canvas = document.createElement('canvas');
  document.body.appendChild(element);
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({
      width: 300,
      height: 200,
      left: 0,
      top: 0,
      right: 300,
      bottom: 200,
      x: 0,
      y: 0,
    }),
  });
  const grid = new VdHexGridCore({
    element,
    canvas,
    size: 20,
    width: 4,
    height: 4,
    pixelRatio,
  }) as AnyGrid;
  grids.push(grid);
  return grid;
}

afterEach(() => {
  while (grids.length) grids.pop()!.destroy();
  document.body.replaceChildren();
  setDevicePixelRatio(1);
});

describe('hex-grid device-pixel-ratio sizing', () => {
  it('pixelRatio: 1 keeps a 1:1 backing store and seeds a unit setTransform', () => {
    setDevicePixelRatio(2);
    const grid = makeGrid(1);
    expect(grid.canvas.width).toBe(300);
    expect(grid.canvas.height).toBe(200);

    grid.ctx.__calls.length = 0;
    grid.setPixelRatio(1);
    const transforms = grid.ctx.__calls.filter(
      (c: { method: string; args: number[] }) => c.method === 'setTransform',
    );
    expect(transforms.length).toBeGreaterThan(0);
    // A unit seed must be present, and no transform may carry the device ratio.
    expect(transforms.some((c: { args: number[] }) => c.args.join(',') === '1,0,0,1,0,0')).toBe(
      true,
    );
    expect(transforms.every((c: { args: number[] }) => c.args[0] === 1 && c.args[3] === 1)).toBe(
      true,
    );
  });

  it('a fixed ratio scales the backing store', () => {
    const grid = makeGrid(2);
    expect(grid.canvas.width).toBe(600);
    expect(grid.canvas.height).toBe(400);
    expect(grid.getRenderStats().pixelRatio).toBe(2);
  });

  it("'auto' follows devicePixelRatio", () => {
    setDevicePixelRatio(1.5);
    const grid = makeGrid('auto');
    expect(grid.canvas.width).toBe(450);
    expect(grid.canvas.height).toBe(300);
  });

  it("'auto' clamps devicePixelRatio at 2", () => {
    setDevicePixelRatio(3);
    const grid = makeGrid('auto');
    expect(grid.canvas.width).toBe(600);
    expect(grid.getRenderStats().pixelRatio).toBe(2);
  });

  it('applies the ratio through setTransform during render', () => {
    const grid = makeGrid(2);
    grid.ctx.__calls.length = 0;
    grid._render();
    const seeded = grid.ctx.__calls.some(
      (c: { method: string; args: number[] }) =>
        c.method === 'setTransform' &&
        c.args[0] === 2 &&
        c.args[1] === 0 &&
        c.args[2] === 0 &&
        c.args[3] === 2,
    );
    expect(seeded).toBe(true);
  });

  it('setPixelRatio updates the buffer without regenerating the grid', () => {
    const grid = makeGrid(1);
    const count = grid.getHexCount();
    grid.setPixelRatio(2);
    expect(grid.canvas.width).toBe(600);
    expect(grid.getHexCount()).toBe(count);
  });
});
