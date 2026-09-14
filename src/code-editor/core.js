// Framework-agnostic core for the code editor.
//
// The editing model is a native <textarea> rendered transparently over a <pre>
// highlight layer: the browser owns caret, selection, IME, clipboard, and
// undo/redo, while a homegrown tokenizer repaints the highlight beneath it. The
// core builds its own DOM, keeps the two layers scroll- and glyph-aligned,
// applies a small keymap (indent / tab / auto-close) through the native undo
// stack, and paints only via DOM nodes — never `innerHTML`. It imports no `vue`.

import { tokenize, LANGUAGES } from './tokenizer/index.js';
import { renderTokensToDom } from './highlight.js';
import {
  indentOnEnter,
  handleTab,
  handleShiftTab,
  autoClosePair,
  skipOverCloser,
  handleBackspacePair,
} from './editing.js';
import { DEFAULT_TAB_SIZE, MAX_HIGHLIGHT_LENGTH } from './constants.js';

/** Current component version (mirrored in component-versions.json). */
export const VD_CODE_EDITOR_VERSION = '1.1.0';

const DEFAULTS = {
  value: '',
  language: 'plaintext',
  readOnly: false,
  lineNumbers: true,
  tabSize: DEFAULT_TAB_SIZE,
  placeholder: '',
  maxLength: undefined,
  wrap: false,
  autoClose: true,
  highlightActiveLine: true,
  maxHighlightLength: MAX_HIGHLIGHT_LENGTH,
  spellcheck: false,
  ariaLabel: 'Code editor',
  copy: true,
};

// Scheduler that degrades gracefully when rAF is absent (SSR/jsdom). Bound to
// `window` so browsers never throw "Illegal invocation".
const RAF =
  typeof window !== 'undefined' && window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : (cb) => setTimeout(cb, 16);
const CAF =
  typeof window !== 'undefined' && window.cancelAnimationFrame
    ? window.cancelAnimationFrame.bind(window)
    : clearTimeout;

function resolveElement(element) {
  if (!element) return null;
  if (typeof element === 'string') {
    return typeof document !== 'undefined' ? document.querySelector(element) : null;
  }
  return element;
}

function countNewlines(str, end) {
  let n = 0;
  const limit = end == null ? str.length : end;
  for (let i = 0; i < limit; i++) {
    if (str.charCodeAt(i) === 10) n++;
  }
  return n;
}

export class VdCodeEditor {
  constructor(options = {}) {
    this._opts = Object.assign({}, DEFAULTS, options);
    this._listeners = Object.create(null);
    this._domListeners = [];
    this._raf = 0;
    this._ro = null;
    this._copyTimer = 0;
    this._destroyed = false;
    this._lineHeight = 21;
    this._paddingTop = 0;
    this._gutterCount = -1;
    this._lastValue = this._opts.value == null ? '' : String(this._opts.value);

    this.element = resolveElement(options.element);
    if (this.element) this._mount();
  }

  // ── mounting ──────────────────────────────────────────────────────────────

