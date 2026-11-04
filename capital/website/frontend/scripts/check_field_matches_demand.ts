/**
 * An encoded field must be consistent with the demand text it came from.
 *
 * FREE — no model calls, no network, no credentials. Reads the committed
 * corpus snapshot, the same file the site falls back to.
 *
 * ── The defect ────────────────────────────────────────────────────────────
 * wsEJ rendered each adaptive question BESIDE the verbatim fund requirement
 * that motivated it, and the pairs did not read as pairs:
 *
 *   "Is your company majority-owned or controlled from outside the EU?"
 *     ← "legal entities established outside Russia whose proprietary rights
 *        are directly or indirectly owned for more than 50% by a legal person
 *        established in RUSSIA are not eligible to participate"
 *
 *   "Does any single shareholder own more than 25% of your company?"
 *     ← "Companies where more than 50 per cent is owned by the STATE, regions
 *        or municipalities are excluded"
 *
 * Both encodings are false in the same direction. The founder is asked a WIDE
 * question and the rule turns on a NARROW fact, so a truthful "yes" — from a
 * US-owned company, or from any company with a 30% lead investor — fails a
 * rule it does not fall under. `assessInstrument` treats one failing filter as
 * conclusive and `blocked` never reaches the founder, so the fund is deleted
 * from the brief silently, and the more honestly the founder answers the more
 * funds they lose.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *     A comparator may decide a founder against a rule only if the founder's
 *     answer determines that rule. The stem is the whole of what the founder
 *     is told the question means, so the demand text may not turn on a
 *     qualifier the stem does not carry.
 *
 * Two qualifier classes are mechanically decidable, and both are checked here
 * against the SHIPPED stem rather than against any table written in this file:
 *
 *   QUANTITY   If the stem states a proportion, the demand must turn on the
 *              same proportion. "more than 25%" answered against "more than
 *              50%" is a different question with the same shape.
 *
 *   JURISDICTION  If the demand names a country and the stem does not — and
 *              the answer space cannot carry a country either — the founder
 *              has no way to say which country, so every country reads as
 *              that one.
 *
 * ── Not a list of known-bad gates ─────────────────────────────────────────
 * Nothing here names an instrument, a gate key, a field or a country. The
 * stems come from FIELD_ENUM_HINTS (what the founder actually reads), the
 * country vocabulary from `countryNames()` plus the names in the world map the
 * site already renders, and the gates from the corpus. A rule extracted
 * tomorrow, in a country nobody has loaded, on a question nobody has written
 * yet, is in scope on the next run with no edit here.
 *
 * ── Why the stem and not the field name ───────────────────────────────────
 * `ownerOver25` carries its threshold in its NAME, which is exactly why the
 * mis-encodings survived review: the name looks like a category ("ownership")
 * and reads as one. The stem is the sentence the founder answers, and it is
 * the only artifact whose meaning is binding on them. Checking the name would
 * have passed every case above.
 *
 * ── Scope, and why it stops where it does ─────────────────────────────────
 * Only gates that can DECIDE: a `filter` (or untriaged — NULL is not neutral,
 * `isFilter()` honours it) carrying a value_spec on a field we really ask.
 * A field whose answer space can carry a country is exempt from the
 * jurisdiction rule for the obvious reason: the founder CAN say which one.
 * A stem with no proportion is exempt from the quantity rule, because there is
 * then no threshold the founder was told to answer at.
 *
 * Usage: npx tsx scripts/check_field_matches_demand.ts [--verbose]
 */
import { readFileSync } from "fs";
import path from "path";
import { FIELD_ENUM_HINTS, FIELD_VALUE_DOMAIN } from "../lib/intelligence/types";
import { VOCABULARY } from "../lib/intelligence/vocabulary";
import { countryNames, toIso2 } from "../lib/intelligence/countryCodes";

const VERBOSE = process.argv.includes("--verbose");
const DATA = path.join(process.cwd(), "public", "data");

/** Proportions stated in a text, normalised to a percentage.
 *
 *  Percent signs and their spellings across the corpus languages, plus the two
 *  words that state a proportion without a numeral. "half" and "majority" both
 *  mean 50 and are the ordinary way a statute writes it — a reader of
 *  "majority-owned" and a reader of "more than 50%" are answering the same
 *  question, and a check that saw only numerals would call them different. */
