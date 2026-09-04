import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { indexOfCI } from '@/lib/search-highlight';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearchHighlight: (term: string) => ReturnType;
    };
  }
}

const searchHighlightKey = new PluginKey<{ term: string; decorations: DecorationSet }>(
  'searchHighlight',
);

// Marks (bold/italic/etc.) split one logical run of text into sibling text
// nodes at their boundaries, so a query straddling a mark boundary (e.g.
// "hello" in `hel<strong>lo</strong>`) is invisible to a per-text-node scan.
// Concatenating each textblock's own text first — with a position map back
// to document offsets — lets a match span those sibling nodes.
function buildDecorations(doc: ProseMirrorNode, term: string): DecorationSet {
  if (!term) return DecorationSet.empty;
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      if (!child.isText || !child.text) return;
      for (let i = 0; i < child.text.length; i++) positions.push(pos + 1 + offset + i);
      text += child.text;
    });

    let idx = indexOfCI(text, term);
    while (idx !== -1) {
      const from = positions[idx];
      const to = positions[idx + term.length - 1] + 1;
      decorations.push(
        Decoration.inline(from, to, {
          class: 'rounded-sm bg-indigo-400/30 text-indigo-200',
        }),
      );
      idx = indexOfCI(text, term, idx + term.length);
    }
  });

  return DecorationSet.create(doc, decorations);
}

/** Earliest document position among the current search decorations, if any. */
export function getFirstMatchPos(state: EditorState): number | null {
  const found = searchHighlightKey.getState(state)?.decorations.find();
  if (!found || found.length === 0) return null;
  return found.reduce((min, d) => Math.min(min, d.from), found[0].from);
}

export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchHighlightKey,
        state: {
          init: () => ({ term: '', decorations: DecorationSet.empty }),
          apply(tr, prev) {
            const meta = tr.getMeta(searchHighlightKey) as { term: string } | undefined;
            const term = meta?.term ?? prev.term;
            if (meta !== undefined || tr.docChanged) {
              return { term, decorations: buildDecorations(tr.doc, term) };
            }
            return prev;
          },
        },
        props: {
          decorations(state) {
            return searchHighlightKey.getState(state)?.decorations;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setSearchHighlight:
        (term: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(searchHighlightKey, { term }));
          return true;
        },
    };
  },
});

export default SearchHighlight;
