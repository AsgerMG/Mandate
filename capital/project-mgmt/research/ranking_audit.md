# Ranking audit: where the 45 points go

**Date:** 2026-08-06 · **Scope:** `website/frontend/lib/intelligence/` (shortlist.ts,
pipeline.ts, fit.ts, semantic.ts, corpus.ts) and `__recallSet.json`.
**Method:** read-only. Production functions were called directly; nothing in the
ranking was changed. Measurement scripts lived in `/tmp/rankaudit/` and are
throwaway. All numbers are holdout split, live Postgres + Voyage, replayed
through the same path `scripts/measure_recall.ts` uses.

**Fidelity check.** The audit harness reproduces `measure_recall.ts` exactly:
both return 22/60 EXACT@5 and 58/60 in-pool on the same 60-case sample.

---

## 0. The headline

| | |
|---|---|
| Won fund reaches the ranked pool | **91%** (219/240) |
| Won fund in the five shown | **32%** (77/240) |
| Loss attributable to filters and caps | **8.8 points** |
| Loss attributable to ordering | **59.2 points** |
| Of the ordering losses, a **sibling of the won fund is already in the five** | **86%** |

**Correction to the premise.** The brief for this audit stated "~58 candidates,
right one present 95%, top-5 contains it 50%". Measured today on both splits,
the pool is wider and the top-5 is worse:

| | holdout (n=240) | tune (n=200) |
|---|---|---|
| pool size (median) | 68 | — |
| in pool | 91% | 94% |
| **EXACT@5** | **32%** | **32%** |
| REGIME@5 | 90% | 84% |
| project / profile EXACT@5 | 49% / 28% | 61% / 26% |

Commit `6c39c86` recorded 40% holdout EXACT@5 on 2026-08-05. The gap is partly
sample stride (a 60-case stride gives 37%, a 240-case stride 32%) and partly
that 40% was measured against a peer prior containing the test companies
(§6.1). 50% is not a number this system currently produces on either split.

Ranking is 87% of the total loss, so the framing in the brief is right. But the
audit found three things that change what "fix the ranking" means:

1. **The ranker that produces the five is not the ranker the codebase documents.**
   `fit.ts` scoreFit — nine weighted components — never runs on screen one.
   Screen one orders on two signals (§2).
2. **The population switch the ranking is built around never switches.**
   `themeInformative` is structurally always true, so a founder with no project
   text is ranked as though they had written one (§3). Routing that switch
   correctly is worth **+8 points** with no new data (§4).
3. **The 95% target is unreachable on the current measurement by a factor of
   ~1.7, whatever the ranker does.** The oracle ceiling is **57.2%** for profile
   mode and **64.1%** overall (§6).

---

## 1. The funnel, end to end

`computeVerdict()` → `buildInstrumentTableHydrated()` → `selectInstrumentRows()`
→ `selectLeafInstruments()` per channel → `materialiseInstrumentTable()` →
`applyPeerPrecedence()` → `.slice(0, DISPLAY_CAP)`.

### Stage 0 — corpus load
`loadDbInstruments()`: **958** instruments (Postgres) — the JSON snapshot is the
fallback.

### Stage 1 — `publishableInstruments()` (corpus.ts:680)
958 → **626**. Removed:

| rule | n | note |
|---|---|---|
| `isFramework` | 8 | |
| has children (is a regime, not a scheme) | 86 | correct |
| `schemeEndDate < today` | **220** | 35% of the corpus. Correct in principle, but see §5.4 |
| `meetsDataFloor` (no amount *and* no date) | 18 | |

Channel shape of the 626: `national_dev_banks` 324, `state_aid_satr` 245,
`eit` 12, `ipcei` 11, `horizon_eu_pillar_ii` 9, `horizon_eu_partnership` 9,
`innovation_fund` 8, `eic` 3, `chips_ju` 2, `edf` 2, `eib` 1.
**91% of the pool universe is two channels.**

### Stage 2 — establishment gate (shortlist.ts:1100)
If no founder country resolves to an ISO-2, return `[]`. Whole-brief kill switch.
Never fires in the recall set.

### Stage 3 — channel admission (shortlist.ts:1106-1202)
This is a **hard filter on 11 buckets**, and an instrument whose bucket is not
admitted can never be considered, however well it matches.

