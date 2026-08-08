// What actually VARIES across one founder's candidate set — computed in code,
// before any prompt is written.
//
// ── Why this exists ────────────────────────────────────────────────────────
// Gate 2 was handed `name`, `administering_body`, `channel`, `country` and four
// truncated requirement strings, and asked to pick five funds out of ~58. It
// kept the fund that actually won 55% of the time and a fund that did not 42%
// of the time: it was not choosing badly, it was choosing blind. None of what
// it was shown separates siblings. Measured across 35 sibling groups of >=3,
// `country` differs in 0.4% of sibling pairs and `capital_type` in 6.2%, while
// `award_p50` fully separates 25 of the 35 groups on its own.
//
// So the questions it wrote were generic ("what is your TRL?") and measured
// worth exactly 0pp — not because the writer was weak but because nobody had
// told it what these particular candidates disagree about.
//
// This module answers that, per shortlist:
//   * which axes the candidates genuinely split on, scored by information gain
//     (coverage x how much of the list a perfect answer removes) — the same
//     principle openFieldsForShortlist already applies to intake fields,
//     moved up to the LLM stage;
//   * P(fund | sector) within each programme family, which ranks the right
//     sibling first 43.6% of the time against 17.6% for the
//     `min(1, share/0.25)` form the ranker reads today.
//
// An axis earns a slot in the question budget only if the candidates disagree
// on it. Everything here is deterministic; nothing calls a model.
//
// ── What this bought, measured ─────────────────────────────────────────────
// Nothing, on the current holdout, and the honest place to record that is
// here. Feeding these axes and these fields to gate 2 measured 12/40 against
// gate 1's 20/40 — worse than the 14/40 it managed knowing none of it. And a
// purely deterministic check says the same from the other side: no threshold
// on `familySectorShare` below (swap gate 1's pick for a sibling when the
// sibling holds >=20/30/40/50% of the family's sector awards and >=2/3/5x the
// chosen fund's share) beats gate 1 — every combination landed on 19 or 20 of
// 40. Gate 1 already reads `sector_mix`, and there is no unexploited
// discriminating signal in the corpus fields for gate 2 to find.
//
// The module is kept, and kept accurate, for two reasons. The axis scores are
// the thing that tells a question-writer NOT to ask (46% of the old questions
// were dead on arrival, and `splitPower` collapses exactly those). And the
// diagnosis it encodes — that the discriminators are region, sub-sector and
// GBER objective, none of which the intake collects — is what the next attempt
// has to attack. Do not re-derive it by rebuilding this.

import { regionNameFor } from "./regions.generated";
import { deliveryRegionOf, regionFootprints } from "./regionPrior";

/** One candidate as the axis builder needs it. A superset of what the gate-1
 *  fixture stores per subset row, so both the harness and a live shortlist can
 *  be passed straight in. */
export interface AxisFund {
  id: string;
  name: string;
  body?: string | null;
  channel?: string | null;
  country?: string | null;
  regime?: string | null;
  capitalType?: string | null;
  awardP25?: number | null;
  awardP50?: number | null;
  awardP75?: number | null;
  awardN?: number;
  eventCount?: number;
  companyCount?: number;
  lastYear?: number | null;
  sectorMix?: Record<string, number> | null;
  /** intake field -> the distinct demands this fund's filter gates make on it. */
  gateSpecs?: Record<string, string>;
  gates?: string[];
}

export interface Axis {
  /** Stable key, so a question can declare which axis it is spending. */
  key: string;
  /** How the axis is put to a founder, in their language. */
  ask: string;
  /** How the candidates actually divide, rendered for the prompt. */
  split: string;
  /** coverage x splitPower, 0-1: how much of THIS shortlist a perfect answer
   *  would eliminate. The ranking key. */
  info: number;
  /** Fraction of candidates on which this axis is even observable. */
  coverage: number;
  band: "HIGH" | "MEDIUM" | "LOW";
  /** True for a line that is context rather than something to ask about, so
   *  the renderer does not claim a question about it would narrow anything. */
  note?: boolean;
}

/** Typical-cheque bands. Chosen to straddle the real decision points a founder
 *  recognises — a EUR 30k innovation voucher, a EUR 150k feasibility grant, a
 *  EUR 500k collaborative work package, a EUR 3M scale-up, an IPCEI-scale
 *  tranche — not as equal-width buckets, which would put 80% of the corpus in
 *  one of them. */
