// @vitest-environment jsdom

// Vue wrapper mount spec for <VdHexGrid> + direct coverage of the core setters
// the wrapper drives (setSize / setDimensions / setRotation). Runs in jsdom
// against the shared canvas 2d-context stub (tests/setup.ts): real painting is
// covered by the Playwright hex smoke — here we assert the wrapper wires props
// into the core, forwards the `select` event, and destroys on unmount, plus
// that draw calls were *issued* (recording fake), not pixels.

import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import { VdHexGrid } from '../../src/hex-grid/index.js';
import { VdHexGrid as VdHexGridCore } from '../../src/hex-grid/core.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGrid = VdHexGridCore & Record<string, any>;

const wrappers: VueWrapper[] = [];
function mountGrid(props: Record<string, unknown> = {}) {
  const wrapper = mount(VdHexGrid, { props });
  wrappers.push(wrapper);
  return wrapper;
}

/** The core instance the wrapper created, captured off the `ready` event. */
function coreOf(wrapper: VueWrapper): AnyGrid {
  const ready = wrapper.emitted('ready');
  if (!ready) throw new Error('expected a ready emit carrying the core instance');
  return ready[0][0] as AnyGrid;
}

afterEach(() => {
  while (wrappers.length) wrappers.pop()!.unmount();
});

describe('VdHexGrid wrapper — mount', () => {
  it('creates the canvas core into its own container on mount', () => {
    const wrapper = mountGrid({ size: 20, width: 5, height: 4 });
    expect(wrapper.find('div.vd-hex-grid').exists()).toBe(true);
    expect(wrapper.find('canvas').exists()).toBe(true);

    const core = coreOf(wrapper);
    expect(core).toBeInstanceOf(VdHexGridCore);
  });

  it('passes props through as core options', () => {
    const core = coreOf(mountGrid({ size: 20, width: 5, height: 4, rotation: 0.5 }));
    expect(core.size).toBe(20);
    expect(core.width).toBe(5);
    expect(core.height).toBe(4);
    expect(core.rotation).toBe(0.5);
    // width * height hexes generated
    expect(core.getHexCount()).toBe(20);
  });

  it('uses component defaults when props are omitted', () => {
    const core = coreOf(mountGrid());
    expect(core.size).toBe(30);
    expect(core.width).toBe(10);
    expect(core.height).toBe(10);
    expect(core.rotation).toBe(0);
  });

  it('issues draw calls to the (stubbed) 2d context on mount', () => {
    const core = coreOf(mountGrid({ width: 4, height: 4 }));
    const methods = core.ctx.__calls.map((c: { method: string }) => c.method);
    expect(core.ctx.__calls.length).toBeGreaterThan(0);
    expect(methods).toContain('fillRect'); // canvas cleared with bg
    expect(methods).toContain('stroke'); // hex outlines drawn
  });
});

describe('VdHexGrid wrapper — prop changes drive core setters', () => {
  it('re-sizes through setSize without recreating the instance', async () => {
    const wrapper = mountGrid({ size: 20, width: 4, height: 4 });
    const core = coreOf(wrapper);
    const before = core.ctx.__calls.length;

    await wrapper.setProps({ size: 44 });

    expect(core.size).toBe(44);
    // same instance (ready emitted exactly once)
    expect(wrapper.emitted('ready')).toHaveLength(1);
    // grid re-rendered → more draw calls recorded
    expect(core.ctx.__calls.length).toBeGreaterThan(before);
  });

  it('re-dimensions through setDimensions (hex count follows)', async () => {
    const wrapper = mountGrid({ width: 4, height: 4 });
    const core = coreOf(wrapper);
    expect(core.getHexCount()).toBe(16);

    await wrapper.setProps({ width: 6, height: 5 });

    expect(core.width).toBe(6);
    expect(core.height).toBe(5);
    expect(core.getHexCount()).toBe(30);
  });

  it('rotates through setRotation', async () => {
    const wrapper = mountGrid({ width: 4, height: 4 });
    const core = coreOf(wrapper);

    await wrapper.setProps({ rotation: Math.PI / 3 });

    expect(core.rotation).toBeCloseTo(Math.PI / 3, 10);
    expect(core.getRotation()).toBeCloseTo(Math.PI / 3, 10);
  });

  it('applies cull / pixelRatio through setters without regenerating the grid', async () => {
    const wrapper = mountGrid({ width: 4, height: 4, cull: true, pixelRatio: 1 });
    const core = coreOf(wrapper);
    const count = core.getHexCount();

    await wrapper.setProps({ cull: false, pixelRatio: 2 });

    expect(core.cull).toBe(false);
    expect(core.pixelRatio).toBe(2);
    expect(core.getHexCount()).toBe(count);
    // same instance (ready emitted exactly once)
    expect(wrapper.emitted('ready')).toHaveLength(1);
  });
});

