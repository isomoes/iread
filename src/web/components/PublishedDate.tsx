// PublishedDate: renders an epoch-ms `value` as a compact YYMMDD date inside
// <time dateTime={iso} title={absolute}>. Example: 260602. The <time> element
// is mapped to Geist Mono + tabular-nums by globals.css, so the numeric meta
// stays mono. Self-contained formatter (no dependency on lib/ which is owned by
// the shell).

interface PublishedDateProps {
  value: number;
}

/** Compact local-date stamp, e.g. 260602. No separators (mono tabular-nums). */
function formatDate(value: number): string {
  const date = new Date(value);
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
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