const AWARD_BANDS: { label: string; lo: number; hi: number }[] = [
  { label: "under EUR 50k", lo: 0, hi: 50_000 },
  { label: "EUR 50k-200k", lo: 50_000, hi: 200_000 },
  { label: "EUR 200k-1M", lo: 200_000, hi: 1_000_000 },
  { label: "EUR 1M-5M", lo: 1_000_000, hi: 5_000_000 },
  { label: "over EUR 5M", lo: 5_000_000, hi: Infinity },
];

export function awardBand(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  return AWARD_BANDS.find((b) => v >= b.lo && v < b.hi)?.label ?? null;
}

/** Money as a founder writes it, not as Postgres stores it. */
export function eur(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "n/a";
  if (v >= 1_000_000) return `EUR ${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000) return `EUR ${Math.round(v / 1_000)}k`;
  return `EUR ${Math.round(v)}`;
}

/**
 * How much a perfect answer would NARROW the list: 1 - sum(p^2), the expected
 * fraction of candidates eliminated.
 *
 * Deliberately not Shannon entropy. Normalised entropy rates a 48-vs-5 split
 * at 0.45 — high enough to look like a real axis — when the honest reading is
 * that 91% of the shortlist survives the answer, so the question is nearly
 * worthless. This form says exactly that (0.17), and it is directly
 * interpretable as "what share of the list does knowing this remove", which is
 * also what the prompt can be told.
 */
function splitPower(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 1 || counts.length <= 1) return 0;
  let h = 0;
  for (const c of counts) if (c > 0) h += (c / total) ** 2;
  return 1 - h;
}

function band(info: number): Axis["band"] {
  return info >= 0.45 ? "HIGH" : info >= 0.20 ? "MEDIUM" : "LOW";
}

/** Tally values, skipping the ones we cannot observe, and report both the
 *  histogram and how much of the shortlist it covered. */
function tally(funds: AxisFund[], f: (x: AxisFund) => string | null): {
  counts: Map<string, number>; coverage: number; info: number;
} {
  const counts = new Map<string, number>();
  let seen = 0;
  for (const x of funds) {
    const v = f(x);
    if (v == null) continue;
    seen++;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const coverage = funds.length ? seen / funds.length : 0;
  return { counts, coverage, info: coverage * splitPower([...counts.values()]) };
}

function top(counts: Map<string, number>, n: number): string {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${v}x ${k}`).join(" · ");
}

/**
 * P(fund | sector) across THIS candidate set.
 *
 * `sectorFit` in fit.ts computes `mix[sector] / total` — that is
 * P(sector | fund), normalised by the fund's OWN size, so a 12-award
 * specialist outranks a 400-award scheme funding four times as many companies
 * in the founder's sector; and the 0.25 clip then flattens everything above it
 * to an identical 1.0, tying on top in 58.7% of sibling comparisons. Here the
 * denominator is the candidate set, which is the question the shortlist is
 * actually asking: of everyone in this sector who won something from this
 * list, what share went to each fund.
 *
 * ── Read the scope note before using this across a whole pool ──────────────
 * Measured leave-one-out this ranks the right sibling first 43.6% of the time
 * against 17.6% for `sectorFit` — but only WITHIN a sibling group. Applied
 * flat across a 58-fund pool it is close to a size prior: on the 40-case
 * strided holdout it puts the won fund in its own top five 7 times, against
 * gate 1's 20, because the Horizon clusters absorb most of every sector's
 * award history. Gate 1 already tried it globally and it measured 30% vs 32%.
 * `familySectorShare` below is the form that works; this one exists for
 * reporting the shape of the pool, not for ranking it.
 *
 * Returns a 0-1 share per fund id. Funds with no sector history are absent
 * rather than zero — absent means unknown, and a caller must not read it as
 * "this fund has never funded your sector".
 */
export function sectorPosterior(funds: AxisFund[], sector: string | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!sector) return out;
  let total = 0;
  for (const f of funds) {
    const n = f.sectorMix?.[sector];
    if (typeof n === "number" && n > 0) total += n;
  }
  if (total <= 0) return out;
  for (const f of funds) {
    const n = f.sectorMix?.[sector];
    if (typeof n === "number" && n > 0) out.set(f.id, n / total);
  }
  return out;
}

