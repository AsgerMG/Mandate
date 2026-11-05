// Where a published row points, and what that link honestly is.
//
// Every institution in a brief renders as a live link. The three sources are
// not interchangeable, and the row says which one it got, because "apply here"
// and "this scheme's public record" are different promises and a founder acts
// on the first.
//
// Nothing here invents a URL. A row with no material gets no link and says so
// by simply not being one — a wrong application link is worse than none.
import { loadBodyUrls, loadFundSnapshot } from "./corpus";
import type { InstrumentRow } from "./types";

export type LinkKind = "apply" | "scheme" | "programme";

export interface InstrumentLink {
  url: string;
  kind: LinkKind;
  /** What the reader is about to open, in four words or fewer. */
  label: string;
}

/**
 * The EU's own case register entry for a notified aid scheme.
 *
 * Derived, not stored: the scheme code IS the identifier in that register, so
 * the URL is a pure function of it. This is the traceability half of the ask —
 * it proves the scheme exists and shows its legal basis — and it is
 * deliberately never labelled as somewhere to apply.
 */
export function schemeRegisterUrl(schemeCode?: string): string | undefined {
  const code = (schemeCode ?? "").trim().toUpperCase();
  return /^SA\.\d+$/.test(code)
    ? `https://competition-cases.ec.europa.eu/cases/${code}`
    : undefined;
}

/**
 * Best available link for a row, strongest promise first:
 *
 *   1. a curated application portal for THIS instrument
 *   2. the scheme's entry in the EU state-aid case register
 *   3. the channel's official programme page
 */
/** Names are matched loosely: the curated table is written by hand and the
 *  corpus names carry accents and casing the author will not reproduce
 *  exactly. Comparing on letters and digits alone makes the join survive that
 *  without a per-name alias list. */
function bodyKey(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function instrumentLink(row: InstrumentRow): InstrumentLink | undefined {
  if (row.applicationUrl) {
    return { url: row.applicationUrl, kind: "apply", label: "Apply" };
  }
  const scheme = schemeRegisterUrl(row.schemeCode);
  if (scheme) {
    return { url: scheme, kind: "scheme", label: "Scheme record" };
  }
  const programme = loadFundSnapshot(row.channel)?.applyUrl;
  if (programme) {
    return { url: programme, kind: "programme", label: "Programme page" };
  }
  // Channels with no single portal (the national development banks: the
  // operator differs by country) carry a curated per-body table instead.
  // Twenty-four bodies cover that channel's entire award volume.
  const body = loadBodyUrls(row.channel).get(bodyKey(row.instrument))
    ?? loadBodyUrls(row.channel).get(bodyKey(row.administeringBody ?? ""));
  if (body) {
    return { url: body, kind: "programme", label: "Institution page" };
  }
  return undefined;
}
