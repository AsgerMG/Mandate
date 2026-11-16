# Loop run: heldout_deeptech_fr_series_a (measure)

Case: `mandate/eval/scenarios/heldout_deeptech_fr_series_a.yaml`. Brain: Wincent. Playbooks at 65b8f72925. One-reply re-test on the bench (no API spend), 2026-11-13T09:34:44+00:00, 274.3s.
Leave-one-out case library: 0 entries derived from this case left out; reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We are a French deep-tech company making industrial sensors, 30 people, based near Grenoble. We are closing a EUR 12M Series A with a lead VC in the next three months. What public money should come alongside the round, and what else are we missing?
> 
> More about us, so you can answer in one go: SAS, incorporated 2021, holds the young innovative company status since 2022; we claim the research tax credit. About half the team is R&D. The lead VC has issued a term sheet; we expect to sign in six to ten weeks. First export customers are in Germany; we have no entity outside France. We have never taken a public loan or grant beyond the tax credit.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

I checked France's innovation-aid rules, Bpifrance's loan and export products, the EU's deep-tech scheme and the French young innovative company (JEI) rules. Germany's own rules I did not check.

## Answer

Three pieces of public money can come with this round. Here they are in order of priority.

1. **The Bpifrance loan that comes with a funding round.** It is an unsecured 8-year loan with 36 months before you repay any capital [w1]. It is for companies under 8 years old, so you qualify. It runs from €100k to €1M, or €2M by exception, and is capped at half the new equity [w1]. On €12M only the €1M/€2M ceiling binds. It is meant for the moment a round "comes through" [w1]. Your investors' checks are your proof, so ask for it at close (judgement).
2. **An R&D grant plus repayable advance from Bpifrance, for the next R&D programme.** Two options:
   - i-Nov: projects of €1-5M [c12], up to 45% of costs for a small company [c9], at most 60% as grant [c11].
   - Bpifrance's deep-tech development aid: reported up to €2M at 45% (unverified; the Bpifrance page blocked me, so confirm with the regional office).
   
   On a €4M programme that is about €1.8M (illustration; I need your real budget). Pick one per project. Do not start the work before you file (judgement: starting first can void the aid).
3. **EIC Accelerator, the EU deep-tech scheme.** A grant up to €2.5M, plus €1-10M of equity [w3]. You can send the short proposal at any time. The 2027 full-proposal dates are 20 Jan, 17 Mar, 1 Sep and 4 Nov [w3]. Aim for March and do not hold the close for it (judgement).

Together that could be about €3-5M of non-dilutive money on top of €12M (judgement).

## What you are missing

- **Germany: an export advance you must sign before spending.** Bpifrance's export prospecting insurance:
  - It covers 65% of your German sales budget, from €30k [w4].
  - Half is paid when the contract is signed, and only spending after signature counts [w4].
  - You repay at least 30% whatever happens, more if German sales come in [w4].
  
  Sign it before you hire German sales staff or book trade fairs. German federal or regional money is parked until you have a German entity (unverified). Do not set one up just to chase it.
- **Your JEI status can lapse as you grow.** R&D must stay at 20% or more of your costs [w5]. Series A sales hiring can push it below that. Model this year by year.
- **Cap-table and SME traps.**
  - The round loan excludes companies majority-held by investment funds that are linked to each other [w1]. Check the post-money cap table now.
  - i-Nov requires EU SME status both at filing and at signing [c7]. VC holdings can affect that test (unverified; confirm).
- **Tax credit.** Public grants reduce your research tax credit base on the same costs (unverified; confirm with your tax adviser).
- **Auvergne-Rhône-Alpes region.** France 2030 regional innovation advances and a regional industry loan are listed on aid aggregators (unverified). They are worth a probe once the Bpifrance meeting is set.
- **Regulation, for Regina.** If the sensors are wireless, dual-use or sold to defence customers, Regina should check export control and CE marking before German sales grow.

## Precedents

- i-Nov: EnerBee received €795,744 (public award register: data.enseignementsup-recherche.gouv.fr, fr-esr-laureats-concours-i-nov). I believe EnerBee is a Grenoble sensor company (unverified).
- EIC, the round loan and the export insurance: I found no precedent in our award records. Ask Bpifrance for comparable deals.

