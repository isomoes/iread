// src/web/App.tsx
// Controller: composes useUiStore + data hooks + useKeyboardNav, owns view/selection
// state, wires AppShell, HelpOverlay, ToastViewport, SearchBox focus, and the
// aria-live region for action results (DESIGN Section 7).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { AppShell, type ActivePane } from './components/AppShell';
import { HelpOverlay } from './components/HelpOverlay';
import { Toast, ToastViewport } from './components/Toast';
import { SearchBox } from './components/SearchBox';
import { RefreshAllButton } from './components/RefreshAllButton';
import type { PaneState } from './components/paneState';

import {
  uiStore,
  useUiStore,
  useToasts,
  dismissToast,
  toast,
  selectionToViewKey,
  type Selection,
} from './hooks/useUiStore';
import { useTheme } from './hooks/useTheme';
import { useFeeds, useAddFeed, useDeleteFeed, useRefreshFeed, useRefreshAll } from './hooks/useFeeds';
import {
  useItemsList,
  useItem,
  useDebouncedSearch,
  useToggleRead,
  useToggleStar,
  useMarkAllRead,
  useAutoMarkRead,
  useSyncedSelection,
  setDebouncedQ,
} from './hooks/useItems';
import { useOpml } from './hooks/useOpml';
import { useKeyboardNav, type SidebarTarget } from './hooks/useKeyboardNav';
import type { ItemSummary } from '../shared/types';

// The PaneState contract lives in ./components/paneState (shared with the panes).
// The controller builds these objects; the panes render against them.

const SMART_VIEW_TARGETS: SidebarTarget[] = [
  { kind: 'all' },
  { kind: 'unread' },
  { kind: 'starred' },
];

/** Left-to-right pane order for h/l horizontal focus movement. */
const PANE_ORDER: ActivePane[] = ['sidebar', 'list', 'reader'];

