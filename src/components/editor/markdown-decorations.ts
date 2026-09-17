import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { type EditorState, type Extension, type Range, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

function decorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const mark = (from: number, to: number, className: string) => {
    if (from < to) ranges.push(Decoration.mark({ class: className }).range(from, to));
  };
  const tree = ensureSyntaxTree(state, state.doc.length, 100) ?? syntaxTree(state);
  tree.iterate({
    enter(node) {
      const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
      if (heading) {
        ranges.push(
          Decoration.line({ class: `cm-md-heading-line cm-md-heading-${heading[1]}` }).range(
            state.doc.lineAt(node.from).from,
          ),
        );
      }
      if (node.name === 'ListMark') mark(node.from, node.to, 'cm-md-list-marker');
      if (node.name === 'QuoteMark') mark(node.from, node.to, 'cm-md-syntax-mark');
      if (node.name === 'Blockquote') {
        const first = state.doc.lineAt(node.from).number;
        const last = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
        for (let number = first; number <= last; number++) {
          ranges.push(
            Decoration.line({ class: 'cm-md-quote-line' }).range(state.doc.line(number).from),
          );
        }
      }
      if (node.name === 'InlineCode') {
        mark(node.from, node.to, 'cm-md-inline-code');
        const revealed = state.selection.ranges.some((range) =>
          range.empty
            ? range.from >= node.from && range.from <= node.to
            : range.from < node.to && range.to > node.from,
        );
        for (let child = node.node.firstChild; child; child = child.nextSibling) {
          if (child.name !== 'CodeMark') continue;
          if (revealed) mark(child.from, child.to, 'cm-md-code-mark');
          else ranges.push(Decoration.replace({}).range(child.from, child.to));
        }
        return false;
      }
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
        const first = state.doc.lineAt(node.from).number;
        const last = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
        for (let number = first; number <= last; number++) {
          const classes = ['cm-md-code-line'];
          if (number === first) classes.push('cm-md-code-first');
          if (number === last) classes.push('cm-md-code-last');
          ranges.push(
            Decoration.line({ class: classes.join(' ') }).range(state.doc.line(number).from),
          );
        }
        for (let child = node.node.firstChild; child; child = child.nextSibling) {
          if (child.name === 'CodeMark') mark(child.from, child.to, 'cm-md-code-mark');
          if (child.name === 'CodeInfo') mark(child.from, child.to, 'cm-md-code-info');
        }
        return false;
      }
    },
  });
  return Decoration.set(ranges, true);
}

const field = StateField.define<DecorationSet>({
  create: decorations,
  update(value, transaction) {
    return transaction.docChanged ||
      transaction.selection ||
      syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
      ? decorations(transaction.state)
      : value;
  },
  provide: (value) => EditorView.decorations.from(value),
});

const copyHandler = EditorView.domEventHandlers({
  copy(event, view) {
    const selection = view.state.selection;
    const text = selection.ranges.some((range) => !range.empty)
      ? selection.ranges
          .filter((range) => !range.empty)
          .map((range) => view.state.sliceDoc(range.from, range.to))
          .join(view.state.lineBreak)
      : selection.ranges
          .map((range) => view.state.doc.lineAt(range.from).text)
          .join(view.state.lineBreak);
    if (!event.clipboardData || !text) return false;
    event.preventDefault();
    event.clipboardData.clearData();
    event.clipboardData.setData('text/plain', text);
    return true;
  },
});

export const markdownDecorations: Extension = [field, copyHandler];
