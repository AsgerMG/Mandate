# Simulated conversation: train_cleantech_se_de

Case: `mandate/eval/scenarios/train_cleantech_se_de.yaml`. Brain: Wincent. Playbooks at a4544ae001. 2026-11-18T08:18:27+00:00. 12 turns (script 8/8; stopped: wrapped_up; client agent called 4x).
Leave-one-out case library: 0 entries left out.

## Turn 1: the founder (opener, script)

> We recycle battery materials, pilot in Sweden. Our first real plant should be in eastern Germany. What public money is out there?

## Turn 1: Wincent

I've checked the German regional investment grant rules for one eastern Land and the EU cleantech funds we hold. Here is my first read.

**My read.** This is a first-of-a-kind plant question. In Germany the money that matters most for a plant is usually the regional investment grant. Each Land runs its own version, and it pays the company that makes the investment. In Brandenburg, for example, that company has to be a commercial enterprise [c2]. On top of that come EU money for scale-up and the federal promotional bank's loans. Which of these fit depends on three facts I don't have yet.

1. **Which entity will build and own the plant, and in which Land?** Today you have a Swedish company. The German grant goes to the investor at the site. Brandenburg's rules also exclude some sectors, for example energy supply [c3]. So the German entity and the site decide which Land's bank you deal with.
2. **How big is the investment, and has anything been signed?** The size decides which EU window fits. Our records show the large-scale lot of the EU Innovation Fund starts above EUR 100m of investment (unverified; I'll confirm on the call text). And if you commit to the plant before you apply, you can lose the grant (judgement; I'll confirm the exact rule per Land).
3. **How big is the group, and are you raising?** The SME tests (under 50 staff for small, under 250 for medium [c4][c5]) set how high the grant can go. A funding round would also open co-investment routes.

**Safe in any case:** sign no equipment orders or construction contracts for the German plant yet.
**Not yet:** don't choose a site on land price alone.

For Regina: waste and battery permits for the plant.

Which entity would own the plant, and have you narrowed it to a Land?

```mandate-board
{
  "title": "Battery materials recycler: public money for the first plant in eastern Germany",
  "stage": "qualify",
  "hierarchies": [
    {
      "id": "field",
      "title": "Where plant money sits",
      "explains": "The EU and federal layers sit above the regional grant, which each eastern Land runs for an investor at a site in its territory.",
      "nodes": [
        {"id": "eu", "label": "EU", "kind": "institution", "cite": ["judgement"]},
        {"id": "if", "label": "EU Innovation Fund (CINEA)", "kind": "programme", "parent": "eu", "status": "probe", "note": "Lot depends on investment size; the large lot starts above EUR 100m (to confirm).", "cite": ["unverified"]},
        {"id": "eic", "label": "EIC Accelerator and EIC Fund", "kind": "programme", "parent": "eu", "status": "probe", "note": "Single company, late-stage technology; fits only if SME or small mid-cap.", "cite": ["unverified"]},
        {"id": "de", "label": "Federal level (economy ministry)", "kind": "ministry", "cite": ["judgement"]},
        {"id": "grw", "label": "Regional investment grant (GRW), federal-Land joint task", "kind": "programme", "parent": "de", "cite": ["c1"]},
        {"id": "bb", "label": "Brandenburg economy ministry (GRW)", "kind": "regional_body", "parent": "grw", "status": "probe", "note": "Pays commercial enterprises that invest at a site in Brandenburg; some sectors excluded.", "cite": ["c2", "c3"]},
        {"id": "other-laender", "label": "Saxony, Saxony-Anhalt, Thuringia, Mecklenburg-Vorpommern", "kind": "regional_body", "parent": "grw", "status": "probe", "note": "Each runs its own version; to research once the site is shortlisted.", "cite": ["unverified"]},
        {"id": "kfw", "label": "Federal promotional bank (loans via your bank)", "kind": "institution", "parent": "de", "status": "probe", "cite": ["unverified"]},
        {"id": "se", "label": "Sweden (pilot plant)", "kind": "institution", "status": "probe", "note": "Where the pilot and the research stay; to work separately.", "cite": ["judgement"]}
      ],
      "cite": ["c1", "judgement"]
    }
  ],
  "risks_flags": [
    {"id": "start-of-works", "kind": "deal_breaker", "severity": "high", "title": "Committing to the plant before applying can void the grant", "fix": "Sign no orders or construction contracts until the applications are filed; confirm the rule per Land.", "cite": ["judgement"]},
    {"id": "entity", "kind": "flag", "severity": "medium", "title": "No German entity yet", "fix": "Decide which entity invests and owns the plant, at which site.", "cite": ["judgement"]},
    {"id": "regina-permits", "kind": "flag", "severity": "medium", "title": "Waste and battery permits for the plant", "fix": "Handed to Regina for the regulatory read.", "cite": ["judgement"]}
  ]
}
```

Sources: [c1], [c2] and [c3] are from Brandenburg's regional investment grant guideline, 2025 version (bravors.brandenburg.de/verwaltungsvorschriften/grw_g_grosse_rili_2025).

## Turn 2: the founder (answer, if_asked+client_agent)

> Two candidate sites in two eastern German states, one next to a cell factory, one next to a scrap hub. No land bought.
> 
> The plant comes to about EUR 20M, and nothing is signed. Land isn't bought, and equipment orders would only go out about three months before construction starts. We're a Swedish AB with 40 staff and EUR 9M of equity raised so far. We're planning a EUR 25M Series B in about six months. Two investors are interested but we have no lead yet.

## Turn 2: Wincent

Your answers settle a lot. Nothing is signed, so the grants are still possible. EUR 20M is a mid-size plant, and with 40 staff you are probably a small company (under 50 staff [c4]).

**What I found**

- **The German regional grant is the anchor.** I'm working from Germany Trade & Invest's 2024 rate table, which I saw in search results but couldn't open, so treat the rates as unverified. In eastern assisted areas the maximum is about 40% for small, 30% for medium and 20% for large companies, with 5 points more in border areas. On EUR 20M that is roughly EUR 8M if you are small, EUR 6M if medium and EUR 4M if large (judgement, from those rates). The Land and the exact district set the rate. So the choice between your two sites is also a choice about grant money.
- **The EU Innovation Fund has a size problem at exactly EUR 20M.** The small lot ends at EUR 20M and the medium lot starts there [w1]. The 2025 call closed on 23 April 2026 [w1], so the next call is the target. Whether recycling fits its scope still needs checking (judgement).
- **Your size could change before the money arrives.** A EUR 25M round grows your balance sheet. Being small rather than medium is worth about 10 points of grant (judgement). The SME test also looks at who owns you.
- **Precedents:** I found no battery recycler among Brandenburg's recent regional grants. The ones I saw are ordinary manufacturers getting EUR 0.1M to 0.8M (register record: competition-cases.ec.europa.eu/cases/SA.112200).

**Two questions decide the next step:**
1. **Which two states and districts?** That decides your rate tier and which Land bank you deal with.
2. **What are your last turnover and balance sheet, and does any shareholder hold more than 25%?** That decides small or medium, now and after the Series B.

```mandate-board
{
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "Where plant money sits",
      "explains": "The EU and federal layers sit above the regional grant, which each eastern Land pays to an investor at a site in an assisted area.",
      "nodes": [
        {"id": "if", "label": "EU Innovation Fund (CINEA)", "kind": "programme", "parent": "eu", "status": "probe", "note": "EUR 20M sits on the small/medium lot boundary; the 2025 call closed 23 Apr 2026; next call to watch.", "cite": ["w1"]},
        {"id": "grw", "label": "Regional investment grant (GRW), federal-Land joint task", "kind": "programme", "parent": "de", "status": "open", "note": "Roughly 40/30/20% for small/medium/large in eastern C areas, +5 in border areas (to confirm).", "cite": ["c1", "unverified"]},
        {"id": "other-laender", "label": "The two candidate Laender", "kind": "regional_body", "parent": "grw", "status": "probe", "note": "The site decides the rate tier and the Land bank.", "cite": ["judgement"]}
      ],
      "cite": ["w1", "c1"]
    }
  ],
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 20000000, "label": "First commercial plant, eastern Germany"},
    "instruments": [
      {"id": "grw", "name": "Regional investment grant (illustrative)", "type": "grant", "amount": 4000000, "amount_max": 8000000, "terms": "Carries plant and equipment; cheapest money, non-dilutive, but tied to the site and to applying before you commit", "status": "probe", "cite": ["unverified", "judgement"]},
      {"id": "seriesb", "name": "Series B (planned)", "type": "equity", "amount": 25000000, "terms": "Carries the company's own share and the risk; dearest money, so let public money carry the plant first", "status": "planned", "cite": ["judgement"]},
      {"id": "if", "name": "EU Innovation Fund, next call", "type": "grant", "terms": "Carries the cost of first-of-a-kind innovation; lot depends on which side of EUR 20M the plant falls", "status": "probe", "cite": ["w1"]}
    ]
  },
  "risks_flags": [
    {"id": "sme-shift", "kind": "flag", "severity": "medium", "title": "The Series B may move you from small to medium", "fix": "Check turnover, balance sheet and ownership against the SME test before and after the round.", "cite": ["c4", "c5", "judgement"]},
    {"id": "if-boundary", "kind": "flag", "severity": "medium", "title": "EUR 20M sits on the boundary between two Innovation Fund lots", "fix": "Fix the eligible capex figure deliberately before the next call.", "cite": ["w1"]}
  ]
}
```

