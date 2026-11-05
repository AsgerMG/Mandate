// Thematic relevance: does an instrument actually fund what this company does?
//
// The bug this exists to fix: selectLeafInstruments() ranks the leaves inside a
// source_family_bucket by event_count. But some buckets are thematically MIXED.
// `horizon_eu_partnership` holds nine Joint Undertakings — CHP (health, 1,665
// events), IHI (health, 1,515), SNS JU (networks), Clean Aviation, Europe's
// Rail, SESAR JU, EuroHPC, GH EDCTP3 and EUSPA (space, 361). Sorting by event
// count means a space company, a rail company and a health company are all
// handed CHP and IHI, and EUSPA — whose own gate text says "satellite-based
// earth observation, positioning, navigation" — is never surfaced to a
// satellite company. Same failure shape applies to EIT KICs and the Horizon
// clusters.
//
// The signal is already in the corpus: each instrument's own gate requirement
// text says what it funds. This scores the founder's free-text description
// against that text, IDF-weighted so that shared boilerplate ("funds must be
// used for eligible project costs") contributes nothing and rare domain words
// ("satellite", "aviation", "hydrogen", "rail") dominate.
//
// Deterministic and model-free by design: it runs inside computeVerdict(),
// which must stay instant and zero-cost.
import { loadDbInstruments, type DbInstrument } from "./corpus";
import { THEME_TOKENS } from "./themeIndex.generated";
import { MIN_MATCHABLE_DESCRIPTION_CHARS } from "./types";

/** Gate families that describe WHAT is funded, rather than who may apply.
 *  G1_nexus is deliberately EXCLUDED despite sounding thematic: in practice it
 *  is overwhelmingly geography boilerplate ("entities established in Russia,
 *  Belarus... cannot participate"), and including it drowned the one line per
 *  fund that carries the real theme. G5 is where "rail sector R&D",
 *  "aviation decarbonisation" and "space/GNSS" actually live. */
const THEMATIC_FAMILIES = new Set(["G5_use_of_funds"]);

/** Words too common in eligibility prose to carry any thematic signal, on top
 *  of the IDF weighting (which already suppresses most of them). */
const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "must", "may", "not", "are", "was",
  "from", "into", "your", "our", "their", "its", "will", "have", "has", "been",
  "which", "such", "any", "all", "other", "than", "used", "use", "using", "based",
  "within", "under", "over", "per", "via", "including", "include", "included",
  "project", "projects", "funds", "funding", "funded", "eligible", "eligibility",
  "costs", "cost", "activity", "activities", "support", "supported", "applicant",
  "applicants", "company", "companies", "must", "should", "can", "could",
  "development", "developing", "innovation", "innovative", "new", "also",
]);

function tokens(text: string): string[] {
  // Hyphens and slashes SPLIT. Keeping them joined meant "space-traffic" and
  // "collision-avoidance" were single tokens that could never match "space" in
  // a fund's text, and "space/GNSS" never yielded "space" either — which is
  // exactly why a satellite company failed to match the EU Space agency.
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOP.has(t));
}

/** True when two tokens are the same word to a first approximation, so
 *  "railway" matches "rail" and "satellites" matches "satellite". Prefix
 *  matching on a 4+ char stem is crude but beats exact-match, which missed
 *  every plural and compound in testing. */
function related(a: string, b: string): boolean {
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 4 && long.startsWith(short);
}

/**
 * Sentences that state an instrument's THEMATIC SCOPE, as opposed to its cost
 * and admin rules. Filtering to these matters more than it looks: the Clean
 * Hydrogen Partnership's cost rules mention "solid" (solid-oxide equipment),
 * which made "solid tumours" match the hydrogen fund at 1.00 and outrank the
 * global-health one. Scope sentences are where "rail sector", "aviation
 * decarbonisation" and "space/GNSS" live; cost rules are pure noise.
 *
 * Implemented as an anti-pattern rather than a scope-word whitelist: requiring
 * scope words dropped EUSPA's "satellite-based earth observation, positioning,
 * navigation" sentence (it states a domain without saying "scope" or "agenda"),
 * which let SESAR's "air traffic management" outrank the actual space agency
 * for a satellite company.
 */
