// @vitest-environment jsdom

// Vue wrapper mount spec for <VdCodeEditor> (jsdom). The wrapper is a thin
// bridge: on mount it builds the framework-agnostic core into its container,
// re-emits change/focus/blur, pushes v-model updates in without echoing, applies
// cheap props live, recreates on structural prop changes, and destroys on
// unmount. Real caret/undo/overlay behavior is covered by the Playwright fixture.

import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import { VdCodeEditor } from '../../src/code-editor/index.js';
import type { VdCodeEditorExposed } from '../../src/code-editor/vue.js';

const wrappers: VueWrapper[] = [];
function mountEditor(props: Record<string, unknown> = {}): VueWrapper {
  const wrapper = mount(VdCodeEditor, { props, attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}

function rootOf(wrapper: VueWrapper): HTMLElement {
  return wrapper.find('div.vd-code-editor').element as HTMLElement;
}

function exposedOf(wrapper: VueWrapper): VdCodeEditorExposed {
  return wrapper.vm as unknown as VdCodeEditorExposed;
}

afterEach(() => {
  while (wrappers.length) wrappers.pop()!.unmount();
});

describe('VdCodeEditor — mount', () => {
  it('builds the textarea + highlight layer inside its container', () => {
    const root = rootOf(mountEditor({ modelValue: 'const x = 1;', language: 'javascript' }));
    const ta = root.querySelector('textarea.vd-code-editor-input') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.value).toBe('const x = 1;');
    expect(root.querySelector('pre.vd-code-editor-highlight')).toBeTruthy();
    expect(root.querySelector('code.vd-code-editor-code')?.childNodes.length).toBeGreaterThan(0);
  });

  it('shows the gutter by default and hides it in wrap mode', () => {
    expect(rootOf(mountEditor()).querySelector('.vd-code-editor-gutter')).toBeTruthy();
    expect(rootOf(mountEditor({ wrap: true })).querySelector('.vd-code-editor-gutter')).toBeNull();
  });

  it('emits `ready` once with the core instance', () => {
    const wrapper = mountEditor();
    const ready = wrapper.emitted('ready');
    expect(ready).toHaveLength(1);
    expect(ready![0][0]).toBeTruthy();
  });
});

describe('VdCodeEditor — v-model + events', () => {
  it('emits update:modelValue and change when the textarea input fires', async () => {
    const wrapper = mountEditor({ modelValue: '' });
    await wrapper.find('textarea').setValue('hello');
    expect(wrapper.emitted('update:modelValue')!.at(-1)![0]).toBe('hello');
    expect(wrapper.emitted('change')!.at(-1)![0]).toBe('hello');
  });

  it('pushes external modelValue changes into the textarea without echoing', async () => {
    const wrapper = mountEditor({ modelValue: 'a' });
    await wrapper.setProps({ modelValue: 'external' });
    const ta = rootOf(wrapper).querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('external');
    // silent setValue must not emit another update:modelValue
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('forwards focus and blur', async () => {
    const wrapper = mountEditor();
    const ta = wrapper.find('textarea');
    await ta.trigger('focus');
    await ta.trigger('blur');
    expect(wrapper.emitted('focus')).toHaveLength(1);
    expect(wrapper.emitted('blur')).toHaveLength(1);
    expect(rootOf(wrapper).classList.contains('is-focused')).toBe(false);
  });
});

describe('VdCodeEditor — props', () => {
  it('renders read-only and reflects it on the textarea', () => {
    const ta = rootOf(mountEditor({ readOnly: true })).querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    expect(ta.readOnly).toBe(true);
  });

  it('applies a live language change without recreating', async () => {
    const wrapper = mountEditor({ language: 'javascript' });
    await wrapper.setProps({ language: 'python' });
    expect(wrapper.emitted('ready')).toHaveLength(1); // no recreate
  });

  it('recreates on a structural prop change', async () => {
    const wrapper = mountEditor({});
    expect(wrapper.emitted('ready')).toHaveLength(1);
    await wrapper.setProps({ wrap: true });
    expect(wrapper.emitted('ready')).toHaveLength(2); // torn down + recreated
    expect(rootOf(wrapper).querySelector('.vd-code-editor-gutter')).toBeNull();
  });
});

describe('VdCodeEditor — unmount', () => {
  it('destroys the core instance on unmount', () => {
    const wrapper = mount(VdCodeEditor, { attachTo: document.body });
    const instance = wrapper.emitted('ready')![0][0] as {
      _destroyed: boolean;
      _ro: unknown;
      _domListeners: unknown[];
    };
    expect(instance._destroyed).toBe(false);
    expect(instance._domListeners.length).toBeGreaterThan(0);
    wrapper.unmount();
    expect(instance._destroyed).toBe(true);
    // Cleanup: ResizeObserver disconnected + every tracked DOM listener removed.
    expect(instance._ro).toBeNull();
    expect(instance._domListeners).toHaveLength(0);
  });
});

describe('VdCodeEditor — keymap', () => {
  const taOf = (w: VueWrapper): HTMLTextAreaElement =>
    w.find('textarea.vd-code-editor-input').element as HTMLTextAreaElement;
  const press = (ta: HTMLTextAreaElement, key: string, shiftKey = false): void => {
    ta.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
    );
  };

  it('Tab inserts an indent unit at the caret', () => {
    const ta = taOf(mountEditor({ modelValue: 'x', language: 'javascript' }));
    ta.focus();
    ta.setSelectionRange(0, 0);
    press(ta, 'Tab');
    expect(ta.value.length).toBeGreaterThan(1);
    expect(ta.value.startsWith(' ')).toBe(true);
    expect(ta.value.endsWith('x')).toBe(true);
  });

  it('Shift+Tab outdents the leading indentation', () => {
    const ta = taOf(mountEditor({ modelValue: '    x', language: 'javascript' }));
    ta.focus();
    ta.setSelectionRange(4, 4);
    press(ta, 'Tab', true);
    expect(ta.value.length).toBeLessThan(5);
    expect(ta.value.endsWith('x')).toBe(true);
  });
});

describe('VdCodeEditor — exposed methods', () => {
  it('getInstance returns the core instance', () => {
    const wrapper = mountEditor();
    const instance = exposedOf(wrapper).getInstance();
    expect(instance).toBeTruthy();
    expect(typeof instance?.getValue).toBe('function');
  });

  it('getValue returns the current value', () => {
    const wrapper = mountEditor({ modelValue: 'hello' });
    expect(exposedOf(wrapper).getValue()).toBe('hello');
  });

  it('setValue updates the textarea value', () => {
    const wrapper = mountEditor();
    exposedOf(wrapper).setValue('new value');
    const ta = rootOf(wrapper).querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('new value');
  });

  it('getSelection returns collapsed caret at start by default', () => {
    const wrapper = mountEditor();
    expect(exposedOf(wrapper).getSelection()).toEqual({ start: 0, end: 0, text: '' });
  });

  it('setSelection positions the caret', () => {
    const wrapper = mountEditor({ modelValue: 'hello' });
    exposedOf(wrapper).setSelection(2, 4);
    expect(exposedOf(wrapper).getSelection()).toEqual({ start: 2, end: 4, text: 'll' });
  });

  it('insertText inserts at current caret position', () => {
    const wrapper = mountEditor({ modelValue: 'ab' });
    exposedOf(wrapper).insertText('XY');
    expect(exposedOf(wrapper).getValue()).toContain('XY');
  });

  it('focus and blur control textarea focus', () => {
    const wrapper = mountEditor();
    exposedOf(wrapper).focus();
    const ta = rootOf(wrapper).querySelector('textarea') as HTMLTextAreaElement;
    expect(document.activeElement).toBe(ta);
    exposedOf(wrapper).blur();
    expect(document.activeElement).not.toBe(ta);
  });

  it('getContainer returns the root element', () => {
    const wrapper = mountEditor();
    expect(exposedOf(wrapper).getContainer()).toBe(rootOf(wrapper));
  });
});

describe('VdCodeEditor — additional props', () => {
  const taOf = (w: VueWrapper): HTMLTextAreaElement =>
    w.find('textarea.vd-code-editor-input').element as HTMLTextAreaElement;
  const press = (ta: HTMLTextAreaElement, key: string, shiftKey = false): void => {
    ta.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
    );
  };

  it('tabSize sets the indent width', () => {
    const wrapper = mountEditor({ tabSize: 4 });
    expect(rootOf(wrapper).style.getPropertyValue('--vd-code-editor-tab-size')).toBe('4');
  });

  it('placeholder sets textarea placeholder text', () => {
    const wrapper = mountEditor({ placeholder: 'Type here' });
    const ta = taOf(wrapper);
    expect(ta.placeholder).toBe('Type here');
  });

  it('autoClose: false disables bracket auto-closing', () => {
    const wrapper = mountEditor({ autoClose: false });
    const ta = taOf(wrapper);
    ta.value = '';
    ta.setSelectionRange(0, 0);
    press(ta, '(');
    const instance = exposedOf(wrapper).getInstance() as unknown as {
      _opts: { autoClose: boolean };
    };
    expect(instance._opts.autoClose).toBe(false);
    expect(ta.value).toBe('');
  });

  it('autoClose: true inserts the matching pair', () => {
    const wrapper = mountEditor({ autoClose: true });
    const ta = taOf(wrapper);
    ta.value = '';
    ta.setSelectionRange(0, 0);
    press(ta, '(');
    expect(ta.value).toBe('()');
  });

  it('lineNumbers false hides the gutter', () => {
    const wrapper = mountEditor({ lineNumbers: false });
    expect(rootOf(wrapper).querySelector('.vd-code-editor-gutter')).toBeNull();
  });

  it('ariaLabel sets the textarea aria-label', () => {
    const wrapper = mountEditor({ ariaLabel: 'My editor' });
    const ta = taOf(wrapper);
    expect(ta.getAttribute('aria-label')).toBe('My editor');
  });

  it('spellcheck sets the textarea spellcheck attribute', () => {
    const wrapperTrue = mountEditor({ spellcheck: true });
    expect(taOf(wrapperTrue).spellcheck).toBe(true);

    const wrapperDefault = mountEditor();
    expect(taOf(wrapperDefault).spellcheck).toBe(false);
  });
});
