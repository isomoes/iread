// src/server/routes/feeds.ts
// /api/feeds router: list, add, delete, refresh-one, refresh-all. (PLAN 7 Feeds)

import { Hono } from 'hono';
import type {
  AddFeedRequest,
  AddFeedResponse,
  ListFeedsResponse,
  RefreshAllResponse,
  RefreshFeedResponse,
} from '../../shared/types.js';
import {
  addFeed,
  deleteFeed,
  listFeeds,
  refreshAll,
  refreshFeed,
} from '../feed-service.js';
import { errorResponse, parseId, serviceErrorToResponse } from './helpers.js';

export const feeds = new Hono();

// IMPORTANT: register the static "/refresh" route before the parameterized
// ":id/refresh" route so "refresh" is never captured as an :id.

// GET /api/feeds — list feeds with counts + global totals.
feeds.get('/', (c) => {
  const body: ListFeedsResponse = listFeeds();
  return c.json(body, 200);
});

// POST /api/feeds — add a feed by URL (fetches immediately).
feeds.post('/', async (c) => {
  let payload: Partial<AddFeedRequest>;
  try {
    payload = await c.req.json();
  } catch {
    return errorResponse(c, 400, 'Request body must be JSON.');
  }
  if (!payload || typeof payload.url !== 'string') {
    return errorResponse(c, 400, 'Body must include a "url" string.', 'BAD_INPUT');
  }

  try {
    const feed = await addFeed(payload.url);
    const body: AddFeedResponse = { feed };
    return c.json(body, 201);
  } catch (err) {
    return serviceErrorToResponse(c, err);
  }
});

// POST /api/feeds/refresh — refresh all feeds (always 200).
feeds.post('/refresh', async (c) => {
  const result = await refreshAll();
  const body: RefreshAllResponse = result;
  return c.json(body, 200);
});

// POST /api/feeds/:id/refresh — refresh one feed.
feeds.post('/:id/refresh', async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return errorResponse(c, 400, 'Invalid feed id.', 'BAD_INPUT');
  try {
    const result = await refreshFeed(id);
    const body: RefreshFeedResponse = result;
    return c.json(body, 200);
  } catch (err) {
    return serviceErrorToResponse(c, err);
  }
});

// DELETE /api/feeds/:id — delete a feed (cascades to items).
feeds.delete('/:id', (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return errorResponse(c, 400, 'Invalid feed id.', 'BAD_INPUT');
  try {
    deleteFeed(id);
    return c.body(null, 204);
  } catch (err) {
    return serviceErrorToResponse(c, err);
  }
});
