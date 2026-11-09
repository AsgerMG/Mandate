"""Spain's OPEN calls, derived record by record, because the register cannot be asked.

── The gap this closes ────────────────────────────────────────────────────
Spain's instruments are built from BDNS *award* records. A regime assembled
from awards can only ever contain calls that have already paid out, so by
construction the corpus holds Spain's past and not its present. Once the 80
expired convocatorias were correctly closed (workstream L-ES2), Spain had 13
proposable rows and a Spanish founder asking "which five funds should I apply
to" was being served from a corpus that structurally could not contain a call
open today.

── Why the open-flag cannot be used, established twice ────────────────────
1. It is not queryable. `abierto=true` on `/convocatorias/busqueda` returns the
   same 647,047 rows as no filter at all -- the parameter is accepted and
   ignored. BDNS says so itself, in FAQ 203 shipped inside its own portal:

     "¿Cómo puedo saber en qué convocatorias el plazo para presentar
      solicitudes está aún abierto?"
     "No hay una manera directa de saberlo, salvo examinar las convocatorias
      una a una. La razón para no poder ofrecer esta información es que, por
      costumbre en España, muchos plazos están condicionados por la fecha de
      publicación del anuncio/extracto de la convocatoria en el diario oficial."

2. It is WRONG on the record. codigoBDNS 922483 (hostelería equipment renewal,
   MINTUR) carries `abierto: false` and `fechaFinSolicitud: 2026-09-30`. The
   flag says shut; the register's own dates say the window runs for another two
   months. Measured across the harvest, not anecdotal -- see `--report`.

So openness is DERIVED from the dates the register states, never asked for.
That is also the only form of the claim the corpus can carry: `scheme_end_date`
with basis `call_deadline`, which is exactly what a convocatoria's plazo is.

── The inclusion property, stated once ────────────────────────────────────
A convocatoria becomes an instrument when all four hold. Every clause is a
field the register itself publishes; none names a programme, a body, a sector
or a scheme code, and `--audit` tests each clause independently so a clause
that stops discriminating is visible rather than assumed.

  OPEN       `fechaFinSolicitud` is a real date and it has not passed.
             Not `abierto`. Not "no end date recorded" -- an undated call is
             excluded, because a row we cannot date is a row the corpus cannot
             later close, and that is the exact defect that left 80 dead
             Spanish calls proposable.

  UNDERTAKING  the declared beneficiary classes include one that denotes an
             economic undertaking. The register enumerates four classes and
             two of them are economic; this is its claim about who may apply,
             not our inference from a title.

  SCHEME     the award procedure is competitive rather than a nominative
             hand-out. `tipoConvocatoria` distinguishes concurrencia
             competitiva from concesión directa; a direct concession names its
             recipient in the instrument itself, so proposing one to a founder
             who is not that recipient wastes their time by construction.
             (`--audit` reports what this costs: it is the one clause that
             excludes genuinely open money.)

  SUBSTANCE  the register states a budget, and states enough to tell the call
             apart from its neighbours -- a purpose, a sector restriction, a
             region, or a regulatory basis. A row a founder cannot distinguish
             from four others is not inventory, it is noise, and this
             workstream is explicitly not measured on row count.

── Not a bulk load ────────────────────────────────────────────────────────
The register holds 647,047 convocatorias. The goal is not to hold them; it is
that a Spanish founder gets five funds they can actually apply to. The property
above is what does the cutting, and `--report` prints the funnel so the cut is
inspectable at every stage rather than asserted.

── Stages, because a 9,000-record fetch gets killed ───────────────────────
  --enumerate   page the search endpoint; write candidate ids           (cheap)
  --detail      fetch each candidate's detail payload; resumable        (slow)
  --report      apply the property to the cached details; writes nothing
  --audit       per-clause discrimination, and the `abierto` disagreement rate

Detail records are cached to disk keyed by codigoBDNS and never re-fetched, so
a killed run resumes. Nothing here writes to the database; `--emit` produces
the fetch-record JSON that load_scheme_text.py already knows how to read.

Usage:
  python3 ETL/terms/harvest_bdns_open_calls.py --enumerate --since 2025-01-01
  python3 ETL/terms/harvest_bdns_open_calls.py --detail [--limit N]
  python3 ETL/terms/harvest_bdns_open_calls.py --report
  python3 ETL/terms/harvest_bdns_open_calls.py --audit
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import datetime as dt  # noqa: E402
import json  # noqa: E402
import time  # noqa: E402
import urllib.parse  # noqa: E402

from ndb_ssl import fetch_json  # noqa: E402

API_BASE = "https://www.infosubvenciones.es/bdnstrans/api"
OUTDIR = ROOT / "data" / "raw" / "bdns_open"
CANDIDATES = OUTDIR / "candidates.jsonl"
DETAILS = OUTDIR / "details.jsonl"
# The stored fetch records for Spain's EXISTING leaves: the input the budget
# floor, the admissible policies and the overlap join are derived from. A pinned
# grounded input (group `bdns_open_calls` in reference/grounded_inputs.json), not
# a cache: nothing here re-creates it, and the cron's data/raw/ starts empty, so
# reading the path directly failed every week once the corpus left the laptop
# (run 114, 2026-11-09: FileNotFoundError before `enumerate` fetched anything).
FETCH_RECORDS = ROOT / "data" / "raw" / "scheme_enrichment" / "found_ES_bdns.json"


def fetch_records() -> list[dict]:
    """The existing leaves' fetch records, from disk or, absent, from grounding."""
    if not FETCH_RECORDS.exists():
        from grounded_inputs import materialise  # noqa: PLC0415
        materialise("bdns_open_calls")
    return json.loads(FETCH_RECORDS.read_text())

