// SearchBox: `/`-focusable filter over the current list. role="search".
// Controlled value; onClear empties + is wired to Esc by the shell. Forwards a ref
// so the shell's keyboard handler can focus + select the input on `/`.
import { forwardRef } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(
  function SearchBox({ value, onChange, onClear }, ref) {
    return (
      <div role="search" className="relative flex items-center">
        <MagnifyingGlass
          size={16}
          weight="regular"
          className="pointer-events-none absolute left-2.5 text-text-muted"
        />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClear();
            }
          }}
          placeholder="Search articles"
          aria-label="Search articles in the current view"
          className="w-full rounded-sm border border-border bg-surface py-1.5 pl-8 pr-8 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={onClear}
            className="absolute right-2 rounded-xs px-1 text-sm text-text-muted transition-opacity hover:opacity-80"
          >
            Clear
          </button>
        ) : null}
      </div>
    );
  },
);
