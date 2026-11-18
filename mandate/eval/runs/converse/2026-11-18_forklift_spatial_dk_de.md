# Simulated conversation: forklift_spatial_dk_de

Case: `mandate/eval/scenarios/forklift_spatial_dk_de.yaml`. Brain: Wincent. Playbooks at 71deca495e. 2026-11-18T14:18:51+00:00. 12 turns (script 12/12; stopped: wrapped_up; client agent called 2x).
Leave-one-out case library: 3 entries left out (forklift_mispriced_market_velocity, forklift_regulatory_flag_to_regina, forklift_risk_not_to_customer).

## Turn 1: the founder (opener, script)

> We sell forklift safety sensors. We pay everything upfront, get paid at go-live, and it kills our cash. We're also raising. Can the state help?

## Turn 1: Wincent

A cash cycle like yours is a common problem, and public money is built for it. Lenders find it hard to price project risk, so they charge too much for it. Public guarantees and co-lending exist to fix exactly that (judgement). Two facts settle part of the case already. The main need is working capital to pre-finance projects, not R&D. And you are raising, which may open co-investment alongside the round (judgement). Three things decide which door is yours:

1. **Where are you incorporated, and where do you have people?** Give each entity and the countries your customers are in. Public loans and guarantees usually reach you through national and regional bodies, and often through your own bank. The country picks the institution.
2. **What does one project tie up?** Roughly: the cash out per project, the months from purchase to go-live, the number of projects a year, and which bank you use. As a rough example: €200k tied up for 6 months means a €1m line covers about ten projects a year instead of five (judgement, illustrative). That points to a guarantee on a working-capital line rather than a grant.
3. **The round: how much, who leads, and when does it close?** Some public co-investment has to be lined up before the round closes (unverified, varies by country).

**Safe whatever you answer:** don't close the round until we've checked the co-investment timing.
**Don't do yet:** push the upfront cost onto customers with prepayment or leasing. It makes your offer less competitive (judgement).

Your products are safety sensors for machinery, so EU machinery safety rules probably apply. That's for Regina, my colleague on regulation, to check (unverified).

Start with question 1: which entities and countries?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the round",
  "stage": "qualify",
  "risks_flags": [
    {"id": "round-timing", "kind": "flag", "severity": "high", "title": "Closing the round before checking co-investment timing could lose that route", "fix": "Hold the close until the country's co-investment rules are checked", "cite": ["unverified"]},
    {"id": "cost-to-customer", "kind": "flag", "severity": "medium", "title": "Moving the upfront cost to customers weakens the offer", "fix": "Finance the cycle on your own balance sheet, with the public side taking the risk", "cite": ["judgement"]},
    {"id": "machinery-reg", "kind": "flag", "severity": "medium", "title": "Machinery safety rules may apply to the sensors", "fix": "Hand to Regina to check", "cite": ["unverified"]}
  ]
}
```

## Turn 2: the founder (answer, if_asked+client_agent)

> Danish ApS is the parent and signs most contracts, even German ones. We have a GmbH in Munich, about 8 people doing sales and installation.
> 
> Series A, 12 million. We have a lead in talks, closing in about four months.
> 
> Danish ApS, about 37 people, signs most contracts, German ones too. The GmbH is in Munich, 8 people doing sales and installation. Customers are mostly in Denmark and Germany. A project is €300k to €800k and takes 4 to 9 months to go live.

## Turn 2: Wincent

Your answers settle the main point. The Danish ApS signs the contracts and carries the upfront cost, so Danish public money carries it too. EIFO, the Danish state's export and investment fund, guarantees bank lending for exactly this purpose. That includes specific orders, processing credits and working-capital lines [w1]. It covers up to 80% of the bank's loss [c1], for up to three years [c3]. The price is a premium of 0.8% to 6.3% a year, set by your rating [c4]. EIFO can also lend half of the need alongside your bank, including to venture cases that are not yet profitable [c52][c54].

**Why the round matters:** both products require positive equity [c2][c53], and the €12m round gives you that. So the round comes first and the facility follows straight after (judgement).

**Rough sizing:** a project averages about €550k and ties up cash for about 6.5 months. On that basis a €3m guaranteed line funds roughly 5 projects at once, or about 10 a year (judgement, illustrative). Please send me the real pipeline.

**Germany is still open.** The Munich GmbH has 8 people, payroll and installation work. Bavaria's promotional bank, LfA, lends to it through its house bank [c47]. That is a second door, smaller than the Danish one.

**What not to do:** don't let the bank write the line before the round closes. EIFO cover requires the financing to expand the bank's commitment [c9].

**Next question:** which bank does the ApS use, and does it already have a credit line? And which bank does the GmbH use?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the round",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "Who sits under whom",
      "explains": "In Denmark EIFO backs your bank's line to the ApS. In Bavaria the GmbH's house bank passes on LfA and KfW loans, with a guarantee bank behind it.",
      "nodes": [
        {"id": "eifo", "label": "EIFO (Danish export and investment fund)", "kind": "institution", "cite": ["c5"]},
        {"id": "eifo-g", "label": "EIFO-Guarantee to your bank", "kind": "instrument", "parent": "eifo", "status": "open", "note": "Up to 80% of the loss on a working-capital or order line; needs positive equity", "cite": ["c1", "c2", "w1"]},
        {"id": "eifo-gl", "label": "EIFO Growth Loan", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "EIFO lends 50% of the need alongside the bank", "cite": ["c52", "c54"]},
        {"id": "eifo-eq", "label": "EIFO equity co-investment", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "May join the Series A; to check with the lead", "cite": ["unverified"]},
        {"id": "dk-bank", "label": "The ApS's bank", "kind": "channel", "parent": "eifo-g", "cite": ["c5"]},
        {"id": "hb", "label": "The GmbH's house bank", "kind": "channel", "cite": ["c47"]},
        {"id": "lfa", "label": "LfA Förderbank Bayern: Universalkredit", "kind": "regional_body", "parent": "hb", "status": "probe", "note": "For the GmbH's own costs; the house bank carries the risk unless LfA takes part", "cite": ["c47", "c49"]},
        {"id": "kfw", "label": "KfW ERP-Förderkredit KMU", "kind": "programme", "parent": "hb", "status": "probe", "note": "Apply before the project starts", "cite": ["c30"]},
        {"id": "bb", "label": "Bürgschaftsbank (Land guarantee bank)", "kind": "regional_body", "parent": "hb", "status": "probe", "note": "Up to 80% of the risk, at most €1m per borrower", "cite": ["c14", "c16"]}
      ],
      "cite": ["c5", "c47"]
    }
  ],
  "risks_flags": [
    {"id": "equity", "kind": "deal_breaker", "severity": "high", "title": "EIFO needs positive equity", "fix": "Close the Series A first, then file the guarantee and growth loan", "cite": ["c2", "c53"]},
    {"id": "expand", "kind": "flag", "severity": "medium", "title": "EIFO cover must expand the bank's commitment", "fix": "Do not let the bank put up the new line before EIFO is in the file", "cite": ["c9"]},
    {"id": "round-timing", "kind": "flag", "severity": "high", "title": "Closing the round before checking co-investment timing could lose that route", "fix": "Ask the lead whether EIFO co-invests, before term sheet", "cite": ["unverified"]}
  ]
}
```

