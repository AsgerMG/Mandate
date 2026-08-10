// GATE 2 — choose the five specific funds, out of the ~58 gate 1 hands over.
//
// ── NOT ON THE REQUEST PATH. Read the prompts here as lab apparatus ───────
// `selectFiveFunds` is imported by scripts/measure_pipeline.ts and by nothing
// in lib/ or app/. The fund order a founder actually receives is a
// deterministic score; no model reorders it at request time.
//
// contracts/selection/fund-selection.md used to be declared UNROUTED on
// exactly that ground. It no longer is: `agentSelect.ts` is the selection
// prompt the excuse was waiting for, and the contract is now routed to it via
// PROMPTS.selector. The rules there describe THAT stage. This module is still
// lab apparatus, and its prompts are still lab apparatus, so do not read the
// strings below as the shipped selection instructions.
//
// ── What this module is, and what the measurement forced it to become ──────
// The old gate 2 scored 35% against gate 1's own deterministic 50% on the same
// 40 cases. The diagnosis was that it was choosing BLIND, not badly: it saw
// `name`, `administering_body`, `channel`, `country` and four truncated
// requirement strings, and none of those separate siblings (across 35 sibling
// groups of >=3, country differs in 0.4% of sibling pairs and capital_type in
// 6.2%). So this module was built to fix that — the fields that pin a fund on
// every row, the menu grouped so siblings sit side by side, questions spent
// only on axes computed to discriminate, and every reply parsed as JSON.
//
// All of it was built, and all of it was measured, N=40, same strided cases,
// gate1@32f28f2, claude-haiku-4-5:
//
//   gate 1's own deterministic five           20/40 (50%)  38/40 regime
//   legacy gate 2, as shipped                 14/40 (35%)  37/40
//   + JSON parsing, id-paired Q/A only        13/40 (33%)  31/40
//   + pinning fields, family-grouped menu,
//     axis-driven questions                   12/40 (30%)  35/40
//   + answer confined to gate 1's families
//     and their slot counts                   15/40 (38%)  38/40
//   VETO ONLY, enforced in code               20/40 (50%)  38/40
//
// The information hypothesis is WRONG, and this is the finding to carry
// forward. Giving the model award_p50, capital type, the delivery body, the
// within-family sector share and a menu where the siblings are adjacent did
// not make it choose better — it scored 30%, below the 35% it managed knowing
// none of that. Constraining it to gate 1's own families recovered most of the
// loss (38%) and still did not reach parity. Only removing its permission to
// choose reaches gate 1, and then it exactly ties.
//
// A deterministic check confirms it from the other side: no threshold on the
// within-family sector posterior — the signal that ranks the right sibling
// first 43.6% of the time inside a known group — beats gate 1's own ordering
// on these cases (every variant scored 19 or 20 out of 40). Gate 1 already
// reads sector_mix. There is no unexploited signal here for gate 2 to find.
//
// So the default is `vetoOnly`: gate 1's order stands, the model may strike a
// fund out on a stated requirement the founder plainly fails, and the refill
// comes from gate 1 itself. On this fixture it issued real vetoes on 16 of 40
// cases and rescued zero while breaking zero — net neutral, which is what a
// floor looks like when the interview has nothing to say. That last part is
// the caveat that matters: 33 of these 40 companies carry no description at
// all, so the founder simulator answers "not sure" and there is nothing for a
// veto to bite on. The veto's upside is untested here, not disproven.
//
// What DID land, unambiguously, are the two correctness bugs. The old picks
// parser read `match(/\d+/g)` out of prose that began with a preamble 93% of
// the time, so 40% of runs shipped FEWER THAN FIVE FUNDS; and the question
// list captured a markdown header as question 1 in 58% of runs, shifting every
// Q/A pair so 35% of cases fed the selector answers paired with the wrong
// questions. Both are gone: every reply is JSON, every answer carries its
// question's id, and the measured runs report 0 short shortlists and 0
// malformed replies.
import type Anthropic from "@anthropic-ai/sdk";
import {
  computeAxes, renderAxes, familySectorShare, eur, type AxisFund,
} from "./shortlistAxes";

export interface SelectionInput {
  country: string;
  sector?: string | null;
  description?: string | null;
  /** The candidate set, in gate 1's order. Index in this array is the id the
   *  model answers with, so the caller can map a pick straight back. */
  subset: AxisFund[];
  /** Gate 1's own deterministic five, by id. Used for the family ordering and
   *  as the refill when the model under-delivers. */
  baselineTop5: string[];
}

