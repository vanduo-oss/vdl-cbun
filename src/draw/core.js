// Framework-agnostic infinite-canvas drawing tool.
//
// Architecture mirrors the flowchart core (SVG world <g> transformed by a
// matrix for pan/zoom, a plain-object document mutated in place, one
// `interaction` state machine, and a single emitChange → recordHistory choke
// point for whole-document undo snapshots) — but is a drawing/painting tool:
// a vector brush engine (see shapes.js), brush presets, a color palette, and a
// stroke eraser. Fully self-contained under src/draw/ (the tree-shake isolation
// guard forbids importing vd3 or sibling components). SSR-safe: constructed on
// mount only; no window/document at module scope; every window listener is
// removed on destroy().

import {
  VD_DRAW_VERSION,
  DRAW_TOOLS,
  DRAW_SHAPE_TYPES,
  BRUSH_PRESETS,
  DEFAULT_BRUSH,
  MIN_SCALE,
  MAX_SCALE,
  DEFAULT_GRID_SIZE,
  createId,
  clamp,
  round,
  deepClone,
  shapeBounds,
  boundsOfShapes,
  boundsIntersect,
  distanceToShape,
  translateShape,
  scaleShape,
  resizeHandlePositions,
  pointsToPath,
  simplifyPoints,
  smoothPoint,
  appendAndSimplify,
  wrapText,
  brushStrokePath,
  normalizeDocument,
} from './shapes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WORLD_EXTENT = 8000; // half-size of the grid backdrop, in world units
const HANDLE_SIZE = 8; // screen px (kept constant via r/scale)
const SNAP_THRESHOLD = 6; // screen px within which edges/centres snap
const DRAG_THRESHOLD = 3; // screen px before a press counts as a drag
const ERASER_RADIUS = 12; // screen px eraser hit radius

// Reasons whose consecutive same-target commits collapse into one undo entry.
const COALESCE_REASONS = new Set(['shape:style', 'shape:text', 'shape:nudge']);

// Genuine Phosphor (regular) icon path data — MIT, inlined so the component
// stays self-contained (no webfont / CDN). viewBox 0 0 256 256, currentColor.
const ICON_PATHS = {
  select:
    'M168,132.69,214.08,115l.33-.13A16,16,0,0,0,213,85.07L52.92,32.8A15.95,15.95,0,0,0,32.8,52.92L85.07,213a15.82,15.82,0,0,0,14.41,11l.78,0a15.84,15.84,0,0,0,14.61-9.59l.13-.33L132.69,168,184,219.31a16,16,0,0,0,22.63,0l12.68-12.68a16,16,0,0,0,0-22.63ZM195.31,208,144,156.69a16,16,0,0,0-26,4.93c0,.11-.09.22-.13.32l-17.65,46L48,48l159.85,52.2-45.95,17.64-.32.13a16,16,0,0,0-4.93,26h0L208,195.31Z',
  hand: 'M188,48a27.75,27.75,0,0,0-12,2.71V44a28,28,0,0,0-54.65-8.6A28,28,0,0,0,80,60v64l-3.82-6.13a28,28,0,0,0-48.6,27.82c16,33.77,28.93,57.72,43.72,72.69C86.24,233.54,103.2,240,128,240a88.1,88.1,0,0,0,88-88V76A28,28,0,0,0,188,48Zm12,104a72.08,72.08,0,0,1-72,72c-20.38,0-33.51-4.88-45.33-16.85C69.44,193.74,57.26,171,41.9,138.58a6.36,6.36,0,0,0-.3-.58,12,12,0,0,1,20.79-12,1.76,1.76,0,0,0,.14.23l18.67,30A8,8,0,0,0,96,152V60a12,12,0,0,1,24,0v60a8,8,0,0,0,16,0V44a12,12,0,0,1,24,0v76a8,8,0,0,0,16,0V76a12,12,0,0,1,24,0Z',
  draw: 'M232,32a8,8,0,0,0-8-8c-44.08,0-89.31,49.71-114.43,82.63A60,60,0,0,0,32,164c0,30.88-19.54,44.73-20.47,45.37A8,8,0,0,0,16,224H92a60,60,0,0,0,57.37-77.57C182.3,121.31,232,76.08,232,32ZM92,208H34.63C41.38,198.41,48,183.92,48,164a44,44,0,1,1,44,44Zm32.42-94.45q5.14-6.66,10.09-12.55A76.23,76.23,0,0,1,155,121.49q-5.9,4.94-12.55,10.09A60.54,60.54,0,0,0,124.42,113.55Zm42.7-2.68a92.57,92.57,0,0,0-22-22c31.78-34.53,55.75-45,69.9-47.91C212.17,55.12,201.65,79.09,167.12,110.87Z',
  eraser:
    'M225,80.4,183.6,39a24,24,0,0,0-33.94,0L31,157.66a24,24,0,0,0,0,33.94l30.06,30.06A8,8,0,0,0,66.74,224H216a8,8,0,0,0,0-16h-84.7L225,114.34A24,24,0,0,0,225,80.4ZM108.68,208H70.05L42.33,180.28a8,8,0,0,1,0-11.31L96,115.31,148.69,168Zm105-105L160,156.69,107.31,104,161,50.34a8,8,0,0,1,11.32,0l41.38,41.38a8,8,0,0,1,0,11.31Z',
  rectangle:
    'M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V48H208V208Z',
  ellipse:
    'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z',
  line: 'M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z',
  text: 'M208,56V88a8,8,0,0,1-16,0V64H136V192h24a8,8,0,0,1,0,16H96a8,8,0,0,1,0-16h24V64H64V88a8,8,0,0,1-16,0V56a8,8,0,0,1,8-8H200A8,8,0,0,1,208,56Z',
  sticky:
    'M88,96a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H96A8,8,0,0,1,88,96Zm8,40h64a8,8,0,0,0,0-16H96a8,8,0,0,0,0,16Zm32,16H96a8,8,0,0,0,0,16h32a8,8,0,0,0,0-16ZM224,48V156.69A15.86,15.86,0,0,1,219.31,168L168,219.31A15.86,15.86,0,0,1,156.69,224H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32H208A16,16,0,0,1,224,48ZM48,208H152V160a8,8,0,0,1,8-8h48V48H48Zm120-40v28.7L196.69,168Z',
  undo: 'M224,128a96,96,0,0,1-94.71,96H128A95.38,95.38,0,0,1,62.1,197.8a8,8,0,0,1,11-11.63A80,80,0,1,0,71.43,71.39a3.07,3.07,0,0,1-.26.25L44.59,96H72a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V56a8,8,0,0,1,16,0V85.8L60.25,60A96,96,0,0,1,224,128Z',
  redo: 'M240,56v48a8,8,0,0,1-8,8H184a8,8,0,0,1,0-16H211.4L184.81,71.64l-.25-.24a80,80,0,1,0-1.67,114.78,8,8,0,0,1,11,11.63A95.44,95.44,0,0,1,128,224h-1.32A96,96,0,1,1,195.75,60L224,85.8V56a8,8,0,1,1,16,0Z',
  duplicate:
    'M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z',
  delete:
    'M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z',
  grid: 'M200,40H56A16,16,0,0,0,40,56V200a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,80H136V56h64ZM120,56v64H56V56ZM56,136h64v64H56Zm144,64H136V136h64v64Z',
};

const TOOL_BUTTONS = [
  { tool: 'select', label: 'Select' },
  { tool: 'hand', label: 'Pan' },
  { tool: 'draw', label: 'Brush' },
  { tool: 'eraser', label: 'Eraser' },
  { tool: 'rectangle', label: 'Rectangle' },
  { tool: 'ellipse', label: 'Ellipse' },
  { tool: 'line', label: 'Arrow' },
  { tool: 'text', label: 'Text' },
  { tool: 'sticky', label: 'Sticky note' },
];
const ACTION_BUTTONS = [
  { action: 'undo', label: 'Undo' },
  { action: 'redo', label: 'Redo' },
  { action: 'duplicate', label: 'Duplicate' },
  { action: 'delete', label: 'Delete / clear' },
];

const BRUSH_ORDER = ['pen', 'pencil', 'marker', 'highlighter', 'calligraphy'];
const BRUSH_LABELS = {
  pen: 'Pen',
  pencil: 'Pencil',
  marker: 'Marker',
  highlighter: 'Highlighter',
  calligraphy: 'Calligraphy',
};
const SWATCHES = [
  '#1f2720',
  '#495057',
  '#e03131',
  '#f08c00',
  '#f2c200',
  '#2f9e44',
  '#1971c2',
  '#7048e8',
  '#e64980',
  '#ffffff',
];

function createSvgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function createIcon(name) {
  const svg = createSvgEl('svg', {
    viewBox: '0 0 256 256',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.classList.add('vd-draw-icon');
  svg.setAttribute('fill', 'currentColor');
  svg.appendChild(createSvgEl('path', { d: ICON_PATHS[name] || '' }));
  return svg;
}

function clearChildren(node) {
  if (node) node.replaceChildren();
}

function hasWindow() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

// Normalize a color to 6-digit hex for the native <input type=color>, which
// only accepts that form. Expands #rgb → #rrggbb; returns null for rgb()/named
// colors (the picker keeps its prior value while the mark still uses the color).
function toHex6(color) {
  if (typeof color !== 'string') return null;
  const value = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(value);
  if (short)
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return null;
}

export class VdDraw {
  constructor(options = {}) {
    const opts = options || {};
    this.element = this._resolveElement(opts.element ?? opts.target);
    if (!this.element) throw new Error('VdDraw: a target `element` is required');

    this.readonly = Boolean(opts.readonly);
    this.tool = DRAW_TOOLS.includes(opts.tool) ? opts.tool : 'draw';
    this.gridSize = Number.isFinite(opts.gridSize) ? opts.gridSize : DEFAULT_GRID_SIZE;
    this.showGrid = opts.showGrid == null ? true : Boolean(opts.showGrid);
    this.snap = opts.snap == null ? true : Boolean(opts.snap);
    this.autoFit = Boolean(opts.autoFit);
    this.historyEnabled = opts.history == null ? true : Boolean(opts.history);
    this.historyLimit = Number.isFinite(opts.historyLimit) ? opts.historyLimit : 100;

    this.style = {
      color: typeof opts.color === 'string' ? opts.color : '#1f2720',
      opacity: Number.isFinite(opts.opacity) ? clamp(opts.opacity, 0.05, 1) : 1,
      size: Number.isFinite(opts.brushSize) ? opts.brushSize : BRUSH_PRESETS[DEFAULT_BRUSH].size,
      brush: BRUSH_PRESETS[opts.brush] ? opts.brush : DEFAULT_BRUSH,
    };
    this.recentColors = [];

    this.documentData = normalizeDocument(opts.data);
    this.selectedIds = new Set();
    this.interaction = null;
    this.clipboard = [];
    this.textEditor = null;
    this.destroyed = false;

    this.history = [];
    this.historyIndex = -1;
    this.isApplyingHistory = false;
    this.lastReason = null;
    this.lastTargetKey = null;

    this.listeners = new Map();

    this.options = { ...opts };
    this._shapesById = new Map();
    this._rebuildShapeIndex();
    this._activePointers = new Map();

    // ── Incremental-render + rAF state ──
    this._shapeElements = new Map();
    this._dirtyShapes = new Set();
    this._allDirty = true;
    this._rafId = null;
    this._pendingFlags = null;

    this._buildShell();
    if (typeof opts.color !== 'string') this.style.color = this._resolveInk();
    this._bindEvents();
    this._resetHistory();
    this.render();
    this._syncStylePanel();
    this._scheduleReady();
  }

  _rebuildShapeIndex() {
    this._shapesById.clear();
    for (const s of this.documentData.shapes) {
      this._shapesById.set(s.id, s);
    }
  }

  _resolveElement(target) {
    if (!target) return null;
    if (typeof target === 'string') return hasWindow() ? document.querySelector(target) : null;
    return target;
  }

  _resolveInk() {
    if (!hasWindow()) return '#1f2720';
    try {
      const v = getComputedStyle(this.svg).getPropertyValue('--vd-draw-ink').trim();
      return v || '#1f2720';
    } catch {
      return '#1f2720';
    }
  }

  // ── Shell ──────────────────────────────────────────────────────────────
  _buildShell() {
    const host = this.element;
    host.classList.add('vd-draw-host');
    clearChildren(host);

    const shell = document.createElement('div');
    shell.className = 'vd-draw-shell';

    this.toolbarEl = document.createElement('div');
    this.toolbarEl.className = 'vd-draw-toolbar';
    this.toolbarEl.setAttribute('role', 'toolbar');
    this.toolbarEl.setAttribute('aria-label', 'Drawing tools');

    this.panelEl = document.createElement('div');
    this.panelEl.className = 'vd-draw-panel';
    if (!this.readonly) {
      this._buildToolbar();
      this._buildStylePanel();
    }

    this.canvasEl = document.createElement('div');
    this.canvasEl.className = 'vd-draw-canvas';
    this.canvasEl.setAttribute('data-tool', this.tool);
    this.canvasEl.tabIndex = 0;

    this.svg = createSvgEl('svg', { class: 'vd-draw-svg' });
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');

    const defs = createSvgEl('defs');
    this.defsEl = defs;
    const gs = this.gridSize;
    this.gridPattern = createSvgEl('pattern', {
      id: this._svgId('grid'),
      width: gs,
      height: gs,
      patternUnits: 'userSpaceOnUse',
    });
    this.gridPatternPath = createSvgEl('path', {
      d: `M ${gs} 0 L 0 0 0 ${gs}`,
      fill: 'none',
      stroke: 'var(--vd-draw-grid)',
      'stroke-width': 1,
    });
    this.gridPattern.appendChild(this.gridPatternPath);
    defs.appendChild(this.gridPattern);
    this._getArrowMarkerId('', defs);
    this.svg.appendChild(defs);

    this.world = createSvgEl('g', { class: 'vd-draw-world' });
    this.gridLayer = createSvgEl('rect', {
      class: 'vd-draw-grid-rect',
      x: -WORLD_EXTENT,
      y: -WORLD_EXTENT,
      width: WORLD_EXTENT * 2,
      height: WORLD_EXTENT * 2,
      fill: `url(#${this._svgId('grid')})`,
    });
    if (!this.showGrid) this.gridLayer.style.display = 'none';
    this.shapesLayer = createSvgEl('g', { class: 'vd-draw-shapes' });
    this.guidesLayer = createSvgEl('g', { class: 'vd-draw-guides' });
    this.overlayLayer = createSvgEl('g', { class: 'vd-draw-overlay' });
    this.marqueeLayer = createSvgEl('g', { class: 'vd-draw-marquee' });
    this.world.append(
      this.gridLayer,
      this.shapesLayer,
      this.guidesLayer,
      this.overlayLayer,
      this.marqueeLayer,
    );
    this.svg.appendChild(this.world);

    this.canvasEl.appendChild(this.svg);
    this.textLayer = document.createElement('div');
    this.textLayer.className = 'vd-draw-text-layer';
    this.canvasEl.appendChild(this.textLayer);

    shell.append(this.toolbarEl, this.panelEl, this.canvasEl);
    host.appendChild(shell);
  }

  _buildToolbar() {
    clearChildren(this.toolbarEl);
    const makeBtn = (name, label, attr, value, active) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vd-draw-tool';
      btn.setAttribute(attr, value);
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      if (active) btn.setAttribute('aria-pressed', 'true');
      btn.appendChild(createIcon(name));
      return btn;
    };
    const tools = document.createElement('div');
    tools.className = 'vd-draw-toolbar-group';
    for (const t of TOOL_BUTTONS)
      tools.appendChild(makeBtn(t.tool, t.label, 'data-tool', t.tool, t.tool === this.tool));
    const actions = document.createElement('div');
    actions.className = 'vd-draw-toolbar-group';
    for (const a of ACTION_BUTTONS)
      actions.appendChild(makeBtn(a.action, a.label, 'data-action', a.action, false));
    this.toolbarEl.append(tools, actions);
  }

  _panelGroup(labelText, className = '') {
    const group = document.createElement('div');
    group.className = `vd-draw-panel-group${className ? ` ${className}` : ''}`;
    const label = document.createElement('span');
    label.className = 'vd-draw-panel-label';
    label.textContent = labelText;
    group.appendChild(label);
    return group;
  }

  _rangeInput(min, max, step, styleKey) {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.setAttribute('data-style', styleKey);
    input.setAttribute('aria-label', styleKey);
    return input;
  }

  _buildStylePanel() {
    clearChildren(this.panelEl);

    // Brush presets
    const brushGroup = this._panelGroup('Brush');
    for (const key of BRUSH_ORDER) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vd-draw-brush';
      btn.setAttribute('data-brush', key);
      btn.setAttribute('title', BRUSH_LABELS[key]);
      btn.textContent = BRUSH_LABELS[key];
      brushGroup.appendChild(btn);
    }

    // Color
    const colorGroup = this._panelGroup('Color', 'vd-draw-swatches-group');
    for (const color of SWATCHES) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'vd-draw-swatch';
      sw.setAttribute('data-swatch', color);
      sw.setAttribute('aria-label', `Color ${color}`);
      sw.setAttribute('title', color);
      sw.style.setProperty('--sw', color);
      colorGroup.appendChild(sw);
    }
    this.colorInput = document.createElement('input');
    this.colorInput.type = 'color';
    this.colorInput.className = 'vd-draw-color-input';
    this.colorInput.setAttribute('data-style', 'color');
    this.colorInput.setAttribute('aria-label', 'Custom color');
    this.colorInput.setAttribute('title', 'Custom color');
    colorGroup.appendChild(this.colorInput);

    // Size
    const sizeGroup = this._panelGroup('Size');
    this.sizeInput = this._rangeInput(1, 40, 1, 'size');
    this.sizeValue = document.createElement('span');
    this.sizeValue.className = 'vd-draw-value';
    sizeGroup.append(this.sizeInput, this.sizeValue);

    // Opacity
    const opacityGroup = this._panelGroup('Opacity');
    this.opacityInput = this._rangeInput(0.1, 1, 0.05, 'opacity');
    this.opacityValue = document.createElement('span');
    this.opacityValue.className = 'vd-draw-value';
    opacityGroup.append(this.opacityInput, this.opacityValue);

    // Grid
    const gridGroup = this._panelGroup('Grid');
    this.gridToggle = document.createElement('button');
    this.gridToggle.type = 'button';
    this.gridToggle.className = 'vd-draw-tool';
    this.gridToggle.setAttribute('data-grid', 'toggle');
    this.gridToggle.setAttribute('aria-label', 'Toggle grid');
    this.gridToggle.setAttribute('title', 'Toggle grid');
    this.gridToggle.appendChild(createIcon('grid'));
    this.gridSizeInput = this._rangeInput(4, 128, 4, 'grid');
    this.gridSizeInput.title = 'Grid cell size';
    gridGroup.append(this.gridToggle, this.gridSizeInput);

    // Recent colors (hidden until used)
    this.recentGroup = this._panelGroup('Recent', 'vd-draw-swatches-group');
    this.recentEl = document.createElement('span');
    this.recentEl.className = 'vd-draw-recent';
    this.recentGroup.appendChild(this.recentEl);

    this.panelEl.append(
      brushGroup,
      colorGroup,
      sizeGroup,
      opacityGroup,
      gridGroup,
      this.recentGroup,
    );
  }

  _svgId(suffix) {
    if (!this._idBase) this._idBase = createId('draw');
    return `${this._idBase}-${suffix}`;
  }

  _syncToolbar() {
    if (this.readonly || !this.toolbarEl) return;
    for (const btn of this.toolbarEl.querySelectorAll('[data-tool]')) {
      if (btn.getAttribute('data-tool') === this.tool) btn.setAttribute('aria-pressed', 'true');
      else btn.removeAttribute('aria-pressed');
    }
  }

  _syncStylePanel() {
    if (this.readonly || !this.panelEl) return;
    for (const btn of this.panelEl.querySelectorAll('[data-brush]')) {
      if (btn.getAttribute('data-brush') === this.style.brush)
        btn.setAttribute('aria-pressed', 'true');
      else btn.removeAttribute('aria-pressed');
    }
    if (this.colorInput) {
      const hex = toHex6(this.style.color);
      if (hex) this.colorInput.value = hex;
    }
    if (this.sizeInput) this.sizeInput.value = String(this.style.size);
    if (this.sizeValue) this.sizeValue.textContent = `${Math.round(this.style.size)}px`;
    if (this.opacityInput) this.opacityInput.value = String(this.style.opacity);
    if (this.opacityValue)
      this.opacityValue.textContent = `${Math.round(this.style.opacity * 100)}%`;
    if (this.gridToggle) {
      if (this.showGrid) this.gridToggle.setAttribute('aria-pressed', 'true');
      else this.gridToggle.removeAttribute('aria-pressed');
    }
    if (this.gridSizeInput) this.gridSizeInput.value = String(this.gridSize);
    for (const sw of this.panelEl.querySelectorAll('.vd-draw-swatch[data-swatch]')) {
      if (sw.getAttribute('data-swatch') === this.style.color)
        sw.setAttribute('aria-pressed', 'true');
      else sw.removeAttribute('aria-pressed');
    }
    if (this.recentEl && this.recentGroup) {
      clearChildren(this.recentEl);
      for (const color of this.recentColors) {
        const sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'vd-draw-swatch';
        sw.setAttribute('data-swatch', color);
        sw.setAttribute('aria-label', `Recent color ${color}`);
        sw.setAttribute('title', color);
        sw.style.setProperty('--sw', color);
        this.recentEl.appendChild(sw);
      }
      this.recentGroup.style.display = this.recentColors.length ? '' : 'none';
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────
  _bindEvents() {
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onToolbarClick = this._handleToolbarClick.bind(this);
    this._onPanelClick = this._handlePanelClick.bind(this);
    this._onPanelInput = this._handlePanelInput.bind(this);
    this._onResize = this._handleResize.bind(this);

    this.canvasEl.addEventListener('pointerdown', this._onPointerDown);
    this.canvasEl.addEventListener('pointermove', this._onPointerMove);
    this.canvasEl.addEventListener('pointerup', this._onPointerUp);
    this.canvasEl.addEventListener('pointercancel', this._onPointerUp);
    this.canvasEl.addEventListener('wheel', this._onWheel, { passive: false });
    this.canvasEl.addEventListener('keydown', this._onKeyDown);
    this.toolbarEl.addEventListener('click', this._onToolbarClick);
    this.panelEl.addEventListener('click', this._onPanelClick);
    this.panelEl.addEventListener('input', this._onPanelInput);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('resize', this._onResize);
  }

  _unbindEvents() {
    this.canvasEl.removeEventListener('pointerdown', this._onPointerDown);
    this.canvasEl.removeEventListener('pointermove', this._onPointerMove);
    this.canvasEl.removeEventListener('pointerup', this._onPointerUp);
    this.canvasEl.removeEventListener('pointercancel', this._onPointerUp);
    this.canvasEl.removeEventListener('wheel', this._onWheel);
    this.canvasEl.removeEventListener('keydown', this._onKeyDown);
    this.toolbarEl.removeEventListener('click', this._onToolbarClick);
    this.panelEl.removeEventListener('click', this._onPanelClick);
    this.panelEl.removeEventListener('input', this._onPanelInput);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('resize', this._onResize);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return this;
  }

  off(event, callback) {
    this.listeners.get(event)?.delete(callback);
    return this;
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (set) for (const cb of set) cb(payload);
  }

  // ── Coordinate transforms ───────────────────────────────────────────────
  _clientToLocal(clientX, clientY) {
    const rect = this.canvasEl.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  _localToWorld(lx, ly) {
    const vp = this.documentData.viewport;
    return { x: (lx - vp.x) / vp.scale, y: (ly - vp.y) / vp.scale };
  }

  _clientToWorld(clientX, clientY) {
    const local = this._clientToLocal(clientX, clientY);
    return this._localToWorld(local.x, local.y);
  }

  scaleAround(factor, lx, ly) {
    const vp = this.documentData.viewport;
    const next = clamp(vp.scale * factor, MIN_SCALE, MAX_SCALE);
    const applied = next / vp.scale;
    vp.x = lx - (lx - vp.x) * applied;
    vp.y = ly - (ly - vp.y) * applied;
    vp.scale = next;
    return this;
  }

  // ── Viewport ─────────────────────────────────────────────────────────────
  setViewport(patch) {
    const vp = this.documentData.viewport;
    if (patch && typeof patch === 'object') {
      if (Number.isFinite(patch.x)) vp.x = patch.x;
      if (Number.isFinite(patch.y)) vp.y = patch.y;
      if (Number.isFinite(patch.scale)) vp.scale = clamp(patch.scale, MIN_SCALE, MAX_SCALE);
    }
    this.render({ scene: false });
    this._emitViewportChange('viewport:set');
    return this;
  }

  zoomIn() {
    return this._zoomAtCentre(1.2);
  }

  zoomOut() {
    return this._zoomAtCentre(1 / 1.2);
  }

  _zoomAtCentre(factor) {
    const rect = this.canvasEl.getBoundingClientRect();
    this.scaleAround(factor, rect.width / 2, rect.height / 2);
    this.render({ scene: false });
    this._emitViewportChange('viewport:zoom');
    return this;
  }

  resetView() {
    this.documentData.viewport = { x: 0, y: 0, scale: 1 };
    this.render({ scene: false });
    this._emitViewportChange('viewport:reset');
    return this;
  }

  fitView(padding = 40) {
    const bounds = boundsOfShapes(this.documentData.shapes);
    const rect = this.canvasEl.getBoundingClientRect();
    if (!bounds || bounds.w === 0 || bounds.h === 0 || !rect.width || !rect.height) return this;
    const pad = Number.isFinite(padding) ? Math.max(0, padding) : 40;
    const scale = clamp(
      Math.min((rect.width - pad * 2) / bounds.w, (rect.height - pad * 2) / bounds.h),
      MIN_SCALE,
      MAX_SCALE,
    );
    const vp = this.documentData.viewport;
    vp.scale = scale;
    vp.x = (rect.width - bounds.w * scale) / 2 - bounds.x * scale;
    vp.y = (rect.height - bounds.h * scale) / 2 - bounds.y * scale;
    this.render({ scene: false });
    this._emitViewportChange('viewport:fit');
    return this;
  }

  _emitViewportChange(reason) {
    this.emit('viewport', {
      reason,
      viewport: { ...this.documentData.viewport },
      document: this.toJSON(),
    });
  }

  // ── Grid ─────────────────────────────────────────────────────────────────
  setGridSize(size) {
    if (!Number.isFinite(size)) return this;
    this.gridSize = clamp(Math.round(size), 4, 128);
    if (this.gridPattern) {
      this.gridPattern.setAttribute('width', String(this.gridSize));
      this.gridPattern.setAttribute('height', String(this.gridSize));
      this.gridPatternPath.setAttribute('d', `M ${this.gridSize} 0 L 0 0 0 ${this.gridSize}`);
    }
    this._syncStylePanel();
    return this;
  }

  setGridVisible(visible) {
    this.showGrid = Boolean(visible);
    if (this.gridLayer) this.gridLayer.style.display = this.showGrid ? '' : 'none';
    this._syncStylePanel();
    return this;
  }

  toggleGrid() {
    return this.setGridVisible(!this.showGrid);
  }

  // ── Runtime options ──────────────────────────────────────────────────────
  setReadonly(readonly) {
    const next = Boolean(readonly);
    if (this.readonly === next) return this;
    this.readonly = next;
    this.options.readonly = next;
    if (this.element) {
      if (next) this.element.setAttribute('data-readonly', 'true');
      else this.element.removeAttribute('data-readonly');
    }
    if (next) {
      this.stopTextEdit({ commit: true });
      this.deselect();
      if (this.toolbarEl) this.toolbarEl.style.display = 'none';
      if (this.panelEl) this.panelEl.style.display = 'none';
    } else {
      if (this.toolbarEl && !this.toolbarEl.children.length) {
        this._buildToolbar();
      }
      if (this.panelEl && !this.panelEl.children.length) {
        this._buildStylePanel();
      }
      if (this.toolbarEl) this.toolbarEl.style.display = '';
      if (this.panelEl) this.panelEl.style.display = '';
      this._syncToolbar();
      this._syncStylePanel();
    }
    this.render({ scene: false, overlay: true });
    return this;
  }

  setSnap(snap) {
    this.snap = Boolean(snap);
    this.options.snap = this.snap;
    return this;
  }

  setHistoryEnabled(enabled) {
    this.historyEnabled = Boolean(enabled);
    this.options.history = this.historyEnabled;
    if (!this.historyEnabled) {
      this.clearHistory();
    }
    return this;
  }

  setHistoryLimit(limit) {
    const num = Number(limit);
    this.historyLimit = Number.isFinite(num) && num > 0 ? num : 100;
    this.options.historyLimit = this.historyLimit;
    if (this.history.length > this.historyLimit + 1) {
      const drop = this.history.length - (this.historyLimit + 1);
      this.history.splice(0, drop);
      this.historyIndex = Math.max(0, this.historyIndex - drop);
    }
    return this;
  }

  // ── Tool + current style ─────────────────────────────────────────────────
  setTool(tool) {
    if (!DRAW_TOOLS.includes(tool)) return this;
    this.tool = tool;
    if (this.canvasEl) this.canvasEl.setAttribute('data-tool', tool);
    this._syncToolbar();
    return this;
  }

  setColor(color) {
    if (typeof color !== 'string') return this;
    this.style.color = color;
    this._pushRecent(color);
    this._syncStylePanel();
    return this;
  }

  setOpacity(opacity) {
    if (Number.isFinite(opacity)) this.style.opacity = clamp(opacity, 0.05, 1);
    this._syncStylePanel();
    return this;
  }

  setBrushSize(size) {
    if (Number.isFinite(size)) this.style.size = clamp(size, 1, 200);
    this._syncStylePanel();
    return this;
  }

  setBrush(brush) {
    if (BRUSH_PRESETS[brush]) this.style.brush = brush;
    this._syncStylePanel();
    return this;
  }

  _pushRecent(color) {
    this.recentColors = [color, ...this.recentColors.filter((c) => c !== color)].slice(0, 8);
  }

  _shapeStrokeWidth() {
    return clamp(round(this.style.size / 3), 1, 14);
  }

  // ── Shape CRUD ─────────────────────────────────────────────────────────
  getShape(id) {
    return this._shapesById.get(id) || null;
  }

  getShapes() {
    // Deep clone so callers cannot mutate live document objects without updateShape.
    return this.documentData.shapes.map((s) => deepClone(s));
  }

  addShape(partial = {}) {
    const type = DRAW_SHAPE_TYPES.includes(partial.type) ? partial.type : 'rectangle';
    const s = this.style;
    let shape;
    if (type === 'freehand') {
      const points = Array.isArray(partial.points)
        ? partial.points.map((p) => this._roundPoint(p))
        : [];
      shape = {
        id: partial.id || createId('fh'),
        type: 'freehand',
        brush: BRUSH_PRESETS[partial.brush] ? partial.brush : s.brush,
        color: partial.color || s.color,
        size: partial.size == null ? s.size : partial.size,
        opacity: partial.opacity == null ? s.opacity : partial.opacity,
        points,
      };
    } else if (type === 'line') {
      const points = Array.isArray(partial.points)
        ? partial.points.map(([x, y]) => [round(x), round(y)])
        : [];
      shape = {
        id: partial.id || createId('ln'),
        type: 'line',
        points,
        color: partial.color || s.color,
        strokeWidth: partial.strokeWidth == null ? this._shapeStrokeWidth() : partial.strokeWidth,
        opacity: partial.opacity == null ? s.opacity : partial.opacity,
        arrowStart: Boolean(partial.arrowStart),
        arrowEnd: partial.arrowEnd == null ? true : Boolean(partial.arrowEnd),
        // AI-authored multi-point curves set smooth:true; interactive 2-pt lines stay sharp.
        smooth: partial.smooth == null ? false : Boolean(partial.smooth),
      };
    } else {
      shape = {
        id: partial.id || createId(type.slice(0, 2)),
        type,
        x: round(partial.x ?? 0),
        y: round(partial.y ?? 0),
        w: round(Math.max(1, partial.w ?? 100)),
        h: round(Math.max(1, partial.h ?? 80)),
        rotation: partial.rotation ?? 0,
        color: partial.color || s.color,
        strokeWidth: partial.strokeWidth == null ? this._shapeStrokeWidth() : partial.strokeWidth,
        opacity: partial.opacity == null ? s.opacity : partial.opacity,
      };
      if (partial.fill) shape.fill = partial.fill;
      if (type === 'text' || type === 'sticky')
        shape.text = typeof partial.text === 'string' ? partial.text : '';
    }
    this.documentData.shapes.push(shape);
    this._shapesById.set(shape.id, shape);
    this._markDirty(shape.id);
    this.render();
    this._emitChange('shape:add', { shape: deepClone(shape), shapeId: shape.id });
    return shape;
  }

  _roundPoint(p) {
    const out = [round(p[0]), round(p[1])];
    if (p.length >= 3 && p[2] != null) out.push(clamp(Number(p[2]) || 0, 0, 1));
    return out;
  }

  updateShape(id, patch, options = {}) {
    const shape = this.getShape(id);
    if (!shape || !patch) return null;
    Object.assign(shape, patch);
    this._shapesById.set(id, shape);
    this._markDirty(id);
    this.render();
    this._emitChange(options.reason || 'shape:update', { shapeId: id }, options.reason ? id : null);
    return shape;
  }

  removeShape(id) {
    const idx = this.documentData.shapes.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.documentData.shapes.splice(idx, 1);
    this._shapesById.delete(id);
    this.selectedIds.delete(id);
    this._markDirty(id);
    this.render();
    this._emitChange('shape:delete', { shapeId: id });
    return true;
  }

  // ── Selection ────────────────────────────────────────────────────────────
  getSelectedShapes() {
    return this.documentData.shapes.filter((s) => this.selectedIds.has(s.id));
  }

  select(ids, { additive = false } = {}) {
    const list = Array.isArray(ids) ? ids : ids == null ? [] : [ids];
    if (!additive) this.selectedIds.clear();
    for (const id of list) {
      const shape = this.getShape(id);
      if (shape?.groupId) {
        for (const s of this.documentData.shapes)
          if (s.groupId === shape.groupId) this.selectedIds.add(s.id);
      } else if (shape) {
        this.selectedIds.add(id);
      }
    }
    this.render({ scene: false });
    this._emitSelect();
    return this;
  }

  selectAll() {
    this.selectedIds = new Set(this.documentData.shapes.map((s) => s.id));
    this.render({ scene: false });
    this._emitSelect();
    return this;
  }

  deselect() {
    if (this.selectedIds.size === 0) return this;
    this.selectedIds.clear();
    this.render({ scene: false });
    this._emitSelect();
    return this;
  }

  selectInBounds(box, { additive = false } = {}) {
    if (!additive) this.selectedIds.clear();
    for (const shape of this.documentData.shapes) {
      if (boundsIntersect(shapeBounds(shape), box)) this.selectedIds.add(shape.id);
    }
    for (const shape of [...this.getSelectedShapes()]) {
      if (shape.groupId)
        for (const s of this.documentData.shapes)
          if (s.groupId === shape.groupId) this.selectedIds.add(s.id);
    }
    this.render({ scene: false });
    this._emitSelect();
    return this;
  }

  _emitSelect() {
    this.emit('select', {
      ids: [...this.selectedIds],
      shapes: this.getSelectedShapes().map((s) => deepClone(s)),
    });
  }

  _syncSelectionValidity() {
    const present = new Set(this.documentData.shapes.map((s) => s.id));
    for (const id of [...this.selectedIds]) if (!present.has(id)) this.selectedIds.delete(id);
  }

  // ── Manipulation ─────────────────────────────────────────────────────────
  _replaceShape(next) {
    const idx = this.documentData.shapes.findIndex((s) => s.id === next.id);
    if (idx !== -1) this.documentData.shapes[idx] = next;
    this._shapesById.set(next.id, next);
  }

  nudge(dx, dy) {
    const selected = this.getSelectedShapes();
    if (!selected.length) return this;
    for (const shape of selected) this._replaceShape(translateShape(shape, dx, dy));
    this._markAllDirty();
    this.render();
    this._emitChange(
      'shape:nudge',
      { shapeIds: [...this.selectedIds] },
      `nudge:${[...this.selectedIds].sort().join(',')}`,
    );
    return this;
  }

  setSelectionBounds(target) {
    const selected = this.getSelectedShapes();
    const cur = boundsOfShapes(selected);
    if (!cur || cur.w === 0 || cur.h === 0 || !target) return this;
    const sx = target.w / cur.w;
    const sy = target.h / cur.h;
    for (const shape of selected) {
      const scaled = scaleShape(shape, cur.x, cur.y, sx, sy);
      this._replaceShape(translateShape(scaled, target.x - cur.x, target.y - cur.y));
    }
    this._markAllDirty();
    this.render();
    this._emitChange('shape:resize', { shapeIds: [...this.selectedIds] });
    return this;
  }

  deleteSelection() {
    if (this.selectedIds.size === 0) return false;
    const ids = [...this.selectedIds];
    for (const id of ids) this._shapesById.delete(id);
    this.documentData.shapes = this.documentData.shapes.filter((s) => !this.selectedIds.has(s.id));
    this.selectedIds.clear();
    this._markAllDirty();
    this.render();
    this._emitChange('shape:delete', { shapeIds: ids });
    return true;
  }

  setStyle(patch) {
    const selected = this.getSelectedShapes();
    if (!selected.length || !patch) return this;
    const allowed = ['color', 'fill', 'strokeWidth', 'opacity', 'size', 'brush'];
    for (const shape of selected) {
      for (const key of allowed) if (key in patch) shape[key] = patch[key];
    }
    this._markAllDirty();
    this.render();
    this._emitChange(
      'shape:style',
      { shapeIds: [...this.selectedIds] },
      `style:${[...this.selectedIds].sort().join(',')}`,
    );
    return this;
  }

  // ── Z-order ────────────────────────────────────────────────────────────
  _reorder(mutator) {
    if (this.selectedIds.size === 0) return this;
    mutator();
    this._markAllDirty();
    this.render();
    this._emitChange('shape:reorder', { shapeIds: [...this.selectedIds] });
    return this;
  }

  bringToFront() {
    return this._reorder(() => {
      const sel = this.documentData.shapes.filter((s) => this.selectedIds.has(s.id));
      const rest = this.documentData.shapes.filter((s) => !this.selectedIds.has(s.id));
      this.documentData.shapes = [...rest, ...sel];
    });
  }

  sendToBack() {
    return this._reorder(() => {
      const sel = this.documentData.shapes.filter((s) => this.selectedIds.has(s.id));
      const rest = this.documentData.shapes.filter((s) => !this.selectedIds.has(s.id));
      this.documentData.shapes = [...sel, ...rest];
    });
  }

  bringForward() {
    return this._reorder(() => {
      const arr = this.documentData.shapes;
      for (let i = arr.length - 2; i >= 0; i -= 1) {
        if (this.selectedIds.has(arr[i].id) && !this.selectedIds.has(arr[i + 1].id))
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      }
    });
  }

  sendBackward() {
    return this._reorder(() => {
      const arr = this.documentData.shapes;
      for (let i = 1; i < arr.length; i += 1) {
        if (this.selectedIds.has(arr[i].id) && !this.selectedIds.has(arr[i - 1].id))
          [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      }
    });
  }

  // ── Grouping ─────────────────────────────────────────────────────────────
  group() {
    const selected = this.getSelectedShapes();
    if (selected.length < 2) return this;
    const groupId = createId('grp');
    for (const shape of selected) shape.groupId = groupId;
    this._markAllDirty();
    this.render();
    this._emitChange('shape:group', { groupId, shapeIds: [...this.selectedIds] });
    return this;
  }

  ungroup() {
    const selected = this.getSelectedShapes();
    let changed = false;
    for (const shape of selected) {
      if (shape.groupId) {
        delete shape.groupId;
        changed = true;
      }
    }
    if (!changed) return this;
    this._markAllDirty();
    this.render();
    this._emitChange('shape:ungroup', { shapeIds: [...this.selectedIds] });
    return this;
  }

  // ── Clipboard ────────────────────────────────────────────────────────────
  copy() {
    this.clipboard = this.getSelectedShapes().map((s) => deepClone(s));
    return this;
  }

  cut() {
    this.copy();
    this.deleteSelection();
    return this;
  }

  paste({ offset = 16 } = {}) {
    if (!this.clipboard.length) return this;
    const groupRemap = new Map();
    const newIds = [];
    for (const src of this.clipboard) {
      const copy = translateShape(deepClone(src), offset, offset);
      copy.id = createId(copy.type.slice(0, 2));
      if (copy.groupId) {
        if (!groupRemap.has(copy.groupId)) groupRemap.set(copy.groupId, createId('grp'));
        copy.groupId = groupRemap.get(copy.groupId);
      }
      this.documentData.shapes.push(copy);
      this._shapesById.set(copy.id, copy);
      newIds.push(copy.id);
    }
    this.selectedIds = new Set(newIds);
    this._markAllDirty();
    this.render();
    this._emitChange('shape:paste', { shapeIds: newIds });
    this._emitSelect();
    return this;
  }

  duplicate() {
    this.copy();
    this.paste();
    return this;
  }

  // ── Snapping ─────────────────────────────────────────────────────────────
  _computeSnap(movingBounds, movingIds) {
    if (!this.snap) return { dx: 0, dy: 0, guides: [] };
    const threshold = SNAP_THRESHOLD / this.documentData.viewport.scale;
    const targetsX = [
      movingBounds.x,
      movingBounds.x + movingBounds.w / 2,
      movingBounds.x + movingBounds.w,
    ];
    const targetsY = [
      movingBounds.y,
      movingBounds.y + movingBounds.h / 2,
      movingBounds.y + movingBounds.h,
    ];
    let bestX = null;
    let bestY = null;
    const guides = [];
    for (const other of this.documentData.shapes) {
      if (movingIds.has(other.id)) continue;
      const b = shapeBounds(other);
      for (const t of targetsX)
        for (const l of [b.x, b.x + b.w / 2, b.x + b.w]) {
          const d = l - t;
          if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d)))
            bestX = { d, at: l };
        }
      for (const t of targetsY)
        for (const l of [b.y, b.y + b.h / 2, b.y + b.h]) {
          const d = l - t;
          if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d)))
            bestY = { d, at: l };
        }
    }
    if (bestX) guides.push({ x1: bestX.at, y1: -WORLD_EXTENT, x2: bestX.at, y2: WORLD_EXTENT });
    if (bestY) guides.push({ x1: -WORLD_EXTENT, y1: bestY.at, x2: WORLD_EXTENT, y2: bestY.at });
    return { dx: bestX ? bestX.d : 0, dy: bestY ? bestY.d : 0, guides };
  }

  // ── Export ───────────────────────────────────────────────────────────────
  _resolvedColors() {
    const cs = hasWindow() ? getComputedStyle(this.svg) : null;
    const read = (name, fallback) => {
      const v = cs?.getPropertyValue(name)?.trim();
      return v || fallback;
    };
    return {
      ink: read('--vd-draw-ink', '#1f2720'),
      shapeStroke: read('--vd-draw-shape-stroke', '#245f52'),
      text: read('--vd-draw-text', '#1f2720'),
      sticky: read('--vd-draw-sticky-fill', '#fdf3c4'),
    };
  }

  _getArrowMarkerId(color, defsTarget = this.defsEl) {
    const isDefault = !color;
    const safeKey = isDefault
      ? 'arrow'
      : 'arrow-' + color.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const id = this._svgId(safeKey);
    if (defsTarget && !defsTarget.querySelector(`#${id}`)) {
      const marker = createSvgEl('marker', {
        id,
        viewBox: '0 0 10 10',
        refX: 8,
        refY: 5,
        markerWidth: 7,
        markerHeight: 7,
        orient: 'auto-start-reverse',
      });
      marker.appendChild(
        createSvgEl('path', {
          d: 'M 0 0 L 10 5 L 0 10 z',
          fill: color || 'var(--vd-draw-shape-stroke)',
        }),
      );
      defsTarget.appendChild(marker);
    }
    return id;
  }

  toSVG() {
    const shapes = this.documentData.shapes;
    const bounds = boundsOfShapes(shapes) || { x: 0, y: 0, w: 100, h: 100 };
    const pad = 20;
    const vb = {
      x: bounds.x - pad,
      y: bounds.y - pad,
      w: Math.max(1, bounds.w) + pad * 2,
      h: Math.max(1, bounds.h) + pad * 2,
    };
    const colors = this._resolvedColors();
    const svg = createSvgEl('svg', {
      xmlns: SVG_NS,
      width: round(vb.w),
      height: round(vb.h),
      viewBox: `${round(vb.x)} ${round(vb.y)} ${round(vb.w)} ${round(vb.h)}`,
    });
    const defs = createSvgEl('defs');
    for (const shape of shapes) {
      const el = this._renderShapeEl(shape, { standalone: true, colors, defsTarget: defs });
      if (el) svg.appendChild(el);
    }
    if (defs.childNodes.length > 0) {
      svg.insertBefore(defs, svg.firstChild);
    }
    return new XMLSerializer().serializeToString(svg);
  }

  toPNG({ scale = 2 } = {}) {
    const markup = this.toSVG();
    const bounds = boundsOfShapes(this.documentData.shapes) || { w: 100, h: 100 };
    const pad = 20;
    const w = Math.max(1, (bounds.w || 100) + pad * 2);
    const h = Math.max(1, (bounds.h || 100) + pad * 2);
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(w * scale);
          canvas.height = Math.ceil(h * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('VdDraw: 2D canvas context unavailable'));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('VdDraw: failed to rasterize SVG'));
        img.src = url;
      } catch (err) {
        reject(err);
      }
    });
  }

  // ── History ──────────────────────────────────────────────────────────────
  _resetHistory() {
    this.history = [this.toJSON()];
    this.historyIndex = 0;
    this.lastReason = null;
    this.lastTargetKey = null;
  }

  _recordHistory(reason, targetKey) {
    if (!this.historyEnabled || this.isApplyingHistory) return;
    const snapshot = this.toJSON();
    const coalesce =
      COALESCE_REASONS.has(reason) &&
      reason === this.lastReason &&
      targetKey != null &&
      targetKey === this.lastTargetKey &&
      this.historyIndex >= 0 &&
      // Only coalesce onto the TOP of the stack. Without this guard a
      // coalescing edit made right after an undo overwrites an earlier
      // (non-top) snapshot, corrupting the redo branch and losing base state.
      // Mirrors the flowchart core's canCoalesce guard.
      this.historyIndex === this.history.length - 1;
    if (coalesce) {
      this.history[this.historyIndex] = snapshot;
    } else {
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(snapshot);
      this.historyIndex = this.history.length - 1;
      if (this.history.length > this.historyLimit + 1) {
        this.history.shift();
        this.historyIndex -= 1;
      }
    }
    this.lastReason = reason;
    this.lastTargetKey = targetKey ?? null;
  }

  _emitChange(reason, extra = {}, targetKey = null) {
    this._recordHistory(reason, targetKey);
    this._syncSelectionValidity();
    this.emit('change', { reason, document: this.toJSON(), ...extra });
  }

  canUndo() {
    return this.historyIndex > 0;
  }

  canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  undo() {
    if (!this.canUndo()) return this;
    this.historyIndex -= 1;
    this._applySnapshot(this.history[this.historyIndex], 'undo');
    return this;
  }

  redo() {
    if (!this.canRedo()) return this;
    this.historyIndex += 1;
    this._applySnapshot(this.history[this.historyIndex], 'redo');
    return this;
  }

  clearHistory() {
    this._resetHistory();
    this.emit('history', { reason: 'clear', canUndo: false, canRedo: false });
    return this;
  }

  _applySnapshot(snapshot, reason) {
    this.isApplyingHistory = true;
    const viewport = { ...this.documentData.viewport };
    this.documentData = deepClone(snapshot);
    this.documentData.viewport = viewport;
    this._rebuildShapeIndex();
    this._syncSelectionValidity();
    this._markAllDirty();
    this.render();
    this.emit('change', { reason, document: this.toJSON() });
    this.emit('history', { reason, canUndo: this.canUndo(), canRedo: this.canRedo() });
    this.isApplyingHistory = false;
  }

  // ── Serialization ──────────────────────────────────────────────────────
  toJSON() {
    return deepClone({
      version: VD_DRAW_VERSION,
      viewport: this.documentData.viewport,
      shapes: this.documentData.shapes,
    });
  }

  load(data) {
    this.documentData = normalizeDocument(data);
    this._rebuildShapeIndex();
    this.selectedIds.clear();
    this._resetHistory();
    this._markAllDirty();
    this.render();
    this._emitChange('load');
    this._emitSelect();
    return this;
  }

  clear() {
    if (!this.documentData.shapes.length) return this;
    this.documentData.shapes = [];
    this._shapesById.clear();
    this.selectedIds.clear();
    this._markAllDirty();
    this.render();
    this._emitChange('clear');
    return this;
  }

  // ── Text editing ─────────────────────────────────────────────────────────
  startTextEdit(id) {
    const shape = this.getShape(id);
    if (!shape || (shape.type !== 'text' && shape.type !== 'sticky') || this.readonly) return false;
    this.stopTextEdit({ commit: false });
    const editor = document.createElement('textarea');
    editor.className = 'vd-draw-text-editor';
    editor.value = shape.text || '';
    this.textEditor = { id, el: editor };
    this._positionTextEditor(shape, editor);
    this.textLayer.appendChild(editor);
    editor.focus();
    editor.addEventListener('blur', () => this.stopTextEdit({ commit: true }));
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.stopTextEdit({ commit: false });
    });
    return true;
  }

  _positionTextEditor(shape, editor) {
    const vp = this.documentData.viewport;
    const scale = vp.scale || 1;
    editor.style.left = `${vp.x + shape.x * scale}px`;
    editor.style.top = `${vp.y + shape.y * scale}px`;
    editor.style.width = `${shape.w * scale}px`;
    editor.style.height = `${shape.h * scale}px`;
    editor.style.fontSize = `${16 * scale}px`;
    editor.style.lineHeight = `${20 * scale}px`;
    if (shape.type === 'sticky') {
      editor.style.background = shape.fill || 'var(--vd-draw-sticky-fill)';
    }
  }

  stopTextEdit({ commit = true } = {}) {
    if (!this.textEditor) return;
    const { id, el } = this.textEditor;
    const value = el.value;
    this.textEditor = null;
    el.remove();
    if (commit) {
      const shape = this.getShape(id);
      if (shape && shape.text !== value) {
        shape.text = value;
        this._markDirty(id);
        this.render();
        this._emitChange('shape:text', { shapeId: id }, `text:${id}`);
      }
    }
  }

  // ── Pointer interaction ──────────────────────────────────────────────────
  _capture(pointerId) {
    if (typeof this.canvasEl.setPointerCapture === 'function') {
      try {
        this.canvasEl.setPointerCapture(pointerId);
      } catch {
        /* jsdom / unsupported — safe to ignore */
      }
    }
  }

  _handleToolbarClick(event) {
    const toolBtn = event.target.closest('[data-tool]');
    if (toolBtn) {
      this.setTool(toolBtn.getAttribute('data-tool'));
      return;
    }
    const actionBtn = event.target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.getAttribute('data-action');
    if (action === 'undo') this.undo();
    else if (action === 'redo') this.redo();
    else if (action === 'duplicate') this.duplicate();
    else if (action === 'delete') {
      // Delete the selection, or clear the whole canvas when nothing is selected.
      if (this.selectedIds.size) this.deleteSelection();
      else this.clear();
    }
  }

  _handlePanelClick(event) {
    const brushBtn = event.target.closest('[data-brush]');
    if (brushBtn) {
      this.setBrush(brushBtn.getAttribute('data-brush'));
      if (this.tool !== 'draw') this.setTool('draw');
      return;
    }
    const gridBtn = event.target.closest('[data-grid]');
    if (gridBtn) {
      this.toggleGrid();
      return;
    }
    const swatch = event.target.closest('[data-swatch]');
    if (swatch) this.setColor(swatch.getAttribute('data-swatch'));
  }

  _handlePanelInput(event) {
    const kind = event.target.getAttribute?.('data-style');
    if (kind === 'color') this.setColor(event.target.value);
    else if (kind === 'size') this.setBrushSize(Number(event.target.value));
    else if (kind === 'opacity') this.setOpacity(Number(event.target.value));
    else if (kind === 'grid') this.setGridSize(Number(event.target.value));
  }

  _handlePointerDown(event) {
    if (this.destroyed || (event.button != null && event.button !== 0)) return;
    this.canvasEl.focus();
    this.stopTextEdit({ commit: true });
    this._activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });

    if (this._activePointers.size === 2) {
      if (this.interaction) {
        const it = this.interaction;
        if (it.kind === 'freehand' || it.kind === 'create-line' || it.kind === 'create-box') {
          this.documentData.shapes = this.documentData.shapes.filter((s) => s.id !== it.shapeId);
          this._shapesById.delete(it.shapeId);
          const el = this._shapeElements.get(it.shapeId);
          if (el) {
            el.remove();
            this._shapeElements.delete(it.shapeId);
          }
          this._scheduleRender({ scene: true, overlay: false });
        } else if (it.kind === 'move' || it.kind === 'resize') {
          for (const orig of it.originals) {
            this._replaceShape(orig);
            this._markDirty(orig.id);
          }
          if (it.kind === 'move') this._renderGuides([]);
          this._scheduleRender({ scene: true });
        } else if (it.kind === 'erase') {
          // Cancel the erase: shapes were only hidden, not removed from the
          // model. Mark them dirty so the render pass rebuilds their DOM.
          for (const id of it.erased) this._markDirty(id);
          this._scheduleRender({ scene: true, overlay: false });
        } else if (it.kind === 'pan') {
          if (this.canvasEl) this.canvasEl.classList.remove('vd-draw-panning');
        } else if (it.kind === 'marquee') {
          clearChildren(this.marqueeLayer);
        }
      }

      const pts = [...this._activePointers.values()];
      const p1 = pts[0];
      const p2 = pts[1];
      const initialDistance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY) || 1;
      const initialClientMid = {
        x: (p1.clientX + p2.clientX) / 2,
        y: (p1.clientY + p2.clientY) / 2,
      };
      const initialLocalMid = this._clientToLocal(initialClientMid.x, initialClientMid.y);
      const initialVp = { ...this.documentData.viewport };
      const currentScale = initialVp.scale || 1;
      const worldMid = {
        x: (initialLocalMid.x - initialVp.x) / currentScale,
        y: (initialLocalMid.y - initialVp.y) / currentScale,
      };

      this.interaction = {
        kind: 'pinch',
        initialDistance,
        worldMid,
        initialScale: currentScale,
      };
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return;
    }

    const world = this._clientToWorld(event.clientX, event.clientY);
    const shapeTarget = event.target.closest('[data-shape-id]');
    const handleTarget = event.target.closest('[data-handle]');

    if (this.tool === 'hand') {
      this.interaction = this._beginPan(event);
      if (this.canvasEl) this.canvasEl.classList.add('vd-draw-panning');
      this._capture(event.pointerId);
      return;
    }

    if (this.tool === 'eraser' && !this.readonly) {
      this.interaction = { kind: 'erase', pointerId: event.pointerId, erased: new Set() };
      this._capture(event.pointerId);
      this._applyErase(world);
      return;
    }

    if (this.tool === 'select') {
      if (event.detail === 2 && shapeTarget && !this.readonly) {
        const id = shapeTarget.getAttribute('data-shape-id');
        const shape = this.getShape(id);
        if (shape && (shape.type === 'text' || shape.type === 'sticky')) {
          this.select(id);
          this.startTextEdit(id);
          return;
        }
      }
      if (handleTarget && this.selectedIds.size) {
        this.interaction = {
          kind: 'resize',
          pointerId: event.pointerId,
          handle: handleTarget.getAttribute('data-handle'),
          startBounds: boundsOfShapes(this.getSelectedShapes()),
          originals: this.getSelectedShapes().map((s) => deepClone(s)),
          start: world,
          moved: false,
        };
        this._capture(event.pointerId);
        return;
      }
      if (shapeTarget) {
        const id = shapeTarget.getAttribute('data-shape-id');
        if (!this.selectedIds.has(id)) this.select(id, { additive: event.shiftKey });
        this.interaction = {
          kind: 'move',
          pointerId: event.pointerId,
          start: world,
          originals: this.getSelectedShapes().map((s) => deepClone(s)),
          moved: false,
        };
        this._capture(event.pointerId);
        return;
      }
      if (!event.shiftKey) this.deselect();
      this.interaction = {
        kind: 'marquee',
        pointerId: event.pointerId,
        start: world,
        additive: event.shiftKey,
      };
      this._capture(event.pointerId);
      return;
    }

    if (this.readonly) return;
    this.interaction = this._beginCreate(this.tool, world, event);
    this._capture(event.pointerId);
  }

  _beginPan(event) {
    return {
      kind: 'pan',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: this.documentData.viewport.x,
      startY: this.documentData.viewport.y,
    };
  }

  _beginCreate(tool, world, event) {
    const pressure = event.pressure || 0.5;
    if (tool === 'draw') {
      const shape = {
        id: createId('fh'),
        type: 'freehand',
        brush: this.style.brush,
        color: this.style.color,
        size: this.style.size,
        opacity: this.style.opacity,
        points: [[round(world.x), round(world.y), pressure]],
      };
      this.documentData.shapes.push(shape);
      this._shapesById.set(shape.id, shape);
      return { kind: 'freehand', pointerId: event.pointerId, shapeId: shape.id };
    }
    if (tool === 'line') {
      const shape = {
        id: createId('ln'),
        type: 'line',
        points: [
          [round(world.x), round(world.y)],
          [round(world.x), round(world.y)],
        ],
        arrowEnd: true,
        arrowStart: false,
        color: this.style.color,
        strokeWidth: this._shapeStrokeWidth(),
        opacity: this.style.opacity,
      };
      this.documentData.shapes.push(shape);
      this._shapesById.set(shape.id, shape);
      return { kind: 'create-line', pointerId: event.pointerId, shapeId: shape.id };
    }
    const type = tool;
    const shape = {
      id: createId(type.slice(0, 2)),
      type,
      x: round(world.x),
      y: round(world.y),
      w: 1,
      h: 1,
      rotation: 0,
      color: this.style.color,
      strokeWidth: this._shapeStrokeWidth(),
      opacity: this.style.opacity,
    };
    if (type === 'text' || type === 'sticky') shape.text = '';
    this.documentData.shapes.push(shape);
    this._shapesById.set(shape.id, shape);
    return { kind: 'create-box', pointerId: event.pointerId, shapeId: shape.id, start: world };
  }

  _applyErase(world) {
    const it = this.interaction;
    if (!it || it.kind !== 'erase') return;
    const threshold = ERASER_RADIUS / this.documentData.viewport.scale;
    let changed = false;
    for (const shape of this.documentData.shapes) {
      if (it.erased.has(shape.id)) continue;
      if (distanceToShape(shape, world.x, world.y) <= threshold) {
        it.erased.add(shape.id);
        changed = true;
      }
    }
    if (changed) {
      for (const id of it.erased) this._markDirty(id);
      this._scheduleRender({ scene: true, overlay: false });
    }
  }

  _handlePointerMove(event) {
    if (this._activePointers.has(event.pointerId)) {
      this._activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    }
    const it = this.interaction;
    if (!it) return;

    if (it.kind === 'pinch') {
      if (this._activePointers.size >= 2) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        const pts = [...this._activePointers.values()];
        const p1 = pts[0];
        const p2 = pts[1];
        const curDistance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY) || 1;
        const curClientMid = {
          x: (p1.clientX + p2.clientX) / 2,
          y: (p1.clientY + p2.clientY) / 2,
        };
        const curLocalMid = this._clientToLocal(curClientMid.x, curClientMid.y);
        const distRatio = curDistance / it.initialDistance;
        const newScale = clamp(it.initialScale * distRatio, MIN_SCALE, MAX_SCALE);

        const vp = this.documentData.viewport;
        vp.scale = newScale;
        vp.x = curLocalMid.x - it.worldMid.x * newScale;
        vp.y = curLocalMid.y - it.worldMid.y * newScale;

        this._scheduleRender({ scene: false });
      }
      return;
    }

    if (it.kind === 'pan') {
      const vp = this.documentData.viewport;
      vp.x = it.startX + (event.clientX - it.startClientX);
      vp.y = it.startY + (event.clientY - it.startClientY);
      this._scheduleRender({ scene: false });
      return;
    }

    const world = this._clientToWorld(event.clientX, event.clientY);

    if (it.kind === 'erase') {
      this._applyErase(world);
      return;
    }

    if (it.kind === 'move') {
      const dx = world.x - it.start.x;
      const dy = world.y - it.start.y;
      if (Math.hypot(dx, dy) * this.documentData.viewport.scale > DRAG_THRESHOLD) it.moved = true;
      for (const orig of it.originals) this._replaceShape(translateShape(orig, dx, dy));
      const movingIds = new Set(it.originals.map((s) => s.id));
      const snap = this._computeSnap(boundsOfShapes(this.getSelectedShapes()), movingIds);
      if (snap.dx || snap.dy)
        for (const orig of it.originals)
          this._replaceShape(translateShape(orig, dx + snap.dx, dy + snap.dy));
      for (const orig of it.originals) this._markDirty(orig.id);
      this._renderGuides(snap.guides);
      this._scheduleRender({ scene: true, guides: false });
      return;
    }

    if (it.kind === 'resize') {
      const t = this._resizeBounds(
        it.startBounds,
        it.handle,
        world.x - it.start.x,
        world.y - it.start.y,
      );
      const sx = it.startBounds.w === 0 ? 1 : t.w / it.startBounds.w;
      const sy = it.startBounds.h === 0 ? 1 : t.h / it.startBounds.h;
      for (const orig of it.originals) {
        const scaled = scaleShape(orig, it.startBounds.x, it.startBounds.y, sx, sy);
        this._replaceShape(translateShape(scaled, t.x - it.startBounds.x, t.y - it.startBounds.y));
        this._markDirty(orig.id);
      }
      it.moved = true;
      this._scheduleRender();
      return;
    }

    if (it.kind === 'marquee') {
      it.current = world;
      this._renderMarquee(it.start, world);
      return;
    }

    if (it.kind === 'freehand') {
      const shape = this.getShape(it.shapeId);
      if (shape) {
        const raw = [round(world.x), round(world.y), event.pressure || 0.5];
        const preset = BRUSH_PRESETS[shape.brush] || BRUSH_PRESETS[DEFAULT_BRUSH];
        const smoothFactor = 1 - (preset.smoothing || 0.5) * 0.6;
        const prev = shape.points[shape.points.length - 1];
        const pt = prev ? smoothPoint(prev, raw, smoothFactor) : raw;
        appendAndSimplify(shape.points, pt);
        this._markDirty(it.shapeId);
        this._scheduleRender({ scene: true });
      }
      return;
    }

    if (it.kind === 'create-line') {
      const shape = this.getShape(it.shapeId);
      if (shape) {
        shape.points[1] = [round(world.x), round(world.y)];
        this._markDirty(it.shapeId);
        this._scheduleRender({ scene: true });
      }
      return;
    }

    if (it.kind === 'create-box') {
      const shape = this.getShape(it.shapeId);
      if (shape) {
        shape.x = round(Math.min(it.start.x, world.x));
        shape.y = round(Math.min(it.start.y, world.y));
        shape.w = round(Math.max(1, Math.abs(world.x - it.start.x)));
        shape.h = round(Math.max(1, Math.abs(world.y - it.start.y)));
        this._markDirty(it.shapeId);
        this._scheduleRender({ scene: true });
      }
    }
  }

  _resizeBounds(start, handle, dx, dy) {
    let { x, y, w, h } = start;
    if (handle.includes('e')) w = Math.max(1, start.w + dx);
    if (handle.includes('s')) h = Math.max(1, start.h + dy);
    if (handle.includes('w')) {
      w = Math.max(1, start.w - dx);
      x = start.x + (start.w - w);
    }
    if (handle.includes('n')) {
      h = Math.max(1, start.h - dy);
      y = start.y + (start.h - h);
    }
    return { x, y, w, h };
  }

  _handlePointerUp(event) {
    this._activePointers.delete(event.pointerId);
    const it = this.interaction;
    if (!it) return;

    if (it.kind === 'pinch') {
      if (this._activePointers.size < 2) {
        this.interaction = null;
        if (this.canvasEl) this.canvasEl.classList.remove('vd-draw-panning');
        this._emitViewportChange('viewport:pinch');
      }
      return;
    }

    this.interaction = null;
    if (this.canvasEl) this.canvasEl.classList.remove('vd-draw-panning');
    if (
      typeof this.canvasEl.releasePointerCapture === 'function' &&
      this.canvasEl.hasPointerCapture?.(event.pointerId)
    ) {
      try {
        this.canvasEl.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
    this._renderGuides([]);
    clearChildren(this.marqueeLayer);

    if (it.kind === 'pan') {
      this._emitViewportChange('viewport:pan');
      return;
    }
    if (it.kind === 'erase') {
      if (it.erased.size) {
        const ids = [...it.erased];
        for (const id of ids) this._shapesById.delete(id);
        this.documentData.shapes = this.documentData.shapes.filter((s) => !it.erased.has(s.id));
        this._markAllDirty();
        this.render();
        this._emitChange('shape:erase', { shapeIds: ids });
      }
      return;
    }
    if (it.kind === 'move' && it.moved) {
      this._markAllDirty();
      this.render();
      this._emitChange('shape:move', { shapeIds: [...this.selectedIds] });
      return;
    }
    if (it.kind === 'resize' && it.moved) {
      this._markAllDirty();
      this.render();
      this._emitChange('shape:resize', { shapeIds: [...this.selectedIds] });
      return;
    }
    if (it.kind === 'marquee') {
      const box = this._boxFromPoints(it.start, it.current || it.start);
      this.selectInBounds(box, { additive: it.additive });
      return;
    }
    if (it.kind === 'freehand' || it.kind === 'create-line' || it.kind === 'create-box') {
      const shape = this.getShape(it.shapeId);
      if (!shape) return;
      if (it.kind === 'freehand') shape.points = simplifyPoints(shape.points);
      const b = shapeBounds(shape);
      if (
        it.kind !== 'freehand' &&
        b.w < 2 &&
        b.h < 2 &&
        shape.type !== 'text' &&
        shape.type !== 'sticky'
      ) {
        this.documentData.shapes = this.documentData.shapes.filter((s) => s.id !== it.shapeId);
        this._shapesById.delete(it.shapeId);
        this._markAllDirty();
        this.render();
        return;
      }
      if (shape.type === 'text' || shape.type === 'sticky') {
        if (b.w < 2 && b.h < 2) {
          shape.w = shape.type === 'sticky' ? 160 : 120;
          shape.h = shape.type === 'sticky' ? 120 : 40;
        }
      }
      if (it.kind !== 'freehand') {
        this.select(shape.id);
        this.setTool('select');
      }
      this._markDirty(shape.id);
      this.render();
      this._emitChange('shape:add', { shape: deepClone(shape), shapeId: shape.id });
      if (shape.type === 'text' || shape.type === 'sticky') this.startTextEdit(shape.id);
    }
  }

  _boxFromPoints(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y),
    };
  }

  _handleWheel(event) {
    event.preventDefault();
    const local = this._clientToLocal(event.clientX, event.clientY);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.scaleAround(factor, local.x, local.y);
    this.render({ scene: false });
    this._emitViewportChange('viewport:zoom');
  }

  _handleKeyDown(event) {
    if (this.textEditor) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }
    if (meta && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectAll();
      return;
    }
    if (meta && event.key.toLowerCase() === 'c') {
      this.copy();
      return;
    }
    if (meta && event.key.toLowerCase() === 'v') {
      this.paste();
      return;
    }
    if (meta && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.duplicate();
      return;
    }
    if (this.readonly) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteSelection();
      return;
    }
    const nudgeMap = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (nudgeMap[event.key] && this.selectedIds.size) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const [dx, dy] = nudgeMap[event.key];
      this.nudge(dx * step, dy * step);
    }
  }

  _handleResize() {
    if (this.destroyed) return;
    this.render({ scene: false });
  }

  // ── Dirty tracking ──────────────────────────────────────────────────────
  _markDirty(shapeId) {
    this._dirtyShapes.add(shapeId);
  }

  _markAllDirty() {
    this._allDirty = true;
  }

  // ── rAF-batched render ─────────────────────────────────────────────────
  _scheduleRender(flags = {}) {
    this._pendingFlags = {
      scene: (this._pendingFlags?.scene ?? false) || flags.scene !== false,
      overlay: (this._pendingFlags?.overlay ?? false) || flags.overlay !== false,
    };
    if (this._rafId != null) return;
    this._rafId = (
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout
    )(() => {
      this._rafId = null;
      const f = this._pendingFlags || {};
      this._pendingFlags = null;
      this.render(f);
    });
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  render(flags = {}) {
    if (this.destroyed) return;
    const { scene = true, overlay = true } = flags;
    const vp = this.documentData.viewport;
    this.world.setAttribute('transform', `matrix(${vp.scale} 0 0 ${vp.scale} ${vp.x} ${vp.y})`);
    if (this.textEditor) {
      const activeShape = this.getShape(this.textEditor.id);
      if (activeShape) this._positionTextEditor(activeShape, this.textEditor.el);
    }
    if (scene) {
      this._renderSceneIncremental();
    }
    if (overlay) this._renderOverlay();
  }

  _renderSceneIncremental() {
    const shapes = this.documentData.shapes;
    const erasing =
      this.interaction && this.interaction.kind === 'erase' ? this.interaction.erased : null;

    // Build the set of shape ids that should be visible.
    const currentIds = new Set();
    for (const shape of shapes) {
      if (erasing && erasing.has(shape.id)) continue;
      currentIds.add(shape.id);
    }

    // Remove elements for shapes no longer present.
    for (const [id, el] of this._shapeElements) {
      if (!currentIds.has(id)) {
        el.remove();
        this._shapeElements.delete(id);
      }
    }

    // Determine whether this is a full rebuild.
    const fullRebuild = this._allDirty;

    // Add or update elements — walk in document order and rebuild the DOM
    // order only when necessary (avoids reflow when nothing moved).
    let prevEl = null;
    for (const shape of shapes) {
      if (!currentIds.has(shape.id)) continue;

      const needsUpdate = fullRebuild || this._dirtyShapes.has(shape.id);
      let el = this._shapeElements.get(shape.id);

      if (needsUpdate || !el) {
        // Re-create the SVG element for this shape.
        const newEl = this._renderShapeEl(shape, {});
        if (!newEl) {
          if (el) {
            el.remove();
            this._shapeElements.delete(shape.id);
          }
          continue;
        }
        if (el) {
          // Replace the existing element in place; paint order is normalized
          // below so replacing never has to move the node itself.
          el.replaceWith(newEl);
        } else {
          // Insert after the previous sibling, or prepend to shapesLayer.
          if (prevEl && prevEl.parentNode === this.shapesLayer) {
            prevEl.after(newEl);
          } else {
            this.shapesLayer.prepend(newEl);
          }
        }
        el = newEl;
        this._shapeElements.set(shape.id, el);
      }

      // Enforce DOM paint order == model order. Reorders (bringToFront,
      // sendToBack, undo/redo, load) change model order without marking
      // shapes dirty, so normalize position every frame. Nodes only move
      // when they are actually out of order.
      const expected = prevEl ? prevEl.nextElementSibling : this.shapesLayer.firstElementChild;
      if (el !== expected) this.shapesLayer.insertBefore(el, expected);

      prevEl = el;
    }

    this._dirtyShapes.clear();
    this._allDirty = false;
  }

  // Colors are applied via inline `style` (which wins over the CSS class rules
  // and serializes self-contained), so a picked color always renders.
  _renderShapeEl(shape, { standalone = false, colors = null, defsTarget = null } = {}) {
    let el = null;
    const setOpacity = (node) => {
      if (shape.opacity != null && shape.opacity !== 1)
        node.setAttribute('opacity', String(shape.opacity));
    };

    if (shape.type === 'freehand') {
      el = createSvgEl('path', { d: brushStrokePath(shape) });
      el.classList.add('vd-draw-ink');
      el.style.stroke = 'none';
      const fill = shape.color || (standalone && colors ? colors.ink : '');
      if (fill) el.style.fill = fill;
      if (shape.opacity != null && shape.opacity !== 1)
        el.style.fillOpacity = String(shape.opacity);
      const preset = BRUSH_PRESETS[shape.brush];
      if (preset && preset.blend && preset.blend !== 'normal') el.style.mixBlendMode = preset.blend;
    } else if (shape.type === 'rectangle') {
      el = createSvgEl('rect', { x: shape.x, y: shape.y, width: shape.w, height: shape.h, rx: 4 });
      el.classList.add('vd-draw-shape');
      this._applyShapeStroke(el, shape, standalone, colors);
      setOpacity(el);
    } else if (shape.type === 'ellipse') {
      el = createSvgEl('ellipse', {
        cx: shape.x + shape.w / 2,
        cy: shape.y + shape.h / 2,
        rx: shape.w / 2,
        ry: shape.h / 2,
      });
      el.classList.add('vd-draw-shape');
      this._applyShapeStroke(el, shape, standalone, colors);
      setOpacity(el);
    } else if (shape.type === 'line') {
      el = createSvgEl('path', {
        d: pointsToPath(shape.points, { smooth: Boolean(shape.smooth) }),
      });
      el.classList.add('vd-draw-shape');
      this._applyShapeStroke(el, shape, standalone, colors);
      setOpacity(el);
      const strokeColor = shape.color || (standalone && colors ? colors.shapeStroke : '');
      const targetDefs = defsTarget || this.defsEl;
      const markerId = this._getArrowMarkerId(strokeColor, targetDefs);
      if (shape.arrowEnd) el.setAttribute('marker-end', `url(#${markerId})`);
      if (shape.arrowStart) el.setAttribute('marker-start', `url(#${markerId})`);
    } else if (shape.type === 'text' || shape.type === 'sticky') {
      el = createSvgEl('g');
      setOpacity(el);
      if (shape.type === 'sticky') {
        const bg = createSvgEl('rect', {
          x: shape.x,
          y: shape.y,
          width: shape.w,
          height: shape.h,
          rx: 4,
        });
        bg.classList.add('vd-draw-sticky');
        if (shape.fill) bg.style.fill = shape.fill;
        else if (standalone && colors) bg.style.fill = colors.sticky;
        el.appendChild(bg);
      }
      const startX = (shape.x || 0) + (shape.type === 'sticky' ? 10 : 6);
      const startY = (shape.y || 0) + (shape.type === 'sticky' ? 14 : 18);
      const availWidth =
        shape.type === 'sticky'
          ? Math.max(20, (shape.w || 160) - 20)
          : shape.w && shape.w > 20
            ? shape.w - 12
            : 0;
      const lines = wrapText(shape.text || '', availWidth);

      const text = createSvgEl('text', {
        x: startX,
        y: startY,
        'xml:space': 'preserve',
      });
      text.classList.add('vd-draw-text');
      const fill = shape.color || (standalone && colors ? colors.text : '');
      if (fill) text.style.fill = fill;

      if (!lines.length) {
        text.textContent = '';
      } else {
        const lineHeight = 20;
        lines.forEach((lineText, idx) => {
          const tspan = createSvgEl('tspan', {
            x: startX,
            y: startY + idx * lineHeight,
          });
          tspan.textContent = lineText;
          text.appendChild(tspan);
        });
      }
      el.appendChild(text);
    }
    if (el && !standalone) el.setAttribute('data-shape-id', shape.id);
    return el;
  }

  _applyShapeStroke(el, shape, standalone, colors) {
    const stroke = shape.color || (standalone && colors ? colors.shapeStroke : '');
    if (stroke) el.style.stroke = stroke;
    if (shape.strokeWidth != null) el.setAttribute('stroke-width', String(shape.strokeWidth));
    el.style.fill = shape.fill ? shape.fill : 'none';
  }

  _renderOverlay() {
    clearChildren(this.overlayLayer);
    const selected = this.getSelectedShapes();
    if (!selected.length || this.readonly) return;
    const bounds = boundsOfShapes(selected);
    if (!bounds) return;
    const box = createSvgEl('rect', {
      class: 'vd-draw-selection-box',
      x: bounds.x,
      y: bounds.y,
      width: bounds.w,
      height: bounds.h,
      fill: 'none',
    });
    box.setAttribute('vector-effect', 'non-scaling-stroke');
    this.overlayLayer.appendChild(box);
    const scale = this.documentData.viewport.scale || 1;
    const r = HANDLE_SIZE / scale / 2;
    for (const handle of resizeHandlePositions(bounds)) {
      const dot = createSvgEl('rect', {
        class: 'vd-draw-handle',
        x: handle.x - r,
        y: handle.y - r,
        width: r * 2,
        height: r * 2,
        'data-handle': handle.key,
      });
      dot.setAttribute('vector-effect', 'non-scaling-stroke');
      this.overlayLayer.appendChild(dot);
    }
  }

  _renderMarquee(a, b) {
    clearChildren(this.marqueeLayer);
    const box = this._boxFromPoints(a, b);
    const rect = createSvgEl('rect', {
      class: 'vd-draw-marquee-rect',
      x: box.x,
      y: box.y,
      width: box.w,
      height: box.h,
    });
    rect.setAttribute('vector-effect', 'non-scaling-stroke');
    this.marqueeLayer.appendChild(rect);
  }

  _renderGuides(guides) {
    clearChildren(this.guidesLayer);
    for (const g of guides || []) {
      const line = createSvgEl('line', {
        class: 'vd-draw-guide',
        x1: g.x1,
        y1: g.y1,
        x2: g.x2,
        y2: g.y2,
      });
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      this.guidesLayer.appendChild(line);
    }
  }

  // ── Ready + lifecycle ────────────────────────────────────────────────────
  _scheduleReady() {
    const fire = () => {
      if (this.destroyed || this._ready) return;
      this._ready = true;
      if (this.autoFit) this.fitView();
      this.emit('ready', this);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fire);
    else setTimeout(fire, 0);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this._rafId != null) {
      (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout)(
        this._rafId,
      );
      this._rafId = null;
    }
    this.stopTextEdit({ commit: false });
    this._unbindEvents();
    this.listeners.clear();
    this._activePointers.clear();
    this._shapesById.clear();
    this._shapeElements.clear();
    if (this.element) this.element.replaceChildren();
  }
}
