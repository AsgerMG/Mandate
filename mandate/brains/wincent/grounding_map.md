# Wincent grounding map: DE, FR, IT, EU x every kind of public money

2026-11-10. Built for playbook `mandate/playbooks/funding-routes.md` (§1b diagnose, §1c precedent,
§4 deal-breakers, §4d: the level with the open door, the status that unlocks a market, reform as
the route), using the gaps in `alignment.md` and the master plan's step 6 recipe (official source ->
grounding -> table/tool -> re-run the cases). Includes the owner's round 3b additions: levels,
status matching, economic geography and political monitoring.

**How "held" was measured.** Production was queried read-only on 2026-11-10 (`capital_ro`:
`capital.funding_instruments`, `eligibility_gates`, `public_funding_events`, `public_equity_stakes`,
`signals_sources`; `grounding.documents/passages`) and through the public policy API
(`regina-production.up.railway.app/api/search`). Source URLs were checked the same day with an HTTP
GET. A 403 means the site blocks bots, not that the page is gone (Légifrance, bpifrance.fr,
economie.gouv.fr, sace.it); for each one the map names the route the loader should use instead.

---

## 1. The matrix

Legend: **H** held (instruments + rules + precedents, cited) · **P** partial · **M** missing ·
**–** not a real cell at this level. National cells are split **N / R / L** (national or federal /
regional: Land, Région or Regione / local: municipality, métropole, Camera di commercio).

| Money type | EU | DE N / R / L | FR N / R / L | IT N / R / L |
|---|---|---|---|---|
| 1. Guarantees (portfolio + individual; who may intermediate) | **M** | P / P / – | **M / M** / – | P / P / M |
| 2. Matchmaking, co-investment loans, venture debt | P | M / P / – | **M / M** / M | P / M / – |
| 3. Repayable advances, soft and subordinated loans | – | P / P / – | P / P / M | H / P / M |
| 4. Grants (R&D, deployment, regional, EU calls) | H (Digital Europe M) | H / P / M | H / P / M | H / P / M |
| 5. Tax incentives (R&D credits, startup regimes, investor reliefs) | – | P / – / – | **M** / – / M | P / – / – |
| 6. Public equity and fund-of-funds | P | P / P / – | P / M / – | P / M / – |
| A. **Status rules** (applicant vs intermediary, structured) | M | M | M | M |
| B. Intermediary-side precedents ("you did it before") | M | M | M | P |
| C. Economic geography (S3, ERDF priorities, industrial profile) | M | M | M | M |
| D. Political monitoring (decrees, budget laws, bills, regional councils) | P | P (no Länder) | P (no Régions) | **M** (2 feeds) |
| E. People: units, heads, P1/P2 | M | M | M | M |

**Tally over the 42 real money-type cells (not counting "–"):** 5 H, 21 P, 16 M. By column:
EU 1/2/1, DE 1/8/2, FR 1/4/8, IT 2/7/5 (H/P/M). Every cross-cutting row (A to E) is M or P everywhere.

**Read it like this.** We hold the *beneficiary side of grants* well at national and EU level,
plus Italy's MCC guarantees and soft loans. We do not hold the *rules*: zero statute text for KWG,
the CMF, TUB, FZulG, CGI 244 quater B or DL 179/2012, and no GBER or InvestEU regulation text. We do
not hold the *intermediary side* or the *status logic* that §4d needs. Everything below the
national level is thin: 13 instruments across the six Italian regions the owner named, and none
for Veneto.

### Production counts behind the matrix (2026-11-10)

| What | DE | FR | IT | EU |
|---|---|---|---|---|
| Instruments (all types) | 121 | 137 | 91 | 67 |
| of which grant / loan / guarantee / tax / equity | 83 / 14 / 1 / 21* / 2 | 127 / 9 / 0 / 0 / 1 | 65 / 15 / 5 / 3 / 2 (+1 blended) | 48 / 1 / 0 / – / 5 (+8 framework rows) |
| Instruments tagged to a region (`delivery_region`) | 61 | 19 | 39 (six target regions: 13; Veneto 0) | – |
| Eligibility gates on those instruments | 1,175 | 926 | 594 | 1,437 |
| SATR awards (2021-26): direct grant | 21,218 | 11,522 | 10,294 | – |
| SATR: repayable advance / soft loan (`Lradv`) | 2,293 | 5,819 | 2,281 | – |
| SATR: guarantee (`G`) | 106 | **1** | 14,391 (MCC 14,343) | – |
| SATR: tax advantage (`Taote`) | 5,796 | **32** | 725 | – |
| SATR: risk finance (`PRVRISKFIN`) | 72 | 4 | 7 | – |
| Public equity stakes | HTGF 538, Bayern Kapital 133, IBB Ventures 100, Coparion 52 | Bpifrance 13 | CDP VC 81 | EIC Fund 233 |
| Award records from regional authorities (SATR) | LfA 254, L-Bank 656, NRW.BANK 352, SAB 1,096, NBank 488 ... | Nouvelle-Aquitaine 603, IDF 251, HdF 175, AURA 0 tagged | Piemonte 417, Lombardia 372, Lazio 254, E-R 222, Toscana 11, **Veneto 0** | – |
| Grounding docs, statute hosts | gesetze-im-internet **0**; recht.bund.de 167 (BGBl, none on KWG/FZulG); BMF Forschungszulage page 1; BaFin bank-licence Merkblatt 1 | legifrance **0**; bofip **0** | normattiva **0**; bancaditalia **0**; GU **0** | eur-lex 2,440, but GBER, InvestEU, Horizon, DEP, CPR and de minimis texts **0**; ECF proposal 1; STEP 1 |
| Grounding docs, programme hosts | kfw 5, VDB 1, l-bank 2 | bpifrance 1 (+3 scheme PDFs) | mimit 10, incentivi.gov.it 7, invitalia 3, fondidigaranzia 2 (**the 2018 Disposizioni operative, superseded**) | eif.org 2, eic.ec 4 |
| News/signal feeds (19,963 articles; no Wincent tool reads them) | 8 | 11 | **2** | 41 |

