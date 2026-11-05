// wsCH — STEP 3: can organisation type be PRE-FILLED, so it costs the founder
// nothing?
//
// Region is the only question this project has added that moved a ceiling, and
// the reason is not that region is important — it is that region ARRIVED
// ALREADY ANSWERED, derived from the register, with the founder only glancing
// at it. A question that has to be filled in is a tax on completion; a question
// that has to be corrected is not.
//
// ── THE DERIVATION, as a property rather than a list ──────────────────────
//
// Across the corpus's jurisdictions, company law requires the ENTITY
// DESIGNATOR — the legal form — to appear in the registered name. That is why
// "GmbH", "Oy", "S.r.l." and "e.V." are in a name at all: they are not
// decoration, they are the statutory declaration of what the entity IS.
//
//   TEST for an unseen designator D in name N:
//     D is an entity designator iff removing D leaves a name that still
//     identifies the entity, and D is drawn from the closed set the entity's
//     jurisdiction of registration permits. Brand words fail this: removing
//     them changes which entity is named.
//
// So the pre-fill is: read the designator out of the name the founder has
// ALREADY TYPED as the first field of the form, and map it to the option set.
// It costs the founder nothing and it costs us no question slot.
//
// ── WHERE THE DESIGNATOR TABLE COMES FROM ─────────────────────────────────
// It is NOT written here. `ETL/lib/merge_stoplist.py` already carries a
// multilingual designator register — LEGAL and ORG — built for the merge
// pipeline precisely because these tokens must never anchor a brand match.
// The same tokens that must never identify an entity are exactly the tokens
// that identify its KIND. This file reads that file, so there is one register
// and not two that drift.
//
// ── WHAT THIS MEASURES ────────────────────────────────────────────────────
// Coverage, on 163k real European company names in the corpus, and agreement
// with the corpus's own `entity_type` where it has one. A pre-fill is only
// worth having if it is usually right and usually present.
//
// FREE. Reads the local sqlite corpus. No model calls, no network.
//
// Run from website/frontend:  npx tsx scripts/_wsch_prefill.ts
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "../capital");

