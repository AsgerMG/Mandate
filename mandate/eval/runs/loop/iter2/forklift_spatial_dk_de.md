# Loop run: forklift_spatial_dk_de (iter2)

Case: `mandate/eval/scenarios/forklift_spatial_dk_de.yaml`. Brain: Wincent. Playbooks at ef145a73c9 (+uncommitted edits). One-reply re-test on the bench (no API spend), 2026-11-16T16:57:10+00:00, 323.5s.
Leave-one-out case library: 3 entries derived from this case left out (forklift_mispriced_market_velocity, forklift_regulatory_flag_to_regina, forklift_risk_not_to_customer); reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We build spatial-awareness hardware fitted to forklifts and other intralogistics vehicles, with monitoring software. HQ in Denmark (ApS) with a German subsidiary (GmbH). We deploy like a system integrator: we carry all upfront costs (hardware, installation, integration) and the customer pays only once everything runs. That working-capital burden holds back our scaling. What can we do at state level to get cheaper capital for this model? And we are about to raise an equity round: can we get public equity into the round?
> 
> More about us, so you can answer in one go: The Danish ApS signs most contracts, including German ones; hardware is assembled in Denmark from EU components. Hardware stays on our balance sheet until go-live, then passes to the customer. Revenue about EUR 6M, 45 staff. Raising EUR 12M Series A, lead in talks, close in about four months. The GmbH sits in Bavaria.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

I worked the case from the institutions' own published pages. Our internal database wasn't reachable from this session, so every source below is a web source that I fetched today.

## Answer

**Working capital: Denmark is where to start.** The Danish ApS signs the contracts and carries the hardware until go-live. So the support for that cost has to come through the ApS's bank, with EIFO taking part of the loss.
- EIFO-kaution is a loss guarantee to the bank. It explicitly covers "konkrete ordrer fx oparbejdningskreditter" (credits for specific orders while the work is in progress) and "løbende arbejdskapital" (ongoing working capital) [w1].
- It covers up to 80% of the loss on the facility, capped at 50% of the bank's total loss on you. The premium is 0.8% to 6.3% a year, the term is up to three years and the minimum facility is DKK 2M [w1].
- Conditions: positive equity, at most 499 staff, and the financing must add to what the bank already lends you [w1].

**Equity: yes, two public co-investors can sit in the round.**
- **EIFO** invests directly in "highly scalable Danish companies with global ambitions" and wants "Denmark as their base" [w5].
- **Bayern Kapital's Wachstumsfonds Bayern 2** invests €2M to €8M (exceptionally up to €10M). It only co-invests: at least one private investor must invest on the same terms, and it never leads. It requires a "Sitz oder Betriebsstätte in Bayern" (a registered seat or business site in Bavaria) [w6].

**The precedent that matters.** Subra, a company headquartered in Denmark, bought the German producer THEVA. Bayern Kapital then added €10M as a second closing to complete Subra's €50M Series A [w7][w8]. So a Danish-HQ round can take Bavarian public equity. It can also come in after the lead closes, so it need not slow your four months down.

## The money logic

| Cost | Right money | Why |
|---|---|---|
| Hardware and installation until go-live | Bank credit for work in progress, guaranteed by EIFO | The customer's payment repays it. EIFO carrying 80% of the loss is what makes it cheap [w1] |
| Team, product, market build | Series A equity | The dearest money: it dilutes you permanently and investors expect venture returns (judgement) |

**Illustration (my assumptions; please send the real figures):**
- Say upfront cost is 55% of contract value and it takes 6 months to get paid.
- Today about €1.65M is tied up (€6M × 0.55 × 6/12).
- At €15M revenue that becomes about €4.1M.
- A €4M line that turns over twice a year carries about €14.5M of contract value. Without it, roughly a third of your Series A would sit in installed but unpaid hardware.

**How to pitch it.** Banks misprice the time between installation and go-live, and EIFO's mission is to grow Danish exports. Your German contracts are exports from the ApS (judgement).

## What is shut and what not to do yet

