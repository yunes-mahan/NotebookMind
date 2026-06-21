import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput
} from '@codemirror/language';

export interface ICodeField {
  dom: HTMLElement;
  getValue(): string;
  setValue(value: string): void;
  setEditable(on: boolean): void;
  focus(): void;
}

export interface ICodeFieldOptions {
  readOnly?: boolean;
  minLines?: number;
}

function buildTheme(minLines: number, readOnly: boolean): ReturnType<typeof EditorView.theme> {
  const contentRules: Record<string, string> = { padding: '12px 0' };
  if (minLines > 0) {
    contentRules.minHeight = `${(minLines * 1.6).toFixed(1)}em`;
  }
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--nm-code-bg)',
        color: 'var(--nm-code-text)',
        borderRadius: '12px',
        border: '1px solid var(--nm-code-border)',
        fontSize: '13px',
        overflow: 'hidden'
      },
      '&.cm-focused': readOnly
        ? { outline: 'none' }
        : {
            outline: 'none',
            borderColor: 'var(--nm-accent)',
            boxShadow: '0 0 0 3px var(--nm-accent-light)'
          },
      '.cm-scroller': { fontFamily: 'var(--nm-font-mono)', lineHeight: '1.6' },
      '.cm-content': contentRules,
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--nm-text-faint)',
        border: 'none'
      },
      '.cm-cursor': { borderLeftColor: 'var(--nm-accent)' }
    },
    { dark: false }
  );
}

export function makeCodeField(
  initial: string,
  options: ICodeFieldOptions = {}
): ICodeField {
  const { readOnly = false, minLines = 0 } = options;

  // Pad with blank lines so the gutter actually shows 1..minLines.
  let doc = initial;
  if (minLines > 0) {
    const have = doc === '' ? 1 : doc.split('\n').length;
    if (have < minLines) {
      doc += '\n'.repeat(minLines - have);
    }
  }

  const dom = document.createElement('div');
  dom.style.cssText = 'width:100%';

  const editableComp = new Compartment();

  const view = new EditorView({
    parent: dom,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        indentOnInput(),
        python(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([indentWithTab as any, ...(defaultKeymap as any), ...(historyKeymap as any)]),
        EditorView.lineWrapping,
        editableComp.of([
          EditorView.editable.of(!readOnly),
          EditorState.readOnly.of(readOnly)
        ]),
        buildTheme(minLines, readOnly)
      ]
    })
  });

  return {
    dom,
    getValue: () => view.state.doc.toString(),
    setValue: (value: string) =>
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value }
      }),
    setEditable: (on: boolean) =>
      view.dispatch({
        effects: editableComp.reconfigure([
          EditorView.editable.of(on),
          EditorState.readOnly.of(!on)
        ])
      }),
    focus: () => view.focus()
  };
}
