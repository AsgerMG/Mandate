# Loop run: heldout_deeptech_fr_series_a (heldout2)

Case: `mandate/eval/scenarios/heldout_deeptech_fr_series_a.yaml`. Brain: Wincent. Playbooks at d81aeceff9. One-reply re-test on the bench (no API spend), 2026-11-17T08:38:55+00:00, 239.2s.
Leave-one-out case library: 0 entries derived from this case left out; reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We are a French deep-tech company making industrial sensors, 30 people, based near Grenoble. We are closing a EUR 12M Series A with a lead VC in the next three months. What public money should come alongside the round, and what else are we missing?
> 
> More about us, so you can answer in one go: SAS, incorporated 2021, holds the young innovative company status since 2022; we claim the research tax credit. About half the team is R&D. The lead VC has issued a term sheet; we expect to sign in six to ten weeks. First export customers are in Germany; we have no entity outside France. We have never taken a public loan or grant beyond the tax credit.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

# Public money alongside your €12M Series A, and what else you are missing

One note before the answer: I could not reach our internal funding database in this session. Every fact below comes from official or public pages I read today, cited as [wN], or is labelled. I could not search the award records, so no precedent is confirmed.

## The answer

The round is the moment, because public lenders and grant-makers rely on the lead VC's due diligence. Three public sources can come alongside it:

1. **Bpifrance's innovation aid for breakthrough technology.** It is part grant and part 0% advance, up to €2M and up to 45% of eligible costs [w3]. It should pay for your next R&D and industrialisation programme. It is the cheapest money you can get: half is free, and the rest is repaid only if the project reaches the market (unverified).
2. **A Bpifrance matching loan, drawn when the investors come in.** Ceilings of €1M to €2M and the timing rule are reported, not confirmed (unverified). At Series A it may be classed as too late. That makes it a cheap probe, not a plan.
3. **The EU's EIC Accelerator.** It offers a grant of up to €2.5M for work at technology readiness 6 to 8, plus optional equity of €1M to €10M [w1]. You can file the short proposal at any time [w1]. Aim for the 17 March 2027 date [w1].

Germany is a market for you, not a source of funding. With no German entity, the German federal and state programmes are parked (unverified).

## What you are missing

- **A deal-breaker check before you sign.** To keep your young innovative company status, at least 50% of your capital must be held by qualifying holders [w2]. Have counsel test the post-money cap table now. Corporate investors and holding companies need a close look (judgement).
- **The status pays twice.** It also exempts the employer contributions on R&D salaries, capped at €240,300 per establishment per year [w2]. Since 2025 it requires R&D spend of at least 20% of costs [w4]. Are you claiming the payroll exemption today?
- **Grants shrink the research tax credit.** Subsidies are now deducted from the credit's base [w4]. Illustration: say 15 R&D staff cost about €90k each fully loaded. The credit is then roughly €570k a year. A €1M grant on the same costs would cut the credit by about €300k, so you still gain about €700k (judgement). Please send me your real figures.
- **German prospecting cover.** Bpifrance's export prospecting insurance covers 65% of the budget for industrial companies, and at least 30% is repaid whatever happens [w5]. File it before the German sales spend starts (judgement).
- **For Regina, not me.** Three regulatory points: product rules for connected sensors, dual-use export controls, and French foreign-investment screening if the lead VC is not from the EU. That screening can require approval before closing (unverified).

## Order of moves

1. **This week:** see Bpifrance's regional innovation team before signing. Ask for both the innovation aid and the matching loan.
2. **Do not start the funded programme with Series A money before you file.** Starting first can void the aid (unverified).
3. **December:** file the EIC short proposal.
4. **Do not set up a German company to chase subsidies yet** (judgement).

**Does your lead VC's fund have Bpifrance or European Investment Fund money behind it?** That decides whether there is a public equity channel in the round itself.

