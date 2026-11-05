/**
 * NO NAME A FOUNDER READS MAY REVEAL THE ROW'S INTERNAL IDENTIFIER.
 *
 * HERMETIC: the committed corpus snapshot rendered through the shipped
 * labeller. No DATABASE_URL, no network, so it runs on CI and on a fresh
 * worktree — and it cannot pass by having nothing to read, because it fails on
 * an empty corpus and on a corpus with no ambiguous titles in it.
 *
 * ── The property ──────────────────────────────────────────────────────────
 * A ROW'S DISPLAYED NAME IS BUILT ONLY OUT OF TEXT SOMEBODY WROTE ABOUT THE
 * FUND: its own title, a body the register supports naming, the region its
 * awards land in, the code it was notified under, what kind of capital it is.
 * An internal identifier is none of those.
 *
 * It is the sibling of `check_name_evidence`, one stage later and asked of a
 * different thing. That one asks whether the RECORD was named by something
 * outside its id (a provenance column); this asks whether the LABEL the
 * disambiguator produces for it reveals one (the text itself). A row can pass
 * that one and fail this: SA.111728's five leaves all carry a register-given
 * title, and two of them still reached a founder reading
 * "· rnd  sa 111728  ministere de l economie et des finances".
 *
 * ── What it grades, and what it cannot ────────────────────────────────────
 * The QUALIFIER, which is the only part of a name this repo builds. A fund's
 * own title is the register's and is not ours to judge here — and it could not
 * be judged by this test anyway, because a loader that derives an id FROM a
 * name makes every word of that name an id word. `check_name_evidence` is
 * where the title's provenance is asked.
 *
 * The row it builds carries the fields the labeller declares it reads. If the
 * labeller starts reading a field this does not supply, this check UNDER-tests
 * rather than false-passes: a leak needs the id, and the id is always supplied.
 *
 * Prove it can fail:
 *   PROVE=1 npx tsx scripts/check_row_name_not_id.ts
 * which grades one real corpus row relabelled the way the removed branch used
 * to label it, and requires that to come back flagged. If the planted label is
 * reported clean, THIS CHECK has stopped working and it fails for that instead.
 */
import { internalIdWordsIn, qualifierSegments } from "../lib/intelligence/rowIdentity";
import { regionNameFor } from "../lib/intelligence/regions.generated";
import { distinguishRowNames } from "../lib/intelligence/shortlist";
import type { InstrumentRow } from "../lib/intelligence/types";

/** The fields a human wrote about this fund that a caller may show. NOT
 *  `administeringBody` raw: `nameableBody` refuses a ministry, and admitting
 *  the raw column here would license the laundering this check exists for. */
function humanFields(r: InstrumentRow): (string | undefined)[] {
  return [
    r.schemeCode, r.capitalType, r.country,
    regionNameFor(r.deliveryRegion ?? "") ?? undefined,
  ];
}

function leaks(r: InstrumentRow): string[] {
  return qualifierSegments(r.instrument)
    .flatMap((seg) => internalIdWordsIn(seg, r.instrumentId, humanFields(r)));
}

async function main() {
  // The committed snapshot through the shipped predicate chain, never a
  // laptop's DATABASE_URL -- same reason and same trustworthiness as
  // check_name_evidence.ts: check_corpus_currency.ts asserts the snapshot and
  // Postgres agree, and it runs before this in `npm run check`.
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../lib/intelligence/corpus");
  const pool = publishableInstruments();

  if (!pool.length) {
    console.error(
      "check_row_name_not_id: FAILED — 0 publishable instruments.\n"
      + "  Every label is vacuously clean in an empty corpus. Run from\n"
      + `  website/frontend: the snapshot resolves from cwd. cwd was ${process.cwd()}`);
    process.exit(1);
  }

  // The naming-relevant fields, as the labeller declares them. See the note in
  // the header for why an omission here cannot produce a false pass.
  const rows: InstrumentRow[] = pool.map((i) => ({
    channel: "state_aid_satr",
    instrument: i.name,
    instrumentId: i.id,
    ticket: "",
    usedInField: false,
    fit: "",
    country: i.country,
    capitalType: i.capitalType ?? undefined,
    schemeCode: i.schemeCode ?? undefined,
    deliveryRegion: i.deliveryRegion ?? undefined,
    administeringBody: i.administeringBody ?? undefined,
    administeringBodyShare: i.administeringBodyShare ?? undefined,
  } as InstrumentRow));

  // WORST CASE ON PURPOSE: every publishable fund in one table. A founder sees
  // a subset, and a subset can only make the peer groups smaller — so a corpus
  // clean here is clean for every founder, and no bench profile has to happen
  // to draw the group.
  distinguishRowNames(rows);

  const groups = new Map<string, number>();
  for (const r of rows) groups.set(r.instrument, (groups.get(r.instrument) ?? 0) + 1);
  const qualified = rows.filter((r) => qualifierSegments(r.instrument).length);
  if (!qualified.length) {
    console.error(
      "check_row_name_not_id: FAILED — the labeller produced no qualifier on any\n"
      + `  of ${rows.length} publishable rows, so this check graded nothing. Either the\n`
      + "  corpus no longer holds two funds under one title, or the disambiguator\n"
      + "  stopped running. Both need a person, not a green tick.");
    process.exit(1);
  }

  const bad = rows.filter((r) => leaks(r).length);

  // PROVE: the grader itself, on one real row relabelled the way the removed
  // branch labelled it. Nothing else in this file can tell a working grader
  // from one that has quietly stopped finding anything.
  if (process.env.PROVE) {
    const victim = qualified[0];
    const planted = {
      ...victim,
      instrument: `${victim.instrument.split(" · ")[0]} · ${
        (victim.instrumentId ?? "").replace(/_/g, " ")}`,
    } as InstrumentRow;
    const found = leaks(planted);
    if (!found.length) {
      console.error(
        "check_row_name_not_id: FAILED ITS OWN PROOF — a label built from the\n"
        + `  instrument id came back clean:\n    ${planted.instrument}\n`
        + "  The grader is not grading. Fix it before trusting a green run.");
      process.exit(1);
    }
    console.log(`check_row_name_not_id: PROVE ok — the planted id label was flagged on `
      + `${found.length} word(s): ${found.slice(0, 6).join(", ")}`);
  }

  if (bad.length) {
    console.error("check_row_name_not_id: FAIL\n");
    console.error(`${bad.length} of ${rows.length} publishable rows are named with a word `
      + "that came from the instrument id and from nothing anybody wrote about the fund.\n"
      + "A fallback that reveals an internal identifier is not a name; give the row a fact\n"
      + "it can support, or let it collapse onto its twin (resolveNameCollisions demotes,\n"
      + "it does not delete).\n");
    for (const r of bad.slice(0, 20)) {
      console.error(`  ${r.instrumentId}\n    -> ${r.instrument}\n    leaks: ${leaks(r).join(" ")}`);
    }
    process.exit(1);
  }

  const collided = [...groups.values()].filter((n) => n > 1).length;
  console.log(`check_row_name_not_id: ok — ${rows.length} publishable rows, `
    + `${qualified.length} carrying a qualifier, none revealing an instrument id. `
    + `${collided} label(s) still shared by two or more rows, which the collapse demotes.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
