# Loop run: heldout_hardware_nl_rd_relief (heldout2)

Case: `mandate/eval/scenarios/heldout_hardware_nl_rd_relief.yaml`. Brain: Wincent. Playbooks at d81aeceff9. One-reply re-test on the bench (no API spend), 2026-11-17T08:34:19+00:00, 264.3s.
Leave-one-out case library: 0 entries derived from this case left out; reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We are a Dutch hardware scale-up in Eindhoven: optical inspection modules for semiconductor fabs. We spend heavily on R&D and want to cut its cost with public money: R&D tax relief, a development grant or loan for our next-generation module, and a public co-investor in our next round. What should we go for, in what order?
> 
> More about us, so you can answer in one go: Dutch BV founded 2018, 70 staff, revenue about EUR 9M, never claimed R&D tax relief. About 30 of our engineers are employed by our Belgian subsidiary in Leuven; the Dutch BV employs 20 engineers and the commercial team. We started the next-generation module project in September (EUR 6M over two years, about half of it external prototyping and cleanroom time). We plan to raise EUR 15M of equity in about nine months; no lead yet.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

# What to go for, and in what order

I couldn't reach our internal funding database in this session, so everything below comes from the official Dutch, Flemish and EU pages, fetched today. Anything I couldn't confirm on an official page is marked.

**The answer.** File the Dutch R&D tax relief (WBSO) for 1 January 2027 this week, and file the Belgian relief for the Leuven team at the same time. Before you spend the EUR 3M of external prototyping and cleanroom time, apply for the Dutch Innovation Credit for the Dutch part of the project and a Flemish development grant for the Leuven part. Open talks with Invest-NL and BOM now, nine months before the round, so you have public co-investors when a lead appears. The order matters because every one of these schemes covers future work only. Since September you have been running a EUR 6M project with none of them in place.

## Where you stand

**1. Dutch R&D tax relief (WBSO): open, but only for the 20 Dutch engineers.**
- WBSO only covers hours of staff on your own payroll for whom you pay Dutch wage tax [w6]. The 30 Leuven engineers are on your Belgian subsidiary's payroll, so they fall outside it (judgement).
- You can only apply for future work [w1]. The hours worked since September are lost.
- To start on 1 January 2027, file by 20 December [w1].
- Rates are 36% up to EUR 391,020 of R&D wage base, then 16% [w1].
- **Illustration:** 20 engineers × 1,400 R&D hours × EUR 40 an hour gives a base of about EUR 1.12M. That is about EUR 257k a year off wage tax (judgement). Please send me the real hours and hourly wages.
- Payments to third parties who do the research themselves don't count [w6]. Newly built equipment bought to do the R&D does count [w6]. How you contract the cleanroom time therefore decides how much of the EUR 3M qualifies.
- **What you don't know you're missing:** I believe the Dutch innovation box (a lower tax rate on profits from your own R&D) requires a WBSO approval. With no WBSO, your profits have had no access to it (unverified; confirm with your tax adviser).

**2. Belgian R&D tax relief: open for the Leuven team.**
- Belgian employers may keep 80% of the payroll tax withheld on researchers' wages (unverified: the official Flemish agency page via search, which I could not open).
- The project has to be registered with BELSPO, the federal science policy office, before it starts (unverified: Belgian payroll advisers citing the 2023 circular).
- The September start may already exclude the current project. Ask whether the next phase can be registered as a new project.
- **Illustration:** 30 researchers with about EUR 20k each in payroll tax gives roughly EUR 480k a year (judgement).

**3. Development loan or grant: two doors, one per country, split by work package.**
- **Dutch Innovation Credit (RVO):**
  - A medium-sized company gets up to 35% of project costs, capped at EUR 10M [w2].
  - Interest is 3.0% compound plus a one-off 15% surcharge [w3].
  - At least 55% of the costs must come from other money [w2].
  - **Possible blocker:** a large part of the activities must take place in the Netherlands [w3]. With 30 of your 50 engineers in Leuven, apply with the Dutch work package only.
  - **Timing link with your round:** you file with an unsigned term sheet, and the credit is only granted once the financing is final [w3].
  - I believe costs incurred before the application date don't count (unverified).
