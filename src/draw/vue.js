/**
 * Vue 3 bindings for the draw whiteboard — the primary export surface.
 *
 *   import { VdDraw } from '@vanduo-oss/vdl-cbun/draw';
 *   <VdDraw :data="doc" tool="rectangle" @change="onChange" @ready="onReady" />
 *
 * The editor core stays framework-agnostic in ./core.js. SSR-safe: the editor
 * is created on mount (client) into a plain container the server can
 * pre-render.
 */
import { defineComponent, h, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { VdDraw as VdDrawCore } from './core.js';

const FORWARDED_EVENTS = ['change', 'select', 'viewport', 'ready'];

export const VdDraw = defineComponent({
  name: 'VdDraw',
  props: {
    /** Drawing document — `{ shapes, viewport }`. */
    data: { type: Object, default: () => ({}) },
    /** Render as a non-editable viewer (no toolbar, no editing). */
    readonly: { type: Boolean, default: false },
    /** Active tool — updated live without recreating the editor. */
    tool: { type: String, default: 'draw' },
    /** Background grid size in px. */
    gridSize: { type: Number, default: undefined },
    /** Show the background grid — updated live (default true). */
    showGrid: { type: Boolean, default: true },
    /** Snap shapes to nearby edges/centres while moving/resizing. */
    snap: { type: Boolean, default: true },
    /** Fit the view to content once the editor reports a measurable size. */
    autoFit: { type: Boolean, default: false },
    /** Enable the built-in undo/redo history (default true). */
    history: { type: Boolean, default: true },
    /** Maximum number of history entries to retain. */
    historyLimit: { type: Number, default: undefined },
  },
  emits: ['change', 'select', 'viewport', 'ready'],
  setup(props, { emit, expose }) {
    const el = ref(null);
    let instance = null;

    const create = (savedDoc) => {
      instance = new VdDrawCore({
        element: el.value,
        data: savedDoc || props.data,
        readonly: props.readonly,
        tool: props.tool,
        gridSize: props.gridSize,
        showGrid: props.showGrid,
        snap: props.snap,
        autoFit: props.autoFit,
        history: props.history,
        historyLimit: props.historyLimit,
      });
      FORWARDED_EVENTS.forEach((name) => {
        instance.on(name, (payload) => emit(name, payload));
      });
    };

    onMounted(() => {
      if (typeof window === 'undefined' || !el.value) return;
      create();
    });

    // Data flows through load(); tool and dynamic options update live; structural options recreate.
    watch(
      () => props.data,
      (next) => {
        if (instance && typeof instance.load === 'function') instance.load(next);
      },
      { deep: true },
    );
    watch(
      () => props.tool,
      (next) => instance?.setTool(next),
    );
    watch(
      () => props.showGrid,
      (next) => instance?.setGridVisible(next),
    );
    watch(
      () => props.readonly,
      (next) => instance?.setReadonly(next),
    );
    watch(
      () => props.snap,
      (next) => instance?.setSnap(next),
    );
    watch(
      () => props.history,
      (next) => instance?.setHistoryEnabled(next),
    );
    watch(
      () => props.historyLimit,
      (next) => instance?.setHistoryLimit(next),
    );
    watch(
      () => [props.gridSize, props.autoFit],
      () => {
        if (!instance) return;
        const currentDoc = typeof instance.toJSON === 'function' ? instance.toJSON() : undefined;
        instance.destroy();
        create(currentDoc);
      },
    );

    onBeforeUnmount(() => {
      if (instance) {
        instance.destroy();
        instance = null;
      }
    });

    expose({
      getInstance: () => instance,
      setTool: (tool) => instance?.setTool(tool),
      setReadonly: (readonly) => instance?.setReadonly(readonly),
      setSnap: (snap) => instance?.setSnap(snap),
      setHistoryEnabled: (enabled) => instance?.setHistoryEnabled(enabled),
      setHistoryLimit: (limit) => instance?.setHistoryLimit(limit),
      undo: () => instance?.undo(),
      redo: () => instance?.redo(),
      canUndo: () => Boolean(instance?.canUndo()),
      canRedo: () => Boolean(instance?.canRedo()),
      toSVG: () => instance?.toSVG(),
      toPNG: (options) => instance?.toPNG(options),
      addShape: (partial) => instance?.addShape(partial),
      updateShape: (id, patch, options) => instance?.updateShape(id, patch, options),
      removeShape: (id) => instance?.removeShape(id),
      getShape: (id) => instance?.getShape(id),
      getShapes: () => instance?.getShapes(),
      clear: () => instance?.clear(),
      load: (data) => instance?.load(data),
      toJSON: () => instance?.toJSON(),
    });

    return () => h('div', { ref: el, class: 'vd-draw' });
  },
});
