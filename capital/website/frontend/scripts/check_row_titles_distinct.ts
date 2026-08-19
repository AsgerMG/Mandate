/**
 * NO TWO ROWS A FOUNDER IS OFFERED MAY RENDER AS ONE STRING UNLESS THEY REALLY
 * ARE ONE NAME.
 *
 * HERMETIC: the committed corpus snapshot rendered through the shipped naming
 * chain. No DATABASE_URL, no network, so it runs on CI and on a fresh worktree
 * — and it cannot pass by having nothing to read, because it fails on an empty
 * pool. Same shape, and the same reasons, as check_body_named_rows.ts.
 *
 * ── The two halves, which are two different owners' problems ──────────────
 * MERGED BY THE CUT — FATAL. Two funds with DIFFERENT names that come out of
 *   `ROW_TITLE_CHARS` as one string. Nothing downstream can recover from this:
 *   the collapse demotes one of them out of the table, and neither the founder
 *   nor the model has any information with which to prefer the other. This is
 *   ours, it is a rendering fault, and `cutTitlesApart` exists to make it zero.
 *
 * ONE NAME ON TWO ROWS — REPORTED, AND RATCHETED. Two funds the corpus calls
 *   the same thing. No cut can fix that and this file must not pretend
 *   otherwise: six Innovasjon Norge leaves are all literally named "Innovasjon
 *   Norge", three Bpifrance rows are all "Bpifrance". They are a NAMING defect
 *   in the corpus, they are `bodyNamedRow`'s subject and wsHF's open §4, and
 *   the honest thing here is to count them and forbid the count from growing.
 *
 * ── The test, for a pair nobody has seen ──────────────────────────────────
 * Not a register of known collisions — the next one is whatever a register
 * publishes next. Render both rows through the function that renders them and
 * compare the strings. `cutTitlesApart` reports its own unresolved groups, so
 * this file asks the renderer rather than re-deriving the question.
 *
 * ── Why the group is the COUNTRY ──────────────────────────────────────────
 * The cut is a fact about the rows in front of ONE reader, so it has to be
 * asked of a plausible table. A founder's own table is a function of their
 * intake and cannot be enumerated here; their country's offerable leaves are
 * the widest table any single founder in that market can be handed, so a pair
 * that separates there separates in every table drawn from it. Wider than the
 * real thing, and wider is the safe direction: it can report a pair no founder
 * meets, and it can never miss one they do.
 *
 * Run: npx tsx scripts/check_row_titles_distinct.ts
 */
import { cutTitlesApart } from "../lib/intelligence/rowTitleCut";
import { ROW_TITLE_CHARS } from "../lib/intelligence/schemeText";
import type { InstrumentRow } from "../lib/intelligence/types";

/** Two funds the corpus calls the same thing. It cannot go up.
 *
 *  26 offerable rows on the committed snapshot, 2026-08-19, in ten classes.
 *  Six Innovasjon Norge leaves are all literally "Innovasjon Norge · Grants";
 *  three Bpifrance rows are all "Bpifrance"; five French leaves of SA.111723
 *  and SA.111726 carry the regime's own title with a MINISTRY as their body,
 *  which `nameableBody` refuses to print and is right to refuse — a department
 *  notifies a regime, it does not take applications.
 *
 *  So this is not a rendering budget and no cut can lower it. The repair is a
 *  CORPUS change: give the row a name of its own, which is
 *  `check_body_named_rows`'s subject and wsHF's open §4. The number is here so
 *  that a load which adds an eleventh class has to say so. */
const SAME_NAME_ROWS = { max: 26 };

