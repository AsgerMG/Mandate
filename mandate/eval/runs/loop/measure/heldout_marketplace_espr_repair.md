# Loop run: heldout_marketplace_espr_repair (measure)

Case: `mandate/eval/scenarios/heldout_marketplace_espr_repair.yaml`. Brain: Regina. Playbooks at 15139db26a. One-reply re-test on the bench (no API spend), 2026-11-16T09:37:54+00:00, 301.9s.
Leave-one-out case library: 0 entries derived from this case left out; reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We run an online marketplace for refurbished and second-hand electronics in Germany and France, selling for professional refurbishers to consumers. The new ecodesign and product-passport rules and the right-to-repair law are coming. What will apply to a marketplace like us, can we still shape it, and who decides?
> 
> More about us, so you can answer in one go: German GmbH, 90 staff, Berlin. We do not refurbish ourselves; about 600 professional sellers list on the platform, we handle payment, warranty claims and returns. About 1.2 million orders a year, smartphones and laptops mostly. No EU-level trade body membership yet; we are in a German e-commerce association.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Regina's answer

I couldn't save the profile file in this session because file writes were blocked, so the searches ran without it. That doesn't change the answer.

## Answer

1. **The big product rules hit your sellers' suppliers, not you.** Ecodesign rules, the product passport and the manufacturer's duty to repair apply to the brand that makes the device. You and your 600 refurbishers mostly feel them through the information you must show and pass on. The sale of a used phone is probably outside these rules (judgement; see 3).
2. **What already binds you as a marketplace:**
   - **Product safety rules on marketplaces (EU, in force):** cooperate with the authorities, tell buyers about recalls, register on the EU's dangerous-products portal [c6][c7][c11][c12][c20].
   - **Germany's right-to-repair law (since 31 July 2026):** it changes how warranty claims are handled, and you run that process [w4].
3. **You can still shape it, in three places:**
   - the EU **Circular Economy Act**, not yet proposed [w1][w2];
   - the EU **repair-scoring rule for electronics**, being drafted for adoption in 2027 [w3];
   - **France's right-to-repair law**, not yet passed [w6].
4. **Germany's version is done.** There the job is compliance, not lobbying.

## What applies to you, rule by rule

