// wsCC — STEP 2, the part a structural proxy cannot do: decide, for each
// requirement a fund makes, WHICH TOOL CAN DECIDE IT.
//
// The house rule is to prefer model judgement where the task is genuinely
// fuzzy, and this one is: "could a comparator over a printable answer set
// decide this sentence?" is a question about meaning, not about columns. The
// free structural proxy in `_wscc_ceiling.ts` can only separate "has a mapped
// intake field" from "does not", which is a fact about our encoding effort
// rather than about the requirement.
//
// The prompt below states a PROPERTY AND A TEST for each class and gives NO
// examples drawn from the corpus — no fund, no country, no sector, no
// threshold value appears in it. That is deliberate: a classifier taught by
// enumeration would score the cases it was shown and fail the rest, which is
// exactly the overfit the standing constraint forbids.
//
// Results are cached by text hash in CLASSIFY_CACHE, so a re-run is FREE.
//
// Usage:
//   PUBLISHABLE=/tmp/pub.json CLASSIFY_CACHE=/tmp/wscc_labels.json \
//     npx tsx scripts/_wscc_classify.ts
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
import { canopy, loadGates, readPub } from "./_wscc_demand";

loadEnvLocal();
requireCredentials("wscc_classify", ["DATABASE_URL", "ANTHROPIC_API_KEY"]);
const CACHE = process.env.CLASSIFY_CACHE ?? "/tmp/wscc_labels.json";
const OUT = process.env.LABELS_OUT ?? "/tmp/wscc_cluster_labels.json";
const TAU = Number(process.env.TAU ?? 0.72);
const MODEL = process.env.CLASSIFY_MODEL ?? "claude-haiku-4-5";
const BATCH = Number(process.env.CLASSIFY_BATCH ?? 30);
const LIMIT = process.env.CLASSIFY_LIMIT ? Number(process.env.CLASSIFY_LIMIT) : Infinity;

const SYSTEM = `You classify eligibility requirements that public funding programmes place on applicants.

For each requirement, decide WHAT AN APPLICANT WOULD HAVE TO SAY for the requirement to be decidable, and return exactly one class.

C1 — DECIDABLE FROM A PRINTABLE ATTRIBUTE OF THE APPLICANT.
  The requirement's truth is a function of an attribute that every applicant has and that could be offered as a fixed answer set or a single number on a standard scale: how many people it employs, its turnover or balance sheet, where it is registered or operates, its legal form or organisation type, how old it is, its ownership, its insolvency or sanction status, how much money it wants, what share it can co-finance, how far along the work is.
  TEST: two applicants who agree on every such attribute always get the same verdict, AND the question could be printed unchanged on a form that serves every programme in existence.

C2 — DECIDABLE FROM A FACT THE APPLICANT HOLDS, BUT IN THE PROGRAMME'S OWN UNITS.
  The truth follows deterministically once one number or one yes/no is known, but that number is specific to this programme's subject matter — a physical capacity, an area, a volume, a distance, a count of partners, a total project cost floor, whether work has already begun, whether the applicant has taken part in a named earlier scheme, whether it holds a particular certification.
  TEST: the verdict follows from a fact the applicant knows, but no single form could enumerate the possible questions across all programmes.

F — REQUIRES JUDGEMENT ABOUT WHAT THE PROJECT IS.
  The verdict depends on reading a description of the project, the technology, the team or the plan against the programme's purpose. Novelty, ambition, fit with an objective, coherence, adequacy of capability, quality of an approach.
  TEST: two applicants identical on every printable attribute AND every programme-specific number can still get different correct verdicts, because the verdict depends on what the project actually is.

U — NOT DETERMINED BY THE APPLICANT AT ALL.
  Discretion of the granting body, competitive ranking against other applicants, availability of budget, an outcome of an assessment yet to happen, or a fact the applicant cannot hold when applying. Also use U when the sentence states a property of the PROGRAMME rather than a condition on the applicant.
  TEST: there is no true statement the applicant could make that changes the verdict.

Order of preference when a sentence is mixed: if any part of it needs judgement about the project, choose F; otherwise if any part is in programme-specific units, choose C2; otherwise C1. Choose U only when nothing about the applicant decides it.`;

const SCHEMA = {
  type: "object",
  properties: {
    labels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          c: { type: "string", enum: ["C1", "C2", "F", "U"] },
        },
        required: ["i", "c"],
        additionalProperties: false,
      },
    },
  },
  required: ["labels"],
  additionalProperties: false,
} as const;

