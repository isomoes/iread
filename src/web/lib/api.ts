// src/web/lib/api.ts
// Typed fetch client over /api/*. Parses the uniform { error } shape and
// throws a typed ApiError on any non-2xx response.

import type {
  AddFeedRequest,
  AddFeedResponse,
  ApiError as ApiErrorShape,
  GetItemResponse,
  ImportOpmlResponse,
  ListFeedsResponse,
  ListItemsResponse,
  MarkAllReadRequest,
  MarkAllReadResponse,
  PatchItemRequest,
  PatchItemResponse,
  RefreshAllResponse,
  RefreshFeedResponse,
  SmartView,
} from '../../shared/types';

const BASE = '/api';

/** Thrown on any non-2xx response. Carries the parsed server message/code + HTTP status. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string;
  /** JSON-serialized into the body with the application/json content type. */
  json?: unknown;
  /** Raw body (e.g. OPML XML); sets the given content type. */
  body?: BodyInit;
  contentType?: string;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.body !== undefined) {
    if (opts.contentType) headers['Content-Type'] = opts.contentType;
    body = opts.body;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: opts.signal,
    });
  } catch (cause) {
    // Network failure, abort, offline, etc. Surface as an ApiError with status 0.
    const message = cause instanceof Error ? cause.message : 'Network request failed';
    throw new ApiError(message, 0);
  }

  if (res.status === 204) {
    // No content; callers expecting void will ignore the value.
    return undefined as T;
  }

  // Parse the body once. Errors and success both come back as JSON here.
  let parsed: unknown = undefined;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON body. For an error status this becomes a generic message below.
      parsed = undefined;
    }
  }

  if (!res.ok) {
    const err = (parsed as ApiErrorShape | undefined)?.error;
    const message = err?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, err?.code);
  }

  return parsed as T;
}

/* ---------- Query-param builder for the item list ---------- */

export interface ListItemsParams {
  feedId?: number;
  view?: SmartView;
  q?: string;
  limit?: number;
  offset?: number;
}

function buildItemsQuery(params: ListItemsParams): string {
  const sp = new URLSearchParams();
  if (params.feedId !== undefined) sp.set('feedId', String(params.feedId));
  if (params.view !== undefined) sp.set('view', params.view);
  if (params.q !== undefined && params.q !== '') sp.set('q', params.q);
  if (params.limit !== undefined) sp.set('limit', String(params.limit));
  if (params.offset !== undefined) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

/* ---------- Public typed client ---------- */

export const api = {
  /* Feeds */
  listFeeds(signal?: AbortSignal): Promise<ListFeedsResponse> {
    return request<ListFeedsResponse>('/feeds', { signal });
  },

  addFeed(url: string): Promise<AddFeedResponse> {
    const payload: AddFeedRequest = { url };
    return request<AddFeedResponse>('/feeds', { method: 'POST', json: payload });
  },

  deleteFeed(id: number): Promise<void> {
    return request<void>(`/feeds/${id}`, { method: 'DELETE' });
  },

  refreshFeed(id: number): Promise<RefreshFeedResponse> {
    return request<RefreshFeedResponse>(`/feeds/${id}/refresh`, { method: 'POST' });
  },

  refreshAll(): Promise<RefreshAllResponse> {
    return request<RefreshAllResponse>('/feeds/refresh', { method: 'POST' });
  },

  /* Items */
  listItems(params: ListItemsParams, signal?: AbortSignal): Promise<ListItemsResponse> {
    return request<ListItemsResponse>(`/items${buildItemsQuery(params)}`, { signal });
  },

  getItem(id: number, signal?: AbortSignal): Promise<GetItemResponse> {
    return request<GetItemResponse>(`/items/${id}`, { signal });
  },

  patchItem(id: number, patch: PatchItemRequest): Promise<PatchItemResponse> {
    return request<PatchItemResponse>(`/items/${id}`, { method: 'PATCH', json: patch });
  },

  markAllRead(payload: MarkAllReadRequest): Promise<MarkAllReadResponse> {
    return request<MarkAllReadResponse>('/items/mark-all-read', {
      method: 'POST',
      json: payload,
    });
  },

  /* OPML */
  importOpml(opml: string): Promise<ImportOpmlResponse> {
    // Post the raw OPML body so the server parses it directly.
    return request<ImportOpmlResponse>('/opml', {
      method: 'POST',
      body: opml,
      contentType: 'application/xml',
    });
  },

  /** URL for GET export; used by an anchor download so the browser saves the file. */
  opmlExportUrl(): string {
    return `${BASE}/opml`;
  },
};

export type Api = typeof api;
