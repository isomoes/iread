# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

iread — a local, single-user RSS/Atom reader (newsboat-inspired), TypeScript end to end. No auth, no cloud sync, no background scheduler — **refresh is always user-initiated**. All data lives in one SQLite file, the trust boundary. Default path is mode-dependent (`db.ts`): dev → repo-local `data/iread.db`; production (`NODE_ENV=production`: `pnpm start`, the npx CLI) → `~/.config/iread/iread.db`, honoring `$XDG_CONFIG_HOME`; `DB_PATH` overrides both. The subscription set is additionally mirrored to a plain `feeds.opml` next to the DB (a one-way DB→file snapshot for easy sharing/backup; `opml-sync.ts`, `$OPML_PATH` overrides the location, an empty value disables it) — the DB stays the source of truth and import is still explicit.

`docs/PLAN.md` (server/API/schema) and `docs/DESIGN.md` (UI/interaction) are the source of truth, referenced from code comments (e.g. "PLAN 5.7", "DESIGN Section 8"). Keep them in sync with non-trivial changes.

## Commands

- `pnpm dev` — API server (port 8787) + Vite dev server (port 5173, proxies `/api`). Open http://localhost:5173.
- `pnpm typecheck` — **the primary correctness gate** (no test suite, no linter). Run after changes.
- `pnpm build` / `pnpm start` — production: one Hono process serves the API + static bundle on 8787.
- `pnpm publish` — npm package; `prepack` runs the build, `files` ships only `dist/`, and the `iread` bin (`src/server/cli.ts` → `dist/server/cli.js`) is what `npx @isomoes/iread` runs (flags → `PORT`/`DB_PATH`/`OPML_PATH` env, defaults `NODE_ENV=production`). Web/React deps are devDependencies — keep server runtime imports limited to the five packages under `dependencies`.

Requires **Node ≥ 24** (built-in `node:sqlite`, no third-party driver); pnpm. Env: `PORT`, `DB_PATH`, `OPML_PATH` (see `config/.env.example`).

## Architecture

Three TypeScript projects under `src/`, each with its own tsconfig:

- `src/shared/types.ts` — **the contract**: type-only DTOs shared by server and web. Timestamps are epoch **milliseconds**; the server maps snake_case rows → camelCase DTOs. Field names match PLAN/DESIGN exactly — keep that parity.
- `src/server/` — Hono API + `node:sqlite` + feed fetch/parse/sanitize/SSRF.
- `src/web/` — React 18 + TanStack Query SPA.

### Server

`index.ts` → routers under `routes/` → `feed-service.ts` (all domain logic) → `db.ts`. Importing `db.ts` opens the DB and runs migrations (ordered `MIGRATIONS` list gated by `schema_meta.schema_version`; add new versions to the array).

- Routers are thin: validate input, call the service, map errors. The service throws `ServiceError`; `routes/helpers.ts` maps codes → HTTP statuses and the uniform `{ error: { message, code? } }` shape — every `/api` response uses it, including 404s, never HTML.
- Register static segments before parameterized ones (`/feeds/refresh` before `/feeds/:id/refresh`) so they aren't captured as an `:id`.

### Feed ingest (the core subtlety, in `feed-service.ts`)

`node:sqlite` is **synchronous** — no `await` mid-transaction. Async fetch+parse+sanitize happens first; `parseAndPrepare` returns a sync `commit(feedId)` closure the caller runs inside `transaction(...)`:

- Pass 1: `INSERT ... ON CONFLICT(feed_id, dedup_key) DO NOTHING`; the `total_changes()` delta = count of truly-new items.
- Pass 2: `UPDATE` mutable content for existing rows — deliberately preserves `published_at`, `fetched_at`, `is_read`, `is_starred`.
- `dedup_key` = `guid ?? link ?? sha256(title + feedUrl)` — never a timestamp, stable across fetches.

`etag`/`last_modified` validators persist **only after** a fully successful parse+upsert; on any failure the error is recorded on the feed row and validators stay unchanged — a failed refresh is data, not an exception. `refreshAll` is sequential, one transaction per feed; one failure never aborts the loop.

### Security boundaries (don't weaken these)

- `ssrf.ts` — scheme allowlist + DNS-resolved IP-range blocking (loopback/private/link-local/CGNAT/…), re-validated on every redirect hop (manual following, max 5). The connection is pinned to the pre-validated IPs via a custom `lookup` to close the DNS-rebinding/TOCTOU gap.
- `fetch-feed.ts` — streams and aborts past 10 MB; 15s timeout; conditional GET.
- `sanitize.ts` — article HTML is sanitized **before it touches the DB**; the client renders stored `content_html` with `dangerouslySetInnerHTML` without re-sanitizing. A second regex pass strips non-raster `data:` URLs.
- `opml.ts` — `processEntities: false` and rejection of any `<!DOCTYPE>` (XXE/billion-laughs).

### Web app

`App.tsx` is the controller: owns view/selection state, wires data hooks + keyboard nav, builds the `PaneState` objects `AppShell`'s three panes render against. Two deliberately separate state systems (DESIGN Section 8):

- **Server state**: TanStack Query, items keyed `['items', { view, q }]`. A cached entry is a **`ListItemsResponse` object, not a bare array** — patch `old.items` and `old.total`/`totals` together.
- **Local UI state**: `hooks/useUiStore.ts` — `useSyncExternalStore` store with an imperative `uiStore` API usable from keyboard-handler closures outside React.

**Optimistic mutations** (`hooks/useItems.ts`) are the trickiest part: `onMutate` patches every cached items view, and the membership logic **must mirror the server-side view filters exactly** (mark-read removes from Unread, unstar removes from Starred; unread counts and totals adjusted in lockstep). Changing server filter/scope rules means updating both sides.

**Keyboard nav** (`hooks/useKeyboardNav.ts`): one global `keydown` listener (stable via ref), case-sensitive keys, inert while typing in an input or with Ctrl/Meta/Alt held. `j`/`k` are **pane-contextual** (list selection, sidebar selection, or reader scroll). Key map lives in the README and `HelpOverlay`.

**Theming**: light/dark/system via `.dark`/`.theme-light` on `<html>`, persisted to localStorage; OKLCH tokens in `styles/globals.css` (Tailwind v4 `@theme`, no `tailwind.config.js`); an inline script in `index.html` sets the class pre-paint.

## Conventions

- **No code comments unless the user explicitly asks for them.** Keep existing comments (including PLAN/DESIGN references) intact, but never add new ones on your own.
- Server is ESM with `NodeNext` + `verbatimModuleSyntax`: relative imports use explicit `.js` extensions, type-only imports use `import type`. The web project uses the Bundler resolver.
- `noUncheckedIndexedAccess` is on in both projects — index access yields `T | undefined`.
- All SQL is parameterized; dynamic `WHERE`/`SET` clauses are built from fixed fragments with bound params; `limit`/`offset` are clamped before binding.
- The app version is the build-time `__APP_VERSION__` injection (see `vite.config.ts`), not a `package.json` import.
