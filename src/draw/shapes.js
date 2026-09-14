// Pure, DOM-free geometry + document model + brush engine for the draw tool.
//
// Everything here is framework- and DOM-agnostic so it is unit-testable in
// plain Node (the analogue of flowchart's layout.js). core.js owns the SVG DOM
// engine and calls into these helpers; nothing in this file touches `window`,
// `document`, or `vue`.

/** Load-bearing: stamped into every serialized document via toJSON().version. */
export const VD_DRAW_VERSION = '1.1.0';

/** Selectable tools — drawing-first. `select`/`hand` manipulate. */
export const DRAW_TOOLS = Object.freeze([
  'select',
  'hand',
  'draw',
  'eraser',
  'rectangle',
  'ellipse',
  'line',
  'text',
  'sticky',
]);

/** Persisted shape kinds. The `draw` tool produces a `freehand` (brush) stroke. */
export const DRAW_SHAPE_TYPES = Object.freeze([
  'rectangle',
  'ellipse',
  'line',
  'freehand',
  'text',
  'sticky',
]);

/**
 * Brush presets — each a config the brush engine consumes. `thinning` maps
 * pressure/velocity to width (0 = flat); `streamline` low-passes the input;
 * taper shrinks the ends; `blend` is the CSS mix-blend-mode; `nibAngle` (only
 * calligraphy) makes width depend on stroke direction.
 */
export const BRUSH_PRESETS = Object.freeze({
  pen: {
    size: 6,
    thinning: 0.55,
    smoothing: 0.5,
    streamline: 0.5,
    taperStart: 0,
    taperEnd: 14,
    opacity: 1,
    blend: 'normal',
  },
  pencil: {
    size: 4,
    thinning: 0.7,
    smoothing: 0.35,
    streamline: 0.35,
    taperStart: 4,
    taperEnd: 10,
    opacity: 0.92,
    blend: 'normal',
  },
  marker: {
    size: 14,
    thinning: 0.15,
    smoothing: 0.55,
    streamline: 0.5,
    taperStart: 0,
    taperEnd: 0,
    opacity: 0.85,
    blend: 'normal',
  },
  highlighter: {
    size: 22,
    thinning: 0,
    smoothing: 0.6,
    streamline: 0.55,
    taperStart: 0,
    taperEnd: 0,
    opacity: 0.4,
    blend: 'multiply',
  },
  calligraphy: {
    size: 12,
    thinning: 0.6,
    smoothing: 0.4,
    streamline: 0.3,
    taperStart: 8,
    taperEnd: 12,
    opacity: 1,
    nibAngle: -0.7,
    blend: 'normal',
  },
});

export const DEFAULT_BRUSH = 'pen';

/** Shapes whose geometry is a list of world-space points (vs. an x/y/w/h box). */
const POINT_TYPES = Object.freeze(['line', 'freehand']);

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 4;
export const DEFAULT_GRID_SIZE = 20;
export const DEFAULT_STROKE_WIDTH = 2;

// Bounded deserialization caps. An untrusted or corrupt document (e.g. a shared
// link with tens of millions of points or shapes) is TRUNCATED — never thrown —
// so `load()` cannot be turned into a client-side DoS: the O(n) coercion and the
// resulting render stay bounded. A normal document is far below these limits and
// is unaffected.
export const MAX_SHAPES = 10000;
export const MAX_POINTS_PER_SHAPE = 100000;

let idCounter = 0;

