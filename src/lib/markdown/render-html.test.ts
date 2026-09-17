import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  escapeAttribute,
  isSafeLinkHref,
  isSafeImageSrc,
  _assignHeadingId,
  renderMarkdown,
} from './render-html';

describe('renderMarkdown: paragraphs and plain text', () => {
  it('renders a single paragraph', () => {
    const { html, headings } = renderMarkdown('Hello world');
    expect(html).toBe('<p>Hello world</p>');
    expect(headings).toEqual([]);
  });

  it('renders two paragraphs as separate <p> tags, preserving the blank-line gap between them', () => {
    const { html } = renderMarkdown('Hello\n\nWorld');
    expect(html).toBe('<p>Hello</p>\n\n<p>World</p>');
  });

  it('escapes a bare < in plain text so it cannot be read as a tag', () => {
    const { html } = renderMarkdown('a < b');
    expect(html).toBe('<p>a &lt; b</p>');
  });
});

describe('escapeHtml', () => {
  it('escapes &, <, >', () => {
    expect(escapeHtml('<script>a & b</script>')).toBe('&lt;script&gt;a &amp; b&lt;/script&gt;');
  });
});

describe('escapeAttribute', () => {
  it('escapes quotes in addition to &, <, >', () => {
    expect(escapeAttribute(`"quoted" & 'single'`)).toBe(
      '&quot;quoted&quot; &amp; &#39;single&#39;',
    );
  });
});