- **Flemish development project grant (VLAIO), for the Belgian subsidiary:**
  - 25% base, plus 10% for a medium-sized company (unverified: VLAIO via search).
- **EIC Accelerator (EU):**
  - A grant of up to EUR 2.5M plus EUR 1M to 10M of equity [w4].
  - Next deadlines are 20 January and 17 March 2027 [w4]. A short proposal can be sent at any time [w4].
  - Worth a probe, not the lead. It is highly competitive, and the EIC has to see your next-gen module as a breakthrough rather than the next version (judgement).

**4. Public co-investor in the EUR 15M round.**
- **Invest-NL Deep Tech Fund: lead with it.** The precedent is close: EUR 11M into Nearfield Instruments, a semiconductor metrology scale-up, alongside Innovation Industries and TNO, "to advance series production capabilities" [w5].
- **BOM:** it is owned by the province of North Brabant (unverified: search).

## Money logic
- **Tax relief:** pays for engineering wages at no dilution and no repayment. This is the cheapest money you can get.
- **Innovation Credit:** carries the risk of the development itself. It is cheap because RVO takes the technical risk.
- **Equity:** the dearest money. Keep it for scaling, not for wages the state would cover anyway.
- **Stacking:** the Dutch and Flemish grants can stack if they finance different costs. On the same cost, only up to the EU state-aid caps (unverified). The EIC grant must not cover costs already in the Innovation Credit.

## What not to do yet
- Don't sign the prototyping and cleanroom orders before the Innovation Credit and VLAIO applications are filed.
- Don't move the Leuven engineers onto the Dutch payroll just to claim WBSO. Belgium's 80% relief is the better deal for them (judgement).

**One thing for Regina:** inspection tools for chip fabs may fall under export controls and Dutch investment screening. Both could affect foreign co-investors. I'm handing that to Regina.

**What decides the case:** how are the Leuven engineers' wages charged back to the Dutch company, and who owns the IP? That settles which entity claims each relief and which country's grant covers which work.

