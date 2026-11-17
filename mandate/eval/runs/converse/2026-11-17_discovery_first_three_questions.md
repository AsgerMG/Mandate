# Simulated conversation: discovery_first_three_questions

Case: `mandate/eval/scenarios/discovery_first_three_questions.yaml`. Brain: Wincent. Playbooks at 62c8b788e8. 2026-11-17T18:29:38+00:00. 2 turns (script 1/8; stopped: db_unreachable; client agent called 0x).
Leave-one-out case library: 0 entries left out.

## Turn 1: the founder (opener, script)

> We make dairy proteins by fermentation. We want public money for a pilot plant and to get into Spain. Where do we start?

## Turn 1: Wincent

Your message settles three things. The activity is food biotech, the money is for a pilot plant, which is equipment and scale-up rather than research alone, and there are at least two fronts: your home market and Spain. It doesn't yet tell me who should pay, so three questions first.

1. **Where are you incorporated, and where would the pilot plant be built?** This decides which country's money applies. If the plant goes in Spain, the pilot and the move into Spain become one case, and Spain's national and regional programmes come into play. If it stays at home, Spain becomes a market-entry case and the plant money comes from home or the EU (judgement).
2. **How big is the plant, when do you want to start, and are you raising now?** For example: capex in euros, and whether a round is open. Size decides between a national grant or loan and an EU-scale demonstration route. A live round would put a public co-investment next to your investors first (judgement).
3. **What does "getting into Spain" mean to you?** Selling to Spanish dairy and food makers, a partnership with one of them, or your own entity and staff there? Each opens a different door (judgement).

**Safe whatever you answer:** don't sign equipment orders or start building before we file. Starting work first can make grant aid ineligible (unverified until I check the specific scheme).

**Not yet:** don't set up a Spanish company just to qualify for funding before the plant location is decided.

**One flag for Regina:** precision-fermentation proteins likely need EU novel-food authorisation (unverified). That timing shapes what funders will back. Regina will assess it.

The board shows the landscape I expect to work through. I haven't checked any programme yet; I'll do that once you answer.

```mandate-board
{
  "title": "Precision-fermentation dairy proteins: pilot plant and Spain",
  "stage": "qualify",
  "hierarchies": [
    {
      "id": "field",
      "title": "The field we will work, before checking",
      "explains": "Pilot-plant money can come from the EU layer, the home country, or Spain at national and regional level; which one depends on where the plant sits.",
      "nodes": [
        {"id": "eu", "label": "EU level", "kind": "institution", "cite": ["judgement"]},
        {"id": "eu-cbe", "label": "Bio-based industries partnership (demonstration and flagship plants)", "kind": "programme", "parent": "eu", "status": "probe", "note": "Fit depends on plant size and timing.", "cite": ["unverified"]},
        {"id": "eu-eic", "label": "EU innovation council (scale-up grant plus equity)", "kind": "programme", "parent": "eu", "status": "probe", "note": "Fit depends on stage and raise.", "cite": ["unverified"]},
        {"id": "eu-eib", "label": "EU investment bank (venture debt)", "kind": "institution", "parent": "eu", "status": "probe", "note": "Usually for larger tickets.", "cite": ["unverified"]},
        {"id": "home", "label": "Home country (to confirm)", "kind": "ministry", "status": "probe", "note": "Leads if the plant stays at home.", "cite": ["judgement"]},
        {"id": "es", "label": "Spain, national", "kind": "ministry", "cite": ["judgement"]},
        {"id": "es-cdti", "label": "Spanish innovation agency (R&D and innovation loans and grants)", "kind": "institution", "parent": "es", "status": "probe", "note": "Needs a Spanish establishment, to confirm.", "cite": ["unverified"]},
        {"id": "es-enisa", "label": "Spanish public lender for start-ups (participative loans)", "kind": "institution", "parent": "es", "status": "probe", "note": "Needs a Spanish company, to confirm.", "cite": ["unverified"]},
        {"id": "es-reg", "label": "Spanish regions (regional development agencies)", "kind": "regional_body", "parent": "es", "status": "probe", "note": "Only once a region is chosen.", "cite": ["judgement"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "risks_flags": [
    {"id": "start-of-work", "kind": "deal_breaker", "severity": "high", "title": "Starting work before filing can void grant aid", "fix": "No binding orders or works until the lead scheme is filed.", "cite": ["unverified"]},
    {"id": "novel-food", "kind": "flag", "severity": "medium", "title": "Novel-food authorisation likely needed before selling", "fix": "Handed to Regina for assessment.", "cite": ["unverified"]}
  ]
}
```

## Turn 2: the founder (answer, if_asked)

> About 8 million. Two possible sites, one near Lisbon and one in the Alentejo. Nothing signed yet.
> 
> Two Spanish dairy groups are piloting with us. No Spanish company planned yet.

## Turn 2: Wincent

The site question matters more than Spain, so I checked it first. **The two sites carry very different public money.**

- The Alentejo is an "a" region. Aid there can reach 30% of eligible investment for a large company, and 40% in Alto Alentejo [w1].
- Lisbon is weaker. Only parts of the metropolitan area are "c" regions, capped at 15% for a large company [w1]. If your site falls outside those parts, regional investment aid may not apply at all (unverified).
- Small companies get +20 points and medium-sized companies +10 [w1].

**What that means for €8M**, assuming all of it is eligible cost and you are a small company (my assumption):

