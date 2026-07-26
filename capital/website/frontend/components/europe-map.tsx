"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  type GeographyFeature,
} from "react-simple-maps";
import { geoMercator } from "d3-geo";
import { PieChart, Pie, Cell } from "recharts";

const GEO_URL = "/data/world-110m.json";

// ISO 3166-1 numeric → alpha-2 for the 40-country Europe scope. The
// authoritative list lives in data/europe_scope.json; this dictionary is
// derived from it. See docs/europe_scope.md for the rationale.
// Note: Malta (470), Liechtenstein (438), and Kosovo (383) are in scope but
// absent from world-110m at this resolution; they render below as labelled
// markers instead of shapes.
const NUMERIC_TO_ISO2: Record<string, string> = {
  "008": "AL", "040": "AT", "056": "BE", "070": "BA", "100": "BG",
  "191": "HR", "196": "CY", "203": "CZ", "208": "DK", "233": "EE",
  "246": "FI", "250": "FR", "276": "DE", "300": "GR", "348": "HU",
  "372": "IE", "380": "IT", "428": "LV", "440": "LT", "442": "LU",
  "498": "MD", "499": "ME", "528": "NL", "578": "NO", "616": "PL",
  "620": "PT", "642": "RO", "688": "RS", "703": "SK",
  "705": "SI", "724": "ES", "752": "SE", "756": "CH",
  "804": "UA", "807": "MK", "826": "GB", "352": "IS",
};

const EUROPEAN_ISO2 = new Set(Object.values(NUMERIC_TO_ISO2));

// Countries in scope but too small for the 110m shape file. Rendered as
// labelled dots over the map.
const MARKER_COUNTRIES: { iso2: string; lon: number; lat: number }[] = [
  { iso2: "MT", lon: 14.4, lat: 35.9 },   // Malta
  { iso2: "LI", lon: 9.55, lat: 47.16 },  // Liechtenstein
  { iso2: "XK", lon: 20.9, lat: 42.6 },   // Kosovo
];

// Matches the ComposableMap projection config below (center [15, 54], scale
// 580, viewport 800x500). Used to project marker lat/lon to SVG coordinates.
const MAP_W = 800;
const MAP_H = 500;
const MERCATOR = geoMercator()
  .center([15, 54])
  .scale(580)
  .translate([MAP_W / 2, MAP_H / 2]);

const FAMILY_COLORS: Record<string, string> = {
  state_aid:       "#facc15",
  horizon_eu:      "#003399",
  eic:             "#0369a1",
  ndb:             "#15803d",
  eit:             "#7c3aed",
  ipcei:           "#b91c1c",
  innovation_fund: "#0891b2",
  eib:             "#d97706",
  edf:             "#78350f",
  chips_ju:        "#374151",
};

// Sector keys = the two-tier taxonomy's 11 Tier-1 sectors (companies.sector_top,
// migration 010 — see sector_labels.py). This replaced a stale 8-bucket
// pre-taxonomy palette (cleantech/life_sciences/deeptech_hardware/digital/
// defense) whose keys no longer matched any real sector_top value, so every
// slice of the "By sector" donut was silently falling through to the grey
// fallback color. Deliberately a SEPARATE palette from FAMILY_COLORS above —
// the two donuts sit side by side in the same tooltip and must never share a
// palette. Full pairwise CVD separation isn't achievable at 11 categories
// (see the dataviz skill's own documented cap), so this is mitigated the
// skill's sanctioned way: PieBlock always renders a text legend with every
// entry's name, so identity never depends on color alone.
const SECTOR_COLORS: Record<string, string> = {
  software_data_ai:           "#2a78d6", // blue
  health_life_sciences:       "#e87ba4", // magenta
  energy_cleantech:           "#008300", // green
  mobility_transport:         "#eb6834", // orange
  semiconductors_electronics: "#4a3aa7", // violet
  space:                      "#1baf7a", // aqua
  defense_security:           "#e34948", // red
  agrifood:                   "#eda100", // gold
  industrial_manufacturing:   "#0d9488", // teal
  materials_chemicals:        "#a16207", // ochre
  other:                      "#6b7280", // neutral gray, deliberately low-chroma
};