| step | constant | effect |
|---|---|---|
| `fieldChannels` (self + DB peers) | — | empty in the harness; see §5.7 |
| large-scale top-up | `BAND_INDEX[band] >= 3`, `LARGE_SCALE_RELEVANCE_FLOOR = 0.5` | adds eib/innovation_fund/ipcei only for ≥ €15M asks |
| defaults | `MIN_CHANNELS_CONSIDERED = 7`, `DEFAULT_INSTRUMENTS` (5 codes) | fills to 7 |
| thematic top-up | `thematicChannelTopUp(..., limit = 2)`, `TOPUP_THRESHOLD = 0.8` | up to 2 more |
| `channelServesBand()` | — | **always returns `true`**. `CHANNEL_BANDS` is dead (§5.1) |

Measured: **median 6 of 11 channels** considered (min 5, max 7).

### Stage 4 — `selectLeafInstruments()`, per admitted channel
In order:

1. `passesCapitalPreference` — an `equity`/`blended` instrument is dropped
   unless the founder explicitly asked for equity. Logged `SEL-CAPITAL`.
2. `instrumentServesCountry` — keeps `EU` plus the founder's countries.
   Logged `SEL-COUNTRY`.
3. `instrumentServesCapital` — with a **graded relaxation**: if the filter
   empties the channel, capital type is abandoned entirely and every
   in-country leaf comes back. Silent to the founder; logged only.
4. National-channel guard — `NATIONAL_CHANNELS` yield `[]` rather than a
   foreign scheme.
5. **Sort** (shortlist.ts:912-969), keys in order:
   - exact-country / EU tier (binary),
   - `score = (THEME_WEIGHT 0.6 × rel + 0.4 × sectorFit) × objectiveScorer`,
     where `rel` is floored at `RELEVANCE_FLOOR = 0.35`,
   - ticket proximity to `TICKET_MIDPOINT[band]` against `typicalAward`,
   - unfloored `rel`,
   - `eventCount`,
   - `id` (alphabetical).
6. **Cap** (shortlist.ts:988-995):
   ```
   keep = idx < LEAVES_PER_CHANNEL(2)
       || (idx < MAX_LEAVES_PER_CHANNEL(4) && near-tie)
       || idx < POOL_LEAVES_PER_CHANNEL(40)
   ```
   The third clause subsumes the first two. **`LEAVES_PER_CHANNEL`,
   `MAX_LEAVES_PER_CHANNEL` and `NEAR_TIE_RATIO` have no effect on the
   returned set** — the entire relevance-aware cap is inert (§5.1). The real
   cap is a flat 40 per channel.

Result: **pool median 68 rows** (p25 60, p75 79, max 103).

### Stage 5 — channel ordering (shortlist.ts:1254-1269)
`thematicFirst` leads; the rest sort by
`0.5 × channelScore + 0.5 × channelPrior[country|sector]`, tie-broken on
`DEFAULT_INSTRUMENTS` position. **This ordering is then completely overridden**
by the global row sort below — the code says so at line 1464.

### Stage 6 — `materialiseInstrumentTable()` row sort (shortlist.ts:1620-1663)
Keys in order:

1. `usedInField` (proven in the founder's field) — always false when the
   company is not matched;
2. `demote(r)` — `fit !== "startup_ready"`, per curated channel snapshot;
3. **`rowRelevance(r)`**, rounded to 1e-6 — the only continuous key:
   ```
   wTheme × semanticPercentile(id) + (1 - wTheme) × sectorFit(sectorMix, sector)
   wTheme = themeInformative ? 0.85 : 0
   ```
   overridden per-channel by `reassigned` — a rank-preserving permutation that
   hands a channel's own multiset of scores back to its siblings ordered by
   `objectiveScorer × awardScorer`;
4. `INSTRUMENT_PRIORITY.indexOf(channel)` — a **second hardcoded channel order**;
5. `id.localeCompare` — alphabetical.

### Stage 7 — name dedupe (shortlist.ts:1675-1711)
`distinguishRowNames()` first (prefers `administeringBody`, then the
non-shared id fragment, then `schemeCode`, then `capitalType`), then one row
per surviving display name, survivor chosen by own-gate count → encoded-gate
count → id. Logged `SEL-DUPE-NAME`. **Removes the won fund in 2.1% of cases.**

### Stage 8 — `applyPeerPrecedence()` (shortlist.ts:1363-1414)
Two branches:
- `descriptionIsSpecific === true` → keep the ranker's top 3, sort **only rows
  4+** by peer rank;
- `false` → keep the ranker's row 1, then every peer-known row in peer order,
  then the rest; demote repeated `schemeCode`s.

`descriptionIsSpecific` is `themeInformative`, which is always true (§3), so
**the flat branch is dead in production.**

### Stage 9 — the cut
`computeVerdict` returns `candidates.slice(0, DISPLAY_CAP = 6)`; the brief
publishes `BRIEF_INSTITUTION_CAP = 5`; the writer sees
`WRITER_CANDIDATE_CAP = 7` out of `VERDICT_POOL = 18`. EXACT@5 is measured on
the first five.

---

## 2. What is computed and never used

### 2.1 `fit.ts` — the documented ranker does not rank the five
`scoreFit()` is called in exactly one place: `synthesize()` in the **memo path**
(pipeline.ts:823), over `hydratedTable.slice(0, VERDICT_POOL = 18)` — i.e. over
rows already ordered and already cut by the screen-one ranking. `computeVerdict`
never calls it.

So of the nine `FIT_WEIGHTS` components, **seven never touch the five a founder
first sees**, carrying 0.72 of the documented weight:

| component | weight | reaches screen one? |
|---|---|---|
| eligibility | 0.24 | **no** |
| theme | 0.16 | yes (as the 0.85 term) |
| sector | 0.12 | yes (as the 0.15 term) |
| proximity | 0.13 | **no** (only as a binary tier inside a channel) |
| scale | 0.12 | **no** (`scaleFit` unused; a different award scorer is used) |
| structure | 0.08 | **no** |
| capital | 0.08 | **no** (only as a filter) |
| precedent | 0.04 | **no** |
| liveness | 0.03 | **no** |

`rankByFit()` has no production caller at all (only `scripts/shadow_fit.ts`).
`scaleFit`, `livenessFit`, `structureFit`, `eligibilityFit` have no caller
outside `scoreFit`. `sectorFit` is the only export of fit.ts that reaches the
five.

### 2.2 `ease.ts` — computed, then not sorted on
pipeline.ts:757 builds `easeById` for every row; the array is literally named
`rankedByEase`; the comparator at pipeline.ts:847-853 reads **only**
`fit?.score` and the incoming index. `scoreEase`'s whole computation (gate
resolution ratio with shrinkage, precedent, off-country penalty) feeds one
display sentence via `whyEasyLine`. The variable name is a leftover.

### 2.3 Dead constants and exports

| symbol | status |
|---|---|
| `CHANNEL_BANDS` | exported, **zero references**; `channelServesBand()` returns `true` unconditionally, so `SEL-BAND` can never fire |
| `PRIOR_WEIGHT_WITH_TEXT` (0.15) | declared, documented, **never read** |
| `PRIOR_WEIGHT_WITHOUT_TEXT` (0.6) | declared, documented, **never read** |
| `LEAVES_PER_CHANNEL` (2) | shadowed by `idx < 40` |
| `MAX_LEAVES_PER_CHANNEL` (4) | shadowed by `idx < 40` |
| `NEAR_TIE_RATIO` (0.9) | shadowed by `idx < 40` |
| `fitOf()` | exported, **zero callers** |
| `THEME_SPREAD_FLOOR` (0.35) | read, but the condition is structurally always true (§3) |

### 2.4 `DbInstrument` fields loaded and never used in ranking

Never read anywhere in the frontend:
- **`sampleProjectTitles`** — deliberately excluded from `relevance.ts`
  (comment at relevance.ts:87) and used nowhere else. Pure payload.
- **`awardP25`, `awardP75`** — zero references.
- **`successorScheme`, `successorTitle`** — zero references. **40 closed
  schemes carry a live successor** and are silently dropped by
  `publishableInstruments()` rather than redirected to it. That is a designed
  data field with no consumer, on the single largest filter in the funnel.
- `companyCount` — the only hit is an unrelated `layout.tsx` local.

Read for display only, never for ranking:
`intensityP50`/`intensityN`, `schemeOperators`, `administeringBodyShare`,
`application`/`applicationUrl`, `registeredPurpose` (the code comment says
"does not rank — measured at zero").

Read for ranking, but only as a tie-break or a binary: `eventCount`,
`totalEur` (via `typicalAward` fallback), `lastYear` (data floor only),
`schemeCode` (peer-precedence demotion only), `administeringBody`
(display-name disambiguation, which decides **which sibling survives dedupe** —
so it does affect the five, indirectly and unintentionally).