| Site | Ceiling | Up to |
|---|---|---|
| Alentejo | 50% | €4.0M |
| Lisbon, assisted part | 35% | €2.8M |
| Lisbon, unassisted part | none | €0 |

The cap could rise further in Alto Alentejo (judgement).

**Timing.** Portugal's main grant for productive investment just closed on 30 September 2026 (unverified: from a search result, page not opened). The next call is what we plan around. Don't commit to the site before we know the region it falls in.

**EU level.** The EU bio-based partnership's food-ingredient demonstration-plant topic was €20M for one project, closed 22 September [w2]. It targets bigger, later-stage plants than a pilot, so treat it as a later step (judgement).

**Spain.** Your two dairy groups are your way in as customers and partners. You don't need a Spanish company for that (judgement).

**Next question:** where are you incorporated, and are you small (under 50 staff, under €10M turnover)? That sets the bonus above, and whether a Portuguese entity has to hold the plant.

```mandate-board
{
  "title": "Precision-fermentation dairy proteins: pilot plant and Spain",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "The field, now centred on Portugal",
      "explains": "The plant is in Portugal, so Portuguese regional aid and EU money lead; Spain is a customer market.",
      "nodes": [
        {"id": "eu", "label": "EU level", "kind": "institution", "cite": ["judgement"]},
        {"id": "eu-cbe", "label": "EU bio-based partnership, food-ingredient flagship (EUR 20M, TRL 8)", "kind": "programme", "parent": "eu", "status": "park", "note": "2026 call closed 22 Sep; for a later, larger plant.", "cite": ["w2"]},
        {"id": "eu-eic", "label": "EU innovation council (scale-up grant plus equity)", "kind": "programme", "parent": "eu", "status": "probe", "note": "Fit depends on stage and raise.", "cite": ["unverified"]},
        {"id": "pt", "label": "Portugal, national", "kind": "ministry", "cite": ["judgement"]},
        {"id": "pt-sice", "label": "Productive innovation incentive (Portugal 2030)", "kind": "programme", "parent": "pt", "status": "probe", "note": "Last call closed 30 Sep 2026; plan for the next.", "cite": ["unverified"]},
        {"id": "pt-alentejo", "label": "Alentejo regional programme ('a' region, 30-40% large, +20 small)", "kind": "regional_body", "parent": "pt", "status": "open", "note": "Highest ceiling of the two sites.", "cite": ["w1"]},
        {"id": "pt-lisboa", "label": "Lisbon regional programme (parts 'c', 15% large, +20 small)", "kind": "regional_body", "parent": "pt", "status": "probe", "note": "Check the site sits in an assisted part.", "cite": ["w1"]},
        {"id": "es", "label": "Spain", "kind": "ministry", "cite": ["judgement"]},
        {"id": "es-cdti", "label": "Spanish innovation agency", "kind": "institution", "parent": "es", "status": "park", "note": "Your Spanish dairy partners' door, not yours without an entity.", "cite": ["unverified"]},
        {"id": "home", "label": "Home country (to confirm)", "kind": "ministry", "status": "probe", "cite": ["judgement"]}
      ],
      "cite": ["w1", "w2"]
    }
  ],
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 8000000, "label": "Pilot plant"},
    "instruments": [
      {"id": "pt-regional", "name": "Regional investment aid, Alentejo site (small company)", "type": "grant", "amount": 3200000, "amount_max": 4000000, "terms": "Carries plant capex; cheapest money; ceiling set by site and company size", "status": "probe", "cite": ["w1", "judgement"]}
    ]
  },
  "risks_flags": [
    {"id": "site-region", "kind": "flag", "severity": "high", "title": "Site choice sets the aid ceiling", "fix": "Map each site to its regional-aid area before committing.", "cite": ["w1"]},
    {"id": "start-of-work", "kind": "deal_breaker", "severity": "high", "title": "Starting work before filing can void grant aid", "fix": "No binding orders or works until the lead scheme is filed.", "cite": ["unverified"]},
    {"id": "novel-food", "kind": "flag", "severity": "medium", "title": "Novel-food authorisation likely needed before selling", "fix": "Handed to Regina.", "cite": ["unverified"]}
  ]
}
```

**Sources**
- [w1] econews.pt, "EC approves Portugal's regional aid plan 2022-2027", https://econews.pt/?p=35755, retrieved 2026-11-17: "with a maximum aid intensity of 30% for large companies"; "an increase in the maximum aid intensity from 30% to 40%"; "the maximum aid intensity may reach 15% for large companies"; "by 20 percentage points for investments by small enterprises."
- [w2] CBE JU, "€170.7 million for new bio-based innovations", https://www.cbe.europa.eu/news/eu1707-million-new-bio-based-innovations, retrieved 2026-11-17: "The 2026 call for proposals will open on 23 April and close on 22 September 2026."; "Diversification of nutritional food ingredient sources for increased EU resilience and strategic autonomy".
- Search results not yet opened (unverified): [Portugal Global, aviso Inovação Produtiva junho 2026](https://portugalglobal.pt/media/yzafyukl/aviso-inovaçao-produtiva-junho-2026.pdf); [IAPMEI presentation](https://algarve.portugal2030.pt/wp-content/uploads/sites/15/2026/07/20260728-IAPMEI.pdf); [EC decision SA.109212](https://ec.europa.eu/competition/state_aid/cases1/202341/SA_109212_D045248B-0100-CB6D-A87E-B72EF0E97733_31_1.pdf).

*Note for the owner: the corpus tools could not run in this session (shell access was denied), so every figure above comes from the web and nothing is in grounding yet.*
