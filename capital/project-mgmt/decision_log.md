# Decision log

Running record of analytical, editorial and data decisions, newest first. Each entry: the
decision, why, and where it is implemented. Methodology mechanics live in `methodology.md`;
this file records the *choices*.

## 2026-06-25 · Pipeline reorganised into an ETL block

**D-26. The data pipeline now lives under `ETL/` as `extract/` → `transform/` →
`load/` (with post-load QA inside `load/qa/`).** The flat `scripts/` bucket mixed
extraction, transformation, loading, QA and the publish layer; it is now split so
the flow reads top-to-bottom. `extract/` holds the 43 `extract_*.py` (one per
source); `transform/` holds `classify*`, `merge_companies`, dedup, backfills and
entity resolution; `load/` holds `load_*`, `schema.sql`, `migrations/`, the new
`backup.py`, and `load/qa/` (sanity/audit/overlap checks that run right after a
load). Shared modules + a new `etl_env.py` (single source of truth for the DB path
and sys.path wiring) sit in `ETL/lib/`. Imports were kept low-churn: every stage
script carries a 2-line `etl_env` bootstrap so flat sibling imports and the DB path
resolve no matter where it is run from — no package rename. The publish layer
(`build_*`, `gen_*`, `analysis/`) stays in `scripts/` for a later, separate pass.
Backup is now a real step (`ETL/load/backup.py`, db + data → local + iCloud),
wired into `make backup` and documented as the post-load action. Chosen for
legibility and re-triggerability: each stage is an obvious place to run and re-run.
Source-to-folder map and per-extractor re-runnability registry in `ETL/README.md`.

## 2026-06-24 · Deterministic parent-merge pipeline applied

**D-25. The parent-company rollup is now a deterministic four-layer pipeline,
applied.** `scripts/build_parent_groups.py` composes L1 (exact name) + 2a (suffix/
country-tag) + 2b (multi-country distinctive brand bigram) + 2c (curated brand
dictionary) by anchor-union (no transitive chaining). It replaces the rejected
LLM Layer 2. Big names now consolidate to one parent each (Volkswagen 15→1, Bosch
24→1, Airbus/Thales/Nokia/Siemens…); headline distinct companies 156,836 → 152,804;
euro/event totals unchanged (€267.0bn). Precision is defended, not assumed:
zero-tolerance golden-negative set (apply refuses on any violation), a cohesion
audit (99.8% of groups share a distinctive token), a big/small-name sanity check,
hard size caps, and full reversibility (column recomputed from scratch). Chosen
because it is deterministic, idempotent, and re-runnable on every future load, so
new companies merge automatically with no model in the path. Design + risk
framework in `plans/deterministic_merge_pipeline.md`; supersedes the Layer-2 defer
in D-24.

## 2026-06-19 · Company merge Layer 1 and sector classification

**D-24. Company entities are rolled up to parents via a deterministic Layer 1 merge.**
A `parent_group` column collapses sister entities whose normalised names are byte-identical
(accents/punctuation/legal forms stripped, tokens sorted) — 4,774 companies into 2,310 groups
over the full event-bearing corpus. Headline distinct-company counts read
`COUNT(DISTINCT COALESCE(parent_group, id))` (156,836 → 154,369); euro/event totals unchanged.
Chosen because it is bulletproof by construction: no model judgment, no generic-token bridging,
no transitive chaining. The LLM brand/subsidiary merge (Layer 2) was built and dry-run but
**rejected at review** — a cheap model over-merged on shared first names ("Josef") and industry
words ("aqua"), and union-find over overlapping clusters chained one bad edge into a 23,619-company
blob. Layer 2 will only return behind deterministic guardrails + a precision eval against
false-bridge traps. Layer 3 (GLEIF cross-name) backlogged. Implemented in
`scripts/merge_companies.py --dedup --apply`; documented in `methodology.md`.

**D-23. Sectors are assigned LLM-first, NACE rules as fallback.** Every company carries an
LLM sector label (`company_sector_llm`, gpt-4.1-mini, ~84% vs internet-verified truth — see
`docs/llm_eval.md`), with deterministic precedence manual > LLM > NACE rules in `classify.py`.
Cut unclassified ~30% → 7% and de-inflated cleantech ~24% → 18% (fixed mislabels like
Scaleway). The build never calls the LLM — labels are cached, so site builds stay reproducible.

