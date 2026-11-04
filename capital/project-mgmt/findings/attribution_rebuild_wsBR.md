# The rebuild, the 90, the 629 — and why the trade was not a trade

Workstream BR, 2026-08-09. Follows `attribution_audit_wsBQ.md`, which sized a
rebuild that takes placement 11.5% → 41.9% and costs 90 instruments and 629
curated gates, and correctly refused to run it. This ran it. **Nothing was
traded.** All three numbers are now true at once, and the reason they ever
looked exclusive is the finding.

---

## 0. What the 90 and the 629 actually are

Measured by rebuilding a private copy and diffing, not by reading the code.

**The 90 instruments: 90 gone, 0 new.** The rebuild adds no instrument and
removes no child. It is a pure deletion of 90 rows, every one of which has
`event_count = 0` and `company_count = 0`:

| | | |
|---|---|---|
| 88 | `bdns_conv_*`, `tier=programme`, `name_source=programme_feed`, ES | live Spanish convocatorias — **open calls**, each with a fetched `description` and `eligibility_text` |
| 2 | `fondo_di_garanzia`, `invitalia_smart_start`, `name_source=curated`, IT | hand-curated framework instruments |

Not duplicates the split collapses. Not stale children. Rows a founder can be
shown today, for money that is **still open to applications** — which is exactly
why they carry no award history and never will.

**The 629 gates are theirs**, all of them, and every one is `llm_cited` with a
`quote` and a `source_file`:

    encoding_method   scheme_text_extract 508 · llm_encode 86 · llm_triage 24 · quarantined 11
    gate_role         programme_fact 373 · filter 238 · obligation 9 · vague 9

So: **lost by the rebuild, not superseded by it.** 508 were cut from those
instruments' own published eligibility text by `encode_scheme_text_gates.py`;
the rebuild has nothing to put in their place because it never saw the text.

`funding_instruments` has two provenances — rows this pass **aggregates from
events**, and rows other scripts **insert additively** from registers of funds
that have paid out nothing we hold. The reconcile read "not in my output" as
"disappeared", which is true of every row of the second kind on every run. The
20%-of-curated guard did not fire: 629 of 7,471 is 8%.

### The workaround that existed, and why it was not enough

`refresh.py` gained an `open_calls` step on 2026-08-08 that re-runs
`load_bdns_open_calls.py` after the truncate. It restores the instrument ROW and
its `eligibility_text`. **Nothing restores the 596 gates cut from that text**,
and `refresh.py` does not run `encode_scheme_text_gates.py` at all. So the chain
looked whole to its own coverage gate while discarding a layer of paid LLM
encoding every run. A workaround downstream of a delete can restore what it
knows about; it cannot know about the rest.

It also cannot run from an agent worktree: its input is under gitignored
`data/raw/`, so the loader raises `FileNotFoundError` in exactly the place the
rebuild is most likely to be run.

**Fix:** `externally_owned()` in `populate_funding_instruments.py`. The property,
not the id prefix — *this pass derives instruments from events and is the only
writer of `event_count`, so a row it does not produce AND that carries no events
cannot ever have been its output.* A row that DID come from events and no longer
does keeps its stale positive count and is still reconciled away. Guarded by
`ETL/events/load/test_external_instrument_ownership.py`, in CI, credential-free.

---

## 1. The layer was never stale. The join was dead.

BQ's rebuild-on-scratch produced 41.9% placement, 671 leaves, 22 countries, and
concluded the layer had decayed because three pipeline runs failed. Reproduced
here exactly. Then reproduced again with one difference:

| rebuild run | placement | leaves | countries | registered scheme titles |
|---|---|---|---|---|
| in an agent worktree | 41.9% | 671 | 22 | **0** |
| with `data/raw/state_aid_cases/cases.json` present | **11.5%** | **241** | **7** | 430 |

`data/raw/` is gitignored, so it exists in the primary checkout and in no
worktree — while every worktree symlinks the shared, real `db.sqlite`. **The
"repair" was the register being absent.** A rebuild on the real machine
reproduces today's 11.5% precisely, because today's 11.5% is what the derivation
produces. Nothing decayed.

What is actually wrong is a dead join, and it is the same defect
`test_split_value_space.py` was written for, one column over.
`populate_funding_instruments.py` builds a scheme child as

    now.append(dict(id=child_id, parent_id=fam, name=authority, ...))

and, two hundred lines later in the same function, does

    row["name"] = title ; row["name_source"] = "case_register"

for every child carrying an SA number — **430 of 453**. `attribution.Split`
keyed that child on `(parent_id, name, scheme_code)` and looked it up with the
award's `granting_authority`. The map held "Allgemeine Richtlinie für NÖ
Förderungen…"; the lookup asked for "Amt der Niederösterreichischen
Landesregierung". Two vocabularies, one membership test, and the test can never
succeed. `programme_names.json` does the same thing to programme children.

