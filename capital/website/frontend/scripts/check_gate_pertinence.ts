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
 *     A gate that can decide a verdict must state a condition an applicant
 *     could satisfy — not a finding about someone else's completed grant, not
 *     a description of what the instrument IS, not a duty that binds only
 *     after an award.
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

type Verdict = { verdict: string; reason: string; sample?: string };
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

async function fromPostgres(): Promise<{ ref: string; text: string; spec: boolean }[] | null> {
  loadEnvLocal();
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 4000 });
  await client.connect();
  try {
    const res = await client.query(
      `SELECT instrument_id, gate_key, requirement, value_spec
         FROM eligibility_gates
        WHERE (gate_role IS NULL OR gate_role = 'filter')
          AND coalesce(requirement, '') <> ''`);
    return res.rows.map((r) => ({
      ref: `${r.instrument_id}/${r.gate_key}`,
      text: r.requirement as string,
      spec: Boolean(r.value_spec),
    }));
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
  const cache = (JSON.parse(readFileSync(CACHE, "utf8")).verdicts ?? {}) as
    Record<string, Verdict>;

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
  for (const g of [...snapshot, ...(live ?? [])]) {
    const d = digest(g.text);
    const e = seen.get(d) ?? { text: g.text, spec: false, refs: [] };
    e.spec = e.spec || g.spec;
    if (!e.refs.includes(g.ref)) e.refs.push(g.ref);
    seen.set(d, e);
  }

  const unjudged: { d: string; e: { text: string; refs: string[] } }[] = [];
  const reports: { e: { text: string; spec: boolean; refs: string[] }; v: Verdict }[] = [];
  for (const [d, e] of seen) {
    const v = cache[d];
    if (!v) { unjudged.push({ d, e }); continue; }
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

  for (const p of problems) console.log(`  - [${p.axis}] ${p.detail}`);
  if (problems.length) {
    console.log(`\n${problems.length} pertinence problem(s) — the product may be ` +
      `judging founders by statements they cannot act on`);
    process.exitCode = 1;
    return;
  }

  const gateCount = snapshot.length + (live?.length ?? 0);
  console.log(
    `check_gate_pertinence: ok — ${seen.size} distinct requirement texts across ` +
    `${gateCount} deciding gate(s) from ${sources}, all judged as conditions an ` +
    `applicant could satisfy; ${cases.length}/${cases.length} calibration cases correct.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
