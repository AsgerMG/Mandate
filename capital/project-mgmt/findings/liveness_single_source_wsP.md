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

## Status

- [x] cause established and measured
- [x] proposed test falsified before adoption
- [ ] single liveness test + basis column
- [ ] recovery verified on three seeds