DELAY_S = 0.35
PAGE_SIZE = 200

# ── The register's own enumerations, resolved from its lookup endpoints ────
# Beneficiary classes are returned by the search filter as ids 1-4 and by the
# detail payload as descriptions; both are the register's vocabulary, and the
# ECONOMIC pair is the whole of it that denotes an undertaking. Held as the
# register's own strings so a change in its vocabulary shows up as a drop in
# the audit rather than as a silent re-interpretation.
BENEFICIARY_FILTER_IDS = "3,4"
ECONOMIC_BENEFICIARY = (
    "PYME Y PERSONAS FÍSICAS QUE DESARROLLAN ACTIVIDAD ECONÓMICA",
    "GRAN EMPRESA",
)
# `tipoConvocatoria` reads e.g. "Concurrencia competitiva - canónica" or
# "Concesión directa - instrumental". Matched on the procedure word, since the
# suffix (canónica / instrumental) is a BDNS bookkeeping distinction about how
# the record was registered, not about how the money is awarded.
COMPETITIVE_TOKEN = "concurrencia"
# Administrative levels the register labels. Local is not excluded here -- the
# substance floor is what decides -- but it is reported separately, because a
# municipal call and a ministerial one are not the same kind of inventory.
LEVEL_LOCAL = "LOCAL"


def _norm(s: str | None) -> str:
    return " ".join((s or "").split()).strip().lower()


def budget_floor() -> float:
    """The smallest stated budget among the instruments the corpus ALREADY
    publishes for this country.

    Derived, never typed. Admitting a EUR 300k open call while already
    publishing a EUR 300k closed one is the only non-contradictory position,
    and the floor moves on its own if the corpus's existing floor moves.
    """
    import re
    buds = [float(m.group(1).replace(",", ""))
            for r in fetch_records()
            for m in [re.search(r"Presupuesto total: ([\d,]+) EUR",
                                r.get("eligibility_text") or "")] if m]
    if not buds:
        raise SystemExit("no stated budgets on the existing leaves -- floor undefined")
    return min(buds)


