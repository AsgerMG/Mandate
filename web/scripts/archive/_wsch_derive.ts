// wsCH — STEP 1: derive the ORGANISATION-TYPE option set FROM THE GATES, and
// measure what knowing it would buy.
//
// ── THE PROPERTY, stated first, with a test for an unseen case ─────────────
//
// An ORGANISATION TYPE is the constitutional kind of the applicant entity:
// what it is legally constituted AS, as recorded when it was registered.
//
//   TEST for a candidate distinction D:
//     (1) INVARIANCE.   D is a property of the entity alone. It does not change
//         if the project, the sector, the territory, the headcount, the
//         turnover or the amount asked for changes.
//     (2) ORTHOGONALITY. Two entities of the same D can differ arbitrarily in
//         size, age, place and activity. If D is decided by a threshold on a
//         number, D is a BAND, not an organisation type.
//     (3) READABILITY.  D can be read off the applicant's own registration
//         document with no judgement about what the project is.
//
//   Therefore, and this is the whole reason an earlier workstream mapped this
//   demand onto `fteBand` and lost it: SME vs large enterprise FAILS test (2)
//   — it is a headcount/turnover threshold on the same constitutional kind. A
//   university is not a large enterprise and a commune is not an SME; size and
//   kind are different questions and the corpus asks both.
//
//   Excluded by the same tests, even when the same SENTENCE carries them:
//     a TERRITORY of registration  (entityCountries / region)
//     an ACTIVITY or sector        (sector / activities)
//     a STATUS EVENT              (insolvency, recovery order, sanctions —
//                                  exclusionFlags; these fail (1), an entity
//                                  enters and leaves them)
//     a PROJECT SHAPE             (consortium, lead partner — fails (1))
//
// ── HOW THE OPTIONS ARE DERIVED, rather than imagined ─────────────────────
//
// The corpus is asked, in its own words, what the applicant must BE. The
// candidate phrases are taken from the GRAMMATICAL SLOT that names the kind of
// applicant — "the applicant must be X", "eligible beneficiaries are X",
// "support is limited to X" — over every publishable filter gate. The head
// nouns of that slot ARE the distinctions the corpus draws; nothing else is
// admitted, and no fund, country or sector appears anywhere in this file.
//
// The families below are the head nouns that survive the three tests, grouped
// where the corpus itself uses them interchangeably (a "self-employed
// individual" and a "natural person carrying out an economic activity" are the
// same demand in two wordings — the demand clustering in _wscc_demand.ts puts
// them in one class, which is the evidence for merging them here).
//
// ── WHAT THIS FILE IS AND IS NOT ──────────────────────────────────────────
// It is a MEASUREMENT INSTRUMENT. Its detector is a proxy standing in for the
// model triage pass that would populate `intake_field_resolved` for real, and
// every number it prints is reported as a proxy. It is NOT a shipped rule: no
// gate is written from it and nothing in the product reads it.
//
// FREE. Reads Postgres and the corpus's own gate embeddings; no model calls.
//
// Run from web:
//   PUBLISHABLE=/tmp/pub.json npx tsx scripts/_wsch_derive.ts
import { Client } from "pg";
import { writeFileSync } from "fs";
import { loadEnvLocal, requireCredentials } from "../loadEnv";
import { loadGates, readPub, canopy, type GateRow } from "./_wscc_demand";

loadEnvLocal();
requireCredentials("wsch_derive", ["DATABASE_URL"]);
const TAU = Number(process.env.TAU ?? 0.72);
const OUT = process.env.ORGTYPE_OUT;

/** The grammatical slot that names WHAT THE APPLICANT MUST BE. */
const KIND_SLOT: RegExp[] = [
  /(?:applicant|applicants|beneficiar(?:y|ies)|claimants?|borrowers?|entit(?:y|ies)|organisations?|bodies|lead organisation|target group)\s+(?:must|shall|may|can|is|are|should)[^.;:]{0,24}?\b(?:be|include|comprise)\b\s*([^.;:]{0,140})/g,
  /eligible\s+(?:applicants?|beneficiar(?:y|ies)|claimants?|entit(?:y|ies)|bodies|organisations?|borrowers?|enterprises?|businesses|are)\s*(?:are|is|include)?\s*([^.;:]{0,140})/g,
  /(?:open to|restricted to|limited to|reserved for|available to|granted to|intended for|addressed to|aimed at)\s+([^.;:]{0,140})/g,
  /\b(?:only|exclusively)\s+([^.;:]{0,140}?)\s+(?:may|can|are eligible|is eligible|qualify)/g,
  // "X are eligible", "X is the eligible claimant", "X may apply/receive/submit"
  /(?:^|\.\s+)([^.;:]{0,140}?)\s+(?:are|is|may|can)\s+(?:the\s+)?(?:eligible|apply|receive|submit|participate|qualify)/g,
  /\b(?:eligible|target group)\s+(?:are|is)\s+([^.;:]{0,140})/g,
];

