# Loop run: fintech_guarantees (iter2)

Case: `mandate/eval/scenarios/fintech_guarantees.yaml`. Brain: Wincent. Playbooks at ef145a73c9 (+uncommitted edits). One-reply re-test on the bench (no API spend), 2026-11-16T16:56:27+00:00, 280.7s.
Leave-one-out case library: 5 entries derived from this case left out (fintech_eu_open_door, fintech_eu_product_fits_activity, fintech_research_mechanics_not_instinct, fintech_shut_door_reform, fintech_status_unlocks_market); reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We are a fintech lender. We have raised EUR 40M. We want our SME loan portfolio guaranteed by public guarantee schemes in Germany, France and Italy, and at EU level. We do not have a banking licence. What are our routes?
> 
> More about us, so you can answer in one go: We are a German GmbH with no branches yet in France or Italy. We hold no banking, payment or investment-firm licence. We originate SME loans through our platform and fund them from a EUR 150M warehouse facility; the book is EUR 120M today and we want to reach EUR 500M in three years. We are not raising equity right now.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

# Your routes to public guarantees across the EU, Germany, France and Italy

## Answer

The EU level is open to you today, so start there. The European Investment Fund's InvestEU SME guarantee lists "alternative lenders" as eligible intermediaries, takes applications until 30 June 2027, and covers up to 80% of each loan with a cap below 25% [w1]. One agreement could cover Germany, France and Italy together (unverified; it depends on the call terms).

The national schemes are a different matter:
- **Germany:** shut to you as the lender. The guarantee banks only cover loans from a licensed credit institution, building society or insurer [w7].
- **France:** shut to you today, pending confirmation. Bpifrance's guarantee protects the "financial institution" that lends [w8].
- **Italy:** two statuses would open the national guarantee fund. Without one of them it is shut [w4][w5].

## Where you stand, level by level

| Level | Door | Why |
|---|---|---|
| EU, EIF InvestEU | **Open** | "Alternative lenders" are named as eligible. Cover up to 80%, cap below 25%, deadline 30 June 2027 or earlier if the budget runs out [w1]. |
| DE, guarantee banks | **Shut** | The lender must be a "Kreditinstitut, Bausparkasse, Versicherungsunternehmen", acting as house bank [w7]. Each loan is approved one at a time, which does not suit a platform book (judgement). |
| FR, Bpifrance | **Shut until confirmed** | "La garantie ... concerne l'établissement financier" [w8]. I found no current rule that admits a lender without a licence. To confirm with Bpifrance. |
| IT, national SME guarantee fund, direct | **Needs a status** | It works only on loans from banks, leasing companies and other financial intermediaries [w4]. In practice that means a lender on the Article 106 register (unverified). |
| IT, same fund, crowdfunding channel (since February 2026) | **Needs a status** | 80% cover on loans to SMEs based in Italy, made through a crowdfunding provider authorised under the EU crowdfunding regulation and accredited with the fund [w5][w6]. |

## The one thing you must know first

German law treats commercial lending as a regulated banking business (unverified here). So who is the legal lender on your loans today? Is it a partner bank, the warehouse vehicle, or the GmbH? That decides who can sign each guarantee, and it is a question for Regina, not for me.

If a partner bank is already the lender on your loans, it can apply in Germany. But that is borrowing its status. Ask yourself: if the bank walked away, would you still have a route? If not, it is a workaround, not your route (judgement).

## The money logic

The guarantee pays for nothing directly. Its value is that it takes over part of the loss on your loans, which is the risk your warehouse lender charges you for and your equity absorbs (judgement).

An illustrative calculation, assuming an 85% warehouse advance rate:
- A €500M book needs about €75M of junior capital. You have raised €40M.
- Suppose the EIF covers 50% of new loans with a 15% cap on €400M of new lending. Its maximum payout is then about €30M.
- If that cover lifts your advance rate to 90%, the junior capital you need falls to about €50M.

The EIF cover probably applies only to new loans, not your current €120M book (unverified). Please send your real advance rate, expected loss and average loan tenor so I can redo this.

## Decisions for you

1. **File with the EIF now.** I recommend it: it is the one open door, and the budget can close the call early [w1].
2. **Italy, which status:**
   - A crowdfunding authorisation from BaFin, passported to Italy, would let your warehouse funders lend as "investors" through your platform [w5]. That changes your business model.
   - An Article 106 lender means an Italian entity.
   - Ask Regina to compare the two before applying for either.
