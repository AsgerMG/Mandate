// Is each guard reading the thing it claims to protect, or something upstream
// of it?
//
// ── The pattern this exists to detect ─────────────────────────────────────
// On 2026-08-13 six guards were found asserting a property over a READING that
// could not distinguish two states the guard's own claim distinguishes:
//
//   check_recall_floor       floored `candidateInstrumentIds` while its prose
//                            said "a fund the writer never sees cannot be
//                            advised on". The writer reads the list AFTER
//                            `accessiblePool`. Eight points apart, measured.
//   check_pool_recall_curve  proved the curve current by comparing a hydrated
//                            ROW COUNT. The 53 Spanish closures moved the
//                            offerable set 837 -> 784 and moved that count by
//                            zero.
//   check_corpus_currency    compared 5 of the 37 fields the snapshot carries.
//   check_window_evidence    hand-copied a production predicate, strictly
//                            narrower than the one that withholds.
//   check_missing_data_neutral  calls the right production function and hands
//                            it the CORPUS where production hands it the
//                            founder's own pool.
//   check_index_freshness    row existence as the proxy for retrievability.
//
// ── The property, stated so it holds for a case nobody has seen ───────────
//
//     A GUARD'S READING MUST SEPARATE THE STATES ITS CLAIM SEPARATES.
//
// The loss is always the same kind: the reading omits an argument the subject
// depends on. `publishableInstruments()` is a function of (rows, clock); a row
// count is a function of (rows) and is structurally incapable of the second.
//
// ── What can and cannot be caught by reading source ───────────────────────
// ██ THIS FILE CATCHES ONE OF THE TWO SUB-SHAPES, AND SAYS SO. ██
//
// WRONG STAGE is visible statically: the guard names the wide side of a seam
// the request path narrows, and never names the narrow side. Three of the six
// are that, and they are what `SEAMS` below is for.
//
// WRONG POPULATION is NOT visible statically, and `check_missing_data_neutral`
// is the proof: it imports the production scorer and calls it, so every
// name-based test passes, and the defect is in the ARRAY it passes. Nothing
// short of running it can see that. That half is covered by the other
// mechanism this session introduced — an EXECUTABLE FALSIFICATION per property,
// see `proveClosureIsCaught` in check_pool_recall_curve.ts — and the honest
// statement is that this file does not cover it. A guard that claimed to would
// be an instance of its own defect.
//
//   npx tsx scripts/check_guard_subject.ts
//   PROVE=1 npx tsx scripts/check_guard_subject.ts
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

/** Every .ts under a directory. Used for the production source only. */
function walkTs(dir: string): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return []; }
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walkTs(full));
    else if (e.endsWith(".ts")) out.push(full);
  }
  return out;
}

const SCRIPTS = __dirname;

/**
 * A place the request path NARROWS what it is working with.
 *
 * Each entry is a fact about the pipeline with the measured size of the drop,
 * not a naming convention: a guard that reads `wide` and never reads `narrow`
 * is grading a population the founder is not served from, and the `gap` is how
 * wrong that is today. Adding a seam is how this check is taught about a stage
 * somebody inserts later — which is the event that created every instance
 * above, in every case months after the guard was written and correct.
 */
interface Seam {
  /** The upstream value, as it is spelled in source. */
  wide: string;
  /** The production symbol that narrows it before delivery. */
  narrow: string;
  /** What the narrowing removes, and how much of it. */
  gap: string;
}

const SEAMS: Seam[] = [
  {
    wide: "candidateInstrumentIds",
    narrow: "accessiblePool",
    gap: "the eligibility gates. 8 points of recall on the tune split (pool 98 "
      + "against accessible 90, three seeds); 22.5 points on wsGE's holdout draw. "
      + "The single largest loss in the funnel.",
  },
  {
    wide: "corpusProvenance",
    narrow: "publishableInstruments",
    gap: "1,088 hydrated rows against 771 offerable funds. A closure pass moves "
      + "the second and never the first, and the offerable set also moves with "
      + "`today()`, which a row count cannot represent at all.",
  },
  {
    // The MEMBER, not the constant. Comparing against `publishesWindow` is the
    // hand-rolled predicate; reading the constant whole is a vocabulary check.
    wide: "SOURCE_WINDOW_POLICY.publishesWindow",
    narrow: "opennessEvidence",
    gap: "the rows with NO recorded policy. Currently an empty population, so "
      + "the two readings agree today — which is exactly why a guard comparing "
      + "them by hand reads as correct until a feed lands.",
  },
];

/** A guard that reads the wide side and not the narrow side ON PURPOSE, with
 *  the reason and a date by which the reason must be re-examined. Same
 *  arrangement, and the same argument, as `manual` in data/guard_registry.json:
 *  an escape hatch with no clock becomes the orphanage. */
