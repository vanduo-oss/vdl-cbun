// @vitest-environment jsdom

// Viewport culling: _render() must only draw cells intersecting the viewport,
// via the spatial bucket index built in _generateGrid(). The recording 2d
// context (tests/setup.ts) logs each beginPath / fill / stroke call, so we can
// count exactly how many hexes were drawn. customRenderCallback fan-out follows
// the culled set (documented behavior change) and cull:false restores the old
// whole-grid iteration.

import { afterEach, describe, expect, it } from 'vitest';

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
    width: 20,
    height: 20,
    ...opts,
  }) as AnyGrid;
  grids.push(grid);
  return grid;
}

function beginPathCount(grid: AnyGrid): number {
  return grid.ctx.__calls.filter((c: { method: string }) => c.method === 'beginPath').length;
}

function resetCalls(grid: AnyGrid): void {
  grid.ctx.__calls.length = 0;
}

afterEach(() => {
  while (grids.length) grids.pop()!.destroy();
  document.body.replaceChildren();
});

describe('hex-grid viewport culling', () => {
  it('draws only the visible subset when culling is enabled (default)', () => {
    const grid = makeGrid();
    const total = grid.getHexCount();
    expect(total).toBe(400);

    // Zoom into the top-left corner so only a fraction is on screen.
    grid.transform = { x: 0, y: 0, scale: 4 };
    resetCalls(grid);
    grid._render();

    const drawn = beginPathCount(grid);
    const visible = grid.getVisibleHexes().length;
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(total);
    expect(drawn).toBe(visible);
  });

  it('reports culled counts through getRenderStats', () => {
    const grid = makeGrid();
    grid.transform = { x: 0, y: 0, scale: 4 };
    grid._render();

    const stats = grid.getRenderStats();
    expect(stats.total).toBe(400);
    expect(stats.visible).toBeLessThan(stats.total);
    expect(stats.drawn).toBe(stats.visible);
    expect(stats.mode).toBe('sharp');
    expect(Number.isFinite(stats.lastRenderMs)).toBe(true);
  });

  it('fires customRenderCallback only for visible cells when culling', () => {
    const grid = makeGrid();
    let calls = 0;
    grid.setCustomRender(() => {
      calls += 1;
    });
    grid.transform = { x: 0, y: 0, scale: 4 };

    calls = 0;
    grid._render();
    expect(calls).toBe(grid.getVisibleHexes().length);
    expect(calls).toBeLessThan(grid.getHexCount());
  });

  it('cull:false restores whole-grid iteration and callback fan-out', () => {
    const grid = makeGrid({ cull: false });
    let calls = 0;
    grid.setCustomRender(() => {
      calls += 1;
    });
    grid.transform = { x: 0, y: 0, scale: 4 };

    calls = 0;
    resetCalls(grid);
    grid._render();
    expect(beginPathCount(grid)).toBe(grid.getHexCount());
    expect(calls).toBe(grid.getHexCount());
  });

  it('draws the selected hex even when it is off-screen', () => {
    const grid = makeGrid();
    const target = grid.getHex(10, 19);
    expect(target).toBeTruthy();
    grid.selectedHex = target;

    // Anchor the viewport far away from the selected cell.
    grid.transform = { x: -99999, y: -99999, scale: 1 };
    resetCalls(grid);
    grid._render();

    // One extra beginPath for the selected hex drawn after the culled loop.
    expect(beginPathCount(grid)).toBe(grid.getVisibleHexes().length + 1);
  });

  it('rebuilds the bucket index when dimensions change', () => {
    const grid = makeGrid({ width: 8, height: 8 });
    expect(grid.getHexCount()).toBe(64);
    grid.setDimensions(40, 30);
    expect(grid.getHexCount()).toBe(1200);

    grid.transform = { x: 0, y: 0, scale: 4 };
    grid._render();
    // The index reflects the new dimensions: culled count is bounded by total.
    expect(grid.getRenderStats().visible).toBeLessThan(1200);
    expect(grid.getRenderStats().drawn).toBe(grid.getRenderStats().visible);
  });
});
