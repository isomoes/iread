// ArticleRow: one row in the article list. role="option" with aria-selected.
// Shows UnreadDot, title, source feedTitle, mono published date, and a star toggle.
// Read/unread + starred are spelled into the accessible name (never color alone).
// whileTap scale 0.98; selected gets the shared layoutId="rowSelect" accent bar
// (DESIGN Sections 4, 7, 10). The shell owns roving tabindex via the `tabIndex` prop.
import { forwardRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Star } from '@phosphor-icons/react';
import { UnreadDot } from './UnreadDot';
import { PublishedDate } from './PublishedDate';
import type { ItemSummary } from '../../shared/types';

interface ArticleRowProps {
  item: ItemSummary;
  selected: boolean;
  /** Move selection to this row (roving focus / hover intent). */
  onSelect: () => void;
  /** Open this row in the reader (click-through / Enter). */
  onOpen: () => void;
  onToggleStar: () => void;
  tabIndex?: number;
}

export const ArticleRow = forwardRef<HTMLDivElement, ArticleRowProps>(
  function ArticleRow({ item, selected, onSelect, onOpen, onToggleStar, tabIndex = -1 }, ref) {
    const reduce = useReducedMotion();

    const readLabel = item.isRead ? 'read' : 'unread';
    const starLabel = item.isStarred ? ', starred' : '';
    const label = `${item.title}, ${item.feedTitle}, ${readLabel}${starLabel}`;

    return (
      <motion.div
        ref={ref}
        role="option"
        aria-selected={selected}
        aria-label={label}
        tabIndex={tabIndex}
        onClick={onOpen}
        onFocus={onSelect}
        whileTap={reduce ? undefined : { scale: 0.98 }}
        className={`group relative flex cursor-pointer items-start gap-2 border-b border-border px-3 py-2 transition-colors ${
          selected ? 'bg-accent/10' : 'hover:bg-surface-elevated'
        }`}
      >
        {selected ? (
          <motion.span
            layoutId="rowSelect"
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-0.5 bg-accent"
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
          />
        ) : null}

        <span className="mt-1.5 shrink-0">
          <UnreadDot active={!item.isRead} />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={`truncate text-sm ${
              item.isRead ? 'text-text-secondary' : 'font-medium text-text-primary'
            }`}
          >
            {item.title}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="truncate">{item.feedTitle}</span>
            <span aria-hidden="true">-</span>
            <span className="num shrink-0">
              <PublishedDate value={item.publishedAt} />
            </span>
          </span>
        </span>

        <button
          type="button"
          aria-label={item.isStarred ? `Unstar ${item.title}` : `Star ${item.title}`}
          aria-pressed={item.isStarred}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          className={`shrink-0 rounded-xs p-1 transition-opacity ${
            item.isStarred
              ? 'text-accent opacity-100'
              : 'text-text-muted opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
          }`}
        >
          <Star size={16} weight="regular" />
        </button>
      </motion.div>
    );
  },
);
