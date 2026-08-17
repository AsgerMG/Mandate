# Findings index

One line per finding: what it settled, and whether it is still true.

**Why this file exists.** The failure mode in this directory is not disk. It is
a person re-buying an answer someone already paid for, because they could not
find it — and, worse, quoting a superseded number in the present tense because
nothing on the file said it had moved. Both have cost this project real time.

So a finding is kept when it is the only record of something bought, or of a
route measured dead. It is deleted only when its answer is reproducible in
minutes, for nothing, and lives somewhere a reader will actually meet it.

**Before you quote a number from any file here, check its row below.** A file
with no retraction banner is not thereby current: §1 lists the ones whose
headline is superseded and whose file does not say so.

**The instrument of record is `one_funnel/latest.md`**, re-run against a live
corpus and dated. Prefer it to any per-workstream figure. As of 2026-08-13:
897 held-out described founders, `instruments=1088`, draw fingerprint
`13cb71cf3a1d1847`, levers `pool=40 writer_cap=8 published_cap=7 top=5
select_depth=40`.

---

## 1. Stale and still quoted as current — read this first

Every row is a claim stated in the present tense, in a file carrying **no
retraction banner**, that a later measurement has replaced. Fix the file or
quote the replacement; do not quote the original.

| file | what it still asserts | what actually replaced it |
|---|---|---|
| `signal_remeasure_wsBU.md` | **"nothing beats the ranker that ships"** — the best single signal ties SHIPPED at 21.2 ±3.3, "that is not a difference, and it must not be ranked as one" | **The most consequential one.** wsCP found all four `signal_remeasure_wsBU_*` artifacts were produced **before `rankerTallyLine` existed**, i.e. inside the window where a `rankerUsed` call site could silently fall back to the lexical index. Re-measured under attestation the blend beats shipped **+4.8 ±3.3 (z=2.8)** (`ranking_reopen_wsCS.md`), raised to **+5.7 ±3.5** against a founder who exists (`regain_wsCU/README.md`). wsBU is the most-cited sentence in this directory and it is measured on an unattested ranker |
| `dead_ranker_wsDO.md` | "our code builds a subset — 18 to 185 funds, median 105, **the won fund in it 97% of the time**" (repeated at the foot) | `depth_wsEI/depth.md`: mean pool **60.5**, median **37**. For the in-pool rate use `one_funnel/latest.md`, not wsEC — see the row below. The 97% descends from the pre-`accessiblePool` era that `leak_audit_wsK.md` voids by name |
| `gate1_composition_wsEC.md`, and `_wsey_menu_demand.ts`'s header | the accessible-pool ceiling is **77.5%** | **A counting bug.** wsGE: `assessInstrument` counted gate ROWS where the ladder means distinct THINGS IN THE WORLD, and 114 of 184 blocks were arithmetic. The merge is "the ceiling was a counting bug, and it is **87.6%** not 77.5%". wsEC's *conclusion* — no permutation of the pool buys shown-eighteen recall without costing EXACT@5 — is unaffected, because it is a comparison between arms measured the same way. **Its level is not.** Same for the 44.2% |
| `adviser_audit.md`, `adviser_design.md` | "the selector runs at `depth=40`; the candidate pool is min 25, **median 105**, max 185" | Same replacement. The shipped cut is `VERDICT_POOL`, and both files also assert the shipped baseline at EXACT@5 24%/27%, which `headtohead_wsGA/` replaces with control **45.9%** / ranker **51.0%** on the in-pool sub-population |
| `rank_below_five_wsCM.md` | "EXACT@5 **26.8%** — wsCI's draw reproduced pair for pair", and a **96.4%** in-pool ceiling | `RESUME_HERE.md` lists 26.8% as **retracted** ("one draw's value from an unattested run"); the shipped tune figure is 25% at N=300, holdout 24.0%. The pool ceiling is **74.8%** on the n=820 holdout draw (`stages_wsGD/stages.md`) |
| `pool_window_wsCO.md` | its **title**: "the register says **33** of the rows we call open are shut" | `window_write_wsCO2.md`, titled "the second ask closed **58** rows rather than 33" — and 39 of the 41 dates in wsCO's approved write had nothing to load. No pointer from wsCO to CO2 |
| `sixth_row_wsCR.md` §3 | a banner headline: "**the memo publishes a table half as good as the screen it follows**" (15.6% vs 30.0%) | `regain_wsCU/README.md`: reproduced exactly on the old code and **gone on the new** (27.2 vs 30.0). The cause was the wsCT `entityCountries` comparator bug. "The biggest lever on the board is no longer the memo stage" |
| `question_design_wsAY.md` | "wsAT's diagnosis is right about ADEME and wrong about everywhere else" — technology moves the ceiling 0%→91% inside ADEME and nothing past 7% elsewhere | `question_design_wsBA.md` states in its own headline that this **overturns wsAY's central claim about reach**: it was an artefact of only 120 of 780 leaves being labelled. On all 780, technology moves **37 regimes, 729 leaves, 19 countries** |
| `rank_below_five_wsCM.md`, `sixth_row_wsCR.md` | "`DISPLAY_CAP` is 6 and `BRIEF_INSTITUTION_CAP` is 5" | wsCR §1 itself unified all six copies onto `BRIEF_LIMITS.institutionsMax`. Current levers are in `one_funnel/latest.md`. Anyone reading wsCM for the shipped caps gets three wrong constants |
| `gate_field_reach_wsAX.md` | "the share of the **424,244 corpus events**" — the denominator under every `ev%` in its reach table | Canon is **299,384** events. The whole reach ranking sits on a stale base. It also asserts "EXACT@5 30% … +7pp … the metric with the **95%**-in-top-5 target", and 95% was retired by `rich_intake_wsCC.md` |
| `classifier_audit.md` | "instrumented over all **156,836 companies**" — the denominator under every share in §"What decides the corpus" | Canon is **151,426**. The file is headed 2026-06-15 but the sentence and its table read as current |
| `attribution_audit_wsBQ.md`, `attribution_rebuild_wsBR.md` | "671 leaves across all **22 countries**", "funds in 7 of 22 countries" | Canon is **23**. Stated as a fact about the corpus, not as a historical reading |
| `answer_key_coverage_wsBP.md` | "over **309,926** non-duplicate awards", the denominator under its whole coverage table | `attribution_audit_wsBQ.md`, **same date**, measures 307,531 and spends its §0 correcting exactly this class of denominator swap |
| `leak_audit_wsK.md` | "instruments, all **1,014** / publishable **721**" | Now 1,088 / 782. The file's own rule — "a number quoted without its population is wrong" — argues for a date stamp here rather than a retraction |
| `census_delta_wsAG.md` | an open puzzle: a −558 company delta, "WIP — decomposition to follow" | The decomposition arrived in `attribution_audit_wsBQ.md` §census and in `guard_verdicts_wsAF.md`, which uses the identical pair as its demo of `check_corpus_census` firing STALE. No pointer from wsAG to either |

