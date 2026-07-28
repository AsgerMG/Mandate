# Brief Quality Plan — end-to-end

**Written 2026-07-27.** Goal: turn Regina's brief from something an agentic browser
could approximate into something it structurally cannot produce.

Every phase below states **what changes in the brief**. A phase that can't answer
that question doesn't belong here.

---

## 0. Where we are (measured, not assumed)

**Done this session — retrieval shape.** Briefs were surface-level because context
was one ~1,300-char window of each of 65 laws, 83% of it forced by the canon sweep.
Fixed via facet decomposition, a within-document depth pass, canon stubs, a
`rerank-2.5` cross-encoder, and an authority quota. Depth ratio 0.98 → 0.64;
binding-law passages 9 → 21; DORA/AI Act/GDPR now get 5-6 passages each.

**Ruled out, with evidence.** `voyage-law-2` does not fix authority skew — tested on
a real 3-law/3-commentary mix, it ranked commentary first exactly as
`voyage-4-large` did, with less than half the score separation (0.047 vs 0.105). The
skew is a query-document mismatch, not an embedder weakness. No re-embed.

**The remaining problem is the corpus, not the prompt.** The prompt already asks for
dated watchlists, named stakeholders, and commercial tie-ins. The data can't support
those answers yet:

| Fact | Value | What it breaks |
|---|---|---|
| `date_in_force` populated | **0 of 4,781** | Every "what applies when" claim |
| `lifecycle_stage = UNKNOWN` | **3,893 of 4,781 (81%)** | "Is this current?" |
| Case law / judgments | **0** | Enforcement precedent; "what to expect" |
| `eurlex` docs typed `OTHER` | **459** | Real acts sorted into the commentary tier |
| `oeil` (pipeline layer) | **3 documents** | "Which files are moving" |
| `eurlex_oj_l` (newly adopted law) | **11 documents** | Newly adopted law |
| `enrichments` | **0 rows** | A whole designed layer, unused |
| Sector tags | 1,721 of 4,781 (36%) | Sector-aware retrieval |
| Binding law as share of corpus | **135 of 4,781 (2.8%)** | Everything |

Corpus composition: 58% `OTHER` + 19% `PRESS` = **77% press/commentary**.

**Explicit non-goal: adding press volume.** This reverses the earlier
presscorner-builder recommendation. At 77% press, 130k more press documents is the
wrong direction. Only the institutional slice (Council/CJEU/Eurostat via RAPID)
has value, and it ranks below everything in Phases 1-3.

---

## Phase 1 — The authoritative layer (highest value)

All of Phase 1 reuses the SPARQL + Cellar path that already works in
`etl/adapters/eurlex.py`. No new dependencies.

### 1.1 Case law (CELEX sector 6)

`etl/adapters/eurlex.py:105` filters `STRSTARTS(?celex, "3") || STRSTARTS(?celex, "5")`.
Sector 6 is EU case law and is simply excluded. **Verified live: 721 judgments**
matching three tech terms since 2020, reachable through the same endpoint.

- Add sector 6 to discovery behind its own source key (`eurlex_case_law`) so its
  volume and cursor are separately observable, rather than widening `eurlex` and
  silently changing what that source means.
- Extend `_classify_type()` for sector-6 CELEX descriptors (`CJ` judgment,
  `CO` order, `CC` AG opinion) → new `DocumentType.JUDGMENT`.
- Judgments are never `IN_FORCE`; stage them `ADOPTED` (decided, standing).

**Brief change:** the Compliance table's *Why / Trigger* column can cite what a
court actually held, and the political-landscape section can cite enforcement
outcomes instead of press speculation about them.

**Follow-on found by verifying, not by planning.** Ingesting and embedding case
law changed retrieval by exactly nothing — the panel's shape was byte-identical
to the baseline. Judgments were retrievable (a court-shaped query returned 4 in
its top 10) but the *profile* query returned zero, because a ruling reads
"Case C-123/24, X v Y: Judgment of the Court…" and has no resemblance to a
company description. A new **`enforcement` facet** in `retrieval_queries()`,
phrased the way rulings are phrased, fixed it: 12 judgment passages across 3
real rulings (including WhatsApp Ireland, Grand Chamber) now reach the brief.
The general lesson for every later phase here: a source is not integrated when
it is ingested, only when something retrieves it.

### 1.2 Dates and lifecycle from Cellar

This is the user-requested item: **for legal documents in force, record the date.**

Cellar exposes the date fields natively; we currently request none of them.

