// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';

import { collapseEmptyParagraphs, getNoteTextContent, sanitizeHTML, wrapPlainText } from './index';

describe('sanitizeHTML — Layer 1: security defense', () => {
  test('strips <script> tags and their content entirely', () => {
    const result = sanitizeHTML('<p>hello</p><script>alert(1)</script>');
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert');
    expect(result).toContain('hello');
  });

  test('strips <style> tags and their content entirely', () => {
    const result = sanitizeHTML('<p>hi</p><style>body{color:red}</style>');
    expect(result).not.toContain('style');
    expect(result).not.toContain('color:red');
  });

  test('strips <iframe> tags', () => {
    const result = sanitizeHTML('<iframe src="https://evil.example"></iframe><p>safe</p>');
    expect(result).not.toContain('iframe');
    expect(result).toContain('safe');
  });

  test('strips <object> tags', () => {
    const result = sanitizeHTML('<object data="evil.swf"></object><p>safe</p>');
    expect(result).not.toContain('object');
    expect(result).toContain('safe');
  });

  test('strips <meta> tags', () => {
    const result = sanitizeHTML('<meta charset="utf-8"><p>safe</p>');
    expect(result).not.toContain('meta');
    expect(result).toContain('safe');
  });

  test('strips a dangerous tag nested inside otherwise-safe markup', () => {
    const result = sanitizeHTML('<p>before<script>alert(1)</script>after</p>');
    expect(result).not.toContain('script');
    expect(result).toContain('before');
    expect(result).toContain('after');
  });
});

describe('sanitizeHTML — Layer 2: tag normalization', () => {
  test('normalizes div to p', () => {
    const result = sanitizeHTML('<div>hello</div>');
    expect(result).toBe('<p>hello</p>');
  });

  test('normalizes b to strong', () => {
    const result = sanitizeHTML('<b>bold</b>');
    expect(result).toBe('<strong>bold</strong>');
  });

  test('normalizes i to em', () => {
    const result = sanitizeHTML('<i>italic</i>');
    expect(result).toBe('<em>italic</em>');
  });

  test('normalizes nested mixed tags together', () => {
    const result = sanitizeHTML('<div><b>bold</b> and <i>italic</i></div>');
    expect(result).toBe('<p><strong>bold</strong> and <em>italic</em></p>');
  });
});

describe('sanitizeHTML — Layer 3: structure downgrade', () => {
  test('replaces <img> with a text placeholder', () => {
    const result = sanitizeHTML('<img src="https://example.com/pic.png">');
    expect(result).toContain('[IMG: https://example.com/pic.png]');
    expect(result).not.toContain('<img');
  });

  test('replaces <video> with a text placeholder', () => {
    const result = sanitizeHTML('<video src="https://example.com/clip.mp4"></video>');
    expect(result).toContain('[VIDEO: https://example.com/clip.mp4]');
    expect(result).not.toContain('<video');
  });

  test('keeps tables as an allowed structure (not downgraded to text)', () => {
    const result = sanitizeHTML('<table><tbody><tr><td>cell</td></tr></tbody></table>');
    expect(result).toContain('<table>');
    expect(result).toContain('<td>cell</td>');
  });
});