describe('isSafeLinkHref', () => {
  it('allows http, https, mailto, and relative/fragment URLs', () => {
    expect(isSafeLinkHref('http://example.com')).toBe(true);
    expect(isSafeLinkHref('https://example.com')).toBe(true);
    expect(isSafeLinkHref('mailto:a@b.com')).toBe(true);
    expect(isSafeLinkHref('/notes/123')).toBe(true);
    expect(isSafeLinkHref('#section')).toBe(true);
  });

  it('rejects javascript: and vbscript: and data: schemes', () => {
    expect(isSafeLinkHref('javascript:alert(1)')).toBe(false);
    expect(isSafeLinkHref('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeLinkHref('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects a URL containing a control character, even if the scheme regex would otherwise miss it', () => {
    expect(isSafeLinkHref('java\tscript:alert(1)')).toBe(false);
    expect(isSafeLinkHref('java\nscript:alert(1)')).toBe(false);
  });
});

describe('isSafeImageSrc', () => {
  it('allows http, https, and data:image/{png,jpeg,webp,gif}', () => {
    expect(isSafeImageSrc('https://example.com/x.png')).toBe(true);
    expect(isSafeImageSrc('data:image/webp;base64,AAAA')).toBe(true);
    expect(isSafeImageSrc('data:image/png;base64,AAAA')).toBe(true);
    expect(isSafeImageSrc('data:image/png,AAAA')).toBe(true);
  });

  it('rejects javascript: and non-image data: URIs', () => {
    expect(isSafeImageSrc('javascript:alert(1)')).toBe(false);
    expect(isSafeImageSrc('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects a MIME type that merely starts with an allowed one (boundary check, not prefix check)', () => {
    expect(isSafeImageSrc('data:image/pngevil,AAAA')).toBe(false);
  });
});

describe('_assignHeadingId', () => {
  it('slugifies ASCII text', () => {
    const seen = new Map<string, number>();
    expect(_assignHeadingId('Hello World', seen)).toBe('hello-world');
  });

  it('preserves non-Latin letters instead of stripping them', () => {
    const seen = new Map<string, number>();
    expect(_assignHeadingId('架构设计', seen)).toBe('架构设计');
    expect(_assignHeadingId('Hello 世界', seen)).toBe('hello-世界');
  });

  it('dedupes repeated slugs with -2, -3 suffixes', () => {
    const seen = new Map<string, number>();
    expect(_assignHeadingId('Test', seen)).toBe('test');
    expect(_assignHeadingId('Test', seen)).toBe('test-2');
    expect(_assignHeadingId('Test', seen)).toBe('test-3');
  });

  it('also reserves generated IDs against naturally suffixed headings', () => {
    const seen = new Map<string, number>();
    expect(_assignHeadingId('Test', seen)).toBe('test');
    expect(_assignHeadingId('Test', seen)).toBe('test-2');
    expect(_assignHeadingId('Test-2', seen)).toBe('test-2-2');
    const reversed = new Map<string, number>();
    expect(_assignHeadingId('Test-2', reversed)).toBe('test-2');
    expect(_assignHeadingId('Test', reversed)).toBe('test');
    expect(_assignHeadingId('Test', reversed)).toBe('test-3');
  });

  it('falls back to "section" when the heading has no letters or numbers', () => {
    const seen = new Map<string, number>();
    expect(_assignHeadingId('!!!', seen)).toBe('section');
    expect(_assignHeadingId('!!!', seen)).toBe('section-2');
  });
});

describe('renderMarkdown: inline formatting and code', () => {
  it('renders emphasis, strong, and strikethrough', () => {
    expect(renderMarkdown('Hello **world**').html).toBe('<p>Hello <strong>world</strong></p>');
    expect(renderMarkdown('*em*').html).toBe('<p><em>em</em></p>');
    expect(renderMarkdown('~~strike~~').html).toBe('<p><del>strike</del></p>');
  });

  it('renders inline code without interpreting its contents as markdown', () => {
    expect(renderMarkdown('`inline code`').html).toBe('<p><code>inline code</code></p>');
  });

  it('renders a fenced code block, escaped, with no syntax highlighting', () => {
    const { html } = renderMarkdown('```js\nconst x = 1;\nconst y = 2;\n```');
    expect(html).toBe('<pre><code>\nconst x = 1;\nconst y = 2;\n</code></pre>');
  });

  it('decodes a backslash-escaped character to its literal form', () => {
    expect(renderMarkdown('\\* not emphasis').html).toBe('<p>* not emphasis</p>');
  });

  it('decodes a named HTML entity and re-escapes it for safe output', () => {
    expect(renderMarkdown('&amp; entity').html).toBe('<p>&amp; entity</p>');
  });

  it('replaces invalid Unicode scalar values without crashing Preview', () => {
    for (const entity of ['&#9999999;', '&#x110000;', '&#0;', '&#xD800;']) {
      expect(renderMarkdown(entity).html).toBe('<p>\uFFFD</p>');
    }
    expect(renderMarkdown('&#x1F600; &#65;').html).toBe('<p>😀 A</p>');
  });

  it('renders a hard line break', () => {
    // HardBreak's source range includes the newline; render it exactly once as <br />.
    expect(renderMarkdown('line one  \nline two').html).toBe('<p>line one<br />line two</p>');
  });
});

describe('renderMarkdown: links and images', () => {
  it('renders a safe link with target=_blank and rel=noopener', () => {
    const { html } = renderMarkdown('[click](https://example.com)');
    expect(html).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">click</a></p>',
    );
  });

  it('degrades a javascript: link to plain text — no <a> tag, no href leaks', () => {
    const { html } = renderMarkdown('[click](javascript:alert(1))');
    expect(html).toBe('<p>click</p>');
    expect(html).not.toMatch(/href\s*=\s*["']javascript:/i);
  });

  it('strips angle brackets from a bracketed destination before using it as the href', () => {
    const { html } = renderMarkdown('[x](<https://example.com/a b>)');
    expect(html).toBe(
      '<p><a href="https://example.com/a b" target="_blank" rel="noopener noreferrer">x</a></p>',
    );
  });

  it('rejects a bracketed destination smuggling a control character past the scheme regex', () => {
    const { html } = renderMarkdown('[x](<java\tscript:alert(1)>)');
    expect(html).toBe('<p>x</p>');
    expect(html).not.toMatch(/href\s*=\s*["']java/i);
  });

  it('renders a pasted data:image/webp image (the paste-image contract)', () => {
    const { html } = renderMarkdown('![paste](data:image/webp;base64,AAAA)');
    expect(html).toBe('<p><img src="data:image/webp;base64,AAAA" alt="paste" /></p>');
  });

  it('degrades a non-allowlisted image src to its alt text, no <img> tag', () => {
    const { html } = renderMarkdown('![bad](javascript:alert(1))');
    expect(html).toBe('<p>bad</p>');
    expect(html).not.toContain('<img');
  });

  it('renders a <url> autolink', () => {
    const { html } = renderMarkdown('auto <https://example.com> link');
    expect(html).toBe(
      '<p>auto <a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a> link</p>',
    );
  });

  it('renders a <email> autolink with an implicit mailto: scheme', () => {
    const { html } = renderMarkdown('<hello@example.com>');
    expect(html).toBe(
      '<p><a href="mailto:hello@example.com" target="_blank" rel="noopener noreferrer">hello@example.com</a></p>',
    );
  });

  it('renders a reference-style link definition as nothing, and an unresolved usage as plain text', () => {
    const { html } = renderMarkdown('[ref link][label]\n\n[label]: https://example.com "title"');
    expect(html).toBe('<p>ref link</p>\n\n');
    expect(html).not.toContain('<a');
  });

  it('does not silently drop a bare, unbracketed GFM autolink', () => {
    const { html } = renderMarkdown('visit www.example.com today');
    expect(html).toBe('<p>visit www.example.com today</p>');
  });
});
