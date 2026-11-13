# Loop run: heldout_bnpl_ccd2_nl_it (measure)

Case: `mandate/eval/scenarios/heldout_bnpl_ccd2_nl_it.yaml`. Brain: Regina. Playbooks at 65b8f72925. One-reply re-test on the bench (no API spend), 2026-11-13T09:34:50+00:00, 279.9s.
Leave-one-out case library: 0 entries derived from this case left out; reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We offer buy-now-pay-later at online checkouts: consumers pay in three instalments, interest-free, and we charge the merchant. We are Dutch, live in the Netherlands, and want to launch in Italy next year. We hear the new consumer credit rules will catch us. When, what changes, do we need a licence, and who should we talk to?
> 
> More about us, so you can answer in one go: Dutch BV, 60 staff, no credit or payment licence today; we fund the receivables from a warehouse line. Average basket EUR 90, three instalments over 60 days, no interest or fees to the consumer, late fees capped. About 400,000 Dutch customers. We would launch in Italy with the same product through Italian merchants, from the Dutch entity if we can.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Regina's answer

## Short answer

1. **When.** The new consumer credit directive was due to apply from 20 November 2026. Neither of your markets will be fully on time.
   - **Italy** wrote it into law by decree in January 2026 [w3]. Firms must comply by 20 November 2026, or 90 days after the Banca d'Italia's implementing rules if those come later [w5]. Those rules were still "di prossima emanazione" (forthcoming) on 6 November [w6].
   - **Netherlands.** The lower house passed the bill on 6 October 2026 [w8]. The Senate's committee reported on 3 November and is waiting for the government's reply. The start date will be set by royal decree [w9]. Publication is expected no earlier than 17 December 2026 [w10].
2. **You are caught.** The old exemption for interest-free credit repaid within three months is what keeps you unregulated in the Netherlands today [c2][c4]. Your capped late fees did not break that exemption under the old rules [c23]. The new directive keeps an exemption only when the seller itself gives time to pay and no third party offers or buys the credit [w1]. You are that third party. The Netherlands removes the exemption [w11], and Italy has repealed it [w4].
3. **What changes.** In the Netherlands: an AFM licence to grant credit, a credit check against the BKR (the Dutch credit register), registering each credit there, and a ban on anyone under 18 [w11]. In Italy: the consumer credit rules of the banking law now apply to you [w3].
4. **The licence is the real decision.** A Dutch credit licence covers the Netherlands. In my reading it does not passport to Italy (judgement). The route that could carry one Dutch licence into Italy is different: a payment institution licence, granting short credit tied to a payment it executes itself. That credit must be repaid within 12 months [c16]. The directive exempts such credit from the separate lender admission [w2]. Whether your flow qualifies decides the structure.

## Where you stand

| Front | Today | Status |
|---|---|---|
| **Netherlands, existing 400,000 customers** | You need a licence the day the Dutch law starts. | The AFM has accepted applications since June 2026, at the applicant's own cost and risk [w10]. A licence takes effect when the law does [w10]. One law firm expects the AFM to be lenient in the first half-year, but the AFM has said nothing formal (unverified). **This is the deal-breaker.** |
| **Italy, from the Dutch BV** | No route on a Dutch credit licence alone. | The lender must be authorised to lend in Italy [w3]. If you take the merchants' claims without recourse, you count as the creditor and carry the lender's duties [w3]. EU payment and e-money institutions can work in Italy under the passport [w4]. |
| **Italy, small amounts** | Still movable. | The Banca d'Italia decides which rules do not apply under EUR 200 [w12]. Your EUR 90 basket sits right there. |

## Options

| Option | What it takes | Trade-off |
|---|---|---|
| **A. AFM credit licence now, Italy through a licensed Italian partner** | File with the AFM; front Italy through an authorised Italian lender. | Fastest and safest for the Dutch book. In Italy you give up margin and control. |
| **B. DNB payment institution licence** | You execute the payment yourself and keep the credit within the 12-month rule [c16]. Funding from a warehouse line fits: the funds must not come from client payment funds [c19]. | One licence, passported to Italy. Slower, more capital. The Dutch payments framework is also being rewritten, and existing institutions will have to reapply [w13]. |
| **C. Italian subsidiary, authorised in Italy** | A local entity licensed by the Banca d'Italia. | Heaviest; only makes sense at scale (judgement). |

