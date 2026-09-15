import { describe, it, expect } from 'vitest';
import { toggleInlineMark, toggleLinePrefix, wrapCodeBlock } from './formatting';

describe('toggleInlineMark', () => {
  it('wraps a selection that has no marker yet', () => {
    const result = toggleInlineMark('hello world', { start: 0, end: 5 }, '**');
    expect(result.text).toBe('**hello** world');
    expect(result.selection).toEqual({ start: 2, end: 7 });
  });

  it('unwraps a selection already surrounded by the marker', () => {
    const result = toggleInlineMark('**hello** world', { start: 2, end: 7 }, '**');
    expect(result.text).toBe('hello world');
    expect(result.selection).toEqual({ start: 0, end: 5 });
  });

  it('inserts an empty pair at the cursor when the selection is collapsed', () => {
    const result = toggleInlineMark('hello world', { start: 5, end: 5 }, '**');
    expect(result.text).toBe('hello**** world');
    expect(result.selection).toEqual({ start: 7, end: 7 });
  });
});

describe('toggleLinePrefix', () => {
  it('adds a heading marker to a single line', () => {
    const result = toggleLinePrefix('Shopping List', { start: 0, end: 0 }, '# ');
    expect(result.text).toBe('# Shopping List');
  });

  it('removes an existing heading marker (toggle off)', () => {
    const result = toggleLinePrefix('# Shopping List', { start: 2, end: 2 }, '# ');
    expect(result.text).toBe('Shopping List');
  });

  it('adds a bullet marker to every non-empty line in a multi-line selection', () => {
    const text = 'Milk\nEggs';
    const result = toggleLinePrefix(text, { start: 0, end: text.length }, '- ');
    expect(result.text).toBe('- Milk\n- Eggs');
  });

  it('leaves blank lines in the selection untouched', () => {
    const text = 'Milk\n\nEggs';
    const result = toggleLinePrefix(text, { start: 0, end: text.length }, '- ');
    expect(result.text).toBe('- Milk\n\n- Eggs');
  });
});

describe('wrapCodeBlock', () => {
  it('wraps the selected line(s) in a fenced code block', () => {
    const result = wrapCodeBlock('const x = 1;', { start: 0, end: 12 });
    expect(result.text).toBe('```\nconst x = 1;\n```');
    expect(result.selection).toEqual({ start: 4, end: 16 });
  });
});