def admissible_policies() -> frozenset[str]:
    """The spending policies the corpus ALREADY publishes instruments under.

    Read off the stored fetch records for the country's existing leaves, so no
    Spanish policy name appears anywhere in this file's logic and the set moves
    on its own if the corpus's scope moves. Same construction as the budget
    floor in load_bdns_open_calls.py, for the same reason.
    """
    import re
    out = set()
    for r in fetch_records():
        m = re.search(r"Finalidad: ([^.]+)\.", r.get("eligibility_text") or "")
        if m:
            out.add(m.group(1).strip())
    if not out:
        raise SystemExit("no spending policies on the existing leaves -- scope undefined")
    return frozenset(out)


def _descs(d: dict, key: str) -> list[str]:
    return [(x.get("descripcion") or "").strip() for x in (d.get(key) or [])
            if (x.get("descripcion") or "").strip()]


# ── The four clauses, one function each, so --audit can price them apart ───

def is_open(d: dict, asof: str) -> bool:
    """The application window is stated and has not passed.

    Deliberately NOT `d['abierto']`, and deliberately NOT "no date recorded".
    An undated call cannot be closed by the corpus later -- `scheme_end_date`
    is the only mechanism that removes a row from what a brief may propose --
    so admitting one would re-create the defect this workstream exists to undo.
    """
    end = (d.get("fechaFinSolicitud") or "")[:10]
    if len(end) != 10:
        return False
    return end >= asof


def is_for_undertakings(d: dict) -> bool:
    """The register's declared beneficiary classes include an economic one."""
    return any(b in ECONOMIC_BENEFICIARY for b in _descs(d, "tiposBeneficiarios"))


def is_scheme(d: dict) -> bool:
    """Awarded by competition, not handed to a recipient the instrument names."""
    return COMPETITIVE_TOKEN in _norm(d.get("tipoConvocatoria"))


def discriminators(d: dict) -> list[str]:
    """Register facts that tell this call apart from its neighbours.

    The beneficiary enumeration is deliberately absent: measured over the 87
    existing Spanish leaves it takes 6 distinct values and leaves a mean
    sibling class of 45.3, i.e. every call in the register shares it. Counting
    it would let a row qualify on boilerplate.
    """
    out = []
    if (d.get("descripcionFinalidad") or "").strip():
        out.append("finalidad")
    if _descs(d, "sectores"):
        out.append("sectores")
    if _descs(d, "regiones"):
        out.append("regiones")
    if (d.get("descripcionBasesReguladoras") or "").strip():
        out.append("bases")
    if (d.get("ayudaEstado") or "").strip():
        out.append("ayudaEstado")
    return out


MIN_DISCRIMINATORS = 3


def has_substance(d: dict, min_budget: float) -> bool:
    """A stated budget above the floor, and enough facts to write a row."""
    try:
        budget = float(d.get("presupuestoTotal") or 0)
    except (TypeError, ValueError):
        budget = 0.0
    return budget >= min_budget and len(discriminators(d)) >= MIN_DISCRIMINATORS


def in_scope(d: dict, policies: frozenset[str]) -> bool:
    """The state classifies this money the way it classifies what we already hold.

    `descripcionFinalidad` is the call's *política de gasto* -- the line of
    Spain's budget classification the money is spent under. The register's
    `finalidad` ids are that classification in its official order, and ids 12-18
    are exactly group 4, `actuaciones de carácter económico` (agriculture,
    industry & energy, commerce/tourism/SMEs, transport, infrastructure, R&D&I,
    other economic).

    But the admissible set is NOT that range typed out. It is read off the
    corpus's own published inventory for the country, by `admissible_policies`,
    for the same reason the budget floor is: a rule that admits a category the
    corpus does not already stand behind is a scope decision in disguise, and a
    rule that rejects one it does publish contradicts itself.

    Measured on Spain before adopting, which is what makes it a description
    rather than a preference: 83 of the 84 existing leaves with a stated policy
    already sit in the economic block, and NONE is `Fomento del Empleo`,
    `Cultura`, or any social policy. Without this clause the harvest admits
    sports-club and film grants -- real money, awarded to real undertakings,
    and not what this corpus is.
    """
    return (d.get("descripcionFinalidad") or "").strip() in policies


