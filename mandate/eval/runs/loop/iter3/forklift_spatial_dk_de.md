# Loop run: forklift_spatial_dk_de (iter3)

Case: `mandate/eval/scenarios/forklift_spatial_dk_de.yaml`. Brain: Wincent. Playbooks at 45ffa6b025. One-reply re-test on the bench (no API spend), 2026-11-17T08:23:23+00:00, 219.9s.
Leave-one-out case library: 3 entries derived from this case left out (forklift_mispriced_market_velocity, forklift_regulatory_flag_to_regina, forklift_risk_not_to_customer); reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We build spatial-awareness hardware fitted to forklifts and other intralogistics vehicles, with monitoring software. HQ in Denmark (ApS) with a German subsidiary (GmbH). We deploy like a system integrator: we carry all upfront costs (hardware, installation, integration) and the customer pays only once everything runs. That working-capital burden holds back our scaling. What can we do at state level to get cheaper capital for this model? And we are about to raise an equity round: can we get public equity into the round?
> 
> More about us, so you can answer in one go: The Danish ApS signs most contracts, including German ones; hardware is assembled in Denmark from EU components. Hardware stays on our balance sheet until go-live, then passes to the customer. Revenue about EUR 6M, 45 staff. Raising EUR 12M Series A, lead in talks, close in about four months. The GmbH sits in Bavaria.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

I couldn't reach Mandate's own instrument database or citation store in this session. Everything below therefore comes from official pages I fetched today, marked [wN], or carries a label. Nothing has a [cN] citation.

## The answer

