// Entry for @vanduo-oss/vdl-cbun/code-editor.
//
// The Vue 3 wrapper is the primary export; the framework-agnostic editor core is
// re-exported alongside as VdCodeEditorCore, together with the version constant
// and the pure tokenizer helpers. Named exports only — no default.

export { VdCodeEditor } from './vue.js';
export {
  VdCodeEditor as VdCodeEditorCore,
  VD_CODE_EDITOR_VERSION,
  tokenize,
  highlight,
  renderTokensToHtml,
  LANGUAGES,
} from './core.js';
