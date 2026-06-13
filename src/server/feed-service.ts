// src/server/feed-service.ts
// Domain logic: add/delete/refresh feeds, fetch+parse+sanitize+dedup+persist with
// a state-preserving upsert, and list/get/patch/mark items. All queries are
// parameterized; DB rows are mapped to the camelCase DTOs in shared/types.ts.
// (PLAN Sections 5, 7)

import { createHash } from 'node:crypto';
import Parser from 'rss-parser';
import type {
  Feed,
  FeedWithCounts,
  Item,
  ItemSummary,
  ListFeedsResponse,
  ListItemsQuery,
  ListItemsResponse,
  MarkAllReadRequest,
  PatchItemRequest,
  SmartView,
  ViewTotals,
} from '../shared/types.js';
import {
  db,
  transaction,
  totalChanges,
  queryAll,
  queryGet,
  run,
  type SqlParam,
  type FeedRow,
  type FeedRowWithCounts,
  type ItemRowWithFeed,
} from './db.js';
import { fetchFeed } from './fetch-feed.js';
import { assertSafeFeedUrl } from './ssrf.js';
import { sanitizeArticleHtml, toPlainText } from './sanitize.js';
import { writeOpmlSnapshot } from './opml-sync.js';

const SUMMARY_MAX = 280;
const LIMIT_DEFAULT = 50;
const LIMIT_MAX = 200;

// ---------------------------------------------------------------------------
// Errors (carry an HTTP-ish code the routes map to a status)
// ---------------------------------------------------------------------------

export type ServiceErrorCode =
  | 'BAD_INPUT'
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'UNPARSEABLE'
  | 'UNSAFE_URL';

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ServiceError';
  }
}

// ---------------------------------------------------------------------------
// rss-parser (single parse path; constructor sets no timeout/headers since we
// only call parseString)
// ---------------------------------------------------------------------------

interface ParsedItemExtra {
  contentEncoded?: string;
  dcCreator?: string;
  atomUpdated?: string;
}

// Widened view of a parsed item with every field parseAndPrepare reads. Some of
// these (author, id, updated) are not in rss-parser's published Item type.
interface ParsedItem extends ParsedItemExtra {
  guid?: string;
  id?: string;
  link?: string;
  title?: string;
  author?: string;
  creator?: string;
  content?: string;
  summary?: string;
  contentSnippet?: string;
  isoDate?: string;
  pubDate?: string;
  updated?: string;
}

const parser = new Parser<Record<string, unknown>, ParsedItemExtra>({
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['dc:creator', 'dcCreator'],
      ['updated', 'atomUpdated'],
    ],
  },
});

// ---------------------------------------------------------------------------
// Row -> DTO mappers
// ---------------------------------------------------------------------------

function mapFeed(row: FeedRow): Feed {
  return {
    id: row.id,
    feedUrl: row.feed_url,
    siteUrl: row.site_url,
    title: row.title,
    description: row.description,
    lastFetchedAt: row.last_fetched_at,
    fetchError: row.fetch_error,
    createdAt: row.created_at,
  };
}

function mapFeedWithCounts(row: FeedRowWithCounts): FeedWithCounts {
  return {
    ...mapFeed(row),
    unreadCount: row.unread_count,
    totalCount: row.total_count,
  };
}

function mapItem(row: ItemRowWithFeed): Item {
  return {
    id: row.id,
    feedId: row.feed_id,
    feedTitle: row.feed_title,
    guid: row.guid,
    link: row.link,
    title: row.title,
    author: row.author,
    contentHtml: row.content_html,
    summary: row.summary,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    isRead: row.is_read === 1,
    isStarred: row.is_starred === 1,
  };
}

function mapItemSummary(row: ItemRowWithFeed): ItemSummary {
  return {
    id: row.id,
    feedId: row.feed_id,
    feedTitle: row.feed_title,
    title: row.title,
    author: row.author,
    link: row.link,
    summary: row.summary,
    publishedAt: row.published_at,
    isRead: row.is_read === 1,
    isStarred: row.is_starred === 1,
  };
}

