# code-editor Specification

## Purpose
Vue code editor, framework-agnostic core, and the snippet-safe highlighter
subpath on `./code-editor` and `./code-editor/highlight`.
## Requirements
### Requirement: code-editor subpath exports the Vue wrapper and framework-agnostic core

The `./code-editor` subpath entry SHALL export `VdCodeEditor` (the Vue 3 wrapper) as its primary surface, alongside the framework-agnostic core (aliased `VdCodeEditorCore`), the `VD_CODE_EDITOR_VERSION` constant, and the pure `tokenize`, `highlight`, and `LANGUAGES` helpers. The entry MUST use named exports only (no `export default`), and the core MUST NOT import `vue`.

#### Scenario: consumer imports wrapper and core from the subpath

- **GIVEN** a Vue 3 project with `@vanduo-oss/vdl-cbun` installed
- **WHEN** it executes `import { VdCodeEditor, VdCodeEditorCore, VD_CODE_EDITOR_VERSION, tokenize, highlight, LANGUAGES } from '@vanduo-oss/vdl-cbun/code-editor'`
- **THEN** `VdCodeEditor` is a mountable Vue component, `new VdCodeEditorCore({ element })` constructs a working editor, and `tokenize`/`highlight`/`LANGUAGES` are the pure tokenizer helpers — all named exports with no default

#### Scenario: core is framework-agnostic

- **GIVEN** the built `./code-editor` entry
- **WHEN** the core module's imports are inspected
- **THEN** it imports no `vue` symbol — only the thin `vue.js` wrapper depends on `vue`, which stays external

### Requirement: textarea-overlay editing model

`VdCodeEditor` SHALL provide editing through a native `<textarea>` rendered transparently over a `<pre>` highlight layer; all caret movement, selection, IME composition, clipboard, and undo/redo MUST be served by the native control. It MUST NOT use `contenteditable`, a custom text buffer, or virtual scrolling.

#### Scenario: native editing drives a synchronized highlight layer

- **GIVEN** a mounted `VdCodeEditor`
- **WHEN** the user types, selects text, and scrolls
- **THEN** the visible caret and selection come from the native `<textarea>`, and the `<pre>` highlight layer stays scroll- and glyph-aligned beneath it

### Requirement: eight first-party language tokenizers

The component SHALL ship first-party tokenizers for JavaScript/TypeScript, HTML,
Vue SFC, CSS, JSON, Markdown, Shell, and Python, each a pure module under
`src/code-editor/`. No third-party highlighting library and no npm runtime
dependency may be introduced. `tokenize(source, language)` MUST return an
ordered array of `{ type, value }` tokens. An UNTERMINATED block construct — a
`/*` comment or an opening string quote with no closer — MUST classify to
end-of-input as its construct type (`comment` / `string`), never as `plain`.

#### Scenario: each language tokenizes to typed tokens

- **GIVEN** a source string in any supported language
- **WHEN** `tokenize(source, language)` runs
- **THEN** it returns an ordered array of `{ type, value }` tokens whose `type`
  is one of the documented token types

#### Scenario: unknown language falls back to plain

- **GIVEN** a `language` id with no registered tokenizer
- **WHEN** the source is tokenized
- **THEN** it yields a single `plain` token spanning the source and never throws

#### Scenario: an unterminated block comment classifies to EOF as a comment

- **GIVEN** a source ending in an unterminated `/*` block comment (no closing `*/`)
- **WHEN** `tokenize(source, language)` runs for CSS or JavaScript
- **THEN** the trailing token has type `comment` spanning to end-of-input, not
  `plain`

### Requirement: lossless, escaped, innerHTML-free highlight rendering

Tokenization MUST be lossless — the concatenation of token values equals the source exactly — and rendering MUST escape all text and build DOM via node APIs (`createElement` / `createTextNode` / `replaceChildren`), never assigning source text to `innerHTML`.

#### Scenario: token stream reconstructs the source

- **GIVEN** any source string and supported language
- **WHEN** it is tokenized
- **THEN** `tokens.map((t) => t.value).join('')` equals the original source byte-for-byte

#### Scenario: HTML metacharacters cannot inject markup

- **GIVEN** source containing `<script>`, `&`, and quote characters
- **WHEN** the highlight layer renders it
- **THEN** those characters appear as visible text, the DOM contains only the editor's own `<span>` and text nodes, and no `innerHTML` assignment of source text occurs

### Requirement: ReDoS-safe tokenization

Every tokenizer MUST run in time linear in the input length on all inputs, including adversarial ones. Tokenizer regexes MUST avoid catastrophic backtracking (no nested unbounded quantifiers).

#### Scenario: pathological input completes in linear time

