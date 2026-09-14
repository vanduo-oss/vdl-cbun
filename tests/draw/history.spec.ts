// @vitest-environment jsdom

// Undo/redo contract: every committed mutation funnels through the single
// emitChange → recordHistory choke point (whole-document snapshots). Viewport
// pan/zoom go through a separate path and are intentionally NOT recorded.

import { afterEach, describe, expect, it } from 'vitest';

import { VdDraw as VdDrawCore } from '../../src/draw/core.js';

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

describe('draw history — clearHistory()', () => {
  it('reseeds the stack, disables undo/redo, preserves the document, and emits reason:clear', () => {
    const core = makeCore();
    core.addShape({ type: 'rectangle', x: 5, y: 5, w: 10, h: 10 });
    core.addShape({ type: 'ellipse', x: 20, y: 20, w: 8, h: 8 });
    expect(core.canUndo()).toBe(true);

    const doc = core.toJSON();
    const events: Array<Record<string, unknown>> = [];
    core.on('history', (e: Record<string, unknown>) => events.push(e));

    core.clearHistory();

    expect(core.canUndo()).toBe(false);
    expect(core.canRedo()).toBe(false);
    expect(core.history).toHaveLength(1);
    // The current document is preserved; only the history is reset.
    expect(core.toJSON()).toEqual(doc);
    expect(events.at(-1)).toMatchObject({ reason: 'clear', canUndo: false, canRedo: false });
  });
});

describe('draw history — undo/redo', () => {
  it('undo restores the previous document and redo re-applies it', () => {
    const core = makeCore();
    const rect = core.addShape({ type: 'rectangle', x: 5, y: 5, w: 10, h: 10 });
    expect(core.canUndo()).toBe(true);
    core.undo();
    expect(core.toJSON().shapes).toHaveLength(0);
    core.redo();
    expect(core.toJSON().shapes).toHaveLength(1);
    expect(core.getShape(rect.id)?.x).toBe(5);
  });

  it('prunes the redo branch when history diverges', () => {
    const core = makeCore();
    core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    const b = core.addShape({ type: 'rectangle', x: 20, y: 0, w: 10, h: 10 });
    core.undo();
    expect(core.canRedo()).toBe(true);
    core.addShape({ type: 'ellipse', x: 40, y: 0, w: 10, h: 10 });
    expect(core.canRedo()).toBe(false);
    expect(core.getShape(b.id)).toBeNull();
  });

  it('coalesces consecutive same-target style edits into one undo step', () => {
    const core = makeCore();
    const rect = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    core.select(rect.id);
    const before = core.getShape(rect.id).color;
    core.setStyle({ color: '#111' });
    core.setStyle({ color: '#222' });
    core.setStyle({ color: '#333' });
    core.undo(); // one undo reverts the whole style burst
    expect(core.getShape(rect.id).color).toBe(before);
  });

  it('honours historyLimit by trimming the oldest entries', () => {
    const core = makeCore({ historyLimit: 3 });
    for (let i = 0; i < 10; i += 1) core.addShape({ type: 'rectangle', x: i, y: 0, w: 5, h: 5 });
    let undos = 0;
    while (core.canUndo()) {
      core.undo();
      undos += 1;
    }
    expect(undos).toBe(3);
  });

  it('records nothing when constructed with { history: false }', () => {
    const core = makeCore({ history: false });
    core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    expect(core.canUndo()).toBe(false);
  });
});

describe('draw history — coalesce is top-of-stack only (regression)', () => {
  it('a coalescing edit right after an undo does not corrupt the earlier snapshot', () => {
    const core = makeCore();
    const a = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    core.select(a.id);

    core.nudge(5, 0); // shape:nudge (a coalesce reason) → new history entry (A@x=5)
    expect(core.getShape(a.id).x).toBe(5);

    core.undo(); // back to the pre-nudge snapshot (A@x=0), NOT the top of the stack
    expect(core.getShape(a.id).x).toBe(0);

    // Nudging the same target again used to coalesce onto the just-restored
    // (non-top) snapshot — overwriting it in place and orphaning a stale redo
    // entry. It must instead prune the redo branch and push a fresh snapshot.
    core.nudge(3, 0);
    expect(core.getShape(a.id).x).toBe(3);
    expect(core.canRedo()).toBe(false); // stale redo branch pruned (was `true` with the bug)

    // The pre-nudge snapshot (A@x=0) survives as its own undo step …
    core.undo();
    expect(core.getShape(a.id)?.x).toBe(0);

    // … and one more undo reaches the empty base document (base state preserved).
    core.undo();
    expect(core.toJSON().shapes).toHaveLength(0);
  });
});

describe('draw history — camera is not undoable', () => {
  it('pan/zoom are excluded from history; undo reverts only content', () => {
    const core = makeCore();
    core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    core.setViewport({ x: 100, scale: 2 });
    core.zoomIn();
    const cameraX = core.toJSON().viewport.x;
    core.undo();
    expect(core.toJSON().shapes).toHaveLength(0);
    expect(core.toJSON().viewport.x).toBe(cameraX);
  });
});
