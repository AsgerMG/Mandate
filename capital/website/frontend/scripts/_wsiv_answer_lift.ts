// WHAT IS ONE ANSWER TO STEP 3 WORTH? THE CEILING, PAID FOR WITH NOTHING.
//
// `measure_description_lift.ts` established what a description is worth: the
// SAME company ranked on its own words vs on the canned sector sentence a
// skipper is represented by. This asks the question one step in: a founder who
// skipped the box and is then asked, by the adaptive round, to describe their
// project types A SENTENCE OR TWO, not a considered paragraph. What does that
// short answer recover of the gap?
//
// ── The four arms, all on the SAME company and the SAME won fund ──────────
//   blank     description absent. `semanticFundMatch` and `themeRelevance`
//             both return an EMPTY MAP below MIN_MATCHABLE_DESCRIPTION_CHARS,
//             so `rel(i)` is 0 for every candidate and THEME_WEIGHT's 0.6 of
//             the leaf score is inert: the ordering is sector share times the
//             objective scorer, alone. This is the founder Pool P exists for.
//   template  the canned sector sentence, which is how the recall harness
//             represents a skipper. Carried so this is comparable to
//             `measure_description_lift`, and because the two are NOT the same
//             state -- one has no thematic signal, the other has a generic one.
//   answer    the first `ANSWER_CHARS` of the founder's own words, cut at a
//             word boundary. The PROXY for a Pool P answer, and it is a proxy:
//             see below.
//   real      the whole description. The ceiling, and the `real` arm of
//             measure_description_lift.
//
// ── WHAT THIS PROXY IS, AND WHAT IT IS NOT ────────────────────────────────
// The `answer` arm is the founder's real words, truncated. It is therefore an
// honest measure of HOW MUCH TEXT IS NEEDED and a dishonest measure of WHETHER
// A REAL FOUNDER WOULD WRITE IT. Nothing in this product records what a founder
// does with a question, and the owner has decided not to start recording it, so
// the answer rate is unmeasured and no number here should be read as one. What
// this bounds is the ceiling: if a short answer recovers little of the gap even
// when it is drawn from the founder's own description, the feature cannot pay
// however well it is answered.
//
// FREE of paid model calls: `computeVerdict` calls no Anthropic model. It costs
// one Voyage query embedding per (case, arm) and reads Postgres.
//
//   npx tsx scripts/_wsiv_answer_lift.ts
//   N=40 npx tsx scripts/_wsiv_answer_lift.ts
//   ANSWER_CHARS=140 SPLIT=tune npx tsx scripts/_wsiv_answer_lift.ts

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsiv_answer_lift", ["DATABASE_URL", "VOYAGE_KEY"]);

import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally } from "../lib/intelligence/semantic";
import { loadRecallSet } from "./recallSet";

interface Pair {
  name: string; country: string; sector?: string; instrument: string;
  description?: string; selfDescription?: string; mode: string; split: string;
  descriptionSource?: string;
}

/** How much a founder types into a two-or-three-sentence box. Roughly one
 *  sentence; the ladder below reports the full description too, so the reader
 *  can see the shape rather than trust this one number. */
const ANSWER_CHARS = Number(process.env.ANSWER_CHARS ?? 90);

/** The canned sentence a skipper is represented by, READ OFF THE SET rather
 *  than written here — the same discipline as measure_description_lift, so no
 *  sector wording is hardcoded in this file. */
function templateBySector(all: Pair[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of all) {
    if (r.selfDescription && r.sector && !m.has(r.sector)) m.set(r.sector, r.selfDescription);
  }
  return m;
}

/** Truncate at a word boundary, never mid-word: a half word is not something a
 *  founder types, and it would embed as noise the real arm never carries. */
function shortAnswer(desc: string, chars: number): string {
  const t = desc.trim();
  if (t.length <= chars) return t;
  const cut = t.slice(0, chars);
  const sp = cut.lastIndexOf(" ");
  return (sp > chars * 0.5 ? cut.slice(0, sp) : cut).trim();
}

async function rank(t: Pair, description: string | undefined) {
  return computeVerdict("TestCo", t.country, {
    entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
    borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
    useOfFunds: ["industrial_research", "experimental_development"],
  } as never, {
    capitalSought: ["grant", "loan"],
    description,
  } as never);
}

const ARM_ORDER = ["blank", "template", "answer", "real"] as const;
type Arm = (typeof ARM_ORDER)[number];

