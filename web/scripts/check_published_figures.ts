// No figure the owner plans from may be a number nobody can re-derive.
//
// ── Why this file exists ───────────────────────────────────────────────────
// Three headline figures were retracted in one day (85.5%, 62.0%, 8.4%), and
// two of them had been reported to the owner TWICE before anyone caught them.
// Every one of the three was traceable to the same shape: a number was written
// into a planning document, the run that produced it was not kept beside it,
// and the next reader had nothing to check it against except the sentence
// asserting it. A findings document is not evidence for its own headline.
//
// The audit that followed (wsCP) found the shape a fourth and fifth time on
// numbers nobody had questioned:
//
//   * `gap_autopsy_wsCI_holdout.txt` published buckets 3.7 / 7.4 / 41.5 / 47.3
//     from a run that PREDATES `rankerTallyLine` (commit fd27cec0, 17:15 that
//     day). Re-run on the same command, seed and corpus with the attestation
//     on screen: 1.6 / 7.4 / 44.2 / 46.8. Three of the four were wrong and
//     nothing on the page could have said so.
//   * `rich_intake_wsCC.md` published 65.9% / 58.3% / 77.6% with NO captured
//     output of any kind — `ls project-mgmt/findings/ | grep -i wscc` returns
//     one markdown file and no artifact.
//
// ── The property ───────────────────────────────────────────────────────────
// Every percentage in `project-mgmt/RESUME_HERE.md` — the document the owner
// plans from, and the one every retraction so far reached him through — must
// carry a PROVENANCE TAG in its own table cell or sentence:
//
//   [ok <artifact>]        verified: the named file under project-mgmt/findings/
//                          exists, contains this figure literally, and — if it
//                          reports a recall metric — attests the ranker.
//   [retracted]            withdrawn; kept for the history.
//   [target]               a goal somebody set, not a measurement.
//   [unverifiable: why]    cannot be recomputed, and the reason is at the number.
//
// This is a PROPERTY, not a register. There is no list of known figures here
// and no allowlist. A number ADDED to the document tomorrow fails until
// somebody says where it came from, which is the only direction that helps:
// the cost of the last three retractions was paid entirely by numbers that
// arrived without provenance and were quoted onward as if they had it.
//
// ── The attestation clause, and why it is conditional ──────────────────────
// `semanticFundMatch` has a 3s connect and a 3s statement timeout and returns
// an empty map on failure, at which point every `rankerUsed` call site drops to
// the lexical index. So a loaded machine can rank part of a run on embeddings
// and part on lexical, average the two and print one number. That is what made
// `check_recall_floor` return 87% and then 96% on identical inputs.
//
// `rankerTallyLine()` exists to say so. This check therefore requires the
// attestation ONLY of an artifact that reports a recall metric — an artifact
// measuring corpus combinatorics never asks a ranker anything and printing
// "nothing ranked" beside it would be noise. And ANY artifact containing
// `FELL BACK TO LEXICAL` fails outright, whatever it measures.
//
// ── What it reads ──────────────────────────────────────────────────────────
// Two committed trees: `project-mgmt/RESUME_HERE.md` and
// `project-mgmt/findings/`. No credentials, no network, no database, nothing
// gitignored. It runs anywhere, in seconds, and cannot pass by having nothing
// to read — six non-vacuity assertions below fail it if the document went
// missing, shrank, lost its figures, or lost every verified tag.
//
// ── It proves itself on every run ──────────────────────────────────────────
// `selfTest()` runs the detector over synthetic documents and artifacts, one
// per failure mode, and fails the check BEFORE it judges the real document if
// any of them come out wrong. A guard whose own detector is broken is worse
// than no guard, because it is green.
//
//   npx tsx scripts/check_published_figures.ts
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** The document this check watches, named literally so the tie between the
 *  guard and the file it guards is visible from the source. */
const WATCHES = "project-mgmt/RESUME_HERE.md";

/** Where a `[ok ...]` tag may point. A tag that could name any path on disk
 *  would let a figure be "verified" against an uncommitted scratch file. */
const ARTIFACT_DIR = "project-mgmt/findings";

/** Non-vacuity. Each is a state in which this check would pass while seeing
 *  nothing, and each has a real cause: a moved file, a truncated document, a
 *  regex that stopped matching. */
const MIN_UNITS_WITH_FIGURES = 8;
const MIN_FIGURES = 15;
const MIN_VERIFIED = 3;
const MIN_DOC_BYTES = 2000;