export interface SelectionResult {
  picks: AxisFund[];
  questions: { id: number; axis: string; q: string }[];
  answers: Map<number, string>;
  /** Slots the model failed to fill and that were refilled from gate 1's
   *  order. Non-zero is the bug §0.1 used to hide; it should stay at 0. */
  refilled: number;
  /** A model reply that had to be re-requested. */
  retries: number;
}

const text = (r: unknown): string =>
  ((r as { content?: { type?: string; text?: string }[] }).content ?? [])
    .filter((b) => b?.type === "text").map((b) => b.text ?? "").join("\n");

/** Pull the one JSON value out of a reply that may be fenced, prefaced, or
 *  trailed. Returns null rather than throwing so the caller can retry once —
 *  the whole point of this module is that a malformed reply is handled, not
 *  silently degraded into three funds. */
function parseJson<T>(raw: string): T | null {
  const candidates = [raw.replace(/```(?:json)?/gi, ""), raw];
  for (const src of candidates) {
    const s = src.indexOf("{"), e = src.lastIndexOf("}");
    if (s < 0 || e <= s) continue;
    try { return JSON.parse(src.slice(s, e + 1)) as T; } catch { /* fall through */ }
    // The outermost braces did not parse — the reply probably has prose with a
    // brace in it, or a second object after the first. Take the first balanced
    // object instead of giving up, so one stray character does not cost a case.
    let depth = 0;
    for (let i = s; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) {
        try { return JSON.parse(src.slice(s, i + 1)) as T; } catch { /* fall through */ }
        break;
      }
    }
  }
  return null;
}

/** One model call that must come back as JSON. Retries ONCE with the failure
 *  quoted back, then gives up and lets the caller fall back. max_tokens is
 *  never below 2048: at small budgets the model spends the whole allowance on
 *  thinking and returns an empty content block, which reads downstream as a
 *  scoring failure rather than as the truncation it is. */
async function askJson<T>(
  client: Anthropic, model: string, prompt: string,
  valid: (v: T) => boolean, maxTokens = 2048,
): Promise<{ value: T | null; retries: number }> {
  let retries = 0;
  let partial: T | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await client.messages.create({
      model, max_tokens: maxTokens,
      messages: [{
        role: "user",
        content: attempt === 0 ? prompt
          : `${prompt}\n\nYour previous reply was not valid JSON of the required shape. Reply with the JSON object and nothing else — no preamble, no code fence, no commentary.`,
      }],
    });
    const v = parseJson<T>(text(r));
    if (v && valid(v)) return { value: v, retries };
    // Parsed but short of the contract — four picks instead of five, say. Keep
    // it: four real choices topped up from gate 1's order beat discarding the
    // reply and falling back to gate 1 entirely.
    if (v) partial = v;
    retries++;
  }
  return { value: partial, retries };
}

/** A scheme title, on one line and short enough to read. Some of the German
 *  and French legal titles run past 250 characters with embedded newlines, and
 *  a menu of those is unreadable for a model as well as for a person. */
function title(name: string): string {
  const t = String(name).replace(/\s+/g, " ").trim();
  return t.length > 130 ? `${t.slice(0, 127)}...` : t;
}

/** Requirements that are NOT shared with most of the shortlist.
 *
 * 66% of candidate rows share their entire `requires:` block byte-for-byte
 * with a sibling: the two largest gate keys in the corpus are
 * `framework_undertaking_in_difficulty` and `framework_excluded_activity`, at
 * 584 instruments each, and "Tobacco, gambling and betting, and weapons and
 * munitions are outside the scope" alone appeared on 2,316 of 4,626 rendered
 * candidate rows. Printing it 58 times spends a third of the prompt telling
 * the model something identical about every option — which is the definition
 * of an uninformative feature, and it crowds out the facts that do separate.
 */
function distinctiveRequirements(subset: AxisFund[]): (f: AxisFund) => string[] {
  const seen = new Map<string, number>();
  for (const f of subset) for (const g of f.gates ?? []) seen.set(g, (seen.get(g) ?? 0) + 1);
  const cutoff = Math.max(2, Math.ceil(subset.length * 0.35));
  return (f) => (f.gates ?? []).filter((g) => (seen.get(g) ?? 0) < cutoff).slice(0, 2);
}

/** One candidate row, carrying the facts that actually pin a fund inside its
 *  own family. Everything on it was measured to separate siblings; nothing on
 *  it is here because it looked informative. */
function renderRow(
  i: number, f: AxisFund, sector: string | null | undefined,
  share: ReturnType<typeof familySectorShare>,
  requirements: string[], evidence?: string[],
): string {
  const facts: string[] = [];
  if (f.body) facts.push(f.body);
  if (f.awardP50 != null && (f.awardN ?? 0) >= 5) {
    facts.push(`typical award ${eur(f.awardP50)}`
      + (f.awardP25 != null && f.awardP75 != null ? ` (middle half ${eur(f.awardP25)}-${eur(f.awardP75)})` : "")
      + ` over ${f.awardN} real awards`);
  } else facts.push("no reliable award median");
  if (f.capitalType && f.capitalType !== "grant") facts.push(f.capitalType);
  if (f.lastYear) facts.push(`last awarded ${f.lastYear}`);
  const s = share.get(f.id);
  if (s && sector) {
    facts.push(`${(100 * s.share).toFixed(0)}% of this family's ${sector} awards (${s.rank} of ${s.of} siblings)`);
  }
  return [
    `[${i}] ${title(f.name)}`,
    `     ${facts.join(" · ")}`,
    // WHAT IT FUNDS, above the requirements, because it is the only line on the
    // row about the fund's subject and the requirements are overwhelmingly
    // about who is barred. Measured before it was added, over the 80-case
    // fixture: of the sibling pairs whose rows otherwise say substantively the
    // same thing, this line separates 83%. Nothing else measured did — the
    // eligibility clauses, the application quote and the signals digest each
    // separated none of them, and the whole `eligibility_text` column separated
    // fewer at seven times the cost.
    //
    // Already budgeted by `fundsSentence()`; deliberately NOT re-truncated
    // here, so there is one number and one place it is decided.
    f.funds ? `     what it funds, in the scheme's own words: ${f.funds}` : "",
    requirements.length ? `     specific to it: ${requirements.join(" / ").slice(0, 240)}` : "",
    evidence?.length ? `     bears on their answers: ${evidence.join(" | ")}` : "",
  ].filter(Boolean).join("\n");
}

/** The candidate set as the model reads it: grouped into programme families,
 *  families in gate 1's order, siblings side by side so the comparison the
 *  product actually needs is the one on the page. */
export function renderMenu(
  input: SelectionInput, evidence?: Map<string, string[]>,
): string {
  const { subset, sector } = input;
  // Index labels are the SUBSET positions, so a pick maps straight back to a
  // fund no matter how the families are ordered on the page.
  const share = familySectorShare(subset, sector);
  const distinctive = distinctiveRequirements(subset);
  const fams = new Map<string, { i: number; f: AxisFund }[]>();
  subset.forEach((f, i) => {
    const k = f.regime || f.id;
    (fams.get(k) ?? fams.set(k, []).get(k)!).push({ i, f });
  });
  const top5Fams = new Set(input.baselineTop5
    .map((id) => subset.find((f) => f.id === id)?.regime ?? id));

  return [...fams.entries()]
    .sort((a, b) => Math.min(...a[1].map((x) => x.i)) - Math.min(...b[1].map((x) => x.i)))
    .map(([key, members]) => {
      const best = Math.min(...members.map((m) => m.i));
      const meds = members.map((m) => m.f.awardP50).filter((v): v is number => v != null && v > 0);
      const bodies = new Set(members.map((m) => m.f.body).filter(Boolean));
      const head = `── FAMILY ${key} — ${members.length} candidate${members.length === 1 ? "" : "s"}`
        + `, best gate-1 rank #${best + 1}${top5Fams.has(key) ? " (IN GATE 1'S FIVE)" : ""}`;
      const differ = members.length > 1 ? `   siblings differ on: `
        + [meds.length > 1 ? `cheque ${eur(Math.min(...meds))}-${eur(Math.max(...meds))}` : "",
           bodies.size > 1 ? `${bodies.size} different delivery bodies` : ""]
          .filter(Boolean).join(" · ") : "";
      return [head, differ, ...members
        .sort((a, b) => a.i - b.i)
        .map((m) => renderRow(m.i, m.f, sector, share, distinctive(m.f), evidence?.get(m.f.id)))]
        .filter(Boolean).join("\n");
    }).join("\n\n");
}

/** The shipped prompts, rendered against the flat menu, with JSON output and
 *  id-paired answers and NOTHING else changed. This exists so the two parser
 *  bugs can be measured on their own: a gain under `legacyPrompts` is the bugs,
 *  a gain without it is the rebuild. */
export interface LegacyPrompts { menu: string }

/** STAGE 1 — the questions, spent only on axes the candidates disagree about. */
export async function writeQuestions(
  client: Anthropic, model: string, input: SelectionInput, legacy?: LegacyPrompts,
): Promise<{ questions: SelectionResult["questions"]; retries: number }> {
  if (legacy) {
    const { value, retries } = await askJson<{ questions: { id: number; q: string }[] }>(
      client, model,
`Below are ${input.subset.length} public funding schemes. They overlap heavily and many look alike on paper.

Write the 6-8 questions you would ask a company to work out WHICH of these actually fit it. The best question is one where different schemes here demand different answers; a question they all answer the same way tells you nothing.

SCHEMES
${legacy.menu}

Reply with ONLY this JSON, no preamble and no code fence:
{"questions":[{"id":1,"q":"<the question>"}]}`,
      (v) => Array.isArray(v?.questions) && v.questions.length > 0
        && v.questions.every((q) => typeof q?.q === "string" && q.q.length > 8));
    return {
      questions: (value?.questions ?? []).slice(0, 8).map((q, i) => ({
        id: Number.isFinite(q.id) ? q.id : i + 1, axis: "", q: String(q.q),
      })),
      retries,
    };
  }
  const axes = computeAxes(input.subset, input.sector);
  const prompt =
`A founder is choosing between ${input.subset.length} public funding schemes that overlap heavily. Write the questions that would actually tell them apart.

These are the axes on which THESE candidates genuinely differ, computed from the corpus. The score is coverage x how much the candidates disagree; HIGH means an answer splits the list, LOW means they nearly all answer the same way.

${renderAxes(axes, 10)}

ALREADY KNOWN — never ask about these: the company is in ${input.country} and its sector is ${input.sector ?? "unknown"}.

Rules:
- Only spend a question on an axis marked HIGH or MEDIUM. A LOW axis cannot separate anything here.
- Make it concrete FROM THE SPLIT SHOWN. If the cheque sizes split at EUR 200k and EUR 1M, ask "under EUR 200k, EUR 200k-1M, or over EUR 1M?" — never "what is your budget?".
- Never ask about a universal exclusion (undertaking in difficulty, tobacco/gambling/weapons, high-risk network equipment). Every scheme carries them identically.
- Offer explicit options wherever the split gives you them, so the answer is usable.
- At most one question per axis. Four to six questions total.

Reply with ONLY this JSON, no preamble and no code fence:
{"questions":[{"id":1,"axis":"<axis key>","q":"<the question>"}]}`;

  const { value, retries } = await askJson<{ questions: { id: number; axis: string; q: string }[] }>(
    client, model, prompt,
    (v) => Array.isArray(v?.questions) && v.questions.length > 0
      && v.questions.every((q) => typeof q?.q === "string" && q.q.length > 8));
  const questions = (value?.questions ?? []).slice(0, 6)
    .map((q, i) => ({ id: Number.isFinite(q.id) ? q.id : i + 1, axis: String(q.axis ?? ""), q: String(q.q) }));
  return { questions, retries };
}

/** STAGE 2 — the founder answers. Answers carry the QUESTION'S id, so a
 *  dropped line cannot shift every pair by one the way positional zipping did. */
export async function answerAsFounder(
  client: Anthropic, model: string, input: SelectionInput,
  questions: SelectionResult["questions"],
): Promise<{ answers: Map<number, string>; retries: number }> {
  if (!questions.length) return { answers: new Map(), retries: 0 };
  const prompt =
`You are this company's founder. Answer each question briefly and honestly.

YOUR COMPANY
  country: ${input.country}
  sector: ${input.sector ?? "unknown"}
  what you do: ${input.description || "(no description on file)"}

QUESTIONS
${questions.map((q) => `${q.id}. ${q.q}`).join("\n")}

Answer every question, using the SAME id. Where the options are given, pick one. If you genuinely cannot tell from what you know about the company, answer "not sure" — do not invent a fact.

Reply with ONLY this JSON, no preamble and no code fence:
{"answers":[{"id":1,"a":"<your answer>"}]}`;

  const { value, retries } = await askJson<{ answers: { id: number; a: string }[] }>(
    client, model, prompt,
    (v) => Array.isArray(v?.answers) && v.answers.length > 0);
  const answers = new Map<number, string>();
  for (const a of value?.answers ?? []) {
    if (Number.isFinite(a?.id) && typeof a?.a === "string") answers.set(Number(a.id), a.a);
  }
  return { answers, retries };
}

/** STAGE 3 — the five. */
export async function pickFive(
  client: Anthropic, model: string, input: SelectionInput,
  questions: SelectionResult["questions"], answers: Map<number, string>,
  evidence?: Map<string, string[]>, legacy?: LegacyPrompts,
): Promise<{ picks: number[]; retries: number }> {
  const qa = questions.length
    ? questions.map((q) => `Q: ${q.q}\nA: ${answers.get(q.id) ?? "not sure"}`).join("\n")
    : "(no interview was run)";
  const n0 = input.subset.length;
  if (legacy) {
    const { value, retries } = await askJson<{ picks: number[] }>(
      client, model,
`Pick the FIVE schemes this company should actually pursue.

COMPANY
  country: ${input.country}
  sector: ${input.sector ?? "unknown"}
  what they do: ${input.description || "(no description)"}

WHAT THEY TOLD US
${qa}

SCHEMES
${legacy.menu}

The list is ALREADY ORDERED by how often companies like this one have actually won each scheme. That ordering is empirical and strong — it is your starting point.

Refine it, do not rebuild it:
- Move a scheme DOWN when their answers show they fail its stated requirement.
- Move a scheme UP when their answers speak directly to what it demands.
- If their answers say nothing about a scheme, leave its position alone.
- Where two are equally good, prefer spread across EU / national / regional.

Reply with ONLY this JSON, no preamble and no code fence. Five DISTINCT index numbers, best first:
{"picks":[0,0,0,0,0]}`,
      (v) => Array.isArray(v?.picks)
        && new Set(v.picks.filter((i) => Number.isInteger(i) && i >= 0 && i < n0)).size >= 5);
    return {
      picks: [...new Set((value?.picks ?? [])
        .filter((i) => Number.isInteger(i) && i >= 0 && i < n0))].slice(0, 5),
      retries,
    };
  }
  const prompt =
`Name the FIVE specific funds this company should actually apply to. The specific scheme — not the agency, not the programme family.

COMPANY
  country: ${input.country}
  sector: ${input.sector ?? "unknown"}
  what they do: ${input.description || "(no description on file)"}

WHAT THEY TOLD US
${qa}

HOW TO READ THE LIST
The candidates are grouped into programme families and the families are in an empirical order built from 628,000 real award pairs. Measured on held-out companies, the family that actually paid out is in the first five rows 95% of the time — and the specific fund only 50% of the time. The family order is nearly always right; the leaf inside it is a coin flip.

So spend your judgement INSIDE the leading families, not across them. Choosing a different sibling from a family near the top is usually the right move. Reaching for a family far down the list, or for a big well-known programme because it is well known, is usually the wrong one.

Each row carries what actually separates siblings:
  * the scheme's own title — often the single most specific thing on the page
  * typical award — the median cheque THIS fund has really written, and over how many awards
  * the delivery body, and how recently it last paid out
  * its share of everything its family has paid into this company's sector

Choose the fund whose title, cheque size and track record match what this company is doing and how much it needs. A fund whose typical cheque is an order of magnitude off what they asked for is the wrong fund even if everything else fits.

CANDIDATES
${renderMenu(input, evidence)}

Reply with ONLY this JSON, no preamble and no code fence. Five DISTINCT index numbers taken from the list above, best first:
{"picks":[0,0,0,0,0]}`;

  const n = input.subset.length;
  const { value, retries } = await askJson<{ picks: number[] }>(
    client, model, prompt,
    (v) => Array.isArray(v?.picks)
      && new Set(v.picks.filter((i) => Number.isInteger(i) && i >= 0 && i < n)).size >= 5,
    2048);
  const picks = [...new Set((value?.picks ?? [])
    .filter((i) => Number.isInteger(i) && i >= 0 && i < n))].slice(0, 5);
  return { picks, retries };
}

/**
 * STAGE 3, the bounded form — keep gate 1's five FAMILIES and their per-family
 * quota, and only choose which leaf fills each slot.
 *
 * The constraint itself is free. On the strided holdout the family of the fund
 * that actually won is inside gate 1's top five in 38 of the 38 cases where it
 * is reachable at all, so confining the answer to those families cannot cost a
 * case — while the leaf inside them is wrong half the time and is pure
 * headroom. It also removes, by construction, the drift that made the old gate
 * 2 worse than doing nothing: it cannot reach for a famous programme from far
 * down the list.
 *
 * MEASURED 15/40 (38%) against gate 1's 20/40, regime 38/40. So it recovers
 * most of the loss the free re-rank inflicts — regime accuracy returns to gate
 * 1's level exactly, which is the constraint doing its job — and still does
 * not reach parity. The leaf choice is the thing the model cannot do, and
 * handing it nothing but that choice does not make it able to.
 *
 * Kept because it is the right frame if a real founder description ever
 * arrives (embedding retrieval alone reaches 79.4% top-5 with one, against
 * 17.2% with the canned template), and because the family/quota contract is
 * what a live product would want to hold. Not the default: see vetoOnly.
 */
export async function pickWithinFamilies(
  client: Anthropic, model: string, input: SelectionInput,
  questions: SelectionResult["questions"], answers: Map<number, string>,
  evidence?: Map<string, string[]>,
): Promise<{ picks: number[]; retries: number }> {
  const { subset, sector } = input;
  const idx = new Map(subset.map((f, i) => [f.id, i]));
  const share = familySectorShare(subset, sector);
  const distinctive = distinctiveRequirements(subset);

  // Gate 1's five, collapsed to families with the quota each one earned.
  const quota = new Map<string, number>();
  for (const id of input.baselineTop5) {
    const f = subset.find((x) => x.id === id);
    if (!f) continue;
    const k = f.regime || f.id;
    quota.set(k, (quota.get(k) ?? 0) + 1);
  }
  if (!quota.size) return pickFive(client, model, input, questions, answers, evidence);

  const allowed = new Set<number>();
  const blocks = [...quota.entries()].map(([fam, q], order) => {
    const members = subset.map((f, i) => ({ i, f }))
      .filter(({ f }) => (f.regime || f.id) === fam);
    for (const m of members) allowed.add(m.i);
    const chosen = input.baselineTop5.filter((id) => (subset.find((x) => x.id === id)?.regime
      ?? id) === fam).map((id) => idx.get(id)).filter((i): i is number => i != null);
    return `── FAMILY ${order + 1}: ${fam} — fill ${q} slot${q === 1 ? "" : "s"} from here.`
      + `\n   gate 1's own choice${chosen.length === 1 ? " was" : "s were"}: ${chosen.map((i) => `[${i}]`).join(", ")}`
      + `\n${members.map(({ i, f }) =>
        renderRow(i, f, sector, share, distinctive(f), evidence?.get(f.id))).join("\n")}`;
  }).join("\n\n");

  const qa = questions.length
    ? questions.map((q) => `Q: ${q.q}\nA: ${answers.get(q.id) ?? "not sure"}`).join("\n")
    : "(no interview was run)";

  const { value, retries } = await askJson<{ picks: number[] }>(
    client, model,
`Name the FIVE specific funds this company should apply to.

An empirical ranker built from 628,000 real award pairs has already picked five PROGRAMME FAMILIES for this company. Measured on held-out companies it gets the family right essentially every time, and the specific scheme inside the family right only half the time. So the families below are settled. Your job is the part it cannot do: for each slot, choose WHICH scheme in that family this company should actually apply to.

COMPANY
  country: ${input.country}
  sector: ${input.sector ?? "unknown"}
  what they do: ${input.description || "(no description on file)"}

WHAT THEY TOLD US
${qa}

Each row carries what actually separates siblings — they are otherwise near-identical:
  * the scheme's own title, usually the most specific thing on the page
  * typical award: the median cheque THIS scheme has really written, and over how many
  * the delivery body, and how recently it last paid out
  * its share of everything its family has paid into this company's sector
  * any requirement that is specific to it rather than inherited by the whole family

Pick the scheme whose title, cheque size and track record match what this company is doing and how much it needs. A scheme whose typical cheque is an order of magnitude away from what they need is the wrong scheme however well the rest fits. Where nothing distinguishes the siblings for this company, keep gate 1's choice — it is not a coin flip, it is a prior.

${blocks}

Fill each family's slots from that family only, and honour the slot counts exactly. Reply with ONLY this JSON, no preamble and no code fence — five DISTINCT index numbers, best first:
{"picks":[0,0,0,0,0]}`,
    (v) => Array.isArray(v?.picks)
      && new Set(v.picks.filter((i) => Number.isInteger(i) && allowed.has(i))).size >= 5);

  return {
    picks: [...new Set((value?.picks ?? []).filter((i) => Number.isInteger(i) && allowed.has(i)))].slice(0, 5),
    retries,
  };
}

/**
 * STAGE 3, the veto form — gate 1's order stands, and the model may only strike
 * a fund out on a requirement the founder's answers plainly fail.
 *
 * Two measurements motivate this and one makes it worth doing.
 *
 * Against it: every configuration that lets the model REORDER has measured at
 * or below gate 1 on the same cases (legacy 14/40, parser-fixed 13/40, full
 * information with a family-grouped menu 12/40, against gate 1's own 20/40).
 * Its promotions are better than random and still worse than what they
 * displace, so re-ranking is a losing trade however well informed it is.
 *
 * For it: on the 20 cases gate 1 misses, the fund that actually won sits at
 * rank 5, 7, 8, 9, 9, 9, 13 and 15 in eight of them. Striking ONE wrong fund
 * out of gate 1's five promotes rank 5 into the answer. So a veto has real
 * upside and, unlike a re-rank, a floor: the order is untouched and the refill
 * comes from gate 1 itself, so the only way to lose is a wrong veto.
 *
 * MEASURED 20/40 (50%) exact and 38/40 (95%) regime — gate 1's own numbers to
 * the case. It issued real vetoes on 16 of the 40 cases (32 of 200 slots
 * changed) and rescued zero while breaking zero. Read that honestly: on a
 * fixture where 33 of 40 companies have no description and the founder
 * simulator answers "not sure", there is nothing for a veto to bite on, so
 * this measures the floor holding rather than the mechanism working. The
 * upside is untested, not disproven.
 *
 * The constraint is enforced HERE, in code, not requested in the prompt. The
 * prompt-level version of this ("you may only demote") was measured and still
 * leaked — it kept 70% of gate 1's five when told to keep all of them.
 */
export async function vetoOnly(
  client: Anthropic, model: string, input: SelectionInput,
  questions: SelectionResult["questions"], answers: Map<number, string>,
  evidence?: Map<string, string[]>, depth = 12,
): Promise<{ picks: number[]; retries: number; vetoed: number }> {
  const { subset, sector } = input;
  const share = familySectorShare(subset, sector);
  const distinctive = distinctiveRequirements(subset);
  const head = subset.slice(0, Math.min(depth, subset.length));
  const qa = questions.length
    ? questions.map((q) => `Q: ${q.q}\nA: ${answers.get(q.id) ?? "not sure"}`).join("\n")
    : "(no interview was run)";

  // ── The sentence that used to end this prompt, and why it is gone ────────
  // It read: "the order is not yours to change and it is better than your
  // guess." The first half is a mechanical fact -- the loop below rebuilds the
  // picks in the ranker's order regardless of what comes back -- and it stays.
  //
  // The second half was a conclusion drawn from an instrumentation failure. It
  // rests on this module's own measurement, and that measurement ran on a
  // fixture where 33 of 40 companies carried NO DESCRIPTION: the founder
  // simulator answered "not sure" and there was nothing for judgement to bite
  // on. A model told its judgement is worse than a prior, on evidence that its
  // judgement was never given anything to work with, is being taught to defer
  // by an artifact of the harness.
  //
  // What replaces it is the shape used by the withinFamilies prompt above and
  // worth preserving: state the BASE RATE, then the condition under which the
  // model's own reading overrides it. "Every configuration allowed to re-rank
  // measured below the ranker" is a fact about the measurements. "Your reading
  // of this company is worthless" is not, and was never measured.
  const { value, retries } = await askJson<{ disqualified: { i: number; why: string }[] }>(
    client, model,
`An empirical ranker has already ordered these funds by how often companies like this one actually won them. That order stands. Your only job is to strike out the ones this company plainly CANNOT get.

COMPANY
  country: ${input.country}
  sector: ${input.sector ?? "unknown"}
  what they do: ${input.description || "(no description on file)"}

WHAT THEY TOLD US
${qa}

FUNDS, in the ranker's order
${head.map((f, i) => renderRow(i, f, sector, share, distinctive(f), evidence?.get(f.id))).join("\n")}

Strike a fund out ONLY when something the company told you plainly fails a requirement that fund states, or when its typical cheque is an order of magnitude away from what they need. Do not strike one out because another looks better, because it is unfamiliar, or because you would have ordered them differently. The order is fixed in code: whatever you return, the funds left standing keep the ranker's order, so a preference has nowhere to go. Every configuration that has been allowed to re-rank has measured below the ranker on the same companies. What a strike is FOR is the one thing the ranker never saw: something this company has told you that plainly fails a requirement printed in front of you.

If nothing disqualifies anything, return an empty list. That is the expected answer and it is not a failure.

Reply with ONLY this JSON, no preamble and no code fence:
{"disqualified":[{"i":0,"why":"<the requirement they fail, in a few words>"}]}`,
    (v) => Array.isArray(v?.disqualified), 2048);

  const struck = new Set((value?.disqualified ?? [])
    .map((d) => d?.i).filter((i) => Number.isInteger(i) && i >= 0 && i < head.length));
  const picks: number[] = [];
  for (let i = 0; i < subset.length && picks.length < 5; i++) if (!struck.has(i)) picks.push(i);
  return { picks, retries, vetoed: struck.size };
}

/**
 * The whole gate. Always returns exactly five funds where five exist: a reply
 * that names fewer is topped up from gate 1's order rather than shipped short,
 * because a shortlist of three is a product defect the accuracy metric barely
 * registers (it cost 40% of runs before the parser was fixed).
 */
export async function selectFiveFunds(
  client: Anthropic, model: string, input: SelectionInput,
  opts: {
    evidence?: Map<string, string[]>;
    skipInterview?: boolean;
    /** Constrain the answer to gate 1's five families and their slot counts,
     *  and let the model choose the leaf. Measured 15/40. */
    withinFamilies?: boolean;
    /** Let the model re-rank the whole candidate set. Measured 12/40 against
     *  gate 1's 20/40 — every slot it takes back from the prior is a losing
     *  trade. Opt in deliberately or not at all. */
    freeRerank?: boolean;
    /** Measurement only — see LegacyPrompts. */
    legacyPrompts?: LegacyPrompts;
  } = {},
): Promise<SelectionResult> {
  let retries = 0;
  let questions: SelectionResult["questions"] = [];
  let answers = new Map<number, string>();
  if (!opts.skipInterview) {
    const q = await writeQuestions(client, model, input, opts.legacyPrompts);
    questions = q.questions; retries += q.retries;
    const a = await answerAsFounder(client, model, input, questions);
    answers = a.answers; retries += a.retries;
  }
  // vetoOnly is the DEFAULT, and the default is a measurement, not a taste:
  // it is the only selection shape that reaches gate 1's 20/40. Passing
  // `freeRerank` opts back into the form that measured 12/40, so a caller has
  // to ask for that explicitly and in writing.
  const p = opts.legacyPrompts
    ? await pickFive(client, model, input, questions, answers, opts.evidence, opts.legacyPrompts)
    : opts.withinFamilies
      ? await pickWithinFamilies(client, model, input, questions, answers, opts.evidence)
      : opts.freeRerank
        ? await pickFive(client, model, input, questions, answers, opts.evidence)
        : await vetoOnly(client, model, input, questions, answers, opts.evidence);
  retries += p.retries;

  const chosen = [...p.picks];
  const before = chosen.length;
  const byId = new Map(input.subset.map((f, i) => [f.id, i]));
  for (const id of input.baselineTop5) {
    if (chosen.length >= 5) break;
    const i = byId.get(id);
    if (i != null && !chosen.includes(i)) chosen.push(i);
  }
  for (let i = 0; i < input.subset.length && chosen.length < 5; i++) {
    if (!chosen.includes(i)) chosen.push(i);
  }
  return {
    picks: chosen.slice(0, 5).map((i) => input.subset[i]),
    questions, answers, retries, refilled: Math.max(0, Math.min(5, input.subset.length) - before),
  };
}