---

## 3. The switch that never switches

`materialiseInstrumentTable` decides how much to trust the founder's
description:

```ts
const spread = Math.max(...vals) / mean - 1;
const themeInformative = spread >= THEME_SPREAD_FLOOR;   // 0.35
const wTheme = themeInformative ? 0.85 : 0;
```

`vals` are the semantic scores. `semantic.ts` normalises **by percentile rank**,
not by best score (semantic.ts:140-160): row *i* of *n* gets `(n-1-i)/(n-1)`.
That distribution is uniform on [0,1] by construction, so `max/mean - 1 ≈ 1.0`
for **every query**, whatever the query says.

Measured, both against the live index:

```
spread = 0.998   "We develop and commercialise software, data and AI products…"  (canned)
spread = 0.998   "Agile and Cognitive Cloud edge Continuum management"           (real project title)
```

Consequences:

- `wTheme` is **always 0.85**. `sectorFit` never gets more than 0.15 of the
  weight. The whole "weighted by which signals EXIST for this founder" design
  (shortlist.ts:1436-1462) never runs its second branch. The measurement quoted
  in that comment — flat 0.6/0.4 lifting national regime recall 17% → 61% —
  describes a code path that does not execute.
- `applyPeerPrecedence` always takes the `descriptionIsSpecific` branch, so
  peer precedence only ever reorders **positions 4 and beyond**.
- A profile-mode founder — 84% of the corpus, whose "description" is one of
  **11 canned sector sentences** — is ranked as though they had written a
  specific project.

The code comment at shortlist.ts:1563 already says what is missing: *"what is
missing is a discriminator that says whether THIS founder's description
separates the funds. Neither 'did it produce scores' nor 'is the score
distribution peaked' does."* The reason is now identified: rank normalisation
destroys exactly the information such a discriminator would read. Any spread
statistic computed on percentile-normalised scores is a constant.

There is a second consequence worth recording: because percentile ranks are
distinct floats, **`rowRelevance` produces no ties at all** — measured tie-group
size is 1 for 58/58 in-pool cases. The `INSTRUMENT_PRIORITY` and `id`
tie-breaks below it are unreachable. Screen one's order is, to a very good
approximation, *the semantic percentile ranking of the founder's text against
`instrument_profiles`*, nudged ≤ 0.15 by sector share and then permuted within
channels.

---

## 4. Stage-by-stage loss funnel (the key deliverable)

240 holdout cases, stride-sampled (the same deterministic stride
`measure_recall.ts` uses). 60-case run in parentheses.

| # | stage | what it is | lost here |
|---|---|---|---|
| S0 | not in corpus | won fund absent from `loadDbInstruments()` | **0.0%** (0.0%) |
| S1 | not publishable | framework / parent / closed / data floor | **0.0%** (0.0%) |
| S2 | channel never considered | bucket not in the ≤7 admitted channels | **1.7%** (1.7%) |
| S3 | capital preference | equity instrument, equity not asked for | **0.0%** (0.0%) |
| S4 | country filter | national scheme outside founder's countries | **0.0%** (0.0%) |
| S5 | capital type | `instrumentServesCapital` | **2.5%** (0.0%) |
| S6 | leaf pool cap | `SEL-LEAF-CAP`, ranked below 40 in its channel | **2.5%** (1.7%) |
| S7 | name dedupe | collapsed into a same-named sibling | **2.1%** (0.0%) |
| S8 | **ranked 6 … N** | in the pool, below the cut | **59.2%** (60.0%) |
| — | **HIT: in the five** | | **32.1%** (36.7%) |

**Pool recall 91.2%. Filters and caps cost 8.8 points. Ordering costs 59.2.**

By mode:

| | n | S2 | S5 | S6 | S7 | S8 | HIT |
|---|---|---|---|---|---|---|---|
| project | 47 | 9% | — | — | — | 43% | **49%** |
| profile | 193 | — | 3% | 3% | 3% | 63% | **28%** |

Rank of the won fund when it is in the pool: **median 7**, p90 31, max 85.
Of the 142 S8 cases, **half sit at rank 5-9** — one to four places outside the
cut — and half at rank 10+.

**Of the 142 ordering misses, 86% show a *sibling of the won fund* (same
`parent_id`) inside the five, and 92% show the same channel.** The regime is
right; the scheme is not. That is the entire remaining problem.

