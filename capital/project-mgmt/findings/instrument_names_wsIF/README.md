# wsIF — the separating fact is published, our own extractor reads it, and the INSERT drops it

**FOR THE OWNER.** Free. **EUR 0.00, zero model calls, zero production writes.**
`NO_PG` never set; every number below is off live Postgres or off the funder's
own file. Four corrections to the brief, and the first two change what the
workstream is.

---

## ██ 1. OFFERABILITY DISSOLVES NOTHING. NOT ONE OF THE 26.

The brief said `project_offerability_residual` records 90 rows that should not
be offered *"including Norway's entire 48"*, and that the Innovasjon Norge
leaves might be among them. **They are not, and the memory's sentence is about a
different funder.**

`project-mgmt/evidence/funder_evidence_2026-08-12.jsonl`, the per-row hand check
that finding was built on, holds 74 Norwegian rows:

```
verdict not_a_fund, action rekey   65   every one of them nfr_*  (Norges Forskningsrad)
verdict unsettled,  action none     8   every one of them innovasjon_norge_*
                                    1   innovation_fund_hbank_2024_maritime
```

The re-booked-ledger finding is the **research council's**. The eight Innovasjon
Norge rows were never in the withdrawal bucket: they came back `unsettled` with
`action: none` for one reason, recorded verbatim on all eight —

> *"innovasjonnorge.no returns a Radware 'Security Check' interstitial to
> automated fetches, so the funder's own page could not be read."*

Cross-checked the other way: of the **26** offerable rows that share a full name
with a sibling, **6 appear in that file at all, and all 6 are `unsettled`**.
Zero carry `action: rekey`. **The repair is renaming, not withholding.**

And two further facts follow, both of which matter:

* **Nothing was withdrawn.** All **74 of 74** Norwegian rows are offerable
  today — the 65 `rekey` rows included. That decision is still open in the
  owner's queue, seven days on. If it is ever taken, Norway's whole offering
  becomes the 8 Innovasjon Norge rows plus one Innovation Fund row, and this
  naming defect stops being 8 rows in a market and becomes **the market**.
* **The 403 has already been beaten, by another route.** We hold **15 fetched
  pages from innovasjonnorge.no** in `data/raw/instrument_docs/`, one to three
  per leaf, wired per-instrument in `ETL/terms/extract_terms_bulk.py:190-204`.
  The "source unreachable" verdict of 2026-08-12 is stale.

---

## ██ 2. THE FOUNDER IS NOT SHOWN A PAIR. ONE OF THE TWO IS ALREADY GONE.

This is the correction that changes what the defect *is*. wsID's *"50% of
founders see a pair the corpus itself calls the same thing"* is measured on the
**served table**, and the table is not the page.

`scripts/_wsif_reach.ts`, production's own build, pool and candidate order,
**all 897 held-out founders**:

```
TABLE  founders whose served table holds an unnamed pair    48.2%   (432/897)
MENU   founders shown an unnamed pair in the 40-row menu     0.0%   (0/897)
SIX    founders shown an unnamed pair in the published six   0.0%   (0/897)
```

48.2% independently reproduces wsID's 50% within two points, on the full
population and by a different method. **And the next two lines are zero.**

`resolveNameCollisions` has already demoted every duplicate
to the back of the table, behind every visible row, and the 40-row slice never
reaches it. A Norwegian founder's table carries **all six** Innovasjon Norge
grant leaves; **exactly one** survives into the menu.

So the defect is not *"the founder reads one name twice"*. It is:

> **A tiebreak on gate-encoding richness is silently choosing which Innovasjon
> Norge programme a Norwegian founder is offered, and hiding the other five.**

The five hidden include the two largest funds in Norway on our own numbers —
`innovasjon_norge_grant_innovation` (4,045 awards, EUR 687M) and
`grant_startup` (3,145 awards, 2,536 companies). Neither is in the writer's
pool for anyone. `preferBetterEvidencedRow` is correct code doing exactly what
it says; it is being handed a question it was never meant to answer, because
the corpus gave it nothing else to prefer on.

---

## ██ 3. THE SIZE, BY REGIME — AND IT IS FIVE PROBLEMS, NOT ONE

`scripts/_wsif_size.ts`, live Postgres, 1,088 corpus rows / 760 offerable.
**26 offerable rows in 10 same-name classes** — the guard's ratchet, confirmed
independently. Whole corpus: 47 rows in 20 classes, so **17 are already
withheld** (9 below the data floor, 6 shut, 3 frameworks, 2 parents).

