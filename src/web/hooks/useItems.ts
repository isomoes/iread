// src/web/hooks/useItems.ts
// React Query for the article list (['items', { view, q }]) and single item (['item', id]),
// plus the optimistic toggleRead / toggleStar / markAllRead logic from DESIGN Section 8.
// Cached ['items', ...] data is a ListItemsResponse object (NOT a bare array): patch
// old.items and adjust old.total / totals when membership changes.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { feedsKey } from './useFeeds';
import { toast, uiStore, useUiSelector, type ViewKey } from './useUiStore';
import type {
  GetItemResponse,
  ItemSummary,
  ListFeedsResponse,
  ListItemsResponse,
  MarkAllReadRequest,
  SmartView,
} from '../../shared/types';

const ITEMS_LIMIT = 200;

/* ---------- Query-key helpers ---------- */

interface ItemsKeyMeta {
  view: ViewKey;
  q: string;
}

export function itemsKey(view: ViewKey, q: string): readonly ['items', ItemsKeyMeta] {
  return ['items', { view, q }] as const;
}

function metaFromKey(key: QueryKey): ItemsKeyMeta | undefined {
  const meta = key[1];
  if (meta && typeof meta === 'object' && 'view' in meta) {
    return meta as ItemsKeyMeta;
  }
  return undefined;
}

/** A `feed:NN` ViewKey carries the feedId; smart views carry a SmartView. */
function viewKeyToParams(view: ViewKey): { view?: SmartView; feedId?: number } {
  if (view.startsWith('feed:')) {
    const feedId = Number(view.slice('feed:'.length));
    return { feedId };
  }
  return { view: view as SmartView };
}

/* ---------- Debounced search ---------- */

/** Returns the trimmed search text debounced 250ms; '' means no filter. */
export function useDebouncedSearch(delayMs = 250): string {
  const searchText = useUiSelector((s) => s.searchText);
  const [debounced, setDebounced] = useState(() => searchText.trim());
  useEffect(() => {
    const id = setTimeout(() => setDebounced(searchText.trim()), delayMs);
    return () => clearTimeout(id);
  }, [searchText, delayMs]);
  return debounced;
}

/* ---------- List + single-item queries ---------- */

