// Do the two corpora agree about which funds are OPEN, and can the retrieval
// index still find all of them?
//
// ── Why this exists ────────────────────────────────────────────────────────
// On 2026-08-06 the same measurement, on the same code and the same pinned
// sample, read pool 97% and pool 77% twenty minutes apart, and two separate
// workstreams reported both upward as if they described one system. They did
// not. The runs had ranked on two different corpora:
//
//   Postgres            pool 72%   1.1 closed calls in the pool per founder
//   committed snapshot  pool 95%  20.3 closed calls in the pool per founder
//
// and NOTHING said which one a run had used, because `hydrateDbInstruments()`
// degrades to `public/data/instrument_terms.json` on any Postgres failure,
// prints one line, and continues. Bisecting field by field, the entire 20-point
// gap is `scheme_end_date` and `scheme_end_date_basis`: the snapshot predates
// 86 loaded application deadlines and carries no basis key at all, so the one
// liveness rule reads every SATR notification expiry as a permanent closure in
// one corpus and not in the other. 26% of founders served off the snapshot were
// shown at least one fund whose deadline had passed. On Postgres: 0%.
//
// ── The property, not the incident ─────────────────────────────────────────
// The check is NOT "does the snapshot have a schemeEndBasis key". That names
// today's missing field and would pass tomorrow with a different one missing.
// The property is:
//
//     the fallback corpus must answer every liveness question exactly as
//     Postgres does
//
// so it is tested by asking both — `isClosed()` from the one definition, over
// every instrument in the corpus. A dropped field, a stale value, a new column
// the exporter does not carry yet, a reload half applied: all of them surface
// as a disagreement, including the ones nobody has thought of. The second half
// is the same shape for the retrieval index: everything publishable must have a
// profile, or the semantic ranker scores it zero and "thematically wrong" and
// "not in the index" become indistinguishable.
//
// The THIRD half is the same property once more, for the OFFLINE mirror of that
// index. `semanticCache.generated.json` is what every NO_PG check ranks on, and
// on 2026-08-07 it was found holding 1,014 instruments against a live index of
// 1,084 — 86 funds absent, 16 scored that no longer exist, and ~83% of the
// shared ids at a different rank. It had been that way since the previous day's
// reload and NOTHING was red, because the artifact is committed and no check
// compared it to anything. Same property, same shape: a derived artifact must
// answer for exactly the corpus that ships.
//
// Skips only when there is no DATABASE_URL — with nothing to compare against
// there is no claim to test. It never passes quietly on a comparison it could
// have made.
import { readFileSync } from "fs";
import path from "path";

// Repo root AND frontend, from the one shared loader. Reading only
// ./.env.local was a way for this check to skip itself and report that as a
// pass: a checkout that carries DATABASE_URL at the repo root -- where it is
// documented to live -- and not under website/frontend produced "skipped,
// nothing to compare against" on a machine that had the credentials all along.
// The block that used to sit here had been copy-pasted into seven harnesses
// while thirty-three others still carried the single-path version; see
// scripts/loadEnv.ts.
// And then a DECLARED contract, because the fixed path only made the skip
// rarer. Without DATABASE_URL and without NO_PG this check now ENDS non-zero
// rather than printing "skipped" and returning 0 -- which was the exact defect
// it exists to catch, in itself.
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
const CREDENTIALS = requireCredentials("check_corpus_currency", ["DATABASE_URL"]);

// This guard needs credentials, so it cannot run in CI. It therefore publishes
// what it decided (scripts/guardVerdict.ts) and check_verdicts.ts asserts on
// that without any — including that the verdict was taken on THIS code, so a
// change to the snapshot or to the liveness rule cannot ship on an old pass.
import { publishVerdict, startTape } from "./guardVerdict";

const GUARD = "corpus_currency";
const tape = startTape();

import { isClosed, today } from "../lib/intelligence/liveness";
// The ONE normaliser. `profileLeakIndex.generated.json` stores the squashed
// form, Python squashes it on the way in, and this is the implementation the
// artifact's own `squashProbes` are the cross-language contract for.
import { squash } from "../lib/intelligence/recallLeaks";

interface SnapshotRecord {
  id: string;
  schemeEndDate?: string | null;
  schemeEndBasis?: string | null;
  lastYear?: number | null;
  successorScheme?: string | null;
}

