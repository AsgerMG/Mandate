"""Sprint 9 orchestrator. Re-runs all 8 analysis queries and writes JSON to site/public/data/."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "analysis"))

import math
import numpy as np
import pandas as pd
from helpers import df, to_json, fmt_eur, COUNTRY_POPULATION_M, save_table, SECTOR_PALETTE

QUERIES = ROOT / "analysis" / "queries"
SITE_DATA = ROOT / "site" / "public" / "data"
SITE_DATA.mkdir(parents=True, exist_ok=True)

FINDINGS = ROOT / "analysis" / "findings" / "_data"
FINDINGS.mkdir(parents=True, exist_ok=True)

def qsql(name: str) -> str:
    return (QUERIES / name).read_text()


# ── q01: Corpus overview ────────────────────────────────────────────────────
def run_q01():
    kpis_row = df(qsql("q01_corpus_overview.sql")).iloc[0]
    by_family = df(qsql("q01b_by_family.sql"))
    by_sector = df(qsql("q01c_by_sector.sql"))
    top_countries = df(qsql("q01d_top_countries.sql"))

    total_capital = float(kpis_row["total_capital_eur"] or 0)
    avg_events = float(kpis_row["total_events"]) / float(kpis_row["total_companies"])

    payload = {
        "kpis": {
            "companies": int(kpis_row["total_companies"]),
            "events": int(kpis_row["total_events"]),
            "total_capital_eur": fmt_eur(total_capital),
            "total_capital_eur_raw": total_capital,
            "source_families": int(kpis_row["total_source_families"]),
            "countries": int(kpis_row["total_countries"]),
            "sectors": int(kpis_row["total_sectors"]),
            "avg_events_per_company": round(avg_events, 2),
        },
        "by_family": by_family.to_dict(orient="records"),
        "by_sector": by_sector.to_dict(orient="records"),
        "top_countries": top_countries.to_dict(orient="records"),
    }
    to_json(payload, SITE_DATA / "q01.json")
    save_table(by_family, FINDINGS / "q01_by_family.csv")
    print("q01 ✓")


# ── q02: Cross-instrument champions ─────────────────────────────────────────
def _build_champion_payload(champions_sql, cooc_sql, sector_compare_sql,
                            entity_filter_sql=""):
    """Build a champion-view payload from a triple of queries.

    `entity_filter_sql` is an optional `AND c.entity_type=...` fragment added to
    the families-map subquery so the top-30 family list matches the population
    that produced the champion list (companies-only or all-entities)."""
    champions = df(qsql(champions_sql))
    cooc = df(qsql(cooc_sql))
    sector_compare = df(qsql(sector_compare_sql))

    families_raw = df(f"""
        SELECT c.canonical_name AS name, GROUP_CONCAT(DISTINCT v.source_family) AS families
        FROM v_company_breadth b
        JOIN companies c ON c.id = b.id
        JOIN v_events v ON v.company_id = b.id
        WHERE b.n_source_families >= 2 {entity_filter_sql}
        GROUP BY b.id
    """)
    families_map = {r["name"]: r["families"].split(",") for _, r in families_raw.iterrows()}

    top30 = champions.head(30).to_dict(orient="records")
    for row in top30:
        row["families"] = families_map.get(row["name"], [])

    return {
        "championCount": int((champions["nFamilies"] >= 2).sum())
            if "nFamilies" in champions.columns else len(champions),
        "topChampions": top30,
        "coOccurrence": cooc.rename(
            columns={"family_a": "familyA", "family_b": "familyB", "co_count": "count"}
        ).to_dict(orient="records"),
        "sectorCompare": sector_compare.to_dict(orient="records"),
    }, champions


def run_q02():
    # All-entities view — backwards-compatible top-level payload.
    all_payload, all_champions = _build_champion_payload(
        "q02_cross_instrument.sql", "q02b_cooccurrence.sql", "q02c_sector_compare.sql",
    )
    # Companies-only view — restores the original Sprint 9 "company punches across
    # instruments" semantics. See Sprint 13 Workstream 0.
    companies_payload, _ = _build_champion_payload(
        "q02_cross_instrument_companies.sql",
        "q02b_cooccurrence_companies.sql",
        "q02c_sector_compare_companies.sql",
        entity_filter_sql="AND c.entity_type = 'company'",
    )

    payload = {
        **all_payload,
        "companiesOnly": companies_payload,
    }
    to_json(payload, SITE_DATA / "q02.json")
    save_table(all_champions, FINDINGS / "q02_champions.csv")
    print(f"q02 ✓  (all={all_payload['championCount']}, "
          f"companies-only={companies_payload['championCount']})")


# ── q03: Country × sector × programme ───────────────────────────────────────
def run_q03():
    country_sector = df(qsql("q03_country_sector.sql"))
    family_sector = df(qsql("q03b_family_sector.sql"))

    # Top 15 countries for the heatmap
    top_countries = (
        country_sector.groupby("country")["companies"].sum()
        .sort_values(ascending=False).head(15).index.tolist()
    )
    cs_top = country_sector[country_sector["country"].isin(top_countries)]

    payload = {
        "country_sector_matrix": cs_top.to_dict(orient="records"),
        "family_sector_matrix": family_sector.to_dict(orient="records"),
        "top_countries": top_countries,
    }
    to_json(payload, SITE_DATA / "q03.json")
    print("q03 ✓")


# ── q04: Concentration & power laws ─────────────────────────────────────────
def gini(values):
    """Compute Gini coefficient for a 1-D array of non-negative values."""
    arr = np.array([float(v) for v in values if v is not None], dtype=float)
    arr = arr[np.isfinite(arr)]
    if len(arr) == 0 or arr.sum() == 0:
        return None
    arr = np.sort(arr)
    n = len(arr)
    cumulative = np.cumsum(arr)
    return float((2 * np.sum((np.arange(1, n + 1)) * arr) - (n + 1) * cumulative[-1]) /
                 (n * cumulative[-1]))


def lorenz_points(values, n_points=20):
    arr = np.array([float(v) for v in values if v is not None], dtype=float)
    arr = arr[np.isfinite(arr) & (arr >= 0)]
    if len(arr) == 0 or arr.sum() == 0:
        return []
    arr = np.sort(arr)
    cumsum = np.cumsum(arr)
    total = cumsum[-1]
    indices = np.linspace(0, len(arr) - 1, n_points, dtype=int)
    points = []
    for i in indices:
        x = round((i + 1) / len(arr), 4)
        y = round(cumsum[i] / total, 4)
        points.append({"x": x, "y": y})
    points = [{"x": 0.0, "y": 0.0}] + points
    return points


def run_q04():
    raw = df(qsql("q04_concentration.sql"))
    families = raw["family"].unique()
    gini_rows = []
    lorenz_rows = []

    for fam in families:
        subset = raw[raw["family"] == fam]["grant_eur"]
        g = gini(subset)
        n = len(subset)
        top10_idx = int(n * 0.1) or 1
        top10_vals = subset.nlargest(top10_idx)
        total = subset.sum()
        top10_share = float(top10_vals.sum() / total) if total > 0 else None

        gini_rows.append({
            "family": fam,
            "gini": round(g, 4) if g is not None else None,
            "n": n,
            "top_decile_share": round(top10_share, 4) if top10_share is not None else None,
        })
        lorenz_rows.append({
            "family": fam,
            "points": lorenz_points(subset),
        })

    gini_rows.sort(key=lambda r: (r["gini"] or 0), reverse=True)

    payload = {
        "gini_by_family": gini_rows,
        "lorenz": lorenz_rows,
    }
    to_json(payload, SITE_DATA / "q04.json")
    print("q04 ✓")


# ── q05: STEP Seal cohort ────────────────────────────────────────────────────
def run_q05():
    by_family = df(qsql("q05_step_cohort.sql"))
    by_country = df(qsql("q05b_step_by_country.sql"))
    by_sector = df(qsql("q05c_step_by_sector.sql"))
    scatter_raw = df(qsql("q05d_step_scatter.sql"))

    np.random.seed(0)
    scatter_raw = scatter_raw.copy()
    scatter_raw["jitter"] = np.random.uniform(-0.15, 0.15, len(scatter_raw))
    scatter_raw["n_source_families_jittered"] = scatter_raw["n_source_families"] + scatter_raw["jitter"]
    scatter_raw["log_grant"] = np.log10(scatter_raw["total_grant_eur"].clip(lower=1))

    payload = {
        "step_rate_by_family": by_family.to_dict(orient="records"),
        "step_rate_by_country": by_country.to_dict(orient="records"),
        "step_rate_by_sector": by_sector.to_dict(orient="records"),
        "step_scatter": scatter_raw[[
            "name", "country", "sector", "total_grant_eur", "log_grant",
            "n_source_families", "n_source_families_jittered", "step_flagged"
        ]].to_dict(orient="records"),
    }
    to_json(payload, SITE_DATA / "q05.json")
    print("q05 ✓")


# ── q06: Time dynamics ───────────────────────────────────────────────────────
def run_q06():
    by_year_family = df(qsql("q06_time_dynamics.sql"))
    sector_mix = df(qsql("q06b_sector_mix_by_period.sql"))

    # Verify total event count reconciliation (gate B6)
    total_from_year = by_year_family["events"].sum()
    all_events = df("SELECT COUNT(*) AS n FROM public_funding_events").iloc[0]["n"]
    events_no_year = df("""
        SELECT COUNT(*) AS n FROM public_funding_events
        WHERE COALESCE(strftime('%Y', project_started), strftime('%Y', call_deadline)) IS NULL
           OR CAST(COALESCE(strftime('%Y', project_started), strftime('%Y', call_deadline)) AS INTEGER) < 2020
    """).iloc[0]["n"]

    payload = {
        "events_per_year": by_year_family.to_dict(orient="records"),
        "sector_mix_shift": sector_mix.to_dict(orient="records"),
        "reconciliation": {
            "total_events": int(all_events),
            "events_in_chart": int(total_from_year),
            "events_pre2020_or_null": int(events_no_year),
        },
    }
    to_json(payload, SITE_DATA / "q06.json")
    print("q06 ✓")


# ── q07: Co-funding network / pipeline ──────────────────────────────────────
def run_q07():
    pairs = df(qsql("q07_cofunding_network.sql"))

    # Add sample companies for each top pair
    sample_rows = []
    for _, row in pairs.head(10).iterrows():
        fa, fb = row["family_a"], row["family_b"]
        samples = df(f"""
            SELECT c.canonical_name AS name
            FROM v_events a
            JOIN v_events b ON a.company_id = b.company_id
            JOIN companies c ON c.id = a.company_id
            WHERE a.source_family = '{fa}' AND b.source_family = '{fb}'
            GROUP BY a.company_id
            LIMIT 3
        """)
        sample_rows.append({
            "family_a": fa,
            "family_b": fb,
            "count": int(row["co_companies"]),
            "sample_companies": samples["name"].tolist(),
        })

    # All families as nodes
    families = df("SELECT DISTINCT source_family AS family FROM v_events")["family"].tolist()
    nodes = [{"id": f, "label": f} for f in families]

    payload = {
        "nodes": nodes,
        "family_pairs": sample_rows,
        "all_pairs": pairs.to_dict(orient="records"),
    }
    to_json(payload, SITE_DATA / "q07.json")
    print("q07 ✓")


# ── q08: Conspicuous gaps ────────────────────────────────────────────────────
def run_q08():
    by_country = df(qsql("q08_gaps.sql"))

    per_capita = []
    for _, row in by_country.iterrows():
        country = row["country"]
        pop = COUNTRY_POPULATION_M.get(country)
        if pop and pop > 0:
            per_capita.append({
                "country": country,
                "companies": int(row["companies"]),
                "population_m": pop,
                "per_million": round(float(row["companies"]) / pop, 2),
                "total_grant_eur": row["total_grant_eur"],
            })

    per_capita.sort(key=lambda r: r["per_million"], reverse=True)

    # Top-15 countries by corpus share vs EU startup population (hard-coded Sifted reference)
    # Approximate relative startup ecosystem sizes (Sifted 2023 country reports, normalised)
    ecosystem_ref = {
        "GB": 19.0, "DE": 14.0, "FR": 12.0, "SE": 7.0, "NL": 6.5,
        "ES": 5.5, "FI": 4.0, "DK": 3.5, "BE": 3.0, "IE": 2.5,
        "AT": 2.0, "IT": 4.5, "PL": 2.5, "CH": 3.0, "NO": 2.0,
    }
    total_corpus = by_country["companies"].sum()
    total_ref = sum(ecosystem_ref.values())
    ecosystem_rows = []
    for c, eco_pct in ecosystem_ref.items():
        corp_row = by_country[by_country["country"] == c]
        corp_n = int(corp_row["companies"].iloc[0]) if len(corp_row) > 0 else 0
        ecosystem_rows.append({
            "country": c,
            "corpus_pct": round(100 * corp_n / total_corpus, 2),
            "ecosystem_pct": round(100 * eco_pct / total_ref, 2),
            "corpus_companies": corp_n,
        })
    ecosystem_rows.sort(key=lambda r: r["ecosystem_pct"], reverse=True)

    payload = {
        "per_capita": per_capita[:25],
        "ecosystem_compare": ecosystem_rows,
        "by_country_raw": by_country.to_dict(orient="records"),
    }
    to_json(payload, SITE_DATA / "q08.json")
    print("q08 ✓")


# ── synthesis JSON ───────────────────────────────────────────────────────────
def run_synthesis():
    """Write a small cross-analysis summary JSON for the synthesis page KPI grid."""
    kpis_row = df("""
        SELECT
          (SELECT COUNT(*) FROM companies) AS companies,
          (SELECT COUNT(*) FROM public_funding_events) AS events,
          (SELECT COUNT(*) FROM v_company_breadth WHERE n_source_families >= 2) AS champions,
          (SELECT COUNT(*) FROM companies WHERE step_flagged = 1) AS step_companies,
          (SELECT SUM(COALESCE(grant_amount_eur,0)+COALESCE(debt_amount_eur,0))
           FROM public_funding_events) AS total_capital_eur,
          (SELECT COUNT(DISTINCT country) FROM companies WHERE country IS NOT NULL) AS countries
    """).iloc[0]

    payload = {
        "companies": int(kpis_row["companies"]),
        "events": int(kpis_row["events"]),
        "champions": int(kpis_row["champions"]),
        "step_companies": int(kpis_row["step_companies"]),
        "total_capital_eur": fmt_eur(float(kpis_row["total_capital_eur"] or 0)),
        "total_capital_eur_raw": float(kpis_row["total_capital_eur"] or 0),
        "countries": int(kpis_row["countries"]),
    }
    to_json(payload, SITE_DATA / "synthesis.json")
    print("synthesis ✓")


if __name__ == "__main__":
    print("Running Sprint 9 analysis orchestrator...")
    run_q01()
    run_q02()
    run_q03()
    run_q04()
    run_q05()
    run_q06()
    run_q07()
    run_q08()
    run_synthesis()
    print("\nAll done. JSON files written to site/public/data/")
