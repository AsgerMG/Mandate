"""Spain's own call register already holds the per-scheme facts we never wrote down.

── The finding this exists to ship ────────────────────────────────────────
Of 53 multi-leaf regimes, `bdns_es_ayudas` is the largest with ZERO recorded
eligibility text: 87 sibling leaves, all indistinguishable on the six offer
facets the ranker reads, and Spain's country-level sibling class sits at 44
against Germany's 3.8. The gap was never a fact about Spanish funding. It was
a collection gap, and the collection was already possible: every one of those
87 leaves is named after a BDNS *convocatoria*, and the BDNS transparency API
serves that convocatoria's beneficiary types, eligible regions, eligible
sectors, purpose, budget, submission window and regulatory basis as structured
JSON.

    GET {BASE}/convocatorias/busqueda?descripcion=<title>   -> codigoBDNS
    GET {BASE}/convocatorias?numConv=<codigoBDNS>           -> the facts

Same host `extract_bdns.py` already uses for award records (the WAF-free
infosubvenciones.es mirror of SNPSAP), same identity, no scraping, no LLM.

── Why this is a fetcher and not a loader ─────────────────────────────────
It writes `data/raw/scheme_enrichment/found_ES_bdns.json` in the schema
`load_scheme_text.py` already reads, and that script does every DB write. This
is deliberate: there is one path from fetched scheme prose into the corpus, it
already refuses closed schemes and sub-40-char text, and a second path would
be a second set of rules to keep in sync. Run this, then run the loader.

The JSON is rewritten after EVERY instrument, not at the end. Long fetches on
this project have been killed mid-run before, and a file that only exists once
the last row lands is a file that does not exist.

── What the composed text does and does not claim ─────────────────────────
The text is assembled from register fields verbatim, in the order a founder
reads them: who may apply, where, what for, how much, by when, under which
regulatory basis. Nothing is inferred, translated or summarised, and no field
absent from the register is invented.

It is NOT a substitute for the call documentation. `tiposBeneficiarios` is a
coarse register enumeration (PYME / GRAN EMPRESA / ...), so a leaf whose text
is *only* that is boilerplate the whole register shares -- such rows are
emitted with confidence `low` precisely so they can be told apart later from
rows carrying a real region, sector or budget restriction. Confidence is about
how much the text DISCRIMINATES, not about how sure we are it was fetched.

`regiones` is NOT written to `delivery_region`. That column means "where the
recipients we observed actually are", carries `delivery_region_share`, and is
derived in `populate_funding_instruments.py`. The register's `regiones` means
"where an applicant may be", which is a different claim; it lives in the
eligibility text where it belongs. `administering_body` IS written when the
column is NULL, because `organo.nivel3` is the same claim the column already
makes -- but its `_share` is left NULL, since a register statement has no
observed share.

── Active only ────────────────────────────────────────────────────────────
A BDNS convocatoria is one annual CALL, not a standing programme, so a large
share of these leaves are expired by construction. `status` is written from
the register's own `abierto` flag and `fechaFinSolicitud`, and closed calls
are emitted with `status: closed` so the loader drops them. That is the point:
if Spain's sibling class stays large after this run, the reason is that the
class is largely expired calls, and that is a corpus-composition finding, not
a text-collection one.

Usage:
  python3 ETL/terms/fetch_bdns_convocatorias.py --probe
  python3 ETL/terms/fetch_bdns_convocatorias.py --run [--limit N] [--all]
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import datetime as dt  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402
import time  # noqa: E402
import unicodedata  # noqa: E402
import urllib.parse  # noqa: E402

from ndb_ssl import fetch_json  # noqa: E402

API_BASE = "https://www.infosubvenciones.es/bdnstrans/api"
OUT = ROOT / "data" / "raw" / "scheme_enrichment" / "found_ES_bdns.json"
# The award-record source family this register serves; used to SELECT which
# instruments to fetch for, so no fund name or scheme id is hardcoded in logic.
SOURCE_PREFIX = "bdns"
DELAY_S = 0.7
# Below this many sectors, the sector list is a real restriction worth reading;
# at or above it the register is enumerating essentially the whole economy.
SECTOR_LIST_MAX = 8


def norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def targets(conn: sqlite3.Connection, include_covered: bool) -> list[sqlite3.Row]:
    """Leaves whose awards came from this register and that still lack text."""
    have = "" if include_covered else \
        "AND COALESCE(LENGTH(TRIM(i.eligibility_text)), 0) <= 40"
    # `funding_instrument_sources` is recorded at REGIME grain, not leaf grain,
    # so a leaf is claimed by this register when its regime root is. Joining on
    # i.id alone selected only the parent row and nothing that needs text.
    return list(conn.execute(f"""
        SELECT DISTINCT i.id, i.name, i.last_year, i.administering_body
          FROM funding_instruments i
          JOIN funding_instrument_sources s
            ON s.instrument_id = COALESCE(i.parent_id, i.id)
         WHERE s.source LIKE ? {have}
           AND i.parent_id IS NOT NULL
           AND i.name IS NOT NULL
         ORDER BY i.event_count DESC
    """, (SOURCE_PREFIX + "%",)))


def search(name: str) -> list[dict]:
    """Convocatorias whose title contains this leaf's name, newest first."""
    q = urllib.parse.quote(name[:120])
    url = (f"{API_BASE}/convocatorias/busqueda?page=0&pageSize=30"
           f"&descripcion={q}&order=fechaRecepcion&direccion=desc")
    d = fetch_json(url, timeout=60)
    return (d or {}).get("content", []) or []


