// @vitest-environment jsdom

// Configurable zoom limits and anchored zoom. The core used to hardcode
// ZOOM_MIN/ZOOM_MAX/ZOOM_FACTOR, so hosts could neither zoom past 3x nor zoom
// out below a fitted scale under 0.3 without the - path clamping upward.
// These specs cover the new options, scaleAround(), setZoomLimits(), and the
// centre-anchored zoomIn/zoomOut behaviour.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { VdHexGrid as VdHexGridCore } from '../../src/hex-grid/core.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGrid = VdHexGridCore & Record<string, any>;

const grids: AnyGrid[] = [];

function makeGrid(
  opts: Record<string, unknown> = {},
  rect: { width: number; height: number } = { width: 400, height: 300 },
): AnyGrid {
  const element = document.createElement('div');
  const canvas = document.createElement('canvas');
  document.body.appendChild(element);
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({
      width: rect.width,
      height: rect.height,
      left: 0,
      top: 0,
      right: rect.width,
      bottom: rect.height,
      x: 0,
      y: 0,
    }),
  });
  const grid = new VdHexGridCore({
    element,
    canvas,
    size: 30,
    width: 10,
    height: 10,
    ...opts,
  }) as AnyGrid;
  grids.push(grid);
  return grid;
}

/** World coordinate currently under a canvas-local point. */
function worldAt(grid: AnyGrid, lx: number, ly: number): { x: number; y: number } {
  const { x, y, scale } = grid.transform;
  return { x: (lx - x) / scale, y: (ly - y) / scale };
}

afterEach(() => {
  while (grids.length) grids.pop()!.destroy();
  document.body.replaceChildren();
});

describe('hex-grid configurable zoom', () => {
  it('uses the documented defaults', () => {
    const grid = makeGrid();
    expect(grid.minScale).toBe(0.3);
    expect(grid.maxScale).toBe(3);
    expect(grid.zoomFactor).toBe(0.1);
    expect(grid.zoomStep).toBe(1.2);
  });

  it('stores custom constructor limits', () => {
    const grid = makeGrid({ minScale: 0.05, maxScale: 20, zoomFactor: 0.2, zoomStep: 1.5 });
    expect(grid.minScale).toBe(0.05);
    expect(grid.maxScale).toBe(20);
    expect(grid.zoomFactor).toBe(0.2);
    expect(grid.zoomStep).toBe(1.5);
  });

  it('zoomIn reaches a custom maxScale and clamps there', () => {
    const grid = makeGrid({ maxScale: 20, zoomStep: 2 });
    for (let i = 0; i < 40; i++) grid.zoomIn();
    expect(grid.transform.scale).toBe(20);
    grid.zoomIn();
    expect(grid.transform.scale).toBe(20);
  });

  it('zoomOut clamps to a custom minScale instead of clamping upward', () => {
    const grid = makeGrid({ minScale: 0.05, zoomStep: 1.2 });
    grid.transform = { x: 0, y: 0, scale: 0.06 };
    grid.zoomOut();
    expect(grid.transform.scale).toBe(0.05);
    expect(grid.transform.scale).toBeLessThanOrEqual(0.06);
  });

  it('scaleAround preserves the anchored world point and emits zoom', () => {
    const grid = makeGrid({ maxScale: 20 });
    grid.transform = { x: -40, y: -20, scale: 1.5 };
    const before = worldAt(grid, 200, 150);
    const onZoom = vi.fn();
    grid.on('zoom', onZoom);

    grid.scaleAround(2, 200, 150);

    expect(grid.transform.scale).toBe(3);
    const after = worldAt(grid, 200, 150);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
    expect(onZoom).toHaveBeenCalledWith({ scale: 3 });
  });

  it('scaleAround clamps at maxScale', () => {
    const grid = makeGrid({ maxScale: 4 });
    grid.transform = { x: 0, y: 0, scale: 3 };
    grid.scaleAround(10, 100, 100);
    expect(grid.transform.scale).toBe(4);
  });

  it('scaleAround is a no-op when already clamped', () => {
    const grid = makeGrid({ maxScale: 3 });
    grid.transform = { x: 0, y: 0, scale: 3 };
    const onZoom = vi.fn();
    grid.on('zoom', onZoom);
    grid.scaleAround(2, 100, 100);
    expect(grid.transform.scale).toBe(3);
    expect(onZoom).not.toHaveBeenCalled();
  });

  it('zoomIn anchors at the viewport centre and uses zoomStep', () => {
    const grid = makeGrid({ zoomStep: 1.5 }, { width: 400, height: 300 });
    grid.transform = { x: -100, y: -50, scale: 1 };
    const before = worldAt(grid, 200, 150);

    grid.zoomIn();

    expect(grid.transform.scale).toBeCloseTo(1.5, 10);
    const after = worldAt(grid, 200, 150);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('setZoomLimits reclamps the current scale and emits zoom', () => {
    const grid = makeGrid();
    grid.transform = { x: 0, y: 0, scale: 3 };
    const onZoom = vi.fn();
    grid.on('zoom', onZoom);

    grid.setZoomLimits({ maxScale: 1 });

    expect(grid.maxScale).toBe(1);
    expect(grid.transform.scale).toBe(1);
    expect(onZoom).toHaveBeenCalledWith({ scale: 1 });
    grid.zoomIn();
    expect(grid.transform.scale).toBe(1);
  });

  it('setZoomLimits ignores non-finite or out-of-range values', () => {
    const grid = makeGrid();
    grid.setZoomLimits({ maxScale: -1, minScale: Number.NaN, zoomStep: 0.5, zoomFactor: 0 });
    expect(grid.maxScale).toBe(3);
    expect(grid.minScale).toBe(0.3);
    expect(grid.zoomStep).toBe(1.2);
    expect(grid.zoomFactor).toBe(0.1);
  });

  it('setZoomLimits keeps minScale at or below maxScale', () => {
    const grid = makeGrid();
    grid.setZoomLimits({ minScale: 5, maxScale: 2 });
    expect(grid.minScale).toBe(5);
    expect(grid.maxScale).toBe(5);
  });

  it('wheel zoom uses the instance zoomFactor and limits', () => {
    const grid = makeGrid({ zoomFactor: 0.5, minScale: 0.1, maxScale: 10 });
    grid.transform = { x: 0, y: 0, scale: 4 };

    grid.canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 1, clientX: 10, clientY: 10, bubbles: true }),
    );

    expect(grid.transform.scale).toBe(2);
  });
});