**Not stale, despite looking it.** `1,088 instruments` in `pool_filters_wsAE.md`,
`workstream_z_leaf_cap.md` and `signal_remeasure_wsBU.md` is **still the current
count** — instruments are not the 151,426 *companies* or the 299,384 *events*,
and the three are routinely confused. wsBU's "a key that can see **28
countries**" is a property of `__recallSetDoors.json`, not of the 23-country
corpus headline; it needs a population stamp, not a correction.

---

## 2. What has been paid for — do not re-buy

The register of measurements that cost money. A figure here was bought once.

| what | price | where |
|---|---|---|
| The head-to-head ranker tape, 148 paid calls | **EUR 9.27** (EUR 0.0626/brief) | `headtohead_wsGA/adviser_medium_n773_x2.md` — the most expensive tape here; `consensus_wsGO.md` is a free replay of it |
| Thinking-effort ladder, five arms | **EUR 5.25** | `dark_levers_wsDS/` |
| The 780-leaf technology labelling run | **$4.68** | `question_design_wsBA.md` — the cache it filled is the only reason the 64%/40% figures exist |
| Seam position, recall arm (90 calls) | **EUR 2.05** | `seam_wsDR/recall.md` |
| First end-to-end paid ranker run | **EUR 1.65** whole workstream | `first_test_wsDQ/` |
| Seam position, bench arm (24 calls) | **EUR 0.49** | `seam_wsDR/bench.md` |
| Organisation-type encoding, both judgement passes | **EUR 0.64** | tag `archive/wsCH2-org-type-activate` |
| `SCREEN_FOR_RANKER` paired run, 12 companies | **EUR 0.73** | tag `archive/wsDT-questions-for-ranker` |
| Four selector arms | **~EUR 8** | tag `archive/wsDD-agent-selector` |
| One bench company's memo funnel | **~$4** | `broken_memos_wsCY/README.md` |

