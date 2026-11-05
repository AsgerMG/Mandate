/**
 * wsIM — what the harness's `fieldChannels` is, and what production's was.
 *
 * FREE, OFFLINE, REPRODUCIBLE. No credentials, no database, no network, no
 * model call. `matchCompany` and `findPeersBySubsector` read one committed
 * static file (`public/data/companies_index.json`); nothing here touches
 * Postgres, Railway or an API key.
 *
 *   npx tsx scripts/_wsim_mediator.ts
 *
 * ── What it measures, and why that quantity ───────────────────────────────
 * `discoverAndResearch` is a paid, web-search-grounded call production makes on
 * every brief. Its matched output unions into `fieldChannels` (pipeline.ts
 * 1836), which seeds `codes` in `selectInstrumentRows` -- pool membership --
 * and sets `usedInField`, tier 1 of the row sort above the entire score
 * (shortlist.ts 3312). `measure_funnel.ts` -- `npm run stages` -- builds
 * `fieldChannels` from `dbPeers` alone (line 832) and passes `records: []`
 * (line 872).
 *
 * `fieldChannels` is the MEDIATOR: if it is identical on two paths, everything
 * downstream of it is bit-identical for that founder. So the rate at which it
 * differs is a HARD UPPER BOUND on the share of founders whose published rows
 * can differ, and it is measurable without buying anything -- which `codes` and
 * the published six are not, because they need the live corpus and the
 * embedding ranker.
 *
 * ── Two parts, two populations, and they are NOT the same population ──────
 * A. The harness's own draw (holdout n described, one per company): what
 *    `fieldChannels` IS on every founder `npm run stages` measures. Exact.
 * B. The 51 recovered production runs in
 *    `project-mgmt/findings/stage_declared_wsIM/recovered_runs.json`: real
 *    live-web-search briefs, 13 companies, whose comparable firms the report
 *    recorded by name. Their channels are recoverable from the same static
 *    index. Thirteen bench companies are NOT the 897 and nothing here may be
 *    generalised from them -- they are an existence proof and a direction.
 */
// Pinned OFFLINE the way `_wsil_ctx.ts` is: every module below reads its
// credentials lazily, so destroying them is what makes the header true. NOT
// `NO_PG=1` -- that also serves a snapshot corpus and a lexical ranker.
delete process.env.DATABASE_URL;
delete process.env.VOYAGE_KEY;

import { readFileSync } from "fs";
import path from "path";

import {
  findPeersBySubsector, isGenericSubsector, matchCompany,
} from "../lib/intelligence/corpus";
import { founderIntake, founderPolicyFromEnv } from "./founderIntake";
import { isDescribed, loadRecallSet, type RecallRow } from "./recallSet";

/** Exactly `measure_funnel.ts` lines 819-832, and `_wsgd_stages.ts` 176-185:
 *  the self record decides the sub-sector, its own channels are withheld, and
 *  the peers' channels are the whole of `fieldChannels`. */
function harnessFieldChannels(company: string, country: string | undefined) {
  const selfRecord = matchCompany(company, country);
  const targetSub = selfRecord.matched && !isGenericSubsector(selfRecord.subsector)
    ? selfRecord.subsector : "";
  const dbPeers = targetSub
    ? findPeersBySubsector(targetSub, { country, limit: 4, exclude: [company] })
    : [];
  return {
    selfRecord, targetSub, dbPeers,
    channels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
  };
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

// ── A. THE HARNESS'S OWN POPULATION ────────────────────────────────────────
const policy = founderPolicyFromEnv();
const { file, rows } = loadRecallSet("wsIM mediator");
const seen = new Set<string>();
const population = [...rows.filter((r: RecallRow) => r.split === "holdout" && isDescribed(r))]
  .sort((a, b) => a.name.localeCompare(b.name))
  .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));

const N = population.length;
const pct = (k: number, d = N) => `${((100 * k) / d).toFixed(1)}%`;

