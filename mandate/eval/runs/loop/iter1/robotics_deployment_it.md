# Loop run: robotics_deployment_it (iter1)

Case: `mandate/eval/scenarios/robotics_deployment_it.yaml`. Brain: Wincent. Playbooks at 2d06988746 (+uncommitted edits). One-reply re-test on the bench (no API spend), 2026-11-12T22:18:26+00:00, 242.1s.

## The case

> We deploy industrial robots in SME factories on a robots-as-a-service model: we buy the robots, place them with the customer and finance them over 3-5 years. We are expanding into Italy. We are thinking of setting up an Italian company and either registering it as a startup innovativa or getting Art. 106 status so we can finance our customers ourselves. Which public money fits, and where in Italy?
> 
> More about us, so you can answer in one go: We are a German GmbH, 6 years old, about 120 staff, EUR 18M revenue. No Italian entity yet; first customers are in Lombardia and Emilia-Romagna. We would want to finance about EUR 30M of robots for Italian customers over three years.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

# Robots-as-a-service in Italy: which public money fits, and where

I checked Italy's status rules, the Fondo di Garanzia and Nuova Sabatini texts, the regions' innovation strategies and the 2026 tax incentive. I also looked for past deals by the same funders. The regional scan only ran by name, so the regional list is thin.

## 1. Answer

Your choice is not really startup innovativa versus Art. 106. It turns on the contract you sign with customers.

- **Pure rental (you own the robot and bundle service):** this is probably not reserved lending in Italy. The legal definition of lending names finance leasing but not rental [w1] (judgement, confirm with Italian counsel). You do not need Art. 106 just to do business.
- **Finance leases or loans:** these are reserved for authorised lenders [c8][w1]. Art. 106 then becomes the key to the market. It lets you put your own SME loans under the State guarantee of the Fondo di Garanzia [c2][c3][c5][c6].

Don't build on startup innovativa. It fails on size and age early, and it can't sit in the same company as Art. 106 (section 3).

For the €30M itself, the quickest open door is the EU. The EIF's InvestEU guarantees admit leasing companies and alternative lenders [c46] that are established or operating in a member state [c45]. One agreement could cover Germany and Italy (judgement).

The thing you didn't ask but must know: most Italian incentives your customers would use reward owning the robot or taking it on a finance lease, not renting it.
- Nuova Sabatini: purchase or finance lease [c15].
- The 2026 hyper-depreciation (iperammortamento): depreciation and finance-lease payments [w4].
- The Chambers of Commerce SI4.0 grant: excludes equipment rental [w5].

So offer an Italian finance-lease option alongside rental (judgement).

**Where in Italy:** Lombardia and Emilia-Romagna first. Your customers are there, and both regions list advanced manufacturing or mechatronics as a priority [c26][c28]. Veneto and Piemonte come next [c27][c25].

## 2. Where you stand

| Front | Today |
|---|---|
| EU (InvestEU via the EIF) | Open to leasing companies [c46]. Applications close 30 June 2027 [c44]. No Italian licence needed for the EU door itself (judgement). |
| Italy, national, you as lender | Shut until you hold Art. 106. With it, the Fondo di Garanzia's direct and portfolio guarantees open to you [c3][c5][c6]. Nuova Sabatini opens to you as a lender only if a bank in its agreement guarantees your loans [c7]. |
| Italy, national, your customers | SMEs get Sabatini loans and grants for new machinery, including through finance leasing [c15]. The iperammortamento covers investments from 1 Jan 2026 to 30 Sept 2028 [w4]. Whether the owner of rented robots can claim it is unverified: ask a commercialista. |
| Regional | The strategies fit [c26][c28]. I found no regional fund for financing equipment fleets. The regional R&D calls I found (Ricerca&Innova, Collabora&Innova in Lombardia) are not checked yet and suit R&D, not fleet finance. |
| Local | SI4.0 2026 (Chambers of Commerce of Bergamo, Brescia, Milano Monza Brianza Lodi): 50% grant up to €30k, robotics eligible, rental excluded. The 2026 window closed on 25 Sept [w5]. |

