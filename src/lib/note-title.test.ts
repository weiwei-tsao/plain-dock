import { describe, expect, test } from 'vitest';

import { deriveTitleFromText, DERIVED_TITLE_MAX_CHARS, markdownWithTitle } from './note-title';

describe('deriveTitleFromText', () => {
  test('returns empty string for empty text', () => {
    expect(deriveTitleFromText('')).toBe('');
  });

  test('collapses internal whitespace runs to a single space', () => {
    expect(deriveTitleFromText('hello   \n\n  world')).toBe('hello world');
  });

  test('trims leading and trailing whitespace', () => {
    expect(deriveTitleFromText('   padded text   ')).toBe('padded text');
  });

  test('does not truncate text at or under the max length', () => {
    const text = 'exactly twenty chars'.slice(0, DERIVED_TITLE_MAX_CHARS);
    expect(text).toHaveLength(DERIVED_TITLE_MAX_CHARS);
    expect(deriveTitleFromText(text)).toBe(text);
  });

  test('truncates text over the max length', () => {
    const text = 'a'.repeat(DERIVED_TITLE_MAX_CHARS + 5);
    const result = deriveTitleFromText(text);
    expect(result).toHaveLength(DERIVED_TITLE_MAX_CHARS);
    expect(result).toBe('a'.repeat(DERIVED_TITLE_MAX_CHARS));
  });

  test('does not split a surrogate-pair emoji at the truncation boundary', () => {
    // 19 'a's + one emoji (2 UTF-16 code units) straddles the 20-char cap
    const text = 'a'.repeat(DERIVED_TITLE_MAX_CHARS - 1) + '😀' + 'trailing text';
    const result = deriveTitleFromText(text);
    expect(result).toBe('a'.repeat(DERIVED_TITLE_MAX_CHARS - 1) + '😀');
    // Confirm no lone surrogate was produced
    expect(result).not.toMatch(/[\uD800-\uDFFF]/u);
  });
});

describe('markdownWithTitle', () => {
  test('prepends a typed title as an H1', () => {
    expect(markdownWithTitle('Plan', 'body text')).toBe('# Plan\n\nbody text');
  });

  test('leaves content alone when there is no title', () => {
    expect(markdownWithTitle('  ', 'body text')).toBe('body text');
  });

  test('skips a title that was derived from the body', () => {
    const content = 'hello world this is a test note';
    expect(markdownWithTitle(deriveTitleFromText(content), content)).toBe(content);
  });

  test('skips when the body already opens with the same heading', () => {
    expect(markdownWithTitle('Plan', '\n## Plan\n\nbody')).toBe('\n## Plan\n\nbody');
  });

  test('keeps the title when the opening heading differs', () => {
    expect(markdownWithTitle('Plan', '# Other\n\nbody')).toBe('# Plan\n\n# Other\n\nbody');
  });
});