**Implemented 2026-07-27** in `etl/enrichment/lifecycle.py`. Three things about the
source data were only discoverable by querying it, and all three would have
produced quietly wrong output:

- **Virtuoso requires typed literals.** Cellar does not match a plain literal
  `"32024R1689"` against the stored `"32024R1689"^^xsd:string`. The untyped form
  returns **zero rows, not an error**. This was already an unnoticed live bug:
  `eurlex_key_acts._lookup_dates()` used the untyped form, so all **55
  foundational acts** (GDPR, AI Act, DMA, DSA) sat in the corpus with
  `date_document` NULL. Fixed there too.
- **`entry-into-force` is multi-valued.** The AI Act returns 2024-08-01,
  2025-02-02, 2025-08-02, 2026-08-02 … — entry into force followed by each
  tranche of obligations. Collapsing that to one date discards the entire staged
  compliance picture, which for the AI Act *is* the compliance picture.
- **`end-of-validity` uses 9999-12-31 as a "no end" sentinel.** Stored naively,
  every act in force appears to expire in the year 9999 — a real-looking date to
  both the model and any date filter.

`resource_legal_in-force` is a direct boolean flag, which is a better repeal
signal than inferring from dates, and is used first.
- Populate `Document.date_in_force` and `date_end_validity` (both already exist).
- **Add `Document.date_application`.** This is the one addition to the user's
  instruction, and it matters more than `date_in_force` does. In EU law *in force ≠
  applicable*: the AI Act entered into force 1 Aug 2024 and applies in stages
  through 2027. A brief that treats entry-into-force as "this binds you now" is
  wrong about the single most important instrument in the corpus. Staged
  per-provision dates go in `extra` as `{"application_stages": [{date, scope}]}`.

**Lifecycle derivation** (deterministic, from dates + CELEX sector — no LLM):

| Condition | Stage |
|---|---|
| `date_end_validity` in the past, or a `repeals` relation targets it | `REPEALED` |
| Sector 3, `date_application` ≤ today (or `date_in_force` ≤ today when no application date) | `IN_FORCE` |
| Sector 3, adopted but `date_application` in the future | `ADOPTED` |
| Sector 5 with `PC` descriptor (tabled proposal) | `PROPOSED` |
| Amended by a later act (relation, Phase 4.2) | `AMENDED` |
| Consultation sources | `CONSULTATION` |
| Anything undated | `UNKNOWN` — kept honest, not guessed |

The enum already carries `ADOPTED` ("adopted but not yet applicable") and `AMENDED`,
so no enum change is needed — the vocabulary was designed for this and never filled.

Run as a backfill over existing documents plus a step in `refresh`, so it applies to
the 4,781 already ingested rather than only to new arrivals.

**Brief change:** the **Watchlist** becomes dated fact rather than inference — "AI
Act Art. 6 high-risk obligations apply from 2 Aug 2026" instead of "obligations are
expected to phase in." Verdicts can distinguish *binds you today* from *binds you in
14 months*, which is the difference between a compliance brief and a summary.

### 1.3 Fix the starved sources — **diagnosed, two independent causes**

**Cause A — the incremental cursor traps a bad first run (affects every source).**
`pipeline._since()` returns `last_run_at` once a source has run, so only the
*first* run ever sees the full `backfill_days` window. If that run was truncated
(`--limit`), crashed partway, or ran while discovery was misconfigured, the
history it missed is permanently unreachable: every later run asks only for
documents newer than that partial run. The source then looks perfectly healthy —
runs daily, no errors, returns almost nothing.

Reproduced deliberately on 2026-07-27: `regina run eurlex_case_law --limit 200`
ingested 200 judgments and set the cursor; the very next *unlimited* run
discovered **0**. This is the same mechanism behind the `eurlex` incident the
backlog records, which was fixed at the time by manually nulling `last_run_at` —
a manual database edit, which is why it recurred.

Fixed properly: `--full` on `regina run` and `regina refresh` re-discovers the
whole window, ignoring the cursor. Idempotent (the pipeline dedupes on
`(source, external_id)` and only writes a version when content changed), so
recovery is now a supported operation rather than a DB edit.

