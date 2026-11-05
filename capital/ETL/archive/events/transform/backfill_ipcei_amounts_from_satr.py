"""Backfill Commission-redacted IPCEI amounts from the SATR layer.

The Commission redacts per-company aid in several IPCEI decisions
(Microelectronics 2018, Batteries Summer/Autumn, parts of CIS and Med4Cure)
— 101 ipcei_* events carry grant_amount_eur = NULL. But the aid, once
GRANTED, must be reported to the Transparency Award Module, and the corpus
already holds those rows: SATR events whose project_title names the IPCEI
measure, with amounts.

This script joins the two by an EXPLICIT mapping table (the IPCEI loader
used decision-table short names — "SAP", "ACC" — while SATR uses legal
names — "SAP SE", "Opel ACC GmbH" — so name-level matching must be
human-reviewed, not fuzzy). For each mapped redacted event it writes:

  grant_amount_eur   = SUM of granted SATR tranches for (company, wave)
  grant_amount_basis = 'ipcei_satr_granted'   -- granted aid reported in
                       TAM under the IPCEI measure; a LOWER BOUND of the
                       redacted Commission-approved ceiling (tranches may
                       still be flowing), and a different basis from
                       'ipcei_state_aid' (approved ceiling). Never sum the
                       two bases together.

and sets ipcei_linked = 1 on every SATR row used, so corpus-level totals
can net out the overlap exactly as the flag was designed for.

Idempotent: only touches ipcei_* rows where grant_amount_eur IS NULL.
Match log: data/processed/ipcei_satr_backfill.csv
"""
from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
# --- end ETL path bootstrap ---

import csv
import sqlite3
from pathlib import Path

ROOT = _ETL_ROOT
DB = _ETL_DB
OUT_CSV = ROOT / "data" / "processed" / "ipcei_satr_backfill.csv"

# SQL LIKE patterns (UPPER) identifying each wave in SATR project_title.
# ME/CT must be tested before plain Microelectronics: the 2023 wave titles
# contain both words.
WAVE_TITLE_SQL = {
    "ipcei_mect": "(UPPER(project_title) LIKE '%ME/CT%' OR UPPER(project_title) LIKE '%COMMUNICATION TECHNOLOG%' OR UPPER(project_title) LIKE '%KOMUNIKA%')",
    "ipcei_micro": "(UPPER(project_title) LIKE '%MICROELECTRONICS%' AND UPPER(project_title) NOT LIKE '%COMMUNICATION%' AND UPPER(project_title) NOT LIKE '%ME/CT%')",
    "ipcei_batteries": "UPPER(project_title) LIKE 'SUMMER IPCEI BATTERIES%'",
    "ipcei_eubatin": "UPPER(project_title) LIKE 'AUTUMN IPCEI BATTERIES%'",
    "ipcei_cloud": "(UPPER(project_title) LIKE '%CIS%' OR UPPER(project_title) LIKE '%CLOUD%')",
    "ipcei_hy2infra": "UPPER(project_title) LIKE '%HY2INFRA%'",
    "ipcei_med4cure": "UPPER(project_title) LIKE '%MED4CURE%'",
}

