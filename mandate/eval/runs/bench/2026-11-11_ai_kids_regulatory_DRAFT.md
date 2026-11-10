# Bench run: ai_kids_regulatory (DRAFT, for the expert to grade in module 7)

Case: `mandate/eval/scenarios/ai_kids_regulatory.yaml`. **Its must / must_not are Claude's
DRAFT, written before the expert interview; there is no model answer yet.** Run on
2026-11-10, dated for the interview on 11 Nov 2026. Run inside Claude Code as the `regina`
agent (`.claude/agents/regina.md`): no Anthropic API call, production read-only through
`web/scripts/brain_tool.ts`. Playbooks: `method.md`, `regina.md` (no `policy-*.md` exists
yet). Profile: `2026-11-11_ai_kids_regulatory_DRAFT.profile.json`. Ledger:
`2026-11-11_ai_kids_regulatory_DRAFT.ledger.json` (c1 to c53).

The founder's follow-up answers are the scenario's ASSUMED answers (written by Claude to
make the case concrete), not a real founder's.

## The case

> We are an AI-native startup building a learning product for young children. We plan to
> launch in the EU next year. What do we have to get right on regulation, what could stop
> us, and who should we be talking to?

## Turn 1: Regina asks first

The ask names no structure, no market and no feature, and each of those changes which
rules apply. So Regina asked, and stopped:

1. **Where are you established, and do you have an EU entity?** Decides whether you need
   an EU representative under the AI Act and the GDPR, and which data protection
   authority leads.
2. **Who buys and who uses it: parents at home, schools, or both?** The AI Act's education
   category is written for educational institutions; home use may fall outside it.
3. **What does the AI decide about the child?** Scoring, grading, choosing the next lesson,
   flagging problems: these are the uses the AI Act lists.
4. **What do you collect: voice, video, text? Do you infer anything about the child's
   feelings or attention?** Emotion inference is where the hard prohibitions sit.
5. **Ages and countries?** Consent ages and national AI rules differ per member state.
6. **Whose model is it?** Your own, or a third-party general-purpose model; and how much
   you change it.
7. **Can children talk to each other or post anything?** Decides whether platform rules
   (DSA) apply at all.

## Turn 1: founder's answers (scenario `founder_followup`, assumed)

> We are a UK limited company in London with no EU entity yet. The product is a voice-first
> AI tutor app for children aged 4 to 8 (early reading and maths). Parents subscribe
> directly, and we are piloting a school licence with a few primary schools in the
> Netherlands and Germany, where teachers see a class dashboard. The tutor runs on a
> third-party general-purpose model through an API, with our own prompts and a small
> fine-tuned layer. It listens to the child read aloud, scores reading level, decides the
> next lesson and sends progress reports to parents and teachers. We keep voice recordings
> for 30 days to improve the model. There are no ads and no way for children to talk to
> each other. We are building a feature that detects frustration in the child's voice and
> adapts the lesson. We want to launch in Germany, France, the Netherlands and Italy in
> 2027. About 25 staff; seed round closed.

## Tool calls (one line each)

