// One way to load a committed, generated artifact — and one place it can fail.
//
// ── The defect this closes ─────────────────────────────────────────────────
// Four artifacts are read with `readFileSync` at request time on the PRODUCTION
// ranking path, and every one of them was wrapped in the same three lines:
//
//     try  { cache = JSON.parse(readFileSync(...)) }
//     catch { cache = {} }                              // <- silent
//
// An empty object is not a degraded answer here, it is a DIFFERENT ranker.
// `peerPrior` returning `{}` makes `applyPeerPrecedence` a no-op, and peer
// precedence is the signal that took exact-scheme recall from 24% to 43%.
// `regionPrior` returning `{}` makes every fund's regional footprint "no
// record". `__objectives` returning `{}` switches off the registered-purpose
// re-rank. `channelPrior` returning its neutral literal restores the exact
// composition bias it was built to correct — the product showing the 22% and
// under-showing the 78%. All four fail to the shape of "this signal is simply
// not very informative today", which is indistinguishable from working.
//
// This is the same failure workstream BF found in `corpus.ts` on 2026-08-08,
// where a bare `catch` turned "not where I looked" into "the corpus is empty"
// and two guards printed a confident green over 0 instruments. It was fixed
// there, in one function. These four were the same bug, four more times, on the
// path a founder actually goes down.
//
// It is not hypothetical on this path in particular. Both `next.config.ts` file
// tracing and the Vercel bundle decide which non-source files exist beside the
// serverless function, neither of these artifacts is force-traced, and a
// tracing miss produces EXACTLY this: a deployed ranker quietly missing its
// strongest signal, with a green build and no log line.
//
// ── What replaces it ───────────────────────────────────────────────────────
// Still a fallback, never a throw: at request time a degraded ranking beats a
// 500, and that judgement is unchanged. What changes is that the failure is
// SAID — naming the file, the cwd it resolved from, and what the ranking loses
// — and that it is RECORDED, so a harness can assert on it instead of grading
// a run whose ranker was half switched off.
//
// A leaf module on purpose: `fs` and `path` and nothing else, so both
// `shortlist.ts` and `regionPrior.ts` can use it without either dragging the
// filesystem into the other's import graph. See check_client_boundary.ts.
import { readFileSync } from "fs";
import path from "path";

/** Artifacts that failed to load in this process, with what went wrong.
 *  Keyed by basename so a repeated read cannot inflate the count. */
const failures = new Map<string, string>();

/**
 * Every artifact this repo commits under `lib/intelligence/` and reads at
 * request time. Declared rather than inferred from the call site, because the
 * `cost` line is the part a caller cannot supply honestly at the moment it is
 * writing a `catch` — and it is the only part of the log that tells the person
 * reading it whether to care.
 *
 * `check_artifact_reachability.py` asserts that every committed artifact in
 * that directory is loaded through this function, so a fifth one cannot arrive
 * with its own silent catch.
 */
const COST: Record<string, string> = {
  "peerPrior.generated.json":
    "peer precedence is OFF; exact-scheme recall falls from about 43% to 24%",
  "regionPrior.generated.json":
    "every fund reads as having no regional footprint, so region stops routing",
  "__objectives.json":
    "the registered-purpose re-rank is OFF for all 421 schemes that declare one",
  "channelPrior.generated.json":
    "channel composition is unweighted, which is the EU-over-national bias this "
    + "prior exists to correct",
  "openQuestionClass.generated.json":
    "no requirement is known to be fuzzy rather than merely unencoded, so the "
    + "open-question path asks nothing and stage 2 falls back to enum-answered "
    + "fields only — which is the shipped behaviour, so this one degrades to a "
    + "correct product rather than a wrong one",
};

/**
 * Load a committed generated artifact, or return `empty` loudly.
 *
 * @param basename file under `lib/intelligence/`, e.g. "peerPrior.generated.json"
 * @param empty    the neutral value this signal degrades to
 */
export function loadGenerated<T>(basename: string, empty: T): T {
  const file = path.join(process.cwd(), "lib", "intelligence", basename);
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as T;
    failures.delete(basename);
    return parsed;
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    failures.set(basename, why);
    // Loud, and specific about the two things that are actually different: WHY
    // it could not be read, and WHAT the ranking is now missing. "Failed to
    // load peerPrior" tells a reader nothing they can act on; "peer precedence
    // is off, recall 43% -> 24%" tells them whether the run they are looking at
    // is worth reading at all.
    console.error(
      `generatedArtifact: could not read ${basename} at ${file} `
      + `(cwd ${process.cwd()}): ${why}. `
      + `Falling back to the neutral value — ${COST[basename] ?? "this signal is off"}. `
      + `Any ranking figure from this process is about that, NOT about the corpus.`);
    return empty;
  }
}

/** Which artifacts failed to load in this process. Empty is the good state.
 *
 *  Exists so a harness can refuse to publish a number taken from a run whose
 *  ranker was missing a signal. A measurement that silently graded the neutral
 *  fallback is worse than no measurement: it is a real figure about a system
 *  nobody ships. */
export function generatedArtifactFailures(): Record<string, string> {
  return Object.fromEntries(failures);
}
