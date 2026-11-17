# Loop run: heldout_ai_hiring_tool_de_fr (heldout2)

Case: `mandate/eval/scenarios/heldout_ai_hiring_tool_de_fr.yaml`. Brain: Regina. Playbooks at d81aeceff9. One-reply re-test on the bench (no API spend), 2026-11-17T08:35:05+00:00, 309.8s.
Leave-one-out case library: 0 entries derived from this case left out; reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We are a Dutch B2B software company. Our product screens and ranks job applicants' CVs with AI for large employers. We want to sell in Germany and France from 2027. What regulation applies to us and to our customers, what must we have in place before the first contract, and who should we be talking to?
> 
> More about us, so you can answer in one go: Dutch BV, 40 staff, Amsterdam. The product takes CVs and application answers, scores them against the job profile and ranks candidates; recruiters see the ranking and decide whom to interview. It runs on our own models trained on anonymised historic hiring data from customers. No video, no voice, no emotion inference. Customers would be employers with 1,000 or more staff. We have a DPO and ISO 27001.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Regina's answer

# Your AI CV-screening product in Germany and France: what applies, what must be ready before the first contract, and who to talk to

## Answer

1. **You can sell in both markets.** Under the EU AI Act your product is a high-risk AI system. It ranks people, so the Act's exemption for low-impact tools does not apply. You are the provider and your customers are the deployers.
2. **The deadline is 2 December 2027.** That is when the high-risk duties apply to tools like yours. Your contracts will run past that date, so build to the full high-risk standard before you sign the first one. Don't plan to "launch before the deadline" to escape it.
3. **Your two biggest risks are not AI Act paperwork.**
   - Whether you may train on your customers' historic hiring data at all.
   - Whether your ranking counts in law as an automated rejection.
4. **In both markets the employer's staff representatives come into play before go-live.** In Germany the works council has to agree to the tool; in France the staff committee has to be informed. Your sales cycle runs through them.
5. **Who to talk to:**
   - Customers: HR, the DPO and the staff representatives.
   - Regulators: the Dutch data protection authority (your expected home supervisor), Germany's federal network agency and France's data protection authority (CNIL).
   - Brussels: the EU employment rules on algorithmic management, with a proposal due in December 2026.

A note on sources: the internal law library could not be reached this run. Everything below comes from official texts fetched today, or from secondary sources that I label as such.

## What decides it, rule by rule

| Regime | What it says | Who it binds | From when |
|---|---|---|---|
| **EU AI Act, Annex III point 4(a)** | Covers AI "intended to be used for the recruitment or selection of natural persons... to analyse and filter job applications, and to evaluate candidates" [w1]. | You (provider) and your customers (deployers). | High-risk duties from 2 Dec 2027 [w4][w5]. |
| **AI Act Art. 6(3), last sentence** | An Annex III system "shall always be considered to be high-risk where the AI system performs profiling" [w2]. Ranking candidates is profiling (judgement), so there is no way out of the high-risk category. | You | Same |
| **AI Act Art. 26** (what customers must do) | Use the tool as your instructions say. Give oversight to staff with "competence, training and authority". Keep logs for at least six months. Inform "workers' representatives and the affected workers" before use. Tell candidates the system is used [w3]. | Customers | 2 Dec 2027 |
| **AI Act Art. 4** (AI literacy) | Already applies. As amended in 2026 it reads "take measures to support AI literacy" [w5]. | You and customers | Now |
| **GDPR Art. 22** (automated decisions) | The EU Court of Justice (SCHUFA, C-634/21) held that a score is itself an automated decision when the decision-maker "draws strongly on" it [w14]. | Customers as controllers; you through design | Now |
| **Germany, works council rights (BetrVG § 95)** | The works council must agree to selection guidelines. In firms with more than 500 staff it can demand them. Para. 2a: this applies "wenn... Künstliche Intelligenz zum Einsatz kommt" (when AI is used) [w8]. | German customers | Now |
| **Germany, BetrVG § 87(1) no. 6** | The works council co-decides on "technischen Einrichtungen" (technical systems) that can monitor staff behaviour or performance [w9]. Whether this reaches a recruiting tool's recruiter logs is my reading (judgement). | German customers | Now |
| **Germany, KI-MIG** (national AI Act enforcement law, BGBl. 2026 I Nr. 223) | The federal network agency (BNetzA) is the market surveillance authority [w7]. A deployer of an Annex III no. 4 system that fails to give a candidate an explanation under Art. 86 faces a fine of up to €50,000 [w7]. | Customers; you as the regulator's counterpart | In force |
| **France, Code du travail L1221-8 / L1221-9** | Candidates must be "expressément informé[s], préalablement" (expressly informed beforehand) of the methods used, and the methods must be relevant to the purpose. No data may be collected by a method the candidate was not told about [w10][w11]. | French customers | Now |
| **France, L2312-38** | The staff committee (CSE) "est informé, préalablement à leur utilisation" (is informed before use) of recruitment methods and of any change to them [w12]. | French customers | Now |
| **France, AI Act enforcement** | Sources conflict. CNIL is expected to cover AI at work, but no designation law has passed [w13]. | (open) | Pending |
| **Netherlands (home)** | A draft implementing law would make the Dutch data protection authority (AP) the main supervisor for Annex III systems. It is still a draft [w16]. | You | Pending |

