"""Build the investor-insights datasets the /investors page reads.

Outputs:

  site/public/data/investor_insights.json
    - kpis            corpus headline numbers for the page masthead
    - stack           companies by number of distinct instrument families
    - champions       multi-instrument companies (entity_type='company' only)
    - rotation        sector shares of awards per year, 2021-2025
    - concentration   per instrument family: how concentrated the money is,
                      and what a typical ticket looks like (single-basis only)
    - equity          public equity stakes: holders, disclosure mix, notable
                      exact-percentage positions in operating companies
    - countryMix      per country: events by funding layer (EU direct / NDB /
                      national state aid)

Reads the v_events / v_company_breadth_companies views, so run
website/build/build_site_data.py (which reinstalls data/views.sql first)
rather than calling this directly after a schema change.

Amount discipline: every euro aggregate here is computed within a single
grant_amount_basis per instrument family (the family's dominant basis).
Champion totals are the one exception and are labelled indicative in the UI.
"""
import json
import re
import sqlite3
from datetime import date
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import ROOT, DB, SITE_DATA  # noqa: E402
from synthesis import compute_kpis  # the one canonical corpus-figure definition  # noqa: E402

OUT = SITE_DATA / "investor_insights.json"

YEARS = ["2021", "2022", "2023", "2024", "2025"]
SECTORS = ["cleantech", "deeptech_hardware", "life_sciences", "digital", "defense", "space"]

FAMILY_LABELS = {
    "horizon_eu_pillar_ii": "Horizon Europe Pillar II",
    "horizon_eu_partnership": "Horizon partnerships",
    "eic": "EIC",
    "ipcei": "IPCEI",
    "edf": "European Defence Fund",
    "innovation_fund": "Innovation Fund",
    "eib": "EIB venture debt",
    "eit": "EIT KICs",
    "chips_ju": "Chips JU",
    "national_dev_banks": "National development banks",
    "state_aid_satr": "National state aid",
}

EU_DIRECT_FAMILIES = (
    "eic", "ipcei", "edf", "innovation_fund", "eib", "eit", "chips_ju",
    "horizon_eu_pillar_ii", "horizon_eu_partnership",
)

# Legal-form suffixes that str.title() mangles ("SL" -> "Sl"). Restore their
# canonical casing after title-casing an all-caps name.
LEGAL_SUFFIXES = {
    "sl": "SL", "sa": "SA", "sas": "SAS", "srl": "Srl", "spa": "SpA",
    "gmbh": "GmbH", "ag": "AG", "kg": "KG", "se": "SE", "ug": "UG",
    "oy": "Oy", "oyj": "Oyj", "ab": "AB", "as": "AS", "asa": "ASA",
    "aps": "ApS", "bv": "BV", "nv": "NV", "plc": "Plc", "ltd": "Ltd",
    "llp": "LLP", "sp": "SP", "doo": "d.o.o.", "ou": "OÜ", "sro": "s.r.o.",
}


def pretty_name(name: str) -> str:
    """Title-case an ALL-CAPS legal name while preserving entity suffixes."""
    if not name or not name.isupper():
        return name
    words = name.title().split()
    return " ".join(LEGAL_SUFFIXES.get(w.lower().rstrip("."), w) for w in words)

