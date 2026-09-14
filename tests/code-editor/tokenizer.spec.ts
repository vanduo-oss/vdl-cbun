// Tokenizer specs (plain node — the tokenizers are DOM-free). Covers the two
// load-bearing guarantees: losslessness (token values rebuild the source) and
// linear-time / ReDoS safety on adversarial input, plus dispatch + a little
// classification.

import { describe, it, expect } from 'vitest';

import {
  tokenize,
  LANGUAGES,
  resolveLanguage,
  getTokenizer,
} from '../../src/code-editor/tokenizer/index.js';

const SAMPLES: Record<string, string> = {
  javascript: `// c\nconst x = "a\\"b"; let y = \`t\${z}\`;\nconst re = /foo/g;\nfunction foo(a, b) { return a + b; }\nconst n = 0xFF + 1_000 + 3.14e-2;\nif (x === true) console.log(y);`,
  typescript: `interface P { name: string; age?: number }\nconst f = (x: number): boolean => x > 0;\ntype T = keyof P;`,
  html: `<!DOCTYPE html>\n<!-- c -->\n<div class="a" id='b' data-x>text &amp; more</div>\n<script>const x = 1;</script>\n<style>.a { color: red; }</style>\n<img src="x>y"/>`,
  vue: `<script setup lang="ts">\nconst n: number = 1;\n</script>\n<template>\n  <div v-if="ok" @click="go" :class="c">{{ n }}</div>\n</template>\n<style>\n.a:hover { color: var(--vd-bg); }\n</style>\n`,
  css: `/* c */\n.a > .b:hover { color: #fff; width: 10px; margin: 0 auto !important; --vd-bg: #111; }\n@media (min-width: 40rem) { a { color: rgb(1,2,3); } }`,
  json: `{ "key": "value", "n": -3.5e2, "ok": true, "nil": null, "arr": [1, 2] }`,
  markdown: `# Head\n\n- item **bold** _it_\n\n> quote\n\n\`\`\`js\ncode\n\`\`\`\n[link](http://x)`,
  shell: `#!/bin/bash\n# c\nfor f in *.txt; do\n  echo "\${f}" | grep -i foo --color\ndone`,
  python: `# c\n@deco\ndef fn(x: int) -> str:\n    s = f"val {x}"\n    return None if x else True`,
};

describe('tokenize — losslessness', () => {
  for (const [lang, src] of Object.entries(SAMPLES)) {
    it(`${lang}: token values rebuild the source`, () => {
      expect(
        tokenize(src, lang)
          .map((t) => t.value)
          .join(''),
      ).toBe(src);
    });
  }

  it('is lossless on edge inputs across every language', () => {
    const edge = ['', '\n', 'a\n', '"unterminated', '/* open', '`tmpl', '   \t  ', '日本語 ↯'];
    for (const lang of LANGUAGES) {
      for (const src of edge) {
        expect(
          tokenize(src, lang)
            .map((t) => t.value)
            .join(''),
        ).toBe(src);
      }
    }
  });
});

describe('tokenize — dispatch', () => {
  it('resolves aliases to canonical ids', () => {
    expect(resolveLanguage('js')).toBe('javascript');
    expect(resolveLanguage('TS')).toBe('typescript');
    expect(resolveLanguage('py')).toBe('python');
    expect(resolveLanguage('bash')).toBe('shell');
    expect(resolveLanguage('jsx')).toBe('javascript');
    expect(resolveLanguage('tsx')).toBe('typescript');
    expect(resolveLanguage('jsonc')).toBe('json');
    expect(resolveLanguage('vue')).toBe('vue');
    expect(resolveLanguage(undefined as unknown as string)).toBe('plaintext');
  });

  it('treats jsx/tsx/jsonc as aliases, not canonical languages', () => {
    expect(LANGUAGES).toContain('vue');
    expect(LANGUAGES).not.toContain('jsx');
    expect(LANGUAGES).not.toContain('tsx');
    expect(LANGUAGES).not.toContain('jsonc');
  });

  it('returns a tokenizer for each registered language', () => {
    for (const lang of LANGUAGES) {
      if (lang === 'plaintext') continue;
      expect(typeof getTokenizer(lang)).toBe('function');
    }
  });

  it('falls back to a single plain token for an unknown language', () => {
    expect(tokenize('hello world', 'no-such-lang')).toEqual([
      { type: 'plain', value: 'hello world' },
    ]);
  });

  it('returns [] for empty source', () => {
    expect(tokenize('', 'javascript')).toEqual([]);
  });
});

