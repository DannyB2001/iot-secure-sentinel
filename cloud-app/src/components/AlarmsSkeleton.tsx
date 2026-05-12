const COLUMN_GRID =
  "grid grid-cols-[110px_minmax(160px,1.2fr)_120px_minmax(180px,1.6fr)_110px_140px] gap-4";

export function AlarmsSkeleton() {
  return (
    <div role="status" aria-label="Loading alarms" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-muted" />
          ))}
        </div>
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className={`${COLUMN_GRID} border-b border-border bg-secondary/40 px-6 py-3`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-muted" />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, row) => (
            <div key={row} className={`${COLUMN_GRID} items-center px-6 py-4`}>
              <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
              <div className="space-y-1.5">
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                <div className="h-2 w-20 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="h-3 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-14 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-8 w-28 animate-pulse rounded-md bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