/**
 * The organisation-type FAMILIES, each named by the head nouns the corpus uses
 * for it. Every token here was read off the slot scan; none was invented, and
 * none names a fund, a country or a sector.
 *
 * `anti` tokens are the corpus's own way of saying a family is NOT this one
 * ("a legal person NOT carrying out economic activity" is the corpus telling
 * us the non-economic kind is a distinct demand from the economic one).
 */
export const FAMILIES: { key: string; any: RegExp; note: string }[] = [
  { key: "company",
    any: /\b(?:enterprise|undertaking|compan(?:y|ies)|business(?:es)?|firm|entreprise|onderneming|economic operator|aktiebolag|corporation|corporate entity|commercial (?:enterprise|econom)|taxpayer)/,
    note: "an entity constituted to carry on an economic activity" },
  { key: "sole_trader",
    any: /\b(?:natural person|self-?employed|sole trader|sole proprietor|individual(?:s)? (?:carrying out|intending|exercising)|physical person|entrepreneur|freelanc|co-?entrepreneurship|mitunternehmerschaft|partnership itself)/,
    note: "an individual carrying on an economic activity in their own name" },
  { key: "research_org",
    any: /\b(?:universit|research (?:institut|organi[sz]|org\b|centre|center|establishment|performing|bod)|research and knowledge|knowledge[- ]dissemination|higher education|academi|\brto\b|technology cent|hochschule|scientific institut)/,
    note: "a body constituted to perform or disseminate research" },
  { key: "public_body",
    any: /\b(?:public(?:-| )(?:law )?bod|public authorit|public sector|local authorit|municipalit|\bcommune|intercommunalit|\bdepartement|region(?:al)? authorit|state (?:body|authority|administration)|government(?:al)? bod|public administration|public entit|public institution|federal administration|public establishment|public organi[sz]|state capital compan|public (?:or private )?(?:legal )?(?:entit|bod|person))/,
    note: "a territorial or state body constituted under public law" },
  { key: "nonprofit",
    any: /\b(?:associations?\b|associaz|associaci|asbl\b|non-?profit|not-?for-?profit|foundation|fondation|fondazione|stiftung|charit|voluntary organi[sz]|\bngo\b|civil society|co-?operative|mutual societ|social enterprise|trust established)/,
    note: "an entity constituted for a purpose other than distributing profit" },
];

/**
 * THE ONE FOLD, and it is made BY THE PROPERTY rather than for convenience.
 *
 * The corpus draws a sixth distinction — "a legal person NOT carrying out an
 * economic activity" — and it is tempting to make it a sixth option. It fails
 * test (1), INVARIANCE: whether an entity carries on an economic activity is a
 * fact about what it is currently DOING, and it starts and stops. A university
 * that begins selling services becomes an undertaking without being
 * reconstituted. It is therefore a status, not a constitutional kind, and it is
 * also the one thing on this list a founder cannot answer instantly — it is a
 * state-aid lawyer's question with a form control's face on.
 *
 * So it is not an option. It is a DEMAND, and it is expressed in the kinds it
 * admits: the constitutional kinds that are typically non-economic. The error
 * this can make is admitting a non-profit that does trade — which shows a
 * founder a fund they may not qualify for, rather than hiding one from a
 * founder who does. That is the direction this repo has always chosen, because
 * a hidden fund is the harm and a shown one is a wasted click.
 */
const NON_ECONOMIC = /\blegal person not carrying out (?:an )?economic|non-?economic (?:legal )?(?:person|entit|activit)|legal entit(?:y|ies) not (?:carrying|engaged)/;
const NON_ECONOMIC_KINDS = ["research_org", "public_body", "nonprofit"];

