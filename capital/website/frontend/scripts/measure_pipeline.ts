// THE measurement. Both gates, same companies, one table.
//
// ── Why this replaces the separate harnesses ───────────────────────────────
// Gate 1 and gate 2 were being measured by different scripts on different
// samples, and the numbers were compared as if they were commensurable. They
// were not: the first 15 fixture cases happen to be easy, so gate 1 scored 80%
// there against 49% across the full 80 -- and gate 2 was judged against the
// inflated figure. That is a structural flaw in the harness, not a bad run, so
// it is fixed structurally: every number below comes from the SAME cases in the
// SAME run, and the per-case outcomes are written out so any comparison can be
// re-derived rather than trusted.
//
// ── What is measured ───────────────────────────────────────────────────────
//   GATE 1   does the candidate subset contain the fund the company really won
//            (and, for reference, does gate 1's own deterministic top-5)
//   GATE 2   the LLM reads those candidates, retrieves the eligibility clauses
//            that bear on the founder's answers out of the 4,720-chunk vector
//            index, and returns five
//
// Ground truth is the fund the company actually won. No leakage: the
// question-writer never sees the founder, the founder-simulator never sees the
// candidates, and neither ever sees the answer.
//
// ── G2, the variant ladder ─────────────────────────────────────────────────
// Gate 2 is stochastic at roughly +/-7pp (1 SE) at n=40, so a rebuild has to be
// measured in steps that each isolate one change, on the SAME strided cases:
//
//   G2=legacy   the shipped 3-step prompt, prose parsing. The number to beat.
//   G2=parser   the same prompts, but every reply is JSON and every answer
//               carries its question's id. Isolates the two parser bugs.
//   G2=axes     free re-rank with the full rebuild behind it: menu grouped by
//               programme family, the fields that actually pin a fund on every
//               row, questions spent on axes computed in code.
//   G2=swap     G2=axes, but the answer is confined to gate 1's five families
//               and their slot counts, so only the LEAF is chosen. The family
//               of the won fund is inside gate 1's five in 38 of the 38 cases
//               where it is reachable at all, so this constraint is free.
//   G2=veto     gate 1's order stands and the model may only strike a fund out
//               on a stated requirement the founder plainly fails, enforced in
//               code. (default)
//   G2=noq      G2=axes with the interview deleted, to check the questions are
//               worth more than the 0pp the old ones measured. G2=swapnoq is
//               the same ablation on the bounded form.
//
// Measured, N=40, gate1@32f28f2, claude-haiku-4-5, same strided cases:
//
//   gate 1's own five  20/40 (50%) exact, 38/40 regime   <- the number to beat
//   legacy             14/40 (35%)   parser 13/40 (33%)   axes 12/40 (30%)
//   swap               15/40 (38%)   VETO   20/40 (50%), 38/40 regime
//
// Read that as the whole result: nothing that gives gate 2 more to read or a
// better-posed choice reaches gate 1. Only taking the choice away does.
//
//   npx tsx scripts/measure_pipeline.ts               # whole fixture
//   N=40 G2=axes npx tsx scripts/measure_pipeline.ts
import { readFileSync, appendFileSync, writeFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }

import { selectFiveFunds } from "../lib/intelligence/fundSelection";
import { warnIfRetired } from "./recallSet";

const MODEL = process.env.MODEL ?? "claude-haiku-4-5";
const SPLIT = process.env.SPLIT ?? "holdout";
const G2 = process.env.G2 ?? "veto";
const LOG = "fixtures/pipeline_history.jsonl";
// Per-variant, so two variants can be measured concurrently on the same cases
// without one silently overwriting the other's per-case outcomes.
const PER_CASE = G2 === "veto" ? "fixtures/pipeline_last_run.json"
  : `fixtures/pipeline_last_run_${G2}.json`;

const text = (r: any) => (r.content ?? []).filter((b: any) => b?.type === "text")
  .map((b: any) => b.text).join("\n");

/** Pull the eligibility passages that bear on what the founder said, out of the
 *  4,720-chunk index. Scoped to the candidates, so retrieval can never surface
 *  a fund the screen already excluded. */