What does **not** apply:

- **The AI Act ban on emotion recognition at work.** It does not reach you, because you infer no emotions (judgement).
- **The fundamental-rights impact assessment (Art. 27).** It is limited to public bodies, private firms providing public services, and credit and insurance uses. Private employers do not need one unless they deliver a public service (unverified; check the text of Art. 27(1)).
- **A notified body.** Annex III point 4 systems go through internal-control conformity assessment, so no outside certifier is needed (unverified; check Art. 43(2)).

## What must be in place before the first contract, in order

1. **Clear the training data (this month).** For training your own models you are probably a controller, not a processor (judgement).
   - "Anonymised" must pass the EU data protection board's test: extracting personal data must be "insignificant" in likelihood [w15].
   - If it does not pass, you need a legal basis and transparency towards past applicants.
   - This is the issue most likely to stop a German or French customer's DPO.
2. **Fix the design so the ranking is not a silent rejection (this quarter).**
   - No automatic cut-off.
   - Recruiters can see and open every candidate.
   - An explanation per candidate. This also covers the German €50,000 point [w7].
   - This answers the SCHUFA risk under GDPR Art. 22 [w14] and the human-oversight duty under Art. 26 [w3].
3. **Build the provider file (now to about month 9).** Your ISO 27001 helps but does not cover it (judgement). The file needs:
   - a quality management system and a risk management system
   - data governance, including bias testing (the 2026 amendment widens the legal basis for using sensitive data to detect bias [w5])
   - technical documentation and automatic logging
   - instructions for use and a post-market monitoring plan

   Before the compliant version goes on the market, you also need the EU declaration of conformity, the CE marking and registration in the EU database (unverified; check Arts. 47 to 49).
4. **Build a customer pack (months 2 to 6).**
   - A data processing agreement.
   - Instructions for use written for HR.
   - A German works-agreement template covering §§ 87 and 95.
   - A French CSE information note and a candidate notice under L1221-8.
   - Template wording for the Art. 26 notices.
   - Contract clauses that split provider and deployer duties.

**What not to do yet:**

- **Don't rush a version onto the market before 2 December 2027 to use the transition rule for older systems.** Continuous retraining is likely to count as a "significant change". Your customers' procurement will ask for compliance anyway (judgement; transition clause unverified as amended).
- **Don't claim "AI Act certified".** No such certificate exists for this category (judgement).

## Who to engage