```mandate-board
{
  "title": "French industrial-sensor deep tech: public money alongside a EUR 12M Series A",
  "stage": "write_up",
  "answer": {
    "lines": [
      "File with Bpifrance before signing: innovation aid (up to EUR 2M) and the matching loan, timed to the round.",
      "Run the EIC Accelerator in parallel: short proposal in December, full proposal for 17 March 2027.",
      "Before signing: confirm the post-money cap table keeps JEI status (50% qualifying holders).",
      "Germany is a market, not a funding source; cover prospecting with Bpifrance export insurance."
    ],
    "confidence": "medium",
    "confidence_why": "Rules read from official and aggregator pages; Bpifrance's own pages could not be fetched and no award precedent was checked.",
    "open_question": "Is the lead VC's fund backed by Bpifrance or the EIF, and what is the post-money cap table?",
    "cite": ["w1", "w2", "w3", "judgement"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "eic", "name": "EIC Accelerator (grant up to EUR 2.5M, equity EUR 1-10M)", "institution": "European Innovation Council", "status": "open", "why": "SMEs in a Member State eligible; short proposal any time; next batching dates in 2027.", "conditions": ["Short proposal GO", "Full proposal to a batching date", "Grant for TRL 6 to 8"], "cite": ["w1"] }
    ] },
    { "id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
      { "id": "bpi-aid", "name": "Bpifrance innovation aid for breakthrough technology", "institution": "Bpifrance", "status": "open", "why": "Grant plus 0% advance, up to EUR 2M, up to 45% of eligible costs, for companies registered in France.", "conditions": ["Breakthrough, high-tech innovation", "File before the programme starts"], "cite": ["w3", "unverified"] },
      { "id": "bpi-match", "name": "Bpifrance matching loan alongside the round", "institution": "Bpifrance", "status": "probe", "why": "Drawn concomitantly with investor entry; ceiling and Series A fit unconfirmed.", "cite": ["unverified"] },
      { "id": "jei", "name": "JEI payroll exemption and research tax credit", "institution": "URSSAF / tax administration", "status": "open", "why": "Status held; exemption capped at EUR 240,300 per establishment per year; R&D at least 20% of costs.", "cite": ["w2", "w4"] },
      { "id": "export", "name": "Bpifrance export prospecting insurance (Germany)", "institution": "Bpifrance Assurance Export", "status": "open", "why": "65% cover for industrial companies, 30% minimum repayment.", "cite": ["w5"] }
    ] },
    { "id": "aura", "level": "regional", "label": "Auvergne-Rhone-Alpes", "country": "FR", "doors": [
      { "id": "aura-calls", "name": "Regional innovation calls and Region loans", "institution": "Region AURA with Bpifrance", "status": "probe", "why": "Smaller tickets; check against the national aid so the same costs are not funded twice.", "cite": ["unverified"] }
    ] },
    { "id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
      { "id": "de-prog", "name": "German federal and state programmes", "institution": "German federal and state bodies", "status": "park", "why": "No German establishment; do not set one up for subsidies.", "cite": ["unverified", "judgement"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "lead", "label": "Bpifrance alongside the round", "steps": [
      { "id": "captable", "label": "Counsel tests post-money cap table against the JEI 50% rule", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["w2"] },
      { "id": "bpi-meet", "label": "Meet Bpifrance regional innovation team: aid and matching loan", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["judgement"] },
      { "id": "bpi-file", "label": "File the innovation aid before the programme starts", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "depends_on": ["bpi-meet"], "cite": ["w3", "unverified"] },
      { "id": "nospend", "label": "Do not start the funded programme with Series A money before filing", "start": 0, "end": 2, "owner": "client", "status": "blocked", "cite": ["unverified"] },
      { "id": "close", "label": "Series A signed; matching loan drawn at investor entry", "start": 2.5, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["captable", "bpi-file"], "cite": ["unverified"] }
    ] },
    { "id": "eu", "label": "EIC Accelerator", "steps": [
      { "id": "eic-short", "label": "Short proposal", "start": 0.5, "end": 1.5, "owner": "client", "status": "planned", "cite": ["w1"] },
      { "id": "eic-full", "label": "Full proposal, 17 March 2027 batch", "start": "2027-03-17", "milestone": true, "owner": "client", "status": "planned", "depends_on": ["eic-short"], "cite": ["w1"] }
    ] },
    { "id": "export", "label": "Germany", "steps": [
      { "id": "ap", "label": "Export prospecting insurance filed before German sales spend", "start": 1, "end": 3, "owner": "client", "status": "planned", "cite": ["w5", "judgement"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-eic", "label": "EIC 2027 batching dates and next work programme", "start": "2027-01-20", "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"] },
      { "id": "w-jei", "label": "JEI regime and payroll exemption in the 2027 finance and social security laws", "start": 1.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["w2", "w4"] },
      { "id": "w-cir", "label": "Research tax credit base, and innovation credit (20%, to end 2027)", "start": 1.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["w4"] },
      { "id": "w-match", "label": "Bpifrance matching loan: Series A fit and current ceiling", "start": 0.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-de", "label": "Germany parked: revisit if a German establishment is planned", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "bpi", "name": "Bpifrance, regional office covering Grenoble", "side": "public-capital", "country": "FR", "units": [
      { "id": "bpi-inno", "name": "Regional innovation team", "roles": [
        { "id": "bpi-dir", "role": "Regional director of innovation", "priority": "P1", "reach": "Warm intro from the lead VC, else the regional office switchboard", "status": "to_approach", "cite": ["judgement"] },
        { "id": "bpi-ca", "role": "Innovation account manager", "priority": "P2", "reach": "Assigned by the director, or Bpifrance online contact form", "status": "to_approach", "cite": ["w3"] }
      ] }
    ] },
    { "id": "region", "name": "Region Auvergne-Rhone-Alpes", "side": "political", "country": "FR", "units": [
      { "id": "reg-eco", "name": "Economy and innovation", "roles": [
        { "id": "reg-vp", "role": "Vice-president for economy and innovation", "priority": "P1", "reach": "Through the regional cluster or the economic directorate", "status": "to_approach", "cite": ["judgement"] },
        { "id": "reg-dir", "role": "Economic development directorate, innovation lead", "priority": "P2", "reach": "Directorate contact line", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "eic", "name": "European Innovation Council", "side": "public-capital", "country": "EU", "units": [
      { "id": "eic-acc", "name": "EIC Accelerator", "roles": [
        { "id": "eic-pm", "role": "EIC programme manager for the relevant portfolio", "priority": "P1", "reach": "After a GO, or at EIC events", "status": "to_approach", "cite": ["judgement"] },
        { "id": "eic-ncp", "role": "French National Contact Point for the EIC", "priority": "P2", "reach": "National contact point desk", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "bpi-ax", "name": "Bpifrance Assurance Export", "side": "public-capital", "country": "FR", "units": [
      { "id": "ax-pro", "name": "Prospecting insurance", "roles": [
        { "id": "ax-head", "role": "Head of prospecting insurance", "priority": "P1", "reach": "Online application on the Bpifrance site", "status": "to_approach", "cite": ["w5"] },
        { "id": "ax-tfe", "role": "Team France Export regional international adviser", "priority": "P2", "reach": "Regional Team France Export office", "status": "to_approach", "cite": ["unverified"] }
      ] }
    ] }
  ] },
  "funding_stack": { "currency": "EUR", "need": { "amount": 12000000, "label": "Series A, next 18 to 24 months" },
    "instruments": [
      { "id": "seriesa", "name": "Series A equity", "type": "equity", "amount": 12000000, "terms": "Carries scale-up, team and the share of aided projects you must fund yourself; dearest money (dilution, VC return targets)", "status": "in_progress", "cite": ["judgement"] },
      { "id": "bpi-aid", "name": "Bpifrance innovation aid", "type": "grant", "amount": 2000000, "terms": "Carries up to 45% of the R&D and industrialisation programme; cheapest (half grant, half 0% advance); reduces the research tax credit base", "status": "planned", "cite": ["w3", "w4"] },
      { "id": "bpi-match", "name": "Bpifrance matching loan", "type": "public_coinvest", "amount": 1000000, "amount_max": 2000000, "terms": "Extends runway without dilution; cheap because public and timed to the investors' diligence", "status": "probe", "cite": ["unverified"] },
      { "id": "eic", "name": "EIC Accelerator grant (equity optional)", "type": "grant", "amount_max": 2500000, "terms": "Carries TRL 6 to 8 innovation work; grant is free money; optional equity is dilutive and touches the JEI cap-table test", "status": "planned", "cite": ["w1", "w2"] },
      { "id": "jei", "name": "JEI payroll exemption plus research tax credit", "type": "grant", "terms": "Carries R&D payroll; exemption up to EUR 240,300 per establishment per year; credit about 30% of the R&D base", "status": "secured", "cite": ["w2", "w4", "unverified"] },
      { "id": "ap", "name": "Export prospecting insurance (Germany)", "type": "guarantee_debt", "terms": "Carries German prospecting cost; 65% advanced for industrial companies, at least 30% repaid", "status": "planned", "cite": ["w5"] }
    ] },
  "risks_flags": [
    { "id": "captable", "kind": "deal_breaker", "severity": "high", "title": "Post-money cap table may break the JEI 50% holder rule", "fix": "Counsel tests the cap table before signing; adjust the vehicles that invest", "cite": ["w2"] },
    { "id": "startwork", "kind": "flag", "severity": "high", "title": "Starting the funded programme before filing can void the aid", "fix": "File with Bpifrance first, then start spending", "cite": ["unverified"] },
    { "id": "cir-base", "kind": "flag", "severity": "medium", "title": "Grants reduce the research tax credit base", "fix": "Model net gain on real payroll figures before choosing the grant scope", "cite": ["w4"] },
    { "id": "regina", "kind": "flag", "severity": "medium", "title": "Regulatory: connected-product rules, dual-use export controls, French foreign-investment screening if the lead VC is not from the EU", "fix": "Handed to Regina; screening could gate the closing", "cite": ["unverified"] },
    { "id": "noprec", "kind": "flag", "severity": "low", "title": "No precedent confirmed for any route", "fix": "Search the Bpifrance and EIC award records before outreach", "cite": ["judgement"] }
  ]
}
```

