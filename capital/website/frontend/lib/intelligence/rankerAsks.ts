// wsEJ — THE TURN WHERE THE STAGE THAT PICKS ASKS THE FOUNDER SOMETHING.
//
// ── The architecture this closes ──────────────────────────────────────────
// The owner's shape is four steps: a fixed screen, a subset the ranker is
// handed, QUESTIONS THE RANKER WRITES AFTER LOOKING AT THAT SUBSET, and then
// the ranking over both rounds. Step three did not exist. Screen two's
// questions are written by a separate planner, before anything has looked at
// the candidates, on behalf of a reader it cannot see. wsDT re-aimed that
// planner at what a ranker would want and the aim is right; it is still a
// different component guessing on the ranker's behalf.
//
// The evidence that the ranker itself can do better is already paid for. Read
// for this question, wsDS's 79,252 thinking tokens have the model stating its
// own predicament in its own words on eight of twelve companies — that it is
// filling seats from rows it has already disqualified, that three options are
// all it believes in when it must name six, that the real fit is probably
// outside the list. A model that can say that can name what would resolve it.
// It has never been given the turn.
//
// ── WHY THE MODEL DOES NOT CHOOSE THE SUBJECT ─────────────────────────────
// The owner's constraint on this module is narrow and it is the whole design:
// a question is licensed by being a requirement the candidate funds themselves
// impose, whose value we do not hold, and whose answer would change which
// funds get named. Not by being interesting, and not by the model feeling
// unsure. So the SUBJECT of every question is computed here, for free, before
// any model sees anything:
//
//   LEG 1 — IMPOSED. The demand is a `filter` gate on a candidate actually in
//     front of this founder, carrying that fund's own requirement text and a
//     locator. Test for a fund nobody has seen: the demand resolves to an
//     (instrument, gate, requirement) triple in the corpus, or it does not
//     exist. No gate, no question.
//
//   LEG 2 — UNKNOWN. The intake field the gate is encoded against holds no
//     answer for this founder. Test: `evaluateSpec` returns null for it today,
//     which is the same predicate the verdict engine uses to decide it cannot
//     judge — so "we already hold this" and "the answer would not be read"
//     cannot drift apart.
//
//   LEG 3 — DECISIVE, and this is the leg that cuts. Every admissible answer
//     is simulated against the whole candidate list through `assessAll`, the
//     same model-free engine that produces the qualification line the ranker
//     reads. The demand survives only if two admissible answers produce
//     DIFFERENT qualification bands somewhere in the decision window. If every
//     answer leaves every candidate exactly where it was, the question cannot
//     change the outcome and is waste, however open the rule is.
//
// Leg 3 is a counterfactual over this founder's own answers, so it works on a
// fund, a field and a comparator nobody here has looked at. It is not a list of
// question shapes that are allowed.
//
// ── WHAT IS LEFT FOR THE MODEL, AND WHY IT IS NOT A ROUNDING ERROR ────────
// The one judgement no simulation can make: whether the founder can answer.
// Measured, twice, and it is the way this fails. wsDT asked a freight-software
// company a properly grounded question and got back the word for what they
// sell — correct, and the wrong fund still held rank 1. A robotics company
// answered with the thing it builds and nothing moved. Separately, topic
// separates 98% of look-alike funds and founders cannot articulate topic. So
// the model's job is to take the demands that WOULD decide and keep only the
// ones a founder could actually answer, in words the founder already uses —
// and to return none when none survive.
//
// ── LEAKS ─────────────────────────────────────────────────────────────────
// Nothing here reads `instrument_profiles`. The demands come from
// `eligibility_gates` through `corpus.ts`, which is what a fund DEMANDS: no
// beneficiary, no award and no project title exists in that table by
// construction, so no question written from it can be written from the answer.
// The candidate lines carry the same scope sentence the ranker's own rows
// carry, through the same `fundsSentence` budget.
//
// THE COMPANY NAME IS NOT SENT. The owner's call on the ranker's prompt, for a
// pretraining-recall leak our guards structurally cannot see, and it holds here
// for the same reason: this prompt is the ranker's list.
//
// ── OFF BY DEFAULT ────────────────────────────────────────────────────────
// `RANKER_ASKS` is read once at module scope and throws on anything
// unrecognised, exactly as `AGENT_SELECT` is, and for the same reason: a flag
// that reads a typo as its default reports the control's behaviour under the
// treatment's name.
import Anthropic from "@anthropic-ai/sdk";

