# iread

A concise, local, single-user RSS/Atom reader inspired by newsboat. Keyboard-first three-pane UI, TypeScript end to end. You add feeds by URL, refresh them on demand, and read server-sanitized article bodies in a calm, terminal-quiet reading surface with light, dark, and system themes.

There is no auth, no multi-user, no cloud sync, and no background scheduler. Refresh is always user-initiated. All data lives in a local SQLite file at `data/iread.db`, which is the trust boundary.

## Features

- Add a feed by URL (title resolved from feed metadata), delete a feed.
- Refresh one feed (`r`) or refresh all feeds (`R`).
- Sidebar feed list with per-feed unread counts plus global smart-view totals.
- Smart views: All, Unread, Starred, applied across the article list, with per-feed selection.
- Article list with read/unread indicator, source feed, relative time, and star indicator.
- Reader pane with title, author, date, server-sanitized HTML body, and open-original link.
- Mark read/unread, auto-mark-read on open, mark-all-read for the current feed or view.
- Star and unstar.
- Live case-insensitive search over title plus summary in the current view.
- Full keyboard navigation as the primary interaction model.
- OPML import (bulk add) and OPML export.
- Light, dark, and system theme, persisted to localStorage.

## Requirements

- Node.js 24 or newer (the server uses the built-in `node:sqlite` module).
- pnpm.

## Install

```sh
pnpm install
```

## Develop

```sh
pnpm dev
```

This runs two processes with `concurrently`:

- The API server on port 8787 (`tsx watch src/server/index.ts`).
- The Vite dev server on port 5173 with HMR.

Vite proxies `/api` to `http://localhost:8787`, so the browser only ever talks to 5173 and there are no CORS concerns.

Open http://localhost:5173

## Build and start (production)

```sh
pnpm build
pnpm start
```

- `pnpm build` compiles the server to `dist/server/` (with shared types in `dist/shared/`) and bundles the web app to `dist/web/`.
- `pnpm start` runs a single Hono process that serves the API and the static web bundle with SPA fallback.

Open http://localhost:8787

`PORT` (default 8787) and `DB_PATH` (default `data/iread.db`) are read from the environment. See `.env.example`.

## Usage

1. Start the app (dev or production) and open it in your browser.
2. Add a feed by pasting its RSS or Atom URL into the add-feed form in the sidebar, or import an OPML file from the OPML menu. A `sample-feeds.opml` file is included for a quick start.
3. Select a feed or a smart view (All, Unread, Starred) in the sidebar.
4. Navigate the article list with `j` and `k`, open an article with `Enter`, and read it in the right pane.
5. Press `r` to refresh the current feed or `R` to refresh all feeds. Refresh fetches remote feeds; client polling only refreshes local data and never re-fetches remotely.
6. Star with `s`, toggle read with `m`, mark a whole scope read with `A`, and search with `/`.
7. Press `?` at any time to see the full keyboard map. Press `t` to cycle the theme.

## Keyboard shortcuts

Keys are case-sensitive (Shift matters). Bindings fire only when you are not typing in an input and no Ctrl, Meta, or Alt modifier is held.

| Key | Action | Effect |
|---|---|---|
| `j` / Down | Next article | Move selection down one row. Stops at the last item (no wrap). |
| `k` / Up | Previous article | Move selection up one row. Stops at the first item. |
| `n` | Next unread | Jump to the next unread item below; wrap to the first unread from the top if none below. |
| `g` | Top | Select the first item and scroll to the top. |
| `G` | Bottom | Select the last item and scroll to the bottom. |
| `Enter` / `o` | Open / focus reader | Render the selected item, mark it read, and move focus into the reader. |
| `J` / `]` | Next feed/view | Move sidebar selection down and load its items, selecting the first one. |
| `K` / `[` | Previous feed/view | Move sidebar selection up and load its items. |
| `m` | Toggle read/unread | Flip the read state of the selected item; counts update. |
| `s` | Toggle star | Flip the starred state; in the Starred view an unstarred item leaves the list. |
| `A` | Mark feed/view read | Mark the current scope read and offer an Undo toast. |
| `r` | Refresh current feed | Refresh the selected feed, or the feed of the selected article in a smart view. |
| `R` | Refresh all feeds | Refresh every feed and update counts on completion. |
| `v` | Open original | Open the article link in a new tab. |
| `/` | Focus search | Focus and select the search input. |
| `Esc` | Contextual dismiss | Close help, clear search, or return focus from the reader to the list. |
| `?` | Help overlay | Toggle the keybinding overlay. |
| `t` | Toggle theme | Cycle light, dark, and system theme; persisted. |

## Project layout

- `src/shared/` shared, type-only DTOs used by both server and web.
- `src/server/` Hono API, SQLite access, feed fetch/parse/sanitize, OPML, SSRF guard.
- `src/web/` React app: three-pane layout, hooks, components, styles.
- `data/` runtime SQLite database (gitignored).
