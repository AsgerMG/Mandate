# Simulated conversation: discovery_first_three_questions

Case: `mandate/eval/scenarios/discovery_first_three_questions.yaml`. Brain: Wincent. Playbooks at d31db7a869. 2026-11-17T18:32:53+00:00. 11 turns (script 8/8; stopped: wrapped_up; client agent called 3x).
Leave-one-out case library: 0 entries left out.

## Turn 1: the founder (opener, script)

> We make dairy proteins by fermentation. We want public money for a pilot plant and to get into Spain. Where do we start?

## Turn 1: Wincent

Fermentation-derived dairy proteins at pilot scale is a scale-up case with a market-entry question attached. Before I name a fund, the answer depends mostly on where the plant goes and which company owns it.

A few things are already clear. The work is pilot-scale industrial biotech, so you are past lab grants and short of plant debt. The EU's bio-based partnership funds this kind of scale-up, but only in a consortium of at least three independent entities, each established in a different country [c10]. In Spain, the national innovation agency funds company R&D projects, alone or in consortia of 2 to 6 companies (register record, cdti.es/ayudas/proyectos-de-i-d). Its regulatory bases say an application cannot be changed once it is filed [c5].

Three questions decide the route:

1. **Where will the pilot plant be, and which entity will own it?** If it is in Spain and owned by a Spanish company, Spain's national and regional plant money is open to you. If it is at home, Spain becomes a sales-entry question with different money.
2. **What will the plant cost, and have you signed or started anything yet** (equipment orders, site lease, works)? The cost decides grant versus loan versus the EU layer. Starting work before you apply usually removes grant eligibility (unverified; I will confirm it per scheme).
3. **Are you raising, or do you have an industrial partner, such as a dairy or food group?** A round points to public co-investment. A partner points to the EU consortium.

**Safe whatever you answer:** do not order equipment or start works before an application is filed.
**Not yet:** do not set up a Spanish company only to qualify for aid.

One thing for Regina: selling these proteins in Spain probably needs EU novel-food authorisation first (unverified). I am passing it to Regina for a separate assessment.

Where is the plant going?

```mandate-board
{
  "title": "Fermented dairy proteins: pilot plant and Spain",
  "stage": "qualify",
  "hierarchies": [
    {
      "id": "field",
      "title": "Who funds a pilot plant, EU and Spain",
      "explains": "EU research money for bio-based scale-up runs through a joint undertaking under Horizon Europe; Spain's national innovation money runs through its science ministry's agency. Which branch opens depends on where the plant sits.",
      "nodes": [
        {"id": "ec", "label": "European Commission", "kind": "institution", "cite": ["judgement"]},
        {"id": "he", "label": "Horizon Europe", "kind": "programme", "parent": "ec", "cite": ["judgement"]},
        {"id": "cbe", "label": "Circular Bio-based Europe Joint Undertaking", "kind": "programme", "parent": "he", "status": "probe", "note": "Scale-up grants; needs a consortium of 3 entities in 3 countries.", "cite": ["c10", "unverified"]},
        {"id": "es-min", "label": "Spain: science and innovation ministry", "kind": "ministry", "cite": ["judgement"]},
        {"id": "cdti", "label": "CDTI, national innovation agency", "kind": "institution", "parent": "es-min", "cite": ["c1"]},
        {"id": "cdti-idi", "label": "CDTI R&D projects", "kind": "instrument", "parent": "cdti", "status": "probe", "note": "Depends on a Spanish establishment; to confirm.", "cite": ["c5", "unverified"]},
        {"id": "es-reg", "label": "Spanish regional development agencies", "kind": "regional_body", "parent": "es-min", "status": "probe", "note": "Only if the plant is in Spain; region to be chosen.", "cite": ["unverified"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "risks_flags": [
    {"id": "start-works", "kind": "deal_breaker", "severity": "high", "title": "Starting plant works or ordering equipment before applying can void grant eligibility", "fix": "Sign or start nothing until the lead application is filed; confirm the rule per scheme.", "cite": ["unverified"]},
    {"id": "novel-food", "kind": "flag", "severity": "medium", "title": "Market authorisation for fermentation-derived proteins in the EU", "fix": "Handed to Regina for assessment.", "cite": ["unverified"]}
  ]
}
```

Sources
- [c1], [c5]: CDTI regulatory bases (Orden CNU/161/2025), corpus document, sha256 476ab4f36248
- [c10]: Horizon Europe General Annexes 2026-2027, corpus document, sha256 ea3180318de7
- Register record: CDTI R&D projects page, https://www.cdti.es/ayudas/proyectos-de-i-d

## Turn 2: the founder (answer, if_asked)

> About 8 million. Two possible sites, one near Lisbon and one in the Alentejo. Nothing signed yet.
> 
> Seed of 3 million last year. Series A of about 15 million in a year or so, no lead yet.

## Turn 2: Wincent

That changes the map. The plant is in Portugal, so the plant money is Portuguese and EU money. Spain is a sales market, and we work it later. Spanish plant aid drops out.

**The site is your biggest money decision.** Under the EU-approved regional aid map, the Alentejo allows up to 30% aid for a large company, and Alto Alentejo allows 40% [w1]. Small companies can get up to 20 points more [w1]. Around Lisbon, only 12 parishes on the Setúbal side are covered at all, at 15% [w1].

Portugal's investment incentive for innovative SMEs shows what that means in money [w2]:
- Its 2026 call capped a small company in Alto Alentejo at 60% and in other low-density areas at 50%. Elsewhere the cap was 30% [w2].
- Projects over €3M in the Alentejo draw on a €100M national budget. The whole Lisbon regional budget was €5M [w2].
- On your €8M, the Alentejo is worth roughly €4–4.8M in grant-equivalent terms, against at most about €2.4M near Lisbon. That assumes you count as a small company and the next call keeps these rates (judgement).

**Timing:**
- That call closed on 30 September 2026 [w2]. We need to know when the next one opens (unverified).
- Spending before you apply is not eligible [w2]. Keep the "nothing signed" position.
- The call asked you to show 25% own funding [w2]. That ties the plant to your Series A.

**Two questions:**
1. Is the company incorporated in Portugal? How many staff does it have, and what is its turnover? This decides whether you count as small or medium, which is worth 10 points of aid [w1].
2. Which municipality is the Lisbon site in?

```mandate-board
{
  "title": "Fermented dairy proteins: pilot plant in Portugal, market entry in Spain",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "Who funds a pilot plant, EU and Spain",
      "explains": "The plant is in Portugal, so Spain's plant aid falls away; Spain becomes a sales market.",
      "nodes": [
        {"id": "ec", "label": "European Commission", "kind": "institution", "cite": ["judgement"]},
        {"id": "he", "label": "Horizon Europe", "kind": "programme", "parent": "ec", "cite": ["judgement"]},
        {"id": "cbe", "label": "Circular Bio-based Europe Joint Undertaking", "kind": "programme", "parent": "he", "status": "probe", "note": "Scale-up grants; needs a consortium of 3 entities in 3 countries.", "cite": ["c10", "unverified"]},
        {"id": "es-min", "label": "Spain: science and innovation ministry", "kind": "ministry", "cite": ["judgement"]},
        {"id": "cdti", "label": "CDTI, national innovation agency", "kind": "institution", "parent": "es-min", "cite": ["c1"]},
        {"id": "cdti-idi", "label": "CDTI R&D projects", "kind": "instrument", "parent": "cdti", "status": "park", "note": "Plant is not in Spain; revisit only for Spanish R&D or market entry.", "cite": ["judgement"]},
        {"id": "es-reg", "label": "Spanish regional development agencies", "kind": "regional_body", "parent": "es-min", "status": "park", "note": "No Spanish site planned.", "cite": ["judgement"]}
      ],
      "cite": ["judgement"]
    },
    {
      "id": "pt-field",
      "title": "Portugal: where the plant money sits",
      "explains": "One incentive, three budgets: which one pays depends on the site and the project size.",
      "nodes": [
        {"id": "pt-map", "label": "EU regional aid map for Portugal 2022-2027", "kind": "institution", "note": "Sets the ceiling per site.", "cite": ["w1"]},
        {"id": "pt-sice", "label": "Innovative productive investment incentive (SMEs)", "kind": "instrument", "parent": "pt-map", "note": "Last call closed 30 Sep 2026; next call to confirm.", "cite": ["w2", "unverified"]},
        {"id": "pt-compete", "label": "COMPETE 2030 national budget", "kind": "programme", "parent": "pt-sice", "status": "probe", "note": "Projects over EUR 3M in Norte, Centro, Alentejo; EUR 100M in the 2026 call.", "cite": ["w2"]},
        {"id": "pt-alentejo", "label": "Alentejo site", "kind": "regional_body", "parent": "pt-compete", "status": "probe", "note": "Small-company cap 50%, 60% in Alto Alentejo (2026 call).", "cite": ["w1", "w2"]},
        {"id": "pt-prlisboa", "label": "Lisbon regional programme", "kind": "programme", "parent": "pt-sice", "status": "probe", "note": "EUR 5M for the whole region in the 2026 call; most of the metro area is off the aid map.", "cite": ["w1", "w2"]},
        {"id": "pt-lisbon", "label": "Lisbon-area site", "kind": "regional_body", "parent": "pt-prlisboa", "status": "probe", "note": "Only 12 parishes on the Setubal side are covered, at 15% for a large company.", "cite": ["w1"]}
      ],
      "cite": ["w1", "w2"]
    }
  ],
  "risks_flags": [
    {"id": "start-works", "kind": "deal_breaker", "severity": "high", "title": "Spending incurred before the application is not eligible", "fix": "Sign no equipment order, lease or works contract before filing; preparatory studies and licences are allowed.", "cite": ["w2"]},
    {"id": "site", "kind": "flag", "severity": "high", "title": "Site choice moves the grant from about EUR 2.4M to about EUR 4-4.8M on an EUR 8M plant", "fix": "Decide the site with the aid map in hand; confirm the next call's rates.", "cite": ["w1", "w2", "judgement"]},
    {"id": "own-funds", "kind": "flag", "severity": "medium", "title": "The 2026 call required 25% own funding", "fix": "Time the plant application with the Series A, or show bridge equity.", "cite": ["w2"]},
    {"id": "novel-food", "kind": "flag", "severity": "medium", "title": "Market authorisation for fermentation-derived proteins in the EU", "fix": "Handed to Regina for assessment.", "cite": ["unverified"]}
  ]
}
```

Sources
- [c1], [c5]: CDTI regulatory bases (Orden CNU/161/2025), corpus document, sha256 476ab4f36248
- [c10]: Horizon Europe General Annexes 2026-2027, corpus document, sha256 ea3180318de7
- [w1] European Commission decision SA.100752, Portugal regional aid map 2022-2027, https://ec.europa.eu/competition/state_aid/cases1/202207/SA_100752_C080DE7E-0100-C741-BB56-54ACA26942BF_37_1.pdf, retrieved 2026-11-17. "intensidade máxima de auxílio para as grandes empresas de 30 % nas regiões «a»"; Alto Alentejo "seja aumentada em 10 pontos percentuais para 40 %"; the Lisbon parishes "podem beneficiar de uma intensidade máxima de auxílio de 15 %"; SMEs "até 20 pontos percentuais para as pequenas empresas". Later amendments exist (SA.106697, SA.109212) and still need checking.
- [w2] LGG Advisors summary of call MPr-2026-06, SICE Inovação Produtiva, https://lggadvisors.com/wp-content/uploads/2026/07/Ficha-Resumo_IP_MPR-2026-6_LGG_WEB.pdf, retrieved 2026-11-17. "Não são elegíveis investimentos incorridos antes da data da candidatura"; "Encerramento: 30/09/2026"; "mínimo de 25% de capitais próprios"; "PR Lisboa 5.000.000 €". This is an adviser's summary, not the official notice; I will confirm on portugal2030.pt.

