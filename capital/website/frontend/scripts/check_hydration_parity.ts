// Does the Postgres path answer the same as the JSON path?
//
// ── Why this is the only proof that matters ────────────────────────────────
// Every other check runs NO_PG=1, so the whole suite is green regardless of
// what phase-one hydration does — it exercises the JSON fallback exclusively.
// Phase one now ships no gates except framework ones, and gates arrive per
// shortlist; if that goes wrong the failure is silent, because a fund with no
// gates evaluates nothing and assessInstrument returns `unknown` rather than
// throwing.
//
// So: run the same 12 archetypes down both paths and diff the answers. Two
// child processes, because dbInstrumentsCache is module-level and once one
// corpus is loaded the other path is unreachable in that process.
//
// It has already earned its place three times. It caught (1) framework gates
// shipped without their citation, so every framework check rendered
// sourceless; (2) Postgres ordering gate_key by locale collation while the
// export sorts by byte, so the two stores disagreed about which three criteria
// a row publishes; (3) no ORDER BY on the instruments query at all, so
// equal-ranked siblings resolved differently and a different Dutch scheme
// reached the founder depending on which store answered.
//
// Run after `make eligibility`, when SQLite and Postgres are in step.
import { execFileSync } from "node:child_process";
import { DISPLAY_CAP } from "../lib/intelligence/shortlist";

type Dump = Record<string, {
  ids: string[];
  rows: { id: string; gatesChecked: number | null; criteria: string[]; structuring: string[] }[];
  screen: { check: string; verified: boolean | null; sourced: boolean }[];
}>;

function run(env: Record<string, string>): Dump {
  const out = execFileSync("npx", ["tsx", "scripts/dump_verdicts.ts"], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(out) as Dump;
}

function main() {
  if (!process.env.DATABASE_URL) {
    console.log("check_hydration_parity: skipped — no DATABASE_URL, nothing to compare against");
    return;
  }

  const json = run({ NO_PG: "1" });
  const pg = run({ NO_PG: "" });
  const problems: string[] = [];

  for (const label of Object.keys(json)) {
    const a = json[label], b = pg[label];
    if (!b) {
      problems.push(`${label}: missing from the Postgres run`);
      continue;
    }
    // Order is asserted for the rows a founder SEES; beyond that, membership.
    //
    // Ranking now blends semantic scores, and the two stores answer from
    // slightly different floats (cached vs live pgvector). Ties past the
    // display cap can therefore swap without anything user-visible changing,
    // and a guard that fails on that trains people to ignore it. What must
    // never differ is the published rows and which funds were considered at
    // all -- both of which this still checks exactly.
    const shown = (x: string[]) => x.slice(0, DISPLAY_CAP).join("|");
    const sameShown = shown(a.ids) === shown(b.ids);
    const sameSet = [...a.ids].sort().join("|") === [...b.ids].sort().join("|");
    if (!sameShown || !sameSet) {
      const onlyJson = a.ids.filter((i) => !b.ids.includes(i));
      const onlyPg = b.ids.filter((i) => !a.ids.includes(i));
      problems.push(
        `${label}: different rows selected\n      only JSON: ${onlyJson.join(", ") || "(order only)"}` +
        `\n      only PG:   ${onlyPg.join(", ") || "(order only)"}`);
    }
    // gatesChecked is the number that catches the inheritance trap: a child
    // hydrated without its regime evaluates nothing and reads `unknown`.
    for (const ra of a.rows) {
      const rb = b.rows.find((r) => r.id === ra.id);
      if (!rb) continue;
      if (ra.gatesChecked !== rb.gatesChecked) {
        problems.push(`${label} / ${ra.id}: gatesChecked ${ra.gatesChecked} vs ${rb.gatesChecked}`);
      }
      if (ra.criteria.join("|") !== rb.criteria.join("|")) {
        problems.push(`${label} / ${ra.id}: published criteria differ (gate order)`);
      }
    }
    if (JSON.stringify(a.screen) !== JSON.stringify(b.screen)) {
      problems.push(`${label}: eligibility screen differs (framework citations?)`);
    }
  }

  if (problems.length) {
    console.error(`check_hydration_parity: ${problems.length} difference(s) between the Postgres and JSON paths.`);
    for (const p of problems.slice(0, 12)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`check_hydration_parity: ok — ${Object.keys(json).length} archetypes identical on both paths`);
}

main();
