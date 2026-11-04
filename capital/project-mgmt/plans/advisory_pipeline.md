# The Advisory Pipeline

*2026-07-10. The master plan. Consolidates `intake_scoping.md` (field detail)
and parks `memo_vision.md` (layout) under one end-to-end flow. The bar: what a
top-tier public-affairs team does for a client seeking public capital — desk
research before the first question, a scoping interview that never asks what
it can look up, a qualification verdict grounded in the legal texts, a deal
architecture, and standing counsel on what is coming. Every stage names which
database answers it.*

**The three assets and their roles**

| Asset | Contains | Answers |
|---|---|---|
| Events DB (`db.sqlite` → `companies_index.json`) | 146,911 companies, 290k funding events, channels, amounts, years | "What did comparable entities actually receive, through which doors, at what scale?" (evidence) |
| Signals DB (`signals.sqlite` → digest + typed signals) | 18k+ articles, 1,632 typed signals, 527 entity links, embedded corpus | "What is changing, who decides, what is coming?" (anticipation) |
| Terms corpus (`instrument_docs/` + `instrument_terms/`) | Primary legal/programme texts + per-gate structured terms, citable | "Does THIS company qualify, under exactly which conditions?" (verdict) |

The product is the join: evidence × verdict × anticipation, per company.

---

## Stage A — Pre-brief (zero questions asked)

*Input: company name + country. Runtime: <1s, deterministic.*

Desk research before the interview, as a real team would:

- **Events DB**: traced footprint (channels, amounts, years), prior-aid picture
  (feeds de minimis headroom), STEP seal, subsector, same-subsector funded
  peers, same-country entry patterns.
- **Signals DB**: entity-linked press mentions of the company (article_entities).
- Output: a **pre-brief card** shown to the founder — "here is what the public
  record says about you" — to confirm or correct. Nothing we can look up is
  ever asked.

## Stage B — Structured scoping (the interview, ≤2 minutes)

*The 12 deterministic fields (detail: intake_scoping.md §2), in THIS order —
the first two answers prune the instrument universe hardest:*

1. **Who ends up owing the money?** (borrower model, 4-way) — routes between
   the operating-company funnel and the intermediary/originator funnel.
2. **How much are you looking for, and when?** (ticket band + horizon) — a
   EUR 20M+ ask must never see the EUR 300k grant world as its headline
   (bands and universes: intake_scoping.md §3c.6).
3. Incorporation + entity map + "would you open a local entity?"
4. Target markets for raising public capital.
5. SME triple (FTE/turnover/balance-sheet bands) + ownership links (≥25%,
   corporate/fund, non-EU control).
6. Use of funds (R&D / first plant / capacity / market entry / working
   capital / portfolio).
7. Co-financing capacity band.
8. Financial-standing screen (founded year; accumulated-losses-vs-share-capital
   proxy for undertaking-in-difficulty).
9. Conditionality appetite (local entity, geographic commitments, state on
   cap table, job commitments).

Plus the existing archetype + capital-type pickers. Output: draft
`EligibilityProfile`.

## Stage C — Adaptive interrogation (the expert follow-up)

*LLM (Haiku), ≤4 questions, conditioned on Stages A+B. Hard rule: a question
is only asked if its answer can move at least one instrument between
qualified / blocked / unknown (the entropy rule — no curiosity questions).*

Branch examples:
- Originator/lender → license or partner bank? risk retention? underlying
  asset type, tickets, geography? (splits EIF counter-guarantee vs
  securitisation window vs national institute)
- First plant / capacity → capex location shortlist (regional-aid map prices
  the same project differently by region).
- Near an SME threshold → the precise linked-enterprise question.
- In-difficulty = unsure → one balance-sheet clarifier; else auto-flag
  "verify with accountant before any GBER application".

Output: final `EligibilityProfile` (+ confidence per field: attested /
inferred / unknown).

## Stage D — The verdict (deterministic, instant, no LLM)

*The centrepiece. Runtime target: <1s. This is what kills the 5-minute wait —
the founder gets the qualification answer immediately; prose streams after.*

1. **Universe filter**: scale band ∧ borrower model ∧ geography (entity map +
   willingness) ∧ capital types → candidate instruments from the terms corpus.
2. **Gate evaluation**: each candidate's `gates[]` against the profile →
   per-gate **met / not-met / unknown**; each not-met carries its **cure**
   (e.g. "incorporate GmbH or Betriebsstätte"), each unknown its
   **verification step**; each gate its **citation** (doc + article).
3. **Obligations preview**: what qualifying would bind them to — jurisdiction
   of investment, purpose ties, reporting, co-financing shares.
4. Output: `EligibilityMatrix` — the "you qualify for X given these terms;
   this requires investing N% in jurisdiction Y" table, only asserting
   `verified: llm_2pass` terms as fact, rendering the rest as
   "verify: <claim> (source, art.)".

