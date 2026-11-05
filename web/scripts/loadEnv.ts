// ONE env loader for the scripts, and ONE definition of "this run has no
// credentials", because forty-one copies of the first had already drifted and
// the second did not exist at all.
//
// ── Why this is not a three-line inline block in every script ───────────────
// Every harness here opens `.env.local` itself: production reads env vars, and
// a `next` runtime loader would not be running when you invoke `npx tsx`. That
// part is fine. What was not fine is that the block was pasted forty-one times
// and seven of the copies had since learned something the other thirty-four had
// not: DATABASE_URL is documented to live at the REPO ROOT, so a checkout that
// carries only the root file made the other thirty-four believe they had no
// credentials.
//
// For a measurement script that means a number quietly taken off the lexical
// fallback. For a CHECK it is worse, and it was live: `check_recall_floor`
// printed "SKIPPED — no DATABASE_URL/VOYAGE_KEY" and exited 0, so on any fresh
// worktree — where `.env.local` is gitignored and therefore absent, while the
// repo-root one is right there — `npm run check` reported a green build with
// the recall floors never evaluated. A gate that cannot find its credentials
// must not be the same colour as a gate that passed.
//
// ── Two halves, and the second is the one that matters ─────────────────────
// Fixing the PATH only makes the silent run less likely. What makes it
// impossible is `requireCredentials()`: a harness declares what it needs, and
// a run that asked for credentials and did not get them ENDS, rather than
// measuring the fallback and printing a number that looks like the real one.
// That is `requireLiveCorpus()`'s rule (lib/intelligence/corpus.ts) moved one
// step earlier in the chain — and it has to be earlier, because
// `requireLiveCorpus` is BLIND to this failure by construction: with no
// DATABASE_URL at all, hydration records `source: "snapshot", degraded: false`
// and the guard passes. It catches "asked Postgres and got the snapshot". It
// cannot catch "never asked, because the credentials never loaded".
//
// The legitimate offline run is a DIFFERENT STATE, not a weaker version of the
// same one: `NO_PG=1` is this repo's declaration that there is no database, CI
// sets it deliberately, and several checks are meant to run that way. So there
// are three outcomes and only one of them is an error:
//
//   NO_PG set                    -> "offline". Deliberate. Say so, carry on.
//   every declared key present   -> "live".    Measure.
//   neither                      -> throw.     The run wanted credentials,
//                                              did not get them, and would
//                                              otherwise have produced a
//                                              number off the wrong system.
//
// ── Why a missing FILE is still never an error ─────────────────────────────
// CI has neither file and passes real variables in the environment, so the
// file search stays quiet. It is the KEYS that are required, never the files.
import { existsSync, readFileSync } from "fs";
import path from "path";

/** How far up to look before giving up on finding a repository root. */
const MAX_DEPTH = 8;

/**
 * Every directory an env file may live in: the working directory and each
 * ancestor up to and including the repository root, ROOT-MOST FIRST.
 *
 * Not a fixed `["../../.env.local", ".env.local"]` pair, because that pair is
 * relative to the working directory and several harnesses document themselves
 * as being run from the repo root (`npx tsx web/scripts/...`).
 * Those two spellings of the same intent are how the drift started. The
 * property is "the nearest env file wins, and every one above it still
 * counts", and it holds from any directory inside the repo.
 */
