"""
Generate per-country map data for the landing page Europe map.

Output: website/frontend/public/data/country_map.json
Schema:
  {
    "countries": {
      "DE": {
        "name": "Germany",
        "companies": 2633,
        "totalEur": 15027519650,
        "byFamily": [
          {"family": "horizon_eu", "label": "Horizon EU", "companies": 1694},
          ...
        ]
      },
      ...
    }
  }
"""
import sqlite3
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import DB_PATH, SITE_DATA, DATA  # noqa: E402
from sector_labels import label as sector_label  # noqa: E402

OUT_PATH = str(SITE_DATA / "country_map.json")
SCOPE_PATH = str(DATA / "europe_scope.json")

# Single source of truth for the corpus's Europe scope. See docs/europe_scope.md
# for the rationale. Edit data/europe_scope.json — not this file — to change.
with open(SCOPE_PATH) as _f:
    _SCOPE = json.load(_f)

COUNTRY_NAMES = {c["iso2"]: c["name"] for c in _SCOPE["countries"]}
EUROPEAN_ALLOWLIST = set(COUNTRY_NAMES.keys())
COUNTRY_ALIASES = dict(_SCOPE["aliases"])

FAMILY_LABELS = {
    "horizon_eu":     "Horizon EU",
    "eic":            "EIC",
    "eit":            "EIT KIC",
    "ipcei":          "IPCEI",
    "innovation_fund":"Innovation Fund",
    "eib":            "EIB",
    "edf":            "EDF",
    "chips_ju":       "Chips JU",
    "ndb":            "National Dev. Banks",
    "state_aid":      "State Aid (SATR)",
}

FAMILY_ORDER = ["state_aid", "horizon_eu", "ndb", "eic", "eit", "ipcei", "innovation_fund", "eib", "edf", "chips_ju"]

def source_to_family(source: str) -> str:
    if source.startswith("satr_"):            return "state_aid"
    if source.startswith("eic_"):             return "eic"
    if source.startswith("eit_"):             return "eit"
    if source.startswith("ipcei_"):           return "ipcei"
    if source.startswith("innovation_fund_"): return "innovation_fund"
    if source.startswith("eib_"):             return "eib"
    if source.startswith("edf_"):             return "edf"
    if source.startswith("chips_ju_"):        return "chips_ju"
    if (source.startswith("horizon_eu_") or
        source.startswith("eurohpc_") or
        source.startswith("ihi_") or
        source.startswith("chp_")):           return "horizon_eu"
    return "ndb"


