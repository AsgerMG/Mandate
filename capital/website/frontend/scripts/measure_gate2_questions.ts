// GATE 2, properly: read the ~58 candidates, ASK the questions that separate
// them, then narrow to five using the answers.
//
// ── The architecture ───────────────────────────────────────────────────────
//   gate 1   fixed screen-one questions        -> ~58 candidates (95% contain
//                                                 the right fund)
//   gate 2a  LLM reads those 58 and writes the 6-8 follow-up questions that
//            would best tell them apart
//   gate 2b  the founder answers
//   gate 2c  the answers narrow 58 -> 5
//
// An earlier harness skipped 2a and 2b entirely and asked the model to pick
// five straight off a menu. That scored 40% against a 60% deterministic
// baseline -- unsurprising, since it was choosing blind between siblings that
// look identical on paper. The whole point of gate 2 is that it gets to ASK.
//
// ── No leakage ─────────────────────────────────────────────────────────────
// The question-writer sees only the candidate funds -- never the founder, never
// the answer. The founder-simulator sees only the founder's own description and
// the questions -- never the candidate list, never the answer. Neither can
// shortcut to the fund the company actually won.
//
//   npx tsx scripts/measure_gate2_questions.ts
//   N=20 MODEL=claude-haiku-4-5 npx tsx scripts/measure_gate2_questions.ts
import { readFileSync, appendFileSync } from "fs";
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
const LOG = "fixtures/gate2_history.jsonl";

const text = (r: any) => (r.content ?? []).filter((b: any) => b?.type === "text")
  .map((b: any) => b.text).join("\n");

/** Retrieve the eligibility passages that actually bear on what the founder
 *  said, out of the 4,720-chunk index.
 *
 *  This is the point of having embedded the corpus. Without it the model reads
 *  a truncated four-gate summary per fund and has to guess; with it, it gets
 *  the specific clauses that match or contradict the founder's own answers,
 *  attributed to the fund they came from. Scoped to the candidate instruments,
 *  so retrieval can never introduce a fund the screen already excluded. */
async function retrieveEvidence(
  pg: any, instrumentIds: string[], query: string, perFund = 1, total = 25,
): Promise<Map<string, string[]>> {
  const key = process.env.VOYAGE_KEY;
  const out = new Map<string, string[]>();
  if (!key || !instrumentIds.length) return out;
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "voyage-3.5", input: [query.slice(0, 6000)], input_type: "query" }),
  });
  if (!res.ok) return out;
  const emb = ((await res.json()) as any)?.data?.[0]?.embedding;
  if (!emb) return out;
  const rows = (await pg.query(
    `SELECT instrument_id, chunk_text
       FROM eligibility_embeddings
      WHERE instrument_id = ANY($1)
      ORDER BY embedding <=> $2::vector
      LIMIT $3`,
    [instrumentIds, JSON.stringify(emb), total],
  )).rows as any[];
  for (const r of rows) {
    const cur = out.get(r.instrument_id) ?? [];
    if (cur.length >= perFund) continue;
    cur.push(String(r.chunk_text).slice(0, 240));
    out.set(r.instrument_id, cur);
  }
  return out;
}

