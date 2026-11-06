// WHETHER A STRING NAMES A DOOR — the machine half of FUND-7.
//
// ── The defect this exists to make impossible ─────────────────────────────
// FUND-7 has said "a government department administers schemes; it is not
// itself a door" since the contract was written, and it says the rule "holds
// wherever the name appears, prose included". What enforced it was one regex,
// anchored at the start of the string, tested against one field:
//
//     /^(minist\w*|department|departement|dipartimento|direction g[eé]n[eé]rale)\b/i
//
// A real six-row brief was rendered and read in a browser (wsCX, 2026-08-10).
// Its institution column carried German scheme TITLES ending in the notifying
// ministry's file reference -- "... [BMWK, IVA3]", "... [BMBF]", "... [BMDV]".
// `checkBrief` returned []. The check had never fired on the case the contract
// was written about, for three independent reasons, and every one of them is a
// property the regex could not express:
//
//   1. POSITION.  `^` asks where the word is. The property does not.
//   2. COMPOUNDING. `minist\w*` matches "Ministerie" and "Ministero" and
//      cannot match "Bundesministerium" or "Wirtschaftsministeriums", because
//      in German, Finnish, Hungarian and the Nordic languages the department
//      word is the TAIL of a compound. Measured on the live corpus: 14 distinct
//      administering bodies over 49 publishable leaves are departments the
//      anchored regex reads as ordinary bodies, including the two ministries
//      that notify most German R&D aid.
//   3. FIELD.  It ran on `institution` only, so the bullet the contract itself
//      gives as a failing example -- "start with the federal ministry" -- was
//      never looked at.
//
// And there is a fourth, which is why this file is not simply a better regex:
// `displayInstitutionName` uses the SAME predicate to decide whether to rename
// a row away from its ministry. A check that asks the same question the
// producer already asked can only ever confirm the producer's own answer. The
// tests below therefore ask about the PUBLISHED STRING, not about the row's
// administering body, so they can catch a name the renamer let through.
//
// ── THE PROPERTY, with a test for cases nobody has seen ───────────────────
//
// A string NAMES A DOOR when a founder could contact what it names about this
// money and get a reply. Three ways a string fails that, each stated as a test
// rather than as a list of the strings we happen to have met:
//
//   TEST 1 — DESIGNATION.  The string designates a government department.
//     A department DESIGNATOR is a morpheme that names the department
//     institution itself in some language of the corpus. It designates when it
//     appears as a whole word OR as the head or tail of a compound word,
//     ANYWHERE in the string.
//
//     "Head or tail of a compound" is decided, not enumerated: the designator
//     must begin the token, or begin at an offset of at least
//     COMPOUND_PREFIX_MIN letters. That threshold is the whole rule and it is
//     morphological, not lexical -- a compounding element is a WORD ("bundes-",
//     "wirtschafts-", "penzugy-", "naerings-") and a word is at least three
//     letters, while a designator sitting behind one or two letters is inside a
//     bound morpheme that changed the root rather than compounded onto it. That
//     single test is what separates "Bundesministerium" (accept, prefix
//     "bundes") from "administration" (reject, prefix "ad" -- ad+ministrare,
//     which names an ACTIVITY and not an institution). No exception list, and
//     an unseen language compounds correctly or is rejected for a stated reason.
//
//   TEST 2 — ANNOTATION.  The string is a document carrying the register's note
//     of WHO ISSUED IT, rather than the name of a body.
//     The test the contract implies: if removing the bracket leaves a string
//     that still identifies the same thing, the bracket was an annotation about
//     the thing and not part of its name. Machine form: a trailing square
//     bracket whose content contains NO ORDINARY WORD -- every token in it is
//     an abbreviation, an acronym or a code. "[BMWK, IVA3]" and "[BY]" are
//     annotations; "[Agency for Trade]" is not, and neither is a parenthesised
//     trading acronym, "Institut Català de Finances (ICF)", which is why only
//     square brackets are read this way. That is the register's convention and
//     it is the one this corpus uses.
//
//   TEST 3 — DIRECTION.  Prose sends the founder AT a department.
//     FUND-7 holds "wherever the name appears, prose included", and its own
//     failing example is a bullet reading "start with the federal ministry".
//     Scoped to prose that DIRECTS -- a designator standing as the object of an
//     instruction -- because prose may legitimately state who notified a
//     regime, and a check that cries wolf trains you to ignore the report
//     (see the header of briefChecks.ts).
//
// ── What this deliberately does not claim ─────────────────────────────────
// The designator register below is Latin-script. A department named only in
// Greek or Cyrillic is not detected, and that is stated rather than hidden: the
// corpus is Latin-script after NFKD folding for every country it currently
// holds, and the day it is not, this file fails loudly in a test rather than
// quietly in production. It is also not a claim that everything else IS a door
// -- it decides the cases it can decide and says nothing about the rest.
//
// Client-safe by construction: pure data and string functions, no fs, no pg.

