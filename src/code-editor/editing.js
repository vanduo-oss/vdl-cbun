// Pure keymap transactions. Each function takes the current textarea value and
// selection and returns an EDIT — `{ from, to, text, selectionStart,
// selectionEnd }` describing a replacement of `value[from..to]` with `text` plus
// the resulting caret — or `null` to let the browser handle the key natively.
// No DOM access, so every branch is unit-testable in plain node.

import { AUTO_CLOSE_PAIRS, CLOSERS, closerFor, isMatchingPair } from './constants.js';

const CLOSER_SET = new Set(CLOSERS);
const WORD = /[\w$]/;

/** Enter: copy the current line's indent, add a level after an opener, and
 *  split an empty pair onto its own line. */
export function indentOnEnter(value, start, end, unit) {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const leading = /^[ \t]*/.exec(value.slice(lineStart, start))[0];
  const prev = value[start - 1];
  const next = value[end];
  const opens = prev === '{' || prev === '[' || prev === '(';

  if (opens && isMatchingPair(prev, next)) {
    const inner = leading + unit;
    const text = '\n' + inner + '\n' + leading;
    const caret = start + 1 + inner.length;
    return { from: start, to: end, text, selectionStart: caret, selectionEnd: caret };
  }

  const indent = opens ? leading + unit : leading;
  const text = '\n' + indent;
  const caret = start + text.length;
  return { from: start, to: end, text, selectionStart: caret, selectionEnd: caret };
}

/** Tab: insert one indent unit, or indent every line of a multi-line selection. */
export function handleTab(value, start, end, unit) {
  if (start !== end && value.slice(start, end).indexOf('\n') !== -1) {
    const from = value.lastIndexOf('\n', start - 1) + 1;
    const block = value.slice(from, end);
    const indented = block.replace(/^/gm, unit);
    const added = indented.length - block.length;
    return {
      from,
      to: end,
      text: indented,
      selectionStart: start + unit.length,
      selectionEnd: end + added,
    };
  }
  return {
    from: start,
    to: end,
    text: unit,
    selectionStart: start + unit.length,
    selectionEnd: start + unit.length,
  };
}

/** Shift-Tab: remove up to one indent unit from the start of each selected line. */
export function handleShiftTab(value, start, end, unit) {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const size = unit.length || 1;
  const lines = value.slice(from, end).split('\n');
  let firstRemoved = 0;
  let totalRemoved = 0;
  const dedented = lines
    .map((line, idx) => {
      let remove = 0;
      while (remove < size && line[remove] === ' ') remove++;
      if (remove === 0 && line[0] === '\t') remove = 1;
      if (idx === 0) firstRemoved = remove;
      totalRemoved += remove;
      return line.slice(remove);
    })
    .join('\n');
  return {
    from,
    to: end,
    text: dedented,
    selectionStart: Math.max(from, start - firstRemoved),
    selectionEnd: Math.max(from, end - totalRemoved),
  };
}

/** Typing an opener/quote: wrap a selection, or insert the matching closer. */
export function autoClosePair(char, value, start, end) {
  const closer = closerFor(char);
  if (!closer) return null;

  if (start !== end) {
    return {
      from: start,
      to: end,
      text: char + value.slice(start, end) + closer,
      selectionStart: start + 1,
      selectionEnd: end + 1,
    };
  }

  const nextChar = value[start];
  if (char === closer) {
    // Quote: skip auto-close next to a word char (apostrophes, mid-word typing).
    if (nextChar && WORD.test(nextChar)) return null;
    const prevChar = value[start - 1];
    if (prevChar && WORD.test(prevChar)) return null;
  } else if (nextChar && WORD.test(nextChar)) {
    return null;
  }

  return {
    from: start,
    to: end,
    text: char + closer,
    selectionStart: start + 1,
    selectionEnd: start + 1,
  };
}

/** Typing a closer when the next char is that same closer: step over it. */
export function skipOverCloser(char, value, start, end) {
  if (start !== end || !CLOSER_SET.has(char)) return null;
  if (value[start] === char) {
    return { caretOnly: true, selectionStart: start + 1, selectionEnd: start + 1 };
  }
  return null;
}

/** Backspace between an empty auto-pair (`()`, `""`, …): delete both sides. */
export function handleBackspacePair(value, start, end) {
  if (start !== end || start === 0) return null;
  const prev = value[start - 1];
  const next = value[start];
  if (AUTO_CLOSE_PAIRS[prev] && AUTO_CLOSE_PAIRS[prev] === next) {
    return {
      from: start - 1,
      to: start + 1,
      text: '',
      selectionStart: start - 1,
      selectionEnd: start - 1,
    };
  }
  return null;
}
