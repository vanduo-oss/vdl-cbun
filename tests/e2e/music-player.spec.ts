import { expect, test, type ConsoleMessage } from '@playwright/test';

// Real-browser packaging smoke: the fixture imports the BUILT dist ESM entry
// (/dist/music-player/index.js) and mounts MusicPlayer.initPlayer. Asserts the
// chrome DOM, version constant, and a synchronous volume mutation — what jsdom
// unit tests cannot prove about the shipped artifact.

interface MusicWindow {
  __ready?: boolean;
  musicVersion: string;
  getState: () => {
    currentTrack: { name: string; url: string } | null;
    volume: number;
    tracks: Array<{ name: string }>;
  } | null;
  setVolume: (v: number) => void;
}

test.describe('music-player smoke — built dist entry mounts chrome', () => {
  const errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors.length = 0;
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto('/tests/e2e/fixtures/music-player.html');
    await page.waitForFunction(() => (window as unknown as MusicWindow).__ready === true);
  });

  test('mounts controls and reports the built-entry version', async ({ page }) => {
    await expect(page.locator('#player.vd-music-player')).toHaveCount(1);
    await expect(page.locator('#player .vd-music-player-controls')).toHaveCount(1);
    await expect(page.locator('#player .vd-music-player-btn-play')).toHaveCount(1);
    await expect(page.locator('#player .vd-music-player-track-name')).toHaveText('Smoke');

    const version = await page.evaluate(() => (window as unknown as MusicWindow).musicVersion);
    expect(version).toBe('1.0.1');
  });

  test('getState reflects seeded tracks and setVolume mutates state', async ({ page }) => {
    const before = await page.evaluate(() => (window as unknown as MusicWindow).getState());
    expect(before?.tracks.map((t) => t.name)).toEqual(['Smoke']);
    expect(before?.volume).toBeCloseTo(0.4, 5);

    await page.evaluate(() => (window as unknown as MusicWindow).setVolume(0.75));
    const after = await page.evaluate(() => (window as unknown as MusicWindow).getState());
    expect(after?.volume).toBeCloseTo(0.75, 5);
  });

  test('ships with zero console errors', async () => {
    expect(errors).toEqual([]);
  });
});
