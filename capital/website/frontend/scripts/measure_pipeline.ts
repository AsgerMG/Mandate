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
//   npx tsx scripts/measure_pipeline.ts               # whole fixture
//   N=40 MODEL=claude-haiku-4-5 npx tsx scripts/measure_pipeline.ts
import { readFileSync, appendFileSync, writeFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }

const MODEL = process.env.MODEL ?? "claude-haiku-4-5";
const SPLIT = process.env.SPLIT ?? "holdout";
const LOG = "fixtures/pipeline_history.jsonl";
const PER_CASE = "fixtures/pipeline_last_run.json";

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

async function main() {
  const fx = JSON.parse(readFileSync(`fixtures/gate1_${SPLIT}.json`, "utf8"));
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
      g2_exact: false, g2_regime: false, questions: 0, failed: false,
    };
    try {
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
      row.questions = questions.length;
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
      row.g2_exact = picks.some((p: any) => p.id === c.want);
      row.g2_regime = picks.some((p: any) => p.regime === c.wantRegime);
    } catch (e: any) {
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
  console.log(`\nmodel=${MODEL}  split=${SPLIT}  gate1@${fx.gate1Sha}  n=${n}  (strided, same cases both gates)\n`);
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
  const failed = per.filter((r) => r.failed).length;
  if (failed) console.log(`  failed calls                                ${failed}`);

  writeFileSync(PER_CASE, JSON.stringify(per, null, 1));
  appendFileSync(LOG, JSON.stringify({
    at: new Date().toISOString(), model: MODEL, split: SPLIT, gate1Sha: fx.gate1Sha, n,
    g1_reachable: per.filter((r) => r.g1_reachable).length,
    g1_top5: per.filter((r) => r.g1_top5).length,
    g2_exact: per.filter((r) => r.g2_exact).length,
    g2_regime: per.filter((r) => r.g2_regime).length, failed,
  }) + "\n");
  console.log(`\n  per-case outcomes written to ${PER_CASE}`);
}

main();
