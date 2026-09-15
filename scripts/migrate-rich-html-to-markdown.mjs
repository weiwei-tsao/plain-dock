import { JSDOM } from 'jsdom';

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