def canonical(code: str | None) -> str | None:
    if not code:
        return None
    code = code.strip().upper()
    code = COUNTRY_ALIASES.get(code, code)
    return code if code in EUROPEAN_ALLOWLIST else None


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 2026-07-08 country-scope reduction: v_country_public_support (installed
    # from data/views.sql) is the single €1B-threshold definition. Countries
    # with in_corpus = 0 are excluded from every stat, rank and chart here,
    # but still emitted as {"excluded": true} stubs so the map can render them
    # with the standing "not in the corpus" hover instead of a dead area.
    in_corpus = {
        row[0] for row in cur.execute(
            "SELECT country FROM v_country_public_support WHERE in_corpus = 1")
    }

    # Per-country: company count and total EUR (post-canonicalisation)
    cur.execute("""
        SELECT
            c.country,
            COUNT(DISTINCT c.id) AS companies,
            COALESCE(SUM(e.grant_amount_eur), 0) AS total_eur
        FROM companies c
        LEFT JOIN public_funding_events e ON e.company_id = c.id
        WHERE c.country IS NOT NULL AND c.country != ''
        GROUP BY c.country
    """)
    raw_country_rows = cur.fetchall()

    # Merge aliases + drop non-European and below-threshold entries
    merged: dict[str, dict[str, float]] = {}
    for country, companies, total_eur in raw_country_rows:
        canon = canonical(country)
        if canon is None or canon not in in_corpus:
            continue
        agg = merged.setdefault(canon, {"companies": 0, "total_eur": 0.0})
        agg["companies"] += companies
        agg["total_eur"] += total_eur or 0
    country_rows = sorted(
        [(c, int(v["companies"]), v["total_eur"]) for c, v in merged.items()],
        key=lambda r: r[1],
        reverse=True,
    )

    # Per-country + family: distinct companies
    cur.execute("""
        SELECT c.country, e.source, COUNT(DISTINCT e.company_id) AS companies
        FROM public_funding_events e
        JOIN companies c ON c.id = e.company_id
        WHERE c.country IS NOT NULL AND c.country != ''
        GROUP BY c.country, e.source
    """)
    source_rows = cur.fetchall()

    # Per-country + sector: distinct companies (from companies.sector_top, the
    # broad Tier-1 of the two-tier taxonomy).
    cur.execute("""
        SELECT c.country, COALESCE(NULLIF(c.sector_top,''), 'unclassified') AS sector,
               COUNT(DISTINCT c.id) AS companies
        FROM companies c
        WHERE c.country IS NOT NULL AND c.country != ''
        GROUP BY c.country, sector
    """)
    sector_rows = cur.fetchall()
    by_country_sector: dict[str, dict[str, int]] = {}
    for country, sector, count in sector_rows:
        canon = canonical(country)
        if canon is None:
            continue
        bucket = by_country_sector.setdefault(canon, {})
        bucket[sector] = bucket.get(sector, 0) + count

    # Aggregate source -> family per country (canonicalised + filtered)
    by_country_family: dict[str, dict[str, int]] = {}
    for country, source, count in source_rows:
        canon = canonical(country)
        if canon is None:
            continue
        family = source_to_family(source)
        if canon not in by_country_family:
            by_country_family[canon] = {}
        by_country_family[canon][family] = by_country_family[canon].get(family, 0) + count

    # Ranks for narrative copy
    co_sorted = sorted(country_rows, key=lambda r: r[1], reverse=True)
    eur_sorted = sorted(country_rows, key=lambda r: r[2] or 0, reverse=True)
    rank_by_co = {r[0]: i + 1 for i, r in enumerate(co_sorted)}
    rank_by_eur = {r[0]: i + 1 for i, r in enumerate(eur_sorted)}
    total_countries = len(country_rows)

    result: dict[str, dict] = {}
    for country, companies, total_eur in country_rows:
        name = COUNTRY_NAMES.get(country, country)
        families_raw = by_country_family.get(country, {})
        by_family = []
        for fam in FAMILY_ORDER:
            if fam in families_raw and families_raw[fam] > 0:
                by_family.append({
                    "family": fam,
                    "label": FAMILY_LABELS[fam],
                    "companies": families_raw[fam],
                })

        sectors_raw = by_country_sector.get(country, {})
        by_sector_sorted = sorted(
            ((s, n) for s, n in sectors_raw.items() if s != "unclassified" and n > 0),
            key=lambda x: x[1],
            reverse=True,
        )
        by_sector = [
            {"sector": s, "label": sector_label(s), "companies": n}
            for s, n in by_sector_sorted
        ]

        # Dominant family for narrative
        dominant_family = ""
        if by_family:
            dominant_family = max(by_family, key=lambda f: f["companies"])["label"]
        dominant_sectors = [s["label"] for s in by_sector[:2]] if by_sector else []

        narrative = {
            "rankByCompanies": rank_by_co.get(country),
            "rankByEur": rank_by_eur.get(country),
            "totalCountries": total_countries,
            "dominantFamily": dominant_family,
            "dominantSectors": dominant_sectors,
        }

        result[country] = {
            "name": name,
            "companies": companies,
            "totalEur": round(total_eur),
            "byFamily": by_family,
            "bySector": by_sector,
            "narrative": narrative,
        }

    # Every Europe-scope country NOT in the corpus gets a stub so the map can
    # hover-explain the exclusion rather than rendering a silent gap. Data for
    # these countries stays in the DB (soft-exclude) — it just isn't published.
    excluded = sorted(EUROPEAN_ALLOWLIST - set(result))
    for code in excluded:
        result[code] = {"name": COUNTRY_NAMES.get(code, code), "excluded": True}

    out = {"countries": result}
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, indent=2)

    print(f"Written {len(result) - len(excluded)} corpus countries "
          f"+ {len(excluded)} excluded stubs to {OUT_PATH}")
    conn.close()


if __name__ == "__main__":
    main()