# Canonical holder ids from public_equity_stakes → display label + home country.
HOLDERS = {
    "uk_future_fund":      ("Future Fund (British Business Bank)", "GB"),
    "pfr_ventures":        ("PFR Ventures", "PL"),
    "htgf":                ("High-Tech Gründerfonds", "DE"),
    "almi_invest":         ("Almi Invest", "SE"),
    "portugal_ventures":   ("Portugal Ventures", "PT"),
    "eic_fund":            ("EIC Fund", "EU"),
    "tesi":                ("Tesi", "FI"),
    "eifo":                ("EIFO", "DK"),
    "investinor":          ("Investinor", "NO"),
    "bayern_kapital":      ("Bayern Kapital", "DE"),
    "ibb_ventures":        ("IBB Ventures", "DE"),
    "cdp_vc":              ("CDP Venture Capital", "IT"),
    "aws_gruendungsfonds": ("aws Gründungsfonds", "AT"),
    "nysno":               ("Nysnø Climate Investments", "NO"),
    "coparion":            ("Coparion", "DE"),
    "hiventures":          ("Hiventures", "HU"),
    "eit_innoenergy":      ("EIT InnoEnergy", "EU"),
    "altum":               ("ALTUM", "LV"),
    "eit_urban_mobility":  ("EIT Urban Mobility", "EU"),
    "eit_manufacturing":   ("EIT Manufacturing", "EU"),
    "isif":                ("ISIF", "IE"),
    "smartcap":            ("SmartCap", "EE"),
    "bpifrance":           ("Bpifrance", "FR"),
    "invest_nl":           ("Invest-NL", "NL"),
}

DISCLOSURE_LABELS = {
    "name_only": "Name only",
    "pct_range": "Percentage range",
    "pct_exact": "Exact percentage",
    "amount": "Euro amount",
}

COUNTRY_NAMES = {
    "FR": "France", "DE": "Germany", "IT": "Italy", "ES": "Spain",
    "GB": "United Kingdom", "NO": "Norway", "NL": "Netherlands",
    "HU": "Hungary", "BE": "Belgium", "CZ": "Czechia", "AT": "Austria",
    "LV": "Latvia", "EE": "Estonia", "DK": "Denmark", "SE": "Sweden",
    "FI": "Finland", "PL": "Poland", "PT": "Portugal", "IE": "Ireland",
    "CH": "Switzerland", "GR": "Greece", "EU": "European Union",
}

# Holding/fund vehicles that pollute the "largest exact stakes" table. The
# interesting rows are operating companies, not the K/S fund structures EIFO
# reports alongside them.
FUND_VEHICLE_RE = re.compile(
    r"K/S|P/S|Komplementar|General Partner|\bGP\b|\bfond(?:s|en)?\b|\bfund\b|"
    r"\bkapital\b|\bventures? [ivx]+\b|\binvest(?:ment)? I?I?\b|\bholding\b|"
    r"L\.?P\.?$|Coöperatief|U\.A\.|Management ApS|\b[IVX]+$|\bSIF-|\bacquisition\b",
    re.IGNORECASE,
)


def percentile(sorted_vals, q):
    if not sorted_vals:
        return 0.0
    idx = max(0, min(len(sorted_vals) - 1, int(len(sorted_vals) * q)))
    return float(sorted_vals[idx])


# Rows that are state interventions, not innovation/industrial policy: the
# 2022 energy-crisis recapitalisations and one scheme-level renewables total
# misattributed to a single company. Excluded from every euro analysis here.
SATR_OUTLIER_SQL = ("project_title NOT LIKE '%Recapitalisation%' "
                    "AND project_title NOT LIKE '%Support to electricity from renewable sources%'")


def build_money_rotation(con):
    """Euros by sector and year within the single largest consistent basis
    (satr_aid_element = national state aid). Counts rotate; this shows
    where the money actually is."""
    rows = con.execute(f"""
        SELECT substr(COALESCE(v.project_started, v.call_deadline),1,4) AS yr,
               c.sector_inferred, SUM(v.grant_amount_eur)
        FROM v_events v JOIN companies c ON c.id = v.company_id
        WHERE v.grant_amount_basis = 'satr_aid_element' AND v.grant_amount_eur > 0
          AND {SATR_OUTLIER_SQL}
          AND yr BETWEEN '2021' AND '2025'
          AND c.sector_inferred IN ({",".join("?" * len(SECTORS))})
        GROUP BY 1, 2
    """, SECTORS).fetchall()
    data = {s: {y: 0.0 for y in YEARS} for s in SECTORS}
    for yr, sector, eur in rows:
        data[sector][yr] = round(eur / 1e9, 2)
    return {
        "years": [int(y) for y in YEARS],
        "sectors": [{"id": s, "eurBn": [data[s][y] for y in YEARS]} for s in SECTORS],
    }