## Turn 3: the founder (answer, if_asked)

> Lda in Lisbon, since 2023, 14 people, no revenue yet.

## Turn 3: Wincent

With 14 people and no revenue, you count as a small company. That assumes no investor or group holds 25% or more of you, which would pull its figures into yours (judgement). Your Lisbon base is no obstacle to an Alentejo plant. The call places a project where the investment is made [w2].

**What you did not ask but must know: your company's age is about to matter.** Under EU state-aid rules, an SME under 3 years old is exempt from the "company in difficulty" test [w3]. You were founded in 2023, so that protection ends sometime in 2026. After that, you are in difficulty if accumulated losses wipe out more than half your subscribed capital, share premium included [w3]. The plant incentive excluded companies in difficulty [w2]. For example, if your €3M seed went in as capital and premium, about €1.5M of losses would cross the line. A 14-person team since 2023 may well be past it (judgement).

This sets the order:
- Close the Series A before the plant application.
- The new equity clears the difficulty test.
- It also covers the 25% own funding the incentive asks for [w2].
- If at least 50% of the private share is your own equity, it may earn 5 extra points [w2].

**At EU level:** the bio-based partnership funded Adamo Foods, a UK alternative-protein startup, with about €3.07M for protein scale-up inside a consortium (register record, cordis.europa.eu/project/id/101292039). It is a working precedent for your profile, but it needs partners in three countries [c10].

**Two figures from your last balance sheet:**
1. Subscribed capital plus share premium, and accumulated losses.
2. Does any single investor hold 25% or more?

```mandate-board
{
  "title": "Fermented dairy proteins: pilot plant in Portugal, market entry in Spain",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "pt-field",
      "title": "Portugal: where the plant money sits",
      "explains": "One incentive, three budgets: which one pays depends on the site and the project size. A Lisbon company can build in the Alentejo.",
      "nodes": [
        {"id": "pt-map", "label": "EU regional aid map for Portugal 2022-2027", "kind": "institution", "note": "Sets the ceiling per site.", "cite": ["w1"]},
        {"id": "pt-sice", "label": "Innovative productive investment incentive (SMEs)", "kind": "instrument", "parent": "pt-map", "note": "SMEs only; excludes companies in difficulty; last call closed 30 Sep 2026.", "cite": ["w2"]},
        {"id": "pt-compete", "label": "COMPETE 2030 national budget", "kind": "programme", "parent": "pt-sice", "status": "probe", "note": "Projects over EUR 3M in Norte, Centro, Alentejo; EUR 100M in the 2026 call.", "cite": ["w2"]},
        {"id": "pt-alentejo", "label": "Alentejo site", "kind": "regional_body", "parent": "pt-compete", "status": "probe", "note": "Small-company cap 50%, 60% in Alto Alentejo (2026 call). Location is where the investment sits, not the head office.", "cite": ["w1", "w2"]},
        {"id": "pt-prlisboa", "label": "Lisbon regional programme", "kind": "programme", "parent": "pt-sice", "status": "probe", "note": "EUR 5M for the whole region in the 2026 call.", "cite": ["w2"]},
        {"id": "pt-lisbon", "label": "Lisbon-area site", "kind": "regional_body", "parent": "pt-prlisboa", "status": "probe", "note": "Only 12 Setubal-side parishes on the aid map, at 15% for a large company.", "cite": ["w1"]}
      ],
      "cite": ["w1", "w2"]
    }
  ],
  "risks_flags": [
    {"id": "difficulty", "kind": "deal_breaker", "severity": "high", "title": "Company-in-difficulty test applies once the company is 3 years old", "fix": "Check losses against capital plus share premium; close the Series A before the plant application.", "cite": ["w3", "w2"]},
    {"id": "sme-linked", "kind": "flag", "severity": "medium", "title": "Small-company status depends on no investor or group holding 25% or more", "fix": "Check the cap table; a linked holder's figures are added to yours.", "cite": ["judgement"]},
    {"id": "start-works", "kind": "deal_breaker", "severity": "high", "title": "Spending incurred before the application is not eligible", "fix": "Sign no equipment order, lease or works contract before filing.", "cite": ["w2"]},
    {"id": "own-funds", "kind": "flag", "severity": "medium", "title": "The 2026 call required 25% own funding", "fix": "The Series A covers it; sequence the raise first.", "cite": ["w2"]},
    {"id": "novel-food", "kind": "flag", "severity": "medium", "title": "Market authorisation for fermentation-derived proteins in the EU", "fix": "Handed to Regina for assessment.", "cite": ["unverified"]}
  ]
}
```

Sources
- [c10]: Horizon Europe General Annexes 2026-2027, corpus document, sha256 ea3180318de7
- [w1] European Commission decision SA.100752, https://ec.europa.eu/competition/state_aid/cases1/202207/SA_100752_C080DE7E-0100-C741-BB56-54ACA26942BF_37_1.pdf, retrieved 2026-11-17 (quotes as in my previous message)
- [w2] LGG Advisors summary of call MPr-2026-06, https://lggadvisors.com/wp-content/uploads/2026/07/Ficha-Resumo_IP_MPR-2026-6_LGG_WEB.pdf, retrieved 2026-11-17. "não ser empresa em dificuldade"; "A localização da operação corresponde à região onde se localiza o estabelecimento do beneficiário no qual será realizado o investimento"; "Capitalização PME (componente privada ≥ 50% capitais próprios) 5". This is an adviser's summary; I will confirm it on portugal2030.pt.
- [w3] Regulation (EU) 651/2014, consolidated text, Article 2(18)(a), https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014R0651-20230701, retrieved 2026-11-17. "other than an SME that has been in existence for less than 3 years"; "where more than half of its subscribed share capital has disappeared as a result of accumulated losses"; "'share capital' includes, where relevant, any share premium."
- Register record: CORDIS project 101292039, https://cordis.europa.eu/project/id/101292039

## Turn 4: the founder (narrow, script)

> OK, that's the picture. So which two or three things should we actually go for?

## Turn 4: Wincent

I recommend three, in this order:

**1. Lead: the plant incentive, with the plant in the Alentejo.** This is your biggest and cheapest money. It is a grant against plant capex, capped at 50–60% for a small company there [w1][w2]. On €8M, that is a ceiling of about €4–4.8M (judgement).

The move this quarter is to file an aid-request registration. It lets you commit to equipment or works before the next call without losing eligibility, but only for the first call that follows [w4]. It also binds you to the project and timeline you register [w4].