**Priced but never spent** — the decision rule and the price both survive, so
re-pricing is not needed either: `ranker_asks_wsEJ/RESULTS.md` (EUR 2.6, EUR 9.0
at `high`), `widen_wsGD.md` (the whole depth ladder priced from production's own
prompt builder; specifies the EUR 11–13 run in `AWAITING_APPROVAL.md`),
`consensus_wsGO.md` (the price book: a powered confirmation costs EUR 63 at
70/30, EUR 260 at 60/40, and the denominator moves 2026-08-31),
`adviser_audit.md` (~EUR 1.60, "the single most informative euro available"),
`category_errors_wsDY.md` (EUR 0.94 expected against a EUR 1.10 budget), and the
built-but-unrun blind relevance grader on `archive/wsDX-relevance-grade`.

---

## 3. The index

`LIVE` — its conclusion is the operative one. `NEG` — a lever measured and found
not to pay; these are the ones most often re-bought. `SUP` — superseded, and the
file says so. `RET` — retracted by its own banner. `HIST` — an audit of a state
of the world that has since moved.

### Ranking, selection and the pool

| finding | what it settled | |
|---|---|---|
| `dead_ranker_wsDO.md` | Deleted gate 2's 740 lines and preserved its ladder: every arm letting the model reorder scored ≤ gate 1's; veto-only ties | LIVE, but see §1 |
| `headtohead_wsGA/` | The AI ranker beats our own scoring 51.0% vs 45.9% EXACT@5 on 98 in-pool founders — p=0.522, inside its own noise | LIVE |
| `widen_wsGD.md` | Widening the ranker's menu 18→whole pool takes "the answer is on the list" 36.7%→78.3% for 1.3 euro-cents. Cost is not the constraint | LIVE |
| `widen_wsGM.md` | Pre-registered falsification, then the sweep: **K=40 ships** — the deterministic path loses no founder and the ceiling rises as predicted | LIVE |
| `stages_wsGD/stages.md` | Where the answer is cut away, n=820: `accessiblePool` drops 184 founders (97.2%→74.8%), `.slice(0,6)` drops 402 more | LIVE |
| `depth_wsEI/depth.md` | The depth ladder priced: won fund in menu 24.7% at 6 rows, 40.7% at 18, 51.3% at 40, 57.3% whole pool | LIVE |
| `consensus_wsGO.md` | Two-sample consensus is **−6.0pp** at RAW@5; the won fund is the *less* stable row, so averaging demotes it | NEG |
| `seats_wsCW.md` + `seats_wsCW/` | The shipped 1/3 seat split is the maximum of its own axis on both splits; a perfect per-founder router would be +11 and nothing observable reaches it | NEG |
| `rows_wsDA.md` + `rows_wsDA/` | The per-row router does not exist: an oracle over discretised row features gains 1 case in 600 | NEG |
| `gate1_composition_wsEC.md` | No permutation of the pool buys shown-eighteen recall without costing EXACT@5 three points | NEG on the comparison; its **levels** are superseded, see §1 |
| `region_as_ranking_signal_wsG.md` | Widening `regionScorer` past the notified scheme loses every time — three widenings measured and lost | NEG |
| `sibling_collapse_wsM.md` | Collapsing indistinguishable siblings costs exact recall and its premise is structurally false: `administeringBody` is in every key | NEG |
| `dark_levers_wsDS/` | **Thinking effort is a dead lever**: SCREEN@5 flat across off/low/medium/high while cost triples | NEG |
| `ship_blend_wsCV/` | The blend end to end on the publishing path: wsCU's +6.0 was a pure pool re-ordering; on the shipped path it is a null | NEG |
| `standalone_gates_wsAW.md` | A parent-less fund should get nothing: both alternatives measured worse or inert | NEG |
| `es_gates_wsAU.md` | Converting Spain's 88 eligibility texts buys nothing: EXACT@5 257→256 over 900 replays | NEG |
| `scheme_evidence_wsBY.md` | Both free per-scheme sources add **+0.0, structurally** — a field constant inside a leaf's own cell cannot separate | NEG (its 85.5% ceiling is retracted as circular; the +0.0 stands) |
| `call_residual_wsCL.md` | Collapsing a body's recurring calls buys nothing: only 6.8–13.9% of 295 catalogue rows group at all | NEG |
| `ranking_reopen_wsCS.md` | Re-ran wsBU under attestation: the null mostly holds, but the blend beats shipped +4.8 ±3.3 | SUP by `regain_wsCU/` |
| `regain_wsCU/` | Both gains survive against a founder who exists: blend +5.7 ±3.5, sixth row +2.8/+3.2 | LIVE. **The "upper bound" caveat is now a number, and its SIGN is the opposite of what the caveat implied**: `rank_shape_wsGY.md` measures the channel cap, dedupe and peer precedence at **+7.2 EXACT / +8.5 REGIME**, so a pure-reordering arm is scored 7.2 points BELOW the product's own frame, not above it |
| `signal_remeasure_wsBU.md` | Every ranking signal alone and blended | **SUP — see §1** |
| `sixth_row_wsCR.md` | Publishing a sixth row is worth +3.6/+3.2; the cap of five was encoded in six places, two already stale | LIVE on the sixth row; §3 retracted, see §1 |
| `rank_below_five_wsCM.md` | The in-pool misses sit at **median rank 22, not rank 6** — no near-miss population exists, so no re-ranking nudge pays | LIVE on the mechanism; numbers superseded, see §1 |
| `standalone_selection_wsBB2.md` | wsAW's standalone rows are an answer-key problem, not a selection defect — 21,632 awards the recall set does not name | LIVE |
| `leaf_separation_wsAO.md` | Gates *do* separate siblings; the earlier negative was the harness handing all 300 founders identical answers | LIVE |
| `adviser_design.md`, `adviser_audit.md` | Three paid arms all lose to shipped; 5,670 of 7,095 key pairs carry no founder description | SUP by `headtohead_wsGA/`; see §1 |
| `category_errors_wsDY.md` | Mismatched picks are **slot-filling**: a mean 2.1 of 18 rows survive the prompt's own disqualifiers while we demand six | LIVE |
| `first_test_wsDQ/` | First paid ranker run works at EUR 0.0171/brief — but 10/12 thought zero tokens and 0/12 declared unsure | LIVE |
| `seam_wsDR/` | Seam position: early shows the model 33.4 rows vs 18.0 and reaches 25.1 deep vs 14.3 | LIVE. **Read the paired re-reading before quoting it** — `scripts/_wsei_reread_wsdr.ts` re-reads the committed run as pairs, free and offline, because the quoted 17.8% vs 22.2% is an *unpaired* reading of a paired design |
| `ranker_asks_wsEJ/RESULTS.md` | The ranker's own question turn, built and rendered: 12/12 archetypes have a separating demand, whole surface is 7 fields | LIVE, unrun |
| `rank_shape_wsGY.md` | The oracle ceiling on ALL ordering work is **86.3%** and its shortfall is zero — but the median miss sits at rank **27 of 79** and no fact we hold separates the shown rows from the answer. The constraint stack does not discount a pure-reordering gain, it is **worth +7.2 EXACT / +8.5 REGIME** on top of the score | LIVE |
| `door_separation_wsHA/` | **The separating fact exists on 287 of 287 sibling-miss pairs** — every pair differs in name, description or eligibility text, and only 1.4% have nothing but award history between them. The gates differ on **94.1%** of pairs and return `open / open` for the founder on **91.6%**: the rules separate the DOORS and not this FOUNDER, because they answer "may I?" and the question is "which one?". 61.3% of the set is named calls separated by topic the founder already states in their own description; 38.7% is state-aid legal bases the granting body picks, separated by declared purpose we hold on 30.0% and ask for on the first page | LIVE |
| `one_funnel/` | **The instrument of record.** Every stage, one population, one denominator | LIVE |

