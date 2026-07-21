# Brief-Improve Log

Chronological record of `regina brief-improve` runs — newest at the top. Each entry is the full rendered report for that run (round-by-round scores, the dimension breakdown, and a before/after diff of the actual generated text), plus a pointer to that run's raw JSON sidecar for full-fidelity drill-down.

---

## 2026-07-21 19:45 UTC — hand-authored prompt review fixes, CONFIRMED (+0.4)

Spent **$5.91** of a no cap across 29 calls. Stopped: `completed_all_rounds`.

| Phase | Calls | $ | Input tok | Output tok | Cache read | Cache write |
|---|---|---|---|---|---|---|
| generation | 27 | 5.74 | 882286 | 193012 | 206934 | 35098 |
| judge | 2 | 0.17 | 48220 | 1794 | 0 | 0 |

### Round-by-round

| Round | Aggregate | Δ vs. prior best | Accepted | Elapsed | Note |
|---|---|---|---|---|---|
| 0 (baseline) | 3.486 | — | yes | 791.4s | — |
| 1 | 3.886 | +0.4 | yes | 1252.2s | Hand-authored bundle of 7 fixes from a manual prompt review: date injection, concrete-action ACTION bullets, Directive-transposition coverage, 'may'-ban statutory carve-out, Monitor/Out-of-Scope third-party-dynamic collision fix, thin-footprint word-count exception, plus 4 smaller cleanup items. |

### Outcome

During exploration (sharpen=False, cheap), the best candidate improved the aggregate score from 3.486 to 3.886 (+0.4). **This has NOT been applied anywhere** — it exists only as the diff below. See the confirmation section for whether this holds up under production's real two-pass path before deciding whether to apply it.

### Proposed diff

```diff
--- SYSTEM_PROMPT (current)
+++ SYSTEM_PROMPT (proposed)
@@ -1,34 +1,36 @@
 You are a senior public-affairs analyst producing a regulatory intelligence brief for an executive who is about to brief a business leader. This is a decision document, not a legal memo. Use ONLY the retrieved source documents for factual claims about obligations, deadlines, and instrument text — never assert a specific obligation the sources do not support. This applies to the instrument's IDENTITY as much as its content: never name a law, directive, regulation or proposal that is not among the retrieved documents, even a real one you recognize from general knowledge and even when it covers similar ground to something that IS retrieved (e.g. a retrieved instrument on sustainability-marketing claims must be called by its own retrieved name — do not swap in a different, unretrieved act on the same topic you recall training on, stalled or enacted). If you are drafting a row and cannot recall which retrieved document it belongs to, that is the signal to re-check the documents before naming one, not to reach for whichever name feels most familiar. Institutional and biographical context (who runs a dossier, their mandate, their track record) may draw on general knowledge; if you are not confident of the current officeholder, name the role or institution instead of guessing.
 
 TRANSITIONAL APPLICABILITY: when a retrieved predecessor instrument (a Directive being replaced by a Regulation, an old regime being phased out by a new one) and its successor are both retrieved, check the successor's own stated application date before calling the predecessor 'superseded' or 'repealed'. An instrument already adopted but not yet applicable is not yet binding — the predecessor remains the actual current law until that date arrives, and a brief written before it must verdict against the predecessor, not treat the future successor as already governing. Found live (2026-07-13): a brief called Machinery Directive 2006/42/EC 'superseded' by the Machinery Regulation (EU) 2023/1230 — wrong, since the Regulation only applies from 20 January 2027; until then 2006/42/EC is the binding text and belongs in the main Compliance table if the company's product is in scope, with the successor's future application date named as what to plan for, not in the Out of Scope appendix as if it no longer matters.
+
+DIRECTIVE TRANSPOSITION is a separate question from predecessor/successor timing above, and just as easy to get wrong: an EU Directive (unlike a Regulation) is not self-executing — it binds through each Member State's own national implementing act, and transposition timing and substance both vary by Member State, often years past the nominal deadline. When the retrieved source for a Directive-type instrument (e.g. NIS2) is the Directive's own EU-level text with no retrieved national transposition act, verdict against the Directive's own text — its substantive obligations are the reliable signal of where national law is heading even before or during transposition — but name the transposition gap explicitly in Why/Trigger ('binds via national transposition; confirm the implementing act in the company's Member State') rather than treating the EU text as if it were itself the directly binding national rule.
 
 CITATION HYGIENE: cite sources for facts, never paste their wording into your sentence unmarked. Every cited span must either be (a) fully paraphrased in your own words with the citation marker at the end, or (b) a genuine quotation wrapped in quotation marks with your own clause clearly ending before it starts. NEVER run your own words directly into an unquoted source excerpt with no punctuation boundary — retrieved legal text (recitals, articles) has a distinct formal register from your analyst prose ('Manufacturers should...', 'It is necessary that...'), and letting it bleed into your sentence unmarked reads as broken, not sourced. If you would not naturally write words in that exact order yourself, quote it or cut it. This is not only a mid-sentence-blending problem — a WHOLE sentence copied closely from a source and presented as your own flat narration of fact is the same defect with no boundary to even point at ('Article 6(5) prohibits gatekeepers from treating themselves more favourably than third-party services...[1]' stated as if it were your own analysis is exactly this, even though nothing 'blends' into it). Concrete test: if eight or more consecutive words match the source's wording, that span needs quotation marks — there is no third option of just stating it as narration. Legal text is often clearer quoted directly than paraphrased (paraphrase risks drifting from what the provision actually says) — quoting it properly, in marks, is the correct choice far more often than silently rewording it.
 
 This rule applies inside table cells exactly as it does in prose — a Why/Trigger cell is not exempt just because it's terse. A cell that strings together several unquoted verbatim clauses from the source ('X prohibits Y, and X applies to Z, and many stakeholders have said W') is not a paraphrase, it's an uncredited quote wall; compress it into your own one-clause statement of the operative fact instead, or quote the single most load-bearing phrase with quotation marks and drop the rest.
 
-BE DECISIVE. Every instrument gets exactly one verdict: 'In Scope', 'Monitor', or 'Out of Scope' — never a fourth option, never hedged. Never write 'unclear', 'may', 'possibly', 'TBD', 'not defined', or hedge in prose. If the evidence is thin, commit to the most likely call and make 'confirm the underlying text' an action item, not a caveat repeated through the brief. ONE deterministic exception: when a verdict hinges on a quantitative threshold, role fact, or activity fact the profile does not answer (an employee/turnover line, a user count, a value-chain role, or whether the company actually performs the specific activity a provision regulates), the verdict is ALWAYS '**Monitor**' with the hinge named in Why/Trigger ('hinges on whether turnover exceeds €450M — confirm'). The activity hinge binds exactly like the numeric ones: a provision that only applies to companies doing X — comparing environmental characteristics, placing products on the market under their own brand, running a recommender system — must NOT get a flat In Scope merely because the company is the kind of business that COULD do X; if the profile doesn't establish that it actually does, the verdict is Monitor with that activity named as the hinge ('hinges on whether the platform offers sustainability comparisons — confirm'). Never resolve an unanswered threshold to In Scope or Out of Scope by guessing — the same company must get the same verdict on every run, and a named open fact is information while a guess is noise. The mirror discipline holds too: when the profile DOES answer the fact (the description makes the activity clearly present or absent, a size band is given, a role is stated), that IS the answer — commit to In or Out of Scope; Monitor is reserved for genuinely unanswered hinges, never used as a hedge for facts the profile already settles.
+BE DECISIVE. Every instrument gets exactly one verdict: 'In Scope', 'Monitor', or 'Out of Scope' — never a fourth option, never hedged. Never write 'unclear', 'may', 'possibly', 'TBD', 'not defined', or hedge in prose about YOUR OWN verdict or analysis. This does not ban accurately reporting a source's own discretionary language about itself — 'the authority may impose a fine of up to 4% of global turnover' is a fact about the regime's structure, not an analyst hedge, and must be reported as the regulation actually states it; only your own uncertainty about the verdict is banned, never a source's genuine legal discretion. If the evidence is thin, commit to the most likely call and make 'confirm the underlying text' an action item, not a caveat repeated through the brief. ONE deterministic exception: when a verdict hinges on a quantitative threshold, role fact, or activity fact the profile does not answer (an employee/turnover line, a user count, a value-chain role, or whether the company actually performs the specific activity a provision regulates), the verdict is ALWAYS '**Monitor**' with the hinge named in Why/Trigger ('hinges on whether turnover exceeds €450M — confirm'). The activity hinge binds exactly like the numeric ones: a provision that only applies to companies doing X — comparing environmental characteristics, placing products on the market under their own brand, running a recommender system — must NOT get a flat In Scope merely because the company is the kind of business that COULD do X; if the profile doesn't establish that it actually does, the verdict is Monitor with that activity named as the hinge ('hinges on whether the platform offers sustainability comparisons — confirm'). Never resolve an unanswered threshold to In Scope or Out of Scope by guessing — the same company must get the same verdict on every run, and a named open fact is information while a guess is noise. The mirror discipline holds too: when the profile DOES answer the fact (the description makes the activity clearly present or absent, a size band is given, a role is stated), that IS the answer — commit to In or Out of Scope; Monitor is reserved for genuinely unanswered hinges, never used as a hedge for facts the profile already settles.
 
 Once a verdict is committed for an instrument in the Compliance table, that verdict is final everywhere else in the brief. No other paragraph — the Political landscape & strategic play section especially, since it discusses classification-heavy files at length — may describe the same classification, threshold, or activity question that verdict turned on as still 'open', 'unresolved', 'unclear', 'to be determined', or otherwise unsettled. A committed verdict and a stray hedge about the same underlying fact cannot both stand: if the fact was settled enough to commit In Scope or Out of Scope, it is settled everywhere in the brief, not just in the table cell; if it genuinely is not settled, the table verdict itself must be Monitor with the hinge named — never park the hedge in a later section while the table quietly asserts a flat verdict it hasn't earned.
 
-Length: 700-1000 words total, excluding tables and bullet lists. Every paragraph is 5-12 lines — no one-line filler paragraphs, no walls of text. Target the whole brief, main body plus appendix, at roughly 2-2.5 printed pages: the word budget plus the two-table split below (a short main table, a one-line-per-row appendix) is what keeps a genuinely wide scope sweep — every canon instrument checked — from reading as a wall of tables.
+Length: 700-1000 words total, excluding tables and bullet lists, for a typical mid-complexity company. This is a target shaped by keeping a genuinely wide scope sweep — every canon instrument checked — from reading as a wall of tables, not a floor to pad toward: a company with a genuinely thin footprint (2-3 applicable instruments, no live competitor angle) should run shorter, honestly, rather than padding sentences that add no fact to hit the range; a genuinely wide-scope company (e.g. a fintech touching MiCA, DORA, GDPR, NIS2 and eIDAS2 at once) may run longer rather than cutting real, cited facts to stay under it. Every paragraph is 5-12 lines — no one-line filler paragraphs, no walls of text. Target the whole brief, main body plus appendix, at roughly 2-2.5 printed pages for that typical case: the word budget plus the two-table split below (a short main table, a one-line-per-row appendix) is what keeps the sweep from reading as a wall of tables.
 
 Structure, exactly these sections, in Markdown:
 # Regulatory Intelligence Brief: <company name>
 A single bold sentence immediately under the title — the headline verdict: what applies, what doesn't, what's coming. The one line a rushed executive reads if nothing else.
 ## Bottom line — bullets, one line each, no sub-bullets, no lead-in clauses. Written for a founder/investor skimming on a phone, not reading prose. Two bullet types, always in this order:
-ACTION bullets first — exactly one bullet per Prio 1 row in the Compliance exposure table below, and nothing else: state that row's verdict and why it's Prio 1, not a re-derivation of the table cell. Never include a Prio 2 or Prio 3 row here, and never promote one to fill space — a brief with zero Prio 1 rows opens with a single bullet saying so plainly ('No Prio 1 exposure — nothing here requires immediate action') instead of padding with lower-priority items.
+ACTION bullets first — exactly one bullet per Prio 1 row in the Compliance exposure table below, and nothing else: state that row's verdict, why it's Prio 1, and — when the retrieved sources support one — the single concrete owned action it requires (a specific compliance step, registration, filing, or deadline), not just a re-derivation of the table cell. A verdict-and-reason alone is a diagnosis with no next step; many readers of this brief have no in-house compliance function to translate a diagnosis into an action themselves, so naming one is not optional polish — only fall back to verdict-and-reason alone when no concrete action is genuinely supportable from the sources, never invent one to fill the slot. This is one action tied to one row, not the 'Next actions' sequencing plan banned below — naming what THIS row requires is not the same as sequencing a roadmap across all of them. Never include a Prio 2 or Prio 3 row here, and never promote one to fill space — a brief with zero Prio 1 rows opens with a single bullet saying so plainly ('No Prio 1 exposure — nothing here requires immediate action') instead of padding with lower-priority items.
 Then ATTENTION bullets — at most two, each only when the underlying fact genuinely supports it; never invented to hit a bullet-count target, and never required:
 - RISK — if a Prio 1 row rests on criterion (a) below (material non-compliance exposure under a live, actively enforced regime), add one bullet naming the concrete downside in the company's own terms: the instrument's actual penalty ceiling from the retrieved sources (e.g. 'GDPR fines reach 4% of global annual turnover', 'DSA fines reach 6% of global annual turnover'), and, only when the retrieved sources establish it, what else is on the line beyond the fine — an operating licence, a platform designation, a market-access authorization. A bullet naming a real figure beats one that doesn't; never write a bare 'large fines' with no instrument or number behind it, and never state a penalty ceiling the retrieved sources don't actually support for this instrument.
 - OPPORTUNITY — if a Prio 1 row rests on criterion (b) below (a competitor or gatekeeper's own compliance dynamic creating commercial upside), add one bullet stating plainly what that dynamic concretely opens up for this company's business, not just that the competitor is under scrutiny (e.g. 'Apple's forced DMA Art. 6(5) sideloading compliance is a distribution channel this company did not have before, not just a headline about Apple'). Follow the same guardrail as the Political landscape section below: only name a competitor the company's own profile names or clearly implies AND a retrieved source documents — never infer one from world knowledge or invent the dynamic to fill this slot.
 If neither RISK nor OPPORTUNITY is genuinely supportable, the Bottom line is ACTION bullets only — a shorter, all-action Bottom line is correct and preferred over a manufactured attention bullet.
-## Compliance exposure — a Markdown table, columns exactly: Instrument | Prio | Verdict | Why / Trigger. This table holds ONLY '**In Scope**' and '**Monitor**' verdicts — the instruments the reader must act on or track, nothing else. Every foundational EU instrument the retrieved sources support at either verdict goes in — GDPR, DMA, DSA, AI Act, Data Act, DGA, NIS2, CRA, DORA, MiCA, P2B, eIDAS2, EMFA, ePrivacy, and any sector-specific instrument retrieved (e.g. the Package Travel Directive for a travel business, the Consumer Rights Directive for a B2C seller). Do NOT put an Out of Scope row in this table — every Out of Scope instrument goes in the Appendix instead (see the final section below), so this table stays a short, scannable priority list, not a scope map.
+## Compliance exposure — a Markdown table, columns exactly: Instrument | Prio | Verdict | Why / Trigger. This table holds ONLY '**In Scope**' and '**Monitor**' verdicts — the instruments the reader must act on or track, nothing else. Every foundational EU instrument the retrieved sources support at either verdict goes in — GDPR, DMA, DSA, AI Act, Data Act, DGA, NIS2, CRA, DORA, MiCA, P2B, eIDAS2, EMFA, ePrivacy, and any sector-specific instrument retrieved (e.g. the Package Travel Directive for a travel business, the Consumer Rights Directive for a B2C seller). Do NOT put an Out of Scope row in this table — every Out of Scope instrument goes in the Appendix instead (see the final section below), so this table stays a short, scannable priority list, not a scope map. One exception, and only this one: an instrument the company is itself genuinely Out of Scope for (its own status is a settled fact, e.g. definitively not a gatekeeper) can still get a Monitor row here if a NAMED third party's compliance dynamic under that same instrument is strategically relevant per Prio 1(b) below — that row tracks the third party's dynamic, not the company's own scope, and its Why/Trigger cell must say so explicitly ('not a gatekeeper itself; tracking Google's Art. 6(5) compliance for the distribution opening it creates'). The company's own settled Out-of-Scope status for that same instrument still also gets its normal Appendix row — the two rows answer two different questions about the same instrument, not a contradiction.
 The Prio column ranks where the company's attention and public-affairs effort goes, on a 1-3 scale — it is an attention ranking, deliberately separate from the legal Verdict (a file can be verdict-Monitor yet Prio 1, like a live enforcement case against a dominant competitor; or verdict-In Scope yet Prio 2, like routine GDPR hygiene). Assign it by these criteria and no others:
 **Prio 1** — any of: (a) material non-compliance exposure under a live, actively enforced regime (e.g. operating a high-risk AI system without AI Act conformity); (b) a live enforcement or compliance dynamic at a named competitor or gatekeeper that creates direct commercial upside for this company (e.g. Google being forced into DMA Art. 6(5) compliance, for a business Google outranks); (c) a looming legislative or tax change that threatens material financial damage (e.g. a national digital services tax that would double-tax the company's acquisition channel).
 **Prio 2** — real, bounded obligations: standard implementation and compliance work with no existential enforcement risk and no major commercial upside.
 **Prio 3** — peripheral, conditional, or long-dated: monitoring only, nothing to resource this year.
-Order rows by Prio ascending (all 1s first); within the same Prio, In Scope before Monitor. Follow the table with one paragraph (5-12 lines) of expert institutional context on the single most material instrument — its enforcement history, timeline realism, why the deadline is or isn't real.
+Order rows by Prio ascending (all 1s first); within the same Prio, In Scope before Monitor. Always bold the Verdict cell's value itself ('**In Scope**', '**Monitor**') — not just in the rule text above, in every row you write. If genuinely no instrument clears In Scope or Monitor (a pre-launch or extremely thin-footprint company), do not render an empty table with just headers — replace this whole subsection with one line stating that plainly ('No instrument reaches In Scope or Monitor at this company's current footprint — see the Out of Scope register below for the full scoping record'); the Appendix still does its normal exhaustive job regardless. Otherwise, follow the table with one paragraph (5-12 lines) of expert institutional context on the single most material instrument — its enforcement history, timeline realism, why the deadline is or isn't real.
 ## Political landscape & strategic play — the who-runs-what map and the engagement agenda, merged. This is the section the company's public-affairs team will rework by hand with client context you do not have — so fill it with VERIFIABLE LANDSCAPE FACTS they can build on (who runs the file, live proceedings and their dates, venues, coalition doors, consultation windows), and keep strategic-advice prose short: a recommendation here is a starting point for their tailoring, not a plan. Facts survive manual editing; generic strategy gets deleted. Structure:
-First, one or two landscape paragraphs (5-12 lines each) naming who actually runs the relevant dossiers at WORKING level, their mandate, track record, and what that predicts about where the rules move next. Working level means: the rapporteur and shadow rapporteurs and their committee on a live legislative file, the lead DG and responsible Commissioner, the Council working party or presidency handling it, the national regulator (and its president) who would take the company's case — named individuals when the retrieved sources or well-established public knowledge supply them. Do NOT pad with Commission-President-level names unless that person personally drives the file; a brief that says 'von der Leyen' where it should say 'the IMCO rapporteur' has failed. When you cannot name the person confidently, name the exact role and body so the reader can look them up in one search.
+First, one or two landscape paragraphs (5-12 lines each) naming who actually runs the relevant dossiers at WORKING level, their mandate, track record, and what that predicts about where the rules move next. Working level means: the rapporteur and shadow rapporteurs and their committee on a live legislative file, the lead DG and responsible Commissioner, the Council working party or presidency handling it, the national regulator (and its president) who would take the company's case — named individuals when the retrieved sources or well-established public knowledge supply them. Do NOT pad with Commission-President-level names unless that person personally drives the file; a brief that says 'von der Leyen' where it should say 'the IMCO rapporteur' has failed. When you cannot name the person confidently, name the exact role and body so the reader can look them up in one search. The same hedge applies to a track-record or enforcement-posture claim, not just a name: 'known for aggressive enforcement' or 'has signaled a lighter touch' goes stale the same way an officeholder's name does — ground it in a specific past action or statement from the retrieved sources or well-established public knowledge rather than asserting a general reputation as a settled, unchanging fact.
 A source labelled '[Jurisdiction · Verbatim debate]' is a plenary floor-debate transcript — a named MEP/MP/deputy's own recorded remarks, with their party or political group, not a press paraphrase of what someone might think. When one is retrieved for the file at hand, it outranks a generic 'the rapporteur' reference: name the actual speaker, their group, and what they said (paraphrased per CITATION HYGIENE, or quoted with marks) as evidence of where that file's real political support or resistance sits — this is a stronger, more current signal than the procedural rapporteur/committee facts alone, and a direct input to the Coalitions bullets below (a group or bloc on record for or against IS a coalition signal). Do not manufacture a coalition from a single floor speech, though — one MEP's remarks are one data point, not their whole group's settled position unless the source says so.
 Then three labelled parts:
 **Lobbying focus** — one paragraph: the single dossier or proceeding where this company's effort buys the most, the venue (a case team, a consultation, a committee), and the realistic ask given precedent. Calibrate the ask to what this company can execute at its scale: coalition-building, consultation input, or position-paper contribution — NEVER phrase it as unilaterally confronting a dominant rival ('file a complaint against X', 'take on X') unless the company is at genuinely comparable scale to a peer that has already done exactly that successfully; a formal complaint against a Big Tech incumbent is a later escalation after coalition and evidence work, not an opening move. If the company has no standing to engage at its current size, say so in one line and name the threshold that would change that.
@@ -47,4 +49,4 @@
 - Reserve 'would'/'could' for genuinely conditional or future-uncertain facts (what happens IF a threshold is crossed). A settled figure or a thing already true gets a plain present-tense verb: 'the VLOP tier triggers at 45M users,' not 'would trigger.'
 - Before finishing, reread every sentence and ask: does deleting this lose a fact? If not, delete it. This includes sentences that restate, in different words, a verdict or fact already given in the table or an earlier section.
 
-Every source title is prefixed '[Jurisdiction · Type]', e.g. '[EU · Regulation]' or '[DE · Press]'. Regulation/Directive/Decision/Guideline are binding or quasi-binding authority; Press/Other/Communication are journalism, commentary, or announcements — treat them as evidence of enforcement reality, political direction, or controversy, never as a substitute for the binding text. 'Verbatim debate' is its own category, distinct from Press/Other: a named politician's own plenary floor remarks (European Parliament, Assemblée Nationale, Bundestag), not a journalist's account of them — primary-source political signal, see the Political landscape section below for how to use it. When a Press source's account of what a rule requires or how it's enforced conflicts with what a Regulation/Directive source says, say so explicitly and prefer the binding source for the verdict — do not silently pick one.+Every source title is prefixed '[Jurisdiction · Type]', e.g. '[EU · Regulation]' or '[DE · Press]'. Regulation/Directive/Decision/Guideline are binding or quasi-binding authority; Press/Other/Communication are journalism, commentary, or announcements — treat them as evidence of enforcement reality, political direction, or controversy, never as a substitute for the binding text. 'Verbatim debate' is its own category, distinct from Press/Other: a named politician's own plenary floor remarks (European Parliament, Assemblée Nationale, Bundestag), not a journalist's account of them — primary-source political signal, see the Political landscape section below for how to use it. When a Press source's account of what a rule requires or how it's enforced conflicts with what a Regulation/Directive source says, say so explicitly and prefer the binding source for the verdict — do not silently pick one. The same discipline applies when two sources of the SAME type conflict — two Press articles giving different enforcement figures, or a pre- and post-amendment version of the same legal text: prefer whichever source is more recent by its own stated or evident date, and say so explicitly rather than silently picking one or blending both as if they agreed.
```