/** A REPLAY, by the banner every harness that calls `computeVerdict` prints.
 *
 *  The trigger is deliberately the replay and not the metric NAME. An earlier
 *  version keyed on `EXACT@5`, which appears in `_wscc_exact_bound.ts` output —
 *  a pure corpus-combinatorics bound that never asks a ranker anything and
 *  could not have attested one. A guard that demands an impossible line is a
 *  guard people route around. Where a ranker is USED, a replay banner is
 *  printed; that is the honest condition. */
const REPLAY = /\b(replayed \d+|\d+ tune pairs|\d+ holdout pairs)\b/;
const CLEAN_RANKER = /ranker: all \d+ request\(s\) on EMBEDDING/;
const DIRTY_RANKER = /FELL BACK TO LEXICAL/;

/** A percentage as a document writes one: `25%`, `65.9%`, `+11.7`-style deltas
 *  are deliberately NOT matched — a delta is not a figure you can look up in an
 *  artifact, and requiring provenance for one would push writers to drop the
 *  sign rather than to cite. Percentages are what gets planned on. */
const FIGURE = /(?<![\w.])\d{1,3}(?:\.\d+)?%/g;

/** `[ok <artifact>]`, where the artifact is named by its path UNDER
 *  project-mgmt/findings/ — `rank_shape_wsGY.md`, or
 *  `sibling_embedding_wsHH/README.md`.
 *
 *  The slash is not cosmetic. This check read only the flat files directly in
 *  findings/, and the repo has since moved to a directory per workstream: on
 *  2026-08-18, 315 of the 534 artifacts under findings/ — 59% — were nested and
 *  therefore unnameable. A figure whose evidence exists and cannot be cited
 *  fails this check with no fix available but to write `[unverifiable]` over a
 *  file somebody produced, which is how a guard teaches people to lie to it.
 *  The property is unchanged and no floor moved: the artifact must exist, and
 *  must contain the figure. */
const TAG_OK = /\[ok\s+([A-Za-z0-9_.\-\/]+)\]/;
const TAG_RETRACTED = /\[retracted\]/;
const TAG_TARGET = /\[target\]/;
const TAG_UNVERIFIABLE = /\[unverifiable:\s*\S[^\]]*\]/;

export interface Unit { line: number; text: string; figures: string[] }
export interface Failure { line: number; unit: string; why: string }

/** Split a document into the smallest span a tag can sensibly sit in.
 *
 *  A table ROW is too coarse: a retraction row and a live row can share one,
 *  and `[retracted]` in the fourth cell would clear a figure in the second.
 *  So a table line splits on `|` and a prose line splits on sentence ends.
 *  Bullets split too — a bullet is a sentence with a dash in front of it. */
