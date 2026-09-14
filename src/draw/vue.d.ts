import type { DefineComponent } from 'vue';
import type {
  DrawDocument,
  DrawTool,
  DrawChangeEvent,
  DrawSelectEvent,
  DrawViewportEvent,
  VdDraw as VdDrawCore,
} from './core';

/** Loosely-typed document accepted by the `data` prop. */
export interface VdDrawDocument extends Partial<DrawDocument> {
  shapes?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface VdDrawProps {
  /** Drawing document ({ shapes, viewport }). */
  data?: VdDrawDocument;
  /** Render as a non-editable viewer. */
  readonly?: boolean;
  /** Active tool — updated live without recreating the editor. */
  tool?: DrawTool;
  /** Background grid size in px. */
  gridSize?: number;
  /** Show the background grid (default true). */
  showGrid?: boolean;
  /** Snap to nearby edges/centres while moving/resizing. */
  snap?: boolean;
  /** Fit the view to content once the editor reports a measurable size. */
  autoFit?: boolean;
  /** Enable the built-in undo/redo history (default true). */
  history?: boolean;
  /** Maximum number of history entries to retain. */
  historyLimit?: number;
}

export interface VdDrawEmits {
  (event: 'change', payload: DrawChangeEvent): void;
  (event: 'select', payload: DrawSelectEvent): void;
  (event: 'viewport', payload: DrawViewportEvent): void;
  (event: 'ready', instance: VdDrawCore): void;
}

/** Methods exposed via a template ref. */
export interface VdDrawExposed {
  getInstance(): VdDrawCore | null;
  setTool(tool: DrawTool): void;
  setReadonly(readonly: boolean): void;
  setSnap(snap: boolean): void;
  setHistoryEnabled(enabled: boolean): void;
  setHistoryLimit(limit: number): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  toSVG(): string | undefined;
  toPNG(options?: { scale?: number }): Promise<string> | undefined;
  addShape(partial?: Record<string, unknown>): Record<string, unknown> | undefined;
  updateShape(
    id: string,
    patch?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Record<string, unknown> | null | undefined;
  removeShape(id: string): boolean | undefined;
  getShape(id: string): Record<string, unknown> | null | undefined;
  getShapes(): Array<Record<string, unknown>> | undefined;
  clear(): void;
  load(data: Record<string, unknown>): void;
  toJSON(): DrawDocument | undefined;
}

/* eslint-disable @typescript-eslint/no-empty-object-type -- DefineComponent filler params */
export declare const VdDraw: DefineComponent<
  VdDrawProps,
  VdDrawExposed,
  {},
  {},
  {},
  {},
  {},
  VdDrawEmits
>;
/* eslint-enable @typescript-eslint/no-empty-object-type */