## 2026-06-15 · Agent harness and methodology backfill

**D-22. The project now runs on a Claude Code agent harness.** Five agents
(`investor-lens`, `founder-lens`, `source-scout`, `load-auditor`, `stat-verifier`),
two skills (`ship-a-source`, `publish-finding`), a `/ship-review` dual-audience
command, and two hooks (warn on hand-edited generated data; Stop-gate for stale
site data + methodology gaps). Methodology consistency is enforced as a gate
(ship-a-source step 8 + load-auditor + the Stop hook), not delegated to an agent.
Full spec in `docs/agent_architecture.md`.
**Superseded 2026-06-25 (D-23):** the custom-agent harness (the five agents, the
two skills, and the `/ship-review` command) was removed — it did not earn its
keep. The Stop/PostToolUse hooks are retained (now in `.claude/hooks/`); review
and source-shipping go through native Claude Code `/` commands going forward.

**D-21. Methodology backfill caught by the new Stop hook on its first run.**
ADEME (`ademe_aid`, 27,697 events / 18,801 companies / €7.76B — the single largest
source by event count) and SPRIND (`sprind_challenge`, 20 events, amounts NULL)
were loaded but never entered in `methodology.md` "Source coverage". Both added.
ADEME flagged with a pending SATR-FR overlap audit (loaded before the Sprint 17
overlap gate). Europe's Rail was a hook false-positive (already documented under
Sprint 18); the hook's token match was normalised to stop nagging.

## 2026-06-12 · Investor brief and amount recovery

**D-20. /for-companies is the mirror of /investors, not a copy.** Same evidence base, same
house rules (findings stated, sourced claims, single-basis euros, no em-dashes), but the
founder/CFO point of view: ticket menu as a product catalogue, country machines as doors, the
momentum law as "start small, start now", a stage-sequenced raise playbook (pre-seed to exit),
and the policy shifts read as openings and traps. No new data pipeline: it reuses
investor_insights.json so the two pages can never drift apart numerically.

**D-17. IPCEI double counting is netted via `ipcei_linked`, keeping the approved ceiling.** The
same IPCEI aid exists twice in the corpus: as a Commission-approved ceiling on the `ipcei_*`
event (EUR 30.0bn) and as granted SATR/SUDOP tranches (344 rows, EUR 17.4bn). All tranche rows
are now flagged `ipcei_linked = 1` (netting pass in `backfill_ipcei_amounts_from_satr.py`,
title-matched, idempotent), and flagged amounts are excluded from the home-page headline total
(`analysis/run.py`) and from per-company indicative totals (`v_company_breadth`). Within-basis
analyses keep both views deliberately: the SATR rotation chart shows granted tranches, the IPCEI
family shows approved ceilings, and they are never summed together (D-05). Award *counts* still
include both rows; they are distinct administrative events.

**D-18. STEP seal shown as a certification chip in the company lookup.** `companies.step_flagged`
(Sprint 8 tagging) surfaces as a "STEP seal" badge.

**D-19. Two further seals are derived, not sourced.** The EIC/Horizon Seal of Excellence is
never published as a holder list, but several national schemes exclusively fund SoE holders
(Spain's CDTI "Sello de Excelencia" resolutions and BDNS direct-award lines, Slovakia's
recovery-plan SoE scheme, Bpifrance): any company paid under them provably holds the seal
(~80 companies, title-pattern derivation in `build_company_search.py`). IPCEI participation is
shown as a chip in its own right because the label has legal consequences (state-aid
obligations that follow the company into M&A). Chips assert only what an official funding
record proves; no third-party badge data.

**D-16. Findings must be data-native and stated, never left to the reader.** Every section of
`/investors` opens with a bold, quotable conclusion (the `Finding` component); charts are
evidence, not the message. Corpus-native headline stats (momentum law, Bosch harvesting, Future
Fund mortality, EIC speed) are computed in `build_investor_insights.py:build_stats`, not
hardcoded.

**D-15. The momentum law is a screening claim, not a causal claim.** P(next award | n awards)
rises 28.5% → 40.7% → 60.2% → 79.3%. We say explicitly that persistent company quality drives
most of it; for sourcing purposes causality is irrelevant. Causal language is reserved for the
cited RDD/SBIR literature (Howell 2017; Santoleri et al.).