/** Tokens that say the sentence is about SIZE, TERRITORY, ACTIVITY or STATUS,
 *  i.e. a demand some OTHER intake field already carries. Present so that the
 *  detector's precision can be reported honestly rather than assumed. */
const SIZE = /\b(?:sme|smes|small and medium|micro|medium-?sized|large enterprise|mid-?cap|employees|headcount|turnover|balance[- ]sheet|fewer than \d)\b/;
const STATUS = /\b(?:in difficulty|recovery (?:order|decision)|insolven|bankrupt|winding up|sanction|tax arrears|accumulated losses)\b/;

export type Detected = { types: Set<string>; sizeOnly: boolean; slotHit: boolean };

/** Does this requirement DEMAND an organisation type, and which does it admit? */
export function detect(requirement: string): Detected {
  const t = requirement.replace(/\s+/g, " ").toLowerCase();
  const types = new Set<string>();
  let slotHit = false;
  const slots: string[] = [];
  for (const re of KIND_SLOT) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      // A NEGATED slot is an exclusion, not a demand: "aid may NOT be granted
      // to businesses in <activity>" names an activity the scheme refuses, and
      // reading it as "the applicant must be a business" is exactly backwards.
      const lead = t.slice(Math.max(0, m.index - 40), m.index + (m[0].length - m[1].length));
      if (/\bnot\b|\bno longer\b|\bexcept\b|\bcannot\b|\bineligible\b/.test(lead)) continue;
      slots.push(m[1]); slotHit = true;
    }
  }
  // A status sentence is never an organisation-type demand, however it is
  // phrased: an entity enters and leaves difficulty, so it fails INVARIANCE.
  if (STATUS.test(t)) return { types, sizeOnly: false, slotHit: false };
  const hay = slots.length ? slots.join(" || ") : "";
  for (const f of FAMILIES) if (hay && f.any.test(hay)) types.add(f.key);
  // ── A SIZE WORD IS ALSO A KIND WORD, and missing that hides funds ───────
  // "Applicant must be an SME or a natural person carrying out an economic
  // activity" was read as sole-trader-only, because "SME" is a size term and
  // nothing else in the sentence named a company. So a founder answering
  // "company" — which every SME is — would have been REJECTED by a gate that
  // plainly admits them. That is the Innovate UK defect exactly: a rule
  // demanding a value the qualifying applicant cannot select.
  //
  // The property resolves it without a special case. An SME and a large
  // enterprise are the SAME constitutional kind at two sizes: the size is
  // fteBand's business, and the kind the sentence has named is `company`. So
  // any enterprise-size term admits `company`, and the threshold it carries is
  // left where it belongs.
  if (hay && SIZE.test(hay)) types.add("company");
  // The corpus's explicit negative, folded into the kinds it admits. See
  // NON_ECONOMIC above for why this is not a sixth option.
  if (hay && NON_ECONOMIC.test(hay)) for (const k of NON_ECONOMIC_KINDS) types.add(k);
  // `sizeOnly` now means: the sentence names a size and NOTHING ELSE about the
  // kind — the pure fteBand case, kept as the control arm in _wsch_ceiling.
  const sizeOnly = SIZE.test(hay) && types.size === 1 && types.has("company");
  return { types, sizeOnly, slotHit };
}