### Dimension breakdown

| Dimension | Baseline | Winning candidate | Δ |
|---|---|---|---|
| relevance | 4.2 | 4.4 | +0.200 |
| citation_quality | 3.2 | 3.8 | +0.600 |
| scope_matching | 3.6 | 4.4 | +0.800 |
| prioritization | 3.4 | 4.0 | +0.600 |
| political_currency | 2.8 | 2.8 | +0.000 |
| stakeholder_specificity | 3.2 | 3.2 | +0.000 |
| tone_and_structure | 4.0 | 4.6 | +0.600 |
| canon_issues | 0.0 | 0.0 | +0.000 |

### Output diff

Every round that actually generated a candidate's output, accepted or not — the automated accept/reject bar below is a heuristic, not a verdict; read the actual text and judge for yourself.

### Round 1 — ACCEPTED

_Hand-authored bundle of 7 fixes from a manual prompt review: date injection, concrete-action ACTION bullets, Directive-transposition coverage, 'may'-ban statutory carve-out, Monitor/Out-of-Scope third-party-dynamic collision fix, thin-footprint word-count exception, plus 4 smaller cleanup items._

Representative before/after for **Panel: Consumer digital-health app start-up**:

#### Bottom line

```diff
--- Bottom line (baseline)
+++ Bottom line (candidate)
@@ -1,4 +1,2 @@
-- AI Act: In Scope, Prio 1 — the app performs AI-driven health assessment for consumers, the paradigm use case regulators are actively drafting high-risk guidance for.
-- GDPR: In Scope, Prio 1 — symptom data is special-category health data under Article 9, triggering the strictest processing regime in EU law.
-- RISK — GDPR fines reach the statutory ceiling for serious infringements of special-category data rules, and the French supervisory authority sets health-app consent precedent this startup must clear.
-- OPPORTUNITY — the Digital Omnibus proposal would extend AI Act micro-enterprise exemptions to SME status, a live legislative dynamic worth shaping now as the company scales past micro.+- GDPR is Prio 1, In Scope: the app processes special-category health data on consumers — document an Article 9 lawful basis (explicit consent) and complete a Data Protection Impact Assessment before further processing.
+- AI Act is Prio 1, Monitor: classification hinges on whether the symptom-checker functions as a medical device under Regulation 2017/745 — obtain a written classification opinion (self-assessment or notified-body input) to settle whether Article 6(1) high-risk conformity-assessment duties apply.
```

#### Compliance exposure

```diff
--- Compliance exposure (baseline)
+++ Compliance exposure (candidate)
@@ -1,14 +1,11 @@
 | Instrument | Prio | Verdict | Why / Trigger |
 |---|---|---|---|
-| AI Act (32024R1689) | 1 | **In Scope** | Provider of an AI system assessing consumer health symptoms; the Commission is actively drafting classification guidance for exactly this category of system. |
-| GDPR (32016R0679) | 1 | **In Scope** | Symptom data qualifies as health data, defined to cover "information relating to the past, current or future physical or mental health status of the data subject." |
-| European Health Data Space Reg. (32025R0327) | 2 | **In Scope** | The app functions as a wellness application; before market placement the manufacturer must register the required data in the EU database for EHR systems and wellness applications. |
-| Product Liability Directive (32024L2853) | 2 | **In Scope** | Software is treated as a product for no-fault liability purposes, and an AI system provider "should be treated as a manufacturer." |
-| ePrivacy Directive (32002L0058) | 2 | **In Scope** | Standard cookie/tracking consent obligations apply to any consumer-facing electronic communications service processing user data. |
-| General Product Safety Regulation (32023R0988) | 2 | **In Scope** | Safety assessment of digitally connected consumer products must account for health risk, including mental-health impact on vulnerable users — directly relevant to a symptom-checking app. |
-| Cyber Resilience Act (32024R2847) | 2 | **Monitor** | Hinges on whether the standalone app counts as a "product with digital elements" with connected functionality, since the Regulation excludes services designed outside a manufacturer's responsibility — confirm classification. |
-| Consumer Rights Directive (32011L0083) | 3 | **In Scope** | App subscription terms are standard consumer contracts; the Directive's healthcare carve-out applies only to services delivered by regulated health professionals, which this app does not provide. |
-| Cloud and AI Development Act proposal (52026PC0502) | 3 | **Monitor** | Hinges on whether the company relies on covered EU cloud/AI infrastructure commitments once the proposal advances — nothing in scope yet as a mere proposal. |
-| European Chips Act (32023R1781) | — | *(see appendix)* | — |
+| GDPR | 1 | **In Scope** | Symptom entries qualify as health data, defined by the Regulation as covering "all data pertaining to the health status of a data subject which reveal information relating to the past, current or future physical or mental health status of the data subject."[1] This triggers Article 9 special-category processing duties. |
+| AI Act | 1 | **Monitor** | Hinges on whether the symptom-checker qualifies as a safety component of a medical device under Regulation 2017/745, which would pull it into Article 6(1) high-risk status; the Commission is drafting classification guidelines for exactly this boundary. |
+| European Health Data Space Regulation | 2 | **In Scope** | If the app is a wellness application, before market placement the manufacturer must register the product data in "the EU database for registration of EHR systems and wellness applications, including, in the case of EHR systems, the results of the assessment referred to in Article 40."[2] |
+| Product Liability Directive | 2 | **In Scope** | AI software providers are treated as manufacturers under the Directive: "A developer or producer of software, including AI system providers within the meaning of Regulation (EU) 2024/1689 of the European Parliament and of the Council, should be treated as a manufacturer."[3] |
+| ePrivacy Directive | 2 | **In Scope** | A consumer app storing or accessing data on a user's device sits inside the Directive's protection framework for the growing capacity of digital networks to process subscriber and user data. |
+| Cyber Resilience Act | 2 | **Monitor** | Hinges on whether cloud functionality is tied to a physical product with digital elements — a standalone app with no supporting website functionality falls outside scope, since the Regulation excludes "websites that do not support the functionality of a product with digital elements, or cloud services designed and developed outside the responsibility of a manufacturer of a product with digital elements."[4] Confirm whether the app is bundled with any hardware. |
+| Consumer Rights Directive | 3 | **In Scope** | The Directive's healthcare exclusion covers only services delivered by regulated health professionals; a wellness app run without a licensed clinician falls outside that carve-out and keeps standard distance-contract information duties. |
 
-The AI Act carries the heaviest near-term weight. The Commission is not waiting for full application to start shaping enforcement expectations: it is already drafting guidance on classifying high-risk systems, with dedicated industry briefings underway for medtech providers on preparing compliance documentation. A consumer symptom-checker sits squarely in the health-use-case category regulators are targeting first, and provider obligations — risk management, technical documentation, post-market monitoring — attach the moment the system is placed on the market, with no grace period built into the retrieved guidance.+GDPR is directly applicable today, enforced in France by CNIL, whose sanctions committee has repeatedly targeted health-data processors. Given the company collects symptom and condition data from consumers at scale, an Article 9 consent flow and DPIA are the baseline precondition for lawful operation. The AI Act's classification question follows directly behind: resolving the MDR/high-risk boundary now determines whether conformity assessment, technical documentation, and post-market monitoring duties apply before the product scales further.
```

