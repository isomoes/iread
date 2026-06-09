// Sidebar: hosts smart views, the feed list, add-feed form, OPML menu, and theme
// toggle. Renders loading (ListSkeleton variant 'feed'), empty, and error states
// with the exact DESIGN Section 6 copy. The shell renders this inside its
// complementary/nav landmark, so this component is the inner content only.
import { useRef } from 'react';
import { TrayArrowUp } from '@phosphor-icons/react';
import type { FeedWithCounts, SmartView, ViewTotals } from '../../shared/types';
import type { PaneState } from './paneState';
import { SmartViews } from './SmartViews';
import { FeedRow } from './FeedRow';
import { AddFeedForm } from './AddFeedForm';
import { OpmlMenu } from './OpmlMenu';
import type { OpmlMenuHandle } from './OpmlMenu';
import { ThemeToggle } from './ThemeToggle';
import { ListSkeleton } from './ListSkeleton';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

export type SidebarSelection =
  | { kind: 'all' | 'unread' | 'starred' }
  | { kind: 'feed'; feedId: number };

type Theme = 'light' | 'dark' | 'system';

interface SidebarProps {
  feeds: FeedWithCounts[];
  totals: ViewTotals;
  selection: SidebarSelection;
  state: PaneState;
  isRefreshingAll: boolean;
  onSelectView: (view: SmartView) => void;
  onSelectFeed: (feedId: number) => void;
  onDeleteFeed: (feedId: number) => void;
  onAddFeed: (url: string) => void;
  addPending: boolean;
  addError?: string | null;
  onImportOpml: (file: File) => void;
  onExportOpml: () => void;
  opmlPending: boolean;
  theme: Theme;
  onChangeTheme: (theme: Theme) => void;
}

export function Sidebar({
  feeds,
  totals,
  selection,
  state,
  isRefreshingAll,
  onSelectView,
  onSelectFeed,
  onDeleteFeed,
  onAddFeed,
  addPending,
  addError,
  onImportOpml,
  onExportOpml,
  opmlPending,
  theme,
  onChangeTheme,
}: SidebarProps) {
  const opmlRef = useRef<OpmlMenuHandle | null>(null);
  const activeView: SmartView = selection.kind === 'feed' ? 'all' : selection.kind;
  const selectedFeedId = selection.kind === 'feed' ? selection.feedId : null;

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-surface"
      aria-busy={isRefreshingAll ? true : undefined}
    >
      <div className="flex flex-col gap-2 border-b border-border px-3 py-3">
        <AddFeedForm onSubmit={onAddFeed} pending={addPending} error={addError} />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="px-1 pb-2">
          <SmartViews totals={totals} active={activeView} onChange={onSelectView} />
        </div>

        <p className="px-1 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-text-muted">
          Feeds
        </p>

        {state.status === 'loading' ? (
          <ListSkeleton rows={5} variant="feed" />
        ) : state.status === 'error' ? (
          <ErrorState
            message={state.errorMessage ?? 'Could not load your feeds.'}
            onRetry={state.onRetry ?? (() => {})}
          />
        ) : state.status === 'empty' || feeds.length === 0 ? (
          <EmptyState
            icon={TrayArrowUp}
            title="No feeds yet"
            body="Add a feed by URL above, or import an OPML file to get started."
            action={{ label: 'Import OPML', onClick: () => opmlRef.current?.openPicker() }}
          />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {feeds.map((feed) => (
              <li key={feed.id}>
                <FeedRow
                  feed={feed}
                  selected={selectedFeedId === feed.id}
                  onSelect={() => onSelectFeed(feed.id)}
                  onDelete={() => onDeleteFeed(feed.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-border px-2 py-2">
        <OpmlMenu
          ref={opmlRef}
          onImport={onImportOpml}
          onExport={onExportOpml}
          pending={opmlPending}
        />
        <div className="ml-auto">
          <ThemeToggle theme={theme} onChange={onChangeTheme} />
        </div>
      </div>
    </div>
  );
}
