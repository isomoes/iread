// src/server/index.ts
// Hono entry point. Registers all /api/* routers FIRST; unknown /api/* paths
// return a JSON 404 in the uniform error shape (never HTML). In production serves
// the static web bundle from ../web (relative to the emitted dist/server/index.js)
// with SPA fallback to index.html for non-/api GET requests. (PLAN 7, 9, 10)

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { ApiError } from '../shared/types.js';
import { feeds } from './routes/feeds.js';
import { items } from './routes/items.js';
import { opml } from './routes/opml.js';

const PORT = Number(process.env.PORT ?? 8787);
const IS_PROD = process.env.NODE_ENV === 'production';

// Importing ./db has the side effect of opening the DB and running migrations.
// Do it explicitly so startup failures surface immediately.
import './db.js';
import { syncOpmlMirror } from './feed-service.js';

syncOpmlMirror();

const app = new Hono();

// --- API routes (registered FIRST) -----------------------------------------

const api = new Hono();
api.route('/feeds', feeds);
api.route('/items', items);
api.route('/opml', opml);

app.route('/api', api);

// Unknown /api/* -> JSON 404 in the uniform error shape, never the SPA HTML.
app.all('/api/*', (c) => {
  const body: ApiError = {
    error: { message: `Not found: ${c.req.method} ${c.req.path}`, code: 'NOT_FOUND' },
  };
  return c.json(body, 404);
});

// --- Static + SPA fallback (production only) --------------------------------

if (IS_PROD) {
  // Emitted file is dist/server/index.js; the web bundle is dist/web. The static
  // root is therefore ../web relative to this module. serveStatic resolves only
  // within that root (no ../ traversal escapes it).
  const serverDir = dirname(fileURLToPath(import.meta.url));
  const webRoot = resolve(serverDir, '../web');
  const indexHtmlPath = resolve(webRoot, 'index.html');

  // Serve real static assets first.
  app.use('/*', serveStatic({ root: webRoot }));

  // SPA fallback: any non-/api GET that did not match a static file returns
  // index.html. (The /api/* handlers above already returned for API paths.)
  app.get('/*', async (c) => {
    try {
      const html = await readFile(indexHtmlPath, 'utf-8');
      return c.html(html);
    } catch {
      return c.text('Web bundle not found. Run `pnpm build` first.', 500);
    }
  });
}

// --- Start ------------------------------------------------------------------

serve({ fetch: app.fetch, port: PORT }, (info) => {
  const url = `http://localhost:${info.port}`;
  console.log(`[iread] listening on ${url}`);
});

export { app };