function proportions(text: string): Set<number> {
  const out = new Set<number>();
  const t = (text || "").toLowerCase();
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:%|per\s?cent|procent|prozent|pour\s?cent|por\s?ciento)/g)) {
    out.add(Number(m[1].replace(",", ".")));
  }
  if (/\b(half|majority|majorit|mehrheit|halb|helft|meerderheid)/.test(t)) out.add(50);
  return out;
}

/** Every spelling of a country this repo recognises, lowercased.
 *
 *  Two owned sources, no third list: the matcher's own vocabulary (European
 *  scope) and the names on the world map the site renders (global). The second
 *  matters because the rules that name a country name one OUTSIDE Europe far
 *  more often than inside it. */
function countryVocabulary(): string[] {
  const names = new Set(countryNames().map((c) => c.toLowerCase()));
  const world = JSON.parse(readFileSync(path.join(DATA, "world-110m.json"), "utf8"));
  for (const g of world?.objects?.countries?.geometries ?? []) {
    const n = g?.properties?.name;
    if (typeof n === "string" && n.length > 3) names.add(n.toLowerCase());
  }
  // Multi-word and punctuated names ("Central African Rep.", "Côte d'Ivoire")
  // are kept whole; a substring of one is not a country mention. Short forms
  // are dropped because the match is a PREFIX match (see countriesNamed) and a
  // two-letter prefix is a syllable: "uk" would find itself inside "Ukraine".
  return [...names].filter((n) => n.length > 3 && /^[a-zà-ÿ' .-]+$/.test(n));
}

/** Countries a text names.
 *
 *  Anchored at the start of a word and NOT at the end, so the demonym a
 *  statute actually writes is the same mention as the noun: "Russian-
 *  established", "Belarusian entity" and "a Russia-established body" are one
 *  country between them. The trailing looseness is why the match must be
 *  anchored at the front — an unanchored "chad" or "oman" would hit ordinary
 *  words. */
function countriesNamed(text: string, vocab: string[]): Set<string> {
  const t = (text || "").toLowerCase();
  const out = new Set<string>();
  for (const c of vocab) {
    if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t)) out.add(c);
  }
  return out;
}

type Gate = {
  id?: string; requirement?: string; quote?: string; value?: string;
  gateRole?: string | null; intakeFieldResolved?: string | null;
  valueSpec?: { op?: string; field?: string; allowed?: unknown } | null;
};

const records = JSON.parse(readFileSync(path.join(DATA, "instrument_terms.json"), "utf8")).records as
  { id: string; name: string; country?: string; gates?: Gate[] }[];

const VOCAB = countryVocabulary();

/** What the founder is told the question means: the stem plus the labels and
 *  values of the answers, because on a multi-select the meaning lives in the
 *  options and the stem is only a preamble. */
const FIELD_TEXT: Record<string, string> = {};
for (const [field, hint] of Object.entries(FIELD_ENUM_HINTS as Record<string, {
  stem: string; options: { value: string; label: string }[] }>)) {
  FIELD_TEXT[field] = [hint.stem, ...hint.options.flatMap((o) => [o.label, o.value])].join(" · ");
}

/** Whether an answer to this field can name a place at all.
 *
 *  `FIELD_VALUE_DOMAIN` already declares it, is keyed on `keyof
 *  EligibilityAnswers`, and so the compiler refuses a new intake field until
 *  someone has said what its values name. That makes it the right authority
 *  here and the reason this file holds no list of territorial fields:
 *  `region`'s options are built per founder and are EMPTY at module load, so
 *  any check that inferred territoriality from the option list would have
 *  called the one unmistakably territorial question a token question. */
const carriesPlace = (field: string) =>
  FIELD_VALUE_DOMAIN[field as keyof typeof FIELD_VALUE_DOMAIN] !== "token";

/** Every spelling of the country a fund itself belongs to. Stored as ISO2, so
 *  it is resolved back through the same table the matcher uses rather than
 *  compared as a string to a name. */
function ownCountry(iso2: string | undefined, vocab: string[]): Set<string> {
  const want = (iso2 || "").toUpperCase();
  return new Set(want ? vocab.filter((n) => toIso2(n) === want) : []);
}

type Violation = { instrument: string; name: string; gate: string; field: string; axis: string; detail: string; demand: string };
const violations: Violation[] = [];
let considered = 0;