import { AGENT_SELECT_ARM, depthLever } from "./caps";
import { assembleInstructions } from "./contracts";
import { loadDbInstruments, type DbGate, type DbInstrument } from "./corpus";
import { recordUsage } from "./cost";
import { doorLabelFor } from "./doorLabel";
// `isFilter` and `specField` stood here as byte-identical copies of the pair in
// verdict.ts, under the local name `isFilterGate`. Two definitions of "may this
// gate decide a verdict" is the shape of defect that produced a third one in
// Python; both now come from the leaf.
import { isFilter, specField } from "./evidenceTier";
import { fundsSentence, oneLine, ROW_TITLE_CHARS } from "./schemeText";
import { FIELD_ENUM_HINTS, type EligibilityAnswers } from "./types";
import { declaw, fence } from "./untrusted";
import { assessAll, type VerdictStatus } from "./verdict";
import {
  checkAskedQuestions, RANKER_ASK_PREFIX,
  type AskedQuestion, type OfferedDemand,
} from "./rankerAskChecks";

/** The arms. `off` is the default and does nothing at all. */
const ARMS = ["off", "on"] as const;
export type RankerAsksArm = (typeof ARMS)[number];
export const RANKER_ASKS: RankerAsksArm = (() => {
  const raw = process.env.RANKER_ASKS ?? "off";
  if (!(ARMS as readonly string[]).includes(raw)) {
    throw new Error(
      `RANKER_ASKS must be one of ${ARMS.join("|")}, got "${raw}". It is read ` +
      `once at module scope precisely so a typo cannot read as "off".`);
  }
  return raw as RankerAsksArm;
})();
export const rankerAsksEnabled = (): boolean => RANKER_ASKS !== "off";

// ── THE TWO STAGES ARE ONE ARM, AND THE CELL WHERE THEY DISAGREE IS SHUT ───
//
// This module exists to ask questions ON BEHALF OF the stage that picks. With
// `AGENT_SELECT=off` that stage does not exist: our own code ranks, the answers
// reach the gates and the arithmetic scorers, and the model that was supposed
// to read them was never in the seat. The run then reports a number for
// "ranker-asks" that is a measurement of the deterministic ranker being given
// six extra answers — a real effect, and not the one whose name is on it.
//
// It is not a new lever. It is the removal of a combination that could only
// ever produce a mislabelled result, and it fires AT IMPORT rather than at the
// end of a paid run: the asker calls Anthropic once per founder, so discovering
// this after the fact costs the whole run.
//
// Shaped exactly like the funnel invariant at the bottom of `caps.ts`, and for
// the same reason: the check that would otherwise catch it runs in its own
// process with its own environment, so it grades the defaults while a swept
// flag grades something else. `AGENT_SELECT_ARM` is read from `caps.ts`, which
// imports nothing — asking "is the ranker on" must not drag the Anthropic
// client and the corpus layer in behind one word of environment.
//
// `dry` and `reverse` are deliberately NOT refused. Neither puts a model in the
// ranking seat, so neither is a coherent product configuration either — but
// `dry` is how the combined arm's prompt is priced before a euro is spent, and
// `reverse` is how the pool's order is shown to reach the memo. Both are
// diagnostics whose output nobody can mistake for a ranking result, and
// refusing them would close the one route by which this arm gets read for free.
if (RANKER_ASKS !== "off" && AGENT_SELECT_ARM === "off") {
  throw new Error(
    `RANKER_ASKS is "${RANKER_ASKS}" and AGENT_SELECT is "off". This stage writes ` +
    `questions for the stage that picks, and that stage is not running: the answers ` +
    `would reach the eligibility gates and the arithmetic scorers, and no model would ` +
    `ever read them. The result would be a measurement of the deterministic ranker ` +
    `published under the ranker-asks name. Set AGENT_SELECT to an arm that ranks, or ` +
    `leave RANKER_ASKS off.`);
}

