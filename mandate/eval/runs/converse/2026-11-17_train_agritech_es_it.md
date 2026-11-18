# Simulated conversation: train_agritech_es_it

Case: `mandate/eval/scenarios/train_agritech_es_it.yaml`. Brain: Wincent. Playbooks at 0e9857be5e. 2026-11-17T18:47:36+00:00. 2 turns (script 1/8; stopped: error; client agent called 0x).
Leave-one-out case library: 0 entries left out.

## Turn 1: the founder (opener, script)

> We make smart irrigation kit, 25 people in Valencia. We want to scale production and start in Italy. Is there public money for that?

## Turn 1: Wincent

The short answer is probably yes, at more than one level. Which door opens depends on where the growth physically happens. This is a scale-up plus market-entry case, and Spain and Italy have different gates.

**What your facts already settle.** At 25 people you are almost certainly an SME under the EU definition. That is the test Italy uses for its main equipment-finance scheme (Nuova Sabatini) [c2] (judgement: turnover and group links decide the rest). Your activity also fits the regional innovation strategies of five northern Italian regions: Piemonte, Lombardia, Veneto, Emilia-Romagna and Toscana all list agrifood as a priority [c3][c4][c5][c6][c7].

**Three questions that change the route:**

1. **Where does production scale: Valencia, or a site in Italy?** And does "start in Italy" mean selling through distributors, or your own entity with staff? Italy's money mostly goes to companies established there. Without an Italian entity, the Italian schemes are mainly tools your Italian customers use to buy from you [c1] (judgement).
2. **What will the money pay for, how much, and by when?** Machinery and plant, working capital, or R&D on the next product generation each need a different kind of money.
3. **Are you raising equity now or soon, and who is your main bank?** A round under way makes public co-investment the first move. Your bank decides which state-backed loans can reach you.

**Safe whatever you answer:** don't order equipment or start works before you apply. Starting early can cost you the aid (judgement; I'll confirm it per scheme).

