export function fmtEur(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  if (Math.abs(value) >= 1e9) return `€${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `€${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `€${(value / 1e3).toFixed(0)}K`;
  return `€${value.toFixed(0)}`;
}

export function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

export function fmtInt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}
