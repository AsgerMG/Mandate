# Bench run: fintech_guarantees, round 3 playbook (2026-11-10)

Case: `mandate/eval/scenarios/fintech_guarantees.yaml`. Playbook state: main at 4d7109a2
(owner interview round 3 applied to `mandate/playbooks/funding-routes.md`, incl. §4d).
Run inside Claude Code on the bench: no Anthropic API call, production read-only through
`web/scripts/brain_tool.ts`. Profile: `2026-11-10_fintech_guarantees_round3.profile.json`.
Ledger: `2026-11-10_fintech_guarantees_round3.ledger.json` (c1 to c23).

The scenario's `must`, `must_not` and `model_answer` were NOT read before the answer below
was written. They were read afterwards, for the self-score at the end.

## The case

> We are a fintech lender. We have raised EUR 40M. We want our SME loan portfolio
> guaranteed by public guarantee schemes in Germany, France and Italy, and at EU level.
> We do not have a banking licence. What are our routes?

## Turn 1: Wincent asks first

The ask names markets and an instrument type, but not the structure, and eligibility for a
portfolio guarantee is decided by structure (who is the lender of record, where it is
established, what it is authorised to do). So Wincent asked, and stopped:

1. **Legal form and where incorporated?** The intermediary gates are per entity and per
   country (Italy's register, for one, wants a local entity).
2. **Branches or subsidiaries in FR or IT?** Decides whether you can lend there at all,
   and whether a national scheme can see you.
3. **Licences or registrations of any kind** (banking, payment, investment firm, credit
   servicer, Italian 106, French société de financement)? This is the gate for every
   guarantee you named.
4. **Who is the lender of record on each loan, and how is the book funded?** A guarantee
   covers the entity that bears the credit risk; a fronting bank or a fund changes who signs.
5. **Size and ambition:** book today, target, horizon. Sets the guarantee cap you ask for.
6. **Are you raising now?** If yes, the order of moves changes.

## Turn 1: founder's answers (scenario `founder_followup`)

> We are a German GmbH with no branches yet in France or Italy. We hold no banking,
> payment or investment-firm licence. We originate SME loans through our platform and fund
> them from a EUR 150M warehouse facility; the book is EUR 120M today and we want to reach
> EUR 500M in three years. We are not raising equity right now.

## Tool calls (one line each)

1. `find_instruments` {guarantee for non-bank SME portfolio; EU, DE, FR, IT}: screen failed (missing gitignored `companies_index.json` in the worktree); symlinked it from the primary checkout and re-ran. Same rows: Fondo di Garanzia PMI (IT, several SA numbers), Bund/Länder Rückbürgschaften via Bürgschaftsbanken (DE). No FR row, no EU row.
2. `find_instruments` {name_query "InvestEU"}: `eu_investeu_intermediary` (InvestEU financial-intermediary architecture).
3. `find_instruments` {Bpifrance guarantee; FR}: nothing. Corpus has no French guarantee product.
4. `assess_instrument` eu_investeu_intermediary: status unknown; deciding question is intermediary type; c1 to c4 (EIF call page: deadline 30 June 2027; alternative lenders eligible; selection by EIF, then guarantee agreement).
5. `find_precedents` {instrument eu_investeu_intermediary}: none (no award records loaded).
6. `find_precedents` {institution European Investment Fund}: none in award records.
7. `assess_instrument` Fondo di garanzia PMI (SA.57625): assessed the company as BORROWER (one_blocker: entity in Italy; financial-sector exclusion c6). Wrong side of the deal for this case; gates also mix in an unrelated Invitalia scheme. Bench defect, noted below.
8. `fund_requirements` Fondo (focus: which lenders may request): borrower-side text only, uncited; nothing on Art. 106.
9. `find_precedents` Fondo: borrower awards (agrifood, pastry, sheet metal). Not precedents for a lender. Discarded.
10. `assess_instrument` Bund/Länder Rückbürgschaften (DE): again borrower-side gates (c7 to c11). Says nothing about which lenders may use it.
11. `application_route` eu_investeu_intermediary: curated, uncited: apply by email to the EIF under the call, ongoing until 30 June 2027.
12. `search_law` (Regina) {German opening of Förderkredite/Bürgschaften to non-banks}: nothing on point (PSD3 credit-by-payment-institution passages, c12 to c17).
13. `search_law` (Regina) {European Competitiveness Fund, InvestEU}: nothing on the ECF; old 2011 communication and STEP (c18 to c23).
14. `actors` (Regina) {German SME finance, BMWE}: no actors in corpus.
15. Web: 14 sources fetched (w1 to w14 below); German reform searched four ways, not identified.

## Wincent's answer

### 1. Answer

Go to the EU first. The EIF's InvestEU portfolio guarantees name alternative lenders as
eligible intermediaries [c3][w8], one agreement can cover a book spread across member
states (Froda's covers all 27 [w11]), and the call is open to 30 June 2027 [c1][w8]. That is
the quickest door for a lender working across several countries, so lead with it and skip
the national agencies for now (judgement). In Italy, get Art. 106 TUB status through an
Italian subsidiary: the Fondo di Garanzia's portfolio guarantee is requested by "soggetti
finanziatori", which include 106 intermediaries [w1], so the status is the unlock, and it is
a plan step, not a reason to park Italy. In Germany there is no route today without a
banking licence: KfW's risk relief goes to its pass-through partners, "Banken und
Sparkassen" [w3]. The route there is political: help the reform that would open it, through
the federal economy ministry (BMWE). France, researched: Bpifrance guarantees benefit only
the financial institution that lends [w4], and lending in France is reserved to credit
institutions and sociétés de financement [w5]; park France until a French status decision is
made. One question decides more than the rest: who is the lender of record today (see Flag 1).

### 2. Where they stand

- **EU (EIF, InvestEU).** Eligible type on paper: alternative lenders are named for
  guarantees [c3], and entities "established or operating" in a member state qualify [c2].
  Two products fit an SME book: SME Competitiveness, which covers higher-risk SME lending
  (category 1: SMEs the lender's offerings typically exclude; category 2: the riskiest part
  of the SME book) at under 80% guarantee rate, under 25% cap, 0.2% p.a. fee, up to EUR
  8.25M per loan [w8]; and Innovation and Digitalisation, for SMEs and small mid-caps taking
  up digital technologies [w9]. Process: expression of interest by email to the EIF under the
  call, EIF selection and due diligence, then a guarantee agreement [c4][w8]. The EIF may
  close early if budget runs out [w8]. Status: open, not yet applied.
- **Italy (Fondo di Garanzia per le PMI, MCC).** The Fondo's portfolio-guarantee rules
  define "Intermediari" as those on the Art. 106 TUB register, list them among "Soggetti
  finanziatori", and let soggetti finanziatori request the direct guarantee after
  accreditation [w1]. Final borrowers must be SMEs located in Italy [w1]. Art. 106 status
  needs an Italian company: "sede legale e direzione generale situate in Italia", at least
  EUR 2M paid-in capital (EUR 3M if it also issues guarantees), documents per Circolare
  288/2015 [w2]. The GmbH cannot hold it as is. Status: blocked today, unlockable.
  Note: the Fondo's exclusion of "attività finanziarie e assicurative" [c6] applies to the
  BORROWER, not to the lender; it is not a gate for you (judgement).
- **Germany (KfW, Bürgschaftsbanken, Bund counter-guarantees).** KfW grants its loans "über
  Finanzierungspartner (Banken und Sparkassen)" and releases them from 50% of the liability
  [w3]. The Bürgschaftsbank schemes and their Bund/Länder counter-guarantees are written
  for the borrower and run through the house bank [c7 to c11 are borrower gates; lender side
  not grounded here, unverified]. No door for a non-bank. Status: no route today.
  Political lever: the Deutschlandfonds plans up to EUR 8bn of guarantees in its industry
  and Mittelstand module and a securitisation line to relieve bank balance sheets for
  Mittelstand lending [w12]; both are written around banks today (judgement from the text).
  A reform that admits non-bank lenders: the owner's brief says one is moving in
  parliament; I could not identify the bill in four searches (unverified; confirm on
  dip.bundestag.de and with the BMWE unit, see Actions).
- **France (Bpifrance).** Bpifrance's guarantee "ne bénéficie qu'à l'établissement
  financier" and shares 40 to 70% of the loss with it [w4]. Habitual credit operations in
  France are reserved to "un établissement de crédit ou une société de financement" [w5].
  So the route needs either a French société de financement (ACPR authorisation; timeline and
  capital unverified) or a French lender of record. Status: parked pending a structure
  decision; not closed.

### 3. Flags

1. **Who is the lender of record? (high, decisive).** In Germany, granting money loans is
   "Kreditgeschäft", a banking business [w6], and doing it commercially needs written
   authorisation [w7]. A GmbH with no licence that originates SME loans is therefore almost
   certainly using a fronting bank, a fund, or a loan-purchase structure (judgement). The
   EIF signs with the entity that bears the credit risk on the loans, and Italy and France
   ask the same question. Fix: send me the origination chain (who signs the loan, who holds
   it, what the warehouse SPV buys); Regina to confirm the KWG position of that chain.
2. **No Italian entity (high, fixable).** Art. 106 requires an Italian registered office and
   head office [w2]. Fix: incorporate an Italian SpA or Srl, capitalise it at EUR 2M or more,
   file with the Banca d'Italia. Months, not weeks (unverified; ask Italian counsel for the
   current timeline under Circolare 288).
3. **No French status (high for France only).** L511-5 [w5]. Fix: a decision on a French
   société de financement versus a French partner lender; not before the EU route is signed.
4. **First-of-a-kind in Germany (medium).** No precedent of a non-bank on a German public
   guarantee (none found, corpus or web). Fix: argue the reform from the EU deal and the
   Italian authorisation once both exist.
5. **EU budget and rule change (medium).** Early closure of the call [w8]; InvestEU moving
   into the European Competitiveness Fund (see Watches). Fix: file the expression of
   interest this quarter.
6. **Bench note, not a company flag.** The corpus models these guarantees from the borrower
   side only; nothing in it says who may be the lender. Every lender-side gate here is web.

### 4. Decisions

1. **Lead with the EIF, not the national agencies.** Recommendation: yes. One counterparty,
   all three markets, alternative lenders named, open now [c3][w8]. Confidence: high on
   eligibility of the type, medium on fit until Flag 1 is answered.
2. **Which EIF product.** Recommendation: SME Competitiveness as the base (it is built for the
   riskier slice of an SME book [w8]); add Innovation and Digitalisation only for loans that
   finance digital uptake [w9] (judgement).
3. **Build an Italian 106 intermediary.** Recommendation: yes, sequenced after the EIF filing,
   because the Italian book will need a local lender of record anyway and the Fondo then
   opens directly [w1][w2]. Cost: EUR 2M+ capital, a local team, Bank of Italy supervision.
4. **Germany: lobby, do not engineer.** Recommendation: no partner-bank workaround as "the
   German route"; engage BMWE on the reform and the Deutschlandfonds design (judgement,
   owner practice).