for (const rec of records) {
  for (const g of rec.gates ?? []) {
    const spec = g.valueSpec;
    const field = spec?.field ?? g.intakeFieldResolved ?? "";
    if (!spec || !field) continue;
    // NULL role is not neutral: verdict.ts honours an untriaged gate as a filter.
    if (g.gateRole && g.gateRole !== "filter") continue;
    const asked = FIELD_TEXT[field];
    if (!asked) continue;               // not a question we put to a founder
    considered++;

    const demand = [g.requirement, g.quote, g.value].filter(Boolean).join(" ");
    if (!demand.trim()) continue;

    // ── QUANTITY ──────────────────────────────────────────────────────────
    // Only where the answer space cannot express a threshold at all. An
    // ORDERED field's answers are ranges on a line, so a rule at 20% against
    // bands cut at 25% and 50% is a rounding decision the encoder is entitled
    // to make (and `check_gate_field_reach` owns the band orders). An
    // unordered yes/no offers no rounding: the founder is answering the stem's
    // threshold and nothing else.
    const stemProps = VOCABULARY[field]?.ordered ? new Set<number>() : proportions(asked);
    if (stemProps.size) {
      const textProps = proportions(demand);
      if (textProps.size && ![...textProps].some((p) => stemProps.has(p))) {
        violations.push({
          instrument: rec.id, name: rec.name, gate: g.id ?? "?", field, axis: "quantity",
          detail: `asked at ${[...stemProps].join("/")}%, rule turns on ${[...textProps].join("/")}%`,
          demand,
        });
        continue;
      }
    }

    // ── JURISDICTION ──────────────────────────────────────────────────────
    // Exempt when the answer can carry a country: the founder can then say
    // WHICH, either because the field is territorial, or through the values
    // this very spec compares against, or because the stem names it.
    //
    // Also exempt when the country named is the FUND'S OWN, or appears in the
    // fund's own name. "no arrears in the Bank of Latvia's register" on a
    // Latvian scheme narrows nothing — every applicant to it is in Latvia, so
    // the mention is the venue, not a qualifier the founder could unknowingly
    // fail. Same for "Clean Cities Spain": that is what the thing is called.
    if (carriesPlace(field)) continue;
    const answerSpace = asked + " " + JSON.stringify(spec.allowed ?? "");
    const inAnswer = countriesNamed(answerSpace, VOCAB);
    const own = ownCountry(rec.country, VOCAB);
    for (const c of countriesNamed(rec.name ?? "", VOCAB)) own.add(c);
    const inDemand = countriesNamed(demand, VOCAB);
    const unanswerable = [...inDemand].filter((c) => !inAnswer.has(c) && !own.has(c));
    if (inAnswer.size === 0 && unanswerable.length) {
      violations.push({
        instrument: rec.id, name: rec.name, gate: g.id ?? "?", field, axis: "jurisdiction",
        detail: `rule turns on ${unanswerable.join(", ")}; the question names no country and the answer cannot carry one`,
        demand,
      });
    }
  }
}

if (considered === 0) {
  console.error("FAIL — no deciding gate carried a field we ask. The snapshot is empty or its shape changed;\n"
    + "a check with nothing to read is not a check that passed.");
  process.exit(1);
}

const byAxis = (a: string) => violations.filter((v) => v.axis === a).length;
console.log(`check_field_matches_demand — ${considered} deciding comparators on a field we ask`);

if (!violations.length) {
  console.log("ok — every one of them turns on the proportion and the jurisdiction its own question states");
  process.exit(0);
}

console.error(`\nFAIL — ${violations.length} comparator(s) decide a founder against a rule their answer does not determine`
  + `\n  quantity ${byAxis("quantity")} · jurisdiction ${byAxis("jurisdiction")}\n`);
for (const v of violations) {
  console.error(`  ${v.instrument}/${v.gate}  [${v.field}] ${v.axis}`);
  console.error(`    ${v.detail}`);
  console.error(`    asked:  ${FIELD_ENUM_HINTS[v.field as keyof typeof FIELD_ENUM_HINTS]?.stem}`);
  console.error(`    demand: ${v.demand.replace(/\s+/g, " ").slice(0, VERBOSE ? 400 : 170)}`);
}
console.error(
  `\nA comparator here is not a wrong answer, it is a wrong QUESTION: the founder answers`
  + `\ntruthfully and loses a fund that admits them. Correct the encoding in`
  + `\nreference/gate_encoding_overrides.json — that file survives re-extraction, a`
  + `\ndirect UPDATE does not. Quarantining the comparator (field: none) is a legitimate`
  + `\nfix and usually the right one: the requirement text keeps showing, the machine`
  + `\nverdict stops.`);
process.exit(1);
