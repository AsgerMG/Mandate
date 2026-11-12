# Loop run: robotics_deployment_it (after_scaffold)

Case: `mandate/eval/scenarios/robotics_deployment_it.yaml`. Brain: Wincent. Playbooks at e3aea05487. One-reply re-test on the bench (no API spend), 2026-11-12T22:11:21+00:00, 224.4s.

## The case

> We deploy industrial robots in SME factories on a robots-as-a-service model: we buy the robots, place them with the customer and finance them over 3-5 years. We are expanding into Italy. We are thinking of setting up an Italian company and either registering it as a startup innovativa or getting Art. 106 status so we can finance our customers ourselves. Which public money fits, and where in Italy?
> 
> More about us, so you can answer in one go: We are a German GmbH, 6 years old, about 120 staff, EUR 18M revenue. No Italian entity yet; first customers are in Lombardia and Emilia-Romagna. We would want to finance about EUR 30M of robots for Italian customers over three years.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

I've worked the case using Italy's status rules, the Italian guarantee fund's operating rules, the regional strategies, the EU guarantee layer and the 2026 Italian tax rules.

## The answer

Of the two options, Art. 106 is the one that can carry a €30M book. Start-up innovativa cannot. But before choosing either, settle a more basic question: does your robots-as-a-service contract count as lending under Italian law? If it doesn't, you may not need 106 at all.

My recommendation:
1. Set up a plain Italian company (S.r.l.) in Lombardia.
2. Approach the EU guarantee layer (EIF) first for the financing side.
3. Treat 106 as a planned, sequenced step that you take only if the contract turns out to be financing.
4. Use your customers' own incentives as part of the sales pitch.

## The two statuses

**They can't sit in the same company.** A 106 intermediary's business purpose must be limited to 106 activities [c11]. A start-up innovativa's purpose must be mainly developing, producing and selling high-tech innovative products [w1]. (judgement: the two exclude each other.)

**Start-up innovativa is a poor fit:**
- A new Italian company would pass the age test (60 months at most) [c20] and the residence test [c21].
- But from year two its annual production value must stay at or below €5M [w1]. €30M of robots on 3-5 year terms crosses that around year two (judgement).
- The company must not be formed by transferring an existing business or branch [w1]. So don't move existing Italian contracts into it.
- What the status opens is minor for you: priority review at the guarantee fund [c13][c14], and a 30% tax relief for investors [c17][c18], which matters little for a wholly owned subsidiary (judgement).

**Art. 106 is the real unlock for the national guarantee fund (Fondo di Garanzia):**
- A 106 intermediary is a "soggetto finanziatore" (eligible lender) and can request the fund's direct guarantee [c2][c3][c4].
- After accreditation, it can also request the guarantee on whole portfolios of loans [c5][c6].
- The customers who benefit must be SMEs based in Italy [c12].
- Cost of getting it:
  - Minimum paid-in capital of €2M, or €3M if you also issue guarantees [w2].
  - Registered office and head office in Italy [c9].
  - A business purpose limited to 106 activities [c11].
  - Banca d'Italia can refuse if it doesn't see sound and prudent management [w2].

**The deciding question.** The law reserves "granting financing in any form" to authorised lenders [c8].
- A genuine operating rental (you keep ownership, maintenance and residual risk, with no purchase option) is generally outside that reservation (unverified: I found no official text saying so).
- Financial leasing or instalment sales are lending.
- Your Italian counsel should confirm this against the 2015 implementing decree (D.M. 53/2015). Regina takes the regulatory half from here.

## Which level has the open door

| Level | Route | Status |
|---|---|---|
| EU | EIF InvestEU competitiveness guarantee. Leasing companies are named as eligible intermediaries; the call is open until 30 June 2027 [w4] | **Lead with this.** One agreement could cover your German and Italian books (judgement) |
| National | Guarantee fund via 106 [c2][c5] | Plan step, 6-12 months (judgement) |
| National, customer side | Nuova Sabatini (subsidised equipment loans) covers purchases and financial leasing [c15], not operating rental (judgement). A 106 lender can grant Sabatini loans only if a bank in the scheme guarantees them [c7] | Sales argument if you offer a financial-lease option |
| National, tax | New super-depreciation (iperammortamento) for capital goods bought from 1 Jan 2026 to 30 Sep 2028; it raises depreciation and financial-lease instalments [w3] | Under rental, the Italian company as owner may be the one who claims it (unverified: check the 11 June 2026 implementing decree) |
| Regional | Lombardia's smart-specialisation strategy lists "Manifattura avanzata" [c26]; Emilia-Romagna's lists "meccatronica e motoristica" [c28]. Piemonte, Veneto and Toscana are next [c25][c27][c29] | Regional calls I found are R&D calls requiring a Lombardy operating site (register record) |
| Local | Lombardy chambers of commerce's SI4.0 2026 call, €5.075M (unverified) | For your customers' projects; check whether rental fees are eligible |

## Flags
- **High:** the contract model is not settled. Settling it decides whether you need 106.
- **Medium:** your group passes the SME test today [c24]. Recheck it as the robots go onto your balance sheet (judgement).
- **Medium:** customer incentives usually require applying before ordering (unverified per call). Build this into your sales process.

## Plan
- **This month:**
  - Counsel opinion on rental versus lending.
  - Incorporate the S.r.l. in Milan.
  - Probe the EIF.
