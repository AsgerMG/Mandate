# Intake Scoping — Capturing What Actually Qualifies a Company

*2026-07-10. Priority over `memo_vision.md` (memo structure on hold per user):
first make the SCOPING phase capture eligibility-determining facts, so the memo
can say "here is what you qualify for, here is the gate you fail today, here is
what clearing it takes" instead of a high-level instrument map. Vague maps are
not the product; qualification intelligence is.*

---

## 1. The qualification model

Every European public-capital instrument is a stack of gates. A memo is
actionable exactly when it can evaluate the founder against those gates. The
gates cluster into six families:

**G1 — Corporate structure & nexus.** Where the applicant is incorporated,
what the group looks like, and where the funded activity will physically sit.
The big three national layers hard-gate on this: German schemes (KfW
programmes, Länder aid) generally require a German entity or Betriebsstätte
AND the supported activity/investment in Germany; Italy (Invitalia, CDP/FNI,
Fondo di Garanzia) requires an Italian entity and largely Italian nexus, with
extra windows for companies on the *startup innovativa / PMI innovativa*
register; France (Bpifrance, France 2030) requires a French entity, with JEI
status unlocking tax-side benefits. An Irish HQ targeting DE/IT/FR therefore
has a structural to-do BEFORE an application to-do.

**G2 — Size & ownership (the SME test).** Most attractive lanes (EIC, InvestEU
SME windows, higher GBER aid intensities, national SME guarantees) gate on the
EU SME definition: <250 FTE and ≤EUR 50M turnover or ≤EUR 43M balance sheet,
computed INCLUDING linked and partner enterprises (25%+ ownership links). A
majority corporate-owned "startup" can silently fail this. Ownership also
gates: some funds exclude majority non-EU-controlled applicants (defence lanes
especially).

**G3 — Financial standing.** The quiet killers: the GBER
"undertaking in difficulty" test (accumulated losses exceeding half of
subscribed capital blocks most state aid); co-financing capacity (grants fund
25-70%, IPCEI/Innovation Fund require large own shares); de minimis headroom
(EUR 300k/3y ceiling across aid, cumulation rules); bankability/collateral for
guarantee routes.

**G4 — Borrower model (who borrows, who lends).** The axis the intake misses
entirely today. Four archetypes, four different funnels:

| Archetype | The company... | The correct funnel |
|---|---|---|
| **Operating company** | funds its own R&D / capex / working capital | classic lanes: grants, SME guarantees, venture debt, direct NDB loans |
| **Balance-sheet lender/lessor** | finances THIRD parties (leases robots, extends credit) from its own balance sheet | portfolio counter-guarantees (EIF/InvestEU SME window as accredited intermediary), NDB refinancing/funding lines (KfW on-lending, CDP funding), national guarantee institutes |
| **Originator** | originates deals, passes credit to a licensed bank or securitization vehicle | guarantee-to-intermediary partnerships via the partner bank, EIF securitization window (true-sale/synthetic ABS), EIB Group ABS support; the PARTNER's eligibility matters as much as the company's |
| **Fund/vehicle manager** | raises a fund others invest through | EIF fund-of-funds, national FoF (Zukunftsfonds, FNI, Tibi) |

Cenotian is the live example: robotics-finance infrastructure = originator /
lender, so "apply to EIC Accelerator" is close to useless advice, while
"become an InvestEU-accredited intermediary / partner with a bank holding an
EIF counter-guarantee for automation assets" is the real path. The intake must
detect this in one question, early, because it reroutes EVERYTHING downstream.

**G5 — Use of funds & project shape.** R&D (TRL gates grant lanes), first
industrial deployment (Innovation Fund/EIB project finance), capacity expansion
(regional-aid maps gate intensity BY LOCATION of the capex), working capital,
portfolio funding. Ticket size and timeline tolerance (months vs years).

