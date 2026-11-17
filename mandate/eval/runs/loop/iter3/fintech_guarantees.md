# Loop run: fintech_guarantees (iter3)

Case: `mandate/eval/scenarios/fintech_guarantees.yaml`. Brain: Wincent. Playbooks at 45ffa6b025. One-reply re-test on the bench (no API spend), 2026-11-17T08:24:56+00:00, 313.3s.
Leave-one-out case library: 5 entries derived from this case left out (fintech_eu_open_door, fintech_eu_product_fits_activity, fintech_research_mechanics_not_instinct, fintech_shut_door_reform, fintech_status_unlocks_market); reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We are a fintech lender. We have raised EUR 40M. We want our SME loan portfolio guaranteed by public guarantee schemes in Germany, France and Italy, and at EU level. We do not have a banking licence. What are our routes?
> 
> More about us, so you can answer in one go: We are a German GmbH with no branches yet in France or Italy. We hold no banking, payment or investment-firm licence. We originate SME loans through our platform and fund them from a EUR 150M warehouse facility; the book is EUR 120M today and we want to reach EUR 500M in three years. We are not raising equity right now.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

# Public guarantees for your SME loan book: Germany, France, Italy and EU level

## Answer

**Start at EU level.** The European Investment Fund (EIF) runs an open call to pick lenders for its InvestEU portfolio guarantees. The call is open to any lender "established and operating in any Member State" [w1], and applications are due "before 30 June 2027" [w1]. One agreement can cover your book in all three countries, and the call does not require a banking licence. What it does require is that you are "authorised to carry out [your] business under the applicable regulatory framework" [w1]. So the deciding question is **who legally makes each loan, in each country** (the "lender of record"). In Germany, making money loans as a business is licensed banking business ("Gewährung von Gelddarlehen … (Kreditgeschäft)") [w7]. I need that answered before anything else, and I am handing it to Regina.

The national levels split three ways:
- **Italy: open, with a status you can get.**
- **France: you need a status, and I could not confirm the door.**
- **Germany: closed to you as a non-bank today.** This becomes a lobby aim.

Our internal database was not reachable on this run, so every fact below comes from official pages I read today.

## Where you stand, per front

**EU (EIF InvestEU). Open; lead with it.**
- The SME Competitiveness product (the successor to COSME) fits a general SME lending book [w1].
- Applications are assessed "first come, first assessed" [w1].
- The EIF scores you on what you pass on to borrowers, such as lower pricing or collateral and new segments [w1]. Plan for that from the start.
- **Precedent:** the EIF backed Froda, "a licensed credit market company" from Sweden, with InvestEU cover for "€100 million in new lending … across the EU" (5 Feb 2025) [w2]. It is not a bank, and the cover crosses borders.

**Italy. Open, with a status.**
- Since February 2026, Italy's SME Guarantee Fund (Fondo di Garanzia PMI) covers platform loans at "80 (ottanta) per cento" [w3].
- An EU crowdfunding licence from another Member State qualifies, provided you have notified Italy under the EU crowdfunding regulation [w3]. The borrowers must have their registered or operating seat in Italy [w3].
- The second way in is to register as an Italian non-bank lender under Art. 106 of Italy's banking law (TUB). The Fund names those lenders directly as eligible to apply (unverified, from the Fund's operating rules; confirm on fondidigaranzia.it).
- **My recommendation: Art. 106 in an Italian subsidiary.** It authorises you to lend in Italy and opens the Fund directly. The crowdfunding route would mean changing your model: outside investors would have to lend through your platform instead of your warehouse funding the loans, and the crowdfunding rules limit what a platform may hold in its own offers. That is for Regina to confirm (judgement).
- **Precedent:** none found. The platform decree is nine months old.

**France. Needs a status; probe the door first.**
- Bpifrance guarantees go to "banques signataires de la convention" [w6], and are "actionnés … par les banques" [w6].
- The status that lets you lend in France is a French financing company (société de financement). I could not confirm that Bpifrance signs guarantee agreements with one (unverified). Ask Bpifrance's guarantee team before you file for anything.
- **Precedent:** none found.

