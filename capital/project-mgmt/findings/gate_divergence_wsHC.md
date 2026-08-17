# wsHC — nothing lost a thousand gates; the corpus of record never received them

**FOR THE OWNER, VERBATIM.** No gates are missing from the corpus of record in
the sense of having been destroyed: the Railway volume has been read twice, on
2026-08-09 and 2026-08-16, and both readings say 6,401. It has never been
observed to hold more. The 7,471 is a **laptop** reading eight days old, and the
laptop today holds **9,763**, as does the Postgres the product actually serves
from. So the direction is the reverse of the alarm — **3,362 encoded gates exist
only outside the store this repo declares of record**, and the volume cannot
regenerate them because no gate-encoding step is in the weekly cron. What that
costs is not today's brief, which reads Postgres and has every gate: it is that
**157 of 1,021 publishable funds have evaluable eligibility rules only because
of that unpromoted work**, and that sibling groups separated by gates fall from
**40 of 41 to 26 of 41** on the record's contents — against exactly the failure
wsGY measured, where 63.2% of the founders we miss are already shown a sibling
of the fund they would have won. The guard was **not** blind to the divergence:
`DIVERGED` named it, +1,070 and +3,362, in plain text. What it is blind to is a
**fall in gate depth on one store over time**, because `coverage_gate.py`'s LOSS
test iterates two hardcoded tuples that `instruments.gates` is not in, and
because its one high-water mark is shared by three stores that are not supposed
to be equal — which is why the volume's ordinary staleness is being reported to
you under the word LOSS.

---

```
run             2026-08-17, isolated worktree wsHC-gatecount off main at 7b70d748
stores read     railway-volume  via corpus_census rows (READ ONLY)
                local           data/db.sqlite, opened mode=ro
                postgres        corpus_census + live COUNT(*) (READ ONLY)
cost            zero. No paid model call, no corpus write, no publish.
reproduce       GUARD_NO_PUBLISH=1 npx tsx scripts/check_corpus_census.ts
                  (from website/frontend)
```

Every figure below carries its store. Two numbers from two stores read as one
number is the error that produced the alarm this workstream was given.

---

## 1. Is the divergence real, and is it definitional?

**Real, not definitional, and it is not a loss.** Three separate proofs.

### The count is one query, and it is unqualified

`publish_corpus_census.py::collect` records `instruments.gates` as

```python
gates = con.execute("SELECT COUNT(*) FROM eligibility_gates").fetchone()[0]
```

There is no predicate to differ on. No `gate_role`, no `verification_level`, no
join to `funding_instruments`. Both 6,401 and 7,471 are the whole table.

### Same code, two stores

The census carries the fingerprint of the Python that produced it. Censuses #9
and #10 carry **the same one**:

| census | taken | produced by | store | fingerprint | instruments | gates |
|---:|---|---|---|---|---:|---:|
| 9 | 2026-08-08 22:26 | local | local | `e25d3712f8cc48f2` | 1,088 | **7,471** |
| 10 | 2026-08-09 03:13 | etl-pipeline | railway-volume | `e25d3712f8cc48f2` | 1,088 | **6,401** |

Identical code, five hours apart, identical instrument count, 1,070 apart on
gates. A definitional difference is excluded by the record itself.

### The record has never been observed to fall

Every census ever taken, by store:

| # | taken | store | instruments | gates | run outcome |
|---:|---|---|---:|---:|---|
| 1–3 | 2026-08-07 | unknown (laptop) | 1,076–1,084 | 6,368 | ok |
| 4 | 2026-08-07 17:51 | unknown (container) | 322 | 4,018 | failed at `refresh_open_calls.py` — mid-rebuild, not a corpus |
| 5–6 | 2026-08-07 | unknown (laptop) | 1,086 | 6,368 | unknown |
| 7–9 | 2026-08-08 | local | 1,088 | **7,471** | partial |
| 10 | 2026-08-09 | **railway-volume** | 1,088 | **6,401** | partial |
| 11 | 2026-08-16 | **railway-volume** | 1,088 | **6,401** | failed at `classify_taxonomy.py` |

The store of record reads 6,401 on both of its readings — **flat**, not falling.
6,401 is 33 *above* the 6,368 both stores shared on 2026-08-07. Nothing on the
volume went backwards.

What happened is on the laptop. `eligibility_gates.created_at` (local, `mode=ro`)
dates every row:

| cohort | rows | instruments touched | evaluable | cited | where it exists |
|---|---:|---:|---:|---:|---|
| before 2026-08-08 | 6,227 | 866 | 2,614 | 4,371 | all three stores |
| 2026-08-08/09 UTC session | 1,244 | 354 | 392 | 1,103 | local + postgres only |
| 2026-08-12 session | 2,292 | 474 | 704 | 2,292 | local + postgres only |
| **total local today** | **9,763** | | | | |

(6,227 + the 141 rows stamped 2026-08-09 UTC that were written on the evening of
2026-08-08 CEST = 6,368, the shared state. The two sessions created 3,536 rows
and 174 were replacements, netting the +3,362 the guard reports.)

Both unpromoted cohorts are paid research, not derivation:
`encoding_method` is `scheme_text_extract` (2,467), `llm_encode` (816),
`llm_orgtype` (44), plus 141 `registered_region` and 36 quarantined.

### The volume cannot catch up on its own

`ETL/events/extract/railway_cron.py::STEPS` — the weekly run's only write path
into the volume — contains no gate encoder. `encode_gates.py`,
`encode_scheme_text_gates.py`, `load_scheme_text.py` and
`apply_gate_encoding_corrections.py` are not in it, and `detect_eligibility_gaps.py`
is a detector. These 3,362 rows exist where they were written and nowhere the
cron can reach.

---

## 2. What it costs

**Not today's brief.** The product reads Postgres, and Postgres has all 9,763.
`migrate_to_postgres.py` copies every column of `eligibility_gates` except
`id`, `created_at` and `updated_at`, so the content of the work is in two places,
not one.

The cost is what the record is *for*. `corpus_stores.py` makes the volume of
record on one test — *which store, if lost, could not be rebuilt?* — and it is
the only store backed by a persistent volume rather than one laptop's disk. For
a third of the gate corpus that argument does not currently hold: the two copies
are a gitignored file on a workstation and a projection that
`migrate_to_postgres.py` truncates and reloads.

**What the record's own contents would do to the product**, measured on the
local store with the two unpromoted cohorts excluded — the closest reconstruction
of the volume available without reading it, and stated as such:

| measure (local sqlite, 1,021 publishable leaves) | today (9,763 gates) | pre-08-08 cohort only |
|---|---:|---:|
| leaves with ≥1 **evaluable** gate | 957 | **800** |
| sibling groups (≥2 leaves) separated by their evaluable gate sets | **40 / 41** | **26 / 41** |
| leaves sitting in a separated group | **705 / 713** | **441 / 713** |

157 publishable funds have evaluable rules only because of the unpromoted work.
And on the record's contents, 264 of 713 sibling leaves sit in a group where
every member carries an identical evaluable gate set — nothing that could tell
them apart. That lands directly on the failure that dominates: `rank_shape_wsGY.md`
measured that **287 of the 454 founders who miss (63.2%) are already shown a
SIBLING of the fund they would have won**, and `leaf_separation_wsAO.md` measured
that gates *do* separate siblings once founders are described as different people.
Gate depth is the one lever measured to act on it, and on the corpus of record a
third of that depth is not there.

---

## 3. Why the guard is blind, and to what

It is **not** blind to the divergence. `check_corpus_census.ts`'s `DIVERGED` arm
reported it correctly and in the right direction, per family, with the number:

```
local/instruments.gates:    derived 7,471, record 6,401 (+1,070 held only by the derived store)
postgres/instruments.gates: derived 9,763, record 6,401 (+3,362 held only by the derived store)
```

Two other things are true, and they are the deliverable.

### (a) `instruments.gates` is judged by nothing over time

`coverage_gate.py`'s LOSS test iterates `AXES` (six) and `KPI_AXES` (eight), both
hardcoded tuples. `instruments.gates` is in neither, so the census records it and
nothing has an opinion about whether it fell. It could go 9,763 → 1,088 on a
single store and every LOSS test would still pass.

