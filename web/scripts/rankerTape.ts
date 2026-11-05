// THE PER-CASE TAPE: what the ranker saw, what it did, and which lever moved it.
//
// ── The gap this closes ────────────────────────────────────────────────────
// `measure_recall.ts` wrote NOTHING per case. Every counter was a scalar, so
// when a case missed, the only way to learn why was to re-run and pay again --
// and then read a percentage that still could not say why. The pattern already
// exists twice in this repo and both are free: `_wscm_stages.ts:363` and
// `_wscw_dump.ts:176` each emit a per-case JSON tape for one Voyage embed and
// one Postgres read, no model calls. This is that pattern, generalised.
//
// ── Two things a scalar cannot carry ───────────────────────────────────────
//
// 1. ATTRIBUTION. Every result names the lever and its value. The architecture
//    is "improve precision by tweaking the levers around the model", and that
//    only works if "which lever moved it" is answerable from the RECORD rather
//    than from somebody's memory of what they had exported at the time. So the
//    lever manifest is computed once, hashed into an `arm`, printed on every
//    line, and written onto every case.
//
// 2. A FAILURE TAXONOMY, not a score. 71% tells you nothing you can act on. The
//    four miss classes below are distinguishable from the recorded ranks alone
//    -- the discipline `_wscm_stages.ts` established, where `cause` is assigned
//    from stage ranks rather than guessed by a heuristic -- and each one points
//    at a DIFFERENT lever. That is the whole point of having classes at all.
import { createHash } from "crypto";
import { writeFileSync } from "fs";

// ── THE FOUR LEVERS ─────────────────────────────────────────────────────────
// Fixed by the owner, and they are the axes of the whole programme: a founder
// types, code builds a subset, an LLM ranks it. Everything we can change is one
// of these four.
export const LEVERS = ["retrieval", "founder_answers", "fund_evidence", "instructions"] as const;
export type Lever = (typeof LEVERS)[number];
export type LeverManifest = Record<Lever, string>;

/** Which existing env knob belongs to which lever.
 *
 *  A MAP, not a closed register. `LEVER_<NAME>=` below lets a workstream that
 *  adds a knob declare it without editing this file -- because a fixed list
 *  goes stale silently, and a run whose treatment does not appear in its own
 *  arm is a run reporting the control's number under the treatment's name. That
 *  has happened here twice. The property this file enforces is: EVERY declared
 *  knob appears in the arm. The map is a convenience over the knobs that exist
 *  today, not the definition of what a lever is. */
const KNOWN: Record<Lever, readonly string[]> = {
  // What the code put in front of the model at all.
  retrieval: ["SET", "POOL_LEAVES_PER_CHANNEL", "SUPPRESS_IDS_FILE", "COUNTRY", "POP"],
  // What the founder told us. `founderPolicyFromEnv` owns these; listed here so
  // the arm shows them beside the others rather than in a separate disclosure.
  founder_answers: ["ANSWERS", "REGION", "CONSORTIUM", "IDENTITY", "OWN_HISTORY",
    "CAPITAL", "DESCRIBED"],
  // What each candidate fund looks like to the model. wsDM owns the contents;
  // this is the slot its knob lands in.
  fund_evidence: ["EVIDENCE"],
  // What the model is told to do. wsDL/wsDM own the prompt; this records which
  // version ran.
  instructions: ["INSTRUCTIONS", "PROMPT"],
};

/** The arm, read from the environment.
 *
 *  `LEVER_RETRIEVAL=`, `LEVER_FOUNDER_ANSWERS=`, `LEVER_FUND_EVIDENCE=` and
 *  `LEVER_INSTRUCTIONS=` are the escape hatch: any knob not in the map above
 *  can be declared through them and will appear in the arm. Use them for a new
 *  lever value rather than leaving it undeclared -- an undeclared treatment is
 *  indistinguishable from the control in the record. */
export function leversFromEnv(env: NodeJS.ProcessEnv = process.env): LeverManifest {
  const out = {} as LeverManifest;
  for (const lever of LEVERS) {
    const parts: string[] = [];
    for (const k of KNOWN[lever]) if (env[k]) parts.push(`${k}=${env[k]}`);
    const declared = env[`LEVER_${lever.toUpperCase()}`];
    if (declared) parts.push(declared);
    out[lever] = parts.length ? parts.join(",") : "default";
  }
  return out;
}

/** Eight hex characters over the manifest. Short enough to sit on every log
 *  line, long enough that two arms never collide in one session's worth of
 *  runs, and stable across processes so two runs of the same arm compare. */
