// Toolbar: action bar inside the reader (toggle read/unread, star/unstar, open
// original). Icon-only buttons with aria-labels; mono kbd hints are surfaced in
// the help overlay, not here. DESIGN Section 4.
import { Circle } from '@phosphor-icons/react';
import { CheckCircle } from '@phosphor-icons/react';
import { Star } from '@phosphor-icons/react';
import { ArrowSquareOut } from '@phosphor-icons/react';
import type { Item } from '../../shared/types';

interface ToolbarProps {
  item: Item;
  onToggleRead: () => void;
  onToggleStar: () => void;
  onOpenOriginal: () => void;
}

export function Toolbar({ item, onToggleRead, onToggleStar, onOpenOriginal }: ToolbarProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={item.isRead ? 'Mark as unread' : 'Mark as read'}
        aria-pressed={item.isRead}
        title={item.isRead ? 'Mark as unread' : 'Mark as read'}
        onClick={onToggleRead}
        className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
      >
        {item.isRead ? (
          <CheckCircle size={18} weight="regular" />
        ) : (
          <Circle size={18} weight="regular" />
        )}
      </button>

      <button
        type="button"
        aria-label={item.isStarred ? 'Unstar article' : 'Star article'}
        aria-pressed={item.isStarred}
        title={item.isStarred ? 'Unstar article' : 'Star article'}
        onClick={onToggleStar}
        className={`inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-surface-elevated ${
          item.isStarred ? 'text-accent' : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        <Star size={18} weight="regular" />
      </button>

      <button
        type="button"
        aria-label="Open original article in a new tab"
        title="Open original"
        onClick={onOpenOriginal}
        disabled={!item.link}
        className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ArrowSquareOut size={18} weight="regular" />
      </button>
    </div>
  );
}
