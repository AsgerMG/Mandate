# Bench run: robotics_deployment_it (2026-11-11)

Case: `mandate/eval/scenarios/robotics_deployment_it.yaml`. Main at e8dc2cb3: production holds
the Italy deciding core (capital.status_rules, status_keys, region_priorities; 16 grounded
Italian texts) and the new tools (match_status, find_instruments level/region, read_agenda).
Run inside Claude Code on the bench: no Anthropic API call, production read-only through
`web/scripts/brain_tool.ts`. Profile: `2026-11-11_robotics_deployment_it.profile.json`.
Ledger: `2026-11-11_robotics_deployment_it.ledger.json` (c1 to c42). `--ground` was NOT used:
neither MANDATE_API_URL + MANDATE_SERVICE_TOKEN nor BENCH_GROUNDING_WRITE_URL is set in this
checkout, so web sources stay [wN] and nothing was written to grounding. Only the usage log
recorded the calls (local `web/.bench/tool_calls.jsonl`).

The scenario's `must` and `must_not` were NOT read before the answer below was written.
They were read afterwards, for the self-score at the end.

## The case

> We deploy industrial robots in SME factories on a robots-as-a-service model: we buy the
> robots, place them with the customer and finance them over 3-5 years. We are expanding
> into Italy. We are thinking of setting up an Italian company and either registering it as
> a startup innovativa or getting Art. 106 status so we can finance our customers ourselves.
> Which public money fits, and where in Italy?

## Turn 1: Wincent asks first

The intent is clear (finance robots for Italian SMEs) but the structure is not, and in Italy
the structure decides which door opens. Wincent asked, and stopped:

1. **Legal form and seat of the group today, and its age?** Start-up innovativa has an age
   cap and an SME test that counts the whole group; the answer may rule it out.
2. **Headcount and turnover of the group?** SME status decides the Fondo di Garanzia and
   every regional measure.
3. **Any Italian entity or local unit yet?** Almost every Italian door needs an Italian
   registered office or operating site.
4. **Where are the first customers (regions)?** Regional money follows the customer's site.
5. **How much do you want to finance, over what horizon?** Sets whether a supervised
   financing company is worth its cost.
6. **Is the contract an operating rental or a financial lease?** Decides whether Art. 106
   is needed at all, and which customer incentives apply.

## Turn 1: founder's answers (scenario `founder_followup`)

> We are a German GmbH, 6 years old, about 120 staff, EUR 18M revenue. No Italian entity yet;
> first customers are in Lombardia and Emilia-Romagna. We would want to finance about EUR 30M
> of robots for Italian customers over three years.

(Question 6 was not answered; treated as open below.)

## Tool calls (one line each)

1. `match_status` {estab.it, sme; activity robot deployment; IT}: Nuova Sabatini open to SME customers (c2); FdG direct guarantee open to an SME with an Italian site (c1); S3 fit: Lombardia, Emilia-Romagna, Piemonte, Veneto, Toscana score 4, Lazio 1 (c4 to c9).
2. `match_status` {art106, startup_innovativa, pmi_innovativa, leasing; Lombardia}: what each status opens and how it is obtained, all cited (c10 to c35): 106 opens FdG direct and portfolio guarantee as lender, Sabatini as leasing intermediary; start-up innovativa gives FdG priority and investor relief; Smart&Start rule returned UNCITED.
3. `find_instruments` {IT, Lombardia}: screen failed: scenario profile uses `industrials_manufacturing`, vocabulary has `industrial_manufacturing`. Fixed in the profile.
4. `find_instruments` again: screen failed: subsectors `robotics`, `automation` not in vocabulary; set `robotics_automation`.
5. `find_instruments` {IT}: 0 rows (the screen drops Italian rows: no Italian entity yet).
6. `find_instruments` {name_query Sabatini}: no Sabatini instrument in the corpus; German rows returned instead.
7. `find_instruments` {IT, region Emilia-Romagna}: 0.
8. `find_instruments` (planning view: profile copy with the planned Italian entity added, scratch only) {IT}: one row, Investimenti sostenibili 4.0 (Sud only). Not relevant to Lombardia / Emilia-Romagna.
9. `find_instruments` (planning view) {region Lombardia}: objective read as guarantee; FdG rows only.
10. `find_instruments` (planning view) {grant, loan; Emilia-Romagna / Lombardia}: 0 and 0. The corpus holds no regional Italian investment measure for this case.
11. `find_precedents` {fondo_di_garanzia, robot leasing}: no FdG award records; Mediocredito Centrale awards to unrelated SMEs (register records). Situation matching did not discriminate (similarity 0.5 flat).
12. `find_precedents` {Mediocredito Centrale, robotics}: same list. No precedent.
13. `assess_instrument` eu_investeu_intermediary: leasing companies named as eligible intermediaries (c38), deadline 30 June 2027 (c36), c36 to c42.
14. `read_agenda` {Lombardia; robotics, Sabatini, iperammortamento}: nothing.
15. `read_agenda` {Italy incentives 2026}: nothing.
16. `search_law` (Regina) {operating rental vs financial lease under 106}: no passages.
17. Web: 8 sources used (w1 to w8 below).

