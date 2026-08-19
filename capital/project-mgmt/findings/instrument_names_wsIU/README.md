# wsIU — I was told to lean re-split. The funder's own catalogue says A, and the number is a fifth of the one in the brief

**FOR THE OWNER.** Free. **EUR 0.00, zero model calls, zero Railway, zero
production writes.** `NO_PG` never set. `data/db.sqlite` opened `-readonly`
only. Three corrections, and the first two change what this is worth.

---

## ██ 1. THE DECISION: **A — name the categories.** And it is not a compromise

wsIF put three to you. The brief that sent me leaned **B, re-split onto
`Underkategori`**, on the argument that a category is not a thing anybody
applies to. That argument is right about the category. **It is wrong that the
sub-category fixes it**, and the funder's own words are what settle it.

`ETL/terms/_wsiu_source_check.py`, free, over the funder's cached CC0 file and
the **15 pages we hold from innovasjonnorge.no** — including the funder's own
complete grant catalogue, *"Tilskudd til norske bedrifter"*, published 8 Apr
2026, last updated 22 Jun 2026, which lists every grant Innovasjon Norge takes
applications for:

```
Virkemiddelkategori   2 of 9  values appear anywhere on the funder's own site
Underkategori         5 of 34 values appear anywhere on the funder's own site
```

**Neither column is the funder's product vocabulary.** The catalogue's own
names are `Oppstartstilskudd 1`, `Oppstartstilskudd 2`, `Innovasjonskontrakter`,
`Tilskudd til miljøteknologi`, `Tilskudd til bioøkonomiprosjekter`, `Pilot-T`,
`Bedriftsnettverk`, `Tilskudd til klyngedrift`, `Tilskudd til innovasjonsstøtte
til SMB`, `Grønn plattform`, `EØS-midlene`. `Underkategori` is not that list.

### Applying wsIF's own test, which is the point of having written it

> *Name the FIELD the source publishes that differs between the two leaves, and
> the URL it is published at.*

| | field | published at | verdict |
|---|---|---|---|
| **A** the eight leaves we hold | `Virkemiddelkategori` | the CC0 `Tildelinger.csv`, `data.norge.no` dataset `d5f090ca-…` | **licensed.** One field, one URL, one value per leaf |
| **B** re-split onto the offer | `Underkategori` | same file | **refused, three ways** |

**B fails on the second bullet of the same test** — *"the difference is only in
award history → say so and stop"*:

* **It manufactures rows no founder can apply to, which is the exact recorded
  failure this repo already paid for once.** Seven values, **2,001 awards**,
  name no offer: `Andre innovasjonstilskudd` (**1,505 awards — the single
  largest value in the whole column**), `Andre oppstartstilskudd`, `Andre
  distriktsutviklingstilskudd`, `Andre næringsspesifikke tilskudd`, `Diverse
  NFD` (a ministry's miscellany, 5 awards), `Rådgiving`, and **114 awards where
  the field is EMPTY**. `populate_funding_instruments.py:1006` records what
  happened last time: *"`extract_innovate_uk.py` mapped GtR's `grantCategory`
  here … and manufactured sixteen rows no founder can apply to."* B is that,
  one level down and at four times the scale.
* **Where it separates real things, it separates them by BUDGET LINE, not by
  door.** `Landsdekkende etablerertilskudd` (2,545) and `Distriktsrettet
  etablerertilskudd` (484) are the nationwide and the district budget behind
  **one product pair the funder publishes as `Oppstartstilskudd 1` and
  `Oppstartstilskudd 2`**. Neither Norwegian phrase appears anywhere on the
  funder's site. Same for `Landsdekkende garantier` / `Distriktsrettede
  garantier`, and for `Lavrisikolån fiskeflåte` / `… industri og tjenesteyting`
  / `… landbruk` under one page titled `Lavrisikolån`.
* **It is a corpus restructure whose own detector has not been run**, as wsIF
  said, and it would have to be re-run against ~25 new rows, new embeddings on
  both vector indexes, and `assertAncestorConvention`.

**C — collapse to one row — is the opposite error.** The source separates these
eight by a field it publishes; merging them is the move the property reserves
for *"the source publishes ONE name for both"*, which is Altum, not this. It
would also destroy the separation that is the entire value here.

### So the honest sentence, and it is what A says

**Our eight Norwegian leaves are Innovasjon Norge's own eight-way
classification of its instruments — and after A that is exactly what the row
says it is.** It names no offer because *the row is not an offer*, it is a
category with EUR 1.2B of separable award history under it. That is true,
one line, reversible, and it manufactures nothing.

**The offer-level split is not dead — it is specified.** Six `Underkategori`
values ARE corroborated offers on the funder's own catalogue, covering **2,919
awards**: `Bedriftsnettverk` (397), `Klyngeprogrammet` (305), `Miljøteknologi`
(450), `Bioøkonomiordningen` (541), `Mentortjenesten` (789, the funder's own URL
slug is `mentortjenesten-for-grundere`), `EØS-tilskudd` (437, published as
`EØS-midlene`). A LATER workstream can carve exactly those six out and leave the
other 27 values under their category, which is a partial re-split the property
does license. It is not this one-line write and it must not be bundled with it.

---

## ██ 2. THE NUMBER IN MY BRIEF IS FIVE TIMES TOO BIG, AND IT IS NOT wsIF'S FAULT

My brief said *"12 founders recovering their won fund is **1.3 points** — say it
as 1.3 points"*. **That is the value of repairing all ten same-name classes, not
of repairing Norway.** wsIF's arm B is explicit — *"the same corpus with **every
same-name leaf** given a name of its own"* — and its own menu-row table shows
Norway is 83 of 848 gained rows.

`scripts/_wsiu_ceiling.ts` reproduces wsIF's exact 897-founder population
offline (same `loadRecallSet` → `reattributeMissingAnswers` →
`partitionByOfferable` → `sampleRecall`, no Postgres, no Voyage) and asks the
only question that bounds the outcome: **whose won fund is a row this change
renames?**

```
population drawn                                              897
founders in country NO                                        109
founders whose WON fund is an Innovasjon Norge leaf             13   -> CEILING 1.45 points
founders whose won fund is in the OTHER NINE classes            50
```

**A founder can only recover their own fund from a naming repair if the fund
they won is one of the renamed rows. Thirteen founders qualify. So this change
cannot be worth more than 1.45 points however well it works**, and wsIF's 12 is
drawn from a pool of 63, of which Norway is 13.

Norway's share of the 12 is **between 0 and 13 and nobody has measured it**.
Splitting it needs one arm of `_wsif_reach.ts` scoped to the Norwegian ids,
which costs 897 Voyage embeds and a live Postgres read — outside this
workstream's budget, and one command when it is not.

**What IS measured offline, on the committed `pool_blend_wsIR` trace:** of the
107 gradable Norwegian founders, **32 have their won fund in the published six
today (3.6 points) and 75 do not (8.4 points)**. That is the headroom this sits
inside; 1.45 is the slice of it a rename can reach.

**Say it as: at most 1.45 points, most likely a fraction of it, and the
seat movement is real but is not what you are graded on.**

---

## ██ 3. THE COST — AND THE PRODUCT ALREADY HAS A NAME FOR IT

wsIF: after the rename **59 founders (6.6%) hold two rows of one class in their
six and 12 (1.3%) hold three or more**. That is also a ten-class figure and
Norway's share of it is unmeasured for the same reason.

I rendered it. `brief_after_1100.png` beside this file, the shipped
`InstitutionsTable`, six real Innovasjon Norge rows: the product prints

> **THE NEXT 6 ARE THE SAME KIND OF DOOR**
> legal basis · support · ticket
> *Choose between them on what each one has actually paid, where it operates
> and the conditions it sets itself.*

and collapses the repeated facts to *"As above"*. **The multi-row case is
already the run affordance, not an accident** — it is what `rowNovelty.ts` was
built for. `brief_before_1100.png` is the same table under today's names: six
rows reading `Innovasjon Norge · Grants`, unlinked, indistinguishable. Nobody is
shown that today because `resolveNameCollisions` demotes five of the six, which
is wsIF §2 — but it is what the collapse is protecting the founder from, and it
is why the collapse is choosing their fund for them.

*(Observed and NOT caused by this change: `/brief/preview/withheld`, a dev-only
route, clips its right-hand column at 390px, identically in both arms. Flagged,
not fixed — it is not this workstream's page.)*

---

## ██ 4. THE LINK — a hole this change does not open, and can close

The one thing that could have made the rename a regression is the row's door,
and `instrumentLink` resolves it from `bodyKey(row.instrument) ??
bodyKey(row.administeringBody)`. `scripts/_wsiu_link.ts`, on the snapshot:

```
ARM A  production            six grant leaves  NO LINK      two loan leaves  Institution page
ARM B  name only             six grant leaves  NO LINK      two loan leaves  Institution page
ARM C  name + admin body     ALL EIGHT                      Institution page -> innovasjonnorge.no
```

**The rename costs no link, because the six grant leaves have none today**:
their `administering_body` is NULL, so today a Norwegian founder's row says
"Innovasjon Norge" and is not clickable. **Arm C closes that**, and it is not an
inference — every one of the 14,788 events carries
`ndb_distributor='innovasjon_norge'`. It is offered below as a separate STEP 3
you can take or leave.

**`check_body_named_rows` is red on main today and `run_checks.mjs` says why, in
so many words:**

> *"It is red right now, on four rows, and legitimately: two Bpifrance and two
> Innovasjon Norge instruments are shown to a founder under the name of the body
> that grants them. That is a decision the owner holds, not a bug to paper over
> … **It stays red and OWNED until he answers.**"*

**The decision that check has been waiting for is this decision**, and applying
step 1 takes it from 4 rows to 2 — which is also why the new name must be the
bare category and never `"Innovasjon Norge · Oppstartstilskudd"`. That guard is
the repo's own statement that the body is not the name.

---

## ██ 5. THE RATCHET COMES DOWN 26 → 20 — AND I DID NOT MOVE IT, DELIBERATELY

`scripts/_wsiu_titles.ts`, the committed snapshot through the shipped chain,
the same rows and the same grouping `check_row_titles_distinct.ts` uses:

```
ARM A (production)      26 rows share a full name, 10 classes, 0 merged by the cut
ARM B (category names)  20 rows share a full name,  9 classes, 0 merged by the cut
```

**My brief told me to lower the ratchet to 20 in the same commit. That would
turn `npm run check` red today.** The guard is hermetic — it reads the
*committed snapshot*, which does not move until the write is applied AND
published AND `instrument_terms.json` re-exported. Lowering it first fails a
build on a corpus that has not changed. **The number 20 is recorded in the
guard's own comment, with the reason and the trigger; the constant stays at 26
until the re-export.** No floor, tolerance or ceiling was moved by this
workstream.

---

## ██ 6. THE CODE — the piece wsIF flagged and declined

`ETL/terms/name_applicable_object.py` gains `--from-jsonl`.

`build()` is BDNS-shaped: it needs a `codigoBDNS` to fetch a record with, and a
funder publishing its own name in a CSV column has none. But `write` and
`reconcile` are register-agnostic and are **the only dual-store name writer in
this repo** — the alternative, `populate_funding_instruments.py`, rebuilds the
whole instruments table to change eight names. So the decisions come from a
sourced file and **everything downstream is the same code**: same
`drop_collisions`, same two writes, same read-back out of Postgres.

Four things it REFUSES rather than defaults, each of them a way a name could
arrive unsourced:

| refusal | why |
|---|---|
| a line missing `source_field` or `source_url` | a decision file without provenance is a table of strings, which is what this module exists not to be |
| **`"applied": false` anywhere in the file** | **PREPARED IS NOT AUTHORISED.** The same flag `check_corrections_applied.py` reads, refusing the way `apply_gate_encoding_corrections.py` refuses. **An agent must not remove it** |
| a duplicate id | last-line-wins would make a fund's name depend on file order |
| a `new_name` equal to the row's `administering_body` | `check_body_named_rows`' property, enforced at the write that could reintroduce it |

Plus a per-store precondition check (`check_preconditions`): SQLite always,
Postgres unless `--sqlite-only`, **ALREADY is not DRIFT**, and any drift or
absence refuses the whole file rather than half-applying it across two stores.
`--sqlite-only` is refused with `--write`.

**Verified, all free:**

```
--report --sqlite-only, file as committed   REFUSED, 8 lines "applied": false
--report --sqlite-only, flag lifted         8 names would change; 0 drifted, 0 already, 0 absent
--report, one name set to the body           REFUSED, 1 drifted (check_body_named_rows)
```

`npx tsc --noEmit` clean · `npx vitest run` **941/941** · `check_contracts` ok
(10 contracts, 105 rules) · `check_row_titles_distinct` ok at 26.

---

## ██ 7. THE PRODUCTION COMMAND — **NOT APPLIED**

The evidence file is `project-mgmt/evidence/wsiu_instrument_names_2026-08-19.jsonl`,
8 lines, every one carrying `"applied": false`. **That flag is the
authorisation gate and I did not remove it.** You do, and then:

```bash
cd /Users/asgermollergrimberg/Wincent

# STEP 0 — dry run, reads only, no DATABASE_URL needed.
python3 ETL/terms/name_applicable_object.py --sqlite-only --report \
  --from-jsonl project-mgmt/evidence/wsiu_instrument_names_2026-08-19.jsonl

# STEP 1 — the name, into BOTH stores, with the reconcile the split demands.
python3 ETL/terms/name_applicable_object.py --write \
  --from-jsonl project-mgmt/evidence/wsiu_instrument_names_2026-08-19.jsonl

# STEP 2 — the snapshot the hermetic guards read, then lower the ratchet.
#   `refresh.py`'s own `snapshot` step; nothing else writes instrument_terms.json.
python3 website/build/eligibility_export.py
#   then edit website/frontend/scripts/check_row_titles_distinct.ts:
#   SAME_NAME_ROWS.max  26 -> 20   (the value is already recorded in its comment)
cd website/frontend
npx tsx scripts/check_row_titles_distinct.ts    # must read 20
npx tsx scripts/check_body_named_rows.ts        # 4 failing rows -> 2
```

### Blast radius, STEP 1

| | |
|---|---|
| rows touched | `funding_instruments` where `id LIKE 'innovasjon_norge_%'` — **8 rows, in each of 2 stores** |
| columns touched | `name`, `name_source`, `name_basis`, `updated_at`. **Nothing else.** `capital_type`, every award statistic, `eligibility_text`, both application fields and `administering_body` are untouched |
| rows created / deleted | **zero.** No row enters or leaves the corpus |
| gates | `eligibility_gates` never read or written. wsIE and wsHX are untouched |
| founders reached | ceiling **13 of 897 (1.45 points)** on EXACT@6; menu movement is wider and is not the grade |
| preconditions | all 8 hold `name='Innovasjon Norge'`, `name_source='deterministic'`; verified against SQLite read-only, and the script re-verifies BOTH stores and refuses on any drift |

### What is DELIBERATELY NOT in this command

**wsIF's STEP 1 — the `programme_name` backfill on 14,788 SQLite events — is
not here, and should not be run before the rename.** It exists to let
`populate_funding_instruments.py`'s feed-name pass derive the name, and that
pass rebuilds the entire instruments table: a far wider blast radius than eight
rows, for a name this command writes directly. **The extractor patch is still
worth making** (`_load_to_db` should insert the column it already reads) so a
future reload does not silently drop the fact again — but as a separate change,
with the canonical label per slug, never the raw cell. **The typo trap is
real**: `Distriksutviklingstilskudd` **97** awards beside
`Distriktsutviklingstilskudd` **9,613**, both mapping to `grant_regional`.
Verified, and recorded in `wsiu_source_check.txt`.

### STEP 3, OPTIONAL — the door the six grant leaves have never had

```sql
-- BOTH stores. Every one of the 14,788 events carries ndb_distributor='innovasjon_norge'.
UPDATE funding_instruments SET administering_body = 'Innovasjon Norge',
                               administering_body_share = 1.0
 WHERE id LIKE 'innovasjon_norge_grant_%' AND administering_body IS NULL;
```

6 rows, 2 columns, 2 stores. Buys every Norwegian grant row a clickable
Institution page (`_wsiu_link.ts` arm C). Changes no rendered label (measured:
arm C labels are byte-identical to arm B). **Only valid AFTER step 1** — before
it, the name equals the body and `check_body_named_rows` goes from 4 to 8.

### How to reverse it

```sql
-- BOTH stores
UPDATE funding_instruments
   SET name = 'Innovasjon Norge', name_source = 'deterministic', name_basis = NULL
 WHERE id LIKE 'innovasjon_norge_%';
-- step 3, if taken
UPDATE funding_instruments SET administering_body = NULL, administering_body_share = NULL
 WHERE id LIKE 'innovasjon_norge_grant_%';
```

Re-export the snapshot and `check_row_titles_distinct` goes back to 26. If the
ratchet was lowered to 20, the guard goes **red** — the reversal is detectable,
not silent.

---

## ██ 8. WHICH SIDE OF THE ANSWER-KEY LINE EACH FILE IS ON

| file | side |
|---|---|
| `ETL/terms/_wsiu_source_check.py` | **source evidence.** The funder's own CC0 file and the funder's own pages. Reads no store and no answer key |
| `website/frontend/scripts/_wsiu_titles.ts` | **measurement.** Committed snapshot only |
| `website/frontend/scripts/_wsiu_link.ts` | **measurement.** Committed snapshot only |
| `website/frontend/scripts/_wsiu_fixture.ts` | **rendering.** Builds a preview fixture from the snapshot so the rows can be looked at |
| `website/frontend/scripts/_wsiu_ceiling.ts` | **measurement.** Reads the recall answer key, as `_wsif_reach.ts` does |

`lib/intelligence/__fixtures/report.json` was swapped to capture the two
screenshots and **restored byte-identical** (`git status` clean, verified after
each capture). No product file was touched.

---

## ██ 9. THREE THINGS IN MY BRIEF THAT TURNED OUT TO BE WRONG

1. **"I lean re-split."** The funder's own catalogue refuses it: 28 of 33
   `Underkategori` values appear nowhere on innovasjonnorge.no, seven of them
   are residual buckets covering 2,001 awards, and one is empty. §1.
2. **"12 founders … is 1.3 points — say it as 1.3 points."** That is the
   ten-class figure. This change's hard ceiling is **13 founders, 1.45 points**,
   and its actual value is an unmeasured fraction of 12. §2.
3. **"lower [the ratchet] in the same commit if it does."** Doing that turns
   `npm run check` red, because the guard reads the committed snapshot and the
   snapshot does not move until the write is applied and published. The value
   20 is recorded in the guard; the constant moves at the re-export. §5.
