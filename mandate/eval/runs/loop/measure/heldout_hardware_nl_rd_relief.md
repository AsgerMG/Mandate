# Loop run: heldout_hardware_nl_rd_relief (measure)

Case: `mandate/eval/scenarios/heldout_hardware_nl_rd_relief.yaml`. Brain: Wincent. Playbooks at 15139db26a. One-reply re-test on the bench (no API spend), 2026-11-16T09:37:55+00:00, 302.5s.
Leave-one-out case library: 0 entries derived from this case left out; reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We are a Dutch hardware scale-up in Eindhoven: optical inspection modules for semiconductor fabs. We spend heavily on R&D and want to cut its cost with public money: R&D tax relief, a development grant or loan for our next-generation module, and a public co-investor in our next round. What should we go for, in what order?
> 
> More about us, so you can answer in one go: Dutch BV founded 2018, 70 staff, revenue about EUR 9M, never claimed R&D tax relief. About 30 of our engineers are employed by our Belgian subsidiary in Leuven; the Dutch BV employs 20 engineers and the commercial team. We started the next-generation module project in September (EUR 6M over two years, about half of it external prototyping and cleanroom time). We plan to raise EUR 15M of equity in about nine months; no lead yet.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

I'd go in this order: WBSO filed by 20 December, the Belgian researcher relief set up now, grants for a next phase that has not started yet, then a private lead for the round with public co-investors alongside. Two facts drive it. Grants pay only for work you apply for before it starts, and your September start already uses that up for this project as you've defined it. And two thirds of your engineers sit in Belgium, where the Dutch relief cannot reach them.

**1. WBSO first. This is the deadline that matters.** WBSO only covers work that hasn't happened yet. For a 1 January 2027 start you must apply by 20 December [w1][w2]. The 2026 rates are 36% on the first €391,020 of the R&D base and 16% above it [w1]. You are probably not a "starter" any more, eight years in (unverified). WBSO counts only staff on the BV's own Dutch payroll [w2]. That means the 20 Dutch engineers, not the 30 in Leuven.
- **Rough size**, assuming 20 engineers × 1,500 R&D hours × €45 an hour, plus about €1.2M a year of prototyping and cleanroom bought by the BV under the actual-costs option [w2]: roughly **€0.49M a year**. On wages alone it is about €0.29M (judgement, from these assumptions). Please send me the real hours and the split of who pays for the cleanroom time.
- A tax relief counts as having an "incentive effect" if the scheme was in force before the work started [w3]. So relief on future periods is unaffected by the September start.