# (ipcei source, redacted-row company name, redacted-row country)
#   -> list of (SATR canonical_name, SATR company country)
# One entry per redacted event we are confident about. Companies absent from
# SATR (DE micro 2018, all IT/GR/ES/HR rows, UK rows, PL cloud) stay NULL and
# are listed as unmatched in the CSV for the national-register follow-up.
MAPPING: dict[tuple[str, str, str], list[tuple[str, str]]] = {
    # ── IPCEI CIS ──────────────────────────────────────────────────────
    ("ipcei_cloud", "SAP", "DE"): [("SAP SE", "DE")],
    ("ipcei_cloud", "Siemens", "DE"): [("Siemens", "DE")],
    # ── Summer Batteries (2019 decision) ───────────────────────────────
    ("ipcei_batteries", "Solvay", "BE"): [("Solvay", "BE")],
    # "UMIORE" is a SATR data-entry typo for Umicore (Belgian measure row)
    ("ipcei_batteries", "Umicore", "BE"): [("UMIORE", "BE")],
    # ACC = Automotive Cells Company; the German entity is Opel ACC GmbH
    ("ipcei_batteries", "ACC", "DE"): [("Opel ACC GmbH", "DE")],
    # ── EuBatIn (Autumn Batteries) ─────────────────────────────────────
    ("ipcei_eubatin", "Cellforce", "DE"): [("Cellforce", "DE")],
    ("ipcei_eubatin", "Liofit", "DE"): [("Liofit", "DE")],
    ("ipcei_eubatin", "Manz", "DE"): [("Manz", "DE")],
    ("ipcei_eubatin", "Northvolt", "DE"): [("Northvolt Germany GmbH", "DE")],
    ("ipcei_eubatin", "Northvolt", "SE"): [("Northvolt", "SE")],
    ("ipcei_eubatin", "SGL", "DE"): [("SGL CARBON GmbH", "DE")],
    ("ipcei_eubatin", "Skeleton", "DE"): [("Skeleton Technologies GmbH", "DE")],
    ("ipcei_eubatin", "Arkema", "FR"): [("ARKEMA FRANCE SA", "FR")],
    ("ipcei_eubatin", "Fortum", "FI"): [("Fortum Waste Solutions Oy", "FI")],
    ("ipcei_eubatin", "Keliber", "FI"): [("Keliber Technology Oy", "FI")],
    ("ipcei_eubatin", "Valmet", "FI"): [("Valmet Automotive Oy", "FI")],
    ("ipcei_eubatin", "Energo Aqua", "SK"): [("ENERGO - AQUA a.s.", "SK")],
    ("ipcei_eubatin", "InoBat Auto", "SK"): [("InoBat Auto j.s.a.", "SK")],
    ("ipcei_eubatin", "InoBat Energy", "SK"): [("InoBat Energy j.s.a.", "SK")],
    ("ipcei_eubatin", "ZTS VaV", "SK"): [("ZTS - VÝSKUM A VÝVOJ, a.s.", "SK")],
    # Decision lists BMW under EuBatIn; the redacted row carries country=FR
    # (loader artefact) but the granted aid is the German measure row.
    ("ipcei_eubatin", "BMW", "FR"): [("BAYERISCHE MOTOREN WERKE AKTIENGESELLSCHAFT", "DE")],
    # ── Microelectronics 2018 ──────────────────────────────────────────
    ("ipcei_micro", "Soitec", "FR"): [("Soitec", "FR")],
    ("ipcei_micro", "Murata", "FR"): [("MURATA INTEGRATED PASSIVE SOLUTIONS", "FR")],
    ("ipcei_micro", "X-Fab (FR)", "FR"): [("X-FAB", "FR"), ("X-FAB FRANCE", "FR")],
    # "ST-France" in the decision = ST's French participation, granted to
    # the individual ST legal entities below (name variants included).
    ("ipcei_micro", "ST-France", "FR"): [
        ("STMICRECTRONICS TOURS SA", "FR"),
        ("STMICROECTRONICS SA", "FR"),
        ("STMICROELECTRONICS  CROLLES 2 S", "FR"),
        ("STMICROELECTRONICS (TOURS) SAS", "FR"),
        ("STMICROELECTRONICS ALPS", "FR"),
        ("STMICROELECTRONICS CROLLES 2", "FR"),
        ("STMICROELECTRONICS GRENOBLE 2", "FR"),
        ("STMICROELECTRONICS GRENOBLE2", "FR"),
        ("STMICROELECTRONICS ROUSSET", "FR"),
        ("STMICROELECTRONICS ROUSSET ASAS", "FR"),
        ("STMICROELECTRONICS SA", "FR"),
    ],
    # ── Hy2Infra ───────────────────────────────────────────────────────
    ("ipcei_hy2infra", "AquaDuctus Pipeline GmbH", "DE"): [("AquaDuctus Pipeline GmbH", "DE")],
}

# Known non-recoverable for documented reasons (kept out of "unmatched TODO")
KNOWN_GAPS = {
    ("ipcei_eubatin", "Tesla", "DE"): "Tesla withdrew from EuBatIn funding (Nov 2021); no aid granted",
}


def satr_rows_for(con, name, country, wave):
    sql = f"""
        SELECT v.id, v.grant_amount_eur, v.satr_tm_id, v.project_started
        FROM v_events v JOIN companies c ON c.id = v.company_id
        WHERE v.source_family = 'state_aid_satr'
          AND c.canonical_name = ? AND c.country = ?
          AND {WAVE_TITLE_SQL[wave]}
          AND v.grant_amount_eur IS NOT NULL
    """
    return con.execute(sql, (name, country)).fetchall()


