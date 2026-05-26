"""Sanity-check queries on the loaded DB."""
import sqlite3
from pathlib import Path

conn = sqlite3.connect(Path(__file__).parent.parent / "db.sqlite")
conn.row_factory = sqlite3.Row
cur = conn.cursor()

def q(sql, label):
    print(f"\n--- {label} ---")
    for row in cur.execute(sql):
        print("  " + " | ".join(f"{k}={v}" for k, v in dict(row).items()))

q("""
    SELECT source, COUNT(*) AS events, COUNT(DISTINCT company_id) AS unique_companies
    FROM public_funding_events
    GROUP BY source
    ORDER BY events DESC
""", "Events by source")

q("""
    SELECT source, role, COUNT(*) AS n
    FROM public_funding_events
    GROUP BY source, role
    ORDER BY source, n DESC
""", "Events by source × role")

q("""
    SELECT
        source,
        ROUND(AVG(grant_amount_eur)) AS mean_grant,
        ROUND(MIN(grant_amount_eur)) AS min_grant,
        ROUND(MAX(grant_amount_eur)) AS max_grant,
        ROUND(SUM(grant_amount_eur)) AS total_grant
    FROM public_funding_events
    WHERE grant_amount_eur IS NOT NULL
    GROUP BY source
""", "Grant stats by source (EUR)")

q("""
    SELECT
        SUBSTR(call_deadline, 1, 4) AS year,
        source,
        COUNT(*) AS n
    FROM public_funding_events
    WHERE source = 'eic_accelerator' AND role = 'coordinator'
    GROUP BY year, source
    ORDER BY year
""", "EIC Accelerator coordinators by year")

q("""
    SELECT c.country, COUNT(DISTINCT c.id) AS companies
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    WHERE e.source = 'eic_accelerator' AND e.role = 'coordinator'
    GROUP BY c.country
    ORDER BY companies DESC
    LIMIT 15
""", "EIC Accelerator coordinator companies by country (top 15)")

q("""
    SELECT
        'Total companies' AS metric, COUNT(*) AS value FROM companies
    UNION ALL SELECT
        'Companies with PIC', COUNT(*) FROM companies WHERE pic IS NOT NULL
    UNION ALL SELECT
        'Companies with website', COUNT(*) FROM companies WHERE website != ''
    UNION ALL SELECT
        'Total events', COUNT(*) FROM public_funding_events
    UNION ALL SELECT
        'EIC Accelerator coordinator events', COUNT(*)
        FROM public_funding_events
        WHERE source = 'eic_accelerator' AND role = 'coordinator'
""", "Top-line counts")

# Multi-programme companies
q("""
    SELECT c.canonical_name, c.country,
           COUNT(DISTINCT e.source) AS n_programmes,
           GROUP_CONCAT(DISTINCT e.source) AS programmes
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    GROUP BY c.id
    HAVING n_programmes >= 2
    ORDER BY n_programmes DESC, c.canonical_name
    LIMIT 10
""", "Companies winning across multiple EIC programmes (top 10)")

# ---------------------------------------------------------------------------
# IPCEI-specific queries
# ---------------------------------------------------------------------------

q("""
    SELECT e.source, COUNT(*) AS events, COUNT(DISTINCT e.company_id) AS companies
    FROM public_funding_events e
    WHERE e.source LIKE 'ipcei_%'
    GROUP BY e.source
    ORDER BY e.source
""", "IPCEI: events and companies by source")

q("""
    SELECT c.canonical_name, c.country,
           GROUP_CONCAT(DISTINCT e.source) AS programmes,
           COUNT(DISTINCT e.source) AS n_programmes
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    GROUP BY c.id
    HAVING SUM(CASE WHEN e.source LIKE 'ipcei_%' THEN 1 ELSE 0 END) > 0
       AND SUM(CASE WHEN e.source NOT LIKE 'ipcei_%' THEN 1 ELSE 0 END) > 0
    ORDER BY n_programmes DESC, c.canonical_name
    LIMIT 20
""", "IPCEI + EIC multi-instrument winners (companies in both)")

