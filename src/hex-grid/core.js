// VdHexGrid - Dynamic controllable Hex Grid API for Vanduo framework
// Based on web-civ HexGrid implementation
// Enables developers to use hex grids as components and game devs creating web civ-like games

import {
  hexToPixel,
  pixelToHex,
  getHexCorners,
  getAdjacentHexes,
  hexDistance,
  TerrainType,
  isPassable,
  getMovementCost,
  getTerrainYields,
  getTerrainColor,
} from './hex-math.js';

// Constants
export const VD_HEX_VERSION = '1.2.0';
// Zoom defaults; every instance may override them through constructor options
// or setZoomLimits() (minScale/maxScale bound transform.scale, zoomFactor is the
// wheel step, zoomStep the zoomIn/zoomOut multiplier).
const DEFAULT_MIN_SCALE = 0.3;
const DEFAULT_MAX_SCALE = 3.0;
const DEFAULT_ZOOM_FACTOR = 0.1;
const DEFAULT_ZOOM_STEP = 1.2;
const DRAG_THRESHOLD = 2;

// Adaptive rendering: above this many visible cells a gesture (pan/zoom) blits
// the last sharp frame instead of rebuilding the grid each frame; a sharp
// culled re-render follows after this idle window (or on pointer up).
const FAST_RENDER_LIMIT = 8000;
const SHARP_IDLE_MS = 120;
// Cap the device-pixel-ratio multiplier to bound frame-buffer memory
// (a 1500x670 pane at 2x is ~16 MB).
const MAX_PIXEL_RATIO = 2;
// Minimum spatial bucket edge in world units.
const MIN_BUCKET_SIZE = 64;

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/**
 * VdHexGrid - A dynamic controllable hex grid component
 *
 * @example
 * const grid = new VdHexGrid({
 *     element: document.getElementById('container'),
 *     canvas: document.getElementById('canvas'),
 *     size: 30,
 *     width: 15,
 *     height: 10,
 *     rotation: 0 // Optional rotation in radians
 * });
 *
 * grid.on('select', (hex) => {
 *     console.log('Selected:', hex.q, hex.r);
 * });
 */
export class VdHexGrid {
  static VERSION = VD_HEX_VERSION;

  constructor({
    element,
    canvas,
    size = 30,
    width = 10,
    height = 10,
    rotation = 0,
    pixelRatio = 'auto',
    cull = true,
    minScale = DEFAULT_MIN_SCALE,
    maxScale = DEFAULT_MAX_SCALE,
    zoomFactor = DEFAULT_ZOOM_FACTOR,
    zoomStep = DEFAULT_ZOOM_STEP,
  }) {
    this.element = element;
    this.canvas = canvas;
    this.size = size;
    this.width = width;
    this.height = height;
    this.rotation = rotation;
    /** `number | 'auto'` — canvas backing-store multiplier. */
    this.pixelRatio = pixelRatio;
    /** Viewport culling on/off. */
    this.cull = cull;
    /** Zoom bounds applied to transform.scale. */
    this.minScale = minScale;
    this.maxScale = maxScale;
    /** Wheel/pinch zoom step (fraction of the current scale). */
    this.zoomFactor = zoomFactor;
    /** zoomIn/zoomOut multiplier (mirrors the draw component's 1.2). */
    this.zoomStep = zoomStep;
    this.hexes = new Map();
    this.selectedHex = null;
    this.listeners = {};

    // Spatial bucket index: Map<"bx,by", HexCell[]> rebuilt by _generateGrid().
    this._bucketSize = Math.max(size * 2, MIN_BUCKET_SIZE);
    this._index = new Map();

    // Adaptive gesture-render state.
    this._gestureCancel = null;
    this._sharpTimer = null;
    this._frameCanvas = null;
    this._frameCtx = null;
    this._frameTransform = null;
    this._stats = {
      total: 0,
      visible: 0,
      drawn: 0,
      mode: 'sharp',
      lastRenderMs: 0,
      pixelRatio: 1,
      scale: 1,
    };

    // Transform state for pan/zoom
    this.transform = { x: 0, y: 0, scale: 1 };

    // Drag state
    this.dragging = false;
    this.lastPos = null;
    this.hasMoved = false;

    // Theme colors
    this.themeColors = this._getThemeColors();

    // Custom render callback
    this.customRenderCallback = null;

    // Set up canvas if not already done
    if (!this.canvas) {
      this.canvas = element.querySelector('canvas') || document.createElement('canvas');
      if (!element.contains(this.canvas)) {
        element.appendChild(this.canvas);
      }
    }

    this.ctx = this.canvas.getContext('2d');

    // Generate the grid
    this._generateGrid();
    this._render();
    this._setupEvents();

    // Observe theme changes
    this._observeThemeChanges();
  }

