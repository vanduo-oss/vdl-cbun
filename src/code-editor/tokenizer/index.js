// Tokenizer registry + the public `tokenize()` entry point.
//
// Each language module is a pure `(source) => Token[]` function built on the
// shared linear scanner. `tokenize()` resolves aliases, dispatches to the right
// tokenizer, and falls back to a single `plain` token for unknown languages —
// it never throws.

import { tokenizeJavaScript, tokenizeTypeScript } from './javascript.js';
import { tokenizeHtml, tokenizeVue } from './html.js';
import { tokenizeCss } from './css.js';
import { tokenizeJson } from './json.js';
import { tokenizeMarkdown } from './markdown.js';
import { tokenizeShell } from './shell.js';
import { tokenizePython } from './python.js';

const TOKENIZERS = {
  javascript: tokenizeJavaScript,
  typescript: tokenizeTypeScript,
  html: tokenizeHtml,
  vue: tokenizeVue,
  css: tokenizeCss,
  json: tokenizeJson,
  markdown: tokenizeMarkdown,
  shell: tokenizeShell,
  python: tokenizePython,
};

/** Canonical language ids the editor understands (`plaintext` = no highlight). */
export const LANGUAGES = Object.freeze([
  'plaintext',
  'javascript',
  'typescript',
  'html',
  'vue',
  'css',
  'json',
  'markdown',
  'shell',
  'python',
]);

/** Common aliases mapped to canonical ids.
 *  `jsx` / `tsx` / `jsonc` are JS / TS / JSON fallbacks — not real grammars. */
export const ALIASES = Object.freeze({
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  htm: 'html',
  xml: 'html',
  svg: 'html',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  shellscript: 'shell',
  py: 'python',
  python3: 'python',
  md: 'markdown',
  mkd: 'markdown',
  json5: 'json',
  jsonc: 'json',
  text: 'plaintext',
  txt: 'plaintext',
  plain: 'plaintext',
});

/** Resolve a language id or alias to its canonical id. */
export function resolveLanguage(language) {
  const id = String(language || 'plaintext').toLowerCase();
  return ALIASES[id] || id;
}

/** The tokenizer function for a language, or `null` when none is registered. */
export function getTokenizer(language) {
  return TOKENIZERS[resolveLanguage(language)] || null;
}

/**
 * Tokenize `source` for `language`. Returns `{ type, value }[]`; the token
 * values always concatenate back to `source` exactly (lossless).
 */
export function tokenize(source, language) {
  if (!source) return [];
  const tokenizer = getTokenizer(language);
  if (!tokenizer) return [{ type: 'plain', value: source }];
  return tokenizer(source);
}
