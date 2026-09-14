import type { DefineComponent } from 'vue';
import type { VdCodeEditor as VdCodeEditorCore, CodeEditorSelection } from './core';

export interface VdCodeEditorProps {
  /** Editor contents (v-model). */
  modelValue?: string;
  /** Syntax language id or alias. */
  language?: string;
  /** Render as a non-editable viewer. */
  readOnly?: boolean;
  /** Show the line-number gutter (ignored in wrap mode). */
  lineNumbers?: boolean;
  /** Indent width, in spaces. */
  tabSize?: number;
  /** Empty-state placeholder text. */
  placeholder?: string;
  /** Native `maxlength` cap. */
  maxLength?: number;
  /** Soft-wrap long lines (disables the gutter + active-line). */
  wrap?: boolean;
  /** Auto-close brackets/quotes. */
  autoClose?: boolean;
  /** Highlight the caret's line (ignored in wrap mode). */
  highlightActiveLine?: boolean;
  /** Skip highlighting above this many characters. */
  maxHighlightLength?: number;
  /** Native spellcheck. */
  spellcheck?: boolean;
  /** Show the copy-to-clipboard button. */
  copy?: boolean;
  /** Accessible label for the textarea. */
  ariaLabel?: string;
}

export interface VdCodeEditorEmits {
  (event: 'update:modelValue', value: string): void;
  (event: 'change', value: string): void;
  (event: 'focus', payload: FocusEvent): void;
  (event: 'blur', payload: FocusEvent): void;
  (event: 'ready', instance: VdCodeEditorCore): void;
}

/** Methods exposed via a template ref. */
export interface VdCodeEditorExposed {
  getInstance(): VdCodeEditorCore | null;
  focus(): void;
  blur(): void;
  getValue(): string;
  setValue(value: string): void;
  getSelection(): CodeEditorSelection;
  setSelection(start: number, end?: number): void;
  insertText(text: string): void;
  getContainer(): Element | null;
}

/* eslint-disable @typescript-eslint/no-empty-object-type -- DefineComponent filler params */
export declare const VdCodeEditor: DefineComponent<
  VdCodeEditorProps,
  VdCodeEditorExposed,
  {},
  {},
  {},
  {},
  {},
  VdCodeEditorEmits
>;
/* eslint-enable @typescript-eslint/no-empty-object-type */