**2. In parallel: the EIC Accelerator.** It offers a grant of up to €2.5M plus equity of up to €10M (unverified; confirm on the EIC's own site). Its real value is that you have no Series A lead. A public equity commitment can anchor the round (judgement). The grant pays for the scale-up work, and the Portuguese incentive pays for the steel, so the two do not sit on the same cost. The odds are low, around 7% by aggregator figures (unverified). I found no EIC deal for your profile in our records, so treat it as a first-of-its-kind ask.

**3. Probe: Portuguese public co-investment in the Series A.** It is a short, low-effort question to the state's venture arm (unverified; I will confirm what is open).

**Parked:**
- The EU consortium route, unless you have an industrial dairy partner.
- All Spanish public money. I would push back on spending any effort on Spain yet: you cannot sell there before authorisation, which is with Regina.

**Decision for you:** are you willing to commit to the Alentejo site? Everything in route 1 follows from that.

```mandate-board
{
  "title": "Fermented dairy proteins: pilot plant in Portugal, market entry in Spain",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Lead: Portugal's productive-investment incentive for an Alentejo plant, after the Series A closes.",
      "Parallel: EIC Accelerator grant plus equity, to fund scale-up and anchor the round.",
      "Probe: Portuguese public co-investment in the Series A.",
      "Park: EU consortium route and all Spanish public money until authorisation."
    ],
    "confidence": "medium",
    "confidence_why": "Rates and rules are from the 2026 call; the next call's dates and the difficulty test are still open.",
    "open_question": "Will you commit to the Alentejo site?",
    "cite": ["w1", "w2", "w4", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eic", "name": "EIC Accelerator", "institution": "European Innovation Council", "status": "probe", "why": "Single-company grant plus equity; fits scale-up and a Series A with no lead.", "conditions": ["Short proposal, full proposal at a cut-off, interview"], "cite": ["unverified"]},
        {"id": "cbe", "name": "Circular Bio-based Europe grants", "institution": "CBE Joint Undertaking", "status": "park", "why": "Needs a 3-country consortium; reopen with an industrial dairy partner.", "cite": ["c10"]}
      ]},
      {"id": "pt", "level": "national", "label": "Portugal", "country": "PT", "doors": [
        {"id": "pt-sice-door", "name": "Innovative productive investment incentive (COMPETE 2030)", "institution": "COMPETE 2030", "status": "open", "why": "SMEs; projects over EUR 3M in the Alentejo draw on the national budget; caps 50-60% for a small company.", "conditions": ["Not a company in difficulty", "25% own funding", "No spending before application or aid registration"], "cite": ["w2", "w4"]},
        {"id": "pt-coinv", "name": "Public co-investment in the Series A", "institution": "Portugal's public venture arm", "status": "probe", "why": "Low-effort question; what is open now is unconfirmed.", "cite": ["unverified"]}
      ]},
      {"id": "pt-reg", "level": "regional", "label": "Portugal: site", "country": "PT", "doors": [
        {"id": "pt-alentejo-door", "name": "Alentejo site", "institution": "Regional aid map", "status": "open", "why": "Assisted region; 30% large-company base, plus 20 points for small.", "cite": ["w1"]},
        {"id": "pt-lisbon-door", "name": "Lisbon-area site", "institution": "Regional aid map", "status": "park", "why": "Mostly off the aid map; EUR 5M regional budget in 2026.", "cite": ["w1", "w2"]}
      ]},
      {"id": "es", "level": "national", "label": "Spain", "country": "ES", "doors": [
        {"id": "es-cdti", "name": "CDTI R&D projects", "institution": "CDTI", "status": "park", "why": "No Spanish entity or plant.", "cite": ["judgement"]},
        {"id": "es-entry", "name": "Market-entry support for Spain", "institution": "To identify", "status": "park", "why": "Premature before market authorisation.", "cite": ["judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 8000000, "label": "Pilot plant"},
    "instruments": [
      {"id": "series-a", "name": "Series A", "type": "equity", "amount": 15000000, "terms": "Carries everything, including opex and own share; dearest money (dilution)", "status": "planned", "cite": ["judgement"]},
      {"id": "pt-grant", "name": "Productive-investment incentive", "type": "grant", "amount": 4000000, "amount_max": 4800000, "terms": "Carries plant capex; cheapest money, but only after the raise and before any commitment", "status": "planned", "cite": ["w1", "w2", "judgement"]},
      {"id": "eic-grant", "name": "EIC Accelerator grant", "type": "grant", "amount_max": 2500000, "terms": "Carries scale-up work, not the plant; not on the same cost as the Portuguese grant", "status": "probe", "cite": ["unverified"]},
      {"id": "eic-equity", "name": "EIC equity in the round", "type": "public_coinvest", "terms": "Part of the Series A; anchors a lead", "status": "probe", "cite": ["unverified"]}
    ]
  },
  "risks_flags": [
    {"id": "difficulty", "kind": "deal_breaker", "severity": "high", "title": "Company-in-difficulty test applies once the company is 3 years old", "fix": "Check losses against capital plus share premium; close the Series A before the plant application.", "cite": ["w3", "w2"]},
    {"id": "registration-lock", "kind": "flag", "severity": "medium", "title": "Aid registration binds you to the registered project and timeline, and covers only the next call", "fix": "Register once the site and plant design are firm.", "cite": ["w4"]},
    {"id": "novel-food", "kind": "flag", "severity": "high", "title": "Market authorisation gates any sales in Spain", "fix": "Handed to Regina.", "cite": ["unverified"]}
  ]
}
```

Sources
- [c10]: Horizon Europe General Annexes 2026-2027, corpus document, sha256 ea3180318de7
- [w1] SA.100752 regional aid map, https://ec.europa.eu/competition/state_aid/cases1/202207/SA_100752_C080DE7E-0100-C741-BB56-54ACA26942BF_37_1.pdf, retrieved 2026-11-17
- [w2] LGG Advisors summary of MPr-2026-06, https://lggadvisors.com/wp-content/uploads/2026/07/Ficha-Resumo_IP_MPR-2026-6_LGG_WEB.pdf, retrieved 2026-11-17
- [w3] Regulation (EU) 651/2014, Article 2(18), https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014R0651-20230701, retrieved 2026-11-17
- [w4] Turismo de Portugal, aid-request registration notice for SICE Inovação Produtiva, Outros Territórios, https://business.turismodeportugal.pt/pt/Investir/Financiamento/avisos-concursos/Paginas/aviso-registo-pedido-auxilio-sice-inovacao-produtiva-outros-territorios.aspx, retrieved 2026-11-17. "só é válido para candidatura ao primeiro aviso". The page dates from August 2025; I need to confirm the current registration window and whether it covers low-density Alentejo sites.

## Turn 5: the founder (regulatory, script)

> Our investors keep asking about the novel-food approval. Does that affect the money?

## Turn 5: Wincent

Yes, in three ways. It decides when the money pays back, not whether you can apply.

**1. The grants.** I have not seen authorisation as a condition for applying to the plant incentive or the EIC (unverified; I will check the call texts). But the plant incentive backs investment in goods you can sell and export [w2], over a 24-month project [w2]. Evaluators will read your sales plan against the authorisation date. Incentive contracts usually carry result targets, so a slipped authorisation can cost part of the grant later (unverified).

**2. The pilot plant feeds the authorisation.** The dossier includes data on the variability and stability of production batches [c23]. That is the case to make to every funder: the plant produces the product and also the evidence that opens the EU market (judgement). It turns the investors' worry into your best argument.

**3. Confidentiality.** When the EU food-safety authority is asked for an opinion, it publishes the application and supporting information. Confidential treatment has to be requested, with justification, when you submit [c18]. Your process data is the asset investors are paying for, so this matters to the round (judgement).

Spain changes nothing here. One EU authorisation covers Portugal and Spain alike (judgement), which is one more reason not to fund Spanish entry before it.

I am handing the regulatory side (route, timeline, confidentiality strategy) to Regina.

**The question that decides sequencing:** have you filed the dossier? If yes, when? If not, when do you plan to file? If it is filed, the plant is on time. If not, an €8M plant ahead of filing may be early, and a smaller step could come first.

```mandate-board
{
  "title": "Fermented dairy proteins: pilot plant in Portugal, market entry in Spain",
  "stage": "prioritise",
  "risks_flags": [
    {"id": "novel-food", "kind": "flag", "severity": "high", "title": "EU novel-food authorisation sets when sales, and grant result targets, can be met", "fix": "Regina assesses route and timeline; frame the plant as the source of batch data for the dossier.", "cite": ["c23", "unverified"]},
    {"id": "confidentiality", "kind": "flag", "severity": "medium", "title": "Dossier is published unless confidentiality is requested at submission", "fix": "Request confidential treatment with justification when filing; Regina to advise.", "cite": ["c18"]},
    {"id": "result-targets", "kind": "flag", "severity": "medium", "title": "Plant incentive is a 24-month project judged on sellable output", "fix": "Align the plant timeline with the expected authorisation date before applying.", "cite": ["w2", "unverified"]}
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-novel-food", "label": "Novel-food dossier filing and opinion: sets the plant and sales timeline", "start": 3, "milestone": true, "owner": "client", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  }
}
```

Sources
- [c18]: Regulation (EU) 2015/2283 Article 23 as reproduced in Commission staff working document SWD(2023)855, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52023SC0855, sha256 631e85d38ac1
- [c23]: same document, confidentiality of production-batch data, sha256 631e85d38ac1
- [w2] LGG Advisors summary of MPr-2026-06, https://lggadvisors.com/wp-content/uploads/2026/07/Ficha-Resumo_IP_MPR-2026-6_LGG_WEB.pdf, retrieved 2026-11-17. "bens e serviços transacionáveis e internacionalizáveis"; "Duração das operações: 24 meses"

## Turn 6: the founder (answer, client_agent)

> No, not filed yet. We don't have a date. Honestly I'd guess sometime next year, and part of the reason is we want batch data from the pilot plant first. I'll check with our regulatory person.

## Turn 6: Wincent

That changes the plan. If the main job of the plant is to make batches for the dossier, it is an R&D pilot first and a production plant second. The money follows that distinction.

**Why it matters:**
- EU state-aid rules count piloting, demonstrating and validation as experimental development [w5].
- The productive-investment incentive backs output you can sell [w2]. In that incentive's 24-month window, you could not legally sell anything yet [w2] (judgement).
- So I would split the plant into two stages: a pilot that generates the dossier data now, and a scale-up when authorisation is in sight.

**What that does to the three routes:**
- **The EIC Accelerator moves to the lead.** Pre-commercial scale-up with a regulatory milestone is what it is built for (judgement).
- **It also has a Portuguese safety net.** Portugal has funded R&D by Portuguese SMEs that won an EIC "Seal of Excellence" without EU money [w7]. That call covered seals up to the first 2025 cut-off [w7]. Whether it is renewed is unverified.
- **Portugal's pilot-line R&D call** fits your plant's purpose exactly [w6]. But its whole budget is €12.5M, it caps Lisbon at 40% [w6], and it closes on 29 December 2026 [w6]. That is too soon for you; I would aim for the next round.
- **The productive-investment incentive moves to the second stage**, still in the Alentejo, timed to authorisation.

**The question for your regulatory person:** what batch scale does the dossier need, and could a contract manufacturer make it sooner? If yes, you file in 2027, and the plant becomes a production plant you can fund later. If not, the plant is your path to market and should be funded as R&D now.

```mandate-board
{
  "title": "Fermented dairy proteins: pilot plant in Portugal, market entry in Spain",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Fund the plant in two stages: an R&D pilot that generates the dossier batches, then production scale-up timed to authorisation.",
      "Lead: EIC Accelerator for the pilot stage, with Portugal's Seal of Excellence support as fallback.",
      "Next: Portugal's pilot-line R&D call in its next round.",
      "Later: the productive-investment incentive for the Alentejo scale-up, after the Series A."
    ],
    "confidence": "medium",
    "confidence_why": "Depends on what batch scale the dossier needs and whether a contract manufacturer could supply it.",
    "open_question": "Can a contract manufacturer make the dossier batches, or is the pilot plant needed?",
    "cite": ["w5", "w6", "w7", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eic", "name": "EIC Accelerator", "institution": "European Innovation Council", "status": "probe", "why": "Now the lead: pre-commercial scale-up plus equity for a round with no lead.", "cite": ["unverified", "judgement"]}
      ]},
      {"id": "pt", "level": "national", "label": "Portugal", "country": "PT", "doors": [
        {"id": "pt-seal", "name": "Support for EIC Seal of Excellence projects", "institution": "Portugal 2030, ANI as intermediate body", "status": "probe", "why": "Funds Portuguese SMEs whose EIC proposal passed but was not funded; renewal to confirm.", "cite": ["w7", "unverified"]},
        {"id": "pt-demo", "name": "Pilot-line R&D demonstrator call", "institution": "COMPETE 2030 and regional programmes", "status": "probe", "why": "Fits a pilot plant; EUR 12.5M total budget, closes 29 Dec 2026, aim for the next round.", "conditions": ["Balanced financial position", "Public demonstration session", "Max 18 months"], "cite": ["w6"]},
        {"id": "pt-sice-door", "name": "Innovative productive investment incentive", "institution": "COMPETE 2030", "status": "park", "why": "Moves to the production stage, timed to authorisation.", "cite": ["w2", "judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 8000000, "label": "Pilot plant, to be split into pilot and scale-up stages"},
    "instruments": [
      {"id": "eic-grant", "name": "EIC Accelerator grant", "type": "grant", "amount_max": 2500000, "terms": "Carries the pilot stage and dossier batches; cheapest money for pre-revenue R&D", "status": "probe", "cite": ["unverified"]},
      {"id": "pt-demo-grant", "name": "Pilot-line R&D incentive", "type": "grant", "terms": "Carries staff, materials and equipment for the pilot; small budget", "status": "planned", "cite": ["w6"]},
      {"id": "pt-grant", "name": "Productive-investment incentive", "type": "grant", "terms": "Carries production capex once sales are in sight", "status": "parked", "cite": ["w2", "judgement"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-seal", "label": "Renewal of Portugal's Seal of Excellence call", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["w7", "unverified"]},
        {"id": "w-demo", "label": "Next pilot-line R&D call after 29 Dec 2026", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["w6", "unverified"]}
      ]}
    ]
  }
}
```

Sources
- [w2] LGG Advisors summary of MPr-2026-06, https://lggadvisors.com/wp-content/uploads/2026/07/Ficha-Resumo_IP_MPR-2026-6_LGG_WEB.pdf, retrieved 2026-11-17
- [w5] Regulation (EU) 651/2014, Article 2(86), https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014R0651-20230701, retrieved 2026-11-17. "Experimental development may comprise prototyping, demonstrating, piloting, testing and validation"
- [w6] LGG Advisors summary of MPr-2026-07, SIID Demonstradores, https://lggadvisors.com/wp-content/uploads/2026/08/FichaResumo_SIID_Demonstradores_MPr2026-07_Web.pdf, retrieved 2026-11-17. "Encerramento: 29/12/2026"; "Dotação global: 12,5M €"; "até à intensidade máxima de 80% (exceto NUTS II Lisboa, onde a taxa máxima é 40%)". This is an adviser's summary.
- [w7] Portugal 2030, notice MPr-2024-13, SIID Seal of Excellence, https://portugal2030.pt/wp-content/uploads/sites/3/2024/11/MPR-2024-13_SIID_Internacionalizacao-ID_Selo-de-Excelencia_Accelarator-e-Transition.pdf, retrieved 2026-11-17. "Projetos de I&D promovidos por empresas portuguesas que tenham obtido um Selo de Excelência ... EIC Accelerator"; "Primeira convocatória de 2025"

## Turn 7: the founder (answer, client_agent)

> Good question, and I don't know the required batch scale yet. I'll ask our regulatory person this week. We haven't seriously looked at contract manufacturers for this either, so I can't say yet whether that would be faster.

## Turn 7: Wincent

Fine. That fork can wait a week. A lot of work stays the same whichever way it goes.

**Safe in both branches: start the EIC Accelerator now.** It funds TRL 6–8 innovation with a grant of up to €2.5M, plus €1–10M of equity for scaling [w8]. A pilot that generates dossier data fits it, and so does a later scale-up (judgement).

Short proposals can be filed at any time [w8]. Full proposals are batched at cut-offs on 20 January, 17 March, 1 September and 4 November 2027 [w8]. Aim for 1 September. Your batch-scale answer will be in by then, and an EIC equity commitment would land just as you look for a Series A lead (judgement).

If you miss funding but pass the threshold, Portugal has funded Seal of Excellence holders through the national innovation agency [w7]. Whether that call is renewed is still unverified.

**Hold until the fork resolves:**
- Do not choose the site.
- Do not file the aid-request registration. It binds you to the project and timeline you register [w4].

**For your regulatory person, two questions:**
- What batch scale does the dossier need, and how many batches?
- Can a contract manufacturer produce them, and how soon?

Also still open: the balance-sheet figures for the difficulty test.

**Decision:** shall we start the EIC short proposal this month, aiming at the 1 September cut-off?

```mandate-board
{
  "title": "Fermented dairy proteins: pilot plant in Portugal, market entry in Spain",
  "stage": "prioritise",
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eic", "name": "EIC Accelerator", "institution": "European Innovation Council", "status": "open", "why": "SME in a Member State; grant for TRL 6-8 plus EUR 1-10M equity; holds in both branches.", "conditions": ["Short proposal any time", "Full proposal at a cut-off", "Jury interview"], "cite": ["w8"]}
      ]}
    ]
  },
  "process_maps": [
    {
      "id": "eic-process",
      "title": "How the EIC Accelerator decides",
      "explains": "Short proposal, full proposal at a cut-off, then a jury interview; a pass without funding can still earn Portuguese support.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "client-a", "name": "Your company", "side": "market"},
        {"id": "eic-eval", "name": "EIC expert evaluators", "side": "public-capital"},
        {"id": "eic-jury", "name": "EIC jury", "side": "public-capital"},
        {"id": "ani", "name": "Portugal's national innovation agency", "side": "public-capital"}
      ],
      "steps": [
        {"id": "short", "label": "Short proposal, evaluated remotely", "kind": "document", "actor": "eic-eval", "timing": "any time", "cite": ["w8"], "gates": [{"label": "SME established in a Member State", "cite": ["w8"]}, {"label": "Innovation at TRL 6-8", "cite": ["w8"]}]},
        {"id": "full", "label": "Full proposal at a cut-off", "kind": "deadline", "actor": "client-a", "timing": "target 1 Sep 2027", "cite": ["w8"], "gates": [{"label": "Short proposal passed", "cite": ["w8"]}, {"label": "Pilot scope fixed by the batch-scale answer", "cite": ["judgement"]}]},
        {"id": "jury", "label": "Interview with the EIC jury", "kind": "decision", "actor": "eic-jury", "cite": ["w8"], "gates": [{"label": "Invited after full-proposal evaluation", "cite": ["w8"]}]},
        {"id": "seal", "label": "Fallback: national support for Seal of Excellence holders", "kind": "step", "actor": "ani", "cite": ["w7"], "gates": [{"label": "Seal awarded; Portuguese SME", "cite": ["w7"]}, {"label": "A renewed national call", "cite": ["unverified"]}]}
      ],
      "flow": [{"from": "short", "to": "full"}, {"from": "full", "to": "jury"}, {"from": "jury", "to": "seal", "label": "passed, not funded"}],
      "leverage": [
        {"id": "eic-timing", "at": "full", "kind": "timing_window", "label": "1 Sep 2027 cut-off", "why": "Batch-scale answer is in, and an equity decision lands as the Series A seeks a lead.", "how": "Short proposal this month; full proposal from June.", "side": "public-capital", "cite": ["w8", "judgement"]},
        {"id": "eic-equity", "at": "jury", "kind": "door_opener", "label": "EIC equity as round anchor", "why": "A public commitment helps a round with no lead.", "how": "Tell Series A prospects the timeline once the short proposal passes.", "side": "market", "cite": ["judgement"]}
      ],
      "cite": ["w8", "w7"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "now", "label": "This month", "steps": [
        {"id": "reg-q", "label": "Regulatory lead: batch scale and count for the dossier", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "cmo-scan", "label": "Scan contract manufacturers: capacity and lead time", "start": 0, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "bal-check", "label": "Difficulty test: losses vs capital plus share premium", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["w3"]},
        {"id": "eic-short", "label": "EIC short proposal", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["w8"]}
      ]},
      {"id": "hold", "label": "Hold", "steps": [
        {"id": "site-hold", "label": "Do not choose the site or file the aid registration until the fork is resolved", "start": 0, "end": 1, "owner": "client", "status": "blocked", "cite": ["w4", "judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-eic-sep", "label": "EIC cut-off 1 Sep 2027", "start": "2027-09-01", "milestone": true, "owner": "client", "status": "planned", "cite": ["w8"]}
      ]}
    ]
  }
}
```

Sources
- [w3] Regulation (EU) 651/2014, Article 2(18), https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014R0651-20230701, retrieved 2026-11-17
- [w4] Turismo de Portugal, aid-request registration notice, https://business.turismodeportugal.pt/pt/Investir/Financiamento/avisos-concursos/Paginas/aviso-registo-pedido-auxilio-sice-inovacao-produtiva-outros-territorios.aspx, retrieved 2026-11-17
- [w7] Portugal 2030 notice MPr-2024-13, https://portugal2030.pt/wp-content/uploads/sites/3/2024/11/MPR-2024-13_SIID_Internacionalizacao-ID_Selo-de-Excelencia_Accelarator-e-Transition.pdf, retrieved 2026-11-17. "Organismo Intermédio – Agência Nacional de Inovação (ANI)"
- [w8] EIC Accelerator official page, https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en, retrieved 2026-11-17. "Grant component up to EUR 2.5M for innovation activities (TRL 6 to 8)"; "Investment component of EUR 1M up to EUR 10M"; "Short proposals, which may be submitted at any time"; cut-offs 20/01/2027, 17/03/2027, 01/09/2027, 04/11/2027.

## Turn 8: the founder (answer, client_agent)

> Still waiting on our regulatory person for the batch numbers and the contract manufacturer question, so I'll come back to you on those. And yes, let's start the EIC short proposal this month. The September timing works for us.

## Turn 8: Wincent

Agreed. The short proposal starts this month, aiming at the 1 September full-proposal cut-off.

**The precedent your investors will want.** In June 2026 the EIC Accelerator gave Vivici, a Dutch precision-fermentation dairy-protein company, a €2.5M grant and €10M of equity to scale production [w9]. Its EU dossier was still being submitted at the time [w9]. So the EIC has backed this exact activity before EU authorisation. That is your answer on whether novel food blocks the money.

Two differences to be honest about:
- Vivici was formed by Fonterra and DSM-Firmenich [w9].
- It already held US GRAS status for one protein [w9].

You need a different edge: your process, your proteins, or your cost.

**How to start:**
- Write the short proposal around one claim: the pilot produces the batches that take a new dairy protein through EU authorisation, then scales in Portugal (judgement).
- Speak the EU's language. The EIC has run a dedicated challenge for scaling alternative-protein production, precision fermentation included [w10]. Whether the 2027 work programme repeats it is unverified.
- It is evaluated remotely [w8]. I would expect a result in weeks, not months (unverified).

**What to expect:**
1. The short proposal passes or gets feedback.
2. Full proposal from June, once the batch-scale answer is in.
3. Jury interview after 1 September [w8].
4. If you pass without funding, the Portuguese Seal of Excellence fallback [w7].

**Who:** Portugal's national innovation agency runs the national side [w7]. Its EIC contact point is the first call for a pre-read (unverified).

Shall I draft that note to them?

```mandate-board
{
  "title": "Fermented dairy proteins: pilot plant in Portugal, market entry in Spain",
  "stage": "advise",
  "answer": {
    "lines": [
      "Lead: EIC Accelerator, short proposal now, full proposal at the 1 Sep 2027 cut-off.",
      "Precedent: the EIC backed a precision-fermentation dairy-protein startup with grant plus equity before EU authorisation.",
      "Fallback: Portugal's support for Seal of Excellence holders.",
      "Later: pilot-line R&D call, then the Alentejo productive incentive for scale-up after the Series A."
    ],
    "confidence": "medium",
    "confidence_why": "Route and precedent are clear; odds are low and the pilot scope awaits the batch-scale answer.",
    "open_question": "What batch scale does the dossier need, and can a contract manufacturer supply it?",
    "cite": ["w8", "w9", "w7", "judgement"]
  },
  "stakeholders": {
    "institutions": [
      {"id": "eic-body", "name": "European Innovation Council", "side": "public-capital", "country": "EU", "units": [
        {"id": "eic-pm", "name": "Programme management for the food and bio portfolio", "roles": [
          {"id": "eic-pm-role", "role": "EIC programme manager for the relevant portfolio", "priority": "P1", "reach": "Through EIC information events and the national contact point", "status": "to_approach", "cite": ["unverified"]}
        ]},
        {"id": "eic-fund", "name": "EIC Fund", "roles": [
          {"id": "eic-fund-role", "role": "Investment officer for the equity component", "priority": "P2", "reach": "After a positive jury decision", "status": "to_approach", "cite": ["w8", "judgement"]}
        ]}
      ]},
      {"id": "ani-body", "name": "Portugal's national innovation agency (ANI)", "side": "public-capital", "country": "PT", "units": [
        {"id": "ani-ncp", "name": "EIC national contact point", "roles": [
          {"id": "ani-ncp-role", "role": "National contact point for the EIC Accelerator", "priority": "P2", "reach": "Agency's public contact line; ask for a pre-read of the short proposal", "status": "to_approach", "cite": ["unverified"]},
          {"id": "ani-seal-role", "role": "Unit managing Seal of Excellence support", "priority": "P1", "reach": "Funds line on the national notice", "status": "to_approach", "cite": ["w7"]}
        ]}
      ]},
      {"id": "compete-body", "name": "COMPETE 2030 managing authority", "side": "public-capital", "country": "PT", "units": [
        {"id": "compete-inc", "name": "Business incentives", "roles": [
          {"id": "compete-head", "role": "Head of business incentives (scale-up stage)", "priority": "P1", "reach": "Later, once the fork is resolved", "status": "to_approach", "cite": ["unverified"]},
          {"id": "compete-analyst", "role": "Project analyst at the intermediate body", "priority": "P2", "reach": "Through the application portal", "status": "to_approach", "cite": ["unverified"]}
        ]}
      ]},
      {"id": "alentejo-body", "name": "Alentejo regional development commission", "side": "political", "country": "PT", "units": [
        {"id": "alentejo-pres", "name": "Presidency", "roles": [
          {"id": "alentejo-pres-role", "role": "President of the regional commission (site and regional programme)", "priority": "P1", "reach": "Later, when the site is chosen", "status": "to_approach", "cite": ["unverified"]}
        ]}
      ]}
    ]
  },
  "process_maps": [
    {
      "id": "eic-process",
      "title": "How the EIC Accelerator decides",
      "explains": "Short proposal, full proposal at a cut-off, then a jury interview; a pass without funding can still earn Portuguese support.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "client-a", "name": "Your company", "side": "market"},
        {"id": "eic-eval", "name": "EIC expert evaluators", "side": "public-capital"},
        {"id": "eic-jury", "name": "EIC jury", "side": "public-capital"},
        {"id": "ani", "name": "Portugal's national innovation agency", "side": "public-capital"}
      ],
      "steps": [
        {"id": "short", "label": "Short proposal, evaluated remotely", "kind": "document", "actor": "eic-eval", "timing": "file Dec 2026", "cite": ["w8"], "gates": [{"label": "SME established in a Member State", "cite": ["w8"]}, {"label": "Innovation at TRL 6-8", "cite": ["w8"]}]},
        {"id": "full", "label": "Full proposal at a cut-off", "kind": "deadline", "actor": "client-a", "timing": "1 Sep 2027", "cite": ["w8"], "gates": [{"label": "Short proposal passed", "cite": ["w8"]}, {"label": "Pilot scope fixed by the batch-scale answer", "cite": ["judgement"]}]},
        {"id": "jury", "label": "Interview with the EIC jury", "kind": "decision", "actor": "eic-jury", "cite": ["w8"], "gates": [{"label": "Invited after full-proposal evaluation", "cite": ["w8"]}]},
        {"id": "seal", "label": "Fallback: national support for Seal of Excellence holders", "kind": "step", "actor": "ani", "cite": ["w7"], "gates": [{"label": "Seal awarded; Portuguese SME", "cite": ["w7"]}, {"label": "A renewed national call", "cite": ["unverified"]}]}
      ],
      "flow": [{"from": "short", "to": "full"}, {"from": "full", "to": "jury"}, {"from": "jury", "to": "seal", "label": "passed, not funded"}],
      "leverage": [
        {"id": "eic-precedent", "at": "jury", "kind": "precedent", "label": "EIC grant plus equity to a precision-fermentation dairy-protein startup, June 2026", "why": "Same activity, funded before EU authorisation.", "how": "Cite it and say how you differ.", "side": "public-capital", "cite": ["w9"]},
        {"id": "eic-timing", "at": "full", "kind": "timing_window", "label": "1 Sep 2027 cut-off", "why": "Batch-scale answer is in; equity decision lands as the Series A seeks a lead.", "how": "Short proposal this month; full proposal from June.", "side": "public-capital", "cite": ["w8", "judgement"]},
        {"id": "eic-ncp", "at": "short", "kind": "door_opener", "label": "National contact point pre-read", "why": "Cheap feedback before the remote evaluation.", "how": "Founder writes to the agency's EIC contact point.", "side": "public-capital", "cite": ["unverified"]}
      ],
      "cite": ["w8", "w7", "w9"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "now", "label": "This month", "steps": [
        {"id": "eic-short", "label": "EIC short proposal", "start": 0.25, "end": 1.5, "owner": "client", "status": "active", "cite": ["w8"]},
        {"id": "ncp-note", "label": "Note to the national EIC contact point", "start": 0.25, "end": 0.5, "owner": "client", "status": "planned", "cite": ["unverified"]}
      ]},
      {"id": "quarter", "label": "This quarter and next", "steps": [
        {"id": "eic-full", "label": "Full proposal drafting", "start": 7, "end": 9.5, "owner": "client", "status": "planned", "depends_on": ["eic-short", "reg-q"], "cite": ["w8"]},
        {"id": "eic-cutoff", "label": "EIC full-proposal cut-off", "start": "2027-09-01", "milestone": true, "owner": "institution", "status": "planned", "cite": ["w8"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-eic-wp27", "label": "EIC 2027 work programme: any alternative-protein challenge", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["w10", "unverified"]}
      ]}
    ]
  }
}
```

Sources
- [w7] Portugal 2030 notice MPr-2024-13, https://portugal2030.pt/wp-content/uploads/sites/3/2024/11/MPR-2024-13_SIID_Internacionalizacao-ID_Selo-de-Excelencia_Accelarator-e-Transition.pdf, retrieved 2026-11-17
- [w8] EIC Accelerator official page, https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en, retrieved 2026-11-17. "Short proposals, which may be submitted at any time, will be evaluated remotely by EIC expert evaluators"
- [w9] AgFunderNews, 17 June 2026, https://agfundernews.com/vivici-bags-e12-5m-eic-funding-to-scale-precision-fermented-dairy-proteins, retrieved 2026-11-17. "combines €2.5 million in grant funding with €10 million in equity investment"; "Formed by Fonterra and DSM-Firmenich in December 2022"; the article says the EU dossier was still being submitted. This is press coverage; the EIC's own portfolio page would make it a primary source.
- [w10] Tech.eu, 15 December 2023, https://tech.eu/2023/12/15/eics-eur50m-challenge-scaling-up-alternative-protein-production-in-europe/, retrieved 2026-11-17. A €50M EIC challenge to scale up alternative-protein production, precision fermentation included.

## Turn 9: the founder (prioritise, script)

> Which two or three should we actually go for, and what will each cost us in time and effort?

## Turn 9: Wincent

The same three as before, with what each will cost you. All effort figures are my estimates (judgement).

**1. EIC Accelerator (now).**
- **Effort:** about 3–4 weeks of founder time for the short proposal. Then 6–8 weeks for the full proposal and interview preparation, from June.
- **Time:** cut-off on 1 September 2027 [w8]. Money would arrive in 2028 (unverified).
- **Return:** up to €2.5M of grant plus €1–10M of equity [w8].
- **Odds:** low, around 7% (unverified). But the closest precedent got the full package [w9], and the Seal of Excellence fallback costs almost nothing extra [w7].

**2. Pilot-line R&D call, next round (mid-2027).**
- **Effort:** about 4–6 weeks for a Portuguese application.
- **What it asks:** an 18-month project with a public demonstration session [w6].
- **Return:** the base rate for experimental development is 25%, with bonuses up to an 80% cap outside Lisbon [w6]. For example, on €2M of pilot costs at roughly 60%, that is about €1.2M. I assume the small-company and location bonuses apply.
- **Catch:** the budget is small (€12.5M for all of Portugal [w6]), and it requires a balanced financial position [w6]. Apply after the Series A.

**3. Productive-investment incentive for the Alentejo scale-up (2028).**
- **Effort:** the heaviest. Site, licences, an environmental "do no significant harm" assessment, a business plan and 25% own funding [w2].
- **Return:** the largest, roughly €4–4.8M on €8M.
- **Time:** a 24-month project [w2], timed to authorisation.

**Keeping them apart:** each grant carries a different cost. Do not let two grants claim the same euro (unverified; confirm the rule per call).

**Only route 1 needs your time this quarter.** Do you agree with that order?

```mandate-board
{
  "title": "Fermented dairy proteins: pilot plant in Portugal, market entry in Spain",
  "stage": "advise",
  "answer": {
    "lines": [
      "Now: EIC Accelerator, about 3-4 founder weeks to the short proposal, full proposal for 1 Sep 2027.",
      "Mid-2027: Portugal's pilot-line R&D call, after the Series A.",
      "2028: Alentejo productive incentive for scale-up, timed to authorisation.",
      "Only the EIC needs founder time this quarter."
    ],
    "confidence": "medium",
    "confidence_why": "Effort and odds are estimates; pilot scope awaits the batch-scale answer.",
    "open_question": "Do you agree with this order?",
    "cite": ["w8", "w6", "w2", "judgement"]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 8000000, "label": "Plant: pilot stage plus scale-up"},
    "instruments": [
      {"id": "eic-grant", "name": "EIC Accelerator grant", "type": "grant", "amount_max": 2500000, "terms": "Carries pilot-stage innovation work; cheapest money pre-revenue. Effort: ~3-4 weeks now, 6-8 weeks from June. Odds low.", "status": "in_progress", "cite": ["w8", "judgement"]},
      {"id": "eic-equity", "name": "EIC equity", "type": "public_coinvest", "amount": 1000000, "amount_max": 10000000, "terms": "Part of the Series A; dilutive but anchors a lead", "status": "probe", "cite": ["w8"]},
      {"id": "pt-demo-grant", "name": "Pilot-line R&D incentive", "type": "grant", "amount": 1200000, "terms": "Carries pilot staff, materials, equipment; illustrative on EUR 2M at ~60%. Effort ~4-6 weeks, mid-2027.", "status": "planned", "cite": ["w6", "judgement"]},
      {"id": "pt-grant", "name": "Productive-investment incentive", "type": "grant", "amount": 4000000, "amount_max": 4800000, "terms": "Carries scale-up capex; largest grant, heaviest file; 2028, after Series A", "status": "parked", "cite": ["w1", "w2", "judgement"]},
      {"id": "series-a", "name": "Series A", "type": "equity", "amount": 15000000, "terms": "Carries opex, own-funds share and clears the difficulty test; dearest money", "status": "planned", "cite": ["w3", "judgement"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "quarter", "label": "This quarter and next", "steps": [
        {"id": "eic-full", "label": "Full proposal drafting", "start": 7, "end": 9.5, "owner": "client", "status": "planned", "depends_on": ["eic-short", "reg-q"], "cite": ["w8"]},
        {"id": "eic-cutoff", "label": "EIC full-proposal cut-off", "start": "2027-09-01", "milestone": true, "owner": "institution", "status": "planned", "cite": ["w8"]}
      ]},
      {"id": "later", "label": "Later", "steps": [
        {"id": "series-a-close", "label": "Series A close", "start": 12, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "demo-app", "label": "Pilot-line R&D application, next round", "start": 8, "end": 10, "owner": "client", "status": "planned", "cite": ["w6", "unverified"]},
        {"id": "sice-app", "label": "Alentejo productive incentive: register aid request, then apply", "start": 14, "end": 18, "owner": "client", "status": "planned", "depends_on": ["series-a-close"], "cite": ["w2", "w4"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-sice-next", "label": "Next productive-investment call in the Portugal 2030 plan", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-map", "label": "Regional aid map ends 31 Dec 2027; check the next map's Alentejo rates", "start": "2027-12-31", "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"]}
      ]}
    ]
  }
}
```

Sources
- [w1] SA.100752, https://ec.europa.eu/competition/state_aid/cases1/202207/SA_100752_C080DE7E-0100-C741-BB56-54ACA26942BF_37_1.pdf, retrieved 2026-11-17. The map runs "1 de janeiro de 2022 — 31 de dezembro de 2027"
- [w2] LGG Advisors summary of MPr-2026-06, https://lggadvisors.com/wp-content/uploads/2026/07/Ficha-Resumo_IP_MPR-2026-6_LGG_WEB.pdf, retrieved 2026-11-17
- [w3] Regulation (EU) 651/2014, Article 2(18), https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014R0651-20230701, retrieved 2026-11-17
- [w4] Turismo de Portugal, aid-request registration, https://business.turismodeportugal.pt/pt/Investir/Financiamento/avisos-concursos/Paginas/aviso-registo-pedido-auxilio-sice-inovacao-produtiva-outros-territorios.aspx, retrieved 2026-11-17
- [w6] LGG Advisors summary of MPr-2026-07, https://lggadvisors.com/wp-content/uploads/2026/08/FichaResumo_SIID_Demonstradores_MPr2026-07_Web.pdf, retrieved 2026-11-17. "Atividades de Desenvolvimento Experimental: até 25%"; "Duração máxima de 18 meses"
- [w7] Portugal 2030 notice MPr-2024-13, https://portugal2030.pt/wp-content/uploads/sites/3/2024/11/MPR-2024-13_SIID_Internacionalizacao-ID_Selo-de-Excelencia_Accelarator-e-Transition.pdf, retrieved 2026-11-17
- [w8] EIC Accelerator, https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en, retrieved 2026-11-17
- [w9] AgFunderNews, https://agfundernews.com/vivici-bags-e12-5m-eic-funding-to-scale-precision-fermented-dairy-proteins, retrieved 2026-11-17

## Turn 10: the founder (expect, script)

> If we go that way, how do we start, and what should we expect along the way?

## Turn 10: Wincent

I'll take that as agreement on the order. Here is the start and the road.

**This week and this month:**
1. Your regulatory lead answers the two questions: batch scale and count, and whether a contract manufacturer could produce them. The pilot's scope depends on it.
2. Your finance lead checks the difficulty test: losses against capital plus share premium [w3].
3. Send the note below to the national innovation agency's EIC contact point (unverified function; confirm through the agency's switchboard).
4. Start the short proposal. It can be filed at any time [w8], so file when it is good, not in a hurry. December is realistic.

