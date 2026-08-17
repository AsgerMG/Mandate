# The corpus of record did not lose anything. It never received it.

**wsHB, 2026-08-17. Free: two Postgres reads, three SQLite reads, no model calls.**

---

## For the owner, verbatim

The coverage gate is right that the corpus of record is not fit to publish, and
wrong about what happened to it. Nothing was lost and nothing was merged away:
the Railway volume has simply never been given three things the laptop and the
live database already hold — the sector labels recovered on 1 August, the 3,362
eligibility gates encoded since 9 August, and, one day later, a corrected
coverage baseline. **No founder is affected today.** The product reads Postgres,
Postgres is identical to the laptop on every instrument measure, and its funds
still carry all eleven sector families — I measured both directly. What you have
to decide is whether to spend one `railway up` and one push cycle to make the
record match what is already shipping. If you do not, the exposure is a rebuild:
run one against the volume as it stands and the sector term silently disappears
from the ranking for founders in mobility, materials and space — not degrades,
disappears — and the eligibility axis drops 65 funds. Both fixes are mechanical
and already written; neither is running because nobody has redeployed the
container since 11 August.

---

## What is actually true, per store

Measured 2026-08-17. The table in the brief was built from census #9, which is
8.8 days old; the laptop has moved on considerably since, so the divergence is
**smaller on events and much larger on gates** than it appeared.

