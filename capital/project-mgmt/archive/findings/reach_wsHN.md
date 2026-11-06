# wsHN — two of the three writes are in, the third cannot be reached from here

**FOR THE OWNER, VERBATIM.** I applied the **63 gate-encoding corrections**
(63 rows in SQLite, 62 in Postgres — Postgres already held the 63rd) and the
**15 successor redirects** (15 rows in each store), on your authorisation, both
proven by reading the rows back out of Postgres afterwards. **Neither moved the
product, and I would rather say so plainly.** The gate corrections move the
brief by +0.4 points at six rows — four founders in 897, p=0.42, wsHD's paired
measurement, which I did not re-run because re-running it now would be an
*unpaired* comparison and therefore worse evidence, not better. The successor
redirects move it by **exactly zero, and that is a proof rather than an
estimate**: the publishable corpus is 778 rows before and after, the nine rows
the redirect revives are the same nine ids, and none of the 897 founders won
one. Both were applied because they are *correct* — the funders' pages
contradict the encodings, and the register names the successors — which is the
reason you gave. **The third write, the 3,362 gates, I did not do and could not
have done**: every channel to the Railway volume in this repository starts by
running `railway up`, which is on my forbidden list, so §13 and §14 of
`AWAITING_APPROVAL.md` are one decision and not two. And one thing to know
before you read a green anywhere: **`check_winner_not_gated` is still red at
251** even with the corrections written, because it reads the committed snapshot
on purpose. Regenerating that snapshot — §0bis, one free command, two minutes —
is what takes it to 14.

---

```
run             2026-08-18, isolated worktree wsHN-reach off main at d1c2a204
stores WRITTEN  local     data/db.sqlite      63 gates, 15 instruments
                postgres  DATABASE_URL        62 gates, 15 instruments
stores NOT written
                railway-volume  unreachable without `railway up` — see §3
                public/data/instrument_terms.json  (the committed snapshot)
cost            zero. No paid model call. ANTHROPIC_API_KEY deleted before
                import in the one script that loads the product's corpus.
                No deploy, no republish, no tolerance moved.
reproduce       python3 ETL/terms/apply_gate_encoding_corrections.py --postgres
                python3 ETL/terms/apply_successor_redirects.py
                  (both DRY RUN without --apply)
                cd website/frontend
                npx tsx scripts/_wshn_successor_reach.ts     # free, ~40s
                npx tsx scripts/_wsgu_counterfactual.ts      # free
                npx tsx scripts/_wshd_pg_drift.ts            # free, read-only
verify          npx tsc --noEmit                    clean
                npx vitest run                      788 passed (58 files)
                check_contracts                     ok, 10 contracts, 103 rules
                check_ws_scripts                    ok
                python3 ETL/lib/test_scheme_title.py ok
                python3 ETL/terms/check_gate_subject.py  PASS, 18/27 and 50/54
                GUARD_NO_PUBLISH=1 check_corpus_census   FAILED — §4
```

---

## 1. The 63 gate corrections

**What was written, to which store.** `value_spec` and `encoding_method`, on the
rows keyed by `(instrument_id, gate_key)` — which is the identity
`reconcile_stores.py` already declares for this table, and the UNIQUE constraint
both stores carry. Nothing else on those rows: the requirement, the quote, the
value, the `intake_field` and the `verification_level` are the funder's own
words and were verified.

```
sqlite:   63 corrections, 63 to write, 0 already applied, 0 drifted
postgres: 63 corrections, 62 to write, 1 already applied, 0 drifted
  ALREADY  chips_ju_kdt_unknown [G1-03]
```

Each store was asked its own drift question, with the same rule, **before either
was written** — so a store that had moved would have stopped the whole pass
rather than leaving the two half-applied in opposite directions. The two stores
do not hold the same gate table (wsHC), so this is not a formality.

**Proof, read back from the stores afterwards:**

```
POSTGRES carries the proposed comparator on 63/63
SQLITE   carries the proposed comparator on 63/63
PG encoding_method on those rows: quarantined 53, wsgu_corrected 9, llm_retriage 1
PG total gates 9,763    SQLITE total gates 9,763
```

