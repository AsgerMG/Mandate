/**
 * A SCRATCH SCRIPT IS REACHABLE FROM SOMETHING DURABLE, OR IT IS RETIRED.
 *
 * FREE — reads the tree. No model calls, no DB, no credentials, no network.
 *
 * ── The defect this closes ─────────────────────────────────────────────────
 *
 * `_ws*.ts` is this repo's convention for a workstream's own scratch
 * instrument. It is a good convention: the prefix says "this is not the
 * product", the header says what was measured and why, and a finding can cite
 * it as the reproduction path that makes the finding checkable rather than
 * merely asserted.
 *
 * It never had a RETIREMENT STEP. A workstream opens, writes six of them,
 * merges its conclusion, and the six stay. On 2026-08-13 there were 104 in
 * `scripts/` and 13 more already moved to `scripts/archive/`, and nothing
 * anywhere decided which of the 104 were still load-bearing. The cost is not
 * disk. It is that a reader cannot tell an instrument from a leftover, so the
 * leftovers make the instruments harder to find, and an answer somebody paid
 * for gets re-bought because it could not be found.
 *
 * ── The property ───────────────────────────────────────────────────────────
 *
 *   EVERY `_ws*.ts` IN `scripts/` IS NAMED BY SOMETHING THAT IS NOT ITSELF AN
 *   UNANCHORED SCRATCH SCRIPT, OR IS DECLARED STILL IN FLIGHT WITH A DATE.
 *
 * Stated as a property and not a list, because a list of blessed filenames is
 * the same accumulation one level up. Three ways to satisfy it:
 *
 *   ANCHORED     Some durable file names it — shipped code under `lib/`, a
 *                test, a `check_`/`measure_`/`emit_`, the Makefile, an ETL
 *                module, `contracts/`, or prose under `project-mgmt/`. A
 *                finding that cites it, and a constant in shipped code whose
 *                comment says where its value came from, both count.
 *
 *   REACHED      An anchored scratch script names it. `_wsdq_paths` is named by
 *                no finding and no check, and deleting it breaks three scripts
 *                that import it — so reachability is transitive or this guard
 *                would recommend breaking the build.
 *
 *   IN FLIGHT    The file carries `@ws-active until YYYY-MM-DD` and that date
 *                has not passed. This is the retirement step itself: a
 *                workstream declares its scratch live for as long as it expects
 *                to need it, and the build reds when the claim expires. A
 *                marker with no date, or a passed one, does not count.
 *
 * ── Comments are NOT stripped, and that is the point ───────────────────────
 * Every other guard in this repo strips comments before searching, because an
 * implementation is not an explanation. Here the opposite holds. When
 * `lib/intelligence/caps.ts` says a cap came from `_wsds_probe`, that comment
 * IS the provenance of a shipped constant — the answer to "why this number".
 * Stripping it would make this check recommend deleting the only record of
 * where a live value came from, which is the exact failure it exists to
 * prevent.
 *
 * ── Generous matching, deliberately ────────────────────────────────────────
 * Plain substring, against both file contents and file PATHS. A run record
 * named `number_audit_wsCP_wsca_founder.txt` is a citation of
 * `_wsca_founder.ts` and a word-boundary match would miss it, because `_` is a
 * word character. The question being asked is "does anything name this AT
 * ALL"; a guard that answered a narrower question would start failing on
 * legitimate citations and be turned off.
 *
 * Prove it can fail:
 *   PROVE=1 npx tsx scripts/check_ws_scripts.ts
 * which plants a scratch script no file names and requires it to come back
 * unanchored. If the planted name is reported anchored, THIS CHECK has stopped
 * working and it fails for that instead.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/** The frontend is `website/frontend`; the tree is two levels up. */
const FRONTEND = process.cwd();
const REPO = path.resolve(FRONTEND, "..", "..");
const SCRIPTS = path.join(FRONTEND, "scripts");

/** Scratch lives directly in `scripts/`. `scripts/archive/` is where it goes
 *  when it is retired, so those are not governed — they are the destination. */
const SCRATCH = /^_ws[a-z0-9_]*\.tsx?$/;

/** Where a citation could legitimately live. Extensions rather than a
 *  directory list, so a tree reorganised tomorrow is still searched. */
const TEXT_EXT = /\.(tsx?|jsx?|mjs|cjs|py|ya?ml|toml|sh|json|md|txt|sql|mk)$/;

/** Not ours, or data rather than record. The corpus JSON under `public/` and
 *  `data/` is tens of megabytes of fund text; searching it would let an
 *  accidental substring anchor anything, and no fund's description cites a
 *  script of ours. */
const SKIP_DIR = new Set([
  "node_modules", ".next", ".git", ".claude", "data", "public", "dist",
  "build", "__pycache__", ".venv", "venv", ".pytest_cache",
]);

/** Files with no extension that still carry citations. */
const BARE_FILES = new Set(["Makefile", "makefile"]);

function textFiles(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (SKIP_DIR.has(name)) continue;
    const p = path.join(dir, name);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) out.push(...textFiles(p));
    else if (TEXT_EXT.test(name) || BARE_FILES.has(name)) out.push(p);
  }
  return out;
}

const MARKER = /@ws-active\s+until\s+(\d{4}-\d{2}-\d{2})/;

