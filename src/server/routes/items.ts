// src/server/routes/items.ts
// /api/items router: list, get, patch (read/star), mark-all-read. (PLAN 7 Items)

import { Hono } from 'hono';
import type {
  GetItemResponse,
  ListItemsQuery,
  ListItemsResponse,
  MarkAllReadRequest,
  MarkAllReadResponse,
  PatchItemRequest,
  PatchItemResponse,
  SmartView,
} from '../../shared/types.js';
import {
  getItem,
  listItems,
  markAllRead,
  patchItem,
} from '../feed-service.js';
import { errorResponse, parseId, parseOptionalInt, serviceErrorToResponse } from './helpers.js';

export const items = new Hono();

function parseView(raw: string | undefined): SmartView | undefined {
  if (raw === 'all' || raw === 'unread' || raw === 'starred') return raw;
  return undefined;
}

// GET /api/items — list item summaries.
items.get('/', (c) => {
  const view = parseView(c.req.query('view')) ?? 'all';
  const q = c.req.query('q') ?? '';
  const feedId = parseOptionalInt(c.req.query('feedId'));
  const limit = parseOptionalInt(c.req.query('limit'));
  const offset = parseOptionalInt(c.req.query('offset'));

  const query: ListItemsQuery = { view, q };
  if (feedId !== undefined) query.feedId = feedId;
  if (limit !== undefined) query.limit = limit;
  if (offset !== undefined) query.offset = offset;

  const body: ListItemsResponse = listItems(query);
  return c.json(body, 200);
});

// POST /api/items/mark-all-read — mark a scope read. Registered before /:id so
// "mark-all-read" is never captured as an item id.
items.post('/mark-all-read', async (c) => {
  let payload: Partial<MarkAllReadRequest> = {};
  try {
    const text = await c.req.text();
    if (text.trim() !== '') payload = JSON.parse(text) as Partial<MarkAllReadRequest>;
  } catch {
    return errorResponse(c, 400, 'Request body must be JSON.', 'BAD_INPUT');
  }

  const scope: MarkAllReadRequest = {};
  if (typeof payload.feedId === 'number' && Number.isFinite(payload.feedId)) {
    scope.feedId = Math.trunc(payload.feedId);
  }
  const view = parseView(payload.view);
  if (view !== undefined) scope.view = view;

  const updated = markAllRead(scope);
  const body: MarkAllReadResponse = { updated };
  return c.json(body, 200);
});

// GET /api/items/:id — full item for the reader pane.
items.get('/:id', (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return errorResponse(c, 400, 'Invalid item id.', 'BAD_INPUT');
  try {
    const item = getItem(id);
    const body: GetItemResponse = { item };
    return c.json(body, 200);
  } catch (err) {
    return serviceErrorToResponse(c, err);
  }
});

// PATCH /api/items/:id — update read/starred state.
items.patch('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return errorResponse(c, 400, 'Invalid item id.', 'BAD_INPUT');

  let payload: Partial<PatchItemRequest>;
  try {
    payload = await c.req.json();
  } catch {
    return errorResponse(c, 400, 'Request body must be JSON.', 'BAD_INPUT');
  }

  const patch: PatchItemRequest = {};
  if (typeof payload.isRead === 'boolean') patch.isRead = payload.isRead;
  if (typeof payload.isStarred === 'boolean') patch.isStarred = payload.isStarred;
  if (patch.isRead === undefined && patch.isStarred === undefined) {
    return errorResponse(c, 400, 'Provide at least one of isRead or isStarred (boolean).', 'BAD_INPUT');
  }

  try {
    const item = patchItem(id, patch);
    const body: PatchItemResponse = { item };
    return c.json(body, 200);
  } catch (err) {
    return serviceErrorToResponse(c, err);
  }
});
