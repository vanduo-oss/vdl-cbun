/**
 * Vue 3 bindings for @vanduo-oss/vdl-cbun/code-editor — the primary export.
 *
 *   import { VdCodeEditor } from '@vanduo-oss/vdl-cbun/code-editor';
 *   <VdCodeEditor v-model="code" language="javascript" @change="onChange" />
 *
 * The editor core stays framework-agnostic in ./core.js. SSR-safe: the editor is
 * created on mount (client) into a plain container the server can pre-render.
 */
import { defineComponent, h, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { VdCodeEditor as VdCodeEditorCore } from './core.js';

export const VdCodeEditor = defineComponent({
  name: 'VdCodeEditor',
  props: {
    /** Editor contents (v-model). */
    modelValue: { type: String, default: '' },
    /** Syntax language id or alias (e.g. `js`, `python`, `plaintext`). */
    language: { type: String, default: 'plaintext' },
    /** Render as a non-editable viewer (copy still works). */
    readOnly: { type: Boolean, default: false },
    /** Show the line-number gutter (ignored in wrap mode). */
    lineNumbers: { type: Boolean, default: true },
    /** Indent width, in spaces. */
    tabSize: { type: Number, default: 2 },
    /** Empty-state placeholder text. */
    placeholder: { type: String, default: '' },
    /** Native `maxlength` cap on the content. */
    maxLength: { type: Number, default: undefined },
    /** Soft-wrap long lines (disables the gutter + active-line). */
    wrap: { type: Boolean, default: false },
    /** Auto-close brackets/quotes and step over closers. */
    autoClose: { type: Boolean, default: true },
    /** Highlight the caret's line (ignored in wrap mode). */
    highlightActiveLine: { type: Boolean, default: true },
    /** Skip highlighting above this many characters (perf guard). */
    maxHighlightLength: { type: Number, default: 100000 },
    /** Native spellcheck on the textarea. */
    spellcheck: { type: Boolean, default: false },
    /** Show the copy-to-clipboard button (when the clipboard API exists). */
    copy: { type: Boolean, default: true },
    /** Accessible label for the textarea. */
    ariaLabel: { type: String, default: 'Code editor' },
  },
  emits: ['update:modelValue', 'change', 'focus', 'blur', 'ready'],
  setup(props, { emit, expose }) {
    const el = ref(null);
    let instance = null;

    const create = () => {
      instance = new VdCodeEditorCore({
        element: el.value,
        value: props.modelValue,
        language: props.language,
        readOnly: props.readOnly,
        lineNumbers: props.lineNumbers,
        tabSize: props.tabSize,
        placeholder: props.placeholder,
        maxLength: props.maxLength,
        wrap: props.wrap,
        autoClose: props.autoClose,
        highlightActiveLine: props.highlightActiveLine,
        maxHighlightLength: props.maxHighlightLength,
        spellcheck: props.spellcheck,
        copy: props.copy,
        ariaLabel: props.ariaLabel,
      });
      instance.on('change', (payload) => {
        emit('update:modelValue', payload.value);
        emit('change', payload.value);
      });
      instance.on('focus', (e) => emit('focus', e));
      instance.on('blur', (e) => emit('blur', e));
      emit('ready', instance);
    };

    const teardown = () => {
      if (instance) {
        instance.destroy();
        instance = null;
      }
    };

    onMounted(() => {
      if (typeof window === 'undefined' || !el.value) return;
      create();
    });

    // v-model: push external changes in without echoing a change back out.
    watch(
      () => props.modelValue,
      (next) => {
        if (instance && next !== instance.getValue()) instance.setValue(next, { silent: true });
      },
    );

    // Cheap props apply live.
    watch(
      () => props.language,
      (v) => instance && instance.setLanguage(v),
    );
    watch(
      () => props.readOnly,
      (v) => instance && instance.setReadOnly(v),
    );
    watch(
      () => props.tabSize,
      (v) => instance && instance.setTabSize(v),
    );
    watch(
      () => props.placeholder,
      (v) => instance && instance.setPlaceholder(v),
    );
    watch(
      () => props.autoClose,
      (v) => instance && instance.setAutoClose(v),
    );

    // Structural props recreate the editor (mirrors the flowchart wrapper).
    watch(
      () => [
        props.lineNumbers,
        props.wrap,
        props.highlightActiveLine,
        props.spellcheck,
        props.maxLength,
        props.maxHighlightLength,
        props.copy,
        props.ariaLabel,
      ],
      () => {
        if (!instance) return;
        teardown();
        create();
      },
    );

    onBeforeUnmount(teardown);

    expose({
      getInstance: () => instance,
      focus: () => instance && instance.focus(),
      blur: () => instance && instance.blur(),
      getValue: () => (instance ? instance.getValue() : props.modelValue),
      setValue: (value) => instance && instance.setValue(value),
      getSelection: () => (instance ? instance.getSelection() : { start: 0, end: 0, text: '' }),
      setSelection: (start, end) => instance && instance.setSelection(start, end),
      insertText: (text) => instance && instance.insertText(text),
      getContainer: () => el.value,
    });

    return () => h('div', { ref: el, class: 'vd-code-editor' });
  },
});
