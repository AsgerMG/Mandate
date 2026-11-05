/**
 * No row a founder can be offered may be shown under the name of the body that
 * grants it.
 *
 * HERMETIC: the committed corpus snapshot rendered through the shipped
 * predicates. No DATABASE_URL, no network, so it runs on CI and on a fresh
 * worktree — and it cannot pass by having nothing to read, because it fails on
 * an empty pool. Same shape, and the same reasons, as check_name_evidence.ts.
 *
 * ── The property ──────────────────────────────────────────────────────────
 * A ROW MAY NOT BE OFFERED UNDER THE NAME OF THE BODY THAT GRANTS IT, UNLESS
 * AN OFFICIAL SOURCE SAYS THAT IS THE OBJECT'S OWN NAME.
 *
 * The rule and its test for an unseen row live in lib/intelligence/bodyNamedRow.ts,
 * imported here rather than restated, so this file cannot drift from the
 * definition the product uses.
 *
 * ── What it cost to leave unasked ─────────────────────────────────────────
 * Twenty-six offerable rows were presented to founders as the name of a German
 * tax office ("Finanzamt Aachen-Stadt", "MFW SL"), a French ministry
 * ("Ministère de l'économie et des finances") and an Italian directorate.
 * wsHA measured that 28 of 287 sibling-miss pairs (9.8%) had at least one door
 * shown this way. A door labelled with a ministry's name cannot be chosen over
 * its sibling by anything — not the model, not a founder reading the page — so
 * for those rows it was never a ranking problem. It was an unreadable row.
 *
 * ── Why the check is here and not only in the ETL ─────────────────────────
 * Because the ETL had this exact fix and switched it off. Four SA numbers sat
 * in a hand-written `CASE_TITLE_NOT_A_SCHEME` skip list in
 * populate_funding_instruments.py, for a defensible reason — their register
 * record is an EVALUATION PLAN, not a scheme — and the consequence, twenty-two
 * rows falling back to their granting body's name, was nowhere asserted. A
 * skip list with a good reason and no downstream test is how a fix becomes a
 * defect. This is the assertion that was missing.
 *
 * Run: npx tsx scripts/check_body_named_rows.ts
 */
import { bodyNamedRows, whyBodyNamed } from "../lib/intelligence/bodyNamedRow";

async function main() {
  // The committed snapshot through the SHIPPED predicate chain, never a
  // laptop's DATABASE_URL. check_corpus_currency.ts asserts the snapshot and
  // Postgres agree and runs before this in `npm run check`.
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../lib/intelligence/corpus");
  const pool = publishableInstruments();

  if (!pool.length) {
    console.error(
      "check_body_named_rows: FAILED — 0 publishable instruments.\n" +
      "  Every row is vacuously well-named in an empty corpus, so this would\n" +
      "  otherwise pass having checked nothing. Run from website/frontend: the\n" +
      `  snapshot resolves from process.cwd()/public/data. cwd was ${process.cwd()}`);
    process.exit(1);
  }

  const bad = bodyNamedRows(pool);
  if (bad.length) {
    console.error(
      `check_body_named_rows: FAIL — ${bad.length} offerable row(s) are shown ` +
      "to a founder as the name of the body that grants them.\n");
    for (const r of bad) {
      console.error(`  ${r.id.padEnd(70)} ${(r.schemeCode ?? "--").padEnd(11)} ` +
                    `${(r.country ?? "--").padEnd(3)}`);
      console.error(`    ${whyBodyNamed(r)}`);
    }
    console.error(
      "\n  The name carries nothing `administeringBody` does not already carry, " +
      "so the row has no\n  identity of its own and no sibling of the same " +
      "scheme can be told apart from it.\n" +
      "  A row with an SA number is named from the Commission's case register " +
      "by\n  ETL/events/load/populate_funding_instruments.py; if its record is " +
      "an evaluation plan,\n  the register LINKS the scheme it evaluates and " +
      "that case's title is the name.\n" +
      "  Do NOT satisfy this by deleting the row or by inventing a label: both " +
      "hide the\n  question of what the thing a founder would apply to is " +
      "actually called.");
    process.exit(1);
  }

  console.log(
    `check_body_named_rows: ok — none of the ${pool.length} offerable rows is ` +
    "shown under the name of the body that grants it");
}

main();