**D-14. Every forward-looking statement carries a numbered source.** Policy claims (MFF EUR
409bn/131bn, SAFE EUR 150bn, CISAF, German EUR 500bn fund, Bpifrance Défense, TechEU) link to
the primary document. No unsourced speculation in Part II.

**D-13. Defence numbers are kept in three explicit buckets** so readers cannot conflate them:
EDF R&D grants (~EUR 1bn/yr, in our registers, matches official EUR 7.953bn budget), SAFE
(EUR 150bn loans to governments, structurally invisible to company registers), MFF 2028-34
envelope (EUR 131bn, fivefold). The register lag *is* the investment thesis.

**D-12. Energy-crisis rescues are excluded from all aid analytics.** Uniper (EUR 34.5bn) and
SEFE (EUR 6.3bn) recapitalisations plus one scheme-level renewables total (EUR 3bn booked to
Vercelli S.p.A.) are filtered via `SATR_OUTLIER_SQL`. A bailout is not industrial strategy.
Rows stay in the DB for traceability.

**D-11. Cleantech rotation is reported on both axes.** Counts rotate away from cleantech
(47% → 35%), euros do not (2024 peak EUR 13bn). Both are published side by side because they
describe different company types; choosing one would mislead.

**D-10. Amount-completeness doctrine: NULL means "not publicly recoverable", never "we did not
look".** Known zeros are stored as 0 (Horizon associatedPartner, unfunded JU associated-country
partners). Every remaining NULL block has a documented reason and recovery route
(methodology.md, "Amount-completeness doctrine").

**D-09. Redacted IPCEI amounts are backfilled from granted-aid trails, never estimated.**
SATR/TAM tranches under the IPCEI measure (explicit human-reviewed name mapping, basis
`ipcei_satr_granted` = lower bound; source rows flagged `ipcei_linked`). The SUDOP API serves
the same role for Poland. Cross-checks: SAP EUR 329.6m vs official EUR 325m (1.5%); EDF series
vs official budget (exact).

**D-08. SUDOP rows with a shifted column layout are realigned, not skipped** (an inserted
case-reference pushes fields one over; the EUR column then shows PLN). 41 legacy mis-parsed
amounts were nulled rather than approximated by FX.

**D-07. Grants to subsidiaries are recorded with a note, not re-pointed.** Poland's IPCEI-CIS
money went to Atende Industries sp. z o.o., not the listed parent Atende S.A.; the event stays
on the corpus company with the subsidiary named in the summary.

## 2026-06-11 · Analysis scoping and the first investor page

**D-06. The investor audience analysis targets four questions**: sourcing signal (stacked
approvals), capital-stack reading (signals vs anchors), sector rotation, the state on the cap
table. Chosen over corpus-describing statistics, which investors cannot act on.

**D-05. Euro aggregates never cross `grant_amount_basis` values.** Cross-basis totals appear
only as "indicative" with an explicit footnote (champions table).

**D-04. Champion lists use `entity_type='company'` only**, which forced the classify.py
research-org pattern additions (SINTEF, VTT/tutkimuskeskus, ülikool compounds, hoegsk
transliteration, CPI, LEITAT, IFP, Silicon Austria Labs, III-V Lab; UKRI and ICLEI as public
bodies). A champion list with universities in it is not credible to this audience.

**D-03. Notable-stakes tables show operating companies only, capped per holder.** Fund vehicles
(K/S, Komplementar, GPs, coöperatief, acquisition vehicles) are filtered by name pattern;
max four rows per holder so Tesi's exemplary disclosure does not crowd out the rest.

**D-02. Site pages follow FT/Economist house style**: Georgia serif headlines, EU blue #003399,
no em-dashes anywhere, conclusions in prose rather than chart captions.

**D-01. Tesla's EuBatIn NULL is a known gap, not missing data** (application withdrawn Nov
2021); recorded in the backfill script's KNOWN_GAPS so no one "fixes" it later.

## 2026-07-28 — Source licensing review deferred until revenue-relevant

**Decision (user):** do not commission a legal review of register terms of use
now. Revisit before any data-licensing revenue line, or a raise where the corpus
is positioned as the defensible asset.