1. `search_law` {AI in education, evaluate learning outcomes, high-risk; EU}: c1 to c6. Annex III point 3 found in the AI Act [c3]; the rest are 2021 proposal and 2023 EP text.
2. `document` 1302 (AI Act) {Art. 5: emotion recognition in education; vulnerabilities due to age}: c7 to c11. Art. 5(1)(b) [c8], 5(1)(f) [c9].
3. `document` 1302 {emotion recognition definition; Art. 22; Art. 50; dates}: c12 to c16. Recital 18 [c12], Art. 50(1) and (3) [c16][c15], recital on vulnerable groups [c13].
4. `document` 1302 {authorised representative; application dates}: c17 to c21. Recital 82 [c17], recital 179 dates [c20]. Corpus holds the 2024 text only (1 version), not the Omnibus amendment.
5. `search_law` {GDPR Art. 8 child consent; EU}: c22 to c27. **Only drafts and Regulation 2018/1725 came back, not the GDPR (32016R0679).** Not relied on. Bench gap.
6. `search_law` {DSA online platforms accessible to minors; EU}: c28 to c33. DSA recital 71 [c28]; Art. 28 guidelines record [c29]; **EU KIDS Act proposal (17 Sep 2026)** [c32][c33].
7. `document` 9022 (Commission KIDS Act news) {scope, chatbots, timeline}: c33, c34. Text truncated; scope not readable.
8. `search_law` {Digital Omnibus on AI, postponement; EU}: c35 to c40. Proposal [c35]; provisional agreement May 2026, not yet adopted in July [c40].
9. `search_law` {minori di quattordici anni, IA, consenso; IT}: nothing. Italy's AI law (L. 132/2025) is not in the corpus.
10. `search_law` {AI chatbots, minors, age verification; EU IT DE FR NL}: c41 to c46. KIDS Act covers AI companions and chatbots [c42][c46] (press, secondary).
11. `consultations` {EU, 120 days}: 8 open, none on minors or AI in education. The KIDS Act feedback window is not in the list. Bench gap.
12. `actors` {EU KIDS Act}: none.
13. `actors` {protection of minors online}: Christel Schaldemose (EP, rapporteur), Henna Virkkunen (Commission), Kim Van Sparrentak and others as speakers. Register record, uncited.
14. `actors` {document 1321, AI Omnibus}: none.
15. `document` 1301 (DSA) {online platform definition; Art. 28}: c47 to c50.
16. `document` 1302 {Annex III point 1(c); Art. 6(3)}: c51 to c53. Emotion recognition is Annex III 1(c) [c52]; profiling keeps a system high-risk [c53].
17. Web: 12 sources used (w1 to w12). KIDS Act proposal read from the Council register PDF (ST 13321/26). `--ground` is not on main (only on branch `batch-italy`), so web sources are `[wN]`, not grounded.

## Regina's answer

### 1. Answer

You can launch in 2027, but not the product as specified. First, take the frustration
detector out of anything sold to schools, and think hard before shipping it at home.
Inferring a child's emotions from their voice in education has been prohibited since
2 February 2025 [c9][c20]. At home it is still high-risk emotion recognition [c52].
Second, the school version is a high-risk AI system. It evaluates learning outcomes and
steers learning in schools [c3], and it profiles each child, so the Article 6(3) exit is
closed [c53]. Those obligations apply from 2 December 2027 [w1], inside your launch
window, so build the conformity file now and appoint an EU representative. Third,
everything else (GDPR consent, AI disclosure, voice retention) is ordinary
good practice, done before launch. The one political file that could reshape the product
is the EU KIDS Act proposal [w2]. As drafted, a tutor that "simulates a relationship" with
the child could count as an AI companion. It would then lose the default use of the
child's past sessions, which adaptive learning depends on [w2]. Respond to the
Commission's feedback window this month (deadline unverified, see Watches).

### 2. The rules that decide it

**EU: AI Act (Regulation 2024/1689, as amended by Regulation 2026/1744)**
- *Prohibitions, applicable since 2 Feb 2025* [c20]. Art. 5(1)(f): no AI systems "to infer
  emotions of a natural person in the areas of workplace and education institutions",
  except for medical or safety reasons [c9]. Emotion recognition means inference "on the
  basis of their biometric data" [c12]. Art. 5(1)(b): no system that "exploits any of the
  vulnerabilities of a natural person ... due to their age" to materially distort
  behaviour [c8].
- *High-risk, education.* Annex III 3(b): systems "intended to be used to evaluate learning
  outcomes, including when those outcomes are used to steer the learning process ... in
  educational and vocational training institutions at all levels" [c3]. Art. 6(3): an
  Annex III system "shall always be considered to be high-risk where the AI system performs
  profiling of natural persons" [c53]. A provider that self-assesses as not high-risk must
  document it and register [c53].
