// Shared, DOM-free constants for the code editor. Pure data and predicates —
// safe to import from node tests and from both the core and the tokenizers.

/** Default indent width, in spaces. */
export const DEFAULT_TAB_SIZE = 2;

// Above this many characters, highlighting is skipped (the editor renders one
// escaped plain-text node) so very large documents stay responsive.
export const MAX_HIGHLIGHT_LENGTH = 100000;

/** Characters that auto-close to the mapped closer when typed. */
export const AUTO_CLOSE_PAIRS = Object.freeze({
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
});

/** Opening characters that trigger auto-close. */
export const OPENERS = Object.freeze(Object.keys(AUTO_CLOSE_PAIRS));

/** Closing characters (brackets + quotes) the caret can skip over. */
export const CLOSERS = Object.freeze([')', ']', '}', '"', "'", '`']);

/** True when `ch` is an auto-closing opener. */
export function isOpener(ch) {
  return Object.prototype.hasOwnProperty.call(AUTO_CLOSE_PAIRS, ch);
}

/** The closer mapped to `ch`, or `undefined`. */
export function closerFor(ch) {
  return AUTO_CLOSE_PAIRS[ch];
}

/** True when `open`/`close` form an auto-close pair. */
export function isMatchingPair(open, close) {
  return AUTO_CLOSE_PAIRS[open] === close;
}
