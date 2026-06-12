# iread — UI & Interaction Design

DESIGN READ: A keyboard-first, terminal-quiet reading surface where a single calm-blue accent and mono-numeric meta do all the talking, and three panes breathe at density 6 without ever raising their voice.

This document is the UI source of truth. Every API field name referenced in the react-query plan (Section 8) matches docs/PLAN.md exactly: `feeds`, `totals`, `items`, `total`, `feedId`, `isRead`, `isStarred`, `unreadCount`, `totalCount`, `contentHtml`, `publishedAt`, `feedTitle`, `view`.

---

## Dials

- VISUAL_DENSITY: 6 (compact but breathing, terminal-adjacent).
- MOTION_INTENSITY: 3 (restrained, motivated, fast; transform and opacity only).
- ACCENT: single calm blue, `oklch(0.58 0.13 244)` light / `oklch(0.70 0.13 244)` dark. Chroma 0.13, well under the 80 percent saturation line; hue 244 is true blue, not purple.
- THEME: one model, light + dark + system, manual toggle, persisted to localStorage. Never pure #fff/#000 (zinc-50 / zinc-950).
- ICONS: `@phosphor-icons/react`, single `regular` weight, no hand-rolled SVG.
- TYPE: Geist Variable (UI/body), Geist Mono Variable (numbers/timestamps/kbd), self-hosted via @fontsource.

---

## 1. MVP Scope (UI)

In scope: add feed by URL, delete feed, refresh one (`r`) / refresh all (`R`), feed list with unread counts, smart views (All / Unread / Starred), article list with read/unread state plus published date, reader pane with server-sanitized content plus open-original link, mark read/unread, mark-all-read (`A`), star/unstar (`s`), search/filter (`/`), full keyboard navigation, OPML import/export, light/dark/system theme.

Out of scope: auth/multi-user, cloud sync, podcast/enclosure player, tagging rules engine, full-text extraction. We render only the feed-provided sanitized body.

---

## 2. Theme Tokens

A single accent drives selection, focus ring, primary action, and the unread indicator (newsboat-style: unread is the only live signal). All text passes AA; body passes AAA. Never pure white or black.

| Token | Light | Dark | Role / contrast |
|---|---|---|---|
| `--bg` | `oklch(0.985 0.002 247)` | `oklch(0.17 0.004 264)` | App canvas |
| `--surface` | `oklch(0.995 0.001 247)` | `oklch(0.205 0.004 264)` | Sidebar / list pane |
| `--surface-elevated` | `oklch(0.998 0.001 247)` | `oklch(0.245 0.005 264)` | Cards, popovers, toasts |
| `--border` | `oklch(0.92 0.003 247)` | `oklch(0.30 0.006 264)` | Pane dividers, row separators |
| `--text-primary` | `oklch(0.21 0.004 264)` | `oklch(0.96 0.002 247)` | Body. 15.8:1 / 15.1:1, AAA |
| `--text-secondary` | `oklch(0.44 0.006 264)` | `oklch(0.71 0.004 264)` | Title meta. 7.4:1 / 6.9:1, AA+ |
| `--text-muted` | `oklch(0.55 0.006 264)` | `oklch(0.60 0.005 264)` | Timestamps, counts. 4.7:1 / 4.8:1, AA |
| `--accent` | `oklch(0.58 0.13 244)` | `oklch(0.70 0.13 244)` | Selection, focus, primary, unread |
| `--accent-foreground` | `oklch(0.99 0.002 247)` | `oklch(0.17 0.01 264)` | Text on accent fill. >7:1 both |
| `--unread` | = `--accent` | = `--accent` | Semantic dot only |
| `--danger` | `oklch(0.55 0.18 27)` | `oklch(0.70 0.16 27)` | Error text/badge. AA both |
| `--focus-ring` | = `--accent` | = `--accent` | 2px ring + 2px offset |

### globals.css (ready to paste, Tailwind v4)