/**
 * How far down the candidate list a change has to reach to count as decisive.
 *
 * A qualification band that moves on the 90th candidate changes nothing a
 * founder will ever see: six rows are published and the pool the writer draws
 * from is far shorter than the ranked list. So leg 3 is asked inside a window
 * rather than over the whole list, and the window is deliberately wider than
 * the published table — a row promoted INTO the table is exactly the case the
 * question exists to find.
 *
 * ── VALIDATED, NOT `Number(...)` (wsEK, resolving wsEI against wsEJ) ───────
 * This and the two caps below were written as `Number(process.env.X ?? n)`
 * while wsEI was removing the last three of those from caps.ts, and they are
 * the same defect: `Number("eighteen")` is `NaN`, and `slice(0, NaN)` is the
 * EMPTY ARRAY rather than an error. A mistyped window would hand this stage no
 * candidates, no demands and a prompt reading "ask at most NaN questions",
 * and the run would report "the ranker had nothing to ask" — a finding about
 * the typo wearing the arm's name. `depthLever` reads once at module scope and
 * throws, so the typo fails at import instead. Defaults are unchanged.
 */
export const ASK_WINDOW = depthLever("RANKER_ASK_WINDOW", 18);

/** How many questions may reach the founder. Enforced in code, because a
 *  budget a model may round up is not a budget — the same argument the
 *  adaptive round's own cap is enforced by.
 *
 *  Floors at 1, not 0: `RANKER_ASKS=off` is how this stage is told to ask
 *  nothing, and it costs nothing to do it. A cap of 0 would pay for the call
 *  and discard every question it bought. */
export const RANKER_ASK_CAP = depthLever("RANKER_ASK_CAP", 4);

/** How many demands the model is shown. A prompt that lists every decisive
 *  demand on a hundred candidates buries the ones that matter, which is the
 *  failure the free selector already demonstrated with requirement text. */
export const DEMAND_CAP = depthLever("RANKER_ASK_DEMANDS", 10);

const MODEL = process.env.RANKER_ASK_MODEL ?? "claude-sonnet-5";

/** Built lazily. ES imports are hoisted, so a module-scope client captures the
 *  environment BEFORE a harness body calls `loadEnvLocal()` and every call
 *  fails authentication while the run reports the control's numbers. */
let clientMemo: Anthropic | null = null;
const anthropic = (): Anthropic => (clientMemo ??= new Anthropic());

/** One candidate as this stage renders it. */
export interface AskCandidate {
  instrumentId: string;
  name: string;
  country: string;
  capitalType: string;
  /** What the scheme says it FUNDS, through the row's own budget. */
  funds: string;
  /** Where it sits on the ranked list, 1-based. */
  rank: number;
}

/** What one admissible answer would do to the candidate list. */
export interface DemandSplit {
  /** The intake value simulated. */
  value: string;
  /** Candidate ids whose qualification band this answer IMPROVES. */
  opens: string[];
  /** Candidate ids whose qualification band this answer WORSENS. */
  closes: string[];
}

/**
 * A requirement that survived all three legs.
 *
 * `requirement` is verbatim and is the grounding: the question is written FROM
 * it and it is what a reader can be shown afterwards. It is never an option —
 * a phrase lifted out of an administrative text is not something a founder
 * would say about their own business.
 */
export interface SeparatingDemand {
  /** Stable reference the model must carry back. */
  ref: string;
  /**
   * The intake field whose value is missing, and the UNIT of this whole list.
   *
   * One demand per field, not per sentence. The first version of this keyed on
   * the requirement text, and on a shortlist of eighteen national grants it
   * produced ten demands that were one question: a dozen schemes each write
   * their own wording for the same condition, and the founder answers the field
   * once. A list that offers the same question ten times crowds out every other
   * fork on the page, which is the failure it was built to avoid.
   */
  field: string;
  /** The highest-ranked candidate's own wording, verbatim. The citation. */
  requirement: string;
  instrumentId: string;
  instrumentName: string;
  gateKey: string;
  locator?: string;
  /** How many candidates in the window impose this, and two more of their own
   *  wordings — so a reader can see it is a shared condition rather than one
   *  scheme's quirk without being shown twelve near-identical sentences. */
  carriers: number;
  alsoWorded: { instrumentName: string; requirement: string }[];
  /** Every admissible answer that moves at least one candidate. LEG 3. */
  splits: DemandSplit[];
  /** Candidates this demand moves, best-ranked first. */
  moves: { instrumentId: string; name: string; rank: number }[];
  /**
   * SEPARATING or merely NARROWING, and the distinction is the point of RA-5.
   *
   * `narrowing` means every admissible answer moves the candidates the same
   * way: some answers remove funds, none promotes one past another. It changes
   * the set that gets named, so it passes leg 3, and it can never tell the
   * founder which of two open funds is theirs.
   *
   * `separating` means two answers disagree about the ORDER: one answer lifts a
   * candidate the other drops, so the two answers send this founder to
   * different funds rather than to fewer of the same ones.
   */
  kind: "separating" | "narrowing";
  /** Ranking key: how many candidates move, weighted by how high the best of
   *  them sits, and doubled where the demand actually separates. A fork at the
   *  top of the list is the question an analyst asks; a fork at the bottom is
   *  one nobody would act on. */
  score: number;
}