**What to expect:**
- **Short proposal:** evaluated remotely [w8]. I expect weeks, not months, and feedback if it fails, with a chance to resubmit (unverified).
- **From June:** the full proposal needs a fixed pilot scope, a budget split between grant and equity, and milestones that run to the dossier filing (judgement). It will be judged against the Vivici precedent [w9], so lead with how you differ.
- **After 1 September:** the jury interview [w8]. If selected, expect months of grant-agreement and equity due diligence before money arrives (unverified).
- **If you pass without funding:** Portugal's Seal of Excellence support [w7].
- **Alongside:** once the short proposal passes, tell your Series A prospects. A live EIC process helps a round with no lead (judgement).

**Draft to the national innovation agency's EIC contact point (in Portuguese, since it is a Portuguese agency):**

> Assunto: Pedido de reunião – candidatura ao EIC Accelerator, proteínas lácteas por fermentação de precisão
>
> Exmos. Senhores,
>
> Somos uma empresa de Lisboa, fundada em 2023, com 14 colaboradores, que produz proteínas lácteas por fermentação de precisão. Estamos a preparar uma candidatura ao EIC Accelerator para uma unidade piloto em Portugal, que permitirá produzir os lotes necessários à autorização europeia como novo alimento e, depois, escalar a produção no país.
>
> Gostaríamos de vos apresentar a proposta curta antes da submissão, e de conhecer a vossa leitura sobre o seu alinhamento com as prioridades nacionais de inovação alimentar e biotecnológica.
>
> Teriam disponibilidade para uma reunião de 30 minutos nas próximas semanas?
>
> Com os melhores cumprimentos,
> [Nome], CEO

