import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

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

function buildDecorations(doc: ProseMirrorNode, term: string): DecorationSet {
  if (!term) return DecorationSet.empty;
  const lowerTerm = term.toLowerCase();
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const lowerText = node.text.toLowerCase();
    let idx = lowerText.indexOf(lowerTerm);
    while (idx !== -1) {
      decorations.push(
        Decoration.inline(pos + idx, pos + idx + term.length, {
          class: 'rounded-sm bg-indigo-400/30 text-indigo-200',
        }),
      );
      idx = lowerText.indexOf(lowerTerm, idx + term.length);
    }
  });

  return DecorationSet.create(doc, decorations);
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