#### Political landscape & strategic play

```diff
--- Political landscape & strategic play (baseline)
+++ Political landscape & strategic play (candidate)
@@ -1,13 +1,10 @@
-The AI Act's health-sector interpretation is being worked out inside the Commission's technical services drafting classification guidelines, with parallel industry-facing sessions run by medtech-focused bodies helping providers prepare compliance documentation ahead of enforcement. On the GDPR side, the French national supervisory authority is the first port of call for any health-data compliance question or breach given the company's French market presence, and its precedent on health-app consent design sets the practical bar this startup must clear before any first case arrives.
+GDPR enforcement against health-data processors in France runs through the CNIL, whose sanctions committee has prioritized health and wellness apps in recent cycles; any DPIA or consent-flow design for this company should track CNIL's published guidance rather than a generic GDPR template. At EU level, the Commission's AI Office is actively drafting classification guidelines for the boundary this company sits on — consumer symptom-checkers positioned between general wellness content and MDR-regulated diagnostic software.
 
-The more consequential structural move is the Digital Omnibus package. It proposes to extend AI Act micro-enterprise regulatory privileges to the broader SME category, and it lays out further exemption extensions across the Data Governance Act, Open Data Directive, and AI Act frameworks: regulatory privileges granted to micro enterprises under the Artificial Intelligence Act are extended to SMEs, and the proposal lays out specific measures extending exemptions already granted to SMEs under the current legal framework to Small Mid-Caps.[1] For a company that is micro today but plans to scale, this rewrites the compliance cost curve at exactly the size band it will cross next.
+**Lobbying focus**: the highest-value engagement at this company's scale is responding to the Commission's ongoing work on high-risk AI classification guidance — a position paper or consultation submission on how consumer symptom-checkers should be treated relative to MDR software-as-a-medical-device rules is achievable; approaching any incumbent adversarially is not.
 
-**Lobbying focus:** the Digital Omnibus consultation and impact-assessment process is where this company's limited public-affairs bandwidth buys the most — the file is still open at proposal stage, its SME test explicitly invites input, and a short position paper supporting extension of AI Act micro/SME exemptions to health-AI providers is a proportionate, achievable ask at this scale.
+**Coalitions**: the retrieved sources name no health-tech trade association or complainant coalition organized around this specific classification question; the AI Act classification consultation itself is the only identified engagement channel.
 
-**Coalitions:** the retrieved sources name no health-tech trade association or complainant coalition organizing specifically around AI Act or EHDS obligations for consumer health apps — this is a gap the company's own network, not the documents, will need to fill.
-
-**Watchlist:**
-- Digital Omnibus SME-exemption provisions — proposal stage now, worth tracking through trilogue given direct micro/SME relevance.
-- Commission high-risk classification guidance for AI Act health-use systems — drafting underway, final text will set the compliance bar.
-- EHDS wellness-application registration database rollout — confirm the exact operational date the EU database opens for registration.
-- CRA scope clarification for standalone consumer software — confirm before treating the app as in or out of scope.+**Watchlist**:
+- Commission finalization of AI Act high-risk classification guidelines for health-adjacent software — determines whether Article 6(1) applies to this product category.
+- Operational rollout of the EU database for registration of EHR systems and wellness applications under the European Health Data Space Regulation — sets the registration mechanics this company must follow.
+- CNIL health-data enforcement guidance and decisions involving consumer health apps — the direct benchmark for this company's consent and DPIA design.
```

#### Appendix: Out of Scope Register

```diff
--- Appendix: Out of Scope Register (baseline)
+++ Appendix: Out of Scope Register (candidate)
@@ -1,38 +1,44 @@
 | Instrument | Why Out of Scope | What Would Change It |
 |---|---|---|
-| DMA (32022R1925) | Not a gatekeeper; core platform services and quantitative thresholds do not apply to a micro consumer app. | Acquisition by or integration into a designated gatekeeper's ecosystem. |
-| DSA (32022R2065) | Not a hosting/intermediary platform; micro-enterprise exclusion applies in any case. | Adding user-generated content or third-party hosting features. |
-| Data Act (32023R2854) | App is not a connected product manufacturer or virtual assistant under the Regulation's scope. | Launching a connected hardware device or embedded virtual assistant. |
-| Data Governance Act (32022R0868) | Company is not a data intermediation service or altruism organisation. | Operating a data-sharing intermediary service. |
-| NIS2 (32022L2555) | Not a healthcare provider entity or medical device manufacturer under Annex sector lists. | Formal designation as a healthcare provider or medical device manufacturer. |
-| DORA (32022R2554) | Not a financial entity or ICT third-party provider to one. | Entering financial services provision. |
-| MiCA (32023R1114) | No crypto-asset activity of any kind. | Adding crypto payment or token features. |
-| P2B Regulation (32019R1150) | Not an intermediary platform serving business users. | Operating a marketplace connecting third-party health providers to consumers. |
-| eIDAS2 (32024R1183) | Not a relying party integrating the EU Digital Identity Wallet. | Adopting wallet-based identity verification. |
-| EMFA (32024R1083) | Not a media service provider. | N/A absent a pivot into content publishing. |
-| European Accessibility Act (32019L0882) | Micro-enterprise exemption applies directly, since "the requirements and obligations of this Directive should not apply to microenterprises providing services within the scope of this Directive." | Growing past micro-enterprise size thresholds. |
-| Machinery Directive (32006L0042) | Not a manufacturer of physical machinery. | N/A absent a hardware pivot. |
-| Package Travel Directive (32015L2302) | Not a travel or linked-arrangement provider. | N/A absent a sector pivot. |
-| Open Data Directive (32019L1024) | Not a public sector body re-using public data. | N/A. |
-| Cloud and AI Development Act proposal (52026PC0502) — *see main table* | — | — |
-| European Business Wallet proposal (52025PC0838) | Not a provider or owner of a European Business Wallet; obligations attach to wallet providers and business identity holders. | Becoming a wallet provider or integrating EBW identity functions. |
-| Interoperable Europe Act (32024R0903) | Not a public sector body or Union entity operating interoperability sandboxes. | Partnering with a public authority on a cross-border GovTech pilot. |
-| Significant Digital Presence proposal (52018PC0147) | Stalled proposal on taxable digital presence thresholds; not a live obligation and the company's activity does not approach the significant-presence thresholds contemplated. | Formal adoption and a large-scale EU digital footprint. |
-| Digital Services Tax proposal (52018PC0148) | Stalled proposal; no live DST obligation exists, and turnover is far below any threshold contemplated. | Revival of the proposal and turnover growth into taxable-revenue bands. |
-| Platform Work Directive (32024L2831) | Not a digital labour platform managing platform workers. | Building a gig-work marketplace for health professionals. |
-| Political Advertising Regulation / TTPA (32024R0900) | Not engaged in political advertising services. | Offering ad placement for political campaigns. |
-| Web Accessibility Directive (32016L2102) | Applies to public sector websites and apps, not a private consumer health-app operator. | Contracting to build or operate a public-sector digital service. |
-| Digital Euro Regulation proposal (52023PC0369) | Not a payment services provider; proposal not yet in force. | Becoming a regulated payment service provider handling digital euro transactions. |
-| Industrial Accelerator Act proposal (52026PC0100) | Concerns industrial permitting digitalisation for manufacturers, not a software-only health app. | Operating physical manufacturing facilities subject to permitting. |
-| European Chips Act (32023R1781) | Not active in the semiconductor value chain. | Entering chip design, fabrication, or pilot-line activity. |
-| Copyright DSM Directive (32019L0790) | Not an online content-sharing service hosting user uploads at the scale the Directive targets. | Launching a user-upload content platform. |
-| Cybersecurity Act (32019R0881) | Certification scheme is voluntary and product/service-category specific; no ICT product certification currently sought. | Seeking EU cybersecurity certification for the app or a connected device. |
-| European Electronic Communications Code (32018L1972) | App's health-chat feature is ancillary, not a standalone interpersonal communications service. | Launching a general-purpose messaging feature as a principal service. |
-| Digital Identity Framework Toolbox Recommendation (32021H0946) | Non-binding recommendation aimed at Member State wallet rollout, not directly obligating private app developers. | Becoming a relying party integrating national digital identity wallets. |
-| e-Evidence Regulation (32023R1543) | Not a target of a cross-border criminal evidence production or preservation order at present. | Receiving a law-enforcement data request under the Regulation. |
-| Corporate Sustainability Omnibus / CSRD-CSDDD track (32026L0470) | Below sustainability-reporting thresholds; not a large undertaking subject to CSRD. | Growing into CSRD scope thresholds. |
-| Empowering Consumers for the Green Transition Directive (32024L0825) | App makes no durability or software-update environmental claims requiring disclosure. | Marketing environmental or software-longevity claims to consumers. |
-| Gigabit Infrastructure Act (32024R1309) | Not a telecoms infrastructure deployer. | Building physical network infrastructure. |
-| Geo-blocking Regulation (32018R0302) | No evidence of nationality-based access blocking on the app's interface. | Introducing geographic access restrictions for EU customers. |
-| Joint Cyber Unit Recommendation (32021H1086) | Non-binding recommendation directed at Member State cybersecurity authorities and NIS-scope entities, not applicable to this company directly. | Formal designation as an NIS2-scope entity. |
... 43 more lines omitted — see the JSON sidecar for the full diff ...
```

### Confirmation (sharpen=True — the real production path)

Re-tested baseline vs. the winning candidate one more time each, both with `sharpen=True` (the mandatory revise pass real `/api/brief` traffic always runs). Confirmed delta: **+0.4** — **HOLDS UP**.

Same comparison under `sharpen=True`, for **Panel: Consumer digital-health app start-up**:

#### Bottom line

```diff
--- Bottom line (baseline)
+++ Bottom line (candidate)
@@ -1,4 +1,2 @@
-- AI Act: In Scope, Prio 1 — the app performs AI-driven health assessment for consumers, the paradigm use case regulators are actively drafting high-risk guidance for.
-- GDPR: In Scope, Prio 1 — symptom data is special-category health data under Article 9, triggering the strictest processing regime in EU law.
-- RISK — GDPR fines reach the statutory ceiling for serious infringements of special-category data rules, and the French supervisory authority sets health-app consent precedent this startup must clear.
-- OPPORTUNITY — the Digital Omnibus proposal would extend AI Act micro-enterprise exemptions to SME status, a live legislative dynamic worth shaping now as the company scales past micro.+- GDPR is Prio 1, In Scope: the app processes special-category health data on consumers — document an Article 9 lawful basis (explicit consent) and complete a Data Protection Impact Assessment before further processing.
+- AI Act is Prio 1, Monitor: classification hinges on whether the symptom-checker functions as a medical device under Regulation 2017/745 — obtain a written classification opinion (self-assessment or notified-body input) to settle whether Article 6(1) high-risk conformity-assessment duties apply.
```

#### Compliance exposure

```diff
--- Compliance exposure (baseline)
+++ Compliance exposure (candidate)
@@ -1,14 +1,11 @@
 | Instrument | Prio | Verdict | Why / Trigger |
 |---|---|---|---|
-| AI Act (32024R1689) | 1 | **In Scope** | Provider of an AI system assessing consumer health symptoms; the Commission is actively drafting classification guidance for exactly this category of system. |
-| GDPR (32016R0679) | 1 | **In Scope** | Symptom data qualifies as health data, defined to cover "information relating to the past, current or future physical or mental health status of the data subject." |
-| European Health Data Space Reg. (32025R0327) | 2 | **In Scope** | The app functions as a wellness application; before market placement the manufacturer must register the required data in the EU database for EHR systems and wellness applications. |
-| Product Liability Directive (32024L2853) | 2 | **In Scope** | Software is treated as a product for no-fault liability purposes, and an AI system provider "should be treated as a manufacturer." |
-| ePrivacy Directive (32002L0058) | 2 | **In Scope** | Standard cookie/tracking consent obligations apply to any consumer-facing electronic communications service processing user data. |
-| General Product Safety Regulation (32023R0988) | 2 | **In Scope** | Safety assessment of digitally connected consumer products must account for health risk, including mental-health impact on vulnerable users — directly relevant to a symptom-checking app. |
-| Cyber Resilience Act (32024R2847) | 2 | **Monitor** | Hinges on whether the standalone app counts as a "product with digital elements" with connected functionality, since the Regulation excludes services designed outside a manufacturer's responsibility — confirm classification. |
-| Consumer Rights Directive (32011L0083) | 3 | **In Scope** | App subscription terms are standard consumer contracts; the Directive's healthcare carve-out applies only to services delivered by regulated health professionals, which this app does not provide. |
-| Cloud and AI Development Act proposal (52026PC0502) | 3 | **Monitor** | Hinges on whether the company relies on covered EU cloud/AI infrastructure commitments once the proposal advances — nothing in scope yet as a mere proposal. |
-| European Chips Act (32023R1781) | — | *(see appendix)* | — |
+| GDPR | 1 | **In Scope** | Symptom entries qualify as health data, defined by the Regulation as covering "all data pertaining to the health status of a data subject which reveal information relating to the past, current or future physical or mental health status of the data subject."[1] This triggers Article 9 special-category processing duties. |
+| AI Act | 1 | **Monitor** | Hinges on whether the symptom-checker qualifies as a safety component of a medical device under Regulation 2017/745, which would pull it into Article 6(1) high-risk status; the Commission is drafting classification guidelines for exactly this boundary. |
+| European Health Data Space Regulation | 2 | **In Scope** | If the app is a wellness application, before market placement the manufacturer must register the product data in "the EU database for registration of EHR systems and wellness applications, including, in the case of EHR systems, the results of the assessment referred to in Article 40."[2] |
+| Product Liability Directive | 2 | **In Scope** | AI software providers are treated as manufacturers under the Directive: "A developer or producer of software, including AI system providers within the meaning of Regulation (EU) 2024/1689 of the European Parliament and of the Council, should be treated as a manufacturer."[3] |
+| ePrivacy Directive | 2 | **In Scope** | A consumer app storing or accessing data on a user's device sits inside the Directive's protection framework for the growing capacity of digital networks to process subscriber and user data. |
+| Cyber Resilience Act | 2 | **Monitor** | Hinges on whether cloud functionality is tied to a physical product with digital elements — a standalone app with no supporting website functionality falls outside scope, since the Regulation excludes "websites that do not support the functionality of a product with digital elements, or cloud services designed and developed outside the responsibility of a manufacturer of a product with digital elements."[4] Confirm whether the app is bundled with any hardware. |
+| Consumer Rights Directive | 3 | **In Scope** | The Directive's healthcare exclusion covers only services delivered by regulated health professionals; a wellness app run without a licensed clinician falls outside that carve-out and keeps standard distance-contract information duties. |
 
-The AI Act carries the heaviest near-term weight. The Commission is not waiting for full application to start shaping enforcement expectations: it is already drafting guidance on classifying high-risk systems, with dedicated industry briefings underway for medtech providers on preparing compliance documentation. A consumer symptom-checker sits squarely in the health-use-case category regulators are targeting first, and provider obligations — risk management, technical documentation, post-market monitoring — attach the moment the system is placed on the market, with no grace period built into the retrieved guidance.+GDPR is directly applicable today, enforced in France by CNIL, whose sanctions committee has repeatedly targeted health-data processors. Given the company collects symptom and condition data from consumers at scale, an Article 9 consent flow and DPIA are the baseline precondition for lawful operation. The AI Act's classification question follows directly behind: resolving the MDR/high-risk boundary now determines whether conformity assessment, technical documentation, and post-market monitoring duties apply before the product scales further.
```

#### Political landscape & strategic play

