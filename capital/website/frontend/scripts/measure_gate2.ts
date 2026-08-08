// GATE 2: given the subset gate 1 handed over, does the model pick the right five?
//
// Runs entirely off `fixtures/gate1_<split>.json`, so a prompt change is
// measured in seconds instead of re-replaying the whole pipeline. The fixture
// records the gate-1 SHA it was built at, so every gate-2 number is traceable
// to the gate-1 behaviour it was measured against.
//
// The prompt itself lives in `contracts/selection/fund-selection.md` -- a
// diffable file, not a string buried here, because it is the thing most worth
// iterating on.
//
//   npx tsx scripts/measure_gate2.ts                    # whole fixture
//   N=30 MODEL=claude-haiku-4-5 npx tsx scripts/measure_gate2.ts
//   VARIANT=terse npx tsx scripts/measure_gate2.ts      # prompt A/B
import { readFileSync, appendFileSync, existsSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("measure_gate2", ["ANTHROPIC_API_KEY"]);

const MODEL = process.env.MODEL ?? "claude-sonnet-5";
const SPLIT = process.env.SPLIT ?? "holdout";
const VARIANT = process.env.VARIANT ?? "default";
const LOG = "fixtures/gate2_history.jsonl";

/** The rules the contract states, rendered for the model. Kept in sync by
 *  reading the contract file itself, so the measured prompt and the reviewed
 *  prompt can never drift apart. */
function rules(): string {
  const p = "contracts/selection/fund-selection.md";
  if (!existsSync(p)) throw new Error(`missing ${p}`);
  const md = readFileSync(p, "utf8");
  const body = md.split("## Rules")[1]?.split("## Measured")[0] ?? "";
  return body.trim();
}

function buildPrompt(c: any, variant: string): string {
  const menu = c.subset.map((s: any, i: number) => [
    `[${i}] ${s.name}`,
    `    body: ${s.body || "n/a"} | channel: ${s.channel || "n/a"} | country: ${s.country || "n/a"}`,
    variant === "terse" ? "" : (s.profile ? `    ${s.profile}` : ""),
    s.gates?.length ? `    who may apply: ${s.gates.join(" / ").slice(0, 300)}` : "",
  ].filter(Boolean).join("\n")).join("\n");

  return `A founder is seeking public funding. Choose the FIVE funds from the list they are most likely to be eligible for AND most likely to actually win.

FOUNDER
  country: ${c.country}
  sector: ${c.sector ?? "unknown"}
  what they do: ${c.description || "(no description given)"}

CANDIDATE FUNDS
${menu}

RULES
${rules()}

Reply with ONLY the five index numbers, comma-separated, best first. Example: 3,17,0,22,9`;
}

async function main() {
  const fx = JSON.parse(readFileSync(`fixtures/gate1_${SPLIT}.json`, "utf8"));
  const N = Math.min(Number(process.env.N ?? fx.cases.length), fx.cases.length);
  const cases = fx.cases.slice(0, N);
  const client = new Anthropic();

  let exact = 0, regime = 0, reach = 0, baseline = 0, bad = 0;
  for (const c of cases) {
    if (c.baselineTop5.includes(c.want)) baseline++;
    const reachable = c.subset.some((s: any) => s.id === c.want);
    if (reachable) reach++;
    try {
      const resp: any = await client.messages.create({
        model: MODEL, max_tokens: 2048,
        messages: [{ role: "user", content: buildPrompt(c, VARIANT) }],
      });
      const text = (resp.content ?? []).filter((b: any) => b?.type === "text")
        .map((b: any) => b.text).join("\n");
      const picks = (text.match(/\d+/g) ?? [] as string[]).slice(0, 5).map(Number)
        .filter((i: number) => i >= 0 && i < c.subset.length)
        .map((i: number) => c.subset[i]);
      if (!picks.length) bad++;
      if (picks.some((s: any) => s.id === c.want)) exact++;
      if (picks.some((s: any) => s.regime === c.wantRegime)) regime++;
    } catch (e: any) {
      bad++;
      console.error(`  ${c.name}: ${e?.message ?? e}`);
    }
  }

  const n = cases.length;
  const pc = (x: number) => `${x}/${n} (${(100 * x / n).toFixed(0)}%)`;
  console.log(`\nmodel=${MODEL} variant=${VARIANT} split=${SPLIT}  gate1@${fx.gate1Sha}  n=${n}`);
  console.log(`  reachable (right fund in subset)  ${pc(reach)}`);
  console.log(`  GATE 1 deterministic top-5        ${pc(baseline)}   <- the number to beat`);
  console.log(`  GATE 2 exact                      ${pc(exact)}   of reachable: ${reach ? (100 * exact / reach).toFixed(0) : 0}%`);
  console.log(`  GATE 2 regime                     ${pc(regime)}   of reachable: ${reach ? (100 * regime / reach).toFixed(0) : 0}%`);
  if (bad) console.log(`  unparseable/failed replies        ${bad}`);

  // Append-only history, so improvement is traceable run over run.
  appendFileSync(LOG, JSON.stringify({
    at: new Date().toISOString(), model: MODEL, variant: VARIANT, split: SPLIT,
    gate1Sha: fx.gate1Sha, n, reach, baseline, exact, regime, bad,
  }) + "\n");
}

main();
