// JavaScript / TypeScript tokenizer. One rule set, parameterized by keyword
// list: TypeScript is JavaScript plus a superset of type-level keywords.
// Template literals expand `${}` interpolations; `/pattern/flags` in regex
// position emits `regex` (division `/` stays an operator after an identifier).

import { scan, wordRegex } from './scanner.js';

const JS_KEYWORDS = [
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'async',
  'await',
  'let',
  'static',
  'get',
  'set',
  'of',
  'as',
  'from',
];

const TS_KEYWORDS = [
  ...JS_KEYWORDS,
  'interface',
  'type',
  'enum',
  'implements',
  'declare',
  'namespace',
  'readonly',
  'satisfies',
  'abstract',
  'public',
  'private',
  'protected',
  'keyof',
  'infer',
  'is',
  'asserts',
  'override',
  'module',
  'string',
  'number',
  'boolean',
  'object',
  'symbol',
  'bigint',
  'any',
  'unknown',
  'never',
];

const BUILTINS = [
  'console',
  'window',
  'document',
  'globalThis',
  'Math',
  'JSON',
  'Object',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'Promise',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Date',
  'RegExp',
  'Error',
  'Function',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'require',
  'module',
  'exports',
  'process',
  'NaN',
  'Infinity',
];

const REGEX_AFTER_KEYWORD = new Set([
  'return',
  'throw',
  'case',
  'in',
  'of',
  'typeof',
  'void',
  'delete',
  'new',
  'else',
  'do',
  'yield',
  'await',
  'extends',
]);