```diff
--- Political landscape & strategic play (baseline)
+++ Political landscape & strategic play (candidate)
@@ -1,13 +1,10 @@
-The AI Act's health-sector interpretation is being worked out inside the Commission's technical services drafting classification guidelines, with parallel industry-facing sessions run by medtech-focused bodies helping providers prepare compliance documentation ahead of enforcement. On the GDPR side, the French national supervisory authority is the first port of call for any health-data compliance question or breach given the company's French market presence, and its precedent on health-app consent design sets the practical bar this startup must clear before any first case arrives.
+GDPR enforcement against health-data processors in France runs through the CNIL, whose sanctions committee has prioritized health and wellness apps in recent cycles; any DPIA or consent-flow design for this company should track CNIL's published guidance rather than a generic GDPR template. At EU level, the Commission's AI Office is actively drafting classification guidelines for the boundary this company sits on — consumer symptom-checkers positioned between general wellness content and MDR-regulated diagnostic software.
 
-The more consequential structural move is the Digital Omnibus package. It proposes to extend AI Act micro-enterprise regulatory privileges to the broader SME category, and it lays out further exemption extensions across the Data Governance Act, Open Data Directive, and AI Act frameworks: regulatory privileges granted to micro enterprises under the Artificial Intelligence Act are extended to SMEs, and the proposal lays out specific measures extending exemptions already granted to SMEs under the current legal framework to Small Mid-Caps.[1] For a company that is micro today but plans to scale, this rewrites the compliance cost curve at exactly the size band it will cross next.
+**Lobbying focus**: the highest-value engagement at this company's scale is responding to the Commission's ongoing work on high-risk AI classification guidance — a position paper or consultation submission on how consumer symptom-checkers should be treated relative to MDR software-as-a-medical-device rules is achievable; approaching any incumbent adversarially is not.
 
-**Lobbying focus:** the Digital Omnibus consultation and impact-assessment process is where this company's limited public-affairs bandwidth buys the most — the file is still open at proposal stage, its SME test explicitly invites input, and a short position paper supporting extension of AI Act micro/SME exemptions to health-AI providers is a proportionate, achievable ask at this scale.
+**Coalitions**: the retrieved sources name no health-tech trade association or complainant coalition organized around this specific classification question; the AI Act classification consultation itself is the only identified engagement channel.
 
-**Coalitions:** the retrieved sources name no health-tech trade association or complainant coalition organizing specifically around AI Act or EHDS obligations for consumer health apps — this is a gap the company's own network, not the documents, will need to fill.
-
-**Watchlist:**
-- Digital Omnibus SME-exemption provisions — proposal stage now, worth tracking through trilogue given direct micro/SME relevance.
-- Commission high-risk classification guidance for AI Act health-use systems — drafting underway, final text will set the compliance bar.
-- EHDS wellness-application registration database rollout — confirm the exact operational date the EU database opens for registration.
-- CRA scope clarification for standalone consumer software — confirm before treating the app as in or out of scope.+**Watchlist**:
+- Commission finalization of AI Act high-risk classification guidelines for health-adjacent software — determines whether Article 6(1) applies to this product category.
+- Operational rollout of the EU database for registration of EHR systems and wellness applications under the European Health Data Space Regulation — sets the registration mechanics this company must follow.
+- CNIL health-data enforcement guidance and decisions involving consumer health apps — the direct benchmark for this company's consent and DPIA design.
```

#### Appendix: Out of Scope Register

```diff
--- Appendix: Out of Scope Register (baseline)
+++ Appendix: Out of Scope Register (candidate)
@@ -1,38 +1,44 @@
 | Instrument | Why Out of Scope | What Would Change It |
 |---|---|---|
-| DMA (32022R1925) | Not a gatekeeper; core platform services and quantitative thresholds do not apply to a micro consumer app. | Acquisition by or integration into a designated gatekeeper's ecosystem. |
-| DSA (32022R2065) | Not a hosting/intermediary platform; micro-enterprise exclusion applies in any case. | Adding user-generated content or third-party hosting features. |
-| Data Act (32023R2854) | App is not a connected product manufacturer or virtual assistant under the Regulation's scope. | Launching a connected hardware device or embedded virtual assistant. |
-| Data Governance Act (32022R0868) | Company is not a data intermediation service or altruism organisation. | Operating a data-sharing intermediary service. |
-| NIS2 (32022L2555) | Not a healthcare provider entity or medical device manufacturer under Annex sector lists. | Formal designation as a healthcare provider or medical device manufacturer. |
-| DORA (32022R2554) | Not a financial entity or ICT third-party provider to one. | Entering financial services provision. |
-| MiCA (32023R1114) | No crypto-asset activity of any kind. | Adding crypto payment or token features. |
-| P2B Regulation (32019R1150) | Not an intermediary platform serving business users. | Operating a marketplace connecting third-party health providers to consumers. |
-| eIDAS2 (32024R1183) | Not a relying party integrating the EU Digital Identity Wallet. | Adopting wallet-based identity verification. |
-| EMFA (32024R1083) | Not a media service provider. | N/A absent a pivot into content publishing. |
-| European Accessibility Act (32019L0882) | Micro-enterprise exemption applies directly, since "the requirements and obligations of this Directive should not apply to microenterprises providing services within the scope of this Directive." | Growing past micro-enterprise size thresholds. |
-| Machinery Directive (32006L0042) | Not a manufacturer of physical machinery. | N/A absent a hardware pivot. |
-| Package Travel Directive (32015L2302) | Not a travel or linked-arrangement provider. | N/A absent a sector pivot. |
-| Open Data Directive (32019L1024) | Not a public sector body re-using public data. | N/A. |
-| Cloud and AI Development Act proposal (52026PC0502) — *see main table* | — | — |
-| European Business Wallet proposal (52025PC0838) | Not a provider or owner of a European Business Wallet; obligations attach to wallet providers and business identity holders. | Becoming a wallet provider or integrating EBW identity functions. |
-| Interoperable Europe Act (32024R0903) | Not a public sector body or Union entity operating interoperability sandboxes. | Partnering with a public authority on a cross-border GovTech pilot. |
-| Significant Digital Presence proposal (52018PC0147) | Stalled proposal on taxable digital presence thresholds; not a live obligation and the company's activity does not approach the significant-presence thresholds contemplated. | Formal adoption and a large-scale EU digital footprint. |
-| Digital Services Tax proposal (52018PC0148) | Stalled proposal; no live DST obligation exists, and turnover is far below any threshold contemplated. | Revival of the proposal and turnover growth into taxable-revenue bands. |
-| Platform Work Directive (32024L2831) | Not a digital labour platform managing platform workers. | Building a gig-work marketplace for health professionals. |
-| Political Advertising Regulation / TTPA (32024R0900) | Not engaged in political advertising services. | Offering ad placement for political campaigns. |
-| Web Accessibility Directive (32016L2102) | Applies to public sector websites and apps, not a private consumer health-app operator. | Contracting to build or operate a public-sector digital service. |
-| Digital Euro Regulation proposal (52023PC0369) | Not a payment services provider; proposal not yet in force. | Becoming a regulated payment service provider handling digital euro transactions. |
-| Industrial Accelerator Act proposal (52026PC0100) | Concerns industrial permitting digitalisation for manufacturers, not a software-only health app. | Operating physical manufacturing facilities subject to permitting. |
-| European Chips Act (32023R1781) | Not active in the semiconductor value chain. | Entering chip design, fabrication, or pilot-line activity. |
-| Copyright DSM Directive (32019L0790) | Not an online content-sharing service hosting user uploads at the scale the Directive targets. | Launching a user-upload content platform. |
-| Cybersecurity Act (32019R0881) | Certification scheme is voluntary and product/service-category specific; no ICT product certification currently sought. | Seeking EU cybersecurity certification for the app or a connected device. |
-| European Electronic Communications Code (32018L1972) | App's health-chat feature is ancillary, not a standalone interpersonal communications service. | Launching a general-purpose messaging feature as a principal service. |
-| Digital Identity Framework Toolbox Recommendation (32021H0946) | Non-binding recommendation aimed at Member State wallet rollout, not directly obligating private app developers. | Becoming a relying party integrating national digital identity wallets. |
-| e-Evidence Regulation (32023R1543) | Not a target of a cross-border criminal evidence production or preservation order at present. | Receiving a law-enforcement data request under the Regulation. |
-| Corporate Sustainability Omnibus / CSRD-CSDDD track (32026L0470) | Below sustainability-reporting thresholds; not a large undertaking subject to CSRD. | Growing into CSRD scope thresholds. |
-| Empowering Consumers for the Green Transition Directive (32024L0825) | App makes no durability or software-update environmental claims requiring disclosure. | Marketing environmental or software-longevity claims to consumers. |
-| Gigabit Infrastructure Act (32024R1309) | Not a telecoms infrastructure deployer. | Building physical network infrastructure. |
-| Geo-blocking Regulation (32018R0302) | No evidence of nationality-based access blocking on the app's interface. | Introducing geographic access restrictions for EU customers. |
-| Joint Cyber Unit Recommendation (32021H1086) | Non-binding recommendation directed at Member State cybersecurity authorities and NIS-scope entities, not applicable to this company directly. | Formal designation as an NIS2-scope entity. |
... 43 more lines omitted — see the JSON sidecar for the full diff ...
```

### Recency coverage

Of documents ingested in the last 30 days, how many showed up in the panel's retrieved passages at any point:


Full raw output: `brief-improve-report-2026-07-21T19-45-16Z-handedit.json`

## 2026-07-21 18:15 UTC — candidate accepted, aggregate +0.548 — did NOT hold up under sharpen=True (-0.265)

Spent **$5.32** of a no cap across 26 calls. Stopped: `completed_all_rounds`.

| Phase | Calls | $ | Input tok | Output tok | Cache read | Cache write |
|---|---|---|---|---|---|---|
| generation | 24 | 5.13 | 782950 | 173792 | 164809 | 32890 |
| judge | 2 | 0.19 | 51009 | 2773 | 0 | 0 |

### Round-by-round

| Round | Aggregate | Δ vs. prior best | Accepted | Elapsed | Note |
|---|---|---|---|---|---|
| 0 (baseline) | 2.329 | — | yes | 778.3s | — |
| 1 | 2.877 | +0.548 | yes | 720.6s | The Political landscape section's requirement to name working-level individuals is being satisfied with generic institutional placeholders (EDPB, DG CNECT) rather than actual named officeholders or specific venues, so add an explicit instruction forbidding institution-only naming when a specific role/person can be identified, and requiring the Lobbying focus paragraph to name a concrete actionable venue rather than a generic guidance channel. |

### Outcome

During exploration (sharpen=False, cheap), the best candidate improved the aggregate score from 2.329 to 2.877 (+0.548). **This has NOT been applied anywhere** — it exists only as the diff below. See the confirmation section for whether this holds up under production's real two-pass path before deciding whether to apply it.

### Proposed diff

```diff
--- SYSTEM_PROMPT (current)
+++ SYSTEM_PROMPT (proposed)
@@ -28,10 +28,10 @@
 **Prio 3** — peripheral, conditional, or long-dated: monitoring only, nothing to resource this year.
 Order rows by Prio ascending (all 1s first); within the same Prio, In Scope before Monitor. Follow the table with one paragraph (5-12 lines) of expert institutional context on the single most material instrument — its enforcement history, timeline realism, why the deadline is or isn't real.
 ## Political landscape & strategic play — the who-runs-what map and the engagement agenda, merged. This is the section the company's public-affairs team will rework by hand with client context you do not have — so fill it with VERIFIABLE LANDSCAPE FACTS they can build on (who runs the file, live proceedings and their dates, venues, coalition doors, consultation windows), and keep strategic-advice prose short: a recommendation here is a starting point for their tailoring, not a plan. Facts survive manual editing; generic strategy gets deleted. Structure:
-First, one or two landscape paragraphs (5-12 lines each) naming who actually runs the relevant dossiers at WORKING level, their mandate, track record, and what that predicts about where the rules move next. Working level means: the rapporteur and shadow rapporteurs and their committee on a live legislative file, the lead DG and responsible Commissioner, the Council working party or presidency handling it, the national regulator (and its president) who would take the company's case — named individuals when the retrieved sources or well-established public knowledge supply them. Do NOT pad with Commission-President-level names unless that person personally drives the file; a brief that says 'von der Leyen' where it should say 'the IMCO rapporteur' has failed. When you cannot name the person confidently, name the exact role and body so the reader can look them up in one search.
+First, one or two landscape paragraphs (5-12 lines each) naming who actually runs the relevant dossiers at WORKING level, their mandate, track record, and what that predicts about where the rules move next. Working level means: the rapporteur and shadow rapporteurs and their committee on a live legislative file, the lead DG and responsible Commissioner, the Council working party or presidency handling it, the national regulator (and its president) who would take the company's case — named individuals when the retrieved sources or well-established public knowledge supply them. Do NOT pad with Commission-President-level names unless that person personally drives the file; a brief that says 'von der Leyen' where it should say 'the IMCO rapporteur' has failed. For a small or early-stage company with no live legislative file of its own, resist defaulting to naming only the broad institution (e.g. 'the EDPB', 'DG CNECT') — go one level deeper to the specific unit, case team, or officeholder that would actually handle this company's matter (the lead national DPA and its current head, the DG CNECT unit responsible for the specific instrument, the relevant national regulator's enforcement division) even when the company itself is not yet on anyone's radar; when you genuinely cannot find that level of specificity in the retrieved sources or well-established public knowledge, name the exact role and body so the reader can look them up in one search, rather than settling for the institution's name alone.
 A source labelled '[Jurisdiction · Verbatim debate]' is a plenary floor-debate transcript — a named MEP/MP/deputy's own recorded remarks, with their party or political group, not a press paraphrase of what someone might think. When one is retrieved for the file at hand, it outranks a generic 'the rapporteur' reference: name the actual speaker, their group, and what they said (paraphrased per CITATION HYGIENE, or quoted with marks) as evidence of where that file's real political support or resistance sits — this is a stronger, more current signal than the procedural rapporteur/committee facts alone, and a direct input to the Coalitions bullets below (a group or bloc on record for or against IS a coalition signal). Do not manufacture a coalition from a single floor speech, though — one MEP's remarks are one data point, not their whole group's settled position unless the source says so.
 Then three labelled parts:
-**Lobbying focus** — one paragraph: the single dossier or proceeding where this company's effort buys the most, the venue (a case team, a consultation, a committee), and the realistic ask given precedent. Calibrate the ask to what this company can execute at its scale: coalition-building, consultation input, or position-paper contribution — NEVER phrase it as unilaterally confronting a dominant rival ('file a complaint against X', 'take on X') unless the company is at genuinely comparable scale to a peer that has already done exactly that successfully; a formal complaint against a Big Tech incumbent is a later escalation after coalition and evidence work, not an opening move. If the company has no standing to engage at its current size, say so in one line and name the threshold that would change that.
+**Lobbying focus** — one paragraph: the single dossier or proceeding where this company's effort buys the most, the venue (a case team, a consultation, a committee), and the realistic ask given precedent. For an early-stage or small company with no live dossier of its own, do not default to naming a generic guidance channel as the whole answer ('monitor EDPB guidance') — identify the one concrete, actionable venue open to a company at this scale (a specific open consultation window, a named trade body's working group, a specific regulator's SME/sandbox programme) and state the realistic ask there; if genuinely no such venue exists in the retrieved sources, say so in one line rather than filling the paragraph with a passive monitoring instruction. Calibrate the ask to what this company can execute at its scale: coalition-building, consultation input, or position-paper contribution — NEVER phrase it as unilaterally confronting a dominant rival ('file a complaint against X', 'take on X') unless the company is at genuinely comparable scale to a peer that has already done exactly that successfully; a formal complaint against a Big Tech incumbent is a later escalation after coalition and evidence work, not an opening move. If the company has no standing to engage at its current size, say so in one line and name the threshold that would change that.
 **Coalitions** — 2-4 bullets naming specific trade associations, complainant groups, or peer companies already organized around the company's issues, drawn from the retrieved sources; per bullet, one line on why that door is the right one. If the sources name none, write one line saying so rather than inventing.
 **Watchlist** — 3-6 bullets, each one concrete upcoming decision, milestone, vote, deadline or report with its date (or the most precise timing the sources give) and one line on why it moves the company's interests.
 Across this whole section: if the company's profile names a specific larger competitor or describes an unfair-advantage complaint, and the retrieved sources document a live legislative or enforcement development that constrains, burdens, or advantages that named competitor or dynamic differently than it affects this company — this is not limited to competition/DMA cases: a DSA content-moderation or transparency finding, an AI Act compliance-cost or GPAI obligation a rival carries and this company doesn't (or vice versa), a Digital Omnibus-style simplification of GDPR/AI Act/cookie rules that cuts compliance costs unevenly across a market, or a straightforward antitrust/gatekeeper matter are all fair game — say so explicitly and frame it as a competitive opening or watch-item for this company. State the development exactly as the source reports it, without upgrading a pending investigation or draft text into a certainty of wrongdoing or a guaranteed outcome. Likewise, if the retrieved sources show a trade association, coalition, or peer company already organizing around a policy question that intersects with this company's own commercial interests — whether that's a DMA gatekeeper fight, a DSA duty, an AI Act obligation, or a Digital Omnibus rollback — not just its compliance burden, name it and describe the opening. Only name a competitor or coalition if it is both named or clearly implied in the company's own answers and present in a retrieved source; never infer a competitor's identity from context alone. If the profile gives no competitive context, or the retrieved sources contain no evidence tying a development to a named competitor or coalition, leave this angle out entirely and keep the section focused on the standard compliance-driven engagement opportunities — do not speculate to fill the space.
```

