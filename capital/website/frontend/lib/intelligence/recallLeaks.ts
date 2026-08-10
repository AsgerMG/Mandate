// Does a test query contain its own answer?
//
// ── The defect ─────────────────────────────────────────────────────────────
// 46% of the old recall set's holdout `project` rows had their description
// sitting verbatim inside `instrument_profiles.profile_text` for the very fund
// they were meant to find. Retrieval scores against that column, so those rows
// were graded on a query copied out of the answer. It ran for weeks and
// inflated every number quoted from project rows, because a leak does not
// announce itself as a failure — it announces itself as a good score.
//
// The build-time guards (ETL/terms/recall_guards.py) stop new leaks entering.
// This is the regression test: it re-derives the same judgement from a
// committed artifact, with no database, so it can run in `npm run check` on a
// machine that has no credentials. A guard that cannot run reports green.
//
// ── The property ───────────────────────────────────────────────────────────
// A description used as a test query must be a statement about the COMPANY'S
// work that could have been written without knowing which fund is the right
// answer. Three ways it can fail, cheapest first:
//
//   exact     the whole description sits inside the won fund's profile
//   8-gram    eight consecutive words are shared with it — enough that the
//             string is quoting the profile rather than coinciding with it
//   sibling   either of the above against a fund sharing the won fund's
//             parent. A sibling shares the scheme name, so such a string
//             describes the FAMILY, not the company, and would hand REGIME@5 —
//             the operational number — away for free.
//
// Deliberately pure: no fs, no pg. The artifact is passed in, so this module
// can be unit-tested on a poisoned row without touching the corpus. (`crypto`
// is a hash and reads nothing; see `digest` below for why one is needed.)
import { createHash } from "crypto";

/** Comparison form: accent-free, punctuation-free, single-spaced lowercase.
 *
 *  MUST agree character-for-character with `squash()` in
 *  ETL/terms/recall_guards.py — the profile side is squashed there, in Python,
 *  and the description side is squashed here. Two implementations of one
 *  normaliser is the duplication that produced the original leak, so the
 *  artifact carries probes covering every non-ASCII character the corpus can
 *  present and `checkSquashProbes` fails the build if the two disagree. */