3. **Germany and France: lobby aim, not a route today.** In Germany, the clause to change is the lender list in the guarantee banks' standard terms, section 1(4) [w7]. In France, it is who may hold a Bpifrance guarantee. Italy's 2026 decree shows a reform like this can pass [w5]. In both countries I would let the EIF route come first.

## Who to approach

| Route | Decides (P1) | Forwards (P2) |
|---|---|---|
| EIF | Head of the InvestEU guarantee desk | Transaction manager for Germany |
| EIF, political side | The Commission unit that runs InvestEU | |
| Italy, operational | Head of the SME guarantee fund at its manager | The accreditation office |
| Italy, political | The Ministry of Enterprises' incentives directorate | |
| France, operational | Bpifrance's head of guarantees | Head of bank partnerships |
| France, political | The Treasury's business-financing sub-directorate | |

All of these are by function (judgement).

## Draft to the EIF, for you to send

> Subject: InvestEU SME guarantee for a German SME lending platform
>
> Dear Head of InvestEU Guarantees,
>
> [Company] is a German SME lender. Our book is €120M, funded by €40M of equity and a €150M warehouse, and we aim for €500M in three years across Germany, France and Italy. Many of our borrowers are SMEs that banks turn away for lack of collateral, which is the group your SME Competitiveness guarantee targets. We would value 30 minutes to discuss an expression of interest before the call closes.
>
> Yours sincerely, [CEO]

## Precedents

- **EIF:** Froda, "a FinTech specialising in SME financing", has EIF backing of €150M in total across "all 27 EU member states" [w3]. The EIF also backed Lendix (now October) in 2017; I saw the EIF's page title but could not open it (unverified).
- **Italy's crowdfunding channel:** none found. It has only been open since February 2026, so you would be among the first.
- **Germany and France:** I found no case of a lender without a licence being guaranteed.

## Questions for you

1. Who is the legal lender on your loans today: a partner bank, the warehouse vehicle, or the GmbH? It decides who signs every guarantee.
2. What are your average loan size and tenor? Small loans may also fit the EIF's microfinance product, which Froda uses (unverified).
3. Which banks fund your warehouse? Any of them that already hold an EIF guarantee would be your natural channel.

