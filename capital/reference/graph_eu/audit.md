# EU knowledge-map coverage audit (19 Nov 2026)

Held against: the Commission programme pages (commission.europa.eu "EU funding programmes"), the executive agencies' programme pages (CINEA, EISMEA, HaDEA, REA), the InvestEU, EIB and EIF governance pages, the EDF and Chips JU pages. Map = `mandate/brains/wincent/knowledge_map.yaml` EU block (institutions eu.*, 16 products, 8 processes) and `capital/reference/graph_eu/{structure,offers}.yaml`. Nothing in the map was edited; the paste-ready additions are the last block. Limits of this pass: EUR-Lex returns an anti-bot 202 to automated fetch, so founding regulations (e.g. Regulation (EU) 2021/523 InvestEU, 2021/695 Horizon Europe) were not read as text; the Council site (consilium.europa.eu) returns 403; commission.europa.eu rate-limits (429) DG pages (DG BUDG, DG MOVE, DG EMPL, DG AGRI not reached).

## 1. MFF programmes that fund companies

| Programme | Managing DG / agency (official page) | In map? |
|---|---|---|
| Horizon Europe | DG RTD policy; REA (clusters 2, 3, 6, widening), HaDEA (clusters 1, 4: "HaDEA implements Cluster 1 and 4."), CINEA (energy), EISMEA (EIC); https://rea.ec.europa.eu/about-rea_en , https://hadea.ec.europa.eu/programmes_en | yes (eu.rtd, eu.rea, eu.hadea, eu.cinea); joint undertakings MISSING |
| EIC (Pathfinder, Transition, Accelerator, EIC Fund) | EISMEA; https://eismea.ec.europa.eu/about-eismea_en | yes |
| Innovation Fund | DG CLIMA policy, CINEA delivery; https://cinea.ec.europa.eu/programmes/innovation-fund_en | yes |
| InvestEU | DG GROW (policy), EIB Group and 17 other implementing partners; EUR 26.2bn guarantee, EUR 31.7bn max guarantee approved Oct 2026; https://investeu.europa.eu/investeu-programme/investeu-fund_en | yes (eu.investeu); implementing partners other than EIB Group MISSING |
| Digital Europe | HaDEA; https://hadea.ec.europa.eu/programmes_en | yes |
| LIFE, CEF (energy, transport), EMFAF | CINEA; https://cinea.ec.europa.eu/programmes_en ; CEF digital via HaDEA | LIFE yes; CEF has no product or node (MISSING eu.cef) |
| ERDF / Cohesion | DG REGIO via managing authorities; https://commission.europa.eu/funding-tenders/find-funding/eu-funding-programmes/european-regional-development-fund-erdf_en | yes |
| Interregional Innovation Investments (I3, ERDF instrument) | EISMEA; https://eismea.ec.europa.eu/programmes_en | MISSING (eu.i3) |
| Single Market Programme (COSME successor: competitiveness of enterprises, Enterprise Europe Network) | EISMEA (enterprises), HaDEA (food); https://commission.europa.eu/funding-tenders/find-funding/eu-funding-programmes/single-market-programme_en | MISSING (eu.smp) |
| European Defence Fund (about EUR 7.3bn 2021-27) | DG DEFIS, "implemented directly by the Commission"; https://defence-industry-space.ec.europa.eu/eu-defence-industry/european-defence-fund-edf_en | MISSING (eu.defis, eu.edf) |
| Recovery and Resilience Facility | Commission RECOVER task force with member-state plans; https://commission.europa.eu/business-economy-euro/economic-recovery/recovery-and-resilience-facility_en (page text not readable from here) | MISSING, to verify |
| STEP | held as eu.step under DG GROW; not re-verified | yes |
| Chips JU (budget about EUR 11bn incl. EUR 3bn EU; Commission, Participating States, private members) | https://www.chips-ju.europa.eu/about-us/ | MISSING (eu.chipsju) |
| Other Horizon joint undertakings (Clean Hydrogen, CBE, EuroHPC, SESAR, Clean Aviation, IHI, SNS) | their own sites; not fetched (several timed out) | MISSING, to verify |
| ERC (ERCEA), EACEA (Creative Europe), EIT and the KICs | not fetched (EACEA pages 404 from here; EIT page 200 but no governance text) | MISSING, low for company finance |

## 2. EIB Group mandates

