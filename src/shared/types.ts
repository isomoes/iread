// src/shared/types.ts
// Shared between the Hono server and the React client. Type-only (no runtime code).
// Timestamps are Unix epoch milliseconds. Import everywhere with `import type`.

export type SmartView = 'all' | 'unread' | 'starred';

/** A subscribed feed (DB row, booleans/dates normalized for JSON). */
export interface Feed {
  id: number;
  feedUrl: string;
  siteUrl: string | null;
  title: string;
  description: string | null;
  lastFetchedAt: number | null;
  /** null when the last fetch succeeded; error message otherwise. */
  fetchError: string | null;
  createdAt: number;
}

/** Feed plus the counts the sidebar needs. */
export interface FeedWithCounts extends Feed {
  unreadCount: number;
  totalCount: number;
}

/** Full article, including sanitized body — used by the reader pane. */
export interface Item {
  id: number;
  feedId: number;
  /** Resolved feed title, denormalized for convenience in the reader. */
  feedTitle: string;
  guid: string | null;
  link: string | null;
  title: string;
  author: string | null;
  /** Server-sanitized HTML; safe to render directly. */
  contentHtml: string;
  summary: string | null;
  publishedAt: number;
  fetchedAt: number;
  isRead: boolean;
  isStarred: boolean;
}

/** Lightweight item for the article list (no full body). */
export interface ItemSummary {
  id: number;
  feedId: number;
  feedTitle: string;
  title: string;
  author: string | null;
  link: string | null;
  summary: string | null;
  publishedAt: number;
  isRead: boolean;
  isStarred: boolean;
}

/* ---------- Request payloads ---------- */

export interface AddFeedRequest {
  url: string;
}

export interface ListItemsQuery {
  feedId?: number;
  view?: SmartView;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface PatchItemRequest {
  isRead?: boolean;
  isStarred?: boolean;
}

export interface MarkAllReadRequest {
  feedId?: number;
  /** all | unread | starred are all valid mark-all-read scopes. */
  view?: SmartView;
}

export interface ImportOpmlRequest {
  /** Used when posting as application/json instead of a raw OPML body. */
  opml: string;
}

/* ---------- Response payloads ---------- */

export interface ViewTotals {
  all: number;
  unread: number;
  starred: number;
}

export interface ListFeedsResponse {
  feeds: FeedWithCounts[];
  totals: ViewTotals;
}

export interface AddFeedResponse {
  feed: FeedWithCounts;
}

export interface RefreshFeedResponse {
  feed: FeedWithCounts;
  newItems: number;
}

export interface RefreshAllResponse {
  feeds: FeedWithCounts[];
  refreshed: number;
  failed: number;
  newItems: number;
}

export interface ListItemsResponse {
  items: ItemSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface GetItemResponse {
  item: Item;
}

export interface PatchItemResponse {
  item: ItemSummary;
}

export interface MarkAllReadResponse {
  updated: number;
}

export interface ImportOpmlResponse {
  added: number;
  skipped: number;
  failed: number;
  feeds: FeedWithCounts[];
}

export interface ApiError {
  error: {
    message: string;
    code?: string;
  };
}