**Context:** the July 2026 technical due diligence found 999 distinct source
identifiers across EU and national registers with no record anywhere of which
permit commercial redistribution, which require attribution, and which prohibit
bulk extraction. It is the one finding in that review that code cannot close.

**Risk accepted:** the product is pre-revenue and the corpus currently powers a
free tool, which is the weakest case for a rights-holder to act on and the
cheapest time to be wrong. The exposure grows the moment the corpus is sold,
licensed, or used as the basis of a valuation.

**Trigger to revisit:** first paid tier, first data-licensing conversation, or
diligence on a raise. At that point the recommended path is the cheap one:
draft a source-by-source register from published terms first, and put only the
genuinely ambiguous rows in front of counsel — 999 sources is an expensive thing
to hand a lawyer cold.

## 2026-07-28 — Submission retention shortened to 90 days

**Decision (user):** 90 days, down from the 400 originally shipped.

**Implementation (mine):** a flat 90-day delete would have destroyed the
evidence before a funding outcome exists — public funding decisions run 6-12
months — quietly killing the backlogged outcome loop. So the two things being
conflated were separated: the IDENTIFYING fields (company name, country, free
text) are deleted at 90 days from every row unconditionally; the STRUCTURED
record (shortlist, verdicts, drop reasons) is kept, because once the name is
gone it describes our software's behaviour rather than anyone's company.

Standard data minimisation: shorten retention of what identifies, not of what
is anonymous.

## 2026-07-29 — Duplicated definitions are removed at the root, not documented

**Decision (mine, technical):** where the same fact is stated in two places, the
default is to delete one of them, in this order of preference — generate one
side from the other; failing that import rather than copy; and only where
neither is possible, add a check that fails the build on divergence.

**Context:** three separate production defects in one week turned out to be the
same defect. A retired sector list in `sanitize.ts` silently dropped every live
request's sector for a day. A country map kept in eight files resolved the same
name differently depending on which extractor read it. An `equals` comparator
kept in two files was case-sensitive on one code path and case-insensitive on
the other, so an identical rule passed one screen and failed the next.

Each copy was individually correct and individually tested. What they shared was
a comment asking a human to keep them in step. **That comment is now treated as
the smell** — it marks a duplicate that has not drifted *yet*.

**Applied:** the intake vocabulary is generated into `data/vocabularies.json`
for the Python encoder, so no second copy exists; the country map is one module
all extractors import; the comparator is one pure, exhaustively tested file.
`check_cross_language_constants.py` covers the residue that genuinely cannot be
generated.

## 2026-07-29 — CI checks must run on what is committed

**Decision (mine, technical):** no CI step may depend on data that is not in the
repository.

**Context:** the first real CI failure was self-inflicted — `check_spec_sanity.py`
read `data/db.sqlite`, which is gitignored, and the job died on a missing file in
eight seconds. It now reads the committed `instrument_terms.json` snapshot, which
is strictly better: that snapshot is what ships, so the check validates the
artefact a founder's brief is actually built from.

**Rationale:** a check that cannot pass in CI is not a check, it is a permanent
red light, and a permanent red light trains everyone to scroll past the one that
matters. Test the property by hiding `data/db.sqlite` and running the job.

## 2026-07-29 — Phase 3 measured and deliberately not built

**Decision (mine, technical):** payload and latency work is deferred with the
measurements recorded, not carried as open debt.

Per-request payload is 2.34 MB against a build check that fails at 8 MB — roughly
700 instruments of headroom. The 191-second median brief is dominated by model
time that cannot be optimised away, and the streaming partial view already
absorbs the wait. Both are instrumented, so the trigger to act will announce
itself rather than needing to be remembered.

## 2026-07-29 — Screen one shortened; the adaptive round carries the difference

**Decision (user):** cut the fixed intake from 11 questions to 6.

The questions removed were not deleted, they were **demoted**: each is now asked
adaptively only when a real fund's requirement text needs it. A question every
founder answers to satisfy a rule that applies to a minority is a tax on the
majority, and the adaptive round already grounds every question in a specific
gate. Verified by checking each demoted field still has enum hints — a demoted
field with no hints would have been askable nowhere at all, which is how this
change could have quietly reduced accuracy instead of intake length.
