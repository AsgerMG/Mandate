"""The overlap gate, at instrument grain, before anything is loaded.

── Why this exists and why it is not the usual gate ───────────────────────
The project's HARD RULE is that no national register is loaded until it has
passed the SATR-overlap gate. That gate is written for AWARD events: it asks
whether a new source's rows are already in the corpus under a state-aid
identity, and dedups on beneficiary name + year ± 1 + amount.

This load has no award events at all. It adds nothing to
`public_funding_events` and cannot move a single euro of the corpus totals.
What it can duplicate is INSTRUMENTS -- and it can, because Spain's existing
instruments are convocatorias of exactly the schemes whose current calls this
harvest finds. The gate therefore runs on the identity that actually collides:

  ayudaEstado          the notified aid measure (SA.xxxxxx) the call is made
                       under. 85 of the 87 existing Spanish leaves carry one.
  bases reguladoras    the standing regulatory instrument the call implements.
                       Two convocatorias sharing it are two calls of ONE
                       scheme -- that is what "bases reguladoras" means.
  codigoBDNS           call identity. A collision here would mean the same
                       call twice and is a bug, not a merge.

── The finding this gate produces, which decides the load shape ───────────
An open call that matches an existing leaf is not a new fund. It is THIS
YEAR'S CALL of a fund the corpus already holds, with award history, an
administering body, a sector mix and award percentiles attached -- everything
`meetsDataFloor` requires and everything the ranker scores on. The existing
row is closed only because the corpus recorded a PREVIOUS call's deadline.

So a match is not something to drop. It is the best possible outcome: it
revives a fully-evidenced row rather than adding an evidence-free one.

Only a call matching nothing is a candidate new row, and those are exactly the
rows that have no awards, no award dates and no measured scale -- the
population `meetsDataFloor` was written to keep out, and this script counts
them rather than arguing with it.

Usage:
  python3 ETL/terms/match_bdns_open_calls.py --report
  python3 ETL/terms/match_bdns_open_calls.py --refresh-existing   # 87 detail refetch
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
import re  # noqa: E402
import time  # noqa: E402
import unicodedata  # noqa: E402

from ndb_ssl import fetch_json  # noqa: E402

# This script's own directory, so the harvester's inclusion property is
# IMPORTED rather than restated. There is one definition of what qualifies.
_sys.path.insert(0, str(_Path(__file__).resolve().parent))

API_BASE = "https://www.infosubvenciones.es/bdnstrans/api"
FETCH_RECORDS = ROOT / "data" / "raw" / "scheme_enrichment" / "found_ES_bdns.json"
EXISTING = ROOT / "data" / "raw" / "bdns_open" / "existing_leaf_details.json"

from harvest_bdns_open_calls import (  # noqa: E402
    load_details, qualifies, admissible_policies, budget_floor,
)


def norm_basis(s: str | None) -> str:
    """The regulatory instrument, reduced to what identifies it.

    Bases-reguladoras strings are legal citations that pick up trailing
    descriptive clauses between vintages ("... y se convocan para 2025"), so
    the comparator is the citation head: the instrument type, its number and
    its date, which is the part that names the same instrument every time.
    """
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return " ".join(s.split()[:14])


def load_existing() -> list[dict]:
    """Each existing Spanish leaf with the join keys the register gave it."""
    if EXISTING.exists():
        return json.loads(EXISTING.read_text())
    raise SystemExit(f"{EXISTING} missing -- run --refresh-existing first")


def refresh_existing() -> None:
    """Re-read each existing leaf's convocatoria detail, for its join keys.

    The stored fetch records carry `sa_number` and a composed text, but not
    `descripcionBasesReguladoras` as a field -- it is embedded in prose. The
    join must be exact, so the register is asked again rather than parsed out
    of a sentence. 87 requests.
    """
    recs = json.loads(FETCH_RECORDS.read_text())
    out = []
    for i, r in enumerate(recs, 1):
        m = re.search(r"codigoBDNS=(\d+)", r.get("match_basis") or "")
        if not m:
            out.append({"instrument_id": r["instrument_id"], "codigo": None})
            continue
        d = fetch_json(f"{API_BASE}/convocatorias?numConv={m.group(1)}", timeout=60) or {}
        out.append({
            "instrument_id": r["instrument_id"],
            "codigo": m.group(1),
            "sa_number": (d.get("ayudaEstado") or "").strip() or None,
            "bases": (d.get("descripcionBasesReguladoras") or "").strip() or None,
            "bases_url": (d.get("urlBasesReguladoras") or "").strip() or None,
            "organo3": ((d.get("organo") or {}).get("nivel3") or "").strip() or None,
            "fin_solicitud": (d.get("fechaFinSolicitud") or "")[:10] or None,
        })
        EXISTING.parent.mkdir(parents=True, exist_ok=True)
        EXISTING.write_text(json.dumps(out, ensure_ascii=False, indent=1))
        if i % 20 == 0:
            print(f"  [{i}/{len(recs)}]")
        time.sleep(0.35)
    print(f"{EXISTING}  {len(out)} leaves")


def report(asof: str, min_budget: float) -> None:
    existing = load_existing()
    by_sa: dict[str, list[str]] = {}
    by_basis: dict[str, list[str]] = {}
    by_url: dict[str, list[str]] = {}
    codes = set()
    for e in existing:
        if e.get("codigo"):
            codes.add(e["codigo"])
        if e.get("sa_number"):
            by_sa.setdefault(e["sa_number"], []).append(e["instrument_id"])
        if e.get("bases"):
            by_basis.setdefault(norm_basis(e["bases"]), []).append(e["instrument_id"])
        if e.get("bases_url"):
            by_url.setdefault(e["bases_url"], []).append(e["instrument_id"])
    print(f"existing Spanish leaves: {len(existing)}  "
          f"({len(by_sa)} SA numbers, {len(by_basis)} regulatory bases)\n")

    cached = [r for r in load_details().values() if not r.get("error")]
    pol = admissible_policies()
    admitted = [r["detail"] for r in cached if qualifies(r["detail"], asof, min_budget, pol)]
    print(f"cached details {len(cached)}, admitted by the inclusion property {len(admitted)}\n")

    same_call = []       # identical codigoBDNS -- a bug if it fires
    revive: dict[str, list[dict]] = {}   # instrument_id -> the open calls under it
    fresh = []
    for d in admitted:
        cod = str(d.get("codigoBDNS") or "")
        if cod in codes:
            same_call.append(d)
            continue
        sa = (d.get("ayudaEstado") or "").strip()
        basis = norm_basis(d.get("descripcionBasesReguladoras"))
        url = (d.get("urlBasesReguladoras") or "").strip()
        hit = (by_sa.get(sa) if sa else None) \
            or (by_basis.get(basis) if basis else None) \
            or (by_url.get(url) if url else None)
        if hit:
            for iid in hit:
                revive.setdefault(iid, []).append(d)
        else:
            fresh.append(d)

    print("── the gate ────────────────────────────────────────────────────")
    print(f"  same call already held (would be a duplicate)   {len(same_call)}")
    print(f"  a NEW CALL of a scheme the corpus already holds {sum(len(v) for v in revive.values())}"
          f"  -> {len(revive)} distinct existing leaves revivable")
    print(f"  no scheme in the corpus matches                 {len(fresh)}")
    print()
    print("  the revivable leaves, with the open call found for each")
    for iid, calls in sorted(revive.items(), key=lambda kv: -len(kv[1])):
        best = max(calls, key=lambda d: (d.get("fechaFinSolicitud") or ""))
        print(f"    {iid[:52]:52} -> BDNS {best.get('codigoBDNS')} "
              f"closes {best.get('fechaFinSolicitud')}  ({len(calls)} open call(s))")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--refresh-existing", action="store_true")
    ap.add_argument("--asof", default=dt.date.today().isoformat())
    ap.add_argument("--min-budget", type=float, default=None)
    a = ap.parse_args()
    if a.refresh_existing:
        refresh_existing()
    elif a.report:
        report(a.asof, a.min_budget if a.min_budget is not None else budget_floor())
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