| Rule | Where | Binds you how | Status today |
|---|---|---|---|
| General Product Safety Regulation, Art. 22 | EU | Directly, as a marketplace operator: recalls, cooperation with authorities, notices through the EU's business reporting portal (Safety Business Gateway) [c11][c12] | In force [c6] |
| Digital Services Act, Art. 30-32 (seller checks, interface built for compliance) | EU | Directly. The exemption is for small firms under 50 staff; you have 90 (unverified) | In force (unverified) |
| Green-transition consumer directive (ECGT) | EU, via DE and FR law | Your sellers, as traders, must show before purchase:<br>• the repairability score where one exists<br>• otherwise spare-part and repair information, if the producer gives it<br>• the software-update period [c18][c24]<br>Claiming a product can be repaired when it can't is banned [c17] | Applies from 27 Sept 2026 (unverified) |
| Germany's repair law (amends the Civil Code, BGB) | DE | Changes the warranty process you run:<br>• tell the buyer they can choose repair or replacement, and that choosing repair adds 12 months of warranty<br>• a refurbished device as replacement only if the buyer asks for it<br>• new repairability-defect rule for business-to-business sales from contracts after 31 Dec 2027 [w4] | Applies from 31 July 2026 [w4] |
| EU repair directive: duty to repair | EU | Binds the manufacturer, for phones and tablets but not laptops [w4]. Not you | In force |
| Ecodesign rules for smartphones | EU | Apply when a new model first goes on the EU market, from 20 June 2025 [w9]. Used devices: probably outside, unless refurbishment changes the device enough to count as a new product (unverified; confirm in the Commission's product-rules guide, the Blue Guide) | In force |
| ESPR and the digital product passport | EU | Marketplace duties exist (Art. 35, unverified: I couldn't get the official text this session). No passport rule yet for phones or laptops (judgement). The passport's service-provider and registry rules are still being prepared [c2][c19] | Framework in force; product rules pending |

**The one thing you must know.** You handle payment, warranty and returns. A German or French court could treat you as the seller and not just the platform (unverified: EU case law, Wathelet C-149/15, and DSA Art. 6(3)). That would move every seller duty above onto you. Check how your checkout and warranty emails present who is selling before anything else.

## Where you can still shape the rules

| File | Who decides (P1) | Who forwards (P2) | Window |
|---|---|---|---|
| Circular Economy Act | Commission (DG ENV, the environment department) under the Commissioner for the circular economy | Parliament committee and Council environment ministers once proposed | The Parliament's legislative tracker says 11 Nov [w1]. Press reports 2 Dec as the provisional date [w2]. I plan to the earlier one: the text is effectively fixed now. Your influence starts at Parliament and Council |
| EU repair-scoring rule for electronics (under ESPR) | DG ENV unit, with the Commission's research centre (JRC) preparing it | The Ecodesign Forum, an official stakeholder group the Commission consults; national experts | Adoption estimated 2027. Stakeholder input is collected throughout [w3] |
| Extending the passport to second-hand goods | Commission (DG GROW, the internal-market department), in its overhaul of EU product rules | Parliament's internal-market committee. A speaker in the Oct 2025 plenary debate asked for this [c21] | Not yet proposed (unverified) |
| France's repair law | Economy ministry (consumer protection directorate, DGCCRF) | Assemblée and Sénat rapporteurs | Not adopted. The Commission sent France a formal warning on 25 Sept 2026 [w6], so a bill should come quickly |

**Your angle.** You are the data layer of the refurbished market: 1.2 million orders a year. Your ask: refurbishers and marketplaces should get access to manufacturers' repair, parts and software data, and score display should work for used devices (judgement).

**Never claim:**
- a repairability score the producer didn't supply [c17];
- that you are "the refurbisher".

## Options

1. **Comply only.** Cheap, but other people write the rules for scores and second-hand that you will later carry.
2. **Comply and join a coalition (my recommendation).**
   - Join EUREFAS, the European refurbishers' association. It is already lobbying on the Circular Economy Act [w7].
   - Use your German association's EU umbrella for the marketplace points (unverified that it belongs to Ecommerce Europe).
   - Register as a stakeholder in the repair-scoring study [w3].
3. **Lobby alone in Brussels.** Too early and too expensive at 90 staff (judgement).

## What not to do yet

- Don't build passport integration for used devices. There is no product rule that requires it (judgement).
- Don't lobby the Commission on the Circular Economy Act text this month. That window has effectively closed, so wait for the proposal.

## Next steps

| When | Action |
|---|---|
| This week | Legal check of the "are we the seller?" question in DE and FR. Update the warranty-claim flow to the new German rules [w4] |
| This month | Join EUREFAS. Register for the repair-scoring study. Read the Circular Economy Act proposal the day it is adopted |
| This quarter | Send a position note to the Parliament committee once a rapporteur is named. Request a meeting with DGCCRF on the French bill |

## Questions for you

1. **Who is named as seller on your checkout and invoices: you or the refurbisher?** This decides which rules land on you.
2. **What do your sellers do to a device?** Cleaning and battery or screen swaps, or deeper rebuilds? A deep rebuild can make the device count as newly placed on the market.
3. **Do you have EU marketplace revenue figures by country?** The Parliament committee will want them.

I can draft the EUREFAS approach or the DGCCRF note next.

## Sources

**From Mandate's law library (label, URL, sha256 first 12 characters):**
- [c1] Commission, 2030 Consumer Agenda, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52025DC0848 (acff92f721b8)
- [c2] Have Your Say page, Digital product passport: rules for service providers (stage: planned), https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/14382 (d4ed3700d072)
- [c6][c7][c11][c12] General Product Safety Regulation 2023/988, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R0988 (e4b02277ef8e)
- [c16][c17][c18][c24] Green-transition consumer directive 2024/825, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024L0825 (9510a718ddec)
- [c19] Have Your Say page, Digital Product Passport Registry (stage: planned), https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/16052 (eace9e755d03)
- [c20] Implementing Regulation 2024/1459 (EU dangerous-products portal interface), https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1459 (87d6ac60724d)
- [c21] European Parliament plenary debate on product rules, 20 Oct 2025, https://www.europarl.europa.eu/doceo/document/CRE-10-2025-10-20_EN.html (70a6cc462c49)

**From the web, retrieved 16 Nov 2026:**
- [w1] European Parliament, Legislative Train, Circular Economy Act, https://www.europarl.europa.eu/legislative-train/theme-a-new-plan-for-europe-s-sustainable-prosperity-and-competitiveness/file-circular-economy-act. Quote: "The Commission's Circular Economy Act (CEA) proposal is currently expected on 11 November 2026." Page updated 25/10/2026.
- [w2] Eunews, 9 Nov 2026 (secondary, press), https://www.eunews.it/en/2026/11/09/the-eu-moves-towards-the-circular-economy-act-at-ecomondo-the-focus-is-on-economic-and-environmental-sustainability/. Reports adoption due on 2 December. Taken from a search summary; I did not read the page itself.
- [w3] Commission, "ESPR Horizontal Requirements on Reparability, 2nd stakeholder meeting, 28 April 2025", https://susproc.jrc.ec.europa.eu/product-bureau/sites/default/files/2026-04/2nd%20Stakeholder%20meeting%20PPT_website.pdf. Quotes: "Repairability (including scoring) … ENV … 2027" and "Stakeholder input collected throughout".
- [w4] IHK Frankfurt (secondary, chamber of commerce), https://www.frankfurt-main.ihk.de/recht/uebersicht-alle-rechtsthemen/vertragsrecht-und-e-commerce-recht/uebersicht/recht-auf-reparatur-7110642. Supports: rules apply from 31 July 2026; 12-month extension when the buyer chooses repair; refurbished replacement only on express request; business-to-business rule only for contracts after 31 Dec 2027.
- [w6] Lettre des Réseaux (secondary, press), https://www.lettredesreseaux.com/?p=24431. Reports a formal warning to France on 25 Sept 2026 and no French text as of 28 Sept.
- [w7] EUREFAS open letter on the Circular Economy Act, https://www.eurefas.com/press/eurefas-open-letter-on-circular-economy-act-and-the-role-of-reuse-and/
- [w9] SEAI notice on phones and tablets (Irish energy authority), https://seai.ie/sites/default/files/2025-01/Notice%20for%20manufacturers%20%20importers%20-%20phones%20%20tablets.pdf. Supports: the smartphone rules apply to models placed on the market from 20 June 2025.

**Gaps:**
- I couldn't load the official EUR-Lex texts of ESPR (2024/1781) or the repair directive (2024/1799) this session. Before relying on Art. 35, read it on EUR-Lex.
- The date the German law entered into force differs between sources: one regional chamber says 23 July 2026, and its official publication is not confirmed. Check the Federal Law Gazette (Bundesgesetzblatt).

```mandate-board
{
  "title": "Refurbished-electronics marketplace (DE/FR): ecodesign, product passport, right to repair",
  "stage": "write_up",
  "answer": {
    "lines": [
      "The ecodesign rules, product passport and duty to repair mainly bind manufacturers; you feel them through what sellers must show.",
      "Already binding you: marketplace product-safety duties, and Germany's new warranty rules for the claims you handle.",
      "Still movable: the Circular Economy Act in Parliament and Council, the EU repair-scoring rule (2027), and France's repair law."
    ],
    "confidence": "medium",
    "confidence_why": "Official ESPR article text not loaded this run; your role as seller or platform is not yet confirmed.",
    "open_question": "Who is named as seller on checkout and invoices: you or the refurbisher?",
    "cite": ["c12", "c18", "w1", "w3", "w4", "w6", "judgement"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "cea", "name": "Circular Economy Act", "institution": "European Commission, DG ENV", "status": "probe", "why": "Proposal due 11 Nov (EP tracker) or 2 Dec (press); shape it in Parliament and Council.", "cite": ["w1", "w2"] },
      { "id": "repair-score", "name": "ESPR horizontal repairability and scoring rule", "institution": "DG ENV with JRC", "status": "open", "why": "Adoption estimated 2027; stakeholder input collected throughout.", "cite": ["w3"] },
      { "id": "dpp-secondhand", "name": "Extending the product passport to second-hand goods", "institution": "DG GROW, product-rules overhaul", "status": "park", "why": "Floated in plenary; no proposal yet.", "cite": ["c21", "unverified"] },
      { "id": "gpsr", "name": "Product safety duties for marketplaces (compliance)", "institution": "National market surveillance", "status": "open", "why": "In force; binds you directly.", "cite": ["c6", "c12"] }
    ] },
    { "id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
      { "id": "de-r2r", "name": "Repair law in the Civil Code (BGB)", "institution": "Federal justice ministry", "status": "shut", "why": "Adopted; applies from 31 July 2026. Comply, do not lobby.", "cite": ["w4"] }
    ] },
    { "id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
      { "id": "fr-r2r", "name": "French repair-directive law", "institution": "Economy ministry, DGCCRF", "status": "open", "why": "Not adopted; Commission formal warning 25 Sept 2026.", "cite": ["w6"] }
    ] },
    { "id": "lobby", "level": "lobby", "label": "Coalitions", "doors": [
      { "id": "eurefas", "name": "EUREFAS membership", "institution": "European refurbishers' association", "status": "open", "why": "Already active on the Circular Economy Act.", "cite": ["w7"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "comply", "label": "Compliance", "steps": [
      { "id": "seller-role", "label": "Legal check: are we the seller in DE and FR?", "start": 0, "end": 0.25, "owner": "client", "status": "planned", "cite": ["unverified"] },
      { "id": "warranty-flow", "label": "Warranty flow updated to the German repair rules", "start": 0, "end": 1, "owner": "client", "status": "planned", "depends_on": ["seller-role"], "cite": ["w4"] },
      { "id": "listing-info", "label": "Listing fields for repair score, spare parts and software updates", "start": 0.5, "end": 2, "owner": "client", "status": "planned", "cite": ["c18", "c24"] },
      { "id": "dpp-build", "label": "Do not build passport integration for used devices yet", "start": 0, "end": 1, "owner": "client", "status": "blocked", "cite": ["judgement"] }
    ] },
    { "id": "shape", "label": "Shaping", "steps": [
      { "id": "join", "label": "Join EUREFAS", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["w7"] },
      { "id": "jrc-reg", "label": "Register as stakeholder in the repair-scoring study", "start": 0.25, "end": 1, "owner": "client", "status": "planned", "cite": ["w3"] },
      { "id": "cea-read", "label": "Read the Circular Economy Act proposal on adoption day", "start": 0.5, "end": 1, "owner": "us", "status": "planned", "cite": ["w2"] },
      { "id": "ep-note", "label": "Position note to the lead Parliament committee once a rapporteur is named", "start": 1.5, "end": 3, "owner": "client", "status": "planned", "depends_on": ["cea-read", "join"], "cite": ["judgement"] },
      { "id": "dgccrf", "label": "Meeting request to DGCCRF on the French bill", "start": 1, "end": 3, "owner": "client", "status": "planned", "cite": ["w6"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-cea", "label": "Circular Economy Act adoption (provisional 2 Dec)", "start": "2026-12-02", "milestone": true, "owner": "us", "status": "planned", "cite": ["w2"] },
      { "id": "w-score", "label": "Repair-scoring rule adoption (estimated 2027)", "start": 12, "milestone": true, "owner": "us", "status": "planned", "cite": ["w3"] },
      { "id": "w-fr", "label": "French transposition bill tabled", "start": 3, "milestone": true, "owner": "us", "status": "planned", "cite": ["w6"] },
      { "id": "w-dpp", "label": "Passport service-provider and registry rules", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["c2", "c19"] },
      { "id": "w-b2b", "label": "Germany: repairability-defect rule for business sales (contracts after 31 Dec 2027)", "start": "2028-01-01", "milestone": true, "owner": "us", "status": "planned", "cite": ["w4"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "com-env", "name": "European Commission, DG ENV", "side": "political", "country": "EU", "units": [
      { "id": "ce-unit", "name": "Unit holding the circular economy and repairability files", "roles": [
        { "id": "hou", "role": "Head of unit for the repair-scoring measure", "priority": "P1", "reach": "Through the stakeholder registration of the repair-scoring study", "status": "to_approach", "cite": ["w3"] },
        { "id": "jrc", "role": "JRC study team", "priority": "P2", "reach": "Stakeholder meetings and written input", "status": "to_approach", "cite": ["w3"] }
      ] }
    ] },
    { "id": "ep", "name": "European Parliament", "side": "political", "country": "EU", "units": [
      { "id": "lead-com", "name": "Lead committee for the Circular Economy Act (not yet named)", "roles": [
        { "id": "rapp", "role": "Rapporteur", "priority": "P1", "reach": "Through EUREFAS once appointed", "status": "to_approach", "cite": ["w1"] },
        { "id": "shadows", "role": "Shadow rapporteurs, German and French members", "priority": "P2", "reach": "Through the German association and EUREFAS", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "fr-min", "name": "French economy ministry", "side": "political", "country": "FR", "units": [
      { "id": "dgccrf", "name": "DGCCRF (consumer protection directorate)", "roles": [
        { "id": "dgccrf-head", "role": "Deputy director for consumer contracts", "priority": "P1", "reach": "Written meeting request", "status": "to_approach", "cite": ["judgement"] },
        { "id": "fr-rapp", "role": "Assemblée rapporteur on the transposition bill", "priority": "P2", "reach": "Once the bill is tabled", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] }
  ] },
  "process_maps": [
    { "id": "pm-score", "title": "How the repair-scoring rule is made", "illustrative": false, "steps": [
      { "id": "s1", "label": "Preparatory study and impact assessment", "actor": "JRC for DG ENV", "kind": "step", "timing": "1.5-2 years", "cite": ["w3"] },
      { "id": "s2", "label": "Consultation of the Ecodesign Forum", "actor": "Ecodesign Forum", "kind": "step", "cite": ["w3"] },
      { "id": "s3", "label": "Adoption of the measure", "actor": "Commission", "kind": "decision", "timing": "estimated 2027", "cite": ["w3"] },
      { "id": "s4", "label": "Measure applies", "actor": "Economic operators", "kind": "deadline", "timing": "18 months later in principle", "cite": ["w3"] }
    ],
    "leverage": [
      { "id": "l1", "on": "s1", "type": "timing_window", "why": "Input is collected throughout the study.", "how": "Register as stakeholder; submit data on used-device repair", "side": "political", "cite": ["w3"] },
      { "id": "l2", "on": "s2", "type": "door_opener", "why": "The Forum is where trade bodies speak.", "how": "Through EUREFAS", "side": "political", "cite": ["judgement"] }
    ] }
  ],
  "risks_flags": [
    { "id": "seller-role", "kind": "deal_breaker", "severity": "high", "title": "You may be treated as the seller because you handle warranty and returns", "fix": "Make the seller identity clear at checkout, on invoices and in warranty emails; legal check in DE and FR.", "cite": ["unverified"] },
    { "id": "repair-claims", "kind": "flag", "severity": "medium", "title": "Banned false repairability or durability claims", "fix": "Show only producer-sourced scores; police seller listings.", "cite": ["c17"] },
    { "id": "de-warranty", "kind": "flag", "severity": "medium", "title": "German warranty process not yet updated", "fix": "Repair-or-replace notice, 12-month extension, refurbished replacement only on request.", "cite": ["w4"] },
    { "id": "espr-text", "kind": "flag", "severity": "low", "title": "ESPR marketplace article not verified this run", "fix": "Read ESPR Art. 35 on EUR-Lex before relying on it.", "cite": ["unverified"] }
  ]
}
```
