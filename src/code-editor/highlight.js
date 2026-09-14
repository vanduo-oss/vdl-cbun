// Highlight rendering. Two paths, both escaping-safe:
//   - renderTokensToHtml / highlight → an escaped HTML STRING (node tests, SSR,
//     docs snippets). `highlight()` does NOT append an extra newline by default
//     (snippet-safe inside `<pre>`). Pass `{ trailingNewline: true }` for the
//     textarea-overlay line-count fix.
//   - renderTokensToDom → a DOM DocumentFragment built with createElement /
//     createTextNode. This is the RUNTIME editor path; untrusted source text
//     only ever reaches `textContent`, so `innerHTML` is never assigned.
//
// This module is also the `./code-editor/highlight` entry: it re-exports
// `tokenize` / `LANGUAGES` and MUST NOT import `core.js` or `vue.js`.

import { tokenize, LANGUAGES } from './tokenizer/index.js';

export { tokenize, LANGUAGES };

const ESCAPE_RE = /[&<>"']/g;
const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape the five HTML metacharacters. */
export function escapeHtml(str) {
  return String(str).replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}

/** Render tokens to an escaped HTML string of `<span class="vd-tk-*">` wrappers. */
export function renderTokensToHtml(tokens) {
  let html = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'plain') {
      html += escapeHtml(t.value);
    } else {
      html += '<span class="vd-tk-' + t.type + '">' + escapeHtml(t.value) + '</span>';
    }
  }
  return html;
}

/**
 * Tokenize + render to an escaped HTML string.
 *
 * @param {string} source
 * @param {string} language
 * @param {{ trailingNewline?: boolean }} [options]
 *   When `trailingNewline` is true, append an extra `\n` if `source` is empty
 *   or already ends with `\n` (textarea line-count). Default false — snippet-safe.
 */
export function highlight(source, language, options) {
  const html = renderTokensToHtml(tokenize(source, language));
  if (options && options.trailingNewline && (source.endsWith('\n') || source === '')) {
    return html + '\n';
  }
  return html;
}

/**
 * Build a DocumentFragment of token nodes using `doc` (an injected `document`,
 * for jsdom/SSR testability). Plain tokens become text nodes; typed tokens
 * become `<span class="vd-tk-*">` with the text set via `textContent`.
 */
export function renderTokensToDom(tokens, doc) {
  const frag = doc.createDocumentFragment();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'plain') {
      frag.appendChild(doc.createTextNode(t.value));
    } else {
      const span = doc.createElement('span');
      span.className = 'vd-tk-' + t.type;
      span.textContent = t.value;
      frag.appendChild(span);
    }
  }
  return frag;
}