/** The department designator morphemes, by language family of origin. This is a
 *  REGISTER, not a rule: the rule is TEST 1 above, which decides an unseen
 *  string, and the register only says which morphemes name the institution.
 *  Written as the shortest form that is unambiguous, because the compound test
 *  matches a token that BEGINS with the morpheme at a compound boundary --
 *  "minist" therefore covers ministero / ministère / ministerie / ministerium /
 *  ministerstvo / ministerstwo / ministeriö / ministerija / ministarstvo. */
export const DEPARTMENT_DESIGNATORS: readonly string[] = [
  "minist",     // romance, germanic, slavic, baltic, finnic
  "miniszt",    // hungarian
  "departement", // french, dutch, nordic (departementet)
  "departament", // catalan, spanish, romanian, polish
  "departamento",
  "department",  // english
  "dipartiment", // italian
  "ressort",     // german administrative unit
];

/** Multi-word designators, which no token test can see. Matched as phrases on
 *  the folded string. */
export const DEPARTMENT_PHRASES: readonly string[] = [
  "direction generale",
  "directorate general",
];

/**
 * The compound boundary, and the only threshold in this file.
 *
 * A designator inside a token is the tail of a compound when what precedes it
 * is itself a word. Three letters is the shortest thing that is a word in the
 * compounding languages here ("bio-", "eco-", "bau-"); one or two letters
 * before a Latin root is a bound morpheme that changes the root, which is
 * exactly the "ad-" in administration, administrative and administración.
 */
export const COMPOUND_PREFIX_MIN = 3;

/** Accent- and case-folded, punctuation to spaces. The same normalisation
 *  organisationType.ts uses, so a designator that survives one survives the
 *  other. */
export function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * TEST 1. Does this string designate a government department, anywhere in it?
 *
 * Whole word, head of a compound, or tail of a compound -- see COMPOUND_PREFIX_MIN
 * for the one rule that decides the last of those.
 */
export function designatesDepartment(text: string | null | undefined): boolean {
  const folded = fold(String(text ?? ""));
  if (!folded) return false;
  for (const phrase of DEPARTMENT_PHRASES) if (folded.includes(phrase)) return true;
  for (const token of folded.split(" ")) {
    for (const stem of DEPARTMENT_DESIGNATORS) {
      const at = token.indexOf(stem);
      if (at === 0) return true;
      if (at >= COMPOUND_PREFIX_MIN) return true;
    }
  }
  return false;
}

/** A token that is an ordinary word: letters only, at most its first letter
 *  capitalised, long enough not to be an abbreviation. Everything else --
 *  an acronym, a mixed-case short form, anything carrying a digit -- is a
 *  reference, and a bracket made only of references is an annotation. */
const ORDINARY_WORD = /^[A-Za-zÀ-ÿ][a-zà-ÿ]{3,}$/;

/**
 * TEST 2. Is this string a document carrying a trailing register annotation of
 * who issued it, rather than the name of a body?
 *
 * Returns the annotation's text, or null. Callers that PUBLISH use
 * `stripIssuerAnnotation`; the check uses the presence.
 */
export function issuerAnnotation(text: string | null | undefined): string | null {
  const s = String(text ?? "").trim();
  const m = s.match(/\[([^\]]{1,60})\]$/);
  if (!m) return null;
  const tokens = m[1].split(/[\s,;/·]+/).filter(Boolean);
  if (!tokens.length) return null;
  // One ordinary word and it is prose, not a reference.
  if (tokens.some((t) => ORDINARY_WORD.test(t))) return null;
  return m[1];
}

