// src/web/hooks/useKeyboardNav.ts
// Global single-key handler with the typing/modifier/IME guard and the full key map
// from DESIGN Section 7. Operates over the live filtered list; never fires while typing.

import { useEffect, useRef } from 'react';
import type { ItemSummary } from '../../shared/types';
import type { ActivePane } from '../components/AppShell';

/** A navigable sidebar target: a smart view or a feed. Ordered views-first. */
export type SidebarTarget =
  | { kind: 'all' | 'unread' | 'starred' }
  | { kind: 'feed'; feedId: number };

export interface KeyboardNavConfig {
  /** The live, filtered list the nav keys operate over. */
  items: ItemSummary[];
  selectedItemId: number | null;
  /** Move selection to an item id (roving focus + scroll handled by the list).
      On >=768px the reader pane shows the selection; the item navigated AWAY from
      is auto-marked read (mark-on-leave). */
  onSelectItem: (id: number) => void;
  /** Open the selected item in the reader (Enter / o); also auto-marks read. */
  onOpenReader: (id: number) => void;

  /** Ordered sidebar targets (smart views then feeds) for J/K feed cycling. */
  sidebarTargets: SidebarTarget[];
  /** Index of the currently-selected sidebar target, or -1. */
  currentSidebarIndex: number;
  onSelectSidebar: (target: SidebarTarget) => void;

  /** Move pane focus horizontally (h/l): -1 toward the sidebar, +1 toward the reader. */
  onMovePaneFocus: (delta: -1 | 1) => void;

  /** Which pane currently holds focus; j/k and the arrow aliases dispatch per pane. */
  getFocusedPane: () => ActivePane;
  /** Scroll the reader (j/k = line, f/b = full page): dir -1 up, +1 down. */
  onScrollReader: (dir: -1 | 1, amount: 'line' | 'page') => void;
  /** After a sidebar-focused j/k selection, move DOM focus onto the new feed/view row. */
  onSidebarFocusFollow: () => void;

  /** Item-scoped actions. id is the current selection. */
  onToggleRead: (id: number) => void;
  onToggleStar: (id: number) => void;
  onMarkAllRead: () => void;
  onRefreshCurrent: () => void;
  onRefreshAll: () => void;
  /** Open the original link for the given item (v). */
  onOpenOriginal: (item: ItemSummary) => void;

  /** Search / help / theme. */
  onFocusSearch: () => void;
  onEscape: () => void;
  onToggleHelp: () => void;
  onCycleTheme: () => void;

  /** Announce a transient message in the polite aria-live region. */
  announce: (message: string) => void;

  /** When true (help open, etc.) only Esc/? are honored by their owners; nav is inert. */
  disabled?: boolean;
}

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