async function retrieve(pg: any, ids: string[], query: string, total = 25) {
  const key = process.env.VOYAGE_KEY;
  const out = new Map<string, string[]>();
  if (!key || !ids.length) return out;
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "voyage-3.5", input: [query.slice(0, 6000)], input_type: "query" }),
  });
  if (!res.ok) return out;
  const emb = ((await res.json()) as any)?.data?.[0]?.embedding;
  if (!emb) return out;
  const rows = (await pg.query(
    `SELECT instrument_id, chunk_text FROM eligibility_embeddings
      WHERE instrument_id = ANY($1) ORDER BY embedding <=> $2::vector LIMIT $3`,
    [ids, JSON.stringify(emb), total])).rows as any[];
  for (const r of rows) {
    if ((out.get(r.instrument_id) ?? []).length >= 1) continue;
    out.set(r.instrument_id, [String(r.chunk_text).slice(0, 240)]);
  }
  return out;
}

/** The shipped gate 2, kept verbatim so the baseline stays reproducible after
 *  the rebuild lands. Its two defects are the point of keeping it: the picks
 *  are read with match(/\d+/g) out of prose that opens with a preamble 93% of
 *  the time, and the question list positionally zips a markdown header into
 *  slot 1 in 58% of runs. */
async function legacyGate2(client: Anthropic, pg: any, c: any) {
  const menu = c.subset.map((s: any, i: number) =>
    `[${i}] ${s.name} — ${s.body || "n/a"} (${s.channel || "n/a"}, ${s.country || "n/a"})` +
    (s.gates?.length ? `\n     requires: ${s.gates.join(" / ").slice(0, 220)}` : "")).join("\n");

  const q = await client.messages.create({ model: MODEL, max_tokens: 1200, messages: [{ role: "user", content:
`Below are ${c.subset.length} public funding schemes. They overlap heavily and many look alike on paper.

Write the 6-8 questions you would ask a company to work out WHICH of these actually fit it. The best question is one where different schemes here demand different answers; a question they all answer the same way tells you nothing.

SCHEMES
${menu}

Reply with ONLY the questions, one per line.` }] });
  const questions = text(q).split("\n").map((x: string) => x.trim())
    .filter((x: string) => x.length > 12).slice(0, 8);
  if (!questions.length) throw new Error("no questions");

  const a = await client.messages.create({ model: MODEL, max_tokens: 1200, messages: [{ role: "user", content:
`You are this company's founder. Answer each question briefly and honestly. If you cannot tell, say "not sure".

YOUR COMPANY
  country: ${c.country}
  sector: ${c.sector ?? "unknown"}
  what you do: ${c.description || "(no description)"}

QUESTIONS
${questions.join("\n")}

One answer per line, in order.` }] });
  const answers = text(a).split("\n").map((x: string) => x.trim()).filter(Boolean);

  const ev = await retrieve(pg, c.subset.map((s: any) => s.id),
    `${c.description ?? ""}\n${answers.join("\n")}`);

  const s = await client.messages.create({ model: MODEL, max_tokens: 2048, messages: [{ role: "user", content:
`Pick the FIVE schemes this company should actually pursue.

COMPANY
  country: ${c.country}
  sector: ${c.sector ?? "unknown"}
  what they do: ${c.description || "(no description)"}

WHAT THEY TOLD US
${questions.map((qq: string, i: number) => `Q: ${qq}\nA: ${answers[i] ?? "not sure"}`).join("\n")}

SCHEMES
${c.subset.map((s2: any, i: number) => {
  const e = ev.get(s2.id);
  return `[${i}] ${s2.name} — ${s2.body || "n/a"} (${s2.channel || "n/a"}, ${s2.country || "n/a"})` +
    (s2.gates?.length ? `\n     requires: ${s2.gates.join(" / ").slice(0, 180)}` : "") +
    (e?.length ? `\n     BEARS ON THEIR ANSWERS: ${e.join(" | ")}` : "");
}).join("\n")}

The list is ALREADY ORDERED by how often companies like this one have actually won each scheme. That ordering is empirical and strong — it is your starting point.

Refine it, do not rebuild it:
- Move a scheme DOWN when their answers show they fail its stated requirement.
- Move a scheme UP when their answers speak directly to what it demands.
- If their answers say nothing about a scheme, leave its position alone.
- Where two are equally good, prefer spread across EU / national / regional.

Reply with ONLY the five index numbers, comma-separated, best first.` }] });
  const picks = (text(s).match(/\d+/g) ?? []).slice(0, 5).map((x: string) => Number(x))
    .filter((i: number) => i >= 0 && i < c.subset.length).map((i: number) => c.subset[i]);
  if (!picks.length) throw new Error("no picks");
  return { picks, questions: questions.length, refilled: Math.max(0, 5 - picks.length), retries: 0 };
}