| Front | Decides (P1) | Influences (P2) |
|---|---|---|
| German customers | HR director plus the works council chair (group or company level) | The DPO and the works council's AI expert |
| French customers | Human resources director (DRH) | The CSE secretary and the DPO |
| Netherlands, home supervisor | AP: head of algorithm and AI supervision | The AP/RDI sandbox team (AP and RDI share AI Act coordination) [w16] |
| Germany, regulator | BNetzA: AI market surveillance unit [w7] | The state data protection authority where the customer is based |
| France, regulator | CNIL: AI and employment department (designation pending [w13]) | The DGCCRF, the consumer and competition authority, as expected coordinator (unverified) |
| EU, live file | Commission employment directorate (DG EMPL): the unit drafting the Quality Jobs Act [w17] | The European Parliament's employment committee (EMPL) rapporteur, once named |
| Standards | NEN mirror committee to the European AI standards committee (CEN-CENELEC JTC 21) (unverified) | Trade associations: NLdigital, Bitkom, Numeum (unverified) |

**Positioning:** "Human-in-the-loop ranking, built to the high-risk standard ahead of December 2027, with explanations for every candidate." Never say the tool "decides", and never call it bias-free.

## Watches

- **Quality Jobs Act proposal (target 3 Dec 2026).** It would add rules on algorithmic management [w17]. It is still unclear whether job applicants are in scope (unverified).
- **French designation law** for AI Act enforcement [w13].
- **Dutch implementing law** [w16].
- **Harmonised standards being cited**, and the Commission's high-risk guidelines (unverified timing).
- **The Official Journal text of the 2026 amendment.** The 2 Dec 2027 date comes from the adopted Council text [w4] plus secondary summaries [w5]. Plan to it, but confirm against Regulation (EU) 2026/1744 on EUR-Lex.

## Draft letter (you send it)

> Subject: Pre-market dialogue: high-risk recruitment AI, Annex III point 4(a)
>
> Dear Head of AI Supervision,
>
> We are an Amsterdam-based provider of AI that ranks job applications for large employers. We are preparing conformity under the AI Act ahead of 2 December 2027 and will sell in Germany and France from 2027. As the expected home supervisor for Annex III systems, could your team give us 45 minutes to test our human-oversight design (no automatic rejection, per-candidate explanation) and to discuss participating in the Dutch regulatory sandbox?
>
> Yours sincerely, [CEO], [company]

## Questions for you

1. **Is the training data truly anonymised, and who signed that off?** This decides whether a German or French DPO can say yes.
2. **Do recruiters ever see only a top-N list, or does anyone screen out candidates automatically?** This decides whether GDPR Art. 22 applies.
3. **Do you retrain models on each customer's own data?** If so, every retrain may be a "significant change", and each customer becomes a data source.
4. **Will any customer be a public body or provide public services?** If so, a fundamental-rights impact assessment applies to them.

## Sources (all retrieved 17 Nov 2026)

