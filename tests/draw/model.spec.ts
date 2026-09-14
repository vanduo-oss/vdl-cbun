// @vitest-environment jsdom

// Document-model tests for the draw core. Runs in jsdom because VdDraw builds
// its SVG shell into a real DOM element; the imperative API exercised here is
// what the pointer handlers delegate to.

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

describe('draw model — shape creation', () => {
  it('adds each shape type with a unique id and emits a create change', () => {
    const core = makeCore();
    const changes: string[] = [];
    core.on('change', (e: { reason: string }) => changes.push(e.reason));

    const rect = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 30 });
    const ell = core.addShape({ type: 'ellipse', x: 60, y: 0, w: 40, h: 40 });
    const stroke = core.addShape({
      type: 'freehand',
      points: [
        [0, 80],
        [30, 90],
        [60, 80],
      ],
    });

    const ids = core.toJSON().shapes.map((s: { id: string }) => s.id);
    expect(ids).toEqual([rect.id, ell.id, stroke.id]);
    expect(new Set(ids).size).toBe(3);
    expect(changes).toEqual(['shape:add', 'shape:add', 'shape:add']);
  });

  it('renders a data-shape-id element per shape', () => {
    const core = makeCore();
    core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    expect(core.svg.querySelectorAll('[data-shape-id]')).toHaveLength(1);
  });
});

describe('draw model — current style + brushes', () => {
  it('a new mark adopts the current-style color and adds it to recents', () => {
    const core = makeCore();
    core.setColor('#e64980');
    const rect = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    expect(rect.color).toBe('#e64980');
    expect(core.recentColors).toContain('#e64980');
  });

  it('a freehand stroke adopts the active brush + color and renders a filled path', () => {
    const core = makeCore();
    core.setColor('#1971c2');
    core.setBrush('marker');
    const stroke = core.addShape({
      type: 'freehand',
      points: [
        [0, 0],
        [10, 10],
        [20, 0],
      ],
    });
    expect(stroke.brush).toBe('marker');
    expect(stroke.color).toBe('#1971c2');
    const el = core.svg.querySelector('[data-shape-id]') as SVGElement;
    expect(el.tagName.toLowerCase()).toBe('path');
    // Color is applied via inline style (wins over the CSS class), not the fill attribute.
    // jsdom normalizes the hex to rgb(); this asserts the exact picked color (#1971c2).
    expect(el.getAttribute('fill')).toBeNull();
    expect(el.style.fill).toBe('rgb(25, 113, 194)');
  });

  it('setColor / setBrush configure the next mark without recording history', () => {
    const core = makeCore();
    core.setColor('#f03e3e');
    core.setBrush('pencil');
    core.setBrushSize(18);
    expect(core.canUndo()).toBe(false);
    expect(core.style).toMatchObject({ color: '#f03e3e', brush: 'pencil', size: 18 });
  });
});

describe('draw model — selection, move, resize, delete', () => {
  it('selects, then nudges the selection by a world delta', () => {
    const core = makeCore();
    const rect = core.addShape({ type: 'rectangle', x: 10, y: 10, w: 20, h: 20 });
    core.select(rect.id);
    core.nudge(5, -4);
    expect(core.getShape(rect.id)).toMatchObject({ x: 15, y: 6 });
  });

  it('marquee-selects intersecting shapes via selectInBounds', () => {
    const core = makeCore();
    const a = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 20, h: 20 });
    const b = core.addShape({ type: 'rectangle', x: 30, y: 30, w: 20, h: 20 });
    const far = core.addShape({ type: 'rectangle', x: 500, y: 500, w: 20, h: 20 });
    core.selectInBounds({ x: -5, y: -5, w: 60, h: 60 });
    const ids = new Set(core.getSelectedShapes().map((s: { id: string }) => s.id));
    expect(ids.has(a.id)).toBe(true);
    expect(ids.has(b.id)).toBe(true);
    expect(ids.has(far.id)).toBe(false);
  });

  it('resizes the selection to a target bounds', () => {
    const core = makeCore();
    const rect = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 100, h: 80 });
    core.select(rect.id);
    core.setSelectionBounds({ x: 0, y: 0, w: 200, h: 160 });
    expect(core.getShape(rect.id)).toMatchObject({ w: 200, h: 160 });
  });

  it('deletes the current selection', () => {
    const core = makeCore();
    const rect = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    core.select(rect.id);
    expect(core.deleteSelection()).toBe(true);
    expect(core.toJSON().shapes).toHaveLength(0);
  });

  it('setStyle applies color / width to the selection and persists it', () => {
    const core = makeCore();
    const rect = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    core.select(rect.id);
    core.setStyle({ color: '#d6336c', fill: '#fff', strokeWidth: 5 });
    expect(core.getShape(rect.id)).toMatchObject({
      color: '#d6336c',
      fill: '#fff',
      strokeWidth: 5,
    });
  });
});

