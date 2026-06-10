// PublishedDate: renders an epoch-ms `value` as a compact YYYYMMDD date inside
// <time dateTime={iso} title={absolute}>. Example: 20260602. The <time> element
// is mapped to Geist Mono + tabular-nums by globals.css, so the numeric meta
// stays mono. Self-contained formatter (no dependency on lib/ which is owned by
// the shell).

interface PublishedDateProps {
  value: number;
}

/** Compact local-date stamp, e.g. 20260602. No separators (mono tabular-nums). */
function formatDate(value: number): string {
  const date = new Date(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export function PublishedDate({ value }: PublishedDateProps) {
  const date = new Date(value);
  const iso = date.toISOString();
  const absolute = date.toLocaleString();
  return (
    <time dateTime={iso} title={absolute}>
      {formatDate(value)}
    </time>
  );
}
