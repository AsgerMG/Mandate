// wsGD — WHERE, EXACTLY, THE ANSWER IS CUT AWAY.
//
// ── The question ───────────────────────────────────────────────────────────
// 63.3% of the founders in the wsGA head-to-head had no answer in the 18-row
// pool at all, so neither arm could win on them. The product is two multiplied
// numbers — "is the answer on the list" times "does the model pick it" — and
// the first is the larger of the two. This measures the first one, per stage,
// so that a proposal to widen the list can be aimed at the stage that is
// actually spending the recall.
//
// The wsGA report already prints the FINAL rank (`rankAccessible`), and the
// recall curve at each K falls straight out of it. What it cannot say is which
// stage moved a fund from "in the corpus" to "not in the pool". That needs the
// rank measured at each seam of the same funnel, on one pool object, and that
// is what this does:
//
//   publishable corpus
//     -> buildInstrumentTableHydrated   (gate 1: selection + materialisation)
//     -> accessiblePool                 (the encoded-verdict drop)
//     -> orderMemoCandidates.ordered    (the display-name collapse, a DEMOTION)
//     -> .slice(0, K)                   (the cut this workstream is about)
//
// For every founder whose won fund is dropped at `accessiblePool`, the blocking
// gates are recorded verbatim. A fund the company DEMONSTRABLY WON that our own
// encoding calls "conclusively fails" is not a depth problem and cannot be
// fixed by showing more rows; it is a wrong gate, and it is free to fix.
//
// ── FREE BY CONSTRUCTION ──────────────────────────────────────────────────
// ANTHROPIC_API_KEY is deleted before anything that could use it is imported,
// exactly as `_wsdr_curve.ts` and `_wsei_depth.ts` do it. The only paid call is
// the Voyage embedding behind `semanticFundMatch`, which is the shipped ranker
// and prints its own `all N request(s) on EMBEDDING` line. The prompt is built
// through production's own exported `buildPrompt` and measured rather than
// sent.
//
//   LIMIT=60 npx tsx scripts/_wsgd_stages.ts
//   LIMIT=0 SPLIT=holdout npx tsx scripts/_wsgd_stages.ts   (the whole split)
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// Free by construction, not by intention.
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsgd_stages", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, isGenericSubsector,
  loadDbInstruments, matchCompany, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { assessAll } from "../lib/intelligence/verdict";
import { buildPrompt, intakeAnswerLines, unansweredRankingFields } from "../lib/intelligence/agentSelect";
import { SELECT_COUNT } from "../lib/intelligence/agentSelect";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import type { InstrumentRow } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { isDescribed, loadRecallSet, partitionByOfferable, reattributeMissingAnswers } from "./recallSet";

/** The Ks the recall/cost table is reported at. 6 is the published table, 18 is
 *  `VERDICT_POOL`, 40 is `SELECT_DEPTH`, 0 reads as the whole pool. The rest
 *  fill in the curve either side of the two constants that could move. */
const KS = [6, 12, 18, 25, 30, 40, 50, 60, 80, 0] as const;
const OUT = path.join(process.cwd(), "..", "..", "project-mgmt", "findings", "stages_wsGD");

/** Anthropic bills input by token and this script may not call Anthropic to
 *  count them, so characters are what it reports and the ratio is stated rather
 *  than assumed. ~3.6 chars/token is what wsDR's recorded spend implies for
 *  these prompts; `_wsei_depth.ts` uses the same constant for the same reason. */
const CHARS_PER_TOKEN = 3.6;

