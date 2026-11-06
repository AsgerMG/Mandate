/**
 * Does every span a PUBLISHED eligibility text puts in quote marks actually
 * appear in the document it names?
 *
 * FREE — no model calls, no database. Runs `project-mgmt/probe_verify_extracted.py`,
 * which is where the property is implemented; this file is the CLI that puts it
 * in `npm run check` and decides when it may be skipped.
 *
 * ── Why the probe's own first version was not enough ──────────────────────
 * It checked the `quotes` array — what an extractor claims to have READ. The
 * column a founder sees is `eligibility_text`, and an editing pass can corrupt
 * a quotation inside it while every entry in `quotes` stays perfect. Holding
 * the published text to the same bar caught six defects in rows that were
 * already live, including one where a paraphrase of an award criterion had been
 * wrapped in quote marks and one where a term of art was scare-quoted out of a
 * document that does not contain it. None changed a conclusion; all six made
 * the column assert that a source said something it did not.
 *
 * ── Which files, decided by a property ────────────────────────────────────
 * Any committed JSON under `project-mgmt/findings/` that is an ARRAY of objects
 * carrying an `eligibility_text` is an extraction record and is checked. Not a
 * list of filenames: a list protects the records that existed when it was
 * written, and the next workstream's record — the one nobody has reviewed — is
 * exactly the one that needs checking.
 *
 * ── When it may skip, and when it may not ─────────────────────────────────
 * The records are committed; the SOURCE DOCUMENTS live under `data/raw/`, which
 * is gitignored, and no CI step may read gitignored data. So this skips when
 * that directory is absent, and only then — the same contract as
 * check_corpus_currency.ts with DATABASE_URL. With no documents there is no
 * claim to test. With documents present it never passes quietly on a comparison
 * it could have made, and a missing `pdftotext` is a FAILURE rather than a
 * skip, because that is a broken checker rather than an absent input.
 *
 * Run: npx tsx scripts/check_extracted_quotes.ts
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(process.cwd(), "../capital");
const FINDINGS = join(REPO, "project-mgmt", "findings");
const PROBE = join(REPO, "project-mgmt", "probe_verify_extracted.py");
const DOCS = join(REPO, "data", "raw", "instrument_docs");

type Record = { eligibility_text?: unknown; source_file?: unknown };

/** The rows in a file that draft published eligibility text. Read rather than
 *  named, so the next workstream's record — the one nobody has reviewed — is
 *  picked up without anyone remembering to add it. */
function draftedRows(file: string): Record[] {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && typeof r === "object" && "eligibility_text" in r);
  } catch {
    return [];
  }
}

/** A row is MECHANICALLY verifiable when it names the document it read. Rows
 *  drafted from a live web page name a URL instead: their provenance is real
 *  and weaker, and this probe cannot speak to them. They are counted and named
 *  rather than silently dropped, because "nothing failed" and "nothing was
 *  checked" must not print the same. */
const verifiable = (r: Record) => typeof r.source_file === "string" && r.source_file.length > 0;

function main() {
  if (!existsSync(DOCS)) {
    console.log("check_extracted_quotes: skipped — data/raw/instrument_docs is " +
      "absent, so there is nothing to verify a quotation against. This is the " +
      "normal state in CI; the check is real on any machine that holds the corpus.");
    return;
  }
  if (!existsSync(PROBE)) {
    console.error(`check_extracted_quotes: FAILED — ${PROBE} is missing.`);
    process.exit(1);
  }

  let candidates: string[] = [];
  // findings/ and, since 2026-11-06, the archived workstream outputs that
  // left it under the same names (project-mgmt/archive/findings/).
  for (const dir of [FINDINGS, join(REPO, "project-mgmt", "archive", "findings")]) {
    try {
      candidates.push(...readdirSync(dir).filter((f) => f.endsWith(".json"))
        .map((f) => join(dir, f)));
    } catch { /* no such directory */ }
  }
  candidates.sort();

  const files: string[] = [];
  const unverifiable: string[] = [];
  for (const f of candidates) {
    const rows = draftedRows(f);
    if (!rows.length) continue;
    if (rows.some(verifiable)) files.push(f);
    const n = rows.filter((r) => !verifiable(r)).length;
    if (n) unverifiable.push(`${f.split("/").pop()} (${n} of ${rows.length})`);
  }

  if (unverifiable.length) {
    console.log("  drafted from a live page rather than a document on disk, so " +
      "no quotation in them is mechanically checkable here:");
    for (const u of unverifiable) console.log(`    ${u}`);
  }

  if (!files.length) {
    console.log("check_extracted_quotes: no document-backed extraction records " +
      "under project-mgmt/findings/ — nothing this probe can verify.");
    return;
  }

  const res = spawnSync("python3", [PROBE, ...files], { encoding: "utf8" });
  if (res.error) {
    console.error("check_extracted_quotes: FAILED to run the probe —", res.error.message);
    process.exit(1);
  }
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  if (res.status !== 0) {
    console.error(out.trimEnd());
    console.error(
      `\ncheck_extracted_quotes: FAILED across ${files.length} extraction record(s).\n` +
      `  A published eligibility text is quoting something its source does not say,\n` +
      `  or a record repeats a sibling. Fix the TEXT, never the checker: the point\n` +
      `  of the quote marks is that the document can be held to them.`);
    process.exit(1);
  }
  const tail = out.trim().split("\n").pop() ?? "";
  console.log(`check_extracted_quotes: ok — ${files.length} extraction record(s), ${tail}`);
}

main();
