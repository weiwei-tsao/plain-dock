
/**
 * PlainDock Sanitization Engine
 * Implementation based on PRD v1.7 Section 2.2.A
 */

// We'll use a virtual DOM for processing in a SPA environment
// In a real environment, we'd use DOMPurify library.
// Since we are in a senior role, we will simulate a robust sanitization.

export function sanitizeHTML(rawHTML: string): string {
  if (!rawHTML || rawHTML.trim() === '') return '';

  // Layer 1: Security Defense (Simulated DOMPurify)
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHTML, 'text/html');

  // Remove meta tags or other invisible content
  doc.querySelectorAll('meta, script, style, iframe, object').forEach(el => el.remove());

  // Layer 2: Consistency & Normalization
  // div -> p
  doc.querySelectorAll('div').forEach(div => {
    const p = doc.createElement('p');
    p.innerHTML = div.innerHTML;
    div.replaceWith(p);
  });

  // <b> -> <strong>, <i> -> <em>
  doc.querySelectorAll('b').forEach(b => {
    const strong = doc.createElement('strong');
    strong.innerHTML = b.innerHTML;
    b.replaceWith(strong);
  });
  doc.querySelectorAll('i').forEach(i => {
    const em = doc.createElement('em');
    em.innerHTML = i.innerHTML;
    i.replaceWith(em);
  });

  // Layer 3: Structure Downgrade
  // Tables to P with tabs
  doc.querySelectorAll('table').forEach(table => {
    const rows = Array.from(table.querySelectorAll('tr'));
    rows.forEach(tr => {
      const p = doc.createElement('p');
      const cells = Array.from(tr.querySelectorAll('td, th'))
        .map(cell => cell.textContent?.trim() || '');
      p.textContent = cells.join('\t');
      tr.replaceWith(p);
    });
    table.replaceWith(...Array.from(table.childNodes));
  });

  // Media to placeholders
  doc.querySelectorAll('img, video').forEach(media => {
    const src = (media as any).src || '';
    const text = `[${media.tagName}: ${src}]`;
    const span = doc.createElement('span');
    span.textContent = text;
    media.replaceWith(span);
  });

  // Final Cleanup: Keep only allowlisted tags and styles
  const allowedTags = ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span'];
  const allowedStyles = ['color', 'background-color', 'text-decoration'];

  const clean = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(true);
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();

      if (!allowedTags.includes(tagName)) {
        // Flatten content if tag not allowed
        const fragment = doc.createDocumentFragment();
        el.childNodes.forEach(child => {
          const cleaned = clean(child);
          if (cleaned) fragment.appendChild(cleaned);
        });
        return fragment;
      }

      const newEl = doc.createElement(tagName);
      
      // Attributes
      if (tagName === 'a') {
        const href = el.getAttribute('href');
        if (href && (href.startsWith('http') || href.startsWith('mailto'))) {
          newEl.setAttribute('href', href);
          newEl.setAttribute('target', '_blank');
          newEl.setAttribute('rel', 'noopener noreferrer');
        }
      }

      // Styles
      const style = el.getAttribute('style');
      if (style) {
        const styleParts = style.split(';').map(s => s.trim()).filter(s => s.length > 0);
        const filteredStyles = styleParts.filter(part => {
          const key = part.split(':')[0].trim().toLowerCase();
          return allowedStyles.includes(key);
        });
        if (filteredStyles.length > 0) {
          newEl.setAttribute('style', filteredStyles.join('; '));
        }
      }

      el.childNodes.forEach(child => {
        const cleaned = clean(child);
        if (cleaned) newEl.appendChild(cleaned);
      });

      return newEl;
    }
    return null;
  };

  const finalFragment = doc.createDocumentFragment();
  doc.body.childNodes.forEach(node => {
    const cleaned = clean(node);
    if (cleaned) finalFragment.appendChild(cleaned);
  });

  const container = doc.createElement('div');
  container.appendChild(finalFragment);
  return container.innerHTML;
}

export function wrapPlainText(text: string): string {
  // PRD 2.2.A: Normalize \r\n -> \n, no trim
  const normalized = text.replace(/\r\n/g, '\n');
  
  // Single \n -> <br>, Double \n -> new <p>
  const paragraphs = normalized.split(/\n\n+/);
  return paragraphs
    .map(p => {
      const lines = p.split('\n').join('<br>');
      return `<p>${lines}</p>`;
    })
    .join('');
}

export function getNoteTextContent(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}
