// Credentials are loaded in ONE place, and a harness that needs them SAYS SO.
//
// ── The bug this exists for ────────────────────────────────────────────────
// Forty-one files each opened `.env.local` with their own pasted copy of the
// same eight lines. Seven copies had learned that DATABASE_URL is documented to
// live at the REPO ROOT; thirty-four still read only `./.env.local`, which is
// gitignored and therefore absent from every worktree and every fresh clone.
// Those thirty-four found no file, swallowed the error, and continued on
// whatever the ambient shell held — usually nothing.
//
// That is not a cosmetic difference. Retrieval ranks on pgvector when
// DATABASE_URL and VOYAGE_KEY are present and on a lexical fallback when they
// are not, so a harness with no credentials measures A DIFFERENT SYSTEM from
// the one that ships and prints a number that looks exactly like a real one.
// In the worst case found, `check_recall_floor` printed SKIPPED and exited 0:
// `npm run check` went green with the recall floors never evaluated at all.
//
// ── Why a check, and not just the fix ──────────────────────────────────────
// The fix is one shared module. Nothing stops the forty-second script from
// pasting the block back in next month, and the first thirty-four were written
// by people who had no way to know the other spelling existed. A "keep in sync"
// comment IS the bug in this repo; forty-one copies is that bug at scale, and
// the only durable answer is that the build refuses the forty-second.
//
// ── Stated as properties, not as a list of filenames ───────────────────────
// A filename register would pass the day someone adds `harness_2.ts`. So:
//
//   P1  ONE MODULE NAMES ENV FILES.
//       No code outside scripts/loadEnv.ts may name a `.env*` file, in any
//       spelling — a relative path, an absolute path, a `new URL(...)` against
//       import.meta, or tsx's `--env-file`. All four were in the repo.
//       Comments are stripped first: prose about the defect is not the defect.
//
//   P2  NO SCRIPT READS A CREDENTIAL IT NEVER ASKED FOR.
//       A script under scripts/ that reads a credential env var must either
//       declare it through requireCredentials(), or deliberately destroy it
//       (`delete process.env.DATABASE_URL` — how the hermetic snapshot checks
//       pin themselves offline). Reading one it never declared is the silent
//       path: it works on the author's laptop and measures the fallback
//       everywhere else. `lib/` is exempt — the request path is SUPPOSED to
//       degrade rather than fail a founder mid-brief, which is the trade
//       requireLiveCorpus() documents.
//
//   P3  THE CONTRACT COVERS EVERY CREDENTIAL THE SCRIPT NAMES.
//       Declaring DATABASE_URL while also reading VOYAGE_KEY is a half-
//       contract: the run passes the gate and still ranks lexically.
//
//   P4  A SCRIPT THAT CAN REACH THE SEMANTIC INDEX MUST DECLARE VOYAGE_KEY.
//       P3 only sees credentials a script names itself, and the expensive one
//       is named nowhere: retrieval reads VOYAGE_KEY inside
//       lib/intelligence/semantic.ts. With DATABASE_URL and no VOYAGE_KEY,
//       embedQuery returns null, semanticFundMatch returns an empty map, and
//       every caller falls through to the LEXICAL index — a different ranker,
//       silently, with the corpus guard satisfied because Postgres answered
//       fine. So the set of modules that can reach semantic.ts is DERIVED from
//       the import graph, not listed: a new module that reaches it is covered
//       the day it is written.
//
//       Reachability is per MODULE, so this over-approximates: importing a
//       pure scorer from shortlist.ts trips it even though that call never
//       embeds anything. That is the safe direction and it costs nothing —
//       VOYAGE_KEY and DATABASE_URL live in the same file and travel together
//       — whereas under-declaring is the defect itself, measured silently.
//
// FREE and hermetic: it reads source, runs nothing, and needs no database.
//
// Run: npx tsx scripts/check_env_loader.ts
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/** The one module allowed to know where env files live. */
const LOADER = path.join("scripts", "loadEnv.ts");

/** Anything that carries a secret. A new one is added here once and is then
 *  covered for every script at once — which is the whole point of there being
 *  a single loader to add it to. */
const CREDENTIALS = ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"];

/** Any spelling of an env FILE: `.env`, `.env.local`, `.env.production`, and
 *  tsx/node's `--env-file=` flag. Deliberately wider than the one spelling
 *  that caused the incident — the property is "no file is named out here",
 *  not "not that file". */
