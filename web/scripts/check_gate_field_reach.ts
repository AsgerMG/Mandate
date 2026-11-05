/**
 * A rule may only be encoded against a field some answer can reach.
 *
 * FREE — no model calls, no cache. One Postgres read.
 *
 * ── The defect ────────────────────────────────────────────────────────────
 * `evaluateSpec` never sees a field name. Its caller looks up
 * `answers[spec.field]`, and if nothing ever writes that key the lookup is
 * `undefined`, every operator returns null, and null renders as "not
 * assessable". So a rule keyed to a question nobody is asked cannot pass,
 * cannot fail, and cannot rank anything — while looking exactly like a rule
 * that is quietly agreeing with everyone.
 *
 * Measured against Postgres 2026-08-08, over 2,047 encoded comparators:
 *
 *   region              193 specs, 163 instruments, 8.8% of corpus events.
 *                       ASKED and ANSWERED — the adaptive round offers it and
 *                       the panel merges the answer — then dropped, because
 *                       `sanitizeEligibility` has no `region` key. Every real
 *                       request lost it at the door. It worked in the bench,
 *                       which is why nothing noticed: check_archetypes and
 *                       dump_verdicts call computeVerdict directly and skip
 *                       the sanitiser entirely.
 *   activityCountries    86 specs, 80 instruments, 17.1% of events. Asked
 *                       nowhere at all: no control, no FIELD_ENUM_HINTS entry,
 *                       no derivation.
 *   foundedYear          17 specs, 15 instruments. Same, and worse — see below.
 *   inExclusionConditions 1 spec. Not an intake field in any version of the
 *                       product; the extractor invented the name.
 *
 * ── Inertness hides incorrectness ─────────────────────────────────────────
 * `foundedYear` is the argument for failing the build rather than filing a
 * note. Nine of its specs hold an AGE ("no older than three years",
 * numeric_lte 3), three hold a CALENDAR YEAR ("incorporated after 1 January
 * 2015", numeric_gte 2015), and one reads numeric_gte -5. Two incompatible
 * units in one numeric field, and one impossible value, all of it stable and
 * unremarked — because a field nothing answers is a field nothing can
 * contradict. The day someone adds the question, nine funds begin
 * false-blocking exactly the young companies they were written for.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *     Every field carrying an encoded comparator must be a field some answer
 *     can reach: a real key of EligibilityAnswers, with a declared answer
 *     path, whose value survives sanitizeEligibility into the evaluator.
 *
 * Stated as a property with a test that decides fields nobody has seen. The
 * field list is READ FROM THE CORPUS (`value_spec->>'field'`), never
 * enumerated here, so a field invented by tomorrow's extraction run is in
 * scope the moment it is written. Reachability is computed from the product's
 * own declarations — FIELD_REACH and FIELD_ENUM_HINTS in types.ts — and then
 * PROVED against the live sanitiser rather than trusted.
 *
 * ── Why the declaration cannot simply lie ─────────────────────────────────
 * FIELD_REACH is a claim, and a claim is worth nothing on its own. Two
 * cross-checks hold it to the mechanisms:
 *
 *   via: "adaptive" must correspond to a real FIELD_ENUM_HINTS entry — that
 *       is the only table the grounded round can pick a field from
 *       (`gateReach`: `if (!FIELD_ENUM_HINTS[field]) continue`).
 *   every path except "unreachable" must survive sanitizeEligibility, which
 *       is the one whitelist between a real request and the evaluator.
 *
 * ── A guard must not skip its own hard cases ──────────────────────────────
 * `check_vocabularies.ts` already probes the sanitiser, and it opens with
 * `if (!vocab.values.length) continue`. The fields with no enumerable value
 * list are entityCountries, activityCountries and region — which is to say
 * the skip covers exactly the fields that broke, twice this week and once
 * again here. So this check FAILS on a field it cannot construct a probe
 * value for, rather than passing it: an unprobeable field is an unproven
 * field, and the two must not be the same colour.
 *
 * ── What is reported and not failed ───────────────────────────────────────
 * `via: "constant"` (borrowerModel, pinned to "operating") is genuinely
 * reachable: those rules evaluate, they just always evaluate the same way.
 * That is a product decision about who this tool serves, not a defect, so it
 * is surfaced with its numbers and never failed.
 *
 * DATABASE_URL is OPTIONAL: with no database this checks nothing and says so,
 * rather than failing a CI runner that has no corpus to read.
 */
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
const CREDENTIALS = requireCredentials(
  "check_gate_field_reach", [], { optional: ["DATABASE_URL"] });

