// Type-level smoke test for the four vdl-cbun subpath type surfaces (+ highlight) — charts/flowchart live in dedicated packages. Run via
// `pnpm test:types` (tsc --noEmit -p tests/types/tsconfig.json). Named
// `.test-d.ts` so Playwright/vitest ignore it. Imports resolve the package's
// own "exports" map (self-reference) → the built dist/<name>/*.d.ts, so this
// exercises the actual PUBLISHED declaration surfaces. If a hand-written
// declaration is wrong (missing method, wrong return type, mistyped VERSION
// constant), this file fails to compile and the gate goes red.

/* ===========================================================================
 * hex-grid — @vanduo-oss/vdl-cbun/hex-grid  (+ ./hex-grid/hex-math)
 * ======================================================================== */
import {
  VdHexGridCore,
  VD_HEX_VERSION,
  VdHexGrid as VdHexGridVue,
  type VdHexGridOptions,
  type HexCell,
  type HexRenderStats,
  type VdHexGridEventMap,
  type VdHexGridProps,
} from '@vanduo-oss/vdl-cbun/hex-grid';
import {
  rotatePoint,
  unrotatePoint,
  hexToPixel,
  pixelToHex,
  axialRound,
  getHexCorners,
  getAdjacentHexes,
  hexDistance,
  getTerrainColor,
  isPassable,
  getMovementCost,
  getTerrainYields,
  TerrainType,
  TERRAIN_COLORS,
  DEFAULT_TERRAIN_COLOR,
  type Point,
  type AxialCoord,
  type TerrainYield,
  type TerrainTypeValue,
} from '@vanduo-oss/vdl-cbun/hex-grid/hex-math';

const gridOptions: VdHexGridOptions = {
  element: document.createElement('div'),
  size: 30,
  width: 10,
  height: 10,
  rotation: 0,
  pixelRatio: 'auto',
  cull: true,
};
const grid = new VdHexGridCore(gridOptions);
const gridStaticVersion: string = VdHexGridCore.VERSION;
grid.setSize(20);
grid.setDimensions(6, 4);
grid.setRotation(Math.PI / 4);
const gridRotation: number = grid.getRotation();
const hex: HexCell | undefined = grid.getHex(0, 0);
const hexCount: number = grid.getHexCount();
const path: AxialCoord[] = grid.getPath(0, 0, 2, 2);
const gridVisible: HexCell[] = grid.getVisibleHexes();
const gridStats: HexRenderStats = grid.getRenderStats();
const gridMode: 'sharp' | 'fast' = gridStats.mode;
const gridLastRenderMs: number = gridStats.lastRenderMs;
grid.setPixelRatio(2);
grid.setPixelRatio('auto');
grid.setCull(false);

// Typed events via the event map.
grid.on('select', (data: VdHexGridEventMap['select']) => void data.q);
grid.on('zoom', (data: VdHexGridEventMap['zoom']) => void data.scale);
grid.destroy();

// hex-math is a pure module (no DOM) — round-trip + terrain tables.
const p: Point = rotatePoint(1, 2, 0.5);
const p2: Point = unrotatePoint(p.x, p.y, 0.5);
const pix: Point = hexToPixel(1, 1, 30);
const axial: AxialCoord = pixelToHex(pix.x, pix.y, 30);
const rounded: AxialCoord = axialRound(0.4, -0.6);
const corners: Point[] = getHexCorners(0, 0, 30);
const neighbours: AxialCoord[] = getAdjacentHexes(0, 0);
const dist: number = hexDistance(0, 0, 2, 1);
const terrainKind: TerrainTypeValue = TerrainType.GRASSLAND;
const terrainColor: string = getTerrainColor(terrainKind);
const paletteColor: string = TERRAIN_COLORS[terrainKind];
const fallbackColor: string = DEFAULT_TERRAIN_COLOR;
const passable: boolean = isPassable(terrainKind);
const moveCost: number = getMovementCost(terrainKind);
const terrainYield: TerrainYield = getTerrainYields(terrainKind);
const yieldFood: number = terrainYield.food;

// VERSION constant is typed as string.
const hexVersion: string = VD_HEX_VERSION;

// Vue component prop types.
const hexProps: VdHexGridProps = {
  size: 24,
  width: 8,
  height: 6,
  rotation: 0.2,
  pixelRatio: 'auto',
  cull: false,
};
// @ts-expect-error — `size` is a number, not a string.
const badHexProps: VdHexGridProps = { size: 'big' };

/* ===========================================================================
 * music-player — @vanduo-oss/vdl-cbun/music-player
 * ======================================================================== */