### Dimension breakdown

| Dimension | Baseline | Winning candidate | Δ |
|---|---|---|---|
| relevance | 4.2 | 4.4 | +0.200 |
| citation_quality | 3.6 | 4.2 | +0.600 |
| scope_matching | 3.4 | 4.6 | +1.200 |
| prioritization | 3.8 | 4.2 | +0.400 |
| political_currency | 2.0 | 3.0 | +1.000 |
| stakeholder_specificity | 2.8 | 3.6 | +0.800 |
| tone_and_structure | 4.2 | 4.4 | +0.200 |
| canon_issues | 22.0 | 23.6 | +1.600 |

### Output diff

Every round that actually generated a candidate's output, accepted or not — the automated accept/reject bar below is a heuristic, not a verdict; read the actual text and judge for yourself.

### Round 1 — ACCEPTED

_The Political landscape section's requirement to name working-level individuals is being satisfied with generic institutional placeholders (EDPB, DG CNECT) rather than actual named officeholders or specific venues, so add an explicit instruction forbidding institution-only naming when a specific role/person can be identified, and requiring the Lobbying focus paragraph to name a concrete actionable venue rather than a generic guidance channel._

Representative before/after for **Panel: Early-stage B2B SaaS start-up**:

#### Bottom line

```diff
--- Bottom line (baseline)
+++ Bottom line (candidate)
@@ -1,2 +1 @@
-- ACTION: GDPR is In Scope and Prio 2 — it is the only regime with material, continuously-accruing compliance exposure given the company handles personal data as controller/processor from day one.
-- No Prio 1 exposure — nothing here requires immediate action; the company is too small and too B2B-focused to trigger any regime's enforcement priority tier this year.+- No Prio 1 exposure — nothing here requires immediate action.
```

#### Compliance exposure

```diff
--- Compliance exposure (baseline)
+++ Compliance exposure (candidate)
@@ -1,8 +1,8 @@
 | Instrument | Prio | Verdict | Why / Trigger |
 |---|---|---|---|
-| GDPR (32016R0679) | 2 | In Scope | Company processes personal data of EU users; as a micro enterprise it benefits from a carve-out — "this Regulation includes a derogation for organisations with fewer than 250 employees with regard to record-keeping"[1] — but core lawful-basis, security and data-subject-rights duties still apply. |
-| Data Act (32023R2854) | 2 | In Scope | As a hosted SaaS provider the company is a data-processing-service provider subject to cloud-switching duties; SME compliance facilitation is being extended to small mid-caps under the pending Digital Omnibus, and "Regulation (EU) 2023/2854 (Data Act), which entered into application on 12 September 2025, marks a significant step towards a fair and competitive data economy in the EU"[2]. |
-| ePrivacy Directive (32002L0058) | 3 | In Scope | Any EU-facing website/app using cookies or similar tracking on the company's own users falls under the ePrivacy framework, which was built to address "large capacities and possibilities for processing personal data"[3] and user trust in electronic communications services. |
-| Cloud and AI Development Act (52026PC0502) | 3 | Monitor | Still a Commission proposal targeting the cloud/AI Single Market — hinges on final scope and whether SaaS providers of this size fall under any obligations once adopted; confirm text as it develops. |
+| GDPR (Reg. 2016/679) | 2 | **In Scope** | Company processes personal data as controller/processor; micro-enterprise status only trims record-keeping duties, since the Regulation includes a derogation for organisations with fewer than 250 employees with regard to record-keeping[1], not substantive obligations. |
+| ePrivacy Directive (2002/58/EC) | 2 | **In Scope** | Any website analytics, cookies, or B2B marketing outreach trigger consent and confidentiality-of-communications rules under the Directive's general framework for electronic communications services and networks. |
+| Revised Product Liability Directive (2024/2853) | 2 | **Monitor** | Software counts as a "product" once software is supplied in exchange for a price, or for personal data used other than exclusively for improving the security, compatibility or interoperability of the software, and is therefore supplied in the course of a commercial activity[2] — hinges on whether the SaaS moves from free/pre-revenue use to a paid commercial offering; confirm launch pricing. |
+| DSA (Reg. 2022/2065) — hosting-service baseline | 3 | **In Scope** | A tool storing user-generated project data likely qualifies as a hosting/intermediary service, but the additional obligations imposed under this Regulation on providers of online platforms... should not apply to providers that qualify as micro or small enterprises[3] — only baseline notice-and-contact duties apply, not VLOP-tier transparency burdens. |
 
-GDPR is the file that actually determines this company's risk exposure, because it is the only regime here with a fully mature enforcement apparatus and because personal-data processing is inherent to running any SaaS product from the first customer onward. The regulation was built explicitly with smaller operators in mind: "a Regulation is necessary to provide legal certainty and transparency for economic operators, including micro, small and medium-sized enterprises"[1], and the European Data Protection Board has continued to lower the practical bar rather than raise it — "In April 2023, the Board launched a data protection guide for small business, which provides practical information for SMEs in an accessible and easily understandable format."[4] That trajectory (guidance over enforcement sweeps for the smallest operators) is realistic to expect to continue, but it does not remove the underlying obligations — lawful basis, a privacy notice, breach-response capability and vendor contracts remain non-negotiable regardless of headcount.+GDPR is the instrument that actually determines this company's day-to-day risk. It is the most mature, most aggressively enforced EU digital regime, with sanctions authority already tested across dozens of national DPA decisions and CJEU rulings since 2018 — there is no realistic "wait and see" on its core obligations (lawful basis, data subject rights, breach notification) the way there is with newer files. At the same time, the regime is explicitly built with proportionality for outfits this size: Union institutions and bodies, and Member States and their supervisory authorities, are encouraged to take account of the specific needs of micro, small and medium-sized enterprises in the application of this Regulation[1], and the European Data Protection Board runs a dedicated simplification track — in April 2023, the Board launched a data protection guide for small business, which provides practical information for SMEs in an accessible and easily understandable format[4]. The deadline pressure here is not a future compliance date; it is ongoing exposure from day one of processing any EU personal data, calibrated down in practice, not in law, by enterprise size.
```

#### Political landscape & strategic play

```diff
--- Political landscape & strategic play (baseline)
+++ Political landscape & strategic play (candidate)
@@ -1,13 +1,10 @@
-GDPR enforcement in this company's home Member State runs through its national Data Protection Authority, while EU-level coordination and guidance sits with the European Data Protection Board, whose 2024–2027 strategy commits to expanding compliance tooling: "The Board has committed in its 2024-2027 strategy to continue to support compliance measures such as certification and codes of conduct, including by engaging with key groups of stakeholders to explain how the tools can be used."[4] On the Data Act side, the Commission's DG CNECT is driving both implementation and the current simplification push — the November 2025 Digital Omnibus package proposes extending SME facilitation to small mid-caps without touching the Data Act's substantive achievements: "The changes put forward in this proposal do not intend to introduce changes to the achievements of Regulation (EU) 2023/2854 (Data Act)."[2] That signals the Commission's working assumption is burden-reduction for smaller players, not new obligations.
+GDPR enforcement against a company this size runs through the national Data Protection Authority in its member state of establishment, not Brussels directly — the DPA's complaints/investigations unit is the actual first point of contact if anything goes wrong, with EDPB coordination only engaged for cross-border or urgent cases via its Article 66(2) procedure. The more consequential Brussels-level activity right now is not enforcement but simplification: the Commission's late-2025 Digital Omnibus package is actively rewriting how GDPR, the AI Act and the Data Act treat small players. The proposal notes SMCs face challenges similar to SMEs in relation to administrative burden, leading to a need for proportionality in the implementation of Regulation (EU) 2024/1689, and for targeted support, extending several measures for small-scale providers to SMCs[5], and a companion Data Act proposal confirms that the rules that facilitate compliance with the EU data legislation for small and medium-sized enterprises are extended to include small mid-cap companies[6]. This is a live legislative track worth watching precisely because it moves obligations, not just guidance.
 
-**Lobbying focus**: at two people and pre-revenue, this company has no standing to engage directly in Brussels rulemaking. The highest-value low-cost move is feeding practical pain points into the EDPB's SME compliance-guide consultation channel and monitoring the Digital Omnibus SME/SMC provisions as they move through Parliament and Council, since "regulatory privileges granted to micro enterprises under the Artificial Intelligence Act are also extended to SMEs"[5] under that same package — a template the company should watch for parallel Data Act and GDPR simplification.
+**Lobbying focus:** the Digital Omnibus dossier (proposals 52025PC0836/52025PC0837 and their impact assessments) is the one venue where a company this size can plausibly move something — not by lobbying alone, but by feeding concrete micro-enterprise pain points into the SME test process the Commission is already running, since though large businesses dominate the DC, cloud and AI markets, many SMEs in the EU still play a relevant role, and the initiative is considered "relevant" for SMEs[7]. The realistic ask is a short written input via a national or EU-level SME/software trade body, not a unilateral submission — this company has no standing yet to engage Brussels directly on its own.
 
-**Coalitions**: 
-- The EDPB's SME/small-business compliance guide is an existing, ready-made resource, not an organizing coalition, but it is the direct door for practical GDPR questions per the guide launched in doc 7.
-- The Commission has stated a broader commitment relevant to any SME/startup in digital services: "the Commission acknowledges the importance of competitiveness, innovation and investment in digital services, in particular with regard to micro, small and medium sized enterprises and start-ups... the Commission is committed to facilitate compliance with the Digital Services Act by micro, small and medium sized enterprises and start-ups."[6] This is a DSA-specific channel and not directly usable since the company is out of DSA scope, but it signals the general institutional posture toward startups worth referencing in any Commission consultation response.
-- No trade association or complainant group specific to this company's product category (B2B project-management SaaS) is named in the retrieved sources.
+**Coalitions:** the retrieved sources do not name any organized complainant group, trade association or peer company specifically mobilized around a B2B project-management SaaS's issues; the only structured channel visible is the Commission's own SME-relevance testing process (Annex 6 SME test) that any qualifying business can feed into via a trade body.
 
-**Watchlist**:
-- Digital Omnibus proposals (52025PC0836, 52025PC0837, 52025PC0838) — ongoing co-legislative process extending SME/SMC facilitation across AI Act, Data Act and Data Governance Act; track adoption timing for compliance-cost relief.
-- Cloud and AI Development Act (52026PC0502) — still at Commission proposal stage; watch for scope clarifications affecting cloud/data-processing-service providers.
-- EDPB SME guidance updates — any refresh signals where enforcement priorities and practical expectations are shifting for small controllers.+**Watchlist:**
+- Digital Omnibus package (52025PC0836/837) — ongoing co-legislative process extending SME/SMC exemptions across GDPR, AI Act and Data Act; timing to confirm via Parliament committee calendar.
+- Cloud and AI Development Act proposal (52026PC0502) — a new framework to set the regulatory conditions for a Single Market in cloud computing services, incentivising investment in cloud infrastructure, AI research and development[8] that could eventually touch any company relying on EU cloud infrastructure.
+- EDPB 2024-2027 strategy — continued rollout of SME compliance tooling, per the Board's commitment to keep supporting certification and codes of conduct for smaller operators.
```

#### Appendix: Out of Scope Register