- **Bavarian and federal German loans: no route today.** The GmbH holds neither the contracts nor the hardware, so it has no working capital to finance (judgement). LfA's Universalkredit with a 60% release of the bank's risk would only fit if the GmbH carried the cost (unverified).
- **Don't move the German contracts into the GmbH just to chase a German loan.** The tax and VAT consequences outweigh the benefit (judgement).
- **Don't fold existing credit lines into the EIFO facility.** It has to be new lending [w1].
- **Don't sign a term sheet that rules out a second closing.**

## Other routes

- **EU cover through your bank.** Danske Bank's EIF guarantee under InvestEU, the EU's investment programme, reaches SMEs in Denmark and makes lending cheaper "by reducing our lending risk" [w4]. Ask whether your bank has such cover. Whether it can sit on the same facility as an EIFO guarantee is unverified; ask EIFO.
- **EIC Accelerator (EU).** It invests €1M to €10M in equity. Full-proposal cut-offs are 20 Jan and 17 Mar 2027, after a short proposal that takes 4 to 6 weeks to assess [w9]. That is too slow for your close. It is a probe for a later extension, and the odds are low for a product already earning revenue (judgement).
- **EIFO Match Loan.** I've left it out: it is for early-stage companies with small tickets (unverified).

**Regulatory point for Regina.** You fit safety hardware to existing forklifts. That may engage the new EU Machinery Regulation (from 20 Jan 2027, unverified) and possibly the AI Act. I'm passing it to Regina rather than analysing it here.

## Two questions decide the equity route

1. **What does the GmbH actually do in Bavaria (staff, installation teams, a site)?** Bayern Kapital invests only in a company with a seat or business site there [w6]. Subra brought a real German production facility [w8].
2. **Which banks do you use, and does your lead's fund have EIFO, EIF or KfW Capital among its investors?** If it does, public money is already in your round through the lead (judgement).