The gate count is **unchanged on both** — no row was added and none lost, which
is the thing a bulk `UPDATE` most easily gets wrong. The single `llm_retriage`
is the Chips JU row this pass correctly skipped.

**Both stores on purpose, and this is the durability argument.**
`migrate_to_postgres.py` TRUNCATEs `eligibility_gates` and reloads it from
SQLite. A Postgres-only write would therefore be silently reverted by the next
release publish, and a SQLite-only write reaches no founder at all until one
happens. So the applier grew `--postgres` rather than a second script: a second
copy of the drift rule is how one store quietly gets a laxer test than the
other.

**ALREADY is now distinguished from DRIFT.** A row that already holds the
*proposed* comparator has not moved under the correction — it has arrived where
the correction was taking it. The original applier would have called that drift
and refused all 63 over one row there was nothing left to do to.

### What it moved

**Nothing worth calling a movement, and it was applied anyway.** wsHD measured
these same 62 comparators on the funnel, paired inside one process, twice, 45
minutes apart, founder for founder identical: **35.8% → 36.2% at six rows**,
+4 founders in 897, exact McNemar **p=0.42**, against a ±3.1-point level. The
one row that moves unambiguously is higher up — the gate screen stops deleting
21 founders' won fund and deletes none of anybody else's, 86.3% → 88.6%,
p<0.001 — and most of that is eaten before six rows, because quarantining a
comparator stops it deleting a row for *every* founder and the mean pool grows
79.5 → 83.2.

**I did not re-run `npm run stages`, deliberately.** It is ~2 hours at n=897,
two other workstreams are live, and — the actual reason — the corrections are
now *written*, so a run today could only be compared against wsHD's run of
yesterday. That is exactly the cross-run comparison this instrument is not safe
for: wsGY watched the shipped ordering drift a few founders in a couple of hours
while workstreams republish `instrument_profiles`. wsHD's overlay run **is** the
paired before/after of this write, on the same draw fingerprint
(`13cb71cf3a1d1847`), and re-running unpaired would replace good evidence with
worse.

**REGIME@5 and CHANNEL@5 are not available beside this, and the reason is in the
instrument.** `one_funnel`'s ladder deliberately excludes REGIME@5: it credits a
*sibling* of the won fund, so a founder can be lost at one stage and credited at
a later one, which breaks the nesting the whole ladder rests on. It is a
different question with its own ladder, and quoting a number for it here would
be inventing one.

### The guard, and the two ways to read its number

**`check_winner_not_gated` is still red at 251 after the write.** This is not a
failure of the write and not a surprise:

```ts
delete process.env.DATABASE_URL;          // scripts/check_winner_not_gated.ts
snap = JSON.parse(readFileSync(file));    // public/data/instrument_terms.json
```

It reads the **committed snapshot** on purpose — that is the credential-free
door that lets CI judge this property without GitHub holding a production
credential. Regenerating the snapshot is `python3 website/build/eligibility_export.py`
(§0bis, free, ~2 minutes), and it was outside my authorisation. The guard that
*does* read the store, `check_gate_subject.py`, passes with the corrections in,
at 18/27 and 50/54 against its pinned ceilings.

**The counterfactual re-run after the write confirms the ceiling arithmetic
still holds, unchanged:**

```
  as check_winner_not_gated runs      251 of 6,167 (4.1%)
    ... with the corrections           14 of 6,052 (0.2%)
  the guard's own number:      251 -> 14   (ceiling 207, REACHED)
  what a founder really sees:  290 -> 14
```

The judgeable population falls **6,167 → 6,052 against a floor of 6,000 — 52
pairs of headroom**, exactly as wsGU stated. **There is no room for another pass
of this shape**: 48 of the 63 are quarantines, and a further pass that removes
comparators rather than moving them to a better field spends headroom it does
not have.

**And the guard's 251 is not a product claim.** It counts **7,095 register
pairs**, where one ADEME forestry scheme contributes hundreds. The funnel counts
**897 distinct founders**, of whom **65 won a fund any of these rules touch at
all**. Both numbers are true and they answer different questions. Quoting 251,
or its fall to 14, as something founders experience would be wrong by roughly
an order of magnitude.

