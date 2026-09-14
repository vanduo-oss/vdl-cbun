// @vitest-environment jsdom

// Regression: _setupEvents() attaches ~11 canvas listeners (pointer / wheel /
// touch / click / mouseenter / mouseleave). They used to be anonymous, so
// destroy() — which only disconnected the theme observer / media handler — left
// every one of them attached. Because the canvas can be caller-supplied and
// reused across grid instances, that leaked all handlers. The fix stores each
// handler and removes it in destroy(). Here we spy add/removeEventListener on a
// caller-supplied canvas and assert every canvas listener is torn down.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { VdHexGrid as VdHexGridCore } from '../../src/hex-grid/core.js';

const CANVAS_EVENTS = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointerleave',
  'click',
  'wheel',
  'touchstart',
  'touchmove',
  'touchend',
  'mouseenter',
  'mouseleave',
];

const grids: VdHexGridCore[] = [];

afterEach(() => {
  while (grids.length) grids.pop()!.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('VdHexGridCore listener lifecycle (regression)', () => {
  it('removes every canvas listener it attached on destroy()', () => {
    const element = document.createElement('div');
    const canvas = document.createElement('canvas');
    document.body.appendChild(element);

    const addSpy = vi.spyOn(canvas, 'addEventListener');
    const removeSpy = vi.spyOn(canvas, 'removeEventListener');

    const grid = new VdHexGridCore({ element, canvas, size: 30, width: 3, height: 3 });
    grids.push(grid);

    // Each canvas listener was attached with a concrete (removable) handler.
    const added = addSpy.mock.calls.filter(([type]) => CANVAS_EVENTS.includes(type as string));
    expect(added.length).toBe(CANVAS_EVENTS.length);

    grid.destroy();
    grids.pop(); // already destroyed — keep afterEach from double-destroying

    const removed = removeSpy.mock.calls.filter(([type]) => CANVAS_EVENTS.includes(type as string));

    // Every (type, handler) pair added must have been removed with the SAME
    // handler reference — anonymous listeners could never satisfy this.
    for (const [type, handler] of added) {
      expect(removed.some(([t, h]) => t === type && h === handler)).toBe(true);
    }
    expect(removed.length).toBe(added.length);
  });

  it('cancels scheduled rAF/timeout work and releases the frame canvas on destroy()', () => {
    const element = document.createElement('div');
    const canvas = document.createElement('canvas');
    document.body.appendChild(element);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grid = new VdHexGridCore({ element, canvas, size: 30, width: 3, height: 3 }) as any;
    grids.push(grid);

    // The constructor render captured a frame snapshot.
    expect(grid._frameCanvas).not.toBeNull();

    // Schedule a gesture frame and a sharp idle render.
    grid._scheduleGestureRender();
    grid._scheduleSharpRender();
    expect(grid._gestureCancel).not.toBeNull();
    expect(grid._sharpTimer).not.toBeNull();

    grid.destroy();
    grids.pop();

    expect(grid._gestureCancel).toBeNull();
    expect(grid._sharpTimer).toBeNull();
    expect(grid._frameCanvas).toBeNull();
    expect(grid._frameCtx).toBeNull();
  });
});
