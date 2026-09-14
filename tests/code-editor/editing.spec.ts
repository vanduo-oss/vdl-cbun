// Keymap transaction specs (plain node — the editing helpers are pure). Each
// returns an edit `{ from, to, text, selectionStart, selectionEnd }` or null.

import { describe, it, expect } from 'vitest';

import {
  indentOnEnter,
  handleTab,
  handleShiftTab,
  autoClosePair,
  skipOverCloser,
  handleBackspacePair,
} from '../../src/code-editor/editing.js';

const UNIT = '  ';

describe('indentOnEnter', () => {
  it('copies the current line indentation', () => {
    const v = '  foo';
    expect(indentOnEnter(v, v.length, v.length, UNIT).text).toBe('\n  ');
  });

  it('adds one level after an opener', () => {
    const v = 'if (x) {';
    expect(indentOnEnter(v, v.length, v.length, UNIT).text).toBe('\n  ');
  });

  it('adds one level after [ opener', () => {
    const v = 'const a = [';
    expect(indentOnEnter(v, v.length, v.length, UNIT).text).toBe('\n  ');
  });

  it('adds one level after ( opener', () => {
    const v = 'foo(';
    expect(indentOnEnter(v, v.length, v.length, UNIT).text).toBe('\n  ');
  });

  it('splits an empty pair onto its own line', () => {
    const v = 'f() {}'; // caret between { (index 4) and } (index 5)
    const e = indentOnEnter(v, 5, 5, UNIT);
    expect(e.text).toBe('\n  \n');
    expect(e.selectionStart).toBe(8);
    expect(e.selectionEnd).toBe(8);
  });

  it('splits empty [] pair onto its own line', () => {
    const v = 'a = []'; // caret between [ (index 4) and ] (index 5)
    const e = indentOnEnter(v, 5, 5, UNIT);
    expect(e.text).toBe('\n  \n');
    expect(e.selectionStart).toBe(8);
    expect(e.selectionEnd).toBe(8);
  });

  it('splits empty () pair onto its own line', () => {
    const v = 'foo()'; // caret between ( (index 3) and ) (index 4)
    const e = indentOnEnter(v, 4, 4, UNIT);
    expect(e.text).toBe('\n  \n');
    expect(e.selectionStart).toBe(7);
    expect(e.selectionEnd).toBe(7);
  });

  it('preserves text after caret when splitting line', () => {
    const v = 'foobar';
    const e = indentOnEnter(v, 3, 3, UNIT);
    expect(e.text).toBe('\n');
    expect(e.selectionStart).toBe(4);
    expect(e.selectionEnd).toBe(4);
  });
});

describe('handleTab', () => {
  it('inserts one unit at a collapsed caret', () => {
    expect(handleTab('ab', 1, 1, UNIT)).toMatchObject({
      from: 1,
      to: 1,
      text: '  ',
      selectionStart: 3,
      selectionEnd: 3,
    });
  });

  it('indents every line of a multi-line selection', () => {
    expect(handleTab('a\nb', 0, 3, UNIT).text).toBe('  a\n  b');
  });

  it('replaces a single-line selection with the indent unit', () => {
    expect(handleTab('abc', 0, 3, UNIT)).toMatchObject({
      from: 0,
      to: 3,
      text: '  ',
      selectionStart: 2,
      selectionEnd: 2,
    });
  });
});

describe('handleShiftTab', () => {
  it('removes up to one unit from each selected line', () => {
    const v = '    a\n  b';
    expect(handleShiftTab(v, 0, v.length, UNIT).text).toBe('  a\nb');
  });

  it('is a no-op on already-flush lines', () => {
    expect(handleShiftTab('a\nb', 0, 3, UNIT).text).toBe('a\nb');
  });

  it('removes a leading tab character', () => {
    expect(handleShiftTab('\tfoo', 0, 4, UNIT).text).toBe('foo');
  });
});