| | railway volume (record, census #11) | laptop `data/db.sqlite` | Postgres (what founders read) |
|---|---:|---:|---:|
| companies | 151,936 | 151,915 | — |
| events | 299,469 | 299,428 | — |
| capital | €408,444,397,332 | €408,436,443,020 | — |
| instruments | 1,088 | 1,088 | 1,088 |
| eligibility gates | 6,401 | **9,763** | **9,763** |
| instruments with eligibility text | not measurable | 688 | 688 |
| instruments with a sector mix | not measurable | 969 | 969 |
| coverage axis `eligibility` | 898 | **963** | — |
| `sectors` KPI | 8 | 11 | 11 families named in `sector_mix` |

**The laptop and Postgres agree to the row on every instrument measure.** That
is the single most important line here: the store the product serves from is the
store that is ahead, so every shortfall below is a shortfall of the *record*,
not of the product.

The volume is ahead on exactly one family — events — by 21 companies, 41 events
and €7.95M. That is real and it must not be destroyed; it is the reason the
push path has a refusal in front of it.

---

## 1. Per axis: merged, nulled, or never there?

### Sectors — nulled once, on 2026-07-24, and repaired only on the laptop

wsGZ's script, run for the first time against the laptop, reports **11 families,
nothing vanished, no row restorable because none is missing** — the laptop is
whole (`sector_families.txt`).

The record's file is unreachable: `pull_db.py` is the only channel to the volume
and it overwrites 645 MB, so on a machine 3,362 gates ahead it is a demolition,
not a read. There is no read-only door. So I answered the question from
provenance instead, and added the mode to wsGZ's script rather than writing a
second one:

```
provenance                 companies    families it alone can name
recovered_2026_07_23         113,016                             3
nace                          19,138                             0
nace_top                      10,838                             0
programme                      1,309                             0
```

One labelling pass is the **sole source of three of the eleven families**. Strip
it and the same store names **eight** — which is exactly what census #11 records
for the volume. The three are `mobility_transport`, `materials_chemicals` and
`space`, and they are *derived* by the script, not named in it: a store missing
a different pass tomorrow is described correctly by the same code.

The history joins up:

- 2026-07-24 a destructive `companies` reload wiped `sector_top` everywhere.
- 2026-08-01 commit `1a5fb8cd` recovered 142,833 labels **from a committed build
  artifact** into the laptop's `company_sector_labels` and restored the column
  there. Cost: nothing.
- That recovery was never promoted to the volume. The volume's weekly
  `classify_taxonomy.py restore` step has been in the deployed image since
  2026-08-09 and runs every Sunday — it restores nothing because the label rows
  it reads from are not there.
- Every census ever taken against the volume (#4, #10, #11) reports 8. Every
  census taken against a laptop copy reports 11.

So for the record it *is* a loss, dated 2026-07-24 — and the repair has existed
since 2026-08-01 and has simply never been carried across.

### Eligibility — never there

The `eligibility` axis is `n_eval[iid] >= 2`: at least two evaluable gates, with
parent inheritance (`ETL/terms/coverage_report.py`). It is therefore monotone in
`eligibility_gates` — adding gates can only raise it.

The census series settles the question without needing the file:

| census | store | date | instruments | gates | `eligibility` |
|---|---|---|---:|---:|---:|
| #4 | volume | 08-07 | 322 | 4,018 | (gate errored) |
| #10 | volume | 08-09 | 1,088 | 6,401 | 898 |
| #11 | volume | 08-16 | 1,088 | 6,401 | **898** |
| #9 | laptop | 08-08 | 1,088 | 7,471 | 913 |
| — | laptop | 08-17 | 1,088 | **9,763** | **963** |

**The volume's eligibility axis has never once been observed above 898.** It has
only ever grown. It did not lose rows; it stopped receiving them. Its instrument
family has been frozen — same 1,088 instruments, same 6,401 gates, same 352
roots — since 2026-08-09, while the laptop gained 2,292 gates on 2026-08-12
alone (`SELECT substr(created_at,1,10), COUNT(*) FROM eligibility_gates`).

Nothing was merged onto a survivor and nothing was nulled. This is staleness,
and the only reason it reads as a regression is that the gate compares a store
against a high-water mark that a *different* store set.

---

## 2. Does anything a founder sees today change? No — and for eligibility I
established it rather than inheriting it

The brief was right to insist. Eligibility legibility was a 22.2% → 4.4% win on
silent rows and fifteen instruments' worth of silent loss would have undone
shipped work. So it was measured directly rather than assumed:

- Postgres holds **9,763 gates** and **688 instruments with eligibility text** —
  byte-identical to the laptop on every instrument measure
  (`eligibility_and_baseline.txt`).
- Postgres's `sector_mix` values name **all eleven families**, so the ranking
  term is intact for every founder sector.
- The record's thinner corpus has never been published. `check_corpus_census`'s
  own DEGRADED class is what keeps it out: the site refuses census #11 and falls
  back to an older admissible reading.

The guard is doing its job. This is a false alarm about the product and a true
alarm about the record.

### What it would cost if a rebuild ever ran on the record

wsGZ's counterfactual, run for the first time with the derived eight-family set
(`sector_resolution.txt`). `sectorFit` reads `sector_mix`, which
`populate_funding_instruments.py` counts from `companies.sector_top` in whatever
store it runs against, so this is arithmetic and not modelling:

- The sector term becomes **identically zero for 3 of 11 founder sectors**.
  `rowRelevance` silently collapses to `wTheme · theme` for them. It does not
  get worse — it stops existing.
- The Platform archetype (mobility_transport) goes from **80 of 142 reachable
  leaves carrying a sector signal to 0**.
- The eight survivors are not left intact either. Their mixes would be counted
  from a biased subsample: distinct scores fall (software_data_ai 214 → 203),
  more funds pile onto the `SECTOR_FULL_MATCH_SHARE` ceiling (212 → 239), and
  0.4%–4.4% of the pairs the term separates today flip or stop separating.

---

## 3. What a union reconcile would restore

**Not run against anything real.** `reconcile_stores.py --report` needs both
stores as files; only `--help` was executed. What follows is derived from its
stated semantics (source-only rows INSERTed, target-only rows always KEPT,
NULL-in-target takes the source's value) plus the monotonicity of both axes.

- **Sectors → 11, guaranteed.** The `events` family carries
  `company_sector_labels` (144,493 rows, PK `name_key`, in the IDENTITY map) and
  `companies` (PK `id`, column-merged, so the volume's NULL `sector_top` takes
  the laptop's). Adding labels can only add families.
  **The cheap route is better than the whole family:** the volume needs only
  `company_sector_labels`. Its own weekly `classify_taxonomy.py restore` step
  then repairs `companies.sector_top` unaided, on the next Sunday, for free. One
  table, one key, no touching of `companies` or events at all.
- **Eligibility → at least 963, `complete` → at least 826.** The `instruments`
  family carries `eligibility_gates` keyed on `(instrument_id, gate_key)` — the
  table's own UNIQUE constraint. The volume would gain up to 3,362 gates it
  lacks and lose none. Because the axis is monotone in gates, the union's
  eligibility is ≥ the laptop's 963.
- **Nothing is restored to the laptop.** The volume is ahead only on events
  (21 companies, 41 events, €7.95M), and `make pull-db` already unions those in.

### A correction the guards should carry

`reconcile_stores.py`'s header, `test_overwrite_refusal.py` and
`check_corpus_census.ts`'s DIVERGED message all say the same thing: *"both sync
paths (`pull_db.py`, `push_local.py`) move the whole 645 MB file with
`--overwrite`, so the next sync in either direction destroys it."* **That is no
longer true of the pull.** `make pull-db` is now
`pull_db_side.py` (fetch to a side path, touch nothing) followed by
`merge_volume_into_local.py --write` (INSERT OR IGNORE union, gated by
`check_id_collisions.py`). And `push_local.py` downloads a witness copy of the
record and refuses through `overwrite_gate` if the push would delete a row.

This matters because `check_corpus_census` currently prints, as its closing
advice, `make republish` — and an operator reading the DIVERGED paragraph above
it would reasonably refuse to run it. `make republish` is safe: it pulls by
union. The guard is scarier than the reality, and the file's own comment says
why that costs: *"a guard that names the wrong fix gets run once, does damage,
and is thereafter ignored."* Noted, not fixed — the message belongs to whoever
owns the sync path.

---

## 4. The two high-water marks, and which one is authoritative

`project-mgmt/coverage_baseline.json` says `highWater.counts.eligibility = 937`.
Census #11's gate says *"down from a high of 913"*. Resolved, with a proof
chain:

1. The census computes its gate verdict inside the container, against
   `BASELINE` — `project-mgmt/coverage_baseline.json` **as it exists in the
   deployed image**.
2. The image's code fingerprint is `c99a0aeb2a070141`. Recomputing
   `publish_corpus_census.code_fingerprint` over every commit reachable from any
   ref identifies it exactly: **`f6ff3957`, 2026-08-11** (`which_commit.py` in
   the reproduction notes below).
3. `git show f6ff3957:project-mgmt/coverage_baseline.json` →
   `highWater.counts.eligibility = 913`.
4. Commit `fe75156a`, **2026-08-12 09:45 — one day after the image was built** —
   raised it to 937, because every one of thirteen fields in main's baseline was
   *lower* than the true mark and "the guard that exists to refuse a corpus
   which lost ground would have passed a corpus that had".

**937 is authoritative.** It is a measurement that actually happened: the state
of the corpus published to Postgres on 2026-08-11, which is live right now. 913
is a bar already known to be too low. The laptop measures 963 today, above both.

The direction of the error is the reassuring one — **the guard is too lenient,
not too strict.** Re-running the pure `evaluate()` on census #11's own recorded
snapshot against this checkout's baseline (`eligibility_and_baseline.txt`):

```
the bar the CONTAINER used:            2 failures, eligibility short by 15
the bar THIS CHECKOUT carries:         4 failures, eligibility short by 39
  + LOSS complete: 816, down from a high of 821
  + DILUTION eligibility: 91.8% -> 88.0% and the count did not rise
```

### The defect underneath it, which is general

`code_fingerprint()` hashes `ETL/**.py` and `website/build/**.py`. It does not
hash `project-mgmt/coverage_baseline.json` — **the bar the published verdict is
computed against**. Here DRIFTED fired only because the Python happened to drift
in the same deploy. Redeploy the container with unchanged Python and a stale
baseline and the census would publish a gate verdict computed against a bar
nobody can identify, with no class firing and nothing to notice. The fingerprint
covers the code but not the input the code grades against. Worth closing; not in
this workstream's remit.

---

## 5. DRIFTED, explained and not fixed

Census #11 was produced by `c99a0aeb2a070141` = commit **`f6ff3957`,
2026-08-11**; this checkout is `ba21132f9cc7de04`. The Railway service has
`repoTriggers: []` — only `railway up` redeploys it — so it is running the tree
as of six days ago.

Two things follow that are not cosmetic:

- **The sector cause is already diagnosed and fixed in the repo.** The
  `restore`/`persist` steps and the comment block explaining that
  `renew.py --auto` reloads `companies` destructively are committed at HEAD
  *and* present in the deployed image (added `b4d5d1b4`, 2026-08-09). The
  container therefore already runs `restore` every Sunday. It restores nothing,
  which is the evidence that the volume's `company_sector_labels` does not carry
  the 2026-07-23 recovery. **This is the one inference in this document I could
  not verify by reading the file, because the file is unreachable. It is the
  only hypothesis consistent with: restore deployed and running since 08-09,
  sectors still 8, and the recovery living only on the laptop.**
- **Census #11's run stopped.** `railway_cron.py` `sys.exit`s on a
  non-tolerated failure, and `classify_taxonomy.py` is not in `PARTIAL_OK`. So
  on 2026-08-16 `persist`, `sanity_check`, `detect_eligibility_gaps`,
  `refresh_open_calls.py`, `fetch_ademe_windows.py` and all four corpus-side
  guards never ran. Which of the four `classify_taxonomy.py` invocations
  returned 1 is not recoverable from the census — it records the script, not the
  subcommand — and Railway deletes the container's logs. `run --max-cost 20` is
  the only one of the four that needs `ANTHROPIC_API_KEY` and money, so it is
  the first place to look; that is a lead, not a finding.

Also noted and left alone: the volume/laptop **gate** divergence belongs to
wsHC. The figure has moved since the brief was written — the laptop is now at
9,763 gates, equal to Postgres, so `check_corpus_census`'s
`local/instruments.gates: derived 7,471` line is reading an 8.8-day-old census
and understates it.

---

## Reproduction

Everything below is free and read-only.

```
# the sector axis, by rows and by provenance
python3 website/frontend/scripts/_wsgz_record_families.py data/db.sqlite
python3 website/frontend/scripts/_wsgz_record_families.py data/db.sqlite --methods
python3 website/frontend/scripts/_wsgz_record_families.py data/db.sqlite \
        --without-method=recovered_2026_07_23 [--emit]

# what the sector term is worth now, and on a record-built mix
cd website/frontend && npx tsx scripts/_wsgz_sector_resolution.ts \
        --surviving="$(...--emit above...)"

# the eligibility axis and the baseline question
GUARD_NO_PUBLISH=1 python3 ETL/terms/coverage_gate.py --dry-run
git show f6ff3957:project-mgmt/coverage_baseline.json
```

`_wsgz_record_families.py` and `_wsgz_sector_resolution.ts` are wsGZ's, rescued
unrun at a spend limit and run here for the first time. The `--methods` and
`--without-method=` modes are wsHB's addition, made because the corpus of record
cannot be opened as a file from this side.

Three throwaway readers — a census dump, a Postgres/SQLite comparison, and the
fingerprint-to-commit scan — lived in the session scratchpad and are gone. Their
outputs are `eligibility_and_baseline.txt` in this directory, and the one number
that matters from the third (`c99a0aeb2a070141` = `f6ff3957`) is checkable in
one line: recompute the hash of `ETL/**/*.py` + `website/build/**/*.py` at that
commit, sorted by path, content only.

## Files

- `sector_families.txt` — the three script runs behind §1
- `sector_resolution.txt` — wsGZ's counterfactual, §2
- `eligibility_and_baseline.txt` — the coverage gate, the re-grade, and the
  Postgres/laptop comparison behind §2 and §4
