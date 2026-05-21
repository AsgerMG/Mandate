# Sprint 8 plan — STEP seal tagging + corpus bulletproofing

**Purpose of this doc**: self-contained brief for a fresh Claude session. Two workstreams, both must finish before Sprint 9 (Dealroom) can start. Read top-to-bottom before touching code.

**Owner of this sprint**: Claude Sonnet, executing against `/Users/asgermollergrimberg/EuroInvTracker/files/`.

**Status**: Not started. Discovery for STEP (workstream A) is **not** done — needs Step A0 below. Audit (workstream B) is fully scoped.

---

## TL;DR

Sprint 8 is the **last supply-side sprint**. After this, the corpus is frozen and Sprint 9 attaches the right-hand-side variable (private follow-on via Dealroom). Two parallel workstreams:

- **A — STEP Seal tagging**. Add a Boolean flag (`step_flagged INTEGER DEFAULT 0`, already on the schema as a placeholder) and populate it across existing event rows. STEP = "Strategic Technologies for Europe Platform" (launched 2024, MFF revision). The "Sovereignty Seal" is awarded to projects in critical-tech areas (deep tech, clean tech, biotech, digital). It is a *cross-cutting label over existing events*, not a new funding source. Affects mostly EIC Accelerator, IF, and possibly EDF post-2024. **Decision per user (2026-05-21): this workstream BLOCKS sprint completion — do not declare sprint done with a half-tagged STEP column.**

- **B — Corpus bulletproofing**. Six audit categories run end-to-end across all 7 sources to validate the supply-side dataset before Dealroom integration. Catches cross-source duplicate clusters (21 candidates already identified), shrinks the 705 `entity_type='unknown'` population where feasible, reconciles per-source totals against published figures, and produces a "Pre-Dealroom Health Report" appended to `notes.md` Day 10. **Decision per user (2026-05-21): thorough pass, not light** — the audit gates the move to Sprint 9.

End state: corpus stays at **3,107 companies / 4,969 events** (no new rows expected from audit; a few merges may *reduce* the company count by 10–30). `step_flagged` populated on every event row (0 or 1, no NULLs). Pre-Dealroom Health Report committed. Decision log + notes Day 10 written.

---

## Baseline numbers (corpus snapshot 2026-05-21, post-Sprint-7)

| Source family | Events | Distinct companies | entity_type=unknown share |
|---|---|---|---|
| EIC (Acc + Path + Trans) | 3,843 | 2,189 | 221 (10%) |
| IPCEI | 317 | 302 | 262 (87%) |
| EDF | 276 | 192 | 65 (34%) |
| Innovation Fund | 246 | 237 | 82 (35%) |
| EIB venture/growth | 153 | 151 | 8 (5%) |
| EIT KICs | 99 | 96 | 79 (82%) |
| Chips JU | 35 | 25 | 7 (28%) |
| **Total (post-dedup)** | **4,969** | **3,107** | **705 (23%)** |

Cross-instrument winners (2+ source families): **81 companies (2.6%)**. Top: THALES (FR, 9 sources), CEA (FR, 8), Airbus (FR, 7).

Sector distribution: life_sciences 1,091 / cleantech 943 / deeptech_hardware 531 / digital 182 / defense 174 / space 149 / other 37. Zero `unclassified`.

DQ gates from Sprint 7 sanity check, all clean: NULL coordinator_only=0, NULL grant_amount_basis=0, unknown basis label=0, NULL sector_inferred_updated_at=0, stale timestamps=0.

---

# Workstream A — STEP Seal tagging

## Step A0 — Discovery (DO THIS FIRST — blocks A1+)

STEP was launched 2024 with a "Sovereignty Seal" awarded across multiple EU programmes. There is no single authoritative export. Discovery must answer:

1. **Source(s) of truth for which projects hold a STEP Seal**. Candidates (verify each):
   - EU Funding & Tenders Portal: filter on STEP-tagged calls (`f-t.europa.eu/.../opportunities` — check the "Strategic Technologies for Europe Platform" facet).
   - EIC dashboards: do EIC-Accelerator project pages on `eic.ec.europa.eu/projects/*` expose a "STEP" badge or tag?
   - Commission STEP portal: `strategic-technologies.europa.eu/projects_en` (URL to be verified) — may list seal-holders directly.
   - Innovation Fund: `climate.ec.europa.eu/...` IF fiches *may* note STEP seal eligibility from 2024 onward.
   - EDF: defense projects are explicitly out of STEP scope (different sovereignty regime); flag remains 0 for all EDF rows.