**Cause B — `oeil` was filtered far too narrowly (specific to that source).**
Not the cursor: of 101 procedures the API listed for 2026, only **3** were `COD`,
which is exactly how many documents the source held. Two changes:
`YEARS_BACK 2 → 5` (an ordinary legislative procedure runs 2-4 years, so a 2-year
window sees the middle of a file's life and misses both ends), and
`TRACKED_TYPES` widened from `(COD, CNS)` to include `DEA`, `RSP`, `INI`. **`DEA`
is delegated and implementing acts — 16 of those same 101 procedures, all
discarded** — which is where most operative detail under the AI Act, CRA and DORA
actually arrives. That partially delivers Phase 3.1 from a source already built.

The tech-relevance title filter still applies on top, so this widens what is
*eligible*, not how topical the corpus is.

**Brief change:** `oeil` *is* the political-landscape data layer. With it
populated, "where does this file sit right now" stops being a press-derived
guess — and "the Commission will specify further" gains a named delegated act.

### 1.4 Consolidated texts for the canon

We hold original acts, so GDPR-as-amended is not what gets cited. Fetch consolidated
manifestations for the 55 `eurlex_key_acts` CELEX ids and make the consolidated
version the current one.

**Brief change:** quoted provisions are the ones in force today.

---

## Phase 2 — Make what we already hold legible

No new sources. Highest quality-per-hour in the plan, and it repairs a fix already
shipped.

### 2.1 Fix the 459 misclassified `eurlex` documents

459 real EU legal acts are typed `OTHER`, and the authority quota shipped this
session puts `other` in the **commentary** tier — so the metadata is actively
sabotaging the fix. Diagnose which CELEX descriptor patterns `_classify_type()`
misses (likely `SC` staff working documents, `DC`, `AC`, `TA`, multi-letter
descriptors) and correct them, then re-run over the existing corpus.

**Brief change:** the depth budget stops being spent on documents mislabelled as
commentary; binding law reaches context in the proportion the quota intends.

### 2.2 A document-type vocabulary that matches reality

2,774 documents share `OTHER` — newsletter, verbatim debate, impact assessment,
staff working document, judgment, all indistinguishable. Both the authority quota
and the prompt's source-weighting reason over this field.

Add: `JUDGMENT`, `ENFORCEMENT_DECISION`, `IMPACT_ASSESSMENT`, `STAFF_WORKING_DOC`,
`NEWSLETTER`, `VERBATIM_DEBATE`, `STANDARD`. Derive from CELEX descriptor where
available, else source key (the `_PRESS_SOURCE_KEYS` allowlist and
`extra.kind == "verbatim_debate"` already encode most of this by hand — this
promotes those hand-maintained lists into the type system).

Then retire the `kind`/allowlist workarounds in `briefing.py` that exist *only*
because `document_type` couldn't express these distinctions.

**Brief change:** the model can weigh a judgment against a newsletter without
inferring authority from prose style, and `_DEEPEN_QUOTAS` gets real tiers.

### 2.3 Sector classification — ~~gap~~ **withdrawn, this was a misdiagnosis**

The original claim was "1,721 of 4,781 documents carry sector tags, run
`classify_pending` over the rest." That reading was wrong. The classifier's own
tool schema declares sectors as **0-3** items, and its system prompt says
horizontal law "applies broadly and should get zero sectors, not one for every
plausible use case." The 3,059 documents with a policy area and no sector are
therefore *correctly* classified, not skipped — GDPR genuinely has no single
sector.

Genuinely unclassified: **198 documents** with no policy area at all, which are
the newly-ingested case law. Those are worth a cheap Haiku pass; the other 3,059
must be left alone.

### 2.4 `enrichments` — **built 2026-07-27** (`etl/enrichment/summarize.py`)

Scoped to instruments a brief reasons *about* — binding law, case law,
authoritative soft law, proposals — which is 874 candidates rather than 4,781.
Haiku, following classification.py's precedent. Wired into `refresh` and
available as `regina enrich` (with `--dry-run`, which should always be run first
since this is the one enrichment whose cost scales with corpus size).

**And consumed**, which was the thing that would otherwise have made the spend
pointless: `_attach_summaries()` + `build_documents()` now put a one-line
"what this instrument does" header above a retrieved act's passage — emitted only
on a document's *first* block, since the depth pass puts 4-6 passages of the same
act in context and repeating one summary five times would waste the context it
exists to use well.

Original (wrong) framing kept below, because the mistake is the lesson:

> Also mis-scoped originally. The `Enrichment` table is in the schema and nothing
> has ever written to it — there is no `enrich_pending()` anywhere in `etl/`.

Also mis-scoped originally. The `Enrichment` table is in the schema and nothing
has ever written to it — there is no `enrich_pending()` anywhere in `etl/`. This
is a build-from-scratch item (prompt, batching, citation linking back to
passages, cost control), not a command to run.

Scope it deliberately when it is built: per-document LLM summarisation across
4,781 documents is a real bill, and the value is concentrated in the ~450
binding-law documents, not in 3,139 newsletters that already have headlines.

**Brief change (when built):** retrieval can match a dense summary as well as raw
passages, and each table row can carry a one-line "what this instrument does"
without spending context on a full passage.

### 2.5 Cleanup

A source keyed `t` with 0 documents is a test fixture leaked into production.

---

## Phase 3 — The missing institutional layers

New adapters, ranked by what they unlock. Each is independent.

1. **Delegated & implementing acts + comitology register.** Under the AI Act, CRA and
   DORA most operative detail arrives this way. *Brief change:* obligations stop
   ending at "the Commission will specify further."
2. **Harmonised standards** (CEN/CENELEC + their OJ citations). Conformity
   assessment legally turns on these. *Brief change:* a manufacturer brief can name
   the standard that confers presumption of conformity — currently impossible.
3. **Council document register** — trilogue mandates, presidency compromise texts,
   progress reports. *Brief change:* the strategic-play section gets the Council
   position, not just Parliament's and the press's.
4. **EP committee documents** — draft reports, amendments (IMCO/LIBE/ECON).
   *Brief change:* names the actual contested provisions in a live file.
5. **National law text** — Légifrance (**decision needed: PISTE API key**), deepen
   German `bgbl1`. *Brief change:* honest answers for FR/DE markets, which today
   have monitors but no law text.
6. **RAPID institutional press only** (via presscorner-builder), filtered to
   Council/CJEU/Eurostat and run through `DIGITAL_ECONOMY_SUBJECT_TERMS`. Last, and
   deliberately not the journalism bulk.

---

## Phase 4 — Structure and actors

### 4.1 Article-level anchors

Replace character-window chunking with recital/article/paragraph/point units for
legal text; add `Passage.structural_ref` alongside the existing heuristic `heading`.

**Source:** borrow from **eurlex-builder** (MIT, v0.1.1) — its `text_units` table
does exactly this, and its HTML-era detection across six EUR-Lex eras plus PDF
fallback is the hard part. Run it **offline as a structure supplier**, like
`regina export` — not as a runtime dependency in `refresh`. It owns its own
DuckDB/Parquet store, does corpus-by-date-range rather than topical discovery, is
two days old with a single author, and replacing our adapter would discard earned
fixes (Cellar-over-WAF, `cellar_content_url()` percent-encoding, manifestation
negotiation). Borrow the parsing; keep the pipeline.

**Brief change:** citations read "AI Act Art. 6(2)" instead of a char offset, and one
passage carries one obligation — sharper embeddings and precise quoting.

### 4.2 Relation graph

`document_relations` table from eurlex-builder's `relations.parquet`
(`amends`, `repeals`, `consolidates`, `implicitly_repeals`, `based_on`, `cites`).
Feeds the `AMENDED`/`REPEALED` derivation in 1.2.

**Brief change:** the brief can never cite a repealed provision as live, and can say
"GDPR as amended by X" — currently unrepresentable.

### 4.3 EuroVoc concepts

`eurovoc.parquet` closes the open backlog item on replacing title-matching with
concept URIs.

**Brief change:** discovery precision — fewer topically-adjacent documents competing
for depth slots.

### 4.4 Actor table

Promote stakeholders to entities and link across sources: OEIL rapporteurs and shadow
rapporteurs, `ep_verbatim` speakers (the adapter already extracts name + role at
`ep_verbatim.py:98` and discards the structure into free text), Commissioners in
press releases. Then roll-call votes (`howtheyvote.eu`, MIT, already in the backlog)
make positions quantitative.

**Brief change:** the "who-runs-what map" becomes queryable fact — *this* rapporteur
holds *this* file and has said *this* on the record, consistently or not. Unbrowsable
by any stateless agent.

### 4.5 "What changed since we last looked"

428 documents already carry multiple content-hashed versions and nothing reads them.
Add a brief section grounded in diffs: text changed, stage advanced, deadline moved.

**Brief change:** the single most defensible differentiator in this document. No
stateless agent — however capable — can tell you what moved since last week.

### 4.6 Commercial model in the profile

Upside guardrails currently bind to one free-text `competitive_context` answer. Add
structured fields with edges: revenue lines, platform dependencies, third-party
processors, market position.

**Brief change:** "commercial upside" stops being generic regardless of prompt
quality, because there is finally something for it to attach to.

---

## Sequencing

| Order | Work | Why here |
|---|---|---|
| 1 | 1.1 case law + 2.1 misclassification | Biggest shift in the binding-vs-commentary ratio for the least work; 2.1 repairs a fix already shipped |
| 2 | 1.2 dates + lifecycle | The user-requested item; turns the Watchlist into fact |
| 3 | 2.2 type vocabulary + 2.3 sectors | Makes the authority quota and sector filtering real |
| 4 | 1.3 oeil/oj_l + 1.4 consolidated | Fills the pipeline layer and fixes what we quote |
| 5 | 4.2 relations + 4.5 change detection | Currency and memory — the differentiation core |
| 6 | 2.4 enrichments, 4.1 anchors, 4.3 EuroVoc | Quality compounding |
| 7 | Phase 3 adapters, 4.4 actors, 4.6 commercial | Larger, independent tracks |

**Verification throughout:** `regina brief-check` (rotating, uncapped) after each
step, plus `retrieval_stats` — watch `documents_per_passage`, the binding/commentary
type mix, and lifecycle coverage. A real before-brief should be generated *before*
step 1 so there is something to compare against.

**Sequencing trap, learned the hard way 2026-07-27.** Measure only a *settled*
corpus. The first after-brief run was launched while 1,243 newly-backfilled
judgments and 148 OEIL procedures were still unembedded, so it measured a corpus
in a state that will never exist again — the classification, dating and
enforcement-facet changes were live, but two thirds of the case-law layer was
invisible to retrieval. The order has to be: ingest → embed → *then* measure.
A billed comparison run against a half-embedded corpus is money spent on a
number you have to discard.

## Schema changes required

- `Document.date_application` (+ `extra.application_stages`) — 1.2
- `DocumentType` additions — 1.1, 2.2
- `Passage.structural_ref` — 4.1
- `document_relations` table — 4.2
- `actors` + `document_actor` tables — 4.4
- Profile commercial fields — 4.6

`init_db()` is still `create_all` with an empty `data/migrations/`. Phase 1.2 adds a
column to a 4,781-row table on a live Railway database — **this is the point to
introduce Alembic**, which `data/session.py:75` already anticipates ("the constraint
naming convention is already set up for clean autogenerate"). Doing it here is
cheaper than doing it under Phase 4's five-table expansion.

---

## Retrieval: case-law relevance discipline (added 2026-07-27)

User steer, and it was the right call: *"judgments should only be brought in if
super relevant."* Getting this wrong would have been worse than not having case
law at all — a brief that reaches for a tangential ruling reads as rigour while
spending the reader's attention on a holding that doesn't move their decision.

Three layers, because the first two were measured and **neither bound**:

1. **Higher retrieval floor** for the `enforcement` facet (`min_score` 0.55 vs the
   general 0.40, `k` 3). Above the corpus median on purpose: the facet should
   return *nothing* for a profile with no relevant precedent rather than its best
   weak match.
2. **Own depth tier.** Judgments were first placed in the `binding` tier, arguing
   a ruling on what a provision requires is as decisive as the provision's text.
   That conflated *authority* with *relevance*: a regulation either applies to a
   company or it does not, whereas a ruling only matters if it construes a
   provision already under verdict. Now a small dedicated `precedent` share.
3. **A hard global cap** (`_cap_precedent`, 6 passages). Required because a
   fintech profile still reached **21 judgment passages — 32% of substantive
   context** with (1) and (2) in place. Rulings arrive through *every* facet:
   "personal data processing obligations" is a genuinely good match for a
   data-protection judgment at any floor. Case law coming through five doors
   cannot be bounded at any one of them.

| Profile | Judgment passages |
|---|---|
| Fintech (AI + personal data) | 6 of 49 (12%), 4 rulings |
| Consumer health app (AI + sensitive data) | 6 of 54 (11%), 6 rulings |
| Logistics (no AI, no personal data) | **0** |

The prompt now carries a matching `ENFORCEMENT PRECEDENT` rule — a judgment must
construe a provision already under verdict *and* change what this company must
do; "most briefs should cite no case law at all" — plus the fabrication guard,
since the instrument-identity rule has to extend to cases.

## A defect in this plan's own instrumentation

`documents_per_passage`, introduced in the E-series as the depth-collapse signal,
**could not detect a depth collapse.** It counts the ~50 single-passage canon
stubs, which floors it near 0.5 regardless of what retrieval does — measured 0.78
on a profile whose substantive ratio was 0.54. The regression guard built on it
would have passed under total collapse.

Fixed: `substantive_documents_per_passage` and `max_passages_per_document` are now
the signals, computed over non-stub passages only, and the guard asserts on those.
Real depth on the settled corpus: **ratio 0.34-0.54, up to 5-6 passages per
instrument.**

## Corpus, before → after

| | Before | After |
|---|---|---|
| Documents | 4,781 | **6,366** |
| Passages embedded | 76,478 | **108,885 (100%)** |
| Binding law + case law | 135 (2.8%) | **1,548 (24%)** |
| Press + newsletter share | 77% | **47%** |
| `document_type = OTHER` | 2,774 | 141 |
| `date_in_force` populated | 0 | 294 (regulations 96/98) |
| `REPEALED` flagged | 1 | 55 |
| `oeil` pipeline layer | 3 | 148 |
| Case law | 0 | 1,440 |
| Enrichments | 0 | 874 (in progress) |
| Tests | 263 | 322 |

---

# Phase 5 — lifting the ceiling (planned 2026-07-27, nothing started)

The Phase 1-4 work moved the panel **3.80 → 4.11** overall. This phase is derived
from the judge's own critiques of the *after* briefs, not from intuition, so each
item below names the dimension it targets and the score it has to move.

**Judged state after Phase 1-4** (5 matched profiles, 1-5 per dimension):

| Dimension | Score | Read |
|---|---|---|
| relevance | 4.80 | ceiling |
| tone_and_structure | 4.80 | ceiling |
| citation_quality | 4.40 | near ceiling |
| scope_matching | 4.40 | near ceiling |
| prioritization | 4.00 | capped by unresolved hinges |
| political_currency | 3.60 | second-lowest |
| **stakeholder_specificity** | **2.80** | **binding constraint** |

Three dimensions are effectively done. Further prompt work on style or grounding
is diminishing-returns territory — the remaining headroom is concentrated in two
places, and only one of them is a prompt problem.

## 5.0 Widen the measurement before spending on the levers

Do this first, because right now the instrument cannot detect the effects the rest
of this phase is designed to produce.

A 5-profile panel scored 1-5 has a noise floor around ±0.3. Several plausible
real gains (+0.2 on prioritization, say) are therefore unmeasurable — we would
spend on a lever and not be able to tell whether it worked. `EVAL_PANEL`'s own
docstring notes that judge cost does **not** scale with panel size (scores are
batched into one call); only generation does. So widening the panel from 5 to
~10 profiles roughly doubles generation cost per round (≈$3 → ≈$6) while leaving
judge cost flat, and meaningfully tightens the floor.

Caveat to state plainly: widening the panel **resets the baseline**. The 3.80 →
4.11 comparison cannot be extended across a panel change, so the wider panel needs
its own baseline run before any Phase 5 lever lands.

Also worth adding while here: a **second judged run of the same unchanged corpus**,
to measure the judge's own run-to-run variance. We currently assume ±0.3 is noise;
that number is an estimate, not a measurement.

## 5.1 Actor table — the binding constraint (targets stakeholder_specificity 2.80)

Four of five critiques said the same thing in different words: *"stakeholders
remain institutional (AI Office, committees) without named individuals"*,
*"generic (CNIL, AI Office) without named contacts or rapporteurs"*, *"named
contacts (DG CONNECT, ENISA) are still institution-level rather than
individual"*.

This is a data gap wearing a prompt's clothes. SYSTEM_PROMPT already demands the
who-runs-what map and the brief visibly attempts it — it reaches institutions
because that is all the corpus contains.

**Source material, ranked by how much already exists:**

1. **`ep_verbatim` speakers — already parsed and thrown away.** The adapter
   extracts `(speaker, role)` at `ep_verbatim.py:98` and flattens it into passage
   text. Persisting what is already being parsed is the cheapest possible start
   and needs no new upstream.
2. **OEIL rapporteurs, shadow rapporteurs, committee.** 148 procedures now
   ingested. **Needs verification:** the list endpoint returns only
   `id/type/process_id/label`; whether the *detail* response carries rapporteur
   fields has not been checked. Do that before designing around it.
3. **Roll-call votes** (`howtheyvote.eu`, MIT, no auth, already in the backlog).
   Turns positions from rhetoric into a record — "this rapporteur voted against
   this three times" is unbrowsable by any agent.
4. **Commissioners in press releases** — needs entity extraction over text, so
   last and least certain.

**Schema:** `actors` (name, role, institution, political group, external ids) +
`document_actor` (many-to-many with a relation kind: speaker, rapporteur,
shadow, addressee).

**Retrieval:** actors are not passages and should not compete for passage slots.
Attach them as a distinct **stakeholder block** in the brief context, resolved
from the instruments already in scope — so the political-landscape section gets
names for the files it is already discussing, rather than a separate retrieval
pass that could drag in irrelevant people.

**Prompt:** once names exist, tighten the who-runs-what instruction from "name
the institutions" to "name the individuals where the sources carry them" — with
the same fabrication guard used for case law, because a misattributed rapporteur
is exactly as damaging as a misattributed holding.

**Test:** stakeholder_specificity 2.80 → 4.0+. If it does not move, the
hypothesis (that names were the constraint) was wrong and this needs re-thinking
rather than more sources.

**Secondary hypothesis to check while here:** stakeholder_specificity *declined*
−0.20 in this phase. Press/newsletter share fell 77% → 47% and case law was
capped; press is where named individuals live, so adding binding law may have
diluted the signal. The actor table would settle it either way.

## 5.2 Hinge audit → targeted questions (targets prioritization 4.00, scope_matching)

Critiques: *"Prio 1 given to a 'Monitor' verdict with no confirmed high-risk
trigger"*, *"NIS2/Machinery classification honestly flagged as unconfirmed"*.

The brief is behaving **correctly** here — the hinge rule deliberately produces
Monitor when a threshold fact is unanswered, which is the right answer and was
itself a deliberate fix. But every unresolved hinge is a verdict that cannot be
decisive, so this caps the score no matter how good the retrieval is.

The leverage is *not* "add more questions". It is knowing **which hinges actually
recur**, and today there is no data on that: the hinge is named in prose only.

**Sequence:**
1. Make unresolved hinges machine-readable — the brief already names the hinge, so
   emit it as a structured field alongside `canon_notes` rather than parsing prose
   back out.
2. Run the (widened) panel and count which hinges recur.
3. Add follow-up questions in `etl/intelligence/questions.py` for exactly those,
   and only those. A question that resolves "are you a provider of a high-risk AI
   system under Annex III" converts a Monitor into an In Scope with an action.

**Test:** count of Monitor-with-unresolved-hinge verdicts should fall;
prioritization and scope_matching should rise. Note the trade-off honestly — some
Monitors are *correct* and should survive, so "fewer Monitors" is not by itself a
win. The metric is fewer Monitors caused by facts we could have asked for.

**Note on the intake form:** it collects *company* facts and is not the constraint
here — the gap is a handful of specific scoping hinges, which the follow-up
questions already have the right shape to capture. Widening the intake form is not
part of this.

## 5.3 Prio/Verdict consistency rule (targets prioritization, small)

One concrete defect: Prio 1 assigned to a Monitor row with no confirmed trigger.
Prio and Verdict are *deliberately* independent — a file can be verdict-Monitor
yet Prio 1, like a live enforcement risk — so the rule must be narrow: **Monitor
+ no confirmed trigger + Prio 1** is the combination that cannot occur.

Add to SYSTEM_PROMPT and REVISE_INSTRUCTION, and lock it with a test, following
the established pattern in `tests/test_briefing.py` where every prompt rule earned
from a real failure has a test so a future edit cannot silently drop it.

## 5.4 Council layer (targets political_currency 3.60)

Two critiques call the political section *"fairly thin/generic"*. Case law and OEIL
lifted this +0.60; the remaining gap is the actor gap above plus the Council, which
is entirely unsourced — trilogue mandates, presidency compromise texts, progress
reports. That is where "what will actually happen" lives.

Blocked on the same question as the DMA register: whether there is a
Railway-compatible programmatic route (no Chromium in the image). Research before
design.

## Sequencing

| Order | Work | Why here |
|---|---|---|
| 1 | 5.0 widen panel + measure judge variance | Without it, later results are unreadable |
| 2 | 5.3 Prio/Verdict rule | Hours, not days; independent of everything else |
| 3 | 5.1 actor table, starting with `ep_verbatim` speakers | Biggest gap; the cheapest slice needs no new upstream |
| 4 | 5.2 hinge instrumentation → questions | Needs the wider panel to identify recurring hinges |
| 5 | 5.1 continued (OEIL rapporteurs → roll-call votes) | After the schema proves itself on speakers |
| 6 | 5.4 Council layer | Research-gated |

**Cost per measured round:** ≈$6 generation + ≈$0.30 judging on a 10-profile panel.
Test one lever at a time against a settled corpus — `brief-compare` will warn if
ingestion had not settled, which is now enforced rather than remembered.

---

## Phase 5 — build status (2026-07-28)

Anthropic credits were exhausted, so everything below was built and verified
**without** generation or judging. That splits cleanly: all the machinery exists
and is unit-tested; nothing has been *measured* against briefs yet. The first run
next week is a baseline on the widened panel, not a comparison — see 5.0.

| Item | State |
|---|---|
| 5.0 Panel 5 → 10 profiles | ✅ built. All 16 facets now exercised |
| 5.3 Prio/Verdict rule | ✅ prompt + revise-pass + deterministic check |
| 5.1 Actor schema + migration | ✅ applied to live DB |
| 5.1 Actor extraction | ✅ 510 actors, 999 links |
| 5.1 Stakeholder block + prompt | ✅ wired, tested — **but see the coverage gap** |
| 5.2 Machine-readable hinges | ✅ `extract_hinges()`, validated on real briefs |
| 5.2 Question audit | ⬜ needs a panel run to count recurring hinges |
| 5.4 Council layer | ⬜ research-gated, untouched |

**5.0.** Panel is 10. The five additions were chosen to exercise paths the
original never touched: no profile had `monthly_eu_users` (so the `platform`
facet never fired), none was b2c outside health, and fintech/adtech/telecom/
public-sector had mapped facets but no representation. A panel that never
exercises half the facets cannot detect a regression in them. **This resets the
baseline** — the 3.80 → 4.11 comparison cannot be extended across a panel change.

**5.3.** Rule added to SYSTEM_PROMPT and as check (10) in REVISE_INSTRUCTION,
plus `prio_verdict_issues()`, a deterministic check that joins the existing
canon-fix pass so the model gets told to fix it. Validated against yesterday's
briefs: it independently reproduces the judge's finding — 1 violation, on the AI
SaaS profile, exactly the row the judge flagged.

**5.1 — built, populated, and NOT yet reaching briefs.** 510 actors including the
real rapporteurs on the real files (Brando Benifei on the AI Act, Christel
Schaldemose on the DSA, René Repasi), 16 Commissioners correctly attributed to the
Commission rather than to the chamber they spoke in. Extraction re-derives
structure from text `ep_verbatim` already wrote, so it needed no re-ingestion, no
network and no adapter change.

**The gap, stated plainly: the stakeholder block resolved 0 stakeholders on all
10 panel profiles.** `document_actor` links actors to the debate *transcript*,
and a brief's context holds instruments — the AI Act, GDPR, DORA — not
transcripts. Linking through the debates' own procedure references
(`link_actors_to_procedures`) reaches 55 OEIL procedure documents, but those are
title-thin and rarely win retrieval. So the layer is real and unreachable, which
is the same lesson case law taught: **a source is not integrated when it is
ingested, only when something retrieves it.**

What closes it, in order of directness:
1. **A procedure → CELEX mapping.** Nothing today connects "2024/0047(COD)" to
   the act it became, so actors cannot reach legislation. This is the blocker.
2. **OEIL rapporteur fields** — still the unverified item from the original plan.
   If the detail endpoint carries rapporteur/shadow/committee, actors attach
   directly to procedures at ingestion, and any procedure→act link then
   propagates them.
3. Deliberately **not** doing: a topical fallback that names actors sharing a
   policy area with in-scope instruments. That would fire, and it would name
   people not linked to the file — exactly the fabrication the prompt forbids and
   the judge would rightly punish. A stakeholder block that is sometimes empty is
   correct; one that is sometimes wrong is not.

**5.2.** `extract_hinges()` parses the phrasing the prompt already mandates
("hinges on whether X — confirm"), so no second model call. Validated on
yesterday's five briefs: 6 hinges extracted, and **NIS2 appears as an unresolved
hinge in 2 of 5 profiles** — the first evidence of a *recurring* hinge, which is
exactly the input the question audit needs. Briefs now return
`unresolved_hinges`, so a panel run accumulates this automatically.

### First actions next week, in order

1. `regina brief-check --all` on the 10-profile panel → **new baseline** (~$6).
   Not a comparison; the panel changed.
2. Read `unresolved_hinges` across the 10 and count recurrences. NIS2 headcount
   is already a candidate from n=5.
3. Add follow-up questions in `questions.py` for the hinges that actually recur,
   then `brief-compare` against the new baseline.
4. Verify OEIL's detail endpoint for rapporteur fields — that is the cheapest
   route to making the actor layer reachable.

**Still blocked on credits, unchanged:** 1,195 documents (mostly judgments) have
no enrichment card, and the decision on whether `enrich` joins `refresh`.