**Working capital: Denmark is the door, because the ApS carries the cost.** The Danish ApS signs the contracts and owns the hardware until go-live. So the open door is a Danish state guarantee on a bank line, issued by EIFO (Denmark's export and investment fund), not a grant.

- **Lead: the EIFO-Guarantee on a working-capital line from your bank.**
  - It covers "Specific orders, e.g., processing credits" and "Credit facilities for financing the company's ongoing working capital" [w1].
  - Cover is up to 80% of the bank's loss on that facility, capped at 50% of the bank's total loss on you. The premium is 0.8% to 6.3% a year, set by your rating [w1].
  - Conditions: positive equity, creditworthy, at most 749 staff across the group, not listed, and the line must expand the bank's commitment to you [w1]. At 45 staff you are well inside.
- **Second channel: an EU-backed loan through your bank.** The EIF (European Investment Fund) backs Danske Bank lending to SMEs and small mid-caps in Denmark. One of its windows is "innovation & digitalisation" [w3], which fits connected safety hardware (judgement). It only applies if Danske is, or becomes, your bank.

**Why this is the right money.** Lenders price your risk high because they can't value a project that only pays at go-live (judgement). That gap in the market is exactly what a state guarantee exists to fill, and it is the case to make to EIFO. Keep the cost with the state's guarantee, not your customers. Leasing or customer credit would make your offer less competitive (judgement).

**What it is worth, on my assumptions (please send the real figures):**
- Assume upfront cost is 55% of contract value and 5 months pass between first spend and payment.
- Then EUR 6M of revenue ties up about EUR 1.4M on average. At EUR 12M of revenue it is about EUR 2.75M.
- Funded from the Series A, that is roughly 12% to 23% of the round sitting in hardware waiting for go-live.
- Funded from a guaranteed line, each euro comes back about 2.4 times a year (12 months ÷ 5).
- At an assumed 2% premium on EUR 2.4M of cover, the guarantee costs about EUR 48k a year. Equity at VC target returns costs far more for the same cost (judgement).

**Germany is parked, not shut.** Bavarian and federal money reaches the GmbH, but the GmbH carries none of the cost:
- **LfA Universalkredit** (LfA is Bavaria's state development bank): covers working capital, with 60% risk cover for your bank up to EUR 4M, applied for through your bank (unverified; the official database page blocked me).
- **Moving German contracts into the GmbH** would be a structure change with tax and transfer-pricing effects. Don't do it to chase a loan (judgement).

## Public equity in the Series A: yes, through EIFO, and start now

- EIFO "can invest directly in the company as equity and become an active, long-term co-owner", and it "always finances together with a partner" [w4]. Your lead is that partner.
- **Precedent:** EIFO joined the DKK 84M seed round of Capra Robotics, a Danish mobile-robot company in logistics, in January 2025 [w5]. I found no EIFO-Guarantee precedent for a company deploying hardware that is paid at go-live. That is a first-of-a-kind ask, so the file must be stronger.
- **Timing:** four months is tight for a public investor (judgement). Ask your lead to introduce you to EIFO this month.
- **Ask your lead which public money backs its own fund.** If EIFO or the EIF is a backer of the fund, that is a second channel (unverified until you know who the lead is).
- **Doors that don't fit:**
  - **EIFO's matching loan** matches an investor's money up to 1:1 [w4], but it is aimed at early-stage startups. At EUR 6M revenue you are probably past it (judgement).
  - **Bavaria's ScaleUp fund** invests at least EUR 10M, needs a Bavarian seat and the project mostly in Bavaria (unverified, third-party listing). It doesn't fit this round.

## Order of moves

1. **This month:** your lead introduces you to EIFO's venture team. Your bank opens the guarantee conversation, because EIFO asks to be contacted "in good time" [w1].
2. **Before you sign the term sheet:** make sure it allows a senior guaranteed working-capital line (judgement).
3. **At close:** file the guarantee. The fresh equity strengthens the positive-equity test and your rating (judgement).
4. **Not yet:** don't restructure German contracts, and don't offer customers leasing.

**Handed to Regina:** your product may count as a machinery safety component under the new EU Machinery Regulation. If it uses machine learning to detect people, the EU AI Act may also apply. Monitoring forklift drivers raises worker-data and works-council questions in Germany (all unverified). Regina will assess these.

## Draft (Danish; your bank files, this opens the door)

> **Emne:** Driftskapital til danske industriinstallationer: anmodning om møde
>
> Kære [Leder af garantiområdet, EIFO],
>
> [Firma] ApS udvikler og samler sikkerhedssystemer til gaffeltrucks i Danmark og installerer dem hos industrikunder i Danmark og Tyskland. Vi bærer selv hele investeringen indtil drift, og bankerne prissætter den risiko højt. Det binder kapital, som ellers ville finansiere næste projekt. Vi lukker en Series A på 12 mio. EUR inden for fire måneder.
>
> Vi vil gerne drøfte, hvordan en EIFO-Garanti på en driftskredit gennem vores bank kan understøtte dansk eksport og sikrere arbejdspladser. Har De 30 minutter i de kommende uger?
>
> Med venlig hilsen, [CEO]

**Questions for you:**
- Which bank and which lead investor? That decides the channel.
- What is the real cost per project and the real time to payment? That sizes the line.
- Do German customers demand performance bonds? If so, EIFO's Growth Guarantee covers them for a Danish company [w2].

```mandate-board
{"title":"Spatial-awareness integrator DK/DE: cheaper working capital and public equity","stage":"write_up",
"answer":{"lines":["Working capital: EIFO-Guarantee on a bank working-capital line to the ApS, because the ApS carries the cost.","Equity: bring EIFO's direct equity into the Series A through the lead, starting this month.","Germany parked: its money reaches the GmbH, which carries none of the cost."],"confidence":"medium","confidence_why":"Product sheets fit on every published condition; the bank and the lead are not yet known.","open_question":"Which bank and which lead investor?","cite":["w1","w4"]},
"routes":{"levels":[
{"id":"eu","level":"eu","label":"EU","doors":[{"id":"investeu-danske","name":"InvestEU guarantee, innovation & digitalisation window","institution":"EIF via Danske Bank","via":"your bank","status":"probe","why":"SMEs and small mid-caps in Denmark; fits only if Danske is your bank.","cite":["w3"]},{"id":"eic","name":"EIC Fund","institution":"EIC","status":"park","why":"Process too slow for a 4-month close.","cite":["judgement"]}]},
{"id":"dk","level":"national","label":"Denmark","country":"DK","doors":[{"id":"eifo-guar","name":"EIFO-Guarantee on a working-capital line","institution":"EIFO","via":"your bank","status":"open","why":"Covers processing credits and working-capital lines; under 749 staff; positive equity required.","cite":["w1"]},{"id":"eifo-equity","name":"EIFO direct equity","institution":"EIFO","status":"open","why":"Invests directly, always alongside a partner such as your lead.","cite":["w4"]},{"id":"eifo-growth","name":"Growth Guarantee (performance bonds)","institution":"EIFO","status":"probe","why":"Only if German customers demand performance bonds; issued for a Danish company.","cite":["w2"]},{"id":"eifo-match","name":"Matching loan","institution":"EIFO","status":"park","why":"Aimed at early stage; likely past it.","cite":["w4","judgement"]}]},
{"id":"by","level":"regional","label":"Bavaria","country":"DE","doors":[{"id":"lfa","name":"LfA Universalkredit with risk cover","institution":"LfA Förderbank Bayern","via":"the GmbH's bank","status":"park","why":"Finances the GmbH, which carries none of the cost.","cite":["unverified"]},{"id":"bk-scaleup","name":"ScaleUp-Fonds Bayern","institution":"Bayern Kapital","status":"shut","why":"Minimum EUR 10M ticket, Bavarian seat and project; not this round.","cite":["unverified"]}]},
{"id":"cust","level":"customer","label":"Customer side","country":"DE","doors":[{"id":"bg-premium","name":"Employer's-liability insurer safety premiums for assistance systems","institution":"Industry accident insurers (Berufsgenossenschaften)","status":"probe","why":"A sales aid only, never instead of your own financing.","cite":["unverified"]}]}]},
"roadmap":{"origin":"2026-11","tracks":[
{"id":"equity","label":"Series A with EIFO","steps":[{"id":"intro","label":"Lead introduces EIFO venture team","start":0,"end":1,"owner":"client","status":"planned","cite":["w4"]},{"id":"ts","label":"Term sheet allows a senior guaranteed line","start":1,"end":2,"owner":"client","status":"planned","cite":["judgement"]},{"id":"close","label":"Series A close","start":4,"milestone":true,"owner":"client","status":"planned","depends_on":["intro","ts"]}]},
{"id":"wc","label":"Guaranteed working-capital line","steps":[{"id":"bank","label":"Bank opens EIFO-Guarantee talks; send project cost and cash-cycle data","start":0,"end":2,"owner":"client","status":"planned","cite":["w1"]},{"id":"file","label":"Bank files guarantee after close (fresh equity)","start":4,"end":6,"owner":"institution","status":"planned","depends_on":["close","bank"],"cite":["w1","judgement"]},{"id":"no-gmbh","label":"Not yet: move German contracts into the GmbH","start":0,"end":6,"owner":"client","status":"blocked","cite":["judgement"]},{"id":"no-lease","label":"Not yet: push cost onto customers through leasing","start":0,"end":6,"owner":"client","status":"blocked","cite":["judgement"]}]},
{"id":"watch","label":"Watchlist","steps":[{"id":"w-eifo","label":"EIFO guarantee terms (sheet dated Jan 2026): premium and coverage","start":6,"milestone":true,"owner":"us","status":"planned","cite":["w1"]},{"id":"w-investeu","label":"InvestEU moving into the European Competitiveness Fund: Danish bank windows","start":12,"milestone":true,"owner":"us","status":"planned","cite":["unverified"]},{"id":"w-lfa","label":"LfA: reopens only if the GmbH takes on contracts","start":12,"milestone":true,"owner":"us","status":"planned","cite":["unverified"]},{"id":"w-bk","label":"Bayern Kapital: next round of 10M or more with Bavarian activity","start":18,"milestone":true,"owner":"us","status":"planned","cite":["unverified"]},{"id":"w-mach","label":"EU Machinery Regulation applies Jan 2027 (Regina)","start":2,"milestone":true,"owner":"us","status":"planned","cite":["unverified"]}]}]},
"stakeholders":{"institutions":[
{"id":"eifo","name":"EIFO","side":"public-capital","country":"DK","units":[{"id":"eifo-g","name":"Guarantees","roles":[{"id":"g-p1","role":"Head of the guarantee area","priority":"P1","reach":"Your bank's request, plus the draft letter","status":"to_approach","cite":["judgement"]},{"id":"g-p2","role":"Guarantee credit officer","priority":"P2","reach":"EIFO call centre or forwarded by the head","status":"to_approach","cite":["w1"]}]},{"id":"eifo-v","name":"Venture","roles":[{"id":"v-p1","role":"Partner covering industrial or deep tech","priority":"P1","reach":"Warm introduction from the lead","status":"to_approach","cite":["judgement"]},{"id":"v-p2","role":"Investment manager","priority":"P2","reach":"Forwarded by the partner","status":"to_approach","cite":["judgement"]}]}]},
{"id":"bank","name":"Your Danish bank","side":"market","country":"DK","units":[{"id":"corp","name":"Corporate banking","roles":[{"id":"b-p1","role":"Head of credit for SME and EIF/EIFO-backed lending","priority":"P1","reach":"Via relationship manager","status":"to_approach","cite":["judgement"]},{"id":"b-p2","role":"Relationship manager","priority":"P2","reach":"Direct","status":"to_approach","cite":["judgement"]}]}]},
{"id":"em","name":"Danish Ministry of Industry, Business and Financial Affairs","side":"political","country":"DK","units":[{"id":"own","name":"Unit overseeing EIFO","roles":[{"id":"m-p1","role":"Head of unit","priority":"P1","reach":"Only if EIFO stalls","status":"to_approach","cite":["judgement"]},{"id":"m-p2","role":"Desk officer","priority":"P2","reach":"Ministry switchboard","status":"to_approach","cite":["judgement"]}]}]},
{"id":"lfa","name":"LfA Förderbank Bayern","side":"public-capital","country":"DE","units":[{"id":"lfa-u","name":"Corporate loans (parked)","roles":[{"id":"l-p1","role":"Head of corporate lending","priority":"P1","reach":"Through the GmbH's bank","status":"to_approach","cite":["unverified"]},{"id":"l-p2","role":"Bavarian economy ministry, finance unit","priority":"P2","reach":"Later, if the structure changes","status":"to_approach","cite":["judgement"]}]}]}]},
"funding_stack":{"currency":"EUR","need":{"amount":2750000,"label":"Average cost tied up in projects at EUR 12M revenue (assumed)"},"instruments":[
{"id":"seriesA","name":"Series A","type":"equity","amount":12000000,"terms":"Pays for product, team and Germany; too dear to fund hardware waiting for payment","status":"in_progress","cite":["judgement"]},
{"id":"eifo-eq","name":"EIFO ticket within the round","type":"public_coinvest","terms":"Same terms as the lead; adds a long-term public co-owner","status":"probe","cite":["w4"]},
{"id":"wc-line","name":"Bank working-capital line with EIFO-Guarantee","type":"guarantee_debt","amount":2000000,"amount_max":3000000,"terms":"Pays for project costs until go-live; cheap because EIFO takes up to 80% of the loss (premium 0.8% to 6.3%)","status":"planned","cite":["w1"]},
{"id":"bonds","name":"Growth Guarantee for performance bonds","type":"guarantee_debt","terms":"Customer bonds without tying up cash; only if customers demand them","status":"probe","cite":["w2"]}]},
"process_maps":[{"id":"eifo-g-map","title":"How the EIFO-Guarantee reaches you","explains":"The bank applies; EIFO rates you and takes part of the loss.","kind":"funding_decision","illustrative":false,
"actors":[{"id":"cl","name":"ApS","side":"market"},{"id":"bk","name":"Your bank","side":"market"},{"id":"ef","name":"EIFO guarantees","side":"public-capital"}],
"steps":[{"id":"s1","label":"Send project costs and cash cycle to the bank","kind":"document","actor":"cl","cite":["judgement"]},{"id":"s2","label":"Bank requests the guarantee","kind":"step","actor":"bk","cite":["w1"]},{"id":"s3","label":"EIFO assesses credit individually","kind":"decision","actor":"ef","cite":["w1"]},{"id":"s4","label":"Line opens, up to 80% covered","kind":"step","actor":"bk","cite":["w1"]}],
"flow":[{"from":"s1","to":"s2"},{"from":"s2","to":"s3"},{"from":"s3","to":"s4"}],
"leverage":[{"id":"lv1","at":"s3","kind":"timing_window","label":"File just after the Series A closes","why":"Positive equity is a condition and fresh equity lifts the rating","how":"Bank files once the round lands","side":"public-capital","cite":["w1","judgement"]},{"id":"lv2","at":"ef","kind":"pressure_point","label":"Mispriced-market case","why":"Your payment-at-go-live model is what the guarantee exists for","how":"Draft letter to the head of guarantees","side":"public-capital","cite":["judgement"]}],"cite":["w1"]}],
"risks_flags":[{"id":"wrong-entity","kind":"flag","severity":"medium","title":"German money reaches the GmbH, but the ApS carries the cost","fix":"Keep the Danish route; review structure only for tax reasons","cite":["judgement"]},{"id":"tight","kind":"flag","severity":"medium","title":"Four months is tight for an EIFO equity decision","fix":"Lead introduces you this month","cite":["judgement"]},{"id":"covenant","kind":"flag","severity":"medium","title":"Round terms could block senior debt","fix":"Carve out a guaranteed working-capital line in the term sheet","cite":["judgement"]},{"id":"reg","kind":"flag","severity":"medium","title":"Machinery Regulation, AI Act and worker monitoring","fix":"Handed to Regina","cite":["unverified"]}]}
```

**Sources** (all retrieved 2026-11-17)
- [w1] [EIFO-Guarantee product sheet, Jan 2026](https://eifo.dk/media/ykebr4xj/eifo-guarantee-jan-2026.pdf): "Credit facilities for financing the company's ongoing working capital"; "Up to 80% of the final loss on the specific facility"; "typically ranges from 0.8% to 6.3% p.a."; "The company must have positive equity and be creditworthy"; "maximum of 749 employees".
- [w2] [Growth Guarantee sheet, Jan 2026](https://eifo.dk/media/ancabgxb/growth-guarantee-vaekstgaranti-jan-2026.pdf): "Performance guarantees for main or subcontracting agreements"; "the guarantee must be issued for a Danish company".
- [w3] [EIF and Danske Bank, 6 May 2025](https://www.eif.org/press/all/eif-guarantee-unlocks-eur178-million-in-new-lending-for-nordic-smes-through-danske-bank): "supported by the European Commission under its InvestEU programme"; "sustainability and innovation & digitalisation".
- [w4] [EIFO, for startups](https://eifo.dk/en/for-you-who-are/company/startup-1): "EIFO can invest directly in the company as equity and become an active, long-term co-owner"; "EIFO always finances together with a partner."
- [w5] [Capra Robotics release, 15 Jan 2025](https://via.ritzau.dk/pressemeddelelse/14222125/capra-robotics-rejser-84-mio-kr-til-international-vaekst?lang=da): a seed round of "lige over 84 mio. kr." with EIFO participating.
- Unverified, for you to confirm: [LfA Universalkredit (Förderdatenbank)](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/universalkredit.html) and [ScaleUp-Fonds Bayern (Grantbite)](https://www.grantbite.com/en/funding/bavaria-scaleup-fund-equity-capital).
