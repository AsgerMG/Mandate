# Attribution: the register of consumers, the cause, and what is recoverable

Workstream BQ, 2026-08-09. Audit. Read out of Postgres for the instrument layer
and the local store for the events Postgres does not hold; every number below is
reproducible with the two scripts named at the end.

---

## 0. The headline number was two numbers

The fact this workstream was opened on:

> 272,307 of 492,319 award pairs (55%) do not resolve to an exact leaf

272,307 is right and reproduces exactly. 492,319 is not its denominator. It is
the count of credited PAIRS emitted by `emit_peer_prior.py` — one award credits
one leaf, or several co-delivered siblings, or a family, so pairs outnumber
awards. The denominator for placement is the award count.

| | |
|---|---|
| award pairs (`is_duplicate = 0`, country known) | **307,531** |
| placed on an exact leaf | **35,224 (11.5%)** |
| not placed | **272,307 (88.5%)** |

The rate is **88.5%, not 55%**. This does not change what workstream BO fixed —
the interleave is right for either number — but it changes the size of
everything downstream, and `attribution.py`'s own docstring still says "82% of
awards", which was true at a different corpus.

---

## 1. Did it decay, or was it never there? — IT DECAYED, and it is stale, not broken

> **Correction, same session.** My first answer to this was wrong and is worth
> recording rather than quietly replacing. I found that `split_families()`
> selects `source_family_bucket` — a channel label identical for all 35 SATR
> rollups — where its caller compares rollup ids, concluded the scheme split had
> been dead since 2026-07-30, and wrote it up as the cause. It is a real defect
> (§4) but it is **not** the cause: `main()` never called that function. It used
> its own inline copy of the query, with the correct column, introduced in the
> same commit. I caught it by grepping my own conclusion before finishing.
> The lesson is narrow and worth keeping: I read the helper and inferred the
> call site instead of reading it.

The actual cause is duller and better news.

**The instrument layer is STALE. The derivation is fine; it has not been run.**

Replaying `populate_funding_instruments.py`'s real child derivation against
today's events, using the definition `main()` actually uses:

| | children | awards placed |
|---|---|---|
| what the derivation forms **today** | **671** | **128,707** |
| what `funding_instruments` **holds** | 697 | 35,224 |
| in both | 241 | |

The table holds 697 children and only **241 of them are keys today's events
still produce**. The other 456 are keyed to an older event set. 430 children the
derivation forms do not exist at all.

The corpus moved and the children did not follow. `corpus_census` records the
move precisely — events 297,933 → 299,384 and total capital €352.9B → €408.4B
between census 6 (2026-08-07 22:07) and census 7 (2026-08-08 22:11) — and
records why the children did not follow:

    census 7  run_outcome: failed at rebuild instruments (+1 more); 22 skipped
    census 8  failed at rebuild instruments (+1 more); 23 skipped
    census 9  partial: corpus restored by hand after workstream BM's chain
              proofs; no pipeline run has yet completed end to end

**Three consecutive pipeline runs failed at the rebuild step**, so the events
advanced under an instrument layer that stopped being regenerated. That is the
whole of it. Nothing about the sources changed, no join key moved, no publisher
stopped emitting scheme codes.

### Proven by running it

I copied the corpus to scratch (never the shared one — the worktree symlink was
restored afterwards and the shared store still reads 1,088 instruments) and ran
the rebuild. **It succeeds.** It does not fail at all; the pipeline failures were
environmental, and one clean run is the entire repair:

| | before | after a clean rebuild |
|---|---|---|
| awards placed on an exact leaf | 35,224 (11.5%) | **128,708 (41.9%)** |
| distinct leaves receiving a placed award | 241 | **671** |
| countries with ≥1 placeable leaf | **7** of 22 | **22** of 22 |

So the answer to the question worth most: **repairable, and cheaply.** Not a
source problem, not a licensing problem, not a modelling problem. One pipeline
step that has to complete.

