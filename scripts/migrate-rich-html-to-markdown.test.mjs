import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { markdownToPlainText } from '../src/lib/markdown/text-projection.ts';

// Fully replaces the real PrismaClient for this test file only, so the
// "which DATABASE_URL does runMigration actually connect with" regression
// test below can never open a real database connection, mocked or not -
// note.findMany() always resolves to an empty array.
const { mockPrismaClientCtor, capturedConfigs } = vi.hoisted(() => {
  const capturedConfigs = [];
  const mockPrismaClientCtor = vi.fn().mockImplementation((config) => {
    capturedConfigs.push(config);
    return {
      note: { findMany: vi.fn().mockResolvedValue([]) },
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };
  });
  return { mockPrismaClientCtor, capturedConfigs };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: mockPrismaClientCtor,
}));

const {
  htmlToMarkdown,
  markdownToPlainTextForMigration,
  migrateRichNotes,
  runMigration,
} = await import('./migrate-rich-html-to-markdown.mjs');

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

  it('continues an ordered list from its start attribute', () => {
    // Found spot-checking a real migrated note: <ol start="2"> (continuing a
    // numbered list across an interposed <ul>) was silently renumbered from
    // 1 - the URLs/text survived, but the displayed numbering no longer
    // matched the author's original list.
    const html = '<ol start="2"><li>two</li><li>three</li></ol>';
    expect(htmlToMarkdown(html)).toBe('2. two\n3. three');
  });

  it('applies start on a nested ordered list too', () => {
    const html = '<ul><li>Item one<ol start="5"><li>five</li><li>six</li></ol></li></ul>';
    expect(htmlToMarkdown(html)).toBe('- Item one\n  5. five\n  6. six');
  });

  it('converts a code block', () => {
    expect(htmlToMarkdown('<pre><code>const x = 1;</code></pre>')).toBe('```\nconst x = 1;\n```');
  });

  it('keeps multi-paragraph blockquote paragraphs separated', () => {
    const html = '<blockquote><p>First paragraph.</p><p>Second paragraph.</p></blockquote>';
    expect(htmlToMarkdown(html)).toBe('> First paragraph.\n>\n> Second paragraph.');
  });

  it('keeps nested list items structured under their parent item', () => {
    const html = '<ul><li>Item one<ul><li>Nested item</li></ul></li></ul>';
    expect(htmlToMarkdown(html)).toBe('- Item one\n  - Nested item');
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

describe('migrateRichNotes skip reasons', () => {
  it('counts a genuinely empty note under skippedEmpty, not skippedAlreadyMarkdown', async () => {
    const update = vi.fn();
    const emptyNote = { id: 'note-0', content: '   ', mode: 'RICH' };
    const fakePrisma = {
      note: {
        findMany: vi.fn().mockResolvedValue([emptyNote]),
        update,
      },
    };

    const result = await migrateRichNotes(fakePrisma, { write: true });

    expect(update).not.toHaveBeenCalled();
    expect(result).toEqual({
      converted: 0,
      skippedEmpty: 1,
      skippedAlreadyMarkdown: 0,
      failed: 0,
      total: 1,
    });
  });
});

describe('migrateRichNotes empty-HTML handling', () => {
  it('converts a note whose HTML has no visible text (e.g. <p></p>) instead of marking it failed', async () => {
    // Found running a real dry-run against Docker data: an editor can leave
    // an empty-paragraph placeholder behind after the user clears all text.
    // note.content.trim() is non-empty (it's literally "<p></p>"), so the
    // naive check would wrongly treat the correct empty conversion result
    // as a failure and refuse to write it.
    const update = vi.fn();
    const emptyParagraphNote = { id: 'note-4', content: '<p></p><p></p>', mode: 'RICH' };
    const fakePrisma = {
      note: {
        findMany: vi.fn().mockResolvedValue([emptyParagraphNote]),
        update,
      },
    };

    const result = await migrateRichNotes(fakePrisma, { write: true });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'note-4' },
      data: { content: '', textContent: '' },
    });
    expect(result).toEqual({
      converted: 1,
      skippedEmpty: 0,
      skippedAlreadyMarkdown: 0,
      failed: 0,
      total: 1,
    });
  });
});

