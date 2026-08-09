// wsCM — WHERE in the stack a row loses its seat, recorded rather than argued.
//
// Bucket 3 of the wsCI autopsy ("ranked below five, lost on score") is 41.5% of
// the loss, and its name asserts something nobody had checked: that the SCORE
// is what put the won leaf below rank five. The row sort in shortlist.ts has
// two BOOLEAN tiers above the score and two reorder passes below it, so "lost
// on score" was a hypothesis wearing the label of a measurement.
//
// This module is the observation. It records the candidate order at each stage
// of `materialiseInstrumentTable`, plus the three facts that decide the sort,
// and it decides NOTHING:
//
//   * off unless a caller calls `traceOn()`. There is no env var and no
//     request field, so no production path can turn it on by accident and no
//     founder can ever be served by a traced request.
//   * every writer is a no-op while off, so the shipped path allocates
//     nothing and branches once per stage.
//   * nothing here is read by shortlist.ts. A trace that fed back into the
//     order would be a second ranker, which is the failure mode this file
//     exists to detect in the first one.
//
// The stages are named for the code that produces them, not for what they are
// believed to do — `sorted` is the output of the row comparator, `collapsed` of
// the display-name collision, `final` of peer precedence. If those three are
// identical on a founder, the score really did decide; where they differ, the
// difference IS the answer to "what decides the final five".

/** One snapshot of the candidate order: instrument ids, rank order, unsliced. */
export interface TableStage {
  /** The code that produced it: `sorted`, `collapsed`, `final`. */
  name: string;
  ids: string[];
}

/** The three quantities the row comparator consults, per row, in its order of
 *  precedence. Recorded so a demotion can be attributed to the tier that
 *  caused it rather than to the score that happens to sit underneath. */
export interface RowFacts {
  id: string;
  channel: string;
  /** Tier 1 of the comparator. A CHANNEL-level boolean: true when the founder
   *  or one of their peers has drawn on this channel. Sits above the score, so
   *  a row with none of it cannot outrank one that has it however well it
   *  scores. */
  usedInField: boolean;
  /** Tier 2. Also channel-level: capital a startup cannot take, unless the
   *  founder said they are consortium-ready. */
  fitDemoted: boolean;
  /** Tier 3, and the only continuous one. */
  relevance: number;
  /** The key peer precedence dedupes the visible order on. */
  schemeCode: string;
}

/** Which branch of `applyPeerPrecedence` this request took. It is the single
 *  most consequential fork in the stack and nothing outside the function could
 *  see it: with a description that discriminates, the score keeps the first
 *  THREE seats and the peer prior fills behind; without one, the score keeps
 *  ONE and the peer prior fills the other four. */
let peerBranch: "specific" | "flat" | "none" = "none";

/** How many leading seats the SCORE kept in this table.
 *
 *  Fixed on every shipped arm — 1 on the flat branch, 3 on the specific one —
 *  and a function of the table under `PEER_FILL=confident`. Recorded because a
 *  null result on that arm has two completely different readings: the seat
 *  count moved and the page did not care, or the seat count never moved at all.
 *  Without this the two are indistinguishable, and the second is the shape of
 *  every false null in this project's history.
 *
 *  -1 means peer precedence did not run for this founder (no prior, or a table
 *  too short), which is not the same as it running and awarding zero seats. */
let scoreSeatsHeld = -1;

let active = false;
let stages: TableStage[] = [];
let facts: RowFacts[] = [];

/** Arm the recorder. Deliberately a function call and not an env var: a
 *  diagnostic that can be switched on by the environment is one a deploy can
 *  switch on. */
export function traceOn(): void {
  active = true;
}

export function traceReset(): void {
  stages = [];
  facts = [];
  peerBranch = "none";
  scoreSeatsHeld = -1;
}

export function recordPeerBranch(b: "specific" | "flat" | "none"): void {
  if (active) peerBranch = b;
}

export function recordScoreSeats(n: number): void {
  if (active) scoreSeatsHeld = n;
}

export function recordStage(name: string, ids: string[]): void {
  if (active) stages.push({ name, ids: [...ids] });
}

export function recordFacts(f: RowFacts[]): void {
  if (active) facts = f;
}

export function readTrace(): {
  stages: TableStage[]; facts: RowFacts[]; peerBranch: "specific" | "flat" | "none";
  scoreSeats: number;
} {
  return { stages, facts, peerBranch, scoreSeats: scoreSeatsHeld };
}