The six coverage axes cannot substitute, because they are **instrument counts
over a per-instrument boolean**. `eligibility` counts funds with *at least one*
evaluable gate. Stripping 450 funds from a full rulebook down to one rule each
moves it by zero. That is not hypothetical — it is the incident `coverage_gate.py`'s
own header opens with ("seeding one framework rule took 453 instruments from a
full regime rulebook down to a single rule each, and nothing failed"). The gate
was written for that failure and still cannot see it, because it counts funds and
the loss was depth. Here the arithmetic is on the record: 1,070 gates map to 15
instruments of `eligibility`.

### (b) One high-water mark, three stores that are not supposed to be equal

`project-mgmt/coverage_baseline.json` is a single committed file, and
`coverage_gate.py` runs against whichever database it is pointed at. The mark it
holds is therefore the **maximum over every store anyone has ever run it on**,
while the verdict is about **one** store. That is why census #11 tells you

```
LOSS  eligibility: 898 instruments, down from a high of 913.
      Something the corpus knew, it no longer knows.
```

when what is true is that the volume never knew it — the laptop did. The sentence
is false as written and it is the reason two confidently wrong conclusions were
reached about this in one evening. Cross-store difference is `DIVERGED`'s
question and it has a different fix; putting it in LOSS's mouth makes the two
indistinguishable to a reader.

### The property

> **Every numeric measure a census records about a corpus is judged for LOSS
> against the highest that SAME STORE has ever recorded on a census fit to
> publish.**

Three clauses, each carrying its own weight:

- **every numeric measure** — the set is *derived from the recorded payload*, not
  listed. A measure added to the census is judged from its second census onward,
  with no edit anywhere. This is what stops `instruments.gates` from being the
  fourteenth special case and an axis added next year from being the fifteenth.
- **that same store** — "did this corpus get worse" is a question about one
  store over time. It is answerable from the census table alone, which is the
  only per-store history that exists, and needs no baseline file.
- **fit to publish** — a mark is set only by a census the existing `admissibility`
  predicate accepts. A run that died halfway reads low; letting it set a mark is
  fine (marks only rise) but letting a *failed* run's low reading stand as
  evidence of what a corpus can hold is not.

**It re-introduces neither recorded failure**, because both were percentage
tests and this is absolute:

- *FALSE ALARM (2026-08-06)* — 150 instruments join, every axis gains ~70, five of
  six shares fall. Every count **rises**, so no measure falls below its mark and
  nothing fires.
- *BLIND SPOT (never caught)* — 150 instruments deleted, 130 with a route:
  `route` 908 → 778 while the share rises 89.8% → 90.4%. The count fell 130 below
  its mark, so it fires. The denominator is not consulted at any point.

Implementation, test for an unseen measure, and the red-then-green proof: §4.

---

## 4. The check

*(this section is completed below — see the commit that adds `SHRANK`)*

---

## 5. The DRIFTED report

`check_corpus_census.ts` says census #11 was produced by code fingerprinted
`c99a0aeb2a070141` while this checkout is `ba21132f9cc7de04`.

Reproducing `code_fingerprint()` over git history (content hash of every `.py`
under `ETL/` and `website/build/`; the reimplementation reproduces HEAD's
`ba21132f9cc7de04` exactly), the newest commit that fingerprints to
`c99a0aeb2a070141` is **`f6ff3957b`, 2026-08-11 18:44** — "wsEN: the screen had
two authors and one of them was deleting". The Railway container is running the
image uploaded then. **316 commits behind HEAD**, six days at the time of census
#11.

**It does not explain the gate divergence.** The four modules that produce and
judge these numbers —

```
ETL/events/load/publish_corpus_census.py
ETL/terms/coverage_report.py
ETL/terms/coverage_gate.py
website/build/lib/corpus_kpis.py
```

— are **byte-identical between `f6ff3957b` and HEAD**. The container measures
what this checkout measures. The divergence is in the rows, as §1 shows by two
independent routes.

**It does explain why the volume cannot close the gap.** Of the 27 Python files
under `ETL/` and `website/build` that changed in those 316 commits, the ones
carrying gate encoding — `encode_gates.py`, `encode_scheme_text_gates.py`,
`load_scheme_text.py`, `apply_gate_encoding_corrections.py`,
`apply_gate_role_overrides.py` — are all newer than the image. The container is
running the 2026-08-11 encoders, and it does not run them at all.

It is also the honest reading of a fingerprint mismatch generally: the
fingerprint covers two whole trees, so DRIFTED tells you *the container is not
this checkout*, never *this number was measured differently*. Answering the
second question takes a diff of the measuring modules, and that diff should be
what the report offers. Recorded, not fixed, in §6.

---

## 6. What this workstream did not do

- **No corpus write.** Promoting the 3,362 gates to the volume is a write to the
  corpus of record and goes to `project-mgmt/AWAITING_APPROVAL.md`, not here.
- **`eligibility` (898, high 913) and `sectors` (8, high 11) are wsHB's.**
  §3(b) explains why the *word* on the eligibility line is wrong; it says nothing
  about the axis.
- **DRIFTED naming the modules that actually differ** is a real improvement and
  is not built here. It is a change to a guard wsHB is also reading.