**Sources**
- [c4], [c5]: Brandenburg's regional investment grant guideline 2025, SME definitions (bravors.brandenburg.de/verwaltungsvorschriften/grw_g_grosse_rili_2025)
- [w1]: [EU Innovation Fund IF25 net-zero call page](https://climate.ec.europa.eu/eu-action/eu-funding-climate-action/innovation-fund/calls-proposals/if25-nzt_en), retrieved 18 Nov 2026: "€100 million available for projects with CAPEX between €2.5 million and €20 million"; "€300 million available for projects with CAPEX between €20 million and €100 million"; "Deadline to submit applications 23/04/2026"
- Unverified: the [GTAI 2024 grants table](https://www.gtai.de/resource/blob/1826382/7948379eb1061c62c204965fba4af0a7/grants-for-investments), seen in search results only. I'll confirm it against the Land's own guideline once you name the states.

## Turn 3: the founder (answer, client_agent)

> We're pre-revenue at commercial scale, so turnover is basically nothing. I don't have the exact balance sheet figure or the cap table split to hand, so I'll get both from our CFO. Does this change the timing for the next Innovation Fund call?

## Turn 3: Wincent

Your size doesn't change the date of the main call. It could open a second door, though. And the bigger news is that the 2026 call fixes the EUR 20M problem.

**What changed**

- **The calls open on 3 December.** The Commission plans to launch five calls that day [w2]. The net-zero call closes in April 2027 [w3].
- **The size problem is gone.** In 2026 the small and medium lots are merged into one band, from EUR 2.5M to EUR 100M [w3]. There is also a new topic for clean-tech manufacturing and critical raw materials, open to projects above EUR 2.5M [w3]. Recycling battery metals may fit it better than the general topic (judgement).
- **There is also a separate SME call, with EUR 200M.** It is for "small and medium-sized enterprises developing innovative clean technologies" [w2]. This is where your size matters. If the CFO's figures confirm you are an SME, you have a second shot.

**The real timing issue is your Series B.** The April deadline comes about a month before your round is due to close. You would apply while the round is still open, so the application has to show how the plant is financed. Two warm investors with no lead is thin for that (judgement). Letters of intent from both, plus an early read from the Land on the regional grant, would strengthen it (judgement).

The window is short: roughly four months from 3 December to April.

**What does the plant produce and sell?** Black mass, or refined metal salts such as lithium, nickel and cobalt? That decides which topic fits, and whether the plant could qualify for the EU's critical-raw-materials project status.

```mandate-board
{
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "Where plant money sits",
      "explains": "The EU and federal layers sit above the regional grant; the EU Innovation Fund now runs a net-zero call with a critical raw materials topic, plus a separate SME call.",
      "nodes": [
        {"id": "if", "label": "EU Innovation Fund 2026 (CINEA)", "kind": "programme", "parent": "eu", "status": "open", "note": "Five calls planned for 3 Dec 2026; net-zero call closes Apr 2027.", "cite": ["w2", "w3"]},
        {"id": "if-crm", "label": "Topic: clean-tech manufacturing and critical raw materials", "kind": "instrument", "parent": "if", "status": "probe", "note": "Projects above EUR 2.5M; recycling fit to confirm on the call text.", "cite": ["w3", "judgement"]},
        {"id": "if-gen", "label": "Topic: general decarbonisation, small and medium scale", "kind": "instrument", "parent": "if", "status": "probe", "note": "Projects from EUR 2.5M to 100M; the EUR 20M boundary no longer matters.", "cite": ["w3"]},
        {"id": "if-sme", "label": "Innovation Fund SME call", "kind": "instrument", "parent": "if", "status": "probe", "note": "EUR 200M for SMEs; open to you if the SME test holds.", "cite": ["w2"]}
      ],
      "cite": ["w2", "w3"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "eu-if", "label": "EU Innovation Fund", "steps": [
        {"id": "if-open", "label": "2026 calls open", "start": "2026-12-03", "milestone": true, "owner": "institution", "status": "planned", "cite": ["w2"]},
        {"id": "if-close", "label": "Net-zero call closes (planned)", "start": "2027-04", "milestone": true, "owner": "institution", "status": "planned", "cite": ["w3"]}
      ]},
      {"id": "raise", "label": "Series B", "steps": [
        {"id": "loi", "label": "Letters of intent from the two investors for the application", "start": 1, "end": 4, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "close", "label": "Series B close (target)", "start": 6, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-if-text", "label": "Call text published: does battery recycling fit the critical raw materials topic?", "start": "2026-12-03", "milestone": true, "owner": "us", "status": "planned", "cite": ["w2"]},
        {"id": "w-info", "label": "Info day on the net-zero and maritime calls", "start": "2026-12-15", "milestone": true, "owner": "us", "status": "planned", "cite": ["w4"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "if-boundary", "kind": "flag", "severity": "low", "title": "EUR 20M lot boundary", "fix": "Resolved: the 2026 call merges small and medium into one band from EUR 2.5M to 100M.", "cite": ["w3"]},
    {"id": "finance-proof", "kind": "flag", "severity": "high", "title": "The application closes before the Series B does", "fix": "Get investor letters of intent and an early read from the Land on the regional grant before April.", "cite": ["w3", "judgement"]},
    {"id": "sme-shift", "kind": "flag", "severity": "medium", "title": "Small or medium: balance sheet and ownership still open", "fix": "CFO to confirm balance sheet and any shareholder above 25%.", "cite": ["c4", "judgement"]}
  ]
}
```

**Sources**
- [w2]: [CINEA, "Registrations open for the Innovation Fund 2026 Info Days"](https://cinea.ec.europa.eu/news-events/news/registrations-open-innovation-fund-2026-info-days-2026-11-17_en), retrieved 18 Nov 2026: "The Commission plans to launch five calls for proposals (grants and auctions) on 3 December"; SME call "Available budget: €200 million", for "small and medium-sized enterprises developing innovative clean technologies"
- [w3]: [Commission, IF26 NZT call page](https://climate.ec.europa.eu/areas-action/eu-funding-climate-action/innovation-fund/calls-proposals/if26-nzt-call_en), retrieved 18 Nov 2026: "December 2026 IF26 Call for Proposals - Planned opening"; "April 2027 IF26 Call for Proposals - Planned closure"; "available for projects with CAPEX between €2.5 million and €100 million"; clean-tech manufacturing and critical raw materials "available for projects with CAPEX above €2.5 million"
- [w4]: [CINEA info day event page](https://cinea.ec.europa.eu/news-events/events/innovation-fund-2026-maritime-and-net-zero-technologies-calls-info-day-2026-12-15_en), listed for 15 Dec 2026. I saw this in search results and did not open the page.

## Turn 4: the founder (answer, client_agent)

> The plant sells recovered nickel and cobalt to cell makers, and we have a letter of intent from one cell maker for exactly that. I'll get you the exact product spec, whether it's salts and in what grade, so we pin it down correctly.

## Turn 4: Wincent

Your product changes the picture. Nickel and cobalt for cell makers put you at the heart of the EU's critical raw materials agenda, and the letter of intent is proof of demand that every funder will ask for.

**What it opens**

- **EU strategic project status.** In the latest round the EU picked 19 recycling projects out of 46 [w5]. The next call is due "towards the end of 2026" [w5]. Being selected mostly speeds up permits and attracts finance: the EU says Team Europe has lined up over EUR 2 billion for these projects, through the Innovation Fund, state aid and the EIB [w5]. It is a status worth getting. I believe nickel and cobalt are on the strategic list (unverified; I'll check the list in the Act). How permits run under this status is a question for Regina.
- **Germany's raw materials fund is too big for you today.** Its tickets usually run EUR 50M to 150M, mostly as equity [w6]. A EUR 20M plant sits below that, so I'd park it for your second plant (judgement).
- **The letter of intent helps everywhere.** It shows offtake in the Innovation Fund application. It also feeds the Land's interest, if the cell maker sits next to one of your sites (judgement).

One sequencing point: the strategic project call and the Innovation Fund call will overlap this winter. Preparing both from one project file saves months (judgement).

**Is the cell maker that signed the letter the factory next to one of your sites? And which two states are they in?** Both decide where the Land will want you most.

```mandate-board
{
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "Where plant money sits",
      "explains": "EU strategic project status sits beside the Innovation Fund and steers finance to selected projects; Germany's raw materials fund is a federal equity vehicle with large tickets.",
      "nodes": [
        {"id": "crma", "label": "EU strategic project status (critical raw materials)", "kind": "programme", "parent": "eu", "status": "probe", "note": "Next call due end of 2026; brings faster permits and finance attention.", "cite": ["w5"]},
        {"id": "kfw-rf", "label": "German raw materials fund (KfW)", "kind": "instrument", "parent": "kfw", "status": "park", "note": "Tickets usually EUR 50M to 150M, mostly equity; too large for a EUR 20M plant.", "cite": ["w6"]}
      ],
      "cite": ["w5", "w6"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "crma-track", "label": "Strategic project status", "steps": [
        {"id": "crma-call", "label": "Next strategic project call expected", "start": 1, "milestone": true, "owner": "institution", "status": "planned", "cite": ["w5"]},
        {"id": "one-file", "label": "Build one project file for both the strategic project and Innovation Fund applications", "start": 0.5, "end": 4, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-crma-call", "label": "Strategic project call opens: deadline and recycling criteria", "start": 1.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["w5"]},
        {"id": "w-kfw-rf", "label": "Raw materials fund: budget rise and ticket floor, relevant for plant two", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["w6", "unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "annex-list", "kind": "flag", "severity": "medium", "title": "Is the product on the EU's strategic raw materials list?", "fix": "Check nickel and cobalt in the grade you sell against the list in the Act, once the spec is in.", "cite": ["unverified"]},
    {"id": "regina-crma-permits", "kind": "flag", "severity": "medium", "title": "How permits run under strategic project status", "fix": "Handed to Regina.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [w5]: [European Commission (Luxembourg representation), "Commission selects 46 new Strategic Projects", 9 Oct 2026](https://luxembourg.representation.ec.europa.eu/actualites-et-evenements/actualites/commission-selects-46-new-strategic-projects-bolster-eus-supply-critical-raw-materials-2026-10-09_en), retrieved 18 Nov 2026: "19 are recycling projects"; "The Commission will soon announce a new call for Strategic Project applications towards the end of 2026"; "Team Europe has mobilised more than €2 billion in financial support"
- [w6]: [KfW press release on the raw materials fund](https://www.kfw.de/%C3%9Cber-die-KfW/Newsroom/Aktuelles/Pressemitteilungen-Details_824192.html), retrieved 18 Nov 2026: "Das Finanzierungsbudget wird in der Regel zwischen 50 Mio. Euro und 150 Mio. Euro liegen"; "Eine Förderung wird insbesondere in Form von Eigenkapitalbeteiligungen erfolgen"

## Turn 5: the founder (options, script)

> OK, that is the picture. What are our options, broadly?

## Turn 5: Wincent

Here is the landscape, door by door. I'm not recommending anything yet. There are five kinds of money, and they pay for different costs.

1. **Grants for the plant.**
   - The Land's regional investment grant is open to you, once you have a German company at the site [c2].
   - The Innovation Fund's critical raw materials topic [w3], and its SME call if you pass the SME test [w2], are both worth probing.
   - These are the cheapest money, and they pay directly for buildings and equipment.
2. **A status that pulls money in.** EU strategic project status [w5]. It is not money itself, but it moves you up the queue for permits and finance.
3. **Public co-investment in your Series B.** The EIC can invest EUR 10M to 30M as a minority stake through its scale-up scheme (unverified, from our records), and the EIB lends venture debt (unverified). These buy into the company, not the plant.
4. **Loans for the rest of the plant.**
   - The federal promotional bank's loans and the Land banks' loans normally come through a German house bank (unverified until I check them).
   - So the German company and its bank are a door in their own right (judgement).
5. **Shut or parked.**
   - The Innovation Fund's large-project lot is shut: it starts above EUR 100M [w3].
   - Germany's raw materials fund is parked: its tickets are too large for you [w6].
   - Swedish money mainly fits the pilot and the research, not a German plant (judgement).

**The one thing to know:** the grant and the Innovation Fund would both pay for the same equipment. Whether they can be combined, and up to what limit, has to be confirmed before you count both (unverified).

**What do you lean toward:** starting construction as early as 2027, or waiting for the EU decision to get the most grant money? The choice changes the order of everything.

```mandate-board
{
  "stage": "options",
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "if-crm", "name": "Innovation Fund: clean-tech manufacturing and critical raw materials topic", "institution": "European Commission / CINEA", "status": "probe", "why": "Projects above EUR 2.5M; opens Dec 2026, closes Apr 2027; recycling fit to confirm.", "conditions": ["Call text fit for recycling", "Financing plan before Series B closes"], "cite": ["w2", "w3"]},
        {"id": "if-sme", "name": "Innovation Fund SME call", "institution": "European Commission / CINEA", "status": "probe", "why": "EUR 200M for SMEs; depends on the SME test.", "cite": ["w2"]},
        {"id": "if-lsp", "name": "Innovation Fund large-scale lot", "institution": "European Commission / CINEA", "status": "shut", "why": "Starts above EUR 100M; the plant is EUR 20M.", "cite": ["w3"]},
        {"id": "crma", "name": "EU strategic project status", "institution": "European Commission", "status": "probe", "why": "Next call end of 2026; faster permits and finance attention.", "cite": ["w5"]},
        {"id": "eic-step", "name": "EIC Fund, STEP Scale Up equity", "institution": "EIC Fund", "status": "probe", "why": "EUR 10M to 30M minority stakes; could sit in the Series B.", "cite": ["unverified"]},
        {"id": "eib-vd", "name": "EIB venture debt", "institution": "European Investment Bank", "status": "probe", "why": "Growth-stage debt alongside equity; terms to research.", "cite": ["unverified"]}
      ]},
      {"id": "de-nat", "level": "national", "label": "Germany, federal", "country": "DE", "doors": [
        {"id": "kfw-loans", "name": "Federal promotional bank loans", "institution": "KfW", "via": "your German house bank", "status": "probe", "why": "Needs a German company and its bank; to research.", "cite": ["unverified"]},
        {"id": "kfw-rf", "name": "German raw materials fund", "institution": "KfW", "status": "park", "why": "Tickets usually EUR 50M to 150M, mostly equity.", "cite": ["w6"]}
      ]},
      {"id": "de-reg", "level": "regional", "label": "Eastern German Land (site to choose)", "country": "DE", "doors": [
        {"id": "grw", "name": "Regional investment grant (GRW)", "institution": "The Land's economy ministry and bank", "status": "open", "why": "Pays commercial companies investing at a site in an assisted area; roughly 40% for small companies in the east (to confirm).", "conditions": ["German company at the site", "Apply before committing", "Sector not excluded"], "cite": ["c2", "c3", "unverified"]},
        {"id": "land-loans", "name": "Land bank loans and guarantee bank cover", "institution": "The Land's promotional bank", "status": "probe", "why": "Debt top-up for the plant; to research per Land.", "cite": ["unverified"]}
      ]},
      {"id": "se", "level": "national", "label": "Sweden", "country": "SE", "doors": [
        {"id": "se-rd", "name": "Swedish R&D and innovation support for the pilot", "institution": "Swedish agencies", "status": "park", "why": "Fits the pilot and research, not a German plant.", "cite": ["judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 20000000, "label": "First commercial plant, eastern Germany"},
    "instruments": [
      {"id": "grw", "name": "Regional investment grant (illustrative)", "type": "grant", "amount": 4000000, "amount_max": 8000000, "terms": "Carries buildings and equipment; cheapest money, tied to the site and to applying first", "status": "probe", "cite": ["unverified", "judgement"]},
      {"id": "if", "name": "Innovation Fund grant", "type": "grant", "terms": "Carries the first-of-a-kind cost; non-dilutive but slow, and may overlap the regional grant on the same equipment", "status": "probe", "cite": ["w3", "unverified"]},
      {"id": "eic-step", "name": "EIC scale-up equity in the Series B", "type": "public_coinvest", "amount": 10000000, "amount_max": 30000000, "terms": "Carries company risk; dilutive but signals to private leads", "status": "probe", "cite": ["unverified"]},
      {"id": "seriesb", "name": "Series B", "type": "equity", "amount": 25000000, "terms": "Dearest money: use it for the company's share, not for what grants and loans can carry", "status": "planned", "cite": ["judgement"]},
      {"id": "loans", "name": "Promotional loans via a German house bank", "type": "loan", "terms": "Carries the remaining plant cost; cheaper than equity once grants are secured", "status": "probe", "cite": ["unverified"]}
    ]
  },
  "risks_flags": [
    {"id": "cumulation", "kind": "flag", "severity": "high", "title": "Regional grant and Innovation Fund on the same equipment", "fix": "Confirm the combination limit before counting both.", "cite": ["unverified"]},
    {"id": "no-gmbh", "kind": "flag", "severity": "medium", "title": "No German company or house bank yet", "fix": "Plan the German company for the chosen site; it unlocks the regional grant and the loans.", "cite": ["c2", "judgement"]}
  ]
}
```

**Sources:** [c2] and [c3] are from Brandenburg's regional investment grant guideline 2025. [w2], [w3], [w5] and [w6] are as listed in my earlier replies. The EIC scale-up figures come from our own records and are not yet confirmed on the source.

## Turn 6: the founder (answer, if_asked)

> Construction in about nine months if the money is there; equipment orders go out three months before that.

## Turn 6: Wincent

A nine-month start sorts the options for you. Your equipment orders go out in about six months, around May 2027. Everything that needs an application before you commit has to be filed before then.

**My priority, for you to push back on:**

1. **Lead with the Land's regional grant.** It fits your timeline, it is open to you [c2], and it is the largest non-dilutive sum. On EUR 20M, the illustrative range is EUR 4M to 8M (judgement, from rates still unverified). You need the German company and the application in by the first quarter of 2027. Orders and construction come only after the Land allows an early start (unverified per Land; I'll confirm).
2. **Apply to the Innovation Fund by April, as extra money, not as the base.** The deadline falls just before your orders [w3]. The award is unlikely before construction starts (judgement). So plan the plant without it, and ask CINEA whether costs incurred before the grant is signed still count (unverified).
3. **Use the Series B to carry the company's own share.** Bring in the EIC or the EIB beside the private lead (unverified), and add promotional loans through the German house bank for the rest.

Strategic project status runs alongside, built from the same file at little extra effort (judgement).

**Where I'd push back:** don't let the construction date pull the equipment orders forward. One binding order before the grant application can cost you the grant (judgement).

**Which two states are the sites in?** I need them now. The German company and the grant application depend on that choice.

```mandate-board
{
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Lead with the Land's regional grant: open, on time, and the largest non-dilutive sum.",
      "Innovation Fund by April 2027 as upside; plan the plant without it.",
      "Series B carries the company's share, with EIC or EIB alongside and house-bank promotional loans for the rest.",
      "Strategic project status in parallel, from the same file."
    ],
    "confidence": "medium",
    "confidence_why": "Fits the timeline; the rate tier, early-start rule and SME size are still to confirm.",
    "open_question": "Which two states are the candidate sites in?",
    "cite": ["c2", "w3", "w5", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "de-reg", "level": "regional", "label": "Eastern German Land (site to choose)", "country": "DE", "doors": [
        {"id": "grw", "name": "Regional investment grant (GRW)", "institution": "The Land's economy ministry and bank", "status": "open", "why": "Lead: fits the timeline; apply in Q1 2027, before any order.", "cite": ["c2", "judgement"]}
      ]},
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "if-crm", "name": "Innovation Fund: clean-tech manufacturing and critical raw materials topic", "institution": "European Commission / CINEA", "status": "probe", "why": "Second: apply by April 2027 as upside; the award likely comes after construction starts.", "cite": ["w3", "judgement"]},
        {"id": "crma", "name": "EU strategic project status", "institution": "European Commission", "status": "probe", "why": "Parallel: the same project file serves both.", "cite": ["w5", "judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 20000000, "label": "First commercial plant, eastern Germany"},
    "instruments": [
      {"id": "grw", "name": "Regional investment grant (illustrative)", "type": "grant", "amount": 4000000, "amount_max": 8000000, "terms": "Carries buildings and equipment; the cheapest money, so it goes first", "status": "probe", "cite": ["unverified", "judgement"]},
      {"id": "loans", "name": "Promotional loans via a German house bank (illustrative)", "type": "loan", "amount": 4000000, "amount_max": 6000000, "terms": "Carries the remaining plant cost; cheaper than equity once the grant is in", "status": "probe", "cite": ["judgement"]},
      {"id": "seriesb-plant", "name": "Series B share of the plant (illustrative)", "type": "equity", "amount": 6000000, "amount_max": 10000000, "terms": "Carries the company's own share; dearest money, so keep it smallest", "status": "planned", "cite": ["judgement"]},
      {"id": "if", "name": "Innovation Fund grant", "type": "grant", "terms": "Upside: may replace loans or equity later if the costs still count and the combination limit allows", "status": "probe", "cite": ["unverified"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "Regional grant", "steps": [
        {"id": "site", "label": "Choose the site and Land", "start": 0, "end": 1, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "gmbh", "label": "Set up the German company and open a house bank account", "start": 1, "end": 3, "owner": "client", "status": "planned", "depends_on": ["site"], "cite": ["c2", "judgement"]},
        {"id": "grw-file", "label": "File the regional grant application", "start": 3, "end": 4, "owner": "client", "status": "planned", "depends_on": ["gmbh"], "cite": ["judgement"]},
        {"id": "orders", "label": "Equipment orders (only after the application and the Land's early-start consent)", "start": 6, "milestone": true, "owner": "client", "status": "blocked", "depends_on": ["grw-file"], "cite": ["judgement"]},
        {"id": "build", "label": "Construction starts", "start": 9, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["orders"], "cite": ["judgement"]}
      ]},
      {"id": "eu-if", "label": "EU Innovation Fund", "steps": [
        {"id": "if-open", "label": "2026 calls open", "start": "2026-12-03", "milestone": true, "owner": "institution", "status": "planned", "cite": ["w2"]},
        {"id": "if-app", "label": "Write and file the application", "start": 0.5, "end": 5, "owner": "client", "status": "planned", "cite": ["w3"]},
        {"id": "if-close", "label": "Net-zero call closes (planned)", "start": "2027-04", "milestone": true, "owner": "institution", "status": "planned", "cite": ["w3"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "start-of-works", "kind": "deal_breaker", "severity": "high", "title": "An equipment order before the grant application can void the grant", "fix": "File in Q1 2027; order only after the Land consents to an early start.", "cite": ["judgement", "unverified"]},
    {"id": "if-timing", "kind": "flag", "severity": "medium", "title": "Innovation Fund award likely after construction starts", "fix": "Ask CINEA whether costs incurred before the grant is signed still count; do not build the plan on it.", "cite": ["unverified"]}
  ]
}
```

**Sources:** [c2] is from Brandenburg's regional investment grant guideline 2025. [w2], [w3] and [w5] are as listed in my earlier replies.

## Turn 7: the founder (pushback, script)

> Our Swedish agency has been great. Can they not just fund the German plant too?

## Turn 7: Wincent

Probably not for the plant itself. They can still play a useful part around it.

**Why not the plant.** Swedish agencies usually test projects for benefit to Sweden. In its calls, the Swedish Energy Agency weighs "projektets nytta för Sverige", the project's benefit to Sweden, and it also counts other public money given for the same purpose (unverified; I saw this in its call texts through search). A EUR 20M plant in Germany is hard to pass on that test (judgement). It would also count against the same state aid ceiling as the German grant (unverified).

**What they can do:**
1. **Keep funding the process work in Sweden.** The pilot, scaling the process and qualifying the product grades are real Swedish costs. Agency grants are the cheapest money for them (judgement).
2. **Back your EU application.** A national agency that knows your project well makes a credible reference for the Innovation Fund (judgement). I'll check whether yours is Sweden's contact point for the fund (unverified).
3. **Sweden's export credit agency (EKN) is worth a probe.** It can guarantee investment loans for exporting companies when there is "significant Swedish interest" (unverified; from search, not yet read on EKN's own page). If the Swedish company supplies the German plant with its process, equipment or licence, a Swedish-backed loan becomes plausible (judgement).

**Which agency is it, and will the Swedish company own the process and the IP that it licenses or sells to the German company?** That decides whether Swedish money keeps carrying the R&D, and whether EKN's Swedish-interest test can be met.

```mandate-board
{
  "stage": "prioritise",
  "routes": {
    "levels": [
      {"id": "se", "level": "national", "label": "Sweden", "country": "SE", "doors": [
        {"id": "se-rd", "name": "Swedish agency support for process R&D and the pilot", "institution": "Your Swedish agency (to name)", "status": "open", "why": "Keeps carrying Swedish costs; a German plant is unlikely to pass the benefit-to-Sweden test.", "cite": ["unverified", "judgement"]},
        {"id": "se-plant", "name": "Swedish agency grant for the German plant", "institution": "Your Swedish agency", "status": "park", "why": "Calls weigh benefit to Sweden; the plant's costs and jobs are in Germany.", "cite": ["unverified", "judgement"]},
        {"id": "ekn", "name": "EKN investment credit guarantee", "institution": "EKN (Swedish export credit agency)", "via": "your lender", "status": "probe", "why": "For exporting companies with significant Swedish interest; fits if the Swedish company supplies process, equipment or a licence.", "cite": ["unverified"]}
      ]}
    ]
  },
  "hierarchies": [
    {
      "id": "se-field",
      "title": "Swedish side",
      "explains": "The Swedish agency carries the R&D in Sweden; the export credit agency could back a loan if the plant draws on Swedish exports.",
      "nodes": [
        {"id": "se-gov", "label": "Swedish government", "kind": "ministry", "cite": ["judgement"]},
        {"id": "se-agency", "label": "Your Swedish agency", "kind": "institution", "parent": "se-gov", "status": "open", "note": "Process R&D and pilot in Sweden; a reference for the EU application.", "cite": ["judgement"]},
        {"id": "ekn-node", "label": "EKN, export credit guarantees", "kind": "institution", "parent": "se-gov", "status": "probe", "note": "Investment credit guarantee, Swedish-interest test.", "cite": ["unverified"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 20000000, "label": "First commercial plant, eastern Germany"},
    "instruments": [
      {"id": "se-rd", "name": "Swedish agency R&D grants", "type": "grant", "terms": "Carries process R&D and the pilot in Sweden, not the plant; cheapest money for that cost", "status": "probe", "cite": ["judgement"]},
      {"id": "ekn", "name": "EKN-guaranteed investment loan", "type": "guarantee_debt", "terms": "Could make plant debt cheaper if the Swedish-interest test is met; adds no cash on its own", "status": "probe", "cite": ["unverified"]}
    ]
  },
  "risks_flags": [
    {"id": "cumulation-se", "kind": "flag", "severity": "medium", "title": "Swedish and German aid on the same plant costs would count against one ceiling", "fix": "Keep Swedish money on Swedish R&D costs; keep the plant capex for German and EU money.", "cite": ["unverified", "judgement"]}
  ]
}
```

**Sources**
- Unverified, seen through search and not opened: Swedish Energy Agency call texts on benefit to Sweden (for example the [customer verification call text](https://www.energimyndigheten.se/496d08/globalassets/utlysningar/verifiering-av-energiinnivationer-med-kund/ver2025-april/fullstandig-utlysningstext-verifiering-av-innovationer-med-kund.pdf)), and the [EKN investment credit guarantee product sheet](https://www.ekn.se/globalassets/dokument/garantier---dokument/produktblad/garanti-for-investeringskrediter_v4.pdf). I'll confirm both on the source pages.

## Turn 8: the founder (answer, if_asked)

> No German company yet. We can set one up within two months.

## Turn 8: Wincent

Two months works. A German company by mid-January leaves room to file the regional grant in the first quarter, before the orders in May.

**How to set it up so the grant works:**

- **The German company is the applicant.** It makes the investment and runs the site [c2]. It does not make you smaller, though: for the SME test, the Swedish parent's staff and balance sheet are normally counted with it (unverified; I'll check the EU SME definition).
- **Capitalise it for its own share.** Regional aid usually requires the investor to put in at least 25% from its own funds, free of public support (unverified; I'll check the EU rule). On EUR 20M that is EUR 5M or more from the Series B or the parent (judgement). It also limits how far grants and cheap loans can stack.
- **Pick its house bank on purpose.** Federal promotional loans reach you through that bank (unverified), so choose one that already passes them on (judgement).
- **Talk to both Länder before you incorporate.** Two states competing for one plant is your strongest lever on the rate and the speed (judgement). Each state's investment agency is the first call, and the economy ministry's unit for regional aid decides (judgement, by function).

**Not yet:** don't register the company at one site before both states have made their case.

**Which two states?** Once I have them, I'll pull each state's rate tier, its rules for consenting to an early start, and who decides there.

```mandate-board
{
  "stage": "advise",
  "process_maps": [
    {
      "id": "grw-decision",
      "title": "How the regional investment grant is won",
      "explains": "The German company applies to the Land before committing; the Land checks the site, jobs and size, then decides.",
      "kind": "funding_decision",
      "illustrative": true,
      "actors": [
        {"id": "client", "name": "Your German company", "side": "market"},
        {"id": "agency", "name": "The Land's investment agency", "side": "political"},
        {"id": "ministry", "name": "The Land's economy ministry, regional aid unit, and its bank", "side": "public-capital"}
      ],
      "steps": [
        {"id": "pitch", "label": "Site pitch to both Laender", "kind": "step", "actor": "agency", "timing": "Now to January", "cite": ["judgement"], "gates": [{"label": "Two credible sites in eastern assisted areas", "cite": ["judgement"]}]},
        {"id": "gmbh", "label": "Set up and capitalise the German company", "kind": "document", "actor": "client", "timing": "Within two months", "cite": ["judgement"], "gates": [{"label": "A commercial company", "cite": ["c2"]}, {"label": "Not in an excluded sector", "cite": ["c3"]}, {"label": "At least 25% own contribution free of public support", "cite": ["unverified"]}]},
        {"id": "file", "label": "File the grant application", "kind": "document", "actor": "client", "timing": "Q1 2027", "cite": ["judgement"], "gates": [{"label": "Before any binding order or construction contract", "cite": ["unverified"]}, {"label": "SME size measured with the Swedish parent", "cite": ["c4", "unverified"]}]},
        {"id": "early", "label": "Land consents to an early start", "kind": "decision", "actor": "ministry", "timing": "Weeks after filing", "cite": ["unverified"]},
        {"id": "award", "label": "Grant decision", "kind": "decision", "actor": "ministry", "timing": "To confirm per Land", "cite": ["unverified"]}
      ],
      "flow": [{"from": "pitch", "to": "gmbh"}, {"from": "gmbh", "to": "file"}, {"from": "file", "to": "early"}, {"from": "early", "to": "award"}],
      "leverage": [
        {"id": "two-laender", "at": "pitch", "kind": "pressure_point", "label": "Two states competing for one plant", "why": "Each state wants the jobs and the cell supply chain.", "how": "The CEO meets both investment agencies before choosing.", "side": "political", "cite": ["judgement"]},
        {"id": "loi-lever", "at": "pitch", "kind": "door_opener", "label": "The cell maker's letter of intent", "why": "Shows offtake into the state's own battery cluster.", "how": "Bring it to the first meeting.", "side": "market", "cite": ["judgement"]},
        {"id": "order-window", "at": "file", "kind": "timing_window", "label": "File before May 2027 orders", "why": "A binding order before filing can void the grant.", "how": "File in Q1 and get early-start consent before ordering.", "side": "public-capital", "cite": ["judgement"]}
      ],
      "cite": ["c2", "judgement"]
    }
  ],
  "stakeholders": {
    "institutions": [
      {"id": "land-agency", "name": "The Land's investment agency (each candidate state)", "side": "political", "country": "DE", "units": [{"id": "settle", "name": "Investor settlement team", "roles": [
        {"id": "agency-head", "role": "Head of investor settlement or of the cleantech/battery desk", "priority": "P1", "reach": "The agency's investor contact line", "status": "to_approach", "cite": ["judgement"]},
        {"id": "agency-pm", "role": "Project manager for your sector", "priority": "P2", "reach": "Forwarded by the head", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "land-ministry", "name": "The Land's economy ministry and its promotional bank", "side": "public-capital", "country": "DE", "units": [{"id": "grw-unit", "name": "Regional aid unit", "roles": [
        {"id": "grw-head", "role": "Head of the regional aid unit", "priority": "P1", "reach": "Through the investment agency's introduction", "status": "to_approach", "cite": ["judgement"]},
        {"id": "bank-officer", "role": "Grant officer at the Land's promotional bank", "priority": "P2", "reach": "Named after the first meeting", "status": "to_approach", "cite": ["judgement"]}
      ]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "Regional grant", "steps": [
        {"id": "pitch-both", "label": "Meet both states' investment agencies", "start": 0, "end": 1.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "no-register", "label": "Register the company at one site before both states have made their case", "start": 0, "end": 1.5, "owner": "client", "status": "blocked", "cite": ["judgement"]},
        {"id": "gmbh", "label": "Set up and capitalise the German company; choose a house bank that passes on promotional loans", "start": 1.5, "end": 2, "owner": "client", "status": "planned", "depends_on": ["pitch-both"], "cite": ["judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "own-contribution", "kind": "flag", "severity": "medium", "title": "Own contribution free of public support limits stacking", "fix": "Plan at least EUR 5M of private money in the German company.", "cite": ["unverified", "judgement"]},
    {"id": "sme-group", "kind": "flag", "severity": "medium", "title": "A new German company does not reset the SME test", "fix": "Measure size at group level with the CFO's figures.", "cite": ["unverified"]}
  ]
}
```

**Sources:** [c2], [c3] and [c4] are from Brandenburg's regional investment grant guideline 2025 (bravors.brandenburg.de/verwaltungsvorschriften/grw_g_grosse_rili_2025). The 25% own-contribution rule and the group-level SME test still need confirming on the EU texts.

## Turn 9: the founder (fact_change, script)

> One of the two states just offered us a fast-track permit if we pick their site.

## Turn 9: Wincent

That's valuable, but it isn't money. Use it as leverage.

**What the offer is worth.** For a plant like yours, the permit is often what decides when construction can start (judgement). A fast track makes your nine-month start realistic. It also strengthens the Innovation Fund application, which scores how mature the project is (unverified). What it gives you is time, not grant money.

**How to use it:**
1. **Ask the offering state to put the grant on the table too:** the rate tier for that site, and consent to an early start (judgement).
2. **Tell the other state what you have been offered and ask what it can match,** on permits, grant or both (judgement). Five points of grant on EUR 20M is EUR 1M (judgement). Weigh that against months saved.
3. **Get the offer in writing,** with who stands behind it: the state's ministry, the permit authority or the investment agency (judgement). A promise from the investment agency doesn't bind the permit authority (judgement).

**Hand to Regina:** what "fast-track" can legally mean under German permit law, and how it compares with the statutory permit deadlines that EU strategic project status brings. The status may give you a fast track wherever you build (unverified).

**Not yet:** don't sign for the land or the site just to lock in the offer before the grant application is filed and the second state has answered.

**Which state made the offer, and who in it?** I can now pull that state's grant rate for the site and the unit that decides.

```mandate-board
{
  "stage": "advise",
  "process_maps": [
    {
      "id": "grw-decision",
      "title": "How the regional investment grant is won",
      "explains": "The German company applies to the Land before committing; the site competition is the moment to settle the grant and the permit together.",
      "kind": "funding_decision",
      "illustrative": true,
      "actors": [
        {"id": "client", "name": "Your German company", "side": "market"},
        {"id": "agency", "name": "The Land's investment agency", "side": "political"},
        {"id": "ministry", "name": "The Land's economy ministry, regional aid unit, and its bank", "side": "public-capital"}
      ],
      "steps": [
        {"id": "pitch", "label": "Site pitch to both Laender", "kind": "step", "actor": "agency", "timing": "Now to January", "cite": ["judgement"], "gates": [{"label": "Two credible sites in eastern assisted areas", "cite": ["judgement"]}, {"label": "Permit offer in writing, from the body that grants permits", "cite": ["judgement"]}]}
      ],
      "flow": [{"from": "pitch", "to": "gmbh"}],
      "leverage": [
        {"id": "permit-offer", "at": "pitch", "kind": "pressure_point", "label": "One state's fast-track permit offer", "why": "It sets a bar the other state must match, on permits or on grant.", "how": "The CEO asks the offering state for the grant terms and the other state for a matching offer.", "side": "political", "cite": ["judgement"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "networks": [
    {
      "id": "site-competition",
      "title": "Who moves the site decision",
      "explains": "In each state the investment agency courts the investor, the economy ministry decides the grant, and the permit authority decides the permit.",
      "nodes": [
        {"id": "you", "label": "Your company", "kind": "body", "cite": ["judgement"]},
        {"id": "agency-a", "label": "State A investment agency (made the offer)", "kind": "institution", "cite": ["judgement"]},
        {"id": "permit-a", "label": "State A permit authority", "kind": "body", "cite": ["judgement"]},
        {"id": "min-a", "label": "State A economy ministry", "kind": "ministry", "cite": ["judgement"]},
        {"id": "agency-b", "label": "State B investment agency", "kind": "institution", "cite": ["judgement"]},
        {"id": "min-b", "label": "State B economy ministry", "kind": "ministry", "cite": ["judgement"]},
        {"id": "cellmaker", "label": "Cell maker (letter of intent)", "kind": "body", "cite": ["judgement"]}
      ],
      "edges": [
        {"from": "agency-a", "to": "you", "kind": "works_with", "label": "fast-track permit offer", "cite": ["judgement"]},
        {"from": "min-a", "to": "agency-a", "kind": "oversees", "cite": ["unverified"]},
        {"from": "min-b", "to": "agency-b", "kind": "oversees", "cite": ["unverified"]},
        {"from": "agency-b", "to": "you", "kind": "works_with", "label": "asked to match", "cite": ["judgement"]},
        {"from": "cellmaker", "to": "you", "kind": "works_with", "label": "offtake letter of intent", "cite": ["judgement"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "Regional grant", "steps": [
        {"id": "offer-writing", "label": "Get the fast-track offer in writing, with the permit authority named", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "match", "label": "Ask the other state to match on permits or grant", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "no-land", "label": "Sign for the land to lock in the offer before both states answer and the grant is filed", "start": 0, "end": 3, "owner": "client", "status": "blocked", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-permit-crma", "label": "Does strategic project status give statutory permit deadlines that match or beat the state's offer? (Regina)", "start": 1.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "permit-binding", "kind": "flag", "severity": "medium", "title": "A fast-track promise may not bind the permit authority", "fix": "Get it in writing from the body that grants the permit; Regina to read what fast-track can mean legally.", "cite": ["judgement"]},
    {"id": "permit-vs-grant", "kind": "flag", "severity": "medium", "title": "Time is not money: compare months saved with grant points", "fix": "Ask both states for the rate tier at each site before choosing.", "cite": ["judgement"]}
  ]
}
```

## Turn 10: the founder (prioritise, script)

> Which two or three should we actually go for, and what will each cost us in time and effort?

## Turn 10: Wincent

Go for three, in this order. The time and effort figures are my estimates (judgement) unless cited.

**1. The Land's regional investment grant: the lead.**
- **Effort:** moderate. Your CFO and an adviser spend about four to six weeks on the investment, jobs and financing plan. On top come two or three meetings with the state.
- **Time:** file in the first quarter of 2027, then get consent to an early start before the May orders. The decision time differs by state (unverified).
- **Return:** about EUR 4M to 8M on EUR 20M, from rates still unverified. That is the best return per hour of anything here.

**2. The Innovation Fund 2026 call: the upside.**
- **Effort:** heavy. One or two people for most of December to April, plus a writer. The application needs an emissions case, a financial model and a maturity plan.
- **Odds:** the 2025 call drew 358 applications [w1], so it is competitive.
- **Time:** the call closes in April 2027 [w3], and the award will probably come after construction starts. Treat it as upside, not as part of the base plan.
- **Add-on:** strategic project status comes from the same file at little extra effort.

**3. Promotional loans through the German company's house bank: the filler.**
- **Effort:** low, once the bank is chosen. The loans carry the part of the cost that grants don't.
- **Terms:** to research once you have the bank (unverified).

The EIC and EIB I'd keep as a probe inside the Series B, not as a separate project.

**Who could own the Innovation Fund application from December to April?** If nobody can, I'd drop it this round and keep it for plant two.

```mandate-board
{
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Lead: the Land's regional investment grant, filed in Q1 2027 before any order.",
      "Upside: the Innovation Fund 2026 call by April 2027, with strategic project status from the same file.",
      "Filler: promotional loans through the German company's house bank.",
      "EIC or EIB only as a probe inside the Series B."
    ],
    "confidence": "medium",
    "confidence_why": "The order fits your timeline; rates, early-start rules and capacity for the EU application are still open.",
    "open_question": "Who could own the Innovation Fund application from December to April?",
    "cite": ["c2", "w1", "w3", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "de-reg", "level": "regional", "label": "Eastern German Land (site to choose)", "country": "DE", "doors": [
        {"id": "grw", "name": "Regional investment grant (GRW)", "institution": "The Land's economy ministry and bank", "status": "open", "why": "Lead: four to six weeks of work, best return per hour.", "cite": ["c2", "judgement"]},
        {"id": "land-loans", "name": "Land bank loans and guarantee bank cover", "institution": "The Land's promotional bank", "status": "probe", "why": "Part of the filler, through the house bank.", "cite": ["unverified"]}
      ]},
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "if-crm", "name": "Innovation Fund: clean-tech manufacturing and critical raw materials topic", "institution": "European Commission / CINEA", "status": "probe", "why": "Upside: heavy effort, competitive, award after construction starts.", "cite": ["w1", "w3", "judgement"]},
        {"id": "crma", "name": "EU strategic project status", "institution": "European Commission", "status": "probe", "why": "Add-on from the same file.", "cite": ["w5", "judgement"]},
        {"id": "eic-step", "name": "EIC Fund, STEP Scale Up equity", "institution": "EIC Fund", "status": "park", "why": "Probe only inside the Series B.", "cite": ["unverified", "judgement"]},
        {"id": "eib-vd", "name": "EIB venture debt", "institution": "European Investment Bank", "status": "park", "why": "Probe only inside the Series B.", "cite": ["unverified", "judgement"]}
      ]},
      {"id": "de-nat", "level": "national", "label": "Germany, federal", "country": "DE", "doors": [
        {"id": "kfw-loans", "name": "Federal promotional bank loans", "institution": "KfW", "via": "your German house bank", "status": "probe", "why": "Filler: low effort once the bank is chosen.", "cite": ["unverified"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 20000000, "label": "First commercial plant, eastern Germany"},
    "instruments": [
      {"id": "grw", "name": "Regional investment grant (illustrative)", "type": "grant", "amount": 6000000, "amount_max": 8000000, "terms": "Carries buildings and equipment; cheapest money, so it goes first", "status": "probe", "cite": ["unverified", "judgement"]},
      {"id": "loans", "name": "Promotional loans via a German house bank (illustrative)", "type": "loan", "amount": 5000000, "terms": "Carries the remaining plant cost; cheaper than equity", "status": "probe", "cite": ["judgement"]},
      {"id": "seriesb-plant", "name": "Series B share of the plant (illustrative)", "type": "equity", "amount": 7000000, "amount_max": 9000000, "terms": "Carries the own contribution of at least 25%; dearest money, kept smallest", "status": "planned", "cite": ["unverified", "judgement"]},
      {"id": "if", "name": "Innovation Fund grant", "type": "grant", "terms": "Upside: could later replace part of the loans or equity, within the combination limit", "status": "probe", "cite": ["unverified"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "Regional grant", "steps": [
        {"id": "grw-prep", "label": "Investment, jobs and financing plan (CFO and adviser)", "start": 1, "end": 2.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "grw-file", "label": "File the regional grant application", "start": 3, "end": 4, "owner": "client", "status": "planned", "depends_on": ["gmbh"], "cite": ["judgement"]}
      ]},
      {"id": "eu-if", "label": "EU Innovation Fund", "steps": [
        {"id": "if-owner", "label": "Name an owner for the application, or drop it this round", "start": 0, "end": 0.5, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "if-app", "label": "Write and file the application", "start": 0.5, "end": 5, "owner": "client", "status": "planned", "depends_on": ["if-owner"], "cite": ["w3"]}
      ]},
      {"id": "debt", "label": "Promotional loans", "steps": [
        {"id": "bank", "label": "Choose a house bank that passes on promotional loans", "start": 1.5, "end": 2, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "loan-app", "label": "Loan application through the house bank, before the orders", "start": 3, "end": 5, "owner": "client", "status": "planned", "depends_on": ["bank"], "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "if-capacity", "kind": "flag", "severity": "medium", "title": "The Innovation Fund application needs one or two people for four months", "fix": "Name an owner and a writer now, or keep it for plant two.", "cite": ["judgement"]}
  ]
}
```

**Sources:** [w1] is the IF25 net-zero call page ("When the call closed, we had received 358 applications"). [w3] and [w5] are as listed in my earlier replies. [c2] is Brandenburg's regional investment grant guideline 2025.

## Turn 11: the founder (answer, client_agent)

> Honestly, I'm not sure yet. With the Series B running at the same time, it would probably fall on me plus a hired writer. I'd rather not drop it, so let me check who on the team can free up time before I commit.

## Turn 11: Wincent

That's sensible. You can decide on a fixed date without losing the call.

**Set a go/no-go date of mid-December.** The calls open on 3 December [w2]. The info day is listed for 15 December [w4]. By then you will know three things (judgement):
- whether recycling fits the critical raw materials topic;
- whether the SME call has a lighter application;
- who can free up time.

Losing three weeks of a roughly four-month window is acceptable.

**Make the load smaller before you judge it.** Most of what the application needs is already being built for the Series B data room: the financial model, the offtake letter of intent, the plant plan and the market case (judgement). A writer can take the emissions calculation and the form-filling. That leaves you the strategy sections and the reviews, perhaps a day a week (judgement).

**One guard:** if the two run short of time, the Series B wins. It funds the own contribution the regional grant needs (unverified), and the grant is your lead route (judgement).

In the meantime, the regional grant can't move until I know **which two states the sites are in, and which of them made the permit offer.**

```mandate-board
{
  "stage": "prioritise",
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "eu-if", "label": "EU Innovation Fund", "steps": [
        {"id": "if-owner", "label": "Name an owner for the application, or drop it this round", "start": 0, "end": "2026-12-15", "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "if-reuse", "label": "Reuse the Series B data room (model, offtake letter, plant plan) for the application", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "if-gonogo", "label": "Go/no-go on the Innovation Fund", "start": "2026-12-15", "milestone": true, "owner": "client", "status": "planned", "depends_on": ["if-owner"], "cite": ["judgement"]},
        {"id": "if-app", "label": "Write and file the application", "start": "2026-12-15", "end": 5, "owner": "client", "status": "planned", "depends_on": ["if-gonogo"], "cite": ["w3"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-if-text", "label": "Call text published: does battery recycling fit the critical raw materials topic, and is the SME call lighter?", "start": "2026-12-03", "milestone": true, "owner": "us", "status": "planned", "cite": ["w2"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "if-capacity", "kind": "flag", "severity": "medium", "title": "The Innovation Fund application competes with the Series B for the CEO's time", "fix": "Go/no-go by 15 December; reuse the data room; the writer takes the emissions case; the Series B wins if time runs short.", "cite": ["judgement"]}
  ]
}
```

**Sources:** [w2], [w3] and [w4] are as listed in my earlier replies.

## Turn 12: the founder (brief, script)

> We are running out of time on our side. Can you write up what we have as a brief now?

## Turn 12: Wincent

# Brief: public money for the first commercial plant in eastern Germany

*Battery materials recycler, Swedish AB. Prepared 18 November 2026. Every fact is cited, or labelled "judgement" or "unverified".*

## 1. The read

You are a Swedish company with 40 staff and EUR 9M of equity raised. You run a recycling pilot in Sweden. Your first commercial plant is planned in eastern Germany, at about EUR 20M. It will sell recovered nickel and cobalt to cell makers, and one cell maker has signed a letter of intent. Nothing is signed or bought yet, construction is planned in about nine months, and a EUR 25M Series B should close in about six.

The deciding fact is timing. Equipment orders go out in about six months, so every grant that needs an application before you commit has to be filed before then (judgement).

## 2. The recommendation

1. **Lead with the Land's regional investment grant.** It is open to a commercial company investing at a site in an eastern assisted area [c2]. It fits your timeline, and it is the largest non-dilutive sum: about EUR 4M to 8M on EUR 20M, from rates still unverified.
2. **Apply to the Innovation Fund 2026 call as upside, not as the base.** The call opens around 3 December [w2] and closes in April 2027 [w3]. The award will probably come after construction starts (judgement). EU strategic project status can be built from the same file.
3. **Fill the rest with promotional loans** through the German company's house bank (unverified until the bank is chosen).
4. **Let the Series B carry the company's own share.** The EIC or the EIB can be probed inside the round.

## 3. The options we weighed

| Option | Status | Why |
|---|---|---|
| The Land's regional grant | **Lead** | Open, on time, best return per hour [c2] (judgement) |
| Innovation Fund 2026, critical raw materials topic | **Second** | Fits projects above EUR 2.5M [w3]; competitive: 358 applications last round [w1] |
| Innovation Fund SME call | Probe | EUR 200M for SMEs [w2]; depends on the SME test |
| EU strategic project status | Add-on | Next call around end of 2026; 19 of 46 projects selected last round were recycling [w5] |
| Promotional loans via the German house bank | **Filler** | Low effort once the bank is chosen (unverified) |
| EIC scale-up equity, EIB venture debt | Probe inside the Series B | EIC tickets of EUR 10M to 30M (unverified) |
| Innovation Fund large-scale lot | Shut | Starts above EUR 100M [w3] |
| Germany's raw materials fund (KfW) | Parked | Tickets usually EUR 50M to 150M, mostly equity [w6]; revisit for plant two |
| Swedish agency money for the German plant | Parked | Swedish calls weigh benefit to Sweden (unverified). Keep Swedish money on the pilot and the R&D |
| Sweden's export credit agency (EKN) loan guarantee | Probe | Needs "significant Swedish interest" (unverified) |

## 4. The plan

**This week**
- Get the fast-track permit offer in writing, naming the body that grants permits.
- Ask the other state to match it, on permits or on grant.
- The CFO confirms the balance sheet and any shareholder above 25%.

**This month**
- Meet both states' investment agencies.
- Get the exact product spec to Wincent.
- Decide on the Innovation Fund by 15 December.

**By mid-January**
- Set up and capitalise the German company.
- Choose a house bank that passes on promotional loans.

**This quarter (Q1 2027)**
- File the regional grant application.
- Get the Land's consent to an early start.
- Write the Innovation Fund application, if it is a go.
- Apply for strategic project status from the same file.

**April to May 2027**
- Innovation Fund deadline.
- Series B close.
- Loan application through the house bank.
- Equipment orders, only after the grant application is filed and the early start is consented.

**About August 2027:** construction starts.

**Not yet:**
- No equipment orders or construction contracts before the grant application is filed.
- No land signature, and no company registered at one site, before both states have made their offers.

## 5. Who

| Route | Side | P1 (decides) | P2 (forwards) | How to reach |
|---|---|---|---|---|
| Regional grant | Political | Head of investor settlement at the state's investment agency | Its project manager for your sector | The agency's investor contact line (judgement) |
| Regional grant | Public capital | Head of the regional aid unit, state economy ministry | Grant officer at the state's promotional bank | Introduced by the agency (judgement) |
| Innovation Fund | Public capital | Head of the Innovation Fund unit at CINEA | The call's helpdesk; your national contact point | Info day and the call page (judgement) |
| Innovation Fund | Political | The Commission's climate department (DG CLIMA), owner of the fund | Your Swedish agency, as a reference | Through the agency (judgement) |
| Promotional loans | Market and public capital | The federal promotional bank's credit decision, through the bank | Your house bank's relationship manager | The German company's bank (unverified) |

These are functions, not names. No person has been verified yet.

## 6. What to expect on the lead route

1. **Site pitch to both states, now to January.** You need two credible sites and the permit offer in writing (judgement).
2. **German company set up and capitalised, by mid-January.** It must be a commercial company [c2] outside the excluded sectors [c3]. It must also bring at least 25% own contribution free of public support (unverified). On EUR 20M that is about EUR 5M (judgement).
3. **Application filed in Q1 2027,** before any binding order (unverified). The SME size is measured together with the Swedish parent (unverified). The thresholds are under 50 staff for small and under 250 for medium [c4][c5].
4. **Early-start consent, then the grant decision.** Timing still has to be confirmed per state (unverified).

The odds are good if you file before committing and the site is in an assisted area (judgement). The rate depends on the district: about 40%, 30% or 20% for small, medium or large companies in eastern areas, plus 5 points in border areas (unverified).

## 7. Risks and flags

- **High: an order before the application can void the grant.** Fix: file in Q1 and order only after the Land consents to an early start (judgement).
- **High: grant overlap.** The regional grant and the Innovation Fund would pay for the same equipment. Fix: confirm the combination limit before counting both (unverified).
- **Medium: the Innovation Fund application closes before the Series B does.** Fix: get letters of intent from both investors and an early read from the Land (judgement).
- **Medium: SME size.** A new German company does not reset the SME test, and the Series B may push you from small to medium. Fix: the CFO's figures, measured at group level (unverified).
- **Medium: capacity.** The Innovation Fund competes with the Series B for your time. Fix: go/no-go by 15 December, reuse the data room, a writer takes the emissions case, and the Series B wins if time runs short (judgement).
- **Medium: the fast-track permit offer may not bind the permit authority.** Fix: get it in writing from that authority (judgement).
- **For Regina:** waste and battery permits for the plant; what "fast-track" can legally mean in Germany; the permit deadlines that come with strategic project status.

## 8. Watchlist

- **3 December 2026:** the Innovation Fund call text. Does battery recycling fit the critical raw materials topic, and is the SME call lighter? [w2]
- **15 December 2026:** the Innovation Fund info day [w4], and your go/no-go.
- **End of 2026:** the strategic project call opens [w5]. Check that your nickel and cobalt grade is on the EU's strategic list (unverified).
- **Q1 2027:** each state's current grant rates and early-start rules (unverified).
- **April 2027:** the Innovation Fund deadline [w3].
- **2027 and later:** the raw materials fund's budget and ticket floor, relevant for plant two [w6].

## 9. Precedents

- **Regional grant:** I found no battery recycler among Brandenburg's recent regional grants. The awards I saw went to ordinary manufacturers, at EUR 0.1M to 0.8M (register record, competition-cases.ec.europa.eu/cases/SA.112200). You would be an unusual case for the Land, which is an argument in itself (judgement).
- **Innovation Fund:** I haven't checked this in our records yet. The 19 recycling strategic projects [w5] are the place to look for comparable awards.
- **Promotional loans:** none found yet.

## 10. Open questions for you

1. **Which two states, and which one made the permit offer?** This sets the rate tier, the early-start rules and the people.
2. **Balance sheet and cap table.** These decide small or medium, which is worth about 10 points of grant (judgement).
3. **Product spec: salts or metal, and what grade?** This decides the Innovation Fund topic and the strategic list.
4. **Is the cell maker that signed the letter next to one of your sites?** This is leverage with that state.
5. **Which Swedish agency is it, and will the Swedish company own and license the IP?** This decides whether Swedish money and EKN stay in play.
6. **Who owns the Innovation Fund application, by 15 December?**

## Annex: draft letter to each state's investment agency (for you to send, or not)

> **Subject:** First commercial battery-metals recycling plant: site decision in [State]
>
> Dear [Head of Investor Settlement],
>
> [Company] recovers nickel and cobalt from battery materials and returns them to European cell makers. After a successful pilot in Sweden, we are deciding where to build our first commercial plant, about EUR 20 million. [Site] in [State] is one of two sites on our shortlist, and a cell maker has already signed a letter of intent for our output.
>
> The plant would bring battery-metal recycling, and the jobs that come with it, into [State]'s battery value chain. We would welcome a meeting in the coming weeks to discuss how the project fits [State]'s priorities, and what support and timing the state could offer.
>
> Kind regards,
> [Name], CEO

Before sending, fill in the state's own industrial-strategy wording once we know the state (judgement).

```mandate-board
{
  "title": "Battery materials recycler: public money for the first plant in eastern Germany",
  "stage": "write_up",
  "answer": {
    "lines": [
      "Lead: the Land's regional investment grant, filed in Q1 2027 before any order.",
      "Upside: the Innovation Fund 2026 call by April 2027, with strategic project status from the same file.",
      "Filler: promotional loans through the German company's house bank.",
      "The Series B carries the own contribution; EIC or EIB only as a probe inside it."
    ],
    "confidence": "medium",
    "confidence_why": "The order fits the timeline; the states, rates, early-start rules, SME size and capacity for the EU application are still open.",
    "open_question": "Which two states, and which one made the permit offer?",
    "cite": ["c2", "w2", "w3", "w5", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "if-crm", "name": "Innovation Fund: clean-tech manufacturing and critical raw materials topic", "institution": "European Commission / CINEA", "status": "probe", "why": "Second: projects above EUR 2.5M; closes Apr 2027; award likely after construction starts.", "conditions": ["Go/no-go by 15 Dec 2026", "Financing plan before Series B closes"], "cite": ["w1", "w3", "judgement"]},
        {"id": "if-sme", "name": "Innovation Fund SME call", "institution": "European Commission / CINEA", "status": "probe", "why": "EUR 200M for SMEs; depends on the SME test.", "cite": ["w2"]},
        {"id": "if-gen", "name": "Innovation Fund general decarbonisation, small and medium scale", "institution": "European Commission / CINEA", "status": "probe", "why": "EUR 2.5M to 100M band; fallback topic.", "cite": ["w3"]},
        {"id": "if-lsp", "name": "Innovation Fund large-scale lot", "institution": "European Commission / CINEA", "status": "shut", "why": "Starts above EUR 100M.", "cite": ["w3"]},
        {"id": "crma", "name": "EU strategic project status", "institution": "European Commission", "status": "probe", "why": "Add-on from the same file; next call end of 2026.", "cite": ["w5"]},
        {"id": "eic-step", "name": "EIC Fund, STEP Scale Up equity", "institution": "EIC Fund", "status": "park", "why": "Probe only inside the Series B.", "cite": ["unverified"]},
        {"id": "eib-vd", "name": "EIB venture debt", "institution": "European Investment Bank", "status": "park", "why": "Probe only inside the Series B.", "cite": ["unverified"]}
      ]},
      {"id": "de-nat", "level": "national", "label": "Germany, federal", "country": "DE", "doors": [
        {"id": "kfw-loans", "name": "Federal promotional bank loans", "institution": "KfW", "via": "your German house bank", "status": "probe", "why": "Filler: low effort once the bank is chosen.", "cite": ["unverified"]},
        {"id": "kfw-rf", "name": "German raw materials fund", "institution": "KfW", "status": "park", "why": "Tickets usually EUR 50M to 150M, mostly equity; plant two.", "cite": ["w6"]}
      ]},
      {"id": "de-reg", "level": "regional", "label": "Eastern German Land (site to choose)", "country": "DE", "doors": [
        {"id": "grw", "name": "Regional investment grant (GRW)", "institution": "The Land's economy ministry and bank", "status": "open", "why": "Lead: on time, largest non-dilutive sum; apply before any order.", "conditions": ["German company at the site", "Not in an excluded sector", "Apply before committing"], "cite": ["c2", "c3", "unverified"]},
        {"id": "land-loans", "name": "Land bank loans and guarantee bank cover", "institution": "The Land's promotional bank", "status": "probe", "why": "Part of the filler, through the house bank.", "cite": ["unverified"]}
      ]},
      {"id": "se", "level": "national", "label": "Sweden", "country": "SE", "doors": [
        {"id": "se-rd", "name": "Swedish agency support for process R&D and the pilot", "institution": "Your Swedish agency", "status": "open", "why": "Keeps carrying Swedish costs.", "cite": ["judgement"]},
        {"id": "se-plant", "name": "Swedish agency grant for the German plant", "institution": "Your Swedish agency", "status": "park", "why": "Calls weigh benefit to Sweden.", "cite": ["unverified"]},
        {"id": "ekn", "name": "EKN investment credit guarantee", "institution": "EKN", "via": "your lender", "status": "probe", "why": "Needs significant Swedish interest.", "cite": ["unverified"]}
      ]}
    ]
  },
  "hierarchies": [
    {
      "id": "field",
      "title": "Where plant money sits",
      "explains": "EU programmes and status sit above; the federal-Land regional grant is paid by the Land where the plant stands; federal loans come through the house bank.",
      "nodes": [
        {"id": "eu", "label": "EU", "kind": "institution", "cite": ["judgement"]},
        {"id": "if", "label": "EU Innovation Fund 2026 (CINEA)", "kind": "programme", "parent": "eu", "status": "probe", "note": "Opens 3 Dec 2026, closes Apr 2027.", "cite": ["w2", "w3"]},
        {"id": "if-crm", "label": "Critical raw materials topic", "kind": "instrument", "parent": "if", "status": "probe", "cite": ["w3"]},
        {"id": "if-sme", "label": "SME call", "kind": "instrument", "parent": "if", "status": "probe", "cite": ["w2"]},
        {"id": "crma", "label": "EU strategic project status", "kind": "programme", "parent": "eu", "status": "probe", "cite": ["w5"]},
        {"id": "eic", "label": "EIC Fund and EIB", "kind": "programme", "parent": "eu", "status": "park", "cite": ["unverified"]},
        {"id": "de", "label": "Federal level (economy ministry)", "kind": "ministry", "cite": ["judgement"]},
        {"id": "grw", "label": "Regional investment grant (GRW), federal-Land joint task", "kind": "programme", "parent": "de", "status": "open", "cite": ["c1"]},
        {"id": "other-laender", "label": "The two candidate Laender", "kind": "regional_body", "parent": "grw", "status": "open", "note": "Site decides the rate tier and the Land bank.", "cite": ["judgement"]},
        {"id": "kfw", "label": "Federal promotional bank (loans via your bank)", "kind": "institution", "parent": "de", "status": "probe", "cite": ["unverified"]},
        {"id": "kfw-rf", "label": "German raw materials fund", "kind": "instrument", "parent": "kfw", "status": "park", "cite": ["w6"]},
        {"id": "se", "label": "Sweden", "kind": "institution", "status": "probe", "note": "R&D and pilot; EKN probe.", "cite": ["judgement"]}
      ],
      "cite": ["c1", "w2", "w3", "w5", "w6"]
    }
  ],
  "networks": [
    {
      "id": "site-competition",
      "title": "Who moves the site decision",
      "explains": "Each state's investment agency courts you; its economy ministry decides the grant; the permit authority decides the permit.",
      "nodes": [
        {"id": "you", "label": "Your company", "kind": "body", "cite": ["judgement"]},
        {"id": "agency-a", "label": "State A investment agency (made the offer)", "kind": "institution", "cite": ["judgement"]},
        {"id": "permit-a", "label": "State A permit authority", "kind": "body", "cite": ["judgement"]},
        {"id": "min-a", "label": "State A economy ministry", "kind": "ministry", "cite": ["judgement"]},
        {"id": "agency-b", "label": "State B investment agency", "kind": "institution", "cite": ["judgement"]},
        {"id": "min-b", "label": "State B economy ministry", "kind": "ministry", "cite": ["judgement"]},
        {"id": "cellmaker", "label": "Cell maker (letter of intent)", "kind": "body", "cite": ["judgement"]}
      ],
      "edges": [
        {"from": "agency-a", "to": "you", "kind": "works_with", "label": "fast-track permit offer", "cite": ["judgement"]},
        {"from": "min-a", "to": "agency-a", "kind": "oversees", "cite": ["unverified"]},
        {"from": "min-b", "to": "agency-b", "kind": "oversees", "cite": ["unverified"]},
        {"from": "agency-b", "to": "you", "kind": "works_with", "label": "asked to match", "cite": ["judgement"]},
        {"from": "cellmaker", "to": "you", "kind": "works_with", "label": "offtake letter of intent", "cite": ["judgement"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "process_maps": [
    {
      "id": "grw-decision",
      "title": "How the regional investment grant is won",
      "explains": "The German company applies to the Land before committing; the Land checks the site, jobs and size, then decides.",
      "kind": "funding_decision",
      "illustrative": true,
      "actors": [
        {"id": "client", "name": "Your German company", "side": "market"},
        {"id": "agency", "name": "The Land's investment agency", "side": "political"},
        {"id": "ministry", "name": "The Land's economy ministry, regional aid unit, and its bank", "side": "public-capital"}
      ],
      "steps": [
        {"id": "pitch", "label": "Site pitch to both Laender", "kind": "step", "actor": "agency", "timing": "Now to January", "cite": ["judgement"], "gates": [{"label": "Two credible sites in eastern assisted areas", "cite": ["judgement"]}, {"label": "Permit offer in writing, from the body that grants permits", "cite": ["judgement"]}]},
        {"id": "gmbh", "label": "Set up and capitalise the German company", "kind": "document", "actor": "client", "timing": "By mid-January", "cite": ["judgement"], "gates": [{"label": "A commercial company", "cite": ["c2"]}, {"label": "Not in an excluded sector", "cite": ["c3"]}, {"label": "At least 25% own contribution free of public support", "cite": ["unverified"]}]},
        {"id": "file", "label": "File the grant application", "kind": "document", "actor": "client", "timing": "Q1 2027", "cite": ["judgement"], "gates": [{"label": "Before any binding order or construction contract", "cite": ["unverified"]}, {"label": "SME size measured with the Swedish parent", "cite": ["c4", "c5", "unverified"]}]},
        {"id": "early", "label": "Land consents to an early start", "kind": "decision", "actor": "ministry", "timing": "Weeks after filing", "cite": ["unverified"]},
        {"id": "award", "label": "Grant decision", "kind": "decision", "actor": "ministry", "timing": "To confirm per Land", "cite": ["unverified"]}
      ],
      "flow": [{"from": "pitch", "to": "gmbh"}, {"from": "gmbh", "to": "file"}, {"from": "file", "to": "early"}, {"from": "early", "to": "award"}],
      "leverage": [
        {"id": "permit-offer", "at": "pitch", "kind": "pressure_point", "label": "Two states competing; one has offered a fast-track permit", "why": "It sets a bar the other state must match.", "how": "The CEO asks the offering state for grant terms and the other for a match.", "side": "political", "cite": ["judgement"]},
        {"id": "loi-lever", "at": "pitch", "kind": "door_opener", "label": "The cell maker's letter of intent", "why": "Shows offtake into the state's battery chain.", "how": "Bring it to the first meeting.", "side": "market", "cite": ["judgement"]},
        {"id": "order-window", "at": "file", "kind": "timing_window", "label": "File before May 2027 orders", "why": "A binding order before filing can void the grant.", "how": "File in Q1; order after early-start consent.", "side": "public-capital", "cite": ["judgement"]}
      ],
      "cite": ["c2", "judgement"]
    }
  ],
  "stakeholders": {
    "institutions": [
      {"id": "land-agency", "name": "The Land's investment agency (each candidate state)", "side": "political", "country": "DE", "units": [{"id": "settle", "name": "Investor settlement team", "roles": [
        {"id": "agency-head", "role": "Head of investor settlement or of the cleantech/battery desk", "priority": "P1", "reach": "The agency's investor contact line", "status": "to_approach", "cite": ["judgement"]},
        {"id": "agency-pm", "role": "Project manager for your sector", "priority": "P2", "reach": "Forwarded by the head", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "land-ministry", "name": "The Land's economy ministry and its promotional bank", "side": "public-capital", "country": "DE", "units": [{"id": "grw-unit", "name": "Regional aid unit", "roles": [
        {"id": "grw-head", "role": "Head of the regional aid unit", "priority": "P1", "reach": "Through the investment agency's introduction", "status": "to_approach", "cite": ["judgement"]},
        {"id": "bank-officer", "role": "Grant officer at the Land's promotional bank", "priority": "P2", "reach": "Named after the first meeting", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "cinea", "name": "CINEA, Innovation Fund", "side": "public-capital", "country": "EU", "units": [{"id": "if-unit", "name": "Innovation Fund unit", "roles": [
        {"id": "if-head", "role": "Head of the Innovation Fund unit", "priority": "P1", "reach": "Info day and the official call page", "status": "to_approach", "cite": ["w2", "judgement"]},
        {"id": "if-ncp", "role": "Call helpdesk and national contact point", "priority": "P2", "reach": "Call page; Swedish agency as reference", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "dg-clima", "name": "European Commission, climate department (DG CLIMA)", "side": "political", "country": "EU", "units": [{"id": "clima-if", "name": "Innovation Fund policy unit", "roles": [
        {"id": "clima-head", "role": "Head of the unit that owns the fund", "priority": "P1", "reach": "Only with a warm introduction", "status": "to_approach", "cite": ["judgement"]},
        {"id": "se-agency-ref", "role": "Your Swedish agency, as reference", "priority": "P2", "reach": "Your existing contact", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "house-bank", "name": "German company's house bank and the federal promotional bank", "side": "market", "country": "DE", "units": [{"id": "credit", "name": "Corporate banking", "roles": [
        {"id": "credit-dec", "role": "The bank's credit committee, on-lending the promotional loan", "priority": "P1", "reach": "Through the relationship manager", "status": "to_approach", "cite": ["unverified"]},
        {"id": "rm", "role": "Relationship manager", "priority": "P2", "reach": "When the account is opened", "status": "to_approach", "cite": ["judgement"]}
      ]}]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 20000000, "label": "First commercial plant, eastern Germany"},
    "instruments": [
      {"id": "grw", "name": "Regional investment grant (illustrative)", "type": "grant", "amount": 6000000, "amount_max": 8000000, "terms": "Carries buildings and equipment; cheapest money, tied to the site and to applying first", "status": "probe", "cite": ["unverified", "judgement"]},
      {"id": "loans", "name": "Promotional loans via a German house bank (illustrative)", "type": "loan", "amount": 5000000, "terms": "Carries the remaining plant cost; cheaper than equity once the grant is in", "status": "probe", "cite": ["judgement"]},
      {"id": "seriesb-plant", "name": "Series B share of the plant (illustrative)", "type": "equity", "amount": 7000000, "amount_max": 9000000, "terms": "Carries the own contribution of at least 25%; dearest money, kept smallest", "status": "planned", "cite": ["unverified", "judgement"]},
      {"id": "if", "name": "Innovation Fund grant", "type": "grant", "terms": "Upside: could later replace part of the loans or equity, within the combination limit", "status": "probe", "cite": ["w3", "unverified"]},
      {"id": "se-rd", "name": "Swedish agency R&D grants", "type": "grant", "terms": "Carries process R&D and the pilot in Sweden, not the plant", "status": "probe", "cite": ["judgement"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "Regional grant", "steps": [
        {"id": "offer-writing", "label": "Get the fast-track offer in writing", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "pitch-both", "label": "Meet both states' investment agencies; ask the other state to match", "start": 0, "end": 1.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "no-land", "label": "Sign for land or register at one site before both states answer and the grant is filed", "start": 0, "end": 3, "owner": "client", "status": "blocked", "cite": ["judgement"]},
        {"id": "gmbh", "label": "Set up and capitalise the German company", "start": 1.5, "end": 2, "owner": "client", "status": "planned", "depends_on": ["pitch-both"], "cite": ["judgement"]},
        {"id": "grw-prep", "label": "Investment, jobs and financing plan", "start": 1, "end": 2.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "grw-file", "label": "File the regional grant application", "start": 3, "end": 4, "owner": "client", "status": "planned", "depends_on": ["gmbh"], "cite": ["judgement"]},
        {"id": "orders", "label": "Equipment orders, only after filing and early-start consent", "start": 6, "milestone": true, "owner": "client", "status": "blocked", "depends_on": ["grw-file"], "cite": ["judgement"]},
        {"id": "build", "label": "Construction starts", "start": 9, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["orders"], "cite": ["judgement"]}
      ]},
      {"id": "eu-if", "label": "EU Innovation Fund and strategic status", "steps": [
        {"id": "if-owner", "label": "Name an owner and a writer", "start": 0, "end": "2026-12-15", "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "if-open", "label": "2026 calls open", "start": "2026-12-03", "milestone": true, "owner": "institution", "status": "planned", "cite": ["w2"]},
        {"id": "if-gonogo", "label": "Go/no-go on the Innovation Fund", "start": "2026-12-15", "milestone": true, "owner": "client", "status": "planned", "depends_on": ["if-owner"], "cite": ["judgement"]},
        {"id": "if-app", "label": "Write and file the application, reusing the data room", "start": "2026-12-15", "end": 5, "owner": "client", "status": "planned", "depends_on": ["if-gonogo"], "cite": ["w3"]},
        {"id": "crma-app", "label": "Strategic project application from the same file", "start": 1.5, "end": 4, "owner": "client", "status": "planned", "cite": ["w5", "judgement"]},
        {"id": "if-close", "label": "Net-zero call closes (planned)", "start": "2027-04", "milestone": true, "owner": "institution", "status": "planned", "cite": ["w3"]}
      ]},
      {"id": "raise", "label": "Series B and loans", "steps": [
        {"id": "loi", "label": "Letters of intent from both investors", "start": 1, "end": 4, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "bank", "label": "Choose a house bank that passes on promotional loans", "start": 1.5, "end": 2, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "loan-app", "label": "Loan application through the house bank", "start": 3, "end": 5, "owner": "client", "status": "planned", "depends_on": ["bank"], "cite": ["unverified"]},
        {"id": "close", "label": "Series B close (target)", "start": 6, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-if-text", "label": "Call text: recycling fit, SME call weight", "start": "2026-12-03", "milestone": true, "owner": "us", "status": "planned", "cite": ["w2"]},
        {"id": "w-info", "label": "Innovation Fund info day", "start": "2026-12-15", "milestone": true, "owner": "us", "status": "planned", "cite": ["w4"]},
        {"id": "w-crma-call", "label": "Strategic project call opens; check nickel and cobalt grade on the list", "start": 1.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["w5", "unverified"]},
        {"id": "w-permit-crma", "label": "Strategic status permit deadlines vs the state's offer (Regina)", "start": 1.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-grw-rates", "label": "Each state's current rate tier and early-start rule", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-kfw-rf", "label": "Raw materials fund budget and ticket floor, plant two", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["w6"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "start-of-works", "kind": "deal_breaker", "severity": "high", "title": "An order before the application can void the grant", "fix": "File in Q1 2027; order only after early-start consent.", "cite": ["judgement", "unverified"]},
    {"id": "cumulation", "kind": "flag", "severity": "high", "title": "Regional grant and Innovation Fund on the same equipment", "fix": "Confirm the combination limit before counting both.", "cite": ["unverified"]},
    {"id": "finance-proof", "kind": "flag", "severity": "medium", "title": "The EU application closes before the Series B does", "fix": "Investor letters of intent and an early read from the Land.", "cite": ["w3", "judgement"]},
    {"id": "sme-shift", "kind": "flag", "severity": "medium", "title": "SME size measured at group level; the Series B may move you to medium", "fix": "CFO's balance sheet and cap table.", "cite": ["c4", "c5", "unverified"]},
    {"id": "own-contribution", "kind": "flag", "severity": "medium", "title": "Own contribution free of public support limits stacking", "fix": "Plan at least EUR 5M private money in the German company.", "cite": ["unverified", "judgement"]},
    {"id": "if-capacity", "kind": "flag", "severity": "medium", "title": "The EU application competes with the Series B for the CEO's time", "fix": "Go/no-go by 15 December; reuse the data room; the Series B wins.", "cite": ["judgement"]},
    {"id": "permit-binding", "kind": "flag", "severity": "medium", "title": "A fast-track promise may not bind the permit authority", "fix": "Get it in writing from that authority.", "cite": ["judgement"]},
    {"id": "regina-permits", "kind": "flag", "severity": "medium", "title": "Waste, battery and fast-track permit questions", "fix": "Handed to Regina.", "cite": ["judgement"]}
  ]
}
```

## Sources

- [c1]: Brandenburg regional investment grant guideline (GRW-G) 2025, bravors.brandenburg.de/verwaltungsvorschriften/grw_g_grosse_rili_2025, sha256 5eb4897b4ae2: "Zuwendungsempfangende sind Unternehmen der gewerblichen Wirtschaft." (Recipients are commercial companies.)
- [c2]: same guideline, sha256 65230c227388, the same quote.
- [c3]: same, sha256 65230c227388, the list of excluded sectors, ending "Energieversorgung" (energy supply).
- [c4]: same, sha256 65230c227388, the definition of a small company (under 50 staff, at most EUR 10M turnover or balance sheet).
- [c5]: same, sha256 65230c227388, the definition of a medium company (under 250 staff, at most EUR 50M turnover).
- [w1]: [Commission, IF25 net-zero call page](https://climate.ec.europa.eu/eu-action/eu-funding-climate-action/innovation-fund/calls-proposals/if25-nzt_en), 18 Nov 2026: "When the call closed, we had received 358 applications"; the capex bands for the small and medium lots.
- [w2]: [CINEA, Innovation Fund 2026 info days](https://cinea.ec.europa.eu/news-events/news/registrations-open-innovation-fund-2026-info-days-2026-11-17_en), 18 Nov 2026: "The Commission plans to launch five calls for proposals (grants and auctions) on 3 December"; the SME call, "Available budget: €200 million".
- [w3]: [Commission, IF26 net-zero call page](https://climate.ec.europa.eu/areas-action/eu-funding-climate-action/innovation-fund/calls-proposals/if26-nzt-call_en), 18 Nov 2026: "April 2027 IF26 Call for Proposals - Planned closure"; "CAPEX between €2.5 million and €100 million"; "CAPEX above €100 million".
- [w4]: [CINEA info day event, 15 Dec 2026](https://cinea.ec.europa.eu/news-events/events/innovation-fund-2026-maritime-and-net-zero-technologies-calls-info-day-2026-12-15_en). I saw this in search results and did not open the page.
- [w5]: [Commission, "46 new Strategic Projects", 9 Oct 2026](https://luxembourg.representation.ec.europa.eu/actualites-et-evenements/actualites/commission-selects-46-new-strategic-projects-bolster-eus-supply-critical-raw-materials-2026-10-09_en), 18 Nov 2026: "19 are recycling projects"; "a new call ... towards the end of 2026".
- [w6]: [KfW press release on the raw materials fund](https://www.kfw.de/%C3%9Cber-die-KfW/Newsroom/Aktuelles/Pressemitteilungen-Details_824192.html), 18 Nov 2026: "zwischen 50 Mio. Euro und 150 Mio. Euro" (usually EUR 50M to 150M).
- Unverified, seen in search only and to confirm on the source: the [GTAI grants table](https://www.gtai.de/resource/blob/1826382/7948379eb1061c62c204965fba4af0a7/grants-for-investments) for rate tiers; Swedish Energy Agency call texts on benefit to Sweden; the [EKN investment credit guarantee product sheet](https://www.ekn.se/globalassets/dokument/garantier---dokument/produktblad/garanti-for-investeringskrediter_v4.pdf); the EIC scale-up figures from our own records.

Want me to save this run?