const RATING_CONFIG: Record<string, { bg: string; text: string }> = {
  "A":  { bg: "#dcfce7", text: "#15803d" },
  "B+": { bg: "#fef9c3", text: "#854d0e" },
  "B":  { bg: "#fef9c3", text: "#854d0e" },
  "C":  { bg: "#fef3c7", text: "#92400e" },
  "D":  { bg: "#fee2e2", text: "#991b1b" },
  "X":  { bg: "#f1f5f9", text: "#475569" },
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function dominantSectorPhrase(sectors: { sector: string; label: string; companies: number }[]): string {
  if (sectors.length === 0) return "";
  const total = sectors.reduce((acc, s) => acc + s.companies, 0);
  if (!total) return "";
  const top = sectors[0];
  const topShare = Math.round((top.companies / total) * 100);
  if (sectors.length === 1 || topShare >= 60) {
    return `dominated by ${top.label.toLowerCase()} (${topShare}%)`;
  }
  const second = sectors[1];
  const twoShare = Math.round(((top.companies + second.companies) / total) * 100);
  return `primarily ${top.label.toLowerCase()} and ${second.label.toLowerCase()} (${twoShare}% combined)`;
}

function narrativeLine(
  name: string,
  narrative: CountryData["narrative"],
  bySector: CountryData["bySector"],
  instrumentsPresent: number,
  totalInstruments: number,
): string {
  if (!narrative) return "";
  const { rankByCompanies: rc, rankByEur: re, totalCountries: tot, dominantFamily } = narrative;
  const rankPhrase = rc
    ? `${ordinal(rc)} largest by company count` + (re && re !== rc ? `, ${ordinal(re)} by € committed` : "")
    : "";
  const sectorPhrase = dominantSectorPhrase(bySector ?? []);
  const familyPhrase = dominantFamily ? `Predominantly through ${dominantFamily}.` : "";
  const coveragePhrase =
    instrumentsPresent === totalInstruments
      ? `All ${totalInstruments} instruments present.`
      : `${instrumentsPresent} of ${totalInstruments} instruments present.`;
  const parts: string[] = [];
  if (rankPhrase) parts.push(`${name} ranks ${rankPhrase} (of ${tot}).`);
  if (sectorPhrase) parts.push(`Portfolio is ${sectorPhrase}.`);
  if (familyPhrase) parts.push(familyPhrase);
  parts.push(coveragePhrase);
  return parts.join(" ");
}

function formatEur(n: number): string {
  if (n >= 1e9) return `€${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `€${(n / 1e6).toFixed(0)}M`;
  return `€${n.toLocaleString()}`;
}

export interface CountryData {
  name: string;
  // Below the €1B public-support corpus threshold: rendered on the map but
  // outside the study. Stubs carry only `name` + this flag.
  excluded?: boolean;
  companies?: number;
  totalEur?: number;
  byFamily?: { family: string; label: string; companies: number; eur: number }[];
  // Real named institutions (a specific NDB, or a SATR row's raw granting
  // authority when it isn't a known NDB), not just the 10-bucket family —
  // `family` rides along so each vehicle can still inherit its parent
  // family's color. This, not byFamily, powers the "By vehicle (€)" pie.
  byVehicle?: { label: string; family: string; companies: number; eur: number }[];
  bySector?: { sector: string; label: string; companies: number }[];
  narrative?: {
    rankByCompanies: number | null;
    rankByEur: number | null;
    totalCountries: number;
    dominantFamily: string;
    dominantSectors: string[];
  };
  coverageRating?: { rating: string; note: string };
}

interface MapTooltipExtraProps {
  data: CountryData;
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
  familyUniverse: { family: string; label: string; total: number }[];
  pinned: boolean;
  onClose: () => void;
}

// Donut chart with sorted legend. Beyond maxRows items are collapsed to "Other".
function PieBlock({
  title,
  entries,
  maxRows = 3,
}: {
  title: string;
  entries: { name: string; value: number; key: string; color: string }[];
  maxRows?: number;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded bg-[var(--muted)]/30 p-2 text-center">
        <p className="text-[9px] uppercase tracking-widest text-[var(--muted-foreground)]">{title}</p>
        <p className="mt-4 text-[10px] text-[var(--muted-foreground)]">No data</p>
      </div>
    );
  }
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((acc, e) => acc + e.value, 0);
  const displayed = sorted.slice(0, maxRows);
  const rest = sorted.slice(maxRows);
  // A genuine "Other" category (e.g. the sector taxonomy's own catch-all
  // bucket) can legitimately land inside the top maxRows on its own merits.
  // When that happens, fold the overflow into THAT row rather than adding a
  // second, differently-named catch-all ("Remaining") — two vague buckets
  // in a five-line legend reads as confusing/duplicated, not as two
  // distinct, nameable things. One honest "Other" that means "this sector
  // plus everything smaller" beats two ambiguous ones.
  const otherIdx = displayed.findIndex((e) => e.name.toLowerCase() === "other");
  const overflow = rest.reduce((s, e) => s + e.value, 0);
  const pieData =
    rest.length > 0 && otherIdx !== -1
      ? displayed.map((e, i) => (i === otherIdx ? { ...e, value: e.value + overflow } : e))
      : rest.length > 0
      ? [
          ...displayed,
          {
            name: "Other",
            value: overflow,
            key: "__other",
            color: "#656d82",
          },
        ]
      : displayed;
  return (
    <div className="rounded bg-[var(--muted)]/30 p-1">
      <p className="px-1 pt-0.5 text-[9px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {title}
      </p>
      <PieChart width={150} height={88}>
        <Pie
          data={pieData}
          cx={75}
          cy={42}
          innerRadius={18}
          outerRadius={36}
          dataKey="value"
          startAngle={90}
          endAngle={-270}
          stroke="white"
          strokeWidth={1}
        >
          {pieData.map((e) => (
            <Cell key={e.key} fill={e.color} />
          ))}
        </Pie>
      </PieChart>
      <ul className="mt-0.5 grid grid-cols-1 gap-0.5 px-1 pb-1">
        {pieData.map((e) => {
          const pct = Math.round((e.value / total) * 100);
          return (
            <li key={e.key} className="flex items-center gap-1 text-[9px] text-[var(--muted-foreground)]">
              <span
                className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                style={{ background: e.color }}
              />
              <span className="truncate flex-1">{e.name}</span>
              <span className="tabular-nums">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MapTooltip({
  data,
  x,
  y,
  containerWidth,
  containerHeight,
  familyUniverse,
  pinned,
  onClose,
}: MapTooltipExtraProps) {
  // Shrink to fit narrow containers (the map renders at half page width).
  const TOOLTIP_WIDTH = Math.min(420, containerWidth - 12);
  const TOOLTIP_HEIGHT_EST = data.excluded ? 120 : 500;
  const preferredLeft =
    x + TOOLTIP_WIDTH + 18 > containerWidth ? x - TOOLTIP_WIDTH - 14 : x + 14;
  const left = Math.max(6, Math.min(containerWidth - TOOLTIP_WIDTH - 6, preferredLeft));
  const top =
    y + TOOLTIP_HEIGHT_EST + 24 > containerHeight
      ? Math.max(8, y - TOOLTIP_HEIGHT_EST - 14)
      : y + 18;

  // Countries below the €1B corpus threshold: a compact explanatory card
  // instead of the full stats tooltip.
  if (data.excluded) {
    return (
      <div
        className={`absolute z-50 rounded border border-[var(--border)] bg-white shadow-lg ${
          pinned ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{ left, top, width: TOOLTIP_WIDTH }}
      >
        <div className="px-4 py-3 relative">
          {pinned && (
            <button
              onClick={onClose}
              className="absolute top-2.5 right-3 flex h-5 w-5 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] text-[10px]"
            >
              ✕
            </button>
          )}
          <p className="text-xs uppercase tracking-widest text-[var(--muted-foreground)] pr-7">
            {data.name}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--foreground)]">
            Not in the data corpus for now. We follow the tech scene and its
            developments in {data.name} with excitement.
          </p>
        </div>
      </div>
    );
  }

  // € — not company count — so the biggest slice is genuinely the biggest
  // vehicle by capital, not just the one with the most (often small) awards.
  // Real institution grain (byVehicle: a specific NDB, or a SATR row's raw
  // granting authority), not the 10-bucket family — colored by each
  // vehicle's PARENT family so, e.g., every German state-aid ministry/agency
  // still reads as "yellow" at a glance while the legend gives the specific
  // name. Falls back to the coarser byFamily if a country's data predates
  // byVehicle (shouldn't happen post-rebuild, but keeps this from going
  // blank on stale data).
  const vehiclePie = (
    data.byVehicle?.length
      ? [...data.byVehicle].sort((a, b) => b.eur - a.eur).map((d, i) => ({
          name: d.label,
          value: d.eur,
          key: `${d.family}:${i}`,
          color: FAMILY_COLORS[d.family] ?? "#6b7280",
        }))
      : [...(data.byFamily ?? [])].sort((a, b) => b.eur - a.eur).map((d) => ({
          name: d.label,
          value: d.eur,
          key: d.family,
          color: FAMILY_COLORS[d.family] ?? "#6b7280",
        }))
  );

  const sectorPie = [...(data.bySector ?? [])]
    .sort((a, b) => b.companies - a.companies)
    .map((d) => ({
      name: d.label,
      value: d.companies,
      key: d.sector,
      color: SECTOR_COLORS[d.sector] ?? "#6b7280",
    }));

  const present = new Set((data.byFamily ?? []).map((d) => d.family));
  const missing = familyUniverse.filter((f) => !present.has(f.family));
  const rating = data.coverageRating;
  const ratingConf = rating ? (RATING_CONFIG[rating.rating] ?? null) : null;

  const narrative = narrativeLine(
    data.name,
    data.narrative,
    data.bySector ?? [],
    (data.byFamily ?? []).length,
    familyUniverse.length,
  );

  return (
    <div
      className={`absolute z-50 rounded border border-[var(--border)] bg-white shadow-lg ${
        pinned ? "pointer-events-auto" : "pointer-events-none"
      }`}
      style={{ left, top, width: TOOLTIP_WIDTH }}
    >
      {/* Header */}
      <div className="border-b border-[var(--border)] px-4 py-3 relative">
        {pinned && (
          <button
            onClick={onClose}
            className="absolute top-2.5 right-3 flex h-5 w-5 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] text-[10px]"
          >
            ✕
          </button>
        )}
        <div className="flex items-start gap-3 pr-7">
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest text-[var(--muted-foreground)]">
              {data.name}
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-base font-semibold tabular-nums text-[var(--primary)]">
                {(data.companies ?? 0).toLocaleString()} companies
              </span>
              <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
                {formatEur(data.totalEur ?? 0)} public support
              </span>
            </div>
          </div>
          {ratingConf && (
            <span
              className="mt-1 flex-shrink-0 rounded px-2 py-0.5 text-xs font-bold"
              style={{ background: ratingConf.bg, color: ratingConf.text }}
            >
              {rating!.rating}
            </span>
          )}
        </div>
      </div>

      {/* Narrative */}
      {narrative && (
        <p className="px-4 pt-3 pb-1 text-[12px] leading-relaxed text-[var(--foreground)]">
          {narrative}
        </p>
      )}

      {/* Charts: vehicle pie (€, biggest first) left, sector pie right */}
      <div className="grid grid-cols-2 gap-2 px-3 pb-2 pt-2">
        <PieBlock title="By vehicle (€)" entries={vehiclePie} maxRows={5} />
        <PieBlock title="By sector" entries={sectorPie} maxRows={5} />
      </div>

      {/* Coverage footer */}
      <div className="border-t border-[var(--border)] px-4 py-2.5">
        {rating && (
          <p className="text-[10px] leading-snug text-[var(--muted-foreground)] mb-2">
            {rating.note}
          </p>
        )}
        {missing.length > 0 ? (
          <>
            <p className="text-[9px] uppercase tracking-widest text-[var(--muted-foreground)] mb-1">
              Not in corpus
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {missing.map((f) => (
                <span
                  key={f.family}
                  className="rounded-sm bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]"
                >
                  {f.label}
                </span>
              ))}
            </div>
          </>
        ) : !rating ? (
          <p className="text-[11px] text-[#15803d]">
            All {familyUniverse.length} instruments present
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface EuropeMapProps {
  countryData: Record<string, CountryData>;
}

export function EuropeMap({ countryData }: EuropeMapProps) {
  const [tooltip, setTooltip] = useState<{
    data: CountryData;
    x: number;
    y: number;
    pinned: boolean;
  } | null>(null);

  const [containerWidth, setContainerWidth] = useState(800);
  const [containerHeight, setContainerHeight] = useState(500);

  // Ranked choropleth: shade each covered country by company count.
  // Quantile breakpoints are derived from the data at render time — not
  // hardcoded — so the scale re-ranks itself whenever the corpus changes.
  const scale = useMemo(() => {
    // Pale to deep navy, so more companies = deeper ink on the paper stage.
    const RAMP = ["#e2e8f2", "#bccbe3", "#8aa3cc", "#51709f", "#10203f"];
    const counts = Object.values(countryData)
      .filter((c) => !c.excluded)
      .map((c) => c.companies ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    if (counts.length === 0) {
      return { fillFor: () => RAMP[0], buckets: [] as { color: string; min: number; max: number }[] };
    }
    const quantile = (p: number) => {
      const idx = (counts.length - 1) * p;
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      return counts[lo] + (counts[hi] - counts[lo]) * (idx - lo);
    };
    const edges = RAMP.map((_, i) => quantile((i + 1) / RAMP.length));
    const bucketIndex = (n: number) => {
      for (let i = 0; i < edges.length; i++) if (n <= edges[i]) return i;
      return edges.length - 1;
    };
    const buckets = RAMP.map((color, i) => ({
      color,
      min: i === 0 ? counts[0] : Math.floor(edges[i - 1]) + 1,
      max: Math.round(edges[i]),
    }));
    return { fillFor: (n: number) => RAMP[bucketIndex(n)], buckets };
  }, [countryData]);

  // The universe of instrument families that appear anywhere in the corpus,
  // ordered by total reach. Used to flag, per country, which instruments have
  // zero coverage.
  const familyUniverse = useMemo(() => {
    const totals = new Map<string, { family: string; label: string; total: number }>();
    for (const c of Object.values(countryData)) {
      for (const f of c.byFamily ?? []) {
        const cur = totals.get(f.family) ?? { family: f.family, label: f.label, total: 0 };
        cur.total += f.companies;
        totals.set(f.family, cur);
      }
    }
    return [...totals.values()].sort((a, b) => b.total - a.total);
  }, [countryData]);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const rect = node.getBoundingClientRect();
      setContainerWidth(rect.width);
      setContainerHeight(rect.height);
    }
  }, []);

  function getIso2(geo: GeographyFeature): string | undefined {
    return NUMERIC_TO_ISO2[String(geo.id ?? "").padStart(3, "0")];
  }

  function handleMouseEnter(geo: GeographyFeature, evt: React.MouseEvent<SVGPathElement>) {
    if (tooltip?.pinned) return;
    const iso2 = getIso2(geo);
    if (!iso2) return;
    const data = countryData[iso2];
    if (!data) return;
    const rect = evt.currentTarget.closest("div")?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ data, x: evt.clientX - rect.left, y: evt.clientY - rect.top, pinned: false });
  }

  function handleMouseMove(geo: GeographyFeature, evt: React.MouseEvent<SVGPathElement>) {
    if (tooltip?.pinned) return;
    const iso2 = getIso2(geo);
    if (!iso2 || !countryData[iso2]) return;
    const rect = evt.currentTarget.closest("div")?.getBoundingClientRect();
    if (!rect) return;
    setTooltip((prev) =>
      prev ? { ...prev, x: evt.clientX - rect.left, y: evt.clientY - rect.top } : prev
    );
  }

  function handleMouseLeave() {
    setTooltip((prev) => (prev?.pinned ? prev : null));
  }

  function handleClick(geo: GeographyFeature, evt: React.MouseEvent<SVGPathElement>) {
    const iso2 = getIso2(geo);
    if (!iso2) return;
    const data = countryData[iso2];
    if (!data) return;
    const rect = evt.currentTarget.closest("div")?.getBoundingClientRect();
    if (!rect) return;
    // Clicking the same country again while pinned closes it.
    if (tooltip?.pinned && tooltip.data === data) {
      setTooltip(null);
      return;
    }
    setTooltip({ data, x: evt.clientX - rect.left, y: evt.clientY - rect.top, pinned: true });
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [15, 54], scale: 580 }}
        width={800}
        height={500}
        style={{ width: "100%", height: "auto" }}
      >
        <ZoomableGroup zoom={1} minZoom={1} maxZoom={1}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies
                .filter((geo) => {
                  const numericId = String(geo.id ?? "").padStart(3, "0");
                  const iso2 = NUMERIC_TO_ISO2[numericId];
                  return iso2 && EUROPEAN_ISO2.has(iso2);
                })
                .map((geo) => {
                  const numericId = String(geo.id ?? "").padStart(3, "0");
                  const iso2 = NUMERIC_TO_ISO2[numericId];
                  const datum = iso2 ? countryData[iso2] : undefined;
                  const hasData = Boolean(datum);
                  const fill =
                    datum && !datum.excluded ? scale.fillFor(datum.companies ?? 0) : "#eee7d5";
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={(evt) => handleMouseEnter(geo, evt)}
                      onMouseMove={(evt) => handleMouseMove(geo, evt)}
                      onMouseLeave={handleMouseLeave}
                      onClick={(evt) => handleClick(geo, evt)}
                      style={{
                        default: {
                          fill,
                          stroke: "rgba(10,10,10,0.14)",
                          strokeWidth: 0.5,
                          outline: "none",
                        },
                        hover: {
                          fill: hasData ? "#dbeafe" : "#1b2740",
                          stroke: "#10203f",
                          strokeWidth: 0.75,
                          outline: "none",
                          cursor: hasData ? "pointer" : "default",
                        },
                        pressed: {
                          fill: "#10203f",
                          outline: "none",
                        },
                      }}
                    />
                  );
                })
            }
          </Geographies>
          <g>
            {MARKER_COUNTRIES.map((m) => {
              const data = countryData[m.iso2];
              if (!data) return null;
              const xy = MERCATOR([m.lon, m.lat]);
              if (!xy) return null;
              const [px, py] = xy;
              const onEnter = (evt: React.MouseEvent<SVGGElement>) => {
                if (tooltip?.pinned) return;
                const rect = evt.currentTarget.closest("div")?.getBoundingClientRect();
                if (!rect) return;
                setTooltip({
                  data,
                  x: evt.clientX - rect.left,
                  y: evt.clientY - rect.top,
                  pinned: false,
                });
              };
              const onMove = (evt: React.MouseEvent<SVGGElement>) => {
                if (tooltip?.pinned) return;
                const rect = evt.currentTarget.closest("div")?.getBoundingClientRect();
                if (!rect) return;
                setTooltip((prev) =>
                  prev
                    ? { ...prev, x: evt.clientX - rect.left, y: evt.clientY - rect.top }
                    : prev,
                );
              };
              const onClick = (evt: React.MouseEvent<SVGGElement>) => {
                const rect = evt.currentTarget.closest("div")?.getBoundingClientRect();
                if (!rect) return;
                if (tooltip?.pinned && tooltip.data === data) {
                  setTooltip(null);
                  return;
                }
                setTooltip({
                  data,
                  x: evt.clientX - rect.left,
                  y: evt.clientY - rect.top,
                  pinned: true,
                });
              };
              return (
                <g
                  key={m.iso2}
                  transform={`translate(${px} ${py})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={onEnter}
                  onMouseMove={onMove}
                  onMouseLeave={handleMouseLeave}
                  onClick={onClick}
                >
                  <circle
                    r={4.5}
                    fill={data.excluded ? "#e2dbc4" : "#10203f"}
                    stroke="#f6f1e6"
                    strokeWidth={1.2}
                  />
                  <text
                    textAnchor="middle"
                    y={-9}
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      fill: data.excluded ? "#656d82" : "#10203f",
                      stroke: "#f6f1e6",
                      strokeWidth: 0.6,
                      paintOrder: "stroke",
                    }}
                  >
                    {m.iso2}
                  </text>
                </g>
              );
            })}
          </g>
        </ZoomableGroup>
      </ComposableMap>

      {tooltip && (
        <MapTooltip
          data={tooltip.data}
          x={tooltip.x}
          y={tooltip.y}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          familyUniverse={familyUniverse}
          pinned={tooltip.pinned}
          onClose={() => setTooltip(null)}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--foreground-soft)]">
        <span className="font-medium text-[var(--foreground)]">Companies in study</span>
        <span className="flex items-center gap-0.5">
          {scale.buckets.map((b) => (
            <span
              key={b.color}
              className="inline-block h-3 w-7 first:rounded-l-sm last:rounded-r-sm"
              style={{ backgroundColor: b.color }}
              title={`${b.min.toLocaleString()}–${b.max.toLocaleString()} companies`}
            />
          ))}
        </span>
        {scale.buckets.length > 0 && (
          <span className="tabular-nums">
            {scale.buckets[0].min.toLocaleString()} →{" "}
            {scale.buckets[scale.buckets.length - 1].max.toLocaleString()}
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-[var(--muted)] border border-[var(--border)]" />
          Outside the corpus
        </span>
        <span className="text-[var(--muted-foreground)]">· Click to pin</span>
      </div>
    </div>
  );
}