CLAUSES = ("open", "undertaking", "scheme", "in_scope", "substance")


def clauses(d: dict, asof: str, min_budget: float,
            policies: frozenset[str] = frozenset()) -> dict[str, bool]:
    return {
        "open": is_open(d, asof),
        "undertaking": is_for_undertakings(d),
        "scheme": is_scheme(d),
        "in_scope": in_scope(d, policies),
        "substance": has_substance(d, min_budget),
    }


def qualifies(d: dict, asof: str, min_budget: float,
              policies: frozenset[str] = frozenset()) -> bool:
    return all(clauses(d, asof, min_budget, policies).values())


# ── Stage 1: enumerate ─────────────────────────────────────────────────────

def register_finalidades() -> list[dict]:
    """The register's own spending-policy lookup: [{id, descripcion}, ...]."""
    r = fetch_json(f"{API_BASE}/finalidades?vpd=GE", timeout=60)
    return r if isinstance(r, list) else []


def finalidad_ids(policies: frozenset[str], lookup: list[dict]) -> tuple[list[int], list[str]]:
    """Resolve the corpus's admissible policies to the register's finalidad ids.

    Returns (ids, unresolved). The lookup speaks upper case ("INDUSTRIA Y
    ENERGÍA") and the detail payload title case; both are the same register
    vocabulary, so the join is on the normalised string and nothing is typed.
    """
    by_desc = {_norm(x.get("descripcion")): int(x["id"]) for x in lookup
               if x.get("id") is not None and (x.get("descripcion") or "").strip()}
    ids, unresolved = [], []
    for p in sorted(policies):
        if _norm(p) in by_desc:
            ids.append(by_desc[_norm(p)])
        else:
            unresolved.append(p)
    return sorted(set(ids)), unresolved


def search_streams(levels: list[str], fin_ids: list[int] | None) -> list[tuple[str, list[str]]]:
    """One search stream per (level, finalidad), or per level when unnarrowed.

    Narrowing by `finalidad` server-side is LOSSLESS by construction: `in_scope`
    admits a call only if its `descripcionFinalidad` is one of the admissible
    policies, so a call under any other finalidad could never qualify. What it
    buys is a discovery window long enough to cover how long calls stay OPEN
    (see LOOKBACK_DAYS in refresh_open_calls.py) at fewer requests than the old
    60-day unnarrowed window: measured 2026-11-09, 180 days narrowed = 1,686
    candidates vs 60 days unnarrowed = 1,349.

    `finalidad` takes ONE id per request (a comma list answers HTTP 400), the
    same as `tipoAdministracion`, so the streams are the product of the two.
    """
    if fin_ids is None:
        return [(lvl, [f"tipoAdministracion={lvl}"]) for lvl in levels]
    return [(f"{lvl}/f{f}", [f"tipoAdministracion={lvl}", f"finalidad={f}"])
            for lvl in levels for f in fin_ids]