interface PerFounder {
  company: string;
  country: string;
  won: string;
  /** Is the won fund in the corpus and publishable at all? */
  inCorpus: boolean;
  offerable: boolean;
  /** Rank (1-based) of the won fund at each seam, or null if absent there. */
  rankHydrated: number | null;
  rankAccessible: number | null;
  rankOrdered: number | null;
  /** Length of the list at each seam. */
  nHydrated: number;
  nAccessible: number;
  nOrdered: number;
  /** Only when `accessiblePool` deleted the won fund: what said so. */
  blockedBy: { field: string; requirement: string; cited: boolean; verified: boolean }[];
  /** Fields whose answer, removed ON ITS OWN, un-blocks the won fund. A field
   *  here is the whole of the reason that answer was deleted. */
  unblockedBy: string[];
  /** The CONTROL's published projection — the score's own order through
   *  `orderMemoCandidates`, cut to the writer cap — built at each K. The
   *  control is supposed to be invariant to the pool width; this is where that
   *  is checked rather than asserted. */
  controlAt: Record<string, string[]>;
  /** Rows carrying a readable `funds:` line, cumulative at each K. */
  describedAt: Record<string, { rows: number; described: number }>;
  /** The prompt production would build at each K, in characters. */
  promptChars: Record<string, number>;
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsgd_stages");
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const inCorpus = new Set(corpus.map((i) => i.id));

  const { rows: all } = loadRecallSet("wsgd stages");
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  const split = process.env.SPLIT ?? "holdout";
  let graded = pop.graded.filter((r) => (split === "all" || r.split === split) && isDescribed(r));
  const seen = new Set<string>();
  graded = [...graded].sort((a, b) => a.name.localeCompare(b.name))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  const limit = Number(process.env.LIMIT ?? 60);
  if (limit > 0) graded = graded.slice(0, limit);
  // The recall set is CONDITIONED on the won fund being publishable, so every
  // stage inside `publishableInstruments()` -- the closure filter, the
  // capital-type editorial policy, the unconfirmed-open withholding -- is
  // invisible in every recall figure this repo publishes. That is not a bug in
  // the set (a fund we do not offer cannot be graded as a miss) but it means
  // the ceiling below is a ceiling ON TOP OF that exclusion, and the count is
  // reported rather than left implicit.
  const excludedUpstream = pop.ungraded.length;
  console.log(`measuring the funnel on ${graded.length} ${split} described founders`
    + ` (${excludedUpstream} pair(s) excluded upstream: the won fund is not publishable)`);

  const policy: FounderPolicy = founderPolicyFromEnv();
  resetRankerTally();
  const out: PerFounder[] = [];

