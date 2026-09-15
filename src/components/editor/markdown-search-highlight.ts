import { EditorView, Decoration, type DecorationSet } from '@codemirror/view';
import { StateField, type Extension } from '@codemirror/state';
import { findMatchRanges } from '@/lib/markdown/find-matches';

const matchDecoration = Decoration.mark({ class: 'cm-search-match' });

function buildDecorations(doc: { toString(): string }, query: string): DecorationSet {
  const ranges = findMatchRanges(doc.toString(), query);
  return Decoration.set(ranges.map((r) => matchDecoration.range(r.from, r.to)));
}

export function searchHighlightExtension(query: string): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state.doc, query);
    },
    update(decorations, tr) {
      if (!tr.docChanged) return decorations;
      return buildDecorations(tr.state.doc, query);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

/** Earliest document position among the current matches for `query`, if any. */
export function getFirstMatchPos(doc: { toString(): string }, query: string): number | null {
  const ranges = findMatchRanges(doc.toString(), query);
  return ranges.length > 0 ? ranges[0].from : null;
}