  /**
   * Get theme colors from CSS custom properties
   */
  _getThemeColors() {
    const root = document.documentElement;
    const style = getComputedStyle(root);

    // Prefer Vanduo's canonical --vd-* tokens; fall back to the legacy
    // unprefixed names, then to a hardcoded default.
    const read = (token, legacy, fallback) =>
      style.getPropertyValue(token).trim() || style.getPropertyValue(legacy).trim() || fallback;

    return {
      bgPrimary: read('--vd-bg-primary', '--bg-primary', '#ffffff'),
      bgSecondary: read('--vd-bg-secondary', '--bg-secondary', '#f5f5f5'),
      borderColor: read('--vd-border-color', '--border-color', '#e0e0e0'),
      colorPrimary: read('--vd-color-primary', '--color-primary', '#3b82f6'),
      textColor: read('--vd-text-primary', '--text-primary', '#1f2937'),
      textMuted: read('--vd-text-muted', '--text-muted', '#6b7280'),
    };
  }

  /**
   * Observe theme changes and re-render when theme changes
   */
  _observeThemeChanges() {
    const reTheme = () => {
      this.themeColors = this._getThemeColors();
      this._render();
    };

    // Re-render when the document theme attribute flips (e.g. data-theme).
    this._themeObserver = new MutationObserver(reTheme);
    this._themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    // Also follow OS-level light/dark changes that flip token values through a
    // prefers-color-scheme media query without touching any attribute.
    if (typeof window !== 'undefined' && window.matchMedia) {
      this._themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
      this._themeMediaHandler = reTheme;
      this._themeMedia.addEventListener('change', this._themeMediaHandler);
    }
  }

  /**
   * Disconnect theme listeners. Call before discarding the instance (for example
   * on SPA navigation) to avoid leaking observers and media-query listeners.
   */
  destroy() {
    this._teardownEvents();
    this._cancelGestureRender();
    if (this._sharpTimer) {
      clearTimeout(this._sharpTimer);
      this._sharpTimer = null;
    }
    this._frameCanvas = null;
    this._frameCtx = null;
    this._frameTransform = null;
    if (this._themeObserver) {
      this._themeObserver.disconnect();
      this._themeObserver = null;
    }
    if (this._themeMedia && this._themeMediaHandler) {
      this._themeMedia.removeEventListener('change', this._themeMediaHandler);
      this._themeMedia = null;
      this._themeMediaHandler = null;
    }
  }

  /**
   * Resolve the effective device-pixel-ratio multiplier.
   * @returns {number}
   */
  _resolvePixelRatio() {
    const requested = this.pixelRatio;
    if (requested === 'auto' || requested == null) {
      const dpr =
        typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number'
          ? window.devicePixelRatio
          : 1;
      return Math.max(1, Math.min(dpr || 1, MAX_PIXEL_RATIO));
    }
    const n = Number(requested);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  /** Request an animation frame, returning a cancel function. */
  _requestFrame(callback) {
    if (typeof requestAnimationFrame === 'function') {
      const id = requestAnimationFrame(callback);
      return () => cancelAnimationFrame(id);
    }
    const id = setTimeout(callback, 16);
    return () => clearTimeout(id);
  }

  /** Cancel a pending gesture frame, if any. */
  _cancelGestureRender() {
    if (this._gestureCancel) {
      this._gestureCancel();
      this._gestureCancel = null;
    }
  }

  /**
   * Coalesce gesture-driven transform changes into at most one render/frame.
   */
  _scheduleGestureRender() {
    if (this._gestureCancel) return;
    this._gestureCancel = this._requestFrame(() => {
      this._gestureCancel = null;
      this._renderGesture();
    });
  }

  /**
   * Schedule a sharp culled re-render after the gesture goes idle.
   */
  _scheduleSharpRender() {
    if (this._sharpTimer) clearTimeout(this._sharpTimer);
    this._sharpTimer = setTimeout(() => {
      this._sharpTimer = null;
      this._render();
    }, SHARP_IDLE_MS);
  }

  /** Render the current gesture frame (fast blit or sharp, adaptively). */
  _renderGesture() {
    const visible = this.cull ? this._computeVisibleHexes() : null;
    const count = visible ? visible.length : this.hexes.size;
    if (count > FAST_RENDER_LIMIT && this._frameCanvas) {
      this._blitFrame(visible);
    } else {
      this._render(visible);
    }
    this._scheduleSharpRender();
  }

  /**
   * Blit the last sharp frame snapshot offset/scaled for the current transform.
   * The snapshot is in screen (CSS) space at `_frameTransform`; this maps the
   * pixel under the old transform to its position under the current transform.
   */
  _blitFrame(visible) {
    const frame = this._frameCanvas;
    const from = this._frameTransform;
    if (!frame || !from || !frame.width || !frame.height) {
      this._render();
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const displayWidth = rect.width || 800;
    const displayHeight = rect.height || 400;
    const ratio = this._resolvePixelRatio();
    const { x, y, scale } = this.transform;
    const k = scale / (from.scale || 1);
    const bx = x - k * from.x;
    const by = y - k * from.y;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = this.themeColors.bgPrimary;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.drawImage(
      frame,
      0,
      0,
      frame.width,
      frame.height,
      bx,
      by,
      displayWidth * k,
      displayHeight * k,
    );
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    this._stats.total = this.hexes.size;
    this._stats.visible = visible ? visible.length : this.hexes.size;
    this._stats.drawn = 0;
    this._stats.mode = 'fast';
    this._stats.pixelRatio = ratio;
    this._stats.scale = scale;
    this._stats.lastRenderMs = 0;
  }

  /**
   * Capture the current canvas into the offscreen frame snapshot.
   */
  _captureFrame() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return;
    if (!this._frameCanvas) {
      this._frameCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      if (!this._frameCanvas) return;
    }
    const frame = this._frameCanvas;
    if (frame.width !== w) frame.width = w;
    if (frame.height !== h) frame.height = h;
    const fctx = frame.getContext('2d');
    if (!fctx) return;
    this._frameCtx = fctx;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, w, h);
    fctx.drawImage(this.canvas, 0, 0);
    this._frameTransform = { ...this.transform };
  }