```mandate-board
{"title":"Fintech SME lender: public guarantees on the loan book","stage":"write_up",
"answer":{"lines":["Lead with the EIF InvestEU SME guarantee: alternative lenders are eligible, deadline 30 June 2027.","Germany and France: shut to a lender without a licence today; lobby aim, after the EIF route.","Italy: get a status (EU crowdfunding authorisation or an Article 106 lender) to open the national guarantee fund."],"confidence":"medium","confidence_why":"EIF eligibility is cited; whether one agreement covers DE, FR and IT, and who the legal lender is, are open.","open_question":"Who is the legal lender on your loans today?","cite":["w1","w4","w5","w7","w8"]},
"routes":{"levels":[
{"id":"eu","level":"eu","label":"EU","doors":[{"id":"eif-comp","name":"InvestEU SME Competitiveness guarantee (capped)","institution":"European Investment Fund","status":"open","why":"Alternative lenders eligible; cover up to 80%, cap below 25%.","conditions":["Expression of interest by 30 June 2027 or earlier if the budget runs out","EIF due diligence"],"cite":["w1","w2"]},{"id":"eif-micro","name":"InvestEU Microfinance guarantee","institution":"European Investment Fund","status":"probe","why":"Used by a fintech SME lender (Froda); fit depends on your loan sizes.","cite":["w3","unverified"]}]},
{"id":"de","level":"national","label":"Germany","country":"DE","doors":[{"id":"de-bb","name":"Guarantee banks' default guarantee","institution":"Bürgschaftsbanken","via":"licensed credit institutions, building societies and insurers acting as house bank","status":"shut","why":"Your company is not on the list of eligible lenders; each loan is approved one at a time.","cite":["w7"]}]},
{"id":"fr","level":"national","label":"France","country":"FR","doors":[{"id":"fr-bpi","name":"Bpifrance guarantee","institution":"Bpifrance","via":"financial institutions","status":"shut","why":"The guarantee protects the lending financial institution; a lender without a licence is not admitted per current sources; to confirm.","cite":["w8"]}]},
{"id":"it","level":"national","label":"Italy","country":"IT","doors":[{"id":"it-direct","name":"National SME guarantee fund, direct","institution":"Fondo di Garanzia PMI","via":"banks, leasing companies, financial intermediaries","status":"park","why":"Opens with an Article 106 lender status, which means an Italian entity.","cite":["w4","unverified"]},{"id":"it-cf","name":"National SME guarantee fund, crowdfunding channel","institution":"Fondo di Garanzia PMI","via":"accredited crowdfunding providers authorised under the EU crowdfunding regulation","status":"probe","why":"80% cover on loans; needs that authorisation, notified for Italy, and accreditation.","cite":["w5","w6"]}]},
{"id":"lobby","level":"lobby","label":"Rule changes","doors":[{"id":"lobby-de","name":"Admit regulated non-bank lenders in the guarantee banks' standard terms, section 1(4)","institution":"Association of German guarantee banks; federal and Land co-guarantors","status":"park","why":"No route today; after the EIF route.","cite":["w7","judgement"]},{"id":"lobby-fr","name":"Bpifrance guarantee for regulated non-bank lenders","institution":"Bpifrance; Treasury","status":"park","why":"No route today; Italy's 2026 decree shows the reform is feasible.","cite":["w5","judgement"]}]}
]},
"roadmap":{"origin":"2026-11","tracks":[
{"id":"first","label":"This week and month","steps":[{"id":"lender","label":"Regina: who is the legal lender in DE; cross-border lending into FR and IT","start":0,"end":1,"owner":"us","status":"active","cite":["judgement"]},{"id":"eoi","label":"EIF meeting, then expression of interest","start":0.25,"end":3,"owner":"client","status":"planned","depends_on":["lender"],"cite":["w1"]}]},
{"id":"later","label":"Quarter and later","steps":[{"id":"it-status","label":"Choose and file the Italy status (crowdfunding authorisation or Article 106)","start":3,"end":12,"owner":"client","status":"planned","depends_on":["lender"],"cite":["w5"]},{"id":"no-fr-lic","label":"Do not apply for a French or Italian licence until the EIF answer and Regina's view are in","start":0,"end":3,"owner":"client","status":"blocked","cite":["judgement"]},{"id":"signed","label":"EIF guarantee agreement","start":9,"milestone":true,"owner":"institution","status":"planned","depends_on":["eoi"],"cite":["unverified"]}]},
{"id":"watch","label":"Watchlist","steps":[{"id":"w-eif","label":"EIF call: budget may close it before 30 June 2027","start":"2027-06-30","milestone":true,"owner":"us","status":"planned","cite":["w1"]},{"id":"w-it","label":"Italy fund operating rules for the crowdfunding channel","start":3,"milestone":true,"owner":"us","status":"planned","cite":["w5"]},{"id":"w-de","label":"Guarantee banks' standard terms revision (lender list)","start":12,"milestone":true,"owner":"us","status":"planned","cite":["w7","unverified"]},{"id":"w-fr","label":"Bpifrance guarantee eligibility for non-bank lenders","start":12,"milestone":true,"owner":"us","status":"planned","cite":["w8","unverified"]}]}
]},
"stakeholders":{"institutions":[
{"id":"eif","name":"European Investment Fund","side":"public-capital","country":"EU","units":[{"id":"eif-g","name":"InvestEU guarantees","roles":[{"id":"eif-p1","role":"Head of the InvestEU guarantee desk","priority":"P1","reach":"The call's contact on the EIF site","status":"to_approach","cite":["w1"]},{"id":"eif-p2","role":"Transaction manager for Germany","priority":"P2","reach":"Forwarded by the head","status":"to_approach","cite":["judgement"]}]}]},
{"id":"ec","name":"European Commission","side":"political","country":"EU","units":[{"id":"ec-u","name":"Unit running InvestEU","roles":[{"id":"ec-p1","role":"Head of unit","priority":"P1","reach":"Unit mailbox","status":"to_approach","cite":["judgement"]},{"id":"ec-p2","role":"Policy officer, SME finance","priority":"P2","reach":"Forwarded by the head","status":"to_approach","cite":["judgement"]}]}]},
{"id":"mcc","name":"Fondo di Garanzia PMI manager","side":"public-capital","country":"IT","units":[{"id":"mcc-u","name":"Fund management","roles":[{"id":"mcc-p1","role":"Head of the fund","priority":"P1","reach":"Official fund site","status":"to_approach","cite":["w5"]},{"id":"mcc-p2","role":"Accreditation office for crowdfunding providers","priority":"P2","reach":"Accreditation request on the fund site","status":"to_approach","cite":["w5"]}]}]},
{"id":"mimit","name":"Italian Ministry of Enterprises","side":"political","country":"IT","units":[{"id":"mimit-u","name":"Incentives directorate","roles":[{"id":"mimit-p1","role":"Director general","priority":"P1","reach":"Ministry switchboard","status":"to_approach","cite":["judgement"]},{"id":"mimit-p2","role":"Head of the guarantee fund division","priority":"P2","reach":"Forwarded","status":"to_approach","cite":["judgement"]}]}]},
{"id":"bpi","name":"Bpifrance","side":"public-capital","country":"FR","units":[{"id":"bpi-u","name":"Guarantees","roles":[{"id":"bpi-p1","role":"Head of guarantees","priority":"P1","reach":"Partnership channel","status":"to_approach","cite":["judgement"]},{"id":"bpi-p2","role":"Head of bank partnerships","priority":"P2","reach":"Forwarded","status":"to_approach","cite":["judgement"]}]}]},
{"id":"tresor","name":"French Treasury","side":"political","country":"FR","units":[{"id":"tr-u","name":"Business financing sub-directorate","roles":[{"id":"tr-p1","role":"Sub-director","priority":"P1","reach":"Treasury switchboard","status":"to_approach","cite":["judgement"]},{"id":"tr-p2","role":"Head of office, SME finance","priority":"P2","reach":"Forwarded","status":"to_approach","cite":["judgement"]}]}]},
{"id":"vdb","name":"German guarantee banks","side":"public-capital","country":"DE","units":[{"id":"vdb-u","name":"Association and the Land guarantee bank","roles":[{"id":"vdb-p1","role":"Managing director of the association","priority":"P1","reach":"Association office, for the lobby aim","status":"to_approach","cite":["w7","judgement"]},{"id":"vdb-p2","role":"Head of guarantees at your Land guarantee bank","priority":"P2","reach":"Direct","status":"to_approach","cite":["judgement"]}]}]},
{"id":"bmwk","name":"German federal economy ministry","side":"political","country":"DE","units":[{"id":"bmwk-u","name":"SME finance unit (co-guarantor)","roles":[{"id":"bmwk-p1","role":"Head of unit","priority":"P1","reach":"Unit mailbox","status":"to_approach","cite":["w7","judgement"]},{"id":"bmwk-p2","role":"Desk officer, guarantees","priority":"P2","reach":"Forwarded","status":"to_approach","cite":["judgement"]}]}]}
]},
"funding_stack":{"currency":"EUR","need":{"amount":500000000,"label":"Loan book in three years"},"instruments":[
{"id":"equity","name":"Equity raised","type":"equity","amount":40000000,"terms":"Carries the first loss; the dearest money, so stretch it","status":"secured","cite":["judgement"]},
{"id":"warehouse","name":"Warehouse facility","type":"loan","amount":150000000,"terms":"Funds the loans; its price and advance rate reflect the expected loss","status":"secured","cite":["judgement"]},
{"id":"eif","name":"EIF InvestEU portfolio guarantee","type":"guarantee_debt","terms":"Takes part of the loss on new loans; cheap because the EU budget carries it, so the warehouse can lend more for each euro of equity","status":"probe","cite":["w1","judgement"]},
{"id":"it-fund","name":"Italy national guarantee fund","type":"guarantee_debt","terms":"80% cover on Italian loans once a status is held; whether it may combine with the EIF cover on the same loan is unverified","status":"parked","cite":["w5","unverified"]}]},
"process_maps":[{"id":"eif-dec","title":"How the EIF guarantee is decided","explains":"Expression of interest, due diligence, agreement.","kind":"funding_decision","illustrative":true,"actors":[{"id":"cl","name":"Your company","side":"market"},{"id":"eifa","name":"EIF guarantee team and board","side":"public-capital"}],"steps":[{"id":"s1","label":"Expression of interest","kind":"document","actor":"cl","timing":"before 30 June 2027","cite":["w1"]},{"id":"s2","label":"Due diligence","kind":"step","actor":"eifa","cite":["judgement"]},{"id":"s3","label":"Approval and agreement","kind":"decision","actor":"eifa","cite":["judgement"]}],"flow":[{"from":"s1","to":"s2"},{"from":"s2","to":"s3"}],"leverage":[{"id":"l1","at":"s1","kind":"timing_window","label":"The budget can close the call early","why":"First come, first served","how":"File this quarter","side":"public-capital","cite":["w1"]},{"id":"l2","at":"eifa","kind":"precedent","label":"Froda, a fintech SME lender with EIF backing across the EU","why":"Shows the EIF backs this kind of lender","how":"Name it in the expression of interest","side":"public-capital","cite":["w3"]}],"cite":["w1"]}],
"risks_flags":[{"id":"r-lender","kind":"deal_breaker","severity":"high","title":"Legal lender unclear (German lending licence rules)","fix":"Regina to assess; it decides who signs every guarantee","cite":["judgement"]},{"id":"r-xb","kind":"flag","severity":"high","title":"Lending into France and Italy without a licence or branch","fix":"Regina to assess before any market entry","cite":["judgement"]},{"id":"r-new","kind":"flag","severity":"medium","title":"EIF cover probably applies only to new loans","fix":"Sign before the growth phase","cite":["unverified"]}]}
```

