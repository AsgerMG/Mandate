/**
 * An answer we collect must change what the founder is shown — or say why not.
 *
 * FREE — no model calls beyond one embedding per probe profile, and none at
 * all without VOYAGE_KEY. Reads Postgres once.
 *
 * ── The defect class ──────────────────────────────────────────────────────
 * `check_gate_field_reach.ts` answers "can an answer reach the evaluator". It
 * cannot answer the question that keeps costing us, which is one step further
 * down: **does anything DO something with it once it arrives.** Four instances
 * in one week, every one of them invisible because the value was present:
 *
 *   region      asked, answered, merged by the panel, then dropped before
 *               `sanitizeEligibility`. 193 rules on 163 funds never fired, and
 *               the adaptive round asked for it again. Now the single biggest
 *               measured lever in the product.
 *   ticketFit   computed in `rowRelevance` and left out of the returned
 *               expression — from the commit titled "Make ticketBand actually
 *               affect what a founder is shown".
 *   consortiumOk destructured in `selectInstrumentRows`, read by nothing there.
 *   sector,     passed by `computeVerdict` and NOT by the memo, because the
 *   useOfFunds  two call sites built the same object literal by hand and one
 *               of them had drifted. Both are asked on screen one. The memo is
 *               the deliverable.
 *
 * Nothing failed in any of the four. Each produced a slightly worse brief,
 * which is the failure mode that survives longest. And none of them is
 * detectable by reading a signature, a destructure or an import: `ticketFit`
 * was computed, named, and one token from being used.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *     Every field of EligibilityAnswers must either
 *       (a) RANK — there exists some founder, and some legal answer to this
 *           question, for which answering it changes the rows that would be
 *           published; proven here by building the table both ways, or
 *       (b) be declared `ranks: false` with a reason, and still be read by the
 *           eligibility screen, proven the same way.
 *     A field that changes neither the rows nor the screen, under any answer,
 *     is a question we ask and an answer we discard.
 *
 * This is a property with a test, not a register. No field name is enumerated
 * in this file. The field list is `keyof EligibilityAnswers`; the answers
 * tried come from the product's own vocabulary (`VOCABULARY`,
 * `FIELD_ENUM_HINTS`, `FIELD_REACH.sample`); and the table is built by the one
 * function production builds it with (`tableInputFromAnswers` +
 * `buildInstrumentTableHydrated`). A field added tomorrow is in scope the
 * moment `ANSWER_USE` forces someone to classify it.
 *
 * ── Why the declaration cannot simply lie ─────────────────────────────────
 * `ranks: true` is PROVED, never trusted — a false claim fails the build.
 * `ranks: false` is the cheap direction, so it is not free either: the field
 * must still move `evaluateEligibility`, which is what "collected for the memo"
 * means. A field declared memo-only that moves nothing at all fails.
 *
 * ── Why an existential and not a universal ────────────────────────────────
 * "Some answer changes something" rather than "every answer changes
 * something": `consortium: "unsure"` SHOULD be indistinguishable from silence,
 * and a founder in a country with one scheme cannot be re-ranked. Requiring
 * every answer to move every profile would fail correct code. Requiring that
 * the question be capable of moving anything is the weakest claim that still
 * catches all four defects above — each of them moved nothing, anywhere, ever.
 *
 * DATABASE_URL is OPTIONAL: with no corpus this checks nothing and says so.
 */
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
const CREDENTIALS = requireCredentials(
  "check_answer_reach", [], { optional: ["DATABASE_URL"] });

/**
 * How many founders the probe runs over.
 *
 * They are DRAWN FROM THE RECALL SET, not written here — real companies with
 * real countries, sectors and self-descriptions, sampled by the same seeded
 * shuffle every other harness uses, so this check and the recall numbers speak
 * about the same population.
 *
 * The first cut of this used three hand-written founders and was wrong for a
 * reason worth recording: on a Tuesday's corpus five gate-driven fields
 * separated a sibling somewhere in their three tables, and on Wednesday's —
 * after an unrelated load moved 5% of the corpus in or out of "offerable" —
 * two of them did not. A guard whose verdict flips with someone else's data
 * load is a guard that gets disabled. Twelve founders spread across the
 * markets the product actually serves is enough for "no answer to this
 * question moves anybody" to be a statement about the code.
 */
