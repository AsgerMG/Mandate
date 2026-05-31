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
    -- Sprint 13 additions
    ipcei_linked INTEGER DEFAULT 0,  -- 1 if this row's company also has an ipcei_* event; used to net out double-counting when totalling "European capital deployed"
    eif_lp_backed INTEGER DEFAULT 0, -- 1 if the source institution receives EIF LP commitments (KfW Capital, Saminvest, parts of CDP VC). Documents passthrough; do NOT double-count with the EIF layer.
    deployment_country TEXT,         -- ISO 2-letter of the deploying NDB / EU body. Distinct from companies.country (HQ of the recipient). Enables both "where capital was deployed" and "where companies sit" views.
    grant_amount_basis TEXT,        -- categorical describing what grant_amount_eur represents per source:
                                    --   'eic_eu_grant'         — actual EU grant to coordinator (EIC)
                                    --   'ipcei_state_aid'      — Commission-approved state aid (incl. national contributions; NULL for redacted decisions)
                                    --   'eib_debt_commitment'  — committed debt ceiling, not disbursed, not a grant (EIB)
                                    --   'if_eu_grant'          — actual Innovation Fund EU grant
                                    --   'chips_ju_total_public'— total JU public funding (EU + national combined; EU-only share is ~50%)
                                    --   'edf_eu_ceiling'       — EU contribution ceiling (DA can have up to 20% national co-funding on top)
                                    --   'eit_kic_support'      — no cash; support/acceleration services only (EIT Digital Champions, VAP); grant_amount_eur is NULL
                                    --   'eit_kic_grant'        — cash prize from EIT Manufacturing BoostUp competition (€2.5K–€50K)
                                    --   'eit_kic_equity'       — EIT Manufacturing equity investment (amount undisclosed; both grant_amount_eur and equity_amount_eur are NULL)
                                    -- Sprint 15 additions (SATR + national state-aid portals):
                                    --   'satr_aid_element'     — preferred SATR amount (the EC-published 'Aid element' field, in EUR after FX)
                                    --   'satr_nominal_amount'  — fallback when SATR aid_element is NULL; the headline 'Nominal Amount' field
                                    --   'sudop_aid_element'    — Polish SUDOP equivalent
                                    --   'regas_aid_element'    — Romanian REGAS equivalent
                                    --   'gov_si_aid_element'   — Slovenian gov.si equivalent
                                    -- Any aggregate query summing grant_amount_eur MUST filter to a single basis value or explicitly acknowledge the mix.

    -- Sprint 15 additions: SATR / national state-aid columns. NULL on pre-SATR rows.
    satr_tm_id TEXT,                -- TM-XXXXXX reference, unique per SATR award
    aid_instrument TEXT,            -- bid value from SATR (e.g. StateAidInstrumentPRC)
    aid_objective TEXT,             -- bid value from SATR (e.g. StateAidObjectiveGberArt25c)
    granting_authority TEXT,        -- granting authority name verbatim
    granting_authority_country TEXT -- ISO 2-letter of granting authority. Same as deployment_country in most cases; kept separate for cross-border awards.
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
CREATE INDEX idx_pfe_ipcei_linked ON public_funding_events(ipcei_linked) WHERE ipcei_linked = 1;
CREATE INDEX idx_pfe_deployment_country ON public_funding_events(deployment_country);
-- Sprint 15 SATR indexes
CREATE INDEX idx_pfe_satr_tm_id ON public_funding_events(satr_tm_id) WHERE satr_tm_id IS NOT NULL;
CREATE INDEX idx_pfe_aid_instrument ON public_funding_events(aid_instrument);
CREATE INDEX idx_pfe_aid_objective ON public_funding_events(aid_objective);
CREATE INDEX idx_pfe_granting_authority_country ON public_funding_events(granting_authority_country);
CREATE INDEX idx_prfe_company ON private_funding_events(company_id);
CREATE INDEX idx_prfe_date ON private_funding_events(event_date);
CREATE INDEX idx_classify_audit_company ON classify_audit(company_id);
CREATE INDEX idx_classify_audit_changed_at ON classify_audit(changed_at);

-- Sprint 14 (2026-05-29): Europe-scope enforcement. The corpus is restricted
-- to a 40-country EU/Europe scope defined in data/europe_scope.json. These
-- triggers reject INSERTs and UPDATEs that would put a company outside the
-- scope. Extractors should call scripts/europe_scope.canonicalise_country()
-- before inserting so aliases (EL->GR, UK->GB, PO->PL, SW->SE, GL->DK) get
-- normalised and out-of-scope rows get skipped, rather than tripping the
-- trigger.
-- See docs/europe_scope.md for the rationale.
CREATE TRIGGER trg_companies_country_scope
BEFORE INSERT ON companies
WHEN NEW.country IS NOT NULL
  AND UPPER(TRIM(NEW.country)) NOT IN (
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE',
    'IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
    'NO','CH','IS','LI','GB','AL','BA','ME','MK','RS','XK','UA','MD',
    ''
  )
BEGIN
  SELECT RAISE(ABORT, 'Europe-scope violation on companies.country: not in the 40-country EU/Europe scope. Use scripts/europe_scope.canonicalise_country() before insert or skip the row. See docs/europe_scope.md.');
END;

CREATE TRIGGER trg_companies_country_scope_update
BEFORE UPDATE OF country ON companies
WHEN NEW.country IS NOT NULL
  AND UPPER(TRIM(NEW.country)) NOT IN (
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE',
    'IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
    'NO','CH','IS','LI','GB','AL','BA','ME','MK','RS','XK','UA','MD',
    ''
  )
BEGIN
  SELECT RAISE(ABORT, 'Europe-scope violation on companies.country UPDATE: not in the 40-country EU/Europe scope. See docs/europe_scope.md.');
END;
