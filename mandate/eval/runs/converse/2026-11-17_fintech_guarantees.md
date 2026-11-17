# Simulated conversation: fintech_guarantees

Case: `mandate/eval/scenarios/fintech_guarantees.yaml`. Brain: Wincent. Playbooks at 6dc4d0f355. 2026-11-17T08:19:55+00:00. 4 turns (script 1/8; stopped: max_turns; client agent called 2x).
Leave-one-out case library: 5 entries left out (fintech_eu_open_door, fintech_eu_product_fits_activity, fintech_research_mechanics_not_instinct, fintech_shut_door_reform, fintech_status_unlocks_market).

## Turn 1: the founder (opener, script)

> Hi. We run an SME lending platform, raised 40 million. Our investors keep asking why we don't use the public guarantee schemes, Germany, France, Italy, the EU ones. We don't have a banking licence. Where do we even start?

## Turn 1: Wincent

Short answer: the public guarantee schemes can probably help you, but which ones depends on what kind of lender each scheme accepts, and that differs by level (EU, national, regional) and by country (judgement). In most of these schemes your company would not be the one receiving the guarantee. You would be the lender whose loan book the guarantee covers. So the first test is whether each scheme's rules accept a lender without a banking licence, market by market. I check that in each market's own rules. I don't assume it.

Two questions decide where we start:

1. **Where are you incorporated, where do you have entities or branches, and what licences or registrations does each one hold?** I don't only mean banking licences. Many countries have a separate authorisation for lenders that are not banks, and crowdfunding or payment licences count too. Some schemes open the door only to an applicant with a particular registration, so this tells me which doors are open, which are shut, and which a registration could open.

2. **Who funds your loans and whose name is on them?** Your own balance sheet, a debt fund or credit facility, or a partner bank that originates the loans for you? The applicant is whoever the scheme counts as "the lender", so the answer changes who would apply.

Once I have these, I'll tell you which level to start with and why.

## Turn 2: the founder (answer, if_asked+client_agent)

> German GmbH, Berlin. Nothing in France or Italy, no branches; we lend there cross-border from Germany, small volumes so far.
> 
> Our own balance sheet. The loans are in our name and funded from a 150 million warehouse facility from two credit funds, no partner bank in the middle. We're a Berlin GmbH, and the French and Italian loans go out cross-border from Germany.

## Turn 2: Wincent

I checked the EU call and the German and Italian guarantee rules. The open door is at EU level, so start there.

**EU: open.** The European Investment Fund (EIF) runs the InvestEU portfolio guarantees. Its own product page lists "alternative lenders" as eligible intermediaries, next to banks [w1]. The call is open to intermediaries established in any EU member state, which covers your Berlin GmbH [w4]. Applications are due by 30 June 2027, or earlier if the budget runs out [w1]. A Swedish SME-lending fintech, Froda, has an EIF-backed guarantee of EUR 150m covering all 27 member states [w5]. That is your precedent: one agreement could cover Germany, France and Italy together (judgement).

**Germany: shut for you today.** The German guarantee banks only guarantee loans from a credit institution, building society or insurer, and only one loan at a time, through the borrower's bank [w3]. Changing that is a lobby aim, not a route.

**Italy:** the state guarantee fund only backs loans made by banks, leasing companies and other financial intermediaries [w2]. Getting Italy's licence for non-bank lenders (the Art. 106 register) would probably open it, but that likely needs an Italian entity (unverified).

**France:** I believe Bpifrance guarantees only reach banks that sign its agreement (unverified). That is a door to probe, not to count on yet.

**Why it matters in money:** a guarantee takes credit losses off your book. That should let your two credit funds lend against more of the book, or charge less. On EUR 150m, every percentage point saved is EUR 1.5m a year (judgement).

One thing for Regina. EIF due diligence will ask how you lend from your own balance sheet without a banking licence, in all three countries. I'm handing that question to Regina now.

**Two questions:** what is your average loan size, and what volume do you plan per country next year? Those decide which EIF guarantee product fits.