describe('autoClosePair', () => {
  it('inserts the matching closer at a caret', () => {
    expect(autoClosePair('(', 'x', 1, 1)).toMatchObject({
      text: '()',
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('auto-closes square brackets []', () => {
    expect(autoClosePair('[', 'x', 1, 1)).toMatchObject({
      text: '[]',
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('auto-closes curly braces {}', () => {
    expect(autoClosePair('{', 'x', 1, 1)).toMatchObject({
      text: '{}',
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('auto-closes double quotes ""', () => {
    // Quotes skip auto-close next to word chars, so use a space context.
    expect(autoClosePair('"', ' ', 1, 1)).toMatchObject({
      text: '""',
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it("auto-closes single quotes ''", () => {
    expect(autoClosePair("'", ' ', 1, 1)).toMatchObject({
      text: "''",
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('auto-closes backticks ``', () => {
    expect(autoClosePair('`', ' ', 1, 1)).toMatchObject({
      text: '``',
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('wraps a selection', () => {
    expect(autoClosePair('(', 'abc', 0, 3)).toMatchObject({
      text: '(abc)',
      selectionStart: 1,
      selectionEnd: 4,
    });
  });

  it('wraps selection in []', () => {
    expect(autoClosePair('[', 'abc', 0, 3)).toMatchObject({
      text: '[abc]',
      selectionStart: 1,
      selectionEnd: 4,
    });
  });

  it('wraps selection in {}', () => {
    expect(autoClosePair('{', 'abc', 0, 3)).toMatchObject({
      text: '{abc}',
      selectionStart: 1,
      selectionEnd: 4,
    });
  });

  it('wraps selection in ""', () => {
    expect(autoClosePair('"', 'abc', 0, 3)).toMatchObject({
      text: '"abc"',
      selectionStart: 1,
      selectionEnd: 4,
    });
  });

  it('skips opener auto-close before a word character', () => {
    expect(autoClosePair('(', 'word', 0, 0)).toBeNull();
  });

  it('skips quote auto-close next to a word char', () => {
    expect(autoClosePair('"', 'word', 0, 0)).toBeNull();
  });

  it('skips quote auto-close after a word character', () => {
    expect(autoClosePair('"', 'dont', 3, 3)).toBeNull();
  });

  it('returns null for a non-pair character', () => {
    expect(autoClosePair('a', 'x', 1, 1)).toBeNull();
  });
});

describe('skipOverCloser', () => {
  it('steps over a matching closer', () => {
    expect(skipOverCloser(')', 'a)', 1, 1)).toMatchObject({
      caretOnly: true,
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('steps over ]', () => {
    expect(skipOverCloser(']', 'a]', 1, 1)).toMatchObject({
      caretOnly: true,
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('steps over }', () => {
    expect(skipOverCloser('}', 'a}', 1, 1)).toMatchObject({
      caretOnly: true,
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('steps over "', () => {
    expect(skipOverCloser('"', 'a"', 1, 1)).toMatchObject({
      caretOnly: true,
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it("steps over '", () => {
    expect(skipOverCloser("'", "a'", 1, 1)).toMatchObject({
      caretOnly: true,
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('steps over backtick', () => {
    expect(skipOverCloser('`', 'a`', 1, 1)).toMatchObject({
      caretOnly: true,
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('returns null for non-collapsed selection', () => {
    expect(skipOverCloser(')', 'a)', 0, 1)).toBeNull();
  });

  it('is a no-op when the next char differs', () => {
    expect(skipOverCloser(')', 'ab', 1, 1)).toBeNull();
  });
});

describe('handleBackspacePair', () => {
  it('deletes both sides of an empty pair', () => {
    expect(handleBackspacePair('()', 1, 1)).toMatchObject({ from: 0, to: 2, text: '' });
  });

  it('deletes empty [] pair', () => {
    expect(handleBackspacePair('[]', 1, 1)).toMatchObject({ from: 0, to: 2, text: '' });
  });

  it('deletes empty {} pair', () => {
    expect(handleBackspacePair('{}', 1, 1)).toMatchObject({ from: 0, to: 2, text: '' });
  });

  it('deletes empty "" pair', () => {
    expect(handleBackspacePair('""', 1, 1)).toMatchObject({ from: 0, to: 2, text: '' });
  });

  it("deletes empty ''pair", () => {
    expect(handleBackspacePair("''", 1, 1)).toMatchObject({ from: 0, to: 2, text: '' });
  });

  it('deletes empty `` pair', () => {
    expect(handleBackspacePair('``', 1, 1)).toMatchObject({ from: 0, to: 2, text: '' });
  });

  it('returns null at start of input', () => {
    expect(handleBackspacePair('()', 0, 0)).toBeNull();
  });

  it('is a no-op for a non-pair', () => {
    expect(handleBackspacePair('ab', 1, 1)).toBeNull();
  });
});
