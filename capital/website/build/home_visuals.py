"""Build the instrument leaderboard the home-page taxonomy diagram reads.

Outputs:

  web/public/data/instrument_leaderboard.json
    - rows for each source family (companies, €, median ticket, top sector,
      top country), which the taxonomy diagram links its chips to.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import SITE_DATA  # noqa: E402
from sector_labels import label as sector_label  # noqa: E402
from store import connect  # noqa: E402

OUT_DIR = SITE_DATA

# (id, label, source_family value in v_events, color, glyph, stageMin, stageMax, stageLabel)
INSTRUMENTS = [
    ("horizon_eu_pillar_ii", "Horizon Europe Pillar II", "horizon_eu_pillar_ii",
     "#003399", "Π", 0.05, 0.55, "Research → Product dev"),
    ("horizon_eu_partnership", "Horizon partnerships", "horizon_eu_partnership",
     "#1d4ed8", "π", 0.20, 0.60, "Applied research → Pilot"),
    ("eic", "European Innovation Council", "eic",
     "#0369a1", "◆", 0.25, 0.65, "Prototype → Product dev"),
    ("eit", "EIT KIC", "eit",
     "#7c3aed", "✦", 0.10, 0.50, "Research → Prototype"),
    ("chips_ju", "Chips JU", "chips_ju",
     "#374151", "▲", 0.45, 0.75, "Pilot → Commercial demo"),
    ("edf", "European Defence Fund", "edf",
     "#78350f", "✚", 0.35, 0.75, "Applied research → Demo"),
    ("ipcei", "IPCEI", "ipcei",
     "#b91c1c", "■", 0.65, 0.95, "Commercial demo → Scale-up"),
    ("innovation_fund", "Innovation Fund", "innovation_fund",
     "#0891b2", "✱", 0.60, 0.90, "Demo → Commercial scale-up"),
    ("eib", "EIB venture debt", "eib",
     "#d97706", "$", 0.65, 0.95, "Scale-up → Growth"),
    ("national_dev_banks", "National development banks", "national_dev_banks",
     "#15803d", "◉", 0.25, 0.80, "Seed → Growth"),
    ("state_aid_satr", "National state aid (SATR)", "state_aid_satr",
     "#ca8a04", "▮", 0.15, 0.90, "All stages (national aid)"),
]

def percentile(sorted_vals, q):
    if not sorted_vals:
        return 0.0
    idx = max(0, min(len(sorted_vals) - 1, int(len(sorted_vals) * q)))
    return float(sorted_vals[idx])


def per_instrument_stats(conn, family: str) -> dict:
    """Compute companies, total committed (grant + debt + equity), median ticket,
    top sector, top country for a single source_family."""
    companies = conn.execute(
        "SELECT COUNT(DISTINCT company_id) FROM v_events "
        "WHERE source_family = %s AND company_id IS NOT NULL",
        (family,),
    ).fetchone()[0]

    # The order of the addition is stated, because float addition is not
    # associative and an unordered SUM moves in its last digits with the plan;
    # this figure is published at full precision. (country, company, event) is
    # the order the SQLite store summed in, so the move to Postgres changed no
    # byte of it.
    total_eur = conn.execute(
        "SELECT COALESCE(SUM(COALESCE(v.grant_amount_eur,0) "
        " + COALESCE(v.debt_amount_eur,0) + COALESCE(v.equity_amount_eur,0)"
        ' ORDER BY c.country COLLATE "C", v.company_id, v.id), 0) '
        "FROM v_events v JOIN companies c ON c.id = v.company_id "
        "WHERE v.source_family = %s",
        (family,),
    ).fetchone()[0]

    ticket_rows = conn.execute(
        "SELECT COALESCE(grant_amount_eur,0) + COALESCE(debt_amount_eur,0) "
        "      + COALESCE(equity_amount_eur,0) AS amt "
        "FROM v_events WHERE source_family = %s AND ("
        "  COALESCE(grant_amount_eur,0) + COALESCE(debt_amount_eur,0) "
        "  + COALESCE(equity_amount_eur,0)) > 0 ORDER BY amt",
        (family,),
    ).fetchall()
    tickets = [r[0] for r in ticket_rows]
    median = percentile(tickets, 0.50)

    # A tie in the count breaks on the slug, byte order, rather than on the plan.
    top_sector = conn.execute(
        "SELECT c.sector_top AS s, COUNT(DISTINCT c.id) AS n "
        "FROM v_events v JOIN companies c ON c.id = v.company_id "
        "WHERE v.source_family = %s AND c.sector_top IS NOT NULL "
        "  AND c.sector_top != '' "
        'GROUP BY c.sector_top ORDER BY n DESC, c.sector_top COLLATE "C" LIMIT 1',
        (family,),
    ).fetchone()
    sector_name = sector_label(top_sector[0]) if top_sector else "—"
    sector_n = int(top_sector[1]) if top_sector else 0

    top_country = conn.execute(
        "SELECT c.country, COUNT(DISTINCT c.id) AS n "
        "FROM v_events v JOIN companies c ON c.id = v.company_id "
        "WHERE v.source_family = %s AND c.country IS NOT NULL "
        'GROUP BY c.country ORDER BY n DESC, c.country COLLATE "C" LIMIT 1',
        (family,),
    ).fetchone()

    return {
        "companies": int(companies or 0),
        "totalEur": float(total_eur or 0),
        "medianTicket": float(median),
        "topSector": {"name": sector_name, "companies": sector_n},
        "topCountry": {
            "iso": top_country[0] if top_country else "—",
            "companies": int(top_country[1]) if top_country else 0,
        },
    }


def build_instruments(conn):
    out = []
    for inst_id, label, family, color, glyph, smin, smax, stage_label in INSTRUMENTS:
        stats = per_instrument_stats(conn, family)
        out.append({
            "id": inst_id,
            "label": label,
            "family": family,
            "color": color,
            "glyph": glyph,
            "stageMin": smin,
            "stageMax": smax,
            "stageLabel": stage_label,
            **stats,
        })
    return out



def main():
    with connect(readonly=True) as conn:
        instruments = build_instruments(conn)

    leaderboard = {
        "instruments": sorted(instruments, key=lambda x: -x["totalEur"]),
    }
    (OUT_DIR / "instrument_leaderboard.json").write_text(
        json.dumps(leaderboard, indent=2)
    )

    print(f"wrote {OUT_DIR / 'instrument_leaderboard.json'} -- "
          f"{len(leaderboard['instruments'])} instruments")


if __name__ == "__main__":
    main()
