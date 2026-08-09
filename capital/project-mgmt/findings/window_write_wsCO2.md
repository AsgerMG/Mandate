# The registers were asked twice, and the second ask closed 58 rows rather than 33

**Workstream CO2 · 2026-08-09 · worktree off `main` at `59df3f83`.** The write
workstream CO proposed and the owner approved. Postgres was backed up first
(`ETL/lib/backup_postgres.py`, 12 tables / 18,874 rows, verified by re-read).

---

## What was approved, and what the dry run said instead

The approval was: 3 grain fixes, 33 `closed_on`, 41 dates, population 166 → 77.
The first two survived contact. The 41 did not, and the reason is the finding.

**39 of the 41 "stated open" rows have no date to load.** Their verdict is
`window_open` because the data.gouv.fr TEE **CSV** row has an empty
`date_cloture`, not because the register states a window that is still running.
Reading that emptiness as "the register says this aid is open-ended" —
`declares_open_ended`, which is what the plan required — would have asserted
openness off a silent column. `liveness.ts` already documents that exact column
as thin: **empty for 93 of the 107 dispositifs whose pages state a closing
date.** It is our copy's silence one level up, which is the defect the whole
`source_window_policy` axis exists to remove.

So the authoritative source was asked instead — the per-slug TEE endpoint and
the dispositif page, which `ETL/terms/fetch_ademe_windows.py` already reads and
wsBI already proved. Free, public, no model call.

**21 of those 39 are CLOSED.** `Tremplin pour la transition écologique des PME`
2025-10-16. `Infrastructures de recharge pour les véhicules électriques`
2024-12-31. `Fonds vert - Territoires d'industrie en transition` 2025-12-31.
`Renouvellement Forestier` 2024-05-31 — a row the CSV filed as
`register_states_none`, i.e. as having no window at all.

Had the approved write gone in as written, those 21 would have been marked
**open-ended on our own authority**, on the strength of a blank cell. That is a
worse row than the one being fixed: a `no_deadline_recorded` row is at least
honest about resting on silence, and `declares_open_ended` is a claim.

## Every ADEME row is dated, so nothing here rests on our copy

`ademe_aid` held **0** `scheme_end_date` of 76 at the start of this workstream.
wsBI loaded 65 in August and they are gone: `scheme_end_date` is rebuilt from
the extractors on every load, exactly as wsBI's own closing section warned. This
is why the dates went into `data/reference/source_window_policy.json` as
`closed_on` declarations and not into a hand `UPDATE` — a committed declaration
is re-applied by every run; a row in Postgres is not.

## What was deliberately NOT written

**20 rows whose only evidence is a page SHARED with siblings, asserting a FUTURE
window.** The property, and it names no fund, country or programme:

> a page that must speak for more than one of our rows may CLOSE them and may
> not OPEN them. A programme's window is an upper bound on an edition's — the
> programme being shut shuts every edition under it, and the programme being
> open grants nothing to any of them.

`plan()` in `fetch_ademe_windows.py` allows a shared page to fill a silence,
which was safe when the rows carried dates and is not safe now that the reload
has emptied them all. Among the 20 are the three ORMAT editions, which is the
error wsBI named outright: the shared `ormat` page says `2026-12-31` while each
edition's own record says `2025-06-09`. The same rule resolved the
`vehicules-lourds-electriques` trio the other way — three rows, one page, page
says `2024-10-07`, per-object record says `2024-07-09`, and the per-object
record wins. Both past, so no founder is affected either way, but only one of
the two is a claim the row's own source makes.

**77 rows no register record answers to, and 9 BDNS convocatorias whose record
carries neither date.** Unknown, and left unknown. Absence from a catalogue is
weaker than a stated deadline — the IPCEI reversal's lesson — and `abierto` is
not a substitute: conv 748315 is `abierto=false` with `fin=2027-12-31`, so the
flag contradicts a stated future window and cannot close anything.

**5 rows whose dispositif page states no closing date.** The field could be
absent or empty and the read cannot tell them apart, so they stay unknown too.

## The write, read back OUT of Postgres

```
policy                     publishes_no_window 835   publishes_window 253
publishes_window & no date          169  ->  91          (corpus)
                                    166  ->  89          (publishable)
call_deadline dates written          74  =  58 past + 16 future
national_dev_banks/FR         4 publishes_no_window + 77 publishes_window
rows contradicting their own declaration                  0
```

The four Bpifrance award lists stop asserting a window their file has never
carried; `ademe_aid` and `fr_relance_industrie` are declared at `root_id`, which
is the grain the 2026-08-09 reconstruction could not express and the whole cause
of the defect.

`check_window_evidence.ts`'s ratchet lowered 166 → 89, which is the ratchet
working. It is still proved to fail: `WINDOW_BASELINE=50` → *"the
unverified-window population GREW: 89 > 50"*. **89 is not a number to drive to
zero** — a register that answers with no date keeps no declaration and stays
counted, and this reaching zero would mean we had started inventing answers.

## Winner-not-blocked, and the measurement

`check_winner_not_blocked.ts` before and after: **PASS both, and the blocked set
is byte-identical** — the same standing debt of 15 territorial-screen rows,
none of them Spanish or French, none of them a window row. No verified winner
is lost.

| tune, seed 20260806, N=250 | before | after |
|---|--:|--:|
| EXACT@5 | 26.8% (67/250) | **26.4%** (66/250) |
| ranker | all 247 on EMBEDDING | all 245 on EMBEDDING |
| answer key GRADED | 6779 (95.5%) | 6083 (85.7%) |
| answer key WITHHELD | 316 (4.5%) | 1012 (14.3%) |

One pair, against a ±5.5 interval. **The two are not a paired comparison and
should not be read as one**: closing 58 rows moved 696 answer-key pairs from
GRADED to WITHHELD, so the after column is measured on a smaller population.
The 696 is `58 × 12` exactly — the recall set emits twelve pairs per instrument
— so it is uniform across all 58 and concentrated in none.

Nothing in the pool is withheld *as closed*: all six bucket-1 misses carry a
selection rule (`SEL-CAPITAL` 2, `SEL-CHANNEL-CAP` 2, `SEL-COUNTRY` 1,
`SEL-CHANNEL-NOT-SELECTED` 1). A closed winner is excluded from grading, not
scored as a miss.

`check_recall_floor.ts` **ok, all floors met**, `ranker: all 294 request(s) on
EMBEDDING`. No floor added, removed, raised or lowered.

## Do not re-propose

- **reading an empty `date_cloture` in the TEE CSV as an open-ended aid.** 21 of
  the 39 rows it would have covered are shut according to their own dispositif
  page.
- **letting a shared page assert a future window.** It is wsBI's ORMAT error,
  and the reload that emptied `scheme_end_date` is what re-opened the door to it.
- **closing a row on `abierto=false`.** conv 748315 falsifies it.

## Cost

Zero. Two public open-data registers, one Wayback read, one Voyage embed per
pair on replays that were going to run anyway. No model call was made.