const ADMIN_NOISE =
  /\b(cost|costs|purchase|purchases|equipment|infrastructure|depreciation|subcontract|subcontracting|page limit|admissibility|vat|accounts|percentage|allocated|duration|coordinator|invoice|overhead|flat-rate|declared)\b/i;

/** What an instrument funds, in its own words. Deliberately excludes
 *  sampleProjectTitles: in this corpus they are mostly national regulation
 *  names ("FFG-KMU-Richtlinie 2024-2026"), which add noise, not theme. */
function themeText(inst: DbInstrument): string {
  const thematic = inst.gates.filter((g) => THEMATIC_FAMILIES.has(g.gateFamily ?? ""));
  const scoped = thematic.filter((g) => !ADMIN_NOISE.test(g.requirement));
  // Fall back to all thematic gates only when every one looks like admin prose,
  // so an instrument is never left with nothing indexed at all.
  const gateText = (scoped.length ? scoped : thematic).map((g) => g.requirement).join(" ");
  return `${inst.name} ${gateText}`;
}

/**
 * The tokens this instrument contributes to the lexical index.
 *
 * Exported ONLY for scripts/emit_theme_index.ts and its drift check. The four
 * things it composes -- THEMATIC_FAMILIES, ADMIN_NOISE, STOP and tokens() --
 * stay module-private on purpose: exporting the FUNCTION means a change to any
 * of them changes the emitted bytes and the byte-exact check fails, whereas
 * exporting the constants would let someone reassemble them differently
 * somewhere else, which is precisely the drift this exists to prevent.
 *
 * Sorted and deduplicated so the artifact is a pure function of the corpus.
 */
export function themeTokensFor(inst: DbInstrument): string[] {
  return [...new Set(tokens(themeText(inst)))].sort();
}

interface Index {
  /** instrumentId -> its own token set. */
  byInstrument: Map<string, Set<string>>;
  /** token -> inverse document frequency. */
  idf: Map<string, number>;
}

/** Minimum raw IDF a match must reach to count. With ~322 instruments,
 *  ln(322/26) ~= 2.5, so this demands at least one word that appears in about
 *  a tenth of instruments or fewer. */
const MIN_RAW_HIT = 2.5;

let indexCache: Index | null = null;

function buildIndex(): Index {
  if (indexCache) return indexCache;
  // Read the generated token index, never the gates — on BOTH the Postgres and
  // the JSON path. Computing from gates when they happen to be present would
  // make NO_PG=1 (every check we run) exercise a different index from
  // production, which is the divergence class this codebase keeps getting bitten
  // by. The tokens are identical either way: emit_theme_index.ts produces them
  // with themeTokensFor(), the same function buildIndex used to call inline.
  const instruments = loadDbInstruments();
  const byInstrument = new Map<string, Set<string>>();
  const df = new Map<string, number>();
  let stale = 0;
  for (const inst of instruments) {
    const packed = THEME_TOKENS[inst.id];
    // An instrument published since the artifact was generated indexes on its
    // name alone: weak but visible, rather than invisible at the MIN_RAW_HIT
    // floor below. check_theme_index.ts is what stops this being the norm.
    const set = packed !== undefined
      ? new Set(packed.split(" ").filter(Boolean))
      : (stale++, new Set(tokens(inst.name)));
    byInstrument.set(inst.id, set);
    for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
  }
  if (stale) {
    console.warn(
      `theme_index_stale: ${stale} instrument(s) missing from ` +
      `themeIndex.generated.ts — run \`npx tsx scripts/emit_theme_index.ts\``);
  }
  const n = Math.max(instruments.length, 1);
  const idf = new Map<string, number>();
  // Derived here, not emitted: the formula must live in one place, and
  // shipping idf would put it in two.
  for (const [t, d] of df) idf.set(t, Math.log(n / d));
  indexCache = { byInstrument, idf };
  return indexCache;
}

/**
 * Score how well each instrument's fundable-activity text matches the
 * founder's description, on 0-1 normalised across the instruments scored.
 *
 * Returns an empty map when the description is too thin to say anything, so
 * callers can fall back to their existing ordering rather than shuffling rows
 * on noise.
 */