\* DE tax: 21 rows that are mostly the Forschungszulage repeated once per Finanzamt, plus one CHP
surcharge row. Policy API: 11,166 documents; searching "Forschungszulage" or "testo unico
bancario" returns newsletters and unrelated EU acts, no statute. Actors register: 0 rows.

---

## 2. Per cell: the deciding facts and their sources

Format: **Deciding facts** (what a senior must know) · **Sources** (URL; format; how often it
changes; ✓ = HTTP 200 on 2026-11-10, ⛔ = 403 bot-block with the route to use instead, ? = not
verified) · **Gap -> load** (D = a document to ground, S = structured rows to load).
"Verify" marks a fact taken from secondary sources that must be cited from the official text
before Wincent may assert it.

### 2.0 Cross-cutting EU law that every national cell inherits
- **GBER, Reg. (EU) 651/2014** (as amended by 2023/1315): Art. 6 incentive effect (apply before
  work starts), Art. 22 aid to start-ups (young unlisted firms, ≤5 years), Art. 25 R&D intensities,
  Art. 21 risk finance, Annex I SME definition, cumulation (Art. 8). **De minimis, Reg. 2023/2831**
  (EUR 300k over 3 years). Sources: eur-lex.europa.eu/eli/reg/2014/651/oj ✓ (HTML/PDF; amended
  every 2-3 years), eli/reg/2023/2831/oj ✓. Gap: **0 texts held** (only 8 hand-written "framework"
  instrument rows). Load D, one-off.
- **State-aid transparency (TAM/SATR)**, webgate.ec.europa.eu/competition/transparency/public ✓,
  plus the case register ec.europa.eu/competition/state_aid/register ✓. Already our main precedent
  source (2021-26, awards over EUR 100k only). Refresh as today.

### 2.1 Guarantees

**EU (InvestEU / EIF): M.**
- Facts: Reg. (EU) 2021/523 (InvestEU). The EIF runs **six portfolio guarantee products** (SME
  competitiveness; sustainability; innovation and digitalisation; cultural and creative;
  microfinance and social; skills and education), selected through an **open call for expressions
  of interest**. Eligible intermediaries include non-bank lenders and debt funds if they are
  authorised to lend under national law (verify the exact wording in the call and in Annex I of the
  application). For a lender active in several member states this is the quickest door (owner,
  round 3). **Reform:** the European Competitiveness Fund, COM(2025) 555, is meant to absorb
  InvestEU as the single access point for guarantees in the 2028-34 MFF. The Council agreed a
  partial position on 16 Jun 2026; Parliament's plenary mandate was expected on 19-22 Oct 2026
  (verify the outcome in OEIL). Watch the carve-outs for alternative lenders.
- Sources: eif.org/InvestEU/guarantee_products/index.htm ✓; .../guarantee_products_calls/index.htm
  ✓ (call PDF and annexes; changes on amendment); **eif.org/InvestEU/financial-intermediaries** ✓,
  which links PDF "visibility reports" of debt FIs, sub-FIs, final recipients and equity FIs
  (`eif.org/files/calls/ieu-debt-visibility-report-financial-intermediaries.pdf`; updated about
  every six months); legacy precedents in `cosme-lgf-signatures.pdf` ✓; investeu.europa.eu
  operations list ✓ (HTML, paged); EIF press releases ✓ (weekly); the OEIL procedure file for the ECF (procedure number to
  take from COM(2025) 555 at load); data.consilium.europa.eu ST documents (e.g. ST-10489-2026).
- Held: 0 EIF instruments, 2 eif.org pages (stored as research), 1 ECF proposal, 0 visibility
  reports. **Gap -> load:** D (regulation, call, six product sheets, ECF proposal + Council
  position), S (the visibility reports as ~1-3k intermediary-side precedent rows: country,
  intermediary, product, guarantee type, amount). One-off load, refresh monthly.

**DE: N P / R P / L –.**
- Facts: lending is a regulated *Kreditgeschäft* (**KWG §1(1) Nr. 2**; guarantees are
  *Garantiegeschäft*, Nr. 8) that needs a **§32 licence** from BaFin. Public guarantees reach SMEs
  only **through a Hausbank**: 17 Bürgschaftsbanken (one or more per Land) carry federal and Land
  counter-guarantees (*Rückbürgschaften*); KfW grants *Haftungsfreistellung* to on-lending banks
  (80% on StartGeld). Large cases go to the Bund/Länder *Großbürgschaften*. **There is no route
  today for a non-bank lender's portfolio** (owner, round 3). The reform is the route, and it is not
  yet pinned down: the **Fondsrisikobegrenzungsgesetz** (AIFMD II; BGBl. 2026 I Nr. 97, in force
  16 Apr 2026, §§29a ff. KAGB) now lets loan-originating AIFs lend, but it does not open
  Bürgschaftsbank or KfW guarantees to them. Bundesrat Drs. 552/25 on a KWG amendment is a second
  lead. **The specific bill the owner means must be found in DIP before Wincent advises.**
  Ministry: BMWE (Mittelstandsfinanzierung) and BMF (Rückbürgschaft budget).
- Sources: gesetze-im-internet.de/kredwg/__1.html ✓ and /__32.html ✓ (HTML; amended several times
  a year); BaFin Merkblatt on the bank licence (held, 1); vdb-info.de ✓ and ermoeglicher.de ✓
  (the Bürgschaftsbanken's federal association: products, ceilings, the Rückbürgschaft framework);
  each Bürgschaftsbank's product sheets (PDF, yearly); KfW Merkblätter (PDF, on each programme
  change); DIP API search.dip.bundestag.de/api/v1 ✓ (JSON, daily); bundestag.de committee pages.