### What that run also costs, and why it is not a free click

The same rebuild takes `funding_instruments` 1,088 → 998 and reconciles away
**629 curated gates**. `main()` does `DELETE FROM funding_instruments` and
reinserts, so this is a real corpus change with a real blast radius, and it
moves the population every floor is calibrated on. It needs its own workstream
with `check_peer_prior_canary.ts` and `check_recall_floor` on either side of it —
not a step tacked onto this audit. Sized here so that workstream starts with the
numbers rather than deriving them again.

---

## 2. How much is recoverable — 93,483 awards, by running one step

Placement goes **11.5% → 41.9%** on a clean rebuild, measured above rather than
projected. That is **93,483 more awards** placed on **430 children that should
exist and do not**. The largest single one is 13,892 awards under
`satr_it_equity` / Banca del Mezzogiorno MedioCredito Centrale S.p.A. / SA.57625
— a real granting body running a real notified scheme, currently invisible to
every consumer in §3.

Nothing here is guessed. Every recovered award lands on a leaf keyed by the
`(granting_authority, call_id)` pair **the source itself published**. The repair
restores a rebuild, it does not invent a name.

### What is genuinely unplaceable — 133,621 awards (43.4%), by design

| population | awards | share | placeable? |
|---|---|---|---|
| SATR with a complete `(authority, call_id)` key | 122,814 | 39.9% | **yes** — this is the recoverable mass |
| programme-split sources (20 of them) | 51,096 | 16.6% | mostly already placed (ADEME etc.) |
| everything else | 133,621 | 43.4% | **no** — the split forms no key for them |

That last row is Horizon (`horizon_eu_cl4/5/6_*`), Innovate UK and `fr_relance`.
They publish a `call_id` and **no granting authority and no programme name**:
123,261 awards are exactly `prog=0 body=0 call=1`. The split only ever forms a
key from a programme name or an (authority, call) pair, so these can never carry
a leaf. That is not a defect and no better join recovers it — **the source never
said who signed.** They fall back to the notified scheme under `Split.credit`,
which is what that fallback is for.

### And the part that is neither — the threshold

Only **9,418 awards** sit on keys below `MIN_CHILD_EVENTS = 40`, spread thinly
over 955 keys (145 of them single-award). Lowering the floor buys almost nothing
and would publish children built on one or two awards. Leave it.

**So: ~93k recoverable by running the pipeline, ~134k structural, ~9k not worth
buying.**

---

## 2b. For workstream BP — which awards are placeable, measured

BP is extending the answer key and hits the same wall from the other side. The
answer key can only NAME a fund where `Split.leaf_for` succeeds, so this is the
ceiling on what BP can write, and it is much lower than a rate suggests:

**Today, as the corpus actually stands: 241 leaves ever receive a placed award,
across 7 of 22 countries.**

    ES 87   FR 79   SE 49   DE 18   EE 4   DK 3   IT 1

**Fifteen countries have zero placeable leaves.** Germany at 18, Italy at 1 —
these are not thin markets, they are markets where the split is off. The answer
key cannot name a single fund in Czechia, the Netherlands, Austria, Belgium,
Finland, Greece, Ireland, Portugal, Hungary, Poland, Slovakia, Latvia,
Lithuania, Luxembourg or the UK, and no amount of key-writing changes that.

After a clean rebuild — measured, on the rebuilt copy, not projected:
**671 leaves across all 22 countries.**

    FR 127  DE 116  ES 87  IT 86  SE 62  CZ 37  NL 31  AT 29  BE 21  FI 15
    SK 13   GR 13   EE 12  IE 10  LV 7   PT 7   LU 6   DK 6   HU 6   GB 4  LT 1  PL 1