q("""
    SELECT
        e.source,
        ROUND(SUM(e.grant_amount_eur) / 1e9, 3) AS total_grant_bn_eur,
        SUM(CASE WHEN e.grant_amount_eur IS NULL THEN 1 ELSE 0 END) AS rows_no_amount
    FROM public_funding_events e
    WHERE e.source LIKE 'ipcei_%'
    GROUP BY e.source
    ORDER BY e.source
""", "IPCEI: per-source nominal aid sum vs. redacted rows")

q("""
    SELECT c.country, COUNT(DISTINCT c.id) AS ipcei_companies
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    WHERE e.source LIKE 'ipcei_%'
    GROUP BY c.country
    ORDER BY ipcei_companies DESC
""", "IPCEI: partner country distribution")

q("""
    SELECT
        'IPCEI events' AS metric, COUNT(*) AS value
        FROM public_funding_events WHERE source LIKE 'ipcei_%'
    UNION ALL
    SELECT 'IPCEI companies (distinct)', COUNT(DISTINCT company_id)
        FROM public_funding_events WHERE source LIKE 'ipcei_%'
    UNION ALL
    SELECT 'IPCEI companies matched to EIC', COUNT(DISTINCT e.company_id)
        FROM public_funding_events e
        WHERE e.source LIKE 'ipcei_%'
          AND e.company_id IN (
              SELECT DISTINCT company_id FROM public_funding_events
              WHERE source NOT LIKE 'ipcei_%'
          )
    UNION ALL
    SELECT 'IPCEI companies new (ipcei_pdf only)', COUNT(DISTINCT c.id)
        FROM companies c
        WHERE c.match_method = 'ipcei_pdf'
""", "IPCEI: top-line counts")


# ---------------------------------------------------------------------------
# EIB-specific queries
# ---------------------------------------------------------------------------

q("""
    SELECT e.source, COUNT(*) AS events, COUNT(DISTINCT e.company_id) AS borrowers
    FROM public_funding_events e
    WHERE e.source LIKE 'eib%'
    GROUP BY e.source
    ORDER BY e.source
""", "EIB: events and distinct borrowers by source")

q("""
    SELECT c.country, COUNT(DISTINCT c.id) AS borrowers
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    WHERE e.source LIKE 'eib%'
    GROUP BY c.country
    ORDER BY borrowers DESC
""", "EIB: borrower country distribution")

q("""
    SELECT c.sector_inferred, COUNT(DISTINCT c.id) AS borrowers
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    WHERE e.source LIKE 'eib%'
    GROUP BY c.sector_inferred
    ORDER BY borrowers DESC
""", "EIB: borrower sector distribution")

q("""
    SELECT
        ROUND(SUM(e.debt_amount_eur) / 1e6, 1) AS total_debt_m_eur,
        COUNT(*) AS events,
        ROUND(AVG(e.debt_amount_eur) / 1e6, 1) AS avg_loan_m_eur,
        ROUND(MIN(e.debt_amount_eur) / 1e6, 1) AS min_loan_m_eur,
        ROUND(MAX(e.debt_amount_eur) / 1e6, 1) AS max_loan_m_eur
    FROM public_funding_events e
    WHERE e.source LIKE 'eib%' AND e.debt_amount_eur IS NOT NULL
""", "EIB: debt portfolio stats (EUR)")

q("""
    SELECT
        'EIB events' AS metric, COUNT(*) AS value
        FROM public_funding_events WHERE source LIKE 'eib%'
    UNION ALL
    SELECT 'EIB distinct borrowers', COUNT(DISTINCT company_id)
        FROM public_funding_events WHERE source LIKE 'eib%'
    UNION ALL
    SELECT 'EIB borrowers matched to EIC', COUNT(DISTINCT e.company_id)
        FROM public_funding_events e
        WHERE e.source LIKE 'eib%'
          AND e.company_id IN (
              SELECT DISTINCT company_id FROM public_funding_events
              WHERE source NOT LIKE 'eib%'
          )
    UNION ALL
    SELECT 'EIB-only borrowers (new inserts)', COUNT(DISTINCT c.id)
        FROM companies c
        WHERE c.match_method = 'eib'
    UNION ALL
    SELECT 'events with NULL debt_amount_eur', COUNT(*)
        FROM public_funding_events
        WHERE source LIKE 'eib%' AND debt_amount_eur IS NULL
    UNION ALL
    SELECT 'events with grant_amount_eur populated (must be 0)', COUNT(*)
        FROM public_funding_events
        WHERE source LIKE 'eib%' AND grant_amount_eur IS NOT NULL
""", "EIB: top-line counts and validation")