```css
@import "tailwindcss";

/* Self-hosted variable fonts (NOT a Google Fonts link) */
@import "@fontsource-variable/geist";
@import "@fontsource-variable/geist-mono";

@theme {
  --font-sans: "Geist Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono Variable", ui-monospace, "SF Mono", monospace;

  /* ONE radius scale */
  --radius-xs: 0.25rem;  /* 4px  - dots, tiny chips */
  --radius-sm: 0.375rem; /* 6px  - rows, inputs, badges */
  --radius-md: 0.5rem;   /* 8px  - buttons, cards */
  --radius-lg: 0.75rem;  /* 12px - popovers, toasts, overlay */

  /* Map tokens into Tailwind color utilities */
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-elevated: var(--surface-elevated);
  --color-border: var(--border);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-unread: var(--unread);
  --color-danger: var(--danger);
}

:root {
  --bg: oklch(0.985 0.002 247);
  --surface: oklch(0.995 0.001 247);
  --surface-elevated: oklch(0.998 0.001 247);
  --border: oklch(0.92 0.003 247);
  --text-primary: oklch(0.21 0.004 264);
  --text-secondary: oklch(0.44 0.006 264);
  --text-muted: oklch(0.55 0.006 264);
  --accent: oklch(0.58 0.13 244);
  --accent-foreground: oklch(0.99 0.002 247);
  --unread: oklch(0.58 0.13 244);
  --danger: oklch(0.55 0.18 27);
  --focus-ring: oklch(0.58 0.13 244);
  color-scheme: light;
}

.dark {
  --bg: oklch(0.17 0.004 264);
  --surface: oklch(0.205 0.004 264);
  --surface-elevated: oklch(0.245 0.005 264);
  --border: oklch(0.30 0.006 264);
  --text-primary: oklch(0.96 0.002 247);
  --text-secondary: oklch(0.71 0.004 264);
  --text-muted: oklch(0.60 0.005 264);
  --accent: oklch(0.70 0.13 244);
  --accent-foreground: oklch(0.17 0.01 264);
  --unread: oklch(0.70 0.13 244);
  --danger: oklch(0.70 0.16 27);
  --focus-ring: oklch(0.70 0.13 244);
  color-scheme: dark;
}

/* System default before any explicit choice is set on <html> (anti-FOUC fallback;
   the inline script in index.html sets .dark first, this covers the no-localStorage case). */
@media (prefers-color-scheme: dark) {
  :root:not(.theme-light):not(.dark) {
    --bg: oklch(0.17 0.004 264);
    --surface: oklch(0.205 0.004 264);
    --surface-elevated: oklch(0.245 0.005 264);
    --border: oklch(0.30 0.006 264);
    --text-primary: oklch(0.96 0.002 247);
    --text-secondary: oklch(0.71 0.004 264);
    --text-muted: oklch(0.60 0.005 264);
    --accent: oklch(0.70 0.13 244);
    --accent-foreground: oklch(0.17 0.01 264);
    --unread: oklch(0.70 0.13 244);
    --danger: oklch(0.70 0.16 27);
    --focus-ring: oklch(0.70 0.13 244);
    color-scheme: dark;
  }
}

@layer base {
  * { border-color: var(--color-border); }

  html { -webkit-text-size-adjust: 100%; }

  body {
    font-family: var(--font-sans);
    background-color: var(--color-bg);
    color: var(--color-text-primary);
    font-size: 0.875rem;      /* 14px UI base, density 6 */
    line-height: 1.5;
    font-feature-settings: "cv11", "ss01";
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* Numeric meta: counts, timestamps, kbd hints */
  .num, kbd, time, .count {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }

  /* Visible AA focus ring everywhere */
  :focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  ::selection {
    background-color: color-mix(in oklch, var(--color-accent) 28%, transparent);
  }

  /* Reader prose rhythm */
  .reader-prose {
    font-size: 1rem;          /* 16px reading body */
    line-height: 1.7;
    max-width: 68ch;
  }
  .reader-prose p { margin-block: 0.85em; }
  .reader-prose a { color: var(--color-accent); text-underline-offset: 2px; }
  .reader-prose h1, .reader-prose h2, .reader-prose h3 { line-height: 1.3; margin-top: 1.4em; }
  .reader-prose img { border-radius: var(--radius-md); max-width: 100%; height: auto; }
  .reader-prose pre {
    font-family: var(--font-mono);
    background: var(--color-surface-elevated);
    border-radius: var(--radius-md);
    padding: 0.75rem 1rem;
    overflow-x: auto;
  }
  .reader-prose blockquote {
    border-left: 2px solid var(--color-accent);
    padding-left: 1rem;
    color: var(--color-text-secondary);
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

### Anti-FOUC inline script (review fix #16)

`src/web/index.html` carries this blocking script in `<head>`, before any stylesheet, so the correct theme class is on `<html>` at first paint and there is no white flash for dark-preference users:

```html
<script>
  (function () {
    try {
      var saved = localStorage.getItem('iread-theme'); // 'light' | 'dark' | 'system' | null
      var sys = matchMedia('(prefers-color-scheme: dark)').matches;
      var dark = saved === 'dark' || ((saved === 'system' || !saved) && sys);
      var el = document.documentElement;
      el.classList.toggle('dark', dark);
      if (saved === 'light') el.classList.add('theme-light');
    } catch (e) {}
  })();
