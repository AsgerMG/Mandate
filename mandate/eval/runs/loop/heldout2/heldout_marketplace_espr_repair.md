# Loop run: heldout_marketplace_espr_repair (heldout2)

Case: `mandate/eval/scenarios/heldout_marketplace_espr_repair.yaml`. Brain: Regina. Playbooks at d81aeceff9. One-reply re-test on the bench (no API spend), 2026-11-17T08:39:21+00:00, 243.9s.
Leave-one-out case library: 0 entries derived from this case left out; reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We run an online marketplace for refurbished and second-hand electronics in Germany and France, selling for professional refurbishers to consumers. The new ecodesign and product-passport rules and the right-to-repair law are coming. What will apply to a marketplace like us, can we still shape it, and who decides?
> 
> More about us, so you can answer in one go: German GmbH, 90 staff, Berlin. We do not refurbish ourselves; about 600 professional sellers list on the platform, we handle payment, warranty claims and returns. About 1.2 million orders a year, smartphones and laptops mostly. No EU-level trade body membership yet; we are in a German e-commerce association.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Regina's answer

# Ecodesign, product passport and right to repair: what applies to your marketplace, what you can still shape, and who decides

**Bench note:** the law library could not be reached in this run, so every source is a live web source. Each claim is marked with a source number from the list at the end ([w1] and so on), as my judgement, or as unverified.

## The answer

1. **Ecodesign mostly does not bind your refurbished stock.** The Commission says these rules "apply to new products, therefore reused products are not included" [w1].
   - The danger is the edge case. A product that has been changed enough to alter its "safety, performance, purpose or type" is remanufactured, and the Commission treats it as a new product [w1]. If any of your sellers cross that line, they take on full manufacturer duties.
2. **As a marketplace, your ecodesign duties are about cooperating with enforcement.** You must design the platform so sellers can comply. Listings of non-compliant products count as "illegal content". You must take them down and give enforcement authorities access to your platform, including letting them scrape data [w1].
3. **The right-to-repair sales rule reaches you through the warranty claims you handle.**
   - **Germany:** the law has passed and is published (BGBl. 2026 I Nr. 212) [w3][w4]. When a consumer chooses repair, the legal guarantee is extended by 12 months. That duty sits with your sellers, but your warranty process has to apply it (my judgement).
   - **France:** the law has not been transposed. The Commission opened infringement proceedings in September 2026 [w5]. Under current French law the extension after a repair is reportedly six months (unverified: check article L217-13 of the consumer code on Légifrance).

## What you can still shape

| File | State today | Can you move it? |
|---|---|---|
| Circular Economy Act (EU) | Proposal reported for 18 November 2026. Another report says 2027 [w6] | **Yes, the main opportunity.** This is where rules for the reuse market are likely to be written (my judgement) |
| Ecodesign repairability rules (EU) | Consultation open until **9 February 2027**. Adoption planned for 2027 [w2] | Partly. It covers peripherals and wearables, and possibly repairability scores shown at the point of sale. Products already covered by their own rules are expected to stay out [w2], which seems to exclude phones (my judgement) |
| French transposition | Overdue [w5] | Yes, while the text is still being drafted |
| German transposition | Done [w3] | No. The law places no duties on online marketplaces [w7] |

## Who decides

| File | Decides | Influences |
|---|---|---|
| Circular Economy Act | Commission, DG Environment, then European Parliament and Council | The ministries that negotiate in Council: Germany's environment ministry and France's ecological transition ministry (my judgement) |
| Ecodesign rules | DG Environment and DG GROW, which co-wrote the Commission's FAQ [w1] | The Ecodesign Forum and the expert group of member states (unverified) |
| French repair law | Economy ministry, consumer protection directorate (DGCCRF) (unverified) | French marketplace and repair peers (my judgement) |

## My recommendation

- Comply now in Germany.
- Answer the repairability consultation.
- Put your political effort into the Circular Economy Act from the day it is published, through an EU-level coalition.
- **Do not yet:** build passport infrastructure (no product-specific ecodesign act has been adopted [w8]), or market listings as "ESPR-compliant" (my judgement).

## What I need from you

Do any of your sellers replace major modules or change specifications? That decides whether some of them are remanufacturers.