describe('VdHexGrid wrapper — event forwarding', () => {
  it('forwards the core select event as a Vue `select` emit', async () => {
    const wrapper = mountGrid({ size: 30, width: 6, height: 6 });
    const canvas = wrapper.find('canvas').element as HTMLCanvasElement;

    // getBoundingClientRect is all-zero in jsdom → a click at (0,0) maps to the
    // origin hex (0,0), which exists in the generated grid → selects it.
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 0, clientY: 0, bubbles: true }));
    await wrapper.vm.$nextTick();

    const selects = wrapper.emitted('select');
    expect(selects).toBeTruthy();
    const hex = selects![0][0] as { q: number; r: number };
    // the origin cell is generated with q = -qOffset = -0; normalize the sign.
    expect(hex.q + 0).toBe(0);
    expect(hex.r + 0).toBe(0);
  });
});

describe('VdHexGrid wrapper — unmount', () => {
  it('destroys the core (disconnects theme listeners) on unmount', () => {
    const wrapper = mountGrid({ width: 4, height: 4 });
    const core = coreOf(wrapper);
    // theme observer + media listener are live while mounted
    expect(core._themeObserver).not.toBeNull();

    wrapper.unmount();

    expect(core._themeObserver).toBeNull();
    expect(core._themeMedia).toBeNull();
  });
});

describe('VdHexGridCore setters (driven directly)', () => {
  function makeCore(opts: Record<string, unknown> = {}): AnyGrid {
    const element = document.createElement('div');
    document.body.appendChild(element);
    return new VdHexGridCore({ element, size: 30, width: 4, height: 4, ...opts }) as AnyGrid;
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('setSize regenerates the grid and re-renders', () => {
    const core = makeCore();
    const before = core.ctx.__calls.length;
    core.setSize(12);
    expect(core.size).toBe(12);
    expect(core.getHexCount()).toBe(16); // dimensions unchanged
    expect(core.ctx.__calls.length).toBeGreaterThan(before);
    core.destroy();
  });

  it('setDimensions changes the hex population', () => {
    const core = makeCore();
    core.setDimensions(7, 3);
    expect(core.width).toBe(7);
    expect(core.height).toBe(3);
    expect(core.getHexCount()).toBe(21);
    core.destroy();
  });

  it('setRotation stores the angle and keeps the same hex count', () => {
    const core = makeCore();
    core.setRotation(Math.PI / 4);
    expect(core.getRotation()).toBeCloseTo(Math.PI / 4, 10);
    expect(core.getHexCount()).toBe(16);
    core.destroy();
  });

  it('resyncs the selected hex reference after regeneration', () => {
    const core = makeCore();
    core.selectedHex = core.getHex(0, 0);
    const firstRef = core.selectedHex;
    core.setSize(18);
    // selection survives, but now points at the freshly generated cell object
    expect(core.selectedHex).not.toBeNull();
    expect(core.selectedHex).not.toBe(firstRef);
    expect(core.selectedHex.q + 0).toBe(0); // origin cell q is -0; normalize
    expect(core.selectedHex.r + 0).toBe(0);
    core.destroy();
  });
});
