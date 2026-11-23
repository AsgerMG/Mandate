# Simulated conversation: forklift_spatial_dk_de

Case: `mandate/eval/scenarios/forklift_spatial_dk_de.yaml`. Brain: Wincent. Playbooks at c0fca6bee9. 2026-11-23T11:58:15+00:00. 12 turns (script 12/12; stopped: wrapped_up; client agent called 4x).
Leave-one-out case library: 3 entries left out (forklift_mispriced_market_velocity, forklift_regulatory_flag_to_regina, forklift_risk_not_to_customer).

## Turn 1: the founder (opener, script)

> We sell forklift safety sensors. We pay everything upfront, get paid at go-live, and it kills our cash. We're also raising. Can the state help?

## Turn 1: Wincent

Yes, probably, and on two fronts. They need different money, so I'll treat them separately.

**My read so far (judgement):** you pay for each project upfront and only get paid at go-live. That is a working-capital problem, and it usually means private lenders are pricing your projects badly. Public guarantees and co-lending exist to fix exactly that kind of gap. The raise is a separate door: some public lenders will match a private round, because your investors have already done the checking. What you told me settles two things. The money you need is working capital, not R&D. And the timing matters now, because you are raising.

Three questions decide which doors are open:

1. **Where is the company incorporated, and in which countries do you have staff?** Each entity with people opens that country's own routes, often through its own bank. So: which bank does each entity use?
2. **What does one project look like?** Roughly the cash you put out, the months until go-live and the number of projects a year. That sizes the credit line and tells me whether it is one ongoing line or financing per project.
3. **The round: how much, closing when, and who leads?** Public co-investment usually has to be filed before the round closes. If the lead investor is itself publicly backed, that is a channel too.

**Safe whatever you answer:** don't close the round before we have checked co-investment. The window may close with it.

**Not yet:** don't solve the cash gap by making customers prepay or lease. Your offer gets less competitive. The better outcome is a public body carrying the risk instead (judgement).

**For Regina:** safety sensors on forklifts may fall under machinery and product-safety rules. I'm passing that question to Regina and not assessing it here.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash gap and the round",
  "stage": "qualify",
  "process": [
    {
      "id": "cash-cycle",
      "title": "Where the cash goes today",
      "caption": "You fund each project from your own cash until go-live; the gap grows with every new project.",
      "nodes": [
        {"id": "supplier", "label": "Suppliers and install costs", "kind": "other"},
        {"id": "client", "label": "You", "kind": "client"},
        {"id": "customer", "label": "Customer (site operator)", "kind": "customer"},
        {"id": "lender", "label": "A lender or public guarantor (to find)", "kind": "institution"}
      ],
      "edges": [
        {"from": "client", "to": "supplier", "label": "pay upfront", "kind": "money"},
        {"from": "customer", "to": "client", "label": "pay at go-live", "kind": "money"},
        {"from": "lender", "to": "client", "label": "bridge the gap (to size)", "kind": "money"}
      ],
      "cite": ["judgement"]
    }
  ],
  "risks_flags": [
    {
      "id": "round-sequencing",
      "kind": "flag",
      "severity": "high",
      "title": "Public co-investment may have to be filed before the round closes",
      "fix": "Hold the close date until co-investment windows are checked in your markets.",
      "cite": ["judgement"]
    },
    {
      "id": "cost-to-customer",
      "kind": "flag",
      "severity": "medium",
      "title": "Shifting upfront cost to customers weakens the offer",
      "fix": "Seek de-risked working-capital financing for your own book first; customer-side levers only as a complement.",
      "cite": ["judgement"]
    },
    {
      "id": "regina-machinery",
      "kind": "flag",
      "severity": "medium",
      "title": "Regulatory status of forklift safety sensors: for Regina",
      "fix": "Regina to assess which product-safety rules apply; Wincent stays on the money.",
      "cite": ["judgement"]
    }
  ]
}
```

## Turn 2: the founder (answer, if_asked+client_agent)

> Danish ApS is the parent and signs most contracts, even German ones. We have a GmbH in Munich, about 8 people doing sales and installation.
> 
> Series A, 12 million. We have a lead in talks, closing in about four months.
> 
> A typical project is €300k to €800k, and we carry all of it until go-live, which takes 4 to 9 months. I'm guessing a bit, but it's maybe 10 to 15 projects a year right now. The pipeline is about €40M, so that number should go up fast.

## Turn 2: Wincent

Your answers settle two things. One: the Danish ApS signs the contracts, so it carries most of the project cost, and Danish money is the main door for that cost. Two: Germany stays in play. The Munich GmbH has people and a site, and that alone opens Bavarian money for the costs the GmbH carries.

**The size of the problem (my estimate, from your numbers):** take an average project of about €550k, tied up for about 6.5 months, at about 12 projects a year. That is roughly **€3.7M locked up at any time**. The realistic range is about €1M to €9M. If the €40M pipeline were delivered over two years (my assumption), that rises to about **€11M**. Without a credit line, much of the Series A would sit in projects. That is the most expensive money you could use for that cost (judgement).

**What I found:**
- **Denmark (for the ApS):** the state fund EIFO guarantees up to 80% of the loss on a bank line [c1], for up to three years [c3]. It must be new credit, on top of what the bank already lends you [c9]. Or EIFO can lend 50% of the need alongside your bank [c46]. That includes venture-backed companies that are not yet profitable [c48]. One catch: both require **positive equity** [c2][c47]. The round may be what satisfies that.
- **Bavaria (for the GmbH):** the state promotional bank's general loan pays for running costs. It runs through your bank, and the state takes 60% of the loss on loans up to €4M [w1]. You must apply **before** the costs start [w1].

**Two questions:**
1. Which bank does each entity use?
2. Does the ApS have positive equity in its last accounts? If it doesn't, the Danish line waits until the round closes.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash gap and the round",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field-dk",
      "title": "Denmark: who backs the ApS's credit",
      "explains": "EIFO backs or co-lends with the ApS's own bank; the bank is the door.",
      "nodes": [
        {"id": "dk-state", "label": "Danish state (owner ministry)", "kind": "ministry", "cite": ["unverified"]},
        {"id": "eifo", "label": "EIFO (Danish export and investment fund)", "kind": "institution", "parent": "dk-state", "cite": ["c5"]},
        {"id": "eifo-guar", "label": "EIFO Guarantee on the bank's line", "kind": "instrument", "parent": "eifo", "status": "open", "note": "Up to 80% of the loss on new credit, up to 3 years; positive equity needed.", "cite": ["c1", "c2", "c3", "c9"]},
        {"id": "eifo-growth", "label": "EIFO Growth Loan (50% alongside the bank)", "kind": "instrument", "parent": "eifo", "status": "open", "note": "Venture cases not yet profitable may qualify; CIBOR + 4-10%.", "cite": ["c46", "c48", "c50"]},
        {"id": "eifo-export-wc", "label": "EIFO export working-capital guarantee", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "Order-linked; terms to confirm on EIFO's current sheet.", "cite": ["unverified"]},
        {"id": "dk-bank", "label": "The ApS's house bank", "kind": "channel", "parent": "eifo", "status": "probe", "note": "Which bank? It files with EIFO.", "cite": ["c5"]}
      ],
      "cite": ["c1", "c46"]
    },
    {
      "id": "field-by",
      "title": "Bavaria: who backs the GmbH's credit",
      "explains": "Bavarian and federal promotional money reaches the GmbH only through its own bank, before costs start.",
      "nodes": [
        {"id": "by-state", "label": "Free State of Bavaria", "kind": "ministry", "cite": ["w1"]},
        {"id": "lfa", "label": "LfA Förderbank Bayern", "kind": "institution", "parent": "by-state", "cite": ["w1"]},
        {"id": "lfa-universal", "label": "LfA Universalkredit (working capital allowed)", "kind": "programme", "parent": "lfa", "status": "open", "note": "Site in Bavaria; up to EUR 15M; 60% risk release up to EUR 4M; apply before start.", "cite": ["w1"]},
        {"id": "bb", "label": "Bürgschaftsbank (Bavaria)", "kind": "institution", "parent": "by-state", "status": "probe", "note": "Up to 80% of a loan's risk, max EUR 1M per borrower, via the bank.", "cite": ["c14", "c16", "c13"]},
        {"id": "de-bank", "label": "The GmbH's house bank", "kind": "channel", "parent": "lfa", "status": "probe", "note": "Which bank? It files with LfA.", "cite": ["w1"]}
      ],
      "cite": ["w1", "c13"]
    }
  ],
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 3700000, "label": "Cash tied up in projects at any time today (estimate; range 1-9M, ~11M if pipeline lands in 2 years)"},
    "instruments": [
      {"id": "series-a", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Should fund growth; dearest money for project working capital (dilution)", "status": "in_progress", "cite": ["judgement"]}
    ]
  },
  "risks_flags": [
    {
      "id": "positive-equity",
      "kind": "flag",
      "severity": "high",
      "title": "EIFO guarantee and growth loan need positive equity",
      "fix": "Check the ApS's last accounts; if negative, time the bank line just after the round closes.",
      "cite": ["c2", "c47"]
    },
    {
      "id": "before-start",
      "kind": "flag",
      "severity": "medium",
      "title": "Bavarian loans must be applied for before the costs start",
      "fix": "File through the GmbH's bank before the next German project begins.",
      "cite": ["w1", "c30"]
    },
    {
      "id": "new-credit",
      "kind": "flag",
      "severity": "medium",
      "title": "EIFO cover only on new credit, not existing lines",
      "fix": "Frame the ask as a new project line on top of today's facilities.",
      "cite": ["c9"]
    }
  ]
}
```

**Sources**
- [c1] [c2] [c3] [c5] [c9]: EIFO Guarantee product sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (sha256 c3f998cb12f6)
- [c46] [c47] [c48] [c50]: EIFO Growth Loan product sheet 2026, https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf (sha256 6dfac0993cfe)
- [c13] [c14] [c16]: Association of German guarantee banks, FAQ, https://www.vdb-info.de/de/ueber-uns/nutzliche-infos/faq/ (sha256 30ddc2628aa5)
- [c30]: KfW ERP SME loan sheet, https://kfw.de/PDF/Download-Center/Förderprogramme-(Inlandsförderung)/PDF-Dokumente/6000004842_M_365.pdf (sha256 31b2116df386)
- [w1]: [Förderdatenbank, LfA Universalkredit](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/universalkredit.html), retrieved 2026-11-23: "mit einem Jahresumsatz bis zu EUR 500 Millionen und mit Betriebsstätte in Bayern"; "Betriebsmittel sowie Umschuldungen sind mit Darlehenslaufzeiten von bis zu 10 Jahren finanzierbar"; "mit einer 60-prozentigen Haftungsfreistellung „HaftungPlus“"; "Richten Sie Ihren Antrag bitte vor Beginn Ihres Vorhabens an Ihre Hausbank"
- Searched but not fetched: EIFO's export working-capital guarantee sheet ([link](https://www.eifo.dk/media/zkbhobmw/eifo_working-capital-guarantee-product-sheet.pdf), returned not found). Its terms are unverified.

## Turn 3: the founder (options, script)

> OK, that is the picture. What are our options, broadly?

## Turn 3: Wincent

There are five doors, plus one structural choice. All of them are on the board. Briefly:

1. **A Danish bank line, backed by the state fund EIFO** (the ApS). The state takes up to 80% of the loss on new credit [c1][c9]. This fits the main cost, the project pre-financing, and it is the cheapest money for it. You pay a premium of 0.8% to 6.3% a year [c4] on top of the bank's rate, but you give up no shares (judgement).
2. **An EIFO growth loan next to the bank.** EIFO lends half the need itself [c46]. It costs more, at the Danish interbank rate plus 4% to 10% [c50]. EIFO's growth-loan sheet says a guarantee cannot be added on that 1:1 co-financing [c46]. In practice that means one or the other for the same slice of the need (judgement).
3. **An EU-backed bank in Denmark.** At least one Danish bank lends for working capital [w2] and has its lending backed by an EU guarantee [w2]. The question is whether *your* bank has such cover.
4. **A Bavarian bank line for the GmbH.** The state takes 60% of the loss on loans up to €4M [w1]. It only covers costs the GmbH itself carries.
5. **EIFO alongside your Series A**, as a co-investor. That's a probe, and it has to happen before the round closes.

**Parked:**
- EU venture debt: the tickets are typically €10M to €50M and are tied to R&D plans [w3].
- German export cover: it is for German exporters [c39].
- Shifting the cost to customers (judgement).

**The structural choice:** booking German projects in the GmbH would open much more Bavarian money. It also brings tax and transfer-pricing effects, so treat it as an option to weigh, not a reflex (judgement).