**Sources**
- [c1]–[c5]: EIFO-Guarantee product sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (sha256 c3f998cb12f6)
- [c9]: same sheet
- [c52]–[c54]: EIFO Growth Loan product sheet 2026, https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf (sha256 6dfac0993cfe)
- [c14], [c16]: Verband Deutscher Bürgschaftsbanken FAQ, https://www.vdb-info.de/de/ueber-uns/nutzliche-infos/faq/ (sha256 30ddc2628aa5)
- [c30]: KfW ERP-Förderkredit KMU sheet (sha256 31b2116df386)
- [c47], [c49]: LfA Universalkredit, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php (sha256 53c9bc96566b)
- [w1]: [EIFO-Guarantee, Jan 2026](https://eifo.dk/media/ykebr4xj/eifo-guarantee-jan-2026.pdf), retrieved 18 Nov 2026. Financing purposes listed: "Specific orders, e.g., processing credits, advance payment guarantees, performance guarantees" and "Credit facilities for financing the company's ongoing working capital"

## Turn 3: the founder (options, script)

> OK, that is the picture. What are our options, broadly?

## Turn 3: Wincent

Broadly you have three kinds of money. They carry different costs, and the order you use them in matters.

1. **Public risk-sharing on your own working capital (the core).** EIFO guarantees your Danish bank's line or lends alongside it [c1][c54]. EU guarantees reach you the same way, through Danish banks that already hold them. Danske Bank has one with a window for innovation and digitalisation [w2]. Kompasbank's covers riskier lending, start-ups included [w3]. This is cheap money for a cost that comes back at go-live (judgement).
2. **The Munich GmbH's own doors.** LfA, KfW and the Bürgschaftsbank, the Land's guarantee bank, are all reached through the GmbH's house bank [c47][c30][c13]. They pay only for the GmbH's own costs, and the guarantee bank caps cover at €1m per borrower [c16].
3. **Equity in the round.** EIFO co-invests in companies like yours (Robotto, a robotics firm, appears in a register record). But €12m of equity is your dearest money. Using it to pre-finance projects burns dilution on cash that comes back within the year (judgement).

On the customer side, Germany's accident insurers pay prevention premiums. The construction insurer funds camera-based person detection [w4]. Whether the trade and logistics insurer does the same for forklifts is unverified. Treat it as a sales aid, not a fix.

One combination rule: EIFO gives no guarantee cover on a facility it co-finances 1:1 [c52]. So for each line you pick one or the other.

Do you lean toward making the Danish bank line the core, or would you rather spread across both entities?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the round",
  "stage": "options",
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU (InvestEU through Danish banks)", "doors": [
        {"id": "eu-danske", "name": "InvestEU guarantee, innovation and digitalisation window", "institution": "EIF via Danske Bank", "via": "your bank, if it is Danske Bank", "status": "probe", "why": "Agreement covers Denmark; two fifths aimed at innovation and digitalisation", "cite": ["w2"]},
        {"id": "eu-kompas", "name": "InvestEU guarantees for riskier lending incl. start-ups", "institution": "EIF via Kompasbank", "via": "Kompasbank", "status": "probe", "why": "Built for lending segments other banks avoid", "cite": ["w3"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (the ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on a working-capital or order line", "institution": "EIFO via your bank", "status": "open", "why": "Covers order and working-capital lines, up to 80% of loss; needs positive equity after the round", "conditions": ["Positive equity", "Line expands the bank's commitment", "Facility from DKK 2m"], "cite": ["c1", "c2", "c8", "c9", "w1"]},
        {"id": "eifo-gl", "name": "EIFO Growth Loan (50% alongside the bank)", "institution": "EIFO", "status": "probe", "why": "Takes unprofitable venture cases; CIBOR + 4-10%; no guarantee on the same 1:1 facility", "cite": ["c52", "c54", "c56"]},
        {"id": "eifo-cg", "name": "EIFO Contract Guarantee (order not completed or paid)", "institution": "EIFO", "status": "probe", "why": "Insures German orders signed by the ApS; terms to read", "cite": ["unverified"]},
        {"id": "eifo-eq", "name": "EIFO equity co-investment in the Series A", "institution": "EIFO", "status": "probe", "why": "EIFO holds robotics stakes (register record); dearest money for this cost", "cite": ["unverified"]},
        {"id": "eifo-match", "name": "EIFO Match Loan", "institution": "EIFO", "status": "park", "why": "Corpus row says under DKK 3m revenue; likely above it, to confirm", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany (the GmbH)", "country": "DE", "doors": [
        {"id": "kfw", "name": "KfW ERP-Förderkredit KMU", "institution": "KfW via house bank", "status": "probe", "why": "For the GmbH's own costs; apply before the project starts", "cite": ["c30", "c37"]},
        {"id": "hermes", "name": "Hermes export cover", "institution": "Federal export credit agency", "status": "park", "why": "For German exporters; the GmbH sells in Germany", "cite": ["judgement"]}
      ]},
      {"id": "by", "level": "regional", "label": "Bavaria (the GmbH)", "country": "DE", "doors": [
        {"id": "lfa", "name": "LfA Universalkredit", "institution": "LfA Förderbank Bayern via house bank", "status": "probe", "why": "Applied and paid out at the house bank", "cite": ["c47", "c49"]},
        {"id": "bb", "name": "Bürgschaftsbank guarantee", "institution": "Land guarantee bank via house bank", "status": "probe", "why": "Up to 80% of risk, max €1m per borrower", "cite": ["c14", "c16"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Your customers (Germany)", "country": "DE", "doors": [
        {"id": "bg", "name": "Accident-insurer prevention premiums", "institution": "Berufsgenossenschaften", "status": "probe", "why": "BG BAU funds person detection on construction machines; forklift equivalent unverified", "cite": ["w4", "unverified"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 3000000, "label": "Illustrative working-capital line: ~5 projects of €550k at once"},
    "instruments": [
      {"id": "round", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Dearest money: dilution; best for growth, team and the equity base the guarantees need", "status": "in_progress", "cite": ["judgement"]},
      {"id": "dk-line", "name": "Bank working-capital line to the ApS", "type": "loan", "amount": 3000000, "terms": "Carries the project cash cycle; recycles at each go-live", "status": "planned", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "EIFO-Guarantee on that line", "type": "guarantee_debt", "terms": "Same cost, cheaper and larger: EIFO takes up to 80% of loss for a 0.8-6.3% premium", "status": "probe", "cite": ["c1", "c4"]},
      {"id": "gmbh-loan", "name": "LfA or KfW loan to the GmbH", "type": "loan", "terms": "Carries the GmbH's own payroll and installation costs", "status": "probe", "cite": ["c47", "c30"]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-guar", "name": "Guarantees and loans", "roles": [
        {"id": "eifo-p1", "role": "Head of the SME guarantee and loan area", "priority": "P1", "reach": "Through your bank's corporate team, or EIFO's call centre", "status": "to_approach", "cite": ["unverified"]},
        {"id": "eifo-p2", "role": "EIFO account manager for growth companies", "priority": "P2", "reach": "EIFO's call centre +45 31 51 94 21", "status": "to_approach", "cite": ["w1"]}]}]},
      {"id": "dkbank", "name": "The ApS's bank", "side": "market", "country": "DK", "units": [{"id": "corp", "name": "Corporate banking", "roles": [
        {"id": "rm", "role": "Relationship manager", "priority": "P1", "reach": "Your finance lead", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-k", "name": "Promotional loans", "roles": [
        {"id": "lfa-p1", "role": "Head of promotional lending", "priority": "P1", "reach": "Through the GmbH's house bank", "status": "to_approach", "cite": ["unverified"]},
        {"id": "hb-rm", "role": "House bank relationship manager", "priority": "P2", "reach": "GmbH managing director", "status": "to_approach", "cite": ["c47"]}]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "round", "label": "Series A", "steps": [{"id": "close", "label": "Round closes", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}]},
      {"id": "dk", "label": "Danish line", "steps": [
        {"id": "bank-talk", "label": "Open the line talk with the bank, EIFO cover named from the start", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["c9"]},
        {"id": "file", "label": "Bank files EIFO cover once equity is positive", "start": 4, "end": 5.5, "owner": "institution", "status": "planned", "depends_on": ["close"], "cite": ["c2"]},
        {"id": "no-line-yet", "label": "Do not sign a new line before EIFO is in the file", "start": 0, "end": 4, "owner": "client", "status": "blocked", "cite": ["c9"]}]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-investeu", "label": "InvestEU moving into the European Competitiveness Fund: do bank guarantees continue?", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-bg", "label": "Check accident-insurer premiums for forklift assistance systems", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}]}
    ]
  },
  "hierarchies": [
    {
      "id": "field",
      "title": "Who sits under whom",
      "explains": "EU guarantees and EIFO both reach the ApS through its bank; Bavarian and federal money reach the GmbH through its house bank.",
      "nodes": [
        {"id": "eif", "label": "EIF (InvestEU)", "kind": "institution", "cite": ["w2"]},
        {"id": "danske", "label": "Danske Bank / Kompasbank (hold EIF cover)", "kind": "channel", "parent": "eif", "status": "probe", "cite": ["w2", "w3"]}
      ],
      "cite": ["w2"]
    }
  ],
  "risks_flags": [
    {"id": "combine", "kind": "flag", "severity": "medium", "title": "EIFO guarantee and EIFO 1:1 co-financing do not stack on one facility", "fix": "Choose per line: guarantee on the bank line, or growth loan alongside it", "cite": ["c52"]},
    {"id": "deminimis", "kind": "flag", "severity": "low", "title": "Aid ceilings may count across the group", "fix": "Keep a register of aid received by both entities", "cite": ["unverified"]},
    {"id": "machinery-reg", "kind": "flag", "severity": "medium", "title": "Machinery safety rules may apply to the sensors", "fix": "Regina to check", "cite": ["unverified"]}
  ]
}
```

**New sources**
- [w2]: [EIF, Danske Bank guarantee](https://www.eif.org/press/all/eif-guarantee-unlocks-eur178-million-in-new-lending-for-nordic-smes-through-danske-bank), 6 May 2025, retrieved 18 Nov 2026: "The EIF guarantee is supported by the European Commission under its InvestEU programme"; "rolled out in Denmark, Norway and Sweden"; "The remaining two-fifths will target innovation and digitalisation"
- [w3]: [EIF, Kompasbank guarantee](https://www.eif.org/press/all/kompasbank-to-provide-over-eur-175-million-in-new-cheaper-loans-to-danish-smes-through-european-guarantee), 3 Jul 2024, retrieved 18 Nov 2026: "The agreements are supported by the InvestEU programme"
- [w4]: [BG BAU, requirements for camera-based person detection](https://www.bgbau.de/fileadmin/Produkte/Arbeitsschutzpraemie/Kamerabasierte_Personenerkennungsysteme_Anforderungen.pdf), retrieved 18 Nov 2026, via search summary: funds "kamerabasierte Personenerkennungssysteme"; I have not opened the page itself
- [c13]: Verband Deutscher Bürgschaftsbanken FAQ (sha256 30ddc2628aa5); [c37]: KfW ERP sheet (sha256 31b2116df386); [c56]: EIFO Growth Loan sheet (sha256 6dfac0993cfe)

## Turn 4: the founder (answer, if_asked)

> A Danish bank for the ApS and a savings bank in Munich for the GmbH. About 3 million working-capital line, expensive, and we gave personal guarantees.

## Turn 4: Wincent

That changes the priority. You already have a €3m line. It's expensive because the bank prices your project risk high and leans on your personal guarantees for security. A public guarantee is meant to take the place of that founder security (judgement). Here is my order:

1. **Lead: grow the ApS line with EIFO cover.** EIFO only covers financing that expands the bank's commitment [c9], so it won't cover today's €3m as it stands. Ask for a bigger line, say €6m, with EIFO taking up to 80% of the loss [c1]. Use the round to negotiate releasing your personal guarantees in return (judgement). €6m funds about ten projects at once instead of five (judgement, illustrative).
2. **Second: the Munich savings bank for the GmbH.** It can arrange an LfA loan with a guarantee from the Land's guarantee bank [c47][c14], capped at €1m per borrower [c16]. This is small and pays only for the GmbH's own costs. Run it in parallel.
3. **Probe: EIFO in the round.** Ask your lead now, before the term sheet.

**Park:** the EIFO Growth Loan. At CIBOR plus 4% to 10% [c56] it is dear next to a guaranteed bank line. It also cannot carry guarantee cover on top [c52].

**Pushback:** don't use the €12m to pay down the line. That's your dearest money paying for a cost that comes back at go-live (judgement).

I found no published EIFO guarantee deal like this one. Ask your bank which EIFO-backed lines it has written.

**Deciding question:** which Danish bank is it, and what rate and security sit on the line today?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the round",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Grow the ApS's €3m line to about €6m with EIFO covering up to 80% of the loss, filed once the round closes.",
      "Use that negotiation to release the founders' personal guarantees.",
      "In parallel, the GmbH's savings bank arranges an LfA loan with Land guarantee-bank cover for the GmbH's own costs.",
      "Ask the Series A lead now whether EIFO co-invests."
    ],
    "confidence": "medium",
    "confidence_why": "Product fits by its own terms; bank appetite and pricing unknown, no published precedent.",
    "open_question": "Which Danish bank, and what rate and security today?",
    "cite": ["c1", "c9", "c47", "c14"]
  },
  "routes": {
    "levels": [
      {"id": "dk", "level": "national", "label": "Denmark (the ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on an expanded ApS line", "institution": "EIFO via your Danish bank", "status": "open", "why": "Lead: only an expansion is covered, so grow the line", "conditions": ["Positive equity after the round", "Line expands the bank's commitment", "Facility from DKK 2m"], "cite": ["c1", "c2", "c8", "c9"]},
        {"id": "eifo-gl", "name": "EIFO Growth Loan (50% alongside the bank)", "institution": "EIFO", "status": "park", "why": "Dear (CIBOR + 4-10%) next to a guaranteed line; no guarantee on top", "cite": ["c52", "c56"]}
      ]},
      {"id": "by", "level": "regional", "label": "Bavaria (the GmbH)", "country": "DE", "doors": [
        {"id": "lfa", "name": "LfA Universalkredit", "institution": "LfA via the Munich savings bank", "status": "open", "why": "Second: GmbH's own costs, through the house bank you already have", "cite": ["c47"]},
        {"id": "bb", "name": "Bürgschaftsbank guarantee", "institution": "Land guarantee bank via the savings bank", "status": "open", "why": "Covers the savings bank's risk on the GmbH loan, max €1m", "cite": ["c14", "c16"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 6000000, "label": "Illustrative line: ~10 projects of €550k at once"},
    "instruments": [
      {"id": "dk-line", "name": "Existing ApS working-capital line", "type": "loan", "amount": 3000000, "terms": "Carries the project cash cycle; dear now because the bank prices project risk high and takes personal guarantees", "status": "secured", "cite": ["judgement"]},
      {"id": "dk-expand", "name": "Expansion of the ApS line", "type": "loan", "amount": 3000000, "terms": "Doubles projects in flight; only possible at a fair price with public cover", "status": "planned", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "EIFO-Guarantee on the expansion", "type": "guarantee_debt", "terms": "EIFO takes up to 80% of loss for a 0.8-6.3% premium; the case to release personal guarantees", "status": "planned", "cite": ["c1", "c4"]},
      {"id": "gmbh-loan", "name": "LfA loan to the GmbH with Bürgschaftsbank cover", "type": "loan", "amount": 500000, "amount_max": 1000000, "terms": "Carries GmbH payroll and installation; guarantee max €1m", "status": "probe", "cite": ["c16", "c47", "judgement"]},
      {"id": "round", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Dearest money: growth and the equity base, not paying down the line", "status": "in_progress", "cite": ["judgement"]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "sk", "name": "The GmbH's Munich savings bank", "side": "market", "country": "DE", "units": [{"id": "sk-corp", "name": "Business customers", "roles": [
        {"id": "sk-rm", "role": "Business relationship manager", "priority": "P1", "reach": "GmbH managing director", "status": "to_approach", "cite": ["c47"]}]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "round", "label": "Series A", "steps": [
        {"id": "eifo-ask", "label": "Ask the lead whether EIFO co-invests", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "close", "label": "Round closes", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "no-paydown", "label": "Do not use the round to pay down the line", "start": 4, "end": 6, "owner": "client", "status": "blocked", "cite": ["judgement"]}]},
      {"id": "dk", "label": "Danish line", "steps": [
        {"id": "bank-talk", "label": "Ask bank for a €6m line with EIFO cover and release of personal guarantees", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["c9", "judgement"]},
        {"id": "file", "label": "Bank files EIFO cover once equity is positive", "start": 4, "end": 5.5, "owner": "institution", "status": "planned", "depends_on": ["close"], "cite": ["c2"]}]},
      {"id": "de", "label": "GmbH", "steps": [
        {"id": "sk-talk", "label": "Savings bank: LfA loan with Bürgschaftsbank cover, before the costs are committed", "start": 1, "end": 3, "owner": "client", "status": "planned", "cite": ["c47", "c13"]}]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-gl", "label": "EIFO Growth Loan parked: revisit if the bank will not expand", "start": 5, "milestone": true, "owner": "us", "status": "planned", "cite": ["c54"]}]}
    ]
  },
  "risks_flags": [
    {"id": "expand", "kind": "deal_breaker", "severity": "high", "title": "EIFO will not cover the existing line as it stands", "fix": "Structure the ask as an expansion of the bank's commitment", "cite": ["c9"]},
    {"id": "pg", "kind": "flag", "severity": "medium", "title": "Founders' personal guarantees on the line", "fix": "Negotiate release against EIFO cover and the new equity", "cite": ["judgement"]},
    {"id": "no-precedent", "kind": "flag", "severity": "low", "title": "No published EIFO guarantee precedent found", "fix": "Ask the bank for its own EIFO-backed cases", "cite": ["judgement"]}
  ]
}
```

## Turn 5: the founder (pushback, script)

> Our investors say: just raise a bigger round and stop messing about with banks. Why not put more equity in?

## Turn 5: Wincent

Your investors have a point: one round is simpler than a round plus a bank. But for this particular cost, equity is the wrong money.

**The arithmetic.** These figures are illustrative; please send me the real valuation.
- Say the €12m round comes in at €60m post-money. Raising €3m more to fund projects costs about 5% of the company, for good. At a €300m exit that slice is worth about €14m (judgement).
- A €3m guaranteed line costs you interest plus an EIFO premium of 0.8% to 6.3% on the guaranteed part [c4]. That is roughly €200–300k a year, and the bank, not you, carries most of the risk (judgement).
- The line revolves. Each go-live pays it down, so it grows with your pipeline. Equity spent on a project is spent once, and you'll have to raise again when the pipeline doubles (judgement).

**Where they're right.** Debt adds covenants and fixed costs, and it hurts if go-lives slip. So the round should be big enough for your equity base and a real buffer, not trimmed to lean on the bank (judgement).

**Bring this point to the board:** the two are not alternatives. EIFO cover requires positive equity [c2], so the round is what makes the cheap line possible. Raise equity for growth and buffer, and use the guaranteed line for the cycle (judgement).

**Before I go further:** what pre-money valuation is the lead offering, and how much of the €3m line is drawn on average?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the round",
  "stage": "prioritise",
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 6000000, "label": "Illustrative line: ~10 projects of €550k at once"},
    "instruments": [
      {"id": "round", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Dearest money: an extra €3m costs ~5% of the company forever (illustrative, €60m post); right for growth, buffer and the equity base", "status": "in_progress", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "EIFO-Guarantee on the expanded line", "type": "guarantee_debt", "terms": "Cheap for the cycle: ~€200-300k a year on €3m (illustrative), revolves at each go-live; needs the round first", "status": "planned", "cite": ["c2", "c4", "judgement"]}
    ]
  },
  "risks_flags": [
    {"id": "investor-push", "kind": "flag", "severity": "medium", "title": "Investors prefer more equity over a guaranteed line", "fix": "Show the dilution vs line-cost comparison with real valuation and drawdown figures", "cite": ["judgement"]},
    {"id": "debt-risk", "kind": "flag", "severity": "medium", "title": "A larger line adds covenants and fixed cost if go-lives slip", "fix": "Size the round to keep a cash buffer; size the line to the contracted pipeline", "cite": ["judgement"]}
  ]
}
```

## Turn 6: the founder (pushback, script)

> Or couldn't we get the customers to lease the kit, so it's off our balance sheet altogether?

## Turn 6: Wincent

You could, but don't make it the answer. Here's why.

- **It makes your offer dearer.** A lessor prices your customer's credit risk and its own margin into the monthly payment. Your customer pays more for the same sensors, and every deal gets a third party plus a credit check. That slows sales (judgement).
- **It may not even fix your cash.** A lessor usually pays out against delivery and acceptance. For an installed system, acceptance is close to go-live, which is exactly your problem today (judgement, confirm with a lessor). Sensors fitted into a customer's forklifts are also hard to take back, so a lessor would price that risk in or decline (judgement).
- **Watch who the lessor is.** It is only off your balance sheet if a third party leases. If you lease to customers yourself, the kit stays on your books and your cash cycle gets longer (judgement).

The better outcome is that the public side carries the risk while your customer pays a normal price. That is what the EIFO-backed line does [c1].

**Where leasing helps:** as a choice offered to customers who want it, to speed a sale. For German customers, EIFO's buyer-financing family includes an operational leasing guarantee for buyers of Danish goods. I haven't read its terms yet, so treat it as unverified until I check.

**To move to a plan, one decision:** do we lead with the expanded EIFO-backed line, with leasing as an optional sales aid?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the round",
  "stage": "prioritise",
  "routes": {
    "levels": [
      {"id": "cust", "level": "customer", "label": "Your customers", "country": "DE", "doors": [
        {"id": "lease", "name": "Third-party leasing offered to customers", "institution": "A lessor", "status": "park", "why": "Complement only: dearer offer, slower sale, may still pay at acceptance", "cite": ["judgement"]},
        {"id": "eifo-lease", "name": "EIFO Operational Leasing Guarantee (buyers of Danish goods)", "institution": "EIFO", "status": "probe", "why": "Could back a lessor for German buyers; terms not yet read", "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "cost-to-customer", "kind": "flag", "severity": "medium", "title": "Leasing moves the cost to customers and weakens the offer", "fix": "Keep the cycle on your own EIFO-backed line; offer leasing only as an option", "cite": ["judgement"]},
    {"id": "lease-timing", "kind": "flag", "severity": "medium", "title": "Lessor may pay only at acceptance, close to go-live", "fix": "Confirm payout timing with a lessor before relying on it", "cite": ["judgement"]}
  ]
}
```

## Turn 7: the founder (fact_change, script)

> Update: our lead is probably a German fund now, and they want contracting moved into the GmbH. Does that change things?

## Turn 7: Wincent

Yes, this changes things. The money follows whoever carries the cost. If the GmbH signs the German contracts, it pre-finances the German projects, and the lead door for those becomes Bavarian.

- **German projects:** LfA's Universalkredit pays for working capital ("Betriebsmittel") through your Munich savings bank. With its "HaftungPlus" option, LfA takes 60% of the savings bank's risk on loans up to €7.5m [w5]. That's the German counterpart of the EIFO line, and it is big enough. The Land guarantee bank on its own caps at €1m [c16], which is too small here.
- **Danish projects:** these stay in the ApS on a smaller EIFO-backed line [c1].
- **The catch:** an 8-person GmbH has a thin balance sheet. The savings bank will want equity in the GmbH, or support from the parent, before it lends (judgement). So part of the round has to go into the GmbH as capital.

**Sequencing:** agree the GmbH's line before the first contract moves. Tax and transfer pricing are for your tax advisers, not me.

**Not yet:** don't let the term sheet fix where contracting sits until the savings bank has given its indication (judgement).

**The deciding question:** does the fund want only contracting moved, or the holding company moved to Germany too? Moving the holding could put EIFO out of reach and change which German co-investors fit. Also, what share of your pipeline is German?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the round",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "If the GmbH signs German contracts, its savings bank lends through LfA's Universalkredit, with LfA taking 60% of the risk on loans up to €7.5m.",
      "Danish projects stay in the ApS on a smaller EIFO-backed line.",
      "Put part of the round into the GmbH's equity so the savings bank can lend.",
      "Agree the GmbH line before the first contract moves."
    ],
    "confidence": "medium",
    "confidence_why": "Products fit by their terms; depends on contracting only vs. a holding move, and on the pipeline split.",
    "open_question": "Contracting only, or the holding moved to Germany too? What share of the pipeline is German?",
    "cite": ["w5", "c1", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "by", "level": "regional", "label": "Bavaria (the GmbH)", "country": "DE", "doors": [
        {"id": "lfa", "name": "LfA Universalkredit with HaftungPlus", "institution": "LfA via the Munich savings bank", "status": "open", "why": "Lead for German projects: finances working capital, LfA takes 60% of the bank's risk, up to €7.5m", "conditions": ["Applied at the house bank", "Turnover up to €500m"], "cite": ["w5", "c46", "c47"]},
        {"id": "bb", "name": "Bürgschaftsbank or LfA guarantee (de minimis variant)", "institution": "Land guarantee bank / LfA via the savings bank", "status": "probe", "why": "Alternative to HaftungPlus; the guarantee bank caps at €1m per borrower", "cite": ["w5", "c16"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (the ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on the ApS line", "institution": "EIFO via your Danish bank", "status": "open", "why": "Now sized to Danish projects only; at risk if the holding moves", "cite": ["c1", "c9", "judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 6000000, "label": "Illustrative: ~10 projects of €550k at once, split by entity"},
    "instruments": [
      {"id": "gmbh-loan", "name": "GmbH working-capital line: LfA Universalkredit with HaftungPlus", "type": "guarantee_debt", "amount": 3000000, "amount_max": 7500000, "terms": "Carries German project pre-finance; cheap because LfA takes 60% of the bank's risk", "status": "planned", "cite": ["w5", "judgement"]},
      {"id": "dk-expand", "name": "ApS line with EIFO cover", "type": "guarantee_debt", "amount": 3000000, "terms": "Carries Danish project pre-finance; EIFO takes up to 80% of loss", "status": "planned", "cite": ["c1"]},
      {"id": "gmbh-equity", "name": "Part of the round as GmbH capital", "type": "equity", "terms": "Gives the GmbH the balance sheet the savings bank needs", "status": "planned", "cite": ["judgement"]}
    ]
  },
  "hierarchies": [
    {
      "id": "field",
      "title": "Who sits under whom",
      "explains": "LfA lends through the GmbH's savings bank and can take 60% of its risk; LfA's board credit committee sits above.",
      "nodes": [
        {"id": "lfa-board", "label": "LfA board (Vorstand)", "kind": "committee", "parent": "lfa", "cite": ["c60"]},
        {"id": "lfa-kredit", "label": "LfA credit committee", "kind": "unit", "parent": "lfa-board", "cite": ["c62"]}
      ],
      "cite": ["c59"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "de", "label": "GmbH", "steps": [
        {"id": "sk-talk", "label": "Savings bank: indicative LfA Universalkredit with HaftungPlus for the GmbH", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["w5"]},
        {"id": "gmbh-cap", "label": "Capitalise the GmbH from the round", "start": 4, "end": 4.5, "owner": "client", "status": "planned", "depends_on": ["close"], "cite": ["judgement"]},
        {"id": "move-contracts", "label": "Move German contracting only after the GmbH line is agreed", "start": 0, "end": 4.5, "owner": "client", "status": "blocked", "cite": ["judgement"]}]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-holding", "label": "If the holding moves to Germany: recheck EIFO eligibility", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}]}
    ]
  },
  "risks_flags": [
    {"id": "gmbh-thin", "kind": "deal_breaker", "severity": "high", "title": "GmbH balance sheet too thin for a €3m+ line", "fix": "Capitalise the GmbH from the round, or a parent support letter", "cite": ["judgement"]},
    {"id": "tax", "kind": "flag", "severity": "medium", "title": "Moving contracting has tax and transfer-pricing effects", "fix": "Tax advisers to review before the term sheet fixes it", "cite": ["judgement"]},
    {"id": "holding-move", "kind": "flag", "severity": "high", "title": "A holding move could put EIFO out of reach", "fix": "Settle contracting-only vs. holding move with the lead first", "cite": ["unverified"]}
  ]
}
```

**New source**
- [w5]: [LfA Universalkredit](https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php), retrieved 18 Nov 2026: lists "Betriebsmittel" among the uses; "mit einer Haftungsfreistellung „Haftung Plus" jedoch 60 % des Kreditrisikos abnehmen"; maximum loan with the release €7.5m; "eine Bürgschaft der LfA bzw. der Bürgschaftsbank Bayern GmbH beantragt werden"
- [c59]–[c62]: LfA board page, https://www.lfa.de/website/de/lfa/organe/vorstand/index.php (sha256 b562194b64dd)

## Turn 8: the founder (answer, if_asked)

> A project is 300 to 800k, takes four to nine months to go live. Pipeline is about 40 million.

## Turn 8: Wincent

The pipeline makes the case: a €3m line caps how fast you can grow. These figures are illustrative; please correct my assumptions.

**Assumptions:** an average project of €550k, of which 70% is your own cost paid upfront (about €385k), tied up for 6.5 months on average.

- **Today's €3m line** carries about 8 projects at once, or roughly 14 a year. That's about €8m of revenue a year (judgement).
- **Base case:** you win half of the €40m over two years, so €10m a year. That ties up about €3.8m on average, more at peaks. You're already at the line's limit (judgement).
- **Fast case:** the whole €40m converts within a year. That ties up about €15m (judgement).

**What it means:**
- Both public doors are big enough. EIFO has no maximum [c8], and LfA's risk release goes up to €7.5m per loan [w5]. A €4–8m need split between the two entities fits.
- **For your investors:** funding the cycle with equity would take €4–15m of the round, depending on how fast you win. That's dilution for cash that comes back within the year (judgement).

**Not yet:** don't size the lines to the full €40m. Banks will lend against contracted orders, not the pipeline (judgement).

Three numbers settle the sizing: your win rate, how much of each contract is upfront cost, and the Danish/German split. With those, I'll move to the plan.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the round",
  "stage": "prioritise",
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 4000000, "amount_max": 15000000, "label": "Cash tied up in projects: ~€4m base case, ~€15m if the full €40m pipeline converts in a year (illustrative)"},
    "instruments": [
      {"id": "dk-line", "name": "Existing ApS working-capital line", "type": "loan", "amount": 3000000, "terms": "Carries ~8 projects at once, ~€8m revenue a year; at capacity in the base case", "status": "secured", "cite": ["judgement"]},
      {"id": "gmbh-loan", "name": "GmbH working-capital line: LfA Universalkredit with HaftungPlus", "type": "guarantee_debt", "amount": 3000000, "amount_max": 7500000, "terms": "Carries German project pre-finance; LfA takes 60% of the bank's risk; max €7.5m per loan", "status": "planned", "cite": ["w5"]},
      {"id": "dk-expand", "name": "ApS line with EIFO cover", "type": "guarantee_debt", "amount": 3000000, "terms": "Carries Danish project pre-finance; no maximum facility size", "status": "planned", "cite": ["c1", "c8"]}
    ]
  },
  "risks_flags": [
    {"id": "growth-cap", "kind": "flag", "severity": "high", "title": "The €3m line caps revenue at roughly €8m a year", "fix": "Expand lines with public cover, sized to contracted orders", "cite": ["judgement"]},
    {"id": "size-to-orders", "kind": "flag", "severity": "medium", "title": "Banks lend against contracted orders, not pipeline", "fix": "Bring the order book and win rates to the bank", "cite": ["judgement"]}
  ]
}
```

## Turn 9: the founder (prioritise, script)

> Which two or three should we actually go for, and what will each cost us in time and effort?

## Turn 9: Wincent

Go for these three, in this order. The time and effort figures are my estimates (judgement) unless a source is cited.

**1. The Munich savings bank: LfA Universalkredit with HaftungPlus for the GmbH.**
- This pays for German project costs once contracting moves, with LfA taking 60% of the bank's risk [w5].
- Effort: about 2–3 weeks of the CFO's time. The bank will need a GmbH business plan, the German order book, and proof that the round capitalises the GmbH.
- Time: about 2–3 months from first meeting to a commitment.
- Cost: the bank's rate, which it agrees with you from your credit standing and collateral [c48]. The fee for the risk release is unverified.

**2. Your Danish bank: grow the line under EIFO cover.**
- Most of the work is the bank's. You supply equity proof after the close and the Danish order book.
- Effort: about 1–2 weeks of CFO time. EIFO assesses each case individually and asks you to come "in good time" [w1].
- Cost: a one-off fee of DKK 10–20k [w1], plus a premium of 0.8% to 6.3% a year on the guaranteed amount [c4].

**3. Two low-effort probes this month, about a day each.**
- Ask the lead whether EIFO co-invests.
- Ask your Danish bank whether it holds an EU InvestEU guarantee, as Danske Bank does [w2].

**Parked:** the EIFO Growth Loan, the guarantee bank alone, leasing, and Hermes.

**Precedents:** I found none for either credit route. LfA has supported a Bavarian industrial SME through a different instrument (Haidl, register record, SA.121739). Ask both banks for their own similar cases.

**Your decision:** do you agree to this order, and is contracting-only the working assumption? If so, I'll move to the plan, the contacts and the first messages.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the round",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "1. Munich savings bank: LfA Universalkredit with 60% HaftungPlus for the GmbH's German projects.",
      "2. Danish bank: grow the ApS line under EIFO cover for Danish projects.",
      "3. Low-effort probes now: EIFO in the round; an InvestEU-backed bank line.",
      "Park the EIFO Growth Loan, the guarantee bank alone, leasing and Hermes."
    ],
    "confidence": "medium",
    "confidence_why": "Both products fit by their own terms; no close precedent found; depends on contracting-only.",
    "open_question": "Agree the order, with contracting-only as the working assumption?",
    "cite": ["w5", "c1", "w2", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU (InvestEU through Danish banks)", "doors": [
        {"id": "eu-danske", "name": "InvestEU guarantee, innovation and digitalisation window", "institution": "EIF via Danske Bank", "status": "probe", "why": "Low-effort probe: ask your bank if it holds EIF cover", "cite": ["w2"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (the ApS)", "country": "DK", "doors": [
        {"id": "eifo-eq", "name": "EIFO equity co-investment in the Series A", "institution": "EIFO", "status": "probe", "why": "One question to the lead", "cite": ["judgement"]},
        {"id": "eifo-cg", "name": "EIFO Contract Guarantee", "institution": "EIFO", "status": "park", "why": "Insurance, not liquidity; revisit if bank wants order cover", "cite": ["judgement"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany (the GmbH)", "country": "DE", "doors": [
        {"id": "kfw", "name": "KfW ERP-Förderkredit KMU", "institution": "KfW via house bank", "status": "park", "why": "LfA's Universalkredit covers the working capital more directly", "cite": ["judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 4000000, "amount_max": 15000000, "label": "Cash tied up in projects (illustrative)"},
    "instruments": [
      {"id": "gmbh-loan", "name": "GmbH line: LfA Universalkredit with HaftungPlus", "type": "guarantee_debt", "amount": 3000000, "amount_max": 7500000, "terms": "German project pre-finance; bank rate from credit standing and collateral; LfA takes 60% of risk", "status": "planned", "cite": ["w5", "c48"]},
      {"id": "eifo-cover", "name": "EIFO-Guarantee on the expanded ApS line", "type": "guarantee_debt", "terms": "Danish project pre-finance; DKK 10-20k fee plus 0.8-6.3% a year premium", "status": "planned", "cite": ["w1", "c4"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "probes", "label": "Probes (this month)", "steps": [
        {"id": "eifo-ask", "label": "Ask the lead whether EIFO co-invests", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "investeu-ask", "label": "Ask the Danish bank whether it holds InvestEU cover", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["w2"]}]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-parked", "label": "Parked: Growth Loan, guarantee bank alone, KfW, leasing, Hermes; revisit if a lead route stalls", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}]}
    ]
  },
  "risks_flags": [
    {"id": "no-precedent", "kind": "flag", "severity": "low", "title": "No close precedent found for either credit route", "fix": "Ask both banks for their own similar cases", "cite": ["judgement"]}
  ]
}
```

**New source:** the processing-time and fee lines come from [w1], the same EIFO-Guarantee January 2026 sheet: "Fixed fee of 10,000-20,000 DKK for guarantee amounts of 0-25 mDKK"; "Processing time varies depending on the size and complexity of the case - reach out to us in good time."

## Turn 10: the founder (who_to_call, script)

> Who do I call first, on the Danish side and at the banks, by role? And draft me the email.

## Turn 10: Wincent

Call the banks first, because both public products reach you through them [c5][c47]. Here's the order, by role:

**This week: your Danish bank's corporate relationship manager.** This is the door to EIFO. Ask for three things: a larger line under EIFO cover, release of your personal guarantees once the round closes, and whether the bank holds InvestEU cover [w2]. The email is below.

**Next: EIFO, one quiet call.** Use EIFO's call centre [w1] to reach an account manager for growth companies (P2). The aim is to pre-sound the case so it's known when the bank files. The head of the SME guarantee area is P1. Reach them only through the bank, or if the case stalls (judgement).

**This month: the savings bank's business-customer adviser in Munich.** This is the door to LfA [c47]. At LfA, promotional loans sit with one board member [c67] (I read that from the org chart's layout). Your P1 is the division head one level below. Go through the savings bank, not to the board (judgement).

**The political side** (the Danish business ministry above EIFO, the Bavarian economy ministry above LfA) needs no call now. Keep it in reserve in case a bank stalls (unverified).

---

**Subject:** Working-capital line: expansion with EIFO cover

Dear [name],

[Company] is closing a €12m Series A within about four months, led by [fund]. Our pipeline stands at roughly €40m. Today our €3m line limits us to about eight projects in flight.

We would like to discuss expanding the facility with an EIFO-Guarantee, to be in place at closing, and releasing the founders' personal guarantees once the new equity is in. We would also welcome your view on whether InvestEU cover is available on your side.

Could we meet in the next two weeks? I will bring the order book and the round terms.

Kind regards,
[Name], CEO

---

Would you like a German version for the savings bank as well?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the round",
  "stage": "advise",
  "answer": {
    "lines": [
      "Call your Danish bank this week: a larger line under EIFO cover, personal guarantees released at closing.",
      "Pre-sound EIFO through its call centre so the case is known when the bank files.",
      "This month, the Munich savings bank: LfA Universalkredit with 60% HaftungPlus for the GmbH.",
      "File both once the round closes and the GmbH is capitalised."
    ],
    "confidence": "medium",
    "confidence_why": "Both products fit by their own terms; bank appetite and pricing unknown; no close precedent.",
    "open_question": "Contracting-only, or a holding move?",
    "cite": ["c1", "c9", "w1", "w5", "c47"]
  },
  "stakeholders": {
    "institutions": [
      {"id": "dkbank", "name": "The ApS's Danish bank", "side": "market", "country": "DK", "units": [{"id": "corp", "name": "Corporate banking", "roles": [
        {"id": "rm", "role": "Corporate relationship manager", "priority": "P1", "reach": "Email this week (draft ready)", "status": "to_approach", "cite": ["c5", "judgement"]},
        {"id": "dk-credit", "role": "Head of SME credit", "priority": "P2", "reach": "Forwarded by the relationship manager", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-guar", "name": "Guarantees and loans", "roles": [
        {"id": "eifo-p1", "role": "Head of the SME guarantee and loan area", "priority": "P1", "reach": "Through the bank's filing, or escalate if stalled", "status": "to_approach", "cite": ["unverified"]},
        {"id": "eifo-p2", "role": "Account manager for growth companies", "priority": "P2", "reach": "EIFO call centre +45 31 51 94 21", "status": "to_approach", "cite": ["w1"]}]}]},
      {"id": "dk-min", "name": "Danish business ministry (EIFO's owner)", "side": "political", "country": "DK", "units": [{"id": "dk-min-u", "name": "Unit overseeing EIFO", "roles": [
        {"id": "dk-min-p1", "role": "Head of the unit overseeing EIFO", "priority": "P1", "reach": "Reserve; only if the bank route stalls", "status": "to_approach", "cite": ["unverified"]},
        {"id": "dk-min-p2", "role": "Case officer for export and investment finance", "priority": "P2", "reach": "Reserve", "status": "to_approach", "cite": ["unverified"]}]}]},
      {"id": "sk", "name": "The GmbH's Munich savings bank", "side": "market", "country": "DE", "units": [{"id": "sk-corp", "name": "Business customers", "roles": [
        {"id": "sk-rm", "role": "Business-customer adviser", "priority": "P1", "reach": "GmbH managing director, this month", "status": "to_approach", "cite": ["c47"]},
        {"id": "sk-credit", "role": "Head of business-customer lending", "priority": "P2", "reach": "Forwarded by the adviser", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-k", "name": "Promotional loans", "roles": [
        {"id": "lfa-board", "role": "Board member for promotional and individual loans", "priority": "P2", "reach": "Do not approach directly; top of the chain", "status": "to_approach", "cite": ["c67"]},
        {"id": "lfa-p1", "role": "Head of the promotional-loans division", "priority": "P1", "reach": "Through the savings bank's filing", "status": "to_approach", "cite": ["unverified"]}]}]},
      {"id": "by-min", "name": "Bavarian economy ministry", "side": "political", "country": "DE", "units": [{"id": "by-min-u", "name": "SME finance unit", "roles": [
        {"id": "by-min-p1", "role": "Head of the SME finance unit", "priority": "P1", "reach": "Reserve; only if the LfA route stalls", "status": "to_approach", "cite": ["unverified"]},
        {"id": "by-min-p2", "role": "Desk officer for LfA programmes", "priority": "P2", "reach": "Reserve", "status": "to_approach", "cite": ["unverified"]}]}]}
    ]
  },
  "process_maps": [
    {
      "id": "eifo-decision",
      "title": "How the EIFO-backed line gets decided",
      "explains": "Your bank expands the line; EIFO takes up to 80% of the loss on it after its own credit assessment.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "aps", "name": "The ApS", "side": "market"},
        {"id": "dkbank", "name": "Your Danish bank", "side": "market"},
        {"id": "eifo", "name": "EIFO", "side": "public-capital"}
      ],
      "steps": [
        {"id": "ask", "label": "Ask the bank for an expanded line with EIFO cover", "kind": "step", "actor": "aps", "timing": "this week", "cite": ["judgement"], "gates": [{"label": "The financing expands the bank's commitment", "cite": ["c9"]}, {"label": "Facility from DKK 2m", "cite": ["c8"]}]},
        {"id": "bank-credit", "label": "Bank assesses the expanded line", "kind": "decision", "actor": "dkbank", "timing": "2-4 weeks", "cite": ["judgement"], "gates": [{"label": "Order book and round terms provided", "cite": ["judgement"]}]},
        {"id": "eifo-file", "label": "Guarantee request goes to EIFO", "kind": "document", "actor": "dkbank", "timing": "after closing", "cite": ["c5", "unverified"], "gates": [{"label": "Positive equity and creditworthy", "cite": ["c2"]}, {"label": "Group at most 749 employees", "cite": ["c6"]}, {"label": "Not listed on a main exchange", "cite": ["c9"]}]},
        {"id": "eifo-assess", "label": "EIFO assesses the case individually", "kind": "decision", "actor": "eifo", "timing": "varies with size", "cite": ["w1"]},
        {"id": "issue", "label": "Guarantee issued: fee DKK 10-20k, premium 0.8-6.3% a year", "kind": "step", "actor": "eifo", "cite": ["w1", "c4"]}
      ],
      "flow": [{"from": "ask", "to": "bank-credit"}, {"from": "bank-credit", "to": "eifo-file", "label": "after the round closes"}, {"from": "eifo-file", "to": "eifo-assess"}, {"from": "eifo-assess", "to": "issue"}],
      "leverage": [
        {"id": "pre-sound", "at": "eifo-assess", "kind": "door_opener", "label": "Pre-sound EIFO before the bank files", "why": "EIFO asks to be contacted in good time", "how": "CEO calls EIFO's call centre for a growth-company account manager", "side": "public-capital", "cite": ["w1"]},
        {"id": "pg-release", "at": "bank-credit", "kind": "pressure_point", "label": "Release of personal guarantees", "why": "EIFO cover and new equity replace founder security", "how": "Make it part of the ask in the first meeting", "side": "market", "cite": ["judgement"]},
        {"id": "close-window", "at": "eifo-file", "kind": "timing_window", "label": "Round closing", "why": "Positive equity is the gate", "how": "File in the week after closing", "side": "market", "cite": ["c2"]}
      ],
      "cite": ["c5", "w1"]
    },
    {
      "id": "lfa-decision",
      "title": "How the GmbH's LfA line gets decided",
      "explains": "Applied and paid out at the savings bank; LfA can take 60% of the bank's risk.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "gmbh", "name": "The GmbH", "side": "market"},
        {"id": "sk", "name": "Munich savings bank", "side": "market"},
        {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital"}
      ],
      "steps": [
        {"id": "apply", "label": "Apply for the Universalkredit at the savings bank", "kind": "step", "actor": "gmbh", "timing": "this month", "cite": ["c47"], "gates": [{"label": "Turnover up to €500m", "cite": ["c46"]}, {"label": "Used for working capital (Betriebsmittel)", "cite": ["w5"]}, {"label": "GmbH capitalised from the round", "cite": ["judgement"]}]},
        {"id": "rate", "label": "Bank and GmbH agree the rate from credit standing and collateral", "kind": "decision", "actor": "sk", "cite": ["c48"]},
        {"id": "haftung", "label": "Bank asks LfA for 60% HaftungPlus release", "kind": "decision", "actor": "lfa", "cite": ["w5", "c49"], "gates": [{"label": "Loan up to €7.5m", "cite": ["w5"]}]},
        {"id": "payout", "label": "Loan paid out at the savings bank", "kind": "step", "actor": "sk", "cite": ["c47"]}
      ],
      "flow": [{"from": "apply", "to": "rate"}, {"from": "rate", "to": "haftung"}, {"from": "haftung", "to": "payout"}],
      "leverage": [
        {"id": "sk-door", "at": "sk", "kind": "door_opener", "label": "The savings bank you already bank with", "why": "LfA loans are applied for only at the house bank", "how": "GmbH managing director books the adviser", "side": "market", "cite": ["c47"]},
        {"id": "thin-bs", "at": "rate", "kind": "blocker", "label": "Thin GmbH balance sheet", "why": "Bank will not lend €3m+ to an 8-person entity without capital", "how": "Show the round's capitalisation of the GmbH", "side": "market", "cite": ["judgement"]}
      ],
      "cite": ["c47", "w5"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "dk", "label": "Danish line", "steps": [
        {"id": "bank-talk", "label": "Email and meet the Danish relationship manager", "start": 0.25, "end": 1, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "eifo-call", "label": "Pre-sound EIFO via call centre", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "cite": ["w1"]},
        {"id": "file", "label": "Bank files EIFO cover", "start": 4, "end": 5.5, "owner": "institution", "status": "planned", "depends_on": ["close"], "cite": ["c2"]}]},
      {"id": "de", "label": "GmbH", "steps": [
        {"id": "sk-talk", "label": "Meet the savings bank adviser: LfA with HaftungPlus", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["w5"]},
        {"id": "gmbh-cap", "label": "Capitalise the GmbH from the round", "start": 4, "end": 4.5, "owner": "client", "status": "planned", "depends_on": ["close"], "cite": ["judgement"]},
        {"id": "lfa-commit", "label": "LfA line committed", "start": 5.5, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["gmbh-cap"], "cite": ["judgement"]},
        {"id": "move-contracts", "label": "Move German contracting only after the GmbH line is agreed", "start": 0, "end": 5.5, "owner": "client", "status": "blocked", "cite": ["judgement"]}]},
      {"id": "round", "label": "Series A", "steps": [
        {"id": "close", "label": "Round closes", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-investeu", "label": "InvestEU into the European Competitiveness Fund: do bank guarantees continue?", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-holding", "label": "If the holding moves to Germany: recheck EIFO eligibility", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-machinery", "label": "Regina: machinery safety rules for the sensors", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}]}
    ]
  }
}
```

**New source:** [c67] LfA board page, https://www.lfa.de/website/de/lfa/organe/vorstand/index.php (sha256 b562194b64dd). It lists a board member with promotional and individual loans; that portfolio is assigned by the chart's layout.

## Turn 11: the founder (regulatory, script)

> A big customer asked if we're ready for the new EU Machinery Regulation. Is that a problem for any of this?

## Turn 11: Wincent

It could be. Whether it is depends on the regulatory answer, and that belongs to Regina, my colleague on regulation. Here's what I can tell you, and what it means for the money.

**The facts.** The Machinery Regulation replaces the old Machinery Directive [c68]. Its idea of a "safety component" now includes digital devices and safety software [c71], so sensors like yours may fall under it. If your sensors use AI, extra requirements for AI safety components follow by delegated acts. Those apply by 2 August 2028 [c70]. The main date of application, which I believe is January 2027, is unverified here.

**Why it touches the plan:**
- **The order book is your collateral.** If customers hold orders until you show compliance, go-lives slip and you need a bigger line. Both banks will ask about it (judgement).
- **The investors' due diligence will ask too.** A clear answer protects the round's timing (judgement).
- **A real compliance cost,** such as a third-party conformity check, may itself be fundable later. Park that until Regina sizes it (judgement).

**I'm handing Regina three questions:**
1. Are your sensors safety components under the regulation?
2. Which conformity route applies to them?
3. Does any AI in the sensors trigger the 2028 requirements?

**Don't, yet:** tell the customer "yes, ready". A written answer goes out after Regina's read (judgement).

**Before she starts:** do your sensors make safety decisions with machine learning, or with fixed logic?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the round",
  "stage": "advise",
  "risks_flags": [
    {"id": "machinery-reg", "kind": "flag", "severity": "high", "title": "Machinery Regulation: sensors may be safety components; customers already asking", "fix": "Regina: classification, conformity route, AI requirements; one-page status before bank meetings and investor diligence", "cite": ["c68", "c71", "c70"]},
    {"id": "go-live-slip", "kind": "flag", "severity": "medium", "title": "Customers delaying orders over compliance would lengthen the cash cycle", "fix": "Size the lines with a slip buffer; show compliance status to the banks", "cite": ["judgement"]},
    {"id": "no-claim", "kind": "flag", "severity": "medium", "title": "Premature 'we are compliant' claim to a customer", "fix": "Answer in writing only after Regina's read", "cite": ["judgement"]}
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "reg", "label": "Regulatory (Regina)", "steps": [
        {"id": "regina-read", "label": "Regina: are the sensors safety components; which conformity route; AI rules", "start": 0.25, "end": 1.5, "owner": "us", "status": "active", "cite": ["c71", "c70"]},
        {"id": "status-page", "label": "One-page compliance status for banks, investors and the customer", "start": 1.5, "end": 2, "owner": "client", "status": "planned", "depends_on": ["regina-read"], "cite": ["judgement"]},
        {"id": "no-claim-yet", "label": "No compliance claim to customers before Regina's read", "start": 0, "end": 1.5, "owner": "client", "status": "blocked", "cite": ["judgement"]}]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-machinery", "label": "Machinery Regulation main application date (believed Jan 2027)", "start": "2027-01-20", "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-ai-machinery", "label": "AI safety-component requirements apply by", "start": "2028-08-02", "milestone": true, "owner": "us", "status": "planned", "cite": ["c70"]}]}
    ]
  }
}
```

**New sources**
- [c68]: Regulation (EU) 2023/1230 on machinery, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1230 (sha256 d9f3d8c7eb94)
- [c71]: same, recital 19: "the definition of safety components should cover not only physical devices but also digital devices"
- [c70]: Regulation (EU) 2026/1744 (Digital Omnibus on AI), https://eur-lex.europa.eu/legal-content/AUTO/?uri=CELEX:32026R1744 (sha256 5c3a446567ec): "Those delegated acts shall apply by 2 August 2028."

## Turn 12: the founder (brief, script)

> We are running out of time on our side. Can you write up what we have as a brief now?

## Turn 12: Wincent

# Brief: public money for the cash cycle and the Series A

**The read.** You sell forklift safety sensors through a Danish ApS (about 37 people) and a Munich GmbH (8 people, sales and installation). Customers are in Denmark and Germany. Each project costs €300–800k upfront and pays out at go-live 4–9 months later. You have a €3m line that is expensive and backed by the founders' personal guarantees. You are raising a €12m Series A, closing in about four months, probably led by a German fund that wants German contracting moved into the GmbH. **The deciding fact:** whichever entity carries the upfront cost decides which public lender carries it with you.

**Recommendation.** Fund the project cycle with bank lines where the state takes most of the risk, not with equity. Your bank's lending at risk falls sharply, and that is the case for releasing the personal guarantees (judgement).

- **German projects (GmbH):** LfA's Universalkredit through your Munich savings bank. It pays for working capital, and LfA takes 60% of the bank's risk on loans up to €7.5m [w5].
- **Danish projects (ApS):** expand the Danish line under an EIFO-Guarantee covering up to 80% of the loss [c1]. Only an expansion qualifies [c9], and it needs positive equity, which the round provides [c2].

Doing it this way keeps the €12m for growth. Funding the cycle with equity would cost about 5% of the company per €3m (illustrative, judgement). The two also work together: the round makes the cheap lines possible.

**Options weighed**
| Route | Status | Why |
|---|---|---|
| LfA Universalkredit + HaftungPlus (GmbH) | Lead for German projects | Working capital, 60% of risk off the bank, up to €7.5m [w5] |
| EIFO-Guarantee on an expanded ApS line | Lead for Danish projects | Up to 80% cover; fee DKK 10–20k; premium 0.8–6.3% a year [c1][w1][c4] |
| EIFO equity in the round | Probe | One question to the lead (judgement) |
| InvestEU cover via your Danish bank | Probe | Danske Bank holds EU cover with an innovation and digitalisation window [w2] |
| EIFO Growth Loan | Parked | CIBOR + 4–10% [c56]; can't carry guarantee cover on top [c52] |
| Bürgschaftsbank alone | Parked | Caps at €1m per borrower [c16] |
| KfW ERP loan | Parked | LfA covers working capital more directly (judgement) |
| Customer leasing | Parked, sales aid only | Makes the offer dearer and may still pay out at acceptance (judgement) |
| Hermes export cover | Parked | The GmbH sells in Germany, so it doesn't export (judgement) |
| More equity for the cycle | Not recommended | Dearest money for a cost that comes back within the year (judgement) |

**The plan.** Time and effort figures are estimates (judgement).
- **This week:** email the Danish bank's relationship manager (draft below). Ask the lead whether EIFO co-invests. Hand the Machinery Regulation question to Regina.
- **This month:** pre-sound EIFO through its call centre [w1]. Meet the savings bank's business-customer adviser and ask for an indicative LfA Universalkredit with HaftungPlus. Get the cash-cycle figures from the CFO.
- **This quarter, at closing:** the bank files EIFO cover once equity is positive [c2]. Capitalise the GmbH from the round. LfA commits on the GmbH line.
- **Then:** move German contracting into the GmbH.
- **Not yet:**
  - Don't let the bank put up a new line before EIFO is in the file [c9].
  - Don't move contracting before the GmbH line is agreed.
  - Don't use the round to pay down the line.
  - Don't claim Machinery Regulation compliance to a customer yet.

**Who.** Names only where verified; the rest are roles.
- **Danish line:**
  - Bank side: the corporate relationship manager decides your ask (P1). The head of SME credit sits behind them (P2).
  - EIFO: the head of the SME guarantee area decides (P1, unverified function name). A growth-company account manager is your first contact, through the call centre (P2) [w1].
  - Political side, held in reserve: the Danish business ministry unit that oversees EIFO (unverified).
- **German line:**
  - Bank side: the savings bank's business-customer adviser (P1, the door) [c47]. The head of business lending (P2).
  - LfA: the head of the promotional-loans division (P1, unverified). A board member holds promotional loans [c67]; don't write to the board.
  - Political side, held in reserve: the Bavarian economy ministry's SME finance unit (unverified).

**What to expect**
- **EIFO.** The steps:
  - The bank assesses the expanded line, in about 2–4 weeks (judgement).
  - After closing, the guarantee request goes to EIFO. You must have positive equity, at most 749 employees in the group, a facility of at least DKK 2m, and no listing [c2][c6][c8][c9].
  - EIFO assesses each case individually, so timing varies [w1].
  - The guarantee is issued with its fee and premium [w1][c4].
  - Odds: good if the order book is solid (judgement). I found no published precedent.
- **LfA.** The steps:
  - You apply at the savings bank [c47], within the €500m turnover limit [c46].
  - The bank sets the rate from your credit standing and collateral [c48].
  - LfA takes 60% of the risk [w5].
  - The loan is paid out at the savings bank [c47].
  - About 2–3 months in all (judgement). The main obstacle is the GmbH's thin balance sheet, which the round's capital fixes (judgement). I found no close precedent; LfA has supported an industrial SME through a different instrument (Haidl, register record, SA.121739).

**Risks and flags**
- **The GmbH's balance sheet is thin.** Capitalise it from the round (judgement).
- **EIFO covers only an expansion of the line.** Frame the ask as an expansion [c9].
- **Moving the holding company to Germany could put EIFO out of reach.** Settle with the lead whether it's contracting only (unverified).
- **Tax and transfer pricing of the contracting move.** Your tax advisers should review it before the term sheet fixes it (judgement).
- **Size the lines to contracted orders, not the €40m pipeline.** Banks lend against orders (judgement).
- **Machinery Regulation, handed to Regina.** Are the sensors safety components? Its definition now covers digital devices and safety software [c71]. Which conformity route applies, and do the AI rules due by 2 August 2028 apply [c70]? If customers delay orders over this, the cash cycle lengthens (judgement).

**Watchlist**
- **Holding move:** recheck EIFO eligibility at the term sheet, around month 3 (unverified).
- **Machinery Regulation:** main application date believed to be January 2027 (unverified).
- **AI safety-component requirements:** apply by 2 August 2028 [c70].
- **InvestEU:** moving into the European Competitiveness Fund; check whether bank guarantees continue (unverified).
- **Parked routes:** review at month 6, or sooner if a bank stalls.
- **Aid ceilings:** may count across the group, so keep an aid register (unverified).
- **Accident-insurer prevention premiums for forklift assistance systems:** check by month 1 (unverified; the construction insurer funds person detection on construction machines [w4]).

**Open questions**
1. Is it contracting only, or the holding company too? This decides whether EIFO stays open.
2. Win rate, the share of each contract that is upfront cost, and the Danish/German split. These size both lines; today's estimate is €4–15m (illustrative).
3. Pre-money valuation and the average drawn amount on the line. These settle the equity-versus-debt comparison.
4. Do the sensors use machine learning or fixed logic? This decides the AI rules (for Regina).
5. Which Danish bank, and what rate today? If it's Danske Bank, InvestEU cover is in play [w2].

**Annex: email to the Danish relationship manager (agreed draft)**

> **Subject:** Working-capital line: expansion with EIFO cover
>
> Dear [name],
>
> [Company] is closing a €12m Series A within about four months, led by [fund]. Our pipeline stands at roughly €40m. Today our €3m line limits us to about eight projects in flight.
>
> We would like to discuss expanding the facility with an EIFO-Guarantee, to be in place at closing, and releasing the founders' personal guarantees once the new equity is in. We would also welcome your view on whether InvestEU cover is available on your side.
>
> Could we meet in the next two weeks? I will bring the order book and the round terms.
>
> Kind regards,
> [Name], CEO

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the round",
  "stage": "write_up",
  "answer": {
    "lines": [
      "Fund the project cycle with bank lines where the state takes the risk, not with equity.",
      "German projects: LfA Universalkredit via the Munich savings bank, 60% of risk released, up to €7.5m.",
      "Danish projects: expand the ApS line under EIFO cover (up to 80%), filed after the round closes.",
      "Capitalise the GmbH from the round; move contracting only once its line is agreed."
    ],
    "confidence": "medium",
    "confidence_why": "Both products fit by their own terms; bank appetite unknown; no close precedent; holding move open.",
    "open_question": "Contracting only, or the holding moved to Germany too?",
    "cite": ["w5", "c1", "c2", "c9", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU (InvestEU through Danish banks)", "doors": [
        {"id": "eu-danske", "name": "InvestEU guarantee, innovation and digitalisation window", "institution": "EIF via Danske Bank", "status": "probe", "why": "Ask your bank if it holds EIF cover", "cite": ["w2"]},
        {"id": "eu-kompas", "name": "InvestEU guarantees for riskier lending incl. start-ups", "institution": "EIF via Kompasbank", "status": "park", "why": "Only if your own bank cannot carry it", "cite": ["w3"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (the ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on an expanded ApS line", "institution": "EIFO via your Danish bank", "status": "open", "why": "Lead for Danish projects; expansion only, positive equity", "conditions": ["Positive equity", "Expands the bank's commitment", "Facility from DKK 2m", "Group at most 749 employees"], "cite": ["c1", "c2", "c6", "c8", "c9"]},
        {"id": "eifo-eq", "name": "EIFO equity co-investment", "institution": "EIFO", "status": "probe", "why": "One question to the lead", "cite": ["judgement"]},
        {"id": "eifo-gl", "name": "EIFO Growth Loan", "institution": "EIFO", "status": "park", "why": "Dear (CIBOR + 4-10%); no guarantee on top", "cite": ["c52", "c56"]},
        {"id": "eifo-cg", "name": "EIFO Contract Guarantee", "institution": "EIFO", "status": "park", "why": "Insurance, not liquidity", "cite": ["judgement"]},
        {"id": "eifo-match", "name": "EIFO Match Loan", "institution": "EIFO", "status": "park", "why": "Likely above the revenue limit; to confirm", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany (the GmbH)", "country": "DE", "doors": [
        {"id": "kfw", "name": "KfW ERP-Förderkredit KMU", "institution": "KfW via house bank", "status": "park", "why": "LfA covers working capital more directly", "cite": ["judgement"]},
        {"id": "hermes", "name": "Hermes export cover", "institution": "Federal export credit agency", "status": "park", "why": "The GmbH sells in Germany", "cite": ["judgement"]}
      ]},
      {"id": "by", "level": "regional", "label": "Bavaria (the GmbH)", "country": "DE", "doors": [
        {"id": "lfa", "name": "LfA Universalkredit with HaftungPlus", "institution": "LfA via the Munich savings bank", "status": "open", "why": "Lead for German projects: working capital, 60% risk release, up to €7.5m", "conditions": ["Applied at the house bank", "Turnover up to €500m", "GmbH capitalised"], "cite": ["w5", "c46", "c47"]},
        {"id": "bb", "name": "Bürgschaftsbank guarantee alone", "institution": "Land guarantee bank", "status": "park", "why": "Max €1m per borrower", "cite": ["c16"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Your customers", "country": "DE", "doors": [
        {"id": "lease", "name": "Third-party leasing", "institution": "A lessor", "status": "park", "why": "Sales aid only; dearer offer", "cite": ["judgement"]},
        {"id": "bg", "name": "Accident-insurer prevention premiums", "institution": "Berufsgenossenschaften", "status": "probe", "why": "Construction insurer funds person detection; forklift equivalent unverified", "cite": ["w4", "unverified"]}
      ]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "dkbank", "name": "The ApS's Danish bank", "side": "market", "country": "DK", "units": [{"id": "corp", "name": "Corporate banking", "roles": [
        {"id": "rm", "role": "Corporate relationship manager", "priority": "P1", "reach": "Email this week (draft agreed)", "status": "to_approach", "cite": ["judgement"]},
        {"id": "dk-credit", "role": "Head of SME credit", "priority": "P2", "reach": "Forwarded by the relationship manager", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-guar", "name": "Guarantees and loans", "roles": [
        {"id": "eifo-p1", "role": "Head of the SME guarantee and loan area", "priority": "P1", "reach": "Through the bank's filing", "status": "to_approach", "cite": ["unverified"]},
        {"id": "eifo-p2", "role": "Account manager for growth companies", "priority": "P2", "reach": "EIFO call centre +45 31 51 94 21", "status": "to_approach", "cite": ["w1"]}]}]},
      {"id": "dk-min", "name": "Danish business ministry (EIFO's owner)", "side": "political", "country": "DK", "units": [{"id": "dk-min-u", "name": "Unit overseeing EIFO", "roles": [
        {"id": "dk-min-p1", "role": "Head of the unit overseeing EIFO", "priority": "P1", "reach": "Reserve", "status": "to_approach", "cite": ["unverified"]},
        {"id": "dk-min-p2", "role": "Case officer for export and investment finance", "priority": "P2", "reach": "Reserve", "status": "to_approach", "cite": ["unverified"]}]}]},
      {"id": "sk", "name": "The GmbH's Munich savings bank", "side": "market", "country": "DE", "units": [{"id": "sk-corp", "name": "Business customers", "roles": [
        {"id": "sk-rm", "role": "Business-customer adviser", "priority": "P1", "reach": "GmbH managing director, this month", "status": "to_approach", "cite": ["c47"]},
        {"id": "sk-credit", "role": "Head of business-customer lending", "priority": "P2", "reach": "Forwarded by the adviser", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-k", "name": "Promotional loans", "roles": [
        {"id": "lfa-p1", "role": "Head of the promotional-loans division", "priority": "P1", "reach": "Through the savings bank's filing", "status": "to_approach", "cite": ["unverified"]},
        {"id": "lfa-board", "role": "Board member for promotional and individual loans", "priority": "P2", "reach": "Do not approach directly", "status": "to_approach", "cite": ["c67"]}]}]},
      {"id": "by-min", "name": "Bavarian economy ministry", "side": "political", "country": "DE", "units": [{"id": "by-min-u", "name": "SME finance unit", "roles": [
        {"id": "by-min-p1", "role": "Head of the SME finance unit", "priority": "P1", "reach": "Reserve", "status": "to_approach", "cite": ["unverified"]},
        {"id": "by-min-p2", "role": "Desk officer for LfA programmes", "priority": "P2", "reach": "Reserve", "status": "to_approach", "cite": ["unverified"]}]}]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 4000000, "amount_max": 15000000, "label": "Cash tied up in projects: ~€4m base case to ~€15m if €40m converts in a year (illustrative)"},
    "instruments": [
      {"id": "round", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Dearest money: growth, buffer, GmbH capital and the equity base the guarantees need", "status": "in_progress", "cite": ["c2", "judgement"]},
      {"id": "dk-line", "name": "Existing ApS working-capital line", "type": "loan", "amount": 3000000, "terms": "Dear today: high price and personal guarantees; caps revenue near €8m a year", "status": "secured", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "EIFO-Guarantee on the expanded ApS line", "type": "guarantee_debt", "amount": 3000000, "terms": "Danish project pre-finance; EIFO takes up to 80% of loss; DKK 10-20k fee plus 0.8-6.3% a year", "status": "planned", "cite": ["c1", "w1", "c4"]},
      {"id": "gmbh-loan", "name": "GmbH line: LfA Universalkredit with HaftungPlus", "type": "guarantee_debt", "amount": 3000000, "amount_max": 7500000, "terms": "German project pre-finance; LfA takes 60% of the bank's risk; rate set by the bank", "status": "planned", "cite": ["w5", "c48"]},
      {"id": "gmbh-equity", "name": "Part of the round as GmbH capital", "type": "equity", "terms": "Gives the GmbH the balance sheet the savings bank needs", "status": "planned", "cite": ["judgement"]}
    ]
  },
  "process_maps": [
    {
      "id": "eifo-decision",
      "title": "How the EIFO-backed line gets decided",
      "explains": "Your bank expands the line; EIFO takes up to 80% of the loss after its own assessment.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "aps", "name": "The ApS", "side": "market"},
        {"id": "dkbank", "name": "Your Danish bank", "side": "market"},
        {"id": "eifo", "name": "EIFO", "side": "public-capital"}
      ],
      "steps": [
        {"id": "ask", "label": "Ask the bank for an expanded line with EIFO cover", "kind": "step", "actor": "aps", "timing": "this week", "cite": ["judgement"], "gates": [{"label": "The financing expands the bank's commitment", "cite": ["c9"]}, {"label": "Facility from DKK 2m", "cite": ["c8"]}]},
        {"id": "bank-credit", "label": "Bank assesses the expanded line", "kind": "decision", "actor": "dkbank", "timing": "2-4 weeks", "cite": ["judgement"], "gates": [{"label": "Order book and round terms provided", "cite": ["judgement"]}]},
        {"id": "eifo-file", "label": "Guarantee request goes to EIFO", "kind": "document", "actor": "dkbank", "timing": "after closing", "cite": ["c5", "unverified"], "gates": [{"label": "Positive equity and creditworthy", "cite": ["c2"]}, {"label": "Group at most 749 employees", "cite": ["c6"]}, {"label": "Not listed on a main exchange", "cite": ["c9"]}]},
        {"id": "eifo-assess", "label": "EIFO assesses the case individually", "kind": "decision", "actor": "eifo", "timing": "varies with size", "cite": ["w1"]},
        {"id": "issue", "label": "Guarantee issued: fee DKK 10-20k, premium 0.8-6.3% a year", "kind": "step", "actor": "eifo", "cite": ["w1", "c4"]}
      ],
      "flow": [{"from": "ask", "to": "bank-credit"}, {"from": "bank-credit", "to": "eifo-file", "label": "after the round closes"}, {"from": "eifo-file", "to": "eifo-assess"}, {"from": "eifo-assess", "to": "issue"}],
      "leverage": [
        {"id": "pre-sound", "at": "eifo-assess", "kind": "door_opener", "label": "Pre-sound EIFO before the bank files", "why": "EIFO asks to be contacted in good time", "how": "CEO calls EIFO's call centre", "side": "public-capital", "cite": ["w1"]},
        {"id": "pg-release", "at": "bank-credit", "kind": "pressure_point", "label": "Release of personal guarantees", "why": "EIFO cover and new equity replace founder security", "how": "Part of the first ask", "side": "market", "cite": ["judgement"]},
        {"id": "close-window", "at": "eifo-file", "kind": "timing_window", "label": "Round closing", "why": "Positive equity is the gate", "how": "File in the week after closing", "side": "market", "cite": ["c2"]}
      ],
      "cite": ["c5", "w1"]
    },
    {
      "id": "lfa-decision",
      "title": "How the GmbH's LfA line gets decided",
      "explains": "Applied and paid out at the savings bank; LfA can take 60% of the bank's risk.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "gmbh", "name": "The GmbH", "side": "market"},
        {"id": "sk", "name": "Munich savings bank", "side": "market"},
        {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital"}
      ],
      "steps": [
        {"id": "apply", "label": "Apply for the Universalkredit at the savings bank", "kind": "step", "actor": "gmbh", "timing": "this month", "cite": ["c47"], "gates": [{"label": "Turnover up to €500m", "cite": ["c46"]}, {"label": "Used for working capital", "cite": ["w5"]}, {"label": "GmbH capitalised from the round", "cite": ["judgement"]}]},
        {"id": "rate", "label": "Bank and GmbH agree the rate from credit standing and collateral", "kind": "decision", "actor": "sk", "cite": ["c48"]},
        {"id": "haftung", "label": "Bank asks LfA for 60% HaftungPlus release", "kind": "decision", "actor": "lfa", "cite": ["w5", "c49"], "gates": [{"label": "Loan up to €7.5m", "cite": ["w5"]}]},
        {"id": "payout", "label": "Loan paid out at the savings bank", "kind": "step", "actor": "sk", "cite": ["c47"]}
      ],
      "flow": [{"from": "apply", "to": "rate"}, {"from": "rate", "to": "haftung"}, {"from": "haftung", "to": "payout"}],
      "leverage": [
        {"id": "sk-door", "at": "sk", "kind": "door_opener", "label": "The savings bank you already bank with", "why": "LfA loans are applied for only at the house bank", "how": "GmbH managing director books the adviser", "side": "market", "cite": ["c47"]},
        {"id": "thin-bs", "at": "rate", "kind": "blocker", "label": "Thin GmbH balance sheet", "why": "Bank will not lend €3m+ to an 8-person entity without capital", "how": "Show the round's capitalisation of the GmbH", "side": "market", "cite": ["judgement"]}
      ],
      "cite": ["c47", "w5"]
    }
  ],
  "hierarchies": [
    {
      "id": "field",
      "title": "Who sits under whom",
      "explains": "EIFO and EU cover reach the ApS through its Danish bank; LfA reaches the GmbH through its savings bank.",
      "nodes": [
        {"id": "eif", "label": "EIF (InvestEU)", "kind": "institution", "cite": ["w2"]},
        {"id": "danske", "label": "Danish banks holding EIF cover", "kind": "channel", "parent": "eif", "status": "probe", "cite": ["w2", "w3"]},
        {"id": "eifo", "label": "EIFO", "kind": "institution", "cite": ["c5"]},
        {"id": "eifo-g", "label": "EIFO-Guarantee to your bank", "kind": "instrument", "parent": "eifo", "status": "open", "note": "Up to 80% of loss on an expanded line", "cite": ["c1", "c9"]},
        {"id": "eifo-gl", "label": "EIFO Growth Loan", "kind": "instrument", "parent": "eifo", "status": "park", "cite": ["c52"]},
        {"id": "eifo-eq", "label": "EIFO equity co-investment", "kind": "instrument", "parent": "eifo", "status": "probe", "cite": ["judgement"]},
        {"id": "lfa", "label": "LfA Förderbank Bayern", "kind": "regional_body", "status": "open", "note": "Universalkredit with 60% HaftungPlus via the savings bank", "cite": ["c59", "w5"]},
        {"id": "lfa-board", "label": "LfA board (Vorstand)", "kind": "committee", "parent": "lfa", "cite": ["c60"]},
        {"id": "lfa-kredit", "label": "LfA credit committee", "kind": "unit", "parent": "lfa-board", "cite": ["c62"]},
        {"id": "hb", "label": "The GmbH's Munich savings bank", "kind": "channel", "parent": "lfa", "cite": ["c47"]},
        {"id": "bb", "label": "Bürgschaftsbank (Land guarantee bank)", "kind": "regional_body", "status": "park", "note": "Max €1m per borrower", "cite": ["c16"]},
        {"id": "kfw", "label": "KfW ERP-Förderkredit KMU", "kind": "programme", "status": "park", "cite": ["c30"]}
      ],
      "cite": ["c5", "c59"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "probes", "label": "Probes", "steps": [
        {"id": "eifo-ask", "label": "Ask the lead whether EIFO co-invests", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "investeu-ask", "label": "Ask the Danish bank whether it holds InvestEU cover", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["w2"]}]},
      {"id": "dk", "label": "Danish line", "steps": [
        {"id": "bank-talk", "label": "Email and meet the Danish relationship manager", "start": 0.25, "end": 1, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "eifo-call", "label": "Pre-sound EIFO via call centre", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "cite": ["w1"]},
        {"id": "no-line-yet", "label": "No new line before EIFO is in the file", "start": 0, "end": 4, "owner": "client", "status": "blocked", "cite": ["c9"]},
        {"id": "file", "label": "Bank files EIFO cover", "start": 4, "end": 5.5, "owner": "institution", "status": "planned", "depends_on": ["close"], "cite": ["c2"]}]},
      {"id": "de", "label": "GmbH", "steps": [
        {"id": "sk-talk", "label": "Savings bank: indicative LfA Universalkredit with HaftungPlus", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["w5"]},
        {"id": "gmbh-cap", "label": "Capitalise the GmbH from the round", "start": 4, "end": 4.5, "owner": "client", "status": "planned", "depends_on": ["close"], "cite": ["judgement"]},
        {"id": "lfa-commit", "label": "LfA line committed", "start": 5.5, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["gmbh-cap"], "cite": ["judgement"]},
        {"id": "move-contracts", "label": "Move German contracting only after the GmbH line is agreed", "start": 0, "end": 5.5, "owner": "client", "status": "blocked", "cite": ["judgement"]}]},
      {"id": "round", "label": "Series A", "steps": [
        {"id": "close", "label": "Round closes", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "no-paydown", "label": "Do not use the round to pay down the line", "start": 4, "end": 6, "owner": "client", "status": "blocked", "cite": ["judgement"]}]},
      {"id": "reg", "label": "Regulatory (Regina)", "steps": [
        {"id": "regina-read", "label": "Regina: safety-component status, conformity route, AI rules", "start": 0.25, "end": 1.5, "owner": "us", "status": "active", "cite": ["c71", "c70"]},
        {"id": "status-page", "label": "One-page compliance status for banks, investors, customer", "start": 1.5, "end": 2, "owner": "client", "status": "planned", "depends_on": ["regina-read"], "cite": ["judgement"]},
        {"id": "no-claim-yet", "label": "No compliance claim to customers before Regina's read", "start": 0, "end": 1.5, "owner": "client", "status": "blocked", "cite": ["judgement"]}]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-holding", "label": "Holding move: recheck EIFO eligibility at term sheet", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-machinery", "label": "Machinery Regulation main application (believed Jan 2027)", "start": "2027-01-20", "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-ai-machinery", "label": "AI safety-component requirements apply by", "start": "2028-08-02", "milestone": true, "owner": "us", "status": "planned", "cite": ["c70"]},
        {"id": "w-investeu", "label": "InvestEU into the European Competitiveness Fund: bank guarantees continue?", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-parked", "label": "Review parked routes (Growth Loan, guarantee bank, KfW, leasing, Hermes)", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]},
        {"id": "w-bg", "label": "Accident-insurer premiums for forklift assistance systems", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-deminimis", "label": "Aid ceilings across the group: keep a register", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["unverified"]}]}
    ]
  },
  "risks_flags": [
    {"id": "gmbh-thin", "kind": "deal_breaker", "severity": "high", "title": "GmbH balance sheet too thin for a €3m+ line", "fix": "Capitalise the GmbH from the round", "cite": ["judgement"]},
    {"id": "expand", "kind": "deal_breaker", "severity": "high", "title": "EIFO covers only an expansion of the bank's commitment", "fix": "Frame the ask as an expanded line", "cite": ["c9"]},
    {"id": "equity", "kind": "deal_breaker", "severity": "high", "title": "EIFO needs positive equity", "fix": "File after the round closes", "cite": ["c2"]},
    {"id": "holding-move", "kind": "flag", "severity": "high", "title": "A holding move could put EIFO out of reach", "fix": "Settle contracting-only with the lead", "cite": ["unverified"]},
    {"id": "machinery-reg", "kind": "flag", "severity": "high", "title": "Machinery Regulation: sensors may be safety components", "fix": "Regina's read, then a one-page status", "cite": ["c68", "c71", "c70"]},
    {"id": "tax", "kind": "flag", "severity": "medium", "title": "Tax and transfer pricing of moving contracting", "fix": "Tax advisers before the term sheet", "cite": ["judgement"]},
    {"id": "size-to-orders", "kind": "flag", "severity": "medium", "title": "Banks lend against contracted orders, not pipeline", "fix": "Bring order book and win rates", "cite": ["judgement"]},
    {"id": "combine", "kind": "flag", "severity": "medium", "title": "EIFO guarantee and EIFO 1:1 co-financing do not stack", "fix": "Guarantee on the bank line; Growth Loan parked", "cite": ["c52"]},
    {"id": "cost-to-customer", "kind": "flag", "severity": "medium", "title": "Leasing moves cost to customers", "fix": "Optional sales aid only", "cite": ["judgement"]},
    {"id": "investor-push", "kind": "flag", "severity": "medium", "title": "Investors prefer more equity for the cycle", "fix": "Show dilution vs line cost with real figures", "cite": ["judgement"]},
    {"id": "no-precedent", "kind": "flag", "severity": "low", "title": "No close precedent for either credit route", "fix": "Ask both banks for their own cases", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [c1]–[c9]: EIFO-Guarantee product sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (sha256 c3f998cb12f6)
- [c13], [c14], [c16]: Verband Deutscher Bürgschaftsbanken FAQ, https://www.vdb-info.de/de/ueber-uns/nutzliche-infos/faq/ (sha256 30ddc2628aa5)
- [c30]: KfW ERP-Förderkredit KMU sheet, https://kfw.de/PDF/Download-Center/Förderprogramme-(Inlandsförderung)/PDF-Dokumente/6000004842_M_365.pdf (sha256 31b2116df386)
- [c46]–[c49]: LfA Universalkredit, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php (sha256 53c9bc96566b)
- [c52]–[c56]: EIFO Growth Loan sheet 2026, https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf (sha256 6dfac0993cfe)
- [c59]–[c62], [c67]: LfA board page, https://www.lfa.de/website/de/lfa/organe/vorstand/index.php (sha256 b562194b64dd). The board member's portfolio is assigned by the chart's layout.
- [c68], [c71]: Regulation (EU) 2023/1230, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1230 (sha256 d9f3d8c7eb94)
- [c70]: Regulation (EU) 2026/1744, https://eur-lex.europa.eu/legal-content/AUTO/?uri=CELEX:32026R1744 (sha256 5c3a446567ec)
- [w1]: [EIFO-Guarantee, Jan 2026](https://eifo.dk/media/ykebr4xj/eifo-guarantee-jan-2026.pdf), retrieved 18 Nov 2026: "Specific orders, e.g., processing credits, advance payment guarantees, performance guarantees"; "Credit facilities for financing the company's ongoing working capital"; "Fixed fee of 10,000-20,000 DKK for guarantee amounts of 0-25 mDKK"; "reach out to us in good time"
- [w2]: [EIF and Danske Bank](https://www.eif.org/press/all/eif-guarantee-unlocks-eur178-million-in-new-lending-for-nordic-smes-through-danske-bank), 6 May 2025, retrieved 18 Nov 2026: "supported by the European Commission under its InvestEU programme"; "The remaining two-fifths will target innovation and digitalisation"
- [w3]: [EIF and Kompasbank](https://www.eif.org/press/all/kompasbank-to-provide-over-eur-175-million-in-new-cheaper-loans-to-danish-smes-through-european-guarantee), 3 Jul 2024, retrieved 18 Nov 2026: "The agreements are supported by the InvestEU programme"
- [w4]: [BG BAU, camera-based person detection requirements](https://www.bgbau.de/fileadmin/Produkte/Arbeitsschutzpraemie/Kamerabasierte_Personenerkennungsysteme_Anforderungen.pdf), retrieved 18 Nov 2026 via search summary only, not opened
- [w5]: [LfA Universalkredit](https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php), retrieved 18 Nov 2026: "Betriebsmittel"; "mit einer Haftungsfreistellung „Haftung Plus" jedoch 60 % des Kreditrisikos abnehmen"; release up to €7.5m
- Register record: Haidl Fenster und Türen GmbH, LfA, https://competition-cases.ec.europa.eu/cases/SA.121739
