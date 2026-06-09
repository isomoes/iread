// UnreadDot: the one allowed semantic status dot (newsboat-style live unread signal).
// Decorative-looking but semantic; aria-hidden because the read/unread state is
// conveyed in the row's accessible name, never by color alone.

interface UnreadDotProps {
  active: boolean;
}

export function UnreadDot({ active }: UnreadDotProps) {
  return (
    <span
      aria-hidden="true"
      className={
        active
          ? 'inline-block size-2 shrink-0 rounded-xs bg-unread'
          : 'inline-block size-2 shrink-0 rounded-xs bg-transparent'
      }
    />
  );
}