// ── THE FIELD DISPOSITION, AND WHY IT IS A PROPERTY RATHER THAN A LIST ─────
//
// ██ THIS GUARD COMPARED 5 OF THE 37 FIELDS THE SNAPSHOT CARRIES. ██
//
// Its header says the property is "the fallback corpus must answer every
// liveness question exactly as Postgres does", and for LIVENESS it does. But
// the guard is named `corpus_currency`, the registry describes it as "the
// committed fund snapshot against live Postgres", and a reader takes the
// broader claim — as they should, because `hydrateDbInstruments()` serves a
// real founder from every one of those 37 fields when Postgres is unreachable.
// It was green on 2026-08-12 with the snapshot 2,292 eligibility rules behind
// Postgres: a degraded request answered from a corpus missing every rule bought
// that day, and nothing anywhere said so.
//
// The durable fix is not "also compare the gates". It is that A FIELD CANNOT
// ARRIVE UNWATCHED. So the disposition of every field is DERIVED, not listed:
//
//   a snapshot field whose snake_case name is a column of `funding_instruments`
//   IS COMPARED, automatically and without anybody adding it here.
//
// Anything else must appear in `FIELD_NOTES` with a reason and a review date,
// and a field in neither FAILS THE BUILD. That is the test for the unseen case:
// field 38 is compared the day it lands if it is a column, and reds the build
// the day it lands if it is not. Nobody has to remember.
//
// The three that are not columns today are all real and all different, which is
// why the escape hatch exists at all rather than being a hole:
const FIELD_NOTES: Record<string, { why: string; review: string }> = {
  gates: {
    why: "not a column — `eligibility_gates`, one row per rule. Compared in "
      + "section 4 on its own terms: 9,763 rules cannot be a cell in a SELECT.",
    review: "2026-12-31",
  },
  application: {
    why: "not a column — `instrument_application`, the curated route table, "
      + "joined at hydration. Its own comparison is not built yet; it decides "
      + "the channel and timeline a founder is told, so it is worth one.",
    review: "2026-10-31",
  },
  schemeEndBasis: {
    why: "the column is `scheme_end_date_basis`, so the derived name misses it. "
      + "An ALIAS rather than an exemption — it is compared, through COLUMN_ALIAS.",
    review: "2026-12-31",
  },
};

/** Where the derived snake_case name is not the column name. Kept separate from
 *  FIELD_NOTES' exemptions because an alias is still a COMPARISON, and folding
 *  the two together would make "renamed" and "unchecked" look alike. */
const COLUMN_ALIAS: Record<string, string> = { schemeEndBasis: "scheme_end_date_basis" };

/**
 * Fields where the SNAPSHOT MATERIALISES A DEFAULT that the Postgres path
 * applies at READ time instead. Not an exemption — a NARROWER comparison.
 *
 * `country` is NULL on the 15 EU-level instruments (chips_ju, edf, eic, the
 * seven EIT KICs, innovation_fund, ipcei, the two Horizon rollups). The
 * exporter writes `inst["country"] or "EU"` (website/build/eligibility_export.py)
 * and the Postgres hydrator writes `inst.country ?? "EU"`
 * (lib/intelligence/corpus.ts). A founder is therefore answered "EU" on either
 * path — the two stores agree about the world and differ only about WHERE the
 * default is applied. A raw cell-by-cell comparison cannot see that, and it
 * reported 15 rows for six days as though a republish would clear them. No
 * republish can: it is what the exporter is written to do.
 *
 * So the difference is permitted in EXACTLY ONE SHAPE and no other:
 *
 *     Postgres holds NOTHING and the snapshot holds precisely this value.
 *
 * A snapshot that says "DE" where Postgres says "FR" still fails. A snapshot
 * that says "EU" where Postgres says "DE" still fails. And if the default in
 * either language changes without the other, the snapshot stops holding this
 * exact string and this check goes red — which is the drift a plain exemption
 * would have hidden. The value is restated here because the two definitions
 * are in two languages; that duplication is itself the thing being watched.
 */
const READ_DEFAULT: Record<string, { value: string; why: string; review: string }> = {
  country: {
    value: "EU",
    why: "eligibility_export.py writes `or \"EU\"`; corpus.ts writes `?? \"EU\"`. "
      + "Same answer to a founder, applied at export on one path and at read on "
      + "the other.",
    review: "2026-12-31",
  },
};

const snakeCase = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const columnFor = (field: string) => COLUMN_ALIAS[field] ?? snakeCase(field);

/**
 * One value, in a form the two stores can be compared in.
 *
 * `pg` hands jsonb back as a STRING while the snapshot carries a parsed object,
 * and a naive comparison reported 3,994 false divergences on the day this was
 * written — every one of them the same object rendered two ways. So the shape
 * is normalised, and NOT the content: a difference that survives this is a
 * difference about the world.
 *
 * The one tolerance is on floating point, at 1e-5. `administeringBodyShare`
 * differs on one row at the sixth decimal (0.993377 against 0.993378), which is
 * a property of two languages' float printing rather than a disagreement about
 * who administers the scheme. Stated as a number here so it can be argued with,
 * rather than left as an unexplained pass.
 */
function normaliseValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return v.toFixed(5);
  if (typeof v === "string") {
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v).toFixed(5);
    if (/^[[{]/.test(v.trim())) {
      try { return normaliseValue(JSON.parse(v)); } catch { /* it is just a string */ }
    }
    return v;
  }
  if (Array.isArray(v)) return JSON.stringify(v.map(normaliseValue));
  if (typeof v === "object") {
    return JSON.stringify(Object.fromEntries(
      Object.keys(v as object).sort().map((k) => [k, normaliseValue((v as Record<string, unknown>)[k])])));
  }
  return String(v);
}

/** One row of the liveness SELECT below, in Postgres' snake_case. Named so the
 *  columns this check reads are declared in one place: a typo in a field name
 *  is otherwise `undefined`, and `undefined` reads to `isClosed` as "open". */
interface LiveRow {
  id: string;
  name: string | null;
  scheme_end_date: string | null;
  scheme_end_date_basis: string | null;
  last_year: number | null;
  successor_scheme: string | null;
}

/** How many disagreements are worth printing before the point is made. */
const SHOW = 8;

