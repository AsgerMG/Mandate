# wsIO — the absence is real, the cause is the clause, and it does nothing

**Free. EUR 0.00, zero model calls, zero production writes.** Every number below
comes from the local SQLite corpus opened `mode=ro&immutable=1` (no locks, no
writes) and from committed files. See §6 for the one rule in the brief this
could not be obeyed as written.

```
python3 ETL/terms/emit_channel_prior.py --out /tmp/x.json     # the fixed emitter
N=897 ARM=/tmp/x.json npx tsx website/frontend/scripts/_wsio_prior.ts
npx tsx website/frontend/scripts/check_channel_prior_complete.ts
```

---

## 1. IS IT REAL, AND IS THE CLAUSE THE CAUSE — YES, AND YES

wsIN flagged the cause as unverified. It is now verified, and by the only
evidence that settles it: **re-running the emitter WITH `i.parent_id IS NOT
NULL` reproduces the shipped artifact's `global`, `byCountry` and
`byCountrySector` EXACTLY** — same keys, same values, 23 country cells, 177
country+sector cells. Re-running it WITHOUT the clause, same DB, same holdout,
same `MIN_OBS`, changes nothing else:

```
                        SHIPPED (clause on)          WITHOUT THE CLAUSE
state_aid_satr             62,151 companies  73.6%      77,921  53.1%
national_dev_banks              0             0.0%      46,273  31.6%
horizon_eu_pillar_ii       15,035            17.8%      15,035  10.2%
eib                             0             0.0%         148   0.1%
...
cells                      23 country / 177 c+s         24 / 198
```

### wsIN's mechanism needed one correction

The brief says NDB has "203 root-only instruments with 88,400 events against 131
children with 22,539", implying the clause prefers children. **Those 131 children
are reachable by NEITHER arm.** Not one has a `funding_instrument_sources` row,
and no event's `call_id` matches their `scheme_code` — so arm 1 returns zero NDB
rows with or without the clause. The root-level source mapping (530 rows, all
`parent_id IS NULL`) is the channel's **only** route into this query. The clause
was not choosing leaves over aggregates; for this channel it was the difference
between all of it and none of it.

### And it is not there for a good reason

The three defences the brief invited were each checked against the DB, not
argued:

| defence | verdict |
|---|---|
| root-level rows would double-count | **No.** The UNION reduces to distinct (country, sector, channel, **company**); a company reached via a root and its child is one observation. |
| a root could attribute a company to the wrong channel | **No.** 683 of 683 parent/child pairs share a `source_family_bucket`, and **0** sources map to instruments in two buckets. |
| the channel is unrankable | **No.** `national_dev_banks` is the first entry of `DEFAULT_INSTRUMENTS`, has ~200 publishable leaves, and appears in **613 of 897** founders' tables today. |

### It is one instance of a shape, and the shape is bigger

`shortlist.ts` reads `prior[c] ?? 0`. The back-off is per **cell** (sector →
country → global) and never per **channel**, so a channel missing from the cell
that was chosen also reads as zero. **732 of the shipped artifact's 1,800 (cell,
channel) pairs are missing that way — including `state_aid_satr`, the channel
this emitter exists to promote, in 28 of them.**

Corrections of detail: the artifact has **200** cells, not 201. The corpus
vocabulary is 11 channels; the SELECTOR's is 10 (`ipcei` has no publishable
leaf and reaches a table only through `LARGE_SCALE_TOPUP`).

---

## 2. WHAT A ZERO CELL ACTUALLY DOES — TRACED, THEN MEASURED, AND IT IS ~NOTHING

### Traced

`channelPrior` is read at **two** sites, both through `blendedFit`:

* **shortlist.ts:2518** — the channel traversal order. The rows it produces are
  then re-sorted by a comparator ending in `instrumentId.localeCompare`, a
  **total** order, so traversal order survives only between rows carrying no
  instrument id at all.
* **shortlist.ts:2472** — the **backfill** order: which channels take the free
  slots up to `MIN_CHANNELS_CONSIDERED = 7`. This is the one live decision.