import {
  MusicPlayer,
  VD_MUSIC_PLAYER_VERSION,
  VdMusicPlayer as VdMusicPlayerVue,
  type MusicPlayerState,
  type MusicPlayerOptions,
  type MusicPlayerTrack,
  type MusicPlayerRepeatMode,
  type VdMusicPlayerProps,
} from '@vanduo-oss/vdl-cbun/music-player';

const container = document.createElement('div');
const tracks: MusicPlayerTrack[] = [{ name: 'One', url: '/one.mp3' }];
const playerOptions: MusicPlayerOptions = {
  tracks,
  volume: 0.5,
  shuffle: false,
  repeat: 'all',
  floatingPosition: 'bottom-right',
};

// State machine surface — the container-scoped API object.
MusicPlayer.initPlayer(container, playerOptions);
MusicPlayer.play(container);
MusicPlayer.toggle(container);
MusicPlayer.next(container);
MusicPlayer.previous(container);
MusicPlayer.setVolume(container, 0.8);
MusicPlayer.setTrack(container, 0);
MusicPlayer.setRepeat(container, 'one' satisfies MusicPlayerRepeatMode);
MusicPlayer.minimize(container);
MusicPlayer.expand(container);
const state: MusicPlayerState | null = MusicPlayer.getState(container);
const isPlaying: boolean | undefined = state?.isPlaying;
MusicPlayer.destroy(container);
MusicPlayer.destroyAll();
const playerApiVersion: string = MusicPlayer.version;

// VERSION constant is typed as string.
const musicVersion: string = VD_MUSIC_PLAYER_VERSION;

// Vue component prop types.
const musicProps: VdMusicPlayerProps = { tracks: [{ name: 'a', url: '/a.mp3' }] };
// @ts-expect-error — a track requires both `name` and `url`.
const badMusicProps: VdMusicPlayerProps = { tracks: [{ name: 'a' }] };
// @ts-expect-error — the vanilla DOM-scanning `init(root)` was excised; only initPlayer(container) remains.
MusicPlayer.init(document.body);

/* ===========================================================================
 * code-editor — @vanduo-oss/vdl-cbun/code-editor
 * ======================================================================== */
import {
  VdCodeEditor,
  VdCodeEditorCore,
  VD_CODE_EDITOR_VERSION,
  tokenize,
  highlight,
  renderTokensToHtml,
  LANGUAGES,
  type Token,
  type TokenType,
  type CodeEditorLanguage,
  type HighlightOptions,
  type CodeEditorSelection,
  type VdCodeEditorOptions,
  type CodeEditorChangeEvent,
  type VdCodeEditorProps,
} from '@vanduo-oss/vdl-cbun/code-editor';

const editorHost = document.createElement('div');
const editorOptions: VdCodeEditorOptions = {
  element: editorHost,
  value: 'const x = 1;',
  language: 'javascript',
  readOnly: false,
  lineNumbers: true,
  tabSize: 2,
  maxHighlightLength: 100000,
};
const codeEditor = new VdCodeEditorCore(editorOptions);
const editorValue: string = codeEditor.getValue();
const codeSel: CodeEditorSelection = codeEditor.getSelection();
codeEditor.setValue('next', { silent: true });
codeEditor.setSelection(0, codeSel.end);
codeEditor
  .insertText('x')
  .setLanguage('python')
  .setReadOnly(true)
  .setTabSize(4)
  .setAutoClose(false);
codeEditor.on('change', (e: CodeEditorChangeEvent) => void e.value);
codeEditor.on('focus', (e: FocusEvent) => void e);
codeEditor.focus().blur();
codeEditor.destroy();

const editorTokens: Token[] = tokenize('a', 'javascript');
const firstType: TokenType = editorTokens[0]?.type ?? 'plain';
const editorHtml: string = highlight('a', 'javascript');
const editorHtmlOpt: string = highlight('a\n', 'plaintext', { trailingNewline: false });
const highlightOpts: HighlightOptions = { trailingNewline: true };
const editorSpans: string = renderTokensToHtml(editorTokens);
const editorLangs: readonly CodeEditorLanguage[] = LANGUAGES;
const vueLang: CodeEditorLanguage = 'vue';
const editorVersion: string = VD_CODE_EDITOR_VERSION;
const editorProps: VdCodeEditorProps = { modelValue: 'x', language: 'json', readOnly: true };
// @ts-expect-error — modelValue is a string, not a number.
const badEditorProps: VdCodeEditorProps = { modelValue: 123 };
// @ts-expect-error — the editor edits text only; it never exposes an eval/run of source.
codeEditor.run('code');

/* ===========================================================================
 * code-editor/highlight — @vanduo-oss/vdl-cbun/code-editor/highlight
 * ======================================================================== */