- Held: 1 instrument (BB Baden-Württemberg Rückbürgschaft, 60 awards), 106 SATR guarantee awards,
  VDB page 1, KWG text 0. **Gap -> load:** D (KWG §§1, 2, 32; KAGB §§29a ff.; the VDB Rückbürgschaft
  rules; the 17 Bürgschaftsbanken product sheets), S (17 guarantee instruments, one per
  Bürgschaftsbank, with the status rule "Hausbank = KWG credit institution"), plus a DIP reform
  watch. One-off, refresh monthly.

**FR: N M / R M.**
- Facts: the banking monopoly sits in **CMF L.511-5**, with exceptions in L.511-6. A **société de
  financement** (CMF L.515-1 A, ACPR-authorised, may lend but takes no deposits) is the closest
  analogue to Italy's 106 status. Crowdlending runs through the ECSP regime, Reg. (EU) 2020/1503.
  **Bpifrance Financement guarantees** cover a share (typically 40-70%) of loans made by
  *établissements de crédit / sociétés de financement*; verify the beneficiary definition in the
  *conditions générales* before asserting it. Siagi co-guarantees; **regional guarantee funds** are
  co-funded by Régions and run by Bpifrance. Budget: LFI programme 134. Decider: Bpifrance's
  guarantee directorate (unit and head to identify).
- Sources: Légifrance ⛔, so use **DILA LEGI open data** echanges.dila.gouv.fr/OPENDATA/LEGI/ ✓
  (XML dumps, daily) or the PISTE Légifrance API piste.gouv.fr ✓ (OAuth, free); ACPR register
  REGAFI (?); bpifrance.fr ⛔, so use bpifrance-creation.fr ✓ guarantee pages, the
  assurance-export.bpifrance.fr PDFs (fetchable) and a browser-UA fetch for the *conditions
  générales*; Bpifrance's annual report (PDF, yearly) for guarantee volumes as precedents.
- Held: 0 guarantee instruments, 1 FR guarantee award, 0 CMF text. **Gap -> load:** D (CMF L.511-1,
  -5, -6, L.515-1 A; Bpifrance guarantee CG and product sheets; ECSP Reg.), S (Bpifrance guarantee
  products, about 6-10, and regional guarantee funds for AURA, IDF, HdF). One-off, refresh
  quarterly.

**IT: N P / R P / L M.**
- Facts: lending to the public is reserved to banks and to **financial intermediaries entered in
  the register under Art. 106 TUB** (D.Lgs. 385/1993; authorisation requirements in Art. 107, kept
  by Banca d'Italia). **Fondo di Garanzia PMI** (L. 662/1996 art. 2 c. 100 lett. a; MCC is the
  manager, MIMIT holds policy). It accepts requests from banks, 106 intermediaries and confidi, and
  offers **portfolio guarantees** (*garanzia su portafogli di finanziamenti*). The 2026 budget law
  lets freed resources be reused for portfolio guarantees (verify the plafond: sources say EUR 43bn
  or 140bn). **Reform in motion:** transitional access rules run to 31 Dec 2026, and a MIMIT draft
  decree sets risk-class cover of 40-70% from 2027. The DM of 21 Jan 2026 imposes an extra premium
  on lenders, but not on portfolio guarantees. The *Legge annuale PMI 2026* reorders confidi and
  touches the 106 requirements. Regional level: regional guarantee funds and *sezioni speciali* of
  the FdG (Finlombarda, Veneto Sviluppo, Lazio Innova, Fidi Toscana are themselves 106
  intermediaries), plus confidi. Local level: Camere di commercio co-fund confidi. **Status move
  (§4d):** obtaining 106 is a plan step with a timeline.
- Sources: TUB on Normattiva ✓ (normattiva.it, HTML plus open data at
  /staticPage/codiciOpenData ✓; deep links must be built per article); Banca d'Italia supervisory
  rules for intermediaries ✓ and the **albo 106 register** (infostat.bancaditalia.it GIAVA
  inquiry; the list of authorised firms is itself the precedent and competitor list);
  fondidigaranzia.it ✓, **current Disposizioni operative** (we hold the 2018 PDF, which is
  superseded; the "documenti" page still shows 2018, so find the version in force from MIMIT and
  MCC circulars); MCC circolari (PDF, monthly); MIMIT decrees; **RNA (Registro Nazionale Aiuti)**
  rna.gov.it ✓ (every award including de minimis, so it is the deepest Italian precedent source).
- Held: 5 FdG instruments, 14,343 MCC guarantee awards (beneficiary side), mimit FdG page 1, the
  2018 DO. **Gap -> load:** D (TUB arts. 106-107, 112; L. 662/96; current DO; portfolio-guarantee
  DM; 2027 reform draft; Legge PMI 2026), S (albo 106 register; regional guarantee products for
  the six regions; RNA guarantee awards granted *to intermediaries*). One-off, refresh monthly.

### 2.2 Matchmaking, co-investment loans and venture debt

**EU: P.** Facts: **EIC Accelerator** blended finance (grant plus EIC Fund equity; from the 2026
work programme), EIB Venture Debt (growth stage, direct), InvestEU venture debt through EIF debt
funds, and the new Scaleup Europe Fund (verify status). Sources: eic.ec.europa.eu calls ✓ (WP PDF,
yearly), eic-fund_en ✓, EIB project list eib.org/en/projects/loans ✓ (HTML, weekly), the EIF equity
visibility report. Held: EIB Venture 149 awards, EIC Fund 241 events and 233 stakes, EIC pages 4.
Gap: the work-programme text (D) and the EIF debt-fund list (S).

