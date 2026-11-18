# Simulated conversation: train_agritech_es_it

Case: `mandate/eval/scenarios/train_agritech_es_it.yaml`. Brain: Wincent. Playbooks at a72eba0cdc. 2026-11-18T07:54:12+00:00. 11 turns (script 8/8; stopped: wrapped_up; client agent called 3x).
Leave-one-out case library: 0 entries left out.

## Turn 1: the founder (opener, script)

> We make smart irrigation kit, 25 people in Valencia. We want to scale production and start in Italy. Is there public money for that?

## Turn 1: Wincent

Your question is really two cases: building more capacity in Spain, and entering Italy as a Spanish company. Each pulls in different public money. Three answers decide which doors are real.

1. **Where does the new capacity go, and what will the money pay for?** Is it a bigger plant in Valencia or a line in Italy? Is it machinery, premises or working capital, roughly how much, and by when? A Valencian expansion points to Valencian and Spanish industrial money (judgement). Italian regional money generally needs an Italian establishment (unverified, I will check it per region).
2. **How will you enter Italy: exporting through distributors, or an Italian company with staff?** If you export, Spain's internationalisation money leads. COFIDES and ICEX run a programme for Spanish SMEs setting up abroad (unverified, I will confirm the 2026 terms). With an Italian entity, Italy's own doors open. Five northern and central regions list agrifood as a priority in their innovation strategies [c3][c4][c5][c6][c7].
3. **Are you raising equity now or soon, and is there real R&D in the kit (sensors, software)?** A round, or R&D, opens co-investment loans and R&D money that plain capacity growth does not (judgement).

Already settled: at 25 people you very likely count as an SME, as long as no larger group owns you (judgement). That status matters in both countries [c2].

The one thing to know: Italian farms can get subsidised finance to buy new machinery and digital equipment [c1]. That helps you sell, but it is not your money.

**Safe whatever you answer:** don't sign equipment orders or start works before we have filed. Most investment aid needs the application in first (unverified). **Not yet:** don't set up an Italian company until we know what each structure opens.