## Wincent's answer

### 1. Answer

Set up an Italian srl now and run the robots-as-a-service business through it as an operating
rental; that needs no licence and lets your customers in Lombardia and Emilia-Romagna use
their own incentives. In parallel, start Art. 106 TUB authorisation for a separate Italian
financing company: it is the status that lets you finance customers yourself with the State
guarantee behind your book, and it takes up to 180 days and EUR 2M of capital [w3], so it is
a plan step this quarter, not a reason to wait. Do not build the plan on start-up innovativa:
a 120-person group's subsidiary gains little from it and the 106 company cannot hold it.
Lead the public money from the customer side (Nuova Sabatini, the 2026 iperammortamento,
Lombardia's investment measure), fund the fleet with bank debt under the Fondo di Garanzia,
and take the EIF route once the 106 company has a book. Lombardia and Emilia-Romagna first,
because your customers are there and both regions name your field in their strategies.

### 2. Where you stand

**Structure.** German GmbH, no Italian entity. The Fondo di Garanzia's beneficiary must have a
registered office or operating site in Italy [c1]; an Art. 106 intermediary needs its
registered office and head office in Italy [c25]. So every Italian door starts with an
Italian company (judgement: an srl with a sede operativa in Lombardia, a local unit in
Emilia-Romagna when the customer count justifies it).

**SME status.** 120 staff and EUR 18M revenue at group level put you inside the EU SME
definition the Italian rules use [c3] (judgement on the figures; the test counts linked
enterprises, so the German parent is in it, and the balance sheet total is not known).

**Art. 106 (financing arm).** What it opens, all cited:
- The Fondo's direct guarantee is given to the lender, and an Art. 106 intermediary is a
  lender ("soggetto finanziatore") [c13] [c14] [c15]: your own loans and leases to Italian
  SMEs can carry the State guarantee.
- The portfolio guarantee on a whole book is open to the same lenders, after accreditation
  [c16] [c17]. The cover rules are being reformed; check before quoting percentages (rule note).
- An intermediary authorised for financial leasing can grant Nuova Sabatini operations [c18],
  if it signs the MIMIT convention [w1]. That is the strongest single argument for 106: your
  customers get the Sabatini contribution on a lease you write yourself.
- What it costs: authorisation by Banca d'Italia and entry in its register [c24]; Italian
  seat [c25]; paid-up capital not below the Banca d'Italia minimum [c26], which is EUR 2M for
  a lender that issues no guarantees [w3]; a corporate object limited to 106 activities [c27];
  a decision term of 180 days for a newly formed company [w3]. Banca d'Italia consulted on
  changes to the 106 rules on 30 September 2026 (unverified; seen in search results, not read).
- The object restriction [c27] means the 106 company cannot also run the robot operations
  (judgement): two Italian companies, one operating, one financing.

**Do you need 106 at all?** Lending "in any form" to the public is reserved to authorised
intermediaries [c24], and the ministerial definition lists financial leasing first [w4]. An
operating rental (you own the robot, the customer pays for use and service) is not in that
list [w4]; whether your RaaS contract falls outside the reservation is unverified. Confirm
with Italian banking counsel on the actual contract before you sign the first customer.

**Start-up innovativa.** A new Italian company can meet the age (at most 60 months [c29]) and
residence tests [c30], and must self-certify and register in the special section to get any
benefit [c20] [c32]. What it would give you: priority in the Fondo's review [c12]; investor
tax relief, which does not apply to stakes over 25% (match_status rule statement on [c22]
[c23]), so not to a wholly owned subsidiary; Smart&Start, whose rule the layer could not cite
(unverified). The innovation tests of art. 25 were not returned by the tools (unverified).
Judgement: low value for you, and the 106 company cannot hold it given its limited object.

**Customer side (this is where most of the money is).**
- Nuova Sabatini: SMEs buying or leasing new machinery [c2] [w1]; financing from EUR 20,000 to
  EUR 4M per company, contribution 3.575% for 4.0 investments, granted through banks and
  intermediaries that adhere to the convention [w1]; refinanced with EUR 650M for 2026-2027 by
  the 2026 budget law, and the rules are being adjusted by a decree still being finalised [w1].
- Iperammortamento: the 2026 budget law (L. 199/2025, art. 1, c. 427-436) raises the
  depreciation base for capital goods invested from 1.1.2026 to 30.9.2028, and the uplift also
  reaches financial-lease payments; implementing decree published 11.6.2026 [w2]. Whether a
  customer on an operating rental gets it is unverified; it likely sits with the owner of the
  robot (judgement), which would be your Italian srl.
- Product consequence (judgement): offer two contracts, RaaS for customers who want service,
  and a Sabatini-eligible financial lease (through a partner leasing company now, your own 106
  company later) for customers who want the incentives.

**Lombardia.** S3 names "Manifattura avanzata" [c5]. Misura investimenti, Linea Sviluppo
Aziendale: SMEs and MidCaps with an operating site in Lombardia, machinery and digital
investments of EUR 100,000 to 3M, a 5-30% grant plus a free regional guarantee on the loan,
first come first served, open until funds run out [w7]. A customer measure; your srl could use
it only for its own productive investment (judgement).

**Emilia-Romagna.** S3 names "meccatronica e motoristica" [c7]. The region's investment-
attraction call admits companies "not yet active in Emilia-Romagna that intend to invest" [w8];
its 2026 window closed on 31 March 2026 [w8]. A route for your own establishment at the next
window. No open 2026 SME machinery measure found (unverified; aggregator search only).

**Other regions.** Piemonte, Veneto and Toscana name advanced or smart manufacturing in their
S3 [c4] [c6] [c8]: next markets. Lazio's S3 matches only on security [c9]: only if you sell to
defence (judgement).

**EU.** InvestEU guarantees through the EIF name leasing companies among eligible
intermediaries [c38], with applications open to 30 June 2027 [c36]. The EIF already guarantees
equipment leasing for SMEs in Italy (BNP Paribas Leasing Solutions, up to EUR 200M across four
countries [w5]) and runs an Innovation and Digitalisation guarantee with Italian lenders [w6].
Open to your 106 company once it has a track record (judgement); not to the operating srl.

### 3. Flags

1. **No Italian entity (high).** Blocks every Italian door [c1] [c25]. Fix: incorporate the srl
   this month.
2. **Contract form unclear (high).** If RaaS is legally a financial lease, writing it without
   106 breaches the reservation [c24] [w4]. Fix: counsel opinion on the contract before the
   first Italian customer.
3. **106 cost and time (medium).** EUR 2M paid-in capital, up to 180 days [w3], a separate
   company [c27], ongoing Banca d'Italia supervision. Fix: start now, sized to the EUR 30M plan.
4. **Fleet funding (medium).** EUR 30M of robots on your balance sheet. Fix: bank debt for the
   srl under the Fondo's direct guarantee [c1] (per-company caps and sector exclusions not
   checked: unverified), then EIF once the 106 company exists.
