# Simulated conversation: forklift_spatial_dk_de

Case: `mandate/eval/scenarios/forklift_spatial_dk_de.yaml`. Brain: Wincent. Playbooks at 9dc70d75f8. 2026-11-24T08:56:00+00:00. 12 turns (script 12/12; stopped: wrapped_up; client agent called 4x).
Leave-one-out case library: 3 entries left out (forklift_mispriced_market_velocity, forklift_regulatory_flag_to_regina, forklift_risk_not_to_customer).

## Turn 1: the founder (opener, script)

> We sell forklift safety sensors. We pay everything upfront, get paid at go-live, and it kills our cash. We're also raising. Can the state help?

## Turn 1: Wincent

Yes, probably, and on two fronts. Your cash gap (you pay everything upfront and get paid at go-live) is the kind of mispriced risk that public guarantees and working-capital cover exist for. The raise is a separate opening, because some public lenders and co-investors match a round once private investors have done their due diligence (judgement). Which bodies can help depends on where you are set up, so I'll name them once I know that.

You've already told me the nature of the gap and that you're raising. Three things decide the route from here:

1. **Where are you incorporated, and where do you have entities with staff?** Public money is decided by structure first, and each entity with people opens its own country's banks and schemes (judgement). A sales or installation team abroad can be a second front, not something to park.
2. **How big is the gap?** Roughly what one deployment costs you upfront, how many months it takes to go-live, and how many deployments you run each year. That decides whether a guarantee on your bank line is enough or you need a dedicated project facility. It also lets me work out how much faster your capital could turn over.
3. **Where is the round?** The amount, whether you have a lead, and the expected close date. If the round closes before a public matching loan can be filed, that route is gone and working-capital cover leads instead.

**Safe whatever you answer:** don't close or sign the round until we've checked whether any matching route needs its application filed before the close (unverified, to confirm per country).

**What not to do yet:** don't solve the gap by moving the cost onto your customers through leasing or buyer credit. It makes your offer less competitive, and the better fix is for the public side to carry the risk (judgement).

Which country are you incorporated in, and where do your people sit?

```mandate-board
{
  "title": "Forklift safety sensors: public help for the cash gap and the raise",
  "stage": "qualify",
  "hierarchies": [
    {
      "id": "field",
      "title": "Two needs, two kinds of public money",
      "explains": "The cash gap and the raise are separate needs. Each goes to a different kind of public money, and the countries are named once your structure is known.",
      "nodes": [
        {"id": "client", "label": "Your company", "kind": "institution", "cite": ["judgement"]},
        {"id": "gap", "label": "Cash gap: you pay upfront, get paid at go-live", "kind": "programme", "parent": "client", "status": "probe", "note": "Fits guarantees or working-capital cover through your bank", "cite": ["judgement"]},
        {"id": "gap-bank", "label": "Your house bank (per entity, per country)", "kind": "channel", "parent": "gap", "status": "probe", "note": "Which bank? It decides which public cover it can pass on", "cite": ["judgement"]},
        {"id": "raise", "label": "The raise", "kind": "programme", "parent": "client", "status": "probe", "note": "Public matching or co-investment, timed before the close", "cite": ["judgement"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "risks_flags": [
    {
      "id": "seq-close",
      "kind": "flag",
      "severity": "high",
      "title": "Round could close before a matching route is filed",
      "fix": "Hold the signing until we confirm each route's filing timing",
      "cite": ["unverified"]
    },
    {
      "id": "not-customer",
      "kind": "flag",
      "severity": "medium",
      "title": "Moving the cost onto customers weakens the offer",
      "fix": "Get the public side to carry the risk on your own financing first",
      "cite": ["judgement"]
    }
  ]
}
```

## Turn 2: the founder (answer, if_asked+client_agent)

> Danish ApS is the parent and signs most contracts, even German ones. We have a GmbH in Munich, about 8 people doing sales and installation.
> 
> A typical project is €300k to €800k upfront and takes 4 to 9 months to go live. Deployments per year, I'd guess 10 to 15 at the moment, but don't hold me to that. The pipeline is about €40M, so the gap only gets bigger.

## Turn 2: Wincent

I've checked the Danish and Bavarian guarantee and loan products against your structure. Here is what changes.

**Your gap, roughly.** At the midpoints (€550k per project, 6.5 months to go-live, 12 to 13 a year), about €3.7M is tied up at any one time. Your ranges give anything from €1M to €9M (judgement, from your figures). That is a bank-line problem with public cover, not a grant problem.

**Denmark leads, because the ApS signs and carries the cost.** The state export and investment fund, EIFO, guarantees up to 80% of the loss on a facility your bank gives the ApS, capped at 50% of the bank's total loss on you [c25]. Facilities start at DKK 2M with no maximum [c32] and run up to three years [c27]. The premium is 0.8% to 6.3% a year [c28]. The cover must expand what the bank already lends you [c33], and the ApS needs positive equity [c26]. EIFO also has a contract guarantee that insures up to 90% of the loss if an export order cannot be completed or paid [c42]. Your German orders signed by the ApS should count as exports (judgement).

**Munich is a second front, not a parked one.** The GmbH has a site in Bavaria. That opens the Bavarian state development bank LfA's Universalkredit, which can finance working capital. LfA can take 60% of the bank's risk on loans up to €4M, and the application goes through the GmbH's own bank before the spending starts [w1]. Today it would carry only the GmbH's own costs.

