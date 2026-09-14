// Multi-entry esbuild harness for @vanduo-oss/vdl-cbun.
//
// The root "." entry exports the VERSION-constants map. Every component ships
// an isolated subpath entry (esm + cjs), so importing one component never pulls
// in another (tree-shaking contract, verified below via the esbuild metafile).
//
// Contract: esm + cjs per component, `vue` external, es2020 target, sourcemaps,
// no minify, NO IIFE builds, hand-written .d.ts copied alongside, per-component
// styles.css copied to dist as vd3-<name>.css (hex-grid ships no CSS — canvas,
// themed via --vd-* tokens read with getComputedStyle). CSS filenames and
// class names are preserved from the vd3-cbun extract.

import * as esbuild from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');

const src = (path) => resolve(rootDir, 'src', path);
const dist = (path) => resolve(distDir, path);

// Collected metafiles from every esbuild pass, merged into dist/meta.json so
// tree-shaking can be verified downstream.
const metafiles = [];

function resetDistDirectory() {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
}

async function buildEntry(format, outfile, extra = {}) {
  const { entry = 'index.js', ...rest } = extra;
  const result = await esbuild.build({
    entryPoints: [resolve(rootDir, 'src', entry)],
    outfile: resolve(distDir, outfile),
    bundle: true,
    format,
    target: ['es2020'],
    sourcemap: true,
    minify: false,
    metafile: true,
    logLevel: 'warning',
    // `vue` is a required peer dependency — never bundled.
    external: ['vue'],
    ...rest,
  });
  metafiles.push({ label: `${outfile} [${format}]`, metafile: result.metafile });
  return result.metafile;
}

// ── BUILD MANIFEST ──────────────────────────────────────────────────────────
// Each component emits esm + cjs under dist/<component>/ plus its hand-written
// .d.ts set (index/core/vue, plus extras — the copied set must be
// self-consistent because dist/<name>/index.d.ts re-exports its siblings) and,
// where the component ships one, its stylesheet as vd3-<name>.css. hex-grid
// additionally exposes the pure hex-math module as a standalone subpath entry.
const COMPONENTS = [
  { name: 'code-editor', css: true, entries: ['index', 'highlight'] },
  { name: 'draw', css: true, entries: ['index'] },
  { name: 'hex-grid', css: false, entries: ['index', 'hex-math'] },
  { name: 'music-player', css: true, entries: ['index'] },
];

// The .d.ts files copied into dist/<component>/ for each component. index.d.ts
// is the subpath's public surface and re-exports ./core + ./vue, so all three
// must ride along; hex-grid also carries hex-math.d.ts (its own subpath's
// surface, referenced by core.d.ts), and draw carries shapes.d.ts (declares the
// four public constants index.d.ts re-exports from './shapes').
function declarationsFor(component) {
  const files = ['index.d.ts', 'core.d.ts', 'vue.d.ts'];
  if (component.name === 'hex-grid') files.push('hex-math.d.ts');
  if (component.name === 'draw') files.push('shapes.d.ts');
  if (component.name === 'code-editor') files.push('highlight.d.ts');
  return files;
}

async function buildComponent(component) {
  const { name, css, entries } = component;
  mkdirSync(dist(name), { recursive: true });

  for (const entry of entries) {
    await buildEntry('esm', `${name}/${entry}.js`, { entry: `${name}/${entry}.js` });
    await buildEntry('cjs', `${name}/${entry}.cjs`, { entry: `${name}/${entry}.js` });
  }

  for (const decl of declarationsFor(component)) {
    copyFileSync(src(`${name}/${decl}`), dist(`${name}/${decl}`));
  }

  if (css) {
    copyFileSync(src(`${name}/styles.css`), dist(`${name}/vd3-${name}.css`));
  }
}