| class | rows | what the SOURCE publishes per leaf | kind of repair |
|---|---:|---|---|
| **NO Innovasjon Norge** grants | **6** | `Virkemiddelkategori` — the funder's own column, on the funder's own CC0 file | **source-side, one line** |
| **FR SATR ministries** (SA.111723 ×3 + ×2, SA.111726 ×2) | **7** | one registered title, and the granting **ministry** | **not a name — the split is ours** |
| **ES IGAPE** convocatorias ×2 pairs | **4** | the BDNS `codigo` and the `reglamento` | re-run `name_applicable_object --verify-source` |
| **FR Bpifrance** | **3** | i-Nov / Innov'up Leader PIA / PM'up, on three different official pages | curated file, gap |
| **IT SA.110595** | **2** | one registered title, MUR vs the PNRR coordination office | **not a name — the split is ours** |
| **LV Altum** `aue`/`aui` | **2** | **the feed gives BOTH the identical name** | **duplicate identity, not a name** |
| **ES CDTI** `idi`/`neotec` | **2** | `cdti.es/ayudas/proyectos-de-i-d` vs `/ayudas-neotec-2026` | curated file, gap |

Concentration: **10 of 26 rows** (Innovasjon Norge + Altum + CDTI + Bpifrance's
two Bpifrance-bodied rows) are one shape — *a row named after its funder because
nothing gave it a name of its own*. **9 of 26** are the opposite shape — *a row
named after its regime because our own per-granting-authority split gave it a
sibling*. Those are different owners' problems and only the first is a naming
repair.

---

## ██ 4. WHERE THE FACT DIES, FOR THE LARGEST CLASS

`ETL/events/extract/extract_innovasjon_norge.py` reads Innovasjon Norge's
open-data `Tildelinger.csv` (CC0, `data.norge.no`, dataset
`d5f090ca-4e43-3303-a5e6-54247ea69d72`). Line 148 puts the funder's own category
on the row:

```python
"category": category,       # verbatim Virkemiddelkategori
"subcategory": sub,         # verbatim Underkategori
```

`_load_to_db`, forty lines later, inserts **twelve columns and neither of
those two**. `programme_name` is not in the INSERT list.

```
public_funding_events with programme_name, by prefix (local SQLite)
  innovasjon_norge_    14,788 events    0 named
  bpifrance_            1,003 events    0 named
  cdti_                 2,315 events    0 named
  altum_a                 627 events  627 named   <- and BOTH carry the SAME name
  bdns_                15,055 events 14,148 named
```

So the pass that would have fixed this **for free** cannot fire.
`populate_funding_instruments.py:1503-1531` already names an instrument from
the programme name its own events carry, at a 0.8 dominance floor — *"71
families gain a real name and NOT ONE unambiguous family changes"*. Innovasjon
Norge's vote would be **1.0 on every one of the six**. Nothing is missing but
the column.

**This is the same finding as wsID's, one layer earlier.** wsID: a separating
fact our own code computed and our own renderer threw away. wsIF: a separating
fact the funder publishes and our own extractor throws away.

---

## ██ 5. THE OFFICIAL GROUND, AND THE CHOICE IT FORCES

The funder publishes **two** levels in that file, both verbatim, and they are
not the same kind of thing:

```
Virkemiddelkategori                  Underkategori                        awards
Oppstartstilskudd                    Landsdekkende etablerertilskudd        8056
Oppstartstilskudd                    Distriktsrettet etablerertilskudd      2730
Oppstartstilskudd                    Pre-saakornfond                          76
Innovasjonstilskudd                  Miljoteknologi                         1756
Innovasjonstilskudd                  Mentortjenesten                        2322
Klynger og nettverk                  Klyngeprogrammet                       1311
Klynger og nettverk                  Bedriftsnettverk                       1034
Lavrisikolaan                        Lavrisikolaan fiskeflaate              1601
```

Our six leaves are split on the **first** column. The **second** is the offer,
and the funder's own service pages corroborate it name for name — the 15 pages
we hold are titled `Bedriftsnettverk`, `Klynger`, `Tilskudd til miljoteknologi`,
`Oppstartstilskudd 1`, `Oppstartstilskudd 2`, `Regionale distriktsmidler`,
`EOS-midlene / EEA Grants`, `Lavrisikolaan`, `Gront risikolaan`.

**So the honest statement is that our six Norwegian leaves are CATEGORIES, not
funds**, and `populate_funding_instruments.py:1006` predicted exactly this
failure in its own words, about a different country:

> *`extract_innovate_uk.py` mapped GtR's `grantCategory` here, and grantCategory
> classifies awards … The split did exactly what it is written to do and
> manufactured sixteen rows no founder can apply to.*

The difference is that **here the split has already happened** — the six rows
exist — so naming them manufactures nothing. It only decides whether the founder
is told the truth about what they are.

### The decision, and it is the owner's

| | what a founder reads | rows | risk |
|---|---|---:|---|
| **A. name on `Virkemiddelkategori`** | *Innovasjon Norge · Oppstartstilskudd* | 6 → 6 | names a **category**, not an offer. True, cheap, reversible |
| **B. re-split on `Underkategori`** | *Landsdekkende etablerertilskudd* | 6 → ~25 | names the real offer; a corpus restructure, and `measure_sibling_by_country.ts` must be re-run before it ships |
| **C. collapse to one row** | *Innovasjon Norge* | 6 → 1 | honest, and throws away EUR 1.2B of separable award history |

**A is what the prepared command below does**, because it is the only one of
the three that is one line, and because B's own detector has not been run.

**One trap in A, and it would have shipped silently.** The source carries a
typo — `Distriksutviklingstilskudd` (97 awards) beside
`Distriktsutviklingstilskudd` (9,613). Both map to `grant_regional`. Writing the
**raw cell** would give that one source two distinct `programme_name` values,
which trips `programme_split` at `populate_funding_instruments.py:1038`
(`COUNT(DISTINCT programme_name) > 1`) and manufactures a child row named after
a typo. The write must use the **canonical label per slug**, which is
`CATEGORY_MAP`'s own key — the funder's spelling, de-duplicated.

---

## ██ 6. THE PROPERTY, AND ITS TEST FOR A CASE NOBODY HAS SEEN

> **A LEAF A FOUNDER MAY BE OFFERED CARRIES THE NAME ITS OWN SOURCE GIVES IT,
> AND NO TWO LEAVES ONE FOUNDER MAY BE OFFERED CARRY THE SAME NAME.**
>
> And the second half, which is the one that stops this becoming a table of
> Norwegian strings: **if the source publishes ONE name for both leaves, they
> are one fund and the split is ours. Merge it. Do not invent a distinguisher.**

**The test, for a pair nobody has seen.** Name the FIELD the source publishes
that differs between the two leaves, and the URL it is published at.

* You can name it → the leaf's name comes **from that field**. (Innovasjon
  Norge: `Virkemiddelkategori`. CDTI: the `ayudas/` page. Bpifrance: the
  `appel-a-projets` page.)
* You cannot, and the difference is only in **award history** → say so and
  stop. Award history is evidence, never a verdict; this is the confusion that
  wrongly unpublished IPCEI.
* The source names **both the same** → they are one fund. (Altum `aue`/`aui`:
  the feed gives both the identical 141-character name on all 90 awards. That
  is not a naming defect and no name will fix it.)
* The difference is a **body we refuse to print** → the split is ours, not the
  register's. (The 9 SATR rows. `nameableBody` refuses a ministry because a
  department notifies a regime and does not take applications, and it is right.)

**No register of known collisions, and there cannot be one** — the next one is
whatever a funder publishes next month. `check_row_titles_distinct.ts` already
enforces the property by rendering every offerable row through the shipped chain
and counting; the ratchet is **26** and **it comes down as classes are repaired,
never up**. This workstream moves no floor, tolerance or ceiling.

---

## ██ 7. THE PRODUCTION COMMAND — NOT APPLIED

Two steps, because the events store and the instruments table are two writes
and the first is worthless without the second.

