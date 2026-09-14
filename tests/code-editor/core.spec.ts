// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import {
  VdCodeEditor as VdCodeEditorCore,
  VD_CODE_EDITOR_VERSION,
} from '../../src/code-editor/core.js';

interface EditorWithInternals extends VdCodeEditorCore {
  _destroyed?: boolean;
  _opts: Record<string, unknown>;
  _domListeners?: unknown[];
}

function createHost(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('VdCodeEditorCore', () => {
  let host: HTMLDivElement | null = null;
  let editor: EditorWithInternals | null = null;

  it('exports matching version constant', () => {
    expect(VD_CODE_EDITOR_VERSION).toBe('1.1.0');
  });

  afterEach(() => {
    if (editor && !editor._destroyed) {
      editor.destroy();
    }
    editor = null;
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
    host = null;
  });

  describe('mount', () => {
    it('builds textarea + highlight layer, sets value, mounts gutter, adds class', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host, value: 'test content' });

      expect(host.classList.contains('vd-code-editor')).toBe(true);
      expect(host.querySelector('textarea.vd-code-editor-input')).not.toBeNull();
      expect(host.querySelector('pre.vd-code-editor-highlight')).not.toBeNull();
      expect(host.querySelector('code.vd-code-editor-code')).not.toBeNull();
      expect(host.querySelector('div.vd-code-editor-gutter')).not.toBeNull();
      expect(editor.getValue()).toBe('test content');
    });
  });

  describe('getValue / setValue', () => {
    it('getValue returns the textarea value', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host, value: 'initial' });
      expect(editor.getValue()).toBe('initial');
    });

    it('setValue updates the value and triggers repaint', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host });
      editor.setValue('new value');
      expect(editor.getValue()).toBe('new value');
      const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe('new value');
    });

    it('setValue with { silent: true } does not emit change', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host });
      let called = false;
      editor.on('change', () => {
        called = true;
      });
      editor.setValue('new value', { silent: true });
      expect(called).toBe(false);
      expect(editor.getValue()).toBe('new value');
    });

    it('setValue with same value is a no-op (idempotent)', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host, value: 'test' });
      let called = false;
      editor.on('change', () => {
        called = true;
      });
      editor.setValue('test');
      expect(called).toBe(false);
    });
  });

  describe('getSelection / setSelection', () => {
    it('setSelection sets selectionStart/selectionEnd and getSelection gets it', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host, value: 'hello world' });
      editor.setSelection(0, 5);

      const sel = editor.getSelection();
      expect(sel.start).toBe(0);
      expect(sel.end).toBe(5);
      expect(sel.text).toBe('hello');
    });

    it('setSelection without end parameter sets collapsed caret', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host, value: 'hello world' });
      editor.setSelection(5);
      const sel = editor.getSelection();
      expect(sel.start).toBe(5);
      expect(sel.end).toBe(5);
      expect(sel.text).toBe('');
    });
  });

  describe('insertText', () => {
    it('inserts text at caret position', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host, value: 'hello' });
      editor.setSelection(5);
      editor.insertText(' world');
      expect(editor.getValue()).toBe('hello world');
      const sel = editor.getSelection();
      expect(sel.start).toBe(11);
      expect(sel.end).toBe(11);
    });
  });

  describe('setLanguage', () => {
    it('changes the internal language option and triggers repaint', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host, language: 'html' });
      expect(editor._opts.language).toBe('html');
      editor.setLanguage('css');
      expect(editor._opts.language).toBe('css');
    });

    it('can chain (returns this)', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host });
      expect(editor.setLanguage('js')).toBe(editor);
    });
  });

  describe('setReadOnly', () => {
    it('sets textarea.readOnly and adds/removes is-readonly class', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host });

      editor.setReadOnly(true);
      const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea.readOnly).toBe(true);
      expect(host.classList.contains('is-readonly')).toBe(true);

      editor.setReadOnly(false);
      expect(textarea.readOnly).toBe(false);
      expect(host.classList.contains('is-readonly')).toBe(false);
    });
  });

  describe('setTabSize', () => {
    it('updates tabSize CSS custom property and inline styles', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host });
      editor.setTabSize(4);

      expect(host.style.getPropertyValue('--vd-code-editor-tab-size')).toBe('4');

      const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
      const pre = host.querySelector('pre') as HTMLPreElement;
      expect(textarea.style.tabSize).toBe('4');
      expect(pre.style.tabSize).toBe('4');
    });
  });

  describe('setPlaceholder', () => {
    it('updates textarea.placeholder', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host });
      editor.setPlaceholder('enter code here');
      const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea.placeholder).toBe('enter code here');
    });
  });

  describe('setAutoClose', () => {
    it('disables and enables auto-close', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host });
      editor.setAutoClose(false);
      expect(editor._opts.autoClose).toBe(false);
      editor.setAutoClose(true);
      expect(editor._opts.autoClose).toBe(true);
    });
  });

  describe('on / off', () => {
    it('registers and removes change listener', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host });

      let calls = 0;
      const handler = () => {
        calls++;
      };

      editor.on('change', handler);
      editor.setValue('v1');
      expect(calls).toBe(1);

      editor.off('change', handler);
      editor.setValue('v2');
      expect(calls).toBe(1);
    });
  });

  describe('focus / blur', () => {
    it('focuses and blurs textarea, returns this for chaining', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host });
      const textarea = host.querySelector('textarea') as HTMLTextAreaElement;

      expect(editor.focus()).toBe(editor);
      expect(document.activeElement).toBe(textarea);

      expect(editor.blur()).toBe(editor);
      expect(document.activeElement).not.toBe(textarea);
    });
  });

  describe('destroy', () => {
    it('cleans up elements, classes, references, and listeners', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host, value: 'test content' });

      editor.destroy();

      expect(host.innerHTML).toBe('');
      expect(host.classList.contains('vd-code-editor')).toBe(false);
      expect(editor._destroyed).toBe(true);
      expect(editor._domListeners.length).toBe(0);

      // After destroy, getValue still returns the last known value
      expect(editor.getValue()).toBe('test content');
    });
  });

  describe('gutter', () => {
    it('updates gutter text to match line count', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host, value: 'line1\nline2\nline3' });

      const gutter = host.querySelector('.vd-code-editor-gutter') as HTMLDivElement;
      expect(gutter).not.toBeNull();
      expect(gutter.textContent).toContain('1');
      expect(gutter.textContent).toContain('2');
      expect(gutter.textContent).toContain('3');
    });

    it('is not created when lineNumbers is false', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host, lineNumbers: false });
      expect(host.querySelector('.vd-code-editor-gutter')).toBeNull();
    });
  });

  describe('wrap mode', () => {
    it('adds is-wrap class, does not create gutter or active-line', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host, wrap: true });

      expect(host.classList.contains('is-wrap')).toBe(true);
      expect(host.querySelector('.vd-code-editor-gutter')).toBeNull();
      expect(host.querySelector('.vd-code-editor-active-line')).toBeNull();
    });
  });

  describe('maxHighlightLength', () => {
    it('adds is-plain class to code element when value exceeds maxHighlightLength', () => {
      host = createHost();
      editor = new VdCodeEditorCore({ element: host, maxHighlightLength: 5, value: '123456' });
      const code = host.querySelector('code') as HTMLElement;
      expect(code.classList.contains('is-plain')).toBe(true);
    });
  });
});
