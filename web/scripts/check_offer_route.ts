/**
 * Does every row the product may propose represent something a founder can
 * APPLY TO?
 *
 * FREE — reads source files and the committed snapshot. No model calls, no DB.
 *
 * ── The defect this exists to stop, which happened three times in one night ─
 * On 2026-08-07 three separate populations of rows-that-are-not-funds were
 * found in the corpus, from three unrelated sources:
 *
 *   GB, 16 leaves    one row per distinct value of UKRI Gateway to Research's
 *                    `grantCategory`. "Collaborative R&D", "Feasibility
 *                    Studies", one literally `Unknown`. A founder applies to a
 *                    COMPETITION; that field classifies an award already made.
 *   IPCEI, 11 leaves one row per Commission decision approving a wave. The
 *                    decision names its beneficiaries. A founder applies to a
 *                    national EXPRESSION-OF-INTEREST CALL run by their own
 *                    Member State.
 *   ES               rows named after the legal citation that enabled the aid.
 *                    A founder applies to a CONVOCATORIA.
 *
 * The shared structure is not "missing metadata":
 *
 *   THE ROW'S IDENTITY WAS TAKEN FROM A REGISTER OF AID ALREADY GRANTED, USING
 *   A FIELD THAT DESCRIBES THE AWARD RATHER THAN IDENTIFYING THE OFFER THE
 *   RECIPIENT APPLIED TO.
 *
 * All three were found by humans reading names, hours apart, after the corpus
 * had been shipping them. Two of the three were first "fixed" by hiding the
 * row, which makes the symptom vanish and leaves the non-fund in place.
 *
 * ── What this catches, honestly ───────────────────────────────────────────
 * GB and IPCEI: yes, and on the day the extractor runs — both populations are
 * routeless and both would breach their family's ceiling immediately.
 *
 * SPAIN: NO, and that is not a gap in the check. A convocatoria IS something a
 * founder can apply to; 78 of Spain's 93 publishable rows carry an application
 * URL and 80 carry a deadline. Spain's defect is that the rows are MIS-NAMED,
 * not that they are non-funds. Manufactured objects and mis-described objects
 * are two problems and this axis is about the first. Claiming three of three
 * here would be the same reasoning-from-our-own-columns that caused all this.
 *
 * ── Four assertions ───────────────────────────────────────────────────────
 *   1. The ETL's projection of the rule is not stale.
 *   2. No publishable leaf carries `route_status = 'none'` — fix the corpus,
 *      do not hide the row.
 *   3. Every `route_status = 'none'` cites a source. You may not remove a row
 *      from the offer by assertion; that is what happened here, on three
 *      internal signals and no fetch.
 *   4. RATCHET, per source family: the number of publishable leaves with no
 *      recorded route may not grow. This is the assertion with teeth.
 *
 * Run: npx tsx scripts/check_offer_route.ts
 */
import { readFileSync } from "node:fs";
import { ROUTE_STATUS } from "../lib/intelligence/offerRoute";
import {
  OUT as RATCHET_OUT, readRatchet, routelessByFamily,
} from "./emit_offer_route_ratchet";

interface Problem { axis: string; detail: string; }

