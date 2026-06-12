// src/web/components/AppShell.tsx
// Three-pane CSS Grid + topbar with ARIA landmarks, skip link, and the < 768px
// single-column activePane routing with transform-X pane slides.
// Renders Sidebar / ArticleList / ReaderPane (built by the presentation agent).

import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { Sidebar } from './Sidebar';
import { ArticleList } from './ArticleList';
import { ReaderPane } from './ReaderPane';
import type { ComponentProps } from 'react';

export type ActivePane = 'sidebar' | 'list' | 'reader';

export interface AppShellProps {
  /** Resolved light/dark, mirrored onto the shell for any pane-local theming. */
  theme: 'light' | 'dark';
  /** Which pane is visible on < 768px viewports. */
  activePane: ActivePane;
  /** Move the mobile back-nav one level up (reader -> list -> sidebar). */
  onBack: () => void;
  /** Breadcrumb label shown beside the mobile back button. */
  backLabel: string;

  /** Topbar content (search box, theme toggle, refresh-all, help, etc.). */
  topbar: ReactNode;

  /** Grouped props for the three panes, passed straight through. */
  sidebarProps: ComponentProps<typeof Sidebar>;
  listProps: ComponentProps<typeof ArticleList>;
  readerProps: ComponentProps<typeof ReaderPane>;
}

const MOBILE_QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    try {
      return matchMedia(MOBILE_QUERY).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mql: MediaQueryList;
    try {
      mql = matchMedia(MOBILE_QUERY);
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export function AppShell({
  activePane,
  onBack,
  backLabel,
  topbar,
  sidebarProps,
  listProps,
  readerProps,
}: AppShellProps) {
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();

  const sidebar = (
    <aside
      aria-label="Feeds"
      className="flex min-h-0 flex-col overflow-y-auto border-border bg-surface md:border-r"
      style={{ gridArea: 'sidebar' }}
    >
      <nav aria-label="Feeds" className="flex min-h-0 flex-1 flex-col">
        <Sidebar {...sidebarProps} />
      </nav>
    </aside>
  );

  const list = (
    <main
      aria-label="Articles"
      className="flex min-h-0 flex-col overflow-y-auto border-border bg-surface md:border-r"
      style={{ gridArea: 'list' }}
    >
      <ArticleList {...listProps} />
    </main>
  );

  const reader = (
    <section
      aria-label="Reader"
      className="flex min-h-0 flex-col overflow-y-auto bg-bg"
      style={{ gridArea: 'reader' }}
    >
      <ReaderPane {...readerProps} />
    </section>
  );

  return (
    <div className="app-shell">
      {/* Skip link: first focusable element. */}
      <a
        href="#articles"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-foreground"
      >
        Skip to articles
      </a>

      <header
        role="banner"
        className="flex items-center gap-2 border-b border-border bg-surface-elevated px-3"
        style={{ gridArea: 'topbar', minHeight: '48px' }}
      >
        {isMobile && activePane !== 'sidebar' ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-text-secondary hover:bg-surface"
          >
            <ArrowLeft weight="regular" aria-hidden />
            <span className="num text-xs">{backLabel}</span>
          </button>
        ) : (
          <div className="flex shrink-0 items-baseline gap-1.5 px-1" aria-label="iread">
            <span className="text-sm font-semibold tracking-tight text-text-primary">iread</span>
            <span className="num text-[10px] text-text-muted">v{__APP_VERSION__}</span>
          </div>
        )}
        <div className="flex flex-1 items-center justify-end gap-2">{topbar}</div>
      </header>

      {isMobile ? (
        <div
          className="relative min-h-0 overflow-hidden"
          style={{ gridArea: 'active-pane' }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={activePane}
              className="absolute inset-0 flex min-h-0 flex-col"
              initial={reduceMotion ? false : { x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { x: -16, opacity: 0 }}
              transition={
                reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 32 }
              }
            >
              {activePane === 'sidebar' && sidebar}
              {activePane === 'list' && list}
              {activePane === 'reader' && reader}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <>
          {sidebar}
          {list}
          {reader}
        </>
      )}
    </div>
  );
}