### Intake, questions and the ceiling

| finding | what it settled | |
|---|---|---|
| `rich_intake_wsCC.md` | Under everything a founder could truthfully say the ceiling is **65.9% EXACT@5**, not 95% | LIVE, with a four-point wsCP banner |
| `question_design_wsCK.md` | The residual is a **topic** residual, the topic cannot be asked; pool ceiling 91.6% | LIVE |
| `question_design_wsBA.md` | Technology is the strongest question (64% over 780 leaves) but at 20 answerable options scores 40% vs region's 39% — do not ship option C | NEG |
| `question_design_wsAY.md` | Subsector collapses once its map cannot see the awards; region is the best askable axis | SUP — see §1 |
| `intake_headroom_wsCA.md` | Claimed a 43.1% founder-reachable ceiling | **RET twice** — as a number (→51.7%) and as a ceiling (→65.9%) |
| `address_door_wsCJ.md` | Asking the founder's address to pick the door is worth +0.4 tune / +0.0 holdout; only 7.0% of instruments are territorial | NEG |
| `gap_autopsy_wsCI.md` | Four-bucket autopsy of the EXACT@5 gap; bucket 2 is the harness's own pinned `capitalSought` | SUP by wsCP's re-run (bannered) |
| `wsBL_discarded_answers.md` | **Five answers collected and read by nothing** — region alone was 193 rules on 163 funds that never fired | LIVE |
| `gate_field_reach_wsAX.md` | 104 of 3,125 comparators could never be evaluated; `region` was asked, answered and discarded | LIVE on the region fix; denominators stale, see §1 |
| `real_founder_wsCQ/` | The real-founder harness conversion — source of "18 of 23 intake fields are never supplied" and of the pool gain 92%→98% | LIVE |
| `answer_key_repair_wsR.md`, `answer_key_coverage_wsBP.md` | The answer key's holes and its widening 278→499 | SUP by `__recallSetDescribed.json` (7,095 pairs) |
| `question_ship_wsAZ_*.txt`, `reband_ticket_gates_wsAZ_before.json` | Ticket re-banding: CEILING@5 8% today → 26% at 7 bands → 53% with region. **No `.md` was ever written** | LIVE, unwritten |
| `number_audit_wsCP_*.txt` (6) | The wsCP number audit's terminal output. **There is no `number_audit_wsCP.md`** — its conclusions live only in `RESUME_HERE.md`, which cites these six files by name as its `[ok …]` attestations. Deleting them un-attests the whole ceiling ladder | LIVE |

