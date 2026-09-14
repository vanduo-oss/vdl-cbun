// Hand-written declarations for the framework-agnostic code-editor core.

export const VD_CODE_EDITOR_VERSION: string;

/** Canonical language ids the editor understands. */
export type CodeEditorLanguage =
  | 'plaintext'
  | 'javascript'
  | 'typescript'
  | 'html'
  | 'vue'
  | 'css'
  | 'json'
  | 'markdown'
  | 'shell'
  | 'python';

/** Canonical language ids (aliases like `js`/`py` resolve to these). */
export const LANGUAGES: readonly CodeEditorLanguage[];

/** Token classes produced by the tokenizers. */
export type TokenType =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'boolean'
  | 'null'
  | 'function'
  | 'operator'
  | 'punctuation'
  | 'property'
  | 'tag'
  | 'attribute'
  | 'regex'
  | 'variable'
  | 'builtin'
  | 'meta';

export interface Token {
  type: TokenType;
  value: string;
}

/**
 * Tokenize `source` for `language`. Lossless: the token values always
 * concatenate back to `source` exactly. Unknown languages yield one `plain`
 * token and never throw.
 */
export function tokenize(source: string, language: string): Token[];

/**
 * When `trailingNewline` is true, append an extra `\n` if `source` is empty
 * or already ends with `\n` (textarea line-count). Default false — snippet-safe
 * inside `<pre>`.
 */
export interface HighlightOptions {
  trailingNewline?: boolean;
}

/** Render tokens to an escaped HTML string of `vd-tk-*` spans (no extra newline). */
export function renderTokensToHtml(tokens: Token[]): string;

/**
 * Tokenize + render to an escaped HTML string (never routed to innerHTML).
 * Does not append an extra trailing newline unless `options.trailingNewline`
 * is true.
 */
export function highlight(source: string, language: string, options?: HighlightOptions): string;

export interface CodeEditorSelection {
  start: number;
  end: number;
  text: string;
}

export interface VdCodeEditorOptions {
  /** Container element or a selector for it. */
  element?: Element | string;
  /** Initial contents. */
  value?: string;
  /** Language id or alias. */
  language?: string;
  /** Render as a non-editable viewer. */
  readOnly?: boolean;
  /** Show the line-number gutter (ignored in wrap mode). */
  lineNumbers?: boolean;
  /** Indent width, in spaces. */
  tabSize?: number;
  /** Empty-state placeholder. */
  placeholder?: string;
  /** Native `maxlength` cap. */
  maxLength?: number;
  /** Soft-wrap long lines (disables the gutter + active-line). */
  wrap?: boolean;
  /** Auto-close brackets/quotes and step over closers. */
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

export interface CodeEditorChangeEvent {
  value: string;
}

export interface CodeEditorEventMap {
  change: CodeEditorChangeEvent;
  focus: FocusEvent;
  blur: FocusEvent;
}

export class VdCodeEditor {
  constructor(options?: VdCodeEditorOptions);
  readonly element: Element | null;
  getValue(): string;
  setValue(next: string, options?: { silent?: boolean }): this;
  getSelection(): CodeEditorSelection;
  setSelection(start: number, end?: number): this;
  insertText(text: string): this;
  setLanguage(language: string): this;
  setReadOnly(readOnly: boolean): this;
  setTabSize(tabSize: number): this;
  setPlaceholder(text: string): this;
  setAutoClose(autoClose: boolean): this;
  focus(): this;
  blur(): this;
  on<K extends keyof CodeEditorEventMap>(
    name: K,
    handler: (payload: CodeEditorEventMap[K]) => void,
  ): this;
  off<K extends keyof CodeEditorEventMap>(
    name: K,
    handler: (payload: CodeEditorEventMap[K]) => void,
  ): this;
  destroy(): void;
}
