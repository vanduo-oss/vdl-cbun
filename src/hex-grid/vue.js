/**
 * Vue 3 bindings for the hex-grid component of @vanduo-oss/vdl-cbun.
 *
 *   import { VdHexGrid } from '@vanduo-oss/vdl-cbun/hex-grid';
 *   <VdHexGrid :size="30" :width="15" :height="10" @select="onSelect" />
 *
 * The canvas core stays framework-agnostic. SSR-safe: the canvas grid
 * is created on mount (client) into a plain container the server can pre-render.
 */
import { defineComponent, h, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { VdHexGrid as VdHexGridCore } from './core.js';

const FORWARDED_EVENTS = ['select', 'zoom', 'pan'];

export const VdHexGrid = defineComponent({
  name: 'VdHexGrid',
  props: {
    /** Hexagon size (px). */
    size: { type: Number, default: 30 },
    /** Grid columns (number of hexes). */
    width: { type: Number, default: 10 },
    /** Grid rows (number of hexes). */
    height: { type: Number, default: 10 },
    /** Grid rotation (radians). */
    rotation: { type: Number, default: 0 },
    /** Canvas backing-store multiplier: a number or `'auto'` (default). */
    pixelRatio: { type: [Number, String], default: 'auto' },
    /** Viewport culling (default true). */
    cull: { type: Boolean, default: true },
  },
  emits: ['select', 'zoom', 'pan', 'ready'],
  setup(props, { emit, expose }) {
    const el = ref(null);
    let instance = null;

    const create = () => {
      instance = new VdHexGridCore({
        element: el.value,
        size: props.size,
        width: props.width,
        height: props.height,
        rotation: props.rotation,
        pixelRatio: props.pixelRatio,
        cull: props.cull,
      });
      FORWARDED_EVENTS.forEach((name) => {
        instance.on(name, (data) => emit(name, data));
      });
      emit('ready', instance);
    };

    onMounted(() => {
      if (typeof window === 'undefined' || !el.value) return;
      create();
    });

    // Drive prop changes through the instance setters (no recreate needed).
    watch(
      () => props.size,
      (v) => instance && instance.setSize(v),
    );
    watch(
      () => [props.width, props.height],
      ([w, hgt]) => instance && instance.setDimensions(w, hgt),
    );
    watch(
      () => props.rotation,
      (v) => instance && instance.setRotation(v),
    );
    watch(
      () => props.pixelRatio,
      (v) => instance && instance.setPixelRatio(v),
    );
    watch(
      () => props.cull,
      (v) => instance && instance.setCull(v),
    );

    onBeforeUnmount(() => {
      if (instance) {
        instance.destroy();
        instance = null;
      }
    });

    expose({ getInstance: () => instance });

    return () =>
      h('div', { ref: el, class: 'vd-hex-grid', style: { width: '100%', height: '100%' } }, [
        h('canvas', { style: { width: '100%', height: '100%', display: 'block', cursor: 'grab' } }),
      ]);
  },
});
