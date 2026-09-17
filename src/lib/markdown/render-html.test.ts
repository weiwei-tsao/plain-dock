import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  escapeAttribute,
  isSafeLinkHref,
  isSafeImageSrc,
  _assignHeadingId,
} from './render-html';

describe('escapeHtml', () => {
  it('escapes &, <, >', () => {
    expect(escapeHtml('<script>a & b</script>')).toBe('&lt;script&gt;a &amp; b&lt;/script&gt;');
  });
});

describe('escapeAttribute', () => {
  it('escapes quotes in addition to &, <, >', () => {
    expect(escapeAttribute(`"quoted" & 'single'`)).toBe('&quot;quoted&quot; &amp; &#39;single&#39;');
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
