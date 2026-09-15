import path from 'node:path';
import { JSDOM } from 'jsdom';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createBackupIfExists } from './sync-turso-to-docker.mjs';

function inline(node) {
  if (node.nodeType === 3) return node.textContent ?? '';
  const el = node;
  const children = Array.from(el.childNodes).map(inline).join('');
  switch (el.tagName?.toLowerCase()) {
    case 'strong':
      return `**${children}**`;
    case 'em':
      return `_${children}_`;
    case 'u':
      return `<u>${children}</u>`;
    case 's':
      return `~~${children}~~`;
    case 'code':
      return `\`${children}\``;
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      return `[${children}](${href})`;
    }
    case 'img': {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      return `![${alt}](${src})`;
    }
    case 'br':
      return '\n';
    default:
      return children;
  }
}

function block(node) {
  const el = node;
  const tag = el.tagName?.toLowerCase();
  switch (tag) {
    case 'p':
      return inline(el) + '\n\n';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tag[1]);
      return `${'#'.repeat(level)} ${inline(el)}\n\n`;
    }
    case 'blockquote': {
      const inner = Array.from(el.childNodes)
        .map((child) => (child.nodeType === 1 ? block(child) : inline(child)))
        .join('');
      return (
        inner
          .trim()
          .split('\n')
          .map((line) => (line === '' ? '>' : `> ${line}`))
          .join('\n') + '\n\n'
      );
    }
    case 'ul':
    case 'ol': {
      const items = Array.from(el.children).map((li, i) => {
        const nested = Array.from(li.children).find((c) =>
          ['ul', 'ol'].includes(c.tagName?.toLowerCase()),
        );
        const ownText = Array.from(li.childNodes)
          .filter((c) => c !== nested)
          .map((c) => inline(c))
          .join('')
          .trim();
        const prefix = tag === 'ul' ? '- ' : `${i + 1}. `;
        if (!nested) return `${prefix}${ownText}`;
        const nestedMd = block(nested)
          .trim()
          .split('\n')
          .map((l) => `  ${l}`)
          .join('\n');
        return `${prefix}${ownText}\n${nestedMd}`;
      });
      return items.join('\n') + '\n\n';
    }
    case 'pre':
      return '```\n' + (el.textContent ?? '') + '\n```\n\n';
    case 'hr':
      return '---\n\n';
    case 'table': {
      const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.children).map((cell) => inline(cell).trim()),
      );
      if (rows.length === 0) return '';
      const [header, ...body] = rows;
      const headerLine = `| ${header.join(' | ')} |`;
      const alignLine = `| ${header.map(() => '---').join(' | ')} |`;
      const bodyLines = body.map((row) => `| ${row.join(' | ')} |`);
      return [headerLine, alignLine, ...bodyLines].join('\n') + '\n\n';
    }
    case 'img': {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      return `![${alt}](${src})\n\n`;
    }
    default:
      return Array.from(el.childNodes)
        .map((child) => (child.nodeType === 1 ? block(child) : inline(child)))
        .join('');
  }
}

export function htmlToMarkdown(html) {
  const dom = new JSDOM(`<body>${html}</body>`);
  const body = dom.window.document.body;
  return Array.from(body.children)
    .map((child) => block(child))
    .join('')
    .trim();
}