def build_stats(con):
    """Headline stats for the findings callouts. Each is a single number a
    reader can quote."""
    conv = con.execute("""
        WITH conv AS (
          SELECT company_id, MIN(CAST(event_year AS INT)) first_conv
          FROM v_events WHERE source_family IN ('ipcei','innovation_fund') GROUP BY 1
        ), prior AS (
          SELECT DISTINCT v.company_id FROM v_events v JOIN conv ON conv.company_id = v.company_id
          WHERE v.source_family NOT IN ('ipcei','innovation_fund')
            AND CAST(v.event_year AS INT) <= conv.first_conv
        )
        SELECT (SELECT COUNT(*) FROM conv), (SELECT COUNT(*) FROM prior)
    """).fetchone()
    eic = con.execute("""
        WITH early AS (
          SELECT company_id, MIN(CAST(event_year AS INT)) y0 FROM v_events
          WHERE source_family = 'eic' AND CAST(event_year AS INT) <= 2022 GROUP BY 1
        ), later AS (
          SELECT DISTINCT e.company_id FROM v_events v JOIN early e ON e.company_id = v.company_id
          WHERE v.source_family != 'eic' AND CAST(v.event_year AS INT) > e.y0
        )
        SELECT (SELECT COUNT(*) FROM early), (SELECT COUNT(*) FROM later)
    """).fetchone()
    conc = con.execute(f"""
        WITH per_co AS (
          SELECT company_id, SUM(grant_amount_eur) t FROM v_events
          WHERE grant_amount_basis = 'satr_aid_element' AND grant_amount_eur > 0
            AND {SATR_OUTLIER_SQL}
          GROUP BY 1
        ), ranked AS (SELECT t, NTILE(100) OVER (ORDER BY t DESC) pct FROM per_co)
        SELECT COUNT(*), ROUND(SUM(CASE WHEN pct = 1 THEN t ELSE 0 END) / SUM(t) * 100, 1),
               ROUND(SUM(CASE WHEN pct <= 10 THEN t ELSE 0 END) / SUM(t) * 100, 1),
               ROUND(SUM(t) / 1e9, 1)
        FROM ranked
    """).fetchone()
    edf = con.execute("""
        SELECT substr(COALESCE(project_started, call_deadline),1,4) yr,
               ROUND(SUM(grant_amount_eur)/1e9, 2)
        FROM v_events WHERE source_family = 'edf' GROUP BY 1 ORDER BY 1
    """).fetchall()
    # The momentum law: P(at least n+1 awards | n awards), companies only.
    momentum = con.execute("""
        WITH ev AS (
          SELECT v.company_id, COUNT(*) n FROM v_events v
          JOIN companies c ON c.id = v.company_id
          WHERE c.entity_type = 'company' GROUP BY 1
        )
        SELECT ROUND(100.0*SUM(n>=2)/COUNT(*),1),
               ROUND(100.0*SUM(n>=3)/SUM(n>=2),1),
               ROUND(100.0*SUM(n>=5)/SUM(n>=4),1),
               ROUND(100.0*SUM(n>=10)/SUM(n>=9),1)
        FROM ev
    """).fetchone()
    # Bosch as the archetypal subsidy multinational (tight name filter,
    # excludes unrelated Bosch family businesses and the Bosch i Gimpera
    # university foundation).
    bosch = con.execute("""
        SELECT COUNT(DISTINCT c.id), COUNT(DISTINCT c.country),
               COUNT(DISTINCT v.source_family), COUNT(*),
               ROUND(SUM(COALESCE(v.grant_amount_eur,0))/1e9, 1)
        FROM v_events v JOIN companies c ON c.id = v.company_id
        WHERE (UPPER(c.canonical_name) LIKE 'ROBERT BOSCH%'
           OR UPPER(c.canonical_name) LIKE 'BOSCH %'
           OR UPPER(c.canonical_name) IN ('BOSCH','BOSCH DE','BOSCH AT')
           OR UPPER(c.canonical_name) LIKE 'BOSCH REXROTH%'
           OR UPPER(c.canonical_name) LIKE 'BOSCH SENSORTEC%'
           OR UPPER(c.canonical_name) LIKE 'BOSCH DIESEL%')
    """).fetchone()
    # UK Future Fund mortality across quarterly snapshots (exited flags are
    # overwhelmingly insolvencies in this register).
    ff = con.execute("""
        SELECT as_of, COUNT(*), SUM(exited) FROM public_equity_stakes
        WHERE holder = 'uk_future_fund' GROUP BY as_of ORDER BY as_of
    """).fetchall()
    # How slow is public money: EIC is the only family carrying both call
    # deadline and project start at scale.
    eic_speed = con.execute("""
        SELECT CAST(AVG(julianday(project_started)-julianday(call_deadline)) AS INT)
        FROM v_events WHERE source_family='eic'
          AND project_started IS NOT NULL AND call_deadline IS NOT NULL
          AND julianday(project_started) > julianday(call_deadline)
          AND julianday(project_started) - julianday(call_deadline) < 1200
    """).fetchone()
    return {
        "momentum": {"p2": momentum[0], "p3given2": momentum[1],
                     "p5given4": momentum[2], "p10given9": momentum[3]},
        "bosch": {"entities": bosch[0], "countries": bosch[1], "families": bosch[2],
                  "awards": bosch[3], "totalBn": bosch[4]},
        "futureFund": [{"asOf": a, "positions": n, "dead": d} for a, n, d in ff],
        "eicAvgDaysToStart": eic_speed[0],
        "conviction": {"companies": conv[0], "withPriorAward": conv[1],
                       "pct": round(100 * conv[1] / conv[0], 1)},
        "eicCohort": {"companies": eic[0], "wonLater": eic[1],
                      "pct": round(100 * eic[1] / eic[0], 1)},
        "aidConcentration": {"recipients": conc[0], "top1Pct": conc[1],
                             "top10Pct": conc[2], "totalBn": conc[3]},
        "edfPerYear": [{"year": int(y), "eurBn": v} for y, v in edf if y],
    }


