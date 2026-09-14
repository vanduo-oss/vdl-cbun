// Highlight-rendering specs (plain node). Verifies escaping, the trailing-
// newline fix, token->string parity, and that renderTokensToDom builds nodes via
// createTextNode / textContent (never innerHTML) using an injected fake document.

import { describe, it, expect } from 'vitest';

import {
  escapeHtml,
  renderTokensToHtml,
  highlight,
  renderTokensToDom,
} from '../../src/code-editor/highlight.js';
import { tokenize } from '../../src/code-editor/tokenizer/index.js';

describe('escapeHtml', () => {
  it('escapes the five metacharacters', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});

describe('highlight — escaped string render', () => {
  it('never leaks a raw script tag', () => {
    const html = highlight(`<script>alert(1)</script>`, 'html');
    expect(html.includes('<script>')).toBe(false);
    // Stripping the editor's own token spans leaves only escaped source text.
    expect(html.replace(/<\/?span[^>]*>/g, '')).toContain('&lt;script&gt;');
  });

  it('token->html stripped of spans equals the escaped source', () => {
    const src = 'const x = "a<b>";';
    const html = renderTokensToHtml(tokenize(src, 'javascript'));
    expect(html.replace(/<\/?span[^>]*>/g, '')).toBe(escapeHtml(src));
  });

  it('does not append an extra trailing newline by default (snippet-safe)', () => {
    expect(highlight('a\n', 'plaintext')).toBe('a\n');
    expect(highlight('a', 'plaintext')).toBe('a');
    expect(highlight('', 'plaintext')).toBe('');
  });

  it('appends a textarea line-count newline when trailingNewline is true', () => {
    expect(highlight('a\n', 'plaintext', { trailingNewline: true })).toBe('a\n\n');
    expect(highlight('', 'plaintext', { trailingNewline: true })).toBe('\n');
    expect(highlight('a', 'plaintext', { trailingNewline: true })).toBe('a');
  });
});

describe('highlight subpath stays tokenizer-only', () => {
  it('re-exports tokenize and LANGUAGES from highlight.js', async () => {
    const mod = await import('../../src/code-editor/highlight.js');
    expect(typeof mod.highlight).toBe('function');
    expect(typeof mod.tokenize).toBe('function');
    expect(typeof mod.renderTokensToHtml).toBe('function');
    expect(Array.isArray(mod.LANGUAGES)).toBe(true);
  });

  it('source highlight + tokenizer modules do not import core.js or vue.js', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '../../src/code-editor');
    const files = [
      'highlight.js',
      'tokenizer/index.js',
      'tokenizer/html.js',
      'tokenizer/javascript.js',
      'tokenizer/css.js',
    ];
    for (const file of files) {
      const src = readFileSync(join(root, file), 'utf8');
      expect(src, file).not.toMatch(/from ['"]\.\/core\.js['"]/);
      expect(src, file).not.toMatch(/from ['"]\.\/vue\.js['"]/);
    }
  });
});

describe('renderTokensToDom — innerHTML-free, lossless', () => {
  function makeDoc() {
    return {
      createDocumentFragment() {
        return {
          childNodes: [] as Array<Record<string, unknown>>,
          appendChild(n: Record<string, unknown>) {
            this.childNodes.push(n);
          },
        };
      },
      createTextNode(value: string) {
        return { nodeType: 3, textContent: value };
      },
      createElement(tag: string) {
        return { tag, className: '', textContent: '', appendChild() {} };
      },
    };
  }

  it('reconstructs the source from text/span nodes and classes every span', () => {
    const src = 'const x = 1; // hi';
    const frag = renderTokensToDom(tokenize(src, 'javascript'), makeDoc() as never) as unknown as {
      childNodes: Array<{ tag?: string; className?: string; textContent: string }>;
    };
    const joined = frag.childNodes.map((n) => n.textContent).join('');
    expect(joined).toBe(src);
    const spans = frag.childNodes.filter((n) => n.tag === 'span');
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every((s) => /^vd-tk-/.test(s.className ?? ''))).toBe(true);
  });
});