export function armId(m: LeverManifest): string {
  return createHash("sha256").update(LEVERS.map((l) => `${l}=${m[l]}`).join("|"))
    .digest("hex").slice(0, 8);
}

/** The arm as a person reads it. Printed WITH the number, never separately:
 *  a figure pasted out of a terminal has to carry the arm that produced it, or
 *  the next reader cannot tell which lever they are looking at the effect of. */
export function armLine(m: LeverManifest): string {
  const moved = LEVERS.filter((l) => m[l] !== "default");
  return `arm=${armId(m)}  ` + LEVERS.map((l) => `${l}:${m[l]}`).join("  ") +
    (moved.length ? `   <- ${moved.length} lever(s) off default: ${moved.join(", ")}`
      : "   <- ALL LEVERS AT DEFAULT (this is a control run)");
}

// ── THE FAILURE TAXONOMY ────────────────────────────────────────────────────
//
// "Was the won fund shown, ranked low, lost to a plausible sibling, or in the
// wrong family" -- four different products with four different fixes, which one
// percentage cannot tell apart. Each class is decided from RECORDED ranks, not
// from a heuristic, and each names the lever to reach for first.
export type Outcome =
  /** The won fund is in the published rows. Nothing to attribute. */
  | "hit"
  /** It never entered the candidate set. The model was never given the chance
   *  to be right, so no amount of prompt work can reach this case.
   *  LEVER: retrieval. */
  | "not-retrieved"
  /** It was in the set; the rows contain a sibling from its own regime. The
   *  model got the FAMILY right and the leaf wrong -- which is what happens when
   *  siblings are indistinguishable on the evidence we show.
   *  LEVER: fund_evidence. */
  | "lost-to-sibling"
  /** It was in the set; the rows share its channel but not its regime. The
   *  model was in the right neighbourhood and ordered it down.
   *  LEVER: instructions. */
  | "shown-ranked-low"
  /** It was in the set; the rows share neither regime nor channel. The model
   *  went somewhere else entirely, which is what happens when it does not know
   *  enough about who this founder is to exclude the wrong neighbourhood.
   *  LEVER: founder_answers. */
  | "wrong-family";

/** The lever each miss class points at first. A DEFAULT, not a verdict: the
 *  point of naming one is that the next run has somewhere to start, and that
 *  the record says which lever was tried when it does not work. */
export const LEVER_FOR: Record<Outcome, Lever | null> = {
  "hit": null,
  "not-retrieved": "retrieval",
  "lost-to-sibling": "fund_evidence",
  "shown-ranked-low": "instructions",
  "wrong-family": "founder_answers",
};

/** Classify one case from what was recorded. No heuristics, no thresholds:
 *  every branch is a fact about the ids that were on the page. */
export function classify(input: {
  want: string;
  wantRegime: string;
  wantChannel: string;
  /** The candidate ids AS THE MODEL SAW THEM. */
  candidates: readonly string[];
  /** The published rows, in order. */
  published: readonly string[];
  regimeOf: (id: string) => string;
  channelOf: (id: string) => string;
}): Outcome {
  const { want, wantRegime, wantChannel, candidates, published, regimeOf, channelOf } = input;
  if (published.includes(want)) return "hit";
  if (!candidates.includes(want)) return "not-retrieved";
  if (published.some((id) => regimeOf(id) === wantRegime)) return "lost-to-sibling";
  if (wantChannel && published.some((id) => channelOf(id) === wantChannel)) return "shown-ranked-low";
  return "wrong-family";
}

/** ONE CASE, as written to the tape.
 *
 *  Everything the debug loop needs, so that a miss is diagnosable WITHOUT
 *  re-running: the candidate ids as the model saw them, its picks, its stated
 *  uncertainty, anything it retrieved, the rank of the won fund at each stage,
 *  and the founder context that built the prompt. */
export interface TapeCase {
  /** Stable across runs and across arms, so two tapes join on it. This is also
   *  what `CASE=` matches, so a miss you can see is a miss you can re-run. */
  caseId: string;
  company: string;
  /** The lever manifest this case ran under. On EVERY case and not only in the
   *  header: tapes get concatenated, filtered and re-sorted, and a case that
   *  has been separated from its header is a case with no arm. */
  arm: string;
  levers: LeverManifest;