/** Monotonic-ish id; unique within a session, prefixed by kind. */
export function createId(prefix = 'sh') {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}${(idCounter * 2654435761).toString(36).slice(-4)}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Round to 2 decimals to keep serialized coordinates stable and compact. */
export function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Structured deep clone with a JSON fallback for older runtimes. */
export function deepClone(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fall through to JSON */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

/** Round a point, preserving an optional third (pressure) slot. */
function roundPoint(p) {
  const out = [round(p[0]), round(p[1])];
  if (p.length >= 3 && p[2] != null) out.push(clamp(Number(p[2]) || 0, 0, 1));
  return out;
}

function isPointShape(shape) {
  return POINT_TYPES.includes(shape.type);
}

/** Axis-aligned bounds `{ x, y, w, h }` for any shape kind. */
export function shapeBounds(shape) {
  if (isPointShape(shape)) {
    const pts = shape.points || [];
    if (!pts.length) return { x: shape.x || 0, y: shape.y || 0, w: 0, h: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of pts) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: shape.x || 0, y: shape.y || 0, w: shape.w || 0, h: shape.h || 0 };
}

/** Union bounds of several shapes, or null when the list is empty. */
export function boundsOfShapes(shapes) {
  if (!shapes || !shapes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of shapes) {
    const b = shapeBounds(shape);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Do two `{x,y,w,h}` boxes overlap (used for marquee selection / eraser)? */
export function boundsIntersect(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

/** Is a world point inside a shape's (padded) bounds? Hit-test for select. */
export function pointInShape(shape, x, y, pad = 0) {
  const b = shapeBounds(shape);
  return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
}

/** Shortest distance from a world point to a shape (for the eraser). */
export function distanceToShape(shape, x, y) {
  if (isPointShape(shape)) {
    const pts = shape.points || [];
    if (pts.length === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y);
    let min = Infinity;
    for (let i = 1; i < pts.length; i += 1) {
      min = Math.min(min, pointToSegment(x, y, pts[i - 1], pts[i]));
    }
    return min;
  }
  const b = shapeBounds(shape);
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

function pointToSegment(px, py, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = px - a[0];
  const wy = py - a[1];
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - a[0], py - a[1]);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - b[0], py - b[1]);
  const t = c1 / c2;
  return Math.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy));
}

/** Return a NEW shape translated by (dx, dy); pure, never mutates input. */
export function translateShape(shape, dx, dy) {
  const next = deepClone(shape);
  if (isPointShape(next)) {
    next.points = (next.points || []).map((p) => roundPoint([p[0] + dx, p[1] + dy, p[2]]));
  } else {
    next.x = round((next.x || 0) + dx);
    next.y = round((next.y || 0) + dy);
  }
  return next;
}

/**
 * Return a NEW shape scaled about (ox, oy) by (sx, sy). Box shapes rescale
 * x/y/w/h; point shapes rescale each point. Pure.
 */
export function scaleShape(shape, ox, oy, sx, sy) {
  const next = deepClone(shape);
  const avg = (Math.abs(sx) + Math.abs(sy)) * 0.5;
  if (isPointShape(next)) {
    next.points = (next.points || []).map((p) =>
      roundPoint([ox + (p[0] - ox) * sx, oy + (p[1] - oy) * sy, p[2]]),
    );
    if (typeof next.size === 'number') next.size = round(Math.max(1, next.size * avg));
    if (typeof next.strokeWidth === 'number') next.strokeWidth = round(next.strokeWidth * avg);
  } else {
    next.x = round(ox + ((next.x || 0) - ox) * sx);
    next.y = round(oy + ((next.y || 0) - oy) * sy);
    next.w = round(Math.max(1, (next.w || 0) * sx));
    next.h = round(Math.max(1, (next.h || 0) * sy));
  }
  return next;
}

/** Eight resize handles for a selection box, keyed by compass direction. */
export function resizeHandlePositions(bounds) {
  const { x, y, w, h } = bounds;
  const mx = x + w / 2;
  const my = y + h / 2;
  return [
    { key: 'nw', x, y },
    { key: 'n', x: mx, y },
    { key: 'ne', x: x + w, y },
    { key: 'e', x: x + w, y: my },
    { key: 'se', x: x + w, y: y + h },
    { key: 's', x: mx, y: y + h },
    { key: 'sw', x, y: y + h },
    { key: 'w', x, y: my },
  ];
}

/**
 * Convert Catmull-Rom through-points to a cubic Bezier SVG path.
 * Each segment uses neighbors as tangents so sparse samples look smooth.
 *
 * @param {Array<[number, number]>} points
 * @returns {string}
 */
function pointsToCatmullRomPath(points) {
  const pts = points.map((p) => [Number(p[0]), Number(p[1])]);
  if (pts.length < 3) {
    const [first, ...rest] = pts;
    let d = `M ${round(first[0])} ${round(first[1])}`;
    for (const [px, py] of rest) d += ` L ${round(px)} ${round(py)}`;
    return d;
  }

  let d = `M ${round(pts[0][0])} ${round(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i === 0 ? i : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
    // Uniform Catmull-Rom → cubic Bezier control points (tension 1).
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(p2[0])} ${round(p2[1])}`;
  }
  return d;
}