describe('draw model — eraser', () => {
  it('the eraser removes shapes crossed by the pointer in a single undo', () => {
    const core = makeCore();
    const a = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 20, h: 20 });
    const b = core.addShape({ type: 'rectangle', x: 200, y: 200, w: 20, h: 20 });
    core.setTool('eraser');
    const canvas = core.canvasEl as HTMLElement;
    canvas.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 10, clientY: 10, button: 0, bubbles: true }),
    );
    canvas.dispatchEvent(
      new MouseEvent('pointerup', { clientX: 10, clientY: 10, button: 0, bubbles: true }),
    );
    expect(core.toJSON().shapes.map((s: { id: string }) => s.id)).toEqual([b.id]);
    core.undo();
    expect(core.toJSON().shapes.map((s: { id: string }) => s.id)).toEqual([a.id, b.id]);
  });
});

describe('draw model — z-order, grouping, clipboard', () => {
  const domOrder = (core: AnyCore): string[] =>
    [...core.shapesLayer.children].map((el: Element) => el.getAttribute('data-shape-id')!);

  it('bringToFront repaints the shape last in document order and DOM order', () => {
    const core = makeCore();
    const a = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    const b = core.addShape({ type: 'rectangle', x: 5, y: 5, w: 10, h: 10 });
    core.select(a.id);
    core.bringToFront();
    const ids = core.toJSON().shapes.map((s: { id: string }) => s.id);
    expect(ids[ids.length - 1]).toBe(a.id);
    expect(domOrder(core)).toEqual([b.id, a.id]);
  });

  it('keeps DOM paint order in sync with model order for every reorder op', () => {
    const core = makeCore();
    const a = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    const b = core.addShape({ type: 'rectangle', x: 5, y: 5, w: 10, h: 10 });
    const c = core.addShape({ type: 'rectangle', x: 10, y: 10, w: 10, h: 10 });
    const modelOrder = (): string[] => core.toJSON().shapes.map((s: { id: string }) => s.id);

    core.select(c.id);
    core.sendToBack();
    expect(modelOrder()).toEqual([c.id, a.id, b.id]);
    expect(domOrder(core)).toEqual([c.id, a.id, b.id]);

    core.select(c.id);
    core.bringForward();
    expect(modelOrder()).toEqual([a.id, c.id, b.id]);
    expect(domOrder(core)).toEqual([a.id, c.id, b.id]);

    core.select(c.id);
    core.sendBackward();
    expect(modelOrder()).toEqual([c.id, a.id, b.id]);
    expect(domOrder(core)).toEqual([c.id, a.id, b.id]);
  });

  it('restores model and DOM order together after undo/redo', () => {
    const core = makeCore();
    const a = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    const b = core.addShape({ type: 'rectangle', x: 5, y: 5, w: 10, h: 10 });
    const modelOrder = (): string[] => core.toJSON().shapes.map((s: { id: string }) => s.id);

    core.select(a.id);
    core.bringToFront();
    expect(modelOrder()).toEqual([b.id, a.id]);
    expect(domOrder(core)).toEqual([b.id, a.id]);

    core.undo();
    expect(modelOrder()).toEqual([a.id, b.id]);
    expect(domOrder(core)).toEqual([a.id, b.id]);

    core.redo();
    expect(modelOrder()).toEqual([b.id, a.id]);
    expect(domOrder(core)).toEqual([b.id, a.id]);
  });

  it('re-establishes DOM paint order when load reuses ids in a new order', () => {
    const core = makeCore();
    const a = core.addShape({ id: 'a', type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    const b = core.addShape({ id: 'b', type: 'rectangle', x: 5, y: 5, w: 10, h: 10 });
    const c = core.addShape({ id: 'c', type: 'rectangle', x: 10, y: 10, w: 10, h: 10 });

    core.load({ shapes: [c, a, b] });

    expect(core.toJSON().shapes.map((shape: { id: string }) => shape.id)).toEqual([
      c.id,
      a.id,
      b.id,
    ]);
    expect(domOrder(core)).toEqual([c.id, a.id, b.id]);
  });

  it('groups a multi-selection and selects the whole group from one member', () => {
    const core = makeCore();
    const a = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    const b = core.addShape({ type: 'rectangle', x: 20, y: 0, w: 10, h: 10 });
    core.select([a.id, b.id]);
    core.group();
    expect(core.getShape(a.id).groupId).toBe(core.getShape(b.id).groupId);
    core.select(a.id);
    expect(core.getSelectedShapes()).toHaveLength(2);
    core.ungroup();
    expect(core.getShape(a.id).groupId).toBeUndefined();
  });

  it('duplicate offsets the copy, gives it a fresh id, and selects it', () => {
    const core = makeCore();
    const rect = core.addShape({ type: 'rectangle', x: 10, y: 10, w: 20, h: 20 });
    core.select(rect.id);
    core.duplicate();
    const shapes = core.toJSON().shapes;
    expect(shapes).toHaveLength(2);
    const copy = shapes.find((s: { id: string }) => s.id !== rect.id);
    expect(copy.x).toBeGreaterThan(rect.x);
    expect(core.getSelectedShapes().map((s: { id: string }) => s.id)).toEqual([copy.id]);
  });
});

describe('draw model — grid + clear', () => {
  it('setGridSize and toggleGrid update grid state', () => {
    const core = makeCore();
    core.setGridSize(40);
    expect(core.gridSize).toBe(40);
    expect(core.showGrid).toBe(true);
    core.toggleGrid();
    expect(core.showGrid).toBe(false);
  });

  it('the trash action clears the canvas when nothing is selected', () => {
    const core = makeCore();
    core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    core.deselect();
    const btn = core.toolbarEl.querySelector('[data-action="delete"]') as HTMLElement | null;
    expect(btn).not.toBeNull();
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(core.toJSON().shapes).toHaveLength(0);
  });
});

describe('draw model — export + lifecycle', () => {
  it('toSVG returns a self-contained string without selection UI', () => {
    const core = makeCore();
    const rect = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 30 });
    core.select(rect.id);
    const svg = core.toSVG();
    expect(svg).toContain('<svg');
    expect(svg).toContain('rect');
    expect(svg).not.toContain('data-shape-id');
    expect(svg).not.toContain('vd-draw-selection');
  });

  it('toPNG returns a promise', () => {
    const core = makeCore();
    core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    const png = core.toPNG();
    png.catch(() => {});
    expect(png).toBeInstanceOf(Promise);
  });

  it('destroy empties the host, removes window listeners, and is idempotent', () => {
    const removed: string[] = [];
    const original = window.removeEventListener.bind(window);
    window.removeEventListener = ((type: string, ...rest: unknown[]) => {
      removed.push(type);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (original as any)(type, ...rest);
    }) as typeof window.removeEventListener;

    const core = makeCore();
    const host = core.element as HTMLElement;
    expect(host.children.length).toBeGreaterThan(0);
    core.destroy();
    expect(core.destroyed).toBe(true);
    expect(host.children.length).toBe(0);
    expect(removed).toContain('pointerup');
    expect(removed).toContain('resize');
    expect(() => core.destroy()).not.toThrow();

    window.removeEventListener = original;
  });
});