/** The in-flight declaration, and whether it is still good today. */
function inFlight(file: string): { until: string; live: boolean } | null {
  let head: string;
  try { head = readFileSync(file, "utf8").split("\n").slice(0, 40).join("\n"); }
  catch { return null; }
  const m = MARKER.exec(head);
  if (!m) return null;
  const today = new Date().toISOString().slice(0, 10);
  return { until: m[1], live: m[1] >= today };
}

function main() {
  const scratch = readdirSync(SCRIPTS)
    .filter((n) => SCRATCH.test(n))
    .map((n) => path.join(SCRIPTS, n));

  if (scratch.length < 5) {
    console.error(
      `check_ws_scripts: FAILED — found only ${scratch.length} scratch script(s) in ` +
      `${path.relative(REPO, SCRIPTS)}. The pattern has stopped matching and a green ` +
      `result would mean nothing.`);
    process.exit(1);
  }

  /** name (no extension) -> absolute path. */
  const byName = new Map(scratch.map((p) => [path.basename(p).replace(/\.tsx?$/, ""), p]));
  if (process.env.PROVE) {
    // The planted disaster: a scratch script nothing names, which is the state
    // every leftover is in.
    byName.set("_wszz_planted_by_prove", path.join(SCRIPTS, "_wszz_planted_by_prove.ts"));
  }

  // This guard's own source is excluded. It names no real script — it matches a
  // pattern — and a guard citing the thing it governs is not evidence that
  // anyone uses it. Without this, PROVE's planted name resolves against the
  // string literal that plants it and the proof passes by self-reference.
  const scratchPaths = new Set(byName.values());
  const SELF = path.join(SCRIPTS, "check_ws_scripts.ts");
  const searchable = textFiles(REPO).filter((f) => !scratchPaths.has(f) && f !== SELF);

  // Pass 1 — named by something durable.
  const anchored = new Map<string, string>();
  for (const f of searchable) {
    const hay = `${path.relative(REPO, f)}\n${(() => {
      try { return readFileSync(f, "utf8"); } catch { return ""; }
    })()}`;
    for (const [name] of byName) {
      if (anchored.has(name)) continue;
      if (hay.includes(name)) anchored.set(name, path.relative(REPO, f));
    }
  }

  // Pass 2 — reached transitively from an anchored scratch script. Repeat to a
  // fixpoint: a chain of three scratch scripts is anchored by its head.
  const bodies = new Map<string, string>();
  for (const [name, p] of byName) {
    try { bodies.set(name, readFileSync(p, "utf8")); } catch { bodies.set(name, ""); }
  }
  for (let moved = true; moved;) {
    moved = false;
    for (const [holder] of anchored) {
      const src = bodies.get(holder);
      if (!src) continue;
      for (const [name] of byName) {
        if (name === holder || anchored.has(name)) continue;
        if (src.includes(name)) { anchored.set(name, `${holder} (reached)`); moved = true; }
      }
    }
  }

  // Pass 3 — declared in flight.
  const flying: string[] = [];
  const expired: string[] = [];
  for (const [name, p] of byName) {
    if (anchored.has(name)) continue;
    const m = inFlight(p);
    if (!m) continue;
    if (m.live) { anchored.set(name, `@ws-active until ${m.until}`); flying.push(name); }
    else expired.push(`${name} (@ws-active expired ${m.until})`);
  }

  const orphans = [...byName.keys()].filter((n) => !anchored.has(n)).sort();

  if (process.env.PROVE) {
    const planted = "_wszz_planted_by_prove";
    if (!orphans.includes(planted)) {
      console.error(
        `check_ws_scripts: FAILED its own proof — the planted ${planted} came back ` +
        `anchored by "${anchored.get(planted)}". The search is matching something it ` +
        `should not and a green result would mean nothing.`);
      process.exit(1);
    }
    console.log(
      `check_ws_scripts: PROVE ok — the planted orphan was detected. ` +
      `${orphans.length - 1} real orphan(s) besides it.`);
    process.exit(0);
  }

  if (orphans.length || expired.length) {
    console.error(
      `check_ws_scripts: FAILED — ${orphans.length + expired.length} scratch script(s) in ` +
      `scripts/ that nothing names:\n` +
      [...orphans, ...expired].map((n) => `  ${n}`).join("\n") +
      `\n\nA workstream closed without retiring its scratch. Pick one, per file:\n` +
      `  - CITE it, if it is the reproduction path for a finding — add the name to the\n` +
      `    finding, or to the comment on the shipped constant it produced. That is what\n` +
      `    makes the finding checkable rather than asserted.\n` +
      `  - MOVE it to scripts/archive/ with a line in scripts/archive/README.md saying\n` +
      `    what it proved, if it is the only record of a PAID run or of a negative\n` +
      `    result. Deleting one of those invites someone to re-buy the answer.\n` +
      `  - DELETE it, if its answer is in a commit message or a check_ and reproducing\n` +
      `    it is free and takes minutes.\n` +
      `  - Or declare it still in flight: add "@ws-active until YYYY-MM-DD" in the first\n` +
      `    40 lines. The build reds again when that date passes.`);
    process.exit(1);
  }

  const direct = [...anchored.values()].filter((v) => !v.endsWith("(reached)") && !v.startsWith("@ws-active")).length;
  console.log(
    `check_ws_scripts: ok — ${byName.size} scratch script(s), every one reachable from ` +
    `something durable (${direct} named directly, ` +
    `${anchored.size - direct - flying.length} reached through an import, ` +
    `${flying.length} declared in flight).`);
}

main();