## 3. Flags

1. **High: startup innovativa fails for your company.**
   - From the second year, annual output value must stay at or below €5M [w2]. A €30M fleet will pass that (judgement).
   - The company must not be set up by transferring a business or part of one [w2]. So existing Italian contracts can't be moved into it.
   - It needs an innovation test: R&D at 15% or more of the larger of costs or output value, or qualified staff, or holding or licensing a patent [w2]. Robot depreciation makes the R&D test near impossible. A licence to a group patent could pass (judgement).
   - An Art. 106 company's purpose must be limited to financial activity [c11], while a startup innovativa's purpose must be innovative high-tech products [w2]. One company cannot be both.
   - Fix: drop it.
2. **High: the contract form is undecided.** It decides whether you need Art. 106 at all. Fix: get a short Italian counsel opinion on the rental versus finance-lease structure.
3. **Medium: the SME test is applied at group level.** You pass on 120 staff and €18M revenue only if no large company or fund holds 25% or more of you [c24] (judgement on the facts). Fix: confirm your shareholder structure.
4. **Medium: Art. 106 has a real cost.**
   - Registered office and head office in Italy [c9].
   - Paid-up capital of €2M, or €3M if you issue guarantees [w3].
   - A business plan, by-laws and an organisation report [w3].
   - Then ongoing Banca d'Italia supervision.

## 4. Decisions

- **Rental only, or rental plus finance lease in Italy?** I recommend both. Rental keeps the service model. A finance lease lets customers capture Sabatini and the iperammortamento, which helps sales.
- **Art. 106 now or later?** I recommend a small Italian operating company now (rental, sales, service). Then an Art. 106 company as a planned step once the counsel opinion and the EIF probe come back. Do not park it.
- **Startup innovativa?** No.

## 5. Actions and drafts

1. **Italian banking and tax counsel:** opinion on whether rental is reserved, and whether the owner can claim the iperammortamento on rented robots. This week.
2. **EIF, Head of Guarantees, InvestEU SME products (P1); Italy desk officer (P2):** probe letter, draft below.
3. **Mediocredito Centrale, Fondo di Garanzia accreditation unit (operational P2):** what accreditation of a new Art. 106 lender involves, and what cover applies to equipment loans. The 2027 reform changes cover, so check it before quoting figures [c5].
4. **Banca d'Italia, the unit that authorises Art. 106 lenders (P1, function only):** pre-filing meeting once the contract form is settled.
5. **Regione Lombardia, DG for economic development, and Regione Emilia-Romagna, the economic development department (political P1):** a positioning meeting on their manufacturing and mechatronics priorities [c26][c28]. They open doors; they don't fund the fleet.

**Draft to the EIF:**

> Subject: InvestEU portfolio guarantee for robot financing for SME manufacturers, Germany and Italy
>
> Dear Head of Guarantees,
>
> [Company] is a German company with 120 staff that places industrial robots with SME manufacturers and finances them over three to five years. We are entering Italy, starting in Lombardia and Emilia-Romagna, with about EUR 30 million of robots to finance over three years.
>
> This is digitalisation of SME manufacturing in practice, which InvestEU exists to support. We would welcome 30 minutes to discuss whether our leasing portfolio fits an InvestEU guarantee product before the June 2027 deadline.
>
> Yours sincerely, [Name, CEO]

## 6. Plan

- **This week:** counsel opinion; send the EIF probe.
- **This month:** set up the Italian company for operations (rental, sales, service); find the partner banks in the Sabatini agreement; call the Fondo di Garanzia.
- **This quarter:** decide on Art. 106. If yes, start the capital, by-laws, plan and filing. Run the EIF process in parallel.
- **Later:** accreditation with the Fondo di Garanzia; Veneto and Piemonte.
- **Parked:** startup innovativa.