import {
  highlight as snippetHighlight,
  tokenize as snippetTokenize,
  renderTokensToHtml as snippetRender,
  LANGUAGES as snippetLanguages,
  type Token as SnippetToken,
  type HighlightOptions as SnippetHighlightOptions,
} from '@vanduo-oss/vdl-cbun/code-editor/highlight';

const snippetTokens: SnippetToken[] = snippetTokenize('const x = 1;', 'javascript');
const snippetHtml: string = snippetHighlight('a\n', 'plaintext', {
  trailingNewline: false,
} satisfies SnippetHighlightOptions);
const snippetSpans: string = snippetRender(snippetTokens);
const snippetLangs = snippetLanguages;

/* ===========================================================================
 * Reference every binding so `noUnusedLocals`-style checks (and reviewers)
 * see the whole surface is intentionally exercised.
 * ======================================================================== */
void [
  gridStaticVersion,
  gridRotation,
  hex,
  hexCount,
  path,
  gridVisible,
  gridStats,
  gridMode,
  gridLastRenderMs,
  p2,
  axial,
  rounded,
  corners,
  neighbours,
  dist,
  terrainColor,
  paletteColor,
  fallbackColor,
  passable,
  moveCost,
  yieldFood,
  hexVersion,
  hexProps,
  badHexProps,
  VdHexGridVue,
  isPlaying,
  playerApiVersion,
  musicVersion,
  musicProps,
  badMusicProps,
  VdMusicPlayerVue,
  VdCodeEditor,
  editorValue,
  editorTokens,
  firstType,
  editorHtml,
  editorHtmlOpt,
  highlightOpts,
  editorSpans,
  editorLangs,
  vueLang,
  editorVersion,
  editorProps,
  badEditorProps,
  snippetHtml,
  snippetSpans,
  snippetLangs,
];

/* ===========================================================================
 * draw — @vanduo-oss/vdl-cbun/draw
 * ======================================================================== */
import {
  VdDraw,
  VdDrawCore,
  VD_DRAW_VERSION,
  DRAW_TOOLS,
  DRAW_SHAPE_TYPES,
  BRUSH_PRESETS,
  type DrawTool,
  type BrushName,
  type BrushPreset,
  type DrawShape,
  type DrawDocument,
  type DrawChangeEvent,
  type VdDrawProps,
} from '@vanduo-oss/vdl-cbun/draw';

const drawHost = document.createElement('div');
const drawer = new VdDrawCore({
  element: drawHost,
  tool: 'rectangle',
  snap: true,
  history: true,
  historyLimit: 50,
});

const drawnRect: DrawShape = drawer.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 30 });
drawer
  .select(drawnRect.id, { additive: false })
  .setStyle({ color: '#111', strokeWidth: 2 })
  .nudge(4, 4);
drawer.bringToFront().sendToBack().group().ungroup();
drawer.copy().paste({ offset: 12 }).duplicate();
drawer.setViewport({ x: 10, scale: 1.5 }).zoomIn().zoomOut().resetView().fitView();
const drawnDoc: DrawDocument = drawer.toJSON();
const drawnVersion: string = drawnDoc.version;
const drawnSvg: string = drawer.toSVG();
const drawnPng: Promise<string> = drawer.toPNG({ scale: 2 });
drawer.on('change', (e: DrawChangeEvent) => void e.reason);
drawer.undo().redo().clearHistory();
drawer.load({ shapes: [] });
drawer.setColor('#e64980').setBrush('marker').setBrushSize(12).setOpacity(0.5).setTool('eraser');
drawer.destroy();

const drawTool: DrawTool = 'sticky';
const drawBrush: BrushName = 'highlighter';
const drawPreset: BrushPreset = BRUSH_PRESETS[drawBrush];
const drawVersion: string = VD_DRAW_VERSION;
const drawTools: readonly DrawTool[] = DRAW_TOOLS;
const drawTypes = DRAW_SHAPE_TYPES;
const drawProps: VdDrawProps = {
  data: { shapes: [] },
  tool: 'ellipse',
  readonly: false,
  snap: true,
};
// @ts-expect-error — `tool` must be a DrawTool literal, not an arbitrary string.
const badDrawProps: VdDrawProps = { tool: 'lasso' };
// @ts-expect-error — the editor draws shapes only; it never evaluates/runs content.
drawer.run('code');

void [
  VdDraw,
  drawnRect,
  drawnVersion,
  drawnSvg,
  drawnPng,
  drawTool,
  drawBrush,
  drawPreset,
  drawVersion,
  drawTools,
  drawTypes,
  drawProps,
  badDrawProps,
];
