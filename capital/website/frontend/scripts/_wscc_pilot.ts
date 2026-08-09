// wsCC — STEP 4: does a model reading a RICH FOUNDER PROFILE actually move
// EXACT@5, or is the ceiling only a ceiling?
//
// The arms, over one pool so nothing differs but the ordering:
//   A  SHIPPED           the product's own five, unchanged.
//   B  RICH-PROFILE      the top-K of the shipped ordering, re-ordered by a
//                        model judging each fund's C2 + F demands (the ones no
//                        comparator can decide) against a synthesised profile.
//
// ── LEAKS, which is the part that can silently invent the result ──────────
// 87% of recall-set descriptions once sat inside the won fund's own project
// titles, and 1,573 of 1,920 began with the instrument's name. A profile
// synthesised from a leaking description would hand the judge the answer.
// So the profile is built ONLY from (company name, country, sector,
// description), the description population is restricted to `isDescribed`
// (which already excludes the leaking rows), and every synthesised profile is
// then tested against the FULL publishable name index before it is used:
//   - it must not contain the won fund's name, or any candidate's name
//   - it must share no 8-gram with any of them
// A profile that fails is dropped, and the count of drops is printed. A run
// that drops nothing has not proved it is clean, so the guard is also asserted
// to FIRE on a deliberately poisoned profile before the run starts.
//
// ── Tuning ────────────────────────────────────────────────────────────────
// SPLIT defaults to `tune`. Holdout is run once, at the end, and never fitted.
//
// COSTS MODEL CALLS. Prints its own spend.
import { readFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wscc_pilot", ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]);

import { Client } from "pg";
import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "./recallSample";
import {
  answersFor, assertAncestorConvention, assertGradablePopulation, isDescribed,
  loadRecallSet, partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "./recallSet";
import { canopy, loadGates, type GateRow } from "./_wscc_demand";

const SPLIT = process.env.SPLIT ?? "tune";
const N = Number(process.env.N ?? 60);
const TOPK = Number(process.env.TOPK ?? 20);
const MODEL = process.env.PILOT_MODEL ?? "claude-sonnet-5";
const LABELS = process.env.LABELS!;
const TAU = Number(process.env.TAU ?? 0.72);
// claude-sonnet-5 list price 2026-08, introductory rate through 2026-08-31.
const IN$ = Number(process.env.PRICE_IN ?? 2.0), OUT$ = Number(process.env.PRICE_OUT ?? 10.0);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const grams = (s: string, n = 8) => {
  const w = norm(s).split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
};

/** The leak test, as a property: a founder profile may not carry the identity
 *  of any fund the product could offer. Applied to EVERY publishable name, not
 *  to a list of the ones this run happened to draw. */
function leaks(profile: string, names: string[], nameGrams: Set<string>): string | null {
  const p = " " + norm(profile) + " ";
  for (const n of names) {
    const k = norm(n);
    if (k.length >= 8 && p.includes(" " + k + " ")) return `contains fund name "${n}"`;
  }
  for (const g of grams(profile)) if (nameGrams.has(g)) return `8-gram shared with a fund name: "${g}"`;
  return null;
}

const PROFILE_SYSTEM = `You write the intake profile a founder — or a VC who knows the business well — would supply to a public-funding adviser who has asked them to describe everything relevant about the company, the technology, the plan and the money.

You are given only what is known about the company. Where a fact is not given, write what is genuinely inferable from the sector and the described work, and mark anything you inferred with "(inferred)". Never invent a specific funder, grant, award, programme or scheme, and never name one — the profile is about the company, not about its funding history.

Write six short labelled sections, in plain prose, no more than 40 words each:
COMPANY — legal form, where registered, where it operates, roughly how old, roughly how many people, whether it is independent.
TECHNOLOGY — what it actually builds or does, and in what field.
NOVELTY — what is new about it relative to what is already available, and how far along it is.
PROJECT — the specific piece of work that would be funded, and what it would produce.
IMPACT — what the work would change if it succeeded, in the terms a public programme would care about.
MONEY — roughly what the work costs, what share the company could fund itself, and what it needs.`;

const JUDGE_SYSTEM = `You are deciding, for each candidate funding programme, how well an applicant's profile satisfies the programme's own requirements — the ones no simple form field can check.

For each programme you are given its requirements verbatim. Score it:
2 — the profile clearly satisfies every requirement shown.
1 — the profile is consistent with them but does not establish them.
0 — the profile clearly fails at least one.

Judge only against what the profile says. Do not reward a programme for being prestigious, large, well known, or a plausible-sounding fit; a programme whose requirements the profile does not address scores 1, not 2. Do not use the programme's name or country as evidence.`;

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: { i: { type: "integer" }, s: { type: "integer", enum: [0, 1, 2] } },
        required: ["i", "s"], additionalProperties: false,
      },
    },
  },
  required: ["scores"], additionalProperties: false,
} as const;

