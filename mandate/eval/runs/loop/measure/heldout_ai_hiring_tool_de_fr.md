# Loop run: heldout_ai_hiring_tool_de_fr (measure)

Case: `mandate/eval/scenarios/heldout_ai_hiring_tool_de_fr.yaml`. Brain: Regina. Playbooks at 65b8f72925. One-reply re-test on the bench (no API spend), 2026-11-13T09:34:41+00:00, 271.2s.
Leave-one-out case library: 0 entries derived from this case left out; reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We are a Dutch B2B software company. Our product screens and ranks job applicants' CVs with AI for large employers. We want to sell in Germany and France from 2027. What regulation applies to us and to our customers, what must we have in place before the first contract, and who should we be talking to?
> 
> More about us, so you can answer in one go: Dutch BV, 40 staff, Amsterdam. The product takes CVs and application answers, scores them against the job profile and ranks candidates; recruiters see the ranking and decide whom to interview. It runs on our own models trained on anonymised historic hiring data from customers. No video, no voice, no emotion inference. Customers would be employers with 1,000 or more staff. We have a DPO and ISO 27001.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Regina's answer

# AI CV screening and ranking, sold to large employers in Germany and France from 2027

## 1. Answer

1. **You can sell this, but you are the provider of a high-risk AI system.** The AI Act's high-risk list names exactly what you do: systems used "to analyse and filter job applications, and to evaluate candidates" [c2].
2. **Saying the recruiter decides does not take you out of scope.** The exception for systems that do not materially affect the decision is closed when the system profiles people [c8]. Scoring candidates against a job profile is profiling (judgement). The definition covers predicting a person's "performance at work" [c27].
3. **Your timeline spans the AI Act deadline.** The high-risk duties for systems like yours apply from 2 December 2027 [w1]. Contracts signed in 2027 will run past that date, so sell a system built to the high-risk standard from the first contract (judgement).
4. **Data protection and labour law already apply today.** In Germany each customer needs works-council agreement before go-live [w2][w3]. In France candidates and the staff committee must be informed (unverified).
5. **Two things decide the case.** First, whether your training on customers' historic hiring data is lawful. Second, whether recruiters' review of the ranking is real (judgement).

## 2. The rules that decide it

