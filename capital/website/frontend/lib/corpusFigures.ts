// Where the headline figures a founder reads actually come from.
//
// ── The gap this closes ────────────────────────────────────────────────────
// Until now `lib/data.ts` did `import synthesis from "@/public/data/synthesis.json"`
// — a committed build artifact, imported statically, changing only when a human
// ran `make data` and pushed. The ETL refreshed Railway every Sunday and nothing
// followed. Measured over this repo's own history (`python3
// ETL/lib/drift_window.py`), the median gap between an ETL run and the site
// catching up was 4.6 days and the worst was 32.4.
//
// ── Why this reads the census and not "the database" ───────────────────────
// The obvious shape — have this module query Postgres for the corpus figures —
// cannot be built, and the reason is worth writing down because it looks like a
// choice and is not:
//
//   THE CORPUS IS NOT IN POSTGRES. The companies, events and euros live in
//   `data/db.sqlite`, a file on a Railway volume that nothing outside that
//   container can open. Postgres holds the funds (`funding_instruments`) and
//   the census. `website/build/lib/corpus_kpis.py` — THE one canonical
//   definition of every corpus figure — is SQLite SQL over `companies`,
//   `public_funding_events` and `v_country_public_support`. There is no Postgres
//   table to point it at.
//
// So the one live carrier of those figures from where they are computed to
// where they can be read is `corpus_census`: written by the ETL, inside the
// container, by calling `compute_kpis` itself. Reading it is not a substitute
// for reading the database — it is the only way to read that database from
// here, and it has the property a direct read would have had to invent anyway:
// the coverage gate's verdict travels with the numbers.
//
// ── What this module may and may not do to the figures ─────────────────────
// Nothing. It maps snake_case to camelCase, formats one euro total for display,
// and passes the rest through untouched. It issues exactly one query and that
// query reads `corpus_census` — it does not join `funding_instruments`, and it
// must never learn to. `ETL/schema/check_aggregate_independence.py` asserts the
// contract this protects: the aggregates count EVERYTHING ever recorded,
// closed schemes included, and are unreachable by liveness; only the brief is
// filtered to what a founder can apply to today. A read path that filtered on
// the way past would break that contract in the one place nobody would look.

import artifact from "@/public/data/synthesis.json";
import { fmtEur } from "@/lib/format";
import {
  chooseCensus,
  type CensusChoice,
  type CensusRow,
} from "@/lib/corpusCensus";

/** The corpus-wide KPIs the home page, the nav, the footer and
 *  /about-public-capital all state. Shape unchanged from the artifact's, so
 *  every existing consumer keeps compiling. */
export interface Synthesis {
  companies: number;
  events: number;
  champions: number;
  stepCompanies: number;
  totalCapitalEur: string;
  totalCapitalEurRaw: number;
  countries: number;
  sourceFamilies: number;
  sectors: number;
}

export interface CorpusProvenance {
  /** "census"  — read live from the ETL's own record of its corpus.
   *  "artifact" — the committed synthesis.json. */
  source: "census" | "artifact";
  /** When the CORPUS was read, not when this page was rendered. For a census
   *  it is `taken_at`; for the artifact it is the `generatedAt` the builder
   *  stamps. "" only for an artifact built before that stamp existed. */
  observedAt: string;
  /** One line, for the server log and the page's own dateline. Always says why
   *  THIS source won, including when the answer is "the other one was worse". */
  reason: string;
  /** DATABASE_URL was set — the render asked for live figures — and did not get
   *  them. The distinction between "not configured" and "configured and failed"
   *  is the whole difference between a static build and an outage. */
  degraded: boolean;
  censusId?: number | string;
  producedBy?: string;
  /** Every newer census that was passed over, and why. A page serving older
   *  numbers can always say what it rejected. */
  rejected?: CensusChoice["rejected"];
  /** The Postgres error, when there was one. */
  error?: string;
}

export type CorpusFigures = Synthesis & { provenance: CorpusProvenance };

/** The committed fallback, exactly as generated. */
const ARTIFACT = artifact as Synthesis & { generatedAt?: string };