In English, it asks for a 30-minute meeting to pre-read the short proposal and test its fit with national priorities.

Shall we also write up the full plan as a brief for your board?

```mandate-board
{
  "title": "Fermented dairy proteins: pilot plant in Portugal, market entry in Spain",
  "stage": "advise",
  "process_maps": [
    {
      "id": "eic-process",
      "title": "How the EIC Accelerator decides",
      "explains": "Short proposal, full proposal at a cut-off, jury interview, then agreement and due diligence; a pass without funding can still earn Portuguese support.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "client-a", "name": "Your company", "side": "market"},
        {"id": "eic-eval", "name": "EIC expert evaluators", "side": "public-capital"},
        {"id": "eic-jury", "name": "EIC jury", "side": "public-capital"},
        {"id": "eic-fund-a", "name": "EIC Fund", "side": "public-capital"},
        {"id": "ani", "name": "Portugal's national innovation agency", "side": "public-capital"}
      ],
      "steps": [
        {"id": "short", "label": "Short proposal, evaluated remotely", "kind": "document", "actor": "eic-eval", "timing": "file Dec 2026; result in weeks", "cite": ["w8", "unverified"], "gates": [{"label": "SME established in a Member State", "cite": ["w8"]}, {"label": "Innovation at TRL 6-8", "cite": ["w8"]}]},
        {"id": "full", "label": "Full proposal at a cut-off", "kind": "deadline", "actor": "client-a", "timing": "1 Sep 2027", "cite": ["w8"], "gates": [{"label": "Short proposal passed", "cite": ["w8"]}, {"label": "Pilot scope fixed by the batch-scale answer", "cite": ["judgement"]}, {"label": "Grant and equity split, milestones to dossier filing", "cite": ["judgement"]}]},
        {"id": "jury", "label": "Interview with the EIC jury", "kind": "decision", "actor": "eic-jury", "timing": "after the cut-off", "cite": ["w8"], "gates": [{"label": "Invited after full-proposal evaluation", "cite": ["w8"]}]},
        {"id": "dd", "label": "Grant agreement and equity due diligence", "kind": "step", "actor": "eic-fund-a", "timing": "months", "cite": ["unverified"], "gates": [{"label": "Positive jury decision", "cite": ["w8"]}]},
        {"id": "seal", "label": "Fallback: national support for Seal of Excellence holders", "kind": "step", "actor": "ani", "cite": ["w7"], "gates": [{"label": "Seal awarded; Portuguese SME", "cite": ["w7"]}, {"label": "A renewed national call", "cite": ["unverified"]}]}
      ],
      "flow": [{"from": "short", "to": "full"}, {"from": "full", "to": "jury"}, {"from": "jury", "to": "dd", "label": "selected"}, {"from": "jury", "to": "seal", "label": "passed, not funded"}],
      "leverage": [
        {"id": "eic-precedent", "at": "jury", "kind": "precedent", "label": "EIC grant plus equity to a precision-fermentation dairy-protein startup, June 2026", "why": "Same activity, funded before EU authorisation.", "how": "Cite it and lead with how you differ.", "side": "public-capital", "cite": ["w9"]},
        {"id": "eic-ncp", "at": "short", "kind": "door_opener", "label": "National contact point pre-read", "why": "Cheap feedback before the remote evaluation.", "how": "CEO sends the drafted note.", "side": "public-capital", "cite": ["unverified"]},
        {"id": "eic-round", "at": "short", "kind": "door_opener", "label": "Passed short proposal as a signal to Series A leads", "why": "A live EIC process helps a round with no lead.", "how": "Share with prospects after the pass.", "side": "market", "cite": ["judgement"]}
      ],
      "cite": ["w8", "w7", "w9"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "now", "label": "This month", "steps": [
        {"id": "reg-q", "label": "Regulatory lead: batch scale and count; contract manufacturer option", "start": 0, "end": 0.5, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "bal-check", "label": "Difficulty test: losses vs capital plus share premium", "start": 0, "end": 0.5, "owner": "client", "status": "active", "cite": ["w3"]},
        {"id": "ncp-note", "label": "Send note to the national EIC contact point", "start": 0.25, "end": 0.5, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "eic-short", "label": "EIC short proposal, file in December", "start": 0.25, "end": 1.5, "owner": "client", "status": "active", "cite": ["w8"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "eic-odds", "kind": "flag", "severity": "medium", "title": "EIC success rates are low", "fix": "Run the Seal of Excellence fallback and the Portuguese pilot-line call as backups.", "cite": ["unverified", "w7", "w6"]},
    {"id": "differentiation", "kind": "flag", "severity": "medium", "title": "A better-resourced precedent sets the bar", "fix": "Lead the proposal with your edge: process, proteins or cost.", "cite": ["w9", "judgement"]}
  ]
}
```

