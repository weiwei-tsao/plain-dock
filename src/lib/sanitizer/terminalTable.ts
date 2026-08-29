export type TerminalTableResult =
  | { type: 'table'; markdown: string }
  | { type: 'code' }
  | { type: 'none' };

const BOX_CHARS = '┌┬┐├┼┤└┴┘│─╭╮╰╯╔╗╚╝╠╣╦╩║═╬';
const BOX_CHAR_SET = new Set(BOX_CHARS.split(''));
const BOX_CONTENT_DELIMITERS = ['│', '║'] as const;

function isBoxBorderLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  return Array.from(trimmed).every((ch) => BOX_CHAR_SET.has(ch));
}

function boxContentDelimiter(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length < 2) return null;
  return (
    BOX_CONTENT_DELIMITERS.find((ch) => trimmed.startsWith(ch) && trimmed.endsWith(ch)) ?? null
  );
}

function isBoxContentLine(line: string): boolean {
  return boxContentDelimiter(line) !== null;
}

function isAsciiBorderLine(line: string): boolean {
  return /^\+[-+]+\+$/.test(line.trim());
}

function isAsciiContentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= 2 && trimmed.startsWith('|') && trimmed.endsWith('|');
}

function splitCells(line: string, delimiter: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.slice(1, -1);
  return inner.split(delimiter).map((cell) => cell.trim());
}

function escapePipes(cell: string): string {
  return cell.replace(/\|/g, '\\|');
}

function buildMarkdownTable(rows: string[][]): string {
  const [header, ...body] = rows;
  const colCount = header.length;
  const headerLine = `| ${header.map(escapePipes).join(' | ')} |`;
  const alignLine = `| ${Array(colCount).fill('---').join(' | ')} |`;
  const bodyLines = body.map((row) => `| ${row.map(escapePipes).join(' | ')} |`);
  return [headerLine, alignLine, ...bodyLines].join('\n');
}

export function detectTerminalTable(text: string): TerminalTableResult {
  const lines = text.split('\n');
  const nonBlankLines = lines.filter((l) => l.trim() !== '');
  if (nonBlankLines.length === 0) return { type: 'none' };

  const boxBorderCount = nonBlankLines.filter(isBoxBorderLine).length;
  const boxContentCount = nonBlankLines.filter(isBoxContentLine).length;
  const asciiBorderCount = nonBlankLines.filter(isAsciiBorderLine).length;
  const asciiContentCount = nonBlankLines.filter(isAsciiContentLine).length;

  const boxTotal = boxBorderCount + boxContentCount;
  const asciiTotal = asciiBorderCount + asciiContentCount;
  const useBox = boxTotal >= asciiTotal;

  const borderCount = useBox ? boxBorderCount : asciiBorderCount;
  const contentCount = useBox ? boxContentCount : asciiContentCount;
  const total = useBox ? boxTotal : asciiTotal;

  if (borderCount === 0 || total / nonBlankLines.length < 0.5) return { type: 'none' };
  if (contentCount < 2) return { type: 'code' };

  const contentLines = nonBlankLines.filter((l) =>
    useBox ? isBoxContentLine(l) : isAsciiContentLine(l),
  );
  const delimiter = useBox ? (boxContentDelimiter(contentLines[0]) ?? '│') : '|';
  const rows = contentLines.map((line) => splitCells(line, delimiter));
  const colCount = rows[0].length;
  const consistent = colCount >= 2 && rows.every((row) => row.length === colCount);

  if (!consistent) return { type: 'code' };

  return { type: 'table', markdown: buildMarkdownTable(rows) };
}