- **GIVEN** adversarial inputs — an unterminated string of 100k identical characters, an unterminated block comment, and deeply nested brackets
- **WHEN** any tokenizer processes them
- **THEN** it completes quickly and linearly, exhibiting no catastrophic backtracking

### Requirement: snippet-safe highlight string API

`highlight(source, language, options?)` SHALL tokenize `source` and return an
escaped HTML string of `vd-tk-*` spans. It MUST escape `& < > " '`. It MUST NOT
append an extra trailing newline by default — including when `source` already
ends with `\n` — so the result is safe to place inside `<pre>` without a doubled
blank line. When `options.trailingNewline` is `true`, it MUST append one extra
`\n` if `source` is empty or already ends with `\n` (textarea line-count).
`renderTokensToHtml(tokens)` SHALL be a public export that performs the escaped
span render without tokenizing or adding newlines. The editor overlay MUST keep
using `renderTokensToDom` plus its own trailing-newline text node and MUST NOT
depend on the string `highlight()` default.

#### Scenario: default highlight is snippet-safe

- **GIVEN** source `'a\n'` and language `'plaintext'`
- **WHEN** `highlight('a\n', 'plaintext')` runs with no options
- **THEN** the result is `'a\n'` (exactly one trailing newline, from the source)

#### Scenario: trailingNewline restores the overlay string

- **GIVEN** source `'a\n'` or `''`
- **WHEN** `highlight(source, 'plaintext', { trailingNewline: true })` runs
- **THEN** the result is `'a\n\n'` or `'\n'` respectively

#### Scenario: HTML metacharacters stay escaped

- **GIVEN** source containing `<script>`, `&`, and quote characters
- **WHEN** `highlight(source, language)` runs
- **THEN** the returned string contains no raw `<script>` tag and the
  span-stripped text equals `escapeHtml(source)`

### Requirement: tokenizer-only highlight subpath

The package SHALL export `@vanduo-oss/vdl-cbun/code-editor/highlight` as a
tokenizer-only entry that provides `highlight`, `tokenize`, `LANGUAGES`, and
`renderTokensToHtml`. Evaluating that entry MUST NOT load `src/code-editor/core.js`
or `src/code-editor/vue.js`. The existing `./code-editor` entry MUST keep
re-exporting the same helpers (plus the Vue wrapper and core).

#### Scenario: highlight subpath does not evaluate the editor

- **GIVEN** the built `./code-editor/highlight` entry
- **WHEN** its esbuild metafile inputs are inspected
- **THEN** every input is under `src/code-editor/`, none is `core.js` or
  `vue.js`, and `vue` is not imported

### Requirement: Vue SFC tokenizer and HTML embedded languages

`vue` SHALL be a canonical language (not an `html` alias) that tokenizes a
single-file component: `<script>` / `<script setup lang="ts">` bodies as
JavaScript / TypeScript, `<style>` bodies as CSS, and the remaining template as
HTML. HTML SHALL embed `<script>` / `<style>` bodies the same way. Vue template
`{{ }}` interpolations and `v-*` / `@event` / `:bind` attributes MUST classify
as `meta` (or, for mustache inner expressions, the JS token types), not `plain`.
`jsx`, `tsx`, and `jsonc` MUST remain aliases of `javascript`, `typescript`, and
`json` respectively and MUST be documented as fallbacks, not dedicated grammars.

#### Scenario: Vue SFC script and style embed

- **GIVEN** a Vue SFC with `<script setup lang="ts">const n: number = 1;</script>`
  and a `<style>` block containing a CSS rule
- **WHEN** `tokenize(source, 'vue')` runs
- **THEN** `const` / `number` classify as `keyword` and the style body uses CSS
  token types, and token values concatenate back to `source`

#### Scenario: HTML script and style embed

- **GIVEN** HTML containing `<script>const x = 1;</script>` and
  `<style>.a { color: red; }</style>`
- **WHEN** `tokenize(source, 'html')` runs
- **THEN** `const` is a `keyword` and `color` is a `property`

#### Scenario: Vue template extras

- **GIVEN** `<div v-if="ok" @click="go" :class="c">{{ n }}</div>`
- **WHEN** tokenized as `vue`
- **THEN** `v-if`, `@click`, `:class`, and the `{{` / `}}` fences classify as
  `meta`

#### Scenario: jsx tsx jsonc are aliases

- **GIVEN** language ids `jsx`, `tsx`, and `jsonc`
- **WHEN** they are resolved
- **THEN** they map to `javascript`, `typescript`, and `json` and do not appear
  as canonical `LANGUAGES` entries

### Requirement: JavaScript template interpolation and regex tokens