```mandate-board
{
  "title": "Forklift spatial-awareness: cheaper deployment capital and public equity in the Series A",
  "stage": "options",
  "answer": {
    "lines": [
      "Working capital: EIFO-kaution on a new work-in-progress line at the ApS's bank; EIFO carries up to 80% of the loss.",
      "Equity: EIFO direct and Bayern Kapital Wachstumsfonds Bayern 2 as co-investors; Bayern Kapital can join as a second closing.",
      "Bavarian/German loans: no route today, because the GmbH carries neither contracts nor hardware."
    ],
    "confidence": "medium",
    "confidence_why": "Danish guarantee conditions read from EIFO's own sheet; Bayern Kapital hinges on the GmbH's Bavarian substance.",
    "open_question": "What does the GmbH do in Bavaria, and which banks and fund LPs are already around you?",
    "cite": ["w1", "w5", "w6", "w7"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "investeu-bank", "name": "InvestEU guarantee via your bank", "institution": "EIF through Danish banks", "via": "your bank", "status": "probe", "why": "Danske Bank holds EIF InvestEU cover for Danish SMEs; check your own bank.", "cite": ["w4"] },
      { "id": "eic", "name": "EIC Accelerator equity", "institution": "European Innovation Council", "status": "park", "why": "EUR 1-10M equity but 2027 cut-offs miss the close; fit doubtful for a revenue-stage product.", "cite": ["w9", "judgement"] }
    ] },
    { "id": "dk", "level": "national", "label": "Denmark", "country": "DK", "doors": [
      { "id": "eifo-kaution", "name": "EIFO-kaution on a work-in-progress credit", "institution": "EIFO", "via": "the ApS's bank", "status": "open", "why": "Covers order-specific work-in-progress credits and working capital; ApS fits the size tests.", "conditions": ["Positive equity, creditworthy", "Max 499 staff group-wide", "Must add to the bank's lending", "Bank facility from DKK 2M"], "cite": ["w1"] },
      { "id": "eifo-growth-guarantee", "name": "Growth Guarantee (performance / advance-payment guarantees)", "institution": "EIFO", "status": "probe", "why": "If German customers ask for performance bonds or accept milestone prepayments against a guarantee.", "cite": ["w2"] },
      { "id": "eifo-venture", "name": "EIFO direct equity", "institution": "EIFO", "status": "probe", "why": "Invests directly in scalable Danish companies with Denmark as base.", "cite": ["w5"] },
      { "id": "eifo-leasing", "name": "Operational leasing guarantee", "institution": "EIFO", "status": "park", "why": "Covers an exporter leasing to foreign customers; it changes the business model, so keep it for later.", "cite": ["w3", "judgement"] },
      { "id": "eifo-match", "name": "Match Loan", "institution": "EIFO", "status": "shut", "why": "Built for early-stage companies with small tickets.", "cite": ["unverified"] }
    ] },
    { "id": "by", "level": "regional", "label": "Bavaria", "country": "DE", "doors": [
      { "id": "bk-wachstum", "name": "Wachstumsfonds Bayern 2", "institution": "Bayern Kapital", "status": "probe", "why": "EUR 2-8M co-investment; requires a seat or business site in Bavaria and a private co-investor on the same terms.", "conditions": ["Private investor at least the same amount, same terms", "No lead role", "Company applies with the investor's statement"], "cite": ["w6"] },
      { "id": "lfa", "name": "LfA Universalkredit with risk release", "institution": "LfA Förderbank Bayern", "via": "German house bank", "status": "shut", "why": "The GmbH carries no contracts or hardware, so it has no working capital to finance.", "cite": ["judgement", "unverified"] }
    ] },
    { "id": "de", "level": "national", "label": "Germany (federal)", "country": "DE", "doors": [
      { "id": "kfw", "name": "KfW / ERP working-capital loans", "institution": "KfW", "via": "German house bank", "status": "park", "why": "Same structural mismatch as LfA: the GmbH holds nothing to finance.", "cite": ["judgement"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "debt", "label": "Working-capital line", "steps": [
      { "id": "wip-numbers", "label": "Pull real figures: upfront cost per deployment, months to payment, pipeline", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["judgement"] },
      { "id": "bank-ask", "label": "Ask the bank: EIFO-kaution and InvestEU cover on a new work-in-progress line", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "depends_on": ["wip-numbers"], "cite": ["w1", "w4"] },
      { "id": "eifo-rating", "label": "EIFO rates the ApS and sends an offer to the bank", "start": 1, "end": 3, "owner": "institution", "status": "planned", "depends_on": ["bank-ask"], "cite": ["unverified"] },
      { "id": "line-signed", "label": "Guaranteed line signed after the Series A lifts equity", "start": 4.5, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["eifo-rating", "close"], "cite": ["w1"] },
      { "id": "no-refi", "label": "Not yet: do not fold existing credit lines into the guaranteed facility (must be new lending)", "start": 0, "end": 4.5, "owner": "client", "status": "blocked", "cite": ["w1"] }
    ] },
    { "id": "equity", "label": "Series A with public co-investors", "steps": [
      { "id": "lead-ask", "label": "Ask the lead: fund LPs, openness to EIFO and Bayern Kapital, room for a second closing", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["judgement"] },
      { "id": "eifo-intro", "label": "EIFO venture intro via the lead", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "depends_on": ["lead-ask"], "cite": ["w5"] },
      { "id": "bk-call", "label": "Bayern Kapital call: test the Bavarian site condition with the GmbH's substance", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "depends_on": ["lead-ask"], "cite": ["w6", "w7"] },
      { "id": "bk-apply", "label": "Bayern Kapital application with the lead's statement", "start": 2, "end": 4, "owner": "client", "status": "planned", "depends_on": ["bk-call"], "cite": ["w6"] },
      { "id": "close", "label": "First closing", "start": 4, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"] },
      { "id": "second-close", "label": "Second closing for public co-investors if needed", "start": 6, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["close"], "cite": ["w7"] },
      { "id": "no-move", "label": "Not yet: do not move German contracts into the GmbH to chase German loans", "start": 0, "end": 4, "owner": "client", "status": "blocked", "cite": ["judgement"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-eic", "label": "EIC Accelerator cut-off 17 Mar 2027: decide by January whether to file a short proposal", "start": "2027-03-17", "milestone": true, "owner": "us", "status": "planned", "cite": ["w9"] },
      { "id": "w-investeu", "label": "InvestEU folding into the European Competitiveness Fund: do bank guarantees stay as they are?", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-kaution", "label": "EIFO-kaution terms and annual re-rating", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-bk", "label": "Wachstumsfonds Bayern 2 capacity and site rule", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["w6"] },
      { "id": "w-lfa", "label": "Bavarian loans reopen only if the GmbH ever carries German deployments", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"] },
      { "id": "w-machinery", "label": "EU Machinery Regulation applies (Regina)", "start": "2027-01-20", "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "bank", "name": "The ApS's relationship bank", "side": "market", "country": "DK", "units": [
      { "id": "bank-credit", "name": "Corporate credit", "roles": [
        { "id": "bank-p1", "role": "Head of corporate credit for the region", "priority": "P1", "reach": "Through the relationship manager", "status": "to_approach", "cite": ["judgement"] },
        { "id": "bank-p2", "role": "Relationship manager", "priority": "P2", "reach": "Existing contact", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "eifo", "name": "EIFO", "side": "public-capital", "country": "DK", "units": [
      { "id": "eifo-guar", "name": "Guarantees (EIFO-kaution)", "roles": [
        { "id": "eifo-g-p1", "role": "Head of the SME guarantee / kaution unit", "priority": "P1", "reach": "EIFO customer centre +45 31 51 94 21, or via the bank", "status": "to_approach", "cite": ["w1"] },
        { "id": "eifo-g-p2", "role": "Credit analyst rating the ApS", "priority": "P2", "reach": "Assigned once the bank files", "status": "to_approach", "cite": ["judgement"] }
      ] },
      { "id": "eifo-vc", "name": "Direct venture", "roles": [
        { "id": "eifo-v-p1", "role": "Head of the direct venture team covering industrial tech", "priority": "P1", "reach": "Warm intro from the lead", "status": "to_approach", "cite": ["w5", "judgement"] },
        { "id": "eifo-v-p2", "role": "Investment manager", "priority": "P2", "reach": "Forwarded by the head", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "em", "name": "Danish Ministry of Industry, Business and Financial Affairs", "side": "political", "country": "DK", "units": [
      { "id": "em-fin", "name": "Business financing / EIFO ownership", "roles": [
        { "id": "em-p1", "role": "Head of the office owning EIFO's mandate", "priority": "P1", "reach": "Only if EIFO stalls; frame as export growth", "status": "to_approach", "cite": ["unverified"] },
        { "id": "em-p2", "role": "Spokesperson on business and export of a governing party", "priority": "P2", "reach": "Via the Danish industry association", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "bk", "name": "Bayern Kapital", "side": "public-capital", "country": "DE", "units": [
      { "id": "bk-inv", "name": "Wachstumsfonds Bayern 2", "roles": [
        { "id": "bk-p1", "role": "Managing director responsible for growth-stage co-investment", "priority": "P1", "reach": "Intro by the lead; cite the Subra second closing", "status": "to_approach", "cite": ["w7"] },
        { "id": "bk-p2", "role": "Investment manager, industrial tech", "priority": "P2", "reach": "Forwarded by P1", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "stmwi", "name": "Bavarian State Ministry of Economic Affairs", "side": "political", "country": "DE", "units": [
      { "id": "stmwi-u", "name": "Start-up and innovation financing", "roles": [
        { "id": "st-p1", "role": "Head of the unit overseeing Bayern Kapital's funds", "priority": "P1", "reach": "Formal letter, Bavarian jobs and logistics angle", "status": "to_approach", "cite": ["unverified"] },
        { "id": "st-p2", "role": "Landtag member for the GmbH's constituency", "priority": "P2", "reach": "Constituency office", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] }
  ] },
  "funding_stack": { "currency": "EUR", "need": { "amount": 16000000, "label": "EUR 12M Series A plus about EUR 4M deployment line (illustrative)" },
    "instruments": [
      { "id": "private", "name": "Lead and private investors", "type": "equity", "amount": 6000000, "amount_max": 10000000, "terms": "Carries team, product and market build; dearest money (permanent dilution, venture return targets)", "status": "in_progress", "cite": ["judgement"] },
      { "id": "eifo-eq", "name": "EIFO direct co-investment", "type": "public_coinvest", "terms": "Same cost as the round; adds a Danish anchor and network, not cheaper per euro", "status": "probe", "cite": ["w5"] },
      { "id": "bk-eq", "name": "Bayern Kapital Wachstumsfonds Bayern 2", "type": "public_coinvest", "amount": 2000000, "amount_max": 8000000, "terms": "Same terms as the private investor, who must invest at least as much; no lead role", "status": "probe", "cite": ["w6"] },
      { "id": "wip-line", "name": "Work-in-progress credit at the ApS's bank", "type": "loan", "amount": 4000000, "terms": "Carries hardware and installation until go-live; self-liquidating at customer payment; illustrative size", "status": "planned", "cite": ["judgement"] },
      { "id": "kaution", "name": "EIFO-kaution on that line", "type": "guarantee_debt", "terms": "Up to 80% of the facility loss (max 50% of the bank's total), 0.8-6.3% a year: what makes the line cheap and available", "status": "planned", "cite": ["w1"] },
      { "id": "investeu", "name": "InvestEU cover via your bank", "type": "guarantee_debt", "terms": "Alternative cover on the same line; whether it combines with EIFO is unconfirmed", "status": "probe", "cite": ["w4", "unverified"] }
    ] },
  "process": [
    { "id": "kaution-flow", "title": "How the deployment line works", "caption": "The bank funds the hardware; EIFO takes most of the loss; the customer's payment at go-live repays it.",
      "nodes": [
        { "id": "eifo", "label": "EIFO", "kind": "institution" },
        { "id": "bank", "label": "ApS's bank", "kind": "bank" },
        { "id": "aps", "label": "You (ApS)", "kind": "client" },
        { "id": "hw", "label": "Installed hardware", "kind": "asset" },
        { "id": "cust", "label": "German / Danish customer", "kind": "customer" }
      ],
      "edges": [
        { "from": "eifo", "to": "bank", "label": "covers up to 80% of the loss", "kind": "risk" },
        { "from": "bank", "to": "aps", "label": "work-in-progress credit", "kind": "money" },
        { "from": "aps", "to": "hw", "label": "funds hardware and installation", "kind": "asset" },
        { "from": "cust", "to": "aps", "label": "pays at go-live", "kind": "money" },
        { "from": "aps", "to": "bank", "label": "repays, line recycles", "kind": "money" }
      ], "cite": ["w1"] }
  ],
  "process_maps": [
    { "id": "kaution-decision", "title": "How the EIFO-kaution decision is made",
      "explains": "Who files, who rates and who decides, and where attention moves it.",
      "kind": "funding_decision", "illustrative": true,
      "actors": [
        { "id": "m-aps", "name": "The ApS", "side": "market" },
        { "id": "m-bank", "name": "The ApS's bank", "side": "market" },
        { "id": "m-eifo", "name": "EIFO guarantee unit", "side": "public-capital" }
      ],
      "steps": [
        { "id": "s-case", "label": "ApS sets out pipeline, cash cycle and the new line", "kind": "document", "actor": "m-aps", "cite": ["judgement"] },
        { "id": "s-bank", "label": "Bank agrees the new facility subject to cover", "kind": "decision", "actor": "m-bank", "cite": ["w1"] },
        { "id": "s-rate", "label": "EIFO rates the company and offers cover to the bank", "kind": "step", "actor": "m-eifo", "cite": ["unverified"] },
        { "id": "s-issue", "label": "Bank asks EIFO to issue; line drawn", "kind": "decision", "actor": "m-bank", "cite": ["unverified"] }
      ],
      "flow": [ { "from": "s-case", "to": "s-bank" }, { "from": "s-bank", "to": "s-rate" }, { "from": "s-rate", "to": "s-issue", "label": "both accept" } ],
      "leverage": [
        { "id": "l-equity", "at": "s-rate", "kind": "timing_window", "label": "Rating after the Series A",
          "why": "Positive equity is a condition; the round lifts it.", "how": "Prepare now, sign right after first closing.", "side": "public-capital", "cite": ["w1"] },
        { "id": "l-new", "at": "s-bank", "kind": "blocker", "label": "Must add to the bank's lending",
          "why": "Refinancing old lines into it fails the condition.", "how": "Size it as new capacity for the pipeline.", "side": "market", "cite": ["w1"] },
        { "id": "l-pitch", "at": "m-eifo", "kind": "pressure_point", "label": "Export growth case",
          "why": "German contracts are Danish exports with Danish assembly.", "how": "Lead the file with export volume and Danish jobs.", "side": "public-capital", "cite": ["judgement"] }
      ],
      "cite": ["w1"] }
  ],
  "risks_flags": [
    { "id": "f-gmbh", "kind": "flag", "severity": "high", "title": "Bayern Kapital needs a Bavarian seat or site; the round sits in the ApS", "fix": "Show the GmbH's Bavarian substance and ask Bayern Kapital how it treats the Danish parent; Subra is the precedent.", "cite": ["w6", "w7"] },
    { "id": "f-equity", "kind": "flag", "severity": "medium", "title": "EIFO-kaution requires positive equity", "fix": "Sign the guaranteed line after the first closing.", "cite": ["w1"] },
    { "id": "f-second", "kind": "flag", "severity": "medium", "title": "Term sheet could block public co-investors", "fix": "Agree room for a second closing with the lead now.", "cite": ["w7", "judgement"] },
    { "id": "f-german-loans", "kind": "deal_breaker", "severity": "medium", "title": "Bavarian and federal German loans: no route with today's structure", "fix": "Accept it; do not restructure contracts for a subsidy.", "cite": ["judgement"] },
    { "id": "f-regina", "kind": "flag", "severity": "medium", "title": "Retrofitting safety hardware to forklifts: Machinery Regulation, possibly AI Act", "fix": "Handed to Regina.", "cite": ["unverified"] }
  ]
}
```