interface Row {
  field: string;
  specs: number;
  instruments: Set<string>;
  events: number;
  ops: Map<string, number>;
  example: { id: number; instrument: string; req: string };
}

/** What a founder could really answer for this field, for the sanitiser probe.
 *  Preference order: the field's own declared sample, then the fixed
 *  vocabulary, then the adaptive round's option list. Returns undefined when
 *  none of the three can supply one — which is a FAILURE, not a skip. */
function probeValue(
  field: string,
  reach: { sample?: unknown } | undefined,
  vocab: { values: string[]; multi: boolean } | undefined,
  hint: { multi: boolean; options: { value: string }[] } | undefined,
): unknown {
  if (reach && "sample" in reach && reach.sample !== undefined) return reach.sample;
  if (vocab?.values.length) return vocab.multi ? [vocab.values[0]] : vocab.values[0];
  if (hint?.options.length) return hint.multi ? [hint.options[0].value] : hint.options[0].value;
  return undefined;
}

/** Did the probe value survive into EligibilityAnswers unchanged? */
function survives(out: Record<string, unknown>, field: string, probe: unknown): boolean {
  const got = out[field];
  if (Array.isArray(probe)) {
    return Array.isArray(got) && probe.every((p) => (got as unknown[]).includes(p));
  }
  return got === probe;
}