export interface FamilyShare {
  /** Share of the FAMILY's awards in this sector that went to this fund, 0-1. */
  share: number;
  /** 1-based rank within the family on that share. */
  rank: number;
  /** How many siblings it was ranked against. */
  of: number;
}

/**
 * The same posterior, normalised inside each programme family rather than
 * across the pool. This is the one that discriminates.
 *
 * The reason is structural and it is the finding this whole rebuild turns on:
 * gate 1 already puts the RIGHT FAMILY in its top five 95% of the time
 * (38/40 on the strided holdout) and the right LEAF only 50% of the time. In
 * 18 of those 40 cases it surfaces a sibling of the won fund and not the won
 * fund itself. So gate 2's real job is not to re-rank 58 funds — it is to pick
 * the right leaf inside a family gate 1 has almost certainly already found,
 * and every comparison that matters is a within-family one.
 *
 * Cross-family normalisation actively fights that: it hands the Horizon
 * clusters and the other pool-wide flagships the largest number on the page,
 * which is exactly the "drifts toward whatever is on everyone's menu" failure
 * already measured (gate 2's picks averaged 24.9 appearances across the 80
 * candidate subsets against 17.4 for the funds that actually won).
 */
export function familySectorShare(
  funds: AxisFund[], sector: string | null | undefined,
): Map<string, FamilyShare> {
  const out = new Map<string, FamilyShare>();
  if (!sector) return out;
  const byFamily = new Map<string, AxisFund[]>();
  for (const f of funds) {
    const k = f.regime || f.id;
    (byFamily.get(k) ?? byFamily.set(k, []).get(k)!).push(f);
  }
  for (const fam of byFamily.values()) {
    const total = fam.reduce((a, f) => a + (f.sectorMix?.[sector] ?? 0), 0);
    if (total <= 0) continue;
    const ranked = [...fam].sort((a, b) => (b.sectorMix?.[sector] ?? 0) - (a.sectorMix?.[sector] ?? 0));
    ranked.forEach((f, i) => {
      const n = f.sectorMix?.[sector] ?? 0;
      if (n <= 0) return;
      out.set(f.id, { share: n / total, rank: i + 1, of: fam.length });
    });
  }
  return out;
}

/** How concentrated that posterior is. A shortlist where one fund holds 40% of
 *  the sector's awards is telling you something; one where 58 funds each hold
 *  2% is not, and the prompt should say so rather than let the model read
 *  noise as signal. */
export function sectorConcentration(post: Map<string, number>): number {
  return [...post.values()].reduce((a, b) => a + b * b, 0); // Herfindahl
}

/**
 * The axes these candidates actually differ on, best first.
 *
 * Only axes a founder can answer are returned. `administering_body` is the
 * clearest example of the distinction: it separates 4 sibling groups outright
 * and 23 partly, but no founder knows which agency will handle their file —
 * they know where they are, and geography is what routes them to a body. So it
 * is reported as evidence for the geography axis rather than as a question.
 */