**Which way do you lean:** one Danish line for the whole group, or a Danish and a German line side by side? And I still need the name of each entity's bank. It decides doors 3 and 4.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash gap and the round",
  "stage": "options",
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "investeu-bank", "name": "InvestEU-backed SME lending at a Danish bank", "institution": "EIF via Danish banks", "via": "your bank, if it holds the cover", "status": "probe", "why": "At least one Danish bank lends working capital and its lending is supported by InvestEU; is yours covered?", "cite": ["w2"]},
        {"id": "eib-vd", "name": "EIB venture debt", "institution": "European Investment Bank", "status": "park", "why": "Typically EUR 10-50M, needs R&D investment plans; not a working-capital tool at your size today.", "cite": ["w3"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-guar", "name": "EIFO Guarantee on a new bank line", "institution": "EIFO", "via": "the ApS's bank", "status": "open", "why": "Up to 80% of loss on new credit, up to 3 years; fits project pre-financing.", "conditions": ["Positive equity, creditworthy", "Must expand the bank's commitment", "From DKK 2M"], "cite": ["c1", "c2", "c3", "c8", "c9"]},
        {"id": "eifo-growth", "name": "EIFO Growth Loan", "institution": "EIFO", "via": "alongside the ApS's bank", "status": "open", "why": "EIFO lends 50% next to the bank; open to venture cases not yet profitable.", "conditions": ["Positive equity", "No guarantee on the 1:1 co-financing"], "cite": ["c46", "c47", "c48", "c50"]},
        {"id": "eifo-export-wc", "name": "EIFO export working-capital guarantee", "institution": "EIFO", "via": "the ApS's bank", "status": "probe", "why": "Order-linked cover for export orders (German contracts); current terms to confirm.", "cite": ["unverified"]},
        {"id": "eifo-equity", "name": "EIFO co-investment in the Series A", "institution": "EIFO", "status": "probe", "why": "EIFO holds stakes in many Danish startups (register record); must be raised before close.", "cite": ["unverified"]},
        {"id": "eifo-match", "name": "EIFO Match Loan", "institution": "EIFO", "status": "park", "why": "Aimed at early-stage startups with small revenue; you are likely past it.", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany, federal (GmbH)", "country": "DE", "doors": [
        {"id": "kfw-erp", "name": "KfW ERP SME loan via the GmbH's bank", "institution": "KfW", "via": "the GmbH's bank, before the project starts", "status": "probe", "why": "SME under EU definition (group counts); fit for working capital to confirm.", "cite": ["c28", "c30", "c37"]},
        {"id": "hermes", "name": "German export credit cover", "institution": "Federal export credit agency", "status": "shut", "why": "Covers German exporters' export contracts; the GmbH sells in Germany.", "cite": ["c39", "c45"]}
      ]},
      {"id": "by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-universal", "name": "LfA Universalkredit with 60% risk release", "institution": "LfA Förderbank Bayern", "via": "the GmbH's bank", "status": "open", "why": "Site in Bavaria; working capital allowed; up to EUR 4M with 60% release.", "conditions": ["Apply before the costs start", "Group turnover up to EUR 500M"], "cite": ["w1"]},
        {"id": "bb-bavaria", "name": "Bürgschaftsbank guarantee", "institution": "Bürgschaftsbank Bayern", "via": "the GmbH's bank", "status": "probe", "why": "Up to 80% of a loan's risk, EUR 1M cap per borrower; a top-up for the GmbH.", "cite": ["c14", "c16"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Customer side", "doors": [
        {"id": "buyer-fin", "name": "EIFO buyer financing for German customers", "institution": "EIFO", "status": "park", "why": "Moves the cost to the customer; a complement only, never the fix.", "cite": ["judgement"]}
      ]}
    ]
  },
  "hierarchies": [
    {
      "id": "field-eu",
      "title": "EU: how EU guarantees reach you",
      "explains": "The EU layer backs your bank, not you directly.",
      "nodes": [
        {"id": "eib-group", "label": "EIB Group", "kind": "institution", "cite": ["w3"]},
        {"id": "eif", "label": "European Investment Fund (InvestEU guarantees)", "kind": "institution", "parent": "eib-group", "cite": ["w2"]},
        {"id": "dk-banks", "label": "Danish banks with InvestEU cover", "kind": "channel", "parent": "eif", "status": "probe", "cite": ["w2"]},
        {"id": "eib-vd-node", "label": "EIB venture debt", "kind": "instrument", "parent": "eib-group", "status": "park", "cite": ["w3"]}
      ],
      "cite": ["w2", "w3"]
    }
  ],
  "stakeholders": {
    "institutions": [
      {"id": "dk-bank-inst", "name": "The ApS's bank", "side": "market", "country": "DK", "units": [{"id": "dk-bank-corp", "name": "Corporate banking", "roles": [{"id": "dk-rm", "role": "Relationship manager (files the EIFO cover)", "priority": "P1", "reach": "Your CFO, existing relationship", "status": "to_approach", "cite": ["c5"]}]}]},
      {"id": "eifo-inst", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-lending", "name": "Bank guarantees and growth loans", "roles": [{"id": "eifo-head", "role": "Head of the guarantee and growth-loan area", "priority": "P1", "reach": "Via the bank's filing, or EIFO's company contact page", "status": "to_approach", "cite": ["judgement"]}, {"id": "eifo-am", "role": "Account manager for scale-ups", "priority": "P2", "reach": "EIFO's company contact page", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "lfa-inst", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-credit", "name": "Promotional loans", "roles": [{"id": "lfa-head", "role": "Head of promotional lending", "priority": "P1", "reach": "Through the GmbH's bank", "status": "to_approach", "cite": ["judgement"]}, {"id": "de-rm", "role": "GmbH's bank, promotional-loan desk", "priority": "P2", "reach": "GmbH managing director", "status": "to_approach", "cite": ["w1"]}]}]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 3700000, "label": "Cash tied up in projects at any time today (estimate; ~11M if pipeline lands in 2 years)"},
    "instruments": [
      {"id": "series-a", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Growth, hiring, product; dearest money for project working capital (dilution)", "status": "in_progress", "cite": ["judgement"]},
      {"id": "dk-line", "name": "ApS bank line with EIFO Guarantee", "type": "guarantee_debt", "terms": "Carries project pre-financing; cheap because EIFO takes up to 80% of loss; premium 0.8-6.3% p.a.", "status": "probe", "cite": ["c1", "c4"]},
      {"id": "dk-growth", "name": "EIFO Growth Loan", "type": "loan", "terms": "Alternative for the same cost; dearer (CIBOR + 4-10%) but EIFO lends half itself", "status": "probe", "cite": ["c46", "c50"]},
      {"id": "by-line", "name": "GmbH line, LfA Universalkredit", "type": "guarantee_debt", "amount": 4000000, "terms": "Carries the GmbH's own costs (payroll, installation); LfA takes 60% of loss", "status": "probe", "cite": ["w1"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "now", "label": "This month", "steps": [
        {"id": "banks", "label": "Name each entity's bank; ask if it holds InvestEU or EIFO cover", "start": 0, "end": 0.5, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "equity-check", "label": "Check ApS equity in last accounts", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["c2"]},
        {"id": "no-prepay", "label": "Do not push prepayment or leasing onto customers yet", "start": 0, "end": 1, "owner": "client", "status": "blocked", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-close", "label": "Series A close: EIFO co-investment must be raised before", "start": 4, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]},
        {"id": "w-eifo-terms", "label": "EIFO product sheets (2026 edition) renewed", "start": 13, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-investeu", "label": "InvestEU folding into the next EU programme: does bank cover continue?", "start": 13, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "combine", "kind": "flag", "severity": "medium", "title": "Growth Loan and guarantee do not stack on one slice", "fix": "Choose per slice: guarantee on the bank line, or growth loan alongside it.", "cite": ["c46"]},
    {"id": "sme-group", "kind": "flag", "severity": "medium", "title": "SME test counts the whole group (and possibly investors)", "fix": "Confirm SME status after the round before the KfW route.", "cite": ["c28", "unverified"]},
    {"id": "entity-choice", "kind": "flag", "severity": "low", "title": "Contracts in the ApS limit what Bavaria can carry", "fix": "Weigh booking German projects in the GmbH, with tax advice; not to chase a loan.", "cite": ["judgement"]}
  ]
}
```

**New sources this turn**
- [c4]: EIFO Guarantee sheet 2026 (as above), premium range.
- [c28] [c37]: KfW ERP SME loan sheet (as above).
- [c39] [c45]: German export credit guarantees, application procedure, https://www.exportkreditgarantien.de/de/loesungen/einstieg-in-die-absicherung/antragsverfahren.html (sha256 f7675952b017)
- [w2]: [EIF press release, kompasbank](https://www.eif.org/press/all/kompasbank-to-provide-over-eur-175-million-in-new-cheaper-loans-to-danish-smes-through-european-guarantee), 3 Jul 2024, retrieved 2026-11-23: "provides loans for fixed- and current assets, working capital, property and minor acquisition financing"; "The agreements are supported by the InvestEU programme"
- [w3]: [EIB venture debt](https://www.eib.org/products/equity/venture-debt/index), retrieved 2026-11-23: "We typically offer financing between €10 million and €50 million."; the investee "must have investment plans for research and development"
- Searched, not fetched, so unverified: [Danske Bank EIF guarantee](https://www.eif.org/press/all/eif-guarantee-unlocks-eur178-million-in-new-lending-for-nordic-smes-through-danske-bank); [Nordea EIF guarantee](https://www.nordea.com/en/news/nordea-expands-eif-guarantee-to-denmark-offering-eu560-million-boost-for-nordic-smes); [EIF in Denmark](https://engage.eif.org/eif-in-my-country/eif-in-denmark).

## Turn 4: the founder (pushback, script)

> Our investors say: just raise a bigger round and stop messing about with banks. Why not put more equity in?

## Turn 4: Wincent

Your investors are partly right, but on the wrong cost.

**Where they are right:** the round comes first. EIFO's bank guarantee and growth loan both require positive equity [c2][c47]. Banks lend more comfortably next to fresh venture money (judgement). So the Series A is a **precondition** for the line, not an alternative to it.

**Where it costs you:** the project gap is a cash cycle, not a one-off cost. A euro lent against a project comes back at go-live and funds the next project. At about 6.5 months per project, each euro turns roughly twice a year (judgement). Equity spent on that cycle never comes back cheaper, and it has to grow with every new project.

**Illustration (my assumptions; give me your real pre-money):**
- **The extra equity:** at a €40M pre-money, raising €16M instead of €12M means about 29% dilution instead of 23%. That's roughly six extra points of the company, kept for good.
- **The guaranteed line:** €4M from a bank, with EIFO covering up to 80% of the loss [c1]. If the bank's rate plus the 0.8% to 6.3% premium [c4] came to around 6% to 10% all in (judgement), that is roughly €240k to €400k a year. You stop paying when the projects stop needing it.
- **The trade:** six points of a company that becomes worth a few hundred million is worth far more than those interest costs (judgement).

**My priority:**
1. A Danish bank line with EIFO cover, for the ApS's projects.
2. In parallel, a smaller Bavarian line for the GmbH's own costs.
3. A probe on EIFO joining the round.

Everything else stays parked.

**Decision for you:** keep the round at €12M for growth, and run the line in parallel? If yes, I'll need the ApS's bank name to plan the first approach.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash gap and the round",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Keep the Series A for growth; it is also what makes you eligible for the debt.",
      "Lead: a Danish bank line for project pre-financing, with EIFO covering up to 80% of loss.",
      "In parallel: a Bavarian line through the GmbH's bank for the GmbH's own costs (60% state risk).",
      "Probe EIFO as co-investor before the round closes; park the rest."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type on cited rules; depends on positive equity and the bank's appetite.",
    "open_question": "Which bank does the ApS use, and what is the round's pre-money?",
    "cite": ["c1", "c2", "c4", "w1", "judgement"]
  },
  "process": [
    {
      "id": "equity-vs-line",
      "title": "Why a line beats equity for the project gap",
      "caption": "A line revolves: each euro funds a project, returns at go-live, funds the next. Equity is spent once and diluted forever.",
      "nodes": [
        {"id": "line", "label": "Guaranteed bank line", "kind": "bank"},
        {"id": "eifo-n", "label": "EIFO (up to 80% of loss)", "kind": "institution"},
        {"id": "client", "label": "You (ApS)", "kind": "client"},
        {"id": "project", "label": "Project (4-9 months)", "kind": "asset"},
        {"id": "customer", "label": "Customer pays at go-live", "kind": "customer"}
      ],
      "edges": [
        {"from": "eifo-n", "to": "line", "label": "covers most of the loss", "kind": "risk"},
        {"from": "line", "to": "client", "label": "draw per project", "kind": "money"},
        {"from": "client", "to": "project", "label": "pre-finance", "kind": "money"},
        {"from": "customer", "to": "client", "label": "payment", "kind": "money"},
        {"from": "client", "to": "line", "label": "repay, redraw for next", "kind": "money"}
      ],
      "cite": ["c1", "judgement"]
    }
  ],
  "routes": {
    "levels": [
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-guar", "name": "EIFO Guarantee on a new bank line", "institution": "EIFO", "via": "the ApS's bank", "status": "open", "why": "Lead: cheapest money for project pre-financing; up to 80% of loss.", "cite": ["c1", "c9"]},
        {"id": "eifo-growth", "name": "EIFO Growth Loan", "institution": "EIFO", "via": "alongside the ApS's bank", "status": "open", "why": "Fallback if the bank will not lend enough even with cover.", "cite": ["c46", "c48"]},
        {"id": "eifo-equity", "name": "EIFO co-investment in the Series A", "institution": "EIFO", "status": "probe", "why": "Priority 3; must be raised before close.", "cite": ["unverified"]}
      ]},
      {"id": "by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-universal", "name": "LfA Universalkredit with 60% risk release", "institution": "LfA Förderbank Bayern", "via": "the GmbH's bank", "status": "open", "why": "Priority 2, in parallel; GmbH's own costs.", "cite": ["w1"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 3700000, "label": "Cash tied up in projects at any time today (estimate; ~11M if pipeline lands in 2 years)"},
    "instruments": [
      {"id": "series-a", "name": "Series A (keep at 12M)", "type": "equity", "amount": 12000000, "terms": "Growth, hiring, product, and the positive equity the debt needs; dearest money for project cash", "status": "in_progress", "cite": ["c2", "judgement"]},
      {"id": "extra-equity", "name": "Bigger round (+4M) instead of a line", "type": "equity", "amount": 4000000, "terms": "About 6 extra points of dilution at an assumed 40M pre-money; permanent", "status": "parked", "cite": ["judgement"]},
      {"id": "dk-line", "name": "ApS bank line with EIFO Guarantee", "type": "guarantee_debt", "amount": 4000000, "terms": "Carries project pre-financing; revolves; est. 240-400k a year all-in (assumed 6-10%)", "status": "planned", "cite": ["c1", "c4", "judgement"]},
      {"id": "by-line", "name": "GmbH line, LfA Universalkredit", "type": "guarantee_debt", "amount": 1000000, "amount_max": 4000000, "terms": "Carries the GmbH's own costs; LfA takes 60% of loss", "status": "planned", "cite": ["w1"]}
    ]
  },
  "risks_flags": [
    {"id": "bank-residual", "kind": "flag", "severity": "medium", "title": "The bank still carries part of the risk and will want security", "fix": "Offer project receivables and contracts as security; EIFO cover can be limited to 50% of the bank's total loss on you.", "cite": ["c1", "judgement"]},
    {"id": "investor-alignment", "kind": "flag", "severity": "medium", "title": "Investors may resist debt alongside the round", "fix": "Show the dilution saved and that the debt is project-linked and self-liquidating.", "cite": ["judgement"]}
  ]
}
```

## Turn 5: the founder (pushback, script)

> Or couldn't we get the customers to lease the kit, so it's off our balance sheet altogether?

## Turn 5: Wincent

I wouldn't use leasing as the fix. Keep it as an option your customers can choose.

**It doesn't close your gap (judgement).** Your cash is tied up before go-live. A lessor normally buys the kit when the customer accepts the delivery, which is the same moment you get paid today. So the 4 to 9 months you pre-finance stay with you, whoever owns the kit afterwards. Ask one or two lessors when exactly they would pay you. If any would pay against milestones before go-live, that changes my view.

**It makes your offer dearer (judgement).** A lease adds the lessor's margin to the customer's monthly cost. It also adds a credit check on every buyer. That slows sales just when the pipeline is growing.

**A public body should carry the risk, not your customer.** The gap exists because lenders struggle to price project risk for a young company. Public guarantees exist to fix exactly that kind of mispricing. EIFO taking up to 80% of the loss on your line [c1] puts the risk where it belongs, and your price stays unchanged.

**Where leasing does help:** as a *choice* for customers who prefer paying monthly. Offered that way, it can speed up some sales. EIFO also lists a leasing guarantee among its buyer-financing products (unverified; its own terms are not in the sheet we hold).

So I'd keep the order: the round, then the guaranteed line, with leasing as a sales option.

To move this forward, I need two things: the name of the ApS's bank, and whether your accounts show positive equity today.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash gap and the round",
  "stage": "prioritise",
  "routes": {
    "levels": [
      {"id": "cust", "level": "customer", "label": "Customer side", "doors": [
        {"id": "buyer-fin", "name": "EIFO buyer financing for German customers", "institution": "EIFO", "status": "park", "why": "Moves the cost to the customer; a complement only, never the fix.", "cite": ["judgement"]},
        {"id": "customer-lease", "name": "Third-party leasing offered to customers", "institution": "Private lessors", "status": "park", "why": "Lessor usually pays at acceptance, so your pre-go-live gap stays; raises the customer's cost. Offer as an option, not the fix.", "conditions": ["Ask lessors whether they pay at delivery or at milestones"], "cite": ["judgement"]},
        {"id": "eifo-lease-guar", "name": "EIFO operational leasing guarantee", "institution": "EIFO", "status": "park", "why": "Listed among EIFO's buyer-financing products; terms not in the sheet held.", "cite": ["unverified"]}
      ]}
    ]
  },
  "process": [
    {
      "id": "lease-timing",
      "title": "Why leasing leaves the gap where it is",
      "caption": "The lessor pays when the customer accepts the kit, which is when you are paid today.",
      "nodes": [
        {"id": "client", "label": "You", "kind": "client"},
        {"id": "project", "label": "Build and install (4-9 months)", "kind": "asset"},
        {"id": "lessor", "label": "Lessor", "kind": "fund"},
        {"id": "customer", "label": "Customer", "kind": "customer"}
      ],
      "edges": [
        {"from": "client", "to": "project", "label": "you still pre-finance", "kind": "money"},
        {"from": "lessor", "to": "client", "label": "pays at acceptance (go-live)", "kind": "money"},
        {"from": "customer", "to": "lessor", "label": "monthly rent incl. lessor margin", "kind": "money"}
      ],
      "cite": ["judgement"]
    }
  ],
  "risks_flags": [
    {"id": "cost-to-customer", "kind": "flag", "severity": "medium", "title": "Shifting upfront cost to customers weakens the offer", "fix": "Keep leasing as a customer choice; fund your own book with the guaranteed line.", "cite": ["judgement"]}
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "now", "label": "This month", "steps": [
        {"id": "lessor-check", "label": "Ask 1-2 lessors when they pay the vendor (delivery, milestones or acceptance)", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  }
}
```

## Turn 6: the founder (fact_change, script)

> Update: our lead is probably a German fund now, and they want contracting moved into the GmbH. Does that change things?

## Turn 6: Wincent

Yes. It moves the centre of gravity to Germany for German projects, and it raises one sequencing trap.

**What it opens:** if the GmbH signs and pre-finances the German projects, those costs sit in a company with a site in Bavaria. Two doors open through the GmbH's bank:
- **The Bavarian general loan**, which can carry running costs. The state takes 60% of the loss on up to €4M [w1].
- **A federal SME loan** from the German promotional bank. It is open if the group still counts as an SME after the round [c28][c37].

A guarantee bank can add cover on top, but only up to €1M per borrower [c16]. The Danish line shrinks to the Danish projects. I have not confirmed whether EIFO would back a line to the GmbH (unverified).

**The trap:** both German loans must be applied for **before** the costs start [w1][c30]. If the GmbH signs its first project before the bank has filed, that project falls outside the loan.

**One thing not to do yet:** don't let the GmbH sign a German contract until the loan application has been filed.

**Flag:** the move also has tax and transfer-pricing consequences. That is for your tax adviser, not me.

**Two questions:**
1. Does the fund want only the contracts moved, or also a German holding company on top? Some German co-investment funds may require a German seat (unverified). A holding company would open them to you; contracts alone would not.
2. What share of the €40M pipeline is German? That sizes the Bavarian line against the Danish one.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash gap and the round",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Keep the Series A for growth; it also makes you eligible for the debt.",
      "With contracting in the GmbH, German project costs move to a Bavarian line through the GmbH's bank (60% state risk up to EUR 4M).",
      "The Danish EIFO-backed line shrinks to the Danish projects and the ApS.",
      "File the German loans before the GmbH signs its first project."
    ],
    "confidence": "medium",
    "confidence_why": "German doors cited and open for a Bavarian site; size depends on the German share of the pipeline.",
    "open_question": "Contracting only, or a German holding as well? And what share of the pipeline is German?",
    "cite": ["w1", "c30", "c1"]
  },
  "routes": {
    "levels": [
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-guar", "name": "EIFO Guarantee on a new bank line", "institution": "EIFO", "via": "the ApS's bank", "status": "open", "why": "Now for Danish projects and ApS costs only.", "cite": ["c1", "c9"]},
        {"id": "eifo-gmbh", "name": "EIFO cover on a line to the GmbH", "institution": "EIFO", "status": "probe", "why": "Unclear whether EIFO backs a German subsidiary's line.", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany, federal (GmbH)", "country": "DE", "doors": [
        {"id": "kfw-erp", "name": "KfW ERP SME loan via the GmbH's bank", "institution": "KfW", "via": "the GmbH's bank, before the project starts", "status": "probe", "why": "Opens with GmbH contracting if the group stays an SME after the round.", "conditions": ["SME by EU definition", "Before project start", "Customary collateral"], "cite": ["c28", "c30", "c32"]},
        {"id": "de-coinvest", "name": "German public co-investment funds alongside the lead", "institution": "e.g. KfW/EIF-backed co-investment funds", "status": "probe", "why": "Some require a German company seat; the ApS issuing shares may not fit.", "cite": ["unverified"]}
      ]},
      {"id": "by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-universal", "name": "LfA Universalkredit with 60% risk release", "institution": "LfA Förderbank Bayern", "via": "the GmbH's bank", "status": "open", "why": "Becomes the lead for German project costs once the GmbH contracts.", "cite": ["w1"]},
        {"id": "bb-bavaria", "name": "Bürgschaftsbank guarantee", "institution": "Bürgschaftsbank Bayern", "via": "the GmbH's bank", "status": "probe", "why": "Top-up only; EUR 1M cap per borrower.", "cite": ["c16"]}
      ]}
    ]
  },
  "process_maps": [
    {
      "id": "lfa-decision",
      "title": "How the GmbH gets the Bavarian line",
      "explains": "The GmbH applies at its bank before costs start; the bank forwards to LfA, which takes 60% of the risk.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "gmbh", "name": "Your GmbH (Munich)", "side": "market"},
        {"id": "hausbank", "name": "The GmbH's bank", "side": "market"},
        {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital"}
      ],
      "steps": [
        {"id": "apply", "label": "GmbH applies at its bank", "kind": "document", "actor": "gmbh", "timing": "before the first GmbH project starts", "cite": ["w1"], "gates": [{"label": "Site (Betriebsstätte) in Bavaria", "cite": ["w1"]}, {"label": "Group turnover up to EUR 500M", "cite": ["w1"]}, {"label": "Applied before the project begins", "cite": ["w1"]}]},
        {"id": "bank-check", "label": "Bank assesses credit and asks for the 60% release", "kind": "step", "actor": "hausbank", "cite": ["w1"], "gates": [{"label": "Loan EUR 25k to 15M; release up to EUR 4M", "cite": ["w1"]}, {"label": "Parent support likely asked for a young GmbH", "cite": ["judgement"]}]},
        {"id": "lfa-decide", "label": "LfA commits and takes 60% of the loss", "kind": "decision", "actor": "lfa", "cite": ["w1"]}
      ],
      "flow": [{"from": "apply", "to": "bank-check"}, {"from": "bank-check", "to": "lfa-decide", "label": "forwarded"}],
      "leverage": [
        {"id": "lfa-window", "at": "apply", "kind": "timing_window", "label": "File before the GmbH signs its first project", "why": "A project already started falls outside the loan.", "how": "GmbH managing director files with the bank in step with the contracting move.", "side": "market", "cite": ["w1", "c30"]},
        {"id": "lfa-door", "at": "hausbank", "kind": "door_opener", "label": "The fund's own Munich banking relationships", "why": "A German lead often knows the banks that file promotional loans for its portfolio.", "how": "Ask the lead for an introduction to its preferred bank.", "side": "market", "cite": ["judgement"]}
      ],
      "cite": ["w1"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "restructure", "label": "Contracting move", "steps": [
        {"id": "tax-advice", "label": "Tax adviser on moving German contracts to the GmbH (transfer pricing)", "start": 0.25, "end": 1.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "gmbh-file", "label": "GmbH files the LfA (and KfW) application via its bank", "start": 1.5, "end": 3, "owner": "client", "status": "planned", "depends_on": ["tax-advice"], "cite": ["w1", "c30"]},
        {"id": "gmbh-sign", "label": "Do not let the GmbH sign a German project before filing", "start": 0, "end": 3, "owner": "client", "status": "blocked", "depends_on": ["gmbh-file"], "cite": ["w1", "c30"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "before-start", "kind": "deal_breaker", "severity": "high", "title": "German loans need the application before the costs start", "fix": "File through the GmbH's bank before its first signed project.", "cite": ["w1", "c30"]},
    {"id": "gmbh-equity", "kind": "flag", "severity": "medium", "title": "A thin GmbH balance sheet may need parent support", "fix": "Plan a capital injection or parent comfort letter into the GmbH from the round.", "cite": ["judgement"]},
    {"id": "tax-move", "kind": "flag", "severity": "medium", "title": "Moving contracting has tax and transfer-pricing effects", "fix": "Tax adviser before the move; never moved only to chase a loan.", "cite": ["judgement"]},
    {"id": "coinvest-seat", "kind": "flag", "severity": "low", "title": "German public co-investors may need a German seat", "fix": "Ask the lead whether a German holding is planned.", "cite": ["unverified"]}
  ]
}
```

**New sources this turn**
- [c16]: Association of German guarantee banks FAQ (as above), cap per borrower.
- [c32]: KfW ERP SME loan sheet (as above), collateral.
- Searched, not fetched, so unverified: [coparion profile, für-gründer.de](https://www.fuer-gruender.de/kapital/eigenkapital/venture-capital/coparion/) (German seat); [coparion annual report 2025, Bundestag lobby register](https://www.lobbyregister.bundestag.de/media/f0/00/789180/Testatsexemplar_coparion-GmbHuCoKG_JAP-2025_signed_signed.pdf).

## Turn 7: the founder (answer, if_asked+client_agent)

> A project is 300 to 800k, takes four to nine months to go live. Pipeline is about 40 million.
> 
> Honestly, I don't know yet. So far they've only talked about moving the contracting, but I'll ask their partner directly whether they want a German holding company on top.

## Turn 7: Wincent

Thanks. The numbers match what I used. Since the German share is still open, I've sized the Bavarian line three ways.

| German share of projects | GmbH cash tied up today | At pipeline pace (over two years) |
|---|---|---|
| 30% | ~€1.1M | ~€3.3M |
| 50% | ~€1.9M | ~€5.5M |
| 70% | ~€2.6M | ~€7.7M |

All my estimates. Up to €4M, the Bavarian state takes 60% of the loss [w1]. Beyond that, the bank carries more of the risk itself, so a larger German share would also lean on the Danish line.

**My advice: run two lines in parallel and keep the round clean.**

1. **This week:**
   - Ask the lead's partner your holding-company question.
   - In the same call, ask which Munich banks their portfolio companies use for promotional loans. A bank that already files these loans moves faster (judgement).
   - Get me each entity's bank and the ApS's equity position.
2. **This month:**
   - The ApS's relationship manager files a new project line with EIFO cover [c1][c9].
   - Your tax adviser looks at the contracting move.
3. **Before the GmbH signs its first project:** its bank files the Bavarian loan [w1].
4. **Before the round closes:** probe whether EIFO would join it.

**What to expect:**
- These are standard products, filed by your banks. No political push is needed unless a file stalls (judgement).
- Precedents: I found no deal from either EIFO or the Bavarian bank in your exact situation, a working-capital line for a project business. That's normal for bank-filed products, which are rarely published one by one.

Shall I draft the note to the ApS's bank, and a one-pager for the GmbH's bank?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash gap and the round",
  "stage": "advise",
  "answer": {
    "lines": [
      "Keep the 12M Series A for growth; it also gives you the positive equity the debt needs.",
      "Danish line: the ApS's bank, with EIFO covering up to 80% of loss, for Danish projects and the ApS.",
      "Bavarian line: the GmbH's bank, with LfA taking 60% of loss up to EUR 4M, for German projects once the GmbH contracts.",
      "File the German loan before the GmbH signs its first project; probe EIFO for the round before close."
    ],
    "confidence": "medium",
    "confidence_why": "Both doors open on cited rules; size and split depend on the German share and the banks' appetite.",
    "open_question": "German share of the pipeline; German holding or not; each entity's bank.",
    "cite": ["c1", "c2", "c9", "w1", "c30"]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 3700000, "label": "Cash tied up in projects at any time today (estimate; ~11M if pipeline lands in 2 years)"},
    "instruments": [
      {"id": "series-a", "name": "Series A (keep at 12M)", "type": "equity", "amount": 12000000, "terms": "Growth, hiring, product, and the positive equity the debt needs; dearest money for project cash", "status": "in_progress", "cite": ["c2", "judgement"]},
      {"id": "dk-line", "name": "ApS bank line with EIFO Guarantee", "type": "guarantee_debt", "amount": 1800000, "amount_max": 5500000, "terms": "Danish projects and ApS costs; revolves; EIFO up to 80% of loss, premium 0.8-6.3% p.a.", "status": "planned", "cite": ["c1", "c4", "judgement"]},
      {"id": "by-line", "name": "GmbH line, LfA Universalkredit", "type": "guarantee_debt", "amount": 1100000, "amount_max": 4000000, "terms": "German project costs once the GmbH contracts; LfA takes 60% of loss up to EUR 4M", "status": "planned", "cite": ["w1", "judgement"]},
      {"id": "bb-topup", "name": "Bürgschaftsbank top-up for the GmbH", "type": "guarantee_debt", "terms": "Only if the bank wants more cover; capped at EUR 1M per borrower", "status": "parked", "cite": ["c16"]},
      {"id": "eifo-equity-s", "name": "EIFO co-investment in the round", "type": "public_coinvest", "terms": "Same cost as the round; a public co-investor eases the debt conversations", "status": "probe", "cite": ["unverified"]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "dk-bank-inst", "name": "The ApS's bank", "side": "market", "country": "DK", "units": [{"id": "dk-bank-corp", "name": "Corporate banking", "roles": [{"id": "dk-rm", "role": "Relationship manager (files the EIFO cover)", "priority": "P1", "reach": "Your CFO, existing relationship", "status": "to_approach", "cite": ["c5"]}, {"id": "dk-credit", "role": "Head of SME / growth credit at the bank", "priority": "P2", "reach": "Via the relationship manager", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "eifo-inst", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-lending", "name": "Bank guarantees and growth loans", "roles": [{"id": "eifo-head", "role": "Head of the guarantee and growth-loan area", "priority": "P1", "reach": "Via the bank's filing; direct only if it stalls", "status": "to_approach", "cite": ["judgement"]}, {"id": "eifo-am", "role": "Account manager for scale-ups", "priority": "P2", "reach": "EIFO's company contact page", "status": "to_approach", "cite": ["judgement"]}]}, {"id": "eifo-venture", "name": "Venture investments", "roles": [{"id": "eifo-vc", "role": "Investment director, venture", "priority": "P1", "reach": "Warm intro from the lead or an existing Danish investor", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "lfa-inst", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-credit", "name": "Promotional loans", "roles": [{"id": "lfa-head", "role": "Head of promotional lending", "priority": "P1", "reach": "Through the GmbH's bank", "status": "to_approach", "cite": ["judgement"]}, {"id": "de-rm", "role": "GmbH's bank, promotional-loan desk", "priority": "P2", "reach": "GmbH managing director; or the lead fund's Munich bank", "status": "to_approach", "cite": ["w1"]}]}]},
      {"id": "by-min", "name": "Bavarian economy ministry", "side": "political", "country": "DE", "units": [{"id": "by-sme", "name": "SME finance unit", "roles": [{"id": "by-sme-head", "role": "Head of the SME-finance unit", "priority": "P2", "reach": "Only if the LfA file stalls", "status": "to_approach", "cite": ["unverified"]}]}]},
      {"id": "lead-fund", "name": "German lead investor", "side": "market", "country": "DE", "units": [{"id": "lead-partner", "name": "Deal team", "roles": [{"id": "lead-p", "role": "Partner leading the deal", "priority": "P1", "reach": "Founder, direct", "status": "engaged", "cite": ["judgement"]}]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "now", "label": "This week", "steps": [
        {"id": "ask-lead", "label": "Ask lead partner: German holding or only contracting? Which Munich bank?", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "banks", "label": "Name each entity's bank; check ApS equity", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["c2"]}
      ]},
      {"id": "dk-track", "label": "Danish line", "steps": [
        {"id": "dk-file", "label": "ApS bank files new project line with EIFO cover", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "depends_on": ["banks"], "cite": ["c1", "c9"]},
        {"id": "dk-live", "label": "Line live (after close if equity needs it)", "start": 4.5, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["dk-file"], "cite": ["c2"]}
      ]},
      {"id": "restructure", "label": "Contracting move and Bavarian line", "steps": [
        {"id": "tax-advice", "label": "Tax adviser on moving German contracts to the GmbH", "start": 0.25, "end": 1.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "gmbh-file", "label": "GmbH files the LfA application via its bank", "start": 1.5, "end": 3, "owner": "client", "status": "planned", "depends_on": ["tax-advice"], "cite": ["w1"]},
        {"id": "gmbh-sign", "label": "Do not let the GmbH sign a German project before filing", "start": 0, "end": 3, "owner": "client", "status": "blocked", "depends_on": ["gmbh-file"], "cite": ["w1", "c30"]}
      ]},
      {"id": "round", "label": "Series A", "steps": [
        {"id": "eifo-probe", "label": "Probe EIFO as co-investor", "start": 0.5, "end": 3, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "close", "label": "Round closes", "start": 4, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["eifo-probe"], "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-close", "label": "Series A close: EIFO co-investment must be raised before", "start": 4, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]},
        {"id": "w-holding", "label": "German holding decision: would open German co-investment funds (seat rule to confirm)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-sme", "label": "SME status after the round (KfW route)", "start": 4.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["c28"]},
        {"id": "w-eifo-terms", "label": "EIFO product sheets (2026 edition) renewed", "start": 13, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-lfa-terms", "label": "LfA Universalkredit conditions (release share, ceiling)", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"]},
        {"id": "w-investeu", "label": "InvestEU folding into the next EU programme: bank cover continues?", "start": 13, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-lease", "label": "Lessor answers on pay-out timing (parked customer route)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "networks": [
    {
      "id": "who-moves",
      "title": "Who moves the two lines",
      "explains": "Each line is filed by your entity's bank; the public side decides behind it; your lead can open bank doors.",
      "nodes": [
        {"id": "aps", "label": "Your ApS", "kind": "body", "cite": ["judgement"]},
        {"id": "gmbh", "label": "Your GmbH", "kind": "body", "cite": ["judgement"]},
        {"id": "dkb", "label": "ApS's bank", "kind": "bank", "cite": ["c5"]},
        {"id": "deb", "label": "GmbH's bank", "kind": "bank", "cite": ["w1"]},
        {"id": "eifo-n", "label": "EIFO", "kind": "institution", "cite": ["c5"]},
        {"id": "lfa-n", "label": "LfA Förderbank Bayern", "kind": "institution", "cite": ["w1"]},
        {"id": "lead", "label": "German lead fund", "kind": "body", "cite": ["judgement"]}
      ],
      "edges": [
        {"from": "dkb", "to": "aps", "kind": "funds", "cite": ["c5"]},
        {"from": "eifo-n", "to": "dkb", "kind": "advises", "label": "guarantees the line", "cite": ["c1"]},
        {"from": "deb", "to": "gmbh", "kind": "funds", "cite": ["w1"]},
        {"from": "lfa-n", "to": "deb", "kind": "advises", "label": "takes 60% of the risk", "cite": ["w1"]},
        {"from": "lead", "to": "deb", "kind": "works_with", "label": "possible introduction", "cite": ["judgement"]}
      ],
      "cite": ["c1", "w1"]
    }
  ]
}
```

## Turn 8: the founder (prioritise, script)

> Which two or three should we actually go for, and what will each cost us in time and effort?

## Turn 8: Wincent

Go for three. Everything else waits.

**1. The Danish bank line with EIFO cover (lead).**
- **What it costs:** the bank's rate plus an EIFO premium of 0.8% to 6.3% a year [c4].
- **Effort:** two to four weeks of your CFO's time, for the cash forecast, the project list and the accounts. The bank does the filing (judgement).
- **Time:** about one to three months to a live line (unverified; ask the bank).
- **Condition:** positive equity [c2]. If the accounts don't show it today, the line goes live just after close.

**2. The Bavarian line for the GmbH.**
- **What it costs:** your bank sets the rate (unverified), and the state takes 60% of the risk [w1].
- **Effort:** the loan file itself is light (judgement). The real work is moving the contracts into the GmbH. Budget tax advice and a GmbH plan of its own.
- **Time:** two to four months, including the move (judgement).
- **Hard rule:** the GmbH files before it signs its first project [w1].

**3. EIFO in your Series A (probe).**
- **What it costs:** nothing extra; it's the same dilution as any other investor.
- **Effort:** a few meetings, using your existing data room (judgement).
- **Time:** it has to land inside your four-month window.

**Parked:**
- EIFO's own growth loan: a fallback if your bank lends too little. It is dearer, at the Danish interbank rate plus 4% to 10% [c50].
- The federal SME loan: only once the SME status is confirmed after the round [c28].
- The guarantee-bank top-up: capped at €1M [c16].
- EU venture debt and customer leasing.

Shall I draft the note to the ApS's bank now?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash gap and the round",
  "stage": "advise",
  "answer": {
    "lines": [
      "1. Danish bank line with EIFO cover: lead; 2-4 weeks of CFO time, 1-3 months to live.",
      "2. Bavarian LfA line for the GmbH: in parallel; the effort is the contracting move, filed before the first GmbH project.",
      "3. EIFO as co-investor in the Series A: low effort, must land before close.",
      "Parked: EIFO growth loan (fallback), KfW (after SME check), guarantee-bank top-up, EU venture debt, customer leasing."
    ],
    "confidence": "medium",
    "confidence_why": "Doors open on cited rules; timelines are estimates; size depends on the German share and bank appetite.",
    "open_question": "Each entity's bank, ApS equity today, German share of the pipeline.",
    "cite": ["c1", "c2", "c4", "w1", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-guar", "name": "EIFO Guarantee on a new bank line", "institution": "EIFO", "via": "the ApS's bank", "status": "open", "why": "Priority 1: cheapest money for project cash; premium 0.8-6.3% p.a.", "cite": ["c1", "c4", "c9"]},
        {"id": "eifo-equity", "name": "EIFO co-investment in the Series A", "institution": "EIFO", "status": "probe", "why": "Priority 3: low effort; must be raised before close.", "cite": ["unverified"]},
        {"id": "eifo-growth", "name": "EIFO Growth Loan", "institution": "EIFO", "via": "alongside the ApS's bank", "status": "park", "why": "Fallback if the bank lends too little; dearer (CIBOR + 4-10%).", "cite": ["c46", "c50"]}
      ]},
      {"id": "by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-universal", "name": "LfA Universalkredit with 60% risk release", "institution": "LfA Förderbank Bayern", "via": "the GmbH's bank", "status": "open", "why": "Priority 2: German project costs once the GmbH contracts.", "cite": ["w1"]},
        {"id": "bb-bavaria", "name": "Bürgschaftsbank guarantee", "institution": "Bürgschaftsbank Bayern", "via": "the GmbH's bank", "status": "park", "why": "Top-up only; EUR 1M cap per borrower.", "cite": ["c16"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany, federal (GmbH)", "country": "DE", "doors": [
        {"id": "kfw-erp", "name": "KfW ERP SME loan via the GmbH's bank", "institution": "KfW", "status": "park", "why": "Revisit once SME status after the round is confirmed.", "cite": ["c28"]}
      ]}
    ]
  },
  "process_maps": [
    {
      "id": "eifo-line",
      "title": "How the Danish line with EIFO cover gets done",
      "explains": "Your bank grants a new line and asks EIFO to guarantee part of the loss; you pay EIFO's premium.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "aps", "name": "Your ApS (CFO)", "side": "market"},
        {"id": "dkbank", "name": "The ApS's bank", "side": "market"},
        {"id": "eifo", "name": "EIFO", "side": "public-capital"}
      ],
      "steps": [
        {"id": "pack", "label": "CFO prepares forecast, project list, accounts", "kind": "document", "actor": "aps", "timing": "2-4 weeks", "cite": ["judgement"], "gates": [{"label": "Positive equity, creditworthy", "cite": ["c2"]}, {"label": "Group at most 749 employees", "cite": ["c6"]}, {"label": "Not listed on a main exchange", "cite": ["c9"]}]},
        {"id": "bank-line", "label": "Bank sizes a new project line and asks for EIFO cover", "kind": "step", "actor": "dkbank", "cite": ["c5", "judgement"], "gates": [{"label": "New credit: expands the bank's commitment", "cite": ["c9"]}, {"label": "Facility from DKK 2M", "cite": ["c8"]}]},
        {"id": "eifo-decide", "label": "EIFO guarantees up to 80% of the loss on the line", "kind": "decision", "actor": "eifo", "cite": ["c1"], "gates": [{"label": "Capped at 50% of the bank's total loss on you", "cite": ["c1"]}]},
        {"id": "live", "label": "Line live; premium 0.8-6.3% p.a.; up to 3 years, extendable", "kind": "step", "actor": "aps", "cite": ["c3", "c4"]}
      ],
      "flow": [{"from": "pack", "to": "bank-line"}, {"from": "bank-line", "to": "eifo-decide", "label": "cover request"}, {"from": "eifo-decide", "to": "live"}],
      "leverage": [
        {"id": "door-rm", "at": "dkbank", "kind": "door_opener", "label": "Your relationship manager", "why": "The bank files; EIFO decides on the bank's case.", "how": "CFO briefs the RM with the cash-cycle numbers and the round.", "side": "market", "cite": ["c5", "judgement"]},
        {"id": "block-equity", "at": "pack", "kind": "blocker", "label": "Negative equity today", "why": "EIFO requires positive equity.", "how": "Time the filing just after the round closes.", "side": "public-capital", "cite": ["c2"]},
        {"id": "pp-mission", "at": "eifo-decide", "kind": "pressure_point", "label": "Frame it as a mispriced, self-liquidating project book", "why": "Public cover exists for viable risk banks price badly.", "how": "Project list with go-live dates and payment history.", "side": "public-capital", "cite": ["judgement"]}
      ],
      "cite": ["c1", "c2", "c9"]
    }
  ],
  "risks_flags": [
    {"id": "precedent-none", "kind": "flag", "severity": "low", "title": "No published precedent for either line in your situation", "fix": "Normal for bank-filed products; ask each bank for comparable clients.", "cite": ["judgement"]}
  ]
}
```

## Turn 9: the founder (who_to_call, script)

> Who do I call first, on the Danish side and at the banks, by role? And draft me the email.

## Turn 9: Wincent

Call your own bank first. EIFO decides on the cover, but your bank files the request (judgement). The order:

**Danish side, in this order:**
1. **The ApS's corporate relationship manager** (P1, this week). They file the request for EIFO cover [c5]. The email below goes to them.
2. **The bank's head of SME or growth credit** (P2). Reach them through the relationship manager, but only if the manager hesitates on size or risk.
3. **EIFO's scale-up account team** (P2 on the public side). Don't go direct on the guarantee: let the bank file it. Call EIFO only to ask what they want to see, or if the bank stalls (judgement).
4. **EIFO's venture investment team** (P1 for the round). Get a warm introduction from your lead or a Danish investor, within the next six weeks.

**German side:** give the GmbH's relationship manager a heads-up call now. File the real application once your tax adviser has signed off on the move [w1].

No political contact is needed for standard bank-filed products (judgement). I couldn't confirm names in EIFO's organisation chart, so I've kept to roles.

---

**Subject:** New project financing line with EIFO-Guarantee: meeting request

Dear [Name],

[Company] is scaling fast. Our pipeline is about €40M of forklift safety projects in Denmark and Germany. Each project ties up €300–800k for four to nine months until go-live, when the customer pays.

We would like to discuss a **new project financing line of about €[3–4]M**, backed by an EIFO-Guarantee. The line would be self-liquidating: each draw is repaid at go-live and redrawn for the next project. It would come on top of our existing facilities.

We are closing a €12M Series A, led by [fund], in about four months. We can share the project list, the cash-flow forecast and the round's terms.

Could we meet in the next two weeks?

Kind regards,
[Name], CEO, [Company] ApS

---

Two things before you send it:
- Fill in the equity position honestly. If it is negative today, say the line should start at close. EIFO requires positive equity [c2].
- I can write a Danish version if your bank prefers it.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash gap and the round",
  "stage": "advise",
  "stakeholders": {
    "institutions": [
      {"id": "dk-bank-inst", "name": "The ApS's bank", "side": "market", "country": "DK", "units": [{"id": "dk-bank-corp", "name": "Corporate banking", "roles": [{"id": "dk-rm", "role": "Relationship manager (files the EIFO cover): CALL FIRST", "priority": "P1", "reach": "CEO email (draft ready), this week", "status": "to_approach", "cite": ["c5", "judgement"]}, {"id": "dk-credit", "role": "Head of SME / growth credit at the bank", "priority": "P2", "reach": "Via the relationship manager, if size or risk is the hesitation", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "eifo-inst", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-lending", "name": "Bank guarantees and growth loans", "roles": [{"id": "eifo-head", "role": "Head of the guarantee and growth-loan area", "priority": "P1", "reach": "Decides on the bank's filing; direct only if it stalls", "status": "to_approach", "cite": ["judgement"]}, {"id": "eifo-am", "role": "Account manager for scale-ups", "priority": "P2", "reach": "EIFO's company contact page: ask what they want to see", "status": "to_approach", "cite": ["judgement"]}]}, {"id": "eifo-venture", "name": "Venture investments", "roles": [{"id": "eifo-vc", "role": "Investment director, venture", "priority": "P1", "reach": "Warm intro from the lead or a Danish investor, within 6 weeks", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "lfa-inst", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-credit", "name": "Promotional loans", "roles": [{"id": "de-rm", "role": "GmbH's bank, promotional-loan desk", "priority": "P2", "reach": "Heads-up call now; file after tax sign-off", "status": "to_approach", "cite": ["w1", "judgement"]}]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "now", "label": "This week", "steps": [
        {"id": "email-rm", "label": "Send meeting request to the ApS's relationship manager", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "call-de-rm", "label": "Heads-up call to the GmbH's bank", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["w1"]}
      ]},
      {"id": "round", "label": "Series A", "steps": [
        {"id": "eifo-intro", "label": "Warm intro to EIFO venture team", "start": 0.25, "end": 1.5, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  }
}
```

## Turn 10: the founder (regulatory, script)

> A big customer asked if we're ready for the new EU Machinery Regulation. Is that a problem for any of this?

## Turn 10: Wincent

That's a regulatory question, so I'm handing it to **Regina**: does the new EU Machinery Regulation affect your sensors, and what would it require of you? Regina owns that call and will come back to you directly. I won't read the rule from the money side.

**What I can say for the funding:**
- None of the conditions I've checked for the Danish guarantee [c2][c6][c9] or the Bavarian loan [w1] mention product regulation. So nothing in this plan is blocked today, as far as those conditions go.
- Your banks and your lead investor will probably ask the same question your customer did, in their due diligence (judgement). A clear, confident answer helps both the line and the round. A vague one slows them.

**What I'd do:** get Regina's answer before the meeting with the ApS's bank. Then you have one consistent line for your customer, your bank and your lead. Don't reply to the customer with your own reading before then (judgement).

Shall I hold the bank email until Regina has come back, or send it now and handle the regulation in the meeting?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash gap and the round",
  "stage": "advise",
  "risks_flags": [
    {"id": "regina-machinery", "kind": "flag", "severity": "medium", "title": "EU Machinery Regulation: customer asks if you are ready (for Regina)", "fix": "Regina assesses scope and readiness; one agreed answer for customer, bank and lead before the bank meeting.", "cite": ["judgement"]},
    {"id": "dd-question", "kind": "flag", "severity": "low", "title": "Banks and the lead will likely ask the same in due diligence", "fix": "Prepare the answer with Regina; no cited funding gate turns on it today.", "cite": ["c2", "c9", "w1", "judgement"]}
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "now", "label": "This week", "steps": [
        {"id": "regina-handoff", "label": "Regina: Machinery Regulation read for the sensors", "start": 0, "end": 0.5, "owner": "us", "status": "active", "cite": ["judgement"]},
        {"id": "customer-reply", "label": "Do not answer the customer on the regulation before Regina's read", "start": 0, "end": 0.5, "owner": "client", "status": "blocked", "depends_on": ["regina-handoff"], "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-machinery", "label": "Machinery Regulation: Regina's read and any date that touches your customers", "start": 0.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  }
}
```

## Turn 11: the founder (answer, if_asked+client_agent)

> A Danish bank for the ApS and a savings bank in Munich for the GmbH. About 3 million working-capital line, expensive, and we gave personal guarantees.
> 
> Send it now. Getting a bank meeting takes weeks anyway. For Regina: our sensors get fitted to forklifts the customer already owns, and honestly we haven't looked closely at the CE side yet.

## Turn 11: Wincent

Good, that helps. Send it in the revised form below.

**What your answer changes:**
- **The existing €3M line can't simply be "covered" after the fact.** EIFO only guarantees credit that expands the bank's commitment [c9]. So the ask is a larger line: for example, the €3M plus a new tranche, with EIFO cover on the new money.
- **Your personal guarantees become a negotiating point.** With EIFO taking up to 80% of the loss on the new money [c1], it's fair to ask the bank to reduce or release them, and to reprice. Whether EIFO cover and personal guarantees can sit side by side is unverified. Ask the bank.
- **A Munich savings bank is a normal channel for the Bavarian loan.** The application can go through the house bank or another bank of your choice [w1].

**For Regina (passed on as you said it):** the sensors are retrofitted to forklifts the customer already owns, and the CE side hasn't been assessed yet. Regina will take it from there.

---

**Subject:** Expanding our working-capital facility with an EIFO-Guarantee: meeting request

Dear [Name],

Our pipeline has grown to about €40M of forklift safety projects in Denmark and Germany. Each project ties up €300–800k for four to nine months until go-live, when the customer pays.

We would like to discuss **expanding our facility by about €[3–4]M** in a new project line backed by an EIFO-Guarantee. Each draw would be repaid at go-live. We would also like to review the terms and security of the current €3M line in light of that cover.

We are closing a €12M Series A, led by [fund], in about four months, and can share the project list and the cash forecast.

Could we meet in the next two weeks?

Kind regards,
[Name], CEO, [Company] ApS

---

**One question:** what rate and term are you paying on the €3M today? That tells us how much the EIFO cover saves you.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash gap and the round",
  "stage": "advise",
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 3700000, "label": "Cash tied up in projects at any time today (estimate; ~11M if pipeline lands in 2 years)"},
    "instruments": [
      {"id": "existing-line", "name": "Existing ApS working-capital line", "type": "loan", "amount": 3000000, "terms": "Carries project cash today; dear, and backed by founders' personal guarantees", "status": "secured", "cite": ["judgement"]},
      {"id": "dk-line", "name": "New tranche with EIFO Guarantee (Danish bank)", "type": "guarantee_debt", "amount": 3000000, "amount_max": 4000000, "terms": "New money on top of the 3M; EIFO up to 80% of loss; lever to reprice and ease personal guarantees", "status": "in_progress", "cite": ["c1", "c9", "judgement"]},
      {"id": "by-line", "name": "GmbH line via Munich savings bank, LfA Universalkredit", "type": "guarantee_debt", "amount": 1100000, "amount_max": 4000000, "terms": "German project costs once the GmbH contracts; LfA takes 60% of loss", "status": "planned", "cite": ["w1"]}
    ]
  },
  "risks_flags": [
    {"id": "new-credit", "kind": "deal_breaker", "severity": "high", "title": "EIFO cover only on new credit, not the existing 3M", "fix": "Ask for an expansion: a new project tranche on top of today's line.", "cite": ["c9"]},
    {"id": "personal-guar", "kind": "flag", "severity": "medium", "title": "Founders' personal guarantees on the current line", "fix": "Use EIFO cover to negotiate their reduction or release; confirm with the bank whether both can coexist.", "cite": ["c1", "unverified"]},
    {"id": "regina-machinery", "kind": "flag", "severity": "medium", "title": "Machinery Regulation and CE for retrofitted sensors (for Regina)", "fix": "Handed to Regina with the facts: retrofit to customer-owned forklifts; CE not yet assessed.", "cite": ["judgement"]}
  ],
  "stakeholders": {
    "institutions": [
      {"id": "dk-bank-inst", "name": "The ApS's Danish bank", "side": "market", "country": "DK", "units": [{"id": "dk-bank-corp", "name": "Corporate banking", "roles": [{"id": "dk-rm", "role": "Relationship manager (files the EIFO cover)", "priority": "P1", "reach": "CEO email sent this week", "status": "engaged", "cite": ["c5"]}]}]},
      {"id": "lfa-inst", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-credit", "name": "Promotional loans", "roles": [{"id": "de-rm", "role": "Munich savings bank, business clients / promotional-loan desk", "priority": "P2", "reach": "Heads-up call now; file after tax sign-off", "status": "to_approach", "cite": ["w1"]}]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "dk-track", "label": "Danish line", "steps": [
        {"id": "email-rm", "label": "Email sent: expansion with EIFO cover, review of current terms", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "rm-meeting", "label": "Meeting with the relationship manager", "start": 0.5, "end": 1, "owner": "institution", "status": "planned", "depends_on": ["email-rm"], "cite": ["judgement"]}
      ]}
    ]
  }
}
```

## Turn 12: the founder (brief, script)

> We are running out of time on our side. Can you write up what we have as a brief now?

## Turn 12: Wincent

# Brief: public money for the project cash gap and the Series A

*Prepared for [Company] by Wincent (public capital), 23 November 2026*

## 1. The read

[Company] sells and installs forklift safety sensors. A Danish ApS signs most contracts. A Munich GmbH with about 8 staff does sales and installation. Each project ties up €300–800k for 4 to 9 months until go-live. The pipeline is about €40M. Today there is one €3M working-capital line at the Danish bank. It is expensive and backed by the founders' personal guarantees. A €12M Series A is due to close in about four months, probably led by a German fund that wants contracting moved into the GmbH.

The deciding fact is that this is a revolving cash cycle, not a one-off cost. Cash tied up in projects is about **€3.7M at any time today** (range €1M to €9M), and about **€11M** if the pipeline lands within two years (judgement, from the founder's figures).

## 2. The recommendation

Keep the Series A at €12M for growth. It is also what gives you the positive equity the public lenders require [c2][c47]. Finance the projects with bank debt that the state partly guarantees, in two lines:

- **The ApS's Danish bank:** a new project tranche on top of today's €3M. The Danish state fund EIFO covers up to 80% of the loss on it [c1][c9].
- **The GmbH's Munich savings bank:** the Bavarian promotional bank's general loan, where the state takes 60% of the loss up to €4M [w1]. This applies once the GmbH contracts the German projects.

This puts the risk where public cover exists to carry it: lenders price your project risk badly (judgement). Your price stays unchanged, and you avoid permanent dilution for a cost that pays itself back at every go-live (judgement).

## 3. The options we weighed

| Route | Status | Why |
|---|---|---|
| Danish bank line with EIFO cover | **Lead** | Cheapest money for project cash. EIFO takes up to 80% of the loss [c1]; premium 0.8–6.3% a year [c4]. New credit only [c9] |
| Bavarian promotional loan via the GmbH's bank | **Second, in parallel** | Requires a site in Bavaria; running costs are allowed; the state takes 60% of the loss up to €4M [w1] |
| EIFO as co-investor in the Series A | **Probe** | Low effort, must happen before the round closes (unverified) |
| EIFO growth loan | Parked (fallback) | EIFO lends 50% next to the bank [c46], but it is dearer: Danish interbank rate plus 4–10% [c50]. Cannot carry a guarantee on that co-financing [c46] |
| Federal SME loan via the GmbH's bank | Parked | Only if the group is still an SME after the round [c28]. Must be applied for before the project starts [c30] |
| Bavarian guarantee bank | Parked (top-up) | Capped at €1M per borrower [c16] |
| EU-backed bank cover in Denmark | Probe | Some Danish banks lend working capital and are backed by an EU guarantee [w2]. Ask whether yours is |
| EU venture debt (European Investment Bank) | Parked | Typically €10–50M and tied to R&D investment plans [w3] |
| German export cover | Shut | Covers German exporters' export contracts [c39] |
| A bigger round instead of debt | Not advised | About six extra points of dilution at an assumed €40M pre-money (judgement) |
| Leasing through customers | Parked (sales option) | The lessor usually pays at acceptance, so the gap before go-live stays with you. It also makes the offer dearer for customers (judgement) |
| German public co-investment funds | Probe | May need a German company seat (unverified). Depends on whether the lead wants a German holding company |

## 4. The plan

**This week:**
- Send the email to the ApS's relationship manager (Annex).
- Ask the lead partner whether they want a German holding company or only the contracts moved, and which Munich banks their portfolio companies use.
- Check the ApS's equity in its last accounts.
- Give the GmbH's savings bank a heads-up call.
- Regina: the Machinery Regulation read.

**This month:**
- Meet the relationship manager.
- The CFO prepares the forecast, the project list and the accounts (2–4 weeks).
- Tax adviser on the contracting move.
- Ask for a warm introduction to EIFO's venture team.

**This quarter:**
- The bank files the EIFO cover.
- The GmbH's bank files the Bavarian loan **before** the GmbH signs its first project [w1].
- The EIFO co-investment decision, before close.

**After close:**
- The Danish tranche goes live if equity was the hurdle [c2].
- Revisit the federal SME loan once SME status is clear [c28].

**Not yet:**
- The GmbH signs no German contract before its loan is filed [w1][c30].
- No reply to the customer on the regulation before Regina's read.
- No pushing of prepayment or leasing onto customers.

## 5. Who (by function; names not verified)

| Route | Who decides (P1) | Who forwards (P2) | How to reach them |
|---|---|---|---|
| Danish line | The ApS bank's corporate relationship manager (files the cover request) [c5]. On the public side: the head of EIFO's guarantee and growth-loan area | The bank's head of SME or growth credit; EIFO's scale-up account manager | The email this week. Contact EIFO directly only if the bank stalls |
| Bavarian line | The Bavarian promotional bank's head of promotional lending | The savings bank's business-clients / promotional-loan desk. Politically: the Bavarian economy ministry's SME-finance unit, only if the file stalls (unverified) | Through the savings bank [w1] |
| EIFO in the round | EIFO's venture investment director | The partner leading the deal at your lead fund | Warm introduction |

## 6. What to expect (lead route)

1. **The file.** The CFO prepares the pack. To pass, the ApS needs:
   - positive equity and creditworthiness [c2]
   - no more than 749 employees in the group [c6]
   - no listing on a main stock exchange [c9]
2. **The bank sizes the new tranche** and asks EIFO for cover. The tranche must be new credit [c9] and at least DKK 2M [c8].
3. **EIFO decides.** It covers up to 80% of the loss on the facility, but in principle no more than 50% of the bank's total loss on you [c1].
4. **The line goes live.** Premium 0.8–6.3% a year [c4]; up to three years, extendable [c3].

**Timing and odds:**
- About 1–3 months to a live line (unverified).
- The odds are good on eligibility. They depend on the bank's appetite and on equity at the time of filing (judgement).

## 7. Risks and flags

| Flag | Severity | Fix |
|---|---|---|
| EIFO covers only new credit, not the existing €3M [c9] | High | Ask for an expansion with a new tranche |
| The German loans must be applied for before the costs start [w1][c30] | High | File through the savings bank before the GmbH's first project |
| Positive equity needed [c2][c47] | High if equity is negative | Time the Danish filing for just after close |
| Founders' personal guarantees | Medium | Use the EIFO cover to negotiate their release and a lower rate. Confirm with the bank whether both can coexist (unverified) |
| Moving contracting brings tax and transfer-pricing effects | Medium | Tax adviser before the move. Never move contracts just to get a loan (judgement) |
| A thin GmbH balance sheet | Medium | Equity injection into the GmbH or parent support from the round (judgement) |
| SME test counts the whole group [c28] | Medium | Confirm after the round |
| **Regulatory, for Regina:** EU Machinery Regulation and CE for sensors retrofitted to forklifts the customer owns; CE not yet assessed | Medium | Regina assesses. Then one agreed answer for the customer, the banks and the lead. No cited funding condition turns on it today [c2][c9][w1] |

## 8. Decisions

- **Round size:** keep it at €12M and finance the projects with debt. *Recommended.*
- **Contracting into the GmbH:** acceptable if the tax adviser agrees. It opens the Bavarian line [w1]. *Recommended, in sequence.*
- **Send the bank email now:** *agreed.*

## 9. Precedents

- **Danish line:** none found for an EIFO guarantee in a comparable project-financing case. Bank-filed products are rarely published one by one (judgement).
- **Bavarian line:** none found. The register shows the Bavarian promotional bank's grant awards, not working-capital loans like this one (register record, https://competition-cases.ec.europa.eu/cases/SA.118637).
- **EIFO in the round:** EIFO's venture list shows equity stakes in Danish start-ups, e.g. NIL Technology ApS (register record, https://eifo.dk/for-dig-som-er/fond-eller-investor/investering-i-virksomheder). None in your sector.
- **Ask each bank for comparable clients.**

## 10. Watchlist

| What | Next look | Why |
|---|---|---|
| Series A close | ~Mar 2027 | EIFO co-investment must be raised before it |
| German holding decision | Dec 2026 | Could open German public co-investment funds (unverified) |
| SME status after the round | After close | Decides the federal SME loan [c28] |
| Danish equity position | At filing | Gate for the Danish line [c2] |
| EIFO 2026 product sheets | Next edition | Cover and premium terms [c1][c4] |
| Bavarian loan conditions | Annual | The 60% share and the €4M ceiling [w1] |
| EU guarantee programme folding into its successor | 2027 budget cycle (unverified) | Whether bank cover continues |
| Machinery Regulation | Regina's read | Customer and due-diligence answer |
| Lessors' payout timing | Dec 2026 | Reopens the leasing route only if they pay before go-live |

## 11. Open questions for the founder

1. **The ApS's equity in its last accounts.** It decides whether the Danish line can go live before or after the close [c2].
2. **The rate and term on today's €3M line.** They show how much the EIFO cover saves.
3. **The German share of the pipeline.** It sizes the Bavarian line against the Danish one: about €1.1M to €2.6M of German project cash tied up today (judgement).
4. **Holding company or contracts only, per the lead.** It decides the German co-investment probe.
5. **The pre-money valuation.** It turns the dilution comparison into a real number.

## Annex: email to the ApS's relationship manager (agreed; the founder sends)

**Subject:** Expanding our working-capital facility with an EIFO-Guarantee: meeting request

Dear [Name],

Our pipeline has grown to about €40M of forklift safety projects in Denmark and Germany. Each project ties up €300–800k for four to nine months until go-live, when the customer pays.

We would like to discuss **expanding our facility by about €[3–4]M** in a new project line backed by an EIFO-Guarantee. Each draw would be repaid at go-live. We would also like to review the terms and security of the current €3M line in light of that cover.

We are closing a €12M Series A, led by [fund], in about four months, and can share the project list and the cash forecast.

Could we meet in the next two weeks?

Kind regards,
[Name], CEO, [Company] ApS

## Sources

- **[c1] [c2] [c3] [c4] [c5] [c6] [c8] [c9]:** EIFO Guarantee product sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf, sha256 c3f998cb12f6
- **[c46] [c47] [c48] [c50]:** EIFO Growth Loan product sheet 2026, https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf, sha256 6dfac0993cfe
- **[c13] [c14] [c16]:** Association of German guarantee banks, FAQ, https://www.vdb-info.de/de/ueber-uns/nutzliche-infos/faq/, sha256 30ddc2628aa5
- **[c28] [c30] [c32] [c37]:** KfW ERP SME loan sheet, https://kfw.de/PDF/Download-Center/Förderprogramme-(Inlandsförderung)/PDF-Dokumente/6000004842_M_365.pdf, sha256 31b2116df386
- **[c39] [c45]:** German export credit guarantees, application procedure, https://www.exportkreditgarantien.de/de/loesungen/einstieg-in-die-absicherung/antragsverfahren.html, sha256 f7675952b017
- **[w1]:** [Förderdatenbank, LfA Universalkredit](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/universalkredit.html), retrieved 2026-11-23: "mit einem Jahresumsatz bis zu EUR 500 Millionen und mit Betriebsstätte in Bayern"; "Betriebsmittel sowie Umschuldungen sind mit Darlehenslaufzeiten von bis zu 10 Jahren finanzierbar"; "mit einer 60-prozentigen Haftungsfreistellung „HaftungPlus“"; "Richten Sie Ihren Antrag bitte vor Beginn Ihres Vorhabens an Ihre Hausbank oder ein anderes Kreditinstitut Ihrer Wahl."
- **[w2]:** [EIF, kompasbank press release](https://www.eif.org/press/all/kompasbank-to-provide-over-eur-175-million-in-new-cheaper-loans-to-danish-smes-through-european-guarantee), 3 Jul 2024, retrieved 2026-11-23: "provides loans for fixed- and current assets, working capital, property and minor acquisition financing"; "The agreements are supported by the InvestEU programme"
- **[w3]:** [EIB venture debt](https://www.eib.org/products/equity/venture-debt/index), retrieved 2026-11-23: "We typically offer financing between €10 million and €50 million."; the investee "must have investment plans for research and development"
- **Searched, not fetched (unverified):**
  - [EIFO working capital guarantee sheet](https://www.eifo.dk/media/zkbhobmw/eifo_working-capital-guarantee-product-sheet.pdf) (returned not found)
  - [coparion profile](https://www.fuer-gruender.de/kapital/eigenkapital/venture-capital/coparion/)
  - [Danske Bank EIF guarantee](https://www.eif.org/press/all/eif-guarantee-unlocks-eur178-million-in-new-lending-for-nordic-smes-through-danske-bank)

```mandate-board
{
  "title": "Forklift safety sensors: public money for the cash gap and the round",
  "stage": "write_up",
  "answer": {
    "lines": [
      "Keep the 12M Series A for growth; it also gives the positive equity the public lenders require.",
      "Lead: a new project tranche at the ApS's Danish bank, with EIFO covering up to 80% of loss.",
      "In parallel: a Bavarian LfA loan through the GmbH's Munich savings bank (60% state risk up to EUR 4M), filed before the GmbH's first project.",
      "Probe EIFO as co-investor before close; use the cover to reprice and ease the personal guarantees."
    ],
    "confidence": "medium",
    "confidence_why": "Both doors open on cited rules; size and timing depend on equity at filing, the German share and the banks.",
    "open_question": "ApS equity today, rate on the current 3M line, German share, holding or not.",
    "cite": ["c1", "c2", "c9", "w1", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "investeu-bank", "name": "InvestEU-backed SME lending at a Danish bank", "institution": "EIF via Danish banks", "via": "your bank, if it holds the cover", "status": "probe", "why": "Some Danish banks lend working capital with InvestEU support; ask yours.", "cite": ["w2"]},
        {"id": "eib-vd", "name": "EIB venture debt", "institution": "European Investment Bank", "status": "park", "why": "Typically EUR 10-50M and tied to R&D plans.", "cite": ["w3"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-guar", "name": "EIFO Guarantee on a new bank tranche", "institution": "EIFO", "via": "the ApS's Danish bank", "status": "open", "why": "Lead: up to 80% of loss on new credit; premium 0.8-6.3% p.a.", "conditions": ["Positive equity", "New credit only", "From DKK 2M"], "cite": ["c1", "c2", "c4", "c8", "c9"]},
        {"id": "eifo-equity", "name": "EIFO co-investment in the Series A", "institution": "EIFO", "status": "probe", "why": "Low effort; before close.", "cite": ["unverified"]},
        {"id": "eifo-growth", "name": "EIFO Growth Loan", "institution": "EIFO", "status": "park", "why": "Fallback; dearer (CIBOR + 4-10%); no guarantee on the 1:1 slice.", "cite": ["c46", "c50"]},
        {"id": "eifo-gmbh", "name": "EIFO cover on a line to the GmbH", "institution": "EIFO", "status": "probe", "why": "Unconfirmed whether EIFO backs a German subsidiary.", "cite": ["unverified"]},
        {"id": "eifo-export-wc", "name": "EIFO export working-capital guarantee", "institution": "EIFO", "status": "probe", "why": "Order-linked; current terms not fetched.", "cite": ["unverified"]},
        {"id": "eifo-match", "name": "EIFO Match Loan", "institution": "EIFO", "status": "park", "why": "Aimed at early-stage startups; likely outgrown.", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany, federal (GmbH)", "country": "DE", "doors": [
        {"id": "kfw-erp", "name": "KfW ERP SME loan via the GmbH's bank", "institution": "KfW", "status": "park", "why": "After SME status is confirmed post-round; before project start.", "cite": ["c28", "c30"]},
        {"id": "de-coinvest", "name": "German public co-investment funds", "institution": "KfW/EIF-backed co-investors", "status": "probe", "why": "May require a German seat; depends on the holding decision.", "cite": ["unverified"]},
        {"id": "hermes", "name": "German export credit cover", "institution": "Federal export credit agency", "status": "shut", "why": "For German exporters' export contracts.", "cite": ["c39"]}
      ]},
      {"id": "by", "level": "regional", "label": "Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-universal", "name": "LfA Universalkredit with 60% risk release", "institution": "LfA Förderbank Bayern", "via": "the GmbH's Munich savings bank", "status": "open", "why": "Second, in parallel: German project costs once the GmbH contracts.", "conditions": ["Site in Bavaria", "Apply before costs start"], "cite": ["w1"]},
        {"id": "bb-bavaria", "name": "Bürgschaftsbank guarantee", "institution": "Bürgschaftsbank Bayern", "status": "park", "why": "Top-up only; EUR 1M cap.", "cite": ["c16"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Customer side", "doors": [
        {"id": "customer-lease", "name": "Third-party leasing for customers", "institution": "Private lessors", "status": "park", "why": "Lessor usually pays at acceptance; gap stays; dearer offer.", "cite": ["judgement"]},
        {"id": "buyer-fin", "name": "EIFO buyer financing", "institution": "EIFO", "status": "park", "why": "Complement only, never the fix.", "cite": ["judgement"]}
      ]}
    ]
  },
  "hierarchies": [
    {
      "id": "field-dk",
      "title": "Denmark: who backs the ApS's credit",
      "explains": "EIFO backs the ApS's own bank; the bank is the door.",
      "nodes": [
        {"id": "eifo", "label": "EIFO", "kind": "institution", "cite": ["c5"]},
        {"id": "eifo-guar", "label": "EIFO Guarantee on the bank's new tranche", "kind": "instrument", "parent": "eifo", "status": "open", "cite": ["c1", "c9"]},
        {"id": "eifo-growth", "label": "EIFO Growth Loan", "kind": "instrument", "parent": "eifo", "status": "park", "cite": ["c46"]},
        {"id": "dk-bank", "label": "The ApS's Danish bank", "kind": "channel", "parent": "eifo", "status": "open", "cite": ["c5"]}
      ],
      "cite": ["c1"]
    },
    {
      "id": "field-by",
      "title": "Bavaria: who backs the GmbH's credit",
      "explains": "Bavarian promotional money reaches the GmbH through its own bank, before costs start.",
      "nodes": [
        {"id": "by-state", "label": "Free State of Bavaria", "kind": "ministry", "cite": ["w1"]},
        {"id": "lfa", "label": "LfA Förderbank Bayern", "kind": "institution", "parent": "by-state", "cite": ["w1"]},
        {"id": "lfa-universal", "label": "LfA Universalkredit (60% release)", "kind": "programme", "parent": "lfa", "status": "open", "cite": ["w1"]},
        {"id": "de-bank", "label": "The GmbH's Munich savings bank", "kind": "channel", "parent": "lfa", "status": "open", "cite": ["w1"]},
        {"id": "bb", "label": "Bürgschaftsbank (Bavaria)", "kind": "institution", "parent": "by-state", "status": "park", "cite": ["c16"]}
      ],
      "cite": ["w1"]
    }
  ],
  "networks": [
    {
      "id": "who-moves",
      "title": "Who moves the two lines",
      "explains": "Each line is filed by your entity's bank; the public side decides behind it; your lead can open bank doors.",
      "nodes": [
        {"id": "aps", "label": "Your ApS", "kind": "body", "cite": ["judgement"]},
        {"id": "gmbh", "label": "Your GmbH", "kind": "body", "cite": ["judgement"]},
        {"id": "dkb", "label": "ApS's Danish bank", "kind": "bank", "cite": ["c5"]},
        {"id": "deb", "label": "GmbH's Munich savings bank", "kind": "bank", "cite": ["w1"]},
        {"id": "eifo-n", "label": "EIFO", "kind": "institution", "cite": ["c5"]},
        {"id": "lfa-n", "label": "LfA Förderbank Bayern", "kind": "institution", "cite": ["w1"]},
        {"id": "lead", "label": "German lead fund", "kind": "body", "cite": ["judgement"]}
      ],
      "edges": [
        {"from": "dkb", "to": "aps", "kind": "funds", "cite": ["c5"]},
        {"from": "eifo-n", "to": "dkb", "kind": "advises", "label": "guarantees the tranche", "cite": ["c1"]},
        {"from": "deb", "to": "gmbh", "kind": "funds", "cite": ["w1"]},
        {"from": "lfa-n", "to": "deb", "kind": "advises", "label": "takes 60% of the risk", "cite": ["w1"]},
        {"from": "lead", "to": "deb", "kind": "works_with", "label": "possible introduction", "cite": ["judgement"]}
      ],
      "cite": ["c1", "w1"]
    }
  ],
  "process": [
    {
      "id": "equity-vs-line",
      "title": "Why a line beats equity for the project gap",
      "caption": "A line revolves; equity is spent once and diluted forever.",
      "nodes": [
        {"id": "line", "label": "Guaranteed bank line", "kind": "bank"},
        {"id": "eifo-n", "label": "EIFO (up to 80% of loss)", "kind": "institution"},
        {"id": "client", "label": "You (ApS)", "kind": "client"},
        {"id": "project", "label": "Project (4-9 months)", "kind": "asset"},
        {"id": "customer", "label": "Customer pays at go-live", "kind": "customer"}
      ],
      "edges": [
        {"from": "eifo-n", "to": "line", "label": "covers most of the loss", "kind": "risk"},
        {"from": "line", "to": "client", "label": "draw per project", "kind": "money"},
        {"from": "client", "to": "project", "label": "pre-finance", "kind": "money"},
        {"from": "customer", "to": "client", "label": "payment", "kind": "money"},
        {"from": "client", "to": "line", "label": "repay, redraw", "kind": "money"}
      ],
      "cite": ["c1", "judgement"]
    }
  ],
  "process_maps": [
    {
      "id": "eifo-line",
      "title": "How the Danish tranche with EIFO cover gets done",
      "explains": "Your bank grants new credit and asks EIFO to guarantee part of the loss; you pay EIFO's premium.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "aps", "name": "Your ApS (CFO)", "side": "market"},
        {"id": "dkbank", "name": "The ApS's Danish bank", "side": "market"},
        {"id": "eifo", "name": "EIFO", "side": "public-capital"}
      ],
      "steps": [
        {"id": "pack", "label": "CFO prepares forecast, project list, accounts", "kind": "document", "actor": "aps", "timing": "2-4 weeks", "cite": ["judgement"], "gates": [{"label": "Positive equity, creditworthy", "cite": ["c2"]}, {"label": "Group at most 749 employees", "cite": ["c6"]}, {"label": "Not listed on a main exchange", "cite": ["c9"]}]},
        {"id": "bank-line", "label": "Bank sizes a new tranche and asks for EIFO cover", "kind": "step", "actor": "dkbank", "cite": ["c5", "judgement"], "gates": [{"label": "New credit: expands the bank's commitment", "cite": ["c9"]}, {"label": "Facility from DKK 2M", "cite": ["c8"]}]},
        {"id": "eifo-decide", "label": "EIFO guarantees up to 80% of the loss", "kind": "decision", "actor": "eifo", "cite": ["c1"], "gates": [{"label": "Capped at 50% of the bank's total loss on you", "cite": ["c1"]}]},
        {"id": "live", "label": "Tranche live; premium 0.8-6.3% p.a.; up to 3 years", "kind": "step", "actor": "aps", "cite": ["c3", "c4"]}
      ],
      "flow": [{"from": "pack", "to": "bank-line"}, {"from": "bank-line", "to": "eifo-decide", "label": "cover request"}, {"from": "eifo-decide", "to": "live"}],
      "leverage": [
        {"id": "door-rm", "at": "dkbank", "kind": "door_opener", "label": "Your relationship manager", "why": "The bank files; EIFO decides on the bank's case.", "how": "CEO email sent; CFO briefs with cash-cycle numbers.", "side": "market", "cite": ["c5", "judgement"]},
        {"id": "block-equity", "at": "pack", "kind": "blocker", "label": "Negative equity today", "why": "EIFO requires positive equity.", "how": "File just after the round closes.", "side": "public-capital", "cite": ["c2"]},
        {"id": "pp-guarantees", "at": "bank-line", "kind": "pressure_point", "label": "Reprice and ease personal guarantees", "why": "Public cover lowers the bank's risk.", "how": "Raise it in the meeting alongside the new tranche.", "side": "market", "cite": ["c1", "unverified"]}
      ],
      "cite": ["c1", "c2", "c9"]
    },
    {
      "id": "lfa-decision",
      "title": "How the GmbH gets the Bavarian line",
      "explains": "The GmbH applies at its bank before costs start; LfA takes 60% of the risk.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "gmbh", "name": "Your GmbH (Munich)", "side": "market"},
        {"id": "hausbank", "name": "The GmbH's Munich savings bank", "side": "market"},
        {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital"}
      ],
      "steps": [
        {"id": "apply", "label": "GmbH applies at its bank", "kind": "document", "actor": "gmbh", "timing": "before the first GmbH project", "cite": ["w1"], "gates": [{"label": "Site in Bavaria", "cite": ["w1"]}, {"label": "Group turnover up to EUR 500M", "cite": ["w1"]}, {"label": "Applied before the project begins", "cite": ["w1"]}]},
        {"id": "bank-check", "label": "Bank assesses and asks for the 60% release", "kind": "step", "actor": "hausbank", "cite": ["w1"], "gates": [{"label": "Release up to EUR 4M", "cite": ["w1"]}, {"label": "Parent support likely for a young GmbH", "cite": ["judgement"]}]},
        {"id": "lfa-decide", "label": "LfA commits and takes 60% of the loss", "kind": "decision", "actor": "lfa", "cite": ["w1"]}
      ],
      "flow": [{"from": "apply", "to": "bank-check"}, {"from": "bank-check", "to": "lfa-decide", "label": "forwarded"}],
      "leverage": [
        {"id": "lfa-window", "at": "apply", "kind": "timing_window", "label": "File before the GmbH signs its first project", "why": "A started project falls outside the loan.", "how": "GmbH managing director files in step with the contracting move.", "side": "market", "cite": ["w1", "c30"]}
      ],
      "cite": ["w1"]
    }
  ],
  "stakeholders": {
    "institutions": [
      {"id": "dk-bank-inst", "name": "The ApS's Danish bank", "side": "market", "country": "DK", "units": [{"id": "dk-bank-corp", "name": "Corporate banking", "roles": [{"id": "dk-rm", "role": "Relationship manager (files the EIFO cover)", "priority": "P1", "reach": "CEO email sent", "status": "engaged", "cite": ["c5"]}, {"id": "dk-credit", "role": "Head of SME / growth credit", "priority": "P2", "reach": "Via the relationship manager", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "eifo-inst", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-lending", "name": "Bank guarantees and growth loans", "roles": [{"id": "eifo-head", "role": "Head of the guarantee and growth-loan area", "priority": "P1", "reach": "Through the bank's filing; direct only if it stalls", "status": "to_approach", "cite": ["judgement"]}, {"id": "eifo-am", "role": "Account manager for scale-ups", "priority": "P2", "reach": "EIFO's company contact page", "status": "to_approach", "cite": ["judgement"]}]}, {"id": "eifo-venture", "name": "Venture investments", "roles": [{"id": "eifo-vc", "role": "Investment director, venture", "priority": "P1", "reach": "Warm intro from the lead or a Danish investor", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "lfa-inst", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-credit", "name": "Promotional loans", "roles": [{"id": "lfa-head", "role": "Head of promotional lending", "priority": "P1", "reach": "Through the savings bank", "status": "to_approach", "cite": ["judgement"]}, {"id": "de-rm", "role": "Munich savings bank, business clients / promotional-loan desk", "priority": "P2", "reach": "Heads-up call now; file after tax sign-off", "status": "to_approach", "cite": ["w1"]}]}]},
      {"id": "by-min", "name": "Bavarian economy ministry", "side": "political", "country": "DE", "units": [{"id": "by-sme", "name": "SME finance unit", "roles": [{"id": "by-sme-head", "role": "Head of the SME-finance unit", "priority": "P2", "reach": "Only if the LfA file stalls", "status": "to_approach", "cite": ["unverified"]}]}]},
      {"id": "lead-fund", "name": "German lead investor", "side": "market", "country": "DE", "units": [{"id": "lead-partner", "name": "Deal team", "roles": [{"id": "lead-p", "role": "Partner leading the deal", "priority": "P1", "reach": "Founder, direct", "status": "engaged", "cite": ["judgement"]}]}]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 3700000, "label": "Cash tied up in projects at any time today (estimate; ~11M if pipeline lands in 2 years)"},
    "instruments": [
      {"id": "series-a", "name": "Series A (keep at 12M)", "type": "equity", "amount": 12000000, "terms": "Growth, hiring, product, and the positive equity the debt needs; dearest money for project cash", "status": "in_progress", "cite": ["c2", "judgement"]},
      {"id": "existing-line", "name": "Existing ApS working-capital line", "type": "loan", "amount": 3000000, "terms": "Project cash today; dear, with founders' personal guarantees", "status": "secured", "cite": ["judgement"]},
      {"id": "dk-line", "name": "New tranche with EIFO Guarantee (Danish bank)", "type": "guarantee_debt", "amount": 3000000, "amount_max": 4000000, "terms": "New money on top of the 3M; EIFO up to 80% of loss; premium 0.8-6.3% p.a.; lever to reprice", "status": "in_progress", "cite": ["c1", "c4", "c9"]},
      {"id": "by-line", "name": "GmbH line via Munich savings bank, LfA Universalkredit", "type": "guarantee_debt", "amount": 1100000, "amount_max": 4000000, "terms": "German project costs once the GmbH contracts; LfA takes 60% of loss", "status": "planned", "cite": ["w1", "judgement"]},
      {"id": "eifo-equity-s", "name": "EIFO co-investment in the round", "type": "public_coinvest", "terms": "Same cost as the round; eases the debt conversations", "status": "probe", "cite": ["unverified"]},
      {"id": "dk-growth", "name": "EIFO Growth Loan (fallback)", "type": "loan", "terms": "Dearer (CIBOR + 4-10%); EIFO lends half; no guarantee on the 1:1 slice", "status": "parked", "cite": ["c46", "c50"]},
      {"id": "extra-equity", "name": "Bigger round (+4M) instead of a line", "type": "equity", "amount": 4000000, "terms": "About 6 extra points of dilution at an assumed 40M pre-money; permanent", "status": "parked", "cite": ["judgement"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "now", "label": "This week", "steps": [
        {"id": "email-rm", "label": "Send expansion email to the ApS's relationship manager", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "ask-lead", "label": "Ask lead: German holding or contracting only? Which Munich bank?", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "equity-check", "label": "Check ApS equity in last accounts", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["c2"]},
        {"id": "call-de-rm", "label": "Heads-up call to the Munich savings bank", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["w1"]},
        {"id": "regina-handoff", "label": "Regina: Machinery Regulation and CE read for retrofitted sensors", "start": 0, "end": 0.5, "owner": "us", "status": "active", "cite": ["judgement"]},
        {"id": "customer-reply", "label": "Do not answer the customer on the regulation before Regina's read", "start": 0, "end": 0.5, "owner": "client", "status": "blocked", "depends_on": ["regina-handoff"], "cite": ["judgement"]}
      ]},
      {"id": "dk-track", "label": "Danish line", "steps": [
        {"id": "rm-meeting", "label": "Meeting with the relationship manager", "start": 0.5, "end": 1, "owner": "institution", "status": "planned", "depends_on": ["email-rm"], "cite": ["judgement"]},
        {"id": "dk-file", "label": "Bank files the new tranche with EIFO cover", "start": 1, "end": 2.5, "owner": "institution", "status": "planned", "depends_on": ["rm-meeting", "equity-check"], "cite": ["c1", "c9"]},
        {"id": "dk-live", "label": "Tranche live (after close if equity needs it)", "start": 4.5, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["dk-file"], "cite": ["c2"]}
      ]},
      {"id": "restructure", "label": "Contracting move and Bavarian line", "steps": [
        {"id": "tax-advice", "label": "Tax adviser on moving German contracts to the GmbH", "start": 0.25, "end": 1.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "gmbh-file", "label": "GmbH files the LfA application via the savings bank", "start": 1.5, "end": 3, "owner": "client", "status": "planned", "depends_on": ["tax-advice"], "cite": ["w1"]},
        {"id": "gmbh-sign", "label": "Do not let the GmbH sign a German project before filing", "start": 0, "end": 3, "owner": "client", "status": "blocked", "depends_on": ["gmbh-file"], "cite": ["w1", "c30"]}
      ]},
      {"id": "round", "label": "Series A", "steps": [
        {"id": "eifo-intro", "label": "Warm intro to EIFO venture team", "start": 0.25, "end": 1.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "close", "label": "Round closes", "start": 4, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["eifo-intro"], "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-close", "label": "Series A close: EIFO co-investment must be raised before", "start": 4, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]},
        {"id": "w-holding", "label": "German holding decision: German co-investment funds (seat rule to confirm)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-sme", "label": "SME status after the round (KfW route)", "start": 4.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["c28"]},
        {"id": "w-eifo-terms", "label": "EIFO product sheets renewed", "start": 13, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-lfa-terms", "label": "LfA Universalkredit conditions", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"]},
        {"id": "w-investeu", "label": "InvestEU into its successor: bank cover continues?", "start": 13, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-machinery", "label": "Machinery Regulation: Regina's read", "start": 0.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]},
        {"id": "w-lease", "label": "Lessors' payout timing (parked customer route)", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "new-credit", "kind": "deal_breaker", "severity": "high", "title": "EIFO cover only on new credit, not the existing 3M", "fix": "Ask for an expansion with a new tranche.", "cite": ["c9"]},
    {"id": "before-start", "kind": "deal_breaker", "severity": "high", "title": "German loans need the application before costs start", "fix": "File through the savings bank before the GmbH's first project.", "cite": ["w1", "c30"]},
    {"id": "positive-equity", "kind": "flag", "severity": "high", "title": "EIFO products need positive equity", "fix": "Time the Danish filing just after close if needed.", "cite": ["c2", "c47"]},
    {"id": "personal-guar", "kind": "flag", "severity": "medium", "title": "Founders' personal guarantees on the current line", "fix": "Use EIFO cover to negotiate release and repricing; confirm coexistence with the bank.", "cite": ["c1", "unverified"]},
    {"id": "tax-move", "kind": "flag", "severity": "medium", "title": "Moving contracting has tax and transfer-pricing effects", "fix": "Tax adviser before the move; never only to chase a loan.", "cite": ["judgement"]},
    {"id": "gmbh-equity", "kind": "flag", "severity": "medium", "title": "Thin GmbH balance sheet", "fix": "Capital injection or parent support from the round.", "cite": ["judgement"]},
    {"id": "sme-group", "kind": "flag", "severity": "medium", "title": "SME test counts the whole group", "fix": "Confirm after the round before the KfW route.", "cite": ["c28"]},
    {"id": "regina-machinery", "kind": "flag", "severity": "medium", "title": "Machinery Regulation and CE for retrofitted sensors (for Regina)", "fix": "Regina assesses; one agreed answer for customer, banks and lead.", "cite": ["judgement"]},
    {"id": "cost-to-customer", "kind": "flag", "severity": "medium", "title": "Shifting upfront cost to customers weakens the offer", "fix": "Leasing as a customer option only.", "cite": ["judgement"]},
    {"id": "precedent-none", "kind": "flag", "severity": "low", "title": "No published precedent for either line in your situation", "fix": "Ask each bank for comparable clients.", "cite": ["judgement"]}
  ]
}
```