Sources
- [w3] Regulation (EU) 651/2014, Article 2(18), https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014R0651-20230701, retrieved 2026-11-17
- [w6] LGG Advisors summary of MPr-2026-07, https://lggadvisors.com/wp-content/uploads/2026/08/FichaResumo_SIID_Demonstradores_MPr2026-07_Web.pdf, retrieved 2026-11-17
- [w7] Portugal 2030 notice MPr-2024-13, https://portugal2030.pt/wp-content/uploads/sites/3/2024/11/MPR-2024-13_SIID_Internacionalizacao-ID_Selo-de-Excelencia_Accelarator-e-Transition.pdf, retrieved 2026-11-17
- [w8] EIC Accelerator, https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en, retrieved 2026-11-17
- [w9] AgFunderNews, https://agfundernews.com/vivici-bags-e12-5m-eic-funding-to-scale-precision-fermented-dairy-proteins, retrieved 2026-11-17

## Turn 11: the founder (brief, script)

> We are running out of time on our side. Can you write up what we have as a brief now?

## Turn 11: Wincent

# Brief: public money for a precision-fermentation pilot plant, and the road to Spain

**1. Answer**

Fund the plant in two stages, because its first job is to produce the batches for the EU novel-food dossier.

Lead with the EIC Accelerator. It fits a pilot stage before revenue, offers up to €2.5M of grant and €1–10M of equity [w8], and has already backed a precision-fermentation dairy-protein company before EU authorisation [w9]. Its equity can also anchor a Series A that has no lead yet (judgement).

Second, Portugal's pilot-line R&D call in its next round, after the Series A [w6]. Third, the Portuguese productive-investment incentive for the scale-up, in the Alentejo, timed to authorisation. It is the largest grant: roughly €4–4.8M on €8M [w1][w2] (judgement).

Spanish public money is parked. You cannot sell in Spain before EU authorisation (judgement), and the plant is in Portugal.

**2. Where you stand**

| Front | Today |
|---|---|
| EU: EIC Accelerator | Open to you as an SME established in a Member State [w8]. Short proposal starting this month; full proposal for 1 September 2027 [w8]. |
| EU: bio-based partnership | Parked. It needs a consortium of three entities in three countries [c10]. Reopen if an industrial dairy partner joins. |
| Portugal: pilot-line R&D call | Fits the pilot [w6]. The current round closes 29 December 2026 [w6], which is too early. Target the next round. |
| Portugal: productive-investment incentive | Open to SMEs [w2]. Caps in the 2026 call for a small company were 50% in low-density areas, 60% in Alto Alentejo and 30% elsewhere [w2]. Moved to the scale-up stage. |
| Portugal: site | The Alentejo is an assisted region at 30%, plus 20 points for a small company [w1]. Most of the Lisbon area is off the aid map; only 12 Setúbal-side parishes are covered, at 15% [w1]. |
| Portugal: Seal of Excellence support | Has funded Portuguese SMEs that won an EIC Seal of Excellence [w7]. Renewal unverified. |
| Portugal: public co-investment in the Series A | A probe; what is open now is unverified. |
| Spain | All Spanish public routes parked: no entity or plant there, and no sales before authorisation (judgement). |

**3. Flags**

- **High: the company-in-difficulty test.** It applies once an SME is 3 years old [w3]. You are in difficulty if losses have wiped out more than half of capital plus share premium [w3], and companies in difficulty are excluded from the plant incentive [w2]. Fix: check it now, and close the Series A before any Portuguese plant application.
- **High: no spending before applying.** Spending before the application is not eligible [w2]. An aid-request registration allows earlier commitments, but it binds the registered project and covers only the next call [w4]. Fix: sign nothing, and register only once the site and scope are firm.
- **Medium: own funding.** The 2026 call asked for 25% own funding [w2]. Fix: sequence the Series A first.
- **Medium: result targets.** The productive incentive judges sellable output over a 24-month project [w2]. Fix: use it for scale-up, not the pilot.
- **Medium: EIC odds are low** (unverified). Fix: keep the Seal of Excellence and pilot-line routes as backups.
- **Regulatory, handed to Regina:** the novel-food route and timeline. The confidentiality request must be made at submission [c18], and the dossier includes production-batch data [c23].

**4. Decisions**

- **Agreed:** EIC first, with the full proposal on 1 September 2027.
- **Open: the site.** I recommend the Alentejo for the scale-up stage (judgement). Decide once the batch-scale question is answered.
- **Open: contract manufacturer or own pilot for the dossier batches.** This depends on your regulatory lead's answer.

**5. Actions, and who**

- **EIC route.** P1 is the EIC programme manager for the food and bio portfolio (unverified). P2 is the EIC Fund investment officer, after selection (judgement). The national innovation agency is the intermediate body for Seal of Excellence support [w7]; its EIC contact point is the first call for a pre-read (unverified).
- **Portuguese grants.** P1 is the head of business incentives at the COMPETE 2030 managing authority (unverified). P2 is the project analyst at the intermediate body (unverified). On the political side, the president of the Alentejo regional development commission, once the site is chosen (unverified).
- **Draft:** the note to the national EIC contact point is in the annex.

**6. Plan**

- **This week:** your regulatory lead answers batch scale and count, and whether a contract manufacturer could make them. Your finance lead runs the difficulty test.
- **This month:** send the note to the contact point and start the short proposal. File in December.
- **This quarter:** short-proposal result, and Series A conversations using a passed short proposal as a signal (judgement).
- **June to September 2027:** full proposal, cut-off on 1 September [w8], then the jury interview [w8].
- **Later:** the pilot-line R&D call (next round), then the Series A close, then the aid-request registration and the Alentejo productive-incentive application.
- **Not yet:** choosing the site, filing the aid registration, signing equipment or works contracts, or spending on Spain.

**7. Watches**

- Next pilot-line R&D call, after 29 December 2026 [w6].
- Renewal of the Seal of Excellence support (unverified).
- EIC 2027 work programme: whether it runs an alternative-protein challenge again, as one ran before [w10].
- Next productive-investment call in the Portugal 2030 plan (unverified).
- The regional aid map ends on 31 December 2027 [w1]. Check the next map's Alentejo rates.
- Novel-food filing date (Regina).
- Bio-based partnership calls, if an industrial partner appears.

**8. Precedents**

- **EIC:** Vivici, a Dutch precision-fermentation dairy-protein company, received a €2.5M grant and €10M of equity in June 2026, with its EU dossier still pending [w9]. Wincent's own award records hold none.
- **Bio-based partnership:** Adamo Foods, a UK alternative-protein startup, received about €3.07M within a scale-up consortium (register record, cordis.europa.eu/project/id/101292039).
- **Portuguese pilot-line and productive incentives:** none found for this activity.

**9. Sources**