// ── POST-BUILD GUARD 1: tree-shaking isolation ──────────────────────────────
// Every input of a component entry must live under src/<component>/ (the root
// entry: only src/index.js), and `vue` must appear solely as an external — no
// component may pull another component's code, and vue must never be bundled.
function toRel(p) {
  return relative(rootDir, resolve(rootDir, p)).replace(/^\.\//, '');
}

function assertIsolation() {
  const allowedByOutput = new Map();
  // root entry: only src/index.js
  allowedByOutput.set('index.js [esm]', 'src/index.js');
  for (const component of COMPONENTS) {
    for (const entry of component.entries) {
      allowedByOutput.set(`${component.name}/${entry}.js [esm]`, `src/${component.name}/`);
      allowedByOutput.set(`${component.name}/${entry}.cjs [cjs]`, `src/${component.name}/`);
    }
  }

  for (const { label, metafile } of metafiles) {
    const allowed = allowedByOutput.get(label);
    if (!allowed) {
      throw new Error(`[isolation] no allow-scope registered for build "${label}"`);
    }
    for (const input of Object.keys(metafile.inputs)) {
      const rel = toRel(input);
      if (rel.includes('node_modules')) {
        throw new Error(
          `[isolation] "${label}" bundled a node_modules input (${rel}); vue and all peers must stay external`,
        );
      }
      const ok = allowed.endsWith('/') ? rel.startsWith(allowed) : rel === allowed;
      if (!ok) {
        throw new Error(
          `[isolation] "${label}" pulled cross-scope input ${rel} (expected only ${allowed})`,
        );
      }
      if (
        (label.startsWith('code-editor/highlight.js') ||
          label.startsWith('code-editor/highlight.cjs')) &&
        /\/(core|vue)\.js$/.test(rel)
      ) {
        throw new Error(
          `[isolation] "${label}" pulled editor ${rel}; the highlight entry must stay tokenizer-only`,
        );
      }
    }
    // Positively confirm every external import resolved to `vue` (never anything else).
    for (const output of Object.values(metafile.outputs)) {
      for (const imp of output.imports ?? []) {
        if (imp.external && imp.path !== 'vue') {
          throw new Error(
            `[isolation] "${label}" externalized ${imp.path}; only vue may be external`,
          );
        }
      }
    }
  }
}

// ── POST-BUILD GUARD 2: every declared export target exists on disk ──────────
// A real guard against the exports map drifting away from what the build emits.
function collectExportTargets(node, out) {
  if (typeof node === 'string') {
    if (node.startsWith('./dist/')) out.add(node);
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectExportTargets(value, out);
  }
}

function assertExportsExist() {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
  const targets = new Set();
  collectExportTargets(pkg.exports, targets);
  const missing = [];
  for (const target of targets) {
    if (!existsSync(resolve(rootDir, target))) missing.push(target);
  }
  if (missing.length) {
    throw new Error(
      `[exports] ${missing.length} declared export target(s) missing from dist:\n  ${missing.join('\n  ')}`,
    );
  }
  return targets.size;
}

function writeMetafile() {
  const merged = { inputs: {}, outputs: {} };
  for (const { metafile } of metafiles) {
    Object.assign(merged.inputs, metafile.inputs);
    Object.assign(merged.outputs, metafile.outputs);
  }
  writeFileSync(dist('meta.json'), JSON.stringify(merged, null, 2));
}

async function build() {
  resetDistDirectory();

  // Root "." entry: VERSION-constants map only (esm; no cjs for the root).
  await buildEntry('esm', 'index.js');
  copyFileSync(src('index.d.ts'), dist('index.d.ts'));

  for (const component of COMPONENTS) {
    await buildComponent(component);
  }

  writeMetafile();

  assertIsolation();
  const exportCount = assertExportsExist();

  console.log(
    `Built @vanduo-oss/vdl-cbun: root + ${COMPONENTS.length} component entries; ` +
      `${exportCount} export targets verified on disk; isolation + vue-external checks passed.`,
  );
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
