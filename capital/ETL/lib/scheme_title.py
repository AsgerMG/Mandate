"""What is the scheme behind this SA number actually called?

── The property ───────────────────────────────────────────────────────────
A ROW MAY NOT BE OFFERED UNDER THE NAME OF THE BODY THAT GRANTS IT, UNLESS AN
OFFICIAL SOURCE SAYS THAT IS THE OBJECT'S OWN NAME.

The product half of that rule, with its test for an unseen row, is
web/lib/intelligence/bodyNamedRow.ts; the build guard is
web/scripts/check_body_named_rows.ts. This file is the ETL half:
where the corpus violates the property, what does the register say instead.

── The defect this closes, and why it was NOT a missing feature ───────────
populate_funding_instruments.py already names 430 of 453 state-aid children
from the Commission's case register. Four SA numbers were deliberately skipped,
in `CASE_TITLE_NOT_A_SCHEME`, for a reason that is correct: the register record
those numbers resolve to is an EVALUATION PLAN, not an aid scheme, and naming a
fund "Germany - Evaluation plan for the block exempted R&D tax incentive
scheme" would be precise about the wrong thing.

What the skip did NOT do is leave those rows unnamed. It left them at the
loader's fallback, which is THE GRANTING BODY, and that is how twenty-two rows
reached founders reading "Finanzamt Aachen-Stadt", "MFW SL" and "Ministère de
l'économie et des finances". wsHA measured 28 of 287 sibling-miss pairs (9.8%)
with at least one door shown that way. A skip list with a good reason and no
assertion about its consequence is how a fix becomes a defect.

── The register already holds the answer, and we already parse the field ──
An evaluation-plan case is LINKED to the scheme it evaluates, in `caseLinks` --
the same field populate_funding_instruments.py already reads to redirect a
closed scheme to its successor. Verified against the register 2026-08-17, one
POST each:

    SA.56245 (plan) -> SA.114724  "Steuerliche Förderung von Forschung und Entwicklung [BMF]"
    SA.49781 (plan) -> SA.42139   "Intervento del fondo per la crescita sostenibile ..."
    SA.59366 (plan) -> SA.47101   "Régime de soutien français à l'innovation ... du transport aérien"
    SA.40391 (plan) <- SA.58995   "Régime cadre exempté ... (RDI) pour la période 2014-2023"

SA.40391 is why the link map is built BOTH WAYS. Its own record carries no
`caseLinks` at all; the link exists only on SA.58995's side. A forward-only
reading resolves three of four and silently leaves the fourth -- and the fourth
is the one with three offerable rows in France.

── Why this fires only where the property is violated ─────────────────────
It cannot rename a row the register has already named, because it never looks
at one. That bound is what makes it safe to run over the whole corpus: the
worst case is that it leaves a defect in place, which the build guard then
reports, and the best case is that it repairs one. It is also why this is not
a second naming pass competing with the first.

── What it refuses to do ──────────────────────────────────────────────────
Guess between two candidates. If a case links to more than one scheme record
the function returns None with a reason rather than picking. An unresolved row
keeps its wrong name and check_body_named_rows.ts goes red on it, which is a
loud failure a person settles from the register -- not a quiet one.

It also does not clean the register's strings. `[BMF]` is the Commission's own
issuer annotation and `nell''ambito` is a doubled-apostrophe artefact of their
export; both already exist on shipped rows named by this same register, and
laundering them here would smuggle a second, unrelated change into a bounded
one. What the official source publishes is what gets written. See the finding.
"""
from __future__ import annotations

import re
import unicodedata

_MARKS = re.compile(r"[̀-ͯ᪰-᫿⃐-⃰︠-︯]")
_NON_ALNUM = re.compile(r"[^\w\d]+", re.UNICODE)


def fold_any_script(s: str | None) -> str:
    """Case-, accent- and punctuation-insensitive, IN EVERY SCRIPT.

    The Python twin of `foldAnyScript` in bodyNamedRow.ts, and deliberately
    not a copy of any Latin-only folder in this repo: the first version of the
    TypeScript rule reused one, and it mapped a Bulgarian agency name to the
    empty string -- so two identical Cyrillic strings compared as "nothing to
    compare" and the defect went unseen. A rule about equality has no business
    knowing which alphabet it is looking at.
    """
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = _MARKS.sub("", s)
    s = s.lower()
    # `\w` under re.UNICODE is letters, digits and underscore in every script.
    s = re.sub(r"[^\w]+", " ", s, flags=re.UNICODE).replace("_", " ")
    return " ".join(s.split())


