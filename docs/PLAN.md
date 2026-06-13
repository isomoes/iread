# iread — Engineering Plan (Single Source of Truth)

A concise, local, single-user RSS/Atom reader inspired by newsboat. Keyboard-first three-pane UI, TypeScript end-to-end. This document is the authoritative build spec: the SQLite schema, feed-service design, and the HTTP API contract here are exactly what the frontend (see docs/DESIGN.md) consumes. Field names below match the react-query plan in DESIGN.md byte-for-byte.

---

## 1. Overview & Feature Scope

### In scope (newsboat parity essence, concise)

- Add feed by URL (resolves title from feed metadata), delete feed.
- Refresh one feed (`r`) / refresh all feeds (`R`). Refresh is user-initiated only; there is no background scheduler.
- Feed list (sidebar) with per-feed unread counts plus global smart-view totals.
- Smart views: All / Unread / Starred, applied across the article list. Per-feed selection.
- Article list: title, source feed, read/unread indicator, relative time, star indicator. Lightweight rows (no body).
- Reader pane: title, author, date, server-sanitized HTML body, open-original external link.
- Mark read / unread; auto-mark-read on open (default on). Mark-all-read for the current feed or view.
- Star / unstar.
- Live text search/filter over title plus summary in the current view.
- Full keyboard navigation (the primary interaction model).
- OPML import (bulk add) and OPML export.
- Light / dark / system theme (client-only, persisted to localStorage; not stored server-side).
- Local SQLite persistence at `data/iread.db`.

### Out of scope (deliberate cut line)

- No auth, no multi-user, no accounts. The DB file is the trust boundary.
- No cloud sync, no hosted backend.
- No podcast / enclosure media player (we keep the original link only).
- No tagging, no filter-rules engine, no saved-search macros.
- No full-text article extraction or readability scraping (we render only the feed-provided sanitized body).
- No background auto-refresh daemon, no notifications, no per-feed refresh intervals. Client-side polling refreshes local data only; it never triggers remote re-fetching.
- No feed folders or category hierarchy, no drag reordering, no per-feed rename UI. Flat feed list.
- No infinite-scroll tuning, no service worker, no PWA, no offline mode.

---

## 2. Repository File Tree

Vite root is `src/web/` so `index.html` sits beside the React app. The server is `src/server/`. Shared types live in `src/shared/`. The server build (`tsc`) emits to `dist/server/` with `src/shared` co-compiled to `dist/shared/`. The web build (`vite build`) emits to `dist/web/`. In production a single Hono process serves the API plus the static web bundle with SPA fallback.