describe('tokenize — classification', () => {
  const typesOf = (src: string, lang: string, want: string) =>
    tokenize(src, lang)
      .filter((t) => t.type === want)
      .map((t) => t.value);

  it('classifies js keywords, strings, comments', () => {
    expect(typesOf('const x = "hi"; // c', 'javascript', 'keyword')).toContain('const');
    expect(typesOf('const x = "hi"; // c', 'javascript', 'string')).toContain('"hi"');
    expect(typesOf('const x = "hi"; // c', 'javascript', 'comment')[0]).toContain('// c');
  });

  it('classifies json keys as property and values as string', () => {
    const t = tokenize('{"k":"v"}', 'json');
    expect(t.find((k) => k.value === '"k"')?.type).toBe('property');
    expect(t.find((k) => k.value === '"v"')?.type).toBe('string');
  });

  it('classifies html tag names and attributes', () => {
    const t = tokenize('<div class="a">', 'html');
    expect(t.some((k) => k.type === 'tag' && k.value === 'div')).toBe(true);
    expect(t.some((k) => k.type === 'attribute' && k.value === 'class')).toBe(true);
    expect(t.some((k) => k.type === 'string' && k.value === '"a"')).toBe(true);
  });

  it('classifies unterminated comments and strings to EOF (not plain)', () => {
    // Byte-losslessness is covered elsewhere; here we assert the token TYPE the
    // highlighter depends on — the exact edge highlighters tend to get wrong.
    expect(tokenize('/* open', 'css').at(-1)?.type).toBe('comment');
    expect(tokenize('/* open', 'javascript').at(-1)?.type).toBe('comment');
    expect(tokenize('const s = "abc', 'javascript').at(-1)?.type).toBe('string');
  });

  it('embeds HTML script/style bodies as JS/CSS', () => {
    const t = tokenize('<script>const x = 1;</script><style>.a { color: red; }</style>', 'html');
    expect(t.some((k) => k.type === 'keyword' && k.value === 'const')).toBe(true);
    expect(t.some((k) => k.type === 'property' && k.value === 'color')).toBe(true);
  });

  it('tokenizes Vue SFC script setup lang=ts and style', () => {
    const src = `<script setup lang="ts">\nconst n: number = 1;\n</script>\n<style>\n.a { color: red; }\n</style>`;
    const t = tokenize(src, 'vue');
    expect(t.map((k) => k.value).join('')).toBe(src);
    expect(t.some((k) => k.type === 'keyword' && k.value === 'const')).toBe(true);
    expect(t.some((k) => k.type === 'keyword' && k.value === 'number')).toBe(true);
    expect(t.some((k) => k.type === 'property' && k.value === 'color')).toBe(true);
  });

  it('classifies Vue mustache and v-/@/: bindings as meta', () => {
    const t = tokenize('<div v-if="ok" @click="go" :class="c">{{ n }}</div>', 'vue');
    expect(t.some((k) => k.type === 'meta' && k.value === 'v-if')).toBe(true);
    expect(t.some((k) => k.type === 'meta' && k.value === '@click')).toBe(true);
    expect(t.some((k) => k.type === 'meta' && k.value === ':class')).toBe(true);
    expect(t.some((k) => k.type === 'meta' && k.value === '{{')).toBe(true);
    expect(t.some((k) => k.type === 'meta' && k.value === '}}')).toBe(true);
  });

  it('emits regex tokens and template-literal interpolations', () => {
    const re = tokenize('const re = /foo/g;', 'javascript');
    expect(re.some((k) => k.type === 'regex' && k.value === '/foo/g')).toBe(true);
    const tmpl = tokenize('let y = `t${z}`;', 'javascript');
    expect(tmpl.map((k) => k.value).join('')).toBe('let y = `t${z}`;');
    expect(tmpl.some((k) => k.type === 'operator' && k.value === '${')).toBe(true);
    expect(tmpl.some((k) => k.value === 'z')).toBe(true);
    expect(tmpl.some((k) => k.type === 'punctuation' && k.value === '}')).toBe(true);
    expect(tokenize('x / y', 'javascript').some((k) => k.type === 'regex')).toBe(false);
  });

  it('classifies CSS selectors, pseudos, and custom properties', () => {
    const t = tokenize('.a:hover { color: red; --vd-bg: #fff; }', 'css');
    expect(t.some((k) => k.type === 'attribute' && k.value === '.a')).toBe(true);
    expect(t.some((k) => k.type === 'meta' && k.value === ':hover')).toBe(true);
    expect(t.some((k) => k.type === 'property' && k.value === 'color')).toBe(true);
    expect(t.some((k) => k.type === 'property' && k.value === '--vd-bg')).toBe(true);
    expect(t.some((k) => k.type === 'property' && k.value === 'a')).toBe(false);
  });

  it('classifies python keywords, decorators, builtins, and triple quotes', () => {
    const src = `@deco\ndef fn():\n  if True:\n    return None\n  else:\n    for x in range(len(s)):\n      print(x)\n  import sys\n  class C: pass\n  # comment\n  """text"""\n  f"val {x}"\n  42\n  3.14`;
    const kw = typesOf(src, 'python', 'keyword');
    expect(kw).toEqual(
      expect.arrayContaining(['def', 'return', 'if', 'else', 'for', 'import', 'class', 'pass']),
    );
    // None → null type, True → boolean type
    expect(typesOf(src, 'python', 'null')).toContain('None');
    expect(typesOf(src, 'python', 'boolean')).toContain('True');
    expect(typesOf(src, 'python', 'meta')).toContain('@deco');
    expect(typesOf(src, 'python', 'builtin')).toEqual(
      expect.arrayContaining(['print', 'len', 'range']),
    );
    expect(typesOf(src, 'python', 'string')).toContain('"""text"""');
    expect(typesOf(src, 'python', 'string').some((s) => s.includes('"'))).toBe(true);
    expect(typesOf(src, 'python', 'comment').some((c) => c.includes('# comment'))).toBe(true);
    expect(typesOf(src, 'python', 'number')).toEqual(expect.arrayContaining(['42', '3.14']));
  });

  it('classifies shell keywords, variables, flags, and builtins', () => {
    const src = `for x in y; do\n  if [ -f $VAR ]; then\n    echo "string"\n    grep --flag\n  fi\ndone\nwhile true; do case x in esac; done\ngit npm\n# comment\n\${VAR}`;
    const kw = typesOf(src, 'shell', 'keyword');
    expect(kw).toEqual(
      expect.arrayContaining(['for', 'do', 'done', 'if', 'then', 'fi', 'while', 'case']),
    );

    const v = typesOf(src, 'shell', 'variable');
    expect(v.some((s) => s.includes('$VAR'))).toBe(true);
    expect(v.some((s) => s.includes('${VAR}'))).toBe(true);

    // Shell flags include leading whitespace in the token value.
    const attr = typesOf(src, 'shell', 'attribute');
    expect(attr.some((s) => s.includes('-f'))).toBe(true);
    expect(attr.some((s) => s.includes('--flag'))).toBe(true);

    const b = typesOf(src, 'shell', 'builtin');
    expect(b).toEqual(expect.arrayContaining(['echo', 'grep', 'git', 'npm']));

    expect(typesOf(src, 'shell', 'comment').some((c) => c.includes('# comment'))).toBe(true);
    expect(typesOf(src, 'shell', 'string')).toContain('"string"');
  });

  it('classifies markdown headers, code fences, and formatting', () => {
    const src = `# Header\n\n\`\`\`js\ncode\n\`\`\`\n> quote\n**bold** _italic_ *italic*\n[link](url)`;
    expect(typesOf(src, 'markdown', 'keyword').some((k) => k.includes('# Header'))).toBe(true);
    // Code fences are a single string token including the body.
    expect(typesOf(src, 'markdown', 'string').some((s) => s.includes('```'))).toBe(true);
    // Blockquotes classify as comment.
    expect(typesOf(src, 'markdown', 'comment').some((c) => c.includes('> quote'))).toBe(true);
    // Bold uses operator tokens.
    expect(typesOf(src, 'markdown', 'operator').some((o) => o.includes('**'))).toBe(true);
    // Italic uses meta tokens.
    expect(typesOf(src, 'markdown', 'meta').some((m) => m.includes('*') || m.includes('_'))).toBe(
      true,
    );
    // Links classify as function.
    expect(typesOf(src, 'markdown', 'function').length).toBeGreaterThan(0);
  });

  it('classifies typescript-specific keywords', () => {
    const src = `interface P { name: string; }\ntype T = keyof P;\nenum E { A, B }\ndeclare const x: number;\nnamespace N {}\nreadonly satisfies implements function return`;
    const kw = typesOf(src, 'typescript', 'keyword');
    expect(kw).toEqual(
      expect.arrayContaining([
        'interface',
        'type',
        'enum',
        'declare',
        'namespace',
        'readonly',
        'keyof',
        'satisfies',
        'implements',
        'const',
        'function',
        'return',
      ]),
    );
  });

  it('classifies json numbers, booleans, and null', () => {
    const src = `[true, false, null, 42, -3.5e2]`;
    // JSON uses boolean/null token types, not a generic literal type.
    expect(typesOf(src, 'json', 'boolean')).toEqual(expect.arrayContaining(['true', 'false']));
    expect(typesOf(src, 'json', 'null')).toContain('null');
    expect(typesOf(src, 'json', 'number')).toContain('42');
  });

  it('classifies css at-rules, hex colors, units, and important', () => {
    const src = `@media (min-width: 40rem) { .a { color: #fff; width: 10px; } }\n!important`;
    const meta = typesOf(src, 'css', 'meta');
    expect(meta).toContain('@media');

    // CSS numbers include the unit suffix as part of the token value.
    const num = typesOf(src, 'css', 'number');
    expect(num).toEqual(expect.arrayContaining(['#fff', '10px', '40rem']));

    const kw = typesOf(src, 'css', 'keyword');
    expect(kw).toContain('!important');
  });
});