```mandate-board
{
  "title": "SME lending platform: public guarantees on the loan book",
  "stage": "options",
  "answer": {
    "lines": [
      "Lead with an EIF InvestEU portfolio guarantee: it admits alternative lenders established in any member state, one agreement for DE, FR and IT.",
      "Germany's guarantee banks are shut to a non-bank lender today: a lobby aim, not a route.",
      "Italy opens with Art. 106 registration (a plan step, likely needs an Italian entity); France to probe."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type at EU level; product fit depends on ticket size and the licence position Regina is checking.",
    "open_question": "Average ticket size and planned annual volume per country?",
    "cite": ["w1", "w2", "w3", "w4", "judgement"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "eif-investeu", "name": "InvestEU portfolio guarantee (SME competitiveness / innovation-digitalisation / microfinance window)", "institution": "European Investment Fund", "status": "open",
        "why": "Alternative lenders listed as eligible intermediaries; call open to intermediaries established in a member state; deadline 30 June 2027 or earlier if budget runs out.",
        "conditions": ["Expression of interest (Annex I)", "Screening, due diligence, approval, signature", "Regulatory standing in each lending market (Regina)"], "cite": ["w1", "w4"] }
    ] },
    { "id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
      { "id": "de-bb", "name": "Bürgschaftsbank guarantees (ABB-Kredit)", "institution": "German guarantee banks (Bund and Land counter-guaranteed)", "via": "Hausbank only",
        "status": "shut", "why": "Lender must be a Kreditinstitut, Bausparkasse or Versicherungsunternehmen; single-loan, via the borrower's bank.", "cite": ["w3"] },
      { "id": "de-kfw", "name": "KfW / Land promotional bank portfolio cover", "institution": "KfW and Land banks", "status": "park", "why": "Not yet checked for non-bank lenders.", "cite": ["unverified"] }
    ] },
    { "id": "it", "level": "national", "label": "Italy", "country": "IT", "doors": [
      { "id": "it-fdg", "name": "Fondo di Garanzia per le PMI", "institution": "MIMIT", "via": "banks, leasing companies, financial intermediaries",
        "status": "probe", "why": "Opens to registered financial intermediaries; Art. 106 registration is the status to obtain, likely via an Italian entity.", "cite": ["w2", "unverified"] }
    ] },
    { "id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
      { "id": "fr-bpi", "name": "Bpifrance guarantee on SME loans", "institution": "Bpifrance", "via": "banks signing Bpifrance's convention",
        "status": "probe", "why": "Believed bank-only; whether a non-bank or cross-border lender can sign is to confirm.", "cite": ["unverified"] }
    ] },
    { "id": "lobby", "level": "lobby", "label": "Lobby aim", "doors": [
      { "id": "de-abb-clause", "name": "ABB-Kredit 1(4): admit regulated non-bank lenders as Kreditgeber", "institution": "German guarantee banks' association; federal economy ministry as counter-guarantor", "status": "park",
        "why": "No route today; the uniform terms define the lender as bank, building society or insurer.", "cite": ["w3", "judgement"] }
    ] }
  ] },
  "funding_stack": { "instruments": [
    { "id": "warehouse", "name": "Warehouse facility, two credit funds", "type": "loan", "amount": 150000000, "status": "secured",
      "terms": "Funds the loan book; dear because the funds price unshared credit risk on SME loans.", "cite": ["judgement"] },
    { "id": "eif-g", "name": "EIF InvestEU portfolio guarantee", "type": "guarantee_debt", "status": "probe",
      "terms": "Adds no cash; carries part of the credit loss on new loans, so the warehouse can advance more or price lower. Each point saved on 150m is about 1.5m a year. Benefit pass-through to SMEs to confirm in the product annex.", "cite": ["w1", "judgement", "unverified"] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "eif", "name": "European Investment Fund", "side": "public-capital", "country": "EU", "units": [
      { "id": "eif-g-unit", "name": "Guarantees, InvestEU portfolio products", "roles": [
        { "id": "eif-head", "role": "Head of guarantees for alternative lending / InvestEU portfolio guarantees", "priority": "P1", "reach": "Via the call's application channel on the EIF calls page", "status": "to_approach", "cite": ["w4", "judgement"] },
        { "id": "eif-officer", "role": "Guarantee officer covering Germany / DACH", "priority": "P2", "reach": "Forwarded by P1 or via the call inbox", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "ec", "name": "European Commission (InvestEU)", "side": "political", "country": "EU", "units": [
      { "id": "ec-unit", "name": "InvestEU unit, DG ECFIN", "roles": [
        { "id": "ec-hou", "role": "Head of unit for InvestEU SME window", "priority": "P1", "reach": "Policy meeting, framed on capital-markets integration and SME access to finance", "status": "to_approach", "cite": ["w4", "judgement"] },
        { "id": "ec-desk", "role": "Policy officer, financial intermediaries", "priority": "P2", "reach": "Forwarded by P1", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "vdb", "name": "German guarantee banks and their association", "side": "public-capital", "country": "DE", "units": [
      { "id": "vdb-unit", "name": "Association management / uniform ABB terms", "roles": [
        { "id": "vdb-md", "role": "Managing director of the association", "priority": "P1", "reach": "Lobby meeting, later", "status": "to_approach", "cite": ["judgement"] },
        { "id": "bb-be", "role": "Managing director, Bürgschaftsbank Berlin (home market)", "priority": "P2", "reach": "Published contact line", "status": "to_approach", "cite": ["w3"] }
      ] }
    ] },
    { "id": "de-min", "name": "Federal economy ministry (counter-guarantor)", "side": "political", "country": "DE", "units": [
      { "id": "de-min-unit", "name": "SME finance unit", "roles": [
        { "id": "de-min-hou", "role": "Head of unit, Mittelstand finance", "priority": "P1", "reach": "After EIF signing, as proof the risk is bankable", "status": "to_approach", "cite": ["w3", "judgement"] },
        { "id": "de-mdb", "role": "Bundestag economy committee member, Berlin constituency", "priority": "P2", "reach": "Constituency office", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "it-fdg-inst", "name": "Italian SME guarantee fund", "side": "public-capital", "country": "IT", "units": [
      { "id": "it-unit", "name": "Fund manager / MIMIT directorate for incentives", "roles": [
        { "id": "it-p1", "role": "Head of the fund's operations at the fund manager", "priority": "P1", "reach": "After the Italy entity decision", "status": "to_approach", "cite": ["w2", "unverified"] },
        { "id": "it-p2", "role": "MIMIT official responsible for the fund", "priority": "P2", "reach": "Political channel, later", "status": "to_approach", "cite": ["w2", "judgement"] }
      ] }
    ] },
    { "id": "bpi", "name": "Bpifrance", "side": "public-capital", "country": "FR", "units": [
      { "id": "bpi-unit", "name": "Guarantee partnerships", "roles": [
        { "id": "bpi-p1", "role": "Head of guarantee partnerships with lenders", "priority": "P1", "reach": "Short probe message", "status": "to_approach", "cite": ["unverified"] },
        { "id": "bpi-p2", "role": "Ministry of finance (Trésor) unit for SME financing", "priority": "P2", "reach": "Political, only if Bpifrance signals openness", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "lead", "label": "EIF guarantee", "steps": [
      { "id": "facts", "label": "Ticket size, volumes per country, loss history", "start": 0, "end": 0.5, "owner": "client", "status": "active", "cite": ["judgement"] },
      { "id": "reg", "label": "Regina: licence position in DE, FR, IT", "start": 0, "end": 1, "owner": "us", "status": "active", "cite": ["judgement"] },
      { "id": "probe", "label": "Probe EIF guarantee team on product fit", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "depends_on": ["facts"], "cite": ["w4"] },
      { "id": "eoi", "label": "File expression of interest", "start": 1.5, "end": 3, "owner": "client", "status": "planned", "depends_on": ["reg", "probe"], "cite": ["w4"] },
      { "id": "dd", "label": "EIF screening and due diligence", "start": 3, "end": 9, "owner": "institution", "status": "planned", "depends_on": ["eoi"], "cite": ["w4"] }
    ] },
    { "id": "national", "label": "National doors", "steps": [
      { "id": "bpi-probe", "label": "Low-effort probe to Bpifrance guarantees", "start": 1, "end": 2, "owner": "client", "status": "planned", "cite": ["unverified"] },
      { "id": "it-106", "label": "Italy Art. 106 decision: not yet, after EIF and volumes justify an Italian entity", "start": 6, "end": 9, "owner": "client", "status": "blocked", "cite": ["judgement"] },
      { "id": "de-lobby", "label": "German ABB lobby: not yet, use EIF signing as proof", "start": 9, "end": 12, "owner": "us", "status": "blocked", "cite": ["judgement"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-eif", "label": "EIF call deadline or earlier close on budget", "start": "2027-06-30", "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"] },
      { "id": "w-abb", "label": "Next revision of uniform ABB-Kredit (lender definition)", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["w3", "unverified"] },
      { "id": "w-fdg", "label": "Italian fund operating rules: eligible lenders", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["w2", "unverified"] },
      { "id": "w-bpi", "label": "Bpifrance guarantee convention terms for non-banks", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] }
    ] }
  ] },
  "process_maps": [
    { "id": "eif-process", "title": "How an EIF portfolio guarantee is won", "explains": "eif-investeu", "illustrative": false,
      "flow": { "nodes": [
        { "id": "n-eoi", "label": "Expression of interest (Annex I)", "kind": "client" },
        { "id": "n-screen", "label": "Screening (pre-selection)", "kind": "institution" },
        { "id": "n-dd", "label": "Due diligence incl. UBO and integrity checks", "kind": "institution" },
        { "id": "n-approve", "label": "Approval", "kind": "institution" },
        { "id": "n-sign", "label": "Negotiation and signature", "kind": "institution" }
      ], "edges": [
        { "from": "n-eoi", "to": "n-screen", "kind": "info" },
        { "from": "n-screen", "to": "n-dd", "kind": "info" },
        { "from": "n-dd", "to": "n-approve", "kind": "info" },
        { "from": "n-approve", "to": "n-sign", "kind": "info" }
      ] },
      "leverage": [
        { "at": "n-screen", "kind": "precedent", "label": "Froda: SME-lending fintech with EUR 150m EIF-backed guarantee across EU-27", "why": "Proves EIF guarantees non-bank SME lenders cross-border", "how": "Cite it in the expression of interest", "side": "public-capital", "cite": ["w5"] },
        { "at": "n-dd", "kind": "blocker", "label": "Regulatory standing of balance-sheet lending without a banking licence", "why": "Due diligence will test it per market", "how": "Regina's opinion before filing", "side": "market", "cite": ["w4", "judgement"] },
        { "at": "n-eoi", "kind": "timing_window", "label": "Call closes 30 June 2027 or earlier if budget runs out", "why": "Budget-limited", "how": "File in Q1 2027", "side": "public-capital", "cite": ["w1"] }
      ] }
  ],
  "risks_flags": [
    { "id": "r-licence", "kind": "deal_breaker", "severity": "high", "label": "Lending from own balance sheet without a banking licence, in DE, FR and IT", "fix": "Handed to Regina for the per-market assessment before any filing", "cite": ["judgement"] },
    { "id": "r-de-shut", "kind": "flag", "severity": "medium", "label": "German guarantee banks admit only banks, building societies, insurers as lender", "fix": "No route today; lobby aim after EIF signing", "cite": ["w3"] },
    { "id": "r-it-entity", "kind": "flag", "severity": "medium", "label": "Italian fund needs a registered intermediary; you have no Italian entity", "fix": "Art. 106 registration as a later plan step, if Italian volume justifies it", "cite": ["w2", "unverified"] },
    { "id": "r-passthrough", "kind": "flag", "severity": "low", "label": "Guarantee benefit may have to be passed to SME borrowers", "fix": "Check the product annex; model pricing before filing", "cite": ["unverified"] }
  ]
}
```