describe('draw model — incremental rendering', () => {
  it('adding a shape creates exactly one new DOM element without rebuilding others', () => {
    const core = makeCore();
    core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    const firstEl = core.svg.querySelector('[data-shape-id]') as SVGElement;
    expect(firstEl).not.toBeNull();

    // Add a second shape — the first element should survive (same reference).
    core.addShape({ type: 'ellipse', x: 30, y: 0, w: 10, h: 10 });
    const allEls = core.svg.querySelectorAll('[data-shape-id]');
    expect(allEls).toHaveLength(2);
    // The first element should still be the same node (not rebuilt).
    expect(allEls[0]).toBe(firstEl);
  });

  it('removing a shape removes only that element from the DOM', () => {
    const core = makeCore();
    const a = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    const b = core.addShape({ type: 'rectangle', x: 20, y: 0, w: 10, h: 10 });
    const bEl = core.svg.querySelectorAll('[data-shape-id]')[1] as SVGElement;

    core.removeShape(a.id);
    const remaining = core.svg.querySelectorAll('[data-shape-id]');
    expect(remaining).toHaveLength(1);
    // b's element should survive.
    expect(remaining[0]).toBe(bEl);
    expect(remaining[0].getAttribute('data-shape-id')).toBe(b.id);
  });

  it('updateShape rebuilds only the targeted element', () => {
    const core = makeCore();
    const a = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    core.addShape({ type: 'ellipse', x: 30, y: 0, w: 10, h: 10 });
    const secondEl = core.svg.querySelectorAll('[data-shape-id]')[1] as SVGElement;

    core.updateShape(a.id, { w: 50 });
    // The second element should be untouched (same DOM node).
    expect(core.svg.querySelectorAll('[data-shape-id]')[1]).toBe(secondEl);
  });
});