  _mount() {
    const el = this.element;
    const doc = el.ownerDocument;
    const opts = this._opts;
    const showGutter = opts.lineNumbers && !opts.wrap;
    const showActiveLine = opts.highlightActiveLine && !opts.wrap;

    el.classList.add('vd-code-editor');
    el.classList.toggle('is-wrap', !!opts.wrap);
    el.classList.toggle('is-readonly', !!opts.readOnly);
    el.classList.toggle('has-gutter', showGutter);
    el.style.setProperty('--vd-code-editor-tab-size', String(opts.tabSize));

    // Active-line band (bottom layer).
    if (showActiveLine) {
      this._activeLine = doc.createElement('div');
      this._activeLine.className = 'vd-code-editor-active-line';
      this._activeLine.setAttribute('aria-hidden', 'true');
      el.appendChild(this._activeLine);
    }

    // Highlight layer.
    this._pre = doc.createElement('pre');
    this._pre.className = 'vd-code-editor-highlight';
    this._pre.setAttribute('aria-hidden', 'true');
    this._code = doc.createElement('code');
    this._code.className = 'vd-code-editor-code';
    this._pre.appendChild(this._code);
    el.appendChild(this._pre);

    // Gutter (over the band's left edge; opaque).
    if (showGutter) {
      this._gutter = doc.createElement('div');
      this._gutter.className = 'vd-code-editor-gutter';
      this._gutter.setAttribute('aria-hidden', 'true');
      this._gutterLines = doc.createElement('div');
      this._gutterLines.className = 'vd-code-editor-gutter-lines';
      this._gutter.appendChild(this._gutterLines);
      el.appendChild(this._gutter);
    }

    // Editable surface (top layer).
    const ta = doc.createElement('textarea');
    ta.className = 'vd-code-editor-input';
    ta.value = this._lastValue;
    ta.spellcheck = !!opts.spellcheck;
    ta.wrap = opts.wrap ? 'soft' : 'off';
    ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('autocapitalize', 'off');
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('aria-label', opts.ariaLabel || 'Code editor');
    ta.setAttribute('aria-multiline', 'true');
    if (opts.readOnly) ta.readOnly = true;
    if (opts.placeholder) ta.placeholder = opts.placeholder;
    if (opts.maxLength != null) ta.maxLength = opts.maxLength;
    ta.style.tabSize = String(opts.tabSize);
    this._pre.style.tabSize = String(opts.tabSize);
    this._textarea = ta;
    el.appendChild(ta);

    // Copy control (only when enabled and the clipboard API exists).
    if (opts.copy && typeof navigator !== 'undefined' && navigator.clipboard) {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'vd-code-editor-copy';
      btn.setAttribute('aria-label', 'Copy code');
      btn.textContent = 'Copy';
      this._copyBtn = btn;
      el.appendChild(btn);
    }

    this._attach();
    this._measure();
    this._repaint();
    this._syncScroll();
  }

