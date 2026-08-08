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
//   P4  A SCRIPT THAT CAN REACH A CREDENTIAL MUST DECLARE THAT CREDENTIAL.
//       P3 only sees credentials a script NAMES ITSELF, and the ones that
//       matter are named nowhere in the harness: they are read inside lib/.
//       So for each credential, the set of lib modules that can reach the
//       module reading it is DERIVED from the import graph, not listed — a new
//       module that reaches it is covered the day it is written.
//
//       This was originally written for VOYAGE_KEY alone, seeded on
//       lib/intelligence/semantic.ts, and that seeding was the bug in the
//       check: DATABASE_URL is read in five lib modules and reaches scripts by
//       exactly the same path, so a harness could call hydrateDbInstruments()
//       through lib/intelligence/corpus.ts, declare nothing, and pass all four
//       properties. Verified by break test on 2026-08-08: it did. A property
//       that holds for one credential and not its four siblings is a register
//       with one entry, so the seed is now every module naming any credential.
//
//       What each credential silently costs when missing, which is why this is
//       not cosmetic:
//         DATABASE_URL      corpus falls back to the committed snapshot — a
//                           DIFFERENT answer to "which funds exist" (1,084 vs
//                           1,088 today, nine disagreeing on OPEN/CLOSED).
//         VOYAGE_KEY        embedQuery returns null, semanticFundMatch returns
//                           an empty map, every caller falls through to the
//                           LEXICAL index — a different ranker, silently, with
//                           the corpus guard satisfied because Postgres
//                           answered fine.
//         ANTHROPIC/OPENAI  the model call is the measurement; without the key
//                           there is nothing to measure.
//
//       Reachability is per MODULE, so this over-approximates: importing a
//       pure helper like toIso2 from corpus.ts trips DATABASE_URL even though
//       that call never opens a connection. That is the safe direction, and it
//       costs nothing, because a script that genuinely needs no database has a
//       second way to say so — `delete process.env.DATABASE_URL` — which is
//       not a workaround but the stronger claim: it pins the run offline
//       instead of merely hoping. Under-declaring is the defect itself,
//       measured silently.
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

