// src/server/opml.ts
// OPML import (XXE-safe parse -> feed URLs) and export (feeds -> OPML 2.0 XML).
// (PLAN 7 OPML, 10 XXE)

import { XMLParser } from 'fast-xml-parser';
import type { Feed } from '../shared/types.js';

const MAX_OPML_BYTES = 5 * 1024 * 1024; // 5 MB

export class OpmlError extends Error {
  override name = 'OpmlError';
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // XXE / billion-laughs defense: do NOT process DOCTYPE or expand any entities.
  processEntities: false,
  allowBooleanAttributes: true,
  // Treat every <outline> as a potential array element so nested structures and
  // single-child documents are handled uniformly.
  isArray: (name) => name === 'outline',
});

/**
 * Recursively collect every `xmlUrl` from the parsed OPML object tree. OPML nests
 * <outline> elements under <body> and allows folder hierarchies; we walk every
 * object/array value depth-first and flatten, since iread has no folder concept.
 */
function collectXmlUrls(node: unknown, out: string[]): void {
  if (node === null || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const child of node) collectXmlUrls(child, out);
    return;
  }

  const obj = node as Record<string, unknown>;

  // Pick up an xmlUrl attribute on this node (attributeNamePrefix '@_'). Some
  // exporters vary the casing of the attribute name.
  const xmlUrl = obj['@_xmlUrl'] ?? obj['@_xmlurl'] ?? obj['@_xmlURL'];
  if (typeof xmlUrl === 'string') {
    const trimmed = xmlUrl.trim();
    if (trimmed) out.push(trimmed);
  }

  // Recurse into every child value so nested <body>/<outline> trees are reached
  // regardless of depth. Attribute values (string/number) are skipped by the
  // typeof guard at the top.
  for (const key of Object.keys(obj)) {
    if (key.startsWith('@_')) continue; // attributes, not child elements
    collectXmlUrls(obj[key], out);
  }
}

/**
 * Parse an OPML document and return the de-duplicated list of feed `xmlUrl`s in
 * first-seen order. Rejects oversized input and documents that declare a DOCTYPE.
 * Throws OpmlError on parse failure / size violation.
 */
export function importOpml(xml: string): string[] {
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new OpmlError('OPML body is empty.');
  }
  // Byte length, not character count, to match the on-wire size.
  if (Buffer.byteLength(xml, 'utf-8') > MAX_OPML_BYTES) {
    throw new OpmlError('OPML document exceeds the 5 MB size limit.');
  }
  // Defense in depth: reject any DOCTYPE outright (processEntities:false already
  // refuses to expand entities, but we never want to even see a DTD).
  if (/<!DOCTYPE/i.test(xml)) {
    throw new OpmlError('OPML documents with a DOCTYPE are not allowed.');
  }

  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new OpmlError(`Could not parse OPML: ${message}`);
  }

  if (doc === null || typeof doc !== 'object') {
    throw new OpmlError('OPML document is not well-formed.');
  }

  const root = doc as Record<string, unknown>;
  const opml = root['opml'];
  // Body lives at opml.body.outline, but some exporters omit the <opml> wrapper.
  // Collect from the whole tree to be liberal in what we accept.
  const urls: string[] = [];
  collectXmlUrls(opml ?? root, urls);

  // De-dup within the file, preserving first-seen order, so two identical
  // xmlUrls do not collide on the UNIQUE index mid-transaction.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const u of urls) {
    if (!seen.has(u)) {
      seen.add(u);
      deduped.push(u);
    }
  }
  return deduped;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function escapeXmlAttr(value: string): string {
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Produce an OPML 2.0 document, one <outline type="rss"> per feed with
 * text/title/xmlUrl (and htmlUrl when a site URL is known). Attributes are
 * XML-escaped.
 */
export function exportOpml(feeds: Feed[]): string {
  const now = new Date().toUTCString();
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<opml version="2.0">');
  lines.push('  <head>');
  lines.push('    <title>iread subscriptions</title>');
  lines.push(`    <dateCreated>${escapeXmlAttr(now)}</dateCreated>`);
  lines.push('  </head>');
  lines.push('  <body>');
  for (const feed of feeds) {
    const text = escapeXmlAttr(feed.title || feed.feedUrl);
    const xmlUrl = escapeXmlAttr(feed.feedUrl);
    const htmlUrlAttr = feed.siteUrl ? ` htmlUrl="${escapeXmlAttr(feed.siteUrl)}"` : '';
    lines.push(
      `    <outline type="rss" text="${text}" title="${text}" xmlUrl="${xmlUrl}"${htmlUrlAttr} />`,
    );
  }
  lines.push('  </body>');
  lines.push('</opml>');
  lines.push('');
  return lines.join('\n');
}