function envDirs(): string[] {
  const dirs: string[] = [];
  let dir = process.cwd();
  for (let i = 0; i < MAX_DEPTH; i++) {
    dirs.push(dir);
    // `.git` is a directory in a clone and a FILE in a worktree — which is
    // exactly the checkout this whole file exists because of, so both count.
    if (existsSync(path.join(dir, ".git"))) break;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  dirs.reverse();
  // The capital brain's env file. Until 2026-11-06 this app lived inside
  // capital/ (at capital/website/frontend), so capital/.env.local was one of
  // its ancestors and the walk above found it. The app is now <root>/web, a
  // sibling, so it is named here: directly below the repository root and
  // above everything nearer the working directory, exactly where the walk used
  // to put it.
  const capital = path.join(dirs[0], "capital");
  if (existsSync(path.join(dirs[0], ".git")) && existsSync(capital) && !dirs.includes(capital)) {
    dirs.splice(1, 0, capital);
  }
  return dirs;
}

/** The env files this process would consult, root-most first, each marked with
 *  whether it is actually there. Harnesses print this when they cannot find a
 *  credential: "no DATABASE_URL" and "no DATABASE_URL *here*" are different
 *  problems and the message has to tell them apart. */
export function envFilesConsulted(): { path: string; present: boolean }[] {
  return envDirs().map((d) => {
    const p = path.join(d, ".env.local");
    return { path: p, present: existsSync(p) };
  });
}

/** One-line rendering of the search, for error and skip messages. */
export function envSearchSummary(): string {
  const files = envFilesConsulted();
  const found = files.filter((f) => f.present);
  const shown = files.map((f) => `${f.path}${f.present ? "" : " (absent)"}`);
  return `looked in ${shown.join(", ")} — ${found.length} present, `
    + `from cwd ${process.cwd()}`;
}

/**
 * Load `.env.local` from the repo root down to the working directory, into
 * process.env.
 *
 * Existing process environment always wins — CI and Vercel set real variables
 * and a checked-out file must never override them. A nearer file beats a
 * further one. Returns the files that were actually read, so a caller that
 * wants to say where its credentials came from can.
 */
export function loadEnvLocal(): string[] {
  const seen = new Set<string>();
  const read: string[] = [];
  for (const { path: file, present } of envFilesConsulted()) {
    if (!present) continue; // No file is normal: CI has none.
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    read.push(file);
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (!m) continue;
      // `seen` lets a later FILE override an earlier file, while the ambient
      // process environment still beats both.
      if (process.env[m[1]] !== undefined && !seen.has(m[1])) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      seen.add(m[1]);
    }
  }
  return read;
}

/**
 * What state this run's credentials are in.
 *
 *   "live"     the declared keys are all present; measure against the real
 *              stores and publish the number.
 *   "offline"  NO_PG=1. There is deliberately no database. Legitimate, and a
 *              harness that cannot say anything without one should skip and
 *              SAY it skipped.
 *
 * There is no third value: the third case throws.
 */
export type CredentialState = "live" | "offline";

/** True when the run has declared itself to have no database. */
export function isDeliberatelyOffline(): boolean {
  return Boolean(process.env.NO_PG);
}

/**
 * Declare what this harness needs, and get a state rather than a guess.
 *
 * THE RULE, and it is `requireLiveCorpus()`'s rule one link earlier in the
 * chain: a harness that measures whatever it happens to have credentials for
 * is the same defect as a harness that measures the wrong system on purpose.
 * The only difference is that nobody chose it.
 *
 * Under `NO_PG` this also DELETES DATABASE_URL, which nineteen harnesses were
 * each doing on their own line immediately after their own copy of the env
 * preamble. That line is the same decision as this function's first branch, so
 * it lives here now: "deliberately offline" has one definition, and a harness
 * cannot half-honour it.
 *
 * `ENV_SELFTEST=1` prints the resolved state and exits 0 without running the
 * harness. That is how a conversion is verified without paying for the run —
 * a model-calling bench costs real money, and "it starts up and finds its
 * credentials" is the whole claim being checked.
 *
 * ── `optional`, and the very narrow thing it is for ────────────────────────
 * A key the harness will USE if it is there and can honestly answer the same
 * question without. It exists for exactly one shape, and the test is strict:
 *
 *     the credential-free path must answer the SAME question from the SAME
 *     source — not a weaker approximation of it.
 *
 * `check_corpus_census` is the case. With DATABASE_URL it reads the
 * `corpus_census` table; without it, it reads the same rows over HTTPS from
 * /api/guards, which the census publisher wrote from the same figures in the
 * same transaction. Neither is a fallback measurement; they are one record
 * behind two doors, which is what lets that check run on every pull request
 * without GitHub holding a database credential.
 *
 * This is NOT for "measure whatever I have credentials for". That is the defect
 * this whole file exists to remove, and it is still a `keys` entry. If the
 * degraded path answers a DIFFERENT question — the lexical index instead of
 * pgvector, the committed snapshot instead of the register — it is required,
 * not optional, however inconvenient that is.
 *
 * Declaring a key here still satisfies check_env_loader: it is accounted for.
 * What it stops being is a reason to abort.
 *
 * @param context   the harness name, for the message
 * @param keys      env vars this harness cannot honestly run without
 * @param optional  env vars it uses when present, having an equally true path
 *                  without them
 * @throws when the run is not offline and a required key is missing
 */
