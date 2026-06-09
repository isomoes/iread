// FeedRow: one feed row in the sidebar. Glyph + title + mono unreadCount, plus a
// Warning badge when the last fetch errored. Delete button appears on hover/focus.
// Row whileTap scale 0.98 (transform only), gated by useReducedMotion.
// DESIGN Sections 4, 6, 10.
import { motion, useReducedMotion } from 'motion/react';
import { Trash } from '@phosphor-icons/react';
import { Warning } from '@phosphor-icons/react';
import { Badge } from './Badge';
import type { FeedWithCounts } from '../../shared/types';

interface FeedRowProps {
  feed: FeedWithCounts;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function FeedRow({ feed, selected, onSelect, onDelete }: FeedRowProps) {
  const reduce = useReducedMotion();
  const hasError = feed.fetchError != null;

  const label = hasError
    ? `${feed.title}, ${feed.unreadCount} unread, failed to refresh`
    : `${feed.title}, ${feed.unreadCount} unread`;

  return (
    <motion.div
      whileTap={reduce ? undefined : { scale: 0.98 }}
      className={`group flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors ${
        selected ? 'bg-accent/15' : 'hover:bg-surface-elevated'
      }`}
    >
      <button
        type="button"
        aria-label={label}
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
      >
        {hasError ? (
          <Warning size={14} weight="regular" className="shrink-0 text-danger" />
        ) : null}
        <span
          className={`min-w-0 flex-1 truncate ${selected ? 'font-medium text-text-primary' : 'text-text-primary'}`}
        >
          {feed.title || feed.feedUrl}
        </span>
        {hasError ? (
          <span className="shrink-0">
            <Badge tone="danger">!</Badge>
          </span>
        ) : feed.unreadCount > 0 ? (
          <span aria-hidden="true" className="shrink-0">
            <Badge tone={selected ? 'accent' : 'muted'}>{feed.unreadCount}</Badge>
          </span>
        ) : null}
      </button>
      <button
        type="button"
        aria-label={`Delete feed ${feed.title}`}
        title="Delete feed"
        onClick={onDelete}
        className="shrink-0 rounded-xs p-1 text-text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash size={14} weight="regular" />
      </button>
    </motion.div>
  );
}
