// src/server/routes/opml.ts
// /api/opml router: export (GET) and import (POST). (PLAN 7 OPML)

import { Hono } from 'hono';
import type { ImportOpmlRequest, ImportOpmlResponse } from '../../shared/types.js';
import { importFeeds, listFeedsForExport } from '../feed-service.js';
import { exportOpml, importOpml, OpmlError } from '../opml.js';
import { errorResponse } from './helpers.js';

export const opml = new Hono();

// GET /api/opml — export subscriptions as OPML 2.0.
opml.get('/', (c) => {
  const xml = exportOpml(listFeedsForExport());
  c.header('Content-Type', 'text/x-opml; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="iread.opml"');
  return c.body(xml, 200);
});

// POST /api/opml — import. Accepts a raw OPML body (application/xml,
// text/x-opml) or JSON { opml: string }.
opml.post('/', async (c) => {
  const contentType = (c.req.header('content-type') ?? '').toLowerCase();

  let xml: string;
  try {
    if (contentType.includes('application/json')) {
      const payload = (await c.req.json()) as Partial<ImportOpmlRequest>;
      if (!payload || typeof payload.opml !== 'string') {
        return errorResponse(c, 400, 'JSON body must include an "opml" string.', 'BAD_INPUT');
      }
      xml = payload.opml;
    } else {
      // Raw OPML body (application/xml, text/x-opml, or unspecified).
      xml = await c.req.text();
    }
  } catch {
    return errorResponse(c, 400, 'Could not read the request body.', 'BAD_INPUT');
  }

  let urls: string[];
  try {
    urls = importOpml(xml);
  } catch (err) {
    if (err instanceof OpmlError) {
      return errorResponse(c, 400, err.message, 'BAD_OPML');
    }
    return errorResponse(c, 400, 'Could not parse the OPML document.', 'BAD_OPML');
  }

  const result = await importFeeds(urls);
  const body: ImportOpmlResponse = result;
  return c.json(body, 200);
});