  _attach() {
    const ta = this._textarea;
    this._listen(ta, 'input', () => this._handleInput());
    this._listen(ta, 'scroll', () => this._syncScroll());
    this._listen(ta, 'keydown', (e) => this._handleKeydown(e));
    this._listen(ta, 'focus', (e) => this._handleFocus(e));
    this._listen(ta, 'blur', (e) => this._handleBlur(e));
    this._listen(ta, 'click', () => this._updateActiveLine());
    this._listen(ta, 'keyup', () => this._updateActiveLine());
    this._listen(ta, 'select', () => this._updateActiveLine());
    if (this._copyBtn) this._listen(this._copyBtn, 'click', () => this._handleCopy());

    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => {
        this._measure();
        this._syncScroll();
      });
      this._ro.observe(this.element);
    }

    // Re-measure once web fonts settle (FOUT would shift line metrics).
    const fonts = this.element.ownerDocument.fonts;
    if (fonts && fonts.ready && typeof fonts.ready.then === 'function') {
      fonts.ready.then(() => {
        if (this._destroyed) return;
        this._measure();
        this._syncScroll();
      });
    }
  }

  _listen(target, type, handler) {
    target.addEventListener(type, handler);
    this._domListeners.push([target, type, handler]);
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  _measure() {
    if (typeof getComputedStyle !== 'function') return;
    const cs = getComputedStyle(this._textarea);
    const lh = parseFloat(cs.lineHeight);
    if (Number.isFinite(lh) && lh > 0) this._lineHeight = lh;
    const pt = parseFloat(cs.paddingTop);
    this._paddingTop = Number.isFinite(pt) ? pt : 0;
  }

  _scheduleRepaint() {
    if (this._raf || this._destroyed) return;
    this._raf = RAF(() => {
      this._raf = 0;
      if (!this._destroyed) this._repaint();
    });
  }

  _repaint() {
    const value = this._textarea.value;
    const doc = this.element.ownerDocument;
    const trailing = value.endsWith('\n') || value === '';

    if (value.length > this._opts.maxHighlightLength) {
      this._code.classList.add('is-plain');
      this._code.replaceChildren(doc.createTextNode(trailing ? value + '\n' : value));
    } else {
      this._code.classList.remove('is-plain');
      const frag = renderTokensToDom(tokenize(value, this._opts.language), doc);
      if (trailing) frag.appendChild(doc.createTextNode('\n'));
      this._code.replaceChildren(frag);
    }
    this._updateGutter(value);
  }

  _updateGutter(value) {
    if (!this._gutterLines) return;
    const lines = countNewlines(value) + 1;
    if (lines === this._gutterCount) return;
    this._gutterCount = lines;
    this.element.style.setProperty(
      '--vd-code-editor-gutter-digits',
      String(Math.max(2, String(lines).length)),
    );
    let text = '1';
    for (let i = 2; i <= lines; i++) text += '\n' + i;
    this._gutterLines.textContent = text;
  }

  _syncScroll() {
    const ta = this._textarea;
    if (!ta) return;
    const st = ta.scrollTop;
    if (this._pre) {
      this._pre.scrollTop = st;
      this._pre.scrollLeft = ta.scrollLeft;
    }
    if (this._gutterLines) {
      this._gutterLines.style.transform = 'translateY(' + -st + 'px)';
    }
    this._updateActiveLine();
  }

  _updateActiveLine() {
    if (!this._activeLine) return;
    const ta = this._textarea;
    const line = countNewlines(ta.value, ta.selectionStart || 0);
    const top = this._paddingTop + line * this._lineHeight - ta.scrollTop;
    this._activeLine.style.height = this._lineHeight + 'px';
    this._activeLine.style.transform = 'translateY(' + top + 'px)';
  }

  // ── input + keymap ────────────────────────────────────────────────────────

  _handleInput() {
    this._scheduleRepaint();
    this._syncScroll();
    this._emitChangeIfChanged();
  }

  _emitChangeIfChanged() {
    const v = this._textarea.value;
    if (v === this._lastValue) return;
    this._lastValue = v;
    this._emit('change', { value: v });
  }

  _handleFocus(e) {
    this.element.classList.add('is-focused');
    this._emit('focus', e);
  }

  _handleBlur(e) {
    this.element.classList.remove('is-focused');
    this._emit('blur', e);
  }

  _handleKeydown(e) {
    if (this._opts.readOnly || e.isComposing) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const ta = this._textarea;
    const value = ta.value;
    const s = ta.selectionStart;
    const en = ta.selectionEnd;
    const unit = ' '.repeat(this._opts.tabSize);

    if (e.key === 'Enter') {
      e.preventDefault();
      this._applyEdit(indentOnEnter(value, s, en, unit));
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      this._applyEdit(
        e.shiftKey ? handleShiftTab(value, s, en, unit) : handleTab(value, s, en, unit),
      );
      return;
    }
    if (e.key === 'Backspace') {
      const edit = handleBackspacePair(value, s, en);
      if (edit) {
        e.preventDefault();
        this._applyEdit(edit);
      }
      return;
    }
    if (e.key.length === 1 && this._opts.autoClose) {
      const skip = skipOverCloser(e.key, value, s, en);
      if (skip) {
        e.preventDefault();
        ta.setSelectionRange(skip.selectionStart, skip.selectionEnd);
        this._updateActiveLine();
        return;
      }
      const auto = autoClosePair(e.key, value, s, en);
      if (auto) {
        e.preventDefault();
        this._applyEdit(auto);
      }
    }
  }

  // Apply an edit, preferring execCommand so the native undo stack is preserved;
  // fall back to setRangeText, then to a direct value splice (jsdom/old engines).
  _applyEdit(edit) {
    const ta = this._textarea;
    ta.setSelectionRange(edit.from, edit.to);
    let nativeInput = false;
    if (this._tryExecInsert(edit.text)) {
      nativeInput = true;
    } else if (typeof ta.setRangeText === 'function') {
      ta.setRangeText(edit.text, edit.from, edit.to, 'end');
    } else {
      ta.value = ta.value.slice(0, edit.from) + edit.text + ta.value.slice(edit.to);
    }
    if (edit.selectionStart != null) {
      const end = edit.selectionEnd == null ? edit.selectionStart : edit.selectionEnd;
      ta.setSelectionRange(edit.selectionStart, end);
    }
    if (nativeInput) {
      // execCommand already dispatched 'input' (repaint + emit); just fix caret.
      this._updateActiveLine();
    } else {
      this._handleInput();
    }
  }

  _tryExecInsert(text) {
    try {
      return (
        typeof document !== 'undefined' &&
        typeof document.execCommand === 'function' &&
        document.execCommand('insertText', false, text)
      );
    } catch {
      return false;
    }
  }

  _handleCopy() {
    if (this._destroyed || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(this._textarea.value).then(
      () => this._flashCopied(),
      () => {},
    );
  }

  _flashCopied() {
    if (!this._copyBtn) return;
    this._copyBtn.classList.add('is-copied');
    this._copyBtn.textContent = 'Copied';
    if (this._copyTimer) clearTimeout(this._copyTimer);
    this._copyTimer = setTimeout(() => {
      this._copyTimer = 0;
      if (this._destroyed || !this._copyBtn) return;
      this._copyBtn.classList.remove('is-copied');
      this._copyBtn.textContent = 'Copy';
    }, 1200);
  }

  // ── public API ────────────────────────────────────────────────────────────

  getValue() {
    return this._textarea ? this._textarea.value : this._lastValue;
  }

  setValue(next, options) {
    const silent = !!(options && options.silent);
    const v = next == null ? '' : String(next);
    if (!this._textarea) {
      this._lastValue = v;
      return this;
    }
    if (v === this._textarea.value) return this;
    this._textarea.value = v;
    if (silent) this._lastValue = v;
    this._repaint();
    this._syncScroll();
    if (!silent) this._emitChangeIfChanged();
    return this;
  }

  getSelection() {
    const ta = this._textarea;
    if (!ta) return { start: 0, end: 0, text: '' };
    return {
      start: ta.selectionStart,
      end: ta.selectionEnd,
      text: ta.value.slice(ta.selectionStart, ta.selectionEnd),
    };
  }

  setSelection(start, end) {
    if (!this._textarea) return this;
    const e = end == null ? start : end;
    this._textarea.setSelectionRange(start, e);
    this._updateActiveLine();
    return this;
  }

  insertText(text) {
    if (!this._textarea) return this;
    const ta = this._textarea;
    const str = String(text);
    this._applyEdit({
      from: ta.selectionStart,
      to: ta.selectionEnd,
      text: str,
      selectionStart: ta.selectionStart + str.length,
    });
    return this;
  }

  setLanguage(language) {
    this._opts.language = language || 'plaintext';
    if (this._textarea) this._repaint();
    return this;
  }

  setReadOnly(readOnly) {
    this._opts.readOnly = !!readOnly;
    if (this._textarea) this._textarea.readOnly = !!readOnly;
    if (this.element) this.element.classList.toggle('is-readonly', !!readOnly);
    return this;
  }

  setTabSize(tabSize) {
    const n = Number(tabSize) || DEFAULT_TAB_SIZE;
    this._opts.tabSize = n;
    if (this._textarea) this._textarea.style.tabSize = String(n);
    if (this._pre) this._pre.style.tabSize = String(n);
    if (this.element) this.element.style.setProperty('--vd-code-editor-tab-size', String(n));
    return this;
  }

  setPlaceholder(text) {
    this._opts.placeholder = text || '';
    if (this._textarea) this._textarea.placeholder = text || '';
    return this;
  }

  setAutoClose(autoClose) {
    this._opts.autoClose = !!autoClose;
    return this;
  }

  focus() {
    if (this._textarea) this._textarea.focus();
    return this;
  }

  blur() {
    if (this._textarea) this._textarea.blur();
    return this;
  }

  on(name, handler) {
    if (!this._listeners[name]) this._listeners[name] = [];
    this._listeners[name].push(handler);
    return this;
  }

  off(name, handler) {
    const list = this._listeners[name];
    if (!list) return this;
    const i = list.indexOf(handler);
    if (i !== -1) list.splice(i, 1);
    return this;
  }

  _emit(name, payload) {
    const list = this._listeners[name];
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](payload);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._raf) CAF(this._raf);
    if (this._copyTimer) clearTimeout(this._copyTimer);
    if (this._ro) {
      this._ro.disconnect();
      this._ro = null;
    }
    for (let i = 0; i < this._domListeners.length; i++) {
      const [target, type, handler] = this._domListeners[i];
      target.removeEventListener(type, handler);
    }
    this._domListeners = [];
    if (this.element) {
      const nodes = [this._activeLine, this._pre, this._gutter, this._textarea, this._copyBtn];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n && n.parentNode === this.element) this.element.removeChild(n);
      }
      this.element.classList.remove(
        'vd-code-editor',
        'is-wrap',
        'is-readonly',
        'has-gutter',
        'is-focused',
      );
    }
    this._listeners = Object.create(null);
    this._textarea = null;
    this._pre = null;
    this._code = null;
    this._gutter = null;
    this._gutterLines = null;
    this._activeLine = null;
    this._copyBtn = null;
  }
}

export { tokenize, LANGUAGES };
export { highlight, renderTokensToHtml } from './highlight.js';
