import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { getContextSnippet, highlightMatch, indexOfCI } from './search-highlight';

describe('indexOfCI', () => {
  test('finds a case-insensitive match', () => {
    expect(indexOfCI('Hello World', 'world')).toBe(6);
  });

  test('returns -1 when there is no match', () => {
    expect(indexOfCI('Hello World', 'xyz')).toBe(-1);
  });

  test('respects fromIndex', () => {
    expect(indexOfCI('foo foo foo', 'foo', 4)).toBe(4);
  });

  test('stays aligned with the original string for Turkish İ (U+0130)', () => {
    // 'İ'.toLowerCase() === 'i̇' (2 code units), so a naive
    // text.toLowerCase().indexOf(query) would return an index that doesn't
    // line up with `text`'s own indices.
    const text = 'İstanbul';
    expect(indexOfCI(text, 'stanbul')).toBe(1);
  });
});

describe('getContextSnippet', () => {
  test('returns text unchanged when query is empty', () => {
    expect(getContextSnippet('some text here', '')).toBe('some text here');
  });

  test('returns text unchanged when there is no match', () => {
    expect(getContextSnippet('some text here', 'xyz')).toBe('some text here');
  });

  test('adds a leading ellipsis when the match is far from the start', () => {
    const text = 'a'.repeat(30) + 'needle' + 'b'.repeat(10);
    const result = getContextSnippet(text, 'needle', 5, 5);
    expect(result.startsWith('…')).toBe(true);
    expect(result).toContain('needle');
  });

  test('adds a trailing ellipsis when the match is far from the end', () => {
    const text = 'needle' + 'a'.repeat(100);
    const result = getContextSnippet(text, 'needle', 5, 5);
    expect(result.endsWith('…')).toBe(true);
  });

  test('omits ellipses when the whole string fits in the window', () => {
    const text = 'short needle text';
    const result = getContextSnippet(text, 'needle', 15, 80);
    expect(result).toBe(text);
  });
});

describe('highlightMatch', () => {
  const render = (text: string, query: string) =>
    renderToStaticMarkup(<>{highlightMatch(text, query)}</>);

  test('returns the plain text unchanged when query is empty', () => {
    expect(highlightMatch('plain text', '')).toBe('plain text');
  });

  test('wraps a single match in <mark>', () => {
    expect(render('hello world', 'world')).toBe(
      'hello <mark class="rounded-sm bg-indigo-400/30 text-indigo-200">world</mark>',
    );
  });

  test('wraps every case-insensitive occurrence', () => {
    const html = render('foo FOO Foo', 'foo');
    expect(html.match(/<mark/g)).toHaveLength(3);
  });

  test('handles the Turkish İ case-folding edge case without corrupting output', () => {
    // 'İ'.toLowerCase() expands to 2 code units ('i' + combining dot above),
    // so a query starting right after it ('stanbul') must still align.
    const html = render('İstanbul city', 'stanbul');
    expect(html).toBe(
      'İ<mark class="rounded-sm bg-indigo-400/30 text-indigo-200">stanbul</mark> city',
    );
  });
});
