// @vitest-environment jsdom

// Adaptive gesture rendering: pan/zoom events no longer redraw synchronously.
// rAF coalescing collapses a burst of pointermove events into at most one frame,
// and above FAST_RENDER_LIMIT visible cells the frame is a fast blit of the last
// sharp snapshot (drawImage) rather than a full path rebuild. A sharp culled
// re-render follows after the idle window; data APIs stay synchronous.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { VdHexGrid as VdHexGridCore } from '../../src/hex-grid/core.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGrid = VdHexGridCore & Record<string, any>;

const FAST_LIMIT = 8000;

const grids: AnyGrid[] = [];

function makeGrid(width: number, height: number, size: number): AnyGrid {
  const element = document.createElement('div');
  const canvas = document.createElement('canvas');
  document.body.appendChild(element);
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({
      width: 800,
      height: 400,
      left: 0,
      top: 0,
      right: 800,
      bottom: 400,
      x: 0,
      y: 0,
    }),
  });
  const grid = new VdHexGridCore({ element, canvas, size, width, height }) as AnyGrid;
  grids.push(grid);
  return grid;
}

function pointer(grid: AnyGrid, type: string, clientX: number, clientY: number): void {
  grid.canvas.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }));
}

function drawImageCount(grid: AnyGrid): number {
  return grid.ctx.__calls.filter((c: { method: string }) => c.method === 'drawImage').length;
}

function beginPathCount(grid: AnyGrid): number {
  return grid.ctx.__calls.filter((c: { method: string }) => c.method === 'beginPath').length;
}

afterEach(() => {
  while (grids.length) grids.pop()!.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('hex-grid adaptive gesture rendering', () => {
  it('blits once per frame for a large grid and sharpens after idle', async () => {
    vi.useFakeTimers();
    // size 2 with a 300x150 grid yields well over FAST_RENDER_LIMIT visible cells.
    const grid = makeGrid(300, 150, 2);
    expect(grid.getRenderStats().visible).toBeGreaterThan(FAST_LIMIT);

    grid.ctx.__calls.length = 0;
    pointer(grid, 'pointerdown', 0, 0);
    for (let i = 0; i < 5; i++) pointer(grid, 'pointermove', (i + 1) * 10, 0);

    await vi.advanceTimersByTimeAsync(20);
    // A burst of moves coalesced into a single fast blit frame.
    expect(drawImageCount(grid)).toBe(1);
    const fastStats = grid.getRenderStats();
    expect(fastStats.mode).toBe('fast');
    // Fast frames report the current visible count but draw no vector hexes.
    expect(fastStats.total).toBe(grid.hexes.size);
    expect(fastStats.visible).toBe(grid.getVisibleHexes().length);
    expect(fastStats.drawn).toBe(0);

    // After the idle window a sharp culled frame is rendered.
    await vi.advanceTimersByTimeAsync(200);
    expect(grid.getRenderStats().mode).toBe('sharp');
    expect(Number.isFinite(grid.getRenderStats().lastRenderMs)).toBe(true);
  });

  it('renders sharply per frame for a small grid (no blit)', async () => {
    vi.useFakeTimers();
    const grid = makeGrid(4, 4, 30);
    expect(grid.getRenderStats().visible).toBeLessThanOrEqual(FAST_LIMIT);

    grid.ctx.__calls.length = 0;
    pointer(grid, 'pointerdown', 0, 0);
    pointer(grid, 'pointermove', 20, 0);

    await vi.advanceTimersByTimeAsync(20);
    expect(drawImageCount(grid)).toBe(0);
    expect(beginPathCount(grid)).toBeGreaterThan(0);
    expect(grid.getRenderStats().mode).toBe('sharp');
  });

  it('finishes a drag with a synchronous sharp frame on pointer up', async () => {
    vi.useFakeTimers();
    const grid = makeGrid(300, 150, 2);
    pointer(grid, 'pointerdown', 0, 0);
    pointer(grid, 'pointermove', 40, 0);
    await vi.advanceTimersByTimeAsync(20);
    expect(grid.getRenderStats().mode).toBe('fast');

    pointer(grid, 'pointerup', 40, 0);
    expect(grid.getRenderStats().mode).toBe('sharp');
  });

  it('keeps explicit data APIs synchronous', () => {
    vi.useFakeTimers();
    const grid = makeGrid(300, 150, 2);
    grid.ctx.__calls.length = 0;
    grid.setHexFill(0, 0, '#123456');
    // No timers advanced — the sharp render happened inside the call.
    expect(beginPathCount(grid)).toBeGreaterThan(0);
    expect(grid.getRenderStats().mode).toBe('sharp');
  });
});