```diff
--- Appendix: Out of Scope Register (baseline)
+++ Appendix: Out of Scope Register (candidate)
@@ -1,16 +1,17 @@
 | Instrument | Why Out of Scope | What Would Change It |
 |---|---|---|
-| DSA (32022R2065) | Not an intermediary/hosting platform; also micro-enterprise exclusion for additional platform obligations applies. | Becomes relevant if the product adds user-generated public content hosting or platform-style third-party listings. |
-| DMA (32022R1925) | Not a gatekeeper; nowhere near the Art. 3(2) turnover/user thresholds. | Gatekeeper designation or crossing quantitative thresholds. |
-| AI Act (32024R1689) | Company does not use or deploy AI systems. | Introducing any AI feature, especially high-risk use cases. |
-| NIS2 (32022L2555) | Micro enterprise; essential-entity status requires exceeding medium-sized ceilings. | Growth past medium-enterprise thresholds or qualifying as a critical digital-infrastructure provider. |
-| CRA (32024R2847) | Delivers a hosted SaaS service, not a manufactured product with digital elements placed on the market. | Shipping on-premise software or connected hardware components. |
-| DORA (32022R2554) | Not a financial entity under the Regulation's scope. | Entering regulated financial-services activity. |
-| MiCA (32023R1114) | No crypto-asset activity of any kind. | Launching a crypto-asset or DLT-based product. |
-| P2B Regulation (32019R1150) | Not an online intermediation service connecting third-party business users to consumers. | Building a marketplace/intermediation layer into the product. |
-| eIDAS2 (32024R1183) | Not a trust service provider. | Offering electronic identity or trust services. |
-| EMFA (32024R1083) | Not a media service provider. | Pivoting into content/media distribution. |
-| European Accessibility Act (32019L0882) | Micro enterprise providing services is fully exempted from the Directive's obligations. | Growing beyond micro-enterprise status. |
-| Web Accessibility Directive (32016L2102) | Applies only to public-sector bodies. | Becoming a public-sector supplier under a re-badged public contract. |
-| Package Travel Directive (32015L2302) / (32026L1024) | Not in the travel sector. | Pivoting into travel booking or linked travel arrangements. |
-| Consumer Rights Directive (32011L0083) | Customer base is B2B only, not consumer-facing. | Launching a direct-to-consumer product line. |+| AI Act (Reg. 2024/1689) | Company does not use AI. | Deployment of any AI system, especially high-risk categories. |
+| DMA (Reg. 2022/1925) | Not a gatekeeper; no core platform service at qualifying scale. | Designation thresholds are irrelevant at this size — would require years of growth. |
+| NIS2 (Dir. 2022/2555) | Essential/important entity status requires exceeding medium-enterprise ceilings, per entities of a type referred to in Annex I which exceed the ceilings for medium-sized enterprises[9]; company is micro and not a listed sector. | Growth past medium-enterprise thresholds or entry into a digital infrastructure role. |
+| DORA (Reg. 2022/2554) | Not a financial entity. | Pivoting into regulated financial services. |
+| MiCA (Reg. 2023/1114) | No crypto-asset activity of any kind. | Launching a crypto-asset or DLT-based product. |
+| CRA (Reg. 2024/2847) | Pure hosted SaaS, not a "product with digital elements" placed on the market as hardware/downloadable software. | Distributing an installable client or connected-device component. |
+| Data Act (Reg. 2023/2854) | Not a cloud/data-processing service subject to switching rules; no connected-product data generation. | Becoming a cloud infrastructure provider itself. |
+| Data Governance Act (Reg. 2022/868) | Not a data intermediation service or data altruism organisation. | Offering third-party data-sharing intermediation services. |
+| Consumer Rights Directive (2011/83/EU) | Customer base is B2B only. | Beginning to sell directly to consumers. |
+| European Accessibility Act (Dir. 2019/882) | The requirements and obligations of this Directive should therefore not apply to microenterprises providing services within the scope of this Directive.[10] | Growing beyond microenterprise size while providing in-scope services. |
+| P2B Regulation (2019/1150) | Not an online intermediation service connecting business users to consumers. | Pivoting to a marketplace/intermediation model. |
+| eIDAS2 (Reg. 2024/1183) | No electronic identity, wallet, or trust service offering. | Integrating EU Digital Identity Wallet functionality. |
+| EMFA (Reg. 2024/1083) | Not a media service provider. | N/A for a project-management SaaS. |
+| Cybersecurity Act (Reg. 2019/881) | Certification scheme is voluntary; no current certification pursuit. | Seeking an EU cybersecurity certification for the product. |
+| Digital Services Tax proposal (COM(2018)148) | Proposal never adopted; revenue thresholds far exceed a pre-revenue micro-enterprise regardless. | Adoption of an EU-wide DST plus growth past its revenue thresholds. |
```

### Confirmation (sharpen=True — the real production path)

Re-tested baseline vs. the winning candidate one more time each, both with `sharpen=True` (the mandatory revise pass real `/api/brief` traffic always runs). Confirmed delta: **-0.265** — **DOES NOT hold up**.

Same comparison under `sharpen=True`, for **Panel: Industrial IoT manufacturer**:

#### Bottom line

```diff
--- Bottom line (baseline)
+++ Bottom line (candidate)
@@ -1,2 +1,4 @@
-- ACTION — Cyber Resilience Act: connected sensors and controllers meet the Regulation's own definition of "products with digital elements," making conformity assessment and technical documentation a live, enforced obligation now.
-- ACTION — Machinery Directive 2006/42/EC: factory-automation controllers function as machinery safety components under the current regime, so CE-marking and declaration-of-conformity duties apply today, ahead of the 2027 successor regulation.+- CRA (Cyber Resilience Act) is Prio 1 — connected sensors and controllers are "products with digital elements" subject to mandatory essential cybersecurity requirements before market placement.
+- Machinery Directive 2006/42/EC is Prio 1 — it remains the binding safety regime for factory automation controllers until the Machinery Regulation takes over.
+- NIS2 is Prio 1 — the company's NACE manufacturing activity puts it inside the Annex-listed sectors under an already-transposed regime.
+- RISK — under the CRA, products that fail to meet the essential cybersecurity requirements cannot lawfully be placed on the EU market at all — a sales-blocking exposure, not a fine.
```

#### Compliance exposure

```diff
--- Compliance exposure (baseline)
+++ Compliance exposure (candidate)
@@ -1,10 +1,13 @@
 | Instrument | Prio | Verdict | Why / Trigger |
 |---|---|---|---|
-| Cyber Resilience Act (CRA) | 1 | In Scope | Connected sensors that obtain, generate or collect, by means of their components or operating systems, data concerning their performance, use or environment and that are able to communicate those data via an electronic communications service[1] fall within scope, and manufacturers must meet the Regulation's essential cybersecurity requirements before market placement and keep technical documentation covering the required cybersecurity risk assessment. |
-| Machinery Directive 2006/42/EC | 1 | In Scope | Under the current framework, software that performs a safety function and which is placed independently on the market should be considered a safety component[2] — squarely covering factory-automation controllers. The successor Machinery Regulation (EU) 2023/1230 does not apply until 20 January 2027, so 2006/42/EC governs conformity and CE-marking obligations now. |
-| NIS2 Directive | 2 | In Scope | NIS2's Annex II manufacturing categories list undertakings in the "Manufacture of computer, electronic and optical products"[3] NACE category — a large connected-sensor manufacturer sits inside this bracket. |
-| Data Act | 2 | In Scope | The Data Act's own scope description covers connected products across private, civil or commercial infrastructure, vehicles, health and lifestyle equipment, ships, aircraft, home equipment and consumer goods, medical and health devices or agricultural and industrial machinery[1], triggering manufacturer data-access and data-sharing duties toward business users. |
-| Corporate Sustainability Omnibus I (Directive 2026/470) | 2 | Monitor | Hinges on whether the company itself falls within CSRD reporting scope — confirm headcount/turnover thresholds. If it does, the Directive's data-sharing simplification measures for sustainability reporting apply directly. |
-| Radio Equipment Directive 2014/53/EU | 2 | Monitor | Hinges on whether the sensors/controllers use radio spectrum for connectivity — confirm. Harmonised standards work is proceeding jointly under the Machinery Directive and the Radio Equipment Directive, so a wireless product line brings conformity obligations immediately. |
+| Cyber Resilience Act (32024R2847 / 32022PC0454) | 1 | **In Scope** | Products with digital elements can only be marketed if they meet the Regulation's essential cybersecurity requirements, and manufacturers must build in cybersecurity by design, handle vulnerabilities, and sustain security-update supportthe essential cybersecurity requirements and obligations mandate that all products with digital elements shall only be made available on the market if... they meet the essential cybersecurity requirements set out in this Regulation... manufacturers to factor in cybersecurity in the design and development and production of the products with digital elements, exercise due diligence on security aspects[1], a market-access gate that connected sensors and controllers fall squarely inside. |
+| Machinery Directive 2006/42/EC | 1 | **In Scope** | Currently binding safety text for machinery and safety components incorporated into factory automation; the successor Machinery Regulation (EU) 2023/1230 only applies from 20 January 2027, so 2006/42/EC governs conformity and CE-marking obligations now — plan the transition, don't treat it as already superseded. |
+| NIS2 Directive (32022L2555) | 1 | **In Scope** | The Annex sector list names manufacture of computer, electronic and optical products[2] and machinery and equipment among covered entities, putting a manufacturer in these NACE divisions under the already-transposed regime. |
+| Data Act (32023R2854) | 2 | **In Scope** | Connected sensors and controllers meet the Regulation's own IoT definition: connected products that obtain, generate or collect... data concerning their performance, use or environment and that are able to communicate those data... often referred to as the Internet of Things, should fall within the scope of this Regulation, with the exception of prototypes[3] — this triggers data-access and sharing duties toward industrial customers. |
+| Product Liability Directive (32024L2853) | 2 | **In Scope** | Software updates the manufacturer supplies or authorises stay within its liability perimeter: related services and other components, including software updates and upgrades, should be considered to be within the manufacturer's control where they are integrated into, or inter-connected with, a product, or supplied, by the manufacturer or where the manufacturer authorises or consents to their integration[4]. |
+| Cybersecurity Act (32019R0881) | 3 | **Monitor** | ENISA certification remains voluntary for most industrial products today, but connected and automated cars, electronic medical devices, industrial automation control systems and smart grids are only some examples of sectors in which certification is already widely used or is likely to be used in the near future[5] — hinges on whether the Commission designates a mandatory scheme for this product category. |
+| Industrial Accelerator Act proposal (52026PC0100) | 3 | **Monitor** | This proposal targets decarbonisation and industrial capacity in strategic sectors, with a specific objective to facilitate differentiation for low-carbon industrial products to increase their value and marketability[6] — hinges on whether the company's products fall within the strategic sectors the final text designates; still a proposal. |
+| EU Cyber Crisis Blueprint Recommendation (32025H03445) | 3 | **Monitor** | This Recommendation maps sector-specific crisis-response mechanisms, including manufacturing sectors listed with "n/a" placeholder entries for computer/electronics, machinery and motor vehicle manufacturing — hinges on whether a Member State activates a sector-specific crisis mechanism for these categories. |
+| Interoperable Europe Act (32024R0903) | 3 | **Monitor** | The Act's governance mechanism is aimed at public sector bodies implementing interoperable digital policy, the mechanism should support public sector bodies[7] — relevant only if Panel supplies connected products into public-sector interoperability projects; confirm any such contracts. |
 
-The Cyber Resilience Act is the file that carries the most operational weight this year. It is adopted (Regulation (EU) 2024/2847) with technical-documentation provisions already being amended (Regulation (EU) 2025/327), and its essential-requirements logic runs through the same market-surveillance authorities the company already deals with for machinery and radio equipment. The Commission's consultation process on which product categories count as "important" or "critical" is a live channel: manufacturers in scope of those designations are consulted and their views taken into account in order to analyse the cybersecurity risks as well as the balance of costs and benefits of designating such categories of products as important or critical[4]. Submitting technical input now, before category boundaries are fixed, is a materially better position than reacting after designation.+The Cyber Resilience Act is the file that reshapes engineering and go-to-market timelines most. Its essential requirements are a market-access gate, and the regime is already being amended in detail — a 2025 delegated act inserts new technical-documentation duties: when placing a product with digital elements on the market, the manufacturer shall include the cybersecurity risk assessment referred to in paragraph 3 of this Article in the technical documentation required pursuant to Article 31 and Annex VII[8], and where a product is also covered by other EU acts, a single set of technical documentation shall be drawn up containing the information referred to in Annex VII and the information required by those Union legal acts[8]. That single-dossier approach is deliberately built to interlock with the Machinery Directive/Regulation and NIS2, meaning Panel's compliance file for a factory controller will eventually need to satisfy three regimes from one documentation set — a genuine engineering resourcing question, not a legal footnote.
```

#### Political landscape & strategic play

```diff
--- Political landscape & strategic play (baseline)
+++ Political landscape & strategic play (candidate)
@@ -1,12 +1,13 @@
-The CRA's implementation runs out of the Commission's cybersecurity policy directorate, with ENISA and the European standardisation bodies (CEN, CENELEC, ETSI) feeding the harmonised-standards work that will determine presumption-of-conformity routes for industrial IoT hardware; those same three standards bodies also sit on the AI Act's advisory forum, so the standards ecosystem is shared across both files. NIS2 enforcement sits with each Member State's designated competent authority once national transposition is complete, and Machinery Directive/Regulation conformity assessment runs through national notified bodies under the single-market product-safety framework. The Commission has also opened a broader simplification track for the digital rulebook: it states it is committed to a comprehensive 'stress-test' of the digital rulebook throughout the legislative mandate[5], aiming to keep rules fit for competitiveness — directly relevant to how burdensome CRA technical-documentation and vulnerability-handling duties end up in practice.
+CRA implementation sits with DG CNECT's cybersecurity unit working alongside ENISA on certification schemes and important/critical product-category designations; the Regulation commits the Commission to structured consultation before any such designation, with relevant manufacturers... consulted and their views taken into account in order to analyse the cybersecurity risks as well as the balance of costs and benefits of designating such categories of products as important or critical[9]. Machinery-side rulemaking runs through DG GROW's New Legislative Framework unit, which is actively evaluating whether the framework governing industrial products fits a digitalised sector — the evaluation explicitly covers software updates for industrial equipment and whether the framework remains fit for a digital economy.
 
-**Lobbying focus:** the highest-value engagement is the Commission's structured consultation on CRA "important/critical" product-category designations and on harmonised-standards development. A manufacturer of factory-automation controllers should submit technical input and join a sector coalition position paper now, before category boundaries and standards presumption-of-conformity routes lock in, rather than wait to react after designation.
+The DG GROW NLF evaluation on industrial products is the single most useful open door for a company at Panel's scale — it covers soft- and hardware updates... for industrial products in the EU[10] and asks whether the framework remains fit for purpose in a digital economy. A position submission here, focused on how CRA technical-documentation duplication interacts with existing Machinery Directive declarations, is a realistic, proportionate ask for a manufacturer of Panel's size.
 
-**Coalitions:** the retrieved sources name no trade association, complainant group, or peer company organised specifically around this company's CRA/NIS2/Machinery position — this is a gap to fill via a sector association rather than an existing door to walk through.
+**Lobbying focus:** submit input to the DG GROW NLF evaluation on industrial products, specifically flagging the CRA/Machinery documentation overlap that the CRA's own 2025 delegated act already anticipates.
+
+**Coalitions:** the retrieved sources name no trade association or complainant group organised specifically around industrial IoT/CRA-NIS2 overlap for this profile — confirm via national manufacturing federations before committing resource.
 
 **Watchlist:**
-- Machinery Regulation (EU) 2023/1230 becomes applicable 20 January 2027 — CE-marking and documentation processes should be migration-ready well before that date.
-- CRA harmonised-standards and important/critical category consultations, with manufacturer cost-benefit input actively sought.
-- Digital Omnibus proposals (COM(2025)837, COM(2025)838) — Commission-driven simplification of the digital rulebook and a related European Business Wallet initiative that could ease documentation burdens if the company later adopts EU digital-identity/company-formation tools.
-- NIS2 national transposition enforcement ramping up as Member States activate competent authorities and reporting portals.
-- Radio Equipment Directive delegated cybersecurity requirements — relevant the moment any product line adds wireless connectivity.+- DG GROW's NLF evaluation consultation window — sets the template for how CRA and machinery rules mesh for industrial products.
+- Machinery Regulation (EU) 2023/1230 application date, 20 January 2027 — the hard deadline to transition off the 2006/42/EC regime.
+- CRA important/critical product-category designations — determines whether factory controllers face stricter conformity assessment.
+- The Commission's cross-file "stress-test" of the digital rulebook, committed throughout the current legislative mandate — could simplify overlapping CRA/NIS2/Machinery documentation duties.
```

#### Appendix: Out of Scope Register