**My recommendation (judgement):** Start A for the Netherlands this month; the Dutch book cannot wait for a structuring debate. In parallel, ask DNB and the AFM in one pre-application meeting whether route B works for your flow. If it does, B becomes the Italy vehicle for a 2027 launch.

**Do not yet:**
- Sign Italian merchants on the Dutch BV.
- Promise anyone "interest-free, so unregulated". That stopped being true.

**Precedent:** I found no regulator decision in this run confirming that a BNPL lender passported into Italy through route B.

## Who to engage (by function)

**Netherlands**
- **P1:**
  - The AFM's licensing desk for credit providers.
  - The Ministry of Finance's financial markets directorate, which owns the bill and the decree under it. Two points there are still movable [w10]:
    - A formal statement on the AFM's leniency.
    - Making the verification rule risk-based.
- **P2:**
  - The consumer credit trade association.
  - The Senate's finance committee.

**Italy**
- **P1:** The Banca d'Italia's consumer protection and supervision functions, on the small-amount rules and on route B.
- **P2:**
  - The Italian consumer credit association.
  - The Treasury department of the Ministry of Economy and Finance.

**Funding:** A licence brings capital and own-funds requirements that touch the warehouse line. I am passing that to Wincent (judgement).

**One decision for you this week:** In your flow, do you execute the payment to the merchant yourself, or do you only buy the claim after the sale? That answer decides between routes A and B, and I can draft the AFM/DNB meeting request once I have it.