export const squash = (s: string): string =>
  s.normalize("NFKD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Eight words is the unit: long enough that two independent texts do not
 *  share one by chance, short enough to catch a description quoted into a
 *  profile with a word changed. */
export const GRAM = 8;

export function grams(squashed: string, k = GRAM): Set<string> {
  const w = squashed.split(" ").filter(Boolean);
  if (!w.length) return new Set();
  const out = new Set<string>();
  for (let i = 0; i < Math.max(w.length - k + 1, 1); i++) out.add(w.slice(i, i + k).join(" "));
  return out;
}

export type LeakIndexFile = {
  builtAt?: string;
  source?: string;
  /** instrument id -> its profile_text, already squashed. */
  profile: Record<string, string>;
  /** instrument id -> parent id. Absent means the instrument has no parent. */
  parent: Record<string, string>;
  /** instrument id -> its own name, squashed. Answer instruments only. */
  name?: Record<string, string>;
  /** instrument id -> its notified scheme code, squashed. */
  code?: Record<string, string>;
  /** instrument id -> digests of EVERY project title the corpus credits to it.
   *  Digests rather than text: this artifact is committed, and award prose is
   *  an answer-bearing source. */
  ownTitles?: Record<string, string[]>;
  /** [raw, what Python's squash() produced] — the cross-language contract. */
  squashProbes?: [string, string][];
  /** [squashed, what Python's digest() produced] — the same contract again. */
  digestProbes?: [string, string][];
};

export type LeakRow = {
  name?: string;
  instrument: string;
  description?: string;
  descriptionSource?: string;
  /** Set by ETL/terms/rebuild_recall_descriptions.py. See BORROWED_CONTRACT. */
  descriptionRebuilt?: boolean;
};

/** ── The stronger contract a REBUILT description signs ──────────────────────
 *
 *  Three of the checks in `makeLeakDetector` compare a description against
 *  `profile_text`, which is built from up to FORTY SAMPLED award titles per
 *  fund. That is a sample of the fund's own words, not all of them, and it is
 *  the right bar for a description drawn from the company's own award under the
 *  fund being predicted (`own_award_text`) — those rows declare that provenance
 *  and are graded knowing it.
 *
 *  A description rebuilt from ANOTHER REGIME declares something stronger: that
 *  it could have been written without knowing the answer, because it belongs to
 *  a different programme entirely. Three ways that claim can be false which the
 *  profile checks cannot see:
 *
 *    names it     the fund's own name appears in the text
 *    codes it     the fund's notified scheme code appears in the text
 *    own title    the text IS a project title of an award under the won fund —
 *                 the same string reaching two regimes, which is exactly what
 *                 "it belongs to another regime" denies
 *
 *  The build-time guards in ETL/terms/recall_guards.py refuse all three. This
 *  is the regression test, on the committed artifact, with no database — and it
 *  is scoped to rows that made the cross-regime claim rather than applied to
 *  every described row, because applying it to `own_award_text` would fail 843
 *  rows on a provenance they never claimed to have. */
export const BORROWED_CONTRACT =
  "a description rebuilt from another regime must not name the won fund, its " +
  "scheme code, or reproduce one of its own award titles";

/** True for a row whose description claims cross-regime provenance. */
export const isBorrowed = (r: LeakRow): boolean =>
  Boolean(r.descriptionRebuilt)
  || Boolean(r.descriptionSource?.startsWith("cross_regime"));

/** Rows whose description is already known and marked as leaking are excluded
 *  from the measured population by every harness, so they are not a finding
 *  here either — flagging them would make the check permanently red on a fact
 *  the set already records. */
const isLive = (r: LeakRow): boolean =>
  Boolean((r.description ?? "").trim())
  && r.descriptionSource !== "own_project_title_leaks";

/**
 * Build the detector once over an index, then call it per row.
 *
 * Profile gram sets are built lazily and cached: the whole corpus is a few
 * hundred thousand grams and only the funds a recall set actually names, plus
 * their siblings, are ever consulted.
 */
export function makeLeakDetector(idx: LeakIndexFile) {
  // Siblings share a parent. An instrument with no parent is its own group
  // head, so its "siblings" are its children — the same relation
  // `recall_guards.siblings_of` computes, and it must stay the same one.
  const universe = new Set<string>([
    ...Object.keys(idx.profile), ...Object.keys(idx.parent), ...Object.values(idx.parent),
  ]);
  const kids = new Map<string, string[]>();
  for (const id of universe) {
    const head = idx.parent[id] ?? id;
    (kids.get(head) ?? kids.set(head, []).get(head)!).push(id);
  }
  const gramCache = new Map<string, Set<string>>();
  const gramsOf = (id: string): Set<string> => {
    let g = gramCache.get(id);
    if (!g) { g = grams(idx.profile[id] ?? ""); gramCache.set(id, g); }
    return g;
  };
  const shares = (dg: Set<string>, id: string): boolean => {
    const pg = gramsOf(id);
    for (const g of dg) if (pg.has(g)) return true;
    return false;
  };

  const ownTitles = new Map<string, Set<string>>();
  for (const [id, digests] of Object.entries(idx.ownTitles ?? {})) {
    ownTitles.set(id, new Set(digests));
  }

  return function leakReason(row: LeakRow): string | null {
    if (!isLive(row)) return null;
    const n = squash(row.description ?? "");
    if (!n) return null;
    const won = row.instrument;
    const p = idx.profile[won] ?? "";
    if (p && p.includes(n)) return "verbatim in the won fund's profile";
    const dg = grams(n);
    if (p && shares(dg, won)) return "8-gram shared with the won fund's profile";
    const head = idx.parent[won] ?? won;
    for (const s of kids.get(head) ?? []) {
      if (s === won) continue;
      const ps = idx.profile[s] ?? "";
      if (!ps) continue;
      if (ps.includes(n)) return `verbatim in a SIBLING's profile (${s})`;
      if (shares(dg, s)) return `8-gram shared with a SIBLING's profile (${s})`;
    }
    // The three above are the bar for ANY description. A rebuilt one signed a
    // stronger contract; see BORROWED_CONTRACT.
    if (!isBorrowed(row)) return null;
    const fundName = idx.name?.[won] ?? "";
    // Short names would match by accident — `distinctive_tokens` in the Python
    // guard ignores tokens under five characters for the same reason — so the
    // whole-name test needs a name long enough to be the fund and not a word.
    if (fundName.length >= 8 && n.includes(fundName)) {
      return "names the won fund, and claims to come from another regime";
    }
    const code = idx.code?.[won] ?? "";
    if (code.length >= 3 && n.includes(code)) {
      return "contains the won fund's scheme code";
    }
    if (ownTitles.get(won)?.has(digest(n))) {
      return "IS a project title of an award under the won fund";
    }
    return null;
  };
}

/** The digest `emit_profile_leak_index.py` ships title fingerprints as.
 *
 *  MUST agree with `digest()` in ETL/terms/recall_guards.py character for
 *  character. The artifact carries probes and `checkDigestProbes` fails the
 *  build on any disagreement — the same contract `squash` already has, for the
 *  same reason: two implementations of one function is how a guard silently
 *  stops catching things. */
export const digest = (squashed: string): string =>
  createHash("sha1").update(squashed, "utf8").digest("hex").slice(0, 12);

/** Every digest probe the artifact carries, re-derived here. */
export function checkDigestProbes(idx: LeakIndexFile): string[] {
  const bad: string[] = [];
  for (const [squashed, want] of idx.digestProbes ?? []) {
    const got = digest(squashed);
    if (got !== want) {
      bad.push(`${JSON.stringify(squashed.slice(0, 60))}\n    python ${want}\n    ts     ${got}`);
    }
  }
  return bad;
}

/** Every probe the artifact carries, re-squashed here. Any disagreement means
 *  the two normalisers have drifted and the whole check is measuring the wrong
 *  strings — which is precisely how the original leak survived. */
export function checkSquashProbes(idx: LeakIndexFile): string[] {
  const bad: string[] = [];
  for (const [raw, want] of idx.squashProbes ?? []) {
    const got = squash(raw);
    if (got !== want) bad.push(`${JSON.stringify(raw)}\n    python ${JSON.stringify(want)}\n    ts     ${JSON.stringify(got)}`);
  }
  return bad;
}