```mandate-board
{
  "title": "Refurbished-electronics marketplace (DE, FR): ecodesign, product passport, right to repair",
  "stage": "options",
  "answer": {
    "lines": [
      "Ecodesign product rules mostly do not apply to refurbished, reused devices; remanufactured ones are treated as new.",
      "Your direct ecodesign duty is to cooperate with enforcers: platform design, takedowns, access for authorities.",
      "Germany: the 12-month guarantee extension after repair applies now; your warranty process must apply it.",
      "France: not yet transposed; infringement proceedings opened; shape the text while it is drafted.",
      "The main file to shape is the Circular Economy Act, due 18 Nov 2026 or in 2027."
    ],
    "confidence": "medium",
    "confidence_why": "Commission FAQ and official pages read; the regulation's own marketplace article not read in full this run.",
    "open_question": "Do any sellers replace major modules or change specifications (remanufacturing)?",
    "cite": ["w1", "w3", "w4", "w5", "w6"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "espr-scope", "name": "Ecodesign rules for products (ESPR)", "institution": "European Commission, DG ENV and DG GROW", "status": "open", "why": "Applies to new products; reused ones are out; remanufactured ones are in as new products.", "conditions": ["Platform lets sellers comply", "Takedowns and access for market surveillance"], "cite": ["w1"] },
      { "id": "repair-da", "name": "Repairability delegated act consultation", "institution": "European Commission", "status": "open", "why": "Feedback open to 9 Feb 2027; adoption planned 2027; phones and laptops likely out of scope.", "cite": ["w2"] },
      { "id": "cea", "name": "Circular Economy Act", "institution": "European Commission, DG ENV", "status": "probe", "why": "Proposal reported for 18 Nov 2026, conflicting report says 2027.", "cite": ["w6"] },
      { "id": "dpp", "name": "Digital product passport for phones and laptops", "institution": "European Commission", "status": "park", "why": "No product-specific ESPR act adopted yet; nothing to build against.", "cite": ["w8"] }
    ] },
    { "id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
      { "id": "de-r2r", "name": "German repair law (BGBl. 2026 I Nr. 212)", "institution": "Federal justice ministry", "status": "shut", "why": "Adopted and published; nothing left to shape; no marketplace duties in it.", "cite": ["w3", "w4", "w7"] }
    ] },
    { "id": "fr", "level": "national", "label": "France", "country": "FR", "doors": [
      { "id": "fr-r2r", "name": "French transposition of Directive 2024/1799", "institution": "Economy ministry, consumer protection directorate (DGCCRF)", "status": "open", "why": "Not transposed; infringement proceedings opened Sept 2026; text still to be written.", "cite": ["w5", "unverified"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "comply", "label": "Comply", "steps": [
      { "id": "de-warranty", "label": "Warranty flow: +12 months guarantee when a German consumer chooses repair", "start": 0, "end": 1, "owner": "client", "status": "planned", "cite": ["w3", "judgement"] },
      { "id": "reman-audit", "label": "Seller audit: refurbish vs remanufacture", "start": 0.25, "end": 2, "owner": "client", "status": "planned", "cite": ["w1"] },
      { "id": "msa-channel", "label": "Notice-and-takedown and enforcer access channel", "start": 1, "end": 3, "owner": "client", "status": "planned", "cite": ["w1"] }
    ] },
    { "id": "shape", "label": "Shape", "steps": [
      { "id": "coalition", "label": "Join an EU-level coalition via your German association or refurbisher peers", "start": 0.25, "end": 2, "owner": "client", "status": "planned", "cite": ["judgement"] },
      { "id": "consult", "label": "Repairability consultation response", "start": 1, "end": "2027-02-09", "owner": "us", "status": "planned", "depends_on": ["reman-audit"], "cite": ["w2"] },
      { "id": "cea-read", "label": "Read the Circular Economy Act proposal; position paper within a month", "start": 0.25, "end": 1.5, "owner": "us", "status": "planned", "cite": ["w6"] },
      { "id": "fr-dgccrf", "label": "Note to the French consumer protection directorate on how the transposition treats marketplaces and refurbished goods", "start": 1, "end": 3, "owner": "client", "status": "planned", "cite": ["w5", "judgement"] },
      { "id": "no-dpp", "label": "Blocked: no passport build or 'ESPR-compliant' claims yet", "start": 0, "end": 6, "owner": "client", "status": "blocked", "cite": ["w8", "judgement"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-cea", "label": "Circular Economy Act proposal: published or slipped to 2027?", "start": "2026-11-18", "milestone": true, "owner": "us", "status": "planned", "cite": ["w6"] },
      { "id": "w-fr", "label": "France: reply to the formal notice and transposition vehicle", "start": "2026-11-25", "milestone": true, "owner": "us", "status": "planned", "cite": ["w5"] },
      { "id": "w-consult", "label": "Repairability consultation closes", "start": "2027-02-09", "milestone": true, "owner": "us", "status": "planned", "cite": ["w2"] },
      { "id": "w-platform", "label": "EU repair platform; can national sections list sellers of refurbished goods?", "start": "2027-07-31", "milestone": true, "owner": "us", "status": "planned", "cite": ["w9"] },
      { "id": "w-laptops", "label": "Computers ecodesign revision: does it reach refurbished laptops?", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "com", "name": "European Commission", "side": "political", "country": "EU", "units": [
      { "id": "env", "name": "DG ENV, circular economy and ecodesign units", "roles": [
        { "id": "env-hou", "role": "Head of unit owning the Circular Economy Act", "priority": "P1", "reach": "Through the EU coalition, after the proposal is published", "status": "to_approach", "cite": ["w6", "judgement"] },
        { "id": "env-desk", "role": "Policy officer, repairability delegated act", "priority": "P2", "reach": "Consultation response first, then meeting request", "status": "to_approach", "cite": ["w2", "judgement"] }
      ] },
      { "id": "grow", "name": "DG GROW, ecodesign and market surveillance", "roles": [
        { "id": "grow-hou", "role": "Head of unit, ESPR implementation and marketplace guidance", "priority": "P2", "reach": "Through the Ecodesign Forum via a member association", "status": "to_approach", "cite": ["w1", "judgement"] }
      ] }
    ] },
    { "id": "de-min", "name": "German federal environment and economy ministries", "side": "political", "country": "DE", "units": [
      { "id": "de-ce", "name": "Circular economy unit, Council position", "roles": [
        { "id": "de-ref", "role": "Desk officer for the Circular Economy Act Council position", "priority": "P1", "reach": "Through your German e-commerce association", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] },
    { "id": "fr-min", "name": "French economy ministry", "side": "political", "country": "FR", "units": [
      { "id": "dgccrf", "name": "Consumer protection directorate (DGCCRF)", "roles": [
        { "id": "dgccrf-lead", "role": "Lead on transposing Directive 2024/1799", "priority": "P1", "reach": "Written note, then meeting via a French marketplace or repair federation", "status": "to_approach", "cite": ["unverified"] },
        { "id": "fr-env", "role": "Ecological transition ministry, circular economy lead", "priority": "P2", "reach": "Same note, copied", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] }
  ] },
  "process_maps": [
    { "id": "cea-path", "title": "How the Circular Economy Act gets decided",
      "explains": "From Commission proposal to adopted law, and where a refurbished-goods marketplace can push.",
      "kind": "legislative_file", "illustrative": true,
      "actors": [
        { "id": "com", "name": "Commission, DG ENV", "side": "political" },
        { "id": "ep", "name": "European Parliament, lead committee", "side": "political" },
        { "id": "council", "name": "Council, environment working party", "side": "political" }
      ],
      "steps": [
        { "id": "prop", "label": "Commission proposal", "kind": "document", "actor": "com", "timing": "18 Nov 2026 or 2027", "cite": ["w6"] },
        { "id": "ep-rep", "label": "Rapporteur's draft report", "kind": "document", "actor": "ep", "timing": "about 4-8 months after the proposal", "cite": ["judgement"] },
        { "id": "council-gen", "label": "Council general approach", "kind": "decision", "actor": "council", "cite": ["judgement"] },
        { "id": "trilogue", "label": "Trilogue and adoption", "kind": "decision", "actor": "council", "cite": ["judgement"] }
      ],
      "flow": [ { "from": "prop", "to": "ep-rep" }, { "from": "prop", "to": "council-gen" }, { "from": "ep-rep", "to": "trilogue" }, { "from": "council-gen", "to": "trilogue" } ],
      "leverage": [
        { "id": "lev-rep", "at": "ep-rep", "kind": "timing_window", "label": "Amendment window before the draft report", "why": "Definitions of reuse, refurbishment and remanufacturing get fixed here.", "how": "Coalition amendment text to the rapporteur's office.", "side": "political", "cite": ["judgement"] },
        { "id": "lev-de", "at": "council", "kind": "pressure_point", "label": "German ministry's Council position", "why": "A Berlin company with 1.2 million orders is a credible national voice.", "how": "Via your German e-commerce association to the circular economy desk.", "side": "political", "cite": ["judgement"] }
      ],
      "cite": ["w6", "judgement"] }
  ],
  "risks_flags": [
    { "id": "reman", "kind": "flag", "severity": "high", "title": "Sellers who remanufacture are treated as making new products", "fix": "Audit sellers; define refurbish vs remanufacture in seller terms; route remanufacturers to full compliance.", "cite": ["w1"] },
    { "id": "illegal", "kind": "flag", "severity": "medium", "title": "Listings of non-compliant products are illegal content", "fix": "Takedown flow and an access channel for market surveillance authorities.", "cite": ["w1"] },
    { "id": "warranty", "kind": "flag", "severity": "medium", "title": "Different repair-guarantee extensions in DE (12 months) and FR (6 months for now)", "fix": "Country-specific warranty logic; plan for 12 months in France too.", "cite": ["w3", "unverified"] },
    { "id": "claims", "kind": "flag", "severity": "medium", "title": "Generic green or 'ESPR-compliant' claims", "fix": "Hold until a standard exists; check the EU green-claims rules for consumers.", "cite": ["judgement", "unverified"] }
  ]
}
```

