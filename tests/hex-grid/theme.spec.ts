// @vitest-environment jsdom

// Theme-color reading: the `--vd-*` → legacy `--*` → hardcoded-default fallback
// chain in VdHexGridCore._getThemeColors(). getComputedStyle is stubbed with a
// controlled token map (jsdom's custom-property resolution through
// getComputedStyle is unreliable, and the design explicitly permits mocking it
// for the token case; the real `--vd-*` cascade is asserted by the Playwright
// hex smoke in a real browser). Also pins the version constants + manifest sync.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import componentVersions from '../../component-versions.json';
import { VdHexGrid as VdHexGridCore, VD_HEX_VERSION } from '../../src/hex-grid/core.js';

/** Install a getComputedStyle whose declaration reads from `tokens`. */
function stubComputedStyle(tokens: Record<string, string>): void {
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) => tokens[name] ?? '',
  }));
}

/** Build a grid and hand back its resolved theme colors, then it is destroyed. */
const grids: VdHexGridCore[] = [];
function themeColorsOf(tokens: Record<string, string>) {
  stubComputedStyle(tokens);
  const element = document.createElement('div');
  document.body.appendChild(element);
  const grid = new VdHexGridCore({ element, size: 30, width: 3, height: 3 });
  grids.push(grid);
  return grid.themeColors;
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  while (grids.length) grids.pop()!.destroy();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('VdHexGridCore theme-color reading', () => {
  it('uses --vd-* tokens when present', () => {
    const colors = themeColorsOf({
      '--vd-bg-primary': '#111111',
      '--vd-bg-secondary': '#222222',
      '--vd-border-color': '#333333',
      '--vd-color-primary': '#444444',
      '--vd-text-primary': '#555555',
      '--vd-text-muted': '#666666',
    });
    expect(colors).toEqual({
      bgPrimary: '#111111',
      bgSecondary: '#222222',
      borderColor: '#333333',
      colorPrimary: '#444444',
      textColor: '#555555',
      textMuted: '#666666',
    });
  });

  it('falls back to legacy unprefixed tokens when --vd-* is absent', () => {
    const colors = themeColorsOf({
      '--bg-primary': '#a1a1a1',
      '--bg-secondary': '#b2b2b2',
      '--border-color': '#c3c3c3',
      '--color-primary': '#d4d4d4',
      '--text-primary': '#e5e5e5',
      '--text-muted': '#f6f6f6',
    });
    expect(colors).toEqual({
      bgPrimary: '#a1a1a1',
      bgSecondary: '#b2b2b2',
      borderColor: '#c3c3c3',
      colorPrimary: '#d4d4d4',
      textColor: '#e5e5e5',
      textMuted: '#f6f6f6',
    });
  });

  it('prefers --vd-* over the legacy token when both are set', () => {
    const colors = themeColorsOf({
      '--vd-bg-primary': '#000fff',
      '--bg-primary': '#legacy',
    });
    expect(colors.bgPrimary).toBe('#000fff');
  });

  it('falls back to hardcoded defaults when no tokens are defined', () => {
    const colors = themeColorsOf({});
    expect(colors).toEqual({
      bgPrimary: '#ffffff',
      bgSecondary: '#f5f5f5',
      borderColor: '#e0e0e0',
      colorPrimary: '#3b82f6',
      textColor: '#1f2937',
      textMuted: '#6b7280',
    });
  });

  it('trims surrounding whitespace from token values', () => {
    const colors = themeColorsOf({ '--vd-bg-primary': '   #abcdef  ' });
    expect(colors.bgPrimary).toBe('#abcdef');
  });

  it('treats a whitespace-only token as empty and continues the chain', () => {
    // --vd-* is whitespace only → skipped; legacy value wins.
    const colors = themeColorsOf({
      '--vd-border-color': '   ',
      '--border-color': '#123456',
    });
    expect(colors.borderColor).toBe('#123456');
  });
});

describe('hex-grid version constants', () => {
  it('VD_HEX_VERSION === "1.2.0"', () => {
    expect(VD_HEX_VERSION).toBe('1.2.0');
  });

  it('static VdHexGridCore.VERSION mirrors VD_HEX_VERSION', () => {
    expect(VdHexGridCore.VERSION).toBe('1.2.0');
    expect(VdHexGridCore.VERSION).toBe(VD_HEX_VERSION);
  });

  it('matches the component-versions.json manifest', () => {
    expect(componentVersions['hex-grid']).toBe(VD_HEX_VERSION);
  });
});
