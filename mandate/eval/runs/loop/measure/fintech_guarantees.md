# Loop run: fintech_guarantees (measure)

Case: `mandate/eval/scenarios/fintech_guarantees.yaml`. Brain: Wincent. Playbooks at 15139db26a. One-reply re-test on the bench (no API spend), 2026-11-16T09:43:02+00:00, 258.1s.
Leave-one-out case library: 5 entries derived from this case left out (fintech_eu_open_door, fintech_eu_product_fits_activity, fintech_research_mechanics_not_instinct, fintech_shut_door_reform, fintech_status_unlocks_market); reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We are a fintech lender. We have raised EUR 40M. We want our SME loan portfolio guaranteed by public guarantee schemes in Germany, France and Italy, and at EU level. We do not have a banking licence. What are our routes?
> 
> More about us, so you can answer in one go: We are a German GmbH with no branches yet in France or Italy. We hold no banking, payment or investment-firm licence. We originate SME loans through our platform and fund them from a EUR 150M warehouse facility; the book is EUR 120M today and we want to reach EUR 500M in three years. We are not raising equity right now.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

I've worked the case across all four levels. One thing to settle before anything else, and it may change the German answer: **who is the lender of record on your loans?**

## The answer

**Start at EU level.** It is the only door open to you as you are today. The European Investment Fund (EIF) takes applications under InvestEU, and for guarantees it names "alternative lenders" as eligible, next to credit institutions [c19]. That covers lenders established or operating in any EU member state [c18]. Applications close on 30 June 2027 and may close earlier [c17]. One agreement covers Germany, France and Italy at once (judgement).

**Italy is the second route, and it needs a status.** Italy's state guarantee fund for SMEs guarantees portfolios of loans. The lender applies, after accreditation, and lenders registered under Article 106 of Italy's banking law (TUB) count as lenders for this [c10][c11].
- Getting that registration requires an Italian registered office and head office [c14], minimum capital [c15], and a company whose only business is lending [c16].
- That means an Italian subsidiary. Treat it as a plan step, not a reason to drop Italy.
- Italy also reserves lending to the public to authorised lenders [c13]. So the Article 106 registration answers both questions: whether you may lend in Italy, and whether you can use the fund.

**Germany is shut to you as a non-bank.** The German guarantee banks guarantee loans made by a "Kreditgeber", which their terms define as a credit institution, building society or insurer [w2]. No German route is open to you today.

**France is shut on the evidence I found.** Bpifrance's guarantee "only benefits the financial institution" that makes the loan [w4]. It covers 40 to 70% of each loan [w4] (unverified that this is still current).

## The money logic (illustrative, please send real numbers)

The guarantee does not bring cash. Its value is that your warehouse lender can advance more per euro of loans (judgement).
- **Assumption:** the warehouse lends 85% of each loan's value. You fund the other 15% from equity.
- **Equity needed:** a €500M book then needs about €75M of your equity. You have raised €40M.
- **With a guarantee:** if the senior lender moves to 90% on the guaranteed loans, you need €50M of equity instead of €75M. That frees about €25M without raising (judgement).
- **What I need:** your actual advance rate and loss rate.

## Precedent

- **Found:** the EIF backed Froda, which calls itself "one of Europe's fastest-growing fintech scaleups", under InvestEU's micro-loan guarantee product [w1].
- **Not found:** our award records hold no EIF deal for a fintech SME lender [checked]. You would be close to the first of your kind for the main SME product, so the case needs to be strong.

## What not to do yet

Do not set up the Italian company or apply for French status until the EIF has said which entity it would contract with (judgement).

## For Regina (regulatory, one line each)

1. How do you lend in Germany without a licence? Commercial lending normally needs a BaFin licence (unverified).
2. Can you lend in France at all without being a credit institution or a licensed finance company there (unverified)?

**The one question that decides most of this:** is your GmbH the lender of record, or does a partner ("fronting") bank sign the loans and sell them to you? If a fronting bank signs, that bank can be the one that applies for the German guarantee and, possibly, the EIF guarantee.