- *High-risk, biometrics.* Annex III 1(c): "AI systems intended to be used for emotion
  recognition" [c52], i.e. any emotion recognition that is not prohibited [c51].
- *Dates.* The Omnibus sets Annex III high-risk obligations "to 2 December 2027" [w1]
  (published OJ L 24.7.2026 [w1]). The general date of 2 Aug 2026 stands, so the Art. 50
  transparency duty already applies (judgement from [c20] and [w1]; confirm against the
  consolidated text).
- *Transparency.* Art. 50(1): people must be informed they are interacting with an AI
  system [c16]. Implementation must take into account "vulnerable groups due to their age"
  [c13].
- *Non-EU provider.* A provider established in a third country must appoint "by written
  mandate ... an authorised representative established in the Union" [c17].

**EU: GDPR (Regulation 2016/679)**
- Art. 8(1): consent for an information society service offered directly to a child is
  lawful where "the child is at least 16 years old" [w5], unless a member state sets a
  lower age (France and Italy have, below). Your users are 4 to 8, so parental consent is
  needed in every market. The work is verifying the parent, not choosing an age (judgement).
- Art. 35(1): a DPIA "prior to the processing" where high risk is likely [w5]. Voice data
  of young children, profiling and a school setting make this certain (judgement).
- Art. 27(1): a controller outside the EU "shall designate in writing a representative in
  the Union" [w5].
- Without an EU main establishment there is no lead authority, so each market's data
  protection authority is competent for you (unverified here; GDPR Art. 56(1); confirm
  with counsel).

**EU: DSA (Regulation 2022/2065)**
- Art. 28 binds "online platforms": a hosting service that stores and disseminates
  information to the public at a user's request [c48][c47]. An app where children cannot
  publish or message anyone does not look like an online platform, so Art. 28 likely does
  not bind you (judgement). Use the Commission's Art. 28 guidelines [c29] as the
  benchmark regulators and school buyers will apply anyway.

**EU: KIDS Act, proposal COM(2026) 681, file 2026/0286(COD)** [w2]
- Scope includes "AI companions" and "general conversational chatbots" offered in the EU,
  wherever the provider is established (Art. 2(1)(f)-(g), 2(3)) [w2].
- "General conversational chatbot" excludes systems limited to a specialised task,
  explicitly including "educational" applications. **"AI companion" has no such
  exclusion**: an AI system "that provides sustained, personalised interaction or
  companionship which simulates or facilitates a social, emotional or interpersonal
  relationship with a user" (Art. 3(c)-(d)) [w2].
- Excluded entirely: "services and systems that are designed for primarily educational
  purposes, and operated by educational establishments or organisations, or on their
  behalf" (Art. 2(4)(c)) [w2]. That likely covers the school licence, not the parent
  subscription (judgement).
- If in scope (Art. 14(1)) [w2]: by default no use of "information or analysis derived
  from a minor's prior interactions in subsequent interactions"; under-13 access only
  through guardian tools; risk testing before launch; post-market monitoring (waived for
  micro and small enterprises).
- Applies 6 months after entry into force (Art. 43) [w2]. It is a proposal; Parliament
  and Council have not yet acted (judgement).

**National**
- *Italy.* L. 132/2025, art. 4(4): access to AI technologies by children under 14 and the
  related processing "richiedono il consenso di chi esercita la responsabilità genitoriale"
  [w4]. GDPR consent age 14 (Codice privacy art. 2-quinquies) [w7]. National AI
  authorities: AgID (notification, sandboxes) and ACN (supervision, inspections,
  sanctions) (art. 20) [w4].
- *France.* Consent alone from 15; below 15, "conjointement par le mineur concerné et le
  ou les titulaires de l'autorité parentale" (loi 78-17, art. 45) [w6]. AI Act market
  surveillance authority: unverified.
- *Germany.* Bundesnetzagentur is the AI Act market surveillance authority (KI-MIG § 2(1),
  signed 22.07.2026) [w12]. GDPR age 16 (no lower national age found, unverified). Schools
  are a Land competence, so approval of school software differs by Land (unverified).
