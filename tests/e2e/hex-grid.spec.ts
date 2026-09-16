import { expect, test, type ConsoleMessage } from '@playwright/test';

// Real-browser packaging smoke: the fixture imports the BUILT dist ESM entry
// (/dist/hex-grid/index.js, `vue` resolved locally via an import map) and
// constructs the framework-agnostic canvas core. This is the case jsdom cannot
// cover — a real 2d context painting real pixels. We assert the grid built its
// hexes, that click-selection emits `select`, that getImageData proves the
// canvas painted token-derived colors, and that zero console errors occurred.

interface HexCellRef {
  q: number;
  r: number;
  x: number;
  y: number;
}
interface HexStats {
  total: number;
  visible: number;
  drawn: number;
  mode: 'sharp' | 'fast';
  lastRenderMs: number;
  pixelRatio: number;
  scale: number;
}
interface HexWindow {
  __ready?: boolean;
  hexVersion: string;
  lastSelect: { q: number; r: number } | null;
  grid: {
    getHexCount(): number;
    hasHex(q: number, r: number): boolean;
    getAllHexes(): HexCellRef[];
    getVisibleHexes(): HexCellRef[];
    getRenderStats(): HexStats;
    selectedHex: { q: number; r: number } | null;
  };
  createGrid: (options?: Record<string, unknown>) => unknown;
  sampleCanvas: () => {
    uniqueColors: number;
    opaque: number;
    fillMatches: number;
    w: number;
    h: number;
  };
  getRenderStats: () => HexStats;
  getVisibleHexes: () => HexCellRef[];
  setView: (t: { x?: number; y?: number; scale?: number }) => void;
  drag: (dx: number, dy: number, steps?: number) => Promise<HexStats>;
}

test.describe('hex-grid smoke — built dist entry paints a real canvas', () => {
  const errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors.length = 0;
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto('/tests/e2e/fixtures/hex.html');
    await page.waitForFunction(() => (window as unknown as HexWindow).__ready === true);
    await page.evaluate(() => (window as unknown as HexWindow).createGrid({ width: 8, height: 6 }));
  });

  test('builds the grid and reports its version', async ({ page }) => {
    const result = await page.evaluate(() => {
      const w = window as unknown as HexWindow;
      return {
        count: w.grid.getHexCount(),
        hasOrigin: w.grid.hasHex(0, 0),
        version: w.hexVersion,
      };
    });
    expect(result.count).toBe(48);
    expect(result.hasOrigin).toBe(true);
    expect(result.version).toBe('1.2.0');
  });

  test('paints token-derived colors onto the canvas (getImageData)', async ({ page }) => {
    const sample = await page.evaluate(() => (window as unknown as HexWindow).sampleCanvas());
    expect(sample.w).toBeGreaterThan(0);
    expect(sample.h).toBeGreaterThan(0);
    // more than a single flat color ⇒ hexes drew over the background
    expect(sample.uniqueColors).toBeGreaterThan(1);
    expect(sample.opaque).toBeGreaterThan(0);
    // pixels matching the --vd-bg-secondary hex fill (#22aa55) ⇒ token-derived paint
    expect(sample.fillMatches).toBeGreaterThan(0);
  });

  test('selects a hex on click and emits the select event', async ({ page }) => {
    const origin = await page.evaluate(() => {
      const w = window as unknown as HexWindow;
      return w.grid.getAllHexes().find((h) => h.q === 0 && h.r === 0) ?? null;
    });
    expect(origin).not.toBeNull();

    await page.locator('#hex-canvas').click({ position: { x: origin!.x, y: origin!.y } });

    const result = await page.evaluate(() => {
      const w = window as unknown as HexWindow;
      return { selected: w.grid.selectedHex, lastSelect: w.lastSelect };
    });
    expect(result.selected).not.toBeNull();
    expect(result.lastSelect).not.toBeNull();
    // the origin cell is generated with q = -0; normalize the sign before compare
    expect(result.lastSelect!.q + 0).toBe(0);
    expect(result.lastSelect!.r + 0).toBe(0);
  });

  test('culls to the viewport after zooming in', async ({ page }) => {
    const result = await page.evaluate(() => {
      const w = window as unknown as HexWindow;
      w.createGrid({ size: 6, width: 200, height: 120 });
      w.setView({ x: 0, y: 0, scale: 4 });
      const stats = w.getRenderStats();
      return { stats, visibleCount: w.getVisibleHexes().length };
    });
    expect(result.stats.total).toBe(24000);
    expect(result.stats.visible).toBeLessThan(result.stats.total);
    expect(result.stats.visible).toBeGreaterThan(0);
    expect(result.stats.drawn).toBe(result.stats.visible);
    expect(result.visibleCount).toBe(result.stats.visible);
  });

  test('sizes the backing store at least as large as the CSS box', async ({ page }) => {
    const result = await page.evaluate(() => {
      const canvas = document.getElementById('hex-canvas') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      return { bufferWidth: canvas.width, cssWidth: rect.width };
    });
    expect(result.cssWidth).toBeGreaterThan(0);
    expect(result.bufferWidth).toBeGreaterThanOrEqual(result.cssWidth);
  });

  test('uses the fast path while dragging a large grid, then keeps painting', async ({ page }) => {
    const stats = await page.evaluate(async () => {
      const w = window as unknown as HexWindow;
      w.createGrid({ size: 2, width: 400, height: 200 });
      return w.drag(160, 40);
    });
    expect(stats.visible).toBeGreaterThan(8000);
    expect(stats.mode).toBe('fast');
    expect(Number.isFinite(stats.lastRenderMs)).toBe(true);

    // The canvas is still painted after the gesture.
    const sample = await page.evaluate(() => (window as unknown as HexWindow).sampleCanvas());
    expect(sample.fillMatches).toBeGreaterThan(0);
  });

  test.afterEach(() => {
    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