const answered = (v: unknown): boolean =>
  v != null && v !== "" && v !== "unsure" && !(Array.isArray(v) && v.length === 0);


/** Every value the interface could actually record for a field. A field with
 *  no fixed answer set has none, and a question whose answer the product
 *  cannot store is a question whose answer cannot decide anything. */
function admissibleValues(
  field: string, answers: EligibilityAnswers | undefined,
): string[] {
  const hint = FIELD_ENUM_HINTS[field];
  if (!hint) return [];
  const opts = hint.optionsFor ? hint.optionsFor(answers ?? {}) : hint.options;
  return opts.map((o) => o.value).filter(Boolean);
}

/** Rank of a status on the published order. Lower is better; `verdict.ts`
 *  owns the scale and this reads it rather than restating it. */
const BAND: Record<VerdictStatus, number> = {
  open: 0, one_blocker: 1, unknown: 2, blocked: 3,
};

/**
 * THE THREE LEGS, over the candidates actually in front of this founder.
 *
 * Pure, model-free and free of IO beyond the corpus already in memory: the
 * simulation is `assessAll` over hydrated gates, which the pool has already
 * loaded. So this can be read, printed and judged without spending anything,
 * which is the point — a question surface nobody has looked at is how every
 * prompt defect in this repo has shipped.
 *
 * @param rankedIds candidate instrument ids, best first, as the ranker holds
 *                  them.
 */
