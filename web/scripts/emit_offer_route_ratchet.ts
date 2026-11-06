/**
 * Record, per source family, how many publishable leaves the corpus cannot yet
 * show a route into. `check_offer_route.ts` refuses to let those counts grow.
 *
 * FREE — reads the committed snapshot, never a database, so two people running
 * it get the same file. Writes lib/intelligence/offerRouteRatchet.generated.json.
 *
 * ── Why a ceiling per FAMILY and not one number ───────────────────────────
 * A corpus-wide total is where sixteen manufactured rows hide. GB's sixteen
 * GtR `grantCategory` labels landed inside a corpus of a thousand instruments
 * and moved no aggregate anyone was watching; they were found by a human
 * reading names, six hours and two incidents later. Against its own family's
 * ceiling, sixteen new routeless rows is an immediate, unmissable failure on
 * the day the extractor runs.
 *
 * ── Why a ratchet and not a floor of zero ─────────────────────────────────
 * 379 of 806 publishable rows have no recorded route today and nearly all of
 * them are real. A missing route is a gap in OUR COLLECTION, not a fact about
 * the world — the whole point of the workstream that produced this file. A
 * check demanding zero would delete hundreds of live funds; a check demanding
 * "no more than yesterday" costs nothing to satisfy honestly and cannot be
 * satisfied by an extractor that invents rows.
 *
 * ── Raising a ceiling ─────────────────────────────────────────────────────
 * Legitimate: you loaded real funds whose route the register does not publish.
 * Say so in `reasons`, then re-run this. The reason is the artefact — it is
 * what makes the next reader able to tell your load apart from the GB one, and
 * it is the only thing standing between "a ratchet" and "a number someone
 * bumps". Do NOT raise a ceiling to make a red build green without one.
 *
 * Run: npx tsx scripts/emit_offer_route_ratchet.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasRecordedRoute, type OfferRouteFacts } from "../lib/intelligence/offerRoute";

export const OUT = resolve(
  process.cwd(), "lib/intelligence/offerRouteRatchet.generated.json");

export interface Ratchet {
  _comment: string;
  /** Source family -> the most publishable leaves it may hold with no recorded
   *  route. Absent family = ceiling 0, so a NEW extractor of routeless rows
   *  fails on its first row rather than on its 380th. */
  ceilings: Record<string, number>;
  /** Family -> why its ceiling is what it is. Free text, required for any
   *  family above zero, read by humans reviewing the next increase. */
  reasons: Record<string, string>;
  /** Every routeless id at the last emit. Not part of the assertion — the
   *  ceiling is — but it lets a failure NAME the rows that arrived rather than
   *  printing five innocent bystanders sorted alphabetically. Diagnosis is
   *  most of a guard's value: the first version of this check reported the
   *  GB replay against five ADEME rows that had nothing to do with it. */
  known: Record<string, string[]>;
}

/** The measurement, shared with the check so the two cannot drift. Returns the
 *  routeless publishable leaves grouped by family. */
export function routelessByFamily(
  rows: (OfferRouteFacts & { id: string; sourceFamilyBucket?: string | null })[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (hasRecordedRoute(r)) continue;
    const fam = r.sourceFamilyBucket ?? "(unattributed)";
    const ids = out.get(fam);
    if (ids) ids.push(r.id);
    else out.set(fam, [r.id]);
  }
  return out;
}

export function readRatchet(): Ratchet | null {
  try { return JSON.parse(readFileSync(OUT, "utf8")) as Ratchet; }
  catch { return null; }
}

async function main() {
  // The committed snapshot, deliberately, for the same reason check_leaf_cap
  // does it: a guard whose baseline depends on whose laptop ran it is not a
  // baseline. check_corpus_currency.ts is what keeps the snapshot honest
  // against Postgres, and this check depends on that one rather than
  // re-asking the database itself.
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../lib/intelligence/corpus");
  const pub = publishableInstruments();
  const routeless = routelessByFamily(pub);

  const prev = readRatchet();
  const ceilings: Record<string, number> = {};
  const reasons: Record<string, string> = {};
  const known: Record<string, string[]> = {};
  for (const [fam, ids] of [...routeless].sort((a, b) => b[1].length - a[1].length)) {
    ceilings[fam] = ids.length;
    known[fam] = [...ids].sort();
    reasons[fam] = prev?.reasons?.[fam]
      ?? `${ids.length} publishable leaves with no application URL, no dated ` +
         `window and no attested route. UNREVIEWED — recorded at the ratchet's ` +
         `birth (2026-08-07) so the count cannot grow unnoticed. Reviewing these ` +
         `is coverage work, not a build failure.`;
  }

  writeFileSync(OUT, JSON.stringify({
    _comment:
      "GENERATED by web/scripts/emit_offer_route_ratchet.ts from " +
      "the committed instrument snapshot. Ceilings on publishable leaves with " +
      "no recorded application route, per source family. Enforced by " +
      "scripts/check_offer_route.ts. Raising one requires a reason beside it.",
    ceilings, reasons, known,
  } as Ratchet, null, 2) + "\n");

  const total = [...routeless.values()].reduce((a, b) => a + b.length, 0);
  console.log(`wrote ${OUT}`);
  console.log(`  ${total} routeless of ${pub.length} publishable, ` +
    `${Object.keys(ceilings).length} families`);
}

if (process.argv[1]?.endsWith("emit_offer_route_ratchet.ts")) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
