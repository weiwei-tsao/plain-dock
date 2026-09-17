import { parser, GFM } from '@lezer/markdown';
import type { SyntaxNode } from '@lezer/common';

const markdownParser = parser.configure(GFM);

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttribute(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function hasControlChars(url: string): boolean {
  // eslint-disable-next-line no-control-regex -- URL validation must reject ASCII control codes.
  return /[\u0000-\u001F\u007F]/.test(url);
}

function getScheme(url: string): string | null {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
}

const LINK_SCHEMES = new Set(['http', 'https', 'mailto']);
const IMAGE_URL_SCHEMES = new Set(['http', 'https']);
const IMAGE_DATA_MIME_RE = /^data:image\/(?:png|jpeg|webp|gif)(?:;[^,]*)?,/i;

export function isSafeLinkHref(url: string): boolean {
  if (hasControlChars(url)) return false;
  const scheme = getScheme(url);
  if (scheme === null) return true;
  return LINK_SCHEMES.has(scheme);
}

export function isSafeImageSrc(url: string): boolean {
  if (hasControlChars(url)) return false;
  const scheme = getScheme(url);
  if (scheme === null) return true;
  if (scheme === 'data') return IMAGE_DATA_MIME_RE.test(url.trim());
  return IMAGE_URL_SCHEMES.has(scheme);
}

function slugifyText(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

function assignHeadingId(text: string, seen: Map<string, number>): string {
  const base = slugifyText(text);
  let count = seen.get(base) ?? 0;
  let id = count === 0 ? base : `${base}-${count + 1}`;
  while (seen.has(id)) {
    count += 1;
    id = `${base}-${count + 1}`;
  }
  seen.set(base, count + 1);
  seen.set(id, 1);
  return id;
}

export interface Heading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  id: string;
}

export interface RenderResult {
  html: string;
  headings: Heading[];
}

const MARKER_NODES = new Set<string>([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'CodeInfo',
  'LinkMark',
  'LinkLabel',
  'LinkTitle',
  'ListMark',
  'QuoteMark',
  'TaskMarker',
]);

function decodeEscape(nodeSource: string): string {
  // nodeSource is the full "\\X" escape sequence — the visible character is
  // everything after the backslash.
  return nodeSource.slice(1);
}

// A curated subset of commonly-typed named entities — not the full HTML5
// table (~2000 entries). Numeric entities (&#123; / &#x7B;) are fully
// supported below regardless of this map; an unmapped named entity (e.g. an
// obscure one not in this list) falls back to its literal escaped source
// text rather than silently producing something wrong.
const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  ldquo: '\u201c',
  rdquo: '\u201d',
  lsquo: '\u2018',
  rsquo: '\u2019',
  deg: '\u00b0',
  euro: '\u20ac',
  pound: '\u00a3',
  cent: '\u00a2',
  yen: '\u00a5',
};

function decodeEntity(nodeSource: string): string {
  // nodeSource is "&name;", "&#123;", or "&#x7B;".
  const body = nodeSource.slice(1, -1);
  if (body.startsWith('#')) {
    const hex = /^#x/i.test(body);
    const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (
      !Number.isInteger(code) ||
      code <= 0 ||
      code > 0x10ffff ||
      (code >= 0xd800 && code <= 0xdfff)
    )
      return '\uFFFD';
    return String.fromCodePoint(code);
  }
  return Object.hasOwn(ENTITY_MAP, body) ? ENTITY_MAP[body] : nodeSource;
}