## Decisions for you

1. Ask for the round loan at close: yes (judgement).
2. Pick the R&D vehicle for the next programme: i-Nov or the deep-tech aid. My lean is the deep-tech aid if your technology is at TRL 4 or above (judgement).
3. Send the EIC short proposal in December.

**Draft to the Bpifrance Grenoble office, to its head of innovation:**

> Madame, Monsieur,
> [Company], fabricant grenoblois de capteurs industriels deeptech (JEI, 30 personnes dont la moitié en R&D), finalise une série A de 12 M€ menée par [fonds], signature prévue d'ici [date]. Nos premiers clients export sont en Allemagne. Nous souhaitons préparer avec vos équipes le prêt d'amorçage investissement et le financement de notre prochain programme de R&D, avant son lancement. Seriez-vous disponible pour un échange dans les quinze prochains jours ?
> [Nom, fonction]

## Questions for you

1. How big is the next R&D programme, when does it start, and what TRL is the technology at? This decides which R&D vehicle fits and how much it brings.
2. What will the post-money cap table look like: how many funds, and are they linked? This decides whether you can get the round loan.
3. What is your German go-to-market budget for the next two years? This sizes the export advance.

```mandate-board
{
  "title": "French deep-tech sensors: public money alongside a EUR 12M Series A",
  "stage": "write_up",
  "answer": {
    "lines": [
      "At close: Bpifrance's InvestEU-backed seed-investment loan, up to EUR 1M (2M by exception), unsecured, 36-month deferral.",
      "Before the next R&D programme starts: i-Nov or Bpifrance's deep-tech development aid, one per project.",
      "EIC Accelerator short proposal now, full proposal 17 March 2027; do not hold the close for it.",
      "Germany: sign Bpifrance export prospecting insurance before spending on German sales; German support parked."
    ],
    "confidence": "medium",
    "confidence_why": "Eligibility read from the products; deep-tech aid and regional terms not confirmed on official pages.",
    "open_question": "Size and start date of the next R&D programme, and the post-money cap table.",
    "cite": ["w1", "c12", "w3", "w4"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "eic", "name": "EIC Accelerator", "institution": "European Innovation Council", "status": "open", "why": "Grant up to EUR 2.5M plus EUR 1-10M equity; short proposal any time.", "conditions": ["SME established in a Member State", "Short proposal GO before full proposal", "2027 cut-offs 20 Jan, 17 Mar, 1 Sep, 4 Nov"], "cite": ["w3"] }
    ] },
    { "id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
      { "id": "pai", "name": "Seed-investment loan (InvestEU)", "institution": "Bpifrance", "status": "open", "why": "Under 8 years old; up to half the equity raised; EUR 100k to 1M (2M by exception).", "conditions": ["Raise from professional investors", "Not majority-held by linked investment funds", "Not in difficulty"], "cite": ["w1"] },
      { "id": "inov", "name": "i-Nov innovation contest", "institution": "Bpifrance", "status": "open", "why": "Single-company R&D project of EUR 1-5M carried out in France.", "conditions": ["EU SME at filing and signing", "Up to 45% intensity, at most 60% grant", "Work in France"], "cite": ["c12", "c9", "c11", "c7", "c4"] },
      { "id": "deeptech", "name": "Deep-tech development aid", "institution": "Bpifrance", "status": "probe", "why": "Reported up to EUR 2M at 45%, mixed grant and advance; official page not read.", "cite": ["unverified"] },
      { "id": "ap", "name": "Assurance prospection (Germany)", "institution": "Bpifrance Assurance Export", "status": "open", "why": "65% of a prospecting budget from EUR 30k; spending counted from contract signature.", "conditions": ["Turnover under EUR 500M", "Sign before spending"], "cite": ["w4"] },
      { "id": "jei", "name": "JEI social-charge exemption", "institution": "URSSAF / tax administration", "status": "open", "why": "Held; needs R&D at 20% or more of costs each year.", "cite": ["w5"] }
    ] },
    { "id": "aura", "level": "regional", "label": "Auvergne-Rhône-Alpes", "country": "FR", "doors": [
      { "id": "aura-f2030", "name": "France 2030 regional innovation advances; regional industry loan", "institution": "Région AURA with Bpifrance", "status": "probe", "why": "Listed by aid aggregators; terms not confirmed on official pages.", "cite": ["unverified"] }
    ] },
    { "id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
      { "id": "de-support", "name": "German federal and Land support", "institution": "German promotional banks", "status": "park", "why": "No German establishment; German rules not researched here.", "cite": ["unverified"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "round", "label": "Round and loan", "steps": [
      { "id": "captable", "label": "Check post-money cap table against the linked-funds exclusion and SME test", "start": 0, "end": 0.5, "owner": "client", "status": "planned", "cite": ["w1", "c7"] },
      { "id": "bpi-meet", "label": "Meet Bpifrance Grenoble innovation team: loan and R&D aid", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"] },
      { "id": "close", "label": "Series A signed", "start": 2, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"] },
      { "id": "pai-file", "label": "File seed-investment loan on the closed round", "start": 2, "end": 3, "owner": "client", "status": "planned", "depends_on": ["close", "captable"], "cite": ["w1"] }
    ] },
    { "id": "rd", "label": "R&D aid", "steps": [
      { "id": "rd-file", "label": "File i-Nov or deep-tech aid for next programme", "start": 1, "end": 3, "owner": "client", "status": "planned", "depends_on": ["bpi-meet"], "cite": ["c12", "unverified"] },
      { "id": "rd-start", "label": "Do not start the programme before filing", "start": 3, "milestone": true, "owner": "client", "status": "blocked", "depends_on": ["rd-file"], "cite": ["judgement"] },
      { "id": "eic-short", "label": "EIC short proposal", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["w3"] },
      { "id": "eic-full", "label": "EIC full proposal, 17 March 2027 cut-off", "start": "2027-03-17", "milestone": true, "owner": "client", "status": "planned", "depends_on": ["eic-short"], "cite": ["w3"] }
    ] },
    { "id": "export", "label": "Germany", "steps": [
      { "id": "ap-sign", "label": "Sign export prospecting insurance contract", "start": 1, "end": 3, "owner": "client", "status": "planned", "cite": ["w4"] },
      { "id": "de-hire", "label": "German hires and fairs only after contract signature", "start": 3, "milestone": true, "owner": "client", "status": "blocked", "depends_on": ["ap-sign"], "cite": ["w4"] },
      { "id": "de-entity", "label": "German entity: not yet, only if the market case needs it", "start": 12, "milestone": true, "owner": "client", "status": "blocked", "cite": ["judgement"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-jei", "label": "JEI 20% R&D test as sales hiring grows", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["w5"] },
      { "id": "w-eic", "label": "EIC 2027 cut-offs and work programme", "start": "2027-01-20", "milestone": true, "owner": "us", "status": "planned", "cite": ["w3"] },
      { "id": "w-investeu", "label": "InvestEU backing of the seed-investment loan as InvestEU moves into the next EU programme", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["w1", "unverified"] },
      { "id": "w-inov", "label": "Next i-Nov wave and its deadline", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-aura", "label": "AURA France 2030 regional envelopes", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-de", "label": "Germany support parked: reopen if a German entity is created", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-fin", "label": "2027 finance law: research tax credit and JEI changes", "start": 1.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "bpi", "name": "Bpifrance, Grenoble regional office", "side": "public-capital", "country": "FR", "units": [
      { "id": "bpi-innov", "name": "Innovation and loans", "roles": [
        { "id": "bpi-head", "role": "Regional head of innovation", "priority": "P1", "reach": "Warm intro from the lead VC, or the office switchboard", "status": "to_approach", "cite": ["judgement"] },
        { "id": "bpi-ca", "role": "Innovation account manager", "priority": "P2", "reach": "Forwarded by the head, or the online request form", "status": "to_approach", "cite": ["w1"] }
      ] }
    ] },
    { "id": "bpi-ae", "name": "Bpifrance Assurance Export", "side": "public-capital", "country": "FR", "units": [
      { "id": "ae-unit", "name": "Regional export team", "roles": [
        { "id": "ae-head", "role": "Regional international director", "priority": "P1", "reach": "Through the regional office", "status": "to_approach", "cite": ["w4"] },
        { "id": "ae-ca", "role": "International account manager", "priority": "P2", "reach": "Online application", "status": "to_approach", "cite": ["w4"] }
      ] }
    ] },
    { "id": "eic", "name": "European Innovation Council", "side": "public-capital", "country": "EU", "units": [
      { "id": "eic-unit", "name": "EIC Accelerator", "roles": [
        { "id": "eic-pm", "role": "Programme manager for the relevant technology portfolio", "priority": "P1", "reach": "Through the call process", "status": "to_approach", "cite": ["judgement"] },
        { "id": "eic-ncp", "role": "French national contact point for the EIC", "priority": "P2", "reach": "National contact point desk", "status": "to_approach", "cite": ["unverified"] }
      ] }
    ] },
    { "id": "aura", "name": "Région Auvergne-Rhône-Alpes", "side": "political", "country": "FR", "units": [
      { "id": "aura-eco", "name": "Economy and innovation", "roles": [
        { "id": "aura-vp", "role": "Regional vice-president for economy and innovation", "priority": "P1", "reach": "Office of the vice-president, once Bpifrance is engaged", "status": "to_approach", "cite": ["judgement"] },
        { "id": "aura-dir", "role": "Head of the economic development directorate", "priority": "P2", "reach": "Directorate contact line", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "vc", "name": "Lead VC", "side": "market", "country": "FR", "units": [
      { "id": "vc-deal", "name": "Deal team", "roles": [
        { "id": "vc-partner", "role": "Lead partner", "priority": "P2", "reach": "Direct; ask for an intro to Bpifrance", "status": "engaged", "cite": ["judgement"] }
      ] }
    ] }
  ] },
  "funding_stack": { "currency": "EUR", "need": { "amount": 12000000, "label": "Series A, plus non-dilutive top-up" },
    "instruments": [
      { "id": "seriesa", "name": "Series A equity", "type": "equity", "amount": 12000000, "terms": "Carries scale-up and hiring; dearest money because of dilution and VC target returns", "status": "in_progress", "cite": ["judgement"] },
      { "id": "pai", "name": "Seed-investment loan (InvestEU)", "type": "loan", "amount": 1000000, "amount_max": 2000000, "terms": "Carries working capital; cheap because unsecured and backed by the EU, with a 36-month deferral; 5% retention, 0.4% fee", "status": "planned", "cite": ["w1"] },
      { "id": "rdaid", "name": "i-Nov or deep-tech aid", "type": "grant", "amount": 1000000, "amount_max": 2000000, "terms": "Carries R&D programme costs; cheapest money, part grant and part zero-rate advance; one per project; reduces the research tax credit base", "status": "planned", "cite": ["c9", "c11", "unverified"] },
      { "id": "eic", "name": "EIC Accelerator", "type": "grant", "amount_max": 2500000, "terms": "Grant carries TRL 6-8 innovation; the optional equity part dilutes like VC money", "status": "probe", "cite": ["w3"] },
      { "id": "ap", "name": "Export prospecting insurance", "type": "guarantee_debt", "terms": "Carries German go-to-market costs; cheap because repaid partly on success, minimum 30%", "status": "planned", "cite": ["w4"] },
      { "id": "jei", "name": "JEI exemption and research tax credit", "type": "grant", "terms": "Carries R&D payroll; already in place; keep the 20% R&D test", "status": "secured", "cite": ["w5"] }
    ] },
  "process_maps": [
    { "id": "pai-map", "title": "Seed-investment loan at close", "steps": [
      { "id": "p1", "label": "Term sheet signed, cap table final", "actor": "Company and lead VC", "kind": "document", "cite": ["judgement"] },
      { "id": "p2", "label": "Request filed with Bpifrance", "actor": "Bpifrance regional office", "kind": "step", "cite": ["w1"] },
      { "id": "p3", "label": "Credit decision: raise from professional investors, eligibility exclusions", "actor": "Bpifrance", "kind": "decision", "cite": ["w1"] },
      { "id": "p4", "label": "Disbursement, 5% retention", "actor": "Bpifrance", "kind": "step", "cite": ["w1"] }
    ],
    "leverage": [
      { "id": "l1", "kind": "door_opener", "on": "p2", "why": "The lead VC's diligence is the proof Bpifrance relies on", "how": "Lead partner introduces the regional head of innovation", "side": "market", "cite": ["judgement"] },
      { "id": "l2", "kind": "blocker", "on": "p3", "why": "Majority held by linked investment funds excludes the company", "how": "Check post-money ownership before signing", "side": "public-capital", "cite": ["w1"] }
    ] }
  ],
  "risks_flags": [
    { "id": "r-funds", "kind": "deal_breaker", "severity": "high", "title": "Loan excluded if majority-held by linked funds", "fix": "Check the post-money cap table before signing", "cite": ["w1"] },
    { "id": "r-start", "kind": "deal_breaker", "severity": "high", "title": "Starting R&D or German spending before filing", "fix": "File R&D aid before the programme starts; sign export insurance before German spending", "cite": ["w4", "judgement"] },
    { "id": "r-sme", "kind": "flag", "severity": "medium", "title": "EU SME status after the VC round", "fix": "Confirm SME test at filing and signing of i-Nov", "cite": ["c7", "unverified"] },
    { "id": "r-jei", "kind": "flag", "severity": "medium", "title": "JEI lapses if R&D falls below 20% of costs", "fix": "Model R&D share yearly as sales hiring grows", "cite": ["w5"] },
    { "id": "r-cir", "kind": "flag", "severity": "low", "title": "Grants reduce the research tax credit base", "fix": "Confirm with your tax adviser", "cite": ["unverified"] },
    { "id": "r-reg", "kind": "flag", "severity": "medium", "title": "Wireless, dual-use or defence use of sensors", "fix": "Hand to Regina for export control and CE marking", "cite": ["judgement"] }
  ]
}
```