def build_kpis(con):
    one = lambda sql: con.execute(sql).fetchone()[0]
    # Corpus-wide companies/events come from the ONE canonical definition
    # (synthesis.compute_kpis), never a local recount, so this file can never show
    # a headline figure that disagrees with synthesis.json. The build guardrail
    # asserts this equality too.
    canon = compute_kpis(con)
    return {
        "companies": canon["companies"],
        "events": canon["events"],
        "families": one("SELECT COUNT(DISTINCT source_family) FROM v_events"),
        "countries": one(
            "SELECT COUNT(DISTINCT country) FROM companies c"
            " JOIN v_events v ON v.company_id = c.id WHERE country != ''"),
        "multiInstrument": one(
            "SELECT COUNT(*) FROM v_company_breadth_companies WHERE n_source_families >= 2"),
        "deepStack": one(
            "SELECT COUNT(*) FROM v_company_breadth_companies WHERE n_source_families >= 3"),
        "veryDeepStack": one(
            "SELECT COUNT(*) FROM v_company_breadth_companies WHERE n_source_families >= 4"),
        "equityPositions": one("SELECT COUNT(*) FROM public_equity_stakes"),
        "equityHolders": one("SELECT COUNT(DISTINCT holder) FROM public_equity_stakes"),
    }


def build_stack(con):
    rows = con.execute("""
        SELECT CASE WHEN n_source_families >= 4 THEN '4+'
                    ELSE CAST(n_source_families AS TEXT) END AS bucket,
               COUNT(*) AS companies
        FROM v_company_breadth_companies
        GROUP BY bucket ORDER BY MIN(n_source_families)
    """).fetchall()
    return [{"families": b, "companies": n} for b, n in rows]


