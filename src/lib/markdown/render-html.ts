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

export function _assignHeadingId(text: string, seen: Map<string, number>): string {
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