describe('migrateRichNotes idempotency (Fix 1)', () => {
  it('skips a note whose content is already Markdown instead of blanking it out', async () => {
    // A fully fake, self-contained prisma stand-in - no PrismaClient involved at
    // all here, real or mocked, so this can never reach any database file.
    const update = vi.fn();
    const alreadyMigratedNote = {
      id: 'note-1',
      content: '## Shopping List\n\n- Milk',
      mode: 'RICH',
    };
    const fakePrisma = {
      note: {
        findMany: vi.fn().mockResolvedValue([alreadyMigratedNote]),
        update,
      },
    };

    const result = await migrateRichNotes(fakePrisma, { write: true });

    expect(update).not.toHaveBeenCalled();
    expect(result).toEqual({
      converted: 0,
      skippedEmpty: 0,
      skippedAlreadyMarkdown: 1,
      failed: 0,
      total: 1,
    });
  });

  it('skips already-migrated Markdown containing an inline <u> tag, not just plain Markdown', async () => {
    // Codex review finding: htmlToMarkdown's own output can contain inline
    // HTML remnants (the <u> underline convention, autolinks) that a naive
    // "contains any <tag>" sniff would misclassify as un-migrated source
    // HTML - re-converting it silently drops everything outside the <u>
    // span. This is the exact repro Codex named: "# Title\n\n<u>x</u> tail"
    // would collapse to "x".
    const update = vi.fn();
    const alreadyMigratedNote = {
      id: 'note-2',
      content: '# Title\n\n<u>x</u> tail',
      mode: 'RICH',
    };
    const fakePrisma = {
      note: {
        findMany: vi.fn().mockResolvedValue([alreadyMigratedNote]),
        update,
      },
    };

    const result = await migrateRichNotes(fakePrisma, { write: true });

    expect(update).not.toHaveBeenCalled();
    expect(result).toEqual({
      converted: 0,
      skippedEmpty: 0,
      skippedAlreadyMarkdown: 1,
      failed: 0,
      total: 1,
    });
  });

  it('still converts real first-run HTML that happens to contain a <u> tag', async () => {
    // The narrowed detection must not become so narrow it stops detecting
    // genuine source HTML - real Tiptap HTML always has a block-level
    // wrapper (ProseMirror requires block+ at the document root), so this
    // must still be recognized and converted on a real first run.
    const update = vi.fn();
    const richNote = {
      id: 'note-3',
      content: '<p><u>underlined</u> and more text</p>',
      mode: 'RICH',
    };
    const fakePrisma = {
      note: {
        findMany: vi.fn().mockResolvedValue([richNote]),
        update,
      },
    };

    const result = await migrateRichNotes(fakePrisma, { write: true });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'note-3' },
      data: {
        content: '<u>underlined</u> and more text',
        // markdownToPlainTextForMigration strips Markdown syntax (headings,
        // lists, **/_/~~, links) but not literal HTML tags like <u> - the
        // <u> convention is intentionally not unwrapped by this projection.
        textContent: '<u>underlined</u> and more text',
      },
    });
    expect(result).toEqual({
      converted: 1,
      skippedEmpty: 0,
      skippedAlreadyMarkdown: 0,
      failed: 0,
      total: 1,
    });
  });
});

describe('runMigration guard rails', () => {
  it('throws when DATABASE_URL is missing', async () => {
    await expect(runMigration({ argv: [], env: {} })).rejects.toThrow('DATABASE_URL is required');
  });

  it('refuses --write against Turso without --turso-backup-confirmed', async () => {
    await expect(
      runMigration({ argv: ['--write'], env: { DATABASE_URL: 'libsql://example.turso.io' } }),
    ).rejects.toThrow('--turso-backup-confirmed');
  });

  it('rejects an unrecognized DATABASE_URL format', async () => {
    await expect(
      runMigration({ argv: ['--write'], env: { DATABASE_URL: 'not-a-real-url' } }),
    ).rejects.toThrow('Unrecognized DATABASE_URL format');
  });

  it('connects PrismaClient to the validated DATABASE_URL, not ambient env', async () => {
    // PrismaClient is fully mocked above (module-wide for this file) - this
    // never opens any real database, real or fake-path. Dry run (no --write)
    // so the backup branch (real fs.access) isn't touched either.
    capturedConfigs.length = 0;
    const fakeUrl = 'file:./this-file-does-not-exist-anywhere.db';
    await runMigration({ argv: [], env: { DATABASE_URL: fakeUrl } });
    expect(capturedConfigs).toHaveLength(1);
    // The connection URL is resolved to an absolute path (same resolution
    // the backup check uses) rather than passed through verbatim - a bare
    // relative `file:` URL handed straight to PrismaClient would otherwise
    // be resolved by Prisma relative to schema.prisma's directory, which
    // can silently disagree with where this script's own backup check looks.
    const expectedPath = path.resolve('./this-file-does-not-exist-anywhere.db');
    expect(capturedConfigs[0]).toEqual({ datasources: { db: { url: `file:${expectedPath}` } } });
  });

  it('hard-stops --write against a file DATABASE_URL with nothing to back up (Fix 6b)', async () => {
    // createBackupIfExists does a real (but harmless, read-only) fs.access
    // against this path - it's guaranteed not to exist, so nothing is ever
    // read or copied, and PrismaClient (mocked module-wide above) is never
    // even constructed because the throw happens before that line.
    capturedConfigs.length = 0;
    const fakeUrl = 'file:./this-file-does-not-exist-anywhere-12345.db';
    await expect(
      runMigration({ argv: ['--write'], env: { DATABASE_URL: fakeUrl } }),
    ).rejects.toThrow('Verify DATABASE_URL');
    // Proves migrateRichNotes was never reached: PrismaClient is constructed
    // immediately before migrateRichNotes is called, so zero constructions
    // means the note loop never ran.
    expect(capturedConfigs).toHaveLength(0);
  });
});