def pick(name: str, cands: list[dict]) -> dict | None:
    """Best convocatoria for this leaf.

    The stored leaf name is a truncation of the call title, so the comparator
    is prefix-on-normalised-text in either direction rather than equality --
    equality alone silently lost every leaf whose name hit the truncation.
    """
    n = norm(name)
    hits = [c for c in cands
            if norm(c.get("descripcion")).startswith(n) or n.startswith(norm(c.get("descripcion")))]
    if not hits:
        return None
    # Newest first is what the search already returned; an OPEN call still wins
    # over a newer closed one, because it is the one a founder can act on.
    hits.sort(key=lambda c: c.get("fechaRecepcion") or "", reverse=True)
    return hits[0]


def detail(cod: str) -> dict | None:
    return fetch_json(f"{API_BASE}/convocatorias?numConv={cod}", timeout=60)


def _vals(d: dict, key: str) -> list[str]:
    return [x.get("descripcion", "").strip() for x in (d.get(key) or [])
            if x.get("descripcion")]


def compose(d: dict) -> tuple[str, str, int]:
    """(eligibility_text, confidence, n_discriminating_facts).

    Confidence grades how much the text DISCRIMINATES, since a leaf carrying
    only the register's coarse beneficiary enumeration is boilerplate every
    Spanish call shares and must not be recorded as if it separated anything.
    """
    parts: list[str] = []
    specific = 0

    ben = _vals(d, "tiposBeneficiarios")
    if ben:
        parts.append("Beneficiarios: " + "; ".join(ben) + ".")

    reg = _vals(d, "regiones")
    if reg:
        parts.append("Ámbito regional: " + "; ".join(reg) + ".")
        specific += 1

    fin = (d.get("descripcionFinalidad") or "").strip()
    if fin:
        parts.append("Finalidad: " + fin + ".")
        specific += 1

    sec = _vals(d, "sectores")
    if sec and len(sec) < SECTOR_LIST_MAX:
        parts.append("Sectores elegibles: " + "; ".join(sec) + ".")
        specific += 1
    elif sec:
        parts.append(f"Sectores elegibles: {len(sec)} sectores (sin restricción sectorial efectiva).")

    tipo = (d.get("tipoConvocatoria") or "").strip()
    if tipo:
        parts.append("Tipo de convocatoria: " + tipo + ".")

    inst = _vals(d, "instrumentos")
    if inst:
        parts.append("Instrumento: " + "; ".join(inst) + ".")

    pres = d.get("presupuestoTotal")
    if pres:
        parts.append(f"Presupuesto total: {pres:,.0f} EUR.")
        specific += 1

    ini, fin_s = d.get("fechaInicioSolicitud"), d.get("fechaFinSolicitud")
    if ini or fin_s:
        parts.append(f"Plazo de solicitud: {ini or 'n/d'} a {fin_s or 'n/d'}.")
        specific += 1

    bases = (d.get("descripcionBasesReguladoras") or "").strip()
    if bases:
        parts.append("Bases reguladoras: " + bases)
        specific += 1

    conf = "high" if specific >= 4 else "medium" if specific >= 2 else "low"
    return " ".join(parts), conf, specific


