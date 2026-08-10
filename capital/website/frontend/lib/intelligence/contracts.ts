// Loads the brief contracts and assembles them into the writer's instructions.
//
// The contracts (contracts/**.md) are the single source of truth for what each
// section of the brief may say. They are read at request time and concatenated
// into the prompt, so changing what the brief says is a markdown edit rather
// than a TypeScript one.
//
// ── Why this exists ────────────────────────────────────────────────────────
// The per-section rules previously lived in a ~200-line template literal
// inside the synthesis function, interleaved with evidence assembly, while a
// separate instructions file still described an earlier version of the report
// that had been retired. Two sources, one of them silently wrong, and nothing
// broke when they diverged — because nothing checked.
//
// scripts/check_contracts.ts is what makes this arrangement hold: it fails the
// build when a contract names a schema field that does not exist, when a check
// enforces a rule no contract declares, when a rule id is declared twice, or
// when ANY rule -- hard, soft, judged or Banned -- is neither enforced by a
// named check nor declared in `unenforcedRules.ts` with the predicate that
// would decide it.
import { readFileSync, readdirSync } from "fs";
import path from "path";

export interface Contract {
  /** Rule-id prefix, e.g. "SOP". Every rule in the file is `${id}-n`. */
  id: string;
  /** Dotted stage name, e.g. "brief.state-of-play". */
  stage: string;
  /** Report schema fields this contract governs. */
  schemaFields: string[];
  /** Evidence block names this contract's section may draw on. */
  evidence: string[];
  /** Everything below the frontmatter, verbatim. */
  body: string;
  /** Rule ids declared in the body, in order of appearance. */
  ruleIds: string[];
  /** Source path, for error messages. */
  file: string;
}

/** Frontmatter is a deliberately tiny subset of YAML: `key: value` and
 *  `key: [a, b]`. A full parser would be a dependency for four fields. */
function parseFrontmatter(raw: string, file: string): { meta: Record<string, string | string[]>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`contract ${file} has no frontmatter block`);
  const meta: Record<string, string | string[]> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    const list = value.match(/^\[(.*)\]$/);
    meta[key] = list
      ? list[1].split(",").map((s) => s.trim()).filter(Boolean)
      : value.trim();
  }
  return { meta, body: m[2].trim() };
}

const RULE_ID = /^-\s+([A-Z]+-B?\d+)\s/gm;

function parseContract(file: string, raw: string): Contract {
  const { meta, body } = parseFrontmatter(raw, file);
  const asList = (v: string | string[] | undefined): string[] =>
    Array.isArray(v) ? v : v ? [v] : [];
  const ruleIds = [...body.matchAll(RULE_ID)].map((m) => m[1]);
  return {
    id: String(meta.id ?? ""),
    stage: String(meta.stage ?? ""),
    schemaFields: asList(meta.schema_fields),
    evidence: asList(meta.evidence),
    body,
    ruleIds,
    file,
  };
}

let cache: Contract[] | null = null;

/** All contracts, shared ones first, then the brief sections in file order
 *  (the numeric prefixes are what order the brief itself). */
export function loadContracts(): Contract[] {
  if (cache) return cache;
  const root = path.join(process.cwd(), "contracts");
  const read = (dir: string) =>
    readdirSync(path.join(root, dir))
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => parseContract(path.join(dir, f), readFileSync(path.join(root, dir, f), "utf8")));
  // Every directory under contracts/, discovered rather than listed. The list
  // was `_shared`, `brief`, `round2` -- and `selection/` existed the whole
  // time, holding six rules, two of them (hard), which no loader read and
  // therefore no check could see. A registry of directories is the same defect
  // class as a register of banned phrases: it only ever covers what someone
  // remembered to add.
  cache = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .flatMap(read);
  return cache;
}

export function briefContracts(): Contract[] {
  return loadContracts().filter((c) => c.stage.startsWith("brief."));
}

/** The round-2 contracts, for the question generators and their checks. */
export function roundContracts(): Contract[] {
  return loadContracts().filter((c) => c.stage.startsWith("round2."));
}

/**
 * ── WHICH PROMPT READS WHICH CONTRACT ──────────────────────────────────────
 *
 * Routing is stated positively, per prompt, over the contract's own `stage`.
 * It used to be one negative filter inside the writer's assembler
 * (`!c.stage.startsWith("round2.")`), and a negative filter is an exclusion
 * register: it names the one stage someone remembered was wrong and admits
 * every stage nobody has thought about yet.
 *
 * `contracts/selection/` was that case. Stage `gate2.select`, six rules, and
 * it was appended to the MEMO WRITER's system prompt on every request —
 * telling the writer to "Return exactly five indices from the list, best
 * first" while FUND-2 in the same prompt caps the table at seven rows and
 * FUND-12 forbids describing rows as first, best or strongest. Three
 * contradictory instructions, one prompt, nothing complaining.
 *
 * The test for a stage nobody has added yet: a contract reaches a prompt only
 * when that prompt's own predicate admits its stage. A stage no prompt admits
 * fails `check_contracts.ts` unless it is declared in `UNROUTED_STAGES` with
 * the reason — the same forced-decision shape as `unenforcedRules.ts`.
 */