/** How long the render will wait for Postgres before serving the artifact.
 *
 *  Matched to `hydrateDbInstruments()` deliberately: two seconds is already
 *  this codebase's answer to "how long may a Railway blip hold a founder up",
 *  and a second number would be a second policy. Note that with ISR only a
 *  regeneration ever pays it — see `CORPUS_REVALIDATE_SECONDS`. */
const CONNECT_TIMEOUT_MS = 2_000;
const STATEMENT_TIMEOUT_MS = 2_000;

/** How many censuses back the walk may go before giving up on the live path.
 *
 *  Twelve weekly runs is a quarter. Past that, "the artifact is what we serve"
 *  has stopped being a fallback and become the state of the system, and the
 *  guard's SILENT test is the thing that should be shouting, not this. */
const CENSUS_LOOKBACK = 12;

/** ISR window. Pages that state corpus figures export this as `revalidate`.
 *
 *  One hour, and the reasoning is that this number cannot buy what it looks
 *  like it buys: the ETL writes a census once a week. Polling faster than the
 *  thing changes only moves cost. What an hour does buy is a bound on how long
 *  a BAD state persists — a degraded run, or a census whose figures should not
 *  be up — and an hour is short enough that nobody has to wait for a deploy to
 *  clear it. */
export const CORPUS_REVALIDATE_SECONDS = 3_600;

function fromArtifact(reason: string, extra: Partial<CorpusProvenance> = {}): CorpusFigures {
  const { generatedAt, ...figures } = ARTIFACT;
  return {
    ...figures,
    provenance: {
      source: "artifact",
      observedAt: generatedAt ?? "",
      reason,
      degraded: false,
      ...extra,
    },
  };
}

/** A census row rendered into the shape the site states.
 *
 *  `totalCapitalEur` is the only derived value: the census carries the raw
 *  euro sum, and the display string is a website concern. `fmtEur` is the
 *  TypeScript half of `website/build/lib/helpers.fmt_eur`, and
 *  `ETL/schema/check_cross_language_constants.py` fails when the two stop
 *  agreeing — otherwise the same corpus would read "€352.9B" from the artifact
 *  and something else from the census, and the difference would look like data
 *  movement. */
function fromCensus(row: CensusRow, reason: string,
                    rejected: CensusChoice["rejected"]): CorpusFigures {
  const k = row.kpis!;
  return {
    companies: k.companies!,
    events: k.events!,
    champions: k.champions!,
    stepCompanies: k.step_companies!,
    totalCapitalEurRaw: k.total_capital_eur_raw!,
    totalCapitalEur: fmtEur(k.total_capital_eur_raw!),
    countries: k.countries!,
    sourceFamilies: k.source_families!,
    sectors: k.sectors!,
    provenance: {
      source: "census",
      observedAt: row.taken_at.toISOString(),
      reason,
      degraded: false,
      censusId: row.id,
      producedBy: row.produced_by,
      rejected,
    },
  };
}

/**
 * Read the corpus figures, live where that is both possible and safe.
 *
 * ── The order of preference, and why it is this order ──────────────────────
 *  1. The newest census that PASSES `admissibility()` — gate verdict true, run
 *     finished, no errors, every figure present.
 *  2. …unless the committed artifact was generated MORE RECENTLY than that
 *     census, in which case the artifact is simply the fresher reading and
 *     wins. This is the invariant that makes the change safe to ship: the live
 *     path can make the site fresher and can never make it staler.
 *  3. The artifact, when Postgres is unreachable, slow, or holds nothing
 *     admissible.
 *
 * ── It cannot throw ────────────────────────────────────────────────────────
 * Every failure lands on the artifact. A home page that 500s because Railway
 * blipped is a worse outcome than one showing figures from last Tuesday, and
 * the artifact is committed, so the fallback needs no I/O that can itself fail.
 *
 * ── …and it cannot fall back QUIETLY ───────────────────────────────────────
 * The silent fallback is the specific defect this codebase has already paid
 * for: `hydrateDbInstruments()` degrading without a word put a dead application
 * link in front of 26% of founders, and two harnesses spent a night comparing
 * 72% against 95% without knowing they were measuring different corpora. So
 * every degradation is logged with its reason at the point it happens, carried
 * in `provenance`, and dated on the page itself.
 */