**Timing:** apply before ordering, so the incentive is not lost.
- Sabatini usually needs the application before the order (unverified).
- The iperammortamento needs a booking with GSE, the state agency that runs it (unverified, from secondary sources).

**Regulatory side, for Regina:** Banca d'Italia supervision if you take Art. 106, and EU machinery safety and AI rules for robots (unverified, not researched here).

## 7. Watches

- InvestEU moving into the European Competitiveness Fund: will leasing companies stay eligible?
- The Fondo di Garanzia's 2027 cover reform [c5].
- The iperammortamento implementing rules and the 30 Sept 2028 end date [w4].
- The SI4.0 2027 edition [w5].
- Lombardia's Collabora&Innova II call (unverified).
- Sabatini refinancing in the budget law (unverified).

## 8. Precedents

- **Fondo di Garanzia guaranteeing a non-bank lessor's portfolio:** none found in our award records.
- **EIF guaranteeing an equipment-as-a-service lessor in Italy:** none found.

Both would be first-of-a-kind asks until the EIF's published transaction list proves otherwise. Checking that list is the next step.

## 9. Sources

- [c2][c3][c4] Fondo di Garanzia operating rules 2023, corpus PDF, sha 10198c227b8c
- [c5][c6] Fondo di Garanzia portfolio rules, circ. 6/2018, fondidigaranzia.it, sha 68016c68454e
- [c7][c15][c24] DL 69/2013 art. 2 (Nuova Sabatini), normattiva, sha e4993c050802
- [c8] TUB art. 106, normattiva, sha f7dfd42ca0f5
- [c9][c11] TUB art. 107, normattiva, sha c144a0b23168
- [c25] Piemonte S3, sha deef31219ada
- [c26] Lombardia S3, sha 4cc011a6c9e6
- [c27] Veneto S3, sha cafa394bcbcd
- [c28] Emilia-Romagna S3, sha 19a5ef72941b
- [c44][c45][c46] EIF InvestEU guarantee products, corpus page, sha d3142570c7e7
- [w1] [DM 53/2015 art. 2](https://www.normattiva.it/uri-res/N2Ls?urn:nir:ministero.economia.e.finanze:decreto:2015-04-02;53~art2), 12 Nov 2026: "comprende, tra l'altro, ogni tipo di finanziamento erogato nella forma di: a) locazione finanziaria"
- [w2] [DL 179/2012 art. 25](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:2012-10-18;179~art25), 12 Nov 2026: "non è superiore a 5 milioni di euro"; "non è stata costituita da una fusione, scissione societaria o a seguito di cessione di azienda o di ramo di azienda"
- [w3] [Banca d'Italia, Art. 106 lenders](https://www.bancaditalia.it/compiti/vigilanza/accesso-mercato/intermediari-finanziari/index.html), 12 Nov 2026: "€ 2 milioni per gli intermediari che non rilasciano garanzie"
- [w4] [MIMIT decree of 7 May 2026](https://www.mimit.gov.it/it/normativa/decreti-interministeriali/decreto-intermimisteriale-7-maggio-2026-modalita-attuative-delliperammortamento-2026), 12 Nov 2026: "Sono agevolabili gli investimenti effettuati a partire dal 1° gennaio 2026 e fino al 30 settembre 2028"
- [w5] [Assolombarda, SI4.0 2026 call](https://www.assolombarda.it/servizi/credito-finanza-e-incentivi/informazioni/bando-si4-0-2026-fino-a-30-000-euro-per-l2019innovazione), 12 Nov 2026: "il noleggio di attrezzature" (excluded); deadline "ore 12.00 del 25 settembre 2026"

## 10. Questions for you

1. **Rental, finance lease, or both?** This decides whether you need Art. 106.
2. **Does any large company or fund hold 25% or more of the GmbH?** This decides SME status, and with it Sabatini and the Fondo di Garanzia.
3. **What funds the €30M today: your balance sheet, bank lines or a facility?** This decides which EIF product fits.
4. **Do you hold patents, and is there any R&D in Italy?** This decides whether regional R&D calls are worth a look.