```
iread/
├── package.json                  # Single root manifest: scripts, deps, devDeps (Section 3).
├── pnpm-lock.yaml                # pnpm lockfile (generated).
├── tsconfig.json                 # Base config + project references to the two project configs.
├── tsconfig.server.json          # TS build for src/server + src/shared -> dist (emits JS).
├── tsconfig.web.json             # TS config for src/web (noEmit; Vite transpiles, tsc type-checks).
├── vite.config.ts                # Vite: root=src/web, react + tailwind plugins, /api proxy, outDir (Section 4).
├── .gitignore                    # node_modules, dist, data/*.db, .env, logs.
├── .env.example                  # Documents PORT (default 8787) and DB_PATH (default data/iread.db).
├── README.md                     # What it is, install, dev, build, usage, shortcuts.
│
├── data/
│   └── .gitkeep                  # Keeps the dir in git; iread.db created here at runtime (gitignored).
│
└── src/
    ├── shared/
    │   └── types.ts              # Shared, type-only DTOs (Section 6) used by server + web.
    │
    ├── server/
    │   ├── index.ts              # Hono entry: wires routes, port 8787, static + SPA fallback (prod), starts node-server.
    │   ├── db.ts                 # node:sqlite DatabaseSync: open DB, run schema/migrations, register sha256 fn, PRAGMAs.
    │   ├── feed-service.ts       # Domain logic: add/delete/refresh, fetch+parse+sanitize+dedup, list/mark/star/search.
    │   ├── sanitize.ts           # sanitize-html config + sanitizeArticleHtml() + toPlainText() (summary).
    │   ├── ssrf.ts               # URL guard: scheme allowlist + private/loopback/link-local IP blocking, per-redirect.
    │   ├── fetch-feed.ts         # Streaming, size-capped, conditional-GET fetch of a feed URL.
    │   ├── opml.ts               # OPML import (DTD-rejecting parse -> feed URLs) and export (feeds -> OPML XML).
    │   └── routes/
    │       ├── feeds.ts          # /api/feeds: list, add, delete, refresh-one, refresh-all.
    │       ├── items.ts          # /api/items: list, get, patch (read/star), mark-all-read.
    │       └── opml.ts           # /api/opml: export (GET), import (POST).
    │
    └── web/
        ├── index.html            # Vite HTML entry; inline blocking theme script (anti-FOUC); mounts #root.
        ├── main.tsx              # React bootstrap: QueryClientProvider, theme init, imports globals.css + fonts.
        ├── App.tsx               # Three-pane layout, global keyboard handler, view/selection state.
        │
        ├── components/
        │   ├── Sidebar.tsx
        │   ├── SmartViews.tsx
        │   ├── AddFeedForm.tsx
        │   ├── FeedRow.tsx
        │   ├── RefreshAllButton.tsx
        │   ├── ArticleList.tsx
        │   ├── ArticleRow.tsx
        │   ├── ReaderPane.tsx
        │   ├── Toolbar.tsx
        │   ├── SearchBox.tsx
        │   ├── ThemeToggle.tsx
        │   ├── HelpOverlay.tsx
        │   ├── KbdHint.tsx
        │   ├── Toast.tsx
        │   ├── ListSkeleton.tsx
        │   ├── ReaderSkeleton.tsx
        │   ├── EmptyState.tsx
        │   ├── ErrorState.tsx
        │   ├── UnreadDot.tsx
        │   ├── Badge.tsx
        │   ├── OpmlMenu.tsx
        │   └── RelativeTime.tsx
        │
        ├── hooks/
        │   ├── useFeeds.ts        # React Query: list feeds, add, delete, refresh one/all.
        │   ├── useItems.ts        # React Query: list items, get one, patch read/star, mark-all-read.
        │   ├── useKeyboardNav.ts  # Global single-key bindings with typing/modifier guard.
        │   ├── useTheme.ts        # light/dark/system, localStorage, prefers-color-scheme.
        │   ├── useUiStore.ts      # Local UI state (selection, search text, autoRefresh, helpOpen).
        │   └── useOpml.ts         # Import (upload) + export (download).
        │
        ├── lib/
        │   ├── api.ts            # Typed fetch client over /api/* (uses shared types); JSON error handling.
        │   └── time.ts          # relativeTime() formatter.
        │
        └── styles/
            └── globals.css      # Tailwind v4 entry, theme tokens, @fontsource imports, base type (see DESIGN.md).
```

---

## 3. package.json (ready to paste)

React is pinned to 18 per the locked stack. `@vitejs/plugin-react@6` supports React 18; verify the pairing during the first dependency install and downgrade the plugin to `^4` if any incompatibility surfaces (the rest of the stack is unaffected). `node:sqlite` types ship with `@types/node`; there is no separate `@types` package. The `start` and `dev:server` scripts pass `--disable-warning=ExperimentalWarning` so `node:sqlite` does not spam the logs.

```json
{
  "name": "iread",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "dev": "concurrently -n server,web -c blue,magenta \"pnpm dev:server\" \"pnpm dev:web\"",
    "dev:server": "tsx watch --disable-warning=ExperimentalWarning src/server/index.ts",
    "dev:web": "vite",
    "build": "pnpm build:server && pnpm build:web",
    "build:server": "tsc -p tsconfig.server.json",
    "build:web": "vite build",
    "start": "NODE_ENV=production node --disable-warning=ExperimentalWarning dist/server/index.js",
    "typecheck": "tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.web.json --noEmit",
    "preview": "vite preview",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@fontsource-variable/geist": "^5.2.9",
    "@fontsource-variable/geist-mono": "^5.2.8",
    "@hono/node-server": "^2.0.4",
    "@phosphor-icons/react": "^2.1.10",
    "@tanstack/react-query": "^5.101.0",
    "fast-xml-parser": "^5.2.5",
    "hono": "^4.12.25",
    "motion": "^12.40.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "rss-parser": "^3.13.0",
    "sanitize-html": "^2.17.4"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.0",
    "@types/node": "^24.10.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@types/sanitize-html": "^2.16.1",
    "@vitejs/plugin-react": "^6.0.2",
    "concurrently": "^10.0.3",
    "tailwindcss": "^4.3.0",
    "tsx": "^4.22.4",
    "typescript": "^6.0.3",
    "vite": "^8.0.16"
  }
}
```