/** The module a relative specifier resolves to, or null if it is not ours. */
function resolveImport(fromFile: string, spec: string, known: Set<string>): string | null {
  const target = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [`${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")]) {
    if (known.has(cand)) return cand;
  }
  return null;
}

/**
 * For each credential, every module under lib/ that can reach the code reading
 * it — and so can silently take the fallback path when the key is absent.
 *
 * Derived by walking the import graph backwards from the modules that NAME the
 * credential, rather than from one hand-picked seed. The hand-picked seed is
 * what made this check miss the case it was written to catch: it knew that
 * VOYAGE_KEY is read in semantic.ts, and did not know that DATABASE_URL is
 * read in five other modules. Seeding on "names the credential" needs no such
 * knowledge and cannot fall behind the code.
 *
 * Both static `from "..."` and `await import("...")` are followed: the
 * harnesses use both, and the dynamic ones are dynamic precisely so the env
 * preamble runs before the module that needs it is evaluated.
 */
function credentialReachers(): Map<string, Set<string>> {
  const src = new Map(walk("lib").map((f) => [path.resolve(f), code(readFileSync(f, "utf8"))]));
  const known = new Set(src.keys());
  // module -> modules it imports, resolved to absolute paths.
  const edges = new Map<string, string[]>();
  for (const [abs, body] of src) {
    const out: string[] = [];
    for (const m of body.matchAll(/(?:from|import\()\s*["'](\.[^"']+)["']/g)) {
      const dep = resolveImport(abs, m[1], known);
      if (dep) out.push(dep);
    }
    edges.set(abs, out);
  }

  const byCredential = new Map<string, Set<string>>();
  for (const key of CREDENTIALS) {
    // Seed: every lib module that reads this credential itself.
    const reaches = new Set<string>();
    for (const [abs, body] of src) {
      if (reads(body, key)) reaches.add(abs);
    }
    // Fixed point: anything importing something that reaches it, reaches it.
    for (let changed = true; changed;) {
      changed = false;
      for (const [abs, deps] of edges) {
        if (reaches.has(abs)) continue;
        if (deps.some((d) => reaches.has(d))) { reaches.add(abs); changed = true; }
      }
    }
    byCredential.set(key, reaches);
  }
  return byCredential;
}

/** Does this source read the named credential out of the environment? */
function reads(body: string, key: string): boolean {
  return new RegExp(`process\\.env\\.${key}\\b|process\\.env\\["${key}"\\]`).test(body);
}

const CREDENTIAL_REACHERS = credentialReachers();

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

  const read = CREDENTIALS.filter((k) => reads(body, k));

  // A script that DESTROYS a credential has pinned itself offline on purpose —
  // that is how the hermetic snapshot checks guarantee two people get the same
  // answer. It is a declaration, just the other one.
  const destroyed = CREDENTIALS.filter((k) =>
    new RegExp(`delete process\\.env\\.${k}\\b`).test(body));

  // P4: which credentials can this script reach THROUGH its imports, without
  // ever naming one? Every lib module it pulls in, static or dynamic.
  const libKnown = new Set<string>();
  for (const set of CREDENTIAL_REACHERS.values()) for (const m of set) libKnown.add(m);
  const imported = [...body.matchAll(/(?:from|import\()\s*["'](\.[^"']+)["']/g)]
    .map((m) => resolveImport(path.resolve(file), m[1], libKnown))
    .filter((m): m is string => m !== null);
  const reached: string[] = [];
  for (const key of CREDENTIALS) {
    const reachers = CREDENTIAL_REACHERS.get(key)!;
    if (imported.some((m) => reachers.has(m)) && !read.includes(key)) {
      read.push(key);
      reached.push(key);
    }
  }

  // The embeddings live IN Postgres: semanticFundMatch queries the pgvector
  // index, so a script that has destroyed DATABASE_URL cannot reach the
  // semantic path however many modules it imports, and demanding VOYAGE_KEY of
  // it would be asking for a key it has already made unusable. Destroying the
  // database is the stronger declaration and it subsumes this one.
  if (destroyed.includes("DATABASE_URL")) {
    for (const dependent of ["VOYAGE_KEY"]) {
      const i = read.indexOf(dependent);
      if (i !== -1 && reached.includes(dependent)) read.splice(i, 1);
    }
  }

  if (!read.length) continue;

  const declares = /requireCredentials\s*\(/.test(body);
  const declared = declares
    ? CREDENTIALS.filter((k) => new RegExp(`requireCredentials[\\s\\S]{0,200}?"${k}"`).test(body))
    : [];

  const unaccounted = read.filter((k) => !declared.includes(k) && !destroyed.includes(k));
  if (!unaccounted.length) continue;

  // "Names it" and "reaches it through an import" read the same in a report and
  // are found in completely different places, so say which.
  const how = (keys: string[]) => keys
    .map((k) => reached.includes(k)
      ? `${k} (through ${imported.filter((m) => CREDENTIAL_REACHERS.get(k)!.has(m))
        .map((m) => path.relative(".", m)).join(", ")})`
      : k)
    .join(", ");

  if (!declares) {
    problems.push(
      `${rel}: reads ${how(unaccounted)} and declares nothing.\n`
      + `    Without the key this measures the offline fallback and prints a\n`
      + `    number indistinguishable from a real one. requireLiveCorpus()\n`
      + `    will NOT catch it: with no DATABASE_URL, hydration records\n`
      + `    source=snapshot, degraded=false, and that guard passes.\n`
      + `    Add requireCredentials("${path.basename(rel, ".ts")}", [${
        unaccounted.map((k) => `"${k}"`).join(", ")}]),\n`
      + `    or delete the variable to pin this script offline on purpose.`);
  } else {
    problems.push(
      `${rel}: reads ${how(unaccounted)} but does not declare ${
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