5. **Corpus gap (low for you, high for us).** No Italian regional investment measure, no
   Sabatini row and no robot-leasing precedent in Wincent's corpus; regional facts here are web.

### 4. Decisions

- **106 company: yes, start now** (recommended, confidence medium). It turns the State guarantee
  and Sabatini into your own sales tools [c13] [c16] [c18]. Alternative: partner leasing
  companies only; cheaper, but you give away the customer financing margin and control.
- **Start-up innovativa: no** (recommended, confidence medium). Little gain [c12] [c22], cannot
  sit in the 106 company [c27].
- **RaaS contract form:** keep RaaS as operating rental in the srl, add a financial-lease
  offer (recommended), pending the counsel opinion.
- **First region for the srl's seat: Lombardia** (recommended), with Emilia-Romagna as the
  second site and the attraction call's next window as the trigger.

### 5. Actions and drafts

1. Italian banking counsel: opinion on RaaS vs financial lease under 106 (this week).
2. Banca d'Italia, Vigilanza intermediari finanziari (P2, public-capital side): pre-filing
   meeting on the 106 project (this month; contact not verified, use the institutional channel).
3. Mediocredito Centrale, head of the Fondo di Garanzia (P1, public-capital side): probe on
   the srl's fleet loans now and the portfolio guarantee once the 106 company exists.