q("""
    SELECT c.canonical_name, c.country,
           GROUP_CONCAT(DISTINCT pfe.source) AS sources
    FROM companies c
    JOIN public_funding_events pfe ON pfe.company_id = c.id
    GROUP BY c.id
    HAVING COUNT(DISTINCT pfe.source) >= 2
       AND SUM(CASE WHEN pfe.source LIKE 'eib%' THEN 1 ELSE 0 END) > 0
    ORDER BY c.canonical_name
""", "EIB: multi-instrument winners (EIB + at least one other source)")

# ---------------------------------------------------------------------------
# Innovation Fund queries
# ---------------------------------------------------------------------------

q("""
    SELECT source, COUNT(*) AS events, COUNT(DISTINCT company_id) AS unique_companies,
           ROUND(SUM(grant_amount_eur) / 1e6, 1) AS total_grant_m_eur
    FROM public_funding_events
    WHERE source LIKE 'innovation_fund%'
    GROUP BY source
    ORDER BY source
""", "IF: events, companies and grant sums by sub-call")

q("""
    SELECT c.country, COUNT(*) AS events
    FROM public_funding_events e
    JOIN companies c ON c.id = e.company_id
    WHERE e.source LIKE 'innovation_fund%'
    GROUP BY c.country ORDER BY events DESC LIMIT 20
""", "IF: country distribution (top 20)")

q("""
    SELECT
        'IF events' AS metric, COUNT(*) AS value
        FROM public_funding_events WHERE source LIKE 'innovation_fund%'
    UNION ALL
    SELECT 'IF distinct beneficiaries', COUNT(DISTINCT company_id)
        FROM public_funding_events WHERE source LIKE 'innovation_fund%'
    UNION ALL
    SELECT 'IF beneficiaries matched to existing company', COUNT(DISTINCT e.company_id)
        FROM public_funding_events e
        WHERE e.source LIKE 'innovation_fund%'
          AND e.company_id IN (
              SELECT DISTINCT company_id FROM public_funding_events
              WHERE source NOT LIKE 'innovation_fund%'
          )
    UNION ALL
    SELECT 'IF-only new inserts', COUNT(DISTINCT c.id)
        FROM companies c WHERE c.match_method = 'innovation_fund'
    UNION ALL
    SELECT 'IF events with NULL grant_amount_eur', COUNT(*)
        FROM public_funding_events WHERE source LIKE 'innovation_fund%' AND grant_amount_eur IS NULL
    UNION ALL
    SELECT 'IF events with debt_amount_eur populated (must be 0)', COUNT(*)
        FROM public_funding_events WHERE source LIKE 'innovation_fund%' AND debt_amount_eur IS NOT NULL
""", "IF: top-line counts and validation")

q("""
    SELECT c.canonical_name, c.country,
           GROUP_CONCAT(DISTINCT e.source) AS sources
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    GROUP BY c.id
    HAVING COUNT(DISTINCT e.source) >= 2
       AND SUM(CASE WHEN e.source LIKE 'innovation_fund%' THEN 1 ELSE 0 END) > 0
    ORDER BY c.canonical_name
""", "IF: multi-instrument winners (IF + at least one other source)")

# ---------------------------------------------------------------------------
# Chips JU / KDT JU queries
# ---------------------------------------------------------------------------

q("""
    SELECT source, COUNT(*) AS events, COUNT(DISTINCT company_id) AS unique_companies,
           ROUND(SUM(grant_amount_eur) / 1e6, 1) AS total_grant_m_eur
    FROM public_funding_events
    WHERE source LIKE 'chips_ju%'
    GROUP BY source
    ORDER BY source
""", "Chips JU: events, companies and grant sums by call year")

q("""
    SELECT c.country, COUNT(*) AS events
    FROM public_funding_events e
    JOIN companies c ON c.id = e.company_id
    WHERE e.source LIKE 'chips_ju%'
    GROUP BY c.country ORDER BY events DESC LIMIT 15
""", "Chips JU: coordinator country distribution (top 15)")