### 4.1 What each ordering layer contributes

Reconstructed by re-sorting the surviving rows on the exact production
comparator (including the sibling slot reassignment), then applying each
peer-precedence branch. n = 240 holdout.

| ordering | all | project (n=47) | profile (n=193) |
|---|---|---|---|
| ranker only, no peer precedence | 23% | **64%** | 13% |
| **production** (`specific` branch) | **32%** | 49% | 28% |
| peer precedence, **flat** branch | 35% | 38% | **34%** |
| peer prior alone, filtered to the pool | 34% | 13% | 39% |

The design intent in the code comment is correct and measurable: peer
precedence is worth **+21 points** to the profile founder and **costs 15
points** to the project founder. Production gives everybody the middle branch,
because the switch is stuck (§3).

**Routing the branch on `mode` rather than on `spread` yields 96/240 = 40%
against production's 32% — 8 points, no new data, no new model call.** This is
the single cheapest change the audit found.

### 4.2 A channel the ground truth cannot reward

`national_dev_banks` supplies 324 of 626 publishable instruments and takes
**12% of all shown rows** (144 of 1,200) — but **zero of 1,988 recall pairs
name an NDB instrument**. Either the award tracing cannot attribute NDB lending
to companies (likely) or NDBs genuinely do not fund these companies. Either
way, ~0.6 of every 5 slots is currently spent on a channel the measurement can
never credit, and no ranking change will recover it. This needs deciding before
any further tuning against EXACT@5.

---

## 5. Things that look arbitrary

1. **The relevance-aware leaf cap is inert.** `LEAVES_PER_CHANNEL = 2`,
   `MAX_LEAVES_PER_CHANNEL = 4`, `NEAR_TIE_RATIO = 0.9` are all subsumed by
   `idx < POOL_LEAVES_PER_CHANNEL (40)` in the same boolean. Three constants
   with 60 lines of measured justification, no effect.
2. **Thresholds calibrated for one score, used on another.**
   `RELEVANCE_FLOOR = 0.35`, `TOPUP_THRESHOLD = 0.8` and
   `LARGE_SCALE_RELEVANCE_FLOOR = 0.5` were written against the lexical index,
   which normalised to the best match. Under percentile normalisation their
   meaning changed silently and absolutely: `RELEVANCE_FLOOR` now zeroes exactly
   the bottom 35% of the corpus for **every** query; `TOPUP_THRESHOLD` admits
   exactly the top 20%; `LARGE_SCALE_RELEVANCE_FLOOR` admits any channel with a
   leaf in the top half — i.e. almost always. None of them is a threshold on
   *match quality* any more; each is a fixed quantile.
3. **Two hardcoded channel priority lists.** `DEFAULT_INSTRUMENTS` (stage 5
   tie-break) and `INSTRUMENT_PRIORITY` (stage 6 tie-break) encode different
   orders. The second is unreachable (§3, no ties).
4. **`schemeEndDate` is the largest single filter** (220 of 958, 35%) and it is
   a hard delete with no redirect, while 40 of those schemes carry a
   `successorScheme` the corpus already holds and nothing reads.
5. **Graded capital relaxation is invisible.** If capital type empties a
   channel, the filter is abandoned for that channel and the founder is shown
   funds of a type they did not ask for, with no marker on the row.
6. **`usedInField` is the top sort key** and can dominate everything below it,
   but it is derived from `fieldChannels`, which is empty for any company not
   in the corpus — i.e. for every real new founder and for every measured case.
   It is a live tier that only fires for companies we already have award data
   for. Its cost is documented in-code (EXACT@5 51%→49%) and accepted; worth
   re-checking now that it is known to fire for approximately nobody the product
   serves.
7. **`thematicChannelTopUp` scores over `loadDbInstruments()`**, not
   `publishableInstruments()` — a channel can be admitted on the strength of a
   framework, parent or closed instrument that can never be shown.
8. **`computeVerdict` does not drop `blocked` funds.** Blocked-row removal
   lives only in the memo path (`synthesize`), so screen one can show a fund
   whose encoded gates conclusively fail.

---

## 6. Ground truth audit

`__recallSet.json`: 1,988 pairs, 1,876 distinct companies, 173 distinct
instruments, 6 countries.

