/**
 * wsIN — WHAT THE CATCH-ALL IS, AND WHAT A FREE FALLBACK WOULD BUY.
 *
 * FREE, OFFLINE, REPRODUCIBLE. No credentials, no database, no network, no
 * model call. Every input is a committed file: `public/data/companies_index.json`
 * (the peer index `matchCompany`/`findPeersBySubsector` read),
 * `public/data/instrument_terms.json` (leaf -> source_family_bucket, used ONLY
 * as a code lookup, never as a statement about which funds exist), and the
 * active recall set. DATABASE_URL and VOYAGE_KEY are DESTROYED above rather
 * than merely unset, which is what makes that header true -- and NOT `NO_PG=1`,
 * which additionally serves a snapshot corpus and a lexical ranker.
 *
 *   npx tsx scripts/_wsin_catchall.ts
 *
 * ── The question ──────────────────────────────────────────────────────────
 * wsIM measured that `fieldChannels` is empty on 308 of 897 founders and that
 * 284 of those are a CATCH-ALL SUB-SECTOR rather than an unmatched founder.
 * This asks three things it did not:
 *
 *   1. WHICH labels absorb the 284, and is the emptiness SPARSITY (the bucket
 *      holds no peers) or SUPPRESSION (it holds them and a rule refuses)?
 *   2. Would a free deterministic fallback fill the slot, and would it fill it
 *      with the RIGHT channel or with noise? Every founder here won a fund, so
 *      the won fund's channel is ground truth for whether a filled slot helps.
 *   3. What does each fallback do to the founders it does NOT help?
 *
 * ── Why the won channel is the right target ───────────────────────────────
 * `fieldChannels` does two things (shortlist.ts 2312, 2533): it seeds `codes`,
 * and it sets `usedInField`, tier 1 of the row sort above the entire score
 * (3312). With `fieldChannels` EMPTY, `usedInField` is false on every row and
 * tier 1 is INERT -- the sort falls through to the score. So filling the slot
 * is not neutral: it promotes every row whose channel is in the set ABOVE every
 * row whose channel is not. If the won channel is in the set the founder's
 * fund is promoted; if the set is non-empty and the won channel is NOT in it,
 * the won fund is DEMOTED below rows that would otherwise have tied with it.
 * A fallback that fills the slot with noise is strictly worse than an empty
 * slot, and this is the measurement of exactly that.
 */
delete process.env.DATABASE_URL;
delete process.env.VOYAGE_KEY;

import { readFileSync } from "fs";
import path from "path";

import {
  findPeersBySubsector, isGenericSubsector, matchCompany,
} from "../lib/intelligence/corpus";
import { founderIntake, founderPolicyFromEnv } from "./founderIntake";
import { isDescribed, loadRecallSet, type RecallRow } from "./recallSet";

// ── The committed index, read directly for the corpus-shape questions ──────
// Same file `corpus.ts` reads. Column order is that file's row tuple.
type Row = [
  string, string, string, string, number, [string, number][],
  number, number, string, string, string, string,
];
const NAME = 0, ISO = 2, CAPITAL = 4, CHANNELS = 5, TOP = 8, SUB = 9, ENTITY = 10;
const index = JSON.parse(readFileSync(
  path.join(process.cwd(), "public", "data", "companies_index.json"), "utf8"),
) as { rows: Row[] };
const rowsAll = index.rows;

// Leaf -> channel. A code lookup only: this run never asks the snapshot which
// funds exist, which is the thing that needs a live corpus.
const terms = JSON.parse(readFileSync(
  path.join(process.cwd(), "public", "data", "instrument_terms.json"), "utf8"),
) as { records: { id: string; parentId: string | null; sourceFamilyBucket: string | null }[] };
const termById = new Map(terms.records.map((r) => [r.id, r]));
function channelOfInstrument(id: string): string | null {
  let r = termById.get(id);
  // A split child that post-dates the committed snapshot resolves through its
  // id, which is `<parent>__<slug>` by construction in the splitter.
  if (!r && id.includes("__")) r = termById.get(id.slice(0, id.indexOf("__")));
  let guard = 0;
  while (r && !r.sourceFamilyBucket && r.parentId && guard++ < 5) r = termById.get(r.parentId);
  return r?.sourceFamilyBucket ?? null;
}

