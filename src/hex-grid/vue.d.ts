import type { DefineComponent } from 'vue';
import type { VdHexGridEventMap, VdHexGrid as VdHexGridCore } from './core';

export interface VdHexGridProps {
  /** Hexagon size in px. Default 30. */
  size?: number;
  /** Grid columns (number of hexes). Default 10. */
  width?: number;
  /** Grid rows (number of hexes). Default 10. */
  height?: number;
  /** Grid rotation in radians. Default 0. */
  rotation?: number;
  /** Canvas backing-store multiplier: a number or `'auto'` (default). */
  pixelRatio?: number | 'auto';
  /** Viewport culling. Default true. */
  cull?: boolean;
}

/**
 * The events the wrapper re-emits. `select` / `zoom` / `pan` forward the core's
 * event payloads verbatim; `ready` fires once after the core is created, with
 * the canvas core instance.
 */
export interface VdHexGridEmits {
  (event: 'select', payload: VdHexGridEventMap['select']): void;
  (event: 'zoom', payload: VdHexGridEventMap['zoom']): void;
  (event: 'pan', payload: VdHexGridEventMap['pan']): void;
  (event: 'ready', instance: VdHexGridCore): void;
}

/* eslint-disable @typescript-eslint/no-empty-object-type -- DefineComponent filler params */
export declare const VdHexGrid: DefineComponent<
  VdHexGridProps,
  {},
  {},
  {},
  {},
  {},
  {},
  VdHexGridEmits
>;
/* eslint-enable @typescript-eslint/no-empty-object-type */
