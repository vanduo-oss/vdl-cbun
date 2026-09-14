// @vitest-environment jsdom

// Vue wrapper mount spec for <VdDraw>. Asserts the wrapper builds the core into
// its own container on mount, threads props through as core options, forwards
// core events as Vue emits, drives `data`/`tool` in place without recreating,
// recreates on option-prop changes, and destroys the core on unmount.

import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VdDraw } from '../../src/draw/index.js';
import { VdDraw as VdDrawCore } from '../../src/draw/core.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCore = VdDrawCore & Record<string, any>;

const wrappers: VueWrapper[] = [];

function mountDraw(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapper = mount(VdDraw as any, { props });
  wrappers.push(wrapper);
  return wrapper;
}

function coreOf(wrapper: VueWrapper): AnyCore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (wrapper.vm as any).getInstance() as AnyCore;
}

afterEach(() => {
  while (wrappers.length) wrappers.pop()!.unmount();
});

describe('VdDraw wrapper — mount', () => {
  it('renders its own container and builds the editor shell inside it', () => {
    const wrapper = mountDraw();
    expect(wrapper.find('div.vd-draw').exists()).toBe(true);
    expect(wrapper.find('.vd-draw-shell').exists()).toBe(true);
    expect(wrapper.find('.vd-draw-panel').exists()).toBe(true);
    expect(coreOf(wrapper)).toBeInstanceOf(VdDrawCore);
  });

  it('threads props through as core options', () => {
    const core = coreOf(
      mountDraw({
        data: { shapes: [{ id: 's1', type: 'rectangle', x: 0, y: 0, w: 10, h: 10 }] },
        readonly: true,
        tool: 'rectangle',
        gridSize: 32,
        showGrid: false,
        snap: false,
        history: false,
        historyLimit: 50,
      }),
    );
    expect(core.readonly).toBe(true);
    expect(core.tool).toBe('rectangle');
    expect(core.gridSize).toBe(32);
    expect(core.showGrid).toBe(false);
    expect(core.snap).toBe(false);
    expect(core.historyEnabled).toBe(false);
    expect(core.historyLimit).toBe(50);
    expect(core.documentData.shapes).toHaveLength(1);
  });

  it('uses component defaults (brush tool) when props are omitted', () => {
    const core = coreOf(mountDraw());
    expect(core.readonly).toBe(false);
    expect(core.tool).toBe('draw');
    expect(core.gridSize).toBe(20);
    expect(core.snap).toBe(true);
    expect(core.historyEnabled).toBe(true);
    expect(core.historyLimit).toBe(100);
    expect(core.documentData.shapes).toHaveLength(0);
  });
});

describe('VdDraw wrapper — data + tool update in place', () => {
  it('reloads via load() when `data` changes (no recreate)', async () => {
    const wrapper = mountDraw({
      data: { shapes: [{ id: 'a', type: 'rectangle', x: 0, y: 0, w: 10, h: 10 }] },
    });
    const core = coreOf(wrapper);
    await wrapper.setProps({
      data: {
        shapes: [
          { id: 'a', type: 'rectangle', x: 0, y: 0, w: 10, h: 10 },
          { id: 'b', type: 'ellipse', x: 30, y: 0, w: 10, h: 10 },
        ],
      },
    });
    expect(coreOf(wrapper)).toBe(core);
    expect(core.destroyed).toBe(false);
    expect(core.documentData.shapes).toHaveLength(2);
  });

  it('updates the tool live without recreating the core', async () => {
    const wrapper = mountDraw({ tool: 'draw' });
    const core = coreOf(wrapper);
    await wrapper.setProps({ tool: 'eraser' });
    expect(coreOf(wrapper)).toBe(core);
    expect(core.tool).toBe('eraser');
  });
});

describe('VdDraw wrapper — dynamic option props update in place', () => {
  it('updates readonly in place without destroying core', async () => {
    const wrapper = mountDraw({ readonly: false });
    const core = coreOf(wrapper);
    core.addShape({ id: 'persisted', type: 'rectangle', x: 5, y: 5, w: 20, h: 20 });

    await wrapper.setProps({ readonly: true });
    expect(coreOf(wrapper)).toBe(core);
    expect(core.destroyed).toBe(false);
    expect(core.readonly).toBe(true);
    expect(core.getShape('persisted')).not.toBeNull();
  });

  it('updates snap in place without destroying core', async () => {
    const wrapper = mountDraw({ snap: true });
    const core = coreOf(wrapper);
    await wrapper.setProps({ snap: false });
    expect(coreOf(wrapper)).toBe(core);
    expect(core.destroyed).toBe(false);
    expect(core.snap).toBe(false);
  });

  it('updates history and historyLimit in place without destroying core', async () => {
    const wrapper = mountDraw({ history: true, historyLimit: 50 });
    const core = coreOf(wrapper);
    await wrapper.setProps({ historyLimit: 10 });
    expect(coreOf(wrapper)).toBe(core);
    expect(core.destroyed).toBe(false);
    expect(core.historyLimit).toBe(10);
  });

  it('exposes setReadonly and setSnap on component ref', () => {
    const wrapper = mountDraw();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vm = wrapper.vm as any;
    expect(typeof vm.setReadonly).toBe('function');
    expect(typeof vm.setSnap).toBe('function');
    vm.setReadonly(true);
    expect(coreOf(wrapper).readonly).toBe(true);
  });
});

describe('VdDraw wrapper — structural option prop change recreates the core', () => {
  it('destroys and rebuilds the editor when `gridSize` changes but preserves active shapes', async () => {
    const wrapper = mountDraw({ gridSize: 20 });
    const first = coreOf(wrapper);
    first.addShape({ id: 'drawn-mark', type: 'rectangle', x: 15, y: 15, w: 50, h: 50 });

    await wrapper.setProps({ gridSize: 40 });
    const second = coreOf(wrapper);
    expect(second).not.toBe(first);
    expect(first.destroyed).toBe(true);
    expect(second.gridSize).toBe(40);
    // User shapes must be preserved across structural rebuilds
    expect(second.getShape('drawn-mark')).not.toBeNull();
  });
});

describe('VdDraw wrapper — event forwarding + unmount', () => {
  it('forwards the core `change` event with its reason', async () => {
    const wrapper = mountDraw();
    coreOf(wrapper).addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 });
    await wrapper.vm.$nextTick();
    const changes = wrapper.emitted('change');
    expect(changes).toBeTruthy();
    expect((changes![changes!.length - 1][0] as { reason: string }).reason).toBe('shape:add');
  });

  it('destroys the core and removes its window listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const wrapper = mountDraw();
    const core = coreOf(wrapper);
    wrapper.unmount();
    expect(core.destroyed).toBe(true);
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
    removeSpy.mockRestore();
  });
});