---

## 2. The 15 successor redirects

**What was written:** `successor_scheme` and `successor_title` on 15 instruments,
in SQLite and Postgres. **40 → 55 rows carrying a redirect, in both stores**,
which is wsHF's count reproduced exactly. Proven by re-read: 15/15 carry both a
scheme and a title in Postgres, none missing.

**And the code, which is the part that lasts.** `caseLinks` is directional — the
Commission files each edge once, on whichever side it pleases — and
`populate_funding_instruments.py` iterated a case's **own** links. The traversal
is now `live_successor` / `live_successors` in `ETL/lib/scheme_title.py`, beside
the `link_map` that already existed for the naming rule, so both readers of that
field share one symmetric map rather than two copies of a rule. Without this the
15 would come back on the next register refresh.

**It picks among several live candidates where the naming rule refuses**, and the
difference is stated in the code: a NAME asserts what an object *is*, so guessing
between two is a false claim about the object; a REDIRECT asserts only that a
live scheme replaced a dead one, which every candidate satisfies, and withholding
it returns the founder to the dead end. On today's register the distinction is
moot — **no scheme had more than one live candidate** — but the rule has to
answer the case anyway.

**A bound I drew and did not cross.** The applier fills in a row that holds **no**
successor today; it never overwrites one and never clears one. The symmetric map
is a superset of the forward one, so the *set* only grows — but the *choice*
among several could differ, because the old loop took filing order and the new
rule takes sorted SA order, and repointing a live redirect is a different
decision from filling in a blank. The script reports any such row loudly and
leaves it. **Today there are none**: no row already carrying a successor would be
repointed, so the change is purely additive.

### What it moved: zero, and this is a proof rather than a measurement

`_wshn_successor_reach.ts`, run in the same shape before and after the write:

| | before | after |
|---|---:|---:|
| instruments | 1,088 | 1,088 |
| **publishable** | **778** | **778** |
| rows carrying a successor | 40 | 55 |
| ... not shut (nothing to redirect from) | 26 | 31 |
| ... successor already held as an open leaf | 5 | 15 |
| ... **revived into the publishable corpus** | **9** | **9** |
| founders (of 897) who won a revived fund | **0** | **0** |

The nine revived ids are **the same nine**. Every one of the 15 lands in one of
two buckets: five are not `isShut` by the product's own liveness test — the
register's notified duration has lapsed but something recorded on the row
contradicts the programme having ended — so they were already publishable and
nothing changes; and ten name a successor the corpus **already holds as an open
leaf**, in which case dropping the predecessor is right and the founder is shown
the successor itself.

**Why no funnel run is needed to say this.** A redirect can only reach a founder
through `publishabilityFailures` waiving the closure clause, and through
`publishableInstruments`'s `redirect` rewriting the row's identity. Both are
deterministic, both were evaluated before and after, and both are unchanged.
`opennessEvidence`'s `successor_registration` branch requires `!end`, and all 15
carry an end date by construction — the applier only touches rows the register
says have closed. So no row's content and no row's fate changed, and a two-hour
run could not report otherwise.

**What it is worth, then.** The field is now correct on 15 rows and the loader is
now correct for every future refresh. The day one of those successors stops being
held as an open leaf, or one of those five rows becomes shut, the redirect fires
instead of the founder meeting a dead end. That is the whole of it, and it is
less than the item's original write-up implied.

**One correction to wsHF's prose.** The 15 are AT 1, BE 3, DE 4, FI 1, FR 1,
IE 3, IT 1, SE 1 — read from the `country` column. There are no Maltese rows and
no Dutch ones: the two `Besluit` schemes belong to VLAIO, which is Flanders, and
the two read as Malta's are Enterprise Ireland's and IDA Ireland's.

---

## 3. The 3,362 gates: not refused, unreachable

**I was authorised to do this and did not, because there is no way to do it that
is not also a container redeploy.**

`reconcile_stores.py` is the right tool and its union semantics are sound. What
it needs is the volume's `db.sqlite` as a local file. Every route to that file in
this repository is:

```
pull_db.py        wake() -> railway volume files download
pull_db_side.py   wake() -> railway volume files download
push_local.py     ...     -> railway volume files upload
push_db_verified  wake() -> download, prove superset, upload, restore()
```

and `railway_service.wake()` is

```python
subprocess.run(RAILWAY + ["up", "--service", SERVICE_NAME, "--environment",
                          "production", "--ci", ...], check=True)
```

`railway up` uploads the working tree and deploys it. `restore()` is a second
one. A cron-idle container has no SFTP, which is why waking is not optional —
this is a property of Railway's volume access, not a shortcut somebody took.

**So promoting the gates deploys the image**, and deploying the image is the
316-commit jump that is `AWAITING_APPROVAL.md` §14 — the thing I was told is a
real problem and still not mine. §13 and §14 are therefore **one decision**, and
§14 has to be taken first. I have written that into both sections rather than
leaving §13 reading as though it were a free half-hour.

Two smaller facts for whoever takes it: the Railway CLI is not installed on this
machine (`npx --yes @railway/cli` would fetch it), and `make republish` is
blocked for the same reason twice over — its first step is `make pull-db`.

**Nothing about the divergence changed under my writes.** `DIVERGED` reports
`postgres/instruments.gates: derived 9,763, record 6,401 (+3,362)` after them,
the same 3,362 wsHC measured, because the corrections changed 62 rows' contents
and no row's existence.

---

## 4. What the census guard says, and what of it is mine

```
GUARD_NO_PUBLISH=1 npx tsx scripts/check_corpus_census.ts   -> FAILED
  DEGRADED, DRIFTED, DIVERGED, SCHEMA, STALE.   No SHRANK.
```

**That is the same five arms, in the same order, that wsHC recorded on
2026-08-16 before any of this work** — its §4 prints exactly
`DEGRADED, DRIFTED, DIVERGED, SCHEMA, STALE. No SHRANK.` None of the five is
caused by these writes, and the one that would be — `SHRANK`, the arm wsHC built
to notice a store losing something it held — **is silent**, which is the correct
answer: gate counts are 9,763 before and after on both derived stores, and
instrument counts 1,088.

The five decompose as: `DEGRADED` and `STALE` are census #11 and the committed
`synthesis.json` (§0a / §0bis territory); `DRIFTED` and `SCHEMA` are the
316-commit image and its extra migration (§14); `DIVERGED` is §13 above. Every
one of them needs either a redeploy or a republish, and both were outside this
workstream.

---

## 5. What I did not do

- **No deploy.** No `railway up`, no `railway volume files` of any kind, no
  container touched. The Railway CLI was never invoked.
- **No republish.** `public/data/instrument_terms.json` is byte-identical to
  what it was; `make republish` was never run, and neither was
  `eligibility_export.py`.
- **No tolerance, floor or ceiling moved.** `BLOCKED_CEILING` is 207 and
  `MIN_TESTED` is 6,000, both untouched; `check_gate_subject.py`'s 27 and 54
  likewise. `check_winner_not_gated` is left red, which is the honest state.
- **No paid model call.** Nothing in this workstream calls a model. The one
  script that loads the product's corpus deletes `ANTHROPIC_API_KEY` before
  import, so that is a property of the process rather than a claim here.
- **No `npm run stages`.** §1 gives the reason, and it is about evidence quality
  rather than about the two hours.

## 6. Reproduction paths this finding is the anchor for

- `website/frontend/scripts/_wshn_successor_reach.ts` — the before/after in §2.
  Free, deterministic, no model, ~40 seconds.
- `ETL/terms/apply_successor_redirects.py` — dry run by default; prints the 15
  and the repoint report without writing.
- `ETL/terms/apply_gate_encoding_corrections.py --postgres` — dry run by
  default; prints both stores' drift verdicts.
- `ETL/lib/test_scheme_title.py` — the successor rule on cases nobody has seen:
  the edge filed on the other side, a closed link, a link with no end date, a
  `_miss` record, and the deterministic choice among several.