Nothing failed. It read as a placement rate.

**Fix:** `Split` keys on the id the ETL built, by importing that pass's own
`child_slug` and `_name_digest` rather than copying them, and asks whether the
corpus holds the result. Membership, never construction — a reconstructed id
that is not in the table means there is no such fund, which is a `None` and not
a guess. Nothing in the split reads a name now.

**The property, guarded:** *a value used as a join key must be a value nothing
renames.* `name` has four writers; the id has one and is asserted stable across
runs by `child_slug`'s own docstring. `ETL/terms/test_split_key_is_not_a_name.py`
renames every display field in a fixture corpus and requires both child kinds to
still place — and requires a foreign authority and an unknown call to still
place on nothing. It fails on the pre-fix `Split`.

---

## 2. The near-miss, and the third fix

Running `encode_registered_regions.py run` from the worktree, against the shared
corpus, **deleted 141 correct `registered_region` filters** and exited 0. Its
source of truth is the same gitignored register, read as

    cases = json.loads(CASES.read_text()) if CASES.exists() else {}

Absent read as empty; empty read as "none of 453 notified schemes restricts its
region"; and this pass deletes a filter when the register does not restrict.
Repaired by re-running from the repository root — all 141 back, same 453
children. A filter that is removed does not fail: it puts a Paris company in
front of a Normandy-only scheme, which is the harm the encoding exists to
prevent. It is `audit_encoding_vs_reality.py`'s failure mode, in a different
script, live.

**Fix:** `etl_env.require_reference(path, why)`. Absent is not empty, and only
one of them licenses a delete. Wired into the destructive reader; two additive
readers (`populate_funding_instruments.py`, `encode_article_intensity.py`) still
degrade rather than stop, which is the correct difference.

---

## 3. The sequence, and the measurement

1. Backup to `Wincent-archive/Wincent-backups-20260809/`, **verified by opening
   it**: `integrity_check ok`, 1,088 instruments, 7,471 gates, the 90 rows and
   their 629 gates all present.
2. `populate_funding_instruments.py` with `externally_owned` — 0 orphaned gates,
   7,471 kept, 90 external rows spared, 998 derived rows rebuilt.
3. `encode_registered_regions.py run`, `encode_article_intensity.py run`,
   `apply_gate_role_overrides.py`.
4. `coverage_gate.py` — **no regression**, 1,021 instruments against a 1,021
   baseline.
5. `eligibility_export.py`, `emit_theme_index.ts`, `migrate_to_postgres.py` —
   both stores at 1,088 / 7,471, consistency check OK, 0 stale embeddings.

| | before | after |
|---|---|---|
| awards placed on an exact leaf | 35,224 (11.5%) | **128,716 (41.9%)** |
| distinct leaves receiving a placed award | 241 | **671** |
| countries with ≥1 placeable leaf | 7 of 22 | **22 of 22** |
| instruments | 1,088 | **1,088** |
| curated gates | 7,471 | **7,471** |
| children named from the Commission's register | 430 | **430** |

128,716, not BQ's 128,708: the id key also recovers eight programme children
that `programme_names.json` had renamed out of reach.

`133,621 awards (43.4%)` remain structurally unplaceable and no attempt was made
on them. Every recovered award lands on a leaf keyed by the
`(granting_authority, call_id)` pair the publisher published.

## 4. What was deliberately NOT done: the graded ranking artifacts

`emit_peer_prior.py --write` was run, **measured, and reverted.**
`check_peer_prior_canary.ts` went red on `tune:exact_attribution`: regime@5
98.3% → 85.9% against a floor of 95. `--notified-scheme-too` recovers
`tune:original join` (79.7% ≥ 78) and does not recover that one (85.9%).

The prior got *better* at containing the answer — in-cell 39.0% → 63.6%,
exact@5 13.3% → 15.7% — and regime@5 fell anyway, because a prior whose top
five are now specific leaves is graded against an answer key that can only name
funds in **7 of 22 countries**. That is the failure `attribution.py`'s own
header records: a corrected join reads as a loss when the ground truth cannot
name the funds it won. Regenerating the prior now would encode that ceiling.

So the corpus and the code land; `peerPrior.generated.json`, `regionPrior`,
`channelPrior` and `instrumentObjectives` stay at their committed versions.
**Workstream BP can now extend the answer key across 671 leaves in 22
countries** — that was the whole blocker — and the prior is regenerated and
re-floored against the extended key, by whoever holds it.

## Reproduce

```
python3 ETL/events/load/test_external_instrument_ownership.py
python3 ETL/terms/test_split_key_is_not_a_name.py
python3 ETL/events/load/test_split_value_space.py
```