**One for Regina:** forklift safety sensors may fall under the EU Machinery Regulation, which affects how backers read the risk (unverified; I've handed it to Regina).

To narrow from here:
1. Which banks do the ApS and the GmbH use, and do they already give you a credit line?
2. Is the ApS's equity positive on the latest accounts?
3. The raise: how much, and when does it close?

```mandate-board
{
  "title": "Forklift safety sensors: public help for the cash gap and the raise",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "Two fronts: the Danish parent and the Munich GmbH",
      "explains": "The ApS signs and carries the project cost, so Danish cover leads. The GmbH has a Bavarian site, which opens LfA through its own bank.",
      "nodes": [
        {"id": "client", "label": "Your group", "kind": "institution", "cite": ["judgement"]},
        {"id": "dk", "label": "Denmark: ApS (signs contracts, carries upfront cost)", "kind": "channel", "parent": "client", "cite": ["judgement"]},
        {"id": "eifo", "label": "EIFO, Danish Export and Investment Fund", "kind": "institution", "parent": "dk", "cite": ["c25"]},
        {"id": "eifo-g", "label": "EIFO-Guarantee to your bank", "kind": "instrument", "parent": "eifo", "status": "open", "note": "Up to 80% of loss on the line; must expand the bank's lending; positive equity", "cite": ["c25", "c33", "c26"]},
        {"id": "eifo-cg", "label": "EIFO Contract Guarantee", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "Up to 90% of loss if an export order fails; EIFO must accept the buyer", "cite": ["c42", "c41"]},
        {"id": "eifo-gl", "label": "EIFO Growth Loan", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "EIFO lends 50% of the need alongside the bank; CIBOR + 4-10%", "cite": ["c34", "c38"]},
        {"id": "eifo-wc", "label": "EIFO Working Capital Guarantee", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "Product sheet found, not yet read; terms to confirm", "cite": ["unverified"]},
        {"id": "de", "label": "Germany: GmbH Munich (8 staff, sales and installation)", "kind": "channel", "parent": "client", "cite": ["judgement"]},
        {"id": "stmwi54", "label": "Bavarian Economy Ministry, Referat 54: LfA, SME finance", "kind": "unit", "parent": "de", "cite": ["c10"]},
        {"id": "lfa", "label": "LfA Förderbank Bayern", "kind": "regional_body", "parent": "stmwi54", "cite": ["c1"]},
        {"id": "lfa-uk", "label": "Universalkredit with HaftungPlus (60% risk taken)", "kind": "instrument", "parent": "lfa", "status": "open", "note": "Working capital eligible; via the GmbH's bank, before spending starts", "cite": ["w1"]}
      ],
      "cite": ["c1", "c10", "c25", "w1"]
    }
  ],
  "risks_flags": [
    {"id": "equity", "kind": "flag", "severity": "high", "title": "EIFO requires positive equity", "fix": "Confirm on the latest ApS accounts; the raise can restore it", "cite": ["c26"]},
    {"id": "expand", "kind": "flag", "severity": "medium", "title": "Cover must expand the bank's lending, not refinance it", "fix": "Ask for a new or larger project line, not cover on the existing one", "cite": ["c33"]},
    {"id": "lfa-start", "kind": "flag", "severity": "medium", "title": "LfA: no project already started", "fix": "The GmbH's bank files before the costs it finances begin", "cite": ["w1"]},
    {"id": "regina-mr", "kind": "flag", "severity": "low", "title": "Machinery Regulation status of the sensors", "fix": "Regina to confirm", "cite": ["unverified"]}
  ]
}
```

Sources: [c1] LfA Förderbank Bayern, https://www.lfa.de/website/de/lfa/organe/vorstand/index.php (b562194b64dd). [c10] StMWi org chart, https://www.stmwi.bayern.de/fileadmin/user_upload/stmwi/Ministerium/Organisation/Organisationsplan-Bayerisches-Wirtschaftsministerium.pdf (d355a402bf0c). [c25]–[c33] EIFO-Guarantee sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (c3f998cb12f6). [c34], [c38] EIFO Growth Loan sheet, https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf (6dfac0993cfe). [c41]–[c42] EIFO Contract Guarantee sheet, https://eifo.dk/media/kxcobjxc/dk_2-2n-_-contract-guarantee-_produktark-2026.pdf (40c7083eedf8). [w1] [Förderdatenbank, LfA Universalkredit](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/universalkredit.html), retrieved 2026-11-24: "LfA vereinbart mit Ihrer Bank eine Risikoverteilung in Höhe von 60 zu 40 Prozent". Unverified: [EIFO Working Capital Guarantee sheet](https://www.eifo.dk/media/zkbhobmw/eifo_working-capital-guarantee-product-sheet.pdf) (returned 404 when fetched).

## Turn 3: the founder (answer, if_asked)

> Series A, 12 million. We have a lead in talks, closing in about four months.

## Turn 3: Wincent

A €12M Series A with a lead in talks and four months to close changes the order of things. Use the round to unlock the debt, and use the debt so the round isn't spent on project cash.

**Money logic.** Equity is the dearest money you have for the cash gap (judgement). Of the round, about €3.7M would sit in projects waiting for go-live (from your midpoints). At an assumed €40M pre-money, that is roughly 7% of the company paid for cash that comes back within months (judgement, illustrative). A bank line with EIFO taking up to 80% of the loss [c25] carries that cost at a premium of 0.8% to 6.3% a year [c28]. The round also helps you pass EIFO's positive-equity gate [c26], and EIFO's Growth Loan explicitly takes loss-making venture cases with documented scaling potential [c36]. A closed Series A is that documentation (judgement).

**On the raise itself.** EIFO also invests equity alongside private investors. A Danish robotics company, Robotto, is in its investment register (register record, eifo.dk). EIFO's own co-investment terms I could not confirm (unverified). The lead is the natural one to bring EIFO into the round (judgement). The match loan looks out of reach: it is for very early companies with small revenue, and your project volume suggests you are past that (unverified).

**Sequence.** Open the bank and EIFO conversations now, so the line is agreed in principle at close and switched on with the fresh equity (judgement). Don't let the round be sized on the assumption that it funds project cash.

Two questions:
1. Which banks do the ApS and the GmbH use?
2. How much of the €12M is currently earmarked for working capital?

```mandate-board
{
  "title": "Forklift safety sensors: public help for the cash gap and the raise",
  "stage": "options",
  "routes": {
    "levels": [
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on a new project line", "institution": "EIFO", "via": "the ApS's bank", "status": "open", "why": "Up to 80% of loss on the line; carries the upfront project cash", "conditions": ["Positive equity, creditworthy", "Must expand the bank's lending", "Facility from DKK 2M"], "cite": ["c25", "c26", "c33", "c32"]},
        {"id": "eifo-gl", "name": "EIFO Growth Loan", "institution": "EIFO", "via": "alongside the bank, 50% of the need", "status": "probe", "why": "Takes loss-making venture cases with documented scaling", "conditions": ["CIBOR + 4-10%", "Positive equity"], "cite": ["c34", "c36", "c38"]},
        {"id": "eifo-cg", "name": "EIFO Contract Guarantee", "institution": "EIFO", "status": "probe", "why": "Insures up to 90% if an export order fails; comfort for the bank", "conditions": ["EIFO accepts the buyer", "Danish exporter"], "cite": ["c42", "c41", "c43"]},
        {"id": "eifo-wc", "name": "EIFO Working Capital Guarantee", "institution": "EIFO", "status": "probe", "why": "Aimed at operating costs; terms not yet read", "cite": ["unverified"]},
        {"id": "eifo-eq", "name": "EIFO equity co-investment in the Series A", "institution": "EIFO", "via": "your lead", "status": "probe", "why": "EIFO invests alongside private investors; terms to confirm", "cite": ["unverified"]},
        {"id": "eifo-ml", "name": "EIFO Match Loan", "institution": "EIFO", "status": "park", "why": "For very early companies with small revenue; likely past it", "cite": ["unverified"]}
      ]},
      {"id": "de-by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-uk", "name": "LfA Universalkredit with HaftungPlus", "institution": "LfA Förderbank Bayern", "via": "the GmbH's bank, before spending starts", "status": "open", "why": "Working capital eligible; LfA takes 60% of risk up to EUR 4M; GmbH costs only today", "cite": ["w1"]},
        {"id": "bb-by", "name": "Guarantee bank guarantee (Bürgschaftsbank Bayern)", "institution": "Bürgschaftsbank Bayern", "via": "the GmbH's bank", "status": "probe", "why": "Not yet researched", "cite": ["unverified"]}
      ]},
      {"id": "de-fed", "level": "national", "label": "Germany federal", "country": "DE", "doors": [
        {"id": "kfw", "name": "KfW on-lending via the GmbH's bank", "institution": "KfW", "status": "probe", "why": "Not yet researched", "cite": ["unverified"]}
      ]},
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eif-bank", "name": "EIF-backed guarantees on your bank's SME book", "institution": "EIF", "via": "your bank", "status": "probe", "why": "Depends on which bank you use", "cite": ["unverified"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Customer side", "doors": [
        {"id": "cust-fin", "name": "Leasing or buyer credit for your customers", "institution": "Lessors, EIFO buyer financing", "status": "park", "why": "Moves your cost onto the customer and weakens the offer; complement only", "cite": ["judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 3700000, "label": "Cash tied in projects at midpoints (illustrative)"},
    "instruments": [
      {"id": "series-a", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Should carry product, team and growth; dearest money for project cash", "status": "in_progress", "cite": ["judgement"]},
      {"id": "line", "name": "Project line from the ApS's bank", "type": "loan", "amount": 3700000, "terms": "Carries the upfront project cash; cheap once EIFO takes the risk", "status": "planned", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "EIFO-Guarantee on that line", "type": "guarantee_debt", "terms": "Adds no cash; up to 80% of loss taken, 0.8-6.3% premium", "status": "probe", "cite": ["c25", "c28"]},
      {"id": "lfa-line", "name": "LfA Universalkredit for the GmbH", "type": "loan", "terms": "Carries the GmbH's own costs; 60% of risk with LfA", "status": "probe", "cite": ["w1"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "debt", "label": "Project line", "steps": [
        {"id": "bank-ask", "label": "ApS bank: new project line with EIFO cover", "start": 0, "end": 1, "owner": "client", "status": "planned", "cite": ["c33"]},
        {"id": "line-live", "label": "Line switched on with fresh equity", "start": 4, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["bank-ask", "close"], "cite": ["judgement"]}
      ]},
      {"id": "raise", "label": "Series A", "steps": [
        {"id": "eifo-lead", "label": "Lead sounds out EIFO co-investment", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "no-size", "label": "Do not size the round to fund project cash", "start": 0, "end": 4, "owner": "client", "status": "blocked", "cite": ["judgement"]},
        {"id": "close", "label": "Series A close", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-equity", "label": "ApS equity positive at close (EIFO gate)", "start": 4, "milestone": true, "owner": "us", "status": "planned", "cite": ["c26"]},
        {"id": "w-lfa", "label": "LfA terms current (sheet dated 2024)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "dilution", "kind": "flag", "severity": "high", "title": "Round spent on project cash", "fix": "Agree the EIFO-backed line in principle before close", "cite": ["judgement"]}
  ]
}
```

Sources: [c25], [c26], [c28], [c32], [c33] [EIFO-Guarantee product sheet 2026](https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf) (c3f998cb12f6). [c34], [c36], [c38] [EIFO Growth Loan product sheet 2026](https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf) (6dfac0993cfe). [c41], [c42], [c43] [EIFO Contract Guarantee product sheet 2026](https://eifo.dk/media/kxcobjxc/dk_2-2n-_-contract-guarantee-_produktark-2026.pdf) (40c7083eedf8). [w1] [LfA Universalkredit, Förderdatenbank](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/universalkredit.html) (retrieved 2026-11-24). Register record: [EIFO investments in companies](https://eifo.dk/for-dig-som-er/fond-eller-investor/investering-i-virksomheder).

## Turn 4: the founder (answer, client_agent)

> For banks, the ApS is with a Danish high-street bank and the GmbH with a local savings bank in Munich. We haven't formally split the €12M yet. Honestly, a big chunk was going to go into project cash, but I'd have to check the exact number with our CFO.

## Turn 4: Wincent

Good, that settles the channels. The Danish bank carries the lead, and the savings bank in Munich is the second door. The CFO's number decides the size of the line, not the order of the routes.

**Where I'd put the energy:**

1. **Lead: a new project line from the ApS's bank, with EIFO cover.** It carries the cost that kills your cash, in the entity that actually carries it. EIFO takes up to 80% of the loss on the line [c25], so the bank lends against your pipeline rather than your balance sheet. Effort is moderate because the bank files (judgement).
2. **In parallel: the GmbH's savings bank in Munich, for the GmbH's own costs.** Savings banks are a standard channel for state development loans [c73]. Two options run through it:
   - **LfA Universalkredit.** LfA takes 60% of the bank's risk on loans up to €4M [w1].
   - **A guarantee from Bavaria's guarantee bank.** It covers up to 80%, capped at €1M per borrower [c50] [c52].

   Either one needs filing before the spending starts [w1].
3. **Probe: EIFO equity in the Series A, raised by your lead** (unverified).

I'd park EIFO's Growth Loan for now. At CIBOR plus 4% to 10% [c38] it is dearer than a covered line, and it only matters if the bank line comes in short.

**I'd push back on putting a big chunk of the round into project cash.** That cash comes back at every go-live. Funding it with equity means paying permanent dilution for a short-term need (judgement).

**One option to know about, not a move to make:** booking German contracts in the GmbH would open the larger Bavarian loan, which goes up to €15M [w1]. It has tax and transfer-pricing costs that need weighing first (judgement).

Do you agree with this order? And can your CFO give me the peak cash tied up across projects, not the average?

```mandate-board
{
  "title": "Forklift safety sensors: public help for the cash gap and the raise",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Lead: a new project line from the ApS's Danish bank, with EIFO taking up to 80% of the loss.",
      "In parallel: the GmbH's savings bank, with LfA or the Bavarian guarantee bank taking part of the risk on the GmbH's own costs.",
      "Probe: EIFO equity in the Series A, through your lead; keep the round off project cash."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by structure; size depends on the CFO's peak figure and positive equity.",
    "open_question": "Peak cash tied up across projects, and ApS equity after close?",
    "cite": ["c25", "w1", "c50", "c26"]
  },
  "routes": {
    "levels": [
      {"id": "de-by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "bb-by", "name": "Guarantee bank guarantee (Bürgschaftsbank)", "institution": "Bürgschaftsbank Bayern", "via": "the GmbH's savings bank", "status": "open", "why": "Up to 80% of the risk, max EUR 1M per borrower; viable firm short of collateral", "conditions": ["Applied through the bank", "No restructurings"], "cite": ["c50", "c52", "c47", "c49"]},
        {"id": "gmbh-contracts", "name": "Book German contracts in the GmbH", "institution": "LfA Förderbank Bayern", "status": "park", "why": "Opens up to EUR 15M Universalkredit; tax and transfer-pricing trade-offs first", "cite": ["w1", "judgement"]}
      ]},
      {"id": "de-fed", "level": "national", "label": "Germany federal", "country": "DE", "doors": [
        {"id": "kfw", "name": "KfW / ERP loan via the GmbH's savings bank", "institution": "KfW", "via": "banks and savings banks", "status": "probe", "why": "Through savings banks; before the project starts; SME test", "cite": ["c73", "c66", "c64"]},
        {"id": "hermes", "name": "Hermes export cover", "institution": "Federal export credit guarantees", "status": "park", "why": "For German exporters; the GmbH does not export", "cite": ["c75", "judgement"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-gl", "name": "EIFO Growth Loan", "institution": "EIFO", "status": "park", "why": "CIBOR + 4-10%: dearer than a covered line; reopen if the line comes in short", "cite": ["c38", "judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 3700000, "label": "Cash tied in projects at midpoints (illustrative; CFO to give peak)"},
    "instruments": [
      {"id": "series-a", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Product, team, growth; not project cash: permanent dilution for cash that returns at go-live", "status": "in_progress", "cite": ["judgement"]},
      {"id": "line", "name": "Project line from the ApS's Danish bank", "type": "loan", "amount": 3700000, "terms": "Carries upfront project cash; revolves at each go-live", "status": "planned", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "EIFO-Guarantee on that line", "type": "guarantee_debt", "terms": "Adds no cash; up to 80% of loss taken, premium 0.8-6.3% a year", "status": "planned", "cite": ["c25", "c28"]},
      {"id": "lfa-line", "name": "LfA Universalkredit or guarantee-bank cover for the GmbH", "type": "loan", "terms": "Carries GmbH payroll, installation, local stock; 60% (LfA) or 80% (guarantee bank) of risk public", "status": "probe", "cite": ["w1", "c50"]}
    ]
  },
  "risks_flags": [
    {"id": "dilution", "kind": "flag", "severity": "high", "title": "Round planned to fund project cash", "fix": "Split the round with the CFO; size the covered line to peak exposure", "cite": ["judgement"]},
    {"id": "bb-cap", "kind": "flag", "severity": "low", "title": "Guarantee bank capped at EUR 1M per borrower", "fix": "Use LfA HaftungPlus if the GmbH need is larger", "cite": ["c52", "w1"]}
  ]
}
```

Sources: [c25], [c26], [c28] [EIFO-Guarantee sheet 2026](https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf) (c3f998cb12f6). [c38] [EIFO Growth Loan sheet 2026](https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf) (6dfac0993cfe). [c47], [c49], [c50], [c52] [VDB guarantee banks FAQ](https://www.vdb-info.de/de/ueber-uns/nutzliche-infos/faq/) (30ddc2628aa5). [c64], [c66], [c73] [KfW ERP-Förderkredit KMU sheet](https://kfw.de/PDF/Download-Center/Förderprogramme-(Inlandsförderung)/PDF-Dokumente/6000004842_M_365.pdf) (31b2116df386). [c75] [Hermes application procedure](https://www.exportkreditgarantien.de/de/loesungen/einstieg-in-die-absicherung/antragsverfahren.html) (f7675952b017). [w1] [LfA Universalkredit, Förderdatenbank](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/universalkredit.html), retrieved 2026-11-24: "Richten Sie Ihren Antrag bitte vor Beginn Ihres Vorhabens an Ihre Hausbank".

## Turn 5: the founder (answer, client_agent)

> I'll ask our CFO for the peak number. For now, we already run a working-capital line of about €3M at a high rate, and it's backed by personal guarantees from us founders. It's stretched most of the time.

## Turn 5: Wincent

That €3M line is the opening. Your bank charges a high rate and asks for your personal guarantees because it can't price the projects behind the line. That mispriced risk is exactly what EIFO's cover is for (judgement).

**The ask to the bank: a larger, covered project line.** Take it to whichever bank holds the €3M (I'm assuming the ApS's Danish bank).
- **Size.** EIFO covers only financing that expands what the bank already lends you [c33]. Asking for cover on the existing €3M would not qualify. Ask for a larger project line, with EIFO covering up to 80% of the loss on it [c25].
- **Terms.** With most of the risk off its book, the bank has room to lower the rate and to drop or reduce your personal guarantees. Whether EIFO's own terms say anything on personal guarantees I have not confirmed (unverified), so it is a negotiating point, not a right.
- **Ask early.** Your lead will look at founder guarantees in diligence, so this is worth raising with the bank before close (judgement).

**Why size matters.** At €550k per project and 6.5 months each, a fully drawn €3M carries about five projects at once, so around nine a year. That is roughly your current pace, so the line is what caps your growth. A €7M covered line would carry about 13 at once, around 24 a year (judgement, from your midpoints). The CFO's peak figure will firm this up.

**Move the GmbH's costs.** Payroll and installation in Germany can move to the savings bank's line with LfA taking 60% of the risk [w1]. That frees room on the Danish line for project cash (judgement).

Two things before I set out who to call and how:
1. Is the €3M with the ApS's Danish bank?
2. Roughly what rate are you paying?

```mandate-board
{
  "title": "Forklift safety sensors: public help for the cash gap and the raise",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Lead: replace the stretched EUR 3M line with a larger project line at the ApS's bank, EIFO taking up to 80% of the loss on the new facility.",
      "Negotiate the rate down and the founders' personal guarantees off as part of it.",
      "In parallel: move GmbH costs to the savings bank with LfA or guarantee-bank cover; probe EIFO equity in the Series A."
    ],
    "confidence": "medium",
    "confidence_why": "Fits EIFO's rules if the facility expands; size waits on the CFO's peak figure and positive equity.",
    "open_question": "Is the EUR 3M line with the ApS's Danish bank, and at what rate?",
    "cite": ["c25", "c33", "w1"]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 7000000, "label": "Covered line to carry ~13 projects at once (illustrative)"},
    "instruments": [
      {"id": "old-line", "name": "Existing working-capital line", "type": "loan", "amount": 3000000, "terms": "Carries project cash today; dear: high rate plus founders' personal guarantees", "status": "secured", "cite": ["judgement"]},
      {"id": "line", "name": "Larger project line from the ApS's bank", "type": "loan", "amount": 7000000, "terms": "Carries upfront project cash; revolves at each go-live; must expand the bank's commitment", "status": "planned", "cite": ["c33", "judgement"]},
      {"id": "eifo-cover", "name": "EIFO-Guarantee on the new facility", "type": "guarantee_debt", "terms": "Adds no cash; makes the line cheap: up to 80% of loss with EIFO, premium 0.8-6.3% a year", "status": "planned", "cite": ["c25", "c28"]}
    ]
  },
  "process": [
    {
      "id": "cover",
      "title": "How EIFO's cover fixes the line",
      "caption": "EIFO takes most of the loss, so the bank can lend more, cheaper, without founder guarantees.",
      "nodes": [
        {"id": "eifo", "label": "EIFO", "kind": "institution"},
        {"id": "bank", "label": "ApS's Danish bank", "kind": "bank"},
        {"id": "aps", "label": "Your ApS", "kind": "client"},
        {"id": "proj", "label": "Projects to go-live", "kind": "asset"},
        {"id": "cust", "label": "Customers", "kind": "customer"}
      ],
      "edges": [
        {"from": "eifo", "to": "bank", "label": "covers up to 80% of the loss", "kind": "risk"},
        {"from": "bank", "to": "aps", "label": "a larger project line", "kind": "money"},
        {"from": "aps", "to": "proj", "label": "pays hardware and install upfront", "kind": "money"},
        {"from": "cust", "to": "aps", "label": "pays at go-live; line revolves", "kind": "money"}
      ],
      "cite": ["c25", "c29"]
    }
  ],
  "risks_flags": [
    {"id": "expand", "kind": "deal_breaker", "severity": "high", "title": "Cover on the existing EUR 3M will not qualify", "fix": "Ask for a new, larger facility; EIFO covers the expansion", "cite": ["c33"]},
    {"id": "pg", "kind": "flag", "severity": "medium", "title": "Founders' personal guarantees on the line", "fix": "Negotiate release as part of the covered facility, before the Series A diligence", "cite": ["unverified"]}
  ]
}
```

Sources: [c25], [c28], [c29], [c33] [EIFO-Guarantee product sheet 2026](https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf) (c3f998cb12f6). [w1] [LfA Universalkredit, Förderdatenbank](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/universalkredit.html), retrieved 2026-11-24.

## Turn 6: the founder (answer, client_agent)

> I think the €3M sits with the ApS's Danish bank, but I'll get the CFO to confirm. I don't know the exact rate off the top of my head, just that it's high. I'll get the number.

## Turn 6: Wincent

That's enough to set out how to start. Once the CFO confirms the numbers, the plan below stands.

**The best way in is through your bank, not to EIFO directly.** The bank files the cover request with EIFO, and that is a standard product, not a political ask [c29]. The first call is to the ApS bank's corporate relationship manager, with three questions:
- Has the bank used EIFO cover on a working-capital facility before?
- Would it offer a larger project line on that basis?
- Would it release the founders' personal guarantees once EIFO carries most of the risk?

I found no recorded EIFO deal like yours [find_precedents: none]. Your bank's own covered facilities will be the precedent, so ask for them.

**What the file must show.** Positive equity [c26], fewer than 750 staff across the group [c30], and a facility that expands what the bank already lends you [c33]. Expect the premium to be set by your rating [c28].

**Munich runs in parallel, through the savings bank.** Its corporate advisor files the LfA request before the GmbH's new costs begin [w1]. Don't go to LfA's board or the Bavarian economy ministry. They oversee LfA [c86] [c85], so they are the escalation if something gets blocked, not the first door (judgement).

**What not to do yet:** commit the GmbH to new funded spending before the savings bank has filed. LfA won't fund a project that has already started [w1].

Would you like me to draft the note to your Danish relationship manager and a short one for the savings bank?

```mandate-board
{
  "title": "Forklift safety sensors: public help for the cash gap and the raise",
  "stage": "advise",
  "stakeholders": {
    "institutions": [
      {"id": "dk-bank", "name": "ApS's Danish bank", "side": "market", "country": "DK", "units": [{"id": "dk-corp", "name": "Corporate banking", "roles": [
        {"id": "dk-rm", "role": "Corporate relationship manager", "priority": "P1", "reach": "Your existing contact; the bank files with EIFO", "status": "to_approach", "cite": ["judgement"]},
        {"id": "dk-credit", "role": "Credit officer for the facility", "priority": "P2", "reach": "Through the relationship manager", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-guar", "name": "Guarantee team working with banks", "roles": [
        {"id": "eifo-head", "role": "Head of guarantees for SMEs and banks", "priority": "P1", "reach": "Only if the bank stalls; via EIFO's main line", "status": "to_approach", "cite": ["unverified"]},
        {"id": "eifo-am", "role": "EIFO account manager for your bank", "priority": "P2", "reach": "Your relationship manager knows them", "status": "to_approach", "cite": ["unverified"]}
      ]}, {"id": "eifo-vc", "name": "Venture investment team", "roles": [
        {"id": "eifo-inv", "role": "Investment director for industrial tech", "priority": "P1", "reach": "Introduced by your Series A lead", "status": "to_approach", "cite": ["unverified"]}
      ]}]},
      {"id": "sparkasse", "name": "GmbH's savings bank, Munich", "side": "market", "country": "DE", "units": [{"id": "sk-corp", "name": "Corporate clients", "roles": [
        {"id": "sk-adv", "role": "Corporate advisor (Firmenkundenberater)", "priority": "P1", "reach": "The GmbH's existing contact; files with LfA or the guarantee bank", "status": "to_approach", "cite": ["w1", "c49"]}
      ]}]},
      {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-prom", "name": "Promotional loans", "roles": [
        {"id": "lfa-unit", "role": "Head of the promotional loans unit", "priority": "P1", "reach": "Only if the savings bank's file stalls", "status": "to_approach", "cite": ["judgement"]},
        {"id": "lfa-board", "role": "Board member for promotional loans (Dr. Thomas Langer, by the chart's layout, as of 18 Nov 2026)", "priority": "P2", "reach": "Escalation only; not a first approach", "status": "to_approach", "cite": ["c84"]}
      ]}]},
      {"id": "stmwi", "name": "Bavarian Economy Ministry", "side": "political", "country": "DE", "units": [{"id": "ref54", "name": "Referat 54: LfA, SME finance", "roles": [
        {"id": "ref54-head", "role": "Head of Referat 54", "priority": "P2", "reach": "Only for a blocked file or a policy point", "status": "to_approach", "cite": ["c10"]}
      ]}]}
    ]
  },
  "process_maps": [
    {
      "id": "eifo-line",
      "title": "Getting a larger covered line at the ApS's bank",
      "explains": "The bank decides the facility and asks EIFO for the cover; you supply the numbers.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "aps", "name": "Your ApS (CFO)", "side": "market"},
        {"id": "bank", "name": "ApS's Danish bank", "side": "market"},
        {"id": "eifo", "name": "EIFO", "side": "public-capital"}
      ],
      "steps": [
        {"id": "pack", "label": "CFO builds the file: peak exposure, pipeline, accounts", "kind": "document", "actor": "aps", "timing": "1-2 weeks", "cite": ["judgement"], "gates": [{"label": "Positive equity, creditworthy", "cite": ["c26"]}, {"label": "Group under 750 staff", "cite": ["c30"]}, {"label": "Not listed on a main exchange", "cite": ["c33"]}]},
        {"id": "ask", "label": "Ask the bank for a larger project line with EIFO cover", "kind": "step", "actor": "aps", "cite": ["c29"], "gates": [{"label": "New financing expands the bank's commitment", "cite": ["c33"]}, {"label": "Facility at least DKK 2M", "cite": ["c32"]}]},
        {"id": "credit", "label": "Bank's credit decision, with cover requested", "kind": "decision", "actor": "bank", "timing": "weeks (unverified)", "cite": ["unverified"], "gates": [{"label": "Cover up to 80% of loss, max 50% of bank's total loss", "cite": ["c25"]}]},
        {"id": "eifo-ok", "label": "EIFO approves cover and sets the premium by rating", "kind": "decision", "actor": "eifo", "cite": ["c28"], "gates": [{"label": "Term up to three years, extendable", "cite": ["c27"]}]},
        {"id": "live", "label": "Facility live, ideally alongside the Series A close", "kind": "step", "actor": "bank", "timing": "month 4", "cite": ["judgement"]}
      ],
      "flow": [{"from": "pack", "to": "ask"}, {"from": "ask", "to": "credit"}, {"from": "credit", "to": "eifo-ok", "label": "cover request"}, {"from": "eifo-ok", "to": "live"}],
      "leverage": [
        {"id": "lv-rm", "at": "bank", "kind": "door_opener", "label": "Relationship manager who has done EIFO deals", "why": "A banker who knows the product files faster", "how": "Ask directly which EIFO-covered facilities they have done", "side": "market", "cite": ["judgement"]},
        {"id": "lv-round", "at": "credit", "kind": "timing_window", "label": "Series A close", "why": "Fresh equity strengthens the credit case and the equity gate", "how": "Show the term sheet in the credit file", "side": "market", "cite": ["c26", "judgement"]},
        {"id": "lv-prec", "at": "eifo-ok", "kind": "precedent", "label": "No recorded EIFO deal like this found", "why": "The bank's own covered facilities are the precedent", "how": "Ask the bank for comparable cases", "side": "public-capital", "cite": ["judgement"]}
      ],
      "cite": ["c25", "c29", "c33"]
    },
    {
      "id": "lfa-line",
      "title": "GmbH line through the savings bank",
      "explains": "The savings bank files with LfA before the new costs start; LfA takes 60% of the risk.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "gmbh", "name": "Your GmbH", "side": "market"},
        {"id": "sk", "name": "Savings bank, Munich", "side": "market"},
        {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital"}
      ],
      "steps": [
        {"id": "g-ask", "label": "GmbH asks for a line for its own costs", "kind": "step", "actor": "gmbh", "cite": ["w1"], "gates": [{"label": "Site in Bavaria", "cite": ["w1"]}, {"label": "Turnover up to EUR 500M", "cite": ["w1"]}, {"label": "Costs not yet started", "cite": ["w1"]}]},
        {"id": "g-file", "label": "Savings bank files with LfA (or guarantee bank)", "kind": "document", "actor": "sk", "cite": ["w1", "c49"], "gates": [{"label": "HaftungPlus up to EUR 4M", "cite": ["w1"]}, {"label": "Guarantee bank: max EUR 1M per borrower", "cite": ["c52"]}]},
        {"id": "g-ok", "label": "LfA agrees the 60/40 risk split", "kind": "decision", "actor": "lfa", "cite": ["w1"]}
      ],
      "flow": [{"from": "g-ask", "to": "g-file"}, {"from": "g-file", "to": "g-ok"}],
      "leverage": [
        {"id": "lv-start", "at": "g-ask", "kind": "blocker", "label": "Spending started before filing", "why": "LfA excludes projects already begun", "how": "File before new GmbH hires or stock", "side": "market", "cite": ["w1"]}
      ],
      "cite": ["w1"]
    }
  ],
  "networks": [
    {
      "id": "lfa-oversight",
      "title": "Who oversees LfA",
      "explains": "Finance supervises LfA; the economy ministry sits on its board. Escalation only.",
      "nodes": [
        {"id": "lfa", "label": "LfA Förderbank Bayern", "kind": "bank", "cite": ["c1"]},
        {"id": "stmfh", "label": "Bavarian Finance Ministry", "kind": "ministry", "cite": ["c85"]},
        {"id": "stmwi", "label": "Bavarian Economy Ministry", "kind": "ministry", "cite": ["c86"]},
        {"id": "vr", "label": "LfA administrative board (Verwaltungsrat)", "kind": "committee", "cite": ["c86"]},
        {"id": "ref54", "label": "Economy Ministry Referat 54: LfA, SME finance", "kind": "body", "cite": ["c10"]}
      ],
      "edges": [
        {"from": "stmfh", "to": "lfa", "kind": "oversees", "label": "legal supervision", "cite": ["c85"]},
        {"from": "stmwi", "to": "vr", "kind": "sits_on", "label": "deputy chair", "cite": ["c86"]},
        {"from": "vr", "to": "lfa", "kind": "oversees", "cite": ["c86"]},
        {"from": "ref54", "to": "stmwi", "kind": "member_of", "cite": ["c10"]}
      ],
      "cite": ["c85", "c86", "c10"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "debt", "label": "Project line (lead)", "steps": [
        {"id": "cfo", "label": "CFO: peak exposure, rate, line holder, equity", "start": 0, "end": 0.5, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "bank-ask", "label": "Meet the ApS relationship manager", "start": 0.5, "end": 1, "owner": "client", "status": "planned", "depends_on": ["cfo"], "cite": ["c29"]},
        {"id": "credit", "label": "Bank credit decision and EIFO cover in principle", "start": 1, "end": 3, "owner": "institution", "status": "planned", "depends_on": ["bank-ask"], "cite": ["unverified"]},
        {"id": "line-live", "label": "Larger covered line live; personal guarantees released", "start": 4, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["credit", "close"], "cite": ["judgement"]}
      ]},
      {"id": "gmbh", "label": "GmbH line (parallel)", "steps": [
        {"id": "sk-meet", "label": "Savings bank: line for GmbH costs with LfA cover", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "cite": ["w1"]},
        {"id": "no-spend", "label": "Do not start new funded GmbH spending before filing", "start": 0, "end": 1.5, "owner": "client", "status": "blocked", "cite": ["w1"]}
      ]},
      {"id": "raise", "label": "Series A", "steps": [
        {"id": "eifo-lead", "label": "Lead sounds out EIFO co-investment", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "split", "label": "Split the round with the CFO: keep project cash on the line", "start": 0.5, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "close", "label": "Series A close", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-equity", "label": "ApS equity positive at filing (EIFO gate)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["c26"]},
        {"id": "w-eifo-sheet", "label": "EIFO product sheets renewed for 2027", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-lfa", "label": "LfA terms current (2024 sheet)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-gl", "label": "Growth Loan: reopen if the bank line comes in short", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["c34"]},
        {"id": "w-gmbh", "label": "GmbH contracting option: revisit after the round", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]},
        {"id": "w-mr", "label": "Machinery Regulation status of the sensors (Regina)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  }
}
```

Sources: [c1] [LfA board page](https://www.lfa.de/website/de/lfa/organe/vorstand/index.php) (b562194b64dd). [c10] [StMWi org chart](https://www.stmwi.bayern.de/fileadmin/user_upload/stmwi/Ministerium/Organisation/Organisationsplan-Bayerisches-Wirtschaftsministerium.pdf) (d355a402bf0c). [c25]–[c33] [EIFO-Guarantee sheet 2026](https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf) (c3f998cb12f6). [c34] [EIFO Growth Loan sheet](https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf) (6dfac0993cfe). [c49], [c52] [VDB guarantee banks FAQ](https://www.vdb-info.de/de/ueber-uns/nutzliche-infos/faq/) (30ddc2628aa5). [c84] LfA board page, same URL as [c1]. [c85], [c86] [LfA administrative board](https://www.lfa.de/website/de/lfa/organe/verwaltungsrat/index.php) (45853c03945583). [w1] [LfA Universalkredit, Förderdatenbank](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/universalkredit.html), retrieved 2026-11-24.

## Turn 7: the founder (answer, if_asked)

> A Danish bank for the ApS and a savings bank in Munich for the GmbH. About 3 million working-capital line, expensive, and we gave personal guarantees.

## Turn 7: Wincent

That matches what we're working from, so the plan holds:

1. **Danish bank:** replace the stretched €3M line with a larger project line, with EIFO taking up to 80% of the loss on the new facility [c25]. It has to be a new, larger facility, because EIFO covers only financing that expands what the bank already lends you [c33].
2. **Same conversation:** a lower rate, and your personal guarantees reduced or released, since most of the risk moves to EIFO. This is a negotiating point, not a right (unverified).
3. **Savings bank in Munich:** a separate line for the GmbH's own costs, with LfA taking 60% of the risk, filed before those costs start [w1].

The founders' personal guarantees are the one thing that may matter beyond the bank. Your Series A lead will likely look at them in diligence (judgement). The bank conversation should therefore start now, not after close.

One question to pin down the ask: do your personal guarantees cover only the Danish €3M line, or also anything at the savings bank? If both, we ask both banks for release in the same round of talks.

I can also draft the two short notes now, one to your Danish relationship manager and one to the savings bank's corporate advisor. Shall I?

```mandate-board
{
  "title": "Forklift safety sensors: public help for the cash gap and the raise",
  "stage": "advise",
  "answer": {
    "lines": [
      "Danish bank: swap the stretched EUR 3M line for a larger project line with EIFO taking up to 80% of the loss on the new facility.",
      "In the same talk: a lower rate and the founders' personal guarantees reduced or released.",
      "Savings bank in Munich: a separate GmbH line with LfA taking 60% of the risk, filed before the costs start."
    ],
    "confidence": "medium",
    "confidence_why": "Structure fits; the facility size waits on the CFO's peak figure and the rate.",
    "open_question": "Do the personal guarantees cover only the Danish line, or the savings bank too?",
    "cite": ["c25", "c33", "w1"]
  },
  "risks_flags": [
    {"id": "pg", "kind": "flag", "severity": "medium", "title": "Founders' personal guarantees on the EUR 3M line", "fix": "Ask for release in the covered-facility talks, before Series A diligence", "cite": ["unverified"]}
  ]
}
```

Sources: [c25], [c33] [EIFO-Guarantee product sheet 2026](https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf) (c3f998cb12f6). [w1] [LfA Universalkredit, Förderdatenbank](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/universalkredit.html), retrieved 2026-11-24.

## Turn 8: the founder (options, script)

> OK, that is the picture. What are our options, broadly?

## Turn 8: Wincent

Broadly, there are four kinds of money for you. Ranked by fit:

1. **Public cover on your bank lines. This is the core.** EIFO on a larger line at the Danish bank [c25]. LfA [w1], or Bavaria's guarantee bank [c50], on a GmbH line at the savings bank. Each carries the cost that is hurting you, upfront project cash, at the price of a guarantee premium rather than dilution (judgement).
2. **Public loans alongside the bank. Your fallback.** EIFO's Growth Loan lends half of the need next to your bank, and it accepts loss-making companies that can show they can scale [c34] [c36]. A KfW loan through the savings bank works the same way on the German side [c73]. Both are dearer or narrower than cover, so they are worth it only if the covered line comes in short (judgement).
3. **Public equity in the round. A probe.** EIFO invests alongside private investors, and your lead is the one to bring it in (unverified on terms).
4. **Export and contract insurance. A complement.** EIFO's contract guarantee insures up to 90% of the loss if an order fails [c42]. That comfort helps the bank lend more, but it is not new cash.

Parked: the match loan, which looks too early-stage for you (unverified); German export cover, because the GmbH doesn't export [c75]; and customer financing, because it pushes your cost onto the buyer (judgement).

One front isn't open yet: **R&D**. Do you develop the sensors in-house, and in which entity? An R&D grant or tax credit would carry a different cost from the cash gap, and the rules differ by country.

```mandate-board
{
  "title": "Forklift safety sensors: public help for the cash gap and the raise",
  "stage": "options",
  "routes": {
    "levels": [
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on a larger project line", "institution": "EIFO", "via": "the ApS's Danish bank", "status": "open", "why": "Core: up to 80% of loss on the new facility; carries project cash", "conditions": ["Positive equity", "Expands the bank's lending", "From DKK 2M"], "cite": ["c25", "c26", "c33", "c32"]},
        {"id": "eifo-gl", "name": "EIFO Growth Loan", "institution": "EIFO", "status": "park", "why": "Fallback: 50% of need next to the bank, CIBOR + 4-10%", "cite": ["c34", "c38"]},
        {"id": "eifo-eq", "name": "EIFO equity co-investment in the Series A", "institution": "EIFO", "via": "your lead", "status": "probe", "why": "Co-invests alongside private investors; terms to confirm", "cite": ["unverified"]},
        {"id": "eifo-cg", "name": "EIFO Contract Guarantee", "institution": "EIFO", "status": "probe", "why": "Complement: up to 90% of loss if an order fails; comfort for the bank", "cite": ["c42"]},
        {"id": "eifo-ml", "name": "EIFO Match Loan", "institution": "EIFO", "status": "park", "why": "Very early stage; likely past it", "cite": ["unverified"]},
        {"id": "dk-rd", "name": "R&D grants or tax credit (Denmark)", "institution": "To research", "status": "probe", "why": "Opens only if R&D sits in the ApS", "cite": ["unverified"]}
      ]},
      {"id": "de-by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-uk", "name": "LfA Universalkredit with HaftungPlus", "institution": "LfA Förderbank Bayern", "via": "the savings bank", "status": "open", "why": "Core for GmbH costs: 60% of risk with LfA up to EUR 4M", "cite": ["w1"]},
        {"id": "bb-by", "name": "Guarantee bank guarantee", "institution": "Bürgschaftsbank Bayern", "via": "the savings bank", "status": "open", "why": "Alternative: up to 80%, max EUR 1M per borrower", "cite": ["c50", "c52"]},
        {"id": "gmbh-contracts", "name": "Book German contracts in the GmbH", "institution": "LfA Förderbank Bayern", "status": "park", "why": "Would open up to EUR 15M; tax and transfer-pricing first", "cite": ["w1", "judgement"]}
      ]},
      {"id": "de-fed", "level": "national", "label": "Germany federal", "country": "DE", "doors": [
        {"id": "kfw", "name": "KfW / ERP loan via the savings bank", "institution": "KfW", "via": "banks and savings banks", "status": "probe", "why": "Fallback; before the project starts", "cite": ["c73", "c66"]},
        {"id": "hermes", "name": "Hermes export cover", "institution": "Federal export credit guarantees", "status": "park", "why": "GmbH does not export", "cite": ["c75", "judgement"]},
        {"id": "fzul", "name": "Research allowance (Forschungszulage)", "institution": "BSFZ and tax office", "status": "park", "why": "Only if R&D sits in the GmbH; 25% of the base", "cite": ["c59", "c63"]}
      ]},
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eif-bank", "name": "EIF-backed guarantees on your banks' SME books", "institution": "EIF", "via": "your banks", "status": "probe", "why": "Ask each bank if it holds EIF cover", "cite": ["unverified"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Customer side", "doors": [
        {"id": "cust-fin", "name": "Leasing or buyer credit for customers", "institution": "Lessors, EIFO buyer financing", "status": "park", "why": "Pushes your cost onto the buyer; complement only", "cite": ["judgement"]}
      ]}
    ]
  }
}
```

Sources: [c25], [c26], [c32], [c33] [EIFO-Guarantee sheet 2026](https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf) (c3f998cb12f6). [c34], [c36], [c38] [EIFO Growth Loan sheet](https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf) (6dfac0993cfe). [c42] [EIFO Contract Guarantee sheet](https://eifo.dk/media/kxcobjxc/dk_2-2n-_-contract-guarantee-_produktark-2026.pdf) (40c7083eedf8). [c50], [c52] [VDB FAQ](https://www.vdb-info.de/de/ueber-uns/nutzliche-infos/faq/) (30ddc2628aa5). [c59], [c63] [BSFZ](https://www.bescheinigung-forschungszulage.de/neu-hier) (defad5b3ee45). [c66], [c73] [KfW ERP sheet](https://kfw.de/PDF/Download-Center/Förderprogramme-(Inlandsförderung)/PDF-Dokumente/6000004842_M_365.pdf) (31b2116df386). [c75] [Hermes procedure](https://www.exportkreditgarantien.de/de/loesungen/einstieg-in-die-absicherung/antragsverfahren.html) (f7675952b017). [w1] [LfA Universalkredit](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/universalkredit.html), retrieved 2026-11-24.

## Turn 9: the founder (pushback, script)

> Our investors say: just raise a bigger round and stop messing about with banks. Why not put more equity in?

## Turn 9: Wincent

Your investors are partly right. Equity is quick and certain, and a bank line takes months. But equity is the wrong money for this particular cost (judgement).

**The cash gap revolves; equity doesn't come back.** Each project's cash returns at go-live. Equity is priced for venture returns and you pay for it for good, so using it for cash that comes back within months is the dearest option you have (judgement).

**Roughly what a bigger round costs.** Assume a €40M pre-money:
- A €12M round gives up about 23% of the company. A €16M round gives up about 29%.
- Those extra 5 to 6 points pay for €4M of project cash.
- If the company is later worth €300M, those points are worth about €16M.

A €4M covered line costs the bank's rate plus EIFO's premium of 0.8% to 6.3% a year [c28]. That is a few hundred thousand euros a year, illustratively. Every figure here except the premium is my assumption, so please replace them with the lead's real numbers.

**Equity doesn't grow with the pipeline.** On a €40M pipeline the gap keeps growing. More equity means another raise every time it grows, while a covered line can be resized as the pipeline grows (judgement).

**It isn't either/or. The round is what unlocks the cheap debt.** EIFO requires positive equity [c26], and its Growth Loan backs venture cases with documented scaling potential [c36]. A sensible middle ground: keep a modest bridge in the round to carry project cash until the covered line is live, then let the line take over (judgement).

What pre-money is the lead discussing? With that I can give your investors a figure rather than an argument.

```mandate-board
{
  "title": "Forklift safety sensors: public help for the cash gap and the raise",
  "stage": "prioritise",
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 3700000, "label": "Cash tied in projects at midpoints (illustrative)"},
    "instruments": [
      {"id": "series-a", "name": "Series A (EUR 12M)", "type": "equity", "amount": 12000000, "terms": "Carries product, team, growth, and a short bridge for project cash; permanent dilution, priced for venture returns", "status": "in_progress", "cite": ["judgement"]},
      {"id": "extra-equity", "name": "Extra EUR 4M equity for project cash (investors' proposal)", "type": "equity", "amount": 4000000, "terms": "About 5-6 extra points at an assumed EUR 40M pre; dearest money for cash that returns at go-live", "status": "parked", "cite": ["judgement"]},
      {"id": "line", "name": "Larger project line at the ApS's bank", "type": "loan", "amount": 7000000, "terms": "Carries project cash; revolves and resizes with the pipeline", "status": "planned", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "EIFO-Guarantee on the new facility", "type": "guarantee_debt", "terms": "Adds no cash; makes the line cheap: premium 0.8-6.3% a year; needs positive equity, which the round provides", "status": "planned", "cite": ["c28", "c26"]}
    ]
  },
  "risks_flags": [
    {"id": "dilution", "kind": "flag", "severity": "high", "title": "Investors propose equity for the cash gap", "fix": "Show the dilution cost against the covered line at the lead's real pre-money; keep a short bridge only", "cite": ["judgement"]},
    {"id": "timing", "kind": "flag", "severity": "medium", "title": "Covered line slower than equity", "fix": "Start the bank talks now so the line is live near close", "cite": ["judgement"]}
  ]
}
```

Sources: [c26], [c28] [EIFO-Guarantee product sheet 2026](https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf) (c3f998cb12f6). [c36] [EIFO Growth Loan product sheet 2026](https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf) (6dfac0993cfe).

## Turn 10: the founder (pushback, script)

> Or couldn't we get the customers to lease the kit, so it's off our balance sheet altogether?

## Turn 10: Wincent

You can offer leasing, but I wouldn't make it the answer to the cash gap (judgement). There are three reasons.

1. **It may not shorten the gap.** A lessor normally pays you when the customer accepts the kit. If acceptance only happens at go-live, you still carry the 4 to 9 months yourself, just with a lessor in the deal (judgement). Check this before anything else.
2. **It makes your offer dearer.** The customer now needs credit approval and pays the lessor's margin. That slows the sale and puts your price under pressure. When the public side carries the risk on your own line, the customer pays nothing extra (judgement).
3. **It puts a lessor in the customer relationship.** At your stage that relationship is worth a lot. A lessor also decides which customers it will finance, which in practice filters your pipeline (judgement).

Where leasing does help is as an option for customers who want to treat the kit as an operating expense rather than buy it outright. It speeds those sales without being the core funding. For buyers outside Denmark, EIFO's buyer financing includes an operational leasing guarantee that covers the lessor's bank (from my database, uncited; terms to confirm).

**A cheaper lever sits in your own contracts:** milestone payments, such as part on delivery and part at acceptance, before final go-live. That shrinks the gap without any outside financier (judgement).

So the key question is when your customers actually take ownership and pay. Could a contract be split into delivery and go-live payments, and has a customer ever agreed to that?

```mandate-board
{
  "title": "Forklift safety sensors: public help for the cash gap and the raise",
  "stage": "prioritise",
  "routes": {
    "levels": [
      {"id": "cust", "level": "customer", "label": "Customer side", "doors": [
        {"id": "cust-fin", "name": "Leasing for customers (lessor pays you)", "institution": "Lessors", "status": "park", "why": "Complement for opex buyers; may still pay only at acceptance; dearer offer, slower sale", "cite": ["judgement"]},
        {"id": "eifo-olg", "name": "EIFO Operational Leasing Guarantee for foreign buyers", "institution": "EIFO", "status": "probe", "why": "Covers a lessor's bank on export leases; terms not read", "cite": ["unverified"]},
        {"id": "milestones", "name": "Milestone payments in your contracts", "institution": "Your customers", "status": "probe", "why": "Shrinks the gap with no financier; part on delivery, part at go-live", "cite": ["judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "lease-accept", "kind": "flag", "severity": "medium", "title": "Lessor may pay only at acceptance", "fix": "Check when acceptance happens versus go-live before offering leasing", "cite": ["judgement"]},
    {"id": "lease-price", "kind": "flag", "severity": "medium", "title": "Leasing makes the offer dearer for the customer", "fix": "Keep project cash on your own covered line; leasing as an option only", "cite": ["judgement"]}
  ]
}
```

## Turn 11: the founder (answer, if_asked)

> A project is 300 to 800k, takes four to nine months to go live. Pipeline is about 40 million.

## Turn 11: Wincent

Here is what those figures mean for the size of the line. I've assumed the cash you pay upfront roughly equals the project value; if it is lower, scale everything down.

| Pipeline converts over | Projects a year | Running at once (6.5 months avg) | Cash tied up at €550k avg |
|---|---|---|---|
| Today's pace | 12 to 13 | about 7 | about €3.7M |
| 3 years | about 24 | about 13 | about €7.2M |
| 2 years | about 36 | about 20 | about €10.7M |

All judgement, from your ranges. The extremes matter too. A run of €800k projects at nine months each ties up more than twice the average per project.

What this means:
- **Your €3M line is already short of today's pace.** That explains why it is stretched most of the time.
- **Converting the pipeline needs a line of roughly €7M to €11M.** The EIFO cover has no maximum facility size [c32], so it scales with you. The GmbH line is capped: LfA's 60% risk share applies only up to €4M [w1]. Denmark has to carry most of it.
- **Equity can't keep up.** At these sizes, funding the gap with equity would take most of the €12M round, and again at every step up in the pipeline (judgement).

Two numbers would turn this into the figure your bank needs:
1. **Upfront cost as a share of contract value.** For example, is a €550k project €550k of your cash, or less?
2. **Over how many years do you expect the €40M pipeline to convert?**

```mandate-board
{
  "title": "Forklift safety sensors: public help for the cash gap and the raise",
  "stage": "prioritise",
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 7200000, "amount_max": 10700000, "label": "Cash tied up if the EUR 40M pipeline converts in 2-3 years (illustrative)"},
    "instruments": [
      {"id": "old-line", "name": "Existing working-capital line", "type": "loan", "amount": 3000000, "terms": "Already short of today's ~EUR 3.7M; dear: high rate plus personal guarantees", "status": "secured", "cite": ["judgement"]},
      {"id": "line", "name": "Larger project line at the ApS's bank", "type": "loan", "amount": 7000000, "amount_max": 11000000, "terms": "Carries project cash; revolves at each go-live; resized as the pipeline converts", "status": "planned", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "EIFO-Guarantee on the new facility", "type": "guarantee_debt", "terms": "No maximum facility size; up to 80% of loss with EIFO", "status": "planned", "cite": ["c32", "c25"]},
      {"id": "lfa-line", "name": "GmbH line with LfA HaftungPlus", "type": "loan", "amount_max": 4000000, "terms": "GmbH's own costs; LfA's 60% share only up to EUR 4M", "status": "probe", "cite": ["w1"]}
    ]
  }
}
```

Sources: [c25], [c32] [EIFO-Guarantee product sheet 2026](https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf) (c3f998cb12f6). [w1] [LfA Universalkredit, Förderdatenbank](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/universalkredit.html), retrieved 2026-11-24.

## Turn 12: the founder (brief, script)

> We are running out of time on our side. Can you write up what we have as a brief now?

## Turn 12: Wincent

# Brief: public money for the cash gap and the Series A

**Forklift safety sensor company (Danish ApS, Munich GmbH) · 24 Nov 2026**

## 1. The read
You sell forklift safety sensors and pay for each project upfront: €300k to €800k per project, 4 to 9 months to go-live, and 10 to 15 projects a year. The Danish ApS signs most contracts, including German ones. The Munich GmbH has about 8 people in sales and installation. Today a €3M working-capital line at a high rate, backed by personal guarantees from the founders, carries the gap, and it is stretched most of the time. A €12M Series A is due to close in about four months.

The deciding fact: this is a revolving, self-liquidating cost that banks misprice, and public cover exists to fix exactly that (judgement).

## 2. The recommendation
- **Lead with the Danish bank.** Replace the €3M line with a larger project line, with EIFO covering up to 80% of the loss on the new facility [c25]. It has to be a new, larger facility, because EIFO covers only financing that expands what the bank already lends you [c33].
- **In the same talks,** negotiate the rate down and the founders' personal guarantees off (unverified whether EIFO's terms address personal guarantees).
- **In parallel, the GmbH's savings bank in Munich.** A line for the GmbH's own costs, with LfA taking 60% of the risk up to €4M [w1], filed before those costs start [w1].
- **Keep the Series A for product, team and growth.** Use only a short bridge from it for project cash until the line is live. The round is what unlocks the cheap debt: EIFO requires positive equity [c26].

This has the best chance because each money sits in the entity that carries the cost, goes through banks you already use, and uses standard products. None of it needs a political ask (judgement).

## 3. The options we weighed
- **Lead: EIFO cover on a larger ApS line.** No maximum facility size [c32]. Premium 0.8% to 6.3% a year [c28]. Term up to three years, extendable [c27].
- **Second: an LfA Universalkredit for the GmbH** [w1], or a guarantee from Bavaria's guarantee bank covering up to 80%, capped at €1M per borrower [c50] [c52].
- **Probe: EIFO equity in the Series A,** brought in by your lead. Its terms are unverified. A Danish robotics company, Robotto, is in EIFO's investment register (register record).
- **Probe: EIFO Contract Guarantee.** It covers up to 90% of the loss if an order fails [c42]. It gives the bank comfort but adds no cash.
- **Fallback: EIFO Growth Loan.** It lends 50% of the need alongside the bank [c34] at CIBOR plus 4% to 10% [c38]. **Or a KfW loan through the savings bank** [c73].
- **Parked: a bigger round for project cash.** At an assumed €40M pre-money, an extra €4M costs about 5 to 6 points of dilution for cash that comes back at every go-live (judgement).
- **Parked: customer leasing.** It makes the offer dearer and may still pay you only at acceptance. Milestone payments in your own contracts are the cheaper lever (judgement).
- **Parked: the EIFO Match Loan,** which looks too early-stage for you (unverified). **German export cover (Hermes),** because the GmbH does not export (judgement). **Booking German contracts in the GmbH,** which would open LfA's larger loan of up to €15M [w1] but has tax and transfer-pricing costs to weigh first.

## 4. The plan
- **This week.** The CFO confirms:
  - the peak cash tied up across projects;
  - the line's rate and which bank holds it;
  - the latest equity position of the ApS;
  - upfront cost as a share of contract value.
- **This month:**
  - Meet the ApS relationship manager about a larger, EIFO-covered line.
  - Meet the savings bank's corporate advisor about a GmbH line with LfA cover.
  - Split the €12M with the CFO.
  - Ask the lead to sound out EIFO on co-investing.
- **This quarter:**
  - Get the bank's credit decision and EIFO cover in principle.
  - Close the Series A at about month 4.
  - Switch the new line on with the fresh equity and seek release of the personal guarantees.
- **Later:**
  - Resize the line as the pipeline converts.
  - Revisit whether to book German contracts in the GmbH.
- **What must happen first:** the CFO's figures before the bank meeting, and the savings bank's filing before any new GmbH spending.
- **What not to do yet:**
  - Ask for cover on the existing €3M; it will not qualify [c33].
  - Size the round to fund project cash.
  - Start funded GmbH spending before the filing [w1].

## 5. Who
| Route | P1 (decides) | P2 (forwards) | How to reach |
|---|---|---|---|
| EIFO cover on the ApS line | Corporate relationship manager at your Danish bank (judgement) | The bank's credit officer; at EIFO, the account manager for your bank (unverified) | Your existing contact. The bank files with EIFO [c29] |
| EIFO, if the bank stalls | Head of EIFO's guarantees for SMEs and banks (unverified) | EIFO account manager (unverified) | EIFO's main line, introduced by the bank |
| GmbH line | Savings bank corporate advisor (judgement) | Head of LfA's promotional loans unit, then the LfA board member for promotional loans (Dr. Thomas Langer, by the org chart's layout, 18 Nov 2026) [c84] | The bank files with LfA [w1] |
| Political side, Bavaria | Escalation only: Bavarian Economy Ministry, Referat 54 (LfA, SME finance) [c10] | The ministry's director-general sits on LfA's board as deputy chair [c86]. The Finance Ministry supervises LfA [c85] | Only for a blocked file |
| EIFO equity | EIFO venture investment director (unverified) | Your Series A lead | Introduced by the lead |

## 6. What to expect (lead route)
1. **The CFO builds the file.** It must show positive equity [c26], fewer than 750 staff in the group [c30], and no listing on a main exchange [c33]. One to two weeks (judgement).
2. **You ask the bank for a larger project line with EIFO cover.** The facility must expand the bank's lending [c33] and be at least DKK 2M [c32].
3. **The bank decides on credit and requests the cover.** EIFO can cover up to 80% of the loss, capped at 50% of the bank's total loss on you [c25]. This takes weeks (unverified).
4. **EIFO approves and sets the premium by your rating** [c28].
5. **The line goes live alongside the close,** at about month 4 (judgement).

The odds are good if equity is positive after the round and the bank has done EIFO deals before (judgement).

## 7. Risks and flags
- **High: cover on the existing €3M will not qualify** [c33]. Fix: ask for a new, larger facility.
- **High: equity must be positive** [c26]. Fix: file with the round's equity in view.
- **High: the round could be spent on project cash.** Fix: split it with the CFO and keep only a short bridge (judgement).
- **Medium: founders' personal guarantees.** Fix: negotiate release as part of the covered facility, before the Series A due diligence (unverified).
- **Medium: LfA will not fund spending that has already started** [w1]. Fix: file first.
- **Medium: the covered line is slower than equity.** Fix: start the bank talks now (judgement).
- **Low: the guarantee bank is capped at €1M** [c52]. Fix: use LfA if the GmbH needs more.
- **Regina:** whether the sensors fall under the EU Machinery Regulation, which affects how backers read the risk (unverified; handed to Regina).

## 8. Watchlist
- ApS equity positive at filing [c26].
- EIFO product sheets renewed for 2027 (unverified).
- LfA terms are current: the sheet I found is from 2024 (unverified).
- Growth Loan: reopen if the line comes in short [c34].
- Whether your banks hold EIF-backed cover on their SME books (unverified).
- Booking German contracts in the GmbH: revisit after the round (judgement).
- Machinery Regulation status (Regina).

**Precedents:**
- EIFO cover on a working-capital line: none found in our records. Ask your bank for its own covered facilities.
- LfA: none found in this run.
- EIFO equity: Robotto (register record).

## 9. Open questions for the founder
1. **Peak cash tied up across projects.** This sets the size of the line.
2. **Upfront cost as a share of contract value, and how many years the €40M pipeline takes to convert.** Illustratively the line needs to be €7M to €11M (judgement).
3. **Which bank holds the €3M line, and at what rate.** This sets the savings case.
4. **Do the personal guarantees cover only the Danish line?** That decides which banks you ask for release.
5. **The lead's pre-money.** It turns the dilution argument into a number.
6. **Where the R&D sits.** It could open R&D grants or tax credits in Denmark or Germany.
7. **Could contracts include milestone payments** (part on delivery, part at go-live)?

## Annex: draft note to the Danish relationship manager (for you to send, if useful)
> Subject: Larger project facility with EIFO cover
>
> Dear [name],
>
> Our pipeline now stands at about €40M, and our current €3M facility no longer carries the projects we deliver. We would like to discuss a larger project facility, with an EIFO-Guarantee on the new commitment, ahead of our Series A close early next year. We would also like to review the current personal guarantees as part of it. Our CFO can share peak exposure and the round's terms at the meeting. Could we meet in the coming two weeks?
>
> Kind regards, [founder]

## 10. Sources
- [c1], [c84]: LfA board page, https://www.lfa.de/website/de/lfa/organe/vorstand/index.php, sha256 b562194b64dd
- [c10]: Bavarian Economy Ministry org chart, https://www.stmwi.bayern.de/fileadmin/user_upload/stmwi/Ministerium/Organisation/Organisationsplan-Bayerisches-Wirtschaftsministerium.pdf, sha256 d355a402bf0c
- [c25] to [c33]: EIFO-Guarantee product sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf, sha256 c3f998cb12f6
- [c34], [c36], [c38]: EIFO Growth Loan product sheet 2026, https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf, sha256 6dfac0993cfe
- [c41] to [c43]: EIFO Contract Guarantee product sheet 2026, https://eifo.dk/media/kxcobjxc/dk_2-2n-_-contract-guarantee-_produktark-2026.pdf, sha256 40c7083eedf8
- [c47], [c49], [c50], [c52]: VDB guarantee banks FAQ, https://www.vdb-info.de/de/ueber-uns/nutzliche-infos/faq/, sha256 30ddc2628aa5
- [c66], [c73]: KfW ERP-Förderkredit KMU sheet, https://kfw.de/PDF/Download-Center/Förderprogramme-(Inlandsförderung)/PDF-Dokumente/6000004842_M_365.pdf, sha256 31b2116df386
- [c75]: Hermes application procedure, https://www.exportkreditgarantien.de/de/loesungen/einstieg-in-die-absicherung/antragsverfahren.html, sha256 f7675952b017
- [c85], [c86]: LfA administrative board page, https://www.lfa.de/website/de/lfa/organe/verwaltungsrat/index.php, sha256 45853c039455
- [w1]: [LfA Universalkredit, Förderdatenbank](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/universalkredit.html), retrieved 2026-11-24: "LfA vereinbart mit Ihrer Bank eine Risikoverteilung in Höhe von 60 zu 40 Prozent"; "Richten Sie Ihren Antrag bitte vor Beginn Ihres Vorhabens an Ihre Hausbank"
- Register record: [EIFO investments in companies](https://eifo.dk/for-dig-som-er/fond-eller-investor/investering-i-virksomheder)
- Unverified: [EIFO Working Capital Guarantee sheet](https://www.eifo.dk/media/zkbhobmw/eifo_working-capital-guarantee-product-sheet.pdf) (returned 404 when fetched)

```mandate-board
{
  "title": "Forklift safety sensors: public help for the cash gap and the raise",
  "stage": "write_up",
  "answer": {
    "lines": [
      "Lead: a larger project line at the ApS's Danish bank, EIFO covering up to 80% of the loss on the new facility.",
      "In the same talks: a lower rate and the founders' personal guarantees reduced or released.",
      "In parallel: a GmbH line at the savings bank with LfA taking 60% of the risk, filed before the costs start.",
      "Keep the EUR 12M Series A for growth; a short bridge only for project cash."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by structure and channel; size waits on the CFO's peak figure and positive equity.",
    "open_question": "Peak cash tied up, upfront share of contract value, and the line's rate?",
    "cite": ["c25", "c33", "w1", "c26"]
  },
  "routes": {
    "levels": [
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on a larger project line", "institution": "EIFO", "via": "the ApS's Danish bank", "status": "open", "why": "Lead: up to 80% of loss on the new facility; carries project cash", "conditions": ["Positive equity", "Expands the bank's lending", "From DKK 2M"], "cite": ["c25", "c26", "c33", "c32"]},
        {"id": "eifo-gl", "name": "EIFO Growth Loan", "institution": "EIFO", "status": "park", "why": "Fallback: 50% of need next to the bank, CIBOR + 4-10%", "cite": ["c34", "c38"]},
        {"id": "eifo-eq", "name": "EIFO equity co-investment in the Series A", "institution": "EIFO", "via": "your lead", "status": "probe", "why": "Co-invests alongside private investors; terms to confirm", "cite": ["unverified"]},
        {"id": "eifo-cg", "name": "EIFO Contract Guarantee", "institution": "EIFO", "status": "probe", "why": "Complement: up to 90% of loss if an order fails", "cite": ["c42"]},
        {"id": "eifo-wc", "name": "EIFO Working Capital Guarantee", "institution": "EIFO", "status": "probe", "why": "Aimed at operating costs; sheet not readable", "cite": ["unverified"]},
        {"id": "eifo-ml", "name": "EIFO Match Loan", "institution": "EIFO", "status": "park", "why": "Very early stage; likely past it", "cite": ["unverified"]},
        {"id": "dk-rd", "name": "R&D grants or tax credit (Denmark)", "institution": "To research", "status": "probe", "why": "Only if R&D sits in the ApS", "cite": ["unverified"]}
      ]},
      {"id": "de-by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-uk", "name": "LfA Universalkredit with HaftungPlus", "institution": "LfA Förderbank Bayern", "via": "the savings bank, before spending starts", "status": "open", "why": "Second: GmbH costs; 60% of risk with LfA up to EUR 4M", "cite": ["w1"]},
        {"id": "bb-by", "name": "Guarantee bank guarantee", "institution": "Bürgschaftsbank Bayern", "via": "the savings bank", "status": "open", "why": "Alternative: up to 80%, max EUR 1M per borrower", "cite": ["c50", "c52"]},
        {"id": "gmbh-contracts", "name": "Book German contracts in the GmbH", "institution": "LfA Förderbank Bayern", "status": "park", "why": "Would open up to EUR 15M; tax and transfer pricing first", "cite": ["w1", "judgement"]}
      ]},
      {"id": "de-fed", "level": "national", "label": "Germany federal", "country": "DE", "doors": [
        {"id": "kfw", "name": "KfW / ERP loan via the savings bank", "institution": "KfW", "via": "banks and savings banks", "status": "probe", "why": "Fallback; applied before the project starts", "cite": ["c73", "c66"]},
        {"id": "hermes", "name": "Hermes export cover", "institution": "Federal export credit guarantees", "status": "park", "why": "GmbH does not export", "cite": ["c75", "judgement"]},
        {"id": "fzul", "name": "Research allowance (Forschungszulage)", "institution": "BSFZ and tax office", "status": "park", "why": "Only if R&D sits in the GmbH", "cite": ["c59", "c63"]}
      ]},
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eif-bank", "name": "EIF-backed guarantees on your banks' SME books", "institution": "EIF", "via": "your banks", "status": "probe", "why": "Ask each bank whether it holds EIF cover", "cite": ["unverified"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Customer side", "doors": [
        {"id": "cust-fin", "name": "Leasing for customers", "institution": "Lessors", "status": "park", "why": "Dearer offer; may still pay only at acceptance; option for opex buyers", "cite": ["judgement"]},
        {"id": "eifo-olg", "name": "EIFO Operational Leasing Guarantee", "institution": "EIFO", "status": "probe", "why": "Export leases only; terms not read", "cite": ["unverified"]},
        {"id": "milestones", "name": "Milestone payments in your contracts", "institution": "Your customers", "status": "probe", "why": "Shrinks the gap with no financier", "cite": ["judgement"]}
      ]},
      {"id": "equity-alt", "level": "lobby", "label": "Investors' proposal", "doors": [
        {"id": "extra-round", "name": "Bigger round to fund project cash", "institution": "Your investors", "status": "park", "why": "About 5-6 extra points of dilution for cash that returns at go-live", "cite": ["judgement"]}
      ]}
    ]
  },
  "hierarchies": [
    {
      "id": "field",
      "title": "Two fronts: the Danish parent and the Munich GmbH",
      "explains": "The ApS signs and carries project cost, so Danish cover leads; the GmbH's Bavarian site opens LfA through its savings bank.",
      "nodes": [
        {"id": "client", "label": "Your group", "kind": "institution", "cite": ["judgement"]},
        {"id": "dk", "label": "Denmark: ApS (signs contracts, carries upfront cost)", "kind": "channel", "parent": "client", "cite": ["judgement"]},
        {"id": "dk-bank", "label": "ApS's Danish bank", "kind": "channel", "parent": "dk", "status": "open", "note": "Files the EIFO cover request", "cite": ["c29"]},
        {"id": "eifo", "label": "EIFO, Danish Export and Investment Fund", "kind": "institution", "parent": "dk", "cite": ["c25"]},
        {"id": "eifo-g", "label": "EIFO-Guarantee to your bank", "kind": "instrument", "parent": "eifo", "status": "open", "note": "Up to 80% of loss on the new facility", "cite": ["c25", "c33"]},
        {"id": "eifo-gl", "label": "EIFO Growth Loan", "kind": "instrument", "parent": "eifo", "status": "park", "note": "Fallback", "cite": ["c34"]},
        {"id": "eifo-cg", "label": "EIFO Contract Guarantee", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "Complement", "cite": ["c42"]},
        {"id": "eifo-wc", "label": "EIFO Working Capital Guarantee", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "Terms to confirm", "cite": ["unverified"]},
        {"id": "de", "label": "Germany: GmbH Munich (8 staff)", "kind": "channel", "parent": "client", "cite": ["judgement"]},
        {"id": "stmwi54", "label": "Bavarian Economy Ministry, Referat 54: LfA, SME finance", "kind": "unit", "parent": "de", "cite": ["c10"]},
        {"id": "lfa", "label": "LfA Förderbank Bayern", "kind": "regional_body", "parent": "stmwi54", "cite": ["c1"]},
        {"id": "lfa-uk", "label": "Universalkredit with HaftungPlus", "kind": "instrument", "parent": "lfa", "status": "open", "note": "60% of risk up to EUR 4M; via the savings bank", "cite": ["w1"]}
      ],
      "cite": ["c1", "c10", "c25", "w1"]
    }
  ],
  "stakeholders": {
    "institutions": [
      {"id": "dk-bank", "name": "ApS's Danish bank", "side": "market", "country": "DK", "units": [{"id": "dk-corp", "name": "Corporate banking", "roles": [
        {"id": "dk-rm", "role": "Corporate relationship manager", "priority": "P1", "reach": "Your existing contact; the bank files with EIFO", "status": "to_approach", "cite": ["judgement"]},
        {"id": "dk-credit", "role": "Credit officer for the facility", "priority": "P2", "reach": "Through the relationship manager", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-guar", "name": "Guarantee team working with banks", "roles": [
        {"id": "eifo-head", "role": "Head of guarantees for SMEs and banks", "priority": "P1", "reach": "Only if the bank stalls; via the bank or EIFO's main line", "status": "to_approach", "cite": ["unverified"]},
        {"id": "eifo-am", "role": "EIFO account manager for your bank", "priority": "P2", "reach": "Your relationship manager knows them", "status": "to_approach", "cite": ["unverified"]}
      ]}, {"id": "eifo-vc", "name": "Venture investment team", "roles": [
        {"id": "eifo-inv", "role": "Investment director for industrial tech", "priority": "P1", "reach": "Introduced by your Series A lead", "status": "to_approach", "cite": ["unverified"]}
      ]}]},
      {"id": "sparkasse", "name": "GmbH's savings bank, Munich", "side": "market", "country": "DE", "units": [{"id": "sk-corp", "name": "Corporate clients", "roles": [
        {"id": "sk-adv", "role": "Corporate advisor", "priority": "P1", "reach": "The GmbH's existing contact; files with LfA or the guarantee bank", "status": "to_approach", "cite": ["w1", "c49"]}
      ]}]},
      {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-prom", "name": "Promotional loans", "roles": [
        {"id": "lfa-unit", "role": "Head of the promotional loans unit", "priority": "P1", "reach": "Only if the savings bank's file stalls", "status": "to_approach", "cite": ["judgement"]},
        {"id": "lfa-board", "role": "Board member for promotional loans (Dr. Thomas Langer, by the chart's layout, as of 18 Nov 2026)", "priority": "P2", "reach": "Escalation only", "status": "to_approach", "cite": ["c84"]}
      ]}]},
      {"id": "stmwi", "name": "Bavarian Economy Ministry", "side": "political", "country": "DE", "units": [{"id": "ref54", "name": "Referat 54: LfA, SME finance", "roles": [
        {"id": "ref54-head", "role": "Head of Referat 54", "priority": "P2", "reach": "Only for a blocked file", "status": "to_approach", "cite": ["c10"]}
      ]}]},
      {"id": "lead", "name": "Your Series A lead", "side": "market", "country": "DK", "units": [{"id": "lead-team", "name": "Deal team", "roles": [
        {"id": "lead-partner", "role": "Lead partner on the round", "priority": "P2", "reach": "Direct; asks EIFO to co-invest", "status": "engaged", "cite": ["judgement"]}
      ]}]}
    ]
  },
  "process": [
    {
      "id": "cover",
      "title": "How EIFO's cover fixes the line",
      "caption": "EIFO takes most of the loss, so the bank can lend more, cheaper, without founder guarantees.",
      "nodes": [
        {"id": "eifo", "label": "EIFO", "kind": "institution"},
        {"id": "bank", "label": "ApS's Danish bank", "kind": "bank"},
        {"id": "aps", "label": "Your ApS", "kind": "client"},
        {"id": "proj", "label": "Projects to go-live", "kind": "asset"},
        {"id": "cust", "label": "Customers", "kind": "customer"}
      ],
      "edges": [
        {"from": "eifo", "to": "bank", "label": "covers up to 80% of the loss", "kind": "risk"},
        {"from": "bank", "to": "aps", "label": "a larger project line", "kind": "money"},
        {"from": "aps", "to": "proj", "label": "pays hardware and install upfront", "kind": "money"},
        {"from": "cust", "to": "aps", "label": "pays at go-live; line revolves", "kind": "money"}
      ],
      "cite": ["c25", "c29"]
    }
  ],
  "process_maps": [
    {
      "id": "eifo-line",
      "title": "Getting a larger covered line at the ApS's bank",
      "explains": "The bank decides the facility and asks EIFO for the cover; you supply the numbers.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "aps", "name": "Your ApS (CFO)", "side": "market"},
        {"id": "bank", "name": "ApS's Danish bank", "side": "market"},
        {"id": "eifo", "name": "EIFO", "side": "public-capital"}
      ],
      "steps": [
        {"id": "pack", "label": "CFO builds the file: peak exposure, pipeline, accounts", "kind": "document", "actor": "aps", "timing": "1-2 weeks", "cite": ["judgement"], "gates": [{"label": "Positive equity, creditworthy", "cite": ["c26"]}, {"label": "Group under 750 staff", "cite": ["c30"]}, {"label": "Not listed on a main exchange", "cite": ["c33"]}]},
        {"id": "ask", "label": "Ask the bank for a larger project line with EIFO cover", "kind": "step", "actor": "aps", "cite": ["c29"], "gates": [{"label": "New financing expands the bank's commitment", "cite": ["c33"]}, {"label": "Facility at least DKK 2M", "cite": ["c32"]}]},
        {"id": "credit", "label": "Bank's credit decision, with cover requested", "kind": "decision", "actor": "bank", "timing": "weeks (unverified)", "cite": ["unverified"], "gates": [{"label": "Cover up to 80% of loss, max 50% of bank's total loss", "cite": ["c25"]}]},
        {"id": "eifo-ok", "label": "EIFO approves cover and sets the premium by rating", "kind": "decision", "actor": "eifo", "cite": ["c28"], "gates": [{"label": "Term up to three years, extendable", "cite": ["c27"]}]},
        {"id": "live", "label": "Facility live alongside the Series A close", "kind": "step", "actor": "bank", "timing": "month 4", "cite": ["judgement"]}
      ],
      "flow": [{"from": "pack", "to": "ask"}, {"from": "ask", "to": "credit"}, {"from": "credit", "to": "eifo-ok", "label": "cover request"}, {"from": "eifo-ok", "to": "live"}],
      "leverage": [
        {"id": "lv-rm", "at": "bank", "kind": "door_opener", "label": "Relationship manager who has done EIFO deals", "why": "Knows the product and files faster", "how": "Ask which EIFO-covered facilities they have done", "side": "market", "cite": ["judgement"]},
        {"id": "lv-round", "at": "credit", "kind": "timing_window", "label": "Series A close", "why": "Fresh equity strengthens the credit case and the equity gate", "how": "Show the term sheet in the credit file", "side": "market", "cite": ["c26", "judgement"]},
        {"id": "lv-prec", "at": "eifo-ok", "kind": "precedent", "label": "No recorded EIFO deal like this found", "why": "The bank's own covered facilities are the precedent", "how": "Ask the bank for comparable cases", "side": "public-capital", "cite": ["judgement"]},
        {"id": "lv-expand", "at": "ask", "kind": "blocker", "label": "Cover on the existing EUR 3M will not qualify", "why": "EIFO covers only new commitment", "how": "Frame it as a new, larger facility", "side": "public-capital", "cite": ["c33"]}
      ],
      "cite": ["c25", "c29", "c33"]
    },
    {
      "id": "lfa-line",
      "title": "GmbH line through the savings bank",
      "explains": "The savings bank files with LfA before the new costs start; LfA takes 60% of the risk.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "gmbh", "name": "Your GmbH", "side": "market"},
        {"id": "sk", "name": "Savings bank, Munich", "side": "market"},
        {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital"}
      ],
      "steps": [
        {"id": "g-ask", "label": "GmbH asks for a line for its own costs", "kind": "step", "actor": "gmbh", "cite": ["w1"], "gates": [{"label": "Site in Bavaria", "cite": ["w1"]}, {"label": "Turnover up to EUR 500M", "cite": ["w1"]}, {"label": "Costs not yet started", "cite": ["w1"]}]},
        {"id": "g-file", "label": "Savings bank files with LfA (or the guarantee bank)", "kind": "document", "actor": "sk", "cite": ["w1", "c49"], "gates": [{"label": "HaftungPlus up to EUR 4M", "cite": ["w1"]}, {"label": "Guarantee bank: max EUR 1M per borrower", "cite": ["c52"]}]},
        {"id": "g-ok", "label": "LfA agrees the 60/40 risk split", "kind": "decision", "actor": "lfa", "cite": ["w1"]}
      ],
      "flow": [{"from": "g-ask", "to": "g-file"}, {"from": "g-file", "to": "g-ok"}],
      "leverage": [
        {"id": "lv-start", "at": "g-ask", "kind": "blocker", "label": "Spending started before filing", "why": "LfA excludes projects already begun", "how": "File before new GmbH hires or stock", "side": "market", "cite": ["w1"]}
      ],
      "cite": ["w1"]
    }
  ],
  "networks": [
    {
      "id": "lfa-oversight",
      "title": "Who oversees LfA",
      "explains": "Finance supervises LfA; the economy ministry sits on its board. Escalation only.",
      "nodes": [
        {"id": "lfa", "label": "LfA Förderbank Bayern", "kind": "bank", "cite": ["c1"]},
        {"id": "stmfh", "label": "Bavarian Finance Ministry", "kind": "ministry", "cite": ["c85"]},
        {"id": "stmwi", "label": "Bavarian Economy Ministry", "kind": "ministry", "cite": ["c86"]},
        {"id": "vr", "label": "LfA administrative board", "kind": "committee", "cite": ["c86"]},
        {"id": "ref54", "label": "Economy Ministry Referat 54: LfA, SME finance", "kind": "body", "cite": ["c10"]}
      ],
      "edges": [
        {"from": "stmfh", "to": "lfa", "kind": "oversees", "label": "legal supervision", "cite": ["c85"]},
        {"from": "stmwi", "to": "vr", "kind": "sits_on", "label": "deputy chair", "cite": ["c86"]},
        {"from": "vr", "to": "lfa", "kind": "oversees", "cite": ["c86"]},
        {"from": "ref54", "to": "stmwi", "kind": "member_of", "cite": ["c10"]}
      ],
      "cite": ["c85", "c86", "c10"]
    }
  ],
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 7200000, "amount_max": 10700000, "label": "Cash tied up if the EUR 40M pipeline converts in 2-3 years (illustrative)"},
    "instruments": [
      {"id": "series-a", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Product, team, growth and a short bridge; permanent dilution, dearest money for project cash", "status": "in_progress", "cite": ["judgement"]},
      {"id": "extra-equity", "name": "Extra equity for project cash (investors' proposal)", "type": "equity", "amount": 4000000, "terms": "About 5-6 extra points at an assumed EUR 40M pre for cash that returns at go-live", "status": "parked", "cite": ["judgement"]},
      {"id": "old-line", "name": "Existing working-capital line", "type": "loan", "amount": 3000000, "terms": "Already short of today's ~EUR 3.7M; dear: high rate plus personal guarantees", "status": "secured", "cite": ["judgement"]},
      {"id": "line", "name": "Larger project line at the ApS's bank", "type": "loan", "amount": 7000000, "amount_max": 11000000, "terms": "Carries project cash; revolves at each go-live; resized as the pipeline converts", "status": "planned", "cite": ["judgement"]},
      {"id": "eifo-cover", "name": "EIFO-Guarantee on the new facility", "type": "guarantee_debt", "terms": "Adds no cash; makes the line cheap: up to 80% of loss, premium 0.8-6.3% a year, no maximum size", "status": "planned", "cite": ["c25", "c28", "c32"]},
      {"id": "lfa-line", "name": "GmbH line with LfA HaftungPlus", "type": "loan", "amount_max": 4000000, "terms": "GmbH payroll, installation, stock; 60% of risk with LfA up to EUR 4M", "status": "probe", "cite": ["w1"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "debt", "label": "Project line (lead)", "steps": [
        {"id": "cfo", "label": "CFO: peak exposure, rate, line holder, equity, upfront share", "start": 0, "end": 0.5, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "bank-ask", "label": "Meet the ApS relationship manager", "start": 0.5, "end": 1, "owner": "client", "status": "planned", "depends_on": ["cfo"], "cite": ["c29"]},
        {"id": "no-rewrap", "label": "Do not ask for cover on the existing EUR 3M", "start": 0, "end": 1, "owner": "client", "status": "blocked", "cite": ["c33"]},
        {"id": "credit", "label": "Bank credit decision and EIFO cover in principle", "start": 1, "end": 3, "owner": "institution", "status": "planned", "depends_on": ["bank-ask"], "cite": ["unverified"]},
        {"id": "line-live", "label": "Larger covered line live; personal guarantees released", "start": 4, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["credit", "close"], "cite": ["judgement"]}
      ]},
      {"id": "gmbh", "label": "GmbH line (parallel)", "steps": [
        {"id": "sk-meet", "label": "Savings bank: line for GmbH costs with LfA cover", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "cite": ["w1"]},
        {"id": "no-spend", "label": "Do not start new funded GmbH spending before filing", "start": 0, "end": 1.5, "owner": "client", "status": "blocked", "cite": ["w1"]}
      ]},
      {"id": "raise", "label": "Series A", "steps": [
        {"id": "split", "label": "Split the round with the CFO: short bridge only for project cash", "start": 0.5, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "eifo-lead", "label": "Lead sounds out EIFO co-investment", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "no-size", "label": "Do not size the round to fund project cash", "start": 0, "end": 4, "owner": "client", "status": "blocked", "cite": ["judgement"]},
        {"id": "close", "label": "Series A close", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "later", "label": "Later", "steps": [
        {"id": "resize", "label": "Resize the covered line as the pipeline converts", "start": 6, "end": 12, "owner": "client", "status": "planned", "cite": ["c32", "judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-equity", "label": "ApS equity positive at filing (EIFO gate)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["c26"]},
        {"id": "w-eifo-sheet", "label": "EIFO product sheets renewed for 2027", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-lfa", "label": "LfA terms current (2024 sheet)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-gl", "label": "Growth Loan: reopen if the line comes in short", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["c34"]},
        {"id": "w-eif", "label": "Do your banks hold EIF-backed SME cover?", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-gmbh", "label": "GmbH contracting option: revisit after the round", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]},
        {"id": "w-mr", "label": "Machinery Regulation status of the sensors (Regina)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "expand", "kind": "deal_breaker", "severity": "high", "title": "Cover on the existing EUR 3M will not qualify", "fix": "Ask for a new, larger facility; EIFO covers the expansion", "cite": ["c33"]},
    {"id": "equity", "kind": "deal_breaker", "severity": "high", "title": "EIFO requires positive equity", "fix": "File with the round's equity in view", "cite": ["c26"]},
    {"id": "dilution", "kind": "flag", "severity": "high", "title": "Round spent on project cash", "fix": "Split with the CFO; short bridge only; show investors the dilution against the covered line", "cite": ["judgement"]},
    {"id": "pg", "kind": "flag", "severity": "medium", "title": "Founders' personal guarantees", "fix": "Negotiate release in the covered-facility talks, before Series A diligence", "cite": ["unverified"]},
    {"id": "lfa-start", "kind": "flag", "severity": "medium", "title": "LfA: no project already started", "fix": "Savings bank files before new GmbH costs", "cite": ["w1"]},
    {"id": "timing", "kind": "flag", "severity": "medium", "title": "Covered line slower than equity", "fix": "Start bank talks now so the line is live near close", "cite": ["judgement"]},
    {"id": "lease-accept", "kind": "flag", "severity": "medium", "title": "Leasing may still pay only at acceptance", "fix": "Keep leasing as an option for opex buyers; try milestone payments", "cite": ["judgement"]},
    {"id": "bb-cap", "kind": "flag", "severity": "low", "title": "Guarantee bank capped at EUR 1M per borrower", "fix": "Use LfA HaftungPlus if the GmbH need is larger", "cite": ["c52", "w1"]},
    {"id": "regina-mr", "kind": "flag", "severity": "low", "title": "Machinery Regulation status of the sensors", "fix": "Regina to confirm", "cite": ["unverified"]}
  ]
}
```
