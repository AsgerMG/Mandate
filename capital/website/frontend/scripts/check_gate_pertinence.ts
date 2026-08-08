/**
 * Does every gate that can DECIDE state a condition an applicant could satisfy?
 *
 * FREE — no model calls. The judgement was paid for once by
 * `ETL/terms/classify_eligibility_pertinence.py` and cached against a digest of
 * the text; this reads the cache and holds the corpus to it.
 *
 * ── Why this exists, and why it is not check_extracted_quotes ─────────────
 * On 2026-08-06 eleven IPCEI leaves shipped with eligibility text lifted from
 * Commission state-aid decisions. One string read "the funding is not available
 * to all undertakings in a comparable situation". Every word of it is in the
 * source. It is correctly attributed. `check_extracted_quotes.ts` would pass it
 * today, because that check asks whether a quotation is FAITHFUL.
 *
 *     Verbatim-ness was checked and pertinence was not. That gap is the lesson,
 *     not the eleven rows.
 *
 * The 2026-08-07 retraction pulled the sentence out of `eligibility_text` and
 * stopped there. Two of the same quotations remained in `eligibility_gates`
 * with `gate_role='filter'` — and a filter is strictly worse than prose,
 * because `verdict.ts::isFilter()` lets it decide. A founder was not going to
 * be shown a bad sentence; they were going to be silently removed from a fund
 * for not already having been chosen as one of its beneficiaries.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *     A gate that can decide a verdict must state something an applicant could
 *     act on — a condition they could satisfy, or an offer they could want —
 *     and not a finding about someone else's completed grant, a fact about the
 *     scheme's administration, or a duty that binds only after an award.
 *
 * The middle clause is not softness; it was bought with evidence. The first
 * version of the property was binary, condition or report, and run over the
 * whole corpus it judged 40 deciding gates `report`. It was right about the
 * sentences — "The maximum loan amount is EUR 250,000" really is a statement
 * about the instrument — but only about five of them were this defect. Roughly
 * twenty stated the SIZE or the CHANNEL of the offer, encoded onto `ticketBand`
 * and `borrowerModel`, which are questions intake asks the founder. Those gates
 * compare the offer against what the founder said they wanted, and demoting
 * them would have cost real matching precision to fix a defect they are not an
 * instance of.
 *
 * So `demand_match` is a carve-out from `report` and never from `condition`,
 * and it is not a hole for "any fact about the money": a total programme
 * budget, a disbursement calendar and a legal basis stay reports, because
 * nobody is asked what budget they would prefer a scheme to have. The
 * calibration file pins both edges — including a selectivity finding that names
 * Member States, which intake DOES ask about, and which must still come back
 * `report`. Mentioning a thing the founder is asked about is not offering them
 * something.
 *
 * It is a property, not a register: nothing here matches a phrase. The
 * judgement is a model call over the whole string in whatever language it is
 * written, because every lexical rule anyone proposed was an enumeration of the
 * instances in one incident — it would have missed the next occurrence in
 * German and fired on any decision text that quotes a real condition.
 *
 * ── What makes a model call a TEST ────────────────────────────────────────
 * Three things, and all three are load-bearing:
 *
 *   1. VERDICTS ARE CACHED BY TEXT. A gate whose current requirement has no
 *      cached verdict FAILS. A new gate, or an edited one, cannot ship until it
 *      has been judged — the absence of a judgement is a failure, never a pass.
 *   2. THE CLASSIFIER ITSELF IS TESTED. `pertinence_calibration.json` holds
 *      known answers, judged on every run through the same path as the corpus,
 *      including a control drawn from the same kind of document, in the same
 *      register, that states a real condition. A prompt edit that turns the
 *      classifier into a selectivity detector fails here rather than quietly
 *      demoting real rules.
 *   3. BOTH CORPORA ARE READ. The committed snapshot always, and Postgres
 *      whenever DATABASE_URL is present. Checking one would let a filter gate
 *      that exists only in the other decide a founder's verdict unseen; this
 *      repo has been bitten by exactly that (see check_corpus_currency.ts).
 *
 * ── Why it checks the PROSE too, and why only against Postgres ────────────
 * The 2026-08-06 incident happened in `funding_instruments.eligibility_text`,
 * not in a gate. The retraction fixed the eleven IPCEI rows and the gate test
 * above fixed the gates, and between them they left the column the incident
 * actually occurred in unguarded — the same mistake one level up: gates were
 * checked, prose was not. Eleven OTHER live rows were sitting in it, found only
 * by running the classifier over the whole corpus rather than over IPCEI:
 * two whose entire "who may apply" is an institution's name, two narrating a
 * cohort of start-ups already selected, and one enumerating eight named Latvian
 * competence centres.
 *
 * Prose is checked against Postgres ONLY, and that is forced rather than
 * chosen: `instrument_terms.json` does not carry `eligibility_text` and must
 * not — it is a client-facing payload under a budget (check_payload_budget),
 * and 1,088 eligibility texts do not belong in the browser. The product reads
 * that column live. So there is no offline copy to hold to anything, and under
 * `NO_PG=1` this axis makes no claim rather than a green one.
 *
 * ── What it deliberately does NOT cover ───────────────────────────────────
 * The truth, the currency, or the ownership of the sentence. A faithful
 * quotation of the right KIND of thing, attached to the wrong instrument, still
 * passes here. That is check_corpus_currency's and the extractor's problem.
 *
 * Run: npx tsx scripts/check_gate_pertinence.ts
 */