async function main() {
  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const { file: setFile, rows: all } = loadRecallSet() as unknown as { file: string; rows: Pair[] };
  const templates = templateBySector(all);
  const split = process.env.SPLIT ?? "holdout";

  // Only pairs that HAVE a real description can be measured all four ways.
  // That is the point: it isolates the text from the population. The leaky
  // rows are excluded for the reason measure_description_lift excludes them --
  // their description sits verbatim inside the won fund's own profile, which
  // inflates every arm that carries text and nothing else.
  const eligible = all.filter((r) =>
    (split === "all" || r.split === split) &&
    Boolean(r.description && r.description.trim().length >= 12) &&
    r.descriptionSource !== "own_project_title_leaks" &&
    templates.has(r.sector ?? "other"));

  const N = Math.min(Number(process.env.N ?? 120), eligible.length);
  const step = Math.max(1, Math.floor(eligible.length / N));
  const sample = eligible.filter((_, i) => i % step === 0).slice(0, N);

  const arms = (process.env.ARMS?.split(",") as Arm[] | undefined) ?? [...ARM_ORDER];
  const stat: Record<string, { pool: number; e5: number; r5: number; e1: number; chars: number }> = {};
  for (const a of arms) stat[a] = { pool: 0, e5: 0, r5: 0, e1: 0, chars: 0 };
  // Paired outcomes against the arm a skipper is in TODAY, so the discordant
  // pairs are visible and the reader is not handed two marginal rates.
  const flips: Record<string, { win: number; lose: number; both: number; neither: number }> = {};
  for (const a of arms) flips[a] = { win: 0, lose: 0, both: 0, neither: 0 };

  resetRankerTally();
  let done = 0;
  for (const t of sample) {
    const want = byId.get(t.instrument);
    const wantRegime = want?.parentId ?? t.instrument;
    const real = (t.description ?? "").trim();
    const text: Record<Arm, string | undefined> = {
      blank: undefined,
      template: templates.get(t.sector ?? "other"),
      // What SHIPS: the panel appends the Pool P answer to whatever is already
      // in the box. A founder who skipped entirely has an empty box, so the
      // answer is the whole description -- which is this arm.
      answer: shortAnswer(real, ANSWER_CHARS),
      real,
    };
    const hit: Record<string, boolean> = {};
    for (const arm of arms) {
      const desc = text[arm];
      const v = await rank(t, desc);
      const pool: string[] = v.candidateInstrumentIds ?? [];
      const top5 = (v.instrumentTable ?? []).slice(0, 5)
        .map((r) => r.instrumentId).filter(Boolean) as string[];
      stat[arm].chars += (desc ?? "").length;
      if (pool.includes(t.instrument)) stat[arm].pool++;
      if (top5.includes(t.instrument)) stat[arm].e5++;
      if (top5[0] === t.instrument) stat[arm].e1++;
      if (top5.some((id) => (byId.get(id)?.parentId ?? id) === wantRegime)) stat[arm].r5++;
      hit[arm] = top5.includes(t.instrument);
    }
    const base = hit.blank;
    for (const a of arms) {
      if (hit[a] && base) flips[a].both++;
      else if (hit[a]) flips[a].win++;
      else if (base) flips[a].lose++;
      else flips[a].neither++;
    }
    done++;
    if (done % 20 === 0) console.error(`  … ${done}/${sample.length}`);
  }

  const pc = (n: number) => `${String(n).padStart(4)}/${done} (${(100 * n / done).toFixed(1)}%)`;
  console.log(`\nPOOL P CEILING — set=${setFile}, split=${split}, ${done} companies, ` +
              `every arm the SAME case. answer arm = first ${ANSWER_CHARS} chars, word boundary.`);
  console.log(`  eligible pairs with a real description: ${eligible.length}`);
  console.log(`\n  arm        mean chars   in pool            EXACT@1            EXACT@5            REGIME@5`);
  for (const a of arms) {
    const s = stat[a];
    console.log(`  ${a.padEnd(9)}  ${(s.chars / done).toFixed(0).padStart(10)}   ` +
                `${pc(s.pool)}   ${pc(s.e1)}   ${pc(s.e5)}   ${pc(s.r5)}`);
  }
  if (arms.includes("blank")) {
    console.log(`\n  EXACT@5 against a founder who wrote nothing (paired, McNemar counts):`);
    for (const a of arms.filter((x) => x !== "blank")) {
      const lift = 100 * (stat[a].e5 - stat.blank.e5) / done;
      console.log(`    ${a.padEnd(9)} ${(lift >= 0 ? "+" : "")}${lift.toFixed(1)}pp   ` +
                  `discordant ${flips[a].win + flips[a].lose} ` +
                  `(${flips[a].win} for, ${flips[a].lose} against)`);
    }
    if (arms.includes("answer") && arms.includes("real")) {
      const gap = stat.real.e5 - stat.blank.e5;
      const got = stat.answer.e5 - stat.blank.e5;
      console.log(`\n  SHARE OF THE WHOLE DESCRIPTION'S VALUE RECOVERED BY ONE SHORT ANSWER: ` +
                  `${gap === 0 ? "n/a (no gap to recover)" : `${(100 * got / gap).toFixed(0)}%`}`);
    }
  }
  console.log(`\n  ${rankerTallyLine()}`);
}
main();
