import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  escapeAttribute,
  isSafeLinkHref,
  isSafeImageSrc,
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

describe('renderMarkdown: headings and outline', () => {
  it('renders an ATX heading with a slug id and collects it into headings', () => {
    const { html, headings } = renderMarkdown('# Hello');
    expect(html).toContain('<h1 id="hello">');
    expect(headings).toEqual([{ level: 1, text: 'Hello', id: 'hello' }]);
  });

  it('extracts semantic (formatting-stripped) text for the outline, not raw source', () => {
    const { headings } = renderMarkdown(
      '## Using **CodeMirror** with [Markdown](https://example.com)',
    );
    expect(headings).toEqual([
      { level: 2, text: 'Using CodeMirror with Markdown', id: 'using-codemirror-with-markdown' },
    ]);
  });

  it('dedupes identical headings with -2/-3 suffixes, across formatting differences', () => {
    const { headings } = renderMarkdown('# Hello **world**\n\n# Hello world');
    expect(headings).toEqual([
      { level: 1, text: 'Hello world', id: 'hello-world' },
      { level: 1, text: 'Hello world', id: 'hello-world-2' },
    ]);
  });

  it('preserves non-Latin heading text and slugs end to end', () => {
    const { headings } = renderMarkdown('# 架构设计\n\n# 架构设计');
    expect(headings).toEqual([
      { level: 1, text: '架构设计', id: '架构设计' },
      { level: 1, text: '架构设计', id: '架构设计-2' },
    ]);
  });

  it('renders a setext (underline-style) heading', () => {
    const { headings } = renderMarkdown('Setext Heading\n===');
    expect(headings).toEqual([{ level: 1, text: 'Setext Heading', id: 'setext-heading' }]);
  });

  it('keeps natural suffixes and generated IDs globally unique', () => {
    const result = renderMarkdown('# Test\n\n# Test\n\n# Test-2');
    expect(result.headings.map((heading) => heading.id)).toEqual(['test', 'test-2', 'test-2-2']);
    expect(result.html).toContain('id="test-2-2"');
    expect(renderMarkdown('# Test-2\n\n# Test\n\n# Test').headings.map((h) => h.id)).toEqual([
      'test-2',
      'test',
      'test-3',
    ]);
  });

  it('retains visible autolink text in outline labels', () => {
    expect(renderMarkdown('# <https://example.com>').headings).toEqual([
      { level: 1, text: 'https://example.com', id: 'https-example-com' },
    ]);
    expect(renderMarkdown('# <hello@example.com>').headings[0].text).toBe('hello@example.com');
  });

  it('preserves all heading levels and punctuation fallback after helper tests are removed', () => {
    expect(renderMarkdown('# !!!\n\n# !!!').headings.map((h) => h.id)).toEqual([
      'section',
      'section-2',
    ]);
    expect(
      renderMarkdown('# A\n## B\n### C\n#### D\n##### E\n###### F').headings.map((h) => h.level),
    ).toEqual([1, 2, 3, 4, 5, 6]);
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
    expect(html).toBe('<pre><code>const x = 1;\nconst y = 2;</code></pre>');
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

  it('rejects scheme-less and protocol-relative image sources', () => {
    expect(isSafeImageSrc('/api/notes')).toBe(false);
    expect(isSafeImageSrc('//evil.com/a.png')).toBe(false);
    expect(renderMarkdown('![y](//evil.com/a.png)').html).toBe('<p>y</p>');
  });

  it('decodes entities in destinations before the scheme check', () => {
    expect(renderMarkdown('[a](http://x?a=1&amp;b=2)').html).toContain(
      'href="http://x?a=1&amp;b=2"',
    );
    expect(renderMarkdown('[a](&#106;avascript:alert(1))').html).toBe('<p>a</p>');
  });

  it('does not leave a trailing space inside a titled link', () => {
    expect(renderMarkdown('[a](http://x "t")').html).toContain('>a</a>');
  });

  it('keeps fence, list indent and quote residue out of code blocks', () => {
    expect(renderMarkdown('- item\n\n  ```\n  a\n\n  b\n  ```').html).toContain(
      '<pre><code>a\n\nb</code></pre>',
    );
    expect(renderMarkdown('> ```\n> a\n> b\n> ```').html).toContain('<pre><code>a\nb</code></pre>');
    expect(renderMarkdown('    a\n    b').html).toBe('<pre><code>a\nb</code></pre>');
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

describe('renderMarkdown: blockquotes, lists, task lists, hr', () => {
  it('renders a blockquote', () => {
    const { html } = renderMarkdown('> quote');
    expect(html).toBe('<blockquote> <p>quote</p></blockquote>');
  });

  it('renders a bullet list', () => {
    const { html } = renderMarkdown('- a\n- b');
    expect(html).toBe('<ul><li> <p>a</p></li>\n<li> <p>b</p></li></ul>');
  });

  it('renders an ordered list', () => {
    const { html } = renderMarkdown('1. a\n2. b');
    expect(html).toBe('<ol><li> <p>a</p></li>\n<li> <p>b</p></li></ol>');
  });

  it('preserves non-default ordered-list start numbers, including zero', () => {
    expect(renderMarkdown('3. third\n4. fourth').html).toBe(
      '<ol start="3"><li> <p>third</p></li>\n<li> <p>fourth</p></li></ol>',
    );
    expect(renderMarkdown('0. zero').html).toBe('<ol start="0"><li> <p>zero</p></li></ol>');
  });

  it('renders a GFM task list with checked state', () => {
    const { html } = renderMarkdown('- [ ] todo\n- [x] done');
    expect(html).toBe(
      '<ul><li> <input type="checkbox" disabled /> todo</li>\n' +
        '<li> <input type="checkbox" disabled checked /> done</li></ul>',
    );
  });

  it('renders a horizontal rule', () => {
    expect(renderMarkdown('---').html).toBe('<hr />');
  });
});

describe('renderMarkdown: GFM tables (terminal-table.ts paste contract)', () => {
  it('renders the exact table shape terminal-table.ts produces', () => {
    const { html } = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toBe(
      '<table><tr> <th>a</th>  <th>b</th> </tr>\n\n<tr> <td>1</td>  <td>2</td> </tr></table>',
    );
  });

  it('preserves escaped pipes and escapes cell HTML', () => {
    const { html } = renderMarkdown('| a | b |\n| --- | --- |\n| x \\| y | <z> |');
    expect(html).toBe(
      '<table><tr> <th>a</th>  <th>b</th> </tr>\n\n<tr> <td>x | y</td>  <td>&lt;z&gt;</td> </tr></table>',
    );
  });
});

describe('renderMarkdown: security boundary', () => {
  it('renders a <script> block as escaped text, never as markup', () => {
    const { html } = renderMarkdown('<script>alert(1)</script>');
    expect(html).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('renders inline raw HTML tags as escaped text', () => {
    const { html } = renderMarkdown('<b>bold html</b>');
    expect(html).toBe('<p>&lt;b&gt;bold html&lt;/b&gt;</p>');
    expect(html).not.toContain('<b>');
  });

  it('escapes HTML-significant characters inside inline and fenced code', () => {
    expect(renderMarkdown('`<tag> & value`').html).toBe(
      '<p><code>&lt;tag&gt; &amp; value</code></p>',
    );
    expect(renderMarkdown('```html\n<script>&alert</script>\n```').html).toBe(
      '<pre><code>&lt;script&gt;&amp;alert&lt;/script&gt;</code></pre>',
    );
  });

  it('keeps an unknown named entity as escaped literal source', () => {
    expect(renderMarkdown('&unknown;').html).toBe('<p>&amp;unknown;</p>');
  });

  it('rejects javascript: URLs with visible fallback text in any position', () => {
    const cases = [
      { md: '[click](javascript:alert(1))', expected: '<p>click</p>' },
      { md: '![img](javascript:alert(1))', expected: '<p>img</p>' },
      {
        md: 'auto <javascript:alert(1)> link',
        expected: '<p>auto javascript:alert(1) link</p>',
      },
    ];
    for (const { md, expected } of cases) {
      const { html } = renderMarkdown(md);
      expect(html).not.toMatch(/(?:href|src)\s*=/i);
      expect(html).toBe(expected);
    }
  });

  it('rejects the bracketed-destination + control-character composite bypass', () => {
    // "<java\tscript:alert(1)>" is a syntactically valid CommonMark
    // bracketed link destination (Task 5's angle-bracket form allows
    // embedded whitespace) whose scheme our regex only fails to recognize
    // because of the embedded tab. This is the concrete case Task 1's
    // control-character rejection and Task 5's bracket-stripping have to
    // compose correctly to close — see both tasks' comments.
    const { html } = renderMarkdown('[x](<java\tscript:alert(1)>)');
    expect(html).not.toMatch(/(?:href|src)\s*=/i);
    expect(html).toBe('<p>x</p>');
  });
});
