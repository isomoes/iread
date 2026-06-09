// KbdHint: a single keyboard chip group. Renders each key in a mono <kbd>
// (globals.css maps kbd to Geist Mono + tabular-nums).

interface KbdHintProps {
  keys: string[];
}

export function KbdHint({ keys }: KbdHintProps) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key, i) => (
        <kbd
          key={`${key}-${i}`}
          className="inline-flex min-w-5 items-center justify-center rounded-xs border border-border bg-surface-elevated px-1.5 py-0.5 text-xs leading-none text-text-secondary"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