def build_champions(con, limit=200):
    rows = con.execute("""
        SELECT b.id, b.canonical_name, b.country, b.sector_inferred,
               b.n_source_families, b.n_events,
               b.total_grant_eur + b.total_debt_eur AS total_eur
        FROM v_company_breadth_companies b
        WHERE b.n_source_families >= 3
        ORDER BY b.n_source_families DESC, total_eur DESC
        LIMIT ?
    """, (limit,)).fetchall()
    champions = []
    for cid, name, country, sector, n_fam, n_ev, total in rows:
        # per-channel breakdown for the drill-down: events + indicative euros by family
        brk = con.execute("""
            SELECT source_family,
                   COUNT(*) AS events,
                   COALESCE(SUM(COALESCE(grant_amount_eur,0)+COALESCE(debt_amount_eur,0)),0) AS eur
            FROM v_events WHERE company_id = ?
            GROUP BY source_family
        """, (cid,)).fetchall()
        fam_order = lambda f: list(FAMILY_LABELS).index(f) if f in FAMILY_LABELS else 99
        breakdown = sorted(
            [{"family": f, "events": ev, "eur": round(e or 0)} for f, ev, e in brk],
            key=lambda d: (-d["eur"], fam_order(d["family"])),
        )
        champions.append({
            "name": pretty_name(name),
            "country": country,
            "sector": sector or "unclassified",
            "nFamilies": n_fam,
            "families": sorted([b["family"] for b in breakdown], key=fam_order),
            "breakdown": breakdown,
            "nEvents": n_ev,
            "totalEur": round(total or 0),
        })
    return champions


def build_rotation(con):
    counts = {s: {y: 0 for y in YEARS} for s in SECTORS}
    year_totals = {y: 0 for y in YEARS}
    rows = con.execute("""
        SELECT v.event_year, c.sector_inferred, COUNT(*)
        FROM v_events v JOIN companies c ON c.id = v.company_id
        WHERE v.event_year BETWEEN '2021' AND '2025'
          AND c.sector_inferred IN ({})
        GROUP BY 1, 2
    """.format(",".join("?" * len(SECTORS))), SECTORS).fetchall()
    for year, sector, n in rows:
        counts[sector][year] = n
        year_totals[year] += n
    return {
        "years": [int(y) for y in YEARS],
        "sectors": [
            {
                "id": s,
                "counts": [counts[s][y] for y in YEARS],
                "shares": [round(counts[s][y] / year_totals[y], 4) if year_totals[y] else 0
                           for y in YEARS],
            }
            for s in SECTORS
        ],
    }


def build_concentration(con):
    out = []
    for family, label in FAMILY_LABELS.items():
        dom = con.execute("""
            SELECT grant_amount_basis, COUNT(*) FROM v_events
            WHERE source_family = ? AND grant_amount_eur > 0
              AND grant_amount_basis IS NOT NULL
            GROUP BY 1 ORDER BY 2 DESC LIMIT 1
        """, (family,)).fetchone()
        if not dom or dom[1] < 100:
            continue  # too thin for distribution claims (drops EIB: debt ceilings, no grants)
        basis = dom[0]
        tickets = [r[0] for r in con.execute("""
            SELECT grant_amount_eur FROM v_events
            WHERE source_family = ? AND grant_amount_basis = ?
              AND grant_amount_eur > 0 ORDER BY grant_amount_eur
        """, (family, basis))]
        per_company = [r[0] for r in con.execute("""
            SELECT SUM(grant_amount_eur) AS s FROM v_events
            WHERE source_family = ? AND grant_amount_basis = ?
              AND grant_amount_eur > 0
            GROUP BY company_id ORDER BY s DESC
        """, (family, basis))]
        total = sum(per_company)
        out.append({
            "id": family,
            "label": label,
            "basis": basis,
            "events": len(tickets),
            "companies": len(per_company),
            "totalEur": round(total),
            "top10Share": round(sum(per_company[:10]) / total, 4) if total else 0,
            "medianTicket": round(percentile(tickets, 0.5)),
            "p90Ticket": round(percentile(tickets, 0.9)),
        })
    out.sort(key=lambda r: r["totalEur"], reverse=True)
    return out


