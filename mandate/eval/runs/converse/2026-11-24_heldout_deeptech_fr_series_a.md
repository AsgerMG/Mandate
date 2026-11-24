# Simulated conversation: heldout_deeptech_fr_series_a

Case: `mandate/eval/scenarios/heldout_deeptech_fr_series_a.yaml`. Brain: Wincent. Playbooks at b2ee7e052b. 2026-11-24T13:46:42+00:00. 12 turns (script 7/7; stopped: wrapped_up; client agent called 3x).
Leave-one-out case library: 0 entries left out.

## Turn 1: the founder (opener, script)

> We're closing a Series A in the next few months. Is there public money that should come alongside it, and what are we missing?

## Turn 1: Wincent

Yes, there may well be. A Series A is the moment public money most often comes in alongside, because your investors have already done the due diligence and a public lender or co-investor can rely on it (judgement). Whether it works for you depends on three facts I don't have yet, and each one points to a different door.

1. **Where is the company incorporated, and where do you have staff?** Every entity with people counts, along with its legal form and any licences or innovation status it holds. This decides which national promotional bank and which regions are open to you. An entity with employees in a second country can open a second set of doors (judgement).
2. **What does the round look like?** Size, the lead investor, whether a term sheet is signed, and the expected close date. Many co-investment and matching loans must be filed before the round closes, and some public funds only invest alongside certain kinds of investor. If the close is near, the order of moves changes (judgement).
3. **What will the money pay for?** Real R&D (and how deep), hiring, a production line, entering a new market? Each cost has its own cheapest public money. R&D grants, loans and equity don't fund the same things (judgement).

**Safe whatever you answer:** don't sign final round documents or announce the close until we've checked which routes need a filing first (judgement).

**Not yet:** don't start a large EU grant-and-equity application before we know your timing. It runs on its own calendar and may not fit this round (judgement).

Which country are you incorporated in, and when do you expect to close?

```mandate-board
{
  "title": "Series A: public money alongside the round",
  "stage": "qualify",
  "risks_flags": [
    {
      "id": "seq-close",
      "kind": "flag",
      "severity": "high",
      "title": "Some co-investment and matching routes must be filed before the round closes",
      "fix": "Hold the signing and announcement until each candidate route's filing rule is checked.",
      "cite": ["judgement"]
    },
    {
      "id": "structure-unknown",
      "kind": "flag",
      "severity": "medium",
      "title": "Incorporation, entities with staff and status not yet known",
      "fix": "Founder to confirm legal form, country, entities per country, licences or innovation status.",
      "cite": ["judgement"]
    }
  ]
}
```

## Turn 2: the founder (answer, if_asked+client_agent)

> French SAS, set up in 2021, near Grenoble.
> 
> 12 million Series A, the lead VC has issued a term sheet. We expect to sign in six to ten weeks.
> 
> 30 people, about half of them R&D.
> 
> We're a French SAS near Grenoble, 30 people, all in France. The VC's term sheet is in, and we expect to sign in six to ten weeks. The money goes mostly to hiring, R&D and building out sales for our German customers, though I'd have to check the exact split with our CFO.

## Turn 2: Wincent

Your answers settle three things. You're French, all your people are in France, and you're past three years, so Bpifrance's national innovation products are the open door, not something you have to get into first ([c45], judgement). The 6 to 10 weeks to signing is your deadline for filing.

What I found:

