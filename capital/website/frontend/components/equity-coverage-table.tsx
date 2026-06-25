"use client";

// Equity-tools coverage table (Sprint 19): the equity sibling of the
// grants/loans transparency table. Grades each country's public-equity
// INSTITUTIONS' disclosure (E-A register-grade .. E-X opaque) — attribution
// is by holder country, not company HQ. Reads the detail emitted by
// scripts/gen_coverage_indicator.py.

import { Fragment, useState } from "react";
import coverageRaw from "@/public/data/country_coverage.json";
import countryMapRaw from "@/public/data/country_map.json";

interface CountryEquity {
  equity_tier: string;
  equity_tier_note: string;
  equity_performance?: string | null;
  equity_positions: number;
  equity_exited: number;
  equity_holders: string[];
  equity_best_disclosure: string | null;
}

interface EuEquityLayer extends CountryEquity {}

const coverage = coverageRaw as unknown as {
  generated: string;
  eu_equity_layer: EuEquityLayer;
  countries: Record<string, CountryEquity>;
};
const names = Object.fromEntries(
  Object.entries((countryMapRaw as { countries: Record<string, { name: string }> }).countries).map(
    ([iso2, d]) => [iso2, d.name],
  ),
);

const GRADE_ORDER = ["E-A", "E-B", "E-C", "E-X"];

const GRADE_CONFIG: Record<string, { bg: string; text: string; short: string }> = {
  "E-A": { bg: "#dcfce7", text: "#15803d", short: "Register-grade" },
  "E-B": { bg: "#fef9c3", text: "#854d0e", short: "Institution-grade" },
  "E-C": { bg: "#fef3c7", text: "#92400e", short: "Partial" },
  "E-X": { bg: "#f1f5f9", text: "#475569", short: "Opaque" },
};

const DISCLOSURE_LABELS: Record<string, string> = {
  amount: "€ amounts",
  pct_exact: "exact %",
  pct_range: "% range",
  name_only: "names only",
};

function GradeBadge({ grade, size = "sm" }: { grade: string; size?: "sm" | "xs" }) {
  const conf = GRADE_CONFIG[grade] ?? GRADE_CONFIG["E-X"];
  const dim = size === "xs" ? "h-4 text-[9px] px-1" : "h-5 text-[10px] px-1";
  return (
    <span
      className={`inline-flex items-center justify-center rounded font-bold ${dim}`}
      style={{ background: conf.bg, color: conf.text }}
      title={conf.short}
    >
      {grade}
    </span>
  );
}

export function EquityCoverageTable() {
  const [open, setOpen] = useState<string | null>(null);

  // The EU's own equity arms (EIC Fund, EIT KICs) are graded as an entity in
  // the same table, not relegated to a footnote.
  const euRow = {
    iso2: "EU",
    name: "European Union",
    ...coverage.eu_equity_layer,
  };

  const rows = [
    euRow,
    ...Object.entries(coverage.countries).map(([iso2, d]) => ({
      iso2,
      name: names[iso2] ?? iso2,
      ...d,
    })),
  ].sort((a, b) => {
    const g = GRADE_ORDER.indexOf(a.equity_tier) - GRADE_ORDER.indexOf(b.equity_tier);
    return g !== 0 ? g : b.equity_positions - a.equity_positions;
  });

  const gradeCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.equity_tier] = (acc[r.equity_tier] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-2xl text-[10px] leading-tight text-[var(--foreground)]">
      {/* One-line grade key */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--muted-foreground)]">
        {GRADE_ORDER.filter((g) => gradeCounts[g]).map((g) => (
          <span key={g} className="inline-flex items-center gap-1">
            <GradeBadge grade={g} size="xs" />
            <span>
              {gradeCounts[g]} · {GRADE_CONFIG[g].short}
            </span>
          </span>
        ))}
        <span>· click a row for the assessment</span>
      </div>

      <div className="overflow-hidden rounded border border-[var(--border)]">
        <div className="max-h-[150px] overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--muted)] text-[9px] uppercase tracking-wide text-[var(--muted-foreground)]">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Country</th>
                <th className="px-1 py-1 text-center font-medium w-9">Gr</th>
                <th className="px-2 py-1 text-right font-medium">Positions</th>
                <th className="px-2 py-1 text-right font-medium">Exits</th>
                <th className="px-2 py-1 text-left font-medium hidden sm:table-cell">Best disclosure</th>
                <th className="px-2 py-1 text-left font-medium hidden sm:table-cell">Institutions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open === r.iso2;
                return (
                  <Fragment key={r.iso2}>
                    <tr
                      onClick={() => setOpen(isOpen ? null : r.iso2)}
                      className={`cursor-pointer border-t border-[var(--border)] transition-colors ${
                        isOpen ? "bg-[#eef2ff]" : "hover:bg-[var(--muted)]/60"
                      }`}
                    >
                      <td className="px-2 py-0.5 whitespace-nowrap">
                        <span className="font-medium">{r.name}</span>
                        <span className="ml-1 text-[var(--muted-foreground)]">{r.iso2}</span>
                      </td>
                      <td className="px-1 py-0.5 text-center">
                        <GradeBadge grade={r.equity_tier} size="xs" />
                      </td>
                      <td className="px-2 py-0.5 text-right tabular-nums">
                        {r.equity_positions > 0 ? r.equity_positions.toLocaleString() : "—"}
                      </td>
                      <td className="px-2 py-0.5 text-right tabular-nums">
                        {r.equity_exited > 0 ? r.equity_exited.toLocaleString() : "—"}
                      </td>
                      <td className="px-2 py-0.5 text-[var(--muted-foreground)] hidden sm:table-cell">
                        {r.equity_best_disclosure ? DISCLOSURE_LABELS[r.equity_best_disclosure] : "—"}
                      </td>
                      <td className="px-2 py-0.5 text-[var(--muted-foreground)] truncate max-w-[160px] hidden sm:table-cell">
                        {r.equity_holders.join(", ") || "—"}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-[var(--border)] bg-[var(--muted)]/30">
                        <td colSpan={6} className="px-2 py-1.5">
                          <p className="text-[9px] leading-snug text-[var(--muted-foreground)]">
                            {r.equity_tier_note}
                          </p>
                          {(r.equity_performance || r.equity_positions > 0) && (
                            <p className="text-[9px] leading-snug text-[var(--muted-foreground)] mt-1">
                              <span className="font-semibold">Performance: </span>
                              {r.equity_performance ??
                                "no portfolio-level performance disclosure found."}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-1.5 text-[9px] text-[var(--muted-foreground)]">
        Grades reflect loaded data, not the structural ceiling. *PFR Ventures is look-through LP
        exposure, never comparable with direct stakes. Positions are the current view (latest
        register snapshot per company); exits cumulative. Performance figures in the expanded rows
        are the institutions&apos; own published numbers.
      </p>
    </div>
  );
}