export function computeAxes(funds: AxisFund[], sector?: string | null): Axis[] {
  const n = funds.length;
  if (!n) return [];
  const axes: Axis[] = [];
  const push = (a: Omit<Axis, "band">) => axes.push({ ...a, band: band(a.info) });

  // ── Cheque size ──────────────────────────────────────────────────────────
  // The single strongest separator in the corpus: fully separates 25 of 35
  // sibling groups. Only counted where the median rests on >=5 priced awards;
  // below that it is one or two events wearing a statistic's clothing.
  const aw = tally(funds, (f) => ((f.awardN ?? 0) >= 5 ? awardBand(f.awardP50) : null));
  push({
    key: "award_scale",
    ask: "How much money does this project actually need?",
    split: [...AWARD_BANDS.map((b) => `${aw.counts.get(b.label) ?? 0} ${b.label}`)].join(" · ")
      + ` · ${n - Math.round(aw.coverage * n)} with no reliable median`,
    info: aw.info, coverage: aw.coverage,
  });

  // ── Capital type ─────────────────────────────────────────────────────────
  // Usually LOW and that is the point: it differs in 6.2% of sibling pairs, so
  // on most shortlists asking it burns a question slot for nothing. Where a
  // shortlist really does mix grant and loan, it is worth a slot.
  const cap = tally(funds, (f) => f.capitalType || null);
  push({
    key: "capital_type",
    ask: "Would you take a loan or a guarantee, or only a grant?",
    split: top(cap.counts, 5), info: cap.info, coverage: cap.coverage,
  });

  // ── Where the founder is, sub-nationally ─────────────────────────────────
  // The distinct-body count is the evidence, the region question is the form a
  // founder can answer. When 30-odd bodies deliver near-identical national
  // schemes, region IS the discriminator and nothing else in the row is.
  //
  // ── The count that was standing in for the measurement ───────────────────
  // This scored itself on how many distinct BODIES the shortlist names and how
  // many carry an explicit place gate. Both are proxies and both understate
  // it, for opposite reasons. Only 148 of 958 instruments carry a
  // `region_within` gate and the groups that need one have none (ademe 0/75,
  // vinnova 0/49, satr_fr_rnd 0/42), so the gate term is near zero exactly
  // where the axis matters most. And a distinct body is not a distinct place:
  // fourteen bodies deliver the French RDI regime and four of them are
  // national ministries covering the same ground.
  //
  // regionPrior.generated.json makes it measurable instead. Each fund's
  // delivery region is the most specific NUTS prefix covering a supermajority
  // of its OWN recipients, so the split below is what a founder's answer would
  // really eliminate, and the funds with no regional claim are named as such
  // rather than counted as a fifteenth region.
  const bodies = tally(funds, (f) => (f.body || "").trim() || null);
  const regionGated = funds.filter((f) => f.gateSpecs?.region || f.gateSpecs?.activityCountries).length;
  const bodyInfo = bodies.coverage * splitPower([...bodies.counts.values()]);
  const delivered = tally(funds, (f) => deliveryRegionOf(f.id) ?? null);
  const national = funds.filter((f) => regionFootprints()[f.id] && !deliveryRegionOf(f.id)).length;
  const named = [...delivered.counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([id, c]) => `${c}x ${regionNameFor(id) ?? id}`).join(" · ");
  push({
    key: "region",
    ask: "Which region / city is the company registered in, and where will the work happen?",
    split: delivered.counts.size
      ? `${delivered.counts.size} distinct delivery regions over `
        + `${Math.round(delivered.coverage * n)} funds (${named})`
        + ` · ${national} deliver nationally, so region does not exclude them`
        + ` · ${bodies.counts.size} distinct bodies · ${regionGated} with an explicit place requirement`
      : `no fund here has a measured regional footprint · ${bodies.counts.size} distinct delivery bodies`
        + (bodies.counts.size ? ` (largest: ${top(bodies.counts, 3)})` : "")
        + ` · ${regionGated} funds carry an explicit place requirement`,
    // The best of the three readings, not their average: each is a lower bound
    // on what a region answer removes, and they fail in different places.
    info: Math.max(bodyInfo, regionGated / n, delivered.info), coverage: bodies.coverage,
  });

  // ── EU / national / regional level ───────────────────────────────────────
  const lvl = tally(funds, (f) => (f.country === "EU" ? "EU-level" : f.country ? `national (${f.country})` : null));
  push({
    key: "administration_level",
    ask: "Can you carry an EU consortium application, or do you need a national/regional route?",
    split: top(lvl.counts, 4), info: lvl.info, coverage: lvl.coverage,
  });

  // ── Programme family ─────────────────────────────────────────────────────
  const ch = tally(funds, (f) => f.channel || null);
  push({
    key: "programme_family",
    ask: "Is this an R&D project, a capital investment, or market deployment?",
    split: top(ch.counts, 5), info: ch.info, coverage: ch.coverage,
  });

  // ── Whatever the gates themselves disagree about ─────────────────────────
  // Coverage alone is a trap and the corpus proves it: `activities` gates 78%
  // of siblings and differs in 1 group of 25; `exclusionFlags` gates 85% and
  // differs in 3. They are framework exclusions inherited identically, and a
  // question about them cannot separate anything. So the score is coverage x
  // DISTINCTNESS of the demand, and those two collapse to LOW automatically.
  const fields = new Map<string, Map<string, number>>();
  for (const f of funds) {
    for (const [field, spec] of Object.entries(f.gateSpecs ?? {})) {
      const m = fields.get(field) ?? fields.set(field, new Map()).get(field)!;
      m.set(spec, (m.get(spec) ?? 0) + 1);
    }
  }
  for (const [field, specs] of fields) {
    if (field === "region" || field === "sector" || field === "entityCountries") continue; // already an axis, or already known
    const covered = [...specs.values()].reduce((a, b) => a + b, 0);
    const coverage = covered / n;
    // DISTINCTNESS, not entropy. Entropy over three evenly-used buckets scores
    // near 1 and would mark `exclusionFlags` — 48 funds carrying 3 demands
    // between them, all of them inherited framework text — as a HIGH axis. The
    // question is how close the shortlist comes to every fund wanting
    // something DIFFERENT, which is what openFieldsForShortlist already
    // measures and what collapses the inherited exclusions to nothing.
    const distinctness = covered > 1 ? (specs.size - 1) / (covered - 1) : 0;
    push({
      key: field,
      ask: GATE_FIELD_ASKS[field] ?? `What is your ${field}?`,
      split: `${covered} funds gate on it, ${specs.size} distinct demands between them`,
      info: coverage * distinctness, coverage,
    });
  }

  // ── Sector history ───────────────────────────────────────────────────────
  // Not a question — a statement about how far the empirical sector record can
  // be trusted to separate THESE siblings. Scoped inside the leading family,
  // because across the pool it is a size prior and not a discriminator (see
  // the scope note on sectorPosterior).
  if (sector) {
    const share = familySectorShare(funds, sector);
    const lead = funds.find((f) => share.get(f.id));
    const leadFam = lead?.regime || lead?.id;
    const inLead = funds.filter((f) => (f.regime || f.id) === leadFam && share.has(f.id))
      .sort((a, b) => (share.get(b.id)!.share - share.get(a.id)!.share));
    if (inLead.length) {
      const topShare = share.get(inLead[0].id)!.share;
      push({
        key: "sector_history",
        note: true,
        ask: "(not a question — read the sector share on each row)",
        split: inLead.length === 1
          ? `only one fund in the leading family has ${sector} history`
          : `in the leading family, ${(100 * topShare).toFixed(0)}% of its ${sector} awards went to one fund `
            + `(${inLead[0].name.slice(0, 60)})`
            + (topShare < 1.5 / inLead.length ? " — flat, this does NOT separate them" : ""),
        info: Math.min(1, topShare * 2), coverage: share.size / n,
      });
    }
  }

  return axes.sort((a, b) => b.info - a.info);
}