`fast-xml-parser` is added (over the original four docs) specifically to parse OPML safely with DOCTYPE/entity processing disabled (see Section 5 and the OPML route). `rss-parser` remains the feed parser.

---

## 4. Build / Config Blocks (ready to paste)

### vite.config.ts

```ts
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Repo-root config; Vite root is src/web so index.html sits beside the app.
const webRoot = fileURLToPath(new URL('./src/web', import.meta.url))
const distWeb = fileURLToPath(new URL('./dist/web', import.meta.url))

export default defineConfig({
  root: webRoot,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: distWeb,
    emptyOutDir: true,
    sourcemap: true,
  },
})
```

### tsconfig.json (base, project references)

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.server.json" },
    { "path": "./tsconfig.web.json" }
  ],
  "compilerOptions": {
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### tsconfig.server.json (server + shared, emits to dist)

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "declaration": false,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/server/**/*.ts", "src/shared/**/*.ts"]
}
```

Note: `rootDir: ./src` + `outDir: ./dist` means the server emits to `dist/server/index.js` and shared to `dist/shared/`. From the emitted `dist/server/index.js`, the web bundle is at `../web` (see Section 8, static serving).

### tsconfig.web.json (web, type-check only)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["vite/client"],
    "jsx": "react-jsx",
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/web/**/*.ts", "src/web/**/*.tsx", "src/shared/**/*.ts", "vite.config.ts"]
}
```

MANDATORY for all build agents (review fix #14): `verbatimModuleSyntax: true` is enabled on both projects. Because `src/shared/types.ts` is type-only, every import of those types anywhere (`lib/api.ts`, hooks, routes, services) MUST use `import type { ... }`. A plain `import { Feed }` is a hard compile error under this flag. Mixed value/type imports must use inline `import { foo, type Bar }`.

---

## 5. Feed Service Design

Module: `src/server/feed-service.ts` with helpers in `fetch-feed.ts`, `sanitize.ts`, `ssrf.ts`. Responsibilities: validate and guard the URL, fetch politely with a streaming size cap and conditional GET, parse RSS and Atom, sanitize bodies, derive fields, dedup, persist with state-preserving upsert, and capture errors per feed.

### 5.1 URL guard (SSRF, review fix #4)

`src/server/ssrf.ts` exports `assertSafeFeedUrl(url: string)` and is enforced in MVP, not deferred. It is applied before the initial fetch on add, before every refresh fetch, and for every OPML-imported `xmlUrl`.

- Reject any scheme other than `http`/`https`.
- Resolve the hostname (`dns.lookup`, all addresses) and reject if any resolved address is loopback, link-local, private, unique-local, or unspecified: `127.0.0.0/8`, `::1`, `0.0.0.0`, `169.254.0.0/16`, `fe80::/10`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`, plus `100.64.0.0/10` (CGNAT).
- Reject literal-IP hosts in those same ranges without DNS.
- Follow redirects manually (`redirect: 'manual'`) and re-run the IP check on each hop's `Location` before fetching it. A redirect cap of 5 hops applies. This closes the redirect-to-private-IP bypass; a redirect count limit alone is not protection.

### 5.2 Fetch (streaming, size cap, conditional GET) — review fixes #5, #13

`src/server/fetch-feed.ts`:

```ts
const USER_AGENT = 'iread/1.0 (+local RSS reader)'
const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

interface FetchInput { feedUrl: string; etag: string | null; lastModified: string | null }
type FetchResult =
  | { kind: 'notModified' }
  | { kind: 'ok'; xml: string; etag: string | null; lastModified: string | null }

async function fetchFeed(input: FetchInput): Promise<FetchResult> {
  // assertSafeFeedUrl + manual redirect loop (max 5 hops), re-checking each hop.
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.1',
    }
    if (input.etag) headers['If-None-Match'] = input.etag
    if (input.lastModified) headers['If-Modified-Since'] = input.lastModified

    const res = await fetchWithGuardedRedirects(input.feedUrl, { headers, signal: ctrl.signal })
    if (res.status === 304) return { kind: 'notModified' }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

    // Fast reject on advertised Content-Length (untrusted but cheap).
    const cl = Number(res.headers.get('content-length'))
    if (Number.isFinite(cl) && cl > MAX_BYTES) throw new Error(`feed too large (${cl} bytes)`)

    // STREAM the body, aborting once the cumulative size exceeds the cap.
    // Do NOT buffer the whole response before checking (the original arrayBuffer() approach
    // OOMs before the check ever runs).
    const reader = res.body!.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BYTES) { ctrl.abort(); throw new Error(`feed too large (> ${MAX_BYTES} bytes)`) }
      chunks.push(value)
    }
    const xml = new TextDecoder('utf-8').decode(concat(chunks, total))
    return {
      kind: 'ok',
      xml,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
    }
  } finally {
    clearTimeout(t)
  }
}
```

Conditional GET is best-effort politeness; correctness never depends on it. CRITICAL (review fix #13): the new `etag`/`lastModified` are persisted ONLY inside the same transaction as a fully successful parse-and-upsert. If anything after the 200 fails (parse, sanitize, DB), the validators are left unchanged (or null) so the feed cannot get permanently stuck behind a 304 for a body that was never ingested.

### 5.3 Parse (single path) — review fix #6

There is exactly one parse path: own `fetch` (for conditional GET + size cap) then `parser.parseString(xml)`. `rss-parser` handles RSS 2.0 and Atom transparently. The `Parser` constructor does NOT set `timeout`/`headers` (dead config when using `parseString`).

```ts
import Parser from 'rss-parser'