- *Netherlands.* GDPR age 16 (unverified). The Dutch DPA reads the emotion-recognition ban
  to cover "online or distance learning" [w10].

### 3. What it means for this company

- **You are the provider** of the tutor: you place it on the market under your name
  (judgement). The base model's provider keeps the general-purpose model duties. A small
  fine-tune stays below the indicative "one third of training compute" line at which a
  modifier becomes a model provider (secondary [w11]; judgement).
- **School licence (NL, DE pilots): high-risk under Annex III 3(b)** [c3][c53]. Before
  2 Dec 2027 [w1] you need the high-risk file: risk management, data governance,
  technical documentation, logs, human oversight for teachers, accuracy testing,
  conformity assessment, registration (judgement; Chapter III, not quoted here). Schools
  become deployers with their own duties; public schools may owe a fundamental-rights
  impact assessment (unverified, AI Act Art. 27). Your buyers will ask you for both.
- **Home subscription: probably not Annex III 3(b)**, which is written for institutions
  [c3] (judgement; the Commission's Art. 6 guidelines were due by 2 Feb 2026 [c53]: check
  them before relying on this). Art. 50 disclosure, Art. 5 and GDPR apply regardless.
- **Frustration detection.** In schools: prohibited [c9]. Voice inference that "a student
  is furious" is the Commission's own example [w10]. At home: high-risk under Annex III
  1(c) [c52], in the Netherlands possibly prohibited too [w10], and a GDPR question
  about inferences on a 5-year-old. Cost-benefit says drop it. If you need the signal,
  adapt to task performance (errors, retries, pauses) rather than vocal affect
  (judgement; whether timing data counts as biometric is unsettled, unverified).
- **Voice recordings kept 30 days "to improve the model".** That is a second purpose
  needing its own basis and parental consent. Say whether recordings reach the
  third-party model provider (judgement). Garante practice: OpenAI was fined EUR 15M,
  partly because it had no age verification and exposed "minori di 13 anni" to
  unsuitable answers [w8]. Replika's developer was fined EUR 5M (May 2025, secondary [w9]).
- **KIDS Act.** Design the tutor as a teacher, not a friend: no persona that claims
  feelings, no "I missed you". Keep progress data as learning records, not conversation
  memory. That keeps you on the educational side of both definitions (judgement on a
  draft text).

### 4. Deal-breakers and sequencing

Deal-breakers: (1) emotion inference in the school product [c9]; (2) no parental consent
or verification for under-14s in Italy [w4] and children generally [w5]; (3) school
version without a high-risk file after 2 Dec 2027 [w1]; (4) a companion-style persona if
the KIDS Act passes as drafted [w2].

- **This month:** freeze the frustration feature for schools; decide home. Send the KIDS
  Act feedback (draft below). Start the DPIA.
- **This quarter:** choose an EU establishment where decisions on the data are really
  taken, which gives you a lead authority. A letterbox does not (unverified, EDPB
  practice). Appoint the AI Act authorised representative [c17] and GDPR representative
  [w5] until then. Parental consent and verification flow; per-country consent ages
  [w6][w7][w4]. Art. 50 disclosure designed for 4-year-olds [c16][c13].
- **Before scaling school pilots (H1 2027):** high-risk gap analysis against Chapter III;
  teacher oversight; a data processing agreement with each school (school as controller,
  you as processor; judgement). Consider the national AI sandboxes (Italy: AgID/ACN
  [w4]; Germany: BNetzA must run one, unverified).
- **Later (H2 2027):** conformity assessment and registration of the school version before
  2 Dec 2027 [w1]; KIDS Act text tracked through trilogue.
- **Italy last** of the four: the under-14 AI consent rule [w4] and the most active
  authority on AI chatbots and children [w8][w9] (judgement).

### 5. People and bodies to engage