## Sources (retrieved 16 Nov 2026)

- **[w1]** [EIF, InvestEU Competitiveness capped guarantee](https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee): "Alternative lenders"; "Max (counter-)guarantee rate: < 80%"; "Max cap rate: < 25%"; deadline 30 June 2027, which the EIF "may end ... earlier depending on budget availability".
- **[w2]** [EIF, InvestEU guarantee products](https://engage.eif.org/investeu/guarantees): "six core products"; "offered to Financial Intermediaries".
- **[w3]** [fintech.global on Froda](https://fintech.global/2025/02/07/froda-secures-e150m-eif-backed-guarantee-to-expand-sme-financing-across-europe/): "a FinTech specialising in SME financing"; "total financing support to €150m"; "all 27 EU member states".
- **[w4]** [Italian Ministry of Enterprises, SME guarantee fund](https://www.mimit.gov.it/index.php/it/incentivi/fondo-di-garanzia-per-le-pmi): "La garanzia può essere attivata esclusivamente a fronte di finanziamenti concessi da" banks, leasing companies and other financial intermediaries.
- **[w5]** [Ministerial decree of 7 January 2026](https://www.dirittobancario.it/wp-content/uploads/2026/02/Decreto-MIMIT-07-gennaio-2026.pdf), Articles 1, 3 and 4: the guarantee is "concessa su richiesta dei fornitori di servizi di crowdfunding accreditati"; cover of "80 (ottanta) per cento" on loans; borrowers with "sede legale ovvero sede operativa sul territorio italiano".
- **[w6]** [Ministry page for the decree](https://www.mimit.gov.it/it/normativa/decreti-interministeriali/decreto-interministeriale-7-gennaio-2026-modalita-e-condizioni-di-accesso-al-fondo-di-garanzia-per-le-pmi-dei-finanziamenti-realizzati-tramite-piattaforme-di-social-lending-e-crowdfunding): published in the official gazette no. 34 of 11 February 2026.
- **[w7]** [Association of German guarantee banks, standard terms for loan guarantees, 1 Oct 2023](https://vdb.ermoeglicher.de/documents/1865/ABB-Kredit_2.0_VDB-Layout_final_V2.pdf), section 1(4): "Kreditgeber (Kreditinstitut, Bausparkasse, Versicherungsunternehmen ...)"; section 1(2): guarantees "anteilig von Bund und Land rückverbürgt".
- **[w8]** [French Senate report r22-876](https://www.senat.fr/rap/r22-876/r22-8761.html): "La garantie octroyée par Bpifrance concerne l'établissement financier, et non l'entreprise"; cover "entre 40 % et 70 %".

Note for the owner: the internal instrument database could not be reached in this run, so every source here is a web source and none is stored in grounding yet.