const EXEMPT: Record<string, { seam: string; why: string; review: string }> = {
  // It was first written with `check_recall_floor` in it, on the reasoning that
  // a guard which floors BOTH sides of a seam is a legitimate reader of the
  // wide one. The reasoning is right and the entry was still wrong: a guard
  // that reads the narrow side needs no exemption, so the entry would have
  // stood as pre-authorisation for the day somebody deleted the `accessible`
  // floor and kept the `pool` one — the exact regression that seam exists to
  // catch, blessed in advance by a note nobody re-reads. That is now a FAILURE
  // condition below rather than a comment.
  //
  // The one entry left is a real instance, dated and routed, not a mute button.
  check_archetypes: {
    seam: "candidateInstrumentIds",
    why: "A GENUINE INSTANCE, found by this check on its first run and not fixed "
      + "here. `assessAll(v.candidateInstrumentIds, answers)` grades the candidate "
      + "table, so the twelve archetypes are asserted over rows the eligibility "
      + "gates would have removed. It is not fixed in this change because moving "
      + "it to the accessible pool changes what the archetype suite ASSERTS, which "
      + "is that suite's owner's call — and because check_memo_table.ts already "
      + "exists levelling this same criticism at this same file, so the two "
      + "decisions belong together. Fix both or neither.",
    review: "2026-10-31",
  },
};

/** Lines that are comments carry no behaviour. Stripped for the same reason
 *  `ETL/schema/check_guard_reachability.py` strips them: otherwise the better a
 *  guard EXPLAINS the seam it ignores, the greener this check gets — and every
 *  one of the six instances above has a header describing the subject
 *  faithfully. Prose is the evidence of the defect here, never of its absence. */