/** The article list for a (view, q). View enters the key; q is the debounced filter. */
export function useItemsList(
  view: ViewKey,
  q: string,
): UseQueryResult<ListItemsResponse, ApiError> {
  const autoRefresh = useUiSelector((s) => s.autoRefresh);
  const params = viewKeyToParams(view);
  return useQuery<ListItemsResponse, ApiError>({
    queryKey: itemsKey(view, q),
    queryFn: ({ signal }) =>
      api.listItems({ ...params, q, limit: ITEMS_LIMIT, offset: 0 }, signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: autoRefresh.enabled ? autoRefresh.intervalMs : false,
    refetchIntervalInBackground: false,
  });
}

/** Full item (sanitized contentHtml) for the reader pane. Body is immutable per fetch. */
export function useItem(id: number | null): UseQueryResult<GetItemResponse, ApiError> {
  return useQuery<GetItemResponse, ApiError>({
    queryKey: ['item', id],
    queryFn: ({ signal }) => api.getItem(id as number, signal),
    enabled: id != null,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/* ---------- Shared optimistic-patch internals ---------- */

interface MutationCtx {
  prevItems: [QueryKey, ListItemsResponse | undefined][];
  prevFeeds: ListFeedsResponse | undefined;
  /** Snapshot of the reader's full-item cache (['item', id]) for rollback. */
  prevItem?: { key: QueryKey; data: GetItemResponse | undefined };
}

/** Find the feedId of an item by scanning the cached item lists. */
function findFeedId(
  id: number,
  snapshots: [QueryKey, ListItemsResponse | undefined][],
): number | undefined {
  for (const [, data] of snapshots) {
    const hit = data?.items.find((it) => it.id === id);
    if (hit) return hit.feedId;
  }
  return undefined;
}

/**
 * Compute the selection that should follow removing `removedId` from the active list.
 * Picks the next row below, else the previous row, else null.
 */
function nextSelectionAfterRemoval(
  items: ItemSummary[],
  removedId: number,
): number | null {
  const idx = items.findIndex((it) => it.id === removedId);
  if (idx === -1) return uiStore.getState().selectedItemId;
  const next = items[idx + 1] ?? items[idx - 1];
  return next ? next.id : null;
}

/* ---------- toggleRead (`m`, and auto-mark-on-open/view) ---------- */

export function useToggleRead() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, { id: number; isRead: boolean }, MutationCtx>({
    mutationFn: ({ id, isRead }) => api.patchItem(id, { isRead }),

    onMutate: async ({ id, isRead }) => {
      await qc.cancelQueries({ queryKey: ['items'] });
      await qc.cancelQueries({ queryKey: feedsKey });

      const prevItems = qc.getQueriesData<ListItemsResponse>({ queryKey: ['items'] });
      const prevFeeds = qc.getQueryData<ListFeedsResponse>(feedsKey);
      const feedId = findFeedId(id, prevItems);

      patchItemReadInCaches(qc, id, isRead);
      patchFeedUnread(qc, feedId, isRead ? -1 : 1);
      const prevItem = patchReaderItem(qc, id, { isRead });

      return { prevItems, prevFeeds, prevItem };
    },

    onError: (_e, _v, ctx) => {
      rollback(qc, ctx);
      toast({ kind: 'error', message: 'Could not update. Reverted.' });
    },

    onSettled: (_d, _e, vars) => {
      // Marking read: invalidate WITHOUT refetching, so a just-read row stays
      // visible (dimmed) in the Unread view until the next natural refetch (view
      // switch, refocus, auto-refresh) instead of vanishing mid-read. Marking
      // unread: refetch so the row reappears in the Unread view (m toggle, Undo).
      qc.invalidateQueries({
        queryKey: ['items'],
        refetchType: vars.isRead ? 'none' : 'active',
      });
      qc.invalidateQueries({ queryKey: feedsKey });
      qc.invalidateQueries({ queryKey: ['item', vars.id] });
    },
  });
}

/* ---------- toggleStar (`s`) ---------- */

export function useToggleStar(activeView: ViewKey) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, { id: number; isStarred: boolean }, MutationCtx>({
    mutationFn: ({ id, isStarred }) => api.patchItem(id, { isStarred }),

    onMutate: async ({ id, isStarred }) => {
      await qc.cancelQueries({ queryKey: ['items'] });
      await qc.cancelQueries({ queryKey: feedsKey });

      const prevItems = qc.getQueriesData<ListItemsResponse>({ queryKey: ['items'] });
      const prevFeeds = qc.getQueryData<ListFeedsResponse>(feedsKey);

      // In the Starred view, unstarring removes the row + advances selection.
      if (
        !isStarred &&
        activeView === 'starred' &&
        uiStore.getState().selectedItemId === id
      ) {
        const activeData = qc.getQueryData<ListItemsResponse>(itemsKey(activeView, debouncedQ()));
        if (activeData) {
          uiStore.setSelectedItemId(nextSelectionAfterRemoval(activeData.items, id));
        }
      }

      patchItemStarInCaches(qc, id, isStarred);
      patchStarredTotal(qc, isStarred ? 1 : -1);
      const prevItem = patchReaderItem(qc, id, { isStarred });

      return { prevItems, prevFeeds, prevItem };
    },

    onError: (_e, _v, ctx) => {
      rollback(qc, ctx);
      toast({ kind: 'error', message: 'Could not update. Reverted.' });
    },

    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: feedsKey });
      qc.invalidateQueries({ queryKey: ['item', vars.id] });
    },
  });
}

/* ---------- markAllRead (`A`) ---------- */

interface MarkAllReadVars {
  /** When present, scope to a single feed. */
  feedId?: number;
  /** Smart view scope (all | unread | starred). */
  view?: SmartView;
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, MarkAllReadVars, MutationCtx>({
    mutationFn: (vars) => {
      const payload: MarkAllReadRequest = {};
      if (vars.feedId !== undefined) payload.feedId = vars.feedId;
      if (vars.view !== undefined) payload.view = vars.view;
      return api.markAllRead(payload);
    },

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['items'] });
      await qc.cancelQueries({ queryKey: feedsKey });

      const prevItems = qc.getQueriesData<ListItemsResponse>({ queryKey: ['items'] });
      const prevFeeds = qc.getQueryData<ListFeedsResponse>(feedsKey);

      // Mirror feed-service.markAllRead exactly: a row is flipped read when it is
      // currently unread AND (no feedId, or its feedId matches) AND (the view is not
      // 'starred', or the row is starred). view 'all'/'unread' mark the same set.
      const inScope = (it: ItemSummary): boolean => {
        if (vars.feedId !== undefined && it.feedId !== vars.feedId) return false;
        if (vars.view === 'starred' && !it.isStarred) return false;
        return true;
      };

      // Patch every cached items view at once.
      forEachItemsCache(qc, (old, view) => {
        // The Unread view loses every now-read row in scope.
        if (view === 'unread') {
          const items = old.items.filter((it) => !(inScope(it) && !it.isRead));
          const removed = old.items.length - items.length;
          return { ...old, items, total: Math.max(0, old.total - removed) };
        }
        return {
          ...old,
          items: old.items.map((it) => (inScope(it) ? { ...it, isRead: true } : it)),
        };
      });