const GATE_FIELD_ASKS: Record<string, string> = {
  fteBand: "How many people work for you?",
  turnoverBand: "What was last year's turnover?",
  balanceBand: "What is on the balance sheet?",
  foundedYear: "When was the company founded?",
  developmentStage: "How far along is the technology — lab, prototype, pilot, or selling?",
  consortium: "Would you apply alone, or lead/join a consortium with partners?",
  ticketBand: "How much money does this project actually need?",
  useOfFunds: "What would the money pay for?",
  cofinancingBand: "What share of the cost can you fund yourselves?",
  borrowerModel: "Is this an operating company, a project company, or an SPV?",
  activities: "What does the company actually do day to day?",
  exclusionFlags: "Do any standard exclusions apply to you?",
  activityCountries: "Where will the funded work physically happen?",
  conditionality: "Can you accept conditions such as a repayment or a local-presence commitment?",
  lossesOverHalfCapital: "Have accumulated losses eaten more than half the share capital?",
};

/** The axes worth spending questions on, rendered for a prompt. LOW axes are
 *  included but marked, because "do not ask about capital type, they are all
 *  grants" is itself useful instruction — the old prompt spent 46% of its
 *  questions on facts like that. */
export function renderAxes(axes: Axis[], limit = 8): string {
  return axes.slice(0, limit).map((a) => a.note
    ? `  NOTE   ${a.key.padEnd(22)} ${a.split}`
    : `  ${a.band.padEnd(6)} ${a.key.padEnd(22)} (a perfect answer removes ~${Math.round(100 * a.info)}% of the list)  ${a.split}`)
    .join("\n");
}