| Regime | What it requires | Of whom | From when |
|---|---|---|---|
| **EU AI Act, high-risk list (Annex III 4(a))** | Classifies recruitment and selection systems as high-risk [c2]. The stated reason is the risk of repeating "historical patterns of discrimination" [c4] | You | 2 Dec 2027 [w1] |
| **EU AI Act Art. 6(3)–(4)** | Systems that profile people are always high-risk. Anyone claiming an exception must document it and register [c8] | You | Same |
| **EU AI Act Art. 16–17** | A quality management system, technical documentation, logs, conformity assessment, an EU declaration of conformity, CE marking, registration in the EU database, and accessibility [c18] | You | Same |
| **EU AI Act Art. 43, assessment route** | For this category you assess yourself (internal control); no outside certification body is needed (unverified: confirm in Art. 43(2) and Annex VI) | You | Same |
| **EU AI Act Art. 26** | Keep logs for at least 6 months [c12]. Inform staff representatives and affected workers before use at the workplace [c12]. Tell people the system is being used on them [c14] | Customer | Same |
| **EU AI Act Art. 86** | Affected people can ask for "clear and meaningful explanations" of the system's role in the decision [c7] | Customer, but you supply the material | Same |
| **EU AI Act Art. 27 (rights impact assessment)** | Does not apply to private employers (unverified: confirm the scope in Art. 27(1)) | Public bodies only | n/a |
| **AI Omnibus (Reg. 2026/1744)** | Simplified technical documentation and quality-system rules for SMEs [w1] | You, at 40 staff, if you have no partner or linked companies | In force |
| **GDPR Art. 22** | No decision based solely on automated processing that significantly affects people. The recital names "e-recruiting practices without any human intervention" [c27][c28] | Customer (controller) | Now |
| **Germany: BetrVG §95** | Selection guidelines for hiring "bedürfen der Zustimmung des Betriebsrats" (need the works council's consent). This applies expressly when AI is used [w2] | German customers | Now |
| **Germany: BetrVG §87(1) Nr. 6** | The works council co-decides on technical systems able to monitor staff performance [w3]. Recruiters' activity logs can trigger this (judgement) | German customers | Now |
| **France: Code du travail L1221-8, L1221-9, L2312-38** | Candidates are told in advance which methods are used on them. Methods must be relevant to the purpose. The staff committee (CSE) is informed before use (unverified: confirm on Légifrance) | French customers | Now |

## 3. What it means for you

- **No exception filing.** Do not file an Art. 6(3) exception. The profiling rule shuts that door [c8].
- **Human review must be meaningful.** The Court of Justice's SCHUFA judgment [c28] means a score that the user "draws strongly on" can itself count as a decision (judgement). If recruiters never open the bottom of the list, the ranking may be the decision under Art. 22. Practical consequences (judgement):
  - Build review into the product: show reasons, offer "view all candidates" by default, and never auto-reject.
- **Your two GDPR roles.** For screening you are the customer's processor (judgement). For training your own models on customer data you are probably a controller, with your own legal basis to show (judgement).
  - "Anonymised" only takes data outside the GDPR if nobody can reasonably re-identify people (unverified).
  - If you are a controller, your lead regulator is the Dutch data protection authority, the AP (judgement).
- **German regulator.** The Bundesnetzagentur is the AI market surveillance authority and covers "certain AI systems in workers' management" [w4].
- **French regulator.** France has not yet designated its AI Act authority by law. The CNIL is expected to cover employment (unverified, secondary sources). The CNIL already supervises data protection either way.

## 4. Deal-breakers and sequencing

1. **This week: fix the intended-use statement.** "Ranks and explains; the recruiter decides; no auto-rejection." Everything else follows from it (judgement).
2. **This month: legal review of the training data.** This is the one possible deal-breaker. Check whether customers' contracts allowed you to reuse their historic hiring data, and whether it is truly anonymous. Check bias in that history [c4].
3. **This quarter: build the customer pack.**
   - Data processing agreement, a draft impact assessment (DPIA) for the customer, instructions for use, the log design and the Art. 86 explanation output.
   - Germany: a works-council pack with a draft annex for the works agreement (Betriebsvereinbarung).
   - France: an information note for the CSE and a candidate notice.
4. **Through 2027: the AI Act build.**
   - Extend ISO 27001 into a quality management system for AI (ISO/IEC 42001 is a good frame, judgement).
   - Add bias testing and post-market monitoring.
   - Finish the self-assessment, the declaration of conformity and the EU database registration before 2 December 2027 [c18][w1].
5. **Not yet, and not at all:**
   - Do not claim "AI Act certified" or "bias-free" (judgement).
   - Do not plan on systems already on the market being exempt. Continuous retraining likely counts as a significant change (unverified, Art. 111).
   - Do not approach regulators before steps 1 and 2 are done.

## 5. People to engage

- **German customers.** The works council (Gesamtbetriebsrat or Konzernbetriebsrat) is P1 in practice: no consent, no go-live [w2]. HR and the company's data protection officer are P2.
- **French customers.** The HR director (DRH) decides (P1). The DPO and the CSE secretary influence (P2).
- **Bundesnetzagentur AI Service Desk.** For informal orientation (P2). It offers guidance and a risk-check tool for SMEs [w4].
- **CNIL AI service and the Dutch AP.** Data protection, and in France probably AI supervision too (P2, unverified).
- **Shaping the rules (P2).** The harmonised standards will define what "compliant" means. Your door in is NEN's mirror committee to the European standards committee CEN-CENELEC JTC 21. In Germany, DGB-affiliated union tech advisers shape the works-council templates (judgement).

## 6. Positioning

Grounded claims:
- "Recruiters decide. Every ranking is explained and logged."
- "Built to the provider duties for recruitment AI, with conformity before December 2027."

Never claim:
- "Not high-risk."
- "Anonymised, so GDPR does not apply."
- "Bias-free."

## 7. Watches

- **AI Act deadline.** The 2 December 2027 date [w1]. Confirm it against the official EUR-Lex text.
- **Harmonised standards (JTC 21).** Status not checked (unverified).
- **Commission guidelines on high-risk classification.** Status not checked (unverified).
- **France's AI authority.** The DDADUE bill that designates it is reportedly stalled in the Assemblée nationale (unverified).
- **EU algorithmic-management initiative.** Possible new employment rules (unverified).
- **CJEU case law on Art. 22.**

## 8. Outreach draft (to a German pilot customer's CHRO)

> Dear [title, name],
> We are [company], an Amsterdam provider of AI-supported candidate ranking. Recruiters always decide.
> Because §95 BetrVG requires the works council's consent for AI-supported selection guidelines, we propose a joint session with your Gesamtbetriebsrat before any pilot. We will bring a draft works-agreement annex, our instructions for use and our logging design.
> Could we hold 60 minutes in [month]?
> Kind regards, [name]

**Funding:** your AI Act compliance build may qualify for public co-funding. Wincent should check that; it is not covered here.

## 9. Sources

**Legal database (sha256 prefix):**
- c2, c4, c7, c8, c11, c12, c14, c18: AI Act, Regulation 2024/1689 (in force), [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689), `88f67b161883`
- c27: GDPR recital 71, [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679), `cb72d7ec5ad1`
- c28: CJEU C-634/21 *SCHUFA*, [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62021CJ0634), `b35a2a39aa97`

**Web, retrieved 13 Nov 2026:**
- w1: [artificialintelligenceact.eu, Digital Omnibus explorer](https://artificialintelligenceact.eu/ai-act-explorer/digital-omnibus/) (secondary reproduction): "2 December 2027 as regards AI systems classified as high-risk pursuant to Article 6(2) and Annex III". The official copy on [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2026/1744/oj?locale=en) would not load.
- w2: [gesetze-im-internet.de, §95 BetrVG](https://www.gesetze-im-internet.de/betrvg/__95.html): "…bedürfen der Zustimmung des Betriebsrats"; "…wenn bei der Aufstellung der Richtlinien … Künstliche Intelligenz zum Einsatz kommt"
- w3: [gesetze-im-internet.de, §87 BetrVG](https://www.gesetze-im-internet.de/betrvg/__87.html): "…technischen Einrichtungen, die dazu bestimmt sind, das Verhalten oder die Leistung der Arbeitnehmer zu überwachen"
- w4: [Bundesnetzagentur press release, 29 Jul 2026](https://bundesnetzagentur.de/SharedDocs/Pressemitteilungen/EN/2026/20260729_KI_VO.html): "market surveillance authority, single point of contact and point for complaints"; "certain AI systems in workers' management"

**Leads only, not relied on** (secondary): [Dalloz actualité on L1221-8](https://www.dalloz-actualite.fr/article/recrutement-et-utilisation-des-donnees-internet), [Chartia on French AI supervision](https://chartia.fr/questions/qui-controle-ai-act-france), [Gibson Dunn on the Omnibus](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/).

## 10. Questions for you

1. **Did your customer contracts allow you to reuse their hiring data for training?** This decides whether there is a deal-breaker.
2. **Is there any score cut-off or automatic rejection?** This decides how exposed you are under GDPR Art. 22.
3. **Does the model see photos, names, age or other proxies for protected traits?** This sets your bias and discrimination exposure.
4. **Will you sell through applicant-tracking systems under their brand?** This can change who counts as the provider.
5. **Will any customer be a public body?** If so, that customer must run the Art. 27 rights impact assessment.

```mandate-board
{
  "title": "AI CV ranking: Germany and France from 2027",
  "stage": "write_up",
  "answer": {
    "lines": [
      "You are the provider of a high-risk AI system; profiling closes the exemption.",
      "Annex III duties apply from 2 December 2027; build to them from the first 2027 contract.",
      "Before go-live: GDPR roles, a lawful training-data basis, German works-council consent, French candidate and CSE information."
    ],
    "confidence": "high",
    "confidence_why": "Annex III names the use; the profiling clause is explicit; national labour rules partly unverified for France.",
    "open_question": "Did customer contracts allow reuse of their hiring data for training?",
    "cite": ["c2", "c8", "w1", "w2"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU AI Act and GDPR", "doors": [
      { "id": "eu-hr", "name": "Comply as Annex III high-risk provider", "institution": "National market surveillance authorities", "status": "open", "why": "Self-assessed conformity, declaration, CE marking, EU database registration before 2 Dec 2027.", "conditions": ["Quality management system", "Technical documentation", "Logs and human oversight", "Registration Art. 49(1)"], "cite": ["c2", "c18", "w1"] },
      { "id": "eu-63", "name": "Claim not high-risk under Art. 6(3)", "institution": "Provider self-assessment", "status": "shut", "why": "An Annex III system that profiles people is always high-risk.", "cite": ["c8"] }
    ] },
    { "id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
      { "id": "de-br", "name": "Works-council consent per customer", "institution": "Customer works council", "status": "open", "why": "AI-supported selection guidelines need works-council consent.", "conditions": ["Works agreement annex", "Monitoring co-determination"], "cite": ["w2", "w3"] }
    ] },
    { "id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
      { "id": "fr-cse", "name": "Candidate and CSE information", "institution": "Customer CSE", "status": "open", "why": "Prior information of candidates and staff committee on recruitment methods.", "cite": ["unverified"] }
    ] },
    { "id": "nl", "level": "national", "label": "Netherlands (home)", "country": "NL", "doors": [
      { "id": "nl-ap", "name": "Lead GDPR authority for training as controller", "institution": "Dutch data protection authority", "status": "probe", "why": "If you are controller for training, the AP leads under one-stop-shop.", "cite": ["judgement"] }
    ] },
    { "id": "lobby", "level": "lobby", "label": "Shape the rules", "doors": [
      { "id": "std", "name": "Harmonised standards via NEN mirror committee", "institution": "CEN-CENELEC JTC 21", "status": "probe", "why": "Standards will define what compliant means for recruitment AI.", "cite": ["unverified"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "lead", "label": "Compliance build", "steps": [
      { "id": "use", "label": "Fix intended-use statement (no auto-rejection)", "start": 0, "end": 0.25, "owner": "client", "status": "active", "cite": ["judgement"] },
      { "id": "data", "label": "Legal review of training data basis and anonymisation", "start": 0.25, "end": 1.5, "owner": "client", "status": "planned", "depends_on": ["use"], "cite": ["judgement"] },
      { "id": "pack", "label": "Customer pack: DPA, DPIA template, instructions for use, DE works-council annex, FR CSE note", "start": 1, "end": 3, "owner": "client", "status": "planned", "depends_on": ["use"], "cite": ["c12", "w2"] },
      { "id": "first", "label": "First contract", "start": 2, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["data", "pack"], "cite": ["judgement"] },
      { "id": "qms", "label": "QMS, technical documentation, bias testing, post-market monitoring", "start": 1, "end": 11, "owner": "client", "status": "planned", "cite": ["c18"] },
      { "id": "doc", "label": "Conformity, declaration, CE marking, EU database registration", "start": "2027-12-02", "milestone": true, "owner": "client", "status": "planned", "depends_on": ["qms"], "cite": ["c18", "w1"] },
      { "id": "no-claim", "label": "Do not claim 'AI Act certified' or file an Art. 6(3) exemption", "start": 0, "end": 12, "owner": "client", "status": "blocked", "cite": ["c8", "judgement"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-date", "label": "Annex III date 2 Dec 2027: confirm against EUR-Lex text", "start": 0.5, "milestone": true, "owner": "us", "status": "planned", "cite": ["w1"] },
      { "id": "w-std", "label": "Harmonised standards for high-risk AI", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-fr", "label": "French AI authority designation (DDADUE bill)", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] },
      { "id": "w-algo", "label": "EU algorithmic-management initiative", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "de-cust", "name": "German customer", "side": "market", "country": "DE", "units": [
      { "id": "de-br", "name": "Works council", "roles": [
        { "id": "gbr", "role": "Chair of the group or company works council", "priority": "P1", "reach": "Through the customer's HR, joint session", "status": "to_approach", "cite": ["w2"] },
        { "id": "de-dpo", "role": "Customer data protection officer", "priority": "P2", "reach": "Through HR at contract stage", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "fr-cust", "name": "French customer", "side": "market", "country": "FR", "units": [
      { "id": "fr-hr", "name": "HR and CSE", "roles": [
        { "id": "drh", "role": "HR director", "priority": "P1", "reach": "Sales lead", "status": "to_approach", "cite": ["judgement"] },
        { "id": "cse", "role": "CSE secretary", "priority": "P2", "reach": "Through the HR director", "status": "to_approach", "cite": ["unverified"] }
      ] }
    ] },
    { "id": "bnetza", "name": "Bundesnetzagentur", "side": "political", "country": "DE", "units": [
      { "id": "desk", "name": "AI Service Desk", "roles": [
        { "id": "desk-r", "role": "AI Service Desk team", "priority": "P2", "reach": "Service desk contact on the official site", "status": "to_approach", "cite": ["w4"] }
      ] }
    ] },
    { "id": "cnil", "name": "CNIL", "side": "political", "country": "FR", "units": [
      { "id": "cnil-ai", "name": "AI service", "roles": [
        { "id": "cnil-r", "role": "AI service head", "priority": "P2", "reach": "Official contact channel", "status": "to_approach", "cite": ["unverified"] }
      ] }
    ] },
    { "id": "nen", "name": "NEN (Dutch standards body)", "side": "political", "country": "NL", "units": [
      { "id": "nen-ai", "name": "Mirror committee to CEN-CENELEC JTC 21", "roles": [
        { "id": "nen-r", "role": "Committee secretary", "priority": "P2", "reach": "Membership application", "status": "to_approach", "cite": ["unverified"] }
      ] }
    ] }
  ] },
  "funding_stack": { "currency": "EUR", "need": { "label": "Conformity build through 2027 (to be sized)" },
    "instruments": [
      { "id": "cofund", "name": "Public co-funding for the compliance build (Wincent to check)", "type": "grant", "terms": "Would carry build cost; cheap if found, not yet assessed", "status": "probe", "cite": ["unverified"] }
    ] },
  "process": [
    { "id": "de-rollout", "title": "German customer go-live", "caption": "No works-council consent, no go-live.",
      "nodes": [
        { "id": "client", "label": "You", "kind": "client" },
        { "id": "hr", "label": "Customer HR", "kind": "customer" },
        { "id": "br", "label": "Works council", "kind": "institution" },
        { "id": "cand", "label": "Candidates", "kind": "other" }
      ],
      "edges": [
        { "from": "client", "to": "hr", "label": "instructions for use, DPIA draft, agreement annex", "kind": "info" },
        { "from": "hr", "to": "br", "label": "selection guideline for consent", "kind": "info" },
        { "from": "hr", "to": "cand", "label": "notice of AI use, explanation on request", "kind": "info" }
      ], "cite": ["w2", "c14", "c7"] }
  ],
  "risks_flags": [
    { "id": "train", "kind": "deal_breaker", "severity": "high", "title": "Training on customers' historic hiring data", "fix": "Legal review of contract basis and anonymisation; bias testing of the history.", "cite": ["c4", "judgement"] },
    { "id": "art22", "kind": "flag", "severity": "high", "title": "Ranking may count as the decision under GDPR Art. 22", "fix": "No auto-rejection; show reasons; full list visible; log recruiter review.", "cite": ["c27", "c28", "judgement"] },
    { "id": "claims", "kind": "flag", "severity": "medium", "title": "Overclaiming compliance", "fix": "Never say 'not high-risk', 'certified' or 'bias-free'.", "cite": ["c8", "judgement"] },
    { "id": "fr-auth", "kind": "flag", "severity": "low", "title": "French AI regulator not yet designated", "fix": "Plan for the CNIL; watch the designation bill.", "cite": ["unverified"] }
  ]
}
```
