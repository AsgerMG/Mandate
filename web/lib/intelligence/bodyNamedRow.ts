/**
 * IS THIS ROW NAMED AFTER THE BODY THAT GRANTS IT? THE definition — one place.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *
 *   A ROW MAY NOT BE OFFERED UNDER THE NAME OF THE BODY THAT GRANTS IT,
 *   UNLESS AN OFFICIAL SOURCE SAYS THAT IS THE OBJECT'S OWN NAME.
 *
 * ── The test, for a row nobody here has seen, in a language nobody here reads
 *
 * Two independently sourced strings already sit on every row. `name` is what a
 * founder is shown. `administeringBody` is a majority vote over the granting
 * authority published on each individual AWARD — a different column, from the
 * register's own filings, never from the naming pass. Fold both (NFKD, strip
 * combining marks, lowercase, everything that is not a letter or a digit IN ANY
 * SCRIPT to a space) and compare.
 *
 * If they are the SAME STRING, the name carries nothing the body column does
 * not already carry. The row has no identity of its own: a founder reading it
 * learns only who signs the cheque, and no sibling of the same scheme granted
 * by a different body can be told apart from it on anything they can read.
 *
 * The escape clause is the whole of the judgement, and it is not a guess:
 * `nameSource` records WHO named the row, and a row named by an official source
 * that happens to name it after its agency is correctly named. Three Greek
 * leaves are exactly that — the register's own registered title for the scheme
 * IS the granting authority string the filing carries. A rule without the
 * clause would call all three a defect. A rule that is only the clause
 * (`nameSource === "deterministic"`) selects 372 rows, nearly all of them real
 * funds. Neither half decides anything alone; the conjunction decides all 30.
 *
 * ── Why this is relational and not a word list ────────────────────────────
 * Because a word list cannot be written. `applyableBody.ts` holds this repo's
 * best department-designator register — eight morphemes, compound-aware,
 * derived from a real rendered brief — and it is BLIND to the majority of this
 * defect's instances. Measured on the live corpus 2026-08-17:
 *
 *     "Ministère de l'économie et des finances"   designator hit
 *     "Finanzamt Aachen-Stadt"                    MISS (a tax office)
 *     "Zentralfinanzamt Nürnberg"                 MISS
 *     "MFW SL"                                    MISS (an initialism)
 *
 * Eighteen of the twenty-two rows this caught in Germany are named after a
 * Finanzamt or an initialism, and no register of words reaches them without
 * being extended per country forever. The relation reaches all of them and
 * needs to know no language at all — which is the point: the row that arrives
 * next year from a member state nobody here reads is caught the day it lands.
 *
 * ── What this deliberately does NOT claim ─────────────────────────────────
 * It says nothing about a row whose name merely CONTAINS its body's name, nor
 * about a row with no `administeringBody` to compare against. Both are real
 * shapes of the same disease and neither is decidable from the two columns
 * without guessing at what a partial overlap means. It decides the case it can
 * decide exactly, and is silent on the rest — the same discipline as
 * `applyableBody.ts`'s Latin-script caveat.
 *
 * A leaf module: no imports outside `lib/intelligence` leaves, so a
 * "use client" component may import it. See lib/intelligence/ARCHITECTURE.md.
 *
 * Found by wsHF, 2026-08-17. project-mgmt/findings/body_named_rows_wsHF.md.
 */
import { NAME_SOURCE } from "./nameEvidence";

/**
 * Case-, accent- and punctuation-insensitive, IN EVERY SCRIPT.
 *
 * `applyableBody.fold()` is the repo's other folder and this is deliberately
 * not it. That one ends `.replace(/[^a-z0-9 ]+/g, " ")`, which is correct for
 * what it does — it feeds a Latin-script morpheme register and states that
 * limit in its own header — but it maps a Bulgarian agency name, and a Greek
 * one, to the EMPTY STRING. Reusing it here made this rule return `false` for
 * two identical Cyrillic strings, silently, via the missing-column guard: the
 * exact "a row in a language nobody here reads goes unnoticed" failure the rule
 * exists to prevent. Caught by the invented-cases test, not by a real row.
 *
 * `\p{L}` and `\p{N}` are the whole difference. Nothing about this rule is
 * lexical, so nothing about it needs to know which alphabet it is looking at.
 */
export function foldAnyScript(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The minimum a row must expose to be judged, so Postgres rows, the JSON
 *  snapshot and the SQLite rows can all satisfy it. */
export interface BodyNamedFacts {
  name?: string | null;
  administeringBody?: string | null;
  nameSource?: string | null;
}

/**
 * `nameSource` values that cite something OUTSIDE this project for the name.
 *
 * Stated as "which sources are official" rather than "which are not", because
 * a new `nameSource` added tomorrow must default to NOT excusing the collision:
 * an unrecognised value means nobody has said where the name came from, and the
 * collision with the granting body stands until somebody does.
 *
 * `deterministic` is absent on purpose — it means WE composed the string, and
 * composing the granting body's name is precisely the defect. `partition_key`
 * is absent for the same reason and is withheld from the pool anyway.
 */
const OFFICIALLY_NAMED: ReadonlySet<string> = new Set<string>([
  NAME_SOURCE.curated, // a human read the body's own page and wrote this
  NAME_SOURCE.programmeFeed, // the feed's own word for the object
  NAME_SOURCE.caseRegister, // the Commission's registered title
]);

/** Does an official source vouch for this row's name? */
export function officiallyNamed(row: BodyNamedFacts): boolean {
  return !!row.nameSource && OFFICIALLY_NAMED.has(row.nameSource);
}

/**
 * Is this row shown under the name of the body that grants it?
 *
 * `true` is a DEFECT: the row is unreadable as a fund and unrankable against
 * any sibling, because the only thing its name says is who administers it.
 */
export function namedAfterItsGrantingBody(row: BodyNamedFacts): boolean {
  const name = foldAnyScript(row.name ?? "");
  const body = foldAnyScript(row.administeringBody ?? "");
  if (!name || !body) return false;
  if (name !== body) return false;
  return !officiallyNamed(row);
}

/** Every row in `rows` that is shown under its granting body's name. */
export function bodyNamedRows<T extends BodyNamedFacts>(rows: readonly T[]): T[] {
  return rows.filter((r) => namedAfterItsGrantingBody(r));
}

/** Why this row fails, in one sentence, for a check's error output. */
export function whyBodyNamed(row: BodyNamedFacts): string | null {
  if (!namedAfterItsGrantingBody(row)) return null;
  return (
    `is shown as ${JSON.stringify(row.name)}, which is exactly the name of the ` +
    "body its awards were granted by, and no official source vouches for it " +
    `(nameSource=${JSON.stringify(row.nameSource ?? null)})`
  );
}