**G6 — Conditionality appetite.** What the founder will accept for the money:
geographic deployment/investment commitments, job-creation commitments,
opening a local entity, the state on the cap table, security packages,
reporting load, IP/localization strings. "What does it entice so that this
capital gets on board" is a gate like any other — some founders will not open
a German GmbH; that answer removes a third of the German layer.

---

## 2. Intake design — two layers plus a pre-check

### Layer 0 — What we already know (ask nothing we can infer)

The events DB should pre-fill before any question renders: traced prior public
funding (feeds the de minimis / cumulation picture), STEP seal, existing
channel footprint, subsector, and any register signals (IT startup-innovativa
style labels where visible). The intake shows the pre-fill and asks the founder
to confirm/correct, not to retype.

### Layer 1 — Deterministic fields (always asked, structured, route everything)

| # | Field | Form | Gates it feeds |
|---|---|---|---|
| L1.1 | Country of incorporation (operating entity) | select | G1 everywhere |
| L1.2 | Entity map: other countries with a subsidiary or permanent establishment | multi-select | G1 target-market doors |
| L1.3 | "Would you open a local entity where a scheme requires it?" | yes / no / depends | G6; turns G1 fails into to-dos instead of dead ends |
| L1.4 | Target markets for raising public capital | multi-select (from prior session's design) | routing of everything national |
| L1.5 | SME triple: FTE band, turnover band, balance-sheet band | 3 bands | G2 |
| L1.6 | Ownership: any single owner ≥25%? corporate or fund? majority non-EU control? | 3 toggles | G2 linked-enterprise test, defence lanes |
| L1.7 | **Borrower model**: "Who ends up owing the money?" — we fund our own operations / we finance customers from our balance sheet / we originate and a bank or vehicle carries the credit / we manage a fund | radio, exactly 4 | G4 — THE routing switch |
| L1.8 | Use of funds | multi: R&D · first plant · capacity expansion · market entry · working capital · financing portfolio | G5 |
| L1.9 | Ticket sought + when needed | band + horizon | G5, speed-tolerance |
| L1.10 | Co-financing capacity: can you fund 30-75% of project cost from own/private money? | band | G3 |
| L1.11 | Financial-standing screen: founded year; "have accumulated losses eaten more than half your share capital?" (plain-language undertaking-in-difficulty proxy) | year + yes/no/unsure | G3 — blocks most aid if yes; memo must say so and name the cure (equity restoration) |
| L1.12 | Conditionality appetite: acceptable strings | multi: local entity · geographic deployment commitments · state as shareholder · job commitments · none of these | G6 |

Twelve fields, all bands/toggles — under two minutes, and every one of them
changes routing. `capitalSought` and the existing archetype picker stay.

### Layer 2 — Adaptive questions (existing LLM intake, now conditioned)

`generateIntakeQuestions` gets Layer 1 answers in its context and drills where
routing is still ambiguous. Examples of the conditioning it must learn:

- L1.7 = originator/lender → ask: licensed entity or partner bank? who retains
  risk? underlying asset ticket + geography? (decides EIF counter-guarantee vs
  securitization window vs national institute)
- L1.8 includes first plant/capacity → ask capex location shortlist (regional
  aid map decides intensity; an Italian Mezzogiorno site vs Milan is a
  different memo)
- L1.5 near SME thresholds → ask the linked-enterprise question precisely
- L1.11 = unsure → one clarifying balance-sheet question, else flag "verify
  undertaking-in-difficulty with your accountant before any GBER application"

### 2b. Reverse-engineered from the instruments (the bottom-up check, 2026-07-10)

*Method (per user direction): take each instrument, list the 3-4 questions an
advisor MUST have answered before proceeding, then derive the minimal covering
question set. The runtime agent gets NO such autonomy — this research happens
here, at design time; the pipeline stays code-orchestrated.*

| Instrument | The make-or-break questions an application turns on |
|---|---|
| EIC Accelerator | SME? · TRL ≥5/6? · cheque logic (grant ≤2.5M vs blended)? · dilution OK for the equity leg? |
| Horizon Pillar II / JUs | willing+able to run in a 3+ partner consortium? · TRL band? · co-financing? · timeline tolerance (12-18mo)? |
| EIB venture debt | institutional investors on the cap table (sponsor test)? · ticket ≥ ~7.5M? · revenue/traction stage? |
| EIF/InvestEU counter-guarantee (as intermediary) | borrower model = lender/originator? · licensed or partner bank? · portfolio asset class + geography? · risk retention? |
| KfW programmes | German entity/Betriebsstätte? · funded activity in Germany? · house-bank relationship? · SME? |
| Bpifrance i-Nov / Garantie | French entity? · project location FR? · co-financing ~50%? · company age (JEI)? |
| Fondo di Garanzia / Smart&Start | Italian entity? · startup-innovativa registrable? · funded activity location (Mezzogiorno bonus)? · bankability? |
| Innovation Fund | capex project? where located? · scale (small vs large window)? · GHG-avoidance case? · co-financing (large own share)? |
| IPCEI | member-state sponsorship realistic? · first-industrial-deployment (beyond TRL8 R&D)? · ticket ≥ tens of M? · funding-gap demonstrable? |
| GBER national grants | undertaking-in-difficulty? · SME/intensity class? · de minimis headroom? · activity location (regional map)? |

**Derived minimal covering set** — questions that unlock ≥3 instruments each,
ranked by coverage ÷ friction. Marked ✓ = already in the wizard, **GAP** = was
missing until this pass:

1. Borrower model ✓ (routes 100% of the universe)
2. Ticket band ✓
3. Entity map + would-open ✓
4. **Development stage / TRL band — GAP** (EIC, Horizon, IPCEI-vs-R&D, Pathfinder)
5. **Where will the funded activity physically sit? — GAP** (KfW, regional aid,
   Smart&Start, Innovation Fund; distinct from entity map AND target markets)
6. **Consortium willingness — GAP** (Horizon, JUs, EDF, IPCEI ecosystems)
7. **House-bank / lending-bank relationship — GAP** (every guarantee route)
8. **Institutional investors aboard / would anchor — GAP** (EIB VD sponsor
   test, EIC equity leg, Scaleup-Europe-style co-investment)
9. **When do you need the money? — GAP** (grants 9-18mo vs guaranteed loans
   weeks; was designed in L1.9, lost in the wizard build)
10. Co-financing band ✓ · SME triple ✓ · in-difficulty ✓ · conditionality ✓
11. Founded year (JEI <8y, startup innovativa <5y) — in the type, **was missing
    from the UI**
12. De minimis headroom → Layer 0 pre-fill + one confirmation line in the memo,
    not a question.

Resolution: add one "Your project" screen (stage, activity location, timeline,
consortium) + two chips on the finances screen (bank relationship,
institutional backing) + founded year. Everything else stays. This keeps the
wizard at 4 fixed screens + adaptive ≤ 2 = max 6.

### Output contract — the eligibility matrix

The scoping phase must produce a structured `EligibilityProfile` the memo can
evaluate instruments against. Per instrument the memo then renders, instead of
prose vibes:

> **KfW guarantee route** — MET: SME test, use of funds. NOT MET: German
> entity (you have none; you answered "would open one"). UNKNOWN: bank
> relationship in DE. Path: incorporate GmbH or establish Betriebsstätte →
> house-bank relationship → guarantee application; realistic lead time X.

Three states per gate (met / not-met / unknown), each not-met paired with the
cure, each unknown paired with the verification step. THIS is the actionable
core the user asked for: "do we meet the terms, and what does it take."

---

## 3. What this changes in the codebase (when we build — not yet)

- `IntelligenceRequest` grows an `eligibility` block (L1 answers; targetMarkets
  already landed on the type).
- Panel: Layer 1 as a compact second step of the existing form (bands +
  toggles, one screen), before the adaptive questions.
- Instrument routing in `pipeline.ts` keys FIRST on borrower model (G4): the
  intermediary/originator funnel selects a different instrument table and
  different fund-process briefs than the operating-company funnel.
- New fund-process briefs needed for the intermediary funnel: EIF
  counter-guarantee / InvestEU intermediary accreditation, securitization
  window, NDB on-lending partnerships (content work, curated like existing
  briefs).
- Eligibility matrix = code-built table (like the comparables table: model
  narrates, never invents statuses).
- Events DB pre-check query for Layer 0.

## 3b. The ground-truth corpus (added 2026-07-10 — the nitty-gritty layer)

"You qualify given you meet these terms; this requires you to invest N% in
jurisdiction Y" is only sayable when every term is extracted from the primary
text and citable. Third corpus, now started:

- **`data/raw/instrument_docs/`** — local copies of the primary sources +
  `MANIFEST.md` (what each grounds, retrieval date, refetch cadence). Wave 1
  retrieved: consolidated GBER (SME definition Annex I, undertaking-in-
  difficulty Art. 2(18), per-category intensities, cumulation Art. 8),
  de minimis 2023/2831, InvestEU Regulation, IPCEI Communication 2021, SME
  definition user guide, Fondo di Garanzia entry page. Wave 2 targets listed
  in the manifest (EIC WP 2026, EIF intermediary CEoIs + securitisation window,
  KfW datasheets, Bpifrance i-Nov/JEI, Disposizioni Operative, startup
  innovativa criteria, Smart&Start, regional aid maps, EIB VD criteria).
- **`data/instrument_terms/*.yaml`** — one structured term record per
  instrument (schema in `_SCHEMA.md`): per-gate requirement + threshold +
  source file + article locator + `verified` flag; obligations (what the money
  requires: jurisdiction of investment, purpose ties); cumulation; channel;
  timeline; `verify_by` re-check date. Two exemplars written: the de minimis
  ceiling (fully verified against the fetched regulation) and KfW
  ERP-Foerderkredit KMU (draft — shows the domestic-nexus + house-bank gates
  with PENDING source markers).
- **Hard rule:** the memo may assert a term as fact only when its gate is
  `verified: true` (human checked the span in the local copy). Model-extracted
  but unverified terms render as "verify: <claim> (source, article)". Same
  span-citation discipline as the news corpus.
- **Extraction plan:** batch LLM pass over the local PDFs proposing gate
  records with page/article citations → human verification pass → `verified`.
  The pipeline exists in spirit (classify_* pattern); not built yet.

### Documents to collect FROM COMPANIES (the advisory intake pack)

To evaluate the profile against verified terms, the scoping phase must be able
to ingest (or ask the founder to attest in lieu of):

1. **Last two annual accounts** — balance-sheet total, turnover, equity,
   subscribed capital (feeds SME test + undertaking-in-difficulty arithmetic).
2. **Cap table + group chart** — linked/partner enterprises for the SME test,
   ≥25% owners, non-EU control (defence lanes), "single undertaking" scope for
   de minimis.
3. **Prior public aid declaration** — everything received, current + two
   fiscal years (we pre-fill from the events DB; founder confirms/corrects).
4. **FTE count** (annual work units, not headcount).
5. **Project budget** — cost breakdown, capex location(s), own-funds share.
6. **Entity registry extracts** for each jurisdiction entity (or attestation).
7. If borrower model = lender/originator: **license status or partner-bank
   letter, portfolio characteristics** (asset type, tickets, geography, risk
   retention).

Phase 1 asks for attestation via Layer 1/2 answers; phase 2 (later) accepts
document upload for machine extraction of the same facts.

## 3c. Decisions (user, 2026-07-10)

1. **Priority instrument list: confirmed** (EIC Accelerator, EIF/InvestEU SME-window
   counter-guarantee, EIF securitisation window, KfW ERP-Förderkredit KMU,
   Bürgschaftsbank framework, Bpifrance i-Nov + Garantie, Fondo di Garanzia PMI,
   Invitalia Smart&Start, CDP Venture/FNI, EIB venture debt).
2. **Wave-2 documents**: no user-held PDFs; fetch as hard as possible
   programmatically; where a primary text stays unreachable, the fallback is
   advising from unstructured sources already in the corpus (articles, official
   statements) — clearly labelled as such, never dressed up as verified terms.
3. **Verification = second LLM, fresh eyes — no human in the loop.** Design:
   extraction pass proposes gate records with exact quotes + locators; a
   SEPARATE verification pass (fresh context, no access to the extractor's
   reasoning) receives the claim + the cited source span and must judge
   entailment strictly (supported / not supported / span does not say this).
   Only records passing verification get `verified: llm_2pass`. Disagreement →
   stays draft. The memo renders the citation either way; "verified" governs
   whether it may be asserted as fact. (Schema's `verified` field becomes
   `false | llm_2pass`.)
4. **Partner-bank route for originators: IN SCOPE.** The memo should originate
   grounded leads — "things to investigate, with specific official-document
   grounds" — explicitly framed as uncovered paths, not liability-bearing
   recommendations.
5. **Friction: capture everything relevant — 12 fields stand.** BUT the whole
   ask→advise flow needs refactoring: today's single monolithic run takes ~5
   minutes of API calls. Target UX: scoping answers → instant eligibility
   pre-read (deterministic, no LLM: gates evaluate against term records in
   milliseconds) → the narrative memo generated async/streamed after. The
   deterministic eligibility matrix becomes the FAST first answer; prose
   becomes the slow second one.
6. **SCALE IS A FIRST-CLASS SCOPING AXIS.** "How much are you looking for?"
   routes the entire instrument universe before anything else: a founder
   needing EUR 20M+ must never be shown the EUR 300-500k grant world as the
   headline. Ticket bands and the universes they open (approximate, to be
   verified per term record):
   - **< EUR 0.5M** — national micro-grants, de minimis-based schemes,
     innovation vouchers, JEI/startup-innovativa tax relief.
   - **EUR 0.5-2.5M** — EIC Accelerator grant component, national innovation
     grants (i-Nov), guarantee-backed bank loans, NDB direct loans.
   - **EUR 2.5-15M** — EIC blended (grant+equity), EIB venture debt, larger
     GBER R&D projects, CDP/FNI direct tickets, Innovation Fund small-scale.
   - **EUR 15-50M** — EIB growth/quasi-equity, Innovation Fund, IPCEI
     participation, InvestEU-backed institutional rounds, ETCI-anchored funds.
   - **> EUR 50M** — IPCEI waves, Innovation Fund large-scale, EIB project
     finance, sovereign-anchored consortia; timeline in years, co-financing
     shares large, jurisdiction commitments heavy.
   L1.9 is therefore promoted to the FIRST question after the borrower model,
   and the eligibility engine filters the instrument universe by band before
   evaluating gates.
7. **Pilot case: Mistral AI** (famous, industrial-scale, raising state-linked
   capital at EUR 10M+ scale) — run as baseline on the current memo to expose
   the scale-routing gap, then as the reference case for the refactored flow.

## 4. Open questions for the user

1. Layer 1 is 12 fields — acceptable friction, or cut to 8? (Candidates to
   defer to Layer 2: L1.6 ownership detail, L1.10 co-financing, L1.12.)
2. The undertaking-in-difficulty question is intrusive but decisive — ask
   plainly, soften to "unsure" default, or move behind "grants selected"?
3. For originators (L1.7), is advising the PARTNER-bank route in scope, or do
   we only route the company's own applications?
4. Should the memo refuse to advise on markets where G1 fails and L1.3 = no
   ("we do not advise pursuing German schemes without German presence"), or
   still show the door with the structural to-do?
5. Validation: run the 12 fields past 2-3 real founders (incl. the Cenotian
   case) before wiring anything.

## 5. Relation to memo_vision.md

`memo_vision.md` Part 1 (memo structure) is ON HOLD. This document is the
active workstream: the eligibility matrix defined here becomes the memo's
centrepiece when memo work resumes — it likely REPLACES some dreamed sections
rather than adding to them (specific beats broad).