async function main() {
  // The only skip left is the one somebody declared. "No credentials" is no
  // longer reachable here: it ended the process at the top of the file.
  if (CREDENTIALS === "offline") {
    console.log("check_corpus_currency: skipped — NO_PG=1, so there is no live "
      + "corpus to compare the committed one against");
    return;
  }
  const url = process.env.DATABASE_URL as string;

  const file = path.join(process.cwd(), "public", "data", "instrument_terms.json");
  const snapshot = (JSON.parse(readFileSync(file, "utf8")) as {
    generatedAt?: string; records: SnapshotRecord[];
  });
  const snapById = new Map(snapshot.records.map((r) => [r.id, r]));

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  let live: LiveRow[], profileMissing: number, profileOrphan: number, profiles: number;
  let profileIds: Set<string>, textProfileIds: Set<string>;
  /** instrument id -> the profile string the LIVE index is embedded from. The
   *  id set says which funds the index can rank; this says what it ranks them
   *  ON, and only the second can see a rebuild that rewrote the text under an
   *  unchanged id. */
  let liveProfileText: Map<string, string>;
  try {
    live = (await client.query<LiveRow>(
      `SELECT id, name, scheme_end_date, scheme_end_date_basis, last_year, successor_scheme
         FROM funding_instruments ORDER BY id COLLATE "C"`)).rows;
    // Everything the advisor can SHOW, it must be able to FIND. An instrument
    // with no profile is not merely unranked: semanticFundMatch returns a map
    // without it, every reader defaults it to 0, and it is scored identically
    // to a fund that is thematically wrong.
    profileMissing = Number((await client.query(
      `SELECT COUNT(*) n FROM funding_instruments i
        WHERE NOT EXISTS (SELECT 1 FROM instrument_profiles p WHERE p.instrument_id = i.id)`
    )).rows[0].n);
    profileOrphan = Number((await client.query(
      `SELECT COUNT(*) n FROM instrument_profiles p
        WHERE NOT EXISTS (SELECT 1 FROM funding_instruments i WHERE i.id = p.instrument_id)`
    )).rows[0].n);
    profileIds = new Set((await client.query(
      "SELECT instrument_id FROM instrument_profiles WHERE embedding IS NOT NULL"
    )).rows.map((r: { instrument_id: string }) => r.instrument_id));
    profiles = profileIds.size;
    liveProfileText = new Map((await client.query(
      `SELECT instrument_id, profile_text FROM instrument_profiles
        WHERE profile_text IS NOT NULL AND btrim(profile_text) <> ''`
    )).rows.map((r: { instrument_id: string; profile_text: string }) =>
      [r.instrument_id, r.profile_text] as [string, string]));
    textProfileIds = new Set(liveProfileText.keys());
  } finally {
    await client.end();
  }

  const asOf = today();
  const problems: string[] = [];

  // WHICH FUNDS THE PRODUCT MAY OFFER, through the product's own function and
  // not a restatement of its filters here. A divergence on a fund nobody is
  // shown is worth a different sentence from one on a fund everybody is, and a
  // check that re-derived the pool would keep agreeing after the filter moved.
  const { hydrateDbInstruments, publishableInstruments } =
    await import("../lib/intelligence/corpus");
  await hydrateDbInstruments();
  const livePublishable = publishableInstruments().map((i) => i.id);

  // ── 0. EVERY FIELD THE SNAPSHOT CARRIES IS COMPARED, OR SAYS WHY NOT ─────
  // Runs before anything else, because it is the property that decides whether
  // the rest of this file is a comparison or a sample of one.
  const client2 = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client2.connect();
  let liveColumns: Set<string>;
  let liveRows: Record<string, unknown>[];
  let gateRows: { instrument_id: string; gate_key: string; gate_role: string | null;
    value_spec: unknown; intake_field_resolved: string | null }[];
  try {
    liveColumns = new Set((await client2.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'funding_instruments'`))
      .rows.map((r) => r.column_name));
    gateRows = (await client2.query(
      `SELECT instrument_id, gate_key, gate_role, value_spec, intake_field_resolved
         FROM eligibility_gates`)).rows;
    const snapshotFields = [...new Set(snapshot.records.flatMap((r) => Object.keys(r)))].sort();
    const compared = snapshotFields.filter((f) => liveColumns.has(columnFor(f)));
    const unclassified = snapshotFields.filter(
      (f) => !liveColumns.has(columnFor(f)) && !FIELD_NOTES[f]);
    if (unclassified.length) {
      problems.push(
        `${unclassified.length} snapshot field(s) are compared against NOTHING and carry no\n` +
        `      note saying why: ${unclassified.join(", ")}.\n` +
        `      Every field here is served to a real founder when Postgres is unreachable.\n` +
        `      A field whose name is a column of funding_instruments is compared\n` +
        `      automatically; anything else needs an entry in FIELD_NOTES with a reason\n` +
        `      and a review date. This guard compared 5 of 37 fields until 2026-08-13\n` +
        `      and read as though it compared the corpus.`);
    }
    // An exemption with an expired review date is an exemption nobody re-read.
    for (const [f, note] of Object.entries(FIELD_NOTES)) {
      if (!snapshotFields.includes(f)) {
        problems.push(`FIELD_NOTES excuses "${f}", which the snapshot no longer carries. ` +
          `An exemption for a field that is gone is an exemption nothing reads.`);
      } else if (compared.includes(f) && !COLUMN_ALIAS[f]) {
        // The same rule check_verdicts.ts applies to an acceptance whose guard
        // has gone green. A note sitting on a field that IS compared covers
        // nothing today, and pre-authorises the day the comparison is removed —
        // at which point the field goes quiet and the note makes it look
        // deliberate. An ALIAS is the one legitimate overlap, because it is a
        // note ABOUT the comparison rather than instead of it.
        problems.push(`FIELD_NOTES excuses "${f}" and it is compared anyway, so the note ` +
          `covers nothing. Delete it: left standing it makes a future removal of that ` +
          `comparison read as intentional.`);
      } else if (note.review < asOf) {
        problems.push(`the note excusing "${f}" from comparison came due on ${note.review}: ` +
          `${note.why}`);
      }
    }
    // And the alias must still BE an alias. If the column it names disappears,
    // `schemeEndBasis` silently stops being compared while its note goes on
    // saying it is — which is this guard's own defect, one field wide.
    for (const [f, col] of Object.entries(COLUMN_ALIAS)) {
      if (snapshotFields.includes(f) && !liveColumns.has(col)) {
        problems.push(`"${f}" is aliased to the column "${col}", which funding_instruments ` +
          `does not have. The field is therefore compared against nothing while ` +
          `FIELD_NOTES says it is compared through the alias.`);
      }
    }
    liveRows = compared.length
      ? (await client2.query(
        `SELECT ${compared.map((f) => `"${columnFor(f)}"`).join(", ")} FROM funding_instruments`)).rows
      : [];
    // ── The comparison itself, over every field that resolved to a column ──
    const byId = new Map(liveRows.map((r) => [String(r.id), r]));
    const divergent = new Map<string, { n: number; eg: string }>();
    /** Rows that differ ONLY by a default the reader applies — counted and
     *  printed rather than dropped, so the tolerance is visible in the log
     *  of a green run and not only in the source of the check. */
    const defaulted = new Map<string, number>();
    for (const s of snapshot.records as unknown as Record<string, unknown>[]) {
      const l = byId.get(String(s.id));
      if (!l) continue;
      for (const f of compared) {
        const a = normaliseValue(s[f]), b = normaliseValue(l[columnFor(f)]);
        if (a === b) continue;
        // The one permitted shape, and only this one: the column is NULL and
        // the snapshot carries the exact default the reader applies. Anything
        // else about the same field is still a disagreement about the world.
        //
        // Tested on the RAW cell, not on `b`. `normaliseValue` folds NULL and
        // the empty string to the same "", and the two are not the same thing
        // here: `?? "EU"` fires on NULL and NOT on "", so a column holding ""
        // would answer "" on Postgres and "EU" on the snapshot -- a genuine
        // divergence that the folded form would have waved through under this
        // very tolerance.
        if (l[columnFor(f)] == null && a === READ_DEFAULT[f]?.value) {
          defaulted.set(f, (defaulted.get(f) ?? 0) + 1);
          continue;
        }
        const seen = divergent.get(f) ?? { n: 0, eg: "" };
        seen.n++;
        if (!seen.eg) {
          seen.eg = `${s.id}: snapshot ${JSON.stringify(a.slice(0, 60))} ` +
            `vs postgres ${JSON.stringify(b.slice(0, 60))}`;
        }
        divergent.set(f, seen);
      }
    }
    if (divergent.size) {
      problems.push(
        `${divergent.size} field(s) hold a DIFFERENT VALUE in the two corpora, over\n` +
        `      ${compared.length} compared fields and ${snapshot.records.length} instruments.\n` +
        `      A founder served off the snapshot is answered from these values.\n` +
        [...divergent].sort((a, b) => b[1].n - a[1].n).slice(0, SHOW)
          .map(([f, d]) => `      ${f}: ${d.n} row(s)  e.g. ${d.eg}`).join("\n"));
    }
    // A READ_DEFAULT that stops firing is a note nothing reads: either the
    // column got filled in, or the exporter stopped defaulting. Both are real
    // changes, and both would otherwise leave a permanent tolerance standing
    // over a comparison that no longer needs it.
    for (const [f, d] of Object.entries(READ_DEFAULT)) {
      if (!compared.includes(f)) {
        problems.push(`READ_DEFAULT covers "${f}", which is not a compared field. ` +
          `A tolerance on a field nothing compares covers nothing.`);
      } else if (!defaulted.get(f)) {
        problems.push(`READ_DEFAULT permits "${f}" to differ by the reader's default ` +
          `"${d.value}", and NO row differs that way any more. Delete it: left ` +
          `standing it pre-authorises the next real divergence on this field.`);
      } else if (d.review < asOf) {
        problems.push(`the READ_DEFAULT on "${f}" came due on ${d.review}: ${d.why}`);
      }
    }
    console.log(`  fields: ${compared.length} compared against funding_instruments, ` +
      `${Object.keys(FIELD_NOTES).length} noted, ${unclassified.length} unclassified` +
      ([...defaulted].map(([f, n]) => `, ${n} ${f} row(s) equal through the reader's ` +
        `default "${READ_DEFAULT[f].value}"`).join("")));
  } finally {
    await client2.end();
  }

  // ── 4. THE TWO CORPORA MUST AGREE ABOUT WHAT EACH FUND DEMANDS ───────────
  // Liveness decides whether a fund is offered AT ALL. The gates decide whether
  // THIS founder may have it, and `accessiblePool` — the largest single filter
  // in the funnel — is built from them. A snapshot that agrees about every
  // closure and disagrees about the rules still answers a different brief.
  //
  // Compared on the three fields that DECIDE (`gate_role`, `value_spec`,
  // `intake_field_resolved`), not on the id set. The id set is the weaker
  // question section 3 was already corrected for on 2026-08-12: `value_spec` is
  // written in place, so a rule can change what it demands without its key
  // moving, and 36 gates on offerable funds do exactly that today.
  {
    const gateKey = (i: string, k: string) => `${i} ${k}`;
    const liveGates = new Map<string, string>();
    for (const g of gateRows) {
      liveGates.set(gateKey(g.instrument_id, g.gate_key),
        normaliseValue([g.gate_role, g.value_spec, g.intake_field_resolved]));
    }
    const snapGates = new Map<string, string>();
    for (const r of snapshot.records as unknown as
      { id: string; gates?: { id: string; gateRole?: unknown; valueSpec?: unknown;
        intakeFieldResolved?: unknown }[] }[]) {
      for (const g of r.gates ?? []) {
        snapGates.set(gateKey(r.id, g.id),
          normaliseValue([g.gateRole ?? null, g.valueSpec ?? null, g.intakeFieldResolved ?? null]));
      }
    }
    const offerable = new Set(livePublishable);
    const onOfferable = (k: string) => offerable.has(k.slice(0, k.indexOf(" ")));
    const missing = [...liveGates.keys()].filter((k) => !snapGates.has(k));
    const extra = [...snapGates.keys()].filter((k) => !liveGates.has(k));
    const changed = [...liveGates.keys()]
      .filter((k) => snapGates.has(k) && snapGates.get(k) !== liveGates.get(k));
    console.log(`  gates: ${snapGates.size} in the snapshot, ${liveGates.size} in Postgres`);
    if (missing.length || extra.length || changed.length) {
      const show = (k: string) => k.replace(" ", " / ");
      problems.push(
        `the two corpora state DIFFERENT ELIGIBILITY RULES.\n` +
        `      ${missing.length} live rule(s) the snapshot has never seen ` +
        `(${missing.filter(onOfferable).length} on offerable funds)\n` +
        `      ${extra.length} snapshot rule(s) no longer in Postgres ` +
        `(${extra.filter(onOfferable).length} on offerable funds)\n` +
        `      ${changed.length} rule(s) present in both that DEMAND SOMETHING DIFFERENT ` +
        `(${changed.filter(onOfferable).length} on offerable funds)\n` +
        `      accessiblePool is built from these, so a degraded request does not merely\n` +
        `      rank differently — it admits and refuses different funds.\n` +
        [...missing.slice(0, 3), ...changed.slice(0, 3)].map((k) => `      e.g. ${show(k)}`).join("\n"));
    }
  }

  // ── 1. The two corpora must agree about liveness ─────────────────────────
  const disagree: string[] = [];
  let missingFromSnapshot = 0, extraInSnapshot = 0;
  for (const r of live) {
    const s = snapById.get(r.id);
    if (!s) { missingFromSnapshot++; continue; }
    const pgClosed = isClosed({
      schemeEndDate: r.scheme_end_date, schemeEndBasis: r.scheme_end_date_basis,
      lastYear: r.last_year, successorScheme: r.successor_scheme,
    }, asOf);
    const snapClosed = isClosed(s, asOf);
    if (pgClosed !== snapClosed) {
      disagree.push(
        `${r.id}\n        postgres ${pgClosed ? "CLOSED" : "open  "}  ` +
        `end=${r.scheme_end_date ?? "-"} basis=${r.scheme_end_date_basis ?? "-"} lastYear=${r.last_year ?? "-"}\n` +
        `        snapshot ${snapClosed ? "CLOSED" : "open  "}  ` +
        `end=${s.schemeEndDate ?? "-"} basis=${s.schemeEndBasis ?? "-"} lastYear=${s.lastYear ?? "-"}`);
    }
  }
  for (const s of snapshot.records) if (!live.some((r) => r.id === s.id)) extraInSnapshot++;

  if (disagree.length) {
    problems.push(
      `${disagree.length} of ${live.length} instruments are OPEN in one corpus and CLOSED in the other.\n` +
      `      The fallback in hydrateDbInstruments() is therefore not a degraded\n` +
      `      version of production — it is a different answer to "which funds exist".\n` +
      disagree.slice(0, SHOW).map((d) => `      ${d}`).join("\n") +
      (disagree.length > SHOW ? `\n      ... and ${disagree.length - SHOW} more` : ""));
  }
  if (missingFromSnapshot || extraInSnapshot) {
    problems.push(
      `the snapshot holds ${snapshot.records.length} instruments and Postgres holds ${live.length}: ` +
      `${missingFromSnapshot} live instrument(s) absent from the snapshot, ` +
      `${extraInSnapshot} snapshot instrument(s) no longer in the corpus.`);
  }

  // ── 2. Everything showable must be retrievable ───────────────────────────
  if (profileMissing) {
    problems.push(
      `${profileMissing} instrument(s) have no row in instrument_profiles.\n` +
      `      semanticFundMatch scores them 0, which the ranker cannot tell apart\n` +
      `      from "thematically wrong" — so they are invisible, not merely last.\n` +
      `      This also fires while a --rebuild is mid-flight, which is correct:\n` +
      `      a number taken across a half-loaded index is not reproducible.`);
  }
  if (profileOrphan) {
    problems.push(
      `${profileOrphan} profile(s) point at an instrument that is gone. The index ` +
      `is ranking funds the corpus no longer contains.`);
  }

  // ── 3. EVERY offline mirror of the index must answer for the same corpus ──
  // Compared on the CONTENT, not on a count and not on a mtime. A count matches
  // by coincidence the moment one fund is added and another withdrawn, and a
  // timestamp says when the file was written rather than what is in it.
  //
  // It was compared on the ID SET until 2026-08-12, and that is a weaker
  // question than the one this section claims to ask. `build_instrument_profiles`
  // rewrites `profile_text` IN PLACE: the ids do not move, the row count does
  // not move, and the vectors every ranking is drawn from are new. On 2026-08-12
  // the live index held 1,088 ids, the committed mirrors held the same 1,088,
  // this check printed "ok — 1088 instruments, 1088 embedded profiles", and 513
  // of those profiles had been rewritten under it. `check_hydration_parity` went
  // red three archetypes deep with no way to name the cause.
  //
  // So the property is restated to the one the section header always claimed:
  //
  //     a committed mirror of the retrieval index must REPRODUCE the index the
  //     live table holds -- not merely list the same funds
  //
  // The leak index is the mirror that can be held to it exactly, because it
  // carries the profile strings themselves. The semantic cache carries only
  // scores, which cannot be recomputed without the Voyage key, so it is re-cut
  // WITH the leak index rather than tested separately: both are cut from
  // `instrument_profiles`, and a rebuild that moves one has moved the other.
  //
  // Two artifacts are cut from `instrument_profiles` and committed, and BOTH
  // were found 70 instruments behind on 2026-08-07:
  //
  //   semanticCache.generated.json    the SCORES. Every NO_PG check ranks on it.
  //   profileLeakIndex.generated.json the TEXT. `check_recall_leaks` tests the
  //                                   recall set against it, so a stale copy
  //                                   cannot see a description that leaks into
  //                                   one of the profiles it does not hold --
  //                                   and a leak inflates every recall figure
  //                                   taken from the set, silently.
  //
  // The second is the more dangerous of the two: it is a guard, and a guard
  // checking 1,014 of 1,084 profiles reports green over the other 70.
  const leakFile = path.join(process.cwd(), "lib", "intelligence", "profileLeakIndex.generated.json");
  let leakIds: Set<string> | null = null;
  let leakText: Record<string, string> = {};
  let leakBuiltAt = "";
  try {
    const idx = JSON.parse(readFileSync(leakFile, "utf8")) as
      { profile: Record<string, string>; builtAt?: string };
    leakText = idx.profile ?? {};
    leakIds = new Set(Object.keys(leakText));
    leakBuiltAt = idx.builtAt ?? "(unstamped)";
  } catch {
    problems.push(`lib/intelligence/profileLeakIndex.generated.json is missing or ` +
      `unreadable, so check_recall_leaks cannot test the recall set at all.`);
  }
  if (leakIds) {
    // Only profiles with TEXT can be in it: the emitter drops any whose text
    // squashes to nothing, so the live side of this comparison is the textual
    // profiles, not every row of the table.
    const missing = [...textProfileIds].filter((id) => !leakIds.has(id));
    const extra = [...leakIds].filter((id) => !textProfileIds.has(id));
    if (missing.length || extra.length) {
      problems.push(
        `the committed profile LEAK index holds ${leakIds.size} instruments against ` +
        `${textProfileIds.size} live\n` +
        `      (built ${leakBuiltAt}): ${missing.length} live profile(s) it has never seen, ` +
        `${extra.length} gone.\n` +
        `      check_recall_leaks therefore reports green over profiles it does not\n` +
        `      hold. A description that leaks into one of them grades retrieval on a\n` +
        `      query copied out of the answer, and inflates every recall figure taken\n` +
        `      from the set — which is the exact defect that artifact exists to catch.\n` +
        `      Rebuild: DATABASE_URL=... python3 ETL/terms/emit_profile_leak_index.py` +
        (missing.length ? `\n      e.g. missing ${missing.slice(0, 3).join(", ")}` : ""));
    }
    // ── The same mirror, on its CONTENT ──────────────────────────────────
    // The artifact stores the squashed form, so the live side is squashed by
    // `squash` from lib/intelligence/recallLeaks.ts -- the one implementation
    // `check_recall_leaks` already reads this file through, and the one the
    // artifact's own `squashProbes` are the contract for. Re-squashing here
    // with a private regex would be a second normaliser, which is the exact
    // duplication that let the original leak live.
    const rewritten = [...leakIds].filter((id) => {
      const live = liveProfileText.get(id);
      return live !== undefined && squash(live) !== leakText[id];
    });
    if (rewritten.length) {
      problems.push(
        `${rewritten.length} of the ${leakIds.size} profile(s) in the committed mirrors were ` +
        `REWRITTEN\n      in the live index after those mirrors were cut ` +
        `(leak index built ${leakBuiltAt}).\n` +
        `      The ids are unchanged, so every id-set comparison above passes; what the\n` +
        `      index RANKS ON is not what the committed copies hold. Two consequences,\n` +
        `      and the second is the one that is invisible:\n` +
        `        - check_recall_leaks tests the recall set against text that has moved,\n` +
        `          so a description that now leaks into a rewritten profile is not seen.\n` +
        `        - semanticCache.generated.json is cut from these same rows, and every\n` +
        `          NO_PG check ranks on it. Its scores are percentile ranks over the\n` +
        `          whole corpus, so a rewrite anywhere moves the score of every fund --\n` +
        `          including the ones whose own text did not change.\n` +
        `      Re-cut BOTH mirrors of the index, in this order:\n` +
        `        DATABASE_URL=... python3 ETL/terms/emit_profile_leak_index.py\n` +
        `        cd website/frontend && npx tsx scripts/emit_semantic_cache.ts\n` +
        `      e.g. ${rewritten.slice(0, 3).join(", ")}`);
    }
  }

  // ── 3b. The four RANKING artifacts must answer for the live corpus ───────
  //
  // `semanticCache` and `profileLeakIndex` above are mirrors of the retrieval
  // index. These four are different and, until 2026-08-08, unwatched: they are
  // read by `shortlist.ts` and `regionPrior.ts` AT REQUEST TIME, on the path a
  // real founder goes down, and NOTHING compared them to anything. Their
  // producers were on no path either — five commands somebody had to remember.
  //
  // Measured the day the check was written: `peerPrior` named 16 instruments
  // the corpus no longer contained. Those 16 cost no rank directly (an id with
  // no row simply never matches), and that is exactly why this is worth
  // checking rather than trusting: the artifact was provably built against a
  // different corpus, and the direction that DOES cost — funds published since,
  // which the peer signal cannot see at all — leaves no trace to find. An id
  // that is gone is the only observable end of a drift that is symmetric.
  //
  // Tested on the ID SET for the same reason section 3 gives: a count matches
  // by coincidence the first time one fund is added and another withdrawn, and
  // an mtime says when a file was written rather than what is in it.
  const liveIds = new Set(live.map((r) => r.id as string));
  const readArtifact = (name: string): unknown | null => {
    try {
      return JSON.parse(readFileSync(
        path.join(process.cwd(), "lib", "intelligence", name), "utf8"));
    } catch (e) {
      problems.push(
        `lib/intelligence/${name} is missing or unreadable ` +
        `(${e instanceof Error ? e.message : String(e)}).\n` +
        `      shortlist.ts falls back to the neutral value for it, which is not a\n` +
        `      degraded ranking but a different one — see lib/intelligence/generatedArtifact.ts.`);
      return null;
    }
  };
  // (artifact, where the instrument ids live, what the ranker loses when stale)
  const RANKING: [string, "keys" | "values", string][] = [
    ["peerPrior.generated.json", "values",
     "peer precedence, the signal that took exact-scheme recall from 24% to 43%"],
    ["regionPrior.generated.json", "keys",
     "the regional footprint that routes a founder to funds that pay in their region"],
    ["__objectives.json", "keys",
     "the registered-purpose re-rank"],
  ];
  for (const [name, where, loses] of RANKING) {
    const doc = readArtifact(name) as Record<string, unknown> | null;
    if (!doc) continue;
    const ids = where === "keys"
      ? new Set(Object.keys(doc))
      : new Set(Object.values(doc).flat() as string[]);
    // The emptiness floor, for the reason workstream BF's audit records: on
    // 2026-08-08 two guards reported full headroom over 0 instruments because a
    // bare catch had turned "not where I looked" into "nothing there". An
    // artifact that names no instrument at all passes every set comparison
    // below trivially, which is the most reassuring result this can print and
    // the least true.
    if (!ids.size) {
      problems.push(
        `lib/intelligence/${name} names NO instrument. Every comparison below\n` +
        `      passes trivially on it, and the ranker loses ${loses}.\n` +
        `      Rebuild: python3 ETL/refresh.py  (or the emitter named in its header)`);
      continue;
    }
    const gone = [...ids].filter((id) => !liveIds.has(id));
    if (gone.length) {
      problems.push(
        `lib/intelligence/${name} names ${gone.length} instrument(s) of ${ids.size} that\n` +
        `      the corpus no longer contains, so it was built against a corpus that has\n` +
        `      since moved. The observable half is harmless; the unobservable half is\n` +
        `      every fund published since, which this artifact cannot see — and that is\n` +
        `      ${loses}.\n` +
        `      Rebuild: python3 ETL/refresh.py\n` +
        `      e.g. ${gone.slice(0, 3).join(", ")}`);
    }
  }
  // channelPrior carries no instrument ids — its keys are country|sector cells
  // and its values are channel codes, and `channel` is derived in db.sqlite and
  // does not exist as a column in Postgres, so there is nothing here to compare
  // it against. It gets the emptiness floor and nothing more, which is an
  // honest half-check rather than a re-implementation of the emitter's rules.
  const cp = readArtifact("channelPrior.generated.json") as
    { global?: object; byCountry?: object; byCountrySector?: object } | null;
  if (cp && !Object.keys(cp.byCountrySector ?? {}).length) {
    problems.push(
      `lib/intelligence/channelPrior.generated.json holds NO (country, sector) cell.\n` +
      `      shortlist.ts backs off to the global shape for every founder, which is the\n` +
      `      EU-over-national composition bias the prior exists to correct.`);
  }

  const cacheFile = path.join(process.cwd(), "lib", "intelligence", "semanticCache.generated.json");
  let cache: Record<string, { scores?: Record<string, number> } | Record<string, number>> | null = null;
  try {
    cache = JSON.parse(readFileSync(cacheFile, "utf8"));
  } catch {
    problems.push(`lib/intelligence/semanticCache.generated.json is missing or unreadable. ` +
      `Every NO_PG check would silently rank on the lexical fallback.`);
  }
  let cacheDescriptions = 0;
  if (cache) {
    const entries = Object.entries(cache);
    cacheDescriptions = entries.length;
    const stale: string[] = [];
    for (const [desc, v] of entries) {
      const scores = (v && typeof v === "object" && "scores" in v
        ? (v as { scores: Record<string, number> }).scores
        : v) as Record<string, number>;
      const ids = new Set(Object.keys(scores ?? {}));
      const missing = [...profileIds].filter((id) => !ids.has(id)).length;
      const extra = [...ids].filter((id) => !profileIds.has(id)).length;
      if (missing || extra) {
        stale.push(`${desc.slice(0, 48)}...  scored ${ids.size}, ` +
                   `${missing} live profile(s) missing, ${extra} no longer in the index`);
      }
    }
    if (!entries.length) {
      problems.push(`the committed semantic cache is EMPTY. An emitter run whose ` +
        `Voyage key or Postgres connection had failed would produce exactly this ` +
        `and report success; re-run scripts/emit_semantic_cache.ts with credentials.`);
    } else if (stale.length) {
      problems.push(
        `${stale.length} of ${entries.length} description(s) in the committed semantic\n` +
        `      cache do not score the ${profileIds.size} instruments the live index holds.\n` +
        `      Every NO_PG check — the unit tests, the archetypes, the red team — ranks\n` +
        `      on this file, so they are grading a corpus that no longer exists. Funds\n` +
        `      absent from it score 0, which the ranker cannot tell from "wrong".\n` +
        stale.slice(0, SHOW).map((s) => `      ${s}`).join("\n") +
        (stale.length > SHOW ? `\n      ... and ${stale.length - SHOW} more` : ""));
    }
  }

  console.log(`  snapshot generated ${snapshot.generatedAt ?? "(unstamped)"}, ` +
              `${snapshot.records.length} records`);
  console.log(`  postgres ${live.length} instruments, ${profiles} embedded profiles, as of ${asOf}`);
  console.log(`  semantic cache ${cacheDescriptions} descriptions, ` +
              `leak index ${leakIds?.size ?? 0} profiles (built ${leakBuiltAt || "-"})`);

  if (problems.length) {
    console.error("\ncheck_corpus_currency: FAILED\n");
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error("  Every figure this repo publishes depends on which of these two");
    console.error("  corpora the run happened to load, and the run is not told. Until");
    console.error("  they agree, a pool/recall number is a property of the connection.");
    console.error("\n  Fix: regenerate and republish the snapshot —");
    console.error("    make eligibility");
    console.error("  which re-exports public/data/instrument_terms.json from the same");
    console.error("  store Postgres is published from, and rebuilds the profile index:");
    console.error("    python3 ETL/terms/build_instrument_profiles.py run");
    console.error("  and re-cut the offline mirror of that index, which is committed:");
    console.error("    npx tsx scripts/emit_semantic_cache.ts");
    await publishVerdict(GUARD, {
      status: "failed",
      summary: `${problems.length} disagreement(s) between the committed snapshot ` +
               `and Postgres (${live.length} instruments, ${profiles} profiles)`,
      metrics: { problems: problems.length, snapshotRecords: snapshot.records.length,
                 liveInstruments: live.length, profiles, profileMissing, profileOrphan },
      detail: tape(),
    });
    process.exit(1);
  }
  console.log("check_corpus_currency: ok — the snapshot and Postgres agree on every " +
              "liveness verdict, every instrument is retrievable, and both committed " +
              "mirrors of the index (scores, profile text) cover exactly the live one.");
  await publishVerdict(GUARD, {
    status: "ok",
    summary: `snapshot and Postgres agree on every liveness verdict; ` +
             `${live.length} instruments, ${profiles} embedded profiles`,
    metrics: { problems: 0, snapshotRecords: snapshot.records.length,
               liveInstruments: live.length, profiles, profileMissing, profileOrphan },
    detail: tape(),
  });
}

main().catch(async (err) => {
  console.error("check_corpus_currency: FAILED to run —", err);
  // 'error', not 'failed': the guard fell over, which is a different claim from
  // the corpora disagreeing, and publishing it as the latter would send whoever
  // reads it to look at the wrong thing.
  await publishVerdict(GUARD, {
    status: "error", summary: `the guard could not complete: ${err}`, detail: tape(),
  });
  process.exit(1);
});
