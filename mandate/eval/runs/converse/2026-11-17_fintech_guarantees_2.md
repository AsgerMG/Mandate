# Simulated conversation: fintech_guarantees

Case: `mandate/eval/scenarios/fintech_guarantees.yaml`. Brain: Wincent. Playbooks at 30c92de516. 2026-11-17T15:41:49+00:00. 16 turns (script 5/12; stopped: max_turns; client agent called 4x).
Leave-one-out case library: 5 entries left out (fintech_eu_open_door, fintech_eu_product_fits_activity, fintech_research_mechanics_not_instinct, fintech_shut_door_reform, fintech_status_unlocks_market).

## Turn 1: the founder (opener, script)

> Hi. SME lending platform, no banking licence. Investors ask why we don't use public guarantees in Germany, France, Italy. Where do we start?

## Turn 1: Wincent

You're a non-bank lender looking for guarantees in three markets, so the first question is what role each scheme allows you to play. I've only checked Italy's so far. Your borrowers can qualify, since it covers registered SMEs [c1]. You can't be the beneficiary yourself, because financial activities are excluded [c2]. What matters is whether you can be the party that requests the cover. My notes say only banks, leasing companies and other financial intermediaries can (unverified; I'll check it against the official rules).

From your message: you're not a bank, your borrowers are SMEs, and you want public cover on your loan book. Three questions decide which scheme fits:

1. **Where are you incorporated, and what licence or registration do you hold, in any country?** For example a lending, crowdfunding or loan-broker registration. This decides, market by market, whether you can be the named lender or only work through someone else's licence.
2. **Who actually lends the money: your own balance sheet, a fund or special-purpose vehicle, partner banks, or crowd investors?** The guarantee attaches to whoever is the lender on record. If that's a partner bank, the door may already be open through it. If it's a fund, an EU portfolio guarantee may fit better than three national ones (judgement).
3. **Which markets have a company with staff, and what lending volume do you expect in each over 24 months?** That sets which market comes first, and whether one EU agreement beats three national ones.

**Safe to do now:** pull together your loan-book history per country (volumes, ticket sizes, defaults). Every guarantee review will ask for it (judgement).

**Don't do yet:** apply for a licence or approach the national banks before we know which party they'd accept (judgement).

**For Regina:** whether you may lend at all in each market is a licensing question, separate from the guarantee. I'll pass it to Regina once we have your answers.

```mandate-board
{
  "title": "SME lending platform: public guarantees in Germany, France, Italy",
  "stage": "qualify",
  "hierarchies": [
    {
      "id": "field",
      "title": "Who backs SME loan guarantees, by level",
      "explains": "Public cover sits on the lender's loans; your borrowers benefit, the lender of record requests it.",
      "nodes": [
        {"id": "eu", "label": "EU layer (EIB Group, EU guarantee programmes)", "kind": "institution", "status": "probe", "note": "May take non-bank lenders or funds; to research.", "cite": ["unverified"]},
        {"id": "it-min", "label": "Italy: Ministry of Enterprises (MIMIT)", "kind": "ministry", "cite": ["c1"]},
        {"id": "it-mcc", "label": "Mediocredito Centrale", "kind": "institution", "parent": "it-min", "cite": ["unverified"]},
        {"id": "it-fdg", "label": "Fondo di garanzia per le PMI", "kind": "instrument", "parent": "it-mcc", "status": "probe", "note": "Borrowers: registered SMEs; financial firms not beneficiaries. Who may request cover: to confirm.", "cite": ["c1", "c2"]},
        {"id": "de-fed", "label": "Germany: Federal and Land governments", "kind": "ministry", "cite": ["unverified"]},
        {"id": "de-bb", "label": "Bürgschaftsbanken (counter-guaranteed by Federal and Land governments)", "kind": "regional_body", "parent": "de-fed", "status": "probe", "note": "Mechanics for non-bank lenders to research.", "cite": ["unverified"]},
        {"id": "fr-state", "label": "France: State", "kind": "ministry", "cite": ["unverified"]},
        {"id": "fr-bpi", "label": "Bpifrance guarantees", "kind": "institution", "parent": "fr-state", "status": "probe", "note": "Mechanics for non-bank lenders to research.", "cite": ["unverified"]}
      ],
      "cite": ["c1", "c2", "unverified"]
    }
  ],
  "risks_flags": [
    {"id": "lender-of-record", "kind": "flag", "severity": "high", "title": "Who is the lender of record in each market?", "fix": "Answer question 2; it decides which party can request cover.", "cite": ["judgement"]},
    {"id": "licence", "kind": "flag", "severity": "medium", "title": "Permission to lend in each market (regulatory)", "fix": "Handed to Regina once the structure is known.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [c1] Italian Ministry of Enterprises (MIMIT), SME guarantee fund page, https://www.mimit.gov.it/it/incentivi/fondo-di-garanzia-per-le-pmi, sha256 0992743c1ef0: "micro, piccole e medie imprese (PMI) iscritte al Registro delle Imprese; professionisti titolari di partita IVA"
- [c2] Same page, sha256 0992743c1ef0: "con limitate eccezioni quali le attivita' finanziarie e assicurative"

## Turn 2: the founder (answer, if_asked)

> German GmbH, Berlin. Nothing in France or Italy, no branches; we lend there cross-border from Germany, small volumes so far.
> 
> Average 250k, two to five years, working capital and equipment. Borrowers are SMEs with 10 to 200 people.
> 
> We fund from a 150 million warehouse facility, two credit funds. The book is about 120 million now, we want 500 in three years. Roughly 70 percent Germany, 20 Italy, 10 France.

## Turn 2: Wincent

Your answers settle two things.

**One EU agreement could cover all three markets.** The European Investment Fund's capped SME guarantee lists "alternative lenders" as eligible partners. It covers up to 80% of each loss, up to a cap of 25% of the portfolio, for a fee of 0.2% a year. You apply through an open call that runs until 30 June 2027, or earlier if the budget runs out [w1]. Your loans fit its limits: they run more than 12 months and are far below its €8.25m maximum per loan [w1]. There is a close precedent. Froda, a fintech SME lender, got €150m of lending capacity under an EU-wide guarantee from the same fund [w2].

What it could be worth, if €100m of new loans were covered: up to €20m of losses absorbed, for roughly €160k a year in fees (judgement, from the published rates).

**The national schemes look harder without a local licence.**
- **Italy:** the fund appears to accept only banks and financial firms on the Italian register (unverified; I'll confirm in the current rules).
- **Germany:** the regional guarantee banks' terms name banks and similar institutions as the lender (unverified).
- **France:** Bpifrance opened its 2020 state-guaranteed loans to crowdlending platforms, but that scheme has ended [w3].

**Next question: in each country, who signs the loan contract with the borrower?** Your GmbH, a partner bank that originates the loans for you, or the warehouse vehicle? The guarantee would cover whoever holds the loans, and the warehouse lenders must allow it.

**For Regina:** whether your structure allows lending in Germany at all.

```mandate-board
{
  "title": "SME lending platform: public guarantees in Germany, France, Italy",
  "stage": "investigate",
  "hierarchies": [
    {
      "id": "field",
      "title": "Who backs SME loan guarantees, by level",
      "explains": "The EU layer names alternative lenders and covers all three markets; national schemes run through locally licensed lenders.",
      "nodes": [
        {"id": "eu", "label": "EU: European Investment Fund (InvestEU)", "kind": "institution", "status": "open", "note": "Names alternative lenders as intermediaries.", "cite": ["w1"]},
        {"id": "eu-capped", "label": "InvestEU Competitiveness capped guarantee", "kind": "instrument", "parent": "eu", "status": "open", "note": "Up to 80% per loss, cap up to 25%, fee 0.2% p.a.; open call to 30 June 2027.", "cite": ["w1"]},
        {"id": "it-min", "label": "Italy: Ministry of Enterprises (MIMIT)", "kind": "ministry", "cite": ["c1"]},
        {"id": "it-mcc", "label": "Mediocredito Centrale", "kind": "institution", "parent": "it-min", "cite": ["unverified"]},
        {"id": "it-fdg", "label": "Fondo di garanzia per le PMI", "kind": "instrument", "parent": "it-mcc", "status": "probe", "note": "Lenders: Italian-registered banks and financial firms; cross-border lender likely outside.", "cite": ["c1", "c2", "unverified"]},
        {"id": "de-fed", "label": "Germany: Federal and Land governments", "kind": "ministry", "cite": ["unverified"]},
        {"id": "de-bb", "label": "Bürgschaftsbanken", "kind": "regional_body", "parent": "de-fed", "status": "probe", "note": "Lender is a credit institution in the terms; non-bank fit to confirm.", "cite": ["unverified"]},
        {"id": "fr-state", "label": "France: State", "kind": "ministry", "cite": ["unverified"]},
        {"id": "fr-bpi", "label": "Bpifrance guarantees", "kind": "institution", "parent": "fr-state", "status": "probe", "note": "2020 state-guaranteed loans admitted platforms; expired.", "cite": ["w3"]}
      ],
      "cite": ["w1", "w3", "c1", "c2", "unverified"]
    }
  ],
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 380000000, "label": "Book growth, 120M to 500M over three years"},
    "instruments": [
      {"id": "warehouse", "name": "Warehouse facility (two credit funds)", "type": "loan", "amount": 150000000, "terms": "Funds the loans; priced on the book's loss risk", "status": "secured", "cite": ["judgement"]},
      {"id": "eif", "name": "EIF portfolio guarantee on new loans", "type": "guarantee_debt", "terms": "Same loans, cheaper: EIF takes up to 80% of each loss to a cap, for 0.2% a year", "status": "probe", "cite": ["w1"]}
    ]
  },
  "risks_flags": [
    {"id": "lender-of-record", "kind": "deal_breaker", "severity": "high", "title": "Who signs the loan in each country?", "fix": "Confirm GmbH, fronting bank or warehouse vehicle; the guarantee follows the holder of the loans.", "cite": ["judgement"]},
    {"id": "warehouse-consent", "kind": "flag", "severity": "medium", "title": "Warehouse terms must allow a guarantee", "fix": "Check eligibility and security clauses with the two credit funds.", "cite": ["judgement"]},
    {"id": "licence", "kind": "flag", "severity": "high", "title": "German lending permission (regulatory)", "fix": "Handed to Regina.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [c1] MIMIT, SME guarantee fund page, https://www.mimit.gov.it/it/incentivi/fondo-di-garanzia-per-le-pmi, sha256 0992743c1ef0
- [c2] Same page, sha256 0992743c1ef0
- [w1] EIF, InvestEU Competitiveness capped guarantee, https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee, retrieved 2026-11-17: lists "Alternative lenders" as intermediaries; max guarantee rate "< 80%", max cap rate "< 25%", fee 0.2% p.a.; "The EIF selects financial intermediaries based on a call for expression of interest"; deadline 30 June 2027.
- [w2] FinTech Global, 7 Feb 2025, https://fintech.global/2025/02/07/froda-secures-e150m-eif-backed-guarantee-to-expand-sme-financing-across-europe/, retrieved 2026-11-17: Froda's additional €100m "builds on an existing €50m guarantee"; covers "all 27 EU member states". This is a trade-press report.
- [w3] MEDEF note on the 2020 state-guaranteed loans (search result, not opened in full), https://extranet.medef.com/uploads/media/extranet/default/0018/63/12872-0.pdf, retrieved 2026-11-17: platforms with crowdlending status could grant state-guaranteed loans from May 2020. That scheme has expired.

## Turn 3: the founder (answer, if_asked+client_agent)

> German GmbH, Berlin. Nothing in France or Italy, no branches; we lend there cross-border from Germany, small volumes so far.
> 
> Our GmbH signs every loan, in all three countries. French and Italian loans go out cross-border from Berlin, and there's no partner bank. We fund the book from a €150M warehouse facility from two credit funds. I'd have to check with our lawyers whether the loans legally sit in the GmbH or the warehouse vehicle, and what the facility allows on guarantees.

## Turn 3: Wincent

I checked Italy's rules on who can claim the state guarantee. What decides your case now is who legally holds the loans, and Italy now has a clear answer.

**Italy: the door is shut today, but a status you can get opens it.** The state guarantee fund pays out to the lender, and an Italian-registered financial firm counts as a lender [c7] [c8]. It covers portfolios of loans too, once the firm is accredited [c10] [c11]. Registering needs an Italian registered office and head office [c14], minimum capital [c15], and a business limited to lending [c16]. Your Berlin GmbH can't hold the status, but an Italian subsidiary could. On your plan, 20% of €500m is about €100m of Italian loans, which may justify one (judgement).

**EU: still the lead option.** The European Investment Fund call is open to alternative lenders until 30 June 2027 [w1], and it covers all three markets with one agreement.

**One thing comes before either.** Italian law reserves lending to the public to authorised firms [c13]. Every guarantor's due diligence will check that you are allowed to lend in each country (judgement). Regina is taking the question of your cross-border lending in Germany, Italy and France. Your lawyers' answer on who holds the loans feeds straight into it.

**Germany and France** stay to confirm: their schemes appear to run through banks (unverified).

**Decision for you:** which do you lean towards? Lead with the EU guarantee across the whole book, or also start an Italian subsidiary to get Italy's state guarantee?

```mandate-board
{
  "title": "SME lending platform: public guarantees in Germany, France, Italy",
  "stage": "options",
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eif-capped", "name": "InvestEU Competitiveness capped guarantee", "institution": "European Investment Fund", "status": "open", "why": "Names alternative lenders; one agreement for all three markets; call open to 30 June 2027.", "conditions": ["Expression of interest and EIF due diligence", "Up to 80% per loss, cap up to 25%, fee 0.2% p.a.", "Loans from 12 months, up to EUR 8.25m each", "Clean answer on who holds the loans and permission to lend"], "cite": ["w1", "judgement"]}
      ]},
      {"id": "it", "level": "national", "label": "Italy", "country": "IT", "doors": [
        {"id": "it-fdg-direct", "name": "Fondo di garanzia, direct guarantee", "institution": "Fondo di garanzia per le PMI (MIMIT, managed by Mediocredito Centrale)", "via": "a lender on the Art. 106 register", "status": "shut", "why": "Your GmbH is not an Italian-registered lender; an Italian subsidiary with Art. 106 status would open it.", "conditions": ["Italian registered office and head office", "Minimum paid-up capital", "Business limited to lending"], "cite": ["c7", "c8", "c9", "c14", "c15", "c16"]},
        {"id": "it-fdg-portfolio", "name": "Fondo di garanzia, portfolio guarantee", "institution": "Fondo di garanzia per le PMI", "via": "accredited Art. 106 lender", "status": "shut", "why": "Same status; then accreditation; the route for a loan book.", "cite": ["c10", "c11"]}
      ]},
      {"id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
        {"id": "de-bb", "name": "Bürgschaftsbank default guarantees", "institution": "Bürgschaftsbank Berlin (and other Länder)", "via": "the borrower's lender, typically a bank", "status": "probe", "why": "Terms appear to name credit institutions as lender; fit for a non-bank to confirm.", "cite": ["unverified"]}
      ]},
      {"id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
        {"id": "fr-bpi", "name": "Bpifrance guarantees", "institution": "Bpifrance", "via": "partner banks", "status": "park", "why": "Runs through partner banks; the 2020 scheme that admitted platforms has ended; 10% of book.", "cite": ["w3", "unverified"]}
      ]}
    ]
  },
  "hierarchies": [
    {
      "id": "field",
      "title": "Who backs SME loan guarantees, by level",
      "explains": "The EU layer names alternative lenders; Italy's fund pays to Italian-registered lenders.",
      "nodes": [
        {"id": "eu", "label": "EU: European Investment Fund (InvestEU)", "kind": "institution", "status": "open", "cite": ["w1"]},
        {"id": "eu-capped", "label": "InvestEU Competitiveness capped guarantee", "kind": "instrument", "parent": "eu", "status": "open", "cite": ["w1"]},
        {"id": "it-min", "label": "Italy: Ministry of Enterprises (MIMIT)", "kind": "ministry", "cite": ["c1"]},
        {"id": "it-fdg", "label": "Fondo di garanzia per le PMI", "kind": "instrument", "parent": "it-mcc", "status": "shut", "note": "Opens with an Italian Art. 106 subsidiary.", "cite": ["c7", "c8", "c10"]},
        {"id": "it-boi", "label": "Banca d'Italia (Art. 106 register)", "kind": "institution", "parent": "it-min", "note": "Authorises the status that opens the fund.", "cite": ["c13", "c14"]},
        {"id": "de-bb", "label": "Bürgschaftsbanken", "kind": "regional_body", "parent": "de-fed", "status": "probe", "cite": ["unverified"]},
        {"id": "fr-bpi", "label": "Bpifrance guarantees", "kind": "institution", "parent": "fr-state", "status": "park", "cite": ["w3", "unverified"]}
      ],
      "cite": ["w1", "c7", "c8", "c13", "unverified"]
    }
  ],
  "stakeholders": {
    "institutions": [
      {"id": "eif", "name": "European Investment Fund", "side": "public-capital", "country": "EU", "units": [{"id": "eif-guar", "name": "Guarantees and alternative lending team", "roles": [
        {"id": "eif-head", "role": "Head of the SME guarantee products", "priority": "P1", "reach": "Through the call's expression-of-interest channel", "status": "to_approach", "cite": ["w1", "judgement"]},
        {"id": "eif-officer", "role": "Mandate officer covering Germany", "priority": "P2", "reach": "Forwarded by the head, or the call's inbox", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "mcc", "name": "Fondo di garanzia per le PMI (Mediocredito Centrale)", "side": "public-capital", "country": "IT", "units": [{"id": "fdg-mgmt", "name": "Fund management", "roles": [
        {"id": "fdg-head", "role": "Head of the Fund", "priority": "P1", "reach": "After the Italian entity exists", "status": "to_approach", "cite": ["judgement"]},
        {"id": "fdg-accr", "role": "Accreditation and portfolio unit", "priority": "P2", "reach": "Fund's lender channel", "status": "to_approach", "cite": ["c11", "judgement"]}
      ]}]},
      {"id": "mimit", "name": "Ministry of Enterprises (MIMIT)", "side": "political", "country": "IT", "units": [{"id": "mimit-dg", "name": "Directorate running the Fund", "roles": [
        {"id": "mimit-dg-head", "role": "Director-general for SME incentives", "priority": "P1", "reach": "Formal letter once the Italian plan is set", "status": "to_approach", "cite": ["unverified"]}
      ]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "prep", "label": "Foundations", "steps": [
        {"id": "holder", "label": "Lawyers: who holds the loans; what the facility allows on guarantees", "start": 0, "end": 0.5, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "reg", "label": "Regina: permission to lend in DE, IT, FR", "start": 0, "end": 1, "owner": "us", "status": "active", "cite": ["c13", "judgement"]},
        {"id": "book", "label": "Loan-book data pack per country", "start": 0, "end": 1, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "eu-track", "label": "EU guarantee", "steps": [
        {"id": "eoi", "label": "Expression of interest to EIF (not before the legal answers)", "start": 1, "end": 2, "owner": "client", "status": "blocked", "depends_on": ["holder", "reg"], "cite": ["w1", "judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-eif", "label": "EIF call closes 30 June 2027 or earlier on budget", "start": "2027-06-30", "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"]},
        {"id": "w-fdg", "label": "Italy: 2027 Fondo di garanzia reform decree (cover by risk class)", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-de", "label": "Germany: Bürgschaftsbank terms for non-bank lenders", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]},
        {"id": "w-fr", "label": "France: any Bpifrance opening to non-bank lenders", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 380000000, "label": "Book growth, 120M to 500M over three years"},
    "instruments": [
      {"id": "warehouse", "name": "Warehouse facility (two credit funds)", "type": "loan", "amount": 150000000, "terms": "Funds the loans; dear because the funds price the full loss risk", "status": "secured", "cite": ["judgement"]},
      {"id": "eif", "name": "EIF portfolio guarantee on new loans", "type": "guarantee_debt", "terms": "Carries part of the loss on the same loans for 0.2% a year: cheap risk transfer that should lower warehouse pricing", "status": "probe", "cite": ["w1", "judgement"]},
      {"id": "fdg", "name": "Italian state guarantee on Italian loans", "type": "guarantee_debt", "terms": "Carries loss on Italian loans via an Art. 106 subsidiary; whether it may stack with EIF cover is to confirm", "status": "parked", "cite": ["c10", "unverified"]}
    ]
  },
  "risks_flags": [
    {"id": "lender-of-record", "kind": "deal_breaker", "severity": "high", "title": "Who holds the loans: GmbH or warehouse vehicle?", "fix": "Lawyers' answer; the guarantee follows the holder.", "cite": ["judgement"]},
    {"id": "licence", "kind": "deal_breaker", "severity": "high", "title": "Permission to lend cross-border in each market", "fix": "Handed to Regina; Italy reserves lending to the public to authorised firms.", "cite": ["c13", "judgement"]},
    {"id": "warehouse-consent", "kind": "flag", "severity": "medium", "title": "Facility must allow a third-party guarantee", "fix": "Check with the two credit funds.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [c7] Fondo di garanzia operating rules 2023, register record urn:mandate:capital:raw/instrument_docs/fondo_di_garanzia_disposizioni_operative_2023.pdf, sha256 10198c227b8c: "“Soggetti finanziatori” : le banche, gli intermediari, ..."
- [c8] Same document, sha256 10198c227b8c: "“Intermediari”: gli intermediari finanziari iscritti nell’albo di cui all’articolo 106 del TUB"
- [c9] Same document, sha256 10198c227b8c: "la garanzia concessa dal Fondo direttamente ai soggetti finanziatori"
- [c10] Portfolio operating rules, circ. 6/2018, https://www.fondidigaranzia.it/wp-content/uploads/2018/06/1_Modalita-operative-portafogli-fin_circ_6-2018.pdf, sha256 68016c68454e
- [c11] Same document, sha256 68016c68454e: "Possono richiedere la garanzia del Fondo, previo accreditamento: a) i soggetti finanziatori"
- [c13] Art. 106 TUB, https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1993-09-01;385~art106, sha256 f7dfd42ca0f5
- [c14] [c15] [c16] Art. 107 TUB, https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1993-09-01;385~art107, sha256 c144a0b23168
- [c1] MIMIT, SME guarantee fund page, https://www.mimit.gov.it/it/incentivi/fondo-di-garanzia-per-le-pmi, sha256 0992743c1ef0
- [w1] EIF, InvestEU Competitiveness capped guarantee, https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee, retrieved 2026-11-17
- [w3] MEDEF note on the 2020 state-guaranteed loans, https://extranet.medef.com/uploads/media/extranet/default/0018/63/12872-0.pdf, retrieved 2026-11-17

## Turn 4: the founder (answer, if_asked)

> German GmbH, Berlin. Nothing in France or Italy, no branches; we lend there cross-border from Germany, small volumes so far.

## Turn 4: Wincent

Understood. With no company of your own in France or Italy, Italy's state guarantee stays shut. Only an Italian company you set up and get registered there could open it [c8] [c14]. So the real choice is simpler than it looked.

**My read:** the EU guarantee is your route for all three markets as you are set up today. It names alternative lenders and takes one agreement [w1]. The precedent we found covers all 27 member states for a fintech SME lender [w2]. You can cover your Italian and French loans that way without setting up there (judgement, subject to the holder and permission checks).

**Italy's own guarantee is a later decision, not a now one.** On your plan Italy reaches about €100m of loans in three years (judgement, from your 20% of €500m). That is the point where an Italian subsidiary might pay for itself. Today's small volumes don't justify one (judgement).

**One thing to hold:** don't send the EU expression of interest before your lawyers confirm who holds the loans and Regina confirms you may lend cross-border. The EU fund's due diligence will ask both (judgement).

**To confirm the priority, one question:** what would the guarantee mainly buy you? Cheaper warehouse money, more room in the facility, or the ability to lend to riskier SMEs? The capped product targets the riskier part of a book [w1]. If cheaper money is the aim, a different EU product may fit better (judgement).

```mandate-board
{
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Lead with the EU guarantee from the European Investment Fund: open to alternative lenders, one agreement across Germany, Italy and France.",
      "Italy's state guarantee needs an Italian Art. 106 subsidiary: decide when Italian volume nears EUR 100m.",
      "Germany and France national schemes: confirm, likely bank-only; parked behind the EU route."
    ],
    "confidence": "medium",
    "confidence_why": "Open by applicant type; depends on who holds the loans and permission to lend cross-border.",
    "open_question": "What should the guarantee buy: cheaper funding, more facility headroom, or riskier borrowers?",
    "cite": ["w1", "w2", "c8", "c14", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "it", "level": "national", "label": "Italy", "country": "IT", "doors": [
        {"id": "it-fdg-direct", "name": "Fondo di garanzia, direct guarantee", "institution": "Fondo di garanzia per le PMI", "via": "a lender on the Art. 106 register", "status": "park", "why": "No Italian entity; revisit when Italian volume justifies a subsidiary.", "cite": ["c8", "c14", "judgement"]},
        {"id": "it-fdg-portfolio", "name": "Fondo di garanzia, portfolio guarantee", "institution": "Fondo di garanzia per le PMI", "via": "accredited Art. 106 lender", "status": "park", "why": "Same status needed.", "cite": ["c10", "c11", "judgement"]}
      ]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "it-track", "label": "Italy option", "steps": [
        {"id": "it-sub-decision", "label": "Decide on an Italian Art. 106 subsidiary (at ~EUR 100m Italian volume)", "start": 12, "milestone": true, "owner": "client", "status": "planned", "cite": ["c14", "c15", "judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-it-volume", "label": "Italian book size against the subsidiary threshold", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]}
      ]}
    ]
  }
}
```

**Sources**
- [c8] Fondo di garanzia operating rules 2023, register record urn:mandate:capital:raw/instrument_docs/fondo_di_garanzia_disposizioni_operative_2023.pdf, sha256 10198c227b8c
- [c10] [c11] Portfolio operating rules, circ. 6/2018, https://www.fondidigaranzia.it/wp-content/uploads/2018/06/1_Modalita-operative-portafogli-fin_circ_6-2018.pdf, sha256 68016c68454e
- [c14] [c15] Art. 107 TUB, https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1993-09-01;385~art107, sha256 c144a0b23168
- [w1] EIF, InvestEU Competitiveness capped guarantee, https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee, retrieved 2026-11-17: lists "Alternative lenders" as eligible; targets SMEs the intermediary typically excludes and the riskiest debt in its SME book
- [w2] FinTech Global, 7 Feb 2025, https://fintech.global/2025/02/07/froda-secures-e150m-eif-backed-guarantee-to-expand-sme-financing-across-europe/, retrieved 2026-11-17: covers "all 27 EU member states"

## Turn 5: the founder (answer, if_asked+client_agent)

> We fund from a 150 million warehouse facility, two credit funds. The book is about 120 million now, we want 500 in three years. Roughly 70 percent Germany, 20 Italy, 10 France.
> 
> Mainly more room and better terms on the warehouse. We're at €120M on a €150M facility and want €500M in three years, so better advance rates matter most. Lending to riskier SMEs isn't the plan.

## Turn 5: Wincent

That changes which product you need. I compared the EU fund's guarantee products with its securitisation work.

**Better advance rates point to a different EU product.** The guarantee I found first targets the riskiest part of a lender's book and SMEs it would normally turn down [w1]. That doesn't match your aim, so it drops to a fallback (judgement). The second product I checked is for recapitalising SMEs hit by COVID [w4], so it doesn't fit either.

What matches is the EU fund's securitisation work. It guarantees senior or mezzanine slices of loan portfolios, or buys slices as an anchor investor, to give lenders long-term funding [w5]. A guarantee on the middle slice replaces part of the first-loss money you now put up yourself. That is exactly what lifts an advance rate (judgement). I've seen reports of non-bank precedents (Funding Circle, and two Italian non-bank lenders), but haven't confirmed them on official pages yet (unverified).

**What it's worth (illustration, my numbers):** if your warehouse advances 85%, a €500m book needs €75m of your own money. At 92% that drops to €40m, which frees €35m. Tell me the real advance rate and I'll redo it.

**Not yet:** €120m is probably small for a full securitisation (judgement). The likely route is to plan it into your next warehouse renewal or upsizing, with the EU fund at the table.

**Question:** when does your facility mature or come up for upsizing, and what advance rate do you get today?

```mandate-board
{
  "stage": "prioritise",
  "answer": {
    "lines": [
      "Aim is warehouse headroom and advance rates, so lead with the European Investment Fund's securitisation side: a guaranteed or anchored mezzanine slice replaces part of your first loss.",
      "The capped portfolio guarantee targets riskier SMEs: a fallback, not the lead.",
      "Time the EU fund into the next warehouse renewal or upsizing; Italy's own guarantee waits for an Italian subsidiary decision."
    ],
    "confidence": "medium",
    "confidence_why": "Product fits the aim; size, rating and non-bank originator fit still to confirm with the EU fund.",
    "open_question": "When does the facility mature or upsize, and what is today's advance rate?",
    "cite": ["w1", "w5", "judgement"]
  },
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [
        {"id": "eif-sec", "name": "Securitisation: guarantee or anchor investment in senior or mezzanine slices", "institution": "European Investment Fund (with EIB)", "status": "open", "why": "Built for long-term funding; a mezzanine guarantee lifts advance rates.", "conditions": ["Portfolio large enough to tranche", "Originator fit for a non-bank to confirm", "Rating threshold on guaranteed slices to confirm"], "cite": ["w5", "judgement", "unverified"]},
        {"id": "eif-capped", "name": "InvestEU Competitiveness capped guarantee", "institution": "European Investment Fund", "status": "probe", "why": "Open to alternative lenders, but targets the riskiest loans; not your aim.", "cite": ["w1"]},
        {"id": "eif-uncapped", "name": "InvestEU Competitiveness uncapped guarantee", "institution": "European Investment Fund", "status": "shut", "why": "Subordinated loans for SME solvency after COVID; does not match working capital and equipment loans.", "cite": ["w4"]}
      ]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 500000000, "label": "Book target in three years"},
    "instruments": [
      {"id": "warehouse", "name": "Warehouse senior funding (two credit funds)", "type": "loan", "amount": 425000000, "terms": "At an assumed 85% advance: senior money, priced on the full loss risk", "status": "in_progress", "cite": ["judgement"]},
      {"id": "own-first-loss", "name": "Your own first-loss and equity", "type": "equity", "amount": 40000000, "amount_max": 75000000, "terms": "The dearest money; falls from about 75M to 40M if the advance rate goes from 85% to 92%", "status": "secured", "cite": ["judgement"]},
      {"id": "eif-mezz", "name": "EU fund guarantee on a mezzanine slice", "type": "guarantee_debt", "terms": "Replaces part of your first loss with public risk-taking: cheap compared with equity", "status": "probe", "cite": ["w5", "judgement"]}
    ]
  },
  "risks_flags": [
    {"id": "capped-fit", "kind": "flag", "severity": "medium", "title": "Capped guarantee targets higher-risk lending", "fix": "Use it only if a segment of the book fits; lead with securitisation.", "cite": ["w1"]},
    {"id": "scale", "kind": "flag", "severity": "medium", "title": "Book may be small for a standalone securitisation", "fix": "Build the EU fund into the next warehouse renewal or upsizing.", "cite": ["judgement"]}
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-renewal", "label": "Warehouse maturity or upsizing: the moment to bring in the EU fund", "start": 6, "milestone": true, "owner": "client", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  }
}
```

**Sources**
- [w1] EIF, InvestEU Competitiveness capped guarantee, https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee, retrieved 2026-11-17: aimed at "SMEs that the intermediary typically excludes" and "the riskiest debt financing in its SME loan book"
- [w4] EIF, InvestEU Competitiveness uncapped guarantee, https://www.eif.org/guarantee-products/all/investeu-competitiveness-uncapped-guarantee, retrieved 2026-11-17: "designed to provide solvency support to SMEs that were negatively impacted by the COVID-19 pandemic"; subordinated loans; fee 1.2% p.a.
- [w5] EIF, Securitisation, https://www.eif.org/supporting-smes/access-to-finance/securitisation, retrieved 2026-11-17: "The EIF provides unfunded credit protection by fronting a guarantee on behalf of EIB"; "the EIB or EIF purchases all or parts of selected tranches in the structure, acting as anchor investor"; helps with "capital relief and long-term funding"

## Turn 6: the founder (answer, client_agent)

> I don't have the maturity date or the exact advance rate in my head, so I'll get both from our CFO. What I do know: we've drawn about €120M of the €150M, so we'll need to upsize well before we get near €500M.

## Turn 6: Wincent

Got it. One number changes the timing: at your planned pace the facility runs out in a few months.

**The arithmetic (judgement, assuming steady growth):** going from €120m to €500m in 36 months means about €10.5m of new net lending a month. That uses up your remaining €30m in roughly three months. So the upsizing talks with your credit funds are close at hand, and the EU fund works on a longer timetable than that (judgement).

**My advice: run it in two steps.**
1. **Now:** upsize with your two credit funds as usual. But write into the new terms that a later guarantee or anchor investment from the EU fund on a mezzanine slice is allowed, and how it would raise your advance rate. This is the one move that keeps the EU route open (judgement).
2. **In parallel:** send the EU fund's securitisation team a short, low-cost enquiry. Bring it in properly at the next step, when the book is large enough to split into slices. It guarantees or invests in senior and mezzanine slices, backed by the EIB [w5].

**What to expect:** structuring, due diligence on you as originator and servicer, a rating of the slices, then its credit approval. Those steps are mapped on the board, mostly as my reading of how it usually runs, not from its rules. Allow months rather than weeks (judgement). I have no verified precedent yet of a German non-bank lender getting this. If none turns up, yours is a first-of-a-kind ask and needs a stronger case.

**Still gating the enquiry:** your lawyers' answer on who holds the loans, and Regina's on cross-border permission.

**Decision:** shall I draft the enquiry to the EU fund and a short clause brief for your upsizing talks?

```mandate-board
{
  "stage": "advise",
  "answer": {
    "lines": [
      "Upsize the warehouse now with your credit funds, and write in room for a later EU fund guarantee or anchor investment on a mezzanine slice.",
      "Probe the European Investment Fund's securitisation team in parallel; bring it in at the next upsizing step to lift the advance rate.",
      "Italy's state guarantee waits for an Italian subsidiary decision; the national schemes in Germany and France stay parked behind the EU route."
    ],
    "confidence": "medium",
    "confidence_why": "Fits the aim; non-bank originator fit, size and precedent unconfirmed.",
    "open_question": "Facility maturity and current advance rate (CFO).",
    "cite": ["w5", "judgement"]
  },
  "process_maps": [
    {
      "id": "eif-sec-decision",
      "title": "How an EU fund securitisation deal gets done",
      "explains": "From first enquiry to a guaranteed or anchored slice in your funding structure.",
      "kind": "funding_decision",
      "illustrative": true,
      "actors": [
        {"id": "client", "name": "Your GmbH (originator and servicer)", "side": "market"},
        {"id": "funds", "name": "Your two credit funds", "side": "market"},
        {"id": "eif", "name": "European Investment Fund, securitisation team", "side": "public-capital"},
        {"id": "eib", "name": "EIB (backs the EU fund's guarantee)", "side": "public-capital"}
      ],
      "steps": [
        {"id": "probe", "label": "Short enquiry: book, growth, aim (advance rate)", "kind": "step", "actor": "client", "timing": "this month", "cite": ["judgement"], "gates": [{"label": "Lawyers confirm who holds the loans", "cite": ["judgement"]}, {"label": "Regina clears cross-border lending permission", "cite": ["judgement"]}]},
        {"id": "structure", "label": "Structure the slices with the funds and an arranger", "kind": "step", "actor": "funds", "timing": "1-3 months", "cite": ["judgement"], "gates": [{"label": "Warehouse terms allow third-party protection on a mezzanine slice", "cite": ["judgement"]}, {"label": "Originator keeps the junior slice", "cite": ["w5"]}]},
        {"id": "dd", "label": "Due diligence on origination, servicing and loan data", "kind": "document", "actor": "eif", "timing": "2-3 months", "cite": ["judgement"], "gates": [{"label": "Loan-book history per country", "cite": ["judgement"]}, {"label": "Loans to SMEs", "cite": ["w5"]}]},
        {"id": "rating", "label": "Rating of the slices to be covered", "kind": "step", "actor": "funds", "timing": "parallel to diligence", "cite": ["unverified"], "gates": [{"label": "Minimum rating on covered slice (reported BB/Ba2)", "cite": ["unverified"]}]},
        {"id": "approve", "label": "EU fund credit approval and signing", "kind": "decision", "actor": "eif", "timing": "after diligence", "cite": ["judgement"], "gates": [{"label": "EIB counter-guarantee in place", "cite": ["w5"]}]}
      ],
      "flow": [{"from": "probe", "to": "structure"}, {"from": "structure", "to": "dd"}, {"from": "dd", "to": "rating"}, {"from": "rating", "to": "approve"}],
      "leverage": [
        {"id": "lev-clause", "at": "structure", "kind": "timing_window", "label": "The upsizing negotiation now", "why": "The cheapest moment to make room for EU fund cover in the facility.", "how": "CFO puts a clause on the term sheet with both credit funds.", "side": "market", "cite": ["judgement"]},
        {"id": "lev-head", "at": "eif", "kind": "door_opener", "label": "Head of securitisation at the EU fund", "why": "A top-down hand-off to a deal officer beats a cold inbox.", "how": "Short enquiry to the head of the unit; CFO follows up.", "side": "public-capital", "cite": ["judgement"]},
        {"id": "lev-prec", "at": "approve", "kind": "precedent", "label": "Reported non-bank deals (Funding Circle, Italian non-bank lenders)", "why": "Shows the EU fund has backed non-bank originators.", "how": "Confirm on official pages before citing in outreach.", "side": "public-capital", "cite": ["unverified"]}
      ],
      "cite": ["w5", "judgement"]
    }
  ],
  "stakeholders": {
    "institutions": [
      {"id": "eif", "name": "European Investment Fund", "side": "public-capital", "country": "EU", "units": [{"id": "eif-sec", "name": "Securitisation / credit enhancement", "roles": [
        {"id": "eif-sec-head", "role": "Head of securitisation", "priority": "P1", "reach": "Short enquiry via the EU fund's securitisation contact page", "status": "to_approach", "cite": ["w5", "judgement"]},
        {"id": "eif-sec-officer", "role": "Deal officer for Germany", "priority": "P2", "reach": "Forwarded by the head", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "funds", "name": "Your two credit funds", "side": "market", "country": "DE", "units": [{"id": "funds-ic", "name": "Investment committee", "roles": [
        {"id": "funds-pm", "role": "Portfolio manager on your facility", "priority": "P1", "reach": "CFO, in the upsizing talks", "status": "engaged", "cite": ["judgement"]}
      ]}]},
      {"id": "ec", "name": "European Commission (InvestEU)", "side": "political", "country": "EU", "units": [{"id": "ec-ie", "name": "InvestEU unit", "roles": [
        {"id": "ec-ie-head", "role": "Head of unit for the SME window", "priority": "P2", "reach": "Only if the EU fund asks for a policy angle", "status": "to_approach", "cite": ["unverified"]}
      ]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "upsize", "label": "Warehouse upsizing", "steps": [
        {"id": "cfo-data", "label": "CFO: maturity, advance rate, facility clauses", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "upsize-ts", "label": "Upsize term sheet with room for EU fund cover", "start": 0.5, "end": 3, "owner": "client", "status": "planned", "depends_on": ["cfo-data"], "cite": ["judgement"]},
        {"id": "headroom-out", "label": "Headroom exhausted at planned pace", "start": 3, "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]}
      ]},
      {"id": "eu-track", "label": "EU fund", "steps": [
        {"id": "eoi", "label": "Enquiry to EU fund securitisation team", "start": 0.5, "end": 1, "owner": "client", "status": "planned", "depends_on": ["holder", "reg"], "cite": ["w5", "judgement"]},
        {"id": "sec-deal", "label": "EU fund-backed mezzanine slice at next upsizing step", "start": 9, "end": 15, "owner": "institution", "status": "planned", "depends_on": ["eoi", "upsize-ts"], "cite": ["judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "headroom", "kind": "flag", "severity": "high", "title": "Facility headroom lasts about three months at plan pace", "fix": "Start the upsizing now; do not wait for the EU fund.", "cite": ["judgement"]},
    {"id": "precedent", "kind": "flag", "severity": "medium", "title": "No verified precedent for a German non-bank originator", "fix": "Confirm reported deals on official pages; if none, build a first-of-a-kind case.", "cite": ["unverified"]}
  ]
}
```

**Sources**
- [w5] EIF, Securitisation, https://www.eif.org/supporting-smes/access-to-finance/securitisation, retrieved 2026-11-17: "The EIF provides unfunded credit protection by fronting a guarantee on behalf of EIB"; "the EIB or EIF purchases all or parts of selected tranches in the structure, acting as anchor investor"; helps with "capital relief and long-term funding"

## Turn 7: the founder (options, script)

> OK, that is the picture. What are our options, broadly?

## Turn 7: Wincent

Broadly, you have six options. The board marks each one open, probe, parked or shut.

1. **EU securitisation (lead).** The EU fund guarantees or buys a middle slice of your book, alongside your credit funds [w5]. It goes straight at your advance rate, and one deal covers all three markets (judgement).
2. **EU portfolio guarantee (fallback).** Open to alternative lenders, but aimed at riskier loans [w1]. Worth using only if part of your book fits that description.
3. **Italy's state guarantee through an Italian subsidiary (later).** The fund covers loans from Italian-registered lenders [c8] [c10], and that needs an Italian head office [c14]. Revisit when your Italian loans near €100m (judgement).
4. **German regional guarantee banks (probe).** Their terms appear to name banks as the lender (unverified). One question to Bürgschaftsbank Berlin would settle it.
5. **France's Bpifrance (parked).** It works through partner banks, and the 2020 scheme that admitted platforms has ended [w3].
6. **A partner bank that originates the loans for you (workaround).** It might open the national schemes. But the route would belong to the bank, not to you, so I'd keep it as a last resort (judgement).

**Not open today:** no national scheme I found accepts a cross-border non-bank lender. Changing that would be a lobbying aim, not a route, and I found nothing moving (judgement).

**To prioritise:** do you agree with leading on option 1, probing 4 at low cost, and putting 3 on a volume trigger?

```mandate-board
{
  "stage": "options",
  "routes": {
    "levels": [
      {"id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
        {"id": "de-partner", "name": "Fronting bank partner (workaround)", "institution": "A German bank originating for you", "status": "park", "why": "Would open bank-only schemes, but the route belongs to the partner, not to you.", "cite": ["judgement"]},
        {"id": "de-kfw-abs", "name": "KfW as co-investor in an SME securitisation", "institution": "KfW", "status": "probe", "why": "Reported alongside the EU fund in a non-bank originator deal; to confirm.", "cite": ["unverified"]}
      ]},
      {"id": "lobby", "level": "lobby", "label": "Rule change", "doors": [
        {"id": "lobby-xborder", "name": "National guarantee schemes admitting cross-border EU non-bank lenders", "institution": "National ministries running the schemes", "status": "park", "why": "No route today; Italy ties the status to an Italian head office; nothing found moving.", "cite": ["c14", "judgement"]}
      ]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-lobby", "label": "Any national reform opening guarantee schemes to cross-border non-bank lenders", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["judgement"]},
        {"id": "w-kfw", "label": "KfW appetite for SME securitisations from non-bank lenders", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  }
}
```

**Sources**
- [c8] Fondo di garanzia operating rules 2023, register record urn:mandate:capital:raw/instrument_docs/fondo_di_garanzia_disposizioni_operative_2023.pdf, sha256 10198c227b8c
- [c10] Portfolio operating rules, circ. 6/2018, https://www.fondidigaranzia.it/wp-content/uploads/2018/06/1_Modalita-operative-portafogli-fin_circ_6-2018.pdf, sha256 68016c68454e
- [c14] Art. 107 TUB, https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1993-09-01;385~art107, sha256 c144a0b23168
- [w1] EIF, InvestEU Competitiveness capped guarantee, https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee, retrieved 2026-11-17
- [w3] MEDEF note on the 2020 state-guaranteed loans, https://extranet.medef.com/uploads/media/extranet/default/0018/63/12872-0.pdf, retrieved 2026-11-17
- [w5] EIF, Securitisation, https://www.eif.org/supporting-smes/access-to-finance/securitisation, retrieved 2026-11-17

## Turn 8: the founder (answer, if_asked)

> We fund from a 150 million warehouse facility, two credit funds. The book is about 120 million now, we want 500 in three years. Roughly 70 percent Germany, 20 Italy, 10 France.

## Turn 8: Wincent

That's all on the board already, and nothing in it changes the picture. Here's what the split means for each option.

- **Germany, about 70%:** most of the book, and most of what the EU fund would look at in due diligence (judgement). The German guarantee banks matter only if their terms admit a non-bank lender, which is still unverified.
- **Italy, about 20%:** around €100m at your target, which is the trigger I suggested for deciding on an Italian subsidiary (judgement).
- **France, about 10%:** around €50m at target. That is too small to justify a French entity just to chase a guarantee, so France rides on the EU route (judgement).

So the order I proposed stands:
1. Lead with the EU securitisation route, timed to your next warehouse upsizing.
2. Probe the German guarantee banks at low cost.
3. Put Italy on a volume trigger.

**Two inputs still pending:** your CFO's numbers (maturity, advance rate, facility clauses) and your lawyers' answer on who holds the loans.

**One decision from you:** do you agree with that order? If so, I'll move to the plan and draft the enquiry to the EU fund.

```mandate-board
{
  "stage": "prioritise",
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 500000000, "label": "Book target in three years: about 350M Germany, 100M Italy, 50M France"},
    "instruments": [
      {"id": "eif-mezz", "name": "EU fund guarantee on a mezzanine slice", "type": "guarantee_debt", "terms": "Covers the whole three-country book in one deal; replaces part of your first loss with cheap public risk-taking", "status": "probe", "cite": ["w5", "judgement"]},
      {"id": "fdg", "name": "Italian state guarantee on Italian loans", "type": "guarantee_debt", "terms": "Only for about 100M of Italian loans, and only via an Italian Art. 106 subsidiary", "status": "parked", "cite": ["c10", "c14", "judgement"]}
    ]
  }
}
```

**Sources**
- [c10] Portfolio operating rules, circ. 6/2018, https://www.fondidigaranzia.it/wp-content/uploads/2018/06/1_Modalita-operative-portafogli-fin_circ_6-2018.pdf, sha256 68016c68454e
- [c14] Art. 107 TUB, https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1993-09-01;385~art107, sha256 c144a0b23168
- [w5] EIF, Securitisation, https://www.eif.org/supporting-smes/access-to-finance/securitisation, retrieved 2026-11-17

## Turn 9: the founder (pushback, script)

> Hm. Germany is 70 percent of our book. KfW must have something for lenders like us. Why wouldn't we start there?

## Turn 9: Wincent

Germany is the right instinct, but KfW is not a door on its own for a non-bank. It is a second seat in the same deal.

**Why not KfW's loans or guarantees directly:** almost all of the German promotional banks' products are applied for and run through a classic bank, which passes the file on to the promotional bank [w6]. Your GmbH is not a bank, so those products don't reach your book (judgement). The only way in would be a fronting bank, which is the workaround I flagged.

**Where KfW does fit: as an investor in your securitisation.** In 2018 KfW and the EU fund backed the securitisation of a non-bank platform's SME loans (Funding Circle's book, structured by P2P Global Investments) [w7]. Those were UK loans, and the report comes from trade press. That is still your best precedent: a German public investor has bought paper from a non-bank SME lender before. Whether KfW has the same appetite today, for German loans, is unverified.

**So the plan becomes:** one structure, two public investors. The EU fund guarantees or anchors the middle slice, and KfW is asked for a senior or mezzanine ticket (judgement). With Germany at 70% of the book, KfW's mission to support the Mittelstand is the pitch (judgement).

**Not yet:** don't approach KfW's SME loan or guarantee side. That's the wrong function for this ask, and they would point you to a bank.

**Question:** do your two credit funds, or your lawyers, already have a contact on KfW's securitisation side?

```mandate-board
{
  "stage": "prioritise",
  "routes": {
    "levels": [
      {"id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
        {"id": "de-kfw-loans", "name": "KfW promotional loans and guarantees", "institution": "KfW", "via": "a classic bank (Hausbank)", "status": "shut", "why": "Applied for and run through banks; your GmbH is not one.", "cite": ["w6", "judgement"]},
        {"id": "de-kfw-abs", "name": "KfW as investor in your SME securitisation", "institution": "KfW", "status": "probe", "why": "Backed a non-bank SME lender's securitisation with the EU fund in 2018; today's appetite to confirm.", "cite": ["w7", "unverified"]}
      ]}
    ]
  },
  "hierarchies": [
    {
      "id": "de-field",
      "title": "Germany: where KfW sits for you",
      "explains": "KfW's SME loans pass through banks; its investment side can buy securitised SME loans.",
      "nodes": [
        {"id": "de-fed", "label": "Federal government", "kind": "ministry", "cite": ["unverified"]},
        {"id": "kfw", "label": "KfW", "kind": "institution", "parent": "de-fed", "cite": ["w6"]},
        {"id": "kfw-loans", "label": "Promotional loans and guarantees", "kind": "programme", "parent": "kfw", "status": "shut", "note": "Through a classic bank only.", "cite": ["w6"]},
        {"id": "kfw-abs", "label": "Investment in SME securitisations", "kind": "division", "parent": "kfw", "status": "probe", "note": "Precedent: non-bank SME loans, 2018, with the EU fund.", "cite": ["w7"]},
        {"id": "de-bb", "label": "Bürgschaftsbanken", "kind": "regional_body", "parent": "de-fed", "status": "probe", "cite": ["unverified"]}
      ],
      "cite": ["w6", "w7", "unverified"]
    }
  ],
  "stakeholders": {
    "institutions": [
      {"id": "kfw", "name": "KfW", "side": "public-capital", "country": "DE", "units": [{"id": "kfw-sec", "name": "Securitisation investment unit", "roles": [
        {"id": "kfw-sec-head", "role": "Head of the unit investing in SME securitisations", "priority": "P1", "reach": "Warm intro from your credit funds or arranger; else KfW switchboard", "status": "to_approach", "cite": ["w7", "judgement"]},
        {"id": "kfw-sec-officer", "role": "Deal officer for SME ABS", "priority": "P2", "reach": "Forwarded by the head", "status": "to_approach", "cite": ["judgement"]}
      ]}]},
      {"id": "bmwe", "name": "Federal Ministry for Economic Affairs", "side": "political", "country": "DE", "units": [{"id": "bmwe-sme", "name": "SME finance unit", "roles": [
        {"id": "bmwe-head", "role": "Head of unit for SME finance", "priority": "P2", "reach": "Only once KfW engages, to frame the Mittelstand case", "status": "to_approach", "cite": ["unverified"]}
      ]}]}
    ]
  },
  "process_maps": [
    {
      "id": "eif-sec-decision",
      "title": "How an EU fund securitisation deal gets done",
      "explains": "From first enquiry to a guaranteed or anchored slice in your funding structure.",
      "kind": "funding_decision",
      "illustrative": true,
      "leverage": [
        {"id": "lev-prec", "at": "approve", "kind": "precedent", "label": "EU fund and KfW backed a non-bank SME lender's securitisation (2018)", "why": "Both public investors have done this before.", "how": "Lead the enquiry with it; confirm details on an official page.", "side": "public-capital", "cite": ["w7"]}
      ]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "eu-track", "label": "EU fund and KfW", "steps": [
        {"id": "kfw-probe", "label": "Probe KfW's securitisation side, after the EU fund enquiry", "start": 1, "end": 2, "owner": "client", "status": "planned", "depends_on": ["eoi"], "cite": ["w7", "judgement"]},
        {"id": "kfw-loans-no", "label": "Do not approach KfW's SME loan side: wrong function, bank-only", "start": 0, "end": 0.25, "owner": "client", "status": "blocked", "cite": ["w6", "judgement"]}
      ]}
    ]
  }
}
```

**Sources**
- [w6] KfW Gründerplattform, Hausbankprinzip, https://gruenderplattform.de/finanzierung-und-foerderung/hausbankprinzip, retrieved 2026-11-17: "erfolgen die Beantragung und Abwicklung fast aller Angebote der Förderbanken über eine klassische Bank"; "Wenn sie dem Förderkreditantrag zustimmt, reicht sie ihn zusammen mit den Unterlagen bei der Förderbank ein."
- [w7] Alternative Credit Investor, 3 May 2018, https://alternativecreditinvestor.com/2018/05/03/european-investment-fund-and-kfw-back-funding-circle-securitisation/, retrieved 2026-11-17: "with backers including the European Investment Fund (EIF) and German development bank KfW"; six tranches, £206.5m. This is a trade-press report.

## Turn 10: the founder (answer, client_agent)

> Not that I know of. Nobody on our team has talked to KfW at all. The credit funds may have someone there, so I'll ask them and our lawyers this week.

## Turn 10: Wincent

Good. That's the right first move: a warm introduction through your credit funds beats a cold approach (judgement).

**If the funds have no one at KfW, there are two fallbacks, in this order:**
1. **An arranger bank.** Banks that structure SME securitisations deal with the public investors as a matter of routine. A bank arranged the 2018 deal [w7]. If you bring in an arranger for the upsizing, the introduction comes with it (judgement).
2. **The EU fund first, then KfW.** The EU fund has an open, structured way in [w5]. Interest from it is the strongest signal you can carry into KfW (judgement).

**This week, three asks, all on your side:**
- **CFO:** facility maturity, today's advance rate, and whether the facility terms allow third-party credit protection.
- **Lawyers:** who legally holds the loans, the GmbH or the warehouse vehicle.
- **Credit funds:** any contact on KfW's or the EU fund's securitisation side, and whether they would welcome a public investor in the structure.

**Don't approach KfW or the EU fund before the lawyers answer** (judgement). A first meeting that can't say who holds the loans wastes the warm introduction. Regina is working the cross-border permission question in parallel.

**Next:** once you have the answers, I'll draft the EU fund enquiry and the KfW note to suit them. Shall I prepare the drafts now so they're ready to adjust?

```mandate-board
{
  "stage": "advise",
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "prep", "label": "This week", "steps": [
        {"id": "cfo-data", "label": "CFO: maturity, advance rate, third-party protection clause", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "holder", "label": "Lawyers: who holds the loans, GmbH or warehouse vehicle", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "funds-ask", "label": "Credit funds: contacts at KfW or the EU fund; appetite for a public investor", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"]},
        {"id": "reg", "label": "Regina: cross-border lending permission DE, IT, FR", "start": 0, "end": 1, "owner": "us", "status": "active", "cite": ["judgement"]}
      ]},
      {"id": "eu-track", "label": "EU fund and KfW", "steps": [
        {"id": "eoi", "label": "Enquiry to EU fund securitisation team (after lawyers' answer)", "start": 0.5, "end": 1, "owner": "client", "status": "planned", "depends_on": ["holder", "reg"], "cite": ["w5", "judgement"]},
        {"id": "arranger", "label": "Fallback: bring in an arranger bank for the upsizing", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "depends_on": ["funds-ask"], "cite": ["w7", "judgement"]}
      ]}
    ]
  },
  "process_maps": [
    {
      "id": "eif-sec-decision",
      "title": "How an EU fund securitisation deal gets done",
      "explains": "From first enquiry to a guaranteed or anchored slice in your funding structure.",
      "kind": "funding_decision",
      "illustrative": true,
      "leverage": [
        {"id": "lev-funds", "at": "funds", "kind": "door_opener", "label": "Your credit funds' own contacts", "why": "A warm intro to KfW or the EU fund beats a cold approach.", "how": "Founder asks the funds' portfolio managers this week.", "side": "market", "cite": ["judgement"]},
        {"id": "lev-arranger", "at": "structure", "kind": "door_opener", "label": "Arranger bank", "why": "Arrangers work with the public investors routinely; one arranged the 2018 precedent.", "how": "Bring one in for the upsizing if no warm intro exists.", "side": "market", "cite": ["w7", "judgement"]}
      ]
    }
  ],
  "networks": [
    {
      "id": "deal-ties",
      "title": "Who can open the door",
      "explains": "Your credit funds and an arranger are the likely paths to KfW and the EU fund.",
      "nodes": [
        {"id": "client", "label": "Your GmbH", "kind": "body", "cite": ["judgement"]},
        {"id": "funds", "label": "Your two credit funds", "kind": "institution", "cite": ["judgement"]},
        {"id": "arranger", "label": "Arranger bank (to choose)", "kind": "bank", "cite": ["judgement"]},
        {"id": "eif", "label": "European Investment Fund", "kind": "institution", "cite": ["w5"]},
        {"id": "kfw", "label": "KfW", "kind": "bank", "cite": ["w7"]}
      ],
      "edges": [
        {"from": "funds", "to": "client", "kind": "funds", "label": "warehouse", "cite": ["judgement"]},
        {"from": "funds", "to": "kfw", "kind": "works_with", "label": "possible contact, to confirm", "cite": ["unverified"]},
        {"from": "arranger", "to": "eif", "kind": "works_with", "label": "routine on SME securitisations", "cite": ["judgement"]},
        {"from": "eif", "to": "kfw", "kind": "works_with", "label": "co-backed a non-bank SME lender's securitisation, 2018", "cite": ["w7"]}
      ],
      "cite": ["w7", "judgement"]
    }
  ]
}
```

**Sources**
- [w5] EIF, Securitisation, https://www.eif.org/supporting-smes/access-to-finance/securitisation, retrieved 2026-11-17
- [w7] Alternative Credit Investor, 3 May 2018, https://alternativecreditinvestor.com/2018/05/03/european-investment-fund-and-kfw-back-funding-circle-securitisation/, retrieved 2026-11-17: "with backers including the European Investment Fund (EIF) and German development bank KfW". This is a trade-press report.

## Turn 11: the founder (fact_change, script)

> News: we may buy a small Italian lender that already holds a 106 authorisation, closing Q2. Does that change Italy?

## Turn 11: Wincent

Yes, it changes Italy completely. If the deal closes, you would hold the status the Italian fund requires.

**What it opens.** The fund's direct guarantee goes to the lender, and a firm on the Italian lending register counts as one [c7] [c8] [c9]. Once accredited, the same firm can also request cover on whole portfolios of loans [c10] [c11]. That suits your book. Your equipment loans gain a second option too: firms on the register may lend under Italy's subsidised equipment-loan scheme (Nuova Sabatini), but only with a guarantee from a bank that has signed up to it [c12].

**The order matters:**
1. **Before you sign:** in due diligence, check whether the target is already accredited with the fund and how it has used the guarantee. If it is accredited, you save months (judgement).
2. **Closing:** buying control of a registered Italian lender probably needs the Bank of Italy's prior approval (unverified). That goes to Regina, and it may set your real closing date.
3. **After closing:** Italian loans are then signed by the Italian company, not by Berlin. Your warehouse has to be able to fund that company (judgement).

**Not yet:** don't move Italian lending or tell borrowers anything before closing and approval.

**One thing to confirm:** whether the Italian fund's cover and the EU fund's deal can sit on the same Italian loans (unverified). It matters because Italy would be around €100m of the €500m (judgement).

**Question:** do you know if the target already uses the Italian guarantee fund?

```mandate-board
{
  "stage": "advise",
  "routes": {
    "levels": [
      {"id": "it", "level": "national", "label": "Italy", "country": "IT", "doors": [
        {"id": "it-fdg-direct", "name": "Fondo di garanzia, direct guarantee", "institution": "Fondo di garanzia per le PMI", "via": "the acquired Art. 106 lender", "status": "open", "why": "Opens with the acquisition, after closing and approval.", "conditions": ["Closing and any Bank of Italy change-of-control approval", "Accreditation with the fund if not already held"], "cite": ["c7", "c8", "c9", "unverified"]},
        {"id": "it-fdg-portfolio", "name": "Fondo di garanzia, portfolio guarantee", "institution": "Fondo di garanzia per le PMI", "via": "the acquired Art. 106 lender, after accreditation", "status": "open", "why": "The route for a loan book; needs accreditation.", "cite": ["c10", "c11"]},
        {"id": "it-sabatini", "name": "Nuova Sabatini equipment loans", "institution": "Ministry of Enterprises", "via": "Art. 106 lender, guaranteed by a convention bank", "status": "probe", "why": "Fits equipment loans; needs a bank guarantee on the loans.", "cite": ["c12"]}
      ]}
    ]
  },
  "process_maps": [
    {
      "id": "it-acq",
      "title": "Italy: from acquisition to guaranteed loans",
      "explains": "What must happen, in order, before Italian loans carry the state guarantee.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "client", "name": "Your GmbH", "side": "market"},
        {"id": "target", "name": "Acquired Italian Art. 106 lender", "side": "market"},
        {"id": "boi", "name": "Banca d'Italia", "side": "public-capital"},
        {"id": "fdg", "name": "Fondo di garanzia per le PMI", "side": "public-capital"}
      ],
      "steps": [
        {"id": "dd-it", "label": "Due diligence: accreditation status and guarantee history", "kind": "document", "actor": "client", "timing": "before signing", "cite": ["judgement"], "gates": [{"label": "Target on the Art. 106 register", "cite": ["c8"]}]},
        {"id": "approval", "label": "Change-of-control approval", "kind": "decision", "actor": "boi", "timing": "before closing, Q2", "cite": ["unverified"], "gates": [{"label": "Regina confirms the approval requirement and timing", "cite": ["unverified"]}]},
        {"id": "accredit", "label": "Accreditation with the fund (if not already)", "kind": "step", "actor": "fdg", "timing": "after closing", "cite": ["c11"], "gates": [{"label": "Lender is a soggetto finanziatore", "cite": ["c7"]}]},
        {"id": "originate", "label": "Italian loans signed by the Italian lender, guarantee requested", "kind": "step", "actor": "target", "timing": "after accreditation", "cite": ["c9"], "gates": [{"label": "Borrower an SME on the business register", "cite": ["c1"]}, {"label": "Warehouse can fund the Italian entity", "cite": ["judgement"]}]}
      ],
      "flow": [{"from": "dd-it", "to": "approval"}, {"from": "approval", "to": "accredit"}, {"from": "accredit", "to": "originate"}],
      "leverage": [
        {"id": "lev-accr", "at": "dd-it", "kind": "door_opener", "label": "Target already accredited", "why": "Saves the accreditation step.", "how": "Ask in due diligence.", "side": "market", "cite": ["judgement"]}
      ],
      "cite": ["c7", "c8", "c11", "unverified"]
    }
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "it-track", "label": "Italy", "steps": [
        {"id": "it-sub-decision", "label": "Superseded by acquisition: no new subsidiary needed", "start": 12, "milestone": true, "owner": "client", "status": "blocked", "cite": ["judgement"]},
        {"id": "it-close", "label": "Acquisition closing", "start": "2027-06-30", "milestone": true, "owner": "client", "status": "planned", "cite": ["judgement"]},
        {"id": "it-move", "label": "Do not shift Italian origination before closing and approval", "start": 0, "end": 7, "owner": "client", "status": "blocked", "cite": ["judgement"]}
      ]},
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-stack", "label": "Can Italian fund cover and EU fund deal sit on the same Italian loans?", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "it-approval", "kind": "flag", "severity": "high", "title": "Change-of-control approval may set the real closing date", "fix": "Handed to Regina.", "cite": ["unverified"]},
    {"id": "it-funding", "kind": "flag", "severity": "medium", "title": "Warehouse must fund the Italian entity", "fix": "Add to the upsizing term sheet.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- [c1] MIMIT, SME guarantee fund page, https://www.mimit.gov.it/it/incentivi/fondo-di-garanzia-per-le-pmi, sha256 0992743c1ef0
- [c7] [c8] [c9] Fondo di garanzia operating rules 2023, register record urn:mandate:capital:raw/instrument_docs/fondo_di_garanzia_disposizioni_operative_2023.pdf, sha256 10198c227b8c
- [c10] [c11] Portfolio operating rules, circ. 6/2018, https://www.fondidigaranzia.it/wp-content/uploads/2018/06/1_Modalita-operative-portafogli-fin_circ_6-2018.pdf, sha256 68016c68454e
- [c12] DL 69/2013 art. 2 (Nuova Sabatini), https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:2013-06-21;69~art2, sha256 e4993c050802

## Turn 12: the founder (pushback, script)

> My co-founder says we should just apply for a German banking licence and be done with it. Thoughts?

## Turn 12: Wincent

For the guarantees alone, I wouldn't. A banking licence is a big strategic decision, not a shortcut to public cover. Here is the money side; the licence itself goes to Regina.

**What it would open in Germany:** KfW's promotional loans, which run through banks [w6], and probably the regional guarantee banks (unverified). That is real. A licence is a status that opens Germany, so it belongs in the plan as an option with a timeline, not something to dismiss.

**What it doesn't solve:**
- **Your headroom.** At plan pace the facility is full in about three months (judgement). A licence takes far longer than that (unverified; Regina to confirm). The upsizing has to happen anyway.
- **Italy.** A German licence doesn't make you an Italian-registered lender. The acquisition does that [c8].
- **Your aim.** You want better advance rates. KfW products passed on through a bank are loans to your borrowers. They don't improve your own funding structure (judgement).

**Your plan works whichever way this goes.** The EU fund accepts both banks and alternative lenders [w1]. Nothing you do on it now is wasted if you become a bank later (judgement).

**Don't file a licence application now.** It would pull the team away from the upsizing and the Italian deal, which both pay off sooner (judgement).

**Question:** is the licence about guarantees, or about funding the book from deposits? If it's deposits, that's a separate case. Regina should take it, and I'd run the numbers on it separately.

```mandate-board
{
  "stage": "advise",
  "routes": {
    "levels": [
      {"id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
        {"id": "de-licence", "name": "German banking licence (status option)", "institution": "German supervisor (BaFin)", "status": "park", "why": "Would open KfW pass-through and likely Bürgschaftsbanken, but slow and does not lift warehouse advance rates; strategic decision, Regina leads.", "cite": ["w6", "unverified", "judgement"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "licence-now", "kind": "flag", "severity": "medium", "title": "Licence application now would compete with the upsizing and the Italian deal", "fix": "Decide the licence on its own merits (deposits, strategy) with Regina; keep the EU route, which fits either way.", "cite": ["w1", "judgement"]}
  ],
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "watch", "label": "Watchlist", "steps": [
        {"id": "w-licence", "label": "Licence decision: deposits or guarantees? Regina's assessment of time and capital", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}
      ]}
    ]
  }
}
```

**Sources**
- [c8] Fondo di garanzia operating rules 2023, register record urn:mandate:capital:raw/instrument_docs/fondo_di_garanzia_disposizioni_operative_2023.pdf, sha256 10198c227b8c
- [w1] EIF, InvestEU Competitiveness capped guarantee, https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee, retrieved 2026-11-17: eligible intermediaries include "Credit or financial institutions" and "Alternative lenders"
- [w6] KfW Gründerplattform, Hausbankprinzip, https://gruenderplattform.de/finanzierung-und-foerderung/hausbankprinzip, retrieved 2026-11-17

## Turn 13: the founder (answer, if_asked)

> Small, about 30 people, a consumer-loan book around 80 million, based in Milan. It does not lend to SMEs today.

## Turn 13: Wincent

The status is still the right one, but the target isn't a ready-made door. You're buying an authorised Italian lender, not an Italian SME lender with a guarantee history.

**What holds.** A lender on the Italian register can request the fund's guarantee [c7] [c8]. The fund covers SMEs located in Italy [c17], which fits your Italian borrowers.

**What changes:**
- **Accreditation is almost certainly still to do.** A consumer lender has had no reason to use an SME guarantee fund (judgement). Portfolio cover needs accreditation first [c11]. Your track record with Italian SMEs from Berlin is the history you would bring to it (judgement).
- **Its permitted activity may need widening.** The target's authorisation and business plan may cover consumer lending only. Adding SME lending could need the Bank of Italy's involvement (unverified). That goes to Regina, together with the change of control.
- **The €80m consumer book gets nothing from this.** The fund covers SMEs [c1], and so do the EU fund's SME products [w1]. Ask your credit funds early whether they would fund a mixed entity (judgement).

**The upside:** 30 people in Milan is a real Italian operation. It can carry origination and servicing for Italian SMEs, which is what the fund and the Bank of Italy will want to see (judgement).

**Don't value the deal on guarantee access from day one.** On these steps, the first covered loans are more likely around late 2027 (judgement).

**Question:** after closing, will the Milan team originate and service the Italian SME loans, or will Berlin keep doing it with the Italian company only signing?

```mandate-board
{
  "stage": "advise",
  "process_maps": [
    {
      "id": "it-acq",
      "title": "Italy: from acquisition to guaranteed loans",
      "explains": "The target is an Art. 106 consumer lender; SME lending and fund accreditation come after closing.",
      "kind": "funding_decision",
      "illustrative": false,
      "steps": [
        {"id": "dd-it", "label": "Due diligence: authorised activity programme, organisation, any fund history", "kind": "document", "actor": "client", "timing": "before signing", "cite": ["judgement"], "gates": [{"label": "Target on the Art. 106 register", "cite": ["c8"]}, {"label": "Consumer-only today: no fund accreditation expected", "cite": ["judgement"]}]},
        {"id": "approval", "label": "Change-of-control approval and any change to the activity programme for SME lending", "kind": "decision", "actor": "boi", "timing": "before closing, Q2", "cite": ["unverified"], "gates": [{"label": "Regina confirms both requirements and timing", "cite": ["unverified"]}]},
        {"id": "accredit", "label": "Accreditation with the fund", "kind": "step", "actor": "fdg", "timing": "after closing", "cite": ["c11"], "gates": [{"label": "Lender is a soggetto finanziatore", "cite": ["c7"]}, {"label": "SME origination and servicing in place", "cite": ["judgement"]}]},
        {"id": "originate", "label": "Italian SME loans signed by the Italian lender, guarantee requested", "kind": "step", "actor": "target", "timing": "likely late 2027", "cite": ["c9", "judgement"], "gates": [{"label": "Borrower an SME located in Italy", "cite": ["c17"]}, {"label": "Warehouse can fund the Italian entity", "cite": ["judgement"]}]}
      ]
    }
  ],
  "risks_flags": [
    {"id": "it-no-sme", "kind": "flag", "severity": "medium", "title": "Target has no SME lending or fund accreditation", "fix": "Plan accreditation after closing; bring the GmbH's Italian SME track record.", "cite": ["c11", "judgement"]},
    {"id": "it-activity", "kind": "flag", "severity": "high", "title": "Authorised activity may need widening to SME lending", "fix": "Handed to Regina with the change-of-control question.", "cite": ["unverified"]},
    {"id": "it-consumer", "kind": "flag", "severity": "low", "title": "EUR 80m consumer book is outside SME guarantees", "fix": "Ask the credit funds how they would fund a mixed entity.", "cite": ["c1", "w1", "judgement"]}
  ],
  "stakeholders": {
    "institutions": [
      {"id": "target", "name": "Acquired Milan lender", "side": "market", "country": "IT", "units": [{"id": "target-mgmt", "name": "Management", "roles": [
        {"id": "target-ceo", "role": "Managing director", "priority": "P2", "reach": "Through the acquisition talks", "status": "engaged", "cite": ["judgement"]}
      ]}]}
    ]
  }
}
```

**Sources**
- [c1] MIMIT, SME guarantee fund page, https://www.mimit.gov.it/it/incentivi/fondo-di-garanzia-per-le-pmi, sha256 0992743c1ef0
- [c7] [c8] [c9] [c17] Fondo di garanzia operating rules 2023, register record urn:mandate:capital:raw/instrument_docs/fondo_di_garanzia_disposizioni_operative_2023.pdf, sha256 10198c227b8c. [c17]: "“Soggetti beneficiari finali”: le PMI e i Professionisti ubicati (aventi sede legale ovvero sede operativa) sul territorio italiano"
- [c11] Portfolio operating rules, circ. 6/2018, https://www.fondidigaranzia.it/wp-content/uploads/2018/06/1_Modalita-operative-portafogli-fin_circ_6-2018.pdf, sha256 68016c68454e
- [w1] EIF, InvestEU Competitiveness capped guarantee, https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee, retrieved 2026-11-17

## Turn 14: the founder (answer, if_asked)

> Small, about 30 people, a consumer-loan book around 80 million, based in Milan. It does not lend to SMEs today.

## Turn 14: Wincent

Noted. That's the picture I used in my last reply, so the Italian plan stands: accreditation after closing, a possible widening of the target's permitted activity, and the consumer book outside SME cover.

**One thing it adds: the target's own banks.** A Milan lender with an €80m book is funded by someone, probably Italian banks or a securitisation (judgement). Some Italian funders have backed non-bank SME lenders before. The EU fund invested €50m in a securitisation of state-guaranteed SME loans made by two Italian non-bank lenders (unverified; seen in search results only, to confirm on the official page). Once the Milan entity lends to SMEs, its existing funders are the first to ask about funding the new book. Because those loans carry the state guarantee, they are cheaper to fund (judgement).

**Two questions, both for the due diligence:**
1. **Who funds the target's book today:** which banks or vehicles, and on what terms?
2. **After closing,** will the Milan team originate and service the Italian SME loans, or will Berlin keep doing it? That decides what the Bank of Italy and the fund will look at (judgement).

If it's easier, we can park both until your lawyers and CFO come back this week, and I'll pull it all together then.

```mandate-board
{
  "stage": "advise",
  "routes": {
    "levels": [
      {"id": "it", "level": "national", "label": "Italy", "country": "IT", "doors": [
        {"id": "it-target-funders", "name": "Target's existing funders for a guaranteed SME book", "institution": "The Milan lender's banks or vehicles (to identify)", "status": "probe", "why": "State-guaranteed SME loans are cheaper to fund; the target's funders are the first ask.", "cite": ["judgement"]},
        {"id": "it-eif-sec", "name": "EU fund investment in a securitisation of guaranteed Italian SME loans", "institution": "European Investment Fund", "status": "probe", "why": "Reported precedent with two Italian non-bank lenders; to confirm on the official page.", "cite": ["unverified"]}
      ]}
    ]
  },
  "risks_flags": [
    {"id": "it-funders", "kind": "flag", "severity": "low", "title": "Target's funding lines unknown", "fix": "Ask in due diligence: who funds the EUR 80m book and on what terms.", "cite": ["judgement"]}
  ]
}
```

**Sources**
- No new sources this turn. The Italian non-bank precedent appeared in a search result only and is unverified until I confirm it on the EU fund's own page.

## Turn 15: the founder (answer, if_asked)

> Small, about 30 people, a consumer-loan book around 80 million, based in Milan. It does not lend to SMEs today.

## Turn 15: Wincent

Same details again, so nothing changes. I have the target down as a Milan consumer lender with about 30 staff, an €80m book and no SME lending, and the plan already reflects that.

To move forward, pick one:
1. **Answer the open questions.** Who funds the target's book today, and will Milan or Berlin run the Italian SME lending after closing?
2. **Wait for this week's answers** from your lawyers (who holds the loans), CFO (maturity, advance rate, facility clauses) and credit funds (KfW or EU fund contacts). Then I'll draft the EU fund enquiry and the KfW note.
3. **Get the brief now.** I'd write up the whole plan for you and your co-founder, with the open points marked.

Which would help most?

```mandate-board
{
  "stage": "advise"
}
```

## Turn 16: the founder (answer, if_asked)

> Small, about 30 people, a consumer-loan book around 80 million, based in Milan. It does not lend to SMEs today.

## Turn 16: Wincent

I have this already, and it's the fourth time it has come through. Your messages may be re-sending, so please check.

I'll treat the two Italy questions as open until your due diligence answers them. They are who funds the target's book today, and whether Milan or Berlin runs the Italian SME lending after closing. Nothing else in the plan waits on them.

**What we're waiting on this week:**
- **Lawyers:** who legally holds the loans.
- **CFO:** facility maturity, advance rate, and whether the facility allows third-party protection.
- **Credit funds:** any contact at KfW or the EU fund.

Send me those when you have them, or tell me to write the brief now with the gaps marked.

```mandate-board
{
  "stage": "advise",
  "risks_flags": [
    {"id": "it-open", "kind": "flag", "severity": "low", "title": "Open for due diligence: target's funders; who runs Italian SME lending after closing", "fix": "Answer in due diligence; does not block the EU route or the upsizing.", "cite": ["judgement"]}
  ]
}
```
