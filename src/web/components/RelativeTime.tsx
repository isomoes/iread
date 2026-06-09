// RelativeTime: renders an epoch-ms `value` as relative text inside
// <time dateTime={iso} title={absolute}>. The <time> element is mapped to
// Geist Mono + tabular-nums by globals.css, so the numeric meta stays mono.
// Self-contained formatter (no dependency on lib/ which is owned by the shell).

interface RelativeTimeProps {
  value: number;
}

const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function formatRelative(value: number): string {
  let duration = (value - Date.now()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return rtf.format(Math.round(duration), 'year');
}

export function RelativeTime({ value }: RelativeTimeProps) {
  const date = new Date(value);
  const iso = date.toISOString();
  const absolute = date.toLocaleString();
  return (
    <time dateTime={iso} title={absolute}>
      {formatRelative(value)}
    </time>
  );
}