**BP should not treat the current placeable set as the ceiling.** The biggest
gaps in what the answer key can name — DE at 18, IT at 1, and the whole of
central Europe at zero — are not thin markets and not a key-writing problem.
They are one pipeline step that has not completed. Extending the key against
today's corpus would encode a 7-country ceiling into the ground truth, and the
eventual rebuild would then measure as churn rather than as the gain it is —
which is the exact failure `attribution.py`'s own header records, where a
corrected join could only read as a loss because the ground truth could not name
the funds it won.

Everything outside SATR and the 20 programme-split sources (Horizon, Innovate
UK, `fr_relance` — 43.4% of awards) is genuinely unnameable at leaf grain and
should stay a regime-level pair.

---

## 3. The register of consumers, and what each one loses

Canonical definition: `ETL/terms/attribution.py` (`Split.leaf_for`, `Split.credit`).
Two files import it. The rest reproduce one of the two approximations it was
written to replace:

- **(A)** `JOIN funding_instruments i ON i.scheme_code = e.call_id` — misses every
  programme child (empty `scheme_code` by construction) and over-credits, since
  34 codes are shared by several instruments (SA.56245 by 18).
- **(B)** `JOIN funding_instrument_sources s ON s.source = e.source` — returns
  PARENT regimes, never leaves.