**Germany. Shut for a non-bank.**
- Guarantee banks (Bürgschaftsbanken) take applications "über Ihre Hausbank oder ein anderes Kreditinstitut", meaning through your bank or another licensed credit institution [w5].
- They cover single loans, up to 80% and up to EUR 2M [w5]. They do not cover portfolios.
- If a fronting bank books your German loans, it could request cover loan by loan. That is a workaround, not your route (judgement).
- **No route today.** The lobby aim is the federal and state back-guarantee framework, which the federal government and the Länder share [w5], so that it admits licensed non-bank lenders (judgement). The clause and its renewal date are unverified.
- **Precedent:** none found.

## Why the guarantee is the cheap money here

Each source of money carries a different cost:
- **Warehouse:** carries the loans. This is senior debt (judgement).
- **Your EUR 40M equity:** carries the first loss under the warehouse. This is the dearest money you have (judgement).
- **A public guarantee:** carries part of the credit loss. That means equity has to cover less per euro of loans (judgement).

Illustration, with every figure assumed (judgement):
- Assume the warehouse advances 85% against each loan, so equity funds 15%.
- Growing from EUR 120M to EUR 500M then needs about EUR 57M of new first-loss equity on the extra EUR 380M.
- If covered loans let the senior lender advance 92%, that falls to about EUR 30M. It fits inside the EUR 40M you raised, without a new round.

Please send me your real advance rate. Whether an EIF guarantee and an Italian Fund guarantee can sit on the same loan is unverified; check it in the EIF term sheet.

## For Regina

Who is the lender of record in DE, FR and IT, and can you truthfully make the EIF's "authorised" representation for each? That decides every route above.

## What not to do yet

