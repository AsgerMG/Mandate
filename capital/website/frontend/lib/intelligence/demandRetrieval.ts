// RETRIEVAL FOR THE SELECTOR — and the one index it is allowed to read.
//
// ── WHY THIS FILE EXISTS AT ALL ───────────────────────────────────────────
// The free selector arm was handed 40 flattened rows and told to choose. It
// lost (EXACT@6 17% against the shipped 27%). Part of the diagnosis is that it
// had no way to resolve an ambiguity: two candidates that look identical on a
// rendered row ARE identical to it, and it guessed. This module gives it the
// thing that separates them — but only the thing that CANNOT contain the
// answer, and only for the candidates it says it is unsure about, because
// retrieval on every row costs more than the whole brief is allowed to.
//
// ── THE TWO INDEXES ARE NOT THE SAME RISK ─────────────────────────────────
// Say which is used for what, every time, because conflating them is how the
// leak comes back.
//
//   eligibility_embeddings — WHAT A FUND DEMANDS. THIS IS THE ONE WE READ,
//     AND ONLY ITS `source_type = 'gate'` ROWS. That restriction is enforced in
//     the query below and it is load-bearing, because the index holds two kinds
//     of row and only ONE of them is covered by the argument that follows.
//
//     GATE ROWS. Written by ETL/terms/embed_eligibility.py, whose text is
//
//         def gate_chunk_text(requirement, value):
//             return f"{requirement}\nValue: {value}" if value else requirement
//
//     from `eligibility_gates`. That table has columns for the requirement,
//     its value, its machine-evaluable spec, its source quote and its
//     verification level. It has NO column for a beneficiary, an award, an
//     amount, a company, a year or a project title — so there is no query
//     against these rows, however phrased, that can return who won a fund.
//     The reach is structural, not a filter that could be misconfigured: the
//     answer is not in the table.
//
//     CLAUSE ROWS, WHICH WE DO NOT READ. Same index, but the text is
//     `eligibility_clauses.text` — free prose lifted off a source page, not a
//     value in a typed column. The paragraph above is an argument about a
//     SCHEMA, and it does not transfer to free text: nothing in the shape of
//     that column prevents a scraped clause from naming a beneficiary, and
//     "we looked and did not see one" is not the same claim as "the column
//     cannot hold one". This repo has already paid for inferring a corpus-wide
//     property from what it happened to read.
//
//     Excluding them costs nothing, which is what makes this an easy call
//     rather than a trade: clause rows were measured at 0 of 304 blind pairs.
//     So the restriction buys a leak argument that holds by construction, at a
//     retrieval quality price of zero.
//
//   instrument_profiles — WHAT A FUND FUNDS. NEVER READ HERE, AND THIS FILE
//     DOES NOT CONTAIN A QUERY AGAINST IT.
//     Its `profile_text` is assembled by build_instrument_profiles.py and
//     section 5 of that document is literally "Projects it has actually
//     funded: " followed by up to 40 real `public_funding_events.project_title`
//     strings. For a `project`-mode recall pair the founder's description IS
//     one of those titles. Handing this text to a model is handing it the
//     answer key, and any number that rose would have risen for that reason.
//
//     The shipped ranker uses this index and is not leaking, because it
//     consumes a SCALAR: `semanticFundMatch` returns one percentile per
//     instrument and never the text behind it, and ETL/lib/recall_holdout.py
//     strips a graded pair's own title out of the document before embedding.
//     The selector inherits that scalar for free — it is already baked into
//     the order of the rows it is shown — and must never be given the text.
//
// So the honest summary of what the model can reach, per path:
//   rendered rows   what each fund demands + aggregates over its whole award
//                   history. Nothing conditioned on THIS founder.
//   peer prior      which funds companies in this founder's country/sector
//                   cell have won — with every company in every graded recall
//                   set dropped by glob BEFORE counting, by default, in
//                   ETL/lib/recall_holdout.py. The founder being replayed is
//                   therefore not in the statistic that describes them.
//   this retrieval  gate requirement text. Structurally cannot name a winner.
//   NOT AVAILABLE   profile_text, the founder's own award history
//                   (ownHistory: "withheld"), and `usedInField`, which is
//                   tier 1 of the shipped sort and is not rendered.
import type { Client } from "pg";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
/** The same model the profiles and the gates were embedded with. A query
 *  embedded by a different model is not in the same space and retrieves
 *  noise that looks like a result. */