export function App() {
  const ui = useUiStore();
  const { selection, selectedItemId, searchText, helpOpen } = ui;
  const { theme, resolved, setTheme, cycleTheme } = useTheme();
  const reduceMotion = useReducedMotion();

  const debouncedQ = useDebouncedSearch();
  // Mirror the debounced query into the items module so optimistic onMutate can
  // look up the active list by key.
  useEffect(() => {
    setDebouncedQ(debouncedQ);
  }, [debouncedQ]);

  const activeView = selectionToViewKey(selection);

  /* ---- Data ---- */
  const feedsQuery = useFeeds();
  const itemsQuery = useItemsList(activeView, debouncedQ);
  const itemQuery = useItem(selectedItemId);

  // Keep selection valid against the live filtered list.
  useSyncedSelection(activeView, debouncedQ);

  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);

  /* ---- Mutations ---- */
  const addFeed = useAddFeed();
  const deleteFeed = useDeleteFeed();
  const refreshFeed = useRefreshFeed();
  const refreshAll = useRefreshAll();
  const toggleRead = useToggleRead(activeView);
  const toggleStar = useToggleStar(activeView);
  const markAllRead = useMarkAllRead();
  const autoMarkRead = useAutoMarkRead(activeView);
  const opml = useOpml();

  /* ---- Toasts + aria-live ---- */
  const toasts = useToasts();
  const [liveMessage, setLiveMessage] = useState('');
  const announce = useCallback((message: string) => {
    // Clear then set so repeated identical messages are still announced.
    setLiveMessage('');
    requestAnimationFrame(() => setLiveMessage(message));
  }, []);

  /* ---- Mobile pane routing ---- */
  const [activePane, setActivePane] = useState<ActivePane>('list');
  const goToPane = useCallback((pane: ActivePane) => setActivePane(pane), []);
  const onBack = useCallback(() => {
    setActivePane((p) => (p === 'reader' ? 'list' : 'sidebar'));
  }, []);

  /* ---- Refs for focus management ---- */
  const searchInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<HTMLElement>(null);

  /* ---- Selection / sidebar actions ---- */
  const selectView = useCallback(
    (kind: 'all' | 'unread' | 'starred') => {
      uiStore.setSelection({ kind });
      goToPane('list');
    },
    [goToPane],
  );

  const selectFeed = useCallback(
    (feedId: number) => {
      uiStore.setSelection({ kind: 'feed', feedId });
      goToPane('list');
    },
    [goToPane],
  );

  const selectItem = useCallback((id: number) => {
    uiStore.setSelectedItemId(id);
  }, []);

  const openReader = useCallback(
    (id: number) => {
      uiStore.setSelectedItemId(id);
      const item = items.find((it) => it.id === id);
      autoMarkRead(item); // idempotent; skips if already read
      goToPane('reader');
    },
    [items, autoMarkRead, goToPane],
  );

  /* ---- Ordered sidebar targets for J/K cycling ---- */
  const sidebarTargets: SidebarTarget[] = useMemo(() => {
    const feeds = feedsQuery.data?.feeds ?? [];
    return [...SMART_VIEW_TARGETS, ...feeds.map((f) => ({ kind: 'feed', feedId: f.id }) as const)];
  }, [feedsQuery.data]);

  const currentSidebarIndex = useMemo(() => {
    return sidebarTargets.findIndex((t) =>
      t.kind === 'feed'
        ? selection.kind === 'feed' && selection.feedId === t.feedId
        : selection.kind === t.kind,
    );
  }, [sidebarTargets, selection]);

  const selectSidebar = useCallback(
    (target: SidebarTarget) => {
      if (target.kind === 'feed') selectFeed(target.feedId);
      else selectView(target.kind);
    },
    [selectFeed, selectView],
  );

  /* ---- Item-state actions ---- */
  const onToggleRead = useCallback(
    (id: number) => {
      const item = items.find((it) => it.id === id);
      const next = !(item?.isRead ?? false);
      toggleRead.mutate({ id, isRead: next });
      announce(next ? 'Marked read' : 'Marked unread');
    },
    [items, toggleRead, announce],
  );

  const onToggleStar = useCallback(
    (id: number) => {
      const item = items.find((it) => it.id === id);
      const next = !(item?.isStarred ?? false);
      toggleStar.mutate({ id, isStarred: next });
      announce(next ? 'Starred' : 'Unstarred');
    },
    [items, toggleStar, announce],
  );

  const onMarkAllRead = useCallback(() => {
    const snapshotIds = items.filter((it) => !it.isRead).map((it) => it.id);
    const vars =
      selection.kind === 'feed'
        ? { feedId: selection.feedId }
        : { view: selection.kind };
    markAllRead.mutate(vars);
    announce(`Marked read, ${snapshotIds.length} items`);
    // DESIGN Section 7/8: offer an Undo toast that re-marks the snapshot unread.
    if (snapshotIds.length > 0) {
      toast({
        kind: 'success',
        message: `Marked read, ${snapshotIds.length} items`,
        action: {
          label: 'Undo',
          onClick: () => {
            for (const id of snapshotIds) toggleRead.mutate({ id, isRead: false });
          },
        },
      });
    }
  }, [items, selection, markAllRead, toggleRead, announce]);

  const onRefreshCurrent = useCallback(() => {
    // A specific feed: refresh it. On a smart view: refresh the selected item's feed,
    // else refresh all.
    if (selection.kind === 'feed') {
      refreshFeed.mutate(selection.feedId);
      return;
    }
    const selected = items.find((it) => it.id === selectedItemId);
    if (selected) refreshFeed.mutate(selected.feedId);
    else refreshAll.mutate();
  }, [selection, items, selectedItemId, refreshFeed, refreshAll]);

  const onRefreshAll = useCallback(() => {
    refreshAll.mutate();
    announce('Refreshing all feeds');
  }, [refreshAll, announce]);

  const onOpenOriginal = useCallback((item: ItemSummary) => {
    if (item.link) window.open(item.link, '_blank', 'noopener,noreferrer');
  }, []);

  const onDeleteFeed = useCallback(
    (id: number) => {
      deleteFeed.mutate(id);
    },
    [deleteFeed],
  );

  /* ---- Search / theme / help / escape ---- */
  const onSearchChange = useCallback((value: string) => {
    uiStore.setSearchText(value);
  }, []);

  const onClearSearch = useCallback(() => {
    uiStore.clearSearch();
  }, []);

  const focusSearch = useCallback(() => {
    const el = searchInputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const toggleHelp = useCallback(() => {
    uiStore.toggleHelp();
  }, []);

  const focusSelectedRow = useCallback(() => {
    const row = document.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]',
    );
    row?.focus();
  }, []);

  /* ---- Horizontal pane focus (h/l, DESIGN Section 7) ---- */
  const focusPane = useCallback((pane: ActivePane) => {
    if (pane === 'sidebar') {
      // The selected feed row, else the active smart view, else any button.
      const root = document.querySelector('aside[aria-label="Feeds"]');
      const target =
        root?.querySelector<HTMLElement>('[aria-current="true"]') ??
        root?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
        root?.querySelector<HTMLElement>('button');
      target?.focus();
    } else if (pane === 'list') {
      // The roving-tabindex row (selected, else first).
      document.querySelector<HTMLElement>('#articles [tabindex="0"]')?.focus();
    } else {
      readerRef.current?.focus();
    }
  }, []);

  /* Momentum-style reader scrolling for j/k/Arrow (line) and f/b (full page). Each
     press nudges a target; one rAF loop eases the live scrollTop toward it, so holding
     the key glides continuously instead of stepping. Reduced motion -> instant jump. */
  const readerScroll = useRef({ target: 0, raf: 0 });
  const scrollReader = useCallback(
    (dir: -1 | 1, amount: 'line' | 'page' = 'line') => {
      const el = readerRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return;
      // Full page keeps a sliver of overlap (0.9) for reading continuity.
      const frac = amount === 'page' ? 0.9 : 0.16;
      const step = Math.max(48, Math.round(el.clientHeight * frac));

      if (reduceMotion) {
        el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + dir * step));
        return;
      }

      const s = readerScroll.current;
      // Re-seed the target from the live position whenever no glide is in flight, so
      // manual wheel/trackpad scrolling and article changes stay in sync.
      if (!s.raf) s.target = el.scrollTop;
      s.target = Math.max(0, Math.min(max, s.target + dir * step));

      const tick = () => {
        const node = readerRef.current;
        if (!node) {
          s.raf = 0;
          return;
        }
        const diff = s.target - node.scrollTop;
        if (Math.abs(diff) <= 1) {
          node.scrollTop = s.target;
          s.raf = 0;
          return;
        }
        const ease = diff * 0.22;
        // Guarantee >= 1px of progress so an integer-snapped scrollTop can't stall.
        node.scrollTop = node.scrollTop + (Math.abs(ease) < 1 ? Math.sign(diff) : ease);
        s.raf = requestAnimationFrame(tick);
      };
      if (!s.raf) s.raf = requestAnimationFrame(tick);
    },
    [reduceMotion],
  );

  /** Move DOM focus onto the freshly selected feed/view after a sidebar j/k. */
  const onSidebarFocusFollow = useCallback(() => {
    // One frame so the sidebar re-renders the new aria-current/aria-pressed target first.
    requestAnimationFrame(() => focusPane('sidebar'));
  }, [focusPane]);

  const detectPane = useCallback((): ActivePane => {
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body) {
      if (readerRef.current?.contains(active)) return 'reader';
      if (document.querySelector('aside[aria-label="Feeds"]')?.contains(active)) return 'sidebar';
      if (document.getElementById('articles')?.contains(active)) return 'list';
    }
    // Focus is in the topbar or nowhere: fall back to the routed pane (authoritative
    // on < 768px, the last-known pane on desktop).
    return activePane;
  }, [activePane]);

  const onMovePaneFocus = useCallback(
    (delta: -1 | 1) => {
      const current = detectPane();
      const idx = PANE_ORDER.indexOf(current);
      const next = PANE_ORDER[Math.max(0, Math.min(PANE_ORDER.length - 1, idx + delta))]!;
      if (next === current) return;
      goToPane(next); // keeps the < 768px single-pane router in sync; inert on desktop
      // One frame so the mobile router can mount the target pane before focusing.
      requestAnimationFrame(() => focusPane(next));
    },
    [detectPane, goToPane, focusPane],
  );

  const onEscape = useCallback(() => {
    // Priority: (1) close help; (2) clear search + blur to list;
    // (3) if reader focused, return focus to the selected row; (4) no-op.
    if (uiStore.getState().helpOpen) {
      uiStore.setHelpOpen(false);
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const searchEl = searchInputRef.current;
    if (searchEl && active === searchEl) {
      uiStore.clearSearch();
      searchEl.blur();
      focusSelectedRow();
      return;
    }
    const readerEl = document.querySelector('[aria-label="Reader"]');
    if (active && readerEl && readerEl.contains(active)) {
      focusSelectedRow();
      return;
    }
    // no-op
  }, [focusSelectedRow]);

  /* ---- Keyboard nav ---- */
  useKeyboardNav({
    items,
    selectedItemId,
    onSelectItem: selectItem,
    onOpenReader: openReader,
    sidebarTargets,
    currentSidebarIndex,
    onSelectSidebar: selectSidebar,
    onMovePaneFocus,
    getFocusedPane: detectPane,
    onScrollReader: scrollReader,
    onSidebarFocusFollow,
    onToggleRead,
    onToggleStar,
    onMarkAllRead,
    onRefreshCurrent,
    onRefreshAll,
    onOpenOriginal,
    onFocusSearch: focusSearch,
    onEscape,
    onToggleHelp: toggleHelp,
    onCycleTheme: cycleTheme,
    announce,
    disabled: helpOpen,
  });

  /* ---- Derived pane states (DESIGN Section 6) ---- */
  const listState = useMemo<PaneState>(() => {
    if (itemsQuery.isLoading) return { status: 'loading' };
    if (itemsQuery.isError) {
      return {
        status: 'error',
        errorMessage: itemsQuery.error?.message ?? 'Could not load articles.',
        onRetry: () => itemsQuery.refetch(),
      };
    }
    if (items.length === 0) {
      let emptyKind: PaneState['emptyKind'];
      if (debouncedQ) emptyKind = 'search-no-match';
      else if (selection.kind === 'unread') emptyKind = 'unread-clear';
      else if (selection.kind === 'starred') emptyKind = 'starred-empty';
      else if (selection.kind === 'feed') emptyKind = 'feed-empty';
      else emptyKind = 'feed-empty';
      return { status: 'empty', emptyKind };
    }
    return { status: 'ready' };
  }, [itemsQuery, items, debouncedQ, selection]);

  const readerState = useMemo<PaneState>(() => {
    if (selectedItemId == null) return { status: 'empty', emptyKind: 'no-feed' };
    if (itemQuery.isLoading) return { status: 'loading' };
    if (itemQuery.isError) {
      return {
        status: 'error',
        errorMessage: itemQuery.error?.message ?? 'Could not open this article.',
        onRetry: () => itemQuery.refetch(),
      };
    }
    return { status: 'ready' };
  }, [selectedItemId, itemQuery]);

  const sidebarState = useMemo<PaneState>(() => {
    if (feedsQuery.isLoading) return { status: 'loading' };
    if (feedsQuery.isError) {
      return {
        status: 'error',
        errorMessage: feedsQuery.error?.message ?? 'Could not load your feeds.',
        onRetry: () => feedsQuery.refetch(),
      };
    }
    if ((feedsQuery.data?.feeds.length ?? 0) === 0) return { status: 'empty' };
    return { status: 'ready' };
  }, [feedsQuery]);

  /* ---- Mobile back breadcrumb label ---- */
  const backLabel = activePane === 'reader' ? 'List' : 'Feeds';

  /* ---- Topbar content (SearchBox + Help; Sidebar hosts refresh/OPML/theme) ---- */
  const topbar = (
    <>
      <SearchBox
        ref={searchInputRef}
        value={searchText}
        onChange={onSearchChange}
        onClear={onClearSearch}
      />
      <RefreshAllButton pending={refreshAll.isPending} onClick={onRefreshAll} />
      <button
        type="button"
        onClick={toggleHelp}
        aria-label="Keyboard shortcuts"
        className="rounded-md px-2 py-1 text-text-secondary hover:bg-surface"
      >
        <kbd className="text-xs">?</kbd>
      </button>
    </>
  );

  const feeds = feedsQuery.data?.feeds ?? [];
  const totals = feedsQuery.data?.totals ?? { all: 0, unread: 0, starred: 0 };

  return (
    <>
      <AppShell
        theme={resolved}
        activePane={activePane}
        onBack={onBack}
        backLabel={backLabel}
        topbar={topbar}
        sidebarProps={{
          feeds,
          totals,
          selection,
          state: sidebarState,
          isRefreshingAll: refreshAll.isPending,
          onSelectView: selectView,
          onSelectFeed: selectFeed,
          onDeleteFeed,
          onAddFeed: (url: string) => addFeed.mutate(url),
          addPending: addFeed.isPending,
          addError: addFeed.error?.message ?? null,
          onImportOpml: (file: File) => opml.importOpml(file),
          onExportOpml: opml.exportOpml,
          opmlPending: opml.importPending,
          theme,
          onChangeTheme: setTheme,
        }}
        listProps={{
          items,
          total: itemsQuery.data?.total ?? 0,
          selectedId: selectedItemId,
          onSelect: selectItem,
          onOpen: openReader,
          onToggleStar,
          state: listState,
        }}
        readerProps={{
          item: itemQuery.data?.item,
          onToggleRead: () => {
            if (selectedItemId != null) onToggleRead(selectedItemId);
          },
          onToggleStar: () => {
            if (selectedItemId != null) onToggleStar(selectedItemId);
          },
          onOpenOriginal: () => {
            const item = itemQuery.data?.item;
            if (item?.link) window.open(item.link, '_blank', 'noopener,noreferrer');
          },
          state: readerState,
          scrollRef: readerRef,
          onBack,
        }}
      />

      <HelpOverlay open={helpOpen} onClose={() => uiStore.setHelpOpen(false)} />

      <ToastViewport>
        {toasts.map((t) => (
          <Toast
            key={t.id}
            kind={t.kind === 'error' ? 'error' : 'success'}
            message={t.message}
            action={t.action}
            durationMs={t.durationMs}
            onDismiss={() => dismissToast(t.id)}
          />
        ))}
      </ToastViewport>

      {/* Polite aria-live region for transient action results. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>
    </>
  );
}