def build_equity(con):
    holder_rows = con.execute("""
        SELECT holder, holder_type, COUNT(*),
               SUM(disclosure_level = 'name_only'),
               SUM(disclosure_level IN ('pct_range', 'pct_exact')),
               SUM(disclosure_level = 'amount')
        FROM public_equity_stakes GROUP BY 1, 2 ORDER BY 3 DESC
    """).fetchall()
    holders = []
    for holder, htype, n, name_only, pct, amount in holder_rows:
        label, country = HOLDERS.get(holder, (holder, ""))
        holders.append({
            "id": holder, "label": label, "country": country, "type": htype,
            "positions": n, "nameOnly": name_only, "pct": pct, "amount": amount,
        })

    disclosure = [
        {"level": lvl, "label": DISCLOSURE_LABELS[lvl], "positions": n}
        for lvl, n in con.execute("""
            SELECT disclosure_level, COUNT(*) FROM public_equity_stakes GROUP BY 1
        """)
    ]
    disclosure.sort(key=lambda d: list(DISCLOSURE_LABELS).index(d["level"]))

    stake_rows = con.execute("""
        SELECT c.canonical_name, c.country, s.holder, s.stake_pct_max, s.as_of
        FROM public_equity_stakes s JOIN companies c ON c.id = s.company_id
        WHERE s.disclosure_level = 'pct_exact' AND s.exited = 0
          AND s.stake_pct_max IS NOT NULL
        ORDER BY s.stake_pct_max DESC
    """).fetchall()
    # Cap each holder at four rows so the table shows the breadth of the
    # disclosure landscape (Tesi alone would otherwise fill it), and skip
    # fund vehicles so every row is an operating company.
    notable, per_holder = [], {}
    for name, country, holder, pct, as_of in stake_rows:
        if FUND_VEHICLE_RE.search(name) or per_holder.get(holder, 0) >= 4:
            continue
        per_holder[holder] = per_holder.get(holder, 0) + 1
        notable.append({
            "company": pretty_name(name),
            "country": country,
            "holder": HOLDERS.get(holder, (holder, ""))[0],
            "pct": pct,
            "asOf": as_of,
        })
        if len(notable) >= 14:
            break
    notable.sort(key=lambda s: s["pct"], reverse=True)

    return {
        "totalPositions": sum(h["positions"] for h in holders),
        "holders": holders,
        "disclosure": disclosure,
        "notableStakes": notable,
    }


def build_country_mix(con, top_n=12):
    rows = con.execute("""
        SELECT c.country,
               SUM(CASE WHEN v.source_family IN ({eu}) THEN 1 ELSE 0 END),
               SUM(CASE WHEN v.source_family = 'national_dev_banks' THEN 1 ELSE 0 END),
               SUM(CASE WHEN v.source_family = 'state_aid_satr' THEN 1 ELSE 0 END),
               COUNT(*) AS total
        FROM v_events v JOIN companies c ON c.id = v.company_id
        WHERE c.country != ''
        GROUP BY 1 ORDER BY total DESC LIMIT ?
    """.format(eu=",".join(f"'{f}'" for f in EU_DIRECT_FAMILIES)), (top_n,)).fetchall()
    return [
        {
            "iso2": iso2,
            "name": COUNTRY_NAMES.get(iso2, iso2),
            "euDirect": eu, "ndb": ndb, "stateAid": aid, "total": total,
        }
        for iso2, eu, ndb, aid, total in rows
    ]


def main():
    con = sqlite3.connect(DB)
    try:
        payload = {
            "generatedAt": date.today().isoformat(),
            "kpis": build_kpis(con),
            "stats": build_stats(con),
            "moneyRotation": build_money_rotation(con),
            "stack": build_stack(con),
            "champions": build_champions(con),
            "rotation": build_rotation(con),
            "concentration": build_concentration(con),
            "equity": build_equity(con),
            "countryMix": build_country_mix(con),
        }
    finally:
        con.close()
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"  champions: {len(payload['champions'])}, "
          f"concentration families: {len(payload['concentration'])}, "
          f"notable stakes: {len(payload['equity']['notableStakes'])}")


if __name__ == "__main__":
    main()
