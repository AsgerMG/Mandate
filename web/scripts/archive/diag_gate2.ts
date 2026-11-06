// Diagnostic harness for gate 2. Instruments the existing 3-step pipeline and
// runs ablations on the SAME cases. Writes everything to JSON for analysis.
import { readFileSync, writeFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("diag_gate2", ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]);

const MODEL = process.env.MODEL ?? "claude-haiku-4-5";
const ROOT = "/Users/asgermollergrimberg/Wincent/web";
const OUT = process.env.OUT ?? "/private/tmp/claude-501/-Users-asgermollergrimberg-Wincent/1f599910-047b-4d24-8947-cb1c67ef6560/scratchpad/diag_out.json";

const text = (r: any) => (r.content ?? []).filter((b: any) => b?.type === "text")
  .map((b: any) => b.text).join("\n");

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

const client = new Anthropic();
async function ask(prompt: string, max_tokens = 2048): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await client.messages.create({ model: MODEL, max_tokens, messages: [{ role: "user", content: prompt }] });
      return text(r);
    } catch (e: any) {
      if (attempt === 3) throw e;
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
    }
  }
  return "";
}

/** Row renderer. mode: "body" = current harness, "profile" = full eligibility text. */
function row(s: any, i: number, ev: Map<string, string[]>, mode: string) {
  if (mode === "profile") {
    return `[${i}] ${s.name} (${s.channel || "n/a"}, ${s.country || "n/a"})\n` +
      `     ${String(s.profile || "n/a").replace(/\n/g, "\n     ")}` +
      (s.gates?.length ? `\n     requires: ${s.gates.join(" / ")}` : "") +
      ((ev.get(s.id) ?? []).length ? `\n     BEARS ON THEIR ANSWERS: ${ev.get(s.id)!.join(" | ")}` : "");
  }
  return `[${i}] ${s.name} — ${s.body || "n/a"} (${s.channel || "n/a"}, ${s.country || "n/a"})` +
    (s.gates?.length ? `\n     requires: ${s.gates.join(" / ").slice(0, 180)}` : "") +
    ((ev.get(s.id) ?? []).length ? `\n     BEARS ON THEIR ANSWERS: ${ev.get(s.id)!.join(" | ")}` : "");
}

const ORDER_CLAIM = `The list is ALREADY ORDERED by how often companies like this one have actually won each scheme. That ordering is empirical and strong — it is your starting point.

Refine it, do not rebuild it:
- Move a scheme DOWN when their answers show they fail its stated requirement.
- Move a scheme UP when their answers speak directly to what it demands.
- If their answers say nothing about a scheme, leave its position alone.
- Where two are equally good, prefer spread across EU / national / regional.`;

const NEUTRAL_CLAIM = `Judge them on the evidence above. Where two are equally good, prefer spread across EU / national / regional.`;

const DEMOTE_ONLY = `The list is ALREADY ORDERED by how often companies like this one have actually won each scheme. That ordering is empirical and beats your own judgement of the text.

Your ONLY power is to DEMOTE. Start from indices 0,1,2,3,4. You may drop one of them ONLY when an answer above EXPLICITLY disqualifies it — a stated requirement they plainly fail. A hunch, a feeling that another scheme "fits better", or a preference for a different funding level is NOT grounds to drop one. When you drop one, replace it with the next index down the list that is not disqualified.

If nothing is explicitly disqualified, reply exactly: 0,1,2,3,4`;

/** Exactly what measure_pipeline.ts does today: first five integers anywhere. */
function pickIdxNaive(out: string, n: number): number[] {
  return (out.match(/\d+/g) ?? []).slice(0, 5).map(Number).filter((i) => i >= 0 && i < n);
}
/** What it should do: the last line that is a comma-separated list of integers. */
function pickIdxRobust(out: string, n: number): number[] {
  const lines = out.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\[?\s*\d+(\s*[,;]\s*\d+)+\s*\]?\.?$/.test(lines[i])) {
      const nums = (lines[i].match(/\d+/g) ?? []).map(Number).filter((x) => x >= 0 && x < n);
      const seen = new Set<number>(); const res: number[] = [];
      for (const x of nums) { if (!seen.has(x)) { seen.add(x); res.push(x); } if (res.length === 5) break; }
      if (res.length) return res;
    }
  }
  return pickIdxNaive(out, n);
}