  /**
   * Compute the cells intersecting the current viewport (always culled by the
   * viewport, independent of the `cull` render switch). Uses the spatial bucket
   * index when present.
   * @returns {HexCell[]}
   */
  _computeVisibleHexes() {
    const rect = this.canvas.getBoundingClientRect();
    const displayWidth = rect.width || 800;
    const displayHeight = rect.height || 400;
    const { x, y, scale } = this.transform;
    const minX = -x / scale - this.size;
    const maxX = (displayWidth - x) / scale + this.size;
    const minY = -y / scale - this.size;
    const maxY = (displayHeight - y) / scale + this.size;

    if (!this._index || this._index.size === 0) return this.getAllHexes();

    const bs = this._bucketSize;
    const bx0 = Math.floor(minX / bs);
    const bx1 = Math.floor(maxX / bs);
    const by0 = Math.floor(minY / bs);
    const by1 = Math.floor(maxY / bs);
    const out = [];
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const bucket = this._index.get(`${bx},${by}`);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const hex = bucket[i];
          if (hex.x >= minX && hex.x <= maxX && hex.y >= minY && hex.y <= maxY) {
            out.push(hex);
          }
        }
      }
    }
    return out;
  }

  /**
   * Get the cells intersecting the current viewport, sorted by row then column.
   * @returns {HexCell[]}
   */
  getVisibleHexes() {
    return this._computeVisibleHexes().sort((a, b) => a.r - b.r || a.q - b.q);
  }

  /**
   * Last-frame render metrics.
   * @returns {{total: number, visible: number, drawn: number, mode: string, lastRenderMs: number, pixelRatio: number, scale: number}}
   */
  getRenderStats() {
    return { ...this._stats };
  }

  /**
   * Set the device-pixel-ratio multiplier and re-render (no grid regeneration).
   * @param {number|'auto'} ratio
   */
  setPixelRatio(ratio) {
    this.pixelRatio = ratio;
    this._render();
  }

  /**
   * Toggle viewport culling and re-render (no grid regeneration).
   * @param {boolean} cull
   */
  setCull(cull) {
    this.cull = !!cull;
    this._render();
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  _screenToWorld(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;

    return {
      x: (canvasX - this.transform.x) / this.transform.scale,
      y: (canvasY - this.transform.y) / this.transform.scale,
    };
  }

  /**
   * Convert client coordinates to canvas-local coordinates
   */
  _clientToCanvas(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  /**
   * Generate hex grid data
   */
  _generateGrid() {
    this.hexes.clear();
    this._bucketSize = Math.max(this.size * 2, MIN_BUCKET_SIZE);
    this._index = new Map();

    for (let r = 0; r < this.height; r++) {
      const qOffset = Math.floor(r / 2);
      for (let q = -qOffset; q < this.width - qOffset; q++) {
        const pixel = hexToPixel(q, r, this.size, this.rotation);

        const hex = {
          q,
          r,
          x: pixel.x,
          y: pixel.y,
          fill: this.themeColors.bgSecondary,
          stroke: this.themeColors.borderColor,
          adjacent: getAdjacentHexes(q, r),
          terrain: null,
          data: {},
        };
        this.hexes.set(`${q},${r}`, hex);

        const bx = Math.floor(hex.x / this._bucketSize);
        const by = Math.floor(hex.y / this._bucketSize);
        const key = `${bx},${by}`;
        let bucket = this._index.get(key);
        if (!bucket) {
          bucket = [];
          this._index.set(key, bucket);
        }
        bucket.push(hex);
      }
    }
  }

  /**
   * Keep selected hex reference in sync after grid regeneration
   */
  _resyncSelectedHex() {
    if (!this.selectedHex) return;
    this.selectedHex = this.hexes.get(`${this.selectedHex.q},${this.selectedHex.r}`) ?? null;
  }

  /**
   * Render the hex grid on canvas (synchronous sharp render).
   *
   * @param {HexCell[]|null} [precomputedVisible] - Visible cells to draw when
   *   culling is on; computed from the viewport when omitted.
   */
  _render(precomputedVisible) {
    const started = now();
    // Get canvas displayed size
    const rect = this.canvas.getBoundingClientRect();
    const displayWidth = rect.width || 800;
    const displayHeight = rect.height || 400;

    // Set canvas internal resolution to CSS size x device-pixel-ratio.
    const ratio = this._resolvePixelRatio();
    const bufferWidth = Math.max(1, Math.round(displayWidth * ratio));
    const bufferHeight = Math.max(1, Math.round(displayHeight * ratio));
    if (this.canvas.width !== bufferWidth) this.canvas.width = bufferWidth;
    if (this.canvas.height !== bufferHeight) this.canvas.height = bufferHeight;

    // Clear canvas with theme background (in device pixels).
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = this.themeColors.bgPrimary;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw in CSS/world coordinates on top of the DPR scale.
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.save();
    this.ctx.translate(this.transform.x, this.transform.y);
    this.ctx.scale(this.transform.scale, this.transform.scale);

    const visible =
      this.cull && this._index && this._index.size > 0
        ? precomputedVisible || this._computeVisibleHexes()
        : null;

    let drawn = 0;
    const drawHex = (hex) => {
      this._drawHex(hex);
      drawn += 1;
      // Call custom render callback if set
      if (this.customRenderCallback) {
        this.customRenderCallback(this.ctx, hex, this.size);
      }
    };

    if (visible) {
      for (let i = 0; i < visible.length; i++) drawHex(visible[i]);
    } else {
      this.hexes.forEach(drawHex);
    }

    // Redraw selected hex if any (always, even when culled off-screen)
    if (this.selectedHex) {
      this._drawHex(this.selectedHex, true);
    }

    this.ctx.restore();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    this._stats.total = this.hexes.size;
    this._stats.visible = visible ? visible.length : this.hexes.size;
    this._stats.drawn = drawn;
    this._stats.mode = 'sharp';
    this._stats.pixelRatio = ratio;
    this._stats.scale = this.transform.scale;
    this._stats.lastRenderMs = now() - started;

    this._captureFrame();
  }

  /**
   * Draw a single hex
   */
  _drawHex(hex, isSelected = false) {
    const corners = getHexCorners(hex.x, hex.y, this.size, this.rotation);

    this.ctx.beginPath();
    this.ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
      this.ctx.lineTo(corners[i].x, corners[i].y);
    }
    this.ctx.closePath();

    // Determine fill color: terrain > custom fill > theme
    let fill;
    if (isSelected) {
      fill = this.themeColors.colorPrimary;
    } else if (hex.terrain) {
      fill = getTerrainColor(hex.terrain);
    } else if (hex.fill) {
      fill = hex.fill;
    } else {
      fill = this.themeColors.bgSecondary;
    }
    this.ctx.fillStyle = fill;
    this.ctx.fill();

    // Stroke with theme color
    const stroke = isSelected
      ? this.themeColors.colorPrimary
      : hex.stroke || this.themeColors.borderColor;
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = isSelected ? 3 : 1;
    this.ctx.stroke();

    // Draw coordinates for selected hex
    if (isSelected) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '10px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(`${hex.q},${hex.r}`, hex.x, hex.y);
    }
  }

  /**
   * Set up mouse/touch events for hex selection, pan, and zoom
   */
  _setupEvents() {
    // Touch state for pinch-to-zoom
    this.touchState = {
      initialDistance: 0,
      initialScale: 1,
      touches: [],
    };

    // Handlers are stored as named references so destroy() can remove every one
    // of them. The canvas may be caller-supplied and reused across grid
    // instances, so anonymous listeners left attached would leak.
    this._canvasHandlers = {
      // Pan - pointer down
      pointerdown: (e) => {
        this.dragging = true;
        this.hasMoved = false;
        this.lastPos = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
      },

      // Pan - pointer move
      pointermove: (e) => {
        if (!this.dragging) return;

        const cur = { x: e.clientX, y: e.clientY };
        const dx = cur.x - this.lastPos.x;
        const dy = cur.y - this.lastPos.y;

        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          this.hasMoved = true;
        }

        this.transform.x += dx;
        this.transform.y += dy;
        this.lastPos = cur;
        this._scheduleGestureRender();
      },

      // Pan - pointer up / leave (shared stopDrag)
      pointerup: () => {
        const wasDragging = this.dragging;
        this.dragging = false;
        if (wasDragging) {
          // Finish the gesture with a synchronous sharp frame.
          this._cancelGestureRender();
          if (this._sharpTimer) {
            clearTimeout(this._sharpTimer);
            this._sharpTimer = null;
          }
          this._render();
        }
        if (!this.hasMoved) {
          this.canvas.style.cursor = 'pointer';
        }
      },

      // Click (tap without drag)
      click: (e) => {
        if (this.hasMoved) return;

        const worldPos = this._screenToWorld(e.clientX, e.clientY);
        const hexCoords = pixelToHex(worldPos.x, worldPos.y, this.size, this.rotation);
        const hex = this.hexes.get(`${hexCoords.q},${hexCoords.r}`);

        if (hex) {
          this.selectedHex = hex;
          this._render();
          this._emit('select', hex);
        }
      },

      // Zoom - mouse wheel
      wheel: (e) => {
        e.preventDefault();

        const factor = e.deltaY > 0 ? 1 - this.zoomFactor : 1 + this.zoomFactor;
        const mouse = this._clientToCanvas(e.clientX, e.clientY);
        if (this._applyZoom(factor, mouse.x, mouse.y)) {
          this._scheduleGestureRender();
          this._emit('zoom', { scale: this.transform.scale });
        }
      },

      // Touch events for pinch-to-zoom
      touchstart: (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          this.touchState.touches = Array.from(e.touches);
          this.touchState.initialDistance = this._getTouchDistance(e.touches);
          this.touchState.initialScale = this.transform.scale;
        }
      },

      touchmove: (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const currentDistance = this._getTouchDistance(e.touches);
          const scale =
            (currentDistance / this.touchState.initialDistance) * this.touchState.initialScale;
          const factor = this.transform.scale > 0 ? scale / this.transform.scale : 1;

          // Zoom toward center of pinch
          const centerClientX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const centerClientY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const center = this._clientToCanvas(centerClientX, centerClientY);

          if (this._applyZoom(factor, center.x, center.y)) {
            this._scheduleGestureRender();
            this._emit('zoom', { scale: this.transform.scale });
          }
        }
      },

      touchend: () => {
        this.touchState.touches = [];
        this._cancelGestureRender();
        if (this._sharpTimer) {
          clearTimeout(this._sharpTimer);
          this._sharpTimer = null;
        }
        this._render();
      },

      // Cursor style
      mouseenter: () => {
        this.canvas.style.cursor = 'grab';
      },

      mouseleave: () => {
        this.canvas.style.cursor = 'default';
      },
    };

    const h = this._canvasHandlers;
    this.canvas.addEventListener('pointerdown', h.pointerdown);
    this.canvas.addEventListener('pointermove', h.pointermove);
    this.canvas.addEventListener('pointerup', h.pointerup);
    this.canvas.addEventListener('pointerleave', h.pointerup);
    this.canvas.addEventListener('click', h.click);
    this.canvas.addEventListener('wheel', h.wheel, { passive: false });
    this.canvas.addEventListener('touchstart', h.touchstart, { passive: false });
    this.canvas.addEventListener('touchmove', h.touchmove, { passive: false });
    this.canvas.addEventListener('touchend', h.touchend);
    this.canvas.addEventListener('mouseenter', h.mouseenter);
    this.canvas.addEventListener('mouseleave', h.mouseleave);
  }

  /**
   * Remove every canvas listener attached by _setupEvents(). Called from
   * destroy() so a caller-supplied, reused canvas does not accumulate handlers.
   */
  _teardownEvents() {
    const h = this._canvasHandlers;
    if (!h || !this.canvas) return;
    this.canvas.removeEventListener('pointerdown', h.pointerdown);
    this.canvas.removeEventListener('pointermove', h.pointermove);
    this.canvas.removeEventListener('pointerup', h.pointerup);
    this.canvas.removeEventListener('pointerleave', h.pointerup);
    this.canvas.removeEventListener('click', h.click);
    this.canvas.removeEventListener('wheel', h.wheel);
    this.canvas.removeEventListener('touchstart', h.touchstart);
    this.canvas.removeEventListener('touchmove', h.touchmove);
    this.canvas.removeEventListener('touchend', h.touchend);
    this.canvas.removeEventListener('mouseenter', h.mouseenter);
    this.canvas.removeEventListener('mouseleave', h.mouseleave);
    this._canvasHandlers = null;
  }

  /**
   * Calculate distance between two touch points
   * @param {TouchList} touches - Touch list
   * @returns {number} Distance in pixels
   */
  _getTouchDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Set hex size
   */
  setSize(size) {
    this.size = size;
    this._generateGrid();
    this._resyncSelectedHex();
    this._render();
  }

  /**
   * Set grid dimensions
   */
  setDimensions(width, height) {
    this.width = width;
    this.height = height;
    this._generateGrid();
    this._resyncSelectedHex();
    this._render();
  }

  /**
   * Reset grid to defaults
   */
  reset() {
    this.size = 30;
    this.width = 15;
    this.height = 10;
    this.rotation = 0;
    this.selectedHex = null;
    this.transform = { x: 0, y: 0, scale: 1 };
    this._generateGrid();
    this._render();
  }

  /**
   * Fill hexes with random colors
   */
  fillRandom() {
    const colors = [
      '#f0f0f0',
      '#d4e5d4',
      '#e5d4d4',
      '#d4d4e5',
      '#e5e5d4',
      '#d4e5e5',
      '#e8e8e8',
      '#d0d0d0',
    ];
    this.hexes.forEach((hex) => {
      hex.fill = colors[Math.floor(Math.random() * colors.length)];
    });
    this._render();
  }

  /**
   * Get hex by coordinates
   */
  getHex(q, r) {
    return this.hexes.get(`${q},${r}`);
  }

  /**
   * Get all hexes
   */
  getAllHexes() {
    return Array.from(this.hexes.values());
  }

  /**
   * Set hex fill color
   */
  setHexFill(q, r, color) {
    const hex = this.hexes.get(`${q},${r}`);
    if (hex) {
      hex.fill = color;
      this._render();
    }
  }

  /**
   * Reset view to default position
   */
  resetView() {
    this.transform = { x: 0, y: 0, scale: this._clampScale(1) };
    this._render();
    this._emit('pan', { x: 0, y: 0 });
    this._emit('zoom', { scale: this.transform.scale });
  }

  /**
   * Clamp a scale into the instance's [minScale, maxScale] range.
   * @param {number} scale
   * @returns {number}
   */
  _clampScale(scale) {
    const min = Number.isFinite(this.minScale) ? this.minScale : DEFAULT_MIN_SCALE;
    const max = Number.isFinite(this.maxScale) ? this.maxScale : DEFAULT_MAX_SCALE;
    return Math.max(min, Math.min(scale, max));
  }

  /**
   * Apply a zoom factor about a canvas-local anchor without rendering.
   * The anchor's screen position is preserved, so the world point under the
   * cursor/centre stays put. Returns whether the scale actually changed.
   * @param {number} factor - multiplier applied to the current scale
   * @param {number} localX - anchor X in canvas-local (CSS) coordinates
   * @param {number} localY - anchor Y in canvas-local (CSS) coordinates
   * @returns {boolean}
   */
  _applyZoom(factor, localX, localY) {
    if (!Number.isFinite(factor) || factor <= 0) return false;
    const current = this.transform.scale;
    if (!Number.isFinite(current) || current <= 0) return false;
    const next = this._clampScale(current * factor);
    if (next === current) return false;
    const applied = next / current;
    this.transform.x = localX - (localX - this.transform.x) * applied;
    this.transform.y = localY - (localY - this.transform.y) * applied;
    this.transform.scale = next;
    return true;
  }

  /**
   * Zoom about a canvas-local anchor point (mirrors VdDraw.scaleAround).
   * @param {number} factor - multiplier applied to the current scale
   * @param {number} localX - anchor X in canvas-local (CSS) coordinates
   * @param {number} localY - anchor Y in canvas-local (CSS) coordinates
   * @returns {this}
   */
  scaleAround(factor, localX, localY) {
    if (this._applyZoom(factor, localX, localY)) {
      this._render();
      this._emit('zoom', { scale: this.transform.scale });
    }
    return this;
  }

  /**
   * Update the zoom limits/step at runtime. Only finite, positive values are
   * accepted; `minScale` is kept at or below `maxScale`. The current scale is
   * reclamped into the new range and the grid re-renders.
   * @param {{minScale?: number, maxScale?: number, zoomFactor?: number, zoomStep?: number}} limits
   * @returns {this}
   */
  setZoomLimits({ minScale, maxScale, zoomFactor, zoomStep } = {}) {
    if (Number.isFinite(minScale) && minScale > 0) this.minScale = minScale;
    if (Number.isFinite(maxScale) && maxScale > 0) this.maxScale = maxScale;
    if (this.minScale > this.maxScale) this.maxScale = this.minScale;
    if (Number.isFinite(zoomFactor) && zoomFactor > 0) this.zoomFactor = zoomFactor;
    if (Number.isFinite(zoomStep) && zoomStep > 1) this.zoomStep = zoomStep;
    const clamped = this._clampScale(this.transform.scale);
    if (clamped !== this.transform.scale) {
      this.transform.scale = clamped;
      this._render();
      this._emit('zoom', { scale: clamped });
    }
    return this;
  }

  /**
   * Zoom in one step about the viewport centre
   */
  zoomIn() {
    return this._zoomAtCentre(this.zoomStep);
  }

  /**
   * Zoom out one step about the viewport centre
   */
  zoomOut() {
    return this._zoomAtCentre(1 / this.zoomStep);
  }

  /**
   * Apply a zoom factor anchored at the centre of the canvas.
   * @param {number} factor
   * @returns {this}
   */
  _zoomAtCentre(factor) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = Number.isFinite(rect.width) ? rect.width / 2 : 0;
    const cy = Number.isFinite(rect.height) ? rect.height / 2 : 0;
    return this.scaleAround(factor, cx, cy);
  }

  /**
   * Get current transform state
   */
  getTransform() {
    return { ...this.transform };
  }

  /**
   * Subscribe to events
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  /**
   * Emit events
   */
  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(data));
    }
  }

  // ═══════════════════════════════════════════════════════
  // Terrain System
  // ═══════════════════════════════════════════════════════

  /**
   * Set terrain type for a hex
   * @param {number} q - Hex column
   * @param {number} r - Hex row
   * @param {string} terrainType - Terrain type (e.g., 'GRASSLAND', 'OCEAN')
   */
  setHexTerrain(q, r, terrainType) {
    const hex = this.hexes.get(`${q},${r}`);
    if (hex) {
      hex.terrain = terrainType;
      this._render();
    }
  }

  /**
   * Get terrain type for a hex
   * @param {number} q - Hex column
   * @param {number} r - Hex row
   * @returns {string|null} Terrain type or null
   */
  getHexTerrain(q, r) {
    const hex = this.hexes.get(`${q},${r}`);
    return hex ? hex.terrain : null;
  }

  /**
   * Generate random terrain for all hexes
   */
  generateRandomTerrain() {
    const terrainTypes = Object.values(TerrainType);
    this.hexes.forEach((hex) => {
      hex.terrain = terrainTypes[Math.floor(Math.random() * terrainTypes.length)];
    });
    this._render();
  }

  /**
   * Get terrain yields for a hex
   * @param {number} q - Hex column
   * @param {number} r - Hex row
   * @returns {Object} Yields object {food, production, gold}
   */
  getHexYields(q, r) {
    const terrain = this.getHexTerrain(q, r);
    return terrain ? getTerrainYields(terrain) : { food: 0, production: 0, gold: 0 };
  }

  /**
   * Get movement cost for a hex
   * @param {number} q - Hex column
   * @param {number} r - Hex row
   * @returns {number} Movement cost
   */
  getHexMovementCost(q, r) {
    const terrain = this.getHexTerrain(q, r);
    return terrain ? getMovementCost(terrain) : 999;
  }

  /**
   * Check if hex is passable
   * @param {number} q - Hex column
   * @param {number} r - Hex row
   * @returns {boolean} True if passable
   */
  isHexPassable(q, r) {
    const terrain = this.getHexTerrain(q, r);
    return terrain ? isPassable(terrain) : false;
  }

  // ═══════════════════════════════════════════════════════
  // Hex Data Attachment
  // ═══════════════════════════════════════════════════════

  /**
   * Set custom data for a hex
   * @param {number} q - Hex column
   * @param {number} r - Hex row
   * @param {Object} data - Custom data object
   */
  setHexData(q, r, data) {
    const hex = this.hexes.get(`${q},${r}`);
    if (hex) {
      hex.data = { ...hex.data, ...data };
    }
  }

  /**
   * Get custom data for a hex
   * @param {number} q - Hex column
   * @param {number} r - Hex row
   * @returns {Object} Custom data object
   */
  getHexData(q, r) {
    const hex = this.hexes.get(`${q},${r}`);
    return hex ? hex.data : {};
  }

  /**
   * Clear custom data for a hex
   * @param {number} q - Hex column
   * @param {number} r - Hex row
   */
  clearHexData(q, r) {
    const hex = this.hexes.get(`${q},${r}`);
    if (hex) {
      hex.data = {};
    }
  }

  // ═══════════════════════════════════════════════════════
  // Distance & Pathfinding
  // ═══════════════════════════════════════════════════════

  /**
   * Calculate distance between two hexes
   * @param {number} q1 - First hex q coordinate
   * @param {number} r1 - First hex r coordinate
   * @param {number} q2 - Second hex q coordinate
   * @param {number} r2 - Second hex r coordinate
   * @returns {number} Distance in hex steps
   */
  hexDistance(q1, r1, q2, r2) {
    return hexDistance(q1, r1, q2, r2);
  }

  /**
   * Get valid moves from a hex within movement points
   * @param {number} q - Starting hex column
   * @param {number} r - Starting hex row
   * @param {number} movementPoints - Available movement points
   * @returns {Array<{q: number, r: number}>} Array of valid hex coordinates
   */
  getValidMoves(q, r, movementPoints) {
    const validHexes = [];
    const adjacent = getAdjacentHexes(q, r);

    for (const hex of adjacent) {
      if (!this.hexes.has(`${hex.q},${hex.r}`)) continue;

      const cost = this.getHexMovementCost(hex.q, hex.r);
      if (cost < 999 && movementPoints >= cost) {
        validHexes.push(hex);
      }
    }

    return validHexes;
  }

  /**
   * Get path between two hexes (simple BFS)
   * @param {number} startQ - Starting hex column
   * @param {number} startR - Starting hex row
   * @param {number} endQ - Ending hex column
   * @param {number} endR - Ending hex row
   * @returns {Array<{q: number, r: number}>} Array of hex coordinates forming path
   */
  getPath(startQ, startR, endQ, endR) {
    const startKey = `${startQ},${startR}`;
    const endKey = `${endQ},${endR}`;

    if (!this.hexes.has(startKey) || !this.hexes.has(endKey)) {
      return [];
    }

    const queue = [[startQ, startR]];
    const visited = new Set([startKey]);
    const parent = new Map();

    while (queue.length > 0) {
      const [currentQ, currentR] = queue.shift();
      const currentKey = `${currentQ},${currentR}`;

      if (currentKey === endKey) {
        // Reconstruct path
        const path = [];
        let key = endKey;
        while (key) {
          const [q, r] = key.split(',').map(Number);
          path.unshift({ q, r });
          key = parent.get(key);
        }
        return path;
      }

      const adjacent = getAdjacentHexes(currentQ, currentR);
      for (const neighbor of adjacent) {
        const neighborKey = `${neighbor.q},${neighbor.r}`;
        if (this.hexes.has(neighborKey) && !visited.has(neighborKey)) {
          if (this.isHexPassable(neighbor.q, neighbor.r)) {
            visited.add(neighborKey);
            parent.set(neighborKey, currentKey);
            queue.push([neighbor.q, neighbor.r]);
          }
        }
      }
    }

    return []; // No path found
  }

  // ═══════════════════════════════════════════════════════
  // Grid Rotation
  // ═══════════════════════════════════════════════════════

  /**
   * Set grid rotation
   * @param {number} rotation - Rotation in radians
   */
  setRotation(rotation) {
    this.rotation = rotation;
    this._generateGrid();
    this._resyncSelectedHex();
    this._render();
  }

  /**
   * Get current grid rotation
   * @returns {number} Rotation in radians
   */
  getRotation() {
    return this.rotation;
  }

  // ═══════════════════════════════════════════════════════
  // Custom Rendering
  // ═══════════════════════════════════════════════════════

  /**
   * Set custom render callback for each hex
   * @param {function} callback - Called with (ctx, hex, size) for each hex
   */
  setCustomRender(callback) {
    this.customRenderCallback = callback;
    this._render();
  }

  /**
   * Clear custom render callback
   */
  clearCustomRender() {
    this.customRenderCallback = null;
    this._render();
  }

  // ═══════════════════════════════════════════════════════
  // Utility Methods
  // ═══════════════════════════════════════════════════════

  /**
   * Check if hex exists at coordinates
   * @param {number} q - Hex column
   * @param {number} r - Hex row
   * @returns {boolean}
   */
  hasHex(q, r) {
    return this.hexes.has(`${q},${r}`);
  }

  /**
   * Get hex count
   * @returns {number} Number of hexes in grid
   */
  getHexCount() {
    return this.hexes.size;
  }

  /**
   * Export terrain data as JSON
   * @returns {Object} Terrain data object
   */
  exportTerrainData() {
    const data = {};
    this.hexes.forEach((hex, key) => {
      if (hex.terrain) {
        data[key] = hex.terrain;
      }
    });
    return data;
  }

  /**
   * Import terrain data from JSON
   * @param {Object} data - Terrain data object
   */
  importTerrainData(data) {
    Object.entries(data).forEach(([key, terrain]) => {
      const [q, r] = key.split(',').map(Number);
      this.setHexTerrain(q, r, terrain);
    });
  }
}
