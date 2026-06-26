# BACKLOG — Commercial-conform NDB equity via annual reports + EIF + InvestEU + Dealroom

> **Status: BACKLOG** (deferred 2026-05-31, originated from Sprint 16). The structural finding that motivates this plan is documented in `project-mgmt/methodology.md` § Known limitations → "Structural blind spot: commercial-conform NDB equity (Sprint 16)".
>
> **When to revisit**: when (a) LLM-PDF parsing tooling is set up (multi-week effort per NDB but tractable), (b) institutional Dealroom / Pitchbook access materialises, or (c) the user explicitly accepts a multi-week effort for the equity layer.

---

## The structural finding (verbatim from methodology.md)

**Article 107 TFEU defines state aid as a transfer of public resources that confers an "advantage" to undertakings on selective terms.** When a national development bank invests at market terms — pari passu with private co-investors, at commercial rates, in commercially viable companies — there is **no advantage**, therefore **no state aid**, therefore **no publication obligation** under SATR or any national state-aid register.

This is the regime that governs the bulk of NDB equity activity by volume:

| NDB | Annual deployment | Visibility in this corpus |
|---|---|---|
| Bpifrance equity (FR) | ~€2-3bn/yr direct equity tickets | ❌ Not in SATR; bpifrance.fr Cloudflare-protected |
| KfW Capital LP commitments (DE) | ~€500M-1bn/yr to ~80 German+EU VC funds | ❌ Pari passu LP, not state aid |
| CDP Equity strategic holdings (IT) | ~€10bn AUM (Eni, Snam, Saipem, Fincantieri) | ❌ Strategic equity in listed champions |
| EIFO equity tickets (DK) | ~€500M-1bn/yr venture co-invest | ❌ Pari passu venture co-investment |
| AWS Gründerfonds + Mittelstandsfonds (AT) | ~€100M/yr | ❌ Equity layer only partially in SATR |
| Vinnova Industrial PhD via Saminvest (SE) | partial | ❌ LP layer not in SATR |
| Caisse des Dépôts equity tickets (FR) | ~€500M/yr | ❌ Mostly out of SATR |

After Sprint 16 the corpus catches the **grant / soft-loan / subsidy-element** layer comprehensively via SATR + central registers (ADEME, BDNS-CDTI, Innovationsfonden, Bpifrance-i-Nov/PM'up/Innov'up Leader/PdR-Industriel, EIFO Venturelisten co-invest, PL SUDOP). It does NOT catch the commercial-conform **equity / quasi-equity** layer.

Any "share of public capital reaching innovative companies" calculation built on this corpus undercounts the equity layer by design.

---

## Three recovery paths (ordered by feasibility)

### Path A — EIF + InvestEU central reports (low-hanging fruit, weeks not months)

**EIF Annual Transparency Report** publishes the list of all EU venture-capital funds that received EIF as LP, including KfW Capital, CDP VC, Saminvest, Bpifrance-managed funds. PDF + Excel annexes.

- **Coverage**: ~200-400 EU VC funds across 27 member states, with named LP commitments per fund per year (2018-current).
- **Yield**: ~5,000-15,000 fund-level events (LP layer). Each fund is an `entity_type='other'` row; portfolio companies of the fund are recoverable only via the fund's own disclosure.
- **Effort**: 2-4 days. Single PDF parser + annual refresh.

**InvestEU Operations Register** (published by EIB Group and Commission): list of guarantee and equity operations under InvestEU, including all implementing partners (KfW Capital, CDP, Bpifrance, EIFO, etc.).

- **Coverage**: 2021-current; per-operation amounts + implementing partner + final beneficiaries (where disclosed).
- **Yield**: ~2,000-5,000 operation-level events.
- **Effort**: 2-3 days.

### Path B — Annual-report PDF parsing per NDB (multi-week effort, tractable)

Every major NDB publishes a glossy annual report with a portfolio appendix listing named companies. LLM-assisted parsing recovers ~80% of named tickets.

Priority NDBs (ordered by deployment volume):