</script>
```

`useTheme` keeps `<html>` in sync afterward: it sets `.dark` for resolved-dark, adds `.theme-light` for explicit light (so the `prefers-color-scheme` CSS fallback does not override an explicit light choice), and persists `'light' | 'dark' | 'system'` to `localStorage['iread-theme']`.

---

## 3. Radius + Spacing System

One radius scale, four steps, applied by element size; no element invents its own.

| Token | Value | Applied to |
|---|---|---|
| `--radius-xs` | 4px | Unread dot chip, tiny kbd hints |
| `--radius-sm` | 6px | List rows, inputs, badges, count pills |
| `--radius-md` | 8px | Buttons, cards, reader images, code blocks |
| `--radius-lg` | 12px | Popovers, toasts, help overlay |

Density 6 (compact but breathing):
- Base spacing unit 4px. Row vertical padding `py-2` (8px). Pane horizontal padding `px-3` (12px).
- UI/body 14px / 1.5; reader body 16px / 1.7.
- FeedRow height about 34px; ArticleRow about 56px (two lines: title + meta). Sidebar fixed 256px; article list 360px (resize out of MVP).
- Row separators are 1px `--border` hairlines, not gaps; tight like newsboat, still scannable.
- Touch targets below 768px bump to min 44px height.

---

## 4. Component Inventory

| Component | Responsibility | Key props |
|---|---|---|
| `AppShell` | Three-pane CSS Grid, theme class, global keyboard handler, mobile pane routing. | `theme`, `activePane: 'sidebar' \| 'list' \| 'reader'` |
| `Sidebar` | Hosts smart views, feed list, add-feed form, refresh-all, OPML menu, theme toggle. ARIA `complementary`/`nav`. | `feeds: FeedWithCounts[]`, `totals: ViewTotals`, `selection`, `onSelectView`, `onSelectFeed`, `isRefreshingAll` |
| `SmartViews` | Unread / All / Starred selector (in that order) with mono counts from `totals`. | `totals`, `active`, `onChange` |
| `AddFeedForm` | URL input + submit; inline validation + error. | `onSubmit`, `pending`, `error` |
| `FeedRow` | One feed: glyph, title, mono `unreadCount`, fetch-error badge if `fetchError`. | `feed: FeedWithCounts`, `selected`, `onSelect`, `onDelete` |
| `RefreshAllButton` | `R` action; icon spins (transform only) while pending. | `pending`, `onClick` |
| `OpmlMenu` | Import (file picker) / Export (download link). | `onImport`, `pending` |
| `ThemeToggle` | Cycles light / dark / system; persists. | `theme`, `onChange` |
| `ArticleList` | Middle pane: rows for the current view/feed. `role="listbox"` labeled Articles. | `items: ItemSummary[]`, `total`, `selectedId`, `onSelect`, `state` |
| `ArticleRow` | Title, source `feedTitle`, published date `YYYYMMDD` (mono), `UnreadDot`, star toggle. `role="option"`. | `item: ItemSummary`, `selected`, `onSelect`, `onToggleStar` |
| `ReaderPane` | Right pane: sanitized `contentHtml`, header meta, open-original, read/star toolbar. ARIA `main`/`article`. | `item: Item \| undefined`, `onToggleRead`, `onToggleStar`, `state` |
| `Toolbar` | Action bar in reader (mark read, star, open original). | `item`, handlers |
| `SearchBox` | `/`-focusable filter over current list; `role="search"`. | `value`, `onChange`, `onClear` |
| `HelpOverlay` | `?` modal of keybindings (mono kbd chips). ARIA `dialog`, focus-trapped. | `open`, `onClose` |
| `KbdHint` | Single keyboard chip, mono. | `keys: string[]` |
| `Toast` / `ToastViewport` | Transient error/success with optional Undo. Auto-dismiss. | `kind`, `message`, `action?`, `onDismiss` |
| `ListSkeleton` | Shimmer bars matching FeedRow/ArticleRow shape, not a spinner. | `rows`, `variant: 'feed' \| 'article'` |
| `ReaderSkeleton` | Title bar + meta bar + 6 paragraph lines. | none |
| `EmptyState` | Icon + title + body + optional action. | `icon`, `title`, `body`, `action?` |
| `ErrorState` | Inline per-pane error with retry. | `message`, `onRetry` |
| `UnreadDot` | The one allowed semantic dot. | `active` |
| `Badge` | Mono count / error pill. | `tone: 'accent' \| 'danger' \| 'muted'`, `children` |
| `PublishedDate` | Renders `publishedAt` as a compact `YYYYMMDD` date inside `<time dateTime title>`. | `value: number` |

Icons (Phosphor, `weight="regular"` only): `Plus`, `ArrowsClockwise`, `Trash`, `Star`, `Circle` (unread), `MagnifyingGlass`, `SunDim`, `MoonStars`, `Desktop`, `Question`, `ArrowLeft`, `ArrowSquareOut`, `Warning`, `TrayArrowUp`/`TrayArrowDown` (OPML). To avoid bundling all weights, import per-icon. No hand-rolled SVG paths.

---

## 5. Three-Pane Layout + Responsive Collapse

### Desktop (>= 768px), CSS Grid

```css
.app-shell {
  display: grid;
  grid-template-columns: 256px 360px minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "topbar topbar topbar"
    "sidebar list reader";
  min-height: 100dvh;   /* never h-screen */
}
```

Sidebar (`grid-area: sidebar`), ArticleList (`list`), ReaderPane (`reader`). Each pane scrolls independently (`overflow-y: auto`), 1px `--border` between columns. ARIA: top bar `banner`; sidebar `complementary` wrapping a `nav` labeled Feeds; list `main` wrapping `role="listbox"` labeled Articles; reader `section` labeled Reader wrapping an `article` labeled by the item title. A visually hidden skip link ("Skip to articles") is the first focusable element.

### Mobile (< 768px), single column + back nav

```css
@media (max-width: 767px) {
  .app-shell {
    grid-template-columns: 1fr;
    grid-template-areas: "topbar" "active-pane";
  }
}
```

One pane at a time, driven by `activePane`. Selecting a feed slides in the article list; selecting an article slides in the reader. A back button (Phosphor `ArrowLeft`, mono breadcrumb label) returns one level. Slides use transform-X only. Two panes never show side by side below 768px.

---

## 6. Pane States (real copy, zero em-dashes)

Sidebar / feed list
- Loading: `ListSkeleton` variant `feed`, 5 rows (title bar + short count bar).
- Empty: title `No feeds yet`, body `Add a feed by URL above, or import an OPML file to get started.`, action `Import OPML`.
- Error (load feeds failed): `Could not load your feeds.` with `Retry`.

Article list (middle)
- Loading: `ListSkeleton` variant `article`, 8 rows (two-line bars).
- Empty (feed selected, no articles): `Nothing here yet`, body `This feed has no articles. Try refreshing with r.`
- Empty (Unread view, all read): `You are all caught up`, body `No unread articles in this view.`
- Empty (Starred view): `No starred articles`, body `Press s on an article to star it.`
- Empty (no feed selected): `Pick a feed`, body `Select a feed on the left to see its articles.`
- Empty (search, no match): `No matches`, body `No articles match your search in this view. Press Esc to clear.`
- Error (per-feed fetch): the `FeedRow` shows a `Warning` badge; the list shows `This feed failed to refresh.` with `Try again`.

Reader pane (right)
- Loading: `ReaderSkeleton`, title bar + source/time bar + 6 paragraph lines.
- Empty (nothing selected): `Select an article`, body `Choose an article from the list to read it here.`
- Empty (content stripped to nothing): `This article has no readable body.`, action `Open original`.
- Error: `Could not open this article.` with `Retry`.

All copy uses plain hyphens only. There are zero em-dashes and zero en-dashes anywhere in this document's user-facing strings.

---

## 7. Keyboard Map

Keys are case-sensitive (Shift matters): `j` is not `J`. All bindings run through a guard and fire only when not typing in an input/textarea/select/contenteditable, no Ctrl/Meta/Alt is held, and IME is not composing. `Esc` and the help overlay handle their own keys locally.

| Key | Action | Effect |
|---|---|---|
| `j` / ArrowDown | Down in focused pane | Pane-contextual: in the list, move item selection down 1 (roving focus + scroll into view); in the sidebar, move feed/view selection down 1 (focus follows, loads its items); in the reader, scroll down. Stops at the end (no wrap). On >= 768px the reader pane renders the new selection, so list navigation also auto-marks the item read (optimistic, idempotent). |
| `k` / ArrowUp | Up in focused pane | As `j`, upward; the reader scrolls up. Stops at the start. |
| `n` | Next unread | Jump to the next unread item below the current; wrap to first unread from top if none below; if none, polite live-region note and no-op. |
| `g` | Top | Select first item; focus + scroll to top. (Single press, no `gg` chord in MVP.) |
| `G` | Bottom | Select last item; focus + scroll to bottom. |
| `Enter` / `o` | Open / focus reader | Render selected item in reader, mark read (optimistic, idempotent), move DOM focus into the reader scroll container. |
| `h` / ArrowLeft | Focus pane left | Move DOM focus one pane left (reader -> list -> sidebar): sidebar lands on the selected feed/view, list on the roving row. Stops at the sidebar (no wrap). On < 768px also routes the visible pane. |
| `l` / ArrowRight | Focus pane right | As above, right (sidebar -> list -> reader); the reader focuses its scroll container. Stops at the reader. |
| `f` | Reader page forward | Scroll the reader down a full page (eased glide). Targets the reader wherever focus is; on < 768px only when the reader pane is mounted/visible. |
| `b` | Reader page back | As `f`, upward. |
| `m` | Toggle read/unread | Optimistically flip `isRead`; row state + feed `unreadCount` update; selection unchanged. |
| `s` | Toggle star | Optimistically flip `isStarred`; in Starred view an unstarred item leaves the list and selection advances. |
| `A` | Mark current feed/view read | Optimistically mark the current scope read; `unreadCount` to 0; selection stays. Undo toast. |
| `r` | Refresh current feed | If a specific feed is selected, refresh it. On a smart view, refresh the feed of the currently selected article (`item.feedId`); if no item is selected, refresh all. |
| `R` | Refresh all feeds | Refresh every feed; global progress; invalidate `['feeds']` and `['items']` on completion. |
| `v` | Open original | `window.open(item.link, '_blank', 'noopener,noreferrer')`. No selection change. (`o` is reader-open, so original is `v`.) |
| `/` | Focus search | Focus + select the search input; list-nav keys go inert while focused. |
| `Esc` | Contextual dismiss | Priority: (1) close help; (2) clear search and blur to list; (3) if reader focused, return focus to the selected row; (4) no-op. |
| `?` | Help overlay | Toggle the keybinding modal; focus-trapped; `Esc` or `?` closes and restores focus. |
| `t` | Toggle theme | Cycle light/dark/system; persist. (In scope, not optional.) |

Reserved/avoided: never bind Ctrl/Cmd/Alt combos (leave browser shortcuts intact); never bind plain `o` to open-original (it is reader-open); Space and Backspace stay unbound (native scroll / browser back).

Guard:

```ts
function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
function shouldHandle(e: KeyboardEvent): boolean {
  if (isTypingTarget(e)) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.isComposing) return false;
  return true;
}
```

Accessibility: the article list is a single `role="listbox"` with roving tabindex (one row `tabIndex={0}`, others `-1`, `aria-selected`); read/unread is conveyed in the accessible name, never by color alone. Feed rows compose counts into words: `aria-label={`${feed.title}, ${feed.unreadCount} unread`}` with the numeric badge `aria-hidden`. A single `aria-live="polite"` region announces transient action results ("Marked read", "Feed marked read, N items", "No unread items", "Refreshed N feeds"); unread counts themselves are not in a live region (they update silently per row). `PublishedDate` renders a visible `YYYYMMDD` date inside `<time dateTime={iso} title={absolute}>`.

---

## 8. React Query State Plan

Field names below are exactly those in the API contract (PLAN.md Section 7 and 8).

### Local UI state (NOT react-query) — `useUiStore`

- `selection`: `{ kind: 'all' | 'unread' | 'starred' } | { kind: 'feed'; feedId: number }` (initial: `{ kind: 'unread' }`; deleting the selected feed also falls back to Unread)
- `selectedItemId: number | null`
- `searchText: string` (raw input; debounced 250ms before entering a query key)
- `theme: 'light' | 'dark' | 'system'` (init from localStorage then `prefers-color-scheme`; persisted)
- `autoRefresh: { enabled: boolean; intervalMs: number }` (default `{ enabled: true, intervalMs: 300000 }`, persisted)
- `helpOpen: boolean`

### Query keys

```ts
// Sidebar feeds + counts. Server returns ListFeedsResponse { feeds, totals }.
['feeds'] as const

