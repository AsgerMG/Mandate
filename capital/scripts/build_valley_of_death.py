"""Build data for the home-page 'Valley of Death' maturity-stage ladder viz.

For each EU instrument + NDB layer + SATR backbone, compute the median and
p10-p90 grant ticket range. Stage positioning (TRL / maturity) is hardcoded
from each instrument's public mandate, since the DB doesn't carry TRL.

Output: site/public/data/valley_of_death.json
"""
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "db.sqlite"
OUT = ROOT / "site" / "public" / "data" / "valley_of_death.json"

# Stage axis: 0 = TRL 1 (basic research), 6 = exit (IPO / M&A).
# Each instrument occupies the stage span it is mandated to cover.
# Sourced from each programme's call documentation, not the DB.
STAGE_DEFS = [
    # (id, label, color, family_filter, stageMin, stageMax)
    ("horizon_eu_pillar_ii", "Horizon Europe Pillar II", "#003399",
     ("source_family", "horizon_eu_pillar_ii"), 0.8, 3.3),
    ("horizon_eu_partnership", "Horizon partnerships (CHP, IHI, EuroHPC)", "#1d4ed8",
     ("source_family", "horizon_eu_partnership"), 1.8, 3.8),
    ("eic", "European Innovation Council", "#0369a1",
     ("source_family", "eic"), 1.5, 4.0),
    ("eit", "EIT Knowledge & Innovation Communities", "#7c3aed",
     ("source_family", "eit"), 1.0, 3.2),
    ("chips_ju", "Chips Joint Undertaking", "#374151",
     ("source_family", "chips_ju"), 2.8, 4.6),
    ("edf", "European Defence Fund", "#78350f",
     ("source_family", "edf"), 2.2, 4.5),
    ("ipcei", "IPCEI", "#b91c1c",
     ("source_family", "ipcei"), 4.0, 5.6),
    ("innovation_fund", "Innovation Fund", "#0891b2",
     ("source_family", "innovation_fund"), 3.8, 5.6),
    ("eib", "EIB venture debt", "#d97706",
     ("source_family", "eib"), 4.0, 5.8),
    ("national_dev_banks", "National development banks", "#15803d",
     ("source_family", "national_dev_banks"), 1.8, 4.8),
    ("state_aid_satr", "State Aid Transparency Register", "#ca8a04",
     ("source_family", "state_aid_satr"), 1.2, 5.4),
]

# Stage tick labels rendered on x-axis
STAGE_TICKS = [
    (0.0, "TRL 1-2", "Basic research"),
    (1.0, "TRL 3-4", "Applied research"),
    (2.0, "TRL 5-6", "Proof of concept"),
    (3.0, "TRL 7", "Prototype"),
    (4.0, "TRL 8", "Commercial demo"),
    (5.0, "Scale-up", "Post-revenue"),
    (6.0, "Exit", "IPO / M&A"),
]

# Where private capital normally takes over. The shaded band is the 'valley'
# between public hand-off and private appetite.
VALLEY = {"xMin": 4.2, "xMax": 5.4, "yMin": 100_000, "yMax": 20_000_000}
PRIVATE_ZONE = {"xMin": 4.6, "xMax": 6.0, "label": "Private VC / equity / debt"}


def percentile(sorted_vals, q):
    if not sorted_vals:
        return None
    idx = max(0, min(len(sorted_vals) - 1, int(len(sorted_vals) * q)))
    return float(sorted_vals[idx])


def main():
    conn = sqlite3.connect(DB)
    ellipses = []
    for nid, label, color, (col, val), x_min, x_max in STAGE_DEFS:
        rows = conn.execute(
            f"SELECT COALESCE(grant_amount_eur, 0) + COALESCE(debt_amount_eur, 0) "
            f"     + COALESCE(equity_amount_eur, 0) AS amt "
            f"FROM v_events WHERE {col} = ? AND ("
            f"  COALESCE(grant_amount_eur, 0) + COALESCE(debt_amount_eur, 0) "
            f"  + COALESCE(equity_amount_eur, 0)) > 0 "
            f"ORDER BY amt",
            (val,),
        ).fetchall()
        vals = [r[0] for r in rows]
        companies = conn.execute(
            f"SELECT COUNT(DISTINCT company_id) FROM v_events "
            f"WHERE {col} = ? AND company_id IS NOT NULL",
            (val,),
        ).fetchone()[0]
        total = conn.execute(
            f"SELECT COALESCE(SUM(grant_amount_eur), 0) FROM v_events WHERE {col} = ?",
            (val,),
        ).fetchone()[0]

        ellipses.append({
            "id": nid,
            "label": label,
            "color": color,
            "stageMin": x_min,
            "stageMax": x_max,
            "ticketP10": percentile(vals, 0.10) or 0,
            "ticketP50": percentile(vals, 0.50) or 0,
            "ticketP90": percentile(vals, 0.90) or 0,
            "companies": int(companies or 0),
            "totalEur": float(total or 0),
            "n": len(vals),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "ellipses": ellipses,
        "stageTicks": [{"x": x, "label": l, "sub": s} for x, l, s in STAGE_TICKS],
        "valley": VALLEY,
        "privateZone": PRIVATE_ZONE,
    }, indent=2))
    print(f"wrote {OUT} -- {len(ellipses)} ellipses")


if __name__ == "__main__":
    main()