- Do not file for Art. 106 or a French financing company, and do not send the EIF expression of interest, until Regina has answered (judgement).
- Do not write to the CEO of KfW, Bpifrance or Mediocredito Centrale (MCC, which manages Italy's guarantee fund). Write to the head of the guarantee line instead (judgement).

## Draft to the EIF (you send; addressed to the head of InvestEU portfolio guarantees)

> Subject: InvestEU SME Competitiveness: alternative SME lender, DE/FR/IT
>
> Dear Head of Portfolio Guarantees,
>
> [Company] is a German SME lender with a EUR 120M book, backed by EUR 40M of equity, lending to SMEs that banks serve slowly or not at all. We aim to reach EUR 500M across Germany, France and Italy within three years.
>
> InvestEU's competitiveness objective and our pipeline meet in one place: small-ticket SME credit that is still mispriced. You have backed non-bank lenders crossing borders before, Froda among them.
>
> We would value 30 minutes to discuss whether an SME Competitiveness guarantee, with better terms passed on to borrowers, fits ahead of our expression of interest.
>
> Yours sincerely,
> [Name], CEO

## Questions for you

1. **Who is the lender of record today?** Your own GmbH, a fronting bank, or the warehouse vehicle? This decides the EIF representation and every national door.
2. **Your warehouse advance rate and your expected loss rate.** These turn the illustration into a real guarantee size.
3. **Which German state is your GmbH registered in?** That names your guarantee bank and state ministry for the German lobby aim.
4. **Do you plan direct lending in Italy within 12 months?** That decides whether the Art. 106 subsidiary is worth it now.

```mandate-board
{
  "title": "Fintech SME lender: public guarantees on the loan book",
  "stage": "options",
  "answer": {
    "lines": [
      "Lead with the EU: the EIF InvestEU portfolio guarantee call is open to lenders in any Member State until 30 June 2027; no banking licence named.",
      "Hinge: the EIF requires you to be authorised under the applicable framework; who is lender of record per country goes to Regina first.",
      "Italy: open with a status; an Art. 106 TUB subsidiary is recommended; the Feb 2026 decree also opens the Fund at 80% to EU crowdfunding providers.",
      "France: société de financement is the status; probe Bpifrance before filing.",
      "Germany: no portfolio route for a non-bank today; lobby aim on the counter-guarantee framework."
    ],
    "confidence": "medium",
    "confidence_why": "EU door open by applicant type; the authorisation representation is unconfirmed until Regina answers.",
    "open_question": "Who is the lender of record on each loan in DE, FR and IT?",
    "cite": ["w1", "w3", "w5", "w7", "judgement"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "eif-sme", "name": "InvestEU SME Competitiveness portfolio guarantee", "institution": "European Investment Fund",
        "status": "open", "why": "Call open to intermediaries established and operating in any Member State, first come first assessed, deadline 30 June 2027.",
        "conditions": ["Is or will be authorised under the applicable regulatory framework", "Enhanced access-to-finance measures passed to SMEs", "Expression of interest by e-mail, due diligence, approval, signature"], "cite": ["w1"] },
      { "id": "eif-securitisation", "name": "EIF credit enhancement on a securitised warehouse", "institution": "European Investment Fund",
        "status": "probe", "why": "Possible second EU door if the guarantee route stalls; not researched here.", "cite": ["unverified"] }
    ] },
    { "id": "it", "level": "national", "label": "Italy", "country": "IT", "doors": [
      { "id": "it-106", "name": "Fondo di Garanzia PMI via Art. 106 TUB intermediary", "institution": "Fondo di Garanzia PMI (MIMIT)", "via": "Italian Art. 106 subsidiary",
        "status": "probe", "why": "Art. 106 intermediaries are named eligible applicants; needs an Italian entity and Bank of Italy registration.", "cite": ["unverified"] },
      { "id": "it-ecsp", "name": "Fondo di Garanzia PMI for crowdfunding loans (DM 7 Jan 2026)", "institution": "Fondo di Garanzia PMI (MIMIT)", "via": "ECSP-authorised provider, accredited",
        "status": "probe", "why": "80% cover on loans; EU-passported providers admitted after notifying Italy; implies a model change.", "conditions": ["ECSP authorisation and Art. 18 notice for Italy", "Accreditation by the Consiglio di gestione", "Borrowers with seat in Italy"], "cite": ["w3"] }
    ] },
    { "id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
      { "id": "fr-bpi", "name": "Bpifrance loan guarantees", "institution": "Bpifrance", "via": "signatory banks under a delegation agreement",
        "status": "probe", "why": "Runs through signatory banks; whether a société de financement can sign is unconfirmed.", "cite": ["w6", "unverified"] }
    ] },
    { "id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
      { "id": "de-bb", "name": "Bürgschaftsbank default guarantees", "institution": "Land Bürgschaftsbanken (Bund and Land counter-guarantee)", "via": "Hausbank or other Kreditinstitut",
        "status": "shut", "why": "Filed through a credit institution, single loans up to 80% and EUR 2M; no portfolio door for a non-bank.", "cite": ["w5"] }
    ] },
    { "id": "lobby-de", "level": "lobby", "label": "Germany: rule change", "country": "DE", "doors": [
      { "id": "de-lobby", "name": "Admit licensed non-bank lenders to the counter-guarantee framework", "institution": "Federal economics ministry and Land ministries",
        "status": "park", "why": "No reform found moving; the lobby aim, at the framework's next renewal.", "cite": ["judgement", "unverified"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "reg", "label": "First: regulatory hinge", "steps": [
      { "id": "regina", "label": "Regina: lender of record and authorisation per country", "start": 0, "end": 0.5, "owner": "us", "status": "active", "cite": ["w1", "w7"] }
    ] },
    { "id": "eu", "label": "EU lead route", "steps": [
      { "id": "eif-probe", "label": "Probe e-mail to EIF head of portfolio guarantees", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"] },
      { "id": "eif-data", "label": "Assemble loan tape, loss history, pass-on proposal", "start": 0.5, "end": 2.5, "owner": "client", "status": "planned", "cite": ["w1"] },
      { "id": "eif-eoi", "label": "File expression of interest", "start": 3, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["regina", "eif-data"], "cite": ["w1"] },
      { "id": "eif-sign", "label": "Due diligence to signature", "start": 3, "end": 10, "owner": "institution", "status": "planned", "depends_on": ["eif-eoi"], "cite": ["w1", "judgement"] }
    ] },
    { "id": "it", "label": "Italy", "steps": [
      { "id": "it-decide", "label": "Decide Art. 106 subsidiary vs ECSP model", "start": 1, "end": 2, "owner": "client", "status": "planned", "depends_on": ["regina"], "cite": ["w3", "judgement"] },
      { "id": "it-106", "label": "Incorporate Italian SpA and file Art. 106 registration", "start": 2, "end": 12, "owner": "client", "status": "planned", "depends_on": ["it-decide"], "cite": ["unverified"] },
      { "id": "it-fund", "label": "Fondo PMI applications on Italian loans", "start": 12, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["it-106"], "cite": ["unverified"] }
    ] },
    { "id": "fr", "label": "France", "steps": [
      { "id": "fr-probe", "label": "Ask Bpifrance guarantees whether a société de financement can sign", "start": 1, "end": 2, "owner": "client", "status": "planned", "cite": ["w6"] },
      { "id": "fr-sf", "label": "NOT YET: société de financement application, only after probe and Regina", "start": 6, "end": 18, "owner": "client", "status": "blocked", "depends_on": ["fr-probe", "regina"], "cite": ["judgement"] }
    ] },
    { "id": "de", "label": "Germany", "steps": [
      { "id": "de-lobby", "label": "Brief federal ministry Mittelstand-finance unit and VDB on non-bank access", "start": 3, "end": 9, "owner": "client", "status": "planned", "cite": ["judgement"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-eif-deadline", "label": "EIF InvestEU guarantee call closes", "start": "2027-06-30", "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"] },
      { "id": "w-eif-amend", "label": "EIF call amendments (last 13 May 2026); InvestEU successor in next MFF", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["w1", "unverified"] },
      { "id": "w-it-decree", "label": "Fondo PMI operating rules for crowdfunding guarantees and first accreditations", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["w3"] },
      { "id": "w-it-budget", "label": "Fondo PMI 2027 ceilings in the budget law", "start": 1.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-de-rueck", "label": "Bund/Land counter-guarantee framework renewal: does it admit licensed non-banks?", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-fr-bpi", "label": "Bpifrance guarantee agreement terms for non-bank lenders", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "eif", "name": "European Investment Fund", "side": "public-capital", "country": "EU", "units": [
      { "id": "eif-guar", "name": "InvestEU portfolio guarantees", "roles": [
        { "id": "eif-head", "role": "Head of InvestEU portfolio guarantees", "priority": "P1", "reach": "Through the call's published e-mail address, subject naming the head", "status": "to_approach", "cite": ["w1"] },
        { "id": "eif-officer", "role": "Officer covering DACH alternative lenders", "priority": "P2", "reach": "Forwarded by the head", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "ec", "name": "European Commission, InvestEU", "side": "political", "country": "EU", "units": [
      { "id": "ec-unit", "name": "InvestEU unit (economic and financial affairs)", "roles": [
        { "id": "ec-hou", "role": "Head of unit, InvestEU SME window", "priority": "P1", "reach": "Unit contact page; after the EIF probe", "status": "to_approach", "cite": ["judgement"] },
        { "id": "mep", "role": "German MEP on ECON committee", "priority": "P2", "reach": "Constituency office", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "fondo", "name": "Fondo di Garanzia PMI", "side": "public-capital", "country": "IT", "units": [
      { "id": "fondo-gest", "name": "Gestore del Fondo and Consiglio di gestione", "roles": [
        { "id": "fondo-head", "role": "Head of the Fund at the Gestore", "priority": "P1", "reach": "Institutional site fondidigaranzia.it", "status": "to_approach", "cite": ["w3"] },
        { "id": "fondo-accr", "role": "Intermediary accreditation office", "priority": "P2", "reach": "Accreditation channel on the Fund site", "status": "to_approach", "cite": ["w3"] }
      ] }
    ] },
    { "id": "mimit", "name": "MIMIT", "side": "political", "country": "IT", "units": [
      { "id": "mimit-dg", "name": "Directorate for business incentives", "roles": [
        { "id": "mimit-dg-head", "role": "Director-general, business incentives", "priority": "P1", "reach": "Ministry switchboard; after the Gestore meeting", "status": "to_approach", "cite": ["judgement"] },
        { "id": "mimit-div", "role": "Head of division for the Fondo PMI", "priority": "P2", "reach": "Forwarded by the DG", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "bpi", "name": "Bpifrance", "side": "public-capital", "country": "FR", "units": [
      { "id": "bpi-gar", "name": "Guarantees directorate", "roles": [
        { "id": "bpi-dir", "role": "Director of guarantees and banking partnerships", "priority": "P1", "reach": "Written request via Bpifrance partner relations", "status": "to_approach", "cite": ["w6", "judgement"] },
        { "id": "bpi-part", "role": "Head of banking partner agreements", "priority": "P2", "reach": "Forwarded by the director", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "tresor", "name": "Direction générale du Trésor", "side": "political", "country": "FR", "units": [
      { "id": "tresor-fin", "name": "Business financing office", "roles": [
        { "id": "tresor-head", "role": "Head of the business financing office", "priority": "P1", "reach": "Office contact; only if Bpifrance says the agreement excludes non-banks", "status": "to_approach", "cite": ["judgement"] },
        { "id": "tresor-dep", "role": "Deputy in charge of SME credit", "priority": "P2", "reach": "Forwarded", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "bmwe", "name": "Federal Ministry for Economic Affairs", "side": "political", "country": "DE", "units": [
      { "id": "bmwe-mf", "name": "Mittelstand financing unit", "roles": [
        { "id": "bmwe-hou", "role": "Head of unit for Mittelstand finance and guarantees", "priority": "P1", "reach": "Formal letter with the lobby aim", "status": "to_approach", "cite": ["judgement"] },
        { "id": "land-min", "role": "Head of unit for guarantees at your Land economics ministry", "priority": "P2", "reach": "Land ministry; Land counter-guarantees the Bürgschaftsbank", "status": "to_approach", "cite": ["w5", "judgement"] }
      ] }
    ] },
    { "id": "bb", "name": "Bürgschaftsbank of your Land / VDB", "side": "public-capital", "country": "DE", "units": [
      { "id": "bb-mgmt", "name": "Management and the federal association", "roles": [
        { "id": "bb-md", "role": "Managing director of your Land's Bürgschaftsbank", "priority": "P1", "reach": "Direct; ask what a licensed non-bank would need", "status": "to_approach", "cite": ["judgement"] },
        { "id": "vdb", "role": "Managing director, Verband Deutscher Bürgschaftsbanken", "priority": "P2", "reach": "Association office", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] }
  ] },
  "funding_stack": { "currency": "EUR", "need": { "amount": 500000000, "label": "Loan book target in three years" },
    "instruments": [
      { "id": "warehouse", "name": "Warehouse facility", "type": "loan", "amount": 150000000, "terms": "Carries the loans as senior debt; cheaper than equity but capped by advance rate", "status": "secured", "cite": ["judgement"] },
      { "id": "equity", "name": "Equity raised", "type": "equity", "amount": 40000000, "terms": "Carries first loss and growth costs; the dearest money, so spend it on what no one else will carry", "status": "secured", "cite": ["judgement"] },
      { "id": "eif-cover", "name": "EIF InvestEU portfolio guarantee", "type": "guarantee_debt", "terms": "Carries part of credit loss on new loans; cheap because the EU budget takes risk in return for better SME terms, freeing equity per euro lent", "status": "probe", "cite": ["w1", "judgement"] },
      { "id": "it-cover", "name": "Fondo di Garanzia PMI cover on Italian loans", "type": "guarantee_debt", "terms": "Up to 80% of each loan on the crowdfunding route; cumulation with EIF cover on the same loan to confirm", "status": "planned", "cite": ["w3", "unverified"] },
      { "id": "fr-cover", "name": "Bpifrance guarantee on French loans", "type": "guarantee_debt", "terms": "Shares loss with the lender; open only if a non-bank can sign the agreement", "status": "parked", "cite": ["w6", "unverified"] }
    ] },
  "process": [
    { "id": "cover", "title": "How the EIF cover lowers your equity need", "caption": "The EIF takes part of each loss; the warehouse lender can advance more; your equity stretches further.",
      "nodes": [
        { "id": "eif", "label": "EIF (InvestEU)", "kind": "institution" },
        { "id": "you", "label": "Your lending entity", "kind": "client" },
        { "id": "wh", "label": "Warehouse lender", "kind": "bank" },
        { "id": "sme", "label": "SME borrowers", "kind": "customer" }
      ],
      "edges": [
        { "from": "eif", "to": "you", "label": "covers part of each loss", "kind": "risk" },
        { "from": "wh", "to": "you", "label": "higher advance on covered loans", "kind": "money" },
        { "from": "you", "to": "sme", "label": "loans on better terms", "kind": "money" }
      ], "cite": ["w1", "judgement"] }
  ],
  "process_maps": [
    { "id": "eif-decision", "title": "How the EIF selects a guarantee intermediary",
      "explains": "From expression of interest to signed guarantee, and where attention moves it.",
      "kind": "funding_decision", "illustrative": false,
      "actors": [
        { "id": "client", "name": "You", "side": "market" },
        { "id": "eif", "name": "EIF guarantees team", "side": "public-capital" }
      ],
      "steps": [
        { "id": "eoi", "label": "Expression of interest by e-mail before 30 June 2027", "kind": "document", "actor": "client", "cite": ["w1"] },
        { "id": "screen", "label": "Formal check and impact/quality scoring", "kind": "decision", "actor": "eif", "cite": ["w1"] },
        { "id": "dd", "label": "Due diligence on origination, risk, collections, reporting", "kind": "step", "actor": "eif", "cite": ["w1"] },
        { "id": "approve", "label": "Approval, negotiation and signature", "kind": "decision", "actor": "eif", "cite": ["w1"] }
      ],
      "flow": [ { "from": "eoi", "to": "screen" }, { "from": "screen", "to": "dd", "label": "pre-selected" }, { "from": "dd", "to": "approve" } ],
      "leverage": [
        { "id": "auth", "at": "screen", "kind": "blocker", "label": "Authorised under the applicable framework", "why": "A formal criterion; failing it rejects the whole application.", "how": "Regina confirms the lender of record per country before filing.", "side": "public-capital", "cite": ["w1"] },
        { "id": "impact", "at": "screen", "kind": "pressure_point", "label": "Impact score: what you pass on to SMEs", "why": "Low impact is rejected outright.", "how": "Commit to lower pricing or collateral and new segments in the proposal.", "side": "public-capital", "cite": ["w1"] },
        { "id": "froda", "at": "eif", "kind": "precedent", "label": "Froda: licensed non-bank credit company, EU-wide InvestEU cover", "why": "Shows the EIF covers a non-bank across borders.", "how": "Name it in the probe e-mail.", "side": "public-capital", "cite": ["w2"] },
        { "id": "fcfs", "at": "eoi", "kind": "timing_window", "label": "First come, first assessed", "why": "Earlier files meet more budget.", "how": "File in Q1 2027, not near the deadline.", "side": "public-capital", "cite": ["w1"] }
      ],
      "cite": ["w1", "w2"] }
  ],
  "risks_flags": [
    { "id": "lor", "kind": "deal_breaker", "severity": "high", "title": "Lender of record and German credit-business licensing", "fix": "Hand to Regina: confirm who lends in DE, FR, IT and whether the EIF authorisation representation holds.", "cite": ["w1", "w7"] },
    { "id": "de-shut", "kind": "deal_breaker", "severity": "medium", "title": "German guarantee banks work only through credit institutions", "fix": "Lobby aim on the counter-guarantee framework; fronting-bank cover only as a labelled workaround.", "cite": ["w5", "judgement"] },
    { "id": "it-entity", "kind": "flag", "severity": "medium", "title": "No Italian entity for Art. 106", "fix": "Incorporate an Italian SpA and file with the Bank of Italy after Regina's answer.", "cite": ["unverified"] },
    { "id": "ecsp-fit", "kind": "flag", "severity": "medium", "title": "Crowdfunding route may not fit a warehouse-funded model", "fix": "Regina to assess conflict-of-interest limits before considering it.", "cite": ["judgement"] },
    { "id": "cumul", "kind": "flag", "severity": "low", "title": "Combining EIF and national cover on one loan", "fix": "Confirm in the EIF term sheet.", "cite": ["unverified"] },
    { "id": "numbers", "kind": "flag", "severity": "low", "title": "Equity saving rests on assumed advance rates", "fix": "Send the real advance rate and loss history.", "cite": ["judgement"] }
  ]
}
```

## Sources (all retrieved 2026-11-17)

- **[w1]** EIF, *InvestEU Portfolio Guarantee Products: open call for expression of interest* (amended 13 May 2026). https://www.eif.org/InvestEU/guarantee_products_calls/main-call-expression-interest.pdf. Quotes: "established and operating in any Member State of the EU"; "is or will be authorised to carry out their business under the applicable regulatory framework"; "submit, before 30 June 2027 by e-mail"; "SME Competitiveness Portfolio Guarantee Product, the successor of COSME Loan Guarantee Facility"; "first come, first assessed"; "investeu_guarantees@eif.org".
- **[w2]** EIF press release, 5 Feb 2025. https://www.eif.org/press/all/eif-approves-extended-support-for-froda-with-eu-wide-microfinancing-guarantee-under-investeu. Quotes: "a licensed credit market company under the supervision of the Swedish Financial Supervisory Authority"; "€100 million in new lending to micro-entrepreneurs across the EU".
- **[w3]** Italian ministerial decree (MIMIT–MEF), 7 Jan 2026. Copy at https://www.dirittobancario.it/wp-content/uploads/2026/02/Decreto-MIMIT-07-gennaio-2026.pdf; the ministry's page (published 3 Feb 2026) is at https://www.mimit.gov.it/it/normativa/decreti-interministeriali/decreto-interministeriale-7-gennaio-2026-modalita-e-condizioni-di-accesso-al-fondo-di-garanzia-per-le-pmi-dei-finanziamenti-realizzati-tramite-piattaforme-di-social-lending-e-crowdfunding. Quotes: art. 3(2)(a) "80 (ottanta) per cento dell'importo dell'operazione finanziaria avente ad oggetto la concessione di "prestiti""; art. 4(2) "a fronte dell'autorizzazione concessa dalle autorità competenti di altri Stati membri"; art. 1(m) "aventi sede legale ovvero sede operativa sul territorio italiano".
- **[w5]** German federal funding database (Förderdatenbank), Bürgschaftsbank Berlin-Brandenburg. https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Berlin/buergschaft-berlin-brandenburg-kredit.html. Quotes: "Reichen Sie den Bürgschaftsantrag über Ihre Hausbank oder ein anderes Kreditinstitut Ihrer Wahl ein"; "bis zu 80 Prozent der Kreditsumme"; "bis zu EUR 2 Millionen"; "von der Bundesrepublik Deutschland und dem Land Berlin teilweise rückverbürgt".
- **[w6]** Bpifrance Création, *Garanties bancaires*. https://bpifrance-creation.fr/moment-de-vie/garanties-bancaires-quoi-sagit-il. Quotes: "Cette possibilité est offerte à toutes les banques signataires de la convention de délégation"; "actionnés la plupart du temps par les banques qui le souhaitent".
- **[w7]** German Banking Act (KWG) § 1. https://www.gesetze-im-internet.de/kredwg/__1.html. Quote: "die Gewährung von Gelddarlehen und Akzeptkrediten (Kreditgeschäft);".

There is no [w4]: that number was dropped, and the ministry's page is listed with [w3]. Claims marked unverified were seen only in search results, not on a page I fetched. This applies to the Fund's operating rules naming Art. 106 lenders; confirm those on fondidigaranzia.it.