async function main() {
  const problems: Problem[] = [];

  // ── 1. The ETL's copy must BE this copy ─────────────────────────────────
  // The judgement this axis replaced shipped its constant into the Python and
  // never taught the row-wise Python predicate about it, so the two languages
  // disagreed about eleven rows from the first commit and nothing fired.
  const { build, OUT } = await import("./emit_offer_route");
  let onDisk = "";
  try { onDisk = readFileSync(OUT, "utf8"); } catch { /* missing */ }
  if (onDisk !== build()) {
    problems.push({
      axis: "etl projection",
      detail: onDisk
        ? "data/offer_route.json is STALE — ETL/lib/offer_route.py is judging " +
          "'can a founder apply to this' by an older rule than the product. " +
          "Run: npx tsx scripts/emit_offer_route.ts"
        : "data/offer_route.json is MISSING — ETL/lib/offer_route.py raises on " +
          "import, so every ETL step that reads the rule is dead. Run: " +
          "npx tsx scripts/emit_offer_route.ts (and make sure the file is " +
          "tracked: data/ is gitignored, so it needs `git add -f`).",
    });
  }

  // Deterministic by construction — the committed snapshot, never a laptop's
  // DATABASE_URL. check_corpus_currency.ts is what holds the snapshot to
  // Postgres; this check depends on that one rather than opening a second
  // connection with its own opinion about which corpus is real.
  delete process.env.DATABASE_URL;
  const { loadDbInstruments, publishableInstruments } =
    await import("../lib/intelligence/corpus");
  const all = loadDbInstruments();
  const pub = publishableInstruments();

  // ── 2. A withheld row may not be publishable ────────────────────────────
  const leaked = pub.filter((i) => i.routeStatus === ROUTE_STATUS.none);
  if (leaked.length) {
    problems.push({
      axis: "withheld row is publishable",
      detail:
        `${leaked.length} row(s) the corpus says nobody can apply to are in the ` +
        `publishable set and can be proposed to a founder:\n      ` +
        leaked.slice(0, 10).map((i) => `${i.id}  ${i.name}`).join("\n      ") +
        `\n    Fix the corpus, not this check. If the row IS an offer, find its ` +
        `route and clear the status; if it is not, find out why ` +
        `publishableInstruments() no longer consults hasOfferRoute().`,
    });
  }

  // ── 3. Withholding must be sourced ──────────────────────────────────────
  // The asymmetry is deliberate and is the whole lesson: `unrecorded` costs
  // nothing and needs nothing, because a gap in our collection is not a claim.
  // `none` is a claim about the world and must be answerable to a source.
  const unsourced = all.filter((i) =>
    i.routeStatus === ROUTE_STATUS.none && !i.routeStatusSource);
  if (unsourced.length) {
    problems.push({
      axis: "unsourced withholding",
      detail:
        `${unsourced.length} row(s) are withheld as not-an-offer with no source:\n      ` +
        unsourced.slice(0, 10).map((i) => `${i.id}  ${i.name}`).join("\n      ") +
        `\n    Every input to "IPCEI is closed" was a fact about our own ` +
        `columns, and it was wrong. Cite the official source that establishes ` +
        `there is no way in, via ETL/terms/mark_offer_route.py --source, or ` +
        `stop withholding the row.`,
    });
  }

  // ── 4. The ratchet ──────────────────────────────────────────────────────
  const ratchet = readRatchet();
  if (!ratchet) {
    problems.push({
      axis: "ratchet baseline",
      detail:
        `${RATCHET_OUT} is missing, so nothing bounds how many unapplicable-to ` +
        `rows the corpus may hold. Run: npx tsx scripts/emit_offer_route_ratchet.ts`,
    });
  } else {
    const routeless = routelessByFamily(pub);
    const families = new Set([
      ...routeless.keys(), ...Object.keys(ratchet.ceilings),
    ]);
    const over: { fam: string; now: number; cap: number; ids: string[] }[] = [];
    for (const fam of [...families].sort()) {
      const ids = routeless.get(fam) ?? [];
      const cap = ratchet.ceilings[fam] ?? 0;
      if (ids.length > cap) over.push({ fam, now: ids.length, cap, ids });
    }
    if (over.length) {
      problems.push({
        axis: "routeless rows grew",
        detail:
          `${over.length} source famil(ies) hold MORE publishable rows with no ` +
          `recorded application route than when the ratchet was set. A new ` +
          `extractor that manufactures rows out of an award register looks ` +
          `exactly like this:\n` +
          over.map((o) => {
            const known = new Set(ratchet.known?.[o.fam] ?? []);
            const arrived = o.ids.filter((id) => !known.has(id));
            return `      ${o.fam.padEnd(24)} ${String(o.now).padStart(4)} routeless ` +
              `against a ceiling of ${o.cap}  (+${o.now - o.cap})\n` +
              (arrived.length
                ? `        arrived since the ceiling was set: ` +
                  `${arrived.slice(0, 8).join(", ")}` +
                  (arrived.length > 8 ? ` … and ${arrived.length - 8} more` : "")
                : `        no new ids — rows already here LOST their route ` +
                  `(a deadline passed out of the snapshot, or a URL was cleared)`);
          }).join("\n") +
          `\n    Ask what object the register's own subjects APPLIED TO. If these ` +
          `rows are that object, record its route (application URL or dated ` +
          `window) — that is the fix, and it is also coverage. If they are not, ` +
          `they are artefacts and should not be rows at all.\n` +
          `    Only if they are real funds whose route the register genuinely ` +
          `does not publish: write the reason into ${RATCHET_OUT} and re-run ` +
          `npx tsx scripts/emit_offer_route_ratchet.ts. A ceiling raised without ` +
          `a reason is not a ratchet.`,
      });
    }
  }

  for (const p of problems) console.log(`  - [${p.axis}] ${p.detail}`);
  if (problems.length) {
    console.log(`\n${problems.length} offer-route problems — the product may be ` +
      `proposing rows nobody can apply to`);
    process.exitCode = 1;
    return;
  }

  const routeless = routelessByFamily(pub);
  const n = [...routeless.values()].reduce((a, b) => a + b.length, 0);
  const withheld = all.filter((i) => i.routeStatus === ROUTE_STATUS.none).length;
  console.log(
    `check_offer_route: ok — ${pub.length} publishable, ${withheld} withheld as ` +
    `not-an-offer (all sourced), ${n} with no recorded route across ` +
    `${routeless.size} families, none above its ceiling.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