let empty = 0, unmatched = 0, matchedGeneric = 0, matchedNoPeers = 0;
const sizes = new Map<number, number>();
for (const r of population) {
  const f = founderIntake(r, policy);
  const h = harnessFieldChannels(f.company, f.country);
  sizes.set(h.channels.size, (sizes.get(h.channels.size) ?? 0) + 1);
  if (h.channels.size === 0) {
    empty++;
    if (!h.selfRecord.matched) unmatched++;
    else if (!h.targetSub) matchedGeneric++;
    else matchedNoPeers++;
  }
}

console.log(`set ${path.basename(file)}  ·  ${N} holdout described founders, one per company\n`);
console.log("A. `fieldChannels` AS `npm run stages` BUILDS IT");
console.log(`   founders whose fieldChannels is EMPTY          ${empty}/${N}  (${pct(empty)})`);
console.log(`     ...because the founder is not in the corpus  ${unmatched}  <- production's own`);
console.log("                                                       fallback for exactly this");
console.log("                                                       case is the modal sub-sector");
console.log("                                                       of the MATCHED WEB PEERS");
console.log("                                                       (pipeline.ts 1814-1820), and");
console.log("                                                       the harness has none.");
console.log(`     ...because the sub-sector is a catch-all     ${matchedGeneric}`);
console.log(`     ...because the sub-sector yielded no peers   ${matchedNoPeers}`);
console.log("   size of fieldChannels:");
for (const k of [...sizes.keys()].sort((a, b) => a - b)) {
  console.log(`     ${String(k).padStart(2)} channel(s)  ${String(sizes.get(k)).padStart(4)}  ${pct(sizes.get(k)!)}`);
}
console.log("");

// ── B. THE RECOVERED PRODUCTION RUNS ───────────────────────────────────────
interface Recovered {
  source: string; harness: string; company: string; country?: string;
  generatedAt?: string; selfMatched: boolean; selfChannels: string[];
  comparableFirms: string[]; publishedChannels: string[];
}
const tapeFile = path.join(process.cwd(), "..", "..", "project-mgmt", "findings",
  "stage_declared_wsIM", "recovered_runs.json");
const tape = JSON.parse(readFileSync(tapeFile, "utf8")) as Recovered[];

console.log(`B. RECOVERED PRODUCTION RUNS — ${tape.length} run(s), `
  + `${new Set(tape.map((t) => t.company)).size} compan(ies), live web search`);
console.log("   production fieldChannels is recovered as a LOWER BOUND: the report records a");
console.log("   comparable firm only where its channel became a published row, at most three");
console.log("   per channel. Every channel counted below is one the search really produced.\n");

