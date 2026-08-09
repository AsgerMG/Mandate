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

## 1. Did it decay, or was it never there? — IT DECAYED, and the cause is in code

Not a corpus load, not a source that stopped publishing scheme codes, not a join
key that moved. A one-column refactor.

`populate_funding_instruments.py` decides whether an award gets a scheme child:

```python
elif fam in split_targets and r["granting_authority"] and r["call_id"]:
```

`fam` is `source_to_family(event.source)` → a rollup id, `satr_be_rnd`.
`split_targets` is `split_families(conn)`. On **2026-07-30 20:34, commit
64f82e79**, subject *"All 22 countries, down to the schemes founders apply to"*,
the hardcoded `SPLIT_FAMILIES = {"satr_fr_rnd", "satr_fr_equity"}` was replaced
by a query — which selected the wrong column:

```sql
SELECT DISTINCT source_family_bucket FROM funding_instruments WHERE id LIKE 'satr\_%'
```

`source_family_bucket` is `'state_aid_satr'` for **all 35 rollups**. So
`split_targets` became `{'state_aid_satr'}`, an id was tested against a channel
label, the two sets were disjoint, and the membership test was never true again.

**The rollout that was meant to widen the split switched it off** — for all 22
countries, including the two France had proven it on forty minutes earlier
(4835a3ae, 19:54 the same evening).

This is the same defect class as Spain's SA numbers: the right query against the
wrong column, failing silently because a smaller result set looks exactly like
thinner data.

Nothing failed. There was no error, no gate, no verdict. The first visible
symptom arrived ten days later as ten graded cases in a different module.

### The hazard that was still live

`populate_funding_instruments.py` main() does `DELETE FROM funding_instruments`
and reinserts. The corpus still holds **453 SATR scheme children carrying 97,032
events** that today's derivation would no longer produce — relics of the last
run before the regression.

They survive **only because "rebuild instruments" has failed on the last three
pipeline runs** (`corpus_census` 7, 8, 9, all `run_outcome: failed at rebuild
instruments`). The next successful run deletes them and takes placement **down**,
11.5% → 10.3%, with no signal anywhere. A broken pipeline step was the only
thing holding the corpus up.

---

## 2. How much is recoverable — 93,483 awards, and the fix is one column

Measured by replaying the child derivation against today's events under both
value spaces, then diffing against what `funding_instruments` holds:

| | children kept | awards placed |
|---|---|---|
| shipped `split_families` (channel label) | 218 | 31,675 |
| what the corpus actually holds (relics) | 697 | 35,224 |
| **rollup ids — the documented intent** | **671** | **128,707** |

430 children the rebuild would create do not exist, and they place **93,483
awards**. Placement goes **11.5% → ~41.9%**. The largest single one is 13,892
awards under `satr_it_equity` / Banca del Mezzogiorno MedioCredito Centrale /
SA.57625 — a real granting body running a real notified scheme, currently
invisible.

Nothing here is guessed. Every recovered award is placed on a leaf keyed by the
`(granting_authority, call_id)` pair **the source itself published**; the fix
restores a comparison, it does not invent a name.

### What is genuinely unplaceable — 133,621 awards (43.4%), by design

| population | awards | share | placeable? |
|---|---|---|---|
| SATR, complete `(authority, call_id)` key | 122,814 | 39.9% | **yes** — this is the recoverable mass |
| programme-split sources | 51,096 | 16.6% | mostly already placed (ADEME etc.) |
| everything else | 133,621 | 43.4% | **no** — the design creates no child for them |

That last row is Horizon (`horizon_eu_cl4/5/6_*`), Innovate UK, `fr_relance`. They
publish a `call_id` and **no granting authority and no programme name**: 123,261
awards are `prog=0 body=0 call=1`. The split only ever forms a key from a
programme name or an (authority, call) pair, so these can never get a leaf. That
is not a defect and not repairable by a better join — **the source never said
who signed**. They correctly fall back to the notified scheme under
`Split.credit`, which is what that fallback is for.

So: **~93k recoverable, ~134k structural, and the remainder is threshold.** Only
9,418 awards sit on keys below `MIN_CHILD_EVENTS = 40`, spread over 955 keys —
lowering the floor buys almost nothing and would publish children built on one
or two awards.

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

**Changed:** `split_families()` returns rollup ids (the docstring's own claim,
and what the hardcoded set it replaced always held), plus
`ETL/events/load/test_split_value_space.py` — the guard, in the peer-prior
canary's shape: credential-free in-memory fixture, milliseconds, in CI on every
PR, where the corpus never runs. It asserts the **property** — the set used as a
membership test must be drawn from the same value space as the values tested
against it, since disjoint means dead — not this query's column name, which the
next refactor would rename its way around. It fails on the shipped code and
passes on the fix.

**Not changed, deliberately:** no rebuild, no artifact regenerated, no floor
re-measured, `peerPrior` untouched (canary re-run: all four populations above
their floors, unchanged). The fix is **inert until
`populate_funding_instruments.py` next runs**, and that run moves the corpus from
218 to 671 children — enough to need the canary and `check_recall_floor` around
it, and enough that it should be its own workstream with its own before/after.
Note it must be run with `--exclude-recall-set` semantics preserved downstream,
and that `rebuild instruments` is currently failing for an unrelated reason that
has to be cleared first.

**No award was placed on a leaf the source did not name.** Every recovered child
is keyed on a `(granting_authority, call_id)` pair the publisher published.

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