- [c1], [c5]: CDTI regulatory bases, Orden CNU/161/2025, corpus document, sha256 476ab4f36248
- [c10]: Horizon Europe General Annexes 2026-2027, corpus document, sha256 ea3180318de7
- [c18], [c23]: Regulation (EU) 2015/2283 Article 23, in SWD(2023)855, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52023SC0855, sha256 631e85d38ac1
- [w1] SA.100752, Portugal regional aid map, https://ec.europa.eu/competition/state_aid/cases1/202207/SA_100752_C080DE7E-0100-C741-BB56-54ACA26942BF_37_1.pdf, 2026-11-17. "intensidade máxima de auxílio para as grandes empresas de 30 % nas regiões «a»"; Lisbon parishes "intensidade máxima de auxílio de 15 %"; "até 20 pontos percentuais para as pequenas empresas"
- [w2] LGG Advisors summary of MPr-2026-06, https://lggadvisors.com/wp-content/uploads/2026/07/Ficha-Resumo_IP_MPR-2026-6_LGG_WEB.pdf, 2026-11-17. "Não são elegíveis investimentos incorridos antes da data da candidatura"; "mínimo de 25% de capitais próprios"; "não ser empresa em dificuldade". This is an adviser's summary.
- [w3] Regulation (EU) 651/2014, Article 2(18), https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014R0651-20230701, 2026-11-17. "other than an SME that has been in existence for less than 3 years"; "'share capital' includes, where relevant, any share premium"
- [w4] Turismo de Portugal, aid-request registration, https://business.turismodeportugal.pt/pt/Investir/Financiamento/avisos-concursos/Paginas/aviso-registo-pedido-auxilio-sice-inovacao-produtiva-outros-territorios.aspx, 2026-11-17. "só é válido para candidatura ao primeiro aviso"
- [w5] Regulation (EU) 651/2014, Article 2(86), same URL as [w3], 2026-11-17. "Experimental development may comprise prototyping, demonstrating, piloting, testing and validation"
- [w6] LGG Advisors summary of MPr-2026-07, https://lggadvisors.com/wp-content/uploads/2026/08/FichaResumo_SIID_Demonstradores_MPr2026-07_Web.pdf, 2026-11-17. "Encerramento: 29/12/2026"; "Dotação global: 12,5M €"; "intensidade máxima de 80% (exceto NUTS II Lisboa, onde a taxa máxima é 40%)". This is an adviser's summary.
- [w7] Portugal 2030 notice MPr-2024-13, https://portugal2030.pt/wp-content/uploads/sites/3/2024/11/MPR-2024-13_SIID_Internacionalizacao-ID_Selo-de-Excelencia_Accelarator-e-Transition.pdf, 2026-11-17. "Organismo Intermédio – Agência Nacional de Inovação (ANI)"
- [w8] EIC Accelerator, https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en, 2026-11-17. "Grant component up to EUR 2.5M"; "Investment component of EUR 1M up to EUR 10M"; "Short proposals, which may be submitted at any time"; cut-offs 20/01, 17/03, 01/09 and 04/11/2027
- [w9] AgFunderNews, 17 June 2026, https://agfundernews.com/vivici-bags-e12-5m-eic-funding-to-scale-precision-fermented-dairy-proteins, 2026-11-17. "combines €2.5 million in grant funding with €10 million in equity investment"
- [w10] Tech.eu, 15 December 2023, https://tech.eu/2023/12/15/eics-eur50m-challenge-scaling-up-alternative-protein-production-in-europe/, 2026-11-17

**10. Questions for you**

1. **What batch scale and count does the dossier need, and could a contract manufacturer make them sooner?** This decides whether the plant is an R&D pilot now or a production plant later.
2. **What are your capital plus share premium, and your accumulated losses?** This decides whether any Portuguese aid is open before the Series A.
3. **Does any investor hold 25% or more?** This decides your small-company status and is worth 10 points of aid [w1].
4. **What is your edge over the EIC precedent: process, proteins or cost?** It is the core of the proposal.

**Annex: agreed draft to the national innovation agency's EIC contact point**

> Assunto: Pedido de reunião – candidatura ao EIC Accelerator, proteínas lácteas por fermentação de precisão
>
> Exmos. Senhores,
>
> Somos uma empresa de Lisboa, fundada em 2023, com 14 colaboradores, que produz proteínas lácteas por fermentação de precisão. Estamos a preparar uma candidatura ao EIC Accelerator para uma unidade piloto em Portugal, que permitirá produzir os lotes necessários à autorização europeia como novo alimento e, depois, escalar a produção no país.
>
> Gostaríamos de vos apresentar a proposta curta antes da submissão, e de conhecer a vossa leitura sobre o seu alinhamento com as prioridades nacionais de inovação alimentar e biotecnológica.
>
> Teriam disponibilidade para uma reunião de 30 minutos nas próximas semanas?
>
> Com os melhores cumprimentos,
> [Nome], CEO

