import { describe, it, expect } from 'vitest';
import {
  htmlToMarkdown,
  markdownToPlainTextForMigration,
} from './migrate-rich-html-to-markdown.mjs';
import { markdownToPlainText } from '../src/lib/markdown/text-projection.ts';

describe('htmlToMarkdown', () => {
  it('converts headings, bold, italic, and links', () => {
    const html =
      '<h2>Title</h2><p><strong>bold</strong> and <em>italic</em> and <a href="https://example.com">link</a></p>';
    expect(htmlToMarkdown(html)).toBe(
      '## Title\n\n**bold** and _italic_ and [link](https://example.com)',
    );
  });

  it('converts a table to pipe syntax', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
    expect(htmlToMarkdown(html)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it('converts an img tag, preserving a base64 data URI', () => {
    const html = '<img src="data:image/webp;base64,AAA" alt="screenshot">';
    expect(htmlToMarkdown(html)).toBe('![screenshot](data:image/webp;base64,AAA)');
  });

  it('converts underline to the HTML-in-Markdown <u> convention', () => {
    expect(htmlToMarkdown('<p><u>underlined</u></p>')).toBe('<u>underlined</u>');
  });

  it('converts bullet and ordered lists', () => {
    expect(htmlToMarkdown('<ul><li>one</li><li>two</li></ul>')).toBe('- one\n- two');
    expect(htmlToMarkdown('<ol><li>one</li><li>two</li></ol>')).toBe('1. one\n2. two');
  });

  it('converts a code block', () => {
    expect(htmlToMarkdown('<pre><code>const x = 1;</code></pre>')).toBe('```\nconst x = 1;\n```');
  });
});

describe('markdownToPlainTextForMigration', () => {
  it('stays in sync with the real markdownToPlainText implementation', () => {
    const samples = [
      '## Shopping List\n\n- **Milk**\n- Eggs',
      '> quoted\n\n[link](https://example.com)',
      '![alt](data:image/webp;base64,AAA)',
    ];
    for (const sample of samples) {
      expect(markdownToPlainTextForMigration(sample)).toBe(markdownToPlainText(sample));
    }
  });
});