describe('sanitizeHTML — final cleanup', () => {
  test('flattens disallowed tags but keeps their children', () => {
    const result = sanitizeHTML('<section>kept text</section>');
    expect(result).not.toContain('<section');
    expect(result).toContain('kept text');
  });

  test('keeps only allowlisted inline styles', () => {
    const result = sanitizeHTML(
      '<p style="color: red; position: absolute; background-color: blue;">x</p>',
    );
    expect(result).toContain('color: red');
    expect(result).toContain('background-color: blue');
    expect(result).not.toContain('position');
  });

  test('drops the style attribute entirely when no allowed properties remain', () => {
    const result = sanitizeHTML('<p style="position: absolute;">x</p>');
    expect(result).not.toContain('style=');
  });

  test('allows http/mailto links and enforces target+rel', () => {
    const result = sanitizeHTML('<a href="https://example.com">link</a>');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  test('strips href on non-http/mailto protocols', () => {
    const result = sanitizeHTML('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('href=');
  });

  test('preserves an existing rel token alongside the enforced ones', () => {
    const result = sanitizeHTML('<a href="https://example.com" rel="nofollow">link</a>');
    expect(result).toContain('nofollow');
    expect(result).toContain('noopener');
    expect(result).toContain('noreferrer');
  });

  test('handles mixed safe and unsafe markup in a single document', () => {
    const result = sanitizeHTML(
      '<h2>Hello</h2><script>alert(1)</script><b>World</b><img src="https://example.com/x.png">',
    );
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<h2>Hello</h2>');
    expect(result).toContain('<strong>World</strong>');
    expect(result).toContain('[IMG: https://example.com/x.png]');
  });

  test('trims a single leading/trailing newline injected around code block content', () => {
    const result = sanitizeHTML('<pre><code>\nconst x = 1;\n</code></pre>');
    expect(result).toBe('<pre><code>const x = 1;</code></pre>');
  });

  test('returns an empty string for empty or whitespace-only input', () => {
    expect(sanitizeHTML('')).toBe('');
    expect(sanitizeHTML('   \n  ')).toBe('');
  });
});

describe('collapseEmptyParagraphs', () => {
  test('collapses consecutive empty paragraphs to one', () => {
    const result = collapseEmptyParagraphs('<p>a</p><p></p><p></p><p>b</p>');
    expect(result).toBe('<p>a</p><p></p><p>b</p>');
  });

  test('drops a lone leading empty paragraph', () => {
    const result = collapseEmptyParagraphs('<p></p><p>content</p>');
    expect(result).toBe('<p>content</p>');
  });

  test('drops a lone trailing empty paragraph', () => {
    const result = collapseEmptyParagraphs('<p>content</p><p></p>');
    expect(result).toBe('<p>content</p>');
  });

  test('leaves a single empty paragraph between content alone', () => {
    const result = collapseEmptyParagraphs('<p>a</p><p></p><p>b</p>');
    expect(result).toBe('<p>a</p><p></p><p>b</p>');
  });

  test('treats a <br>-only paragraph as empty', () => {
    const result = collapseEmptyParagraphs('<p>a</p><p><br></p><p><br></p><p>b</p>');
    expect(result).toBe('<p>a</p><p><br></p><p>b</p>');
  });

  test('returns input unchanged for empty or whitespace-only input', () => {
    expect(collapseEmptyParagraphs('')).toBe('');
    expect(collapseEmptyParagraphs('   ')).toBe('   ');
  });
});

describe('wrapPlainText', () => {
  test('wraps a single line in a paragraph', () => {
    expect(wrapPlainText('hello')).toBe('<p>hello</p>');
  });

  test('splits double newlines into separate paragraphs', () => {
    expect(wrapPlainText('first\n\nsecond')).toBe('<p>first</p><p>second</p>');
  });

  test('converts a single newline to <br>', () => {
    expect(wrapPlainText('line one\nline two')).toBe('<p>line one<br>line two</p>');
  });

  test('normalizes \\r\\n to \\n before wrapping', () => {
    expect(wrapPlainText('line one\r\nline two')).toBe('<p>line one<br>line two</p>');
  });

  test('escapes HTML special characters', () => {
    expect(wrapPlainText('<script>alert(1)</script> & "quotes" \'here\'')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot; &#39;here&#39;</p>',
    );
  });
});

describe('getNoteTextContent', () => {
  test('strips all HTML tags and returns the text content', () => {
    expect(getNoteTextContent('<p>hello <strong>world</strong></p>')).toBe('hello world');
  });

  test('returns an empty string for empty input', () => {
    expect(getNoteTextContent('')).toBe('');
  });

  test('does not execute script content, only reads it as text', () => {
    const result = getNoteTextContent(
      '<p>before</p><script>window.__x = true;</script><p>after</p>',
    );
    expect(result).toContain('before');
    expect(result).toContain('after');
  });
});