export function renderMarkdown(content: string): RenderResult {
  const source = content;
  const tree = markdownParser.parse(source);
  const headings: Heading[] = [];

  function renderChildren(node: SyntaxNode): string {
    let out = '';
    let pos = node.from;
    let child = node.firstChild;
    while (child) {
      out += escapeHtml(source.slice(pos, child.from));
      out += renderNode(child);
      pos = child.to;
      child = child.nextSibling;
    }
    out += escapeHtml(source.slice(pos, node.to));
    return out;
  }

  function extractUrl(urlNode: SyntaxNode): string {
    const raw = source.slice(urlNode.from, urlNode.to);
    if (raw.startsWith('<') && raw.endsWith('>')) return raw.slice(1, -1);
    return raw;
  }

  function extractText(node: SyntaxNode): string {
    let out = '';
    let pos = node.from;
    let child = node.firstChild;
    while (child) {
      out += source.slice(pos, child.from);
      out += extractChildText(child);
      pos = child.to;
      child = child.nextSibling;
    }
    out += source.slice(pos, node.to);
    return out;
  }

  function extractChildText(node: SyntaxNode): string {
    const name = node.type.name;
    if (name === 'URL') {
      const parentName = node.parent?.type.name;
      if (parentName === 'Link' || parentName === 'Image') return '';
      return extractUrl(node);
    }
    if (MARKER_NODES.has(name)) return '';
    if (name === 'Escape') return decodeEscape(source.slice(node.from, node.to));
    if (name === 'Entity') return decodeEntity(source.slice(node.from, node.to));
    if (name === 'HTMLBlock' || name === 'HTMLTag') return source.slice(node.from, node.to);
    return extractText(node);
  }

  const seenSlugs = new Map<string, number>();

  function renderHeading(node: SyntaxNode, level: Heading['level']): string {
    // .trim() drops the syntactic space/newline adjacent to the heading
    // marker (e.g. the leading space after "#", or the trailing newline
    // before a setext "===" line) that the gap-based extraction otherwise
    // includes — it's a delimiter, not part of the visible heading text.
    const text = extractText(node).trim();
    const id = assignHeadingId(text, seenSlugs);
    headings.push({ level, text, id });
    return `<h${level} id="${escapeAttribute(id)}">${renderChildren(node)}</h${level}>`;
  }

  function renderLink(node: SyntaxNode): string {
    const urlNode = node.getChild('URL');
    const inner = renderChildren(node);
    if (!urlNode) return inner;
    const url = extractUrl(urlNode);
    if (!isSafeLinkHref(url)) return inner;
    return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }

  function renderImage(node: SyntaxNode): string {
    const urlNode = node.getChild('URL');
    const alt = extractText(node);
    if (!urlNode) return escapeHtml(alt);
    const url = extractUrl(urlNode);
    if (!isSafeImageSrc(url)) return escapeHtml(alt);
    return `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}" />`;
  }

  function renderAutolink(node: SyntaxNode): string {
    const urlNode = node.getChild('URL');
    if (!urlNode) return escapeHtml(source.slice(node.from, node.to));
    const rawUrl = extractUrl(urlNode);
    const url = getScheme(rawUrl) === null ? `mailto:${rawUrl}` : rawUrl;
    if (!isSafeLinkHref(url)) return escapeHtml(rawUrl);
    return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(rawUrl)}</a>`;
  }

  function renderNode(node: SyntaxNode): string {
    const name = node.type.name;
    if (MARKER_NODES.has(name)) return '';

    switch (name) {
      case 'Document':
        return renderChildren(node);
      case 'Paragraph':
        return `<p>${renderChildren(node)}</p>`;
      case 'Blockquote':
        return `<blockquote>${renderChildren(node)}</blockquote>`;
      case 'BulletList':
        return `<ul>${renderChildren(node)}</ul>`;
      case 'OrderedList': {
        const marker = node.getChild('ListItem')?.getChild('ListMark');
        const start = marker ? parseInt(source.slice(marker.from, marker.to), 10) : 1;
        const attribute = start === 1 ? '' : ` start="${escapeAttribute(String(start))}"`;
        return `<ol${attribute}>${renderChildren(node)}</ol>`;
      }
      case 'ListItem':
        return `<li>${renderChildren(node)}</li>`;
      // A GFM task item's checkbox is nested one level inside its ListItem
      // (ListItem > ListMark, Task), not a sibling of ListItem — so Task
      // renders only the checkbox + its own content, and lets the
      // surrounding ListItem case supply the <li> wrapper.
      case 'Task': {
        const marker = node.getChild('TaskMarker');
        const checked = marker ? /x/i.test(source.slice(marker.from, marker.to)) : false;
        return `<input type="checkbox" disabled${checked ? ' checked' : ''} />${renderChildren(node)}`;
      }
      case 'HorizontalRule':
        return '<hr />';
      case 'ATXHeading1':
        return renderHeading(node, 1);
      case 'ATXHeading2':
        return renderHeading(node, 2);
      case 'ATXHeading3':
        return renderHeading(node, 3);
      case 'ATXHeading4':
        return renderHeading(node, 4);
      case 'ATXHeading5':
        return renderHeading(node, 5);
      case 'ATXHeading6':
        return renderHeading(node, 6);
      case 'SetextHeading1':
        return renderHeading(node, 1);
      case 'SetextHeading2':
        return renderHeading(node, 2);
      case 'Emphasis':
        return `<em>${renderChildren(node)}</em>`;
      case 'StrongEmphasis':
        return `<strong>${renderChildren(node)}</strong>`;
      case 'Strikethrough':
        return `<del>${renderChildren(node)}</del>`;
      case 'InlineCode':
        return `<code>${renderChildren(node)}</code>`;
      case 'HardBreak':
        return '<br />';
      case 'Escape':
        return escapeHtml(decodeEscape(source.slice(node.from, node.to)));
      case 'Entity':
        return escapeHtml(decodeEntity(source.slice(node.from, node.to)));
      case 'FencedCode':
      case 'CodeBlock':
        return `<pre><code>${renderChildren(node)}</code></pre>`;
      case 'CodeText':
        return escapeHtml(source.slice(node.from, node.to));
      case 'Link':
        return renderLink(node);
      case 'Image':
        return renderImage(node);
      case 'Autolink':
        return renderAutolink(node);
      case 'LinkReference':
        return '';
      case 'URL': {
        const parentName = node.parent?.type.name;
        if (parentName === 'Link' || parentName === 'Image' || parentName === 'Autolink') return '';
        return escapeHtml(source.slice(node.from, node.to));
      }
      default:
        return escapeHtml(source.slice(node.from, node.to));
    }
  }

  const html = renderNode(tree.topNode);
  return { html, headings };
}