def enumerate_candidates(since: str, until: str | None, levels: list[str],
                         narrow: bool = True) -> list[str]:
    """Page the search endpoint, one administrative level (and finalidad) at a time.

    Levels are queried separately because `tipoAdministracion` accepts only one
    value per request (verified: C&A returns the C count), unlike
    `tiposBeneficiario`, which does accept a comma list.

    This IS Spain's discovery. The pinned `found_ES_bdns.json` is not a list of
    calls to look for; it is the corpus's existing leaves, read for the scope
    (policies, budget floor) and for the overlap join. Every call the weekly run
    can offer is found here, from the register, or not at all.
    """
    fin_ids: list[int] | None = None
    if narrow:
        ids, unresolved = finalidad_ids(admissible_policies(), register_finalidades())
        if ids and not unresolved:
            fin_ids = ids
            print(f"narrowed to finalidad ids {fin_ids} (the corpus's admissible policies)")
        else:
            # Never narrow on a partial mapping: a policy the lookup no longer
            # names would silently drop every call under it.
            print(f"NOT narrowing: unresolved policies {unresolved or 'lookup empty'}; "
                  f"enumerating every finalidad", flush=True)
    OUTDIR.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    if CANDIDATES.exists():
        for line in CANDIDATES.read_text().splitlines():
            if line.strip():
                seen.add(json.loads(line)["numeroConvocatoria"])
    print(f"{len(seen)} candidates already enumerated")

    d0 = dt.date.fromisoformat(since).strftime("%d/%m/%Y")
    d1 = dt.date.fromisoformat(until).strftime("%d/%m/%Y") if until else None
    added = 0
    failed: list[str] = []
    with CANDIDATES.open("a") as fh:
        for stream, extra in search_streams(levels, fin_ids):
            lvl = stream.split("/")[0]
            page, total = 0, None
            time.sleep(DELAY_S)  # spacing holds across streams, not only within one
            while True:
                q = [f"page={page}", f"pageSize={PAGE_SIZE}",
                     f"fechaDesde={urllib.parse.quote(d0, safe='')}",
                     f"tiposBeneficiario={urllib.parse.quote(BENEFICIARY_FILTER_IDS)}",
                     *extra,
                     "order=fechaRecepcion", "direccion=desc"]
                if d1:
                    q.append(f"fechaHasta={urllib.parse.quote(d1, safe='')}")
                r = fetch_json(f"{API_BASE}/convocatorias/busqueda?" + "&".join(q), timeout=120)
                if r is None:
                    print(f"  [{stream}] page {page} FAILED; stopping this stream")
                    failed.append(stream)
                    break
                if total is None:
                    total = r.get("totalElements")
                    print(f"  [{stream}] {total} candidates")
                rows = r.get("content") or []
                if not rows:
                    break
                for row in rows:
                    code = str(row.get("numeroConvocatoria"))
                    if code in seen:
                        continue
                    seen.add(code)
                    added += 1
                    fh.write(json.dumps({
                        "numeroConvocatoria": code,
                        "descripcion": row.get("descripcion"),
                        "fechaRecepcion": row.get("fechaRecepcion"),
                        "nivel1": row.get("nivel1"), "nivel2": row.get("nivel2"),
                        "nivel3": row.get("nivel3"), "tipoAdministracion": lvl,
                    }, ensure_ascii=False) + "\n")
                fh.flush()
                page += 1
                if r.get("last") or page >= (r.get("totalPages") or 0):
                    break
                time.sleep(DELAY_S)
            print(f"  [{stream}] done, {added} new so far")
    print(f"{CANDIDATES}  +{added} new, {len(seen)} total")
    if failed:
        # A stream that stopped early is calls never seen, not an empty week.
        # Exit 3 is what refresh_open_calls.py records as PARTIAL.
        print(f"PARTIAL: {len(failed)} search stream(s) failed: {', '.join(failed)}")
    return failed


# ── Stage 2: detail ────────────────────────────────────────────────────────

def detail_files() -> list[_Path]:
    """Every worker's output. Sharded runs write their OWN file rather than
    appending to a shared one: a detail record is 1-2 kB, well past the size at
    which concurrent appends are guaranteed not to interleave, and a corrupted
    line in the middle of a four-hour harvest is not worth the tidiness."""
    return sorted(OUTDIR.glob("details*.jsonl"))


def load_details() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for f in detail_files():
        for line in f.read_text().splitlines():
            if line.strip():
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                out[rec["codigo"]] = rec
    return out


