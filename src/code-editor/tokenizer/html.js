// HTML / XML / Vue SFC tokenizer. Tags are matched as one unit, then expanded
// into tag-name / attribute / value sub-tokens. Complete `<script>` / `<style>`
// open tags switch into JS/TS/CSS until the matching close tag (linear search).
// Vue adds `{{ }}` mustache fences and classifies `v-*` / `@event` / `:bind`
// as `meta`.

import { coalesce, matchRule } from './scanner.js';
import { tokenizeJavaScript, tokenizeTypeScript } from './javascript.js';
import { tokenizeCss } from './css.js';

function expandTag(value, vue) {
  const out = [];
  const open = /^<\/?/.exec(value)[0];
  out.push({ type: 'punctuation', value: open });
  let rest = value.slice(open.length);

  const name = /^[a-zA-Z][\w:-]*/.exec(rest);
  if (name) {
    out.push({ type: 'tag', value: name[0] });
    rest = rest.slice(name[0].length);
  }

  if (rest) {
    const attrRules = vue
      ? [
          { type: 'string', re: /"[^"]*"?|'[^']*'?/y },
          { type: 'operator', re: /=/y },
          { type: 'punctuation', re: /\/?>/y },
          { type: 'meta', re: /(?:v-[\w:.@-]+|[@:][\w:.@-]*)/y },
          { type: 'attribute', re: /[a-zA-Z_][\w:.-]*/y },
        ]
      : [
          { type: 'string', re: /"[^"]*"?|'[^']*'?/y },
          { type: 'operator', re: /=/y },
          { type: 'punctuation', re: /\/?>/y },
          { type: 'attribute', re: /[a-zA-Z_:@][\w:.-]*/y },
        ];
    const inner = scanSlice(rest, attrRules);
    for (let i = 0; i < inner.length; i++) out.push(inner[i]);
  }
  return out;
}

function scanSlice(source, rules) {
  const tokens = [];
  const n = source.length;
  let i = 0;
  let plainStart = -1;
  const flushPlain = (end) => {
    if (plainStart !== -1 && end > plainStart) {
      tokens.push({ type: 'plain', value: source.slice(plainStart, end) });
    }
    plainStart = -1;
  };
  while (i < n) {
    const hit = matchRule(source, i, rules);
    if (hit) {
      flushPlain(i);
      for (let k = 0; k < hit.tokens.length; k++) tokens.push(hit.tokens[k]);
      i += hit.length;
    } else {
      if (plainStart === -1) plainStart = i;
      i++;
    }
  }
  flushPlain(n);
  return tokens;
}

function ieqChar(a, b) {
  if (a === b) return true;
  if (a >= 65 && a <= 90) return a + 32 === b;
  if (b >= 65 && b <= 90) return b + 32 === a;
  return false;
}

/** Linear, case-insensitive search for `</tagName>` starting at `start`. */
function findCloseTag(source, start, tagName) {
  const n = source.length;
  const tlen = tagName.length;
  for (let i = start; i < n; i++) {
    if (source.charCodeAt(i) !== 60) continue;
    if (source.charCodeAt(i + 1) !== 47) continue;
    let ok = true;
    for (let k = 0; k < tlen; k++) {
      if (!ieqChar(source.charCodeAt(i + 2 + k), tagName.charCodeAt(k))) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let j = i + 2 + tlen;
    while (j < n) {
      const c = source.charCodeAt(j);
      if (c === 32 || c === 9 || c === 10 || c === 13) j++;
      else break;
    }
    if (j < n && source.charCodeAt(j) === 62) return { start: i, end: j + 1 };
  }
  return null;
}

function embedInfo(tagValue) {
  const open = /^<(script|style)\b/i.exec(tagValue);
  if (!open) return null;
  if (!tagValue.endsWith('>') || tagValue.endsWith('/>')) return null;
  const tag = open[1].toLowerCase();
  if (tag === 'style') return { tag: 'style', lang: 'css' };
  const lang = /\blang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tagValue);
  const id = ((lang && (lang[1] || lang[2] || lang[3])) || '').toLowerCase();
  if (id === 'ts' || id === 'tsx' || id === 'typescript')
    return { tag: 'script', lang: 'typescript' };
  return { tag: 'script', lang: 'javascript' };
}