**DE: N M / R P.** Facts: federal start-up money flows through **KfW Capital** (fund-of-funds) and
the **ERP/Zukunftsfonds** modules: Venture Tech Growth Financing (venture debt alongside VC),
Wachstumsfonds, DeepTech & Climate Fonds. **coparion** co-invests *pari passu* with a private lead,
which is the German equity matchmaking route. **HTGF** does seed. Länder: **NRW.SeedCon** (NRW.BANK
loan matching a seed round), L-Bank Start-up BW Pre-Seed, Bayern Kapital, IBB Ventures. Sources:
kfw-capital.de ✓, htgf.de ✓, the Länder bank product pages lfa.de ✓, l-bank.de/produkte ✓,
nrwbank.de/de/foerderung ✓, foerderdatenbank.de ✓ (BMWE federal/Land/EU programme database, HTML,
weekly; the best one-stop D source). Held: HTGF 883 events, Coparion 52, NRW.SeedCon 1 instrument;
KfW Capital, Zukunftsfonds and VTGF 0. Gap: S (about 10 federal and 15 Länder instruments, with
the "private lead investor required" rule as a status field).

**FR: N M / R M / L M.** Facts: Bpifrance **Prêt d'amorçage** and **Prêt d'amorçage
investissement** are tied to a fundraise in progress, so they are the textbook §1b instrument.
**French Tech Seed** (quasi-equity alongside private investors), **Bourse French Tech**,
*prêts d'honneur* (Initiative France, Réseau Entreprendre; local). Local co-funding, for example
Paris Innovation Amorçage (Ville de Paris with Bpifrance). Sources: bpifrance.fr ⛔ (use a browser
fetch, bpifrance-creation.fr ✓, and the France 2030 operator pages); entreprises.gouv.fr ✓.
Held: 0. Gap: S (about 8 national, 3 per Région) plus D (product sheets).

**IT: N P / R M.** Facts: **Smart&Start Italia** (Invitalia; zero-interest loan for *startup
innovative*, part convertible to a grant; rules in the DM as amended); CDP Venture Capital
co-investment funds; regional co-investment (Lazio Innova venture instruments, Finlombarda,
Veneto Sviluppo, Finpiemonte). **Status gate:** registration as a *startup innovativa*. Sources:
invitalia.it/incentivi-e-strumenti/smartstart-italia ✓, cdpventurecapital.it ✓, incentivi.gov.it
✓ (national catalogue, HTML, weekly), the regional finanziarie ✓ (finlombarda.it, venetosviluppo.it,
finpiemonte.it, art-er.it, fiditoscana.it, lazioinnova.it/bandi; deep paths vary). Held: Smart&Start
1 blended instrument with 0 awards (the 2014 regolamento is held), CDP VC 81 stakes. Gap: S plus D.

### 2.3 Repayable advances, soft and subordinated loans

**DE: N P / R P.** Facts: **ERP-Förderkredit KMU (365/366)**, **ERP-Digitalisierungs- und
Innovationskredit (380/390/391)**, **ERP-Gründerkredit StartGeld (067)** (up to EUR 200k from
1 Feb 2026, firms ≤5 years old, 80% Haftungsfreistellung), all on-lent by the Hausbank and not
combinable with other KfW/ERP loans. Länder: LfA, L-Bank, NRW.BANK, IBB, SAB. Sources: KfW
Merkblätter (PDF, e.g. `6000002258_M_067_StartGeld.pdf`; change on programme updates, several a
year), the Länder product pages. Held: 14 loan instruments (365/366, 380, Rentenbank, L-Bank, LfA),
2,293 SATR advance/soft-loan awards, KfW pages 5. Gap: StartGeld and the innovation lines; D for
each Merkblatt.

**FR: N P / R P / L M.** Facts: Bpifrance **Aide pour projet d'innovation** (subsidy and/or
**avance remboursable**, often repayable only on success), i-Nov and i-Lab under France 2030, under
the national R&D&I *régime cadre exempté* (GBER-based). Régions run their own advances, usually
through Bpifrance regional agreements. Sources: bpifrance ⛔ (as above); france2030.gouv.fr ⛔
(browser fetch); the régime-cadre texts in the state-aid register ✓. Held: 9 régime-cadre "loan"
instruments, **5,819 SATR advance awards** (the precedents exist), 0 Bpifrance product pages.
Gap: D (product sheets, régime-cadre text) and S (link the awards to products).

**IT: N H / R P / L M.** Facts: **FCS / Accordi per l'innovazione**, **Nuove imprese a tasso zero**
(under 5 years; young or female founders), Invitalia Investimenti sostenibili 4.0, Contratti di
sviluppo, and **Nuova Sabatini** (an interest grant on bank or leasing loans for machinery, which is
the robot-deployment instrument; its lenders include banks and 106 leasing intermediaries, so it is
also a door for a fintech lender; verify). Regional: Lombardia Ricerca&Innova (loan), Puglia NIDI,
FVG. Sources: mimit.gov.it (timeouts from this network, so retry or use a browser fetch),
incentivi.gov.it ✓, invitalia.it ✓. Held: 15 loan instruments, 2,281 awards, eligibility pages.
**Missing: Nuova Sabatini** (0 rows). Gap: S (Sabatini plus regional loans for the six regions).

### 2.4 Grants

**EU: H, but Digital Europe M.** Horizon Europe Reg. 2021/695 (clusters, EIC Pathfinder,
Transition, Accelerator), Digital Europe Reg. 2021/694 (calls, EDIHs), Innovation Fund, joint
undertakings; ERDF via CPR 2021/1060. Sources: the Funding & Tenders portal ✓ (has an API; calls
change daily), digital-strategy.ec.europa.eu/en/activities/digital-programme ✓, Kohesio ✓ and
cohesiondata.ec.europa.eu (Socrata API; it returned 503 at check time, so retry). Held: 48 grant
instruments, about 69k award records. **Gap:** regulation texts (D) and Digital Europe calls and
awards (S).