/** G2=parser: the legacy prompts, with the two defects removed and nothing
 *  else changed. Any gain here is the bugs, not the rebuild. */
async function parserOnlyGate2(client: Anthropic, pg: any, c: any) {
  const menu = c.subset.map((s: any, i: number) =>
    `[${i}] ${s.name} — ${s.body || "n/a"} (${s.channel || "n/a"}, ${s.country || "n/a"})` +
    (s.gates?.length ? `\n     requires: ${s.gates.join(" / ").slice(0, 220)}` : "")).join("\n");
  const r = await selectFiveFunds(client, MODEL, {
    country: c.country, sector: c.sector, description: c.description,
    subset: c.subset, baselineTop5: c.baselineTop5,
  }, {
    evidence: await retrieve(pg, c.subset.map((s: any) => s.id), c.description ?? ""),
    legacyPrompts: { menu },
  });
  return { picks: r.picks, questions: r.questions.length, refilled: r.refilled, retries: r.retries };
}

async function main() {
  const fx = JSON.parse(readFileSync(`fixtures/gate1_${SPLIT}.json`, "utf8"));
  // The fixture carries its own answer key. A gate-2 number measured against a
  // different one is not comparable and there is no way to tell from the score,
  // so the set is named on every run — and a fixture built before the sets were
  // recorded is named as unknown rather than assumed to be the current one.
  if (fx.recallSet) {
    console.log(`recall set: ${fx.recallSet}  ` +
                `${Number(fx.recallSetPairs ?? 0).toLocaleString()} pairs  ` +
                `[via fixtures/gate1_${SPLIT}.json, gate1@${fx.gate1Sha}]`);
    warnIfRetired(fx.recallSet);
  } else {
    console.log(`recall set: UNKNOWN — fixtures/gate1_${SPLIT}.json predates set ` +
                `recording. Rebuild with build_gate1_fixture.ts before quoting it.`);
  }
  const N = Math.min(Number(process.env.N ?? fx.cases.length), fx.cases.length);
  // Stride the fixture rather than taking the head: the cases are not shuffled
  // and the first ones are easier, which is exactly how the 80%-vs-49% error
  // happened.
  const step = Math.max(1, Math.floor(fx.cases.length / N));
  const cases = fx.cases.filter((_: any, i: number) => i % step === 0).slice(0, N);

  const client = new Anthropic();
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  const per: any[] = [];
  for (const c of cases) {
    const row: any = {
      name: c.name, country: c.country, sector: c.sector, want: c.want,
      g1_reachable: c.subset.some((s: any) => s.id === c.want),
      g1_top5: c.baselineTop5.includes(c.want),
      g1_top5_regime: c.baselineTop5.some((id: string) =>
        (c.subset.find((s: any) => s.id === id)?.regime) === c.wantRegime),
      g2_exact: false, g2_regime: false, questions: 0, refilled: 0, retries: 0, failed: false,
    };
    try {
      let out;
      if (G2 === "legacy") out = await legacyGate2(client, pg, c);
      else if (G2 === "parser") out = await parserOnlyGate2(client, pg, c);
      else {
        // The retrieval query is the description plus, once the interview has
        // run, what the founder said. The interview happens inside
        // selectFiveFunds, so retrieval here is seeded on the description
        // alone -- which is what `eligibility_embeddings` can honestly serve
        // anyway (two boilerplate strings are 21% of that index).
        const ev = await retrieve(pg, c.subset.map((s: any) => s.id),
          `${c.description ?? ""}\n${c.sector ?? ""}`);
        const r = await selectFiveFunds(client, MODEL, {
          country: c.country, sector: c.sector, description: c.description,
          subset: c.subset, baselineTop5: c.baselineTop5,
        }, {
          evidence: ev,
          skipInterview: G2 === "noq" || G2 === "swapnoq",
          withinFamilies: G2 === "swap" || G2 === "swapnoq",
          freeRerank: G2 === "axes" || G2 === "noq",
        });
        out = { picks: r.picks, questions: r.questions.length, refilled: r.refilled, retries: r.retries };
      }
      row.questions = out.questions;
      row.refilled = out.refilled;
      row.retries = out.retries;
      row.g2_exact = out.picks.some((p: any) => p.id === c.want);
      row.g2_regime = out.picks.some((p: any) => p.regime === c.wantRegime);
      row.picks = out.picks.map((p: any) => p.id);
    } catch {
      row.failed = true;
    }
    per.push(row);
  }
  await pg.end();

  const n = per.length;
  const pct = (f: (r: any) => boolean) => {
    const k = per.filter(f).length;
    return `${String(k).padStart(3)}/${n} (${String(Math.round(100 * k / n)).padStart(3)}%)`;
  };
  console.log(`\nmodel=${MODEL}  split=${SPLIT}  gate1@${fx.gate1Sha}  g2=${G2}  n=${n}  (strided, same cases both gates)\n`);
  console.log(`  GATE 1  right fund in the candidate subset   ${pct((r) => r.g1_reachable)}`);
  console.log(`  GATE 1  its own deterministic top-5          ${pct((r) => r.g1_top5)}`);
  console.log(`  GATE 1  deterministic top-5, regime          ${pct((r) => r.g1_top5_regime)}`);
  console.log();
  console.log(`  GATE 2  LLM's five contain the right fund    ${pct((r) => r.g2_exact)}`);
  console.log(`  GATE 2  LLM's five contain the right regime  ${pct((r) => r.g2_regime)}`);
  console.log();
  const reach = per.filter((r) => r.g1_reachable).length;
  const g2r = per.filter((r) => r.g1_reachable && r.g2_exact).length;
  console.log(`  of what gate 1 made reachable, gate 2 kept   ${reach ? Math.round(100 * g2r / reach) : 0}%`);
  console.log(`  gate 2 vs gate 1 top-5 on these same cases   ${per.filter((r) => r.g2_exact).length} vs ${per.filter((r) => r.g1_top5).length}`);
  // A slot the model did not fill is a shipped shortlist of four. It used to
  // happen in 40% of runs and the exact metric barely showed it.
  console.log(`  runs the model returned <5 picks for        ${per.filter((r) => r.refilled > 0).length}`);
  console.log(`  replies re-requested as malformed JSON      ${per.reduce((s, r) => s + (r.retries || 0), 0)}`);
  const failed = per.filter((r) => r.failed).length;
  if (failed) console.log(`  failed calls                                ${failed}`);

  writeFileSync(PER_CASE, JSON.stringify(per, null, 1));
  appendFileSync(LOG, JSON.stringify({
    at: new Date().toISOString(), model: MODEL, split: SPLIT, gate1Sha: fx.gate1Sha, g2: G2, n,
    g1_reachable: per.filter((r) => r.g1_reachable).length,
    g1_top5: per.filter((r) => r.g1_top5).length,
    g2_exact: per.filter((r) => r.g2_exact).length,
    g2_regime: per.filter((r) => r.g2_regime).length,
    refilled: per.filter((r) => r.refilled > 0).length,
    retries: per.reduce((s, r) => s + (r.retries || 0), 0), failed,
  }) + "\n");
  console.log(`\n  per-case outcomes written to ${PER_CASE}`);
}

main();