```mandate-board
{"title":"Dutch BNPL: new consumer credit rules, Netherlands and Italy","stage":"options","answer":{"lines":["You are caught: a third party offering interest-free BNPL falls outside the remaining exemption.","Netherlands: AFM credit licence before the Dutch law starts (expected early 2027); the 400,000-customer book depends on it.","Italy: no route on a Dutch credit licence; test the payment-institution passport, or front through an Italian lender."],"confidence":"medium","confidence_why":"Dates and scope are sourced; the passport route depends on how your payment flow is built.","open_question":"Do you execute the payment to the merchant, or only buy the claim afterwards?","cite":["w1","w3","w10","w11","c16","w2"]},
"routes":{"levels":[
{"id":"eu","level":"eu","label":"EU","doors":[{"id":"pi-passport","name":"Payment institution with credit tied to a payment","institution":"Home regulator (DNB)","status":"probe","why":"Short credit tied to a payment is allowed and exempt from lender admission; it may passport.","conditions":["Execute the payment transaction yourself","Repay within 12 months","Fund from own or market funds, not client funds"],"cite":["c16","c19","w2"]}]},
{"id":"nl","level":"national","label":"Netherlands","country":"NL","doors":[{"id":"nl-afm","name":"AFM licence to grant consumer credit (art. 2:60 Wft)","institution":"AFM","status":"open","why":"Applications accepted since June 2026; the licence takes effect when the law starts.","conditions":["BKR check and registration","No customers under 18","Creditworthiness assessment"],"cite":["w10","w11"]},{"id":"nl-exempt","name":"Current interest-free exemption","institution":"Book 7 Civil Code","status":"shut","why":"Removed by the implementing bill.","cite":["c2","w11"]}]},
{"id":"it","level":"national","label":"Italy","country":"IT","doors":[{"id":"it-nlcredit","name":"Dutch credit licence used in Italy","institution":"Banca d'Italia","status":"shut","why":"The lender must be authorised to lend in Italy; no passport for a non-bank lender (judgement).","cite":["w3","judgement"]},{"id":"it-partner","name":"Front through an authorised Italian lender","institution":"Italian bank or authorised lender","status":"open","why":"Fastest to market; you give up margin and control.","cite":["judgement"]},{"id":"it-sub","name":"Italian subsidiary authorised by Banca d'Italia","institution":"Banca d'Italia","status":"park","why":"Heaviest route; makes sense only at scale.","cite":["unverified"]}]},
{"id":"lobby","level":"lobby","label":"Rules still movable","doors":[{"id":"it-small","name":"Banca d'Italia rules for credit under EUR 200","institution":"Banca d'Italia","status":"probe","why":"Forthcoming; your EUR 90 basket sits in it.","cite":["w6","w12"]},{"id":"nl-lenient","name":"Formal AFM transition and risk-based verification rule","institution":"Ministry of Finance / AFM","status":"probe","why":"No formal leniency statement; a motion asks for a risk-based check.","cite":["w10"]}]}]},
"roadmap":{"origin":"2026-11","tracks":[
{"id":"nl","label":"Netherlands licence","steps":[{"id":"flow","label":"Map the payment flow: who executes the payment","start":0,"end":0.25,"owner":"client","status":"active","cite":["judgement"]},{"id":"premeet","label":"Pre-application meeting with AFM and DNB","start":0.25,"end":1,"owner":"client","status":"planned","depends_on":["flow"],"cite":["judgement"]},{"id":"afm-file","label":"File the AFM credit licence application","start":0.5,"end":1.5,"owner":"client","status":"planned","cite":["w10"]},{"id":"build","label":"Build BKR checks and registration, and the under-18 block","start":0.5,"end":3,"owner":"client","status":"planned","cite":["w11"]},{"id":"nl-live","label":"Dutch law in force (publication not before 17 Dec 2026)","start":"2027-01-01","milestone":true,"owner":"institution","status":"planned","cite":["w9","w10"]}]},
{"id":"it","label":"Italy","steps":[{"id":"it-decide","label":"Decide: payment-institution passport or Italian partner","start":1,"end":2,"owner":"client","status":"planned","depends_on":["premeet"],"cite":["judgement"]},{"id":"it-nomerch","label":"Do not sign Italian merchants on the Dutch BV yet","start":0,"end":3,"owner":"client","status":"blocked","cite":["w3","judgement"]},{"id":"it-launch","label":"Italian launch","start":9,"milestone":true,"owner":"client","status":"planned","depends_on":["it-decide"],"cite":["judgement"]}]},
{"id":"watch","label":"Watchlist","steps":[{"id":"w-ek","label":"Senate vote and royal decree setting the start date","start":1,"milestone":true,"owner":"us","status":"planned","cite":["w9"]},{"id":"w-bdi","label":"Banca d'Italia implementing rules; the 90-day clock starts","start":0.5,"milestone":true,"owner":"us","status":"planned","cite":["w5","w6"]},{"id":"w-afm","label":"AFM statement on a transition or leniency","start":1,"milestone":true,"owner":"us","status":"planned","cite":["w10"]},{"id":"w-psd3","label":"New payments directive: does it keep the ancillary credit rule; reauthorisation","start":6,"milestone":true,"owner":"us","status":"planned","cite":["w13","c15"]}]}]},
"stakeholders":{"institutions":[
{"id":"afm","name":"AFM","side":"market","country":"NL","units":[{"id":"afm-lic","name":"Licensing, credit providers","roles":[{"id":"afm-p1","role":"Head of credit-provider licensing","priority":"P1","reach":"AFM licensing intake","status":"to_approach","cite":["w10"]}]}]},
{"id":"minfin","name":"Ministry of Finance","side":"political","country":"NL","units":[{"id":"dfm","name":"Financial markets directorate","roles":[{"id":"minfin-p1","role":"Policy lead on the consumer credit bill","priority":"P1","reach":"Through the trade association or a direct letter","status":"to_approach","cite":["judgement"]},{"id":"ek-fin","role":"Senate finance committee","priority":"P2","reach":"Committee clerk","status":"to_approach","cite":["w9"]}]}]},
{"id":"dnb","name":"De Nederlandsche Bank","side":"market","country":"NL","units":[{"id":"dnb-pi","name":"Payment institution licensing","roles":[{"id":"dnb-p1","role":"Licensing lead, payment institutions","priority":"P1","reach":"Joint pre-application meeting","status":"to_approach","cite":["judgement"]}]}]},
{"id":"bdi","name":"Banca d'Italia","side":"market","country":"IT","units":[{"id":"bdi-tut","name":"Consumer protection and supervision","roles":[{"id":"bdi-p1","role":"Head of the consumer credit implementing rules","priority":"P1","reach":"Through the Italian consumer credit association, or in writing","status":"to_approach","cite":["w12"]},{"id":"assoc-it","role":"Italian consumer credit association","priority":"P2","reach":"Membership or an introduction","status":"to_approach","cite":["judgement"]}]}]}]},
"process_maps":[],
"risks_flags":[{"id":"nl-book","kind":"deal_breaker","severity":"high","title":"No licence when the Dutch law starts: 400,000-customer book exposed","fix":"File with the AFM now; the AFM is already processing applications.","cite":["w10"]},{"id":"it-passport","kind":"deal_breaker","severity":"high","title":"No Italian route on a Dutch credit licence","fix":"Test the payment-institution passport, or front through an Italian lender.","cite":["w3","w2","judgement"]},{"id":"minors","kind":"flag","severity":"medium","title":"Under-18 ban and BKR registration in the Netherlands","fix":"Age verification and BKR integration before the law starts.","cite":["w11"]},{"id":"capital","kind":"flag","severity":"medium","title":"Licence capital requirements touch the warehouse line","fix":"Handed to Wincent.","cite":["judgement"]}]}
```