**Sources**
- [w1] EIF, InvestEU guarantee product page, https://www.eif.org/guarantee-products/all/investeu-competitiveness-uncapped-guarantee (retrieved 2026-11-17): lists "Alternative lenders" among eligible intermediaries; deadline 30 June 2027, earlier if budgetary resources run out.
- [w2] MIMIT, Fondo di garanzia per le PMI, https://www.mimit.gov.it/it/incentivi/fondo-di-garanzia-per-le-pmi (2026-11-17): "La garanzia può essere attivata esclusivamente a fronte di finanziamenti concessi da:" banks, leasing companies, financial intermediaries; "Il Fondo non interviene direttamente nel rapporto tra banca e cliente."
- [w3] Bürgschaftsbank Berlin, ABB-Kredit (1 Oct 2023), https://be.ermoeglicher.de/media/documents/Allgemeine_Buergschaftsbestimmungen_Kredit_01.10.2023.pdf (2026-11-17): "„Kreditgeber" (Kreditinstitut, Bausparkasse, Versicherungsunternehmen…)"; "Diese Bürgschaften sind anteilig von Bund und Land rückverbürgt."
- [w4] EIF, InvestEU Portfolio Guarantee Products, open call (amended 13 May 2026), https://www.eif.org/InvestEU/guarantee_products_calls/main-call-expression-interest.pdf (2026-11-17): "This Call is addressed to potential Financial Intermediaries established and operating in any Member State of the EU".
- [w5] FinTech Global, 7 Feb 2025, https://fintech.global/2025/02/07/froda-secures-e150m-eif-backed-guarantee-to-expand-sme-financing-across-europe/ (2026-11-17): "Froda, a FinTech specialising in SME financing"; "bringing the total financing support to €150m"; "across all 27 EU member states."

