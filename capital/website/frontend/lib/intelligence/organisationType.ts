// WHAT KIND OF ORGANISATION THE APPLICANT IS — the largest demand in the
// corpus that the intake has never asked.
//
// ── THE PROPERTY, with a test for an unseen case ──────────────────────────
//
// An ORGANISATION TYPE is the constitutional kind of the applicant entity:
// what it is legally constituted AS, as recorded when it was registered.
//
//   TEST for a candidate distinction D:
//     (1) INVARIANCE.    D is a property of the entity alone. It does not
//         change if the project, the sector, the territory, the headcount,
//         the turnover or the amount asked for changes.
//     (2) ORTHOGONALITY. Two entities of the same D can differ arbitrarily in
//         size, age, place and activity. If D is decided by a threshold on a
//         number, D is a BAND and not an organisation type.
//     (3) READABILITY.   D can be read off the applicant's own registration
//         document with no judgement about what the project is.
//
// The three tests are what keep this field from re-absorbing questions the
// intake already asks. Excluded by them, even where one SENTENCE carries both:
//
//   SIZE       — SME vs large enterprise fails (2): it is a headcount and
//                turnover threshold on the same constitutional kind. This is
//                exactly where an earlier workstream lost this demand, by
//                reading the bucket as SME status and mapping it to `fteBand`.
//                A university is not a large enterprise and a commune is not
//                an SME; the corpus asks both questions and they are different.
//   TERRITORY  — fails (1) at the level of the field: `entityCountries` and
//                `region` already carry it.
//   ACTIVITY   — `sector` and `activities`.
//   STATUS     — insolvency, recovery orders, sanctions: `exclusionFlags`.
//                Fails (1); an entity enters and leaves them.
//   PROJECT SHAPE — consortium, lead partner: fails (1).
//
// ── WHY THIS IS THE FIRST QUESTION THAT COSTS NOTHING TO ASK ──────────────
//
// Across these jurisdictions, company law requires the ENTITY DESIGNATOR to
// appear in the registered name. That is what "GmbH", "Oy", "S.r.l." and "e.V."
// ARE: not decoration, but the statutory declaration of what the entity is. The
// founder has already typed their company name into the first field of the
// form, so the answer is usually already on the screen.
//
//   TEST for an unseen designator D in a name N: D is an entity designator iff
//   removing it leaves a name that still identifies the same entity, and D is
//   drawn from the closed set the jurisdiction of registration permits. Brand
//   words fail — removing them changes which entity is named.
//
// Measured on 163,545 real European company names in the corpus: a designator
// is present and maps to a kind for 47.3% of them (DE 86%, GB 89%, NO 86%,
// SE 73%; FR 12%, HU 10% — plenty of names genuinely omit the form), and where
// the corpus holds an independent opinion the two agree 95.9% of the time.
//
// IT IS A DEFAULT, NEVER A CLAIM — the same rule region's pre-fill follows.
// The control is always shown, the origin of the value is stated on screen,
// and the founder's edit wins outright.
//
// Client-safe by construction: pure data and one string function, no fs, no pg.
import { ORG_DESIGNATORS, ORG_DESIGNATOR_ORDER } from "./organisationDesignators.generated";

/** Same normalisation the corpus index uses, so a designator that survives one
 *  survives the other. */
function normalise(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * What kind does this registered name declare itself to be?
 *
 * `null` when the name carries no designator, which is a legitimate and common
 * answer rather than a failure — a sole trader trades under a personal name and
 * declares nothing, which is precisely the case the founder must answer for
 * themselves.
 */
export function prefillOrganisationType(name: string | undefined | null): string | null {
  if (!name) return null;
  const toks = normalise(name);
  if (!toks.length) return null;
  for (const kind of ORG_DESIGNATOR_ORDER) {
    const set = ORG_DESIGNATORS[kind];
    if (!set) continue;
    for (const t of toks) if (set.includes(t)) return kind;
  }
  return null;
}

/**
 * THE ARM. Default OFF, the same shape as OPEN_QUESTION_ARM and
 * SECTOR_CLIP_ARM, and read at module load so a measurement cannot drift
 * mid-run.
 *
 * "on" changes exactly one thing a founder can see: the opening form gains the
 * organisation-type control. With the arm off the control is not rendered, the
 * field is never populated, and every downstream path is inert — an unanswered
 * field reaches `evaluateSpec` as `undefined` and reads `null`, which is "not
 * assessable" and never a blocker.
 *
 * NEXT_PUBLIC_ because the control lives in a "use client" module; Next inlines
 * it at build time, which is also why it must never carry a secret.
 */
export type OrganisationTypeArm = "on" | "off";
export const ORGANISATION_TYPE_ARM: OrganisationTypeArm =
  process.env.NEXT_PUBLIC_ORGANISATION_TYPE_ARM === "on" ? "on" : "off";