describe('tokenize — ReDoS safety (linear on adversarial input)', () => {
  const R = 200000;
  const cases: Array<[string, string]> = [
    ['javascript', '"' + 'a'.repeat(R)],
    ['javascript', '/*' + '*'.repeat(R)],
    ['css', '/*' + 'a'.repeat(R)],
    ['css', 'a'.repeat(R)],
    ['css', '-a'.repeat(R / 2)],
    ['html', '<' + 'a'.repeat(R)],
    ['html', '<a ' + 'b'.repeat(R)],
    ['html', '<script>' + 'a'.repeat(R) + '</script>'],
    ['vue', '<script>' + 'a'.repeat(R) + '</script>'],
    ['javascript', '/' + 'a'.repeat(R)],
    ['javascript', '/' + '['.repeat(R)],
    ['python', 'a'.repeat(R)],
    ['python', '"""' + 'x'.repeat(R)],
    ['markdown', '['.repeat(R)],
    ['shell', 'a'.repeat(R)],
    ['json', '"' + 'a'.repeat(R)],
  ];

  for (const [lang, src] of cases) {
    it(`${lang} stays linear on ${JSON.stringify(src.slice(0, 4))}…`, () => {
      const t0 = performance.now();
      const joined = tokenize(src, lang)
        .map((t) => t.value)
        .join('');
      const ms = performance.now() - t0;
      expect(joined).toBe(src);
      expect(ms).toBeLessThan(500);
    });
  }
});
