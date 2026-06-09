// src/server/sanitize.ts
// Server-side HTML sanitization. Bodies are sanitized before they touch the DB,
// so stored content_html is already safe and the client renders it via
// dangerouslySetInnerHTML without re-sanitizing. (PLAN Section 5.4)

import sanitizeHtml from 'sanitize-html';

export const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'blockquote', 'pre', 'code',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'a', 'b', 'i', 'strong', 'em', 'mark', 'small', 'sub', 'sup', 'u', 's', 'span', 'br', 'hr',
    'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
    'video', 'audio', 'source',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading'],
    video: ['src', 'controls', 'poster', 'width', 'height'],
    audio: ['src', 'controls'],
    source: ['src', 'srcset', 'type', 'media'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
    '*': ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Raster data: images only. NO data: svg (can carry script in some renderers);
  // the second pass below strips any non-raster data: URL that slips through here.
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'srcset'],
  allowProtocolRelative: true,
  // nonTextTags drops the TEXT CONTENT of these, not just the tags.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer nofollow' }),
    img: sanitizeHtml.simpleTransform('img', { loading: 'lazy' }),
  },
  disallowedTagsMode: 'discard',
};

// Allowed raster data: image MIME types. data:image/svg+xml (and anything else)
// is stripped in the second pass below.
const RASTER_DATA_RE = /^data:image\/(?:png|jpeg|jpg|gif|webp)(?:;|,)/i;

// Matches a single `attr="data:..."` or `attr='data:...'` occurrence. We only
// need to scrub src / srcset / href because those are the only attributes
// allowedSchemesAppliedToAttributes lets data: through on, and img is the only
// tag with `data` in its scheme allowlist.
const DATA_URL_ATTR_RE = /\b(src|srcset|href)\s*=\s*("data:[^"]*"|'data:[^']*')/gi;

function isSafeDataUrl(rawUrl: string): boolean {
  // srcset can hold multiple comma-separated candidates and a data: URL itself
  // contains a comma (data:<mime>,<payload>), so we cannot split on commas.
  // Instead find every "data:" token (the MIME-type prefix up to the comma or
  // semicolon) and require each one to be a raster image.
  const matches = rawUrl.match(/data:[^\s]*/gi);
  if (!matches) return true; // no data: URL present, nothing to reject
  return matches.every((m) => RASTER_DATA_RE.test(m));
}

/**
 * Sanitize feed-provided article HTML. Runs sanitize-html with SANITIZE_OPTS,
 * then a second regex pass strips any data: image URL that is not a raster
 * format (notably data:image/svg+xml, which can carry script in some renderers).
 */
export function sanitizeArticleHtml(raw: string): string {
  const clean = sanitizeHtml(raw, SANITIZE_OPTS);
  // Second pass: remove src/srcset/href attributes whose data: URL is not raster.
  return clean.replace(DATA_URL_ATTR_RE, (full, attr: string, quoted: string) => {
    const value = quoted.slice(1, -1); // strip surrounding quotes
    return isSafeDataUrl(value) ? full : `${attr}=""`;
  });
}

/** Strip all markup, returning plain text. Used for list-view summaries. */
export function toPlainText(raw: string): string {
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} });
}