Which comes first for you: the plant, or Italy?

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale and enter Italy",
  "stage": "qualify",
  "hierarchies": [
    {
      "id": "field",
      "title": "The field we are qualifying",
      "explains": "Two fronts: capacity in Spain (EU, national, Valencian) and entry into Italy (Spanish outbound support, or Italian money once you have an Italian establishment).",
      "nodes": [
        {"id": "es", "label": "Spain: scale production", "kind": "ministry", "cite": ["judgement"]},
        {"id": "es-nat", "label": "National promotional and innovation bodies", "kind": "institution", "parent": "es", "status": "probe", "note": "Which body applies depends on R&D and on a round (question 3).", "cite": ["judgement"]},
        {"id": "es-cv", "label": "Generalitat Valenciana: regional finance institute and industry agency", "kind": "regional_body", "parent": "es", "status": "probe", "note": "Fits if the capacity goes into Valencia; terms to confirm on official pages.", "cite": ["unverified"]},
        {"id": "es-out", "label": "Spanish outbound support (COFIDES with ICEX)", "kind": "institution", "parent": "es", "status": "probe", "note": "For a Spanish SME setting up abroad; 2026 terms to confirm.", "cite": ["unverified"]},
        {"id": "it", "label": "Italy: market entry", "kind": "ministry", "cite": ["judgement"]},
        {"id": "it-reg", "label": "Regions with an agrifood priority in their S3: Piemonte, Lombardia, Veneto, Emilia-Romagna, Toscana", "kind": "regional_body", "parent": "it", "status": "probe", "note": "Regional money normally needs a local establishment (to check).", "cite": ["c3", "c4", "c5", "c6", "c7"]},
        {"id": "it-sab", "label": "Nuova Sabatini (subsidised machinery finance for Italian SMEs)", "kind": "programme", "parent": "it", "status": "probe", "note": "Your customers' money, not yours; it helps sales.", "cite": ["c1"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "risks_flags": [
    {"id": "start-works", "kind": "deal_breaker", "severity": "high", "title": "Starting the investment before applying can void investment aid", "fix": "No equipment orders or works until the applications are filed.", "cite": ["unverified"]},
    {"id": "sme-check", "kind": "flag", "severity": "low", "title": "SME status depends on headcount, turnover, balance sheet and ownership links", "fix": "Confirm turnover, balance sheet and any group shareholder.", "cite": ["c2"]}
  ]
}
```

Sources:
- [c1] Italian Decree-Law 69/2013, art. 2 (Nuova Sabatini), normattiva.it, sha256 e4993c050802
- [c2] Same article, SME definition (Recommendation 2003/361/EC), sha256 e4993c050802
- [c3] Piemonte S3, regione.piemonte.it, sha256 deef31219ada
- [c4] Lombardia S3, regione.lombardia.it, sha256 4cc011a6c9e6
- [c5] Veneto S3, regione.veneto.it, sha256 cafa394bcbcd
- [c6] Emilia-Romagna S3, fesr.regione.emilia-romagna.it, sha256 19a5ef72941b
- [c7] Toscana S3, regione.toscana.it, sha256 949291ad3b90
- Leads I have not checked yet (searched 18 Nov 2026, not cited): [FIAB catalogue of financial instruments 2026](https://fiab.es/es/archivos/documentos/CATALOGO_INSTRUMENTOS_FINANCIEROS_2026.pdf), [Valencia Plaza on the regional finance institute's subsidised loans](https://valenciaplaza.com/valenciaplaza/empresas1/el-consejo-del-ivf-da-luz-verde-a-las-nuevas-lineas-de-prestamos-bonificados-para-empresas)

## Turn 2: the founder (answer, if_asked+client_agent)

> About 2.5 million is the line itself, the rest is working capital and the Italian launch.
> 
> Two pilots, Emilia-Romagna is the bigger one with 12 farms, Puglia has 3. No entity yet; we lean to a branch because it is quicker.
> 
> The plant comes first. The new line goes into our current plant in Valencia, about 2.5M of the 4M, and the rest is working capital and the Italian launch. Nothing is ordered yet, but the supplier wants a deposit within three months. On equity and R&D I'd need to check with my co-founder what actually counts.

## Turn 2: Wincent

I've finished the checks for this round. Here is what they show.

**The deposit date decides most of this.** Under EU state-aid rules, a firm order for equipment usually counts as starting the project. Aid applied for after that point can be lost (unverified: I will confirm the exact definition in the EU block exemption regulation). So every application for the line has to be filed before you pay the supplier's deposit.

**What fits the Valencia line (unverified, from third-party summaries; I will confirm on the official pages):**
- **Valencian finance institute's SME investment loan.** It is open until 31 December 2026, for fixed assets from €200k, up to €2M. It covers up to 80% of the investment. On a €2.5M line that is the full €2M, and the window closes in six weeks.
- **Valencian mutual guarantee society.** It can guarantee loans from that institute. That reduces the collateral your bank would otherwise ask for.
- **Valencian grant for industrial SME investment.** The 2026 window closed in March. If the 2027 call opens at the same time of year, it falls inside your three months.

**Italy:** Italy's national SME guarantee fund covers SMEs with a registered office or an operating site in Italy [c8]. A registered branch should qualify (judgement; to confirm). Emilia-Romagna also runs a productive-investment grant open only to firms located in the region (register record, not yet checked). The branch is a real opener. The question is when you need it, not whether.

Two questions:
1. **Can the supplier deposit move until after we file?** And when does the line need to be running?
2. **Which banks do you work with in Spain?** The regional loan and the guarantee reach you through them.

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale and enter Italy",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "The field, after the first checks",
      "explains": "The Valencian line is financed in Spain, mainly through the regional finance institute and your bank. Italy's national guarantee fund opens once you have a registered operating site there.",
      "nodes": [
        {"id": "es", "label": "Spain: scale production", "kind": "ministry", "cite": ["judgement"]},
        {"id": "es-cv", "label": "Generalitat Valenciana", "kind": "regional_body", "parent": "es", "cite": ["judgement"]},
        {"id": "ivf", "label": "Valencian finance institute: SME investment loan 2026", "kind": "instrument", "parent": "es-cv", "status": "open", "note": "Fixed assets, EUR 200k to 2M, up to 80% of the investment; window to 31 Dec 2026 (to confirm).", "cite": ["unverified"]},
        {"id": "afin", "label": "Valencian mutual guarantee society", "kind": "channel", "parent": "es-cv", "status": "probe", "note": "Can guarantee the regional loan or a bank loan; lowers collateral (to confirm).", "cite": ["unverified"]},
        {"id": "inpyme", "label": "Regional grant for industrial SME investment", "kind": "programme", "parent": "es-cv", "status": "probe", "note": "2026 window closed in March; 2027 call to watch, before the deposit.", "cite": ["unverified"]},
        {"id": "es-nat", "label": "National innovation and SME lenders", "kind": "institution", "parent": "es", "status": "probe", "note": "Depends on the R&D and equity answers.", "cite": ["judgement"]},
        {"id": "es-out", "label": "Spanish outbound support (COFIDES with ICEX)", "kind": "institution", "parent": "es", "status": "probe", "note": "For the Italian launch; 2026 terms to confirm.", "cite": ["unverified"]},
        {"id": "it", "label": "Italy: market entry", "kind": "ministry", "cite": ["judgement"]},
        {"id": "it-fdg", "label": "Italian national SME guarantee fund", "kind": "instrument", "parent": "it", "status": "probe", "note": "Needs a registered office or operating site in Italy; the branch is the unlock.", "cite": ["c8"]},
        {"id": "it-reg", "label": "Emilia-Romagna: agrifood is an S3 priority; regional productive-investment grant for firms in the region", "kind": "regional_body", "parent": "it", "status": "probe", "note": "Your 12-farm pilot is here.", "cite": ["c6"]},
        {"id": "it-sab", "label": "Nuova Sabatini (subsidised machinery finance for Italian SMEs)", "kind": "programme", "parent": "it", "status": "probe", "note": "Your Italian farm customers' money: speeds sales, not yours.", "cite": ["c1"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 4000000, "label": "Total need: line, working capital, Italian launch"},
    "instruments": [
      {"id": "line", "name": "Regional investment loan for the line", "type": "loan", "amount": 2000000, "terms": "Carries the machinery; subsidised, so cheaper than a plain bank loan (to confirm). Fixed assets only.", "status": "probe", "cite": ["unverified"]},
      {"id": "rest", "name": "Working capital and Italian launch", "type": "loan", "amount": 1500000, "terms": "Not yet matched; route depends on the bank and the branch.", "status": "planned", "cite": ["judgement"]}
    ]
  },
  "risks_flags": [
    {"id": "start-works", "kind": "deal_breaker", "severity": "high", "title": "Supplier deposit due within 3 months; a firm order likely counts as starting the project", "fix": "File every aid application first, or move the deposit date.", "cite": ["unverified"]},
    {"id": "ivf-window", "kind": "flag", "severity": "medium", "title": "The regional loan window reportedly closes 31 Dec 2026", "fix": "Confirm on the official page this week; prepare the file now or plan on the 2027 edition.", "cite": ["unverified"]},
    {"id": "sme-check", "kind": "flag", "severity": "low", "title": "SME status depends on headcount, turnover, balance sheet and ownership links", "fix": "Confirm turnover, balance sheet and any group shareholder.", "cite": ["c2"]}
  ]
}
```

Sources:
- [c1] Decree-Law 69/2013, art. 2 (Nuova Sabatini), normattiva.it, sha256 e4993c050802
- [c2] Same article, SME definition, sha256 e4993c050802
- [c6] Emilia-Romagna S3, fesr.regione.emilia-romagna.it, sha256 19a5ef72941b
- [c8] Italian SME guarantee fund, operating rules 2023 (beneficiaries with a registered office or operating site in Italy), sha256 10198c227b8c
- Leads, not yet confirmed on official pages (searched 18 Nov 2026): [aggregator summary of the 2026 regional SME investment loan](https://tecnociminnova.com/es/buscador-ayudas/comunidad-valenciana/comval-lineabonificadaivfpymeinversion2026), [consultancy note on the 2025 edition](https://leyton.com/es/insights/white-papers/prestamos-bonificados-ivf-pyme-inversion-comunidad-valenciana/), [press on the Valencian guarantee society's bank lines](https://alicanteplaza.es/alicanteplaza/empresas/banco-sabadell-y-afin-sgr-amplian-a-85-millones-la-linea-de-apoyo-a-pymes-y-autonomos-en-la-comunitat-valenciana), [2026 regional grant guide](https://sede.gva.es/descarregues/2026/02/137020-13.3_GUIA_SOLICITUD_INPYME_2026_cas.pdf)

## Turn 3: the founder (answer, if_asked)

> Nothing ordered yet. The supplier wants a deposit in about three months.
> 
> A Spanish national bank. We had one regional innovation grant in 2022, nothing else public.

## Turn 3: Wincent

Good: since nothing is ordered, every aid route is still open. Three months gives a workable order of steps, shown on the board:

- **December:** file the Valencian finance institute's investment loan before its reported 31 December close. It is first come, first served, so budget can run out (unverified; I could not reach the institute's own page and will confirm by phone or through your bank).
- **February:** if the 2027 regional investment grant opens on the 2026 dates (16 February), file on day one (unverified).
- **Only then pay the deposit.**

**Your national bank is a door in its own right.** The state lender's SME line is applied for directly at your bank. It covers investment and liquidity, up to 100% of the financing need [w1]. That makes it the natural home for part of the €1.5M working capital. The Valencian guarantee society works through bank-specific agreements, so the name of your bank matters (unverified).

**Your 2022 grant matters too.** It shows a regional agency has already backed you, and someone there knows your file (judgement). It may also count against aid ceilings when we stack a grant and a subsidised loan on the same line (unverified). I found no record of the regional finance institute backing a similar line, so we build that case on its merits.

Two questions:
1. **Which bank?** It tells me whether the regional guarantee comes ready-made.
2. **Which agency gave the 2022 grant, and under what heading** (for example "de minimis")? It decides how much aid room is left.

The R&D and equity answer can follow when your co-founder has checked.

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale and enter Italy",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "The field, after the second checks",
      "explains": "Your national bank is the channel for the state SME line and, depending on agreements, for the regional guarantee.",
      "nodes": [
        {"id": "es-nat", "label": "State lender: SME investment and liquidity line via your bank", "kind": "institution", "parent": "es", "status": "open", "note": "Applied for at your bank; up to 100% of the need.", "cite": ["w1"]},
        {"id": "afin", "label": "Valencian mutual guarantee society", "kind": "channel", "parent": "es-cv", "status": "probe", "note": "Works through bank-specific agreements; which bank decides.", "cite": ["unverified"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "process_maps": [
    {
      "id": "sequence",
      "title": "Filing before the deposit",
      "explains": "The order that keeps every aid route open for the Valencia line.",
      "kind": "funding_decision",
      "illustrative": true,
      "actors": [
        {"id": "client", "name": "You", "side": "market"},
        {"id": "ivf", "name": "Valencian finance institute", "side": "public-capital"},
        {"id": "gva", "name": "Regional industry department (grant)", "side": "public-capital"},
        {"id": "supplier", "name": "Line supplier", "side": "market"}
      ],
      "steps": [
        {"id": "s1", "label": "Confirm the loan's 2026 terms and budget left", "kind": "step", "actor": "client", "timing": "this week", "cite": ["unverified"], "gates": [{"label": "Official call text read, not the aggregator", "cite": ["judgement"]}]},
        {"id": "s2", "label": "File the regional investment loan", "kind": "document", "actor": "ivf", "timing": "December 2026", "cite": ["unverified"], "gates": [{"label": "Fixed assets, investment of at least EUR 200k", "cite": ["unverified"]}, {"label": "Filed before 31 Dec and before any order", "cite": ["unverified"]}]},
        {"id": "s3", "label": "File the 2027 regional investment grant on opening", "kind": "deadline", "actor": "gva", "timing": "February 2027 if it follows 2026", "cite": ["unverified"], "gates": [{"label": "Industrial SME investing in the region", "cite": ["unverified"]}, {"label": "Room left under aid ceilings after the 2022 grant", "cite": ["unverified"]}]},
        {"id": "s4", "label": "Pay the supplier deposit", "kind": "decision", "actor": "supplier", "timing": "after s2 and s3", "cite": ["judgement"], "gates": [{"label": "All applications filed first", "cite": ["unverified"]}]}
      ],
      "flow": [{"from": "s1", "to": "s2"}, {"from": "s2", "to": "s3"}, {"from": "s3", "to": "s4", "label": "only after filing"}],
      "leverage": [
        {"id": "deposit-window", "at": "s4", "kind": "timing_window", "label": "Deposit due in about three months", "why": "A firm order before filing can void the aid.", "how": "Agree the deposit date with the supplier after the filings.", "side": "market", "cite": ["unverified"]},
        {"id": "past-grant", "at": "gva", "kind": "door_opener", "label": "Your 2022 regional innovation grant", "why": "The regional side already knows your file.", "how": "Your finance lead calls the 2022 case officer's unit.", "side": "public-capital", "cite": ["judgement"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 4000000, "label": "Total need: line, working capital, Italian launch"},
    "instruments": [
      {"id": "line", "name": "Regional investment loan for the line", "type": "loan", "amount": 2000000, "terms": "Carries the machinery; subsidised, cheaper than a plain bank loan (to confirm).", "status": "probe", "cite": ["unverified"]},
      {"id": "ico", "name": "State lender's SME line through your bank", "type": "loan", "amount": 500000, "amount_max": 1500000, "terms": "Carries working capital or the line's remainder; your bank takes the decision.", "status": "probe", "cite": ["w1", "judgement"]}
    ]
  },
  "risks_flags": [
    {"id": "ivf-window", "kind": "flag", "severity": "high", "title": "The regional loan reportedly closes 31 Dec 2026 and is first come, first served", "fix": "Confirm budget and terms this week; file in December.", "cite": ["unverified"]},
    {"id": "cumulation", "kind": "flag", "severity": "medium", "title": "Grant plus subsidised loan on one line, plus the 2022 grant, may hit aid ceilings", "fix": "Check the 2022 grant's legal basis; confirm cumulation in both calls.", "cite": ["unverified"]}
  ]
}
```

Sources:
- [w1] State lender (ICO), SME and entrepreneurs line, https://www.ico.es/ico-empresas-y-emprendedores, retrieved 18 Nov 2026: "Proyectos de inversión, actividades empresariales y/o necesidades de liquidez o gastos"; "Hasta el 100% de las necesidades de financiación"; "En las entidades de crédito directamente."
- Precedents: none found in the award records for the Valencian finance institute.
- Leads, not yet confirmed (searched 18 Nov 2026): [aggregator on the 2026 regional loan](https://tecnociminnova.com/es/buscador-ayudas/comunidad-valenciana/comval-lineabonificadaivfpymeinversion2026), [consultancy note on the 2026 regional grant dates](https://www.pnoinnovation.com/es/insights/inpyme-2026-hasta-200-000-e-de-ayuda-para-inversiones-productivas-de-pymes-industriales-en-la-comunitat-valenciana/)

## Turn 4: the founder (answer, client_agent)

> It was a regional innovation grant in 2022. I don't remember the exact agency name or whether it was de minimis, so I'll dig out the resolution or ask our finance person. The bank is one of the big Spanish national banks.

## Turn 4: Wincent

That's enough to draw the full map of doors, which is on the board. I'm not recommending yet. Three things shape it.

**Your bank may already carry EU backing.** In June 2025 the European Investment Fund and Spain's economy ministry signed guarantee agreements with eleven lenders. They include BBVA, CaixaBank and Santander, for SMEs investing in innovation, sustainability and competitiveness [w2]. If your bank is one of them, part of the risk on your loan sits with the EU fund. That should mean better terms or less collateral (judgement). I did not find Sabadell in that group.

**Each cost has its natural money (judgement):**
- **The line:** subsidised regional loans, plus a grant if the 2027 call allows both. This is the cheapest money for fixed assets.
- **Working capital:** a bank line under the state lender's scheme [w1], backed by a guarantee.
- **The Italian launch:** Spanish outbound support or the bank (unverified).
- **Equity:** the dearest money, and you don't need it for the plant.

**Italy waits until the branch exists.** Italy's guarantee fund needs an operating site in Italy [c8]. Emilia-Romagna's money needs one in the region (register record). Puglia is parked for now.

The 2022 grant is fine to chase in parallel. It decides how much grant you can stack, not whether the loan works.

Two things from you:
1. **Is your bank BBVA, CaixaBank, Santander or another?** That changes how the guarantee works.
2. **Which way do you lean:** lock in the cheap loan for the line by December, or wait for a grant first?

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale and enter Italy",
  "stage": "options",
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eif-bank", "name": "EU-backed SME guarantee on your bank's loan", "institution": "European Investment Fund, through signatory banks", "via": "your house bank, if a signatory", "status": "probe", "why": "BBVA, CaixaBank, Santander and others signed in June 2025 for SME investment.", "conditions": ["Your bank is a signatory", "The loan finances innovation, sustainability or competitiveness"], "cite": ["w2"]},
        {"id": "eib-direct", "name": "Direct EIB loan", "institution": "European Investment Bank", "status": "shut", "why": "Far above your ticket size; reached through banks instead.", "cite": ["judgement"]},
        {"id": "eu-rd", "name": "EU innovation grants", "institution": "European Commission", "status": "park", "why": "Only if there is real R&D; awaiting your co-founder.", "cite": ["judgement"]}
      ]},
      {"id": "es-nat", "level": "national", "label": "Spain, national", "country": "ES", "doors": [
        {"id": "ico", "name": "State lender's SME line", "institution": "ICO, through your bank", "status": "open", "why": "Investment and liquidity, up to 100% of the need, applied for at your bank.", "cite": ["w1"]},
        {"id": "cdti", "name": "National innovation agency loans", "institution": "CDTI", "status": "park", "why": "Depends on whether the line carries innovation; awaiting the R&D answer.", "cite": ["unverified"]},
        {"id": "enisa", "name": "Participative loans", "institution": "ENISA", "status": "park", "why": "Matches equity; you are not raising now.", "cite": ["unverified"]},
        {"id": "cofides", "name": "Outbound investment support for SMEs", "institution": "COFIDES with ICEX", "status": "probe", "why": "Possible fit for the Italian launch; 2026 terms and branch eligibility to confirm.", "cite": ["unverified"]}
      ]},
      {"id": "es-cv", "level": "regional", "label": "Comunitat Valenciana", "country": "ES", "doors": [
        {"id": "ivf", "name": "SME investment loan 2026", "institution": "Valencian finance institute", "status": "open", "why": "Fixed assets, EUR 200k to 2M, up to 80%; reportedly closes 31 Dec 2026.", "cite": ["unverified"]},
        {"id": "inpyme", "name": "Industrial SME investment grant 2027", "institution": "Generalitat Valenciana", "status": "probe", "why": "2026 window was Feb to Mar; 2027 call not yet published.", "cite": ["unverified"]},
        {"id": "afin", "name": "Regional mutual guarantee", "institution": "Valencian mutual guarantee society", "via": "bank agreements", "status": "probe", "why": "Can guarantee the regional or bank loan.", "cite": ["unverified"]}
      ]},
      {"id": "it-nat", "level": "national", "label": "Italy, national", "country": "IT", "doors": [
        {"id": "fdg", "name": "SME guarantee fund", "institution": "Fondo di Garanzia PMI", "via": "an Italian lender", "status": "probe", "why": "Needs a registered office or operating site in Italy: the branch.", "cite": ["c8"]},
        {"id": "simest", "name": "Italian internationalisation finance", "institution": "SIMEST", "status": "park", "why": "Built for Italian companies going abroad; fit for a branch unconfirmed.", "cite": ["unverified"]}
      ]},
      {"id": "it-er", "level": "regional", "label": "Emilia-Romagna", "country": "IT", "doors": [
        {"id": "er-grant", "name": "Productive investment and R&D grant (STEP)", "institution": "Regione Emilia-Romagna", "status": "probe", "why": "Region-gated to Emilia-Romagna; agrifood is an S3 priority; needs a local site.", "cite": ["c6", "judgement"]}
      ]},
      {"id": "it-pu", "level": "regional", "label": "Puglia", "country": "IT", "doors": [
        {"id": "pu", "name": "Regional programmes", "institution": "Regione Puglia", "status": "park", "why": "Smaller pilot; not checked yet.", "cite": ["judgement"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Your customers", "doors": [
        {"id": "sabatini", "name": "Subsidised machinery finance for Italian SMEs", "institution": "Nuova Sabatini", "status": "probe", "why": "Italian farms' money; speeds sales, not yours.", "cite": ["c1"]}
      ]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "ivf-i", "name": "Valencian finance institute", "side": "public-capital", "country": "ES", "units": [{"id": "ivf-u", "name": "Business financing", "roles": [
        {"id": "ivf-p1", "role": "Director of business financing", "priority": "P1", "reach": "The institute's business line contact; or via the 2022 grant's regional unit", "status": "to_approach", "cite": ["judgement"]},
        {"id": "ivf-p2", "role": "Loan analyst for industrial SMEs", "priority": "P2", "reach": "Assigned on filing", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "gva", "name": "Generalitat Valenciana, industry department", "side": "political", "country": "ES", "units": [{"id": "gva-u", "name": "Directorate-general for industry", "roles": [
        {"id": "gva-p1", "role": "Director-general for industry", "priority": "P1", "reach": "Formal letter tying the line to the region's industrial agenda", "status": "to_approach", "cite": ["judgement"]},
        {"id": "gva-p2", "role": "Head of the SME investment aid service", "priority": "P2", "reach": "Through the 2022 grant's contact", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "bank", "name": "Your house bank", "side": "market", "country": "ES", "units": [{"id": "bank-u", "name": "Business banking, Valencia", "roles": [
        {"id": "bank-p1", "role": "Regional business banking director", "priority": "P1", "reach": "Your relationship manager escalates", "status": "to_approach", "cite": ["judgement"]},
        {"id": "bank-p2", "role": "Your relationship manager", "priority": "P2", "reach": "Direct", "status": "engaged", "cite": ["judgement"]}]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "Valencia line", "steps": [
        {"id": "confirm", "label": "Confirm regional loan terms and budget left", "start": 0, "end": 0.25, "owner": "us", "status": "active", "cite": ["unverified"]},
        {"id": "file-ivf", "label": "File regional investment loan", "start": 0.5, "end": 1.3, "owner": "client", "status": "planned", "depends_on": ["confirm"], "cite": ["unverified"]},
        {"id": "file-grant", "label": "File 2027 regional grant on opening", "start": 3, "end": 3.5, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "deposit", "label": "Pay supplier deposit (not before filings)", "start": 3.5, "milestone": true, "owner": "client", "status": "blocked", "depends_on": ["file-ivf", "file-grant"], "cite": ["unverified"]}
      ]},
      {"id": "italy", "label": "Italy", "steps": [
        {"id": "branch", "label": "Register the branch as an operating site (not yet: after the line is filed)", "start": 3, "end": 6, "owner": "client", "status": "blocked", "cite": ["c8", "judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-ivf", "label": "Regional loan: 2026 close, 2027 edition", "start": 1.4, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-grant", "label": "2027 regional investment grant call published", "start": 2.8, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-eif", "label": "Is your bank an EU-guarantee signatory, and is volume left?", "start": 0.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["w2"]},
        {"id": "w-er", "label": "Emilia-Romagna productive-investment calls", "start": 4, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 4000000, "label": "Total need: line, working capital, Italian launch"},
    "instruments": [
      {"id": "line", "name": "Regional investment loan for the line", "type": "loan", "amount": 2000000, "terms": "Carries the machinery; subsidised and fixed-asset only, the cheapest money for this cost.", "status": "probe", "cite": ["unverified"]},
      {"id": "grant", "name": "2027 regional investment grant", "type": "grant", "terms": "Would reduce the line's net cost; cumulation with the loan to confirm.", "status": "probe", "cite": ["unverified"]},
      {"id": "ico", "name": "Bank line under the state lender's scheme", "type": "loan", "amount": 500000, "amount_max": 1500000, "terms": "Carries working capital and the line's remainder; the bank decides.", "status": "probe", "cite": ["w1"]},
      {"id": "eif", "name": "EU guarantee on the bank loan", "type": "guarantee_debt", "terms": "No new cash; lowers collateral or rate because the EU fund takes part of the loss.", "status": "probe", "cite": ["w2"]},
      {"id": "launch", "name": "Italian launch financing", "type": "loan", "amount": 500000, "terms": "Not matched yet; outbound support or the bank.", "status": "planned", "cite": ["judgement"]}
    ]
  },
  "risks_flags": [
    {"id": "start-works", "kind": "deal_breaker", "severity": "high", "title": "A firm order before filing can void the aid", "fix": "Deposit only after the filings.", "cite": ["unverified"]},
    {"id": "ivf-window", "kind": "flag", "severity": "high", "title": "Regional loan reportedly closes 31 Dec 2026, first come first served", "fix": "Confirm this week; file in December.", "cite": ["unverified"]},
    {"id": "cumulation", "kind": "flag", "severity": "medium", "title": "Aid stacking: 2022 grant, regional loan and a 2027 grant on one project", "fix": "Find the 2022 resolution; confirm cumulation rules in both calls.", "cite": ["unverified"]},
    {"id": "branch-form", "kind": "flag", "severity": "medium", "title": "Branch versus Italian company: tax and liability", "fix": "Decide with your tax adviser before registering; branch fits the guarantee rule if registered as an operating site.", "cite": ["c8", "judgement"]}
  ]
}
```

Sources:
- [w1] ICO SME line, https://www.ico.es/ico-empresas-y-emprendedores, retrieved 18 Nov 2026: "Proyectos de inversión, actividades empresariales y/o necesidades de liquidez o gastos"; "En las entidades de crédito directamente."
- [w2] European Investment Fund, 12 Jun 2025, https://www.eif.org/InvestEU/news/2025/fei-movilizara-con-fondos-next-generation-eu2-500-millones-de-euros-de-nueva-financiacion-para-pymes-espanolas-que-quieran-invertir-en-innovacion-sostenibilidad-competitividad.htm, retrieved 18 Nov 2026: "Andbank (via Actyus Growth Finance), BBVA, CaixaBank, EBN Banco, ICF, Inveready, Kutxabank" ... "MicroBank, Santander, Tresmares and Unicaja (via Seneca Direct Lending)"; "SMEs and mid-caps wishing to invest in innovation".
- [c1] Nuova Sabatini, normattiva.it, sha256 e4993c050802 · [c6] Emilia-Romagna S3, sha256 19a5ef72941b · [c8] Italian SME guarantee fund operating rules, sha256 10198c227b8c

## Turn 5: the founder (options, script)

> OK, that is the picture. What are our options, broadly?

## Turn 5: Wincent

Broadly, there are three ways to pay for the Valencia line, plus a separate question about when Italy starts. Each is on the board with what goes into it.

**A. Loan-led, fast.** File the Valencian finance institute's investment loan in December, for up to €2M of the €2.5M line (unverified). Put working capital on a bank line under the state lender's scheme [w1]. If your bank holds the EU guarantee [w2] or the regional guarantee covers it, that bank line gets cheaper (judgement). Low effort, and it locks in the cheap money before the window closes. You give up the grant only if the two cannot be combined.

**B. Grant-led, wait.** Skip December and file the 2027 regional investment grant when it opens, then look for a loan. The line could end up cheaper. But the grant is competitive, its dates are not published, and it runs straight into your deposit (unverified). You would also lose a loan window you can reach today.

**C. Both, in sequence.** File the loan in December and the grant in February, and pay the deposit only after both. Working capital goes on the guaranteed bank line. This costs the most effort and gives the best price, but only if the two calls allow stacking (unverified). That is what your 2022 resolution helps answer.

**Italy, in every option:** sell from Spain to the pilots first, and register the branch once the line is filed. The branch opens Italy's guarantee fund [c8] and Emilia-Romagna's money (judgement).

Which way do you lean? And is your bank BBVA, CaixaBank, Santander or another? That decides how much the guarantee helps in A and C.

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale and enter Italy",
  "stage": "options",
  "hierarchies": [
    {
      "id": "options",
      "title": "Three ways to finance the line, one Italian sequence",
      "explains": "Each option combines doors already on the route map; Italy follows the same order in all three.",
      "nodes": [
        {"id": "opt-root", "label": "EUR 4M need: line 2.5M, working capital and Italian launch 1.5M", "kind": "programme", "cite": ["judgement"]},
        {"id": "opt-a", "label": "A. Loan-led, fast", "kind": "programme", "parent": "opt-root", "status": "open", "note": "Regional loan in December plus a guaranteed bank line; low effort.", "cite": ["unverified", "w1"]},
        {"id": "opt-a1", "label": "Regional investment loan, up to EUR 2M", "kind": "instrument", "parent": "opt-a", "status": "open", "cite": ["unverified"]},
        {"id": "opt-a2", "label": "Bank line under the state lender's scheme, EU or regional guarantee", "kind": "instrument", "parent": "opt-a", "status": "probe", "cite": ["w1", "w2"]},
        {"id": "opt-b", "label": "B. Grant-led, wait", "kind": "programme", "parent": "opt-root", "status": "park", "note": "Waits for the 2027 grant; competitive, dates unknown, clashes with the deposit.", "cite": ["unverified"]},
        {"id": "opt-c", "label": "C. Both, in sequence", "kind": "programme", "parent": "opt-root", "status": "probe", "note": "Loan in December, grant in February, deposit after; best price if stacking is allowed.", "cite": ["unverified"]},
        {"id": "opt-it", "label": "Italy, all options: sell to pilots from Spain, then register the branch", "kind": "programme", "parent": "opt-root", "status": "probe", "note": "Branch opens the Italian guarantee fund and regional money.", "cite": ["c8", "judgement"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "risks_flags": [
    {"id": "cumulation", "kind": "flag", "severity": "medium", "title": "Option C stands or falls on stacking the loan and grant", "fix": "Find the 2022 resolution; read the cumulation clause in both calls.", "cite": ["unverified"]}
  ]
}
```

Sources: [w1] ICO SME line, https://www.ico.es/ico-empresas-y-emprendedores (retrieved 18 Nov 2026) · [w2] EIF, 12 Jun 2025 signatory banks, eif.org (retrieved 18 Nov 2026) · [c8] Italian SME guarantee fund operating rules, sha256 10198c227b8c

## Turn 6: the founder (pushback, script)

> Honestly, Italy feels like a lot of paperwork. Can we not just do it all from Spain?

## Turn 6: Wincent

Yes. For the next six to nine months you can run all of it from Spain, and I would. The money that pays for the line and the launch is Spanish: the regional loan, your bank's line under the state lender's scheme [w1], and the state lender's export lines.

**One new door for the Spain-only path.** The state lender opened a growth line for exporters in February 2026. It finances machinery and capacity, plus the working capital tied to it. Up to 30% of the loan can be non-repayable, capped at €200k [w3]. You qualify only if:
- more than 5% of turnover comes from abroad,
- you are affected by tariff changes, directly or through your value chain,
- the company is at least four years old [w3].

One source says it closed in July (unverified), so I am checking.

**What Spain-only gives up:** Italy's guarantee fund [c8] and Emilia-Romagna's regional money (judgement). At pilot scale that is not much. So I'd park the branch, but with a trigger, not forever: register it when you hire your first person in Italy or keep stock there. At that point there are real Italian costs to finance (judgement).

**The thing you didn't ask:** someone has to install and service 15 farms. Regular work in Italy can create a taxable presence even without a branch (unverified, a question for your tax adviser). Product rules for selling irrigation hardware in Italy apply either way. I've handed that question to Regina.

Two numbers would settle the export line: your foreign-sales share, and the year you were founded.

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale and enter Italy",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Run 2026-27 from Spain: regional loan for the line in December, guaranteed bank line for working capital.",
      "Add the 2027 regional grant if stacking is allowed; deposit only after the filings.",
      "Test the state lender's exporters growth line: it could carry part of the line with a non-repayable slice.",
      "Italy: sell to the pilots from Spain; register a branch at the first Italian hire or local stock."
    ],
    "confidence": "medium",
    "confidence_why": "Spanish doors fit by type; the regional loan's 2026 budget, stacking and the export line's status are still to confirm.",
    "open_question": "Your foreign-sales share and year of incorporation; and which bank.",
    "cite": ["w1", "w3", "c8", "unverified"]
  },
  "routes": {
    "levels": [
      {"id": "es-nat", "level": "national", "label": "Spain, national", "country": "ES", "doors": [
        {"id": "ico-growth-exp", "name": "State lender's growth line for exporters", "institution": "ICO, online channel", "status": "probe", "why": "Machinery, capacity and linked working capital; up to 30% non-repayable, max EUR 200k.", "conditions": ["Foreign activity above 5% of turnover", "Affected by tariff changes, directly or via value chain", "At least four years old", "Still open: to confirm"], "cite": ["w3"]},
        {"id": "ico-exp", "name": "State lender's export pre-financing line", "institution": "ICO, through your bank", "status": "probe", "why": "Pre-finances export orders and invoices: fits the Italian launch from Spain.", "cite": ["unverified"]},
        {"id": "icex-next", "name": "Export starter programme", "institution": "ICEX", "status": "park", "why": "2026 call reportedly closed 30 Oct; watch the 2027 edition.", "cite": ["unverified"]}
      ]},
      {"id": "it-nat", "level": "national", "label": "Italy, national", "country": "IT", "doors": [
        {"id": "fdg", "name": "SME guarantee fund", "institution": "Fondo di Garanzia PMI", "status": "park", "why": "Needs an operating site in Italy; parked until the branch trigger.", "cite": ["c8"]}
      ]},
      {"id": "it-er", "level": "regional", "label": "Emilia-Romagna", "country": "IT", "doors": [
        {"id": "er-grant", "name": "Productive investment and R&D grant (STEP)", "institution": "Regione Emilia-Romagna", "status": "park", "why": "Needs a local site; parked until the branch trigger.", "cite": ["judgement"]}
      ]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "italy", "label": "Italy", "steps": [
        {"id": "pilots", "label": "Serve the 15 pilot farms from Spain", "start": 0, "end": 9, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "branch", "label": "Register branch as operating site: trigger is first Italian hire or local stock", "start": 6, "end": 9, "owner": "client", "status": "blocked", "cite": ["c8", "judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-icoexp", "label": "Exporters growth line: still open, funds left?", "start": 0.25, "milestone": true, "owner": "us", "status": "planned", "cite": ["w3"]},
        {"id": "w-icex", "label": "ICEX export starter programme 2027 call", "start": 10, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-branch", "label": "Branch trigger reached?", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 4000000, "label": "Total need: line, working capital, Italian launch"},
    "instruments": [
      {"id": "growth-exp", "name": "Exporters growth line, non-repayable slice", "type": "grant", "amount": 200000, "terms": "Up to 30% of the loan, max EUR 200k: the cheapest money on the line, if you qualify.", "status": "probe", "cite": ["w3"]},
      {"id": "launch", "name": "Export pre-financing through your bank", "type": "loan", "amount": 500000, "terms": "Carries the Italian launch from Spain: pilot kit, travel, first orders.", "status": "probe", "cite": ["unverified"]}
    ]
  },
  "risks_flags": [
    {"id": "pe-risk", "kind": "flag", "severity": "medium", "title": "Regular installation and service in Italy may create a taxable presence without a branch", "fix": "Ask your tax adviser before the pilots scale.", "cite": ["unverified"]},
    {"id": "regina-product", "kind": "flag", "severity": "medium", "title": "Product rules for irrigation hardware sold in Italy", "fix": "Handed to Regina for a risk read.", "cite": ["judgement"]}
  ]
}
```

Sources:
- [w3] La Moncloa press note, 9 Feb 2026, ICO growth line for exporters, https://www.lamoncloa.gob.es/serviciosdeprensa/notasprensa/economia-comercio-empresa/paginas/2026/090226-ico-crecimiento-exportadores.aspx, retrieved 18 Nov 2026: "que represente más del cinco por ciento de su cifra de negocios"; "afectadas directamente por los cambios en el entorno arancelario mundial"; "de forma 100% digital en el canal ICO online".
- [w1] ICO SME line, https://www.ico.es/ico-empresas-y-emprendedores (retrieved 18 Nov 2026) · [c8] Italian SME guarantee fund operating rules, sha256 10198c227b8c
- Leads (searched 18 Nov 2026, not confirmed): [report that the exporters line closed 1 July](https://finantresnoticias.com/negocios-y-autonomos/ultimos-dias-para-pedir-la-linea-ico-para-exportadores/), [ICEX export starter programme 2026 notice in the official gazette](https://www.boe.es/boe/dias/2026/10/10/pdfs/BOE-B-2026-33136.pdf)

## Turn 7: the founder (fact_change, script)

> Update - the Emilia-Romagna distributor wants to sign a three-year deal if we have local installers.

## Turn 7: Wincent

This brings the branch trigger forward, and it makes Italy worth the paperwork. A three-year contract with a distributor is also good news for the Valencia loans: it shows lenders revenue they can see coming (judgement).

**Who employs the installers decides the route:**
- **The distributor or local contractors.** Spain-only still works. You pay Italian invoices from Spain, financed by your bank or the export pre-financing line (unverified). There is no Italian money, and no Italian paperwork.
- **Your own people in Emilia-Romagna.** Then you need an Italian presence anyway, and it starts paying back. Italy's guarantee fund opens with an operating site [c8].

**This also changes branch versus company.** I checked Emilia-Romagna's productive-investment call. It is open only to stand-alone firms organised as capital companies [c25]. Whether a Spanish company's branch passes that test is unclear (judgement; to confirm call by call). An Italian srl would. So the branch is quicker, and the srl reaches more regional money. Two caveats on that call: its last round was in 2025, and it targets strategic technologies, which may not cover irrigation (judgement).

**Rough size (assumptions, give me your numbers):** three installers at about €45k each in employer cost, plus €80k for a van, tools and local stock. That comes to roughly €215k in the first year. A guaranteed Italian loan on that is useful, but it is not decisive.

**Not yet:** don't sign a deal that promises installers you can't yet staff, and don't buy Italian kit before the site is registered (judgement).

Who would the installers work for, and how many over the three years?

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale and enter Italy",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Valencia line: regional loan in December, guaranteed bank line, 2027 grant if stacking allowed; deposit after filings.",
      "The Emilia-Romagna distributor deal is the Italian trigger: who employs the installers decides the route.",
      "Own installers: register an Italian presence first; an srl reaches more regional money than a branch.",
      "Contracted installers: stay Spain-only, finance Italian costs from Spain."
    ],
    "confidence": "medium",
    "confidence_why": "Italian doors depend on the installer model and the branch-or-srl reading of each call.",
    "open_question": "Who employs the installers, and how many over three years?",
    "cite": ["c8", "c25", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "it-nat", "level": "national", "label": "Italy, national", "country": "IT", "doors": [
        {"id": "fdg", "name": "SME guarantee fund", "institution": "Fondo di Garanzia PMI", "via": "an Italian lender", "status": "probe", "why": "Opens with an operating site in Italy; the installer team would be it.", "cite": ["c8"]}
      ]},
      {"id": "it-er", "level": "regional", "label": "Emilia-Romagna", "country": "IT", "doors": [
        {"id": "er-grant", "name": "Productive investment and R&D grant (STEP)", "institution": "Regione Emilia-Romagna, DG Knowledge Economy, Labour and Enterprise", "status": "probe", "why": "Capital companies only; a branch's eligibility unclear; strategic-tech scope may not fit irrigation.", "conditions": ["Single enterprise organised as a capital company", "Not primary agricultural production", "Located in Emilia-Romagna"], "cite": ["c25", "c26", "judgement"]}
      ]}
    ]
  },
  "hierarchies": [
    {
      "id": "installer-choice",
      "title": "The installer decision",
      "explains": "Who employs the installers sets which Italian doors open.",
      "nodes": [
        {"id": "ic-root", "label": "Distributor wants local installers for a 3-year deal", "kind": "programme", "cite": ["judgement"]},
        {"id": "ic-contract", "label": "Contracted installers (distributor or local firms)", "kind": "channel", "parent": "ic-root", "status": "open", "note": "Spain-only holds; Italian costs financed from Spain.", "cite": ["judgement"]},
        {"id": "ic-own", "label": "Own installers in Emilia-Romagna", "kind": "channel", "parent": "ic-root", "status": "probe", "note": "Needs an Italian presence; opens the guarantee fund.", "cite": ["c8"]},
        {"id": "ic-branch", "label": "Branch of the Spanish company", "kind": "unit", "parent": "ic-own", "status": "probe", "note": "Quicker; regional calls for capital companies may not read it as eligible.", "cite": ["c25", "judgement"]},
        {"id": "ic-srl", "label": "Italian srl", "kind": "unit", "parent": "ic-own", "status": "probe", "note": "More paperwork; clearly a capital company for regional calls.", "cite": ["c25", "judgement"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 4000000, "label": "Total need: line, working capital, Italian launch"},
    "instruments": [
      {"id": "it-ops", "name": "Italian installer team, year one (illustrative)", "type": "loan", "amount": 215000, "terms": "3 installers at about EUR 45k plus EUR 80k van, tools, stock; with own staff, a guaranteed Italian loan carries it.", "status": "planned", "cite": ["judgement"]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "italy", "label": "Italy", "steps": [
        {"id": "installer-model", "label": "Decide installer model before signing the distributor deal", "start": 0, "end": 1, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "branch", "label": "Register Italian presence before buying Italian kit (only if own installers)", "start": 1, "end": 3, "owner": "client", "status": "planned", "depends_on": ["installer-model"], "cite": ["c8", "judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-er", "label": "Emilia-Romagna next productive-investment call: does a foreign branch qualify?", "start": 4, "milestone": true, "owner": "us", "status": "planned", "cite": ["c25", "judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "deal-staffing", "kind": "flag", "severity": "medium", "title": "Signing a deal that promises installers you cannot yet staff", "fix": "Decide the installer model first; write the installer clause to match it.", "cite": ["judgement"]},
    {"id": "branch-form", "kind": "flag", "severity": "medium", "title": "Branch may not count as a capital company for regional calls", "fix": "Ask the region's call helpdesk before choosing branch or srl; tax adviser on the rest.", "cite": ["c25", "judgement"]}
  ]
}
```

Sources:
- [c25] Emilia-Romagna STEP productive-investment call, fesr.regione.emilia-romagna.it, sha256 95a79c9ac629: "Il bando si rivolge a imprese singole (sia PMI sia grandi imprese) nella forma giuridica di societa' di capitali."
- [c26] Same call, sha256 95a79c9ac629: exclusion of primary agricultural production, fishing, credit institutions.
- [c8] Italian SME guarantee fund operating rules, sha256 10198c227b8c

## Turn 8: the founder (answer, client_agent)

> We haven't decided yet. My guess is two or three installers to start, more if Puglia converts too, but whether we hire them or use contractors is still open. I'd rather have our own people for quality, if the cost makes sense.

## Turn 8: Wincent

Owning your installers is a sound call for quality, and with a three-year contract behind it the cost holds up (judgement). Here is how I'd run it.

**The plan, in order:**
1. **This week:** confirm the Valencian finance institute's loan terms and remaining budget. Ask your bank whether it holds the EU guarantee [w2] and the regional guarantee agreement (unverified). Get the supplier to agree a deposit date after February.
2. **December:** file the regional investment loan for the line (unverified). Put working capital on the bank line under the state lender's scheme [w1].
3. **February:** file the 2027 regional grant, if the call allows stacking. Pay the deposit only after that.
4. **Italy, in parallel:** sign the distributor deal with an installer clause you can deliver. Use local contractors for the first months while you register a branch as an operating site in Emilia-Romagna. Then hire your two or three people. The branch opens Italy's guarantee fund for the Italian costs [c8]. Keep an srl in reserve for when Puglia converts or a regional call that fits turns up [c25].

**What to expect:** the regional loan is first come, first served, so speed matters more than polish (unverified). The bank decides the state-scheme line in weeks (judgement). The Italian guarantee runs through an Italian lender once the site exists [c8].

**Precedents:** I found none in our records for the regional finance institute, the state lender or the Italian guarantee fund on a case like yours. These are routine products, so that is a gap in our data rather than a warning sign (judgement). Your 2022 grant is the closest track record you have.

Shall I draft the two first notes, one to your bank's business director and one to the regional finance institute?

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale and enter Italy",
  "stage": "advise",
  "answer": {
    "lines": [
      "Valencia line: regional investment loan filed in December, 2027 regional grant in February if stacking is allowed, deposit after both.",
      "Working capital: your bank's line under the state lender's scheme, with the EU or regional guarantee if your bank holds it.",
      "Italy: sign the distributor deal, bridge with contractors, register an Emilia-Romagna branch, then hire 2-3 installers.",
      "The branch opens Italy's SME guarantee fund; an srl stays in reserve for regional calls."
    ],
    "confidence": "medium",
    "confidence_why": "Routes fit by type; the regional loan's budget, stacking and the branch reading of Italian calls are to confirm.",
    "open_question": "Is your bank an EU-guarantee signatory, and what is your foreign-sales share?",
    "cite": ["w1", "w2", "c8", "c25", "unverified"]
  },
  "process_maps": [
    {
      "id": "ivf-loan",
      "title": "How the regional investment loan gets decided",
      "explains": "The lead route for the line: file early, before any order, with your bank and guarantee lined up.",
      "kind": "funding_decision",
      "illustrative": true,
      "actors": [
        {"id": "client", "name": "You (finance lead)", "side": "market"},
        {"id": "ivf", "name": "Valencian finance institute", "side": "public-capital"},
        {"id": "afin", "name": "Valencian mutual guarantee society", "side": "public-capital"},
        {"id": "supplier", "name": "Line supplier", "side": "market"}
      ],
      "steps": [
        {"id": "p1", "label": "Confirm terms, budget left, guarantee need", "kind": "step", "actor": "client", "timing": "this week", "cite": ["unverified"], "gates": [{"label": "Official call text read", "cite": ["judgement"]}, {"label": "SME figures and ownership confirmed", "cite": ["c2"]}]},
        {"id": "p2", "label": "File the application with the investment plan", "kind": "document", "actor": "client", "timing": "early December", "cite": ["unverified"], "gates": [{"label": "Fixed assets, investment of at least EUR 200k", "cite": ["unverified"]}, {"label": "No firm order placed", "cite": ["unverified"]}, {"label": "Supplier quotes, accounts, plan", "cite": ["judgement"]}]},
        {"id": "p3", "label": "Risk analysis and guarantee", "kind": "step", "actor": "ivf", "timing": "weeks", "cite": ["unverified"], "gates": [{"label": "Loan up to 80% of the investment", "cite": ["unverified"]}, {"label": "Guarantee from the mutual society if asked", "cite": ["unverified"]}]},
        {"id": "p4", "label": "Approval and signature", "kind": "decision", "actor": "ivf", "timing": "Q1 2027", "cite": ["judgement"], "gates": [{"label": "Not an undertaking in difficulty", "cite": ["judgement"]}]},
        {"id": "p5", "label": "Pay deposit, order the line", "kind": "decision", "actor": "supplier", "timing": "after the February grant filing", "cite": ["judgement"], "gates": [{"label": "All aid applications filed", "cite": ["unverified"]}]}
      ],
      "flow": [{"from": "p1", "to": "p2"}, {"from": "p2", "to": "p3"}, {"from": "p3", "to": "p4"}, {"from": "p4", "to": "p5"}],
      "leverage": [
        {"id": "l-fcfs", "at": "p2", "kind": "timing_window", "label": "First come, first served before 31 Dec", "why": "Budget may run out.", "how": "File in the first week of December.", "side": "public-capital", "cite": ["unverified"]},
        {"id": "l-2022", "at": "ivf", "kind": "door_opener", "label": "Your 2022 regional grant", "why": "The region already backed you once.", "how": "Mention it in the cover note.", "side": "public-capital", "cite": ["judgement"]},
        {"id": "l-dist", "at": "p3", "kind": "pressure_point", "label": "Three-year distributor contract", "why": "Shows lenders revenue they can see coming.", "how": "Attach the signed term sheet.", "side": "market", "cite": ["judgement"]}
      ],
      "cite": ["unverified", "judgement"]
    }
  ],
  "networks": [
    {
      "id": "money-chain",
      "title": "How the public money reaches you",
      "explains": "The EU fund and the state lender work through your bank; the region lends to you directly.",
      "nodes": [
        {"id": "n-eif", "label": "European Investment Fund", "kind": "institution", "cite": ["w2"]},
        {"id": "n-min", "label": "Spain's economy ministry", "kind": "ministry", "cite": ["w2"]},
        {"id": "n-ico", "label": "State lender (ICO)", "kind": "institution", "cite": ["w1"]},
        {"id": "n-bank", "label": "Your house bank", "kind": "bank", "cite": ["judgement"]},
        {"id": "n-ivf", "label": "Valencian finance institute", "kind": "institution", "cite": ["unverified"]},
        {"id": "n-you", "label": "You", "kind": "body", "cite": ["judgement"]}
      ],
      "edges": [
        {"from": "n-eif", "to": "n-bank", "kind": "funds", "label": "guarantee, if a signatory", "cite": ["w2"]},
        {"from": "n-min", "to": "n-eif", "kind": "works_with", "label": "signed the 2025 agreements", "cite": ["w2"]},
        {"from": "n-ico", "to": "n-bank", "kind": "funds", "label": "SME line via banks", "cite": ["w1"]},
        {"from": "n-bank", "to": "n-you", "kind": "funds", "label": "working capital line", "cite": ["w1"]},
        {"from": "n-ivf", "to": "n-you", "kind": "funds", "label": "investment loan for the line", "cite": ["unverified"]}
      ],
      "cite": ["w1", "w2"]
    }
  ],
  "stakeholders": {
    "institutions": [
      {"id": "it-bank", "name": "Italian lender for the branch", "side": "market", "country": "IT", "units": [{"id": "it-bank-u", "name": "SME desk, Emilia-Romagna", "roles": [
        {"id": "itb-p1", "role": "Head of SME lending, regional area", "priority": "P1", "reach": "Introduction from your Spanish bank's Italian network, if any", "status": "to_approach", "cite": ["judgement"]},
        {"id": "itb-p2", "role": "SME relationship manager", "priority": "P2", "reach": "Direct, once the branch is registered", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "er-reg", "name": "Regione Emilia-Romagna", "side": "political", "country": "IT", "units": [{"id": "er-u", "name": "DG Knowledge Economy, Labour and Enterprise", "roles": [
        {"id": "er-p1", "role": "Director-general", "priority": "P1", "reach": "Short letter on agrifood S3 fit and local jobs", "status": "to_approach", "cite": ["c6", "judgement"]},
        {"id": "er-p2", "role": "Head of the business-incentives service", "priority": "P2", "reach": "Call helpdesk: does a foreign branch qualify?", "status": "to_approach", "cite": ["c25", "judgement"]}]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "italy", "label": "Italy", "steps": [
        {"id": "installer-model", "label": "Own installers, contractors as a bridge", "start": 0, "end": 1, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "sign-dist", "label": "Sign distributor deal with deliverable installer clause", "start": 1, "end": 2, "owner": "client", "status": "planned", "depends_on": ["installer-model"], "cite": ["judgement"]},
        {"id": "branch", "label": "Register Emilia-Romagna branch as operating site", "start": 1.5, "end": 3.5, "owner": "client", "status": "planned", "cite": ["c8"]},
        {"id": "hire", "label": "Hire 2-3 installers", "start": 3.5, "end": 5, "owner": "client", "status": "planned", "depends_on": ["branch"], "cite": ["judgement"]},
        {"id": "it-guar", "label": "Italian loan with SME guarantee fund cover", "start": 4, "end": 6, "owner": "institution", "status": "planned", "depends_on": ["branch"], "cite": ["c8"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-puglia", "label": "Puglia pilot converts: srl and second site?", "start": 9, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "no-precedent", "kind": "flag", "severity": "low", "title": "No precedent in our records for any main route", "fix": "Lean on the 2022 grant and the distributor contract; ask each institution for comparable cases.", "cite": ["judgement"]}
  ]
}
```

Sources: [w1] ICO SME line, https://www.ico.es/ico-empresas-y-emprendedores (retrieved 18 Nov 2026) · [w2] EIF, 12 Jun 2025, eif.org (retrieved 18 Nov 2026) · [c2] SME definition, sha256 e4993c050802 · [c6] Emilia-Romagna S3, sha256 19a5ef72941b · [c8] Italian SME guarantee fund rules, sha256 10198c227b8c · [c25] Emilia-Romagna STEP call, sha256 95a79c9ac629

## Turn 9: the founder (prioritise, script)

> Which two or three should we actually go for, and what will each cost us in time and effort?

## Turn 9: Wincent

Go for these three, in this order of return on your effort.

**1. The Valencian regional investment loan, for the line.** This is your biggest win. It covers up to €2M of the €2.5M (unverified).
- **Effort:** about five to eight days of your finance lead's time on the plan, supplier quotes and accounts (judgement).
- **Time:** file in early December, decision in the first quarter of 2027 (judgement).
- **Value:** the 2025 edition was reported at 2% fixed (unverified). Against a bank rate of about 5% (assumption), that saves around €60k a year in interest on €2M.

**2. Your bank's line under the state lender's scheme, with a guarantee, for working capital.** It covers €1M to €1.5M [w1].
- **Effort:** two or three days. The bank does most of the work (judgement).
- **Time:** weeks (judgement).
- **Value:** if your bank holds the EU guarantee [w2], expect less collateral or a better rate (judgement).

**3. The Emilia-Romagna branch, then an Italian loan with the guarantee fund behind it.** It covers about €200k to €250k a year of Italian costs (illustrative).
- **Effort:** the highest per euro. Registration, an Italian accountant, an Italian bank (judgement).
- **Time:** roughly two to four months to register (unverified).
- **Why do it anyway:** you need the branch for your own installers. The money comes with it [c8].

**Low-effort probes alongside:**
- The 2027 regional grant, only if stacking is allowed (unverified).
- A quick eligibility check on the exporters growth line, with its non-repayable slice [w3].

**Parked:** the Emilia-Romagna investment grant, the national innovation agency, participative loans tied to equity, and the export starter programme.

Do you agree with these three? If so, I'll draft the notes to your bank and the regional finance institute.

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale and enter Italy",
  "stage": "prioritise",
  "answer": {
    "lines": [
      "1. Regional investment loan for the line: up to EUR 2M, 5-8 days of effort, file in December.",
      "2. Bank line under the state lender's scheme with a guarantee for working capital: 2-3 days, weeks.",
      "3. Emilia-Romagna branch, then a guaranteed Italian loan: most effort per euro, needed anyway for own installers.",
      "Probe the 2027 regional grant and the exporters growth line; park the rest."
    ],
    "confidence": "medium",
    "confidence_why": "Each fits by type; budgets, rates and stacking still to confirm.",
    "open_question": "Agree the three, then drafts to the bank and the regional finance institute?",
    "cite": ["w1", "w2", "w3", "c8", "unverified"]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 4000000, "label": "Total need: line, working capital, Italian launch"},
    "instruments": [
      {"id": "line", "name": "1. Regional investment loan for the line", "type": "loan", "amount": 2000000, "terms": "Machinery; reported 2% fixed vs about 5% bank: about EUR 60k a year saved. Effort 5-8 days; decision Q1 2027.", "status": "probe", "cite": ["unverified", "judgement"]},
      {"id": "ico", "name": "2. Bank line under the state lender's scheme, guaranteed", "type": "loan", "amount": 1000000, "amount_max": 1500000, "terms": "Working capital and the line's remainder; effort 2-3 days, weeks; guarantee lowers collateral.", "status": "probe", "cite": ["w1", "w2", "judgement"]},
      {"id": "eif", "name": "EU guarantee on the bank line", "type": "guarantee_debt", "terms": "No new cash; the EU fund takes part of the loss if your bank is a signatory.", "status": "probe", "cite": ["w2"]},
      {"id": "it-ops", "name": "3. Italian loan with SME guarantee fund cover", "type": "guarantee_debt", "amount": 200000, "amount_max": 250000, "terms": "Italian installers, van, stock; opens once the branch is registered; effort highest per euro.", "status": "planned", "cite": ["c8", "judgement"]},
      {"id": "grant", "name": "Probe: 2027 regional investment grant", "type": "grant", "terms": "Cuts the line's net cost if stackable with the loan.", "status": "probe", "cite": ["unverified"]},
      {"id": "growth-exp", "name": "Probe: exporters growth line, non-repayable slice", "type": "grant", "amount": 200000, "terms": "Up to 30% of the loan, max EUR 200k, if you meet the export and tariff tests.", "status": "probe", "cite": ["w3"]}
    ]
  },
  "routes": {
    "levels": [
      {"id": "es-nat", "level": "national", "label": "Spain, national", "country": "ES", "doors": [
        {"id": "cdti", "name": "National innovation agency loans", "institution": "CDTI", "status": "park", "why": "Parked pending the R&D answer.", "cite": ["unverified"]},
        {"id": "enisa", "name": "Participative loans", "institution": "ENISA", "status": "park", "why": "Parked: no raise planned.", "cite": ["unverified"]}
      ]}
    ]
  }
}
```

Sources: [w1] ICO SME line, ico.es (retrieved 18 Nov 2026) · [w2] EIF signatory banks, eif.org, 12 Jun 2025 (retrieved 18 Nov 2026) · [w3] La Moncloa, ICO exporters growth line, 9 Feb 2026 (retrieved 18 Nov 2026) · [c8] Italian SME guarantee fund rules, sha256 10198c227b8c · Lead, not confirmed: [consultancy note on the 2025 regional loan at 2%](https://leyton.com/es/insights/white-papers/prestamos-bonificados-ivf-pyme-inversion-comunidad-valenciana/)

## Turn 10: the founder (expect, script)

> If we go that way, how do we start, and what should we expect along the way?

## Turn 10: Wincent

Here is how to start, and what each stage should look like.

**This week (your finance lead, about one day):**
- Call your relationship manager. Ask three things: does the bank hold the EU guarantee [w2]? Does it work with the Valencian guarantee society (unverified)? Can it start a working-capital line under the state lender's scheme [w1]?
- Call the regional finance institute's business line. Confirm the investment loan is still open and has budget left (unverified).
- Get the supplier's deposit date in writing, set after February.
- Find the 2022 grant resolution, and check your foreign-sales share against the exporters line test [w3].

**Weeks two to four:** assemble the loan file (plan, quotes, two years of accounts) and file in the first week of December (judgement). Expect the institute to ask for a guarantee or extra collateral. The guarantee society is the usual answer (unverified).

**January to March:** decision on the regional loan and the bank line. File the 2027 grant on day one if stacking is allowed (unverified). Then pay the deposit.

**From January, in Italy:** sign the distributor deal and appoint an Italian accountant. Register the branch as an operating site in Emilia-Romagna. That takes tax registration, the company register and employer registration (unverified, your accountant confirms). Then hire your installers and open the guarantee-backed Italian loan [c8].

**Odds (judgement):** good on the bank line. Good on the regional loan if budget remains. The Italian guarantee is routine once the site exists.

Shall I draft the bank note and the note to the regional finance institute now?

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale and enter Italy",
  "stage": "advise",
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "week1", "label": "This week", "steps": [
        {"id": "call-bank", "label": "Relationship manager: EU guarantee, regional guarantee agreement, state-scheme line", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["w1", "w2", "unverified"]},
        {"id": "call-ivf", "label": "Regional finance institute: loan open, budget left", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "supplier-date", "label": "Supplier deposit date in writing, after February", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "docs-2022", "label": "Find 2022 grant resolution; foreign-sales share", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["w3", "unverified"]}
      ]},
      {"id": "lead", "label": "Valencia line", "steps": [
        {"id": "file-ivf", "label": "File regional investment loan (first week of December)", "start": 0.5, "end": 1, "owner": "client", "status": "planned", "depends_on": ["call-ivf"], "cite": ["unverified"]},
        {"id": "bank-line", "label": "Bank line under the state lender's scheme", "start": 0.5, "end": 2, "owner": "institution", "status": "planned", "depends_on": ["call-bank"], "cite": ["w1"]},
        {"id": "ivf-decision", "label": "Regional loan decision", "start": 3, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["file-ivf"], "cite": ["judgement"]},
        {"id": "file-grant", "label": "File 2027 regional grant on opening, if stackable", "start": 3, "end": 3.5, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "deposit", "label": "Pay deposit (not before filings)", "start": 3.5, "milestone": true, "owner": "client", "status": "blocked", "depends_on": ["file-ivf", "file-grant"], "cite": ["unverified"]}
      ]},
      {"id": "italy", "label": "Italy", "steps": [
        {"id": "sign-dist", "label": "Sign distributor deal; contractors as a bridge", "start": 1.5, "end": 2.5, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "branch", "label": "Register branch as operating site in Emilia-Romagna", "start": 2, "end": 4, "owner": "client", "status": "planned", "cite": ["c8", "unverified"]},
        {"id": "hire", "label": "Hire 2-3 installers", "start": 4, "end": 5, "owner": "client", "status": "planned", "depends_on": ["branch"], "cite": ["judgement"]},
        {"id": "it-guar", "label": "Italian loan with guarantee fund cover", "start": 4, "end": 6, "owner": "institution", "status": "planned", "depends_on": ["branch"], "cite": ["c8"]}
      ]}
    ]
  },
  "process_maps": [
    {
      "id": "it-branch",
      "title": "From branch to guaranteed Italian loan",
      "explains": "The Italian presence comes first; the guarantee fund then backs an Italian lender's loan.",
      "kind": "funding_decision",
      "illustrative": true,
      "actors": [
        {"id": "client", "name": "You and your Italian accountant", "side": "market"},
        {"id": "reg", "name": "Italian company register and tax office", "side": "public-capital"},
        {"id": "itbank", "name": "Italian lender", "side": "market"},
        {"id": "fdg", "name": "SME guarantee fund", "side": "public-capital"}
      ],
      "steps": [
        {"id": "b1", "label": "Register branch and operating site", "kind": "document", "actor": "reg", "timing": "2-4 months", "cite": ["unverified"], "gates": [{"label": "Operating site in Italy registered", "cite": ["c8"]}, {"label": "Tax and employer registration", "cite": ["unverified"]}]},
        {"id": "b2", "label": "Open account and loan request at an Italian lender", "kind": "step", "actor": "itbank", "timing": "weeks", "cite": ["judgement"], "gates": [{"label": "SME under the EU definition", "cite": ["c2"]}]},
        {"id": "b3", "label": "Lender requests guarantee fund cover", "kind": "document", "actor": "itbank", "timing": "weeks", "cite": ["judgement"], "gates": [{"label": "Beneficiary located in Italy", "cite": ["c8"]}]},
        {"id": "b4", "label": "Cover granted, loan paid out", "kind": "decision", "actor": "fdg", "timing": "weeks", "cite": ["judgement"]}
      ],
      "flow": [{"from": "b1", "to": "b2"}, {"from": "b2", "to": "b3"}, {"from": "b3", "to": "b4"}],
      "leverage": [
        {"id": "lb-dist", "at": "b2", "kind": "door_opener", "label": "Three-year distributor contract", "why": "Gives the Italian lender visible revenue.", "how": "Attach it to the loan request.", "side": "market", "cite": ["judgement"]}
      ],
      "cite": ["c8", "judgement"]
    }
  ]
}
```

Sources: [w1] ICO SME line, ico.es (retrieved 18 Nov 2026) · [w2] EIF signatory banks, eif.org (retrieved 18 Nov 2026) · [w3] La Moncloa, exporters growth line (retrieved 18 Nov 2026) · [c2] SME definition, sha256 e4993c050802 · [c8] Italian SME guarantee fund rules, sha256 10198c227b8c

## Turn 11: the founder (brief, script)

> We are running out of time on our side. Can you write up what we have as a brief now?

## Turn 11: Wincent

# Brief: public money for the Valencia line and the Italian entry

*For the founders and board. Prepared 18 November 2026.*

## 1. Answer

Pay for the new Valencia line mainly with the Valencian finance institute's subsidised investment loan. It covers up to €2M of the €2.5M, and the application has to be filed in early December, before the window reportedly closes on 31 December (unverified). Put working capital on your bank's line under the state lender's SME scheme [w1]. That line gets cheaper if your bank is one of the lenders with EU guarantee backing [w2].

In Italy, sign the Emilia-Romagna distributor deal and use contractors as a bridge. Register a branch as an operating site, then hire two or three installers. The branch opens Italy's SME guarantee fund for the Italian costs [c8].

The one rule that protects all of this: pay the supplier's deposit only after every application is filed. A firm order can count as starting the project (unverified).

## 2. Where you stand

- **Spain, regional (Valencia):** The investment loan is open, fixed assets only, from €200k to €2M, up to 80% of the investment (unverified). The 2027 investment grant is not published yet; the 2026 window ran February to March (unverified). The Valencian guarantee society works through agreements with individual banks (unverified). You already had a regional innovation grant in 2022.
- **Spain, national:** Your bank can apply for the state lender's SME line, for investment or liquidity, up to 100% of the need [w1]. The state lender's exporters growth line finances capacity and carries up to 30% non-repayable, capped at €200k. It requires more than 5% of turnover from abroad, a tariff impact, and at least four years in business [w3]. It may have closed in July (unverified). The innovation agency and participative loans are parked: the R&D answer is pending, and you are not raising.
- **EU:** The European Investment Fund's 2025 guarantees reach SMEs through BBVA, CaixaBank, Santander and other signatory lenders [w2]. A direct EIB loan is shut because your ticket is far too small (judgement).
- **Italy, national:** The SME guarantee fund needs a registered office or an operating site in Italy [c8]. Your Italian farm customers can use subsidised machinery finance [c1]. That is their money, not yours.
- **Italy, regional:** Agrifood is a priority in Emilia-Romagna's innovation strategy [c6]. The region's productive-investment call admits only capital companies and excludes primary farming [c25][c26]. Whether a foreign branch qualifies is unclear, and the call's strategic-technology scope may not cover irrigation (judgement). Puglia is parked.

## 3. Flags

| Flag | Severity | Fix |
|---|---|---|
| A deposit before filing can void the aid | High | Agree the deposit date in writing, after the February filing (unverified) |
| The regional loan is first come, first served and closes 31 Dec | High | Confirm budget this week; file in the first week of December (unverified) |
| Stacking the 2022 grant, the loan and a 2027 grant may hit aid ceilings | Medium | Find the 2022 resolution; read the stacking clause in both calls (unverified) |
| A branch may not count as a capital company for regional calls | Medium | Ask the region's call helpdesk; keep an srl in reserve [c25] |
| Regular installation work in Italy may create a taxable presence | Medium | Tax adviser, before the pilots scale (unverified) |
| Product rules for irrigation hardware sold in Italy | Medium | Handed to Regina for a risk read |

## 4. Decisions

1. **Installer model.** Recommendation: your own installers, with contractors as a bridge while the branch registers (judgement).
2. **Branch or srl.** Recommendation: a branch now, because it is quicker and opens the guarantee fund [c8]. Move to an srl if Puglia converts or a fitting regional call needs one [c25].
3. **Loan only, or loan plus grant.** Recommendation: file the loan in December and the grant in February, if the calls allow stacking (unverified).

## 5. Actions and drafts

| Action | Addressed to | Side |
|---|---|---|
| Ask about the EU guarantee, the regional guarantee agreement and the state-scheme line | Your bank's regional business director (P1), via your relationship manager (P2) | Market |
| Confirm the loan is open and has budget; file in early December | Valencian finance institute, director of business financing (P1); loan analyst (P2) | Public capital |
| Short letter on the line's fit with the region's industrial agenda | Regional directorate-general for industry (P1); head of the SME investment aid service (P2) | Political |
| Ask whether a foreign branch qualifies for its calls | Emilia-Romagna, head of the business-incentives service (P2); director-general (P1) | Political |
| Supplier deposit date in writing | Line supplier | Market |

**Draft (for your review; you send):** to your bank's regional business director.

> Asunto: Financiación de nueva línea de producción en Valencia
>
> Estimado/a Director/a:
>
> Somos un fabricante valenciano de equipos de riego inteligente, con 25 empleados, y cliente de su entidad. Vamos a instalar una nueva línea de producción en nuestra planta de Valencia, con una inversión de 2,5 millones de euros. Además, hemos firmado un acuerdo de distribución de tres años en Italia.
>
> Queremos estructurar la financiación con ustedes: la línea ICO para el circulante y, si su entidad dispone de ella, la garantía del Fondo Europeo de Inversiones o de Afín SGR. ¿Podríamos reunirnos en las próximas dos semanas?
>
> Atentamente,
> [Nombre, cargo]

## 6. Plan

- **This week:** the bank call; the finance institute call; the supplier's date in writing; the 2022 resolution; your foreign-sales share.
- **This month:** assemble the loan file and file in the first week of December. The bank starts the working-capital line.
- **This quarter:** decision on the loan. File the 2027 grant on opening, if stackable. Then pay the deposit. In parallel, sign the distributor deal and start the branch registration.
- **Later (months 4 to 6):** hire the installers, then take an Italian loan with guarantee fund cover [c8].
- **Not yet:** no deposit before the filings; no Italian equipment bought before the site is registered; no installer clause you cannot staff (judgement).

## 7. Watches

- The regional loan: whether budget remains before 31 Dec, and the 2027 edition (unverified).
- The 2027 regional investment grant: publication and its stacking clause (unverified).
- The exporters growth line: still open, and funds left [w3].
- Whether your bank is an EU guarantee signatory [w2].
- Emilia-Romagna's next calls, and whether a branch qualifies [c25].
- The Puglia pilot converting: second site, and srl.
- Parked: the innovation agency (on the R&D answer); participative loans (on a raise); the export starter programme 2027 (unverified).

## 8. Precedents

- **Regional finance institute:** none found in our records.
- **State lender:** none found.
- **Italian guarantee fund:** none found.

These are routine products, so the absence is more likely a gap in our data than a warning (judgement). The 2022 regional grant is your own track record.

## 9. Sources

- [c1] Decree-Law 69/2013 art. 2, Nuova Sabatini, normattiva.it, e4993c050802
- [c2] Same article, SME definition, e4993c050802
- [c6] Emilia-Romagna S3, fesr.regione.emilia-romagna.it/s3, 19a5ef72941b
- [c8] Italian SME guarantee fund operating rules 2023, 10198c227b8c
- [c25], [c26] Emilia-Romagna STEP productive-investment call, fesr.regione.emilia-romagna.it, 95a79c9ac629
- [c3]-[c5], [c7] S3 strategies of Piemonte, Lombardia, Veneto, Toscana: deef31219ada, 4cc011a6c9e6, cafa394bcbcd, 949291ad3b90
- [w1] https://www.ico.es/ico-empresas-y-emprendedores, 18 Nov 2026: "Proyectos de inversión, actividades empresariales y/o necesidades de liquidez o gastos"; "En las entidades de crédito directamente."
- [w2] https://www.eif.org/InvestEU/news/2025/fei-movilizara-con-fondos-next-generation-eu2-500-millones-de-euros-de-nueva-financiacion-para-pymes-espanolas-que-quieran-invertir-en-innovacion-sostenibilidad-competitividad.htm, 18 Nov 2026: "Andbank (via Actyus Growth Finance), BBVA, CaixaBank, EBN Banco, ICF, Inveready, Kutxabank" ... "MicroBank, Santander, Tresmares and Unicaja"
- [w3] https://www.lamoncloa.gob.es/serviciosdeprensa/notasprensa/economia-comercio-empresa/paginas/2026/090226-ico-crecimiento-exportadores.aspx, 18 Nov 2026: "que represente más del cinco por ciento de su cifra de negocios"
- Unconfirmed leads: [aggregator on the 2026 regional loan](https://tecnociminnova.com/es/buscador-ayudas/comunidad-valenciana/comval-lineabonificadaivfpymeinversion2026); [press on the guarantee society's bank lines](https://alicanteplaza.es/alicanteplaza/empresas/banco-sabadell-y-afin-sgr-amplian-a-85-millones-la-linea-de-apoyo-a-pymes-y-autonomos-en-la-comunitat-valenciana)

## 10. Questions for the founder

1. **Which bank?** It decides how much the guarantee helps.
2. **What is your foreign-sales share, and when were you founded?** That settles the exporters line and its €200k non-repayable slice.
3. **Was the 2022 grant de minimis, and from which agency?** It sets how much aid room is left for stacking.
4. **Is there real R&D in the kit?** If yes, that reopens the innovation agency.

Two things to know about this brief:
- **What is confirmed and what is not.** The bank line, the EU guarantee banks, the exporters line and the Italian guarantee rule are confirmed on official pages or the statute. The figures for the lead Valencian loan come from third-party summaries, and the official page did not load. Confirm them in this week's call before you rely on them.
- **The draft letter.** It is in section 5 although you had not yet said yes to drafts; my brief template asks for one. Delete it if it isn't useful.

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale and enter Italy",
  "stage": "write_up",
  "answer": {
    "lines": [
      "1. Regional investment loan for the Valencia line, filed in early December: up to EUR 2M.",
      "2. Bank line under the state lender's scheme, with EU or regional guarantee, for working capital.",
      "3. Emilia-Romagna branch, own installers, then a guaranteed Italian loan.",
      "Deposit only after every filing; probe the 2027 grant and the exporters line."
    ],
    "confidence": "medium",
    "confidence_why": "Routes fit by type; the regional loan's budget and terms, stacking, and the branch reading of Italian calls are to confirm.",
    "open_question": "Which bank, what foreign-sales share, and was the 2022 grant de minimis?",
    "cite": ["w1", "w2", "w3", "c8", "unverified"]
  },
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eif-bank", "name": "EU-backed SME guarantee on your bank's loan", "institution": "European Investment Fund, through signatory banks", "via": "your house bank, if a signatory", "status": "probe", "why": "BBVA, CaixaBank, Santander and others signed in June 2025.", "cite": ["w2"]},
        {"id": "eib-direct", "name": "Direct EIB loan", "institution": "European Investment Bank", "status": "shut", "why": "Far above your ticket size.", "cite": ["judgement"]},
        {"id": "eu-rd", "name": "EU innovation grants", "institution": "European Commission", "status": "park", "why": "Only with real R&D.", "cite": ["judgement"]}
      ]},
      {"id": "es-nat", "level": "national", "label": "Spain, national", "country": "ES", "doors": [
        {"id": "ico", "name": "State lender's SME line", "institution": "ICO, through your bank", "status": "open", "why": "Investment and liquidity, up to 100%, applied for at your bank.", "cite": ["w1"]},
        {"id": "ico-growth-exp", "name": "Exporters growth line", "institution": "ICO, online channel", "status": "probe", "why": "Up to 30% non-repayable, max EUR 200k; export and tariff tests; may be closed.", "cite": ["w3", "unverified"]},
        {"id": "ico-exp", "name": "Export pre-financing line", "institution": "ICO, through your bank", "status": "probe", "why": "Pre-finances export orders.", "cite": ["unverified"]},
        {"id": "cofides", "name": "Outbound investment support", "institution": "COFIDES with ICEX", "status": "park", "why": "Not needed while Italy runs on a branch and local loans.", "cite": ["unverified"]},
        {"id": "cdti", "name": "Innovation agency loans", "institution": "CDTI", "status": "park", "why": "Pending the R&D answer.", "cite": ["unverified"]},
        {"id": "enisa", "name": "Participative loans", "institution": "ENISA", "status": "park", "why": "No raise planned.", "cite": ["unverified"]},
        {"id": "icex-next", "name": "Export starter programme", "institution": "ICEX", "status": "park", "why": "2026 call reportedly closed 30 Oct.", "cite": ["unverified"]}
      ]},
      {"id": "es-cv", "level": "regional", "label": "Comunitat Valenciana", "country": "ES", "doors": [
        {"id": "ivf", "name": "SME investment loan 2026", "institution": "Valencian finance institute", "status": "open", "why": "Fixed assets, EUR 200k to 2M, up to 80%; closes 31 Dec 2026.", "cite": ["unverified"]},
        {"id": "inpyme", "name": "Industrial SME investment grant 2027", "institution": "Generalitat Valenciana", "status": "probe", "why": "Call not yet published; stacking to confirm.", "cite": ["unverified"]},
        {"id": "afin", "name": "Regional mutual guarantee", "institution": "Valencian mutual guarantee society", "via": "bank agreements", "status": "probe", "why": "Can guarantee the regional or bank loan.", "cite": ["unverified"]}
      ]},
      {"id": "it-nat", "level": "national", "label": "Italy, national", "country": "IT", "doors": [
        {"id": "fdg", "name": "SME guarantee fund", "institution": "Fondo di Garanzia PMI", "via": "an Italian lender", "status": "probe", "why": "Opens with the registered operating site.", "cite": ["c8"]},
        {"id": "simest", "name": "Italian internationalisation finance", "institution": "SIMEST", "status": "park", "why": "Built for Italian companies going abroad.", "cite": ["unverified"]}
      ]},
      {"id": "it-er", "level": "regional", "label": "Emilia-Romagna", "country": "IT", "doors": [
        {"id": "er-grant", "name": "Productive investment and R&D grant (STEP)", "institution": "Regione Emilia-Romagna", "status": "park", "why": "Capital companies only; branch reading and scope fit unclear.", "cite": ["c25", "c26", "judgement"]}
      ]},
      {"id": "it-pu", "level": "regional", "label": "Puglia", "country": "IT", "doors": [
        {"id": "pu", "name": "Regional programmes", "institution": "Regione Puglia", "status": "park", "why": "Pilot of three farms; revisit if it converts.", "cite": ["judgement"]}
      ]},
      {"id": "cust", "level": "customer", "label": "Your customers", "doors": [
        {"id": "sabatini", "name": "Subsidised machinery finance for Italian SMEs", "institution": "Nuova Sabatini", "status": "probe", "why": "Italian farms' money; speeds sales.", "cite": ["c1"]}
      ]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "bank", "name": "Your house bank", "side": "market", "country": "ES", "units": [{"id": "bank-u", "name": "Business banking, Valencia", "roles": [
        {"id": "bank-p1", "role": "Regional business banking director", "priority": "P1", "reach": "Your relationship manager escalates", "status": "to_approach", "cite": ["judgement"]},
        {"id": "bank-p2", "role": "Your relationship manager", "priority": "P2", "reach": "Direct", "status": "engaged", "cite": ["judgement"]}]}]},
      {"id": "ivf-i", "name": "Valencian finance institute", "side": "public-capital", "country": "ES", "units": [{"id": "ivf-u", "name": "Business financing", "roles": [
        {"id": "ivf-p1", "role": "Director of business financing", "priority": "P1", "reach": "Business line contact", "status": "to_approach", "cite": ["judgement"]},
        {"id": "ivf-p2", "role": "Loan analyst for industrial SMEs", "priority": "P2", "reach": "Assigned on filing", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "gva", "name": "Generalitat Valenciana, industry department", "side": "political", "country": "ES", "units": [{"id": "gva-u", "name": "Directorate-general for industry", "roles": [
        {"id": "gva-p1", "role": "Director-general for industry", "priority": "P1", "reach": "Formal letter on the regional industrial agenda", "status": "to_approach", "cite": ["judgement"]},
        {"id": "gva-p2", "role": "Head of the SME investment aid service", "priority": "P2", "reach": "Through the 2022 grant contact", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "it-bank", "name": "Italian lender for the branch", "side": "market", "country": "IT", "units": [{"id": "it-bank-u", "name": "SME desk, Emilia-Romagna", "roles": [
        {"id": "itb-p1", "role": "Head of SME lending, regional area", "priority": "P1", "reach": "Introduction via your Spanish bank, if it has an Italian network", "status": "to_approach", "cite": ["judgement"]},
        {"id": "itb-p2", "role": "SME relationship manager", "priority": "P2", "reach": "Direct, once the branch is registered", "status": "to_approach", "cite": ["judgement"]}]}]},
      {"id": "er-reg", "name": "Regione Emilia-Romagna", "side": "political", "country": "IT", "units": [{"id": "er-u", "name": "DG Knowledge Economy, Labour and Enterprise", "roles": [
        {"id": "er-p1", "role": "Director-general", "priority": "P1", "reach": "Short letter on agrifood S3 fit and local jobs", "status": "to_approach", "cite": ["c6", "judgement"]},
        {"id": "er-p2", "role": "Head of the business-incentives service", "priority": "P2", "reach": "Call helpdesk: does a foreign branch qualify?", "status": "to_approach", "cite": ["c25", "judgement"]}]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "week1", "label": "This week", "steps": [
        {"id": "call-bank", "label": "Bank: EU guarantee, regional guarantee, state-scheme line", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["w1", "w2"]},
        {"id": "call-ivf", "label": "Regional finance institute: open, budget left", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "supplier-date", "label": "Supplier deposit date in writing, after February", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "docs-2022", "label": "2022 grant resolution; foreign-sales share", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["w3", "unverified"]}
      ]},
      {"id": "lead", "label": "Valencia line", "steps": [
        {"id": "file-ivf", "label": "File regional investment loan", "start": 0.5, "end": 1, "owner": "client", "status": "planned", "depends_on": ["call-ivf"], "cite": ["unverified"]},
        {"id": "bank-line", "label": "Bank line under the state lender's scheme", "start": 0.5, "end": 2, "owner": "institution", "status": "planned", "depends_on": ["call-bank"], "cite": ["w1"]},
        {"id": "ivf-decision", "label": "Regional loan decision", "start": 3, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["file-ivf"], "cite": ["judgement"]},
        {"id": "file-grant", "label": "File 2027 regional grant, if stackable", "start": 3, "end": 3.5, "owner": "client", "status": "planned", "cite": ["unverified"]},
        {"id": "deposit", "label": "Pay deposit (not before filings)", "start": 3.5, "milestone": true, "owner": "client", "status": "blocked", "depends_on": ["file-ivf", "file-grant"], "cite": ["unverified"]}
      ]},
      {"id": "italy", "label": "Italy", "steps": [
        {"id": "installer-model", "label": "Own installers, contractors as a bridge", "start": 0, "end": 1, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "sign-dist", "label": "Sign distributor deal with deliverable installer clause", "start": 1.5, "end": 2.5, "owner": "client", "status": "planned", "depends_on": ["installer-model"], "cite": ["judgement"]},
        {"id": "branch", "label": "Register branch as operating site in Emilia-Romagna", "start": 2, "end": 4, "owner": "client", "status": "planned", "cite": ["c8", "unverified"]},
        {"id": "hire", "label": "Hire 2-3 installers", "start": 4, "end": 5, "owner": "client", "status": "planned", "depends_on": ["branch"], "cite": ["judgement"]},
        {"id": "it-guar", "label": "Italian loan with guarantee fund cover", "start": 4, "end": 6, "owner": "institution", "status": "planned", "depends_on": ["branch"], "cite": ["c8"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-eif", "label": "Is your bank an EU-guarantee signatory?", "start": 0.25, "milestone": true, "owner": "us", "status": "planned", "cite": ["w2"]},
        {"id": "w-icoexp", "label": "Exporters growth line: open, funds left?", "start": 0.25, "milestone": true, "owner": "us", "status": "planned", "cite": ["w3"]},
        {"id": "w-ivf", "label": "Regional loan: 2026 close, 2027 edition", "start": 1.4, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-grant", "label": "2027 regional grant call and stacking clause", "start": 2.8, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-er", "label": "Emilia-Romagna next calls: does a branch qualify?", "start": 4, "milestone": true, "owner": "us", "status": "planned", "cite": ["c25"]},
        {"id": "w-puglia", "label": "Puglia converts: second site, srl?", "start": 9, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]},
        {"id": "w-icex", "label": "Export starter programme 2027 call", "start": 10, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 4000000, "label": "Total need: line 2.5M, working capital and Italian launch 1.5M"},
    "instruments": [
      {"id": "line", "name": "Regional investment loan for the line", "type": "loan", "amount": 2000000, "terms": "Machinery; subsidised fixed-asset money, about EUR 60k a year cheaper than a 5% bank loan (assumption).", "status": "probe", "cite": ["unverified", "judgement"]},
      {"id": "ico", "name": "Bank line under the state lender's scheme", "type": "loan", "amount": 1000000, "amount_max": 1500000, "terms": "Working capital and the line's remainder; the bank decides in weeks.", "status": "probe", "cite": ["w1"]},
      {"id": "eif", "name": "EU guarantee on the bank line", "type": "guarantee_debt", "terms": "No new cash; lowers collateral or rate if your bank is a signatory.", "status": "probe", "cite": ["w2"]},
      {"id": "it-ops", "name": "Italian loan with guarantee fund cover", "type": "guarantee_debt", "amount": 200000, "amount_max": 250000, "terms": "Installers, van, stock in Italy; opens with the branch.", "status": "planned", "cite": ["c8", "judgement"]},
      {"id": "grant", "name": "2027 regional investment grant", "type": "grant", "terms": "Cuts the line's net cost if stackable.", "status": "probe", "cite": ["unverified"]},
      {"id": "growth-exp", "name": "Exporters growth line, non-repayable slice", "type": "grant", "amount": 200000, "terms": "Up to 30% of the loan, max EUR 200k, if eligible and open.", "status": "probe", "cite": ["w3"]},
      {"id": "sabatini-c", "name": "Customers' subsidised machinery finance (Italy)", "type": "customer_side", "terms": "Italian farms finance their kit purchase; speeds sales, carries none of your costs.", "status": "probe", "cite": ["c1"]}
    ]
  },
  "process_maps": [
    {
      "id": "ivf-loan",
      "title": "How the regional investment loan gets decided",
      "explains": "The lead route: file early, before any order, with bank and guarantee lined up.",
      "kind": "funding_decision",
      "illustrative": true,
      "actors": [
        {"id": "client", "name": "You (finance lead)", "side": "market"},
        {"id": "ivf", "name": "Valencian finance institute", "side": "public-capital"},
        {"id": "supplier", "name": "Line supplier", "side": "market"}
      ],
      "steps": [
        {"id": "p1", "label": "Confirm terms and budget left", "kind": "step", "actor": "client", "timing": "this week", "cite": ["unverified"], "gates": [{"label": "Official call text read", "cite": ["judgement"]}, {"label": "SME figures and ownership confirmed", "cite": ["c2"]}]},
        {"id": "p2", "label": "File the application", "kind": "document", "actor": "client", "timing": "early December", "cite": ["unverified"], "gates": [{"label": "Fixed assets, at least EUR 200k", "cite": ["unverified"]}, {"label": "No firm order placed", "cite": ["unverified"]}]},
        {"id": "p3", "label": "Risk analysis and guarantee", "kind": "step", "actor": "ivf", "timing": "weeks", "cite": ["unverified"], "gates": [{"label": "Loan up to 80% of the investment", "cite": ["unverified"]}]},
        {"id": "p4", "label": "Approval and signature", "kind": "decision", "actor": "ivf", "timing": "Q1 2027", "cite": ["judgement"]},
        {"id": "p5", "label": "Pay deposit, order the line", "kind": "decision", "actor": "supplier", "timing": "after the February filing", "cite": ["judgement"], "gates": [{"label": "All aid applications filed", "cite": ["unverified"]}]}
      ],
      "flow": [{"from": "p1", "to": "p2"}, {"from": "p2", "to": "p3"}, {"from": "p3", "to": "p4"}, {"from": "p4", "to": "p5"}],
      "leverage": [
        {"id": "l-fcfs", "at": "p2", "kind": "timing_window", "label": "First come, first served before 31 Dec", "why": "Budget may run out.", "how": "File in the first week of December.", "side": "public-capital", "cite": ["unverified"]},
        {"id": "l-dist", "at": "p3", "kind": "pressure_point", "label": "Three-year distributor contract", "why": "Shows lenders revenue they can see coming.", "how": "Attach the signed term sheet.", "side": "market", "cite": ["judgement"]}
      ],
      "cite": ["unverified", "judgement"]
    },
    {
      "id": "it-branch",
      "title": "From branch to guaranteed Italian loan",
      "explains": "The Italian presence comes first; the guarantee fund then backs an Italian lender's loan.",
      "kind": "funding_decision",
      "illustrative": true,
      "actors": [
        {"id": "client", "name": "You and your Italian accountant", "side": "market"},
        {"id": "itbank", "name": "Italian lender", "side": "market"},
        {"id": "fdg", "name": "SME guarantee fund", "side": "public-capital"}
      ],
      "steps": [
        {"id": "b1", "label": "Register branch and operating site", "kind": "document", "actor": "client", "timing": "2-4 months", "cite": ["unverified"], "gates": [{"label": "Operating site in Italy registered", "cite": ["c8"]}]},
        {"id": "b2", "label": "Loan request at an Italian lender", "kind": "step", "actor": "itbank", "timing": "weeks", "cite": ["judgement"], "gates": [{"label": "SME under the EU definition", "cite": ["c2"]}]},
        {"id": "b3", "label": "Lender requests guarantee fund cover", "kind": "document", "actor": "itbank", "timing": "weeks", "cite": ["judgement"], "gates": [{"label": "Beneficiary located in Italy", "cite": ["c8"]}]},
        {"id": "b4", "label": "Cover granted, loan paid out", "kind": "decision", "actor": "fdg", "timing": "weeks", "cite": ["judgement"]}
      ],
      "flow": [{"from": "b1", "to": "b2"}, {"from": "b2", "to": "b3"}, {"from": "b3", "to": "b4"}],
      "leverage": [
        {"id": "lb-dist", "at": "b2", "kind": "door_opener", "label": "Three-year distributor contract", "why": "Visible revenue for the lender.", "how": "Attach it to the loan request.", "side": "market", "cite": ["judgement"]}
      ],
      "cite": ["c8", "judgement"]
    }
  ],
  "hierarchies": [
    {
      "id": "field",
      "title": "Who sits under whom",
      "explains": "Spain carries the line and working capital; Italy opens with the branch.",
      "nodes": [
        {"id": "es", "label": "Spain: scale production", "kind": "ministry", "cite": ["judgement"]},
        {"id": "es-cv", "label": "Generalitat Valenciana", "kind": "regional_body", "parent": "es", "cite": ["judgement"]},
        {"id": "ivf", "label": "Valencian finance institute: SME investment loan", "kind": "instrument", "parent": "es-cv", "status": "open", "cite": ["unverified"]},
        {"id": "afin", "label": "Valencian mutual guarantee society", "kind": "channel", "parent": "es-cv", "status": "probe", "cite": ["unverified"]},
        {"id": "inpyme", "label": "Regional industrial SME investment grant", "kind": "programme", "parent": "es-cv", "status": "probe", "cite": ["unverified"]},
        {"id": "es-nat", "label": "State lender: SME line via your bank", "kind": "institution", "parent": "es", "status": "open", "cite": ["w1"]},
        {"id": "es-out", "label": "Spanish outbound support (COFIDES with ICEX)", "kind": "institution", "parent": "es", "status": "park", "cite": ["unverified"]},
        {"id": "it", "label": "Italy: market entry", "kind": "ministry", "cite": ["judgement"]},
        {"id": "it-fdg", "label": "Italian SME guarantee fund", "kind": "instrument", "parent": "it", "status": "probe", "cite": ["c8"]},
        {"id": "it-reg", "label": "Emilia-Romagna: agrifood S3 priority", "kind": "regional_body", "parent": "it", "status": "park", "cite": ["c6"]},
        {"id": "it-sab", "label": "Nuova Sabatini (customers)", "kind": "programme", "parent": "it", "status": "probe", "cite": ["c1"]}
      ],
      "cite": ["judgement"]
    }
  ],
  "networks": [
    {
      "id": "money-chain",
      "title": "How the public money reaches you",
      "explains": "The EU fund and the state lender work through your bank; the region lends directly.",
      "nodes": [
        {"id": "n-eif", "label": "European Investment Fund", "kind": "institution", "cite": ["w2"]},
        {"id": "n-min", "label": "Spain's economy ministry", "kind": "ministry", "cite": ["w2"]},
        {"id": "n-ico", "label": "State lender (ICO)", "kind": "institution", "cite": ["w1"]},
        {"id": "n-bank", "label": "Your house bank", "kind": "bank", "cite": ["judgement"]},
        {"id": "n-ivf", "label": "Valencian finance institute", "kind": "institution", "cite": ["unverified"]},
        {"id": "n-you", "label": "You", "kind": "body", "cite": ["judgement"]}
      ],
      "edges": [
        {"from": "n-eif", "to": "n-bank", "kind": "funds", "label": "guarantee, if a signatory", "cite": ["w2"]},
        {"from": "n-min", "to": "n-eif", "kind": "works_with", "label": "signed the 2025 agreements", "cite": ["w2"]},
        {"from": "n-ico", "to": "n-bank", "kind": "funds", "label": "SME line via banks", "cite": ["w1"]},
        {"from": "n-bank", "to": "n-you", "kind": "funds", "label": "working capital line", "cite": ["w1"]},
        {"from": "n-ivf", "to": "n-you", "kind": "funds", "label": "investment loan", "cite": ["unverified"]}
      ],
      "cite": ["w1", "w2"]
    }
  ],
  "risks_flags": [
    {"id": "start-works", "kind": "deal_breaker", "severity": "high", "title": "A deposit before filing can void the aid", "fix": "Deposit only after the February filing.", "cite": ["unverified"]},
    {"id": "ivf-window", "kind": "flag", "severity": "high", "title": "Regional loan first come, first served; closes 31 Dec", "fix": "Confirm budget this week; file early December.", "cite": ["unverified"]},
    {"id": "cumulation", "kind": "flag", "severity": "medium", "title": "Stacking the 2022 grant, the loan and the 2027 grant", "fix": "Find the 2022 resolution; read both calls' stacking clauses.", "cite": ["unverified"]},
    {"id": "branch-form", "kind": "flag", "severity": "medium", "title": "A branch may not count as a capital company for regional calls", "fix": "Ask the region's helpdesk; srl in reserve.", "cite": ["c25", "judgement"]},
    {"id": "pe-risk", "kind": "flag", "severity": "medium", "title": "Regular work in Italy may create a taxable presence", "fix": "Tax adviser before the pilots scale.", "cite": ["unverified"]},
    {"id": "regina-product", "kind": "flag", "severity": "medium", "title": "Product rules for irrigation hardware sold in Italy", "fix": "Handed to Regina for a risk read.", "cite": ["judgement"]},
    {"id": "deal-staffing", "kind": "flag", "severity": "medium", "title": "Installer clause you cannot yet staff", "fix": "Write the clause to the bridge-then-hire model.", "cite": ["judgement"]},
    {"id": "no-precedent", "kind": "flag", "severity": "low", "title": "No precedent found for any main route", "fix": "Lean on the 2022 grant and the distributor contract.", "cite": ["judgement"]}
  ]
}
```