4. Regione Lombardia, DG Sviluppo Economico, head of the access-to-credit unit (P1, political
   and capital): alignment meeting; draft below.
5. Emilia-Romagna, regional economic-development department and its attraction desk (P2,
   political): ask for the next attraction window (unverified who runs the desk).
6. Two partner leasing companies already in the Sabatini convention [w1]: bridge offer for
   customers who want a financial lease (judgement).
7. EIF, SME guarantees (P2): low-effort probe once the 106 filing is in.

Draft (to Regione Lombardia, for the founder to send):

> Oggetto: Robotica collaborativa per le PMI manifatturiere lombarde, richiesta di incontro
>
> Gentile Direttore,
>
> [Società] è un'impresa tedesca di 120 persone che installa robot industriali nelle PMI
> manifatturiere con formula a canone, senza investimento iniziale per l'impresa. Stiamo
> costituendo una società italiana con sede in Lombardia, dove sono i nostri primi clienti,
> e prevediamo di finanziare circa 30 milioni di euro di robot in tre anni.
>
> Il nostro modello porta la manifattura avanzata, priorità della Strategia di
> specializzazione intelligente regionale, alle imprese che da sole non automatizzerebbero.
> Vorremmo un breve incontro per capire come allinearci alle misure regionali per gli
> investimenti delle PMI e alle priorità della Direzione.
>
> Con i migliori saluti,
> [Nome], [ruolo], [telefono]

### 6. Plan

- **This week:** counsel opinion on the contract; choose the srl's seat in Lombardia.
- **This month:** incorporate the srl; open bank talks for fleet loans under the Fondo's
  guarantee; send the Lombardia letter; sign one partner leasing company for Sabatini leases.
- **This quarter:** file the 106 application for a separate financing company (EUR 2M capital
  ready); meet Banca d'Italia first; first customers on RaaS and on partner leases.
- **Later (6 to 9 months):** 106 authorisation; join the Sabatini convention; accreditation for
  the Fondo's portfolio guarantee; EIF application before 30 June 2027 [c36].
- **Parallel:** Lombardia and Emilia-Romagna. **Parked:** start-up innovativa; Piemonte,
  Veneto, Toscana until the first two regions work; Lazio unless defence.

### 7. Watches

- Fondo di Garanzia portfolio and cover reform (rule note on [c16]).
- Nuova Sabatini implementing decree "in fase di finalizzazione" and sportello status [w1].
- Iperammortamento: rules on rental and lease, and the made-in-EU clause (sources disagree;
  unverified) [w2].
- Banca d'Italia consultation on the 106 rules (unverified).
- Lombardia Linea Sviluppo Aziendale funds running out [w7].
- Emilia-Romagna attraction call, next window [w8].
- InvestEU deadline 30 June 2027 [c36] and its move under the European Competitiveness Fund
  (unverified here).
