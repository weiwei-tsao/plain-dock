export interface Selection {
  start: number;
  end: number;
}

export interface FormattingResult {
  text: string;
  selection: Selection;
}

export function toggleInlineMark(text: string, sel: Selection, marker: string): FormattingResult {
  const { start, end } = sel;
  const before = text.slice(Math.max(0, start - marker.length), start);
  const after = text.slice(end, end + marker.length);

  if (before === marker && after === marker) {
    const newText =
      text.slice(0, start - marker.length) +
      text.slice(start, end) +
      text.slice(end + marker.length);
    return {
      text: newText,
      selection: { start: start - marker.length, end: end - marker.length },
    };
  }

  const newText = text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end);
  return { text: newText, selection: { start: start + marker.length, end: end + marker.length } };
}

function lineBounds(text: string, sel: Selection): { lineStart: number; lineEnd: number } {
  const lineStart = text.lastIndexOf('\n', sel.start - 1) + 1;
  const nextBreak = text.indexOf('\n', sel.end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  return { lineStart, lineEnd };
}

export function toggleLinePrefix(text: string, sel: Selection, prefix: string): FormattingResult {
  const { lineStart, lineEnd } = lineBounds(text, sel);
  const block = text.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  const allPrefixed = nonEmpty.length > 0 && nonEmpty.every((l) => l.startsWith(prefix));

  const newLines = lines.map((l) => {
    if (l.trim() === '') return l;
    return allPrefixed ? l.slice(prefix.length) : prefix + l;
  });
  const newBlock = newLines.join('\n');
  const newText = text.slice(0, lineStart) + newBlock + text.slice(lineEnd);
  return { text: newText, selection: { start: lineStart, end: lineStart + newBlock.length } };
}

export function toggleCodeBlock(text: string, sel: Selection): FormattingResult {
  const { lineStart, lineEnd } = lineBounds(text, sel);
  const block = text.slice(lineStart, lineEnd);
  const fenced = '```\n' + block + '\n```';
  const newText = text.slice(0, lineStart) + fenced + text.slice(lineEnd);
  return { text: newText, selection: { start: lineStart + 4, end: lineStart + 4 + block.length } };
}