export function themeRelevance(
  description: string | undefined,
  instrumentIds: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  const desc = description?.trim();
  if (!desc || desc.length < MIN_MATCHABLE_DESCRIPTION_CHARS) return out;

  const { byInstrument, idf } = buildIndex();
  const queryTokens = new Set(tokens(desc));
  if (!queryTokens.size) return out;

  // No query-mass normalisation: it is a constant across instruments, so it
  // cancels in the best-normalisation below, and it could be ~0 for a
  // description whose words appear in no fund text (making the ratio explode).
  const raw = new Map<string, number>();
  let best = 0;
  for (const id of instrumentIds) {
    const set = byInstrument.get(id);
    if (!set) continue;
    let hit = 0;
    for (const t of queryTokens) {
      // Exact first (cheap), then the stem fallback.
      if (set.has(t)) { hit += idf.get(t) ?? 0; continue; }
      for (const s of set) {
        // Score the INSTRUMENT-side token's IDF, not min() of both: a query
        // word that appears in no fund's text at all ("railway", "signalling")
        // has IDF 0, so min() made every stem match worth exactly nothing —
        // which is why a rail company matched no rail fund.
        if (related(t, s)) { hit += idf.get(s) ?? 0; break; }
      }
    }
    // A single common-ish word is a coincidence, not a theme match. Require at
    // least one genuinely distinguishing hit (IDF >= MIN_RAW_HIT, i.e. a word
    // appearing in roughly a tenth of instruments or fewer) before this counts
    // at all. Without the floor, best-normalisation turns any stray overlap
    // into a confident 1.00.
    if (hit < MIN_RAW_HIT) continue;
    raw.set(id, hit);
    if (hit > best) best = hit;
  }
  // Normalise to the best match in this set: the absolute overlap is small
  // (eligibility prose is not a product description), so what matters is
  // which instrument matches MOST, not the raw fraction.
  for (const [id, score] of raw) out.set(id, best > 0 ? score / best : 0);
  return out;
}

/** Below this normalised score a match is indistinguishable from noise, and
 *  the caller should keep its existing ordering. */
export const RELEVANCE_FLOOR = 0.35;

/** A thematic match has to be near-best to justify pulling in a whole channel
 *  the founder's peers never used. Deliberately stricter than RELEVANCE_FLOOR. */
const TOPUP_THRESHOLD = 0.8;

/**
 * Channels worth adding because they contain an instrument that thematically
 * matches this company, even though no peer used them.
 *
 * Fixing leaf ORDER was not enough: `horizon_eu_partnership` was never in the
 * candidate channel set at all for a satellite company, so EUSPA could not be
 * reached however well it ranked inside its bucket. Channel selection is
 * peer-driven (fieldChannels) plus a fixed default list, neither of which knows
 * anything about what the company does.
 *
 * Returns at most `limit` channels, best match first.
 */
export function thematicChannelTopUp(
  description: string | undefined,
  alreadySelected: Set<string>,
  limit = 2,
  /** Semantic scores from semantic.ts, when available. Preferred over the
   *  lexical index: profile-embedding retrieval beat it on every domain
   *  tested. Empty map = fall back to lexical. */
  semantic?: Map<string, number>,
): { channel: string; instrumentId: string; score: number }[] {
  const desc = description?.trim();
  if (!desc || desc.length < MIN_MATCHABLE_DESCRIPTION_CHARS) return [];
  const instruments = loadDbInstruments().filter(
    (i) => i.sourceFamilyBucket && !alreadySelected.has(i.sourceFamilyBucket) && i.eventCount > 0,
  );
  if (!instruments.length) return [];

  const rel = semantic?.size
    ? semantic
    : themeRelevance(desc, instruments.map((i) => i.id));
  const byChannel = new Map<string, { instrumentId: string; score: number }>();
  for (const inst of instruments) {
    const score = rel.get(inst.id) ?? 0;
    if (score < TOPUP_THRESHOLD) continue;
    const bucket = inst.sourceFamilyBucket as string;
    const prev = byChannel.get(bucket);
    if (!prev || score > prev.score) byChannel.set(bucket, { instrumentId: inst.id, score });
  }
  return [...byChannel.entries()]
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
