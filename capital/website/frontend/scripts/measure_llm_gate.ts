// Can an LLM pick the right 5 funds out of the ~50 screen one hands it?
//
// ── The architecture this tests ────────────────────────────────────────────
// Screen one is a PRELIMINARY gate: its job is only to hand over a subset that
// contains the right fund, as often as possible. It currently does that 93% of
// the time over ~57 candidates. Stage two's job is to read that subset properly
// and choose five.
//
// Every deterministic ranking attempt tops out around 30-40% exact, and even
// ranking the ENTIRE pool by score only reaches 88% -- so the ceiling is not in
// the scoring, it is in what a score can see. An LLM reads the founder's own
// words against each fund's own eligibility text and can weigh things no
// scalar does: that a scheme funds prototypes and this founder has one, that a
// consortium requirement is a dealbreaker for a solo applicant.
//
// This measures that directly, against ground truth, on the same holdout split
// every other harness uses.
//
// ── Honest construction ────────────────────────────────────────────────────
// The model NEVER sees which fund the company actually won, nor any award
// history. It sees what a real founder's screen-one answers would produce: the
// candidate list with each fund's name, body, channel, what it funds and who
// may apply. Nothing that identifies the answer.
//
//   npx tsx scripts/measure_llm_gate.ts            # 30 holdout companies
//   N=60 MODEL=claude-sonnet-5 npx tsx scripts/measure_llm_gate.ts
import Anthropic from "@anthropic-ai/sdk";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("measure_llm_gate", ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]);

import { hydrateDbInstruments, loadDbInstruments, hydrateGatesFor } from "../lib/intelligence/corpus";
import { Client } from "pg";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { loadRecallSet } from "./recallSet";

const MODEL = process.env.MODEL ?? "claude-sonnet-5";
// How many candidates to hand the model. Screen one's whole job in this
// architecture is to make this subset contain the answer; the model's job is
// to read it. Wider costs tokens and buys pool recall.
const SUBSET = Number(process.env.SUBSET ?? 40);