5. **France: park.** Recommendation: decide on a société de financement only after the EIF
   agreement shows how much French volume it covers.

### 5. Actions and drafts

1. **EIF, InvestEU guarantees team** (EU, public-capital side, P1: head of the SME
   guarantee products; the call inbox is investeu_guarantees@eif.org per the EIF call
   pages, contact person unverified). Low-effort probe now, formal expression of interest
   with Annex I after Flag 1 is settled.
2. **BMWE, unit for Mittelstandsfinanzierung** (DE, political-administrative side, P1: head
   of the unit that owns Bürgschaftsbank counter-guarantees; the corpus row labels the Bund
   scheme "[BMWK, VIIC4]", a register record, name of the current unit unverified). Ask for
   a meeting on admitting non-bank SME lenders to federal guarantee and Deutschlandfonds
   instruments.
3. **Bundestag, economy committee rapporteur for Mittelstand finance** (DE, political, P2):
   after the ministry meeting, not before (judgement). Register in the German lobby register
   first if the contact counts as interest representation (unverified; check
   lobbyregister.bundestag.de rules).
4. **Italian counsel + Banca d'Italia pre-filing contact** (IT, regulatory, P2): scope the
   106 application.
5. **Regina:** (a) KWG status of the current origination chain; (b) whether a German
   non-bank may lend cross-border into France and Italy without local status; (c) identify
   the German reform bill.