| check | result |
|---|---|
| Split clean (no company on both sides) | **PASS** — 0 companies in both `tune` and `holdout` (818 / 1,170) |
| Won fund still proposable | **PASS** — 1,988/1,988 pass `publishableInstruments()`; 0 framework, 0 parent, 0 closed, 0 below the data floor |
| Project-title leak (description == a sample title of the won instrument) | **PASS** — 0 of 1,988. The past leak is closed |
| Instrument concentration | **Acceptable** — top 83 of 173 instruments = 50% of pairs; the head is capped at 12 pairs per instrument |
| Mode balance | project 319 (16%) / profile 1,669 (84%) — matches the real population, and it matters enormously (§4.1) |
| Country balance | DE 795, FR 413, IT 406, NL 212, SE 88, ES 74. **6 countries only** |

### 6.1 The peer prior is built with the test companies in it — confirmed

`emit_peer_prior.py` has an `--exclude-recall-set` flag. The **shipped**
`peerPrior.generated.json` was built **without** it. Verified by rebuilding both
variants from `data/db.sqlite` and diffing against the artifact:

```
INCLUDING recall companies: 257/257 cells identical to shipped
EXCLUDING recall companies: 155/257 cells identical to shipped
```

`applyPeerPrecedence` reads that artifact, and `measure_recall.ts` reads the
same one. Every holdout company's own award history is inside the ranking
signal being graded.

**Measured impact is small but real.** Rebuilding the prior leak-free:

| | leaked (shipped) | leak-free |
|---|---|---|
| won fund present in its peer-prior cell | 82% | 78% |
| won fund in the prior's own top 5 | 35% | 35% |
| EXACT@5, flat branch | 35% | 35% |
| EXACT@5, peer prior alone | 34% | 33% |

62 of 1,170 holdout cases (5%) have the won fund in their cell *only* because
the test company itself contributed it. So the reported numbers are inflated by
about 1 point, not 10. **It should still be fixed** — the artifact is the one
graded, and the property "the evaluation may not see the answer" should hold
structurally, not by luck of the cap.

### 6.2 The profile-mode "description" is a template

All 1,669 profile pairs share **11 distinct** `selfDescription` strings, one per
sector:

> "We develop and commercialise {sector}. We are seeking public funding for
> research and development work."

This is defensible as a model of "we know only country and sector". It is not
defensible as a measurement of a ranker whose dominant signal is a semantic
embedding of that text — the embedding is a constant per sector, so 982 holdout
profile cases resolve to **51 distinct queries**. See §6.3.

### 6.3 The measurement's own ceiling

Because profile mode supplies only `(country, sector)` — and the harness holds
`ticketBand`, `useOfFunds`, `capitalSought` and `consortium` constant across
every pair — **every case sharing a `(country, sector)` receives the identical
five rows**. An oracle that could choose the best possible five per query is
therefore bounded by how concentrated the won funds are within each query.

Computed directly from the ground truth (holdout, profile mode: 982 cases,
51 distinct queries, **median 7 distinct won funds per query**):

| slots | oracle ceiling |
|---|---|
| 1 | 19.1% |
| 2 | 32.6% |
| 3 | 43.1% |
| **5** | **57.2%** |
| 6 | 62.9% |
| 10 | 78.1% |

Worst groups: `DE|software_data_ai` (87 cases, 40 distinct funds, ceiling 26%),
`DE|industrial_manufacturing` (82 / 36 / 30%), `DE|other` (73 / 27 / 42%).

**Overall holdout ceiling, allowing project mode a perfect 100%: 64.1%.**
Tune split is 60.0% for profile mode — the two splits agree.

---

## 7. Is the target achievable?

### 7.1 Two independent bounds, and they agree

**Bound A — measurement degeneracy (§6.3).** 57.2% profile, 64.1% overall.
This is a property of the harness, not of the product. It cannot be moved by
any ranking change; only by giving the replay more of the intake a real founder
fills in.

**Bound B — sibling ambiguity in the running system.** For each holdout case,
count the won fund's siblings (same `parent_id`) in the pool:

```
siblings of the won fund in the ranked pool:        median 26, mean 21.6, max 39
siblings publishable and serving the country:       median 26, mean 28.2, max 55
```

If the ranker cannot separate a fund from its siblings, the best it can do is
put an arbitrary 5 of the group in the five. Averaging `min(1, 5/G)` over the
sample:

> **Bound B = 33.6%.  Observed = 32.1%.**

**The system is already running at 96% of its own sibling-ambiguity bound.**
Five ranking experiments in one session measured flat for exactly this reason:
the remaining error is not misordering, it is under-determination.