## Sources

**Cited, from our records**
- [c2], [c4], [c7], [c9], [c11], [c12]: i-Nov rules (cahier des charges, wave 14), Bpifrance; sha256 b6ffd3225bff.

**From the web, retrieved 13 Nov 2026**
- [w1] [Bpifrance seed-investment loan (InvestEU), les-aides.fr product sheet](https://les-aides.fr/aide/OEhf3w/bpifrance.pret-d-amorcage-investissement.pdf). Quotes: "compris entre 100 000 € et 1M € (2M € si dérogation)"; "à la moitié de l'augmentation de fonds propres réalisée"; "détenues majoritairement par un ou plusieurs fonds d'investissement liés entre eux"; "différé d'amortissement de 36 mois".
- [w3] [EIC Accelerator, official page](https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en). Quotes: "Grant component up to EUR 2.5M"; "Investment component of EUR 1M up to EUR 10M"; 2027 dates "20/01/2027, 17/03/2027, 01/09/2027, and 04/11/2027".
- [w4] [Bpifrance Assurance Prospection summary (PDF)](https://assurance-export.bpifrance.fr/storage/sites/26/2025/06/Synthese-Assurance-Prospection_022024.pdf). Quotes: "DÈS 30 000 €"; "Quotité Garantie de 65 %"; "1er versement de 50 % à la signature du contrat"; "Date de prise en compte des dépenses / Signature du contrat"; "minimum de 30 %".
- [w5] [Service-public, JEI page](https://entreprendre.service-public.gouv.fr/vosdroits/F31188). Quote: "dépenses de R&D représentant au moins 20 % des charges".
- Third-party pages for the deep-tech aid and the regional products (unverified): [tpeactu.fr](https://tpeactu.fr/2025/01/15/quest-ce-que-laide-au-developpement-deeptech-aad/), [les-aides.fr, Prêt Région Industrie](https://les-aides.fr/aide/c0mP3w/region-auvergne-rhone-alpes/pret-region-industrie.html).