def fetch_details(limit: int | None, order: str, shard: str | None) -> None:
    """Fetch the detail payload for every candidate not already cached.

    Newest-first by default: an open window is far likelier on a recently
    registered call, so a run that is killed early has still collected the
    records most likely to qualify. `--order oldest` exists to prove that
    ordering is not hiding a tail, and --audit reports the tail it finds.
    """
    cands = [json.loads(l) for l in CANDIDATES.read_text().splitlines() if l.strip()]
    have = set(load_details())
    todo = [c for c in cands if str(c["numeroConvocatoria"]) not in have]
    todo.sort(key=lambda c: c.get("fechaRecepcion") or "", reverse=(order != "oldest"))
    # ── Sharding, so several workers can run without re-fetching each other's
    # records. The split is on the convocatoria code, not on position in the
    # list, so a worker's share does not change when another worker's writes
    # land -- position-based slicing would silently re-fetch and double-append.
    if shard:
        i, n = (int(x) for x in shard.split("/"))
        todo = [c for c in todo if int(c["numeroConvocatoria"]) % n == i]
        print(f"shard {i}/{n}")
    if limit:
        todo = todo[:limit]
    print(f"{len(cands)} candidates, {len(have)} cached, fetching {len(todo)}")
    ok = err = 0
    out = OUTDIR / (f"details.s{shard.replace('/', 'of')}.jsonl" if shard else "details.jsonl")
    with out.open("a") as fh:
        for i, c in enumerate(todo, 1):
            code = str(c["numeroConvocatoria"])
            d = fetch_json(f"{API_BASE}/convocatorias?numConv={code}", timeout=60)
            if d is None:
                err += 1
                # Recorded, not silently skipped: an unrecorded failure is
                # indistinguishable from a record that was never reached, and a
                # resumable fetch must be able to tell those apart.
                fh.write(json.dumps({"codigo": code, "error": True}, ensure_ascii=False) + "\n")
            else:
                ok += 1
                d.pop("advertencia", None)  # 1.3 kB of identical legal boilerplate per record
                fh.write(json.dumps({"codigo": code, "detail": d,
                                     "tipoAdministracion": c.get("tipoAdministracion")},
                                    ensure_ascii=False) + "\n")
            fh.flush()
            if i % 100 == 0:
                print(f"  [{i}/{len(todo)}] ok={ok} err={err}")
            time.sleep(DELAY_S)
    print(f"{out}  ok={ok} err={err}")


# ── Stage 3: report ────────────────────────────────────────────────────────

def report(asof: str, min_budget: float) -> None:
    pol = admissible_policies()
    recs = [r for r in load_details().values() if not r.get("error")]
    print(f"{len(recs)} detail records cached")
    print(f"scope read off the corpus: {len(pol)} spending policies, "
          f"budget floor EUR {min_budget:,.0f}\n")
    n = len(recs)
    passed = {c: 0 for c in CLAUSES}
    all_pass = 0
    by_level: dict[str, int] = {}
    for r in recs:
        cl = clauses(r["detail"], asof, min_budget, pol)
        for k, v in cl.items():
            passed[k] += bool(v)
        if all(cl.values()):
            all_pass += 1
            lvl = (r["detail"].get("organo") or {}).get("nivel1") or "?"
            by_level[lvl] = by_level.get(lvl, 0) + 1
    print("clause pass rates (independent, over all cached details)")
    for c in CLAUSES:
        print(f"  {c:12} {passed[c]:6}  {100*passed[c]/max(n,1):5.1f}%")
    print(f"\nALL CLAUSES   {all_pass:6}  {100*all_pass/max(n,1):5.1f}%")
    print("\nqualifying by administrative level")
    for k, v in sorted(by_level.items(), key=lambda kv: -kv[1]):
        print(f"  {k:36} {v}")

    # The funnel, in the order the clauses cut, so the cut is inspectable.
    print("\ncumulative funnel")
    pool = [r["detail"] for r in recs]
    print(f"  cached details              {len(pool)}")
    for c, fn in (("open", lambda d: is_open(d, asof)),
                  ("undertaking", is_for_undertakings),
                  ("scheme", is_scheme),
                  ("in_scope", lambda d: in_scope(d, pol)),
                  ("substance", lambda d: has_substance(d, min_budget))):
        pool = [d for d in pool if fn(d)]
        print(f"  + {c:24}  {len(pool)}")