async function main() {
  const fx = JSON.parse(readFileSync(`fixtures/gate1_${SPLIT}.json`, "utf8"));
  const N = Math.min(Number(process.env.N ?? 20), fx.cases.length);
  const cases = fx.cases.slice(0, N);
  const client = new Anthropic();
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  let exact = 0, regime = 0, reach = 0, baseline = 0, qTotal = 0, failed = 0;

  for (const c of cases) {
    if (c.baselineTop5.includes(c.want)) baseline++;
    if (c.subset.some((s: any) => s.id === c.want)) reach++;

    // Candidates are presented IN GATE 1'S ORDER, and that order is stated as
    // what it is: an empirical prior over what companies like this one have
    // actually won, built from 627,957 award pairs. Re-picking from scratch
    // threw that away and scored 13% against an 80% baseline -- the model was
    // reasoning from eligibility text alone, which cannot separate siblings.
    // Gate 2's job is to REFINE this order with what the founder tells us, not
    // to replace it.
    const menu = c.subset.map((s: any, i: number) => [
      `[${i}] ${s.name} — ${s.body || "n/a"} (${s.channel || "n/a"}, ${s.country || "n/a"})`,
      s.gates?.length ? `     requires: ${s.gates.join(" / ").slice(0, 260)}` : "",
    ].filter(Boolean).join("\n")).join("\n");

    try {
      // ── 2a. What should we ask? The writer never sees the founder. ──────
      const qResp: any = await client.messages.create({
        model: MODEL, max_tokens: 1500,
        messages: [{ role: "user", content:
`Below are ${c.subset.length} public funding schemes a company might apply to. They overlap heavily and many look alike on paper.

Write the 6-8 questions you would ask that company to work out WHICH of these schemes actually fit it. The best question is one where different schemes in this list demand different answers — a question every scheme answers the same way tells you nothing and wastes the founder's attention.

SCHEMES
${menu}

Reply with ONLY the questions, one per line, no numbering, no preamble.` }],
      });
      const questions = text(qResp).split("\n").map((x: string) => x.trim())
        .filter((x: string) => x.length > 12).slice(0, 8);
      qTotal += questions.length;
      if (!questions.length) { failed++; continue; }

      // ── 2b. The founder answers, knowing only their own company. ────────
      const aResp: any = await client.messages.create({
        model: MODEL, max_tokens: 1500,
        messages: [{ role: "user", content:
`You are the founder of this company. Answer each question briefly and honestly from what you know about your own company. If you genuinely cannot tell, say "not sure".

YOUR COMPANY
  country: ${c.country}
  sector: ${c.sector ?? "unknown"}
  what you do: ${c.description || "(no description)"}

QUESTIONS
${questions.join("\n")}

Reply with one answer per line, in order, no numbering.` }],
      });
      const answers = text(aResp).split("\n").map((x: string) => x.trim()).filter(Boolean);

      // ── 2b'. Retrieve the eligibility clauses that bear on those answers ──
      const evidence = await retrieveEvidence(
        pg, c.subset.map((s: any) => s.id),
        `${c.description ?? ""}\n${answers.join("\n")}`);

      // ── 2c. Narrow to five, using those answers. ────────────────────────
      const sResp: any = await client.messages.create({
        model: MODEL, max_tokens: 2048,
        messages: [{ role: "user", content:
`Pick the FIVE schemes this company should actually pursue.

COMPANY
  country: ${c.country}
  sector: ${c.sector ?? "unknown"}
  what they do: ${c.description || "(no description)"}

WHAT THEY TOLD US
${questions.map((q: string, i: number) => `Q: ${q}\nA: ${answers[i] ?? "not sure"}`).join("\n")}

SCHEMES
${c.subset.map((s: any, i: number) => {
  const ev = evidence.get(s.id);
  return [
    `[${i}] ${s.name} — ${s.body || "n/a"} (${s.channel || "n/a"}, ${s.country || "n/a"})`,
    s.gates?.length ? `     requires: ${s.gates.join(" / ").slice(0, 200)}` : "",
    ev?.length ? `     RELEVANT TO THEIR ANSWERS: ${ev.join(" | ")}` : "",
  ].filter(Boolean).join("\n");
}).join("\n")}

The list is ALREADY ORDERED by how often companies like this one — same country, same sector — have actually won each scheme. That ordering is empirical and it is strong: treat it as the starting point.

Your job is to REFINE it with what the founder just told you, not to rebuild it:
- Move a scheme DOWN when their answers show they clearly fail its stated requirement.
- Move a scheme UP when their answers speak directly to what it demands.
- Leave the rest alone. If their answers say nothing about a scheme, its position stands.
- Where two are equally good, prefer spread across EU / national / regional.

Start from the top of the list and adjust. Reply with ONLY the five index numbers, comma-separated, best first.` }],
      });
      const picks = (text(sResp).match(/\d+/g) ?? []).slice(0, 5).map((x: string) => Number(x))
        .filter((i: number) => i >= 0 && i < c.subset.length).map((i: number) => c.subset[i]);
      if (!picks.length) failed++;
      if (picks.some((s: any) => s.id === c.want)) exact++;
      if (picks.some((s: any) => s.regime === c.wantRegime)) regime++;
    } catch (e: any) {
      failed++;
      console.error(`  ${c.name}: ${e?.message ?? e}`);
    }
  }

  const n = cases.length;
  const pc = (x: number) => `${x}/${n} (${(100 * x / n).toFixed(0)}%)`;
  console.log(`\nmodel=${MODEL} split=${SPLIT} gate1@${fx.gate1Sha} n=${n}`);
  console.log(`  gate 1 handed over the right fund   ${pc(reach)}`);
  console.log(`  gate 1 deterministic top-5          ${pc(baseline)}   <- to beat`);
  console.log(`  mean follow-up questions asked      ${(qTotal / n).toFixed(1)}`);
  console.log(`\n  GATE 2 (ask -> answer -> narrow)`);
  console.log(`    exact   ${pc(exact)}   of reachable: ${reach ? (100 * exact / reach).toFixed(0) : 0}%`);
  console.log(`    regime  ${pc(regime)}   of reachable: ${reach ? (100 * regime / reach).toFixed(0) : 0}%`);
  if (failed) console.log(`    failed/unparseable: ${failed}`);

  await pg.end();
  appendFileSync(LOG, JSON.stringify({
    at: new Date().toISOString(), harness: "gate2_questions", model: MODEL,
    split: SPLIT, gate1Sha: fx.gate1Sha, n, reach, baseline, exact, regime, failed,
    meanQuestions: qTotal / n,
  }) + "\n");
}

main();