- **Bpifrance innovation loan.** €50k to €2M, unsecured, capped at twice your equity and quasi-equity [c50] [c53]. The Series A raises that cap, so it is the natural loan to put alongside the round (judgement).
- **Bpifrance innovation aid.** Up to €2M, part grant and part repayable advance [c5]. Costs incurred before you file don't count [c3]. **If the R&D the round pays for starts before you file, that spend is lost.** That is the trap you were missing.
- **JEI status** (France's young innovative company status). It needs R&D of at least 20% of your costs [c35], and at least 50% of your capital held by qualifying holders [c36]. Your Series A cap table must keep that test passing. The relief on employer social charges for your R&D staff can be large, up to €240,300 per site per year [c42].
- **Germany.** Bpifrance's export-prospecting insurance covers 50 or 65% of prospecting spend [c14]. It needs a published 12-month balance sheet and products already on sale [c9].
- **EU.** The EIC Accelerator's full-proposal deadlines run on a fixed calendar, about six a year [w1]. It won't fit a 6 to 10 week close. It fits later, alongside a later close or a follow-on round (judgement).

Two questions decide the order:

1. **Do you already have a Bpifrance innovation officer, and do you already use JEI and the research tax credit?** If yes, we add to what exists. If no, the first call is to Bpifrance's Grenoble office.
2. **Is your technology lab-derived or patented (deep tech)?** If so, Bpifrance's deep-tech track and the France 2030 calls open up.

Sources:
- [w1] EIC Accelerator FAQ, https://eic.ec.europa.eu/eic-frequently-asked-questions/faqs-eic-accelerator_en, retrieved 24 Nov 2026 via search summary: "Short proposals may be submitted at any time"; the six 2026 full-proposal cut-offs ran 7 Jan to 4 Nov (unverified until fetched directly).
- [Bpifrance deep-tech financing overview](https://bpifrance-creation.fr/encyclopedie/financements/panorama-financements/financement-dun-projet-deeptech), lead only.

```mandate-board
{
  "title": "Series A: public money alongside the round",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "Who sits under whom (France and EU)",
      "explains": "Bpifrance carries the national innovation money; the tax office runs the R&D credits and JEI; the EU layer runs on its own calendar.",
      "nodes": [
        {"id": "bpi", "label": "Bpifrance", "kind": "institution", "cite": ["c55"]},
        {"id": "bpi-innov", "label": "Direction Innovation", "kind": "division", "parent": "bpi", "cite": ["c55"]},
        {"id": "bpi-regions", "label": "Innovation officers in the regions (Grenoble)", "kind": "unit", "parent": "bpi-innov", "note": "First contact; advises on the instrument.", "cite": ["c8"]},
        {"id": "pret-innov", "label": "Prêt Innovation (EUR 50k to 2M)", "kind": "instrument", "parent": "bpi-innov", "status": "open", "note": "Unsecured; within twice equity, so the round lifts the cap.", "cite": ["c45", "c50", "c53"]},
        {"id": "add", "label": "Innovation aid ADD (up to EUR 2M)", "kind": "instrument", "parent": "bpi-innov", "status": "open", "note": "File before any programme cost.", "cite": ["c1", "c2", "c3", "c5"]},
        {"id": "ap", "label": "Assurance Prospection (Germany sales)", "kind": "instrument", "parent": "bpi", "status": "probe", "note": "Needs a 12-month balance sheet and products on sale.", "cite": ["c9", "c14"]},
        {"id": "dgfip", "label": "Tax administration (DGFiP)", "kind": "institution", "cite": ["c28"]},
        {"id": "cir", "label": "Research tax credit (CIR), 30%", "kind": "instrument", "parent": "dgfip", "status": "probe", "note": "Subsidies are deducted from its base.", "cite": ["c30", "c32"]},
        {"id": "jei", "label": "JEI status", "kind": "instrument", "parent": "dgfip", "status": "probe", "note": "R&D at least 20% of charges; 50% capital test.", "cite": ["c35", "c36", "c41"]},
        {"id": "eic", "label": "EIC Accelerator (EU)", "kind": "programme", "status": "park", "note": "Calendar does not fit this close; for a later tranche.", "cite": ["w1", "judgement"]}
      ],
      "cite": ["c55", "c8"]
    }
  ],
  "risks_flags": [
    {"id": "seq-close", "kind": "flag", "severity": "high", "title": "Innovation aid: no cost before the filing date is eligible", "fix": "File the aid request before the R&D programme the round funds starts spending.", "cite": ["c3"]},
    {"id": "jei-cap", "kind": "flag", "severity": "medium", "title": "JEI requires 50% of capital held by qualifying holders", "fix": "Check the post-money cap table against the test before signing.", "cite": ["c36"]},
    {"id": "cir-deduct", "kind": "flag", "severity": "low", "title": "Public subsidies reduce the CIR base", "fix": "Model CIR net of any Bpifrance grant.", "cite": ["c30"]},
    {"id": "structure-unknown", "kind": "flag", "severity": "low", "title": "Structure confirmed: French SAS, all staff in France", "fix": "Settled.", "cite": ["judgement"]}
  ]
}
```

## Turn 3: the founder (answer, if_asked)

> We have had the young innovative company status since 2022 and we claim the research tax credit.
> 
> Industrial sensors, hardware, with an industrial R&D programme.

## Turn 3: Wincent

Good, that helps. You already hold JEI and claim the research tax credit, so we add to what you have rather than build from scratch. Industrial sensor hardware with a structured R&D programme fits the French innovation money closely (judgement).

What I found:

- **There are three national ways to fund the R&D programme itself:**
  - Bpifrance's innovation aid, up to €2M [c5].
  - The i-Nov competition, for projects with total costs of €1 to 5M over 12 to 36 months [c66].
  - Larger France 2030 calls run by Bpifrance [c65].
- **The same rule runs through all of them.** The work must not have started before you file [c3] [c57]. If your round's use of funds starts the R&D programme the day you close, that is the moment to protect.
- **Region (Auvergne-Rhône-Alpes).** A France 2030 regional call run by Bpifrance pays €75k to €500k, as a grant or a repayable advance. It requires equity at least equal to the aid, and is listed as closing on 31 December 2026 [w2]. That date comes from a secondary listing, so confirm it with Bpifrance.
- **Precedent.** A sensor company, EnerBee, appears in the i-Nov winners register with about €796k (register record, [data.enseignementsup-recherche.gouv.fr](https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-laureats-concours-i-nov/)).
- **Tax credit interaction.** Any grant you win is deducted from your research tax credit base [c30]. Count the net figure.

Two questions decide which of these leads:

1. **What does the R&D programme cost in total, over how many months, and when does spending start?** Under €2M points to the innovation aid; €1 to 5M points to i-Nov; above that, the larger calls.
2. **For Germany: will you sell from the French company or open a German entity?** Bpifrance's export insurance covers a French company's prospecting spend [c14]. A German entity would open German doors instead.

[w2] [les-aides.fr listing](https://les-aides.fr/aide/aHlv3w/bpifrance/appel-a-projets-transformation-des-pme-par-l-innovation-en-auvergne-rhone-alpes.html), retrieved 24 Nov 2026: "L'appel à projets est ouvert jusqu'au 31/12/2026"; "disposer d'un montant de fonds propres au moins égal à l'aide demandée".

```mandate-board
{
  "title": "Series A: public money alongside the round",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "Who sits under whom (France, region, EU)",
      "explains": "Bpifrance operates national and regional innovation money; the tax office runs CIR and JEI, which you already hold.",
      "nodes": [
        {"id": "inov", "label": "i-Nov competition (projects EUR 1-5M)", "kind": "programme", "parent": "bpi-innov", "status": "probe", "note": "Fits if the programme costs EUR 1-5M over 12-36 months.", "cite": ["c66"]},
        {"id": "f2030", "label": "France 2030 calls (operated by Bpifrance)", "kind": "programme", "parent": "bpi", "status": "probe", "note": "Work in France, not started before filing.", "cite": ["c57", "c65"]},
        {"id": "aura-call", "label": "AURA regional call: Transformation des PME par l'innovation", "kind": "regional_body", "parent": "bpi", "status": "probe", "note": "EUR 75k-500k; equity at least the aid; listed close 31 Dec 2026.", "cite": ["w2"]},
        {"id": "cir", "label": "Research tax credit (CIR), 30%", "kind": "instrument", "parent": "dgfip", "status": "open", "note": "Held. Subsidies reduce its base.", "cite": ["c30", "c32"]},
        {"id": "jei", "label": "JEI status", "kind": "instrument", "parent": "dgfip", "status": "open", "note": "Held since 2022; keep the 50% capital test through the round.", "cite": ["c36", "c41"]}
      ],
      "cite": ["c65", "w2"]
    }
  ],
  "process_maps": [
    {
      "id": "f2030-map",
      "title": "How a France 2030 / i-Nov application runs",
      "explains": "File online, Bpifrance screens, a jury hears, appraisal, committee, agreement.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "co", "name": "Your company", "side": "market"},
        {"id": "bpi", "name": "Bpifrance (operator)", "side": "public-capital"}
      ],
      "steps": [
        {"id": "file", "label": "File online by a collection date", "kind": "document", "actor": "co", "cite": ["c58"], "gates": [{"label": "Complete file, in time", "cite": ["c56"]}, {"label": "Work in France, not started before filing", "cite": ["c57"]}]},
        {"id": "screen", "label": "Eligibility check and shortlist", "kind": "decision", "actor": "bpi", "cite": ["c59"]},
        {"id": "jury", "label": "Jury hearing; pre-selection committee", "kind": "decision", "actor": "bpi", "cite": ["c60"]},
        {"id": "detail", "label": "Detailed file", "kind": "document", "actor": "co", "timing": "within 1 month (individual)", "cite": ["c61"]},
        {"id": "appraise", "label": "In-depth appraisal", "kind": "step", "actor": "bpi", "timing": "about 4 months (individual)", "cite": ["c62"]},
        {"id": "select", "label": "Selection committee", "kind": "decision", "actor": "bpi", "cite": ["c63"]},
        {"id": "sign", "label": "Sign the agreement", "kind": "deadline", "actor": "co", "timing": "within 4 months of award", "cite": ["c64"]}
      ],
      "flow": [{"from": "file", "to": "screen"}, {"from": "screen", "to": "jury"}, {"from": "jury", "to": "detail"}, {"from": "detail", "to": "appraise"}, {"from": "appraise", "to": "select"}, {"from": "select", "to": "sign"}],
      "leverage": [
        {"id": "start-guard", "at": "file", "kind": "blocker", "label": "Programme started before filing", "why": "Work begun before the filing is ineligible.", "how": "Your CFO dates the programme start after the filing.", "side": "public-capital", "cite": ["c57"]},
        {"id": "inov-prec", "at": "select", "kind": "precedent", "label": "A sensor company among i-Nov winners", "why": "Shows the jury backs sensor hardware.", "how": "Cite it in the file's positioning.", "side": "public-capital", "cite": ["unverified"]}
      ],
      "cite": ["c58"]
    }
  ],
  "risks_flags": [
    {"id": "seq-close", "kind": "flag", "severity": "high", "title": "Every R&D aid: no work or cost before the filing date", "fix": "File before the round-funded programme starts; date the start after filing.", "cite": ["c3", "c57"]},
    {"id": "aura-deadline", "kind": "flag", "severity": "medium", "title": "Regional call listed as closing 31 Dec 2026", "fix": "Confirm the date with Bpifrance this week; decide whether to file before year end.", "cite": ["w2"]}
  ]
}
```

## Turn 4: the founder (options, script)

> OK, that is the picture. What are our options, broadly?

## Turn 4: Wincent

There are five families of money. All of them are on the board, each with its status.

1. **Equity alongside the round.** Bpifrance's deep-tech fund takes €1.5 to 10M tickets at Series A and B [w4]. That money is as dilutive as your VC's. Bpifrance's Large Venture fund is shut to you: it only joins rounds of about €20M or more [w5]. EIC equity fits a later close [c70].
2. **Non-dilutive money for the R&D programme.** Bpifrance's innovation aid (up to €2M) [c5], i-Nov [c66], the larger France 2030 calls [c65], the regional call [w2], and later the EIC grant. All of them require filing before the work starts [c3] [c57].
3. **Debt for hiring and sales.** Bpifrance's innovation loan: €50k to €2M, unsecured [c50] [c53]. A regional industry loan sits alongside it (unverified).
4. **Germany.** Bpifrance's export-prospecting insurance [c14], if you have a published 12-month balance sheet and products on sale [c9].
5. **Tax.** JEI and the research tax credit are in hand. The innovation tax credit for prototypes is worth checking: it is 20% [c23] for SMEs [c24], on spend not already in the research credit [c19].

**Illustration only.** Suppose you won €1.5M of R&D aid and the €2M loan. That is €3.5M, nearly 30% on top of the €12M, with no dilution (judgement). Your CFO's split will set the real figure.

Two things before we narrow:

- **Which do you lean toward?** More runway without dilution, or a public co-investor in the round?
- **Is a Bpifrance fund, or a fund backed by Bpifrance or the EU's investment fund, already in the round or on the term sheet?** If so, it is the fastest door (judgement).

Sources:
- [w4] [Maddyness: portrait of Bpifrance Deeptech Venture](https://www.maddyness.com/2025/07/10/que-font-les-fonds-le-portrait-de-bpifrance-deeptech-venture/), retrieved 24 Nov 2026: "Deeptech 2030 ... prend le relais en série A et B avec des tickets compris entre 1,5 et 10 millions d'euros".
- [w5] [Bpifrance: Large Venture](https://www.bpifrance.com/?p=3024), retrieved 24 Nov 2026 via search: "minority stakes of a minimum of €10m ... in rounds of at least c.€20m".

```mandate-board
{
  "title": "Series A: public money alongside the round",
  "stage": "options",
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eic", "name": "EIC Accelerator (grant and/or equity)", "institution": "EISMEA / EIC Fund", "status": "park", "why": "Eligible SME at TRL 6-8, but the full-proposal calendar does not fit a 6-10 week close; candidate for a later tranche.", "conditions": ["Single SME", "TRL 6-8", "Short proposal any time, then batch cut-offs"], "cite": ["c67", "c70", "w1"]}
      ]},
      {"id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
        {"id": "pret-innov", "name": "Prêt Innovation", "institution": "Bpifrance", "status": "open", "why": "Registered over 3 years; unsecured, EUR 50k-2M.", "cite": ["c45", "c50", "c53"]},
        {"id": "add", "name": "Innovation aid (ADD)", "institution": "Bpifrance", "status": "open", "why": "French SME; up to EUR 2M mixed grant and advance; file before any cost.", "cite": ["c1", "c2", "c3", "c5"]},
        {"id": "inov", "name": "i-Nov competition", "institution": "Bpifrance for France 2030", "status": "probe", "why": "Fits if programme costs EUR 1-5M over 12-36 months.", "cite": ["c66"]},
        {"id": "f2030", "name": "Larger France 2030 calls (e.g. i-Démo)", "institution": "SGPI, operated by Bpifrance", "status": "probe", "why": "For a bigger programme; about 4 months appraisal.", "cite": ["c62", "c65"]},
        {"id": "dt2030", "name": "Deeptech 2030 fund (equity co-invest)", "institution": "Bpifrance Deeptech Venture", "status": "probe", "why": "Series A-B tickets EUR 1.5-10M; dilutive like VC money.", "cite": ["w4"]},
        {"id": "large-venture", "name": "Large Venture", "institution": "Bpifrance", "status": "shut", "why": "Only rounds of about EUR 20M or more; yours is 12M.", "cite": ["w5"]},
        {"id": "ap", "name": "Assurance Prospection (Germany)", "institution": "Bpifrance", "status": "probe", "why": "Covers 50 or 65% of prospecting spend; needs a 12-month balance sheet and sales.", "cite": ["c9", "c14"]},
        {"id": "cii", "name": "Innovation tax credit (CII)", "institution": "Tax administration", "status": "probe", "why": "20% on prototype spend not already in CIR, capped EUR 400k spend.", "cite": ["c19", "c20", "c23", "c24"]},
        {"id": "cir-jei", "name": "CIR and JEI", "institution": "Tax administration", "status": "open", "why": "Held; keep JEI's 50% capital test through the round.", "cite": ["c32", "c36"]}
      ]},
      {"id": "aura", "level": "regional", "label": "Auvergne-Rhône-Alpes", "country": "FR", "doors": [
        {"id": "aura-call", "name": "Transformation des PME par l'innovation", "institution": "State and Region, operated by Bpifrance", "status": "probe", "why": "EUR 75k-500k; equity at least the aid; listed close 31 Dec 2026.", "cite": ["w2"]},
        {"id": "aura-loan", "name": "Prêt Région Industrie Croissance", "institution": "Région Auvergne-Rhône-Alpes", "status": "probe", "why": "Small industrial loan; terms to confirm.", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
        {"id": "de-entity", "name": "German promotional routes", "institution": "To research", "status": "park", "why": "Open question: sell from France or open a German entity.", "cite": ["judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 12000000, "label": "Series A, plus non-dilutive headroom"},
    "instruments": [
      {"id": "vc", "name": "Series A equity (lead VC)", "type": "equity", "amount": 12000000, "terms": "Carries everything; dearest money, paid in dilution and target returns.", "status": "in_progress", "cite": ["judgement"]},
      {"id": "s-add", "name": "R&D aid (ADD or i-Nov)", "type": "grant", "amount": 500000, "amount_max": 2000000, "terms": "Carries the R&D programme; cheapest money, part grant; reduces the CIR base.", "status": "probe", "cite": ["c5", "c30", "c66"]},
      {"id": "s-pret", "name": "Prêt Innovation", "type": "loan", "amount": 500000, "amount_max": 2000000, "terms": "Carries hiring and launch; unsecured fixed-rate debt, no dilution.", "status": "probe", "cite": ["c50", "c53"]},
      {"id": "s-ap", "name": "Assurance Prospection", "type": "guarantee_debt", "terms": "Carries German prospecting spend; the State shares the risk if sales fail; 3% premium.", "status": "probe", "cite": ["c13", "c14", "c17"]},
      {"id": "s-taxes", "name": "CIR and JEI", "type": "customer_side", "terms": "Carries R&D payroll; already in hand.", "status": "secured", "cite": ["c32", "c42"]}
    ]
  },
  "hierarchies": [
    {
      "id": "field",
      "title": "Who sits under whom (France, region, EU)",
      "explains": "Bpifrance carries national and regional money and a deep-tech equity arm.",
      "nodes": [
        {"id": "bpi-dtv", "label": "Bpifrance Deeptech Venture (Deeptech 2030 fund)", "kind": "division", "parent": "bpi", "status": "probe", "cite": ["w4"]},
        {"id": "bpi-lv", "label": "Large Venture", "kind": "programme", "parent": "bpi", "status": "shut", "note": "Rounds of about EUR 20M or more.", "cite": ["w5"]}
      ],
      "cite": ["w4", "w5"]
    }
  ],
  "risks_flags": [
    {"id": "jei-cap", "kind": "flag", "severity": "medium", "title": "JEI requires 50% of capital held by qualifying holders", "fix": "Check the post-money cap table against the test before signing.", "cite": ["c36"]}
  ]
}
```

## Turn 5: the founder (pushback, script)

> Our lead VC says public money only slows a round down, so close first and look at it afterwards. Is that wrong?

## Turn 5: Wincent

Half right. Your VC is right that a public **co-investor** in this round would slow it down. Bpifrance's equity fund or the EIC would each add their own investment committee and calendar (judgement). Keep them off the critical path.

The VC is wrong about the non-dilutive money, and that is where the cost of waiting sits:

- **Costs incurred before the filing date are lost.** The R&D aid excludes any cost incurred before you file [c3]. France 2030 excludes work started before filing [c57]. If the round-funded programme starts at close and you file afterwards, the first months of spend no longer count. Filing a request does not involve the VC or touch the term sheet (judgement).
- **The regional call may close before you sign.** It is listed as closing on 31 December 2026 [w2]. Your signing falls in January or February.
- **JEI is decided in the term sheet.** The 50% qualifying-holder test [c36] has to survive the post-money cap table. That check happens now, not afterwards.

The innovation loan is where the VC is right: take it after close. The new equity strengthens the file (judgement).

So my proposed priority:

1. **File the R&D aid request before signing.** That is the innovation aid or i-Nov, depending on the size of the programme.
2. **The innovation loan just after close.**
3. **The JEI check in the term sheet this week.**

Public equity and the EIC are parked for the next round.

To lock this in, I need one fact: **when does the round-funded R&D spend actually start, and is any of it already running?**

```mandate-board
{
  "title": "Series A: public money alongside the round",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Keep public equity off this round's critical path; park it for the next round.",
      "File the R&D aid request before signing, because costs before filing are ineligible.",
      "Take the Bpifrance innovation loan just after close.",
      "Check JEI's 50% capital test in the term sheet now."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type; which aid fits depends on the programme's size and start date.",
    "open_question": "When does the round-funded R&D spend start, and is any already running?",
    "cite": ["c3", "c36", "c45", "c57", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
        {"id": "dt2030", "name": "Deeptech 2030 fund (equity co-invest)", "institution": "Bpifrance Deeptech Venture", "status": "park", "why": "Adds an investment committee to this close; candidate for the next round.", "cite": ["w4", "judgement"]},
        {"id": "add", "name": "Innovation aid (ADD)", "institution": "Bpifrance", "status": "open", "why": "Lead candidate if programme is under EUR 2M; file before signing.", "cite": ["c3", "c5"]},
        {"id": "inov", "name": "i-Nov competition", "institution": "Bpifrance for France 2030", "status": "probe", "why": "Lead candidate if programme is EUR 1-5M; tied to collection dates.", "cite": ["c58", "c66"]},
        {"id": "pret-innov", "name": "Prêt Innovation", "institution": "Bpifrance", "status": "open", "why": "Second priority, right after close.", "cite": ["c45", "c50"]}
      ]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "Lead: R&D aid", "steps": [
        {"id": "call-bpi", "label": "Call the Bpifrance innovation officer in Grenoble", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["c8"]},
        {"id": "file-aid", "label": "File the aid request before any programme cost", "start": 0.25, "end": 1.25, "owner": "client", "status": "planned", "depends_on": ["call-bpi"], "cite": ["c3", "c57"]},
        {"id": "start-prog", "label": "Start the round-funded R&D programme", "start": 2, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["file-aid"], "cite": ["judgement"]}
      ]},
      {"id": "round", "label": "Series A", "steps": [
        {"id": "jei-check", "label": "Check JEI 50% capital test on the post-money cap table", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["c36"]},
        {"id": "sign", "label": "Sign the Series A", "start": 1.5, "end": 2.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "pret", "label": "Apply for the Prêt Innovation", "start": 2.5, "end": 3.5, "owner": "client", "status": "planned", "depends_on": ["sign"], "cite": ["c45", "c50"]},
        {"id": "no-equity", "label": "Not yet: no public co-investor on this close", "start": 0, "end": 2.5, "owner": "us", "status": "blocked", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-aura", "label": "AURA regional call listed close: confirm date and fit", "start": "2026-12-31", "milestone": true, "owner": "us", "status": "planned", "cite": ["w2"]},
        {"id": "w-eic", "label": "EIC Accelerator 2027 cut-offs, for the next round", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"]},
        {"id": "w-dt", "label": "Deeptech 2030 fund, for the next round", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["w4"]}
      ]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "bpi-reg", "name": "Bpifrance, regional office (Grenoble)", "side": "public-capital", "country": "FR", "units": [{"id": "innov-reg", "name": "Innovation team in the region", "roles": [
        {"id": "head-innov-reg", "role": "Head of innovation, regional office", "priority": "P1", "reach": "Through the innovation officer, or the office switchboard", "status": "to_approach", "cite": ["judgement"]},
        {"id": "cda", "role": "Innovation officer (chargé d'affaires Innovation)", "priority": "P2", "reach": "Bpifrance regional contact page", "status": "to_approach", "cite": ["c8"]}
      ]}]}
    ]
  },
  "risks_flags": [
    {"id": "vc-wait", "kind": "flag", "severity": "high", "title": "Closing first, filing later, loses the early programme spend", "fix": "File the aid request before signing; it does not touch the term sheet.", "cite": ["c3", "c57"]}
  ]
}
```

## Turn 6: the founder (pushback, script)

> For Germany we'll just start selling and see whether support makes sense once we have traction. Fine?

## Turn 6: Wincent

Selling from France first is fine. You don't need a German entity to start, and for now German promotional money can stay parked (judgement).

What isn't fine is waiting for traction before looking at support. The main support for this situation is French, and it covers exactly the "see whether it works" phase:

- **What it covers.** Bpifrance's export-prospecting insurance pays 50 or 65% of your prospecting spend [c14]. Half is advanced when you sign the contract [c11].
- **What happens if Germany fails.** You repay a 30% minimum plus a share of your German turnover; if the prospecting fails, the State bears the loss [c13]. Insurance against a market not working is worth most before you know whether it works (judgement).
- **What it costs.** A one-off premium of 3% of the guaranteed budget [c17].
- **You likely qualify.** It needs a published 12-month balance sheet and products already on sale [c9].
- **The open point.** I could not confirm from which date your spend counts: the application date, the contract date, or the start of prospecting (unverified). Ask Bpifrance's export insurance team before the first German hire, trade fair or agency contract. Spend before that date may not count (judgement).

Illustration: a €600k German budget over two years at 65% gives about €390k of cover for an €18k premium (judgement, assumed figures). Your CFO's real budget replaces this.

I'm also handing one point to Regina: whether selling your sensors in Germany raises any product-compliance question.

**Can your CFO give me the German budget for the next 24 months:** sales hires, trade fairs, marketing?

```mandate-board
{
  "title": "Series A: public money alongside the round",
  "stage": "prioritise",
  "routes": {
    "levels": [
      {"id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
        {"id": "ap", "name": "Assurance Prospection (Germany)", "institution": "Bpifrance", "status": "open", "why": "Covers German prospecting from the French company; State bears the loss if it fails. Confirm the expense start date before the first German spend.", "conditions": ["Published 12-month balance sheet", "Products already sold", "Turnover under EUR 500M"], "cite": ["c9", "c13", "c14"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
        {"id": "de-entity", "name": "German promotional routes", "institution": "To research if an entity is opened", "status": "park", "why": "Selling from France; no German entity planned yet.", "cite": ["judgement"]}
      ]}
    ]
  },
  "process_maps": [
    {
      "id": "ap-map",
      "title": "How the export-prospecting insurance runs",
      "explains": "Apply online, half advanced at signing, balance on a statement of spend, repayment tied to German sales.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "co", "name": "Your company", "side": "market"},
        {"id": "bpi-int", "name": "Bpifrance export insurance", "side": "public-capital"}
      ],
      "steps": [
        {"id": "ap-apply", "label": "Apply online with the German budget", "kind": "document", "actor": "co", "cite": ["c10"], "gates": [{"label": "12-month balance sheet published, products already sold", "cite": ["c9"]}, {"label": "Expense start date confirmed before first German spend", "cite": ["unverified"]}]},
        {"id": "ap-sign", "label": "Contract signed; 50% advance paid", "kind": "decision", "actor": "bpi-int", "cite": ["c11"], "gates": [{"label": "3% premium on the guaranteed budget", "cite": ["c17"]}]},
        {"id": "ap-statement", "label": "Balance paid on a statement of eligible spend", "kind": "document", "actor": "co", "cite": ["c12"]},
        {"id": "ap-repay", "label": "Repay 30% minimum plus a share of German turnover, or the State bears it", "kind": "step", "actor": "co", "cite": ["c13"]}
      ],
      "flow": [{"from": "ap-apply", "to": "ap-sign"}, {"from": "ap-sign", "to": "ap-statement"}, {"from": "ap-statement", "to": "ap-repay"}],
      "leverage": [
        {"id": "ap-timing", "at": "ap-apply", "kind": "timing_window", "label": "Before the first German hire or trade fair", "why": "Spend before the start date may not count.", "how": "CFO asks Bpifrance's export insurance team which date governs.", "side": "public-capital", "cite": ["unverified"]}
      ],
      "cite": ["c10"]
    }
  ],
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 12000000, "label": "Series A, plus non-dilutive headroom"},
    "instruments": [
      {"id": "s-ap", "name": "Assurance Prospection", "type": "guarantee_debt", "amount": 390000, "terms": "Carries German prospecting spend; State shares the failure risk; 3% premium. Amount illustrative on a EUR 600k budget at 65%.", "status": "probe", "cite": ["c13", "c14", "c17", "judgement"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "germany", "label": "Germany", "steps": [
        {"id": "de-budget", "label": "CFO sets the 24-month German budget", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "ap-file", "label": "Apply for Assurance Prospection before first German spend", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "depends_on": ["de-budget"], "cite": ["c10"]},
        {"id": "de-spend", "label": "Not yet: no German hire, fair or agency contract before the start date is confirmed", "start": 0, "end": 1.5, "owner": "client", "status": "blocked", "cite": ["unverified"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-de-entity", "label": "German entity decision reopens German promotional routes", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "bpi-ae", "name": "Bpifrance export insurance", "side": "public-capital", "country": "FR", "units": [{"id": "ap-unit", "name": "Assurance Prospection team", "roles": [
        {"id": "ap-head", "role": "Head of prospecting insurance", "priority": "P1", "reach": "Through the regional international officer", "status": "to_approach", "cite": ["judgement"]},
        {"id": "ap-officer", "role": "Regional international officer (Grenoble)", "priority": "P2", "reach": "Bpifrance regional office", "status": "to_approach", "cite": ["judgement"]}
      ]}]}
    ]
  },
  "risks_flags": [
    {"id": "de-wait", "kind": "flag", "severity": "medium", "title": "Waiting for traction may make early German spend ineligible", "fix": "Confirm the expense start date and apply before the first German spend.", "cite": ["unverified"]},
    {"id": "regina-de", "kind": "flag", "severity": "low", "title": "Product compliance for selling the sensors in Germany", "fix": "Handed to Regina.", "cite": ["judgement"]}
  ]
}
```

## Turn 7: the founder (answer, if_asked)

> Our first export customers are in Germany. We have no entity outside France.

## Turn 7: Wincent

That settles Germany for now.

- **All your support for Germany comes from France.** With no entity outside France, German promotional money is parked, not shut. If you open a German entity later, it becomes a plan step that reopens those doors (judgement).
- **You likely clear the insurance's main gate.** It requires products already on sale and a published 12-month balance sheet [c9], and your German customers show the first (judgement).
- **One point to confirm with Bpifrance.** Germany is already a customer market for you. Ask whether prospecting there still counts as a market being developed, or whether only new countries qualify (unverified). The answer could shift the insurance budget toward the next country (judgement).

There is a cost we haven't priced yet. First export orders of hardware mean you build and ship sensors before the German customer pays. That working-capital gap is classic territory for a bank loan with part of the risk covered by Bpifrance, arranged through your own bank (unverified, to research next). Your bank is the door.

That's the last open point before I advise. Three facts from your CFO:

1. **The R&D programme:** total cost, duration, and the date spending starts.
2. **The German budget over 24 months:** hires, fairs, marketing.
3. **Your main bank, and the gap between building an order and getting paid**, roughly in days and euros.

```mandate-board
{
  "title": "Series A: public money alongside the round",
  "stage": "prioritise",
  "routes": {
    "levels": [
      {"id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
        {"id": "ap", "name": "Assurance Prospection (Germany)", "institution": "Bpifrance", "status": "open", "why": "Products sold, including first German customers; confirm Germany counts as a market under prospection.", "conditions": ["Published 12-month balance sheet", "Products already sold", "Confirm an existing customer market qualifies"], "cite": ["c9", "unverified"]},
        {"id": "bank-guar", "name": "Bank loan with Bpifrance guarantee (export working capital)", "institution": "Bpifrance, through your bank", "via": "your main bank", "status": "probe", "why": "Hardware export orders tie up cash before payment; to research once the bank is known.", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
        {"id": "de-entity", "name": "German promotional routes", "institution": "To research if an entity is opened", "status": "park", "why": "No entity outside France; reopens if a German entity is set up.", "cite": ["judgement"]}
      ]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-ap-market", "label": "Bpifrance answer: does an existing customer market qualify for prospection cover?", "start": 0.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "wc-export", "kind": "flag", "severity": "medium", "title": "Export hardware orders: working capital before the customer pays", "fix": "CFO sizes the gap; research the bank-guarantee route through the main bank.", "cite": ["judgement"]},
    {"id": "ap-market", "kind": "flag", "severity": "medium", "title": "Germany may not count as a market under prospection if already selling there", "fix": "Ask Bpifrance before filing; consider the next target country in the budget.", "cite": ["unverified"]}
  ]
}
```

## Turn 8: the founder (prioritise, script)

> Which two or three should we actually go for, and what will each cost us in time and effort?

## Turn 8: Wincent

These three, in this order. Everything else is parked or a quick check.

**1. Bpifrance innovation aid, filed before you sign.**
- Up to €2M, part grant and part repayable advance, for a programme of up to 36 months [c5] [c6].
- **Effort:** one programme file, about two to three weeks of part-time work for your CTO and CFO, after a first call with the Grenoble innovation officer (judgement).
- **Time:** the filing date is what matters, because it protects your costs from that day [c3]. The decision can come after close (judgement).
- **Net value.** A grant reduces your research tax credit base [c30], and that credit is 30% [c32]. So €1M of aid is worth about €700k net, not €1M (judgement, assumed amount).
- If the programme is €1 to 5M, i-Nov may pay more [c66]. It is heavier, though: a jury, then about four months of appraisal [c60] [c62].

**2. Bpifrance innovation loan, just after close.**
- €50k to €2M over 7 years, including 2 years before you repay capital [c50] [c51].
- No security asked, only a 5% retention [c48] [c53], and a 0.40% file fee [c52].
- **Effort:** light, mostly your financials and the round documents (judgement).

**3. Export-prospecting insurance for Germany.**
- Online application [c10], with a 3% premium [c17].
- **Effort:** a 24-month German budget. Moderate (judgement).
- **Condition:** only if Bpifrance confirms Germany qualifies, given you already sell there (unverified).

**Plus the JEI cap-table check:** an hour with your lawyer (judgement).

**Parked:** public equity and the EIC go to the next round. The regional call only fits if a separate sub-project qualifies and you can file by 31 December [w2]. Don't put two aids on the same cost until Bpifrance confirms they may combine (unverified).

Do you agree with these three? If so, your CFO's three figures let me size them and draft the first call.

```mandate-board
{
  "title": "Series A: public money alongside the round",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "1. Bpifrance innovation aid: file before signing so the round-funded R&D counts.",
      "2. Bpifrance innovation loan: apply right after close, unsecured, no dilution.",
      "3. Assurance Prospection for Germany, if Germany qualifies as a market under prospection.",
      "Now: JEI cap-table check. Parked: public equity and EIC to the next round."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type on cited gates; sizes depend on the CFO's programme and German budgets.",
    "open_question": "Programme cost, duration and start date; German budget; main bank and cash gap.",
    "cite": ["c3", "c5", "c45", "c50", "c9", "c36"]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 12000000, "label": "Series A, plus non-dilutive headroom"},
    "instruments": [
      {"id": "s-add", "name": "Bpifrance innovation aid (ADD)", "type": "grant", "amount": 500000, "amount_max": 2000000, "terms": "Carries the R&D programme; cheapest money, part grant; net of the CIR it displaces (30% of the grant).", "status": "planned", "cite": ["c5", "c30", "c32"]},
      {"id": "s-pret", "name": "Prêt Innovation", "type": "loan", "amount": 500000, "amount_max": 2000000, "terms": "Carries hiring and launch; 7 years with 2 years of capital deferral, unsecured, 0.40% fee.", "status": "planned", "cite": ["c50", "c51", "c52", "c53"]},
      {"id": "s-ap", "name": "Assurance Prospection", "type": "guarantee_debt", "terms": "Carries German prospecting spend; the State shares the failure risk; 3% premium.", "status": "probe", "cite": ["c13", "c14", "c17"]}
    ]
  },
  "routes": {
    "levels": [
      {"id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
        {"id": "inov", "name": "i-Nov competition", "institution": "Bpifrance for France 2030", "status": "probe", "why": "Alternative to the ADD only if the programme is EUR 1-5M; jury and about 4 months appraisal.", "cite": ["c60", "c62", "c66"]}
      ]},
      {"id": "aura", "level": "regional", "label": "Auvergne-Rhône-Alpes", "country": "FR", "doors": [
        {"id": "aura-call", "name": "Transformation des PME par l'innovation", "institution": "State and Region, operated by Bpifrance", "status": "park", "why": "Only for a distinct sub-project filed by 31 Dec; no stacking on the same cost until confirmed.", "cite": ["w2", "unverified"]}
      ]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "1. R&D aid", "steps": [
        {"id": "call-bpi", "label": "First call with the Bpifrance innovation officer", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["c8"]},
        {"id": "file-aid", "label": "Write and file the programme file (2-3 weeks part-time)", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "depends_on": ["call-bpi"], "cite": ["c3", "judgement"]},
        {"id": "aid-decision", "label": "Aid decision (after close is fine)", "start": 3, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["file-aid"], "cite": ["judgement"]}
      ]},
      {"id": "loan", "label": "2. Innovation loan", "steps": [
        {"id": "pret", "label": "Apply for the Prêt Innovation after signing", "start": 2.5, "end": 3.5, "owner": "client", "status": "planned", "depends_on": ["sign"], "cite": ["c45", "c50"]}
      ]}
    ]
  }
}
```

## Turn 9: the founder (expect, script)

> If we go that way, how do we start, and what should we expect along the way?

## Turn 9: Wincent

Here's how to start and what to expect. The board holds the full map.

**This week**
1. **Call the Bpifrance innovation officer in Grenoble** [c8]. That officer is your P2. The P1 is the head of innovation at the regional office, the level that actually decides files like yours (judgement). The national innovation director [c55] is for escalation only. Going there first would just send you back down.
   - Bring three things: the programme's scope and budget, the term sheet, and the planned start date.
   - Ask two things: should this be the innovation aid or i-Nov, and does the filing date protect your spend?
2. **Have your lawyer run the JEI check on the post-money cap table** [c36].
3. **Your CFO emails Bpifrance's export insurance team** to ask whether Germany qualifies, given your existing customers (unverified).

**What to expect**
- **Innovation aid.** File in 2 to 4 weeks; protection starts that day [c3]. Then expect an appraisal (timing unverified) and payment in 2 or 3 tranches [c4]. Odds are good for a JEI company with VC backing (judgement).
- **i-Nov, if chosen instead.** Jury, then a detailed file within a month [c61], about four months of appraisal [c62], and an agreement within four months of the award [c64].
- **Innovation loan.** File right after close. Light effort, high odds (judgement).
- **Export insurance.** Online file [c10], 50% advance at contract signature [c11], the balance on a statement of spend [c12].

**Precedents.** A sensor company won i-Nov, per the register record (EnerBee, see the [i-Nov register](https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-laureats-concours-i-nov/)). For the innovation aid, the loan and the export insurance, I found none in your situation. These are routine products, so that is not a warning sign (judgement).

Shall I draft the note to the innovation officer that asks for the first meeting?

```mandate-board
{
  "title": "Series A: public money alongside the round",
  "stage": "advise",
  "answer": {
    "lines": [
      "Call Bpifrance Grenoble this week; file the R&D aid before signing so round-funded R&D counts.",
      "Take the innovation loan right after close.",
      "Insure German prospecting, once Bpifrance confirms Germany qualifies.",
      "Public equity and EIC wait for the next round."
    ],
    "confidence": "medium",
    "confidence_why": "Cited gates are met by type; amounts and the Germany point await the CFO and Bpifrance.",
    "open_question": "Programme cost and start date; German budget; main bank and cash gap.",
    "cite": ["c3", "c8", "c36", "c45", "c50", "c9"]
  },
  "stakeholders": {
    "institutions": [
      {"id": "bpi-reg", "name": "Bpifrance, regional office (Grenoble)", "side": "public-capital", "country": "FR", "units": [{"id": "innov-reg", "name": "Innovation team in the region", "roles": [
        {"id": "head-innov-reg", "role": "Head of innovation, regional office (decides files of this size)", "priority": "P1", "reach": "Introduced by the innovation officer after the first call", "status": "to_approach", "cite": ["judgement"]},
        {"id": "cda", "role": "Innovation officer (chargé d'affaires Innovation)", "priority": "P2", "reach": "Bpifrance regional contact page; first call this week", "status": "to_approach", "cite": ["c8"]}
      ]}]},
      {"id": "bpi-nat", "name": "Bpifrance, Direction Innovation (national)", "side": "public-capital", "country": "FR", "units": [{"id": "dir-innov", "name": "Direction Innovation", "roles": [
        {"id": "exec-innov", "role": "Executive Director, Direction Innovation (escalation only)", "priority": "P2", "reach": "Only on a blocked file, through the regional head", "status": "to_approach", "cite": ["c55"]}
      ]}]},
      {"id": "bpi-ae", "name": "Bpifrance export insurance", "side": "public-capital", "country": "FR", "units": [{"id": "ap-unit", "name": "Assurance Prospection team", "roles": [
        {"id": "ap-head", "role": "Head of prospecting insurance", "priority": "P1", "reach": "Through the regional international officer", "status": "to_approach", "cite": ["judgement"]},
        {"id": "ap-officer", "role": "Regional international officer (Grenoble)", "priority": "P2", "reach": "Bpifrance regional office", "status": "to_approach", "cite": ["judgement"]},
        {"id": "exec-export", "role": "Executive Director, Direction Export (escalation only)", "priority": "P2", "reach": "Not a first contact", "status": "to_approach", "cite": ["c74"]}
      ]}]},
      {"id": "region", "name": "Région Auvergne-Rhône-Alpes", "side": "political", "country": "FR", "units": [{"id": "eco", "name": "Economy and innovation directorate", "roles": [
        {"id": "vp-eco", "role": "Regional vice-president for economy (only if the regional call is used)", "priority": "P1", "reach": "Through the regional innovation agency or a local MP", "status": "to_approach", "cite": ["judgement"]},
        {"id": "dir-eco", "role": "Director of economic development", "priority": "P2", "reach": "Directorate switchboard", "status": "to_approach", "cite": ["judgement"]}
      ]}]}
    ]
  },
  "process_maps": [
    {
      "id": "add-map",
      "title": "How the Bpifrance innovation aid runs (lead route)",
      "explains": "Talk to the regional officer, file before any cost, appraisal, decision, payment in tranches.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "co", "name": "Your company", "side": "market"},
        {"id": "bpi-r", "name": "Bpifrance regional innovation team", "side": "public-capital"}
      ],
      "steps": [
        {"id": "add-call", "label": "First call with the innovation officer", "kind": "step", "actor": "bpi-r", "timing": "this week", "cite": ["c8"], "gates": [{"label": "Programme scope, budget and start date ready", "cite": ["judgement"]}]},
        {"id": "add-file", "label": "File the aid request", "kind": "document", "actor": "co", "timing": "2-4 weeks", "cite": ["c3"], "gates": [{"label": "SME under the EU definition", "cite": ["c1"]}, {"label": "Registered in France", "cite": ["c2"]}, {"label": "No programme cost incurred before filing", "cite": ["c3"]}, {"label": "Programme of at most 36 months", "cite": ["c6"]}]},
        {"id": "add-appraise", "label": "Appraisal and decision", "kind": "decision", "actor": "bpi-r", "timing": "unverified; after close is fine", "cite": ["unverified"]},
        {"id": "add-pay", "label": "Paid in 2 or 3 tranches", "kind": "step", "actor": "bpi-r", "cite": ["c4"], "gates": [{"label": "Up to EUR 2M, grant and repayable advance", "cite": ["c5"]}]}
      ],
      "flow": [{"from": "add-call", "to": "add-file"}, {"from": "add-file", "to": "add-appraise"}, {"from": "add-appraise", "to": "add-pay"}],
      "leverage": [
        {"id": "add-door", "at": "add-call", "kind": "door_opener", "label": "The innovation officer introduces you to the regional head", "why": "A file the officer champions moves faster.", "how": "CEO and CFO take the first call with the term sheet in hand.", "side": "public-capital", "cite": ["judgement"]},
        {"id": "add-window", "at": "add-file", "kind": "timing_window", "label": "File before the Series A signing", "why": "Costs before filing are ineligible.", "how": "Date the programme start after the filing.", "side": "public-capital", "cite": ["c3"]},
        {"id": "add-signal", "at": "add-appraise", "kind": "pressure_point", "label": "VC term sheet and JEI status", "why": "Shows the private due diligence and the R&D intensity.", "how": "Attach both to the file.", "side": "public-capital", "cite": ["judgement"]}
      ],
      "cite": ["c3", "c8"]
    }
  ],
  "networks": [
    {
      "id": "bpi-oversight",
      "title": "Who stands behind Bpifrance",
      "explains": "State and Caisse des Dépôts own it; the State mandates export insurance; France 2030 runs through it; Régions sit on the board.",
      "nodes": [
        {"id": "etat", "label": "French State", "kind": "ministry", "cite": ["c81"]},
        {"id": "cdc", "label": "Caisse des Dépôts", "kind": "institution", "cite": ["c77"]},
        {"id": "bpi-n", "label": "Bpifrance", "kind": "bank", "cite": ["c77"]},
        {"id": "sgpi", "label": "General Secretariat for Investment (France 2030)", "kind": "body", "cite": ["c85"]},
        {"id": "mef", "label": "Ministry of the Economy", "kind": "ministry", "cite": ["c83"]},
        {"id": "regions", "label": "Régions (two on the board)", "kind": "body", "cite": ["c84"]}
      ],
      "edges": [
        {"from": "etat", "to": "bpi-n", "kind": "oversees", "label": "49.18% direct", "cite": ["c81"]},
        {"from": "cdc", "to": "bpi-n", "kind": "sits_on", "label": "chairs the board", "cite": ["c78"]},
        {"from": "sgpi", "to": "bpi-n", "kind": "funds", "label": "France 2030 operator", "cite": ["c85"]},
        {"from": "mef", "to": "bpi-n", "kind": "funds", "label": "export insurance for the State", "cite": ["c83"]},
        {"from": "regions", "to": "bpi-n", "kind": "sits_on", "cite": ["c84"]}
      ],
      "cite": ["c77", "c83", "c85"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "1. R&D aid", "steps": [
        {"id": "call-bpi", "label": "First call with the Bpifrance innovation officer", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["c8"]},
        {"id": "file-aid", "label": "File the aid request (before signing)", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "depends_on": ["call-bpi"], "cite": ["c3"]},
        {"id": "aid-decision", "label": "Aid decision", "start": 3, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["file-aid"], "cite": ["unverified"]}
      ]},
      {"id": "round", "label": "Series A", "steps": [
        {"id": "jei-check", "label": "JEI 50% test on the post-money cap table", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["c36"]},
        {"id": "sign", "label": "Sign the Series A", "start": 1.5, "end": 2.5, "owner": "client", "status": "planned", "depends_on": ["file-aid"], "cite": ["judgement"]},
        {"id": "pret", "label": "Apply for the Prêt Innovation", "start": 2.5, "end": 3.5, "owner": "client", "status": "planned", "depends_on": ["sign"], "cite": ["c45", "c50"]}
      ]},
      {"id": "germany", "label": "3. Germany", "steps": [
        {"id": "ap-ask", "label": "Ask Bpifrance whether Germany qualifies", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "ap-file", "label": "Apply for Assurance Prospection before new German spend", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "depends_on": ["ap-ask"], "cite": ["c10"]}
      ]}
    ]
  }
}
```

## Turn 10: the founder (brief, script)

> Good. Can you write this up as a brief for our board?

## Turn 10: Wincent

# Board brief: public money alongside the Series A

*Prepared 24 November 2026, for the board of a French SAS near Grenoble making industrial sensors.*

## 1. Answer

Put public money alongside the round as **non-dilutive** money, not as a public co-investor. Three routes, in this order:

1. **File a Bpifrance innovation aid request before we sign the round.** Costs incurred before the filing date are not eligible [c3]. Filing does not touch the term sheet (judgement).
2. **Take a Bpifrance innovation loan right after close.** €50k to €2M, unsecured [c50] [c53].
3. **Insure our German prospecting spend with Bpifrance**, if Bpifrance confirms Germany qualifies (unverified).

Our lead VC is right to keep public equity off this round's critical path (judgement). Waiting until after close for the non-dilutive money would cost us the eligibility of the first months of round-funded R&D [c3] [c57].

## 2. Where we stand

- **Structure.** French SAS created in 2021, 30 staff all in France, about half in R&D. No entity outside France.
- **Status already held.** JEI (France's young innovative company status) since 2022, and we claim the research tax credit. Both stay open to us [c32] [c41]. JEI requires at least 20% of our costs to be R&D [c35], and at least 50% of our capital held by qualifying holders [c36].
- **France, national level: open.** We are registered in France and over three years old, which meets Bpifrance's innovation aid and loan gates [c1] [c2] [c45].
- **Région Auvergne-Rhône-Alpes: parked.** A regional call run by Bpifrance pays €75k to €500k, requires equity at least equal to the aid, and is listed as closing on 31 December 2026 [w2]. It is parked unless a separate sub-project fits.
- **Germany: support comes from France.** With no German entity, German promotional money is parked (judgement). Our German customers show we already have products on sale, one of the export insurance's gates [c9].
- **EU: parked.** We are eligible for the EIC Accelerator as a single SME at technology readiness level (TRL) 6 to 8 [c67] [c70]. Its fixed calendar does not fit a 6 to 10 week close [w1]. It goes to the next round.

## 3. Flags

| Flag | Severity | Fix |
|---|---|---|
| R&D aid excludes costs before filing [c3] [c57] | High | File before signing; date the programme start after the filing |
| JEI 50% capital test after the round [c36] | Medium | Lawyer checks the post-money cap table now |
| Germany may not qualify as a market under prospection, since we already sell there (unverified) | Medium | Ask Bpifrance export insurance before filing; consider the next country |
| Export hardware orders tie up cash before payment (judgement) | Medium | CFO sizes the gap; research a Bpifrance-guaranteed bank line through our main bank (unverified) |
| Grants reduce the research tax credit base [c30] | Low | Count aid net of the credit it displaces |
| Two aids on the same cost (unverified) | Low | Confirm with Bpifrance before adding the regional call |
| Product compliance for selling our sensors in Germany | Low | Handed to Regina |

## 4. Decisions for the board

1. **Approve filing the R&D aid request before signing.** Recommended: yes. It protects the R&D spend and does not touch the term sheet (judgement).
2. **Innovation aid or i-Nov.** Recommended: the innovation aid if the programme costs under €2M [c5]. i-Nov if it costs €1 to 5M over 12 to 36 months [c66], accepting a jury and about four months of appraisal [c60] [c62].
3. **No public co-investor in this round.** Recommended: yes. Bpifrance's deep-tech fund [w4] and EIC equity are parked for the next round. Bpifrance's Large Venture fund is shut: it only joins rounds of about €20M or more [w5].

## 5. Actions and draft

- **CEO and CFO:** call the Bpifrance innovation officer in Grenoble this week [c8]. That officer is P2, on the public-capital side. P1 is the head of innovation at the regional office (judgement).
- **Lawyer:** run the JEI cap-table check this week [c36].
- **CFO:** ask Bpifrance's export insurance team whether Germany qualifies (unverified). P2 is the regional international officer; P1 is the head of prospecting insurance (judgement).
- **CFO:** provide three figures: the programme's cost, duration and start date; the 24-month German budget; our main bank and the cash gap on an order.

**Draft for the founder to send** (to the Bpifrance innovation officer, Grenoble):

> Objet : Programme R&D capteurs industriels et levée de série A : demande de rendez-vous
>
> Madame, Monsieur,
>
> Nous sommes une SAS iséroise de capteurs industriels, JEI depuis 2022, 30 personnes dont la moitié en R&D. Nous finalisons une série A de 12 M€, avec une lettre d'intention de notre investisseur principal, et nos premiers clients export sont en Allemagne.
>
> Cette levée finance un programme de R&D industrielle que nous souhaitons engager avec Bpifrance. Nous aimerions vous le présenter dans les quinze jours, afin de déposer une demande d'aide avant le démarrage des travaux.
>
> Seriez-vous disponible pour un entretien ?
>
> Avec nos remerciements,
> [Nom], Président

## 6. Plan

- **This week:** the Bpifrance call, the JEI check, the export insurance question, and the CFO's figures.
- **This month:** file the aid request [c3]. Confirm whether the regional call fits a sub-project before 31 December [w2]. If Germany qualifies, file the export insurance before any new German hire, fair or agency contract [c10].
- **This quarter:** sign the Series A, start the programme after the filing, and apply for the innovation loan [c45].
- **Later:** a decision on a German entity, which would reopen German routes (judgement). At the next round, EIC and Bpifrance equity.
- **Not yet:** a public co-investor in this round, and any German spend before the insurance's start date is confirmed (judgement).

## 7. Watches

- **Regional call.** Listed close 31 December 2026 [w2].
- **Bpifrance's answer on Germany** (unverified).
- **EIC Accelerator.** Full-proposal deadlines for 2027 not yet published [w1].
- **Bpifrance Deeptech 2030 fund**, at the next round [w4].
- **JEI.** The 50% capital test at every future round [c36].
- **German entity.** If we open one, German promotional money reopens (judgement).

## 8. Precedents

- **i-Nov:** a sensor company, EnerBee, appears among the winners (register record, [i-Nov register](https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-laureats-concours-i-nov/)).
- **Innovation aid, innovation loan, export insurance:** none found for a company in our situation. These are routine products (judgement).

## 9. Sources

- **[c1]-[c6]** Bpifrance, innovation development aid (ADD), https://www.bpifrance.fr/catalogue-offres/aide-pour-le-developpement-de-linnovation, sha256 fcb3a134926e
- **[c8]** Bpifrance, innovation financing, https://www.bpifrance.fr/nos-solutions/financement/financement-innovation, sha256 bc08ef180a12
- **[c9]-[c17]** Bpifrance, Assurance Prospection, https://www.bpifrance.fr/Toutes-nos-solutions/Garanties-et-assurances/Assurance-prospection-a-l-international/Assurance-prospection-accompagnement, sha256 6a2970ab4fc3
- **[c19] [c20] [c23] [c24]** Service-public, innovation tax credit (CII), https://entreprendre.service-public.gouv.fr/vosdroits/F35494, sha256 9554f254ee85
- **[c30] [c32]** Service-public, research tax credit (CIR), https://entreprendre.service-public.gouv.fr/vosdroits/F23533, sha256 0c5af8a5e1d3
- **[c35] [c36] [c41] [c42]** Service-public, JEI, https://entreprendre.service-public.gouv.fr/vosdroits/F31188, sha256 48c81337e0cd
- **[c45] [c48] [c50]-[c53]** Bpifrance, Prêt Innovation, https://www.bpifrance.fr/catalogue-offres/pret-innovation-relance-invest-eu, sha256 ffb3e9e6a169
- **[c55] [c74]** Bpifrance, governance, https://www.bpifrance.fr/nous-decouvrir/gouvernance, sha256 b4d88599bd2f
- **[c57]-[c65]** Bpifrance, France 2030 call specification, https://www.bpifrance.fr/download/media-file/446915, sha256 9d329fb77209
- **[c66]** Bpifrance, i-Nov, https://www.bpifrance.fr/nos-appels-a-projets-concours/appel-a-projets-concours-dinnovation-i-nov, sha256 920a4e531813
- **[c67] [c70]** EIC Accelerator, https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en, sha256 520dd8b04621
- **[c77] [c81]** Assemblée nationale, État actionnaire annex, PLF 2025, sha256 33678d407aca
- **[c78] [c84]** Bpifrance, board of directors, https://www.bpifrance.fr/nous-decouvrir/conseil-administration, sha256 ed964f4c8ec6
- **[c83]** Assemblée nationale, PAP 2026 Économie, sha256 875fb7d3570b
- **[c85]** Assemblée nationale, PAP 2026 France 2030, sha256 0e64bd7277a7
- **[w1]** EIC Accelerator FAQ, https://eic.ec.europa.eu/eic-frequently-asked-questions/faqs-eic-accelerator_en, 24 Nov 2026: "Short proposals may be submitted at any time" (from a search summary, not fetched directly)
- **[w2]** les-aides.fr, regional call, https://les-aides.fr/aide/aHlv3w/bpifrance/appel-a-projets-transformation-des-pme-par-l-innovation-en-auvergne-rhone-alpes.html, 24 Nov 2026: "L'appel à projets est ouvert jusqu'au 31/12/2026" (secondary listing; confirm with Bpifrance)
- **[w4]** Maddyness, portrait of Bpifrance Deeptech Venture, https://www.maddyness.com/2025/07/10/que-font-les-fonds-le-portrait-de-bpifrance-deeptech-venture/, 24 Nov 2026: "prend le relais en série A et B avec des tickets compris entre 1,5 et 10 millions d'euros"
- **[w5]** Bpifrance, Large Venture, https://www.bpifrance.com/?p=3024, 24 Nov 2026: "minority stakes of a minimum of €10m ... in rounds of at least c.€20m"

## 10. Questions for the founder

1. **R&D programme: total cost, duration, start date.** These decide the innovation aid versus i-Nov, and the filing date.
2. **German budget over 24 months.** This sizes the export insurance. As an illustration, €600k at 65% would give about €390k of cover for an €18k premium (judgement).
3. **Main bank, and the cash gap on a German order.** This decides whether a Bpifrance-guaranteed working-capital line is a fourth route.
4. **Does any part of the programme stand alone as a sub-project?** That is the only way the regional call adds money before 31 December.

```mandate-board
{
  "title": "Series A: public money alongside the round",
  "stage": "write_up",
  "answer": {
    "lines": [
      "File the Bpifrance R&D aid before signing, so round-funded R&D stays eligible.",
      "Take the Bpifrance innovation loan right after close.",
      "Insure German prospecting with Bpifrance, once Germany is confirmed to qualify.",
      "No public co-investor in this round; EIC and Bpifrance equity wait for the next."
    ],
    "confidence": "medium",
    "confidence_why": "Cited gates are met by type; amounts and the Germany point await the CFO and Bpifrance.",
    "open_question": "Programme cost and start date; German budget; main bank and cash gap.",
    "cite": ["c3", "c45", "c50", "c9", "c36", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eic", "name": "EIC Accelerator (grant and/or equity)", "institution": "EISMEA / EIC Fund", "status": "park", "why": "Eligible single SME at TRL 6-8; calendar does not fit this close; next round.", "cite": ["c67", "c70", "w1"]}
      ]},
      {"id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
        {"id": "add", "name": "Innovation aid (ADD)", "institution": "Bpifrance", "status": "open", "why": "Lead: up to EUR 2M; file before any programme cost.", "cite": ["c1", "c2", "c3", "c5"]},
        {"id": "inov", "name": "i-Nov competition", "institution": "Bpifrance for France 2030", "status": "probe", "why": "Alternative if the programme is EUR 1-5M; jury and about 4 months appraisal.", "cite": ["c60", "c62", "c66"]},
        {"id": "f2030", "name": "Larger France 2030 calls", "institution": "SGPI, operated by Bpifrance", "status": "park", "why": "Only for a larger programme.", "cite": ["c65", "c85"]},
        {"id": "pret-innov", "name": "Prêt Innovation", "institution": "Bpifrance", "status": "open", "why": "Second: after close; unsecured, EUR 50k-2M.", "cite": ["c45", "c50", "c53"]},
        {"id": "ap", "name": "Assurance Prospection (Germany)", "institution": "Bpifrance", "status": "open", "why": "Third: products sold; confirm Germany counts as a market under prospection.", "cite": ["c9", "c14", "unverified"]},
        {"id": "bank-guar", "name": "Bank loan with Bpifrance guarantee", "institution": "Bpifrance, through your bank", "via": "main bank", "status": "probe", "why": "Export working capital; awaits the bank and the cash gap.", "cite": ["unverified"]},
        {"id": "dt2030", "name": "Deeptech 2030 fund (equity)", "institution": "Bpifrance Deeptech Venture", "status": "park", "why": "Dilutive and adds a committee to this close; next round.", "cite": ["w4"]},
        {"id": "large-venture", "name": "Large Venture", "institution": "Bpifrance", "status": "shut", "why": "Only rounds of about EUR 20M or more.", "cite": ["w5"]},
        {"id": "cii", "name": "Innovation tax credit (CII)", "institution": "Tax administration", "status": "probe", "why": "20% on prototype spend not in CIR, capped EUR 400k spend.", "cite": ["c19", "c20", "c23", "c24"]},
        {"id": "cir-jei", "name": "CIR and JEI", "institution": "Tax administration", "status": "open", "why": "Held; keep JEI's 50% capital test through the round.", "cite": ["c32", "c36"]}
      ]},
      {"id": "aura", "level": "regional", "label": "Auvergne-Rhône-Alpes", "country": "FR", "doors": [
        {"id": "aura-call", "name": "Transformation des PME par l'innovation", "institution": "State and Region, operated by Bpifrance", "status": "park", "why": "Only for a distinct sub-project filed by 31 Dec.", "cite": ["w2"]},
        {"id": "aura-loan", "name": "Prêt Région Industrie Croissance", "institution": "Région Auvergne-Rhône-Alpes", "status": "park", "why": "Small; terms unconfirmed.", "cite": ["unverified"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
        {"id": "de-entity", "name": "German promotional routes", "institution": "To research if an entity is opened", "status": "park", "why": "No entity outside France.", "cite": ["judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 12000000, "label": "Series A, plus non-dilutive headroom"},
    "instruments": [
      {"id": "vc", "name": "Series A equity (lead VC)", "type": "equity", "amount": 12000000, "terms": "Carries everything; dearest money, paid in dilution.", "status": "in_progress", "cite": ["judgement"]},
      {"id": "s-add", "name": "Bpifrance innovation aid (ADD)", "type": "grant", "amount": 500000, "amount_max": 2000000, "terms": "Carries the R&D programme; cheapest money; net of the CIR it displaces.", "status": "planned", "cite": ["c5", "c30", "c32"]},
      {"id": "s-pret", "name": "Prêt Innovation", "type": "loan", "amount": 500000, "amount_max": 2000000, "terms": "Carries hiring and launch; 7 years, 2 years deferral, unsecured.", "status": "planned", "cite": ["c50", "c51", "c53"]},
      {"id": "s-ap", "name": "Assurance Prospection", "type": "guarantee_debt", "amount": 390000, "terms": "Carries German prospecting; State shares the failure risk; 3% premium. Illustrative on EUR 600k at 65%.", "status": "probe", "cite": ["c13", "c14", "c17", "judgement"]},
      {"id": "s-taxes", "name": "CIR and JEI", "type": "customer_side", "terms": "Carries R&D payroll; already in hand.", "status": "secured", "cite": ["c32", "c42"]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "bpi-reg", "name": "Bpifrance, regional office (Grenoble)", "side": "public-capital", "country": "FR", "units": [{"id": "innov-reg", "name": "Innovation team in the region", "roles": [
        {"id": "head-innov-reg", "role": "Head of innovation, regional office", "priority": "P1", "reach": "Introduced by the innovation officer", "status": "to_approach", "cite": ["judgement"]},
        {"id": "cda", "role": "Innovation officer", "priority": "P2", "reach": "Regional contact page; first call this week", "status": "to_approach", "cite": ["c8"]}
      ]}]},
      {"id": "bpi-nat", "name": "Bpifrance, Direction Innovation", "side": "public-capital", "country": "FR", "units": [{"id": "dir-innov", "name": "Direction Innovation", "roles": [
        {"id": "exec-innov", "role": "Executive Director (escalation only)", "priority": "P2", "reach": "Through the regional head, on a blocked file", "status": "to_approach", "cite": ["c55"]}
      ]}]},
      {"id": "bpi-ae", "name": "Bpifrance export insurance", "side": "public-capital", "country": "FR", "units": [{"id": "ap-unit", "name": "Assurance Prospection team", "roles": [
        {"id": "ap-head", "role": "Head of prospecting insurance", "priority": "P1", "reach": "Through the regional international officer", "status": "to_approach", "cite": ["judgement"]},
        {"id": "ap-officer", "role": "Regional international officer", "priority": "P2", "reach": "Bpifrance regional office", "status": "to_approach", "cite": ["judgement"]},
        {"id": "exec-export", "role": "Executive Director, Direction Export (escalation only)", "priority": "P2", "reach": "Not a first contact", "status": "to_approach", "cite": ["c74"]}
      ]}]},
      {"id": "region", "name": "Région Auvergne-Rhône-Alpes", "side": "political", "country": "FR", "units": [{"id": "eco", "name": "Economy and innovation directorate", "roles": [
        {"id": "vp-eco", "role": "Regional vice-president for economy (only if the regional call is used)", "priority": "P1", "reach": "Through the regional innovation agency", "status": "to_approach", "cite": ["judgement"]},
        {"id": "dir-eco", "role": "Director of economic development", "priority": "P2", "reach": "Directorate switchboard", "status": "to_approach", "cite": ["judgement"]}
      ]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "1. R&D aid", "steps": [
        {"id": "call-bpi", "label": "First call with the Bpifrance innovation officer", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["c8"]},
        {"id": "file-aid", "label": "File the aid request before signing", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "depends_on": ["call-bpi"], "cite": ["c3"]},
        {"id": "start-prog", "label": "Start the R&D programme after filing", "start": 2, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["file-aid"], "cite": ["c3"]},
        {"id": "aid-decision", "label": "Aid decision", "start": 3, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["file-aid"], "cite": ["unverified"]}
      ]},
      {"id": "round", "label": "Series A", "steps": [
        {"id": "jei-check", "label": "JEI 50% test on the post-money cap table", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["c36"]},
        {"id": "sign", "label": "Sign the Series A", "start": 1.5, "end": 2.5, "owner": "client", "status": "planned", "depends_on": ["file-aid"], "cite": ["judgement"]},
        {"id": "pret", "label": "Apply for the Prêt Innovation", "start": 2.5, "end": 3.5, "owner": "client", "status": "planned", "depends_on": ["sign"], "cite": ["c45", "c50"]},
        {"id": "no-equity", "label": "Not yet: no public co-investor on this close", "start": 0, "end": 2.5, "owner": "us", "status": "blocked", "cite": ["judgement"]}
      ]},
      {"id": "germany", "label": "3. Germany", "steps": [
        {"id": "de-budget", "label": "CFO sets the 24-month German budget", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "ap-ask", "label": "Ask Bpifrance whether Germany qualifies", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "ap-file", "label": "Apply for Assurance Prospection before new German spend", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "depends_on": ["ap-ask", "de-budget"], "cite": ["c10"]},
        {"id": "de-spend", "label": "Not yet: no new German hire, fair or agency contract before the start date is confirmed", "start": 0, "end": 1.5, "owner": "client", "status": "blocked", "cite": ["unverified"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-aura", "label": "Regional call listed close", "start": "2026-12-31", "milestone": true, "owner": "us", "status": "planned", "cite": ["w2"]},
        {"id": "w-ap-market", "label": "Bpifrance answer: does Germany qualify?", "start": 0.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-eic", "label": "EIC Accelerator 2027 cut-offs, for the next round", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"]},
        {"id": "w-dt", "label": "Deeptech 2030 fund, for the next round", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["w4"]},
        {"id": "w-jei", "label": "JEI 50% test at every future round", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["c36"]},
        {"id": "w-de-entity", "label": "German entity decision reopens German routes", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "process_maps": [
    {
      "id": "add-map",
      "title": "How the Bpifrance innovation aid runs (lead route)",
      "explains": "Talk to the regional officer, file before any cost, appraisal, decision, payment in tranches.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "co", "name": "Your company", "side": "market"},
        {"id": "bpi-r", "name": "Bpifrance regional innovation team", "side": "public-capital"}
      ],
      "steps": [
        {"id": "add-call", "label": "First call with the innovation officer", "kind": "step", "actor": "bpi-r", "timing": "this week", "cite": ["c8"], "gates": [{"label": "Programme scope, budget and start date ready", "cite": ["judgement"]}]},
        {"id": "add-file", "label": "File the aid request", "kind": "document", "actor": "co", "timing": "2-4 weeks", "cite": ["c3"], "gates": [{"label": "SME under the EU definition", "cite": ["c1"]}, {"label": "Registered in France", "cite": ["c2"]}, {"label": "No programme cost before filing", "cite": ["c3"]}, {"label": "Programme of at most 36 months", "cite": ["c6"]}]},
        {"id": "add-appraise", "label": "Appraisal and decision", "kind": "decision", "actor": "bpi-r", "timing": "unverified", "cite": ["unverified"]},
        {"id": "add-pay", "label": "Paid in 2 or 3 tranches", "kind": "step", "actor": "bpi-r", "cite": ["c4"], "gates": [{"label": "Up to EUR 2M, grant and repayable advance", "cite": ["c5"]}]}
      ],
      "flow": [{"from": "add-call", "to": "add-file"}, {"from": "add-file", "to": "add-appraise"}, {"from": "add-appraise", "to": "add-pay"}],
      "leverage": [
        {"id": "add-window", "at": "add-file", "kind": "timing_window", "label": "File before the Series A signing", "why": "Costs before filing are ineligible.", "how": "Date the programme start after the filing.", "side": "public-capital", "cite": ["c3"]},
        {"id": "add-signal", "at": "add-appraise", "kind": "pressure_point", "label": "VC term sheet and JEI status", "why": "Shows private due diligence and R&D intensity.", "how": "Attach both to the file.", "side": "public-capital", "cite": ["judgement"]}
      ],
      "cite": ["c3", "c8"]
    },
    {
      "id": "ap-map",
      "title": "How the export-prospecting insurance runs",
      "explains": "Apply online, half advanced at signing, balance on a statement of spend, repayment tied to German sales.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "co", "name": "Your company", "side": "market"},
        {"id": "bpi-int", "name": "Bpifrance export insurance", "side": "public-capital"}
      ],
      "steps": [
        {"id": "ap-apply", "label": "Apply online with the German budget", "kind": "document", "actor": "co", "cite": ["c10"], "gates": [{"label": "12-month balance sheet, products already sold", "cite": ["c9"]}, {"label": "Germany confirmed as a market under prospection", "cite": ["unverified"]}]},
        {"id": "ap-sign", "label": "Contract signed; 50% advance", "kind": "decision", "actor": "bpi-int", "cite": ["c11"], "gates": [{"label": "3% premium on the guaranteed budget", "cite": ["c17"]}]},
        {"id": "ap-statement", "label": "Balance on a statement of eligible spend", "kind": "document", "actor": "co", "cite": ["c12"]},
        {"id": "ap-repay", "label": "Repay 30% minimum plus a share of German turnover, or the State bears it", "kind": "step", "actor": "co", "cite": ["c13"]}
      ],
      "flow": [{"from": "ap-apply", "to": "ap-sign"}, {"from": "ap-sign", "to": "ap-statement"}, {"from": "ap-statement", "to": "ap-repay"}],
      "cite": ["c10"]
    }
  ],
  "hierarchies": [
    {
      "id": "field",
      "title": "Who sits under whom (France, region, EU)",
      "explains": "Bpifrance carries national, regional and export money; the tax office runs CIR and JEI.",
      "nodes": [
        {"id": "bpi", "label": "Bpifrance", "kind": "institution", "cite": ["c77"]},
        {"id": "bpi-innov", "label": "Direction Innovation", "kind": "division", "parent": "bpi", "cite": ["c55"]},
        {"id": "bpi-regions", "label": "Innovation officers in the regions (Grenoble)", "kind": "unit", "parent": "bpi-innov", "cite": ["c8"]},
        {"id": "add", "label": "Innovation aid ADD", "kind": "instrument", "parent": "bpi-innov", "status": "open", "cite": ["c5"]},
        {"id": "pret-innov", "label": "Prêt Innovation", "kind": "instrument", "parent": "bpi-innov", "status": "open", "cite": ["c50"]},
        {"id": "inov", "label": "i-Nov", "kind": "programme", "parent": "bpi-innov", "status": "probe", "cite": ["c66"]},
        {"id": "ap", "label": "Assurance Prospection", "kind": "instrument", "parent": "bpi", "status": "open", "cite": ["c14", "c83"]},
        {"id": "bpi-dtv", "label": "Deeptech 2030 fund", "kind": "division", "parent": "bpi", "status": "park", "cite": ["w4"]},
        {"id": "bpi-lv", "label": "Large Venture", "kind": "programme", "parent": "bpi", "status": "shut", "cite": ["w5"]},
        {"id": "aura-call", "label": "AURA regional call", "kind": "regional_body", "parent": "bpi", "status": "park", "cite": ["w2"]},
        {"id": "dgfip", "label": "Tax administration", "kind": "institution", "cite": ["c28"]},
        {"id": "cir", "label": "CIR", "kind": "instrument", "parent": "dgfip", "status": "open", "cite": ["c32"]},
        {"id": "jei", "label": "JEI", "kind": "instrument", "parent": "dgfip", "status": "open", "cite": ["c36"]},
        {"id": "eic", "label": "EIC Accelerator (EU)", "kind": "programme", "status": "park", "cite": ["c70"]}
      ],
      "cite": ["c55", "c8"]
    }
  ],
  "networks": [
    {
      "id": "bpi-oversight",
      "title": "Who stands behind Bpifrance",
      "explains": "State and Caisse des Dépôts own it; the State mandates export insurance; France 2030 runs through it.",
      "nodes": [
        {"id": "etat", "label": "French State", "kind": "ministry", "cite": ["c81"]},
        {"id": "cdc", "label": "Caisse des Dépôts", "kind": "institution", "cite": ["c77"]},
        {"id": "bpi-n", "label": "Bpifrance", "kind": "bank", "cite": ["c77"]},
        {"id": "sgpi", "label": "General Secretariat for Investment (France 2030)", "kind": "body", "cite": ["c85"]},
        {"id": "mef", "label": "Ministry of the Economy", "kind": "ministry", "cite": ["c83"]},
        {"id": "regions", "label": "Régions (two on the board)", "kind": "body", "cite": ["c84"]}
      ],
      "edges": [
        {"from": "etat", "to": "bpi-n", "kind": "oversees", "label": "49.18% direct", "cite": ["c81"]},
        {"from": "cdc", "to": "bpi-n", "kind": "sits_on", "label": "chairs the board", "cite": ["c78"]},
        {"from": "sgpi", "to": "bpi-n", "kind": "funds", "label": "France 2030 operator", "cite": ["c85"]},
        {"from": "mef", "to": "bpi-n", "kind": "funds", "label": "export insurance for the State", "cite": ["c83"]},
        {"from": "regions", "to": "bpi-n", "kind": "sits_on", "cite": ["c84"]}
      ],
      "cite": ["c77", "c83", "c85"]
    }
  ],
  "risks_flags": [
    {"id": "seq-close", "kind": "deal_breaker", "severity": "high", "title": "R&D aid: no cost before the filing date", "fix": "File before signing; date the programme start after filing.", "cite": ["c3", "c57"]},
    {"id": "jei-cap", "kind": "flag", "severity": "medium", "title": "JEI 50% capital test after the round", "fix": "Lawyer checks the post-money cap table now.", "cite": ["c36"]},
    {"id": "ap-market", "kind": "flag", "severity": "medium", "title": "Germany may not qualify as a market under prospection", "fix": "Ask Bpifrance before filing; consider the next country.", "cite": ["unverified"]},
    {"id": "wc-export", "kind": "flag", "severity": "medium", "title": "Export working capital before customer payment", "fix": "CFO sizes the gap; research a guaranteed line via the main bank.", "cite": ["judgement"]},
    {"id": "cir-deduct", "kind": "flag", "severity": "low", "title": "Grants reduce the CIR base", "fix": "Count aid net of the CIR it displaces.", "cite": ["c30"]},
    {"id": "stacking", "kind": "flag", "severity": "low", "title": "Two aids on one cost not confirmed", "fix": "Confirm with Bpifrance before adding the regional call.", "cite": ["unverified"]},
    {"id": "regina-de", "kind": "flag", "severity": "low", "title": "Product compliance for selling the sensors in Germany", "fix": "Handed to Regina.", "cite": ["judgement"]}
  ]
}
```

## Turn 11: the founder (answer, client_agent)

> Thanks, this works for the board. I'm not sure whether any part of the programme stands alone as its own sub-project. I'll check with our R&D lead this week and come back to you before the end of December.

## Turn 11: Wincent

Good. One timing point: **the regional call is listed as closing on 31 December 2026 [w2]**. If your R&D lead's answer arrives in late December, there won't be time to build a file. Aim for an answer by around 12 December. That leaves two weeks to confirm the date and fit with Bpifrance and to file (judgement).

To make the check quick, a sub-project stands alone if it has (judgement):
- its own objective and deliverable, for example a feasibility study or a pre-industrialisation step on one sensor line;
- its own budget lines, so no cost is also claimed under the main innovation aid. Confirm with Bpifrance that the two may combine (unverified);
- costs not yet incurred, since work started before filing does not count [c57].

The regional call also requires equity at least equal to the aid requested [w2]. After the round, that should be easy to meet (judgement).

**Don't let this hold up the main filing.** The call with the Bpifrance innovation officer and the innovation aid request should go ahead this week regardless [c3] [c8]. In the same call, ask the officer about the regional call's current closing date and whether it can sit alongside the innovation aid. Bpifrance runs both [w2].

When you're back with the answer, I'll update the plan and the board.

```mandate-board
{
  "title": "Series A: public money alongside the round",
  "stage": "write_up",
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "regional", "label": "Regional call (conditional)", "steps": [
        {"id": "subproj-check", "label": "R&D lead checks whether a sub-project stands alone", "start": 0, "end": 0.6, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "subproj-answer", "label": "Answer back, to leave two weeks to file", "start": "2026-12-12", "milestone": true, "owner": "client", "status": "planned", "depends_on": ["subproj-check"], "cite": ["judgement"]},
        {"id": "aura-file", "label": "If yes: file the regional call before it closes", "start": 0.6, "end": 1.2, "owner": "client", "status": "planned", "depends_on": ["subproj-answer"], "cite": ["w2"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-aura", "label": "Regional call listed close: confirm with the Bpifrance officer in the first call", "start": "2026-12-31", "milestone": true, "owner": "us", "status": "planned", "cite": ["w2"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "aura-deadline", "kind": "flag", "severity": "medium", "title": "An answer in late December leaves no time to file the regional call", "fix": "Answer by about 12 December; confirm the close date with Bpifrance this week.", "cite": ["w2", "judgement"]},
    {"id": "stacking", "kind": "flag", "severity": "low", "title": "Regional call and innovation aid on separate costs only", "fix": "Give the sub-project its own budget lines; confirm stacking with Bpifrance.", "cite": ["unverified"]}
  ]
}
```

## Turn 12: the founder (brief, script)

> We are running out of time on our side. Can you write up what we have as a brief now?

## Turn 12: Wincent

# Board brief: public money alongside the Series A (final)

*24 November 2026. A French SAS near Grenoble, industrial sensors, raising €12M.*

## 1. Answer

Put public money next to the round as **non-dilutive** money, in this order:

1. **Bpifrance innovation aid, filed before we sign.** Costs incurred before the filing date are not eligible [c3].
2. **Bpifrance innovation loan, right after close.** €50k to €2M, unsecured [c50] [c53].
3. **Bpifrance export-prospecting insurance for Germany**, once Bpifrance confirms Germany qualifies (unverified).

Keep public equity out of this round (judgement). Waiting until after close for the non-dilutive money would make the first months of round-funded R&D ineligible [c3] [c57].

## 2. Where we stand

- **Company.** SAS created in 2021, 30 staff in France, half in R&D, no entity abroad.
- **Status held.** JEI since 2022, and we claim the research tax credit [c32] [c41].
- **France, national level: open.** We meet the aid and loan gates: registered in France and over three years old [c1] [c2] [c45].
- **Région Auvergne-Rhône-Alpes: conditional.** It depends on whether a sub-project stands alone. The call pays €75k to €500k, requires equity at least equal to the aid, and is listed as closing on 31 December 2026 [w2].
- **Germany: support comes from France.** German routes are parked until we open an entity there (judgement). We meet the insurance's "products on sale" gate [c9].
- **EU: parked to the next round.** We are eligible for the EIC Accelerator [c67] [c70], but its calendar does not fit this close [w1].

## 3. Flags

- **High: costs before filing are not eligible for the R&D aid** [c3] [c57]. Fix: file before signing.
- **Medium: JEI's 50% capital test after the round** [c36]. Fix: cap-table check this week.
- **Medium: Germany may not qualify as a market under prospection** (unverified). Fix: ask Bpifrance before filing.
- **Medium: an answer on the sub-project in late December is too late for the regional call** (judgement). Fix: answer by about 12 December.
- **Medium: export working capital before customers pay** (judgement). Fix: CFO sizes the gap; research a guaranteed line through our main bank (unverified).
- **Low: grants reduce the research tax credit base** [c30]. Fix: count aid net of the credit it displaces.
- **Low: two aids on the same cost** (unverified). Fix: separate budget lines; confirm with Bpifrance.
- **Regulatory: product compliance for our sensors in Germany.** Handed to Regina.

## 4. Decisions

1. **File the aid request before signing.** Recommended: yes.
2. **Innovation aid or i-Nov.** Innovation aid if the programme is under €2M [c5]. i-Nov if it is €1 to 5M [c66], which is heavier: a jury, then about four months of appraisal [c60] [c62].
3. **No public co-investor in this round.** Recommended: yes. Bpifrance's deep-tech fund [w4] and the EIC wait for the next round. Large Venture is shut because our round is below about €20M [w5].

## 5. Actions and draft

- **This week, CEO and CFO:** call the Bpifrance innovation officer in Grenoble (P2) [c8]. The P1 is the regional head of innovation (judgement). In the same call, ask about the regional call's closing date and whether it can stack with the innovation aid.
- **This week, lawyer:** JEI cap-table check [c36].
- **This week, CFO:** ask Bpifrance's export insurance team whether Germany qualifies (unverified).
- **By about 12 December, R&D lead:** does a sub-project stand alone, with its own objective, its own budget lines and no work started [c57] (judgement)?

**Draft for the founder to send** (to the Bpifrance innovation officer):

> Objet : Programme R&D capteurs industriels et série A : demande de rendez-vous
>
> Madame, Monsieur,
>
> SAS iséroise de capteurs industriels, JEI depuis 2022, 30 personnes dont la moitié en R&D, nous finalisons une série A de 12 M€ ; nos premiers clients export sont en Allemagne.
>
> Cette levée finance un programme de R&D industrielle que nous souhaitons engager avec Bpifrance. Pourrions-nous vous le présenter dans les quinze jours, afin de déposer une demande d'aide avant le démarrage des travaux ?
>
> Avec nos remerciements,
> [Nom], Président

## 6. Plan

- **This week:** the Bpifrance call, the JEI check, the export insurance question, the sub-project check.
- **By 12 December:** the sub-project answer. If yes, file the regional call before 31 December [w2].
- **This month:** file the innovation aid [c3]. If Germany qualifies, file the export insurance before any new German spend [c10].
- **This quarter:** sign the round, start the programme after the filing, apply for the loan [c45].
- **Later:** a decision on a German entity; EIC and Bpifrance equity at the next round.
- **Not yet:** a public co-investor in this round; German spend before the insurance's start date is confirmed (unverified).

## 7. Watches

- **Regional call:** closes 31 December 2026 [w2].
- **Bpifrance on Germany** (unverified).
- **EIC Accelerator:** 2027 deadlines not yet published [w1].
- **Deeptech 2030 fund:** next round [w4].
- **JEI:** the 50% capital test at each round [c36].
- **German entity:** would reopen German routes (judgement).

## 8. Precedents

- **i-Nov:** a sensor company, EnerBee, appears among the winners (register record, [i-Nov register](https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-laureats-concours-i-nov/)).
- **Innovation aid, loan, export insurance, regional call:** none found for a company in our situation (judgement: routine products).

## 9. Sources

- **[c1]-[c6]** Bpifrance, innovation aid (ADD), https://www.bpifrance.fr/catalogue-offres/aide-pour-le-developpement-de-linnovation, fcb3a134926e
- **[c8]** Bpifrance, innovation financing, https://www.bpifrance.fr/nos-solutions/financement/financement-innovation, bc08ef180a12
- **[c9]-[c17]** Bpifrance, Assurance Prospection, https://www.bpifrance.fr/Toutes-nos-solutions/Garanties-et-assurances/Assurance-prospection-a-l-international/Assurance-prospection-accompagnement, 6a2970ab4fc3
- **[c30] [c32]** Service-public, research tax credit (CIR), https://entreprendre.service-public.gouv.fr/vosdroits/F23533, 0c5af8a5e1d3
- **[c36] [c41]** Service-public, JEI, https://entreprendre.service-public.gouv.fr/vosdroits/F31188, 48c81337e0cd
- **[c45] [c50] [c53]** Bpifrance, Prêt Innovation, https://www.bpifrance.fr/catalogue-offres/pret-innovation-relance-invest-eu, ffb3e9e6a169
- **[c57] [c60] [c62]** Bpifrance, France 2030 call specification, https://www.bpifrance.fr/download/media-file/446915, 9d329fb77209
- **[c66]** Bpifrance, i-Nov, https://www.bpifrance.fr/nos-appels-a-projets-concours/appel-a-projets-concours-dinnovation-i-nov, 920a4e531813
- **[c67] [c70]** EIC Accelerator, https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en, 520dd8b04621
- **[w1]** EIC Accelerator FAQ, https://eic.ec.europa.eu/eic-frequently-asked-questions/faqs-eic-accelerator_en, 24 Nov 2026: "Short proposals may be submitted at any time" (from a search summary)
- **[w2]** les-aides.fr, regional call, https://les-aides.fr/aide/aHlv3w/bpifrance/appel-a-projets-transformation-des-pme-par-l-innovation-en-auvergne-rhone-alpes.html, 24 Nov 2026: "L'appel à projets est ouvert jusqu'au 31/12/2026" (secondary; confirm with Bpifrance)
- **[w4]** Maddyness, https://www.maddyness.com/2025/07/10/que-font-les-fonds-le-portrait-de-bpifrance-deeptech-venture/, 24 Nov 2026: "tickets compris entre 1,5 et 10 millions d'euros"
- **[w5]** Bpifrance, Large Venture, https://www.bpifrance.com/?p=3024, 24 Nov 2026: "in rounds of at least c.€20m"

## 10. Open questions

1. **Does a sub-project stand alone?** This decides the regional call. Answer by about 12 December.
2. **The R&D programme's cost, duration and start date.** This decides the innovation aid versus i-Nov, and the filing date.
3. **The German budget over 24 months.** This sizes the insurance. As an illustration, €600k at 65% gives about €390k of cover for an €18k premium (judgement).
4. **Main bank and the cash gap on an order.** This decides a possible fourth route.

```mandate-board
{
  "title": "Series A: public money alongside the round",
  "stage": "write_up",
  "answer": {
    "lines": [
      "File the Bpifrance R&D aid before signing, so round-funded R&D stays eligible.",
      "Take the Bpifrance innovation loan right after close.",
      "Insure German prospecting with Bpifrance, once Germany is confirmed to qualify.",
      "Regional call only if a sub-project stands alone, answered by about 12 December."
    ],
    "confidence": "medium",
    "confidence_why": "Cited gates are met by type; amounts, Germany and the sub-project await the team and Bpifrance.",
    "open_question": "Does a sub-project stand alone? Programme cost and start; German budget; main bank.",
    "cite": ["c3", "c45", "c50", "c9", "w2", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "aura", "level": "regional", "label": "Auvergne-Rhône-Alpes", "country": "FR", "doors": [
        {"id": "aura-call", "name": "Transformation des PME par l'innovation", "institution": "State and Region, operated by Bpifrance", "status": "probe", "why": "Conditional on a stand-alone sub-project; listed close 31 Dec 2026.", "conditions": ["Own objective and budget lines", "Work not started", "Equity at least the aid"], "cite": ["w2", "c57", "judgement"]}
      ]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "regional", "label": "Regional call (conditional)", "steps": [
        {"id": "subproj-check", "label": "R&D lead checks whether a sub-project stands alone", "start": 0, "end": 0.6, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "subproj-answer", "label": "Answer back", "start": "2026-12-12", "milestone": true, "owner": "client", "status": "planned", "depends_on": ["subproj-check"], "cite": ["judgement"]},
        {"id": "aura-file", "label": "If yes: file before the call closes", "start": 0.6, "end": 1.2, "owner": "client", "status": "planned", "depends_on": ["subproj-answer"], "cite": ["w2"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-aura", "label": "Regional call listed close", "start": "2026-12-31", "milestone": true, "owner": "us", "status": "planned", "cite": ["w2"]},
        {"id": "w-subproj", "label": "Sub-project answer from the R&D lead", "start": "2026-12-12", "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "aura-deadline", "kind": "flag", "severity": "medium", "title": "A late-December answer leaves no time to file the regional call", "fix": "Answer by about 12 December; confirm the close date in the first Bpifrance call.", "cite": ["w2", "judgement"]},
    {"id": "stacking", "kind": "flag", "severity": "low", "title": "Regional call and innovation aid on separate costs only", "fix": "Separate budget lines; confirm stacking with Bpifrance.", "cite": ["unverified"]}
  ]
}
```
