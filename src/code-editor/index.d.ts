export { VdCodeEditor } from './vue';
export {
  VdCodeEditor as VdCodeEditorCore,
  VD_CODE_EDITOR_VERSION,
  tokenize,
  highlight,
  renderTokensToHtml,
  LANGUAGES,
} from './core';
export type {
  CodeEditorLanguage,
  TokenType,
  Token,
  HighlightOptions,
  CodeEditorSelection,
  VdCodeEditorOptions,
  CodeEditorChangeEvent,
  CodeEditorEventMap,
} from './core';
export type { VdCodeEditorProps, VdCodeEditorEmits, VdCodeEditorExposed } from './vue';
