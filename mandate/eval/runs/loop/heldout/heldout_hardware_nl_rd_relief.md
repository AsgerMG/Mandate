# Loop run: heldout_hardware_nl_rd_relief (heldout)

Case: `mandate/eval/scenarios/heldout_hardware_nl_rd_relief.yaml`. Brain: Wincent. Playbooks at 0194bc605c. One-reply re-test on the bench (no API spend), 2026-11-13T07:24:12+00:00, 201.5s.
Leave-one-out case library: 0 entries derived from this case left out; reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We are a Dutch hardware scale-up in Eindhoven: optical inspection modules for semiconductor fabs. We spend heavily on R&D and want to cut its cost with public money: R&D tax relief, a development grant or loan for our next-generation module, and a public co-investor in our next round. What should we go for, in what order?
> 
> More about us, so you can answer in one go: Dutch BV founded 2018, 70 staff, revenue about EUR 9M, never claimed R&D tax relief. About 30 of our engineers are employed by our Belgian subsidiary in Leuven; the Dutch BV employs 20 engineers and the commercial team. We started the next-generation module project in September (EUR 6M over two years, about half of it external prototyping and cleanroom time). We plan to raise EUR 15M of equity in about nine months; no lead yet.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

I'd run four routes in this order: Dutch R&D tax relief first, the Belgian payroll relief alongside it, then an EU application that brings a grant and a public co-investor, with a Dutch development loan timed to your round. Two facts decide most of it. Your R&D is split across two countries, and your project already started in September.

## The order

| # | Route | When | Why this slot |
|---|---|---|---|
| 1 | **WBSO**, the Dutch R&D wage relief, for the Dutch BV | File by **20 December** for a period starting 1 January 2027 [w1] | It only covers future work [w2]. Hours from September to December are already lost, and each month of delay loses another. |
| 2 | **Belgian researcher payroll relief**, for the Leuven subsidiary | This month | 30 of your engineers sit there. It is probably your biggest relief (judgement). |
| 3 | **EIC Accelerator**: an EU grant plus optional EU equity | First 2027 deadline | The equity part is your public co-investor, and it runs on a timeline close to your raise. |
| 4 | **Innovatiekrediet**, an RVO development loan | Apply with a term sheet, take it at closing | It is only granted once both the project and the company are fully financed [w4]. |

## 1. WBSO (Netherlands)
- It covers only hours of staff on your own payroll [w2]. So the 20 Dutch engineers count and the 30 in Leuven do not.
- Prototyping done by outside firms counts as outsourced research and is excluded [w2]. Cleanroom rental may still count as a project cost if it serves only your R&D and you can trace it to the project [w2]. Whether it qualifies is my judgement, so confirm it with RVO.
- **Rates for 2027:** 36% on the first EUR 391,020 of the base, then 16% [w1]. The higher 50% "starter" rate probably does not apply to a company founded in 2018 (unverified; check RVO's starter definition).
- **Illustration**, assuming 20 engineers at about 1,400 R&D hours each and about EUR 45 per hour: a base of roughly EUR 1.3M gives about EUR 285k a year. Send me real hours and wages and I'll firm this up.

## 2. Belgium
- Belgium lets an employer keep 80% of the wage tax withheld on qualifying researchers who hold recognised degrees (unverified: the official page refused access).
- Rough scale: if each engineer carries about EUR 20k of withholding tax a year, that is about EUR 480k a year for 30 people. My figure, not a source.
- To confirm: check BELSPO's 2025 guidelines and the project notification rules with your Belgian payroll provider.
- Do not move the Leuven engineers onto the Dutch payroll just to fit WBSO.

## 3. Grant and co-investor: EIC Accelerator
- You fit as a single SME [c1]. It funds work at technology readiness levels 6 to 8, close to market [c4]. The equity comes from the EIC Fund.
- A strong score that is not funded still earns a Seal of Excellence, which helps you raise money elsewhere [c5].
- The Brabant development agency (BOM) and Invest-NL are the Dutch co-investors to approach once your deck is ready.
- **Precedent:** none close. The EIC awards I found are outside your sector. BOM's recorded deals are small early-stage loans, such as EUR 350k to MicroAlign in 2025 (register record, competition-cases.ec.europa.eu/cases/SA.62153). I found no Invest-NL deal in my records, so this is a first-of-a-kind ask for each of them.

## 4. Innovatiekrediet
- It covers up to 35% of project costs for a mid-sized firm [w3].
- **Weak point:** a large part of the work must take place in the Netherlands [w4], and most of your engineering is in Leuven.

## What not to do yet
Don't apply for a grant or loan on the September project as it stands. EU state-aid rules generally require the application to come before the work starts (unverified; check Article 6 of the EU block exemption regulation). Instead, scope a distinct next phase that starts after you apply, and ask RVO first:

> *Subject: Innovatiekrediet, timing for a development project in progress.* Dear Sir or Madam, we are an Eindhoven maker of optical inspection modules for semiconductor fabs. A next-generation development started in September 2026. Would a follow-on phase starting after our application qualify, and how do you treat development done by our Belgian subsidiary? We would welcome a short intake meeting.

## Open questions
1. **Where is the external prototyping done, and who holds the IP?** This decides both the Innovatiekrediet location test and how the work splits between the two R&D reliefs.
2. **Is any shareholder above 25%?** That could cost you SME status for the EIC grant.

## Sources
- [c1] [c4] [c5] EIC Accelerator eligibility page: https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en
- [w1] https://www.rvo.nl/subsidies-financiering/wbso (13 Nov 2026): the 20 December deadline for a 1 January 2027 start; the rate table (36% / 16%, EUR 391,020 bracket).
- [w2] https://www.rvo.nl/subsidies-financiering/wbso/voorwaarden (13 Nov 2026): "U mag alleen WBSO aanvragen voor S&O-uren van uzelf en van medewerkers die bij u op de loonlijst staan"; "De kosten van uitbesteed onderzoek komen niet in aanmerking voor WBSO"; "U kunt alleen WBSO aanvragen voor toekomstige S&O-werkzaamheden".
- [w3] https://www.rvo.nl/subsidies-financiering/innovatiekrediet (13 Nov 2026): up to 35% of total project costs for medium-sized companies.
- [w4] https://www.rvo.nl/subsidies-financiering/innovatiekrediet/voorwaarden (13 Nov 2026): "Het Innovatiekrediet wordt pas verleend als de financiering van zowel het project als het bedrijf helemaal rond is"; "een groot deel van de activiteiten in Nederland plaatsvindt".