let differs = 0, recoverable = 0, harnessEmptyStageNot = 0, bothCauses = 0;
const perCompany = new Map<string, { runs: number; differs: number }>();
const lines: string[] = [];
for (const t of tape) {
  const h = harnessFieldChannels(t.company, t.country);
  const peerNames = new Set(h.dbPeers.map((p) => p.name.toLowerCase()));
  // Every recovered comparable that is not one of the harness's own peers can
  // only have come from the paid search -- either as a matched web peer, or as
  // a DB peer of a sub-sector the search chose (pipeline.ts 1814-1820).
  const fromStage = t.comparableFirms.filter((n) => !peerNames.has(n.toLowerCase()));
  // The stage is ISOLATED from the harness's OTHER declared difference. The
  // funnel withholds the founder's own traced channels on purpose -- a replay
  // against the fund the company won would otherwise be handed the answer in
  // tier 1 -- so those channels are counted on BOTH sides here. What is left
  // is the paid stage and nothing else.
  const withoutStage = new Set<string>([...h.channels, ...t.selfChannels]);
  const withStage = new Set<string>([...withoutStage,
    ...fromStage.flatMap((n) => matchCompany(n, undefined).channels)]);
  const added = [...withStage].filter((c) => !withoutStage.has(c));
  // The WHOLE gap, both causes: what `npm run stages` builds against what the
  // request path built. Reported beside the isolated stage so the two are never
  // read as one number.
  if ([...withStage].some((c) => !h.channels.has(c))) bothCauses++;
  recoverable++;
  if (added.length) differs++;
  if (withoutStage.size === 0 && withStage.size > 0) harnessEmptyStageNot++;
  const agg = perCompany.get(t.company) ?? { runs: 0, differs: 0 };
  agg.runs++; if (added.length) agg.differs++;
  perCompany.set(t.company, agg);
  lines.push(
    `   ${t.company.padEnd(16).slice(0, 16)} ${(t.generatedAt ?? "").slice(0, 10)} `
    + `self=${t.selfMatched ? "in " : "out"} peers=${String(h.channels.size).padStart(2)} `
    + `noStage=${String(withoutStage.size).padStart(2)} withStage=${String(withStage.size).padStart(2)} `
    + `J=${jaccard(withoutStage, withStage).toFixed(2)} +[${added.join(" ")}]`);
}
console.log(lines.join("\n"));
console.log("");
console.log(`   runs where the PAID STAGE added at least one channel  ${differs}/${recoverable}  (${pct(differs, recoverable)})`);
console.log(`   ...of those, runs where fieldChannels was EMPTY without it  ${harnessEmptyStageNot}`);
console.log(`   runs where the HARNESS's fieldChannels differs from the request path's`);
console.log(`     (the paid stage AND the deliberately withheld own history)  ${bothCauses}/${recoverable}  (${pct(bothCauses, recoverable)})`);
console.log("   per company:");
for (const [c, a] of [...perCompany.entries()].sort()) {
  console.log(`     ${c.padEnd(18)} ${a.differs}/${a.runs}`);
}
console.log("");
// ── C. THE STAGE'S SELF-DISAGREEMENT, FOR FREE ─────────────────────────────
// wsIL's pre-registration says nobody has measured this stage against itself,
// and buys a control-vs-control arm to find out. Twelve of these companies were
// run more than once against the SAME frozen request, so part of that arm has
// already been paid for and never read: two runs of one company differ only
// because the live web differed.
const setsByCompany = new Map<string, Set<string>>();
for (const t of tape) {
  const h = harnessFieldChannels(t.company, t.country);
  const peerNames = new Set(h.dbPeers.map((p) => p.name.toLowerCase()));
  const fromStage = t.comparableFirms.filter((n) => !peerNames.has(n.toLowerCase()));
  const withStage = [...new Set<string>([...h.channels, ...t.selfChannels,
    ...fromStage.flatMap((n) => matchCompany(n, undefined).channels)])].sort().join(",");
  const s = setsByCompany.get(t.company) ?? new Set<string>();
  s.add(withStage);
  setsByCompany.set(t.company, s);
}
console.log("");
console.log("C. THE SAME COMPANY, RUN AGAIN — the stage against itself, already paid for");
let repeated = 0, unstable = 0;
for (const [c, s] of [...setsByCompany.entries()].sort()) {
  const runs = tape.filter((t) => t.company === c).length;
  if (runs < 2) continue;
  repeated++;
  if (s.size > 1) unstable++;
  console.log(`     ${c.padEnd(18)} ${runs} run(s) -> ${s.size} distinct fieldChannels set(s)`);
}
console.log(`   companies run more than once            ${repeated}`);
console.log(`   ...whose fieldChannels was NOT stable   ${unstable}`);
console.log("   The input is the live web. A harness that reproduced this stage exactly would");
console.log("   still not reproduce its OUTPUT, which is why declaring the stage absent is a");
console.log("   different act from promising to add it.");
console.log("");
console.log("   `fieldChannels` identical => every downstream stage is bit-identical for that");
console.log("   founder, so the rate above is a HARD UPPER BOUND on the share of founders");
console.log("   whose published rows can differ. It is not an estimate of that share.");