| NDB | Annual report URL pattern | Years available | Estimated entries |
|---|---|---|---|
| Bpifrance | `bpifrance.fr/notre-rapport-annuel` | 2018-2024 | ~3,000-5,000 |
| KfW (federal) | `kfw.de/Ueber-die-KfW/Service/Download-Center/Konzernthemen/Geschaeftsbericht.html` | 2018-2024 | ~500-1,500 |
| KfW Capital | `kfw-capital.de/About-us/Annual-Report` | 2018-2024 | ~300-600 |
| CDP | `cdp.it/sitointernet/it/relazione_finanziaria_annuale.page` | 2018-2024 | ~500-1,500 |
| EIFO | `eifo.dk/om-eifo/aarsrapport` | 2024- (post-merger) + Vækstfonden legacy | ~200-500 |
| Bpifrance Investissement (sub-entity) | annual closing | 2018-2024 | ~500-1,000 |
| AWS Austria | `aws.at/ueber-aws/jahresbericht` | 2018-2024 | ~200-400 |

**Pipeline pattern**:
1. Download annual report PDF per NDB per year.
2. LLM-parse the "Portfolio" / "Beteiligungen" / "Participations" / "Holdings" appendix into structured CSV.
3. Manual validation pass (sample 50 rows per PDF; reject if extraction quality <90%).
4. Match against existing companies, insert as new rows tagged `<ndb>_equity_<year>` with `grant_amount_basis='annual_report_equity'` and `equity_amount_eur` from disclosed ticket OR `NULL` (most NDBs disclose portfolio names but not per-ticket amounts).

**Yield estimate**: ~6,000-12,000 equity-layer events covering the top 7 NDBs.

**Effort**: 1 day per NDB-year × 7 NDBs × 5 years = ~35 person-days. Realistic as a dedicated sprint once LLM-PDF tooling is reusable.

### Path C — Commercial Dealroom / Pitchbook / Crunchbase (gold standard, requires licence)

Best path because the NDB appears as a named investor in round syndicates, with round amount, lead, co-investors, date, stage, sector.

See companion plan [`private_side_paid_api_reference.md`](private_side_paid_api_reference.md) for the budget + licensing path.

**Yield estimate**: every disclosed round 2018-current with NDB co-investment, ~15,000-30,000 round events covering all major European NDBs.

**Effort**: ~2 weeks once API access exists.

---

## Schema additions (no migration needed — current schema supports this)

Reuse existing fields:
- `equity_amount_eur` — for disclosed ticket amounts (NULL where NDB discloses only portfolio name)
- `total_project_cost_eur` — for round total (Path C)
- `grant_amount_basis` — add new values: `annual_report_equity`, `eif_lp_commitment`, `investeu_operation`, `dealroom_round`
- `ndb_distributor` — populated as today (Sprint 15 taxonomy)
- `coordinator_only=0`, `role='portfolio_company'` or `'lp_in_fund'` or `'co_invest'`

---

## Execution order (when this plan is revived)

**Path A → Path B → Path C.**

- **Path A first** (EIF + InvestEU): fastest yield, central reports, no per-NDB work. Covers the LP-layer transitively for many NDBs at once.
- **Path B second** (annual report PDFs): biggest coverage gain at company level. LLM tooling reusable across NDBs once first one is built.
- **Path C last** (commercial APIs): pending licensing. Highest quality but blocked on budget.

---

## Out of scope (explicit)

- **Real-time NDB portfolio refresh**: this is annual-batch enrichment. Daily refresh requires direct NDB API integrations that don't exist.
- **Sub-ticket disclosures**: where NDB publishes "Fund X received €50M from KfW Capital" but not "Fund X invested €2M in Startup Y", we cannot bridge the LP → portfolio company gap without Path C.
- **Pre-2018 historical equity**: matches Sprint 15 time-window.

---

## Definition of done (when this plan is revived)

- Path A: EIF + InvestEU loaders shipped; `eif_lp_<year>` + `investeu_<year>` source families in corpus.
- Path B: At least Bpifrance + KfW Capital + CDP + EIFO annual reports parsed for 2021-2024 (4 years × 4 NDBs = 16 PDFs). New rows tagged correctly. methodology.md "Structural blind spot" section updated to "Substantially mitigated as of Sprint <N>".
- Path C (when licensing arrives): backfill EIC, IPCEI, NDB cohorts with named investor syndicates from Dealroom.
- Caveats per NDB documented in `project-mgmt/methodology.md` (disclosure granularity varies — Bpifrance discloses names but not amounts; EIFO discloses round size but not ticket size; etc.).
