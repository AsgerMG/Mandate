import { ReactNode } from "react";

const serif = { fontFamily: "var(--font-newsreader), Georgia, serif" };

/** Numbered, quotable finding. The page's promise is that the reader never
 * has to interpret a chart: every section states its conclusion here. */
export function Finding({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="my-6 rounded-lg border-l-4 border-[#7f5820] bg-[var(--paper)]/70 px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-widest text-[#7f5820]">Finding {n}</p>
      <p className="mt-1 text-lg font-semibold leading-snug text-[#141414]" style={serif}>
        {children}
      </p>
    </div>
  );
}

/** Big-number stat with a one-line label, used in rows of three. */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--paper)]/70 p-5">
      <p className="text-3xl font-bold tabular-nums text-[#141414]" style={serif}>
        {value}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[#5d5b52]">{label}</p>
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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--paper)]/70 p-6">
      <h3 className="text-base font-bold text-[#141414]" style={serif}>
        {title}
      </h3>
      <div className="prose-article mt-2 space-y-2 text-sm leading-relaxed text-[#3f3e37]">
        {children}
      </div>
      <p className="mt-3 border-t border-dashed border-[var(--border)] pt-3 text-sm font-semibold text-[#7f5820]">
        {implication}
      </p>
    </div>
  );
}
