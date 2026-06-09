// EmptyState: icon + title + body + optional action button. Used by every pane
// for its empty copy (DESIGN Section 6). Icon is a Phosphor component passed in.
import type { ComponentType } from 'react';
import type { Icon } from '@phosphor-icons/react';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon: ComponentType<{ size?: number; weight?: string; className?: string }> | Icon;
  title: string;
  body: string;
  action?: EmptyStateAction;
}

export function EmptyState({ icon: IconCmp, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <IconCmp size={32} weight="regular" className="text-text-muted" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="max-w-xs text-sm text-text-secondary">{body}</p>
      </div>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
