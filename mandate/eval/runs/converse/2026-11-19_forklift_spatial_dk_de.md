# Simulated conversation: forklift_spatial_dk_de

Case: `mandate/eval/scenarios/forklift_spatial_dk_de.yaml`. Brain: Wincent. Playbooks at be5c8fd812. 2026-11-19T21:17:41+00:00. 13 turns (script 12/12; stopped: wrapped_up; client agent called 4x).
Leave-one-out case library: 3 entries left out (forklift_mispriced_market_velocity, forklift_regulatory_flag_to_regina, forklift_risk_not_to_customer).

## Turn 1: the founder (opener, script)

> We sell forklift safety sensors. We pay everything upfront, get paid at go-live, and it kills our cash. We're also raising. Can the state help?

## Turn 1: Wincent

This is a working-capital problem, not an R&D one. You pay for the hardware and installation before each project and get paid only at go-live, so every new order costs you cash. Lenders price that risk badly because they can't judge your projects. Public guarantees and co-lending exist to fix exactly that kind of gap (judgement). The fact that you're raising matters too: some public lenders match a private round, because the investors have already done the due diligence (judgement).

From what you've told me: the main cost to fund is project working capital, and the raise is the timing trigger. Three things decide which doors open:

1. **Where are you incorporated, and where do you have staff?** Each country has its own promotional bank, and its loans and guarantees usually reach you through your own bank there. Which bank do you use?
2. **The raise: how much, who leads, and when does it close?** Matching loans normally have to be applied for before the round closes. Before close, matching can lead. After close, your own bank is the way in.
3. **Your cash cycle: typical cash tied up per project, months from paying out to go-live, projects per year?** As an illustration (judgement): if a project ties up €150k for 6 months, a €1m revolving line carries about 6 to 7 projects at once, some 13 a year. I need your real numbers to size the ask.

**Safe whatever you answer:** don't sign final round documents until we've checked whether a matching loan has to be filed first (judgement).

**Not yet:** making customers pay upfront or lease. It makes your offer less competitive. The better fix is to have the public side carry the risk (judgement).