q("""
    SELECT c.sector_inferred, COUNT(DISTINCT c.id) AS companies
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    WHERE e.source LIKE 'chips_ju%'
    GROUP BY c.sector_inferred
""", "Chips JU: sector distribution (must be 100% deeptech_hardware)")

q("""
    SELECT
        'Chips JU events' AS metric, COUNT(*) AS value
        FROM public_funding_events WHERE source LIKE 'chips_ju%'
    UNION ALL
    SELECT 'Chips JU distinct beneficiaries', COUNT(DISTINCT company_id)
        FROM public_funding_events WHERE source LIKE 'chips_ju%'
    UNION ALL
    SELECT 'Chips JU beneficiaries matched to existing company', COUNT(DISTINCT e.company_id)
        FROM public_funding_events e
        WHERE e.source LIKE 'chips_ju%'
          AND e.company_id IN (
              SELECT DISTINCT company_id FROM public_funding_events
              WHERE source NOT LIKE 'chips_ju%'
          )
    UNION ALL
    SELECT 'Chips JU-only new inserts', COUNT(DISTINCT c.id)
        FROM companies c WHERE c.match_method = 'chips_ju'
    UNION ALL
    SELECT 'Chips JU events with NULL grant_amount_eur', COUNT(*)
        FROM public_funding_events WHERE source LIKE 'chips_ju%' AND grant_amount_eur IS NULL
    UNION ALL
    SELECT 'Chips JU events with debt_amount_eur populated (must be 0)', COUNT(*)
        FROM public_funding_events WHERE source LIKE 'chips_ju%' AND debt_amount_eur IS NOT NULL
    UNION ALL
    SELECT 'Chips JU companies with NULL country (must be 0)', COUNT(DISTINCT c.id)
        FROM companies c
        JOIN public_funding_events e ON e.company_id = c.id
        WHERE e.source LIKE 'chips_ju%' AND (c.country IS NULL OR c.country = '')
""", "Chips JU: top-line counts and validation")

q("""
    SELECT c.canonical_name, c.country,
           GROUP_CONCAT(DISTINCT e.source) AS sources
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    GROUP BY c.id
    HAVING COUNT(DISTINCT e.source) >= 2
       AND SUM(CASE WHEN e.source LIKE 'chips_ju%' THEN 1 ELSE 0 END) > 0
    ORDER BY c.canonical_name
""", "Chips JU: multi-instrument winners (Chips JU + at least one other source)")

# ---------------------------------------------------------------------------
# EDF queries
# ---------------------------------------------------------------------------

q("""
    SELECT source, COUNT(*) AS events, COUNT(DISTINCT company_id) AS unique_companies,
           ROUND(SUM(grant_amount_eur) / 1e6, 1) AS total_eu_contribution_m_eur
    FROM public_funding_events
    WHERE source LIKE 'edf%'
    GROUP BY source
    ORDER BY source
""", "EDF: events, companies and EU contribution by call/strand")

q("""
    SELECT c.country, COUNT(*) AS events
    FROM public_funding_events e
    JOIN companies c ON c.id = e.company_id
    WHERE e.source LIKE 'edf%'
    GROUP BY c.country ORDER BY events DESC LIMIT 15
""", "EDF: coordinator country distribution (top 15)")

q("""
    SELECT c.sector_inferred, COUNT(DISTINCT c.id) AS companies
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    WHERE e.source LIKE 'edf%'
      AND c.id NOT IN (SELECT DISTINCT company_id FROM public_funding_events WHERE source NOT LIKE 'edf%')
    GROUP BY c.sector_inferred
""", "EDF: sector distribution for EDF-only companies (must be 100% defense)")