**DE: N H / R P / L M.** ZIM (BMWE, SME R&D), EXIST (start-ups from universities), KMU-innovativ
(BMFTR), GRW (regional investment), SPRIND; Länder EFRE programmes (the managing authorities are
Land ministries: efre-bw.de ✓, efre.bayern.de ✓, efre.nrw ✓). **Sequencing:** no
*vorzeitiger Maßnahmebeginn* before approval. Federal award list: **Förderkatalog**
foerderportal.bund.de/foekat ✓ (every federal project grant; CSV export). Held: 83 instruments,
43k awards; Förderkatalog not loaded. Gap: S (Förderkatalog for precedents; Länder EFRE calls for
BY, BW, NRW).

**FR: N H / R P / L M.** France 2030 calls (SGPI), Bpifrance i-Nov/Bourse French Tech, ADEME;
**Régions are the FEDER managing authorities** (europe-en-france.gouv.fr ✓); Région programmes such
as IDF Innov'up, AURA and HdF (auvergnerhonealpes.fr/aides ✓, iledefrance.fr/aides-et-appels-a-projets
✓, hautsdefrance.fr/aides ✓, hautsdefrance-id.fr ✓, auvergnerhonealpes-entreprises.fr ✓). Held:
127 instruments (ADEME-heavy), 68k awards, Région instruments FRI 5, FR10 3, AURA (FRK) 2. Gap: S
for the three target Régions (about 20-40 schemes each).

