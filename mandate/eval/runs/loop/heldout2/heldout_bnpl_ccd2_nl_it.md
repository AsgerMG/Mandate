# Loop run: heldout_bnpl_ccd2_nl_it (heldout2)

Case: `mandate/eval/scenarios/heldout_bnpl_ccd2_nl_it.yaml`. Brain: Regina. Playbooks at d81aeceff9. One-reply re-test on the bench (no API spend), 2026-11-17T08:34:02+00:00, 247.6s.
Leave-one-out case library: 0 entries derived from this case left out; reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We offer buy-now-pay-later at online checkouts: consumers pay in three instalments, interest-free, and we charge the merchant. We are Dutch, live in the Netherlands, and want to launch in Italy next year. We hear the new consumer credit rules will catch us. When, what changes, do we need a licence, and who should we talk to?
> 
> More about us, so you can answer in one go: Dutch BV, 60 staff, no credit or payment licence today; we fund the receivables from a warehouse line. Average basket EUR 90, three instalments over 60 days, no interest or fees to the consumer, late fees capped. About 400,000 Dutch customers. We would launch in Italy with the same product through Italian merchants, from the Dutch entity if we can.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Regina's answer

I've worked the whole case below. One limit first: our internal law library could not be reached in this run, so every source is a web source fetched today and marked [wN]. Where I couldn't confirm a point at its official home, I say so.

## Answer