// ---------------------------------------------------------------------------
// Derivation helpers (PLAN 5.5, 5.6)
// ---------------------------------------------------------------------------

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function derivePublishedAt(item: {
  isoDate?: string;
  pubDate?: string;
  atomUpdated?: string;
  updated?: string;
}): number {
  for (const c of [item.isoDate, item.pubDate, item.atomUpdated, item.updated]) {
    if (!c) continue;
    const ms = Date.parse(c);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now(); // last resort; anchors a dateless item to first-seen time
}

// ---------------------------------------------------------------------------
// Feed counts query (reused by list + per-feed responses)
// ---------------------------------------------------------------------------

const FEED_COUNTS_SELECT = `
  SELECT
    f.id, f.feed_url, f.site_url, f.title, f.description, f.etag, f.last_modified,
    f.last_fetched_at, f.fetch_error, f.created_at,
    COALESCE(SUM(CASE WHEN i.is_read = 0 THEN 1 ELSE 0 END), 0) AS unread_count,
    COALESCE(COUNT(i.id), 0) AS total_count
  FROM feeds f
  LEFT JOIN items i ON i.feed_id = f.id
`;

function getFeedWithCounts(id: number): FeedWithCounts | null {
  const row = queryGet<FeedRowWithCounts>(
    `${FEED_COUNTS_SELECT} WHERE f.id = ? GROUP BY f.id`,
    id,
  );
  return row ? mapFeedWithCounts(row) : null;
}

function computeTotals(): ViewTotals {
  const row = queryGet<{ all_count: number; unread_count: number; starred_count: number }>(
    `SELECT
       COUNT(*) AS all_count,
       COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) AS unread_count,
       COALESCE(SUM(CASE WHEN is_starred = 1 THEN 1 ELSE 0 END), 0) AS starred_count
     FROM items`,
  )!;
  return { all: row.all_count, unread: row.unread_count, starred: row.starred_count };
}

// ---------------------------------------------------------------------------
// listFeeds (PLAN 7 GET /api/feeds)
// ---------------------------------------------------------------------------

export function listFeeds(): ListFeedsResponse {
  const rows = queryAll<FeedRowWithCounts>(
    `${FEED_COUNTS_SELECT} GROUP BY f.id ORDER BY f.title COLLATE NOCASE ASC, f.id ASC`,
  );
  return {
    feeds: rows.map(mapFeedWithCounts),
    totals: computeTotals(),
  };
}

// ---------------------------------------------------------------------------
// Ingest: parse XML + sanitize + dedup + state-preserving upsert (PLAN 5.3-5.7)
// Returns the count of truly-new items. Runs inside the caller's transaction.
// ---------------------------------------------------------------------------

interface IngestResult {
  feedMeta: {
    title: string;
    siteUrl: string | null;
    description: string | null;
  };
}

const INSERT_ITEM = `
  INSERT INTO items
    (feed_id, guid, link, title, author, content_html, summary, published_at, dedup_key)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(feed_id, dedup_key) DO NOTHING
`;

const UPDATE_ITEM = `
  UPDATE items SET
    title        = ?,
    author       = ?,
    content_html = ?,
    summary      = ?,
    link         = ?
  WHERE feed_id = ? AND dedup_key = ?
`;

// One item's derived, ready-to-bind fields.
interface PreparedItem {
  guid: string | null;
  link: string | null;
  title: string;
  author: string | null;
  contentHtml: string;
  summary: string | null;
  publishedAt: number;
  dedupKey: string;
}

/**
 * Parse + sanitize a feed body. Returns the derived feed metadata and a
 * SYNCHRONOUS `commit(feedId)` closure that performs the dedup upsert and returns
 * the count of truly-new items. The async parse/sanitize work runs here (no DB);
 * the caller runs `commit` inside a transaction so node:sqlite never awaits
 * mid-transaction. (PLAN 5.3-5.7)
 */
async function parseAndPrepare(feedUrl: string, xml: string): Promise<{
  feedMeta: IngestResult['feedMeta'];
  commit(feedId: number): number;
}> {
  const parsed = await parser.parseString(xml);

  const feedMeta = {
    title: (parsed.title ?? '').toString(),
    siteUrl: parsed.link ?? null,
    description: parsed.description ?? null,
  };

  // Derive + sanitize every item first (pure work, no DB).
  const prepared: PreparedItem[] = (parsed.items ?? []).map((raw) => {
    // rss-parser's Item type omits several fields we read (author, id, updated),
    // so widen it locally; all reads are optional/guarded.
    const item = raw as ParsedItem;
    const rawContent = item.contentEncoded ?? item.content ?? item.summary ?? '';
    const author = item.creator ?? item.dcCreator ?? item.author ?? null;
    const guid = item.guid ?? item.id ?? null;
    const link = item.link ?? null;
    const title = (item.title ?? '(untitled)').toString();
    return {
      guid,
      link,
      title,
      author: author === null || author === undefined ? null : String(author),
      contentHtml: sanitizeArticleHtml(rawContent),
      summary:
        toPlainText(item.contentSnippet ?? rawContent).trim().slice(0, SUMMARY_MAX) || null,
      publishedAt: derivePublishedAt(item),
      // guid, then link, then a STABLE synthetic hash of title + feedUrl (never a timestamp).
      dedupKey: guid ?? link ?? sha256(`${title}\0${feedUrl}`),
    };
  });

  function commit(feedId: number): number {
    // Pass 1: INSERT ... DO NOTHING for every item, measuring the total_changes()
    // delta around the loop. DO NOTHING adds 0 on conflict and 1 on a real insert,
    // so the delta is exactly the number of truly-new rows.
    const insertStmt = db.prepare(INSERT_ITEM);
    const before = totalChanges();
    for (const p of prepared) {
      insertStmt.run(
        feedId,
        p.guid,
        p.link,
        p.title,
        p.author,
        p.contentHtml,
        p.summary,
        p.publishedAt,
        p.dedupKey,
      );
    }
    const newItems = totalChanges() - before;

    // Pass 2: UPDATE mutable content for existing rows (idempotent for state:
    // preserves published_at, fetched_at, is_read, is_starred, guid).
    const updateStmt = db.prepare(UPDATE_ITEM);
    for (const p of prepared) {
      updateStmt.run(p.title, p.author, p.contentHtml, p.summary, p.link, feedId, p.dedupKey);
    }

    return newItems;
  }

  return { feedMeta, commit };
}

// ---------------------------------------------------------------------------
// refreshFeed (PLAN 5.2, 5.7, 5.8; route POST /api/feeds/:id/refresh)
// ---------------------------------------------------------------------------
// Fetch + parse + upsert. On full success, persist content, feed metadata, and
// the new etag/last_modified validators inside ONE transaction. On any failure
// (guard, network, timeout, too-large, parse) record the error on the feed and
// leave the validators unchanged. Returns the updated feed plus newItems.

interface RefreshOutcome {
  feed: FeedWithCounts;
  newItems: number;
  ok: boolean;
}

const UPDATE_FEED_ON_SUCCESS = `
  UPDATE feeds SET
    title = COALESCE(NULLIF(?, ''), title),
    site_url = ?, description = ?,
    etag = ?, last_modified = ?,
    last_fetched_at = ?, fetch_error = NULL
  WHERE id = ?
`;

async function refreshFeedRow(row: FeedRow): Promise<RefreshOutcome> {
  const now = Date.now();
  try {
    const result = await fetchFeed({
      feedUrl: row.feed_url,
      etag: row.etag,
      lastModified: row.last_modified,
    });

    if (result.kind === 'notModified') {
      // 304: nothing changed. Update last_fetched_at and clear any prior error.
      db.prepare(
        `UPDATE feeds SET last_fetched_at = ?, fetch_error = NULL WHERE id = ?`,
      ).run(now, row.id);
      return { feed: getFeedWithCounts(row.id)!, newItems: 0, ok: true };
    }

    // Parse + sanitize OUTSIDE the transaction (async, CPU work, no DB). Only the
    // synchronous DB writes (commit) run inside the transaction so node:sqlite
    // never awaits mid-transaction. CRITICAL (review fix #13): the new
    // etag/last_modified are persisted only here, after a fully successful
    // parse+upsert.
    const { feedMeta, commit } = await parseAndPrepare(row.feed_url, result.xml);

    const newItems = transaction(() => {
      const inserted = commit(row.id);
      db.prepare(UPDATE_FEED_ON_SUCCESS).run(
        feedMeta.title,
        feedMeta.siteUrl,
        feedMeta.description,
        result.etag,
        result.lastModified,
        now,
        row.id,
      );
      return inserted;
    });

    return { feed: getFeedWithCounts(row.id)!, newItems, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(`UPDATE feeds SET last_fetched_at = ?, fetch_error = ? WHERE id = ?`).run(
      now,
      message,
      row.id,
    );
    return { feed: getFeedWithCounts(row.id)!, newItems: 0, ok: false };
  }
}

function getFeedRow(id: number): FeedRow | undefined {
  return queryGet<FeedRow>(`SELECT * FROM feeds WHERE id = ?`, id);
}

/** Refresh one feed by id. 404 (NOT_FOUND) if the id is unknown; a fetch failure
 *  is data, not an error (returns the feed with fetchError set, newItems 0). */
export async function refreshFeed(id: number): Promise<{ feed: FeedWithCounts; newItems: number }> {
  const row = getFeedRow(id);
  if (!row) throw new ServiceError('NOT_FOUND', 'Feed not found.');
  const outcome = await refreshFeedRow(row);
  syncOpmlMirror();
  return { feed: outcome.feed, newItems: outcome.newItems };
}

/** Refresh every feed sequentially. Never fails because one feed errored;
 *  tallies refreshed/failed/newItems and returns the full updated feed list. */
export async function refreshAll(): Promise<{
  feeds: FeedWithCounts[];
  refreshed: number;
  failed: number;
  newItems: number;
}> {
  const rows = queryAll<FeedRow>(`SELECT * FROM feeds ORDER BY id ASC`);
  let refreshed = 0;
  let failed = 0;
  let newItems = 0;

  // Sequential, one transaction per feed (commit per feed keeps each transaction
  // short on the synchronous DB; one failure never aborts the loop).
  for (const row of rows) {
    try {
      const outcome = await refreshFeedRow(row);
      if (outcome.ok) refreshed += 1;
      else failed += 1;
      newItems += outcome.newItems;
    } catch {
      // refreshFeedRow already records its own errors; this guards against any
      // unexpected throw so the loop always completes.
      failed += 1;
    }
  }

  syncOpmlMirror();
  return { feeds: listFeeds().feeds, refreshed, failed, newItems };
}

// ---------------------------------------------------------------------------
// addFeed (PLAN 7 POST /api/feeds)
// ---------------------------------------------------------------------------
// Validate URL (SSRF guard), insert the feed row, then do the initial
// fetch+parse+store synchronously. On parse failure the whole thing rolls back
// and surfaces as 422 (there is no existing row to attach the error to).

export async function addFeed(url: string): Promise<FeedWithCounts> {
  const trimmed = (url ?? '').trim();
  if (!trimmed) throw new ServiceError('BAD_INPUT', 'A feed URL is required.');

  // SSRF guard up front (also validates scheme + resolvability).
  try {
    await assertSafeFeedUrl(trimmed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unsafe or invalid URL.';
    throw new ServiceError('UNSAFE_URL', message);
  }

  // Reject a duplicate before doing any network work.
  const existing = queryGet<{ id: number }>(`SELECT id FROM feeds WHERE feed_url = ?`, trimmed);
  if (existing) throw new ServiceError('DUPLICATE', 'That feed is already subscribed.');

  // Fetch + parse BEFORE touching the DB so a bad feed never leaves a row behind.
  let fetchResult;
  try {
    fetchResult = await fetchFeed({ feedUrl: trimmed, etag: null, lastModified: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ServiceError('UNPARSEABLE', `Could not fetch the feed: ${message}`);
  }
  if (fetchResult.kind === 'notModified') {
    // No validators were sent, so a 304 here is anomalous; treat as unparseable.
    throw new ServiceError('UNPARSEABLE', 'The server returned 304 with no prior validators.');
  }

  let prepared;
  try {
    prepared = await parseAndPrepare(trimmed, fetchResult.xml);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ServiceError('UNPARSEABLE', `That URL did not parse as a feed: ${message}`);
  }

  const now = Date.now();
  const feedId = transaction(() => {
    // INSERT may still race a concurrent add; the UNIQUE constraint protects us.
    const ins = run(`INSERT INTO feeds (feed_url, last_fetched_at) VALUES (?, ?)`, trimmed, now);
    const id = ins.lastInsertRowid;

    prepared.commit(id);
    db.prepare(UPDATE_FEED_ON_SUCCESS).run(
      prepared.feedMeta.title,
      prepared.feedMeta.siteUrl,
      prepared.feedMeta.description,
      fetchResult.etag,
      fetchResult.lastModified,
      now,
      id,
    );
    return id;
  });

  const feed = getFeedWithCounts(feedId);
  if (!feed) throw new ServiceError('NOT_FOUND', 'Feed disappeared after insert.');
  syncOpmlMirror();
  return feed;
}

// ---------------------------------------------------------------------------
// deleteFeed (PLAN 7 DELETE /api/feeds/:id) — cascades to items via FK.
// ---------------------------------------------------------------------------

export function deleteFeed(id: number): void {
  const res = run(`DELETE FROM feeds WHERE id = ?`, id);
  if (res.changes === 0) throw new ServiceError('NOT_FOUND', 'Feed not found.');
  syncOpmlMirror();
}

// ---------------------------------------------------------------------------
// listItems (PLAN 7 GET /api/items) — dynamic WHERE built from fixed fragments
// with bound params only; limit/offset coerced + clamped before binding.
// ---------------------------------------------------------------------------

const ITEM_SELECT = `
  SELECT
    i.id, i.feed_id, i.guid, i.link, i.title, i.author, i.content_html, i.summary,
    i.published_at, i.fetched_at, i.is_read, i.is_starred, i.dedup_key,
    f.title AS feed_title
  FROM items i
  JOIN feeds f ON f.id = i.feed_id
`;

function buildItemFilters(query: ListItemsQuery): { where: string; params: SqlParam[] } {
  const clauses: string[] = [];
  const params: SqlParam[] = [];

  if (typeof query.feedId === 'number' && Number.isFinite(query.feedId)) {
    clauses.push('i.feed_id = ?');
    params.push(Math.trunc(query.feedId));
  }

  const view: SmartView = query.view ?? 'all';
  if (view === 'unread') {
    clauses.push('i.is_read = 0');
  } else if (view === 'starred') {
    clauses.push('i.is_starred = 1');
  }

  const q = (query.q ?? '').trim();
  if (q) {
    // Case-insensitive substring on title + summary. LIKE is case-insensitive for
    // ASCII; we lower() both sides and escape LIKE wildcards in the user term.
    const term = `%${q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    clauses.push("(lower(i.title) LIKE ? ESCAPE '\\' OR lower(COALESCE(i.summary, '')) LIKE ? ESCAPE '\\')");
    params.push(term, term);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

export function listItems(query: ListItemsQuery): ListItemsResponse {
  const limit = clampLimit(query.limit);
  const offset = clampOffset(query.offset);
  const { where, params } = buildItemFilters(query);

  const total = queryGet<{ n: number }>(
    `SELECT COUNT(*) AS n FROM items i ${where}`,
    ...params,
  )!.n;

  const rows = queryAll<ItemRowWithFeed>(
    `${ITEM_SELECT} ${where} ORDER BY i.published_at DESC, i.id DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );

  return { items: rows.map(mapItemSummary), total, limit, offset };
}

export function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return LIMIT_DEFAULT;
  const n = Math.trunc(raw);
  if (n < 1) return 1;
  if (n > LIMIT_MAX) return LIMIT_MAX;
  return n;
}

export function clampOffset(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return 0;
  const n = Math.trunc(raw);
  return n < 0 ? 0 : n;
}

// ---------------------------------------------------------------------------
// getItem (PLAN 7 GET /api/items/:id) — full item incl sanitized contentHtml.
// ---------------------------------------------------------------------------

export function getItem(id: number): Item {
  const row = queryGet<ItemRowWithFeed>(`${ITEM_SELECT} WHERE i.id = ?`, id);
  if (!row) throw new ServiceError('NOT_FOUND', 'Item not found.');
  return mapItem(row);
}

// ---------------------------------------------------------------------------
// patchItem (PLAN 7 PATCH /api/items/:id) — update read/starred state.
// ---------------------------------------------------------------------------

export function patchItem(id: number, patch: PatchItemRequest): ItemSummary {
  const sets: string[] = [];
  const params: SqlParam[] = [];

  if (typeof patch.isRead === 'boolean') {
    sets.push('is_read = ?');
    params.push(patch.isRead ? 1 : 0);
  }
  if (typeof patch.isStarred === 'boolean') {
    sets.push('is_starred = ?');
    params.push(patch.isStarred ? 1 : 0);
  }
  if (sets.length === 0) {
    throw new ServiceError('BAD_INPUT', 'Provide at least one of isRead or isStarred.');
  }

  const res = run(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  if (res.changes === 0) throw new ServiceError('NOT_FOUND', 'Item not found.');

  const row = queryGet<ItemRowWithFeed>(`${ITEM_SELECT} WHERE i.id = ?`, id)!;
  return mapItemSummary(row);
}

// ---------------------------------------------------------------------------
// markAllRead (PLAN 7 POST /api/items/mark-all-read) — scope = all|unread|starred
// optionally constrained to a feed. Marking always sets is_read = 1.
// ---------------------------------------------------------------------------

export function markAllRead(scope: MarkAllReadRequest): number {
  const clauses: string[] = ['is_read = 0']; // only count rows we actually flip
  const params: SqlParam[] = [];

  if (typeof scope.feedId === 'number' && Number.isFinite(scope.feedId)) {
    clauses.push('feed_id = ?');
    params.push(Math.trunc(scope.feedId));
  }

  // view 'all' and 'unread' mark the same set (reading sets is_read = 1);
  // 'starred' marks all currently-starred items read.
  if (scope.view === 'starred') {
    clauses.push('is_starred = 1');
  }

  const res = run(`UPDATE items SET is_read = 1 WHERE ${clauses.join(' AND ')}`, ...params);
  return res.changes;
}

// ---------------------------------------------------------------------------
// importFeeds (PLAN 7 POST /api/opml) — bulk add from a deduped URL list.
// ---------------------------------------------------------------------------
// Each URL is SSRF-guarded; feeds already present are skipped; new feeds are
// inserted and fetched best-effort (a fetch/parse failure is recorded in
// fetchError but the import still counts it as added, not failed). A guard
// rejection or insert race counts as failed.

export async function importFeeds(urls: string[]): Promise<{
  added: number;
  skipped: number;
  failed: number;
  feeds: FeedWithCounts[];
}> {
  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const url of urls) {
    const trimmed = url.trim();
    if (!trimmed) {
      failed += 1;
      continue;
    }

    // Skip duplicates (dedup on feedUrl) before any network work.
    const existing = queryGet<{ id: number }>(`SELECT id FROM feeds WHERE feed_url = ?`, trimmed);
    if (existing) {
      skipped += 1;
      continue;
    }

    // SSRF guard before fetching.
    try {
      await assertSafeFeedUrl(trimmed);
    } catch {
      failed += 1;
      continue;
    }

    // Insert the row first so an initial-fetch failure can be recorded against it
    // (import still succeeds; the feed shows an error badge in the UI).
    let feedId: number;
    try {
      feedId = run(`INSERT INTO feeds (feed_url) VALUES (?)`, trimmed).lastInsertRowid;
    } catch {
      // UNIQUE race or other insert error.
      failed += 1;
      continue;
    }

    added += 1;

    // Best-effort initial fetch; refreshFeedRow records its own errors and never
    // throws for fetch/parse failures.
    const row = getFeedRow(feedId);
    if (row) {
      try {
        await refreshFeedRow(row);
      } catch {
        // Already recorded on the feed; nothing more to do.
      }
    }
  }

  syncOpmlMirror();
  return { added, skipped, failed, feeds: listFeeds().feeds };
}

/** All feeds as plain Feed DTOs (for OPML export). */
export function listFeedsForExport(): Feed[] {
  const rows = queryAll<FeedRow>(`SELECT * FROM feeds ORDER BY title COLLATE NOCASE ASC, id ASC`);
  return rows.map(mapFeed);
}

export function syncOpmlMirror(): void {
  writeOpmlSnapshot(listFeedsForExport());
}