const key = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const ids = readPub();
  const all = await loadGates(db, ids);
  const filters = all.filter((r) => r.role === "filter");
  await db.end();

  // One classification per DISTINCT requirement sentence, not per gate: the
  // same sentence appears on up to 94 instruments and its class cannot differ.
  const norm = (r: (typeof filters)[number]) => String(r.requirement).replace(/\s+/g, " ").trim();
  const texts = [...new Set(filters.map(norm))].filter((t) => t.length > 0).sort();
  console.log(`filter gates ${filters.length}; distinct requirement sentences ${texts.length}`);

  const cache: Record<string, string> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const todo = texts.filter((t) => !cache[key(t)]).slice(0, LIMIT);
  console.log(`cached ${texts.length - texts.filter((t) => !cache[key(t)]).length}, to classify ${todo.length}, model ${MODEL}`);

  const client = new Anthropic();
  let inTok = 0, outTok = 0, done = 0;
  for (let b = 0; b < todo.length; b += BATCH) {
    const chunk = todo.slice(b, b + BATCH);
    const body = chunk.map((t, i) => `${i}. ${t.slice(0, 400)}`).join("\n");
    let res;
    try {
      res = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        // Haiku 4.5 predates adaptive thinking; omitting `thinking` runs
        // without it, which is what a short classification wants.
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: `Classify each numbered requirement. Return one label per number.\n\n${body}` }],
      } as any);
    } catch (e: any) {
      console.error(`batch ${b} failed: ${e?.message ?? e}`);
      continue;
    }
    inTok += res.usage.input_tokens; outTok += res.usage.output_tokens;
    const text = res.content.find((c: any) => c.type === "text") as any;
    let parsed: { labels: { i: number; c: string }[] };
    try { parsed = JSON.parse(text.text); } catch { console.error(`batch ${b}: unparseable`); continue; }
    for (const { i, c } of parsed.labels) if (chunk[i]) cache[key(chunk[i])] = c;
    done += parsed.labels.length;
    writeFileSync(CACHE, JSON.stringify(cache));
    if ((b / BATCH) % 10 === 0)
      console.log(`  ${done}/${todo.length}  in ${inTok} out ${outTok}`);
  }
  // Haiku 4.5 list price, 2026-08: $1.00 / $5.00 per million tokens.
  const cost = (inTok / 1e6) * 1.0 + (outTok / 1e6) * 5.0;
  console.log(`\nclassified ${done} sentences; tokens in ${inTok} out ${outTok}; COST $${cost.toFixed(3)}`);

  // ── roll sentence labels up to demand clusters ────────────────────────────
  const cid = canopy(filters, TAU);
  const votes = new Map<number, Map<string, number>>();
  const missing = new Set<string>();
  filters.forEach((r, i) => {
    const l = cache[key(norm(r))];
    if (!l) { missing.add(norm(r)); return; }
    const m = votes.get(cid[i]) ?? votes.set(cid[i], new Map()).get(cid[i])!;
    m.set(l, (m.get(l) ?? 0) + 1);
  });
  const labels: Record<string, string> = {};
  // A cluster takes the class its gates most often carry. Ties break toward the
  // class that DEMANDS MORE of the founder (F > C2 > C1 > U), so a mixed
  // cluster is never credited to the cheaper tool by accident.
  const RANK = ["F", "C2", "C1", "U"];
  for (const [c, m] of votes) {
    const best = [...m].sort((a, b) => b[1] - a[1] || RANK.indexOf(a[0]) - RANK.indexOf(b[0]))[0];
    labels[String(c)] = best[0];
  }
  writeFileSync(OUT, JSON.stringify(labels, null, 1));
  console.log(`labelled ${Object.keys(labels).length} demand clusters -> ${OUT}` +
    (missing.size ? `  (${missing.size} sentences still unlabelled)` : ""));

  // Purity: how often does a cluster mix classes? A low number means the
  // clustering and the split are describing the same structure.
  let pure = 0;
  for (const [, m] of votes) if (m.size === 1) pure++;
  console.log(`cluster purity: ${pure}/${votes.size} clusters carry a single class ` +
    `(${(100 * pure / votes.size).toFixed(0)}%)`);

  const gateCounts = new Map<string, number>();
  filters.forEach((r) => { const l = cache[key(norm(r))]; if (l) gateCounts.set(l, (gateCounts.get(l) ?? 0) + 1); });
  console.log("\nper-GATE class distribution (before cluster roll-up)");
  for (const [k, v] of [...gateCounts].sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(4)} ${String(v).padStart(5)}  ${(100 * v / filters.length).toFixed(1)}%`);
})();