/**
 * Build an SVG path `d` for line shapes.
 * When `smooth` is true and there are 3+ points, uses Catmull-Rom cubics;
 * otherwise a straight polyline (`M` / `L`).
 *
 * @param {Array<[number, number]>} points
 * @param {{ smooth?: boolean }} [options]
 * @returns {string}
 */
export function pointsToPath(points, options = {}) {
  if (!points || !points.length) return '';
  if (options.smooth && points.length >= 3) return pointsToCatmullRomPath(points);
  const [first, ...rest] = points;
  let d = `M ${round(first[0])} ${round(first[1])}`;
  for (const [px, py] of rest) d += ` L ${round(px)} ${round(py)}`;
  return d;
}

/**
 * Drop points closer than `min` world units to the previously kept point —
 * keeps freehand strokes light without visibly changing the path. Preserves
 * the optional pressure slot.
 */
export function simplifyPoints(points, min = 1.2) {
  if (!points || points.length <= 2) return (points || []).map(roundPoint);
  const out = [roundPoint(points[0])];
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    const last = out[out.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= min || i === points.length - 1)
      out.push(roundPoint(p));
  }
  return out;
}

/**
 * Smooth a new incoming point against the previous point using an
 * exponential moving average. `factor` 0→1 controls how much the new
 * point pulls toward itself (1 = no smoothing, 0.3 = heavy smoothing).
 * Pressure is blended linearly. Pure — never mutates input.
 */
export function smoothPoint(prev, next, factor = 0.5) {
  const f = clamp(factor, 0.1, 1);
  const x = round(prev[0] + (next[0] - prev[0]) * f);
  const y = round(prev[1] + (next[1] - prev[1]) * f);
  const hasPressure =
    (prev.length >= 3 && prev[2] != null) || (next.length >= 3 && next[2] != null);
  if (hasPressure) {
    const pp = prev.length >= 3 && prev[2] != null ? prev[2] : 0.5;
    const np = next.length >= 3 && next[2] != null ? next[2] : 0.5;
    return [x, y, clamp(pp + (np - pp) * f, 0, 1)];
  }
  return [x, y];
}

/**
 * Append `point` to `points` only if it's farther than `minDist` from
 * the last kept point. When the array exceeds `maxLen`, every other
 * interior point is dropped to halve the array while preserving the
 * first and last points. Mutates in place for performance during live
 * capture. Returns the array.
 */
export function appendAndSimplify(points, point, minDist = 1.5, maxLen = 500) {
  if (!points.length) {
    points.push(roundPoint(point));
    return points;
  }
  const last = points[points.length - 1];
  if (Math.hypot(point[0] - last[0], point[1] - last[1]) < minDist) return points;
  points.push(roundPoint(point));
  if (points.length > maxLen) {
    // Halve interior points: keep first, keep every other interior, keep last.
    const first = points[0];
    const end = points[points.length - 1];
    const kept = [first];
    for (let i = 2; i < points.length - 1; i += 2) kept.push(points[i]);
    kept.push(end);
    points.length = 0;
    for (const p of kept) points.push(p);
  }
  return points;
}

// ── Brush engine ─────────────────────────────────────────────────────────
// A compact, dependency-free variable-width stroke generator: input points
// (each [x, y, pressure?]) → a filled outline polygon. Pure/deterministic.