- Start-up innovativa (parked), Smart&Start rule uncited.

### 8. Precedents

- **Fondo di Garanzia for a robot-leasing company:** none found (corpus holds no FdG awards;
  Mediocredito Centrale register records are unrelated SMEs).
- **Nuova Sabatini via a captive leasing company:** none found.
- **EIF guarantee on SME equipment leasing in Italy:** BNP Paribas Leasing Solutions, up to
  EUR 200M, FR, DE, IT, ES, 19 May 2025 [w5]; illimity Bank, Innovation and Digitalisation
  guarantee EUR 25M, 2023 [w6].
- **Regional:** none found.

### 9. Sources

Grounding (ledger), sha256 first 12:
- c1, c10 to c15: Fondo di Garanzia, Disposizioni operative 2023 (urn:mandate:capital), 10198c227b8c
- c2, c3, c18, c19, c35: DL 69/2013 art. 2 (Nuova Sabatini), normattiva, e4993c050802
- c4 Piemonte S3, regione.piemonte.it, deef31219ada; c5 Lombardia S3, 4cc011a6c9e6; c6 Veneto
  S3, cafa394bcbcd; c7 Emilia-Romagna S3, 19a5ef72941b; c8 Toscana S3, 949291ad3b90; c9 Lazio
  S3, 4f7350807804
- c16, c17: Fondo, modalità operative portafogli (circ. 6/2018), fondidigaranzia.it, 68016c68454e
- c20, c28 to c32: DL 179/2012 art. 25, normattiva, 7d3024a3f8bf
- c21, c33, c34: DL 3/2015 art. 4, normattiva, fc930c03915d
- c22, c23: DL 179/2012 art. 29, normattiva, 37240793f8e8
- c24: TUB art. 106, normattiva, f7dfd42ca0f5; c25 to c27: TUB art. 107, c144a0b23168
- c36 to c39: EIF InvestEU guarantee products page, d3142570c7e7; c40 to c42: InvestEU
  Regulation 2021/523, c16cf34dfb63

Web (retrieved 2026-11-11):
- w1 MIMIT, Nuova Sabatini: https://www.mimit.gov.it/it/incentivi/agevolazioni-per-gli-investimenti-delle-pmi-in-beni-strumentali-nuova-sabatini
  "di importo compreso tra 20.000 euro e 4 milioni di euro"; "3,575% per gli investimenti 4.0";
  "concessione da parte di banche e intermediari finanziari, aderenti all'Addendum alla
  convenzione"; "La Legge di Bilancio 2026 ha rifinanziato la Nuova Sabatini con 650 milioni di
  euro per il periodo 2026 e 2027."
- w2 Assolombarda, Nuovo iperammortamento (industry association, not the statute):
  https://www.assolombarda.it/servizi/fisco/guida-agevolazioni-fiscali/sezioni/transizione-5.0/iperammortamento
  "introdotto dalla Legge di bilancio 2026 (L. 199/2025, art. 1, commi 427 - 436)"; "gli
  investimenti in beni strumentali effettuati dall'1.1.2026 al 30.9.2028"; canoni di locazione
  finanziaria (paraphrase from the fetch).
- w3 Banca d'Italia, Circolare 288/2015 (copy on dirittobancario.it):
  https://www.dirittobancario.it/sites/default/files/allegati/circolare_banca_ditalia_3_aprile_2015_n._288.pdf
  "il capitale iniziale versato è almeno pari a 2 milioni di euro per gli intermediari
  finanziari che esercitino l'attività di concessione di finanziamenti senza rilasciare
  garanzie"; "per società di nuova costituzione ovvero di società già esistenti (termine: 180
  giorni)". 2015 text; check the consolidated version on bancaditalia.it.
- w4 DM 53/2015 art. 2, normattiva:
  https://www.normattiva.it/uri-res/N2Ls?urn:nir:ministero.economia.e.finanze:decreto:2015-04-02;53~art2
  "Per attività di concessione di finanziamenti sotto qualsiasi forma si intende la
  concessione di crediti,"; "a) locazione finanziaria;"