/** The same name with the register's issuer annotation removed. A no-op when
 *  there is none, which is the common case and not a failure. */
export function stripIssuerAnnotation(name: string): string {
  const ann = issuerAnnotation(name);
  if (!ann) return name;
  return name.replace(/\s*\[[^\]]*\]$/, "").trim();
}

/** Instruction verbs, as the property rather than as a phrase book: a verb that
 *  hands the reader somewhere to go. */
const DIRECTS =
  /\b(apply(?:ing)? (?:to|at|through|via)|contact|approach|speak to|talk to|reach out to|go to|start with|begin with|submit(?: your [a-z]+)? to|write to)\b/i;

/**
 * TEST 3. Does this prose send the founder at a department?
 *
 * True when an instruction and a department designator meet inside one
 * sentence. Sentence-scoped rather than paragraph-scoped so that "the regime is
 * notified by the federal ministry. Apply to the project agency." passes, which
 * is the honest sentence a brief should be able to write.
 */
export function directsAtDepartment(text: string | null | undefined): boolean {
  const s = String(text ?? "");
  if (!s.trim()) return false;
  for (const sentence of s.split(/(?<=[.!?;])\s+|\n+/)) {
    if (!DIRECTS.test(sentence)) continue;
    // Only the part FROM the instruction onwards: a sentence may name the
    // notifying department first and then send the reader somewhere real.
    const from = sentence.search(DIRECTS);
    if (designatesDepartment(sentence.slice(from))) return true;
  }
  return false;
}

/**
 * THE ONE SPELLING OF A DOOR — "<what it is> · via <who grants it>".
 *
 * Canonical here rather than in rowIdentity.ts, which re-exports it with the
 * evidence standard that justifies the word `via`, because FUND-7 has to be
 * able to SPLIT a published name back into its two halves and nothing lower in
 * the import graph than this file may do that. One definition, two spellings of
 * the import, which is this repo's rule.
 */
export const VIA = "via";
export const DOOR_JOIN = ` · ${VIA} `;

export function withDoor(name: string, body: string): string {
  return `${name}${DOOR_JOIN}${body}`;
}

/**
 * The two halves of a published institution name.
 *
 * A row may legitimately be "<the scheme, in the register's words> via <the
 * body that grants it>". FUND-7 judges each half for what it claims to be: the
 * BODY half must be a body, and the NAME half must not be a document wearing
 * the register's note of who issued it. Judging the whole string would fail a
 * row that quotes a regulation naming the ministry in its own title and then
 * correctly sends the founder to the agency that runs it, which is the most
 * useful row this product can publish about ministry-notified aid.
 */
export function splitDoor(name: string): { what: string; body: string | null } {
  const i = name.lastIndexOf(DOOR_JOIN);
  if (i < 0) return { what: name, body: null };
  return { what: name.slice(0, i), body: name.slice(i + DOOR_JOIN.length) };
}

/**
 * THE PREDICATE THE ROW IS JUDGED ON. A published institution name fails
 * FUND-7 when the body it names designates a government department, or when
 * what it names is a document wearing the register's note of who issued it.
 *
 * Named for what it decides rather than for what it rejects, so a caller
 * reading `if (!namesAnApplyableBody(x))` is reading the contract.
 */
export function namesAnApplyableBody(name: string | null | undefined): boolean {
  return whyNotApplyable(name) === null;
}

/** Why a name failed, for the violation detail a PM reads on the scoreboard. */
export function whyNotApplyable(name: string | null | undefined): string | null {
  const s = String(name ?? "").trim();
  if (!s) return "is empty";
  const { what, body } = splitDoor(s);
  // The body half is what the founder is told to approach. With no body half
  // the whole string is that claim.
  if (designatesDepartment(body ?? what)) {
    return "names a government department, which administers schemes rather than taking applications";
  }
  const ann = issuerAnnotation(what);
  if (ann) {
    return `carries the register's note of who issued the document ([${ann}]) in place of a body's name`;
  }
  return null;
}
