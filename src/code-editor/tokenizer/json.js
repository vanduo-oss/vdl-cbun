// JSON tokenizer. Object keys (a string immediately before a colon) color as
// `property`; all other strings as `string`.

import { scan } from './scanner.js';

const RULES = [
  { type: 'property', re: /"(?:[^"\\]|\\.)*"(?=\s*:)/y },
  { type: 'string', re: /"(?:[^"\\]|\\.)*"?/y },
  { type: 'number', re: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y },
  { type: 'boolean', re: /\b(?:true|false)\b/y },
  { type: 'null', re: /\bnull\b/y },
  { type: 'punctuation', re: /[{}[\]:,]/y },
];

export function tokenizeJson(source) {
  return scan(source, RULES);
}