// Article list for a view/feed with optional search. Server returns ListItemsResponse
// { items, total, limit, offset }.
['items', { view: ViewKey, q: string }] as const
// ViewKey = 'all' | 'unread' | 'starred' | `feed:${number}`

// One full item (sanitized contentHtml). Server returns GetItemResponse { item }.
['item', itemId] as const
```

`ViewKey` maps to query params: `feed:42` sends `feedId=42`; the smart views send `view=...`. `q` is the trimmed debounced search ('' means no filter). Search is part of the `items` key so React Query caches per (view, q) and dedupes/GCs naturally.

### staleTime / refetch

| Query | staleTime | gcTime | refetchOnWindowFocus | Notes |
|---|---|---|---|---|
| `['feeds']` | 30s | 5m | true | Cheap; counts feel live. |
| `['items', ...]` | 30s | 5m | true | Per (view, q). |
| `['item', id]` | 5m | 10m | false | Body immutable per fetch. |

Global defaults: `retry: 1`, `refetchOnReconnect: true`.

### Auto-refresh polling

`refetchInterval` on `['feeds']` and the active `['items']` query, bound to `autoRefresh`:

```ts
refetchInterval: autoRefresh.enabled ? autoRefresh.intervalMs : false,
refetchIntervalInBackground: false, // never poll a hidden tab
```

Default 5 minutes, user-toggleable (optional 1/5/15 min), persisted. Polling refetches local feed metadata, counts, and the current item list. It does NOT trigger server-side remote re-fetching; that is only the `r`/`R` refresh mutations (which call `POST /api/feeds/:id/refresh` or `POST /api/feeds/refresh`, then invalidate `['items']` and `['feeds']`).

### Optimistic updates (review fixes #8, #9)

CRITICAL: cached `['items', ...]` data is a `ListItemsResponse` object, NOT a bare array. Patch `old.items`, and adjust `old.total` when membership changes. The original `old.map(...)` over a bare array is wrong and would silently no-op.

Toggle read (`m`, and auto-mark-on-open/view):

```ts
const toggleRead = useMutation({
  mutationFn: ({ id, isRead }: { id: number; isRead: boolean }) =>
    api.patchItem(id, { isRead }),

  onMutate: async ({ id, isRead }) => {
    await qc.cancelQueries({ queryKey: ['items'] });
    await qc.cancelQueries({ queryKey: ['feeds'] });

    const prevItems = qc.getQueriesData<ListItemsResponse>({ queryKey: ['items'] });
    const prevFeeds = qc.getQueryData<ListFeedsResponse>(['feeds']);

    const feedId = findFeedId(id, prevItems);

    qc.setQueriesData<ListItemsResponse>({ queryKey: ['items'] }, (old) => {
      if (!old) return old;
      // Patch in place in EVERY view, including Unread: a just-read row stays
      // visible (dimmed) so selection and navigation remain stable while reading.
      // Unread membership reconciles on the next refetch.
      return { ...old, items: old.items.map((it) => (it.id === id ? { ...it, isRead } : it)) };
    });

    qc.setQueryData<ListFeedsResponse>(['feeds'], (old) => {
      if (!old) return old;
      return {
        ...old,
        feeds: old.feeds.map((f) =>
          f.id === feedId
            ? { ...f, unreadCount: Math.max(0, f.unreadCount + (isRead ? -1 : 1)) }
            : f),
        totals: { ...old.totals, unread: Math.max(0, old.totals.unread + (isRead ? -1 : 1)) },
      };
    });

    return { prevItems, prevFeeds };
  },

  onError: (_e, _v, ctx) => {
    ctx?.prevItems.forEach(([key, data]) => qc.setQueryData(key, data));
    if (ctx?.prevFeeds) qc.setQueryData(['feeds'], ctx.prevFeeds);
    toast({ kind: 'error', message: 'Could not update. Reverted.' });
  },

  onSettled: (_d, _e, vars) => {
    // Marking read invalidates ['items'] WITHOUT refetching (refetchType: 'none'),
    // so a just-read row stays in the Unread view until the next natural refetch
    // (view switch, refocus, auto-refresh). Marking unread refetches so the row
    // reappears in the Unread view immediately (m toggle, Undo).
    qc.invalidateQueries({ queryKey: ['items'], refetchType: vars.isRead ? 'none' : 'active' });
    qc.invalidateQueries({ queryKey: ['feeds'] });
  },
});
```

- A just-read row stays visible (dimmed) in the Unread view; selection never dangles, so `selectedItemId` is left untouched by `toggleRead`. `n` skips read rows; `j`/`k`/`g`/`G` walk the visible list including dimmed rows.
- Star (`s`) follows the same shape against `{ isStarred }`. In the Starred view, unstarring removes the row and advances selection, and decrements `totals.starred`.
- Mark-all-read (`A`) optimistically sets `isRead: true` across the active list (or empties it in the Unread view) and `unreadCount: 0` on the scoped feed; same snapshot/rollback over the two key families; calls `POST /api/items/mark-all-read` with `{ feedId? }` plus the current `view` (`all | unread | starred`, all accepted by the API). Offers an Undo toast that re-marks the snapshot.
- Auto-mark-read reuses `toggleRead` with `isRead: true`, skipping the network call if the item is already read. It fires on reader open (Enter/`o`/click), and on >= 768px also on deliberate list navigation (`j`/`k`/`n`/`g`/`G`) since the reader pane renders the selection. Incidental selection (row focus, e.g. clicking a row's star button) never auto-marks.
- Because rows live under the partial key `['items']`, `setQueriesData`/`getQueriesData` patch every cached view at once (All, Unread, Starred, per-feed) so counts and membership stay consistent regardless of the active view.

---

## 9. Search Behavior

- Input updates `searchText` immediately (controlled); a 250ms debounce writes the trimmed value into the `q` part of the `['items', { view, q }]` key. Empty/whitespace means `q = ''` (no filter).
- Scoped to the current view: searching within `feed:42` searches only that feed; within `all`/`unread`/`starred` searches that set. Search narrows, never widens. Switching views keeps the query text and re-applies it to the new view (new key, fetched/cached).
- Matching is case-insensitive substring over `title` + `summary`, performed server-side (a deliberate scan for this small local dataset; FTS5 is out of scope).
- `/` focuses and selects the search input; `Esc` clears the query and returns focus to the list. While the input is focused, list-nav keys are inert.
- Selection during search: keep `selectedItemId` if still present in the filtered set; otherwise select the first result (or clear selection + reader if empty). All nav keys operate over the filtered list only.
- Empty state: `No matches` / `No articles match your search in this view. Press Esc to clear.`

---

## 10. Motion Spec (MOTION_INTENSITY 3)

Library `motion/react`. Animate only `transform` and `opacity`. No scroll listeners; pane reveal uses `AnimatePresence`; any in-view effect uses IntersectionObserver.

| Element | Animates | Spec |
|---|---|---|
| Row hover | bg tint via `whileHover` (instant) + `whileTap={{ scale: 0.98 }}` | tactile, ~120ms |
| Row enter | opacity 0->1, `y: 4 -> 0`, staggered 18ms, capped at first ~12 rows | 160ms ease-out |
| Reader content | opacity 0->1 + `y: 6 -> 0` on article change (`key={item.id}`) | 200ms ease-out |
| Mobile pane transition | `x: 24 -> 0` in, `x: -16` out, `AnimatePresence` mode `popLayout` | spring `{ stiffness: 320, damping: 32 }` |
| Selection highlight (desktop) | `layoutId="rowSelect"` accent bar between rows | spring `{ stiffness: 500, damping: 40 }` |
| RefreshAll icon | continuous `rotate` while pending | linear 800ms loop |
| Toast | `y: 8 -> 0` + opacity in, reverse out | 180ms ease-out |
| HelpOverlay | backdrop opacity, panel `scale: 0.98 -> 1` + opacity | 160ms ease-out, focus-trapped |

prefers-reduced-motion: the global CSS media query collapses transitions/animations to about 0ms; a `useReducedMotion()` guard sets every Motion `transition` to `{ duration: 0 }`, drops `staggerChildren`, swaps the spinning refresh icon for a static state, and turns pane slides into instant swaps. Content still appears; it appears instantly.

---

## 11. Taste-Skill Pre-flight Checklist (tailored to iread)

- Em-dashes / en-dashes: none. All copy and labels use plain hyphens. PASS.
- One accent, not purple: single calm blue `oklch(0.58 / 0.70 0.13 244)`, chroma 0.13 (well under 80 percent saturation), reused for selection, focus, primary, and unread. PASS.
- One radius scale: `--radius-xs/sm/md/lg` (4/6/8/12px), applied by element size. PASS.
- Theme lock: one model, light + dark + system, manual toggle, localStorage, with `prefers-color-scheme` fallback and an anti-FOUC inline script; zinc-50 / zinc-950, never pure #fff/#000; no mid-page inverts. PASS.
- Phosphor-only icons, single `regular` weight, per-icon imports, no hand-rolled SVG. PASS.
- Mono for numbers: Geist Mono with tabular-nums on counts, timestamps, kbd hints. PASS.
- AA contrast: body >= 7:1 (AAA), muted meta 4.7:1 light / 4.8:1 dark, danger and accent-foreground verified AA+. PASS.
- Every pane has explicit loading (skeleton, not spinner), empty, and error states with real copy. PASS.
- Keyboard-first: full single-key map with a typing/modifier guard; visible focus ring; roving tabindex; aria-live for action results. PASS.
- API field-name parity: react-query plan consumes exactly the fields PLAN.md defines (`isRead`, `isStarred`, `unreadCount`, `totalCount`, `contentHtml`, `publishedAt`, `feedTitle`, `view`, `totals`, `items`, `total`). PASS.
- Optimistic updates patch `ListItemsResponse.items` (not a bare array) and keep Unread/Starred membership live. PASS.
- Motion: transform/opacity only, MOTION_INTENSITY 3, reduced-motion fully handled. PASS.