```diff
--- Appendix: Out of Scope Register (baseline)
+++ Appendix: Out of Scope Register (candidate)
@@ -1,45 +1,41 @@
 | Instrument | Why Out of Scope | What Would Change It |
 |---|---|---|
-| GDPR | Company does not handle personal data. | Starts processing personal data (e.g., employee or customer biometric/behavioural data). |
-| AI Act | Company does not use or place AI systems on the market. | Adds AI-based analytics or predictive-maintenance AI to product line. |
-| DMA | Not a gatekeeper; below Art. 3(2) thresholds. | Designation or threshold-crossing event. |
-| DSA | Not a hosting service or online platform. | Launches a marketplace or platform feature. |
-| P2B Regulation | Not an online intermediation service or search engine. | Starts operating a B2B intermediation platform. |
-| eIDAS2 | Not an identity-wallet or trust-service provider. | Enters digital identity or e-signature service market. |
-| EMFA | Not a media service provider. | Enters media distribution business. |
-| ePrivacy Directive | Not a publicly available electronic communications service provider. | Begins offering public electronic communications services. |
-| DORA | Not a financial entity or critical ICT third-party provider to finance. | Becomes designated critical ICT provider to financial sector. |
-| MiCA | No crypto-asset activity of any kind. | Enters crypto-asset issuance or custody services. |
-| Data Governance Act | Not a data-intermediation service or data-altruism organisation. | Sets up a data-sharing intermediary service. |
-| Critical Entities Resilience (CER) Directive | Manufacturing is not a listed CER sector; company is not energy, transport, banking, water, health, digital-infra, space, or food. | Expands into a listed critical-infrastructure sector. |
-| Council Recommendation on Critical Infrastructure Resilience (32023H0120(01)) | Scope tracks the CER Directive, which this company sits outside of. | Designation as a critical entity under CER. |
-| Chips Act (Regulation (EU) 2023/1781) | Not a semiconductor manufacturer. | Begins chip fabrication or design activity. |
-| General Product Safety Regulation | Products are sold B2B to industrial customers, not consumers. | Adds a consumer-facing product line. |
-| European Accessibility Act (2019/882) | Products/services are not consumer-facing. | Sells directly to consumers. |
-| Right to Repair Directive (2024/2853) | Applies to consumer goods; company sells B2B. | Enters consumer goods market. |
-| Empowering Consumers Directive (2024/825) | Consumer-information duty on software-update commitments; no consumer sales. | Enters consumer sales channel. |
-| Platform Work Directive | No platform-work workforce model. | Adopts gig/platform labour model. |
-| Consumer Rights Directive (2011/83) | No B2C distance-selling activity. | Opens direct consumer e-commerce channel. |
-| Cybersecurity Act (2019/881) | Voluntary certification scheme; no mandatory scheme yet covers this product category. | EU adopts mandatory certification for industrial control systems/IoT. |
-| Terrorist Content Online Regulation | Not a hosting service provider carrying user content. | N/A absent a hosting-service pivot. |
-| e-Evidence Regulation | Not an electronic communications or interpersonal communications service. | N/A absent such a service offering. |
-| Copyright DSM Directive (text/data mining) | Not engaged in large-scale content mining as core activity. | Builds a data-mining/AI training business on third-party content. |
-| Geo-blocking Regulation | No B2C cross-border e-commerce distance selling. | Opens consumer cross-border sales. |
-| Open Data Directive | Not a public sector body or research-funding organisation. | N/A for a private manufacturer. |
-| Industrial Accelerator Act proposal (COM(2026)100) | Framework targets decarbonisation and capacity building in named strategic/energy-intensive sectors, not component manufacturing. | Company qualifies as an energy-intensive industry under the proposal's sectoral scope. |
-| CRA technical-documentation amendment (Regulation (EU) 2025/327) | Substantively folded into the CRA row above — same regime, same obligations. | N/A — track alongside the core CRA row. |
-| European Electronic Communications Code (Directive 2018/1972) | Applies to providers of electronic communications networks/services, not device manufacturers. | Company begins operating a communications network or service. |
-| Cloud and AI Development Act proposal (COM(2026)502) | Targets cloud/AI infrastructure sovereignty measures; company is a hardware manufacturer, not a cloud/AI service operator. | Company begins operating cloud or AI infrastructure services. |
-| European Business Wallet proposal (COM(2025)838) | Corporate digital-identity/VAT-attestation wallet framework; no current use case. | Company adopts EU Business Wallet tools for VAT or company-formation processes. |
-| EU Blueprint for Cyber Crisis Management (Council Recommendation 2025/3445) | Coordinates Member State crisis response; imposes no direct company obligation. | Company is designated a critical entity drawn into national crisis-response arrangements. |
-| Interoperable Europe Act (Regulation (EU) 2024/903) | Governs interoperability support for public sector bodies, not private manufacturers. | Company becomes a public-sector digital-service supplier bound by interoperability solutions. |
-| Political Advertising Regulation / TTPA (Regulation (EU) 2024/900) | Targets providers of political advertising services; not applicable to an industrial hardware business. | Company begins offering political ad-targeting or ad-placement services. |
-| Significant Digital Presence proposal (COM(2018)147) | Stalled digital-tax proposal aimed at large digital platforms with significant EU digital presence. | Proposal is revived and company meets its digital-presence revenue thresholds. |
... 47 more lines omitted — see the JSON sidecar for the full diff ...
```

The cheap exploration result above did not survive contact with the real two-pass pipeline — likely means the improvement was compensating for something `sharpen=False` skips, not a genuine SYSTEM_PROMPT fix. Do not apply this diff.

### Recency coverage

Of documents ingested in the last 30 days, how many showed up in the panel's retrieved passages at any point:

- Round 0: 0/8 (0.0%)
- Round 1: 0/8 (0.0%)

Full raw output: `brief-improve-report-2026-07-21T18-15-42Z-confirmation-only.json`

## 2026-07-21 16:35 UTC — candidate accepted, aggregate +0.548

Spent **$10.00** of a $10.00 cap across 51 calls. Stopped: `completed_all_rounds`.

| Phase | Calls | $ | Input tok | Output tok | Cache read | Cache write |
|---|---|---|---|---|---|---|
| generation | 47 | 9.62 | 1519145 | 314801 | 320498 | 65780 |
| judge | 3 | 0.24 | 59910 | 3744 | 0 | 0 |
| candidate | 1 | 0.14 | 8024 | 7900 | 0 | 0 |

### Round-by-round

| Round | Aggregate | Δ vs. prior best | Accepted | Elapsed | Note |
|---|---|---|---|---|---|
| 0 (baseline) | 2.329 | — | yes | 778.3s | — |
| 1 | 2.877 | +0.548 | yes | 720.6s | The Political landscape section's requirement to name working-level individuals is being satisfied with generic institutional placeholders (EDPB, DG CNECT) rather than actual named officeholders or specific venues, so add an explicit instruction forbidding institution-only naming when a specific role/person can be identified, and requiring the Lobbying focus paragraph to name a concrete actionable venue rather than a generic guidance channel. |

### Outcome

During exploration (sharpen=False, cheap), the best candidate improved the aggregate score from 2.329 to 2.877 (+0.548). **This has NOT been applied anywhere** — it exists only as the diff below. See the confirmation section for whether this holds up under production's real two-pass path before deciding whether to apply it.

### Proposed diff

```diff
--- SYSTEM_PROMPT (current)
+++ SYSTEM_PROMPT (proposed)
@@ -28,10 +28,10 @@
 **Prio 3** — peripheral, conditional, or long-dated: monitoring only, nothing to resource this year.
 Order rows by Prio ascending (all 1s first); within the same Prio, In Scope before Monitor. Follow the table with one paragraph (5-12 lines) of expert institutional context on the single most material instrument — its enforcement history, timeline realism, why the deadline is or isn't real.
 ## Political landscape & strategic play — the who-runs-what map and the engagement agenda, merged. This is the section the company's public-affairs team will rework by hand with client context you do not have — so fill it with VERIFIABLE LANDSCAPE FACTS they can build on (who runs the file, live proceedings and their dates, venues, coalition doors, consultation windows), and keep strategic-advice prose short: a recommendation here is a starting point for their tailoring, not a plan. Facts survive manual editing; generic strategy gets deleted. Structure:
-First, one or two landscape paragraphs (5-12 lines each) naming who actually runs the relevant dossiers at WORKING level, their mandate, track record, and what that predicts about where the rules move next. Working level means: the rapporteur and shadow rapporteurs and their committee on a live legislative file, the lead DG and responsible Commissioner, the Council working party or presidency handling it, the national regulator (and its president) who would take the company's case — named individuals when the retrieved sources or well-established public knowledge supply them. Do NOT pad with Commission-President-level names unless that person personally drives the file; a brief that says 'von der Leyen' where it should say 'the IMCO rapporteur' has failed. When you cannot name the person confidently, name the exact role and body so the reader can look them up in one search.
+First, one or two landscape paragraphs (5-12 lines each) naming who actually runs the relevant dossiers at WORKING level, their mandate, track record, and what that predicts about where the rules move next. Working level means: the rapporteur and shadow rapporteurs and their committee on a live legislative file, the lead DG and responsible Commissioner, the Council working party or presidency handling it, the national regulator (and its president) who would take the company's case — named individuals when the retrieved sources or well-established public knowledge supply them. Do NOT pad with Commission-President-level names unless that person personally drives the file; a brief that says 'von der Leyen' where it should say 'the IMCO rapporteur' has failed. For a small or early-stage company with no live legislative file of its own, resist defaulting to naming only the broad institution (e.g. 'the EDPB', 'DG CNECT') — go one level deeper to the specific unit, case team, or officeholder that would actually handle this company's matter (the lead national DPA and its current head, the DG CNECT unit responsible for the specific instrument, the relevant national regulator's enforcement division) even when the company itself is not yet on anyone's radar; when you genuinely cannot find that level of specificity in the retrieved sources or well-established public knowledge, name the exact role and body so the reader can look them up in one search, rather than settling for the institution's name alone.
 A source labelled '[Jurisdiction · Verbatim debate]' is a plenary floor-debate transcript — a named MEP/MP/deputy's own recorded remarks, with their party or political group, not a press paraphrase of what someone might think. When one is retrieved for the file at hand, it outranks a generic 'the rapporteur' reference: name the actual speaker, their group, and what they said (paraphrased per CITATION HYGIENE, or quoted with marks) as evidence of where that file's real political support or resistance sits — this is a stronger, more current signal than the procedural rapporteur/committee facts alone, and a direct input to the Coalitions bullets below (a group or bloc on record for or against IS a coalition signal). Do not manufacture a coalition from a single floor speech, though — one MEP's remarks are one data point, not their whole group's settled position unless the source says so.
 Then three labelled parts:
-**Lobbying focus** — one paragraph: the single dossier or proceeding where this company's effort buys the most, the venue (a case team, a consultation, a committee), and the realistic ask given precedent. Calibrate the ask to what this company can execute at its scale: coalition-building, consultation input, or position-paper contribution — NEVER phrase it as unilaterally confronting a dominant rival ('file a complaint against X', 'take on X') unless the company is at genuinely comparable scale to a peer that has already done exactly that successfully; a formal complaint against a Big Tech incumbent is a later escalation after coalition and evidence work, not an opening move. If the company has no standing to engage at its current size, say so in one line and name the threshold that would change that.
+**Lobbying focus** — one paragraph: the single dossier or proceeding where this company's effort buys the most, the venue (a case team, a consultation, a committee), and the realistic ask given precedent. For an early-stage or small company with no live dossier of its own, do not default to naming a generic guidance channel as the whole answer ('monitor EDPB guidance') — identify the one concrete, actionable venue open to a company at this scale (a specific open consultation window, a named trade body's working group, a specific regulator's SME/sandbox programme) and state the realistic ask there; if genuinely no such venue exists in the retrieved sources, say so in one line rather than filling the paragraph with a passive monitoring instruction. Calibrate the ask to what this company can execute at its scale: coalition-building, consultation input, or position-paper contribution — NEVER phrase it as unilaterally confronting a dominant rival ('file a complaint against X', 'take on X') unless the company is at genuinely comparable scale to a peer that has already done exactly that successfully; a formal complaint against a Big Tech incumbent is a later escalation after coalition and evidence work, not an opening move. If the company has no standing to engage at its current size, say so in one line and name the threshold that would change that.
 **Coalitions** — 2-4 bullets naming specific trade associations, complainant groups, or peer companies already organized around the company's issues, drawn from the retrieved sources; per bullet, one line on why that door is the right one. If the sources name none, write one line saying so rather than inventing.
 **Watchlist** — 3-6 bullets, each one concrete upcoming decision, milestone, vote, deadline or report with its date (or the most precise timing the sources give) and one line on why it moves the company's interests.
 Across this whole section: if the company's profile names a specific larger competitor or describes an unfair-advantage complaint, and the retrieved sources document a live legislative or enforcement development that constrains, burdens, or advantages that named competitor or dynamic differently than it affects this company — this is not limited to competition/DMA cases: a DSA content-moderation or transparency finding, an AI Act compliance-cost or GPAI obligation a rival carries and this company doesn't (or vice versa), a Digital Omnibus-style simplification of GDPR/AI Act/cookie rules that cuts compliance costs unevenly across a market, or a straightforward antitrust/gatekeeper matter are all fair game — say so explicitly and frame it as a competitive opening or watch-item for this company. State the development exactly as the source reports it, without upgrading a pending investigation or draft text into a certainty of wrongdoing or a guaranteed outcome. Likewise, if the retrieved sources show a trade association, coalition, or peer company already organizing around a policy question that intersects with this company's own commercial interests — whether that's a DMA gatekeeper fight, a DSA duty, an AI Act obligation, or a Digital Omnibus rollback — not just its compliance burden, name it and describe the opening. Only name a competitor or coalition if it is both named or clearly implied in the company's own answers and present in a retrieved source; never infer a competitor's identity from context alone. If the profile gives no competitive context, or the retrieved sources contain no evidence tying a development to a named competitor or coalition, leave this angle out entirely and keep the section focused on the standard compliance-driven engagement opportunities — do not speculate to fill the space.
```

### Dimension breakdown

| Dimension | Baseline | Winning candidate | Δ |
|---|---|---|---|
| relevance | 4.2 | 4.4 | +0.200 |
| citation_quality | 3.6 | 4.2 | +0.600 |
| scope_matching | 3.4 | 4.6 | +1.200 |
| prioritization | 3.8 | 4.2 | +0.400 |
| political_currency | 2.0 | 3.0 | +1.000 |
| stakeholder_specificity | 2.8 | 3.6 | +0.800 |
| tone_and_structure | 4.2 | 4.4 | +0.200 |
| canon_issues | 22.0 | 23.6 | +1.600 |

### Output diff

Every round that actually generated a candidate's output, accepted or not — the automated accept/reject bar below is a heuristic, not a verdict; read the actual text and judge for yourself.

### Round 1 — ACCEPTED

_The Political landscape section's requirement to name working-level individuals is being satisfied with generic institutional placeholders (EDPB, DG CNECT) rather than actual named officeholders or specific venues, so add an explicit instruction forbidding institution-only naming when a specific role/person can be identified, and requiring the Lobbying focus paragraph to name a concrete actionable venue rather than a generic guidance channel._

Representative before/after for **Panel: Early-stage B2B SaaS start-up**:

#### Bottom line

```diff
--- Bottom line (baseline)
+++ Bottom line (candidate)
@@ -1,2 +1 @@
-- ACTION: GDPR is In Scope and Prio 2 — it is the only regime with material, continuously-accruing compliance exposure given the company handles personal data as controller/processor from day one.
-- No Prio 1 exposure — nothing here requires immediate action; the company is too small and too B2B-focused to trigger any regime's enforcement priority tier this year.+- No Prio 1 exposure — nothing here requires immediate action.
```

#### Compliance exposure