### Corpus, coverage and liveness

| finding | what it settled | |
|---|---|---|
| `workstream_y_ipcei_reversal.md` | **IPCEI is not closed** — the Commission lists 9 candidates in the design phase. wsW reasoned entirely from our own columns. This is Rule Zero's founding case | LIVE |
| `workstream_w_ipcei_and_leaf_cap.md` | Retracted IPCEI's 11 wave leaves as non-offerable | RET by wsY — row-level outcome right, reasoning corpus-internal |
| `liveness_single_source_wsP.md` | `scheme_end_date` carried two meanings under one name: 306 of 948 live leaves went dark; the proposed fix would have resurrected 50 dead Spanish calls | LIVE |
| `window_write_wsCO2.md` | The approved write was wrong: 39 of 41 "stated open" rows had no date to load; the second ask closed **58** | LIVE |
| `pool_window_wsCO.md` | wsCI's and wsCK's pool gaps are the same 21 pairs at different denominators | SUP by CO2 — see §1 |
| `wsBE_source_window_policy.md` | The degradation policy's deadline-count test is **self-cancelling** (812 offered / 0 withheld / 84 actually closed) | LIVE |
| `wsBE_schema_nobody_could_rebuild.md` | Four load-bearing columns exist only because somebody typed ALTER at a prompt — no committed statement creates them | LIVE |
| `degradation_policy_wsX.md` | Fallback suppression of unconfirmable rows | SUP by wsAC (bannered) |
| `degradation_precision_wsAC.md` | The precise rule cuts suppression 80→5 — but **detects staleness using the field staleness removes**, so on a genuinely stale copy it withholds nothing | NEG, self-cancelling |
| `corpus_variance_wsS.md` | 97% vs 77% twenty minutes apart was **two corpora**; `scheme_end_date` alone explains all 20 points | LIVE on mechanism |
| `corpus_currency_wsAA.md` | Build the guard, not the publisher: nine of seventeen checks are in no automatic path; realised drift median 4.59d, max 32.43d | LIVE |
| `attribution_rebuild_wsBR.md` | Rebuild takes placement 11.5%→41.9% and trades nothing; the layer was never stale, the join was dead | LIVE; country count stale, see §1 |
| `attribution_audit_wsBQ.md` | The "55% unplaced" headline was 88.5% of award pairs | SUP by BR |
| `taxonomy_wsCZ/` | 2,738 companies carry a technology sector every official descriptor contradicts. **The Postgres write is staged, NOT executed.** Reproduce the precision half with `scripts/_wscz_precision.ts` | LIVE |
| `broken_memos_wsCY/` | Pool was cut before blocked rows dropped: one archetype published **zero rows**, first accessible fund at rank 81 of an 18-row cut. Reproduce with `scripts/_wscy_funnel.ts`, which also records why `trace_pool.ts` could not see it | LIVE |
| `workstream_t_gb.md` | GB's 16 "funds" are UKRI grantCategory labels, not funds — corpus repair, not coverage | LIVE (a Rule Zero incident) |
| `workstream_V_es_open_calls.md` | BDNS publishes no openness flag that works — openness must be derived per record from the date | LIVE |
| `workstream_ab_es_names_and_decay.md` | 41 of 80 Spanish rows renamed from the object clause inside the title they already held | LIVE |
| `workstream_l_it_se.md` | Italy's low sibling class is `administering_body`, not `eligibility_text`: 57.3 → 4.4 before a character of text is read | LIVE |
| `workstream_l_thin.md` | 87 of 148 EE/CZ/LV instruments are singletons where perfect eligibility text moves sibling class by **exactly zero** | NEG |
| `workstream_at_fr_gate_encoding.md` | Encoding 75 French funds' prose bought separability, not accuracy — French EXACT@5 unmoved | NEG |
| `workstream_z_leaf_cap.md` | `POOL_LEAVES_PER_CHANNEL` 90→250 is **byte-identical** on every metric on three seeds: the capital filters run before the cap | NEG |
| `workstream_ad_cache_and_floors.md` | The semantic cache was 70 instruments stale but is read only when `DATABASE_URL` is unset — 0 recall pairs affected | NEG |
| `workstream_ar_capital_filter.md` | The 94%→91% pool loss is 66% a wrong derived answer, 21% a real filter defect, 13% a wrong answer key | LIVE |
| `workstream_av_capital_type.md` | `capital_type` "unknown" was one structural defect — no `GRANT_BASES`, so 15,137 events read a missing amount as a missing fact | LIVE |
| `workstream_n2_recovery.md` | Three caches landed with no LLM spend: mean sibling class 11.8 → 3.9 | LIVE |
| `france_coverage_L-FR2.md` | ADEME's 49 per-programme eligibility texts sat in SQLite unpublished; FR coverage 24/133→73/133 | LIVE |
| `wsBI_ademe_windows.md` | 19 ADEME rows gained a closing date and every one is in the past; France offerable 108 → 89 | LIVE |
| `workstream_aq_france.md` | France is not a country problem — 26 ADEME rows in one residual class, 82% of France's burden | HIST, largely closed by wsBI/wsCO2 |
| `pool_filters_wsAE.md` | The 22 SATR leaves a German founder never sees split 21 "product working" / 1 defect | LIVE |
| `memo_loss_wsCT.md` | **51 of 58 VER-BLOCKED deletions were one comparator bug**: `matchesAny` compared "Denmark" to "DK" as strings | LIVE |
| `satr_overlap_*.md` (11) + `ademe_satr_overlap.md` | The ETL-era duplication gate: all ten NDB feeds KEEP, overlap 0–52.5%. **Do not delete** — the producing code (`ETL/events/load/qa/satr_overlap_audit.py` and siblings) still runs, and these are the only record of why each feed was kept | HIST, load-bearing |
| `classifier_audit.md` | 52.9% of companies get their sector from the source default | HIST; denominator stale, see §1 |
| `census_delta_wsAG.md` | The census deltas are not a time series — two different databases | HIST; see §1 |
| `workstream_al_corpus_of_record.md`, `workstream_as_one_corpus.md`, `workstream_bd_cloud_truth.md`, `workstream_Q_merge.md` | The corpus had no owner; landing it on the volume; merge resolutions | HIST |
| `wsAJ_ademe_portal_windows.json`, `wsCO_window_register.json`, `wsU_*.json`, `workstream_L_no_eu_fetch_record.json`, `gate_field_reach_wsAX_before.json` | Harvested source data behind the findings above. `wsCO_window_register.json` is **read by `check_window_evidence.ts`** — it is live input, not a record | mixed |