function tokenizeEmbed(source, lang) {
  if (lang === 'typescript') return tokenizeTypeScript(source);
  if (lang === 'css') return tokenizeCss(source);
  return tokenizeJavaScript(source);
}

function expandMustache(value) {
  const out = [{ type: 'meta', value: '{{' }];
  let inner = value.slice(2);
  let close = '';
  if (value.length >= 4 && inner.endsWith('}}')) {
    close = '}}';
    inner = inner.slice(0, -2);
  }
  if (inner) {
    const parts = tokenizeJavaScript(inner);
    for (let i = 0; i < parts.length; i++) out.push(parts[i]);
  }
  if (close) out.push({ type: 'meta', value: close });
  return out;
}

function makeMarkupRules(vue) {
  const expand = (value) => expandTag(value, vue);
  const rules = [
    { type: 'comment', re: /<!--[\s\S]*?-->/y },
    { type: 'meta', re: /<!\[CDATA\[[\s\S]*?\]\]>/y },
    { type: 'meta', re: /<!DOCTYPE[^>]*>/iy },
    {
      expand,
      re: /<\/?[a-zA-Z][\w:-]*(?:\s+[^\s/>"'=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>/y,
    },
    { expand, re: /<\/?[a-zA-Z][\w:-]*/y },
    { type: 'meta', re: /&[a-zA-Z][a-zA-Z0-9]*;|&#\d+;|&#x[0-9a-fA-F]+;/y },
  ];
  if (vue) {
    rules.splice(1, 0, { expand: expandMustache, re: /\{\{[\s\S]*?(?:\}\}|$)/y });
  }
  return rules;
}

const HTML_RULES = makeMarkupRules(false);
const VUE_RULES = makeMarkupRules(true);

/**
 * Tokenize HTML or a Vue SFC. `vue: true` enables mustache + directive `meta`.
 */
export function tokenizeMarkup(source, options) {
  const vue = !!(options && options.vue);
  const rules = vue ? VUE_RULES : HTML_RULES;
  const tokens = [];
  const n = source.length;
  let i = 0;
  let plainStart = -1;

  const flushPlain = (end) => {
    if (plainStart !== -1 && end > plainStart) {
      tokens.push({ type: 'plain', value: source.slice(plainStart, end) });
    }
    plainStart = -1;
  };

  while (i < n) {
    const hit = matchRule(source, i, rules);
    if (hit) {
      flushPlain(i);
      const embed = embedInfo(hit.value);
      if (embed) {
        for (let k = 0; k < hit.tokens.length; k++) tokens.push(hit.tokens[k]);
        i += hit.length;
        const close = findCloseTag(source, i, embed.tag);
        const bodyEnd = close ? close.start : n;
        const body = source.slice(i, bodyEnd);
        if (body) {
          const inner = tokenizeEmbed(body, embed.lang);
          for (let k = 0; k < inner.length; k++) tokens.push(inner[k]);
        }
        if (close) {
          const closeTokens = expandTag(source.slice(close.start, close.end), vue);
          for (let k = 0; k < closeTokens.length; k++) tokens.push(closeTokens[k]);
          i = close.end;
        } else {
          i = n;
        }
        continue;
      }
      for (let k = 0; k < hit.tokens.length; k++) tokens.push(hit.tokens[k]);
      i += hit.length;
    } else {
      if (plainStart === -1) plainStart = i;
      i++;
    }
  }
  flushPlain(n);
  return coalesce(tokens);
}

export function tokenizeHtml(source) {
  return tokenizeMarkup(source, { vue: false });
}

export function tokenizeVue(source) {
  return tokenizeMarkup(source, { vue: true });
}