function code(text: string): string {
  return text.split("\n")
    .filter((l) => {
      const t = l.trimStart();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

/** Word-boundary match on a symbol, with regex metacharacters escaped so a seam
 *  may name a MEMBER (`X.y`) rather than a whole constant. That precision is
 *  load-bearing: `check_liveness` reads `Object.values(SOURCE_WINDOW_POLICY)` as
 *  a VOCABULARY — asserting the stored values are in the allowed set — which is
 *  a legitimate different use and was a false positive here until the seam
 *  named the member the predicate compares against. A detector for this defect
 *  that cries wolf gets muted, which is the failure mode of everything it
 *  watches. */
const names = (text: string, needle: string) =>
  new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);

/**
 * A guard's source plus ONE hop of the local modules it imports.
 *
 * The same scope, and for the same reason, as `check_scope` in
 * ETL/schema/check_artifact_reachability.py: a guard that reads its subject
 * through a shared helper is reading it, and `check_pool_recall_curve` reaching
 * `publishableInstruments` through `scripts/corpusSubject.ts` is the intended
 * arrangement rather than an evasion of it.
 *
 * ONE hop, deliberately and not two. `scripts/` imports `lib/intelligence/` at
 * depth two from almost anywhere, so a transitive walk would let every guard
 * claim to read everything — which is the shape of "reachable because the
 * bundle contains it", and it would make this check pass by construction.
 */
function scopeOf(file: string, seen = new Set<string>()): string {
  const full = path.join(SCRIPTS, file);
  let text: string;
  try { text = code(readFileSync(full, "utf8")); } catch { return ""; }
  if (seen.size) return text;
  let out = text;
  // Static `from "./x"` AND dynamic `await import("./x")`. Both are how a guard
  // reaches a local helper, and several of these files use the second because a
  // module that touches Postgres must not be imported before the credential
  // contract at the top of the file has run.
  for (const m of text.matchAll(/(?:from|import\()\s*"(\.\/[^"]+)"/g)) {
    const rel = m[1].replace(/^\.\//, "");
    const candidate = rel.endsWith(".ts") ? rel : `${rel}.ts`;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out += "\n" + scopeOf(candidate, seen);
  }
  return out;
}

function main() {
  const problems: string[] = [];
  const guards = readdirSync(SCRIPTS)
    .filter((f) => f.startsWith("check_") && f.endsWith(".ts"));

  // Finding no guards, or no seam ever matched, is the most reassuring result
  // this can print and the least true. Both are failures — the emptiness floor
  // this repo already applies in check_check_reachability and
  // check_artifact_reachability.
  if (guards.length < 20) {
    problems.push(`only ${guards.length} check_* modules found in ${SCRIPTS}. `
      + `This check is looking in the wrong place and would pass trivially.`);
  }

  let observed = 0;
  const report: string[] = [];
  for (const file of guards.sort()) {
    const stem = file.replace(/\.ts$/, "");
    const text = scopeOf(file);
    for (const seam of SEAMS) {
      if (!names(text, seam.wide)) continue;
      observed++;
      const readsNarrow = names(text, seam.narrow);
      const exempt = EXEMPT[stem];
      if (readsNarrow) {
        report.push(`  ${stem}: reads ${seam.wide} AND ${seam.narrow}`);
        // An exemption that outlives what it excused is pre-authorisation for
        // the next instance under the same wording. The same rule
        // check_verdicts.ts applies to an acceptance whose guard has gone green.
        if (exempt && exempt.seam === seam.wide) {
          problems.push(`${stem} is EXEMPTED for the ${seam.wide} seam and reads `
            + `${seam.narrow} anyway, so the exemption covers nothing. Delete it: `
            + `left standing it pre-authorises the day the narrow read is removed.`);
        }
        continue;
      }
      if (exempt && exempt.seam === seam.wide) {
        if (exempt.review < new Date().toISOString().slice(0, 10)) {
          problems.push(`the exemption letting ${stem} read ${seam.wide} without `
            + `${seam.narrow} came due on ${exempt.review}: ${exempt.why}`);
        } else {
          report.push(`  ${stem}: reads ${seam.wide} only — EXEMPT until ${exempt.review}`);
        }
        continue;
      }
      problems.push(
        `${stem} reads ${seam.wide} and never reads ${seam.narrow}.\n` +
        `      The request path narrows one into the other before a founder sees\n` +
        `      anything, so this guard is grading a population nobody is served\n` +
        `      from. What the narrowing removes: ${seam.gap}\n` +
        `      Read the narrow side, or add an entry to EXEMPT with the reason and\n` +
        `      a review date.`);
    }
  }

  // ── IS EACH SEAM STILL REAL? ─────────────────────────────────────────────
  // A seam whose symbols have been renamed silently disarms this check exactly
  // as a renamed symbol disarmed the guards it watches, and it disarms it in
  // the reassuring direction: nothing matches, nothing is flagged, green.
  //
  // Asked of the PRODUCTION source, not of the guards. Asking whether any guard
  // names the symbol would be satisfied by this file's own SEAMS table — a
  // check that proves its subject exists by quoting itself, which is the defect
  // it is named after. `check_window_evidence` stopping its hand-rolled
  // comparison is a SUCCESS, and must not read as a dead seam.
  const production = walkTs(path.join(SCRIPTS, "..", "lib", "intelligence"))
    .map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } })
    .join("\n");
  if (production.length < 100_000) {
    problems.push(`only ${production.length} bytes of lib/intelligence were read; `
      + `every seam below would look dead. This check is looking in the wrong place.`);
  }
  for (const seam of SEAMS) {
    for (const [side, sym] of [["wide", seam.wide], ["narrow", seam.narrow]] as const) {
      // A member seam (`X.y`) is declared by its object in production; the base
      // is what has to still exist there.
      const base = sym.split(".")[0];
      if (!names(production, base)) {
        problems.push(`the ${side} side of a seam, "${sym}", does not appear in `
          + `lib/intelligence at all. Either it was renamed — in which case this `
          + `check has been watching a symbol that no longer exists, and every `
          + `guard reading the real one is unwatched — or the seam is gone and the `
          + `entry should be deleted with the reasoning.`);
      }
    }
  }

  if (process.env.PROVE) {
    // The falsification, RUN rather than described. A guard's PROVE mode that
    // prints a sentence about the guard is the defect this file is about, one
    // level up: a reading (the sentence) that cannot distinguish a check that
    // enforces from one that does not.
    const planted = "const x = candidateInstrumentIds;";
    const caught = names(code(planted), "candidateInstrumentIds")
      && !names(code(planted), "accessiblePool");
    console.log(`  PROVE: a guard body reading only the wide side of a seam is `
      + `${caught ? "DETECTED" : "██ NOT DETECTED — this check is not enforcing ██"}`);
    if (!caught) problems.push("PROVE: the seam test did not fire on a planted wide-only read.");
    const commented = "// const x = candidateInstrumentIds;";
    const ignored = !names(code(commented), "candidateInstrumentIds");
    console.log(`  PROVE: the same read inside a COMMENT is `
      + `${ignored ? "ignored" : "██ counted — prose would satisfy this check ██"}`);
    if (!ignored) problems.push("PROVE: a commented-out read satisfied the seam test.");
  }

  console.log(`check_guard_subject: ${guards.length} guards, ${SEAMS.length} seams, `
    + `${observed} guard/seam pair(s) observed`);
  for (const r of report) console.log(r);

  if (problems.length) {
    console.error(`\ncheck_guard_subject: FAILED — ${problems.length} guard(s) are `
      + `grading something other than what they protect:\n`);
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error("  A guard's reading must separate the states its claim separates.");
    process.exit(1);
  }
  console.log("check_guard_subject: ok — every guard that reads the wide side of a "
    + "seam also reads the narrow side, or says why not.");
}

main();
