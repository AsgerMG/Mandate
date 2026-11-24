# Simulated conversation: forklift_spatial_dk_de

Case: `mandate/eval/scenarios/forklift_spatial_dk_de.yaml`. Brain: Wincent. Playbooks at f21c2ee939. 2026-11-23T23:55:25+00:00. 12 turns (script 12/12; stopped: wrapped_up; client agent called 3x).
Leave-one-out case library: 3 entries left out (forklift_mispriced_market_velocity, forklift_regulatory_flag_to_regina, forklift_risk_not_to_customer).

## Turn 1: the founder (opener, script)

> We sell forklift safety sensors. We pay everything upfront, get paid at go-live, and it kills our cash. We're also raising. Can the state help?

## Turn 1: Wincent

The gap you describe is a common one, and the state can help with it. You carry the cost of every project until the customer goes live. Private lenders price that risk badly because they can't judge your projects one by one. Public guarantees and co-lending exist to fix exactly that kind of gap (judgement). The raise matters too: some public lenders match private money, and a round that is still open is the time to ask for that (judgement).

Your message settles two things: the main need is working capital to fund projects before they pay, and the raise is live. The doors themselves depend on your structure, so three questions first:

1. **Where is the company incorporated, and in which countries do you have staff?** Each country runs its own promotional bank and guarantee schemes. Any entity with staff can open doors through its own bank.
2. **What does one project look like?** How much cash it ties up, for how many months, how many projects a year, and which bank you use. This tells us whether a public guarantee on a bank line solves the problem, and how big the line should be.
3. **The raise: how much, from whom, and when does it close?** If it is still open, a matching loan may be possible. Those usually have to be filed before the round closes (judgement).

**Safe whatever you answer:** don't sign a term sheet that limits new debt until we know whether public matching fits.

**Not yet:** don't fix the cash gap by pushing customers into leasing or prepayment. It makes your offer weaker, and it is better for the public side to carry that risk than your customers.

