// ReaderPane: the right pane. Renders the server-sanitized `contentHtml` via
// dangerouslySetInnerHTML inside a div.reader-prose (already safe; never
// re-sanitized). Header shows title, source, author, and date; the Toolbar holds
// read/star/open-original. ARIA section labeled Reader wrapping an article.
// Renders loading (ReaderSkeleton), the empty/error states (DESIGN Section 6),
// and animates content on article change (key={item.id}): opacity 0 -> 1 + y
// 6 -> 0, 200ms ease-out, gated by useReducedMotion (DESIGN Section 10).
import { motion, useReducedMotion } from 'motion/react';
import { Newspaper } from '@phosphor-icons/react';
import { ReaderSkeleton } from './ReaderSkeleton';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Toolbar } from './Toolbar';
import { RelativeTime } from './RelativeTime';
import type { PaneState } from './paneState';
import type { Item } from '../../shared/types';
import type { Ref } from 'react';

interface ReaderPaneProps {
  item: Item | undefined;
  onToggleRead: () => void;
  onToggleStar: () => void;
  onOpenOriginal: () => void;
  state: PaneState;
  /** Scroll container ref so the shell can move DOM focus here on open. */
  scrollRef?: Ref<HTMLElement>;
  /** Mobile back nav (not rendered on desktop). Optional. */
  onBack?: () => void;
}

export function ReaderPane({
  item,
  onToggleRead,
  onToggleStar,
  onOpenOriginal,
  state,
  scrollRef,
}: ReaderPaneProps) {
  const reduce = useReducedMotion();

  let body: React.ReactNode;

  if (state.status === 'loading') {
    body = <ReaderSkeleton />;
  } else if (state.status === 'error') {
    body = (
      <ErrorState
        message={state.errorMessage ?? 'Could not open this article.'}
        onRetry={state.onRetry ?? (() => {})}
      />
    );
  } else if (!item) {
    body = (
      <EmptyState
        icon={Newspaper}
        title="Select an article"
        body="Choose an article from the list to read it here."
      />
    );
  } else if (item.contentHtml.trim() === '') {
    body = (
      <EmptyState
        icon={Newspaper}
        title="This article has no readable body."
        body="The feed did not include any content for this article."
        action={item.link ? { label: 'Open original', onClick: onOpenOriginal } : undefined}
      />
    );
  } else {
    body = (
      <article aria-label={item.title} className="px-6 py-6">
        <header className="mb-5 flex flex-col gap-2 border-b border-border pb-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-semibold leading-tight text-text-primary">
              {item.title}
            </h1>
            <div className="shrink-0">
              <Toolbar
                item={item}
                onToggleRead={onToggleRead}
                onToggleStar={onToggleStar}
                onOpenOriginal={onOpenOriginal}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
            <span className="text-text-secondary">{item.feedTitle}</span>
            {item.author ? (
              <>
                <span aria-hidden="true">-</span>
                <span>{item.author}</span>
              </>
            ) : null}
            <span aria-hidden="true">-</span>
            <span className="num">
              <RelativeTime value={item.publishedAt} />
            </span>
          </div>
        </header>

        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
          className="reader-prose text-text-primary"
          // Server-sanitized HTML (PLAN Section 5.4); intentionally not re-sanitized.
          dangerouslySetInnerHTML={{ __html: item.contentHtml }}
        />
      </article>
    );
  }

  return (
    <section
      ref={scrollRef}
      aria-label="Reader"
      aria-busy={state.status === 'loading' ? true : undefined}
      tabIndex={-1}
      className="h-full overflow-y-auto bg-bg outline-none"
    >
      {body}
    </section>
  );
}