## Sources (all retrieved 17 Nov 2026)

- **[w1]** European Commission, ESPR FAQ (09/2024, Ref. Ares(2024)6780548), copy hosted at https://www.danskindustri.dk/globalassets/medlemsforeninger/dfl/nyheder/2024/espr-faq-v1_25_09_2024_final-003.pdf
  - Q5: "apply to new products, therefore reused products are not included"
  - Q5: "remanufactured products are included in the potential scope of ESPR regulations because they are new products"
  - Q151: "Providers of online marketplaces have to design their platforms to allow the economic operators to comply"
  - Q151: "Items of content that refer to products that are not compliant with ESPR obligations are considered to be illegal content"
- **[w2]** European Commission, DG Environment news, 3 Nov 2026, https://environment.ec.europa.eu/news/commission-launches-consultation-easier-product-repairs-2026-11-03_en, with the consultation page https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/17873-Ecodesign-requirements-on-product-repairability_en
  - Quote: "currently planned for adoption in 2027". Deadline 9 February 2027. Lists "Repairability scores or information at the point of sale".
- **[w3]** German Bundestag, https://www.bundestag.de/dokumente/textarchiv/2026/kw26-de-reparatur-1191040
  - Quote: "Bundestag stimmt ‚Recht-auf-Reparatur-Richtlinie' zu". The 12-month extension is from the secondary summary at https://www.ihk.de/lippe-detmold/hauptnavigation/beraten-und-informieren/recht/aktuelles-recht/recht-auf-reparatur-richtlinie2-7128174