## Turn 3: the founder (answer, if_asked)

> We fund from a 150 million warehouse facility, two credit funds. The book is about 120 million now, we want 500 in three years. Roughly 70 percent Germany, 20 Italy, 10 France.

## Turn 3: Wincent

I've gone through the EU guarantee terms and the EIF's list of the lenders it already backs. Here is what changes with your numbers.

**The EIF guarantee fits your growth plan.** You want to grow from EUR 120m to 500m, which means about EUR 380m of new loans over three years. The SME guarantee covers up to 80% of each loan. Total payouts are capped at 25% of the guaranteed portfolio, and the fee is 0.2% a year [w6].

Here is an illustration, assuming 50% cover and a 15% cap: the EIF would carry up to about EUR 28m of losses, for a fee of roughly EUR 0.4m a year (judgement; the real terms are set in negotiation). If that lets your credit funds cut their margin by one point on EUR 500m, you save EUR 5m a year (judgement).

**The precedents are better than I expected.** The EIF already guarantees lenders that are not banks. In France it backs private-credit managers such as Eiffel Investment Group (EUR 25m) and Sienna AM (EUR 60m). In Germany it backs Deutsche Leasing and a fintech, Lendorse [w7]. A lender funded by credit funds is not a first for the EIF.

**Two new doors:**
- **Your two credit funds may be able to apply themselves.** The EIF backs credit funds directly [w7]. Ask them whether either one already has an EIF guarantee or is applying for one. Even so, a guarantee in your own name is the better route: it stays with you if you change funders (judgement).
- **Germany's door is shut, but your argument there just got stronger.** Bürgschaftsbank Baden-Württemberg, Investitionsbank Berlin and other German promotional banks already hold EIF counter-guarantees [w7]. Germany is 70% of your book, so a signed EIF guarantee is your best evidence for asking them to accept lenders that are not banks.

