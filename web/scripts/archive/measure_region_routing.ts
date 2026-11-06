// Can the founder's region pick the right body out of a group that shares a
// scheme name?
//
// This is the ONE question region routing exists to answer, isolated from the
// pool, the channels and the five display slots so it can be read without them.
// `measure_recall.ts` answers a different and harder one — did the fund reach
// the top five of ~58 — and a within-group result can move a long way there
// without moving that number at all.
//
// Reads the SHIPPED artifact through the SHIPPED scorer, so what is measured is
// what production does, not a reimplementation of it.
//
//   npx tsx scripts/measure_region_routing.ts
//   SET=__recallSetEnriched.json npx tsx scripts/measure_region_routing.ts
//   SPLIT=all npx tsx scripts/measure_region_routing.ts
//
// ── Read the two baselines, not the headline ───────────────────────────────
// UNIFORM is 1/|group| — what guessing scores. POPULARITY is always taking the
// biggest sibling, and it is the honest baseline: a ranker that knows nothing
// still gets it by picking the largest. A number that beats uniform but not
// popularity has learned that big funds are big.
//
// ── Why the default set is the repaired one ────────────────────────────────
// `__recallSet.json` traces awards with `scheme_code = call_id`, which is not
// unique: a notified scheme delivered by fourteen bodies is one SA number and
// fourteen instruments, so the label is close to a uniform draw over the group
// for exactly the population this script measures. Against that key the same
// scorer on the same rows reads 24.9% @1 and against the register's own
// attribution 66.2%. Run it both ways if you doubt it — the difference is the
// answer key, not the method.

import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("measure_region_routing", ["DATABASE_URL", "VOYAGE_KEY"]);

import { hydrateDbInstruments, loadDbInstruments, type DbInstrument } from "../../lib/intelligence/corpus";
import { regionScorer } from "../../lib/intelligence/shortlist";
import { regionFootprints } from "../../lib/intelligence/regionPrior";
import { loadRecallSet } from "../recallSet";

interface Pair {
  name: string; instrument: string; split: string;
  region?: string; regionSource?: string;
}

async function main() {
  await hydrateDbInstruments();
  const all = loadDbInstruments();
  const hasChildren = new Set(all.map((i) => i.parentId).filter(Boolean) as string[]);

  // The population: leaves sharing a display NAME with another leaf of the same
  // country. That is what a founder cannot tell apart on the page, and it is
  // the group the whole workstream is about. Stated over the corpus — no fund,
  // country or scheme code is named anywhere in this file.
  const groups = new Map<string, DbInstrument[]>();
  for (const i of all) {
    if (i.isFramework || hasChildren.has(i.id)) continue;
    // WIDTH= chooses the comparison group. `name` is the same-name group this
    // file was written for (median 7.4 members); `regime` is the whole family
    // by parent_id (median 75 in pool), which is the group the pool-to-table
    // diagnosis says actually matters. Measured side by side because a result
    // established on one is not a result on the other -- and the answer is that
    // it does not survive: `regionScorer`'s comment carries the numbers and the
    // three widenings they killed.
    const k = process.env.WIDTH === "regime"
      ? (i.parentId ?? i.id)
      : `${i.name}|${i.country ?? ""}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(i);
  }
  const groupOf = new Map<string, DbInstrument[]>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    for (const i of g) groupOf.set(i.id, g);
  }
  const fp = regionFootprints();
  console.log(`same-name groups            ${[...groups.values()].filter((g) => g.length > 1).length}`
    + `  covering ${groupOf.size} leaves`);
  console.log(`  ...with a region footprint ${[...groupOf.keys()].filter((id) => fp[id]).length}`);

  const { file: setFile, rows: loaded } = loadRecallSet();
  const split = process.env.SPLIT ?? "holdout";
  const pairs = (loaded as unknown as Pair[])
    .filter((p) => split === "all" || p.split === split);

  const rows: { want: string; group: DbInstrument[]; region: string; src: string }[] = [];
  const skipped = { notInGroup: 0, noRegion: 0 };
  for (const p of pairs) {
    const group = groupOf.get(p.instrument);
    if (!group) { skipped.notInGroup++; continue; }
    if (!p.region) { skipped.noRegion++; continue; }
    rows.push({ want: p.instrument, group, region: p.region, src: p.regionSource ?? "?" });
  }

  const report = (label: string, subset: typeof rows) => {
    if (!subset.length) return;
    let at1 = 0, at3 = 0, pop = 0, unif = 0;
    for (const r of subset) {
      const score = regionScorer(r.group, r.region);
      const ranked = [...r.group].sort((a, b) =>
        (score(b) - score(a)) || (b.eventCount - a.eventCount) || a.id.localeCompare(b.id));
      const at = ranked.findIndex((i) => i.id === r.want) + 1;
      if (at === 1) at1++;
      if (at <= 3) at3++;
      const biggest = [...r.group].sort((a, b) =>
        (b.eventCount - a.eventCount) || a.id.localeCompare(b.id))[0];
      if (biggest.id === r.want) pop++;
      unif += 1 / r.group.length;
    }
    const pc = (n: number) => `${String(n).padStart(4)}/${subset.length} (${(100 * n / subset.length).toFixed(1)}%)`;
    console.log(`\n  ${label}  n=${subset.length}`);
    console.log(`    region ranks the won body FIRST   ${pc(at1)}`);
    console.log(`    ...in its top three               ${pc(at3)}`);
    console.log(`    popularity baseline (biggest)     ${pc(pop)}`);
    console.log(`    uniform baseline                  ${(100 * unif / subset.length).toFixed(1)}%`);
  };

  console.log(`\nset=${setFile} split=${split}`);
  console.log(`  pairs whose won fund is in a same-name group: `
    + `${rows.length + skipped.noRegion} of ${pairs.length}`
    + `  (${skipped.noRegion} without a recoverable founder region)`);
  report("ALL, region from any award", rows);
  // The arm that cannot be circular: the founder's region comes only from this
  // company's awards under a DIFFERENT notified scheme, so no part of it was
  // reported by the scheme being ranked.
  report("LEAK-FREE, region from a different scheme", rows.filter((r) => r.src === "other_scheme"));
  for (const [lo, hi, lbl] of [[2, 2, "groups of 2"], [3, 5, "groups of 3-5"], [6, 99, "groups of 6+"]] as const) {
    report(lbl, rows.filter((r) => r.group.length >= lo && r.group.length <= hi));
  }
}
main();