const parser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['dc:creator', 'dcCreator'],
      ['updated', 'atomUpdated'],
    ],
  },
})
const parsed = await parser.parseString(xml)
```

Content selection (no redundant `item['content:encoded']`, since it is already mapped to `contentEncoded`):

```ts
const rawContent = item.contentEncoded ?? item.content ?? item.summary ?? ''
const author = item.creator ?? item.dcCreator ?? item.author ?? null
```

### 5.4 Sanitize (server-side, before storing) — review fix nice-to-haves on data: and exclusiveFilter

`src/server/sanitize.ts`. Bodies are sanitized before they touch the DB, so stored `content_html` is already safe and the client renders it via `dangerouslySetInnerHTML` without re-sanitizing.

```ts
import sanitizeHtml from 'sanitize-html'

export const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1','h2','h3','h4','h5','h6',
    'p','blockquote','pre','code',
    'ul','ol','li','dl','dt','dd',
    'a','b','i','strong','em','mark','small','sub','sup','u','s','span','br','hr',
    'img','figure','figcaption',
    'table','thead','tbody','tfoot','tr','th','td','caption',
    'video','audio','source',
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
  // Raster data: images only. NO data: svg (can carry script in some renderers).
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
}

// Additional pass after sanitize-html: strip data: image URLs that are not raster.
// Allowed: data:image/png|jpeg|jpg|gif|webp. Everything else (notably data:image/svg+xml) removed.
export function sanitizeArticleHtml(raw: string): string { /* sanitizeHtml(raw, SANITIZE_OPTS) then SVG-data strip */ }

export function toPlainText(raw: string): string {
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} })
}
```

`script`/`style`/`iframe`/`object`/`form` are excluded from `allowedTags` (discarded), and `nonTextTags` ensures `script`/`style`/`iframe`/`noscript` text content is removed too. The no-op `exclusiveFilter: () => false` from the original draft is removed. `data:image/svg+xml` is stripped in the second pass.

Summary for the list view: `summary = toPlainText(item.contentSnippet ?? rawContent).trim().slice(0, 280)`.

### 5.5 Derive publishedAt — review fix #3

Renamed `derivePublishedAt` (the original `deriverPublishedAt` was a typo).

```ts
function derivePublishedAt(item: any): number {
  for (const c of [item.isoDate, item.pubDate, item.atomUpdated, item.updated]) {
    if (!c) continue
    const ms = Date.parse(c)
    if (!Number.isNaN(ms)) return ms
  }
  return Date.now() // last resort
}
```

### 5.6 Dedup key — review fixes #2, #3

`dedup_key` is ALWAYS computed in JavaScript and bound as a parameter. `sha256` is never called as a SQL function (`node:sqlite` has no such builtin; calling it throws). The synthetic fallback NEVER includes a volatile value such as `Date.now()` (that would change the key every fetch and accumulate duplicate rows). It hashes only stable content:

```ts
import { createHash } from 'node:crypto'

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