async function main() {
  const { FIELD_REACH, FIELD_ENUM_HINTS } = await import("../lib/intelligence/types");
  const { VOCABULARY } = await import("../lib/intelligence/vocabulary");
  const { sanitizeEligibility } = await import("../lib/intelligence/sanitize");
  const { frozenOrderRisk } = await import("../lib/intelligence/comparator");

  const url = CREDENTIALS === "offline" ? null : process.env.DATABASE_URL ?? null;
  if (!url) {
    console.log("check_gate_field_reach: no DATABASE_URL, nothing to check " +
                `(${Object.keys(FIELD_REACH).length} intake fields declared)`);
    return;
  }

  const db = new Client({ connectionString: url });
  await db.connect();
  const { rows } = await db.query(
    `SELECT g.id, g.instrument_id, fi.name, fi.event_count, g.value_spec,
            substr(g.requirement, 1, 90) AS req
       FROM eligibility_gates g
       JOIN funding_instruments fi ON fi.id = g.instrument_id
      WHERE g.value_spec IS NOT NULL AND g.value_spec <> ''
      ORDER BY g.id`);
  const totalEvents = (await db.query(
    "SELECT COALESCE(SUM(event_count), 0)::bigint AS n FROM funding_instruments")).rows[0].n;
  await db.end();

  // ── Fold the corpus's own comparators by the field they are keyed to ─────
  const byField = new Map<string, Row>();
  for (const r of rows) {
    let spec: { op?: string; field?: string };
    try {
      spec = typeof r.value_spec === "string" ? JSON.parse(r.value_spec) : r.value_spec;
    } catch {
      continue;
    }
    // `aid_intensity` carries no field: it is arithmetic about a statutory
    // ceiling, not a question put to a founder. Out of scope by construction.
    const field = spec.field;
    if (!field) continue;
    const e = byField.get(field) ?? {
      field, specs: 0, instruments: new Set<string>(), events: 0,
      ops: new Map<string, number>(),
      example: { id: r.id, instrument: String(r.name ?? r.instrument_id), req: String(r.req ?? "") },
    };
    e.specs += 1;
    e.ops.set(spec.op ?? "?", (e.ops.get(spec.op ?? "?") ?? 0) + 1);
    if (!e.instruments.has(r.instrument_id)) {
      e.instruments.add(r.instrument_id);
      e.events += Number(r.event_count ?? 0);
    }
    byField.set(field, e);
  }

  // ── A band comparator may not be judged on an order nothing maintains ─────
  // `band_max`/`band_min` specs embed the band list as it stood when the rule
  // was encoded, and a snapshot the rule is actually judged on fails in the
  // worst available way: `indexOf` returns -1 for a band it predates,
  // `comparePosition` returns null, and the rule reads "not assessable" for
  // every founder forever. Inert, and therefore never contradicted — which is
  // the same shape as `region`, where 193 rules sat inert long enough for 41 of
  // them to be filed against the wrong field with nothing to notice.
  //
  // WHICH SNAPSHOTS THOSE ARE is decided by `frozenOrderRisk` in comparator.ts,
  // derived from the same `bandOrderFor` the evaluator uses, so the guard and
  // the evaluator cannot disagree about it. Two dangerous states, and they are
  // reported apart because their fixes are different:
  //
  //   load-bearing  no live BAND_ORDERS entry for the field, so the snapshot IS
  //                 the scale and nobody maintains it.
  //   contradicts   a live entry exists and the snapshot disagrees; the live
  //                 order wins, so the rule is judged on a scale its author did
  //                 not write it against and its bound may have moved meaning.
  //
  // WHAT THIS DELIBERATELY STOPPED FAILING ON, on 2026-08-09: a snapshot that
  // agrees with the live vocabulary. This clause used to fail on the mere
  // PRESENCE of an `order` key, and was red on 222 comparators — all six of
  // their fields have a live order, and all 222 copies are byte-identical to
  // it, so `bandOrderFor` never reads one and deleting them all would change no
  // founder's answer. The remedy it printed, `reband_ticket_gates.py`, filters
  // to `field = 'ticketBand'` and could not have cleared a single one. A check
  // that is permanently red on provably inert, provably correct data, with a
  // prescribed fix that cannot make it pass, is a check that gets switched off
  // — and it would have taken the two real states above with it.
  const frozenOrder: {
    id: unknown; instrument: string; field: string; risk: string; bands: number;
  }[] = [];
  for (const r of rows) {
    let spec: { op?: string; field?: string; order?: unknown };
    try {
      spec = typeof r.value_spec === "string" ? JSON.parse(r.value_spec) : r.value_spec;
    } catch { continue; }
    const risk = frozenOrderRisk(spec);
    if (risk) {
      frozenOrder.push({
        id: r.id, instrument: String(r.name ?? r.instrument_id),
        field: spec.field ?? "(none)", risk,
        bands: Array.isArray(spec.order) ? spec.order.length : 0 });
    }
  }

  const failures: string[] = [];
  const noted: string[] = [];
  for (const risk of ["load-bearing", "contradicts"] as const) {
    const hits = frozenOrder.filter((f) => f.risk === risk);
    if (!hits.length) continue;
    const fieldsHit = [...new Set(hits.map((f) => f.field))];
    failures.push(
      `  FROZEN BAND ORDER (${risk}) — ${hits.length} band comparator(s) on ` +
      `${fieldsHit.join(", ")}\n` +
      (risk === "load-bearing"
        ? `      carry the ONLY band order they are judged on, and the ` +
          `vocabulary has none for that field. Nothing maintains it; a value ` +
          `the snapshot predates makes the rule unassessable for everyone, ` +
          `forever.\n      Fix: give the field a BAND_ORDERS entry in ` +
          `lib/intelligence/vocabulary.ts, then drop the snapshots.`
        : `      disagree with the live BAND_ORDERS for their field. The live ` +
          `order wins, so each rule is now judged on a scale its author did ` +
          `not write it against and its bound may mean something else.\n` +
          `      Fix: re-read each bound against the live order before ` +
          `dropping the snapshot — this is where rebanding silently tightened ` +
          `a rule twentyfold.`) +
      `\n      e.g. gate ${hits[0].id} (${hits[0].instrument.slice(0, 40)}), ` +
      `${hits[0].bands} bands`);
  }
  const evPct = (n: number) => `${((100 * n) / Number(totalEvents)).toFixed(1)}% of events`;
  const where = (e: Row) =>
    `${e.field}: ${e.specs} comparators on ${e.instruments.size} instruments, ${evPct(e.events)}\n` +
    `      [${[...e.ops].map(([o, n]) => `${o}:${n}`).join(", ")}]\n` +
    `      e.g. gate ${e.example.id} (${e.example.instrument.slice(0, 40)}) — ${e.example.req}`;

  for (const e of [...byField.values()].sort((a, b) => b.specs - a.specs)) {
    const reach = FIELD_REACH[e.field as keyof typeof FIELD_REACH] as
      { via: string; sample?: unknown; note?: string } | undefined;

    // 1. Not an intake field at all. The extractor invented the name; no
    //    version of the product has ever had somewhere to put an answer.
    if (!reach) {
      failures.push(`  NOT AN INTAKE FIELD — ${where(e)}\n` +
                    `      Nothing named "${e.field}" exists in EligibilityAnswers.`);
      continue;
    }

    // 2. Declared unreachable. Honest, and still waste: we are paying to
    //    extract rules the product cannot use.
    if (reach.via === "unreachable") {
      failures.push(`  NOTHING ANSWERS IT — ${where(e)}\n` +
                    (reach.note ? `      declared: ${reach.note}\n` : "") +
                    `      Fix is a decision, not a patch: ask it, derive it, or ` +
                    `stop extracting it.`);
      continue;
    }

    // 3. The declaration must match the mechanism it names.
    if (reach.via === "adaptive" && !FIELD_ENUM_HINTS[e.field]) {
      failures.push(`  DECLARED ADAPTIVE, NOT OFFERED — ${where(e)}\n` +
                    `      FIELD_ENUM_HINTS has no "${e.field}", and gateReach skips ` +
                    `any field it cannot find there.`);
      continue;
    }

    // 4. The answer must survive the one whitelist every real route uses.
    const probe = probeValue(e.field, reach, VOCABULARY[e.field], FIELD_ENUM_HINTS[e.field]);
    if (probe === undefined) {
      failures.push(`  UNPROVABLE — ${where(e)}\n` +
                    `      No fixed vocabulary and no declared FIELD_REACH.sample, so ` +
                    `this check cannot prove an answer reaches the evaluator. Add a ` +
                    `sample; an unprobeable field is an unproven one.`);
      continue;
    }
    const out = (sanitizeEligibility({ [e.field]: probe }) ?? {}) as Record<string, unknown>;
    if (!survives(out, e.field, probe)) {
      failures.push(`  ANSWER DISCARDED — ${where(e)}\n` +
                    `      A founder can be asked this (via: ${reach.via}) and ` +
                    `sanitizeEligibility drops the answer: ${JSON.stringify(probe)} ` +
                    `did not survive. Every one of these rules is inert in the ` +
                    `product and live in the bench, which bypasses the sanitiser.`);
      continue;
    }

    if (reach.via === "constant") {
      noted.push(`  ${where(e)}\n      ${reach.note ?? "pinned for every founder"}`);
    }
  }

  console.log(`check_gate_field_reach: ${rows.length} encoded comparators over ` +
              `${byField.size} fields; ${Object.keys(FIELD_REACH).length} intake ` +
              `fields declared`);
  if (noted.length) {
    console.log(`\n  ${noted.length} field(s) answered by a pinned constant. ` +
                `Reachable, evaluated, and always the same — reported, never failed:`);
    for (const line of noted) console.log(line);
  }
  if (failures.length) {
    console.error(`\nFAIL — ${failures.length} field(s) carry encoded rules no ` +
                  `founder answer can reach. Every comparator on them is inert:`);
    for (const line of failures) console.error(line);
    console.error("\nSee project-mgmt/findings/gate_field_reach_wsAX.md for the " +
                  "inventory and the three ways out.");
    process.exitCode = 1;
    return;
  }
  console.log("  PASS — every encoded rule is keyed to a field some answer can reach.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
