import MarkdownIt from 'markdown-it';

// html:false is a security boundary — pasted text/plain is untrusted and must
// never be interpreted as literal HTML. linkify:true auto-links bare URLs;
// sanitizeHTML's existing http/mailto allowlist on <a href> still applies
// after this, so it's not a bypass.
const md = new MarkdownIt('default', { html: false, linkify: true });

export function markdownToHtml(text: string): string {
  return md.render(text);
}