Regina is still checking your licence position. Two questions: what is your average loan size, and who are the two credit funds?

```mandate-board
{
  "stage": "options",
  "answer": {
    "lines": [
      "Lead with an EIF InvestEU SME guarantee in the GmbH's own name, sized on ~EUR 380m of new lending to 2029.",
      "EIF already backs non-bank lenders and credit funds in DE and FR: not first-of-a-kind.",
      "Germany (70% of the book): national guarantee banks shut to you today; use the EIF signing to lobby them, since they already take EIF counter-guarantees.",
      "Italy (20%): Art. 106 status is the later step; France (10%): covered by the EIF route, no separate push."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type with precedents; terms depend on ticket size, loss history and Regina's licence read.",
    "open_question": "Average ticket size, and which two credit funds fund the warehouse?",
    "cite": ["w1", "w4", "w6", "w7", "judgement"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "eif-investeu", "name": "InvestEU SME Competitiveness portfolio guarantee (direct)", "institution": "European Investment Fund", "status": "open",
        "why": "Alternative lenders eligible; up to 80% per loan, cap up to 25%, fee 0.2% p.a., loans up to EUR 8.25m; non-bank precedents in DE and FR.",
        "conditions": ["Expression of interest", "Due diligence incl. regulatory standing", "Deadline 30 June 2027 or earlier"], "cite": ["w1", "w4", "w6", "w7"] },
      { "id": "eif-via-funds", "name": "Guarantee held by the warehouse credit funds", "institution": "EIF via the two credit funds", "via": "your funders", "status": "probe",
        "why": "EIF backs private-credit managers directly; check whether yours hold or seek cover. Second-best: tied to those funders.", "cite": ["w7", "judgement"] }
    ] },
    { "id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
      { "id": "de-bb", "name": "Bürgschaftsbank guarantees (ABB-Kredit)", "institution": "German guarantee banks", "via": "Hausbank only",
        "status": "shut", "why": "Lender must be bank, building society or insurer.", "cite": ["w3"] }
    ] },
    { "id": "de-be", "level": "regional", "label": "Berlin", "country": "DE", "doors": [
      { "id": "ibb", "name": "Investitionsbank Berlin SME programmes (EIF counter-guaranteed)", "institution": "Investitionsbank Berlin", "status": "probe",
        "why": "Home-Land promotional bank already holds EIF counter-guarantees; whether it works with a non-bank lender is to confirm.", "cite": ["w7", "unverified"] }
    ] },
    { "id": "it", "level": "national", "label": "Italy", "country": "IT", "doors": [
      { "id": "it-fdg", "name": "Fondo di Garanzia per le PMI", "institution": "MIMIT", "via": "banks, leasing companies, financial intermediaries", "status": "park",
        "why": "Needs a registered intermediary; Italy is ~EUR 100m of the 2029 book: revisit once the EIF route is signed.", "cite": ["w2", "judgement"] }
    ] },
    { "id": "lobby", "level": "lobby", "label": "Lobby aim", "doors": [
      { "id": "de-abb-clause", "name": "ABB-Kredit 1(4): admit regulated non-bank lenders", "institution": "German guarantee banks' association; federal and Land counter-guarantors", "status": "park",
        "why": "No route today; the system already draws EIF counter-guarantees, so an EIF-backed non-bank is a credible ask.", "cite": ["w3", "w7", "judgement"] }
    ] }
  ] },
  "funding_stack": { "instruments": [
    { "id": "warehouse", "name": "Warehouse facility, two credit funds", "type": "loan", "amount": 150000000, "status": "secured",
      "terms": "Funds the book; dear because funds price all SME credit risk alone; must grow toward ~EUR 500m.", "cite": ["judgement"] },
    { "id": "eif-g", "name": "EIF InvestEU SME guarantee", "type": "guarantee_debt", "status": "probe",
      "terms": "Adds no cash; carries part of the credit loss on new loans for 0.2% p.a. Cheap risk transfer: illustrative 50% cover, 15% cap on EUR 380m new loans = up to ~EUR 28m losses covered; 1 point lower warehouse margin on EUR 500m = EUR 5m a year.", "cite": ["w6", "judgement"] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "credit-funds", "name": "Your two warehouse credit funds", "side": "market", "country": "EU", "units": [
      { "id": "cf-unit", "name": "Portfolio management", "roles": [
        { "id": "cf-pm", "role": "Partner responsible for your facility", "priority": "P1", "reach": "Existing relationship", "status": "engaged", "cite": ["judgement"] },
        { "id": "cf-struct", "role": "Structuring lead (advance rate, pricing)", "priority": "P2", "reach": "Via P1", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "ibb-inst", "name": "Investitionsbank Berlin", "side": "public-capital", "country": "DE", "units": [
      { "id": "ibb-unit", "name": "SME finance / guarantees", "roles": [
        { "id": "ibb-p1", "role": "Head of SME financing", "priority": "P1", "reach": "Short probe, home-Land angle", "status": "to_approach", "cite": ["judgement"] },
        { "id": "ibb-pol", "role": "Berlin Senate economics department, SME finance", "priority": "P2", "reach": "Political, after EIF progress", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "lead", "label": "EIF guarantee", "steps": [
      { "id": "funds-ask", "label": "Ask both credit funds about their EIF cover and how a guarantee would move advance rate and margin", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["w7", "judgement"] },
      { "id": "loss-pack", "label": "Loss history, ticket sizes, 3-year origination plan per country", "start": 0, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"] }
    ] },
    { "id": "national", "label": "National doors", "steps": [
      { "id": "ibb-probe", "label": "Probe Investitionsbank Berlin", "start": 1, "end": 2, "owner": "client", "status": "planned", "cite": ["w7", "unverified"] },
      { "id": "bpi-probe", "label": "Bpifrance probe: dropped for now, France covered by the EIF route", "start": 1, "end": 2, "owner": "client", "status": "blocked", "cite": ["judgement"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-eif-terms", "label": "SME guarantee term sheet (Annex IV(a)): pass-through and new-loans-only conditions", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["w6", "unverified"] },
      { "id": "w-eif-list", "label": "Next EIF intermediary list: new non-bank signings in DE and IT", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["w7"] }
    ] }
  ] },
  "risks_flags": [
    { "id": "r-warehouse", "kind": "flag", "severity": "medium", "label": "Warehouse EUR 150m vs EUR 500m book target: funding must scale alongside", "fix": "Use the EIF guarantee in the warehouse upsizing talks", "cite": ["judgement"] },
    { "id": "r-passthrough", "kind": "flag", "severity": "low", "label": "Product page lists reduced cost and collateral as borrower benefits; whether pass-through is mandatory", "fix": "Check Annex IV(a) before modelling pricing", "cite": ["w6", "unverified"] }
  ]
}
```