### Guards, harness and infrastructure

| finding | what it settled | |
|---|---|---|
| `env_loader_wsAH.md` | **34 of 41 harnesses read the wrong `.env.local`** and measured the lexical fallback; `check_recall_floor` printed SKIPPED and exited 0 | LIVE |
| `leak_audit_wsK.md` | Four award-fitted artifacts were leaking and are fixed; **every absolute headline they produced is void**, relative comparisons survive | LIVE; populations stale, see §1 |
| `guard_verdicts_wsAF.md` | Guards run where the data is; STALE is derived from `needs`, since a corpus move voids a corpus verdict | LIVE |
| `wsBK_orphan_closeout.md` | The four ranking artifacts were read behind a bare `catch { cache = {} }` on the request path — **an empty object is a different ranker, not a degraded one** | LIVE |
| `wsBF_orphan_audit.md` | 27 orphans in five shapes, two red at the moment they were found | HIST, closed by wsBK |
| `adviser_audit.md` | 79.9% of answer-key pairs carry no founder description — every model arm so far judged with no case file | LIVE |

**Reproduction paths kept in `scripts/` and cited from nowhere else:**
`_wsgp_audit.ts` (which fields the harness answers that production cannot — the
audit behind "the harness answered questions production never asks"),
`_wsdp_order.ts` (that the selector's order survives `orderMemoCandidates`, the
display-name collapse and the writer cap and reaches the published memo —
free, deterministic, and the only line of the owner's eleven-point gate that
had needed a paid call), and `_wsei_reread_wsdr.ts` (above).