- **This quarter:**
  - If the contract is financing, prepare the 106 file (capital, governance, business plan).
  - Sign a partner leasing company for customers who want a Sabatini deal.
- **Watch:**
  - InvestEU moving under the European Competitiveness Fund.
  - Banca d'Italia's 30 Sep 2026 consultation on Circular 288 (the 106 rules) [w5].
  - Guarantee fund reform of cover levels.

## Who decides (by function)
- **EIF:** head of InvestEU guarantees for Italy (P1); intermediary origination team (P2).
- **Guarantee fund:** Mediocredito Centrale, accreditation unit (P2); the fund's management board decides [c14].
- **Banca d'Italia:** Supervision, authorisations.
- **Political:** Lombardia's councillor for economic development.

## Precedents
- **EIF:** a €200M InvestEU guarantee with BNP Paribas Leasing Solutions (2025), covering Italy and Germany (unverified; EIF press release).
- **Guarantee fund:** only the customer side. Manufacturing SMEs were guaranteed in 2026 under scheme SA.109544 (register record). No 106 robot lessor found, so this would be a first-of-a-kind case.

## Draft to the EIF (the founder sends)
> Dear Head of InvestEU Guarantees, Italy,
> We are a German Mittelstand robotics company, 6 years old with 120 staff. We place industrial robots in manufacturing SMEs and finance them over 3-5 years. Italy is our next market: €30M of robots over three years, starting in Lombardia and Emilia-Romagna. This is the competitiveness agenda in its most concrete form: automation for small factories that cannot fund it upfront. We would value 30 minutes to discuss whether our lease book across Germany and Italy fits the InvestEU competitiveness guarantee.

## Open questions for you
1. Do your contracts include a purchase option or transfer residual risk to the customer? This decides whether you need 106.
2. Will the Italian company own the robots, or will the GmbH? This decides who claims the tax relief and who signs with the EIF.

## Sources
**Corpus citations (label, URL, sha256 first 12):**
- [c2], [c3], [c4], [c12], [c13], [c14]: guarantee fund operating rules 2023 (internal corpus copy, no public URL), 10198c227b8c
- [c5], [c6]: guarantee fund portfolio rules, circ. 6/2018, https://www.fondidigaranzia.it/wp-content/uploads/2018/06/1_Modalita-operative-portafogli-fin_circ_6-2018.pdf, 68016c68454e
- [c7], [c15], [c24]: DL 69/2013 art. 2 (Nuova Sabatini), normattiva, e4993c050802
- [c8]: TUB art. 106, normattiva, f7dfd42ca0f5
- [c9], [c11]: TUB art. 107, normattiva, c144a0b23168
- [c17], [c18]: DL 179/2012 art. 29, normattiva, 37240793f8e8
- [c20], [c21]: DL 179/2012 art. 25, normattiva, 7d3024a3f8bf
- [c25]: Regione Piemonte S3, deef31219ada
- [c26]: Regione Lombardia S3, 4cc011a6c9e6
- [c27]: Regione Veneto S3, cafa394bcbcd
- [c28]: Regione Emilia-Romagna S3, 19a5ef72941b
- [c29]: Regione Toscana S3, 949291ad3b90

**Web sources (all retrieved 2026-11-12):**
- [w1] https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:2012-10-18;179~art25: "non è stata costituita da una fusione, scissione societaria o a seguito di cessione di azienda o di ramo di azienda"; the value-of-production cap is "non è superiore a 5 milioni di euro"
- [w2] https://www.bancaditalia.it/compiti/vigilanza/accesso-mercato/intermediari-finanziari/index.html: "€ 2 milioni per gli intermediari che non rilasciano garanzie"; "€ 3 mln per gli intermediari finanziari che esercitano, anche non in esclusiva, l'attività di rilascio di garanzie"
- [w3] Assolombarda iperammortamento guide (https://www.assolombarda.it/servizi/fisco/guida-agevolazioni-fiscali/sezioni/transizione-5.0/iperammortamento/lagevolazione): "per agevolare gli investimenti in beni strumentali effettuati dall'1.1.2026 al 30.9.2028"; "maggiorare il costo di acquisizione dei beni per la determinazione delle quote di ammortamento e dei canoni di locazione finanziaria"
- [w4] https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee: "Leasing companies"; application deadline 30 June 2027
- [w5] Banca d'Italia consultation of 30 Sep 2026, seen in search results only (https://www.dirittobancario.it/wp-content/uploads/2026/10/Documento-di-consultazione-Banca-d-Italia-30-settembre-2026.pdf), not fetched. Treat as unverified.

**Seen in search results only, not fetched (unverified):**
- EIF–BNP Paribas Leasing Solutions press release: https://www.eif.org/InvestEU/news/2025/european-investment-fund-and-bnp-paribas-leasing-solutions-sign-landmark-eur200-million-investeu-guarantee-for-smes-and-small-mid-caps-in-france-germany-italy-and-spain
- Lombardy chambers of commerce SI4.0 2026 call: https://www.unioncamerelombardia.it/fileadmin/bandi/2026/Bando_SI4.0_2026/Determinazione_D.O._n._217-2026.pdf

Note for the owner: my regional database search only matched on names this run, so the regional list may be incomplete.