| Front | P1 (decides) | P2 (influences) |
|---|---|---|
| KIDS Act text | European Commission, DG CNECT, head of the unit leading the KIDS Act (name unverified) | EP lead committee rapporteur once appointed (unverified; likely IMCO). Christel Schaldemose was rapporteur on the EP's minors-online file (register record, uncited); Irish Presidency put child safety on its agenda [c40] |
| AI Act, school version | National market surveillance authority per market: Bundesnetzagentur (DE) [w12]; ACN (IT) [w4]; NL and FR unverified | AI Office (Commission) on guidelines and standards (judgement) |
| Data protection | Lead DPA once established; until then each market's DPA, head of the children's or AI unit (names unverified) | Garante (IT): sets the tone on AI and minors [w8]; Autoriteit Persoonsgegevens (NL): already reads the emotion ban broadly [w10] |
| Buyers | Education ministries / Land ministries and school boards in NL and DE (unverified which unit approves software) | Teachers' and parents' associations; an EdTech industry association (to identify) |

### 6. Positioning

Lead with evidence of child safety by design: no ads, no social features, no emotion
inference, parent-controlled, teacher-overseen (judgement). This puts you on the side of
the KIDS Act's purpose [c33], which is where the Commission and Parliament are
politically. Do not claim "AI Act compliant" or "certified": the high-risk rules do not
apply until Dec 2027 [w1] and no conformity assessment exists yet (judgement). Do not
argue against the KIDS Act. Ask for it to say clearly that educational tutors are not
companions.

### 7. Watches

- KIDS Act 2026/0286(COD) [w2]: the feedback deadline (26 Nov or 3 Dec 2026, sources
  disagree [w3], plan to 26 Nov); lead committee and rapporteur; Council working party;
  the Art. 3(c) "AI companion" and Art. 2(4)(c) exclusion wording.
- AI Act high-risk date 2 Dec 2027 [w1]; Commission Art. 6 guidelines [c53]; harmonised
  standards (unverified status).
- Commission Art. 5 guidelines on "education institutions" and home learning [w10].
- Italy: implementing decrees of L. 132/2025 [w4]; Garante actions on AI and minors [w8].
- Germany: BNetzA AI sandbox and guidance under KI-MIG [w12].
- Consolidated AI Act text on EUR-Lex (Art. 50 transition for systems already on the
  market differs between secondary sources; unverified).

### 8. Outreach draft (to the head of unit, DG CNECT, leading the KIDS Act; English)

> Subject: EU KIDS Act: educational AI tutors and the definition of "AI companion"
>
> Dear [Name],
>
> [Company] builds a voice-based AI tutor that teaches reading and maths to children aged
> 4 to 8, used by families and by primary schools in the Netherlands and Germany. It has no
> advertising, no social features and no emotion inference.
>
> We support the proposal's aim. We would ask one point of clarity: that an AI tutor
> limited to a defined curriculum falls outside "AI companion" in Article 3, as it already
> falls outside "general conversational chatbot". As drafted, the default bar on using a
> child's prior interactions could prevent a tutor from remembering what a child has
> already learned.
>
> We have filed this in the feedback round and would welcome 30 minutes with your team to
> show how the product works.
>
> Yours sincerely,
> [Name], [Title], [Company]

### 9. Sources