```bash
cd /Users/asgermollergrimberg/Wincent

# STEP 1 — the column the extractor already reads and does not write.
#   The patch: add `programme_name` to the INSERT in
#   ETL/events/extract/extract_innovasjon_norge.py::_load_to_db, valued from
#   the CANONICAL label for the row's slug (never the raw cell -- see the typo
#   trap in section 5). Existing rows are skipped as duplicates, so the 14,788
#   already loaded need the backfill below.
sqlite3 data/db.sqlite <<'SQL'
UPDATE public_funding_events SET programme_name='Oppstartstilskudd'
  WHERE source LIKE 'innovasjon_norge_grant_startup_%';
UPDATE public_funding_events SET programme_name='Innovasjonstilskudd'
  WHERE source LIKE 'innovasjon_norge_grant_innovation_%';
UPDATE public_funding_events SET programme_name='Distriktsutviklingstilskudd'
  WHERE source LIKE 'innovasjon_norge_grant_regional_%';
UPDATE public_funding_events SET programme_name='Klynger og nettverk'
  WHERE source LIKE 'innovasjon_norge_grant_cluster_%';
UPDATE public_funding_events SET programme_name='Internasjonale tilskuddsprogrammer'
  WHERE source LIKE 'innovasjon_norge_grant_international_%';
UPDATE public_funding_events SET programme_name='Naeringsspesifikke utviklingstiltak'
  WHERE source LIKE 'innovasjon_norge_grant_sector_%';
UPDATE public_funding_events SET programme_name='Lavrisikolaan'
  WHERE source LIKE 'innovasjon_norge_loan_lowrisk_%';
UPDATE public_funding_events SET programme_name='Risikolaan og garantier'
  WHERE source LIKE 'innovasjon_norge_loan_risk_%';
SQL

# STEP 2 — the name, into BOTH stores, with the reconcile the split demands.
#   populate_funding_instruments.py's own feed-name pass then names all eight
#   at dominance 1.0, name_source='programme_feed'. It rebuilds the whole
#   instruments table, which is a far wider blast radius than eight rows, so
#   the narrow alternative is the dual-store writer that already exists --
#   ETL/terms/name_applicable_object.py::write/reconcile -- driven from a
#   sourced JSONL of the eight ids. THAT SCRIPT IS NOT YET GENERALISED; the
#   generalisation is the one piece of code this command still needs.
```

