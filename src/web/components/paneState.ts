// Shared pane-state contract between the shell controller (App.tsx) and the
// data-backed presentation panes (Sidebar, ArticleList, ReaderPane). The shell
// builds these objects; the panes render loading / error / empty / ready against
// them with the exact DESIGN Section 6 copy. Structurally identical to the
// PaneState the controller declares, kept here so the panes own no upward import.

export type PaneStatus = 'loading' | 'error' | 'empty' | 'ready';

/** Which empty-state copy the article list should show (DESIGN Section 6). */
export type EmptyKind =
  | 'no-feed'
  | 'feed-empty'
  | 'unread-clear'
  | 'starred-empty'
  | 'search-no-match';

export interface PaneState {
  status: PaneStatus;
  /** Present when status === 'error'. */
  errorMessage?: string;
  /** Retry handler for the error state. */
  onRetry?: () => void;
  /** Hint for the article-list empty-state copy. Undefined for non-list panes. */
  emptyKind?: EmptyKind;
}