### 7.2 But the corpus *can* separate the siblings

For the 240 holdout cases with ≥2 publishable, country-serving siblings, how
often is the won fund **uniquely identified** within its sibling group by a
field we already hold?

| field | distinct values in group (median) | won fund uniquely identified |
|---|---|---|
| `administeringBody` | 15 | **53/240 (22%)** |
| registered objective (`__objectives.json`) | 9 | 39/240 (16%) |
| top sector of `sectorMix` | 6 | 38/240 (16%) |
| `awardP50` order of magnitude | 2 | 4/240 (2%) |
| region gate (`region_within`) | **1** | **0/240 (0%)** |
| **all five combined** | — | **193/240 (80%)** |

**80% of won funds are already uniquely pinned down by data in the corpus.**
The information exists; the intake does not ask for it and the ranker does not
read it. `administeringBody` in particular is the strongest single
discriminator and is used only to disambiguate display names.

**Correction to the plan in `project_exact_scheme_target.md`:** sub-national
region will *not* separate siblings on current data. Only **148 of 958**
instruments carry a `region_within` gate, and the biggest sibling groups have
none at all — `ademe_aid` 0/75, `vinnova_grant` 0/49, `satr_fr_rnd` 0/42,
`satr_it_rnd` 10/67, `satr_de_rnd` 35/102. Region is a good question to ask only
after the gate coverage exists.

### 7.3 The bound, stated

> **EXACT-scheme-in-5 at 95% is not reachable by ranking work.**
>
> - On the measurement as it stands, the oracle ceiling is **64.1%** overall
>   and **57.2%** for the profile founder who is 84% of the corpus. 95% is
>   1.5× the best score any ranker can obtain against this harness.
> - Against the intake the ranker is actually fed, the sibling-ambiguity bound
>   is **33.6%**, and the shipped system already scores **32.1%**.
> - The headroom that exists without new data is **8 points** (§4.1) — routing
>   the peer-precedence branch by mode. That takes the system to ~40%, which is
>   above bound B because peer precedence is orthogonal to fit rather than a
>   better fit signal.
> - Everything beyond ~40% requires *asking the founder something that
>   separates siblings*. The corpus can already do 80% of that separation
>   (§7.2); the binding constraint is intake, then measurement, then ranking —
>   in that order.

---

## 8. Recommended order of work

1. **Route the peer-precedence branch on signal availability, not on
   `spread`.** +8 points, measured, no new data. Also fix or delete
   `THEME_SPREAD_FLOOR` — as written it is a constant.
2. **Rebuild `peerPrior.generated.json` with `--exclude-recall-set`, or ship
   two artifacts** so the graded one can never contain the answer. ~1 point of
   honesty.
3. **Decide what `national_dev_banks` is for.** 12% of shown rows, 0% of ground
   truth. Either trace NDB awards into the recall set or stop spending display
   budget on it.
4. **Put `administeringBody` into the intake and the ranking.** Strongest
   single sibling discriminator we hold (22% alone, and it is the field the
   dedupe already relies on).
5. **Enrich the harness before tuning again.** Until the replay carries a real
   `ticketBand`, `useOfFunds` and a non-templated description, every point above
   57% is unmeasurable and every point below it may be a measurement artifact.
6. **Delete the inert constants** (`CHANNEL_BANDS`, `PRIOR_WEIGHT_WITH_TEXT`,
   `PRIOR_WEIGHT_WITHOUT_TEXT`, `fitOf`, and either the leaf-cap trio or the
   pool cap), rename `rankedByEase`, and either wire `scoreFit` into screen one
   or stop describing it as the ranker.
7. **Give `successorScheme` a consumer**, so 40 closed-with-successor schemes
   redirect instead of vanishing.

---

## Appendix — reproducing

Scripts were throwaway, in `/tmp/rankaudit/`:

- `funnel.ts` — per-case stage attribution (§4). `N=240 npx tsx /tmp/rankaudit/funnel.ts` from `website/frontend`.
- `branches.ts` — ordering-layer contribution (§4.1), `PEER_FILE=` to swap priors.
- `ties.ts` — tie-group and sibling counts (§7.1).
- `siblings.ts` — sibling discriminability and the spread check (§3, §7.2).

Ceilings (§6.3) and the peer-prior leak reproduction (§6.1) were computed in
Python directly against `data/db.sqlite` and `__recallSet.json`.
