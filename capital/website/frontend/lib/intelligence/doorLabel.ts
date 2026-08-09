// ONE name for a fund, wherever the page names it.
//
// ── The defect this exists to make impossible ─────────────────────────────
// Driven in a real browser (a French robotics founder, `npm run drive`), one
// screen named one fund two ways. The instrument table rendered
// "Régime cadre exempté ... (RDI) pour la période 2024-2026 · Caisse des
// Dépôts", because `distinguishRowNames` had appended the granting body. The
// question underneath cited the SAME leaf as
// "Régime cadre exempté ... (RDI) pour la période 2024-2026 requires: ...",
// because `gateReach` took `inst.name` raw and never saw the table's work.
//
// This project has now hit "two functions, two keys" three times -- the dedupe
// against the disambiguator, `displayInstitutionName` against `rowDisplayLabel`,
// and now the table against the question. Each time the fix was one exported
// function rather than a comment asking two call sites to agree. So: one
// function, imported by both, and a leaf module so neither has to import the
// other.
//
// ── Why the body matters here more than anywhere else ─────────────────────
// SA.111723 holds twelve leaves and twelve different granting bodies, and a
// founder is normally shown exactly ONE of them. Nothing collides, so nothing
// is appended, and the row names a RULEBOOK that eleven other bodies publish
// under. It scores EXACT@5 as a hit and gives the founder nothing to act on.
// Ambiguity is a property of the REGISTER, not of the five rows this founder
// happened to draw, so that is where it is measured.
import { loadDbInstruments, type DbInstrument } from "./corpus";
import { VIA, nameableBody, type BodyBearing } from "./rowIdentity";

/** Notified schemes the corpus holds more than one leaf for: the schemes whose
 *  title, alone, does not identify a fund a founder could approach. */
let ambiguousCache: Set<string> | null = null;
export function ambiguousSchemes(): Set<string> {
  if (!ambiguousCache) {
    const seen = new Map<string, number>();
    for (const i of loadDbInstruments()) {
      const code = i.schemeCode?.trim();
      if (code) seen.set(code, (seen.get(code) ?? 0) + 1);
    }
    ambiguousCache = new Set([...seen].filter(([, n]) => n > 1).map(([c]) => c));
  }
  return ambiguousCache;
}

/** Test seam. The corpus is hydrated once per process and cached; a suite that
 *  swaps it must be able to drop this with it. */
export function __resetAmbiguousSchemes(): void {
  ambiguousCache = null;
}

/**
 * `name`, qualified by the door it is reached through — or `name` unchanged.
 *
 * Unchanged is the common case and it is not a failure: a fund whose title
 * already identifies it, a scheme with a single leaf, a body the register does
 * not support naming (`nameableBody` refuses a ministry and a scattered vote),
 * and a name that already carries the body all come back as they went in.
 *
 * What it may claim is bounded by what the register said. `administeringBody`
 * is a majority vote over the granting authority published on each individual
 * AWARD, so this asserts award history and never intake: `VIA` is the word, and
 * "apply to" would say something the register never did.
 */
export function doorLabel(name: string, x: BodyBearing): string {
  const code = x.schemeCode?.trim();
  if (!code || !ambiguousSchemes().has(code)) return name;
  const body = nameableBody(x);
  // Appending a body the name already carries is the failure a reader would
  // blame on the register rather than on us.
  if (!body || name.includes(body)) return name;
  return `${name} · ${VIA} ${body}`;
}

/** The same rule from a corpus instrument, for callers holding a leaf rather
 *  than a row. Both spellings exist so neither call site has to build a
 *  half-populated row to ask the question. */
export function doorLabelFor(inst: DbInstrument): string {
  return doorLabel(inst.name, {
    administeringBody: inst.administeringBody,
    administeringBodyShare: inst.administeringBodyShare,
    schemeCode: inst.schemeCode,
  });
}