async function main() {
  // The committed snapshot through the SHIPPED chain, never a laptop's
  // DATABASE_URL. check_corpus_currency.ts asserts the snapshot and Postgres
  // agree and runs before this in `npm run check`.
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../lib/intelligence/corpus");
  const { distinguishRowNames, nameRowsAsDoors } = await import("../lib/intelligence/shortlist");
  const pool = publishableInstruments();

  if (!pool.length) {
    console.error(
      "check_row_titles_distinct: FAILED — 0 publishable instruments.\n"
      + "  Every pair is vacuously distinct in an empty corpus, so this would\n"
      + "  otherwise pass having checked nothing. Run from website/frontend: the\n"
      + `  snapshot resolves from process.cwd()/public/data. cwd was ${process.cwd()}`);
    process.exit(1);
  }

  const byCountry = new Map<string, InstrumentRow[]>();
  for (const i of pool) {
    const r = {
      channel: i.sourceFamilyBucket ?? i.id,
      instrument: i.name,
      ticket: "",
      usedInField: false,
      fit: "",
      instrumentId: i.id,
      country: i.country,
      capitalType: i.capitalType,
      administeringBody: i.administeringBody,
      administeringBodyShare: i.administeringBodyShare,
      schemeCode: i.schemeCode,
      deliveryRegion: i.deliveryRegion,
      schemeOperators: i.schemeOperators,
    } as InstrumentRow;
    byCountry.set(i.country ?? "??", [...(byCountry.get(i.country ?? "??") ?? []), r]);
  }

  const mergedByCut: string[] = [];
  let sameName = 0;
  const sameNameRows: string[] = [];
  for (const [country, rows] of [...byCountry].sort()) {
    // Production's own naming chain, in production's own order.
    distinguishRowNames(rows);
    nameRowsAsDoors(rows);
    const { merged } = cutTitlesApart(rows.map((r) => r.instrument), ROW_TITLE_CHARS);
    for (const g of merged) {
      mergedByCut.push(`${country}: ${g.map((n) => JSON.stringify(n.slice(0, 150))).join("\n        vs ")}`);
    }
    const byFull = new Map<string, InstrumentRow[]>();
    for (const r of rows) {
      const k = r.instrument.trim().toLowerCase();
      byFull.set(k, [...(byFull.get(k) ?? []), r]);
    }
    for (const [k, g] of byFull) {
      if (g.length < 2) continue;
      sameName += g.length;
      sameNameRows.push(`${country}  x${g.length}  ${JSON.stringify(k.slice(0, 90))}\n`
        + g.map((r) => `        ${r.instrumentId}`).join("\n"));
    }
  }

  if (mergedByCut.length) {
    console.error(
      `check_row_titles_distinct: FAIL — ${mergedByCut.length} group(s) of DIFFERENT funds\n`
      + `  render as one string at ${ROW_TITLE_CHARS} characters. The collapse will demote\n`
      + "  one of each pair out of the founder's table, and neither the founder nor the\n"
      + "  model has anything left to prefer the other by.\n\n"
      + mergedByCut.map((m) => `     ${m}`).join("\n\n")
      + "\n\n  The fix is in lib/intelligence/rowTitleCut.ts, never a wider budget:\n"
      + "  a wider budget spends characters on every row in the corpus and the next\n"
      + "  register publishes a title that diverges past it too.");
    process.exit(1);
  }

  if (sameName > SAME_NAME_ROWS.max) {
    console.error(
      `check_row_titles_distinct: FAIL — ${sameName} offerable rows share a FULL name with\n`
      + `  a sibling, over a ratchet of ${SAME_NAME_ROWS.max}. No cut can separate two rows the\n`
      + "  corpus calls the same thing; the repair is to give the row its own name.\n"
      + "  See lib/intelligence/bodyNamedRow.ts and AWAITING_APPROVAL.md §0.\n\n"
      + sameNameRows.map((m) => `     ${m}`).join("\n\n"));
    process.exit(1);
  }

  console.log(
    `check_row_titles_distinct: ok — ${pool.length} offerable rows across ${byCountry.size} markets, `
    + `0 groups merged by the ${ROW_TITLE_CHARS}-character cut; `
    + `${sameName} rows share a full name with a sibling (ratchet ${SAME_NAME_ROWS.max}).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