Start with question 1. Where are you set up, and where do your people sit?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the project cash gap and the raise",
  "stage": "qualify",
  "process": [
    {
      "id": "cash-gap",
      "title": "Where the cash goes",
      "caption": "You pay for hardware and installation up front; the customer pays at go-live. Each project ties up cash for months.",
      "nodes": [
        {"id": "supplier", "label": "Suppliers and installers", "kind": "other", "col": 0, "row": 0},
        {"id": "client", "label": "You", "kind": "client", "col": 1, "row": 0},
        {"id": "customer", "label": "Warehouse customer", "kind": "customer", "col": 2, "row": 0},
        {"id": "investors", "label": "Investors in the raise", "kind": "fund", "col": 1, "row": 1}
      ],
      "edges": [
        {"from": "client", "to": "supplier", "label": "pays up front", "kind": "money"},
        {"from": "customer", "to": "client", "label": "pays at go-live, months later", "kind": "money"},
        {"from": "investors", "to": "client", "label": "equity: dear money for working capital", "kind": "money"}
      ],
      "cite": ["judgement"]
    }
  ],
  "risks_flags": [
    {
      "id": "cash-cycle",
      "kind": "flag",
      "severity": "high",
      "title": "Each project ties up cash until go-live, so growth is capped by cash, not demand",
      "fix": "A de-risked project or working-capital line, sized from your real cash cycle (question 2).",
      "cite": ["judgement"]
    },
    {
      "id": "round-timing",
      "kind": "flag",
      "severity": "medium",
      "title": "A public matching loan may need filing before the round closes",
      "fix": "Share the round's size and close date before signing a term sheet.",
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
> A project runs €300k to €800k and takes 4 to 9 months to go live. Maybe 10 to 15 a year, rough guess. A Danish high-street bank gives us about €3M of credit at a high rate, with a personal guarantee from us founders. The GmbH banks with a savings bank in Munich.

## Turn 2: Wincent

Your answers change the picture in two ways.

**The size of the problem.** Take the middle of your ranges: a €550k project that ties up cash for about 6.5 months, 12 to 13 times a year. That keeps roughly €3.7M tied up on average, more at peak, and you have a €3M line (judgement). So the line already caps your growth. If the Series A doubles your projects, you would need around €7.5M. Spending €12M of equity on that is the most expensive way to fund it.

**Denmark is the lead door.** EIFO, the Danish state's investment fund, gives your bank a loss guarantee of up to 80% on a facility [c1]. It only covers new lending that adds to what the bank already gives you [c9], which is exactly what you need. The fee runs 0.8% to 6.3% a year [c4]. The company must have positive equity [c2]. The round fixes that if it is negative today, so time the request to land at closing. EIFO also has a working-capital guarantee tied to specific export orders, and your German contracts signed by the ApS look like exports (unverified: the product sheet has moved, so I am confirming it).

**Germany is open through your GmbH.** The Bavarian state bank, LfA, lends for working capital through your Munich savings bank. It can take 60% of the bank's risk [w1], on loans up to €7.5M [w1].

**Not yet:** don't sign the new terms with your Danish bank before EIFO has been asked.

One question decides how the work splits between the two countries. Of the cash a project ties up, how much is hardware the ApS buys and how much is GmbH payroll and installation? And is the ApS's equity positive today?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the project cash gap and the raise",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "dk-field",
      "title": "Denmark: who backs your Danish bank",
      "explains": "EIFO sits behind your bank: it guarantees part of the bank's loss or lends alongside it.",
      "nodes": [
        {"id": "eifo", "label": "EIFO (Danish state investment fund)", "kind": "institution", "cite": ["c5"]},
        {"id": "eifo-g", "label": "EIFO-Guarantee to your bank", "kind": "instrument", "parent": "eifo", "status": "open", "note": "Up to 80% of the loss on new lending; positive equity needed.", "cite": ["c1", "c2", "c9"]},
        {"id": "eifo-wc", "label": "EIFO Working Capital Guarantee (export orders)", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "Ties cover to specific export orders; terms to confirm.", "cite": ["unverified"]},
        {"id": "eifo-gl", "label": "EIFO Growth Loan", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "Lends 50% of the need alongside the bank; venture cases admitted.", "cite": ["c46", "c48"]},
        {"id": "dk-bank", "label": "Your Danish bank", "kind": "channel", "parent": "eifo-g", "note": "Files the guarantee request.", "cite": ["c5"]}
      ],
      "cite": ["c1", "c46"]
    },
    {
      "id": "de-field",
      "title": "Germany: what reaches the GmbH through its savings bank",
      "explains": "Promotional loans and guarantees reach the GmbH only through its own bank.",
      "nodes": [
        {"id": "sparkasse", "label": "Your Munich savings bank", "kind": "channel", "cite": ["c54"]},
        {"id": "lfa", "label": "LfA Förderbank Bayern", "kind": "regional_body", "status": "open", "cite": ["w1"]},
        {"id": "lfa-uk", "label": "Universalkredit with 60% risk relief", "kind": "instrument", "parent": "lfa", "status": "open", "note": "Working capital eligible; up to EUR 7.5M relieved.", "cite": ["w1"]},
        {"id": "bb", "label": "Bürgschaftsbank (guarantee bank)", "kind": "institution", "status": "probe", "note": "Up to 80% of a loan; EUR 1M cap per borrower.", "cite": ["c14", "c16"]},
        {"id": "kfw", "label": "KfW / ERP SME loan", "kind": "institution", "status": "probe", "note": "Through the bank, applied for before the project starts.", "cite": ["c30", "c37"]}
      ],
      "cite": ["w1", "c14", "c30"]
    }
  ],
  "process": [
    {
      "id": "cash-gap",
      "title": "Where the cash goes",
      "caption": "About EUR 3.7M tied up on average at today's pace against a EUR 3M line (judgement, from your ranges).",
      "nodes": [
        {"id": "supplier", "label": "Suppliers and installers", "kind": "other", "col": 0, "row": 0},
        {"id": "client", "label": "ApS (signs) and GmbH (installs)", "kind": "client", "col": 1, "row": 0},
        {"id": "customer", "label": "Warehouse customer", "kind": "customer", "col": 2, "row": 0},
        {"id": "bank", "label": "Danish bank, EUR 3M, personal guarantee", "kind": "bank", "col": 1, "row": 1}
      ],
      "edges": [
        {"from": "client", "to": "supplier", "label": "EUR 300-800k up front", "kind": "money"},
        {"from": "customer", "to": "client", "label": "pays at go-live, 4-9 months", "kind": "money"},
        {"from": "bank", "to": "client", "label": "a dear line, capped", "kind": "money"}
      ],
      "cite": ["judgement"]
    }
  ],
  "risks_flags": [
    {"id": "cash-cycle", "kind": "flag", "severity": "high", "title": "The line is at capacity at today's pace; the Series A plan roughly doubles the need", "fix": "A bank line enlarged under public cover, sized at about EUR 7.5M (to confirm with your numbers).", "cite": ["judgement"]},
    {"id": "equity", "kind": "flag", "severity": "medium", "title": "EIFO requires positive equity and creditworthiness", "fix": "Time the EIFO request to land with the Series A close.", "cite": ["c2"]},
    {"id": "dk-bank-first", "kind": "flag", "severity": "medium", "title": "Renegotiating the Danish line before EIFO is in the room", "fix": "Ask the bank to file for EIFO cover as part of the new line.", "cite": ["c9", "judgement"]},
    {"id": "round-timing", "kind": "flag", "severity": "medium", "title": "Series A closes in about four months", "fix": "Start the public conversations now so they finish together with the round.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [c1], [c2], [c4], [c5], [c9]: EIFO-Guarantee product sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (sha256 c3f998cb12f6)
- [c46], [c48]: EIFO Growth Loan product sheet 2026, https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf (sha256 6dfac0993cfe)
- [c14], [c16]: German guarantee banks' association FAQ, https://www.vdb-info.de/de/ueber-uns/nutzliche-infos/faq/ (sha256 30ddc2628aa5)
- [c30], [c37]: KfW ERP SME loan sheet, kfw.de (sha256 31b2116df386)
- [c54]: LfA Universalkredit page (sha256 53c9bc96566b)
- [w1]: LfA Universalkredit, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php, retrieved 2026-11-24: "Betriebsmittel"; "Haftungsfreistellung „Haftung Plus“ jedoch 60 % des Kreditrisikos abnehmen"; "Der Kredithöchstbetrag haftungsfreigestellter Universalkredite liegt bei 7,5 Mio. EUR"
- EIFO Working Capital Guarantee sheet, https://www.eifo.dk/media/zkbhobmw/eifo_working-capital-guarantee-product-sheet.pdf: found by search, returned 404 when fetched today, so it is not used as evidence yet.

## Turn 3: the founder (options, script)

> OK, that is the picture. What are our options, broadly?

## Turn 3: Wincent

There are five groups of options. The board shows every door and its status.

1. **Make the Danish bank line bigger and cheaper.** EIFO takes up to 80% of your bank's loss on new lending [c1]. A bank that carries only 20% of the risk has every reason to lend more. That also strengthens your case for dropping the personal guarantees (judgement). This is the cheapest money for project cash, because it moves risk to the state instead of selling equity.
2. **An EIFO loan beside the bank.** EIFO lends 50% of the need alongside your bank, including to venture cases that are not yet profitable [c46][c48]. It costs CIBOR plus 4% to 10% [c50], so it is dearer than a guaranteed bank line. You can't combine it with EIFO's guarantee on the same 1:1 co-financing [c46].
3. **Through the GmbH in Munich.** LfA lends for working capital through your savings bank and takes 60% of its risk [w1]. This route carries the GmbH's own costs: payroll and installation.
4. **Into the Series A.** EIFO also invests equity beside private leads. Its register lists Danish robotics and hardware companies (register record), but I have no award amounts or terms on record.
5. **On the customer side, as a complement only.** German accident insurers pay premiums for person-detection systems on construction machines [w2]. Whether that covers forklifts is unverified. If it does, it helps you sell. It does not fix your own cash gap.

**What I'm handing to Regina:** person-detection safety devices are a category with their own conformity procedure under the new EU Machinery Regulation [c60]. Funders will ask how you are certified. Regina owns that question.

Which way do you lean: keep it all in Denmark, or split the work so the GmbH carries its own share?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the project cash gap and the raise",
  "stage": "options",
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "investeu-bank", "name": "EU guarantee cover on your banks' SME lending", "institution": "EIF via partner banks", "via": "your Danish bank or savings bank, if they hold it", "status": "probe", "why": "Reaches you only through a bank that has signed it; which of yours have is unknown.", "cite": ["unverified"]},
        {"id": "eic", "name": "EU innovation grant and equity programme", "institution": "European Innovation Council", "status": "park", "why": "Pays for development risk, not project cash for a product already selling.", "cite": ["judgement"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on the bank line", "institution": "EIFO", "via": "your Danish bank", "status": "open", "why": "Up to 80% of the bank's loss on new lending; positive equity needed.", "conditions": ["Positive equity, creditworthy", "Must expand the bank's commitment", "Group under 749 staff"], "cite": ["c1", "c2", "c6", "c9"]},
        {"id": "eifo-wc", "name": "EIFO Working Capital Guarantee (export orders)", "institution": "EIFO", "via": "your Danish bank", "status": "probe", "why": "Fits German orders signed by the ApS; terms to confirm.", "cite": ["unverified"]},
        {"id": "eifo-gl", "name": "EIFO Growth Loan", "institution": "EIFO", "status": "probe", "why": "50% of the need beside the bank; CIBOR + 4-10%; dearer than a guaranteed line.", "cite": ["c46", "c50"]},
        {"id": "eifo-eq", "name": "EIFO co-investment in the Series A", "institution": "EIFO", "via": "your lead investor", "status": "probe", "why": "Invests beside private leads; robotics and hardware in its register.", "cite": ["register record"]},
        {"id": "eifo-match", "name": "EIFO Match Loan", "institution": "EIFO", "status": "shut", "why": "Early-stage only, under about DKK 3M revenue; you are past that.", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "regional", "label": "Germany / Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-uk", "name": "LfA Universalkredit with 60% risk relief", "institution": "LfA Förderbank Bayern", "via": "your Munich savings bank", "status": "open", "why": "Working capital eligible; LfA takes 60% of the bank's risk, up to EUR 7.5M.", "cite": ["w1", "c54"]},
        {"id": "bb", "name": "Guarantee bank cover", "institution": "Bürgschaftsbank Bayern", "via": "your savings bank", "status": "probe", "why": "Up to 80% of a loan, capped at EUR 1M per borrower; for firms short of collateral.", "cite": ["c14", "c16", "c11"]},
        {"id": "kfw-erp", "name": "KfW / ERP SME loan", "institution": "KfW", "via": "your savings bank", "status": "probe", "why": "Through the bank, filed before the project starts.", "cite": ["c30", "c37"]},
        {"id": "hermes", "name": "German export credit cover", "institution": "Federal export guarantees", "status": "shut", "why": "Covers exports from Germany; the GmbH sells locally.", "cite": ["judgement"]},
        {"id": "fzul", "name": "Research allowance", "institution": "BSFZ and tax office", "status": "park", "why": "Only if the GmbH does R&D; today it sells and installs.", "cite": ["c27", "judgement"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Customer side", "doors": [
        {"id": "dguv-prem", "name": "Accident insurers' safety premiums", "institution": "German statutory accident insurers", "status": "probe", "why": "Exist for person detection on construction machines; forklifts unconfirmed.", "cite": ["w2", "unverified"]},
        {"id": "buyer-fin", "name": "EIFO buyer financing", "institution": "EIFO", "status": "park", "why": "Moves the cost onto your customers; it does not fix your own cash gap.", "cite": ["judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 7500000, "label": "Project cash tied up if the Series A doubles projects (from your ranges)"},
    "instruments": [
      {"id": "series-a", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Carries team, product and growth; the dearest money to tie up in project cash.", "status": "in_progress", "cite": ["judgement"]},
      {"id": "dk-line", "name": "Danish bank line, enlarged with EIFO cover", "type": "guarantee_debt", "amount": 3000000, "amount_max": 6000000, "terms": "Carries hardware and project cash; cheap because EIFO takes up to 80% of the loss; fee 0.8-6.3% a year.", "status": "probe", "cite": ["c1", "c4", "judgement"]},
      {"id": "lfa", "name": "LfA loan through the savings bank", "type": "guarantee_debt", "amount": 1000000, "amount_max": 2500000, "terms": "Carries GmbH payroll and installation; LfA takes 60% of the bank's risk.", "status": "probe", "cite": ["w1", "judgement"]},
      {"id": "eifo-gl", "name": "EIFO Growth Loan", "type": "loan", "terms": "Half the need beside the bank; CIBOR + 4-10%, dearer than guaranteed bank debt; no guarantee on the same 1:1 deal.", "status": "probe", "cite": ["c46", "c50"]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-bank", "name": "Guarantees and bank partnerships", "roles": [
        {"id": "eifo-p1", "role": "Head of SME guarantees and loans", "priority": "P1", "reach": "Through your bank's corporate adviser, who files the request", "status": "to_approach", "cite": ["c5", "judgement"]},
        {"id": "eifo-p2", "role": "Your Danish bank's corporate relationship manager", "priority": "P2", "reach": "Direct; asks EIFO for the cover", "status": "to_approach", "cite": ["judgement"]}
      ]}, {"id": "eifo-vc", "name": "Venture investments", "roles": [
        {"id": "eifo-eq-p1", "role": "Investment director, industrial and deep tech", "priority": "P1", "reach": "Introduced by your Series A lead", "status": "to_approach", "cite": ["judgement"]},
        {"id": "eifo-eq-p2", "role": "Your Series A lead partner", "priority": "P2", "reach": "Direct", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-credit", "name": "Promotional loans and risk relief", "roles": [
        {"id": "lfa-p1", "role": "Head of promotional loans and risk relief", "priority": "P1", "reach": "Through the savings bank; LfA's adviser line for questions", "status": "to_approach", "cite": ["c54", "judgement"]},
        {"id": "lfa-p2", "role": "Savings bank corporate adviser for the GmbH", "priority": "P2", "reach": "Direct; files the application", "status": "to_approach", "cite": ["c54"]}
      ]}]},
      {"id": "by-min", "name": "Bavarian Ministry of Economic Affairs", "side": "political", "country": "DE", "units": [{"id": "by-min-u", "name": "Unit for SME finance", "roles": [
        {"id": "by-min-p2", "role": "Head of the SME finance unit", "priority": "P2", "reach": "Only if the bank route stalls", "status": "to_approach", "cite": ["unverified"]}
      ]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "dk", "label": "Denmark", "steps": [
        {"id": "dk-bank-talk", "label": "Ask the Danish bank to size a larger line with EIFO cover", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["c9"]},
        {"id": "dk-no-sign", "label": "Do not sign new bank terms before EIFO is asked", "start": 0, "end": 1, "owner": "client", "status": "blocked", "cite": ["judgement"]}
      ]},
      {"id": "raise", "label": "Series A", "steps": [
        {"id": "close", "label": "Series A close", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-mr", "label": "Machinery Regulation applies; person-detection devices certified? (Regina)", "start": "2027-01-20", "milestone": true, "owner": "us", "status": "planned", "cite": ["c59", "c60"]},
        {"id": "w-wc", "label": "EIFO Working Capital Guarantee: confirm current terms", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-prem", "label": "Accident insurers' premium lists for 2027: forklift person detection included?", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "machinery", "kind": "flag", "severity": "medium", "title": "Person-detection devices have their own conformity procedure under the Machinery Regulation", "fix": "Handed to Regina: confirm your certification path before funders ask.", "cite": ["c60", "c61"]},
    {"id": "no-stack", "kind": "flag", "severity": "low", "title": "EIFO's growth loan and guarantee cannot sit on the same 1:1 co-financing", "fix": "Choose one per facility.", "cite": ["c46"]},
    {"id": "precedent", "kind": "flag", "severity": "low", "title": "No guarantee precedent on record for EIFO or LfA in your situation", "fix": "Ask each bank for a comparable deal they have already filed.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [c1], [c2], [c4], [c5], [c6], [c9]: EIFO-Guarantee sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (sha256 c3f998cb12f6)
- [c46], [c48], [c50]: EIFO Growth Loan sheet 2026, https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf (sha256 6dfac0993cfe)
- [c11], [c14], [c16]: VDB FAQ, https://www.vdb-info.de/de/ueber-uns/nutzliche-infos/faq/ (sha256 30ddc2628aa5)
- [c27]: BSFZ procedure page (sha256 3b719cd54c79); [c30], [c37]: KfW ERP SME loan sheet (sha256 31b2116df386); [c54]: LfA Universalkredit (sha256 53c9bc96566b)
- [c59]: Machinery Directive 2006/42/EC, EUR-Lex (sha256 2803376db18b); [c60], [c61]: Machinery Regulation (EU) 2023/1230, EUR-Lex (sha256 d9f3d8c7eb94)
- [w1]: https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php, retrieved 2026-11-24: "Haftungsfreistellung „Haftung Plus“ jedoch 60 % des Kreditrisikos abnehmen"; "Der Kredithöchstbetrag haftungsfreigestellter Universalkredite liegt bei 7,5 Mio. EUR"
- [w2]: BG BAU, https://www.bgbau.de/fileadmin/Produkte/Arbeitsschutzpraemie/Kamerabasierte_Personenerkennungsysteme_Anforderungen.pdf, retrieved 2026-11-24 (via search): camera-based person detection under its safety premiums, for mobile construction machines.
- Register record: EIFO investments list, https://eifo.dk/for-dig-som-er/fond-eller-investor/investering-i-virksomheder

## Turn 4: the founder (pushback, script)

> Our investors say: just raise a bigger round and stop messing about with banks. Why not put more equity in?

## Turn 4: Wincent

Your investors are right about one thing: don't chase every route. They are wrong about using equity for project cash.

**Why not equity.** Your project cash pays itself back at every go-live. Money that comes back on a known date is what debt is for (judgement). Here is an example with assumed numbers. Say the round prices at €40M pre-money:
- Raising €12M gives investors about 23%.
- Raising €19.5M to cover the extra €7.5M of project cash gives them about 33%.

So you would give up roughly 10 points of the company for good. A €6M guaranteed line might cost interest plus an EIFO fee of 0.8% to 6.3% a year on the guaranteed part [c4]. That is a few hundred thousand a year, and it ends when the line is repaid (judgement). If you exit at €300M, those 10 points are worth about €30M. Send me the real pre-money and I will redo the numbers.

**The round helps the banks.** EIFO needs positive equity [c2], and a fresh Series A gives you that. So the round is what makes the cheap debt possible. Run them together.

**My shortlist:**
1. **EIFO cover on your Danish line.** Lowest effort, because your bank files it. It is the biggest lever, and it gives you a case for dropping the personal guarantees (judgement).
2. **LfA through the savings bank**, for the GmbH's own payroll and installation costs [w1].
3. **A one-email ask to your lead** about whether EIFO would co-invest in the round (judgement).

Everything else is parked.

Can you take this to your investors as "equity for growth, guaranteed debt for project cash"? If they still say no, tell me what they are worried about.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the project cash gap and the raise",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Equity for growth, guaranteed debt for project cash: project cash comes back at every go-live.",
      "Lead: EIFO cover on an enlarged Danish bank line, timed to the Series A close.",
      "Second: LfA's 60% risk relief through the Munich savings bank for the GmbH's own costs.",
      "Probe: ask the lead whether EIFO co-invests in the round."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type on the cited sheets; amounts depend on your real cash cycle and the banks' appetite.",
    "open_question": "Of the cash a project ties up, how much is ApS hardware and how much GmbH payroll and installation?",
    "cite": ["c1", "c2", "c9", "w1", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on the bank line", "institution": "EIFO", "via": "your Danish bank", "status": "open", "why": "Lead route: largest lever, least effort; the bank files.", "cite": ["c1", "c9"]},
        {"id": "eifo-eq", "name": "EIFO co-investment in the Series A", "institution": "EIFO", "via": "your lead investor", "status": "probe", "why": "One email from the lead; no change to the round's timing.", "cite": ["register record", "judgement"]},
        {"id": "eifo-gl", "name": "EIFO Growth Loan", "institution": "EIFO", "status": "park", "why": "Dearer than a guaranteed line; fallback if the bank will not expand.", "cite": ["c50", "judgement"]},
        {"id": "eifo-wc", "name": "EIFO Working Capital Guarantee (export orders)", "institution": "EIFO", "status": "probe", "why": "Ask the bank in the same conversation; terms unconfirmed.", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "regional", "label": "Germany / Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-uk", "name": "LfA Universalkredit with 60% risk relief", "institution": "LfA Förderbank Bayern", "via": "your Munich savings bank", "status": "open", "why": "Second route: carries the GmbH's payroll and installation.", "cite": ["w1", "c54"]},
        {"id": "bb", "name": "Guarantee bank cover", "institution": "Bürgschaftsbank Bayern", "status": "park", "why": "EUR 1M cap; LfA's relief is larger for the same bank conversation.", "cite": ["c16", "w1"]},
        {"id": "kfw-erp", "name": "KfW / ERP SME loan", "institution": "KfW", "status": "park", "why": "Same bank, less risk relief for working capital.", "cite": ["judgement"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Customer side", "doors": [
        {"id": "dguv-prem", "name": "Accident insurers' safety premiums", "institution": "German statutory accident insurers", "status": "park", "why": "A sales aid, not your financing; confirm forklift coverage later.", "cite": ["w2", "unverified"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 7500000, "label": "Project cash tied up if the Series A doubles projects (from your ranges)"},
    "instruments": [
      {"id": "series-a", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Carries team, product and growth. Adding EUR 7.5M for project cash costs about 10 points of dilution at an assumed EUR 40M pre-money.", "status": "in_progress", "cite": ["judgement"]},
      {"id": "dk-line", "name": "Danish bank line, enlarged with EIFO cover", "type": "guarantee_debt", "amount": 3000000, "amount_max": 6000000, "terms": "Carries hardware and project cash; self-liquidating at go-live; EIFO fee 0.8-6.3% a year on the guaranteed share.", "status": "probe", "cite": ["c1", "c4", "judgement"]},
      {"id": "lfa", "name": "LfA loan through the savings bank", "type": "guarantee_debt", "amount": 1000000, "amount_max": 2500000, "terms": "Carries GmbH payroll and installation; LfA takes 60% of the bank's risk.", "status": "probe", "cite": ["w1", "judgement"]}
    ]
  },
  "risks_flags": [
    {"id": "equity-for-wc", "kind": "flag", "severity": "high", "title": "Funding project cash with equity costs about 10 points of dilution for good", "fix": "Equity for growth, guaranteed debt for project cash; share the real pre-money to firm up the figure.", "cite": ["judgement"]},
    {"id": "pg", "kind": "flag", "severity": "medium", "title": "Founders' personal guarantees stay on the current line", "fix": "Ask the bank to release them as part of the EIFO-covered line.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [c1], [c2], [c4], [c9]: EIFO-Guarantee sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (sha256 c3f998cb12f6)
- [c16]: VDB FAQ (sha256 30ddc2628aa5); [c50]: EIFO Growth Loan sheet (sha256 6dfac0993cfe); [c54]: LfA Universalkredit (sha256 53c9bc96566b)
- [w1]: LfA Universalkredit page, retrieved 2026-11-24: "Haftungsfreistellung „Haftung Plus“ jedoch 60 % des Kreditrisikos abnehmen"
- [w2]: BG BAU person-detection premium sheet, retrieved 2026-11-24.

## Turn 5: the founder (answer, client_agent)

> Yeah, I can pitch it that way, and the dilution maths will help. The lead is still in talks so nothing's locked in. I don't have a firm pre-money yet, I'll send it once we have a number.

## Turn 5: Wincent

Good. Then the plan writes itself around the close.

**The way in: start with your Danish bank, not EIFO.** EIFO's cover is filed by the bank. The bank also decides whether to lend more, and the guarantee only covers lending that adds to what it gives you today [c9][c5]. So start in your bank's corporate department, not with EIFO directly.

The ask: a line of about €6M sized to your project pipeline, with an EIFO guarantee, and your personal guarantees released. Make it conditional on the Series A closing, because EIFO needs positive equity [c2]. The process map on the board shows each step and what it needs to pass.

**In parallel in Munich.** Ask the GmbH's savings bank for an LfA working-capital loan with the 60% risk relief [w1]. The application goes through the bank [c54]. Get it filed before the next German project starts. KfW's rule bars funding for projects already begun [c29], and LfA likely works the same way (unverified).

**One thing to settle with the lead now:** make sure the term sheet allows a working-capital facility of this size. A debt limit there would block the whole plan (judgement).

**What to expect:**
- A few weeks for the bank's indicative view.
- EIFO after that. I have no published decision time, so allow 4 to 8 weeks (unverified).
- Signing at or just after the close.

I'd put the odds as good if the balance sheet is positive after the close (judgement).

Shall I draft the note to your Danish bank's corporate adviser?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the project cash gap and the raise",
  "stage": "advise",
  "answer": {
    "lines": [
      "Equity for growth, guaranteed debt for project cash.",
      "Lead: an enlarged Danish line with EIFO cover, approved conditional on the Series A close.",
      "Parallel: LfA's 60% risk relief through the Munich savings bank, filed before the next German project starts.",
      "Now: keep room for a working-capital facility in the term sheet."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type on the cited sheets; the size depends on your real cash cycle and the banks' appetite.",
    "open_question": "Of the cash a project ties up, how much is ApS hardware and how much GmbH payroll and installation?",
    "cite": ["c1", "c2", "c9", "w1", "judgement"]
  },
  "process_maps": [
    {
      "id": "eifo-decision",
      "title": "How the EIFO-covered line gets decided",
      "explains": "Your bank decides the line and files for EIFO's cover; EIFO takes up to 80% of the loss on the new lending.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "client", "name": "ApS (CEO and CFO)", "side": "market"},
        {"id": "bank", "name": "Danish bank, corporate department", "side": "market"},
        {"id": "eifo", "name": "EIFO, guarantees", "side": "public-capital"}
      ],
      "steps": [
        {"id": "ask", "label": "Ask for an enlarged line with EIFO cover, conditional on the close", "kind": "document", "actor": "client", "timing": "this month", "cite": ["judgement"], "gates": [
          {"label": "Pipeline and cash-cycle figures ready (projects, sizes, months)", "cite": ["judgement"]},
          {"label": "Term sheet leaves room for the facility", "cite": ["judgement"]}
        ]},
        {"id": "bank-credit", "label": "Bank credit view: how much more, with cover", "kind": "decision", "actor": "bank", "timing": "a few weeks", "cite": ["unverified"], "gates": [
          {"label": "Financing expands the bank's commitment", "cite": ["c9"]},
          {"label": "Facility at least DKK 2M", "cite": ["c8"]}
        ]},
        {"id": "file", "label": "Bank files the guarantee request with EIFO", "kind": "step", "actor": "bank", "cite": ["c5", "unverified"], "gates": [
          {"label": "Positive equity and creditworthy", "cite": ["c2"]},
          {"label": "Group under 749 staff, not listed", "cite": ["c6", "c9"]}
        ]},
        {"id": "eifo-decide", "label": "EIFO sets cover and premium from the rating", "kind": "decision", "actor": "eifo", "timing": "allow 4-8 weeks", "cite": ["c1", "c4", "unverified"], "gates": [
          {"label": "Up to 80% of the loss, at most 50% of the bank's total loss on you", "cite": ["c1"]},
          {"label": "Premium about 0.8-6.3% a year", "cite": ["c4"]}
        ]},
        {"id": "sign", "label": "Line signed, personal guarantees released", "kind": "step", "actor": "bank", "timing": "at the Series A close", "cite": ["judgement"], "gates": [
          {"label": "Series A closed, equity positive", "cite": ["c2"]}
        ]}
      ],
      "flow": [
        {"from": "ask", "to": "bank-credit"},
        {"from": "bank-credit", "to": "file", "label": "yes, with cover"},
        {"from": "file", "to": "eifo-decide"},
        {"from": "eifo-decide", "to": "sign", "label": "offer accepted"}
      ],
      "leverage": [
        {"id": "lv-rm", "at": "bank", "kind": "door_opener", "label": "Your relationship manager, armed with the term sheet", "why": "A live Series A is the strongest signal the bank can get.", "how": "CEO and CFO meet the manager with the lead's term sheet and the pipeline.", "side": "market", "cite": ["judgement"]},
        {"id": "lv-close", "at": "sign", "kind": "timing_window", "label": "The Series A close", "why": "Fresh equity meets EIFO's equity test and lifts the rating, which lowers the premium.", "how": "Make the line conditional on the close; do not sign before.", "side": "public-capital", "cite": ["c2", "c4"]},
        {"id": "lv-pg", "at": "sign", "kind": "pressure_point", "label": "The personal guarantees", "why": "With 80% public cover, the bank needs less from you.", "how": "Make the release part of the ask from the first meeting.", "side": "market", "cite": ["c1", "judgement"]}
      ],
      "cite": ["c1", "c2", "c5", "c9"]
    },
    {
      "id": "lfa-decision",
      "title": "How the LfA loan reaches the GmbH",
      "explains": "The savings bank applies and pays out; LfA takes 60% of its risk.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "gmbh", "name": "GmbH, Munich", "side": "market"},
        {"id": "spk", "name": "Munich savings bank", "side": "market"},
        {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital"}
      ],
      "steps": [
        {"id": "l-apply", "label": "Apply at the savings bank", "kind": "step", "actor": "gmbh", "timing": "before the next German project starts", "cite": ["c54"], "gates": [
          {"label": "Turnover up to EUR 500M", "cite": ["c53"]},
          {"label": "Working capital is an eligible use", "cite": ["w1"]},
          {"label": "Filed before the project starts", "cite": ["unverified"]}
        ]},
        {"id": "l-rate", "label": "Bank sets the rate from credit standing and collateral", "kind": "decision", "actor": "spk", "cite": ["c55"]},
        {"id": "l-relief", "label": "LfA takes 60% of the bank's risk", "kind": "decision", "actor": "lfa", "cite": ["w1", "c56"], "gates": [
          {"label": "Relieved loans up to EUR 7.5M", "cite": ["w1"]}
        ]}
      ],
      "flow": [{"from": "l-apply", "to": "l-rate"}, {"from": "l-rate", "to": "l-relief"}],
      "leverage": [
        {"id": "lv-spk", "at": "spk", "kind": "door_opener", "label": "The savings bank's corporate adviser", "why": "The bank carries only 40% of the risk with the relief, so it can say yes to a young GmbH.", "how": "GmbH managing director asks for LfA's 60% relief explicitly.", "side": "market", "cite": ["w1", "judgement"]}
      ],
      "cite": ["c54", "w1"]
    }
  ],
  "stakeholders": {
    "institutions": [
      {"id": "dk-bank", "name": "Your Danish bank", "side": "market", "country": "DK", "units": [{"id": "dk-corp", "name": "Corporate banking", "roles": [
        {"id": "dk-p1", "role": "Head of corporate credit for your segment", "priority": "P1", "reach": "Through the relationship manager", "status": "to_approach", "cite": ["judgement"]},
        {"id": "dk-p2", "role": "Your relationship manager", "priority": "P2", "reach": "Direct", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [{"id": "eifo-bank", "name": "Guarantees and bank partnerships", "roles": [
        {"id": "eifo-p1", "role": "Head of SME guarantees and loans", "priority": "P1", "reach": "Through your bank's filing; directly only if it stalls", "status": "to_approach", "cite": ["c5", "judgement"]}
      ]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "dk", "label": "Denmark: enlarged line with EIFO cover", "steps": [
        {"id": "ts-room", "label": "Confirm the term sheet allows a working-capital facility", "start": 0, "end": 0.5, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "dk-bank-talk", "label": "Meet the relationship manager: about EUR 6M line, EIFO cover, release personal guarantees", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "depends_on": ["ts-room"], "cite": ["c9"]},
        {"id": "dk-file", "label": "Bank files with EIFO, conditional on the close", "start": 1.5, "end": 3, "owner": "institution", "status": "planned", "depends_on": ["dk-bank-talk"], "cite": ["c5"]},
        {"id": "dk-no-sign", "label": "Do not sign new bank terms without EIFO's cover in them", "start": 0, "end": 4, "owner": "client", "status": "blocked", "cite": ["judgement"]},
        {"id": "dk-signed", "label": "Line signed at close", "start": 4, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["dk-file", "close"], "cite": ["c2"]}
      ]},
      {"id": "de", "label": "Germany: LfA through the savings bank", "steps": [
        {"id": "de-ask", "label": "Ask the savings bank for an LfA loan with 60% relief", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "cite": ["w1", "c54"]},
        {"id": "de-file", "label": "File before the next German project starts", "start": 1.5, "end": 2.5, "owner": "institution", "status": "planned", "depends_on": ["de-ask"], "cite": ["unverified"]}
      ]},
      {"id": "raise", "label": "Series A", "steps": [
        {"id": "eq-ask", "label": "Ask the lead whether EIFO co-invests", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "close", "label": "Series A close", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-mr", "label": "Machinery Regulation applies: certification of person detection (Regina)", "start": "2027-01-20", "milestone": true, "owner": "us", "status": "planned", "cite": ["c59", "c60"]},
        {"id": "w-wc", "label": "EIFO Working Capital Guarantee: confirm terms with the bank", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-gl", "label": "EIFO Growth Loan: fallback if the bank will not expand", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["c48"]},
        {"id": "w-bb", "label": "Bürgschaftsbank and KfW: parked behind LfA", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["c16", "c30"]},
        {"id": "w-prem", "label": "Accident insurers' premium lists 2027: forklift person detection?", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "ts-debt", "kind": "deal_breaker", "severity": "high", "title": "A debt limit in the term sheet would block the facility", "fix": "Agree with the lead now that a working-capital line of this size is allowed.", "cite": ["judgement"]},
    {"id": "start-first", "kind": "flag", "severity": "medium", "title": "Projects started before filing may not be financed", "fix": "File the LfA request before the next German project starts.", "cite": ["c29", "unverified"]}
  ]
}
```

**Sources**
- [c1], [c2], [c4], [c5], [c6], [c8], [c9]: EIFO-Guarantee sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (sha256 c3f998cb12f6)
- [c16]: VDB FAQ (sha256 30ddc2628aa5); [c29], [c30]: KfW ERP SME loan sheet (sha256 31b2116df386); [c48]: EIFO Growth Loan sheet (sha256 6dfac0993cfe)
- [c53]–[c56]: LfA Universalkredit, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php (sha256 53c9bc96566b)
- [c59], [c60]: Machinery Directive and Regulation, EUR-Lex
- [w1]: LfA Universalkredit page, retrieved 2026-11-24: "Betriebsmittel"; "60 % des Kreditrisikos abnehmen"; "Kredithöchstbetrag haftungsfreigestellter Universalkredite liegt bei 7,5 Mio. EUR"

## Turn 6: the founder (answer, if_asked)

> A Danish bank for the ApS and a savings bank in Munich for the GmbH. About 3 million working-capital line, expensive, and we gave personal guarantees.

## Turn 6: Wincent

That matches what I have, so the plan stands. One detail changes how you make the ask, though.

**EIFO covers only new money.** The guarantee applies to financing that adds to the bank's existing commitment [c9]. Your current €3M line stays as it is: same price, same personal guarantees. Two ways to put it to the bank:
- **Option A:** keep the €3M and add a new tranche of about €3M with EIFO cover. This is simpler and certainly within the rule.
- **Option B:** replace the whole line with one larger facility of about €6M, re-priced, with your personal guarantees released. This is the better outcome, but whether EIFO covers a facility that includes the old amount is unverified. Ask the bank to check it with EIFO.

I would open with option B and settle for option A (judgement). The personal guarantees belong on the table either way. With up to 80% public cover on the new money [c1], the bank's case for holding your personal assets is weaker (judgement).

**For the savings bank,** ask the adviser one thing: has it passed on LfA loans with the 60% risk relief before [w1]? A bank that does this regularly will move much faster (judgement).

Two things are still open before I size the asks properly:
1. How much of a project's cash is ApS hardware, and how much is GmbH payroll and installation?
2. Shall I draft the note to your Danish relationship manager now?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the project cash gap and the raise",
  "stage": "advise",
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 7500000, "label": "Project cash tied up if the Series A doubles projects (from your ranges)"},
    "instruments": [
      {"id": "dk-line-old", "name": "Existing Danish line (EUR 3M, personal guarantees)", "type": "loan", "amount": 3000000, "terms": "Carries project cash today; dear and personally guaranteed; not covered by EIFO as it stands.", "status": "secured", "cite": ["c9", "judgement"]},
      {"id": "dk-line", "name": "New tranche with EIFO cover (option A) or a re-priced EUR 6M facility (option B)", "type": "guarantee_debt", "amount": 3000000, "amount_max": 6000000, "terms": "Carries hardware and project cash; cheaper because EIFO takes up to 80% of the loss on new money; fee 0.8-6.3% a year.", "status": "probe", "cite": ["c1", "c4", "c9"]}
    ]
  },
  "risks_flags": [
    {"id": "new-money-only", "kind": "flag", "severity": "medium", "title": "EIFO covers only lending that expands the bank's commitment", "fix": "Ask for a new covered tranche; ask the bank to check with EIFO whether a re-priced combined facility qualifies.", "cite": ["c9", "unverified"]},
    {"id": "pg", "kind": "flag", "severity": "medium", "title": "Founders' personal guarantees stay on the existing EUR 3M line", "fix": "Put their release in the first ask; fall back to no personal guarantee on the new tranche.", "cite": ["judgement"]}
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "de", "label": "Germany: LfA through the savings bank", "steps": [
        {"id": "de-ask", "label": "Ask the savings bank for an LfA loan with 60% relief, and whether it has done one before", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "cite": ["w1"]}
      ]}
    ]
  }
}
```

**Sources**
- [c1], [c4], [c9]: EIFO-Guarantee sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (sha256 c3f998cb12f6)
- [w1]: LfA Universalkredit page, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php, retrieved 2026-11-24: "60 % des Kreditrisikos abnehmen"

## Turn 7: the founder (pushback, script)

> Or couldn't we get the customers to lease the kit, so it's off our balance sheet altogether?

## Turn 7: Wincent

Leasing can be a useful option for customers who prefer to pay monthly. As the answer to your cash gap, I would push back, for three reasons.

1. **It probably doesn't close the gap.** A leasing company buys the kit when the customer signs the acceptance, and for you that is go-live (judgement). You would still carry the 4 to 9 months of installation. The lessor just replaces the customer as the one who pays at the end.
2. **It makes your offer dearer.** The lessor adds its margin and runs its own credit check on your customer, so the price goes up and the sale takes longer (judgement). You'd be passing your financing cost to the buyer, and it is better for the public side to carry that risk than your customer.
3. **It is a weaker story for the banks.** A pipeline of projects you deliver and get paid for is exactly what an EIFO-covered line is built to fund [c1]. If you hand the receivable to a lessor, that pipeline and its margin go with it (judgement).

**Where leasing does fit:** as a choice you offer customers who want to pay monthly, through a partner lessor, once your own line is in place (judgement). EIFO has a leasing guarantee for export buyers [c?]. Its terms are not on the sheet I have, so that is unverified. I've parked it as a sales aid.

**What actually shortens the gap:** billing at milestones, for example a share at delivery and the rest at go-live. That is a commercial term, not public money, but each point you bill earlier frees up the line (judgement).

Could your customers accept a deposit or milestone billing?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the project cash gap and the raise",
  "stage": "advise",
  "routes": {
    "levels": [
      {"id": "cust", "level": "customer", "label": "Customer side", "doors": [
        {"id": "lease-partner", "name": "Leasing through a partner lessor", "institution": "Commercial lessor", "status": "park", "why": "Lessor pays at acceptance (go-live), so the gap stays; it makes the offer dearer. Offer it later as a customer choice.", "cite": ["judgement"]},
        {"id": "eifo-lease", "name": "EIFO Operational Leasing Guarantee", "institution": "EIFO", "status": "park", "why": "Listed under EIFO buyer financing; terms not on the sheet. A sales aid, not your financing.", "cite": ["unverified"]},
        {"id": "milestones", "name": "Milestone billing (deposit, delivery, go-live)", "institution": "Your customers", "status": "probe", "why": "Each point billed earlier frees the line; commercial, not public money.", "cite": ["judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "lease-not-fix", "kind": "flag", "severity": "medium", "title": "Customer leasing moves the cost to buyers and likely leaves the installation gap in place", "fix": "Keep your own EIFO-covered line as the answer; offer leasing as an option once it is in place.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [c1]: EIFO-Guarantee sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (sha256 c3f998cb12f6)

## Turn 8: the founder (answer, client_agent)

> Honestly, not sure. "Pay only once it runs" is a big part of why customers say yes, so I don't want to give that up. Maybe a couple of the bigger customers would take milestone billing, but we've never asked.

## Turn 8: Wincent

First, a correction. In my last reply I wrote "[c?]" next to EIFO's leasing guarantee. That was a broken citation. The fact comes from my own database and is not grounded in an official source, so treat it as unverified.

**Keep "pay only once it runs."** It is your edge in sales, and it is also your best argument to the banks. You carry a risk your customers won't, and private lenders price it high because they can't judge each project (judgement). Public cover exists for exactly that kind of gap. So the pitch to your bank and EIFO becomes: "our model wins customers because we take the go-live risk; your cover lets us keep doing it at scale" (judgement). The public side carries the risk, and the customer keeps the offer that makes them say yes.

**Milestone billing as a test, not a policy.** Ask two of your bigger customers. Offer it as an option, for example a small price advantage for paying part at delivery. Every euro billed early is a euro off the line (judgement). If they say no, nothing changes. If they say yes, the line you need gets smaller.

Your decisions so far:
- Equity for growth, guaranteed debt for project cash.
- Lead route: the Danish bank with EIFO cover.
- In parallel: LfA through the Munich savings bank.
- Keep go-live payment; test milestone billing with two customers.

Shall I write this up as a brief, with the note to your Danish relationship manager? I'll mark the ApS/GmbH cost split as open, since it decides how big the LfA ask should be.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the project cash gap and the raise",
  "stage": "advise",
  "answer": {
    "lines": [
      "Keep 'pay only once it runs': it wins customers, and it is the risk public cover is built to carry.",
      "Lead: an enlarged Danish line with EIFO cover, conditional on the Series A close.",
      "Parallel: LfA's 60% risk relief through the Munich savings bank for GmbH costs.",
      "Test milestone billing with two larger customers; nothing depends on it."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type on the cited sheets; size depends on your cash cycle and the banks' appetite.",
    "open_question": "How much of a project's cash is ApS hardware versus GmbH payroll and installation?",
    "cite": ["c1", "c9", "w1", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "cust", "level": "customer", "label": "Customer side", "doors": [
        {"id": "milestones", "name": "Milestone billing, tested with two larger customers", "institution": "Your customers", "status": "probe", "why": "Optional for the customer; every euro billed early comes off the line.", "cite": ["judgement"]},
        {"id": "eifo-lease", "name": "EIFO Operational Leasing Guarantee", "institution": "EIFO", "status": "park", "why": "From our database only, not an official source; a sales aid, not your financing.", "cite": ["unverified"]}
      ]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "commercial", "label": "Commercial", "steps": [
        {"id": "ms-test", "label": "Offer milestone billing as an option to two larger customers", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "golive-edge", "kind": "flag", "severity": "low", "title": "Go-live payment is a sales edge that drives the cash gap", "fix": "Keep it; position it to the bank and EIFO as the risk their cover is for.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [c1], [c9]: EIFO-Guarantee sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (sha256 c3f998cb12f6)
- [w1]: LfA Universalkredit page, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php, retrieved 2026-11-24

## Turn 9: the founder (fact_change, script)

> Update: our lead is probably a German fund now, and they want contracting moved into the GmbH. Does that change things?

## Turn 9: Wincent

Yes, it changes things. Most of the change is good, but the order of steps matters more now.

**What changes.** If the GmbH signs the contracts, the project cash sits in Germany. The Munich savings bank becomes your main door. LfA's 60% risk relief, on loans up to €7.5M [w1], fits a need of about €6M to €7.5M. Danish EIFO cover moves to a supporting role. It only covers new lending to the ApS [c9], so it is worth keeping only for whatever the ApS still carries, such as hardware stock (judgement). The German guarantee bank is too small to lead, with a €1M cap per borrower [c16].

**Something new for the round: Bavaria's public co-investor.** Bayern Kapital invests alongside private investors, euro for euro, from €250k to €50M [w3]. But "the main parts of these … innovation projects must be carried out in Bavaria" [w3]. That tests where your product and R&D work happens, not where your sales happen.

**Order of steps.** Don't move contracting until the savings bank has approved an LfA-backed line. Otherwise the GmbH carries the projects with no line, and your Danish bank may shrink the one you have (judgement). The first contract the GmbH signs should come after that filing (unverified for LfA; the comparable KfW rule bars funding for projects already started [c29]). Get a tax adviser on transfer pricing before you move anything (judgement).

Two questions decide the rest:
1. Will the round go into the ApS, or will you set up a new German parent above it? That decides whether EIFO or Bayern Kapital can co-invest.
2. Where do your product and R&D people sit?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the project cash gap and the raise",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "With contracting in the GmbH, the lead is the Munich savings bank with LfA's 60% risk relief.",
      "EIFO cover stays only for what the ApS still carries.",
      "Bayern Kapital may co-invest euro for euro if the innovation work is in Bavaria.",
      "Sequence: German line approved before contracts move."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type on the cited pages; depends on the round's entity and where R&D sits.",
    "open_question": "Does the round go into the ApS or a new German parent, and where do the product and R&D people sit?",
    "cite": ["w1", "w3", "c9", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "de", "level": "regional", "label": "Germany / Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-uk", "name": "LfA Universalkredit with 60% risk relief", "institution": "LfA Förderbank Bayern", "via": "your Munich savings bank", "status": "open", "why": "Now the lead: carries project cash once the GmbH contracts; up to EUR 7.5M relieved.", "conditions": ["Working capital eligible", "Applied for and paid out at the house bank", "Filed before the first GmbH-signed project (to confirm)"], "cite": ["w1", "c54", "unverified"]},
        {"id": "bk", "name": "Bayern Kapital co-investment", "institution": "Bayern Kapital", "via": "alongside your German lead", "status": "probe", "why": "Pari passu, EUR 250k-50M; main innovation work must be in Bavaria.", "cite": ["w3"]},
        {"id": "bb", "name": "Guarantee bank cover", "institution": "Bürgschaftsbank Bayern", "status": "park", "why": "EUR 1M cap per borrower; too small to lead.", "cite": ["c16"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on the bank line", "institution": "EIFO", "via": "your Danish bank", "status": "probe", "why": "Covers new lending to the ApS only; size shrinks to what the ApS still carries.", "cite": ["c9", "judgement"]},
        {"id": "eifo-eq", "name": "EIFO co-investment in the round", "institution": "EIFO", "status": "probe", "why": "Depends on the round staying in the Danish ApS.", "cite": ["unverified"]},
        {"id": "eifo-wc", "name": "EIFO Working Capital Guarantee (export orders)", "institution": "EIFO", "status": "park", "why": "German orders would no longer be signed by the ApS.", "cite": ["judgement"]}
      ]}
    ]
  },
  "networks": [
    {
      "id": "round-ties",
      "title": "Who could sit around the round",
      "explains": "The German lead decides; the public co-investors follow the lead and test the company's location.",
      "nodes": [
        {"id": "lead", "label": "German lead fund", "kind": "body", "cite": ["judgement"]},
        {"id": "bk", "label": "Bayern Kapital", "kind": "institution", "cite": ["w3"]},
        {"id": "lfa", "label": "LfA Förderbank Bayern", "kind": "bank", "cite": ["w1"]},
        {"id": "eifo", "label": "EIFO", "kind": "institution", "cite": ["c5"]},
        {"id": "co", "label": "Your company (ApS, GmbH)", "kind": "body", "cite": ["judgement"]}
      ],
      "edges": [
        {"from": "lead", "to": "co", "kind": "funds", "label": "Series A lead", "cite": ["judgement"]},
        {"from": "bk", "to": "co", "kind": "funds", "label": "pari passu, if innovation in Bavaria", "cite": ["w3"]},
        {"from": "lfa", "to": "bk", "kind": "oversees", "label": "parent (to confirm)", "cite": ["unverified"]},
        {"from": "eifo", "to": "co", "kind": "funds", "label": "if the round stays in the ApS", "cite": ["unverified"]}
      ],
      "cite": ["w3", "unverified"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "de", "label": "Germany: LfA through the savings bank (now the lead)", "steps": [
        {"id": "de-ask", "label": "Ask the savings bank for an LfA-relieved line sized to the pipeline", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["w1", "c54"]},
        {"id": "de-approve", "label": "Line approved, conditional on the close", "start": 3, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["de-ask"], "cite": ["judgement"]},
        {"id": "move-contracts", "label": "Do not move contracting into the GmbH before the German line is approved", "start": 0, "end": 3, "owner": "client", "status": "blocked", "depends_on": ["de-approve"], "cite": ["judgement"]},
        {"id": "tp", "label": "Tax adviser: transfer pricing for the move", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "raise", "label": "Series A", "steps": [
        {"id": "bk-ask", "label": "Ask the German lead to bring in Bayern Kapital", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "cite": ["w3"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "move-gap", "kind": "deal_breaker", "severity": "high", "title": "Moving contracting before the German line is in place leaves the GmbH with project cash and no line", "fix": "Get the savings bank's LfA-backed approval first; then move contracts.", "cite": ["judgement"]},
    {"id": "bk-test", "kind": "flag", "severity": "medium", "title": "Bayern Kapital needs the main innovation work in Bavaria", "fix": "Confirm where product and R&D sit before raising it with the lead.", "cite": ["w3"]},
    {"id": "dk-line-unwind", "kind": "flag", "severity": "medium", "title": "The Danish line and personal guarantees sit on the ApS", "fix": "Agree with the Danish bank what stays in the ApS before you tell it about the move.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [c5], [c9]: EIFO-Guarantee sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (sha256 c3f998cb12f6)
- [c16]: VDB FAQ (sha256 30ddc2628aa5); [c29]: KfW ERP SME loan sheet (sha256 31b2116df386); [c54]: LfA Universalkredit (sha256 53c9bc96566b)
- [w1]: LfA Universalkredit page, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php, retrieved 2026-11-24: "60 % des Kreditrisikos abnehmen"; "Kredithöchstbetrag haftungsfreigestellter Universalkredite liegt bei 7,5 Mio. EUR"
- [w3]: Bayern Kapital, investment approach, https://bayernkapital.de/en/bayern-kapital/investment-approach/, retrieved 2026-11-24: "We invest according to the pari-passu principle"; "ticket sizes ranging from EUR 250,000 to EUR 50 million"; "The main parts of these start-up/scale-up innovation projects must be carried out in Bavaria."

## Turn 10: the founder (prioritise, script)

> Which two or three should we actually go for, and what will each cost us in time and effort?

## Turn 10: Wincent

Go for these three. Everything else stays parked.

**1. The LfA-backed line through your Munich savings bank (the lead).**
- **What it carries:** project cash once the GmbH signs the contracts. LfA takes 60% of the bank's risk, on loans up to €7.5M [w1].
- **Time:** apply now so approval lands with the close, about 3 months, running alongside the round (judgement).
- **Effort:** moderate. The work is a pipeline and cash-cycle model, the GmbH's figures and the term sheet, and two or three bank meetings. Expect 5 to 8 days of your CFO's time (judgement).
- **Cost:** the bank sets the rate from your credit standing and collateral [c55]. It should be well below today's line, because the bank keeps only 40% of the risk (judgement).
- **Precedent:** none close in my records. The nearest is an LfA award to a Bavarian industrial firm, but it is a different instrument (register record). Ask the bank for a comparable deal it has done.

**2. One public co-investor in the round, not both.**
- **Which one:** Bayern Kapital if your innovation work is in Bavaria [w3], or EIFO if the round stays in the ApS (unverified).
- **Effort:** low for you, because the lead runs it.
- **Cost in time:** possibly 4 to 8 extra weeks of checks, which is a risk to a four-month close (judgement). Start now or drop it.
- **Pari passu** means the private side must put in at least as much as the public investor does [w3].
- **Precedent:** none found for Bayern Kapital. Ask for its portfolio list.

**3. A transition deal with your Danish bank.**
- **Effort:** low, one or two meetings.
- **What it does:** it protects the €3M line during the move, puts a date on releasing your personal guarantees, and keeps EIFO cover available for whatever the ApS still carries [c9].

The milestone-billing test runs on the side at no cost.

I still need two answers to choose between Bayern Kapital and EIFO: which entity takes the investment, and where your R&D people sit.

```mandate-board
{
  "title": "Forklift safety sensors: public money for the project cash gap and the raise",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "1. LfA-backed line through the Munich savings bank: the lead, for project cash in the GmbH.",
      "2. One public co-investor in the round: Bayern Kapital or EIFO, decided by the round's entity and where R&D sits.",
      "3. A transition deal with the Danish bank: protect the line, set a date to release the personal guarantees."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type on the cited pages; no close precedent found for either main route.",
    "open_question": "Which entity takes the Series A, and where do the product and R&D people sit?",
    "cite": ["w1", "w3", "c9", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "de", "level": "regional", "label": "Germany / Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-uk", "name": "LfA Universalkredit with 60% risk relief", "institution": "LfA Förderbank Bayern", "via": "your Munich savings bank", "status": "open", "why": "Priority 1: about 3 months, 5-8 CFO days; rate set by the bank on 40% retained risk.", "cite": ["w1", "c55", "judgement"]},
        {"id": "bk", "name": "Bayern Kapital co-investment", "institution": "Bayern Kapital", "via": "your German lead", "status": "probe", "why": "Priority 2 if innovation work is in Bavaria; lead does the work; may add 4-8 weeks.", "cite": ["w3", "judgement"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-eq", "name": "EIFO co-investment in the round", "institution": "EIFO", "status": "probe", "why": "Priority 2 instead of Bayern Kapital if the round stays in the ApS.", "cite": ["unverified"]},
        {"id": "eifo-g", "name": "EIFO-Guarantee on the bank line", "institution": "EIFO", "via": "your Danish bank", "status": "probe", "why": "Priority 3: within the transition deal, for what the ApS still carries.", "cite": ["c9"]},
        {"id": "eifo-gl", "name": "EIFO Growth Loan", "institution": "EIFO", "status": "park", "why": "Dearer; fallback only.", "cite": ["c50"]}
      ]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "spk", "name": "Munich savings bank", "side": "market", "country": "DE", "units": [{"id": "spk-corp", "name": "Corporate clients and promotional loans", "roles": [
        {"id": "spk-p1", "role": "Head of corporate clients (Firmenkunden)", "priority": "P1", "reach": "Through the GmbH's adviser, with the term sheet", "status": "to_approach", "cite": ["judgement"]},
        {"id": "spk-p2", "role": "GmbH's corporate adviser, promotional loans", "priority": "P2", "reach": "Direct", "status": "to_approach", "cite": ["c54"]}
      ]}]},
      {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-credit", "name": "Promotional loans and risk relief", "roles": [
        {"id": "lfa-p1", "role": "Head of promotional loans and risk relief", "priority": "P1", "reach": "Through the savings bank's filing; LfA's adviser line if it stalls", "status": "to_approach", "cite": ["c54", "judgement"]}
      ]}]},
      {"id": "bk", "name": "Bayern Kapital", "side": "public-capital", "country": "DE", "units": [{"id": "bk-inv", "name": "Investment team, industrial and deep tech", "roles": [
        {"id": "bk-p1", "role": "Investment manager for industrial technology", "priority": "P1", "reach": "Introduced by the German lead", "status": "to_approach", "cite": ["w3", "judgement"]},
        {"id": "bk-p2", "role": "Lead partner at the German fund", "priority": "P2", "reach": "Direct", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "by-min", "name": "Bavarian Ministry of Economic Affairs", "side": "political", "country": "DE", "units": [{"id": "by-min-u", "name": "SME finance and start-up policy", "roles": [
        {"id": "by-min-p2", "role": "Head of the SME finance unit", "priority": "P2", "reach": "Only if a bank route stalls", "status": "to_approach", "cite": ["unverified"]}
      ]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "dk-trans", "label": "Denmark: transition deal", "steps": [
        {"id": "dk-trans-talk", "label": "Agree what stays in the ApS, a date to release personal guarantees, EIFO cover for the rest", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "cite": ["c9", "judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-bk-prec", "label": "Bayern Kapital portfolio: a comparable hardware deal?", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "close-delay", "kind": "flag", "severity": "medium", "title": "A public co-investor can slow a four-month close", "fix": "Raise it with the lead this month; drop it if it would push the close.", "cite": ["judgement"]},
    {"id": "no-prec", "kind": "flag", "severity": "low", "title": "No close precedent found for the LfA line or Bayern Kapital", "fix": "Ask the savings bank and Bayern Kapital for comparable deals.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [c9]: EIFO-Guarantee sheet 2026 (sha256 c3f998cb12f6); [c50]: EIFO Growth Loan sheet (sha256 6dfac0993cfe)
- [c54], [c55]: LfA Universalkredit, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php (sha256 53c9bc96566b)
- [w1]: same LfA page, retrieved 2026-11-24: "60 % des Kreditrisikos abnehmen"; "Kredithöchstbetrag haftungsfreigestellter Universalkredite liegt bei 7,5 Mio. EUR"
- [w3]: Bayern Kapital, https://bayernkapital.de/en/bayern-kapital/investment-approach/, retrieved 2026-11-24: "pari-passu principle"; "The main parts of these start-up/scale-up innovation projects must be carried out in Bavaria."
- Register record: LfA award to Haidl Fenster und Türen GmbH, EUR 562,235, 2025, https://competition-cases.ec.europa.eu/cases/SA.121739

## Turn 11: the founder (who_to_call, script)

> Who do I call first, on the Danish side and at the banks, by role? And draft me the email.

## Turn 11: Wincent

Call in this order. Every contact is by role, because I don't have verified names.

**This week**
1. **Your German lead partner.** Confirm two things: the term sheet allows a working-capital line of about €6M to €7.5M, and which entity takes the round. Everything below depends on those answers (judgement).
2. **The GmbH's corporate adviser at the savings bank.** This adviser files the LfA application [c54]. Ask for a meeting with the head of corporate clients there. That person can approve a line of this size; the adviser alone probably can't (judgement).

**Next week**
3. **Your Danish relationship manager**, then the head of corporate credit for your segment. This is the transition deal: what stays in the ApS, when the personal guarantees are released, and EIFO cover on the remainder. EIFO's guarantee is applied for by the bank, so you don't call EIFO yourself [c5]. Its head of SME guarantees is a fallback contact only if the bank stalls (judgement).
4. **EIFO's venture team**, only if the round stays in the ApS. The introduction should come from your lead (judgement).

There is no political call on either side. Both routes run through banks, and nothing is blocked that a ministry would need to unblock (judgement).

Here is the draft for the savings bank. It is in German, because that is the local business language. Fill in the brackets, and send it only after the call with your lead.

---

**Betreff:** [Firma] GmbH – Betriebsmittellinie für Projektgeschäft, Termin erbeten

Sehr geehrte/r Frau/Herr [Name],

die [Firma] GmbH in München installiert Sicherheitssensorik für Gabelstapler in Lagern und Werken der bayerischen Industrie. Acht Mitarbeiter in Vertrieb und Montage, Tendenz steigend.

Wir schließen in den kommenden Monaten eine Series A über 12 Mio. EUR mit einem deutschen Lead-Investor ab. Ab dann soll die GmbH das Projektgeschäft selbst kontrahieren. Unsere Kunden zahlen bei Inbetriebnahme. Jedes Projekt bindet 0,3 bis 0,8 Mio. EUR für vier bis neun Monate.

Dafür möchten wir mit Ihnen eine Betriebsmittellinie von rund [X] Mio. EUR aufbauen, nach Möglichkeit als LfA-Universalkredit mit Haftungsfreistellung „HaftungPlus“.

Ich würde gern in den nächsten zwei Wochen einen Termin mit Ihnen und der Leitung Firmenkunden vereinbaren. Pipeline, Zahlen und Term Sheet bringen wir mit.

Mit freundlichen Grüßen
[Name], Geschäftsführer, [Firma] GmbH, [Telefon]

---

*In short:* who you are in Munich, the round, why the cash is tied up, the specific ask (an LfA line with risk relief), and a meeting with the head of corporate clients. Eligibility details come later.

Shall I draft the note to your Danish relationship manager next?

```mandate-board
{
  "title": "Forklift safety sensors: public money for the project cash gap and the raise",
  "stage": "advise",
  "stakeholders": {
    "institutions": [
      {"id": "lead-fund", "name": "German lead fund", "side": "market", "country": "DE", "units": [{"id": "lead-team", "name": "Deal team", "roles": [
        {"id": "lead-p1", "role": "Lead partner on your round", "priority": "P1", "reach": "Call 1, this week: debt room in the term sheet; which entity takes the round", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "spk", "name": "Munich savings bank", "side": "market", "country": "DE", "units": [{"id": "spk-corp", "name": "Corporate clients and promotional loans", "roles": [
        {"id": "spk-p2", "role": "GmbH's corporate adviser, promotional loans", "priority": "P2", "reach": "Call 2, this week: e-mail drafted; files the LfA application", "status": "to_approach", "cite": ["c54"]},
        {"id": "spk-p1", "role": "Head of corporate clients (Firmenkunden)", "priority": "P1", "reach": "Joins the first meeting at the adviser's invitation", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "dk-bank", "name": "Your Danish bank", "side": "market", "country": "DK", "units": [{"id": "dk-corp", "name": "Corporate banking", "roles": [
        {"id": "dk-p2", "role": "Your relationship manager", "priority": "P2", "reach": "Call 3, next week: transition deal", "status": "to_approach", "cite": ["judgement"]},
        {"id": "dk-p1", "role": "Head of corporate credit for your segment", "priority": "P1", "reach": "Through the relationship manager", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [
        {"id": "eifo-bank", "name": "Guarantees and bank partnerships", "roles": [
          {"id": "eifo-p1", "role": "Head of SME guarantees and loans", "priority": "P1", "reach": "Through the Danish bank's filing; direct only if it stalls", "status": "to_approach", "cite": ["c5", "judgement"]}
        ]},
        {"id": "eifo-vc", "name": "Venture investments", "roles": [
          {"id": "eifo-eq-p1", "role": "Investment director, industrial and deep tech", "priority": "P1", "reach": "Call 4, only if the round stays in the ApS; introduced by the lead", "status": "to_approach", "cite": ["unverified"]}
        ]}
      ]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "this-week", "label": "This week", "steps": [
        {"id": "call-lead", "label": "Call the lead: debt room in the term sheet, entity for the round", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "mail-spk", "label": "Send the drafted e-mail to the savings bank adviser", "start": 0.1, "end": 0.25, "owner": "client", "status": "planned", "depends_on": ["call-lead"], "cite": ["c54"]}
      ]},
      {"id": "next-week", "label": "Next week", "steps": [
        {"id": "call-dk", "label": "Danish relationship manager: transition deal and personal guarantees", "start": 0.25, "end": 0.5, "owner": "client", "status": "planned", "depends_on": ["call-lead"], "cite": ["judgement"]}
      ]}
    ]
  }
}
```

**Sources**
- [c5]: EIFO-Guarantee sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf (sha256 c3f998cb12f6)
- [c54]: LfA Universalkredit, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php (sha256 53c9bc96566b)
- [w1]: same LfA page, retrieved 2026-11-24 (the HaftungPlus product named in the draft): "Haftungsfreistellung „HaftungPlus“ jedoch 60 % des Kreditrisikos abnehmen"

## Turn 12: the founder (brief, script)

> We are running out of time on our side. Can you write up what we have as a brief now?

## Turn 12: Wincent

# Brief: public money for the project cash gap and the Series A

*Forklift safety sensors. Danish ApS as parent, GmbH in Munich (8 staff in sales and installation). 24 November 2026.*

## 1. Answer

Use equity for growth and guaranteed bank debt for project cash. Project cash pays itself back at every go-live, so it is money for a bank, not for investors (judgement). Funding an extra €7.5M of project cash with equity would cost about 10 points of dilution for good, at an assumed €40M pre-money (judgement).

The German lead now wants the GmbH to sign the contracts. That makes the lead route an LfA-backed working-capital line through your Munich savings bank. LfA takes 60% of the bank's risk, on loans up to €7.5M [w1]. Apply now, have it approved on condition of the close, and only then move the contracting.

Alongside the round, bring in one public co-investor: Bayern Kapital or EIFO. Which one depends on the entity that takes the round and on where your R&D people sit. Keep "pay only once it runs" for your customers. It is your edge in sales, and it is exactly the risk public cover is built to carry (judgement).

## 2. Where you stand

| Front | Today |
|---|---|
| **Cash cycle** | Projects of €300k to €800k, 4 to 9 months to go-live, 10 to 15 a year. That keeps about €3.7M tied up on average against a €3M line. If the Series A doubles your projects, you need about €7.5M (judgement, from your ranges). |
| **Denmark (ApS)** | A €3M working-capital line at a high rate, with the founders' personal guarantees. EIFO's guarantee covers only new lending that adds to what the bank already gives you [c9], and it needs positive equity [c2]. It shrinks to a supporting role once the GmbH signs the contracts. |
| **Germany / Bavaria (GmbH)** | It banks with a Munich savings bank. LfA lends for working capital through the house bank and takes 60% of the risk [w1][c54]. Open. |
| **Series A** | €12M, probably with a German lead, closing in about four months, terms not yet fixed, pre-money not yet set. Bayern Kapital co-invests euro for euro, from €250k to €50M, if the main innovation work is in Bavaria [w3]. EIFO co-investment is possible if the round stays in the ApS (unverified). |
| **Customers** | They pay at go-live. Milestone billing has never been tested. |

## 3. Flags

| Flag | Severity | Fix |
|---|---|---|
| The term sheet may limit new debt | High (blocks the plan) | Agree with the lead now that a working-capital line of about €6M to €7.5M is allowed (judgement). |
| Contracting moves into the GmbH before its line is in place | High | Get the savings bank's LfA-backed approval first, then move the contracts (judgement). |
| Projects started before filing may not be financed | Medium | File with LfA before the GmbH signs its first contract (unverified for LfA; the KfW rule bars funding for projects already begun [c29]). |
| Personal guarantees stay on the Danish €3M line | Medium | Agree a release date in the transition deal with the Danish bank (judgement). |
| A public co-investor can slow a four-month close | Medium | Raise it with the lead this month; drop it if it would push the close (judgement). |
| Bayern Kapital requires the innovation work to be in Bavaria | Medium | Confirm where product and R&D sit first [w3]. |
| Transfer pricing when contracting moves | Medium | Bring in a tax adviser before the move (judgement). |
| **Regulatory, for Regina:** person-detection safety devices have their own conformity procedure under the Machinery Regulation, which applies from 20 January 2027 [c60][c61][c59] | Medium | Regina to confirm your certification path before funders ask. |

## 4. Decisions

1. **Equity or debt for project cash?** You've decided: equity for growth, guaranteed debt for project cash. Pitch it to investors with the dilution maths, and I'll redo it once you have the pre-money.
2. **Which public co-investor?** My recommendation is Bayern Kapital if the round goes into a German entity and the innovation work is in Bavaria, and EIFO if the round stays in the ApS. Not both (judgement).
3. **Customer terms?** You've decided to keep go-live payment. Test milestone billing as an option with two larger customers. Nothing in the plan depends on it.
4. **Customer leasing?** Parked. The lessor pays at acceptance, so your installation gap stays, and the offer gets dearer for the buyer (judgement).

## 5. Actions and who to approach

| # | Who (by role) | Side | Ask | When |
|---|---|---|---|---|
| 1 | Lead partner at the German fund | Market | Room for debt in the term sheet; which entity takes the round; bring in Bayern Kapital | This week |
| 2 | The GmbH's corporate adviser at the savings bank (P2), then its head of corporate clients (P1) | Market, via public capital | An LfA-backed working-capital line of about [X] million, approved on condition of the close | This week (email drafted, annex) |
| 3 | Danish relationship manager (P2), then head of corporate credit (P1) | Market | Transition deal: what stays in the ApS, release of personal guarantees, EIFO cover on the rest [c9] | Next week |
| 4 | LfA, head of promotional loans and risk relief (P1) | Public capital | Only if the savings bank stalls; normally the bank files [c54] | Fallback |
| 5 | EIFO, head of SME guarantees and loans (P1) | Public capital | Only through the Danish bank's filing [c5] | Fallback |
| 6 | Bayern Kapital investment manager for industrial tech (P1), or EIFO's venture team, introduced by the lead (P2) | Public capital | Co-investment in the round [w3] | This month |
| 7 | Two larger customers | Market | Milestone billing as an option | This quarter |

There is no political call. Both routes run through banks, and nothing is blocked that a ministry would need to unblock. If a bank route stalls, the fallback is the SME-finance unit at the Bavarian Ministry of Economic Affairs (unverified).

## 6. Plan and what to expect

- **This week:** call the lead, then send the savings bank email.
- **Next two weeks:**
  - Meet the savings bank with your pipeline model, the GmbH's figures and the term sheet. Expect 5 to 8 days of your CFO's time over the process (judgement).
  - Run the Danish transition meeting.
  - Brief a tax adviser on transfer pricing.
- **Months 1 to 3:**
  - The savings bank forms its credit view. The rate is set from your credit standing and collateral [c55].
  - LfA takes 60% of the risk [w1].
  - The lead, not you, runs the co-investor's checks.
- **Month 4, the close:**
  - The GmbH line is signed on condition of the close.
  - Only after it is signed does contracting move into the GmbH.
  - The personal-guarantee release falls due at the date agreed with the Danish bank.
- **Do not yet:**
  - Move contracting into the GmbH.
  - Sign new Danish bank terms.
  - Spend equity on project cash.
- **Odds:** good, if equity is positive after the close and the bank sees the pipeline (judgement). There is no published decision time, so allow about 3 months for the whole line (judgement).

## 7. Watchlist

- **Machinery Regulation, applying 20 January 2027:** what certification person-detection devices need. With Regina [c59][c60].
- **Bayern Kapital:** whether its portfolio includes a comparable hardware deal. Ask in month 1.
- **EIFO Working Capital Guarantee:** parked. Its product sheet has moved and the terms are unverified. It would only matter if the ApS kept export orders.
- **EIFO Growth Loan:** parked as the fallback if the banks won't lend more. CIBOR plus 4% to 10% [c50]. It can't sit on the same 1:1 deal as EIFO's guarantee [c46].
- **Bürgschaftsbank Bayern:** parked. €1M cap per borrower [c16].
- **KfW ERP loan:** parked behind LfA [c30].
- **German accident insurers' safety premiums:** whether forklift person detection makes the 2027 lists. They already exist for construction machines [w2]; forklifts are unverified.
- **German export cover (shut)** and the **EIFO Match Loan (shut**, unverified**)**: for exports from Germany only, and for early-stage companies only.

## 8. Precedents

| Route | Closest found |
|---|---|
| LfA line through the savings bank | None close. My records hold LfA aid to a Bavarian industrial firm, but on a different instrument (register record). Ask the bank for a comparable deal. |
| Bayern Kapital co-investment | None found in my records. Ask for its portfolio. |
| EIFO co-investment | EIFO's investment list includes Danish robotics and hardware companies, such as Robotto, with no amounts given (register record). |
| EIFO guarantee | None found on record. |

## 9. Sources

- [c1], [c2], [c4], [c5], [c6], [c8], [c9]: EIFO-Guarantee product sheet 2026, https://eifo.dk/media/2o5lbzmr/dk_2-2a-_-eifo-guarantee-_produktark-2026.pdf, sha256 c3f998cb12f6
- [c46], [c48], [c50]: EIFO Growth Loan product sheet 2026, https://eifo.dk/media/4szlatuv/dk_2-2e-_-growth-loan-_produktark-2026.pdf, sha256 6dfac0993cfe
- [c11], [c14], [c16]: Verband Deutscher Bürgschaftsbanken FAQ, https://www.vdb-info.de/de/ueber-uns/nutzliche-infos/faq/, sha256 30ddc2628aa5
- [c27]: BSFZ application procedure, https://www.bescheinigung-forschungszulage.de/antragsverfahren/ueber-das-antragsverfahren, sha256 3b719cd54c79
- [c29], [c30], [c37]: KfW ERP-Förderkredit KMU sheet, kfw.de, sha256 31b2116df386
- [c53], [c54], [c55], [c56]: LfA Universalkredit, https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Universalkredit/index.php, sha256 53c9bc96566b
- [c59]: Machinery Directive 2006/42/EC, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006L0042, sha256 2803376db18b
- [c60], [c61]: Machinery Regulation (EU) 2023/1230, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1230, sha256 d9f3d8c7eb94
- [w1]: LfA Universalkredit, same URL as above, retrieved 2026-11-24: "Betriebsmittel"; "Haftungsfreistellung „Haftung Plus“ jedoch 60 % des Kreditrisikos abnehmen"; "Der Kredithöchstbetrag haftungsfreigestellter Universalkredite liegt bei 7,5 Mio. EUR"
- [w2]: BG BAU, https://www.bgbau.de/fileadmin/Produkte/Arbeitsschutzpraemie/Kamerabasierte_Personenerkennungsysteme_Anforderungen.pdf, retrieved 2026-11-24 via search: camera-based person detection is funded under its safety premiums, for mobile construction machines.
- [w3]: Bayern Kapital, https://bayernkapital.de/en/bayern-kapital/investment-approach/, retrieved 2026-11-24: "We invest according to the pari-passu principle"; "ticket sizes ranging from EUR 250,000 to EUR 50 million"; "The main parts of these start-up/scale-up innovation projects must be carried out in Bavaria."
- Register records: EIFO investments, https://eifo.dk/for-dig-som-er/fond-eller-investor/investering-i-virksomheder; LfA award to Haidl Fenster und Türen GmbH, https://competition-cases.ec.europa.eu/cases/SA.121739

## 10. Questions for you

1. **Which entity takes the Series A: the ApS or a new German parent?** This decides between EIFO and Bayern Kapital, and where the round's equity strengthens a balance sheet.
2. **Where do your product and R&D people sit?** Bayern Kapital needs the innovation work in Bavaria [w3].
3. **The pre-money, once you have it.** It firms up the dilution argument for your investors.
4. **How a project's cash splits between hardware and labour, and what stays in the ApS after the move.** This sizes the LfA ask and the Danish transition deal.
5. **Which German fund is the lead?** Its own backers and rules may explain the GmbH request and add conditions (judgement).

## Annex: savings bank email (agreed)

**Betreff:** [Firma] GmbH – Betriebsmittellinie für Projektgeschäft, Termin erbeten

Sehr geehrte/r Frau/Herr [Name],

die [Firma] GmbH in München installiert Sicherheitssensorik für Gabelstapler in Lagern und Werken der bayerischen Industrie. Acht Mitarbeiter in Vertrieb und Montage, Tendenz steigend.

Wir schließen in den kommenden Monaten eine Series A über 12 Mio. EUR mit einem deutschen Lead-Investor ab. Ab dann soll die GmbH das Projektgeschäft selbst kontrahieren. Unsere Kunden zahlen bei Inbetriebnahme. Jedes Projekt bindet 0,3 bis 0,8 Mio. EUR für vier bis neun Monate.

Dafür möchten wir mit Ihnen eine Betriebsmittellinie von rund [X] Mio. EUR aufbauen, nach Möglichkeit als LfA-Universalkredit mit Haftungsfreistellung „HaftungPlus“.

Ich würde gern in den nächsten zwei Wochen einen Termin mit Ihnen und der Leitung Firmenkunden vereinbaren. Pipeline, Zahlen und Term Sheet bringen wir mit.

Mit freundlichen Grüßen
[Name], Geschäftsführer, [Firma] GmbH, [Telefon]

```mandate-board
{
  "title": "Forklift safety sensors: public money for the project cash gap and the raise",
  "stage": "write_up",
  "answer": {
    "lines": [
      "Equity for growth, guaranteed debt for project cash: project cash comes back at every go-live.",
      "Lead: an LfA-backed working-capital line through the Munich savings bank, approved conditional on the close, before contracting moves into the GmbH.",
      "One public co-investor in the round: Bayern Kapital or EIFO, decided by the round's entity and where R&D sits.",
      "A transition deal with the Danish bank; keep go-live payment for customers."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type on the cited pages; no close precedent found; size depends on your cash cycle and the banks' appetite.",
    "open_question": "Which entity takes the Series A, and where do the product and R&D people sit?",
    "cite": ["w1", "w3", "c9", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "investeu-bank", "name": "EU guarantee cover on your banks' SME lending", "institution": "EIF via partner banks", "via": "your banks, if they hold it", "status": "probe", "why": "Reaches you only through a bank that has signed it; ask both banks.", "cite": ["unverified"]},
        {"id": "eic", "name": "EU innovation grant and equity programme", "institution": "European Innovation Council", "status": "park", "why": "Pays for development risk, not project cash.", "cite": ["judgement"]}
      ]},
      {"id": "dk", "level": "national", "label": "Denmark (ApS)", "country": "DK", "doors": [
        {"id": "eifo-g", "name": "EIFO-Guarantee on the bank line", "institution": "EIFO", "via": "your Danish bank", "status": "probe", "why": "Covers new lending to the ApS only; in the transition deal, for what the ApS still carries.", "cite": ["c1", "c9"]},
        {"id": "eifo-eq", "name": "EIFO co-investment in the round", "institution": "EIFO", "via": "your lead", "status": "probe", "why": "Second route if the round stays in the ApS.", "cite": ["unverified"]},
        {"id": "eifo-gl", "name": "EIFO Growth Loan", "institution": "EIFO", "status": "park", "why": "Fallback; CIBOR + 4-10%, dearer than guaranteed bank debt.", "cite": ["c46", "c50"]},
        {"id": "eifo-wc", "name": "EIFO Working Capital Guarantee (export orders)", "institution": "EIFO", "status": "park", "why": "German orders move to the GmbH; terms unverified.", "cite": ["unverified"]},
        {"id": "eifo-match", "name": "EIFO Match Loan", "institution": "EIFO", "status": "shut", "why": "Early-stage only, under about DKK 3M revenue.", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "regional", "label": "Germany / Bavaria (GmbH)", "country": "DE", "doors": [
        {"id": "lfa-uk", "name": "LfA Universalkredit with 60% risk relief", "institution": "LfA Förderbank Bayern", "via": "your Munich savings bank", "status": "open", "why": "Lead: working capital eligible; up to EUR 7.5M relieved.", "conditions": ["Applied for and paid out at the house bank", "Turnover up to EUR 500M", "Filed before the first GmbH-signed project (to confirm)"], "cite": ["w1", "c53", "c54", "unverified"]},
        {"id": "bk", "name": "Bayern Kapital co-investment", "institution": "Bayern Kapital", "via": "your German lead", "status": "probe", "why": "Second route if innovation work is in Bavaria; pari passu.", "cite": ["w3"]},
        {"id": "bb", "name": "Guarantee bank cover", "institution": "Bürgschaftsbank Bayern", "status": "park", "why": "EUR 1M cap per borrower.", "cite": ["c16"]},
        {"id": "kfw-erp", "name": "KfW / ERP SME loan", "institution": "KfW", "via": "your savings bank", "status": "park", "why": "Same bank, behind LfA; filed before the project starts.", "cite": ["c30"]},
        {"id": "hermes", "name": "German export credit cover", "institution": "Federal export guarantees", "status": "shut", "why": "Covers exports from Germany; the GmbH sells locally.", "cite": ["judgement"]},
        {"id": "fzul", "name": "Research allowance", "institution": "BSFZ and tax office", "status": "park", "why": "Only if the GmbH does R&D.", "cite": ["c27", "judgement"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Customer side", "doors": [
        {"id": "milestones", "name": "Milestone billing, tested with two larger customers", "institution": "Your customers", "status": "probe", "why": "Optional; every euro billed early comes off the line.", "cite": ["judgement"]},
        {"id": "lease-partner", "name": "Leasing through a partner lessor", "institution": "Commercial lessor", "status": "park", "why": "Pays at acceptance; dearer for buyers.", "cite": ["judgement"]},
        {"id": "eifo-lease", "name": "EIFO Operational Leasing Guarantee", "institution": "EIFO", "status": "park", "why": "A sales aid, not your financing.", "cite": ["unverified"]},
        {"id": "buyer-fin", "name": "EIFO buyer financing", "institution": "EIFO", "status": "park", "why": "Moves the cost onto customers.", "cite": ["judgement"]},
        {"id": "dguv-prem", "name": "Accident insurers' safety premiums", "institution": "German statutory accident insurers", "status": "park", "why": "Exist for construction machines; forklifts unconfirmed.", "cite": ["w2", "unverified"]}
      ]}
    ]
  },
  "hierarchies": [
    {
      "id": "de-field",
      "title": "Germany: what reaches the GmbH through its savings bank",
      "explains": "Promotional loans and risk relief reach the GmbH only through its own bank.",
      "nodes": [
        {"id": "sparkasse", "label": "Your Munich savings bank", "kind": "channel", "cite": ["c54"]},
        {"id": "lfa", "label": "LfA Förderbank Bayern", "kind": "regional_body", "status": "open", "cite": ["w1"]},
        {"id": "lfa-uk", "label": "Universalkredit with 60% risk relief", "kind": "instrument", "parent": "lfa", "status": "open", "note": "Working capital; up to EUR 7.5M relieved.", "cite": ["w1"]},
        {"id": "bk", "label": "Bayern Kapital", "kind": "institution", "status": "probe", "note": "Co-invests pari passu if innovation is in Bavaria.", "cite": ["w3"]},
        {"id": "bb", "label": "Bürgschaftsbank Bayern", "kind": "institution", "status": "park", "note": "EUR 1M cap per borrower.", "cite": ["c16"]},
        {"id": "kfw", "label": "KfW / ERP SME loan", "kind": "institution", "status": "park", "note": "Through the bank, before the project starts.", "cite": ["c30", "c37"]}
      ],
      "cite": ["w1", "w3", "c16", "c30"]
    },
    {
      "id": "dk-field",
      "title": "Denmark: who backs your Danish bank",
      "explains": "EIFO sits behind your bank: it guarantees part of the loss on new lending, or lends or invests alongside.",
      "nodes": [
        {"id": "eifo", "label": "EIFO", "kind": "institution", "cite": ["c5"]},
        {"id": "eifo-g", "label": "EIFO-Guarantee to your bank", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "Up to 80% of the loss on new lending.", "cite": ["c1", "c9"]},
        {"id": "eifo-gl", "label": "EIFO Growth Loan", "kind": "instrument", "parent": "eifo", "status": "park", "note": "Fallback.", "cite": ["c46"]},
        {"id": "eifo-eq", "label": "EIFO venture co-investment", "kind": "instrument", "parent": "eifo", "status": "probe", "note": "If the round stays in the ApS.", "cite": ["unverified"]},
        {"id": "dk-bank", "label": "Your Danish bank", "kind": "channel", "parent": "eifo-g", "note": "Files the guarantee request.", "cite": ["c5"]}
      ],
      "cite": ["c1", "c5", "c9"]
    }
  ],
  "networks": [
    {
      "id": "round-ties",
      "title": "Who could sit around the round",
      "explains": "The German lead decides; the public co-investors follow and test the company's location.",
      "nodes": [
        {"id": "lead", "label": "German lead fund", "kind": "body", "cite": ["judgement"]},
        {"id": "bk", "label": "Bayern Kapital", "kind": "institution", "cite": ["w3"]},
        {"id": "lfa", "label": "LfA Förderbank Bayern", "kind": "bank", "cite": ["w1"]},
        {"id": "eifo", "label": "EIFO", "kind": "institution", "cite": ["c5"]},
        {"id": "co", "label": "Your company (ApS, GmbH)", "kind": "body", "cite": ["judgement"]}
      ],
      "edges": [
        {"from": "lead", "to": "co", "kind": "funds", "label": "Series A lead", "cite": ["judgement"]},
        {"from": "bk", "to": "co", "kind": "funds", "label": "pari passu, if innovation in Bavaria", "cite": ["w3"]},
        {"from": "lfa", "to": "bk", "kind": "oversees", "label": "parent (to confirm)", "cite": ["unverified"]},
        {"from": "eifo", "to": "co", "kind": "funds", "label": "if the round stays in the ApS", "cite": ["unverified"]}
      ],
      "cite": ["w3", "unverified"]
    }
  ],
  "process": [
    {
      "id": "cash-gap",
      "title": "Where the cash goes",
      "caption": "About EUR 3.7M tied up on average today against a EUR 3M line; about EUR 7.5M if projects double (judgement, from your ranges).",
      "nodes": [
        {"id": "supplier", "label": "Suppliers and installers", "kind": "other", "col": 0, "row": 0},
        {"id": "client", "label": "GmbH (contracts after the move)", "kind": "client", "col": 1, "row": 0},
        {"id": "customer", "label": "Warehouse customer", "kind": "customer", "col": 2, "row": 0},
        {"id": "bank", "label": "Savings bank line, 60% LfA relief", "kind": "bank", "col": 1, "row": 1}
      ],
      "edges": [
        {"from": "client", "to": "supplier", "label": "EUR 300-800k up front", "kind": "money"},
        {"from": "customer", "to": "client", "label": "pays at go-live, 4-9 months", "kind": "money"},
        {"from": "bank", "to": "client", "label": "line carries the gap", "kind": "money"}
      ],
      "cite": ["w1", "judgement"]
    }
  ],
  "process_maps": [
    {
      "id": "lfa-decision",
      "title": "How the LfA-backed line reaches the GmbH",
      "explains": "The savings bank applies and pays out; LfA takes 60% of its risk.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "gmbh", "name": "GmbH, Munich", "side": "market"},
        {"id": "spk", "name": "Munich savings bank", "side": "market"},
        {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital"}
      ],
      "steps": [
        {"id": "l-apply", "label": "Apply at the savings bank", "kind": "step", "actor": "gmbh", "timing": "this month, before the first GmbH-signed project", "cite": ["c54"], "gates": [
          {"label": "Turnover up to EUR 500M", "cite": ["c53"]},
          {"label": "Working capital is an eligible use", "cite": ["w1"]},
          {"label": "Term sheet allows the facility", "cite": ["judgement"]},
          {"label": "Filed before the project starts", "cite": ["unverified"]}
        ]},
        {"id": "l-rate", "label": "Bank sets the rate from credit standing and collateral", "kind": "decision", "actor": "spk", "timing": "weeks", "cite": ["c55", "unverified"]},
        {"id": "l-relief", "label": "LfA takes 60% of the bank's risk", "kind": "decision", "actor": "lfa", "cite": ["w1", "c56"], "gates": [
          {"label": "Relieved loans up to EUR 7.5M", "cite": ["w1"]}
        ]},
        {"id": "l-sign", "label": "Line signed at the Series A close; then contracting moves", "kind": "step", "actor": "spk", "timing": "month 4", "cite": ["judgement"], "gates": [
          {"label": "Series A closed", "cite": ["judgement"]}
        ]}
      ],
      "flow": [{"from": "l-apply", "to": "l-rate"}, {"from": "l-rate", "to": "l-relief"}, {"from": "l-relief", "to": "l-sign"}],
      "leverage": [
        {"id": "lv-spk", "at": "spk", "kind": "door_opener", "label": "The savings bank's head of corporate clients", "why": "With 60% relief the bank keeps 40% of the risk, so it can say yes to a young GmbH.", "how": "The adviser invites the head to the first meeting.", "side": "market", "cite": ["w1", "judgement"]},
        {"id": "lv-close", "at": "l-sign", "kind": "timing_window", "label": "The Series A close", "why": "Fresh equity strengthens the credit view.", "how": "Make approval conditional on the close.", "side": "market", "cite": ["judgement"]}
      ],
      "cite": ["c54", "w1"]
    },
    {
      "id": "eifo-decision",
      "title": "How EIFO cover on the Danish line gets decided (transition deal)",
      "explains": "Your Danish bank decides and files; EIFO covers up to 80% of the loss on new lending.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "bank", "name": "Danish bank, corporate department", "side": "market"},
        {"id": "eifo", "name": "EIFO, guarantees", "side": "public-capital"}
      ],
      "steps": [
        {"id": "bank-credit", "label": "Bank credit view on what stays in the ApS", "kind": "decision", "actor": "bank", "cite": ["judgement"], "gates": [
          {"label": "Financing expands the bank's commitment", "cite": ["c9"]},
          {"label": "Facility at least DKK 2M", "cite": ["c8"]}
        ]},
        {"id": "file", "label": "Bank files the guarantee request with EIFO", "kind": "step", "actor": "bank", "cite": ["c5"], "gates": [
          {"label": "Positive equity and creditworthy", "cite": ["c2"]},
          {"label": "Group under 749 staff, not listed", "cite": ["c6", "c9"]}
        ]},
        {"id": "eifo-decide", "label": "EIFO sets cover and premium from the rating", "kind": "decision", "actor": "eifo", "timing": "allow 4-8 weeks", "cite": ["c1", "c4", "unverified"], "gates": [
          {"label": "Up to 80% of the loss, at most 50% of the bank's total loss on you", "cite": ["c1"]}
        ]}
      ],
      "flow": [{"from": "bank-credit", "to": "file"}, {"from": "file", "to": "eifo-decide"}],
      "leverage": [
        {"id": "lv-pg", "at": "bank", "kind": "pressure_point", "label": "The personal guarantees", "why": "With public cover the bank needs less from you.", "how": "Make a release date part of the first ask.", "side": "market", "cite": ["c1", "judgement"]}
      ],
      "cite": ["c1", "c5", "c9"]
    }
  ],
  "stakeholders": {
    "institutions": [
      {"id": "lead-fund", "name": "German lead fund", "side": "market", "country": "DE", "units": [{"id": "lead-team", "name": "Deal team", "roles": [
        {"id": "lead-p1", "role": "Lead partner on your round", "priority": "P1", "reach": "Call 1, this week", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "spk", "name": "Munich savings bank", "side": "market", "country": "DE", "units": [{"id": "spk-corp", "name": "Corporate clients and promotional loans", "roles": [
        {"id": "spk-p1", "role": "Head of corporate clients (Firmenkunden)", "priority": "P1", "reach": "Joins the first meeting at the adviser's invitation", "status": "to_approach", "cite": ["judgement"]},
        {"id": "spk-p2", "role": "GmbH's corporate adviser, promotional loans", "priority": "P2", "reach": "Call 2, this week; e-mail drafted", "status": "to_approach", "cite": ["c54"]}
      ]}]},
      {"id": "lfa", "name": "LfA Förderbank Bayern", "side": "public-capital", "country": "DE", "units": [{"id": "lfa-credit", "name": "Promotional loans and risk relief", "roles": [
        {"id": "lfa-p1", "role": "Head of promotional loans and risk relief", "priority": "P1", "reach": "Through the savings bank's filing; LfA adviser line if it stalls", "status": "to_approach", "cite": ["c54", "judgement"]},
        {"id": "lfa-p2", "role": "LfA relationship contact for savings banks", "priority": "P2", "reach": "Through the savings bank", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "bk", "name": "Bayern Kapital", "side": "public-capital", "country": "DE", "units": [{"id": "bk-inv", "name": "Investment team", "roles": [
        {"id": "bk-p1", "role": "Investment manager for industrial technology", "priority": "P1", "reach": "Introduced by the German lead", "status": "to_approach", "cite": ["w3", "judgement"]},
        {"id": "bk-p2", "role": "Lead partner at the German fund", "priority": "P2", "reach": "Direct", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "dk-bank", "name": "Your Danish bank", "side": "market", "country": "DK", "units": [{"id": "dk-corp", "name": "Corporate banking", "roles": [
        {"id": "dk-p1", "role": "Head of corporate credit for your segment", "priority": "P1", "reach": "Through the relationship manager", "status": "to_approach", "cite": ["judgement"]},
        {"id": "dk-p2", "role": "Your relationship manager", "priority": "P2", "reach": "Call 3, next week", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [
        {"id": "eifo-bank", "name": "Guarantees and bank partnerships", "roles": [
          {"id": "eifo-p1", "role": "Head of SME guarantees and loans", "priority": "P1", "reach": "Through the Danish bank's filing", "status": "to_approach", "cite": ["c5", "judgement"]},
          {"id": "eifo-p2", "role": "Your Danish relationship manager", "priority": "P2", "reach": "Files the request", "status": "to_approach", "cite": ["judgement"]}
        ]},
        {"id": "eifo-vc", "name": "Venture investments", "roles": [
          {"id": "eifo-eq-p1", "role": "Investment director, industrial and deep tech", "priority": "P1", "reach": "Only if the round stays in the ApS; introduced by the lead", "status": "to_approach", "cite": ["unverified"]}
        ]}
      ]},
      {"id": "by-min", "name": "Bavarian Ministry of Economic Affairs", "side": "political", "country": "DE", "units": [{"id": "by-min-u", "name": "SME finance unit", "roles": [
        {"id": "by-min-p2", "role": "Head of the SME finance unit", "priority": "P2", "reach": "Only if a bank route stalls", "status": "to_approach", "cite": ["unverified"]}
      ]}]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 7500000, "label": "Project cash tied up if the Series A doubles projects (from your ranges)"},
    "instruments": [
      {"id": "series-a", "name": "Series A", "type": "equity", "amount": 12000000, "terms": "Carries team, product and growth; dearest money for project cash (about 10 points more dilution for EUR 7.5M at an assumed EUR 40M pre-money).", "status": "in_progress", "cite": ["judgement"]},
      {"id": "co-invest", "name": "Bayern Kapital or EIFO co-investment", "type": "public_coinvest", "terms": "Same equity cost, enlarges the round pari passu; may add 4-8 weeks.", "status": "probe", "cite": ["w3", "judgement"]},
      {"id": "lfa", "name": "LfA-backed line through the savings bank", "type": "guarantee_debt", "amount": 6000000, "amount_max": 7500000, "terms": "Carries project cash in the GmbH; cheap because LfA takes 60% of the bank's risk; self-liquidating at go-live.", "status": "planned", "cite": ["w1", "judgement"]},
      {"id": "dk-line-old", "name": "Existing Danish line", "type": "loan", "amount": 3000000, "terms": "Carries ApS costs during the transition; dear and personally guaranteed; EIFO cover only on new lending.", "status": "secured", "cite": ["c9", "judgement"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "this-week", "label": "This week", "steps": [
        {"id": "call-lead", "label": "Call the lead: debt room in the term sheet, entity for the round, Bayern Kapital", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "mail-spk", "label": "Send the drafted e-mail to the savings bank adviser", "start": 0.1, "end": 0.25, "owner": "client", "status": "planned", "depends_on": ["call-lead"], "cite": ["c54"]}
      ]},
      {"id": "de", "label": "Germany: LfA line (lead)", "steps": [
        {"id": "de-ask", "label": "Savings bank meeting: pipeline, figures, term sheet", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "depends_on": ["mail-spk"], "cite": ["c54"]},
        {"id": "tp", "label": "Tax adviser: transfer pricing for the move", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "de-approve", "label": "Line approved, conditional on the close", "start": 3, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["de-ask"], "cite": ["w1", "judgement"]},
        {"id": "move-contracts", "label": "Do not move contracting into the GmbH before the line is approved", "start": 0, "end": 4, "owner": "client", "status": "blocked", "depends_on": ["de-approve"], "cite": ["judgement"]}
      ]},
      {"id": "dk-trans", "label": "Denmark: transition deal", "steps": [
        {"id": "call-dk", "label": "Relationship manager: what stays in the ApS, release of personal guarantees, EIFO cover", "start": 0.25, "end": 1.5, "owner": "client", "status": "planned", "depends_on": ["call-lead"], "cite": ["c9", "judgement"]},
        {"id": "dk-no-sign", "label": "Do not sign new Danish terms before the transition is agreed", "start": 0, "end": 1.5, "owner": "client", "status": "blocked", "cite": ["judgement"]}
      ]},
      {"id": "raise", "label": "Series A", "steps": [
        {"id": "co-ask", "label": "Lead brings in Bayern Kapital or EIFO", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "depends_on": ["call-lead"], "cite": ["w3"]},
        {"id": "close", "label": "Series A close; GmbH line signed; contracting moves", "start": 4, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["de-approve"], "cite": ["judgement"]}
      ]},
      {"id": "commercial", "label": "Commercial", "steps": [
        {"id": "ms-test", "label": "Offer milestone billing as an option to two larger customers", "start": 0.5, "end": 3, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-mr", "label": "Machinery Regulation applies: certification of person detection (Regina)", "start": "2027-01-20", "milestone": true, "owner": "us", "status": "planned", "cite": ["c59", "c60"]},
        {"id": "w-bk-prec", "label": "Bayern Kapital portfolio: comparable hardware deal?", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]},
        {"id": "w-wc", "label": "EIFO Working Capital Guarantee: terms, if the ApS keeps export orders", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-gl", "label": "EIFO Growth Loan: fallback if banks will not expand", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["c48"]},
        {"id": "w-bb", "label": "Bürgschaftsbank and KfW: parked behind LfA", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["c16", "c30"]},
        {"id": "w-prem", "label": "Accident insurers' 2027 premium lists: forklift person detection?", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["w2", "unverified"]},
        {"id": "w-investeu", "label": "Do either of your banks hold EU guarantee cover?", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "ts-debt", "kind": "deal_breaker", "severity": "high", "title": "A debt limit in the term sheet would block the facility", "fix": "Agree room for a EUR 6-7.5M working-capital line with the lead now.", "cite": ["judgement"]},
    {"id": "move-gap", "kind": "deal_breaker", "severity": "high", "title": "Moving contracting before the German line is in place leaves the GmbH with project cash and no line", "fix": "LfA-backed approval first, then move contracts.", "cite": ["judgement"]},
    {"id": "start-first", "kind": "flag", "severity": "medium", "title": "Projects started before filing may not be financed", "fix": "File before the first GmbH-signed project.", "cite": ["c29", "unverified"]},
    {"id": "pg", "kind": "flag", "severity": "medium", "title": "Personal guarantees stay on the Danish EUR 3M line", "fix": "Release date in the transition deal.", "cite": ["judgement"]},
    {"id": "close-delay", "kind": "flag", "severity": "medium", "title": "A public co-investor can slow a four-month close", "fix": "Raise it this month; drop it if it would push the close.", "cite": ["judgement"]},
    {"id": "bk-test", "kind": "flag", "severity": "medium", "title": "Bayern Kapital needs the main innovation work in Bavaria", "fix": "Confirm where product and R&D sit.", "cite": ["w3"]},
    {"id": "tp-risk", "kind": "flag", "severity": "medium", "title": "Transfer pricing when contracting moves", "fix": "Tax adviser before the move.", "cite": ["judgement"]},
    {"id": "machinery", "kind": "flag", "severity": "medium", "title": "Person-detection devices have their own conformity procedure under the Machinery Regulation", "fix": "Handed to Regina: confirm the certification path.", "cite": ["c60", "c61"]},
    {"id": "equity-for-wc", "kind": "flag", "severity": "medium", "title": "Funding project cash with equity costs about 10 points of dilution", "fix": "Equity for growth, guaranteed debt for project cash; redo with the real pre-money.", "cite": ["judgement"]},
    {"id": "no-prec", "kind": "flag", "severity": "low", "title": "No close precedent found for the LfA line or Bayern Kapital", "fix": "Ask the savings bank and Bayern Kapital for comparable deals.", "cite": ["judgement"]}
  ]
}
```
