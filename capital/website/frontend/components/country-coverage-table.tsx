"use client";

// Compact transparency table: dense by default, expand a row for sources and gaps.
// Reads the site-facing detail emitted by scripts/gen_coverage_indicator.py.

import { Fragment, useState } from "react";
import coverageRaw from "@/public/data/country_coverage.json";
import countryMapRaw from "@/public/data/country_map.json";

interface CountryCoverage {
  source_families: string[];
  event_count: number;
  company_count: number;
  register_events: number;
  eu_events: number;
  ndb_events: number;
  coverage_tier: string;
  structural_gap: string;
}

const coverage = coverageRaw as { generated: string; countries: Record<string, CountryCoverage> };
const names = Object.fromEntries(
  Object.entries((countryMapRaw as { countries: Record<string, { name: string }> }).countries).map(
    ([iso2, d]) => [iso2, d.name],
  ),
);

const GRADE_ORDER = ["A", "B", "C", "D", "X"];

const GRADE_CONFIG: Record<string, { bg: string; text: string; short: string }> = {
  A: { bg: "#dcfce7", text: "#15803d", short: "Rich" },
  B: { bg: "#fef9c3", text: "#854d0e", short: "Moderate" },
  C: { bg: "#fef3c7", text: "#92400e", short: "Thin" },
  D: { bg: "#fee2e2", text: "#991b1b", short: "Register only" },
  X: { bg: "#f1f5f9", text: "#475569", short: "None" },
};

const FAMILY_LABELS: Record<string, string> = {
  satr: "SATR",
  bdns: "BDNS",
  sudop: "SUDOP",
  horizon: "Horizon",
  eic: "EIC",
  eit: "EIT",
  ipcei: "IPCEI",
  edf: "EDF",
  innovation_fund: "Innov. Fund",
  chips_ju: "Chips JU",
  chp: "CHP",
  ihi: "IHI",
  eurohpc: "EuroHPC",
  eib: "EIB",
  erc_poc: "ERC PoC",
  htgf: "HTGF",
  coparion: "Coparion",
  sprind: "SPRIND",
  cdti: "CDTI",
  almi: "Almi",
  cdp_vc: "CDP VC",
  tesi: "Tesi",
  invest_nl: "Invest-NL",
  bpifrance: "Bpifrance",
  enterprise_ireland: "Ent. Ireland",
  eifo: "EIFO",
  ademe: "ADEME",
  innovationsfonden: "Innovationsfonden",
  fr_relance: "Fr Relance",
  fr_region: "Fr regional",
  innovasjon_norge: "Innovasjon Norge",
  nfr: "NFR",
  innosuisse: "Innosuisse",
  altum: "ALTUM",
  ilte: "ILTE",
  eis: "EIS",
  tacr: "TAČR",
  vinnova: "Vinnova",
  business_finland: "Business FI",
};

function GradeBadge({ grade, size = "sm" }: { grade: string; size?: "sm" | "xs" }) {
  const conf = GRADE_CONFIG[grade] ?? GRADE_CONFIG.X;
  const dim = size === "xs" ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[10px]";
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

export function CountryCoverageTable() {
  const [open, setOpen] = useState<string | null>(null);

  const rows = Object.entries(coverage.countries)
    .map(([iso2, d]) => ({ iso2, name: names[iso2] ?? iso2, ...d }))
    .sort((a, b) => {
      const g = GRADE_ORDER.indexOf(a.coverage_tier) - GRADE_ORDER.indexOf(b.coverage_tier);
      return g !== 0 ? g : b.company_count - a.company_count;
    });

  const gradeCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.coverage_tier] = (acc[r.coverage_tier] ?? 0) + 1;
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
        <span className="text-[var(--muted-foreground)]">· click a row for sources &amp; gaps</span>
      </div>

      <div className="overflow-hidden rounded border border-[var(--border)]">
        <div className="max-h-[150px] overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--muted)] text-[9px] uppercase tracking-wide text-[var(--muted-foreground)]">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Country</th>
                <th className="px-1 py-1 text-center font-medium w-7">Gr</th>
                <th className="px-2 py-1 text-right font-medium">Cos</th>
                <th className="px-2 py-1 text-right font-medium">Evts</th>
                <th className="px-2 py-1 text-left font-medium hidden sm:table-cell">Sources</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open === r.iso2;
                const srcSummary = r.source_families
                  .map((f) => FAMILY_LABELS[f] ?? f)
                  .join(", ");
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
                        <GradeBadge grade={r.coverage_tier} size="xs" />
                      </td>
                      <td className="px-2 py-0.5 text-right tabular-nums">{r.company_count.toLocaleString()}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums">{r.event_count.toLocaleString()}</td>
                      <td className="px-2 py-0.5 text-[var(--muted-foreground)] truncate max-w-[180px] hidden sm:table-cell">
                        {srcSummary || "—"}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-[var(--border)] bg-[var(--muted)]/30">
                        <td colSpan={5} className="px-2 py-1.5">
                          <p className="text-[9px] text-[var(--muted-foreground)] mb-1">
                            {r.register_events.toLocaleString()} register · {r.eu_events.toLocaleString()} EU ·{" "}
                            {r.ndb_events.toLocaleString()} NDB
                          </p>
                          <div className="flex flex-wrap gap-0.5 mb-1">
                            {r.source_families.map((f) => (
                              <span
                                key={f}
                                className="rounded bg-white px-1 py-px text-[9px] text-[var(--muted-foreground)] border border-[var(--border)]"
                              >
                                {FAMILY_LABELS[f] ?? f}
                              </span>
                            ))}
                          </div>
                          {r.structural_gap && (
                            <p className="text-[9px] leading-snug text-[var(--muted-foreground)]">{r.structural_gap}</p>
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
        40 countries · generated {new Date(coverage.generated).toISOString().slice(0, 10)} ·{" "}
        <code>scripts/gen_coverage_indicator.py</code>
      </p>
    </div>
  );
}