/** Pull a named python set literal out of the shared designator register. */
function readSet(name: string): Set<string> {
  const src = readFileSync(path.join(ROOT, "ETL/lib/merge_stoplist.py"), "utf8");
  const m = new RegExp(`^${name}\\s*=\\s*\\{([\\s\\S]*?)^\\}`, "m").exec(src);
  if (!m) throw new Error(`${name} not found in ETL/lib/merge_stoplist.py — the shared register moved`);
  return new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

/**
 * The map from designator to organisation type. The KEYS are not written here:
 * every one of them must be present in the shared register, and the assertion
 * below fails the run if one is not — so this file cannot invent a designator
 * the merge pipeline has never seen.
 *
 * The GROUPING is the derived property applied: a designator names a kind.
 */
const KIND: Record<string, string[]> = {
  // Bodies constituted under public law: the designator IS the territory-body word.
  public_body: ["comune", "commune", "ayuntamiento", "gemeinde", "kommune",
    "departement", "agglomeration", "metropole", "municipal", "ente", "agence",
    "agenzia", "agencia", "chambre", "camera", "chamber"],
  // Bodies constituted to perform or disseminate research.
  research_org: ["universita", "universite", "universidad", "universitat",
    "university", "uniwersytet", "univerzita", "ulikool", "hochschule", "ecole",
    "scuola", "escuela", "schule", "institut", "instituto", "institutul",
    "istituto", "cercetare", "ricerca", "investigacion", "recherche",
    "forschung", "vyzkumny", "ustav", "badawcza"],
  // Constituted for a purpose other than distributing profit.
  nonprofit: ["association", "associazione", "asociacion", "asbl", "fondation",
    "fondazione", "fundacion", "fundacio", "fundacja", "stiftung", "foundation",
    "cooperativa", "cooperative", "cooperatie", "kooperativ", "coop", "druzstvo",
    "vereniging", "syndicat", "sindicato", "federation", "federazione", "verband",
    "consorzio", "consorcio", "vsi"],
  // Constituted to carry on an economic activity: the statutory company forms.
  company: ["gmbh", "mbh", "ag", "kg", "kgaa", "ohg", "gbr", "ug", "se", "eg",
    "gesmbh", "sa", "sas", "sasu", "sarl", "sca", "snc", "scs", "sci", "eurl",
    "srl", "srls", "spa", "sapa", "scarl", "scrl", "sl", "slu", "slne", "sau",
    "slp", "lda", "sgps", "scl", "bv", "nv", "cv", "vof", "cvba", "bvba", "oy",
    "oyj", "ab", "asa", "aps", "ks", "hf", "ehf", "ltd", "limited", "plc", "llp",
    "llc", "inc", "corp", "teoranta", "kft", "zrt", "bt", "nyrt", "kkt", "spzoo",
    "zoo", "sro", "spol", "doo", "dd", "ood", "ad", "eood", "uab", "sia", "ou",
    "as", "ase", "doel", "spk", "spj", "ska", "akz", "pfa", "sociedad", "anonima",
    "limitada", "sociedade", "sabiedriba", "akcine", "bendrove"],
};

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** The pre-fill: what kind does this registered name declare itself to be?
 *  Returns null when the name carries no designator — which is a legitimate
 *  answer, not a failure, and is why the founder always sees the control. */
export function prefillFromName(name: string): string | null {
  const toks = norm(name).split(" ");
  // Most specific first: a name carrying both a purpose word and a company form
  // ("Fraunhofer-Gesellschaft ... e.V.", "Universitat ... GmbH") is the purpose
  // body, because the company form is how a public-purpose body is incorporated
  // in several jurisdictions and the purpose word is the discriminating one.
  for (const k of ["public_body", "research_org", "nonprofit", "company"]) {
    for (const t of toks) if (KIND[k].includes(t)) return k;
  }
  return null;
}

if (process.argv[1]?.endsWith("_wsch_prefill.ts")) {
  // ── the register is SHARED, and this proves it ──────────────────────────
  const shared = new Set([...readSet("LEGAL"), ...readSet("ORG"), ...readSet("GEO")]);
  const invented = Object.values(KIND).flat().filter((t) => !shared.has(t));
  if (invented.length) {
    console.error(`these designators are not in ETL/lib/merge_stoplist.py and would be an ` +
      `invented register: ${invented.join(", ")}`);
    process.exit(1);
  }
  console.log(`${Object.values(KIND).flat().length} designators, every one of them already in ` +
    `the shared multilingual register\n`);

  const db = path.join(ROOT, "data/db.sqlite");
  const out = execFileSync("sqlite3", [db, "-separator", "\t",
    "SELECT COALESCE(NULLIF(raw_name,''), canonical_name), COALESCE(entity_type,''), " +
    "COALESCE(country,'') FROM companies"], { maxBuffer: 1 << 30 }).toString();
  const lines = out.split("\n").filter(Boolean);

  let hit = 0;
  const byKind = new Map<string, number>();
  const byCountry = new Map<string, [number, number]>();
  // Agreement, where the corpus holds an independent opinion.
  let agree = 0, disagree = 0;
  const confusion = new Map<string, number>();
  for (const l of lines) {
    const [name, et, cc] = l.split("\t");
    const k = prefillFromName(name ?? "");
    const e = byCountry.get(cc) ?? [0, 0];
    e[1]++;
    if (k) { hit++; e[0]++; byKind.set(k, (byKind.get(k) ?? 0) + 1); }
    byCountry.set(cc, e);
    if (k && et === "research_org") { (k === "research_org" ? agree++ : disagree++); confusion.set(`research_org->${k}`, (confusion.get(`research_org->${k}`) ?? 0) + 1); }
    if (k && et === "company") { (k === "company" ? agree++ : disagree++); confusion.set(`company->${k}`, (confusion.get(`company->${k}`) ?? 0) + 1); }
  }
  console.log(`COVERAGE over ${lines.length} real European company names in the corpus`);
  console.log(`  a designator is present and maps to a kind: ${hit} (${(100 * hit / lines.length).toFixed(1)}%)`);
  for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1]))
    console.log(`    ${k.padEnd(14)} ${String(n).padStart(7)}  ${(100 * n / lines.length).toFixed(1)}%`);

  console.log(`\nAGREEMENT with the corpus's own entity_type, where it holds one`);
  for (const [k, n] of [...confusion].sort((a, b) => b[1] - a[1]).slice(0, 10))
    console.log(`  ${k.padEnd(34)} ${String(n).padStart(7)}`);
  console.log(`  agree ${agree}  disagree ${disagree}  ` +
    `(${(100 * agree / Math.max(1, agree + disagree)).toFixed(1)}%)`);

  console.log(`\nCOVERAGE by country, the twelve largest`);
  for (const [c, [w, n]] of [...byCountry].sort((a, b) => b[1][1] - a[1][1]).slice(0, 12))
    console.log(`  ${(c || "??").padEnd(4)} ${String(w).padStart(6)}/${String(n).padStart(6)}  ${(100 * w / n).toFixed(0)}%`);
}