**2. Leuven: Belgium's own relief, possibly the bigger one.** Belgium lets employers keep 80% of the payroll tax withheld on researchers with a master's or doctorate (unverified: I couldn't open the official page; confirm on [VLAIO](https://www.vlaio.be/nl/subsidies-financiering/subsidiedatabank/vrijstelling-doorstorting-bedrijfsvoorheffing-voor-onderzoekers) and the BELSPO guidelines). As an illustration, 30 researchers at about €25k of withheld tax each would give around **€0.6M a year** (judgement). Never apply the Dutch rules to the Belgian side.

**3. The grant: the September start is the catch.** Under the EU block exemption, a grant counts only if the written application was filed before work on the project starts [w3]. The fix is to define a clearly separate next phase (for example fab pilot integration or the year-2 build) and apply before it starts (judgement; confirm with each agency first). **Don't sign the next phase's cleanroom or prototyping orders before you have applied.**
- **Leuven share, VLAIO development project:** 25% base, +10% for a medium-sized company, +10% for collaboration, capped at 50%. Applications are open all year, with an 18-week legal processing time [w6].
- **Dutch share, RVO Innovatiekrediet:** a repayable credit covering up to 35% of costs for a medium company working alone. Ceiling €10M per technical project [w5]. Interest is 3.0% compound, plus a one-off 15% surcharge [w4].
  - **Rough size:** about €1.2M on a €3.5M not-yet-started Dutch phase (judgement).
  - **Two conditions to check:** a large share of the activity must take place in the Netherlands [w4], and the credit is granted only once the financing of both project and company is complete [w4]. That ties it to the round's close.
- **EU, EIC Accelerator:** open to SMEs at technology readiness levels 6 to 8 [c1][c4]. A grant up to €2.5M plus optional EIC Fund equity (unverified). A short proposal can go in at any time; the 2027 full-proposal dates are not yet official [w7]. A high score that doesn't win still earns a Seal of Excellence for use elsewhere [c5].

**4. The round: public co-investors follow a private lead.** For €15M you need a private lead. Public money then matches it (judgement). The candidates:
- **BOM, the Brabant regional investor:** fits your Eindhoven base. Press reports a €3M investment in the chip company SemiBlocks, and BOM investing alongside Invest-NL in a round led by Innovation Industries (unverified, press: [ioplus](https://ioplus.nl/archive/nl/semiblocks-bouwt-met-e3-miljoen-steun-van-bom-aan-nieuwe-chip/)).
- **Invest-NL** and the **EIC Fund**, in the same round.
- **Money logic:** equity is your most expensive money, so keep it for scale-up and commercial costs. Reliefs and grants carry R&D wages and phase costs, and the 3% credit carries the prototyping spend.

**Precedents.** BOM: the SemiBlocks round above (press). EIC: the awards I found are in other sectors; I found no semiconductor-equipment precedent. Innovatiekrediet, VLAIO and WBSO: none checked.

**Regina flags (one line each):** semiconductor inspection equipment may fall under export-control rules, and a €15M round with foreign money may trigger Dutch investment screening. Both affect who can invest. Handing these to Regina.

**Not yet:** don't approach the public investors as a lead, and don't sign next-phase orders before the applications are in.

**Questions for you:**
- Which entity contracts and pays for the cleanroom time? This decides the WBSO and grant split.
- Does any shareholder hold 25% or more? This could change your SME size.
- Do the Leuven engineers do contract R&D for the BV? If so, the relief and transfer-pricing setup needs checking with a tax adviser.

```mandate-board
{
  "title": "Eindhoven optical inspection: public money for R&D and the round",
  "stage": "write_up",
  "answer": {
    "lines": [
      "File WBSO for 2027 by 20 December; it is the cheapest money and the only hard deadline.",
      "Set up Belgium's researcher payroll-tax relief for the 30 Leuven engineers; possibly worth more than WBSO.",
      "Grants only for a next phase not yet started: VLAIO for Leuven, Innovatiekrediet for the BV, EIC short proposal.",
      "Find a private lead for the EUR 15M round; BOM, Invest-NL and the EIC Fund co-invest beside it."
    ],
    "confidence": "medium",
    "confidence_why": "WBSO and incentive-effect rules are cited; Belgian relief, co-investor terms and the separate-phase reading are unverified.",
    "open_question": "Which entity contracts and pays for the cleanroom and prototyping time?",
    "cite": ["w1", "w2", "w3", "w4", "judgement"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "eic", "name": "EIC Accelerator (grant + EIC Fund equity)", "institution": "EISMEA / EIC Fund", "status": "probe", "why": "Open to SMEs at TRL 6-8; short proposal anytime; 2027 cut-off dates not yet official.", "conditions": ["Single SME applicant", "TRL 6-8", "Future work only"], "cite": ["c1", "c4", "w7"] }
    ] },
    { "id": "nl", "level": "national", "label": "Netherlands", "country": "NL", "doors": [
      { "id": "wbso", "name": "WBSO", "institution": "RVO", "status": "open", "why": "BV pays Dutch payroll tax on 20 engineers; future periods only; deadline 20 Dec for a 1 Jan start.", "conditions": ["Only staff on the BV payroll", "Apply before the period"], "cite": ["w1", "w2"] },
      { "id": "ik", "name": "Innovatiekrediet", "institution": "RVO", "status": "probe", "why": "Up to 35% of costs at 3%; needs a large share of activity in NL and full financing in place; September start must be checked.", "conditions": ["Large share of activity in NL", "Project and company financing complete", "Not-yet-started phase"], "cite": ["w4", "w5", "unverified"] },
      { "id": "invnl", "name": "Invest-NL co-investment", "institution": "Invest-NL", "status": "probe", "why": "National co-investor next to a private lead.", "cite": ["unverified"] },
      { "id": "this-project", "name": "Grants for the project as started in September", "institution": "Any grant body under GBER", "status": "shut", "why": "Aid needs the application before work starts; this project started in September.", "cite": ["w3"] }
    ] },
    { "id": "nb", "level": "regional", "label": "Noord-Brabant", "country": "NL", "doors": [
      { "id": "bom", "name": "BOM equity co-investment", "institution": "Brabantse Ontwikkelings Maatschappij", "status": "probe", "why": "Regional investor with a semicon theme; Eindhoven is in Brabant.", "cite": ["unverified"] }
    ] },
    { "id": "be", "level": "national", "label": "Belgium", "country": "BE", "doors": [
      { "id": "be-wht", "name": "80% researcher payroll-tax exemption", "institution": "FOD Financien / BELSPO", "status": "open", "why": "For the Leuven sub's qualifying researchers; terms to confirm on the official page.", "cite": ["unverified"] }
    ] },
    { "id": "fl", "level": "regional", "label": "Flanders", "country": "BE", "doors": [
      { "id": "vlaio", "name": "VLAIO development project", "institution": "VLAIO", "status": "open", "why": "25% base + 10% medium + 10% collaboration, max 50%; permanent open, 18 weeks.", "conditions": ["Leuven sub applies", "Phase not started"], "cite": ["w6", "unverified"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "relief", "label": "Tax relief", "steps": [
      { "id": "wbso-file", "label": "File WBSO for 2027 (deadline 20 Dec for 1 Jan start)", "start": 0, "end": 1, "owner": "client", "status": "planned", "cite": ["w1"] },
      { "id": "be-setup", "label": "Set up Belgian researcher exemption with payroll provider", "start": 0, "end": 2, "owner": "client", "status": "planned", "cite": ["unverified"] }
    ] },
    { "id": "grants", "label": "Grants and credit", "steps": [
      { "id": "phase", "label": "Define the not-yet-started next phase; confirm with RVO and VLAIO", "start": 0, "end": 1, "owner": "us", "status": "planned", "cite": ["w3", "judgement"] },
      { "id": "no-orders", "label": "Do NOT sign next-phase cleanroom/prototyping orders before applying", "start": 0, "end": 3, "owner": "client", "status": "blocked", "cite": ["w3"] },
      { "id": "vlaio-app", "label": "VLAIO development project application (Leuven share)", "start": 1, "end": 3, "owner": "client", "status": "planned", "depends_on": ["phase"], "cite": ["w6"] },
      { "id": "ik-scan", "label": "Innovatiekrediet quick scan and application (BV share)", "start": 1, "end": 4, "owner": "client", "status": "planned", "depends_on": ["phase"], "cite": ["w4"] },
      { "id": "eic-short", "label": "EIC Accelerator short proposal", "start": 1, "end": 3, "owner": "client", "status": "planned", "cite": ["w7"] }
    ] },
    { "id": "round", "label": "EUR 15M round", "steps": [
      { "id": "lead", "label": "Run the private lead process", "start": 1, "end": 7, "owner": "client", "status": "planned", "cite": ["judgement"] },
      { "id": "coinv", "label": "BOM / Invest-NL / EIC Fund as co-investors", "start": 3, "end": 9, "owner": "client", "status": "planned", "depends_on": ["lead"], "cite": ["unverified"] },
      { "id": "close", "label": "Close; Innovatiekrediet granted once financing complete", "start": 9, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["coinv", "ik-scan"], "cite": ["w4"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-wbso", "label": "WBSO 2028 rates and next period deadline", "start": 11, "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"] },
      { "id": "w-eic", "label": "EIC 2027 work programme: full-proposal cut-offs", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["w7"] },
      { "id": "w-gber", "label": "GBER revision after 2026: incentive-effect and cumulation rules", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-ik", "label": "Innovatiekrediet 2027 opening and budget", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["w5"] },
      { "id": "w-be", "label": "BELSPO/FOD guidelines on the researcher exemption", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "rvo", "name": "RVO", "side": "public-capital", "country": "NL", "units": [
      { "id": "rvo-wbso", "name": "WBSO", "roles": [
        { "id": "rvo-wbso-p1", "role": "WBSO team lead", "priority": "P1", "reach": "RVO WBSO contact line", "status": "to_approach", "cite": ["judgement"] },
        { "id": "rvo-wbso-p2", "role": "WBSO adviser", "priority": "P2", "reach": "RVO WBSO contact line", "status": "to_approach", "cite": ["judgement"] }
      ] },
      { "id": "rvo-ik", "name": "Innovatiekrediet", "roles": [
        { "id": "rvo-ik-p1", "role": "Head of Innovatiekrediet", "priority": "P1", "reach": "Via the Innovatiekrediet adviser after quick scan", "status": "to_approach", "cite": ["judgement"] },
        { "id": "rvo-ik-p2", "role": "Innovatiekrediet adviser", "priority": "P2", "reach": "Innovatiekrediet quick scan on rvo.nl", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "ez", "name": "Ministry of Economic Affairs", "side": "political", "country": "NL", "units": [
      { "id": "ez-ik", "name": "Innovation and knowledge directorate", "roles": [
        { "id": "ez-p1", "role": "Director, innovation and knowledge", "priority": "P1", "reach": "Formal letter via the ministry", "status": "to_approach", "cite": ["judgement"] },
        { "id": "ez-p2", "role": "Policy officer, semiconductors / high tech", "priority": "P2", "reach": "Forwarded by the director", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "vlaio", "name": "VLAIO", "side": "public-capital", "country": "BE", "units": [
      { "id": "vlaio-inn", "name": "Business innovation support", "roles": [
        { "id": "vlaio-p1", "role": "Head of innovation support", "priority": "P1", "reach": "VLAIO contact, after adviser intake", "status": "to_approach", "cite": ["judgement"] },
        { "id": "vlaio-p2", "role": "Innovation adviser, Flemish Brabant", "priority": "P2", "reach": "VLAIO intake", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "fl-gov", "name": "Flemish government", "side": "political", "country": "BE", "units": [
      { "id": "fl-cab", "name": "Cabinet of the minister for economy and innovation", "roles": [
        { "id": "fl-p1", "role": "Cabinet adviser, innovation", "priority": "P1", "reach": "Formal letter", "status": "to_approach", "cite": ["judgement"] },
        { "id": "fl-p2", "role": "Cabinet staff, industry", "priority": "P2", "reach": "Forwarded", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "bom", "name": "BOM", "side": "public-capital", "country": "NL", "units": [
      { "id": "bom-ht", "name": "High tech / semicon investments", "roles": [
        { "id": "bom-p1", "role": "Investment director, high tech", "priority": "P1", "reach": "Warm intro via the lead or ecosystem", "status": "to_approach", "cite": ["judgement"] },
        { "id": "bom-p2", "role": "Investment manager, semicon", "priority": "P2", "reach": "Forwarded by the director", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "nb-prov", "name": "Provincie Noord-Brabant", "side": "political", "country": "NL", "units": [
      { "id": "nb-ec", "name": "Economy portfolio", "roles": [
        { "id": "nb-p1", "role": "Provincial executive for economy", "priority": "P1", "reach": "Formal letter", "status": "to_approach", "cite": ["judgement"] },
        { "id": "nb-p2", "role": "Programme manager, semicon ecosystem", "priority": "P2", "reach": "Forwarded", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "invnl", "name": "Invest-NL", "side": "public-capital", "country": "NL", "units": [
      { "id": "invnl-dt", "name": "Deep tech", "roles": [
        { "id": "invnl-p1", "role": "Head of deep tech investments", "priority": "P1", "reach": "Via the private lead", "status": "to_approach", "cite": ["judgement"] },
        { "id": "invnl-p2", "role": "Investment manager", "priority": "P2", "reach": "Forwarded", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "eic", "name": "EISMEA / EIC Fund", "side": "public-capital", "country": "EU", "units": [
      { "id": "eic-acc", "name": "EIC Accelerator", "roles": [
        { "id": "eic-p1", "role": "Programme manager, semiconductors", "priority": "P1", "reach": "EIC events and the call channel", "status": "to_approach", "cite": ["judgement"] },
        { "id": "eic-p2", "role": "Dutch EIC national contact point", "priority": "P2", "reach": "National contact point", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] }
  ] },
  "funding_stack": { "currency": "EUR", "need": { "amount": 6000000, "label": "Next-gen module, two years (plus EUR 15M round)" },
    "instruments": [
      { "id": "wbso", "name": "WBSO", "type": "grant", "amount": 490000, "terms": "Carries Dutch R&D wages and BV-paid costs; cheapest money, non-dilutive, per year (illustrative)", "status": "planned", "cite": ["w1", "w2", "judgement"] },
      { "id": "be-wht", "name": "Belgian researcher payroll-tax exemption", "type": "grant", "amount": 600000, "terms": "Carries Leuven researcher wages; non-dilutive, per year (illustrative)", "status": "planned", "cite": ["unverified"] },
      { "id": "vlaio", "name": "VLAIO development project", "type": "grant", "amount": 400000, "amount_max": 800000, "terms": "Carries Leuven phase costs; non-dilutive, 35-50%", "status": "planned", "cite": ["w6", "judgement"] },
      { "id": "ik", "name": "Innovatiekrediet", "type": "loan", "amount": 1200000, "terms": "Carries BV phase costs incl. prototyping; 3% plus 15% surcharge, repayable, cheap versus equity", "status": "probe", "cite": ["w4", "w5", "judgement"] },
      { "id": "eic", "name": "EIC Accelerator grant", "type": "grant", "amount_max": 2500000, "terms": "Carries future development costs; non-dilutive but competitive", "status": "probe", "cite": ["unverified"] },
      { "id": "equity", "name": "EUR 15M round with BOM / Invest-NL / EIC Fund", "type": "public_coinvest", "amount": 15000000, "terms": "Carries scale-up and commercial costs; dearest money, keep it off what relief covers", "status": "planned", "cite": ["judgement"] }
    ] },
  "risks_flags": [
    { "id": "start", "kind": "deal_breaker", "severity": "high", "title": "Project started in September: no grant for that work", "fix": "Define a not-yet-started next phase; apply before signing its orders; confirm with RVO and VLAIO.", "cite": ["w3"] },
    { "id": "wbso-deadline", "kind": "flag", "severity": "high", "title": "WBSO deadline 20 December for a 1 January start", "fix": "File this month.", "cite": ["w1"] },
    { "id": "leuven", "kind": "flag", "severity": "medium", "title": "30 engineers outside WBSO and possibly weakening Innovatiekrediet's NL-activity test", "fix": "Use Belgian relief and VLAIO for the Leuven share; keep the Dutch phase Dutch.", "cite": ["w2", "w4"] },
    { "id": "ik-financing", "kind": "flag", "severity": "medium", "title": "Innovatiekrediet granted only once financing is complete", "fix": "Time it with the round's close.", "cite": ["w4"] },
    { "id": "cumulation", "kind": "flag", "severity": "medium", "title": "Two sources on one cost", "fix": "Split cost bases by entity; confirm cumulation with RVO.", "cite": ["unverified"] },
    { "id": "regina", "kind": "flag", "severity": "medium", "title": "Export controls and investment screening on the round", "fix": "Handed to Regina.", "cite": ["judgement"] }
  ]
}
```

**Sources**
- [c1] EIC Accelerator eligibility: "Single start-up or SME (including spin-outs)". https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en
- [c4] Same page: "Develop and scaleup innovations with the potential to create or disrupt markets (TRL 6-8)."
- [c5] Same page: a score of at least 13/15 that isn't funded earns a "Seal of Excellence".
- [w1] RVO, WBSO, https://www.rvo.nl/subsidies-financiering/wbso, retrieved 16 Nov 2026: 36% on the first €391,020, 16% above it; deadline 20 December for a 1 January 2027 start.
- [w2] RVO, WBSO conditions, https://www.rvo.nl/subsidies-financiering/wbso/voorwaarden, 16 Nov 2026: "U mag alleen WBSO aanvragen voor S&O-uren van uzelf en van medewerkers die bij u op de loonlijst staan."
- [w3] Block exemption Regulation 651/2014, art. 6 (as adopted), https://legislation.gov.uk/eur/2014/651/article/6/adopted, 16 Nov 2026: "…submitted a written application for the aid to the Member State concerned before work on the project or activity starts."
- [w4] RVO, Innovatiekrediet conditions, https://www.rvo.nl/subsidies-financiering/innovatiekrediet/voorwaarden, 16 Nov 2026: "vastgesteld op 3,0%"; "pas verleend als de financiering van zowel het project als het bedrijf helemaal rond is"; "groot deel van de activiteiten in Nederland plaatsvindt".
- [w5] RVO, Innovatiekrediet, https://www.rvo.nl/subsidies-financiering/innovatiekrediet, 16 Nov 2026: medium-sized companies up to 35% without collaboration; €10M per technical project.
- [w6] Flemish government, development project, https://www.vlaanderen.be/ontwikkelingsproject, 16 Nov 2026: "Het basissteunpercentage voor een ontwikkelingsproject is 25%"; "permanent open".
- [w7] EIC 2027 timing, secondary sources: [Deloitte](https://www.deloitte.com/mt/en/services/tax/perspectives/gi3/eic-accelerator-2027-call.html) and [euacc.ai](https://www.euacc.ai/programmes/eic-accelerator), 16 Nov 2026: the 2027 dates are "to be established in the 2027 EIC Work Programme".
