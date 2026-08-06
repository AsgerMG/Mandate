/**
 * Is "is this fund still open" still decided in exactly one place?
 *
 * FREE — reads source files and the committed projection. No model calls, no DB.
 *
 * ── The structural fault this exists to stop ──────────────────────────────
 * On 2026-08-06 a coverage pass populated `scheme_end_date` widely and 306 of
 * 948 leaves went dark, pool recall 97% -> 81%, because a SATR NOTIFICATION
 * expiry was read as a scheme closure. `Fondo di garanzia per le PMI` — Italy's
 * flagship SME guarantee fund, 13,892 awards — was hidden from founders.
 *
 * The date was not the fault. The fault was that the question had five answers:
 * publishableInstruments(), live_ids() in ETL/terms/load_scheme_text.py,
 * publishable() in scripts/measure_country_class.ts, and hand-written SQL in
 * emit_peer_prior.py and extend_recall_set.py — each under a "mirrors
 * publishableInstruments()" comment. The SAME confusion had shipped hours
 * earlier from a different one of those places. A rule with five homes will be
 * fixed in one of them.
 *
 * So this check enforces two things a reviewer cannot:
 *   1. the ETL's projection of the rule is not stale, and
 *   2. nobody has quietly written a SIXTH copy by comparing scheme_end_date to
 *      today by hand.
 *
 * Run: npx tsx scripts/check_liveness.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

interface Problem { axis: string; detail: string; }

/** Files entitled to compare an end date to a clock: the definition itself, its
 *  emitter, and this check. Everything else must call isClosed()/closed_sql(). */
const OWNERS = new Set([
  "lib/intelligence/liveness.ts",
  "lib/intelligence/liveness.test.ts",
  "scripts/emit_liveness.ts",
  "scripts/check_liveness.ts",
]);

/** A hand-rolled liveness comparison. Deliberately a PROPERTY — "an end date
 *  compared against a clock" — and not a list of the five known copies, because
 *  a list cannot catch the sixth. */
const HAND_ROLLED = [
  /scheme_?[eE]nd_?[dD]ate\s*(?:\?\?[^)]*)?<\s*(?:today|current_date|new Date|date\(|_today|now)/,
  /scheme_end_date\s*::\s*date\s*<\s*current_date/,
  /scheme_end_date\s*<\s*date\('now'\)/,
];

/** Comments are where this rule gets EXPLAINED, and an explanation quoting the
 *  old broken comparison is not a second implementation of it. Strip them, or
 *  the check fires on the very notes that document why it exists. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments
    .replace(/^[ \t]*\/\/.*$/gm, "")    // whole-line // comments
    .replace(/^[ \t]*#.*$/gm, "")       // whole-line Python comments
    .replace(/"""[\s\S]*?"""/g, "");    // docstrings
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === "scratch" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|py)$/.test(p)) out.push(p);
  }
  return out;
}

async function main() {
  const problems: Problem[] = [];

  // ── The ETL's copy must BE this copy ────────────────────────────────────
  const { build, OUT } = await import("./emit_liveness");
  const expected = build();
  let onDisk = "";
  try { onDisk = readFileSync(OUT, "utf8"); } catch { /* missing */ }
  if (onDisk !== expected) {
    problems.push({
      axis: "etl projection",
      detail: onDisk
        ? "data/liveness.json is STALE — the ETL is judging liveness by an older " +
          "rule than the product, so the funds it withholds are not the funds " +
          "the product hides. Run: npx tsx scripts/emit_liveness.ts"
        : "data/liveness.json is missing — ETL/lib/liveness.py cannot start. " +
          "Run: npx tsx scripts/emit_liveness.ts",
    });
  }

  // ── No sixth copy ───────────────────────────────────────────────────────
  const roots = [
    resolve(process.cwd(), "lib"),
    resolve(process.cwd(), "scripts"),
    resolve(process.cwd(), "app"),
    resolve(process.cwd(), "../../ETL"),
  ];
  for (const root of roots) {
    let files: string[] = [];
    try { files = walk(root); } catch { continue; }
    for (const f of files) {
      const rel = relative(process.cwd(), f).replace(/^\.\.\/\.\.\//, "");
      if (OWNERS.has(relative(process.cwd(), f))) continue;
      const src = code(readFileSync(f, "utf8"));
      for (const re of HAND_ROLLED) {
        if (re.test(src)) {
          problems.push({
            axis: "duplicate rule",
            detail: `${rel} compares scheme_end_date to a clock directly. That is a ` +
              `SECOND liveness rule: it cannot see the notified-duration/call-deadline ` +
              `distinction and will hide live schemes. Call isClosed() from ` +
              `lib/intelligence/liveness.ts, or closed_sql() from ETL/lib/liveness.py.`,
          });
          break;
        }
      }
    }
  }

  for (const p of problems) console.log(`  - [${p.axis}] ${p.detail}`);
  console.log(
    problems.length
      ? `\n${problems.length} liveness problems — "is this fund open" has more than one answer again`
      : "liveness: one definition, one projection, no hand-rolled copies",
  );
  process.exitCode = problems.length ? 1 : 0;
}

main();
