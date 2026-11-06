/**
 * May this row tell the founder HOW TO APPLY, and in whose name?
 *
 * The application route is the one line on a published row that is an
 * INSTRUCTION rather than an assessment. Everything else on the row is a
 * finding the founder can weigh; this is a thing they will go and do. It is
 * therefore the last place a wrong statement may stand, and the only one where
 * being wrong costs them the week rather than the read.
 *
 * ── What was actually being published ─────────────────────────────────────
 * `corpus.ts` resolves a leaf's route as its own, falling back to its parent
 * regime's. Over the 837 publishable rows, 736 carry a route and only 216 of
 * them were ever recorded about that fund: 520 are a parent's, drawn from just
 * 38 distinct parents. The corpus was publishing 38 curated paragraphs as 520
 * fund-specific instructions.
 *
 * They are not process descriptions that might generalise down a tree. Read
 * verbatim, they are ADDRESSEES: they name a project agency, a ministry's
 * e-headquarters, a development bank, a national competition, a statute. The
 * largest single cluster, 89 rows, names one federal project agency and a
 * two-stage outline procedure, and is inherited by regional programmes that
 * agency has nothing to do with. Another sends fourteen funds, one of them a
 * film and television scheme, to a development bank in a different Land.
 *
 * And the direction of the error is systematic. Measured across all 520
 * inherited rows, the parent is NEVER the more specific record: 375 children
 * name a different administering body, 190 name a delivery region where the
 * parent names none, 282 name scheme operators where the parent names none,
 * and parent-only differences are zero on every field. The regime row is an
 * abstract container. Inheritance replaces the specific with the generic and
 * then prints the generic as an instruction.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *
 *   A ROUTE IS A FACT ABOUT THE FUND IT WAS RECORDED FOR. A ROUTE RECORDED FOR
 *   THE PARENT IS EVIDENCE ABOUT THE PARENT. IT MAY BE REPEATED FOR A CHILD
 *   ONLY WHERE THE CHILD GIVES US NO REASON TO DOUBT IT, AND NEVER IN THE
 *   CHILD'S OWN NAME.
 *
 * This is the standing rule about official sources applied to the one field
 * that is an instruction: what a fund requires comes from that fund's source,
 * never inferred from its neighbours. Inference is how we got here.
 *
 * ── The test, for a fund nobody has looked at ─────────────────────────────
 * An inherited route is an addressee. The child usually knows who actually
 * administers it. So:
 *
 *   DOES THE INHERITED TEXT ADDRESS A BODY THIS FUND IS ACTUALLY ADMINISTERED
 *   BY?
 *
 * Where the child names its own administering body or its own scheme
 * operators, and the inherited text names none of them, the text is addressed
 * somewhere else and this row must not assert it. Where the child names no
 * body at all there is nothing to contradict, so the route stands — attributed
 * to the programme it was recorded for, never presented as this scheme's own.
 *
 * The test does not name a fund, a country, a sector or a body. It is a
 * comparison between two things the row already carries, and it decides a
 * scheme loaded tomorrow with no edit here.
 *
 * ── Withholding is not deletion ───────────────────────────────────────────
 * A withheld route removes a SENTENCE, never a row. The fund still publishes,
 * with everything else it holds. An unknown next step stated as unknown is
 * better than a confident wrong one; a missing row is a fund the founder never
 * sees, and that trade is not available here.
 */

/** The three things `instrument_application` records, plus who it recorded
 *  them about. */
export interface RouteRecord {
  channel?: string | null;
  timeline?: string | null;
  url?: string | null;
}

export interface RouteInput {
  /** The resolved route: the fund's own where it has one, else its parent's. */
  application?: RouteRecord | null;
  /** True when `application` was recorded for THIS fund. */
  applicationOwn?: boolean;
  /** The fund's own submission link, from its own column. Independent of the
   *  curated route and, until now, never read: 88 publishable rows carry one
   *  and every single one of them has no curated route at all, so the memo
   *  reached for a parent's paragraph while the fund's own link sat unused. */
  ownApplicationUrl?: string | null;
  /** Who actually administers this fund. */
  administeringBody?: string | null;
  /** Bodies that disburse under this fund's scheme. */
  schemeOperators?: string[] | null;
  /** The parent regime's display name, for attribution. */
  parentName?: string | null;
}

export type RouteProvenance =
  /** Recorded about this fund. Publishable as its own instruction. */
  | "own"
  /** Recorded about the parent regime and not contradicted by anything this
   *  fund records. Publishable, attributed to the programme. */
  | "programme"
  /** Recorded about the parent regime and contradicted: the text addresses a
   *  body this fund is not administered by. Not publishable. */
  | "withheld"
  /** Nothing recorded anywhere. */
  | "none";

export interface ResolvedRoute {
  /** The instruction, or undefined where none may be published. */
  channel?: string;
  /** The window. Inherited at exactly the same rate as the addressee — 520 of
   *  520 — and a deadline claim taken from another fund is worse than a wrong
   *  address, because it is what a founder plans around. It travels with the
   *  channel and is withheld with it. */
  timeline?: string;
  /** The link. The fund's own column wins over the route's, always. */
  url?: string;
  provenance: RouteProvenance;
  /** Set on `programme`: whose route this is, so the row can say so. */
  recordedFor?: string;
  /** Set on `withheld`: why, in the terms the row itself carries. Reads as a
   *  DATA defect, which is what it is. */
  withheldBecause?: string;
}