q("""
    SELECT
        'EDF events' AS metric, COUNT(*) AS value
        FROM public_funding_events WHERE source LIKE 'edf%'
    UNION ALL
    SELECT 'EDF distinct coordinators', COUNT(DISTINCT company_id)
        FROM public_funding_events WHERE source LIKE 'edf%'
    UNION ALL
    SELECT 'EDF coordinators matched to existing company', COUNT(DISTINCT e.company_id)
        FROM public_funding_events e
        WHERE e.source LIKE 'edf%'
          AND e.company_id IN (
              SELECT DISTINCT company_id FROM public_funding_events
              WHERE source NOT LIKE 'edf%'
          )
    UNION ALL
    SELECT 'EDF-only new inserts', COUNT(DISTINCT c.id)
        FROM companies c WHERE c.match_method = 'edf'
    UNION ALL
    SELECT 'EDF events with NULL grant_amount_eur', COUNT(*)
        FROM public_funding_events WHERE source LIKE 'edf%' AND grant_amount_eur IS NULL
    UNION ALL
    SELECT 'EDF events with debt_amount_eur populated (must be 0)', COUNT(*)
        FROM public_funding_events WHERE source LIKE 'edf%' AND debt_amount_eur IS NOT NULL
    UNION ALL
    SELECT 'EDF companies with NULL country (must be 0)', COUNT(DISTINCT c.id)
        FROM companies c
        JOIN public_funding_events e ON e.company_id = c.id
        WHERE e.source LIKE 'edf%' AND (c.country IS NULL OR c.country = '')
    UNION ALL
    SELECT 'Total defense-sector companies (EDF + retroactive)', COUNT(*)
        FROM companies WHERE sector_inferred = 'defense'
""", "EDF: top-line counts and validation")

q("""
    SELECT c.canonical_name, c.country,
           GROUP_CONCAT(DISTINCT e.source) AS sources
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    GROUP BY c.id
    HAVING COUNT(DISTINCT e.source) >= 2
       AND SUM(CASE WHEN e.source LIKE 'edf%' THEN 1 ELSE 0 END) > 0
    ORDER BY c.canonical_name
""", "EDF: multi-instrument winners (EDF + at least one other source)")

# ---------------------------------------------------------------------------
# EIT KIC queries (EIT Digital Champions + EIT Manufacturing)
# ---------------------------------------------------------------------------

q("""
    SELECT source, COUNT(*) AS events, COUNT(DISTINCT company_id) AS unique_companies
    FROM public_funding_events
    WHERE source LIKE 'eit_%'
    GROUP BY source
    ORDER BY source
""", "EIT KIC: events and companies by source")

q("""
    SELECT c.country, COUNT(*) AS events
    FROM public_funding_events e
    JOIN companies c ON c.id = e.company_id
    WHERE e.source LIKE 'eit_%'
    GROUP BY c.country ORDER BY events DESC LIMIT 20
""", "EIT KIC: country distribution (top 20)")

q("""
    SELECT c.sector_inferred, COUNT(DISTINCT c.id) AS companies
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    WHERE e.source LIKE 'eit_%'
    GROUP BY c.sector_inferred
    ORDER BY companies DESC
""", "EIT KIC: sector distribution (EIT-linked companies)")

q("""
    SELECT
        'EIT KIC events' AS metric, COUNT(*) AS value
        FROM public_funding_events WHERE source LIKE 'eit_%'
    UNION ALL
    SELECT 'EIT KIC distinct companies', COUNT(DISTINCT company_id)
        FROM public_funding_events WHERE source LIKE 'eit_%'
    UNION ALL
    SELECT 'EIT Digital events', COUNT(*)
        FROM public_funding_events WHERE source LIKE 'eit_digital_%'
    UNION ALL
    SELECT 'EIT Manufacturing events', COUNT(*)
        FROM public_funding_events WHERE source LIKE 'eit_manufacturing_%'
    UNION ALL
    SELECT 'EIT KIC companies matched to EIC/IPCEI/EIB/IF', COUNT(DISTINCT e.company_id)
        FROM public_funding_events e
        WHERE e.source LIKE 'eit_%'
          AND e.company_id IN (
              SELECT DISTINCT company_id FROM public_funding_events
              WHERE source NOT LIKE 'eit_%'
          )
    UNION ALL
    SELECT 'EIT KIC events with NULL grant_amount_eur (support/equity, expected)', COUNT(*)
        FROM public_funding_events WHERE source LIKE 'eit_%' AND grant_amount_eur IS NULL
    UNION ALL
    SELECT 'EIT Manufacturing investments (equity basis)', COUNT(*)
        FROM public_funding_events WHERE source = 'eit_manufacturing_investments'
    UNION ALL
    SELECT 'EIT BoostUp events with grant amount (cash prizes)', COUNT(*)
        FROM public_funding_events WHERE source LIKE 'eit_manufacturing_boostup_%' AND grant_amount_eur IS NOT NULL
""", "EIT KIC: top-line counts and validation")