const MODEL = "voyage-3.5";
const TIMEOUT_MS = 6000;

export interface DemandChunk {
  instrumentId: string;
  text: string;
}

/**
 * Embed the founder's side of the question.
 *
 * `input_type: "query"` is not cosmetic — Voyage places queries and documents
 * at deliberately different positions, and `embed_eligibility.py` wrote these
 * chunks with `input_type="document"`. Getting this wrong degrades silently
 * into plausible-looking nonsense.
 */
async function embedQuery(text: string): Promise<number[] | null> {
  const key = process.env.VOYAGE_KEY;
  if (!key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ input: [text.slice(0, 8000)], model: MODEL, input_type: "query" }),
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    const j = await res.json() as { data?: { embedding?: number[] }[] };
    return j.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * For each named instrument, the gate requirements that bear most on THIS
 * founder's situation.
 *
 * Scoped by `instrument_id = ANY($2)` — this is a lookup about candidates the
 * selector already has in front of it, never a search of the corpus. That
 * matters for the leak argument as well as for cost: the model cannot use
 * retrieval to discover a fund, only to understand one it was already shown.
 *
 * Returns [] on any failure. A selector that cannot retrieve must fall back to
 * choosing on what it already has, never fail the brief.
 */
export async function retrieveDemands(
  instrumentIds: string[], founderText: string, perInstrument = 3,
): Promise<DemandChunk[]> {
  const url = process.env.DATABASE_URL;
  if (!url || !instrumentIds.length || !founderText.trim()) return [];
  const vec = await embedQuery(founderText);
  if (!vec) return [];
  const literal = `[${vec.join(",")}]`;

  let client: Client | undefined;
  try {
    const { Client: PgClient } = await import("pg");
    client = new PgClient({ connectionString: url, connectionTimeoutMillis: 3000 });
    await client.connect();
    await client.query("SET statement_timeout = 5000");
    // Ranked WITHIN each instrument, not globally: a global top-N would return
    // ten chunks from the most verbose fund and none from the other four,
    // which answers a different question from the one the selector asked.
    const res = await client.query(
      // `source_type = 'gate'` is the leak boundary, not a quality filter. See
      // the header: the structural argument that this index cannot name a
      // winner is an argument about the COLUMNS of `eligibility_gates`, and it
      // does not cover the clause rows, whose text is free prose. Inside the
      // subquery so it bounds the ranking too — filtering after ROW_NUMBER
      // would let clause rows consume the per-instrument slots and silently
      // return fewer gates than asked for.
      `SELECT instrument_id, chunk_text FROM (
         SELECT instrument_id, chunk_text,
                -- Tied on chunk_text, for the same reason semantic.ts ties on
                -- instrument_id: SQL promises no order for rows the ORDER BY
                -- cannot separate, and this one FEEDS A CUTOFF. Two gate
                -- clauses at the same distance decide between themselves which
                -- lands inside the per-instrument limit and which falls out, so
                -- an untied ranking hands the model a different requirement to
                -- read on two runs of unchanged code. The embedding is the
                -- wrong tiebreak (equal distance does not mean equal vector)
                -- and this table has no id column, so the text itself is the
                -- total one: two rows with identical text are interchangeable
                -- by definition, which is exactly when an arbitrary choice
                -- stops mattering.
                ROW_NUMBER() OVER (
                  PARTITION BY instrument_id
                      ORDER BY embedding <=> $1::vector, chunk_text) AS rn
           FROM eligibility_embeddings
          WHERE instrument_id = ANY($2)
            AND source_type = 'gate'
       ) t WHERE rn <= $3`,
      [literal, instrumentIds, perInstrument]);
    return res.rows.map((r: { instrument_id: string; chunk_text: string }) => ({
      instrumentId: r.instrument_id, text: r.chunk_text,
    }));
  } catch (err) {
    console.error("[demandRetrieval] lookup failed, selector continues without it:", String(err));
    return [];
  } finally {
    await client?.end().catch(() => {});
  }
}