def named_after_its_granting_body(name: str | None, body: str | None) -> bool:
    """Does this row's displayed name say nothing but who granted the money?

    Silent (False) when either side is missing. Withholding or rewriting a row
    is a claim, and a corpus that has not filled in `administering_body` must
    not have every row in it called a defect.
    """
    n, b = fold_any_script(name), fold_any_script(body)
    return bool(n) and n == b


# The `name_source` values that cite something OUTSIDE this project. Stated as
# which sources ARE official rather than which are not, so a vocabulary added
# tomorrow defaults to NOT excusing a collision: an unrecognised value means
# nobody has said where the name came from. `deterministic` is absent on purpose
# -- it means WE composed the string, and composing the granting body's name is
# precisely the defect. The twin of OFFICIALLY_NAMED in bodyNamedRow.ts.
OFFICIALLY_NAMED = frozenset({"curated", "programme_feed", "case_register"})


def officially_named(name_source: str | None) -> bool:
    """Does an official source vouch for this row's name?

    The escape clause, and the whole of the judgement. Three Greek leaves carry
    a registered scheme title that IS the granting authority string the filing
    published; an official source named them, so they are named, and rewriting
    one would replace the register's answer with our own.
    """
    return bool(name_source) and name_source in OFFICIALLY_NAMED


def _one(rec: dict, key: str) -> str:
    v = rec.get(key)
    if isinstance(v, list):
        v = v[0] if v else ""
    return (v or "").strip()


def link_map(cases: dict[str, dict]) -> dict[str, set[str]]:
    """Every `caseLinks` edge in the fetched register, in BOTH directions.

    The register states a link once, on whichever side happened to record it.
    Reading it one way loses SA.40391 (see the header), so the map is
    symmetric and the direction of the filing stops mattering.
    """
    edges: dict[str, set[str]] = {}
    for sa, rec in cases.items():
        if not isinstance(rec, dict):
            continue
        links = rec.get("caseLinks") or []
        if not isinstance(links, list):
            links = [links]
        for other in links:
            other = str(other).strip()
            if not other or other == sa:
                continue
            edges.setdefault(sa, set()).add(other)
            edges.setdefault(other, set()).add(sa)
    return edges


def scheme_title_via_links(
    sa: str, cases: dict[str, dict], edges: dict[str, set[str]] | None = None
) -> tuple[str | None, str]:
    """The registered title of the scheme `sa`'s record points at.

    Returns `(title, via_sa)` on success, or `(None, reason)`. The reason is
    returned rather than logged because the caller writes it into the evidence
    record: an unresolved row is a finding about the register, not a silent
    skip.
    """
    edges = link_map(cases) if edges is None else edges
    candidates = []
    for other in sorted(edges.get(sa, ())):
        rec = cases.get(other)
        if not isinstance(rec, dict) or rec.get("_miss"):
            continue
        title = _one(rec, "caseTitle") or _one(rec, "caseOriginalTitle")
        if title:
            candidates.append((other, title))

    if not candidates:
        return None, (
            f"{sa} links to no case record we hold with a title "
            f"(links: {sorted(edges.get(sa, ())) or 'none'})")
    if len(candidates) > 1:
        return None, (
            f"{sa} links to {len(candidates)} titled case records "
            f"({', '.join(c for c, _ in candidates)}); refusing to guess which "
            "is the aid measure -- settle it from the register by hand")
    other, title = candidates[0]
    return title, other