// ponytail: duplicated (not imported) from src/lib/markdown/text-projection.ts —
// this script runs as plain .mjs directly under node, outside the TS/path-alias
// build pipeline, and is deleted after the one-time migration anyway. Kept in
// sync by the drift-guard test in this file's test suite.
export function markdownToPlainTextForMigration(markdown) {
  return markdown
    .split('\n')
    .map((line) =>
      line
        .replace(/^(?:>\s?)+/, '')
        .replace(/^#{1,6}\s+/, '')
        .replace(/^\s*(?:[-*+]|\d+\.)\s+/, ''),
    )
    .join('\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '[image: $1]')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*\*|___)(.+?)\1/g, '$2')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

export async function migrateRichNotes(prisma, { write }) {
  const notes = await prisma.note.findMany({ where: { mode: 'RICH' } });
  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const note of notes) {
    try {
      if (!note.content.trim()) {
        skipped++;
        continue;
      }
      // Not idempotency-safe otherwise: a second run against already-migrated
      // (Markdown, not HTML) content would parse as a single JSDOM text node
      // (body.children.length === 0), so htmlToMarkdown would silently return
      // '' and blank the note out. Treat non-HTML content as already migrated.
      //
      // Deliberately narrow to the block-level tags Tiptap's schema actually
      // emits at the document root (ProseMirror requires `block+` there) -
      // NOT a bare "contains any <tag>" sniff. htmlToMarkdown's own output
      // can legitimately contain inline HTML remnants like `<u>...</u>`
      // (the HTML-in-Markdown underline convention) or an autolink
      // `<https://...>`; a broader regex would misclassify already-migrated
      // Markdown containing one of those as un-migrated source HTML, feed it
      // back into htmlToMarkdown, and silently drop everything outside the
      // matched tag (e.g. "# Title\n\n<u>x</u> tail" -> "x").
      const HTML_BLOCK_TAG =
        /<(p|div|h[1-6]|ul|ol|li|pre|blockquote|table|tr|t[dh]|img|br|hr)\b[^>]*>/i;
      if (!HTML_BLOCK_TAG.test(note.content)) {
        skipped++;
        continue;
      }
      const markdown = htmlToMarkdown(note.content);
      if (markdown === '' && note.content.trim() !== '') {
        failed++;
        console.error(
          `Failed to convert note ${note.id}: conversion produced empty Markdown from non-empty HTML content - refusing to write.`,
        );
        continue;
      }
      const textContent = markdownToPlainTextForMigration(markdown);
      if (write) {
        await prisma.note.update({
          where: { id: note.id },
          data: { content: markdown, textContent },
        });
      }
      converted++;
    } catch (error) {
      failed++;
      console.error(`Failed to convert note ${note.id}:`, error instanceof Error ? error.message : error);
    }
  }

  return { converted, skipped, failed, total: notes.length };
}

function printUsage() {
  console.log(`
Usage: node scripts/migrate-rich-html-to-markdown.mjs [--write] [--turso-backup-confirmed]

  (no flags)                 Dry run - reports what would change, writes nothing.
  --write                    Perform the migration.
  --turso-backup-confirmed   Required alongside --write when DATABASE_URL points at
                              libsql:// or https:// (Turso). Confirms you have taken
                              an independent backup/export first - there is no local
                              file for this script to copy.
`);
}

export async function runMigration({ argv = process.argv.slice(2), env = process.env } = {}) {
  const write = argv.includes('--write');
  const tursoBackupConfirmed = argv.includes('--turso-backup-confirmed');
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  const isTurso = databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('https://');
  const isFileUrl = databaseUrl.startsWith('file:');

  if (!isTurso && !isFileUrl) {
    throw new Error(
      `Unrecognized DATABASE_URL format: "${databaseUrl}". Expected a "file:" path or a Turso "libsql://"/"https://" URL.`,
    );
  }

  if (write && isTurso && !tursoBackupConfirmed) {
    throw new Error(
      'Refusing to run --write against a Turso DATABASE_URL without --turso-backup-confirmed. ' +
        'Take an independent backup/export of the Turso database first (there is no local file ' +
        'for this script to copy), then re-run with --turso-backup-confirmed.',
    );
  }

  // Resolved once, up front, and reused for both the backup check and the
  // actual Prisma connection below - otherwise the backup check resolves a
  // relative `file:` path against process.cwd() while a bare `databaseUrl`
  // handed to PrismaClient gets resolved by Prisma relative to
  // schema.prisma's directory instead. Those two resolutions can disagree
  // (they did: see the runbook note above), so the backup could silently
  // check a different file than the one actually being written to.
  let resolvedFileUrl = databaseUrl;
  let backupPath = null;
  if (isFileUrl) {
    const filePath = path.resolve(databaseUrl.slice('file:'.length));
    resolvedFileUrl = `file:${filePath}`;
    if (write) {
      backupPath = await createBackupIfExists(filePath);
      if (backupPath === null) {
        throw new Error(
          `No existing database file found at "${filePath}" to back up before --write. ` +
            'Verify DATABASE_URL points at the correct, existing database file before retrying. ' +
            '(This could be a genuinely new/empty target, but a one-time migration of real data ' +
            'should never proceed with zero backup and no acknowledgment.)',
        );
      }
    }
  }

  const prisma = isTurso
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url: databaseUrl, authToken: env.TURSO_AUTH_TOKEN }) })
    : new PrismaClient({ datasources: { db: { url: resolvedFileUrl } } });

  try {
    const result = await migrateRichNotes(prisma, { write });
    console.log(
      `Converted: ${result.converted}, skipped (empty): ${result.skipped}, failed: ${result.failed}, total RICH notes: ${result.total}`,
    );
    if (backupPath) console.log(`Backup created: ${backupPath}`);
    if (!write) console.log('Dry run only - re-run with --write to persist changes.');
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    printUsage();
    process.exitCode = 1;
  });
}
