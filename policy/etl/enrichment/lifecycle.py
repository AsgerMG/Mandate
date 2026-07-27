"""Dates and lifecycle stage for legal acts, from Cellar's own metadata.

Measured 2026-07-27, before this existed: ``date_in_force`` was NULL for all
4,781 documents and ``lifecycle_stage`` was UNKNOWN for 3,893 of them (81%).
Every "this applies to you from X" and every Watchlist deadline in a brief was
therefore inferred by the model from prose, which is exactly what a general
agentic browser does. These are structured facts Cellar publishes and we simply
never asked for.

Three things about the source data shape everything here, all verified live
against CELEX 32024R1689 (the AI Act):

1. ``resource_legal_date_entry-into-force`` is **multi-valued** for staged acts.
   The AI Act returns 2024-08-01, 2025-02-02, 2025-08-02 and more — entry into
   force followed by each tranche of obligations. Collapsing that to one date
   throws away the entire staged-compliance picture, which for the AI Act *is*
   the compliance picture.

2. ``resource_legal_date_end-of-validity`` uses **9999-12-31 as a sentinel** for
   "no end". Stored naively, every act in force looks like it expires in the
   year 9999 — which would read as a real date to the model and to any
   date-based filter.

3. ``resource_legal_in-force`` is a direct boolean flag ('1'/'0'), which is a
   far better repeal signal than inferring from dates.

The SPARQL literals carry an explicit ``^^xsd:string`` datatype because Cellar
runs Virtuoso, which does not match a plain literal against a typed one. Getting
this wrong fails silently — it returns zero rows rather than an error, which is
how eurlex_key_acts' date lookup went unnoticed while leaving all 55
foundational acts undated.
"""

from __future__ import annotations

import datetime as dt

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from data.models import Document, DocumentType, LifecycleStage
from etl.adapters.eurlex import SPARQL_ENDPOINT

log = structlog.get_logger(__name__)

# Cellar's "no end of validity" sentinel. Anything at or beyond this is absence
# of an end date, not an end date.
_NO_END_SENTINEL = dt.date(9999, 12, 31)

# CELEX ids per SPARQL request. Kept modest because the query returns several
# rows per act (one per entry-into-force value) and Virtuoso applies its own
# result ceiling — a batch that quietly hits it would drop dates for whichever
# acts happened to fall past the cut.
_BATCH_SIZE = 150

# Types this enrichment applies to. A newsletter has no entry into force, and
# asking Cellar about one wastes a round-trip on a CELEX it has never heard of.
_DATED_TYPES = frozenset(
    {
        DocumentType.REGULATION,
        DocumentType.DIRECTIVE,
        DocumentType.DECISION,
        DocumentType.GUIDELINE,
        DocumentType.BUDGET,
    }
)


def _build_metadata_query(celex_codes: list[str]) -> str:
    values = " ".join(f'"{c}"^^xsd:string' for c in celex_codes)
    return f"""
    PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT ?celex ?inforce ?eif ?endvalidity ?deadline WHERE {{
      VALUES ?celex {{ {values} }}
      ?work cdm:resource_legal_id_celex ?celex .
      OPTIONAL {{ ?work cdm:resource_legal_in-force ?inforce . }}
      OPTIONAL {{ ?work cdm:resource_legal_date_entry-into-force ?eif . }}
      OPTIONAL {{ ?work cdm:resource_legal_date_end-of-validity ?endvalidity . }}
      OPTIONAL {{ ?work cdm:resource_legal_date_deadline ?deadline . }}
    }}
    """


def _parse_date(value: str | None) -> dt.date | None:
    if not value:
        return None
    try:
        return dt.date.fromisoformat(value[:10])
    except ValueError:
        return None


def derive_stage(
    *,
    in_force_flag: bool | None,
    date_in_force: dt.date | None,
    date_application: dt.date | None,
    date_end_validity: dt.date | None,
    today: dt.date | None = None,
) -> LifecycleStage:
    """The deterministic stage rule. No LLM, no guessing.

    Order matters: repeal beats everything (a repealed act is not "in force"
    however its dates read), and the applicability check beats the
    entry-into-force check, because an act can be in force with none of its
    obligations biting yet — which is the distinction ADOPTED exists to carry
    and the one a compliance brief must not blur.

    Returns UNKNOWN rather than a plausible guess when the metadata doesn't
    support a call: an honest UNKNOWN is filterable, a wrong IN_FORCE is not.
    """
    today = today or dt.date.today()
    if in_force_flag is False:
        return LifecycleStage.REPEALED
    if date_end_validity is not None and date_end_validity < today:
        return LifecycleStage.REPEALED
    effective = date_application or date_in_force
    if effective is None:
        return LifecycleStage.UNKNOWN
    if effective > today:
        # Adopted, dated, and not yet biting — the AI Act's later tranches sit
        # here, and a brief must say "from <date>", not "applies".
        return LifecycleStage.ADOPTED
    return LifecycleStage.IN_FORCE