export function unitsOf(doc: string): Unit[] {
  const out: Unit[] = [];
  const emit = (line: number, text: string, splitOn: RegExp) => {
    for (const p of text.split(splitOn)) {
      const figures = p.match(FIGURE) ?? [];
      if (figures.length) out.push({ line, text: p.trim(), figures });
    }
  };
  // A markdown paragraph is hard-wrapped, so a sentence and the tag that
  // belongs to it routinely sit on different lines. Joining the paragraph
  // before splitting into sentences is the difference between a guard people
  // can satisfy and one that demands a tag on every physical line.
  //
  // Sentence ends are `.!?` only — NOT `:` or `;`. A colon is how a tag
  // introduces its own reason (`[unverifiable: no artifact exists]`), and
  // splitting there tore the tag off the figure it belonged to.
  const SENTENCE = /(?<=[.!?])\s+/;
  const CELL = /\|/;
  const NEW_BLOCK = /^\s*(?:[-*>]|\d+\.|#{1,6}\s)/;

  let buf: string[] = [];
  let bufLine = 0;
  const flush = () => {
    if (buf.length) emit(bufLine, buf.join(" "), SENTENCE);
    buf = [];
  };
  doc.split("\n").forEach((raw, i) => {
    const line = i + 1;
    if (raw.includes("|")) { flush(); emit(line, raw, CELL); return; }
    if (!raw.trim()) { flush(); return; }
    if (NEW_BLOCK.test(raw)) flush();
    if (!buf.length) bufLine = line;
    buf.push(raw.trim());
  });
  flush();
  return out;
}

/** Judge one unit against one artifact tree. Pure, so `selfTest` can drive it
 *  with synthetic inputs rather than with the real repository. */
export function judge(u: Unit, artifacts: Map<string, string>): Failure | null {
  const bad = (why: string): Failure => ({ line: u.line, unit: u.text, why });

  const tags = [TAG_OK, TAG_RETRACTED, TAG_TARGET, TAG_UNVERIFIABLE]
    .filter((re) => re.test(u.text)).length;
  if (tags === 0) {
    return bad(`figure ${u.figures.join(", ")} carries no provenance tag. `
      + `Add [ok <artifact>], [retracted], [target] or [unverifiable: reason] `
      + `in this cell or sentence.`);
  }
  if (tags > 1) return bad("more than one provenance tag; one figure, one story.");

  const m = u.text.match(TAG_OK);
  if (!m) return null;

  const name = m[1];
  const body = artifacts.get(name);
  if (body === undefined) {
    return bad(`[ok ${name}] names no file in ${ARTIFACT_DIR}/. `
      + `A figure verified against a file nobody else has is not verified.`);
  }
  for (const f of u.figures) {
    if (!body.includes(f)) {
      return bad(`[ok ${name}] does not contain ${f}. `
        + `The published figure and its recomputation disagree.`);
    }
  }
  if (DIRTY_RANKER.test(body)) {
    return bad(`[ok ${name}] averaged two ranking systems `
      + `("FELL BACK TO LEXICAL"); the number is not comparable with a clean one.`);
  }
  if (REPLAY.test(body) && !CLEAN_RANKER.test(body)) {
    return bad(`[ok ${name}] replays the pipeline without a ranker `
      + `attestation. A run that cannot say which ranker served it may be an `
      + `average of two. Re-run it on a quiet machine and keep the banner.`);
  }
  return null;
}

/** Every artifact under findings/, keyed by its path relative to that
 *  directory. Walked rather than listed: see TAG_OK for what a flat listing
 *  cost. */
function loadArtifacts(root: string): Map<string, string> {
  const dir = path.join(root, ARTIFACT_DIR);
  const out = new Map<string, string>();
  if (!existsSync(dir)) return out;
  const walk = (abs: string, rel: string): void => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const key = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(path.join(abs, e.name), key); continue; }
      if (!/\.(txt|md|json)$/.test(e.name)) continue;
      out.set(key, readFileSync(path.join(abs, e.name), "utf8"));
    }
  };
  walk(dir, "");
  // The workstream run outputs were archived on 2026-11-06 under the same
  // names (project-mgmt/findings/README.md); a tag naming one still resolves.
  const archived = path.join(root, "project-mgmt", "archive", "findings");
  if (existsSync(archived)) walk(archived, "");
  return out;
}

/** Prove the detector can fail, on every clause, before it is trusted to say
 *  anything is fine. Each case is a real incident in miniature. */