*(The ASCII spellings above are this file's, not the command's: the real values
are `Næringsspesifikke utviklingstiltak`, `Lavrisikolån`, `Risikolån og
garantier`, `Internasjonale tilskuddsprogrammer`, taken byte-for-byte from
`CATEGORY_MAP` in the extractor, which took them from the funder's CSV.)*

### Blast radius

| | |
|---|---|
| rows touched, step 1 | `public_funding_events` where `source LIKE 'innovasjon_norge_%'` — **14,788 in SQLite**. Postgres holds no events table, so nothing published changes at this step |
| columns touched, step 1 | `programme_name` only, currently **NULL on all 14,788**. Nothing else |
| rows touched, step 2 | `funding_instruments` — **8 rows, in each of 2 stores** |
| columns touched, step 2 | `name`, `name_source`, `name_basis`, `updated_at`. **Nothing else** — `capital_type`, every award statistic, `eligibility_text` and both application fields are untouched |
| rows created | **zero**. `programme_name` is constant per source after the canonical mapping, so `programme_split` (`COUNT(DISTINCT programme_name) > 1`) does not fire. This is the assertion to re-check before applying |
| founders reached | **387 of 897 (43.1%)** gain a row in the forty-row menu, **155 (17.3%)** in the published six, and for **12 (1.3%)** the recovered row is the fund they won. Measured free on all 897, §8 |
| what does NOT change | no row enters or leaves the corpus; no gate is touched (`eligibility_gates` untouched — wsIE and wsHX are in there and this stays out); no floor, tolerance or ceiling moves |

### Preconditions, verified read-only against live Postgres

* All 8 rows carry `name = 'Innovasjon Norge'`, `name_source = 'deterministic'`,
  `administering_body IS NULL` on the six grant leaves.
* All 14,788 events carry `programme_name IS NULL`.
* `check_row_titles_distinct` is green at **26** on the committed snapshot
  (724 offerable rows, 22 markets, 0 groups merged by the cut).

### How to reverse it

```sql
-- step 2, in BOTH stores
UPDATE funding_instruments
   SET name = 'Innovasjon Norge', name_source = 'deterministic', name_basis = NULL
 WHERE id LIKE 'innovasjon_norge_%';
-- step 1, SQLite only
UPDATE public_funding_events SET programme_name = NULL
 WHERE source LIKE 'innovasjon_norge_%';
```

Then re-run `npx tsx scripts/check_row_titles_distinct.ts`, which goes back to
**26** — the reversal is detectable, not silent. If the ratchet has been lowered
to 20 by then, the guard goes **red**, which is the point.

---

## ██ 8. THE REACH, FREE, ON THE 897 — AND IT IS MENU-DEEP UNTIL IT IS NOT

`scripts/_wsif_reach.ts`. Two arms on one draw: production, and the same corpus
with every same-name leaf given a name of its own, mutated **in memory** and
never written. Numbers in `wsif_reach_897.txt` beside this file.

```
TABLE     founders whose served table holds an unnamed pair       432 (48.2%)
MENU      founders shown an unnamed pair in the 40-row menu         0 (0.0%)
SIX       founders shown an unnamed pair in the published six       0 (0.0%)

GAINED    founders whose menu gains a row the collapse demoted     387 (43.1%)   rows 848
          ...and it is the fund they WON                            28 (3.1%)
          founders whose SIX gains such a row                      155 (17.3%)   rows 211
          ...and it is the fund they WON                            12 (1.3%)
COST      arm B founders whose six holds >=2 rows of ONE class      59 (6.6%)
          ...>=3 rows of one class                                  12 (1.3%)
CHECK     arm B founders still holding an unseparable pair           0
```

**It moves the published six for 155 founders in 897 and wins twelve of them
their fund.** Set beside wsID, which moved the six for 8 in 300 and won nobody:
this is roughly six times the seat movement and it is **the first naming change
in this repo that is not zero on the outcome**. Twelve founders is twelve
founders, and it is 1.3%.

Where the menu rows are, in arm A — and this is the shape of the work:

```
  83  NO  innovasjon norge - grants
  63  IT  avviso pubblico ... campioni nazionali (SA.110595)
  47  LV  aizdevumi siko (mikro), mazo un videjo ... (Altum)
  46  FR  regime cadre exempte ... RDI 2024-2026 (SA.111723 rnd)
  42  ES  cdti (spain)
  29  FR  regime cadre exempte ... RDI 2024-2026 (SA.111723 equity)
  16  FR  regime cadre exempte ... environnement (SA.111726)
   9  ES  financiacion igape-pymes 2026
   5  FR  bpifrance
```

**Norway is the largest single class and the SATR ministries are the largest
group** (154 rows across four French and Italian classes). The two need
different repairs and only the first is a rename, which is §3's point in
numbers.

**Two honest caveats, and the second is a cost.**

* **The model is not in this.** Both arms are model-free. Whether a selector
  reads *Oppstartstilskudd* differently from *Innovasjon Norge* is not
  measurable without a paid run.
* **Six names for six leaves of one funder lets that funder take seats the
  collapse was accidentally rationing.** After the rename **59 founders (6.6%)**
  have two rows of one class in their published six and **12 (1.3%)** have three
  or more. One Norwegian founder's six goes from one Innovasjon Norge row to
  four. That is a real regression in menu breadth, it is reported rather than
  assumed away, and it is the strongest argument for option B in §5: naming the
  actual OFFER rather than the category would put four different Innovasjon
  Norge products on that page instead of four rows of one category.

---

## ██ 9. WHICH SIDE OF THE ANSWER-KEY LINE EACH FILE IS ON

| file | side |
|---|---|
| `scripts/_wsif_size.ts` | **measurement**. Corpus only, reads no answer key |
| `scripts/_wsif_facts.ts`, `_wsif_sources.ts`, `_wsif_tables.ts` | **measurement**. Read-only schema and column probes |
| `scripts/_wsif_reach.ts` | **measurement**. Reads the recall answer key, as `_wsid_reach.ts` does |

`check_answer_not_reachable` **green** — 63 modules reachable from the request
path, none names an answer-bearing source. No product file was touched, so no
new column reaches a row. `npx tsc --noEmit` clean, `npx vitest run` 914/914,
`check_contracts` ok (10 contracts, 105 rules).

**Collision:** `eligibility_gates` was never read or written. wsIE
(`encode_gates.py`) and wsHX (`reconcile_stores.py`) are untouched by anything
here.

---

## ██ 10. TWO INSTRUMENT BUGS I FOUND IN MY OWN HARNESS, BOTH OF WHICH READ 0.0%

Recorded because `project_instruments_were_lying` says a ZERO is the most
dangerous reading, and both of these were zeros.

1. **The arms were keyed on `t.id ?? t.company`, and `RecallRow` has no
   `company`.** All 897 founders folded onto one map slot, so every table in the
   run was the LAST founder's — 24 EU-level rows, byte-identical for a Norwegian
   and an Estonian — and the summary printed a clean `0.0%` on every line. It is
   keyed by position now and the run throws if the two arms differ in length.
2. **`ANSWERS` defaulted to `"off"`**, copied from wsID's harness. That is a
   founder who answered nothing, and it halves the table.

The first one is the reason §2's zero is trustworthy: it is the same code, after
the bug, still reporting zero on the menu while reporting 40% on the table.