```diff
--- Compliance exposure (baseline)
+++ Compliance exposure (candidate)
@@ -1,8 +1,8 @@
 | Instrument | Prio | Verdict | Why / Trigger |
 |---|---|---|---|
-| GDPR (32016R0679) | 2 | In Scope | Company processes personal data of EU users; as a micro enterprise it benefits from a carve-out — "this Regulation includes a derogation for organisations with fewer than 250 employees with regard to record-keeping"[1] — but core lawful-basis, security and data-subject-rights duties still apply. |
-| Data Act (32023R2854) | 2 | In Scope | As a hosted SaaS provider the company is a data-processing-service provider subject to cloud-switching duties; SME compliance facilitation is being extended to small mid-caps under the pending Digital Omnibus, and "Regulation (EU) 2023/2854 (Data Act), which entered into application on 12 September 2025, marks a significant step towards a fair and competitive data economy in the EU"[2]. |
-| ePrivacy Directive (32002L0058) | 3 | In Scope | Any EU-facing website/app using cookies or similar tracking on the company's own users falls under the ePrivacy framework, which was built to address "large capacities and possibilities for processing personal data"[3] and user trust in electronic communications services. |
-| Cloud and AI Development Act (52026PC0502) | 3 | Monitor | Still a Commission proposal targeting the cloud/AI Single Market — hinges on final scope and whether SaaS providers of this size fall under any obligations once adopted; confirm text as it develops. |
+| GDPR (Reg. 2016/679) | 2 | **In Scope** | Company processes personal data as controller/processor; micro-enterprise status only trims record-keeping duties, since the Regulation includes a derogation for organisations with fewer than 250 employees with regard to record-keeping[1], not substantive obligations. |
+| ePrivacy Directive (2002/58/EC) | 2 | **In Scope** | Any website analytics, cookies, or B2B marketing outreach trigger consent and confidentiality-of-communications rules under the Directive's general framework for electronic communications services and networks. |
+| Revised Product Liability Directive (2024/2853) | 2 | **Monitor** | Software counts as a "product" once software is supplied in exchange for a price, or for personal data used other than exclusively for improving the security, compatibility or interoperability of the software, and is therefore supplied in the course of a commercial activity[2] — hinges on whether the SaaS moves from free/pre-revenue use to a paid commercial offering; confirm launch pricing. |
+| DSA (Reg. 2022/2065) — hosting-service baseline | 3 | **In Scope** | A tool storing user-generated project data likely qualifies as a hosting/intermediary service, but the additional obligations imposed under this Regulation on providers of online platforms... should not apply to providers that qualify as micro or small enterprises[3] — only baseline notice-and-contact duties apply, not VLOP-tier transparency burdens. |
 
-GDPR is the file that actually determines this company's risk exposure, because it is the only regime here with a fully mature enforcement apparatus and because personal-data processing is inherent to running any SaaS product from the first customer onward. The regulation was built explicitly with smaller operators in mind: "a Regulation is necessary to provide legal certainty and transparency for economic operators, including micro, small and medium-sized enterprises"[1], and the European Data Protection Board has continued to lower the practical bar rather than raise it — "In April 2023, the Board launched a data protection guide for small business, which provides practical information for SMEs in an accessible and easily understandable format."[4] That trajectory (guidance over enforcement sweeps for the smallest operators) is realistic to expect to continue, but it does not remove the underlying obligations — lawful basis, a privacy notice, breach-response capability and vendor contracts remain non-negotiable regardless of headcount.+GDPR is the instrument that actually determines this company's day-to-day risk. It is the most mature, most aggressively enforced EU digital regime, with sanctions authority already tested across dozens of national DPA decisions and CJEU rulings since 2018 — there is no realistic "wait and see" on its core obligations (lawful basis, data subject rights, breach notification) the way there is with newer files. At the same time, the regime is explicitly built with proportionality for outfits this size: Union institutions and bodies, and Member States and their supervisory authorities, are encouraged to take account of the specific needs of micro, small and medium-sized enterprises in the application of this Regulation[1], and the European Data Protection Board runs a dedicated simplification track — in April 2023, the Board launched a data protection guide for small business, which provides practical information for SMEs in an accessible and easily understandable format[4]. The deadline pressure here is not a future compliance date; it is ongoing exposure from day one of processing any EU personal data, calibrated down in practice, not in law, by enterprise size.
```

#### Political landscape & strategic play

```diff
--- Political landscape & strategic play (baseline)
+++ Political landscape & strategic play (candidate)
@@ -1,13 +1,10 @@
-GDPR enforcement in this company's home Member State runs through its national Data Protection Authority, while EU-level coordination and guidance sits with the European Data Protection Board, whose 2024–2027 strategy commits to expanding compliance tooling: "The Board has committed in its 2024-2027 strategy to continue to support compliance measures such as certification and codes of conduct, including by engaging with key groups of stakeholders to explain how the tools can be used."[4] On the Data Act side, the Commission's DG CNECT is driving both implementation and the current simplification push — the November 2025 Digital Omnibus package proposes extending SME facilitation to small mid-caps without touching the Data Act's substantive achievements: "The changes put forward in this proposal do not intend to introduce changes to the achievements of Regulation (EU) 2023/2854 (Data Act)."[2] That signals the Commission's working assumption is burden-reduction for smaller players, not new obligations.
+GDPR enforcement against a company this size runs through the national Data Protection Authority in its member state of establishment, not Brussels directly — the DPA's complaints/investigations unit is the actual first point of contact if anything goes wrong, with EDPB coordination only engaged for cross-border or urgent cases via its Article 66(2) procedure. The more consequential Brussels-level activity right now is not enforcement but simplification: the Commission's late-2025 Digital Omnibus package is actively rewriting how GDPR, the AI Act and the Data Act treat small players. The proposal notes SMCs face challenges similar to SMEs in relation to administrative burden, leading to a need for proportionality in the implementation of Regulation (EU) 2024/1689, and for targeted support, extending several measures for small-scale providers to SMCs[5], and a companion Data Act proposal confirms that the rules that facilitate compliance with the EU data legislation for small and medium-sized enterprises are extended to include small mid-cap companies[6]. This is a live legislative track worth watching precisely because it moves obligations, not just guidance.
 
-**Lobbying focus**: at two people and pre-revenue, this company has no standing to engage directly in Brussels rulemaking. The highest-value low-cost move is feeding practical pain points into the EDPB's SME compliance-guide consultation channel and monitoring the Digital Omnibus SME/SMC provisions as they move through Parliament and Council, since "regulatory privileges granted to micro enterprises under the Artificial Intelligence Act are also extended to SMEs"[5] under that same package — a template the company should watch for parallel Data Act and GDPR simplification.
+**Lobbying focus:** the Digital Omnibus dossier (proposals 52025PC0836/52025PC0837 and their impact assessments) is the one venue where a company this size can plausibly move something — not by lobbying alone, but by feeding concrete micro-enterprise pain points into the SME test process the Commission is already running, since though large businesses dominate the DC, cloud and AI markets, many SMEs in the EU still play a relevant role, and the initiative is considered "relevant" for SMEs[7]. The realistic ask is a short written input via a national or EU-level SME/software trade body, not a unilateral submission — this company has no standing yet to engage Brussels directly on its own.
 
-**Coalitions**: 
-- The EDPB's SME/small-business compliance guide is an existing, ready-made resource, not an organizing coalition, but it is the direct door for practical GDPR questions per the guide launched in doc 7.
-- The Commission has stated a broader commitment relevant to any SME/startup in digital services: "the Commission acknowledges the importance of competitiveness, innovation and investment in digital services, in particular with regard to micro, small and medium sized enterprises and start-ups... the Commission is committed to facilitate compliance with the Digital Services Act by micro, small and medium sized enterprises and start-ups."[6] This is a DSA-specific channel and not directly usable since the company is out of DSA scope, but it signals the general institutional posture toward startups worth referencing in any Commission consultation response.
-- No trade association or complainant group specific to this company's product category (B2B project-management SaaS) is named in the retrieved sources.
+**Coalitions:** the retrieved sources do not name any organized complainant group, trade association or peer company specifically mobilized around a B2B project-management SaaS's issues; the only structured channel visible is the Commission's own SME-relevance testing process (Annex 6 SME test) that any qualifying business can feed into via a trade body.
 
-**Watchlist**:
-- Digital Omnibus proposals (52025PC0836, 52025PC0837, 52025PC0838) — ongoing co-legislative process extending SME/SMC facilitation across AI Act, Data Act and Data Governance Act; track adoption timing for compliance-cost relief.
-- Cloud and AI Development Act (52026PC0502) — still at Commission proposal stage; watch for scope clarifications affecting cloud/data-processing-service providers.
-- EDPB SME guidance updates — any refresh signals where enforcement priorities and practical expectations are shifting for small controllers.+**Watchlist:**
+- Digital Omnibus package (52025PC0836/837) — ongoing co-legislative process extending SME/SMC exemptions across GDPR, AI Act and Data Act; timing to confirm via Parliament committee calendar.
+- Cloud and AI Development Act proposal (52026PC0502) — a new framework to set the regulatory conditions for a Single Market in cloud computing services, incentivising investment in cloud infrastructure, AI research and development[8] that could eventually touch any company relying on EU cloud infrastructure.
+- EDPB 2024-2027 strategy — continued rollout of SME compliance tooling, per the Board's commitment to keep supporting certification and codes of conduct for smaller operators.
```

#### Appendix: Out of Scope Register

```diff
--- Appendix: Out of Scope Register (baseline)
+++ Appendix: Out of Scope Register (candidate)
@@ -1,16 +1,17 @@
 | Instrument | Why Out of Scope | What Would Change It |
 |---|---|---|
-| DSA (32022R2065) | Not an intermediary/hosting platform; also micro-enterprise exclusion for additional platform obligations applies. | Becomes relevant if the product adds user-generated public content hosting or platform-style third-party listings. |
-| DMA (32022R1925) | Not a gatekeeper; nowhere near the Art. 3(2) turnover/user thresholds. | Gatekeeper designation or crossing quantitative thresholds. |
-| AI Act (32024R1689) | Company does not use or deploy AI systems. | Introducing any AI feature, especially high-risk use cases. |
-| NIS2 (32022L2555) | Micro enterprise; essential-entity status requires exceeding medium-sized ceilings. | Growth past medium-enterprise thresholds or qualifying as a critical digital-infrastructure provider. |
-| CRA (32024R2847) | Delivers a hosted SaaS service, not a manufactured product with digital elements placed on the market. | Shipping on-premise software or connected hardware components. |
-| DORA (32022R2554) | Not a financial entity under the Regulation's scope. | Entering regulated financial-services activity. |
-| MiCA (32023R1114) | No crypto-asset activity of any kind. | Launching a crypto-asset or DLT-based product. |
-| P2B Regulation (32019R1150) | Not an online intermediation service connecting third-party business users to consumers. | Building a marketplace/intermediation layer into the product. |
-| eIDAS2 (32024R1183) | Not a trust service provider. | Offering electronic identity or trust services. |
-| EMFA (32024R1083) | Not a media service provider. | Pivoting into content/media distribution. |
-| European Accessibility Act (32019L0882) | Micro enterprise providing services is fully exempted from the Directive's obligations. | Growing beyond micro-enterprise status. |
-| Web Accessibility Directive (32016L2102) | Applies only to public-sector bodies. | Becoming a public-sector supplier under a re-badged public contract. |
-| Package Travel Directive (32015L2302) / (32026L1024) | Not in the travel sector. | Pivoting into travel booking or linked travel arrangements. |
-| Consumer Rights Directive (32011L0083) | Customer base is B2B only, not consumer-facing. | Launching a direct-to-consumer product line. |+| AI Act (Reg. 2024/1689) | Company does not use AI. | Deployment of any AI system, especially high-risk categories. |
+| DMA (Reg. 2022/1925) | Not a gatekeeper; no core platform service at qualifying scale. | Designation thresholds are irrelevant at this size — would require years of growth. |
+| NIS2 (Dir. 2022/2555) | Essential/important entity status requires exceeding medium-enterprise ceilings, per entities of a type referred to in Annex I which exceed the ceilings for medium-sized enterprises[9]; company is micro and not a listed sector. | Growth past medium-enterprise thresholds or entry into a digital infrastructure role. |
+| DORA (Reg. 2022/2554) | Not a financial entity. | Pivoting into regulated financial services. |
+| MiCA (Reg. 2023/1114) | No crypto-asset activity of any kind. | Launching a crypto-asset or DLT-based product. |
+| CRA (Reg. 2024/2847) | Pure hosted SaaS, not a "product with digital elements" placed on the market as hardware/downloadable software. | Distributing an installable client or connected-device component. |
+| Data Act (Reg. 2023/2854) | Not a cloud/data-processing service subject to switching rules; no connected-product data generation. | Becoming a cloud infrastructure provider itself. |
+| Data Governance Act (Reg. 2022/868) | Not a data intermediation service or data altruism organisation. | Offering third-party data-sharing intermediation services. |
+| Consumer Rights Directive (2011/83/EU) | Customer base is B2B only. | Beginning to sell directly to consumers. |
+| European Accessibility Act (Dir. 2019/882) | The requirements and obligations of this Directive should therefore not apply to microenterprises providing services within the scope of this Directive.[10] | Growing beyond microenterprise size while providing in-scope services. |
+| P2B Regulation (2019/1150) | Not an online intermediation service connecting business users to consumers. | Pivoting to a marketplace/intermediation model. |
+| eIDAS2 (Reg. 2024/1183) | No electronic identity, wallet, or trust service offering. | Integrating EU Digital Identity Wallet functionality. |
+| EMFA (Reg. 2024/1083) | Not a media service provider. | N/A for a project-management SaaS. |
+| Cybersecurity Act (Reg. 2019/881) | Certification scheme is voluntary; no current certification pursuit. | Seeking an EU cybersecurity certification for the product. |
+| Digital Services Tax proposal (COM(2018)148) | Proposal never adopted; revenue thresholds far exceed a pre-revenue micro-enterprise regardless. | Adoption of an EU-wide DST plus growth past its revenue thresholds. |
```

### Confirmation (sharpen=True — the real production path)

Skipped: budget_exhausted. The exploration result above is **unconfirmed** — treat it as directional, not a verified recommendation.

### Recency coverage

Of documents ingested in the last 30 days, how many showed up in the panel's retrieved passages at any point:

- Round 0: 0/8 (0.0%)
- Round 1: 0/8 (0.0%)

Full raw output: `brief-improve-report-2026-07-21T16-35-06Z.json`


## 2026-07-21 15:11 UTC — no candidate accepted

Spent **$3.02** of a $3.00 cap across 15 calls. Stopped: `budget_exhausted`.

| Phase | Calls | $ | Input tok | Output tok | Cache read | Cache write |
|---|---|---|---|---|---|---|
| generation | 13 | 2.82 | 408230 | 97004 | 72497 | 32392 |
| judge | 1 | 0.06 | 15896 | 767 | 0 | 0 |
| candidate | 1 | 0.14 | 8016 | 7775 | 0 | 0 |

### Round-by-round

| Round | Aggregate | Δ vs. prior best | Accepted | Elapsed | Note |
|---|---|---|---|---|---|
| 0 (baseline) | 1.954 | — | yes | 758.5s | — |
| 1 | — | — | no | — | budget_exhausted |

### Outcome

No candidate beat the baseline (aggregate 1.954/5) by enough to accept. No change proposed.

### Dimension breakdown

| Dimension | Baseline |
|---|---|
| relevance | 4.2 |
| citation_quality | 3.2 |
| scope_matching | 3.8 |
| prioritization | 3.2 |
| political_currency | 2.4 |
| stakeholder_specificity | 2.2 |
| tone_and_structure | 4.2 |
| canon_issues | 27.2 |

_No candidate was accepted this run — nothing to compare the baseline against._

### Output diff

Every round that actually generated a candidate's output, accepted or not — the automated accept/reject bar below is a heuristic, not a verdict; read the actual text and judge for yourself.

No candidate produced output this run (rejected before generating, or budget ran out before any round completed).
### Recency coverage

Of documents ingested in the last 30 days, how many showed up in the panel's retrieved passages at any point:

- Round 0: 0/8 (0.0%)

Full raw output: `brief-improve-report-2026-07-21T15-11-20Z.json`
