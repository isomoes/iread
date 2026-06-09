// src/web/hooks/useFeeds.ts
// React Query for the sidebar feed list plus add / delete / refresh-one / refresh-all.
// staleTime / refetch / auto-refresh polling per DESIGN Section 8.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { toast, uiStore, useUiSelector } from './useUiStore';
import type {
  AddFeedResponse,
  FeedWithCounts,
  ListFeedsResponse,
  RefreshAllResponse,
  RefreshFeedResponse,
} from '../../shared/types';

export const feedsKey = ['feeds'] as const;

/** Sidebar feeds + global totals. Cheap, polled per the auto-refresh setting. */
export function useFeeds(): UseQueryResult<ListFeedsResponse, ApiError> {
  const autoRefresh = useUiSelector((s) => s.autoRefresh);
  return useQuery<ListFeedsResponse, ApiError>({
    queryKey: feedsKey,
    queryFn: ({ signal }) => api.listFeeds(signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: autoRefresh.enabled ? autoRefresh.intervalMs : false,
    refetchIntervalInBackground: false,
  });
}

/** Add a feed by URL. On success invalidates feeds + items so counts refresh. */
export function useAddFeed() {
  const qc = useQueryClient();
  return useMutation<AddFeedResponse, ApiError, string>({
    mutationFn: (url: string) => api.addFeed(url),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: feedsKey });
      qc.invalidateQueries({ queryKey: ['items'] });
      toast({ kind: 'success', message: `Added ${data.feed.title || data.feed.feedUrl}` });
    },
    // Errors are surfaced inline by AddFeedForm via mutation.error; no toast here.
  });
}

/** Delete a feed (optimistic removal from the sidebar list + totals). */
export function useDeleteFeed() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, number, { prev?: ListFeedsResponse }>({
    mutationFn: (id: number) => api.deleteFeed(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: feedsKey });
      const prev = qc.getQueryData<ListFeedsResponse>(feedsKey);
      if (prev) {
        const removed = prev.feeds.find((f) => f.id === id);
        const next: ListFeedsResponse = {
          feeds: prev.feeds.filter((f) => f.id !== id),
          totals: removed
            ? {
                all: Math.max(0, prev.totals.all - removed.totalCount),
                unread: Math.max(0, prev.totals.unread - removed.unreadCount),
                // Starred total is unknown per-feed here; let invalidation reconcile it.
                starred: prev.totals.starred,
              }
            : prev.totals,
        };
        qc.setQueryData<ListFeedsResponse>(feedsKey, next);
      }
      // If the deleted feed was the current selection, fall back to All.
      const sel = uiStore.getState().selection;
      if (sel.kind === 'feed' && sel.feedId === id) {
        uiStore.setSelection({ kind: 'all' });
      }
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(feedsKey, ctx.prev);
      toast({ kind: 'error', message: 'Could not delete the feed. Reverted.' });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: feedsKey });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

/**
 * Refresh a single feed (the `r` action when a feed is selected, or the feed of
 * the selected article). On success invalidates items + feeds.
 */
export function useRefreshFeed() {
  const qc = useQueryClient();
  return useMutation<RefreshFeedResponse, ApiError, number>({
    mutationFn: (id: number) => api.refreshFeed(id),
    onSuccess: (data) => {
      // A fetch failure is data, not an HTTP error: surface it as a toast.
      if (data.feed.fetchError) {
        toast({ kind: 'error', message: 'This feed failed to refresh.' });
      } else if (data.newItems > 0) {
        toast({
          kind: 'success',
          message: `Refreshed ${data.feed.title || 'feed'}, ${data.newItems} new`,
        });
      } else {
        toast({ kind: 'info', message: 'Refreshed, nothing new.' });
      }
    },
    onError: () => {
      toast({ kind: 'error', message: 'Could not refresh the feed.' });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: feedsKey });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

/** Refresh all feeds (the `R` action). Always resolves 200 server-side. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return useMutation<RefreshAllResponse, ApiError, void>({
    mutationFn: () => api.refreshAll(),
    onSuccess: (data) => {
      if (data.failed > 0) {
        toast({
          kind: data.refreshed > 0 ? 'info' : 'error',
          message: `Refreshed ${data.refreshed} feeds, ${data.failed} failed`,
        });
      } else {
        toast({
          kind: 'success',
          message:
            data.newItems > 0
              ? `Refreshed ${data.refreshed} feeds, ${data.newItems} new`
              : `Refreshed ${data.refreshed} feeds`,
        });
      }
    },
    onError: () => {
      toast({ kind: 'error', message: 'Could not refresh feeds.' });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: feedsKey });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

/** Convenience: look up a feed in the cached list. */
export function useFeedById(id: number | null): FeedWithCounts | undefined {
  const { data } = useFeeds();
  if (id == null) return undefined;
  return data?.feeds.find((f) => f.id === id);
}