**New sources**
- [w6] EIF, InvestEU SME competitiveness capped guarantee, https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee (2026-11-17): "Alternative lenders"; max guarantee rate "< 80%"; max cap rate "< 25%"; guarantee fee "0.2% p.a."; maximum debt principal "€8.25m"; benefits "Reduced cost of financing", "Reduced collateral requirements".
- [w7] EIF, InvestEU Portfolio Guarantees, List of Financial Intermediaries as of 31/12/2025, https://eif.org/files/calls/ieu-debt-visibility-report-financial-intermediaries.pdf (2026-11-17), rows: "France, Eiffel Investment Group SAS, EIF Innovation and Digitalisation Guarantee, Direct Guarantee, 25,000,000"; "France, Sienna AM France, EIF Sustainability Guarantee SMEW, Direct Guarantee, 60,000,000"; "Germany, Lendorse UG (haftungsbeschränkt), Microfinance, Social and Skills Guarantee – Skills & Education, Direct Guarantee, 2,000,000"; "Germany, Deutsche Leasing Finance GmbH, EIF SME Competitiveness Guarantee, Direct Guarantee, 8,000,000"; "Germany, Bürgschaftsbank Baden-Württemberg, EIF SME Competitiveness Guarantee, Counter Guarantee, 21,000,000"; "Germany, Investitionsbank Berlin, EIF Innovation and Digitalisation Guarantee, Counter Guarantee, 15,680,000".