function selfTest(): void {
  const tmp = mkdtempSync(path.join(tmpdir(), "cpf-"));
  try {
    const arts = new Map<string, string>([
      // A clean recall artifact, the shape check_recall_floor prints.
      ["good_floor.txt", "ranker: all 297 request(s) on EMBEDDING\n"
        + "  ok   pool     94% (floor 89%)\n  ok   exact5   25% (floor 15%)\n"],
      // The wsCI incident: a replay from before the attestation existed.
      ["unattested.txt", "split=holdout replayed 250\nEXACT@5 62/250 (24.8% +/-5.4)\n"],
      // A run that averaged two rankers.
      ["dirty.txt", "replayed 250\nranker: 200/247 on EMBEDDING, 47 FELL BACK TO LEXICAL\n"
        + "EXACT@5 60/250 (24.0%)\n"],
      // Corpus combinatorics: nothing was replayed, so no ranker was asked and
      // none can be attested. It still prints the words EXACT@5, which is why
      // the trigger is the replay banner and not the metric name.
      ["ceiling.txt", "EXACT@5 CEILING 65.0%   over 605 leaves in 36 regimes\n"],
    ]);
    const one = (text: string) => judge(unitsOf(text)[0], arts);

    const cases: [string, string, boolean][] = [
      ["untagged figure fails", "shipped EXACT@5 is 25% today", true],
      ["tagged + matching artifact passes", "EXACT@5 25% [ok good_floor.txt]", false],
      ["figure absent from artifact fails", "EXACT@5 31% [ok good_floor.txt]", true],
      ["missing artifact fails", "EXACT@5 25% [ok nope.txt]", true],
      ["unattested replay fails", "buckets at 24.8% [ok unattested.txt]", true],
      ["lexical-averaged replay fails", "EXACT@5 24.0% [ok dirty.txt]", true],
      ["a run that never replayed needs no ranker", "ceiling 65.0% [ok ceiling.txt]", false],
      ["retracted passes", "the 85.5% ceiling [retracted]", false],
      ["target passes", "we are aiming at 95% [target]", false],
      ["unverifiable needs a reason", "58.3% [unverifiable:]", true],
      ["unverifiable with a reason passes", "58.3% [unverifiable: no artifact]", false],
      ["two tags fail", "25% [target] [retracted]", true],
    ];
    for (const [label, text, shouldFail] of cases) {
      const got = one(text) !== null;
      if (got !== shouldFail) {
        console.error(`check_published_figures SELF-TEST FAILED: ${label} — `
          + `expected ${shouldFail ? "a failure" : "a pass"}, got the opposite.`);
        process.exit(1);
      }
    }

    // A table row where a retraction cell must not clear a live cell.
    const row = "| wsCA | 43.1% [retracted] | wsCC | 65.9% |";
    const units = unitsOf(row);
    const failures = units.map((u) => judge(u, arts)).filter(Boolean);
    if (failures.length !== 1) {
      console.error("check_published_figures SELF-TEST FAILED: a tag in one "
        + "table cell cleared a figure in another. Splitting is broken.");
      process.exit(1);
    }

    // The extractor must see figures at all.
    writeFileSync(path.join(tmp, "x.md"), "nothing here");
    if (unitsOf(readFileSync(path.join(tmp, "x.md"), "utf8")).length !== 0) {
      console.error("check_published_figures SELF-TEST FAILED: found a figure "
        + "in a document with none.");
      process.exit(1);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main(): void {
  selfTest();

  // Repo root from this file, not from cwd: a check that passes because it was
  // invoked from the wrong directory is not a check.
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "capital");
  const docPath = path.join(root, WATCHES);
  if (!existsSync(docPath)) {
    console.error(`check_published_figures: ${WATCHES} is missing. `
      + "This check exists to watch it; it does not pass by its absence.");
    process.exit(1);
  }
  const doc = readFileSync(docPath, "utf8");
  if (doc.length < MIN_DOC_BYTES) {
    console.error(`check_published_figures: ${WATCHES} is ${doc.length} bytes, `
      + `under ${MIN_DOC_BYTES}. Too small to be the document this watches.`);
    process.exit(1);
  }

  const artifacts = loadArtifacts(root);
  const units = unitsOf(doc);
  const figures = units.reduce((n, u) => n + u.figures.length, 0);
  const verified = units.filter((u) => TAG_OK.test(u.text)).length;

  if (units.length < MIN_UNITS_WITH_FIGURES || figures < MIN_FIGURES) {
    console.error(`check_published_figures: found ${figures} figure(s) in `
      + `${units.length} unit(s) — under the floor of ${MIN_FIGURES}/`
      + `${MIN_UNITS_WITH_FIGURES}. The extractor has stopped seeing the `
      + "document, which is how the last version of a check like this went "
      + "green over a page it could not read.");
    process.exit(1);
  }
  if (verified < MIN_VERIFIED) {
    console.error(`check_published_figures: only ${verified} figure(s) carry `
      + `[ok <artifact>], under the floor of ${MIN_VERIFIED}. A document where `
      + "everything is retracted or unverifiable is not a plan.");
    process.exit(1);
  }

  const failures = units.map((u) => judge(u, artifacts)).filter(Boolean) as Failure[];

  console.log(`check_published_figures: ${WATCHES} — ${figures} figure(s) in `
    + `${units.length} unit(s); ${verified} verified against `
    + `${artifacts.size} committed artifact(s).`);

  if (failures.length) {
    console.error(`\n  FAIL — ${failures.length} figure(s) without usable provenance:\n`);
    for (const f of failures) {
      console.error(`  ${WATCHES}:${f.line}`);
      console.error(`    ${f.unit.slice(0, 140)}`);
      console.error(`    ${f.why}\n`);
    }
    process.exit(1);
  }
  console.log("  PASS — every published figure names where it came from, and "
    + "every recall artifact says which ranker produced it.");
}

main();
