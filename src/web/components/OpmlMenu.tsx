// OpmlMenu: OPML import (hidden file picker) and export (download anchor to the
// GET /api/opml endpoint). DESIGN Section 4. Import passes the chosen File up to
// the caller's useOpml hook. Exposes an imperative openPicker() via ref so other
// affordances (e.g. the empty-state "Import OPML" action) can trigger the picker.
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { TrayArrowUp } from '@phosphor-icons/react';
import { TrayArrowDown } from '@phosphor-icons/react';

export interface OpmlMenuHandle {
  openPicker: () => void;
}

interface OpmlMenuProps {
  onImport: (file: File) => void;
  /** When provided, the export button calls this; otherwise it is a download
   *  anchor to GET /api/opml. */
  onExport?: () => void;
  pending: boolean;
}

export const OpmlMenu = forwardRef<OpmlMenuHandle, OpmlMenuProps>(
  function OpmlMenu({ onImport, onExport, pending }, ref) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    useImperativeHandle(ref, () => ({
      openPicker: () => inputRef.current?.click(),
    }));

    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="file"
          accept=".opml,.xml,application/xml,text/x-opml"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
            // Reset so selecting the same file again re-fires change.
            e.target.value = '';
          }}
        />
        <button
          type="button"
          aria-label="Import OPML"
          title="Import OPML"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <TrayArrowUp size={18} weight="regular" />
        </button>
        {onExport ? (
          <button
            type="button"
            aria-label="Export OPML"
            title="Export OPML"
            onClick={onExport}
            className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
          >
            <TrayArrowDown size={18} weight="regular" />
          </button>
        ) : (
          <a
            href="/api/opml"
            download="iread.opml"
            aria-label="Export OPML"
            title="Export OPML"
            className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
          >
            <TrayArrowDown size={18} weight="regular" />
          </a>
        )}
      </div>
    );
  },
);