```mandate-board
{
  "title": "Non-bank SME lender: public guarantees on the loan book (DE, FR, IT, EU)",
  "stage": "write_up",
  "answer": {
    "lines": [
      "Lead with the EIF's InvestEU guarantee: it names alternative lenders and covers all three markets in one agreement.",
      "Italy: get Article 106 registration through an Italian subsidiary, then accreditation with the state guarantee fund for portfolio guarantees.",
      "Germany and France: no route today for a non-bank. Germany becomes a lobby aim; France is to confirm."
    ],
    "confidence": "medium",
    "confidence_why": "EU eligibility is cited; product fit and who signs depend on who is lender of record.",
    "open_question": "Is the GmbH the lender of record, or does a fronting bank sign the loans?",
    "cite": ["c19", "c17", "c10", "c11", "w2", "w4"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "eu-investeu-smec", "name": "InvestEU SME Competitiveness Portfolio Guarantee", "institution": "European Investment Fund", "status": "open", "why": "Eligible guarantee intermediaries include alternative lenders.", "conditions": ["Application by 30 June 2027, may close earlier", "EIF selection, then a guarantee agreement", "Product fit to average loan size to confirm"], "cite": ["c19", "c17", "c20", "w3"] },
      { "id": "eu-investeu-micro", "name": "InvestEU Microfinance guarantee product", "institution": "European Investment Fund", "status": "probe", "why": "Fits only if the loans are micro-loans; Froda precedent.", "cite": ["w1", "judgement"] },
      { "id": "eu-warehouse-ce", "name": "EIF credit enhancement on the warehouse", "institution": "European Investment Fund", "status": "probe", "why": "InvestEU may back capital-market instruments and credit enhancement.", "cite": ["c21", "unverified"] }
    ] },
    { "id": "it", "level": "national", "label": "Italy", "country": "IT", "doors": [
      { "id": "it-fdg-portfolio", "name": "State guarantee fund for SMEs: portfolio guarantee", "institution": "Mediocredito Centrale / MIMIT", "via": "Article 106 TUB lender, after accreditation", "status": "probe", "why": "Open to Article 106 lenders; you need an Italian subsidiary first.", "conditions": ["Italian registered office and head office", "Minimum capital set by Banca d'Italia", "Company whose only business is lending", "Accreditation with the fund"], "cite": ["c10", "c11", "c14", "c15", "c16"] },
      { "id": "it-fdg-direct", "name": "State guarantee fund for SMEs: direct guarantee per loan", "institution": "Mediocredito Centrale", "status": "probe", "why": "The same status opens per-loan cover.", "cite": ["c7", "c8", "c9"] }
    ] },
    { "id": "de", "level": "national", "label": "Germany (federal and Land)", "country": "DE", "doors": [
      { "id": "de-bb", "name": "Guarantee banks with federal and Land counter-guarantee", "institution": "Bürgschaftsbanken", "via": "lender must be a credit institution, building society or insurer", "status": "shut", "why": "Non-bank lender is not an eligible Kreditgeber; reopens only via a fronting bank.", "cite": ["w2"] }
    ] },
    { "id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
      { "id": "fr-bpi", "name": "Bpifrance guarantee (40-70%)", "institution": "Bpifrance", "via": "financial institutions only", "status": "shut", "why": "Benefits only the financial institution that lends; exact status needed to confirm.", "cite": ["w4", "unverified"] }
    ] },
    { "id": "lobby", "level": "lobby", "label": "Lobby aims", "doors": [
      { "id": "lobby-de", "name": "Admit licensed or EIF-backed non-bank lenders as Kreditgeber", "institution": "Guarantee banks association; federal economy ministry", "status": "park", "why": "Long term; no reform found that is moving.", "cite": ["judgement"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "eu-track", "label": "EU lead route", "steps": [
      { "id": "facts", "label": "Confirm lender of record, loan size, loss rate, advance rate", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"] },
      { "id": "eif-probe", "label": "Short note to the EIF guarantees team", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "depends_on": ["facts"], "cite": ["judgement"] },
      { "id": "eif-app", "label": "InvestEU application under the call", "start": 1, "end": 4, "owner": "client", "status": "planned", "depends_on": ["eif-probe"], "cite": ["c20", "c17"] },
      { "id": "eif-sign", "label": "Guarantee agreement signed", "start": 9, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["eif-app"], "cite": ["c20", "judgement"] }
    ] },
    { "id": "it-track", "label": "Italy status route", "steps": [
      { "id": "it-decide", "label": "Decide on the Italian subsidiary; do not incorporate before EIF feedback", "start": 2, "end": 3, "owner": "client", "status": "blocked", "depends_on": ["eif-probe"], "cite": ["judgement"] },
      { "id": "it-106", "label": "Banca d'Italia authorisation and entry in the Article 106 register", "start": 3, "end": 12, "owner": "client", "status": "planned", "depends_on": ["it-decide"], "cite": ["c14", "c15", "c16", "unverified"] },
      { "id": "it-accr", "label": "Accreditation with the state guarantee fund, then portfolio request", "start": 12, "end": 15, "owner": "client", "status": "planned", "depends_on": ["it-106"], "cite": ["c11"] }
    ] },
    { "id": "de-fr-track", "label": "Germany and France", "steps": [
      { "id": "regina-q", "label": "Regina: German lending permission and French lending monopoly", "start": 0, "end": 1, "owner": "us", "status": "planned", "cite": ["judgement"] },
      { "id": "fronting", "label": "If a fronting bank signs: ask it to apply to the guarantee bank and Bpifrance", "start": 1, "end": 3, "owner": "client", "status": "planned", "depends_on": ["facts"], "cite": ["w2", "w4", "judgement"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-investeu-close", "label": "InvestEU application deadline (may close earlier)", "start": "2027-06-30", "milestone": true, "owner": "us", "status": "planned", "cite": ["c17"] },
      { "id": "w-investeu-next", "label": "InvestEU successor in the next EU budget: alternative lenders kept?", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-fdg-reform", "label": "Italian guarantee fund 2027 reform of cover per risk class", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-de-abb", "label": "German guarantee bank terms and counter-guarantee renewal: Kreditgeber definition", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["w2", "unverified"] },
      { "id": "w-fr-bpi", "label": "Bpifrance lender eligibility and state budget for guarantee funds", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "eif", "name": "European Investment Fund", "side": "public-capital", "country": "EU", "units": [
      { "id": "eif-g", "name": "Guarantees and alternative lending", "roles": [
        { "id": "eif-p1", "role": "Head of the InvestEU debt and guarantee products", "priority": "P1", "reach": "Call contact on the InvestEU guarantee page", "status": "to_approach", "cite": ["w3", "judgement"] },
        { "id": "eif-p2", "role": "Investment officer covering Germany and alternative lenders", "priority": "P2", "reach": "Forwarded by P1", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "ecfin", "name": "European Commission, InvestEU unit", "side": "political", "country": "EU", "units": [
      { "id": "ecfin-u", "name": "Unit running InvestEU", "roles": [
        { "id": "ecfin-p1", "role": "Head of unit for InvestEU", "priority": "P1", "reach": "Unit mailbox", "status": "to_approach", "cite": ["unverified"] },
        { "id": "ecfin-p2", "role": "Lead MEP on the InvestEU successor", "priority": "P2", "reach": "MEP office, after transparency-register entry", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "mcc", "name": "Mediocredito Centrale, state guarantee fund for SMEs", "side": "public-capital", "country": "IT", "units": [
      { "id": "mcc-u", "name": "Fund management", "roles": [
        { "id": "mcc-p1", "role": "Head of the guarantee fund's management", "priority": "P1", "reach": "Fund's official contact channel", "status": "to_approach", "cite": ["judgement"] },
        { "id": "mcc-p2", "role": "Head of accreditation and portfolio operations", "priority": "P2", "reach": "Forwarded by P1", "status": "to_approach", "cite": ["c11", "judgement"] }
      ] }
    ] },
    { "id": "mimit", "name": "Italian business ministry (MIMIT), business incentives", "side": "political", "country": "IT", "units": [
      { "id": "mimit-u", "name": "Directorate for business incentives", "roles": [
        { "id": "mimit-p1", "role": "Director-general for incentives", "priority": "P1", "reach": "Directorate secretariat", "status": "to_approach", "cite": ["unverified"] },
        { "id": "mimit-p2", "role": "Head of division for the guarantee fund", "priority": "P2", "reach": "Forwarded by P1", "status": "to_approach", "cite": ["unverified"] }
      ] }
    ] },
    { "id": "de-bb", "name": "German guarantee banks association and federal economy ministry", "side": "political", "country": "DE", "units": [
      { "id": "de-u", "name": "Unit owning the guarantee-bank counter-guarantees", "roles": [
        { "id": "de-p1", "role": "Head of the federal unit for guarantee-bank counter-guarantees", "priority": "P1", "reach": "Ministry unit mailbox", "status": "to_approach", "cite": ["unverified"] },
        { "id": "de-p2", "role": "Managing director, guarantee banks association", "priority": "P2", "reach": "Association office", "status": "to_approach", "cite": ["w2", "judgement"] }
      ] }
    ] },
    { "id": "bpi", "name": "Bpifrance and French Treasury", "side": "public-capital", "country": "FR", "units": [
      { "id": "bpi-u", "name": "Bpifrance guarantees and bank partnerships", "roles": [
        { "id": "bpi-p1", "role": "Head of guarantees and bank partnerships", "priority": "P1", "reach": "Bpifrance head office", "status": "to_approach", "cite": ["unverified"] },
        { "id": "bpi-p2", "role": "Treasury office for business financing", "priority": "P2", "reach": "Treasury switchboard", "status": "to_approach", "cite": ["unverified"] }
      ] }
    ] }
  ] },
  "funding_stack": { "currency": "EUR", "need": { "amount": 500000000, "label": "Target loan book in three years" },
    "instruments": [
      { "id": "equity", "name": "Equity raised", "type": "equity", "amount": 40000000, "terms": "Carries the first-loss slice under the warehouse; dearest money because investors expect a high return", "status": "secured", "cite": ["judgement"] },
      { "id": "warehouse", "name": "Warehouse facility", "type": "loan", "amount": 150000000, "terms": "Carries the senior share of each loan; cheap per euro, but its advance rate sets how much equity you need", "status": "secured", "cite": ["judgement"] },
      { "id": "eif-g", "name": "InvestEU portfolio guarantee", "type": "guarantee_debt", "terms": "No cash; takes part of the loan losses, so the warehouse can advance more and equity goes further. About 25M of equity freed at 500M if the advance rate goes from 85% to 90%", "status": "probe", "cite": ["c19", "judgement"] },
      { "id": "it-fdg", "name": "Italian state guarantee fund on the Italian book", "type": "guarantee_debt", "terms": "Same risk transfer on the Italian loans; not before Article 106 registration", "status": "planned", "cite": ["c10", "c11"] }
    ] },
  "process": [
    { "id": "cover", "title": "How the guarantee lowers your cost of growth", "caption": "Public cover takes part of the loss, the warehouse advances more, equity stretches further.",
      "nodes": [
        { "id": "eif", "label": "EIF (InvestEU)", "kind": "institution" },
        { "id": "you", "label": "Your lending entity", "kind": "client" },
        { "id": "wh", "label": "Warehouse lender", "kind": "bank" },
        { "id": "sme", "label": "SME borrowers", "kind": "customer" }
      ],
      "edges": [
        { "from": "eif", "to": "you", "label": "covers part of each loan loss", "kind": "risk" },
        { "from": "wh", "to": "you", "label": "higher advance rate", "kind": "money" },
        { "from": "you", "to": "sme", "label": "loans", "kind": "money" }
      ], "cite": ["c19", "judgement"] }
  ],
  "risks_flags": [
    { "id": "lender-of-record", "kind": "deal_breaker", "severity": "high", "title": "Who is lender of record?", "fix": "Confirm; if a fronting bank signs, it may apply for the German and EU guarantees.", "cite": ["judgement"] },
    { "id": "de-licence", "kind": "flag", "severity": "high", "title": "German lending permission without a licence", "fix": "Handed to Regina.", "cite": ["unverified"] },
    { "id": "fr-monopoly", "kind": "flag", "severity": "high", "title": "May you lend in France at all?", "fix": "Handed to Regina; then decide whether to get French finance-company status or work with a partner lender.", "cite": ["unverified"] },
    { "id": "it-entity", "kind": "flag", "severity": "medium", "title": "Italy needs an Italian Article 106 company", "fix": "Incorporate and apply after EIF feedback; budget capital and time.", "cite": ["c14", "c15", "c16"] },
    { "id": "no-precedent", "kind": "flag", "severity": "medium", "title": "No EIF precedent for a fintech on the main SME product", "fix": "Use the Froda micro-loan precedent; build loss data per country.", "cite": ["w1"] },
    { "id": "deadline", "kind": "flag", "severity": "medium", "title": "InvestEU call closes 30 June 2027, may close earlier", "fix": "Apply in the first quarter of 2027 at the latest.", "cite": ["c17"] }
  ]
}
```