def status_of(d: dict) -> str:
    if d.get("abierto"):
        return "open"
    end = d.get("fechaFinSolicitud")
    if end:
        try:
            if dt.date.fromisoformat(end[:10]) >= dt.date.today():
                return "open"
        except ValueError:
            pass
        return "closed"
    return "closed"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--all", action="store_true",
                    help="include leaves that already have text")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = targets(conn, args.all)
    if args.limit:
        rows = rows[:args.limit]
    print(f"{len(rows)} leaves sourced from '{SOURCE_PREFIX}*' awaiting text")

    if args.probe:
        d = fetch_json(f"{API_BASE}/convocatorias/busqueda?page=0&pageSize=1", timeout=45)
        print("API live" if d else "API probe FAILED")
        return
    if not args.run:
        print("[report only] --run to fetch")
        return

    # Resume: never re-fetch what a killed earlier run already landed.
    out: list[dict] = []
    if OUT.exists():
        try:
            out = json.loads(OUT.read_text())
        except Exception:
            out = []
    done = {r.get("instrument_id") for r in out}

    stats = {"open": 0, "closed": 0, "nomatch": 0, "error": 0, "skip": 0}
    for i, r in enumerate(rows, 1):
        if r["id"] in done:
            stats["skip"] += 1
            continue
        rec: dict = {"instrument_id": r["id"], "sa_number": None,
                     "doc_level": "call_register", "language": "es"}
        try:
            best = pick(r["name"], search(r["name"]))
            if not best:
                rec.update(found=False, status="not_found", confidence=None,
                           note="no BDNS convocatoria whose title matches this leaf name")
                stats["nomatch"] += 1
            else:
                cod = str(best.get("numeroConvocatoria"))
                d = detail(cod) or {}
                text, conf, nspec = compose(d)
                st = status_of(d)
                body = ((d.get("organo") or {}).get("nivel3") or "").strip() or None
                url = f"https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/{cod}"
                # The register's word on when this call stopped accepting
                # applications. Same claim `scheme_end_date` already holds for
                # SATR children (migration 023), stated by the register rather
                # than inferred from award recency -- which cannot see it,
                # since a resolved call keeps paying out for years.
                end = (d.get("fechaFinSolicitud") or "")[:10] or None
                rec.update(
                    found=True, status=st, confidence=conf,
                    eligibility_text=text, scheme_end_date=end,
                    description=(d.get("descripcion") or r["name"]),
                    scheme_url=url, source_url=url,
                    eligibility_source_url=d.get("urlBasesReguladoras") or url,
                    administering_body=body,
                    match_basis=f"BDNS codigoBDNS={cod}, title prefix match",
                    note=f"{nspec} discriminating register facts; "
                         f"abierto={d.get('abierto')} fin={d.get('fechaFinSolicitud')}",
                )
                stats[st] += 1
        except Exception as e:  # a refused or broken record is recorded, not retried differently
            rec.update(found=False, status="error", confidence=None, note=repr(e)[:200])
            stats["error"] += 1

        out.append(rec)
        OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))  # write as it lands
        print(f"  [{i}/{len(rows)}] {rec.get('status'):>10}  {r['name'][:64]}")
        time.sleep(DELAY_S)

    print(f"\n{OUT}")
    print("  " + "  ".join(f"{k}={v}" for k, v in stats.items()))


if __name__ == "__main__":
    main()
