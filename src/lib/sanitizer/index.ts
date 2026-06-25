/**
 * PlainDock Sanitization Engine
 * Implementation based on PRD v1.7 Section 2.2.A
 *
 * 3-layer pipeline:
 *   1. Security defense (strip dangerous elements)
 *   2. Consistency normalization (semantic tag alignment)
 *   3. Structure downgrade (tables, media → text)
 */

import { ALLOWED_TAGS, ALLOWED_STYLES, DANGEROUS_TAGS } from './config';
import { TAG_NORMALIZE_MAP } from './normalize';

export function sanitizeHTML(rawHTML: string): string {
  if (!rawHTML || rawHTML.trim() === '') return '';

  // Layer 1: Security Defense
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHTML, 'text/html');
  doc.querySelectorAll(DANGEROUS_TAGS.join(', ')).forEach((el) => el.remove());

  // Layer 2: Consistency & Normalization
  for (const [from, to] of Object.entries(TAG_NORMALIZE_MAP)) {
    doc.querySelectorAll(from).forEach((el) => {
      const replacement = doc.createElement(to);
      replacement.innerHTML = el.innerHTML;
      el.replaceWith(replacement);
    });
  }

  // Normalize code block whitespace: strip leading/trailing \n injected by HTML formatters
  // e.g. <pre><code>\ncontent\n</code></pre> → <pre><code>content</code></pre>
  doc.querySelectorAll('pre').forEach((pre) => {
    const target = pre.querySelector('code') ?? pre;
    const first = target.firstChild;
    const last = target.lastChild;
    if (first?.nodeType === Node.TEXT_NODE && first.textContent !== null) {
      first.textContent = first.textContent.replace(/^\n/, '');
    }
    if (last?.nodeType === Node.TEXT_NODE && last.textContent !== null) {
      last.textContent = last.textContent.replace(/\n$/, '');
    }
  });

  // Layer 3: Structure Downgrade — Tables
  doc.querySelectorAll('table').forEach((table) => {
    const rows = Array.from(table.querySelectorAll('tr'));
    rows.forEach((tr) => {
      const p = doc.createElement('p');
      const cells = Array.from(tr.querySelectorAll('td, th')).map(
        (cell) => cell.textContent?.trim() || '',
      );
      p.textContent = cells.join('\t');
      tr.replaceWith(p);
    });
    table.replaceWith(...Array.from(table.childNodes));
  });

  // Layer 3: Structure Downgrade — Media
  doc.querySelectorAll('img, video').forEach((media) => {
    const src = (media as HTMLImageElement).src || '';
    const span = doc.createElement('span');
    span.textContent = `[${media.tagName}: ${src}]`;
    media.replaceWith(span);
  });

  // Final Cleanup: Keep only allowlisted tags and styles
  const clean = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(true);
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();

      if (!ALLOWED_TAGS.includes(tagName)) {
        const fragment = doc.createDocumentFragment();
        el.childNodes.forEach((child) => {
          const cleaned = clean(child);
          if (cleaned) fragment.appendChild(cleaned);
        });
        return fragment;
      }

      const newEl = doc.createElement(tagName);

      // Anchor attributes
      if (tagName === 'a') {
        const href = el.getAttribute('href');
        if (href && (href.startsWith('http') || href.startsWith('mailto'))) {
          newEl.setAttribute('href', href);
          newEl.setAttribute('target', '_blank');
          // Merge rel: preserve existing + ensure noopener noreferrer
          const existingRel = el.getAttribute('rel') || '';
          const relTokens = new Set(existingRel.split(/\s+/).filter(Boolean));
          relTokens.add('noopener');
          relTokens.add('noreferrer');
          newEl.setAttribute('rel', Array.from(relTokens).join(' '));
        }
      }

      // Style filtering
      const style = el.getAttribute('style');
      if (style) {
        const filteredStyles = style
          .split(';')
          .map((s) => s.trim())
          .filter((s) => {
            const key = s.split(':')[0]?.trim().toLowerCase();
            return key && ALLOWED_STYLES.includes(key);
          });
        if (filteredStyles.length > 0) {
          newEl.setAttribute('style', filteredStyles.join('; '));
        }
      }

      el.childNodes.forEach((child) => {
        const cleaned = clean(child);
        if (cleaned) newEl.appendChild(cleaned);
      });

      return newEl;
    }
    return null;
  };

  const finalFragment = doc.createDocumentFragment();
  doc.body.childNodes.forEach((node) => {
    const cleaned = clean(node);
    if (cleaned) finalFragment.appendChild(cleaned);
  });

  const container = doc.createElement('div');
  container.appendChild(finalFragment);
  return container.innerHTML;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function wrapPlainText(text: string): string {
  // PRD 2.2.A: Normalize \r\n -> \n, no trim on overall text
  const normalized = text.replace(/\r\n/g, '\n');

  // Double \n → new <p>, single \n → <br>
  const paragraphs = normalized.split(/\n\n+/);
  return paragraphs.map((p) => `<p>${escapeHTML(p).split('\n').join('<br>')}</p>`).join('');
}

export function getNoteTextContent(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}
