export const sectorColors: Record<string, string> = {
  life_sciences: "#7B3F61",
  cleantech: "#2D6A4F",
  deeptech_hardware: "#1F3A93",
  defense: "#5C2A2A",
  digital: "#D97706",
  space: "#1B263B",
  other: "#6B7280",
};

// Tremor colour names for @tremor/react chart props
export const sectorTremorColors: Record<string, string> = {
  life_sciences: "fuchsia",
  cleantech: "emerald",
  deeptech_hardware: "indigo",
  defense: "rose",
  digital: "amber",
  space: "slate",
  other: "gray",
};

export const SECTOR_ORDER = [
  "life_sciences",
  "cleantech",
  "deeptech_hardware",
  "defense",
  "digital",
  "space",
  "other",
];

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

export const SECTOR_LABELS: Record<string, string> = {
  life_sciences: "Life sciences",
  cleantech: "Cleantech",
  deeptech_hardware: "Deep tech and hardware",
  defense: "Defence",
  digital: "Digital",
  space: "Space",
  other: "Other",
  unclassified: "Unclassified",
};

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
  deeptech_hardware: "Deep tech",
};

/** Axis-tick label for an instrument family id. Falls back to the id itself. */
export function familyTick(id: string): string {
  return FAMILY_SHORT[id] ?? FAMILY_LABELS[id] ?? id;
}

/** Axis-tick label for a sector id. */
export function sectorTick(id: string): string {
  return SECTOR_SHORT[id] ?? id;
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
