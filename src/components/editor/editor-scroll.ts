import type { EditorView } from '@codemirror/view';

export interface EditorScrollPosition {
  top: number;
  left: number;
}

export function restoreEditorScroll(
  view: EditorView,
  position: EditorScrollPosition,
  afterMeasure?: () => void,
): void {
  view.requestMeasure({
    key: restoreEditorScroll,
    read: () => position,
    write: (saved) => {
      view.scrollDOM.scrollTop = saved.top;
      view.scrollDOM.scrollLeft = saved.left;
      afterMeasure?.();
    },
  });
}