**Sources**
- [c10] [c11] Italian guarantee fund, portfolio operating rules (circ. 6/2018), fondidigaranzia.it, sha 68016c68454e
- [c7] [c8] [c9] Italian guarantee fund operating rules 2023, sha 10198c227b8c
- [c13] Art. 106 TUB, normattiva, sha f7dfd42ca0f5; [c14] [c15] [c16] Art. 107 TUB, normattiva, sha c144a0b23168
- [c17] [c18] [c19] [c20] EIF InvestEU guarantee page, sha d3142570c7e7; [c21] Regulation (EU) 2021/523, sha c16cf34dfb63
- [w1] [EIF, Froda press release](https://www.eif.org/press/all/eif-approves-extended-support-for-froda-with-eu-wide-microfinancing-guarantee-under-investeu), retrieved 2026-11-16: "InvestEU Microfinance, Social and Entrepreneurship Guarantee Product"
- [w2] [Guarantee banks association, ABB-Kredit (Oct 2023)](https://vdb.ermoeglicher.de/documents/1865/ABB-Kredit_2.0_VDB-Layout_final_V2.pdf), retrieved 2026-11-16: "„Kreditgeber“ (Kreditinstitut, Bausparkasse, Versicherungsunternehmen …"
- [w3] [EIF InvestEU guarantee products](https://www.eif.org/InvestEU/guarantee_products/index.htm), retrieved 2026-11-16: "SME Competitiveness Portfolio Guarantee Product"
- [w4] [Banque de France, Fiche 504 (05/2022)](https://www.banque-france.fr/system/files/2024-04/823415-Fiche-504.pdf), retrieved 2026-11-16: "Cette garantie ne bénéficie qu'à l'établissement financier"; "en garantissant 40 à 70 % du concours bancaire"