| # | consumer | join | produces | what it does with an unplaceable award | live? |
|---|---|---|---|---|---|
| 1 | `ETL/terms/emit_channel_prior.py` | **(A)+(B) UNIONed** | `channelPrior.generated.json`, read by `shortlist.ts` | **silently nothing** — no `else`, no fallback; the award never enters a cell | **yes**, `refresh.py:312` |
| 2 | `ETL/terms/build_instrument_profiles.py` | **(B)** ×3 | `instrument_profiles` (Postgres) — the retrieval index every match scores against | files every project title on the **parent regime**; no leaf ever gets demonstrated scope | **yes**, `refresh.py:266` |
| 3 | `ETL/terms/emit_region_prior.py` + `nuts_regions.staged_region_mix` | (D) `(sa_number, authority)` on `satr_staging` | `regionPrior.generated.json`, read by `shortlist.ts` | **drops** (`if not mix: continue`); programme children unreachable — no `scheme_code` | **yes**, `refresh.py:308` |
| 4 | `ETL/terms/audit_region_claims.py` | (D) hand-rolled scheme key, twice, one keyed on `administering_body` not the child's `name` | printed audit + NUTS name reference | contributes nothing; programme children structurally invisible | **yes**, `refresh.py:173` |
| 5 | `ETL/terms/audit_encoding_vs_reality.py` | **(B)** ×4 | **mutates the corpus**: `UPDATE eligibility_gates SET value_spec = NULL` under `--quarantine` | every CHILD reads reality as **empty**, so a child's gate is judged on zero evidence | `Makefile:215` |
| 6 | `ETL/terms/extend_recall_set.py` | `Split` for labels; **(A)+(B) for the leak guard** | `__recallSetPlus/Composed.json` — what `check_recall_floor` grades | **drops** (correct for a ground truth); but the guard deciding whether text leaks is still scheme-code+family | artifact is graded by `npm run check` |
| 7 | `ETL/terms/enrich_recall_set.py` | **(A)+(B)** in Python | `__recallSetEnriched.json` | **drops the event**; also feeds `guards.note_event`, so mis-attribution weakens the leak guards | manual |
| 8 | `ETL/terms/repair_recall_attribution.py` | (D) `(scheme_code, body)` | `__recallSetRepaired.json` (the `--base` of #6) | keeps the existing label; programme children can never be a repair target | manual |
| 9 | `ETL/terms/encode_intensity.py` | **(B)** | `eligibility_gates.value_spec` — aid intensity | children get the parent's blended median or nothing | manual |

Cleared, checked: `corpus.ts` and `shortlist.ts` do **no read-time attribution**
— `public_funding_events` appears nowhere in `website/frontend/lib` or
`scripts/`. All TypeScript reads the pre-computed priors.

### What the register actually says

**The two workstream BO named are not the worst two.**

- `extend_recall_set.py` bounds what is measurable, as BO said — but it already
  uses `Split` for its labels. Its residual defect is narrower and different:
  the **leak guard** still uses (A)+(B). Answer-key coverage is bounded by
  `leaf_for` succeeding, so restoring 430 children **widens what the answer key
  can name** — this is workstream BP's constraint, and it loosens.
- `emit_channel_prior.py` is on (A)+(B) as BO said, and it is the only **live
  founder-path** artifact still there. Its arm (B) is near-vacuous by
  construction: it requires `i.parent_id IS NOT NULL` while joining through the
  source map, which returns parents. So essentially all its mass comes from arm
  (A) — the join that cannot see a programme child at all.
- **`build_instrument_profiles.py` is the one nobody named**, and it is
  plausibly the largest. It is on pure (B), which means the retrieval index the
  entire matcher scores against has **zero per-leaf demonstrated scope**: every
  project title in the corpus is filed under the rollup. Restoring 430 leaves
  does not help it, because it never asks for a leaf.
- **`audit_encoding_vs_reality.py` is the one that writes.** On (B), a child's
  gate is tested against an empty recipient set and can be quarantined — a
  correct gate deleted for lack of evidence that the join threw away.

---

## 4. What was changed here, and what deliberately was not

**Changed — one duplicated definition removed, and a guard for the class.**
`split_families()` was introduced in commit 64f82e79 *alongside an inline copy of
the same query in `main()`*, and the two were never the same query: `main()`
selected `id`, the helper selected `source_family_bucket`, a channel label
identical for all 35 rollups. Nothing called the helper, so nothing failed — it
sat for ten days as a correct-looking function that would have silently switched
the scheme split off for all 22 countries the first time anyone wired it in.
Per this repo's own rule, a second definition of a rule is the defect: `main()`
now calls `split_families()`, and there is one. **Verified behaviour-identical**
— the rebuild produces the same 671 children and 998 rows either way.

`ETL/events/load/test_split_value_space.py` is the guard, in the peer-prior
canary's shape: credential-free in-memory fixture, milliseconds, wired into CI's
python job on every PR, where the corpus never runs. It asserts the **property**
— the set used as a membership test must be drawn from the same value space as
the values tested against it, since disjoint means dead — not this query's column
name, which the next refactor would rename its way around. It fails on the
pre-fix helper and passes now.

**Not changed, deliberately: the corpus.** No rebuild published, no artifact
regenerated, no floor re-measured. `peerPrior` untouched — canary re-run, all
four populations above their floors, unchanged. The rebuild was run only on a
private scratch copy; the worktree symlink was restored and the shared store
still reads 1,088 instruments.

**The follow-on, sized so it starts with numbers rather than deriving them:** run
`populate_funding_instruments.py` and republish. It takes placement 11.5% → 41.9%
and instruments 1,088 → 998, and it reconciles away **629 curated gates**. That
is a real corpus change that moves the population every floor is calibrated on,
so it needs `check_peer_prior_canary.ts` and `check_recall_floor` on either side,
`--exclude-recall-set` preserved on every artifact regenerated after it, and
`emit_channel_prior` / `build_instrument_profiles` (§3) re-emitted — they read the
child layer that is about to triple.

**No award was placed on a leaf the source did not name**, and none is proposed
to be. Every recovered child is keyed on a `(granting_authority, call_id)` pair
the publisher published.

## Reproduce

```
python3 ETL/terms/_wsbq_attribution_audit.py   # the rate, by reason and by source
python3 ETL/terms/_wsbq_staleness.py           # decayed vs never-there, and the recoverable diff
python3 ETL/events/load/test_split_value_space.py
```

The audit refuses to report a rate unless Postgres and the local store agree on
the placement-bearing instrument columns; the 21 display-name differences
(`apply_override_names.py` writes those to Postgres only, none on a child) are
counted and printed rather than passed over.
