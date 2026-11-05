// wsIB — THE RULER. ONE implementation, and it is calibrated against the one
// row on every menu whose correctness is not in question.
//
// ── What this replaces, and why a shared module is the fix ────────────────
// Four scripts carried their own copy of the same two tests — `_wsdy_slots.ts`,
// `_wsho_harvest.ts`, `_wshz_replay.ts`, `_wsec_compose.ts` — each with a
// comment saying it was kept "identical on purpose so the numbers compare".
// They were not identical. `_wsdy_slots.ts` held a six-entry sector map where
// `shortlist.ts` holds ten, so a founder in `energy & cleantech` or `materials
// & chemicals` had EVERY described row counted off-theme; the other three
// imported `SECTOR_WORD` and did not. Four copies of a rule with a "keep in
// sync" note is the defect this repo names, and the four copies had already
// drifted. There is now one.
//
// ── THE FINDING THAT FORCED THE REWRITE ──────────────────────────────────
// The old theme test was STRICT STRING EQUALITY between the `mostly X` clause a
// row prints and the founder's own sector label. Pointed at the fund the
// company ACTUALLY WON, over the 78 called founders of each paid tape, it
// disqualified the right answer on 39.7% (wsHO) and 42.3% (wsHW) of them —
// against the 64% at which it rejects a random menu row. A test the right
// answer fails two times in five is not a test.
//
// The reason is arithmetic and it was knowable without a model. `mostly X`
// names ONE bucket of a distribution — the largest that `SECTOR_WORD` can
// spell and that clears `FOCUS_SHARE`, holding a median share of 0.47. Measured
// on the answer key: the founder's own sector is the largest bucket of the fund
// they won on 26 of 78 founders. So even a PERFECT selector fails the equality
// test two times in three, by construction, before any judgement is involved.
//
// ── AND THE SECOND RULE WAS NEVER THE PROMPT'S ───────────────────────────
// Every one of the four scripts calls these "the two disqualifiers the prompt
// ITSELF states", and `agentSelect.ts` repeats it in prose. Read the prompt.
// It states three disqualifiers and none of them is this one:
//
//   "a scheme whose typical cheque is an order of magnitude away from what this
//    company needs is the wrong scheme however well the rest fits"
//   "a scheme whose stated demands this company plainly fails is the wrong
//    scheme even if it is near the top"
//   "a scheme that stopped paying out years ago is the wrong scheme"
//
// The only sector sentence in the prompt is a TIE-BREAK, and it is about the
// TITLE rather than the descriptor: "where two are equally good, prefer the one
// whose title is specific to what this company does over the one whose title is
// generic". It disqualifies nothing. So the ruler tested one real disqualifier,
// invented a second, attributed it to the prompt, and never tested the other
// two. `themeMismatch` below is kept ONLY so the old numbers can be reproduced
// and is marked retired; nothing new should grade on it.
//
// ── THE REPLACEMENT, AND ITS PROPERTY ────────────────────────────────────
//
//   A ROW IS A CATEGORY ERROR FOR THIS FOUNDER WHEN THE FUND'S OWN AWARD
//   HISTORY IS LONG ENOUGH TO SPEAK AND RECORDS NOT ONE AWARD IN THE FOUNDER'S
//   SECTOR, NOR IN ANY SECTOR THAT FUNDS ALONGSIDE IT ABOVE CHANCE.
//
// Three clauses, each of which is doing work:
//
//   the whole distribution, not the headline — the test reads `sectorMix`,
//     which is what `mostly X` is a one-word summary of. A fund that has paid
//     the founder's sector thirty times does not stop having paid it because a
//     different bucket is larger.
//
//   the neighbourhood, DERIVED — `sectorNeighbourhood()` computes, from the
//     corpus alone, which sectors are funded alongside each other more often
//     than their corpus-wide shares predict. It is a property over any pair of
//     sector keys, including a key added tomorrow: no pair is named anywhere in
//     this file or its test.
//
//   long enough to speak — a fund with four awards on record and none in your
//     sector has told you nothing. With `n` awards and none in the family, the
//     95% upper bound on the family's true share is 3/n (the rule of three), so
//     the silence only counts when even that bound sits below what the family
//     holds across the whole corpus. Short histories return `null`, which every
//     caller must treat as "cannot say" and never as "fails".
//
// ── WHAT IT COSTS, MEASURED, AND WHAT THAT MEANS ─────────────────────────
// On the same labelled set (the fund each company actually won, 78 founders per
// tape) and the same menus:
//
//                              won fund disqualified      menu rows disqualified
//   strict equality (retired)     39.7% / 42.3%                64.0% / 64.9%
//   THIS TEST                      1.3% /  1.3%                 2.7% /  2.9%
//
// Read that pair honestly. The false-disqualification rate falls from two in
// five to one founder in seventy-eight — and the test now cuts 2.7% of a menu
// where the old one cut 64%. NEARLY ALL OF THE OLD RULER'S DISCRIMINATING
// POWER WAS FALSE POSITIVES. That is the finding, not a side effect of it: a
// theme test that may not condemn the right answer has almost nothing left to
// say about a forty-row menu, and no survivor count built on the old one
// survives.
//
// ── THE ONE FOUNDER IT STILL FIRES ON, NAMED ─────────────────────────────
// AIXTRON SE, on both tapes. AIXTRON answered `industrial_manufacturing`; the
// Bundesministerium programme it won has 25 of its 30 recorded awards in
// `semiconductors_electronics` and 5 in `software_data_ai`, and the corpus's
// co-funding structure puts semiconductors BELOW chance beside industrial
// manufacturing (lift 0.85), so no adjacency derived from the corpus rescues
// it. This is not an adjacency failure. It is the founder's self-declared
// sector disagreeing with the corpus's classification of that same company's
// own award, and NO corpus-derived theme test can be right when those two
// disagree. It is left firing rather than tuned away, because the alternative
// is a floor moved until a number looked nice.
//
// ── OFFLINE, AND ON THE SAFE SIDE OF THE ANSWER-KEY LINE ─────────────────
// This module reads `public/data/instrument_terms.json`, the committed corpus
// snapshot, and nothing else. It names no answer-bearing source, it is imported
// only by scripts, and it is not reachable from `pipeline.ts` — so
// `check_answer_not_reachable.ts` is untouched by it. Callers pass the founder's
// won fund in from a TAPE when they are calibrating; the ruler itself has no
// idea such a thing exists.
import { readFileSync } from "fs";
import path from "path";