The JavaScript / TypeScript tokenizers SHALL emit `punctuation` (or `operator`)
tokens for `${` / `}` interpolations inside template literals, with the inner
expression tokenized as JavaScript, and SHALL emit `regex` tokens for
`/pattern/flags` literals in regex position (not after an identifier or number,
where `/` remains division). Tokenization MUST stay lossless and linear.

#### Scenario: template literal interpolation

- **GIVEN** source `` `t${z}` ``
- **WHEN** tokenized as `javascript`
- **THEN** the stream includes a `${` token, an inner `z`, and a `}` token, and
  joining token values equals the source

#### Scenario: regex literal is type regex

- **GIVEN** source `const re = /foo/g;`
- **WHEN** tokenized as `javascript`
- **THEN** `/foo/g` has type `regex`

### Requirement: CSS selectors, pseudos, and custom properties

The CSS tokenizer SHALL classify class/id selectors (`.a`, `#id`) as
`attribute`, pseudo-classes/elements (`:hover`, `::before`) as `meta`, and
custom properties (`--vd-*`) as `property`. A known property name MUST classify
as `property` only when followed by `:`. `.a:hover` MUST NOT mark `a` as
`property`.

#### Scenario: hover selector is not a property

- **GIVEN** source `.a:hover { color: red; --vd-bg: #fff; }`
- **WHEN** tokenized as `css`
- **THEN** `.a` is `attribute`, `:hover` is `meta`, `color` and `--vd-bg` are
  `property`, and `a` is not a `property` token

### Requirement: v1 editor feature set

The editor SHALL provide, by default: a line-number gutter with active-line highlight; auto-indent on Enter, Tab inserting spaces, and auto-close of brackets/quotes; a read-only mode and a copy-to-clipboard control; an empty-state placeholder; and a large-input performance guard that debounces repaint and skips tokenizing above a configurable size threshold. Each feature MUST be individually controllable via props.

#### Scenario: default editor shows a gutter, indents, and auto-closes

- **GIVEN** a default `VdCodeEditor`
- **WHEN** the user presses Enter inside an indented block, presses Tab, and types an opening bracket
- **THEN** the new line preserves the indentation, Tab inserts spaces, and a matching closing bracket is inserted

#### Scenario: read-only blocks editing but allows copy

- **GIVEN** `VdCodeEditor` with `readOnly` true
- **WHEN** the user attempts to type
- **THEN** the content does not change, while the copy-to-clipboard control still copies the current value

#### Scenario: large input degrades to plain rendering

- **GIVEN** content longer than `maxHighlightLength`
- **WHEN** it is rendered
- **THEN** highlighting is skipped (plain escaped text) and editing stays responsive

### Requirement: SSR-safe lifecycle

The wrapper MUST be safe to render under SSR / prerendering: on the server it emits an inert container and touches no DOM; all DOM creation, listeners, observers, and font/measure work happen only after mount and MUST be released on unmount.

#### Scenario: server render touches no DOM

- **GIVEN** the component rendered in a non-browser (SSR) environment
- **WHEN** it renders
- **THEN** it produces a container element without accessing `document` / `window`, and hydrates into a working editor on the client in `onMounted`

#### Scenario: unmount releases resources

- **GIVEN** a mounted editor with listeners and a `ResizeObserver`
- **WHEN** the component unmounts
- **THEN** `destroy()` removes every listener and observer and clears any timers

### Requirement: theming via --vd-* tokens and a css subpath

The component's stylesheet SHALL be exposed at `./code-editor/css` (built to `dist/code-editor/vd3-code-editor.css`) and MUST theme through component-scoped `--vd-code-editor-*` custom properties layered over `--vd-*` tokens with sensible fallbacks, so it adapts to the active Vanduo palette / theme without JavaScript.

#### Scenario: css subpath resolves to the built stylesheet

- **GIVEN** a bundler honoring the `exports` map
- **WHEN** a consumer imports `@vanduo-oss/vdl-cbun/code-editor/css`
- **THEN** it resolves to `./dist/code-editor/vd3-code-editor.css`

#### Scenario: colors follow the active theme tokens

- **GIVEN** an ancestor exposing `--vd-*` tokens (for example `data-theme="dark"`)
- **WHEN** the editor renders
- **THEN** its surface and syntax colors derive from `--vd-code-editor-*` vars over those tokens, falling back gracefully when a token is absent

### Requirement: version constant matches the manifest

`VD_CODE_EDITOR_VERSION` SHALL be `'1.1.0'` and MUST equal both
`component-versions.json['code-editor']` and `VDL_CBUN_VERSIONS['code-editor']`.

#### Scenario: the three version sites agree

- **GIVEN** the manifest, the frozen root `VDL_CBUN_VERSIONS` map, and the
  exported `VD_CODE_EDITOR_VERSION`
- **WHEN** the smoke test compares them
- **THEN** all three equal `'1.1.0'`, and the test fails on any drift
