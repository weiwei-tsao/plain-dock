import assert from 'node:assert/strict';
import test from 'node:test';

import { detectTerminalTable } from './terminalTable.ts';

test('detects a Unicode box-drawing table', () => {
  const input = [
    '┌──────────────┬──────────┐',
    '│ Repo         │ Status   │',
    '├──────────────┼──────────┤',
    '│ pub-api      │ clean    │',
    '│ pub-web      │ dirty    │',
    '└──────────────┴──────────┘',
  ].join('\n');

  const result = detectTerminalTable(input);
  assert.equal(result.type, 'table');
  assert.equal(
    result.markdown,
    ['| Repo | Status |', '| --- | --- |', '| pub-api | clean |', '| pub-web | dirty |'].join(
      '\n',
    ),
  );
});

test('detects an ASCII grid table', () => {
  const input = [
    '+------+--------+',
    '| Repo | Status |',
    '+------+--------+',
    '| api  | clean  |',
    '+------+--------+',
  ].join('\n');

  const result = detectTerminalTable(input);
  assert.equal(result.type, 'table');
  assert.equal(result.markdown, ['| Repo | Status |', '| --- | --- |', '| api | clean |'].join('\n'));
});

test('escapes literal pipe characters inside box-drawing cell text', () => {
  const input = [
    '┌──────┬──────────┐',
    '│ Repo │ Status   │',
    '├──────┼──────────┤',
    '│ api  │ ok | warn│',
    '└──────┴──────────┘',
  ].join('\n');

  const result = detectTerminalTable(input);
  assert.equal(result.type, 'table');
  assert.match(result.markdown, /ok \\\| warn/);
});

test('falls back to code when column counts are inconsistent', () => {
  const input = [
    '┌──────┬──────────┐',
    '│ Repo │ Status   │',
    '├──────┼──────────┤',
    '│ api  │ clean │ extra │',
    '└──────┴──────────┘',
  ].join('\n');

  assert.deepEqual(detectTerminalTable(input), { type: 'code' });
});

test('falls back to code when there are borders but only one content row', () => {
  const input = ['┌──────┬──────────┐', '│ Repo │ Status   │', '└──────┴──────────┘'].join('\n');

  assert.deepEqual(detectTerminalTable(input), { type: 'code' });
});

test('returns none for plain prose', () => {
  const input = 'Just a normal paragraph about deploying the api service today.';
  assert.deepEqual(detectTerminalTable(input), { type: 'none' });
});

test('returns none for empty input', () => {
  assert.deepEqual(detectTerminalTable(''), { type: 'none' });
  assert.deepEqual(detectTerminalTable('   \n  \n'), { type: 'none' });
});

test('generated markdown renders as a real table', async () => {
  const { markdownToHtml } = await import('./markdown.ts');
  const input = [
    '┌──────┬──────────┐',
    '│ Repo │ Status   │',
    '├──────┼──────────┤',
    '│ api  │ clean    │',
    '└──────┴──────────┘',
  ].join('\n');
  const result = detectTerminalTable(input);
  assert.equal(result.type, 'table');
  assert.match(markdownToHtml(result.markdown), /<table>/);
});
