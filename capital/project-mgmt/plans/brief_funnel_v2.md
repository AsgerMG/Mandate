# Brief Funnel v2 — from generic screen to project-specific memo

*Scoped 2026-07-26. Supersedes the Phase 3C half of `intake_scoping.md` §2 Layer 2.
Memo shape is unchanged: the live 4-part `IntelligenceReport` in `types.ts`.*

## The problem, precisely

The brief reads generic because the adaptive round can only ask about **12
pre-declared fields**. `gateReach.ts:59` drops any gate whose `intakeField` is
not a key of `FIELD_ENUM_HINTS`, and `openFieldsForShortlist()` then hands the
writer a set of enum answers rather than anything about the company's actual
project.

Two things follow, and the second is the real one:

1. **487 gates across 129 instruments have `intake_field='none'`** and are
   invisible to question generation. They are dominated by
   `G5_use_of_funds` (214) and `G6_conditionality` (107) — exactly the
   "what will this company actually do" layer.

2. **More importantly, collapsing a gate to an enum destroys the specificity
   that is already in its `requirement` text**, even when the gate *does* map
   to a generic field. `eic_accelerator` (645 events, EUR 1.5B) is the proof:
   zero `none`-gates, zero clauses, yet its gate text reads
   *"Technology must be at TRL 5-6 at entry with a credible path to market,
   not pure research"* and *"Small mid-caps can apply for equity investment
   only, not the grant component"*. Those became `developmentStage` and
   `borrowerModel` — four coarse options each.

**So: source project questions from gate `requirement` text, not from the
`intake_field='none'` subset.** Coverage then goes from 52% of instruments
(99% of euros) to **322 of 322 instruments and 100% of euros** — 3,991 of
4,018 gates carry substantive text.

## Shape of the funnel

Three gates, then the memo. Unchanged from what is live except for Stage 2b
and Stage 3.

```
Stage 1  Deterministic screen      ~11 easy fields          (unchanged)
Stage 2  ONE adaptive panel        8-10 questions           (2a keeps, 2b is new)
           2a  ~4 generic gate-closers   -> EligibilityAnswers
           2b  ~5 project questions      -> projectAnswers  [NEW]
Stage 3  Ease ranking               clearance + precedent   [NEW]
Stage 4  Memo                       live 4-part shape       (writer newly grounded)
```

### Stage 1 — Deterministic screen (keep as-is)

`company, description, country, companyType, capitalSought, targetMarkets,
ticketBand, borrowerModel, entityCountries, fteBand, developmentStage`.

All fast, all easy, all answerable without documents. This stays the wide top
of the funnel and continues to drive `computeVerdict()`. No change.

### Stage 2a — Generic gate-closers (keep, but cap tighter)

Existing `openFieldsForShortlist()` → `generateGroundedRound()`, unchanged
mechanism. Cap drops from 8 to **~4**, ranked by live `reachPct`, to make room
for 2b. Answers remain strict `EligibilityAnswers` values, so the
deterministic verdict engine keeps its guarantees.

### Stage 2b — Project questions (new)

**Source.** For the founder's ranked candidate shortlist, take the
`requirement` text of *every* gate, irrespective of `intake_field`.

**Selection.** Rank candidate gate texts by, in order:

1. **Shortlist weight** — event-weighted share of candidates carrying it.
2. **Discriminating power** — prefer text that *splits* the shortlist. A
   requirement all five top candidates share tells the founder nothing about
   which door to pick; one that separates them is worth a question. This is
   the entropy rule from `advisory_pipeline.md` Stage C, applied to prose
   rather than enums.
3. **Not already answered** — skip anything the free-text description or a
   Stage 1 answer already settles.

**Generation.** Model writes ONE question per selected requirement, plus
3-5 options derived from that requirement's own wording, always with a
"None of these" escape and an optional free-text box. The prompt carries the
verbatim quote and forbids asserting anything the quote does not support
(same discipline as the current grounded round).

**Storage — the load-bearing invariant.** Answers land in a new
`projectAnswers: ProjectAnswer[]`, never in `EligibilityAnswers`:

```ts
export interface ProjectAnswer {
  instrumentId: string;      // which fund's text prompted this
  gateId: number;            // eligibility_gates.id — the citation anchor
  question: string;
  answer: string;            // a generated option, or free text
  quote: string;             // verbatim requirement text
  locator?: string;          // doc + article, when the gate carries one
}
```

`computeVerdict()` must not read `projectAnswers`. The deterministic engine
stays deterministic; these answers are **writer context and ease-scoring
input only**. This is what keeps a model-written option from silently
flipping a legal eligibility verdict.

### Stage 3 — Ease ranking (new)

Today `selectLeafInstruments()` ranks on exact-country match → ticket
proximity → `eventCount`. Nothing models *ease*. Per the decision taken,
ease combines two signals:

```
clearance(i)  = gates provably met / gates total        # unknown counts against
precedent(i)  = comparable companies in corpus that drew from i,
                comparable = subsector ∧ size band ∧ country ∈ (home ∪ targets),
                log1p-normalised across the shortlist

ease(i) = 0.6 * clearance(i) + 0.4 * precedent(i)
```

Existing country/ticket logic becomes the tie-break, not the primary sort.
Top 5 by `ease` become `institutions`.

**Both components render in the row**, and each row carries a one-line
`whyEasy`, so the ranking is legible rather than an oracle:

> *"You clear 9 of 10 documented gates; 23 comparable German deep-tech SMEs
> drew from it since 2021."*

Weights are a starting point to tune against real runs, not a finding.

### Stage 4 — Memo (shape unchanged)

The live 4-part `IntelligenceReport`: `bottomLine` / 5 `institutions` /
`positioning` / `stateOfPlay` / `caveats`, ~700 words, plus the code-built
`eligibilityScreen`. No structural change.

Specificity arrives through context, not through a new section: the writer
now receives `projectAnswers` with their quotes and citations. Two rules for
the prompt:

- Every claim about the **company's project** traces to a `projectAnswer` or
  the founder's description.
- Every claim about a **fund** traces to a gate or clause citation.

Register unchanged: public-awards intelligence, never urgency.

## Build waves

| Wave | Work | Done when |
|---|---|---|
| 1 | Widen `openFieldsForShortlist()` to return raw gate text alongside enum fields; add discriminating-power scoring | Unit-tested selection over a real shortlist; no UX change yet |
| 2 | `ProjectAnswer` type + generator + panel rendering (generated options, free-text escape) | 8-10 mixed questions render; answers persist; `computeVerdict()` provably untouched |
| 3 | `easeScore()`, re-rank `institutions`, `whyEasy` line | Top 5 changes demonstrably vs fit-only ranking on 5 test companies |
| 4 | Writer prompt grounding + citation rules | Memo cites project answers; live runs reviewed against the two rules above |

## Build status (2026-07-26)

All four waves implemented. `tsc`, `eslint` and `next build` green.

**Two findings from execution that changed the design:**

1. **All 4,018 gates have a NULL `value_spec`**, so `eligibility.ts`'s
   `evaluateGenericGates()` never fires and true met/unmet is not computable
   for any instrument. The `value` column is inconsistent free text
   ("Norway", "SME", "€0.5M–€5M per partner", "StateAidObjectiveGberArt25")
   and would need per-field normalisation before a comparator could read it.
   Ease therefore scores `resolved` (share of a fund's documented gates the
   founder has answered) rather than `clearance`, and every founder-facing
   string says "answered", never "cleared". **Populating `value_spec` in the
   ETL is the single highest-value unlock here**: it turns the ranking from
   coverage into genuine qualification and makes the whole Stage D verdict
   real. See the honesty note at the top of `lib/intelligence/ease.ts`.

