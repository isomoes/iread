// src/web/hooks/useTheme.ts
// light / dark / system theme. localStorage key 'iread-theme'.
// Keeps <html> .dark / .theme-light in sync (DESIGN Section 2).
// The blocking inline script in index.html sets the first-paint class;
// this hook keeps it correct after hydration and on toggle / system change.

import { useCallback, useEffect } from 'react';
import { uiStore, useUiSelector, type Theme } from './useUiStore';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  try {
    return matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/** Resolve a theme choice to the literal light/dark that should be painted. */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

/** Apply the resolved theme to <html>: .dark for dark, .theme-light for explicit light. */
function applyTheme(theme: Theme): void {
  const el = document.documentElement;
  const resolved = resolveTheme(theme);
  el.classList.toggle('dark', resolved === 'dark');
  // .theme-light exists only so the prefers-color-scheme CSS fallback does not
  // override an EXPLICIT light choice. System mode must not carry it.
  el.classList.toggle('theme-light', theme === 'light');
}

export interface UseThemeResult {
  theme: Theme;
  /** The literal light/dark currently painted. */
  resolved: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  /** Cycle light -> dark -> system -> light (the `t` keybinding). */
  cycleTheme: () => void;
}

export function useTheme(): UseThemeResult {
  const theme = useUiSelector((s) => s.theme);

  // Keep <html> in sync whenever the choice changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // When in system mode, react to OS preference changes live.
  useEffect(() => {
    if (theme !== 'system') return;
    let mql: MediaQueryList;
    try {
      mql = matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = () => applyTheme('system');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    uiStore.setTheme(next);
  }, []);

  const cycleTheme = useCallback(() => {
    const order: Theme[] = ['light', 'dark', 'system'];
    const idx = order.indexOf(uiStore.getState().theme);
    const next = order[(idx + 1) % order.length] ?? 'system';
    uiStore.setTheme(next);
  }, []);

  return { theme, resolved: resolveTheme(theme), setTheme, cycleTheme };
}