**Precedents**
- Bayern Kapital: Subra's €10M second closing [w7][w8].
- EIFO-kaution for a company that pays deployment costs upfront and is paid at go-live: none found. This would be a new kind of request for EIFO, so lead with the export case.
- EIFO direct equity in industrial robotics: the Capra Robotics round is reported in the press (unverified).

**Sources** (all retrieved 16 Nov 2026)
- [w1] [EIFO-kaution product sheet](https://eifo.dk/media/pc5faeyf/eifo-kaution.pdf): "Konkrete ordrer fx oparbejdningskreditter"; "Op til 80 pct. af det endelige tab på den konkrete facilitet dog maksimalt 50% af bankens samlede tab"; "Skal have positiv egenkapital og være kreditværdig"; "finansieringen skal udvide bankens engagement"
- [w2] [EIFO Growth Guarantee, Jan 2026](https://eifo.dk/media/ancabgxb/growth-guarantee-vaekstgaranti-jan-2026.pdf): "need to provide performance or payment guarantees"
- [w3] [EIFO Operationel leasinggaranti, Apr 2026](https://eifo.dk/media/f0pht1yf/operationel-leasinggaranti_april2026.pdf): "Garantien kan stilles overfor eksportøren der selv leaser aktivet ud til sin udenlandske kunde"
- [w4] [EIF and Danske Bank, 6 May 2025](https://www.eif.org/press/all/eif-guarantee-unlocks-eur178-million-in-new-lending-for-nordic-smes-through-danske-bank): "make financing cheaper and more accessible ... by reducing our lending risk"
- [w5] [EIFO equity in Danish companies](https://eifo.dk/en/for-you-who-are/fund-or-investor/equity-investments-in-danish-companies): "Denmark as their base"
- [w6] [Förderdatenbank: Wachstumsfonds Bayern](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Bayern/beteiligung-bayern-wachstumsfonds.html): "mit Sitz oder Betriebsstätte in Bayern"; "Er nimmt keine Leadinvestorenrolle wahr"
- [w7] [THEVA on Subra and Bayern Kapital, 20 Jul 2026](https://www.theva.com/subra-closes-an-additional-investment-of-e10-million-from-bayern-kapital/): €10M second closing via "Innovation Fund ERDF II and the ScaleUp Fund Bavaria"
- [w8] [Novo Holdings on Subra](https://novoholdings.com/news/novo-holdings-leads-euro40-million-series-a-in-subra-to-build-a-european-platform-for-next-generation-superconductors): "headquartered in Denmark ... Theva's established German facilities"
- [w9] [EIC Accelerator](https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en): "Investment component of EUR 1M up to EUR 10M"; 2027 cut-offs 20/01, 17/03, 01/09, 04/11
