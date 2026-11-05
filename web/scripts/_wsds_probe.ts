// wsDS — WHY WE WERE BILLED FOR THINKING WE COULD NOT READ.
//
// wsDQ's twelve-company run reported, on Nortal and Silvr, a response whose
// `usage.output_tokens_details.thinking_tokens` was 310 and 79 while the
// transcript recorded `THINKING (0 chars)`. Three explanations were open:
//
//   A  the `effort`/`max_tokens` interaction — a small max_tokens with thinking
//      on returns an empty content block (this repo hit that before, 3 of 8)
//   B  the response parsing — `thinkingOf` filters `type === "thinking"` and
//      would miss a differently-typed block
//   C  the API shape — the block arrives, and its TEXT is empty by default
//
// Only one of those is a bug in our code, and the fix differs in each case, so
// this probe asks the API rather than reasoning about it. It makes FOUR small
// calls on the same model the arm uses and prints, for each, every content
// block's `type` and the length of its `.thinking`, next to the billed
// thinking_tokens. Total spend is a fraction of a cent.
//
//   npx tsx scripts/_wsds_probe.ts
import { readFileSync } from "fs";
import path from "path";

import Anthropic from "@anthropic-ai/sdk";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

const MODEL = process.env.AGENT_SELECT_MODEL ?? "claude-sonnet-5";

// THE PROMPT IS NORTAL'S OWN, REPLAYED — not a small stand-in.
//
// A first version of this probe asked a three-line toy question and spent zero
// thinking tokens at every effort level, which says nothing: adaptive thinking
// declines to think about an easy question, so a toy prompt cannot reproduce a
// defect that only appears when the model DOES think. Nortal is the case that
// was actually billed (`output_tokens` 339, `thinking_tokens` 310, reply 37
// chars), so its bytes are the reproduction and anything else is a guess.
const WSDQ = path.join(
  __dirname, "..", "..", "capital",
  "project-mgmt", "findings", "first_test_wsDQ", "nortal", "prompt_r1.txt");

function nortalPrompt(): { system: string; user: string } {
  const raw = readFileSync(WSDQ, "utf8");
  const i = raw.indexOf("USER (");
  const sys = raw.slice(raw.indexOf("\n", raw.indexOf("=", 0)) + 1, i);
  const usr = raw.slice(raw.indexOf("\n", raw.indexOf("=", i)) + 1);
  // A silently mis-split prompt would make this probe measure a prompt nobody
  // ever sent, which is the failure the whole workstream exists to stop.
  const strip = (s: string) => s.replace(/^=+\n/gm, "").trim();
  return { system: strip(sys), user: strip(usr) };
}

type Arm = {
  label: string;
  maxTokens: number;
  effort: "low" | "medium" | "high";
  display?: "summarized" | "omitted";
};

const ARMS: Arm[] = [
  // The shipped shape, exactly: adviser max_tokens, effort low, no `display`.
  { label: "shipped (1536 tok, low, display unset)", maxTokens: 1536, effort: "low" },
  // Same budget and effort, `display` asked for explicitly. If this alone
  // produces readable text, the defect is C and the fix is one field.
  { label: "1536 tok, low, display=summarized", maxTokens: 1536, effort: "low", display: "summarized" },
  // Deeper thinking on the SAME small budget. This is where hypothesis A
  // would bite: thinking and reply share max_tokens.
  { label: "1536 tok, high, display=summarized", maxTokens: 1536, effort: "high", display: "summarized" },
  // Deeper thinking with room. If A is real, only this one comes back whole.
  { label: "8192 tok, high, display=summarized", maxTokens: 8192, effort: "high", display: "summarized" },
];

async function main(): Promise<void> {
  loadEnvLocal();
  requireCredentials("_wsds_probe", ["ANTHROPIC_API_KEY"]);
  const client = new Anthropic();
  const { system, user } = nortalPrompt();

  console.log(`model=${MODEL}  prompt=Nortal (wsDQ), system ${system.length} chars,`
    + ` user ${user.length} chars\n`);
  for (const arm of ARMS) {
    const r = await client.messages.create({
      model: MODEL,
      max_tokens: arm.maxTokens,
      thinking: {
        type: "adaptive" as const,
        ...(arm.display ? { display: arm.display } : {}),
      },
      output_config: { effort: arm.effort },
      system,
      messages: [{ role: "user", content: user }],
    }, { timeout: 120_000 });

    const u = r.usage as unknown as {
      output_tokens: number;
      output_tokens_details?: { thinking_tokens?: number };
    };
    const blocks = r.content.map((b) => {
      const t = b.type;
      if (t === "thinking") return `thinking(${(b as { thinking: string }).thinking.length} chars)`;
      if (t === "redacted_thinking") return "redacted_thinking";
      if (t === "text") return `text(${(b as { text: string }).text.length} chars)`;
      return t;
    });
    const text = r.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text).join("").trim();

    console.log(`── ${arm.label}`);
    console.log(`   stop_reason      ${r.stop_reason}`);
    console.log(`   thinking_tokens  ${u.output_tokens_details?.thinking_tokens ?? "(field absent)"}`);
    console.log(`   output_tokens    ${u.output_tokens}`);
    console.log(`   blocks           ${blocks.join(", ") || "(none)"}`);
    console.log(`   reply            ${JSON.stringify(text.slice(0, 120))}`);
    console.log();
  }
}

void main();