- **[w4]** Federal Law Gazette extract held by the IHK, https://www.ihk.de/blueprint/servlet/resource/blob/7124220/c1747f51466f362ed8193e03cc4ba7b4/veroeffentlichung-im-bundesgesetzblatt-data.pdf
  - Shows BGBl. 2026 I Nr. 212 of 22 July 2026.
- **[w5]** Eunews, 25 Sep 2026 (secondary), https://www.eunews.it/en/2026/09/25/right-to-repair-italy-and-17-other-countries-have-failed-to-transpose-the-directive-eu-infringement-proceedings-begin/, and https://www.lettredesreseaux.com/?p=24431
  - Quote: "La Commission a engagé une procédure d'infraction contre la France en septembre 2026"
- **[w6]** EUWID (secondary), https://www.euwid-recycling.com/news/markets/circular-economy-act-proposal-expected-on-11-november-061026/, and The European Post, https://theeuropeanpost.eu/policy-gazette/circular-economy-act-slips-to-18-november-as-textile-sector-waits/
  - The proposal has "slipped" to 18 November. An Agence Europe item of 14 Nov says 2027. Treat both dates as open.
- **[w7]** Deutsche Umwelthilfe press release (NGO, secondary), https://www.duh.de/presse/pressemitteilungen/pressemitteilung/neues-recht-auf-reparatur-greift-zu-kurz-deutsche-umwelthilfe-kritisiert-hohe-kosten-und-fehlende-s/
  - Criticises the law for lacking duties on online marketplaces.
- **[w8]** dpp-tool (secondary), https://dpp-tool.com/en/blog/espr-delegated-acts/
  - Quote: "no product-group delegated act has been adopted under the ESPR"
- **[w9]** Cuatrecasas (secondary), https://www.cuatrecasas.com/en/spain/intellectual-property/art/eu-imposes-new-repair-obligations-on-manufacturers-and-sellers
  - The EU repair platform is due by 31 July 2027. Member states "may extend" their national sections to sellers of refurbished goods.

## Questions still open

- **Do sellers replace major modules or change specifications?** This decides whether they are remanufacturers carrying full manufacturer duties.
- **Is your GmbH ever the seller of record, or does it take returns into its own stock?** Either one changes whether the seller duties and the rules on unsold products bind you directly.
- **What share of your orders are laptops?** It sets how much the revision of the computer ecodesign rules matters to you (unverified).
- **Is your German association a member of an EU federation?** That is the fastest way into the Ecodesign Forum and the Circular Economy Act coalitions.