      // Decrement unreadCount by the count of in-scope-and-unread items per feed
      // (computed from the cached lists), so a Starred-view `A` does not wrongly zero
      // every feed. Fall back to zeroing only when the whole feed/view is in scope.
      patchFeedUnreadForMarkAll(qc, prevItems, vars);

      return { prevItems, prevFeeds };
    },

    onError: (_e, _v, ctx) => {
      rollback(qc, ctx);
      toast({ kind: 'error', message: 'Could not mark read. Reverted.' });
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: feedsKey });
    },
  });
}

/* ---------- Cache-patch primitives ---------- */

/**
 * Apply a view-aware updater to every cached ['items', ...] entry. React Query v5's
 * setQueriesData updater receives only (old), so we iterate keys ourselves and call
 * setQueryData per entry, giving the updater the ViewKey it needs for membership rules.
 */
function forEachItemsCache(
  qc: QueryClient,
  updater: (old: ListItemsResponse, view: ViewKey | undefined) => ListItemsResponse,
): void {
  const entries = qc.getQueriesData<ListItemsResponse>({ queryKey: ['items'] });
  for (const [key, data] of entries) {
    if (!data) continue;
    const view = metaFromKey(key)?.view;
    qc.setQueryData<ListItemsResponse>(key, updater(data, view));
  }
}

function patchItemReadInCaches(qc: QueryClient, id: number, isRead: boolean): void {
  // Patch in place in EVERY view, including Unread: a just-read row stays visible
  // (dimmed) so selection and j/k navigation remain stable while reading. Unread
  // membership reconciles on the next refetch.
  forEachItemsCache(qc, (old) => ({
    ...old,
    items: old.items.map((it) => (it.id === id ? { ...it, isRead } : it)),
  }));
}

function patchItemStarInCaches(qc: QueryClient, id: number, isStarred: boolean): void {
  forEachItemsCache(qc, (old, view) => {
    // In the Starred view, unstarring REMOVES the row.
    if (view === 'starred' && !isStarred) {
      const items = old.items.filter((it) => it.id !== id);
      const removed = old.items.length - items.length;
      return { ...old, items, total: Math.max(0, old.total - removed) };
    }
    return {
      ...old,
      items: old.items.map((it) => (it.id === id ? { ...it, isStarred } : it)),
    };
  });
}

/**
 * Adjust feeds' unreadCount + the global unread total for a mark-all-read.
 *
 * - view 'all'/'unread' (or no view): the whole scope is read, so the scoped feeds'
 *   unreadCount truly goes to 0.
 * - view 'starred': only currently-starred-and-unread items are read, so we decrement
 *   each feed by the count of such items observed across the cached item lists (deduped
 *   by id). This mirrors feed-service.markAllRead instead of zeroing every feed.
 */
function patchFeedUnreadForMarkAll(
  qc: QueryClient,
  snapshots: [QueryKey, ListItemsResponse | undefined][],
  vars: MarkAllReadVars,
): void {
  const inFeedScope = (feedId: number) => vars.feedId === undefined || feedId === vars.feedId;

  if (vars.view !== 'starred') {
    // Whole scope is marked read -> unreadCount 0 on the scoped feed(s).
    qc.setQueryData<ListFeedsResponse>(feedsKey, (old) => {
      if (!old) return old;
      const feeds = old.feeds.map((f) =>
        inFeedScope(f.id) ? { ...f, unreadCount: 0 } : f,
      );
      const unread = feeds.reduce((sum, f) => sum + f.unreadCount, 0);
      return { ...old, feeds, totals: { ...old.totals, unread } };
    });
    return;
  }

  // Starred scope: count starred-and-unread items per feed across the cached lists,
  // deduping by item id so an item present in several views is counted once.
  const decByFeed = new Map<number, number>();
  const seen = new Set<number>();
  for (const [, data] of snapshots) {
    if (!data) continue;
    for (const it of data.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      if (it.isStarred && !it.isRead && inFeedScope(it.feedId)) {
        decByFeed.set(it.feedId, (decByFeed.get(it.feedId) ?? 0) + 1);
      }
    }
  }

  qc.setQueryData<ListFeedsResponse>(feedsKey, (old) => {
    if (!old) return old;
    const feeds = old.feeds.map((f) => {
      const dec = decByFeed.get(f.id) ?? 0;
      return dec ? { ...f, unreadCount: Math.max(0, f.unreadCount - dec) } : f;
    });
    const unread = feeds.reduce((sum, f) => sum + f.unreadCount, 0);
    return { ...old, feeds, totals: { ...old.totals, unread } };
  });
}