/** A candidate row as the model was shown it: `[i] title` and its indented
 *  block. Parsed once here because four scripts had four copies of this. */
export interface MenuRow { i: number; head: string; title: string; block: string }

export function menuRows(prompt: string): MenuRow[] {
  const start = prompt.indexOf("\nCANDIDATES\n");
  const body = start < 0 ? prompt : prompt.slice(start + 12);
  const out: MenuRow[] = [];
  let cur: MenuRow | null = null;
  const push = () => { if (cur) out.push(cur); cur = null; };
  for (const line of body.split("\n")) {
    const m = /^\[(\d+)\] /.exec(line);
    if (m) {
      push();
      cur = { i: Number(m[1]), head: line, title: line.slice(m[0].length).trim(), block: line };
    } else if (cur && line.startsWith("     ")) cur.block += `\n${line}`;
    else if (cur && !line.trim()) push();
  }
  push();
  return out;
}

/** The award median a row prints, in euro; null when the row prints none. */
export function awardMedian(block: string): number | null {
  const m = /typical award EUR ([\d.]+)([MkB]?)/.exec(block);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "B" ? n * 1e9 : m[2] === "M" ? n * 1e6 : m[2] === "k" ? n * 1e3 : n;
}

/** The bottom of the band the founder said they need, in euro. */
export const BAND_FLOOR: Record<string, number> = {
  b100k_500k: 100_000, b500k_2m5: 500_000, b2m5_15m: 2_500_000,
  b15m_50m: 15_000_000, gt50m: 50_000_000,
};

/**
 * The prompt's money disqualifier: "a scheme whose typical cheque is an order
 * of magnitude away from what this company needs".
 *
 * `null` when the row prints no median or the band is one this map does not
 * know — unknown, never a fault.
 *
 * ── THIS ONE IS THE PROMPT'S, AND IT IS STILL BADLY CALIBRATED ───────────
 * Checked against the same labelled set, one-sided at the band FLOOR over ten,
 * it disqualifies the fund the company actually won on 11.5% and 12.8% of
 * founders while cutting 18.3% and 18.9% of the menu. The reason is visible in
 * the distribution: the median won fund writes a typical cheque of 0.45x the
 * BOTTOM of the founder's band, and the 25th percentile is 0.19x. A public
 * grant is one component of a raise, not the raise, so being well under the
 * band is the NORMAL shape of a right answer rather than a category error.
 * Pushed to where it stops condemning the answer key — floor/100 — it cuts 1.0%
 * of the menu and is inert, exactly like the theme test.
 *
 * It is left at floor/10 and REPORTED rather than moved, because it is the
 * prompt's own sentence and the prompt is what a measurement of the prompt has
 * to grade. Any number quoted from it must be quoted with its 11.5% false rate.
 */