  for (const t of graded) {
    resetGateHydration();
    const f = founderIntake(t, policy);
    const selfRecord = matchCompany(f.company, f.country);
    const targetSub =
      selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
    const dbPeers = targetSub
      ? findPeersBySubsector(targetSub, { country: f.country, limit: 4, exclude: [f.company] })
      : [];
    const semantic = await semanticFundMatch(f.opts.description ?? "");
    const log = new ExclusionLog();
    const hydrated: InstrumentRow[] = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
      founderCountries: founderCountryList(
        f.country, f.opts.targetMarkets, f.eligibility.entityCountries),
      capitalSought: f.opts.capitalSought,
      description: f.opts.description,
      semantic,
      ...tableInputFromAnswers(f.eligibility),
      log,
    } as never);
    // The SAME pool object every seam cuts out of. NO SLICE anywhere here.
    const accessible: InstrumentRow[] = applyProfileSignal(
      accessiblePool(hydrated, f.eligibility as never, log), undefined, undefined);
    // The one thing `orderMemoCandidates` still does to the order: demote a row
    // whose institution NAME is already shown. It is a permutation, so it can
    // only move the won fund, never delete it -- which is exactly the property
    // worth measuring rather than trusting.
    const req = {
      company: f.company, country: f.country, description: f.opts.description,
      eligibility: f.eligibility, capitalSought: f.opts.capitalSought,
    };
    const project = (pool: InstrumentRow[]) => orderMemoCandidates({
      instrumentTable: pool, req, records: [], dbPeers: [], eligibilityScreen: [],
      log: new ExclusionLog(),
    } as never);
    const ordered = project(accessible).ordered.map((c) => c.row);

    const rankIn = (rows: InstrumentRow[]) => {
      const i = rows.map((r) => r.instrumentId).indexOf(t.instrument);
      return i < 0 ? null : i + 1;
    };
    const rankHydrated = rankIn(hydrated);
    const rankAccessible = rankIn(accessible);

    // Only meaningful when the fund survived gate 1 and then did not survive
    // the verdict drop: that is the population whose answer OUR OWN ENCODING
    // deleted, and the blockers are the encoding that did it.
    let blockedBy: PerFounder["blockedBy"] = [];
    const unblockedBy: string[] = [];
    if (rankHydrated != null && rankAccessible == null) {
      const a = assessAll([t.instrument], f.eligibility as never).get(t.instrument);
      blockedBy = (a?.blockers ?? []).map((b) => ({
        field: b.field, requirement: b.requirement, cited: b.cited, verified: b.verified,
      }));
      // ── Which ANSWER is doing the deleting, not which requirement ─────────
      // A blocker names a fund's rule; what we control is the intake field the
      // rule reads. Removing one field's answer at a time and re-assessing says
      // whether that single answer is the whole of the reason a fund the company
      // WON was called conclusively ineligible. It matters here because several
      // of these answers are DERIVED by the harness rather than stated by a
      // founder (`ticketBand` from a median award under a different scheme,
      // `region` from a different scheme's beneficiary region), so a field that
      // alone deletes the answer may be measuring our guess and not our gates.
      for (const field of new Set(blockedBy.map((b) => b.field))) {
        const { [field]: _removed, ...rest } = f.eligibility as Record<string, unknown>;
        if (assessAll([t.instrument], rest as never).get(t.instrument)?.status !== "blocked") {
          unblockedBy.push(field);
        }
      }
    }

    const ids = ordered.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    const ctx = {
      country: f.country,
      sector: f.eligibility?.sector ?? undefined,
      description: f.opts.description,
      answers: intakeAnswerLines(f.eligibility as never),
      unanswered: unansweredRankingFields(f.eligibility as never),
      assessments: assessAll(ids, f.eligibility as never),
    };

    const describedAt: PerFounder["describedAt"] = {};
    const promptChars: PerFounder["promptChars"] = {};
    const controlAt: PerFounder["controlAt"] = {};
    for (const d of KS) {
      const k = d === 0 ? ordered.length : Math.min(d, ordered.length);
      const head = ordered.slice(0, k);
      // ── IS THE CONTROL REALLY INVARIANT TO THE POOL WIDTH? ───────────────
      // A pool-width arm is only readable against a fixed control, and the
      // obvious argument for one is that the score's order is a prefix of
      // itself, so cutting later cannot change the first seven rows. That
      // argument has a hole: `resolveNameCollisions` picks the survivor of a
      // label class by `preferBetterEvidencedRow`, a TOTAL ORDER independent of
      // position. A wider pool can therefore admit a better-evidenced sibling
      // at rank 30, make IT the survivor, and demote the rank-3 row that used
      // to hold the label. So the projection is built at every K and the
      // difference is counted rather than reasoned about.
      controlAt[String(d)] = project(accessible.slice(0, k)).toWriter
        .map((c) => c.row.instrumentId ?? c.row.channel);
      describedAt[String(d)] = {
        rows: head.length,
        described: head.filter((r) => Boolean(r.description)).length,
      };
      // Production's own prompt builder, with production's own arguments. A
      // reconstruction here would price a different prompt, which is the exact
      // defect `dry` was written to avoid.
      promptChars[String(d)] = buildPrompt(head, ctx as never, 0, SELECT_COUNT).length;
    }

    out.push({
      company: f.company, country: f.country, won: t.instrument,
      inCorpus: inCorpus.has(t.instrument), offerable: offerable.has(t.instrument),
      rankHydrated, rankAccessible, rankOrdered: rankIn(ordered),
      nHydrated: hydrated.length, nAccessible: accessible.length, nOrdered: ordered.length,
      blockedBy, unblockedBy, controlAt, describedAt, promptChars,
    });
    if (out.length % 10 === 0) console.log(`  ${out.length}/${graded.length}`);
  }

  const prov = corpusProvenance();
  const n = out.length;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const pct = (a: number, b: number) => `${((100 * a) / (b || 1)).toFixed(1)}%`;

  const lines: string[] = [];
  lines.push(`# wsGD — where the answer is cut away\n`);
  lines.push("```");
  lines.push(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  lines.push(rankerTallyLine());
  lines.push(`n=${n} ${split} described founders, ANTHROPIC_API_KEY deleted before import`);
  lines.push(`${excludedUpstream} pair(s) excluded before this run: the won fund is not publishable`);
  lines.push("```\n");
  lines.push(`> The recall set is CONDITIONED on the won fund being publishable, so the `
    + `\`publishableInstruments()\` filters — closure, the capital-type editorial policy, the `
    + `unconfirmed-open withholding — cannot appear as a miss below. ${excludedUpstream} pair(s) `
    + `were removed by them before this measurement began.\n`);

  lines.push(`## Every stage that removes the answer\n`);
  lines.push(`| stage | list length (mean/median) | won fund still present | lost here |`);
  lines.push(`|---|---:|---:|---:|`);
  const inCorpusN = out.filter((r) => r.inCorpus).length;
  const offerableN = out.filter((r) => r.offerable).length;
  const hydN = out.filter((r) => r.rankHydrated != null).length;
  const accN = out.filter((r) => r.rankAccessible != null).length;
  const ordN = out.filter((r) => r.rankOrdered != null).length;
  lines.push(`| in the corpus | ${prov.instruments} | ${inCorpusN}/${n} — ${pct(inCorpusN, n)} | — |`);
  lines.push(`| publishable | ${offerable.size} | ${offerableN}/${n} — ${pct(offerableN, n)} | ${inCorpusN - offerableN} |`);
  lines.push(`| gate 1 \`buildInstrumentTableHydrated\` | ${mean(out.map((r) => r.nHydrated)).toFixed(1)} / ${median(out.map((r) => r.nHydrated))} | ${hydN}/${n} — ${pct(hydN, n)} | ${offerableN - hydN} |`);
  lines.push(`| \`accessiblePool\` (encoded verdict) | ${mean(out.map((r) => r.nAccessible)).toFixed(1)} / ${median(out.map((r) => r.nAccessible))} | ${accN}/${n} — ${pct(accN, n)} | **${hydN - accN}** |`);
  lines.push(`| \`orderMemoCandidates\` (name collapse) | ${mean(out.map((r) => r.nOrdered)).toFixed(1)} / ${median(out.map((r) => r.nOrdered))} | ${ordN}/${n} — ${pct(ordN, n)} | ${accN - ordN} |`);
  for (const d of KS) {
    if (d === 0) continue;
    const hit = out.filter((r) => r.rankOrdered != null && r.rankOrdered <= d).length;
    lines.push(`| \`.slice(0, ${d})\` | ${mean(out.map((r) => r.describedAt[String(d)].rows)).toFixed(1)} | ${hit}/${n} — ${pct(hit, n)} | ${d === 6 ? "" : ""}${ordN - hit} (cumulative) |`);
  }
  lines.push("");

  lines.push(`## Recall, legibility and prompt size at each K\n`);
  lines.push(`| K | mean rows shown | won fund inside | rows with a \`funds:\` line | prompt chars | ~tokens |`);
  lines.push(`|---|---:|---:|---:|---:|---:|`);
  for (const d of KS) {
    const key = String(d);
    const rows = out.map((r) => r.describedAt[key].rows);
    const desc = out.reduce((a, r) => a + r.describedAt[key].described, 0);
    const tot = out.reduce((a, r) => a + r.describedAt[key].rows, 0);
    const hit = out.filter((r) => r.rankOrdered != null
      && r.rankOrdered <= (d === 0 ? r.nOrdered : d)).length;
    const chars = mean(out.map((r) => r.promptChars[key]));
    lines.push(`| ${d === 0 ? "the whole pool" : d} | ${mean(rows).toFixed(1)} | `
      + `${hit}/${n} — ${pct(hit, n)} | ${pct(desc, tot)} | ${chars.toFixed(0)} | `
      + `${(chars / CHARS_PER_TOKEN).toFixed(0)} |`);
  }
  lines.push("");

  const dropped = out.filter((r) => r.rankHydrated != null && r.rankAccessible == null);
  lines.push(`## The encoded verdict deleted the answer — ${dropped.length}/${n} founders (${pct(dropped.length, n)})\n`);
  lines.push(`These are funds the company DEMONSTRABLY WON, on a row gate 1 had already `
    + `selected, which \`accessiblePool\` then removed because our own encoded filters say the `
    + `founder conclusively fails them. No depth reaches these: the row is gone before any K `
    + `is applied. Grouped by the field whose filter fired.\n`);
  const byField = new Map<string, {
    n: number; cited: number; verified: number; sole: number; sample: string;
  }>();
  for (const r of dropped) {
    const fields = new Set(r.blockedBy.map((b) => b.field));
    for (const b of r.blockedBy) {
      if (!fields.has(b.field)) continue;
      fields.delete(b.field);
      const cur = byField.get(b.field)
        ?? { n: 0, cited: 0, verified: 0, sole: 0, sample: b.requirement };
      cur.n += 1;
      cur.cited += b.cited ? 1 : 0;
      cur.verified += b.verified ? 1 : 0;
      cur.sole += r.unblockedBy.includes(b.field) ? 1 : 0;
      byField.set(b.field, cur);
    }
  }
  lines.push(`\`sole\` counts the founders for whom removing THAT ONE ANSWER un-blocks the fund: `
    + `the field is then the whole of the reason the answer was deleted. Several of these answers `
    + `are DERIVED by the replay rather than stated by a founder — \`ticketBand\` from the median `
    + `award under a different notified scheme, \`region\` from a different scheme's beneficiary `
    + `region — so a high \`sole\` count on a derived field is a claim about our guess before it `
    + `is a claim about our gates.\n`);
  lines.push(`| intake field | founders whose answer it deleted | sole | cited | verified | a requirement it fired on |`);
  lines.push(`|---|---:|---:|---:|---:|---|`);
  for (const [field, v] of [...byField.entries()].sort((a, b) => b[1].n - a[1].n)) {
    lines.push(`| \`${field}\` | ${v.n} | ${v.sole} | ${v.cited} | ${v.verified} | `
      + `${v.sample.replace(/\|/g, "/").slice(0, 110)} |`);
  }
  lines.push("");

  lines.push(`## Is the CONTROL invariant to the pool width?\n`);
  lines.push(`A pool-width arm is only readable against a fixed control. The score's order is a `
    + `prefix of itself, so a later cut cannot reorder the head — but \`resolveNameCollisions\` `
    + `picks a label class's survivor by \`preferBetterEvidencedRow\`, a total order INDEPENDENT `
    + `of position, so a wider pool can promote a better-evidenced sibling from deep in the pool `
    + `and demote the row that held the label in the top seven. Measured against K=18, on the `
    + `writer's own \`toWriter\` projection.\n`);
  lines.push(`| K | control projection identical to K=18 | the won fund enters | the won fund leaves |`);
  lines.push(`|---|---:|---:|---:|`);
  const wonIn = (ids: string[], r: PerFounder) => ids.includes(r.won);
  for (const d of KS) {
    if (d === 18) continue;
    const key = String(d);
    const same = out.filter((r) => r.controlAt[key].join("|") === r.controlAt["18"].join("|")).length;
    const enters = out.filter((r) => wonIn(r.controlAt[key], r) && !wonIn(r.controlAt["18"], r)).length;
    const leaves = out.filter((r) => !wonIn(r.controlAt[key], r) && wonIn(r.controlAt["18"], r)).length;
    lines.push(`| ${d === 0 ? "the whole pool" : d} | ${same}/${n} — ${pct(same, n)} | ${enters} | ${leaves} |`);
  }
  lines.push("");

  lines.push(`## Per founder\n`);
  lines.push(`| founder | country | hydrated | accessible | ordered | rank hyd/acc/ord |`);
  lines.push(`|---|---|---:|---:|---:|---|`);
  for (const r of out) {
    lines.push(`| ${r.company} | ${r.country} | ${r.nHydrated} | ${r.nAccessible} | ${r.nOrdered} | `
      + `${r.rankHydrated ?? "—"}/${r.rankAccessible ?? "—"}/${r.rankOrdered ?? "—"} |`);
  }
  lines.push("");

  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "stages.md"), lines.join("\n"));
  writeFileSync(path.join(OUT, "stages.json"), JSON.stringify({
    corpus: prov, n, split, limit, rows: out,
  }, null, 1));
  console.log(lines.join("\n"));
  console.log(`\nwritten to ${OUT}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