function patchFeedUnread(qc: QueryClient, feedId: number | undefined, delta: number): void {
  qc.setQueryData<ListFeedsResponse>(feedsKey, (old) => {
    if (!old) return old;
    return {
      ...old,
      feeds: old.feeds.map((f) =>
        f.id === feedId ? { ...f, unreadCount: Math.max(0, f.unreadCount + delta) } : f,
      ),
      totals: { ...old.totals, unread: Math.max(0, old.totals.unread + delta) },
    };
  });
}

function patchStarredTotal(qc: QueryClient, delta: number): void {
  qc.setQueryData<ListFeedsResponse>(feedsKey, (old) => {
    if (!old) return old;
    return { ...old, totals: { ...old.totals, starred: Math.max(0, old.totals.starred + delta) } };
  });
}

/**
 * Patch the reader's full-item cache (['item', id]) so the reader Toolbar reflects
 * read/star toggles immediately. Returns the prior snapshot for rollback (undefined
 * when the item is not cached). Patches whichever of isRead/isStarred is provided.
 */
function patchReaderItem(
  qc: QueryClient,
  id: number,
  patch: { isRead?: boolean; isStarred?: boolean },
): MutationCtx['prevItem'] {
  const key: QueryKey = ['item', id];
  const prev = qc.getQueryData<GetItemResponse>(key);
  if (!prev) return { key, data: undefined };
  qc.setQueryData<GetItemResponse>(key, { ...prev, item: { ...prev.item, ...patch } });
  return { key, data: prev };
}

function rollback(qc: QueryClient, ctx: MutationCtx | undefined): void {
  ctx?.prevItems.forEach(([key, data]) => qc.setQueryData(key, data));
  if (ctx?.prevFeeds) qc.setQueryData(feedsKey, ctx.prevFeeds);
  if (ctx?.prevItem) qc.setQueryData(ctx.prevItem.key, ctx.prevItem.data);
}

/** Snapshot of the latest debounced query string for active-view lookups in onMutate. */
let _debouncedQ = '';
export function setDebouncedQ(q: string): void {
  _debouncedQ = q;
}
function debouncedQ(): string {
  return _debouncedQ;
}

/* ---------- Active-list helpers for the controller ---------- */

/**
 * Keep selectedItemId valid against the active list (DESIGN Section 9): keep it if it
 * is still present in the filtered set; otherwise select the first row, or clear it if
 * the list is empty. Re-applies on every view/filter/membership change. Returns the id.
 *
 * `onViewEntrySelect` fires for the landing selection of a deliberate view entry
 * (sidebar click, J/K cycle, initial load) — with `undefined` when the view is empty —
 * so the controller can rotate its pending mark-on-leave item (flush the item left
 * behind, arm the landing one). It is armed only by a view change — never by a
 * membership reshuffle (a refetch dropping read rows) or a search-filter change — so
 * auto-refresh can never chain-mark items the user did not navigate to. An entry that
 * keeps the same selected item does not fire: the item is still displayed, not left.
 */
export function useSyncedSelection(
  view: ViewKey,
  q: string,
  onViewEntrySelect?: (item: ItemSummary | undefined) => void,
): number | null {
  const { data } = useItemsList(view, q);
  const items = useMemo(() => data?.items ?? [], [data]);
  const selectedItemId = useUiSelector((s) => s.selectedItemId);

  // Armed on mount (the initial landing view) and on every view change; consumed by
  // the first sync pass that runs against loaded data.
  const viewEntryArmed = useRef(true);
  const prevView = useRef(view);
  if (prevView.current !== view) {
    prevView.current = view;
    viewEntryArmed.current = true;
  }
  const onViewEntrySelectRef = useRef(onViewEntrySelect);
  onViewEntrySelectRef.current = onViewEntrySelect;

  useEffect(() => {
    // Still loading: leave the selection alone and keep view-entry armed for the
    // landing selection once data arrives.
    if (data === undefined) return;
    const isViewEntry = viewEntryArmed.current;
    viewEntryArmed.current = false;

    // Still present: keep it (covers view switches that retain the item too).
    if (selectedItemId != null && items.some((it) => it.id === selectedItemId)) {
      return;
    }
    // Dropped out of the set: select the first row, or clear.
    const first = items[0];
    uiStore.setSelectedItemId(first ? first.id : null);
    if (isViewEntry) onViewEntrySelectRef.current?.(first);
  }, [data, items, selectedItemId, view]);

  return selectedItemId;
}

/**
 * Auto-mark-read: reuse the read patch, skipping the network if already read. The
 * controller calls this when an item is opened in the reader, and on >=768px when a
 * displayed item is switched away from (mark-on-leave; see the pending-read logic
 * in App).
 */
export function useAutoMarkRead(): (item: ItemSummary | undefined) => void {
  const toggleRead = useToggleRead();
  return (item) => {
    if (item && !item.isRead) {
      toggleRead.mutate({ id: item.id, isRead: true });
    }
  };
}