async function main() {
  const fx = JSON.parse(readFileSync(`${ROOT}/fixtures/gate1_holdout.json`, "utf8"));
  const N = Number(process.env.N ?? 40);
  const step = Math.max(1, Math.floor(fx.cases.length / N));
  const cases = fx.cases.map((c: any, i: number) => ({ c, i })).filter((_: any, i: number) => i % step === 0).slice(0, N);
  const ABL_EVERY = Number(process.env.ABL_EVERY ?? 2); // ablate on every 2nd of these -> 20 cases

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  const results: any[] = [];
  const one = async ({ c, i: fxIdx }: any, k: number) => {
    const rec: any = {
      fxIdx, name: c.name, country: c.country, sector: c.sector,
      description: c.description ?? "", want: c.want, wantRegime: c.wantRegime,
      wantPos: c.subset.findIndex((s: any) => s.id === c.want),
      subsetSize: c.subset.length,
      g1_top5: c.baselineTop5.includes(c.want),
      g1_top5_regime: c.baselineTop5.some((id: string) => c.subset.find((s: any) => s.id === id)?.regime === c.wantRegime),
      ablated: k % ABL_EVERY === 0,
      variants: {},
    };
    try {
      const menu = c.subset.map((s: any, i: number) =>
        `[${i}] ${s.name} — ${s.body || "n/a"} (${s.channel || "n/a"}, ${s.country || "n/a"})` +
        (s.gates?.length ? `\n     requires: ${s.gates.join(" / ").slice(0, 220)}` : "")).join("\n");

      const qOut = await ask(
`Below are ${c.subset.length} public funding schemes. They overlap heavily and many look alike on paper.

Write the 6-8 questions you would ask a company to work out WHICH of these actually fit it. The best question is one where different schemes here demand different answers; a question they all answer the same way tells you nothing.

SCHEMES
${menu}

Reply with ONLY the questions, one per line.`, 2048);
      const questions = qOut.split("\n").map((x) => x.trim()).filter((x) => x.length > 12).slice(0, 8);
      rec.questions = questions;

      const aOut = await ask(
`You are this company's founder. Answer each question briefly and honestly. If you cannot tell, say "not sure".

YOUR COMPANY
  country: ${c.country}
  sector: ${c.sector ?? "unknown"}
  what you do: ${c.description || "(no description)"}

QUESTIONS
${questions.join("\n")}

One answer per line, in order.`, 2048);
      const answers = aOut.split("\n").map((x) => x.trim()).filter(Boolean);
      rec.answers = answers;

      const ev = await retrieve(pg, c.subset.map((s: any) => s.id), `${c.description ?? ""}\n${answers.join("\n")}`);
      rec.evCount = ev.size;

      const qa = questions.map((qq, i) => `Q: ${qq}\nA: ${answers[i] ?? "not sure"}`).join("\n");
      const head = `COMPANY
  country: ${c.country}
  sector: ${c.sector ?? "unknown"}
  what they do: ${c.description || "(no description)"}
`;

      const run = async (label: string, order: any[], mode: string, withQA: boolean, tail: string) => {
        const prompt = `Pick the FIVE schemes this company should actually pursue.

${head}${withQA ? `\nWHAT THEY TOLD US\n${qa}\n` : ""}
SCHEMES
${order.map((s, i) => row(s, i, ev, mode)).join("\n")}

${tail}

Reply with ONLY the five index numbers, comma-separated, best first.`;
        const out = await ask(prompt, 2048);
        const idxN = pickIdxNaive(out, order.length);
        const idxR = pickIdxRobust(out, order.length);
        const mk = (idx: number[]) => {
          const picks = idx.map((j) => order[j]);
          return {
            picks,
            origPos: picks.map((p) => c.subset.findIndex((s: any) => s.id === p.id)),
            pickIds: picks.map((p) => p.id),
            pickNames: picks.map((p) => p.name),
            exact: picks.some((p) => p.id === c.want),
            regime: picks.some((p) => p.regime === c.wantRegime),
          };
        };
        const N_ = mk(idxN), R_ = mk(idxR);
        rec.variants[label] = {
          raw: out.slice(0, 1500),
          prose: !/^\s*\[?\s*\d/.test(out),
          shownIdx: idxN, origPos: N_.origPos, pickIds: N_.pickIds, pickNames: N_.pickNames,
          exact: N_.exact, regime: N_.regime,
          shownIdxRobust: idxR, origPosRobust: R_.origPos, pickIdsRobust: R_.pickIds,
          exactRobust: R_.exact, regimeRobust: R_.regime,
          parseDiffers: JSON.stringify(idxN) !== JSON.stringify(idxR),
          promptChars: prompt.length,
        };
      };

      // (a) current pipeline — every case
      await run("a_current", c.subset, "body", true, ORDER_CLAIM);

      if (rec.ablated) {
        await run("b_noquestions", c.subset, "body", false, ORDER_CLAIM);
        // deterministic shuffle so it is reproducible
        let seed = fxIdx * 2654435761 % 2147483647;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const shuf = c.subset.slice();
        for (let i = shuf.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shuf[i], shuf[j]] = [shuf[j], shuf[i]]; }
        rec.shuffleWantPos = shuf.findIndex((s: any) => s.id === c.want);
        await run("c_shuffled", shuf, "body", true, NEUTRAL_CLAIM);
        await run("c0_ordered_neutral", c.subset, "body", true, NEUTRAL_CLAIM);
        await run("d_fullprofile", c.subset, "profile", true, ORDER_CLAIM);
        await run("e_demoteonly", c.subset, "body", true, DEMOTE_ONLY);
      }
    } catch (e: any) {
      rec.error = String(e?.message ?? e);
    }
    results.push(rec);
    writeFileSync(OUT, JSON.stringify(results, null, 1));
    process.stdout.write(`${results.length}/${cases.length} ${c.name.slice(0, 30)} a=${rec.variants?.a_current?.exact ? "HIT" : "miss"}${rec.error ? " ERR:" + rec.error : ""}\n`);
  };

  const CONC = Number(process.env.CONC ?? 6);
  let cursor = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (cursor < cases.length) { const j = cursor++; await one(cases[j], j); }
  }));
  results.sort((a, b) => a.fxIdx - b.fxIdx);
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  await pg.end();
}
main();
