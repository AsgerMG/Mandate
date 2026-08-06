"""Turn Spain's qualifying OPEN convocatorias into instruments, in SQLite.

── Order of writes, learned the hard way ──────────────────────────────────
SQLite is the authoring source of truth and `migrate_to_postgres.py` is a full
TRUNCATE + reinsert from it. So this writes SQLite, and a scoped publisher
(`publish_new_instruments_scoped.py`) carries only these ids to Postgres --
a full publish would clobber every other workstream writing Postgres tonight,
which is the same reason `publish_scheme_text_scoped.py` exists.

── What each row claims, and what it does not ─────────────────────────────
Composed from register fields verbatim. Nothing is inferred, translated or
summarised, and no field absent from the register is invented.

  scheme_end_date        `fechaFinSolicitud`, basis `call_deadline`. This is a
                         convocatoria's plazo, which the liveness module names
                         explicitly: past means permanently closed. It is NOT a
                         notified_duration and must never be recorded as one.
  scheme_code            `ayudaEstado` when the register states one, else ''.
                         The SA number is what the corpus means by a scheme
                         code, and it is the join to the Commission's register.
  capital_type           mapped from the register's `instrumentos` enumeration;
                         several distinct classes on one call is `blended`.
  administering_body     `organo.nivel3`, with a NULL share -- a register
                         statement has no observed share, and inventing 1.0
                         would claim we measured a distribution.
  event_count/total_eur  ZERO, and left zero. These rows have no awards. Writing
                         `presupuestoTotal` into `total_eur` would state
                         observed awards that were never observed, and writing
                         it into `award_p50` would be worse: a EUR 10M call may
                         make five awards or five hundred, so a per-award figure
                         derived from a budget is a fabrication.

── The one rule this load required, and its blast radius ──────────────────
`meetsDataFloor` admitted an instrument only on `total_eur > 0 OR last_year`,
so a call with no awards yet could never be proposed however live it is. That
rule is right about its own population and wrong about this one: it exists
because "every scale and liveness judgement about it is a guess", and a
register-stated application window that has not passed is the STRONGEST
liveness fact in the corpus -- strictly better than `last_year`, which the
floor already accepts at five years old.

The amendment is in `accessMode.ts`, is general (any register publishing call
deadlines satisfies it), and was measured before adoption: of the 41 instruments
that fail the current floor, **0** have a future `call_deadline`, so it admits
nothing that exists today and cannot change any other country's pool. It also
loosens nothing about scale -- these rows still take `awardScorer`'s 1.0, the
same neutral the corpus already gives 98 instruments with no award median.

── Not a regime ───────────────────────────────────────────────────────────
The rows are parent-less. A `parent_id` in this corpus means "leaves of one
notified scheme", and these calls come from dozens of bodies under dozens of
regulatory bases -- inventing a parent to hold them would assert a regime that
does not exist, and would also hide them from `measure_sibling_coverage.ts` by
making them one enormous group. Provenance lives where it belongs, in
`funding_instrument_sources`, so the whole layer is one DELETE away.

Usage:
  python3 ETL/terms/load_bdns_open_calls.py --report
  python3 ETL/terms/load_bdns_open_calls.py --write
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB  # noqa: E402
# --- end ETL path bootstrap ---
_sys.path.insert(0, str(_Path(__file__).resolve().parent))

import argparse  # noqa: E402
import datetime as dt  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

from harvest_bdns_open_calls import (  # noqa: E402
    load_details, clauses, discriminators, admissible_policies, _descs, _norm,
)
from match_bdns_open_calls import load_existing, norm_basis  # noqa: E402

SOURCE_TAG = "bdns_es_convocatorias_abiertas"
ID_PREFIX = "bdns_conv_"
COUNTRY = "ES"
NDB_ID = "bdns"
BUCKET = "state_aid_satr"
CALL_URL = "https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/"

# The register's aid-instrument enumeration -> the corpus's capital_type
# vocabulary (the SQLite CHECK constraint). Keyed on the register's own strings,
# so a vocabulary change surfaces as `unknown` rather than as a silent mapping.
CAPITAL_TYPE = {
    "SUBVENCIÓN Y ENTREGA DINERARIA SIN CONTRAPRESTACIÓN": "grant",
    "PRÉSTAMO": "loan",
    "GARANTÍA": "guarantee",
    "VENTAJA FISCAL": "tax_credit",
    "APORTACIÓN DE FINANCIACIÓN RIESGO": "equity",
    "OTROS INSTRUMENTOS DE AYUDA": "unknown",
}


def budget_floor(conn: sqlite3.Connection) -> float:
    """The smallest stated budget among the instruments the corpus ALREADY
    publishes for this country.

    Derived, never typed. Admitting a EUR 300k open call while already
    publishing a EUR 300k closed one is the only non-contradictory position,
    and the floor moves on its own if the corpus's existing floor moves. Read
    out of the stored fetch records, which are where the register's stated
    budgets for the existing leaves live.
    """
    import re
    from etl_env import ROOT
    p = ROOT / "data" / "raw" / "scheme_enrichment" / "found_ES_bdns.json"
    buds = []
    for r in json.loads(p.read_text()):
        m = re.search(r"Presupuesto total: ([\d,]+) EUR", r.get("eligibility_text") or "")
        if m:
            buds.append(float(m.group(1).replace(",", "")))
    if not buds:
        raise SystemExit("no stated budgets on the existing leaves -- floor undefined")
    return min(buds)


def capital_type_of(d: dict) -> tuple[str, str]:
    kinds = {CAPITAL_TYPE.get(i.strip(), "unknown") for i in _descs(d, "instrumentos")}
    kinds.discard("unknown")
    if not kinds:
        return "unknown", "bdns instrumentos: none stated"
    basis = "bdns instrumentos: " + "; ".join(sorted(_descs(d, "instrumentos")))
    return (kinds.pop() if len(kinds) == 1 else "blended"), basis[:300]


def compose(d: dict) -> tuple[str, str]:
    """The register's facts, in the order a founder reads them.

    Same shape as `fetch_bdns_convocatorias.compose`, and deliberately the same
    omission: the beneficiary enumeration is stated but never counted toward
    confidence, because across the existing 87 leaves it takes 6 distinct values
    and leaves a mean sibling class of 45.3 -- it is boilerplate the whole
    register shares.
    """
    parts = []
    ben = _descs(d, "tiposBeneficiarios")
    if ben:
        parts.append("Beneficiarios: " + "; ".join(ben) + ".")
    reg = _descs(d, "regiones")
    if reg:
        parts.append("Ámbito regional: " + "; ".join(reg) + ".")
    fin = (d.get("descripcionFinalidad") or "").strip()
    if fin:
        parts.append("Finalidad: " + fin + ".")
    sec = _descs(d, "sectores")
    if sec and len(sec) < 8:
        parts.append("Sectores elegibles: " + "; ".join(sec) + ".")
    elif sec:
        parts.append(f"Sectores elegibles: {len(sec)} sectores (sin restricción sectorial efectiva).")
    tipo = (d.get("tipoConvocatoria") or "").strip()
    if tipo:
        parts.append("Tipo de convocatoria: " + tipo + ".")
    inst = _descs(d, "instrumentos")
    if inst:
        parts.append("Instrumento: " + "; ".join(inst) + ".")
    reglam = ((d.get("reglamento") or {}) or {}).get("descripcion")
    if reglam:
        parts.append("Régimen de ayudas: " + reglam.strip() + ".")
    pres = d.get("presupuestoTotal")
    if pres:
        parts.append(f"Presupuesto total: {float(pres):,.0f} EUR.")
    ini, fn = d.get("fechaInicioSolicitud"), d.get("fechaFinSolicitud")
    parts.append(f"Plazo de solicitud: {ini or 'n/d'} a {fn or 'n/d'}.")
    bases = (d.get("descripcionBasesReguladoras") or "").strip()
    if bases:
        parts.append("Bases reguladoras: " + bases)
    n = len(discriminators(d))
    return " ".join(parts), ("high" if n >= 4 else "medium" if n >= 2 else "low")


def build_rows(asof: str, floor: float) -> tuple[list[dict], dict[str, list[dict]], dict]:
    """Every admitted call, split into the two things it can be.

    Returns (new rows, revivals, stats). A call under a scheme the corpus
    already holds is NOT a new row -- it is that scheme's current call, and it
    revives the existing, fully-evidenced leaf instead.
    """
    policies = admissible_policies()
    existing = load_existing()
    held_codes = {e["codigo"] for e in existing if e.get("codigo")}

    stats = {"cached": 0, "admitted": 0, "dup_call": 0, "same_scheme": 0, "new": 0}
    rows: list[dict] = []
    revivals: dict[str, list[dict]] = {}
    for rec in load_details().values():
        if rec.get("error"):
            continue
        stats["cached"] += 1
        d = rec["detail"]
        if not all(clauses(d, asof, floor, policies).values()):
            continue
        stats["admitted"] += 1
        cod = str(d.get("codigoBDNS") or "")
        if not cod or cod in held_codes:
            stats["dup_call"] += 1
            continue
        sa = (d.get("ayudaEstado") or "").strip()
        # ── The overlap gate, applied ────────────────────────────────────
        # A call under a scheme the corpus already holds is NOT loaded as a new
        # instrument -- it is that scheme's current call, and adding it would
        # put two rows for one fund in front of a founder. It is recorded for
        # the revival pass instead, which moves the existing, fully-evidenced
        # row's window forward rather than creating an evidence-free twin.
        hit = [e["instrument_id"] for e in existing
               if (sa and e.get("sa_number") == sa)
               or (e.get("bases") and norm_basis(e["bases"])
                   == norm_basis(d.get("descripcionBasesReguladoras")))]
        if hit:
            stats["same_scheme"] += 1
            for iid in hit:
                revivals.setdefault(iid, []).append(d)
            continue
        stats["new"] += 1
        text, conf = compose(d)
        cap, cap_basis = capital_type_of(d)
        rows.append({
            "id": ID_PREFIX + cod,
            "name": (d.get("descripcion") or "").strip()[:400],
            "name_source": "programme_feed",
            "country": COUNTRY,
            "administering_body": ((d.get("organo") or {}).get("nivel3") or "").strip() or None,
            "ndb_id": NDB_ID,
            "source_family_bucket": BUCKET,
            "capital_type": cap,
            "capital_type_basis": cap_basis,
            "is_framework": 0,
            "tier": "programme",
            "depth": 0,
            "scheme_code": sa or "",
            "application_url": CALL_URL + cod,
            "scheme_end_date": (d.get("fechaFinSolicitud") or "")[:10],
            "scheme_end_date_basis": "call_deadline",
            "description": (d.get("descripcion") or "").strip()[:1000],
            "eligibility_text": text,
            "eligibility_source_url": (d.get("urlBasesReguladoras") or "").strip()
                                      or (CALL_URL + cod),
            "eligibility_confidence": conf,
            "eligibility_fetched_at": dt.datetime.now().isoformat(timespec="seconds"),
        })
    return rows, revivals, stats


COLUMNS = ("id", "parent_id", "name", "name_source", "country", "administering_body",
           "ndb_id", "source_family_bucket", "capital_type", "capital_type_basis",
           "event_count", "company_count", "total_eur", "is_framework", "tier",
           "root_id", "depth", "path", "scheme_code", "application_url",
           "scheme_end_date", "scheme_end_date_basis", "description",
           "eligibility_text", "eligibility_source_url", "eligibility_confidence",
           "eligibility_fetched_at")


def write(rows: list[dict]) -> None:
    conn = sqlite3.connect(DB)
    conn.execute("PRAGMA foreign_keys=ON")
    n_ins = n_upd = 0
    for r in rows:
        rec = dict(r)
        rec.update(parent_id=None, root_id=r["id"], path=r["id"],
                   event_count=0, company_count=0, total_eur=0.0)
        vals = [rec.get(c) for c in COLUMNS]
        cur = conn.execute(
            f"INSERT INTO funding_instruments ({','.join(COLUMNS)}) "
            f"VALUES ({','.join('?' * len(COLUMNS))}) "
            # Re-runnable: a second harvest of the same call must refresh its
            # window and text, not fail or duplicate. `updated_at` is bumped so
            # a row that stopped being refreshed is visible as stale.
            f"ON CONFLICT(id) DO UPDATE SET "
            + ", ".join(f"{c}=excluded.{c}" for c in COLUMNS if c != "id")
            + ", updated_at=CURRENT_TIMESTAMP", vals)
        n_ins += cur.rowcount
        conn.execute("INSERT OR IGNORE INTO funding_instrument_sources "
                     "(instrument_id, source) VALUES (?,?)", (r["id"], SOURCE_TAG))
    conn.commit()
    print(f"SQLite: {len(rows)} rows written ({SOURCE_TAG})")
    conn.close()


def write_revivals(revivals: dict[str, list[dict]]) -> None:
    """Point a closed leaf at the call that is open under its own scheme.

    The corpus already has this mechanism and it was built for exactly this
    claim: `successor_scheme` / `successor_title` mean "the register says this
    fund continues under a new identity", and `publishableInstruments()`
    republishes such a row under the successor's identity with the award
    history still attached, because that is the registration a founder would
    actually apply under.

    So no new row is created. The leaf keeps its 59 awards, its administering
    body, its sector mix and its award percentiles -- everything a founder is
    ranked on -- and starts presenting itself as the call that is open now.

    Its OWN `scheme_end_date` is left alone, past and closed, because that is
    the true fact about the call the row was built from. The redirect is what
    carries the new window, and re-running this pass clears a successor whose
    call has since shut, so a leaf cannot silently outlive its revival.
    """
    conn = sqlite3.connect(DB)
    n = 0
    for iid, calls in revivals.items():
        best = max(calls, key=lambda d: (d.get("fechaFinSolicitud") or ""))
        conn.execute(
            "UPDATE funding_instruments SET successor_scheme=?, successor_title=?, "
            "updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (str(best.get("codigoBDNS")), (best.get("descripcion") or "").strip()[:400], iid))
        n += 1
    # Retract a revival whose call has since closed and that this run did not
    # re-find. Without this the corpus would keep a dead call in front of a
    # founder under a successor title, which is the failure the whole workstream
    # exists to undo, wearing the fix's clothes.
    conn.execute(
        "UPDATE funding_instruments SET successor_scheme=NULL, successor_title=NULL "
        "WHERE country=? AND successor_scheme IS NOT NULL AND id NOT IN (%s)"
        % (",".join("?" * len(revivals)) or "''"),
        (COUNTRY, *revivals.keys()))
    conn.commit()
    conn.close()
    print(f"SQLite: {n} leaves revived through the successor redirect")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--asof", default=dt.date.today().isoformat())
    a = ap.parse_args()

    conn = sqlite3.connect(DB)
    floor = budget_floor(conn)
    conn.close()
    print(f"budget floor, derived from the corpus's own ES inventory: EUR {floor:,.0f}\n")
    rows, revivals, stats = build_rows(a.asof, floor)
    for k in ("cached", "admitted", "dup_call", "same_scheme", "new"):
        print(f"  {k:14} {stats[k]}")
    from collections import Counter
    print("\n  capital_type:", dict(Counter(r["capital_type"] for r in rows)))
    print("  confidence  :", dict(Counter(r["eligibility_confidence"] for r in rows)))
    bodies = Counter(_norm(r["administering_body"]) for r in rows)
    print(f"  distinct administering bodies: {len(bodies)} over {len(rows)} rows"
          f"   mean class {sum(bodies[_norm(r['administering_body'])] for r in rows)/max(len(rows),1):.1f}")
    texts = Counter(_norm(r["eligibility_text"])[:400] for r in rows)
    print(f"  distinct eligibility texts   : {len(texts)} over {len(rows)} rows"
          f"   mean class {sum(texts[_norm(r['eligibility_text'])[:400]] for r in rows)/max(len(rows),1):.1f}")
    print(f"\n  revivals: {len(revivals)} existing leaves have an open call under their own scheme")
    for iid, calls in sorted(revivals.items(), key=lambda kv: -len(kv[1])):
        best = max(calls, key=lambda d: (d.get("fechaFinSolicitud") or ""))
        print(f"    {iid[:56]:56} -> BDNS {best.get('codigoBDNS')} closes {best.get('fechaFinSolicitud')}")
    if a.write:
        write(rows)
        write_revivals(revivals)
    else:
        print("\n[report only] --write to load")


if __name__ == "__main__":
    main()