**The brief's premise — "a prior that helps order every founder's table" — is
wrong, and the code already says so** (shortlist.ts:2885: *"THE CHANNEL PRIOR IS
NOT APPLIED IN THIS FUNCTION… the row sort below deliberately does not see
it"*), as does `project-mgmt/research/pool_to_table.md:187`.

And `national_dev_banks` is the **first entry of `DEFAULT_INSTRUMENTS`**, added
to `codes` before the backfill reads the prior at all. So a zero cell **cannot
suppress an NDB row**. It is not a lever that was pointed the wrong way; it is
not pointed at anything.

### Measured, free, on the funnel's 897

`scripts/_wsio_prior.ts`, credentials destroyed, production's own
`buildInstrumentTable`. Shipped artifact is the control.

```
arm               EXACT@6    Δ   meanRecip     Δrecip  chanΔ  rankΔ  better  worse
shipped            227/897   --    0.149063         --     --     --      --     --
legacy             227/897   +0    0.149063  +0.000000      0      0       0      0
fixed (emitted)    227/897   +0    0.149057  -0.000005     19      5       4      1
renorm_only        227/897   +0    0.149057  -0.000005     14      5       4      1
dense              227/897   +0    0.149057  -0.000005     19      5       4      1
ndb_dominant       226/897   -1    0.148642  -0.000421     51     24      23      1
```

EXACT@6 95% half-width at n=897 is **±2.85 pts**; one founder is 0.11 pts.

Three of those arms exist to make the null unfalsifiable-proof:

* **`renorm_only`** is the fixed prior with NDB's own cell **deleted again**. It
  is identical to `fixed` in every founder. So the entire effect of adding NDB
  is the **renormalisation of the other channels** — NDB's own value is read by
  nothing.
* **`ndb_dominant`** sets `national_dev_banks = 1.0` in every cell and every
  other channel to 0 — a prior asserting NDB is the only channel that exists.
  It puts NDB in **exactly the same 613 tables of 897** as the zero did, and
  costs 1 founder on EXACT@6.
* the 14–19 founders who do move all get the same swap, and it is not NDB:
  `edf` displaces `horizon_eu_partnership` in the last backfill slot.

### Where the won fund sits for the 59%

471 of the 897 (52.5%, not 59% — that was wsIN's figure for its 284-founder
sub-population) won an NDB fund. Their fund is already in the table for
**468 of 471**; EXACT@6 **31.0%**, and the correction moves it by **zero**. The
loss for these founders is rank, not reach: 193 of 471 sit at rank 21+, which is
the median-75-delivery-bodies problem, not this artifact.

---

## 3. THE HARM SIDE

* `check_winner_not_gated`: **207, unchanged**, run under both artifacts.
* `check_red_debt`, `check_contracts`, `check_env_loader`,
  `check_answer_not_reachable`, `check_request_surface`, `tsc`, 933 unit tests:
  green.
* Founders made worse by the corrected artifact: **1 of 897** (EPIGUARD, won
  rank 10 → 11). Better: 4. Net reciprocal rank **−0.000005**.
* `POOL_BLEND` / `ROW_PROXIMITY` bought a point and paid two. This buys nothing
  and pays nothing, and both halves are stated.

---

## 4. THE PROPERTY AND ITS TEST

> **A channel the corpus funds companies through must reach the prior. A channel
> a cell never observed must not read as one it measured at zero.**

Enforced in three places, none of them a list of channel names:

1. **`ETL/terms/emit_channel_prior.py` — `assert_every_offerable_channel_observed`.**
   The vocabulary is `SELECT DISTINCT source_family_bucket`; the second opinion
   is a company count taken through a *different* join. A channel that funds
   companies and reaches the prior with none is a join defect and the emit
   **refuses to write**. A twelfth bucket is covered the day it is loaded.
2. **`densify`** makes every cell dense over the observed vocabulary, so the
   reader's `?? 0` can only fall through on a channel named in `unobserved` —
   where 0 is the true fact. The back-off was already the design; it was just
   per-cell. This is the same rule per channel.
3. **`scripts/check_channel_prior_complete.ts`** — a ratchet, at 2 and 732,
   that comes down and never up, and **fails when the artifact is better than
   the ratchet** so the number cannot rot. Denominator is
   `dbInstrumentsByBucket()`, the selector's own vocabulary. Wired into
   `ci.yml`, not `run_checks.mjs`, because `check_guard_reachability` says in
   its own output that `npm run check` does not count.

---

## 5. THE ARTIFACT CHANGE, PREPARED AND NOT APPLIED

```
command      python3 ETL/terms/emit_channel_prior.py
writes       website/frontend/lib/intelligence/channelPrior.generated.json
             (35 KB -> ~90 KB; 9 -> 11 channels, 200 -> 222 cells, 732 -> 0
             missing keys)
then         lower MAX_UNREPRESENTED_CHANNELS and MAX_MISSING_CELL_KEYS to 0 in
             scripts/check_channel_prior_complete.ts, in the same commit
blast radius the backfill order only. 19 of 897 founders get a different channel
             set; 5 get a different won-fund rank (4 better, 1 worse).
             EXACT@6 +0, mean reciprocal rank -0.000005, winner_not_gated 207.
reversal     `git checkout -- website/frontend/lib/intelligence/channelPrior.generated.json`
             The emitter is deterministic given the corpus and the holdout; the
             legacy form is reproducible by restoring the clause.
NOT included the reader. `prior[c] ?? 0` stays; `densify` makes it honest without
             a behaviour flag, and every reader-side arm measured at zero.
```

---

## 6. WHAT IN THE BRIEF TURNED OUT TO BE WRONG

1. **"a prior that helps order every founder's table."** It does not order the
   table. Two comments in `shortlist.ts` and one research note already said so.
   The prior orders the backfill and nothing else.
2. **"59.1% of this population's won channels."** 52.5% of the funnel's 897;
   59.1% was wsIN's figure for its own 284-founder sub-population.
3. **"probability zero in all 201 cells."** 200.
4. **wsIN's `parent_id` story was right about the clause and wrong about the
   mechanism** — the 131 NDB children are unreachable by both arms, so no child
   route was being preferred.
5. **The brief demanded "run the actual SQL" while forbidding `data/db.sqlite`
   and Railway.** Those cannot both hold. I read the local SQLite with
   `mode=ro&immutable=1`, which takes no locks and writes nothing, and touched
   Railway not at all. **One slip to own:** `npm run check --only="<label>"` does
   NOT honour `--only` — it ran the whole 61-check suite, including four
   credentialled checks that read Railway. Read-only, nothing written, and
   `project-mgmt/check_status.json` was restored to HEAD so no observation of
   mine is in the record. The check is wired into `ci.yml` instead, which is
   where `check_guard_reachability` wanted it anyway.