def audit(asof: str, min_budget: float) -> None:
    """What each clause costs, and how far the register's own flag is wrong."""
    pol = admissible_policies()
    recs = [r for r in load_details().values() if not r.get("error")]
    n = len(recs)
    print(f"{n} detail records\n")

    # ── The `abierto` flag against the register's own dates ────────────────
    agree = flag_wrong_shut = flag_wrong_open = both_shut = 0
    dated = 0
    for r in recs:
        d = r["detail"]
        end = (d.get("fechaFinSolicitud") or "")[:10]
        if len(end) != 10:
            continue
        dated += 1
        derived, flag = end >= asof, bool(d.get("abierto"))
        if derived == flag:
            agree += 1
            if not derived:
                both_shut += 1
        elif derived and not flag:
            flag_wrong_shut += 1
        else:
            flag_wrong_open += 1
    print("`abierto` vs the register's own fechaFinSolicitud, on dated records")
    print(f"  dated records                    {dated}")
    print(f"  flag agrees with the dates       {agree}")
    print(f"  flag says SHUT, window is OPEN   {flag_wrong_shut}   <- rows the flag would lose")
    print(f"  flag says OPEN, window has PASSED{flag_wrong_open:4}   <- rows the flag would wrongly offer")
    undated = n - dated
    print(f"  no window recorded at all        {undated}  ({100*undated/max(n,1):.0f}%)"
          "  -- excluded: an undated row cannot be closed later")

    # ── Leave-one-out: what does each clause actually exclude? ─────────────
    print("\nleave-one-out (rows admitted if this clause were dropped)")
    base = sum(1 for r in recs if qualifies(r["detail"], asof, min_budget, pol))
    for drop in CLAUSES:
        k = 0
        for r in recs:
            cl = clauses(r["detail"], asof, min_budget, pol)
            del cl[drop]
            k += all(cl.values())
        print(f"  without {drop:12} {k:6}   (+{k - base} over the {base} admitted)")

    # ── Does the admitted set discriminate? ───────────────────────────────
    adm = [r["detail"] for r in recs if qualifies(r["detail"], asof, min_budget, pol)]
    for label, key in (
        ("administering body", lambda d: _norm((d.get("organo") or {}).get("nivel3"))),
        ("finalidad", lambda d: _norm(d.get("descripcionFinalidad"))),
        ("bases reguladoras", lambda d: _norm(d.get("descripcionBasesReguladoras"))),
        ("beneficiary enumeration", lambda d: _norm("|".join(sorted(_descs(d, "tiposBeneficiarios"))))),
    ):
        vals: dict[str, int] = {}
        for d in adm:
            vals[key(d)] = vals.get(key(d), 0) + 1
        mean_class = sum(vals[key(d)] for d in adm) / max(len(adm), 1)
        print(f"\n  {label:26} {len(vals):4} distinct over {len(adm)}   mean class {mean_class:5.1f}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--enumerate", action="store_true")
    ap.add_argument("--detail", action="store_true")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--audit", action="store_true")
    ap.add_argument("--since", default="2025-01-01")
    ap.add_argument("--until")
    ap.add_argument("--levels", default="C,A,L",
                    help="administrative levels to enumerate (C central, A regional, L local)")
    ap.add_argument("--no-narrow", action="store_true",
                    help="enumerate every finalidad, not only the corpus's admissible ones")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--order", default="newest", choices=["newest", "oldest"])
    ap.add_argument("--shard", help="i/n -- run several workers over disjoint shares")
    ap.add_argument("--asof", default=dt.date.today().isoformat())
    ap.add_argument("--min-budget", type=float, default=None,
                    help="override the floor derived from the corpus (rarely wanted)")
    args = ap.parse_args()
    floor = args.min_budget if args.min_budget is not None else budget_floor()

    if args.enumerate:
        if enumerate_candidates(args.since, args.until, args.levels.split(","),
                                narrow=not args.no_narrow):
            raise SystemExit(3)
    elif args.detail:
        fetch_details(args.limit, args.order, args.shard)
    elif args.report:
        report(args.asof, floor)
    elif args.audit:
        audit(args.asof, floor)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