function isWs(c) {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

function isWord(c) {
  return (
    (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 36 || c === 95
  );
}

/** `/` starts a regex unless the preceding token is an identifier, number, `)`, `]`, `++`, or `--`. */
export function canStartRegex(source, i) {
  let j = i - 1;
  while (j >= 0 && isWs(source.charCodeAt(j))) j--;
  if (j < 0) return true;
  const c = source.charCodeAt(j);
  if (c === 41 || c === 93) return false; // ) ]
  if ((c === 43 || c === 45) && j > 0 && source.charCodeAt(j - 1) === c) return false;
  if (isWord(c)) {
    let start = j;
    while (start > 0 && isWord(source.charCodeAt(start - 1))) start--;
    return REGEX_AFTER_KEYWORD.has(source.slice(start, j + 1));
  }
  return true;
}

function isRegexFlag(c) {
  return (
    c === 100 ||
    c === 103 ||
    c === 105 ||
    c === 109 ||
    c === 115 ||
    c === 117 ||
    c === 118 ||
    c === 121
  );
}

/** Linear `/pattern/flags` consumer. Returns null when unterminated (so `/` can be division). */
export function consumeRegex(source, i) {
  const n = source.length;
  let j = i + 1;
  let inClass = false;
  while (j < n) {
    const c = source.charCodeAt(j);
    if (c === 10) return null;
    if (c === 92) {
      j += 2;
      continue;
    }
    if (inClass) {
      if (c === 93) inClass = false;
      j++;
      continue;
    }
    if (c === 91) {
      inClass = true;
      j++;
      continue;
    }
    if (c === 47) {
      j++;
      while (j < n && isRegexFlag(source.charCodeAt(j))) j++;
      return { value: source.slice(i, j) };
    }
    j++;
  }
  return null;
}

function skipQuoted(s, i) {
  const q = s.charCodeAt(i);
  let j = i + 1;
  const n = s.length;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (c === 92) {
      j += 2;
      continue;
    }
    if (c === q) return j + 1;
    if (c === 10) return j;
    j++;
  }
  return n;
}

function findTemplateInterpEnd(s, start) {
  let depth = 1;
  let i = start;
  const n = s.length;
  while (i < n && depth > 0) {
    const c = s.charCodeAt(i);
    if (c === 47 && s.charCodeAt(i + 1) === 47) {
      const nl = s.indexOf('\n', i + 2);
      if (nl < 0) return n;
      i = nl;
      continue;
    }
    if (c === 47 && s.charCodeAt(i + 1) === 42) {
      const end = s.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === 34 || c === 39) {
      i = skipQuoted(s, i);
      continue;
    }
    if (c === 96) {
      i = skipTemplate(s, i);
      continue;
    }
    if (c === 123) depth++;
    else if (c === 125) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return n;
}

function skipTemplate(s, i) {
  let j = i + 1;
  const n = s.length;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (c === 92) {
      j += 2;
      continue;
    }
    if (c === 96) return j + 1;
    if (c === 36 && s.charCodeAt(j + 1) === 123) {
      const end = findTemplateInterpEnd(s, j + 2);
      j = end < n && s.charCodeAt(end) === 125 ? end + 1 : end;
      continue;
    }
    j++;
  }
  return n;
}

function expandTemplateLiteral(value, rules) {
  const out = [];
  const n = value.length;
  let i = 1;
  let strStart = 0;

  const flushString = (end) => {
    if (end > strStart) out.push({ type: 'string', value: value.slice(strStart, end) });
  };

  while (i < n) {
    const c = value.charCodeAt(i);
    if (c === 92) {
      i += i + 1 < n ? 2 : 1;
      continue;
    }
    if (c === 96) {
      flushString(i + 1);
      return out;
    }
    if (c === 36 && i + 1 < n && value.charCodeAt(i + 1) === 123) {
      flushString(i);
      out.push({ type: 'operator', value: '${' });
      const innerStart = i + 2;
      const innerEnd = findTemplateInterpEnd(value, innerStart);
      const inner = value.slice(innerStart, innerEnd);
      if (inner) {
        const parts = scan(inner, rules);
        for (let k = 0; k < parts.length; k++) out.push(parts[k]);
      }
      if (innerEnd < n && value.charCodeAt(innerEnd) === 125) {
        out.push({ type: 'punctuation', value: '}' });
        i = innerEnd + 1;
      } else {
        i = innerEnd;
      }
      strStart = i;
      continue;
    }
    i++;
  }
  flushString(n);
  return out;
}

function makeRules(keywords) {
  const rules = [
    { type: 'comment', re: /\/\/[^\n]*/y },
    { type: 'comment', re: /\/\*[\s\S]*?(?:\*\/|$)/y }, // unterminated -> comment to EOF
    { type: 'string', re: /"(?:[^"\\\n]|\\.)*"?/y },
    { type: 'string', re: /'(?:[^'\\\n]|\\.)*'?/y },
    { expand: (value) => expandTemplateLiteral(value, rules), re: /`(?:[^`\\]|\\.)*`?/y },
    {
      type: 'number',
      re: /0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?/y,
    },
    { type: 'keyword', re: wordRegex(keywords) },
    { type: 'boolean', re: /(?:true|false)\b/y },
    { type: 'null', re: /(?:null|undefined)\b/y },
    { type: 'builtin', re: wordRegex(BUILTINS) },
    { type: 'function', re: /[A-Za-z_$][\w$]*(?=\s*\()/y },
    { type: 'plain', re: /[A-Za-z_$][\w$]*/y },
    {
      type: 'regex',
      when: (source, i) => source.charCodeAt(i) === 47 && canStartRegex(source, i),
      consume: consumeRegex,
    },
    { type: 'operator', re: /\.{3}|=>|[+\-*/%=<>!&|^~?]+/y },
    { type: 'punctuation', re: /[{}()[\];,.:]/y },
  ];
  return rules;
}

const JS_RULES = makeRules(JS_KEYWORDS);
const TS_RULES = makeRules(TS_KEYWORDS);

export function tokenizeJavaScript(source) {
  return scan(source, JS_RULES);
}

export function tokenizeTypeScript(source) {
  return scan(source, TS_RULES);
}
