// Hand-written declarations for the tokenizer-only
// `@vanduo-oss/vdl-cbun/code-editor/highlight` entry. Types are shared with
// the editor core; this file MUST NOT pull in Vue wrapper types.

export { tokenize, highlight, renderTokensToHtml, LANGUAGES } from './core';
export type { CodeEditorLanguage, TokenType, Token, HighlightOptions } from './core';