function streamlinePoints(points, streamline) {
  const first = points[0];
  const out = [[first[0], first[1], first[2] == null ? 0.5 : clamp(first[2], 0, 1)]];
  if (points.length < 2) return out;
  const factor = clamp(1 - (streamline == null ? 0.5 : streamline), 0.15, 1);
  for (let i = 1; i < points.length; i += 1) {
    const prev = out[out.length - 1];
    const p = points[i];
    out.push([
      prev[0] + (p[0] - prev[0]) * factor,
      prev[1] + (p[1] - prev[1]) * factor,
      p[2] == null ? 0.5 : clamp(p[2], 0, 1),
    ]);
  }
  return out;
}

function circlePolygon(cx, cy, r, segments = 16) {
  const pts = [];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// Faster strokes (longer per-sample segments) render thinner.
function velocityPressure(segmentLength) {
  return clamp(1 - segmentLength / 28, 0.25, 1);
}

/**
 * Variable-width outline for a brush stroke. Returns a closed polygon (array of
 * `[x, y]`) to be filled. Width follows per-point pressure (or velocity when
 * pressure is flat), scaled by `size` and `thinning`, with start/end taper and
 * an optional fixed-angle nib.
 */
export function strokeOutline(rawPoints, options = {}) {
  const points = (rawPoints || []).filter((p) => Array.isArray(p) && p.length >= 2);
  if (points.length === 0) return [];
  const size = Math.max(1, options.size == null ? 8 : options.size);
  const thinning = options.thinning == null ? 0.5 : options.thinning;
  const taperStart = options.taperStart || 0;
  const taperEnd = options.taperEnd || 0;
  const nibAngle = options.nibAngle;

  const pts = streamlinePoints(points, options.streamline);
  if (pts.length === 1) return circlePolygon(pts[0][0], pts[0][1], size / 2);

  const segLen = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segLen.push(d);
    total += d;
  }
  const hasPressure = points.some((p) => p.length >= 3 && p[2] != null && p[2] > 0 && p[2] !== 0.5);

  const left = [];
  const right = [];
  let run = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const prev = pts[i - 1] || p;
    const next = pts[i + 1] || p;
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    const pressure = hasPressure
      ? p[2]
      : velocityPressure(segLen[i - 1] == null ? segLen[i] || 0 : segLen[i - 1]);
    let radius = (size / 2) * (thinning === 0 ? 1 : 1 - thinning + thinning * pressure);
    if (typeof nibAngle === 'number') {
      radius *= 0.35 + 0.65 * Math.abs(Math.sin(Math.atan2(dy, dx) - nibAngle));
    }
    if (i > 0) run += segLen[i - 1];
    if (taperStart > 0) radius *= clamp(run / taperStart, 0, 1);
    if (taperEnd > 0) radius *= clamp((total - run) / taperEnd, 0, 1);
    radius = Math.max(0.1, radius);
    left.push([p[0] + nx * radius, p[1] + ny * radius]);
    right.push([p[0] - nx * radius, p[1] - ny * radius]);
  }
  return [...left, ...right.reverse()];
}

/** Smooth closed SVG path `d` (quadratic) for a filled outline polygon. */
export function pointsToBrushPath(outline) {
  if (!outline || outline.length < 3) {
    if (outline && outline.length) {
      const [x, y] = outline[0];
      return `M ${round(x - 1)} ${round(y)} a 1 1 0 1 0 2 0 a 1 1 0 1 0 -2 0 Z`;
    }
    return '';
  }
  let d = `M ${round(outline[0][0])} ${round(outline[0][1])}`;
  for (let i = 1; i < outline.length; i += 1) {
    const prev = outline[i - 1];
    const cur = outline[i];
    const mx = (prev[0] + cur[0]) / 2;
    const my = (prev[1] + cur[1]) / 2;
    d += ` Q ${round(prev[0])} ${round(prev[1])} ${round(mx)} ${round(my)}`;
  }
  return `${d} Z`;
}