async function main() {
  await hydrateDbInstruments();
  const insts = loadDbInstruments();
  await hydrateGatesFor(insts.map((i: any) => i.id));
  const byId = new Map(loadDbInstruments().map((i: any) => [i.id, i]));
  const { rows: all } = loadRecallSet();
  const hold = all.filter((r) => r.split === "holdout");
  const N = Math.min(Number(process.env.N ?? 30), hold.length);
  const step = Math.max(1, Math.floor(hold.length / N));
  const sample = hold.filter((_, i) => i % step === 0).slice(0, N);

  // The fund descriptions the model reads. `funding_instruments.description`
  // is only populated for the 241 fetched SATR schemes, so an EU cluster
  // arrived at the model as a bare name -- it was being asked to choose between
  // "Horizon EU CL3" and "Horizon EU CL4" with nothing to read. The profiles
  // built for the embedding index carry exactly the needed text (what it funds,
  // the sectors it has really backed, typical award) for all 1,014.
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const profiles = new Map<string, string>(
    (await pg.query("SELECT instrument_id, profile_text FROM instrument_profiles")).rows
      .map((r: any) => [r.instrument_id, r.profile_text as string]));
  await pg.end();
  console.log(`loaded ${profiles.size} instrument profiles for the menu`);

  const client = new Anthropic();
  let exact = 0, regime = 0, inSubset = 0, done = 0, baselineExact = 0;

  for (const t of sample) {
    const el: any = {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
    };
    const v: any = await computeVerdict("TestCo", t.country, el, {
      targetMarkets: [t.country], capitalSought: ["grant", "loan"],
      description: t.description || undefined,
    } as never);

    const ordered: string[] = (v.instrumentTable ?? [])
      .map((r: any) => r.instrumentId).filter(Boolean);
    const pool: string[] = v.candidateInstrumentIds ?? [];
    // The subset screen one hands over: its own order first, then the rest of
    // the pool, so the model sees a genuinely wide field.
    const subset = [...ordered, ...pool.filter((id) => !ordered.includes(id))].slice(0, SUBSET);
    done++;
    if (ordered.slice(0, 5).includes(t.instrument)) baselineExact++;
    if (!subset.includes(t.instrument)) continue;   // stage one failed; stage two cannot recover
    inSubset++;

    const menu = subset.map((id, i) => {
      const inst: any = byId.get(id);
      const gates = (inst?.gates ?? [])
        .filter((g: any) => !g.gateRole || g.gateRole === "filter")
        .slice(0, 4).map((g: any) => g.requirement).filter(Boolean);
      return [
        `[${i}] ${inst?.name ?? id}`,
        `    body: ${inst?.administeringBody || "n/a"} | channel: ${inst?.sourceFamilyBucket || "n/a"} | country: ${inst?.country || "n/a"}`,
        profiles.get(id) ? `    ${String(profiles.get(id)).slice(0, 420)}` : "",
        gates.length ? `    who may apply: ${gates.join(" / ").slice(0, 300)}` : "",
      ].filter(Boolean).join("\n");
    }).join("\n");

    const prompt = `A founder is seeking public funding. Choose the FIVE funds from the list below that they are most likely to be eligible for AND most likely to actually win.

FOUNDER
  country: ${t.country}
  sector: ${t.sector ?? "unknown"}
  what they do: ${t.description || "(no description given)"}

CANDIDATE FUNDS
${menu}

Think about which funds genuinely fit this specific company — the stage they are at, what the money would pay for, whether they could meet the stated requirements. Prefer funds whose own eligibility text matches this founder over funds that are merely large or generic. Spread across different funding levels (EU / national / regional) where two candidates are equally good, since that gives the founder real alternatives.

Reply with ONLY the five index numbers, comma-separated, best first. Example: 3,17,0,22,9`;

    try {
      const resp: any = await client.messages.create({
        // Sonnet 5 spends tokens on thinking before it writes. At
        // max_tokens 64 the whole budget went to thinking and the reply came
        // back EMPTY -- every call "succeeded" and returned nothing, which
        // read as the model scoring 0% rather than as a broken harness.
        model: MODEL, max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      // Take the last text block: with thinking enabled the answer is not
      // necessarily block 0.
      const text = (resp.content ?? [])
        .filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") as string;
      if (process.env.DEBUG) console.log(`\n  RAW: ${JSON.stringify(text)}\n  want idx=${subset.indexOf(t.instrument)} of ${subset.length}`);
      const picks = (text.match(/\d+/g) ?? []).slice(0, 5).map(Number)
        .filter((i) => i >= 0 && i < subset.length).map((i) => subset[i]);
      if (picks.includes(t.instrument)) exact++;
      const wantRegime = (byId.get(t.instrument) as any)?.parentId ?? t.instrument;
      if (picks.some((id) => ((byId.get(id) as any)?.parentId ?? id) === wantRegime)) regime++;
    } catch (e: any) {
      console.error(`  ${t.name}: ${e?.message ?? e}`);
    }
  }

  const pc = (x: number, d = done) => `${x}/${d} (${(100 * x / d).toFixed(0)}%)`;
  console.log(`\nmodel=${MODEL}  subset=${SUBSET}  replayed ${done}`);
  console.log(`  STAGE 1 -- right fund inside the subset   ${pc(inSubset)}`);
  console.log(`  STAGE 1 -- deterministic top-5 (baseline) ${pc(baselineExact)}`);
  console.log(`\n  STAGE 2 -- LLM picked it in its five`);
  console.log(`     EXACT  ${pc(exact)}   of those it could reach: ${inSubset ? (100 * exact / inSubset).toFixed(0) : 0}%`);
  console.log(`     REGIME ${pc(regime)}   of those it could reach: ${inSubset ? (100 * regime / inSubset).toFixed(0) : 0}%`);
}

main();