**Draft to Bpifrance's regional director of innovation (you send it):**

> Objet : Série A de 12 M€ et programme d'industrialisation de capteurs industriels
>
> Madame, Monsieur le Directeur,
>
> [Société] conçoit près de Grenoble des capteurs industriels de rupture. Nous sommes 30, dont la moitié en R&D, et JEI depuis 2022. Nous finalisons une Série A de 12 M€ menée par [fonds], avec une signature prévue d'ici dix semaines. Nos premiers clients export sont en Allemagne.
>
> Ce tour finance l'industrialisation d'une technologie française de capteurs pour l'industrie. Nous souhaitons y associer Bpifrance avant le closing, au service de la souveraineté industrielle que porte France 2030.
>
> Pourriez-vous nous accorder un entretien dans les quinze jours ?
>
> [Nom, fonction, téléphone]

**Questions for you:**
- Who holds the capital after the round, by type of holder? This decides the young innovative company status.
- Does your lead VC's fund have Bpifrance or European Investment Fund money behind it? This decides whether there is a public equity channel.
- What will the next R&D and industrialisation programme cost over 24 months? This sizes the Bpifrance and EIC asks.
- Is your lead VC from outside the EU? If so, Regina checks whether the round needs approval before closing.

**Sources (retrieved 17 Nov 2026)**
- [w1] [EIC Accelerator, official page](https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en): "Grant component up to EUR 2.5M for innovation activities (TRL 6 to 8)"; "Investment component of EUR 1M up to EUR 10M"; "Short proposals, which may be submitted at any time"; batching dates 20/01/2027, 17/03/2027, 01/09/2027, 04/11/2027.
- [w2] [Service-public, JEI](https://entreprendre.service-public.gouv.fr/vosdroits/F31188): "Son capital doit être détenu pour 50 % au minimum par les personnes ou entités suivantes"; "au moins 20 % des charges"; exemption "ne doit pas dépasser 240 300 € par établissement et par année civile".
- [w3] [Infogreffe, Bpifrance innovation aid](https://mesaidespubliques.infogreffe.fr/aides/aide-pour-developpement-innovation): "Subvention : jusqu'à 2 000 000 €"; "couvre jusqu'à 45 % des dépenses éligibles"; "sous forme mixte de subvention et d'avance récupérable". This is an aggregator; Bpifrance's own page refused access.
- [w4] [Deloitte Avocats, 2025 finance laws](https://blog.avocats.deloitte.fr/lf-et-lfss-pour-2025-panorama-des-differentes-mesures-prises-en-matiere-de-fiscalite-de-la-rd/): subsidies "doivent être déduites des bases de calcul de ce crédit"; "le taux de 30 % du CII est abaissé à 20 %"; JEI R&D share "passant de 15 % à 20 %".
- [w5] [les-aides.fr, export prospecting insurance](https://les-aides.fr/aide/V2_f/bpifrance/assurance-prospection.html): "65% pour les entreprises industrielles"; "Le remboursement Forfaitaire Minimum (RFM) est de 30% des indemnités versées".
- The matching loan's terms came only from search summaries, so they are marked unverified. To confirm: [les-aides.fr, matching loan](https://les-aides.fr/aide/OEhf3w/bpifrance/pret-d-amorcage-investissement.html), or ask Bpifrance directly.