q("""
    SELECT c.canonical_name, c.country,
           GROUP_CONCAT(DISTINCT e.source) AS sources
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    GROUP BY c.id
    HAVING COUNT(DISTINCT e.source) >= 2
       AND SUM(CASE WHEN e.source LIKE 'eit_%' THEN 1 ELSE 0 END) > 0
    ORDER BY c.canonical_name
""", "EIT KIC: multi-instrument winners (EIT + at least one other source)")

q("""
    SELECT c.canonical_name, c.country,
           GROUP_CONCAT(DISTINCT e.source) AS sources
    FROM companies c
    JOIN public_funding_events e ON e.company_id = c.id
    WHERE e.source LIKE 'eit_%'
    GROUP BY c.id
    HAVING COUNT(DISTINCT e.source) >= 2
    ORDER BY COUNT(DISTINCT e.source) DESC, c.canonical_name
""", "EIT KIC: companies winning in multiple EIT programmes (investments + BoostUp overlap)")

# EIC × EIT overlap check (validation gate #6 in sprint plan)
q("""
    SELECT
        COUNT(DISTINCT e_eit.company_id) AS eit_digital_companies,
        SUM(CASE WHEN e_eit.company_id IN (
                SELECT DISTINCT company_id FROM public_funding_events
                WHERE source LIKE 'eic_%'
            ) THEN 1 ELSE 0 END) AS also_in_eic,
        ROUND(100.0 * SUM(CASE WHEN e_eit.company_id IN (
                SELECT DISTINCT company_id FROM public_funding_events
                WHERE source LIKE 'eic_%'
            ) THEN 1 ELSE 0 END)
            / COUNT(DISTINCT e_eit.company_id), 1) AS pct_overlap
    FROM public_funding_events e_eit
    WHERE e_eit.source LIKE 'eit_digital_%'
""", "EIT KIC: EIT Digital × EIC overlap (target ≥20% per sprint plan gate)")

# ---------------------------------------------------------------------------
# Data-quality checks (orphans, unclassified, manual overrides)
# ---------------------------------------------------------------------------

q("""
    SELECT c.id, c.canonical_name, c.country, c.match_method
    FROM companies c
    WHERE NOT EXISTS (
        SELECT 1 FROM public_funding_events e WHERE e.company_id = c.id
    )
""", "DQ: orphan companies (no linked funding events — should be empty)")

q("""
    SELECT COUNT(*) AS unclassified_companies
    FROM companies WHERE sector_inferred = 'unclassified'
""", "DQ: companies with sector_inferred='unclassified' (must be 0)")

q("""
    SELECT canonical_name, sector_inferred
    FROM companies
    WHERE canonical_name IN (
        'NOMAGIC INC','STARK FUTURE SL','IN OVO HOLDING BV','CROWDFARMING SL',
        'INTERUNIVERSITAIR MICRO-ELECTRONICA CENTRUM','STICHTING IMEC NEDERLAND'
    )
    ORDER BY canonical_name
""", "DQ: MANUAL_SECTOR_OVERRIDES applied correctly")

# ---------------------------------------------------------------------------
# DQ: cross-cutting integrity (added Sprint 6 follow-up — see notes.md)
# ---------------------------------------------------------------------------

q("""
    SELECT source, grant_amount_basis, coordinator_only,
           COUNT(*) AS events,
           SUM(CASE WHEN grant_amount_eur IS NULL THEN 1 ELSE 0 END) AS null_amount,
           SUM(CASE WHEN debt_amount_eur  IS NULL THEN 1 ELSE 0 END) AS null_debt
    FROM public_funding_events
    GROUP BY source, grant_amount_basis, coordinator_only
    ORDER BY source
""", "DQ: per-source basis / coordinator_only / NULL coverage")