/** Fold for comparing an institution name against free prose: case, accents
 *  and punctuation are noise here, and a body named inside a longer sentence
 *  is still named. */
function fold(s: string): string {
  return s
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Words that identify nobody. A body's name minus these is what actually
 *  distinguishes it, and matching on them would let "Ministry of Anything"
 *  vouch for "Ministry of Something Else".
 *
 *  Stated as a property rather than a register of institutions: these are the
 *  ORGANISATIONAL FORM words shared across the corpus's naming conventions,
 *  not the names of any body. A form word identifies what kind of thing it is;
 *  the rest identifies which one. */
const FORM_WORDS = new Set([
  "the", "of", "and", "for", "de", "der", "die", "das", "des", "den", "du", "la",
  "le", "les", "el", "il", "van", "voor", "en", "und", "fur", "et", "da", "do",
  "agency", "agentschap", "agence", "agencia", "agenzia", "authority", "bank",
  "body", "bureau", "council", "department", "directorate", "fund", "fonds",
  "gmbh", "government", "institute", "ministerie", "ministerio", "ministero",
  "ministry", "ministerium", "office", "organisation", "organization", "programme",
  "program", "province", "provincie", "regional", "region", "service", "state",
  "gesellschaft", "mbh", "ag", "sa", "srl", "bv", "nv", "ab", "as", "oy",
]);

/** The distinguishing tokens of an institution name. */
function identifyingTokens(name: string): string[] {
  return fold(name).split(" ").filter((t) => t.length >= 3 && !FORM_WORDS.has(t));
}

/**
 * The names one institution may legitimately be addressed by.
 *
 * A corpus body arrives as a full title, often with a qualifier in brackets:
 * a country, a translation, an expansion of an acronym. Any of those forms is
 * a real address, and requiring the whole string would withhold a route that
 * names the body perfectly well under a different one of its own names — which
 * is a wrongly-withheld instruction, the error this file exists to avoid in the
 * other direction.
 *
 * So: the full string, the part before any bracket, the part inside it, and
 * any acronym the name itself carries. An acronym is recognised by SHAPE — a
 * run of capitals with no lower case — never by a list.
 */
function nameForms(body: string): string[] {
  const forms = [body];
  const m = /^([^(]+?)\s*\(([^)]+)\)/.exec(body.trim());
  if (m) forms.push(m[1], m[2]);
  for (const tok of body.split(/[^\p{L}\p{N}]+/u)) {
    if (tok.length >= 3 && tok === tok.toUpperCase() && /\p{L}/u.test(tok)) forms.push(tok);
  }
  return forms.filter((f) => f.trim().length > 0);
}

/**
 * Does this prose address that body?
 *
 * True when, under at least one of the names the body goes by, every
 * distinguishing token of that name appears in the text. ALL of them under one
 * form, not any across forms: a body sharing one word with the text has not
 * been addressed, and one-word overlaps are exactly how a national ministry
 * comes to vouch for a provincial agency, or one ministry for another.
 *
 * A form with NO distinguishing tokens — a name made entirely of form words —
 * cannot be matched either way, so it cannot contradict. Treating it as
 * addressed is the conservative direction: it declines to withhold on no
 * evidence.
 */
export function addresses(text: string, body: string): boolean {
  const haystack = ` ${fold(text)} `;
  return nameForms(body).some((form) => {
    const tokens = identifyingTokens(form);
    if (!tokens.length) return true;
    return tokens.every((t) => haystack.includes(` ${t} `) || haystack.includes(`${t} `));
  });
}

/**
 * The route this row may publish, and in whose name.
 */
export function resolveRoute(input: RouteInput): ResolvedRoute {
  // The fund's own link is a fact about the fund whatever happens to the
  // route text, so it is resolved first and survives a withheld route.
  const ownUrl = input.ownApplicationUrl?.trim() || undefined;
  const app = input.application;
  const channel = app?.channel?.trim() || undefined;
  const timeline = app?.timeline?.trim() || undefined;
  const routeUrl = app?.url?.trim() || undefined;

  if (!channel && !timeline) {
    return { provenance: "none", url: ownUrl };
  }
  if (input.applicationOwn) {
    return { provenance: "own", channel, timeline, url: ownUrl ?? routeUrl };
  }

  // Inherited. Everything this fund records about who runs it gets a say.
  const claimants = [
    input.administeringBody ?? "",
    ...(input.schemeOperators ?? []),
  ].map((s) => String(s ?? "").trim()).filter(Boolean);

  if (!claimants.length) {
    // Nothing to contradict it. Publishable, attributed.
    return {
      provenance: "programme", channel, timeline, url: ownUrl ?? routeUrl,
      recordedFor: input.parentName?.trim() || undefined,
    };
  }
  const addressed = claimants.find((b) => addresses(channel ?? "", b));
  if (addressed) {
    return {
      provenance: "programme", channel, timeline, url: ownUrl ?? routeUrl,
      recordedFor: input.parentName?.trim() || undefined,
    };
  }
  // The text addresses somebody else. The row keeps its own link, because that
  // is the fund's own column and is not in doubt.
  return {
    provenance: "withheld",
    url: ownUrl,
    withheldBecause:
      `the only route on record was written for ${input.parentName?.trim() || "the wider programme"} ` +
      `and does not address ${claimants[0]}, which runs this scheme`,
  };
}