const ENV_FILE = /(?:--env-file[= ]\S*)|(?:['"`][^'"`\n]*\.env(?:\.[A-Za-z0-9_]+)*['"`])/;

function walk(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (name === "node_modules" || name === ".next" || name === "public") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|mts|mjs|js)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * Source with comments and string-free of nothing else.
 *
 * Comments go because this file, loadEnv.ts and half the harnesses DESCRIBE
 * the defect in prose, and a check that cannot tell an explanation from an
 * implementation would force everyone to stop explaining. What survives is
 * code, which is what can actually read a file.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => {
      // Strip a `//` comment, but not one inside a string or a URL. Cheap
      // heuristic: only strip when the `//` is not preceded by a quote or a
      // colon on the same line.
      const i = l.search(/(^|[^:'"`\\])\/\//);
      if (i === -1) return l;
      return l.slice(0, l.indexOf("//", i));
    })
    .join("\n");
}

/**
 * Every module under lib/ that can reach lib/intelligence/semantic.ts, and so
 * can rank on embeddings — or, without VOYAGE_KEY, silently not.
 *
 * Derived by walking the import graph backwards from semantic.ts rather than
 * listed, because a list would go stale the first time somebody routes ranking
 * through a new module. Both static `from "..."` and `await import("...")` are
 * followed: the harnesses use both, and the dynamic ones are dynamic precisely
 * so the env preamble runs first.
 */
function semanticReachers(): Set<string> {
  const libFiles = walk("lib");
  const src = new Map(libFiles.map((f) => [path.resolve(f), code(readFileSync(f, "utf8"))]));
  // module -> modules it imports, resolved to absolute paths.
  const edges = new Map<string, string[]>();
  for (const [abs, body] of src) {
    const out: string[] = [];
    for (const m of body.matchAll(/(?:from|import\()\s*["'](\.[^"']+)["']/g)) {
      const target = path.resolve(path.dirname(abs), m[1]);
      for (const cand of [`${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")]) {
        if (src.has(cand)) { out.push(cand); break; }
      }
    }
    edges.set(abs, out);
  }
  const seed = path.resolve("lib/intelligence/semantic.ts");
  const reaches = new Set<string>([seed]);
  // Fixed point: anything importing something that reaches it, reaches it.
  for (let changed = true; changed;) {
    changed = false;
    for (const [abs, deps] of edges) {
      if (reaches.has(abs)) continue;
      if (deps.some((d) => reaches.has(d))) { reaches.add(abs); changed = true; }
    }
  }
  return reaches;
}

const SEMANTIC_REACHERS = semanticReachers();

const files = [
  ...walk("scripts"), ...walk("lib"), ...walk("app"), ...walk("components"),
  // Loose harnesses at the frontend root, e.g. .memo_harness.ts.
  ...readdirSync(".").filter((n) => /\.(tsx?|mts|mjs)$/.test(n))
    .filter((n) => statSync(n).isFile()),
];

const problems: string[] = [];

for (const file of files) {
  const rel = path.relative(".", file);
  const src = readFileSync(file, "utf8");
  const body = code(src);

  // ── P1: only the loader may name an env file ────────────────────────────
  if (rel !== LOADER) {
    const m = body.match(ENV_FILE);
    if (m) {
      problems.push(
        `${rel}: names an env file in code (${m[0].trim()}).\n`
        + `    Every harness used to do this and thirty-four of them named the\n`
        + `    WRONG one: ./.env.local is gitignored, so in a worktree they\n`
        + `    loaded nothing, said nothing, and measured the offline fallback.\n`
        + `    Use scripts/loadEnv.ts — import { loadEnvLocal } and call it.`);
    }
  }

  // P2 and P3 are about harnesses. lib/ and app/ are the request path, which
  // is supposed to degrade rather than fail a founder mid-brief.
  if (!rel.startsWith("scripts" + path.sep) || rel === LOADER) continue;

  const read = CREDENTIALS.filter((k) =>
    new RegExp(`process\\.env\\.${k}\\b|process\\.env\\["${k}"\\]`).test(body));

  // A script that DESTROYS a credential has pinned itself offline on purpose —
  // that is how the hermetic snapshot checks guarantee two people get the same
  // answer. It is a declaration, just the other one.
  const destroyed = CREDENTIALS.filter((k) =>
    new RegExp(`delete process\\.env\\.${k}\\b`).test(body));

  // P4: does this script import anything that can reach the semantic index?
  const ranks = [...body.matchAll(/(?:from|import\()\s*["'](\.[^"']+)["']/g)].some((m) => {
    const target = path.resolve(path.dirname(path.resolve(file)), m[1]);
    return [`${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")]
      .some((c) => SEMANTIC_REACHERS.has(c));
  });
  if (ranks && !destroyed.includes("DATABASE_URL")) read.push("VOYAGE_KEY");

  if (!read.length) continue;

  const declares = /requireCredentials\s*\(/.test(body);
  const declared = declares
    ? CREDENTIALS.filter((k) => new RegExp(`requireCredentials[\\s\\S]{0,200}?"${k}"`).test(body))
    : [];

  const unaccounted = read.filter((k) => !declared.includes(k) && !destroyed.includes(k));
  if (!unaccounted.length) continue;

  if (!declares) {
    problems.push(
      `${rel}: reads ${unaccounted.join(", ")} and declares nothing.\n`
      + `    Without the key this measures the offline fallback and prints a\n`
      + `    number indistinguishable from a real one. requireLiveCorpus()\n`
      + `    will NOT catch it: with no DATABASE_URL, hydration records\n`
      + `    source=snapshot, degraded=false, and that guard passes.\n`
      + `    Add requireCredentials("${path.basename(rel, ".ts")}", [${
        unaccounted.map((k) => `"${k}"`).join(", ")}]),\n`
      + `    or delete the variable to pin this script offline on purpose.`);
  } else {
    problems.push(
      `${rel}: reads ${unaccounted.join(", ")} but does not declare ${
        unaccounted.length > 1 ? "them" : "it"}.\n`
      + `    A half-contract passes the gate and still measures the wrong\n`
      + `    system: DATABASE_URL without VOYAGE_KEY ranks lexically, because\n`
      + `    semanticFundMatch returns an empty map and callers fall through.\n`
      + `    Declared: ${declared.join(", ") || "(none)"}.`);
  }
}

if (problems.length) {
  console.error(`check_env_loader: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}
console.log(`check_env_loader: ok — ${files.length} files, one loader, `
  + `every declared credential accounted for.`);