def main():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    redacted = con.execute("""
        SELECT e.id, e.source, c.canonical_name, c.country
        FROM public_funding_events e JOIN companies c ON c.id = e.company_id
        WHERE e.source LIKE 'ipcei_%' AND e.grant_amount_eur IS NULL
        ORDER BY e.source, c.country, c.canonical_name
    """).fetchall()

    log, filled, used_satr_ids = [], 0, []
    for r in redacted:
        key = (r["source"], r["canonical_name"], r["country"])
        if key in KNOWN_GAPS:
            log.append({**dict(zip(("source", "company", "country"), key)),
                        "status": "known_gap", "amount_eur": "", "n_tranches": "",
                        "satr_ids": "", "note": KNOWN_GAPS[key]})
            continue
        if key not in MAPPING:
            log.append({**dict(zip(("source", "company", "country"), key)),
                        "status": "unmatched", "amount_eur": "", "n_tranches": "",
                        "satr_ids": "", "note": "no SATR row; needs national register"})
            continue
        tranches = []
        for satr_name, satr_country in MAPPING[key]:
            tranches += satr_rows_for(con, satr_name, satr_country, r["source"])
        if not tranches:
            log.append({**dict(zip(("source", "company", "country"), key)),
                        "status": "mapping_found_no_rows", "amount_eur": "",
                        "n_tranches": "", "satr_ids": "", "note": "check mapping"})
            continue
        total = sum(t["grant_amount_eur"] for t in tranches)
        ids = [t["id"] for t in tranches]
        tm_ids = ",".join(t["satr_tm_id"] or "?" for t in tranches)
        con.execute("""
            UPDATE public_funding_events
            SET grant_amount_eur = ?,
                grant_amount_basis = 'ipcei_satr_granted',
                project_summary = COALESCE(project_summary || ' | ', '') ||
                    'Amount backfilled from SATR: sum of ' || ? ||
                    ' granted tranche(s) under the IPCEI measure (TM: ' || ? ||
                    '); lower bound of the redacted approved aid.'
            WHERE id = ? AND grant_amount_eur IS NULL
        """, (total, len(tranches), tm_ids, r["id"]))
        used_satr_ids += ids
        filled += 1
        log.append({**dict(zip(("source", "company", "country"), key)),
                    "status": "filled", "amount_eur": round(total),
                    "n_tranches": len(tranches),
                    "satr_ids": ";".join(map(str, ids)), "note": ""})

    if used_satr_ids:
        con.executemany(
            "UPDATE public_funding_events SET ipcei_linked = 1 WHERE id = ?",
            [(i,) for i in set(used_satr_ids)])

    # Netting pass: EVERY SATR row whose title names an IPCEI measure is a
    # granted tranche of aid that the ipcei_* events already carry as a
    # Commission-approved ceiling. Flag them all (not just the ones used for
    # backfill) so corpus-wide totals can net the overlap, which is what
    # ipcei_linked was designed for (Sprint 13/15).
    con.execute("""
        UPDATE public_funding_events SET ipcei_linked = 1
        WHERE (source LIKE 'satr_%' OR source LIKE 'sudop_%' OR source LIKE 'bdns_%'
               OR source LIKE 'regas_%' OR source LIKE 'gov_si_%')
          AND (UPPER(project_title) LIKE '%IPCEI%'
               OR UPPER(project_title) LIKE '%IMPORTANT PROJECT%')
          AND ipcei_linked = 0
    """)
    print(f"netting pass: {con.execute('SELECT changes()').fetchone()[0]} "
          f"additional SATR IPCEI tranche rows flagged ipcei_linked")
    con.commit()

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["source", "company", "country", "status",
                                          "amount_eur", "n_tranches", "satr_ids", "note"])
        w.writeheader()
        w.writerows(log)

    n_unmatched = sum(1 for l in log if l["status"] == "unmatched")
    print(f"redacted events: {len(redacted)}  filled: {filled}  "
          f"unmatched: {n_unmatched}  log: {OUT_CSV.relative_to(ROOT)}")
    total_eur = sum(l["amount_eur"] for l in log if l["status"] == "filled")
    print(f"recovered amounts total: €{total_eur/1e6:.1f}M; "
          f"{len(set(used_satr_ids))} SATR rows flagged ipcei_linked")


if __name__ == "__main__":
    main()
