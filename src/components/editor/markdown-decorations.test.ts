// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { markdownDecorations } from './markdown-decorations';

let view: EditorView | undefined;
afterEach(() => {
  view?.destroy();
  document.body.replaceChildren();
});
function mount(doc: string) {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      extensions: [markdown(), history(), markdownDecorations],
    }),
  });
  return view;
}
describe('Markdown presentation decorations', () => {
  it('decorates heading levels without changing heading syntax', () => {
    const source =
      '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n\nSetext\n======';
    const v = mount(source);
    expect(v.dom.querySelectorAll('.cm-md-heading-line')).toHaveLength(7);
    for (let level = 1; level <= 6; level++) {
      expect(v.dom.querySelectorAll(`.cm-md-heading-${level}`)).toHaveLength(level === 1 ? 2 : 1);
    }
    expect(v.state.sliceDoc()).toBe(source);
    expect(v.contentDOM.textContent).toContain('###### Six');
  });
  it('colors only parsed list markers and paints every code line including blanks', () => {
    const v = mount('- prose with `code`\n\n1. next\n\n```js\na\n\nb\n```');
    expect(Array.from(v.dom.querySelectorAll('.cm-md-list-marker'), (n) => n.textContent)).toEqual([
      '-',
      '1.',
    ]);
    expect(v.dom.querySelector('.cm-md-list-marker')?.textContent).not.toContain('prose');
    expect(v.dom.querySelectorAll('.cm-md-code-line')).toHaveLength(5);
    expect(v.dom.querySelectorAll('.cm-md-code-first')).toHaveLength(1);
    expect(v.dom.querySelectorAll('.cm-md-code-last')).toHaveLength(1);
    expect(v.dom.querySelector('.cm-md-code-info')?.textContent).toBe('js');
  });
  it('uses a structural border and italic secondary text for every quote line', () => {
    const v = mount('> first\n> second');
    expect(v.dom.querySelectorAll('.cm-md-quote-line')).toHaveLength(2);
    expect(Array.from(v.dom.querySelectorAll('.cm-md-code-mark'), (n) => n.textContent)).toEqual(
      [],
    );
  });
  it('paints indented code and nested list code including blank lines', () => {
    const v = mount('    a\n\n    b\n\n- item\n\n  ```\n  c\n\n  d\n  ```');
    expect(v.dom.querySelectorAll('.cm-md-code-line')).toHaveLength(8);
    expect(v.dom.querySelectorAll('.cm-md-code-first')).toHaveLength(2);
    expect(v.dom.querySelectorAll('.cm-md-code-last')).toHaveLength(2);
  });
  it('hides both parsed multi-backtick delimiters, preserves a literal backtick, and reveals on cursor/selection', () => {
    const source = 'x ``a ` b`` end';
    const v = mount(source);
    expect(v.contentDOM.textContent).toBe('x a ` b end');
    expect(v.state.sliceDoc()).toBe(source);
    v.dispatch({ selection: { anchor: 5 } });
    expect(v.contentDOM.textContent).toBe(source);
    expect(Array.from(v.dom.querySelectorAll('.cm-md-code-mark'), (n) => n.textContent)).toEqual([
      '``',
      '``',
    ]);
    v.dispatch({ selection: EditorSelection.range(0, 5) });
    expect(v.contentDOM.textContent).toBe(source);
    v.dispatch({ selection: { anchor: source.length } });
    expect(v.contentDOM.textContent).toBe('x a ` b end');
  });
  it('leaves fences and unpaired backticks intact and never changes undo history', () => {
    const v = mount('x `ok` and `unpaired\n\n```\n`literal`\n```');
    const before = v.state.doc.toString();
    v.dispatch({ selection: { anchor: 4 } });
    v.dispatch({ selection: { anchor: 0 } });
    expect(undo(v)).toBe(false);
    expect(v.contentDOM.textContent).toContain('```');
    expect(v.contentDOM.textContent).toContain('`literal`');
    expect(v.contentDOM.textContent).toContain('`unpaired');
    v.dispatch({ changes: { from: 0, insert: 'edit ' } });
    expect(undo(v)).toBe(true);
    expect(v.state.doc.toString()).toBe(before);
    expect(redo(v)).toBe(true);
    expect(v.state.doc.toString()).toBe('edit ' + before);
  });
  it('copies original Markdown through CodeMirror even when code is visually hidden', () => {
    const v = mount('x `code` y');
    const copied: Record<string, string> = {};
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        clearData() {},
        setData(type: string, value: string) {
          copied[type] = value;
        },
      },
    });
    v.contentDOM.dispatchEvent(event);
    expect(copied['text/plain']).toBe('x `code` y');
  });
});
