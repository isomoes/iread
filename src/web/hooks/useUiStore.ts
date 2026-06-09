// src/web/hooks/useUiStore.ts
// Local UI state (NOT react-query), per DESIGN Section 8.
// Tiny external store backed by useSyncExternalStore. No extra deps.

import { useCallback, useSyncExternalStore } from 'react';
import type { SmartView } from '../../shared/types';

/** The current sidebar selection: a smart view or a specific feed. */
export type Selection =
  | { kind: 'all' | 'unread' | 'starred' }
  | { kind: 'feed'; feedId: number };

export type Theme = 'light' | 'dark' | 'system';

export interface AutoRefresh {
  enabled: boolean;
  intervalMs: number;
}

export interface UiState {
  selection: Selection;
  selectedItemId: number | null;
  /** Raw, controlled search input. Debounced before entering a query key. */
  searchText: string;
  theme: Theme;
  autoRefresh: AutoRefresh;
  helpOpen: boolean;
}

const THEME_KEY = 'iread-theme';
const AUTO_REFRESH_KEY = 'iread-auto-refresh';
const DEFAULT_INTERVAL_MS = 300_000; // 5 minutes

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

function readAutoRefresh(): AutoRefresh {
  try {
    const raw = localStorage.getItem(AUTO_REFRESH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AutoRefresh>;
      const intervalMs =
        typeof parsed.intervalMs === 'number' && parsed.intervalMs > 0
          ? parsed.intervalMs
          : DEFAULT_INTERVAL_MS;
      const enabled = typeof parsed.enabled === 'boolean' ? parsed.enabled : true;
      return { enabled, intervalMs };
    }
  } catch {
    /* ignore */
  }
  return { enabled: true, intervalMs: DEFAULT_INTERVAL_MS };
}

let state: UiState = {
  selection: { kind: 'all' },
  selectedItemId: null,
  searchText: '',
  theme: readTheme(),
  autoRefresh: readAutoRefresh(),
  helpOpen: false,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): UiState {
  return state;
}

function setState(patch: Partial<UiState>): void {
  state = { ...state, ...patch };
  emit();
}

/** Imperative store API usable outside React (e.g. keyboard handler closures). */
export const uiStore = {
  getState(): UiState {
    return state;
  },
  setSelection(selection: Selection): void {
    // Changing selection clears the active item; the controller re-selects the first.
    setState({ selection, selectedItemId: null });
  },
  setSelectedItemId(selectedItemId: number | null): void {
    setState({ selectedItemId });
  },
  setSearchText(searchText: string): void {
    setState({ searchText });
  },
  clearSearch(): void {
    if (state.searchText !== '') setState({ searchText: '' });
  },
  setTheme(theme: Theme): void {
    setState({ theme });
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  },
  setAutoRefresh(next: Partial<AutoRefresh>): void {
    const autoRefresh = { ...state.autoRefresh, ...next };
    setState({ autoRefresh });
    try {
      localStorage.setItem(AUTO_REFRESH_KEY, JSON.stringify(autoRefresh));
    } catch {
      /* ignore */
    }
  },
  setHelpOpen(helpOpen: boolean): void {
    setState({ helpOpen });
  },
  toggleHelp(): void {
    setState({ helpOpen: !state.helpOpen });
  },
};

/** Subscribe a component to the whole UI state. */
export function useUiStore(): UiState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Subscribe with a selector to avoid re-rendering on unrelated changes.
 * The selector must return a stable (referentially-comparable) value.
 */
export function useUiSelector<T>(selector: (s: UiState) => T): T {
  const getSelected = useCallback(() => selector(state), [selector]);
  return useSyncExternalStore(subscribe, getSelected, getSelected);
}

/* ---------- Toast store (transient notifications, also local UI state) ---------- */

// The Toast component renders 'error' | 'success'. 'info' is treated as 'success'
// (neutral, non-error) so callers can express a neutral note without a third visual.
export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
  /** ms before auto-dismiss; 0 disables auto-dismiss. The Toast component owns the timer. */
  durationMs: number;
}

export interface ToastInput {
  kind: ToastKind;
  message: string;
  action?: ToastAction;
  durationMs?: number;
}

let toasts: Toast[] = [];
let nextToastId = 1;
const toastListeners = new Set<() => void>();

function emitToasts(): void {
  for (const l of toastListeners) l();
}

function subscribeToasts(listener: () => void): () => void {
  toastListeners.add(listener);
  return () => {
    toastListeners.delete(listener);
  };
}

function getToastsSnapshot(): Toast[] {
  return toasts;
}

/**
 * Push a toast; returns its id. The Toast component schedules its own auto-dismiss
 * from durationMs and calls onDismiss(id), so the store does not run a timer here.
 */
export function toast(input: ToastInput): number {
  const id = nextToastId++;
  const durationMs = input.durationMs ?? (input.action ? 8000 : 4000);
  const t: Toast = {
    id,
    kind: input.kind,
    message: input.message,
    action: input.action,
    durationMs,
  };
  toasts = [...toasts, t];
  emitToasts();
  return id;
}

export function dismissToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emitToasts();
  }
}

/** Subscribe a component (the ToastViewport) to the live toast list. */
export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribeToasts, getToastsSnapshot, getToastsSnapshot);
}

/* ---------- Map the current Selection to the react-query ViewKey + list-query params ---------- */

export type ViewKey = SmartView | `feed:${number}`;

export function selectionToViewKey(selection: Selection): ViewKey {
  return selection.kind === 'feed' ? `feed:${selection.feedId}` : selection.kind;
}

/** The smart-view enum (or undefined) plus optional feedId for a Selection. */
export function selectionToQuery(selection: Selection): {
  view?: SmartView;
  feedId?: number;
} {
  if (selection.kind === 'feed') return { feedId: selection.feedId };
  return { view: selection.kind };
}
