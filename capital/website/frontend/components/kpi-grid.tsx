interface KpiItem {
  label: string;
  value: string | number;
  sub?: string;
}

interface KpiGridProps {
  items: KpiItem[];
  cols?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}

export function KpiGrid({ items, cols = 4, className = "" }: KpiGridProps) {
  const colClass =
    cols === 2 ? "grid-cols-2" :
    cols === 3 ? "grid-cols-2 sm:grid-cols-3" :
    cols === 5 ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-5" :
    cols === 6 ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-6" :
    "grid-cols-2 md:grid-cols-4";

  return (
    <div className={`grid ${colClass} gap-4 ${className}`}>
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
        >
          <p className="text-xs uppercase tracking-widest text-[var(--muted-foreground)] mb-1">
            {item.label}
          </p>
          <p className="text-xl sm:text-2xl font-semibold tabular-nums text-[var(--primary)]">
            {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
          </p>
          {item.sub && (
            <p className="text-xs text-[var(--muted-foreground)] mt-1">{item.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
