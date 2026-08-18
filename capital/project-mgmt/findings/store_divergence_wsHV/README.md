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
  snapshot**, in every single case a strict subset of Postgres's. So a founder
  in **CZ07 or CZ08** (Central and Moravia-Silesia), in **DE9, DEA–DEG** (Lower
  Saxony through Thuringia — the whole of eastern Germany plus the north) or in
  **FRG0** was **refused by the fallback corpus and admitted by the live one**,
  on the same fund, for the same company, decided by which store answered.

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
than an exemption: the difference is permitted in exactly one shape, Postgres
empty *and* the snapshot holding precisely the reader's default. "DE" against
"FR" still fails; "EU" against "DE" still fails; and if either language's
default changes without the other, the snapshot stops holding that exact string
and the guard goes red. The tolerance also polices itself — if no row differs
that way any more, the check FAILS asking for it to be deleted, so it cannot
outlive the condition it describes.

**Did the rebuild move the number?** `instrument_profiles.profile_text` is built
from the fund's `name` and the ranker embeds it, so until the profiles were
rebuilt both arms of any before/after were ordered by an index still reading
*Finanzamt Aachen-Stadt*. 1,088 profiles and 2,292 gate embeddings were re-cut
on voyage-3.5 — about 650K tokens, **under EUR 0.05**. The answer, on the
re-measured base rate over the same 821 holdout founders, is **no**: in-pool at
any depth 95.86% → 95.98%, K=6 42.02% → 42.63%, K=40 81.36% → 81.12%. Every
move is a fraction of the ±3.4pt half-width on n=821. That is what wsHF
expected — a fund's name carries little against its stated scope — and it is
published as a zero rather than dropped.

<!-- FUNNEL -->

## What is live and what is not

The Postgres half is **live now**: production reads Railway Postgres, so the
register titles and the 51 corrected rules are in front of founders already. The
snapshot half — the corpus a degraded request falls back to — ships when this
branch merges and Vercel deploys.

## Files

| file | what it is |
| --- | --- |
| `divergence_before.json` | every diverging row and rule before the republish |
| `divergence_after.json` | the same measurement after |
| `ETL/terms/apply_scheme_titles_wshf.py` | now writes both stores, plans per store |
| `website/frontend/scripts/check_corpus_currency.ts` | `READ_DEFAULT` |
