import { expect, test, type ConsoleMessage } from '@playwright/test';

// Real-browser packaging smoke: the fixture imports the BUILT dist ESM entry
// (/dist/draw/index.js, `vue` resolved locally via an import map) and mounts the
// framework-agnostic draw core with a seeded document. Asserts SVG marks from
// seed data, tool/brush freehand creation, toSVG export, and a stable undo —
// what jsdom unit tests cannot prove about the shipped artifact.

interface DrawWindow {
  __ready?: boolean;
  drawVersion: string;
  getShapes: () => Array<{ id: string; type: string }>;
  getTool: () => string;
  setTool: (tool: string) => unknown;
  canUndo: () => boolean;
  undo: () => unknown;
  toSVG: () => string;
  addRect: () => { id: string };
  brushStroke: () => Promise<{
    before: number;
    after: number;
    freehandCount: number;
    lastPoints: number;
  }>;
}

test.describe('draw smoke — built dist entry mounts and paints SVG', () => {
  const errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors.length = 0;
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto('/tests/e2e/fixtures/draw.html');
    await page.waitForFunction(() => (window as unknown as DrawWindow).__ready === true);
  });

  test('mounts the host shell and reports the built-entry version', async ({ page }) => {
    // The core applies `.vd-draw-host` to the mount element itself.
    await expect(page.locator('#draw.vd-draw-host')).toHaveCount(1);
    await expect(page.locator('#draw .vd-draw-shell')).toHaveCount(1);
    await expect(page.locator('#draw svg.vd-draw-svg')).toHaveCount(1);

    const version = await page.evaluate(() => (window as unknown as DrawWindow).drawVersion);
    expect(version).toBe('1.1.0');
  });

  test('renders seeded rectangle and freehand marks in the SVG', async ({ page }) => {
    await expect(page.locator('#draw svg [data-shape-id="seed-rect"]')).toHaveCount(1);
    await expect(page.locator('#draw svg [data-shape-id="seed-ink"]')).toHaveCount(1);
    await expect(page.locator('#draw svg .vd-draw-shape')).toHaveCount(1);
    await expect(page.locator('#draw svg .vd-draw-ink')).toHaveCount(1);

    const shapes = await page.evaluate(() => (window as unknown as DrawWindow).getShapes());
    expect(shapes.map((s) => s.id).sort()).toEqual(['seed-ink', 'seed-rect']);
  });

  test('setTool(draw) + brush stroke creates a freehand shape', async ({ page }) => {
    const result = await page.evaluate(() => (window as unknown as DrawWindow).brushStroke());
    expect(result.after).toBe(result.before + 1);
    expect(result.freehandCount).toBe(2);
    expect(result.lastPoints).toBeGreaterThan(1);
    await expect(page.locator('#draw svg .vd-draw-ink')).toHaveCount(2);
  });

  test('toSVG export is a non-empty standalone SVG string', async ({ page }) => {
    const svg = await page.evaluate(() => (window as unknown as DrawWindow).toSVG());
    expect(svg.length).toBeGreaterThan(100);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    // Standalone export omits data-shape-id; assert mark classes instead.
    expect(svg).toContain('vd-draw-shape');
    expect(svg).toContain('vd-draw-ink');
  });

  test('undo reverts a committed shape add', async ({ page }) => {
    const before = await page.evaluate(() => {
      const w = window as unknown as DrawWindow;
      w.addRect();
      return { count: w.getShapes().length, canUndo: w.canUndo() };
    });
    expect(before.count).toBe(3);
    expect(before.canUndo).toBe(true);

    const after = await page.evaluate(() => {
      const w = window as unknown as DrawWindow;
      w.undo();
      return {
        count: w.getShapes().length,
        ids: w
          .getShapes()
          .map((s) => s.id)
          .sort(),
      };
    });
    expect(after.count).toBe(2);
    expect(after.ids).toEqual(['seed-ink', 'seed-rect']);
  });

  test.afterEach(() => {
    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
