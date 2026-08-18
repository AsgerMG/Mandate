# wsHV — the two stores disagreed, and the fix would have made it worse

`check_corpus_currency` was red on a real divergence: over 1,088 instruments the
committed snapshot and Postgres held different values for **22 fund names, 22
name sources and 15 countries**, and stated **51 different eligibility rules, 36
of them on funds we offer**. That last number is the one that costs something. A
founder reaches the snapshot only when Postgres is unreachable, and
`accessiblePool` — the largest single filter in the funnel — is built from those
rules, so a degraded request did not merely rank differently: it **admitted and
refused different funds**, and nothing in the response said which corpus had
answered it.

The 51 split cleanly, and the larger half has a direction:

* **12** were rules Postgres held with **no spec at all** where the snapshot
  held one — a fund screening a founder on a co-financing band or a
  use-of-funds list in one corpus, and on nothing in the other.
* **39** were **regional rules whose permitted region list was narrower in the
  snapshot** — in every single one of the 39, a strict subset of Postgres's. A
  founder in those regions was **refused by the fallback corpus and admitted by
  the live one**, on the same fund, for the same company, decided by which
  store happened to answer. 31 were Czech schemes missing **CZ07 Střední
  Morava** and **CZ08 Moravskoslezsko**; 6 were German, missing **DE9
  Niedersachsen** and **DEA Nordrhein-Westfalen** through **DEG Thüringen**;
  2 French, missing **FRG0**.

  Two of the German six say what this cost in one line. `nrw_bank` — the
  development bank **of North Rhine-Westphalia** — carried a snapshot rule that
  **excluded DEA, which is North Rhine-Westphalia**. `nbank` — the development
  bank **of Lower Saxony** — excluded **DE9, which is Lower Saxony**. On the
  fallback corpus, each of those banks refused the founders it exists to serve.

**The stated fix would have destroyed the thing it was meant to publish.** The
22 names are the register titles wsHF wrote for SA.40391, SA.56245 and
SA.49781 — and `apply_scheme_titles_wshf.py` wrote them to **Postgres only**.
`db.sqlite` is not a peer of Postgres: `eligibility_export.py` cuts the snapshot
from it and `migrate_to_postgres.py` **truncates and reloads Postgres from it**.
So `make eligibility`, the fix the guard itself printed, would have re-exported
a snapshot still saying *Finanzamt Aachen-Stadt* and then pushed that name back
over the register title in Postgres. The script now writes both stores, plans
**per store** (a plan computed from Postgres alone reported "0 carry the defect"
while 22 rows in the store the snapshot is cut from still carried it), and reads
back from both to prove they agree.

**What the republish moved.** Measured before and after as full row and rule
lists, not the guard's eight examples (`divergence_before.json`,
`divergence_after.json`): names 22 → 0, name sources 22 → 0, differing rules
51 → 0. `check_corpus_currency` is green and the acceptance in
`data/guard_registry.json` is **deleted**, not held.

**And the 15 that were never going to move.** `country` is NULL on the 15
EU-level rows; `eligibility_export.py` writes `or "EU"` and `corpus.ts` writes
`?? "EU"`, so a founder is answered "EU" on either path. The two stores agree
about the world and differ only about *where* the default is applied — which a
raw cell comparison cannot see, so it reported 15 rows under a fix that could
never clear them. `READ_DEFAULT` states that as a **narrower** comparison rather
than an exemption: the difference is permitted in exactly one shape, the column
holding **NULL** *and* the snapshot holding precisely the reader's default —
tested on the raw cell, because `normaliseValue` folds NULL and `""` together
and the reader's `?? "EU"` does not. "DE" against
"FR" still fails; "EU" against "DE" still fails; and if either language's
default changes without the other, the snapshot stops holding that exact string
and the guard goes red. The tolerance also polices itself — if no row differs
that way any more, the check FAILS asking for it to be deleted, so it cannot
outlive the condition it describes.