(async () => {
  await hydrateDbInstruments();
  requireLiveCorpus("wscc_pilot");
  const corpus = loadDbInstruments();
  assertAncestorConvention(corpus);
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerableList = publishableInstruments();
  const offerable = new Set(offerableList.map((i) => i.id));

  // ── the demands a comparator cannot decide, per instrument ────────────────
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const gates = (await loadGates(db, offerable)).filter((r) => r.role === "filter");
  await db.end();
  const cid = canopy(gates, TAU);
  const labels: Record<string, string> = JSON.parse(readFileSync(LABELS, "utf8"));
  const judgeable = new Map<string, string[]>();
  gates.forEach((g, i) => {
    const c = labels[String(cid[i])];
    if (c !== "C2" && c !== "F") return;
    const list = judgeable.get(g.iid) ?? judgeable.set(g.iid, []).get(g.iid)!;
    const t = String(g.requirement).replace(/\s+/g, " ").trim();
    if (t && !list.includes(t) && list.length < 6) list.push(t);
  });
  console.log(`judgeable (C2+F) demands on ${judgeable.size} of ${offerable.size} publishable instruments`);

  // ── the leak index, and PROOF THE GUARD CAN FAIL ──────────────────────────
  const names = offerableList.map((i) => i.name).filter((n) => n && n.length > 3);
  const nameGrams = new Set<string>();
  for (const n of names) for (const g of grams(n)) nameGrams.add(g);
  const poison = `COMPANY — a company. TECHNOLOGY — work with ${names[0]}.`;
  const fired = leaks(poison, names, nameGrams);
  if (!fired) { console.error("LEAK GUARD DID NOT FIRE on a poisoned profile — refusing to run"); process.exit(1); }
  console.log(`leak guard proved to fail: ${fired}`);
  console.log(`leak index: ${names.length} publishable fund names, ${nameGrams.size} 8-grams\n`);

  // ── the sample ────────────────────────────────────────────────────────────
  const { rows: all, file: setFile } = loadRecallSet();
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);
  // DESCRIBED only: a rich profile needs something real to be rich ABOUT, and
  // `isDescribed` is the population that already excludes the leaking rows.
  const set = pop.graded.filter((r) => r.split === SPLIT && isDescribed(r));
  const sample = sampleRecall(set, Math.min(N, set.length), Number(process.env.SEED ?? DEFAULT_SEED));
  console.log(`${setFile} split=${SPLIT} described=${set.length}; sampling ${sample.length}\n`);

  const client = new Anthropic();
  let inTok = 0, outTok = 0;
  const call = async (system: string, user: string, max: number, schema?: unknown) => {
    const r: any = await client.messages.create({
      model: MODEL, max_tokens: max, system,
      ...(schema ? { output_config: { format: { type: "json_schema", schema } } } : {}),
      messages: [{ role: "user", content: user }],
    } as any);
    inTok += r.usage.input_tokens; outTok += r.usage.output_tokens;
    return (r.content.find((c: any) => c.type === "text") as any)?.text ?? "";
  };

  const answerMode = (process.env.ANSWERS ?? "off") as AnswerMode;
  let shippedHit = 0, richHit = 0, graded = 0, dropped = 0, judged = 0, noDemands = 0;
  const shippedArr: number[] = [], richArr: number[] = [];

  resetGateHydration();
  for (const t of sample) {
    resetGateHydration();
    const a = answersFor(t, answerMode);
    const v: any = await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"], region: a.region,
    } as never, {
      targetMarkets: [t.country], capitalSought: a.capitalSought,
      description: t.description || t.selfDescription || undefined,
    } as never);
    const table: string[] = (v.instrumentTable ?? [])
      .map((r: { instrumentId?: string }) => r.instrumentId).filter(Boolean);
    graded++;
    const sHit = table.slice(0, 5).includes(t.instrument) ? 1 : 0;
    shippedHit += sHit; shippedArr.push(sHit);

    // ── the rich profile ────────────────────────────────────────────────────
    const seed = [`Company: ${t.name}`, `Country: ${t.country}`, `Sector: ${t.sector ?? "unknown"}`,
      `What it is working on: ${t.description || t.selfDescription || "(not stated)"}`].join("\n");
    const profile = await call(PROFILE_SYSTEM, seed, 700);
    const bad = leaks(profile, names, nameGrams);
    if (bad) {
      dropped++;
      richHit += sHit; richArr.push(sHit); // no re-rank; the shipped order stands
      continue;
    }

    // ── judge the top-K on demands no comparator decides ────────────────────
    const head = table.slice(0, TOPK);
    const cands = head.map((id, i) => ({ i, id, reqs: judgeable.get(id) ?? [] }))
      .filter((c) => c.reqs.length > 0);
    if (!cands.length) { noDemands++; richHit += sHit; richArr.push(sHit); continue; }
    const block = cands.map((c) =>
      `${c.i}. Requirements:\n${c.reqs.map((r) => `   - ${r.slice(0, 220)}`).join("\n")}`).join("\n\n");
    const out = await call(JUDGE_SYSTEM,
      `APPLICANT PROFILE\n${profile}\n\nCANDIDATE PROGRAMMES\n${block}\n\nScore every numbered programme.`,
      1500, JUDGE_SCHEMA);
    let scores: { i: number; s: number }[] = [];
    try { scores = JSON.parse(out).scores; } catch { /* unscored: order stands */ }
    judged++;
    const sc = new Map(scores.map((x) => [x.i, x.s]));
    // Re-order the head by (judgement, original rank). Candidates the judge did
    // not see keep a neutral 1, so a fund is never demoted for our silence —
    // the same rule the product uses for a missing datum.
    const reordered = head.map((id, i) => ({ id, i, s: sc.get(i) ?? 1 }))
      .sort((x, y) => y.s - x.s || x.i - y.i).map((x) => x.id);
    const rHit = reordered.slice(0, 5).includes(t.instrument) ? 1 : 0;
    richHit += rHit; richArr.push(rHit);
    if (graded % 10 === 0)
      console.log(`  ${graded}/${sample.length}  shipped ${shippedHit} rich ${richHit}  ` +
        `in ${inTok} out ${outTok}`);
  }

  const cost = (inTok / 1e6) * IN$ + (outTok / 1e6) * OUT$;
  console.log(`\n=== PILOT, ${MODEL}, split=${SPLIT}, N=${graded}, top-K=${TOPK} ===`);
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const pct = (arr: number[]) => 100 * sum(arr) / arr.length;
  const hw = (arr: number[]) => halfWidth(sum(arr), arr.length);  // already in points
  console.log(`A  SHIPPED                       EXACT@5 ${pct(shippedArr).toFixed(1)}% ±${hw(shippedArr).toFixed(1)}`);
  console.log(`B  RICH PROFILE + model judge    EXACT@5 ${pct(richArr).toFixed(1)}% ±${hw(richArr).toFixed(1)}`);
  const d = pct(richArr) - pct(shippedArr);
  console.log(`   difference ${d >= 0 ? "+" : ""}${d.toFixed(1)} points against half-widths of ` +
    `±${hw(shippedArr).toFixed(1)} and ±${hw(richArr).toFixed(1)}` +
    (Math.abs(d) < hw(shippedArr) + hw(richArr) ? "  — INSIDE THE NOISE, not a difference" : ""));
  console.log(`\npairs re-ranked ${judged}; profiles dropped by the leak guard ${dropped}; ` +
    `pairs whose top-${TOPK} carried no judgeable demand ${noDemands}`);
  console.log(`tokens in ${inTok} out ${outTok};  COST $${cost.toFixed(2)}`);
})();
