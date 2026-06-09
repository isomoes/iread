// src/server/db.ts
// Opens the node:sqlite DatabaseSync at DB_PATH, applies PRAGMAs, runs the v1
// schema bootstrap behind a schema_meta version gate (all inside a transaction),
// and exports the db handle plus typed row-access helpers.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = process.env.DB_PATH ?? 'data/iread.db';

// Resolve to an absolute path and ensure the containing directory exists
// (DatabaseSync will not create intermediate directories on its own).
const dbPath = resolve(process.cwd(), DB_PATH);
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

// Connection PRAGMAs. WAL keeps readers from erroring during writes;
// foreign_keys ON enforces ON DELETE CASCADE; busy_timeout avoids spurious
// SQLITE_BUSY under concurrent access.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

// ---------------------------------------------------------------------------
// Schema (v1)
// ---------------------------------------------------------------------------

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feeds (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_url        TEXT    NOT NULL UNIQUE,
  site_url        TEXT,
  title           TEXT    NOT NULL DEFAULT '',
  description     TEXT,
  etag            TEXT,
  last_modified   TEXT,
  last_fetched_at INTEGER,
  fetch_error     TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE TABLE IF NOT EXISTS items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id       INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  guid          TEXT,
  link          TEXT,
  title         TEXT    NOT NULL DEFAULT '(untitled)',
  author        TEXT,
  content_html  TEXT    NOT NULL DEFAULT '',
  summary       TEXT,
  published_at  INTEGER NOT NULL,
  fetched_at    INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  is_read       INTEGER NOT NULL DEFAULT 0 CHECK (is_read    IN (0,1)),
  is_starred    INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0,1)),
  dedup_key     TEXT    NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_feed_dedup ON items(feed_id, dedup_key);
CREATE INDEX IF NOT EXISTS idx_items_feed_pub ON items(feed_id, published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_items_pub      ON items(published_at DESC, id DESC);
`;

// ---------------------------------------------------------------------------
// Migration scaffold
// ---------------------------------------------------------------------------
// schema_meta('schema_version') holds an integer string. On startup we read it;
// if absent we run the v1 bootstrap and seed it to '1'. Future migrations are an
// ordered list applied in ascending order while currentVersion < target, each in
// its own transaction. MVP ships v1 only.

interface Migration {
  version: number;
  up(database: DatabaseSync): void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up(database) {
      database.exec(SCHEMA_V1);
    },
  },
];

const TARGET_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

function readSchemaVersion(): number {
  // schema_meta may not exist yet on a fresh database.
  try {
    const row = db
      .prepare(`SELECT value FROM schema_meta WHERE key = 'schema_version'`)
      .get() as { value: string } | undefined;
    if (!row) return 0;
    const n = Number.parseInt(row.value, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function setSchemaVersion(version: number): void {
  db.prepare(
    `INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(version));
}

function migrate(): void {
  const current = readSchemaVersion();
  if (current >= TARGET_VERSION) return;

  db.exec('BEGIN');
  try {
    for (const migration of MIGRATIONS) {
      if (migration.version > current) {
        migration.up(db);
        setSchemaVersion(migration.version);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

migrate();

// ---------------------------------------------------------------------------
// Typed row-access helpers
// ---------------------------------------------------------------------------
// node:sqlite returns plain objects keyed by column name; these interfaces type
// the raw DB rows so feed-service can map them to the camelCase DTOs.

export interface FeedRow {
  id: number;
  feed_url: string;
  site_url: string | null;
  title: string;
  description: string | null;
  etag: string | null;
  last_modified: string | null;
  last_fetched_at: number | null;
  fetch_error: string | null;
  created_at: number;
}

export interface FeedRowWithCounts extends FeedRow {
  unread_count: number;
  total_count: number;
}

export interface ItemRow {
  id: number;
  feed_id: number;
  guid: string | null;
  link: string | null;
  title: string;
  author: string | null;
  content_html: string;
  summary: string | null;
  published_at: number;
  fetched_at: number;
  is_read: number;
  is_starred: number;
  dedup_key: string;
}

/** ItemRow joined with the owning feed's title (denormalized for the reader/list). */
export interface ItemRowWithFeed extends ItemRow {
  feed_title: string;
}

// A bound SQL parameter. node:sqlite accepts these primitive types.
export type SqlParam = null | number | bigint | string | Uint8Array;

/** Run a SELECT and return all rows typed as T (node:sqlite returns plain objects). */
export function queryAll<T>(sql: string, ...params: SqlParam[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

/** Run a SELECT and return the first row typed as T, or undefined. */
export function queryGet<T>(sql: string, ...params: SqlParam[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

/** Run a write statement; returns rows changed and the last inserted rowid (as number). */
export function run(sql: string, ...params: SqlParam[]): { changes: number; lastInsertRowid: number } {
  const res = db.prepare(sql).run(...params);
  return { changes: Number(res.changes), lastInsertRowid: Number(res.lastInsertRowid) };
}

/**
 * Run `fn` inside a single transaction. Commits on success, rolls back if `fn`
 * throws (rethrowing the original error). node:sqlite is synchronous so this is
 * a plain try/catch around BEGIN/COMMIT/ROLLBACK.
 */
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Total number of row changes since the connection opened (for newItems delta). */
export function totalChanges(): number {
  const row = db.prepare('SELECT total_changes() AS n').get() as { n: number };
  return row.n;
}
