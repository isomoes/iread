# iread

A concise, local, single-user RSS/Atom reader inspired by newsboat. Keyboard-first three-pane UI, TypeScript end to end. You add feeds by URL, refresh them on demand, and read server-sanitized article bodies in a calm, terminal-quiet reading surface with light, dark, and system themes.

There is no auth, no multi-user, no cloud sync, and no background scheduler. Refresh is always user-initiated. All data lives in a single local SQLite file — by default `~/.config/iread/iread.db` — which is the trust boundary.

![iread UI](https://github.com/user-attachments/assets/ca9489c9-630f-4a67-9cd5-60c18ce3544e)

📺 Watch the [v0.2.2 intro video](https://www.bilibili.com/video/BV1cmJg6SEso/) on Bilibili.

## Quick start

```sh
npx @isomoes/iread
```

Then open http://localhost:8787. Requires Node.js 24 or newer (the server uses the built-in `node:sqlite` module). Data is stored in `~/.config/iread/iread.db` (`$XDG_CONFIG_HOME` is honored).

```
Usage: iread [options]

Options:
  -p, --port <port>  Port to listen on (default: $PORT or 8787)
      --db <path>    SQLite database file
                     (default: $DB_PATH or ~/.config/iread/iread.db)
      --opml <path>  OPML file auto-saved on every subscription change
                     (default: $OPML_PATH or feeds.opml next to the database;
                     pass "" to disable)
  -v, --version      Print the version and exit
  -h, --help         Show this help and exit
```

## Features

- Add a feed by URL (title resolved from feed metadata), delete a feed.
- Refresh one feed (`r`) or refresh all feeds (`R`).
- Sidebar feed list with per-feed unread counts plus global smart-view totals.
- Smart views: All, Unread, Starred, applied across the article list, with per-feed selection.
- Article list with read/unread indicator, source feed, relative time, and star indicator.
- Reader pane with title, author, date, server-sanitized HTML body, and open-original link.
- Mark read/unread, auto-mark-read on open (and, on desktop, when you move on from a viewed item), mark-all-read for the current feed or view.
- Star and unstar.
- Live case-insensitive search over title plus summary in the current view.
- Full keyboard navigation as the primary interaction model.
- OPML import (bulk add) and OPML export, plus an always-current `feeds.opml` auto-saved next to the database on every change for quick sharing and backup. The auto-saved file is a one-way snapshot of the database (overwritten on every change and at startup), so use it for backup and sharing — to bring feeds in, use OPML import.
- Light, dark, and system theme, persisted to localStorage.

## Usage

1. Start the app (dev or production) and open it in your browser.
2. Add a feed by pasting its RSS or Atom URL into the add-feed form in the sidebar, or import an OPML file from the OPML menu. A `config/sample-feeds.opml` file is included for a quick start, and [`isomoes/arch-config/iread/feeds.opml`](https://github.com/isomoes/arch-config/blob/master/iread/feeds.opml) is a real-world example (the feed set isomoes actually reads) you can import directly.
3. Select a feed or a smart view (All, Unread, Starred) in the sidebar.
4. Navigate the article list with `j` and `k`, open an article with `Enter`, and read it in the right pane.
5. Press `r` to refresh the current feed or `R` to refresh all feeds. Refresh fetches remote feeds; client polling only refreshes local data and never re-fetches remotely.
6. Star with `s`, toggle read with `m`, mark a whole scope read with `A`, and search with `/`.
7. Press `?` at any time to see the full keyboard map. Press `t` to cycle the theme.

## Keyboard shortcuts

Keys are case-sensitive (Shift matters). Bindings fire only when you are not typing in an input and no Ctrl, Meta, or Alt modifier is held.

| Key           | Action               | Effect                                                                                                                                                                                            |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `j` / Down    | Down in focused pane | Pane-contextual: move the article selection (list), the feed/view selection (sidebar), or the reader scroll down one. Stops at the end (no wrap).                                                  |
| `k` / Up      | Up in focused pane   | As `j`, upward. Stops at the start.                                                                                                                                                               |
| `n`           | Next unread          | Jump to the next unread item below; wrap to the first unread from the top if none below.                                                                                                          |
| `g`           | Top                  | Pane-contextual: in the list, select the first item; in the sidebar, jump to the first feed/view; in the reader, scroll the article to the top.                                                   |
| `G`           | Bottom               | Pane-contextual: in the list, select the last item; in the sidebar, jump to the last feed/view; in the reader, scroll the article to the bottom.                                                  |
| `Enter` / `o` | Open / focus reader  | Render the selected item, mark it read, and move focus into the reader.                                                                                                                           |
| `J` / `]`     | Next feed/view       | Move sidebar selection down and load its items, selecting the first one.                                                                                                                          |
| `K` / `[`     | Previous feed/view   | Move sidebar selection up and load its items.                                                                                                                                                     |
| `m`           | Toggle read/unread   | Flip the read state of the selected item; counts update.                                                                                                                                          |
| `s`           | Toggle star          | Flip the starred state; in the Starred view an unstarred item leaves the list.                                                                                                                    |
| `A`           | Mark feed/view read  | Mark the current scope read and offer an Undo toast.                                                                                                                                              |
| `r`           | Refresh current feed | Refresh the selected feed, or the feed of the selected article in a smart view.                                                                                                                   |
| `R`           | Refresh all feeds    | Refresh every feed and update counts on completion.                                                                                                                                               |
| `v`           | Open original        | Open the article link in a new tab.                                                                                                                                                               |
| `#` then N    | Open link by number  | Links in the article body are numbered inline `[N]`; press `#`, type the number, and it opens in a new tab — instantly once the number is unambiguous, otherwise `Enter` confirms; `Esc` cancels. |
| `/`           | Focus search         | Focus and select the search input.                                                                                                                                                                |
| `Esc`         | Contextual dismiss   | Close help, clear search, or return focus from the reader to the list.                                                                                                                            |
| `?`           | Help overlay         | Toggle the keybinding overlay.                                                                                                                                                                    |
| `t`           | Toggle theme         | Cycle light, dark, and system theme; persisted.                                                                                                                                                   |

## Project layout

- `src/shared/` shared, type-only DTOs used by both server and web.
- `src/server/` Hono API, SQLite access, feed fetch/parse/sanitize, OPML, SSRF guard.
- `src/web/` React app: three-pane layout, hooks, components, styles.
- `data/` development SQLite database (gitignored); production data lives in `~/.config/iread/`.

## Requirements (development)

- Node.js 24 or newer (the server uses the built-in `node:sqlite` module).
- pnpm.

### Install

```sh
pnpm install
```

### Develop

```sh
pnpm dev
```

This runs two processes with `concurrently`:

- The API server on port 8787 (`tsx watch src/server/index.ts`).
- The Vite dev server on port 5173 with HMR.

Vite proxies `/api` to `http://localhost:8787`, so the browser only ever talks to 5173 and there are no CORS concerns.

In development (`NODE_ENV` is not `production`) the database defaults to `data/iread.db` inside the repo (gitignored), so dev experiments never touch your real `~/.config/iread` data.

Open http://localhost:5173

## Build and start (production)

```sh
pnpm build
pnpm start
```

- `pnpm build` compiles the server to `dist/server/` (with shared types in `dist/shared/`) and bundles the web app to `dist/web/`.
- `pnpm start` runs a single Hono process that serves the API and the static web bundle with SPA fallback.

Open http://localhost:8787

`PORT` (default 8787), `DB_PATH` (default `~/.config/iread/iread.db`), and `OPML_PATH` (default `feeds.opml` next to the database; set empty to disable the auto-saved mirror) are read from the environment. See `config/.env.example`.