def live_successor(
    sa: str,
    cases: dict[str, dict],
    edges: dict[str, set[str]] | None = None,
    today: str | None = None,
) -> tuple[str | None, str]:
    """The still-running case that replaced `sa`. Returns `(sa_number, title)`
    or `(None, reason)`.

    ── Why this is here and not inlined in the loader ─────────────────────
    A prolonged GBER measure gets a NEW SA number, so "the register says this
    scheme ended" usually means "it was superseded". Naming the successor turns
    a dead end into a redirection, and `successor_scheme` / `successor_title`
    are shown to a founder as exactly that.

    The link that names the successor is `caseLinks`, and `caseLinks` IS
    DIRECTIONAL: the Commission files the edge once, on whichever side it
    pleases. `populate_funding_instruments.py` used to iterate a case's OWN
    links, so a successor that filed the edge on ITS record was invisible --
    measured by wsHF at 15 instruments across 14 schemes, against 40 found
    forward-only. A 37.5% under-report, and every one of those 15 founders was
    shown a dead end while the register named the replacement.

    So the traversal is `link_map`, which is symmetric, and it lives beside the
    other reader of that field rather than being written twice. Anything in
    this repo that follows a register link must build the map both ways or it
    is measuring the Commission's filing habits rather than the relation.

    ── What counts as a successor ─────────────────────────────────────────
    Only a linked case the register still shows as running: `caseMeasureEndDate`
    absent-or-future. A closed case cannot be a redirection, and a link with no
    end date tells us nothing, so neither qualifies.

    ── Determinism where the register offers several ──────────────────────
    Candidates are considered in sorted SA order and the first live one wins,
    so the same register always yields the same answer -- the forward-only loop
    took filing order, which is not stable under a symmetric map.

    It does NOT refuse on several, and that is a deliberate difference from
    `scheme_title_via_links`, which does. A NAME asserts what an object IS, so
    guessing between two is a false claim about the object. A REDIRECT asserts
    only that a live scheme replaced a dead one, and every candidate here
    satisfies that; withholding it returns the founder to the dead end this
    whole pass exists to remove. `live_successors` exposes the full list for a
    caller that wants to count or report the multiplicity.
    """
    live = live_successors(sa, cases, edges, today)
    if not live:
        edges = link_map(cases) if edges is None else edges
        return None, (f"{sa} links to no case the register still shows as running "
                      f"(links: {sorted(edges.get(sa, ())) or 'none'})")
    return live[0]


def live_successors(
    sa: str,
    cases: dict[str, dict],
    edges: dict[str, set[str]] | None = None,
    today: str | None = None,
) -> list[tuple[str, str]]:
    """Every still-running case linked to `sa`, as `(sa_number, title)`, sorted.

    The set `live_successor` picks its answer from. Separate so that the
    multiplicity is countable without re-deriving the rule -- a report that
    wants to say "three of the 55 had a second live candidate" reads this, and
    cannot drift from what the loader actually wrote.

    A link with NO `caseMeasureEndDate` is excluded rather than assumed live.
    The register omits the field on records it holds nothing about, so reading
    absence as "still running" would manufacture redirects out of silence --
    the opposite failure to the one this pass fixes, and a louder one, because
    a redirect is shown to the founder as a fact.
    """
    from datetime import date

    edges = link_map(cases) if edges is None else edges
    today = today or date.today().isoformat()

    out: list[tuple[str, str]] = []
    for other in sorted(edges.get(sa, ())):
        rec = cases.get(other)
        if not isinstance(rec, dict) or rec.get("_miss"):
            continue
        end = _one(rec, "caseMeasureEndDate")[:10]
        if not end or end < today:
            continue
        out.append((other, _one(rec, "caseTitle") or _one(rec, "caseOriginalTitle")))
    return out


def repair_body_named_rows(rows: list[dict], cases: dict[str, dict]) -> list[dict]:
    """Rename every row that is shown under its granting body's name.

    `rows` are the loader's dicts, mutated in place; the returned list is one
    record per row TOUCHED OR ATTEMPTED, which is what the evidence file and
    the run log are both written from.

    Reads `scheme_code`, `name`, `administering_body`; writes `name` and
    `name_source` and nothing else.
    """
    edges = link_map(cases)
    out: list[dict] = []
    for row in rows:
        sa = (row.get("scheme_code") or "").strip()
        if not sa:
            continue
        if not named_after_its_granting_body(row.get("name"), row.get("administering_body")):
            continue
        if officially_named(row.get("name_source")):
            continue
        title, via = scheme_title_via_links(sa, cases, edges)
        rec = {
            "instrument_id": row.get("id"),
            "scheme_code": sa,
            "old_name": row.get("name"),
            "old_name_source": row.get("name_source"),
            "administering_body": row.get("administering_body"),
        }
        if not title:
            rec.update(applied=False, reason=via)
            out.append(rec)
            continue
        row["name"] = title
        row["name_source"] = "case_register"
        rec.update(applied=True, new_name=title, new_name_source="case_register",
                   via_scheme_code=via)
        out.append(rec)
    return out
