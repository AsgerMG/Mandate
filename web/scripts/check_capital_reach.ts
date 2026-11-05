// Can a founder reach this fund by answering the intake at all?
//
// ── The property, and where it lives ───────────────────────────────────────
// Stated in full, with its evidence, in
// lib/intelligence/offerableAxes.ts — which also carries the DECLARATIONS this
// asserts against. In one line:
//
//   Every value a publishable row can carry on a filtered axis must be either
//   reachable by some single intake answer, or declared unofferable with a
//   reason. Silence is the only forbidden state.
//
// This file is the enforcement, and it is deliberately thin: the registry is a
// thing the product reads at runtime (`publishableInstruments()` withholds by
// it), so a check that restated it would be checking a copy.
//
// ── What changed, and why the name did not ────────────────────────────────
// This used to ask the question of `capital_type` alone, because that is the
// axis where the defect was found. The defect is not about capital: it is
// about any join between what a row carries and what a founder may answer, and
// there are two such joins in `selectLeafInstruments`. Asking one of them was
// how the second went unexamined for as long as the first did. The file keeps
// its name because the ratchet it owns is cited in the findings and in
// `npm run check`, and a ratchet that changes identity is a ratchet that can
// be quietly reset.
//
// ── Three outcomes, and only one of them is a failure ─────────────────────
//   UNDECLARED  a value nobody has classified. Hard fail, no ratchet. This is
//               the case the whole thing exists for: the values that will hurt
//               are the ones nobody enumerated, and a new source introducing
//               `mezzanine` tomorrow fails here without anybody having thought
//               of the word in advance.
//   withhold    a decision. Reported, never counted — `publishableInstruments`
//               has already removed these rows, so seeing any here at all is
//               itself a bug and is reported as one.
//   gap         a fact we failed to record. Ratcheted toward zero.
//
// ── Measured against Postgres ─────────────────────────────────────────────
// 2026-08-07, 1,084 instruments: 9 unreachable, all `unknown` — 8 EIT KIC
// leaves and one national development bank scheme carrying 2,835 awards.
//
// 2026-08-08, after the ETL declared what each source pays: 0. The nine were
// not nine mistakes, they were one — a cascade with no GRANT_BASES that read a
// missing amount as a missing capital type. Six became reachable (`grant`,
// `equity`), three were described honestly and withheld, and the remaining
// `unknown` rows are all synthetic rollups with no events, which
// `publishableInstruments` excludes for other reasons entirely.
//
// The ceiling is 0 and should stay there. A rise means a source is landing
// funds no founder can be shown.
import { OFFERABLE_AXES, withheldValues } from "../lib/intelligence/offerableAxes";

/** Publishable rows stranded under a `gap` declaration, per axis. A CEILING,
 *  never a target: lower it whenever the data improves, and never raise it to
 *  make a build green. */
const GAP_CEILING: Record<string, number> = {
  capital_type: 0,
  country: 0,
};