# These two should be 0 after the B5/B6 backfill — any non-zero row means a
# new loader inserted an event without setting the flag, and needs a fix.
q("""
    SELECT 'events with NULL coordinator_only' AS metric, COUNT(*) AS value
    FROM public_funding_events WHERE coordinator_only IS NULL
    UNION ALL
    SELECT 'events with NULL grant_amount_basis', COUNT(*)
    FROM public_funding_events WHERE grant_amount_basis IS NULL
    UNION ALL
    SELECT 'events with unknown basis label', COUNT(*)
    FROM public_funding_events
    WHERE grant_amount_basis NOT IN (
        'eic_eu_grant','ipcei_state_aid','eib_debt_commitment',
        'if_eu_grant','chips_ju_total_public','edf_eu_ceiling',
        'eit_kic_support','eit_kic_grant','eit_kic_equity',
        'chp_grant','ihi_grant','eurohpc_grant','kdt_grant',
        'horizon_eu_grant'
    )
""", "DQ: coordinator_only + grant_amount_basis fully populated (all must be 0)")

# Make the basis-incompatibility VISIBLE. If anyone reads this and is
# tempted to sum across the full table, this report shows the totals are
# stratified by what the number actually means.
q("""
    SELECT grant_amount_basis,
           COUNT(*) AS events,
           ROUND(SUM(grant_amount_eur) / 1e9, 3) AS total_grant_field_bn_eur,
           ROUND(SUM(debt_amount_eur) / 1e9, 3) AS total_debt_field_bn_eur,
           SUM(CASE WHEN grant_amount_eur IS NULL AND debt_amount_eur IS NULL THEN 1 ELSE 0 END) AS rows_no_amount
    FROM public_funding_events
    GROUP BY grant_amount_basis
    ORDER BY grant_amount_basis
""", "DQ: STRATIFIED totals — DO NOT sum across rows (semantics differ per basis)")

# Coordinator-only undercount banner: surfaces that for these sources, the
# distinct-company count is a lower bound on the true beneficiary set.
q("""
    SELECT
        SUM(CASE WHEN coordinator_only = 1 THEN 1 ELSE 0 END) AS coord_only_events,
        SUM(CASE WHEN coordinator_only = 0 THEN 1 ELSE 0 END) AS full_partner_events,
        ROUND(100.0 * SUM(CASE WHEN coordinator_only = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_coord_only
    FROM public_funding_events
""", "DQ: coordinator-only coverage (events from coordinator-only sources undercount consortium partners 5-40x)")

# Sector audit log — surface recent flips so retroactive taxonomy changes
# are visible at every sanity_check run.
q("""
    SELECT field,
           COUNT(*) AS changes,
           COUNT(DISTINCT company_id) AS companies_affected,
           MIN(changed_at) AS first_change,
           MAX(changed_at) AS last_change
    FROM classify_audit
    WHERE field IN ('sector_inferred', 'entity_type')
    GROUP BY field
""", "DQ: classify_audit summary (sector/entity flips since baseline)")

# Recent flips detail (last 50): visible per-row trail of what changed
q("""
    SELECT a.changed_at, c.canonical_name, c.country, a.field,
           a.old_value, a.new_value, a.run_id
    FROM classify_audit a
    LEFT JOIN companies c ON c.id = a.company_id
    WHERE a.field IN ('sector_inferred', 'entity_type')
      AND a.old_value IS NOT NULL
    ORDER BY a.changed_at DESC
    LIMIT 50
""", "DQ: recent sector/entity flips (last 50 with prior value)")

# Stale-classification check: companies whose sector_inferred_updated_at is
# older than the most recent loader insert. After Sprint 6 the baseline is
# 2026-05-21; future loaders should trigger classify.py to refresh stamps.
q("""
    SELECT 'companies with NULL sector_inferred_updated_at' AS metric, COUNT(*) AS value
    FROM companies WHERE sector_inferred_updated_at IS NULL AND sector_inferred IS NOT NULL
    UNION ALL
    SELECT 'companies stamped but possibly stale (updated_at < created_at)', COUNT(*)
    FROM companies
    WHERE sector_inferred_updated_at IS NOT NULL
      AND created_at IS NOT NULL
      AND sector_inferred_updated_at < created_at
""", "DQ: sector_inferred timestamp hygiene (both must be 0 after every classify.py run)")

conn.close()
