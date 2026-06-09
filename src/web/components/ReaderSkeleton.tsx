// ReaderSkeleton: title bar + source/time bar + 6 paragraph lines (DESIGN Section 6).
// Pulse opacity only; collapsed by prefers-reduced-motion in globals.css.

function Bar({ className }: { className: string }) {
  return <div className={`rounded-sm bg-surface-elevated ${className}`} />;
}

export function ReaderSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-6 px-6 py-6">
      <div className="space-y-3">
        <Bar className="h-6 w-3/4" />
        <Bar className="h-3.5 w-2/5" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Bar key={i} className={i % 3 === 2 ? 'h-3.5 w-2/3' : 'h-3.5 w-full'} />
        ))}
      </div>
    </div>
  );
}
