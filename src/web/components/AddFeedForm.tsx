// AddFeedForm: URL input + submit with inline validation and a server error slot.
// onSubmit receives the trimmed URL; the caller's useFeeds mutation drives
// `pending` and `error`. DESIGN Section 4.
import { useState } from 'react';
import { Plus } from '@phosphor-icons/react';

interface AddFeedFormProps {
  onSubmit: (url: string) => void;
  pending: boolean;
  error?: string | null;
}

export function AddFeedForm({ onSubmit, pending, error }: AddFeedFormProps) {
  const [url, setUrl] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const message = localError ?? error ?? null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setLocalError('Enter a feed URL.');
      return;
    }
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setLocalError('Enter a valid http or https URL.');
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (localError) setLocalError(null);
          }}
          placeholder="Add feed by URL"
          aria-label="Add feed by URL"
          aria-invalid={message ? true : undefined}
          disabled={pending}
          className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1 disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Add feed"
          title="Add feed"
          disabled={pending}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus size={18} weight="regular" />
        </button>
      </div>
      {message ? (
        <p role="alert" className="text-xs text-danger">
          {message}
        </p>
      ) : null}
    </form>
  );
}
