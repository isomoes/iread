// ErrorState: inline per-pane error with a Retry button (DESIGN Section 6).
import { Warning } from '@phosphor-icons/react';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <Warning size={32} weight="regular" className="text-danger" />
      <p className="max-w-xs text-sm text-text-secondary">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-primary transition-opacity hover:opacity-90"
      >
        Retry
      </button>
    </div>
  );
}