export async function readCorpusFigures(): Promise<CorpusFigures> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return fromArtifact(
      "no DATABASE_URL: this render never had a live source to prefer");
  }

  let rows: CensusRow[];
  try {
    const { Client } = await import("pg");
    const client = new Client({
      connectionString: url,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    });
    await client.connect();
    try {
      // A plain SET after connect(), not a connection parameter: Railway's
      // Postgres proxy rejects both the startup-packet form and libpq's
      // `options: "-c ..."`. Same finding as corpus.ts; same workaround.
      await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      // The ONE query this module issues. `corpus_census` only. Ordering is the
      // database's, so chooseCensus() never forms a second opinion about which
      // reading is newer.
      rows = (await client.query(
        `SELECT id, taken_at, produced_by, code_fingerprint, kpis, instruments,
                coverage, gate, run_outcome, errors
           FROM corpus_census
          ORDER BY taken_at DESC
          LIMIT ${CENSUS_LOOKBACK}`)).rows as CensusRow[];
    } finally {
      await client.end();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[corpus] DEGRADED — DATABASE_URL is set and the census could not be read ` +
      `(${message}). Serving the committed artifact from ` +
      `${ARTIFACT.generatedAt ?? "an unknown date"}.`);
    return fromArtifact(
      `Postgres was unreachable, so the last published figures are being shown`,
      { degraded: true, error: message });
  }

  const { chosen, rejected } = chooseCensus(rows);

  if (!chosen) {
    const why = rows.length
      ? `none of the newest ${rows.length} censuses passed the coverage gate`
      : `the census table is empty`;
    for (const r of rejected) {
      console.warn(`[corpus] census #${r.id} (${r.takenAt}) not served: ` +
                   r.reasons.join(" | "));
    }
    console.warn(
      `[corpus] ${why}. Serving the committed artifact from ` +
      `${ARTIFACT.generatedAt ?? "an unknown date"}. This is the gate doing its ` +
      `job: a corpus that got worse must not reach a founder for being fresher.`);
    return fromArtifact(why, { degraded: true, rejected });
  }

  // The artifact is not merely a fallback — on the day somebody runs
  // `make republish` it is genuinely the newest reading there is, because it
  // comes from a db pulled minutes ago while the newest census may be days old.
  // Comparing dates rather than assuming a winner is what guarantees this
  // change can only ever move the site forwards.
  const artifactAt = ARTIFACT.generatedAt ? Date.parse(ARTIFACT.generatedAt) : NaN;
  if (Number.isFinite(artifactAt) && artifactAt > chosen.taken_at.getTime()) {
    return fromArtifact(
      `the committed artifact (${ARTIFACT.generatedAt}) is a more recent reading ` +
      `than the newest admissible census #${chosen.id} ` +
      `(${chosen.taken_at.toISOString()})`,
      { rejected });
  }

  if (rejected.length) {
    console.warn(
      `[corpus] serving census #${chosen.id}; ${rejected.length} newer census(es) ` +
      `were rejected: ` +
      rejected.map((r) => `#${r.id} ${r.reasons.join(" | ")}`).join(" || "));
  }

  return fromCensus(
    chosen,
    rejected.length
      ? `the newest census that passed the coverage gate; ${rejected.length} ` +
        `newer reading(s) were rejected`
      : `the newest census, which passed the coverage gate`,
    rejected);
}

/** A one-line dateline for the page: when the corpus behind these figures was
 *  read. Shown rather than logged, because a founder comparing two numbers a
 *  week apart is entitled to know which day each describes — and because a
 *  fallback nobody can see is the one that lasts 32 days. */
export function corpusAsOf(p: CorpusProvenance): string {
  if (!p.observedAt) return "corpus date not recorded";
  return `corpus as of ${p.observedAt.slice(0, 10)}`;
}