// guid, then link, then a STABLE synthetic hash of title + feedUrl (never a timestamp).
const guid = item.guid ?? item.id ?? null
const link = item.link ?? null
const dedupKey = guid ?? link ?? sha256(`${item.title ?? ''} ${feedUrl}`)
```

Documented consequence: a dateless, guid-less, link-less item anchors to its first-seen `publishedAt` (`Date.now()` at first fetch) and keeps that anchor across refreshes, because the upsert never updates `published_at`. This is intentional and stable; duplicates do not accumulate.

### 5.7 Persist: counting new items + state-preserving upsert — review fix #1

The original single `INSERT ... ON CONFLICT DO UPDATE` could not distinguish inserts from updates, because `node:sqlite` reports a change on every conflict-update and `total_changes()` cannot tell them apart. We split it into two statements inside one transaction:

1. Insert-or-ignore to count true inserts:

```sql
INSERT INTO items
  (feed_id, guid, link, title, author, content_html, summary, published_at, dedup_key)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(feed_id, dedup_key) DO NOTHING;
```

`newItems` is computed as the delta of `db.prepare('SELECT total_changes() AS n').get()` taken before and after the per-item loop (verified: `DO NOTHING` adds 0 on conflict, 1 on insert).

2. Update mutable content fields for existing rows (preserving user state and ordering anchor):

```sql
UPDATE items SET
  title        = ?,
  author       = ?,
  content_html = ?,
  summary      = ?,
  link         = ?
WHERE feed_id = ? AND dedup_key = ?;
-- intentionally NOT touching: published_at, fetched_at, is_read, is_starred, guid
```

This makes re-fetch idempotent for state: read/starred flags and ordering survive; displayed content updates if the source edited the article.

Feed row on success (inside the same transaction, only after parse+upsert succeed):

```sql
UPDATE feeds SET
  title = COALESCE(NULLIF(?, ''), title),
  site_url = ?, description = ?,
  etag = ?, last_modified = ?,
  last_fetched_at = ?, fetch_error = NULL
WHERE id = ?;
```

### 5.8 Error capture

Any failure (guard rejection, network, timeout, too-large, parse) is caught and recorded on the feed: `UPDATE feeds SET last_fetched_at = ?, fetch_error = ? WHERE id = ?`. The validators (`etag`/`last_modified`) are not advanced on failure. `POST /api/feeds/refresh` iterates all feeds, tallies `refreshed`/`failed`/`newItems`, and always returns 200; one failed feed never aborts the loop or fails the request. Adding a feed is the one place a parse failure surfaces as an HTTP error (422), because there is no existing row to attach the error to.

---

## 6. SQLite Schema (complete, final)

`node:sqlite` `DatabaseSync`. Run on startup in `src/server/db.ts`: set PRAGMAs, register the `sha256` JS function only if needed (dedup is computed in JS, so registration is optional and not relied upon), then run the bootstrap inside a transaction. Booleans are `INTEGER` 0/1. Timestamps are Unix epoch milliseconds (`INTEGER`).

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Seed once: INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('schema_version', '1');

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
  content_html  TEXT    NOT NULL DEFAULT '',   -- ALREADY sanitized before insert
  summary       TEXT,                          -- short plaintext snippet for the list view
  published_at  INTEGER NOT NULL,              -- epoch ms (derived; dateless items anchor to first-seen)
  fetched_at    INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  is_read       INTEGER NOT NULL DEFAULT 0 CHECK (is_read    IN (0,1)),
  is_starred    INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0,1)),
  dedup_key     TEXT    NOT NULL               -- guid ?? link ?? sha256(title + '\0' + feed_url), computed in JS
);

-- One logical item per feed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_feed_dedup ON items(feed_id, dedup_key);

-- Hot query paths. Review fix #12: the low-cardinality is_read / is_starred
-- leading indexes were dropped (near-useless, never matched the real queries).
CREATE INDEX IF NOT EXISTS idx_items_feed_pub ON items(feed_id, published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_items_pub      ON items(published_at DESC, id DESC);
```

