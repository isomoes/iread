// SmartViews: Unread / All / Starred selector with mono counts pulled from
// `totals`. Active view gets the accent fill. DESIGN Section 4 + 6.
import type { SmartView, ViewTotals } from '../../shared/types';

interface SmartViewsProps {
  totals: ViewTotals;
  active: SmartView;
  onChange: (view: SmartView) => void;
}

const VIEWS: { key: SmartView; label: string }[] = [
  { key: 'unread', label: 'Unread' },
  { key: 'all', label: 'All' },
  { key: 'starred', label: 'Starred' },
];

export function SmartViews({ totals, active, onChange }: SmartViewsProps) {
  return (
    <ul className="flex flex-col gap-0.5">
      {VIEWS.map(({ key, label }) => {
        const count = totals[key];
        const selected = active === key;
        return (
          <li key={key}>
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`${label}, ${count} articles`}
              onClick={() => onChange(key)}
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${
                selected
                  ? 'bg-accent text-accent-foreground'
                  : 'text-text-primary hover:bg-surface-elevated'
              }`}
            >
              <span className="flex-1 truncate">{label}</span>
              <span
                aria-hidden="true"
                className={`num text-xs ${selected ? 'text-accent-foreground' : 'text-text-muted'}`}
              >
                {count}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