*Depends on: term records populated for the confirmed top-10 instruments
(extraction pipeline over `instrument_docs/`: extractor proposes gate + exact
quote + locator → fresh-eyes second model judges strict entailment →
`llm_2pass`). Wave-2 documents still being hunted; instruments whose primary
text remains unreachable are served from the unstructured corpus and marked
as such — never dressed as verified.*

## Stage E — The report (async, streamed while the founder reads the matrix)

Structure (register: public-awards intelligence, never urgency):

1. **Verdict** — the matrix, rendered, with cures and obligations.
2. **Deal architecture, per qualified instrument** — who applies where, with
   whom (house bank, accredited intermediary, consortium partner), realistic
   timeline, what the money requires. For originators: the partner-bank path
   as grounded leads ("things to investigate", cited to the EIF/InvestEU
   product docs), per the liability posture.
3. **Evidence** — events DB: comparables who used each qualified door (names,
   amounts, years), entrant patterns for target markets. The proof the door
   opens.
4. **The road ahead** — signals DB, tailored (capture-all, tailor-late):
   scale-and-sector-relevant topics, dated watch items, new vehicles forming.
5. **Caveats** — committed-not-disbursed, register lag, verification notes.

## Stage F — Standing counsel (the retainer, Branch 2 fully activated)

The report ends with a **monitoring brief**, regenerable on every corpus
refresh:

- **What to follow**: the topic streams relevant to their qualified + almost-
  qualified instruments (a company one cure away from IPCEI follows the IPCEI
  wave calendar).
- **Who to follow**: from `stakeholder_appointment` signals + the deciding
  institutions per instrument (roles first, names where press-sourced).
- **What to manage**: deadline calendar (term-record dates + pipeline
  signals + legislative milestones), obligations already accepted, de minimis
  headroom running down.
- Cadence: `make intelligence` refresh (ingest→gate→hydrate→signals→embed→
  digest) currently manual-sequential; becomes one command, then scheduled.

---

## The joins that make the two databases "speak"

| Join | Mechanics | Serves |
|---|---|---|
| J1: company ↔ press | `article_entities.company_id` ↔ events DB ids (canonical matcher) | Pre-brief mentions; per-comparable signal footnotes |
| J2: instrument ↔ evidence | term record id ↔ events channel/source families | "412 companies used this door; median ticket, median lag" under each verdict row |
| J3: instrument ↔ anticipation | term record topics ↔ signal types + digest topics | Watch items attached to the instruments that survived Stage D |
| J4: profile ↔ prior aid | events DB traced aid ↔ de minimis gate | Headroom pre-fill, founder confirms |

## Model governance

| Role | Model | Guardrails |
|---|---|---|
| Intake questioner (C) | Haiku | entropy rule; ≤4 questions; bands not essays |
| Term extractor | Sonnet | must quote exact span + locator; no paraphrase-as-fact |
| Term verifier | Sonnet, fresh context | strict entailment vs cited span only; disagreement → draft |
| Report writer (E) | Sonnet | asserts only matrix facts + digest lines; register rules; no invention; deDash |
| Eligibility engine (D) | **no model** | pure functions over term records — the trust anchor |

## Latency budget

| Stage | Target |
|---|---|
| A pre-brief | <1s |
| B form | founder-paced (~2 min) |
| C questions | <10s to generate |
| D verdict | **<1s** (the product moment) |
| E report | streamed, ≤90s to complete |

## Build waves (each with a definition of done)

- **W1 — Terms engine**: extraction+verification pipeline over instrument_docs;
  top-10 term records at `llm_2pass`; eligibility evaluator (pure TS/Python) +
  `EligibilityMatrix` type. DoD: Mistral profile → correct scale-band universe
  (no sub-EUR-2.5M instruments as headline) with cited gates, in <1s.
- **W2 — Intake refactor**: Stage A pre-brief card; Stage B reordered form;
  Stage C entropy-ruled questioner; profile plumbed end-to-end. DoD: full
  Cenotian run routes to intermediary funnel with the partner-bank leads
  section.
- **W3 — Report + joins**: Stage E structure over the matrix; J1-J4 joins;
  typed signals into the road-ahead; harvest date fix. DoD: Mistral +
  Cenotian reports pass a rubric check (every asserted term cited, every
  watch item traceable, register clean).
- **W4 — Standing counsel**: monitoring brief; one-command refresh; cadence.
  DoD: two consecutive weekly refreshes change the watch items without
  touching the verdict.

Acceptance cases throughout: **Mistral** (EUR 20M+ operating company, scale
routing) and **Cenotian** (originator, intermediary funnel, target markets
DE/IT/FR, entity gates).