- [w1] [AI Act Annex III](https://artificialintelligenceact.eu/annex/3/) (mirror of the OJ text): "to analyse and filter job applications, and to evaluate candidates"
- [w2] [AI Act Art. 6](https://artificialintelligenceact.eu/article/6/): "shall always be considered to be high-risk where the AI system performs profiling"
- [w3] [AI Act Art. 26](https://artificialintelligenceact.eu/article/26/): "inform workers' representatives and the affected workers"
- [w4] [Council PE-CONS 30/1/26 REV 1](https://data.consilium.europa.eu/doc/document/PE-30-2026-REV-1/en/pdf): Digital Omnibus on AI of 8 July 2026; "Position of the European Parliament of 16 June 2026... and decision of the Council of 29 June 2026"
- [w5] Secondary: [euaiact.com](https://www.euaiact.com/digital-omnibus-ai) on Annex III moving to 2 December 2027, the Art. 4 wording and Art. 4a; also [Bird & Bird](https://www.twobirds.com/en/insights/2026/digital-omnibus-on-ai-provisional-agreement-reached-at-the-may-trilogue) and [Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/); OJ reference L 2026/1744 per the [EFTA record](https://www.efta.int/eea-lex/32026r1744) (search result, not opened)
- [w7] [KI-MIG](https://www.gesetze-im-internet.de/ki-mig/BJNR0DF0B0026.html): § 2(1) "Die Bundesnetzagentur ist die... zuständige Marktüberwachungsbehörde"; § 15(2)–(3) Art. 86 explanation, up to €50,000
- [w8] [BetrVG § 95](https://www.gesetze-im-internet.de/betrvg/__95.html): para. 2a, quoted above
- [w9] [BetrVG § 87](https://www.gesetze-im-internet.de/betrvg/__87.html): para. 1 no. 6, quoted above
- [w10] [Code du travail L1221-8](https://code.travail.gouv.fr/code-du-travail/l1221-8); [w11] [L1221-9](https://code.travail.gouv.fr/code-du-travail/l1221-9); [w12] [L2312-38](https://code.travail.gouv.fr/code-du-travail/l2312-38)
- [w13] Secondary, and conflicting: [Chartia](https://chartia.fr/questions/qui-controle-ai-act-france), [Praxikon](https://www.praxikon.com/en/enforcement/france)
- [w14] Secondary: [Helbing on C-634/21](https://www.thomashelbing.com/en/wissen/dsgvo-hub/rechtsprechung/1.4.32-eugh-schufa-scoring), "draws strongly on that value"
- [w15] Secondary: [CMS on EDPB Opinion 28/2024](https://cms.law/en/int/legal-updates/edpb-opinion-28-2024-key-takeaways-on-processing-personal-data-in-the-context-of-ai-models)
- [w16] Secondary: [Stibbe](https://www.stibbe.com/publications-and-insights/dutch-proposal-for-ai-supervision-hybrid-cooperation-between-market), [ICTRecht](https://www.ictrecht.nl/en/blog/eén-ai-act-meerdere-toezichthouders-hoe-nederland-het-ai-toezicht-organiseert)
- [w17] [EP Legislative Train: Quality Jobs Act](https://www.europarl.europa.eu/legislative-train/theme-supporting-people-strengthening-our-societies-and-our-social-model/file-quality-jobs-act); secondary: [Remote Work Europe](https://remoteworkeurope.eu/news/2026/eu-quality-jobs-act-december-adoption-target/), "targeted for adoption on 3 December"

```mandate-board
{
  "title": "AI CV ranking: selling in Germany and France from 2027",
  "stage": "write_up",
  "answer": {
    "lines": [
      "High-risk under the AI Act (Annex III 4(a), profiling); you are provider, customers are deployers.",
      "High-risk duties apply from 2 Dec 2027; build to them before the first multi-year contract.",
      "Clear training-data legality and remove any automatic cut-off first.",
      "German works council agreement and French CSE information gate every customer go-live."
    ],
    "confidence": "medium",
    "confidence_why": "Core rules from official text; Omnibus date and FR/NL supervisors rest partly on secondary sources.",
    "open_question": "Is the training data truly anonymised, and does any recruiter workflow auto-reject?",
    "cite": ["w1", "w2", "w4", "w5", "w8", "w12"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "aiact", "name": "AI Act high-risk conformity (provider)", "institution": "Home market surveillance authority", "status": "open", "why": "Internal control route; full provider file needed by 2 Dec 2027.", "conditions": ["QMS and risk management", "Data governance and bias testing", "Technical documentation, logging", "Declaration, CE marking, EU database registration"], "cite": ["w1", "w2", "w5", "unverified"] },
      { "id": "legacy", "name": "Launch before the date and rely on the legacy clause", "institution": "n/a", "status": "shut", "why": "Retraining likely counts as significant change; buyers will demand compliance anyway.", "cite": ["judgement", "unverified"] },
      { "id": "gdpr", "name": "GDPR: training basis and Art. 22", "institution": "Data protection authorities", "status": "probe", "why": "Anonymisation must meet the EDPB test; a ranking relied on strongly can be a decision.", "cite": ["w14", "w15"] }
    ] },
    { "id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
      { "id": "de-wc", "name": "Works council agreement (BetrVG 87, 95)", "institution": "Customer works council", "status": "open", "why": "Consent needed for selection guidelines, including AI; customers over 500 staff.", "cite": ["w8", "w9"] },
      { "id": "de-kimig", "name": "KI-MIG supervision", "institution": "Bundesnetzagentur", "status": "open", "why": "BNetzA supervises; deployer fine up to 50,000 EUR for missing Art. 86 explanation.", "cite": ["w7"] }
    ] },
    { "id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
      { "id": "fr-cse", "name": "CSE information and candidate notice", "institution": "Customer CSE", "status": "open", "why": "CSE informed before use; candidates expressly informed; methods relevant.", "cite": ["w10", "w11", "w12"] },
      { "id": "fr-msa", "name": "AI Act supervisor in France", "institution": "CNIL (expected)", "status": "probe", "why": "Designation law not passed; sources conflict.", "cite": ["w13"] }
    ] },
    { "id": "nl", "level": "national", "label": "Netherlands (home)", "country": "NL", "doors": [
      { "id": "nl-ap", "name": "Pre-market dialogue and sandbox", "institution": "Autoriteit Persoonsgegevens", "status": "probe", "why": "Draft law makes AP main Annex III supervisor.", "cite": ["w16"] }
    ] },
    { "id": "customer", "level": "customer", "label": "Customers", "doors": [
      { "id": "c-pack", "name": "Deployer compliance pack", "institution": "Employers 1,000+ staff", "status": "open", "why": "Customers need instructions, logs, notices to meet Art. 26.", "cite": ["w3"] }
    ] },
    { "id": "lobby", "level": "lobby", "label": "Shape the rules", "doors": [
      { "id": "qja", "name": "Quality Jobs Act (algorithmic management)", "institution": "Commission DG EMPL", "status": "probe", "why": "Proposal targeted 3 Dec 2026; applicant scope unclear.", "cite": ["w17", "unverified"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "found", "label": "Foundations", "steps": [
      { "id": "data", "label": "Training-data legal review and anonymisation test", "start": 0, "end": 1.5, "owner": "client", "status": "planned", "cite": ["w15"] },
      { "id": "design", "label": "Remove auto cut-off; per-candidate explanation", "start": 0.5, "end": 3, "owner": "client", "status": "planned", "cite": ["w14", "w7"] },
      { "id": "no-legacy", "label": "BLOCKED: do not rush a pre-Dec-2027 launch to use the legacy clause", "start": 0, "end": 1, "owner": "us", "status": "blocked", "cite": ["judgement"] }
    ] },
    { "id": "provider", "label": "Provider file", "steps": [
      { "id": "qms", "label": "QMS, risk management, data governance, bias testing, logging", "start": 1, "end": 9, "owner": "client", "status": "planned", "depends_on": ["data"], "cite": ["w5", "unverified"] },
      { "id": "doc", "label": "Technical documentation and instructions for use", "start": 3, "end": 10, "owner": "client", "status": "planned", "depends_on": ["design"], "cite": ["unverified"] },
      { "id": "ca", "label": "Conformity assessment, declaration, CE, EU database", "start": 10, "end": 12, "owner": "client", "status": "planned", "depends_on": ["qms", "doc"], "cite": ["unverified"] },
      { "id": "apply", "label": "Annex III duties apply", "start": "2027-12-02", "milestone": true, "owner": "institution", "status": "planned", "cite": ["w4", "w5"] }
    ] },
    { "id": "sales", "label": "Customer pack", "steps": [
      { "id": "pack", "label": "DPA, works agreement template (DE), CSE note and candidate notice (FR), contract split", "start": 2, "end": 6, "owner": "client", "status": "planned", "depends_on": ["design"], "cite": ["w3", "w8", "w10", "w12"] },
      { "id": "first", "label": "First DE/FR contract", "start": 7, "milestone": true, "owner": "client", "status": "planned", "depends_on": ["pack"], "cite": ["judgement"] }
    ] },
    { "id": "engage", "label": "Engagement", "steps": [
      { "id": "ap", "label": "AP pre-market dialogue and sandbox", "start": 1, "end": 4, "owner": "client", "status": "planned", "cite": ["w16"] },
      { "id": "qja-resp", "label": "Input on Quality Jobs Act via trade association", "start": 1, "end": 6, "owner": "client", "status": "planned", "cite": ["w17"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-qja", "label": "Quality Jobs Act proposal: are applicants in scope?", "start": "2026-12-03", "milestone": true, "owner": "us", "status": "planned", "cite": ["w17"] },
      { "id": "w-oj", "label": "Confirm Omnibus dates in OJ text (Reg. 2026/1744)", "start": 0.25, "milestone": true, "owner": "us", "status": "planned", "cite": ["w4", "w5"] },
      { "id": "w-fr", "label": "French AI Act designation law", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["w13"] },
      { "id": "w-nl", "label": "Dutch implementing law in parliament", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["w16"] },
      { "id": "w-std", "label": "Harmonised standards cited; Commission high-risk guidelines", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "cust-de", "name": "German customer", "side": "market", "country": "DE", "units": [
      { "id": "hr-de", "name": "HR and works council", "roles": [
        { "id": "hrd", "role": "HR director", "priority": "P1", "reach": "Sales lead", "status": "to_approach", "cite": ["judgement"] },
        { "id": "wc", "role": "Works council chair (group or company level)", "priority": "P1", "reach": "Through HR, with the works agreement template", "status": "to_approach", "cite": ["w8", "w9"] },
        { "id": "dpo-de", "role": "Data protection officer", "priority": "P2", "reach": "Your DPO to theirs", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "cust-fr", "name": "French customer", "side": "market", "country": "FR", "units": [
      { "id": "hr-fr", "name": "DRH and CSE", "roles": [
        { "id": "drh", "role": "Directeur des ressources humaines", "priority": "P1", "reach": "Sales lead", "status": "to_approach", "cite": ["judgement"] },
        { "id": "cse", "role": "CSE secretary", "priority": "P2", "reach": "Through the DRH with the CSE note", "status": "to_approach", "cite": ["w12"] }
      ] }
    ] },
    { "id": "ap", "name": "Autoriteit Persoonsgegevens", "side": "political", "country": "NL", "units": [
      { "id": "ap-ai", "name": "Algorithm and AI supervision", "roles": [
        { "id": "ap-head", "role": "Head of AI supervision", "priority": "P1", "reach": "Formal letter via the AP's published contact route", "status": "to_approach", "cite": ["w16"] },
        { "id": "ap-sb", "role": "Sandbox team (with RDI)", "priority": "P2", "reach": "Forwarded by the head", "status": "to_approach", "cite": ["w16"] }
      ] }
    ] },
    { "id": "bnetza", "name": "Bundesnetzagentur", "side": "political", "country": "DE", "units": [
      { "id": "bn-ai", "name": "AI market surveillance", "roles": [
        { "id": "bn-head", "role": "Head of AI market surveillance", "priority": "P1", "reach": "Its AI service desk", "status": "to_approach", "cite": ["w7"] },
        { "id": "ldpa", "role": "State data protection authority of the customer", "priority": "P2", "reach": "Via the customer's DPO", "status": "to_approach", "cite": ["w7"] }
      ] }
    ] },
    { "id": "cnil", "name": "CNIL", "side": "political", "country": "FR", "units": [
      { "id": "cnil-ai", "name": "AI and employment", "roles": [
        { "id": "cnil-head", "role": "Head of the AI department", "priority": "P1", "reach": "Once designation is settled", "status": "to_approach", "cite": ["w13"] },
        { "id": "dgccrf", "role": "DGCCRF coordinator", "priority": "P2", "reach": "Watch only for now", "status": "to_approach", "cite": ["w13"] }
      ] }
    ] },
    { "id": "empl", "name": "European Commission, DG EMPL", "side": "political", "country": "EU", "units": [
      { "id": "qja-unit", "name": "Quality Jobs Act team", "roles": [
        { "id": "qja-hou", "role": "Head of unit drafting the Act", "priority": "P1", "reach": "Through a trade association position", "status": "to_approach", "cite": ["w17"] },
        { "id": "ep-empl", "role": "EP EMPL rapporteur, once named", "priority": "P2", "reach": "Association briefing after the proposal", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] }
  ] },
  "process_maps": [
    { "id": "de-golive", "title": "How a German customer goes live", "explains": "Who must agree before the tool is used on applicants.", "kind": "procurement", "illustrative": false,
      "actors": [
        { "id": "you", "name": "You (provider)", "side": "market" },
        { "id": "hr", "name": "Customer HR", "side": "market" },
        { "id": "wc", "name": "Works council", "side": "market" }
      ],
      "steps": [
        { "id": "pack", "label": "You hand over instructions, DPA, works agreement draft", "kind": "document", "actor": "you", "cite": ["w3"] },
        { "id": "inform", "label": "Employer informs workers' representatives", "kind": "step", "actor": "hr", "cite": ["w3"] },
        { "id": "agree", "label": "Works council consents to selection guidelines", "kind": "decision", "actor": "wc", "cite": ["w8"] },
        { "id": "es", "label": "If no agreement: conciliation board decides", "kind": "decision", "actor": "wc", "cite": ["w8"] }
      ],
      "flow": [ { "from": "pack", "to": "inform" }, { "from": "inform", "to": "agree" }, { "from": "agree", "to": "es", "label": "no agreement" } ],
      "leverage": [
        { "id": "tmpl", "at": "agree", "kind": "door_opener", "label": "Ready works agreement template", "why": "Cuts months off the cycle.", "how": "Your legal lead drafts it with German labour counsel.", "side": "market", "cite": ["judgement"] },
        { "id": "block", "at": "agree", "kind": "blocker", "label": "Auto-rejection or opaque scores", "why": "Councils resist; also a GDPR Art. 22 risk.", "how": "Human review of every candidate, per-candidate explanation.", "side": "market", "cite": ["w14", "judgement"] }
      ],
      "cite": ["w3", "w8"] }
  ],
  "risks_flags": [
    { "id": "training", "kind": "deal_breaker", "severity": "high", "title": "Training on customers' historic hiring data", "fix": "Test anonymity against EDPB criteria; else legal basis and notice; you are likely controller for training.", "cite": ["w15", "judgement"] },
    { "id": "art22", "kind": "deal_breaker", "severity": "high", "title": "Ranking can count as automated rejection", "fix": "No automatic cut-off; recruiters review all; explanation per candidate.", "cite": ["w14"] },
    { "id": "legacy", "kind": "flag", "severity": "medium", "title": "Temptation to launch early to escape the high-risk duties", "fix": "Build to the standard; buyers' procurement will require it.", "cite": ["judgement"] },
    { "id": "fr-msa", "kind": "flag", "severity": "low", "title": "French supervisor not yet designated", "fix": "Plan for CNIL; watch the law.", "cite": ["w13"] },
    { "id": "iso", "kind": "flag", "severity": "medium", "title": "ISO 27001 does not cover AI Act QMS", "fix": "Extend to an AI QMS aligned with forthcoming harmonised standards.", "cite": ["judgement"] }
  ]
}
```