async function main() {
  // The committed snapshot, never a laptop's DATABASE_URL — same reason
  // check_leaf_cap.ts does it, and it is trustworthy for the same reason:
  // check_corpus_currency.ts asserts the snapshot and Postgres agree, and runs
  // before this in `npm run check`.
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../lib/intelligence/corpus");
  const pub = publishableInstruments();

  // An empty corpus satisfies "every value is reachable" vacuously, and this
  // check printed exactly that on 2026-08-08: "ok — every value carried by the
  // 0 publishable instruments is reachable". Nothing was wrong with the corpus;
  // the process had been started from the repo root, and the snapshot path
  // resolves from process.cwd(), so the file was simply not where it looked.
  //
  // A guard whose pass condition is satisfied by having no input is not a
  // guard. The floor is deliberately a bare non-zero rather than a tuned
  // number: this check owns whether the values are REACHABLE, and
  // check_corpus_census owns how many rows there should be. A second opinion on
  // the count here would be a second definition of the corpus size.
  if (!pub.length) {
    console.error(
      `check_capital_reach: FAILED — 0 publishable instruments.\n`
      + `  Every axis is vacuously reachable in an empty corpus, so this would\n`
      + `  otherwise pass having checked nothing. Run from web: the\n`
      + `  snapshot resolves from process.cwd()/public/data.\n`
      + `  cwd was ${process.cwd()}`);
    process.exit(1);
  }

  const failures: string[] = [];
  const notes: string[] = [];

  for (const axis of OFFERABLE_AXES) {
    const stranded = new Map<string, { n: number; sample: string[] }>();
    for (const i of pub) {
      const v = axis.valueOf(i);
      if (axis.reachable(v)) continue;
      const e = stranded.get(v) ?? { n: 0, sample: [] };
      e.n++;
      if (e.sample.length < 4) e.sample.push(i.id);
      stranded.set(v, e);
    }

    const withheld = withheldValues(axis);
    const undeclared = [...stranded].filter(([v]) => !axis.declared[v]);
    const wrongly = [...stranded].filter(([v]) => withheld.has(v));
    const gaps = [...stranded].filter(
      ([v]) => axis.declared[v]?.policy === "gap");
    const gapTotal = gaps.reduce((a, [, e]) => a + e.n, 0);
    const ceiling = GAP_CEILING[axis.key] ?? 0;

    if (undeclared.length) {
      failures.push(
        `${axis.key}: ${undeclared.reduce((a, [, e]) => a + e.n, 0)} publishable ` +
        `instruments carry a value NO intake answer can reach, and that nothing ` +
        `has declared:\n` +
        undeclared.map(([v, e]) =>
          `      ${String(e.n).padStart(4)}  ${axis.key}="${v}"   e.g. ${e.sample.join(", ")}`)
          .join("\n") +
        `\n    Founders answer "${axis.question}". Whatever they say, these rows ` +
        `are removed.\n` +
        `    Fix the DATA upstream so the instrument states what it is. If the ` +
        `value is legitimate\n    and simply new, map it in the intake so a ` +
        `founder can ask for it. If it is a row this\n    product should not ` +
        `offer, DECLARE it in lib/intelligence/offerableAxes.ts with the reason.\n` +
        `    Do NOT add it to the declaration merely to pass — a declaration is ` +
        `a claim about\n    the world and it is read by the product, not just by ` +
        `this check.`);
    }
    if (wrongly.length) {
      failures.push(
        `${axis.key}: ${wrongly.map(([v, e]) => `${e.n} x "${v}"`).join(", ")} ` +
        `are declared \`withhold\` yet are still publishable. ` +
        `publishableInstruments() is supposed to have removed them — either ` +
        `isWithheldByPolicy is no longer wired in, or something re-admits them ` +
        `downstream.`);
    }
    if (gapTotal > ceiling) {
      failures.push(
        `${axis.key}: ${gapTotal} publishable instruments stranded under a ` +
        `\`gap\` declaration (ceiling ${ceiling}):\n` +
        gaps.map(([v, e]) =>
          `      ${String(e.n).padStart(4)}  ${axis.key}="${v}"   e.g. ${e.sample.join(", ")}` +
          `\n            ${axis.declared[v].reason}`).join("\n") +
        `\n    A gap is a fact we never recorded, not a property of the fund. ` +
        `Fix it upstream;\n    never raise the ceiling to pass.`);
    } else if (gapTotal) {
      notes.push(
        `  ${axis.key}: ${gapTotal} of ${pub.length} stranded by a known gap ` +
        `(ceiling ${ceiling}). ${gaps.map(([v, e]) => `${e.n} x "${v}"`).join(", ")}.`);
    }
    if (gapTotal < ceiling) {
      notes.push(
        `  ${axis.key}: the data has improved since the ceiling was set. Lower ` +
        `GAP_CEILING["${axis.key}"] to ${gapTotal} so the gain cannot be given back.`);
    }
  }

  // ── A REACHABLE FUND MUST ALSO BE DESCRIBABLE (wsFE) ─────────────────────
  // The axis above asks whether a founder can reach this row. This asks the
  // next question, which had no owner: once they reach it, does the row say
  // what kind of money it is?
  //
  //   EVERY CAPITAL TYPE A PUBLISHABLE ROW CAN CARRY RENDERS A WORD OF ITS OWN.
  //
  // Not a list of types. `CAPITAL_WORD` is asked of the values the corpus
  // ACTUALLY holds, so a type introduced by a new source tomorrow fails here
  // without anyone having thought of the word in advance — which is exactly how
  // `tax_credit` got in: 23 publishable German Forschungszulage leaves, an R&D
  // TAX CREDIT, all rendering as the generic word "Funding" on rows where the
  // kind of money was the one fact separating them from the grants beside them.
  // One of them was in front of a founder who had won it.
  //
  // `capitalWord.test.ts` asks the hermetic half — the map is total over
  // `CAPITAL_TYPE_LABEL` — and needs no snapshot. This half is the one that can
  // see a value neither map has heard of.
  const { CAPITAL_WORD } = await import("../lib/intelligence/shortlist");
  const unworded = new Map<string, { n: number; sample: string[] }>();
  for (const i of pub) {
    const v = i.capitalType || "(empty)";
    if (CAPITAL_WORD[v]) continue;
    const e = unworded.get(v) ?? { n: 0, sample: [] };
    e.n++;
    if (e.sample.length < 4) e.sample.push(i.id);
    unworded.set(v, e);
  }
  if (unworded.size) {
    failures.push(
      `capital_type: ${[...unworded.values()].reduce((a, e) => a + e.n, 0)} publishable ` +
      `instruments carry a capital type CAPITAL_WORD has no word for, so their ` +
      `descriptor opens with a generic word instead of saying what the money is:\n` +
      [...unworded].map(([v, e]) =>
        `      ${String(e.n).padStart(4)}  capital_type="${v}"   e.g. ${e.sample.join(", ")}`)
        .join("\n") +
      `\n    Add the word to CAPITAL_WORD in lib/intelligence/shortlist.ts, beside ` +
      `the label\n    CAPITAL_TYPE_LABEL already gives this type in pipeline.ts. Do NOT ` +
      `widen the\n    fallback: a row that will not say what kind of money it is has ` +
      `lost the one\n    fact that separates it from the rows around it.`);
  }

  if (failures.length) {
    console.error("check_capital_reach:\n  " + failures.join("\n  "));
    process.exit(1);
  }
  console.log(
    `check_capital_reach: ok — every value carried by the ${pub.length} ` +
    `publishable instruments is reachable by some intake answer, or declared ` +
    `unofferable with a reason (axes: ${OFFERABLE_AXES.map((a) => a.key).join(", ")}).`);
  for (const n of notes) console.log(n);
}

main().catch((e) => { console.error(e); process.exit(1); });
