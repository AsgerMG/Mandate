-- EU Public Capital Tracker — v1 schema
-- One DB. Three core tables + classify_audit log.

DROP TABLE IF EXISTS classify_audit;
DROP TABLE IF EXISTS public_funding_events;
DROP TABLE IF EXISTS private_funding_events;
DROP TABLE IF EXISTS companies;

CREATE TABLE companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_name TEXT NOT NULL,
    raw_name TEXT,                  -- name as appeared in source
    country TEXT,                   -- ISO 2-letter
    city TEXT,
    postal_code TEXT,
    website TEXT,
    entity_type TEXT,               -- v1 3-bucket: company, research_org, other, unknown (granular startup/sme/large_corp deferred — see methodology.md)
    sector_inferred TEXT,           -- v1 7-label: life_sciences, defense, deeptech_hardware, cleantech, space, digital, other (see methodology.md "Sector taxonomy")
    pic TEXT UNIQUE,                -- EU Participant Identification Code (key field for dedup)
    dealroom_id TEXT,
    crunchbase_url TEXT,
    linkedin_url TEXT,
    match_confidence TEXT,          -- high, medium, low, unmatched
    match_method TEXT,              -- INSERT-time only: 'none' for all rows (seed loader had nothing to match against; subsequent loaders only insert when no match was found). Per-event matching methods (exact/exact_name_only/prefix/fuzzy) are recorded in the *_match_summary.csv files, not here.
    step_flagged INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sector_inferred_updated_at TIMESTAMP,   -- set by classify.py; NULL until first classifier run touches the row. Updates on every change (audited in classify_audit).
    entity_type_updated_at TIMESTAMP        -- same pattern for entity_type
);

CREATE TABLE public_funding_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id),
    source TEXT NOT NULL,           -- eic_{accelerator,pathfinder,transition}, ipcei_{micro,mect,batteries,eubatin,hy2tech,hy2use,hy2infra,hy2move,cloud,med4cure,tech4cure}, eib_venture, eib_growth, innovation_fund_{lsp,ssp,msp,mfg,plt,battery,hbank}_{2020..2024} [+_maritime], chips_ju_kdt_{2020..2023}, edf_{ra,da}_{2021..2025}
    role TEXT,                      -- EIC: coordinator/participant; IPCEI: direct; EIB: borrower
    project_number TEXT,
    project_acronym TEXT,
    project_title TEXT,
    project_summary TEXT,
    call_id TEXT,
    call_deadline DATE,
    project_started DATE,
    project_ended DATE,
    grant_amount_eur REAL,          -- semantic varies by source — see grant_amount_basis. NEVER sum across mixed basis values.
    equity_amount_eur REAL,         -- often NULL for EIC, populated from EIC Fund separately
    debt_amount_eur REAL,           -- EIB venture-debt / growth loans; NULL for grant-only sources
    total_project_cost_eur REAL,
    sector_tags_raw TEXT,           -- as reported by source
    woman_leadership INTEGER,       -- 0 / 1 / NULL
    raw_source_url TEXT,
    coordinator_only INTEGER,       -- 1 = only consortium lead captured (IF, Chips JU, EDF); 0 = all direct partners or single-borrower (IPCEI all-partners, EIC has both coord+participant rows, EIB single borrower). When 1, "distinct companies funded by this source" undercounts the true beneficiary set.
    grant_amount_basis TEXT         -- categorical describing what grant_amount_eur represents per source:
                                    --   'eic_eu_grant'         — actual EU grant to coordinator (EIC)
                                    --   'ipcei_state_aid'      — Commission-approved state aid (incl. national contributions; NULL for redacted decisions)
                                    --   'eib_debt_commitment'  — committed debt ceiling, not disbursed, not a grant (EIB)
                                    --   'if_eu_grant'          — actual Innovation Fund EU grant
                                    --   'chips_ju_total_public'— total JU public funding (EU + national combined; EU-only share is ~50%)
                                    --   'edf_eu_ceiling'       — EU contribution ceiling (DA can have up to 20% national co-funding on top)
                                    --   'eit_kic_support'      — no cash; support/acceleration services only (EIT Digital Champions, VAP); grant_amount_eur is NULL
                                    --   'eit_kic_grant'        — cash prize from EIT Manufacturing BoostUp competition (€2.5K–€50K)
                                    --   'eit_kic_equity'       — EIT Manufacturing equity investment (amount undisclosed; both grant_amount_eur and equity_amount_eur are NULL)
                                    -- Any aggregate query summing grant_amount_eur MUST filter to a single basis value or explicitly acknowledge the mix.
);

CREATE TABLE private_funding_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id),
    event_date DATE,
    round_type TEXT,                -- seed, series_a, series_b, series_c, growth, debt, acquisition, ipo, shutdown, other
    amount_eur REAL,
    lead_investor TEXT,
    all_investors TEXT,             -- semicolon-separated
    investor_geography TEXT,        -- eu, us, asia, mixed, unknown
    source TEXT,                    -- dealroom, crunchbase, sifted, techeu, press, linkedin, manual
    source_url TEXT,
    confidence TEXT,                -- high, medium, low
    notes TEXT
);

-- Audit log for classifier changes. Append-only.
-- Surfaces sector/entity_type flips on re-classify so retroactive taxonomy revisions are visible.
CREATE TABLE classify_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    field TEXT NOT NULL,            -- 'sector_inferred' or 'entity_type'
    old_value TEXT,
    new_value TEXT,
    run_id TEXT                     -- optional grouping for batch reruns (timestamp of classify.py invocation)
);

CREATE INDEX idx_companies_country ON companies(country);
CREATE INDEX idx_companies_sector ON companies(sector_inferred);
CREATE INDEX idx_pfe_company ON public_funding_events(company_id);
CREATE INDEX idx_pfe_source ON public_funding_events(source);
CREATE INDEX idx_pfe_date ON public_funding_events(call_deadline);
CREATE INDEX idx_pfe_basis ON public_funding_events(grant_amount_basis);
CREATE INDEX idx_prfe_company ON private_funding_events(company_id);
CREATE INDEX idx_prfe_date ON private_funding_events(event_date);
CREATE INDEX idx_classify_audit_company ON classify_audit(company_id);
CREATE INDEX idx_classify_audit_changed_at ON classify_audit(changed_at);