EIB (shareholders: the 27 Member States; statutory bodies Board of Governors, Board of Directors, Management Committee, Audit Committee: https://www.eib.org/en/about/governance-and-structure/statutory-bodies/index.htm), EIF (EIB majority shareholder), EIC Fund (managed by the EIB Group), InvestEU Advisory Hub are in the map. MISSING as nodes: the Member States as shareholders (eu.ms) and the EIB statutory bodies (eu.eib.bog, eu.eib.mc), useful for the sits_on network. EIF leadership page (eif.org/who_we_are/leadership) 404s; the existing EIF organisational-chart PDF in the map is current.

## 3. Budget-setting bodies

| Body | Status | Proof |
|---|---|---|
| European Parliament BUDG | in map | https://www.europarl.europa.eu/committees/en/budg/about |
| EP CONT (budgetary control) | MISSING, low | not fetched |
| Council: Working Party on Budget, ECOFIN | MISSING; every consilium.europa.eu URL returned 403, so no page text and no link | https://www.consilium.europa.eu/en/policies/the-eu-budget/ (unreadable from here) |
| DG BUDG | MISSING; page rate-limited (429) | https://commission.europa.eu/about-european-commission/departments-and-executive-agencies/budget_en |
| MFF itself | MISSING as a node (eu.mff) | BUDG about page names the MFF negotiations |

## 4. Network, summary

`links.yaml`: 12 cited ties: owns 3 (EIB to EIF, EIB Group to EIF, Member States to EIB), delegates_to 3 (Commission to CINEA, EISMEA, HaDEA), mandates 3 (EIC to EIC Fund, Commission to EIB and InvestEU to EIF for InvestEU), funds 1 (Commission to EDF), sits_on 1 (Commission on the Chips JU), oversees 1 (BUDG over the MFF). Not sourced and therefore left out: Commission delegation to REA (page text lacks a delegation sentence), EIB Board of Governors membership, Council budget bodies, founding regulations on EUR-Lex.

## 5. Proposed additions (paste into the EU block)

URLs below returned 200 with page text from this machine; `url: ''` means still to find.

```yaml
institutions:
  - {key: eu.ms, name: Member States (shareholders of the EIB), kind: institution, level: eu}
  - {key: eu.defis, name: DG DEFIS (Defence Industry and Space), kind: division, parent: eu.commission, level: eu}
  - {key: eu.edf, name: European Defence Fund (about EUR 7.3bn 2021-2027), kind: programme, parent: eu.defis, level: eu}
  - {key: eu.chipsju, name: Chips Joint Undertaking, kind: institution, parent: eu.commission, level: eu}
  - {key: eu.mff, name: Multiannual Financial Framework 2021-2027 (EU budget), kind: programme, parent: eu.commission, level: eu}
  - {key: eu.cef, name: Connecting Europe Facility (CINEA, HaDEA), kind: programme, parent: eu.commission, level: eu}
  - {key: eu.smp, name: Single Market Programme (EISMEA, HaDEA), kind: programme, parent: eu.commission, level: eu}
  - {key: eu.i3, name: Interregional Innovation Investments instrument (ERDF, EISMEA), kind: programme, parent: eu.eismea, level: eu}
products:
  - {key: eu.edf.calls, name: European Defence Fund collaborative calls, offered_by: eu.edf, type: grant}
  - {key: eu.chipsju.calls, name: Chips JU calls (Chips for Europe), offered_by: eu.chipsju, type: grant}
  - {key: eu.cef.calls, name: Connecting Europe Facility calls (energy, digital), offered_by: eu.cef, type: grant}
  - {key: eu.smp.calls, name: Single Market Programme calls for SMEs, offered_by: eu.smp, type: grant}
processes:
  - {key: eu.p.edf, title: A European Defence Fund call proposal (consortium, Funding and Tenders portal), for: eu.edf.calls}
  - {key: eu.p.chipsju, title: A Chips JU call application, for: eu.chipsju.calls}
org_charts:
  - {key: eu.defis, url: 'https://commission.europa.eu/document/download/185c969a-2a3f-411e-a01f-e8f194c5439d_en?filename=defis_organisation_chart_en_0.pdf', cadence: monthly}  # loaded; PDF organigram, Director-General Timo Pesonen
  - {key: eu.cinea, url: 'https://cinea.ec.europa.eu/about-us_en', cadence: monthly}  # loaded; general about page, chart PDF link to find (replaces the empty url)
  - {key: eu.chipsju, url: 'https://www.chips-ju.europa.eu/about-us/', cadence: monthly}  # loaded; general, governance page to find
  - {key: eu.ep.budg, url: 'https://www.europarl.europa.eu/committees/en/budg/home/members', cadence: monthly}  # loaded; already in map
  - {key: eu.edf, url: 'https://defence-industry-space.ec.europa.eu/eu-defence-industry/european-defence-fund-edf_en', cadence: monthly}  # loaded; programme page, no org chart
  - {key: eu.ms, url: '', cadence: monthly}  # no org chart; node for ownership links only
  - {key: eu.mff, url: '', cadence: monthly}  # no org chart; node for budget links only
```