1. **Netherlands: you're caught from 20 November 2026, three days from now.** Until now, BNPL in the Netherlands sat outside AFM supervision because of an exemption. The new rules end that. You need an AFM licence to grant credit, a creditworthiness check, registration of your loans with BKR (the Dutch credit bureau) and an age check, because BNPL will be banned for under-18s [w5].
2. **The Dutch law is late.** The lower house passed it on 6 October 2026. The Senate is still waiting for the government's written reply, and the law has not been published [w4]. One law firm expects publication "niet eerder dan 17 december 2026" (not before 17 December 2026). It reports that the AFM has accepted licence applications since June 2026, and that the licence only takes effect once the law does [w6].
3. **Italy: a Dutch licence will not get you in.** The directive gives a non-bank lender no passport into other member states [w7, secondary]. In Italy, lending to the public "è riservato agli intermediari finanziari autorizzati, iscritti in un apposito albo tenuto dalla Banca d'Italia" (is reserved to authorised financial firms on a Bank of Italy register) [w3].
4. **Restructuring won't avoid the rules in Italy.** Your product is the classic three-party model, and the Bank of Italy reads that model as fully in scope [w1]. Italy has also closed the obvious workaround. If the merchant grants the deferral and sells the receivable to you outright, that still counts as credit offered by a third party, and you carry the lender's duties (art. 122(1-ter) of Italy's consolidated banking law) [w2].
5. **What decides it:** which licence you build on. An AFM credit licence covers the Netherlands only. An Italian authorisation covers Italy only. The one licence that might cover both, a payment institution licence that you passport, still needs checking (see below).

## The rules that decide it

| Regime | What it says | Status today |
|---|---|---|
| EU, Consumer Credit Directive 2 (Directive 2023/2225) | BNPL from a third-party lender is in scope, whatever the price or term. Only a seller's own interest-free deferral, paid within 50 days with no third party involved, stays out [w1][w7]. Every lender must be admitted or registered and supervised (Art. 37). The directive creates no passport [w7]. | National laws were due by 20 Nov 2025 and apply from 20 Nov 2026 [w1][w7]. I found no postponement (unverified; confirm on EUR-Lex). |
| NL, bill 36924 (amends the Financial Supervision Act and the Civil Code) | AFM licence, creditworthiness check, BKR registration, under-18 ban [w5]. The check applies to every credit, including BNPL, with no lighter product category [w6]. | Senate stage. Entry into force will be set by royal decree [w4]. |
| IT, Legislative Decree 212/2025 (amends the consolidated banking law, TUB) | Lending is reserved to authorised firms (art. 106 TUB) [w3]. The decree adds the merchant-assignment rule above (art. 122(1-ter)) and a 40-day carve-out for deferred debit cards [w2]. The Bank of Italy writes the implementing rules [w2]. | In force since 10 Jan 2026. Firms have until 20 Nov 2026 or, if later, 90 days after the Bank of Italy's implementing rules [w1]. |

On direct effect: as a rule, a directive does not bind private companies until it is transposed into national law (judgement). So the Dutch gap is breathing room, not an exemption. Expect the AFM to supervise from the day the law takes effect, and to be lenient for about six months [w6, a law firm's expectation].

## What it means for you

**Netherlands.** Three facts matter:
- Your model (no interest, no fees, late fees capped) does not take you out of scope. A third party offering the credit is enough [w7].
- Your 400,000 customers will need age checks, BKR registration and a creditworthiness check on every purchase [w5][w6].
- The warehouse line probably needs another look, because a licence brings capital and governance demands (judgement). I'm handing that to Wincent.

**Italy: three possible routes.**
- **A. Italian authorisation under art. 106 TUB, through an Italian entity.** This is a clean route that you own [w3]. It is slow, and the capital requirements and timelines are unverified; ask the Bank of Italy's market-access team.
- **B. Become a Dutch payment institution licensed by DNB and passport the licence to Italy.** You would grant credit as a side activity to payments: short-term, up to 12 months, under Art. 18(4) of the Payment Services Directive (PSD2). A secondary source says the directive spares payment and e-money institutions a separate authorisation (unverified; I could not read Art. 37 on EUR-Lex today). If that holds, one licence could cover both countries. Whether your model counts as "credit linked to a payment" needs a written view from DNB and the Bank of Italy before you commit (judgement).
- **C. An Italian bank or authorised lender holds the credit and you run the product.** This is a workaround, not your own route: if the partner walked away, you would lose Italy. Use it only to bridge to A or B (judgement).

I would scope B first. If DNB and the Bank of Italy confirm it, it is the only route where one status opens both markets. Otherwise, go with A (judgement).

I found no precedent of a Dutch non-bank BNPL provider entering Italy under the new regime. Treat this as first-of-a-kind.

## Deal-breakers and sequencing

- **This week:** confirm whether you have filed your AFM application. If not, file now; the AFM has accepted applications since June [w6]. Build the BKR link and the age checks [w5].
- **This month:** ask DNB, in writing, whether route B covers your model. In parallel, ask the Bank of Italy's market-access team the same question.
- **This quarter:** pick route A or B. Map the Italian rules into the product: pre-contract information, creditworthiness checks and the 14-day withdrawal right [w1].
- **Not yet:** don't sign Italian merchants, and don't promise an Italian launch date, until the licence route is settled. Don't use a merchant-sells-the-receivable structure in Italy [w2].

## Who to engage

| Front | Decides (P1) | Influences (P2) |
|---|---|---|
| NL licence | AFM, market-access (licensing) team | Your AFM supervisor once assigned |
| NL rule (still open) | Ministry of Finance, financial markets directorate | Senate finance committee; the Dutch online retail association (unverified) |
| PI/passport route | DNB, licensing team | Your law firm's DNB practice |
| IT authorisation | Bank of Italy, supervision department, market access | Assofin, Italy's consumer credit association (unverified) |
| IT implementing rules | Bank of Italy, under resolutions of the CICR (the interministerial credit committee) [w2] | Ministry of Economy and Finance (MEF), Treasury department (unverified) |

## Positioning and lobby aim

- **Your angle:** "We already apply capped late fees and want proportionate checks." That fits a live political ask. A motion asks for the verification duty under art. 113 of the Dutch conduct-of-business decree (BGfo) to become risk-based [w6].
- **Lobby aim:** checks scaled to a €90, 60-day credit. That change would come through the implementing decree, so the Ministry of Finance is the door (judgement).
- **Never claim** that you are out of scope, or that the Dutch delay exempts you.

## Watches

- Dutch Senate vote and the Staatsblad publication [w4].
- The AFM's guidance on scope for payment methods, which a Dutch parliamentary motion requested [w4].
- The Bank of Italy's implementing rules, which also set Italy's transition date [w1].
- The revision of the EU payment services rules, which could change route B (unverified).

## Outreach draft (to the Bank of Italy, market access)

> Subject: Request for a preliminary meeting: entry into Italian consumer credit by an EU BNPL provider
>
> Dear Sir or Madam,
> We are [name] B.V., a Dutch provider of interest-free three-instalment payments at online checkouts, serving about 400,000 consumers. We plan to offer the same product to Italian consumers through Italian merchants from 2027, in full compliance with Legislative Decree 212/2025.
> We would welcome a short preliminary meeting to understand which authorisation route the Bank expects for our model: authorisation under art. 106 TUB, or activity under a passported payment institution licence.
> Yours faithfully, [CEO], [name] B.V.

## Questions for you

1. Have you filed with the AFM already? That decides whether this week is about filing or about follow-up.
2. Does your entity, or anyone in your group, hold or plan a payment institution or e-money licence? That decides whether route B is realistic.
3. Who carries the credit risk under the warehouse line, and does the lender require a licensed borrower? That decides whether Wincent needs to restructure the funding.
4. Do you report to BKR already, and how do you check age today? Those are the two hardest Dutch builds.

**Wincent:** licensing will change what your warehouse lender asks of you. Worth a funding review alongside this.

## Sources (retrieved 17 Nov 2026)
- [w1] Banca d'Italia, *Note di stabilità finanziaria e vigilanza* n. 50, March 2026, https://www.bancaditalia.it/pubblicazioni/note-stabilita/2026-0050/Note-di-stabilita-finanziaria-e-vigilanza-n-50.pdf: "prevede un periodo di transizione per gli operatori, che si adegueranno alle nuove norme entro il 20 novembre 2026 ovvero, se successivo, entro novanta giorni dall'entrata in vigore delle disposizioni di attuazione"
- [w2] D.lgs. 31 dicembre 2025, n. 212, Normattiva, https://www.normattiva.it/eli/id/2026/01/09/26G00009/ORIGINAL: "si considera offerta di credito da parte di terzi anche quella in cui la dilazione…"
- [w3] art. 106 TUB, Normattiva, https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1993-09-01;385~art106: "è riservato agli intermediari finanziari autorizzati, iscritti in un apposito albo tenuto dalla Banca d'Italia."
- [w4] Eerste Kamer, bill 36924, https://www.eerstekamer.nl/wetsvoorstel/36924_implementatiewet_herziene: "is op 6 oktober 2026 aangenomen door de Tweede Kamer"; "op een bij koninklijk besluit te bepalen tijdstip"
- [w5] Rijksoverheid, 31 Oct 2025, https://www.rijksoverheid.nl/actueel/nieuws/2025/10/31/nieuwe-regels-voor-buy-now-pay-later: "een vergunning moeten aanvragen bij de AFM voor het uitgeven van kredieten"; "verboden voor jongeren onder de 18 jaar"
- [w6] Loyens & Loeff (secondary), https://www.loyensloeff.com/nl/insights/news--events/news/status-ccdii-vergunningaanvraag-en-proportionele-kredietwaardigheidstoetsing/: "De AFM neemt sinds juni 2026 vergunningaanvragen in behandeling"; "niet eerder dan 17 december 2026"
- [w7] private.law (secondary), https://wiki.private.law/en/ccd2-bnpl-eu: "the directive itself creates no passport"; "Once a third party offers it, the exclusion is lost whatever the price and term."

```mandate-board
{
  "title": "Dutch BNPL: new consumer credit rules in NL and entry into Italy",
  "stage": "write_up",
  "answer": {
    "lines": [
      "NL: in scope from 20 Nov 2026; AFM licence, BKR registration, creditworthiness check, under-18 ban.",
      "The Dutch implementing law is late (Senate stage); the AFM already accepts applications.",
      "IT: an AFM credit licence does not reach Italy; Italy reserves lending to firms the Bank of Italy authorises.",
      "Scope the payment-institution passport first; otherwise get art. 106 TUB authorisation in Italy."
    ],
    "confidence": "medium",
    "confidence_why": "Rules are clear; the payment-institution route and EU Art. 37 wording are not yet verified.",
    "open_question": "Have you filed with the AFM, and does the group hold or plan a payment institution licence?",
    "cite": ["w1", "w3", "w4", "w5", "w6", "w7"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "eu-passport", "name": "Passport of a non-bank credit licence", "institution": "None (CCD2 has no passport)", "status": "shut", "why": "The directive creates no passport for non-bank lenders.", "cite": ["w7"] },
      { "id": "eu-pi", "name": "Payment institution licence with ancillary credit, passported", "institution": "DNB, then notified to Bank of Italy", "status": "probe", "why": "Could open both markets with one licence; whether it covers your model is unconfirmed.", "conditions": ["Written view from DNB", "Written view from Bank of Italy"], "cite": ["unverified"] }
    ] },
    { "id": "nl", "level": "national", "label": "Netherlands", "country": "NL", "doors": [
      { "id": "nl-afm", "name": "AFM credit licence", "institution": "AFM", "status": "open", "why": "Required for BNPL; applications accepted since June 2026; takes effect with the law.", "conditions": ["Creditworthiness check", "BKR registration", "Age check, no under-18s"], "cite": ["w5", "w6"] }
    ] },
    { "id": "it", "level": "national", "label": "Italy", "country": "IT", "doors": [
      { "id": "it-106", "name": "Authorisation under art. 106 TUB", "institution": "Banca d'Italia", "status": "open", "why": "The own route into Italy; slow and needs an Italian set-up.", "cite": ["w3"] },
      { "id": "it-partner", "name": "Italian licensed lender holds the credit (workaround)", "institution": "Italian bank or authorised lender", "status": "park", "why": "Borrowed status; only as a bridge.", "cite": ["judgement"] },
      { "id": "it-merchant", "name": "Merchant grants deferral, you buy the receivable", "institution": "n/a", "status": "shut", "why": "Art. 122(1-ter) TUB treats this as third-party credit.", "cite": ["w2"] }
    ] },
    { "id": "lobby", "level": "lobby", "label": "Rule change", "doors": [
      { "id": "lobby-prop", "name": "Proportionate checks for low-value BNPL", "institution": "Dutch Ministry of Finance", "status": "probe", "why": "A motion asks for a risk-based verification duty under the conduct-of-business decree (art. 113 BGfo).", "cite": ["w6"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "nl", "label": "Netherlands compliance", "steps": [
      { "id": "afm-file", "label": "File or complete the AFM licence application", "start": 0, "end": 0.5, "owner": "client", "status": "active", "cite": ["w6"] },
      { "id": "bkr-age", "label": "Build BKR registration, creditworthiness check and age check", "start": 0, "end": 3, "owner": "client", "status": "planned", "cite": ["w5"] },
      { "id": "nl-live", "label": "Dutch law in force; licence takes effect", "start": "2027-01-01", "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["afm-file"], "cite": ["w6", "unverified"] }
    ] },
    { "id": "it", "label": "Italy entry", "steps": [
      { "id": "pi-q", "label": "Written questions to DNB and Bank of Italy on the payment-institution route", "start": 0.25, "end": 2, "owner": "client", "status": "planned", "cite": ["judgement"] },
      { "id": "choose", "label": "Choose the route: payment institution passport or art. 106 TUB", "start": 3, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["pi-q"], "cite": ["judgement"] },
      { "id": "no-merchants", "label": "Sign Italian merchants (blocked until the licence route is settled)", "start": 3, "end": 9, "owner": "client", "status": "blocked", "depends_on": ["choose"], "cite": ["judgement"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-ek", "label": "Dutch Senate vote and Staatsblad publication of bill 36924", "start": 1, "milestone": true, "owner": "us", "status": "planned", "cite": ["w4"] },
      { "id": "w-afm", "label": "AFM guidance on scope for payment methods (requested by motion)", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["w4"] },
      { "id": "w-bdi", "label": "Bank of Italy implementing rules (sets Italy's transition date)", "start": 2, "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"] },
      { "id": "w-psd", "label": "Revision of the EU payment services rules (affects the payment-institution route)", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "afm", "name": "AFM", "side": "political", "country": "NL", "units": [
      { "id": "afm-lic", "name": "Market access (licensing)", "roles": [
        { "id": "afm-p1", "role": "Head of licensing", "priority": "P1", "reach": "AFM licensing portal and contact line", "status": "to_approach", "cite": ["w6"] },
        { "id": "afm-p2", "role": "Assigned supervisor", "priority": "P2", "reach": "Through the application", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "minfin", "name": "Dutch Ministry of Finance", "side": "political", "country": "NL", "units": [
      { "id": "minfin-fm", "name": "Financial markets directorate", "roles": [
        { "id": "minfin-p1", "role": "Head of the consumer credit file", "priority": "P1", "reach": "Through the industry association or a direct request", "status": "to_approach", "cite": ["judgement"] },
        { "id": "ek-p2", "role": "Senate finance committee members", "priority": "P2", "reach": "Committee clerk", "status": "to_approach", "cite": ["w4"] }
      ] }
    ] },
    { "id": "dnb", "name": "DNB", "side": "political", "country": "NL", "units": [
      { "id": "dnb-lic", "name": "Licensing (payment institutions)", "roles": [
        { "id": "dnb-p1", "role": "Head of payment institution licensing", "priority": "P1", "reach": "DNB open book / licensing intake", "status": "to_approach", "cite": ["unverified"] },
        { "id": "dnb-p2", "role": "Counsel's DNB practice", "priority": "P2", "reach": "Your law firm", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "bdi", "name": "Banca d'Italia", "side": "political", "country": "IT", "units": [
      { "id": "bdi-acc", "name": "Supervision, market access", "roles": [
        { "id": "bdi-p1", "role": "Head of market access for financial firms", "priority": "P1", "reach": "Formal letter (draft in report)", "status": "to_approach", "cite": ["w3"] },
        { "id": "assofin-p2", "role": "Assofin regulatory desk", "priority": "P2", "reach": "Membership or introduction", "status": "to_approach", "cite": ["unverified"] }
      ] }
    ] }
  ] },
  "funding_stack": { "currency": "EUR", "instruments": [
    { "id": "warehouse", "name": "Existing warehouse line for receivables", "type": "loan", "terms": "Funds the receivables; licensing may change covenants and capital needs. Wincent to review.", "status": "secured", "cite": ["judgement"] }
  ] },
  "process_maps": [
    { "id": "nl-bill", "title": "How the Dutch implementing law reaches force", "explains": "Where bill 36924 stands and where it can still move.", "kind": "legislative", "illustrative": false,
      "actors": [
        { "id": "tk", "name": "Tweede Kamer", "side": "political" },
        { "id": "ek", "name": "Eerste Kamer, finance committee", "side": "political" },
        { "id": "gov", "name": "Ministry of Finance", "side": "political" },
        { "id": "afm", "name": "AFM", "side": "political" }
      ],
      "steps": [
        { "id": "tk-vote", "label": "Lower house adopted the bill (6 Oct 2026)", "kind": "decision", "actor": "tk", "timing": "done", "cite": ["w4"] },
        { "id": "ek-report", "label": "Senate committee report (3 Nov); government reply pending", "kind": "document", "actor": "ek", "timing": "now", "cite": ["w4"] },
        { "id": "ek-vote", "label": "Senate vote and publication", "kind": "decision", "actor": "ek", "timing": "not before 17 Dec 2026", "cite": ["w6"] },
        { "id": "kb", "label": "Royal decree sets entry into force", "kind": "decision", "actor": "gov", "timing": "after publication", "cite": ["w4"] },
        { "id": "afm-lic", "label": "Licences filed since June take effect", "kind": "step", "actor": "afm", "timing": "at entry into force", "cite": ["w6"] }
      ],
      "flow": [ { "from": "tk-vote", "to": "ek-report" }, { "from": "ek-report", "to": "ek-vote" }, { "from": "ek-vote", "to": "kb" }, { "from": "kb", "to": "afm-lic" } ],
      "leverage": [
        { "id": "lv-prop", "at": "gov", "kind": "pressure_point", "label": "Risk-based verification under the conduct-of-business decree (art. 113 BGfo)", "why": "A motion already asks for it; the decree is the government's to amend.", "how": "Policy lead to the financial markets directorate with data on €90, 60-day credits.", "side": "political", "cite": ["w6"] },
        { "id": "lv-window", "at": "ek-report", "kind": "timing_window", "label": "Government reply to the Senate", "why": "Last moment to shape how proportionality is explained.", "how": "Through the industry association before the reply is sent.", "side": "political", "cite": ["w4", "judgement"] }
      ],
      "cite": ["w4", "w6"] }
  ],
  "risks_flags": [
    { "id": "nl-licence", "kind": "deal_breaker", "severity": "high", "title": "No AFM licence when the law takes effect", "fix": "File now; build BKR registration and the age check.", "cite": ["w5", "w6"] },
    { "id": "it-passport", "kind": "deal_breaker", "severity": "high", "title": "Italy cannot be served on a Dutch credit licence", "fix": "Payment-institution passport (to verify) or art. 106 TUB authorisation.", "cite": ["w3", "w7"] },
    { "id": "it-struct", "kind": "flag", "severity": "medium", "title": "Merchant-assignment structure still counts as third-party credit in Italy", "fix": "Do not use it to avoid the rules.", "cite": ["w2"] },
    { "id": "funding", "kind": "flag", "severity": "medium", "title": "Warehouse line terms under a licensed model", "fix": "Wincent reviews covenants and capital needs.", "cite": ["judgement"] }
  ]
}
```