```mandate-board
{
  "title": "Fermented dairy proteins: pilot plant in Portugal, market entry in Spain",
  "stage": "write_up",
  "answer": {
    "lines": [
      "Fund the plant in two stages: an R&D pilot for the dossier batches, then scale-up timed to authorisation.",
      "Lead: EIC Accelerator, short proposal in December, full proposal for 1 Sep 2027.",
      "Second: Portugal's pilot-line R&D call, next round, after the Series A.",
      "Third: Alentejo productive incentive for scale-up, about EUR 4-4.8M on EUR 8M.",
      "Parked: Spanish public money and the EU consortium route."
    ],
    "confidence": "medium",
    "confidence_why": "Route and precedent are clear; EIC odds are low and the pilot scope awaits the batch-scale answer.",
    "open_question": "What batch scale does the dossier need, and can a contract manufacturer make it?",
    "cite": ["w8", "w9", "w6", "w1", "w2", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eic", "name": "EIC Accelerator", "institution": "European Innovation Council", "status": "open", "why": "SME in a Member State; grant for TRL 6-8 plus EUR 1-10M equity; precedent in this exact activity.", "conditions": ["Short proposal any time", "Full proposal at a cut-off", "Jury interview"], "cite": ["w8", "w9"]},
        {"id": "cbe", "name": "Circular Bio-based Europe grants", "institution": "CBE Joint Undertaking", "status": "park", "why": "Needs a 3-country consortium; reopen with an industrial dairy partner.", "cite": ["c10"]}
      ]},
      {"id": "pt", "level": "national", "label": "Portugal", "country": "PT", "doors": [
        {"id": "pt-seal", "name": "Support for EIC Seal of Excellence projects", "institution": "Portugal 2030, ANI as intermediate body", "status": "probe", "why": "Fallback if the EIC passes the proposal without funding; renewal to confirm.", "cite": ["w7", "unverified"]},
        {"id": "pt-demo", "name": "Pilot-line R&D demonstrator call", "institution": "COMPETE 2030 and regional programmes", "status": "probe", "why": "Fits the pilot; current round closes 29 Dec 2026, aim for the next.", "conditions": ["Balanced financial position", "Public demonstration session", "Max 18 months"], "cite": ["w6"]},
        {"id": "pt-sice-door", "name": "Innovative productive investment incentive", "institution": "COMPETE 2030", "status": "park", "why": "Largest grant; moved to the scale-up stage after the Series A.", "conditions": ["Not a company in difficulty", "25% own funding", "No spending before application or registration"], "cite": ["w2", "w4"]},
        {"id": "pt-coinv", "name": "Public co-investment in the Series A", "institution": "Portugal's public venture arm", "status": "probe", "why": "What is open now is unconfirmed.", "cite": ["unverified"]}
      ]},
      {"id": "pt-reg", "level": "regional", "label": "Portugal: site", "country": "PT", "doors": [
        {"id": "pt-alentejo-door", "name": "Alentejo site", "institution": "Regional aid map", "status": "open", "why": "Assisted region; 30% base plus 20 points for a small company; 40% base in Alto Alentejo.", "cite": ["w1"]},
        {"id": "pt-lisbon-door", "name": "Lisbon-area site", "institution": "Regional aid map", "status": "park", "why": "Mostly off the aid map; 12 Setubal-side parishes at 15%.", "cite": ["w1"]}
      ]},
      {"id": "es", "level": "national", "label": "Spain", "country": "ES", "doors": [
        {"id": "es-cdti", "name": "CDTI R&D projects", "institution": "CDTI", "status": "park", "why": "No Spanish entity or plant.", "cite": ["judgement"]},
        {"id": "es-entry", "name": "Market-entry support for Spain", "institution": "To identify", "status": "park", "why": "Premature before EU authorisation.", "cite": ["judgement"]}
      ]}
    ]
  },
  "hierarchies": [
    {
      "id": "pt-field",
      "title": "Portugal: where the plant money sits",
      "explains": "The aid map sets the ceiling per site; COMPETE 2030 and the regional programmes pay; the innovation agency handles Seal of Excellence support.",
      "nodes": [
        {"id": "pt-map", "label": "EU regional aid map for Portugal 2022-2027", "kind": "institution", "cite": ["w1"]},
        {"id": "pt-sice", "label": "Productive investment incentive (SMEs)", "kind": "instrument", "parent": "pt-map", "status": "park", "note": "Scale-up stage.", "cite": ["w2"]},
        {"id": "pt-compete", "label": "COMPETE 2030 national budget", "kind": "programme", "parent": "pt-sice", "note": "Projects over EUR 3M in Norte, Centro, Alentejo.", "cite": ["w2"]},
        {"id": "pt-alentejo", "label": "Alentejo site", "kind": "regional_body", "parent": "pt-compete", "status": "open", "cite": ["w1", "w2"]},
        {"id": "pt-prlisboa", "label": "Lisbon regional programme", "kind": "programme", "parent": "pt-sice", "status": "park", "note": "EUR 5M in the 2026 call.", "cite": ["w2"]},
        {"id": "pt-demo-node", "label": "Pilot-line R&D demonstrator call", "kind": "instrument", "status": "probe", "note": "EUR 12.5M total; next round.", "cite": ["w6"]},
        {"id": "pt-ani", "label": "National innovation agency (intermediate body)", "kind": "institution", "cite": ["w7"]},
        {"id": "pt-seal-node", "label": "Seal of Excellence support", "kind": "instrument", "parent": "pt-ani", "status": "probe", "cite": ["w7", "unverified"]}
      ],
      "cite": ["w1", "w2", "w6", "w7"]
    }
  ],
  "stakeholders": {
    "institutions": [
      {"id": "eic-body", "name": "European Innovation Council", "side": "public-capital", "country": "EU", "units": [
        {"id": "eic-pm", "name": "Programme management for the food and bio portfolio", "roles": [
          {"id": "eic-pm-role", "role": "EIC programme manager for the relevant portfolio", "priority": "P1", "reach": "EIC information events and the national contact point", "status": "to_approach", "cite": ["unverified"]}
        ]},
        {"id": "eic-fund", "name": "EIC Fund", "roles": [
          {"id": "eic-fund-role", "role": "Investment officer for the equity component", "priority": "P2", "reach": "After a positive jury decision", "status": "to_approach", "cite": ["w8", "judgement"]}
        ]}
      ]},
      {"id": "ani-body", "name": "Portugal's national innovation agency (ANI)", "side": "public-capital", "country": "PT", "units": [
        {"id": "ani-ncp", "name": "EIC national contact point", "roles": [
          {"id": "ani-ncp-role", "role": "National contact point for the EIC Accelerator", "priority": "P2", "reach": "Drafted note; agency switchboard", "status": "to_approach", "cite": ["unverified"]},
          {"id": "ani-seal-role", "role": "Unit managing Seal of Excellence support", "priority": "P1", "reach": "Funds line on the national notice", "status": "to_approach", "cite": ["w7"]}
        ]}
      ]},
      {"id": "compete-body", "name": "COMPETE 2030 managing authority", "side": "public-capital", "country": "PT", "units": [
        {"id": "compete-inc", "name": "Business incentives", "roles": [
          {"id": "compete-head", "role": "Head of business incentives", "priority": "P1", "reach": "Once the site and scope are firm", "status": "to_approach", "cite": ["unverified"]},
          {"id": "compete-analyst", "role": "Project analyst at the intermediate body", "priority": "P2", "reach": "Through the application portal", "status": "to_approach", "cite": ["unverified"]}
        ]}
      ]},
      {"id": "alentejo-body", "name": "Alentejo regional development commission", "side": "political", "country": "PT", "units": [
        {"id": "alentejo-pres", "name": "Presidency", "roles": [
          {"id": "alentejo-pres-role", "role": "President of the regional commission", "priority": "P1", "reach": "When the site is chosen", "status": "to_approach", "cite": ["unverified"]},
          {"id": "alentejo-mayor", "role": "Mayor of the chosen municipality", "priority": "P2", "reach": "Local introduction once the site is chosen", "status": "to_approach", "cite": ["judgement"]}
        ]}
      ]}
    ]
  },
  "process_maps": [
    {
      "id": "eic-process",
      "title": "How the EIC Accelerator decides",
      "explains": "Short proposal, full proposal at a cut-off, jury interview, then agreement and due diligence; a pass without funding can still earn Portuguese support.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "client-a", "name": "Your company", "side": "market"},
        {"id": "eic-eval", "name": "EIC expert evaluators", "side": "public-capital"},
        {"id": "eic-jury", "name": "EIC jury", "side": "public-capital"},
        {"id": "eic-fund-a", "name": "EIC Fund", "side": "public-capital"},
        {"id": "ani", "name": "Portugal's national innovation agency", "side": "public-capital"}
      ],
      "steps": [
        {"id": "short", "label": "Short proposal, evaluated remotely", "kind": "document", "actor": "eic-eval", "timing": "file Dec 2026; result in weeks", "cite": ["w8", "unverified"], "gates": [{"label": "SME established in a Member State", "cite": ["w8"]}, {"label": "Innovation at TRL 6-8", "cite": ["w8"]}]},
        {"id": "full", "label": "Full proposal at a cut-off", "kind": "deadline", "actor": "client-a", "timing": "1 Sep 2027", "cite": ["w8"], "gates": [{"label": "Short proposal passed", "cite": ["w8"]}, {"label": "Pilot scope fixed by the batch-scale answer", "cite": ["judgement"]}, {"label": "Grant and equity split, milestones to dossier filing", "cite": ["judgement"]}]},
        {"id": "jury", "label": "Interview with the EIC jury", "kind": "decision", "actor": "eic-jury", "timing": "after the cut-off", "cite": ["w8"], "gates": [{"label": "Invited after full-proposal evaluation", "cite": ["w8"]}]},
        {"id": "dd", "label": "Grant agreement and equity due diligence", "kind": "step", "actor": "eic-fund-a", "timing": "months", "cite": ["unverified"], "gates": [{"label": "Positive jury decision", "cite": ["w8"]}]},
        {"id": "seal", "label": "Fallback: national support for Seal of Excellence holders", "kind": "step", "actor": "ani", "cite": ["w7"], "gates": [{"label": "Seal awarded; Portuguese SME", "cite": ["w7"]}, {"label": "A renewed national call", "cite": ["unverified"]}]}
      ],
      "flow": [{"from": "short", "to": "full"}, {"from": "full", "to": "jury"}, {"from": "jury", "to": "dd", "label": "selected"}, {"from": "jury", "to": "seal", "label": "passed, not funded"}],
      "leverage": [
        {"id": "eic-precedent", "at": "jury", "kind": "precedent", "label": "EIC grant plus equity to a precision-fermentation dairy-protein startup, June 2026", "why": "Same activity, funded before EU authorisation.", "how": "Cite it and lead with how you differ.", "side": "public-capital", "cite": ["w9"]},
        {"id": "eic-ncp", "at": "short", "kind": "door_opener", "label": "National contact point pre-read", "why": "Cheap feedback before the remote evaluation.", "how": "CEO sends the drafted note.", "side": "public-capital", "cite": ["unverified"]},
        {"id": "eic-round", "at": "short", "kind": "door_opener", "label": "Passed short proposal as a signal to Series A leads", "why": "A live EIC process helps a round with no lead.", "how": "Share with prospects after the pass.", "side": "market", "cite": ["judgement"]},
        {"id": "eic-timing", "at": "full", "kind": "timing_window", "label": "1 Sep 2027 cut-off", "why": "Batch-scale answer is in; equity decision lands as the Series A seeks a lead.", "how": "Full proposal from June.", "side": "public-capital", "cite": ["w8", "judgement"]}
      ],
      "cite": ["w8", "w7", "w9"]
    }
  ],
  "networks": [
    {
      "id": "money-ties",
      "title": "Who connects to whom on the money",
      "explains": "The EIC and its fund carry the lead route; the Portuguese agency is the bridge to national fallback money; the Series A ties to the EIC equity.",
      "nodes": [
        {"id": "n-eic", "label": "European Innovation Council", "kind": "institution", "cite": ["w8"]},
        {"id": "n-eicfund", "label": "EIC Fund", "kind": "body", "cite": ["w8"]},
        {"id": "n-ani", "label": "National innovation agency", "kind": "institution", "cite": ["w7"]},
        {"id": "n-p2030", "label": "Portugal 2030 programmes", "kind": "body", "cite": ["w7"]},
        {"id": "n-seriesa", "label": "Series A investors", "kind": "body", "cite": ["judgement"]}
      ],
      "edges": [
        {"from": "n-eicfund", "to": "n-seriesa", "kind": "works_with", "label": "co-invests in the round", "cite": ["w8", "judgement"]},
        {"from": "n-eic", "to": "n-eicfund", "kind": "funds", "label": "investment component", "cite": ["w8"]},
        {"from": "n-ani", "to": "n-p2030", "kind": "works_with", "label": "intermediate body for Seal support", "cite": ["w7"]},
        {"from": "n-p2030", "to": "n-eic", "kind": "works_with", "label": "funds Seal of Excellence projects", "cite": ["w7"]}
      ],
      "cite": ["w7", "w8"]
    }
  ],
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 8000000, "label": "Plant: pilot stage plus scale-up"},
    "instruments": [
      {"id": "eic-grant", "name": "EIC Accelerator grant", "type": "grant", "amount_max": 2500000, "terms": "Carries pilot-stage innovation work; cheapest money pre-revenue; low odds", "status": "in_progress", "cite": ["w8"]},
      {"id": "eic-equity", "name": "EIC equity", "type": "public_coinvest", "amount": 1000000, "amount_max": 10000000, "terms": "Part of the Series A; dilutive but anchors a lead", "status": "probe", "cite": ["w8"]},
      {"id": "pt-demo-grant", "name": "Pilot-line R&D incentive", "type": "grant", "amount": 1200000, "terms": "Carries pilot staff, materials, equipment; illustrative on EUR 2M at about 60%", "status": "planned", "cite": ["w6", "judgement"]},
      {"id": "pt-grant", "name": "Productive-investment incentive", "type": "grant", "amount": 4000000, "amount_max": 4800000, "terms": "Carries scale-up capex; largest grant, heaviest file; after the Series A", "status": "parked", "cite": ["w1", "w2", "judgement"]},
      {"id": "series-a", "name": "Series A", "type": "equity", "amount": 15000000, "terms": "Carries opex and own-funds share, clears the difficulty test; dearest money", "status": "planned", "cite": ["w3", "judgement"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "now", "label": "This month", "steps": [
        {"id": "reg-q", "label": "Regulatory lead: batch scale and count; contract manufacturer option", "start": 0, "end": 0.5, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "bal-check", "label": "Difficulty test: losses vs capital plus share premium", "start": 0, "end": 0.5, "owner": "client", "status": "active", "cite": ["w3"]},
        {"id": "ncp-note", "label": "Send note to the national EIC contact point", "start": 0.25, "end": 0.5, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "eic-short", "label": "EIC short proposal, file in December", "start": 0.25, "end": 1.5, "owner": "client", "status": "active", "cite": ["w8"]}
      ]},
      {"id": "hold", "label": "Hold", "steps": [
        {"id": "site-hold", "label": "Do not choose the site, file the aid registration or sign equipment or works", "start": 0, "end": 6, "owner": "client", "status": "blocked", "cite": ["w2", "w4"]},
        {"id": "spain-hold", "label": "No spending on Spain before EU authorisation", "start": 0, "end": 12, "owner": "client", "status": "blocked", "cite": ["judgement"]}
      ]},
      {"id": "quarter", "label": "This quarter and next", "steps": [
        {"id": "eic-full", "label": "Full proposal drafting", "start": 7, "end": 9.5, "owner": "client", "status": "planned", "depends_on": ["eic-short", "reg-q"], "cite": ["w8"]},
        {"id": "eic-cutoff", "label": "EIC full-proposal cut-off", "start": "2027-09-01", "milestone": true, "owner": "institution", "status": "planned", "cite": ["w8"]}
      ]},
      {"id": "later", "label": "Later", "steps": [
        {"id": "demo-app", "label": "Pilot-line R&D application, next round", "start": 8, "end": 10, "owner": "client", "status": "planned", "cite": ["w6", "unverified"]},
        {"id": "series-a-close", "label": "Series A close", "start": 12, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "sice-app", "label": "Alentejo productive incentive: register aid request, then apply", "start": 14, "end": 18, "owner": "client", "status": "planned", "depends_on": ["series-a-close"], "cite": ["w2", "w4"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-demo", "label": "Next pilot-line R&D call after 29 Dec 2026", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["w6"]},
        {"id": "w-seal", "label": "Renewal of Seal of Excellence support", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["w7", "unverified"]},
        {"id": "w-eic-wp27", "label": "EIC 2027 work programme: any alternative-protein challenge", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["w10", "unverified"]},
        {"id": "w-sice-next", "label": "Next productive-investment call in the Portugal 2030 plan", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-map", "label": "Regional aid map ends; check next map's Alentejo rates", "start": "2027-12-31", "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"]},
        {"id": "w-novel-food", "label": "Novel-food dossier filing date (Regina)", "start": 3, "milestone": true, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "w-cbe", "label": "Bio-based partnership calls, if an industrial partner joins", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["c10", "judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "difficulty", "kind": "deal_breaker", "severity": "high", "title": "Company-in-difficulty test applies once the company is 3 years old", "fix": "Check losses against capital plus share premium; close the Series A before any Portuguese plant application.", "cite": ["w3", "w2"]},
    {"id": "start-works", "kind": "deal_breaker", "severity": "high", "title": "Spending before the application is not eligible", "fix": "Sign nothing; register the aid request only when site and scope are firm.", "cite": ["w2", "w4"]},
    {"id": "own-funds", "kind": "flag", "severity": "medium", "title": "25% own funding required in the 2026 call", "fix": "Sequence the Series A first.", "cite": ["w2"]},
    {"id": "result-targets", "kind": "flag", "severity": "medium", "title": "Productive incentive judges sellable output over 24 months", "fix": "Use it for scale-up, not the pilot.", "cite": ["w2", "judgement"]},
    {"id": "eic-odds", "kind": "flag", "severity": "medium", "title": "EIC success rates are low", "fix": "Keep Seal of Excellence and pilot-line routes as backups.", "cite": ["unverified", "w7", "w6"]},
    {"id": "differentiation", "kind": "flag", "severity": "medium", "title": "A better-resourced precedent sets the bar", "fix": "Lead with your edge: process, proteins or cost.", "cite": ["w9", "judgement"]},
    {"id": "novel-food", "kind": "flag", "severity": "high", "title": "EU novel-food authorisation gates sales, including Spain", "fix": "Handed to Regina; request confidentiality at submission.", "cite": ["c18", "c23", "unverified"]}
  ]
}
```