/** Convenience: the filled path `d` for a freehand shape (brush + size). */
export function brushStrokePath(shape) {
  const preset = BRUSH_PRESETS[shape.brush] || BRUSH_PRESETS[DEFAULT_BRUSH];
  return pointsToBrushPath(
    strokeOutline(shape.points || [], {
      ...preset,
      size: shape.size == null ? preset.size : shape.size,
    }),
  );
}

function coerceNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function coercePoints(raw) {
  if (!Array.isArray(raw)) return [];
  const pts = [];
  // Bounded deserialization: coerce at most MAX_POINTS_PER_SHAPE points; any
  // beyond the cap are truncated so a hostile stroke stays O(cap).
  const limit = Math.min(raw.length, MAX_POINTS_PER_SHAPE);
  for (let i = 0; i < limit; i += 1) {
    const p = raw[i];
    if (
      Array.isArray(p) &&
      p.length >= 2 &&
      Number.isFinite(Number(p[0])) &&
      Number.isFinite(Number(p[1]))
    ) {
      const pt = [round(Number(p[0])), round(Number(p[1]))];
      if (p.length >= 3 && Number.isFinite(Number(p[2]))) pt.push(clamp(Number(p[2]), 0, 1));
      pts.push(pt);
    }
  }
  return pts;
}

/**
 * Validate/normalize a single raw shape. Returns a clean shape or `null` when
 * the input is unusable. Unknown `type` values default to `rectangle`.
 * Migrates v1 freehand (`{ points, stroke, strokeWidth }`) to the brush model.
 */
export function normalizeShape(raw, usedIds) {
  if (!raw || typeof raw !== 'object') return null;
  const type = DRAW_SHAPE_TYPES.includes(raw.type) ? raw.type : 'rectangle';

  let id = typeof raw.id === 'string' && raw.id ? raw.id : createId(type.slice(0, 2));
  if (usedIds) {
    while (usedIds.has(id)) id = createId(type.slice(0, 2));
    usedIds.add(id);
  }
  const groupId = typeof raw.groupId === 'string' && raw.groupId ? raw.groupId : undefined;
  const color =
    typeof raw.color === 'string'
      ? raw.color
      : typeof raw.stroke === 'string'
        ? raw.stroke
        : undefined;

  if (type === 'freehand') {
    const points = coercePoints(raw.points);
    if (points.length < 1) return null;
    const brush = BRUSH_PRESETS[raw.brush] ? raw.brush : DEFAULT_BRUSH;
    const preset = BRUSH_PRESETS[brush];
    const size =
      raw.size != null
        ? Math.max(1, coerceNumber(raw.size, preset.size))
        : raw.strokeWidth != null
          ? Math.max(1, coerceNumber(raw.strokeWidth, DEFAULT_STROKE_WIDTH) * 2)
          : preset.size;
    const shape = {
      id,
      type: 'freehand',
      brush,
      points,
      size: round(size),
      opacity:
        raw.opacity == null
          ? preset.opacity
          : clamp(coerceNumber(raw.opacity, preset.opacity), 0, 1),
    };
    if (color) shape.color = color;
    if (groupId) shape.groupId = groupId;
    return shape;
  }

  const base = {
    id,
    type,
    strokeWidth:
      raw.strokeWidth == null
        ? DEFAULT_STROKE_WIDTH
        : coerceNumber(raw.strokeWidth, DEFAULT_STROKE_WIDTH),
    opacity: raw.opacity == null ? 1 : clamp(coerceNumber(raw.opacity, 1), 0, 1),
  };
  if (color) base.color = color;
  if (typeof raw.fill === 'string') base.fill = raw.fill;
  if (groupId) base.groupId = groupId;

  if (type === 'line') {
    const points = coercePoints(raw.points);
    if (points.length < 2) return null;
    return {
      ...base,
      points,
      arrowStart: Boolean(raw.arrowStart),
      arrowEnd: raw.arrowEnd == null ? true : Boolean(raw.arrowEnd),
      smooth: Boolean(raw.smooth),
    };
  }

  const shape = {
    ...base,
    x: round(coerceNumber(raw.x, 0)),
    y: round(coerceNumber(raw.y, 0)),
    w: round(Math.max(1, coerceNumber(raw.w, 100))),
    h: round(Math.max(1, coerceNumber(raw.h, 80))),
    rotation: coerceNumber(raw.rotation, 0),
  };
  if (type === 'text' || type === 'sticky')
    shape.text = typeof raw.text === 'string' ? raw.text : '';
  return shape;
}

