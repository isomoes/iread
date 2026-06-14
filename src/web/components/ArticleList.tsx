// ArticleList: the middle pane. role="listbox" labeled Articles, with roving
// tabindex (one row tabIndex 0, the rest -1). Renders loading (ListSkeleton
// variant 'article', 8 rows, NOT a spinner), the contextual empty states, and the
// error state, all with exact DESIGN Section 6 copy. Row-enter motion: opacity
// 0 -> 1 + y 4 -> 0, staggered 18ms, capped at the first 12 rows, gated by
// useReducedMotion (DESIGN Section 10).
import { useCallback, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Tray } from '@phosphor-icons/react';
import { CheckCircle } from '@phosphor-icons/react';
import { Star } from '@phosphor-icons/react';
import { ListMagnifyingGlass } from '@phosphor-icons/react';
import { Rss } from '@phosphor-icons/react';
import { ArticleRow } from './ArticleRow';
import { ListSkeleton } from './ListSkeleton';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import type { EmptyKind, PaneState } from './paneState';
import type { ItemSummary } from '../../shared/types';

interface ArticleListProps {
  items: ItemSummary[];
  total: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Open the selected item in the reader (Enter / click-through). */
  onOpen: (id: number) => void;
  onToggleStar: (id: number) => void;
  state: PaneState;
}

const STAGGER_MS = 18;
const STAGGER_CAP = 12;

export function ArticleList({
  items,
  total: _total,
  selectedId,
  onSelect,
  onOpen,
  onToggleStar,
  state,
}: ArticleListProps) {
  const reduce = useReducedMotion();

  // The roving-tabindex anchor: the selected row, else the first row.
  const rovingId = selectedId != null ? selectedId : (items[0]?.id ?? null);

  // Track each rendered row's DOM node so keyboard nav can scroll the selected row
  // into view and move roving focus to it (DESIGN Section 7: "roving focus + scroll
  // into view"). ArticleRow forwards its ref; we key the nodes by item id.
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const setRowRef = useCallback((id: number) => {
    return (node: HTMLDivElement | null) => {
      if (node) rowRefs.current.set(id, node);
      else rowRefs.current.delete(id);
    };
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    const el = rowRefs.current.get(selectedId);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    // Only pull DOM focus when keyboard nav already lives in the list (or focus is on
    // body), so we never yank focus away from the search input or the reader pane.
    const active = document.activeElement as HTMLElement | null;
    const inList = !active || active === document.body || listRef.current?.contains(active);
    if (inList) el.focus({ preventScroll: true });
  }, [selectedId, items]);

  let body: React.ReactNode;

  if (state.status === 'loading') {
    body = <ListSkeleton rows={8} variant="article" />;
  } else if (state.status === 'error') {
    body = (
      <ErrorState
        message={state.errorMessage ?? 'This feed failed to refresh.'}
        onRetry={state.onRetry ?? (() => {})}
      />
    );
  } else if (state.status === 'empty' || items.length === 0) {
    body = renderEmpty(state.emptyKind);
  } else {
    body = (
      <ul className="flex flex-col">
        {items.map((item, i) => {
          const delay = reduce ? 0 : Math.min(i, STAGGER_CAP) * (STAGGER_MS / 1000);
          return (
            <li key={item.id}>
              <RevealRow delay={delay} reduce={!!reduce}>
                <ArticleRow
                  ref={setRowRef(item.id)}
                  item={item}
                  selected={selectedId === item.id}
                  onSelect={() => onSelect(item.id)}
                  onOpen={() => onOpen(item.id)}
                  onToggleStar={() => onToggleStar(item.id)}
                  tabIndex={rovingId === item.id ? 0 : -1}
                />
              </RevealRow>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div
      ref={listRef}
      id="articles"
      role="listbox"
      aria-label="Articles"
      tabIndex={-1}
      aria-busy={state.status === 'loading' ? true : undefined}
      className="h-full overflow-y-auto bg-surface outline-none"
    >
      {body}
    </div>
  );
}

function RevealRow({
  children,
  delay,
  reduce,
}: {
  children: React.ReactNode;
  delay: number;
  reduce: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.16, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
}

function renderEmpty(kind: EmptyKind | undefined) {
  switch (kind) {
    case 'feed-empty':
      return (
        <EmptyState
          icon={Tray}
          title="Nothing here yet"
          body="This feed has no articles. Try refreshing with r."
        />
      );
    case 'unread-clear':
      return (
        <EmptyState
          icon={CheckCircle}
          title="You are all caught up"
          body="No unread articles in this view."
        />
      );
    case 'starred-empty':
      return (
        <EmptyState
          icon={Star}
          title="No starred articles"
          body="Press s on an article to star it."
        />
      );
    case 'search-no-match':
      return (
        <EmptyState
          icon={ListMagnifyingGlass}
          title="No matches"
          body="No articles match your search in this view. Press Esc to clear."
        />
      );
    case 'no-feed':
    default:
      return (
        <EmptyState
          icon={Rss}
          title="Pick a feed"
          body="Select a feed on the left to see its articles."
        />
      );
  }
}
