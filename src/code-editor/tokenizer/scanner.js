// The shared, ReDoS-safe tokenizer engine.
//
// Every language tokenizer is an ordered list of rules `{ type, re }` (or
// `{ expand, re }`), where each `re` is a STICKY (`y`) regex. `scan()` tries the
// rules at the current index; the first whose regex matches (consuming >=1 char)
// wins. Any run of characters no rule matches becomes a single `plain` token.
//
// Optional `when(source, i)` skips a rule; optional `consume(source, i)` returns
// `{ value }` without a sticky regex (still must advance ≥1 character).
//
// Because every rule is anchored at `lastIndex` (or consume) and consumes at
// least one character, scanning is linear in the input length — there is no
// cross-position backtracking. Rule regexes must themselves avoid nested
// unbounded quantifiers (no `(a+)+`) so a single rule can never backtrack
// catastrophically either.

/**
 * Try the ordered `rules` at index `i`. Returns `{ tokens, length, value }`
 * or `null` when nothing matches.
 */
export function matchRule(source, i, rules) {
  for (let r = 0; r < rules.length; r++) {
    const rule = rules[r];
    if (rule.when && !rule.when(source, i)) continue;
    let value;
    if (rule.consume) {
      const got = rule.consume(source, i);
      if (!got || !got.value || got.value.length === 0) continue;
      value = got.value;
    } else {
      rule.re.lastIndex = i;
      const m = rule.re.exec(source);
      if (!m || m[0].length === 0) continue;
      value = m[0];
    }
    const tokens = rule.expand ? rule.expand(value) : [{ type: rule.type, value }];
    return { tokens, length: value.length, value };
  }
  return null;
}

/**
 * Tokenize `source` with the ordered `rules`. Returns `{ type, value }[]`.
 * Guarantee: `tokens.map((t) => t.value).join('') === source` (lossless).
 */
export function scan(source, rules) {
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
  return coalesce(tokens);
}

/**
 * Merge adjacent tokens of the same type into one, cutting the DOM node count.
 * Lossless — values are concatenated in order.
 */
export function coalesce(tokens) {
  if (tokens.length < 2) return tokens;
  const out = [{ type: tokens[0].type, value: tokens[0].value }];
  for (let i = 1; i < tokens.length; i++) {
    const cur = tokens[i];
    const prev = out[out.length - 1];
    if (cur.type === prev.type) prev.value += cur.value;
    else out.push({ type: cur.type, value: cur.value });
  }
  return out;
}

/**
 * Build a sticky, word-boundaried alternation from a list of identifier words
 * (all `[A-Za-z0-9_]`, so no escaping needed). Longer words first so the
 * alternation is order-independent even without relying on `\b`.
 */
export function wordRegex(words, flags) {
  const sorted = [...words].sort((a, b) => b.length - a.length);
  return new RegExp('(?:' + sorted.join('|') + ')\\b', (flags || '') + 'y');
}
