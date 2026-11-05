// ── Sectors are data-driven from the live taxonomy ───────────────────────────
// taxonomy.json is emitted from companies.sector_top/subsector by
// website/build/taxonomy.py, so labels, ordering and colours follow the
// classification automatically — no taxonomy is hardcoded here. A reclassify +
// rebuild updates the whole site.
import taxonomy from "@/public/data/taxonomy.json";

type TaxonomySector = { id: string; label: string; count: number };
const TAXONOMY_SECTORS = (taxonomy.sectors ?? []) as TaxonomySector[];

export const SECTOR_ORDER: string[] = TAXONOMY_SECTORS.map((s) => s.id);

// A fixed, distinct palette assigned deterministically by sector order, so each
// sector keeps a stable colour and any new sector gets one automatically.
const SECTOR_PALETTE = [
  "#2D6A4F", "#1F3A93", "#7B3F61", "#D97706", "#0E7490", "#5C2A2A",
  "#1B263B", "#7C3AED", "#B45309", "#15803D", "#6B7280",
];

export const sectorColors: Record<string, string> = Object.fromEntries(
  SECTOR_ORDER.map((id, i) => [id, SECTOR_PALETTE[i % SECTOR_PALETTE.length]]),
);

export const FAMILY_COLORS: Record<string, string> = {
  horizon_eu_pillar_ii: "blue",
  horizon_eu_partnership: "sky",
  eic: "indigo",
  ipcei: "rose",
  edf: "red",
  innovation_fund: "emerald",
  eib: "cyan",
  eit: "violet",
  chips_ju: "amber",
  national_dev_banks: "lime",
  state_aid_satr: "yellow",
};

export const FAMILY_TREMOR_COLORS = Object.values(FAMILY_COLORS);

export const FAMILY_ORDER = [
  "horizon_eu_pillar_ii",
  "eic",
  "national_dev_banks",
  "state_aid_satr",
  "eit",
  "ipcei",
  "innovation_fund",
  "edf",
  "eib",
  "horizon_eu_partnership",
  "chips_ju",
];

export const FAMILY_LABELS: Record<string, string> = {
  horizon_eu_pillar_ii: "Horizon EU Pillar II",
  horizon_eu_partnership: "Horizon EU Partnerships",
  eic: "EIC",
  ipcei: "IPCEI",
  edf: "EDF",
  innovation_fund: "Innovation Fund",
  eib: "EIB",
  eit: "EIT KICs",
  chips_ju: "Chips JU",
  national_dev_banks: "National Development Banks",
  state_aid_satr: "National state aid (SATR)",
};

// Labels come straight from taxonomy.json (the build's single source). Any slug
// not present (an unclassified company, a future sub-sector) humanises cleanly.
export const SECTOR_LABELS: Record<string, string> = Object.fromEntries(
  TAXONOMY_SECTORS.map((s) => [s.id, s.label]),
);

const SECTOR_ACRONYMS = new Set(["ai", "ev", "pv", "hvac", "iot", "pcb", "ccs", "uav"]);

/** Readable label for any sector_top or subsector slug (taxonomy label, else humanised). */
export function sectorLabel(id: string): string {
  if (!id) return "";
  return (
    SECTOR_LABELS[id] ??
    id
      .split("_")
      .map((p) => (SECTOR_ACRONYMS.has(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
      .join(" ")
  );
}

// Compact labels for crowded chart axes. Keeps full names for prose
// (FAMILY_LABELS) but trims the long ones so axis ticks stop truncating.
export const FAMILY_SHORT: Record<string, string> = {
  horizon_eu_pillar_ii: "Horizon Pillar II",
  horizon_eu_partnership: "Horizon Partnerships",
  eic: "EIC",
  ipcei: "IPCEI",
  edf: "EDF",
  innovation_fund: "Innovation Fund",
  eib: "EIB",
  eit: "EIT KICs",
  chips_ju: "Chips JU",
  national_dev_banks: "Nat. dev. banks",
  state_aid_satr: "State aid",
};

const SECTOR_SHORT: Record<string, string> = {
  ...SECTOR_LABELS,
};

/** Axis-tick label for an instrument family id. Falls back to the id itself. */
export function familyTick(id: string): string {
  return FAMILY_SHORT[id] ?? FAMILY_LABELS[id] ?? id;
}

/** Axis-tick label for a sector id. */
export function sectorTick(id: string): string {
  return SECTOR_SHORT[id] ?? sectorLabel(id);
}

/**
 * Axis-tick label for a co-occurrence pair. Accepts either a combined
 * "family_a + family_b" string or two ids, and returns short names joined
 * with a thin "+" so the label fits a normal axis gutter.
 */
export function pairTick(a: string, b?: string): string {
  if (b === undefined) {
    const parts = a.split(/\s*[+&]\s*/);
    if (parts.length === 2) return `${familyTick(parts[0])} + ${familyTick(parts[1])}`;
    return a;
  }
  return `${familyTick(a)} + ${familyTick(b)}`;
}
