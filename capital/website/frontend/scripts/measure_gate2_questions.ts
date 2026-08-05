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

async function main() {
  const fx = JSON.parse(readFileSync(`fixtures/gate1_${SPLIT}.json`, "utf8"));
  const N = Math.min(Number(process.env.N ?? 20), fx.cases.length);
  const cases = fx.cases.slice(0, N);
  const client = new Anthropic();

  let exact = 0, regime = 0, reach = 0, baseline = 0, qTotal = 0, failed = 0;

  for (const c of cases) {
    if (c.baselineTop5.includes(c.want)) baseline++;
    if (c.subset.some((s: any) => s.id === c.want)) reach++;

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
      const questions = text(qResp).split("\n").map((s) => s.trim())
        .filter((s) => s.length > 12).slice(0, 8);
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
      const answers = text(aResp).split("\n").map((s) => s.trim()).filter(Boolean);

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
${questions.map((q, i) => `Q: ${q}\nA: ${answers[i] ?? "not sure"}`).join("\n")}

SCHEMES
${menu}

Use their answers to rule schemes in and out. A scheme whose stated requirement they clearly fail is not a candidate however well it otherwise fits. Where two schemes are equally good, prefer spread across EU / national / regional so they have real alternatives.

Reply with ONLY the five index numbers, comma-separated, best first.` }],
      });
      const picks = (text(sResp).match(/\d+/g) ?? []).slice(0, 5).map(Number)
        .filter((i) => i >= 0 && i < c.subset.length).map((i) => c.subset[i]);
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

  appendFileSync(LOG, JSON.stringify({
    at: new Date().toISOString(), harness: "gate2_questions", model: MODEL,
    split: SPLIT, gate1Sha: fx.gate1Sha, n, reach, baseline, exact, regime, failed,
    meanQuestions: qTotal / n,
  }) + "\n");
}

main();