describe('draw model — UX & interaction polish', () => {
  it('reflects active tool on canvas data-tool attribute', () => {
    const core = makeCore({ tool: 'select' });
    expect(core.canvasEl.getAttribute('data-tool')).toBe('select');
    core.setTool('eraser');
    expect(core.canvasEl.getAttribute('data-tool')).toBe('eraser');
    core.setTool('hand');
    expect(core.canvasEl.getAttribute('data-tool')).toBe('hand');
  });

  it('toggles vd-draw-panning class during hand drag interaction', () => {
    const core = makeCore({ tool: 'hand' });
    expect(core.canvasEl.classList.contains('vd-draw-panning')).toBe(false);

    core.canvasEl.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
        button: 0,
      } as MouseEventInit),
    );
    expect(core.canvasEl.classList.contains('vd-draw-panning')).toBe(true);

    window.dispatchEvent(
      new MouseEvent('pointerup', {
        bubbles: true,
        clientX: 80,
        clientY: 80,
        button: 0,
      } as MouseEventInit),
    );
    expect(core.canvasEl.classList.contains('vd-draw-panning')).toBe(false);
  });

  it('renders compass directional resize handles with data-handle keys', () => {
    const core = makeCore();
    const shape = core.addShape({ type: 'rectangle', x: 10, y: 10, w: 100, h: 80 });
    core.select(shape.id);

    const handles = core.overlayLayer.querySelectorAll('.vd-draw-handle');
    expect(handles).toHaveLength(8);
    const keys = Array.from(handles).map((h) => h.getAttribute('data-handle'));
    expect(keys).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
  });

  it('generates per-shape arrow marker colors matching line strokes', () => {
    const core = makeCore();
    const lineRed = core.addShape({
      type: 'line',
      points: [
        [0, 0],
        [50, 50],
      ],
      color: '#ff0000',
      arrowEnd: true,
    });
    const lineBlue = core.addShape({
      type: 'line',
      points: [
        [10, 10],
        [60, 60],
      ],
      color: '#0000ff',
      arrowEnd: true,
    });

    const elRed = core.svg.querySelector(`[data-shape-id="${lineRed.id}"]`);
    const elBlue = core.svg.querySelector(`[data-shape-id="${lineBlue.id}"]`);
    const markerRed = elRed?.getAttribute('marker-end');
    const markerBlue = elBlue?.getAttribute('marker-end');

    expect(markerRed).toBeTruthy();
    expect(markerBlue).toBeTruthy();
    expect(markerRed).not.toBe(markerBlue);

    // Verify marker elements in defs
    const defs = core.svg.querySelector('defs');
    expect(defs?.innerHTML).toContain('fill="#ff0000"');
    expect(defs?.innerHTML).toContain('fill="#0000ff"');
  });

  it('includes defs and arrow markers in toSVG export', () => {
    const core = makeCore();
    core.addShape({
      type: 'line',
      points: [
        [0, 0],
        [40, 40],
      ],
      color: '#e03131',
      arrowEnd: true,
    });
    const svg = core.toSVG();
    expect(svg).toContain('<defs>');
    expect(svg).toContain('<marker');
    expect(svg).toContain('fill="#e03131"');
    expect(svg).toContain('marker-end="url(#');
  });

  it('renders multi-line text and sticky notes as tspans', () => {
    const core = makeCore();
    const sticky = core.addShape({
      type: 'sticky',
      x: 10,
      y: 10,
      w: 120,
      h: 100,
      text: 'First line\nSecond line\nThird line',
    });

    const group = core.svg.querySelector(`[data-shape-id="${sticky.id}"]`);
    const textEl = group?.querySelector('text');
    expect(textEl).not.toBeNull();
    const tspans = textEl!.querySelectorAll('tspan');
    expect(tspans).toHaveLength(3);
    expect(tspans[0].textContent).toBe('First line');
    expect(tspans[1].textContent).toBe('Second line');
    expect(tspans[2].textContent).toBe('Third line');

    const y0 = Number(tspans[0].getAttribute('y'));
    const y1 = Number(tspans[1].getAttribute('y'));
    expect(y1 - y0).toBe(20);
  });

  it('activates text editor on double-click in select mode', () => {
    const core = makeCore({ tool: 'select' });
    const sticky = core.addShape({
      type: 'sticky',
      x: 10,
      y: 10,
      w: 120,
      h: 100,
      text: 'Editable note',
    });

    const shapeEl = core.svg.querySelector(`[data-shape-id="${sticky.id}"]`);
    expect(shapeEl).not.toBeNull();

    // Dispatch a double click (detail: 2) on the shape
    shapeEl!.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 20,
        clientY: 20,
        detail: 2,
      } as MouseEventInit),
    );

    expect(core.textEditor).not.toBeNull();
    expect(core.textEditor?.id).toBe(sticky.id);
    expect(core.textEditor?.el.value).toBe('Editable note');

    core.stopTextEdit();
    expect(core.textEditor).toBeNull();
  });
});