import { existsSync, readFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import { loadEnvLocal } from "./loadEnv";

const REPO = path.resolve(process.cwd(), "../..");
const CACHE = path.join(REPO, "data", "eligibility_pertinence.json");
const CALIBRATION = path.join(REPO, "data", "reference", "pertinence_calibration.json");
const SNAPSHOT = path.join(process.cwd(), "public", "data", "instrument_terms.json");

type Verdict = { verdict: string; reason: string; sample?: string; v?: number };
type Gate = { requirement?: string; gateRole?: string; valueSpec?: unknown };

/** Byte-identical to `digest()` in classify_eligibility_pertinence.py. The two
 *  must agree or every gate reads as unjudged; the calibration cases exercise
 *  this end to end, because they are keyed the same way. */
function digest(text: string): string {
  return createHash("sha256")
    .update(text.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

/** A gate can reach a verdict when `isFilter()` would admit it. NULL counts:
 *  verdict.ts honours an untriaged gate as a filter so the system degrades
 *  safely while encoding coverage grows, which means NULL is not neutral. */
const decides = (role: string | null | undefined) => !role || role === "filter";

function fromSnapshot(): { ref: string; text: string; spec: boolean }[] {
  const parsed = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as {
    records: { id: string; gates?: Gate[] }[];
  };
  const out: { ref: string; text: string; spec: boolean }[] = [];
  for (const rec of parsed.records ?? []) {
    for (const g of rec.gates ?? []) {
      if (!decides(g.gateRole) || !g.requirement) continue;
      out.push({ ref: `${rec.id}/${(g as { id?: string }).id ?? "?"}`,
                 text: g.requirement, spec: Boolean(g.valueSpec) });
    }
  }
  return out;
}

/** The live corpus, or null when there is none to read. `NO_PG=1` is this
 *  repo's "there is no database" and every other script that talks to Postgres
 *  honours it (check_vocabularies deletes the variable the same way); this one
 *  did not, so `NO_PG=1 npm run check` was the only command in the suite that
 *  still opened a connection. */
function databaseUrl(): string | null {
  loadEnvLocal();
  if (process.env.NO_PG) return null;
  return process.env.DATABASE_URL ?? null;
}

/** Gates and prose in one connection. Two round trips to the same database to
 *  ask one question about two columns would be two chances to check one and
 *  forget the other — which is precisely the history this file documents. */
async function fromPostgres(): Promise<
  { gates: { ref: string; text: string; spec: boolean }[];
    prose: { ref: string; text: string }[] } | null
> {
  const url = databaseUrl();
  if (!url) return null;
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 4000 });
  await client.connect();
  try {
    const g = await client.query(
      `SELECT instrument_id, gate_key, requirement, value_spec
         FROM eligibility_gates
        WHERE (gate_role IS NULL OR gate_role = 'filter')
          AND coalesce(requirement, '') <> ''`);
    // Same threshold the classifier judges on, so the two populations cannot
    // disagree about which strings are long enough to make a claim.
    const p = await client.query(
      `SELECT id, eligibility_text
         FROM funding_instruments
        WHERE length(coalesce(eligibility_text, '')) > 40`);
    return {
      gates: g.rows.map((r) => ({
        ref: `${r.instrument_id}/${r.gate_key}`,
        text: r.requirement as string,
        spec: Boolean(r.value_spec),
      })),
      prose: p.rows.map((r) => ({ ref: r.id as string, text: r.eligibility_text as string })),
    };
  } finally {
    await client.end();
  }
}

async function main() {
  const problems: { axis: string; detail: string }[] = [];

  if (!existsSync(CACHE)) {
    console.log(
      `check_gate_pertinence: FAIL — ${CACHE} is missing, so no gate has been ` +
      `judged and nothing bounds what a filter gate may assert. Run: ` +
      `python3 ETL/terms/classify_eligibility_pertinence.py --classify`);
    process.exitCode = 1;
    return;
  }
  const cacheFile = JSON.parse(readFileSync(CACHE, "utf8")) as {
    verdicts?: Record<string, Verdict>; _property_version?: number;
  };
  const cache = (cacheFile.verdicts ?? {}) as Record<string, Verdict>;
  // The property the verdicts below were answers to. A verdict carries the
  // version it was judged or last reconciled under; the classifier decides
  // which old answers must be re-paid for and which may simply be re-stamped,
  // and that policy lives only there. Here it is a plain equality, so this file
  // holds no copy of a rule that could drift from it.
  const PROPERTY_VERSION = cacheFile._property_version ?? 1;

  // ── 1. The classifier still separates a condition from a report ─────────
  // First, because everything below is only as good as this.
  const cases = JSON.parse(readFileSync(CALIBRATION, "utf8")).cases as
    { id: string; expect: string; text: string; why: string }[];
  const miscalibrated = cases
    .map((c) => ({ c, got: cache[digest(c.text)] }))
    .filter(({ c, got }) => !got || got.verdict !== c.expect);
  if (miscalibrated.length) {
    problems.push({
      axis: "classifier miscalibrated",
      detail:
        `${miscalibrated.length} of ${cases.length} known-answer cases are wrong ` +
        `or unjudged. The verdicts below this line cannot be trusted:\n` +
        miscalibrated.map(({ c, got }) =>
          `      ${c.id.padEnd(32)} expected ${c.expect}, got ${got?.verdict ?? "NO VERDICT"}` +
          (got ? `\n        model said: ${got.reason}` : "") +
          `\n        why this case exists: ${c.why}`).join("\n") +
        `\n    Re-run the classifier. If a case is genuinely wrong, argue with ` +
        `the case in data/reference/pertinence_calibration.json — do not delete ` +
        `it to make the build green.`,
    });
  }

  // ── 2. Every gate that can decide is judged, and judged `condition` ─────
  const snapshot = fromSnapshot();
  const live = await fromPostgres();
  const sources = live ? "committed snapshot + Postgres" : "committed snapshot only";
  const seen = new Map<string, { text: string; spec: boolean; refs: string[] }>();
  for (const g of [...snapshot, ...(live?.gates ?? [])]) {
    const d = digest(g.text);
    const e = seen.get(d) ?? { text: g.text, spec: false, refs: [] };
    e.spec = e.spec || g.spec;
    if (!e.refs.includes(g.ref)) e.refs.push(g.ref);
    seen.set(d, e);
  }

  const unjudged: { d: string; e: { text: string; refs: string[] } }[] = [];
  const stale: { e: { text: string; refs: string[] }; v: Verdict }[] = [];
  const reports: { e: { text: string; spec: boolean; refs: string[] }; v: Verdict }[] = [];
  for (const [d, e] of seen) {
    const v = cache[d];
    if (!v) { unjudged.push({ d, e }); continue; }
    if ((v.v ?? 1) !== PROPERTY_VERSION) stale.push({ e, v });
    if (v.verdict === "report") reports.push({ e, v });
  }

  const brief = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 110);

  if (unjudged.length) {
    problems.push({
      axis: "unjudged filter gate",
      detail:
        `${unjudged.length} distinct requirement text(s) on gates that can decide ` +
        `a verdict have no pertinence verdict, across ` +
        `${unjudged.reduce((n, u) => n + u.e.refs.length, 0)} gate(s). Unjudged is ` +
        `a FAILURE, not a pass — an unjudged gate is exactly the state the IPCEI ` +
        `gates were in:\n` +
        unjudged.slice(0, 8).map((u) =>
          `      ${u.e.refs[0]}\n        ${brief(u.e.text)}`).join("\n") +
        (unjudged.length > 8 ? `\n      … and ${unjudged.length - 8} more` : "") +
        `\n    Run: python3 ETL/terms/classify_eligibility_pertinence.py --classify`,
    });
  }

  if (stale.length) {
    problems.push({
      axis: "verdict answers a superseded property",
      detail:
        `${stale.length} distinct requirement text(s) carry a verdict judged ` +
        `under an older version of the property than the ${PROPERTY_VERSION} this ` +
        `corpus is held to, across ` +
        `${stale.reduce((n, s) => n + s.e.refs.length, 0)} gate(s). The cache is ` +
        `keyed by the TEXT, so a reworded question keeps answering with verdicts ` +
        `nobody asked for — green, and meaningless:\n` +
        stale.slice(0, 8).map((s) =>
          `      ${s.e.refs[0]}  (v${s.v.v ?? 1}, said "${s.v.verdict}")\n` +
          `        ${brief(s.e.text)}`).join("\n") +
        (stale.length > 8 ? `\n      … and ${stale.length - 8} more` : "") +
        `\n    Run: python3 ETL/terms/classify_eligibility_pertinence.py --classify ` +
        `— it re-pays for the answers the change could move and re-stamps the rest.`,
    });
  }

  if (reports.length) {
    const evaluable = reports.filter((r) => r.e.spec);
    problems.push({
      axis: "gate states something an applicant cannot act on",
      detail:
        `${reports.length} distinct text(s) judged REPORT are still encoded as ` +
        `filters, across ${reports.reduce((n, r) => n + r.e.refs.length, 0)} gate(s)` +
        (evaluable.length
          ? `, ${evaluable.length} of them carrying a value_spec — those can ` +
            `disqualify a founder silently, right now`
          : ``) + `:\n` +
        reports.slice(0, 10).map((r) =>
          `      ${r.e.refs[0]}${r.e.spec ? "  <- HAS value_spec" : ""}` +
          `${r.e.refs.length > 1 ? `  (+${r.e.refs.length - 1} more gate(s))` : ""}` +
          `\n        ${brief(r.e.text)}\n        model: ${r.v.reason}`).join("\n") +
        (reports.length > 10 ? `\n      … and ${reports.length - 10} more` : "") +
        `\n    A report is real evidence about the scheme and is worth keeping — ` +
        `it just may not DECIDE. Move it to gate_role='programme_fact' via ` +
        `data/reference/gate_role_overrides.json (encode_gates.py rewrites ` +
        `gate_role from a paid triage pass, so a bare UPDATE is reverted), then ` +
        `python3 ETL/terms/apply_gate_role_overrides.py.`,
    });
  }

  // ── 3. The column the incident actually happened in ─────────────────────
  // Prose cannot disqualify anyone by itself, so this is a weaker harm than a
  // filter gate — and it is the ORIGINAL one. A founder reading "the 16
  // start-ups joining the second edition" under "who may apply" is being told
  // about a cohort that was chosen without them.
  if (live) {
    const proseSeen = new Map<string, { text: string; refs: string[] }>();
    for (const r of live.prose) {
      const d = digest(r.text);
      const e = proseSeen.get(d) ?? { text: r.text, refs: [] };
      if (!e.refs.includes(r.ref)) e.refs.push(r.ref);
      proseSeen.set(d, e);
    }
    const bad: { e: { text: string; refs: string[] }; v?: Verdict }[] = [];
    for (const [d, e] of proseSeen) {
      const v = cache[d];
      if (!v || (v.v ?? 1) !== PROPERTY_VERSION || v.verdict === "report") bad.push({ e, v });
    }
    if (bad.length) {
      const reported = bad.filter((b) => b.v?.verdict === "report");
      problems.push({
        axis: "published eligibility prose states something an applicant cannot act on",
        detail:
          `${bad.length} of ${proseSeen.size} distinct eligibility_text value(s) in ` +
          `Postgres are unjudged, judged under a superseded property, or judged ` +
          `REPORT` +
          (reported.length
            ? ` — ${reported.length} of them REPORT, shown to a founder under ` +
              `"who may apply"`
            : ``) + `:\n` +
          bad.slice(0, 10).map((b) =>
            `      ${b.e.refs[0]}` +
            `${b.e.refs.length > 1 ? `  (+${b.e.refs.length - 1} more instrument(s))` : ""}` +
            `\n        ${brief(b.e.text)}` +
            `\n        ${b.v ? `${b.v.verdict} (v${b.v.v ?? 1}): ${b.v.reason}` : "NO VERDICT"}`
          ).join("\n") +
          (bad.length > 10 ? `\n      … and ${bad.length - 10} more` : "") +
          `\n    Unlike a gate there is no inert role to move this to: the column ` +
          `IS the claim. Either the text is replaced with what the official ` +
          `source says about who may apply, or it is retracted. Retracting ` +
          `changes what eligibility_embeddings is built from, so re-embed and ` +
          `re-measure recall rather than editing the column alone.`,
      });
    }
  }

  for (const p of problems) console.log(`  - [${p.axis}] ${p.detail}`);
  if (problems.length) {
    console.log(`\n${problems.length} pertinence problem(s) — the product may be ` +
      `judging founders by statements they cannot act on`);
    process.exitCode = 1;
    return;
  }

  const gateCount = snapshot.length + (live?.gates.length ?? 0);
  const kinds = new Map<string, number>();
  for (const [d] of seen) {
    const k = cache[d].verdict;
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  const breakdown = [...kinds].sort().map(([k, n]) => `${n} ${k}`).join(", ");
  console.log(
    `check_gate_pertinence: ok — ${seen.size} distinct requirement texts across ` +
    `${gateCount} deciding gate(s) from ${sources} (${breakdown}), all judged at ` +
    `property v${PROPERTY_VERSION} as something an applicant could act on; ` +
    `${cases.length}/${cases.length} calibration cases correct. ` +
    (live
      ? `${live.prose.length} published eligibility_text value(s) judged too.`
      : `eligibility_text NOT checked — it is not in the snapshot and there is ` +
        `no database here, so this run makes no claim about the prose.`));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
