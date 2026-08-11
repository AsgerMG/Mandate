// wsCD — the landscape read behind the open-question path.
//
// Stage 2 can only ask about a requirement it can turn into a fixed answer
// set. This counts, on the instruments the product actually PUBLISHES, how
// many filter-role requirements are outside that set and what they look like:
// how many carry a decidable comparator, how many carry a mapped field but no
// comparator, and how many are pure text.
//
// Read-only. Postgres and disk, no model calls.
//
//   npx tsx scripts/dump_publishable_ids.ts /tmp/pub.json
//   PUBLISHABLE=/tmp/pub.json npx tsx scripts/_wscd_landscape.ts
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wscd_landscape", ["DATABASE_URL"]);

const PUB = process.env.PUBLISHABLE;

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  let pop: Set<string> | null = null;
  if (PUB) {
    const ids = new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String));
    // An empty allow-list must end the run. Measuring nothing and exiting 0 is
    // the failure mode that once deleted 141 correct filters silently.
    if (ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing"); process.exit(1); }
    pop = ids;
  }

  const { rows } = await db.query(
    `SELECT instrument_id, gate_role, requirement,
            COALESCE(intake_field_resolved, intake_field) AS f,
            value_spec
       FROM eligibility_gates`);

  const bucket = new Map<string, { n: number; instruments: Set<string>; lens: number[] }>();
  const add = (k: string, r: { instrument_id: unknown; requirement: string | null }) => {
    const e = bucket.get(k) ?? { n: 0, instruments: new Set<string>(), lens: [] };
    e.n += 1;
    e.instruments.add(String(r.instrument_id));
    e.lens.push((r.requirement ?? "").trim().length);
    bucket.set(k, e);
  };

  let filters = 0;
  const textSamples: string[] = [];
  for (const r of rows) {
    if (pop && !pop.has(String(r.instrument_id))) continue;
    if (r.gate_role !== "filter") continue;
    filters += 1;
    const mapped = r.f != null && r.f !== "none";
    const spec = r.value_spec ? JSON.parse(r.value_spec) : null;
    const decidable = Boolean(spec && typeof spec === "object" && (spec as { op?: string }).op);
    const key = decidable ? "field + decidable comparator"
      : mapped ? "field, NO comparator"
        : "no field, no comparator (pure text)";
    add(key, r as never);
    if (!decidable && textSamples.length < 4000) textSamples.push((r.requirement ?? "").trim());
  }

  console.log(`filter-role gates on ${pop ? "publishable" : "all"} instruments: ${filters}\n`);
  const pct = (n: number) => `${(100 * n / filters).toFixed(1)}%`;
  for (const [k, v] of [...bucket.entries()].sort((a, b) => b[1].n - a[1].n)) {
    const median = v.lens.sort((a, b) => a - b)[Math.floor(v.lens.length / 2)] ?? 0;
    console.log(`${k.padEnd(36)} ${String(v.n).padStart(6)}  ${pct(v.n).padStart(6)}  `
      + `${String(v.instruments.size).padStart(4)} instruments  median ${median} chars`);
  }

  // How much of the undecidable pile is even long enough to phrase a question
  // from. Below ~60 chars a requirement is almost always a restatement of the
  // enum it maps to ("Must be an SME").
  const substantive = textSamples.filter((t) => t.length >= 60);
  console.log(`\nundecidable filter requirements: ${textSamples.length}`);
  console.log(`  of which >= 60 chars (phrasable): ${substantive.length}`);
  const distinct = new Set(substantive.map((t) =>
    t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)));
  console.log(`  distinct normalised texts:        ${distinct.size}`);

  await db.end();
}

main();