```mandate-board
{
  "title": "Optical inspection scale-up: cutting R&D cost with public money",
  "stage": "write_up",
  "answer": {
    "lines": [
      "File WBSO for 1 Jan 2027 (by 20 Dec) and register the Leuven R&D with BELSPO now: future work only.",
      "File the Innovation Credit (Dutch work package) and VLAIO (Leuven work package) before the EUR 3M external spend.",
      "Open Invest-NL Deep Tech Fund and BOM now; the round's term sheet also unlocks the Innovation Credit."
    ],
    "confidence": "medium",
    "confidence_why": "Dutch rules cited from RVO; Belgian and Flemish rules not fetched from the official page.",
    "open_question": "How are Leuven engineers charged to the Dutch BV, and which entity owns the IP?",
    "cite": ["w1", "w3", "w5", "judgement"]
  },
  "routes": { "levels": [
    { "id": "nl", "level": "national", "label": "Netherlands", "country": "NL", "doors": [
      { "id": "wbso", "name": "WBSO wage-tax relief", "institution": "RVO", "status": "open", "why": "Future R&D hours of Dutch-payroll staff only; Leuven staff excluded.", "conditions": ["File by 20 Dec for 1 Jan 2027", "Own payroll, Dutch wage tax", "No outsourced research"], "cite": ["w1", "w6"] },
      { "id": "ik", "name": "Innovatiekrediet", "institution": "RVO", "status": "open", "why": "Up to 35% of project costs for a medium firm; large part of activities must be in NL.", "conditions": ["Min 55% other financing", "Term sheet at filing, final at grant", "3.0% interest + 15% surcharge"], "cite": ["w2", "w3"] },
      { "id": "ibox", "name": "Innovation box", "institution": "Belastingdienst", "status": "probe", "why": "Believed to need a WBSO statement; never claimed so far.", "cite": ["unverified"] }
    ] },
    { "id": "be", "level": "national", "label": "Belgium (federal)", "country": "BE", "doors": [
      { "id": "belspo", "name": "80% withholding-tax exemption for researchers", "institution": "FPS Finance / BELSPO", "status": "open", "why": "Leuven subsidiary as employer; project registered before start.", "conditions": ["Register project with BELSPO before start", "Qualifying diplomas"], "cite": ["unverified"] }
    ] },
    { "id": "vl", "level": "regional", "label": "Flanders", "country": "BE", "doors": [
      { "id": "vlaio", "name": "VLAIO development project", "institution": "VLAIO", "status": "open", "why": "Leuven work package; 25% base plus 10% medium-firm bonus.", "cite": ["unverified"] }
    ] },
    { "id": "nb", "level": "regional", "label": "Noord-Brabant", "country": "NL", "doors": [
      { "id": "bom", "name": "BOM equity co-investment", "institution": "BOM", "status": "probe", "why": "Province-owned regional investor; Eindhoven is in its patch.", "cite": ["unverified"] }
    ] },
    { "id": "eu", "level": "eu", "label": "EU", "country": "EU", "doors": [
      { "id": "eic", "name": "EIC Accelerator", "institution": "EIC / EISMEA", "status": "probe", "why": "Grant up to EUR 2.5M plus EUR 1-10M equity; competitive, needs breakthrough framing.", "conditions": ["Short proposal any time", "Full proposal 20 Jan or 17 Mar 2027"], "cite": ["w4"] }
    ] },
    { "id": "nl-eq", "level": "national", "label": "Netherlands equity", "country": "NL", "doors": [
      { "id": "dtf", "name": "Invest-NL Deep Tech Fund", "institution": "Invest-NL", "status": "open", "why": "Backed a semiconductor metrology scale-up for series production.", "cite": ["w5"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "tax", "label": "Tax relief", "steps": [
      { "id": "wbso-file", "label": "File WBSO for period from 1 Jan 2027", "start": 0, "end": 1, "owner": "client", "status": "planned", "cite": ["w1"] },
      { "id": "belspo-reg", "label": "Register Leuven R&D project with BELSPO before next phase starts", "start": 0, "end": 1, "owner": "client", "status": "planned", "cite": ["unverified"] },
      { "id": "ibox-check", "label": "Tax adviser: innovation box and IP location", "start": 1, "end": 3, "owner": "client", "status": "planned", "depends_on": ["wbso-file"], "cite": ["unverified"] }
    ] },
    { "id": "grant", "label": "Development loan and grant", "steps": [
      { "id": "ik-scan", "label": "Innovatiekrediet Quick Scan; confirm NL-activity test", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["w2", "w3"] },
      { "id": "split", "label": "Split project into NL and Flemish work packages", "start": 0, "end": 1, "owner": "us", "status": "planned", "cite": ["judgement"] },
      { "id": "hold-spend", "label": "Do not commit external prototyping before filing", "start": 0, "end": 2, "owner": "client", "status": "blocked", "cite": ["unverified"] },
      { "id": "ik-file", "label": "File Innovatiekrediet with draft term sheet", "start": 2, "end": 4, "owner": "client", "status": "planned", "depends_on": ["ik-scan", "split"], "cite": ["w3"] },
      { "id": "vlaio-file", "label": "File VLAIO development project (Leuven)", "start": 1, "end": 3, "owner": "client", "status": "planned", "depends_on": ["split"], "cite": ["unverified"] },
      { "id": "eic-short", "label": "EIC short proposal, then full on 17 Mar 2027", "start": 1, "end": 4, "owner": "client", "status": "planned", "cite": ["w4"] }
    ] },
    { "id": "round", "label": "EUR 15M round", "steps": [
      { "id": "dtf-open", "label": "First meeting Invest-NL Deep Tech Fund", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["w5"] },
      { "id": "bom-open", "label": "First meeting BOM", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["unverified"] },
      { "id": "lead", "label": "Private lead term sheet", "start": 7, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"] },
      { "id": "ik-grant", "label": "Innovatiekrediet granted on final financing", "start": 9, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["lead", "ik-file"], "cite": ["w3"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-wbso27", "label": "WBSO 2027 parameters final after Senate vote", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"] },
      { "id": "w-ik-budget", "label": "Innovatiekrediet 2027 budget and window", "start": 1.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["w2"] },
      { "id": "w-vlaio27", "label": "VLAIO new R&D project process from 1 Jan 2027", "start": 1.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-belspo", "label": "BELSPO guidelines: can a started project be split?", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-eic", "label": "EIC batch dates 20 Jan and 17 Mar 2027", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["w4"] },
      { "id": "w-bom", "label": "BOM: semiconductor scale-up precedent", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-export", "label": "Export control and investment screening (Regina)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "rvo", "name": "RVO", "side": "public-capital", "country": "NL", "units": [
      { "id": "rvo-wbso", "name": "WBSO", "roles": [
        { "id": "wbso-p1", "role": "Head of WBSO assessment", "priority": "P1", "reach": "RVO WBSO line", "status": "to_approach", "cite": ["judgement"] },
        { "id": "wbso-p2", "role": "WBSO adviser", "priority": "P2", "reach": "RVO WBSO line", "status": "to_approach", "cite": ["judgement"] }
      ] },
      { "id": "rvo-ik", "name": "Innovatiekrediet", "roles": [
        { "id": "ik-p1", "role": "Head of Innovatiekrediet", "priority": "P1", "reach": "Via the Quick Scan adviser", "status": "to_approach", "cite": ["judgement"] },
        { "id": "ik-p2", "role": "Innovatiekrediet adviser (Quick Scan)", "priority": "P2", "reach": "Quick Scan request; contact within 4 working days", "status": "to_approach", "cite": ["w2"] }
      ] }
    ] },
    { "id": "ez", "name": "Ministry of Economic Affairs", "side": "political", "country": "NL", "units": [
      { "id": "ez-inno", "name": "Innovation and semiconductors policy", "roles": [
        { "id": "ez-p1", "role": "Director for innovation policy", "priority": "P1", "reach": "Through Brainport Development", "status": "to_approach", "cite": ["judgement"] },
        { "id": "ez-p2", "role": "Policy officer semiconductors", "priority": "P2", "reach": "Through Brainport Development", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "invnl", "name": "Invest-NL", "side": "public-capital", "country": "NL", "units": [
      { "id": "dtf-u", "name": "Deep Tech Fund", "roles": [
        { "id": "dtf-p1", "role": "Head of the Deep Tech Fund", "priority": "P1", "reach": "Financing check on the website, or warm intro", "status": "to_approach", "cite": ["w5"] },
        { "id": "dtf-p2", "role": "Investment manager semiconductors", "priority": "P2", "reach": "Forwarded by the head", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "bom-i", "name": "BOM", "side": "public-capital", "country": "NL", "units": [
      { "id": "bom-u", "name": "Investments, key technologies", "roles": [
        { "id": "bom-p1", "role": "Head of investments, key technologies", "priority": "P1", "reach": "BOM contact line", "status": "to_approach", "cite": ["judgement"] },
        { "id": "bom-p2", "role": "Investment manager", "priority": "P2", "reach": "Forwarded by the head", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "nbr", "name": "Province of Noord-Brabant", "side": "political", "country": "NL", "units": [
      { "id": "nbr-u", "name": "Economy portfolio", "roles": [
        { "id": "nbr-p1", "role": "Provincial executive member for economy", "priority": "P1", "reach": "Through Brainport Development", "status": "to_approach", "cite": ["judgement"] },
        { "id": "nbr-p2", "role": "Head of economy department", "priority": "P2", "reach": "Department line", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "vlaio-i", "name": "VLAIO", "side": "public-capital", "country": "BE", "units": [
      { "id": "vlaio-u", "name": "R&D projects", "roles": [
        { "id": "vlaio-p1", "role": "Head of R&D project support", "priority": "P1", "reach": "VLAIO line", "status": "to_approach", "cite": ["judgement"] },
        { "id": "vlaio-p2", "role": "Innovation adviser", "priority": "P2", "reach": "VLAIO intake", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "flgov", "name": "Flemish Government", "side": "political", "country": "BE", "units": [
      { "id": "fl-u", "name": "Minister for economy and innovation, cabinet", "roles": [
        { "id": "fl-p1", "role": "Cabinet adviser innovation", "priority": "P1", "reach": "Cabinet secretariat", "status": "to_approach", "cite": ["judgement"] },
        { "id": "fl-p2", "role": "Leuven region economic development office", "priority": "P2", "reach": "Local intro", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "belspo-i", "name": "BELSPO", "side": "public-capital", "country": "BE", "units": [
      { "id": "belspo-u", "name": "R&D withholding tax cell", "roles": [
        { "id": "belspo-p1", "role": "Head of the fiscal R&D cell", "priority": "P1", "reach": "BELSPO fiscal page", "status": "to_approach", "cite": ["judgement"] },
        { "id": "belspo-p2", "role": "Your Belgian payroll provider", "priority": "P2", "reach": "Existing relationship", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "eic-i", "name": "EIC / EISMEA", "side": "public-capital", "country": "EU", "units": [
      { "id": "eic-u", "name": "EIC Accelerator", "roles": [
        { "id": "eic-p1", "role": "EIC programme manager for semiconductors", "priority": "P1", "reach": "EIC events", "status": "to_approach", "cite": ["judgement"] },
        { "id": "eic-p2", "role": "Dutch national contact point at RVO", "priority": "P2", "reach": "RVO", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] }
  ] },
  "funding_stack": { "currency": "EUR", "need": { "amount": 6000000, "label": "Next-gen module project, two years" },
    "instruments": [
      { "id": "f-wbso", "name": "WBSO (Dutch engineers)", "type": "grant", "amount": 400000, "amount_max": 550000, "terms": "Carries Dutch R&D wages; cheapest: no dilution, no repayment. Illustrative, two years", "status": "planned", "cite": ["w1", "judgement"] },
      { "id": "f-be", "name": "Belgian 80% researcher exemption", "type": "grant", "amount": 700000, "amount_max": 960000, "terms": "Carries Leuven wages; cheapest. Depends on BELSPO registration timing", "status": "planned", "cite": ["unverified"] },
      { "id": "f-ik", "name": "Innovatiekrediet (NL work package)", "type": "loan", "amount": 1000000, "amount_max": 1750000, "terms": "Carries development risk; 3.0% plus 15% surcharge, RVO takes the technical risk", "status": "planned", "cite": ["w2", "w3"] },
      { "id": "f-vlaio", "name": "VLAIO development grant (Leuven)", "type": "grant", "amount": 500000, "amount_max": 900000, "terms": "Carries Flemish project costs; non-dilutive, different costs from the Innovatiekrediet", "status": "planned", "cite": ["unverified"] },
      { "id": "f-eic", "name": "EIC Accelerator grant", "type": "grant", "amount_max": 2500000, "terms": "Only on costs not already aided; competitive", "status": "probe", "cite": ["w4"] },
      { "id": "f-eq", "name": "EUR 15M round with Invest-NL / BOM", "type": "public_coinvest", "amount": 15000000, "terms": "Dearest money: dilution; keep for scale-up, not for wages the state covers", "status": "planned", "cite": ["w5", "judgement"] }
    ] },
  "risks_flags": [
    { "id": "r-retro", "kind": "flag", "severity": "high", "title": "Project started in September: past work not covered", "fix": "File WBSO, BELSPO, Innovatiekrediet and VLAIO before further work and spend", "cite": ["w1", "unverified"] },
    { "id": "r-nl", "kind": "deal_breaker", "severity": "medium", "title": "Innovatiekrediet needs a large part of activities in NL", "fix": "Apply with the Dutch work package; Leuven work to VLAIO", "cite": ["w3"] },
    { "id": "r-outs", "kind": "flag", "severity": "medium", "title": "Outsourced research is excluded from WBSO", "fix": "Contract cleanroom time as services under your direction, not as research", "cite": ["w6"] },
    { "id": "r-cum", "kind": "flag", "severity": "medium", "title": "Double aid on the same costs", "fix": "One cost, one grant; map work packages before filing", "cite": ["unverified"] },
    { "id": "r-tp", "kind": "flag", "severity": "medium", "title": "Recharges and IP between BV and Belgian subsidiary", "fix": "Tax adviser to confirm before filing", "cite": ["judgement"] },
    { "id": "r-reg", "kind": "flag", "severity": "medium", "title": "Export control and investment screening", "fix": "Handed to Regina", "cite": ["judgement"] }
  ]
}
```