**IT: N H / R P / L M.** PN RIC 2021-27, PNRR calls, MIMIT, regional **PR FESR** (managing
authority: each Regione: Lombardia ✓, Emilia-Romagna fesr.regione.emilia-romagna.it ✓, Piemonte ✓,
Toscana regione.toscana.it/pr-fesr-2021-2027 ✓, Lazio lazioeuropa.it ✓, Veneto: URL to locate),
the regional calls portal bandi.regione.lombardia.it ✓, **Camere di commercio** vouchers (local;
camcom.gov.it ✓, unioncamere.gov.it ✓), **OpenCoesione** ✓ (every cohesion-funded project, open
data, bimonthly). Held: 65 instruments, 20k awards, 13 regional instruments in the six regions.
Gap: S (the six regions' open PR FESR calls, OpenCoesione projects as precedents).

### 2.5 Tax incentives

**DE: N P.** **FZulG**: 25% of eligible R&D costs (35% for SMEs); base capped at EUR 12m a year
from 1 Jan 2026 (Investitionssofortprogramm, Jul 2025), a 20% overhead flat rate, own work at EUR
100/h. Two steps: a **BSFZ certificate**, then the claim at the Finanzamt. It can be claimed after
the fact (no apply-before-start trap), but costs already funded by grants are excluded
(cumulation). **No statutory "startup" status exists in Germany**; proxies are firm age (StartGeld
≤5y), HTGF (<3y) and the BAFA INVEST investor grant (page live ✓; verify whether it takes new
applications in 2026). Sources: gesetze-im-internet.de/fzulg ✓, bescheinigung-forschungszulage.de
✓, the BMF Forschungszulage page (held), BMF letters (BMF-Schreiben, PDF). Held: the BMF page plus
21 duplicated Finanzamt rows, 5,796 awards, statute text 0. Gap: D (FZulG plus BMF-Schreiben);
collapse the Finanzamt rows into one instrument with administering offices as children.

**FR: N M / L M.** **CIR** (CGI art. 244 quater B: 30% up to EUR 100m, 5% above); **CII** for SMEs
(rate cut by LFI 2025, verify the current %), **CICo** extended to 31 Dec 2028 by LFI 2026, which
left the CIR unchanged (verify in the JORF text). **JEI** (CGI art. 44 sexies-0 A: an SME under 8
years with R&D ≥15% of costs; social-charge and local-tax exemptions, the local ones voted by each
collectivité, hence the L column). **Investor relief: IR-PME** (CGI 199 terdecies-0 A), which LFI
2026 refocuses on JEI-eligible companies, with the higher rates linked to JEI-R/JEI-C (verify).
Comfort: a CIR *rescrit* (LPF L.80 B 3°) and MESR approval for subcontractors. Sources: DILA LEGI
dump ✓ (Légifrance ⛔), **BOFIP** bofip.impots.gouv.fr ✓ (doctrine, HTML, updated on each change),
AN/Sénat PLF dossiers (held via Regina's sources). Held: 0 instruments, 32 awards, statute 0.
**Gap: the biggest single gap for the edtech and trust-AI cases.** D (CGI articles plus BOFIP
chapters), S (CIR, CII, JEI, JEI-R, IR-PME as instruments with status rules).

**IT: N P.** **Credito R&S&I** (L. 160/2019 c. 198-209: R&D 10% since 2023 with higher rates in
the Mezzogiorno; the technological-innovation credit ends in 2026; the design credit was extended
by L. 199/2025; verify c. 200 for 2026). **Startup innovativa** (DL 179/2012 arts. 25-32; reformed
by **L. 193/2024 art. 28** in force 18 Dec 2024: a stay beyond year 3 needs patents, PA contracts or
a capital increase, up to 5 years; MIMIT circolare 29 Jul 2025). **PMI innovativa** (DL 3/2015
art. 4). **Investor relief** (DL 179/2012 art. 29 and 29-bis: 30% deduction, or 65% under de
minimis; amended in 2024-25). Registry: the special section of the Registro imprese
(startup.registroimprese.it ✓, an open list updated weekly). Sources: Normattiva ✓, Agenzia
Entrate ✓ (deep links vary), MIMIT startup page (held, 1). Held: 3 tax instruments (the Mezzogiorno
credit, the investor incentive with 96 awards), statute 0. Gap: D (the four acts plus the circolare)
and S (the startup registry as a **status lookup**).

### 2.6 Public equity and fund-of-funds
- **EU P:** EIF fund-of-funds (InvestEU equity, ESCALAR, the European Tech Champions Initiative),
  EIC Fund (direct). Source: the EIF equity visibility report ✓ (the PDF list behind the
  financial-intermediaries page). Held: EIC Fund 233 stakes. Gap: EIF-backed VC fund list (S).
- **DE N P / R P:** KfW Capital (around 100+ funds), Zukunftsfonds, HTGF, coparion; Bayern Kapital,
  IBB Ventures (held: 538 / 52 / 133 / 100 stakes; KfW Capital fund list 0).
- **FR N P / R M:** Bpifrance direct and fund-of-funds (13 stakes held, a fraction of reality);
  regional funds (0).
- **IT N P / R M:** CDP Venture Capital (FNI) funds and portfolio (81 stakes); regional funds
  (Lazio Innova, Finlombarda, Veneto Sviluppo) at 0.

### 2.7 Status matching (owner 3b, item 2): structured, not prose
The matcher needs **one table** of rules that `find_instruments` and `fund_requirements` read
against the company profile. Proposed: `capital.instrument_status_rules`, insert-only:

| column | meaning |
|---|---|
| `instrument_id` or `product_family` | e.g. `it.fdg.portfolio_guarantee` |
| `level` | eu / national / regional / local, plus NUTS code |
| `role` | **applicant** \| **intermediary** \| **investor** (whose status is tested) |
| `status_key` | from a controlled vocabulary (below) |
| `effect` | required \| unlocks \| raises_rate \| excludes |
| `passage_id` | the grounding passage that says so (cited, versioned) |

Seed vocabulary (also new company-profile fields; extends `licencesHeld` in `alignment.md`):
`lic.de.kwg32_credit_institution`, `lic.de.kagb_loan_originating_aif`, `lic.fr.etablissement_credit`,
`lic.fr.societe_financement`, `lic.eu.ecsp_provider`, `lic.it.tub106`, `lic.it.confidi_112`,
`status.it.startup_innovativa`, `status.it.pmi_innovativa`, `status.fr.jei`, `status.fr.jei_r`,
`status.eu.sme_annex_i`, `status.eu.undertaking_in_difficulty`, `age.months`,
`estab.<country>.<nuts2>` (has an establishment there), `reg.eu.transparency_register`,
`reg.de.lobbyregister`, `raise.in_progress` (with round size).

Seed rules for the product families in this map (about 40 rows; each must be cited at load):

| Product family | Level | Role | Unlocking status |
|---|---|---|---|
| IT Fondo di Garanzia (direct and portfolio) | N | intermediary | `lic.it.tub106` or bank or confidi |
| IT regional guarantee sections (6 regions) | R | intermediary + applicant | `lic.it.tub106`; applicant `estab.it.<region>` |
| IT Nuova Sabatini | N | intermediary | bank or `lic.it.tub106` (leasing), verify |
| IT Smart&Start, startup tax relief | N | applicant / investor | `status.it.startup_innovativa` |
| IT PMI innovativa investor relief | N | investor | `status.it.pmi_innovativa` |
| DE Bürgschaftsbank, KfW on-lending | R / N | intermediary | `lic.de.kwg32_credit_institution` (Hausbank) |
| DE Länder programmes | R | applicant | `estab.de.<Land>` |
| FR Bpifrance guarantees | N / R | intermediary | `lic.fr.etablissement_credit` or `lic.fr.societe_financement` (verify) |
| FR JEI exemptions, IR-PME | N / L | applicant / investor | `status.fr.jei`, `status.fr.jei_r` |
| FR Prêt d'amorçage | N | applicant | `raise.in_progress` |
| EU InvestEU guarantee products | EU | intermediary | authorised lender under national law (per the call) |
| GBER-based grants (all) | all | applicant | `status.eu.sme_annex_i`; excludes `status.eu.undertaking_in_difficulty`; apply before start |

### 2.8 Economic geography (owner 3b, item 3)
A senior narrows by where the activity fits (e.g. robot deployment in Italy points to Lombardia,
Veneto, Piemonte, Emilia-Romagna, Toscana, plus Lazio for defence and the capital). To ground it:
- **S3 strategies**: the EC S3 Platform s3platform.jrc.ec.europa.eu ✓ (the "s3-mapping"/EYE@RIS3
  priorities per region, HTML; strategies are fixed per programming period, so load yearly); each
  region's S3 document, e.g. Lombardia (8 innovation ecosystems including advanced manufacturing;
  DGR XI/4155/2020) and Emilia-Romagna (8 specialisation areas including mechatronics and
  motoring) at fesr.regione.emilia-romagna.it/erdf/s3.
- **ERDF programme priorities and money**: Kohesio ✓ and cohesiondata ✓ (programme budgets by
  priority), OpenCoesione ✓ (IT projects).
- **Industrial profile**: Eurostat regional structural business statistics and the Regional
  Innovation Scoreboard (? not checked this session).
- Held: 0 S3 documents, 0 regional profiles. Load: D (S3 documents for the 6 IT regions, then BY,
  BW, NRW, AURA, IDF, HdF) and S (a `region_priorities` table: NUTS2, priority, sector tags,
  passage_id), so `find_instruments` can rank regions by fit, cited.

### 2.9 Political monitoring (owner 3b, item 4): feeds for the radar
| Level | Feed | Held? |
|---|---|---|
| EU | OEIL, EUR-Lex OJ/COM feeds, EP press, Council ST register (data.consilium), EIF/EIB/EIC news, gnews_investeu, ec_grow_ecf | held (41 sources) |
| DE federal | DIP API (Bundestag + Bundesrat Drucksachen, Vorgänge), BGBl (recht.bund.de, 167 docs), BMWE/BMF/BMFTR press, KfW press, hib | partly (8 signal sources + Regina's verbatim; **no DIP Vorgang tracking**) |
| DE Länder | Landtag documentation systems (Bayern, BW, NRW), Staatskanzlei/Wirtschaftsministerium press, Länder banks' news | **0** |
| FR national | JORF (DILA open data, daily), AN/Sénat dossiers législatifs (held), Bercy/DGE, Bpifrance press, SGPI France 2030 | partly (11) |
| FR Régions | Délibérations of the conseil régional / commission permanente, Région press, regional agencies (AURA Entreprises, HdF ID) | **0** |
| IT national | **Gazzetta Ufficiale** (serie generale), Normattiva updates, **MIMIT decreti and news**, MEF, **Senato/Camera open data** (dati.senato.it ✓, dati.camera.it ✓: bills, ddl Bilancio), Conferenza Stato-Regioni | **0** (only cdp_venture_news and gnews_it_funding) |
| IT regions | **Bollettini Ufficiali Regionali** (BURL Lombardia, BUR Veneto, BU Piemonte, BURERT, BURT Toscana, BUR Lazio), Giunta delibere and press, the finanziarie's news | **0** |
| Reform-specific watches | DE: the non-bank guarantee reform (DIP); FR: PLF/PLFSS (CIR, JEI, IR-PME); IT: FdG 2027 decree, Legge annuale PMI 2026, the startup circulars; EU: ECF/InvestEU | to set up as `save_watch` items |

---

## 3. Ranked loads, grouped into batches

**Scoring.** Cells unlocked (matrix cells plus cross-cutting rows) x the owner's four cases (F =
fintech guarantees DE/FR/IT/EU; E = edtech for young kids: raising + R&D + tax credits + export;
T = trust-AI startup, EUR 2M; V = travel scale-up vs Google). Owner 3b: **Italy goes first**,
because F and the robot-deployment example both need it.

| Rank | Batch | Cells unlocked | Cases | Why this order |
|---|---|---|---|---|
| 1 | **B1 Italy deep slice (N + 6 regions + status layer)** | IT guarantees N/R/L, matchmaking, loans R, tax, grants R; rows A, B, C, D for IT | F, E, T (+ robots) | Owner's explicit first slice; builds the status-rule table every later batch reuses |
| 2 | **B2 EU intermediary layer + EU law core** | EU guarantees, matchmaking, equity; GBER/de minimis for **every** cell; row B (EU) | F, T, E | The quickest door for a multi-country lender; GBER feeds all 36 national cells |
| 3 | **B3 France: lender law + tax + amorçage** | FR guarantees N/R, matchmaking N/R/L, tax N/L, advances | F, E, T | Two fully missing FR columns; CIR/JEI decides E and T |
| 4 | **B4 Germany: KWG/reform watch + FZulG + KfW/ERP + Länder** | DE guarantees, matchmaking, loans, tax, equity, R grants; row D (DE) | F, E, T | Mostly P to H upgrades; the reform watch is the §4d route |
| 5 | **B5 Radar feeds + `read_agenda`** | row D everywhere | all 4 (V mostly through Regina) | Cheap; feeds §3b and §4b; needs B1-B4's watch list |

People and institutions (row E: Whoiswho, Transparency Register, org pages) are master-plan Phase 2
**stream 1** and are being built separately. Each batch below adds only the *org-page sources* for
its institutions, so the people loader has its seed URLs.

### B1. Italy deep slice: national + Lombardia, Veneto, Piemonte, Emilia-Romagna, Toscana, Lazio
- **Ground (D, about 45 docs):** TUB arts. 106, 107, 112 (Normattiva); Banca d'Italia supervisory
  provisions for intermediaries; L. 662/96 art. 2 c. 100; the **current** FdG Disposizioni operative
  (replacing the 2018 copy) and the portfolio-guarantee DM; the 2027 FdG reform draft; Legge annuale
  PMI 2026 (confidi/106); DL 179/2012 arts. 25-32 as amended by L. 193/2024 plus the MIMIT circolare
  of 29 Jul 2025; DL 3/2015 art. 4; L. 160/2019 c. 198-209 plus L. 199/2025 (budget 2026); Nuova
  Sabatini rules; Smart&Start's current DM; the six S3 documents and six PR FESR programmes.
- **Load (S):** about 40-60 instruments (FdG sections incl. portfolio; Sabatini; Smart&Start
  refresh; credito R&S; startup and PMI investor reliefs; each finanziaria's guarantee, loan and
  equity products; CCIAA vouchers for the six regions); the **albo 106 register** (about 200-250
  firms; intermediary precedents and peers); **RNA awards** for the six regions plus MCC
  intermediary-side rows; the startup registry (status lookup); `instrument_status_rules` (about
  60 IT rows); `region_priorities` for the six regions.
- **Tools that read it:** `find_instruments` (+ status match + region fit), `fund_requirements`,
  `find_precedents(institution=MCC | finanziaria)`, a new `status_check(profile, country)`.
- **Eval that should improve:** `fintech_guarantees` (IT leg: 106 as a sequenced step, FdG
  portfolio route, cited); a robot-deployment-in-Italy scenario (regions plus Sabatini); edtech
  (startup innovativa, credito R&S). Bar: zero `research` calls on the Italian deal-breakers.
- **Refresh:** statutes monthly (sha256 diff), registers weekly, RNA monthly.

### B2. EU intermediary layer and EU law core
- **Ground (D, about 20):** GBER consolidated plus the 2023 amendment; de minimis 2023/2831; SME
  Recommendation 2003/361; InvestEU Reg. 2021/523 plus the 2025 amendment; the EIF open call and
  six product sheets; COM(2025) 555 (ECF) plus the Council's 16 Jun 2026 position plus the EP
  report; Horizon Europe 2021/695 and Digital Europe 2021/694 core articles; the EIC 2026 work
  programme.
- **Load (S):** EIF visibility reports (debt FIs, sub-FIs, equity FIs; about 1-3k rows) as
  `capital.intermediary_agreements` (institution, intermediary, country, product, amount, date,
  source); InvestEU guarantee products as instruments with intermediary status rules; Digital
  Europe open calls.
- **Tools:** `find_precedents(institution="EIF")` stops returning 0; `fund_requirements` cites GBER
  Art. 6 and 22.
- **Eval:** `fintech_guarantees` (EU leg: name the matching product, cite a precedent
  intermediary); trust-AI EUR 2M (EIC Accelerator, de minimis). **Refresh:** visibility reports
  half-yearly, EIF press weekly (already a signal), the ECF file weekly through OEIL.

### B3. France: lender law, tax credits, amorçage, three Régions
- **Ground (D, about 30):** CMF L.511-1/-5/-6, L.515-1 A (DILA LEGI); Bpifrance guarantee CG and
  product sheets (browser fetch); CGI 244 quater B, 44 sexies-0 A, 199 terdecies-0 A plus the BOFIP
  chapters; LFI 2026 articles on CIR/CICo/JEI/IR-PME; Bpifrance amorçage and innovation-aid sheets;
  S3 and FEDER programmes for AURA, IDF, HdF.
- **Load (S):** about 30 instruments (guarantees, amorçage, French Tech Seed, Bourse French Tech,
  CIR, CII, JEI, IR-PME, regional guarantee and advance funds for the three Régions); status rules;
  link the 5,819 advance awards to products.
- **Eval:** `fintech_guarantees` (FR leg moves from "research and cite" to cited); edtech
  (CIR/CII/JEI plus amorçage matched to the raise). **Refresh:** CGI yearly (after the LFI, in
  January), Bpifrance quarterly.

### B4. Germany: KWG and the reform watch, FZulG, KfW/ERP, three Länder
- **Ground (D, about 35):** KWG §§1, 2, 32; KAGB §§29a ff. (FRiG); FZulG plus BMF-Schreiben; KfW
  Merkblätter (StartGeld 067, 365/366, 380); the VDB Rückbürgschaft framework; KfW Capital/VTGF
  terms; S3 and EFRE programmes for BY, BW, NRW; **the DIP Vorgang for the non-bank guarantee
  reform** (to identify first).
- **Load (S):** 17 Bürgschaftsbank instruments; ERP and Zukunftsfonds modules; NRW.SeedCon,
  L-Bank, LfA, IBB products; collapse the Forschungszulage duplicates; **Förderkatalog** federal
  grants for precedents; status rules (Hausbank = KWG licence).
- **Eval:** `fintech_guarantees` (DE: "no route today; the reform is the route; here is the bill
  and the BMWE unit"); edtech and trust-AI (Forschungszulage, EXIST/HTGF). **Refresh:** KWG and
  FZulG monthly, the DIP Vorgang daily (watch), KfW on each Merkblatt change.

### B5. Radar feeds and the `read_agenda` tool
- **Load:** IT GU, MIMIT, Senato/Camera open data and the six BURs; FR JORF (DILA) and Région
  deliberations for 3 Régions; DE DIP Vorgänge and 3 Landtage; then the `read_agenda(institution |
  region)` tool over the 19,963 existing articles plus these.
- **Eval:** a §3b/§4b check: "what changed for route X since the last run". **Refresh:** daily
  feeds.

**Measure each batch the same way:** before and after, run the case(s) named, count `research`
calls on deal-breakers, count `[cN]` citations from the store, and record the matrix cells that
moved (update §1).

---

## 4. What we deliberately do NOT load, and why
- **Company registers** (Handelsregister, Registro imprese in full, Infogreffe/RCS) and credit
  bureaus: licensed, personal data, and not needed. The startup registry is loaded only as a
  *status lookup*.
- **Private deal databases** (Dealroom, Crunchbase, PitchBook): licensing (DD item left open by
  decision). Precedents come from official award and intermediary lists only.
- **Every municipal programme in Germany** (thousands in the Förderdatenbank): we load the Länder
  and the big-city schemes that a case names, not the long tail. The local level is mostly "–" in
  DE.
- **Household and consumer schemes** (housing, energy-renovation for private persons, consumer
  credit): not public money for startups or scale-ups.
- **COVID/TCTF emergency schemes and expired GBER regimes**: precedent value only, already
  excluded by the Sprint 15 rule.
- **Full EUR-Lex or Normattiva/Légifrance mirrors**: only the articles named in a cell. A statute
  we cannot point to a decision with is noise.
- **Export-credit agencies** (SACE/SIMEST, Euler Hermes, Bpifrance Assurance Export): not one of
  the six money types here; they stay master-plan stream 6 (the edtech case needs them, so
  SIMEST and Business France are listed for that stream).
- **People data beyond public roles**: names enter only through the actors stream, for public-role
  officials (decision 8).
- **Scraping bot-blocked sites head-on**: Légifrance goes through DILA/PISTE; Bpifrance through a
  browser-UA fetch or its creation and assurance-export sites. No workaround that breaks terms.

## Open items flagged by this map
- **DE reform**: the bill the owner refers to (non-bank access to guarantees) is not identified
  yet. FRiG is enacted and is not that bill. Search DIP and ask the owner.
- **Stale grounding**: the FdG Disposizioni operative we hold (2018) is superseded. Replace it in
  B1 and mark the old version as not current (insert-only; do not delete).
- **Facts marked "verify"** (FR CII rate, JEI-R/IR-PME after LFI 2026, IT c. 200 for 2026, the FdG
  plafond, Sabatini lenders, the INVEST status, InvestEU intermediary wording) must be cited from
  the official text at load time before Wincent asserts them.