const PROBE_FOUNDERS = 12;

async function main() {
  const { ANSWER_USE, FIELD_ENUM_HINTS, FIELD_REACH } =
    await import("../lib/intelligence/types");
  const { VOCABULARY } = await import("../lib/intelligence/vocabulary");
  const { hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, requireLiveCorpus } =
    await import("../lib/intelligence/corpus");
  const { buildInstrumentTableHydrated, tableInputFromAnswers, DISPLAY_CAP } =
    await import("../lib/intelligence/shortlist");
  const { evaluateEligibility } = await import("../lib/intelligence/eligibility");
  const { founderCountryList } = await import("../lib/intelligence/shortlist");
  const { semanticFundMatch } = await import("../lib/intelligence/semantic");
  const { loadRecallSet, isDescribed } = await import("./recallSet");
  const { sampleRecall, DEFAULT_SEED } = await import("./recallSample");
  type Answers = import("../lib/intelligence/types").EligibilityAnswers;

  const fields = Object.keys(ANSWER_USE) as (keyof Answers)[];

  if (CREDENTIALS === "offline" || !process.env.DATABASE_URL) {
    console.log("check_answer_reach: no DATABASE_URL, nothing to check " +
                `(${fields.length} intake fields declared)`);
    return;
  }

  await hydrateDbInstruments();
  // A Postgres timeout falls back to the committed snapshot SILENTLY, and this
  // check cannot survive that: the snapshot carries a subset of the encoded
  // comparators, so eight fields that demonstrably move rows against the live
  // corpus moved none against the fallback and the run reported eight
  // founder-facing defects that did not exist. Observed the first time this
  // ran under `npm run check`, four seconds instead of four minutes. A guard
  // that grades a different corpus from the one that ships is worse than no
  // guard, so this exits loudly rather than reporting.
  requireLiveCorpus("check_answer_reach");
  // Every gate in memory before the first build, so two builds of the same
  // profile differ ONLY in the answer under test. Production hydrates lazily
  // per request; a fully warm corpus is the stronger test, because a field
  // that cannot move a row with every rule loaded certainly cannot move one
  // with a subset.
  //
  // IN CHUNKS, and then PROVED. `hydrateGatesFor` sets statement_timeout=2000
  // and swallows the error, so asking it for all 1,088 instruments at once
  // returns cleanly having fetched nothing whenever the database is busy —
  // and every gate-driven field then reads as a defect. That is exactly what
  // happened the first time this ran under `npm run check`: eight fields
  // reported as broken, in four seconds instead of four minutes, against a
  // corpus whose provenance still said "postgres" because the instruments had
  // loaded and only their gates had not.
  // ── Ground truth, straight from Postgres ─────────────────────────────────
  // What the CORPUS demands on each field. Read by its own query rather than
  // counted off the in-memory instruments, because the in-memory count is
  // exactly what a partial hydration corrupts — and this number is also the
  // POST-CONDITION the hydration below is held to.
  const encoded = new Map<string, { specs: number; values: string[] }>();
  const { Client } = await import("pg");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const gateRows = await db.query<{ instrument_id: string; value_spec: string }>(
    `SELECT instrument_id, value_spec FROM eligibility_gates
      WHERE value_spec IS NOT NULL AND value_spec <> ''`);
  const instrumentsWithSpecs = new Set<string>();
  for (const r of gateRows.rows) {
    let spec: { field?: string; allowed?: unknown[]; value?: unknown };
    try {
      spec = typeof r.value_spec === "string" ? JSON.parse(r.value_spec) : r.value_spec;
    } catch { continue; }
    if (!spec.field) continue;
    instrumentsWithSpecs.add(r.instrument_id);
    const e = encoded.get(spec.field) ?? { specs: 0, values: [] };
    e.specs += 1;
    for (const v of spec.allowed ?? (spec.value === undefined ? [] : [spec.value])) {
      if (typeof v === "string" && !e.values.includes(v)) e.values.push(v);
    }
    encoded.set(spec.field, e);
  }
  await db.end();

  // ── Hydrate, in chunks, and PROVE it landed ──────────────────────────────
  // `hydrateGatesFor` sets statement_timeout=2000 and swallows the error, so
  // asking it for all 1,088 instruments at once returns cleanly having fetched
  // NOTHING whenever the database is busy. That happened the first time this
  // ran under `npm run check`: eight gate-driven fields reported as
  // founder-facing defects, in four seconds instead of four minutes, against a
  // corpus whose provenance still read "postgres" because the instruments had
  // loaded and only their gates had not.
  //
  // Chunking keeps each query inside the 2s budget; retrying covers a busy
  // moment; and the post-condition is the part that matters, because neither
  // of the first two is allowed to be trusted. A guard that grades a
  // half-loaded corpus is worse than no guard.
  const ids = loadDbInstruments().map((i) => i.id);
  const hydratedCount = () => loadDbInstruments().filter(
    (inst) => (inst.gates as { valueSpec?: unknown }[]).some((g) => g.valueSpec)).length;
  const want = [...instrumentsWithSpecs].filter((id) => ids.includes(id)).length;
  for (let attempt = 1; attempt <= 5 && hydratedCount() < want; attempt++) {
    for (let i = 0; i < ids.length; i += 50) await hydrateGatesFor(ids.slice(i, i + 50));
  }
  if (hydratedCount() < want) {
    console.error(`check_answer_reach: gate hydration is incomplete — ` +
      `${hydratedCount()} of ${want} instruments carrying an encoded comparator ` +
      `have their gates in memory. Postgres says one thing and the ranker would ` +
      `see another, so every gate-driven field would read as a defect. Exiting ` +
      `rather than reporting; re-run when the database is less busy.`);
    process.exitCode = 1;
    return;
  }

  /** Every legal answer to this question, as a founder could give it. Drawn
   *  from the product's own option lists, and — where it has none — from what
   *  the funds themselves demand on that field. Never written out here. */
  const answersToTry = (field: keyof Answers, base: Answers): unknown[] => {
    const out: unknown[] = [];
    const vocab = VOCABULARY[field as string];
    const hint = FIELD_ENUM_HINTS[field as string];
    const opts = hint?.optionsFor ? hint.optionsFor(base) : hint?.options;
    const multi = vocab?.multi ?? hint?.multi ?? false;
    const values = vocab?.values.length ? vocab.values
      : opts?.length ? opts.map((o) => o.value)
      // entityCountries and region have no fixed option list by design, and
      // check_vocabularies skips exactly those — which is how `region` stayed
      // broken through a green build. The funds' own encoded comparators name
      // real, valid answers, so an unenumerable field is still probeable.
      : encoded.get(field as string)?.values ?? [];
    for (const v of values) out.push(multi ? [v] : v);
    // FIELD_REACH.sample is the value already required to exist for a field
    // nothing else can supply one for (check_gate_field_reach fails a field it
    // cannot probe), so it is always worth trying.
    const sample = FIELD_REACH[field]?.sample;
    if (sample !== undefined) out.push(sample);
    // Deterministic, and capped: a 30-option multi-select does not need 30
    // builds to show that answering it can move a row. The cap only ever makes
    // this check STRICTER (fewer chances to prove a claim), never laxer.
    return out.slice(0, 12);
  };

  // WHAT THE FOUNDER IS SHOWN, which is not the same as what the ranker
  // returns. Production assesses the ranked pool and then DROPS the funds the
  // founder conclusively fails — that is the whole reason VERDICT_POOL is 18
  // against a display cap of 6. A probe that compared raw rankings would
  // therefore report the two largest encoded axes in the corpus, `activities`
  // and `exclusionFlags` (1,289 comparators between them), as moving nothing:
  // they are blockers, and blocking happens after the sort.
  //
  // So the signature is the ranked rows with the conclusively-failed ones
  // removed, in order — the five names on the page.
  const BLOCKED = new Set(["not_met", "likely_not_met"]);
  const publishedSig = (
    rows: { instrumentId?: string; instrument: string }[],
    checks: { instrumentId?: string; status: string }[],
  ) => {
    const blocked = new Set(checks
      .filter((c) => c.instrumentId && BLOCKED.has(c.status))
      .map((c) => c.instrumentId!));
    return rows.filter((r) => !r.instrumentId || !blocked.has(r.instrumentId))
      .slice(0, DISPLAY_CAP).map((r) => r.instrumentId ?? r.instrument).join("|");
  };
  const screenSig = (checks: { check: string; status: string }[]) =>
    checks.map((c) => `${c.check}:${c.status}`).join("|");

  // The probe population: real companies, drawn by the shared seeded shuffle.
  // Described rows only — a founder who typed nothing cannot exercise the
  // semantic half of the ranking, and half the scorers would go untested.
  const { rows: recall } = loadRecallSet("answer reach");
  const PROFILES = sampleRecall(
    recall.filter((r) => isDescribed(r) && r.country), PROBE_FOUNDERS, DEFAULT_SEED,
  ).map((r) => ({
    name: `${r.name} (${r.country}/${r.sector ?? "other"})`,
    country: r.country,
    sector: r.sector,
    description: (r.description || r.selfDescription || "") as string,
    capitalSought: ["grant", "loan"] as string[],
  }));

  // One table build, through the production entry and the production mapping.
  const build = async (p: (typeof PROFILES)[number], sem: Map<string, number>,
                       answers: Answers | undefined) => {
    const rows = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(),
      // `country` is not a field of EligibilityAnswers: it is the top-level
      // select, folded into entityCountries server-side by
      // withIncorporationCountry. Mirrored here, or the probe would hold the
      // founder's country fixed while varying entityCountries and conclude
      // that the country answer changes nothing. targetMarkets is left empty
      // for the same reason: it would re-add the country under test.
      founderCountries: founderCountryList(
        answers?.entityCountries?.[0] ?? p.country, [], answers?.entityCountries),
      capitalSought: [...p.capitalSought],
      description: p.description,
      semantic: sem,
      ...tableInputFromAnswers(answers),
    });
    const ids = rows.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    const checks = evaluateEligibility(answers, ids);
    return { rows: publishedSig(rows, checks), screen: screenSig(checks) };
  };

  // Baseline answers: a real founder's screen-one answers, so the probe moves
  // ONE field against a populated profile rather than against emptiness.
  const baseFor = (p: (typeof PROFILES)[number]): Answers => ({
    entityCountries: [p.country],
    sector: p.sector ?? "other",
    activities: ["none"],
    borrowerModel: "operating",
    ticketBand: "b500k_2m5",
    developmentStage: "prototype",
    useOfFunds: ["industrial_research"],
  });

  // Embeddings and reference tables computed ONCE per founder: the reference
  // is the same for every field, and rebuilding it per field turned 12 builds
  // into 276 of the identical table.
  const sems: Map<string, number>[] = [];
  const refs: { rows: string; screen: string }[] = [];
  for (const p of PROFILES) {
    const sem = await semanticFundMatch(p.description);
    sems.push(sem);
    refs.push(await build(p, sem, baseFor(p)));
  }

  // A field nothing can ANSWER is not this check's business: it is
  // check_gate_field_reach's, which fails the build on any comparator keyed to
  // one. Probing it here would report a second copy of that finding as if it
  // were a new one, and the two checks would drift into disagreeing about the
  // same fact. Reach first, then use.
  const collected = fields.filter((f) => FIELD_REACH[f]?.via !== "unreachable");
  const moves = new Map<keyof Answers, { rows: boolean; screen: boolean; how: string }>();
  for (const field of collected) {
    let rows = false, screen = false, how = "";
    outer:
    for (const [pi, p] of PROFILES.entries()) {
      const sem = sems[pi], ref = refs[pi];
      const base = baseFor(p);
      for (const value of answersToTry(field, base)) {
        const probe = { ...base, [field]: value } as Answers;
        const got = await build(p, sem, probe);
        if (got.rows !== ref.rows) {
          rows = true; screen = true;
          how = `${p.name}: ${JSON.stringify(value)} changes the published rows`;
          break outer;
        }
        if (got.screen !== ref.screen && !screen) {
          screen = true;
          how = `${p.name}: ${JSON.stringify(value)} changes the eligibility screen`;
        }
      }
    }
    moves.set(field, { rows, screen, how });
  }

  const failures: string[] = [];
  const proved: string[] = [];
  const declared: string[] = [];
  for (const field of collected) {
    const use = ANSWER_USE[field];
    const m = moves.get(field)!;
    if (use.ranks) {
      if (!m.rows) {
        failures.push(
          `  DECLARED TO RANK, RANKS NOTHING — ${String(field)}\n` +
          `      ANSWER_USE says it ranks (${use.via}), and no answer to it ` +
          `changed the published rows for any probe founder.\n` +
          `      Either the wiring is broken — the answer is collected, ` +
          `threaded, and read by nothing — or the claim is wrong.`);
      } else {
        proved.push(`  ${String(field)} — ${m.how}`);
      }
      continue;
    }
    if (!use.reason.trim()) {
      failures.push(`  UNDECLARED — ${String(field)}\n` +
                    `      ranks: false needs a reason. "We collect it and it ` +
                    `does not rank" is a decision; it has to read like one.`);
      continue;
    }
    // "Read by the screen" is proved one of two ways, and the second is the
    // one that stops this check failing on its own coverage rather than on the
    // product. Three probe founders see three tables; a field whose two
    // comparators sit on two instruments none of them was shown moves nothing
    // HERE while being read for every founder who IS shown one. So an encoded
    // comparator counts as proof of use — `evaluateEligibility` runs the
    // generic loop over every gate on every instrument on the table, and
    // `check_gate_field_reach` has already proved the answer survives the
    // sanitiser to get there. Neither check alone is enough; together they are
    // the whole path from question to consequence.
    const enc = encoded.get(field as string);
    if (!m.rows && !m.screen && !enc?.specs) {
      failures.push(
        `  COLLECTED AND DISCARDED — ${String(field)}\n` +
        `      declared memo-only: ${use.reason}\n` +
        `      but no answer to it moved the rows or the eligibility screen ` +
        `for any probe founder, and no fund in the corpus encodes a rule ` +
        `against it. Nothing reads it. Either wire it or stop asking.`);
      continue;
    }
    declared.push(
      `  ${String(field)} — ${use.reason}\n` +
      `      read by: ${m.rows ? `the rows (${m.how})`
        : m.screen ? `the eligibility screen (${m.how})`
        : `${enc!.specs} encoded comparator(s), on no probe founder's table`}`);
  }

  console.log(`check_answer_reach: ${collected.length} of ${fields.length} intake ` +
              `fields are collected (the rest are declared unreachable and belong ` +
              `to check_gate_field_reach); ${PROFILES.length} probe founders; ` +
              `${proved.length} proved to rank, ${declared.length} declared memo-only`);
  if (proved.length) {
    console.log(`\n  Proved to change the published rows:\n${proved.join("\n")}`);
  }
  if (declared.length) {
    console.log(`\n  Collected, not ranking — by decision:\n${declared.join("\n")}`);
  }
  if (process.env.VERBOSE) {
    console.log("\n  What each answer moved (rows / screen):");
    for (const f of collected) {
      const m = moves.get(f)!;
      console.log(`    ${String(f).padEnd(24)} rows=${m.rows ? "yes" : "no "} ` +
                  `screen=${m.screen ? "yes" : "no "}  ${m.how}`);
    }
  }
  if (failures.length) {
    console.error(`\n  ${failures.length} field(s) whose answer goes nowhere:\n` +
                  failures.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("  PASS — every question we ask changes something a founder sees.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
