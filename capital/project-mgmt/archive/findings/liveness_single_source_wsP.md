# One column, two meanings: why 306 live funds went dark

Workstream P. All figures read from Railway Postgres between **2026-08-06 20:54Z
and 20:58Z**, single sitting, while coverage agents were writing FR/ES/SE/EU.

## The defect

`funding_instruments.scheme_end_date` is consumed by `publishableInstruments()`
as "this scheme has closed to new applicants". At the read above, **306 of 948
leaves carry a past end date** and are therefore unofferable. Pool recall fell
~97% -> ~81%; `check_recall_floor` RED at 79% against a floor of 90.

Among them: `Fondo di garanzia per le PMI` (SA.57625), Italy's flagship SME
guarantee fund, 13,892 awards, hidden.

## The root cause is NOT "a stale date"

**`scheme_end_date` carries two different kinds of date under one name, and
which kind it is is discarded at write time.**

| basis | written by | what the date means | past ⇒ closed? |
|---|---|---|---|
| notified aid-measure duration | `populate_funding_instruments.py`, from SATR `caseMeasureEndDate` keyed on `scheme_code` | expiry of the **State-aid notification** for a standing scheme | **no** — renewal is routine |
| call application deadline | `fetch_tee_catalogue.py` (`date_cloture`), Spain's convocatoria pass | the date **this instrument** stopped taking applications | **yes** |

The two are cleanly separated in the data, and `scheme_code` is the tell,
because a SATR end date can only exist where a SATR match exists:

```
satr leaves with an end date : 448  — 448 have a scheme_code, 420 (94%) end on 12-30 or 06-29
bdns leaves with an end date :  82  —   0 have a scheme_code (all '')
ademe leaves with end date   :   6  —   0 have a scheme_code
```

`12-30` / `06-29` are the statutory GBER/notification boundary days. 216 of 306
past-end leaves land on exactly those two calendar days. A real closure date is
distributed across the year; a **notified duration** is not. That is the
signature, and it is a testable property, not a list.

## The test proposed to me does NOT work, and would have destroyed Spain's fix

I was asked to separate the populations with "awarded money after its end date",
on the reasoning that a dead call stops paying and a renewed scheme keeps
paying. **Measured, that test does not separate them:**

```
Spain's 80 genuinely-dead convocatorias : 50 of 80 award AFTER their end date
ADEME's 6 correctly-closed calls        :  3 of  6 award AFTER their end date
SATR past-end leaves                    : 119 of 220 award after
```

Applying it corpus-wide would have **resurrected 50 of the 80 rows Spain's
agent had just correctly closed** — the precise outcome it was written to
prevent.

The reason is that an award date is a **granting/decision** date, not an
application date. A convocatoria closes for applications and then publishes its
grant decisions months later; `Ayudas para realizar proyectos de I+D.
Convocatoria 2025` closes 2025-04-14 and awards in 2026. That is a closed call
paying out, and it is the normal life-cycle of every call in the corpus.

## The rule that does work, and why

The same observation carries opposite information in the two populations, for a
legal reason:

- **Under a notified/block-exempted measure, aid may not lawfully be granted
  after the notified duration expires unless the measure was prolonged.** So an
  aid award dated after a `notified_duration` is positive evidence that the
  notification was renewed and our snapshot is stale.
- **Under a call, awards after the deadline are the decision tail** and carry no
  information about whether the call reopened.

Hence the single liveness test:

> An instrument is offerable unless it is a framework, has children, or fails
> the data floor; and its declared end date closes it only according to what
> that date IS.
> - `call_deadline` in the past ⇒ **closed**. No observation reopens it.
> - `notified_duration` in the past ⇒ closed **only if no aid was granted after
>   it**. Aid granted after expiry ⇒ the measure was renewed ⇒ **live**.
> - the existing successor redirect is unchanged.

Year granularity is all Postgres holds (`last_year`), and it is the conservative
direction: for a `12-30` expiry a same-year award is almost certainly before it,
so same-year rows stay closed.

## What was decided about `scheme_end_date`

It is **not** deleted and **not** ignored. It is given the type it always had in
reality. The column keeps every value it holds; a sibling column records which
register supplied it, populated at each write site, and one function reads both.

## What changed, measured

Postgres, 2026-08-06 21:06Z, leaves only (not a framework, no children):

```
closed under the old rule : 306
closed under the new rule : 187
reopened                  : 119        newly closed: 0
publishable               : 633 -> 752
```

Reopened by country: IT 35 (20,186 awards), DE 31, FR 11, NL 9, AT/PT/IE/BE 5
each, LU 4, CZ/GR 2, SK/FI/GB/HU/LV 1. Biggest: `Fondo di garanzia per le PMI`
(SA.57625, 13,892), `Zentrales Innovationsprogramm Mittelstand` (SA.63988,
2,143), `Crisis Rural Guarantee Programme by AVHGA` (SA.57198, 1,977),
`Décret wallon sur l'innovation` (SA.52328, 858).

**Both control populations are untouched, as required:**

```
Spain's bdns leaves : 80 closed before, 80 closed after
ADEME's 6 calls     :  6 closed before,  6 closed after
```

## The red `check_recall_floor` is NOT this defect, and this fix will not clear it

I was asked to confirm rather than assume that the failing floor was downstream
of the closures. It is not.

**1. The recall set cannot see this fix.** Of 4,796 pairs, the number whose
answer instrument is one of the 119 reopened is **zero**. Pool recall was never
going to move, and did not:

```
holdout, same corpus, back to back    old rule   new rule
  SEED=20260806  pool                    77%        77%
```

**2. The floor is capped below its own threshold by the answer key.** Replaying
`check_recall_floor`'s exact 150-pair stride sample: **31 pairs (21%) name an
answer that is correctly unpublishable** — 28 Spain, 3 France (the ADEME calls).

```
pool recall CANNOT exceed 79% on that sample. The floor is 90%. Measured: 75%.
```

So the gate is failing because ~21% of its answers are calls that have since
closed — Spain's convocatoria fix and France's ADEME fix, both correct. The
floor is right and the corpus is right; the **answer key** is stale. The remedy
is to repair the recall set (re-derive or exclude the pairs whose answer is a
closed call), which is owned elsewhere and deliberately untouched here. **Do not
lower the floor.**

**3. A caution on any pool number taken tonight.** The same tree, the same
liveness rule and the same seed read pool 97% at 21:09-21:15Z and 77% at
21:16-21:22Z. `funding_instruments` was identical across both (1,014 rows, 536
end dates, 306 past), so the movement is in the retrieval index, which another
workstream is rebuilding. Three seeds on the current corpus, holdout, n=250:

```
SEED=20260806  pool 77%  EXACT@5 22%  REGIME@5 85%
SEED=7         pool 74%  EXACT@5 23%  REGIME@5 89%
SEED=99        pool 76%  EXACT@5 21%  REGIME@5 83%
```

EXACT@5 and REGIME@5 are unchanged by this fix within noise (old rule at the
same seed: 22% / 85%).

## Status

- [x] cause established and measured
- [x] proposed test falsified before adoption
- [x] single liveness test, one projection, CI guard against a sixth copy
- [x] basis column added, backfilled exactly from the case register
- [x] 119 leaves reopened, Spain and ADEME provably unaffected
- [x] three seeds run; the floor's redness traced to the answer key, not to this
