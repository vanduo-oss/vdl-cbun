// Shared jsdom stubs, installed once (registered via vitest `setupFiles`).
//
// Everything here is guarded on `typeof window !== 'undefined'`, so plain-node
// specs (hex-math, chart primitives) run against a pristine global and any
// accidental DOM dependency in code that must stay runtime-agnostic still
// fails loudly. jsdom implements none of the APIs stubbed below.
//
// Trade-off (accepted): these stubs can mask real API misuse — the Playwright
// smoke exercises the same code paths against the real browser APIs.

interface RecordedCall {
  method: string;
  args: unknown[];
}

interface RecordingContext2D {
  /** Every method call, in order (assert draw calls were issued, not pixels). */
  __calls: RecordedCall[];
  [key: string]: unknown;
}

// A minimal recording 2d context: the hex-grid core draws unconditionally in
// its constructor, so `getContext('2d')` must return something usable. Method
// calls are recorded; property writes (fillStyle, strokeStyle, …) just land on
// the object. Real rasterization is covered by the Playwright canvas smoke.
function createRecordingContext(): RecordingContext2D {
  const calls: RecordedCall[] = [];
  const ctx = { __calls: calls } as RecordingContext2D;
  const methods = [
    'save',
    'restore',
    'translate',
    'scale',
    'rotate',
    'setTransform',
    'resetTransform',
    'beginPath',
    'closePath',
    'moveTo',
    'lineTo',
    'arc',
    'arcTo',
    'rect',
    'quadraticCurveTo',
    'bezierCurveTo',
    'fill',
    'stroke',
    'clip',
    'fillRect',
    'strokeRect',
    'clearRect',
    'fillText',
    'strokeText',
    'drawImage',
    'createLinearGradient',
    'createRadialGradient',
    'setLineDash',
  ];
  for (const method of methods) {
    ctx[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      if (method === 'createLinearGradient' || method === 'createRadialGradient') {
        return { addColorStop() {} };
      }
      return undefined;
    };
  }
  ctx.measureText = (text: string) => ({ width: String(text).length * 6 });
  return ctx;
}

if (typeof window !== 'undefined') {
  // ResizeObserver — jsdom ships none. No-op observe/unobserve/disconnect.
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  }

  // matchMedia — jsdom ships none; the hex-grid core subscribes to a
  // `prefers-color-scheme` media query in _observeThemeChanges().
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      }) as unknown as MediaQueryList;
  }

  // HTMLMediaElement play/pause/load — jsdom throws "Not implemented".
  if (typeof HTMLMediaElement !== 'undefined') {
    HTMLMediaElement.prototype.play = function play(): Promise<void> {
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause(): void {};
    HTMLMediaElement.prototype.load = function load(): void {};
  }

  // Canvas 2d context — jsdom returns null. Recording fake, cached per canvas
  // so a spec can read the draw log back off `instance.ctx.__calls`.
  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
      const el = this as HTMLCanvasElement & { __vdCtx?: RecordingContext2D };
      if (!el.__vdCtx) el.__vdCtx = createRecordingContext();
      return el.__vdCtx as unknown as CanvasRenderingContext2D;
    } as HTMLCanvasElement['getContext'];
  }
}
