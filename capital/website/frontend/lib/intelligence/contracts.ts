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
 * The writer's system prompt: who it is, then every contract in full.
 *
 * Deliberately the whole contract text rather than a summary, so the rules the
 * writer is held to are the rules it was given.
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
  // Shared rules plus the brief sections only. The round-2 contracts govern a
  // different stage; handing them to the writer would be noise it has to read
  // past on every request.
  const contracts = loadContracts().filter((c) => !c.stage.startsWith("round2."));
  const header =
    `You are an analyst inside Wincent, writing a short public-capital brief ` +
    `for the founder of a European company. You are given the company, the ` +
    `funds already selected for them, and the evidence behind both.\n\n` +
    `The brief has exactly four sections: the bottom line, the funds to ` +
    `target, positioning, and the state of play. Below is the contract for ` +
    `each, plus the shared grounding and voice rules. Treat every contract as ` +
    `binding: a brief that breaks a rule is wrong even when it reads well. ` +
    `Rules marked (hard) are checked mechanically after you write.\n`;
  return [header, ...contracts.map((c) => `\n# CONTRACT ${c.id} — ${c.stage}\n\n${c.body}`)].join("\n");
}