**Draft 1: to the head of SME guarantees, InvestEU, European Investment Fund (English).**

> Subject: InvestEU SME Competitiveness guarantee: a pan-European alternative SME lender
>
> Dear [Name],
>
> [Company] is a German alternative lender financing small and medium-sized companies
> through its own platform. Our SME book stands at EUR 120M and we plan EUR 500M within
> three years, across Germany, Italy and France.
>
> Our lending reaches the companies your SME Competitiveness product is designed for:
> firms that banks' standard offerings tend to exclude. A portfolio guarantee would let us
> extend that lending across three member states under a single EU instrument, as the EIF
> has done for other alternative lenders operating across the Union.
>
> We would welcome a short call with your team to discuss fit and the expression of
> interest under the current call.
>
> Yours sincerely,
> [Name], [Title], [Company]

**Draft 2: to the head of unit, Mittelstandsfinanzierung, BMWE (German).**

> Betreff: Mittelstandsfinanzierung über Nichtbanken: Gesprächsbitte
>
> Sehr geehrte/r [Anrede, Name],
>
> [Unternehmen] ist ein deutscher Finanzierer des Mittelstands mit Sitz in [Stadt]. Wir
> haben bislang EUR 120 Mio. an mittelständische Unternehmen ausgereicht und wollen bis
> 2029 EUR 500 Mio. erreichen.
>
> Die Bundesprogramme zur Risikoentlastung erreichen den Mittelstand heute ausschließlich
> über Banken und Sparkassen. Gerade in einer Phase restriktiver Kreditvergabe könnten
> zugelassene Nichtbank-Finanzierer zusätzliche Reichweite schaffen. Wir würden gern
> darlegen, wie das im Rahmen der laufenden Überlegungen gelingen kann.
>
> Wir bitten um ein kurzes Gespräch mit Ihrem Referat.
>
> Mit freundlichen Grüßen
> [Name], [Funktion], [Unternehmen]

