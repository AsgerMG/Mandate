// Does the degradation policy hold on a copy that has actually fallen behind?
//
// ── Why this exists ───────────────────────────────────────────────────────
// The policy's whole claim is about a stale copy, and the committed snapshot is
// republished on every corpus change. Measuring against it therefore only ever
// asks the one question that cannot fail: "does the policy hold when the two
// stores already agree." On 2026-08-07 they agree exactly — the snapshot would
// offer nothing Postgres refuses, with the policy switched OFF entirely.
//
// So the copy has to be pushed back to the states the incident passed through,
// and the live register asked about the result. Three of them, each a real
// shape this repo has been in:
//
//   current     the committed snapshot as published.
//   stale       every call deadline stripped: the copy as it was before the
//               call registers were loaded, but with the basis column present.
//               This is the shape the policy is FOR.
//   no-basis    the schemeEndBasis key deleted from every record — literally
//               the 2026-08-06 artifact, which carried no such key at all.
//
// The referee is `publishableInstruments()` run against Postgres, never
// `isClosed()` over raw rows: read raw, the successor redirect makes seven
// prolonged schemes look dead. Same referee check_degradation.ts uses.
//
//   npx tsx scripts/probe_stale_snapshot.ts
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("probe_stale_snapshot", ["DATABASE_URL"]);

interface Set_ {
  provenance: { source: string; instruments: number; observedAt: string };
  publishable: string[];
  withheld: { id: string; country: string }[];
}

function corpusSet(env: Record<string, string>): Set_ {
  const out = execFileSync("npx", ["tsx", "scripts/probe_publishable_set.ts"], {
    env: { ...process.env, ...env }, encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(out) as Set_;
}

type Rec = Record<string, unknown>;

function main() {
  if (!process.env.DATABASE_URL) {
    console.error("probe_stale_snapshot: needs DATABASE_URL — the live register is the referee.");
    process.exit(1);
  }
  const shipped = JSON.parse(
    readFileSync("public/data/instrument_terms.json", "utf8")) as
    { generatedAt?: string; records: Rec[] };

  // ── stale: the copy from before the call registers were loaded ───────────
  const stale = { ...shipped, records: shipped.records.map((r) =>
    r.schemeEndBasis === "call_deadline"
      ? { ...r, schemeEndDate: null, schemeEndBasis: null } : r) };
  writeFileSync("/tmp/snapshot_stale.json", JSON.stringify(stale));

  // ── no-basis: the 2026-08-06 artifact, which had no such key ─────────────
  const noBasis = { ...shipped, records: shipped.records.map((r) => {
    const c = { ...r }; delete c.schemeEndBasis; return c;
  }) };
  writeFileSync("/tmp/snapshot_nobasis.json", JSON.stringify(noBasis));

  const live = corpusSet({ NO_PG: "" });
  if (live.provenance.source !== "postgres") {
    console.error(`probe_stale_snapshot: the referee arm did not reach Postgres ` +
      `(source=${live.provenance.source}). Refusing to report.`);
    process.exit(1);
  }
  const offerable = new Set(live.publishable);
  console.log(`referee: postgres, ${live.provenance.instruments} instruments, ` +
    `${offerable.size} offerable`);
  console.log(`copy under test: ${shipped.records.length} records, ` +
    `generatedAt ${shipped.generatedAt}\n`);

  const arms: [string, Record<string, string>][] = [
    ["current", { NO_PG: "1" }],
    ["stale (no call deadlines)", { NO_PG: "1", SNAPSHOT_FILE: "/tmp/snapshot_stale.json" }],
    ["no-basis (the 2026-08-06 shape)", { NO_PG: "1", SNAPSHOT_FILE: "/tmp/snapshot_nobasis.json" }],
  ];
  console.log(`${"copy".padEnd(34)} ${"offered".padStart(7)} ${"withheld".padStart(8)} ` +
    `${"DEAD OFFERED".padStart(12)}`);
  let anyHarm = false;
  for (const [label, env] of arms) {
    const s = corpusSet(env);
    const dead = s.publishable.filter((id) => !offerable.has(id));
    if (dead.length) anyHarm = true;
    console.log(`${label.padEnd(34)} ${String(s.publishable.length).padStart(7)} ` +
      `${String(s.withheld.length).padStart(8)} ${String(dead.length).padStart(12)}` +
      (dead.length ? `   <- a founder can be shown these` : ""));
  }
  console.log(`\nDEAD OFFERED is the whole assertion: rows this copy would put in front of a`);
  console.log(`founder that the live register would refuse. It must be 0 in every row.`);
  if (anyHarm) {
    console.log(`\nIt is not 0. The policy does not hold on a copy in that state, and the`);
    console.log(`clause that would have to catch it is named in liveness.ts.`);
  }
}

main();
