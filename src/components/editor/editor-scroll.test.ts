// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { restoreEditorScroll } from './editor-scroll';

it('restores internal scrolling in CodeMirror measurement write phase', () => {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc: 'text' }),
  });
  let measurement: Parameters<EditorView['requestMeasure']>[0];
  view.requestMeasure = (request) => {
    measurement = request;
  };
  let restored = false;
  restoreEditorScroll(view, { top: 200, left: 30 }, () => {
    restored = true;
  });
  expect(view.scrollDOM.scrollTop).toBe(0);
  const measured = measurement!.read(view);
  measurement!.write!(measured, view);
  expect(view.scrollDOM.scrollTop).toBe(200);
  expect(view.scrollDOM.scrollLeft).toBe(30);
  expect(restored).toBe(true);
  view.destroy();
  document.body.replaceChildren();
});