function normalizeViewport(raw) {
  const vp = raw && typeof raw === 'object' ? raw : {};
  return {
    x: coerceNumber(vp.x, 0),
    y: coerceNumber(vp.y, 0),
    scale: clamp(coerceNumber(vp.scale, 1), MIN_SCALE, MAX_SCALE),
  };
}

/**
 * The single validation + forward-migration gateway. Accepts an object or a
 * JSON string (any prior VD_DRAW_VERSION), and returns a clean
 * `{ version, viewport, shapes }` stamped with the CURRENT version. Ensures
 * unique ids, drops malformed shapes, defaults unknown types, prunes dangling
 * groupIds, and migrates v1 freehand to the brush model. Never mutates input.
 */
export function normalizeDocument(data) {
  let raw = data;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  if (!raw || typeof raw !== 'object') raw = {};

  const usedIds = new Set();
  const rawShapes = Array.isArray(raw.shapes) ? raw.shapes : [];
  const shapes = [];
  // Bounded deserialization: normalize at most MAX_SHAPES shapes; extras from an
  // untrusted document are truncated so the load stays O(cap).
  const shapeLimit = Math.min(rawShapes.length, MAX_SHAPES);
  for (let i = 0; i < shapeLimit; i += 1) {
    const shape = normalizeShape(rawShapes[i], usedIds);
    if (shape) shapes.push(shape);
  }

  const groupCounts = new Map();
  for (const s of shapes)
    if (s.groupId) groupCounts.set(s.groupId, (groupCounts.get(s.groupId) || 0) + 1);
  for (const s of shapes) if (s.groupId && groupCounts.get(s.groupId) < 2) delete s.groupId;

  return {
    version: VD_DRAW_VERSION,
    viewport: normalizeViewport(raw.viewport),
    shapes,
  };
}

/**
 * Breaks text into lines respecting explicit newlines and wrapping on word
 * boundaries when a maximum width is specified.
 *
 * @param {string} text
 * @param {number} [maxWidth] - Maximum width in world coordinates.
 * @param {number} [charWidth=8.8] - Approximate character width in pixels.
 * @returns {string[]}
 */
export function wrapText(text, maxWidth, charWidth = 8.8) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const rawLines = text.split(/\r?\n/);
  if (!maxWidth || maxWidth <= 0 || !Number.isFinite(maxWidth)) {
    return rawLines;
  }
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
  const result = [];
  for (const rawLine of rawLines) {
    if (rawLine.length <= maxChars) {
      result.push(rawLine);
      continue;
    }
    const words = rawLine.split(' ');
    let currentLine = '';
    for (const word of words) {
      if (!currentLine) {
        if (word.length <= maxChars) {
          currentLine = word;
        } else {
          let remaining = word;
          while (remaining.length > maxChars) {
            result.push(remaining.slice(0, maxChars));
            remaining = remaining.slice(maxChars);
          }
          currentLine = remaining;
        }
      } else {
        if (currentLine.length + 1 + word.length <= maxChars) {
          currentLine += ' ' + word;
        } else {
          result.push(currentLine);
          if (word.length <= maxChars) {
            currentLine = word;
          } else {
            let remaining = word;
            while (remaining.length > maxChars) {
              result.push(remaining.slice(0, maxChars));
              remaining = remaining.slice(maxChars);
            }
            currentLine = remaining;
          }
        }
      }
    }
    if (currentLine) result.push(currentLine);
  }
  return result;
}