Where are you set up, and with which bank?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "qualify",
  "hierarchies": [
    {
      "id": "field",
      "title": "How public money usually reaches a company like yours",
      "explains": "Working-capital support usually reaches you through your own bank, with a public body carrying part of the risk. A raise can open a separate matching-loan door. Which countries apply depends on where you are set up.",
      "nodes": [
        {"id": "eu", "label": "EU guarantee layer (backs banks and funds)", "kind": "institution", "status": "probe", "note": "Covers part of your bank's risk on your working-capital line; country to confirm.", "cite": ["unverified"]},
        {"id": "nat", "label": "National promotional bank (your country)", "kind": "institution", "status": "probe", "note": "Lends or guarantees through your bank, or matches a private round.", "cite": ["judgement"]},
        {"id": "wc", "label": "Guarantee on your working-capital line", "kind": "instrument", "parent": "nat", "status": "probe", "note": "Funds project cash before go-live.", "cite": ["judgement"]},
        {"id": "match", "label": "Matching loan alongside your round", "kind": "instrument", "parent": "nat", "status": "probe", "note": "Normally filed before the round closes.", "cite": ["judgement"]},
        {"id": "bank", "label": "Your house bank", "kind": "channel", "parent": "wc", "status": "probe", "note": "The usual door for the guarantee. Which bank is it?", "cite": ["judgement"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "risks_flags": [
    {"id": "close-before-file", "kind": "flag", "severity": "high", "title": "Closing the round before filing a matching-loan request may shut that door", "fix": "Hold final signing until the filing rule is checked for your country.", "cite": ["judgement"]},
    {"id": "push-to-customer", "kind": "flag", "severity": "medium", "title": "Moving the upfront cost onto customers weakens your offer", "fix": "Fund your own projects, with the public side de-risking the line; use customer-side levers only as a complement.", "cite": ["judgement"]}
  ]
}
```

## Turn 2: the founder (answer, if_asked)

> Danish ApS is the parent and signs most contracts, even German ones. We have a GmbH in Munich, about 8 people doing sales and installation.
> 
> A Danish bank for the ApS and a savings bank in Munich for the GmbH. About 3 million working-capital line, expensive, and we gave personal guarantees.
> 
> Series A, 12 million. We have a lead in talks, closing in about four months.
> 
> A project is 300 to 800k, takes four to nine months to go live. Pipeline is about 40 million.

## Turn 2: Wincent

Your numbers show the problem clearly. Take the midpoints, about €550k per project and 6.5 months to go-live. Your €3m line then carries roughly 5 projects at once, about 10 a year (judgement). Converting €40m of pipeline within a year would tie up around €20m at peak (judgement). The Series A can't fill that gap, and it shouldn't try. Equity is the most expensive money you can put into receivables.

**What I found:**

- **Denmark, through your ApS's bank.** EIFO, Denmark's state export and investment fund, covers up to 80% of your bank's final loss on a facility to an SME. The cap is 50% of the bank's total loss on you [c1][c5]. The cover runs on credits of up to three years [c3] and costs 0.8% to 6.3% a year, set by your rating [c4]. The deciding condition is that the financing must expand the bank's commitment [c9]. So this is a bigger line, not a cheaper version of the €3m you already have.
- **Germany, through the GmbH's savings bank.** A Bürgschaftsbank, a regional guarantee bank, can carry up to 80% of the default risk, applied for through your bank [c13][c14]. Its total guarantees per borrower are capped at €1m [c16]. Your GmbH employs people, but today it doesn't carry the project cost, because the ApS signs (judgement).
- **The raise.** EIFO also has loans that sit alongside private investors. I couldn't confirm their size or terms for a €12m Series A (unverified). I'll probe that next.

**One flag for Regina:** safety sensors on forklifts touch EU machinery safety rules, which can shape what lenders and customers ask of you. Regina should look at that, not me.

**Not yet:** don't ask the Danish bank to reprice the existing line. Ask for new headroom with EIFO cover, timed with the round (judgement).

**The question that decides the next step:** did the ApS show positive equity in its last accounts? That is an EIFO gate [c2]. If it didn't, the guarantee waits until the round closes.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "Where public cover can reach your two entities",
      "explains": "Each entity's own bank is the door: EIFO covers the Danish bank, a Bürgschaftsbank or LfA works through the Munich savings bank.",
      "nodes": [
        {"id": "dk", "label": "Denmark: ApS (signs contracts, carries project cost)", "kind": "channel", "cite": ["judgement"]},
        {"id": "eifo", "label": "EIFO", "kind": "institution", "parent": "dk", "cite": ["c5"]},
        {"id": "eifo-g", "label": "EIFO-Guarantee: up to 80% of the bank's final loss", "kind": "instrument", "parent": "eifo", "status": "open", "note": "Must expand the bank's commitment; positive equity required.", "cite": ["c1", "c2", "c9"]},
        {"id": "eifo-raise", "label": "EIFO loans alongside private investors", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "Fit for a 12m Series A to confirm.", "cite": ["unverified"]},
        {"id": "dk-bank", "label": "Your Danish bank", "kind": "channel", "parent": "eifo-g", "status": "open", "note": "Files with EIFO for a larger line.", "cite": ["judgement"]},
        {"id": "de", "label": "Germany: GmbH Munich (8 staff, sales and installation)", "kind": "channel", "cite": ["judgement"]},
        {"id": "bb", "label": "Bürgschaftsbank (Bavaria)", "kind": "institution", "parent": "de", "cite": ["c13"]},
        {"id": "bb-g", "label": "Ausfallbürgschaft: up to 80% of risk, max 1m per borrower", "kind": "instrument", "parent": "bb", "status": "probe", "note": "Only if the GmbH carries its own cost.", "cite": ["c14", "c16"]},
        {"id": "lfa", "label": "LfA Förderbank Bayern: loans through the house bank", "kind": "institution", "parent": "de", "status": "probe", "note": "House bank carries the risk unless LfA takes part.", "cite": ["c47", "c49"]},
        {"id": "kfw", "label": "KfW ERP loan through the house bank", "kind": "instrument", "parent": "de", "status": "probe", "note": "Applied for before the project starts.", "cite": ["c30"]},
        {"id": "de-bank", "label": "Your Munich savings bank", "kind": "channel", "parent": "bb-g", "status": "probe", "cite": ["c13"]}
      ],
      "cite": ["c1", "c13", "c47"]
    }
  ],
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 20000000, "label": "Illustrative peak working capital to convert 40m pipeline in a year"},
    "instruments": [
      {"id": "line", "name": "Existing working-capital line", "type": "loan", "amount": 3000000, "terms": "Carries project cash; dear because the bank cannot price your project risk", "status": "secured", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "New headroom with EIFO cover", "type": "guarantee_debt", "terms": "Same cost, cheaper: the state takes up to 80% of the bank's loss", "status": "probe", "cite": ["c1", "c4", "c9"]},
      {"id": "seriesA", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Dearest money: dilution and VC return targets; keep it for growth, not receivables", "status": "in_progress", "cite": ["judgement"]}
    ]
  },
  "risks_flags": [
    {"id": "equity-gate", "kind": "deal_breaker", "severity": "high", "title": "EIFO requires positive equity and creditworthiness", "fix": "Check the ApS's last accounts; if negative, file after the round closes.", "cite": ["c2"]},
    {"id": "new-money", "kind": "flag", "severity": "high", "title": "EIFO cover only on financing that expands the bank's commitment", "fix": "Ask for a larger line, not a reprice of the existing 3m.", "cite": ["c9"]},
    {"id": "bb-cap", "kind": "flag", "severity": "medium", "title": "German guarantee banks cap total guarantees at 1m per borrower", "fix": "Germany is a complement, not the main line.", "cite": ["c16"]},
    {"id": "personal-g", "kind": "flag", "severity": "medium", "title": "Founders' personal guarantees on the line", "fix": "Ask the bank to release them once public cover sits on the line.", "cite": ["judgement"]},
    {"id": "regina-machinery", "kind": "flag", "severity": "medium", "title": "Machinery safety rules for forklift sensors", "fix": "Handed to Regina for the regulatory read.", "cite": ["judgement"]},
    {"id": "close-before-file", "kind": "flag", "severity": "high", "title": "Closing the round before filing a matching-loan request may shut that door", "fix": "Hold final signing until the filing rule is checked.", "cite": ["judgement"]}
  ]
}
```

## Turn 3: the founder (options, script)

> OK, that is the picture. What are our options, broadly?

## Turn 3: Wincent

There are four families of options. Each one funds a different cost.

1. **Cover on a bigger line through your Danish bank.** This is the main door. EIFO guarantees the new headroom, not the €3m you already have [c9]. EIF guarantees under the EU's InvestEU programme are a second layer some Danish banks already carry. Danske Bank signed up to €178m in 2025, with two-fifths for innovation and digitalisation [w1]. If your bank holds such cover, it can lend more cheaply with no new filing from you (judgement).
2. **Debt alongside the Series A.** EIFO has loans that sit next to private investors, but I couldn't confirm their size for a €12m round (unverified). This sits between equity and the bank line. It suits growth costs such as hiring and product, not project cash (judgement).
3. **Germany, as a complement.** The GmbH's savings bank can bring in a Bürgschaftsbank, capped at €1m [c16], or LfA, Bavaria's state development bank [c47]. That only works for costs the GmbH carries itself (judgement).
4. **Customer-side support.** Grants or tax write-offs your customers can use for safety investment. They speed up sales but don't fix your cash (judgement).

Germany's export credit cover doesn't fit. The ApS is the exporter, not the GmbH (judgement).

**One thing you must know:** I found no recorded case of EIFO guaranteeing a line like yours. That makes your bank's appetite the first thing to test.

Which are you leaning toward? And which Danish bank is it? That tells me whether the EU layer is already in place.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "options",
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "investeu-bank", "name": "InvestEU guarantee held by your Danish bank", "institution": "EIF, through Danish banks", "via": "your bank's own agreement", "status": "probe", "why": "Some Danish banks already carry it; Danske's window includes innovation and digitalisation.", "conditions": ["Ask your bank whether it holds InvestEU cover", "Working-capital eligibility to confirm"], "cite": ["w1", "unverified"]},
        {"id": "eib-vd", "name": "EIB venture debt", "institution": "EIB", "status": "park", "why": "Usually for larger, later rounds; fit for a 12m Series A unconfirmed.", "cite": ["unverified"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on a new line", "institution": "EIFO", "via": "your Danish bank", "status": "open", "why": "Covers up to 80% of the bank's final loss on new financing.", "conditions": ["Positive equity and creditworthy", "Must expand the bank's commitment", "Up to 3 years for credits"], "cite": ["c1", "c2", "c3", "c9"]},
        {"id": "eifo-export-wc", "name": "EIFO export working-capital cover", "institution": "EIFO", "via": "your Danish bank", "status": "probe", "why": "The ApS's German contracts are exports; product terms not confirmed.", "cite": ["unverified"]},
        {"id": "eifo-raise", "name": "EIFO loan alongside the Series A", "institution": "EIFO", "status": "probe", "why": "Debt alongside private investors; size for a 12m round unconfirmed.", "cite": ["unverified"]},
        {"id": "eifo-match", "name": "EIFO Match Loan", "institution": "EIFO", "status": "park", "why": "Built for early rounds; likely too small for a 12m Series A.", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany (GmbH)", "country": "DE", "doors": [
        {"id": "kfw-erp", "name": "KfW ERP loan", "institution": "KfW", "via": "Munich savings bank", "status": "probe", "why": "Through the house bank, applied for before the project starts.", "conditions": ["EU SME", "Before the project starts", "Customary collateral"], "cite": ["c28", "c30", "c32"]},
        {"id": "hermes", "name": "Hermes export cover", "institution": "Federal export credit cover", "status": "shut", "why": "German export cover; the exporter here is the Danish ApS.", "cite": ["judgement"]}
      ]},
      {"id": "by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "bb-by", "name": "Bürgschaftsbank guarantee", "institution": "Bürgschaftsbank Bayern", "via": "Munich savings bank", "status": "probe", "why": "Up to 80% of risk, but capped at 1m per borrower.", "conditions": ["Viable project lacking security", "No restructuring"], "cite": ["c10", "c11", "c14", "c16"]},
        {"id": "lfa", "name": "LfA Universalkredit", "institution": "LfA Förderbank Bayern", "via": "Munich savings bank", "status": "probe", "why": "On-lent by the house bank at its own risk unless LfA takes part.", "cite": ["c46", "c47", "c49"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Your customers", "doors": [
        {"id": "cust-aid", "name": "Customers' safety and digitalisation support", "institution": "Various", "status": "park", "why": "Speeds sales; does not fix your cash. Complement only.", "cite": ["judgement"]}
      ]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "dk-bank", "name": "Your Danish bank", "side": "market", "country": "DK", "units": [{"id": "dk-corp", "name": "Corporate banking", "roles": [
        {"id": "dk-rm", "role": "Your relationship manager", "priority": "P2", "reach": "Existing relationship", "status": "engaged", "cite": ["judgement"]},
        {"id": "dk-credit", "role": "Head of SME or growth credit (holds the EIFO and InvestEU files)", "priority": "P1", "reach": "Through the relationship manager", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-guar", "name": "Guarantees for banks", "roles": [
        {"id": "eifo-head", "role": "Head of bank guarantees", "priority": "P1", "reach": "Through your bank's filing; direct probe via EIFO advisers", "status": "to_approach", "cite": ["judgement"]},
        {"id": "eifo-adv", "role": "EIFO adviser for growth companies", "priority": "P2", "reach": "EIFO's adviser line on its website", "status": "to_approach", "cite": ["unverified"]}
      ]}]},
      {"id": "de-bank", "name": "Your Munich savings bank", "side": "market", "country": "DE", "units": [{"id": "de-corp", "name": "Corporate clients and promotional loans", "roles": [
        {"id": "de-rm", "role": "Corporate adviser for promotional loans", "priority": "P2", "reach": "Existing relationship", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "bb-by", "name": "Bürgschaftsbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "bb-credit", "name": "Guarantee lending", "roles": [
        {"id": "bb-head", "role": "Head of guarantee lending", "priority": "P1", "reach": "Through the savings bank's filing", "status": "to_approach", "cite": ["judgement"]}
      ]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "Bank line with public cover", "steps": [
        {"id": "ask-bank", "label": "Ask the Danish bank: InvestEU cover held? EIFO on a new line?", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "equity-check", "label": "Check the ApS's equity in the last accounts", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["c2"]},
        {"id": "reprice", "label": "Do not ask for a reprice of the existing 3m line", "start": 0, "end": 1, "owner": "client", "status": "blocked", "cite": ["c9"]}
      ]},
      {"id": "raise", "label": "Series A", "steps": [
        {"id": "close", "label": "Series A close", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-investeu", "label": "InvestEU's next phase: do bank guarantee windows continue?", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-eifo-raise", "label": "EIFO's loans alongside investors: size and terms for a 12m round", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-machinery", "label": "Machinery safety rules for sensors (Regina)", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 20000000, "label": "Illustrative peak working capital to convert 40m pipeline in a year"},
    "instruments": [
      {"id": "line", "name": "Existing working-capital line", "type": "loan", "amount": 3000000, "terms": "Carries project cash; dear because the bank cannot price your project risk", "status": "secured", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "New headroom with EIFO cover", "type": "guarantee_debt", "terms": "Project cash; cheaper because the state takes up to 80% of the bank's loss; premium 0.8% to 6.3% a year", "status": "probe", "cite": ["c1", "c4", "c9"]},
      {"id": "eifo-raise-loan", "name": "EIFO loan alongside the round", "type": "public_coinvest", "terms": "Growth costs; cheaper than equity, no dilution; size unconfirmed", "status": "probe", "cite": ["unverified"]},
      {"id": "de-cover", "name": "Bürgschaftsbank or LfA via the Munich bank", "type": "guarantee_debt", "amount_max": 1000000, "terms": "Only the GmbH's own costs; guarantee capped at 1m per borrower", "status": "probe", "cite": ["c16", "c47"]},
      {"id": "seriesA", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Dearest money: dilution and VC return targets; growth, not receivables", "status": "in_progress", "cite": ["judgement"]}
    ]
  },
  "risks_flags": [
    {"id": "no-precedent", "kind": "flag", "severity": "medium", "title": "No recorded EIFO guarantee on a comparable line", "fix": "Test the bank's appetite first; ask EIFO for comparable cases.", "cite": ["judgement"]}
  ]
}
```

Sources:
- [w1] EIF, "EIF guarantee unlocks €178 million in new lending for Nordic SMEs through Danske Bank", https://www.eif.org/press/all/eif-guarantee-unlocks-eur178-million-in-new-lending-for-nordic-smes-through-danske-bank, retrieved 2026-11-19: "will make up to €178 million available in fresh financing"; "The remaining two-fifths will target innovation and digitalisation."
- [c1] to [c51]: EIFO-Guarantee product sheet 2026 (eifo.dk, sha256 c3f998cb12f6); VDB guarantee-bank FAQ (vdb-info.de, 30ddc2628aa5); KfW ERP-Förderkredit KMU sheet (kfw.de, 31b2116df386); LfA Universalkredit (lfa.de, 53c9bc96566b).

## Turn 4: the founder (answer, client_agent)

> The bigger bank line, I think. The project cash is what's killing us, and right now we're paying a high rate on €3M with our own personal guarantees on it.

## Turn 4: Wincent

I agree, with one adjustment: time the new line with the round, not before it.

**Why the bank line leads.** Lenders charge you a high rate because they can't judge project risk. EIFO exists to take that risk off them, covering up to 80% of the bank's final loss on a new facility [c1][c9]. When you pitch it, frame it that way: industrial safety is a public good, and the risk on your contracts is mispriced. Your contracts pay out at go-live (judgement).

**How big a line.** As an illustration: a €10m line at your midpoints carries about 18 projects at once, roughly 33 a year (judgement). Mind one cap. EIFO covers at most 50% of the bank's total loss on you, old line included [c1]. Pricing the new line together with the €3m is therefore part of the ask (judgement).

**Why time it with the round.** EIFO needs positive equity [c2]. €12m of fresh equity makes that case easy and strengthens the credit file (judgement). Start the bank work now and aim for a decision right after close.

**On cost.** EIFO's premium runs 0.8% to 6.3% a year [c4]. It only pays if the bank's margin falls by more than that. Ask the bank to release your personal guarantees once public cover is on (judgement).

**Second, at low effort:** a short probe to EIFO on debt alongside the round (unverified). Germany is parked until the GmbH carries its own costs.

Two facts settle the ask: what rate are you paying on the €3m today, and which Danish bank is it?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Lead: a larger working-capital line at your Danish bank with EIFO covering up to 80% of the new facility's loss.",
      "Time it with the Series A: start the bank work now, decision right after close.",
      "Ask for a lower margin and release of personal guarantees as part of the deal.",
      "Low-effort probe in parallel: EIFO debt alongside the round. Germany parked as a complement."
    ],
    "confidence": "medium",
    "confidence_why": "Product fits by type; bank appetite and cost against today's rate are untested, and no comparable case found.",
    "open_question": "Today's rate on the 3m line, and which Danish bank holds it?",
    "cite": ["c1", "c2", "c4", "c9", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on a new line", "institution": "EIFO", "via": "your Danish bank", "status": "open", "why": "The lead: carries project cash; cover on new financing only.", "conditions": ["Positive equity and creditworthy", "Must expand the bank's commitment", "Max 50% of the bank's total loss on you", "Up to 3 years for credits"], "cite": ["c1", "c2", "c3", "c9"]},
        {"id": "eifo-raise", "name": "EIFO loan alongside the Series A", "institution": "EIFO", "status": "probe", "why": "Second: low-effort probe, growth costs, not project cash.", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany (GmbH)", "country": "DE", "doors": [
        {"id": "kfw-erp", "name": "KfW ERP loan", "institution": "KfW", "via": "Munich savings bank", "status": "park", "why": "Only once the GmbH carries its own costs.", "cite": ["c30", "judgement"]}
      ]},
      {"id": "by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "bb-by", "name": "Bürgschaftsbank guarantee", "institution": "Bürgschaftsbank Bayern", "via": "Munich savings bank", "status": "park", "why": "Capped at 1m and only for the GmbH's own costs.", "cite": ["c16", "judgement"]},
        {"id": "lfa", "name": "LfA Universalkredit", "institution": "LfA Förderbank Bayern", "via": "Munich savings bank", "status": "park", "why": "Same: complement once the GmbH carries cost.", "cite": ["c47", "judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 10000000, "label": "Illustrative target line: about 18 projects at once at your midpoints"},
    "instruments": [
      {"id": "line", "name": "Existing working-capital line", "type": "loan", "amount": 3000000, "terms": "Carries project cash; dear, with personal guarantees; to be repriced with the new line", "status": "secured", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "New headroom with EIFO cover", "type": "guarantee_debt", "amount": 7000000, "terms": "Project cash; cheaper only if the bank's margin falls by more than the 0.8% to 6.3% premium", "status": "planned", "cite": ["c1", "c4", "judgement"]},
      {"id": "seriesA", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Dearest money; also what makes the equity gate easy", "status": "in_progress", "cite": ["c2", "judgement"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "Bank line with public cover", "steps": [
        {"id": "ask-bank", "label": "Bank meeting: new line with EIFO cover, repricing, guarantee release", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "credit-file", "label": "Bank prepares the credit file and EIFO request", "start": 1, "end": 3.5, "owner": "institution", "status": "planned", "depends_on": ["ask-bank"], "cite": ["judgement"]},
        {"id": "eifo-decision", "label": "EIFO decision, after close", "start": 4.5, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["credit-file", "close"], "cite": ["c2", "judgement"]}
      ]},
      {"id": "raise", "label": "Series A", "steps": [
        {"id": "eifo-probe", "label": "Probe EIFO on debt alongside the round", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "close", "label": "Series A close", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "cover-cap", "kind": "flag", "severity": "medium", "title": "EIFO covers at most 50% of the bank's total loss on you, old line included", "fix": "Negotiate the new line and the 3m together.", "cite": ["c1"]},
    {"id": "premium-cost", "kind": "flag", "severity": "medium", "title": "The guarantee premium adds 0.8% to 6.3% a year", "fix": "Agree a margin cut larger than the premium before filing.", "cite": ["c4"]}
  ]
}
```

## Turn 5: the founder (pushback, script)

> Our investors say: just raise a bigger round and stop messing about with banks. Why not put more equity in?

## Turn 5: Wincent

Your investors have half a point. Equity is the right money for hiring, product and new markets. For project cash it's the most expensive money you can use (judgement).

**Why.** Project cash comes back at every go-live. It's a loan to your own customers that repays in four to nine months. Debt matches that cycle. Equity prices it as if it were risk capital, forever (judgement).

**An illustration.** Suppose €12m buys 20%, which puts you at €60m post-money. Raising €20m at the same pre-money instead gives investors about 29% (judgement). That's roughly 9 more points of the company. At a €300m exit those points are worth about €28m. Borrowing €7m at 8% for three years costs about €1.7m in interest (judgement). Please give me your real valuation and rate; the order of magnitude rarely changes.

**And it doesn't scale.** Your €40m pipeline would tie up about €20m at peak (judgement). You'd be back raising every time the pipeline grew. A covered line grows with the order book.

**Where they're right:** don't slow the round for the bank. Run both in parallel. The round itself helps the bank case, because EIFO requires positive equity [c2]. Debt beside the round also leans on the investors' own due diligence (judgement).

**My recommendation:** keep the round at €12m for growth, and put project cash on the covered line.

Can you share the term-sheet valuation, so I can put real numbers in front of your board?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "prioritise",
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 10000000, "label": "Illustrative target line: about 18 projects at once at your midpoints"},
    "instruments": [
      {"id": "seriesA", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Growth costs (hiring, product, markets). Dearest money: about 9 points more dilution if raised to 20m to fund receivables (illustrative)", "status": "in_progress", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "New headroom with EIFO cover", "type": "guarantee_debt", "amount": 7000000, "terms": "Project cash, which returns at each go-live; debt matches the cycle and scales with the order book", "status": "planned", "cite": ["c1", "c9", "judgement"]}
    ]
  },
  "risks_flags": [
    {"id": "investor-view", "kind": "flag", "severity": "medium", "title": "Investors prefer more equity over bank debt", "fix": "Show the board the dilution vs interest comparison with real valuation and rate; run line and round in parallel.", "cite": ["judgement"]},
    {"id": "no-delay", "kind": "flag", "severity": "low", "title": "Bank work must not slow the round", "fix": "Bank files in parallel; EIFO decision after close.", "cite": ["c2", "judgement"]}
  ]
}
```

## Turn 6: the founder (pushback, script)

> Or couldn't we get the customers to lease the kit, so it's off our balance sheet altogether?

## Turn 6: Wincent

You could, but I wouldn't lead with it. Leasing moves your cash problem onto your customers. Each sale then needs a lessor to approve the customer, and the lessor's margin ends up inside your price. Your offer gets slower to close and dearer to buy, against competitors who don't ask for that (judgement). The stronger move is for the public side to carry the risk on your own line, so customers see one simple price (judgement).

There's a second catch. A lessor normally pays only once the kit is accepted (judgement). If acceptance is effectively go-live, you still pre-finance the four to nine months. You've just added a third party.

Leasing is still useful in two places:

- **As an option for customers who ask.** For example, a large German fleet operator that prefers to pay monthly.
- **For bigger German deals through EIFO.** EIFO lists an operational leasing guarantee among its buyer-financing products for foreign buyers of Danish goods. I haven't read its terms (unverified). Because the ApS signs the German contracts, those sales count as Danish exports (judgement). That could help a German customer's lessor say yes.

So leasing is a complement to offer, not a replacement for the line. Your own covered line stays the lead.

Shall we move to the plan and who to approach? I still need the Danish bank's name and today's rate to aim it.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "prioritise",
  "routes": {
    "levels": [
      {"id": "cust", "level": "customer", "label": "Your customers", "doors": [
        {"id": "cust-lease", "name": "Customer leasing through a lessor", "institution": "Third-party lessors", "status": "park", "why": "Complement on request; slows sales, adds margin, and pays at acceptance, so pre-financing often stays with you.", "cite": ["judgement"]},
        {"id": "eifo-oplease", "name": "EIFO operational leasing guarantee for foreign buyers", "institution": "EIFO", "via": "the German customer's lessor or bank", "status": "probe", "why": "Could support large German deals signed by the ApS; terms not read.", "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "push-to-customer", "kind": "flag", "severity": "medium", "title": "Leasing moves your cost onto customers and slows sales", "fix": "Keep your own covered line as the lead; offer leasing only on request.", "cite": ["judgement"]}
  ]
}
```

## Turn 7: the founder (fact_change, script)

> Update: our lead is probably a German fund now, and they want contracting moved into the GmbH. Does that change things?

## Turn 7: Wincent

Yes, it changes a lot, and mostly for the better. Germany moves from parked to a second lead.

**What opens if the GmbH signs and carries the project cost:**

- **LfA through your Munich savings bank.** LfA's Universalkredit covers working capital ("Betriebsmittel") [w2]. LfA can also take 60% of the credit risk off your bank, on loans of up to €7.5m [w2]. That is the same move as the EIFO cover, but made in Germany.
- **Bavarian state co-investment beside a private lead.** Bavaria runs a growth fund that co-invests only when a private lead is in (unverified, from secondary sources). Whether it backs a Munich subsidiary of a Danish parent is the question (unverified).
- **The Danish line gets smaller.** EIFO cover still fits whatever the ApS keeps carrying [c1][c9].

**Sequencing, before you move anything:**

- German promotional loans are applied for before the project starts. KfW is explicit about it [c30], and I expect LfA to work the same way (judgement). Apply for the German line before the first GmbH contract is signed.
- The move must stand on its own merits: tax, transfer pricing and staffing. Don't do it just to reach a loan (judgement). Your tax adviser should look at it now.
- Don't refinance the Danish €3m into Germany without your tax adviser (judgement).

**The question that decides the split:** who makes the hardware, and when will the GmbH pay the ApS for it? If the ApS is paid on delivery, the cash gap moves fully to Germany. If it's paid at go-live, both entities carry part of it.

Also: is the German lead itself backed by KfW Capital or the EIF? That shapes the co-investment options.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "prioritise",
  "routes": {
    "levels": [
      {"id": "by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa", "name": "LfA Universalkredit with 60% risk release", "institution": "LfA Förderbank Bayern", "via": "Munich savings bank", "status": "probe", "why": "Covers working capital; LfA can take 60% of the bank's risk up to 7.5m, if the GmbH carries the project cost.", "conditions": ["GmbH signs and carries project cost", "Apply before the first GmbH project starts (to confirm for LfA)"], "cite": ["w2", "judgement"]},
        {"id": "bayern-kapital", "name": "Bavarian state growth co-investment", "institution": "Bayern Kapital", "status": "probe", "why": "Co-invests beside a private lead; fit for a Danish-parented group unconfirmed.", "cite": ["unverified"]},
        {"id": "bb-by", "name": "Bürgschaftsbank guarantee", "institution": "Bürgschaftsbank Bayern", "via": "Munich savings bank", "status": "park", "why": "Capped at 1m; LfA's risk release is the bigger lever.", "cite": ["c16"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany (GmbH)", "country": "DE", "doors": [
        {"id": "kfw-erp", "name": "KfW ERP loan", "institution": "KfW", "via": "Munich savings bank", "status": "probe", "why": "Opens once the GmbH carries cost; applied for before the project starts.", "cite": ["c30"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on a new line", "institution": "EIFO", "via": "your Danish bank", "status": "open", "why": "Sized to what the ApS still carries after the move.", "cite": ["c1", "c9"]}
      ]}
    ]
  },
  "hierarchies": [
    {
      "id": "field-de",
      "title": "Bavaria: where the GmbH's money would come from",
      "explains": "LfA lends through the savings bank and can take 60% of its risk; Bavaria's growth fund co-invests beside a private lead.",
      "nodes": [
        {"id": "lfa-n", "label": "LfA Förderbank Bayern", "kind": "institution", "cite": ["w2"]},
        {"id": "lfa-uk", "label": "Universalkredit with Haftung Plus (60%, up to 7.5m)", "kind": "instrument", "parent": "lfa-n", "status": "probe", "cite": ["w2"]},
        {"id": "spk", "label": "Your Munich savings bank", "kind": "channel", "parent": "lfa-uk", "status": "probe", "cite": ["judgement"]},
        {"id": "bk", "label": "Bayern Kapital (growth co-investment)", "kind": "institution", "parent": "lfa-n", "status": "probe", "cite": ["unverified"]}
      ],
      "cite": ["w2", "unverified"]
    }
  ],
  "risks_flags": [
    {"id": "start-before-apply", "kind": "deal_breaker", "severity": "high", "title": "German promotional loans must be applied for before the project starts", "fix": "File the German line before the first GmbH contract is signed.", "cite": ["c30", "judgement"]},
    {"id": "tax-tp", "kind": "flag", "severity": "high", "title": "Moving contracting changes tax and transfer pricing", "fix": "Tax adviser reviews the move on its own merits before any filing.", "cite": ["judgement"]},
    {"id": "intragroup-terms", "kind": "flag", "severity": "medium", "title": "Intra-group payment terms decide which entity carries the cash gap", "fix": "Set when the GmbH pays the ApS for hardware before sizing both lines.", "cite": ["judgement"]}
  ]
}
```

Sources:
- [w2] LfA Förderbank Bayern, Universalkredit, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php, retrieved 2026-11-19: "Betriebsmittel" (listed purpose); "jedoch 60 % des Kreditrisikos abnehmen"; "7,5 Mio. EUR".
- [w1] EIF, Danske Bank guarantee release, https://www.eif.org/press/all/eif-guarantee-unlocks-eur178-million-in-new-lending-for-nordic-smes-through-danske-bank, retrieved 2026-11-19.
- [c1], [c9], [c16], [c30]: EIFO-Guarantee product sheet 2026 (sha256 c3f998cb12f6); VDB guarantee-bank FAQ (30ddc2628aa5); KfW ERP-Förderkredit KMU (31b2116df386).

## Turn 8: the founder (prioritise, script)

> Which two or three should we actually go for, and what will each cost us in time and effort?

## Turn 8: Wincent

Go for these three, in this order.

**1. The German line: a working-capital loan at the Munich savings bank, with LfA taking 60% of the risk.** This applies if contracting moves into the GmbH. LfA can de-risk loans of up to €7.5m, working capital included [w2].
- **Time:** about 2 to 3 months for the credit file and decision (unverified). The tax review of the move comes first.
- **Effort:** a credit file with the round's figures and the pipeline. The German lead's due diligence helps you here (judgement).
- **Why first:** it's the biggest de-risked line on the table, and it sits where the project cost will sit.

**2. The Danish line: EIFO cover on new headroom for whatever the ApS still carries** [c1][c9].
- **Time:** about 2 to 4 months through your bank (unverified).
- **Effort:** moderate. Your bank files the request.
- **Cost:** a premium of 0.8% to 6.3% a year [c4]. Size the line once the hardware terms between the two companies are set.

**3. A probe on public co-investment beside the round,** with Bavaria's growth fund or EIFO (both unverified).
- **Time:** one short email each, this week.
- **Why now:** this kind of money normally has to be in before the round closes (judgement).

**Parked:** the Bürgschaftsbank (capped at €1m [c16]), customer leasing, and Hermes, which doesn't fit.

**Two things you must know:**
- The two lines cover different entities and different costs, so they shouldn't clash (judgement).
- Public guarantees can count as state aid across the whole group, Danish and German together. Ask each bank how its cover is counted (unverified).

Do you agree with this order? If so, I'll set out how to start and whom to approach.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "1. GmbH working-capital line at the Munich savings bank with LfA taking 60% of the risk, up to 7.5m.",
      "2. ApS line with EIFO cover on new headroom, sized to what the ApS still carries.",
      "3. This week: probe Bavarian and Danish public co-investment beside the round, before close.",
      "Parked: Bürgschaftsbank (1m cap), customer leasing; Hermes does not fit."
    ],
    "confidence": "medium",
    "confidence_why": "Both lines fit by product; timelines, aid counting and co-investment fit unconfirmed.",
    "open_question": "Who makes the hardware, and when does the GmbH pay the ApS for it?",
    "cite": ["w2", "c1", "c9", "c16", "judgement", "unverified"]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 10000000, "label": "Illustrative project working capital across both entities"},
    "instruments": [
      {"id": "lfa-line", "name": "GmbH line with LfA 60% risk release", "type": "guarantee_debt", "amount_max": 7500000, "terms": "German project cash; cheaper because LfA takes 60% of the bank's risk", "status": "planned", "cite": ["w2"]},
      {"id": "eifo-cover", "name": "ApS headroom with EIFO cover", "type": "guarantee_debt", "terms": "ApS hardware and Danish project cash; premium 0.8% to 6.3% a year", "status": "planned", "cite": ["c1", "c4"]},
      {"id": "line", "name": "Existing ApS line", "type": "loan", "amount": 3000000, "terms": "Repriced alongside the EIFO headroom; release personal guarantees", "status": "secured", "cite": ["judgement"]},
      {"id": "coinvest", "name": "Public co-investment beside the round", "type": "public_coinvest", "terms": "Growth costs; less dilutive than more private equity; fit unconfirmed", "status": "probe", "cite": ["unverified"]},
      {"id": "seriesA", "name": "Series A (German lead)", "type": "equity", "amount": 12000000, "terms": "Growth costs; dearest money", "status": "in_progress", "cite": ["judgement"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "de-line", "label": "German line (lead)", "steps": [
        {"id": "tax-review", "label": "Tax adviser reviews moving contracting into the GmbH", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "spk-meet", "label": "Savings bank meeting: working-capital line with LfA risk release", "start": 0.5, "end": 1, "owner": "client", "status": "planned", "cite": ["w2"]},
        {"id": "lfa-file", "label": "Bank files with LfA before the first GmbH project", "start": 1, "end": 3, "owner": "institution", "status": "planned", "depends_on": ["tax-review", "spk-meet"], "cite": ["c30", "judgement"]},
        {"id": "no-sign", "label": "Do not sign GmbH contracts before the line is applied for", "start": 0, "end": 3, "owner": "client", "status": "blocked", "cite": ["judgement"]}
      ]},
      {"id": "lead", "label": "Danish line", "steps": [
        {"id": "ask-bank", "label": "Bank meeting: EIFO headroom, repricing, guarantee release", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "cite": ["c9"]},
        {"id": "eifo-decision", "label": "EIFO decision, after close", "start": 4.5, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["ask-bank", "close"], "cite": ["c2"]}
      ]},
      {"id": "raise", "label": "Series A", "steps": [
        {"id": "eifo-probe", "label": "Probe Bavarian and Danish co-investment", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "close", "label": "Series A close", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "aid-count", "kind": "flag", "severity": "medium", "title": "Public guarantees may count as state aid across the whole group", "fix": "Ask each bank how its cover is counted; keep a group aid register.", "cite": ["unverified"]}
  ]
}
```

## Turn 9: the founder (who_to_call, script)

> Who do I call first, on the Danish side and at the banks, by role? And draft me the email.

## Turn 9: Wincent

Call your two banks first, then make one short probe to EIFO. The public side decides, but your banks file (judgement).

**Who, in order:**

1. **This week: your Danish relationship manager.** Ask them for a meeting with their head of SME or growth credit. That person is P1: they own the EIFO request and know whether the bank already carries EU cover (judgement).
2. **This week: the corporate adviser at the Munich savings bank.** This is an exploratory talk about a working-capital line with LfA's 60% risk release [w2]. Nothing gets filed until your tax adviser has cleared the move (judgement).
3. **Next week: EIFO's adviser line for growth companies.** This is P2 on the public side. Ask two things: does a covered line of your size and profile fit, and is there debt alongside a €12m round (unverified)?

No ministry contact yet. Political doors matter only if a rule blocks you, and none does today (judgement).

**Precedent:** I found no recorded EIFO guarantee on a comparable line. Ask the bank and EIFO for their closest case. A yes from either makes the file routine.

**Draft to your Danish relationship manager** (you send it; it can go in Danish):

> Subject: Meeting request: growth financing for [Company] alongside our Series A
>
> Dear [Name],
>
> We are closing a EUR 12m Series A in about four months, led by a [German] fund. Our pipeline of forklift safety installations has reached EUR 40m. Each project ties up EUR 300–800k for four to nine months before payment at go-live.
>
> We would like to discuss a larger working-capital facility with an EIFO guarantee on the new headroom. We would review it together with the current EUR 3m line, its pricing, and the personal guarantees that sit on it.
>
> Could we meet with you and your head of SME credit in the next two weeks?
>
> Kind regards,
> [Name], CEO

**Short probe to EIFO:**

> We are a Danish forklift-safety company closing a EUR 12m Series A. Our bank will approach you about cover on new working-capital headroom. Before it does, could we have 20 minutes with an adviser on fit, and on any debt you offer alongside a round of this size?

What's the name of your Danish bank? That decides whether we lean on its EU cover.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "advise",
  "stakeholders": {
    "institutions": [
      {"id": "dk-bank", "name": "Your Danish bank", "side": "market", "country": "DK", "units": [{"id": "dk-corp", "name": "Corporate and SME credit", "roles": [
        {"id": "dk-credit", "role": "Head of SME or growth credit", "priority": "P1", "reach": "Meeting requested through the relationship manager", "status": "to_approach", "cite": ["judgement"]},
        {"id": "dk-rm", "role": "Your relationship manager", "priority": "P2", "reach": "Email this week (draft ready)", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-guar", "name": "Guarantees and growth lending", "roles": [
        {"id": "eifo-head", "role": "Head of bank guarantees", "priority": "P1", "reach": "Through your bank's filing", "status": "to_approach", "cite": ["judgement"]},
        {"id": "eifo-adv", "role": "Adviser for growth companies", "priority": "P2", "reach": "EIFO's adviser line; short probe next week", "status": "to_approach", "cite": ["unverified"]}
      ]}]},
      {"id": "de-bank", "name": "Your Munich savings bank", "side": "market", "country": "DE", "units": [{"id": "de-corp", "name": "Corporate clients and promotional loans", "roles": [
        {"id": "de-head", "role": "Head of corporate clients", "priority": "P1", "reach": "Through the corporate adviser", "status": "to_approach", "cite": ["judgement"]},
        {"id": "de-rm", "role": "Corporate adviser for promotional loans", "priority": "P2", "reach": "Exploratory meeting this week", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-credit", "name": "Promotional lending and risk release", "roles": [
        {"id": "lfa-head", "role": "Head of the corporate promotional-loan unit", "priority": "P1", "reach": "Through the savings bank's filing", "status": "to_approach", "cite": ["judgement"]},
        {"id": "lfa-adv", "role": "LfA funding advisory", "priority": "P2", "reach": "LfA's advisory line, before the bank files", "status": "to_approach", "cite": ["unverified"]}
      ]}]},
      {"id": "dk-min", "name": "Danish business ministry (EIFO's owner)", "side": "political", "country": "DK", "units": [{"id": "dk-min-fin", "name": "Business finance", "roles": [
        {"id": "dk-min-head", "role": "Head of the business-finance office", "priority": "P2", "reach": "Only if a rule blocks; not now", "status": "to_approach", "cite": ["unverified"]}
      ]}]}
    ]
  },
  "process_maps": [
    {
      "id": "lfa-line",
      "title": "How the German line with LfA risk release is decided",
      "explains": "You apply at the savings bank; the bank sets the rate and on-lends; LfA can take 60% of the risk.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "gmbh", "name": "Your GmbH", "side": "market"},
        {"id": "spk", "name": "Munich savings bank", "side": "market"},
        {"id": "lfa-a", "name": "LfA Förderbank Bayern", "side": "public-capital"}
      ],
      "steps": [
        {"id": "apply", "label": "GmbH applies at the savings bank", "kind": "step", "actor": "gmbh", "cite": ["c47"], "gates": [{"label": "Turnover up to 500m", "cite": ["c46"]}, {"label": "Apply before the first GmbH project starts", "cite": ["judgement"]}, {"label": "Tax review of the move done", "cite": ["judgement"]}]},
        {"id": "rate", "label": "Bank and GmbH agree the rate", "kind": "decision", "actor": "spk", "cite": ["c48"], "gates": [{"label": "Credit standing and collateral value", "cite": ["c48"]}]},
        {"id": "release", "label": "LfA takes 60% of the credit risk (Haftung Plus)", "kind": "decision", "actor": "lfa-a", "cite": ["w2"], "gates": [{"label": "Loan up to 7.5m", "cite": ["w2"]}]},
        {"id": "onlend", "label": "Bank pays out and on-lends", "kind": "step", "actor": "spk", "cite": ["c49"]}
      ],
      "flow": [{"from": "apply", "to": "rate"}, {"from": "rate", "to": "release", "label": "bank asks for risk release"}, {"from": "release", "to": "onlend"}],
      "leverage": [
        {"id": "lev-round", "at": "rate", "kind": "door_opener", "label": "The closed Series A and the German lead's due diligence", "why": "Equity and a known investor improve the credit read.", "how": "Share the term sheet and data room summary with the adviser.", "side": "market", "cite": ["judgement"]},
        {"id": "lev-start", "at": "apply", "kind": "timing_window", "label": "Before the first GmbH contract", "why": "Promotional loans are applied for before the project starts.", "how": "Agree the move date backwards from the filing.", "side": "public-capital", "cite": ["c30", "judgement"]}
      ],
      "cite": ["c47", "w2"]
    },
    {
      "id": "eifo-cover",
      "title": "How the EIFO cover on the Danish line is decided",
      "explains": "Your bank files with EIFO; EIFO covers up to 80% of the bank's final loss on the new facility.",
      "kind": "funding_decision",
      "illustrative": true,
      "actors": [
        {"id": "aps", "name": "Your ApS", "side": "market"},
        {"id": "dkb", "name": "Your Danish bank", "side": "market"},
        {"id": "eifo-a", "name": "EIFO", "side": "public-capital"}
      ],
      "steps": [
        {"id": "ask", "label": "ApS asks the bank for new headroom with EIFO cover", "kind": "step", "actor": "aps", "cite": ["judgement"], "gates": [{"label": "Financing expands the bank's commitment", "cite": ["c9"]}, {"label": "Bank facility from DKK 2m", "cite": ["c8"]}]},
        {"id": "file", "label": "Bank files the guarantee request with EIFO", "kind": "document", "actor": "dkb", "cite": ["unverified"], "gates": [{"label": "Positive equity and creditworthy", "cite": ["c2"]}, {"label": "Group under 749 employees", "cite": ["c6"]}]},
        {"id": "decide", "label": "EIFO decides; premium set by rating", "kind": "decision", "actor": "eifo-a", "cite": ["c4"], "gates": [{"label": "Cover up to 80%, max 50% of bank's total loss on you", "cite": ["c1"]}]}
      ],
      "flow": [{"from": "ask", "to": "file"}, {"from": "file", "to": "decide"}],
      "leverage": [
        {"id": "lev-close", "at": "decide", "kind": "timing_window", "label": "Right after the round closes", "why": "Fresh equity settles the positive-equity gate.", "how": "Bank prepares now, files on close.", "side": "public-capital", "cite": ["c2", "judgement"]},
        {"id": "lev-prec", "at": "eifo-a", "kind": "precedent", "label": "No comparable case found", "why": "A first-of-a-kind ask needs a stronger case.", "how": "Ask the bank and EIFO for their closest case.", "side": "public-capital", "cite": ["judgement"]}
      ],
      "cite": ["c1", "c2", "c9"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "outreach", "label": "First calls", "steps": [
        {"id": "email-dk", "label": "Email the Danish relationship manager (draft ready)", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "call-spk", "label": "Exploratory call with the Munich savings bank", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "probe-eifo", "label": "Short probe to EIFO's adviser line", "start": 0.25, "end": 0.5, "owner": "client", "status": "planned", "cite": ["unverified"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-lfa", "label": "LfA risk-release terms and filing timing confirmed", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["w2", "unverified"]},
        {"id": "w-bk", "label": "Bavarian growth fund: next generation and fit for a Danish-parented group", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  }
}
```

## Turn 10: the founder (answer, if_asked)

> About 6 million revenue, 45 people.

## Turn 10: Wincent

Those figures confirm the diagnosis, and they reset the size of the ask.

**What they settle:**

- **You're comfortably an SME.** You're well under EIFO's 749-employee ceiling [c6] and LfA's €500m turnover limit [c46]. The KfW test uses the EU SME definition [c28], which you meet today (judgement).
- **The line is your ceiling.** €6m of revenue is about 11 projects a year at €550k. That's almost exactly what your €3m line can carry, at about 10 a year (judgement). Growth is capped by cash, not by demand. That's the case to make to the banks.

**What it changes:** the €10m I used as an illustration is too big a first ask on €6m of revenue. A bank will size the line to revenue and contracted backlog (judgement). Aim for about €6m in total, Danish and German together, roughly double today's line. That carries about 20 projects a year, or €11m to €12m of revenue (judgement). Ask for an increase once you've proven the higher volume. EIFO covers credits of up to three years [c3], which leaves room for that step.

**One thing to watch:** if the German lead ends up with more than half the shares, you count as part of the fund's group under the EU SME test (unverified). That could cost you SME status, which several of these products require. Check the cap table against the test before signing.

Did the ApS show positive equity in its last accounts? With 45 people that's not a given, and EIFO requires it [c2].

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "advise",
  "answer": {
    "lines": [
      "First ask: about 6m of de-risked working capital in total, roughly double today, split between the GmbH (LfA risk release) and the ApS (EIFO cover).",
      "The case: the line, not demand, caps you at about 11 projects a year.",
      "Step up once the higher volume is proven.",
      "This week: email the Danish bank, call the Munich savings bank, then probe EIFO."
    ],
    "confidence": "medium",
    "confidence_why": "SME and size tests pass; positive equity and the post-round SME status are open.",
    "open_question": "Did the ApS show positive equity in its last accounts?",
    "cite": ["c6", "c46", "c2", "c3", "w2", "judgement"]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 6000000, "label": "First ask: about 20 projects a year at your midpoints"},
    "instruments": [
      {"id": "line", "name": "Existing ApS line", "type": "loan", "amount": 3000000, "terms": "Carries about 10 projects a year today; repriced with the new headroom", "status": "secured", "cite": ["judgement"]},
      {"id": "lfa-line", "name": "GmbH line with LfA 60% risk release", "type": "guarantee_debt", "amount": 2000000, "amount_max": 3000000, "terms": "German project cash; LfA takes 60% of the bank's risk", "status": "planned", "cite": ["w2", "judgement"]},
      {"id": "eifo-cover", "name": "ApS headroom with EIFO cover", "type": "guarantee_debt", "amount": 1000000, "amount_max": 2000000, "terms": "ApS hardware and Danish project cash; premium 0.8% to 6.3% a year", "status": "planned", "cite": ["c1", "c4", "judgement"]}
    ]
  },
  "risks_flags": [
    {"id": "size-vs-revenue", "kind": "flag", "severity": "medium", "title": "Line size must fit revenue and backlog", "fix": "Ask for about 6m in total first; increase on proven volume.", "cite": ["judgement"]},
    {"id": "sme-postround", "kind": "flag", "severity": "high", "title": "A majority stake by the lead could cost SME status", "fix": "Test the post-round cap table against the EU SME definition before signing.", "cite": ["unverified"]},
    {"id": "equity-gate", "kind": "deal_breaker", "severity": "high", "title": "EIFO requires positive equity and creditworthiness", "fix": "Check the ApS's last accounts; if negative, file right after close.", "cite": ["c2"]}
  ]
}
```

## Turn 11: the founder (regulatory, script)

> A big customer asked if we're ready for the new EU Machinery Regulation. Is that a problem for any of this?

## Turn 11: Wincent

It's a real question, but it belongs to Regina, not to me. I've handed it over. Here is the one-line flag and what it means for the money.

**The flag.** The new Machinery Regulation replaces the old Machinery Directive [c52]. It treats safety components as covering digital devices and software that performs a safety function, not only physical parts [c55]. Products like yours are likely in scope (judgement). Whether that applies to your sensors, and under which conformity route, is for Regina to answer.

**Why it matters for the financing:**

- **Your cash cycle.** If customers make go-live or acceptance conditional on compliance, a gap delays payment on exactly the projects the new lines are funding (judgement). Ask Regina for the timeline before you sign new contracts that tie acceptance to compliance.
- **The credit files.** Both banks will ask about product and liability risk on a safety product (judgement). A short compliance note from Regina makes the files stronger.
- **The pitch.** Readiness is also an argument. Customers will need compliant safety kit, and that fits the public mission of workplace safety (judgement).
- **If your sensors use AI,** EU rules for AI used as a safety component in machinery are to apply by 2 August 2028 [c54]. Regina should check that too.

Regina will need a short product description: what the sensor detects, whether it uses software or AI, and whether you sell it as a separate component or fitted as part of a system. Can you send that?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "advise",
  "risks_flags": [
    {"id": "regina-machinery", "kind": "flag", "severity": "high", "title": "EU Machinery Regulation: safety components include digital devices and safety software", "fix": "Handed to Regina: scope and conformity route for your sensors; product description needed from you.", "cite": ["c52", "c55"]},
    {"id": "acceptance-compliance", "kind": "flag", "severity": "medium", "title": "Customers may tie go-live or acceptance to compliance, delaying payment", "fix": "Get Regina's timeline before signing contracts that tie acceptance to compliance.", "cite": ["judgement"]},
    {"id": "ai-safety", "kind": "flag", "severity": "medium", "title": "If the sensors use AI: safety-component requirements apply by 2 August 2028", "fix": "Regina checks whether this applies.", "cite": ["c54"]}
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-machinery", "label": "Machinery Regulation readiness (Regina)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["c52"]},
        {"id": "w-ai-machinery", "label": "AI requirements for machinery safety components apply", "start": "2028-08-02", "milestone": true, "owner": "us", "status": "planned", "cite": ["c54"]}
      ]}
    ]
  }
}
```

## Turn 12: the founder (answer, client_agent)

> Yes, I'll send it. Short version: we retrofit the sensors onto forklifts the customer already owns, and they come with our monitoring software, installed by us as a system. Honestly, we haven't looked closely at the CE side yet.

## Turn 12: Wincent

Thanks. That's enough for Regina to start, and I've passed it on.

**The one-line flag for Regina:** you retrofit safety kit onto machines customers already own and install it as a system with your own software. That may make you, not the forklift maker, responsible for the modified machine's conformity (judgement). That's the question I've handed her. I won't analyse it.

**What it means for the money:**

- **Your investor's due diligence.** Your German lead will very likely ask about CE (judgement). A clear plan from Regina before the data room opens is better than a gap found in diligence.
- **Which entity holds the risk.** If contracting moves into the GmbH, it becomes the installer on German projects (judgement). Your tax adviser and Regina should look at the move together, because product responsibility and liability follow the contract.
- **The bank files.** Both lines fund the projects these installations sit in. A short compliance note and your product-liability cover in the file make the credit case stronger (judgement).

**Sequencing:** get Regina's first read before the bank files go in and before the next large contract with compliance in its acceptance terms. It doesn't need to slow this week's bank meetings, which are exploratory (judgement).

The case is now in good shape. Shall I write up the full brief for your board and investors, covering the plan, who to approach, the drafts and what to watch?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "advise",
  "risks_flags": [
    {"id": "regina-machinery", "kind": "flag", "severity": "high", "title": "Retrofit as a system with own software: who is responsible for conformity of the modified machine?", "fix": "Regina gives a first read before the bank files and the investor data room.", "cite": ["judgement"]},
    {"id": "dd-ce", "kind": "flag", "severity": "medium", "title": "CE readiness will come up in the Series A due diligence", "fix": "Have Regina's plan in the data room.", "cite": ["judgement"]},
    {"id": "entity-liability", "kind": "flag", "severity": "medium", "title": "Moving contracting to the GmbH moves installer responsibility with it", "fix": "Tax adviser and Regina review the move together.", "cite": ["judgement"]}
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "reg", "label": "Compliance (Regina)", "steps": [
        {"id": "reg-brief", "label": "Send Regina the product description", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "reg-read", "label": "Regina's first read on CE and responsibility", "start": 0.25, "end": 1, "owner": "us", "status": "planned", "depends_on": ["reg-brief"], "cite": ["judgement"]}
      ]},
      {"id": "de-line", "label": "German line (lead)", "steps": [
        {"id": "lfa-file", "label": "Bank files with LfA before the first GmbH project", "start": 1, "end": 3, "owner": "institution", "status": "planned", "depends_on": ["tax-review", "spk-meet", "reg-read"], "cite": ["c30", "judgement"]}
      ]}
    ]
  }
}
```

## Turn 13: the founder (brief, script)

> We are running out of time on our side. Can you write up what we have as a brief now?

## Turn 13: Wincent

# Brief: public money for the project cash cycle and the Series A

**Forklift safety sensors group (Danish ApS parent, Munich GmbH). 19 November 2026.**

## 1. The read

You retrofit forklift safety sensors and monitoring software onto customers' existing fleets, and you install them as a system. You pay each project's cost upfront and get paid at go-live. A project ties up €300k to €800k for four to nine months.

Revenue is about €6m, with 45 people and a €40m pipeline. Growth is capped by cash, not demand. Your expensive €3m line carries about 10 projects a year, which roughly matches today's revenue (judgement). A €12m Series A is in talks and closes in about four months. The likely lead is a German fund that wants contracting moved into the GmbH.

## 2. The recommendation

Fund the project cash with bank lines on which the state carries part of the risk. Keep the Series A for growth.

- **Lead: a working-capital line at the GmbH's Munich savings bank.** LfA, Bavaria's state development bank, can take 60% of the credit risk on loans of up to €7.5m, and working capital is covered [w2]. This applies once contracting moves into the GmbH.
- **Second: new headroom at the ApS's Danish bank, with EIFO cover.** EIFO, Denmark's state export and investment fund, guarantees up to 80% of the bank's final loss [c1]. It only covers financing that expands the bank's commitment [c9].
- **The first ask:** about €6m of de-risked working capital in total, roughly double today. That carries about 20 projects a year (judgement). Step up once that volume is proven.

**Why this has the best chance:** lenders misprice project risk that pays at go-live, and taking that risk is what these public schemes exist for. Both fit your size and SME status [c6][c46].

**Why not more equity:** raising to €20m to fund receivables would cost about 9 more points of dilution (illustrative). Borrowing €7m at 8% for three years costs about €1.7m in interest (judgement).

**Why not customer leasing:** it slows sales, adds the lessor's margin to your price, and usually pays only at acceptance (judgement).

## 3. The options we weighed

| Option | Status | Why |
|---|---|---|
| GmbH line with LfA 60% risk release | Lead | Biggest de-risked line, where the cost will sit [w2] |
| ApS line with EIFO cover | Second | Covers new financing only; positive equity required [c2][c9] |
| Public co-investment beside the round (Bayern Kapital, EIFO) | Probe this week | Fit and size unconfirmed (unverified) |
| InvestEU cover already held by your Danish bank | Probe | Danske holds such cover, two-fifths for innovation and digitalisation [w1] |
| KfW ERP loan via the savings bank | Probe | Applied for before the project starts [c30] |
| Bürgschaftsbank Bayern | Parked | Capped at €1m per borrower [c16] |
| EIFO Match Loan | Parked | Likely too small for a €12m round (unverified) |
| Customer leasing; EIFO leasing cover for foreign buyers | Parked / probe | A complement only (judgement); terms unread (unverified) |
| Hermes export cover | Shut | German export cover; the exporter is the Danish ApS (judgement) |

## 4. The plan

**This week**
- Email your Danish relationship manager (the draft is in the annex).
- Have an exploratory call with the Munich savings bank.
- Send Regina the product description.
- Start your tax adviser's review of moving contracting into the GmbH.

**This month**
- Send the short EIFO probe.
- Bank meetings on headroom, repricing the €3m line, and releasing your personal guarantees.
- Regina's first read on CE.
- Set when the GmbH pays the ApS for hardware.

**This quarter**
- The savings bank files with LfA before the first GmbH project.
- The Danish bank prepares the EIFO request.
- The Series A closes at about month 4.

**Later**
- EIFO decision just after close, when the fresh equity settles the equity condition [c2].
- Step-up request on proven volume.

**What not to do yet**
- Sign GmbH contracts before the German line is applied for [c30] (judgement for LfA).
- Ask the Danish bank to reprice the old line without new headroom [c9].
- Slow the round for the banks (judgement).

## 5. Who, by function

| Route | P1 (decides) | P2 (forwards) | Reach |
|---|---|---|---|
| GmbH line | Head of corporate clients, Munich savings bank; head of the corporate promotional-loan unit, LfA | Corporate adviser, savings bank; LfA funding advisory | Through the savings bank (judgement) |
| ApS line | Head of SME or growth credit at your Danish bank; head of bank guarantees, EIFO | Your relationship manager; EIFO growth adviser | Email, then the bank files (judgement) |
| Co-investment | Bayern Kapital investment team; EIFO | Your German lead | Probe this week (unverified) |
| Political side | Danish business ministry, business-finance office | n/a | Only if a rule blocks; none does today (unverified) |

## 6. What to expect on the lead route

1. **The GmbH applies at the savings bank.** Turnover must be up to €500m [c46][c47]. The tax review and Regina's read come first (judgement).
2. **The bank and the GmbH agree the rate,** based on credit standing and collateral [c48].
3. **LfA takes 60% of the risk** on loans of up to €7.5m [w2].
4. **The bank pays out** [c49].

**Timing:** about 2 to 3 months (unverified). **Odds:** medium (judgement). **Precedents:** I found no recorded EIFO guarantee on a comparable line, and I didn't search LfA cases. Ask both banks for their closest case.

## 7. Risks and flags

| Flag | Severity | Fix |
|---|---|---|
| EIFO requires positive equity [c2] | High | Check the ApS's last accounts; if negative, file right after close |
| A majority stake for the lead could cost you SME status (unverified) | High | Test the post-round cap table against the EU SME definition |
| Moving contracting changes tax, transfer pricing and installer liability | High | Tax adviser and Regina review the move together (judgement) |
| CE readiness for retrofit as a system [c52][c55] | High | Regina's first read before bank files and the data room |
| EIFO covers at most 50% of the bank's total loss on you [c1] | Medium | Negotiate the new line and the old one together |
| EIFO premium of 0.8% to 6.3% a year [c4] | Medium | Agree a margin cut bigger than the premium |
| Group-wide state-aid counting (unverified) | Medium | Ask each bank how its cover counts |
| Personal guarantees on the current line | Medium | Ask for release once public cover is in place (judgement) |

## 8. Watchlist

- LfA risk-release terms and filing timing confirmed (month 1).
- Bavaria's new growth-fund generation and whether it fits a Danish-parented group (unverified).
- EIFO's debt alongside a round of this size (month 1, unverified).
- InvestEU's next phase for bank guarantees (unverified).
- Machinery Regulation readiness (Regina).
- AI safety-component requirements, which apply by 2 August 2028 [c54].

## 9. Open questions for you

- **Which Danish bank is it?** That tells us whether it already holds EU cover.
- **What rate are you paying on the €3m?** It tests whether the premium pays off.
- **Did the ApS show positive equity in its last accounts?** That's EIFO's gate.
- **Who makes the hardware, and when will the GmbH pay the ApS?** That decides the split between the two lines.
- **What is the term-sheet valuation?** I need it for the dilution comparison for your board.
- **Is the German lead backed by KfW Capital or the EIF?** That shapes the co-investment options.
- **What will the post-round ownership be?** It decides SME status.

## Annex: drafts (agreed)

**To the Danish relationship manager:**

> Subject: Meeting request: growth financing for [Company] alongside our Series A
>
> Dear [Name],
>
> We are closing a EUR 12m Series A in about four months, led by a [German] fund. Our pipeline of forklift safety installations has reached EUR 40m. Each project ties up EUR 300–800k for four to nine months before payment at go-live.
>
> We would like to discuss a larger working-capital facility with an EIFO guarantee on the new headroom. We would review it together with the current EUR 3m line, its pricing, and the personal guarantees that sit on it.
>
> Could we meet with you and your head of SME credit in the next two weeks?
>
> Kind regards,
> [Name], CEO

**To EIFO:**

> We are a Danish forklift-safety company closing a EUR 12m Series A. Our bank will approach you about cover on new working-capital headroom. Before it does, could we have 20 minutes with an adviser on fit, and on any debt you offer alongside a round of this size?

## 10. Sources

- **[c1]–[c9]** EIFO-Guarantee product sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf, sha256 c3f998cb12f6
- **[c10]–[c16]** VDB (association of German guarantee banks), FAQ, https://www.vdb-info.de/de/ueber-uns/nutzliche-infos/faq/, sha256 30ddc2628aa5
- **[c28]–[c37]** KfW ERP-Förderkredit KMU sheet, https://kfw.de/PDF/Download-Center/Förderprogramme-(Inlandsförderung)/PDF-Dokumente/6000004842_M_365.pdf, sha256 31b2116df386
- **[c46]–[c51]** LfA Universalkredit, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php, sha256 53c9bc96566b
- **[c52], [c55]** Regulation (EU) 2023/1230 (Machinery Regulation), https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1230, sha256 d9f3d8c7eb94
- **[c54]** Regulation (EU) 2026/1744 (Digital Omnibus on AI), https://eur-lex.europa.eu/legal-content/AUTO/?uri=CELEX:32026R1744, sha256 5c3a446567ec
- **[w1]** EIF, Danske Bank guarantee release, https://www.eif.org/press/all/eif-guarantee-unlocks-eur178-million-in-new-lending-for-nordic-smes-through-danske-bank, retrieved 2026-11-19: "will make up to €178 million available in fresh financing"; "The remaining two-fifths will target innovation and digitalisation."
- **[w2]** LfA Universalkredit page, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php, retrieved 2026-11-19: "Betriebsmittel" (a listed purpose); "jedoch 60 % des Kreditrisikos abnehmen"; "7,5 Mio. EUR".

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash cycle and the raise",
  "stage": "write_up",
  "answer": {
    "lines": [
      "Lead: GmbH working-capital line at the Munich savings bank with LfA taking 60% of the risk.",
      "Second: ApS headroom at the Danish bank with EIFO covering up to 80% of the new facility's loss.",
      "First ask about 6m in total, roughly double today; keep the 12m Series A for growth.",
      "This week: both banks, Regina, tax adviser; probe co-investment before close."
    ],
    "confidence": "medium",
    "confidence_why": "Products fit by type and size; equity gate, post-round SME status, CE and timelines open; no precedent found.",
    "open_question": "Which Danish bank, today's rate, and the ApS's equity?",
    "cite": ["w2", "c1", "c9", "c6", "c46", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "investeu-bank", "name": "InvestEU guarantee held by your Danish bank", "institution": "EIF, through Danish banks", "via": "your bank's own agreement", "status": "probe", "why": "Some Danish banks carry it; working-capital eligibility to confirm.", "cite": ["w1", "unverified"]},
        {"id": "eib-vd", "name": "EIB venture debt", "institution": "EIB", "status": "park", "why": "Usually larger, later rounds.", "cite": ["unverified"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on a new line", "institution": "EIFO", "via": "your Danish bank", "status": "open", "why": "Second route: ApS's remaining project and hardware cash.", "conditions": ["Positive equity and creditworthy", "Must expand the bank's commitment", "Max 50% of the bank's total loss on you", "Up to 3 years"], "cite": ["c1", "c2", "c3", "c9"]},
        {"id": "eifo-raise", "name": "EIFO loan alongside the Series A", "institution": "EIFO", "status": "probe", "why": "Growth costs; size unconfirmed.", "cite": ["unverified"]},
        {"id": "eifo-export-wc", "name": "EIFO export working-capital cover", "institution": "EIFO", "via": "your Danish bank", "status": "probe", "why": "Terms not confirmed.", "cite": ["unverified"]},
        {"id": "eifo-match", "name": "EIFO Match Loan", "institution": "EIFO", "status": "park", "why": "Likely too small for a 12m round.", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany (GmbH)", "country": "DE", "doors": [
        {"id": "kfw-erp", "name": "KfW ERP loan", "institution": "KfW", "via": "Munich savings bank", "status": "probe", "why": "Applied for before the project starts.", "cite": ["c30"]},
        {"id": "hermes", "name": "Hermes export cover", "institution": "Federal export credit cover", "status": "shut", "why": "Exporter is the Danish ApS.", "cite": ["judgement"]}
      ]},
      {"id": "by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa", "name": "LfA Universalkredit with 60% risk release", "institution": "LfA Förderbank Bayern", "via": "Munich savings bank", "status": "open", "why": "Lead: working capital covered, 60% risk release up to 7.5m, once the GmbH carries the cost.", "conditions": ["Turnover up to 500m", "Apply before the first GmbH project", "Tax review and Regina's read first"], "cite": ["w2", "c46", "judgement"]},
        {"id": "bayern-kapital", "name": "Bavarian state growth co-investment", "institution": "Bayern Kapital", "status": "probe", "why": "Beside a private lead; fit unconfirmed.", "cite": ["unverified"]},
        {"id": "bb-by", "name": "Bürgschaftsbank guarantee", "institution": "Bürgschaftsbank Bayern", "via": "Munich savings bank", "status": "park", "why": "Capped at 1m per borrower.", "cite": ["c16"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Your customers", "doors": [
        {"id": "cust-lease", "name": "Customer leasing", "institution": "Third-party lessors", "status": "park", "why": "Complement on request only.", "cite": ["judgement"]},
        {"id": "eifo-oplease", "name": "EIFO operational leasing guarantee for foreign buyers", "institution": "EIFO", "status": "probe", "why": "Terms not read.", "cite": ["unverified"]},
        {"id": "cust-aid", "name": "Customers' safety and digitalisation support", "institution": "Various", "status": "park", "why": "Speeds sales; not your cash.", "cite": ["judgement"]}
      ]},
      {"id": "lobby", "level": "lobby", "label": "Rule change", "doors": [
        {"id": "no-lobby", "name": "No rule change needed today", "institution": "n/a", "status": "park", "why": "The doors that matter are open for your applicant type.", "cite": ["judgement"]}
      ]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "dk-bank", "name": "Your Danish bank", "side": "market", "country": "DK", "units": [{"id": "dk-corp", "name": "Corporate and SME credit", "roles": [
        {"id": "dk-credit", "role": "Head of SME or growth credit", "priority": "P1", "reach": "Through the relationship manager", "status": "to_approach", "cite": ["judgement"]},
        {"id": "dk-rm", "role": "Your relationship manager", "priority": "P2", "reach": "Email this week (draft ready)", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-guar", "name": "Guarantees and growth lending", "roles": [
        {"id": "eifo-head", "role": "Head of bank guarantees", "priority": "P1", "reach": "Through your bank's filing", "status": "to_approach", "cite": ["judgement"]},
        {"id": "eifo-adv", "role": "Adviser for growth companies", "priority": "P2", "reach": "EIFO's adviser line; short probe", "status": "to_approach", "cite": ["unverified"]}
      ]}]},
      {"id": "de-bank", "name": "Your Munich savings bank", "side": "market", "country": "DE", "units": [{"id": "de-corp", "name": "Corporate clients and promotional loans", "roles": [
        {"id": "de-head", "role": "Head of corporate clients", "priority": "P1", "reach": "Through the corporate adviser", "status": "to_approach", "cite": ["judgement"]},
        {"id": "de-rm", "role": "Corporate adviser for promotional loans", "priority": "P2", "reach": "Exploratory call this week", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-credit", "name": "Promotional lending and risk release", "roles": [
        {"id": "lfa-head", "role": "Head of the corporate promotional-loan unit", "priority": "P1", "reach": "Through the savings bank's filing", "status": "to_approach", "cite": ["judgement"]},
        {"id": "lfa-adv", "role": "LfA funding advisory", "priority": "P2", "reach": "Advisory line before filing", "status": "to_approach", "cite": ["unverified"]}
      ]}]},
      {"id": "bk", "name": "Bayern Kapital", "side": "public-capital", "country": "DE", "units": [{"id": "bk-inv", "name": "Growth co-investment", "roles": [
        {"id": "bk-team", "role": "Investment team for growth rounds", "priority": "P1", "reach": "Introduction through the German lead", "status": "to_approach", "cite": ["unverified"]},
        {"id": "bk-lead", "role": "Partner at your German lead", "priority": "P2", "reach": "Existing relationship", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "dk-min", "name": "Danish business ministry (EIFO's owner)", "side": "political", "country": "DK", "units": [{"id": "dk-min-fin", "name": "Business finance", "roles": [
        {"id": "dk-min-head", "role": "Head of the business-finance office", "priority": "P2", "reach": "Only if a rule blocks", "status": "to_approach", "cite": ["unverified"]}
      ]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "de-line", "label": "German line (lead)", "steps": [
        {"id": "tax-review", "label": "Tax adviser reviews moving contracting into the GmbH", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "spk-meet", "label": "Savings bank: line with LfA risk release", "start": 0, "end": 1, "owner": "client", "status": "planned", "cite": ["w2"]},
        {"id": "lfa-file", "label": "Bank files with LfA before the first GmbH project", "start": 1, "end": 3, "owner": "institution", "status": "planned", "depends_on": ["tax-review", "spk-meet", "reg-read"], "cite": ["c30", "judgement"]},
        {"id": "no-sign", "label": "Do not sign GmbH contracts before the line is applied for", "start": 0, "end": 3, "owner": "client", "status": "blocked", "cite": ["judgement"]}
      ]},
      {"id": "lead", "label": "Danish line", "steps": [
        {"id": "email-dk", "label": "Email the relationship manager", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "ask-bank", "label": "Bank meeting: EIFO headroom, repricing, guarantee release", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "depends_on": ["email-dk"], "cite": ["c9"]},
        {"id": "reprice", "label": "Do not ask for a reprice alone without new headroom", "start": 0, "end": 1.5, "owner": "client", "status": "blocked", "cite": ["c9"]},
        {"id": "eifo-decision", "label": "EIFO decision, after close", "start": 4.5, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["ask-bank", "close"], "cite": ["c2"]}
      ]},
      {"id": "raise", "label": "Series A", "steps": [
        {"id": "eifo-probe", "label": "Probe Bavarian and Danish co-investment", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "close", "label": "Series A close", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "reg", "label": "Compliance (Regina)", "steps": [
        {"id": "reg-brief", "label": "Send Regina the product description", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "reg-read", "label": "Regina's first read on CE and responsibility", "start": 0.25, "end": 1, "owner": "us", "status": "planned", "depends_on": ["reg-brief"], "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-lfa", "label": "LfA risk-release terms and timing confirmed", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["w2", "unverified"]},
        {"id": "w-bk", "label": "Bavarian growth fund: new generation and fit", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-eifo-raise", "label": "EIFO debt alongside a 12m round", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-investeu", "label": "InvestEU next phase for bank guarantees", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-machinery", "label": "Machinery Regulation readiness (Regina)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["c52"]},
        {"id": "w-ai-machinery", "label": "AI requirements for machinery safety components apply", "start": "2028-08-02", "milestone": true, "owner": "us", "status": "planned", "cite": ["c54"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 6000000, "label": "First ask: about 20 projects a year at your midpoints"},
    "instruments": [
      {"id": "line", "name": "Existing ApS line", "type": "loan", "amount": 3000000, "terms": "Project cash; dear, with personal guarantees; repriced with the new headroom", "status": "secured", "cite": ["judgement"]},
      {"id": "lfa-line", "name": "GmbH line with LfA 60% risk release", "type": "guarantee_debt", "amount": 2000000, "amount_max": 3000000, "terms": "German project cash; cheaper because LfA takes 60% of the bank's risk", "status": "planned", "cite": ["w2", "judgement"]},
      {"id": "eifo-cover", "name": "ApS headroom with EIFO cover", "type": "guarantee_debt", "amount": 1000000, "amount_max": 2000000, "terms": "ApS hardware and Danish project cash; premium 0.8% to 6.3% a year", "status": "planned", "cite": ["c1", "c4", "judgement"]},
      {"id": "coinvest", "name": "Public co-investment beside the round", "type": "public_coinvest", "terms": "Growth costs; less dilutive than more private equity", "status": "probe", "cite": ["unverified"]},
      {"id": "seriesA", "name": "Series A (German lead)", "type": "equity", "amount": 12000000, "terms": "Growth costs; dearest money, kept off receivables", "status": "in_progress", "cite": ["judgement"]}
    ]
  },
  "risks_flags": [
    {"id": "equity-gate", "kind": "deal_breaker", "severity": "high", "title": "EIFO requires positive equity and creditworthiness", "fix": "Check the ApS's last accounts; file right after close if needed.", "cite": ["c2"]},
    {"id": "start-before-apply", "kind": "deal_breaker", "severity": "high", "title": "German promotional loans before the project starts", "fix": "File before the first GmbH contract.", "cite": ["c30", "judgement"]},
    {"id": "sme-postround", "kind": "flag", "severity": "high", "title": "Majority stake by the lead could cost SME status", "fix": "Test the cap table against the EU SME definition.", "cite": ["unverified"]},
    {"id": "tax-tp", "kind": "flag", "severity": "high", "title": "Moving contracting: tax, transfer pricing, installer liability", "fix": "Tax adviser and Regina review together.", "cite": ["judgement"]},
    {"id": "regina-machinery", "kind": "flag", "severity": "high", "title": "Retrofit as a system: who is responsible for conformity?", "fix": "Regina's read before bank files and data room.", "cite": ["c52", "c55"]},
    {"id": "cover-cap", "kind": "flag", "severity": "medium", "title": "EIFO max 50% of the bank's total loss on you", "fix": "Negotiate old and new lines together.", "cite": ["c1"]},
    {"id": "premium-cost", "kind": "flag", "severity": "medium", "title": "Premium 0.8% to 6.3% a year", "fix": "Margin cut larger than the premium.", "cite": ["c4"]},
    {"id": "aid-count", "kind": "flag", "severity": "medium", "title": "Group-wide state-aid counting", "fix": "Ask each bank; keep a group aid register.", "cite": ["unverified"]},
    {"id": "personal-g", "kind": "flag", "severity": "medium", "title": "Personal guarantees on the current line", "fix": "Release once public cover is in place.", "cite": ["judgement"]},
    {"id": "no-precedent", "kind": "flag", "severity": "medium", "title": "No comparable EIFO case found", "fix": "Ask both banks for their closest case.", "cite": ["judgement"]},
    {"id": "push-to-customer", "kind": "flag", "severity": "medium", "title": "Leasing moves cost to customers", "fix": "Own covered line leads; leasing on request.", "cite": ["judgement"]}
  ],
  "hierarchies": [
    {
      "id": "field",
      "title": "Where public cover reaches your two entities",
      "explains": "Each entity's own bank is the door; the public side takes part of the bank's risk.",
      "nodes": [
        {"id": "dk", "label": "Denmark: ApS", "kind": "channel", "cite": ["judgement"]},
        {"id": "eifo", "label": "EIFO", "kind": "institution", "parent": "dk", "cite": ["c5"]},
        {"id": "eifo-g", "label": "EIFO-Guarantee: up to 80% of the bank's final loss", "kind": "instrument", "parent": "eifo", "status": "open", "cite": ["c1", "c9"]},
        {"id": "dk-bank", "label": "Your Danish bank", "kind": "channel", "parent": "eifo-g", "status": "open", "cite": ["judgement"]},
        {"id": "de", "label": "Germany: GmbH Munich", "kind": "channel", "cite": ["judgement"]},
        {"id": "lfa-n", "label": "LfA Förderbank Bayern", "kind": "institution", "parent": "de", "cite": ["w2"]},
        {"id": "lfa-uk", "label": "Universalkredit with 60% risk release, up to 7.5m", "kind": "instrument", "parent": "lfa-n", "status": "open", "cite": ["w2"]},
        {"id": "spk", "label": "Your Munich savings bank", "kind": "channel", "parent": "lfa-uk", "status": "open", "cite": ["c47"]},
        {"id": "bk", "label": "Bayern Kapital (co-investment)", "kind": "institution", "parent": "lfa-n", "status": "probe", "cite": ["unverified"]},
        {"id": "bb", "label": "Bürgschaftsbank Bayern (1m cap)", "kind": "institution", "parent": "de", "status": "park", "cite": ["c16"]}
      ],
      "cite": ["c1", "w2"]
    }
  ],
  "process_maps": [
    {
      "id": "lfa-line",
      "title": "How the German line with LfA risk release is decided",
      "explains": "You apply at the savings bank; the bank sets the rate and on-lends; LfA takes 60% of the risk.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "gmbh", "name": "Your GmbH", "side": "market"},
        {"id": "spk", "name": "Munich savings bank", "side": "market"},
        {"id": "lfa-a", "name": "LfA Förderbank Bayern", "side": "public-capital"}
      ],
      "steps": [
        {"id": "apply", "label": "GmbH applies at the savings bank", "kind": "step", "actor": "gmbh", "cite": ["c47"], "gates": [{"label": "Turnover up to 500m", "cite": ["c46"]}, {"label": "Before the first GmbH project starts", "cite": ["judgement"]}, {"label": "Tax review and Regina's read done", "cite": ["judgement"]}]},
        {"id": "rate", "label": "Bank and GmbH agree the rate", "kind": "decision", "actor": "spk", "cite": ["c48"], "gates": [{"label": "Credit standing and collateral value", "cite": ["c48"]}]},
        {"id": "release", "label": "LfA takes 60% of the credit risk", "kind": "decision", "actor": "lfa-a", "cite": ["w2"], "gates": [{"label": "Loan up to 7.5m", "cite": ["w2"]}]},
        {"id": "onlend", "label": "Bank pays out and on-lends", "kind": "step", "actor": "spk", "cite": ["c49"]}
      ],
      "flow": [{"from": "apply", "to": "rate"}, {"from": "rate", "to": "release", "label": "bank asks for risk release"}, {"from": "release", "to": "onlend"}],
      "leverage": [
        {"id": "lev-round", "at": "rate", "kind": "door_opener", "label": "Closed Series A and the lead's due diligence", "why": "Improves the credit read.", "how": "Share term sheet and data-room summary with the adviser.", "side": "market", "cite": ["judgement"]},
        {"id": "lev-start", "at": "apply", "kind": "timing_window", "label": "Before the first GmbH contract", "why": "Promotional loans precede the project.", "how": "Set the move date backwards from filing.", "side": "public-capital", "cite": ["c30", "judgement"]}
      ],
      "cite": ["c47", "w2"]
    },
    {
      "id": "eifo-cover",
      "title": "How the EIFO cover on the Danish line is decided",
      "explains": "Your bank files with EIFO; EIFO covers up to 80% of the bank's final loss on the new facility.",
      "kind": "funding_decision",
      "illustrative": true,
      "actors": [
        {"id": "aps", "name": "Your ApS", "side": "market"},
        {"id": "dkb", "name": "Your Danish bank", "side": "market"},
        {"id": "eifo-a", "name": "EIFO", "side": "public-capital"}
      ],
      "steps": [
        {"id": "ask", "label": "ApS asks for new headroom with EIFO cover", "kind": "step", "actor": "aps", "cite": ["judgement"], "gates": [{"label": "Expands the bank's commitment", "cite": ["c9"]}, {"label": "Facility from DKK 2m", "cite": ["c8"]}]},
        {"id": "file", "label": "Bank files with EIFO", "kind": "document", "actor": "dkb", "cite": ["unverified"], "gates": [{"label": "Positive equity and creditworthy", "cite": ["c2"]}, {"label": "Group under 749 employees", "cite": ["c6"]}]},
        {"id": "decide", "label": "EIFO decides; premium by rating", "kind": "decision", "actor": "eifo-a", "cite": ["c4"], "gates": [{"label": "Up to 80%, max 50% of bank's total loss on you", "cite": ["c1"]}]}
      ],
      "flow": [{"from": "ask", "to": "file"}, {"from": "file", "to": "decide"}],
      "leverage": [
        {"id": "lev-close", "at": "decide", "kind": "timing_window", "label": "Right after close", "why": "Fresh equity settles the equity gate.", "how": "Bank prepares now, files on close.", "side": "public-capital", "cite": ["c2", "judgement"]},
        {"id": "lev-prec", "at": "eifo-a", "kind": "precedent", "label": "No comparable case found", "why": "First-of-a-kind ask needs a stronger case.", "how": "Ask for their closest case.", "side": "public-capital", "cite": ["judgement"]}
      ],
      "cite": ["c1", "c2", "c9"]
    }
  ],
  "networks": [
    {
      "id": "channels",
      "title": "Who backs whom around your two banks",
      "explains": "Public bodies back the banks and funds you already deal with; your investors open the co-investment door.",
      "nodes": [
        {"id": "eif", "label": "EIF (InvestEU)", "kind": "institution", "cite": ["w1"]},
        {"id": "dkb", "label": "Danish banks (e.g. Danske)", "kind": "bank", "cite": ["w1"]},
        {"id": "eifo-n", "label": "EIFO", "kind": "institution", "cite": ["c5"]},
        {"id": "lfa-n2", "label": "LfA Förderbank Bayern", "kind": "bank", "cite": ["w2"]},
        {"id": "spk-n", "label": "Munich savings bank", "kind": "bank", "cite": ["c47"]},
        {"id": "bk-n", "label": "Bayern Kapital", "kind": "institution", "cite": ["unverified"]},
        {"id": "lead-n", "label": "Your German lead fund", "kind": "body", "cite": ["judgement"]}
      ],
      "edges": [
        {"from": "eif", "to": "dkb", "kind": "funds", "label": "guarantee cover", "cite": ["w1"]},
        {"from": "eifo-n", "to": "dkb", "kind": "funds", "label": "loss guarantee", "cite": ["c5"]},
        {"from": "lfa-n2", "to": "spk-n", "kind": "funds", "label": "risk release", "cite": ["w2"]},
        {"from": "lfa-n2", "to": "bk-n", "kind": "oversees", "label": "parent", "cite": ["unverified"]},
        {"from": "bk-n", "to": "lead-n", "kind": "works_with", "label": "co-invests beside a private lead", "cite": ["unverified"]}
      ],
      "cite": ["w1", "w2", "unverified"]
    }
  ]
}
```
