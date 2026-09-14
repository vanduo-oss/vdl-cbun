// Markdown tokenizer. Line-oriented constructs use the `m` (multiline) + `y`
// (sticky) flags together, so an anchored `^` rule only fires at a line start.

import { scan } from './scanner.js';

const RULES = [
  { type: 'string', re: /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/y },
  { type: 'keyword', re: /^ {0,3}#{1,6} [^\n]*/my },
  { type: 'comment', re: /^ {0,3}>[^\n]*/my },
  { type: 'punctuation', re: /^ {0,3}(?:[-*+]|\d+\.)\s/my },
  { type: 'meta', re: /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/my },
  { type: 'function', re: /!?\[[^\][\n]*\]\([^()\n]*\)/y },
  { type: 'operator', re: /\*\*[^\n]*?\*\*|__[^\n]*?__/y },
  { type: 'meta', re: /\*[^*\n]+?\*|_[^_\n]+?_/y },
];

export function tokenizeMarkdown(source) {
  return scan(source, RULES);
}