export function useKeyboardNav(config: KeyboardNavConfig): void {
  // Keep the latest config in a ref so the listener stays stable (single bind).
  const ref = useRef(config);
  ref.current = config;

  useEffect(() => {
    function indexOfSelected(items: ItemSummary[], id: number | null): number {
      if (id == null) return -1;
      return items.findIndex((it) => it.id === id);
    }

    function onKeyDown(e: KeyboardEvent): void {
      const c = ref.current;

      // Esc and the help-overlay manage their own keys regardless of typing state,
      // but Esc while typing in search is still wanted (clear + blur).
      if (e.key === 'Escape') {
        c.onEscape();
        return;
      }

      if (!shouldHandle(e)) return;

      // While disabled (e.g. the help overlay is open) only the help toggle is honored,
      // so `?` can still close it; every other binding goes inert.
      if (c.disabled) {
        if (e.key === '?') {
          e.preventDefault();
          c.onToggleHelp();
        }
        return;
      }

      const { items, selectedItemId } = c;
      const idx = indexOfSelected(items, selectedItemId);

      // Vertical nav is pane-contextual (DESIGN Section 7): in the list it moves the
      // item selection; in the sidebar it moves the feed/view selection (DOM focus
      // follows so repeated presses keep walking); in the reader it scrolls.
      const moveItem = (delta: 1 | -1): void => {
        if (items.length === 0) return;
        const nextIdx = idx < 0 ? 0 : Math.max(0, Math.min(items.length - 1, idx + delta));
        const next = items[nextIdx];
        if (next) c.onSelectItem(next.id);
      };
      const moveSidebar = (delta: 1 | -1): void => {
        const targets = c.sidebarTargets;
        if (targets.length === 0) return;
        const cur = c.currentSidebarIndex;
        const nextIdx = cur < 0 ? 0 : Math.max(0, Math.min(targets.length - 1, cur + delta));
        const t = targets[nextIdx];
        if (!t) return;
        c.onSelectSidebar(t);
        c.onSidebarFocusFollow();
      };

      switch (e.key) {
        /* ---- Vertical nav, pane-contextual (list item / sidebar feed / reader scroll) ---- */
        case 'j':
        case 'ArrowDown': {
          e.preventDefault();
          const pane = c.getFocusedPane();
          if (pane === 'sidebar') moveSidebar(1);
          else if (pane === 'reader') c.onScrollReader(1, 'line');
          else moveItem(1);
          break;
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault();
          const pane = c.getFocusedPane();
          if (pane === 'sidebar') moveSidebar(-1);
          else if (pane === 'reader') c.onScrollReader(-1, 'line');
          else moveItem(-1);
          break;
        }
        case 'n': {
          // Next unread below; wrap to the first unread from the top; else announce.
          e.preventDefault();
          const below = items.slice(idx + 1).find((it) => !it.isRead);
          const target = below ?? items.find((it) => !it.isRead);
          if (target) c.onSelectItem(target.id);
          else c.announce('No unread items');
          break;
        }
        case 'g': {
          e.preventDefault();
          const first = items[0];
          if (first) c.onSelectItem(first.id);
          break;
        }
        case 'G': {
          e.preventDefault();
          const last = items[items.length - 1];
          if (last) c.onSelectItem(last.id);
          break;
        }

        /* ---- Open reader ---- */
        case 'Enter':
        case 'o': {
          e.preventDefault();
          if (selectedItemId != null) c.onOpenReader(selectedItemId);
          break;
        }

        /* ---- Horizontal pane focus (sidebar <- list <- reader, no wrap) ---- */
        case 'h':
        case 'ArrowLeft': {
          e.preventDefault();
          c.onMovePaneFocus(-1);
          break;
        }
        case 'l':
        case 'ArrowRight': {
          e.preventDefault();
          c.onMovePaneFocus(1);
          break;
        }

        /* ---- Reader full-page scroll, forward/back (always targets the reader) ---- */
        case 'f': {
          e.preventDefault();
          c.onScrollReader(1, 'page');
          break;
        }
        case 'b': {
          e.preventDefault();
          c.onScrollReader(-1, 'page');
          break;
        }

        /* ---- Item-state actions ---- */
        case 'm': {
          e.preventDefault();
          if (selectedItemId != null) c.onToggleRead(selectedItemId);
          break;
        }
        case 's': {
          e.preventDefault();
          if (selectedItemId != null) c.onToggleStar(selectedItemId);
          break;
        }
        case 'A': {
          e.preventDefault();
          c.onMarkAllRead();
          break;
        }
        case 'v': {
          e.preventDefault();
          const sel = items.find((it) => it.id === selectedItemId);
          if (sel) c.onOpenOriginal(sel);
          break;
        }

        /* ---- Refresh ---- */
        case 'r': {
          e.preventDefault();
          c.onRefreshCurrent();
          break;
        }
        case 'R': {
          e.preventDefault();
          c.onRefreshAll();
          break;
        }

        /* ---- Search / help / theme ---- */
        case '/': {
          e.preventDefault();
          c.onFocusSearch();
          break;
        }
        case '?': {
          e.preventDefault();
          c.onToggleHelp();
          break;
        }
        case 't': {
          e.preventDefault();
          c.onCycleTheme();
          break;
        }

        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