- w5 EIF press release, 19 May 2025:
  https://www.eif.org/press/all/european-investment-fund-and-bnp-paribas-leasing-solutions-sign-landmark-eur200-million-investeu-guarantee-for-smes-and-small-mid-caps-in-france-germany-italy-and-spain
  "to provide a portfolio guarantee of up to €200 million"; "France, Germany, Italy, and Spain."
- w6 EIF press release, 15 June 2023:
  https://www.eif.org/press/all/investeu-eif-provides-eur-50-million-to-illimity-bank-to-promote-italian-smes-green-and-digital-transition
  "two guarantees totalling €50 million"
- w7 Regione Lombardia, Portfolio misure DG SVE ver 9, 17 Sep 2026:
  https://www.regione.lombardia.it/content/dam/rl/canali-tematici-servizi/11-attivita-produttive-imprese/red-tutte-le-misure-dedicate-alle-imprese/allegati/2026.09.17%20Portfolio%20misure%20DG%20SVE%20ver%209.pdf
  "PMI e MidCap con sede operativa in Lombardia"; "di importo minimo pari a €100 mila e
  massimo pari a €3 mln"; "contributo a fondo perduto (tra 5% e il 30%) in conto capitale
  sull'investimento e di una garanzia regionale gratuita"; "Bando riaperto dalla data del 7
  febbraio 2024 fino ad esaurimento risorse."
- w8 Regione Emilia-Romagna, Attrazione investimenti 2025:
  https://fesr.regione.emilia-romagna.it/opportunita/opportunita-di-finanziamento/2025/attrazione-investimenti-in-emilia-romagna-accordi-regionali-di-insediamento-e-sviluppo-delle-imprese-anno-2025
  "non ancora attive in Emilia-Romagna, ma che intendono investire sul territorio regionale";
  "a partire dal 26 gennaio 2026 e fino alle ore 12.00 del 31 marzo 2026".

### 10. Questions for the founder

1. Is your RaaS contract an operating rental with service, or a lease with transfer of risk?
   Decides whether 106 is needed for the core business.
2. Can the group put EUR 2M of capital into an Italian financing company this quarter?
   Decides the 106 timeline.
3. Who funds the fleet today in Germany (banks, a facility, equity)? Decides whether Italian
   fleet loans under the Fondo, or a group facility, is cheaper.
4. Do you sell into defence or security? Decides whether Lazio matters.
5. Group balance sheet total and any shareholder over 25%? Confirms SME status.

## Claim provenance (count, written after the answer)

Factual claims in the answer, by label (each sentence-level claim counted once, per source):

| Label | Count | Note |
|---|---|---|
| Grounded `[cN]` | 27 | All Italian statute and Fondo rules, all S3 reads, EIF eligibility |
| Web `[wN]` | 16 | Sabatini current terms, iperammortamento, 106 capital and term, DM 53/2015, regional measures, EIF precedents |
| Judgement | 14 | Two-company structure, product design, region order, decisions |
| Unverified | 8 | RaaS outside the reservation, iperammortamento on rental, FdG caps, Smart&Start, art. 25 innovation tests, B.d'I consultation, ER open measures, ECF |

## Self-score (written after reading must / must_not)

Claude's own reading, not the owner's grade. The answer above was not edited after the
checkpoints were read; defects found on re-reading are listed here instead.

### must