### 6. Plan

- **This week:** answer Flag 1 (origination chain). Send the EIF probe (Draft 1). Ask Regina
  for the KWG and cross-border reading.
- **This month:** prepare the EIF expression of interest (Annex I, loss history, credit
  policy, SME definitions, geographic split). Send Draft 2 to BMWE. Instruct Italian counsel.
- **This quarter:** file the EIF expression of interest; incorporate the Italian entity and
  file for 106; meet BMWE.
- **Later (6 to 12 months):** EIF agreement signed; Italian 106 authorisation, then Fondo
  accreditation and portfolio requests; decide France on the EIF numbers; keep the German
  reform conversation going with the EIF deal as proof.
- **In parallel:** EIF and Italy. **Parked:** France. **Political only:** Germany.

### 7. Watches

- EIF InvestEU call: deadline 30 June 2027, early closure on budget [c1][w8].
- InvestEU into the European Competitiveness Fund: the Council's partial position of
  16 June 2026 "aligns key features of the ECF's InvestEU instrument with the current
  InvestEU programme" [w10]; watch that alternative lenders stay eligible intermediaries.
- German reform admitting non-bank lenders (bill not identified, unverified).
- Deutschlandfonds Mittelstand guarantee module and securitisation line [w12]: watch
  whether non-bank originators are admitted.
- Fondo di Garanzia operating rules (the version fetched may not be current [w1]).
- Banca d'Italia 106 requirements, Circolare 288 [w2].
- France: L511-5 perimeter [w5]; Bpifrance guarantee conditions [w4].

### 8. Precedents

- **EU / EIF:** Froda, "a FinTech specialising in SME financing", EUR 150M of EIF-backed
  lending capacity under InvestEU, "across all 27 EU member states", February 2025 [w11].
  abcfinance, EIF loan guarantee of EUR 280M, July 2026 (secondary register record [w13];
  its regulatory status unverified). Corpus: none (no award records loaded for InvestEU).
- **Italy / Fondo:** Credimi's SME loan "è assistito dalla garanzia del Fondo di Garanzia per
  le PMI" (2021) [w14]; Credimi's 106 status not stated in that source (unverified).
- **Germany:** none found for a non-bank lender. That is information: a first-of-a-kind ask.
- **France:** none found.

### 9. Sources