## Turn 4: the founder (answer, if_asked)

> Average 250k, two to five years, working capital and equipment. Borrowers are SMEs with 10 to 200 people.

## Turn 4: Wincent

With that profile, the EIF's SME guarantee fits you best.

**Why that product.** Your average loan is EUR 250k and the product goes up to EUR 8.25m [w6]. Your borrowers have 10 to 200 staff, so they fall under the EU's definition of an SME: fewer than 250 staff, plus a turnover or balance-sheet limit (unverified; the Commission's SME definition settles it). Working-capital and equipment loans of two to five years are standard for this kind of guarantee (judgement).

Two other EIF windows are worth knowing about. The sustainability guarantee could cover the equipment loans that are green. The innovation guarantee could cover borrowers that qualify as innovative (judgement). The microfinance window is not for you: your borrowers are bigger than the businesses it targets (judgement).

**What it means for your equity.** EUR 380m of new lending at EUR 250k is about 1,500 loans over three years. It also means a warehouse more than three times today's size. Suppose a guarantee lets your credit funds lend 5 points more against the book. At EUR 500m, that frees about EUR 25m of your own equity, more than half of what you have raised (judgement; illustrative). That makes it an argument for your investors as much as a cost saving.

**One thing to check before you price anything.** The guarantee is a benefit, and it may have to be passed on to your borrowers through lower rates or less collateral. Under EU state-aid rules, that benefit may also count against each borrower's own aid limits (unverified). That would affect your loan documents, so I'll confirm it from the EIF's detailed product terms.

**Decision:** do you want the guarantee in your own name (my recommendation), or would you rather first find out whether your credit funds can bring it in? And can you share the names of the two funds?

