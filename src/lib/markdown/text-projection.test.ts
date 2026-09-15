import { describe, it, expect } from 'vitest';
import { markdownToPlainText } from './text-projection';

describe('markdownToPlainText', () => {
  it('strips heading markers', () => {
    expect(markdownToPlainText('## Shopping List')).toBe('Shopping List');
  });

  it('strips bullet and ordered list markers', () => {
    expect(markdownToPlainText('- Milk\n1. Eggs')).toBe('Milk\nEggs');
  });

  it('strips bold, italic, and strikethrough delimiters', () => {
    expect(markdownToPlainText('**bold** _italic_ ~~gone~~')).toBe('bold italic gone');
  });

  it('strips inline code backticks but keeps the content', () => {
    expect(markdownToPlainText('run `npm test` now')).toBe('run npm test now');
  });

  it('strips blockquote prefixes', () => {
    expect(markdownToPlainText('> quoted line')).toBe('quoted line');
  });

  it('reduces a link to its label', () => {
    expect(markdownToPlainText('[PlainDock](https://example.com)')).toBe('PlainDock');
  });

  it('reduces an image to an [image: alt] placeholder', () => {
    expect(markdownToPlainText('![screenshot](data:image/webp;base64,AAA)')).toBe(
      '[image: screenshot]',
    );
  });

  it('leaves plain text with no markdown syntax unchanged', () => {
    expect(markdownToPlainText('just plain text')).toBe('just plain text');
  });

  it('returns an empty string for empty input', () => {
    expect(markdownToPlainText('')).toBe('');
  });
});