def _fold_rows(rows: list[dict]) -> dict[str, dict]:
    """Collapse the multi-row SPARQL result into one record per CELEX.

    One act yields a row per (entry-into-force x deadline) combination, so the
    same dates repeat many times; sets do the deduplication.
    """
    acc: dict[str, dict] = {}
    for row in rows:
        celex = row["celex"]["value"]
        rec = acc.setdefault(celex, {"eif": set(), "deadlines": set(), "end": None, "flag": None})
        if (eif := _parse_date(row.get("eif", {}).get("value"))) is not None:
            rec["eif"].add(eif)
        if (dl := _parse_date(row.get("deadline", {}).get("value"))) is not None:
            rec["deadlines"].add(dl)
        if (end := _parse_date(row.get("endvalidity", {}).get("value"))) is not None:
            # Keep the earliest real end date; ignore the 9999 sentinel.
            if end < _NO_END_SENTINEL and (rec["end"] is None or end < rec["end"]):
                rec["end"] = end
        flag = row.get("inforce", {}).get("value")
        if flag in ("0", "1"):
            rec["flag"] = flag == "1"
    return acc


def _dates_from_record(rec: dict) -> tuple[dt.date | None, dt.date | None, list[str]]:
    """``(date_in_force, date_application, stages)`` for one folded record.

    ``date_in_force`` is the earliest entry-into-force date — when the act
    legally exists. ``date_application`` is the next distinct date after that,
    when one exists, because for a staged act the later entry-into-force values
    are precisely the tranches of obligations starting to apply; with no staging
    the two coincide. ``stages`` keeps every dated milestone (including
    deadlines) so a brief can cite the specific one that matters rather than
    reasoning from two summary dates.
    """
    eifs = sorted(rec["eif"])
    if not eifs:
        return None, None, []
    date_in_force = eifs[0]
    later = [d for d in eifs if d > date_in_force]
    date_application = later[0] if later else date_in_force
    stages = sorted({*eifs, *rec["deadlines"]})
    return date_in_force, date_application, [d.isoformat() for d in stages]


def enrich_lifecycle(session: Session, http, *, limit: int | None = None) -> dict:
    """Fetch Cellar date metadata for CELEX-bearing legal acts and set
    ``date_in_force``, ``date_application``, ``date_end_validity``,
    ``extra["application_stages"]`` and ``lifecycle_stage``.

    ``http`` is the adapter HTTP client (etl/http.py's HttpClient) so this shares
    the project's retry and politeness policy instead of opening its own.

    Idempotent: re-running refreshes dates for acts whose metadata changed
    (Cellar does amend end-of-validity when an act is repealed), which is what
    makes this safe to attach to ``refresh``.
    """
    stmt = select(Document).where(
        Document.celex.is_not(None), Document.document_type.in_(_DATED_TYPES)
    )
    documents = list(session.scalars(stmt).all())
    if limit is not None:
        documents = documents[:limit]
    by_celex = {d.celex: d for d in documents}
    codes = list(by_celex)

    updated = 0
    stage_counts: dict[str, int] = {}
    for start in range(0, len(codes), _BATCH_SIZE):
        batch = codes[start : start + _BATCH_SIZE]
        resp = http.get(
            SPARQL_ENDPOINT,
            accept="application/sparql-results+json",
            params={
                "query": _build_metadata_query(batch),
                "format": "application/sparql-results+json",
            },
        )
        rows = resp.json().get("results", {}).get("bindings", [])
        for celex, rec in _fold_rows(rows).items():
            doc = by_celex.get(celex)
            if doc is None:
                continue
            date_in_force, date_application, stages = _dates_from_record(rec)
            doc.date_in_force = date_in_force
            doc.date_application = date_application
            doc.date_end_validity = rec["end"]
            if stages:
                doc.extra = {**(doc.extra or {}), "application_stages": stages}
            stage = derive_stage(
                in_force_flag=rec["flag"],
                date_in_force=date_in_force,
                date_application=date_application,
                date_end_validity=rec["end"],
            )
            doc.lifecycle_stage = stage
            stage_counts[stage.value] = stage_counts.get(stage.value, 0) + 1
            updated += 1
        session.commit()
        log.info("lifecycle_batch", batch=len(batch), updated=updated)

    return {"candidates": len(codes), "updated": updated, "stages": stage_counts}