/**
 * ── A HARNESS THAT DECLARED NO ANTHROPIC KEY MAY NOT SPEND (wsGB) ─────────
 *
 * The credential contract above is already the statement "this run needs a
 * model" or "this run does not". Until 2026-08-12 the second statement was safe
 * for free, because `AGENT_SELECT` defaulted to `off` and the ranking seam
 * returned its argument by reference. It now defaults to `adviser`, and a
 * harness that declares `["DATABASE_URL", "VOYAGE_KEY"]`, loads `.env.local`
 * (which carries ANTHROPIC_API_KEY), and touches the memo seam will make a paid
 * call per founder while its own contract says it is free.
 *
 * So the declaration is PUBLISHED here and enforced at the one place that
 * spends — `agentSelectRows`, immediately before the call. The property, with a
 * test for a harness nobody has written yet: a run whose declared credentials
 * omit ANTHROPIC_API_KEY may not make a model call, whatever its name and
 * whatever the arm.
 *
 * It is published through the environment rather than through an import because
 * `lib/intelligence/` must not import from `scripts/`, and because ESM
 * evaluates every imported module BEFORE the first statement of the importing
 * script — so a module-scope read anywhere would run before this is called.
 * That is also why the seam reads it at the moment of spending rather than
 * once: this is an interlock, not a lever, and an interlock that is latched
 * before the declaration exists latches nothing.
 *
 * REFUSAL, NOT FALLBACK. Deleting the key instead would make the call throw,
 * `agentSelectRows` catch, and the run report the SHIPPED ORDER under the
 * treatment's name — the exact failure this repo has retracted figures for. A
 * harness that wants the free arm says so: `AGENT_SELECT=off`.
 */
export const NO_SPEND_ENV = "WINCENT_DECLARED_NO_ANTHROPIC";

export function requireCredentials(
  context: string, keys: readonly string[],
  { optional = [] as readonly string[] } = {},
): CredentialState {
  if ([...keys, ...optional].includes("ANTHROPIC_API_KEY")) delete process.env[NO_SPEND_ENV];
  else process.env[NO_SPEND_ENV] = context;
  const state: CredentialState = isDeliberatelyOffline() ? "offline" : "live";
  if (state === "offline") {
    // One definition of "there is no database", instead of nineteen.
    delete process.env.DATABASE_URL;
  }
  const missing = state === "offline"
    ? []
    : keys.filter((k) => !process.env[k]);

  if (process.env.ENV_SELFTEST) {
    const have = [...keys, ...optional].filter((k) => Boolean(process.env[k]));
    console.log(
      `${context}: credentials=${state}`
      + ` needs=[${keys.join(",")}]`
      + (optional.length ? ` optional=[${optional.join(",")}]` : "")
      + ` have=[${have.join(",")}]`
      + (missing.length ? ` MISSING=[${missing.join(",")}]` : "")
      + `\n  ${envSearchSummary()}`);
    process.exit(missing.length ? 1 : 0);
  }

  if (!missing.length) return state;

  throw new Error(
    `${context}: missing ${missing.join(", ")}.\n`
    + `  ${envSearchSummary()}\n`
    + `  This run asked for credentials and did not get them. It is NOT the\n`
    + `  same as a run with no database: continuing would measure the offline\n`
    + `  fallback — a different system from the one that ships — and print a\n`
    + `  number that looks exactly like a real one. On 2026-08-07 that shape\n`
    + `  had check_recall_floor printing SKIPPED and exiting 0, so a green\n`
    + `  \`npm run check\` had never evaluated the recall floors at all.\n`
    + `  Either put the keys in a .env.local at one of the paths above — the\n`
    + `  repo root is where DATABASE_URL is documented to live — or declare\n`
    + `  the offline run: NO_PG=1.`);
}