export function separatingDemands(
  rankedIds: string[],
  answers: EligibilityAnswers | undefined,
  opts: { window?: number; limit?: number } = {},
): SeparatingDemand[] {
  const window = opts.window ?? ASK_WINDOW;
  const limit = opts.limit ?? DEMAND_CAP;
  const inWindow = rankedIds.slice(0, window);
  if (inWindow.length < 2) return [];

  const rankOf = new Map(inWindow.map((id, i) => [id, i + 1]));
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const shortlist = inWindow
    .map((id) => byId.get(id))
    .filter((i): i is DbInstrument => Boolean(i));
  if (shortlist.length < 2) return [];

  // LEG 1 and LEG 2 together: filter gates on real candidates whose field the
  // founder has not answered.
  //
  // KEYED ON THE FIELD, not on the sentence. A founder answers a field once, so
  // every candidate's wording of the same condition is one question. Keyed the
  // other way this produced ten demands on one national shortlist that were one
  // question in twelve different phrasings, and they crowded out every other
  // fork on the page.
  interface Acc {
    field: string; requirement: string; inst: DbInstrument; gate: DbGate;
    carriers: Set<string>;
    alsoWorded: { instrumentName: string; requirement: string }[];
  }
  const acc = new Map<string, Acc>();
  for (const inst of shortlist) {
    for (const gate of inst.gates) {
      if (!isFilter(gate)) continue;
      const field = specField(gate);
      if (!field) continue;
      if (answered((answers as Record<string, unknown> | undefined)?.[field])) continue;
      const req = gate.requirement?.trim();
      if (!req) continue;
      // A field the interface cannot offer an answer for cannot be asked.
      if (!admissibleValues(field, answers).length) continue;
      const prev = acc.get(field);
      if (!prev) {
        acc.set(field, {
          field, requirement: req, inst, gate,
          carriers: new Set([inst.id]), alsoWorded: [],
        });
        continue;
      }
      prev.carriers.add(inst.id);
      if ((rankOf.get(inst.id) ?? 999) < (rankOf.get(prev.inst.id) ?? 999)) {
        // A better-ranked carrier becomes the anchor, and the old anchor's own
        // wording is kept as a second phrasing rather than discarded.
        if (prev.alsoWorded.length < 2) {
          prev.alsoWorded.push({
            instrumentName: doorLabelFor(prev.inst), requirement: prev.requirement,
          });
        }
        prev.requirement = req; prev.inst = inst; prev.gate = gate;
      } else if (prev.alsoWorded.length < 2
        && prev.requirement.toLowerCase() !== req.toLowerCase()) {
        prev.alsoWorded.push({ instrumentName: doorLabelFor(inst), requirement: req });
      }
    }
  }
  if (!acc.size) return [];

  // LEG 3. One simulation per (field, value), shared by every demand on that
  // field: the counterfactual is a property of the ANSWER, not of the sentence
  // that motivated the question.
  const base = assessAll(inWindow, answers);
  const baseBand = new Map<string, number>();
  for (const id of inWindow) baseBand.set(id, BAND[base.get(id)?.status ?? "unknown"]);

  const simulated = new Map<string, {
    splits: DemandSplit[]; states: number; separating: boolean;
  }>();
  const fieldsInPlay = [...new Set([...acc.values()].map((a) => a.field))];
  for (const field of fieldsInPlay) {
    const hint = FIELD_ENUM_HINTS[field];
    const splits: DemandSplit[] = [];
    /** Band vector per admissible answer, for the separating test below. */
    const vectors: number[][] = [];
    // Every admissible answer's resulting band vector, INCLUDING the ones that
    // change nothing. Counting only the answers that move something would call
    // a field decisive when every answer moves the list the same way — which is
    // a fact we could apply ourselves rather than a question worth a slot.
    const states = new Set<string>();
    for (const value of admissibleValues(field, answers)) {
      const trial = {
        ...(answers ?? {}),
        [field]: hint?.multi ? [value] : value,
      } as EligibilityAnswers;
      const after = assessAll(inWindow, trial);
      const opens: string[] = [];
      const closes: string[] = [];
      const vector: number[] = [];
      for (const id of inWindow) {
        const b = BAND[after.get(id)?.status ?? "unknown"];
        const was = baseBand.get(id) ?? BAND.unknown;
        vector.push(b);
        if (b < was) opens.push(id);
        else if (b > was) closes.push(id);
      }
      states.add(vector.join(""));
      vectors.push(vector);
      if (opens.length || closes.length) splits.push({ value, opens, closes });
    }
    // ── SEPARATING versus merely NARROWING ─────────────────────────────────
    // Two answers SEPARATE when they disagree about the order of two
    // candidates: answer a leaves x better placed than y while answer b leaves
    // y better placed than x. Everything else narrows — it removes funds, and
    // whoever is left is left in the same order they were already in.
    //
    // Stated as a pairwise inversion rather than as a list of field names, so
    // it holds for a field, a comparator and a fund nobody has looked at.
    let separating = false;
    outer:
    for (let a = 0; a < vectors.length && !separating; a++) {
      for (let b = a + 1; b < vectors.length; b++) {
        for (let x = 0; x < inWindow.length; x++) {
          for (let y = x + 1; y < inWindow.length; y++) {
            const da = Math.sign(vectors[a][x] - vectors[a][y]);
            const db = Math.sign(vectors[b][x] - vectors[b][y]);
            if (da !== 0 && db !== 0 && da !== db) { separating = true; break outer; }
          }
        }
      }
    }
    simulated.set(field, { splits, states: states.size, separating });
  }

  const out: SeparatingDemand[] = [];
  for (const a of acc.values()) {
    const sim = simulated.get(a.field);
    // THE CUT. Two admissible answers must leave the candidate list in
    // DIFFERENT states, and at least one of them must differ from where it
    // stands now. A field whose every answer produces one outcome decides
    // nothing a founder needs to be asked; a field no answer moves decides
    // nothing at all.
    if (!sim || sim.states < 2 || !sim.splits.length) continue;
    const movedIds = [...new Set(sim.splits.flatMap((s) => [...s.opens, ...s.closes]))];
    if (!movedIds.length) continue;
    const splits = sim.splits;
    const moves = movedIds
      .map((id) => ({
        instrumentId: id,
        name: byId.get(id) ? doorLabelFor(byId.get(id)!) : id,
        rank: rankOf.get(id) ?? 999,
      }))
      .sort((x, y) => x.rank - y.rank);
    out.push({
      ref: `${RANKER_ASK_PREFIX}${a.field}`,
      field: a.field,
      requirement: a.requirement,
      instrumentId: a.inst.id,
      instrumentName: doorLabelFor(a.inst),
      gateKey: a.gate.gateFamily ?? a.gate.id,
      locator: a.gate.source?.locator,
      carriers: a.carriers.size,
      alsoWorded: a.alsoWorded,
      splits,
      moves,
      kind: sim.separating ? "separating" : "narrowing",
      // A demand that reorders is worth more than one that only removes, and
      // the weight says so rather than leaving it to a sentence in the prompt.
      score: (sim.separating ? 2 : 1) * moves.length / (1 + (moves[0]?.rank ?? 999)),
    });
  }
  // A field whose fact is ALREADY an option on another field's question does not
  // earn a second slot. `coveredBy` is the corpus's own declaration of that
  // overlap and `openFieldsForShortlist` already honours it; without it a
  // shortlist of ordinary national grants offers the same fact twice, once as a
  // polar question and once as an item on a checklist, and the founder answers
  // it twice. Applied after the score so the covering question is the one kept.
  const survivors = new Set(out.map((d) => d.field));
  const deduped = out.filter((d) => {
    const covered = FIELD_ENUM_HINTS[d.field]?.coveredBy;
    return !covered || !survivors.has(covered);
  });
  return deduped.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** The candidate lines, from the same corpus rows the ranker will read. */
export function askCandidates(rankedIds: string[], window = ASK_WINDOW): AskCandidate[] {
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  return rankedIds.slice(0, window).flatMap((id, i) => {
    const inst = byId.get(id);
    if (!inst) return [];
    return [{
      instrumentId: id,
      name: oneLine(doorLabelFor(inst), ROW_TITLE_CHARS),
      country: inst.country,
      capitalType: inst.capitalType,
      funds: fundsSentence(inst.description),
      rank: i + 1,
    }];
  });
}

/**
 * A demand as the CHECKS see it: the grounding, plus the menu index numbers the
 * simulation said it moves.
 *
 * The indices are computed once, here, from the same candidate list the prompt
 * renders — so "the index the model was shown" and "the index the check accepts"
 * are one derivation rather than two that agree today.
 */
export function offeredDemands(
  demands: SeparatingDemand[], candidates: AskCandidate[],
): OfferedDemand[] {
  const idx = new Map(candidates.map((c) => [c.instrumentId, c.rank - 1]));
  return demands.map((d) => ({
    ref: d.ref,
    field: d.field,
    requirement: d.requirement,
    instrumentId: d.instrumentId,
    instrumentName: d.instrumentName,
    gateKey: d.gateKey,
    locator: d.locator,
    moves: d.moves.map((m) => idx.get(m.instrumentId))
      .filter((i): i is number => i !== undefined),
  }));
}

/**
 * EXPORTED FOR DIAGNOSTICS, and for one reason: what a model is told has to be
 * readable for free, before a euro is spent. Every prompt defect this repo has
 * found was found by reading the real bytes rather than a reconstruction, and a
 * diagnostic that rebuilds the prompt prices a different stage.
 *
 * Pure. Makes no call.
 */
export function buildAskPrompt(
  candidates: AskCandidate[],
  demands: SeparatingDemand[],
  ctx: {
    country?: string; sector?: string; description?: string;
    answers?: string[]; eligibility?: EligibilityAnswers;
  },
): string {
  const nameOf = new Map(candidates.map((c) => [c.instrumentId, `[${c.rank - 1}]`]));
  const menu = candidates.map((c) => [
    `[${c.rank - 1}] ${c.name}`,
    `     ${[c.country, c.capitalType].filter(Boolean).join(" · ")}`,
    c.funds ? `     funds: ${c.funds}` : "",
  ].filter(Boolean).join("\n")).join("\n");

  const demandBlock = demands.map((d) => {
    const moved = d.moves
      .map((m) => `${nameOf.get(m.instrumentId) ?? "?"} ${m.name}`)
      .join(", ");
    const ways = d.splits.slice(0, 6).map((s) => {
      const o = s.opens.map((id) => nameOf.get(id) ?? "?").join(" ");
      const c = s.closes.map((id) => nameOf.get(id) ?? "?").join(" ");
      return `       if the answer is ${s.value}: ` +
        [o ? `${o} come(s) into play` : "", c ? `${c} drop(s) out` : ""]
          .filter(Boolean).join("; ");
    }).join("\n");
    const hint = FIELD_ENUM_HINTS[d.field];
    const opts = hint
      ? (hint.optionsFor ? hint.optionsFor(ctx.eligibility ?? {}) : hint.options)
      : [];
    return `  ref "${d.ref}" — ${d.kind === "separating"
      ? "SEPARATES: two answers send this founder to different candidates"
      : "NARROWS ONLY: answers remove candidates, none is promoted past another"}\n` +
      `    ${nameOf.get(d.instrumentId) ?? ""} ${d.instrumentName} requires, ` +
      `verbatim: "${oneLine(d.requirement, 300)}"\n` +
      (d.carriers > 1
        ? `    ${d.carriers} of the candidates impose it, in their own wordings` +
          (d.alsoWorded.length
            ? `, among them:\n` + d.alsoWorded
              .map((w) => `       ${w.instrumentName}: "${oneLine(w.requirement, 220)}"`)
              .join("\n") + "\n"
            : "\n")
        : "") +
      `    we do not hold this about them, and it moves: ${moved}\n${ways}\n` +
      `    the answers the interface can record${hint?.multi ? " (multi-select)" : ""}, ` +
      `which you must cover exactly:\n` +
      opts.map((o) => `       value "${o.value}" — currently labelled: ${o.label}`).join("\n");
  }).join("\n\n");

  const told = (ctx.answers ?? []).map((a) => `  ${a}`).join("\n");

  return `You are about to choose which public funding schemes this company is told to
apply to, from the list below. Before you choose, you may ask the founder up to
${RANKER_ASK_CAP} questions. You may also ask nothing.

THE COMPANY
  country: ${ctx.country ?? "unknown"}
  sector: ${ctx.sector ?? "unknown"}

WHAT THEY HAVE ALREADY TOLD US. Never ask any of this again.
${told || "  (they have not answered the intake yet)"}

WHAT THEY SAY THEY DO
${ctx.description ? fence("description", declaw(ctx.description).text) : "(no description on file)"}

THE CANDIDATES, best first, in the order you will judge them
${menu}

WHAT IS BLOCKING YOU, COMPUTED RATHER THAN GUESSED
Each entry below is a requirement one of these candidates imposes, in that
candidate's own words, whose value we do not hold for this founder, and which
has been simulated against every answer the interface can record. Only the ones
that MOVE a candidate are here, and what they move is stated. You cannot ask
about anything else, because nothing else can change your answer.

${demandBlock || "  (nothing open would change your answer)"}

HOW TO CHOOSE WHAT TO ASK
  * the only judgement left to you is whether the founder can answer. Everything
    above would change the outcome; that is settled. What is not settled is
    whether a founder, asked this about their own company, would say something
    that lands on one side of the line rather than the other
  * test each one: could this founder have said the answer about their own
    business, unprompted, before they had ever heard of a funding scheme? If
    answering needs a document open, or needs them to know how a scheme sorts
    companies into its own categories, they cannot, and their confident wrong
    answer is worse for them than silence
  * prefer the demand whose answers send them to DIFFERENT candidates over the
    one whose answers open or shut the same candidate
  * write the question in the words they already use about their business. The
    requirement tells you what to ask about; it never gives you the words
  * never name a scheme in a question, and never ask them which of these to
    pursue. That is your decision, made afterwards, with their answer in hand
  * ${RANKER_ASK_CAP} is a ceiling and not a quota. Ask fewer when fewer are
    answerable. Return an empty list when none are, and that is a real answer

  * you write the question AND the wording of every answer, but not the answer
    SPACE. Each demand lists the values the interface can record; write one
    option per value, carrying that exact value, covering all of them, inventing
    none. A question and its options are one thing, so they must answer each
    other: if the options are a list of situations, ask which applies

Reply with ONLY this JSON, no preamble and no code fence. "ref" is copied
exactly from a demand above. "moves" lists the candidate index numbers that
demand named. Each option carries one of that demand's exact values and a label
written for this founder.
{"questions":[{"ref":"","question":"","options":[{"value":"","label":""}],"moves":[0]}]}`;
}

const textOf = (m: Anthropic.Message): string => m.content
  .filter((b): b is Anthropic.TextBlock => b.type === "text")
  .map((b) => b.text).join("\n");

function parseJson<T>(raw: string): T | null {
  for (const src of [raw.replace(/```(?:json)?/gi, ""), raw]) {
    const s = src.indexOf("{"), e = src.lastIndexOf("}");
    if (s < 0 || e <= s) continue;
    try { return JSON.parse(src.slice(s, e + 1)) as T; } catch { /* keep trying */ }
  }
  return null;
}

/** Per-run counters, so a measurement can say what happened rather than assume
 *  the stage ran. A run where every call failed would otherwise look like a
 *  model that had nothing to ask. */
const tally = {
  calls: 0, ok: 0, failed: 0, emptyReply: 0, badJson: 0,
  askedNothing: 0, questions: 0, dropped: 0, eur: 0,
};
export function resetRankerAskTally(): void {
  tally.calls = 0; tally.ok = 0; tally.failed = 0; tally.emptyReply = 0;
  tally.badJson = 0; tally.askedNothing = 0; tally.questions = 0;
  tally.dropped = 0; tally.eur = 0;
}
export function rankerAskTallyLine(): string {
  if (!tally.calls) return `ranker-asks: arm=${RANKER_ASKS}, no calls made`;
  return `ranker-asks: arm=${RANKER_ASKS} model=${MODEL} cap=${RANKER_ASK_CAP} — ` +
    `${tally.ok}/${tally.calls} replied, ${tally.failed} failed ` +
    `(${tally.emptyReply} empty, ${tally.badJson} unparseable), ` +
    `${tally.askedNothing} asked NOTHING, ${tally.questions} question(s) published, ` +
    `${tally.dropped} dropped by the checks, ` +
    `EUR ${tally.eur.toFixed(4)} total, EUR ${(tally.eur / tally.calls).toFixed(4)} per brief`;
}

/**
 * The ranker's question turn. ONE call.
 *
 * Returns [] on every failure path and whenever nothing survives, so a caller
 * that cannot reach a model shows the founder the screen it would have shown
 * anyway. Returning [] is also a legitimate ANSWER — the model declining to ask
 * is the outcome this stage most has to be able to express.
 */
export async function askForRanker(
  rankedIds: string[],
  answers: EligibilityAnswers | undefined,
  ctx: { country?: string; sector?: string; description?: string; answers?: string[] },
): Promise<AskedQuestion[]> {
  if (RANKER_ASKS === "off") return [];
  const demands = separatingDemands(rankedIds, answers);
  if (!demands.length) return [];
  const candidates = askCandidates(rankedIds);
  if (candidates.length < 2) return [];

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        // No minItems/maxItems: an Anthropic structured-output schema returns
        // a 400 for either on an array, and the cap is enforced below anyway.
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            ref: { type: "string" },
            question: { type: "string" },
            options: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: { value: { type: "string" }, label: { type: "string" } },
                required: ["value", "label"],
              },
            },
            moves: { type: "array", items: { type: "integer" } },
          },
          required: ["ref", "question", "options", "moves"],
        },
      },
    },
    required: ["questions"],
  } as const;

  tally.calls++;
  try {
    const res = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 2400,
      // Off, deliberately. The reply is a handful of short questions, and at a
      // small max_tokens an adaptive budget spends the whole allowance thinking
      // and returns no text block at all — which reads downstream as a model
      // with nothing to ask and silently publishes the control.
      thinking: { type: "disabled" },
      system: assembleInstructions("asker"),
      output_config: { format: { type: "json_schema", schema } },
      messages: [{
        role: "user",
        content: buildAskPrompt(candidates, demands, { ...ctx, eligibility: answers }),
      }],
    }, { timeout: 60_000, maxRetries: 1 });
    recordUsage(res.model ?? MODEL, res.usage as never);
    const { costOf } = await import("./cost");
    tally.eur += costOf(res.model ?? MODEL, res.usage as never);

    const body = textOf(res);
    const parsed = parseJson<{ questions?: unknown }>(body);
    if (!parsed) {
      if (!body.trim()) tally.emptyReply++; else tally.badJson++;
      tally.failed++;
      return [];
    }
    tally.ok++;
    const { kept, violations } = checkAskedQuestions(
      Array.isArray(parsed.questions) ? parsed.questions : [],
      offeredDemands(demands, candidates), candidates, RANKER_ASK_CAP, answers);
    tally.dropped += violations.length;
    tally.questions += kept.length;
    if (!kept.length) tally.askedNothing++;
    return kept;
  } catch (err) {
    tally.failed++;
    console.error("[rankerAsks] the call failed, asking nothing:", String(err));
    return [];
  }
}
