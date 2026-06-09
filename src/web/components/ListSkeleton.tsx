// ListSkeleton: shimmer bars matching FeedRow / ArticleRow shape (NOT a spinner).
// `variant: 'feed'` -> title bar + short count bar; `variant: 'article'` -> two-line bars.
// The pulse is an opacity animation; the global prefers-reduced-motion media query
// in globals.css collapses it to ~0ms.

interface ListSkeletonProps {
  rows: number;
  variant: 'feed' | 'article';
}

function Bar({ className }: { className: string }) {
  return <div className={`rounded-sm bg-surface-elevated ${className}`} />;
}

export function ListSkeleton({ rows, variant }: ListSkeletonProps) {
  return (
    <div aria-hidden="true" className="animate-pulse">
      {Array.from({ length: rows }, (_, i) =>
        variant === 'feed' ? (
          <div key={i} className="flex items-center gap-2 px-3 py-2">
            <Bar className="h-3.5 w-1/2" />
            <Bar className="ml-auto h-3.5 w-6" />
          </div>
        ) : (
          <div key={i} className="flex flex-col gap-1.5 px-3 py-2">
            <Bar className="h-3.5 w-4/5" />
            <Bar className="h-3 w-2/5" />
          </div>
        ),
      )}
    </div>
  );
}
