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
// can be unit-tested on a poisoned row without touching the corpus.

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
  /** [raw, what Python's squash() produced] — the cross-language contract. */
  squashProbes?: [string, string][];
};

export type LeakRow = {
  name?: string;
  instrument: string;
  description?: string;
  descriptionSource?: string;
};

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
    return null;
  };
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