Grounding (ledger `2026-11-11_ai_kids_regulatory_DRAFT.ledger.json`):
- [c3] AI Act, Annex III point 3, CELEX 32024R1689, 88f67b161880.
- [c8] AI Act Art. 5(1)(a)-(b), 88f67b161880.
- [c9] AI Act Art. 5(1)(f)-(g), 88f67b161880.
- [c12] AI Act recital 18 (emotion recognition system), 88f67b161880.
- [c13] AI Act recital 132 (interaction with AI; vulnerable groups due to age), 88f67b161880.
- [c16] AI Act Art. 50(1), 88f67b161880.
- [c17] AI Act recital 82 (authorised representative), 88f67b161880.
- [c20] AI Act recital 179 (application dates, original text), 88f67b161880.
- [c29] Commission Have Your Say, "Protection of minors – guidelines" (initiative 14352), b886433f36e3.
- [c33] Commission, "EU KIDS Act to restrict social media platforms' access to children", 17 Sep 2026, 328a34f3b87f.
- [c40] Tech Policy Press, Irish Presidency agenda (AI Omnibus, child safety), 26fcffed16b6. Secondary.
- [c47] DSA recital 13 (online platforms), CELEX 32022R2065, 8cc110427995.
- [c48] DSA Art. 3(g)(iii) hosting, 3(i) online platform, 8cc110427995.
- [c51] AI Act recital 54 (non-prohibited emotion recognition is high-risk), 88f67b161880.
- [c52] AI Act Annex III point 1(c), 88f67b161880.
- [c53] AI Act Art. 6(3)-(5), 88f67b161880.
- Returned, not relied on: c1, c2, c4 to c7, c10, c11, c14, c15, c18, c19, c21 to c28, c30 to c32, c34 to c39, c41 to c46, c49, c50. (c42 and c46, press accounts of the KIDS Act chatbot rules, were superseded by the proposal text [w2].)

