# Instrument term records — schema

One YAML per instrument. This is the machine layer under the fund-processes
briefs: structured, citable, per-gate. The eligibility engine evaluates an
EligibilityProfile against `gates[]`; the memo renders met / not-met / unknown
with cures. NOTHING renders as fact unless `verified: true` (human checked the
span in the local source copy). Unverified gates render as "verify: ...".

```yaml
id: de_kfw_erp_foerderkredit_kmu        # stable key
name: ""                                 # display name
administering_body: ""                   # who decides
country: DE | IT | FR | IE | EU
capital_type: grant | loan | guarantee | counter_guarantee | equity | blended | tax_credit
borrower_models: [operating_company, balance_sheet_lender, originator, fund_manager]
founder_fit: startup_ready | consortium_institutional | large_scale_industrial
                                          # startup_ready = single applicant, SME-scaled,
                                          # no consortium/large-capex prerequisite (grants,
                                          # SME loans/guarantees, EIC, tax credits).
                                          # consortium_institutional = requires a 3+ partner
                                          # consortium or targets research orgs (Horizon,
                                          # EIT, Chips JU, EDF).
                                          # large_scale_industrial = scaled for capital-
                                          # intensive/mid-cap+ projects regardless of
                                          # consortium shape (IPCEI, Innovation Fund, EIB
                                          # growth debt). Drives instrument-table
                                          # ordering/flagging in buildInstrumentTable() —
                                          # never presented as equivalent to startup_ready.
fit_rationale: ""                        # one clause: why this bucket, cited if it turns
                                          # on a legal fact (e.g. mono-beneficiary vs
                                          # consortium requirement)
status: draft | verified                 # record-level; gates carry their own flag
gates:
  - id: sme_test
    gate_family: G1_nexus | G2_size_ownership | G3_financial | G4_borrower_model | G5_use_of_funds | G6_conditionality
    requirement: ""                      # human sentence, precise
    value: ""                            # threshold/enum if applicable
    source: {file: "", locator: ""}      # data/raw/instrument_docs file + article/page
    verified: false
obligations:                             # what the money REQUIRES of you
  - requirement: ""                      # e.g. "funded investment located in Germany"
    source: {file: "", locator: ""}
    verified: false
cumulation: ""                           # interaction with other aid, cited
application: {channel: "", typical_timeline: ""}
ticket: {min_eur: 0, max_eur: 0}
verify_by: 2026-10-01                    # re-check date (calls/versions rotate)
notes: ""
```