Grounding (ledger `2026-11-10_fintech_guarantees_round3.ledger.json`):
- [c1] EIF InvestEU guarantee products page, `urn:mandate:capital:raw/instrument_docs/eif_investeu_guarantee_products.html`, d3142570c7e7: "Deadline for applications: 30 June 2027".
- [c2] same, d3142570c7e7: "established or operating in EU Member States ...".
- [c3] same, d3142570c7e7: "For guarantees: credit or financial institutions, alternative lenders, leasing companies."
- [c4] same, d3142570c7e7: application, EIF selection, guarantee agreement.
- [c6] MIMIT Fondo di Garanzia page, https://www.mimit.gov.it/it/incentivi/fondo-di-garanzia-per-le-pmi, dda41615e4a6: "con la sola esclusione delle attività finanziarie e assicurative".
- [c7] to [c11] Bürgschaftsbank / staatliche Rückbürgschaften page (ermoeglicher.de), a9adcbf8cdcf: borrower-side gates.
- c5, c12 to c23 were returned but not relied on.

Web (retrieved 2026-11-10):
- [w1] https://www.fondidigaranzia.it/wp-content/uploads/2019/12/Modalità-operative-portafogli-20121218.pdf : "“Intermediari”: gli intermediari finanziari iscritti nell’albo di cui all’articolo 106 del TUB"; "“Soggetti finanziatori”: le banche, gli intermediari, le imprese di assicurazione e i gestori"; "Possono richiedere la garanzia del Fondo, previo accreditamento: a) i soggetti finanziatori, in caso di garanzia diretta"; "“Soggetti beneficiari finali”: le PMI ... ubicati ... sul territorio italiano". Version date uncertain (file uploaded 2019).
- [w2] https://www.bancaditalia.it/compiti/vigilanza/accesso-mercato/intermediari-finanziari/index.html : "sede legale e direzione generale situate in Italia"; "€ 2 milioni per gli intermediari che non rilasciano garanzie"; Circolare 288/2015.
- [w3] KfW Merkblatt 366, Stand 01.09.2026, https://www.kfw.de/PDF/Download-Center/F%C3%B6rderprogramme-(Inlandsf%C3%B6rderung)/PDF-Dokumente/6000004843_M_366.pdf : "Die KfW gewährt Kredite aus diesem Programm über Finanzierungspartner (Banken und Sparkassen)."; "Die KfW stellt den Finanzierungspartner zu 50 Prozent von der Haftung frei."
- [w4] Banque de France, Fiche 504 "Les garanties Bpifrance" (05/2022), https://www.banque-france.fr/system/files/2024-04/823415-Fiche-504.pdf : "Cette garantie ne bénéficie qu’à l’établissement financier"; "de 40 à 70 % selon les opérations couvertes".
- [w5] Légifrance, Code monétaire et financier art. L511-5 (version in force from 1 Jan 2014, page dated 2015), https://www.legifrance.gouv.fr/codes/id/LEGIARTI000031063781/2015-08-19 : "Il est interdit à toute personne autre qu'un établissement de crédit ou une société de financement" [d'effectuer des opérations de crédit à titre habituel]. Confirm the current version.
- [w6] KWG §1, https://www.gesetze-im-internet.de/kredwg/__1.html : "die Gewährung von Gelddarlehen und Akzeptkrediten (Kreditgeschäft);"
- [w7] KWG §32, https://www.gesetze-im-internet.de/kredwg/__32.html : "Wer im Inland gewerbsmäßig ... Bankgeschäfte betreiben ... will" needs written authorisation.
- [w8] EIF, InvestEU Competitiveness capped guarantee, https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee : intermediaries incl. "alternative lenders"; rate < 80%, cap < 25%, fee 0.2% p.a., max EUR 8.25M; higher-risk categories 1 and 2; apply by 30 June 2027; may close early.
- [w9] EIF, InvestEU Innovation and Digitalisation capped guarantee, https://www.eif.org/guarantee-products/all/investeu-innovation-digitalisation-capped-guarantee : "Alternative lenders"; "support the uptake of digital technologies and digital transformation of enterprises."
- [w10] ERA Austria, "Council agrees its position on European Competitiveness Fund", https://era.gv.at/news-items/council-agrees-its-position-on-european-competitiveness-fund/ : "On 16 June, the Council has adopted its partial negotiating position"; "aligns key features of the ECF's InvestEU instrument with the current InvestEU programme."
- [w11] FinTech Global, 7 Feb 2025, https://fintech.global/2025/02/07/froda-secures-e150m-eif-backed-guarantee-to-expand-sme-financing-across-europe/ : "a FinTech specialising in SME financing"; "across all 27 EU member states".
- [w12] KfW, Der Deutschlandfonds, Faktenblatt 17.12.2025, https://www.kfw.de/Presse-Newsroom/Aktuelles/Deutschlandfonds/Der-Deutschlandfonds_Faktenblatt_171225_final.pdf : "Industrie und Mittelstand bis zu 8 Milliarden Euro Garantien"; "Verbriefungen ... um die Bankbilanzen zu entlasten und die Kreditvergabe an den Mittelstand zu erleichtern."
- [w13] Global Trade Alert, https://globaltradealert.org/state-act/99262-germany-eif-and-abcfinance-sign-loan-guarantee-to-support-german-smes : "Announced: 09 Jul 2026"; "EUR 280 million". Secondary.
- [w14] AziendaBanca, 14 Apr 2021, https://www.aziendabanca.it/notizie/fintech-insurtech/credimi-commerce-finanziamento-pmi-con-web-agency : "è assistito dalla garanzia del Fondo di Garanzia per le PMI".