**Sources** (all retrieved 2026-11-17)
- [w1] [RVO, WBSO](https://www.rvo.nl/subsidies-financiering/wbso): "U kunt alléén WBSO aanvragen voor toekomstige S&O-werkzaamheden"; "Dien uw aanvraag dan uiterlijk 20 december in"; 36% first bracket, threshold EUR 391,020, 16% second bracket.
- [w2] [RVO, Innovatiekrediet](https://www.rvo.nl/subsidies-financiering/innovatiekrediet): medium-sized companies up to 35%; "€ 10 miljoen voor technische ontwikkelprojecten"; "Minimaal 55% van de projectkosten financiert u uit overige middelen."
- [w3] [RVO, Innovatiekrediet conditions](https://www.rvo.nl/subsidies-financiering/innovatiekrediet/voorwaarden): "samengestelde rente vastgesteld op 3,0%"; 15% surcharge for technical projects; "een groot deel van de activiteiten in Nederland plaatsvindt"; unsigned term sheet at filing.
- [w4] [EIC Accelerator](https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en): "Grant component up to EUR 2.5M"; "EUR 1M up to EUR 10M"; 2027 deadlines 20/01 and 17/03.
- [w5] [Invest-NL, Nearfield Instruments](https://invest-nl.nl/en/news/high-tech-scale-up-nearfield-instruments-receives-11m-from-invest-nl-deep-tech-fund): "Invest-NL commits € 11 M from it's Deep Tech Fund"; co-investors Innovation Industries and TNO; 22 May 2023.
- [w6] [RVO, WBSO conditions](https://www.rvo.nl/subsidies-financiering/wbso/voorwaarden): "medewerkers die bij u op de loonlijst staan"; "De kosten van uitbesteed onderzoek komen niet in aanmerking"; "U draagt loonheffing af".
- From search only, not opened (marked unverified above): [VLAIO researcher exemption](https://www.vlaio.be/nl/subsidies-financiering/subsidiedatabank/vrijstelling-doorstorting-bedrijfsvoorheffing-voor-onderzoekers), [Leyton BE](https://leyton.com/be/nl/vrijstelling-bedrijfsvoorheffing/), [VLAIO development project](https://www.vlaio.be/nl/subsidies-financiering/subsidiedatabank/ontwikkelingsproject), [BOM strategy 2025-2028](https://www.bom.nl/upload/pdf/BOM-Meerjarenstrategie2025-2028.pdf).

**Precedents:**
- **Invest-NL:** Nearfield Instruments [w5].
- **BOM, Innovation Credit, VLAIO, EIC:** none found for this kind of company in this run.

**Questions for you:**
1. How are the Leuven engineers' wages recharged, and where does the IP sit? This decides which entity claims each relief.
2. Is the EUR 3M external spend research done by third parties, or equipment and services under your direction? This decides whether WBSO covers it.
3. How much of the project still lies ahead, and how much is already committed? This sets the costs the Innovation Credit and VLAIO can still cover.

**Note for the owner:** the bench tools could not reach the funding database (its access setting is missing in this worktree), so this run has no database citations, only web sources.