**Did the rebuild move the number?** `instrument_profiles.profile_text` is built
from the fund's `name` and the ranker embeds it, so until the profiles were
rebuilt both arms of any before/after were ordered by an index still reading
*Finanzamt Aachen-Stadt*. 1,088 profiles (1.82M characters of `profile_text`)
and 2,292 gate embeddings were re-cut on **voyage-3.5** — on the order of 0.7M
tokens at USD 0.06/1M, so **about USD 0.04**; adding the query embeddings the
base-rate and funnel runs each make, the whole workstream's Voyage spend is
**roughly USD 0.10**. No Anthropic call was made outside the one prodcheck
brief: `make eligibility`'s four model passes were **deliberately skipped**
(see below). The answer, on the
re-measured base rate over the same 821 holdout founders, is **no**: in-pool at
any depth 95.86% → 95.98%, K=6 42.02% → 42.63%, K=40 81.36% → 81.12%. Every
move is a fraction of the ±3.4pt half-width on n=821. That is what wsHF
expected — a fund's name carries little against its stated scope — and it is
published as a zero rather than dropped.

<!-- FUNNEL -->

## `make eligibility` was NOT run whole, and that is a decision you should see

The target's four model passes were measured before running anything, and they
are **not** the no-ops the "incremental" comment implies on today's corpus:

| step | pending work | run? |
| --- | --- | --- |
| `encode_gates.py triage` | 0 untriaged gates | n/a, free |
| `encode_gates.py encode --fresh` | **5,674 gates** the encoder has never seen | **skipped** |
| `encode_scheme_text_gates.py run` | cuts gates from 688 instruments' scheme text | **skipped** |
| `encode_regions.py run` | **788 candidate gates**, 87 with a wrong spec today | **skipped** |
| `build_instrument_profiles.py classify-titles` | Anthropic title classification | **skipped** |

None of them is needed to make the two stores agree — the corpus content was
already in SQLite, and what was broken was that it had never been exported or
published. Everything else in the target ran in order: `emit_vocabulary`,
`emit_regions`, `sync_gates_from_yaml`, `check_gate_subject`,
`apply_gate_role_overrides`, `retract_unpertinent_text --write`,
`audit_encoding_vs_reality --quarantine`, `coverage_gate`,
`eligibility_export`, `emit_theme_index`, `migrate_to_postgres`,
`embed_eligibility run`, `build_instrument_profiles run --rebuild`, and the
base-rate curve.

**So `make eligibility` is not currently a free target**, and its comment
("re-running only embeds what actually changed") is true of the embeddings and
false of the encoders. Anyone told to "just run `make eligibility`" will buy
those four passes. That is worth either a price line in the Makefile or a
`--no-model` mode; it is not something this workstream should decide alone.

## One thing the republish carried that nobody asked it to

`coverage_gate.py` reports the eligibility axis — instruments with **two or more
evaluable filter gates** — rising from **937 to 959**, and `complete on all six`
from 821 to 825. No gate was added (9,763 before and after); this is
`sync_gates_from_yaml.py` putting YAML-authored encodings back into the record
where they had drifted, which is what `make eligibility` is for. It is a gain,
the high-water mark ratcheted **up**, and no floor was moved — but part of it is
other workstreams' work landing in a shared `db.sqlite`, not this one's, and it
is recorded here so nobody reads it as a claim.

## Seen in production

`npm run prodcheck`, one founder — A.M.L. MICROTECHNIQUE LORRAINE, FR — through
`euro-inv-tracker.vercel.app`, 185s end to end, three routes all 200, six
events, 5,380 characters of memo, no truncation, and `memo ids ok — none of 307
founder-facing strings carries one of the 7 ids this deployment served`.

The deployment attests **`source postgres, degraded false, instruments 1088`**,
hydrated **after** this republish. So the Postgres half is **live now**: the
register titles and the 51 corrected rules are in front of founders already. The
snapshot half — the corpus a degraded request falls back to — ships when this
branch merges and Vercel deploys.

One thing worth the owner's eye, visible in that brief and not caused by this
work: three of the five published rows are the **same scheme title**, separated
only by their `· via <body>` qualifier. The qualifier mechanism is doing its job
— the rows are distinguishable — but this is the same shape as the open
SA.40391 item in `AWAITING_APPROVAL.md`, now observed on a second scheme.

## Files

| file | what it is |
| --- | --- |
| `divergence_before.json` | every diverging row and rule before the republish |
| `divergence_after.json` | the same measurement after |
| `ETL/terms/apply_scheme_titles_wshf.py` | now writes both stores, plans per store |
| `website/frontend/scripts/check_corpus_currency.ts` | `READ_DEFAULT` |