---

## 4. The archive tags

Twenty-one `archive/*` tags, all resolving. Seventeen hold work that exists on
**no other ref** and must survive; the branch itself is often the only copy.

**Must survive — an un-run instrument, or the only record of a paid run:**
`wsDX-relevance-grade` (the blind relevance grader: built, leak-tested, priced
at EUR 1.6, **never run** — and the single most load-bearing tag here),
`wsDT-questions-for-ranker`, `wsDD-agent-selector`, `wsCH2-org-type-activate`,
`wsDF-what-it-sees`, `wsEP-channel-cap`, `wsDB-questions-real`, `wsFB-first-measure`.

**Must survive — the only copy of a measured-out route:** `wsG-region`,
`wsM-sibling-collapse`, `wsBB-standalone-selection`, `wsCB-encoding-lift`,
`wsDV-nine-rejected`, `wsEC-gate1-composition`, `wsEO-legibility`,
`wsFK-floor-diagnosis`, `wsFQ-offered-while-closed`.

**Noise — every file these touched is on main, and nothing they hold is absent
from it.** Verified per file, comparing each tag against its merge base with
main and then each touched path against main's tree:

| tag | why it is noise |
|---|---|
| `archive/wsCW-peer-fill` | An **ancestor of main** — it touches nothing main does not already contain. Its conclusion is on main as `seats_wsCW.md` |
| `archive/wsCG-row-identity` | Four touched files, none absent from main; 9 commits on main name wsCG |
| `archive/wsFF-publish-legibility` | Thirteen touched files, none absent from main; 6 commits on main. **Its message is the value** — "a divergent sibling of main, not a descendant, and that cost us three times before anyone read it as one" — and that lesson is now recorded here |
| `archive/wsFP-fetch-missing-text` | Six touched files, none absent from main. **Its result exists only in the tag message and is recorded here before the tag goes: silent rows 11.9% → 4.4%, and the residual is NOT fetchable** |

Deleting a tag makes its commit unreachable, so this is recorded rather than
done: a workstream branch should not mutate refs the whole repo shares. After
this branch merges:

```bash
git tag -d archive/wsCW-peer-fill archive/wsCG-row-identity \
          archive/wsFF-publish-legibility archive/wsFP-fetch-missing-text
```

---

## 5. Adding to this directory

- **A finding cites the script that produced it.** That citation is what makes
  it checkable rather than asserted, and `check_ws_scripts.ts` is what stops the
  script being deleted out from under it.
- **A superseded finding gets a banner at the top**, naming what replaced it.
  The files in §1 are the ones that did not, and each cost someone time.
- **State the population with the number.** "1,088 instruments" and "151,426
  companies" are different denominators and are routinely confused; a figure
  without its population and date is the defect this file exists to catch.
