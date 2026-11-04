import { ReactNode } from "react";

const serif = { fontFamily: "var(--font-newsreader), Georgia, serif" };

/** Numbered, quotable finding. The page's promise is that the reader never
 * has to interpret a chart: every section states its conclusion here. */
export function Finding({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="my-6 rounded-[var(--radius)] border-l-4 border-[var(--accent)] bg-[var(--paper)]/70 px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">Finding {n}</p>
      <p className="mt-1 text-lg font-semibold leading-snug text-[var(--foreground)]" style={serif}>
        {children}
      </p>
    </div>
  );
}

/** Big-number stat with a one-line label, used in rows of three. */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-t-2 border-[var(--primary)] py-5">
      <p className="text-3xl font-bold tabular-nums text-[var(--foreground)]" style={serif}>
        {value}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-soft)]">{label}</p>
    </div>
  );
}

/** A forward-looking claim with its policy source. */
export function Signal({
  title,
  implication,
  children,
}: {
  title: string;
  implication: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[var(--primary)] py-5">
      <h3 className="text-lg font-semibold leading-snug text-[var(--foreground)]" style={serif}>
        {title}
      </h3>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-[var(--foreground-soft)]">
        {children}
      </div>
      <p className="mt-4 text-[15px] font-semibold leading-relaxed text-[var(--accent)]">
        {implication}
      </p>
    </div>
  );
}