| # | Checkpoint (short) | Result | Why |
|---|---|---|---|
| 1 | Structure first, held vs planned, ask only what is missing | met | Six questions, then stop; held (GmbH, no IT entity) vs planned (srl, 106, start-up) kept apart. |
| 2 | Status matched to doors per role, 106 into FdG direct + portfolio and Sabatini as lender/leasing, cited | met | c13 to c17 (Disposizioni operative, circ. 6/2018), c18 (DL 69/2013 art. 2). Missed: c19's condition that a non-leasing 106 lender's Sabatini loans need a convention bank's guarantee. |
| 3 | 106 as a sequenced plan step: B.d'I authorisation, Italian seat, capital, object limit (art. 107) | met | c24 to c27 plus EUR 2M and 180 days [w3]; filed this quarter. |
| 4 | Start-up innovativa checked against art. 25 criteria, flagged to verify | **partly** | Age c29, residence c30, registration c20/c32, SME at group level. But "can meet the age and residence tests" reads as an assertion; innovation tests only marked unverified; the "subsidiary of a 6-year-old group" question (SME counts linked enterprises; formation by transfer of a business branch) not raised as the fact to verify. |
| 5 | Nuova Sabatini as the customers' instrument, cited, a sales argument | met | c2, w1; product design built on it. |
| 6 | National, regional, LOCAL separately; lead with the open level | **partly** | National and regional worked; **local level (Camere di commercio vouchers) missing** although a Bologna CCIAA call appeared in research. Lead: customer side national, then regional. |
| 7 | Economic geography, each region grounded in its own S3 | met | Lombardia, Emilia-Romagna first; Piemonte, Veneto, Toscana; Lazio only on security/defence; c4 to c9. |
| 8 | Current political read: FdG transition to 31 Dec 2026 and 2027 reform, Sabatini refinancing, regional giunte | **partly** | Sabatini refinancing and pending decree [w1], iperammortamento [w2]; FdG reform only as a rule note, the transition date not stated; no regional giunta decision used (Lombardia DGR of 3 Aug 2026 was in the portfolio, not read). |
| 9 | Precedents or "none" | met | None in corpus said plainly; EIF leasing precedents from the web [w5] [w6]. No 106 intermediary already using the Fund named. |
| 10 | Italian rules cited or unverified; regional programmes researched and STORED | **partly** | All Italian rules cited or labelled. Regional programmes researched live but **not stored** (no `--ground` credentials in this checkout); w2 is an industry association, not the statute. |

Musts: 6 met, 4 partly, 0 missed.

### must_not

| # | Checkpoint | Violated? |
|---|---|---|
| 1 | Asserts start-up innovativa qualifies unchecked | no (checked, and recommended against), though see must 4 |
| 2 | Parks Italy or the financing arm for want of 106 | no |
| 3 | Lists every region/programme | no |
| 4 | Italy as one level, or skips local entirely | **yes, local skipped** |
| 5 | Uncited rule presented as cited | **borderline**: the 25% stake exclusion is cited to c22/c23, whose quotes do not say it (labelled as the rule statement, but the [cN] is next to it) |
| 6 | Generalises another country's rule | no |
| 7 | Recommends starting before applying where incentive effect requires it | no, but the sequencing warning is missing: Lombardia's measure (GBER) and Sabatini both need the application before the order; the answer should say so to the customers |

### Why the misses fail

- **Local level: method (execution).** §4e names "national, regional, local"; the answer did
  regional and stopped. The tools have no local layer (no Camere di commercio in
  `find_instruments` or `match_status`), so nothing prompted it: also a **data** gap.
- **Start-up innovativa nuance: method.** The status layer returns the criteria; the
  answer did not turn "subsidiary of a group" into the explicit question to verify.
- **Political read thin: data.** `read_agenda` returned nothing for Lombardia and for Italian
  incentives; the FdG transition date is not in the status layer's rule note.
- **Not stored in grounding: bench setup.** `--ground` needs credentials this checkout lacks.

### Bench notes (defects found)

- The scenario's `profile_hint` uses `industrials_manufacturing` and subsectors `robotics`,
  `automation`; the vocabulary has `industrial_manufacturing` and `robotics_automation`. The
  screen then fails and `find_instruments` returns nothing. Fixed in this run's profile; the
  scenario file should be fixed.
- `find_instruments` drops all Italian rows while the company has no Italian entity, so a
  company PLANNING an entity sees nothing. `match_status` handles planned statuses;
  `find_instruments` has no equivalent (a scratch planning profile was used).
- No Nuova Sabatini instrument and no Italian regional investment measure in the corpus;
  `find_precedents` `situation` did not change the ranking (similarity 0.5 flat).
- `match_status` returned the Smart&Start rule UNCITED (the grounded 2014 PDF has no text).

## Grade (owner)

```
grade:
must/must_not:
edits: |
playbook: |
```
