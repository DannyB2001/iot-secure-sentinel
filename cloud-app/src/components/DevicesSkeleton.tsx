const COLUMN_GRID =
  "grid min-w-[920px] grid-cols-[minmax(200px,1.4fr)_140px_minmax(140px,1fr)_minmax(140px,1fr)_120px_140px_120px] gap-4";

export function DevicesSkeleton() {
  return (
    <div role="status" aria-label="Loading devices" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <div className={`${COLUMN_GRID} border-b border-border bg-secondary/40 px-6 py-3`}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-muted" />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, row) => (
            <div key={row} className={`${COLUMN_GRID} items-center px-6 py-4`}>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
                <div className="space-y-1.5">
                  <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                  <div className="h-2 w-16 animate-pulse rounded bg-muted" />
                </div>
              </div>
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="space-y-1.5">
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                <div className="h-2 w-14 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