export function awardMismatch(
  median: number | null, band: string, divisor = 10,
): boolean | null {
  const floor = BAND_FLOOR[band];
  if (floor === undefined || median === null) return null;
  return median < floor / divisor;
}

// ── THE CORPUS SNAPSHOT ──────────────────────────────────────────────────

export interface SnapshotInstrument {
  id: string;
  name: string;
  sectorMix: Record<string, number> | null;
}

let snapshotCache: SnapshotInstrument[] | null = null;

/** The committed corpus snapshot. No database, no key, no network. */
export function snapshot(file?: string): SnapshotInstrument[] {
  if (snapshotCache && !file) return snapshotCache;
  const p = file ?? path.join(process.cwd(), "public", "data", "instrument_terms.json");
  const parsed = JSON.parse(readFileSync(p, "utf8")) as { records: SnapshotInstrument[] };
  if (!file) snapshotCache = parsed.records;
  return parsed.records;
}

const normalise = (s: string | null | undefined) =>
  String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * Which instruments a rendered candidate row is.
 *
 * The row prints `oneLine(row.instrument, ROW_TITLE_CHARS)` — the scheme name,
 * cut to 120 characters with a trailing ellipsis, and sometimes carrying a
 * disambiguating ` · ...` suffix the corpus name does not have. So the join is
 * by PREFIX in both directions rather than by equality, and it is checked: over
 * both paid tapes it resolves 2,946 of 2,948 and 2,951 of 2,953 candidate rows,
 * and it puts every one of the 936 `controlSix` fund ids at the shipped index
 * the tape says it was at. Siblings sharing one name resolve to several
 * instruments; callers decide what to do with that and `_wsib_ruler.ts`
 * requires ALL of them to fail before it calls a row a category error.
 */
export function titleIndex(corpus = snapshot()): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const r of corpus) {
    const k = normalise(r.name);
    const at = byName.get(k);
    if (at) at.push(r.id); else byName.set(k, [r.id]);
  }
  return byName;
}

export function resolveTitle(title: string, byName: Map<string, string[]>): string[] {
  const t = normalise(title);
  const core = t.endsWith("...") ? t.slice(0, -3) : t;
  const direct = byName.get(t);
  if (direct) return direct;
  const hits: string[] = [];
  for (const [name, ids] of byName) {
    if (name.startsWith(core) || core.startsWith(`${name} · `)) hits.push(...ids);
  }
  return hits;
}

// ── THE NEIGHBOURHOOD, DERIVED ───────────────────────────────────────────

/**
 * Which sectors are funded ALONGSIDE each sector more often than chance.
 *
 * For sectors `a` and `b`, take a random award in `a` from anywhere in the
 * corpus, then a random award from the SAME fund: `A[a][b]` is the chance that
 * second award is in `b`. Divide by `b`'s share of the whole corpus and you
 * have a lift. Above 1 means funds that pay `a` pay `b` more than the corpus
 * average does, which is the only sense in which this corpus can say two
 * sectors are near each other.
 *
 * ── Why lift and not the raw co-occurrence ───────────────────────────────
 * Every large fund pays every sector, so raw co-occurrence makes the biggest
 * sector everybody's neighbour and the relation says nothing. Dividing by the
 * base rate asks the question that has an answer: is this more than you would
 * see by chance.
 *
 * ── A property over any pair, including one that does not exist yet ───────
 * No pair is named here or in the test. The relation is computed from whatever
 * keys `sectorMix` holds, so a sector the taxonomy adds tomorrow gets its
 * neighbours from the same arithmetic on the day its first award lands.
 * `_ruler.test.ts` proves it on a synthetic corpus whose sector keys exist
 * nowhere in this repo.
 */