2. Selection needed two guards found only by running it. Unweighted, the
   first live pass returned eight questions from one instrument, all
   geographic exclusion boilerplate ("established in Russia... Belarus...
   China"). Fixed with `FAMILY_WEIGHT` (G5 use-of-funds and G1 nexus lead),
   a per-instrument cap, a per-instrument-per-family cap (two near-identical
   "eligible project costs" questions otherwise), and dropping
   `entityCountries` gates the first page already covers.

**Verified:** the deterministic spine end to end on a real shortlist
(computeVerdict → 6 candidates → 4 generic + 5 project questions across 4
instruments and 2 families → ease re-ranking with correct `whyEasy` lines),
and the panel via a scripted walkthrough: questions render with their fund's
verbatim quote, "None of these" reveals free text, both answers post with
citation anchors, and the `eligibility` payload carries only the four
deterministic enums with zero project text.

**Live-verified 2026-07-26** (4 Haiku calls + 1 full memo run, ~1m42s).
Three bugs that only a live run could have found:

3. **The feature was dead on arrival.** `output_config.format.schema` rejects
   `minItems`/`maxItems` above 1 ("For 'array' type, 'minItems' values other
   than 0 or 1 are not supported"). `generateProjectQuestions()` threw on
   every call and its `catch` returned `[]`, so the panel would have silently
   shown zero project questions in production, with nothing in the UI to
   suggest anything was wrong. Range is now enforced by prompt + post-process.

4. **"One question per key, exactly" overrode the content rule** and produced
   "What is Vyoma's legal status as an organisation?" — settled on screen 1.
   The prompt now instructs the model to OMIT a key whose requirement is only
   about legal form, applicant category, headcount or country, and says four
   sharp questions beat five with a wasted one. Result: the dud disappeared.

5. **The documentation-depth risk listed below actually fired.** An Estonian
   equity scheme scored 5/6 = 0.83 and ranked SECOND for a German company,
   forcing the writer to apologise inside the row it was handed ("you have no
   stated Estonian establishment, so eligibility here is unproven"). Fixed
   with `RESOLVED_SHRINKAGE = 5` (5/6 -> 5/11 = 0.45; 16/20 -> 16/25 = 0.64),
   so depth of documentation now counts in an instrument's favour. It drops
   from rank 2 to rank 6 and out of the table.

Also added an off-country penalty for national schemes outside the founder's
usable countries. It could not fire on this case because of a **data bug worth
fixing in the ETL**: `satr_ee_equity` (4 events) and `satr_lt_equity` (36
events) are labelled `country = 'EU'` while their `_rnd` siblings correctly
carry `EE`/`LT`. Two rows, but the penalty is inert for them until fixed.

Confirmed working in the live memo: project answers reach the prose
("your TRL 6-7 stage sits inside its TRL 5-8 mandate"; "your stated use, R&D
to develop new technology, matches GBER Art. 25 R&D aid"), and every
institution row carries its `whyEasy` line.

## Stage 5 — Thematic fund matching + option specificity (2026-07-26, second pass)

`lib/intelligence/relevance.ts` (new).

**The matching bug.** `selectLeafInstruments()` ranked the leaves inside a
`source_family_bucket` by `event_count`. But `horizon_eu_partnership` holds
nine thematically unrelated Joint Undertakings, so CHP (health, 1,665 events)
and IHI (health, 1,515) were handed to **every** founder, and EUSPA (space,
361) was unreachable for a satellite company. Worse, that channel was often
never selected at all: channel choice is peer-driven (`fieldChannels`) plus a
fixed default list, neither of which knows what the company does.

Two fixes: (a) `themeRelevance()` scores the founder's description against each
instrument's own thematic gate text, IDF-weighted, and orders leaves within a
bucket; (b) `thematicChannelTopUp()` pulls in up to 2 whole channels that hold
a near-best thematic match, placed FIRST so `slice(0, DISPLAY_CAP)` cannot
truncate them away.

**Honest result, measured on four domains** (baseline: 0 of 4 correct, all got
CHP/IHI):

| domain | picked | verdict |
|---|---|---|
| rail | `europes_rail` | correct |
| health | `gh_edctp3` | correct |
| space | `sesar_ju` | near-tie, EUSPA lost on event count |
| aviation | none | clean miss, no false positive |

This is the ceiling of lexical matching. Instrument names are unusable acronyms
("CHP", "IHI", "Gh Edctp3") and the thematic signal is one sentence per fund,
sometimes absent. **The real fix is `eligibility_embeddings`, which already
exists in Postgres with pgvector installed and 0 rows** — populate it and swap
`themeRelevance()` for a cosine query; everything downstream stands.

**Bugs found and fixed while building this** (each caught only by running it):
- Relevance was sorted BEFORE country fit, which handed a German founder two
  Latvian Altum loans and a question about COVID-19 working capital. Country
  fit now always wins; theme only breaks ties between reachable leaves.
- The `if (!candidates.length) candidates = all` fallback relaxed country AND
  capital type together. Now graded: country+capital, then country, then all.
- Stem matches scored `min()` of both IDFs, and a query word absent from every
  fund ("railway") has IDF 0, so every stem match was worth exactly nothing.
- Hyphens did not split, so "space-traffic" could never match "space".
- `G1_nexus` is overwhelmingly geography boilerplate and drowned the theme;
  index `G5_use_of_funds` only, minus an admin/cost anti-pattern (CHP's
  solid-oxide COST rule made "solid tumours" match the hydrogen fund at 1.00).
- A `MIN_RAW_HIT` floor was needed because best-normalisation turns any stray
  single overlap into a confident 1.00.

**Option specificity.** The prompt now bans vague options ("a mix of the
above", "other", "not sure"), requires the company's own technology to be named
in the question, and requires literal values (TRL bands, percentages) rather
than paraphrases. `VAGUE_OPTION` strips survivors server-side.
`MAX_PER_INSTRUMENT` dropped 2 -> 1: EIC Accelerator was producing two
near-identical TRL questions from gates in different families, which the
per-family cap could not catch, and one question per fund buys better shortlist
coverage anyway.

## Risks

- **Model-written options can be subtly wrong.** Mitigated by the storage
  invariant (Stage 2b) — a bad option degrades memo prose, it cannot flip an
  eligibility verdict.
- **Panel length.** 8-10 mandatory questions is the agreed budget; watch
  completion rate once live.
- **`clearance` rewards well-documented instruments.** An instrument with 3
  extracted gates can score 100% while one with 15 scores 80%. Normalise by
  documentation depth, or floor the gate count, before trusting the sort.
- **Weights are guesses.** 0.6/0.4 needs tuning against real founder runs.

## Open

- Tune weights and the `clearance` depth-normalisation after wave 3.
- `eic_accelerator` carries no `application`/`obligation` clauses at all.
  Worth a targeted extraction pass given its weight (645 events, EUR 1.5B).