describe('draw model — indexing, runtime options, and multi-touch', () => {
  it('maintains O(1) shape index through addition, mutation, and deletion', () => {
    const core = makeCore({
      data: {
        shapes: [{ id: 'init-1', type: 'rectangle', x: 0, y: 0, w: 10, h: 10 }],
      },
    });

    // Initial shape in index
    expect(core.getShape('init-1')).not.toBeNull();
    expect(core.getShape('init-1')?.id).toBe('init-1');

    // addShape indexes the new shape
    core.addShape({ id: 's2', type: 'ellipse', x: 20, y: 20, w: 15, h: 15 });
    expect(core.getShape('s2')).not.toBeNull();
    expect(core.getShape('s2')?.type).toBe('ellipse');

    // updateShape updates the indexed shape
    core.updateShape('s2', { color: '#ef4444' });
    expect(core.getShape('s2')?.color).toBe('#ef4444');

    // removeShape removes from index
    core.removeShape('s2');
    expect(core.getShape('s2')).toBeNull();

    // deleteSelection removes from index
    core.select('init-1');
    core.deleteSelection();
    expect(core.getShape('init-1')).toBeNull();

    // clear empties the index
    core.addShape({ id: 's3', type: 'rectangle' });
    expect(core.getShape('s3')).not.toBeNull();
    core.clear();
    expect(core.getShape('s3')).toBeNull();
  });

  it('setReadonly surgically toggles toolbar, style panel, and data attribute', () => {
    const core = makeCore({ readonly: false });
    expect(core.readonly).toBe(false);
    expect(core.toolbarEl.style.display).toBe('');

    core.setReadonly(true);
    expect(core.readonly).toBe(true);
    expect(core.element.getAttribute('data-readonly')).toBe('true');
    expect(core.toolbarEl.style.display).toBe('none');
    expect(core.panelEl.style.display).toBe('none');

    core.setReadonly(false);
    expect(core.readonly).toBe(false);
    expect(core.element.hasAttribute('data-readonly')).toBe(false);
    expect(core.toolbarEl.style.display).toBe('');
    expect(core.panelEl.style.display).toBe('');
  });

  it('builds and syncs controls when leaving an initially readonly state', () => {
    const core = makeCore({ readonly: true, tool: 'eraser', brush: 'marker', color: '#ef4444' });
    expect(core.toolbarEl.children).toHaveLength(0);
    expect(core.panelEl.children).toHaveLength(0);

    core.setReadonly(false);

    expect(core.toolbarEl.querySelector('[data-tool="eraser"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(core.panelEl.querySelector('[data-brush="marker"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect((core.panelEl.querySelector('[data-style="color"]') as HTMLInputElement).value).toBe(
      '#ef4444',
    );
  });

  it('setSnap, setHistoryEnabled, and setHistoryLimit update runtime options', () => {
    const core = makeCore({ snap: true, history: true, historyLimit: 50 });

    core.setSnap(false);
    expect(core.snap).toBe(false);

    core.setHistoryLimit(5);
    expect(core.historyLimit).toBe(5);

    // Build up real undo state, then prove disabling history clears it.
    core.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    expect(core.canUndo()).toBe(true);

    core.setHistoryEnabled(false);
    expect(core.historyEnabled).toBe(false);
    expect(core.canUndo()).toBe(false);
  });

  it('handles multi-touch pinch-to-zoom and emits viewport:pinch', () => {
    const core = makeCore();
    const viewportEvents: Array<{ reason: string; viewport: { scale: number } }> = [];
    core.on('viewport', (payload: { reason: string; viewport: { scale: number } }) => {
      viewportEvents.push(payload);
    });

    const initialScale = core.toJSON().viewport.scale;

    // Pointer 1 down at (100, 100)
    core.canvasEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        button: 0,
      }),
    );

    // Pointer 2 down at (200, 100) -> initial distance = 100
    core.canvasEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
        clientX: 200,
        clientY: 100,
        button: 0,
      }),
    );

    expect(core.interaction?.kind).toBe('pinch');

    // Pointer 2 moves to (300, 100) -> new distance = 200 (2x pinch zoom)
    core.canvasEl.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 2,
        clientX: 300,
        clientY: 100,
      }),
    );

    const scaledVp = core.toJSON().viewport;
    expect(scaledVp.scale).toBeCloseTo(initialScale * 2, 1);

    // Pointer 2 lifts
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 2,
      }),
    );

    expect(core.interaction).toBeNull();
    const pinchEvent = viewportEvents.find((e) => e.reason === 'viewport:pinch');
    expect(pinchEvent).toBeDefined();
  });

  it('cancels active single-finger stroke when second touch arrives', () => {
    const core = makeCore({ tool: 'draw' });

    // Touch 1 starts drawing
    core.canvasEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        clientX: 50,
        clientY: 50,
        button: 0,
      }),
    );

    expect(core.interaction?.kind).toBe('freehand');
    const shapeId = core.interaction?.shapeId;
    expect(core.getShape(shapeId)).not.toBeNull();

    // Touch 2 touches down -> pinch mode cancels the in-progress stroke
    core.canvasEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
        clientX: 150,
        clientY: 50,
        button: 0,
      }),
    );

    expect(core.interaction?.kind).toBe('pinch');
    // The temporary stroke should be cleaned up
    expect(core.getShape(shapeId)).toBeNull();
  });

  it('a second touch during erase restores hidden shapes without deleting them', () => {
    const core = makeCore({ tool: 'eraser' });
    const rect = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 20, h: 20 });

    core.canvasEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        clientX: 10,
        clientY: 10,
        button: 0,
      }),
    );
    core.render();
    expect(core.interaction.erased.has(rect.id)).toBe(true);
    expect(core.shapesLayer.querySelector(`[data-shape-id="${rect.id}"]`)).toBeNull();

    core.canvasEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
        clientX: 150,
        clientY: 10,
        button: 0,
      }),
    );
    expect(core.interaction?.kind).toBe('pinch');
    core.render();

    expect(core.getShape(rect.id)).not.toBeNull();
    expect(core.shapesLayer.querySelector(`[data-shape-id="${rect.id}"]`)).not.toBeNull();
  });

  it('a second touch during pan clears the panning state', () => {
    const core = makeCore({ tool: 'hand' });

    core.canvasEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        clientX: 50,
        clientY: 50,
        button: 0,
      }),
    );
    expect(core.interaction?.kind).toBe('pan');
    expect(core.canvasEl.classList.contains('vd-draw-panning')).toBe(true);

    core.canvasEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
        clientX: 150,
        clientY: 50,
        button: 0,
      }),
    );
    expect(core.interaction?.kind).toBe('pinch');
    expect(core.canvasEl.classList.contains('vd-draw-panning')).toBe(false);

    core.canvasEl.classList.add('vd-draw-panning');
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2 }));
    expect(core.canvasEl.classList.contains('vd-draw-panning')).toBe(false);
  });

  it('a second touch during move restores geometry in both model and DOM', () => {
    const core = makeCore({ tool: 'select' });
    const rect = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 20, h: 20 });
    const target = core.shapesLayer.querySelector(`[data-shape-id="${rect.id}"]`)!;

    target.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        clientX: 10,
        clientY: 10,
        button: 0,
      }),
    );
    expect(core.interaction?.kind).toBe('move');

    core.canvasEl.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        clientX: 60,
        clientY: 10,
      }),
    );
    expect(core.getShape(rect.id).x).toBeGreaterThan(0);

    core.canvasEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
        clientX: 200,
        clientY: 10,
        button: 0,
      }),
    );
    expect(core.interaction?.kind).toBe('pinch');
    core.render();

    const restored = core.getShape(rect.id);
    const el = core.shapesLayer.querySelector(`[data-shape-id="${rect.id}"]`)!;
    expect(restored.x).toBe(0);
    expect(Number(el.getAttribute('x'))).toBe(restored.x);
  });

  it('a second touch during resize restores geometry in both model and DOM', () => {
    const core = makeCore({ tool: 'select' });
    const rect = core.addShape({ type: 'rectangle', x: 0, y: 0, w: 20, h: 20 });
    core.select(rect.id);
    const handle = core.canvasEl.querySelector('[data-handle="se"]')!;

    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        clientX: 20,
        clientY: 20,
        button: 0,
      }),
    );
    expect(core.interaction?.kind).toBe('resize');

    core.canvasEl.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        clientX: 60,
        clientY: 60,
      }),
    );
    expect(core.getShape(rect.id).w).toBeGreaterThan(20);

    core.canvasEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
        clientX: 200,
        clientY: 20,
        button: 0,
      }),
    );
    expect(core.interaction?.kind).toBe('pinch');
    core.render();

    const restored = core.getShape(rect.id);
    const el = core.shapesLayer.querySelector(`[data-shape-id="${rect.id}"]`)!;
    expect(restored.w).toBe(20);
    expect(restored.h).toBe(20);
    expect(Number(el.getAttribute('width'))).toBe(restored.w);
    expect(Number(el.getAttribute('height'))).toBe(restored.h);
  });
});