export function sectorNeighbourhood(
  corpus: Pick<SnapshotInstrument, "sectorMix">[] = snapshot(),
): Map<string, Set<string>> {
  const mixes = corpus.map((r) => r.sectorMix).filter((m): m is Record<string, number> =>
    Boolean(m) && Object.values(m!).reduce((a, b) => a + b, 0) > 0);
  const grand = new Map<string, number>();
  for (const m of mixes) {
    for (const [k, v] of Object.entries(m)) grand.set(k, (grand.get(k) ?? 0) + v);
  }
  const G = [...grand.values()].reduce((a, b) => a + b, 0);
  const out = new Map<string, Set<string>>();
  if (!G) return out;

  const A = new Map<string, Map<string, number>>();
  for (const m of mixes) {
    const total = Object.values(m).reduce((a, b) => a + b, 0);
    for (const [a, na] of Object.entries(m)) {
      const wa = na / (grand.get(a) ?? 1);
      const row = A.get(a) ?? new Map<string, number>();
      for (const [b, nb] of Object.entries(m)) row.set(b, (row.get(b) ?? 0) + wa * (nb / total));
      A.set(a, row);
    }
  }
  for (const [a, row] of A) {
    const near = new Set<string>([a]);
    for (const [b, v] of row) {
      if (b === a) continue;
      const base = (grand.get(b) ?? 0) / G;
      if (base > 0 && v / base > 1) near.add(b);
    }
    out.set(a, near);
  }
  return out;
}

/** What each sector holds of the whole corpus, for the rule-of-three bar. */
export function sectorBaseShares(
  corpus: Pick<SnapshotInstrument, "sectorMix">[] = snapshot(),
): Map<string, number> {
  const grand = new Map<string, number>();
  for (const r of corpus) {
    for (const [k, v] of Object.entries(r.sectorMix ?? {})) grand.set(k, (grand.get(k) ?? 0) + v);
  }
  const G = [...grand.values()].reduce((a, b) => a + b, 0);
  const out = new Map<string, number>();
  for (const [k, v] of grand) out.set(k, G ? v / G : 0);
  return out;
}

/** Everything the category-error test needs, computed once from the snapshot. */
export interface Neighbourhood {
  near: Map<string, Set<string>>;
  base: Map<string, number>;
}

export function neighbourhood(
  corpus: Pick<SnapshotInstrument, "sectorMix">[] = snapshot(),
): Neighbourhood {
  return { near: sectorNeighbourhood(corpus), base: sectorBaseShares(corpus) };
}

/**
 * Is this row a category error for a founder in `sector`?
 *
 *   true   the fund's history is long enough to speak and holds nothing in the
 *          founder's sector or any sector funded alongside it above chance
 *   false  it holds something
 *   null   CANNOT SAY — no mix on record, a sector this corpus never
 *          classifies, or a history too short for its silence to mean anything
 *
 * `null` is not `false` and no caller may collapse the two: "we have not
 * classified this fund's recipients" and "this fund does not fund you" are
 * different facts and only one of them is a reason to drop a row.
 */
export function categoryError(
  mix: Record<string, number> | null | undefined,
  sector: string | null | undefined,
  nb: Neighbourhood,
): boolean | null {
  if (!sector || !mix) return null;
  if (!nb.base.has(sector)) return null;
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const family = nb.near.get(sector) ?? new Set([sector]);
  let hit = 0;
  for (const [k, v] of Object.entries(mix)) if (family.has(k)) hit += v;
  if (hit > 0) return false;
  // Zero. The rule of three: with `total` awards and none in the family, the
  // 95% upper bound on the family's true share is 3/total. The silence only
  // counts if even that bound is below what the family holds corpus-wide.
  let base = 0;
  for (const k of family) base += nb.base.get(k) ?? 0;
  return 3 / total < base ? true : null;
}

// ── THE RETIRED TEST, KEPT ONLY TO REPRODUCE THE OLD NUMBERS ─────────────

/**
 * RETIRED. Strict string equality between the row's `mostly X` clause and the
 * founder's own sector label.
 *
 * Do not grade anything new on this. It exists so that `_wsib_ruler.ts` can
 * print the before and after side by side from ONE implementation, which is
 * the only way a claim that a measurement changed can be checked. Every number
 * this repo has published from it — the 48.4% / 48.0% pick-failure headline,
 * the 39.0% / 38.7% "even where rows are ample", the mean of 2.1 surviving
 * rows and the ten-of-twelve — is a number about this function and not about
 * fund selection.
 */
export function themeMismatch(
  block: string, founderLabel: string | undefined,
): boolean | null {
  const dm = /mostly ([^·\n]+)/.exec(block);
  if (!dm || !founderLabel) return null;
  return dm[1].trim() !== founderLabel;
}
