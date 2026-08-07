const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/**
 * Encode a value for interpolation into an HTML template literal. Safe for both
 * text and quoted-attribute positions.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, char => HTML_ENTITIES[char]);
}

const SAFE_PROTOCOLS = ['http:', 'https:'];

/**
 * Return the URL if it resolves to http/https, otherwise ''. Callers must treat
 * '' as "render no link" — assigning it to href would turn the link into a
 * page reload.
 *
 * The URL constructor does the scheme parsing so that obfuscated payloads are
 * caught too: it strips tabs and newlines before parsing, so "java\tscript:..."
 * is rejected as javascript:, and it recognises "javascript://%0aalert(1)" —
 * which the naive /^[a-z][a-z0-9+.-]*:\/\//i scheme test used to let through.
 */
export function safeUrl(value) {
  if (value === null || value === undefined) return '';
  const url = String(value).trim();
  if (!url) return '';

  try {
    const parsed = new URL(url, window.location.origin);
    return SAFE_PROTOCOLS.includes(parsed.protocol) ? url : '';
  } catch {
    return '';
  }
}