The `id` tiebreaker is now part of the composite indexes so they fully cover the `ORDER BY published_at DESC, id DESC`. Substring search (`q`) is a deliberate scan over `title`/`summary` for this local, small dataset; FTS5 is out of scope and noted as a future option.

### Migration

`schema_meta('schema_version')` holds an integer string. At startup, read it; if missing, run the v1 bootstrap above in a transaction and set it to `'1'`. Future migrations are an ordered array of `{ version, up(db) }` applied in transactions while `currentVersion < target`, bumping `schema_meta` after each. MVP ships v1 only; the table exists so additive migrations never require a manual reset.

---

## 7. HTTP API Contract (complete, final)

Base path `/api`. Request and response bodies are `application/json` unless noted. Timestamps are epoch ms (numbers). Booleans are JSON booleans. Field names are camelCase and match `src/shared/types.ts` and the DESIGN.md react-query plan exactly.

Uniform error shape:

```json
{ "error": { "message": "human readable", "code": "OPTIONAL_CODE" } }
```

Standard statuses: `200` ok, `201` created, `204` no content, `400` bad input, `404` not found, `409` duplicate feedUrl, `422` unparseable feed on add, `500` unexpected. The `view` enum across endpoints is `all | unread | starred`.

CRITICAL routing (review fix #15): all `/api/*` routes are registered first. An unknown `/api/*` path returns a JSON 404 in the error shape above, never the SPA `index.html`. The SPA fallback applies only to non-`/api` GET requests.

### Feeds

GET `/api/feeds` — list feeds with unread counts.
- Query: none.
- 200: `ListFeedsResponse` = `{ feeds: FeedWithCounts[], totals: { all, unread, starred } }`. `feeds` sorted by `title` ASC, case-insensitive. `totals` are global counts driving the smart views.

POST `/api/feeds` — add feed by URL (fetches immediately).
- Body: `AddFeedRequest` = `{ "url": string }`.
- Behavior: validate URL (SSRF guard), insert feed row, do initial fetch+parse+store synchronously in a transaction.
- 201: `AddFeedResponse` = `{ feed: FeedWithCounts }`.
- 400 invalid or unsafe URL; 409 if `feedUrl` already exists; 422 if the URL fetched but did not parse as a feed (row rolled back, not persisted).

DELETE `/api/feeds/:id` — delete feed (cascades to items).
- 204 no body. 404 if unknown id.

POST `/api/feeds/:id/refresh` — refresh one feed.
- 200: `RefreshFeedResponse` = `{ feed: FeedWithCounts, newItems: number }` (`newItems` = rows truly inserted). 404 unknown id. A fetch failure returns 200 with `feed.fetchError` set and `newItems: 0` (failure is data, not an HTTP error).

POST `/api/feeds/refresh` — refresh all feeds.
- 200: `RefreshAllResponse` = `{ feeds: FeedWithCounts[], refreshed, failed, newItems }`. Never fails because one feed errored.

### Items

GET `/api/items` — list item summaries (the article list).
- Query: `feedId?` (number), `view?` (`all|unread|starred`, default `all`), `q?` (string, case-insensitive substring on title + summary), `limit?` (number, default 50, max 200), `offset?` (number, default 0).
- 200: `ListItemsResponse` = `{ items: ItemSummary[], total, limit, offset }`. Ordered `published_at DESC, id DESC`. `total` is the count matching the filter.

GET `/api/items/:id` — full item for the reader pane.
- 200: `GetItemResponse` = `{ item: Item }` (includes sanitized `contentHtml`). 404 unknown.

PATCH `/api/items/:id` — update read/starred state.
- Body: `PatchItemRequest` = `{ "isRead"?: boolean, "isStarred"?: boolean }` (any non-empty subset).
- 200: `PatchItemResponse` = `{ item: ItemSummary }`. 400 if body empty or invalid; 404 unknown.

POST `/api/items/mark-all-read` — mark a scope as read. Review fix #7: `starred` is an accepted scope.
- Body: `MarkAllReadRequest` = `{ "feedId"?: number, "view"?: "all" | "unread" | "starred" }`.
- Semantics: if `feedId` is present, mark every item of that feed read (optionally further constrained by `view`); otherwise mark every item in the given `view` read. `view: 'all'` and `view: 'unread'` mark the same set (reading sets `is_read = 1`); `view: 'starred'` marks all currently-starred items read. An empty body marks the global All set read.
- 200: `MarkAllReadResponse` = `{ updated: number }`.

### OPML

GET `/api/opml` — export.
- 200, `Content-Type: text/x-opml; charset=utf-8`, `Content-Disposition: attachment; filename="iread.opml"`. Body is OPML 2.0 XML, one `<outline type="rss" text title xmlUrl=feed_url htmlUrl=site_url />` per feed.

POST `/api/opml` — import. Review fix #11: parse safely.
- Content-Type `application/xml` or `text/x-opml` (raw OPML body) or `application/json` `{ "opml": string }` (`ImportOpmlRequest`).
- Parsing: `fast-xml-parser` configured to NOT process DTDs/DOCTYPE and NOT expand entities (blocks XXE and billion-laughs). Input size is capped (e.g. 5 MB). On parse failure: 400.
- Behavior: collect all `outline` elements with `xmlUrl`; dedup the URLs within the file first (so two identical `xmlUrl`s do not collide on the UNIQUE index mid-transaction); run each through the SSRF guard; insert feeds not already present (dedup on `feedUrl`); skip duplicates. Initial fetch of each new feed is best-effort (failures recorded in `fetchError`; import still succeeds). Sequential or small-concurrency.
- 200: `ImportOpmlResponse` = `{ added, skipped, failed, feeds: FeedWithCounts[] }`. 400 if OPML cannot be parsed or exceeds the size cap.

On-disk mirror (`opml-sync.ts`). The subscription set is also mirrored to a plain `feeds.opml` file on disk so it is always ready to share or back up without hitting the API. The mirror is written by `syncOpmlMirror()` (which feeds `listFeedsForExport()` through the same `exportOpml`) after every operation that changes the feed set or its metadata — `addFeed`, `deleteFeed`, `importFeeds`, `refreshFeed`, `refreshAll` — and once at startup. It is a one-way snapshot (DB → file); the DB stays the source of truth, and importing is still explicit via `POST /api/opml`. The write is atomic (write to `<path>.tmp`, then rename) and best-effort: any failure is logged and swallowed so it never fails the feed operation. The path is `$OPML_PATH` if set (an empty value disables the mirror), otherwise `feeds.opml` next to the database file (`dbPath`); the containing directory is created if needed.

### Static / SPA (prod)

Non-`/api` GET routes serve `dist/web` static assets with SPA fallback to `index.html`. Details in Section 8.

---

## 8. Shared Types — src/shared/types.ts (ready to paste)

```ts
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
```

---

## 9. Dev / Build / Start: Scripts, Proxy, Static SPA

### Dev

`pnpm dev` runs `concurrently`:
- `dev:server`: `tsx watch` runs `src/server/index.ts` on port 8787, restarting on server-file changes.
- `dev:web`: `vite` serves `src/web` on port 5173 with HMR.
- The Vite dev server proxies `/api` to `http://localhost:8787` (`changeOrigin: true`), so the browser only ever talks to 5173 and there are no CORS concerns. Open the Vite URL (5173).

### Build

`pnpm build` = `build:server` then `build:web`:
- `build:server`: `tsc -p tsconfig.server.json` compiles `src/server` + `src/shared` to `dist/server/` and `dist/shared/`.
- `build:web`: `vite build` bundles `src/web` to `dist/web/` (empties first, sourcemaps on).

### Start (production)

`pnpm start` runs `node dist/server/index.js` with `NODE_ENV=production`. One Hono process:
1. Registers all `/api/*` routes first.
2. Unknown `/api/*` returns JSON 404 (never HTML).
3. Serves static files from `dist/web` via `@hono/node-server`'s `serveStatic`. Because the emitted entry is `dist/server/index.js` and the web bundle is `dist/web/`, the static root is `../web` relative to the emitted server file. `serveStatic` resolves within that root only (no `../` path traversal escapes it).
4. SPA fallback: any non-`/api` GET that does not match a static file returns `dist/web/index.html`.

Open `http://localhost:8787`. `PORT` and `DB_PATH` are read from env (`.env.example` documents defaults 8787 and `data/iread.db`).

---

## 10. Security / Robustness

- SQL injection: parameterized queries only. Every query uses `db.prepare(sql)` with `?` placeholders and bound values; no string interpolation of user input into SQL. Dynamic filters (`view`, `q`, `feedId`) append fixed `WHERE` fragments and push bound params into an array; the SQL text never contains user data. `limit`/`offset` are coerced to integers and clamped (max 200 / min 0) before binding.
- XSS: all feed HTML is sanitized server-side (Section 5.4) before it touches the DB, so stored `content_html` is already safe. The client renders it via `dangerouslySetInnerHTML` without re-sanitizing. `script`/`style`/`iframe`/`object`/`form`, inline event handlers, `javascript:` URLs, and `data:image/svg+xml` are stripped; links are forced `target="_blank" rel="noopener noreferrer nofollow"`. Feed `title`/`author`/`summary` are stored as plaintext (sanitized with `allowedTags: []`) and rendered as React text (auto-escaped).
- SSRF (review fix #4): enforced in MVP, not deferred. `assertSafeFeedUrl` rejects non-http(s) schemes and resolves+blocks loopback/link-local/private/CGNAT/unique-local ranges before fetch, and re-validates every redirect hop via manual redirect handling (max 5). Applies to add, refresh, and every OPML-imported URL. A redirect-count cap alone is not protection; destination validation per hop is what matters.
- Large-feed handling (review fix #5): the body is read incrementally from the response stream and the fetch is aborted the moment cumulative bytes exceed `MAX_BYTES` (10 MB). `Content-Length`, when present, is a fast pre-reject. The response is never fully buffered before the size check. Item list endpoints are always paginated (default 50, max 200) and backed by composite indices, so the DB never returns unbounded result sets. The list uses `ItemSummary` (no body); full `contentHtml` is fetched per item on demand.
- XXE / entity expansion (review fix #11): OPML is parsed with `fast-xml-parser` configured to reject DOCTYPE and not expand entities, with an input size cap. OPML URLs are deduped within the file and SSRF-guarded before any fetch.
- Conditional-GET integrity (review fix #13): `etag`/`last_modified` are persisted only inside the transaction of a fully successful parse+upsert, so a parse failure after a 200 can never strand a feed behind a permanent 304.
- Graceful fetch failures: a failing fetch/parse never crashes a request; the message is written to `feeds.fetch_error`, `last_fetched_at` is still updated, and the feed stays in the list (UI shows an error badge). `POST /api/feeds/refresh` tallies and always returns 200. Adding a feed is the one place a parse failure surfaces as 422.
- Transactions and integrity: each refresh and OPML import runs in a transaction (rollback on throw) so partial writes never leave half-imported state. `ON DELETE CASCADE` + `PRAGMA foreign_keys = ON` removes a feed's items on delete. WAL + `busy_timeout` keep readers from erroring during writes.
- Synchronous DB caveat (acknowledged): `node:sqlite` (`DatabaseSync`) is fully synchronous, so a large refresh transaction blocks the event loop and stalls concurrent HTTP requests for its duration. Acceptable for a single-user local app. Large refreshes should chunk their work (commit per feed in refresh-all) to keep individual transactions short.
- Routing safety (review fix #15): `/api/*` is registered before the static/SPA handler; unknown API paths return JSON 404; `serveStatic` is rooted at `../web` and cannot be traversed out of.

---

## 11. Implementation Handoff Checklist

- Use `import type` for every type import from `src/shared/types.ts` (verbatimModuleSyntax).
- Compute `dedup_key` in JS only; never call `sha256` in SQL; never hash a timestamp.
- Count `newItems` via the `total_changes()` delta around the `INSERT ... DO NOTHING` loop, then a separate content `UPDATE`.
- Stream-cap the fetch body; do not `arrayBuffer()` first.
- Persist conditional-GET validators only on full success.
- Enforce the SSRF guard on add, refresh, and OPML URLs, per redirect hop.
- Parse OPML with DTD/entity processing disabled.
- Register `/api/*` before the SPA fallback; JSON 404 for unknown API paths.
- Mark-all-read accepts `all | unread | starred`.
- `index.html` carries an inline blocking theme script (see DESIGN.md) to prevent FOUC.