2. **Granularity**: is the seal awarded per *call* or per *project*? If per-call, we can tag at the source-ID level. If per-project, we need per-row identifiers.

3. **Time window**: STEP Seal awards started ~mid-2024. Anything before 2024 is `step_flagged=0` by definition.

4. **Programme exclusions per STEP scope**: STEP supports digital/deep tech, clean tech, biotech. **Out-of-scope by design**: EDF (defense), IPCEI (already state-aid-cleared, not STEP-routable). Leave `step_flagged=0` for all rows in these two source families regardless of project content. Confirm this reading with a quick Commission FAQ check.

**Stop condition for A0**: if no machine-readable source exists for any of EIC/IF/EIT, escalate to user before writing the loader. User has stated this workstream blocks the sprint — do not paper over a missing source with a hand-curated CSV unless explicitly approved.

## Step A1 — Schema confirmation (no migration)

`companies.step_flagged INTEGER DEFAULT 0` already exists from the original `schema.sql`. Verify with `PRAGMA table_info(companies)`. STEP is a project-level label, but a company-level rollup column is the right primary representation for the research question ("does the company hold a STEP seal on any of its funded projects?").

**Decision**: also add `public_funding_events.step_flagged INTEGER DEFAULT 0` so event-level seals are queryable. ALTER TABLE on live DB; mirror in `schema.sql`. The company-level field can be derived via `MAX(step_flagged)` over the company's events but storing both gives faster filter performance on common queries.

## Step A2 — Build `tag_step.py`

Single script, runs in two modes:
- `python3 tag_step.py` → write `data/processed/step_tagged_events.csv` (no DB write).
- `python3 tag_step.py --load-db` → update `step_flagged` on existing event rows + roll up to `companies.step_flagged`.

Must be idempotent: re-running flips no rows when input data is unchanged. Audit-logged via a new `step_audit` table (id, event_id, changed_at, old_value, new_value, run_id) following the same pattern as `classify_audit` (B7 from Sprint 8 of the older plan; already implemented).

## Step A3 — Validation gates

1. Every event has `step_flagged IN (0,1)`. Zero NULLs.
2. `step_flagged=1` count is non-zero and within Commission-published STEP statistics (sanity-check against any published "number of projects with STEP Seal" figure — likely to be ~5–15% of post-2024 EIC events).
3. All EDF + IPCEI rows have `step_flagged=0` (out-of-scope by design).
4. All pre-2024 awarded_date rows have `step_flagged=0`.
5. `companies.step_flagged` equals `MAX(events.step_flagged)` per company. Add an integrity check to `sanity_check.py`.

---

# Workstream B — Corpus bulletproofing (Pre-Dealroom Health Report)

Six audit categories. Each writes findings to a section of `data/processed/pre_dealroom_health_report.md` (one new artefact). Anything that requires DB writes (merges, re-classifications) happens behind a `--load-db` flag on the audit script so the audit is reproducible and reviewable.

## Step B1 — Cross-source duplicate sweep

**Why**: Sprint 7 caught 3 reverse-prefix dups in EIT and 11 empty-country dups. Those bugs imply more silent dups elsewhere. Initial scan found **21 candidate cross-source duplicate-name groups** (BMW, Continental, Enel X, BORMIOLI LUIGI SPA, ETHNICON METSOVION POLYTECHNION, etc.).

**How**:
1. Run a corpus-wide pairwise comparison on `companies` using the normalize_name() function from `extract_chips_ju.py` (the shared canonical form). Match candidates: exact normalized name within ±1 country (allow country=NULL on one side).
2. For each candidate pair, fetch the linked events to decide: same legal entity (merge) vs. different entities sharing a name (keep separate, add `notes` distinguishing them — pattern from the Sprint 4 NOMAGIC INC / NOMAGIC SP ZOO case).
3. Build a manual review CSV (`data/processed/dedup_candidates.csv`) with one row per candidate pair: `(id_a, id_b, name_a, country_a, name_b, country_b, n_events_a, n_events_b, source_families_a, source_families_b, recommendation)`. Recommendation: `merge` / `keep_separate` / `needs_human_review`.
4. Apply the `merge` rows via SQL: re-point events to the canonical ID (lower id by convention), copy any non-NULL field from the dropped row, delete the dropped row.

**Gate**: ≤5 `needs_human_review` rows. If more, escalate.

## Step B2 — Entity-type shrinkage of the 705 unknowns

