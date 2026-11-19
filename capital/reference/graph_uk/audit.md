# UK knowledge-map coverage audit (19 Nov 2026)

Held against: the official gov.uk list of departments, agencies and public bodies (https://www.gov.uk/government/organisations, read in full text) and the gov.uk pages cited per row. Map = `mandate/brains/wincent/knowledge_map.yaml` UK block (uk.gov, DBT, HMT, DSIT, UKRI, Innovate UK, BBB and 6 programmes, UKEF, NWF, HMRC, devolved banks, 3 Commons committees; 16 products, 6 processes) and `capital/reference/graph_uk/{structure,offers}.yaml`. Nothing in the map was edited; the paste-ready additions are the last block. Budget amounts per department were not read (no spending-review table fetched); sizes below are only those the pages state.

## 0. The map is stale on the departments (most important)

The gov.uk pages for DBT and DSIT say both have closed: "The Department for Business and Trade (DBT) has closed. It’s been replaced by the Department for Business, Innovation, Science and Trade (BIST)." and DSIT "existed until 2026. Its responsibilities were split across" BIST, DCMS (now Department for Digital, Culture, Media & Sport) and the Cabinet Office. UKRI, ARIA and BBB now name BIST as their department. The map still parents UKRI, BBB and UKEF on uk.dbt / uk.dsit. Proof: https://www.gov.uk/government/organisations/department-for-business-and-trade , .../department-for-science-innovation-and-technology , .../department-for-business-innovation-science-and-trade ("BIST is a ministerial department, supported by 30 agencies and public bodies"). Proposed: uk.bist, uk.dcms, and re-parenting (not done here; insert-only: keep uk.dbt, uk.dsit as predecessors). The UKEF gov.uk page still prints "Department for Business and Trade", so UKEF's current department is unclear; the index lists UKEF as its own ministerial department.

## 1. Departmental owners of business finance

| Department | Business-finance bodies on the official list | In map? |
|---|---|---|
| BIST (DBT + most of DSIT) | British Business Bank; British Technology Investments Ltd; UKRI; ARIA; Space Agency (corporate information links); Met Office, NPL, Post Office, Companies House, IPO (not finance) | BIST MISSING; BBB, UKRI yes; ARIA MISSING; British Technology Investments Ltd MISSING |
| HM Treasury | National Wealth Fund, UK Infrastructure Bank (the NWF's former name; gov.uk still lists both), UK Government Investments (UKGI), UK Debt Management Office, National Savings and Investments, The Crown Estate, Reclaim Fund | NWF yes; UKGI MISSING |
| DESNZ | Great British Energy ("Britain's publicly owned energy company", https://www.gbe.gov.uk/about-us), Great British Energy – Nuclear, Salix Finance Ltd, Low Carbon Contracts Company, UKAEA, Nuclear Decommissioning Authority | DESNZ MISSING; GB Energy MISSING; Salix MISSING |
| Ministry of Defence | UK Defence Innovation (UKDI, "Part of Ministry of Defence"); DASA became part of UKDI in February 2026; Dstl; Defence Equipment and Support; Sheffield Forgemasters International Ltd | MISSING (uk.mod, uk.ukdi; DASA) |
| DCMS (Digital, Culture, Media & Sport) | digital responsibilities from DSIT; British Film Institute and UK Sport fund sector grants | MISSING, low |
| UK Export Finance | its own ministerial department supported by the Export Guarantees Advisory Council | yes (uk.ukef) |
| DfT, Defra | National Highways, Rural Payments Agency, Agriculture and Horticulture Development Board: not company finance of the target kind | skip |

## 2. Delivery bodies and vehicles (about GBP 100M a year, a company can apply)

| Vehicle | Evidence | In map? |
|---|---|---|
| UKRI budget "more than £6 billion" (Innovate UK, Research England, 7 councils) | https://www.gov.uk/government/organisations/uk-research-and-innovation/about | yes; the councils other than Innovate UK MISSING (low) |
| Catapult Network, "nine Catapults with a national presence spanning over 65 locations" (Innovate UK is the funder; sponsorship sentence not found on the page) | https://catapult.org.uk/about-us/our-centres/ | MISSING (uk.catapult) |
| ARIA | exec NDPB sponsored by BIST; Act: https://www.legislation.gov.uk/ukpga/2022/4/contents | MISSING |
| NWF (GBP 27.8bn to deploy) | https://www.gov.uk/government/organisations/national-wealth-fund | yes |
| UKEF (GBP 50bn defence export programme announced 30 June 2026) | https://www.gov.uk/government/organisations/uk-export-finance | yes |
| UKDI funding competitions (DASA successor) | https://www.gov.uk/government/organisations/uk-defence-innovation | MISSING |
| Great British Energy | https://www.gbe.gov.uk/about-us | MISSING |
| Development Bank of Wales (wholly owned by the Welsh Ministers), SNIB, Invest NI (part of the NI Department for the Economy) | https://developmentbank.wales/about-us ; https://www.thebank.scot/about-us ; https://www.investni.com/about-us | banks yes; owner nodes (Welsh Government, Scottish Government, NI Department for the Economy) MISSING; Scottish Enterprise, Business Wales MISSING |
| Salix Finance (public-sector decarbonisation lending, DESNZ) | https://www.gov.uk/government/organisations/salix-finance-ltd | MISSING, low |

## 3. Network, summary

`links.yaml`: 11 cited ties: owns 6 (HMT to NWF, UKRI to Innovate UK, Welsh Ministers to DBW, NI Department for the Economy to Invest NI, MoD to UKDI, UKDI to DASA), oversees 4 (HMT to NWF, BIST to UKRI, ARIA, BBB), delegates_to 1 (UKRI to Innovate UK). The DBT-to-BIST succession is not a tie of the seven kinds and is left to section 0. Not sourced: DBT owning BBB (the page now says BIST), HMT-NWF statute (legislation.gov.uk s.1 text had no matching sentence), UKEF to DBT/BIST, Scottish Government to SNIB, BBB to British Patient Capital, Commons committees (committees.parliament.uk 403), BBB's own site (403).

## 4. Proposed additions (paste into the UK block)

```yaml
institutions:
  - {key: uk.bist, name: Department for Business, Innovation, Science and Trade (BIST; replaced DBT and DSIT in 2026), kind: ministry, parent: uk.gov, level: national}
  - {key: uk.dcms, name: Department for Digital, Culture, Media and Sport (DCMS), kind: ministry, parent: uk.gov, level: national}
  - {key: uk.desnz, name: Department for Energy Security and Net Zero (DESNZ), kind: ministry, parent: uk.gov, level: national}
  - {key: uk.mod, name: Ministry of Defence, kind: ministry, parent: uk.gov, level: national}
  - {key: uk.ukdi, name: UK Defence Innovation (UKDI; absorbed DASA in February 2026), kind: institution, parent: uk.mod, level: national}
  - {key: uk.dasa, name: Defence and Security Accelerator (DASA, now part of UKDI), kind: institution, parent: uk.ukdi, level: national}
  - {key: uk.aria, name: Advanced Research and Invention Agency (ARIA), kind: institution, parent: uk.bist, level: national}
  - {key: uk.bti, name: British Technology Investments Ltd, kind: institution, parent: uk.bist, level: national}
  - {key: uk.ukgi, name: UK Government Investments (UKGI), kind: institution, parent: uk.hmt, level: national}
  - {key: uk.gbe, name: Great British Energy, kind: institution, parent: uk.desnz, level: national}
  - {key: uk.salix, name: Salix Finance Ltd, kind: institution, parent: uk.desnz, level: national}
  - {key: uk.catapult, name: Catapult Network (nine Catapults, funded through Innovate UK), kind: institution, parent: uk.iuk, level: national}
  - {key: uk.wg, name: Welsh Government (Welsh Ministers), kind: ministry, level: regional}
  - {key: uk.dfe_ni, name: Northern Ireland Department for the Economy, kind: ministry, level: regional}
products:
  - {key: uk.ukdi.comp, name: UKDI funded competitions (DASA successor), offered_by: uk.ukdi, type: grant}
  - {key: uk.aria.prog, name: ARIA programme funding (Programme Director led), offered_by: uk.aria, type: grant}
  - {key: uk.catapult.access, name: Catapult centre access and collaborative projects, offered_by: uk.catapult, type: grant}
processes:
  - {key: uk.p.ukdi, title: A UKDI competition proposal, for: uk.ukdi.comp}
org_charts:
  - {key: uk.bist, url: 'https://www.gov.uk/government/organisations/department-for-business-innovation-science-and-trade/about/our-governance', cadence: monthly}  # loaded; Board chaired by the Secretary of State, committees
  - {key: uk.desnz, url: 'https://www.gov.uk/government/organisations/department-for-energy-security-and-net-zero/about/our-governance', cadence: monthly}  # loaded
  - {key: uk.mod, url: 'https://www.gov.uk/government/organisations/ministry-of-defence/about/our-governance', cadence: monthly}  # loaded
  - {key: uk.dcms, url: 'https://www.gov.uk/government/organisations/department-for-digital-culture-media-sport/about/our-governance', cadence: monthly}  # loaded
  - {key: uk.ukdi, url: 'https://www.gov.uk/government/organisations/uk-defence-innovation', cadence: monthly}  # loaded; organisation page, no chart
  - {key: uk.aria, url: 'https://www.aria.org.uk/about-us/', cadence: monthly}  # loaded; general page, people page to find (/about-us/people/ is 404)
  - {key: uk.ukgi, url: 'https://www.gov.uk/government/organisations/uk-government-investments/about', cadence: monthly}  # loaded
  - {key: uk.gbe, url: 'https://www.gbe.gov.uk/about-us', cadence: monthly}  # loaded; general
  - {key: uk.catapult, url: 'https://catapult.org.uk/about-us/our-centres/', cadence: monthly}  # loaded; centres page, CEOs page to find
  - {key: uk.hmt, url: 'https://www.gov.uk/government/organisations/hm-treasury/about/our-governance', cadence: monthly}  # loaded; already in map
  - {key: uk.ukef, url: 'https://www.gov.uk/government/organisations/uk-export-finance/about/our-governance', cadence: monthly}  # loaded; already in map
  - {key: uk.bti, url: '', cadence: monthly}  # still to find
  - {key: uk.salix, url: '', cadence: monthly}  # still to find
  - {key: uk.wg, url: '', cadence: monthly}  # still to find
  - {key: uk.dfe_ni, url: '', cadence: monthly}  # still to find
```