if (process.argv[1]?.endsWith("_wsch_derive.ts")) (async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const ids = readPub();
  const all = await loadGates(db, ids);
  const filters = all.filter((r) => r.role === "filter");
  const cid = canopy(filters, TAU);
  const clusterOf = new Map<GateRow, number>();
  filters.forEach((r, i) => clusterOf.set(r, cid[i]));

  console.log(`filter gates ${filters.length} on ${new Set(filters.map((r) => r.iid)).size} instruments\n`);

  // ── 1. WHAT THE SLOT SAYS ────────────────────────────────────────────────
  let slotGates = 0, orgGates = 0, sizeOnlyGates = 0;
  const perFamilyGates = new Map<string, number>();
  const perFamilyInst = new Map<string, Set<string>>();
  const orgInst = new Set<string>();
  const orgClusters = new Set<number>();
  const perInst = new Map<string, Set<string>>();   // instrument -> admitted types
  const encodedOrg = { yes: 0, no: 0 };
  for (const r of filters) {
    const d = detect(r.requirement);
    if (d.slotHit) slotGates++;
    if (d.sizeOnly) sizeOnlyGates++;
    if (!d.types.size) continue;
    orgGates++;
    orgInst.add(r.iid);
    orgClusters.add(clusterOf.get(r)!);
    if (r.spec != null) encodedOrg.yes++; else encodedOrg.no++;
    for (const k of d.types) {
      perFamilyGates.set(k, (perFamilyGates.get(k) ?? 0) + 1);
      (perFamilyInst.get(k) ?? perFamilyInst.set(k, new Set()).get(k)!).add(r.iid);
    }
    const s = perInst.get(r.iid) ?? perInst.set(r.iid, new Set()).get(r.iid)!;
    for (const k of d.types) s.add(k);
  }
  console.log(`gates whose sentence names WHAT THE APPLICANT MUST BE : ${slotGates}`);
  console.log(`  ... of which demand an ORGANISATION TYPE            : ${orgGates} on ${orgInst.size} instruments, ${orgClusters.size} demand clusters`);
  console.log(`  ... of which name only a SIZE band (fteBand's job)  : ${sizeOnlyGates}`);
  console.log(`  organisation-type gates already carrying a comparator: ${encodedOrg.yes} of ${orgGates}\n`);

  console.log("OPTION SET, derived — each line is a distinction the corpus itself draws");
  console.log("key".padEnd(28) + "gates".padStart(7) + "instruments".padStart(13) + "  what it is");
  for (const f of FAMILIES) {
    console.log(f.key.padEnd(28) + String(perFamilyGates.get(f.key) ?? 0).padStart(7) +
      String(perFamilyInst.get(f.key)?.size ?? 0).padStart(13) + "  " + f.note);
  }

  // ── 2. IS THE ANSWER DISCRIMINATIVE? ─────────────────────────────────────
  // A field only ranks if leaves in the SAME regime demand DIFFERENT sets.
  const { rows } = await db.query(
    `SELECT id, parent_id FROM funding_instruments`);
  const pop = ids ? rows.filter((r) => ids.has(String(r.id))) : rows;
  const byRegime = new Map<string, string[]>();
  for (const r of pop) {
    const p = String(r.parent_id ?? r.id);
    (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(String(r.id));
  }
  const multi = [...byRegime.entries()].filter(([, g]) => g.length > 1);
  let regimesSplit = 0, leavesInSplit = 0;
  for (const [, g] of multi) {
    const sigs = new Set(g.map((id) => [...(perInst.get(id) ?? [])].sort().join("+")));
    if (sigs.size > 1) { regimesSplit++; leavesInSplit += g.length; }
  }
  console.log(`\nmulti-leaf regimes ${multi.length}; regimes where SIBLINGS DEMAND DIFFERENT ` +
    `organisation types: ${regimesSplit} (${leavesInSplit} leaves)`);

  // ── 3. SAMPLES, so a reader can check the detector rather than trust it ──
  console.log("\nSAMPLE — 20 gates the detector calls organisation-type demand");
  const orgRows = filters.filter((r) => detect(r.requirement).types.size);
  for (const r of orgRows.filter((_, i) => i % Math.max(1, Math.floor(orgRows.length / 20)) === 0).slice(0, 20)) {
    console.log(`  [${[...detect(r.requirement).types].sort().join(",")}] ${r.requirement.replace(/\s+/g, " ").slice(0, 120)}`);
  }
  console.log("\nSAMPLE — 12 gates in the applicant-kind slot the detector calls NOT organisation type");
  const nonRows = filters.filter((r) => { const d = detect(r.requirement); return d.slotHit && !d.types.size; });
  for (const r of nonRows.filter((_, i) => i % Math.max(1, Math.floor(nonRows.length / 12)) === 0).slice(0, 12)) {
    console.log(`  ${r.requirement.replace(/\s+/g, " ").slice(0, 120)}`);
  }

  if (OUT) {
    writeFileSync(OUT, JSON.stringify(Object.fromEntries(
      [...perInst].map(([k, v]) => [k, [...v].sort()]))));
    console.log(`\nwrote per-instrument organisation-type demand -> ${OUT}`);
  }
  await db.end();
})();