Web (retrieved 2026-11-10):
- [w1] EUR-Lex, Regulation (EU) 2026/1744 (Digital Omnibus on AI), https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng : recital 40, "set to 2 December 2027 for AI systems classified as high-risk pursuant to Article 6(2) and Annex III"; OJ L 24.7.2026.
- [w2] Council register ST 13321/26 = COM(2026) 681 final, 2026/0286(COD), https://data.consilium.europa.eu/doc/document/ST-13321-2026-INIT/en/pdf : Art. 2(1)(f)-(g), 2(3), 2(4)(c) "services and systems that are designed for primarily educational purposes, and operated by educational establishments or organisations, or on their behalf"; Art. 3(c) "'AI companion' means an AI system ... that provides sustained, personalised interaction or companionship which simulates or facilitates a social, emotional or interpersonal relationship with a user"; Art. 3(d) excludes "specialised ... educational ... AI applications" from "general conversational chatbot"; Art. 14(1)(b) "by default, their system does not use information or analysis derived from a minor's prior interactions in subsequent interactions"; Art. 14(1)(d) under-13 access via guardian tools; Art. 43 "shall apply from [same day as entry into force plus 6 months]".
- [w3] Feedback deadline, conflicting: EU Agenda / Fieldfisher "3 December 2026"; Brussels Times "26 November 2026" (search results, not fetched: https://euagenda.eu/events/2026/12/03/child-online-safety-keeping-digital-spaces-accountable-and-trustworthy-eu-kids-act-commission-adoption , https://www.brusselstimes.com/2343893/eu-kids-act-draft-sparks-widespread-feedback-push-to-reshape-digital-childhoods ). Confirm on Have Your Say.
- [w4] Legge 23 settembre 2025, n. 132 (GU n. 223, 25.9.2025), text via https://www.dirittobancario.it/wp-content/uploads/2025/09/Legge-23-settembre-2025-n.-132.pdf : art. 4(4) "L'accesso alle tecnologie di intelligenza artificiale da parte dei minori di anni quattordici nonché il conseguente trattamento dei dati personali richiedono il consenso di chi esercita la responsabilità genitoriale"; art. 20(1) AgID and ACN "designate quali Autorità nazionali per l'intelligenza artificiale"; ACN "responsabile per la vigilanza, ivi incluse le attività ispettive e sanzionatorie".
- [w5] EUR-Lex, Regulation (EU) 2016/679, https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng : Art. 8(1) "the processing of the personal data of a child shall be lawful where the child is at least 16 years old"; Art. 27(1) "the controller or the processor shall designate in writing a representative in the Union"; Art. 35(1) "prior to the processing, carry out an assessment of the impact".
- [w6] Légifrance, loi 78-17 art. 45, https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000037823135/2026-11-10 : "à compter de l'âge de quinze ans"; below 15, "conjointement par le mineur concerné et le ou les titulaires de l'autorité parentale".
- [w7] Normattiva, d.lgs. 196/2003 art. 2-quinquies(1), https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2003-06-30;196~art2quinquies : "il minore che ha compiuto i quattordici anni può esprimere il consenso".
- [w8] Garante privacy, press release 20 Dec 2024 (doc. 10085432), https://garanteprivacy.it/garante/doc.jsp?ID=10085432 : "una sanzione di quindici milioni di euro"; "OpenAI non ha previsto meccanismi per la verifica dell'età"; "esporre i minori di 13 anni a risposte inidonee".
- [w9] Insurance Journal (Reuters), 20 May 2025, https://www.insurancejournal.com/news/international/2025/05/20/824403.htm : Replika developer fined EUR 5M (search result, not fetched). Secondary; the Garante's own decision not fetched.
- [w10] Future of Privacy Forum, on the Commission's Art. 5(1)(f) guidelines, https://fpf.org/blog/red-lines-under-eu-ai-act-unpacking-the-prohibition-of-emotion-recognition-in-the-workplace-and-education-institutions/ : education institutions read "without any limit, in terms of the types or ages of pupils or students"; example "Systems inferring from voice or body gestures, that a student is furious"; Dutch DPA includes "home working environments, online or distance learning". Secondary; the guidelines themselves not fetched.
- [w11] Commission GPAI guidelines as summarised by Modulos / WilmerHale (search results, not fetched): modifier becomes provider above one third of original training compute; indicative. Secondary.
- [w12] gesetze-im-internet.de, KI-MIG, https://www.gesetze-im-internet.de/ki-mig/BJNR0DF0B0026.html : § 2(1) "Die Bundesnetzagentur ist die für die Einhaltung der Verordnung (EU) 2024/1689 zuständige Marktüberwachungsbehörde"; Ausfertigungsdatum 22.07.2026.

### 10. Questions for the founder

1. Does the tutor have a character the child talks to, with a name and a personality?
   This decides the KIDS Act "AI companion" test [w2].
2. Do voice recordings or transcripts reach the base-model provider, and are they used to
   train anything beyond your layer? This decides the GDPR basis and who is controller.
3. In the school pilots, who signs: the school, the municipality or the Land? This decides
   who the deployer and controller are, and who buys.
4. Where will the EU team that decides on the product and data sit? This decides your
   lead data protection authority.
5. Is frustration detection core to learning outcomes, or a nice-to-have? If core, it needs
   a redesign, not a disclaimer.

## Claims ledger

Every load-bearing claim, its basis, and what would overturn it.

| # | Claim | Basis | Status |
|---|---|---|---|
| 1 | Emotion inference in education institutions prohibited since 2 Feb 2025 | [c9][c20] | cited |
| 2 | Voice-based emotion inference is in scope of the ban | [c12] (biometric basis) + [w10] (Commission example, via secondary) | cited / secondary |
| 3 | Home emotion recognition is high-risk (Annex III 1(c)) | [c52][c51] | cited |
| 4 | Dutch DPA reads ban into distance learning | [w10] | secondary |
| 5 | School version is high-risk under Annex III 3(b) | [c3] + reading of "in educational ... institutions" | cited + judgement |
| 6 | Art. 6(3) exit closed because the tutor profiles | [c53] + judgement that scoring and steering is profiling | cited + judgement |
| 7 | Home-only version likely outside Annex III 3(b) | [c3] wording; Art. 6 guidelines not checked | judgement |
| 8 | Annex III obligations from 2 Dec 2027 | [w1] recital 40 | cited (web) |
| 9 | Art. 50 disclosure already applies | [c20] + [w1] | judgement; confirm consolidated text |
| 10 | Non-EU provider needs an EU authorised representative | [c17] (recital) | cited; operative Art. 22 not quoted |
| 11 | GDPR default age 16; FR 15 with joint consent below; IT 14 | [w5][w6][w7] | cited (web) |
| 12 | DE and NL use 16 | none | unverified |
| 13 | Italy: parental consent for AI access under 14 | [w4] art. 4(4) | cited (web) |
| 14 | No EU establishment means no lead DPA | GDPR Art. 56 not fetched | unverified |
| 15 | DSA Art. 28 likely does not bind the app | [c48][c47] + judgement | judgement |
| 16 | KIDS Act: educational carve-out from "chatbot" but not from "AI companion" | [w2] Art. 3(c)-(d) | cited (web, official) |
| 17 | KIDS Act default bar on prior-interaction memory | [w2] Art. 14(1)(b) | cited (web, official) |
| 18 | School licence likely within Art. 2(4)(c) exclusion | [w2] + judgement | judgement |
| 19 | KIDS Act feedback closes 26 Nov or 3 Dec 2026 | [w3] conflicting | unverified |
| 20 | BNetzA is DE market surveillance authority | [w12] | cited (web) |
| 21 | ACN supervises AI in Italy; AgID runs sandboxes | [w4] | cited (web) |
| 22 | Garante fined OpenAI EUR 15M, partly for no age verification | [w8] | cited (web, official) |
| 23 | Replika developer fined EUR 5M | [w9] | secondary |
| 24 | Small fine-tune does not make the startup a GPAI model provider | [w11] | secondary + judgement |
| 25 | Public schools may owe a FRIA | none | unverified |
| 26 | NL and FR AI Act market surveillance authorities | none | unverified (not researched) |

## Self-check against the DRAFT checkpoints

Weak evidence: Claude wrote both the checkpoints and the answer, before the interview. The
expert's grade is the real measure.

- Met: ask first (must 1); classify by use with operative text (2); Art. 5 as first
  deal-breaker (3); dates as they stand today, cited (4); DSA scope test first (6);
  national overlays per country (7); deal-breakers and sequence (9); positioning and
  watches (11); next steps and draft (12).
- Partly: GDPR (5): one-stop-shop and DE/NL ages unverified. Enforcement precedent (8):
  two Italian cases only, no DPC or CNIL case on children and edtech. Bodies (10): no named
  officials, NL/FR AI authorities not researched, education-ministry buyers unverified.
- must_not: none clearly violated. Borderline: "Art. 50 already applies" is a judgement
  where the Omnibus transition for systems already on the market is unclear.

## Bench findings (for the owner, not the founder)

- Regina's corpus returned GDPR drafts and Regulation 2018/1725 for an Art. 8 query, but not
  the GDPR itself (32016R0679). Ingest it (and the national GDPR acts) as key acts.
- The corpus holds the AI Act's 2024 text only. The Omnibus amendment (2026/1744, in force
  27 Jul 2026) is not in it, so every AI Act date from the corpus is stale.
- The KIDS Act proposal (17 Sep 2026) is in the corpus only as press items. The proposal
  text and its open feedback window are missing; `consultations` did not list it.
- Italy's AI law (L. 132/2025) and Germany's KI-MIG are not in the corpus.
- `actors` returned no one for the KIDS Act or the AI Omnibus.
- `--ground` exists only on branch `batch-italy`; until it reaches main, bench web sources
  cannot become `[cN]`.

## Grade (expert, module 7)

```
grade: 1-5          # 5 send to a client as is, 4 light edits, 3 right idea / rework, 2 misses the point, 1 wrong
wrong: |            # what is legally or factually wrong
missing: |          # what a senior would have said that is not here
naive: |            # what a junior would write but a senior never would
politically_off: |  # tone, angle, who to engage, what to never claim
rewrite_first_paragraph: |   # the expert's own version of "1. Answer" (becomes the model answer)
must_must_not: |    # corrections to the DRAFT checkpoints in ai_kids_regulatory.yaml
playbook: |         # the lesson, phrased as a rule for regina.md / policy-*.md
```