  /** ── The founder context that built the prompt ─────────────────────────── */
  founder: {
    country: string;
    sector: string | null;
    mode: string;
    /** The verbatim text the query was built from. This is the INPUT, not the
     *  answer key -- but the tape is written outside lib/, exactly where every
     *  other harness artefact lives, so `check_answer_not_reachable` is
     *  untouched by construction rather than by exemption. */
    description: string | null;
    descriptionSource: string | null;
    /** Every intake field the replay actually supplied, so "the founder
     *  answered X" is checkable rather than assumed. */
    supplied: Record<string, unknown>;
  };

  /** ── What the ranker saw and did ───────────────────────────────────────── */
  /** The candidate ids in the order the model was given them. */
  candidates: string[];
  /** The published rows, in order. When an LLM ranks, these are its picks. */
  published: string[];
  /** The regime and channel of each published row, positionally.
   *
   *  Denormalised ON PURPOSE. Without these, re-deriving the failure class off
   *  a tape needs a live corpus, which means the offline replay is not offline
   *  and a "free" re-score quietly requires Postgres and a hydrated register.
   *  Two short string arrays per case buy a tape that is self-contained. */
  publishedRegime: string[];
  publishedChannel: string[];
  /** Whatever the model said about its own confidence, verbatim. `null` until a
   *  ranker that states one is wired in -- recorded as null rather than omitted
   *  so a tape from before that day is distinguishable from a silent model. */
  uncertainty: string | null;
  /** Anything retrieved for this case: evidence ids, snippets, peer ids. Shape
   *  is the caller's; the tape does not interpret it. */
  retrieved: unknown;

  /** ── Where the won fund sat, stage by stage ────────────────────────────── */
  want: string;
  wantRegime: string;
  wantChannel: string;
  ranks: {
    /** Position in the candidate set, 1-based. `null` = never retrieved. */
    pool: number | null;
    /** After the score comparator. */
    sorted: number | null;
    /** After the display-name collapse. */
    collapsed: number | null;
    /** Rank in the FINAL table order -- where the founder sees it, or where
     *  they would if the table ran that long. The graded window is the first
     *  five, so `published: 7` is a miss that says exactly how near a miss. */
    published: number | null;
  };

  /** ── The verdict ───────────────────────────────────────────────────────── */
  outcome: Outcome;
  /** The lever to reach for first. Recorded so the NEXT run's arm can be read
   *  against what this run said to try. */
  lever: Lever | null;
  /** Whether this case's model reply came from the cache. A tape that cannot
   *  say this is a tape that cannot tell a replayed arm from a fresh one. */
  cached: boolean | null;
}

/** One line per real miss, in the register a person reads. The format is fixed
 *  here rather than at each call site so two harnesses print the same shape and
 *  a grep across tapes works. */
export function taxonomyLine(c: TapeCase): string {
  const r = c.ranks;
  return `  ${c.outcome.padEnd(16)} ${c.company.slice(0, 28).padEnd(28)} ` +
    `want=${c.want} pool=${r.pool ?? "-"} sorted=${r.sorted ?? "-"} published=${r.published ?? "-"} ` +
    `of ${c.candidates.length} candidates   lever: ${c.lever ?? "none"}   arm=${c.arm}`;
}

/** The taxonomy as counts, ordered so the classes a change can actually reach
 *  are read first. `not-retrieved` heads the list on purpose: no prompt work
 *  reaches those cases, and a run that spends its effort on instructions while
 *  a third of its misses were never retrieved has been aimed at the wrong
 *  lever. */
export function taxonomyTable(cases: readonly TapeCase[]): string[] {
  const order: Outcome[] = ["hit", "not-retrieved", "lost-to-sibling",
    "shown-ranked-low", "wrong-family"];
  const n = Math.max(1, cases.length);
  return order.map((o) => {
    const g = cases.filter((c) => c.outcome === o);
    return `  ${o.padEnd(16)} ${String(g.length).padStart(4)}/${cases.length}` +
      ` (${(100 * g.length / n).toFixed(0)}%)   lever: ${LEVER_FOR[o] ?? "-"}`;
  });
}

/** Write the tape. `OUT=` names the file; without it nothing is written and the
 *  run says so, because a harness that silently wrote nothing is the defect
 *  this module exists to fix. */
export function writeTape(cases: readonly TapeCase[], dest?: string): void {
  const out = dest ?? process.env.OUT;
  if (!out) {
    console.log(`\nno OUT= given, so NO PER-CASE TAPE WAS WRITTEN. Every miss above is ` +
      `a number you would have to pay to re-run to diagnose. Set OUT=/tmp/x.json.`);
    return;
  }
  writeFileSync(out, JSON.stringify(cases));
  console.log(`\nper-case tape -> ${out}  (${cases.length} case(s))`);
}
