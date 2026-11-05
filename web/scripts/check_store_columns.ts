/**
 * The two stores must not drift apart column by column.
 *
 * HERMETIC: reads two source files. No DATABASE_URL, no VOYAGE_KEY, no
 * network, so it runs on CI and on a fresh worktree.
 *
 * ── The failure it exists for ──────────────────────────────────────────────
 * `corpus.ts` hydrates from Postgres and falls back to
 * `public/data/instrument_terms.json` on any failure — the fallback is the
 * whole memo path, not a diagnostic. The JSON is written by
 * `website/build/eligibility_export.py`, in another language, against another
 * database. So a column added to one SELECT and not the other produces a
 * corpus that is one thing when the register answers and another thing when it
 * does not, and the difference shows up as a row that reads differently for
 * reasons no one can see.
 *
 * That is not hypothetical here. `check_hydration_parity` already compares the
 * two stores, and it is the stronger check — but it compares PUBLISHED ROWS
 * and RANKING, so a field that no ranker reads and every prompt does (the
 * scheme's own description of what it funds is exactly such a field) passes it
 * while diverging. It also needs credentials, so it cannot run in a pull
 * request. This one is cheap, it is static, and it runs everywhere.
 *
 * ── The property, not a list of columns ────────────────────────────────────
 * EVERY column the request path selects from Postgres must also be produced by
 * the export. The converse is deliberately NOT required: the export may carry
 * more (nothing breaks when the fallback knows something the live path does
 * not use), and requiring equality would make removing a field from the
 * request path — which is how `sample_project_titles` was taken out of reach —
 * into a build failure.
 *
 * Read off the two SELECT statements themselves rather than from a declared
 * list, because a declared list is a third place to keep in step and this repo
 * has been bitten three times by exactly that.
 *
 * Run: npx tsx scripts/check_store_columns.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const CORPUS = path.join("lib", "intelligence", "corpus.ts");
const EXPORT = path.join("..", "build", "eligibility_export.py");

/** The column list of the one SELECT ... FROM funding_instruments in a file.
 *
 *  Deliberately strict about what it will accept: an expression, an alias or a
 *  join makes the naive split wrong, and a parser that silently returns a
 *  wrong set is worse than one that stops. If this throws, the SELECT has
 *  grown a shape the check cannot read, and the check must be taught it. */
function instrumentColumns(file: string): Set<string> {
  const src = readFileSync(file, "utf8");
  const m = /SELECT\s+([\s\S]*?)\s+FROM\s+funding_instruments/i.exec(src);
  if (!m) throw new Error(`${file}: no SELECT ... FROM funding_instruments`);
  const body = m[1]
    // SQL comments inside the list, which both files use heavily.
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cols = new Set<string>();
  for (const raw of body.split(",")) {
    const c = raw.trim();
    if (!c) continue;
    if (!/^[a-z_][a-z0-9_]*$/i.test(c)) {
      throw new Error(
        `${file}: cannot read "${c}" as a plain column.\n` +
        `  This check compares two SELECT lists literally. An expression, an\n` +
        `  alias or a join means the comparison would be quietly wrong, which\n` +
        `  is the failure it exists to prevent — so teach it the new shape\n` +
        `  rather than loosening the pattern.`);
    }
    cols.add(c.toLowerCase());
  }
  return cols;
}

function main() {
  const live = instrumentColumns(CORPUS);
  const fallback = instrumentColumns(EXPORT);
  const missing = [...live].filter((c) => !fallback.has(c)).sort();

  if (missing.length) {
    console.error(
      `check_store_columns: FAIL — ${missing.length} column(s) reach the request ` +
      `path from Postgres and are absent from the fallback export:\n` +
      `  ${missing.join(", ")}\n\n` +
      `  A degraded request would build its corpus without them, so the same\n` +
      `  founder gets a different row depending on whether the register\n` +
      `  happened to answer. Add them to the SELECT and to the record in\n` +
      `  ${EXPORT}, then re-run it so the committed snapshot carries them.`);
    process.exit(1);
  }

  const extra = [...fallback].filter((c) => !live.has(c)).sort();
  console.log(
    `check_store_columns: ok — all ${live.size} column(s) the request path ` +
    `selects are exported to the fallback` +
    (extra.length
      ? `; the export additionally carries ${extra.length} the request path ` +
        `does not read (${extra.join(", ")}), which is allowed`
      : ""));
}

main();