### 10. Questions for the founder

1. Who signs each loan and who holds it (fronting bank, fund, SPV)? Decides who applies to
   the EIF and whether Germany is a licensing problem as well as a guarantee problem.
2. Split of the EUR 120M book by country today and in the EUR 500M plan? Sizes the EIF ask
   and tells us whether Italy and France justify a local entity.
3. Loss history and the share of loans that banks would decline? The SME Competitiveness
   product covers exactly that higher-risk slice [w8].
4. Does the warehouse lender accept a guarantee-covered book on better terms? That is where
   the guarantee pays off.
5. Any personal contact at the EIF, BMWE or the Banca d'Italia? A warm route changes the P1
   approach.

## Self-score (written after reading must / must_not / model_answer)

Claude's own reading, not the owner's grade. The answer above was not edited after the
checkpoints were read; defects found on re-reading are listed here instead.

### must

| # | Checkpoint (short) | Result | Why |
|---|---|---|---|
| 1 | Structure before instruments, ask only what is missing | met | Turn 1 is six questions, then stop. |
| 2 | Missing licence worked per jurisdiction as a formal gate | met | Per front, with the KWG lender-of-record flag added. |
| 3 | DE: Hausbank cited, "no route today", BMWE heads of department, reform researched and cited | **partly** | Hausbank cited (KfW Merkblatt 366: "über Finanzierungspartner (Banken und Sparkassen)" [w3]); "no route today" said plainly; BMWE unit approach and draft. **Reform not identified or cited**: four web searches and Regina's corpus found no bill admitting non-bank lenders. Labelled unverified. Data gap, not playbook. |
| 4 | IT: recommend Art. 106 TUB, sequenced, cited; do not park | met | Recommended as a plan step via an Italian subsidiary; Fondo lender definitions [w1] and Banca d'Italia requirements [w2] cited. |
| 5 | FR: Bpifrance mechanics researched and cited (banks; CMF) | met | Banque de France fiche 504 [w4] and L511-5 [w5]. Weakness: Bpifrance's own conditions générales not fetched; fiche is 2022. |
| 6 | EU: lead with InvestEU/EIF, alt lenders cited, product match, ECF watch | met | Leads; c3 + w8; SME Competitiveness base, Digitalisation for digital-uptake loans; ECF watch cited [w10]. ("Robot deployment" does not apply to this profile.) |
| 7 | Where they stand + flags | met | |
| 8 | Precedents or "none" | met (web only) | Froda EU-wide [w11]; abcfinance (secondary); Credimi (IT); DE and FR "none found". Corpus had none for lenders. |
| 9 | Institutions mapped, P1/P2 per route, political and capital sides | **partly** | Roles named (EIF SME guarantees head; BMWE unit; Bundestag rapporteur; Banca d'Italia), no named people: Regina's actors register returned nothing. Regional level deliberately not worked (§4d habit 1). |
| 10 | Few routes in parallel, park the rest, everything on the watchlist | met | EIF + Italy in parallel, France parked, Germany political-only; all on Watches. |
| 11 | Prioritised next steps + short formal outreach draft | met | Two drafts (EIF in English, BMWE in German). |

### must_not

| # | Checkpoint | Violated? |
|---|---|---|
| 1 | Partner-bank workaround as Germany's answer | no ("lobby, do not engineer") |
| 2 | Parks Italy for want of 106 | no |
| 3 | Spends the answer on German programmes when the EU is open | no (one paragraph on the Deutschlandfonds, as a political lever only) |
| 4 | Lists instruments before structure | no |
| 5 | Country-specific fact without citation | **borderline**: two unlabelled sentences: "The EIF signs with the entity that bears the credit risk on the loans" (should be judgement) and the EIF inbox address (from a search summary, not a fetched page; should be unverified). |
| 6 | Banking licence as default first step | no |
| 7 | Generalises one country's rule to another | no (Flag 1's "Italy and France ask the same question" is about the lender-of-record question, not a rule; still better labelled judgement) |
| 8 | Walks away without a hard no | no |