**Not yet:** don't set up an Italian company just to qualify for money.

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale production and enter Italy",
  "stage": "qualify",
  "hierarchies": [
    {
      "id": "field",
      "title": "The field we will work, by level",
      "explains": "Spain carries the production scale-up if it stays in Valencia; Italy opens at national and regional level, mostly to entities established there.",
      "nodes": [
        {"id": "eu", "label": "EU layer (EIB Group, via banks and funds)", "kind": "institution", "status": "probe", "note": "Usually reaches an SME through its own bank or a backed fund.", "cite": ["unverified"]},
        {"id": "es", "label": "Spain: national promotional and innovation agencies", "kind": "ministry", "status": "probe", "note": "To research once we know what the money finances.", "cite": ["unverified"]},
        {"id": "es-vlc", "label": "Comunitat Valenciana: regional finance and innovation bodies", "kind": "regional_body", "parent": "es", "status": "probe", "note": "Your home region: first door if production scales in Valencia.", "cite": ["unverified"]},
        {"id": "it", "label": "Italy: Ministry of Enterprises and Made in Italy", "kind": "ministry", "cite": ["unverified"]},
        {"id": "it-sabatini", "label": "Nuova Sabatini (SME equipment loans and interest grants)", "kind": "programme", "parent": "it", "status": "probe", "note": "Open to SMEs buying productive equipment; a buyer-side tool unless you hold an Italian base.", "cite": ["c1", "c2"]},
        {"id": "it-regions", "label": "Italian regions with agrifood in their S3", "kind": "regional_body", "parent": "it", "status": "probe", "note": "Piemonte, Lombardia, Veneto, Emilia-Romagna, Toscana.", "cite": ["c3", "c4", "c5", "c6", "c7"]}
      ],
      "cite": ["c1", "c3", "judgement"]
    }
  ],
  "risks_flags": [
    {"id": "start-of-work", "kind": "flag", "severity": "high", "title": "Ordering equipment before applying can void aid", "fix": "Hold orders and works until each application is filed; confirm per scheme.", "cite": ["judgement"]},
    {"id": "it-entity", "kind": "flag", "severity": "medium", "title": "No Italian establishment yet", "fix": "Decide the Italy model first (distributor, branch, subsidiary); never incorporate only to chase money.", "cite": ["judgement"]}
  ]
}
```

Sources (all fetched 10 Nov 2026):
- [c1] Italian Decree-Law 69/2013, art. 2 (Nuova Sabatini), normattiva.it, sha e4993c050802
- [c2] Same text, the SME definition clause, sha e4993c050802
- [c3] Piemonte S3, regione.piemonte.it, sha deef31219ada
- [c4] Lombardia S3, regione.lombardia.it, sha 4cc011a6c9e6
- [c5] Veneto S3, regione.veneto.it, sha cafa394bcbcd
- [c6] Emilia-Romagna S3, fesr.regione.emilia-romagna.it, sha 19a5ef72941b
- [c7] Toscana S3, regione.toscana.it, sha 949291ad3b90

## Turn 2: the founder (answer, if_asked)

> Two pilots, Emilia-Romagna is the bigger one with 12 farms, Puglia has 3. No entity yet; we lean to a branch because it is quicker.
> 
> Nothing ordered yet. The supplier wants a deposit in about three months.
> 
> About 2.5 million is the line itself, the rest is working capital and the Italian launch.
> 
> A Spanish national bank. We had one regional innovation grant in 2022, nothing else public.

## Turn 2: Wincent

Three things changed with your answers.

**The deposit date is the trigger.** Valencia's grant for SME industrial investment (INPYME) paid up to 40% of the budget, capped at €200,000, for expanding or modernising an industrial site [w1]. The 2026 window closed on 10 March [w1]. If the 2027 call follows the same calendar, it opens around February, which is exactly when your supplier wants the deposit (unverified; I'll check the official bulletin). Paying the deposit before you file could cost you that grant (judgement).

**The bigger money for the line is a loan.** The Valencian Institute of Finance (IVF) has 2026 lines at a 1.5% fixed rate, from €200,000 to €5M [w2]. They are reported in the press; I'll confirm them on the official page. If the line brings in new process technology, Spain's innovation agency (CDTI) has a part-forgivable loan for exactly that [w3].

**Your branch idea works for Italy.** Italy's SME guarantee fund covers companies with a registered or operating site in Italy [c8]. A registered branch should therefore qualify (judgement). That covers your Italian working capital through an Italian bank.

Two questions:
1. **Is the €2.5M line going into Valencia, and is it new technology or more of the same?** The answer decides between a pure capacity loan and the innovation loan.
2. **Roughly how big are the working capital and the Italian launch, and in which country is each spent?**

```mandate-board
{
  "title": "Smart irrigation maker, Valencia: public money to scale production and enter Italy",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "The field we will work, by level",
      "explains": "The production line sits in Spain and Valencia; the Italian launch opens once a registered branch exists.",
      "nodes": [
        {"id": "eu", "label": "EU layer (EIB Group, via banks and funds)", "kind": "institution", "status": "probe", "note": "Ask whether your Spanish bank carries EU-backed SME lines.", "cite": ["unverified"]},
        {"id": "es", "label": "Spain: national promotional and innovation agencies", "kind": "ministry", "status": "probe", "cite": ["unverified"]},
        {"id": "es-cdti", "label": "CDTI innovation loan (LIC), part non-repayable", "kind": "instrument", "parent": "es", "status": "probe", "note": "Fits only if the line brings new technology.", "cite": ["w3"]},
        {"id": "es-vlc", "label": "Generalitat Valenciana", "kind": "regional_body", "parent": "es", "status": "open", "note": "Your home region; the line sits here.", "cite": ["w1"]},
        {"id": "es-inpyme", "label": "INPYME industrial investment grant", "kind": "instrument", "parent": "es-vlc", "status": "probe", "note": "2026 window closed 10 March; 2027 call to watch before the deposit.", "cite": ["w1"]},
        {"id": "es-ivf", "label": "IVF subsidised loans", "kind": "instrument", "parent": "es-vlc", "status": "probe", "note": "1.5% fixed, 200k to 5M reported; confirm officially.", "cite": ["w2"]},
        {"id": "it", "label": "Italy: Ministry of Enterprises and Made in Italy", "kind": "ministry", "cite": ["unverified"]},
        {"id": "it-fdg", "label": "SME Guarantee Fund (on Italian bank loans)", "kind": "instrument", "parent": "it", "status": "probe", "note": "Needs a registered or operating site in Italy: the branch.", "cite": ["c8"]},
        {"id": "it-sabatini", "label": "Nuova Sabatini (SME equipment loans and interest grants)", "kind": "programme", "parent": "it", "status": "park", "note": "Mainly a buyer-side tool for your Italian customers.", "cite": ["c1"]},
        {"id": "it-er", "label": "Emilia-Romagna (12-farm pilot)", "kind": "regional_body", "parent": "it", "status": "probe", "note": "Agrifood is an S3 priority.", "cite": ["c6"]},
        {"id": "it-pug", "label": "Puglia (3-farm pilot)", "kind": "regional_body", "parent": "it", "status": "park", "note": "Southern schemes target investment sited there.", "cite": ["judgement"]}
      ],
      "cite": ["c8", "w1", "w2", "judgement"]
    }
  ],
  "risks_flags": [
    {"id": "start-of-work", "kind": "deal_breaker", "severity": "high", "title": "The supplier deposit in about three months may count as starting the project", "fix": "File the grant and loan applications before paying anything; check the 2027 INPYME dates.", "cite": ["w1", "judgement"]},
    {"id": "it-entity", "kind": "flag", "severity": "medium", "title": "No Italian establishment yet", "fix": "A registered branch meets the guarantee fund's site test; register it before the Italian bank asks.", "cite": ["c8", "judgement"]}
  ]
}
```

Sources:
- [c8] Italian SME Guarantee Fund operating rules 2023, the final-beneficiary definition, sha 10198c227b8c
- [w1] [PNO Innovation on INPYME 2026](https://www.pnoinnovation.com/es/insights/inpyme-2026-hasta-200-000-e-de-ayuda-para-inversiones-productivas-de-pymes-industriales-en-la-comunitat-valenciana/), retrieved 17 Nov 2026: "Hasta 40% del presupuesto presentado (máximo 200.000 €)"; "Plazo de solicitud: del 16 de febrero al 10 de marzo de 2026". Secondary source; the official text is on [sede.gva.es](https://sede.gva.es/descarregues/2026/02/137020-13.3_GUIA_SOLICITUD_INPYME_2026_cas.pdf).
- [w2] [Valencianews on the 2026 IVF lines](https://valencianews.es/economia/prestamos-ivf-empresas-comunitat-valenciana-liquidez-2026/), retrieved 17 Nov 2026: 1.5% fixed rate, €200,000 to €5M. Press source.
- [w3] [PNO Innovation on CDTI LIC](https://www.pnoinnovation.com/es/financiación/linea-directa-de-innovacion-lic-cdti/), retrieved 17 Nov 2026: a partly repayable loan for applied, near-market projects. Secondary source; to confirm on cdti.es.