**Why**: 23% of the corpus is `entity_type='unknown'`. Dealroom matching works best when entity_type filters out research orgs (they are not in Dealroom's universe). Better classification here = cleaner Sprint 9 match pool.

**How**:
1. Slice the 705 by source family: ipcei=262, eic=221, if=82, eit=79, edf=65, eib=8, chips_ju=7.
2. For each slice, scan canonical names against extended regex patterns (mining the IPCEI direct-partner conventions — short uppercase corporate names without legal suffix: `INFINEON`, `BMW`, `BASF SE` variants). Add 30–50 new patterns to `classify.py` covering the most frequent unsuffixed names.
3. Cross-check against Wikidata corporate-Q-IDs via a small batched lookup (`wbsearchentities` API, free, no auth — 1 req/sec). Any Wikidata "industrial enterprise" / "business" / "company" instance-of match → confident `company` reclassification.
4. Record every flip in `classify_audit` (already exists from Sprint 8 of old plan).

**Gate**: shrink unknowns from 705 to ≤300 (target: ≤10% of corpus). Anything still unknown after this pass goes to Dealroom enrichment (Sprint 9) for resolution.

## Step B3 — Country coverage cleanup

**Why**: 18 companies currently have NULL or empty country, all from EIT Manufacturing entries scraped without country info (CERPRO, DigiClean Solutions, etc.) plus a few EDF stragglers.

**How**:
1. Enumerate the 18 rows.
2. For each: fetch the source-page URL recorded in events.raw_source_url. Extract country from page text/metadata. If unresolvable, use Wikidata "country of origin" lookup as fallback.
3. UPDATE `companies.country` with the resolved ISO2.
4. Document any still-NULL rows in `data/processed/pre_dealroom_health_report.md`.

**Gate**: ≤3 NULL-country companies remaining. Document each.

## Step B4 — Sector taxonomy regression check

**Why**: Sector classification has accreted across 7 sprints. Drift risk is high. Need a regression check before Dealroom signals start influencing downstream analysis.

**How**:
1. Pull 50 random companies stratified by sector (≥5 per sector). Spot-check the LLM-free classifier output against the published company description (read from project_summary). Manually flag misclassifications.
2. Re-run the full classifier (`classify.py`) end-to-end. Diff before/after `sector_inferred` per row. Any flip is logged in `classify_audit`. Expected: 0 flips (idempotent).
3. Inspect `MANUAL_SECTOR_OVERRIDES` dict — does each override still serve its original purpose? Remove entries for companies that would now classify correctly via accumulated keywords.
4. Validate the EDF→defense and EIT→source-fallback paths still fire (i.e., disabling those imports would surface unclassified rows).

**Gate**: ≥45/50 spot-checks agree with classifier (90% accuracy). Document failure modes for the residual 5.

## Step B5 — Programme-level totals reconciliation

**Why**: Sprint-by-sprint published-figure validation has been ad-hoc. One consolidated table proves we know what every aggregate means.

**How**: For each of the 7 source families, build a reconciliation table:

| Source family | DB total (events / companies / amount) | Commission/equivalent published figure | Delta % | Explanation |
|---|---|---|---|---|

Sources to validate against:
- EIC: EIC Data Hub native total (3,711 + 132 dup-role rows in DB; export had 4,000 published).
- IPCEI: Per-decision press-release headline aid sum (already done in methodology IPCEI table).
- EIB: total committed debt €3.59B vs. EIB published portfolio metrics.
- IF: per-call grant sums vs. CINEA per-call announcement totals (already done in Sprint 4 reconciliation).
- Chips JU: per-call budget (€455M / €617M for 2021/2022 — already done).
- EDF: per-call EU budget vs. our loaded sum (already done; 97% coverage).
- EIT KICs: count match against published EIT Digital Champions cohort sizes; EIT Manufacturing investments portfolio size on site (21 listed); BoostUp regional cohort sizes (no global total published — caveat).

**Gate**: every family within ±5% of published, OR a documented reason for the delta.

## Step B6 — Multi-instrument profile + PIC integrity check

**Why**: Sprint 9 will match against Dealroom by name+country+website. The 81 cross-instrument companies are the highest-signal set for cohort comparison ("EIC+EIB" vs "EIC only"). Need to confirm their identity is solid before downstream attribution.

**How**:
1. Pull all 81 cross-instrument companies. For each, eyeball: same legal entity across all linked sources? Or is it a parent/subsidiary split that survived dedup?
2. Validate PIC integrity: PIC is unique by schema constraint, but check for orphan PICs (PIC on company row but zero events with that PIC) and PIC mismatches (event has PIC X linked to company with PIC Y — should never happen, but verify).
3. Build a website-coverage report: how many of the 3,107 companies have a `website` populated? (Currently 2,189 — only EIC rows.) Sprint 9 Dealroom matching benefits from website pre-population. Best-effort backfill from project_summary URLs is in scope here if cheap; otherwise defer to Sprint 9.

**Gate**: zero PIC-integrity violations. Website coverage report committed.

---

## Validation gates (combined sprint, all must pass before sign-off)

1. **A — STEP**: every event has `step_flagged IN (0,1)`. STEP-tagged event count non-zero and plausible. Company-level rollup matches event-level MAX. `step_audit` populated.
2. **B1 — dedup**: ≤5 candidate pairs flagged `needs_human_review`. All `merge`-recommended pairs applied.
3. **B2 — unknowns**: corpus shows ≤10% `entity_type='unknown'` (≤300 absolute).
4. **B3 — country**: ≤3 NULL-country companies remaining, each documented.
5. **B4 — sector**: 50-row spot-check ≥90% concordance; classify.py re-run is idempotent (0 flips on no-change input).
6. **B5 — totals**: 7 source families reconciled within ±5% or documented.
7. **B6 — identity**: zero PIC violations; website coverage report exists.
8. **General**: `sanity_check.py` passes existing DQ gates (no regressions).
9. **General**: `pre_dealroom_health_report.md` committed under `data/processed/`.

---

## Documentation updates (Step 7)

- `methodology.md`: new section "STEP Seal tagging" with sourcing and gate criteria. Update source-coverage table to add a "STEP" column showing % flagged per source family. New decision-log entry for both workstreams.
- `notes.md`: Day 10 entry with per-family STEP counts, dedup merge summary, entity-type shrinkage delta, sector regression result, totals-reconciliation table, and the multi-instrument profile.
- `README.md`: add `tag_step.py` to project structure + run section. Bump corpus headline if company count changed via merges.
- `schema.sql`: add `public_funding_events.step_flagged` column and `step_audit` table. Re-export to confirm clean rebuild.

## Memory updates (Step 8)

Create `project_sprint_8_audit.md` capturing any non-obvious decisions made during audit (e.g., which 21 dedup candidates merged vs. kept separate, the rationale for keeping any residual `MANUAL_SECTOR_OVERRIDES`, why X programme reconciles at −7% rather than ±5%). Add MEMORY.md index entry. Refresh any stale memories — in particular, the Sprint 4–7 workaround memories may have items that B-workstream resolves; mark resolved items inline.

---

## Out of scope (defer to Sprint 9 or later)

- **LLM-based entity-type classification**: still deferred. Sprint 9 Dealroom matching handles most company/research_org disambiguation as a side effect of the match.
- **Granular entity split** (startup / SME / large_corp): Dealroom or EU registry territory (Sprint 9).
- **Backfilling missing EIT KIC awards** (BoostUp 2022, etc.): the 6 deferred KICs are Sprint 9 (InnoEnergy + Health via Dealroom).
- **STEP financial-leverage tracking**: STEP also enables "blending" of multiple instruments (a project can stack EIC + EIF + IF if STEP-eligible). Tracking the *flow* of capital across instruments per STEP project is out of v1 scope.
- **EDF parse-failure recovery** (4 image-PDF factsheets): manual OCR pass deferred indefinitely.
- **Chips JU portal re-poll**: idempotent; pick up new projects on the next loader run after portal updates.

---

## End-state checklist (paste into final sign-off message)

- [ ] A0 discovery complete; STEP source(s) confirmed
- [ ] A2 `tag_step.py` written, idempotent, audit-logged
- [ ] A3 all 5 STEP gates pass
- [ ] B1 dedup candidates reviewed; ≤5 `needs_human_review`
- [ ] B2 unknowns ≤10% of corpus
- [ ] B3 ≤3 NULL-country companies
- [ ] B4 sector spot-check ≥90% concordance
- [ ] B5 programme totals reconciled within ±5% (or documented)
- [ ] B6 PIC integrity clean; website coverage report committed
- [ ] `pre_dealroom_health_report.md` committed
- [ ] `methodology.md`, `notes.md`, `README.md`, `schema.sql` updated
- [ ] `project_sprint_8_audit.md` memory written; MEMORY.md indexed
- [ ] `sanity_check.py` clean; no DQ regressions
- [ ] Final company / event / amount totals match the post-merge state