**Sources**

Corpus:
- [c2][c4] CJEU C-409/23 Riverty, on Dutch Civil Code article 7:58(2)(e). https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CJ0409, sha 6e337ccc7a52
- [c23] Riverty, operative part: default interest and collection costs are not "interest" or "other charges". https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CA0409, sha b5370dc4a114
- [c16][c19] Payment services directive 2015/2366, article 18(4) and recital: "repaid within a short period which shall in no case exceed 12 months". https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015L2366, sha 7e97f132f4bd. The corpus marks this act "repealed". The new payments package is not yet in application, so in my reading article 18(4) still applies (judgement).
- [c15] Payments directive proposal COM(2023)366, which keeps the 12-month limit. https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52023PC0366

Web (retrieved 13 Nov 2026):
- [w1] Directive 2023/2225, article 2(2)(h), secondary mirror at https://lawplayer.com/eu/article/32023L2225/art_2: "a supplier of goods or a provider of services, without a third party offering credit". EUR-Lex would not load here; confirm on EUR-Lex.
- [w2] Same mirror, article 37(2): "The requirement of an adequate admission process and of registration shall not apply to creditors that are:", which include payment institutions for point 4 services. https://lawplayer.com/eu/article/32023L2225/art_37
- [w3][w4] Decreto legislativo 212/2025, Normattiva. https://www.normattiva.it/eli/id/2026/01/09/26G00009/ORIGINAL
  - w3 (art. 122 c.1-ter TUB): "si considera offerta di credito da parte di terzi anche quella in cui la dilazione…"; the lender is "abilitato a erogare finanziamenti a titolo professionale nel territorio della Repubblica".
  - w4 (art. 128-decies c.2-bis): "Le banche, gli istituti di pagamento e gli istituti di moneta elettronica comunitari". The repeal of the old exemptions is reported by secondary commentary.
- [w5] dirittobancario.it, secondary: "entro il termine di novanta giorni dall'entrata in vigore delle disposizioni attuative di Banca d'Italia laddove successivo".
- [w6] https://www.dirittobancario.it/art/ccd-2-lattuazione-di-banca-ditalia/: "Nelle prossime settimane è quindi attesa l'emanazione di tali disposizioni."
- [w8] Tweede Kamer, bill 36924, adopted 6 October 2026. https://www.tweedekamer.nl/kamerstukken/wetsvoorstellen/detail?qry=wetsvoorstel%3A36924&cfg=wetsvoorsteldetails
- [w9] https://www.eerstekamer.nl/wetsvoorstel/36924_implementatiewet_herziene: committee report 3 Nov 2026; start "bij koninklijk besluit te bepalen tijdstip".
- [w10] Loyens & Loeff, 12 Oct 2026, secondary. https://www.loyensloeff.com/nl/insights/news--events/news/status-ccdii-vergunningaanvraag-en-proportionele-kredietwaardigheidstoetsing/: "De AFM neemt sinds juni 2026 vergunningaanvragen in behandeling"; publication "niet eerder dan 17 december 2026".
- [w11] Rijksoverheid, 31 Oct 2025. https://www.rijksoverheid.nl/ministeries/ministerie-van-financien/nieuws/2025/10/31/nieuwe-regels-voor-buy-now-pay-later: "een vergunning moeten aanvragen bij de AFM"; "verboden voor jongeren onder de 18 jaar".
- [w12] tabilia.it, secondary. https://tabilia.it/direttiva-ue-2023-2225-ccd2-credito-consumatori-novita-dlgs-212-2025/: the Banca d'Italia identifies the provisions that do not apply under EUR 200.
- [w13] Clifford Chance, Apr 2026, secondary. https://www.cliffordchance.com/content/dam/cliffordchance/briefings/2026/04/impact-of-psd3-are-you-ready.pdf: existing institutions must reapply within 21 months.

**Still open for you**
- **Payment flow:** this decides A versus B (above).
- **Recourse:** do Italian merchants assign you their claims with or without recourse? Without recourse makes you the creditor in Italy [w3].
- **Under-18 customers:** do you have any today? This is a Dutch build item [w11].
- **AFM file:** have you already filed or prepared one?
