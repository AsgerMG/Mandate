"use client";

// Conceptual diagram (not a data chart): the three layers of capital a European
// company can draw on, stacked vertically with a "spine" running down through
// the hand-off. Each vehicle is interactive: hover or focus for a short
// description, its scale where it is in our corpus, and a source link.

import { useCallback, useRef, useState } from "react";
import leaderboard from "@/public/data/instrument_leaderboard.json";

interface Chip {
  label: string;
  family?: string; // links to instrument_leaderboard stats where in corpus
  desc: string;
  href?: string;
}

interface Tier {
  name: string;
  role: string;
  accent: string;
  tint: string;
  chips: Chip[];
  dashed?: boolean;
  muted?: boolean;
}

const STATS: Record<string, { companies: number; totalEur: number; topSector: string }> =
  Object.fromEntries(
    (leaderboard as { instruments: { family: string; companies: number; totalEur: number; topSector: { name: string } }[] })
      .instruments.map((i) => [i.family, { companies: i.companies, totalEur: i.totalEur, topSector: i.topSector.name }]),
  );

function fmtEur(n: number): string {
  if (n >= 1e9) return `€${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `€${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `€${(n / 1e3).toFixed(0)}K`;
  return `€${n}`;
}

const TIERS: Tier[] = [
  {
    name: "Pan-European",
    role: "Supranational missions and strategic projects, funded from the EU budget.",
    accent: "#003399",
    tint: "#eef2ff",
    chips: [
      { label: "Horizon Europe", family: "horizon_eu_pillar_ii", href: "https://research-and-innovation.ec.europa.eu/funding/funding-opportunities/funding-programmes-and-open-calls/horizon-europe_en", desc: "The EU's flagship research and innovation framework. Funds collaborative R&D across health, climate, digital and industry through its Pillar II clusters and partnerships." },
      { label: "European Innovation Council", family: "eic", href: "https://eic.ec.europa.eu/", desc: "The EU's deep-tech funder, backing high-risk startups and scaleups with grants and equity through Pathfinder, Transition and Accelerator." },
      { label: "IPCEI", family: "ipcei", href: "https://competition-policy.ec.europa.eu/state-aid/ipcei_en", desc: "Important Projects of Common European Interest: state-aid-approved mega-projects pooling several member states around strategic value chains such as batteries, hydrogen and microelectronics." },
      { label: "Innovation Fund", family: "innovation_fund", href: "https://climate.ec.europa.eu/eu-action/eu-funding-climate-action/innovation-fund_en", desc: "Financed by EU carbon-market revenues, it backs first-of-a-kind clean-tech and net-zero industrial deployment at scale." },
      { label: "European Defence Fund", family: "edf", href: "https://defence-industry-space.ec.europa.eu/", desc: "The EU's instrument for co-funding collaborative defence research and capability development across member states." },
      { label: "Chips JU", family: "chips_ju", href: "https://www.chips-ju.europa.eu/", desc: "The Chips Joint Undertaking (formerly KDT) funds semiconductor research, pilot lines and design under the European Chips Act." },
      { label: "EIT", family: "eit", href: "https://eit.europa.eu/", desc: "The European Institute of Innovation and Technology funds innovation through sectoral Knowledge and Innovation Communities (KICs)." },
    ],
  },
  {
    name: "National industrial policy",
    role: "Member states' own tools: state-aid schemes and development banks executing national plans.",
    accent: "#15803d",
    tint: "#f0fdf4",
    chips: [
      { label: "State aid (GBER and notified)", family: "state_aid_satr", href: "https://competition-policy.ec.europa.eu/state-aid/transparency_en", desc: "Aid granted by member states under EU rules, either block-exempted (GBER) or individually notified to and cleared by the Commission. Disclosed in the State Aid Transparency Register." },
      { label: "KfW · DE", href: "https://www.kfw.de/", desc: "Germany's public development bank. Its KfW Capital arm and subsidiaries such as HTGF and coparion anchor venture and growth funding." },
      { label: "CDP · IT", href: "https://www.cdp.it/", desc: "Cassa Depositi e Prestiti, Italy's national promotional institution. CDP Venture Capital deploys state-backed equity into startups and funds." },
      { label: "Bpifrance · FR", href: "https://www.bpifrance.fr/", desc: "France's public investment bank, financing startups and SMEs with loans, guarantees and equity across the company life cycle." },
      { label: "CDTI · ES", href: "https://www.cdti.es/", desc: "Spain's Centre for the Development of Industrial Technology, funding business R&D through grants and soft loans." },
      { label: "Almi · SE", href: "https://www.almi.se/", desc: "Sweden's state-owned development bank, providing loans and venture capital to growth firms." },
      { label: "and other development banks", desc: "Including Tesi (FI), Invest-NL (NL), SPRIND (DE) and Enterprise Ireland (IE), among others tracked in the corpus." },
    ],
  },
  {
    name: "The private market",
    role: "Where the public layers are meant to hand off and crowd in private money. Outside this study.",
    accent: "#94a3b8",
    tint: "#f8fafc",
    dashed: true,
    muted: true,
    chips: [
      { label: "Venture capital", desc: "Equity from professional VC funds, the main private route for high-growth, high-risk startups." },
      { label: "Growth equity", desc: "Larger equity rounds for scaling companies, often from late-stage or crossover investors." },
      { label: "Private equity", desc: "Buyout and expansion capital for more mature companies." },
      { label: "Bank lending", desc: "Commercial debt, the default financing for established, lower-risk firms." },
      { label: "Public markets", desc: "IPOs and listed equity, the exit the whole ladder ultimately points toward." },
    ],
  },
];

interface Active {
  chip: Chip;
  left: number;
  top: number;
}

export function TaxonomyDiagram() {
  const [active, setActive] = useState<Active | null>(null);
  const [width, setWidth] = useState(900);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setWidth(node.getBoundingClientRect().width);
  }, []);
  const ref = useRef<HTMLDivElement | null>(null);

  function open(e: React.MouseEvent | React.FocusEvent, chip: Chip) {
    const host = ref.current;
    if (!host) return;
    const c = host.getBoundingClientRect();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setActive({ chip, left: r.left - c.left + r.width / 2, top: r.bottom - c.top + 8 });
  }
  const close = () => setActive(null);

  const POP_W = 280;
  const clampedLeft = active ? Math.max(POP_W / 2 + 4, Math.min(width - POP_W / 2 - 4, active.left)) : 0;

  return (
    <div className="w-full">
      <div
        ref={(n) => { ref.current = n; containerRef(n); }}
        className="relative"
      >
        {/* The spine: capital flowing down through the layers to the hand-off. */}
        <div
          aria-hidden
          className="absolute left-[15px] top-4 bottom-4 w-[2px] rounded-full"
          style={{ background: "linear-gradient(to bottom, #003399 0%, #15803d 55%, #94a3b8 100%)" }}
        />

        {TIERS.map((tier, i) => (
          <div key={tier.name} className="relative pl-9">
            {/* Layer node on the spine */}
            <span
              aria-hidden
              className="absolute left-0 top-4 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white text-[11px] font-bold shadow-sm"
              style={{
                borderColor: tier.accent,
                color: tier.muted ? "#64748b" : tier.accent,
                borderStyle: tier.dashed ? "dashed" : "solid",
                fontFamily: "Georgia, 'Times New Roman', serif",
              }}
            >
              {i + 1}
            </span>

            <div
              className="rounded-xl border p-4 shadow-sm"
              style={{
                borderColor: tier.accent + "55",
                borderLeft: `4px solid ${tier.accent}`,
                background: `linear-gradient(135deg, ${tier.tint} 0%, #ffffff 90%)`,
                borderStyle: tier.dashed ? "dashed" : undefined,
              }}
            >
              <p
                className="text-sm font-semibold"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: tier.muted ? "#64748b" : tier.accent }}
              >
                {tier.name}
              </p>
              <p className="mt-0.5 mb-3 text-[11px] leading-snug text-[var(--muted-foreground)]">{tier.role}</p>
              <div className="flex flex-wrap gap-1.5">
                {tier.chips.map((chip) => {
                  const isActive = active?.chip.label === chip.label;
                  const sharedProps = {
                    onMouseEnter: (e: React.MouseEvent) => open(e, chip),
                    onMouseLeave: close,
                    onFocus: (e: React.FocusEvent) => open(e, chip),
                    onBlur: close,
                    className: "inline-block rounded-full border px-2.5 py-1 text-[11px] font-medium transition-shadow focus:outline-none focus:ring-2 focus:ring-offset-1",
                    style: {
                      borderColor: tier.accent + (isActive ? "" : "55"),
                      color: tier.muted ? "#475569" : "#1e293b",
                      background: isActive ? tier.tint : "white",
                      borderStyle: tier.dashed ? "dashed" : "solid",
                      boxShadow: isActive ? `0 1px 6px ${tier.accent}33` : "none",
                      cursor: chip.href ? "pointer" : "default",
                    } as React.CSSProperties,
                  };
                  const content = (
                    <>
                      {chip.label}
                      {chip.href && <span className="ml-1 opacity-50">↗</span>}
                    </>
                  );
                  return chip.href ? (
                    <a key={chip.label} href={chip.href} target="_blank" rel="noopener noreferrer" {...sharedProps}>
                      {content}
                    </a>
                  ) : (
                    <span key={chip.label} tabIndex={0} {...sharedProps}>
                      {content}
                    </span>
                  );
                })}
              </div>
            </div>

            {i < TIERS.length - 1 && (
              <div className="flex items-center gap-2 py-1.5 pl-1 text-[var(--muted-foreground)]">
                <span className="text-base leading-none" style={{ color: i === 1 ? "#94a3b8" : TIERS[i + 1].accent }}>↓</span>
                <span className="text-[11px] italic">
                  {i === 1 ? "the hand-off: where public capital is meant to crowd in private money" : "executed nationally, under EU rules"}
                </span>
              </div>
            )}
          </div>
        ))}

        {active && (
          <div
            className="pointer-events-none absolute z-50 rounded-lg border border-[var(--border)] bg-white p-3 shadow-lg"
            style={{ width: POP_W, left: clampedLeft, top: active.top, transform: "translateX(-50%)" }}
          >
            <p className="text-sm font-semibold leading-tight" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
              {active.chip.label}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-[var(--foreground)]">{active.chip.desc}</p>
            {active.chip.family && STATS[active.chip.family] && (
              <p className="mt-2 text-[11px] tabular-nums text-[var(--muted-foreground)]">
                <span className="font-semibold text-[var(--primary)]">{fmtEur(STATS[active.chip.family].totalEur)}</span>
                {" committed · "}
                {STATS[active.chip.family].companies.toLocaleString()} companies
                {" · top sector "}
                {STATS[active.chip.family].topSector}
              </p>
            )}
            {active.chip.href && (
              <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
                Click to open the official source ↗
              </p>
            )}
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        Hover or tap any vehicle for what it is and, where it sits in this study, its scale.
      </p>
    </div>
  );
}