```mandate-board
{
  "stage": "options",
  "answer": {
    "lines": [
      "Apply for the EIF InvestEU SME Competitiveness guarantee in the GmbH's own name: 250k tickets, 2-5 year working capital and equipment, SMEs of 10-200 staff fit it.",
      "Illustrative: 5 points more advance rate on a EUR 500m book frees ~EUR 25m of own equity.",
      "Germany's guarantee banks stay a lobby aim; Italy's Art. 106 a later step; France covered by the EIF route."
    ],
    "confidence": "medium",
    "confidence_why": "Product fits on size and borrower; pass-through and state-aid terms still to read; licence read with Regina.",
    "open_question": "Own-name guarantee, or test the credit funds' route first? Which funds?",
    "cite": ["w6", "w7", "judgement"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "eif-investeu", "name": "InvestEU SME Competitiveness portfolio guarantee (direct)", "institution": "European Investment Fund", "status": "open",
        "why": "Fits: 250k average vs EUR 8.25m ceiling; SME borrowers; alternative lenders eligible; non-bank precedents.",
        "conditions": ["Expression of interest", "Due diligence incl. regulatory standing", "Deadline 30 June 2027 or earlier", "Pass-through and aid treatment per term sheet"], "cite": ["w1", "w4", "w6", "w7"] },
      { "id": "eif-sust", "name": "InvestEU Sustainability guarantee (green equipment share)", "institution": "European Investment Fund", "status": "probe",
        "why": "Could cover the green part of equipment lending, as an add-on.", "cite": ["w7", "judgement"] },
      { "id": "eif-innov", "name": "InvestEU Innovation and Digitalisation guarantee", "institution": "European Investment Fund", "status": "park",
        "why": "Only for borrowers that qualify as innovative or digitalising; check the book's share.", "cite": ["judgement"] },
      { "id": "eif-micro", "name": "InvestEU Microfinance guarantee", "institution": "European Investment Fund", "status": "shut",
        "why": "Your borrowers (10-200 staff, 250k tickets) are beyond micro-enterprise lending.", "cite": ["judgement"] }
    ] }
  ] },
  "funding_stack": { "instruments": [
    { "id": "eif-g", "name": "EIF InvestEU SME guarantee", "type": "guarantee_debt", "status": "probe",
      "terms": "Adds no cash; carries part of credit loss for 0.2% p.a. on ~1,500 new loans. Cheap because EU budget takes first risk; pays back through higher advance rate (5 points on 500m = ~EUR 25m equity freed) or lower margin. Pass-through to borrowers to confirm.", "cite": ["w6", "judgement", "unverified"] },
    { "id": "equity", "name": "Your EUR 40m equity", "type": "equity", "amount": 40000000, "status": "secured",
      "terms": "Dearest money: funds the first-loss slice under the warehouse; the guarantee is how it stretches to a EUR 500m book.", "cite": ["judgement"] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "lead", "label": "EIF guarantee", "steps": [
      { "id": "decide", "label": "Decide: own-name guarantee vs funds' route", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"] },
      { "id": "termsheet", "label": "Read SME guarantee term sheet: pass-through, aid treatment, new loans only", "start": 0, "end": 0.5, "owner": "us", "status": "active", "cite": ["w6"] },
      { "id": "loss-pack", "label": "Loss history, ticket sizes, 3-year origination plan per country", "start": 0, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"] },
      { "id": "eoi", "label": "File expression of interest", "start": 1.5, "end": 3, "owner": "client", "status": "planned", "depends_on": ["decide", "termsheet", "loss-pack", "reg"], "cite": ["w4"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-aid", "label": "Borrower-level state-aid treatment of the guarantee benefit", "start": 0.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] }
    ] }
  ] },
  "risks_flags": [
    { "id": "r-aid", "kind": "flag", "severity": "medium", "label": "Guarantee benefit may count as aid to each borrower", "fix": "Confirm in the term sheet; add the borrower declaration to loan documents if needed", "cite": ["unverified"] },
    { "id": "r-sme-def", "kind": "flag", "severity": "low", "label": "Borrowers must meet the EU SME test (staff plus turnover or balance sheet)", "fix": "Add the SME check to underwriting", "cite": ["unverified"] }
  ]
}
```