export const PROMPTS = {
  writer: {
    what: "the memo writer",
    reads: (stage: string) => stage === "shared" || stage.startsWith("brief."),
    header:
      `You are an analyst inside Wincent, writing a short public-capital brief ` +
      `for the founder of a European company. You are given the company, the ` +
      `funds already selected for them, and the evidence behind both.\n\n` +
      `The brief has exactly four sections: the bottom line, the funds to ` +
      `target, positioning, and the state of play. Below is the contract for ` +
      `each, plus the shared grounding and voice rules. Treat every contract as ` +
      `binding: a brief that breaks a rule is wrong even when it reads well. ` +
      `Rules marked (hard) are checked mechanically after you write.\n`,
  },
  planner: {
    what: "the round-2 question planner",
    reads: (stage: string) => stage === "shared" || stage.startsWith("round2."),
    header:
      `You are an analyst inside Wincent, planning the second screen of ` +
      `questions a European founder will answer before their public-capital ` +
      `brief is written. You are given what they have already told us and the ` +
      `funds whose requirements are still open.\n\n` +
      `Below is the contract for that screen, plus the shared grounding and ` +
      `voice rules, which the questions and their options obey exactly as the ` +
      `brief does. Treat every contract as binding.\n`,
  },
  /** The stages that read a founder's words and return a judgement rather than
   *  founder-facing prose: the eligibility judge and the comparable-company
   *  researcher. They need the claims discipline and nothing else — neither
   *  ranks, selects, or writes a section of the brief. */
  screen: {
    what: "the eligibility judge and the comparable-company researcher",
    reads: (stage: string) => stage === "shared",
    header:
      `You are an analyst inside Wincent, which tracks Europe's state-backed ` +
      `capital and tells a founder what of it is open to them. Your output is ` +
      `read by the rest of that machine, not published as written.\n\n` +
      `Below are the claims rules every stage obeys. Treat them as binding: a ` +
      `judgement that breaks one is wrong even when it reads well.\n`,
  },
} as const;

export type PromptName = keyof typeof PROMPTS;

/**
 * Stages whose contract deliberately reaches NO prompt, and why.
 *
 * A third state has to be declared, not discovered — the same reason
 * `unenforcedRules.ts` exists. Without this register, "no prompt reads it" and
 * "someone forgot to route it" look identical from outside.
 */
export const UNROUTED_STAGES: Record<string, string> = {
  "gate2.select":
    "The module these rules specified (lib/intelligence/fundSelection.ts) is " +
    "DELETED — wsDO, 2026-08-11. It never had a production caller: " +
    "`selectFiveFunds` was imported only by scripts/measure_pipeline.ts, and " +
    "every configuration that let it reorder measured at or below the " +
    "deterministic ranker on the same cases (the whole ladder is preserved in " +
    "project-mgmt/findings/dead_ranker_wsDO.md). So this contract currently " +
    "specifies nothing that runs, which is a stronger reason not to route it " +
    "than the one it replaces. Route it the moment the LLM selector ships — " +
    "and read the findings doc first, because two of these rules contradict " +
    "the writer's own contract (FUND-2 caps the table at seven rows, FUND-12 " +
    "forbids describing rows as first, best or strongest).",
};

/** Every contract carried into `prompt`, shared ones first, then the sections
 *  in file order (the numeric prefixes are what order the brief itself). */
export function contractsFor(prompt: PromptName): Contract[] {
  return loadContracts().filter((c) => PROMPTS[prompt].reads(c.stage));
}

/**
 * A prompt's system instructions: who it is, then every contract routed to it
 * in full.
 *
 * Deliberately the whole contract text rather than a summary, so the rules the
 * stage is held to are the rules it was given.
 */
export function assembleInstructions(prompt: PromptName): string {
  const { header } = PROMPTS[prompt];
  return [header, ...contractsFor(prompt).map((c) => `\n# CONTRACT ${c.id} — ${c.stage}\n\n${c.body}`)].join("\n");
}

/**
 * The writer's system prompt. A thin alias for `assembleInstructions("writer")`
 * so the memo path reads as what it is.
 *
 * ── A claim that was here and was FALSE ───────────────────────────────────
 * This docstring used to say "the contracts are also what the quality judge
 * reads". There is no quality judge. Nothing in this repo reads a contract and
 * scores a rule: the only consumers of `loadContracts()` are
 * `scripts/check_contracts.ts`, the provenance labeller, and the line below.
 * `openJudge.ts` judges a founder's prose against a fund's verbatim
 * requirement and never sees a rule id.
 *
 * That sentence was load-bearing. `check_contracts.ts` exempted every
 * `(judged)` and `(soft)` rule from its unenforced-rule loop on exactly this
 * ground, so 46 rules were addressed to a reader that does not exist. The
 * exemption is gone; see `unenforcedRules.ts`, which now declares each of them
 * and what checking it would take.
 */
export function assembleWriterInstructions(): string {
  return assembleInstructions("writer");
}