// ── The harness's door, byte-for-byte as `measure_funnel.ts` 819-832 ───────
function door(company: string, country: string | undefined) {
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

// ── The candidate fallbacks ────────────────────────────────────────────────
// Each is a function of things the harness ALREADY HAS at the moment the first
// door shuts: the founder's own corpus row (when matched), their country, and
// their intake sector. None makes a call, none needs a credential.
const RESEARCH_NAME =
  /\b(RESEARCH|UNIVERSIT|INSTITUT|FRAUNHOFER|CNRS|LABORATOR|ACADEM|HOCHSCHULE|POLYTECH)\w*\b/i;
const eligiblePeer = (r: Row) =>
  r[CAPITAL] > 0 && r[ENTITY] !== "research_org"
  && !(r[ENTITY] !== "company" && RESEARCH_NAME.test(r[NAME]));

const norm = (s: string) => s.trim().toLowerCase();

/** Peers drawn from a `key` bucket of the index, ranked exactly as
 *  `findPeersBySubsector` ranks: same country first, then traced capital. */
function peersBy(
  keyOf: (r: Row) => string, key: string,
  opts: { country?: string; exclude: string; limit: number },
): Row[] {
  const iso = (opts.country ?? "").toUpperCase().slice(0, 2);
  const skip = norm(opts.exclude);
  const hits = rowsAll.filter((r) => keyOf(r) === key && eligiblePeer(r) && norm(r[NAME]) !== skip);
  hits.sort((a, b) => {
    if (iso) {
      const ac = a[ISO] === iso ? 1 : 0, bc = b[ISO] === iso ? 1 : 0;
      if (ac !== bc) return bc - ac;
    }
    return b[CAPITAL] - a[CAPITAL];
  });
  return hits.slice(0, opts.limit);
}
const chansOf = (rs: Row[]) => new Set(rs.flatMap((r) => r[CHANNELS].map(([c]) => c)));

// ── Population ─────────────────────────────────────────────────────────────
const policy = founderPolicyFromEnv();
const { file, rows } = loadRecallSet("wsIN catch-all");
const seen = new Set<string>();
const population = [...rows.filter((r: RecallRow) => r.split === "holdout" && isDescribed(r))]
  .sort((a, b) => a.name.localeCompare(b.name))
  .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
const N = population.length;
const pct = (k: number, d: number) => `${((100 * k) / d).toFixed(1)}%`;

interface Case {
  row: RecallRow; company: string; country: string; sector: string;
  matched: boolean; top: string; sub: string;
  base: Set<string>; wonChannel: string | null;
}
const cases: Case[] = population.map((r) => {
  const f = founderIntake(r, policy);
  const d = door(f.company, f.country);
  return {
    row: r, company: f.company, country: f.country ?? r.country,
    sector: r.sector ?? "other",
    matched: d.selfRecord.matched,
    top: d.selfRecord.sectorTop ?? "", sub: d.selfRecord.subsector ?? "",
    base: d.channels,
    wonChannel: channelOfInstrument(r.instrument),
  };
});

const shut = cases.filter((c) => c.base.size === 0);
const open = cases.filter((c) => c.base.size > 0);
const catchAll = shut.filter((c) => c.matched);
const unmatched = shut.filter((c) => !c.matched);
// The 284 are TWO POPULATIONS and the code cannot tell them apart, which is
// the finding. `isGenericSubsector` returns true for `""` on its first clause,
// so a company the classifier LOOKED AT and called too thin to place is
// handled identically to one it HAS NOT REACHED YET. The second is a queue
// (`classify_taxonomy.py:902`, `sector_taxonomy_method IN ('nace_top',
// 'programme') AND subsector IS NULL` -- "Tier-2 pending LLM", :814).
const missingLabel = catchAll.filter((c) => c.sub === "");
const realCatchAll = catchAll.filter((c) => c.sub !== "");

console.log(`set ${path.basename(file)}  ·  ${N} holdout described founders, one per company`);
console.log(`won channel resolvable for ${cases.filter((c) => c.wonChannel).length}/${N}\n`);

// ══ 1. WHAT THE CATCH-ALL IS ══════════════════════════════════════════════
console.log("1. WHICH LABELS ABSORB THE SHUT DOOR");
console.log(`   door SHUT (fieldChannels empty)   ${shut.length}/${N}  (${pct(shut.length, N)})`);
console.log(`     founder not in the corpus       ${unmatched.length}`);
console.log(`     founder matched, label refused  ${catchAll.length}`);
console.log(`       ...a REAL catch-all label     ${realCatchAll.length}   the classifier looked and said "too thin"`);
console.log(`       ...NO LABEL AT ALL            ${missingLabel.length}   the classifier has not reached them\n`);

const byLabel = new Map<string, Case[]>();
for (const c of catchAll) {
  const k = `${c.top || "(none)"} / ${c.sub || "(empty)"}`;
  (byLabel.get(k) ?? byLabel.set(k, []).get(k)!).push(c);
}
console.log("   label                                      founders   corpus rows   eligible peers");
console.log("                                                         in bucket     if the rule let us look");
for (const [k, cs] of [...byLabel.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const sub = k.split(" / ")[1];
  const inBucket = rowsAll.filter((r) => r[SUB] === sub);
  const eligible = inBucket.filter(eligiblePeer);
  console.log(`   ${k.padEnd(42)} ${String(cs.length).padStart(5)}   ${String(inBucket.length).padStart(9)}   ${String(eligible.length).padStart(10)}`);
}
console.log("");
console.log("   SPARSITY OR SUPPRESSION: `...because the sub-sector yielded no peers` is 0 in");
console.log("   wsIM's own output and 0 here. Not one founder's door is shut for want of a");
console.log("   peer. Every one is shut by `isGenericSubsector`, a rule, on a bucket that");
console.log("   holds peers -- the counts above are what it refuses to look at.\n");

// ══ 2. THE FALLBACKS ══════════════════════════════════════════════════════
type Fallback = { id: string; what: string; of: (c: Case) => Set<string> };
const FALLBACKS: Fallback[] = [
  {
    id: "SECTOR_TOP", what: "peers in the founder's own sector_top, any sub-sector",
    of: (c) => (c.matched && c.top
      ? chansOf(peersBy((r) => r[TOP], c.top, { country: c.country, exclude: c.company, limit: 4 }))
      : new Set()),
  },
  {
    id: "SECTOR_TOP_SPECIFIC", what: "same, but peers whose OWN sub-sector is specific",
    of: (c) => (c.matched && c.top
      ? chansOf(rankedSpecific(c)) : new Set()),
  },
  {
    id: "INTAKE_SECTOR", what: "peers in the sector the FOUNDER declared at intake",
    of: (c) => chansOf(peersBy((r) => r[TOP], c.sector,
      { country: c.country, exclude: c.company, limit: 4 })),
  },
  {
    id: "LIFT_THE_RULE", what: "peers inside the catch-all bucket itself",
    of: (c) => (c.matched && c.sub
      ? chansOf(peersBy((r) => r[SUB], c.sub, { country: c.country, exclude: c.company, limit: 4 }))
      : new Set()),
  },
];
function rankedSpecific(c: Case): Row[] {
  const iso = (c.country ?? "").toUpperCase().slice(0, 2);
  const skip = norm(c.company);
  const hits = rowsAll.filter((r) => r[TOP] === c.top && !isGenericSubsector(r[SUB])
    && eligiblePeer(r) && norm(r[NAME]) !== skip);
  hits.sort((a, b) => {
    if (iso) {
      const ac = a[ISO] === iso ? 1 : 0, bc = b[ISO] === iso ? 1 : 0;
      if (ac !== bc) return bc - ac;
    }
    return b[CAPITAL] - a[CAPITAL];
  });
  return hits.slice(0, 4);
}

function score(cs: Case[], set: (c: Case) => Set<string>) {
  let filled = 0, hit = 0, missFilled = 0, sizeSum = 0;
  let graded = 0;
  for (const c of cs) {
    const s = set(c);
    if (s.size) { filled++; sizeSum += s.size; }
    if (!c.wonChannel) continue;
    graded++;
    if (s.has(c.wonChannel)) hit++;
    else if (s.size) missFilled++;
  }
  return { n: cs.length, graded, filled, hit, missFilled, meanSize: sizeSum / (filled || 1) };
}

console.log("2. WHAT A FALLBACK WOULD BUY, ON THE 284 THE RULE SHUTS OUT");
console.log("   PROMOTES  = won channel is in the set  -> the founder's own fund rises to tier 1");
console.log("   DEMOTES   = set is non-empty and the won channel is NOT in it -> the founder's");
console.log("               own fund falls BELOW every row the fallback promoted. Empty today,");
console.log("               so today it neither promotes nor demotes anybody.\n");
console.log("   fallback              fills      PROMOTES        DEMOTES     mean |set|");
for (const fb of FALLBACKS) {
  const s = score(catchAll, fb.of);
  console.log(`   ${fb.id.padEnd(20)} ${String(s.filled).padStart(4)}/${s.n}  ${String(s.hit).padStart(4)}/${s.graded} ${pct(s.hit, s.graded).padStart(7)}  ${String(s.missFilled).padStart(4)} ${pct(s.missFilled, s.graded).padStart(7)}   ${s.meanSize.toFixed(1)}`);
}
console.log("");
for (const fb of FALLBACKS) console.log(`   ${fb.id.padEnd(20)} ${fb.what}`);
console.log("");

// ══ 3. THE CALIBRATION THE FALLBACKS MUST BEAT ════════════════════════════
console.log("3. THE BAR: what the REAL door achieves where it is open (n=" + open.length + ")");
const base = score(open, (c) => c.base);
console.log(`   SPECIFIC_SUBSECTOR   ${String(base.filled).padStart(4)}/${base.n}  ${String(base.hit).padStart(4)}/${base.graded} ${pct(base.hit, base.graded).padStart(7)}  ${String(base.missFilled).padStart(4)} ${pct(base.missFilled, base.graded).padStart(7)}   ${base.meanSize.toFixed(1)}`);
console.log("   and what each FALLBACK scores on those SAME founders -- a held-out test of the");
console.log("   fallback against a door that works, on founders whose answer we know:");
for (const fb of FALLBACKS) {
  const s = score(open, fb.of);
  console.log(`   ${fb.id.padEnd(20)} ${String(s.filled).padStart(4)}/${s.n}  ${String(s.hit).padStart(4)}/${s.graded} ${pct(s.hit, s.graded).padStart(7)}  ${String(s.missFilled).padStart(4)} ${pct(s.missFilled, s.graded).padStart(7)}   ${s.meanSize.toFixed(1)}`);
}
console.log("");

// ══ 4. THE WON CHANNEL'S OWN BASE RATE ════════════════════════════════════
// A set that contains the won channel is only informative if containing it is
// not the default. state_aid_satr alone is 74% of funded companies (the channel
// prior's own `global`), so a fallback that returns "state aid" for everybody
// would score well on PROMOTES while carrying no information at all.
console.log("4. IS THE HIT INFORMATIVE, OR IS IT JUST THE BASE RATE?");
const wonFreq = new Map<string, number>();
for (const c of cases) if (c.wonChannel) wonFreq.set(c.wonChannel, (wonFreq.get(c.wonChannel) ?? 0) + 1);
const gradedAll = [...wonFreq.values()].reduce((a, b) => a + b, 0);
for (const [ch, k] of [...wonFreq.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${ch.padEnd(24)} ${String(k).padStart(4)}  ${pct(k, gradedAll)}`);
}
console.log("");
console.log("   A CONSTANT ARM, for exactly that reason: the same score for a set that reads");
console.log("   nothing about the founder at all.");
for (const k of [1, 2, 3, 4]) {
  const top = [...wonFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([c]) => c);
  const s = score(catchAll, () => new Set(top));
  console.log(`   CONSTANT top-${k}          ${String(s.filled).padStart(4)}/${s.n}  ${String(s.hit).padStart(4)}/${s.graded} ${pct(s.hit, s.graded).padStart(7)}  ${String(s.missFilled).padStart(4)} ${pct(s.missFilled, s.graded).padStart(7)}   [${top.join(" ")}]`);
}


// ══ 5. THE TWO POPULATIONS, SCORED SEPARATELY ═════════════════════════════
// They are different problems and a single average hides both.
console.log("");
console.log("5. THE SAME FALLBACKS, ON THE TWO POPULATIONS SEPARATELY");
for (const [label, cs] of [
  ["REAL CATCH-ALL", realCatchAll] as const,
  ["NO LABEL YET", missingLabel] as const,
  ["UNMATCHED", unmatched] as const,
]) {
  console.log(`   -- ${label} (n=${cs.length})`);
  for (const fb of FALLBACKS) {
    const s2 = score(cs, fb.of);
    console.log(`      ${fb.id.padEnd(20)} ${String(s2.filled).padStart(4)}/${s2.n}  ${String(s2.hit).padStart(4)}/${s2.graded} ${pct(s2.hit, s2.graded).padStart(7)}  ${String(s2.missFilled).padStart(4)} ${pct(s2.missFilled, s2.graded).padStart(7)}`);
  }
}
console.log("");

// ══ 6. IS THE FALLBACK READING THE FOUNDER, OR RETURNING A CONSTANT? ══════
// A set that fills every slot with the same two channels would score well on
// PROMOTES and carry no information. Count the DISTINCT sets each fallback
// produces across the founders it fills, and how often the commonest one is
// the answer.
console.log("6. HOW MUCH OF THE FALLBACK IS ACTUALLY ABOUT THIS FOUNDER");
console.log("   fallback              distinct sets   modal set's share   modal set");
for (const fb of FALLBACKS) {
  const freq = new Map<string, number>();
  let filled = 0;
  for (const c of catchAll) {
    const s2 = fb.of(c);
    if (!s2.size) continue;
    filled++;
    const k = [...s2].sort().join(" ");
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const [modal, k] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  console.log(`   ${fb.id.padEnd(20)} ${String(freq.size).padStart(9)}   ${pct(k, filled).padStart(14)}   ${modal}`);
}
console.log("");

// ══ 7. WHAT DRAINING THE BACKLOG WOULD YIELD ══════════════════════════════
// The 113 have no label because nobody has classified them yet. What the
// classifier RETURNS for them cannot be known without running it, but its rate
// on the companies it HAS reached in the same sector_top is the honest prior:
// the share of already-labelled companies in that sector that got a SPECIFIC
// sub-sector rather than the sector's own `*_general` escape.
console.log("7. IF THE PENDING TIER-2 BACKLOG WERE DRAINED, HOW MANY DOORS OPEN?");
console.log("   yield estimated from the classifier's OWN rate on the companies it has");
console.log("   already reached in the same sector_top. An estimate, not a measurement.");
const topOfMissing = new Map<string, number>();
for (const c of missingLabel) topOfMissing.set(c.top || "(none)", (topOfMissing.get(c.top || "(none)") ?? 0) + 1);
let expected = 0;
console.log("   sector_top                     founders   already-labelled in corpus   specific   expected opens");
for (const [top, k] of [...topOfMissing.entries()].sort((a, b) => b[1] - a[1])) {
  const labelled = rowsAll.filter((r) => r[TOP] === top && r[SUB] !== "");
  const specific = labelled.filter((r) => !isGenericSubsector(r[SUB]));
  const rate = labelled.length ? specific.length / labelled.length : 0;
  expected += k * rate;
  console.log(`   ${top.padEnd(30)} ${String(k).padStart(5)}   ${String(labelled.length).padStart(21)}   ${(100 * rate).toFixed(1).padStart(7)}%   ${(k * rate).toFixed(1).padStart(13)}`);
}
console.log(`   expected doors opened by draining the backlog: ${expected.toFixed(0)} of ${missingLabel.length}`);
console.log(`   which would take the shut share from ${pct(shut.length, N)} to about ${pct(shut.length - Math.round(expected), N)}`);


// ══ 8. THE COMPARATOR THAT DECIDES IT ═════════════════════════════════════
// A fallback is only worth wiring if it beats the cheapest thing that fills the
// same slot while reading nothing about the founder. Two of those:
//   CONSTANT k    the k commonest won channels in this very population -- an
//                 arm that CHEATS in its own favour, since it is fitted on the
//                 answers it is scored against.
//   PRIOR k       `channelPrior.generated.json`, P(channel | country, sector),
//                 the repo's OWN statistic, already read by `blendedFit` to
//                 order channels. It reads the founder, costs nothing, and is
//                 the honest thing a sector-level draw has to beat.
const priorFile = JSON.parse(readFileSync(
  path.join(process.cwd(), "lib", "intelligence", "channelPrior.generated.json"), "utf8"),
) as { global: Record<string, number>;
       byCountry: Record<string, Record<string, number>>;
       byCountrySector: Record<string, Record<string, number>> };
function priorTop(c: Case, k: number): Set<string> {
  const cc = (c.country ?? "").toUpperCase().slice(0, 2);
  const tbl = priorFile.byCountrySector[`${cc}|${c.sector}`]
    ?? priorFile.byCountry[cc] ?? priorFile.global;
  return new Set(Object.entries(tbl).sort((a, b) => b[1] - a[1]).slice(0, k).map(([ch]) => ch));
}
const constTop = (k: number) =>
  new Set([...wonFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([ch]) => ch));

console.log("");
console.log("8. EVERY CANDIDATE AGAINST THE FREE COMPARATORS, PER POPULATION");
for (const [label, cs] of [
  ["REAL CATCH-ALL", realCatchAll] as const,
  ["NO LABEL YET", missingLabel] as const,
  ["UNMATCHED", unmatched] as const,
  ["ALL 284 SHUT-BY-RULE", catchAll] as const,
  ["HELD OUT: door open", open] as const,
]) {
  console.log(`   -- ${label} (n=${cs.length})`);
  const arms: [string, (c: Case) => Set<string>][] = [
    ...FALLBACKS.map((f) => [f.id, f.of] as [string, (c: Case) => Set<string>]),
    ["PRIOR top-3", (c: Case) => priorTop(c, 3)],
    ["PRIOR top-4", (c: Case) => priorTop(c, 4)],
    ["CONSTANT top-3", () => constTop(3)],
    ["CONSTANT top-4", () => constTop(4)],
  ];
  for (const [id, of] of arms) {
    const s2 = score(cs, of);
    console.log(`      ${id.padEnd(20)} fills ${String(s2.filled).padStart(4)}/${s2.n}  promotes ${pct(s2.hit, s2.graded).padStart(6)}  demotes ${pct(s2.missFilled, s2.graded).padStart(6)}`);
  }
}
console.log("");

// ══ 9. PAIRED, NOT AVERAGED ═══════════════════════════════════════════════
// Two arms with the same promote rate can disagree on which founders they
// promote. Only the paired counts say whether an arm is better or merely
// differently wrong.
console.log("9. PAIRED: LIFT_THE_RULE vs the best free comparator, on the 171 it can serve");
function paired(cs: Case[], a: (c: Case) => Set<string>, b: (c: Case) => Set<string>) {
  let aOnly = 0, bOnly = 0, both = 0, neither = 0;
  for (const c of cs) {
    if (!c.wonChannel) continue;
    const ha = a(c).has(c.wonChannel), hb = b(c).has(c.wonChannel);
    if (ha && hb) both++; else if (ha) aOnly++; else if (hb) bOnly++; else neither++;
  }
  return { aOnly, bOnly, both, neither };
}
const lift = FALLBACKS.find((f) => f.id === "LIFT_THE_RULE")!.of;
for (const [name, cmp] of [
  ["PRIOR top-3", (c: Case) => priorTop(c, 3)] as const,
  ["PRIOR top-4", (c: Case) => priorTop(c, 4)] as const,
  ["CONSTANT top-3", () => constTop(3)] as const,
]) {
  const r = paired(realCatchAll, lift, cmp);
  console.log(`   vs ${name.padEnd(16)} lift only ${String(r.aOnly).padStart(3)}   ${name} only ${String(r.bOnly).padStart(3)}   both ${String(r.both).padStart(3)}   neither ${String(r.neither).padStart(3)}`);
}

// ══ 10. IS THERE A SECOND OPINION IN THE REPO? ════════════════════════════
// The intake asks the founder their sector. If that answer disagrees with the
// corpus label, the repo already holds two opinions about the same company and
// one of them is being used to shut a door. If it never disagrees, the two are
// the same field and there is no free evidence here either way -- which is
// itself worth printing, because "the founder says otherwise" is the sort of
// claim that gets made without being checked.
console.log("");
console.log("10. THE INTAKE SECTOR AGAINST THE CORPUS LABEL");
let agree = 0, differ = 0, noTop = 0;
const differExamples: string[] = [];
for (const c of cases) {
  if (!c.matched) continue;
  if (!c.top) { noTop++; continue; }
  if (c.top === c.sector) agree++;
  else {
    differ++;
    if (differExamples.length < 6) differExamples.push(`${c.company} corpus=${c.top} intake=${c.sector}`);
  }
}
console.log(`   matched founders where they AGREE   ${agree}`);
console.log(`   ...where they DIFFER               ${differ}`);
console.log(`   ...corpus has no sector_top at all ${noTop}`);
for (const e of differExamples) console.log(`     ${e}`);
let otherOther = 0, otherOtherIntakeSpecific = 0;
for (const c of realCatchAll) {
  if (c.sub !== "other") continue;
  otherOther++;
  if (c.sector !== "other") otherOtherIntakeSpecific++;
}
console.log(`   of the ${otherOther} founders labelled other/other, the intake sector is a`);
console.log(`   SPECIFIC sector for ${otherOtherIntakeSpecific} of them`);