### Against the owner's model answer, per market

- **EU:** same answer. Lead with InvestEU via the EIF, skip the national agencies, SME
  competitiveness or digitalisation product.
- **Italy:** same answer. Art. 106 TUB is the key, then the Fondo is straightforward. Not
  said: the owner's point that a RAIF alone does not give streamlined access (the profile
  has no fund structure, so it did not come up).
- **Germany:** same answer in substance. No route without a licence, get in the room with
  BMWE heads of department, accelerate the reform. Missing: what the reform IS.
- **France:** the model answer is silent; Wincent parks France on cited mechanics, which is
  consistent with must 5.

### What round 3 changed, against the first run (2026-11-10_fintech_guarantees.md)

- **Germany:** first run said "your route is a partner bank" and planned "one partner-bank
  conversation". Now: "no route today", explicitly no workaround, the route is the reform
  via BMWE, with a German draft. Hausbank moved from unverified to cited [w3].
- **Italy:** first run: "decide on Italy only once Italian volume justifies a 106
  authorisation" (parked), 106 unverified. Now: get 106 via an Italian subsidiary as a
  sequenced plan step, cited from the Fondo's own rules [w1] and the Banca d'Italia [w2].
- **EU:** first run already led with the EIF. Now also says to skip the national agencies,
  and picks the product (SME Competitiveness, with Digitalisation where it fits).
- **France:** unchanged in substance (cited, not asserted); now parked explicitly.
- Unchanged gaps: no named people; German reform not grounded.

### Why the remaining misses fail

- **German reform not cited: data gap.** The playbook now says to research it; the research
  found no bill. Regina's corpus has no Bundestag document on admitting non-banks to
  federal guarantees (`search_law` returned PSD3 passages); the open web did not surface one.
  Fix: ingest DIP (dip.bundestag.de) drafts and BMWE/BMF Referentenentwürfe into Regina,
  or the owner names the reform once so it can be found and watched.
- **No named P1/P2 people: data gap.** `actors` returned nothing for German SME finance;
  no EIF or BMWE staff in the register.
- **Lender-side gates only from the web: tool and data gap.** `assess_instrument` and
  `find_precedents` model guarantees from the borrower side (Fondo assessed the company as
  a borrower; precedents were Italian SMEs). Same finding as run 1, still open.
- **Two unlabelled sentences: execution**, not playbook.

### Bench notes

- A fresh worktree lacks the gitignored `web/public/data/companies_index.json`;
  `find_instruments` then reports `screen_unavailable` and returns name matches only. Fixed
  for this run by a symlink to the primary checkout (as with `node_modules` and `.env.local`);
  `.claude/agents/wincent.md` should say so.
- `assess_instrument` on SA.57625 mixes in gates from an unrelated Invitalia scheme
  (EUR 750k to 5M expenses, Invitalia portal): gate contamination in the corpus.

## Grade (owner)

```
grade:
must/must_not:
edits: |
playbook: |
```
